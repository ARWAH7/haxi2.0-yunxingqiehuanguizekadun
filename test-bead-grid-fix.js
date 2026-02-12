// 测试全局索引系统的修复效果

// 模拟区块数据
function createMockBlocks(start, end) {
  const blocks = [];
  for (let i = start; i <= end; i++) {
    blocks.push({
      height: i,
      hash: `hash${i}`,
      resultValue: i % 10,
      type: i % 2 === 0 ? 'EVEN' : 'ODD',
      sizeType: i % 10 >= 5 ? 'BIG' : 'SMALL',
      timestamp: new Date().toISOString()
    });
  }
  return blocks;
}

// 测试全局索引计算
function testGlobalIndexSystem() {
  console.log('=== 测试全局索引系统 ===\n');
  
  // 场景 1：264 条数据（区块 137-400）
  console.log('场景 1：264 条数据（区块 137-400）');
  const blocks1 = createMockBlocks(137, 400);
  console.log(`数据量: ${blocks1.length} 条`);
  
  // 计算最后几个区块的全局索引
  const lastBlocks = blocks1.slice(-6);
  lastBlocks.forEach(block => {
    const globalIdx = Math.floor((block.height - 0) / 1);
    const globalCol = Math.floor(globalIdx / 6);
    const globalRow = globalIdx % 6;
    console.log(`  区块 ${block.height}: 全局索引 ${globalIdx}, 全局列 ${globalCol}, 全局行 ${globalRow}`);
  });
  
  console.log('\n场景 2：新区块 401 到达');
  const blocks2 = createMockBlocks(138, 401); // 删除 137，添加 401
  console.log(`数据量: ${blocks2.length} 条`);
  
  // 计算最后几个区块的全局索引
  const lastBlocks2 = blocks2.slice(-6);
  lastBlocks2.forEach(block => {
    const globalIdx = Math.floor((block.height - 0) / 1);
    const globalCol = Math.floor(globalIdx / 6);
    const globalRow = globalIdx % 6;
    console.log(`  区块 ${block.height}: 全局索引 ${globalIdx}, 全局列 ${globalCol}, 全局行 ${globalRow}`);
  });
  
  console.log('\n场景 3：新区块 402 到达');
  const blocks3 = createMockBlocks(139, 402); // 删除 138，添加 402
  console.log(`数据量: ${blocks3.length} 条`);
  
  // 计算最后几个区块的全局索引
  const lastBlocks3 = blocks3.slice(-6);
  lastBlocks3.forEach(block => {
    const globalIdx = Math.floor((block.height - 0) / 1);
    const globalCol = Math.floor(globalIdx / 6);
    const globalRow = globalIdx % 6;
    const marker = globalRow === 0 ? ' ✅ 新列的第一行！' : '';
    console.log(`  区块 ${block.height}: 全局索引 ${globalIdx}, 全局列 ${globalCol}, 全局行 ${globalRow}${marker}`);
  });
  
  console.log('\n=== 关键发现 ===');
  console.log('区块 400: 全局列 66, 全局行 4 (400 % 6 = 4)');
  console.log('区块 401: 全局列 66, 全局行 5 (401 % 6 = 5)');
  console.log('区块 402: 全局列 67, 全局行 0 (402 % 6 = 0) ✅ 新列的第一行！');
  console.log('\n当一列填满（6个单元格），下一个区块自动进入下一列的第一行（行0）');
}

// 运行测试
testGlobalIndexSystem();
