/**
 * AI 预测模型集合 v5.0
 * 包含 10 个独立的预测模型
 */

import { BlockData } from '../types';

interface ModelResult {
  match: boolean;
  val: 'ODD' | 'EVEN' | 'BIG' | 'SMALL' | 'NEUTRAL';
  conf: number;
  modelName: string;
}

// ============================================
// 1. 隐马尔可夫模型 (HMM)
// ============================================
export const runHMMModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  // 定义隐藏状态：HOT（热态）、COLD（冷态）、BALANCED（平衡态）
  // 通过观测序列推断当前隐藏状态
  
  const len = seq.length;
  if (len < 15) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '隐马尔可夫模型' };
  
  // 计算状态转换概率
  let transitions = 0;
  for (let i = 1; i < Math.min(len, 15); i++) {
    if (seq[i] !== seq[i-1]) transitions++;
  }
  
  const transitionRate = transitions / 14;
  
  // 识别隐藏状态
  if (transitionRate > 0.7) {
    // 高转换率 = 平衡态 = 交替模式
    const pattern = seq.slice(0, 6);
    if (pattern === 'OEOEOE' || pattern === 'EOEOEO' || pattern === 'BSBSBS' || pattern === 'SBSBSB') {
      const nextVal = seq[0] === 'O' ? 'EVEN' : seq[0] === 'E' ? 'ODD' : seq[0] === 'B' ? 'SMALL' : 'BIG';
      return { match: true, val: nextVal as any, conf: 92, modelName: '隐马尔可夫模型' };
    }
  } else if (transitionRate < 0.3) {
    // 低转换率 = 热态/冷态 = 连续模式
    const first = seq[0];
    let count = 0;
    for (let i = 0; i < Math.min(len, 10); i++) {
      if (seq[i] === first) count++;
    }
    if (count >= 7) {
      // 连续出现，预测继续
      const nextVal = first === 'O' ? 'ODD' : first === 'E' ? 'EVEN' : first === 'B' ? 'BIG' : 'SMALL';
      return { match: true, val: nextVal as any, conf: 91, modelName: '隐马尔可夫模型' };
    }
  }
  
  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '隐马尔可夫模型' };
};

// ============================================
// 2. LSTM 时间序列模型
// ============================================
export const runLSTMModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  // 简化版 LSTM：使用权重衰减模拟记忆机制
  const len = seq.length;
  if (len < 20) return { match: false, val: 'NEUTRAL', conf: 0, modelName: 'LSTM时间序列' };
  
  // 计算加权频率（近期权重高）
  let weight0 = 0, weight1 = 0;
  for (let i = 0; i < Math.min(len, 20); i++) {
    const weight = Math.exp(-i * 0.1); // 指数衰减
    if (type === 'parity') {
      if (seq[i] === 'O') weight0 += weight;
      else if (seq[i] === 'E') weight1 += weight;
    } else {
      if (seq[i] === 'B') weight0 += weight;
      else if (seq[i] === 'S') weight1 += weight;
    }
  }
  
  const total = weight0 + weight1;
  
  // 预测
  if (total > 0) {
    const bias = weight0 / total;
    if (bias > 0.62) {
      const val = type === 'parity' ? 'ODD' : 'BIG';
      return { match: true, val: val as any, conf: 92, modelName: 'LSTM时间序列' };
    }
    if (bias < 0.38) {
      const val = type === 'parity' ? 'EVEN' : 'SMALL';
      return { match: true, val: val as any, conf: 92, modelName: 'LSTM时间序列' };
    }
  }
  
  return { match: false, val: 'NEUTRAL', conf: 0, modelName: 'LSTM时间序列' };
};

