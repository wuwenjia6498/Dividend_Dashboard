"use server";

import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { stockMeta, dailyMetrics, quarterlyFinancials } from "@/db/schema";
import { eq, desc, asc, gte, and } from "drizzle-orm";

export interface StockInfo {
  symbol: string;
  name: string;
  sector: string | null;
}

export interface DailyMetricItem {
  tradeDate: string;
  closePrice: number | null;
  dividendYieldTtm: number | null;
  yieldPercentile: number | null;
  peTtm: number | null;
  pbTtm: number | null;
}

export interface FinancialData {
  reportPeriod: string;
  freeCashFlow: number | null;
  debtToAssetRatio: number | null;
  dividendPayoutRatio: number | null;
  roeTtm: number | null;
  grossMargin: number | null;
  revenueGrowthYoy: number | null;
  netProfitGrowthYoy: number | null;
}

export interface StockDetailData {
  info: StockInfo | null;
  history: DailyMetricItem[];
  financials: FinancialData | null;
  // Calculated percentile thresholds for chart reference lines
  yieldPercentile80: number | null;
  yieldPercentile20: number | null;
  // Total data count for checking if historical data is sufficient
  totalDataCount: number;
}

/**
 * Clean dividend yield data to remove spikes and anomalies
 *
 * Steps:
 * 1. Forward fill zero/null values with previous valid value
 * 2. Detect and smooth out short-term spikes (1-2 day anomalies with >50% change)
 */
function cleanDividendYieldData(data: DailyMetricItem[]): DailyMetricItem[] {
  if (data.length === 0) return data;

  // Create a copy to avoid mutating original data
  const cleaned = [...data];

  // Step 1: Forward fill zero/null values
  let lastValidYield: number | null = null;
  for (let i = 0; i < cleaned.length; i++) {
    const currentYield = cleaned[i].dividendYieldTtm;

    if (currentYield === null || currentYield === 0) {
      // Use previous valid value (forward fill)
      cleaned[i] = {
        ...cleaned[i],
        dividendYieldTtm: lastValidYield,
      };
    } else {
      lastValidYield = currentYield;
    }
  }

  // Step 2: Detect and smooth spikes (>50% change that lasts 1-2 days)
  const SPIKE_THRESHOLD = 0.5; // 50% change threshold
  const MAX_SPIKE_DURATION = 2; // Max days for a spike

  for (let i = 1; i < cleaned.length - 1; i++) {
    const prev = cleaned[i - 1].dividendYieldTtm;
    const curr = cleaned[i].dividendYieldTtm;
    const next = cleaned[i + 1].dividendYieldTtm;

    // Skip if any value is null
    if (prev === null || curr === null || next === null) continue;

    // Calculate percentage change from previous day
    const changeFromPrev = Math.abs(curr - prev) / prev;

    // Check if this is a spike (large change followed by reversion)
    if (changeFromPrev > SPIKE_THRESHOLD) {
      // Check if it reverts in the next 1-2 days
      let isSpike = false;
      let revertIndex = -1;

      for (let j = i + 1; j <= Math.min(i + MAX_SPIKE_DURATION, cleaned.length - 1); j++) {
        const futureValue = cleaned[j].dividendYieldTtm;
        if (futureValue === null) continue;

        const changeFromFuture = Math.abs(futureValue - prev) / prev;

        // If future value is close to previous value (within 20%), it's a reversion
        if (changeFromFuture < 0.2) {
          isSpike = true;
          revertIndex = j;
          break;
        }
      }

      // If it's a spike, replace with average of prev and next valid value
      if (isSpike && revertIndex > 0) {
        const smoothedValue = (prev + cleaned[revertIndex].dividendYieldTtm!) / 2;

        // Replace all values in the spike range with smoothed value
        for (let k = i; k < revertIndex; k++) {
          cleaned[k] = {
            ...cleaned[k],
            dividendYieldTtm: smoothedValue,
          };
        }

        // Skip ahead past the spike we just fixed
        i = revertIndex - 1;
      }
    }
  }

  return cleaned;
}


/**
 * Internal implementation of getStockDetail
 * Fetches 5 years of data for accurate percentile calculation,
 * but only returns last 2 years to frontend for charting
 */
