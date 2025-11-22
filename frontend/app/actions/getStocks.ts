"use server";

import { db } from "@/db";
import { stockMeta, dailyMetrics } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export interface StockDashboardItem {
  symbol: string;
  name: string;
  sector: string | null;
  closePrice: number | null;
  dividendYieldTtm: number | null;
  yieldPercentile: number | null;
  pePercentile: number | null;
  tradeDate: string | null;
}

export interface DashboardStats {
  totalStocks: number;
  avgDividendYield: number;
}

export interface DashboardData {
  stocks: StockDashboardItem[];
  stats: DashboardStats;
}

/**
 * Get dashboard data: all active stocks with their latest daily metrics
 * Sorted by yield_percentile descending (best opportunities first)
 */
export async function getDashboardData(): Promise<DashboardData> {
  // Subquery to get the latest trade_date for each symbol
  const latestDates = db
    .select({
      symbol: dailyMetrics.symbol,
      maxDate: sql<string>`MAX(${dailyMetrics.tradeDate})`.as("max_date"),
    })
    .from(dailyMetrics)
    .groupBy(dailyMetrics.symbol)
    .as("latest_dates");

  // Main query: join stock_meta with daily_metrics on latest date
  const result = await db
    .select({
      symbol: stockMeta.symbol,
      name: stockMeta.name,
      sector: stockMeta.sector,
      closePrice: dailyMetrics.closePrice,
      dividendYieldTtm: dailyMetrics.dividendYieldTtm,
      yieldPercentile: dailyMetrics.yieldPercentile,
      pePercentile: dailyMetrics.pePercentile,
      tradeDate: dailyMetrics.tradeDate,
    })
    .from(stockMeta)
    .leftJoin(
      dailyMetrics,
      sql`${stockMeta.symbol} = ${dailyMetrics.symbol}
          AND ${dailyMetrics.tradeDate} = (
            SELECT MAX(dm2.trade_date)
            FROM daily_metrics dm2
            WHERE dm2.symbol = ${stockMeta.symbol}
          )`
    )
    .where(eq(stockMeta.isActive, true))
    .orderBy(desc(dailyMetrics.yieldPercentile));

  // Convert Decimal to number for frontend
  const stocks: StockDashboardItem[] = result.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    closePrice: row.closePrice ? parseFloat(row.closePrice) : null,
    dividendYieldTtm: row.dividendYieldTtm ? parseFloat(row.dividendYieldTtm) : null,
    yieldPercentile: row.yieldPercentile ? parseFloat(row.yieldPercentile) : null,
    pePercentile: row.pePercentile ? parseFloat(row.pePercentile) : null,
    tradeDate: row.tradeDate,
  }));

  // Calculate stats
  const stocksWithYield = stocks.filter((s) => s.dividendYieldTtm !== null);
  const avgDividendYield =
    stocksWithYield.length > 0
      ? stocksWithYield.reduce((sum, s) => sum + (s.dividendYieldTtm || 0), 0) /
        stocksWithYield.length
      : 0;

  return {
    stocks,
    stats: {
      totalStocks: stocks.length,
      avgDividendYield: Math.round(avgDividendYield * 100) / 100,
    },
  };
}
