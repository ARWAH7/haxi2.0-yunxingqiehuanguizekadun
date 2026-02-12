import dotenv from 'dotenv';

// 首先加载环境变量（必须在其他导入之前）
dotenv.config();

import { createWebSocketServer } from './websocket';
import { createAPI } from './api';
import { tronListener } from './tron-listener';
import { redis, subscriber } from './redis';

async function main() {
  console.log('🚀 启动 TRON 区块监听服务...\n');
  
  try {
    // 1. 等待 Redis 连接（添加超时）
    console.log('[Redis] 正在连接...');
    try {
      // 等待 Redis 连接就绪
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('连接超时')), 5000))
      ]);
      console.log('[Redis] ✅ 连接测试成功\n');
    } catch (error) {
      console.warn('[Redis] ⚠️ 连接测试失败，将使用内存存储作为备用方案');
      console.warn('[Redis] 错误详情:', error);
      console.log('');
    }
    
    // 2. 启动 WebSocket 服务器
    console.log('[WebSocket] 正在启动...');
    const WS_PORT = parseInt(process.env.WS_PORT || '8080');
    createWebSocketServer(WS_PORT);
    
    // 3. 启动 REST API
    console.log('[API] 正在启动...');
    const API_PORT = parseInt(process.env.API_PORT || '3001');
    createAPI(API_PORT);
    
    // 4. 启动 TRON 区块监听
    console.log('[TRON Listener] 正在启动...');
    await tronListener.start();
    
    console.log('\n✅ 所有服务启动成功！');
    console.log(`📊 REST API: http://localhost:${API_PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${WS_PORT}`);
    console.log('\n按 Ctrl+C 停止服务\n');
    
  } catch (error) {
    console.error('❌ 启动失败:', error);
    console.error('错误堆栈:', (error as Error).stack);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n\n🛑 收到关闭信号，正在关闭服务...');
  
  tronListener.stop();
  await redis.quit();
  await subscriber.quit();
  
  console.log('✅ 服务已关闭');
  process.exit(0);
});

// 启动
main();
