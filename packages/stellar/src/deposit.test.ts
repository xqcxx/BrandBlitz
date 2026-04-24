import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchDepositEvents, getDepositPollInterval } from "./deposit";
import * as client from "./client";
import { rpc as SorobanRpc } from "@stellar/stellar-sdk";

vi.mock("./client", () => ({
  getRpcServer: vi.fn(),
  getUsdcAsset: vi.fn(),
}));

describe("deposit", () => {
  const mockRpc = {
    getEvents: vi.fn(),
    getTransaction: vi.fn(),
  };

  const mockUsdc = {
    contractId: vi.fn().mockReturnValue("USDC_CONTRACT_ID"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (client.getRpcServer as any).mockReturnValue(mockRpc);
    (client.getUsdcAsset as any).mockReturnValue(mockUsdc);
  });

  it("should parse RPC events correctly", async () => {
    mockRpc.getEvents.mockResolvedValue({
      events: [
        {
          txHash: "hash1",
          ledger: 100,
          ledgerClosedAt: "2024-01-01T00:00:00Z",
          value: "1000000",
        },
      ],
      latestLedger: 105,
    });

    mockRpc.getTransaction.mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
      memo: { text: "memo1" },
    });

    const { events, latestLedger } = await fetchDepositEvents("HOT_WALLET", 90);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      txHash: "hash1",
      amount: "1000000",
      memo: "memo1",
      to: "HOT_WALLET",
    });
    expect(latestLedger).toBe(105);
  });

  it("should use correct network passphrase in contractId call", async () => {
    mockRpc.getEvents.mockResolvedValue({ events: [], latestLedger: 100 });
    
    await fetchDepositEvents("HOT_WALLET", 90, "testnet");
    expect(mockUsdc.contractId).toHaveBeenCalledWith("Test SDF Network ; September 2015");

    await fetchDepositEvents("HOT_WALLET", 90, "public");
    expect(mockUsdc.contractId).toHaveBeenCalledWith("Public Global Stellar Network ; September 2015");
  });

  it("should handle RPC errors by throwing", async () => {
    mockRpc.getEvents.mockRejectedValue(new Error("RPC Error"));
    await expect(fetchDepositEvents("HOT_WALLET", 90)).rejects.toThrow("RPC Error");
  });

  it("should skip unsuccessful transactions and log warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    
    mockRpc.getEvents.mockResolvedValue({
      events: [{ txHash: "failed_tx", ledger: 100, ledgerClosedAt: "2024-01-01T00:00:00Z" }],
      latestLedger: 105,
    });

    mockRpc.getTransaction.mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.FAILED,
    });

    const { events } = await fetchDepositEvents("HOT_WALLET", 90);

    expect(events).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping unsuccessful transaction"), expect.anything());
    
    warnSpy.mockRestore();
  });

  it("should skip events with missing ledgerClosedAt and log warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    
    mockRpc.getEvents.mockResolvedValue({
      events: [{ txHash: "bad_event", ledger: 100 }],
      latestLedger: 105,
    });

    mockRpc.getTransaction.mockResolvedValue({
      status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
    });

    const { events } = await fetchDepositEvents("HOT_WALLET", 90);

    expect(events).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping event with missing ledgerClosedAt"));
    
    warnSpy.mockRestore();
  });

  it("should return correct poll interval", () => {
    expect(getDepositPollInterval()).toBe(5000);
  });
});
