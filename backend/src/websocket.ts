import { WebSocketServer, WebSocket } from 'ws';
import { subscriber, REDIS_KEYS, subscribeToMemory, unsubscribeFromMemory } from './redis';

export function createWebSocketServer(port: number = 8080) {
  const wss = new WebSocketServer({ port });
  
  console.log(`[WebSocket] 🚀 服务器启动在端口 ${port}`);
  
  // 连接管理
  const clients = new Set<WebSocket>();
  
  wss.on('connection', (ws: WebSocket) => {
    clients.add(ws);
    console.log(`[WebSocket] ✅ 新客户端连接，当前连接数: ${clients.size}`);
    
    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'WebSocket 连接成功',
      timestamp: Date.now(),
    }));
    
    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WebSocket] ❌ 客户端断开，当前连接数: ${clients.size}`);
    });
    
    ws.on('error', (error) => {
      console.error('[WebSocket] 错误:', error);
      clients.delete(ws);
    });
    
    // 处理客户端消息
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('[WebSocket] 收到消息:', message);
      } catch (error) {
        console.error('[WebSocket] 解析消息失败:', error);
      }
    });
  });
  
  // 消息处理函数
  const handleMessage = (message: string) => {
    // 广播给所有 WebSocket 客户端
    const clientCount = clients.size;
    let sentCount = 0;
    
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });
    
    try {
      const block = JSON.parse(message);
      console.log(`[WebSocket] 📤 推送区块 ${block.height} 给 ${sentCount}/${clientCount} 个客户端`);
    } catch (error) {
      console.error('[WebSocket] 解析消息失败:', error);
    }
  };
  
  // 订阅 Redis 频道
  subscriber.subscribe(REDIS_KEYS.CHANNEL, (err) => {
    if (err) {
      console.error('[Redis Subscriber] ❌ 订阅失败:', err);
      console.log('[WebSocket] 💡 切换到内存存储订阅');
      // 订阅内存存储
      subscribeToMemory(handleMessage);
    } else {
      console.log('[Redis Subscriber] ✅ 订阅频道:', REDIS_KEYS.CHANNEL);
    }
  });
  
  // 监听 Redis 消息
  subscriber.on('message', (channel, message) => {
    if (channel === REDIS_KEYS.CHANNEL) {
      handleMessage(message);
    }
  });
  
  // 同时订阅内存存储，确保在 Redis 不可用时仍能接收消息
  subscribeToMemory(handleMessage);
  
  // 心跳检测
  setInterval(() => {
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      } else {
        clients.delete(client);
      }
    });
  }, 30000); // 每 30 秒
  
  return wss;
}
