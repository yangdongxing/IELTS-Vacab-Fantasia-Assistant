#!/bin/bash
# 双击直接在 macOS 终端中启动 Siri 语音服务
cd "$(dirname "$0")"
echo "正在启动雅思真经划词助手 Siri 语音服务..."
python3 server.py 8777
