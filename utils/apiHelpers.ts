import { BlockData } from '../types';

// TronScan API 基础 URL
const TRONSCAN_API_BASE = 'https://apilist.tronscanapi.com';

// 内存缓存
const memoryCache = new Map<number, BlockData>();

export const deriveResultFromHash = (hash: string): number => {
  if (!hash) return 0;
  const digits = hash.match(/\d/g);
  if (digits && digits.length > 0) {
    return parseInt(digits[digits.length - 1], 10);
  }
  return 0;
};

export const formatTimestamp = (ts: number): string => {
  const date = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 带重试的 fetch
export const fetchWithRetry = async (url: string, options: any = {}, retries = 3, backoff = 500): Promise<any> => {
  try {
    console.log(`[API] 请求: ${url}`);
    
    const response = await fetch(url, options);
    
    console.log(`[API] 响应状态: ${response.status}`);
    
    if (response.status === 429) {
      console.warn('[API] 请求频率超限，等待重试...');
      if (retries > 0) {
        await wait(backoff);
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw new Error("请求频率超限 (429)，请稍后再试");
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] HTTP 错误 ${response.status}:`, errorText);
      throw new Error(`HTTP 错误: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('[API] 响应成功');
    
    if (data.Error) {
      console.error('[API] 业务错误:', data.Error);
      throw new Error(data.Error);
    }
    
    return data;
  } catch (error: any) {
    console.error('[API] 请求失败:', error.message);
    
    if (retries > 0 && !error.message.includes('Failed to fetch')) {
      console.log(`[API] 重试中... (剩余 ${retries} 次)`);
      await wait(backoff);
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    
    // 网络错误特殊处理
    if (error.message.includes('Failed to fetch')) {
      throw new Error('网络连接失败，请检查网络或 CORS 设置');
    }
    
    throw error;
  }
};

// 转换 TronScan 区块数据到我们的格式
const transformTronScanBlock = (raw: any): BlockData => {
  const hash = raw.hash;
  const height = raw.number;
  const timestampRaw = raw.timestamp;
  const resultValue = deriveResultFromHash(hash);
  
  return {
    height,
    hash,
    resultValue,
    type: resultValue % 2 === 0 ? 'EVEN' : 'ODD',
    sizeType: resultValue >= 5 ? 'BIG' : 'SMALL',
    timestamp: formatTimestamp(timestampRaw)
  };
};

// 获取最新区块
export const fetchLatestBlock = async (apiKey: string): Promise<BlockData> => {
  const headers: Record<string, string> = {};
  
  // TronScan API 需要 API Key
  if (apiKey && apiKey.trim()) {
    headers['TRON-PRO-API-KEY'] = apiKey.trim();
  }
  
  const data = await fetchWithRetry(`${TRONSCAN_API_BASE}/api/block?sort=-number&limit=1&start=0`, {
    method: 'GET',
    headers
  });

  if (!data.data || data.data.length === 0) {
    throw new Error('未获取到区块数据');
  }

  return transformTronScanBlock(data.data[0]);
};

// 根据区块号获取区块
export const fetchBlockByNum = async (num: number, apiKey: string): Promise<BlockData> => {
  const cacheKey = num;
  const cached = memoryCache.get(cacheKey);
  
  if (cached) {
    return cached;
  }

  const headers: Record<string, string> = {};
  
  if (apiKey && apiKey.trim()) {
    headers['TRON-PRO-API-KEY'] = apiKey.trim();
  }

  const data = await fetchWithRetry(`${TRONSCAN_API_BASE}/api/block?number=${num}`, {
    method: 'GET',
    headers
  });

  if (!data.data || data.data.length === 0) {
    throw new Error(`区块 ${num} 未找到`);
  }
  
  const block = transformTronScanBlock(data.data[0]);
  memoryCache.set(cacheKey, block);
  
  return block;
};

// 批量获取区块范围
export const fetchBlockRange = async (start: number, end: number, interval: number, apiKey: string): Promise<BlockData[]> => {
  const blocks: BlockData[] = [];
  const heights: number[] = [];
  
  // 收集所有需要获取的高度
  for (let i = start; i <= end; i += interval) {
    heights.push(i);
  }
  
  // TronScan API 支持批量查询，但我们还是逐个获取以保持兼容性
  for (const height of heights) {
    try {
      const block = await fetchBlockByNum(height, apiKey);
      blocks.push(block);
      await wait(100); // 避免请求过快
    } catch (err: any) {
      console.error(`获取区块 ${height} 失败:`, err.message);
    }
  }
  
  return blocks.sort((a, b) => b.height - a.height);
};
