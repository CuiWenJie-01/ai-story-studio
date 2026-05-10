@echo off
chcp 65001 >nul
echo 正在启动漫剧生成器桌面版...
echo.

:: 启动后端服务
start "Manju Server" cmd /k "cd /d %~dp0 && node src-electron/server.js"

:: 等待后端启动
timeout /t 2 /nobreak >nul

:: 启动前端开发服务器
start "Manju Web" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo 服务已启动！
echo 后端 API: http://localhost:3001
echo 前端页面: http://localhost:5173
echo.
pause
