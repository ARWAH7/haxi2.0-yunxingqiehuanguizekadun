
import { BlockData, BlockType, SizeType, GridCell } from '../types';

const TRON_GRID_BASE = "https://api.trongrid.io";

// Persistent memory cache for blocks to avoid re-fetching same data
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

export const fetchWithRetry = async (url: string, options: any, retries = 3, backoff = 500): Promise<any> => {
  try {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      if (retries > 0) {
        await wait(backoff);
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw new Error("Rate limit exceeded (429). Please try again later.");
    }

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    const data = await response.json();
    if (data.Error) throw new Error(data.Error);
    return data;
  } catch (error) {
    if (retries > 0) {
      await wait(backoff);
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
};

export const fetchLatestBlock = async (apiKey: string) => {
  return fetchWithRetry(`${TRON_GRID_BASE}/wallet/getnowblock`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'TRON-PRO-API-KEY': apiKey
    },
    body: '{}'
  });
};

export const fetchBlockByNum = async (num: number, apiKey: string) => {
  if (memoryCache.has(num)) return memoryCache.get(num);

  const data = await fetchWithRetry(`${TRON_GRID_BASE}/wallet/getblockbynum`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'TRON-PRO-API-KEY': apiKey
    },
    body: JSON.stringify({ num })
  });

  if (!data.blockID) throw new Error(`Block ${num} not found`);
  
  const block = transformTronBlock(data);
  memoryCache.set(num, block);
  return block;
};

