import Redis from 'ioredis';

// Redis 配置
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const MAX_BLOCKS = 30000; // 最多保存 30000 个区块

// 内存存储（作为 Redis 的备用方案）
const memoryStorage = {
  blocks: new Map<number, any>(), // 区块详情
  blockHeights: [] as number[],    // 区块高度（按顺序）
  stats: { latestHeight: 0, lastUpdate: 0 },
  aiPredictions: new Map<string, any[]>(), // AI 预测
  aiModelStats: {} as Record<string, { total: number; correct: number }>,
  betRecords: [] as any[],         // 下注记录
  betTasks: [] as any[],           // 托管任务
  betConfig: null as any,          // 下注配置
};

// Redis 连接状态
let redisConnected = false;

// 创建 Redis 客户端
export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

// 创建订阅客户端（单独连接）
export const subscriber = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
});

// Redis 键名
export const REDIS_KEYS = {
  BLOCKS: 'tron:blocks',           // 有序集合，存储区块
  BLOCK_HASH: 'tron:block:',       // 哈希，存储单个区块详情
  CHANNEL: 'tron:new-block',       // Pub/Sub 频道
  STATS: 'tron:stats',             // 统计信息
  AI_PREDICTIONS: 'tron:ai:predictions',     // AI 预测历史
  AI_MODEL_STATS: 'tron:ai:model_stats',     // AI 模型统计
  BET_RECORDS: 'tron:bets:records',          // 下注记录
  BET_TASKS: 'tron:bets:tasks',              // 托管任务
  BET_CONFIG: 'tron:bets:config',            // 下注配置
};

// 连接事件
redis.on('connect', () => {
  console.log('[Redis] ✅ 连接成功');
  redisConnected = true;
});

redis.on('error', (err) => {
  console.error('[Redis] ❌ 连接错误:', err);
  console.log('[Memory Storage] 💡 切换到内存存储模式');
  redisConnected = false;
});

subscriber.on('connect', () => {
  console.log('[Redis Subscriber] ✅ 订阅客户端连接成功');
});

subscriber.on('error', (err) => {
  console.error('[Redis Subscriber] ❌ 连接错误:', err);
});

