@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo   温室 IoT 后端启动中...
echo ========================================
node src/app.js
pause
