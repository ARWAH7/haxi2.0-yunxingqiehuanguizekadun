#!/bin/bash

# 快速启动脚本 - 哈希分析大师 5.0

set -e

echo "========================================"
echo "  哈希分析大师 5.0 - 快速启动"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 首次运行，正在安装前端依赖...${NC}"
    npm install
fi

if [ ! -d "server/node_modules" ]; then
    echo -e "${YELLOW}📦 正在安装后端依赖...${NC}"
    cd server
    npm install
    cd ..
fi

# 检查环境配置
if [ ! -f ".env.local" ]; then
    echo -e "${RED}⚠️  未找到 .env.local 配置文件${NC}"
    echo -e "${BLUE}📝 正在创建示例配置...${NC}"
    cp .env.example .env.local
    echo -e "${YELLOW}⚠️  请编辑 .env.local 文件，填入您的 API Key${NC}"
    read -p "按 Enter 继续..."
fi

if [ ! -f "server/.env" ]; then
    echo -e "${RED}⚠️  未找到 server/.env 配置文件${NC}"
    echo -e "${BLUE}📝 正在创建示例配置...${NC}"
    cp server/.env.example server/.env
    echo -e "${YELLOW}⚠️  请编辑 server/.env 文件，填入您的 API Key${NC}"
    read -p "按 Enter 继续..."
fi

echo ""
echo -e "${GREEN}🚀 正在启动服务...${NC}"
echo ""
echo -e "${BLUE}前端地址: http://localhost:3000${NC}"
echo -e "${BLUE}后端地址: http://localhost:5000${NC}"
echo ""
echo -e "${YELLOW}按 Ctrl+C 停止所有服务${NC}"
echo ""

# 使用 trap 捕获退出信号
trap 'echo -e "\n${RED}正在停止服务...${NC}"; kill 0' EXIT

# 启动后端
cd server
npm run dev &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端
npm run dev &
FRONTEND_PID=$!

echo -e "${GREEN}✅ 服务已启动！${NC}"
echo ""

# 等待进程
wait
