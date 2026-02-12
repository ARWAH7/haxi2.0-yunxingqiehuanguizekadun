// 珠盘路按列滑动机制测试
// 验证需求文档中的"示例 3：实时更新场景（按列滑动）"

// 模拟生成区块数据
const generateMockBlock = (height) => ({
  height,
  hash: `0x${height.toString(16).padStart(64, '0')}`,
  resultValue: height % 10,
  type: height % 2 === 0 ? 'EVEN' : 'ODD',
  sizeType: height % 2 === 0 ? 'BIG' : 'SMALL',
  timestamp: new Date().toISOString()
});

// 模拟 calculateBeadGrid 的按列滑动逻辑
// 注意：App.tsx 中的数据是按 height 降序排列的（最新的在前，最旧的在后）
const simulateColumnSliding = (blocks, rows = 6) => {
  const maxCols = 44;
  const maxCapacity = maxCols * rows; // 264
  
  let displayBlocks = blocks;
  
  // 当数据达到或超过 264 条时，删除最旧的 1 列（数组末尾的 6 条）
  if (blocks.length >= maxCapacity) {
    const blocksToRemove = rows; // 固定删除 1 列 = 6 条
    // 删除数组末尾的数据（最旧的数据）
    displayBlocks = blocks.slice(0, blocks.length - blocksToRemove);
    
    // 获取删除的区块范围（注意：数组是降序的，所以要反过来）
    const removedBlocks = blocks.slice(blocks.length - blocksToRemove);
    const removedHeights = removedBlocks.map(b => b.height).sort((a, b) => a - b);
    
    return {
      displayBlocks,
      columnsRemoved: 1,
      blocksRemoved: blocksToRemove,
      removedRange: {
        first: removedHeights[0],
        last: removedHeights[removedHeights.length - 1]
      }
    };
  }
  
  return {
    displayBlocks,
    columnsRemoved: 0,
    blocksRemoved: 0
  };
};

// 测试函数
const runTests = () => {
  console.log('=== 珠盘路按列滑动机制测试 ===\n');
  
  // 测试场景 1: 初始状态（264 条数据，填满）
  console.log('测试场景 1: 初始状态（264 条数据）');
  testInitialState();
  
  // 测试场景 2: 第 1 次更新（265 条数据，触发按列滑动）
  console.log('\n测试场景 2: 第 1 次更新（265 条数据）');
  testFirstUpdate();
  
  // 测试场景 3: 第 2-6 次更新（259-263 条数据，填充列43）
  console.log('\n测试场景 3: 第 2-6 次更新（259-263 条数据）');
  testSubsequentUpdates();
  
  // 测试场景 4: 第 7 次更新（265 条数据，再次触发按列滑动）
  console.log('\n测试场景 4: 第 7 次更新（265 条数据）');
  testSecondSliding();
  
  console.log('\n=== 所有测试完成 ===');
};

