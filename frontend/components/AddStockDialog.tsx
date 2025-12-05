"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchStocks, SearchResult } from "@/app/actions/searchMarket";
import { addNewStock } from "@/app/actions/addStock";
import { triggerPipeline } from "@/app/actions/triggerPipeline";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AddStockDialogProps {
  onStockAdded?: (symbol: string) => void;
}

export function AddStockDialog({ onStockAdded }: AddStockDialogProps = {}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"input" | "submitting" | "success">("input");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search state
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [addedStockSymbol, setAddedStockSymbol] = useState<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length === 0) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchStocks(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setSearching(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectStock = (stock: SearchResult) => {
    setSelectedStock(stock);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleSubmit = async () => {
    if (!selectedStock) {
      setMessage({ type: "error", text: "请先选择一只股票" });
      return;
    }

    setStep("submitting");
    setMessage(null);

    try {
      const result = await addNewStock(
        selectedStock.symbol,
        selectedStock.name,
        selectedStock.sector || undefined
      );

      if (result.success) {
        // Save the added stock symbol for callback
        setAddedStockSymbol(selectedStock.symbol);

        // Switch to success view instead of closing dialog
        setStep("success");

        // Trigger single stock data update in the background
        triggerPipeline(selectedStock.symbol).then((pipelineResult) => {
          if (!pipelineResult.success) {
            console.warn("Failed to trigger pipeline:", pipelineResult.message);
          }
        }).catch((error) => {
          console.error("Failed to trigger pipeline:", error);
        });
      } else {
        setMessage({ type: "error", text: result.message });
        setStep("input");
      }
    } catch (error) {
      setMessage({ type: "error", text: "添加失败，请稍后重试" });
      setStep("input");
    }
  };

  const resetDialog = () => {
    setStep("input");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedStock(null);
    setMessage(null);
    setAddedStockSymbol(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (step !== "submitting") {
      setOpen(newOpen);
      if (!newOpen) {
        resetDialog();
      }
    }
  };

  const handleConfirm = () => {
    // Call the callback with the added stock symbol before closing
    if (addedStockSymbol && onStockAdded) {
      onStockAdded(addedStockSymbol);
    }
    setOpen(false);
    resetDialog();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          添加股票
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        {step === "success" ? (
          // Success View
          <>
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-6">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <div className="space-y-3">
                <h2 className="text-xl font-bold">股票添加成功！</h2>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
                  后台数据同步任务已触发。
                  <br />
                  由于涉及 Tushare 接口数据清洗与指标计算，
                  <br />
                  <span className="font-semibold">请耐心等待约 1-2 分钟</span>。
                  <br />
                  数据同步完成后将自动出现在列表中，无需手动刷新。
                </p>
              </div>
              <Button onClick={handleConfirm} className="w-full">
                我知道了
              </Button>
            </div>
          </>
        ) : (
          // Input View
          <>
            <DialogHeader>
              <DialogTitle>添加新股票</DialogTitle>
              <DialogDescription>
                搜索并选择要添加到追踪池的股票。添加后会自动获取最新数据（最多等待90秒），完整历史数据需要单独回填。
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* Selected Stock Display */}
              {selectedStock ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-lg">
                          {selectedStock.symbol}
                        </span>
                        <span className="text-lg">{selectedStock.name}</span>
                      </div>
                      {selectedStock.sector && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {selectedStock.sector}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedStock(null)}
                      disabled={step === "submitting"}
                    >
                      重新选择
                    </Button>
                  </div>
                </div>
              ) : (
                /* Search Interface */
                <div className="space-y-2">
                  <Command className="rounded-lg border shadow-md">
                    <div className="flex items-center border-b px-3">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <input
                        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="输入股票代码或名称搜索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <CommandList>
                      {searching && (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          搜索中...
                        </div>
                      )}
                      {!searching && searchQuery.length > 0 && searchResults.length === 0 && (
                        <CommandEmpty>未找到匹配的股票</CommandEmpty>
                      )}
                      {!searching && searchResults.length > 0 && (
                        <CommandGroup>
                          {searchResults.map((stock) => (
                            <CommandItem
                              key={stock.symbol}
                              onSelect={() => handleSelectStock(stock)}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-semibold">
                                    {stock.symbol}
                                  </span>
                                  <span>{stock.name}</span>
                                  {stock.sector && (
                                    <span className="text-xs text-muted-foreground">
                                      {stock.sector}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                  <p className="text-xs text-muted-foreground">
                    提示：输入"平安"或"601318"等关键词搜索
                  </p>
                </div>
              )}

              {/* Message Display */}
              {message && (
                <div
                  className={cn(
                    "p-3 rounded-md text-sm",
                    message.type === "success"
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  )}
                >
                  {message.text}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={step === "submitting"}
              >
                取消
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={step === "submitting" || !selectedStock}
              >
                {step === "submitting" ? "正在获取数据，请稍候..." : "添加到追踪池"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
