# Vercel 部署指南

## 问题诊断

之前在 Vercel 部署后无法添加股票和回填数据的原因:
- Vercel serverless 环境无法执行 Python 脚本
- 原代码使用 `exec()` 调用 Python 脚本获取数据

## 解决方案

已将所有数据获取逻辑迁移到 TypeScript:

### 新增文件:
1. **`frontend/lib/tushare.ts`** - Tushare API 客户端
2. **`frontend/lib/stockDataService.ts`** - 数据服务(获取和保存股票数据)
3. **`vercel.json`** - Vercel 配置(设置函数超时为 60 秒)

### 修改文件:
1. **`frontend/app/actions/addStock.ts`** - 移除 Python 脚本调用,使用 TypeScript 服务
2. **`frontend/app/actions/backfillStock.ts`** - 移除 Python 脚本调用,使用 TypeScript 服务
3. **`frontend/components/StockCharts.tsx`** - 修复 SSR 图表渲染问题

## 部署步骤

### 1. 设置环境变量

在 Vercel 项目设置中添加以下环境变量:

```bash
DATABASE_URL=your_postgres_connection_string
TUSHARE_TOKEN=your_tushare_token
```

**重要**: 确保数据库可以从外网访问(Vercel 需要连接到数据库)

### 2. 部署项目

```bash
# 如果还没有连接到 Vercel
cd frontend
vercel

# 或者通过 Git 自动部署
git add .
git commit -m "Fix Vercel deployment: migrate Python to TypeScript"
git push
```

### 3. 验证部署

部署成功后,测试以下功能:
- ✅ 添加新股票
- ✅ 回填历史数据
- ✅ 查看图表(无 SSR 错误)

## 性能限制

### Hobby 计划:
- 函数超时: 10 秒(可能不够回填 5 年数据)
- 建议: 升级到 Pro 计划或减少历史数据年限

### Pro 计划:
- 函数超时: 60 秒
- 应该足够回填 5 年历史数据

## 如果回填超时

如果回填数据超时,有以下解决方案:

### 方案 1: 减少历史数据年限
编辑 `frontend/lib/stockDataService.ts:142`:
```typescript
// 从 5 年改为 2 年
fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 2);
```

### 方案 2: 使用批处理
保持使用 Python 脚本进行初始数据回填(本地运行):
```bash
python scripts/backfill_single_stock.py --symbol 600036
```

然后只在 Vercel 上进行增量更新。

## 数据库建议

推荐使用支持外网访问的 PostgreSQL 服务:
- **Vercel Postgres** (推荐,与 Vercel 集成最好)
- **Supabase** (免费套餐,性能好)
- **Railway** (简单易用)
- **Neon** (serverless PostgreSQL)

## 定时任务

如需每日自动更新数据,可使用 Vercel Cron Jobs:

创建 `frontend/app/api/cron/route.ts`:
```typescript
export async function GET(request: Request) {
  // 每日更新所有股票数据
  // 实现逻辑...
}
```

在 `vercel.json` 中配置:
```json
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 18 * * 1-5"
  }]
}
```

## 故障排查

### 问题 1: TUSHARE_TOKEN 未设置
错误: `TUSHARE_TOKEN is required`
解决: 在 Vercel 环境变量中添加 `TUSHARE_TOKEN`

### 问题 2: 数据库连接失败
错误: `connection refused`
解决:
- 检查 `DATABASE_URL` 是否正确
- 确保数据库允许外网访问
- 检查防火墙规则

### 问题 3: 函数超时
错误: `Function execution timeout`
解决:
- 升级到 Pro 计划(60 秒超时)
- 或减少历史数据年限

### 问题 4: 图表不显示
错误: `width(-1) and height(-1)`
解决: 已在 `StockCharts.tsx` 中修复,使用客户端挂载检测

## 本地开发

本地开发时仍可使用 Python 脚本:
```bash
# 更新所有股票
python scripts/update_data.py

# 回填单个股票
python scripts/backfill_single_stock.py --symbol 600036
```

TypeScript 实现和 Python 脚本可以共存,互不影响。
