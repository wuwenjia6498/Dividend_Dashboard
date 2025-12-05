"use client";

import { useState } from "react";
import {
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * AboutDialog Component
 * Displays project documentation including core logic, signal meanings, and risk rules
 */
export function AboutDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-gray-500 hover:text-gray-700">
          <HelpCircle className="h-4 w-4" />
          使用说明
        </Button>
      </DialogTrigger>
      <DialogContent 
        className="max-w-[780px] max-h-[85vh] overflow-hidden flex flex-col about-dialog-content sm:max-w-[780px]"
        data-about-dialog="true"
        style={{
          maxWidth: '780px',
        }}
      >
        <DialogHeader className="shrink-0 pb-4 border-b">
          <DialogTitle className="text-2xl font-bold">使用说明</DialogTitle>
          <DialogDescription>
            了解本项目的核心逻辑、信号含义以及风控规则
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 pr-2">
          <div className="space-y-6 py-4">
            {/* 核心设计理念 */}
            <section className="space-y-3">
              <h3 className="text-lg font-semibold">
                核心设计理念
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                本项目是一个结合<strong>"基本面排雷"</strong>与<strong>"量化择时"</strong>的投资辅助工具。
                我们不预测短期股价涨跌，而是通过长期数据的统计规律，寻找<strong>"好价格"</strong>与<strong>"好资产"</strong>的交集。
              </p>
              <div className="bg-blue-50 border-l-4 border-blue-600 p-3 rounded">
                <p className="text-sm font-medium text-blue-900">
                  核心原则： <strong>"好资产"必须匹配"好价格"</strong>。只有基于安全边际的逆势布局，才是长期收益的保障。
                </p>
              </div>
            </section>

            {/* 红绿灯信号系统 */}
            <section className="space-y-3">
              <h3 className="text-lg font-semibold">
                🚦 红绿灯信号系统 (择时策略)
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                基于过去 <strong>5 年 (约 1250 个交易日)</strong> 的历史股息率数据，计算当前估值所处的位置（分位点）：
              </p>
              <ul className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="text-lg flex-shrink-0">🟢</span>
                  <div>
                    <strong className="text-green-700">机会区间 (分位点 &gt; 80%)</strong>：<strong>"低价高息区"</strong>。
                    当前股息率高于历史上 80% 的时间。股价相对低估，具备较高的安全边际。
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="text-lg flex-shrink-0">🔴</span>
                  <div>
                    <strong className="text-red-700">风险区间 (分位点 &lt; 20%)</strong>：<strong>"高价低息区"</strong>。
                    当前股息率低于历史上 80% 的时间。股价可能透支未来增长，建议谨慎。
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="text-lg flex-shrink-0">🟡</span>
                  <div>
                    <strong className="text-yellow-700">持有区间 (20% - 80%)</strong>：<strong>"合理估值区"</strong>。
                    股价处于正常波动范围。
                  </div>
                </li>
              </ul>
            </section>

            {/* 股息率通道图解读 */}
            <section className="space-y-3">
              <h3 className="text-lg font-semibold">
                📊 股息率通道图解读
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                详情页的"股息率通道"将枯燥的百分比转化为直观的<strong>"价格跑道"</strong>：
              </p>
              <ul className="space-y-2 text-sm list-disc list-inside pl-4">
                <li>
                  <strong>下轨 (机会线)：</strong> 对应 <strong>80% 分位点</strong> 的理论股价。实际股价跌破此线 = 极具吸引力。
                </li>
                <li>
                  <strong>上轨 (风险线)：</strong> 对应 <strong>20% 分位点</strong> 的理论股价。实际股价突破此线 = 缺乏吸引力。
                </li>
                <li>
                  <strong>使用逻辑：</strong> 股价在通道<strong>下方</strong>为低估；在<strong>中间</strong>为合理；在<strong>上方</strong>为高估。
                </li>
              </ul>
            </section>

            {/* 现金流排雷规则 */}
            <section className="space-y-3">
              <h3 className="text-lg font-semibold">
                🛡️ 现金流排雷规则 (核心风控)
              </h3>
              <ul className="space-y-3 text-sm">
                <li>
                  <strong className="text-orange-700">强制使用"经营现金流 (OCF)"：</strong>
                  <p className="text-muted-foreground mt-1">
                    我们<strong>不使用</strong>自由现金流 (FCF) 进行排雷。因为银行、运营商等高股息行业通常资本开支巨大导致 FCF 为负。
                    使用 OCF 能更真实地反映其造血能力。
                  </p>
                </li>
                <li>
                  <strong className="text-orange-700">数据清洗：</strong>
                  <p className="text-muted-foreground mt-1">
                    剔除了异常尖刺，并针对<strong>除权除息日</strong>导致的 TTM 数据断层做了平滑处理。
                  </p>
                </li>
              </ul>
            </section>

            {/* 数据更新机制 */}
            <section className="space-y-3">
              <h3 className="text-lg font-semibold">
                ⚙️ 数据更新机制
              </h3>
              <ul className="space-y-2 text-sm list-disc list-inside pl-4">
                <li>
                  <strong>每日自动更新：</strong> 每晚 <strong>20:00</strong> 自动运行。
                </li>
                <li>
                  <strong>新增股票：</strong> 添加后立即触发后台单只抓取，等待 <strong>1-2 分钟</strong> 后自动显示并高亮，<strong>无需手动刷新</strong>。
                </li>
              </ul>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
