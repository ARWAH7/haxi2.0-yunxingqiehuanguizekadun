// API服务模块
// 封装所有API调用逻辑，添加错误处理和重试机制

// API基础URL配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// API响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// AI预测类型
export interface AIPrediction {
  id?: string;
  blockHeight?: number;
  timestamp: number;
  prediction?: string;
  actual?: string;
  correct?: boolean;
  confidence?: number;
  modelId?: string;
  ruleId?: string;
  nextParity?: string;
  nextSize?: string;
  actualParity?: string;
  actualSize?: string;
  isParityCorrect?: boolean;
  isSizeCorrect?: boolean;
  resolved?: boolean;
  targetHeight?: number;
  detectedCycle?: string;
  parityConfidence?: number;
  sizeConfidence?: number;
}

// 模型统计类型
export interface ModelStats {
  total: number;
  correct: number;
}

// 通用请求函数
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  retryCount: number = 3
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    console.error(`API请求失败: ${endpoint}`, error);
    
    // 重试机制
    if (retryCount > 0) {
      console.log(`正在重试... (${retryCount} 次剩余)`);
      // 指数退避策略
      await new Promise(resolve => setTimeout(resolve, 1000 * (4 - retryCount)));
      return fetchApi<T>(endpoint, options, retryCount - 1);
    }

    // 返回错误响应
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
}

// AI预测相关API
export const aiPredictionApi = {
  // 保存AI预测记录
  savePrediction: async (prediction: AIPrediction): Promise<ApiResponse> => {
    return fetchApi('/api/ai/predictions', {
      method: 'POST',
      body: JSON.stringify(prediction),
    });
  },

  // 获取AI预测历史
  getPredictions: async (
    modelId?: string,
    ruleId?: string,
    limit: number = 10000
  ): Promise<ApiResponse<AIPrediction[]>> => {
    const params = new URLSearchParams();
    if (modelId) params.append('modelId', modelId);
    if (ruleId) params.append('ruleId', ruleId);
    params.append('limit', limit.toString());

    return fetchApi<AIPrediction[]>(`/api/ai/predictions?${params}`);
  },

  // 保存模型统计数据
  saveModelStats: async (stats: Record<string, ModelStats>): Promise<ApiResponse> => {
    return fetchApi('/api/ai/model-stats', {
      method: 'POST',
      body: JSON.stringify(stats),
    });
  },

  // 获取模型统计数据
  getModelStats: async (): Promise<ApiResponse<Record<string, ModelStats>>> => {
    return fetchApi<Record<string, ModelStats>>('/api/ai/model-stats');
  },
};

// 下注相关API
export const betApi = {
  // 保存下注记录
  saveRecord: async (bet: any): Promise<ApiResponse> => {
    return fetchApi('/api/bets/records', {
      method: 'POST',
      body: JSON.stringify(bet),
    });
  },

  // 获取下注记录
  getRecords: async (limit: number = 500): Promise<ApiResponse<any[]>> => {
    return fetchApi<any[]>(`/api/bets/records?limit=${limit}`);
  },

  // 保存托管任务
  saveTasks: async (tasks: any[]): Promise<ApiResponse> => {
    return fetchApi('/api/bets/tasks', {
      method: 'POST',
      body: JSON.stringify(tasks),
    });
  },

  // 获取托管任务
  getTasks: async (): Promise<ApiResponse<any[]>> => {
    return fetchApi<any[]>('/api/bets/tasks');
  },

  // 保存下注配置
  saveConfig: async (config: any): Promise<ApiResponse> => {
    return fetchApi('/api/bets/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  // 获取下注配置
  getConfig: async (): Promise<ApiResponse<any>> => {
    return fetchApi<any>('/api/bets/config');
  },
};

// 检查网络连接
export async function checkNetworkConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      timeout: 3000,
    });
    return response.ok;
  } catch {
    return false;
  }
}

// 导出默认API对象
export default {
  ai: aiPredictionApi,
  bet: betApi,
  checkNetworkConnection,
};
