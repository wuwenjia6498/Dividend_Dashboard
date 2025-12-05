"use server";

import { db } from "@/db";
import { stockMeta } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export interface AddStockResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Execute Python script to fetch latest data for a specific stock
 * @param symbol - Stock symbol to update
 * @returns Promise<boolean> - true if successful, false if failed
 */
async function fetchLatestStockData(symbol: string): Promise<boolean> {
  try {
    const currentDir = process.cwd();
    const projectRoot = path.resolve(currentDir, '..');
    const scriptPath = path.join(projectRoot, 'scripts', 'update_data.py');

    console.log('='.repeat(60));
    console.log(`[FetchLatest] Fetching latest data for: ${symbol}`);
    console.log('='.repeat(60));

    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
      console.error(`[FetchLatest] ERROR: Script not found at ${scriptPath}`);
      return false;
    }

    const command = `python -u "${scriptPath}" --symbol ${symbol}`;
    console.log(`[FetchLatest] Executing: ${command}`);

    const { stdout, stderr } = await execAsync(command, {
      cwd: projectRoot,
      timeout: 90000, // 90 seconds - increased to handle slow networks
      env: process.env,
    });

    console.log(`[FetchLatest] Completed for ${symbol}`);
    if (stdout) {
      console.log(`[FetchLatest] Output:\n${stdout}`);
    }
    if (stderr && stderr.trim()) {
      console.log(`[FetchLatest] Stderr:\n${stderr}`);
    }

    console.log('='.repeat(60));
    return true;

  } catch (error: any) {
    console.error('='.repeat(60));
    console.error(`[FetchLatest] ERROR for ${symbol}: ${error.message}`);
    if (error.stdout) console.log(`[FetchLatest] Partial stdout:\n${error.stdout}`);
    if (error.stderr) console.error(`[FetchLatest] Stderr:\n${error.stderr}`);
    console.error('='.repeat(60));

    // Check if it's a timeout error
    if (error.killed && error.signal === 'SIGTERM') {
      console.error(`[FetchLatest] Operation timed out after 90 seconds`);
    }

    return false;
  }
}

/**
 * Add a new stock to the stock pool (stock_meta table)
 * If the stock was previously removed (is_active=false), reactivate it
 * After adding, immediately fetch data using Python ETL script
 *
 * @param symbol - Stock symbol (e.g., "600036")
 * @param name - Stock name (e.g., "招商银行")
 * @param sector - Sector/industry (optional, e.g., "银行")
 */
export async function addNewStock(
  symbol: string,
  name: string,
  sector?: string
): Promise<AddStockResult> {
  try {
    // Validate inputs
    if (!symbol || !symbol.trim()) {
      return {
        success: false,
        message: "股票代码不能为空",
        error: "INVALID_SYMBOL",
      };
    }

    if (!name || !name.trim()) {
      return {
        success: false,
        message: "股票名称不能为空",
        error: "INVALID_NAME",
      };
    }

    // Clean inputs
    const cleanSymbol = symbol.trim();
    const cleanName = name.trim();
    const cleanSector = sector?.trim() || null;

    // Check if stock exists (including inactive ones)
    const existingStock = await db
      .select()
      .from(stockMeta)
      .where(eq(stockMeta.symbol, cleanSymbol))
      .limit(1);

    let isReactivation = false;

    if (existingStock.length > 0) {
      const stock = existingStock[0];

      // If stock exists but is inactive, reactivate it
      if (!stock.isActive) {
        await db
          .update(stockMeta)
          .set({
            isActive: true,
            name: cleanName,
            sector: cleanSector,
          })
          .where(eq(stockMeta.symbol, cleanSymbol));

        isReactivation = true;
      } else {
        // Stock exists and is already active
        return {
          success: false,
          message: "该股票已在追踪池中",
          error: "DUPLICATE_SYMBOL",
        };
      }
    } else {
      // Insert new stock
      await db.insert(stockMeta).values({
        symbol: cleanSymbol,
        name: cleanName,
        sector: cleanSector,
        isActive: true,
      });
    }

    // Fetch latest data (fast - only current day's data)
    console.log(`[AddStock] Fetching latest data for ${cleanSymbol}...`);
    const dataFetchSuccess = await fetchLatestStockData(cleanSymbol);

    // Clear the cache for this stock's detail page to ensure fresh data is loaded
    if (dataFetchSuccess) {
      console.log(`[AddStock] Clearing cache for stock detail: ${cleanSymbol}`);
      revalidateTag(`stock-detail-${cleanSymbol}`, "max");
      revalidatePath(`/stock/${cleanSymbol}`);
    }

    // Revalidate the homepage to show the updated stock list
    revalidatePath("/");

    // Return success message with clear instructions
    const actionText = isReactivation ? "重新激活" : "添加";

    let dataStatusText = "";
    if (dataFetchSuccess) {
      dataStatusText = "已获取最新数据。";
    } else {
      dataStatusText = "获取数据失败（可能由于网络超时或数据源问题），但股票已添加成功。";
    }

    // Add instruction for historical data
    const historyInstruction = "\n\n📊 查看完整图表需要历史数据，请在终端运行：\npython scripts/backfill_history.py\n\n或等待每日自动更新任务完成。";

    return {
      success: true,
      message: `股票 ${cleanName} (${cleanSymbol}) 已${actionText}！${dataStatusText}${historyInstruction}`,
    };

  } catch (error: any) {
    console.error("Failed to add stock:", error);
    return {
      success: false,
      message: "添加股票失败，请稍后重试",
      error: "UNKNOWN_ERROR",
    };
  }
}
