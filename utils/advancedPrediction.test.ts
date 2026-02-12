// 高级预测模型测试文件
import { arimaForecast, bayesianForecast, integratedForecast } from './advancedPrediction';

// 测试数据
const testData = {
  parity: 'OEOEOEOEOEOEOEOE', // 单双交替
  size: 'BSBSBSBSBSBSBSBS'   // 大小交替
};

// 运行测试
const runTests = () => {
  console.log('=== 高级预测模型测试 ===\n');
  
  // 测试ARIMA模型
  console.log('1. ARIMA模型测试:');
  testARIMAModel();
  
  // 测试贝叶斯后验推理
  console.log('\n2. 贝叶斯后验推理测试:');
  testBayesianModel();
  
  // 测试集成预测
  console.log('\n3. 集成预测模型测试:');
  testIntegratedModel();
  
  console.log('\n=== 所有测试完成 ===');
};

// 测试ARIMA模型
const testARIMAModel = () => {
  try {
    // 测试单双预测
    const arimaResultParity = arimaForecast(testData.parity, 'parity', 5);
    console.log('   单双预测:');
    console.log('   - 模型名称:', arimaResultParity.modelName);
    console.log('   - 预测点数:', arimaResultParity.predictions.length);
    console.log('   - 置信区间数:', arimaResultParity.confidenceIntervals.length);
    console.log('   - 准确率:', (arimaResultParity.evaluationMetrics.accuracy * 100).toFixed(2) + '%');
    console.log('   - 预测结果:', arimaResultParity.predictions.map(p => p.value));
    
    // 测试大小预测
    const arimaResultSize = arimaForecast(testData.size, 'size', 5);
    console.log('   大小预测:');
    console.log('   - 预测点数:', arimaResultSize.predictions.length);
    console.log('   - 置信区间数:', arimaResultSize.confidenceIntervals.length);
    console.log('   - 准确率:', (arimaResultSize.evaluationMetrics.accuracy * 100).toFixed(2) + '%');
    console.log('   - 预测结果:', arimaResultSize.predictions.map(p => p.value));
  } catch (error) {
    console.error('ARIMA模型测试失败:', error);
  }
};

// 测试贝叶斯后验推理
const testBayesianModel = () => {
  try {
    // 测试单双预测
    const bayesianResultParity = bayesianForecast(testData.parity, 'parity', 5);
    console.log('   单双预测:');
    console.log('   - 模型名称:', bayesianResultParity.modelName);
    console.log('   - 预测点数:', bayesianResultParity.predictions.length);
    console.log('   - 置信区间数:', bayesianResultParity.confidenceIntervals.length);
    console.log('   - 准确率:', (bayesianResultParity.evaluationMetrics.accuracy * 100).toFixed(2) + '%');
    console.log('   - 预测结果:', bayesianResultParity.predictions.map(p => p.value));
    
    // 测试大小预测
    const bayesianResultSize = bayesianForecast(testData.size, 'size', 5);
    console.log('   大小预测:');
    console.log('   - 预测点数:', bayesianResultSize.predictions.length);
    console.log('   - 置信区间数:', bayesianResultSize.confidenceIntervals.length);
    console.log('   - 准确率:', (bayesianResultSize.evaluationMetrics.accuracy * 100).toFixed(2) + '%');
    console.log('   - 预测结果:', bayesianResultSize.predictions.map(p => p.value));
  } catch (error) {
    console.error('贝叶斯后验推理测试失败:', error);
  }
};

// 测试集成预测
const testIntegratedModel = () => {
  try {
    // 测试单双预测
    const integratedResultParity = integratedForecast(testData.parity, 'parity', 5);
    console.log('   单双预测:');
    console.log('   - 模型名称:', integratedResultParity.modelName);
    console.log('   - 预测点数:', integratedResultParity.predictions.length);
    console.log('   - 置信区间数:', integratedResultParity.confidenceIntervals.length);
    console.log('   - 准确率:', (integratedResultParity.evaluationMetrics.accuracy * 100).toFixed(2) + '%');
    console.log('   - 预测结果:', integratedResultParity.predictions.map(p => p.value));
    
    // 测试大小预测
    const integratedResultSize = integratedForecast(testData.size, 'size', 5);
    console.log('   大小预测:');
    console.log('   - 预测点数:', integratedResultSize.predictions.length);
    console.log('   - 置信区间数:', integratedResultSize.confidenceIntervals.length);
    console.log('   - 准确率:', (integratedResultSize.evaluationMetrics.accuracy * 100).toFixed(2) + '%');
    console.log('   - 预测结果:', integratedResultSize.predictions.map(p => p.value));
  } catch (error) {
    console.error('集成预测模型测试失败:', error);
  }
};

// 运行测试
runTests();
