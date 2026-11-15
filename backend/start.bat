@echo off
REM Double-click this file to start the TP.ai Assist backend.
REM Leave this window open while using the extension - closing it stops the backend.

cd /d "%~dp0"

if not exist node_modules (
    echo First-time setup: installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo.
        echo Something went wrong installing dependencies. Make sure Node.js is installed
        echo (https://nodejs.org - download the LTS version), then try again.
        pause
        exit /b 1
    )
)

if not exist .env (
    echo.
    echo Missing .env file. Copy .env.example to .env and fill in the real values first.
    pause
    exit /b 1
)

echo Starting TP.ai Assist backend on http://127.0.0.1:8000 ...
echo Keep this window open. Close it to stop the backend.
echo.
call npm start
pause
