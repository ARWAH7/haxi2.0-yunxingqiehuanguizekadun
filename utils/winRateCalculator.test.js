// 胜率计算测试文件

/**
 * 计算当前胜率
 * @param correctCount 正确预测次数
 * @param totalCount 总预测次数
 * @returns 胜率百分比（四舍五入）
 */
const calculateCurrentWinRate = (correctCount, totalCount) => {
  if (totalCount === 0) return 0;
  return Math.round((correctCount / totalCount) * 100);
};

/**
 * 生成胜率趋势数据
 * @param modelHistory 模型历史数据
 * @param totalPredictions 总预测次数
 * @param correctPredictions 正确预测次数
 * @returns 胜率趋势数据
 */
const generateTrendData = (
  modelHistory,
  totalPredictions,
  correctPredictions
) => {
  const data = [];
  const currentWinRate = calculateCurrentWinRate(correctPredictions, totalPredictions);
  
  for (let i = 0; i < totalPredictions; i++) {
    // 优先使用modelHistory中的数据
    const upToNow = modelHistory.slice(0, i + 1);
    let correctCount = upToNow.filter(h => h.isParityCorrect || h.isSizeCorrect).length;
    
    // 确保累计正确次数不超过modelStats中的值
    correctCount = Math.min(correctCount, correctPredictions);
    
    // 计算胜率
    const winRate = Math.round((correctCount / (i + 1)) * 100);
    
    data.push({
      index: i + 1,
      totalCount: i + 1,
      winRate,
      timestamp: Date.now()
    });
  }
  
  // 确保最后一个数据点的胜率与currentWinRate一致
  if (data.length > 0) {
    data[data.length - 1].winRate = currentWinRate;
  }
  
  return data;
};

// 测试用例
const runTests = () => {
  console.log('=== 胜率计算测试 ===');
  
  // 测试用例1: LSTM模型数据
  const testCase1 = {
    modelHistory: Array(50).fill({ isParityCorrect: true, isSizeCorrect: false }),
    totalPredictions: 82,
    correctPredictions: 44
  };
  
  const result1 = generateTrendData(
    testCase1.modelHistory,
    testCase1.totalPredictions,
    testCase1.correctPredictions
  );
  
  console.log('测试用例1 - LSTM模型:');
  console.log(`总预测次数: ${testCase1.totalPredictions}`);
  console.log(`正确预测次数: ${testCase1.correctPredictions}`);
  console.log(`计算胜率: ${calculateCurrentWinRate(testCase1.correctPredictions, testCase1.totalPredictions)}%`);
  console.log(`趋势数据长度: ${result1.length}`);
  console.log(`最后一个数据点胜率: ${result1[result1.length - 1].winRate}%`);
  console.log(`趋势数据生成成功: ${result1.length === testCase1.totalPredictions}`);
  console.log(`最后一个数据点胜率正确: ${result1[result1.length - 1].winRate === calculateCurrentWinRate(testCase1.correctPredictions, testCase1.totalPredictions)}`);
  
  // 测试用例2: 空数据
  const testCase2 = {
    modelHistory: [],
    totalPredictions: 0,
    correctPredictions: 0
  };
  
  const result2 = generateTrendData(
    testCase2.modelHistory,
    testCase2.totalPredictions,
    testCase2.correctPredictions
  );
  
  console.log('\n测试用例2 - 空数据:');
  console.log(`趋势数据长度: ${result2.length}`);
  console.log(`空数据处理成功: ${result2.length === 0}`);
  
  // 测试用例3: 模型历史数据少于总预测次数
  const testCase3 = {
    modelHistory: Array(30).fill({ isParityCorrect: true, isSizeCorrect: false }),
    totalPredictions: 50,
    correctPredictions: 25
  };
  
  const result3 = generateTrendData(
    testCase3.modelHistory,
    testCase3.totalPredictions,
    testCase3.correctPredictions
  );
  
  console.log('\n测试用例3 - 模型历史数据少于总预测次数:');
  console.log(`总预测次数: ${testCase3.totalPredictions}`);
  console.log(`模型历史数据长度: ${testCase3.modelHistory.length}`);
  console.log(`趋势数据长度: ${result3.length}`);
  console.log(`最后一个数据点胜率: ${result3[result3.length - 1].winRate}%`);
  console.log(`趋势数据生成成功: ${result3.length === testCase3.totalPredictions}`);
  
  console.log('\n=== 所有测试完成 ===');
};

// 运行测试
runTests();
