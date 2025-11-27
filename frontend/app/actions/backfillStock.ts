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
 * Backfill historical data for a single stock
 * This is triggered when user views a stock detail page with insufficient data
 */
export async function backfillSingleStock(symbol: string): Promise<BackfillResult> {
  try {
    console.log(`[BackfillSingle] Starting backfill for ${symbol}...`);

    const currentDir = process.cwd();
    const projectRoot = path.resolve(currentDir, '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'backfill_single_stock.py');

    // Check if script exists
    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
      console.error(`[BackfillSingle] Script not found: ${scriptPath}`);
      return {
        success: false,
        message: "回填脚本不存在",
      };
    }

    // Execute backfill script for single stock
    const command = `python -u "${scriptPath}" --symbol ${symbol}`;
    console.log(`[BackfillSingle] Executing: ${command}`);

    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 360000, // 6 minutes timeout (some stocks need 5+ minutes)
      env: process.env,
    });

    console.log(`[BackfillSingle] Completed for ${symbol}`);
    if (stdout) {
      console.log(`[BackfillSingle] Output:\n${stdout}`);
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
    console.error(`[BackfillSingle] Error for ${symbol}:`, error);

    return {
      success: false,
      message: "历史数据回填失败，请稍后重试",
    };
  }
}
