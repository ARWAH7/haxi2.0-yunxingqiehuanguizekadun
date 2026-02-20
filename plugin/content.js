/**
 * ========================================================
 *  哈希游戏自动下注插件 - Content Script
 *  适配目标: 尾数单双 / 尾数大小
 * ========================================================
 */
(function () {
  'use strict';

  // ==================== 配置常量 ====================
  const API_URL = 'http://localhost:3001';
  const POLL_INTERVAL = 3000;       // DOM轮询间隔(ms)
  const BET_COOLDOWN = 5000;        // 下注冷却(ms)
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

  // ==================== 游戏检测 ====================
  function detectGameType() {
    const url = decodeURIComponent(window.location.href);
    if (url.includes('尾数单双')) return 'PARITY';
    if (url.includes('尾数大小')) return 'SIZE';
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && tab.includes('单双')) return 'PARITY';
    if (tab && tab.includes('大小')) return 'SIZE';
    return null;
  }

  // ==================== DOM适配器 ====================
  const SiteAdapter = {
    _cache: {},
    _lastScan: 0,

    // 智能元素查找器（文字匹配 → class → 自定义选择器）
    findByText(textArr, tagFilter) {
      const tags = tagFilter || 'button, [role="button"], .ant-btn, a, div, span';
      const elements = document.querySelectorAll(tags);
      for (const el of elements) {
        const txt = (el.textContent || '').trim();
        for (const t of textArr) {
          if (txt === t || txt.includes(t)) return el;
        }
      }
      return null;
    },

    // 查找下注按钮
    findBetButton(target) {
      const textMap = { ODD: ['单', '单数'], EVEN: ['双', '双数'], BIG: ['大'], SMALL: ['小'] };
      const texts = textMap[target] || [];
      // 优先查找游戏区域内的按钮
      const gameArea = document.querySelector('.game-bet-area, .bet-area, .game-content, [class*="bet"], [class*="game"]');
      if (gameArea) {
        const buttons = gameArea.querySelectorAll('button, [role="button"], .ant-btn, [class*="btn"], [class*="option"]');
        for (const btn of buttons) {
          const txt = (btn.textContent || '').trim();
          for (const t of texts) {
            if (txt.includes(t) && btn.offsetParent !== null) return btn;
          }
        }
      }
      // 回退：全局文字搜索
      return this.findByText(texts, 'button, [role="button"], .ant-btn, [class*="btn"], [class*="option"]');
    },

    // 查找金额输入框
    findAmountInput() {
      // 常见选择器
      const selectors = [
        'input[type="number"][class*="bet"]', 'input[class*="amount"]',
        '.ant-input-number input', 'input[type="number"]', 'input[type="text"][class*="input"]',
        '.bet-input input', '[class*="stake"] input', '[class*="money"] input'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el;
      }
      return null;
    },

    // 查找金额芯片按钮 (1, 10, 100, ...)
    findChipButtons() {
      const chips = [];
      const candidates = document.querySelectorAll('[class*="chip"], [class*="amount"] button, [class*="quick"] button, [class*="bet-amount"] span');
      for (const el of candidates) {
        const txt = (el.textContent || '').trim().replace(/[,，]/g, '');
        const num = parseFloat(txt);
        if (!isNaN(num) && num > 0 && el.offsetParent !== null) {
          chips.push({ el, amount: num });
        }
      }
      return chips.sort((a, b) => a.amount - b.amount);
    },

    // 读取倒计时
    getCountdown() {
      const selectors = ['[class*="countdown"]', '[class*="timer"]', '[class*="time"]', '.ant-statistic-content'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const txt = (el.textContent || '').trim();
          const match = txt.match(/(\d+)/);
          if (match) return parseInt(match[1]);
        }
      }
      return -1;
    },

    // 读取页面余额
    getBalance() {
      const selectors = [
        '[class*="balance"]', '[class*="wallet"]', '[class*="money"]',
        '[class*="coin"]', '[class*="amount"][class*="user"]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const txt = (el.textContent || '').replace(/[^0-9.]/g, '');
          const num = parseFloat(txt);
          if (!isNaN(num) && num > 0) return num;
        }
      }
      return null;
    },

    // 读取最新结果
    getLatestResults(maxCount) {
      const results = [];
      const selectors = [
        '[class*="history"] [class*="item"]', '[class*="result"] [class*="item"]',
        '[class*="record"] li', '[class*="history"] span'
      ];
      for (const sel of selectors) {
        const items = document.querySelectorAll(sel);
        if (items.length > 0) {
          for (let i = 0; i < Math.min(items.length, maxCount || 20); i++) {
            const txt = (items[i].textContent || '').trim();
            results.push(txt);
          }
          break;
        }
      }
      return results;
    },

    // 设置下注金额
    setAmount(amount) {
      const input = this.findAmountInput();
      if (input) {
        // React需要使用原生setter触发更新
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, amount.toString());
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      // 尝试芯片按钮
      const chips = this.findChipButtons();
      if (chips.length > 0) {
        // 找到最接近的芯片
        let best = chips[0];
        for (const c of chips) {
          if (Math.abs(c.amount - amount) < Math.abs(best.amount - amount)) best = c;
        }
        best.el.click();
        return true;
      }
      return false;
    },

    // 执行下注
    placeBet(target) {
      const btn = this.findBetButton(target);
      if (btn) {
        btn.click();
        console.log(`[HAXI插件] 点击下注按钮: ${target}`);
        return true;
      }
      console.warn(`[HAXI插件] 未找到下注按钮: ${target}`);
      return false;
    },

    // 确认下注（如果有弹窗）
    confirmBet() {
      setTimeout(() => {
        const confirmBtn = this.findByText(
          ['确认', '确定', '确认下注', 'OK', 'Confirm'],
          'button, .ant-btn, [role="button"]'
        );
        if (confirmBtn) {
          confirmBtn.click();
          console.log('[HAXI插件] 已确认下注');
        }
      }, 500);
    }
  };

  // ==================== API客户端 ====================
  const ApiClient = {
    async get(path) {
      try {
        const res = await fetch(API_URL + path, { signal: AbortSignal.timeout(5000) });
        return await res.json();
      } catch (e) {
        console.warn('[HAXI插件] API GET 失败:', path, e.message);
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
        console.warn('[HAXI插件] API POST 失败:', path, e.message);
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
    // 计算下注金额
    calcAmount(strategy, state, baseBet, balance, confidence) {
      switch (strategy) {
        case 'FLAT':
          return baseBet;

        case 'MARTINGALE':
          return Math.floor(state.currentBetAmount);

        case 'DALEMBERT':
          return Math.floor(state.currentBetAmount);

        case 'FIBONACCI':
          return Math.floor(baseBet * FIB_SEQ[Math.min(state.sequenceIndex, FIB_SEQ.length - 1)]);

        case 'PAROLI':
          return Math.floor(state.currentBetAmount);

        case '1326':
          return Math.floor(baseBet * SEQ_1326[state.sequenceIndex % SEQ_1326.length]);

        case 'CUSTOM':
          return Math.floor(state.currentBetAmount);

        case 'AI_KELLY': {
          const odds = (state.odds || 1.96) - 1;
          const p = (confidence || 60) / 100;
          const q = 1 - p;
          const f = (odds * p - q) / odds;
          if (f > 0) {
            const fraction = state.kellyFraction || 0.2;
            let amount = Math.floor(balance * f * fraction);
            return Math.max(baseBet, Math.min(amount, balance));
          }
          return baseBet;
        }
        default:
          return baseBet;
      }
    },

    // 更新策略状态（下注结果后）
    updateState(strategy, state, isWin, baseBet, config) {
      let { currentBetAmount, consecutiveLosses, sequenceIndex } = state;

      switch (strategy) {
        case 'MARTINGALE':
          if (!isWin) {
            consecutiveLosses++;
            if (consecutiveLosses >= (config.maxCycle || 10)) {
              currentBetAmount = baseBet;
              consecutiveLosses = 0;
            } else {
              currentBetAmount *= (config.multiplier || 2);
            }
          } else {
            currentBetAmount = baseBet;
            consecutiveLosses = 0;
          }
          break;

        case 'DALEMBERT':
          if (!isWin) {
            currentBetAmount += (config.step || 10);
            consecutiveLosses++;
          } else {
            currentBetAmount -= (config.step || 10);
            if (currentBetAmount < baseBet) currentBetAmount = baseBet;
            consecutiveLosses = 0;
          }
          break;

        case 'FIBONACCI':
          if (!isWin) {
            sequenceIndex = Math.min(sequenceIndex + 1, FIB_SEQ.length - 1);
          } else {
            sequenceIndex = Math.max(0, sequenceIndex - 2);
          }
          currentBetAmount = baseBet * FIB_SEQ[sequenceIndex];
          break;

        case 'PAROLI':
          if (isWin) {
            sequenceIndex++;
            if (sequenceIndex >= 3) { sequenceIndex = 0; currentBetAmount = baseBet; }
            else { currentBetAmount *= 2; }
          } else {
            sequenceIndex = 0; currentBetAmount = baseBet;
          }
          break;

        case '1326':
          if (isWin) {
            sequenceIndex++;
            if (sequenceIndex >= SEQ_1326.length) { sequenceIndex = 0; currentBetAmount = baseBet; }
            else { currentBetAmount = baseBet * SEQ_1326[sequenceIndex]; }
          } else {
            sequenceIndex = 0; currentBetAmount = baseBet;
          }
          break;

        case 'CUSTOM': {
          const cSeq = config.customSequence || [1];
          if (!isWin) {
            sequenceIndex = (sequenceIndex + 1 >= cSeq.length) ? 0 : sequenceIndex + 1;
          } else {
            sequenceIndex = 0;
          }
          currentBetAmount = baseBet * cSeq[sequenceIndex];
          break;
        }

        case 'AI_KELLY':
          currentBetAmount = baseBet;
          consecutiveLosses = 0;
          sequenceIndex = 0;
          break;

        default:
          currentBetAmount = baseBet;
      }

      return { currentBetAmount: Math.floor(currentBetAmount), consecutiveLosses, sequenceIndex };
    }
  };

  // ==================== 目标选择器 ====================
  const TargetSelector = {
    // 根据配置确定下注方向
    async determine(autoTarget, gameType, config, blocks) {
      switch (autoTarget) {
        case 'FIXED_ODD':  return { bet: true, target: 'ODD', type: 'PARITY', conf: 60 };
        case 'FIXED_EVEN': return { bet: true, target: 'EVEN', type: 'PARITY', conf: 60 };
        case 'FIXED_BIG':  return { bet: true, target: 'BIG', type: 'SIZE', conf: 60 };
        case 'FIXED_SMALL':return { bet: true, target: 'SMALL', type: 'SIZE', conf: 60 };

        case 'RANDOM_PARITY':
          return { bet: true, target: Math.random() < 0.5 ? 'ODD' : 'EVEN', type: 'PARITY', conf: 50 };
        case 'RANDOM_SIZE':
          return { bet: true, target: Math.random() < 0.5 ? 'BIG' : 'SMALL', type: 'SIZE', conf: 50 };

        case 'FOLLOW_LAST':
        case 'REVERSE_LAST':
          return this._streakTarget(autoTarget, config, blocks);

        case 'FOLLOW_RECENT_TREND':
        case 'FOLLOW_RECENT_TREND_REVERSE':
          return this._lagTarget(autoTarget, config, blocks);

        case 'DRAGON_FOLLOW':
        case 'DRAGON_REVERSE':
          return this._dragonTarget(autoTarget, config, blocks);

        case 'AI_PREDICTION':
        case 'GLOBAL_AI_FULL_SCAN':
          return this._aiTarget(autoTarget, config);

        default:
          return { bet: false, reason: '未知目标模式' };
      }
    },

    _calcStreak(blocks, key) {
      if (!blocks || blocks.length === 0) return { val: null, count: 0 };
      const first = blocks[0][key];
      let count = 0;
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
          if (targetType === 'PARITY') target = streak.val === 'ODD' ? 'EVEN' : 'ODD';
          else target = streak.val === 'BIG' ? 'SMALL' : 'BIG';
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
      if (targetType === 'PARITY') {
        target = isReverse ? (source.type === 'ODD' ? 'EVEN' : 'ODD') : source.type;
      } else {
        target = isReverse ? (source.sizeType === 'BIG' ? 'SMALL' : 'BIG') : source.sizeType;
      }
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
          if (targetType === 'PARITY') target = streak.val === 'ODD' ? 'EVEN' : 'ODD';
          else target = streak.val === 'BIG' ? 'SMALL' : 'BIG';
        }
        return { bet: true, target, type: targetType, conf: 65 };
      }
      return { bet: false, reason: `龙长度${streak.count}不在[${startStreak},${endStreak}]范围` };
    },

    async _aiTarget(mode, config) {
      const result = await ApiClient.getSignal(config.ruleValue || 1, config.startBlock || 0);
      if (!result.success || !result.data || !result.data.shouldBet) {
        return { bet: false, reason: 'AI无信号' };
      }
      const d = result.data;
      if (d.parityConf > d.sizeConf && d.parity) {
        return { bet: true, target: d.parity, type: 'PARITY', conf: d.parityConf };
      }
      if (d.sizeConf > d.parityConf && d.size) {
        return { bet: true, target: d.size, type: 'SIZE', conf: d.sizeConf };
      }
      return { bet: false, reason: 'AI置信度不足' };
    }
  };

  // ==================== 下注引擎 ====================
  class BetEngine {
    constructor() {
      this.running = false;
      this.config = {
        strategy: 'FLAT', autoTarget: 'FIXED_ODD', baseBet: 10, odds: 1.96,
        targetType: 'PARITY', multiplier: 2, maxCycle: 10, step: 10,
        minStreak: 1, customSequence: [1, 2, 4, 8, 17], kellyFraction: 0.2,
        trendWindow: 5, dragonEndStreak: 5, ruleValue: 1, startBlock: 0,
        stopLoss: 0, takeProfit: 0
      };
      this.state = { currentBetAmount: 10, consecutiveLosses: 0, sequenceIndex: 0, odds: 1.96 };
      this.stats = { wins: 0, losses: 0, profit: 0, totalBet: 0, initialBalance: 0 };
      this.betHistory = [];
      this.lastBetTime = 0;
      this.lastBetTarget = null;
      this.pendingBet = null;
      this._interval = null;
      this._blocks = [];
    }

    async start() {
      if (this.running) return;
      this.running = true;
      console.log('[HAXI插件] 引擎启动');
      this._runLoop();
    }

    stop() {
      this.running = false;
      if (this._interval) { clearInterval(this._interval); this._interval = null; }
      console.log('[HAXI插件] 引擎停止');
    }

    async _runLoop() {
      // 先获取一次区块数据
      await this._fetchBlocks();

      this._interval = setInterval(async () => {
        if (!this.running) return;

        try {
          // 刷新区块数据
          await this._fetchBlocks();

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

          // 冷却检查
          if (Date.now() - this.lastBetTime < BET_COOLDOWN) return;

          // 检查倒计时（只在可下注时操作）
          const countdown = SiteAdapter.getCountdown();
          if (countdown >= 0 && countdown < 3) return; // 太短不下

          // 确定下注目标
          const decision = await TargetSelector.determine(
            this.config.autoTarget, detectGameType(), this.config, this._blocks
          );

          if (!decision.bet) {
            // 不下注
            return;
          }

          // 检查游戏类型匹配
          const gameType = detectGameType();
          if (gameType === 'PARITY' && (decision.target === 'BIG' || decision.target === 'SMALL')) return;
          if (gameType === 'SIZE' && (decision.target === 'ODD' || decision.target === 'EVEN')) return;

          // 计算金额
          const balance = SiteAdapter.getBalance() || 10000;
          const amount = StrategyEngine.calcAmount(
            this.config.strategy, { ...this.state, odds: this.config.odds, kellyFraction: this.config.kellyFraction },
            this.config.baseBet, balance, decision.conf
          );

          if (amount <= 0 || amount > balance) {
            panel.addLog(`余额不足: 需${amount}, 余${balance}`);
            return;
          }

          // 设置金额
          SiteAdapter.setAmount(amount);
          await this._delay(300);

          // 下注
          const placed = SiteAdapter.placeBet(decision.target);
          if (placed) {
            SiteAdapter.confirmBet();
            this.lastBetTime = Date.now();
            this.lastBetTarget = decision.target;
            this.stats.totalBet += amount;

            const targetLabel = { ODD: '单', EVEN: '双', BIG: '大', SMALL: '小' }[decision.target] || decision.target;
            const record = {
              id: Date.now().toString(),
              timestamp: Date.now(),
              target: decision.target,
              amount,
              strategy: this.config.strategy,
              autoTarget: this.config.autoTarget,
              confidence: decision.conf,
              status: 'PENDING'
            };
            this.betHistory.unshift(record);
            if (this.betHistory.length > 100) this.betHistory = this.betHistory.slice(0, 100);
            this.pendingBet = record;

            panel.addLog(`下注 ${targetLabel} ¥${amount} (${STRATEGY_LABELS[this.config.strategy]})`);
            ApiClient.saveBet(record);
            panel.update();

            // 等待结果（模拟：一段时间后检测）
            this._waitForResult(record, amount);
          }

        } catch (err) {
          console.error('[HAXI插件] 引擎错误:', err);
        }
      }, POLL_INTERVAL);
    }

    async _waitForResult(record, amount) {
      // 在实际游戏中，需要监测开奖结果
      // 这里通过后续轮次的区块数据来判断
      const checkResult = async () => {
        if (!this.running || !this.pendingBet) return;

        await this._fetchBlocks();
        if (this._blocks.length < 2) return;

        // 获取最新区块判断结果
        const latest = this._blocks[0];
        if (!latest) return;

        let isWin = false;
        const target = record.target;

        if (target === 'ODD' || target === 'EVEN') {
          isWin = latest.type === target;
        } else if (target === 'BIG' || target === 'SMALL') {
          isWin = latest.sizeType === target;
        }

        // 计算赔付
        const payout = isWin ? amount * this.config.odds : 0;
        const netProfit = payout - amount;

        // 更新统计
        if (isWin) this.stats.wins++; else this.stats.losses++;
        this.stats.profit += netProfit;

        // 更新策略状态
        this.state = StrategyEngine.updateState(
          this.config.strategy, this.state, isWin, this.config.baseBet, this.config
        );

        // 更新记录
        record.status = isWin ? 'WIN' : 'LOSS';
        record.payout = payout;
        this.pendingBet = null;

        const resultLabel = isWin ? '胜' : '负';
        const targetLabel = { ODD: '单', EVEN: '双', BIG: '大', SMALL: '小' }[target];
        panel.addLog(`${resultLabel} ${targetLabel} ${isWin ? '+' : ''}${netProfit.toFixed(1)}`);

        // 保存统计到后端
        ApiClient.saveStats(this.stats);
        ApiClient.saveBet(record);
        panel.update();
      };

      // 等待一个周期后检查结果
      setTimeout(checkResult, POLL_INTERVAL + 2000);
    }

    async _fetchBlocks() {
      try {
        const result = await ApiClient.getBlocks(80, this.config.ruleValue, this.config.startBlock);
        if (result.success && result.data) {
          this._blocks = result.data;
        }
      } catch (e) { /* ignore */ }
    }

    _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    updateConfig(newConfig) {
      Object.assign(this.config, newConfig);
      this.state.currentBetAmount = this.config.baseBet;
      this.state.odds = this.config.odds;
      this.state.kellyFraction = this.config.kellyFraction;
    }

    resetStats() {
      this.stats = { wins: 0, losses: 0, profit: 0, totalBet: 0, initialBalance: 0 };
      this.state = { currentBetAmount: this.config.baseBet, consecutiveLosses: 0, sequenceIndex: 0, odds: this.config.odds };
      this.betHistory = [];
      this.pendingBet = null;
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
      this._dragState = null;
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
        `<option value="${k}">${v}</option>`
      ).join('');

      const targetOptions = Object.entries(TARGET_LABELS).map(([k, v]) =>
        `<option value="${k}">${v}</option>`
      ).join('');

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
          <!-- 状态面板 -->
          <div class="haxi-stats-grid">
            <div class="haxi-stat-card">
              <div class="haxi-stat-label">胜/负</div>
              <div class="haxi-stat-value" id="haxi-wl">0/0</div>
            </div>
            <div class="haxi-stat-card">
              <div class="haxi-stat-label">胜率</div>
              <div class="haxi-stat-value" id="haxi-winrate">0%</div>
            </div>
            <div class="haxi-stat-card">
              <div class="haxi-stat-label">盈亏</div>
              <div class="haxi-stat-value" id="haxi-profit">0</div>
            </div>
            <div class="haxi-stat-card">
              <div class="haxi-stat-label">总注</div>
              <div class="haxi-stat-value" id="haxi-total-bet">0</div>
            </div>
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
              <label>止盈金额(0=不限)</label>
              <input type="number" id="haxi-takeprofit" value="0" min="0">
            </div>
            <div class="haxi-config-row">
              <label>止损金额(0=不限)</label>
              <input type="number" id="haxi-stoploss" value="0" min="0">
            </div>

            <!-- 采样规则 -->
            <div class="haxi-config-row">
              <label>规则步长</label>
              <input type="number" id="haxi-rulevalue" value="1" min="1">
            </div>
            <div class="haxi-config-row">
              <label>起始区块</label>
              <input type="number" id="haxi-startblock" value="0" min="0">
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

      // 最小化
      $('haxi-btn-minimize').onclick = () => {
        this.minimized = !this.minimized;
        $('haxi-body').style.display = this.minimized ? 'none' : 'block';
        $('haxi-btn-minimize').textContent = this.minimized ? '+' : '−';
      };

      // 关闭
      $('haxi-btn-close').onclick = () => {
        this.engine.stop();
        this.container.style.display = 'none';
      };

      // 启动
      $('haxi-btn-start').onclick = () => {
        this._readConfig();
        this.engine.start();
        $('haxi-btn-start').style.display = 'none';
        $('haxi-btn-stop').style.display = 'block';
        this.addLog('自动下注已启动');
        this.update();
      };

      // 停止
      $('haxi-btn-stop').onclick = () => {
        this.engine.stop();
        $('haxi-btn-start').style.display = 'block';
        $('haxi-btn-stop').style.display = 'none';
        this.addLog('自动下注已停止');
        this.update();
      };

      // 保存配置
      $('haxi-btn-save').onclick = async () => {
        this._readConfig();
        await ApiClient.saveConfig(this.engine.config);
        this.addLog('配置已保存到后端');
      };

      // 重置统计
      $('haxi-btn-reset').onclick = () => {
        this.engine.resetStats();
        this.logs = [];
        this.addLog('统计已重置');
        this.update();
      };

      // 策略选择联动
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
        startBlock: parseInt($('haxi-startblock').value) || 0
      });
    }

    _updateVisibility() {
      const $ = (id) => document.getElementById(id);
      const strategy = $('haxi-strategy').value;
      const target = $('haxi-target').value;

      // 策略参数显示
      const show = (id, visible) => { if ($(id)) $(id).style.display = visible ? 'flex' : 'none'; };
      show('haxi-row-multiplier', strategy === 'MARTINGALE');
      show('haxi-row-maxcycle', strategy === 'MARTINGALE');
      show('haxi-row-step', strategy === 'DALEMBERT');
      show('haxi-row-kelly', strategy === 'AI_KELLY');
      show('haxi-row-custom', strategy === 'CUSTOM');

      // 目标参数显示
      const needsStreak = ['FOLLOW_LAST', 'REVERSE_LAST', 'DRAGON_FOLLOW', 'DRAGON_REVERSE'].includes(target);
      show('haxi-row-minstreak', needsStreak);
      show('haxi-row-dragonend', target === 'DRAGON_FOLLOW' || target === 'DRAGON_REVERSE');
      show('haxi-row-trendwindow', target === 'FOLLOW_RECENT_TREND' || target === 'FOLLOW_RECENT_TREND_REVERSE');

      const needsType = ['FOLLOW_LAST', 'REVERSE_LAST', 'FOLLOW_RECENT_TREND', 'FOLLOW_RECENT_TREND_REVERSE', 'DRAGON_FOLLOW', 'DRAGON_REVERSE'].includes(target);
      show('haxi-row-targettype', needsType);
    }

    _makeDraggable() {
      const handle = document.getElementById('haxi-drag-handle');
      const panel = this.container;
      let startX, startY, startLeft, startTop;

      handle.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        const onMove = (e2) => {
          panel.style.left = (startLeft + e2.clientX - startX) + 'px';
          panel.style.top = (startTop + e2.clientY - startY) + 'px';
          panel.style.right = 'auto';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
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
      el.innerHTML = this.logs.slice(0, 10).map(l =>
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

      // 状态指示器
      if ($('haxi-status-dot')) {
        $('haxi-status-dot').className = 'haxi-dot ' + (this.engine.running ? 'haxi-dot-active' : 'haxi-dot-idle');
      }

      // 下注历史
      const histEl = $('haxi-history-list');
      if (histEl) {
        histEl.innerHTML = this.engine.betHistory.slice(0, 8).map(b => {
          const label = { ODD: '单', EVEN: '双', BIG: '大', SMALL: '小' }[b.target] || b.target;
          const status = b.status === 'WIN' ? '<span class="haxi-win">胜</span>' :
                         b.status === 'LOSS' ? '<span class="haxi-loss">负</span>' :
                         '<span class="haxi-pending">等待</span>';
          return `<div class="haxi-history-item">
            <span>${label} ¥${b.amount}</span>
            ${status}
          </div>`;
        }).join('');
      }

      // 同步状态到 Chrome storage
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'SAVE_PLUGIN_STATE', state: this.engine.stats });
        }
      } catch (e) { /* ignore */ }
    }
  }

  // ==================== 初始化 ====================
  const gameType = detectGameType();
  if (!gameType) {
    console.log('[HAXI插件] 非游戏页面，跳过初始化');
    return;
  }

  console.log(`[HAXI插件] 检测到游戏类型: ${gameType === 'PARITY' ? '尾数单双' : '尾数大小'}`);

  const engine = new BetEngine();
  const panel = new ControlPanel(engine);

  // 等待页面完全加载
  const waitForReady = () => {
    const check = setInterval(() => {
      // 检查页面是否有游戏内容
      const hasContent = document.querySelector('[class*="game"], [class*="bet"], [class*="hash"], main, #app, #root');
      if (hasContent) {
        clearInterval(check);
        console.log('[HAXI插件] 页面已就绪，创建控制面板');
        panel.create();
        panel.addLog('插件已加载，检测到' + (gameType === 'PARITY' ? '尾数单双' : '尾数大小'));

        // 加载后端保存的配置
        ApiClient.loadConfig().then(res => {
          if (res.success && res.data) {
            Object.assign(engine.config, res.data);
            // 同步UI
            const $ = (id) => document.getElementById(id);
            if ($('haxi-strategy')) $('haxi-strategy').value = engine.config.strategy;
            if ($('haxi-target')) $('haxi-target').value = engine.config.autoTarget;
            if ($('haxi-base-bet')) $('haxi-base-bet').value = engine.config.baseBet;
            if ($('haxi-odds')) $('haxi-odds').value = engine.config.odds;
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
      }
    }, 1000);

    // 30秒超时
    setTimeout(() => {
      clearInterval(check);
      if (!panel.container) {
        panel.create();
        panel.addLog('页面加载超时，面板已强制创建');
      }
    }, 30000);
  };

  if (document.readyState === 'complete') {
    waitForReady();
  } else {
    window.addEventListener('load', waitForReady);
  }

})();
