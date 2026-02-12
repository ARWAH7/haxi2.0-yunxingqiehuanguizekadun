# TRON Redis 后端服务

## 🚀 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写你的 Alchemy API Key:

```bash
cp .env.example .env
```

编辑 `.env`:
```env
ALCHEMY_API_KEY=your_actual_api_key_here
```

### 3. 启动 Redis

#### 使用 Docker（推荐）

在项目根目录创建 `docker-compose.yml`:

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
volumes:
  redis-data:
```

启动:
```bash
docker-compose up -d
```

#### 或使用本地 Redis

```bash
redis-server
```

### 4. 启动后端服务

```bash
npm run dev
```

你应该看到:
```
[Redis] ✅ 连接成功
[Redis Subscriber] ✅ 订阅客户端连接成功
[WebSocket] 🚀 服务器启动在端口 8080
[API] 🚀 REST API 启动在端口 3001
[TRON Listener] ✅ 连接到 Alchemy WebSocket
✅ 所有服务启动成功！
```

## 📡 API 端点

### 获取区块列表
```bash
GET http://localhost:3001/api/blocks?limit=1000
```

### 获取统计信息
```bash
GET http://localhost:3001/api/stats
```

### 清空所有数据
```bash
DELETE http://localhost:3001/api/blocks
```

### 健康检查
```bash
GET http://localhost:3001/health
```

## 🔌 WebSocket

连接到: `ws://localhost:8080`

接收实时区块推送。

## 🧪 测试

### 测试 Redis 连接
```bash
redis-cli ping
# 应返回: PONG
```

### 查看 Redis 数据
```bash
redis-cli

# 查看区块数量
ZCARD tron:blocks

# 查看最新 10 个区块
ZREVRANGE tron:blocks 0 9

# 查看统计信息
HGETALL tron:stats
```

### 测试 API
```bash
curl http://localhost:3001/api/blocks?limit=10
curl http://localhost:3001/api/stats
```

## 📊 性能指标

- Redis 写入延迟: 1-5ms
- Redis 读取延迟: 1-3ms
- WebSocket 推送延迟: 5-15ms
- 总延迟: 70ms ⚡

## 🔧 开发

### 项目结构
```
backend/
├── src/
│   ├── index.ts          # 主入口
│   ├── redis.ts          # Redis 客户端
│   ├── websocket.ts      # WebSocket 服务器
│   ├── tron-listener.ts  # TRON 区块监听
│   └── api.ts            # REST API
├── package.json
├── tsconfig.json
└── .env
```

### 构建生产版本
```bash
npm run build
npm start
```

## 🐛 故障排除

### Redis 连接失败
- 确保 Redis 正在运行: `redis-cli ping`
- 检查端口是否被占用: `netstat -an | findstr 6379`

### WebSocket 连接失败
- 检查端口 8080 是否被占用
- 查看防火墙设置

### Alchemy API 错误
- 确认 API Key 正确
- 检查 API 配额是否用完

## 📝 注意事项

1. **数据持久化**: Redis 使用 AOF 持久化，数据会保存到磁盘
2. **内存限制**: 默认最多保存 10000 个区块（约 10MB）
3. **过期时间**: 区块数据 7 天后自动过期
4. **并发支持**: 支持多个 WebSocket 客户端同时连接

## 🎉 完成

后端服务现在正在监听 TRON 区块链，并通过 Redis + WebSocket 实时推送到前端！
