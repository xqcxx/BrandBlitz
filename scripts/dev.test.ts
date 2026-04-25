import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { SERVICE_DEFINITIONS, createPrefix, routeOutput, runDevRunner } from "./dev";

type ExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;

class MockChildProcess extends EventEmitter {
  killed = false;
  stdout = new PassThrough();
  stderr = new PassThrough();
  readonly kill = vi.fn((signal?: NodeJS.Signals | number) => {
    this.killed = true;
    return true;
  });

  override once(event: "exit", listener: ExitListener): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }
}

class MockProcess extends EventEmitter {
  env = { ...process.env };
  stdout = { write: vi.fn<(message: string) => boolean>(() => true) };
  stderr = { write: vi.fn<(message: string) => boolean>(() => true) };
  exit = vi.fn<(code?: string | number | null | undefined) => never>();
}

const spawnMock = vi.mocked(spawn);

function createRunnerHarness() {
  const mockProcess = new MockProcess();
  const children: MockChildProcess[] = [];

  spawnMock.mockImplementation(() => {
    const child = new MockChildProcess();
    children.push(child);
    return child as never;
  });

  runDevRunner(mockProcess as unknown as NodeJS.Process);

  return { children, mockProcess };
}

describe("runDevRunner", () => {
  afterEach(() => {
    spawnMock.mockReset();
    vi.clearAllMocks();
  });

  it("spawns exactly 5 child processes, one per service definition", () => {
    createRunnerHarness();

    expect(spawnMock).toHaveBeenCalledTimes(SERVICE_DEFINITIONS.length);

    for (const [index, service] of SERVICE_DEFINITIONS.entries()) {
      expect(spawnMock).toHaveBeenNthCalledWith(
        index + 1,
        service.command,
        service.args,
        expect.objectContaining({
          env: expect.any(Object),
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    }
  });

  it("routes stdout and stderr with a per-service color prefix", async () => {
    const { children, mockProcess } = createRunnerHarness();

    children[0].stdout.write("ready\n");
    children[0].stderr.write("warning\n");
    children[0].stdout.end("partial");

    await new Promise((resolve) => setImmediate(resolve));

    const prefix = createPrefix(SERVICE_DEFINITIONS[0].name);

    expect(mockProcess.stdout.write).toHaveBeenCalledWith(`${prefix} ready\n`);
    expect(mockProcess.stderr.write).toHaveBeenCalledWith(`${prefix} warning\n`);
    expect(mockProcess.stdout.write).toHaveBeenCalledWith(`${prefix} partial\n`);
  });

  it("ignores missing streams when wiring output", () => {
    const write = vi.fn<(message: string) => void>();

    routeOutput(null, write, createPrefix("api"));

    expect(write).not.toHaveBeenCalled();
  });

  it("kills all other children and exits 1 when any child exits non-zero", () => {
    const { children, mockProcess } = createRunnerHarness();

    children[2].emit("exit", 1, null);

    expect(children[0].kill).toHaveBeenCalledTimes(1);
    expect(children[1].kill).toHaveBeenCalledTimes(1);
    expect(children[2].kill).not.toHaveBeenCalled();
    expect(children[3].kill).toHaveBeenCalledTimes(1);
    expect(children[4].kill).toHaveBeenCalledTimes(1);
    expect(mockProcess.exit).toHaveBeenCalledWith(1);
  });

  it("does not shut down when a child exits cleanly", () => {
    const { children, mockProcess } = createRunnerHarness();

    children[1].emit("exit", 0, null);

    for (const child of children) {
      expect(child.kill).not.toHaveBeenCalled();
    }
    expect(mockProcess.exit).not.toHaveBeenCalled();
  });

  it("kills all children and exits 0 on SIGINT", () => {
    const { children, mockProcess } = createRunnerHarness();

    mockProcess.emit("SIGINT");

    for (const child of children) {
      expect(child.kill).toHaveBeenCalledTimes(1);
    }
    expect(mockProcess.exit).toHaveBeenCalledWith(0);
  });

  it("shuts down only once and skips children already marked as killed", () => {
    const { children, mockProcess } = createRunnerHarness();

    children[0].killed = true;

    mockProcess.emit("SIGINT");
    mockProcess.emit("SIGTERM");
    children[1].emit("exit", 1, null);

    expect(children[0].kill).not.toHaveBeenCalled();
    expect(children[1].kill).toHaveBeenCalledTimes(1);
    expect(children[2].kill).toHaveBeenCalledTimes(1);
    expect(children[3].kill).toHaveBeenCalledTimes(1);
    expect(children[4].kill).toHaveBeenCalledTimes(1);
    expect(mockProcess.exit).toHaveBeenCalledTimes(1);
    expect(mockProcess.exit).toHaveBeenCalledWith(0);
  });

  it("kills all children and exits 0 on SIGTERM", () => {
    const { children, mockProcess } = createRunnerHarness();

    mockProcess.emit("SIGTERM");

    for (const child of children) {
      expect(child.kill).toHaveBeenCalledTimes(1);
    }
    expect(mockProcess.exit).toHaveBeenCalledWith(0);
  });

  it("treats signal-based child exits as failures", () => {
    const { children, mockProcess } = createRunnerHarness();

    children[0].emit("exit", null, "SIGTERM");

    expect(children[0].kill).not.toHaveBeenCalled();
    expect(children[1].kill).toHaveBeenCalledTimes(1);
    expect(children[2].kill).toHaveBeenCalledTimes(1);
    expect(children[3].kill).toHaveBeenCalledTimes(1);
    expect(children[4].kill).toHaveBeenCalledTimes(1);
    expect(mockProcess.exit).toHaveBeenCalledWith(1);
  });
});