async function getStockDetailImpl(symbol: string): Promise<StockDetailData> {
  // Calculate date ranges
  const now = new Date();
  const fiveYearsAgo = new Date(now);
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];
  const twoYearsAgoStr = twoYearsAgo.toISOString().split('T')[0];

  // 1. Get stock basic info
  const infoResult = await db
    .select({
      symbol: stockMeta.symbol,
      name: stockMeta.name,
      sector: stockMeta.sector,
    })
    .from(stockMeta)
    .where(eq(stockMeta.symbol, symbol))
    .limit(1);

  const info = infoResult[0] || null;

  // 2. Get 5-year history for accurate percentile calculation
  const fullHistoryResult = await db
    .select({
      tradeDate: dailyMetrics.tradeDate,
      closePrice: dailyMetrics.closePrice,
      dividendYieldTtm: dailyMetrics.dividendYieldTtm,
      yieldPercentile: dailyMetrics.yieldPercentile,
      peTtm: dailyMetrics.peTtm,
      pbTtm: dailyMetrics.pbTtm,
    })
    .from(dailyMetrics)
    .where(
      and(
        eq(dailyMetrics.symbol, symbol),
        gte(dailyMetrics.tradeDate, fiveYearsAgoStr)
      )
    )
    .orderBy(asc(dailyMetrics.tradeDate));

  // Convert Decimal to number for all data
  let fullHistory: DailyMetricItem[] = fullHistoryResult.map((row) => ({
    tradeDate: row.tradeDate,
    closePrice: row.closePrice ? parseFloat(row.closePrice.toString()) : null,
    dividendYieldTtm: row.dividendYieldTtm ? parseFloat(row.dividendYieldTtm.toString()) : null,
    yieldPercentile: row.yieldPercentile ? parseFloat(row.yieldPercentile.toString()) : null,
    peTtm: row.peTtm ? parseFloat(row.peTtm.toString()) : null,
    pbTtm: row.pbTtm ? parseFloat(row.pbTtm.toString()) : null,
  }));

  // 2.5 Clean dividend yield data to remove spikes and anomalies
  fullHistory = cleanDividendYieldData(fullHistory);

  // 3. Calculate yield percentile thresholds using FULL 5-year data
  const yields = fullHistory
    .map((h) => h.dividendYieldTtm)
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b);

  let yieldPercentile80: number | null = null;
  let yieldPercentile20: number | null = null;

  if (yields.length > 0) {
    const idx80 = Math.floor(yields.length * 0.8);
    const idx20 = Math.floor(yields.length * 0.2);
    yieldPercentile80 = yields[Math.min(idx80, yields.length - 1)];
    yieldPercentile20 = yields[Math.max(idx20, 0)];
  }

  // 4. Filter to last 2 years for frontend display (reduce JSON payload)
  const history = fullHistory.filter(h => h.tradeDate >= twoYearsAgoStr);

  // Store total data count for checking data sufficiency
  const totalDataCount = fullHistory.length;

  // 5. Get latest quarterly financials
  const financialsResult = await db
    .select({
      reportPeriod: quarterlyFinancials.reportPeriod,
      freeCashFlow: quarterlyFinancials.freeCashFlow,
      debtToAssetRatio: quarterlyFinancials.debtToAssetRatio,
      dividendPayoutRatio: quarterlyFinancials.dividendPayoutRatio,
      roeTtm: quarterlyFinancials.roeTtm,
      grossMargin: quarterlyFinancials.grossMargin,
      revenueGrowthYoy: quarterlyFinancials.revenueGrowthYoy,
      netProfitGrowthYoy: quarterlyFinancials.netProfitGrowthYoy,
    })
    .from(quarterlyFinancials)
    .where(eq(quarterlyFinancials.symbol, symbol))
    .orderBy(desc(quarterlyFinancials.reportPeriod))
    .limit(1);

  const financialsRow = financialsResult[0];
  const financials: FinancialData | null = financialsRow
    ? {
        reportPeriod: financialsRow.reportPeriod,
        freeCashFlow: financialsRow.freeCashFlow ? parseFloat(financialsRow.freeCashFlow.toString()) : null,
        debtToAssetRatio: financialsRow.debtToAssetRatio ? parseFloat(financialsRow.debtToAssetRatio.toString()) : null,
        dividendPayoutRatio: financialsRow.dividendPayoutRatio ? parseFloat(financialsRow.dividendPayoutRatio.toString()) : null,
        roeTtm: financialsRow.roeTtm ? parseFloat(financialsRow.roeTtm.toString()) : null,
        grossMargin: financialsRow.grossMargin ? parseFloat(financialsRow.grossMargin.toString()) : null,
        revenueGrowthYoy: financialsRow.revenueGrowthYoy ? parseFloat(financialsRow.revenueGrowthYoy.toString()) : null,
        netProfitGrowthYoy: financialsRow.netProfitGrowthYoy ? parseFloat(financialsRow.netProfitGrowthYoy.toString()) : null,
      }
    : null;

  return {
    info,
    history, // Only last 2 years returned to frontend
    financials,
    yieldPercentile80, // Calculated from full 5-year data
    yieldPercentile20, // Calculated from full 5-year data
    totalDataCount, // Total records in database
  };
}

/**
 * Get detailed stock data including history and financials
 * Cached for 1 hour to improve performance (data updates daily after market close)
 */
export async function getStockDetail(symbol: string): Promise<StockDetailData> {
  // Use unstable_cache with symbol-specific key for proper per-stock caching
  const getCachedStockDetail = unstable_cache(
    async (sym: string) => getStockDetailImpl(sym),
    ['stock-detail', symbol], // Cache key includes symbol
    {
      revalidate: 3600, // Cache for 1 hour (data updates daily at 4 PM)
      tags: [`stock-detail-${symbol}`],
    }
  );

  return getCachedStockDetail(symbol);
}
