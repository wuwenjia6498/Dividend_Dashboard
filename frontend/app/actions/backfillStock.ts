"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { backfillHistoricalData } from "@/lib/stockDataService";

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

    // Execute backfill using TypeScript service
    const recordCount = await backfillHistoricalData(symbol);

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