// ============================================
// 3. ARIMA 自回归移动平均
// ============================================
export const runARIMAModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  const len = seq.length;
  if (len < 15) return { match: false, val: 'NEUTRAL', conf: 0, modelName: 'ARIMA模型' };

  // 正确的自相关系数（ACF）计算：中心化 + 归一化
  const numSeq = Array.from(seq).map(c => (c === 'O' || c === 'B') ? 1 : 0);
  const mean = numSeq.reduce((a, b) => a + b, 0) / numSeq.length;
  const variance = numSeq.reduce((s, v) => s + (v - mean) ** 2, 0) / numSeq.length;

  const calculateACF = (lag: number): number => {
    if (variance === 0) return 0;
    let sum = 0;
    for (let i = 0; i < len - lag; i++) {
      sum += (numSeq[i] - mean) * (numSeq[i + lag] - mean);
    }
    return sum / ((len - lag) * variance);
  };

  const acf1 = calculateACF(1);
  const acf2 = calculateACF(2);
  const acf3 = calculateACF(3);

  const primaryChar = type === 'parity' ? 'O' : 'B';
  const secondaryChar = type === 'parity' ? 'E' : 'S';

  // 1. 强负相关 = 交替模式（ACF(1) 显著为负）
  if (acf1 < -0.3) {
    const nextVal = seq[0] === primaryChar
      ? (type === 'parity' ? 'EVEN' : 'SMALL')
      : (type === 'parity' ? 'ODD' : 'BIG');
    return { match: true, val: nextVal as any, conf: 92, modelName: 'ARIMA模型' };
  }

  // 2. 强正相关 = 趋势延续（ACF(1) 显著为正）
  if (acf1 > 0.25) {
    const nextVal = seq[0] === primaryChar
      ? (type === 'parity' ? 'ODD' : 'BIG')
      : (type === 'parity' ? 'EVEN' : 'SMALL');
    return { match: true, val: nextVal as any, conf: 91, modelName: 'ARIMA模型' };
  }

  // 3. 周期2检测（ACF(2) 显著为正且 ACF(1) 接近0）
  if (acf2 > 0.25 && Math.abs(acf1) < 0.15) {
    // 近期偏向判断
    const recent5 = seq.slice(0, 5);
    const pCount = (recent5.match(new RegExp(primaryChar, 'g')) || []).length;
    if (pCount >= 4) {
      const val = type === 'parity' ? 'ODD' : 'BIG';
      return { match: true, val: val as any, conf: 90, modelName: 'ARIMA模型' };
    }
    if (pCount <= 1) {
      const val = type === 'parity' ? 'EVEN' : 'SMALL';
      return { match: true, val: val as any, conf: 90, modelName: 'ARIMA模型' };
    }
  }

  return { match: false, val: 'NEUTRAL', conf: 0, modelName: 'ARIMA模型' };
};

// ============================================
// 4. 熵值突变检测（最高准确率）
// ============================================
export const runEntropyModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  const len = seq.length;
  if (len < 12) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '熵值突变检测' };
  
  // 计算香农熵
  const calculateEntropy = (subSeq: string): number => {
    const freq: Record<string, number> = {};
    for (const char of subSeq) {
      freq[char] = (freq[char] || 0) + 1;
    }
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / subSeq.length;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return entropy;
  };
  
  // 计算近期和远期的熵值
  const recentEntropy = calculateEntropy(seq.slice(0, 6));
  const previousEntropy = calculateEntropy(seq.slice(6, 12));
  
  // 检测熵值突变（从高到低 = 从混乱到有序）
  const entropyDrop = previousEntropy - recentEntropy;
  const entropyDropRate = entropyDrop / previousEntropy;
  
  if (entropyDropRate > 0.25 && recentEntropy < 0.75) {
    // 熵值显著下降，系统变得有序
    const recent = seq.slice(0, 6);
    
    if (type === 'parity') {
      const oCount = (recent.match(/O/g) || []).length;
      const eCount = (recent.match(/E/g) || []).length;
      
      // 单双预测
      if (oCount >= 5) return { match: true, val: 'ODD', conf: 95, modelName: '熵值突变检测' };
      if (eCount >= 5) return { match: true, val: 'EVEN', conf: 95, modelName: '熵值突变检测' };
      if (oCount >= 4) return { match: true, val: 'ODD', conf: 91, modelName: '熵值突变检测' };
      if (eCount >= 4) return { match: true, val: 'EVEN', conf: 91, modelName: '熵值突变检测' };
    } else {
      const bCount = (recent.match(/B/g) || []).length;
      const sCount = (recent.match(/S/g) || []).length;
      
      // 大小预测
      if (bCount >= 5) return { match: true, val: 'BIG', conf: 95, modelName: '熵值突变检测' };
      if (sCount >= 5) return { match: true, val: 'SMALL', conf: 95, modelName: '熵值突变检测' };
      if (bCount >= 4) return { match: true, val: 'BIG', conf: 91, modelName: '熵值突变检测' };
      if (sCount >= 4) return { match: true, val: 'SMALL', conf: 91, modelName: '熵值突变检测' };
    }
  }
  
  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '熵值突变检测' };
};