// 测试场景 1: 初始状态
const testInitialState = () => {
  try {
    // 创建 264 条数据（区块 136-399，降序排列：最新的在前）
    const blocks = [];
    for (let i = 399; i >= 136; i--) {
      blocks.push(generateMockBlock(i));
    }
    
    console.log(`  ✓ 准备：创建了 ${blocks.length} 条数据 (区块 ${blocks[blocks.length - 1].height}-${blocks[0].height})`);
    
    // 模拟按列滑动
    const result = simulateColumnSliding(blocks);
    
    // 验证：264 条数据会触发按列滑动
    if (result.columnsRemoved !== 1) {
      throw new Error(`预期删除 1 列，实际删除 ${result.columnsRemoved} 列`);
    }
    console.log(`  ✓ 验证：264 条数据触发按列滑动，删除 1 列`);
    
    // 验证：删除后剩余 258 条
    if (result.displayBlocks.length !== 258) {
      throw new Error(`预期 258 条数据，实际 ${result.displayBlocks.length} 条`);
    }
    console.log(`  ✓ 验证：删除后剩余 258 条数据`);
    
    // 验证：删除的是区块 136-141（最旧的数据，在数组末尾）
    if (result.removedRange.first !== 136 || result.removedRange.last !== 141) {
      throw new Error(`预期删除区块 136-141，实际删除 ${result.removedRange.first}-${result.removedRange.last}`);
    }
    console.log(`  ✓ 验证：删除的区块范围正确 (${result.removedRange.first}-${result.removedRange.last})`);
    
    // 验证：保留的是区块 142-399（最新的在前）
    if (result.displayBlocks[0].height !== 399 || result.displayBlocks[result.displayBlocks.length - 1].height !== 142) {
      throw new Error(`预期保留区块 142-399，实际 ${result.displayBlocks[result.displayBlocks.length - 1].height}-${result.displayBlocks[0].height}`);
    }
    console.log(`  ✓ 验证：保留区块范围正确 (${result.displayBlocks[result.displayBlocks.length - 1].height}-${result.displayBlocks[0].height})`);
    
    console.log('  ✅ 测试场景 1 通过！');
  } catch (error) {
    console.error('  ❌ 测试场景 1 失败:', error.message);
  }
};

// 测试场景 2: 第 1 次更新
const testFirstUpdate = () => {
  try {
    // 创建 265 条数据（区块 136-400，降序排列：最新的在前）
    const blocks = [];
    for (let i = 400; i >= 136; i--) {
      blocks.push(generateMockBlock(i));
    }
    
    console.log(`  ✓ 准备：创建了 ${blocks.length} 条数据 (区块 ${blocks[blocks.length - 1].height}-${blocks[0].height})`);
    
    // 模拟按列滑动
    const result = simulateColumnSliding(blocks);
    
    // 验证：应该删除 1 列（6 条数据）
    if (result.columnsRemoved !== 1) {
      throw new Error(`预期删除 1 列，实际删除 ${result.columnsRemoved} 列`);
    }
    console.log(`  ✓ 验证：删除了 1 列 (${result.blocksRemoved} 条数据)`);
    
    // 验证：删除的是区块 136-141（最旧的数据）
    if (result.removedRange.first !== 136 || result.removedRange.last !== 141) {
      throw new Error(`预期删除区块 136-141，实际删除 ${result.removedRange.first}-${result.removedRange.last}`);
    }
    console.log(`  ✓ 验证：删除的区块范围正确 (${result.removedRange.first}-${result.removedRange.last})`);
    
    // 验证：保留的数据量应该是 259
    if (result.displayBlocks.length !== 259) {
      throw new Error(`预期 259 条数据，实际 ${result.displayBlocks.length} 条`);
    }
    console.log(`  ✓ 验证：保留数据量正确 (${result.displayBlocks.length} 条)`);
    
    // 验证：保留的数据范围是 142-400（最新的在前）
    if (result.displayBlocks[0].height !== 400 || result.displayBlocks[result.displayBlocks.length - 1].height !== 142) {
      throw new Error(`预期保留区块 142-400，实际 ${result.displayBlocks[result.displayBlocks.length - 1].height}-${result.displayBlocks[0].height}`);
    }
    console.log(`  ✓ 验证：保留区块范围正确 (${result.displayBlocks[result.displayBlocks.length - 1].height}-${result.displayBlocks[0].height})`);
    
    console.log('  ✅ 测试场景 2 通过！');
  } catch (error) {
    console.error('  ❌ 测试场景 2 失败:', error.message);
  }
};

