import { Queue, type JobsOptions } from "bullmq";
import { redis } from "../lib/redis";

export const payoutJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

export const payoutQueue = new Queue("payout", {
  connection: redis,
  defaultJobOptions: payoutJobOptions,
});
