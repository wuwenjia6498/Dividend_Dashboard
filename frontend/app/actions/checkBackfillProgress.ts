"use server";

import { db } from "@/db";
import { dailyMetrics } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface BackfillProgress {
  currentCount: number;
  isComplete: boolean;
  addedCount: number;
  progressPercentage: number;
}

/**
 * Check the current number of historical records for a stock
 * Used to poll and detect when backfill is complete
 */
export async function checkBackfillProgress(
  symbol: string,
  initialCount: number
): Promise<BackfillProgress> {
  try {
    // Count total records for this stock
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(dailyMetrics)
      .where(eq(dailyMetrics.symbol, symbol));

    const currentCount = Number(result[0]?.count || 0);
    const addedCount = Math.max(0, currentCount - initialCount);

    // Expecting ~1200 records for 5 years of data
    const targetCount = 1200;
    const expectedToAdd = Math.max(targetCount - initialCount, 0);

    // Calculate progress percentage based on how many records we expect to add
    const progressPercentage = expectedToAdd > 0
      ? Math.min(100, (addedCount / expectedToAdd) * 100)
      : 100;

    // Consider backfill complete if:
    // 1. We have at least 300 records (enough for meaningful analysis)
    // 2. OR we added at least 200 records (significant backfill happened)
    // 3. OR we have at least 1000 records (full 5-year dataset)
    const isComplete =
      currentCount >= 300 ||
      addedCount >= 200 ||
      currentCount >= 1000;

    return {
      currentCount,
      isComplete,
      addedCount,
      progressPercentage,
    };
  } catch (error) {
    console.error("[CheckBackfillProgress] Error:", error);
    return {
      currentCount: initialCount,
      isComplete: false,
      addedCount: 0,
      progressPercentage: 0,
    };
  }
}