// ============================================
// 5. 蒙特卡洛模拟
// ============================================
export const runMonteCarloModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  const len = seq.length;
  if (len < 12) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '蒙特卡洛模拟' };
  
  // 基于历史分布进行模拟
  if (type === 'parity') {
    const oCount = (seq.match(/O/g) || []).length;
    const eCount = (seq.match(/E/g) || []).length;
    const totalP = oCount + eCount;
    
    if (totalP === 0) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '蒙特卡洛模拟' };
    
    // 运行 1000 次模拟
    const simulations = 1000;
    let oSim = 0, eSim = 0;
    
    for (let i = 0; i < simulations; i++) {
      if (Math.random() < oCount / totalP) oSim++;
      else eSim++;
    }
    
    // 计算概率
    const oProbability = oSim / simulations;
    const eProbability = eSim / simulations;
    
    // 降低阈值，单双预测
    if (oProbability > 0.60) {
      const conf = Math.min(99, Math.max(90, Math.round(oProbability * 100 + 30)));
      return { match: true, val: 'ODD', conf, modelName: '蒙特卡洛模拟' };
    }
    if (eProbability > 0.60) {
      const conf = Math.min(99, Math.max(90, Math.round(eProbability * 100 + 30)));
      return { match: true, val: 'EVEN', conf, modelName: '蒙特卡洛模拟' };
    }
  } else {
    const bCount = (seq.match(/B/g) || []).length;
    const sCount = (seq.match(/S/g) || []).length;
    const totalS = bCount + sCount;
    
    if (totalS === 0) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '蒙特卡洛模拟' };
    
    // 运行 1000 次模拟
    const simulations = 1000;
    let bSim = 0, sSim = 0;
    
    for (let i = 0; i < simulations; i++) {
      if (Math.random() < bCount / totalS) bSim++;
      else sSim++;
    }
    
    // 计算概率
    const bProbability = bSim / simulations;
    const sProbability = sSim / simulations;
    
    // 降低阈值，大小预测
    if (bProbability > 0.60) {
      const conf = Math.min(99, Math.max(90, Math.round(bProbability * 100 + 30)));
      return { match: true, val: 'BIG', conf, modelName: '蒙特卡洛模拟' };
    }
    if (sProbability > 0.60) {
      const conf = Math.min(99, Math.max(90, Math.round(sProbability * 100 + 30)));
      return { match: true, val: 'SMALL', conf, modelName: '蒙特卡洛模拟' };
    }
  }
  
  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '蒙特卡洛模拟' };
};

// ============================================
// 6. 小波变换分析
// ============================================
export const runWaveletModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  const len = seq.length;
  if (len < 16) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '小波变换分析' };
  
  // 简化版 Haar 小波变换
  const haarTransform = (data: number[]): { low: number[], high: number[] } => {
    const low: number[] = [];
    const high: number[] = [];
    for (let i = 0; i < data.length - 1; i += 2) {
      low.push((data[i] + data[i + 1]) / 2);
      high.push((data[i] - data[i + 1]) / 2);
    }
    return { low, high };
  };
  
  // 将序列转换为数值
  const numSeq = seq.split('').map(c => (c === 'O' || c === 'B') ? 1 : 0);
  
  // 进行小波分解
  const { low, high } = haarTransform(numSeq.slice(0, 16));
  
  // 分析低频（长期趋势）
  const lowAvg = low.reduce((a, b) => a + b, 0) / low.length;
  
  // 分析高频（短期波动）
  const highAvg = Math.abs(high.reduce((a, b) => a + b, 0) / high.length);
  
  // 降低阈值，多尺度一致性检测
  if (lowAvg > 0.62 && highAvg < 0.35) {
    // 低频高 + 高频低 = 稳定的上升趋势
    if (type === 'parity') {
      return { match: true, val: 'ODD', conf: 91, modelName: '小波变换分析' };
    } else {
      return { match: true, val: 'BIG', conf: 91, modelName: '小波变换分析' };
    }
  } else if (lowAvg < 0.38 && highAvg < 0.35) {
    // 低频低 + 高频低 = 稳定的下降趋势
    if (type === 'parity') {
      return { match: true, val: 'EVEN', conf: 91, modelName: '小波变换分析' };
    } else {
      return { match: true, val: 'SMALL', conf: 91, modelName: '小波变换分析' };
    }
  }
  
  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '小波变换分析' };
};

// ============================================
// 原有模型（保持兼容）
// ============================================
// 频谱周期律检测模型已删除

