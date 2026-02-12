/**
 * 数据完整性测试脚本
 * 用于验证优化后的检测和补全机制
 */

const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
});

// 测试配置
const TEST_CONFIG = {
  // 模拟缺失的区块数量
  MISSING_COUNT: 50,
  // 检查间隔（毫秒）
  CHECK_INTERVAL: 2000,
  // 最大检查次数
  MAX_CHECKS: 10,
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// 获取 Redis 中的区块统计
async function getRedisStats() {
  try {
    const stats = await redis.hgetall('tron:stats');
    const count = await redis.zcard('tron:blocks');
    
    return {
      totalBlocks: count,
      latestHeight: parseInt(stats.latestHeight || '0'),
      lastUpdate: parseInt(stats.lastUpdate || '0'),
    };
  } catch (error) {
    log(colors.red, '❌ 获取 Redis 统计失败:', error.message);
    return null;
  }
}

// 获取 Redis 中的区块列表
async function getRedisBlocks(limit = 100) {
  try {
    const heights = await redis.zrevrange('tron:blocks', 0, limit - 1);
    return heights.map(h => parseInt(h));
  } catch (error) {
    log(colors.red, '❌ 获取区块列表失败:', error.message);
    return [];
  }
}

// 检查数据完整性
async function checkDataIntegrity() {
  const blocks = await getRedisBlocks(200);
  
  if (blocks.length < 2) {
    return { isComplete: true, missing: [] };
  }
  
  const missing = [];
  for (let i = 0; i < blocks.length - 1; i++) {
    const current = blocks[i];
    const next = blocks[i + 1];
    const expected = current - 1;
    
    if (next !== expected) {
      // 发现缺失
      for (let h = expected; h > next; h--) {
        missing.push(h);
      }
    }
  }
  
  return {
    isComplete: missing.length === 0,
    missing: missing.slice(0, 20), // 只显示前 20 个
    totalMissing: missing.length,
  };
}

// 模拟删除一些区块（用于测试）
async function simulateMissingBlocks(count) {
  try {
    const blocks = await getRedisBlocks(count + 10);
    
    if (blocks.length < count + 10) {
      log(colors.yellow, '⚠️ 区块数量不足，无法模拟缺失');
      return false;
    }
    
    // 删除中间的一些区块
    const toDelete = blocks.slice(5, 5 + count);
    
    log(colors.cyan, `\n🔧 模拟删除 ${count} 个区块...`);
    log(colors.cyan, `   删除范围: ${toDelete[toDelete.length - 1]} - ${toDelete[0]}`);
    
    for (const height of toDelete) {
      await redis.zrem('tron:blocks', height.toString());
      await redis.del(`tron:block:${height}`);
    }
    
    log(colors.green, `✅ 成功删除 ${count} 个区块\n`);
    return true;
  } catch (error) {
    log(colors.red, '❌ 模拟删除失败:', error.message);
    return false;
  }
}

// 主测试流程
async function runTest() {
  log(colors.blue, '\n' + '='.repeat(60));
  log(colors.blue, '  数据完整性检测测试');
  log(colors.blue, '='.repeat(60) + '\n');
  
  // 1. 检查初始状态
  log(colors.cyan, '📊 步骤 1: 检查初始状态');
  const initialStats = await getRedisStats();
  
  if (!initialStats) {
    log(colors.red, '❌ 无法连接到 Redis，请确保 Redis 正在运行');
    process.exit(1);
  }
  
  log(colors.green, `   总区块数: ${initialStats.totalBlocks}`);
  log(colors.green, `   最新高度: ${initialStats.latestHeight}`);
  log(colors.green, `   最后更新: ${new Date(initialStats.lastUpdate).toLocaleString()}\n`);
  
  if (initialStats.totalBlocks < 100) {
    log(colors.yellow, '⚠️ 区块数量不足 100，请等待数据积累后再测试');
    process.exit(0);
  }
  
  // 2. 检查初始完整性
  log(colors.cyan, '🔍 步骤 2: 检查初始数据完整性');
  const initialIntegrity = await checkDataIntegrity();
  
  if (initialIntegrity.isComplete) {
    log(colors.green, '   ✅ 数据完整，无缺失\n');
  } else {
    log(colors.yellow, `   ⚠️ 发现 ${initialIntegrity.totalMissing} 个缺失区块`);
    log(colors.yellow, `   缺失示例: ${initialIntegrity.missing.slice(0, 5).join(', ')}...\n`);
  }
  
  // 3. 模拟缺失
  log(colors.cyan, `🧪 步骤 3: 模拟 ${TEST_CONFIG.MISSING_COUNT} 个缺失区块`);
  const simulated = await simulateMissingBlocks(TEST_CONFIG.MISSING_COUNT);
  
  if (!simulated) {
    log(colors.red, '❌ 模拟失败，测试终止');
    process.exit(1);
  }
  
  // 4. 验证缺失
  log(colors.cyan, '🔍 步骤 4: 验证缺失已生效');
  const afterSimulation = await checkDataIntegrity();
  
  if (!afterSimulation.isComplete) {
    log(colors.green, `   ✅ 成功模拟缺失，检测到 ${afterSimulation.totalMissing} 个缺失区块`);
    log(colors.green, `   缺失范围: ${afterSimulation.missing[afterSimulation.missing.length - 1]} - ${afterSimulation.missing[0]}\n`);
  } else {
    log(colors.red, '   ❌ 未检测到缺失，测试失败\n');
    process.exit(1);
  }
  
  // 5. 等待自动补全
  log(colors.cyan, '⏳ 步骤 5: 等待自动补全（最多等待 ' + (TEST_CONFIG.MAX_CHECKS * TEST_CONFIG.CHECK_INTERVAL / 1000) + ' 秒）');
  log(colors.yellow, '   提示: 请确保后端服务正在运行 (npm run dev)\n');
  
  let checkCount = 0;
  let补全完成 = false;
  const startTime = Date.now();
  
  while (checkCount < TEST_CONFIG.MAX_CHECKS) {
    checkCount++;
    
    // 等待检测间隔
    await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.CHECK_INTERVAL));
    
    // 检查完整性
    const currentIntegrity = await checkDataIntegrity();
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (currentIntegrity.isComplete) {
      log(colors.green, `   ✅ 数据已补全完成！耗时: ${elapsedTime} 秒\n`);
      补全完成 = true;
      break;
    } else {
      const remaining = afterSimulation.totalMissing - currentIntegrity.totalMissing;
      const progress = ((remaining / afterSimulation.totalMissing) * 100).toFixed(1);
      
      log(colors.yellow, `   [${checkCount}/${TEST_CONFIG.MAX_CHECKS}] 补全中... 进度: ${progress}% (已补全 ${remaining}/${afterSimulation.totalMissing})`);
    }
  }
  
  // 6. 测试结果
  log(colors.blue, '\n' + '='.repeat(60));
  log(colors.blue, '  测试结果');
  log(colors.blue, '='.repeat(60) + '\n');
  
  if (补全完成) {
    const finalStats = await getRedisStats();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    log(colors.green, '✅ 测试通过！');
    log(colors.green, `   模拟缺失: ${TEST_CONFIG.MISSING_COUNT} 个区块`);
    log(colors.green, `   补全时间: ${totalTime} 秒`);
    log(colors.green, `   平均速度: ${(TEST_CONFIG.MISSING_COUNT / totalTime).toFixed(1)} 个/秒`);
    log(colors.green, `   最终区块数: ${finalStats.totalBlocks}`);
    log(colors.green, `   最新高度: ${finalStats.latestHeight}\n`);
    
    // 性能评估
    const avgSpeed = TEST_CONFIG.MISSING_COUNT / totalTime;
    if (avgSpeed > 10) {
      log(colors.green, '🚀 性能评级: 优秀 (> 10 个/秒)');
    } else if (avgSpeed > 5) {
      log(colors.green, '👍 性能评级: 良好 (5-10 个/秒)');
    } else {
      log(colors.yellow, '⚠️ 性能评级: 一般 (< 5 个/秒)');
    }
  } else {
    log(colors.red, '❌ 测试失败！');
    log(colors.red, `   等待时间: ${(TEST_CONFIG.MAX_CHECKS * TEST_CONFIG.CHECK_INTERVAL / 1000)} 秒`);
    log(colors.red, '   数据未能完全补全');
    log(colors.yellow, '\n   可能原因:');
    log(colors.yellow, '   1. 后端服务未运行');
    log(colors.yellow, '   2. WebSocket 连接失败');
    log(colors.yellow, '   3. API 速率限制');
    log(colors.yellow, '   4. 网络问题\n');
  }
  
  log(colors.blue, '='.repeat(60) + '\n');
  
  // 关闭连接
  await redis.quit();
  process.exit(补全完成 ? 0 : 1);
}

// 运行测试
runTest().catch(error => {
  log(colors.red, '\n❌ 测试异常:', error);
  redis.quit();
  process.exit(1);
});
