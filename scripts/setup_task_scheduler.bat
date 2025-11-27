@echo off
REM ============================================================
REM Setup Windows Task Scheduler for Dividend Dashboard
REM This script creates a scheduled task to run daily at 4:00 PM
REM IMPORTANT: Must run as Administrator
REM ============================================================

echo ============================================================
echo Dividend Dashboard - Task Scheduler Setup
echo ============================================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script requires Administrator privileges.
    echo Please right-click and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo [OK] Running with Administrator privileges
echo.

REM Get the full path to scheduled_update.bat
set SCRIPT_DIR=%~dp0
set BATCH_FILE=%SCRIPT_DIR%scheduled_update.bat

REM Verify the batch file exists
if not exist "%BATCH_FILE%" (
    echo [ERROR] Cannot find scheduled_update.bat at:
    echo %BATCH_FILE%
    echo.
    pause
    exit /b 1
)

echo [OK] Found update script at:
echo %BATCH_FILE%
echo.

REM Task configuration
set TASK_NAME=DividendDashboard_DailyUpdate
set TASK_TIME=16:00
set TASK_DESC=Daily stock data update for Dividend Dashboard (runs at 4:00 PM)

echo Creating scheduled task with the following settings:
echo   Task Name: %TASK_NAME%
echo   Schedule:  Daily at %TASK_TIME% (4:00 PM)
echo   Script:    %BATCH_FILE%
echo.

REM Delete existing task if it exists (to allow reconfiguration)
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorLevel% equ 0 (
    echo [INFO] Task already exists. Deleting old task...
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
    echo [OK] Old task deleted
    echo.
)

REM Create the scheduled task
echo Creating new task...
schtasks /create ^
    /tn "%TASK_NAME%" ^
    /tr "\"%BATCH_FILE%\"" ^
    /sc daily ^
    /st %TASK_TIME% ^
    /ru "SYSTEM" ^
    /rl HIGHEST ^
    /f

if %errorLevel% equ 0 (
    echo.
    echo ============================================================
    echo [SUCCESS] Task scheduler setup complete!
    echo ============================================================
    echo.
    echo The following task has been created:
    echo   Task Name: %TASK_NAME%
    echo   Schedule:  Daily at 4:00 PM
    echo   Action:    Run %BATCH_FILE%
    echo.
    echo The task will run automatically every day at 4:00 PM.
    echo Logs will be saved to: %SCRIPT_DIR%..\logs\
    echo.
    echo To view the task:
    echo   1. Open Task Scheduler (taskschd.msc)
    echo   2. Look for "%TASK_NAME%" in the task list
    echo.
    echo To run the task manually right now:
    echo   schtasks /run /tn "%TASK_NAME%"
    echo.
    echo To delete the task:
    echo   schtasks /delete /tn "%TASK_NAME%" /f
    echo.
) else (
    echo.
    echo ============================================================
    echo [ERROR] Failed to create scheduled task
    echo ============================================================
    echo.
    echo Error code: %errorLevel%
    echo Please check the error message above.
    echo.
)

pause
