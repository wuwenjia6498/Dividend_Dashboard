# 高股息与基本面量化投资看板

High Dividend & Fundamental Monitor - 一个自动化的投资辅助工具，帮助管理高股息股票池。

## 📋 项目简介

本项目旨在构建一个自动化的投资辅助工具，核心功能包括：

1. **选股（基本面）：** 不仅看股息率，还要看 ROE、自由现金流等指标，确保分红可持续
2. **择时（估值）：** 基于股息率和 PE/PB 的历史分位点，自动判断当前价格是"低估"还是"高估"
3. **自动化：** 每日自动抓取 A 股数据，更新指标，无需人工维护

## 🏗️ 项目结构

```
Dividend_Dashboard/
├── frontend/          # Next.js 前端应用
│   ├── app/          # Next.js App Router 页面和路由
│   ├── components/   # React 组件
│   ├── db/           # 数据库 Schema 和连接
│   └── package.json  # 前端依赖配置
├── scripts/          # Python ETL 脚本
│   ├── update_data.py        # 数据更新脚本
│   ├── sync_market.py        # 市场数据同步
│   └── fetch_financials.py   # 财务数据抓取
├── db/               # 数据库迁移文件
└── package.json      # 工作区根配置（便捷脚本）
```

## 🚀 快速开始

### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL 数据库
- Python 3.x (用于 ETL 脚本)

### 安装依赖

```bash
# 安装前端依赖
npm run install:frontend

# 或直接进入 frontend 目录
cd frontend
npm install
```

### 开发环境

```bash
# 在根目录运行（会自动切换到 frontend 目录）
npm run dev

# 或直接在 frontend 目录运行
cd frontend
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

### 数据库操作

```bash
# 生成数据库迁移
npm run db:generate

# 执行数据库迁移
npm run db:migrate

# 推送 Schema 变更
npm run db:push

# 打开 Drizzle Studio（数据库可视化工具）
npm run db:studio
```

## 🛠️ 技术栈

- **前端：** Next.js 16 (App Router), TypeScript, Tailwind CSS, Shadcn UI, Recharts
- **后端/API：** Next.js Server Actions
- **数据库：** PostgreSQL
- **ORM：** Drizzle ORM
- **数据处理：** Python + Tushare Pro API

## 📊 核心功能

### 信号系统

前端展示类似"红绿灯"的信号：

- 🟢 **机会区 (Buy):** 股息率分位点 > 80% 且基本面健康（自由现金流 > 0）
- 🔴 **风险区 (Sell):** 股息率分位点 < 20% 或支付率 > 100%（不可持续）
- 🟡 **持有区 (Hold):** 介于两者之间

### 数据更新

#### 手动更新

使用 Python 脚本从 Tushare Pro 抓取数据：

```bash
# 更新日频数据
python scripts/update_data.py

# 同步市场数据
python scripts/sync_market.py

# 抓取财务数据
python scripts/fetch_financials.py
```

#### 自动定时更新（推荐）

配置 Windows 任务计划程序，每天下午 4:00 自动更新数据：

**一键配置（需要管理员权限）：**

1. 右键点击 `scripts/setup_task_scheduler.bat`
2. 选择 "以管理员身份运行"
3. 等待配置完成

**验证任务是否创建成功：**

```cmd
# 打开任务计划程序
taskschd.msc

# 或使用命令查询
schtasks /query /tn "DividendDashboard_DailyUpdate"
```

**立即测试运行：**

```cmd
schtasks /run /tn "DividendDashboard_DailyUpdate"
```

**查看运行日志：**

日志文件位于 `logs/update_YYYY-MM-DD_HHMM.log`，自动保留最近 30 天。

> 详细配置说明请查看 `scripts/SCHEDULER_SETUP.md`

## 📝 开发说明

- 前端代码位于 `frontend/` 目录
- Python ETL 脚本位于 `scripts/` 目录
- 数据库迁移文件位于 `db/migrations/` 目录
- 详细的项目需求请查看 `project_brief.md`

## 🔧 可用脚本

在根目录运行以下命令（会自动切换到 frontend 目录执行）：

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run start` - 启动生产服务器
- `npm run lint` - 运行代码检查
- `npm run db:*` - 数据库相关操作

## 📄 许可证

私有项目

