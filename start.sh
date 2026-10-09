#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "启动课堂智能笔记与练习系统..."
echo "前端地址: http://localhost:5173"
echo "后端地址: http://localhost:3000"
npm run dev