export const transformTronBlock = (raw: any): BlockData => {
  const hash = raw.blockID;
  const height = raw.block_header.raw_data.number;
  const timestampRaw = raw.block_header.raw_data.timestamp;
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

/**
 * Big Road Calculation:
 * Optimized for stability: when data reaches limits, it shifts by full logical columns.
 * 限制最多 40 列，超过后删除最后一列（最旧的数据）
 */
export const calculateTrendGrid = (
  blocks: BlockData[], 
  typeKey: 'type' | 'sizeType',
  rows: number = 6
): GridCell[][] => {
  if (blocks.length === 0) return Array(40).fill(null).map(() => Array(rows).fill({ type: null }));
  
  // Sort chronologically for path finding
  const chronological = [...blocks].sort((a, b) => a.height - b.height);
  const columns: GridCell[][] = [];
  let currentColumn: GridCell[] = [];
  let lastVal: string | null = null;

  chronological.forEach((block) => {
    const currentVal = block[typeKey];
    // Rule for "Big Road": New column on result change OR if current column is full
    if (currentVal !== lastVal || currentColumn.length >= rows) {
      if (currentColumn.length > 0) {
        while (currentColumn.length < rows) {
          currentColumn.push({ type: null });
        }
        columns.push(currentColumn);
      }
      currentColumn = [];
      lastVal = currentVal;
    }
    currentColumn.push({ type: currentVal as any, value: block.resultValue });
  });

  if (currentColumn.length > 0) {
    while (currentColumn.length < rows) {
      currentColumn.push({ type: null });
    }
    columns.push(currentColumn);
  }

  // 限制最多 44 列，超过后删除最后一列（最旧的数据）
  const maxCols = 44;
  if (columns.length > maxCols) {
    // 删除最后的列（最旧的数据），保留最新的 44 列
    return columns.slice(columns.length - maxCols);
  }

  // 如果不足 44 列，填充空列
  while (columns.length < maxCols) {
    columns.push(Array(rows).fill({ type: null }));
  }

  return columns;
};

/**
 * Bead Road Calculation:
 * Uses global index system to ensure stable block positions.
 * Displays data in a 6-row × 44-column grid (264 cells total).
 * Data fills from left to right, top to bottom.
 */
export const calculateBeadGrid = (
  blocks: BlockData[],
  typeKey: 'type' | 'sizeType',
  rows: number = 6,
  interval: number = 1,
  startBlock: number = 0
): GridCell[][] => {
  // 参数验证
  const validRows = rows > 0 ? rows : 6;
  const validInterval = interval > 0 ? interval : 1;
  const validStartBlock = startBlock >= 0 ? startBlock : 0;
  
  // 空数据处理
  if (blocks.length === 0) {
    return Array(44).fill(null).map(() => 
      Array(validRows).fill({ type: null })
    );
  }

  // ✅ 关键修改 1：数据从旧到新排序
  const chronological = [...blocks].sort((a, b) => a.height - b.height);

  // ✅ 关键修改 2：计算全局索引（epoch 是起始偏移）
  const epoch = validStartBlock || 0;
  
  // ✅ 关键修改 3：为每个区块计算全局索引
  // 全局索引 = (区块高度 - 起始偏移) / 步长
  const indexedBlocks = chronological.map(b => ({
    block: b,
    idx: Math.floor((b.height - epoch) / validInterval)
  }));

  // 🔍 调试：输出全局索引计算
  if (process.env.NODE_ENV === 'development') {
    console.log('[BeadGrid] 全局索引计算:');
    indexedBlocks.slice(0, 3).forEach(({ block, idx }) => {
      const globalCol = Math.floor(idx / validRows);
      const globalRow = idx % validRows;
      console.log(`  区块 ${block.height}: 全局索引 ${idx}, 全局列 ${globalCol}, 全局行 ${globalRow}`);
    });
    if (indexedBlocks.length > 3) {
      console.log('  ...');
      indexedBlocks.slice(-3).forEach(({ block, idx }) => {
        const globalCol = Math.floor(idx / validRows);
        const globalRow = idx % validRows;
        console.log(`  区块 ${block.height}: 全局索引 ${idx}, 全局列 ${globalCol}, 全局行 ${globalRow}`);
      });
    }
  }

  // ✅ 关键修改 4：确定显示窗口
  const firstGlobalIdx = indexedBlocks[0].idx;
  const startColIdx = Math.floor(firstGlobalIdx / validRows);

  const lastGlobalIdx = indexedBlocks[indexedBlocks.length - 1].idx;
  const endColIdx = Math.max(startColIdx + 43, Math.floor(lastGlobalIdx / validRows));

  const totalCols = endColIdx - startColIdx + 1;

  // ✅ 关键修改 5：限制最多 44 列
  const maxCols = 44;
  const actualCols = Math.min(totalCols, maxCols);

  // ✅ 关键修改 6：如果超过 44 列，调整起始列索引，只显示最新的 44 列
  const adjustedStartColIdx = totalCols > maxCols ? endColIdx - maxCols + 1 : startColIdx;

  // 🔍 调试：输出窗口信息
  if (process.env.NODE_ENV === 'development') {
    console.log(`[BeadGrid] 窗口信息:`);
    console.log(`  总列数: ${totalCols}, 实际列数: ${actualCols}`);
    console.log(`  起始列索引: ${adjustedStartColIdx}, 结束列索引: ${endColIdx}`);
    console.log(`  显示区块: ${indexedBlocks[0].block.height} - ${indexedBlocks[indexedBlocks.length - 1].block.height}`);
  }

  // ✅ 关键修改 7：创建网格
  const grid: GridCell[][] = Array.from({ length: actualCols }, () => 
    Array.from({ length: validRows }, () => ({ type: null }))
  );

  // ✅ 关键修改 8：使用全局索引填充网格
  indexedBlocks.forEach(({ block, idx }) => {
    const globalCol = Math.floor(idx / validRows);
    const localCol = globalCol - adjustedStartColIdx;
    const localRow = idx % validRows;

    if (localCol >= 0 && localCol < actualCols) {
      grid[localCol][localRow] = { 
        type: block[typeKey] as any, 
        value: block.resultValue,
        blockHeight: block.height
      };
      
      // 🔍 调试：输出前3个和后3个数据的位置
      if (process.env.NODE_ENV === 'development') {
        const isFirst3 = indexedBlocks.indexOf(indexedBlocks.find(ib => ib.block.height === block.height)!) < 3;
        const isLast3 = indexedBlocks.indexOf(indexedBlocks.find(ib => ib.block.height === block.height)!) >= indexedBlocks.length - 3;
        if (isFirst3 || isLast3) {
          console.log(`[BeadGrid] 区块 ${block.height}: 全局列 ${globalCol} → 本地列 ${localCol}, 行 ${localRow}`);
        }
      }
    }
  });

  return grid;
};
