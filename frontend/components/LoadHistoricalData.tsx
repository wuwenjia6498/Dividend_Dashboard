"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { backfillSingleStock } from "@/app/actions/backfillStock";
import { checkBackfillProgress } from "@/app/actions/checkBackfillProgress";

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
  const [polling, setPolling] = useState(false);
  const [pollingSeconds, setPollingSeconds] = useState(0);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [progressData, setProgressData] = useState<{ addedCount: number; progressPercentage: number }>({
    addedCount: 0,
    progressPercentage: 0,
  });
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialCountRef = useRef(currentDataCount);
  const elapsedTimeRef = useRef(0); // Track elapsed time to avoid closure issues

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Start polling for backfill completion
  const startPolling = () => {
    setPolling(true);
    setPollingSeconds(0);
    setProgressData({ addedCount: 0, progressPercentage: 0 });
    elapsedTimeRef.current = 0;

    // Start timer to show elapsed time
    timerIntervalRef.current = setInterval(() => {
      elapsedTimeRef.current += 1;
      setPollingSeconds(elapsedTimeRef.current);
    }, 1000);

    // Poll every 3 seconds to check if backfill is complete
    const checkProgress = async () => {
      try {
        const progress = await checkBackfillProgress(symbol, initialCountRef.current);

        console.log(`[LoadHistorical] Progress check: ${progress.addedCount} added, ${progress.currentCount} total, complete: ${progress.isComplete}`);

        // Update progress data for real-time display
        setProgressData({
          addedCount: progress.addedCount,
          progressPercentage: progress.progressPercentage,
        });

        if (progress.isComplete) {
          // Backfill complete! Stop polling and reload
          console.log('[LoadHistorical] Backfill detected as complete, reloading page...');
          stopPolling();
          setMessage({
            type: "success",
            text: `✅ 历史数据回填完成！已加载 ${progress.currentCount} 条记录（新增 ${progress.addedCount} 条）。页面即将刷新...`,
          });

          // Force reload with cache bypass
          setTimeout(() => {
            console.log('[LoadHistorical] Executing page reload...');
            window.location.href = window.location.href;
          }, 1500);
          return; // Stop further checks
        }

        // Check timeout using ref instead of state
        if (elapsedTimeRef.current >= 180) {
          // Timeout after 3 minutes
          console.log('[LoadHistorical] Polling timeout reached');
          stopPolling();
          setMessage({
            type: "info",
            text: `回填任务仍在进行中（已新增 ${progress.addedCount} 条），请稍后手动刷新页面查看结果。`,
          });
        }
      } catch (error) {
        console.error("Error checking backfill progress:", error);
      }
    };

    // Check immediately, then every 3 seconds
    checkProgress();
    pollingIntervalRef.current = setInterval(checkProgress, 3000);
  };

  const stopPolling = () => {
    setPolling(false);
    setLoading(false);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    elapsedTimeRef.current = 0;
  };

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
        // Check if this is local execution (has recordCount) or serverless (no recordCount)
        if (result.recordCount) {
          // Local execution - immediate result
          setMessage({
            type: "success",
            text: `${result.message}！页面将在3秒后刷新...`,
          });

          setTimeout(() => {
            window.location.href = window.location.href;
          }, 2000);
        } else {
          // Serverless execution - start polling
          setMessage({
            type: "info",
            text: "正在后台加载历史数据，预计需要 1-2 分钟...",
          });
          startPolling();
        }
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
              为了更准确的分位点计算和完整的历史趋势分析，建议加载完整的5年历史数据。
            </p>

            {message && (
              <div
                className={`mb-3 p-3 rounded-md text-sm ${
                  message.type === "success"
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : message.type === "error"
                    ? "bg-red-100 text-red-800 border border-red-200"
                    : "bg-blue-100 text-blue-800 border border-blue-200"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* Progress indicator for polling */}
            {polling && (
              <div className="mb-3 space-y-2">
                <div className="flex items-center justify-between text-sm text-blue-700">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4 animate-pulse" />
                    正在加载历史数据...
                  </span>
                  <span className="font-mono">
                    {Math.floor(pollingSeconds / 60)}:{String(pollingSeconds % 60).padStart(2, "0")}
                  </span>
                </div>
                <Progress
                  value={progressData.progressPercentage}
                  className="h-2"
                />
                <div className="flex items-center justify-between text-xs text-blue-600">
                  <span>
                    {progressData.addedCount > 0
                      ? `已新增 ${progressData.addedCount} 条记录`
                      : "正在连接数据源..."}
                  </span>
                  <span>
                    {progressData.progressPercentage > 0
                      ? `${Math.round(progressData.progressPercentage)}%`
                      : "0%"}
                  </span>
                </div>
                <p className="text-xs text-blue-600">
                  每 3 秒自动检查一次，完成后将自动刷新页面
                </p>
              </div>
            )}

            <Button
              onClick={handleLoadData}
              disabled={loading || polling}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading || polling ? (
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
