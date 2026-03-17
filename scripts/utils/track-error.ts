import fs from "fs/promises";
import os from "os";
import path from "path";

// Config
// Support ENV overrides for robust path resolution
const HOUSEKEEPER_ROOT =
  process.env.HOUSEKEEPER_ROOT || path.join(os.homedir(), "OpenClaw/housekeeper");
const HOUSEKEEPER_MEMORY = path.join(HOUSEKEEPER_ROOT, "memory");
const STATS_FILE = path.join(HOUSEKEEPER_MEMORY, "error-stats.json");

interface ErrorStats {
  [key: string]: number;
}

async function main() {
  const errorKey = process.argv[2];

  if (!errorKey) {
    console.error("Usage: bun track-error.ts <error-key>");
    process.exit(1);
  }

  try {
    // 1. Ensure Directory Exists
    await fs.mkdir(HOUSEKEEPER_MEMORY, { recursive: true });

    // 2. Read Existing Stats
    let stats: ErrorStats = {};
    try {
      const data = await fs.readFile(STATS_FILE, "utf-8");
      stats = JSON.parse(data);
    } catch {
      // File doesn't exist or corrupt, start fresh
      stats = {};
    }

    // 3. Increment Counter
    stats[errorKey] = (stats[errorKey] || 0) + 1;

    // 4. Write Back
    await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));

    console.log(`✅ Logged error: "${errorKey}" (Count: ${stats[errorKey]})`);
  } catch (err) {
    console.error("❌ Failed to log error:", err);
    process.exit(1);
  }
}

main().catch(console.error);
