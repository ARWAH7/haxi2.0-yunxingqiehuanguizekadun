
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, RotateCcw, Settings, X, Loader2, ShieldCheck, AlertCircle, BarChart3, PieChart, Plus, Trash2, Edit3, Grid3X3, LayoutDashboard, Palette, Flame, Layers, SortAsc, SortDesc, CheckSquare, Square, Filter, ChevronRight, ChevronLeft, BrainCircuit, Activity, Gamepad2, Key } from 'lucide-react';
import { BlockData, IntervalRule, FollowedPattern } from './types';
import { fetchLatestBlock, fetchBlockByNum, fetchBlockRange } from './utils/apiHelpers';
import TrendChart from './components/TrendChart';
import BeadRoad from './components/BeadRoad';
import DataTable from './components/DataTable';
import DragonList from './components/DragonList';
import AIPrediction from './components/AIPrediction';
import SimulatedBetting from './components/SimulatedBetting';
import {
  loadThemeColors,
  debouncedSaveThemeColors,
  loadRules,
  debouncedSaveRules,
  loadActiveRuleId,
  saveActiveRuleId,
  loadFollowedPatterns,
  debouncedSaveFollowedPatterns
} from './services/configApi';

// 防抖函数
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

type TabType = 'dashboard' | 'parity-trend' | 'size-trend' | 'parity-bead' | 'size-bead' | 'dragon-list' | 'ai-prediction' | 'simulated-betting';

interface ThemeColors {
  odd: string;
  even: string;
  big: string;
  small: string;
}

// ✅ 缓存条目接口（包含时间戳和规则ID）
interface CacheEntry {
  data: BlockData[];
  timestamp: number;
  ruleId: string;  // 规则 ID，用于追踪
}

// ✅ 缓存过期时间（10秒）- 缩短以更快检测到数据过期
const CACHE_TTL = 10000;

const DEFAULT_COLORS: ThemeColors = {
  odd: '#ef4444',   // red-500
  even: '#14b8a6',  // teal-500
  big: '#f97316',   // orange-500
  small: '#6366f1', // indigo-500
};

const DEFAULT_RULES: IntervalRule[] = [
  { id: '1', label: '单区块', value: 1, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 },
  { id: '20', label: '20区块', value: 20, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 },
  { id: '60', label: '60区块', value: 60, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 },
  { id: '100', label: '100区块', value: 100, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 },
];

