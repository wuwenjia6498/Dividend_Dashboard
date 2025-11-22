@echo off
REM Dividend Dashboard - Data Update Runner
REM This script temporarily disables proxy for the Python process

echo ============================================================
echo Dividend Dashboard - Data Update Runner
echo Temporarily disabling proxy for this session...
echo ============================================================
echo.

REM Clear proxy environment variables for this session only
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=
set NO_PROXY=*
set no_proxy=*

REM Run the Python script
python "%~dp0update_data.py"

REM Pause to see the results
echo.
echo Press any key to exit...
pause >nul
