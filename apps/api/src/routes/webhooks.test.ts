import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import webhooksRouter from "./webhooks";
import { errorHandler } from "../middleware/error";

// Mock dependencies
vi.mock("../db/queries/challenges");
vi.mock("../lib/logger");
vi.mock("../lib/redis", () => ({
  redis: {
    call: vi.fn(),
  },
}));

import * as challengeQueries from "../db/queries/challenges";

const app = express();
app.use(express.json());
app.use("/webhooks", webhooksRouter);
app.use(errorHandler);

const WEBHOOK_SECRET = "test-secret";
process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;

describe("Webhooks API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /webhooks/stellar/deposit", () => {
    it("should 401 if secret is wrong", async () => {
      const res = await request(app)
        .post("/webhooks/stellar/deposit")
        .set("x-webhook-secret", "wrong-secret")
        .send({ memo: "m1", txHash: "h1", amount: "10" });

      expect(res.status).toBe(401);
    });

    it("should activate challenge happy path", async () => {
      (challengeQueries.getChallengeByMemo as any).mockResolvedValue({
        id: "c1",
        status: "pending_deposit",
      });

      const res = await request(app)
        .post("/webhooks/stellar/deposit")
        .set("x-webhook-secret", WEBHOOK_SECRET)
        .send({ memo: "m1", txHash: "h1", amount: "10" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("activated");
      expect(challengeQueries.updateChallengeStatus).toHaveBeenCalledWith("c1", "active", {
        depositTx: "h1",
      });
    });

    it("should be idempotent for already processed challenges", async () => {
      (challengeQueries.getChallengeByMemo as any).mockResolvedValue({
        id: "c1",
        status: "active", // already active
      });

      const res = await request(app)
        .post("/webhooks/stellar/deposit")
        .set("x-webhook-secret", WEBHOOK_SECRET)
        .send({ memo: "m1", txHash: "h1", amount: "10" });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("already_processed");
      expect(challengeQueries.updateChallengeStatus).not.toHaveBeenCalled();
    });

    it("should 404 for unknown memo", async () => {
      (challengeQueries.getChallengeByMemo as any).mockResolvedValue(null);

      const res = await request(app)
        .post("/webhooks/stellar/deposit")
        .set("x-webhook-secret", WEBHOOK_SECRET)
        .send({ memo: "unknown", txHash: "h1", amount: "10" });

      expect(res.status).toBe(404);
    });

    it("should 400 if fields are missing", async () => {
      const res = await request(app)
        .post("/webhooks/stellar/deposit")
        .set("x-webhook-secret", WEBHOOK_SECRET)
        .send({ memo: "m1" }); // missing txHash

      expect(res.status).toBe(400);
    });
  });
});
