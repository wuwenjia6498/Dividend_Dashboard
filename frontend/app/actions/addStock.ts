"use server";

import { db } from "@/db";
import { stockMeta } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { fetchAndSaveLatestData } from "@/lib/stockDataService";

export interface AddStockResult {
  success: boolean;
  message: string;
  error?: string;
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
    const dataFetchSuccess = await fetchAndSaveLatestData(cleanSymbol);

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
      dataStatusText = "获取数据失败，请稍后重试。";
    }

    // Add instruction for historical data
    const historyInstruction = "\n\n📊 如需查看完整图表，请在股票详情页点击「回填历史数据」按钮。";

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
