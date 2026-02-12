const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

async function checkRedisData() {
  console.log('========================================');
  console.log('Redis 数据库详细信息');
  console.log('========================================\n');

  try {
    // 1. 区块数据
    console.log('【1. 区块数据】');
    const blockCount = await redis.zcard('tron:blocks');
    console.log(`  总数: ${blockCount} 条`);
    
    if (blockCount > 0) {
      const latestHeights = await redis.zrevrange('tron:blocks', 0, 0);
      const oldestHeights = await redis.zrange('tron:blocks', 0, 0);
      
      if (latestHeights.length > 0) {
        const latestBlock = await redis.hget(`tron:block:${latestHeights[0]}`, 'data');
        const oldestBlock = await redis.hget(`tron:block:${oldestHeights[0]}`, 'data');
        
        if (latestBlock) {
          const latest = JSON.parse(latestBlock);
          console.log(`  最新区块: ${latest.height} (${latest.type}, ${latest.sizeType})`);
        }
        
        if (oldestBlock) {
          const oldest = JSON.parse(oldestBlock);
          console.log(`  最旧区块: ${oldest.height} (${oldest.type}, ${oldest.sizeType})`);
        }
      }
    }
    console.log();

    // 2. AI 预测历史
    console.log('【2. AI 预测历史】');
    const aiKeys = await redis.keys('tron:ai:predictions:*');
    console.log(`  组合数: ${aiKeys.length} 个`);
    
    let totalPredictions = 0;
    for (const key of aiKeys) {
      const count = await redis.zcard(key);
      totalPredictions += count;
      const keyName = key.replace('tron:ai:predictions:', '');
      console.log(`    ${keyName}: ${count} 条`);
    }
    console.log(`  总预测数: ${totalPredictions} 条`);
    console.log();

    // 3. AI 模型统计
    console.log('【3. AI 模型统计】');
    const modelStats = await redis.get('tron:ai:model_stats');
    if (modelStats) {
      const stats = JSON.parse(modelStats);
      const keys = Object.keys(stats);
      console.log(`  模型数: ${keys.length} 个`);
      
      keys.slice(0, 5).forEach(key => {
        const { total, correct } = stats[key];
        const accuracy = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;
        console.log(`    ${key}: ${correct}/${total} (${accuracy}%)`);
      });
      
      if (keys.length > 5) {
        console.log(`    ... 还有 ${keys.length - 5} 个模型`);
      }
    } else {
      console.log('  无数据');
    }
    console.log();

    // 4. 下注记录
    console.log('【4. 下注记录】');
    const betCount = await redis.zcard('tron:bets:records');
    console.log(`  总数: ${betCount} 条`);
    
    if (betCount > 0) {
      const latestBets = await redis.zrevrange('tron:bets:records', 0, 2);
      console.log(`  最近 3 条:`);
      
      for (const betStr of latestBets) {
        const bet = JSON.parse(betStr);
        console.log(`    区块 ${bet.blockHeight}: ${bet.target} ${bet.amount} (${bet.won ? '赢' : '输'}) 余额: ${bet.balance}`);
      }
    }
    console.log();

    // 5. 托管任务
    console.log('【5. 托管任务】');
    const tasks = await redis.get('tron:bets:tasks');
    if (tasks) {
      const taskList = JSON.parse(tasks);
      console.log(`  任务数: ${taskList.length} 个`);
      
      taskList.forEach(task => {
        console.log(`    ${task.name} (${task.active ? '运行中' : '已停止'})`);
      });
    } else {
      console.log('  无任务');
    }
    console.log();

    // 6. 下注配置
    console.log('【6. 下注配置】');
    const config = await redis.get('tron:bets:config');
    if (config) {
      const cfg = JSON.parse(config);
      console.log(`  初始余额: ${cfg.initialBalance}`);
      console.log(`  单注金额: ${cfg.betAmount}`);
    } else {
      console.log('  无配置');
    }
    console.log();

    // 7. Redis 统计信息
    console.log('【7. Redis 统计信息】');
    const info = await redis.info('memory');
    const memoryMatch = info.match(/used_memory_human:(.+)/);
    if (memoryMatch) {
      console.log(`  内存使用: ${memoryMatch[1].trim()}`);
    }
    
    const dbsize = await redis.dbsize();
    console.log(`  总键数: ${dbsize}`);
    console.log();

    // 8. 数据库文件位置
    console.log('【8. 数据库文件位置】');
    const configInfo = await redis.config('get', 'dir');
    const dbfilename = await redis.config('get', 'dbfilename');
    
    if (configInfo && configInfo.length > 1) {
      console.log(`  数据目录: ${configInfo[1]}`);
    }
    
    if (dbfilename && dbfilename.length > 1) {
      console.log(`  数据文件: ${dbfilename[1]}`);
    }
    console.log();

    console.log('========================================');
    console.log('查询完成');
    console.log('========================================');

  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await redis.quit();
  }
}

checkRedisData();