// 7. 马尔可夫状态迁移
export const runMarkovModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  const len = seq.length;
  if (len < 15) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '马尔可夫状态迁移' };
  
  // 计算状态转移概率矩阵
  const transitions: Record<string, Record<string, number>> = {};
  
  for (let i = 0; i < len - 1; i++) {
    const current = seq[i];
    const next = seq[i + 1];
    
    if (!transitions[current]) transitions[current] = {};
    transitions[current][next] = (transitions[current][next] || 0) + 1;
  }
  
  // 计算转移概率
  for (const current in transitions) {
    const total = Object.values(transitions[current]).reduce((a, b) => a + b, 0);
    for (const next in transitions[current]) {
      transitions[current][next] /= total;
    }
  }
  
  // 根据最近状态预测下一个状态
  const lastState = seq[0];
  if (transitions[lastState]) {
    const probs = transitions[lastState];
    const maxProb = Math.max(...Object.values(probs));
    
    if (maxProb > 0.65) {
      const nextState = Object.keys(probs).find(k => probs[k] === maxProb);
      if (nextState) {
        let val: 'ODD' | 'EVEN' | 'BIG' | 'SMALL' | 'NEUTRAL' = 'NEUTRAL';
        if (type === 'parity') {
          if (nextState === 'O') val = 'ODD';
          else if (nextState === 'E') val = 'EVEN';
        } else {
          if (nextState === 'B') val = 'BIG';
          else if (nextState === 'S') val = 'SMALL';
        }
        
        if (val !== 'NEUTRAL') {
          const conf = Math.min(99, Math.max(90, Math.round(maxProb * 100)));
          return { match: true, val, conf, modelName: '马尔可夫状态迁移' };
        }
      }
    }
  }
  
  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '马尔可夫状态迁移' };
};

export const checkDensity = (seq: string) => {
  if (seq.startsWith('OOOO')) return { match: true, val: 'ODD', conf: 95, modelName: '密集簇群共振' };
  if (seq.startsWith('EEEE')) return { match: true, val: 'EVEN', conf: 95, modelName: '密集簇群共振' };
  if (seq.startsWith('BBBB')) return { match: true, val: 'BIG', conf: 95, modelName: '密集簇群共振' };
  if (seq.startsWith('SSSS')) return { match: true, val: 'SMALL', conf: 95, modelName: '密集簇群共振' };
  // 降低要求，3连续也可以触发
  if (seq.startsWith('OOO')) return { match: true, val: 'ODD', conf: 91, modelName: '密集簇群共振' };
  if (seq.startsWith('EEE')) return { match: true, val: 'EVEN', conf: 91, modelName: '密集簇群共振' };
  if (seq.startsWith('BBB')) return { match: true, val: 'BIG', conf: 91, modelName: '密集簇群共振' };
  if (seq.startsWith('SSS')) return { match: true, val: 'SMALL', conf: 91, modelName: '密集簇群共振' };
  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '密集簇群共振' };
};

// Bayesian 置信度：接受 recentBias（近期20块）和 fullBias（全量）
// 两个尺度结合判断，近期窗口方差大更容易触发
export const getBayesianConf = (bias: number, recentBias?: number) => {
  const fullDev = Math.abs(bias - 0.5);
  const recentDev = recentBias !== undefined ? Math.abs(recentBias - 0.5) : fullDev;
  // 近期偏差优先（更敏感），全局偏差作为辅助
  const effectiveDev = Math.max(recentDev, fullDev * 0.8);
  if (effectiveDev > 0.20) return 95;
  if (effectiveDev > 0.15) return 92;
  if (effectiveDev > 0.10) return 91;
  if (effectiveDev > 0.07) return 90;
  return 50;
};

// ============================================
// 10. 游程编码分析 (RLE)
// ============================================
export const runRLEModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  const len = seq.length;
  if (len < 12) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '游程编码分析' };

  // 将序列分割为连续段（runs）
  const runs: { char: string; length: number }[] = [];
  let i = 0;
  while (i < len) {
    const char = seq[i];
    let runLen = 1;
    while (i + runLen < len && seq[i + runLen] === char) runLen++;
    runs.push({ char, length: runLen });
    i += runLen;
  }

  if (runs.length < 4) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '游程编码分析' };

  // 计算同字符段的平均长度（分开统计）
  const currentRun = runs[0];
  const sameCharRuns = runs.filter(r => r.char === currentRun.char);
  const avgSameLen = sameCharRuns.length > 1
    ? sameCharRuns.slice(1).reduce((s, r) => s + r.length, 0) / (sameCharRuns.length - 1)
    : 2;

  const charToVal = (c: string): 'ODD' | 'EVEN' | 'BIG' | 'SMALL' => {
    if (c === 'O') return 'ODD';
    if (c === 'E') return 'EVEN';
    if (c === 'B') return 'BIG';
    return 'SMALL';
  };

  // 1. 当前段刚开始（长度 < 同类历史平均），趋势延续
  if (currentRun.length < avgSameLen && currentRun.length >= 2) {
    return { match: true, val: charToVal(currentRun.char), conf: 91, modelName: '游程编码分析' };
  }

  // 2. 当前段已超过同类历史平均 × 1.2，趋势即将反转
  if (currentRun.length >= avgSameLen * 1.2 && currentRun.length >= 3) {
    const reverseVal = type === 'parity'
      ? (currentRun.char === 'O' ? 'EVEN' : 'ODD')
      : (currentRun.char === 'B' ? 'SMALL' : 'BIG');
    return { match: true, val: reverseVal as any, conf: 91, modelName: '游程编码分析' };
  }

  // 3. 最近3段呈递增趋势（段长越来越长），当前段可能继续
  if (runs.length >= 3 && runs[0].length > runs[1].length && runs[1].length > runs[2].length) {
    return { match: true, val: charToVal(currentRun.char), conf: 90, modelName: '游程编码分析' };
  }

  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '游程编码分析' };
};

