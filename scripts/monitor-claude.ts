#!/usr/bin/env bun
/**
 * scripts/monitor-claude.ts
 *
 * Automated health check and recovery for Antigravity Claude Proxy.
 * Run periodically via cron.
 */

import { randomUUID } from "crypto";
import { $ } from "bun";

const sessionId = randomUUID();
console.log(`🔍 Antigravity Auto: Starting Health Check (Session: ${sessionId})...`);

try {
  const task = `
    Run 'antigravity status' and 'antigravity verify'.
    If any account is invalid, try to refresh it.
    If the service is down, restart it.
    Report only if there are issues or fixed issues.
    Output strictly in Traditional Chinese.
  `;

  await $`openclaw agent --session-id ${sessionId} --message ${task} --thinking low`;
  console.log("✅ Monitor task completed.");
} catch (error) {
  console.error("❌ Monitor task failed:", error);
  process.exit(1);
}
