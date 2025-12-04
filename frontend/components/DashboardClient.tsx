"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AddStockDialog } from "@/components/AddStockDialog";
import { StockActionsMenu } from "@/components/StockActionsMenu";
import { RefreshButton } from "@/components/RefreshButton";
import { getSignalStatus } from "@/lib/signals";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Stock {
  symbol: string;
  name: string;
  sector: string | null;
  closePrice: number | null;
  dividendYieldTtm: number | null;
  yieldPercentile: number | null;
  tradeDate: string | null;
}

interface Stats {
  totalStocks: number;
  avgDividendYield: number;
}

interface DashboardClientProps {
  stocks: Stock[];
  stats: Stats;
}

export function DashboardClient({ stocks, stats }: DashboardClientProps) {
  const router = useRouter();
  const [highlightedSymbol, setHighlightedSymbol] = useState<string | null>(null);
  const [waitingForSymbol, setWaitingForSymbol] = useState<string | null>(null);

  // Handle scrolling and highlighting when a stock is added
  useEffect(() => {
    if (!highlightedSymbol) return;

    // Small delay to ensure the DOM is updated after data refresh
    const scrollTimer = setTimeout(() => {
      const element = document.getElementById(`stock-row-${highlightedSymbol}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast.success("找到新添加的股票！", {
          description: `${highlightedSymbol} 已高亮显示`,
          duration: 3000,
        });
      }
    }, 500);

    // Clear highlight after 10 seconds
    const clearTimer = setTimeout(() => {
      setHighlightedSymbol(null);
    }, 10000);

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [highlightedSymbol]);

  // Check if waiting stock appears in the list with complete data (runs on stocks update)
  useEffect(() => {
    if (!waitingForSymbol) return;

    // Check if the stock we're waiting for now exists with complete data
    const stockWithData = stocks.find(s => s.symbol === waitingForSymbol);
    const hasCompleteData = stockWithData && stockWithData.closePrice !== null;

    if (hasCompleteData) {
      // Stock found with complete data! Trigger highlight and stop waiting
      setHighlightedSymbol(waitingForSymbol);
      setWaitingForSymbol(null);
      toast.dismiss(); // Dismiss the loading toast
    }
  }, [stocks, waitingForSymbol]);

  // Poll to refresh data while waiting for new stock
  useEffect(() => {
    if (!waitingForSymbol) return;

    let pollCount = 0;
    const maxPolls = 40; // 40 * 3s = 2 minutes max polling

    const pollInterval = setInterval(() => {
      pollCount++;

      if (pollCount >= maxPolls) {
        // Timeout - stop polling
        clearInterval(pollInterval);
        setWaitingForSymbol(null);
        toast.dismiss(); // Dismiss the loading toast
        toast.info("请手动刷新页面", {
          description: "数据同步时间较长，请稍后刷新页面查看新股票",
          duration: 5000,
        });
      } else {
        // Continue polling - refresh data
        router.refresh();
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [waitingForSymbol, router]);

  const handleStockAdded = (symbol: string) => {
    // Check if stock already exists with complete data
    const stockWithData = stocks.find(s => s.symbol === symbol);
    const hasCompleteData = stockWithData && stockWithData.closePrice !== null;

    if (hasCompleteData) {
      // Stock already in list with complete data - highlight immediately
      setHighlightedSymbol(symbol);
    } else {
      // Stock not yet in list or has incomplete data - start polling
      setWaitingForSymbol(symbol);
      toast.loading("等待数据同步...", {
        description: "正在等待新股票数据出现，请稍候",
        duration: 3000,
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              高股息投资看板
            </h1>
            <p className="text-muted-foreground mt-2">
              基于股息率分位点的量化选股系统
            </p>
          </div>
          <RefreshButton />
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">追踪股票数</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalStocks}</div>
              <p className="text-xs text-muted-foreground">当前监控列表</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">平均股息率</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.avgDividendYield.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">TTM 滚动股息率</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">机会区股票</CardTitle>
              <span className="text-lg">🟢</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stocks.filter((s) => (s.yieldPercentile ?? 0) > 80).length}
              </div>
              <p className="text-xs text-muted-foreground">分位点 &gt; 80%</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">风险区股票</CardTitle>
              <span className="text-lg">🔴</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stocks.filter((s) => (s.yieldPercentile ?? 100) < 20).length}
              </div>
              <p className="text-xs text-muted-foreground">分位点 &lt; 20%</p>
            </CardContent>
          </Card>
        </div>

        {/* Stock Table */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>股票池</CardTitle>
                <CardDescription>
                  按股息率分位点排序，机会最大的排在前面
                </CardDescription>
              </div>
              <AddStockDialog onStockAdded={handleStockAdded} />
            </div>
          </CardHeader>
          <CardContent>
            {stocks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg mb-2">暂无股票数据</p>
                <p className="text-sm">
                  请先运行 Python ETL 脚本获取数据
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">代码</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>行业</TableHead>
                    <TableHead className="text-right">现价</TableHead>
                    <TableHead className="text-right">股息率(TTM)</TableHead>
                    <TableHead className="text-right">股息率分位</TableHead>
                    <TableHead className="text-center">估值状态</TableHead>
                    <TableHead className="text-center w-[70px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stocks.map((stock) => {
                    const signal = getSignalStatus(stock.yieldPercentile);
                    const isHighlighted = highlightedSymbol === stock.symbol;

                    return (
                      <TableRow
                        key={stock.symbol}
                        id={`stock-row-${stock.symbol}`}
                        className={cn(
                          "cursor-pointer hover:bg-muted/50 transition-all duration-500",
                          isHighlighted && "ring-2 ring-primary bg-primary/10 relative z-10"
                        )}
                      >
                        <TableCell className="font-mono font-medium">
                          {stock.symbol}
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link
                            href={`/stock/${stock.symbol}`}
                            className="text-blue-600 hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {stock.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {stock.sector || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.closePrice !== null
                            ? `¥${stock.closePrice.toFixed(2)}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {stock.dividendYieldTtm !== null
                            ? `${stock.dividendYieldTtm.toFixed(2)}%`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {stock.yieldPercentile !== null
                            ? `${stock.yieldPercentile.toFixed(0)}%`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              signal.color === "green"
                                ? "default"
                                : signal.color === "red"
                                ? "destructive"
                                : "secondary"
                            }
                            className={
                              signal.color === "green"
                                ? "bg-green-500 hover:bg-green-600"
                                : signal.color === "yellow"
                                ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                                : ""
                            }
                          >
                            {signal.color === "green" && "🟢 "}
                            {signal.color === "red" && "🔴 "}
                            {signal.color === "yellow" && "🟡 "}
                            {signal.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <StockActionsMenu symbol={stock.symbol} name={stock.name} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            数据更新时间:{" "}
            {stocks[0]?.tradeDate || "暂无数据"}
          </p>
          <p className="mt-1">
            信号规则: 🟢 机会区 (分位点&gt;80%) | 🟡 持有区 | 🔴 风险区 (分位点&lt;20%)
          </p>
        </div>
      </div>
    </div>
  );
}
