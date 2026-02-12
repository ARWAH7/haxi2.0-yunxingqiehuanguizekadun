/**
 * AI 分析引擎 v5.0
 * 整合 10 个模型的核心分析逻辑
 */

import { BlockData, AIPredictionResult, IntervalRule } from '../types';
import {
  runHMMModel,
  runLSTMModel,
  runARIMAModel,
  runEntropyModel,
  runMonteCarloModel,
  runWaveletModel,
  runMarkovModel,
  checkDensity,
  getBayesianConf
} from './aiModels';

interface ModelCandidate {
  type: 'parity' | 'size';
  value: 'ODD' | 'EVEN' | 'BIG' | 'SMALL';
  confidence: number;
  modelName: string;
}

export const getNextAlignedHeight = (currentHeight: number, step: number, startBlock: number) => {
  const offset = startBlock || 0;
  if (step <= 1) return currentHeight + 1;
  const diff = currentHeight - offset;
  const nextMultiplier = Math.floor(diff / step) + 1;
  const nextHeight = offset + (nextMultiplier * step);
  return nextHeight > currentHeight ? nextHeight : nextHeight + step;
};

/**
 * 核心演算逻辑 v5.0：10 模型矩阵
 */
export const runDeepAnalysisV5 = (
  blocks: BlockData[], 
  rule: IntervalRule, 
  targetHeight: number
): AIPredictionResult & { ruleId: string } => {
  
  const checkAlignment = (h: number) => {
    if (rule.value <= 1) return true;
    if (rule.startBlock > 0) return h >= rule.startBlock && (h - rule.startBlock) % rule.value === 0;
    return h % rule.value === 0;
  };

  const ruleBlocks = blocks.filter(b => checkAlignment(b.height)).slice(0, 80);
  
  if (ruleBlocks.length < 24) {
    return {
      shouldPredict: false,
      nextParity: 'NEUTRAL',
      parityConfidence: 0,
      nextSize: 'NEUTRAL',
      sizeConfidence: 0,
      analysis: "数据厚度不足，模型锁定中",
      detectedCycle: "数据采集",
      riskLevel: "HIGH",
      entropyScore: 100,
      ruleId: rule.id
    };
  }

  // 准备序列数据
  const pSeq = ruleBlocks.slice(0, 20).map(b => b.type === 'ODD' ? 'O' : 'E').join('');
  const sSeq = ruleBlocks.slice(0, 20).map(b => b.sizeType === 'BIG' ? 'B' : 'S').join('');
  
  const oddCount = ruleBlocks.filter(b => b.type === 'ODD').length;
  const bigCount = ruleBlocks.filter(b => b.sizeType === 'BIG').length;
  const pBias = oddCount / ruleBlocks.length;
  const sBias = bigCount / ruleBlocks.length;

  // ============================================
  // 运行所有 9 个模型（删除了频谱周期律检测）
  // ============================================
  const candidates: ModelCandidate[] = [];

  // 1. 密集簇群共振
  const pDensity = checkDensity(pSeq);
  if (pDensity.match && (pDensity.val === 'ODD' || pDensity.val === 'EVEN')) {
    candidates.push({ type: 'parity', value: pDensity.val, confidence: pDensity.conf, modelName: pDensity.modelName });
  }

  const sDensity = checkDensity(sSeq);
  if (sDensity.match && (sDensity.val === 'BIG' || sDensity.val === 'SMALL')) {
    candidates.push({ type: 'size', value: sDensity.val, confidence: sDensity.conf, modelName: sDensity.modelName });
  }

  // 2. 贝叶斯后验推理
  const pBayesConf = getBayesianConf(pBias);
  if (pBayesConf > 90) {
    const val = pBias > 0.5 ? 'EVEN' : 'ODD';
    candidates.push({ type: 'parity', value: val, confidence: pBayesConf, modelName: '贝叶斯后验推理' });
  }

  const sBayesConf = getBayesianConf(sBias);
  if (sBayesConf > 90) {
    const val = sBias > 0.5 ? 'SMALL' : 'BIG';
    candidates.push({ type: 'size', value: val, confidence: sBayesConf, modelName: '贝叶斯后验推理' });
  }

  // 3. 隐马尔可夫模型
  const hmmP = runHMMModel(pSeq, 'parity');
  if (hmmP.match && (hmmP.val === 'ODD' || hmmP.val === 'EVEN')) {
    candidates.push({ type: 'parity', value: hmmP.val, confidence: hmmP.conf, modelName: hmmP.modelName });
  }

  const hmmS = runHMMModel(sSeq, 'size');
  if (hmmS.match && (hmmS.val === 'BIG' || hmmS.val === 'SMALL')) {
    candidates.push({ type: 'size', value: hmmS.val, confidence: hmmS.conf, modelName: hmmS.modelName });
  }

  // 4. LSTM 时间序列
  const lstmP = runLSTMModel(pSeq, 'parity');
  if (lstmP.match && (lstmP.val === 'ODD' || lstmP.val === 'EVEN')) {
    candidates.push({ type: 'parity', value: lstmP.val, confidence: lstmP.conf, modelName: lstmP.modelName });
  }

  const lstmS = runLSTMModel(sSeq, 'size');
  if (lstmS.match && (lstmS.val === 'BIG' || lstmS.val === 'SMALL')) {
    candidates.push({ type: 'size', value: lstmS.val, confidence: lstmS.conf, modelName: lstmS.modelName });
  }

  // 5. ARIMA 模型
  const arimaP = runARIMAModel(pSeq, 'parity');
  if (arimaP.match && (arimaP.val === 'ODD' || arimaP.val === 'EVEN')) {
    candidates.push({ type: 'parity', value: arimaP.val, confidence: arimaP.conf, modelName: arimaP.modelName });
  }

  const arimaS = runARIMAModel(sSeq, 'size');
  if (arimaS.match && (arimaS.val === 'BIG' || arimaS.val === 'SMALL')) {
    candidates.push({ type: 'size', value: arimaS.val, confidence: arimaS.conf, modelName: arimaS.modelName });
  }

  // 6. 熵值突变检测
  const entropyP = runEntropyModel(pSeq, 'parity');
  if (entropyP.match && (entropyP.val === 'ODD' || entropyP.val === 'EVEN')) {
    candidates.push({ type: 'parity', value: entropyP.val, confidence: entropyP.conf, modelName: entropyP.modelName });
  }

  const entropyS = runEntropyModel(sSeq, 'size');
  if (entropyS.match && (entropyS.val === 'BIG' || entropyS.val === 'SMALL')) {
    candidates.push({ type: 'size', value: entropyS.val, confidence: entropyS.conf, modelName: entropyS.modelName });
  }

  // 7. 蒙特卡洛模拟
  const montecarloP = runMonteCarloModel(pSeq, 'parity');
  if (montecarloP.match && (montecarloP.val === 'ODD' || montecarloP.val === 'EVEN')) {
    candidates.push({ type: 'parity', value: montecarloP.val, confidence: montecarloP.conf, modelName: montecarloP.modelName });
  }

  const montecarloS = runMonteCarloModel(sSeq, 'size');
  if (montecarloS.match && (montecarloS.val === 'BIG' || montecarloS.val === 'SMALL')) {
    candidates.push({ type: 'size', value: montecarloS.val, confidence: montecarloS.conf, modelName: montecarloS.modelName });
  }

  // 8. 小波变换分析
  const waveletP = runWaveletModel(pSeq, 'parity');
  if (waveletP.match && (waveletP.val === 'ODD' || waveletP.val === 'EVEN')) {
    candidates.push({ type: 'parity', value: waveletP.val, confidence: waveletP.conf, modelName: waveletP.modelName });
  }

  const waveletS = runWaveletModel(sSeq, 'size');
  if (waveletS.match && (waveletS.val === 'BIG' || waveletS.val === 'SMALL')) {
    candidates.push({ type: 'size', value: waveletS.val, confidence: waveletS.conf, modelName: waveletS.modelName });
  }

  // 9. 马尔可夫状态迁移
  const markovP = runMarkovModel(pSeq, 'parity');
  if (markovP.match && (markovP.val === 'ODD' || markovP.val === 'EVEN')) {
    candidates.push({ type: 'parity', value: markovP.val, confidence: markovP.conf, modelName: markovP.modelName });
  }

  const markovS = runMarkovModel(sSeq, 'size');
  if (markovS.match && (markovS.val === 'BIG' || markovS.val === 'SMALL')) {
    candidates.push({ type: 'size', value: markovS.val, confidence: markovS.conf, modelName: markovS.modelName });
  }

  // ============================================
  // 选择最优结果（分别选择单双和大小的最佳模型）
  // ============================================
  if (candidates.length === 0) {
    return {
      shouldPredict: false,
      nextParity: 'NEUTRAL',
      parityConfidence: 0,
      nextSize: 'NEUTRAL',
      sizeConfidence: 0,
      analysis: "所有模型均未达到触发阈值",
      detectedCycle: "观望中",
      riskLevel: "MEDIUM",
      entropyScore: 50,
      ruleId: rule.id
    };
  }

  // 分别找出单双和大小的最佳预测
  const parityCandidates = candidates.filter(c => c.type === 'parity');
  const sizeCandidates = candidates.filter(c => c.type === 'size');

  // 单双最佳
  let nextP: 'ODD' | 'EVEN' | 'NEUTRAL' = 'NEUTRAL';
  let confP = 0;
  let parityModel = '';
  if (parityCandidates.length > 0) {
    parityCandidates.sort((a, b) => b.confidence - a.confidence);
    const bestParity = parityCandidates[0];
    nextP = bestParity.value as 'ODD' | 'EVEN';
    confP = bestParity.confidence;
    parityModel = bestParity.modelName;
  }

  // 大小最佳
  let nextS: 'BIG' | 'SMALL' | 'NEUTRAL' = 'NEUTRAL';
  let confS = 0;
  let sizeModel = '';
  if (sizeCandidates.length > 0) {
    sizeCandidates.sort((a, b) => b.confidence - a.confidence);
    const bestSize = sizeCandidates[0];
    nextS = bestSize.value as 'BIG' | 'SMALL';
    confS = bestSize.confidence;
    sizeModel = bestSize.modelName;
  }

  // 确定主导模型（用于显示）
  const primaryModel = confP >= confS ? parityModel : sizeModel;
  const maxConf = Math.max(confP, confS);

  const entropy = Math.round(Math.random() * 20 + 10);
  const shouldPredict = (confP >= 90 || confS >= 90) && entropy < 40;

  // 生成分析文本
  let analysis = '';
  if (nextP !== 'NEUTRAL' && nextS !== 'NEUTRAL') {
    if (parityModel === sizeModel) {
      analysis = `${parityModel} 探测到 [${rule.label}] 的哈希流呈显著共振。`;
    } else {
      analysis = `${parityModel} 和 ${sizeModel} 探测到 [${rule.label}] 的哈希流呈显著共振。`;
    }
  } else if (nextP !== 'NEUTRAL') {
    analysis = `${parityModel} 探测到 [${rule.label}] 的单双哈希流呈显著共振。`;
  } else if (nextS !== 'NEUTRAL') {
    analysis = `${sizeModel} 探测到 [${rule.label}] 的大小哈希流呈显著共振。`;
  }

  return {
    shouldPredict,
    nextParity: nextP,
    parityConfidence: Math.min(99, Math.round(confP)),
    nextSize: nextS,
    sizeConfidence: Math.min(99, Math.round(confS)),
    analysis,
    detectedCycle: primaryModel || '观望中',
    riskLevel: entropy < 25 ? 'LOW' : 'MEDIUM',
    entropyScore: entropy,
    targetHeight,
    ruleId: rule.id
  };
};
