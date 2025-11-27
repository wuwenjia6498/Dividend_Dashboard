"use client";

import { useState } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { backfillSingleStock } from "@/app/actions/backfillStock";

interface LoadHistoricalDataProps {
  symbol: string;
  stockName: string;
  currentDataCount: number;
  displayedDataCount: number;
}

export function LoadHistoricalData({
  symbol,
  stockName,
  currentDataCount,
  displayedDataCount
}: LoadHistoricalDataProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Only show prompt if:
  // 1. Displayed data (last 2 years) is insufficient (< 200 trading days ≈ 1 year)
  // OR
  // 2. Total data in DB is less than 500 records (< 2 years) AND displayed data < 400
  // This ensures we only show the prompt when charts can't display properly
  const shouldShow = displayedDataCount < 200 || (currentDataCount < 500 && displayedDataCount < 400);

  if (!shouldShow) {
    return null;
  }

  const handleLoadData = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const result = await backfillSingleStock(symbol);

      if (result.success) {
        setMessage({
          type: "success",
          text: `${result.message}！页面将在3秒后刷新...`,
        });

        // Reload page after 3 seconds to show new data
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        setMessage({
          type: "error",
          text: result.message,
        });
        setLoading(false);
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: "加载失败，请稍后重试",
      });
      setLoading(false);
    }
  };

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <TrendingUp className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              历史数据不足
            </h3>
            <p className="text-sm text-blue-700 mb-3">
              当前数据库中共有 {currentDataCount} 条历史记录，图表显示最近 {displayedDataCount} 条数据。
              为了更准确的分位点计算和完整的历史趋势分析，建议加载完整的5年历史数据（约需10-30秒）。
            </p>

            {message && (
              <div
                className={`mb-3 p-3 rounded-md text-sm ${
                  message.type === "success"
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-red-100 text-red-800 border border-red-200"
                }`}
              >
                {message.text}
              </div>
            )}

            <Button
              onClick={handleLoadData}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  加载中...
                </>
              ) : (
                <>
                  <TrendingUp className="mr-2 h-4 w-4" />
                  加载完整历史数据
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
