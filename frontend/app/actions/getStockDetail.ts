"use server";

import { db } from "@/db";
import { stockMeta, dailyMetrics, quarterlyFinancials } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";

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
}

/**
 * Get detailed stock data including history and financials
 */
export async function getStockDetail(symbol: string): Promise<StockDetailData> {
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

  // 2. Get complete history data (ascending order for charts)
  const historyResult = await db
    .select({
      tradeDate: dailyMetrics.tradeDate,
      closePrice: dailyMetrics.closePrice,
      dividendYieldTtm: dailyMetrics.dividendYieldTtm,
      yieldPercentile: dailyMetrics.yieldPercentile,
      peTtm: dailyMetrics.peTtm,
      pbTtm: dailyMetrics.pbTtm,
    })
    .from(dailyMetrics)
    .where(eq(dailyMetrics.symbol, symbol))
    .orderBy(asc(dailyMetrics.tradeDate));

  // Convert Decimal to number
  const history: DailyMetricItem[] = historyResult.map((row) => ({
    tradeDate: row.tradeDate,
    closePrice: row.closePrice ? parseFloat(row.closePrice) : null,
    dividendYieldTtm: row.dividendYieldTtm ? parseFloat(row.dividendYieldTtm) : null,
    yieldPercentile: row.yieldPercentile ? parseFloat(row.yieldPercentile) : null,
    peTtm: row.peTtm ? parseFloat(row.peTtm) : null,
    pbTtm: row.pbTtm ? parseFloat(row.pbTtm) : null,
  }));

  // 3. Get latest quarterly financials
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
        freeCashFlow: financialsRow.freeCashFlow ? parseFloat(financialsRow.freeCashFlow) : null,
        debtToAssetRatio: financialsRow.debtToAssetRatio ? parseFloat(financialsRow.debtToAssetRatio) : null,
        dividendPayoutRatio: financialsRow.dividendPayoutRatio ? parseFloat(financialsRow.dividendPayoutRatio) : null,
        roeTtm: financialsRow.roeTtm ? parseFloat(financialsRow.roeTtm) : null,
        grossMargin: financialsRow.grossMargin ? parseFloat(financialsRow.grossMargin) : null,
        revenueGrowthYoy: financialsRow.revenueGrowthYoy ? parseFloat(financialsRow.revenueGrowthYoy) : null,
        netProfitGrowthYoy: financialsRow.netProfitGrowthYoy ? parseFloat(financialsRow.netProfitGrowthYoy) : null,
      }
    : null;

  // 4. Calculate yield percentile thresholds (80% and 20% lines)
  // These are the actual yield values at those percentile points
  const yields = history
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

  return {
    info,
    history,
    financials,
    yieldPercentile80,
    yieldPercentile20,
  };
}