const App: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  
  // Redis WebSocket 状态
  const [wsConnected, setWsConnected] = useState(false);
  
  // 内存监控状态
  const [memoryUsage, setMemoryUsage] = useState({ used: 0, limit: 0, percentage: 0 });
  
  // 配置加载状态
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  
  // 主题颜色 - 从后端加载
  const [themeColors, setThemeColors] = useState<ThemeColors>(DEFAULT_COLORS);

  // 采样规则 - 从后端加载
  const [rules, setRules] = useState<IntervalRule[]>(DEFAULT_RULES);
  
  // 激活规则 - 从后端加载
  const [activeRuleId, setActiveRuleId] = useState<string>('1');

  // 关注模式 - 从后端加载
  const [followedPatterns, setFollowedPatterns] = useState<FollowedPattern[]>([]);
  
  const [ruleSearchQuery, setRuleSearchQuery] = useState('');
  const [switcherSearchQuery, setSwitcherSearchQuery] = useState('');
  const [ruleSortBy, setRuleSortBy] = useState<'value' | 'label'>('value');
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
  
  const [editingRule, setEditingRule] = useState<IntervalRule | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [allBlocks, setAllBlocks] = useState<BlockData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // ✅ 阶段1：添加前端缓存状态（包含时间戳）
  const [blocksCache, setBlocksCache] = useState<Map<string, CacheEntry>>(new Map());
  
  const blocksRef = useRef<BlockData[]>([]);
  const isPollingBusy = useRef(false);
  const navRef = useRef<HTMLDivElement>(null);
  const activeRuleRef = useRef<IntervalRule | undefined>(undefined);  // 存储当前规则，供 WebSocket 使用
  const blocksCacheRef = useRef(new Map<string, CacheEntry>());  // ✅ 阶段3：添加缓存 ref（包含时间戳和规则ID）
  const preloadedRules = useRef<Set<string>>(new Set());  // ✅ 追踪哪些规则已经预加载

  // 从后端加载所有配置数据
  useEffect(() => {
    const loadAllConfig = async () => {
      setIsLoadingConfig(true);
      try {
        console.log('[配置] 🔄 开始从 Redis 加载配置...');
        
        // 并行加载所有配置
        const [colors, rulesData, activeId, patterns] = await Promise.all([
          loadThemeColors(),
          loadRules(),
          loadActiveRuleId(),
          loadFollowedPatterns()
        ]);

        if (colors) {
          setThemeColors(colors);
          console.log('[配置] ✅ 主题颜色已加载');
        }
        
        if (rulesData && rulesData.length > 0) {
          setRules(rulesData);
          console.log('[配置] ✅ 采样规则已加载:', rulesData.length, '条');
        }
        
        if (activeId) {
          setActiveRuleId(activeId);
          console.log('[配置] ✅ 激活规则已加载:', activeId);
        } else if (rulesData && rulesData.length > 0) {
          // 如果没有保存的激活规则，使用第一个规则
          const defaultId = rulesData.find(r => r.id === '1')?.id || rulesData[0]?.id || '1';
          setActiveRuleId(defaultId);
          console.log('[配置] ℹ️ 使用默认激活规则:', defaultId);
        }
        
        if (patterns) {
          setFollowedPatterns(patterns);
          console.log('[配置] ✅ 关注模式已加载:', patterns.length, '个');
        }

        console.log('[配置] ✅ 从 Redis 加载配置成功');
      } catch (error) {
        console.error('[配置] ❌ 加载配置失败:', error);
        console.log('[配置] ℹ️ 使用默认配置');
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadAllConfig();
  }, []);

  // 主题颜色变化时保存到后端
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-odd', themeColors.odd);
    root.style.setProperty('--color-even', themeColors.even);
    root.style.setProperty('--color-big', themeColors.big);
    root.style.setProperty('--color-small', themeColors.small);
    
    // 只在配置加载完成后才保存
    if (!isLoadingConfig) {
      debouncedSaveThemeColors(themeColors);
    }
  }, [themeColors, isLoadingConfig]);

  useEffect(() => {
    blocksRef.current = allBlocks;
    
    // 只在配置加载完成后才保存规则
    if (!isLoadingConfig) {
      debouncedSaveRules(rules);
    }
    
    // ✅ 优化效果监控：输出内存使用情况
    if (process.env.NODE_ENV === 'development' && allBlocks.length % 10 === 0) {
      console.log(`[全局状态] allBlocks 更新: ${allBlocks.length} 个区块`);
      if (allBlocks.length > 0) {
        console.log(`[全局状态] 最新区块: ${allBlocks[0]?.height}, 最旧区块: ${allBlocks[allBlocks.length - 1]?.height}`);
        
        // 计算内存占用（估算）
        const estimatedMemoryMB = (allBlocks.length * 0.5 / 1024).toFixed(2); // 假设每个区块约 0.5KB
        console.log(`[内存估算] 区块数据约占用: ${estimatedMemoryMB} MB`);
      }
    }
  }, [allBlocks, rules, isLoadingConfig]);

  // 关注模式变化时保存到后端
  useEffect(() => {
    if (!isLoadingConfig) {
      debouncedSaveFollowedPatterns(followedPatterns);
    }
  }, [followedPatterns, isLoadingConfig]);

  // 激活规则变化时保存到后端
  useEffect(() => {
    if (!isLoadingConfig && activeRuleId) {
      saveActiveRuleId(activeRuleId);
    }
  }, [activeRuleId, isLoadingConfig]);

  // 内存监控和自动清理（优化后：数据量大幅减少，放宽清理阈值）
  useEffect(() => {
    const checkMemory = () => {
      // @ts-ignore - performance.memory 是 Chrome 特有的 API
      if (performance.memory) {
        // @ts-ignore
        const used = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
        // @ts-ignore
        const limit = Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024);
        const percentage = Math.round((used / limit) * 100);
        
        setMemoryUsage({ used, limit, percentage });
        
        // ✅ 优化后的清理机制：由于后端过滤，前端数据量已大幅减少，放宽清理阈值
        if (percentage > 90) {
          console.warn(`[内存] 使用率 ${percentage}%，触发紧急清理`);
          
          // 紧急清理：保留 500 条数据（足够大部分规则使用）
          setAllBlocks(prev => {
            const keepCount = 500;
            if (prev.length > keepCount) {
              console.log(`[内存] 紧急清理区块数据: ${prev.length} → ${keepCount}`);
              return prev.slice(0, keepCount);
            }
            return prev;
          });
        } else if (percentage > 85) {
          console.log(`[内存] 使用率 ${percentage}%，注意监控`);
          
          // 轻度清理：保留 1000 条数据
          setAllBlocks(prev => {
            const keepCount = 1000;
            if (prev.length > keepCount) {
              console.log(`[内存] 轻度清理区块数据: ${prev.length} → ${keepCount}`);
              return prev.slice(0, keepCount);
            }
            return prev;
          });
        }
        // 注意：由于优化后数据量已大幅减少，不再需要 65%、75% 的清理阈值
      }
    };
    
    // 立即检查一次
    checkMemory();
    
    // 每30秒检查一次
    const interval = setInterval(checkMemory, 30000);
    
    return () => clearInterval(interval);
  }, []); // 移除 requiredDataCount 依赖，使用固定值

  const activeRule = useMemo(() => 
    rules.find(r => r.id === activeRuleId) || rules[0]
  , [rules, activeRuleId]);

  // 更新 activeRuleRef，供 WebSocket 使用
  useEffect(() => {
    activeRuleRef.current = activeRule;
  }, [activeRule]);

  // ✅ 阶段3：同步更新 blocksCacheRef
  useEffect(() => {
    blocksCacheRef.current = blocksCache;
  }, [blocksCache]);

  // 检查区块是否符合规则（提取为独立函数，避免在 useMemo 中重复创建）
  const checkAlignment = useCallback((height: number, rule: IntervalRule) => {
    if (!rule) return false;
    if (rule.value <= 1) return true;
    if (rule.startBlock > 0) {
      return height >= rule.startBlock && (height - rule.startBlock) % rule.value === 0;
    }
    return height % rule.value === 0;
  }, []);

  // 计算当前规则所需的数据量（优化版：考虑走势路和珠盘路的不同需求）
  const requiredDataCount = useMemo(() => {
    if (!activeRule) return 264;
    
    // ✅ 固定返回 264 条数据（珠盘路需要：6 行 × 44 列 = 264）
    // 所有规则步长都返回 264 条符合规则的最新数据
    const fixedCount = 264;
    
    console.log(`[数据需求] 规则: ${activeRule.label}, 固定需求: ${fixedCount} 条`);
    
    return fixedCount;
  }, [activeRule]);

  // ✅ React.memo 优化：只依赖 activeRule.id，不依赖整个对象
  const ruleFilteredBlocks = useMemo(() => {
    if (!activeRule) {
      return [];
    }
    
    // ✅ 不在这里限制数据量，让 calculateBeadGrid 处理滑动窗口逻辑
    // 这样当数据超过 264 条时，calculateBeadGrid 可以检测到并触发滚动
    // 只在开发模式下输出性能日志
    if (process.env.NODE_ENV === 'development') {
      console.log(`[前端] 规则: ${activeRule.label}, 后端已过滤数据: ${allBlocks.length} 条`);
    }
    
    return allBlocks;
  }, [allBlocks, activeRule?.id]);  // ✅ 只依赖 id，避免不必要的重新计算

  // ✅ 长龙提醒需要所有规则的区块数据，从缓存合并所有规则的数据
  const dragonListBlocks = useMemo(() => {
    const blocksMap = new Map<number, BlockData>();
    blocksCache.forEach((cacheEntry) => {
      cacheEntry.data.forEach((block) => {
        blocksMap.set(block.height, block);
      });
    });
    return Array.from(blocksMap.values()).sort((a, b) => b.height - a.height);
  }, [blocksCache]);

  const displayBlocks = useMemo(() => {
    let filtered = ruleFilteredBlocks;
    
    if (searchQuery) {
      filtered = filtered.filter(b => 
        b.height.toString().includes(searchQuery) || 
        b.hash.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // 数据表格只显示最近 50 条数据（减少内存占用）
    // 注意：走势图和珠盘路使用独立的数据处理（44列），不受此限制
    return filtered.slice(0, 50);
  }, [ruleFilteredBlocks, searchQuery]);

  // ✅ 预加载所有规则的数据
  const preloadAllRules = useCallback(async () => {
    if (rules.length === 0) {
      console.log('[预加载] ⚠️ 没有规则需要预加载');
      return;
    }
    
    console.log('[预加载] 🚀 开始预加载所有规则...');
    console.log('[预加载] 📋 规则列表:', rules.map(r => r.label).join(', '));
    
    const startTime = Date.now();
    const BACKEND_API_URL = 'http://localhost:3001';
    
    // 并行加载所有规则
    const promises = rules.map(async (rule) => {
      try {
        const response = await fetch(
          `${BACKEND_API_URL}/api/blocks?limit=264&ruleValue=${rule.value}&startBlock=${rule.startBlock}`
        );
        const result = await response.json();
        
        if (result.success) {
          const cacheKey = `${rule.value}-${rule.startBlock}`;
          console.log(`[预加载] ✅ 规则 ${rule.label} 加载完成: ${result.data.length} 条`);
          return { 
            cacheKey, 
            data: result.data,
            ruleId: rule.id
          };
        }
      } catch (error) {
        console.error(`[预加载] ❌ 规则 ${rule.label} 加载失败:`, error);
      }
      return null;
    });
    
    const results = await Promise.all(promises);
    
    // 更新缓存
    setBlocksCache(prev => {
      const newCache = new Map(prev);
      const now = Date.now();
      
      results.forEach(result => {
        if (result) {
          newCache.set(result.cacheKey, {
            data: result.data,
            timestamp: now,
            ruleId: result.ruleId
          });
          preloadedRules.current.add(result.ruleId);
        }
      });
      
      return newCache;
    });
    
    const endTime = Date.now();
    const successCount = results.filter(r => r).length;
    console.log(`[预加载] ✅ 预加载完成，耗时: ${endTime - startTime}ms`);
    console.log(`[预加载] 📊 成功: ${successCount}/${rules.length} 个规则`);
    console.log(`[预加载] 💾 内存占用: 约 ${(successCount * 264 * 0.5 / 1024).toFixed(2)} MB`);
  }, [rules]);

  // 从后端 API 加载历史数据的函数（优化版：优先使用缓存）
  const loadHistoryBlocks = useCallback(async (forceReload: boolean = false) => {
    try {
      const ruleValue = activeRule?.value || 1;
      const startBlock = activeRule?.startBlock || 0;
      const cacheKey = `${ruleValue}-${startBlock}`;
      const BACKEND_API_URL = 'http://localhost:3001';
      
      // ✅ 检查缓存
      if (!forceReload && blocksCacheRef.current.has(cacheKey)) {
        const cacheEntry = blocksCacheRef.current.get(cacheKey)!;
        const cacheAge = Date.now() - cacheEntry.timestamp;
        
        // 缓存未过期（30秒）
        if (cacheAge < 30000) {
          // ⚡ 智能跳过：比较数据是否真正变化，避免无意义的状态更新引发重渲染级联
          const currentBlocks = blocksRef.current;
          if (
            currentBlocks.length === cacheEntry.data.length &&
            currentBlocks.length > 0 &&
            currentBlocks[0]?.height === cacheEntry.data[0]?.height &&
            currentBlocks[currentBlocks.length - 1]?.height === cacheEntry.data[cacheEntry.data.length - 1]?.height
          ) {
            console.log('[缓存] ⚡ 数据未变化，跳过状态更新（避免重渲染）');
            return;
          }
          console.log(`[缓存] ✅ 使用缓存（0ms），规则: ${activeRule?.label}`);
          setAllBlocks(cacheEntry.data);
          return;
        } else {
          console.log(`[缓存] ⏰ 缓存已过期 (${(cacheAge / 1000).toFixed(1)}秒)，重新加载`);
        }
      }
      
      // 缓存不存在或已过期，从后端加载
      setIsLoading(true);
      console.log(`[API] 🚀 加载规则: ${activeRule?.label}`);
      
      const response = await fetch(
        `${BACKEND_API_URL}/api/blocks?limit=264&ruleValue=${ruleValue}&startBlock=${startBlock}`
      );
      const result = await response.json();
      
      if (result.success) {
        setAllBlocks(result.data);
        
        // 更新缓存
        setBlocksCache(prev => {
          const newCache = new Map(prev);
          newCache.set(cacheKey, {
            data: result.data,
            timestamp: Date.now(),
            ruleId: activeRule?.id || ''
          });
          return newCache;
        });
        
        // 标记为已预加载
        if (activeRule?.id) {
          preloadedRules.current.add(activeRule.id);
        }
        
        console.log(`[API] ✅ 加载完成: ${result.data.length} 条`);
        if (result.metadata) {
          console.log(`[API] 📊 过滤统计: 原始 ${result.metadata.totalRaw} 条 → 过滤后 ${result.metadata.totalFiltered} 条 → 返回 ${result.data.length} 条`);
        }
        if (result.data.length > 0) {
          console.log(`[API] 区块范围: ${result.data[result.data.length - 1]?.height} - ${result.data[0]?.height}`);
        }
      } else {
        console.error('[API] 加载失败:', result.error);
      }
      setIsLoading(false);
    } catch (error) {
      console.error('[API] 加载历史数据失败:', error);
      console.warn('[API] ⚠️ 请确保后端服务正在运行 (npm run dev)');
      setIsLoading(false);
    }
  }, [activeRule]);  // ✅ 只依赖 activeRule

  // 🔍 调试：将状态暴露到 window 对象，方便 Console 调试
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugApp = {
        activeRule,
        activeRuleRef,  // 添加 activeRuleRef 用于调试
        allBlocks,
        ruleFilteredBlocks,
        requiredDataCount,
        rules,
        activeRuleId,
        blocksCache,  // ✅ 添加缓存用于调试
        blocksCacheRef,  // ✅ 添加缓存 ref 用于调试
        wsConnected,  // ✅ 添加 WebSocket 状态
        isLoading,  // ✅ 添加加载状态
        // 调试函数
        printDebugInfo: () => {
          console.log('=== 调试信息 ===');
          console.log('当前规则:', activeRule);
          console.log('activeRuleRef.current:', activeRuleRef.current);
          console.log('珠盘路行数:', activeRule?.beadRows);
          console.log('走势路行数:', activeRule?.trendRows);
          console.log('后端返回:', allBlocks.length);
          console.log('前端使用:', ruleFilteredBlocks.length);
          console.log('需求量:', requiredDataCount);
          console.log('缓存大小:', blocksCache.size);
          console.log('WebSocket 状态:', wsConnected);
          console.log('加载状态:', isLoading);
          console.log('===============');
        },
        // ✅ 添加手动加载函数
        forceReload: () => {
          console.log('[手动] 🔄 强制重新加载数据...');
          loadHistoryBlocks(true);
        }
      };
    }
  }, [activeRule, allBlocks, ruleFilteredBlocks, requiredDataCount, rules, activeRuleId, blocksCache, wsConnected, isLoading, loadHistoryBlocks]);

  // 规则变化时智能加载数据（优先使用缓存）
  useEffect(() => {
    if (!wsConnected || !activeRule) return;
    
    console.log(`[规则变化] 切换到规则: ${activeRule.label}`);
    loadHistoryBlocks(false);  // ✅ 优先使用缓存
  }, [activeRuleId, wsConnected, loadHistoryBlocks]);

  // Redis WebSocket 连接和监听
  useEffect(() => {
    const BACKEND_WS_URL = (import.meta as any).env?.VITE_WS_BASE_URL || 'ws://localhost:8080';
    
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout;
    let isFirstConnection = true;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 30; // 最大重连次数

    const connect = () => {
      try {
        console.log('[连接] 正在连接到 Redis 后端 WebSocket...');
        ws = new WebSocket(BACKEND_WS_URL);

        ws.onopen = () => {
          setWsConnected(true);
          setConnectionError(null);
          console.log('[连接] ✅ WebSocket 连接成功');
          console.log('[架构] TRON → Redis → WebSocket → 前端 (延迟 ~70ms)');
          
          // 重置重连次数
          reconnectAttempts = 0;
          
          // ✅ 只在首次连接时预加载所有规则
          if (isFirstConnection) {
            isFirstConnection = false;
            preloadAllRules();
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // 跳过系统消息
            if (data.type === 'connected') {
              console.log('[连接]', data.message);
              return;
            }
            
            const block = data;
            
            // 减少日志输出，只在开发模式下显示详细日志
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Redis WS] 📦 新区块: ${block.height} (${block.type}, ${block.sizeType})`);
            }
            
            // ✅ 步骤1：同步更新所有已缓存规则
            setBlocksCache(prevCache => {
              const newCache = new Map(prevCache);
              const now = Date.now();
              let updateCount = 0;
              
              // 遍历所有已缓存的规则
              Array.from(newCache.entries()).forEach(([cacheKey, cacheEntry]: [string, CacheEntry]) => {
                const [ruleValue, startBlock] = cacheKey.split('-').map(Number);
                
                // 检查新区块是否符合这个规则
                let isAligned = false;
                if (ruleValue <= 1) {
                  isAligned = true;
                } else if (startBlock > 0) {
                  isAligned = block.height >= startBlock && 
                              (block.height - startBlock) % ruleValue === 0;
                } else {
                  isAligned = block.height % ruleValue === 0;
                }
                
                // 如果符合规则，更新缓存
                if (isAligned) {
                  const cachedData = cacheEntry.data;
                  
                  // 去重检查
                  if (!cachedData.some(b => b.height === block.height)) {
                    const updatedCache = [block, ...cachedData].slice(0, 264);
                    newCache.set(cacheKey, {
                      data: updatedCache,
                      timestamp: now,
                      ruleId: cacheEntry.ruleId
                    });
                    updateCount++;
                  }
                }
              });
              
              if (updateCount > 0 && process.env.NODE_ENV === 'development') {
                console.log(`[WebSocket] 🔄 同步更新 ${updateCount} 个规则缓存（区块: ${block.height}）`);
              }
              
              return newCache;
            });
            
            // ✅ 步骤2：直接更新当前激活规则的显示数据（不再依赖 setTimeout + stale ref）
            const currentRule = activeRuleRef.current;
            if (currentRule) {
              const ruleValue = currentRule.value;
              const startBlock = currentRule.startBlock || 0;

              // 检查新区块是否对齐当前规则
              let isAlignedToCurrentRule = false;
              if (ruleValue <= 1) {
                isAlignedToCurrentRule = true;
              } else if (startBlock > 0) {
                isAlignedToCurrentRule = block.height >= startBlock &&
                                         (block.height - startBlock) % ruleValue === 0;
              } else {
                isAlignedToCurrentRule = block.height % ruleValue === 0;
              }

              if (isAlignedToCurrentRule) {
                // 直接用函数式更新，确保读取最新状态
                setAllBlocks(prev => {
                  if (prev.some(b => b.height === block.height)) return prev; // 去重
                  const updated = [block, ...prev].slice(0, 264);
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`[WebSocket] ✅ 实时更新显示: ${currentRule.label}, 最新区块: ${block.height}`);
                  }
                  return updated;
                });
              }
            }
          } catch (error) {
            console.error('[WebSocket] 解析消息失败:', error);
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          
          // 检查重连次数
          reconnectAttempts++;
          if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
            console.log(`[连接] ❌ WebSocket 断开，5秒后重连... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            setConnectionError(`WebSocket 连接断开，正在重连... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
            reconnectTimer = setTimeout(connect, 5000);
          } else {
            console.log('[连接] ❌ 达到最大重连次数，停止重连');
            setConnectionError('WebSocket 连接失败，请检查后端服务是否运行');
          }
        };

        ws.onerror = (error) => {
          console.warn('[连接] WebSocket 错误:', error);
          setConnectionError('WebSocket 连接遇到错误');
          // 不在这里设置 wsConnected 为 false，让 onclose 处理
        };

      } catch (error) {
        console.warn('[连接] 连接失败:', error);
        setWsConnected(false);
        
        // 检查重连次数
        reconnectAttempts++;
        if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          console.log(`[连接] ❌ WebSocket 连接失败，5秒后重连... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          setConnectionError(`WebSocket 连接失败，正在重连... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectTimer = setTimeout(connect, 5000);
        } else {
          console.log('[连接] ❌ 达到最大重连次数，停止重连');
          setConnectionError('WebSocket 连接失败，请检查后端服务是否运行');
        }
      }
    };

    // 尝试连接 WebSocket
    connect();

    // 即使 WebSocket 连接失败，也要加载历史数据
    setTimeout(() => {
      if (!wsConnected && allBlocks.length === 0) {
        console.log('[连接] WebSocket 连接失败且无数据，尝试从 API 加载历史数据');
        loadHistoryBlocks(true);
      }
    }, 3000);

    // 清理函数
    return () => {
      if (ws) {
        try {
          ws.close();
        } catch (error) {
          console.warn('[连接] 关闭 WebSocket 时出错:', error);
        }
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, []); // ✅ 空依赖数组，只在组件挂载时连接一次

  // 实时轮询 - 检测并填补缺失的区块（仅作为 WebSocket 备用）
  useEffect(() => {
    // 如果 WebSocket 已连接，不使用轮询
    if (wsConnected) {
      console.log('[轮询] WebSocket 已连接，跳过轮询');
      return;
    }

    // 暂时禁用轮询，只使用 WebSocket
    console.log('[轮询] 轮询已禁用，请配置 Alchemy WebSocket');
    return;

    /* 轮询代码已禁用
    if (isLoading) return;

    const poll = async () => {
      if (isPollingBusy.current) return;
      isPollingBusy.current = true;
      try {
        const latest = await fetchLatestBlock('');
        const currentTopHeight = blocksRef.current[0]?.height || 0;
        
        if (latest.height > currentTopHeight) {
          console.log(`[轮询] 发现新区块: ${latest.height}, 当前最新: ${currentTopHeight}`);
          
          // 计算缺失的区块
          const missingHeights: number[] = [];
          for (let h = currentTopHeight + 1; h <= latest.height; h++) {
            missingHeights.push(h);
          }
          
          console.log(`[轮询] 需要获取 ${missingHeights.length} 个区块:`, missingHeights);
          
          // 逐个获取缺失的区块（避免超过API限制）
          const newBlocks: BlockData[] = [];
          for (const height of missingHeights) {
            try {
              const block = await fetchBlockByNum(height, '');
              newBlocks.push(block);
              // 每次请求后等待100ms，在保证不超限的同时提高速度
              if (missingHeights.indexOf(height) < missingHeights.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (e) {
              console.error(`[轮询] 获取区块 ${height} 失败:`, e);
            }
          }
          
          if (newBlocks.length > 0) {
            console.log(`[轮询] 成功获取 ${newBlocks.length} 个新区块`);
            setAllBlocks(prev => {
              const combined = [...newBlocks, ...prev];
              const uniqueMap = new Map();
              for (const b of combined) {
                if (!uniqueMap.has(b.height)) uniqueMap.set(b.height, b);
              }
              return Array.from(uniqueMap.values())
                .sort((a, b) => b.height - a.height)
                .slice(0, 10000); // 增加到 10000，确保大间隔规则有足够数据
            });
          }
          
          if (isSyncing) setIsSyncing(false);
        }
      } catch (e) {
        console.error("轮询错误:", e);
      } finally {
        isPollingBusy.current = false;
      }
    };

    // 立即执行一次
    poll();

    // 使用 setInterval 持续轮询 - 改为0.5秒以提高实时性
    const pollingId = window.setInterval(poll, 500); // 0.5秒轮询，更快获取新区块

    // 当标签页重新可见时，立即同步一次
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('标签页重新可见，立即同步数据');
        poll(); 
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(pollingId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    */
  }, [isLoading, isSyncing, wsConnected]);

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    
    const isNewRule = !rules.find(r => r.id === editingRule.id);
    
    if (isNewRule) {
      // ✅ 新规则：添加到列表
      setRules(prev => [...prev, editingRule]);
      
      // 立即加载新规则的数据
      console.log(`[规则] 🆕 创建新规则: ${editingRule.label}，开始加载数据...`);
      
      try {
        const BACKEND_API_URL = 'http://localhost:3001';
        const response = await fetch(
          `${BACKEND_API_URL}/api/blocks?limit=264&ruleValue=${editingRule.value}&startBlock=${editingRule.startBlock}`
        );
        const result = await response.json();
        
        if (result.success) {
          const cacheKey = `${editingRule.value}-${editingRule.startBlock}`;
          setBlocksCache(prev => {
            const newCache = new Map(prev);
            newCache.set(cacheKey, {
              data: result.data,
              timestamp: Date.now(),
              ruleId: editingRule.id
            });
            return newCache;
          });
          
          preloadedRules.current.add(editingRule.id);
          console.log(`[规则] ✅ 新规则 ${editingRule.label} 数据加载完成: ${result.data.length} 条`);
        }
      } catch (error) {
        console.error(`[规则] ❌ 新规则 ${editingRule.label} 数据加载失败:`, error);
      }
    } else {
      // ✅ 现有规则：更新
      const oldRule = rules.find(r => r.id === editingRule.id);
      setRules(prev => prev.map(r => r.id === editingRule.id ? editingRule : r));
      
      // 检查规则的步长或偏移是否改变
      if (oldRule && (oldRule.value !== editingRule.value || oldRule.startBlock !== editingRule.startBlock)) {
        console.log(`[规则] 🔄 规则 ${editingRule.label} 的步长或偏移已改变，重新加载数据...`);
        
        // 删除旧缓存
        const oldCacheKey = `${oldRule.value}-${oldRule.startBlock}`;
        setBlocksCache(prev => {
          const newCache = new Map(prev);
          newCache.delete(oldCacheKey);
          return newCache;
        });
        
        // 加载新数据
        try {
          const BACKEND_API_URL = 'http://localhost:3001';
          const response = await fetch(
            `${BACKEND_API_URL}/api/blocks?limit=264&ruleValue=${editingRule.value}&startBlock=${editingRule.startBlock}`
          );
          const result = await response.json();
          
          if (result.success) {
            const newCacheKey = `${editingRule.value}-${editingRule.startBlock}`;
            setBlocksCache(prev => {
              const newCache = new Map(prev);
              newCache.set(newCacheKey, {
                data: result.data,
                timestamp: Date.now(),
                ruleId: editingRule.id
              });
              return newCache;
            });
            
            console.log(`[规则] ✅ 规则 ${editingRule.label} 数据重新加载完成: ${result.data.length} 条`);
          }
        } catch (error) {
          console.error(`[规则] ❌ 规则 ${editingRule.label} 数据重新加载失败:`, error);
        }
      }
    }
    
    setEditingRule(null);
  };

  const deleteRule = (id: string) => {
    if (rules.length <= 1) return;
    
    // 找到要删除的规则
    const ruleToDelete = rules.find(r => r.id === id);
    
    setRules(prev => {
      const filtered = prev.filter(r => r.id !== id);
      if (activeRuleId === id) setActiveRuleId(filtered[0]?.id || '');
      return filtered;
    });
    
    // ✅ 清除对应的缓存
    if (ruleToDelete) {
      const cacheKey = `${ruleToDelete.value}-${ruleToDelete.startBlock}`;
      setBlocksCache(prev => {
        const newCache = new Map(prev);
        if (newCache.has(cacheKey)) {
          newCache.delete(cacheKey);
          console.log(`[缓存] 🗑️ 删除规则 ${ruleToDelete.label} 的缓存: ${cacheKey}`);
        }
        return newCache;
      });
      
      // 从预加载追踪中移除
      preloadedRules.current.delete(id);
      
      console.log(`[规则] ✅ 规则 ${ruleToDelete.label} 已删除，缓存已清理`);
    }
  };

  const deleteSelectedRules = () => {
    if (selectedRuleIds.size === 0) return;
    if (selectedRuleIds.size >= rules.length) {
      alert('至少保留一条采样规则');
      return;
    }
    const confirmed = window.confirm(`确定删除选中的 ${selectedRuleIds.size} 条规则吗？`);
    if (!confirmed) return;

    // ✅ 找到要删除的规则
    const rulesToDelete = rules.filter(r => selectedRuleIds.has(r.id));
    
    setRules(prev => {
      const filtered = prev.filter(r => !selectedRuleIds.has(r.id));
      if (selectedRuleIds.has(activeRuleId)) setActiveRuleId(filtered[0]?.id || '');
      return filtered;
    });
    
    // ✅ 批量清除缓存
    setBlocksCache(prev => {
      const newCache = new Map(prev);
      rulesToDelete.forEach(rule => {
        const cacheKey = `${rule.value}-${rule.startBlock}`;
        if (newCache.has(cacheKey)) {
          newCache.delete(cacheKey);
          console.log(`[缓存] 🗑️ 删除规则 ${rule.label} 的缓存: ${cacheKey}`);
        }
        preloadedRules.current.delete(rule.id);
      });
      return newCache;
    });
    
    setSelectedRuleIds(new Set());
    console.log(`[规则] ✅ 已删除 ${rulesToDelete.length} 个规则，缓存已清理`);
  };

  const toggleRuleSelection = (id: string) => {
    setSelectedRuleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllRules = (filteredRules: IntervalRule[]) => {
    if (selectedRuleIds.size === filteredRules.length) {
      setSelectedRuleIds(new Set());
    } else {
      setSelectedRuleIds(new Set(filteredRules.map(r => r.id)));
    }
  };

  const batchUpdateDragonThreshold = (val: number) => {
    setRules(prev => prev.map(r => ({ ...r, dragonThreshold: val })));
    alert(`已将所有规则的长龙提醒阈值批量设置为: ${val}连`);
  };

  const handleBatchRuleSave = () => {
    try {
      const lines = batchText.trim().split('\n');
      const newRules: IntervalRule[] = lines.map((line, idx) => {
        const parts = line.split(',').map(s => s.trim());
        const label = parts[0] || '未命名';
        const value = parseInt(parts[1]) || 1;
        const start = parseInt(parts[2]) || 0;
        const trend = parseInt(parts[3]) || 6;
        const bead = parseInt(parts[4]) || 6;
        const dragon = parseInt(parts[5]) || 3;
        
        return {
          id: `rule-${Date.now()}-${idx}`,
          label,
          value,
          startBlock: start,
          trendRows: trend,
          beadRows: bead,
          dragonThreshold: dragon
        };
      });
      if (newRules.length > 0) {
        setRules(newRules);
        setActiveRuleId(newRules[0].id);
        setShowBatchModal(false);
        alert('批量导入规则成功！');
      }
    } catch (e) {
      alert('解析失败，请检查格式：名称,步长,偏移,走势行,珠盘行,龙阈值 (逗号分隔)');
    }
  };

  const filteredAndSortedRules = useMemo(() => {
    let result = rules.filter(r => 
      r.label.toLowerCase().includes(ruleSearchQuery.toLowerCase()) || 
      r.value.toString().includes(ruleSearchQuery)
    );

    result.sort((a, b) => {
      if (ruleSortBy === 'value') return a.value - b.value;
      return a.label.localeCompare(b.label);
    });

    return result;
  }, [rules, ruleSearchQuery, ruleSortBy]);

  const switcherFilteredRules = useMemo(() => {
    if (!switcherSearchQuery) return rules.sort((a,b) => a.value - b.value);
    return rules.filter(r => 
      r.label.toLowerCase().includes(switcherSearchQuery.toLowerCase()) || 
      r.value.toString().includes(switcherSearchQuery)
    ).sort((a,b) => a.value - b.value);
  }, [rules, switcherSearchQuery]);

  const toggleFollow = useCallback((pattern: FollowedPattern) => {
    setFollowedPatterns(prev => {
      const exists = prev.find(p => 
        p.ruleId === pattern.ruleId && 
        p.type === pattern.type && 
        p.mode === pattern.mode && 
        p.rowId === pattern.rowId
      );
      if (exists) {
        return prev.filter(p => 
          !(p.ruleId === pattern.ruleId && 
            p.type === pattern.type && 
            p.mode === pattern.mode && 
            p.rowId === pattern.rowId)
        );
      }
      return [...prev, pattern];
    });
  }, []);

  const handleJumpToChart = useCallback((ruleId: string, type: 'parity' | 'size', mode: 'trend' | 'bead') => {
    // ⚡ 同步切换：先从缓存设置数据再切换规则，避免闪烁
    const targetRule = rules.find(r => r.id === ruleId);
    if (targetRule) {
      const ck = `${targetRule.value}-${targetRule.startBlock || 0}`;
      const ce = blocksCacheRef.current.get(ck);
      if (ce && (Date.now() - ce.timestamp < 30000)) {
        setAllBlocks(ce.data);
      }
    }
    setActiveRuleId(ruleId);
    if (mode === 'bead') {
      setActiveTab(type === 'parity' ? 'parity-bead' : 'size-bead');
    } else {
      setActiveTab(type === 'parity' ? 'parity-trend' : 'size-trend');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [rules]);

  const TABS = [
    { id: 'dashboard', label: '综合盘面', icon: LayoutDashboard, color: 'text-blue-500' },
    { id: 'parity-trend', label: '单双走势', icon: BarChart3, color: 'text-red-500' },
    { id: 'size-trend', label: '大小走势', icon: PieChart, color: 'text-indigo-500' },
    { id: 'parity-bead', label: '单双珠盘', icon: Grid3X3, color: 'text-teal-500' },
    { id: 'size-bead', label: '大小珠盘', icon: Grid3X3, color: 'text-orange-500' },
    { id: 'dragon-list', label: '长龙提醒', icon: Flame, color: 'text-amber-500' },
    { id: 'ai-prediction', label: 'AI 数据预测', icon: BrainCircuit, color: 'text-purple-600' },
    { id: 'simulated-betting', label: '模拟下注', icon: Gamepad2, color: 'text-pink-500' },
  ] as const;

  const handleColorChange = (key: keyof ThemeColors, value: string) => {
    setThemeColors(prev => ({ ...prev, [key]: value }));
  };

  const resetColors = () => {
    setThemeColors(DEFAULT_COLORS);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 pb-24 min-h-screen antialiased bg-white">
      <header className="mb-6 flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6">
          <div className="w-10"></div>
          <h1 className="text-2xl md:text-4xl font-black text-blue-600 tracking-tight text-center">
            TRON哈希走势分析大师
          </h1>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-3 bg-white shadow-sm border border-gray-100 hover:bg-gray-50 rounded-2xl transition-all text-gray-500 active:scale-95"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
        
        {connectionError ? (
          <div className="bg-red-50 px-5 py-2 rounded-full shadow-sm border border-red-100 text-red-600 text-[10px] font-black items-center flex uppercase tracking-widest mb-4">
            <AlertCircle className="w-3.5 h-3.5 mr-2 text-red-500" />
            {connectionError}
          </div>
        ) : (
          <p className="bg-white px-5 py-2 rounded-full shadow-sm border border-gray-50 text-gray-400 text-[10px] font-black items-center flex uppercase tracking-widest">
            <ShieldCheck className="w-3.5 h-3.5 mr-2 text-green-500" />
            {wsConnected 
              ? '波场主网实时监听中 (Redis WebSocket ⚡)' 
              : '正在连接 Redis 后端...'
            }
          </p>
        )}
      </header>

      {/* Main Tab Navigation */}
      <div className="flex justify-center mb-8 sticky top-4 z-[40]">
        <div className="inline-flex bg-white/80 backdrop-blur-md p-1.5 rounded-2xl shadow-xl border border-white/50 w-full max-w-5xl overflow-x-auto no-scrollbar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl text-xs md:text-sm font-black transition-all duration-300 whitespace-nowrap ${
                  isActive ? 'bg-blue-600 text-white shadow-lg scale-105' : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : tab.color}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Horizontal Rule Navigator with Quick Switcher */}
      <div className="relative group max-w-6xl mx-auto mb-10 px-12">
        <button 
          onClick={() => setShowQuickSwitcher(true)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2.5 bg-white border border-gray-100 rounded-xl shadow-lg text-blue-600 hover:bg-blue-50 transition-all active:scale-90"
          title="全量搜索切换器"
        >
          <Grid3X3 className="w-5 h-5" />
        </button>

        <div className="relative flex items-center overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-50 to-transparent pointer-events-none z-[5]"></div>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none z-[5]"></div>
          
          <div 
            ref={navRef}
            className="flex items-center space-x-2 w-full overflow-x-auto no-scrollbar py-2 scroll-smooth"
          >
            {rules.map((rule) => (
              <button
                key={rule.id}
                onClick={() => {
                  // ⚡ 同步切换：先从缓存设置数据再切换规则，避免闪烁
                  const cacheKey = `${rule.value}-${rule.startBlock || 0}`;
                  const cached = blocksCacheRef.current.get(cacheKey);
                  if (cached && (Date.now() - cached.timestamp < 30000)) {
                    setAllBlocks(cached.data);
                  }
                  setActiveRuleId(rule.id);
                }}
                className={`px-4 py-2.5 rounded-xl text-[11px] font-black transition-all duration-300 border-2 shrink-0 ${
                  activeRuleId === rule.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105'
                    : 'bg-white text-gray-400 border-transparent hover:border-blue-100 hover:text-blue-500'
                }`}
              >
                {rule.label}
              </button>
            ))}
            <button 
              onClick={() => setEditingRule({ id: Date.now().toString(), label: '新规则', value: 10, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 })}
              className="px-4 py-2.5 rounded-xl text-[11px] font-black bg-gray-100 text-gray-400 border-2 border-dashed border-gray-200 hover:bg-white hover:text-blue-500 transition-all shrink-0"
            >
              +
            </button>
          </div>
        </div>

        <button 
          onClick={() => navRef.current?.scrollBy({ left: -250, behavior: 'smooth' })}
          className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white border rounded-full hidden md:block"
        >
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </button>
        <button 
          onClick={() => navRef.current?.scrollBy({ left: 250, behavior: 'smooth' })}
          className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white border rounded-full hidden md:block"
        >
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Main View Area */}
      <div className="mb-12">
        {/* NEW: Simulated Betting (Always mounted, hidden via CSS when inactive) */}
        <div className={activeTab === 'simulated-betting' ? "animate-in fade-in slide-in-from-bottom-4 duration-500" : "hidden"}>
             <SimulatedBetting allBlocks={allBlocks} rules={rules} />
        </div>

        {/* Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12 animate-in fade-in zoom-in-95 duration-500">
            {/* dashboard modules */}
            <div className="h-fit p-1 bg-slate-100 rounded-3xl shadow-inner border border-slate-200">
              <TrendChart 
                key={`parity-trend-dashboard-${activeRuleId}`}
                blocks={ruleFilteredBlocks} mode="parity" title="单双走势" rows={activeRule?.trendRows || 6} />
            </div>
            <div className="h-fit p-1 bg-slate-100 rounded-3xl shadow-inner border border-slate-200">
              <TrendChart 
                key={`size-trend-dashboard-${activeRuleId}`}
                blocks={ruleFilteredBlocks} mode="size" title="大小走势" rows={activeRule?.trendRows || 6} />
            </div>
            <div className="h-fit p-1 bg-slate-100 rounded-3xl shadow-inner border border-slate-200">
              <BeadRoad 
                key={`parity-bead-dashboard-${activeRuleId}`}
                blocks={ruleFilteredBlocks} mode="parity" rule={activeRule} title="单双珠盘" rows={activeRule?.beadRows || 6} />
            </div>
            <div className="h-fit p-1 bg-slate-100 rounded-3xl shadow-inner border border-slate-200">
              <BeadRoad 
                key={`size-bead-dashboard-${activeRuleId}`}
                blocks={ruleFilteredBlocks} mode="size" rule={activeRule} title="大小珠盘" rows={activeRule?.beadRows || 6} />
            </div>
          </div>
        )}

        {/* Dragon List */}
        {activeTab === 'dragon-list' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <DragonList
                allBlocks={dragonListBlocks}
                rules={rules}
                followedPatterns={followedPatterns}
                onToggleFollow={toggleFollow}
                onJumpToChart={handleJumpToChart}
             />
          </div>
        )}
        
        {/* AI Prediction (Always mounted to ensure background calculation) */}
        <div className={activeTab === 'ai-prediction' ? "animate-in fade-in slide-in-from-bottom-4 duration-500" : "hidden"}>
             <AIPrediction allBlocks={allBlocks} rules={rules} />
        </div>

        {/* Generic Charts for Sub-tabs */}
        {['parity-trend', 'size-trend', 'parity-bead', 'size-bead'].includes(activeTab) && (
          <div className="bg-white rounded-[2.5rem] p-6 md:p-10 shadow-xl border border-gray-100 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500 h-auto">
            <div className="flex items-center space-x-3 mb-8 px-2">
               <div className="p-2 bg-blue-50 rounded-xl">
                 {activeTab.includes('parity') ? <BarChart3 className="w-6 h-6 text-red-500" /> : <PieChart className="w-6 h-6 text-indigo-500" />}
               </div>
               <h2 className="text-xl md:text-2xl font-black text-gray-800">
                {TABS.find(t => t.id === activeTab)?.label} 深度分析
              </h2>
            </div>
            <div className="h-fit">
              {activeTab === 'parity-trend' && <TrendChart key={`parity-trend-full-${activeRuleId}`} blocks={ruleFilteredBlocks} mode="parity" title="单双走势" rows={activeRule?.trendRows || 6} />}
              {activeTab === 'size-trend' && <TrendChart key={`size-trend-full-${activeRuleId}`} blocks={ruleFilteredBlocks} mode="size" title="大小走势" rows={activeRule?.trendRows || 6} />}
              {activeTab === 'parity-bead' && <BeadRoad key={`parity-bead-full-${activeRuleId}`} blocks={ruleFilteredBlocks} mode="parity" rule={activeRule} title="单双珠盘" rows={activeRule?.beadRows || 6} />}
              {activeTab === 'size-bead' && <BeadRoad key={`size-bead-full-${activeRuleId}`} blocks={ruleFilteredBlocks} mode="size" rule={activeRule} title="大小珠盘" rows={activeRule?.beadRows || 6} />}
            </div>
          </div>
        )}

        {/* Global Data Controls & Table (Universal) */}
        <div className="mt-12 space-y-6">
          {/* 过滤提示 */}
          {allBlocks.length > 0 && displayBlocks.length === 0 && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 flex items-start space-x-4">
              <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-black text-amber-900 mb-2">数据已接收，但被采样规则过滤</h3>
                <p className="text-amber-700 text-sm mb-3">
                  当前规则 <span className="font-black">"{activeRule?.label}"</span> (步长 {activeRule?.value}) 
                  过滤掉了所有 {allBlocks.length} 个接收到的区块。
                </p>
                <button
                  onClick={() => {
                    const singleBlockRule = rules.find(r => r.id === '1');
                    if (singleBlockRule) {
                      setActiveRuleId('1');
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl font-black text-sm hover:bg-amber-700 transition-colors"
                >
                  切换到 "单区块" 查看所有数据
                </button>
              </div>
            </div>
          )}
          
          <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-5 rounded-[2.5rem] border border-gray-100 shadow-sm">
            <div className="flex-1 w-full relative group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索区块号、哈希值..."
                className="w-full pl-6 pr-14 py-4 rounded-2xl bg-gray-50 border-0 focus:outline-none focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium"
              />
              <Search className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 group-focus-within:text-blue-400 transition-colors" />
            </div>
          </div>
          <DataTable blocks={displayBlocks} />
        </div>
      </div>

      {/* Quick Switcher Modal */}
      {showQuickSwitcher && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-200">
           <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl p-8 max-h-[85vh] flex flex-col relative animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setShowQuickSwitcher(false)} 
                className="absolute top-8 right-8 p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="mb-8">
                 <h2 className="text-2xl font-black text-gray-900 flex items-center">
                    <Grid3X3 className="w-6 h-6 mr-3 text-blue-600" />
                    全量采样规则搜索
                    <span className="ml-4 px-3 py-1 bg-blue-50 text-blue-600 text-xs rounded-full">{rules.length} 条</span>
                 </h2>
                 <p className="text-gray-400 text-sm mt-1 font-medium">快速在大量规则中跳转</p>
              </div>

              <div className="relative mb-6">
                 <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                 <input 
                  autoFocus
                  type="text" 
                  placeholder="搜索规则名称、步长 (如: 120)..."
                  value={switcherSearchQuery}
                  onChange={(e) => setSwitcherSearchQuery(e.target.value)}
                  className="w-full pl-16 pr-8 py-5 bg-gray-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none font-black text-lg transition-all"
                 />
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pb-4">
                 {switcherFilteredRules.map(r => (
                   <button 
                    key={r.id}
                    onClick={() => {
                      // ⚡ 同步切换：先从缓存设置数据再切换规则，避免闪烁
                      const ck = `${r.value}-${r.startBlock || 0}`;
                      const ce = blocksCacheRef.current.get(ck);
                      if (ce && (Date.now() - ce.timestamp < 30000)) {
                        setAllBlocks(ce.data);
                      }
                      setActiveRuleId(r.id);
                      setShowQuickSwitcher(false);
                      setSwitcherSearchQuery('');
                    }}
                    className={`p-4 rounded-2xl text-left border-2 transition-all group ${
                      activeRuleId === r.id 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg scale-105' 
                      : 'bg-white border-gray-100 hover:border-blue-200 text-gray-700'
                    }`}
                   >
                     <p className={`text-[10px] font-black uppercase mb-1 ${activeRuleId === r.id ? 'text-blue-100' : 'text-gray-400'}`}>
                        步长: {r.value}
                     </p>
                     <p className="text-xs font-black truncate">{r.label}</p>
                   </button>
                 ))}
                 {switcherFilteredRules.length === 0 && (
                   <div className="col-span-full py-20 text-center">
                      <Filter className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                      <p className="text-gray-400 font-black uppercase tracking-widest text-sm">未找到匹配规则</p>
                   </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl my-auto p-8 md:p-10 relative animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto no-scrollbar will-change-transform">
            <button onClick={() => setShowSettings(false)} className="absolute top-8 right-8 p-2 hover:bg-gray-100 rounded-full text-gray-400">
              <X className="w-6 h-6" />
            </button>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-gray-900">核心配置</h2>
              <p className="text-gray-500 text-sm mt-2">管理 API、采样与主题配色</p>
            </div>
            <div className="space-y-10">


              <section className="bg-white p-6 rounded-3xl border border-gray-100">
                <div className="flex justify-between items-center mb-6">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center">
                    <Palette className="w-3 h-3 mr-2" /> 配色方案
                  </label>
                  <button onClick={resetColors} className="text-[10px] font-black text-blue-600 uppercase">恢复默认</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {[
                    { label: '单 (ODD)', key: 'odd' },
                    { label: '双 (EVEN)', key: 'even' },
                    { label: '大 (BIG)', key: 'big' },
                    { label: '小 (SMALL)', key: 'small' },
                  ].map(({ label, key }) => (
                    <div key={key} className="flex flex-col items-center">
                      <input 
                        type="color" 
                        value={themeColors[key as keyof ThemeColors]} 
                        onChange={(e) => handleColorChange(key as keyof ThemeColors, e.target.value)}
                        className="w-12 h-12 rounded-full border-4 border-white shadow-md cursor-pointer mb-2 overflow-hidden"
                      />
                      <span className="text-[10px] font-black text-gray-500 text-center uppercase">{label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">采样规则管理 ({rules.length})</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                       <input 
                        type="text" 
                        placeholder="检索规则..."
                        value={ruleSearchQuery}
                        onChange={(e) => setRuleSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 w-32 md:w-48 transition-all"
                       />
                    </div>
                    <div className="flex border border-gray-100 rounded-lg overflow-hidden bg-gray-50">
                       <button 
                        onClick={() => setRuleSortBy('value')}
                        className={`p-1.5 transition-colors ${ruleSortBy === 'value' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-blue-500'}`}
                        title="按步长排序"
                       >
                         <SortAsc className="w-3.5 h-3.5" />
                       </button>
                       <button 
                        onClick={() => setRuleSortBy('label')}
                        className={`p-1.5 transition-colors ${ruleSortBy === 'label' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-blue-500'}`}
                        title="按名称排序"
                       >
                         <SortDesc className="w-3.5 h-3.5" />
                       </button>
                    </div>
                    <button 
                      onClick={() => {
                        const csv = rules.map(r => `${r.label},${r.value},${r.startBlock},${r.trendRows},${r.beadRows},${r.dragonThreshold}`).join('\n');
                        setBatchText(csv);
                        setShowBatchModal(true);
                      }}
                      className="text-indigo-600 flex items-center text-xs font-black hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Layers className="w-3 h-3 mr-1" /> 批量编辑
                    </button>
                    <button 
                      onClick={() => setEditingRule({ id: Date.now().toString(), label: '新规则', value: 10, startBlock: 0, trendRows: 6, beadRows: 6, dragonThreshold: 3 })}
                      className="text-blue-600 flex items-center text-xs font-black hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus className="w-3 h-3 mr-1" /> 新增
                    </button>
                  </div>
                </div>

                {selectedRuleIds.size > 0 && (
                  <div className="bg-red-50 p-3 rounded-2xl border border-red-100 flex items-center justify-between animate-in slide-in-from-top-2">
                    <div className="flex items-center space-x-3">
                      <CheckSquare className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-black text-red-700">已选中 {selectedRuleIds.size} 条规则</span>
                    </div>
                    <button 
                      onClick={deleteSelectedRules}
                      className="bg-red-500 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-red-600 transition-colors shadow-sm"
                    >
                      批量删除
                    </button>
                  </div>
                )}

                <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                   <div className="flex items-center space-x-2">
                     <Flame className="w-4 h-4 text-amber-500" />
                     <span className="text-[10px] font-black text-amber-700 uppercase">全规则龙提醒批量设置</span>
                   </div>
                   <div className="flex space-x-1.5">
                     {[2, 3, 5, 8, 10, 15].map(v => (
                       <button 
                        key={v}
                        onClick={() => batchUpdateDragonThreshold(v)}
                        className="w-8 h-8 bg-white rounded-lg border border-amber-200 text-[10px] font-black text-amber-600 hover:bg-amber-100 transition-colors shadow-sm"
                       >
                         {v}
                       </button>
                     ))}
                   </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-inner">
                  <div className="bg-gray-50/50 p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
                    <button 
                      onClick={() => selectAllRules(filteredAndSortedRules)}
                      className="flex items-center space-x-2 text-[10px] font-black text-gray-500 hover:text-blue-600 transition-colors"
                    >
                      {selectedRuleIds.size === filteredAndSortedRules.length && filteredAndSortedRules.length > 0 ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                      <span>全选本页</span>
                    </button>
                    <span className="text-[10px] font-black text-gray-300 uppercase">列表管理视图</span>
                  </div>
                  
                  <div className="max-h-[500px] overflow-y-auto no-scrollbar pb-4 divide-y divide-gray-50">
                    {filteredAndSortedRules.length === 0 ? (
                      <div className="py-12 text-center text-gray-400 text-xs font-bold italic">未检索到相关规则</div>
                    ) : (
                      filteredAndSortedRules.map(r => (
                        <div key={r.id} className="group hover:bg-blue-50/30 transition-all flex items-center p-4">
                          <button 
                            onClick={() => toggleRuleSelection(r.id)}
                            className="mr-4 text-gray-300 hover:text-blue-500 transition-colors"
                          >
                            {selectedRuleIds.has(r.id) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                          </button>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <p className="font-black text-sm text-gray-800 truncate">{r.label}</p>
                              {r.id === activeRuleId && <span className="bg-blue-100 text-blue-600 text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter">当前激活</span>}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-1">
                               <span className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-black">步长: {r.value}</span>
                               <span className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-black">走势: {r.trendRows}R</span>
                               <span className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-black">珠盘: {r.beadRows}R</span>
                               <span className="text-[9px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded font-black">龙提醒: {r.dragonThreshold}连</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setEditingRule(r)} 
                              className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all shadow-sm"
                              title="编辑"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteRule(r.id)} 
                              className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-xl transition-all shadow-sm"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {editingRule && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-xl font-black mb-6 text-gray-800">编辑采样规则</h3>
            <form onSubmit={handleSaveRule} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">规则名称</label>
                <input 
                  required
                  value={editingRule.label}
                  onChange={e => setEditingRule({...editingRule, label: e.target.value})}
                  className="w-full px-5 py-3 rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">区块步长</label>
                  <input 
                    type="number" min="1" required
                    value={editingRule.value}
                    onChange={e => setEditingRule({...editingRule, value: parseInt(e.target.value) || 1})}
                    className="w-full px-5 py-3 rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1">起始偏移</label>
                  <input 
                    type="number" min="0"
                    value={editingRule.startBlock || ''}
                    onChange={e => setEditingRule({...editingRule, startBlock: parseInt(e.target.value) || 0})}
                    className="w-full px-5 py-3 rounded-xl bg-gray-50 border-0 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setEditingRule(null)} className="flex-1 py-3 font-black text-sm text-gray-400 hover:bg-gray-50 rounded-xl transition-all">取消</button>
                <button type="submit" className="flex-1 py-3 font-black text-sm bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100 active:scale-95 transition-all">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBatchModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl p-8 md:p-10 animate-in zoom-in-95 duration-200">
             <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-50 rounded-xl">
                    <Layers className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-900">批量配置采样规则</h3>
                  </div>
                </div>
                <button onClick={() => setShowBatchModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                  <X className="w-5 h-5" />
                </button>
             </div>
             <textarea 
               value={batchText}
               onChange={(e) => setBatchText(e.target.value)}
               className="w-full h-[300px] px-6 py-5 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-mono text-sm no-scrollbar resize-none mb-6"
               placeholder="名称,步长,偏移,走势行,珠盘行,龙阈值 (逗号分隔)"
             />
             <div className="flex gap-4">
                <button onClick={() => setShowBatchModal(false)} className="flex-1 py-4 font-black text-sm text-gray-400 hover:bg-gray-50 rounded-2xl">取消</button>
                <button onClick={handleBatchRuleSave} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all">保存更新</button>
             </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-8 bg-red-50 border-l-8 border-red-500 p-6 rounded-2xl flex items-start text-red-700 shadow-sm animate-in fade-in duration-300">
          <AlertCircle className="w-6 h-6 mr-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-black text-sm mb-1 uppercase tracking-wider">连接异常</h4>
            <p className="text-xs font-medium opacity-80">{error}</p>
            <p className="text-xs font-medium opacity-60 mt-2">
              💡 提示：请确保 API Key 正确，并检查网络连接。
              <a href="https://tronscan.org/#/tools/tron-station/api-keys" target="_blank" rel="noopener noreferrer" className="underline ml-2">
                获取新的 API Key
              </a>
            </p>
          </div>
          <button 
            onClick={() => {
              setError(null);
              setAllBlocks([]);
            }} 
            className="ml-4 px-5 py-2.5 bg-red-100 rounded-xl text-xs font-black uppercase hover:bg-red-200 transition-colors"
          >
            重新配置
          </button>
        </div>
      )}

      {/* 移除全屏加载遮罩，因为现在使用后端数据，不需要等待 */}
    </div>
  );
};

export default App;
