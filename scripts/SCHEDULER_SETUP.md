# 定时任务设置指南

## 快速开始

### 1. 自动配置（推荐）

**以管理员身份运行配置脚本：**

1. 右键点击 `setup_task_scheduler.bat`
2. 选择 "以管理员身份运行"
3. 等待配置完成

脚本会自动创建一个名为 `DividendDashboard_DailyUpdate` 的任务，每天下午 4:00 自动运行数据更新。

### 2. 验证任务是否创建成功

打开任务计划程序查看：

```cmd
taskschd.msc
```

在任务列表中查找 `DividendDashboard_DailyUpdate`。

## 常用操作

### 立即运行任务（测试）

```cmd
schtasks /run /tn "DividendDashboard_DailyUpdate"
```

### 查看任务详情

```cmd
schtasks /query /tn "DividendDashboard_DailyUpdate" /v /fo list
```

### 删除任务

```cmd
schtasks /delete /tn "DividendDashboard_DailyUpdate" /f
```

### 修改运行时间

如果要修改为其他时间（比如每天下午 5:00），重新运行 `setup_task_scheduler.bat` 并在脚本中修改 `TASK_TIME` 变量：

```batch
set TASK_TIME=17:00
```

## 任务配置说明

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 任务名称 | DividendDashboard_DailyUpdate | 在任务计划程序中显示的名称 |
| 运行时间 | 每天 16:00 | 下午 4:00（可修改） |
| 执行脚本 | scheduled_update.bat | 数据更新脚本 |
| 运行账户 | SYSTEM | 系统账户，无需登录即可运行 |
| 权限级别 | HIGHEST | 最高权限 |

## 日志查看

每次运行会生成日志文件，位置：

```
logs/update_YYYY-MM-DD_HHMM.log
```

日志会自动保留最近 30 天，旧日志会被自动清理。

### 查看最新日志

```cmd
cd logs
dir /od update_*.log
```

然后用文本编辑器打开最新的日志文件。

## 故障排查

### 问题 1: 提示"需要管理员权限"

**解决方法：** 右键点击脚本，选择"以管理员身份运行"

### 问题 2: 任务创建成功但没有运行

**检查步骤：**

1. 打开任务计划程序 (`taskschd.msc`)
2. 找到任务 `DividendDashboard_DailyUpdate`
3. 查看"上次运行结果"
4. 如果显示错误代码，检查：
   - Python 是否已安装
   - Tushare Token 是否配置
   - 数据库连接是否正常

### 问题 3: 手动运行正常，但定时运行失败

**可能原因：**
- 环境变量未正确设置
- Python 不在系统 PATH 中

**解决方法：**
在 `scheduled_update.bat` 中使用 Python 的完整路径：

```batch
"C:\Python3\python.exe" "%SCRIPT_DIR%update_data.py"
```

### 问题 4: 如何修改运行时间

1. 编辑 `setup_task_scheduler.bat`
2. 修改 `set TASK_TIME=16:00` 为你想要的时间（24小时制）
3. 重新以管理员身份运行脚本

## 手动配置（如果自动脚本失败）

如果自动配置脚本失败，可以手动创建任务：

1. 打开任务计划程序：按 `Win + R`，输入 `taskschd.msc`
2. 点击右侧"创建基本任务"
3. 名称填写：`DividendDashboard_DailyUpdate`
4. 触发器选择："每天"
5. 时间设置为：`16:00` (下午 4:00)
6. 操作选择："启动程序"
7. 程序/脚本浏览到：`H:\000-cursor学习\Dividend_Dashboard\scripts\scheduled_update.bat`
8. 完成创建

## 环境要求

- Windows 10/11 或 Windows Server
- 管理员权限
- Python 3.x 已安装
- PostgreSQL 数据库运行中
- Tushare Token 已配置（在 .env 文件中）

## 更多信息

- 任务计划程序官方文档：https://docs.microsoft.com/windows-server/administration/windows-commands/schtasks
- 项目完整文档：请参考 `project_brief.md`