// 保存区块到 Redis 或内存存储
export async function saveBlock(block: any): Promise<void> {
  if (redisConnected) {
    try {
      const pipeline = redis.pipeline();
      
      // 1. 添加到有序集合（按高度排序）
      pipeline.zadd(REDIS_KEYS.BLOCKS, block.height, block.height.toString());
      
      // 2. 保存区块详情（哈希）
      pipeline.hset(
        `${REDIS_KEYS.BLOCK_HASH}${block.height}`,
        'height', block.height,
        'hash', block.hash,
        'timestamp', block.timestamp,
        'type', block.type,
        'sizeType', block.sizeType,
        'data', JSON.stringify(block)
      );
      
      // 3. 设置过期时间（7 天）
      pipeline.expire(`${REDIS_KEYS.BLOCK_HASH}${block.height}`, 7 * 24 * 60 * 60);
      
      // 4. 更新统计信息
      pipeline.hset(REDIS_KEYS.STATS, 'latestHeight', block.height, 'lastUpdate', Date.now());
      
      await pipeline.exec();
      
      // 5. 清理旧数据（保持最新 10000 个）
      const count = await redis.zcard(REDIS_KEYS.BLOCKS);
      if (count > MAX_BLOCKS) {
        const toRemove = count - MAX_BLOCKS;
        const oldBlocks = await redis.zrange(REDIS_KEYS.BLOCKS, 0, toRemove - 1);
        
        const deletePipeline = redis.pipeline();
        deletePipeline.zremrangebyrank(REDIS_KEYS.BLOCKS, 0, toRemove - 1);
        
        oldBlocks.forEach(height => {
          deletePipeline.del(`${REDIS_KEYS.BLOCK_HASH}${height}`);
        });
        
        await deletePipeline.exec();
        console.log(`[Redis] 🧹 清理 ${toRemove} 个旧区块`);
      }
    } catch (error) {
      console.error('[Redis] 保存区块失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      saveBlockToMemory(block);
    }
  } else {
    // 使用内存存储
    saveBlockToMemory(block);
  }
}

// 保存区块到内存存储
function saveBlockToMemory(block: any): void {
  // 保存区块详情
  memoryStorage.blocks.set(block.height, block);
  
  // 更新区块高度列表（保持有序）
  if (!memoryStorage.blockHeights.includes(block.height)) {
    memoryStorage.blockHeights.push(block.height);
    memoryStorage.blockHeights.sort((a, b) => a - b);
  }
  
  // 更新统计信息
  memoryStorage.stats.latestHeight = Math.max(memoryStorage.stats.latestHeight, block.height);
  memoryStorage.stats.lastUpdate = Date.now();
  
  // 清理旧数据（保持最新 10000 个）
  if (memoryStorage.blockHeights.length > MAX_BLOCKS) {
    const toRemove = memoryStorage.blockHeights.length - MAX_BLOCKS;
    const oldHeights = memoryStorage.blockHeights.slice(0, toRemove);
    
    // 删除旧区块
    oldHeights.forEach(height => {
      memoryStorage.blocks.delete(height);
    });
    
    // 更新高度列表
    memoryStorage.blockHeights = memoryStorage.blockHeights.slice(toRemove);
    
    console.log(`[Memory Storage] 🧹 清理 ${toRemove} 个旧区块`);
  }
  
  console.log(`[Memory Storage] ✅ 保存区块: ${block.height} (${block.type}, ${block.sizeType})`);
}

// 内存中的订阅者列表
const memorySubscribers: ((message: string) => void)[] = [];

// 发布新区块事件
export async function publishBlock(block: any): Promise<void> {
  const message = JSON.stringify(block);
  
  if (redisConnected) {
    try {
      await redis.publish(REDIS_KEYS.CHANNEL, message);
    } catch (error) {
      console.error('[Redis] 发布区块失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存发布
      publishBlockToMemory(message);
    }
  } else {
    // 使用内存发布
    publishBlockToMemory(message);
  }
}

// 在内存中发布区块事件
function publishBlockToMemory(message: string): void {
  // 通知所有内存订阅者
  memorySubscribers.forEach(subscriber => {
    try {
      subscriber(message);
    } catch (error) {
      console.error('[Memory Storage] 发布消息失败:', error);
    }
  });
  
  console.log(`[Memory Storage] 📤 发布区块消息`);
}

// 订阅内存中的消息
export function subscribeToMemory(handler: (message: string) => void): void {
  memorySubscribers.push(handler);
  console.log(`[Memory Storage] ✅ 新订阅者加入，当前订阅数: ${memorySubscribers.length}`);
}

// 取消订阅内存中的消息
export function unsubscribeFromMemory(handler: (message: string) => void): void {
  const index = memorySubscribers.indexOf(handler);
  if (index > -1) {
    memorySubscribers.splice(index, 1);
    console.log(`[Memory Storage] ✅ 订阅者离开，当前订阅数: ${memorySubscribers.length}`);
  }
}

// 获取区块列表
export async function getBlocks(limit: number = 1000): Promise<any[]> {
  if (redisConnected) {
    try {
      // 获取最新的 N 个区块高度
      const heights = await redis.zrevrange(REDIS_KEYS.BLOCKS, 0, limit - 1);
      
      if (heights.length === 0) return [];
      
      // 批量获取区块详情
      const pipeline = redis.pipeline();
      heights.forEach(height => {
        pipeline.hget(`${REDIS_KEYS.BLOCK_HASH}${height}`, 'data');
      });
      
      const results = await pipeline.exec();
      
      const blocks = results
        ?.map(([err, data]) => {
          if (err || !data) return null;
          try {
            return JSON.parse(data as string);
          } catch {
            return null;
          }
        })
        .filter(Boolean) || [];
      
      return blocks;
    } catch (error) {
      console.error('[Redis] 获取区块失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      return getBlocksFromMemory(limit);
    }
  } else {
    // 使用内存存储
    return getBlocksFromMemory(limit);
  }
}

// 从内存中获取区块列表
function getBlocksFromMemory(limit: number = 1000): any[] {
  // 按高度降序排序，取最新的 N 个
  const sortedHeights = [...memoryStorage.blockHeights].sort((a, b) => b - a).slice(0, limit);
  
  // 获取区块详情
  const blocks = sortedHeights
    .map(height => memoryStorage.blocks.get(height))
    .filter(Boolean) || [];
  
  console.log(`[Memory Storage] 📊 获取 ${blocks.length} 个区块`);
  return blocks;
}

// 获取统计信息
export async function getStats(): Promise<any> {
  if (redisConnected) {
    try {
      const stats = await redis.hgetall(REDIS_KEYS.STATS);
      const count = await redis.zcard(REDIS_KEYS.BLOCKS);
      
      return {
        totalBlocks: count,
        latestHeight: parseInt(stats.latestHeight || '0'),
        lastUpdate: parseInt(stats.lastUpdate || '0'),
      };
    } catch (error) {
      console.error('[Redis] 获取统计信息失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      return getStatsFromMemory();
    }
  } else {
    // 使用内存存储
    return getStatsFromMemory();
  }
}

// 从内存中获取统计信息
function getStatsFromMemory(): any {
  return {
    totalBlocks: memoryStorage.blockHeights.length,
    latestHeight: memoryStorage.stats.latestHeight,
    lastUpdate: memoryStorage.stats.lastUpdate,
  };
}

// 清空所有数据
export async function clearAll(): Promise<void> {
  if (redisConnected) {
    try {
      const heights = await redis.zrange(REDIS_KEYS.BLOCKS, 0, -1);
      
      const pipeline = redis.pipeline();
      pipeline.del(REDIS_KEYS.BLOCKS);
      pipeline.del(REDIS_KEYS.STATS);
      pipeline.del(REDIS_KEYS.AI_PREDICTIONS);
      pipeline.del(REDIS_KEYS.AI_MODEL_STATS);
      pipeline.del(REDIS_KEYS.BET_RECORDS);
      pipeline.del(REDIS_KEYS.BET_TASKS);
      pipeline.del(REDIS_KEYS.BET_CONFIG);
      
      heights.forEach(height => {
        pipeline.del(`${REDIS_KEYS.BLOCK_HASH}${height}`);
      });
      
      await pipeline.exec();
      console.log('[Redis] 🗑️ 所有数据已清空');
    } catch (error) {
      console.error('[Redis] 清空数据失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      clearAllFromMemory();
    }
  } else {
    // 使用内存存储
    clearAllFromMemory();
  }
}

// 清空内存中的所有数据
function clearAllFromMemory(): void {
  memoryStorage.blocks.clear();
  memoryStorage.blockHeights = [];
  memoryStorage.stats = { latestHeight: 0, lastUpdate: 0 };
  memoryStorage.aiPredictions.clear();
  memoryStorage.aiModelStats = {};
  memoryStorage.betRecords = [];
  memoryStorage.betTasks = [];
  memoryStorage.betConfig = null;
  
  console.log('[Memory Storage] 🗑️ 所有数据已清空');
}

// ==================== AI 预测历史 ====================

// 保存 AI 预测记录
export async function saveAIPrediction(prediction: any): Promise<void> {
  const key = `${prediction.modelId}-${prediction.ruleId}`;
  
  if (redisConnected) {
    try {
      // 使用有序集合，按时间戳排序
      await redis.zadd(
        `${REDIS_KEYS.AI_PREDICTIONS}:${key}`,
        prediction.timestamp,
        JSON.stringify(prediction)
      );
      
      // 限制每个组合最多保存 10000 条记录
      const count = await redis.zcard(`${REDIS_KEYS.AI_PREDICTIONS}:${key}`);
      if (count > 10000) {
        const toRemove = count - 10000;
        await redis.zremrangebyrank(`${REDIS_KEYS.AI_PREDICTIONS}:${key}`, 0, toRemove - 1);
      }
    } catch (error) {
      console.error('[Redis] 保存 AI 预测失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      saveAIPredictionToMemory(prediction);
    }
  } else {
    // 使用内存存储
    saveAIPredictionToMemory(prediction);
  }
}

// 保存 AI 预测记录到内存
function saveAIPredictionToMemory(prediction: any): void {
  const key = `${prediction.modelId}-${prediction.ruleId}`;
  
  // 获取现有预测
  let predictions = memoryStorage.aiPredictions.get(key) || [];
  
  // 添加新预测
  predictions.push(prediction);
  
  // 按时间戳排序
  predictions.sort((a, b) => a.timestamp - b.timestamp);
  
  // 限制最多保存 10000 条记录
  if (predictions.length > 10000) {
    predictions = predictions.slice(predictions.length - 10000);
  }
  
  // 保存回内存
  memoryStorage.aiPredictions.set(key, predictions);
  
  console.log(`[Memory Storage] ✅ 保存 AI 预测: ${key}`);
}

// 获取 AI 预测历史
export async function getAIPredictions(modelId?: string, ruleId?: string, limit: number = 100): Promise<any[]> {
  if (redisConnected) {
    try {
      if (modelId && ruleId) {
        // 获取特定模型+规则的预测
        const key = `${modelId}-${ruleId}`;
        const data = await redis.zrevrange(`${REDIS_KEYS.AI_PREDICTIONS}:${key}`, 0, limit - 1);
        return data.map(item => JSON.parse(item));
      } else {
        // 获取所有预测（从所有组合中）
        const keys = await redis.keys(`${REDIS_KEYS.AI_PREDICTIONS}:*`);
        const allPredictions: any[] = [];
        
        for (const key of keys) {
          const data = await redis.zrevrange(key, 0, limit - 1);
          allPredictions.push(...data.map(item => JSON.parse(item)));
        }
        
        // 按时间戳排序并限制数量
        return allPredictions
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, limit);
      }
    } catch (error) {
      console.error('[Redis] 获取 AI 预测历史失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      return getAIPredictionsFromMemory(modelId, ruleId, limit);
    }
  } else {
    // 使用内存存储
    return getAIPredictionsFromMemory(modelId, ruleId, limit);
  }
}

// 从内存中获取 AI 预测历史
function getAIPredictionsFromMemory(modelId?: string, ruleId?: string, limit: number = 100): any[] {
  if (modelId && ruleId) {
    // 获取特定模型+规则的预测
    const key = `${modelId}-${ruleId}`;
    const predictions = memoryStorage.aiPredictions.get(key) || [];
    return predictions
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  } else {
    // 获取所有预测（从所有组合中）
    const allPredictions: any[] = [];
    for (const predictions of memoryStorage.aiPredictions.values()) {
      allPredictions.push(...predictions);
    }
    
    // 按时间戳排序并限制数量
    return allPredictions
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}

// 保存 AI 模型统计
export async function saveAIModelStats(stats: Record<string, { total: number; correct: number }>): Promise<void> {
  if (redisConnected) {
    try {
      await redis.set(REDIS_KEYS.AI_MODEL_STATS, JSON.stringify(stats));
    } catch (error) {
      console.error('[Redis] 保存 AI 模型统计失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      saveAIModelStatsToMemory(stats);
    }
  } else {
    // 使用内存存储
    saveAIModelStatsToMemory(stats);
  }
}

// 保存 AI 模型统计到内存
function saveAIModelStatsToMemory(stats: Record<string, { total: number; correct: number }>): void {
  memoryStorage.aiModelStats = stats;
  console.log('[Memory Storage] ✅ 保存 AI 模型统计');
}

// 获取 AI 模型统计
export async function getAIModelStats(): Promise<Record<string, { total: number; correct: number }>> {
  if (redisConnected) {
    try {
      const data = await redis.get(REDIS_KEYS.AI_MODEL_STATS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('[Redis] 获取 AI 模型统计失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      return getAIModelStatsFromMemory();
    }
  } else {
    // 使用内存存储
    return getAIModelStatsFromMemory();
  }
}

// 从内存中获取 AI 模型统计
function getAIModelStatsFromMemory(): Record<string, { total: number; correct: number }> {
  return memoryStorage.aiModelStats;
}

// 清除 AI 预测历史
export async function clearAIPredictions(): Promise<void> {
  if (redisConnected) {
    try {
      // 清除所有预测相关的键
      const keys = await redis.keys(`${REDIS_KEYS.AI_PREDICTIONS}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      console.log('[Redis] 🗑️ AI 预测历史已清除');
    } catch (error) {
      console.error('[Redis] 清除 AI 预测历史失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      clearAIPredictionsFromMemory();
    }
  } else {
    // 使用内存存储
    clearAIPredictionsFromMemory();
  }
}

// 清除内存中的 AI 预测历史
function clearAIPredictionsFromMemory(): void {
  memoryStorage.aiPredictions.clear();
  console.log('[Memory Storage] 🗑️ AI 预测历史已清除');
}

// 清除 AI 模型统计
export async function clearAIModelStats(): Promise<void> {
  if (redisConnected) {
    try {
      await redis.del(REDIS_KEYS.AI_MODEL_STATS);
      console.log('[Redis] 🗑️ AI 模型统计已清除');
    } catch (error) {
      console.error('[Redis] 清除 AI 模型统计失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      clearAIModelStatsFromMemory();
    }
  } else {
    // 使用内存存储
    clearAIModelStatsFromMemory();
  }
}

// 清除内存中的 AI 模型统计
function clearAIModelStatsFromMemory(): void {
  memoryStorage.aiModelStats = {};
  console.log('[Memory Storage] 🗑️ AI 模型统计已清除');
}

// ==================== 下注记录 ====================

// 保存下注记录
export async function saveBetRecord(bet: any): Promise<void> {
  if (redisConnected) {
    try {
      // 使用有序集合，按时间戳排序
      await redis.zadd(
        REDIS_KEYS.BET_RECORDS,
        bet.timestamp,
        JSON.stringify(bet)
      );
      
      // 限制最多保存 10000 条记录
      const count = await redis.zcard(REDIS_KEYS.BET_RECORDS);
      if (count > 10000) {
        const toRemove = count - 10000;
        await redis.zremrangebyrank(REDIS_KEYS.BET_RECORDS, 0, toRemove - 1);
      }
    } catch (error) {
      console.error('[Redis] 保存下注记录失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      saveBetRecordToMemory(bet);
    }
  } else {
    // 使用内存存储
    saveBetRecordToMemory(bet);
  }
}

// 保存下注记录到内存
function saveBetRecordToMemory(bet: any): void {
  // 添加新记录
  memoryStorage.betRecords.push(bet);
  
  // 按时间戳排序
  memoryStorage.betRecords.sort((a, b) => a.timestamp - b.timestamp);
  
  // 限制最多保存 10000 条记录
  if (memoryStorage.betRecords.length > 10000) {
    memoryStorage.betRecords = memoryStorage.betRecords.slice(memoryStorage.betRecords.length - 10000);
  }
  
  console.log('[Memory Storage] ✅ 保存下注记录');
}

// 获取下注记录
export async function getBetRecords(limit: number = 500): Promise<any[]> {
  if (redisConnected) {
    try {
      const data = await redis.zrevrange(REDIS_KEYS.BET_RECORDS, 0, limit - 1);
      return data.map(item => JSON.parse(item));
    } catch (error) {
      console.error('[Redis] 获取下注记录失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      return getBetRecordsFromMemory(limit);
    }
  } else {
    // 使用内存存储
    return getBetRecordsFromMemory(limit);
  }
}

// 从内存中获取下注记录
function getBetRecordsFromMemory(limit: number = 500): any[] {
  return memoryStorage.betRecords
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

// 保存托管任务
export async function saveBetTasks(tasks: any[]): Promise<void> {
  if (redisConnected) {
    try {
      await redis.set(REDIS_KEYS.BET_TASKS, JSON.stringify(tasks));
    } catch (error) {
      console.error('[Redis] 保存托管任务失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      saveBetTasksToMemory(tasks);
    }
  } else {
    // 使用内存存储
    saveBetTasksToMemory(tasks);
  }
}

// 保存托管任务到内存
function saveBetTasksToMemory(tasks: any[]): void {
  memoryStorage.betTasks = tasks;
  console.log('[Memory Storage] ✅ 保存托管任务');
}

// 获取托管任务
export async function getBetTasks(): Promise<any[]> {
  if (redisConnected) {
    try {
      const data = await redis.get(REDIS_KEYS.BET_TASKS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[Redis] 获取托管任务失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      return getBetTasksFromMemory();
    }
  } else {
    // 使用内存存储
    return getBetTasksFromMemory();
  }
}

// 从内存中获取托管任务
function getBetTasksFromMemory(): any[] {
  return memoryStorage.betTasks;
}

// 保存下注配置
export async function saveBetConfig(config: any): Promise<void> {
  if (redisConnected) {
    try {
      await redis.set(REDIS_KEYS.BET_CONFIG, JSON.stringify(config));
    } catch (error) {
      console.error('[Redis] 保存下注配置失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      saveBetConfigToMemory(config);
    }
  } else {
    // 使用内存存储
    saveBetConfigToMemory(config);
  }
}

// 保存下注配置到内存
function saveBetConfigToMemory(config: any): void {
  memoryStorage.betConfig = config;
  console.log('[Memory Storage] ✅ 保存下注配置');
}

// 获取下注配置
export async function getBetConfig(): Promise<any> {
  if (redisConnected) {
    try {
      const data = await redis.get(REDIS_KEYS.BET_CONFIG);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Redis] 获取下注配置失败:', error);
      console.log('[Memory Storage] 💡 切换到内存存储模式');
      redisConnected = false;
      // 回退到内存存储
      return getBetConfigFromMemory();
    }
  } else {
    // 使用内存存储
    return getBetConfigFromMemory();
  }
}

// 从内存中获取下注配置
function getBetConfigFromMemory(): any {
  return memoryStorage.betConfig;
}
