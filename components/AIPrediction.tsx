
import React, { useState, useEffect, memo, useMemo, useCallback, useRef } from 'react';
import { BlockData, AIPredictionResult, PredictionHistoryItem, IntervalRule } from '../types';
import { BrainCircuit, Sparkles, Target, RefreshCw, CheckCircle2, XCircle, Clock, ShieldCheck, Activity, Filter, Trophy, Loader2, ChevronRight, BookOpen, HelpCircle, X, Microscope, Network, Download, Trash2 } from 'lucide-react';
import { runDeepAnalysisV5, getNextAlignedHeight } from '../utils/aiAnalysis';
import { InteractiveChart } from './InteractiveChart';
import { ModelTrendAnalysisModal } from './ModelTrendAnalysisModal';
import { 
  savePrediction, 
  loadPredictions, 
  clearPredictions,
  saveModelStats as saveModelStatsAPI,
  loadModelStats,
  clearModelStats,
  debouncedSaveModelStats
} from '../services/aiApi';

interface AIPredictionProps {
  allBlocks: BlockData[];
  rules: IntervalRule[];
}

type PredictionFilter = 'ALL' | 'ODD' | 'EVEN' | 'BIG' | 'SMALL';

/**
 * 识别模型专家级详细定义 - 升级版 v4.0
 */
const AI_MODELS_DOCS = [
  {
    id: "markov",
    name: "马尔可夫状态迁移 (Markov Chain)",
    short: "捕捉震荡与规律",
    desc: "该模型基于一阶马尔可夫链，通过分析序列中状态（单/双、大/小）的转移概率矩阵来工作。在 4.0 版本中，我们增强了对交替模式（如 1-2 跳）的识别精度，只有当转移概率超过 92% 时才触发预警。",
    icon: <RefreshCw className="w-5 h-5 text-blue-500" />,
    color: "text-blue-500",
    bg: "bg-blue-50"
  },
  {
    id: "bayesian",
    name: "贝叶斯后验推理 (Bayesian Inference)",
    short: "极值风险评估",
    desc: "基于大数定律与贝叶斯定理。模型实时计算当前序列分布相对于理论哈希期望值的后验偏差。当某一属性（如双）在统计学上呈现出 3 倍标准差以上的偏离时，模型会介入，寻找概率回归的‘转折点’。",
    icon: <Microscope className="w-5 h-5 text-emerald-500" />,
    color: "text-emerald-500",
    bg: "bg-emerald-50"
  },  {
    id: "density",
    name: "密集簇群共振 (Density Clustering)",
    short: "寻找能量爆发点",
    desc: "基于数据聚类算法。模型扫描微观窗口（近 10 期）内的结果分布密度。当‘单’或‘双’呈现出高密度的聚簇（Cluster）且伴随哈希熵值下降时，代表当前市场能量正在单向释放，此时输出的‘动量信号’具有极高的确定性。",
    icon: <Network className="w-5 h-5 text-purple-500" />,
    color: "text-purple-500",
    bg: "bg-purple-50"
  }
];

