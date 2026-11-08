#!/bin/zsh
cd "$(dirname "$0")"
echo "正在启动 SkyGuard ATC 低空安全态势感知台..."
(sleep 1.2 && open "http://127.0.0.1:8765") &
python3 server/main.py
