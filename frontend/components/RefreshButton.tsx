"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { triggerPipeline } from "@/app/actions/triggerPipeline";
import { toast } from "sonner";

/**
 * RefreshButton Component
 * Triggers the GitHub Actions workflow to update stock data remotely
 *
 * Features:
 * - Shows loading state with spinning icon when clicked
 * - Calls triggerPipeline() Server Action to trigger GitHub workflow
 * - Displays toast notification with instructions (data will be ready in ~2 minutes)
 * - Disables button for 30 seconds after click to prevent spam
 */
export function RefreshButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  const handleRefresh = async () => {
    // Prevent multiple clicks
    if (isLoading || isDisabled) return;

    setIsLoading(true);
    setIsDisabled(true);

    try {
      // Call the server action to trigger GitHub workflow
      const result = await triggerPipeline();

      if (result.success) {
        // Show success toast with instructions
        toast.success("更新指令已发送！", {
          description: "脚本正在云端运行，请约 2 分钟后刷新页面查看结果。",
          duration: 5000, // Show for 5 seconds
        });
      } else {
        // Show error toast
        toast.error("触发更新失败", {
          description: result.message,
          duration: 5000,
        });
      }
    } catch (error: any) {
      console.error("[RefreshButton] Error:", error);
      toast.error("操作失败", {
        description: "网络错误或服务器异常，请稍后重试。",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);

      // Keep button disabled for 30 seconds to prevent spam
      setTimeout(() => {
        setIsDisabled(false);
      }, 30000); // 30 seconds
    }
  };

  return (
    <Button
      onClick={handleRefresh}
      disabled={isDisabled}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <RefreshCw
        className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
      />
      {isLoading ? "更新中..." : "刷新数据"}
    </Button>
  );
}
