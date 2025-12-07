# 任务：新增“股票排序切换”功能 (Sort Feature)

## 背景
目前首页股票列表默认强制按照 **“股息率分位点”** (Percentile) 从高到低排序。
用户希望能提供选项，允许按照 **“绝对股息率”** (Dividend Yield) 从高到低排序，以便直观查看当前收益率最高的股票。

## 目标
在首页 (`app/page.tsx`) 增加一个排序控制器，并实现动态排序逻辑。

## 实现步骤

### 1. 状态管理
在 `DashboardPage` 组件中引入排序状态：
- 定义类型：`type SortOption = 'percentile' | 'yield';`
- 新增状态：`const [sortBy, setSortBy] = useState<SortOption>('percentile');`

### 2. 排序逻辑实现
在渲染列表之前，基于 `stocks` 数据派生出一个 `sortedStocks` 数组。
- **当 sortBy === 'percentile' (默认)：**
    - 按 `yield_percentile` 字段降序排列 (DESC)。
    - 注意：处理 null 值（视为 0）。
- **当 sortBy === 'yield'：**
    - 按 `dividend_yield_ttm` 字段降序排列 (DESC)。
    - 注意：处理 null 值（视为 0）。

*注意：必须使用 `[...stocks].sort()` 创建副本，避免直接修改原数组导致渲染问题。*

### 3. UI 实现 (Shadcn UI Select)
在页面顶部的操作栏区域（建议在 `AddStockDialog` 或 `RefreshButton` 附近），添加一个 `Select` 下拉菜单。

- **组件引用：**
  请使用 `@/components/ui/select` 中的组件 (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`)。

- **UI 布局建议：**
  - 宽度：`w-[180px]`。
  - 放在右上角功能区，作为一个独立的控件。
  - 建议添加一个 `ArrowUpDown` (lucide-react) 图标在 SelectTrigger 内部或左侧，以指示这是排序功能。

- **选项配置：**
  - 选项 1：**按性价比排序 (分位点)** —— 对应 value `percentile`
  - 选项 2：**按股息率排序 (绝对值)** —— 对应 value `yield`

### 4. 交互细节
- 切换选项后，列表应立即重新排序。
- **关键点：** 确保之前的“高亮新股票”功能 (`highlightedSymbol`) 在排序变化后依然有效（DOM ID 不变，滚动逻辑不受影响）。

## 代码要求
- 直接修改 `app/page.tsx`。
- 保持 TypeScript 类型安全。
- 确保 UI 风格与现有的 Shadcn UI 保持一致。