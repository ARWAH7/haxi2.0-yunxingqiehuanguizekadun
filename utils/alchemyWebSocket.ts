import WebSocket from 'ws';
import { BlockData } from '../types';
import { deriveResultFromHash, formatTimestamp } from './apiHelpers';

export class AlchemyWebSocketService {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(apiKey: string) {
    this.wsUrl = `wss://tron-mainnet.g.alchemy.com/v2/${apiKey}`;
  }

  connect(onBlock: (block: BlockData) => void) {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        console.log('[Alchemy WS] 连接成功');
        this.reconnectAttempts = 0;
        
        // 订阅新区块
        this.ws?.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_subscribe',
          params: ['newHeads']
        }));
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.method === 'eth_subscription') {
            const rawBlock = message.params.result;
            const block = this.parseBlock(rawBlock);
            onBlock(block);
          }
        } catch (error) {
          console.error('[Alchemy WS] 解析消息失败:', error);
        }
      });

      this.ws.on('close', () => {
        console.log('[Alchemy WS] 连接关闭');
        this.reconnect(onBlock);
      });

      this.ws.on('error', (error) => {
        console.error('[Alchemy WS] 错误:', error);
      });

    } catch (error) {
      console.error('[Alchemy WS] 连接失败:', error);
      this.reconnect(onBlock);
    }
  }

  private reconnect(onBlock: (block: BlockData) => void) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Alchemy WS] 达到最大重连次数');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[Alchemy WS] ${delay}ms 后重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect(onBlock);
    }, delay);
  }

  private parseBlock(rawBlock: any): BlockData {
    const height = parseInt(rawBlock.number, 16);
    const hash = rawBlock.hash;
    const timestamp = parseInt(rawBlock.timestamp, 16);
    const resultValue = deriveResultFromHash(hash);
    
    return {
      height,
      hash,
      resultValue,
      type: resultValue % 2 === 0 ? 'EVEN' : 'ODD',
      sizeType: resultValue >= 5 ? 'BIG' : 'SMALL',
      timestamp: formatTimestamp(timestamp * 1000)
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
