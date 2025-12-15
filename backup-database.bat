@echo off
echo 旭租电脑租赁系统 - 数据库备份工具
echo =====================================
echo.

:: 检查Node.js是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo 错误: 未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

:: 执行备份脚本
echo 正在备份数据库，请稍候...
node backup-database-simple.js

echo.
echo 备份完成！请检查database-backups文件夹中的备份文件。
pause