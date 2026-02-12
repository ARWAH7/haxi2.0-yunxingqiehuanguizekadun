// 下注数据 API 客户端
const BACKEND_API_URL = 'http://localhost:3001';

// ==================== 下注记录 ====================

export async function saveBetRecords(records: any[]): Promise<void> {
  try {
    for (const record of records) {
      await fetch(`${BACKEND_API_URL}/api/bets/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    }
  } catch (error) {
    console.error('[BettingAPI] 保存下注记录失败:', error);
    throw error;
  }
}

export async function loadBetRecords(limit: number = 500): Promise<any[]> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/bets/records?limit=${limit}`);
    const result = await response.json();
    return result.success ? result.data : [];
  } catch (error) {
    console.error('[BettingAPI] 加载下注记录失败:', error);
    return [];
  }
}

// ==================== 托管任务 ====================

export async function saveBetTasks(tasks: any[]): Promise<void> {
  try {
    await fetch(`${BACKEND_API_URL}/api/bets/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tasks),
    });
  } catch (error) {
    console.error('[BettingAPI] 保存托管任务失败:', error);
    throw error;
  }
}

export async function loadBetTasks(): Promise<any[]> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/bets/tasks`);
    const result = await response.json();
    return result.success ? result.data : [];
  } catch (error) {
    console.error('[BettingAPI] 加载托管任务失败:', error);
    return [];
  }
}

// 防抖保存托管任务
let saveTasksTimer: NodeJS.Timeout | null = null;
export function debouncedSaveBetTasks(tasks: any[], delay: number = 2000): void {
  if (saveTasksTimer) clearTimeout(saveTasksTimer);
  saveTasksTimer = setTimeout(() => {
    saveBetTasks(tasks).catch(err => console.error('[BettingAPI] 防抖保存托管任务失败:', err));
  }, delay);
}

// ==================== 下注配置 ====================

export async function saveBetConfig(config: any): Promise<void> {
  try {
    await fetch(`${BACKEND_API_URL}/api/bets/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  } catch (error) {
    console.error('[BettingAPI] 保存下注配置失败:', error);
    throw error;
  }
}

export async function loadBetConfig(): Promise<any | null> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/bets/config`);
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    console.error('[BettingAPI] 加载下注配置失败:', error);
    return null;
  }
}

// 防抖保存下注配置
let saveConfigTimer: NodeJS.Timeout | null = null;
export function debouncedSaveBetConfig(config: any, delay: number = 2000): void {
  if (saveConfigTimer) clearTimeout(saveConfigTimer);
  saveConfigTimer = setTimeout(() => {
    saveBetConfig(config).catch(err => console.error('[BettingAPI] 防抖保存下注配置失败:', err));
  }, delay);
}

// ==================== 账户余额 ====================

export async function saveBalance(balance: number): Promise<void> {
  try {
    await fetch(`${BACKEND_API_URL}/api/bets/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance }),
    });
  } catch (error) {
    console.error('[BettingAPI] 保存账户余额失败:', error);
    throw error;
  }
}

export async function loadBalance(): Promise<number | null> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/bets/balance`);
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    console.error('[BettingAPI] 加载账户余额失败:', error);
    return null;
  }
}

// 防抖保存账户余额
let saveBalanceTimer: NodeJS.Timeout | null = null;
export function debouncedSaveBalance(balance: number, delay: number = 1000): void {
  if (saveBalanceTimer) clearTimeout(saveBalanceTimer);
  saveBalanceTimer = setTimeout(() => {
    saveBalance(balance).catch(err => console.error('[BettingAPI] 防抖保存账户余额失败:', err));
  }, delay);
}

// ==================== 全局指标 ====================

export async function saveGlobalMetrics(metrics: any): Promise<void> {
  try {
    await fetch(`${BACKEND_API_URL}/api/bets/global-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics),
    });
  } catch (error) {
    console.error('[BettingAPI] 保存全局指标失败:', error);
    throw error;
  }
}

export async function loadGlobalMetrics(): Promise<any | null> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/bets/global-metrics`);
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    console.error('[BettingAPI] 加载全局指标失败:', error);
    return null;
  }
}

// 防抖保存全局指标
let saveMetricsTimer: NodeJS.Timeout | null = null;
export function debouncedSaveGlobalMetrics(metrics: any, delay: number = 2000): void {
  if (saveMetricsTimer) clearTimeout(saveMetricsTimer);
  saveMetricsTimer = setTimeout(() => {
    saveGlobalMetrics(metrics).catch(err => console.error('[BettingAPI] 防抖保存全局指标失败:', err));
  }, delay);
}
