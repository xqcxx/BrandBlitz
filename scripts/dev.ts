import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Readable } from "node:stream";

const ANSI_RESET = "\u001b[0m";

const SERVICE_COLORS = {
  api: "\u001b[32m",
  worker: "\u001b[33m",
  web: "\u001b[36m",
  stellar: "\u001b[35m",
  storage: "\u001b[34m",
} as const;

export type ServiceDefinition = {
  name: keyof typeof SERVICE_COLORS;
  command: string;
  args: string[];
};

type ManagedChildProcess = {
  killed: boolean;
  kill: (signal?: NodeJS.Signals | number) => boolean;
  once: (event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void) => ManagedChildProcess;
  stdout: Readable | null;
  stderr: Readable | null;
};

type ProcessLike = Pick<NodeJS.Process, "env" | "exit" | "once" | "stdout" | "stderr">;

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    name: "web",
    command: "pnpm",
    args: ["--filter", "@brandblitz/web", "dev"],
  },
  {
    name: "api",
    command: "pnpm",
    args: ["--filter", "@brandblitz/api", "dev"],
  },
  {
    name: "worker",
    command: "pnpm",
    args: ["--filter", "@brandblitz/api", "dev:worker"],
  },
  {
    name: "stellar",
    command: "pnpm",
    args: ["--filter", "@brandblitz/stellar", "dev"],
  },
  {
    name: "storage",
    command: "pnpm",
    args: ["--filter", "@brandblitz/storage", "dev"],
  },
];

export function createPrefix(serviceName: ServiceDefinition["name"]): string {
  return `${SERVICE_COLORS[serviceName]}[${serviceName}]${ANSI_RESET}`;
}

export function routeOutput(
  stream: Readable | null,
  write: (message: string) => void,
  prefix: string,
): void {
  if (!stream) {
    return;
  }

  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      write(`${prefix} ${line}\n`);
    }
  });

  stream.on("end", () => {
    if (buffer.length > 0) {
      write(`${prefix} ${buffer}\n`);
    }
  });
}

export function runDevRunner(proc: ProcessLike = process): ManagedChildProcess[] {
  const children = SERVICE_DEFINITIONS.map((service) => {
    const child = spawn(service.command, service.args, {
      env: proc.env,
      stdio: ["ignore", "pipe", "pipe"],
    }) as ManagedChildProcess;

    const prefix = createPrefix(service.name);
    routeOutput(child.stdout, (message) => proc.stdout.write(message), prefix);
    routeOutput(child.stderr, (message) => proc.stderr.write(message), prefix);

    return child;
  });

  let isShuttingDown = false;

  const shutdown = (exitCode: 0 | 1, source?: ManagedChildProcess) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    for (const child of children) {
      if (child !== source && !child.killed) {
        child.kill();
      }
    }

    proc.exit(exitCode);
  };

  for (const child of children) {
    child.once("exit", (code, signal) => {
      if (isShuttingDown) {
        return;
      }

      if ((code ?? 0) !== 0 || signal !== null) {
        shutdown(1, child);
      }
    });
  }

  proc.once("SIGINT", () => shutdown(0));
  proc.once("SIGTERM", () => shutdown(0));

  return children;
}

const entrypoint = process.argv[1];
const currentFile = fileURLToPath(import.meta.url);

/* v8 ignore next -- exercised by invoking the script directly rather than importing it in tests */
if (entrypoint && path.resolve(entrypoint) === currentFile) {
  runDevRunner();
}
