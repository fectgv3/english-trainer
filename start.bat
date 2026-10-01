@echo off
rem 一键启动：自动带上本机代理（按需修改地址/端口）
cd /d %~dp0
set "HTTP_PROXY=http://127.0.0.1:7897"
set "HTTPS_PROXY=http://127.0.0.1:7897"
set "NODE_USE_ENV_PROXY=1"
echo 启动高中英语 AI 训练场（代理: %HTTPS_PROXY%）...
echo 浏览器打开 http://localhost:5175
node server.mjs
