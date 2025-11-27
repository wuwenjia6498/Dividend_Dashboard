@echo off
REM ============================================================
REM Dividend Dashboard - Scheduled Data Update
REM This script runs daily at 4:00 PM to update stock data
REM ============================================================

REM Get script directory
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."

REM Set log directory
set LOG_DIR=%SCRIPT_DIR%..\logs
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM Generate log filename with timestamp
for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a%%b)
set LOG_FILE=%LOG_DIR%\update_%mydate%_%mytime%.log

REM Clear proxy environment variables
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=
set NO_PROXY=*
set no_proxy=*

echo ============================================================ > "%LOG_FILE%"
echo Dividend Dashboard - Scheduled Update >> "%LOG_FILE%"
echo Started at: %date% %time% >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

REM Run the update script and capture output
python "%SCRIPT_DIR%update_data.py" >> "%LOG_FILE%" 2>&1

echo. >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo Finished at: %date% %time% >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

REM Keep only last 30 days of logs
forfiles /p "%LOG_DIR%" /m "update_*.log" /d -30 /c "cmd /c del @path" 2>nul

exit /b 0