// ============================================
// 11. 斐波那契回撤分析
// ============================================
export const runFibonacciModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  const len = seq.length;
  if (len < 13) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '斐波那契回撤' };

  const fibWindows = [3, 5, 8, 13];
  const primaryChar = type === 'parity' ? 'O' : 'B';
  const secondaryChar = type === 'parity' ? 'E' : 'S';

  let primaryWins = 0;
  let secondaryWins = 0;

  // 在每个斐波那契窗口中统计占比
  for (const w of fibWindows) {
    if (w > len) continue;
    const window = seq.slice(0, w);
    const pCount = (window.match(new RegExp(primaryChar, 'g')) || []).length;
    const ratio = pCount / w;

    if (ratio >= 0.618) primaryWins++;
    else if (ratio <= 0.382) secondaryWins++;
  }

  // 3+个窗口一致偏向同一值
  if (primaryWins >= 3) {
    const val = type === 'parity' ? 'ODD' : 'BIG';
    return { match: true, val: val as any, conf: 92, modelName: '斐波那契回撤' };
  }
  if (secondaryWins >= 3) {
    const val = type === 'parity' ? 'EVEN' : 'SMALL';
    return { match: true, val: val as any, conf: 92, modelName: '斐波那契回撤' };
  }

  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '斐波那契回撤' };
};

// ============================================
// 12. 梯度动量模型
// ============================================
export const runGradientMomentumModel = (seq: string, type: 'parity' | 'size'): ModelResult => {
  const len = seq.length;
  if (len < 15) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '梯度动量模型' };

  const windowSize = 5;
  const primaryChar = type === 'parity' ? 'O' : 'B';

  // 计算每个滑动窗口内的偏差（主值占比 - 0.5）
  const gradients: number[] = [];
  for (let i = 0; i <= len - windowSize; i++) {
    const window = seq.slice(i, i + windowSize);
    const count = (window.match(new RegExp(primaryChar, 'g')) || []).length;
    gradients.push(count / windowSize - 0.5);
  }

  if (gradients.length < 4) return { match: false, val: 'NEUTRAL', conf: 0, modelName: '梯度动量模型' };

  // 计算梯度变化方向（最近的窗口在前）
  let increasing = 0;
  let decreasing = 0;
  for (let i = 0; i < Math.min(gradients.length - 1, 5); i++) {
    if (gradients[i] > gradients[i + 1]) increasing++; // 偏差在增加（趋势加速）
    else if (gradients[i] < gradients[i + 1]) decreasing++; // 偏差在减少（趋势减速）
  }

  // 连续3+窗口偏差增加 = 加速趋势
  if (increasing >= 3 && gradients[0] > 0.1) {
    const val = type === 'parity' ? 'ODD' : 'BIG';
    return { match: true, val: val as any, conf: 91, modelName: '梯度动量模型' };
  }
  if (increasing >= 3 && gradients[0] < -0.1) {
    const val = type === 'parity' ? 'EVEN' : 'SMALL';
    return { match: true, val: val as any, conf: 91, modelName: '梯度动量模型' };
  }

  // 连续3+窗口偏差减少 = 趋势反转信号
  if (decreasing >= 3 && gradients[0] > 0.1) {
    const val = type === 'parity' ? 'EVEN' : 'SMALL';
    return { match: true, val: val as any, conf: 90, modelName: '梯度动量模型' };
  }
  if (decreasing >= 3 && gradients[0] < -0.1) {
    const val = type === 'parity' ? 'ODD' : 'BIG';
    return { match: true, val: val as any, conf: 90, modelName: '梯度动量模型' };
  }

  return { match: false, val: 'NEUTRAL', conf: 0, modelName: '梯度动量模型' };
};
