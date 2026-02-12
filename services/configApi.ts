/**
 * 配置数据 API 客户端
 * 所有配置数据现在存储在后端 Redis 中
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export interface ThemeColors {
  odd: string;
  even: string;
  big: string;
  small: string;
}

export interface IntervalRule {
  id: string;
  label: string;
  value: number;
  startBlock: number;
  trendRows: number;
  beadRows: number;
  dragonThreshold?: number;
}

export interface FollowedPattern {
  ruleId: string;
  type: 'parity' | 'size';
  mode: 'trend' | 'bead';
  rowId?: number;
}

// ==================== 主题颜色 ====================

export async function saveThemeColors(colors: ThemeColors): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/theme`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(colors),
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '保存主题颜色失败');
    }
  } catch (error) {
    console.error('[配置API] 保存主题颜色失败:', error);
    throw error;
  }
}

export async function loadThemeColors(): Promise<ThemeColors | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/theme`);
    const result = await response.json();
    
    if (result.success) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('[配置API] 加载主题颜色失败:', error);
    return null;
  }
}

// ==================== 采样规则 ====================

export async function saveRules(rules: IntervalRule[]): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rules),
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '保存采样规则失败');
    }
  } catch (error) {
    console.error('[配置API] 保存采样规则失败:', error);
    throw error;
  }
}

export async function loadRules(): Promise<IntervalRule[] | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/rules`);
    const result = await response.json();
    
    if (result.success) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('[配置API] 加载采样规则失败:', error);
    return null;
  }
}

// ==================== 激活规则 ====================

export async function saveActiveRuleId(ruleId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/active-rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleId }),
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '保存激活规则失败');
    }
  } catch (error) {
    console.error('[配置API] 保存激活规则失败:', error);
    throw error;
  }
}

export async function loadActiveRuleId(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/active-rule`);
    const result = await response.json();
    
    if (result.success) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('[配置API] 加载激活规则失败:', error);
    return null;
  }
}

// ==================== 关注模式 ====================

export async function saveFollowedPatterns(patterns: FollowedPattern[]): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/followed-patterns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patterns),
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '保存关注模式失败');
    }
  } catch (error) {
    console.error('[配置API] 保存关注模式失败:', error);
    throw error;
  }
}

export async function loadFollowedPatterns(): Promise<FollowedPattern[] | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/followed-patterns`);
    const result = await response.json();
    
    if (result.success) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('[配置API] 加载关注模式失败:', error);
    return null;
  }
}

// ==================== 清除所有配置 ====================

export async function clearAllConfig(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/config/all`, {
      method: 'DELETE',
    });
    
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '清除配置失败');
    }
  } catch (error) {
    console.error('[配置API] 清除配置失败:', error);
    throw error;
  }
}

// ==================== 防抖保存 ====================

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

// 防抖保存主题颜色
export const debouncedSaveThemeColors = debounce(saveThemeColors, 1000);

// 防抖保存采样规则
export const debouncedSaveRules = debounce(saveRules, 2000);

// 防抖保存激活规则
export const debouncedSaveActiveRuleId = debounce(saveActiveRuleId, 500);

// 防抖保存关注模式
export const debouncedSaveFollowedPatterns = debounce(saveFollowedPatterns, 2000);
