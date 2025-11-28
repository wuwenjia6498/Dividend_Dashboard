/**
 * Stock Data Service
 * Handles fetching and storing stock data using Tushare API
 */

import { db } from "@/db";
import { dailyMetrics, quarterlyFinancials } from "@/db/schema";
import { getTushareClient } from "./tushare";
import { eq, and, gte, sql } from "drizzle-orm";

interface DailyDataResult {
  tradeDate: string;
  closePrice: number;
  marketCap: number;
  peTtm: number;
  pbTtm: number;
  dividendYieldTtm: number;
}

/**
 * Calculate percentile for a value within a historical dataset
 */
function calculatePercentile(value: number | null, historicalValues: (number | null)[]): number | null {
  if (value === null || value === undefined) return null;

  // Filter out null values
  const validValues = historicalValues.filter(v => v !== null && v !== undefined) as number[];

  if (validValues.length === 0) return null;

  // Sort ascending
  const sorted = [...validValues].sort((a, b) => a - b);

  // Find how many values are less than or equal to current value
  const countLessOrEqual = sorted.filter(v => v <= value).length;

  // Calculate percentile
  const percentile = (countLessOrEqual / sorted.length) * 100;

  return Math.round(percentile * 100) / 100; // Round to 2 decimal places
}

/**
 * Fetch and save latest data for a stock
 */
export async function fetchAndSaveLatestData(symbol: string): Promise<boolean> {
  try {
    const tushare = getTushareClient();
    const tsCode = tushare.convertToTsCode(symbol);

    console.log(`[StockDataService] Fetching latest data for ${symbol} (${tsCode})`);

    // Get latest trade date first
    const latestTradeDate = await tushare.getLatestTradeDate(tsCode);
    if (!latestTradeDate) {
      console.error(`[StockDataService] No trading data found for ${symbol}`);
      return false;
    }

    // Fetch daily basic data for the latest trade date
    const dailyData = await tushare.fetchDailyBasic({
      ts_code: tsCode,
      trade_date: latestTradeDate,
    });

    if (dailyData.length === 0) {
      console.error(`[StockDataService] No data for ${symbol} on ${latestTradeDate}`);
      return false;
    }

    const data = dailyData[0];

    // Get historical data for percentile calculation (past 5 years)
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const historicalData = await tushare.fetchDailyBasic({
      ts_code: tsCode,
      start_date: tushare.formatDate(fiveYearsAgo),
      end_date: latestTradeDate,
    });

    // Calculate percentiles
    const peValues = historicalData.map(d => d.pe_ttm);
    const pbValues = historicalData.map(d => d.pb);
    const yieldValues = historicalData.map(d => d.dv_ttm);

    const pePercentile = calculatePercentile(data.pe_ttm, peValues);
    const pbPercentile = calculatePercentile(data.pb, pbValues);
    const yieldPercentile = calculatePercentile(data.dv_ttm, yieldValues);

    // Save to database
    await db
      .insert(dailyMetrics)
      .values({
        symbol,
        tradeDate: tushare.parseDate(data.trade_date).toISOString().split('T')[0],
        closePrice: data.close?.toString() || null,
        marketCap: data.total_mv?.toString() || null,
        peTtm: data.pe_ttm?.toString() || null,
        pbTtm: data.pb?.toString() || null,
        dividendYieldTtm: data.dv_ttm?.toString() || null,
        pePercentile: pePercentile?.toString() || null,
        pbPercentile: pbPercentile?.toString() || null,
        yieldPercentile: yieldPercentile?.toString() || null,
      })
      .onConflictDoUpdate({
        target: [dailyMetrics.symbol, dailyMetrics.tradeDate],
        set: {
          closePrice: data.close?.toString() || null,
          marketCap: data.total_mv?.toString() || null,
          peTtm: data.pe_ttm?.toString() || null,
          pbTtm: data.pb?.toString() || null,
          dividendYieldTtm: data.dv_ttm?.toString() || null,
          pePercentile: pePercentile?.toString() || null,
          pbPercentile: pbPercentile?.toString() || null,
          yieldPercentile: yieldPercentile?.toString() || null,
        },
      });

    console.log(`[StockDataService] Saved latest data for ${symbol} (${latestTradeDate})`);
    console.log(`  Price: ${data.close}, PE: ${data.pe_ttm}, PB: ${data.pb}, Yield: ${data.dv_ttm}%`);
    console.log(`  Percentiles - PE: ${pePercentile}, PB: ${pbPercentile}, Yield: ${yieldPercentile}`);

    return true;
  } catch (error) {
    console.error(`[StockDataService] Error fetching data for ${symbol}:`, error);
    return false;
  }
}