const AIPrediction: React.FC<AIPredictionProps> = memo(({ allBlocks, rules }) => {
  const [activeFilter, setActiveFilter] = useState<PredictionFilter>('ALL');
  const [selectedRuleId, setSelectedRuleId] = useState<string>('ALL');
  const [selectedModelId, setSelectedModelId] = useState<string>('ALL');
  const [selectedHistoryRuleId, setSelectedHistoryRuleId] = useState<string>('ALL');
  const [selectedModelForChart, setSelectedModelForChart] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isPredicting, setIsPredicting] = useState(false); // 默认为停止状态
  const lastAnalyzedHeight = useRef(0);

  const [history, setHistory] = useState<(PredictionHistoryItem & { ruleId: string })[]>([]);

  // 模型性能统计（累计所有预测，不限制数量）
  const [modelStats, setModelStats] = useState<Record<string, { total: number; correct: number }>>({});

  // 从后端加载数据
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        console.log('[AI 预测] 🔄 开始从 Redis 加载数据...');
        
        // 并行加载预测历史和模型统计
        const [predictions, stats] = await Promise.all([
          loadPredictions(),
          loadModelStats()
        ]);

        if (predictions && predictions.length > 0) {
          setHistory(predictions);
          console.log('[AI 预测] ✅ 预测历史已加载:', predictions.length, '条');
        }
        
        if (stats && Object.keys(stats).length > 0) {
          setModelStats(stats);
          console.log('[AI 预测] ✅ 模型统计已加载');
        }

        console.log('[AI 预测] ✅ 从 Redis 加载数据成功');
      } catch (error) {
        console.error('[AI 预测] ❌ 加载数据失败:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // 保存预测历史到后端（防抖）
  useEffect(() => {
    if (history.length > 0) {
      // 保存最新的预测记录
      const latestPrediction = history[0];
      savePrediction(latestPrediction);
    }
  }, [history]);

  // 保存模型统计到后端（防抖）
  useEffect(() => {
    if (Object.keys(modelStats).length > 0) {
      debouncedSaveModelStats(modelStats);
    }
  }, [modelStats]);

  // 清除历史记录函数
  const clearHistory = useCallback(async () => {
    const confirmed = window.confirm('确定要清除所有历史预测记录吗？此操作不可恢复。');
    if (!confirmed) return;

    try {
      setIsLoading(true);
      // 调用后端 API 清除预测历史
      const success = await clearPredictions();
      if (success) {
        setHistory([]);
        console.log('[AI 预测] ✅ 预测历史已清除');
      }
    } catch (error) {
      console.error('[AI 预测] ❌ 清除预测历史失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 开始预测
  const startPrediction = useCallback(() => {
    setIsPredicting(true);
    setError(null);
    console.log('[预测控制] 开始预测');
  }, []);

  // 停止预测
  const stopPrediction = useCallback(() => {
    setIsPredicting(false);
    setError(null);
    console.log('[预测控制] 停止预测');
  }, []);

  // 清除所有数据
  const clearAllData = useCallback(async () => {
    const confirmed = window.confirm('确定要清除所有模型统计数据和演算历史吗？此操作不可恢复。');
    if (!confirmed) return;

    try {
      setIsLoading(true);
      setError(null);
      
      // 调用后端 API 清除所有数据
      await Promise.all([
        clearPredictions(),
        clearModelStats()
      ]);
      
      // 清除前端状态
      setHistory([]);
      setModelStats({});
      
      console.log('[AI 预测] ✅ 已清除所有数据');
      
      // 强制刷新页面以确保状态完全重置
      window.location.reload();
    } catch (error) {
      console.error('[AI 预测] ❌ 清除数据失败:', error);
      setError('清除数据失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 导出历史记录函数
  const exportHistory = useCallback(async () => {
    try {
      setIsExporting(true);
      setError(null);
      
      // 从后端API获取所有历史数据
      console.log('[导出] 正在从后端API获取历史数据...');
      const response = await fetch('http://localhost:3001/api/ai/predictions?limit=10000');
      const result = await response.json();
      
      let exportData: typeof history = [];
      
      if (result.success && result.data && result.data.length > 0) {
        console.log('[导出] 成功从后端API获取', result.data.length, '条历史数据');
        // 只导出已验证的记录，这样才能和模型统计保持一致
        exportData = result.data.filter((item: any) => item.resolved === true);
        console.log('[导出] 过滤后已验证的记录:', exportData.length, '条');
      } else {
        console.error('[导出] 从后端API获取失败或数据为空');
        setError('暂无历史记录可导出');
        setIsExporting(false);
        return;
      }
      
      // 确保数据不为空
      if (exportData.length === 0) {
        setError('暂无已验证的历史记录可导出');
        setIsExporting(false);
        return;
      }
      
      // 按预测高度降序排序（高度大的在前）
      exportData.sort((a, b) => (b.targetHeight || 0) - (a.targetHeight || 0));
      
      console.log('[导出] 开始处理', exportData.length, '条已验证的历史数据...');

      // 准备 CSV 数据 - 新的9列格式
      const headers = ['时间', '规则', '预测高度', '演算模型', '预测', '实际', '结果', '置信度', '状态'];
      const rows = exportData.map(item => {
        const rule = rules.find(r => r.id === item.ruleId);
        const timestamp = new Date(item.timestamp).toLocaleString('zh-CN');
        const status = item.resolved ? '已验证' : '待验证';
        
        // 判断预测类型：单双、大小、还是两者都有
        const hasParity = item.nextParity !== 'NEUTRAL';
        const hasSize = item.nextSize !== 'NEUTRAL';
        
        // 预测列：根据预测类型显示
        let prediction = '';
        if (hasParity && hasSize) {
          prediction = `${item.nextParity === 'ODD' ? '单' : '双'} / ${item.nextSize === 'BIG' ? '大' : '小'}`;
        } else if (hasParity) {
          prediction = item.nextParity === 'ODD' ? '单' : '双';
        } else if (hasSize) {
          prediction = item.nextSize === 'BIG' ? '大' : '小';
        } else {
          prediction = '观望';
        }
        
        // 实际列：根据预测类型显示实际结果
        let actual = '';
        if (item.resolved) {
          if (hasParity && hasSize) {
            actual = `${item.actualParity === 'ODD' ? '单' : '双'} / ${item.actualSize === 'BIG' ? '大' : '小'}`;
          } else if (hasParity) {
            actual = item.actualParity === 'ODD' ? '单' : '双';
          } else if (hasSize) {
            actual = item.actualSize === 'BIG' ? '大' : '小';
          }
        }
        
        // 结果列：根据预测类型显示结果
        let result = '';
        if (item.resolved) {
          if (hasParity && hasSize) {
            const parityCorrect = item.isParityCorrect ? '✓' : '✗';
            const sizeCorrect = item.isSizeCorrect ? '✓' : '✗';
            result = `${parityCorrect} / ${sizeCorrect}`;
          } else if (hasParity) {
            result = item.isParityCorrect ? '✓ 正确' : '✗ 错误';
          } else if (hasSize) {
            result = item.isSizeCorrect ? '✓ 正确' : '✗ 错误';
          }
        } else {
          result = '待验证';
        }
        
        // 置信度列：根据预测类型显示置信度
        let confidence = '';
        if (hasParity && hasSize) {
          confidence = `${item.parityConfidence}% / ${item.sizeConfidence}%`;
        } else if (hasParity) {
          confidence = `${item.parityConfidence}%`;
        } else if (hasSize) {
          confidence = `${item.sizeConfidence}%`;
        }
        
        return [
          timestamp,
          rule?.label || '未知规则',
          item.targetHeight || '',
          item.detectedCycle || '',
          prediction,
          actual,
          result,
          confidence,
          status
        ];
      });

      // 生成 CSV 内容
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      // 添加 BOM 以支持中文
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      
      // 创建下载链接
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `AI预测历史_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('[导出] 成功导出', exportData.length, '条历史数据');
      setIsExporting(false);
    } catch (error) {
      console.error('[导出] 导出失败:', error);
      setError('导出失败，请稍后重试');
      setIsExporting(false);
    }
  }, [rules]);

  // 清除指定规则的历史记录
  const clearRuleHistory = useCallback((ruleId: string) => {
    const ruleName = rules.find(r => r.id === ruleId)?.label || '该规则';
    const confirmed = window.confirm(`确定要清除 ${ruleName} 的所有历史预测记录吗？`);
    if (confirmed) {
      setHistory(prev => prev.filter(item => item.ruleId !== ruleId));
    }
  }, [rules]);

  // 1. 修复点：删除规则时清理对应历史
  useEffect(() => {
    const activeRuleIds = new Set(rules.map(r => r.id));
    setHistory(prev => {
      const filtered = prev.filter(item => activeRuleIds.has(item.ruleId));
      if (filtered.length !== prev.length) {
        return filtered;
      }
      return prev;
    });
  }, [rules]);

  // 从后端API获取历史数据和模型统计数据
  useEffect(() => {
    const fetchHistoryAndStats = async () => {
      try {
        setIsLoading(true);
        setError(null);
        // 获取历史预测数据
        const historyResponse = await fetch('http://localhost:3001/api/ai/predictions?limit=10000');
        const historyResult = await historyResponse.json();
        if (historyResult.success && historyResult.data) {
          console.log('[数据加载] 成功从后端API获取', historyResult.data.length, '条历史预测数据');
          setHistory(historyResult.data);
        }

        // 获取模型统计数据
        const statsResponse = await fetch('http://localhost:3001/api/ai/model-stats');
        const statsResult = await statsResponse.json();
        if (statsResult.success && statsResult.data) {
          console.log('[数据加载] 成功从后端API获取模型统计数据');
          setModelStats(statsResult.data);
        }
      } catch (error) {
        console.error('[数据加载] 从后端API获取数据失败:', error);
        setError('数据加载失败，请稍后刷新');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistoryAndStats();
  }, []);

  // ⚡ 基于内容的指纹，避免 allBlocks 引用变化触发昂贵的重新计算
  const blocksFingerprint = useMemo(() => {
    if (allBlocks.length === 0) return '';
    return `${allBlocks.length}-${allBlocks[0]?.height}-${allBlocks[allBlocks.length - 1]?.height}`;
  }, [allBlocks]);

  // 2. 修复点：新增规则时从最新高度往后计算 targetHeight
  const rulesMatrix = useMemo(() => {
    if (allBlocks.length < 50) return [];
    const currentHeight = allBlocks[0].height;
    return rules.map(rule => {
      // 确保预测高度严格大于当前最新高度
      const targetHeight = getNextAlignedHeight(currentHeight, rule.value, rule.startBlock);
      return { rule, result: runDeepAnalysisV5(allBlocks, rule, targetHeight) };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksFingerprint, rules]);

  const ruleAccuracyStats = useMemo(() => {
    const stats: Record<string, { 
      pAcc: number; sAcc: number; 
      oddAcc: number; evenAcc: number; 
      bigAcc: number; smallAcc: number; 
      total: number 
    }> = {};
    
    rules.forEach(r => {
      const rHistory = history.filter(h => h.ruleId === r.id && h.resolved);
      if (rHistory.length === 0) {
        stats[r.id] = { pAcc: 0, sAcc: 0, oddAcc: 0, evenAcc: 0, bigAcc: 0, smallAcc: 0, total: 0 };
      } else {
        const pHistory = rHistory.filter(h => h.nextParity !== 'NEUTRAL');
        const sHistory = rHistory.filter(h => h.nextSize !== 'NEUTRAL');
        
        const oddPreds = pHistory.filter(h => h.nextParity === 'ODD');
        const evenPreds = pHistory.filter(h => h.nextParity === 'EVEN');
        const bigPreds = sHistory.filter(h => h.nextSize === 'BIG');
        const smallPreds = sHistory.filter(h => h.nextSize === 'SMALL');

        const oddAcc = oddPreds.length > 0 ? Math.round((oddPreds.filter(p => p.isParityCorrect).length / oddPreds.length) * 100) : 0;
        const evenAcc = evenPreds.length > 0 ? Math.round((evenPreds.filter(p => p.isParityCorrect).length / evenPreds.length) * 100) : 0;
        const bigAcc = bigPreds.length > 0 ? Math.round((bigPreds.filter(p => p.isSizeCorrect).length / bigPreds.length) * 100) : 0;
        const smallAcc = smallPreds.length > 0 ? Math.round((smallPreds.filter(p => p.isSizeCorrect).length / smallPreds.length) * 100) : 0;

        const pMatch = pHistory.filter(h => h.isParityCorrect).length;
        const sMatch = sHistory.filter(h => h.isSizeCorrect).length;
        
        stats[r.id] = { 
          pAcc: pHistory.length > 0 ? Math.round((pMatch / pHistory.length) * 100) : 0, 
          sAcc: sHistory.length > 0 ? Math.round((sMatch / sHistory.length) * 100) : 0,
          oddAcc, evenAcc, bigAcc, smallAcc,
          total: rHistory.length 
        };
      }
    });
    return stats;
  }, [history, rules]);

  useEffect(() => {
    if (allBlocks.length < 50 || isSyncing || !isPredicting) return;
    const currentTop = allBlocks[0].height;
    
    // 我们在这里监听高度变化或规则变化
    setIsSyncing(true);

    // ⚡ 构建已有预测的快速查找 Set，O(1) 替代 O(n) 的 history.some()
    const existingParityKeys = new Set(
      history.filter(h => h.nextParity !== 'NEUTRAL' && h.nextSize === 'NEUTRAL')
        .map(h => `${h.ruleId}-${h.targetHeight}`)
    );
    const existingSizeKeys = new Set(
      history.filter(h => h.nextSize !== 'NEUTRAL' && h.nextParity === 'NEUTRAL')
        .map(h => `${h.ruleId}-${h.targetHeight}`)
    );

    const newPredictions: (PredictionHistoryItem & { ruleId: string })[] = [];

    rulesMatrix
      .filter(m => m.result.shouldPredict)
      .forEach(m => {
        const hasParity = m.result.nextParity !== 'NEUTRAL';
        const hasSize = m.result.nextSize !== 'NEUTRAL';
        const lookupKey = `${m.rule.id}-${m.result.targetHeight}`;

        // 如果同时有单双和大小预测，分成两条记录
        if (hasParity && hasSize) {
          // 检查单双预测是否已存在
          if (!existingParityKeys.has(lookupKey)) {
            // 单双预测记录
            newPredictions.push({
              ...m.result,
              id: `pred-${m.rule.id}-parity-${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
              resolved: false,
              ruleId: m.rule.id,
              detectedCycle: m.result.detectedCycle,
              nextSize: 'NEUTRAL', // 只显示单双
              sizeConfidence: 0
            });
          }

          // 检查大小预测是否已存在
          if (!existingSizeKeys.has(lookupKey)) {
            // 大小预测记录
            newPredictions.push({
              ...m.result,
              id: `pred-${m.rule.id}-size-${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
              resolved: false,
              ruleId: m.rule.id,
              detectedCycle: m.result.detectedCycle,
              nextParity: 'NEUTRAL', // 只显示大小
              parityConfidence: 0
            });
          }
        } else {
          // 只有单双或只有大小，检查是否已存在
          const existsInSet = hasParity
            ? existingParityKeys.has(lookupKey)
            : existingSizeKeys.has(lookupKey);

          if (!existsInSet) {
            newPredictions.push({
              ...m.result,
              id: `pred-${m.rule.id}-${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
              resolved: false,
              ruleId: m.rule.id,
              detectedCycle: m.result.detectedCycle
            });
          }
        }
      });

    if (newPredictions.length > 0) {
      // 保存当前历史状态，用于回滚
      const originalHistory = [...history];
      
      // 乐观更新前端状态
      setHistory(prev => {
        const combined = [...newPredictions, ...prev];
        
        // 按时间戳排序，最新的在前面
        const sortedHistory = combined.sort((a, b) => b.timestamp - a.timestamp);
        
        // 前端显示所有记录（不再限制为50条）
        return sortedHistory;
      });
      
      // 保存新预测到后端数据库
      const savePromises = newPredictions.map(prediction => {
        return fetch('http://localhost:3001/api/ai/predictions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(prediction)
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            console.log('[预测保存] 成功保存预测到后端数据库:', prediction.targetHeight);
            return true;
          } else {
            console.error('[预测保存] 保存预测到后端数据库失败:', result.error);
            return false;
          }
        })
        .catch(error => {
          console.error('[预测保存] 保存预测到后端数据库失败:', error);
          return false;
        });
      });
      
      // 等待所有保存操作完成
      Promise.all(savePromises).then(results => {
        const allSuccess = results.every(result => result);
        if (!allSuccess) {
          console.error('[预测保存] 部分或全部预测保存失败，回滚前端状态');
          // 回滚前端状态
          setHistory(originalHistory);
          setError('预测保存失败，请稍后重试');
        }
      });
    }
    setIsSyncing(false);
  }, [allBlocks[0]?.height, rulesMatrix, history.length, isPredicting]); // 依赖项调整

  useEffect(() => {
    if (allBlocks.length === 0 || history.length === 0) return;
    const latest = allBlocks[0];
    let changed = false;
    const newlyResolved: (PredictionHistoryItem & { ruleId: string })[] = [];
    
    const newHistory = history.map(item => {
      if (!item.resolved && latest.height >= (item.targetHeight || 0)) {
        const target = allBlocks.find(b => b.height === item.targetHeight);
        if (target) {
          changed = true;
          const resolvedItem = { 
            ...item, 
            resolved: true, 
            actualParity: target.type, 
            actualSize: target.sizeType, 
            isParityCorrect: item.nextParity === target.type, 
            isSizeCorrect: item.nextSize === target.sizeType 
          };
          newlyResolved.push(resolvedItem);
          return resolvedItem;
        }
      }
      return item;
    });
    
    if (changed) {
      setHistory(newHistory);
      
      // 保存已验证的预测记录到后端数据库
      if (newlyResolved.length > 0) {
        newlyResolved.forEach(resolvedItem => {
          fetch('http://localhost:3001/api/ai/predictions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(resolvedItem)
          })
          .then(response => response.json())
          .then(result => {
            if (result.success) {
              console.log('[预测更新] 成功更新已验证的预测记录到后端数据库:', resolvedItem.targetHeight);
            } else {
              console.error('[预测更新] 更新预测记录到后端数据库失败:', result.error);
            }
          })
          .catch(error => {
            console.error('[预测更新] 更新预测记录到后端数据库失败:', error);
          });
        });
      }
      
      // 更新模型统计数据 - 基于所有已验证的记录重新计算，而不是累加
      if (newlyResolved.length > 0) {
        // 重新计算所有已验证记录的模型统计
        const allResolvedRecords = newHistory.filter(h => h.resolved);
        const recalculatedStats: Record<string, { total: number; correct: number }> = {};
        
        allResolvedRecords.forEach(item => {
          const model = item.detectedCycle;
          if (model) {
            if (!recalculatedStats[model]) {
              recalculatedStats[model] = { total: 0, correct: 0 };
            }
            recalculatedStats[model].total++;
            if (item.isParityCorrect || item.isSizeCorrect) {
              recalculatedStats[model].correct++;
            }
          }
        });
        
        setModelStats(recalculatedStats);

        // 保存模型统计数据到后端数据库
        fetch('http://localhost:3001/api/ai/model-stats', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(recalculatedStats)
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            console.log('[统计保存] 成功保存模型统计数据到后端数据库');
          } else {
            console.error('[统计保存] 保存模型统计数据到后端数据库失败:', result.error);
          }
        })
        .catch(error => {
          console.error('[统计保存] 保存模型统计数据到后端数据库失败:', error);
        });
      }
    }
  }, [allBlocks, history]);

  const filteredHistory = useMemo(() => {
    let base = history;
    if (selectedRuleId !== 'ALL') base = base.filter(h => h.ruleId === selectedRuleId);
    if (selectedHistoryRuleId !== 'ALL') base = base.filter(h => h.ruleId === selectedHistoryRuleId);
    if (selectedModelId !== 'ALL') base = base.filter(h => h.detectedCycle === selectedModelId);
    if (activeFilter !== 'ALL') {
      base = base.filter(h => {
        if (activeFilter === 'ODD' || activeFilter === 'EVEN') return h.nextParity === activeFilter;
        if (activeFilter === 'BIG' || activeFilter === 'SMALL') return h.nextSize === activeFilter;
        return true;
      });
    }
    
    // 排序：未开奖的在最上面（按区块高度降序），已开奖的在下面（按区块高度降序）
    const sorted = base.sort((a, b) => {
      // 如果一个已开奖，一个未开奖，未开奖的排在前面
      if (a.resolved !== b.resolved) {
        return a.resolved ? 1 : -1;
      }
      // 同样状态的按区块高度降序排列（高度大的在前）
      return (b.targetHeight || 0) - (a.targetHeight || 0);
    });
    
    return sorted;
  }, [history, selectedRuleId, selectedHistoryRuleId, selectedModelId, activeFilter]);
  
  // 分页数据
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredHistory.slice(startIndex, endIndex);
  }, [filteredHistory, currentPage, pageSize]);
  
  // 总页数
  const totalPages = useMemo(() => {
    return Math.ceil(filteredHistory.length / pageSize);
  }, [filteredHistory, pageSize]);

  // Dummy variable to prevent errors (FOCUS PANEL removed)
  const focusedRuleResult = null;

  // 计算模型性能排行（使用累计统计数据）
  const modelPerformance = useMemo(() => {
    // 定义所有9个模型
    const allModels = [
      '隐马尔可夫模型',
      'LSTM时间序列',
      'ARIMA模型',
      '熵值突变检测',
      '蒙特卡洛模拟',
      '小波变换分析',
      '马尔可夫状态迁移',
      '贝叶斯后验推理',
      '密集簇群共振'
    ];
    
    return allModels.map(model => {
      const stats = modelStats[model] || { total: 0, correct: 0 };
      return {
        model,
        accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
        total: stats.total,
        correct: stats.correct
      };
    }).sort((a, b) => {
      // 先按准确率排序，准确率相同则按预测次数排序
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return b.total - a.total;
    });
  }, [modelStats]);

  // 计算总体统计
  const overallStats = useMemo(() => {
    const resolved = history.filter(h => h.resolved);
    if (resolved.length === 0) return { accuracy: 0, total: 0, correct: 0, winRate: 0, riskLevel: 'MEDIUM' };
    
    const correct = resolved.filter(h => h.isParityCorrect || h.isSizeCorrect).length;
    const accuracy = Math.round((correct / resolved.length) * 100);
    const winRate = accuracy;
    
    // 计算风险等级
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    if (accuracy >= 80) riskLevel = 'LOW';
    else if (accuracy < 60) riskLevel = 'HIGH';
    
    return { 
      accuracy, 
      total: resolved.length, 
      correct, 
      winRate,
      riskLevel
    };
  }, [history]);

  // ⚡ 智能推荐逻辑：从 IIFE 提取为 useMemo，避免每次渲染重新计算
  const smartRecommendation = useMemo(() => {
    const recentHistory = history.filter(h => h.resolved).slice(0, 50);
    const modelScores = modelPerformance.map(model => {
      const recentPredictions = recentHistory.filter(h => h.detectedCycle === model.model);
      const recentAccuracy = recentPredictions.length > 0
        ? Math.round((recentPredictions.filter(h => h.isParityCorrect || h.isSizeCorrect).length / recentPredictions.length) * 100)
        : 0;
      const last10 = recentPredictions.slice(0, 10);
      const stability = last10.length >= 5 ? 100 - (Math.abs(recentAccuracy - model.accuracy)) : 50;
      const score = (model.accuracy * 0.5) + (recentAccuracy * 0.3) + (stability * 0.2);
      return {
        ...model,
        recentAccuracy,
        stability,
        score,
        isActive: recentPredictions.length > 0
      };
    }).filter(m => m.total >= 3);
    modelScores.sort((a, b) => b.score - a.score);
    return modelScores[0] || null;
  }, [history, modelPerformance]);

  // ⚡ 市场环境识别：从 IIFE 提取为 useMemo
  const marketEnvironment = useMemo(() => {
    const recentHistory = history.filter(h => h.resolved).slice(0, 30);
    if (recentHistory.length < 10) return null;

    const accuracies = recentHistory.map((h, i) => {
      const upToNow = recentHistory.slice(i);
      const correct = upToNow.filter(h2 => h2.isParityCorrect || h2.isSizeCorrect).length;
      return (correct / upToNow.length) * 100;
    });

    const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    const variance = accuracies.reduce((sum, acc) => sum + Math.pow(acc - avgAccuracy, 2), 0) / accuracies.length;
    const stdDev = Math.sqrt(variance);

    const firstHalf = recentHistory.slice(0, Math.floor(recentHistory.length / 2));
    const secondHalf = recentHistory.slice(Math.floor(recentHistory.length / 2));
    const firstHalfAcc = (firstHalf.filter(h => h.isParityCorrect || h.isSizeCorrect).length / firstHalf.length) * 100;
    const secondHalfAcc = (secondHalf.filter(h => h.isParityCorrect || h.isSizeCorrect).length / secondHalf.length) * 100;
    const trend = secondHalfAcc - firstHalfAcc;

    let marketCondition: 'stable' | 'volatile' | 'trending_up' | 'trending_down' = 'stable';
    let conditionText = '稳定';
    let conditionColor = 'bg-green-50 text-green-700';
    let conditionIcon = '📊';

    if (stdDev > 15) {
      marketCondition = 'volatile';
      conditionText = '波动';
      conditionColor = 'bg-red-50 text-red-700';
      conditionIcon = '⚠️';
    } else if (trend > 10) {
      marketCondition = 'trending_up';
      conditionText = '上升';
      conditionColor = 'bg-blue-50 text-blue-700';
      conditionIcon = '📈';
    } else if (trend < -10) {
      marketCondition = 'trending_down';
      conditionText = '下降';
      conditionColor = 'bg-orange-50 text-orange-700';
      conditionIcon = '📉';
    }

    return { marketCondition, conditionText, conditionColor, conditionIcon };
  }, [history]);

  return (
    <div className="space-y-12 max-w-7xl mx-auto pb-32 px-4 relative">
      
      {/* 模型性能排行榜 */}
      <section className="bg-white p-8 rounded-[3rem] border-2 border-gray-100 shadow-lg">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h4 className="text-xl font-black text-gray-900 flex items-center">
              <Trophy className="w-5 h-5 mr-2 text-purple-600" />
              模型性能排行榜
            </h4>
          </div>
          <div className="flex gap-3">
            <button
              onClick={startPrediction}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center space-x-2 ${
                isPredicting ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
              }`}
              disabled={isPredicting}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>开始预测</span>
            </button>
            <button
              onClick={stopPrediction}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center space-x-2 ${
                !isPredicting ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
              }`}
              disabled={!isPredicting}
            >
              <XCircle className="w-3 h-3" />
              <span>停止预测</span>
            </button>
            <button
              onClick={clearAllData}
              className="px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center space-x-2"
            >
              <Trash2 className="w-3 h-3" />
              <span>清除所有数据</span>
            </button>
          </div>
        </div>

        {/* 总体统计卡片 */}
        {modelPerformance.length > 0 && (() => {
          const totalPredictions = modelPerformance.reduce((sum, m) => sum + m.total, 0);
          const totalCorrect = modelPerformance.reduce((sum, m) => sum + m.correct, 0);
          const overallAccuracy = totalPredictions > 0 ? Math.round((totalCorrect / totalPredictions) * 100) : 0;
          const activeModels = modelPerformance.filter(m => m.total > 0).length;
          const bestModel = modelPerformance[0];
          const avgAccuracy = modelPerformance.length > 0 
            ? Math.round(modelPerformance.reduce((sum, m) => sum + m.accuracy, 0) / modelPerformance.length) 
            : 0;

          return (
            <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* 总预测场次 */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-2xl border-2 border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-black text-blue-600 uppercase tracking-wider">总场次</span>
                </div>
                <p className="text-3xl font-black text-blue-900">{totalPredictions}</p>
                <p className="text-xs text-blue-600 mt-1">{activeModels}/9 模型活跃</p>
              </div>

              {/* 成功预测场次 */}
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-5 rounded-2xl border-2 border-emerald-100">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-wider">成功</span>
                </div>
                <p className="text-3xl font-black text-emerald-900">{totalCorrect}</p>
                <p className="text-xs text-emerald-600 mt-1">{totalPredictions - totalCorrect} 次失败</p>
              </div>

              {/* 总胜率 */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-5 rounded-2xl border-2 border-purple-100">
                <div className="flex items-center justify-between mb-2">
                  <Target className="w-5 h-5 text-purple-600" />
                  <span className="text-xs font-black text-purple-600 uppercase tracking-wider">总胜率</span>
                </div>
                <p className="text-3xl font-black text-purple-900">{overallAccuracy}%</p>
                <div className="mt-2 bg-white/50 rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                    style={{ width: `${overallAccuracy}%` }}
                  />
                </div>
              </div>

              {/* 智能推荐 */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-2xl border-2 border-amber-100">
                <div className="flex items-center justify-between mb-2">
                  <Sparkles className="w-5 h-5 text-amber-600" />
                  <span className="text-xs font-black text-amber-600 uppercase tracking-wider">智能推荐</span>
                </div>
                {!smartRecommendation ? (
                  <div className="text-center py-2">
                    <p className="text-sm text-amber-700">暂无推荐</p>
                    <p className="text-xs text-amber-500 mt-1">等待更多数据</p>
                  </div>
                ) : (
                  <>
                    <p className="text-lg font-black text-amber-900 truncate" title={smartRecommendation.model}>
                      {smartRecommendation.model.length > 8 ? smartRecommendation.model.substring(0, 8) + '...' : smartRecommendation.model}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center space-x-1">
                        <span className="text-xs text-amber-600">
                          {smartRecommendation.accuracy}%
                        </span>
                        <span className="text-xs text-amber-400">·</span>
                        <span className="text-xs text-amber-600">
                          {smartRecommendation.total}场
                        </span>
                      </div>
                      {smartRecommendation.isActive && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[9px] font-black rounded-full">
                          活跃
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {modelPerformance.length > 0 ? (
          <div className="space-y-4">
            {modelPerformance.map((model, idx) => (
              <div 
                key={idx} 
                className="relative cursor-pointer hover:bg-gray-50 rounded-2xl p-3 -mx-3 transition-all"
                onClick={() => model.total > 0 && setSelectedModelForChart(model.model)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className={`text-2xl font-black ${
                      idx === 0 ? 'text-amber-500' : 
                      idx === 1 ? 'text-gray-400' : 
                      idx === 2 ? 'text-orange-400' : 
                      'text-gray-300'
                    }`}>
                      #{idx + 1}
                    </span>
                    <span className="text-sm font-bold text-gray-700">{model.model}</span>
                    {model.total > 0 && (
                      <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-32 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          model.accuracy >= 90 ? 'bg-gradient-to-r from-green-500 to-emerald-600' :
                          model.accuracy >= 80 ? 'bg-gradient-to-r from-blue-500 to-indigo-600' :
                          model.accuracy >= 70 ? 'bg-gradient-to-r from-amber-500 to-orange-600' :
                          'bg-gradient-to-r from-gray-400 to-gray-500'
                        }`}
                        style={{ width: `${model.accuracy}%` }}
                      />
                    </div>
                    <span className="text-lg font-black text-indigo-600 w-12 text-right">{model.accuracy}%</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2 text-xs text-gray-400 ml-11">
                  <span>{model.correct}胜 / {model.total - model.correct}负</span>
                  <span>·</span>
                  <span>共{model.total}次预测</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-gray-400">
            <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold">暂无模型数据</p>
            <p className="text-xs mt-1">开始预测后将显示各模型的性能统计</p>
          </div>
        )}
      </section>

      {/* 模型性能趋势图表模态框 */}
      {selectedModelForChart && (
        <ModelTrendAnalysisModal 
          modelId={selectedModelForChart} 
          onClose={() => setSelectedModelForChart(null)} 
          modelStats={modelStats} 
        />
      )}

      {/* MATRIX CONTROLS */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">AI 数据稳定演算矩阵</h3>
              {/* 市场环境识别 */}
              {!marketEnvironment ? (
                <div className="flex items-center space-x-2 mt-2">
                  <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg font-semibold text-sm">
                    数据收集中...
                  </span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 mt-2">
                  <span className={`px-3 py-1 rounded-lg font-semibold text-sm flex items-center space-x-1 ${marketEnvironment.conditionColor}`}>
                    <span>{marketEnvironment.conditionIcon}</span>
                    <span>市场环境：{marketEnvironment.conditionText}</span>
                  </span>
                  {marketEnvironment.marketCondition === 'volatile' && (
                    <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold">
                      建议谨慎
                    </span>
                  )}
                  {marketEnvironment.marketCondition === 'trending_up' && (
                    <span className="px-2 py-1 bg-green-50 text-green-600 rounded-lg text-xs font-bold">
                      表现改善
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* MATRIX GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rulesMatrix.map((item, idx) => {
            const stats = ruleAccuracyStats[item.rule.id];
            
            return (
              <div 
                key={idx} 
                className="bg-white p-5 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-lg transition-all duration-200 relative group"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold">
                        {item.rule.label}
                      </span>
                      {item.result.shouldPredict && (
                        <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                      )}
                    </div>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center justify-between px-2 py-1 bg-red-50 rounded">
                        <span className="text-gray-600 font-medium">单</span>
                        <span className="text-red-600 font-bold">{stats?.oddAcc || 0}%</span>
                      </div>
                      <div className="flex items-center justify-between px-2 py-1 bg-teal-50 rounded">
                        <span className="text-gray-600 font-medium">双</span>
                        <span className="text-teal-600 font-bold">{stats?.evenAcc || 0}%</span>
                      </div>
                      <div className="flex items-center justify-between px-2 py-1 bg-orange-50 rounded">
                        <span className="text-gray-600 font-medium">大</span>
                        <span className="text-orange-600 font-bold">{stats?.bigAcc || 0}%</span>
                      </div>
                      <div className="flex items-center justify-between px-2 py-1 bg-indigo-50 rounded">
                        <span className="text-gray-600 font-medium">小</span>
                        <span className="text-indigo-600 font-bold">{stats?.smallAcc || 0}%</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Prediction Display */}
                {item.result.shouldPredict ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                        <span className="text-xs text-gray-500 font-medium block mb-1">单双</span>
                        <div className="text-2xl font-bold" style={{ 
                          color: item.result.nextParity === 'NEUTRAL' ? '#94a3b8' : 
                                (item.result.nextParity === 'ODD' ? '#ef4444' : '#14b8a6') 
                        }}>
                          {item.result.nextParity === 'NEUTRAL' ? '-' : 
                           (item.result.nextParity === 'ODD' ? '单' : '双')}
                        </div>
                      </div>
                      <div className="text-center p-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                        <span className="text-xs text-gray-500 font-medium block mb-1">大小</span>
                        <div className="text-2xl font-bold" style={{ 
                          color: item.result.nextSize === 'NEUTRAL' ? '#94a3b8' : 
                                (item.result.nextSize === 'BIG' ? '#f97316' : '#6366f1') 
                        }}>
                          {item.result.nextSize === 'NEUTRAL' ? '-' : 
                           (item.result.nextSize === 'BIG' ? '大' : '小')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs bg-indigo-50 px-3 py-2 rounded-lg">
                      <span className="text-gray-600 font-medium">目标高度</span>
                      <span className="text-indigo-600 font-bold tabular-nums">#{item.result.targetHeight}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center opacity-40">
                    <Microscope className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-xs text-gray-500 font-medium">等待信号...</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* FOCUS PANEL - REMOVED */}
      {false && focusedRuleResult && (
        <section className="bg-white rounded-[4rem] p-10 md:p-14 shadow-2xl border-4 border-indigo-50 animate-in fade-in slide-in-from-bottom-8 duration-700">
           <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
              <div className="flex-1 space-y-8">
                <div className="flex items-center space-x-6">
                  <div className="p-5 bg-indigo-600 rounded-[2rem] shadow-xl shadow-indigo-100">
                    <Target className="w-10 h-10 text-white" />
                  </div>
                  <div>
                    <h3 className="text-4xl font-black text-gray-900 tracking-tight">高置信信号锁定: {focusedRuleResult.rule.label}</h3>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className="px-4 py-1.5 bg-indigo-100 text-indigo-700 text-xs font-black rounded-xl border border-indigo-200">目标区块: #{focusedRuleResult.result.targetHeight}</span>
                      <span className="px-4 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-black rounded-xl border border-emerald-200">共振模型: {focusedRuleResult.result.detectedCycle}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-900 p-8 rounded-[3rem] border border-slate-800 shadow-inner">
                  <p className="text-white font-medium text-xl leading-relaxed italic">
                    “{focusedRuleResult.result.analysis} 数据熵值为 {focusedRuleResult.result.entropyScore}，系统判定为【极佳捕获窗口】。”
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 shrink-0 w-full lg:w-auto">
                 <div className="bg-white p-10 rounded-[3.5rem] border-4 border-red-500/10 shadow-xl text-center">
                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-4">建议 (单双)</span>
                    <div className="text-7xl font-black mb-6" style={{ color: focusedRuleResult.result.nextParity === 'ODD' ? 'var(--color-odd)' : 'var(--color-even)' }}>
                      {focusedRuleResult.result.nextParity === 'NEUTRAL' ? '-' : (focusedRuleResult.result.nextParity === 'ODD' ? '单' : '双')}
                    </div>
                    <div className="px-4 py-1.5 bg-red-50 text-red-600 text-[11px] font-black rounded-full uppercase">置信度 {focusedRuleResult.result.parityConfidence}%</div>
                 </div>
                 <div className="bg-white p-10 rounded-[3.5rem] border-4 border-indigo-500/10 shadow-xl text-center">
                    <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest block mb-4">建议 (大小)</span>
                    <div className="text-7xl font-black mb-6" style={{ color: focusedRuleResult.result.nextSize === 'BIG' ? 'var(--color-big)' : 'var(--color-small)' }}>
                      {focusedRuleResult.result.nextSize === 'NEUTRAL' ? '-' : (focusedRuleResult.result.nextSize === 'BIG' ? '大' : '小')}
                    </div>
                    <div className="px-4 py-1.5 bg-indigo-50 text-indigo-600 text-[11px] font-black rounded-full uppercase">置信度 {focusedRuleResult.result.sizeConfidence}%</div>
                 </div>
              </div>
           </div>
        </section>
      )}

      {/* HISTORY TABLE */}
      <section className="bg-transparent overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-10 mb-14 px-4">
          <div className="flex items-center space-x-6">
            <div className="p-4 bg-white rounded-3xl shadow-sm border border-gray-100">
              <Clock className="w-8 h-8 text-slate-800" />
            </div>
            <div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">演算历史</h3>
              <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-2 flex items-center flex-wrap gap-2">
                <Filter className="w-3 h-3 mr-1" />
                {selectedHistoryRuleId !== 'ALL' && (
                  <>
                    <span>规则: {rules.find(r => r.id === selectedHistoryRuleId)?.label}</span>
                    <span className="text-gray-300">|</span>
                  </>
                )}
                {selectedModelId !== 'ALL' && (
                  <>
                    <span>模型: {selectedModelId}</span>
                    <span className="text-gray-300">|</span>
                  </>
                )}
                <span>显示最近 400 条记录</span>
                {filteredHistory.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-[10px]">
                    {filteredHistory.length} 条
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            {/* 预测类型筛选器 */}
            <div className="flex bg-white p-2 rounded-3xl shadow-sm border border-gray-100 overflow-x-auto no-scrollbar">
              {['ALL', 'ODD', 'EVEN', 'BIG', 'SMALL'].map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f as PredictionFilter)}
                  className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase transition-all whitespace-nowrap ${
                    activeFilter === f ? 'bg-indigo-600 text-white shadow-xl' : 'text-gray-400 hover:text-slate-800'
                  }`}
                >
                  {f === 'ALL' ? '全域' : f === 'ODD' ? '单' : f === 'EVEN' ? '双' : f === 'BIG' ? '大' : f === 'SMALL' ? '小' : f}
                </button>
              ))}
            </div>

            {/* 模型筛选器 */}
            <div className="flex items-center bg-white px-4 py-2 rounded-3xl shadow-sm border border-gray-100">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mr-3 whitespace-nowrap">
                模型:
              </label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="text-[11px] font-bold text-gray-700 bg-transparent border-none outline-none cursor-pointer pr-8"
              >
                <option value="ALL">全部模型</option>
                <option value="隐马尔可夫模型">隐马尔可夫模型</option>
                <option value="LSTM时间序列">LSTM时间序列</option>
                <option value="ARIMA模型">ARIMA模型</option>
                <option value="熵值突变检测">熵值突变检测</option>
                <option value="蒙特卡洛模拟">蒙特卡洛模拟</option>
                <option value="小波变换分析">小波变换分析</option>
                <option value="马尔可夫状态迁移">马尔可夫状态迁移</option>
                <option value="贝叶斯后验推理">贝叶斯后验推理</option>
                <option value="密集簇群共振">密集簇群共振</option>
              </select>
            </div>

            {/* 采样规则筛选器 */}
            <div className="flex items-center bg-white px-4 py-2 rounded-3xl shadow-sm border border-gray-100">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider mr-3 whitespace-nowrap">
                规则:
              </label>
              <select
                value={selectedHistoryRuleId}
                onChange={(e) => setSelectedHistoryRuleId(e.target.value)}
                className="text-[11px] font-bold text-gray-700 bg-transparent border-none outline-none cursor-pointer pr-8"
              >
                <option value="ALL">全部规则</option>
                {rules.map(rule => (
                  <option key={rule.id} value={rule.id}>{rule.label}</option>
                ))}
              </select>
            </div>
            
            {history.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={exportHistory}
                  className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase transition-all whitespace-nowrap bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 flex items-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>导出历史</span>
                </button>
                {selectedRuleId !== 'ALL' && (
                  <button
                    onClick={() => clearRuleHistory(selectedRuleId)}
                    className="px-6 py-3 rounded-2xl text-[11px] font-black uppercase transition-all whitespace-nowrap bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 flex items-center space-x-2"
                  >
                    <X className="w-4 h-4" />
                    <span>清除当前规则</span>
                  </button>
                )}

              </div>
            )}
          </div>
        </div>

        <div className="px-4 pb-20 space-y-4">
          <div className="grid grid-cols-6 gap-4 px-10 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            <div>预测高度</div>
            <div className="text-center">演算模型</div>
            <div className="text-center">采样规则</div>
            <div className="text-center">AI 结论</div>
            <div className="text-center">实测结果</div>
            <div className="text-center">判定</div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="bg-white rounded-[3rem] py-24 text-center border border-gray-100 shadow-sm opacity-50 italic font-medium text-base tracking-wide">
              暂无演算记录
            </div>
          ) : (
            paginatedHistory.map(item => {
              const rule = rules.find(r => r.id === item.ruleId);
              return (
                <div 
                  key={item.id} 
                  className="bg-white rounded-[2.5rem] p-3 px-8 border border-gray-50 shadow-sm hover:shadow-md transition-shadow duration-200 grid grid-cols-6 items-center relative overflow-hidden group"
                >
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                    item.resolved 
                      ? (item.isParityCorrect && item.isSizeCorrect ? 'bg-emerald-500' : 'bg-red-400 opacity-60') 
                      : 'bg-amber-400 animate-pulse'
                  }`}></div>

                  <div className="font-bold text-indigo-600 tabular-nums text-base">
                    #{item.targetHeight}
                  </div>

                  <div className="text-center">
                    <span className="px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100 text-xs font-bold text-slate-600 shadow-sm whitespace-nowrap">
                      {item.detectedCycle}
                    </span>
                  </div>

                  <div className="text-center">
                    <span className="px-3 py-1 bg-indigo-50/50 rounded-lg text-xs font-bold text-indigo-600 border border-indigo-100/50 whitespace-nowrap">
                      {rule?.label || '未知规则'}
                    </span>
                  </div>

                  <div className="flex items-center justify-center space-x-2">
                    {item.nextParity !== 'NEUTRAL' && (
                      <span className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm ${
                        item.nextParity === 'ODD' ? 'bg-red-500' : 'bg-teal-500'
                      }`}>
                        {item.nextParity === 'ODD' ? '单' : '双'}
                      </span>
                    )}
                    {item.nextSize !== 'NEUTRAL' && (
                      <span className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm ${
                        item.nextSize === 'BIG' ? 'bg-orange-500' : 'bg-indigo-500'
                      }`}>
                        {item.nextSize === 'BIG' ? '大' : '小'}
                      </span>
                    )}
                    {item.nextParity === 'NEUTRAL' && item.nextSize === 'NEUTRAL' && (
                      <span className="text-xs text-gray-400 font-bold">-</span>
                    )}
                  </div>

                  <div className="flex items-center justify-center space-x-2">
                    {item.resolved ? (
                      <>
                        {item.nextParity !== 'NEUTRAL' && (
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white opacity-70 ${
                            item.actualParity === 'ODD' ? 'bg-red-400' : 'bg-teal-400'
                          }`}>{item.actualParity === 'ODD' ? '单' : '双'}</span>
                        )}
                        {item.nextSize !== 'NEUTRAL' && (
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white opacity-70 ${
                            item.actualSize === 'BIG' ? 'bg-orange-400' : 'bg-indigo-400'
                          }`}>{item.actualSize === 'BIG' ? '大' : '小'}</span>
                        )}
                        {item.nextParity === 'NEUTRAL' && item.nextSize === 'NEUTRAL' && (
                          <span className="text-xs text-gray-400 font-bold">-</span>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                        <span className="text-xs text-amber-600 font-bold">对齐中</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center space-x-2">
                    {item.resolved && (
                      <>
                        {item.nextParity !== 'NEUTRAL' && (
                          <div className={`px-2.5 py-1 rounded-lg flex items-center space-x-1 ${
                            item.isParityCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                          }`}>
                            {item.isParityCorrect ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span className="text-xs font-bold">单双</span>
                          </div>
                        )}
                        {item.nextSize !== 'NEUTRAL' && (
                          <div className={`px-2.5 py-1 rounded-lg flex items-center space-x-1 ${
                            item.isSizeCorrect ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                          }`}>
                            {item.isSizeCorrect ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span className="text-xs font-bold">大小</span>
                          </div>
                        )}
                        {item.nextParity === 'NEUTRAL' && item.nextSize === 'NEUTRAL' && (
                          <span className="text-xs text-gray-300 italic font-medium">分析中</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          
          {/* 分页控件 */}
          {filteredHistory.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between mt-8 px-4">
              <div className="flex items-center mb-4 sm:mb-0">
                <span className="text-sm font-medium text-gray-600 mr-3">每页显示:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-gray-500 ml-3">
                  共 {filteredHistory.length} 条记录
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <span className="px-3 py-2 text-sm font-medium text-gray-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
});



AIPrediction.displayName = 'AIPrediction';

export default AIPrediction;
