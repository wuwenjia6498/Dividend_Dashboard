"use server";

export interface TriggerPipelineResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Trigger the GitHub Actions workflow (daily_update.yml) to update stock data
 * This allows users to manually refresh data without waiting for the scheduled run
 */
export async function triggerPipeline(): Promise<TriggerPipelineResult> {
  try {
    // Get environment variables
    const githubToken = process.env.GITHUB_PAT;
    const githubOwner = process.env.GITHUB_OWNER || "wuwenjia6498";
    const githubRepo = process.env.GITHUB_REPO || "Dividend_Dashboard";

    // Validate required environment variables
    if (!githubToken) {
      console.error("[TriggerPipeline] Missing GITHUB_PAT environment variable");
      return {
        success: false,
        message: "服务器配置错误：缺少 GitHub 访问令牌",
        error: "MISSING_GITHUB_TOKEN",
      };
    }

    // GitHub API endpoint for workflow dispatch
    const apiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/daily_update.yml/dispatches`;

    console.log("=".repeat(60));
    console.log("[TriggerPipeline] Triggering GitHub Actions workflow");
    console.log(`[TriggerPipeline] API URL: ${apiUrl}`);
    console.log("=".repeat(60));

    // Make API request to trigger the workflow
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main", // Branch to run the workflow on
      }),
    });

    // Check if the request was successful
    if (!response.ok) {
      const errorText = await response.text();
      console.error("=".repeat(60));
      console.error(`[TriggerPipeline] GitHub API Error: ${response.status} ${response.statusText}`);
      console.error(`[TriggerPipeline] Response: ${errorText}`);
      console.error("=".repeat(60));

      // Provide user-friendly error messages
      if (response.status === 401) {
        return {
          success: false,
          message: "GitHub 认证失败：访问令牌无效或已过期",
          error: "GITHUB_AUTH_FAILED",
        };
      } else if (response.status === 404) {
        return {
          success: false,
          message: "未找到工作流文件：请确认 daily_update.yml 存在",
          error: "WORKFLOW_NOT_FOUND",
        };
      } else {
        return {
          success: false,
          message: `GitHub API 请求失败 (${response.status})`,
          error: "GITHUB_API_ERROR",
        };
      }
    }

    console.log("=".repeat(60));
    console.log("[TriggerPipeline] Workflow triggered successfully!");
    console.log("=".repeat(60));

    return {
      success: true,
      message: "数据更新指令已发送！GitHub Actions 正在云端运行脚本，预计 2-3 分钟后完成。",
    };

  } catch (error: any) {
    console.error("=".repeat(60));
    console.error("[TriggerPipeline] Unexpected error:", error);
    console.error("=".repeat(60));

    return {
      success: false,
      message: "触发更新失败：网络错误或服务器异常",
      error: "UNKNOWN_ERROR",
    };
  }
}