/**
 * Backfill historical data for a stock (past 5 years)
 */
export async function backfillHistoricalData(symbol: string): Promise<number> {
  try {
    const tushare = getTushareClient();
    const tsCode = tushare.convertToTsCode(symbol);

    console.log(`[StockDataService] Backfilling historical data for ${symbol}`);

    // Get data for past 5 years
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const startDate = tushare.formatDate(fiveYearsAgo);
    const endDate = tushare.formatDate(new Date());

    console.log(`  Fetching from ${startDate} to ${endDate}`);

    const historicalData = await tushare.fetchDailyBasic({
      ts_code: tsCode,
      start_date: startDate,
      end_date: endDate,
    });

    if (historicalData.length === 0) {
      console.error(`[StockDataService] No historical data found for ${symbol}`);
      return 0;
    }

    console.log(`  Fetched ${historicalData.length} records`);

    // Calculate percentiles for each data point
    const dataWithPercentiles = historicalData.map((data, index) => {
      // Use historical data up to current point for percentile calculation
      const historicalUpToCurrent = historicalData.slice(0, index + 1);

      const peValues = historicalUpToCurrent.map(d => d.pe_ttm);
      const pbValues = historicalUpToCurrent.map(d => d.pb);
      const yieldValues = historicalUpToCurrent.map(d => d.dv_ttm);

      const pePercentile = calculatePercentile(data.pe_ttm, peValues);
      const pbPercentile = calculatePercentile(data.pb, pbValues);
      const yieldPercentile = calculatePercentile(data.dv_ttm, yieldValues);

      return {
        symbol,
        tradeDate: tushare.parseDate(data.trade_date).toISOString().split('T')[0],
        closePrice: data.close?.toString() || null,
        marketCap: data.total_mv?.toString() || null,
        peTtm: data.pe_ttm?.toString() || null,
        pbTtm: data.pb?.toString() || null,
        dividendYieldTtm: data.dv_ttm?.toString() || null,
        pePercentile: pePercentile?.toString() || null,
        pbPercentile: pbPercentile?.toString() || null,
        yieldPercentile: yieldPercentile?.toString() || null,
      };
    });

    // Batch insert/update (limit to 500 records per batch to avoid timeouts)
    const batchSize = 500;
    let totalSaved = 0;

    for (let i = 0; i < dataWithPercentiles.length; i += batchSize) {
      const batch = dataWithPercentiles.slice(i, i + batchSize);

      for (const record of batch) {
        await db
          .insert(dailyMetrics)
          .values(record)
          .onConflictDoUpdate({
            target: [dailyMetrics.symbol, dailyMetrics.tradeDate],
            set: {
              closePrice: record.closePrice,
              marketCap: record.marketCap,
              peTtm: record.peTtm,
              pbTtm: record.pbTtm,
              dividendYieldTtm: record.dividendYieldTtm,
              pePercentile: record.pePercentile,
              pbPercentile: record.pbPercentile,
              yieldPercentile: record.yieldPercentile,
            },
          });
      }

      totalSaved += batch.length;
      console.log(`  Saved ${totalSaved}/${dataWithPercentiles.length} records`);
    }

    console.log(`[StockDataService] Backfill complete for ${symbol}: ${totalSaved} records`);
    return totalSaved;

  } catch (error) {
    console.error(`[StockDataService] Error backfilling data for ${symbol}:`, error);
    throw error;
  }
}