// 测试场景 3: 第 2-6 次更新
const testSubsequentUpdates = () => {
  try {
    // 测试 259 条数据（不触发按列滑动）
    const blocks259 = [];
    for (let i = 400; i >= 142; i--) {
      blocks259.push(generateMockBlock(i));
    }
    
    const result259 = simulateColumnSliding(blocks259);
    
    if (result259.columnsRemoved !== 0) {
      throw new Error(`259 条数据不应该触发按列滑动，但删除了 ${result259.columnsRemoved} 列`);
    }
    console.log(`  ✓ 验证：259 条数据不触发按列滑动`);
    
    // 测试 263 条数据（不触发按列滑动）
    const blocks263 = [];
    for (let i = 404; i >= 142; i--) {
      blocks263.push(generateMockBlock(i));
    }
    
    const result263 = simulateColumnSliding(blocks263);
    
    if (result263.columnsRemoved !== 0) {
      throw new Error(`263 条数据不应该触发按列滑动，但删除了 ${result263.columnsRemoved} 列`);
    }
    console.log(`  ✓ 验证：263 条数据不触发按列滑动`);
    
    // 测试 264 条数据（填满，触发按列滑动）
    const blocks264 = [];
    for (let i = 405; i >= 142; i--) {
      blocks264.push(generateMockBlock(i));
    }
    
    const result264 = simulateColumnSliding(blocks264);
    
    if (result264.columnsRemoved !== 1) {
      throw new Error(`264 条数据应该触发按列滑动，但删除了 ${result264.columnsRemoved} 列`);
    }
    console.log(`  ✓ 验证：264 条数据触发按列滑动，删除 1 列`);
    
    if (result264.displayBlocks.length !== 258) {
      throw new Error(`264 条数据删除后应该剩余 258 条，实际 ${result264.displayBlocks.length} 条`);
    }
    console.log(`  ✓ 验证：删除后剩余 258 条数据`);
    
    console.log('  ✅ 测试场景 3 通过！');
  } catch (error) {
    console.error('  ❌ 测试场景 3 失败:', error.message);
  }
};

// 测试场景 4: 第 7 次更新
const testSecondSliding = () => {
  try {
    // 创建 265 条数据（区块 142-406，降序排列：最新的在前）
    const blocks = [];
    for (let i = 406; i >= 142; i--) {
      blocks.push(generateMockBlock(i));
    }
    
    console.log(`  ✓ 准备：创建了 ${blocks.length} 条数据 (区块 ${blocks[blocks.length - 1].height}-${blocks[0].height})`);
    
    // 模拟按列滑动
    const result = simulateColumnSliding(blocks);
    
    // 验证：应该删除 1 列（6 条数据）
    if (result.columnsRemoved !== 1) {
      throw new Error(`预期删除 1 列，实际删除 ${result.columnsRemoved} 列`);
    }
    console.log(`  ✓ 验证：删除了 1 列 (${result.blocksRemoved} 条数据)`);
    
    // 验证：删除的是区块 142-147（最旧的数据）
    if (result.removedRange.first !== 142 || result.removedRange.last !== 147) {
      throw new Error(`预期删除区块 142-147，实际删除 ${result.removedRange.first}-${result.removedRange.last}`);
    }
    console.log(`  ✓ 验证：删除的区块范围正确 (${result.removedRange.first}-${result.removedRange.last})`);
    
    // 验证：保留的数据量应该是 259
    if (result.displayBlocks.length !== 259) {
      throw new Error(`预期 259 条数据，实际 ${result.displayBlocks.length} 条`);
    }
    console.log(`  ✓ 验证：保留数据量正确 (${result.displayBlocks.length} 条)`);
    
    // 验证：保留的数据范围是 148-406（最新的在前）
    if (result.displayBlocks[0].height !== 406 || result.displayBlocks[result.displayBlocks.length - 1].height !== 148) {
      throw new Error(`预期保留区块 148-406，实际 ${result.displayBlocks[result.displayBlocks.length - 1].height}-${result.displayBlocks[0].height}`);
    }
    console.log(`  ✓ 验证：保留区块范围正确 (${result.displayBlocks[result.displayBlocks.length - 1].height}-${result.displayBlocks[0].height})`);
    
    console.log('  ✅ 测试场景 4 通过！');
  } catch (error) {
    console.error('  ❌ 测试场景 4 失败:', error.message);
  }
};

// 运行测试
runTests();
