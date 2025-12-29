import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Scheduled cleanup job for expired files, uploads, and download grants.
 *
 * This cron job runs hourly and calls the internal cleanup mutation
 * to purge:
 * - Expired pending uploads (upload tokens that were never finalized)
 * - Expired download grants (tokens that have passed their TTL)
 * - Expired files (files that have passed their expiration date)
 *
 * The cleanup is batched (500 items per run) and will automatically schedule
 * follow-up work if more items remain, preventing timeout issues.
 */
const crons = cronJobs();

crons.hourly(
  "cleanup-expired-files",
  { minuteUTC: 0 },
  internal.files.cleanupExpiredFiles,
  {},
);

export default crons;
