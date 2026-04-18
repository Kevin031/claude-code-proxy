#!/bin/bash

echo "测试优化功能..."
echo ""

# 清理端口
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1

# 启动服务器
echo "启动服务器..."
npm start &
SERVER_PID=$!

# 等待服务器完全启动
sleep 4

echo ""
echo "========================================="
echo "  发送测试请求"
echo "========================================="

# 测试 1: 健康检查
echo ""
echo "测试 1: 健康检查"
curl -s http://localhost:3000/health > /dev/null
sleep 1

# 测试 2: 代理请求
echo ""
echo "测试 2: 代理请求"
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}' \
  http://localhost:3000/coding/v1/messages > /dev/null

sleep 2

# 停止服务器
echo ""
echo ""
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null
echo "测试完成"
