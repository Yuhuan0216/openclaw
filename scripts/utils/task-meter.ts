import fs from "fs/promises";
import os from "os";
import path from "path";

// Config
// Support ENV overrides for robust path resolution
const SESSIONS_DIR =
  process.env.OPENCLAW_SESSIONS_DIR || path.join(os.homedir(), ".openclaw/sessions");
const HOUSEKEEPER_ROOT =
  process.env.HOUSEKEEPER_ROOT || path.join(os.homedir(), "OpenClaw/housekeeper");
const HOUSEKEEPER_MEMORY = path.join(HOUSEKEEPER_ROOT, "memory");

// Store temporary state in memory folder to survive restarts
const METER_STATE_FILE = path.join(HOUSEKEEPER_MEMORY, ".task-meter-state.json");
const TASK_LOG_FILE = path.join(HOUSEKEEPER_MEMORY, "task-costs.json");

// Pricing (Approximate baseline)
const PRICE_INPUT_1K = 0.003;
const PRICE_OUTPUT_1K = 0.015;

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface MeterState {
  taskName: string;
  startTime: string;
  startUsage: TokenUsage;
}

interface TaskRecord {
  task: string;
  timestamp: string;
  durationSec: number;
  cost: TokenUsage & { usd: number };
}

async function getLatestSessionFile(): Promise<string> {
  const files = await fs.readdir(SESSIONS_DIR);
  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

  if (jsonlFiles.length === 0) {
    throw new Error("No session logs found.");
  }

  // Find newest
  let newestFile = "";
  let newestMtime = 0;

  for (const file of jsonlFiles) {
    const stat = await fs.stat(path.join(SESSIONS_DIR, file));
    if (stat.mtimeMs > newestMtime) {
      newestMtime = stat.mtimeMs;
      newestFile = file;
    }
  }
  return path.join(SESSIONS_DIR, newestFile);
}

async function getCurrentUsage(filePath: string): Promise<TokenUsage> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  let input = 0;
  let output = 0;

  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      if (json.usage) {
        input += json.usage.inputTokens || 0;
        output += json.usage.outputTokens || 0;
      }
    } catch {}
  }
  return { input, output, total: input + output };
}

async function startTask(taskName: string) {
  // Ensure memory dir exists
  await fs.mkdir(HOUSEKEEPER_MEMORY, { recursive: true });

  const logFile = await getLatestSessionFile();
  const usage = await getCurrentUsage(logFile);

  const state: MeterState = {
    taskName,
    startTime: new Date().toISOString(),
    startUsage: usage,
  };

  await fs.writeFile(METER_STATE_FILE, JSON.stringify(state));
  console.log(`⏱️ Meter STARTED for "${taskName}"`);
  console.log(`   Baseline: ${usage.total} tokens (In: ${usage.input}, Out: ${usage.output})`);
}

async function stopTask(taskName: string) {
  // taskName optional check
  let state: MeterState;
  try {
    state = JSON.parse(await fs.readFile(METER_STATE_FILE, "utf-8"));
  } catch {
    console.error("❌ No active meter found. Run 'start' first.");
    process.exit(1);
  }

  // Verify task name match if provided (optional safety)
  if (taskName && state.taskName !== taskName) {
    console.warn(`⚠️ Warning: Stopping "${state.taskName}" but you specified "${taskName}".`);
  }

  const logFile = await getLatestSessionFile();
  const currentUsage = await getCurrentUsage(logFile);

  const deltaUsage: TokenUsage = {
    input: currentUsage.input - state.startUsage.input,
    output: currentUsage.output - state.startUsage.output,
    total: currentUsage.total - state.startUsage.total,
  };

  const durationMs = new Date().getTime() - new Date(state.startTime).getTime();
  const costUsd =
    (deltaUsage.input / 1000) * PRICE_INPUT_1K + (deltaUsage.output / 1000) * PRICE_OUTPUT_1K;

  const record: TaskRecord = {
    task: state.taskName,
    timestamp: new Date().toISOString(),
    durationSec: Math.round(durationMs / 1000),
    cost: { ...deltaUsage, usd: costUsd },
  };

  // Append to history
  let history: TaskRecord[] = [];
  try {
    history = JSON.parse(await fs.readFile(TASK_LOG_FILE, "utf-8"));
  } catch {}

  history.push(record);
  await fs.writeFile(TASK_LOG_FILE, JSON.stringify(history, null, 2));

  // Cleanup tmp state
  await fs.unlink(METER_STATE_FILE).catch(() => {});

  console.log(`🏁 Meter STOPPED for "${state.taskName}"`);
  console.log(`   Duration: ${record.durationSec}s`);
  console.log(`   Cost: ${deltaUsage.total} Tokens ($${costUsd.toFixed(5)})`);
  console.log(`   (In: ${deltaUsage.input}, Out: ${deltaUsage.output})`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const taskName = args.join(" ");

  if (command === "start") {
    if (!taskName) {
      console.error("Usage: bun task-meter.ts start <task name>");
      process.exit(1);
    }
    await startTask(taskName);
  } else if (command === "stop") {
    await stopTask(taskName);
  } else {
    console.error("Usage: bun task-meter.ts [start|stop] <task name>");
    process.exit(1);
  }
}

main().catch(console.error);
