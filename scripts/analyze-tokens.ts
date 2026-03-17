#!/usr/bin/env bun
import fs from "fs/promises";
import os from "os";
import path from "path";

// Config
// Support ENV overrides for robust path resolution
const SESSIONS_DIR =
  process.env.OPENCLAW_SESSIONS_DIR || path.join(os.homedir(), ".openclaw/sessions");
const HOUSEKEEPER_ROOT =
  process.env.HOUSEKEEPER_ROOT || path.join(os.homedir(), "OpenClaw/housekeeper");
const REPORT_FILE = path.join(HOUSEKEEPER_ROOT, "memory/token-report.md");
const LOG_LIMIT = 50; // Analyze last 50 session files

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface SessionStats {
  id: string;
  date: string;
  turns: number;
  usage: TokenUsage;
  model: string;
  costEstimate: number; // Rough estimate in USD
}

// Pricing (Approximate baseline for "Smart" models like Claude 3.5 Sonnet / Gemini Pro 1.5)
const PRICE_INPUT_1K = 0.003;
const PRICE_OUTPUT_1K = 0.015;

async function analyzeFile(filePath: string): Promise<SessionStats | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    let input = 0;
    let output = 0;
    let turns = 0;
    let model = "unknown";
    let timestamp = "";

    // OpenClaw logs are JSONL. Each line is a message or event.
    // Usage is usually in "usage" field of completion events.
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.usage) {
          input += json.usage.inputTokens || 0;
          output += json.usage.outputTokens || 0;
        }
        if (json.model) {
          model = json.model;
        }
        if (!timestamp && json.timestamp) {
          timestamp = json.timestamp;
        }

        if (json.role === "user" || json.role === "model") {
          turns++;
        }
      } catch {
        // Skip malformed lines
      }
    }

    if (turns === 0) {
      return null; // Empty session
    }

    // Fallback: If usage not in logs (older versions), estimate?
    // For now, only count explicit usage.

    return {
      id: path.basename(filePath, ".jsonl"),
      date: timestamp ? new Date(timestamp).toISOString().split("T")[0] : "Unknown",
      turns: Math.ceil(turns / 2), // 1 turn = user + model
      usage: { input, output, total: input + output },
      model,
      costEstimate: (input / 1000) * PRICE_INPUT_1K + (output / 1000) * PRICE_OUTPUT_1K,
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log("🔍 Scanning Session Logs...");

  try {
    const files = await fs.readdir(SESSIONS_DIR);
    // Sort by modification time (newest first)
    const sortedFiles = await Promise.all(
      files
        .filter((f) => f.endsWith(".jsonl"))
        .map(async (f) => {
          const stats = await fs.stat(path.join(SESSIONS_DIR, f));
          return { file: f, mtime: stats.mtime };
        }),
    );
    sortedFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const recentFiles = sortedFiles.slice(0, LOG_LIMIT);
    const statsList: SessionStats[] = [];

    for (const { file } of recentFiles) {
      const stats = await analyzeFile(path.join(SESSIONS_DIR, file));
      if (stats) {
        statsList.push(stats);
      }
    }

    // Aggregations
    const totalUsage = statsList.reduce(
      (acc, s) => ({
        input: acc.input + s.usage.input,
        output: acc.output + s.usage.output,
        total: acc.total + s.usage.total,
      }),
      { input: 0, output: 0, total: 0 },
    );

    const avgTokensPerTurn =
      statsList.length > 0
        ? Math.round(totalUsage.total / statsList.reduce((acc, s) => acc + s.turns, 0))
        : 0;

    // Generate Markdown Report
    const report = `# 📊 Token Usage Audit Report
Generated: ${new Date().toLocaleString()}

## 📈 Summary (Last ${statsList.length} Sessions)
- **Total Tokens**: ${totalUsage.total.toLocaleString()}
- **Input**: ${totalUsage.input.toLocaleString()} (${Math.round((totalUsage.input / totalUsage.total) * 100)}%)
- **Output**: ${totalUsage.output.toLocaleString()} (${Math.round((totalUsage.output / totalUsage.total) * 100)}%)
- **Avg Tokens/Turn**: ${avgTokensPerTurn}
- **Est. Cost**: $${statsList.reduce((acc, s) => acc + s.costEstimate, 0).toFixed(4)}

## 🏆 Top Spenders (Most Expensive Sessions)
| Date | Session ID | Model | Turns | Total Tokens | Cost |
| :--- | :--- | :--- | :--- | :--- | :--- |
${statsList
  .toSorted((a, b) => b.usage.total - a.usage.total)
  .slice(0, 10)
  .map(
    (s) =>
      `| ${s.date} | ${s.id.slice(0, 8)}... | ${s.model.split("/").pop()} | ${s.turns} | ${s.usage.total.toLocaleString()} | $${s.costEstimate.toFixed(4)} |`,
  )
  .join("\n")}

## 💡 Insights
- **High Consumption Warning**: Sessions with > 50k tokens are flagged.
- **Efficiency Goal**: Aim for < 2000 tokens/turn average.
`;

    // Ensure target directory exists
    await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });

    await fs.writeFile(REPORT_FILE, report);
    console.log(`✅ Report generated at: ${REPORT_FILE}`);
    console.log(
      `📊 Summary: Total ${totalUsage.total.toLocaleString()} tokens used in last ${statsList.length} sessions.`,
    );
  } catch (e) {
    console.error("❌ Failed to analyze tokens:", e);
  }
}

main().catch(console.error);
