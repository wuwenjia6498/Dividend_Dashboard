import { notFound } from "next/navigation";
import Link from "next/link";
import { Info } from "lucide-react";
import { getStockDetail } from "@/app/actions/getStockDetail";
import { getSignalStatus } from "@/lib/signals";
import { StockCharts } from "@/components/StockCharts";
import { LoadHistoricalData } from "@/components/LoadHistoricalData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Increase timeout for server actions (backfilling historical data)
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // 2 minutes

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export default async function StockDetailPage({ params }: PageProps) {
  const { symbol } = await params;
  const data = await getStockDetail(symbol);

  if (!data.info) {
    notFound();
  }

  const { info, history, financials, yieldPercentile80, yieldPercentile20, totalDataCount } = data;

  // Get latest metrics
  const latestMetric = history[history.length - 1];
  const signal = getSignalStatus(latestMetric?.yieldPercentile ?? null);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        {/* Back Button */}
        <div className="mb-6">
          <Link href="/">
            <Button variant="outline" size="sm">
              ← 返回首页
            </Button>
          </Link>
        </div>

        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{info.name}</h1>
                <Badge variant="outline" className="font-mono">
                  {info.symbol}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {info.sector || "未分类"}
              </p>
            </div>

            {/* Current Status */}
            <div className="flex items-center gap-6">
              {/* Current Price */}
              <div className="text-right">
                <p className="text-sm text-muted-foreground">当前价格</p>
                <p className="text-2xl font-bold">
                  {latestMetric?.closePrice
                    ? `¥${latestMetric.closePrice.toFixed(2)}`
                    : "-"}
                </p>
              </div>

              {/* Dividend Yield */}
              <div className="text-right">
                <p className="text-sm text-muted-foreground">股息率(TTM)</p>
                <p className="text-2xl font-bold text-orange-600">
                  {latestMetric?.dividendYieldTtm
                    ? `${latestMetric.dividendYieldTtm.toFixed(2)}%`
                    : "-"}
                </p>
              </div>

              {/* Signal Badge */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">估值状态</p>
                <Badge
                  variant={
                    signal.color === "green"
                      ? "default"
                      : signal.color === "red"
                      ? "destructive"
                      : "secondary"
                  }
                  className={`text-base px-4 py-1 ${
                    signal.color === "green"
                      ? "bg-green-500 hover:bg-green-600"
                      : signal.color === "yellow"
                      ? "bg-yellow-500 hover:bg-yellow-600 text-black"
                      : ""
                  }`}
                >
                  {signal.color === "green" && "🟢 "}
                  {signal.color === "red" && "🔴 "}
                  {signal.color === "yellow" && "🟡 "}
                  {signal.label}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  分位点:{" "}
                  {latestMetric?.yieldPercentile
                    ? `${latestMetric.yieldPercentile.toFixed(0)}%`
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Load Historical Data Prompt (if data is insufficient) */}
        {history.length > 0 && (
          <LoadHistoricalData
            symbol={info.symbol}
            stockName={info.name}
            currentDataCount={totalDataCount}
            displayedDataCount={history.length}
          />
        )}

        {/* Charts Section */}
        <div className="mb-8">
          <StockCharts
            history={history}
            yieldPercentile80={yieldPercentile80}
            yieldPercentile20={yieldPercentile20}
          />
        </div>

        {/* Financial Health Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">财务体检</h2>
          {financials ? (
            <TooltipProvider>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* ROE */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      ROE (TTM)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm leading-relaxed">
                            巴菲特最看重的指标，代表公司用股东的钱赚钱的能力。
                            <br />
                            🟢 优秀：长期 &gt; 15%
                            <br />
                            🔴 警惕：长期 &lt; 8%（可能不具备投资价值）
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {financials.roeTtm !== null
                        ? `${(financials.roeTtm * 100).toFixed(2)}%`
                        : "-"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {financials.roeTtm !== null && financials.roeTtm > 0.15
                        ? "✅ 优秀 (>15%)"
                        : financials.roeTtm !== null && financials.roeTtm > 0.1
                        ? "👍 良好 (>10%)"
                        : "⚠️ 一般"}
                    </p>
                  </CardContent>
                </Card>

                {/* Operating Cash Flow */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      经营现金流 (TTM)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm leading-relaxed">
                            企业的'造血能力'，反映主营业务产生现金的能力。
                            <br />
                            🟢 健康：正数且稳定增长
                            <br />
                            🔴 警惕：长期为负（说明主营业务无法产生足够现金，分红可能不可持续）
                            <br />
                            <span className="text-xs opacity-80">注：对重资产行业（如电力、交通），经营现金流比自由现金流更能反映真实的分红能力</span>
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${
                        financials.freeCashFlow !== null && financials.freeCashFlow < 0
                          ? "text-red-600"
                          : ""
                      }`}
                    >
                      {financials.freeCashFlow !== null
                        ? `${(financials.freeCashFlow / 1e8).toFixed(2)} 亿`
                        : "-"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {financials.freeCashFlow !== null && financials.freeCashFlow > 0
                        ? "✅ 现金流健康"
                        : "🔴 现金流为负，需警惕"}
                    </p>
                  </CardContent>
                </Card>

                {/* Payout Ratio */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      股息支付率 (TTM)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm leading-relaxed">
                            赚的钱有多少分给了股东。
                            <br />
                            🟢 舒适区：30% - 70%
                            <br />
                            🔴 风险区：&gt; 80%（说明透支了未来利润，面临削减分红的风险）
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${
                        financials.dividendPayoutRatio !== null &&
                        financials.dividendPayoutRatio > 1
                          ? "text-red-600"
                          : ""
                      }`}
                    >
                      {financials.dividendPayoutRatio !== null
                        ? `${(financials.dividendPayoutRatio * 100).toFixed(1)}%`
                        : "-"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {financials.dividendPayoutRatio !== null &&
                      financials.dividendPayoutRatio > 1
                        ? "🔴 支付率>100%，分红不可持续"
                        : financials.dividendPayoutRatio !== null &&
                          financials.dividendPayoutRatio > 0.7
                        ? "⚠️ 支付率较高"
                        : "✅ 支付率健康"}
                    </p>
                  </CardContent>
                </Card>

                {/* Debt Ratio */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      资产负债率
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm leading-relaxed">
                            衡量公司的杠杆风险。
                            <br />
                            🔴 警告：非金融类企业 &gt; 60% 意味着债务压力大，加息周期下利润会被利息吃掉，威胁分红安全。
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {financials.debtToAssetRatio !== null
                        ? `${(financials.debtToAssetRatio * 100).toFixed(1)}%`
                        : "-"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {financials.debtToAssetRatio !== null &&
                      financials.debtToAssetRatio < 0.6
                        ? "✅ 负债水平健康"
                        : "⚠️ 负债率较高"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TooltipProvider>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                暂无财务数据
              </CardContent>
            </Card>
          )}
        </div>

        {/* Growth Metrics */}
        {financials && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">成长指标</h2>
            <TooltipProvider>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      营收增速 (YoY)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm leading-relaxed">
                            分红增长的源动力。
                            <br />
                            🔴 陷阱：如果长期负增长，即使当前股息率高，也可能是'价值陷阱'（股价跌幅可能超过分红收益）。
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${
                        financials.revenueGrowthYoy !== null &&
                        financials.revenueGrowthYoy < 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {financials.revenueGrowthYoy !== null
                        ? `${(financials.revenueGrowthYoy * 100).toFixed(1)}%`
                        : "-"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                      净利润增速 (YoY)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-sm leading-relaxed">
                            分红增长的源动力。
                            <br />
                            🔴 陷阱：如果长期负增长，即使当前股息率高，也可能是'价值陷阱'（股价跌幅可能超过分红收益）。
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p
                      className={`text-2xl font-bold ${
                        financials.netProfitGrowthYoy !== null &&
                        financials.netProfitGrowthYoy < 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {financials.netProfitGrowthYoy !== null
                        ? `${(financials.netProfitGrowthYoy * 100).toFixed(1)}%`
                        : "-"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      毛利率
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {financials.grossMargin !== null
                        ? `${(financials.grossMargin * 100).toFixed(1)}%`
                        : "-"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TooltipProvider>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            数据更新时间: {latestMetric?.tradeDate || "暂无数据"}
            {financials && ` | 财报周期: ${financials.reportPeriod}`}
          </p>
        </div>
      </div>
    </div>
  );
}
