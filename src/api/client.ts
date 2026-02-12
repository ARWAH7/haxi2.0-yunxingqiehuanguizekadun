import { BlockData } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

class ApiClient {
  private apiKey: string = '';

  setApiKey(key: string) {
    this.apiKey = key;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.apiKey && { 'x-api-key': this.apiKey }),
      ...options.headers,
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP Error: ${response.status}`);
      }

      return data;
    } catch (error: any) {
      console.error('API 请求失败:', error);
      return {
        success: false,
        error: error.message || '网络请求失败',
      };
    }
  }

  // 获取最新区块
  async getLatestBlock(): Promise<ApiResponse<BlockData>> {
    return this.request<BlockData>('/blocks/latest');
  }

  // 根据区块号获取区块
  async getBlockByNumber(number: number): Promise<ApiResponse<BlockData>> {
    return this.request<BlockData>(`/blocks/${number}`);
  }

  // 批量获取区块范围
  async getBlockRange(
    start: number,
    end: number,
    interval: number = 1
  ): Promise<ApiResponse<BlockData[]>> {
    return this.request<BlockData[]>('/blocks/range', {
      method: 'POST',
      body: JSON.stringify({ start, end, interval }),
    });
  }

  // 获取系统状态
  async getStatus(): Promise<ApiResponse<any>> {
    return this.request<any>('/status');
  }

  // 保存配置
  async saveConfig(config: any): Promise<ApiResponse<any>> {
    return this.request<any>('/config/save', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // 加载配置
  async loadConfig(): Promise<ApiResponse<any>> {
    return this.request<any>('/config/load');
  }
}

export const apiClient = new ApiClient();
export default apiClient;
