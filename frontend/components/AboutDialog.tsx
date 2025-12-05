"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as DialogPrimitive from "@radix-ui/react-dialog";

/**
 * AboutDialog Component
 * 使用说明弹窗 - 完全自定义实现，确保在所有设备上都能正确居中显示
 */
export function AboutDialog() {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-gray-500 hover:text-gray-700">
          <HelpCircle className="h-4 w-4" />
          使用说明
        </Button>
      </DialogPrimitive.Trigger>
      
      <DialogPrimitive.Portal>
        {/* 遮罩层 */}
        <DialogPrimitive.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
        />
        
        {/* 弹窗内容 */}
        <DialogPrimitive.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 50,
            width: 'calc(100vw - 1rem)',
            maxWidth: '780px',
            maxHeight: '90vh',
            backgroundColor: 'var(--background)',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 标题栏 */}
          <div style={{ flexShrink: 0, paddingBottom: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              使用说明
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
              了解本项目的核心逻辑、信号含义以及风控规则
            </p>
          </div>

          {/* 可滚动内容区域 */}
          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingTop: '1rem', paddingBottom: '1rem' }}>
              {/* 核心设计理念 */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  核心设计理念
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: '1.75' }}>
                  本项目是一个结合<strong>"基本面排雷"</strong>与<strong>"量化择时"</strong>的投资辅助工具。
                  我们不预测短期股价涨跌，而是通过长期数据的统计规律，寻找<strong>"好价格"</strong>与<strong>"好资产"</strong>的交集。
                </p>
                <div style={{ backgroundColor: '#eff6ff', borderLeft: '4px solid #2563eb', padding: '0.75rem', borderRadius: '0.25rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1e3a8a' }}>
                    核心原则： <strong>"好资产"必须匹配"好价格"</strong>。只有基于安全边际的逆势布局，才是长期收益的保障。
                  </p>
                </div>
              </section>

              {/* 红绿灯信号系统 */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  🚦 红绿灯信号系统 (择时策略)
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: '1.75' }}>
                  基于过去 <strong>5 年 (约 1250 个交易日)</strong> 的历史股息率数据，计算当前估值所处的位置（分位点）：
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <li style={{ display: 'flex', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.125rem', flexShrink: 0 }}>🟢</span>
                    <div>
                      <strong style={{ color: '#15803d' }}>机会区间 (分位点 &gt; 80%)</strong>：<strong>"低价高息区"</strong>。
                      当前股息率高于历史上 80% 的时间。股价相对低估，具备较高的安全边际。
                    </div>
                  </li>
                  <li style={{ display: 'flex', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.125rem', flexShrink: 0 }}>🔴</span>
                    <div>
                      <strong style={{ color: '#dc2626' }}>风险区间 (分位点 &lt; 20%)</strong>：<strong>"高价低息区"</strong>。
                      当前股息率低于历史上 80% 的时间。股价可能透支未来增长，建议谨慎。
                    </div>
                  </li>
                  <li style={{ display: 'flex', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.125rem', flexShrink: 0 }}>🟡</span>
                    <div>
                      <strong style={{ color: '#ca8a04' }}>持有区间 (20% - 80%)</strong>：<strong>"合理估值区"</strong>。
                      股价处于正常波动范围。
                    </div>
                  </li>
                </ul>
              </section>

              {/* 股息率通道图解读 */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  📊 股息率通道图解读
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', lineHeight: '1.75' }}>
                  详情页的"股息率通道"将枯燥的百分比转化为直观的<strong>"价格跑道"</strong>：
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', listStyle: 'disc', paddingLeft: '1rem' }}>
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
              <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  🛡️ 现金流排雷规则 (核心风控)
                </h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                  <li>
                    <strong style={{ color: '#ea580c' }}>强制使用"经营现金流 (OCF)"：</strong>
                    <p style={{ color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                      我们<strong>不使用</strong>自由现金流 (FCF) 进行排雷。因为银行、运营商等高股息行业通常资本开支巨大导致 FCF 为负。
                      使用 OCF 能更真实地反映其造血能力。
                    </p>
                  </li>
                  <li>
                    <strong style={{ color: '#ea580c' }}>数据清洗：</strong>
                    <p style={{ color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                      剔除了异常尖刺，并针对<strong>除权除息日</strong>导致的 TTM 数据断层做了平滑处理。
                    </p>
                  </li>
                </ul>
              </section>

              {/* 数据更新机制 */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  ⚙️ 数据更新机制
                </h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem', listStyle: 'disc', paddingLeft: '1rem' }}>
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

          {/* 关闭按钮 */}
          <DialogPrimitive.Close
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              borderRadius: '0.25rem',
              opacity: 0.7,
              transition: 'opacity 0.2s',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
          >
            <X style={{ width: '1rem', height: '1rem' }} />
            <span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }}>
              Close
            </span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
