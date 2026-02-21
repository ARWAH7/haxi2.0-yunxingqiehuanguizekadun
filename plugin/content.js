/**
 * ========================================================
 *  哈希游戏自动下注插件 - Content Script v3.0
 *  核心改进: WebSocket实时数据 + 极速下注 + 区块匹配修正
 * ========================================================
 */
(function () {
  'use strict';

  // ==================== 配置常量 ====================
  let API_URL = 'http://localhost:3001';
  let WS_URL = 'ws://localhost:8080';
  const PAGE_POLL_MS = 500;        // 页面区块轮询(0.5秒)
  const BET_DELAY_MS = 100;        // 下注操作间延迟(极速)
  const FIB_SEQ = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610];
  const SEQ_1326 = [1, 3, 2, 6];

  const STRATEGY_LABELS = {
    FLAT: '平注策略', MARTINGALE: '马丁格尔', DALEMBERT: '达朗贝尔',
    FIBONACCI: '斐波那契', PAROLI: '帕罗利', '1326': '1-3-2-6',
    CUSTOM: '自定义倍投', AI_KELLY: 'AI动态凯利'
  };

  const TARGET_LABELS = {
    FIXED_ODD: '定买单', FIXED_EVEN: '定买双', FIXED_BIG: '定买大', FIXED_SMALL: '定买小',
    FOLLOW_LAST: '跟上期(顺)', REVERSE_LAST: '反上期(反)',
    RANDOM_PARITY: '随机单双', RANDOM_SIZE: '随机大小',
    FOLLOW_RECENT_TREND: '参考近期走势(顺势)', FOLLOW_RECENT_TREND_REVERSE: '参考近期走势(反势)',
    DRAGON_FOLLOW: '长龙顺势跟投', DRAGON_REVERSE: '长龙反势跟投',
    AI_PREDICTION: 'AI单规托管', GLOBAL_AI_FULL_SCAN: 'AI全域全规则'
  };

  const TARGET_TEXT = { ODD: '单', EVEN: '双', BIG: '大', SMALL: '小' };

  // ==================== 工具函数 ====================
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function detectGameType() {
    const url = decodeURIComponent(window.location.href);
    if (url.includes('尾数单双')) return 'PARITY';
    if (url.includes('尾数大小')) return 'SIZE';
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab) {
      if (tab.includes('单双')) return 'PARITY';
      if (tab.includes('大小')) return 'SIZE';
    }
    const divs = document.querySelectorAll('div.sc-bdVaJa');
    for (const div of divs) {
      const text = div.textContent.trim();
      if (text === '尾数单双') return 'PARITY';
      if (text === '尾数大小') return 'SIZE';
    }
    return null;
  }

  // ==================== DOM适配器 ====================
  const SiteAdapter = {

    /**
     * 获取当前下注区块号 (修复: 取最大值=当前下注区块, 非已开奖区块)
     */
    getCurrentBlock() {
      let maxBlock = null;

      // 方法1: 精确属性匹配, 取所有白色大号数字中的最大值
      const candidates = document.querySelectorAll('div[color="#fff"][font-size="24px"][font-weight="600"]');
      for (const el of candidates) {
        const num = parseInt(el.textContent.trim());
        if (!isNaN(num) && num > 1000000) {
          if (!maxBlock || num > maxBlock) maxBlock = num;
        }
      }
      if (maxBlock) return maxBlock;

      // 方法2: class Wavxa
      const wavxa = document.querySelector('.Wavxa');
      if (wavxa) {
        const num = parseInt(wavxa.textContent.trim());
        if (!isNaN(num) && num > 1000000) return num;
      }

      // 方法3: 搜索所有sc-bdVaJa div中的大数字, 取最大
      const allDivs = document.querySelectorAll('div.sc-bdVaJa');
      for (const div of allDivs) {
        const text = div.textContent.trim();
        if (/^\d{7,9}$/.test(text)) {
          const num = parseInt(text);
          if (num > 1000000 && (!maxBlock || num > maxBlock)) maxBlock = num;
        }
      }
      return maxBlock;
    },

    /**
     * 获取已开奖区块号 (取最小值)
     */
    getResolvedBlock() {
      let minBlock = null;
      const candidates = document.querySelectorAll('div[color="#fff"][font-size="24px"][font-weight="600"]');
      for (const el of candidates) {
        const num = parseInt(el.textContent.trim());
        if (!isNaN(num) && num > 1000000) {
          if (!minBlock || num < minBlock) minBlock = num;
        }
      }
      return minBlock;
    },

    findBetButton(target) {
      const targetText = TARGET_TEXT[target];
      if (!targetText) return null;

      const btns = document.querySelectorAll('div[width="40px"][height="40px"][font-size="40px"][font-weight="600"]');
      for (const btn of btns) {
        if (btn.textContent.trim() === targetText) {
          const parent = btn.parentElement;
          if (parent && parent.getAttribute('height') === '110px') return parent;
          return btn;
        }
      }

      const colorAttr = (target === 'ODD' || target === 'BIG') ? '#24b3a2' : '#ff3636';
      const colorBtns = document.querySelectorAll(`div[color="${colorAttr}"][font-size="40px"]`);
      for (const btn of colorBtns) {
        if (btn.textContent.trim() === targetText) {
          const parent = btn.parentElement;
          if (parent && parent.getAttribute('height') === '110px') return parent;
          return btn;
        }
      }
      return null;
    },

    findAmountInput() {
      return document.querySelector('input[placeholder="输入金额"]');
    },

    findConfirmButton() {
      const spans = document.querySelectorAll('span[color="white"][font-size="14px"]');
      for (const s of spans) {
        if (s.textContent.trim() === '确定') return s.parentElement || s;
      }
      const byClass = document.querySelector('span.NYRcS');
      if (byClass && byClass.textContent.trim() === '确定') return byClass.parentElement || byClass;
      const allSpans = document.querySelectorAll('span.sc-gzVnrw');
      for (const s of allSpans) {
        if (s.textContent.trim() === '确定') return s.parentElement || s;
      }
      return null;
    },

    findResetButton() {
      const divs = document.querySelectorAll('div[width="80px"][color="#6476a0"]');
      for (const div of divs) {
        if (div.textContent.trim() === '重置') return div;
      }
      const byClass = document.querySelector('.cYwdS');
      if (byClass && byClass.textContent.trim() === '重置') return byClass;
      const allDivs = document.querySelectorAll('div[style*="cursor"]');
      for (const div of allDivs) {
        if (div.textContent.trim() === '重置') return div;
      }
      return null;
    },

    /**
     * 极速设置金额: 重置→输入→确定 (最小化延迟)
     */
    async setAmount(amount) {
      const resetBtn = this.findResetButton();
      if (resetBtn) {
        resetBtn.click();
        await delay(BET_DELAY_MS);
      }

      const input = this.findAmountInput();
      if (!input) return false;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeSetter.call(input, String(amount));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const tracker = input._valueTracker;
      if (tracker) {
        tracker.setValue('');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await delay(BET_DELAY_MS);

      const confirmBtn = this.findConfirmButton();
      if (confirmBtn) {
        confirmBtn.click();
        await delay(BET_DELAY_MS);
        return true;
      }
      return false;
    },

    placeBet(target) {
      const btn = this.findBetButton(target);
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    },

    isGameReady() {
      return !!(this.findAmountInput() || this.getCurrentBlock());
    }
  };

  // ==================== WebSocket实时客户端 ====================
  const WSClient = {
    ws: null,
    connected: false,
    latestBlock: null,
    blocks: [],             // 最近100个已开奖区块(从WS接收)
    listeners: [],
    reconnectTimer: null,
    reconnectDelay: 1000,

    connect() {
      if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
        return;
      }

      try {
        console.log('[HAXI插件] 连接WebSocket:', WS_URL);
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectDelay = 1000;
          console.log('[HAXI插件] WebSocket已连接');
          if (panel) panel.addLog('WS实时连接已建立');
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // 跳过连接欢迎消息
            if (data.type === 'connected') return;

            // 区块数据
            if (data.height && data.hash) {
              this.latestBlock = data;
              this.blocks.unshift(data);
              if (this.blocks.length > 200) this.blocks = this.blocks.slice(0, 200);

              // 通知所有监听器
              this.listeners.forEach(fn => {
                try { fn(data); } catch (e) { /* ignore */ }
              });
            }
          } catch (e) { /* ignore parse errors */ }
        };

        this.ws.onclose = () => {
          this.connected = false;
          console.log('[HAXI插件] WebSocket断开, 将在', this.reconnectDelay, 'ms后重连');
          this.reconnectTimer = setTimeout(() => {
            this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 10000);
            this.connect();
          }, this.reconnectDelay);
        };

        this.ws.onerror = () => {
          this.connected = false;
        };
      } catch (e) {
        console.warn('[HAXI插件] WebSocket连接失败:', e.message);
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      }
    },

    disconnect() {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.close();
      }
      this.connected = false;
    },

    onBlock(fn) {
      this.listeners.push(fn);
    },

    /**
     * 获取已按步长过滤的区块数据
     */
    getFilteredBlocks(ruleValue, startBlock, limit) {
      ruleValue = ruleValue || 1;
      limit = limit || 80;
      let filtered = this.blocks;
      if (ruleValue > 1) {
        filtered = this.blocks.filter(b => {
          if (startBlock > 0) return b.height >= startBlock && (b.height - startBlock) % ruleValue === 0;
          return b.height % ruleValue === 0;
        });
      }
      return filtered.slice(0, limit);
    }
  };

  // ==================== API客户端 ====================
  const ApiClient = {
    async get(path) {
      try {
        const res = await fetch(API_URL + path, { signal: AbortSignal.timeout(5000) });
        return await res.json();
      } catch (e) {
        return { success: false };
      }
    },
    async post(path, data) {
      try {
        const res = await fetch(API_URL + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(5000)
        });
        return await res.json();
      } catch (e) {
        return { success: false };
      }
    },
    getSignal(ruleValue, startBlock) {
      return this.get(`/api/plugin/signal?ruleValue=${ruleValue || 1}&startBlock=${startBlock || 0}`);
    },
    getBlocks(limit, ruleValue, startBlock) {
      return this.get(`/api/blocks?limit=${limit || 80}&ruleValue=${ruleValue || 1}&startBlock=${startBlock || 0}`);
    },
    saveConfig(config) { return this.post('/api/plugin/config', config); },
    loadConfig() { return this.get('/api/plugin/config'); },
    saveBet(bet) { return this.post('/api/plugin/bet', bet); },
    saveStats(stats) { return this.post('/api/plugin/stats', stats); },
    loadStats() { return this.get('/api/plugin/stats'); }
  };

  // ==================== 策略引擎 ====================
  const StrategyEngine = {
    calcAmount(strategy, state, baseBet, balance, confidence) {
      switch (strategy) {
        case 'FLAT': return baseBet;
        case 'MARTINGALE': return Math.floor(state.currentBetAmount);
        case 'DALEMBERT': return Math.floor(state.currentBetAmount);
        case 'FIBONACCI': return Math.floor(baseBet * FIB_SEQ[Math.min(state.sequenceIndex, FIB_SEQ.length - 1)]);
        case 'PAROLI': return Math.floor(state.currentBetAmount);
        case '1326': return Math.floor(baseBet * SEQ_1326[state.sequenceIndex % SEQ_1326.length]);
        case 'CUSTOM': return Math.floor(state.currentBetAmount);
        case 'AI_KELLY': {
          const odds = (state.odds || 1.96) - 1;
          const p = (confidence || 60) / 100;
          const f = (odds * p - (1 - p)) / odds;
          if (f > 0) {
            const fraction = state.kellyFraction || 0.2;
            return Math.max(baseBet, Math.min(Math.floor(balance * f * fraction), balance));
          }
          return baseBet;
        }
        default: return baseBet;
      }
    },

    updateState(strategy, state, isWin, baseBet, config) {
      let { currentBetAmount, consecutiveLosses, sequenceIndex } = state;
      switch (strategy) {
        case 'MARTINGALE':
          if (!isWin) {
            consecutiveLosses++;
            if (consecutiveLosses >= (config.maxCycle || 10)) { currentBetAmount = baseBet; consecutiveLosses = 0; }
            else { currentBetAmount *= (config.multiplier || 2); }
          } else { currentBetAmount = baseBet; consecutiveLosses = 0; }
          break;
        case 'DALEMBERT':
          if (!isWin) { currentBetAmount += (config.step || 10); consecutiveLosses++; }
          else { currentBetAmount = Math.max(baseBet, currentBetAmount - (config.step || 10)); consecutiveLosses = 0; }
          break;
        case 'FIBONACCI':
          if (!isWin) { sequenceIndex = Math.min(sequenceIndex + 1, FIB_SEQ.length - 1); }
          else { sequenceIndex = Math.max(0, sequenceIndex - 2); }
          currentBetAmount = baseBet * FIB_SEQ[sequenceIndex];
          break;
        case 'PAROLI':
          if (isWin) { sequenceIndex++; if (sequenceIndex >= 3) { sequenceIndex = 0; currentBetAmount = baseBet; } else { currentBetAmount *= 2; } }
          else { sequenceIndex = 0; currentBetAmount = baseBet; }
          break;
        case '1326':
          if (isWin) { sequenceIndex++; if (sequenceIndex >= SEQ_1326.length) { sequenceIndex = 0; currentBetAmount = baseBet; } else { currentBetAmount = baseBet * SEQ_1326[sequenceIndex]; } }
          else { sequenceIndex = 0; currentBetAmount = baseBet; }
          break;
        case 'CUSTOM': {
          const cSeq = config.customSequence || [1];
          if (!isWin) { sequenceIndex = (sequenceIndex + 1 >= cSeq.length) ? 0 : sequenceIndex + 1; }
          else { sequenceIndex = 0; }
          currentBetAmount = baseBet * cSeq[sequenceIndex];
          break;
        }
        case 'AI_KELLY': currentBetAmount = baseBet; consecutiveLosses = 0; sequenceIndex = 0; break;
        default: currentBetAmount = baseBet;
      }
      return { currentBetAmount: Math.floor(currentBetAmount), consecutiveLosses, sequenceIndex };
    }
  };

  // ==================== 目标选择器 ====================
  const TargetSelector = {
    async determine(autoTarget, gameType, config, blocks) {
      switch (autoTarget) {
        case 'FIXED_ODD':  return { bet: true, target: 'ODD', type: 'PARITY', conf: 60 };
        case 'FIXED_EVEN': return { bet: true, target: 'EVEN', type: 'PARITY', conf: 60 };
        case 'FIXED_BIG':  return { bet: true, target: 'BIG', type: 'SIZE', conf: 60 };
        case 'FIXED_SMALL':return { bet: true, target: 'SMALL', type: 'SIZE', conf: 60 };
        case 'RANDOM_PARITY': return { bet: true, target: Math.random() < 0.5 ? 'ODD' : 'EVEN', type: 'PARITY', conf: 50 };
        case 'RANDOM_SIZE': return { bet: true, target: Math.random() < 0.5 ? 'BIG' : 'SMALL', type: 'SIZE', conf: 50 };
        case 'FOLLOW_LAST': case 'REVERSE_LAST': return this._streakTarget(autoTarget, config, blocks);
        case 'FOLLOW_RECENT_TREND': case 'FOLLOW_RECENT_TREND_REVERSE': return this._lagTarget(autoTarget, config, blocks);
        case 'DRAGON_FOLLOW': case 'DRAGON_REVERSE': return this._dragonTarget(autoTarget, config, blocks);
        case 'AI_PREDICTION': case 'GLOBAL_AI_FULL_SCAN': return this._aiTarget(autoTarget, config);
        default: return { bet: false, reason: '未知目标模式' };
      }
    },
    _calcStreak(blocks, key) {
      if (!blocks || blocks.length === 0) return { val: null, count: 0 };
      const first = blocks[0][key]; let count = 0;
      for (const b of blocks) { if (b[key] === first) count++; else break; }
      return { val: first, count };
    },
    _streakTarget(mode, config, blocks) {
      if (!blocks || blocks.length === 0) return { bet: false, reason: '无区块数据' };
      const targetType = config.targetType || 'PARITY';
      const key = targetType === 'PARITY' ? 'type' : 'sizeType';
      const streak = this._calcStreak(blocks, key);
      const minStreak = config.minStreak || 1;
      if (streak.count >= minStreak) {
        let target = streak.val;
        if (mode === 'REVERSE_LAST') {
          target = targetType === 'PARITY' ? (target === 'ODD' ? 'EVEN' : 'ODD') : (target === 'BIG' ? 'SMALL' : 'BIG');
        }
        return { bet: true, target, type: targetType, conf: 60 };
      }
      return { bet: false, reason: `连续${streak.count}次未达${minStreak}次阈值` };
    },
    _lagTarget(mode, config, blocks) {
      if (!blocks || blocks.length === 0) return { bet: false, reason: '无区块数据' };
      const n = config.trendWindow || 5;
      if (blocks.length <= n) return { bet: false, reason: '数据不足' };
      const source = blocks[n];
      if (!source) return { bet: false, reason: '源区块不存在' };
      const targetType = config.targetType || 'PARITY';
      const isReverse = mode === 'FOLLOW_RECENT_TREND_REVERSE';
      let target;
      if (targetType === 'PARITY') { target = isReverse ? (source.type === 'ODD' ? 'EVEN' : 'ODD') : source.type; }
      else { target = isReverse ? (source.sizeType === 'BIG' ? 'SMALL' : 'BIG') : source.sizeType; }
      return { bet: true, target, type: targetType, conf: 55 };
    },
    _dragonTarget(mode, config, blocks) {
      if (!blocks || blocks.length === 0) return { bet: false, reason: '无区块数据' };
      const startStreak = config.minStreak || 3;
      const endStreak = config.dragonEndStreak || 5;
      const targetType = config.targetType || 'PARITY';
      const key = targetType === 'PARITY' ? 'type' : 'sizeType';
      const streak = this._calcStreak(blocks, key);
      if (streak.count >= startStreak && streak.count <= endStreak) {
        let target = streak.val;
        if (mode === 'DRAGON_REVERSE') {
          target = targetType === 'PARITY' ? (target === 'ODD' ? 'EVEN' : 'ODD') : (target === 'BIG' ? 'SMALL' : 'BIG');
        }
        return { bet: true, target, type: targetType, conf: 65 };
      }
      return { bet: false, reason: `龙长度${streak.count}不在[${startStreak},${endStreak}]范围` };
    },
    async _aiTarget(mode, config) {
      const result = await ApiClient.getSignal(config.ruleValue || 1, config.startBlock || 0);
      if (!result.success || !result.data || !result.data.shouldBet) return { bet: false, reason: 'AI无信号' };
      const d = result.data;
      if (d.parityConf > d.sizeConf && d.parity) return { bet: true, target: d.parity, type: 'PARITY', conf: d.parityConf };
      if (d.sizeConf > d.parityConf && d.size) return { bet: true, target: d.size, type: 'SIZE', conf: d.sizeConf };
      return { bet: false, reason: 'AI置信度不足' };
    }
  };

  // ==================== 下注引擎 v3 (极速+WS实时) ====================
  class BetEngine {
    constructor() {
      this.running = false;
      this.config = {
        strategy: 'FLAT', autoTarget: 'FIXED_ODD', baseBet: 10, odds: 1.96,
        targetType: 'PARITY', multiplier: 2, maxCycle: 10, step: 10,
        minStreak: 1, customSequence: [1, 2, 4, 8, 17], kellyFraction: 0.2,
        trendWindow: 5, dragonEndStreak: 5, ruleValue: 1,
        blockRangeEnabled: false, startBlock: 0, endBlock: 0,
        stopLoss: 0, takeProfit: 0
      };
      this.state = { currentBetAmount: 10, consecutiveLosses: 0, sequenceIndex: 0, odds: 1.96 };
      this.stats = { wins: 0, losses: 0, profit: 0, totalBet: 0 };
      this.betHistory = [];
      this.lastBetBlock = null;
      this.pendingBet = null;
      this._pollTimer = null;
      this._blocks = [];
      this.currentPageBlock = null;
      this.latestBackendBlock = null;
      this.blockMatched = false;
      this.wsConnected = false;
      this._betting = false; // 防止并发下注
    }

    async start() {
      if (this.running) return;
      this.running = true;
      console.log('[HAXI插件] 引擎启动 v3');

      // 初始加载区块数据(HTTP回退)
      await this._fetchBlocksHTTP();

      // 注册WS区块监听 - 实时更新区块数据
      WSClient.onBlock((block) => {
        if (!this.running) return;
        this._onNewBlock(block);
      });

      // 快速页面轮询(500ms) - 检测页面区块变化
      this._startPagePoll();
    }

    stop() {
      this.running = false;
      if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
      console.log('[HAXI插件] 引擎停止');
    }

    /**
     * WS收到新区块 - 实时更新本地数据
     */
    _onNewBlock(block) {
      this.latestBackendBlock = block.height;
      this.wsConnected = true;

      // 更新本地区块缓存
      if (this._blocks.length === 0 || this._blocks[0].height < block.height) {
        this._blocks.unshift(block);
        if (this._blocks.length > 200) this._blocks = this._blocks.slice(0, 200);
      }

      // 检查pending bet结果
      if (this.pendingBet) {
        this._checkPendingResult();
      }

      if (panel) panel.update();
    }

    /**
     * 快速页面轮询 - 检测"当前下注区块"变化
     */
    _startPagePoll() {
      let lastPageBlock = null;

      this._pollTimer = setInterval(async () => {
        if (!this.running || this._betting) return;

        // 读取页面当前下注区块
        this.currentPageBlock = SiteAdapter.getCurrentBlock();
        if (!this.currentPageBlock) return;

        // 更新后端区块(WS优先, HTTP回退)
        if (!this.wsConnected && !this.latestBackendBlock) {
          if (this._blocks.length === 0) await this._fetchBlocksHTTP();
        }
        if (this._blocks.length > 0 && !this.latestBackendBlock) {
          this.latestBackendBlock = this._blocks[0].height;
        }

        // 区块匹配
        if (this.latestBackendBlock) {
          const expected = this.latestBackendBlock + this.config.ruleValue;
          this.blockMatched = Math.abs(this.currentPageBlock - expected) <= this.config.ruleValue;
        }

        // 检测页面区块变化 → 触发下注
        if (this.currentPageBlock !== lastPageBlock) {
          lastPageBlock = this.currentPageBlock;

          // 检查pending bet
          if (this.pendingBet) {
            this._checkPendingResult();
          }

          // 触发新一轮下注
          if (!this.pendingBet && this.currentPageBlock !== this.lastBetBlock) {
            await this._tryBet();
          }
        }

        if (panel) panel.update();
      }, PAGE_POLL_MS);
    }

    /**
     * 核心下注逻辑 - 极速执行
     */
    async _tryBet() {
      if (this._betting || !this.running) return;
      this._betting = true;

      try {
        const pageBlock = this.currentPageBlock;
        if (!pageBlock) return;

        // 区块范围检查
        if (this.config.blockRangeEnabled) {
          if (this.config.startBlock > 0 && pageBlock < this.config.startBlock) return;
          if (this.config.endBlock > 0 && pageBlock > this.config.endBlock) return;
        }

        // 检查停盈止损
        const pl = this.stats.profit;
        if (this.config.stopLoss > 0 && pl <= -this.config.stopLoss) {
          this.stop();
          panel.addLog('触发止损，自动停止');
          panel.update();
          return;
        }
        if (this.config.takeProfit > 0 && pl >= this.config.takeProfit) {
          this.stop();
          panel.addLog('触发止盈，自动停止');
          panel.update();
          return;
        }

        // 不重复同一区块
        if (this.lastBetBlock === pageBlock) return;

        // 获取策略用区块数据(WS优先)
        let blocks = this._getStrategyBlocks();
        if (blocks.length === 0) {
          await this._fetchBlocksHTTP();
          blocks = this._getStrategyBlocks();
        }

        // 确定目标
        const gameType = detectGameType();
        const decision = await TargetSelector.determine(
          this.config.autoTarget, gameType, this.config, blocks
        );
        if (!decision.bet) return;

        // 游戏类型匹配检查
        if (gameType === 'PARITY' && (decision.target === 'BIG' || decision.target === 'SMALL')) return;
        if (gameType === 'SIZE' && (decision.target === 'ODD' || decision.target === 'EVEN')) return;

        // 计算金额
        const balance = 10000;
        const amount = StrategyEngine.calcAmount(
          this.config.strategy,
          { ...this.state, odds: this.config.odds, kellyFraction: this.config.kellyFraction },
          this.config.baseBet, balance, decision.conf
        );
        if (amount <= 0) return;

        // ===== 极速下注 =====
        const t0 = Date.now();
        const targetLabel = TARGET_TEXT[decision.target] || decision.target;

        // 步骤1: 设置金额
        const amountSet = await SiteAdapter.setAmount(amount);
        if (!amountSet) {
          panel.addLog('金额设置失败');
          return;
        }

        // 步骤2: 点击下注
        const placed = SiteAdapter.placeBet(decision.target);
        if (!placed) {
          panel.addLog(`未找到 ${targetLabel} 按钮`);
          return;
        }

        const elapsed = Date.now() - t0;
        this.lastBetBlock = pageBlock;
        this.stats.totalBet += amount;

        const record = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          target: decision.target,
          amount,
          blockHeight: pageBlock,
          strategy: this.config.strategy,
          autoTarget: this.config.autoTarget,
          confidence: decision.conf,
          status: 'PENDING'
        };
        this.betHistory.unshift(record);
        if (this.betHistory.length > 100) this.betHistory = this.betHistory.slice(0, 100);
        this.pendingBet = record;

        panel.addLog(`下注 ${targetLabel} ¥${amount} #${pageBlock} [${elapsed}ms]`);
        ApiClient.saveBet(record);
        panel.update();

      } catch (err) {
        console.error('[HAXI插件] 下注错误:', err);
        panel.addLog('下注异常: ' + err.message);
      } finally {
        this._betting = false;
      }
    }

    /**
     * 获取策略用区块数据(WS缓存优先)
     */
    _getStrategyBlocks() {
      if (WSClient.blocks.length > 0) {
        return WSClient.getFilteredBlocks(this.config.ruleValue, this.config.blockRangeEnabled ? this.config.startBlock : 0, 80);
      }
      return this._blocks;
    }

    /**
     * 检查挂起的下注结果
     */
    _checkPendingResult() {
      if (!this.pendingBet) return;

      const record = this.pendingBet;
      const betBlock = record.blockHeight;

      // 在WS数据或本地缓存中查找该区块
      let resultBlock = WSClient.blocks.find(b => b.height === betBlock);
      if (!resultBlock) resultBlock = this._blocks.find(b => b.height === betBlock);
      if (!resultBlock) return; // 未开奖

      let isWin = false;
      const target = record.target;
      if (target === 'ODD' || target === 'EVEN') isWin = resultBlock.type === target;
      else if (target === 'BIG' || target === 'SMALL') isWin = resultBlock.sizeType === target;

      const payout = isWin ? record.amount * this.config.odds : 0;
      const netProfit = payout - record.amount;

      if (isWin) this.stats.wins++; else this.stats.losses++;
      this.stats.profit += netProfit;

      this.state = StrategyEngine.updateState(
        this.config.strategy, this.state, isWin, this.config.baseBet, this.config
      );

      record.status = isWin ? 'WIN' : 'LOSS';
      record.payout = payout;
      this.pendingBet = null;

      const resultLabel = isWin ? '胜' : '负';
      const targetLabel = TARGET_TEXT[target] || target;
      panel.addLog(`${resultLabel} ${targetLabel} #${betBlock} ${isWin ? '+' : ''}${netProfit.toFixed(1)}`);

      ApiClient.saveStats(this.stats);
      ApiClient.saveBet(record);
    }

    async _fetchBlocksHTTP() {
      try {
        const startBlock = this.config.blockRangeEnabled ? this.config.startBlock : 0;
        const result = await ApiClient.getBlocks(80, this.config.ruleValue, startBlock);
        if (result.success && result.data) {
          this._blocks = result.data;
          if (this._blocks.length > 0) {
            this.latestBackendBlock = this._blocks[0].height;
          }
        }
      } catch (e) { /* ignore */ }
    }

    updateConfig(newConfig) {
      Object.assign(this.config, newConfig);
      this.state.currentBetAmount = this.config.baseBet;
      this.state.odds = this.config.odds;
      this.state.kellyFraction = this.config.kellyFraction;
    }

    resetStats() {
      this.stats = { wins: 0, losses: 0, profit: 0, totalBet: 0 };
      this.state = { currentBetAmount: this.config.baseBet, consecutiveLosses: 0, sequenceIndex: 0, odds: this.config.odds };
      this.betHistory = [];
      this.pendingBet = null;
      this.lastBetBlock = null;
      ApiClient.saveStats(this.stats);
    }
  }

  // ==================== 控制面板 ====================
  class ControlPanel {
    constructor(engine) {
      this.engine = engine;
      this.logs = [];
      this.minimized = false;
      this.container = null;
    }

    create() {
      if (this.container) return;
      const el = document.createElement('div');
      el.id = 'haxi-autobet-panel';
      el.className = 'haxi-panel';
      el.innerHTML = this._buildHTML();
      document.body.appendChild(el);
      this.container = el;
      this._bindEvents();
      this._makeDraggable();
      this.update();
    }

    _buildHTML() {
      const gameType = detectGameType();
      const gameLabel = gameType === 'PARITY' ? '尾数单双' : gameType === 'SIZE' ? '尾数大小' : '未检测';

      const strategyOptions = Object.entries(STRATEGY_LABELS).map(([k, v]) =>
        `<option value="${k}">${v}</option>`).join('');
      const targetOptions = Object.entries(TARGET_LABELS).map(([k, v]) =>
        `<option value="${k}">${v}</option>`).join('');

      return `
        <div class="haxi-header" id="haxi-drag-handle">
          <div class="haxi-header-left">
            <span class="haxi-dot" id="haxi-status-dot"></span>
            <span class="haxi-title">HAXI 自动下注</span>
            <span class="haxi-game-badge">${gameLabel}</span>
          </div>
          <div class="haxi-header-right">
            <button class="haxi-btn-icon" id="haxi-btn-minimize" title="最小化">−</button>
            <button class="haxi-btn-icon haxi-btn-close" id="haxi-btn-close" title="关闭">×</button>
          </div>
        </div>

        <div class="haxi-body" id="haxi-body">
          <!-- 实时数据状态 -->
          <div class="haxi-block-status">
            <div class="haxi-block-row">
              <span class="haxi-block-label">当前下注区块</span>
              <span class="haxi-block-value" id="haxi-page-block">--</span>
            </div>
            <div class="haxi-block-row">
              <span class="haxi-block-label">后端最新区块</span>
              <span class="haxi-block-value" id="haxi-backend-block">--</span>
            </div>
            <div class="haxi-block-row">
              <span class="haxi-block-label">数据源</span>
              <span class="haxi-block-value" id="haxi-ws-status">HTTP轮询</span>
            </div>
            <div class="haxi-block-row">
              <span class="haxi-block-label">匹配状态</span>
              <span class="haxi-block-value" id="haxi-block-match">等待中</span>
            </div>
          </div>

          <!-- 统计 -->
          <div class="haxi-stats-grid">
            <div class="haxi-stat-card"><div class="haxi-stat-label">胜/负</div><div class="haxi-stat-value" id="haxi-wl">0/0</div></div>
            <div class="haxi-stat-card"><div class="haxi-stat-label">胜率</div><div class="haxi-stat-value" id="haxi-winrate">0%</div></div>
            <div class="haxi-stat-card"><div class="haxi-stat-label">盈亏</div><div class="haxi-stat-value" id="haxi-profit">0</div></div>
            <div class="haxi-stat-card"><div class="haxi-stat-label">总注</div><div class="haxi-stat-value" id="haxi-total-bet">0</div></div>
          </div>

          <!-- 配置区 -->
          <div class="haxi-config-section">
            <div class="haxi-config-row">
              <label>资金策略</label>
              <select id="haxi-strategy">${strategyOptions}</select>
            </div>
            <div class="haxi-config-row">
              <label>自动目标</label>
              <select id="haxi-target">${targetOptions}</select>
            </div>
            <div class="haxi-config-row">
              <label>基础注额</label>
              <input type="number" id="haxi-base-bet" value="10" min="1">
            </div>
            <div class="haxi-config-row">
              <label>赔率</label>
              <input type="number" id="haxi-odds" value="1.96" step="0.01" min="1.01">
            </div>

            <!-- 策略参数 -->
            <div class="haxi-config-row" id="haxi-row-multiplier" style="display:none">
              <label>倍率</label>
              <input type="number" id="haxi-multiplier" value="2" step="0.1" min="1.1">
            </div>
            <div class="haxi-config-row" id="haxi-row-maxcycle" style="display:none">
              <label>最大轮数</label>
              <input type="number" id="haxi-maxcycle" value="10" min="1">
            </div>
            <div class="haxi-config-row" id="haxi-row-step" style="display:none">
              <label>步长</label>
              <input type="number" id="haxi-step" value="10" min="1">
            </div>
            <div class="haxi-config-row" id="haxi-row-minstreak" style="display:none">
              <label>最小连续</label>
              <input type="number" id="haxi-minstreak" value="1" min="1">
            </div>
            <div class="haxi-config-row" id="haxi-row-kelly" style="display:none">
              <label>凯利系数</label>
              <input type="number" id="haxi-kelly" value="0.2" step="0.05" min="0.05" max="1">
            </div>
            <div class="haxi-config-row" id="haxi-row-trendwindow" style="display:none">
              <label>走势窗口N</label>
              <input type="number" id="haxi-trendwindow" value="5" min="1" max="20">
            </div>
            <div class="haxi-config-row" id="haxi-row-dragonend" style="display:none">
              <label>龙截止连数</label>
              <input type="number" id="haxi-dragonend" value="5" min="2">
            </div>
            <div class="haxi-config-row" id="haxi-row-custom" style="display:none">
              <label>自定义序列</label>
              <input type="text" id="haxi-customseq" value="1,2,4,8,17" placeholder="逗号分隔">
            </div>
            <div class="haxi-config-row" id="haxi-row-targettype" style="display:none">
              <label>下注类型</label>
              <select id="haxi-targettype">
                <option value="PARITY">单双</option>
                <option value="SIZE">大小</option>
              </select>
            </div>

            <!-- 止盈止损 -->
            <div class="haxi-config-row">
              <label>止盈(0=不限)</label>
              <input type="number" id="haxi-takeprofit" value="0" min="0">
            </div>
            <div class="haxi-config-row">
              <label>止损(0=不限)</label>
              <input type="number" id="haxi-stoploss" value="0" min="0">
            </div>

            <!-- 规则步长 -->
            <div class="haxi-config-row">
              <label>规则步长</label>
              <input type="number" id="haxi-rulevalue" value="1" min="1">
            </div>

            <!-- 区块范围开关 -->
            <div class="haxi-config-row">
              <label>区块范围</label>
              <div class="haxi-toggle-wrap">
                <label class="haxi-toggle">
                  <input type="checkbox" id="haxi-block-range-toggle">
                  <span class="haxi-toggle-slider"></span>
                </label>
                <span class="haxi-toggle-label" id="haxi-range-label">关闭(自动最新)</span>
              </div>
            </div>
            <div id="haxi-block-range-fields" style="display:none">
              <div class="haxi-config-row">
                <label>起始区块</label>
                <input type="number" id="haxi-startblock" value="0" min="0">
              </div>
              <div class="haxi-config-row">
                <label>结束区块</label>
                <input type="number" id="haxi-endblock" value="0" min="0">
              </div>
            </div>

            <!-- WS地址 -->
            <div class="haxi-config-row">
              <label>WS地址</label>
              <input type="text" id="haxi-wsurl" value="ws://localhost:8080" placeholder="ws://host:8080">
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="haxi-actions">
            <button class="haxi-btn haxi-btn-start" id="haxi-btn-start">开始自动下注</button>
            <button class="haxi-btn haxi-btn-stop" id="haxi-btn-stop" style="display:none">停止下注</button>
            <div class="haxi-actions-row">
              <button class="haxi-btn haxi-btn-save" id="haxi-btn-save">保存配置</button>
              <button class="haxi-btn haxi-btn-reset" id="haxi-btn-reset">重置统计</button>
            </div>
          </div>

          <!-- 日志 -->
          <div class="haxi-log-section">
            <div class="haxi-log-header">运行日志</div>
            <div class="haxi-log-list" id="haxi-log-list"></div>
          </div>

          <!-- 下注历史 -->
          <div class="haxi-history-section">
            <div class="haxi-log-header">最近下注</div>
            <div class="haxi-history-list" id="haxi-history-list"></div>
          </div>
        </div>
      `;
    }

    _bindEvents() {
      const $ = (id) => document.getElementById(id);

      $('haxi-btn-minimize').onclick = () => {
        this.minimized = !this.minimized;
        $('haxi-body').style.display = this.minimized ? 'none' : 'block';
        $('haxi-btn-minimize').textContent = this.minimized ? '+' : '−';
      };

      $('haxi-btn-close').onclick = () => {
        this.engine.stop();
        this.container.style.display = 'none';
      };

      $('haxi-btn-start').onclick = () => {
        this._readConfig();
        // 更新WS URL并重连
        if ($('haxi-wsurl').value) {
          WS_URL = $('haxi-wsurl').value;
          WSClient.disconnect();
          WSClient.connect();
        }
        this.engine.start();
        $('haxi-btn-start').style.display = 'none';
        $('haxi-btn-stop').style.display = 'block';
        this.addLog('自动下注已启动 (极速模式)');
        this.update();
      };

      $('haxi-btn-stop').onclick = () => {
        this.engine.stop();
        $('haxi-btn-start').style.display = 'block';
        $('haxi-btn-stop').style.display = 'none';
        this.addLog('自动下注已停止');
        this.update();
      };

      $('haxi-btn-save').onclick = async () => {
        this._readConfig();
        await ApiClient.saveConfig(this.engine.config);
        this.addLog('配置已保存');
      };

      $('haxi-btn-reset').onclick = () => {
        this.engine.resetStats();
        this.logs = [];
        this.addLog('统计已重置');
        this.update();
      };

      // 区块范围开关
      $('haxi-block-range-toggle').onchange = () => {
        const enabled = $('haxi-block-range-toggle').checked;
        $('haxi-block-range-fields').style.display = enabled ? 'block' : 'none';
        $('haxi-range-label').textContent = enabled ? '开启(指定范围)' : '关闭(自动最新)';
      };

      $('haxi-strategy').onchange = () => this._updateVisibility();
      $('haxi-target').onchange = () => this._updateVisibility();
      this._updateVisibility();
    }

    _readConfig() {
      const $ = (id) => document.getElementById(id);
      this.engine.updateConfig({
        strategy: $('haxi-strategy').value,
        autoTarget: $('haxi-target').value,
        baseBet: parseFloat($('haxi-base-bet').value) || 10,
        odds: parseFloat($('haxi-odds').value) || 1.96,
        multiplier: parseFloat($('haxi-multiplier').value) || 2,
        maxCycle: parseInt($('haxi-maxcycle').value) || 10,
        step: parseFloat($('haxi-step').value) || 10,
        minStreak: parseInt($('haxi-minstreak').value) || 1,
        kellyFraction: parseFloat($('haxi-kelly').value) || 0.2,
        trendWindow: parseInt($('haxi-trendwindow').value) || 5,
        dragonEndStreak: parseInt($('haxi-dragonend').value) || 5,
        targetType: $('haxi-targettype').value,
        customSequence: ($('haxi-customseq').value || '1').split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n)),
        takeProfit: parseFloat($('haxi-takeprofit').value) || 0,
        stopLoss: parseFloat($('haxi-stoploss').value) || 0,
        ruleValue: parseInt($('haxi-rulevalue').value) || 1,
        blockRangeEnabled: $('haxi-block-range-toggle').checked,
        startBlock: parseInt($('haxi-startblock').value) || 0,
        endBlock: parseInt($('haxi-endblock').value) || 0
      });
    }

    _updateVisibility() {
      const $ = (id) => document.getElementById(id);
      const strategy = $('haxi-strategy').value;
      const target = $('haxi-target').value;
      const show = (id, v) => { if ($(id)) $(id).style.display = v ? 'flex' : 'none'; };
      show('haxi-row-multiplier', strategy === 'MARTINGALE');
      show('haxi-row-maxcycle', strategy === 'MARTINGALE');
      show('haxi-row-step', strategy === 'DALEMBERT');
      show('haxi-row-kelly', strategy === 'AI_KELLY');
      show('haxi-row-custom', strategy === 'CUSTOM');
      const needsStreak = ['FOLLOW_LAST', 'REVERSE_LAST', 'DRAGON_FOLLOW', 'DRAGON_REVERSE'].includes(target);
      show('haxi-row-minstreak', needsStreak);
      show('haxi-row-dragonend', target === 'DRAGON_FOLLOW' || target === 'DRAGON_REVERSE');
      show('haxi-row-trendwindow', target === 'FOLLOW_RECENT_TREND' || target === 'FOLLOW_RECENT_TREND_REVERSE');
      const needsType = ['FOLLOW_LAST', 'REVERSE_LAST', 'FOLLOW_RECENT_TREND', 'FOLLOW_RECENT_TREND_REVERSE', 'DRAGON_FOLLOW', 'DRAGON_REVERSE'].includes(target);
      show('haxi-row-targettype', needsType);
    }

    _makeDraggable() {
      const handle = document.getElementById('haxi-drag-handle');
      const panelEl = this.container;
      let startX, startY, startLeft, startTop;
      handle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        startX = e.clientX; startY = e.clientY;
        const rect = panelEl.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        const onMove = (e2) => {
          panelEl.style.left = (startLeft + e2.clientX - startX) + 'px';
          panelEl.style.top = (startTop + e2.clientY - startY) + 'px';
          panelEl.style.right = 'auto';
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    addLog(msg) {
      const ts = new Date().toLocaleTimeString('zh-CN');
      this.logs.unshift({ ts, msg });
      if (this.logs.length > 50) this.logs = this.logs.slice(0, 50);
      this._renderLogs();
    }

    _renderLogs() {
      const el = document.getElementById('haxi-log-list');
      if (!el) return;
      el.innerHTML = this.logs.slice(0, 12).map(l =>
        `<div class="haxi-log-item"><span class="haxi-log-ts">${l.ts}</span>${l.msg}</div>`
      ).join('');
    }

    update() {
      const $ = (id) => document.getElementById(id);
      const s = this.engine.stats;
      const total = s.wins + s.losses;

      if ($('haxi-wl')) $('haxi-wl').textContent = `${s.wins}/${s.losses}`;
      if ($('haxi-winrate')) $('haxi-winrate').textContent = total > 0 ? Math.round((s.wins / total) * 100) + '%' : '0%';
      if ($('haxi-profit')) {
        $('haxi-profit').textContent = (s.profit >= 0 ? '+' : '') + s.profit.toFixed(1);
        $('haxi-profit').style.color = s.profit >= 0 ? '#22c55e' : '#ef4444';
      }
      if ($('haxi-total-bet')) $('haxi-total-bet').textContent = s.totalBet.toFixed(0);

      if ($('haxi-status-dot')) {
        $('haxi-status-dot').className = 'haxi-dot ' + (this.engine.running ? 'haxi-dot-active' : 'haxi-dot-idle');
      }

      // 区块状态
      const pageBlock = this.engine.currentPageBlock;
      const backendBlock = this.engine.latestBackendBlock;
      if ($('haxi-page-block')) $('haxi-page-block').textContent = pageBlock ? pageBlock.toString() : '--';
      if ($('haxi-backend-block')) $('haxi-backend-block').textContent = backendBlock ? backendBlock.toString() : '--';

      // WS状态
      if ($('haxi-ws-status')) {
        if (WSClient.connected) {
          $('haxi-ws-status').textContent = 'WebSocket实时';
          $('haxi-ws-status').style.color = '#22c55e';
        } else {
          $('haxi-ws-status').textContent = 'HTTP轮询(慢)';
          $('haxi-ws-status').style.color = '#f59e0b';
        }
      }

      // 匹配状态
      if ($('haxi-block-match')) {
        if (!pageBlock || !backendBlock) {
          $('haxi-block-match').textContent = '等待中';
          $('haxi-block-match').style.color = '#f59e0b';
        } else if (this.engine.blockMatched) {
          $('haxi-block-match').textContent = '已匹配';
          $('haxi-block-match').style.color = '#22c55e';
        } else {
          $('haxi-block-match').textContent = `差${Math.abs(pageBlock - backendBlock - this.engine.config.ruleValue)}块`;
          $('haxi-block-match').style.color = '#ef4444';
        }
      }

      // 下注历史
      const histEl = $('haxi-history-list');
      if (histEl) {
        histEl.innerHTML = this.engine.betHistory.slice(0, 8).map(b => {
          const label = TARGET_TEXT[b.target] || b.target;
          const status = b.status === 'WIN' ? '<span class="haxi-win">胜</span>' :
                         b.status === 'LOSS' ? '<span class="haxi-loss">负</span>' :
                         '<span class="haxi-pending">等待</span>';
          return `<div class="haxi-history-item">
            <span>${label} ¥${b.amount} #${b.blockHeight || ''}</span>
            ${status}
          </div>`;
        }).join('');
      }

      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'SAVE_PLUGIN_STATE', state: this.engine.stats });
        }
      } catch (e) { /* ignore */ }
    }
  }

  // ==================== 初始化 ====================
  console.log('[HAXI插件] Content Script v3.0 已加载');

  function loadApiUrl() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'GET_API_URL' }, (response) => {
            if (response && response.apiUrl) {
              API_URL = response.apiUrl;
              // 自动推导WS URL: http://host:3001 → ws://host:8080
              try {
                const u = new URL(API_URL);
                WS_URL = `ws://${u.hostname}:8080`;
              } catch (e) { /* keep default */ }
            }
            resolve();
          });
        } else { resolve(); }
      } catch (e) { resolve(); }
    });
  }

  const engine = new BetEngine();
  let panel = null;

  async function init() {
    await loadApiUrl();

    let retries = 0;
    const maxRetries = 20;

    const tryInit = () => {
      retries++;
      const gameType = detectGameType();
      const hasInput = !!SiteAdapter.findAmountInput();
      const hasBlock = !!SiteAdapter.getCurrentBlock();

      if ((gameType || hasInput || hasBlock) || retries >= maxRetries) {
        // 创建面板
        panel = new ControlPanel(engine);
        panel.create();

        if (gameType) {
          panel.addLog('v3.0已加载 - ' + (gameType === 'PARITY' ? '尾数单双' : '尾数大小'));
        } else {
          panel.addLog('v3.0已加载 - 等待游戏页面');
        }

        // 连接WebSocket
        WSClient.connect();

        // 加载后端配置
        ApiClient.loadConfig().then(res => {
          if (res.success && res.data) {
            Object.assign(engine.config, res.data);
            syncConfigToUI();
            panel.addLog('已加载后端配置');
          }
        });

        // 加载统计
        ApiClient.loadStats().then(res => {
          if (res.success && res.data) {
            Object.assign(engine.stats, res.data);
            panel.update();
          }
        });

        // 启动区块监测(即使不下注也显示实时状态)
        startBlockMonitor();
      } else {
        setTimeout(tryInit, 1500);
      }
    };

    setTimeout(tryInit, 2000);
  }

  function syncConfigToUI() {
    const $ = (id) => document.getElementById(id);
    const c = engine.config;
    if ($('haxi-strategy')) $('haxi-strategy').value = c.strategy;
    if ($('haxi-target')) $('haxi-target').value = c.autoTarget;
    if ($('haxi-base-bet')) $('haxi-base-bet').value = c.baseBet;
    if ($('haxi-odds')) $('haxi-odds').value = c.odds;
    if ($('haxi-multiplier')) $('haxi-multiplier').value = c.multiplier || 2;
    if ($('haxi-maxcycle')) $('haxi-maxcycle').value = c.maxCycle || 10;
    if ($('haxi-step')) $('haxi-step').value = c.step || 10;
    if ($('haxi-minstreak')) $('haxi-minstreak').value = c.minStreak || 1;
    if ($('haxi-kelly')) $('haxi-kelly').value = c.kellyFraction || 0.2;
    if ($('haxi-trendwindow')) $('haxi-trendwindow').value = c.trendWindow || 5;
    if ($('haxi-dragonend')) $('haxi-dragonend').value = c.dragonEndStreak || 5;
    if ($('haxi-customseq')) $('haxi-customseq').value = (c.customSequence || [1]).join(',');
    if ($('haxi-targettype')) $('haxi-targettype').value = c.targetType || 'PARITY';
    if ($('haxi-takeprofit')) $('haxi-takeprofit').value = c.takeProfit || 0;
    if ($('haxi-stoploss')) $('haxi-stoploss').value = c.stopLoss || 0;
    if ($('haxi-rulevalue')) $('haxi-rulevalue').value = c.ruleValue || 1;
    if ($('haxi-startblock')) $('haxi-startblock').value = c.startBlock || 0;
    if ($('haxi-endblock')) $('haxi-endblock').value = c.endBlock || 0;
    if ($('haxi-block-range-toggle')) {
      $('haxi-block-range-toggle').checked = !!c.blockRangeEnabled;
      $('haxi-block-range-fields').style.display = c.blockRangeEnabled ? 'block' : 'none';
      $('haxi-range-label').textContent = c.blockRangeEnabled ? '开启(指定范围)' : '关闭(自动最新)';
    }
    if ($('haxi-wsurl')) $('haxi-wsurl').value = WS_URL;
  }

  // 区块监测(未运行引擎时)
  function startBlockMonitor() {
    setInterval(() => {
      if (engine.running) return;
      engine.currentPageBlock = SiteAdapter.getCurrentBlock();
      if (WSClient.connected && WSClient.latestBlock) {
        engine.latestBackendBlock = WSClient.latestBlock.height;
        const expected = engine.latestBackendBlock + engine.config.ruleValue;
        engine.blockMatched = engine.currentPageBlock === expected;
      }
      if (panel) panel.update();
    }, 2000);
  }

  // 启动
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }

})();
