"use server";

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { revalidatePath, revalidateTag } from "next/cache";

const execAsync = promisify(exec);

export interface BackfillResult {
  success: boolean;
  message: string;
  recordCount?: number;
}

/**
 * Check if we're running in a serverless environment (Vercel, etc.)
 */
function isServerless(): boolean {
  return process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
}

/**
 * Trigger GitHub Actions workflow to backfill historical data
 */
async function triggerBackfillWorkflow(symbol: string): Promise<BackfillResult> {
  try {
    const githubToken = process.env.GITHUB_PAT;
    const githubOwner = process.env.GITHUB_OWNER || "wuwenjia6498";
    const githubRepo = process.env.GITHUB_REPO || "Dividend_Dashboard";

    if (!githubToken) {
      console.error("[BackfillWorkflow] Missing GITHUB_PAT environment variable");
      return {
        success: false,
        message: "服务器配置错误：缺少 GitHub 访问令牌",
      };
    }

    const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/backfill_history.yml/dispatches`;

    console.log("=".repeat(60));
    console.log("[BackfillWorkflow] Triggering GitHub Actions backfill workflow");
    console.log(`[BackfillWorkflow] Symbol: ${symbol}`);
    console.log("=".repeat(60));

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: { symbol },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("=".repeat(60));
      console.error(`[BackfillWorkflow] GitHub API Error: ${response.status}`);
      console.error(`[BackfillWorkflow] Response: ${errorText}`);
      console.error("=".repeat(60));

      return {
        success: false,
        message: `触发回填任务失败 (${response.status})`,
      };
    }

    console.log("=".repeat(60));
    console.log("[BackfillWorkflow] Workflow triggered successfully!");
    console.log("=".repeat(60));

    // Clear cache for this stock
    revalidateTag(`stock-detail-${symbol}`, "max");
    revalidatePath(`/stock/${symbol}`);

    return {
      success: true,
      message: "已触发历史数据回填任务！预计 1-2 分钟内完成，完成后请刷新页面查看。",
    };

  } catch (error: any) {
    console.error("=".repeat(60));
    console.error("[BackfillWorkflow] Unexpected error:", error);
    console.error("=".repeat(60));

    return {
      success: false,
      message: "触发回填任务失败：网络错误或服务器异常",
    };
  }
}

/**
 * Execute backfill script locally (for development environment)
 */
async function executeLocalBackfill(symbol: string): Promise<BackfillResult> {
  try {
    console.log(`[BackfillLocal] Starting local backfill for ${symbol}...`);

    const currentDir = process.cwd();
    const projectRoot = path.resolve(currentDir, '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'backfill_single_stock.py');

    // Check if script exists
    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
      console.error(`[BackfillLocal] Script not found: ${scriptPath}`);
      return {
        success: false,
        message: "回填脚本不存在",
      };
    }

    // Execute backfill script for single stock
    const command = `python -u "${scriptPath}" --symbol ${symbol}`;
    console.log(`[BackfillLocal] Executing: ${command}`);

    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 360000, // 6 minutes timeout (some stocks need 5+ minutes)
      env: process.env,
    });

    console.log(`[BackfillLocal] Completed for ${symbol}`);
    if (stdout) {
      console.log(`[BackfillLocal] Output:\n${stdout}`);
    }

    // Parse record count from output
    const recordMatch = stdout.match(/Saved (\d+) records/);
    const recordCount = recordMatch ? parseInt(recordMatch[1]) : 0;

    // Clear cache for this stock
    revalidateTag(`stock-detail-${symbol}`, "max");
    revalidatePath(`/stock/${symbol}`);

    return {
      success: true,
      message: `成功回填 ${recordCount} 条历史数据`,
      recordCount,
    };

  } catch (error: any) {
    console.error(`[BackfillLocal] Error for ${symbol}:`, error);

    return {
      success: false,
      message: "历史数据回填失败，请稍后重试",
    };
  }
}

/**
 * Backfill historical data for a single stock
 * This is triggered when user views a stock detail page with insufficient data
 *
 * In production (Vercel): Uses GitHub Actions workflow
 * In development (local): Executes Python script directly
 */
export async function backfillSingleStock(symbol: string): Promise<BackfillResult> {
  if (isServerless()) {
    console.log("[Backfill] Running in serverless environment, using GitHub Actions");
    return triggerBackfillWorkflow(symbol);
  } else {
    console.log("[Backfill] Running in local environment, executing script directly");
    return executeLocalBackfill(symbol);
  }
}
