"use server";

import { db } from "@/db";
import { stockMeta } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface RemoveStockResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Remove a stock from the tracking pool (soft delete)
 * Sets is_active = false instead of physically deleting the record
 * @param symbol - Stock symbol (e.g., "600036")
 */
export async function removeStock(symbol: string): Promise<RemoveStockResult> {
  try {
    // Validate input
    if (!symbol || !symbol.trim()) {
      return {
        success: false,
        message: "股票代码不能为空",
        error: "INVALID_SYMBOL",
      };
    }

    const cleanSymbol = symbol.trim();

    // Update is_active to false (soft delete)
    const result = await db
      .update(stockMeta)
      .set({ isActive: false })
      .where(eq(stockMeta.symbol, cleanSymbol));

    // Revalidate the homepage to refresh the stock list
    revalidatePath("/");

    return {
      success: true,
      message: `股票 ${cleanSymbol} 已移除追踪池`,
    };
  } catch (error: any) {
    console.error("Failed to remove stock:", error);
    return {
      success: false,
      message: "移除股票失败，请稍后重试",
      error: "UNKNOWN_ERROR",
    };
  }
}
