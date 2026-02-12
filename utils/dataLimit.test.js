// 数据限制功能单元测试
// 测试任务 4.1: 恰好264条数据时的行为

// 模拟生成区块数据
const generateMockBlock = (height) => ({
  height,
  hash: `0x${height.toString(16).padStart(64, '0')}`,
  resultValue: height % 10,
  type: height % 2 === 0 ? 'EVEN' : 'ODD',
  sizeType: height % 2 === 0 ? 'BIG' : 'SMALL',
  timestamp: new Date().toISOString()
});

// 模拟 WebSocket 数据添加逻辑
const addBlockWithCapacityLimit = (prev, newBlock, maxCapacity = 264) => {
  // 检查是否已存在
  if (prev.some(b => b.height === newBlock.height)) {
    return prev;
  }
  
  // 添加新区块到开头
  const combined = [newBlock, ...prev];
  
  // 去重
  const uniqueBlocks = Array.from(new Map(combined.map(b => [b.height, b])).values());
  
  // 排序（降序）
  const sorted = uniqueBlocks.sort((a, b) => b.height - a.height);
  
  // 限制容量
  const updated = sorted.slice(0, maxCapacity);
  
  return updated;
};

// 测试函数
const runTests = () => {
  console.log('=== 数据限制功能单元测试 ===\n');
  
  // 测试 4.1: 恰好264条数据时的行为
  console.log('测试 4.1: 恰好264条数据时的行为');
  test_264_capacity();
  
  console.log('\n=== 所有测试完成 ===');
};

// 测试 4.1: 恰好264条数据时的行为
const test_264_capacity = () => {
  try {
    // 准备：创建恰好264条数据
    let blocks = [];
    for (let i = 1; i <= 264; i++) {
      blocks.push(generateMockBlock(i));
    }
    
    console.log(`  ✓ 准备：创建了 ${blocks.length} 条数据`);
    
    // 验证：数据量应该是264
    if (blocks.length !== 264) {
      throw new Error(`预期264条数据，实际 ${blocks.length} 条`);
    }
    console.log(`  ✓ 验证：数据量正确 (${blocks.length} 条)`);
    
    // 添加第265条数据
    const newBlock = generateMockBlock(265);
    blocks = addBlockWithCapacityLimit(blocks, newBlock, 264);
    
    console.log(`  ✓ 操作：添加第265条数据 (区块高度: ${newBlock.height})`);
    
    // 验证：数据量应该仍然是264
    if (blocks.length !== 264) {
      throw new Error(`预期264条数据，实际 ${blocks.length} 条`);
    }
    console.log(`  ✓ 验证：数据量保持在264条`);
    
    // 验证：最新的区块应该是265
    if (blocks[0].height !== 265) {
      throw new Error(`预期最新区块高度为265，实际 ${blocks[0].height}`);
    }
    console.log(`  ✓ 验证：最新区块高度正确 (${blocks[0].height})`);
    
    // 验证：最旧的区块应该是2（区块1被删除）
    if (blocks[blocks.length - 1].height !== 2) {
      throw new Error(`预期最旧区块高度为2，实际 ${blocks[blocks.length - 1].height}`);
    }
    console.log(`  ✓ 验证：最旧区块被删除，当前最旧区块高度为 ${blocks[blocks.length - 1].height}`);
    
    // 验证：区块1不应该存在
    if (blocks.some(b => b.height === 1)) {
      throw new Error('区块1应该被删除，但仍然存在');
    }
    console.log(`  ✓ 验证：区块1已被删除`);
    
    console.log('  ✅ 测试 4.1 通过！');
  } catch (error) {
    console.error('  ❌ 测试 4.1 失败:', error.message);
  }
};

// 运行测试
runTests();
