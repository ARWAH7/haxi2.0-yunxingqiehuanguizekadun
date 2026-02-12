// AI 预测数据 API 客户端
// 用于与后端 Redis 数据库交互

const BACKEND_API_URL = 'http://localhost:3001';

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

// ==================== AI 预测历史 ====================

/**
 * 保存 AI 预测记录
 */
export async function savePrediction(prediction: any): Promise<void> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/ai/predictions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prediction)
    });
    const result = await response.json();
    if (!result.success) {
      console.error('[AI API] 保存预测记录失败:', result.error);
    }
  } catch (error) {
    console.error('[AI API] 保存预测记录失败:', error);
  }
}

/**
 * 获取 AI 预测历史
 */
export async function loadPredictions(modelId?: string): Promise<any[]> {
  try {
    const url = modelId 
      ? `${BACKEND_API_URL}/api/ai/predictions?modelId=${modelId}`
      : `${BACKEND_API_URL}/api/ai/predictions`;
    
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.success) {
      console.log(`[AI API] ✅ 加载预测历史: ${result.data.length} 条`);
      return result.data;
    } else {
      console.error('[AI API] 加载预测历史失败:', result.error);
      return [];
    }
  } catch (error) {
    console.error('[AI API] 加载预测历史失败:', error);
    return [];
  }
}

/**
 * 清除 AI 预测历史
 */
export async function clearPredictions(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/ai/predictions`, {
      method: 'DELETE'
    });
    const result = await response.json();
    
    if (result.success) {
      console.log('[AI API] ✅ 预测历史已清除');
      return true;
    } else {
      console.error('[AI API] 清除预测历史失败:', result.error);
      return false;
    }
  } catch (error) {
    console.error('[AI API] 清除预测历史失败:', error);
    return false;
  }
}

// ==================== AI 模型统计 ====================

/**
 * 保存 AI 模型统计
 */
export async function saveModelStats(stats: Record<string, { total: number; correct: number }>): Promise<void> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/ai/model-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stats)
    });
    const result = await response.json();
    if (!result.success) {
      console.error('[AI API] 保存模型统计失败:', result.error);
    }
  } catch (error) {
    console.error('[AI API] 保存模型统计失败:', error);
  }
}

/**
 * 防抖保存模型统计（避免频繁调用）
 */
export const debouncedSaveModelStats = debounce(saveModelStats, 2000);

/**
 * 获取 AI 模型统计
 */
export async function loadModelStats(): Promise<Record<string, { total: number; correct: number }>> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/ai/model-stats`);
    const result = await response.json();
    
    if (result.success && result.data) {
      console.log('[AI API] ✅ 加载模型统计成功');
      return result.data;
    } else {
      console.log('[AI API] ℹ️ 模型统计为空，使用默认值');
      return {};
    }
  } catch (error) {
    console.error('[AI API] 加载模型统计失败:', error);
    return {};
  }
}

/**
 * 清除 AI 模型统计
 */
export async function clearModelStats(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/ai/model-stats`, {
      method: 'DELETE'
    });
    const result = await response.json();
    
    if (result.success) {
      console.log('[AI API] ✅ 模型统计已清除');
      return true;
    } else {
      console.error('[AI API] 清除模型统计失败:', result.error);
      return false;
    }
  } catch (error) {
    console.error('[AI API] 清除模型统计失败:', error);
    return false;
  }
}
