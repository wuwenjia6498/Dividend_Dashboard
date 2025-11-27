# Test and run the scheduled task
# This script checks if the task exists and runs it immediately

$taskName = "DividendDashboard_DailyUpdate"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Testing Scheduled Task: $taskName" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# Check if task exists
Write-Host "Checking if task exists..." -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($null -eq $task) {
    Write-Host "[ERROR] Task '$taskName' not found!" -ForegroundColor Red
    Write-Host "`nPlease run 'setup_task_scheduler.bat' as Administrator first.`n" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Task found!`n" -ForegroundColor Green

# Display task information
Write-Host "Task Information:" -ForegroundColor Cyan
Write-Host "  Name:        $($task.TaskName)" -ForegroundColor White
Write-Host "  State:       $($task.State)" -ForegroundColor White
Write-Host "  Last Run:    $($task.LastRunTime)" -ForegroundColor White
Write-Host "  Next Run:    $($task.NextRunTime)" -ForegroundColor White
Write-Host "  Last Result: $($task.LastTaskResult)`n" -ForegroundColor White

# Ask if user wants to run the task now
Write-Host "Do you want to run the task immediately? (Y/N): " -ForegroundColor Yellow -NoNewline
$response = Read-Host

if ($response -eq 'Y' -or $response -eq 'y') {
    Write-Host "`nRunning task..." -ForegroundColor Yellow
    Start-ScheduledTask -TaskName $taskName

    Write-Host "[OK] Task started!`n" -ForegroundColor Green
    Write-Host "Waiting 3 seconds for task to initialize..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3

    # Check task status
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
    Write-Host "`nTask Status:" -ForegroundColor Cyan
    Write-Host "  Last Run:    $($taskInfo.LastRunTime)" -ForegroundColor White
    Write-Host "  Last Result: $($taskInfo.LastTaskResult)" -ForegroundColor White

    # Show logs directory
    $logsPath = Join-Path $PSScriptRoot "..\logs"
    if (Test-Path $logsPath) {
        Write-Host "`nRecent Log Files:" -ForegroundColor Cyan
        Get-ChildItem $logsPath -Filter "update_*.log" |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 5 |
            ForEach-Object {
                Write-Host "  $($_.Name) - $($_.LastWriteTime)" -ForegroundColor White
            }

        Write-Host "`nTo view the latest log, run:" -ForegroundColor Yellow
        $latestLog = Get-ChildItem $logsPath -Filter "update_*.log" |
                     Sort-Object LastWriteTime -Descending |
                     Select-Object -First 1
        Write-Host "  notepad `"$($latestLog.FullName)`"`n" -ForegroundColor Green
    }
} else {
    Write-Host "`nTask not run. Exiting.`n" -ForegroundColor Yellow
}

Write-Host "============================================================`n" -ForegroundColor Cyan
