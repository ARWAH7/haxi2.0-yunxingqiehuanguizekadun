/**
 * ========================================================
 *  哈希游戏自动下注插件 - Content Script v2.0
 *  适配目标: 尾数单双 / 尾数大小
 *  基于实际页面DOM结构重写
 * ========================================================
 */
(function () {
  'use strict';

  // ==================== 配置常量 ====================
  let API_URL = 'http://localhost:3001';
  const POLL_INTERVAL = 3000;
  const BET_COOLDOWN = 5000;
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
    // 方法1: URL检测
    const url = decodeURIComponent(window.location.href);
    if (url.includes('尾数单双')) return 'PARITY';
    if (url.includes('尾数大小')) return 'SIZE';
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab) {
      if (tab.includes('单双')) return 'PARITY';
      if (tab.includes('大小')) return 'SIZE';
    }
    // 方法2: DOM检测 - 查找游戏类型文字
    const divs = document.querySelectorAll('div.sc-bdVaJa');
    for (const div of divs) {
      const text = div.textContent.trim();
      if (text === '尾数单双') return 'PARITY';
      if (text === '尾数大小') return 'SIZE';
    }
    return null;
  }

  // ==================== DOM适配器 (基于实际页面结构) ====================
  const SiteAdapter = {

    /**
     * 获取当前下注区块号
     * 页面元素: <div color="#fff" font-size="24px" width="50%" font-weight="600" class="...Wavxa">80305272</div>
     */
    getCurrentBlock() {
      // 方法1: 通过属性精确匹配
      const candidates = document.querySelectorAll('div[color="#fff"][font-size="24px"][font-weight="600"]');
      for (const el of candidates) {
        const num = parseInt(el.textContent.trim());
        if (!isNaN(num) && num > 1000000) return num;
      }
      // 方法2: 通过class Wavxa
      const wavxa = document.querySelector('.Wavxa');
      if (wavxa) {
        const num = parseInt(wavxa.textContent.trim());
        if (!isNaN(num) && num > 1000000) return num;
      }
      // 方法3: 全局搜索大数字(区块号通常>1000000)
      const allDivs = document.querySelectorAll('div.sc-bdVaJa');
      for (const div of allDivs) {
        const text = div.textContent.trim();
        if (/^\d{7,9}$/.test(text)) {
          const num = parseInt(text);
          if (num > 1000000) return num;
        }
      }
      return null;
    },

    /**
     * 查找下注按钮 (单/双/大/小)
     * 按钮结构: <div width="40px" height="40px" color="..." font-size="40px" font-weight="600">单</div>
     * 容器结构: <div width="50%" height="110px">...按钮...</div>
     */
    findBetButton(target) {
      const targetText = TARGET_TEXT[target];
      if (!targetText) return null;

      // 方法1: 通过属性精确匹配40x40的文字div
      const btns = document.querySelectorAll('div[width="40px"][height="40px"][font-size="40px"][font-weight="600"]');
      for (const btn of btns) {
        if (btn.textContent.trim() === targetText) {
          // 返回可点击的父容器 (div[width="50%"][height="110px"])
          const parent = btn.parentElement;
          if (parent && parent.getAttribute('height') === '110px') return parent;
          return btn;
        }
      }

      // 方法2: 通过styled-component class搜索
      const colorAttr = (target === 'ODD' || target === 'BIG') ? '#24b3a2' : '#ff3636';
      const colorBtns = document.querySelectorAll(`div[color="${colorAttr}"][font-size="40px"]`);
      for (const btn of colorBtns) {
        if (btn.textContent.trim() === targetText) {
          const parent = btn.parentElement;
          if (parent && parent.getAttribute('height') === '110px') return parent;
          return btn;
        }
      }

      // 方法3: 纯文字匹配回退
      const allDivs = document.querySelectorAll('div.sc-bdVaJa.sc-htpNat');
      for (const div of allDivs) {
        if (div.textContent.trim() === targetText && div.children.length === 0) {
          const parent = div.parentElement;
          if (parent && parent.getAttribute('height') === '110px') return parent;
          return div;
        }
      }
      return null;
    },

    /**
     * 查找金额输入框
     * <input placeholder="输入金额" class="sc-fKGOjr jjoeWM" value="" max="10000000">
     */
    findAmountInput() {
      return document.querySelector('input[placeholder="输入金额"]');
    },

    /**
     * 查找确定按钮
     * <span color="white" font-size="14px" class="sc-gzVnrw NYRcS">确定</span>
     */
    findConfirmButton() {
      // 方法1: 精确属性匹配
      const spans = document.querySelectorAll('span[color="white"][font-size="14px"]');
      for (const s of spans) {
        if (s.textContent.trim() === '确定') {
          // 点击父元素（可能是按钮容器）
          return s.parentElement || s;
        }
      }
      // 方法2: class匹配
      const byClass = document.querySelector('span.NYRcS');
      if (byClass && byClass.textContent.trim() === '确定') return byClass.parentElement || byClass;
      // 方法3: 全局文字搜索
      const allSpans = document.querySelectorAll('span.sc-gzVnrw');
      for (const s of allSpans) {
        if (s.textContent.trim() === '确定') return s.parentElement || s;
      }
      return null;
    },

    /**
     * 查找重置按钮
     * <div width="80px" color="#6476a0" font-size="12px" height="100%" class="...cYwdS" style="cursor: pointer;">重置</div>
     */
    findResetButton() {
      // 方法1: 精确属性匹配
      const divs = document.querySelectorAll('div[width="80px"][color="#6476a0"]');
      for (const div of divs) {
        if (div.textContent.trim() === '重置') return div;
      }
      // 方法2: class匹配
      const byClass = document.querySelector('.cYwdS');
      if (byClass && byClass.textContent.trim() === '重置') return byClass;
      // 方法3: 全局搜索cursor:pointer + "重置"文字
      const allDivs = document.querySelectorAll('div[style*="cursor"]');
      for (const div of allDivs) {
        if (div.textContent.trim() === '重置') return div;
      }
      return null;
    },

    /**
     * 设置下注金额: 重置 → 输入金额 → 确定
     */
    async setAmount(amount) {
      // 步骤1: 点击重置清空旧金额
      const resetBtn = this.findResetButton();
      if (resetBtn) {
        resetBtn.click();
        await delay(400);
      }

      // 步骤2: 在输入框中填入金额
      const input = this.findAmountInput();
      if (!input) {
        console.warn('[HAXI插件] 未找到金额输入框');
        return false;
      }

      // React应用需要通过原生setter触发状态更新
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeSetter.call(input, String(amount));

      // 触发React事件
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // React 16+ value tracker 兼容
      const tracker = input._valueTracker;
      if (tracker) {
        tracker.setValue('');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      input.focus();
      await delay(300);

      // 步骤3: 点击确定保存金额
      const confirmBtn = this.findConfirmButton();
      if (confirmBtn) {
        confirmBtn.click();
        await delay(400);
        console.log(`[HAXI插件] 金额已设置: ${amount}`);
        return true;
      }

      console.warn('[HAXI插件] 未找到确定按钮');
      return false;
    },

    /**
     * 执行下注 - 点击目标按钮(单/双/大/小)
     */
    placeBet(target) {
      const btn = this.findBetButton(target);
      if (btn) {
        btn.click();
        console.log(`[HAXI插件] 点击下注按钮: ${TARGET_TEXT[target] || target}`);
        return true;
      }
      console.warn(`[HAXI插件] 未找到下注按钮: ${target}`);
      return false;
    },

    /**
     * 检测页面游戏元素是否就绪
     */
    isGameReady() {
      return !!(this.findAmountInput() || this.getCurrentBlock());
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

  // ==================== 下注引擎 (含区块匹配) ====================
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
      this.stats = { wins: 0, losses: 0, profit: 0, totalBet: 0 };
      this.betHistory = [];
      this.lastBetTime = 0;
      this.lastBetBlock = null;
      this.pendingBet = null;
      this._interval = null;
      this._blocks = [];
      this.currentPageBlock = null;
      this.latestBackendBlock = null;
      this.blockMatched = false;
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
      await this._fetchBlocks();

      this._interval = setInterval(async () => {
        if (!this.running) return;

        try {
          // 刷新区块数据
          await this._fetchBlocks();

          // 读取页面当前下注区块
          this.currentPageBlock = SiteAdapter.getCurrentBlock();
          this.latestBackendBlock = this._blocks.length > 0 ? this._blocks[0].height : null;

          // 区块匹配检查
          if (!this.currentPageBlock) {
            this.blockMatched = false;
            panel.update();
            return;
          }

          if (this.latestBackendBlock) {
            const expectedNext = this.latestBackendBlock + this.config.ruleValue;
            this.blockMatched = (this.currentPageBlock === expectedNext);

            if (!this.blockMatched) {
              const diff = Math.abs(this.currentPageBlock - expectedNext);
              if (diff > this.config.ruleValue * 2) {
                panel.addLog(`区块不匹配: 页面${this.currentPageBlock} 预期${expectedNext}`);
                panel.update();
                return;
              }
              // 允许小误差继续
              this.blockMatched = true;
            }
          } else {
            this.blockMatched = false;
            panel.addLog('等待后端区块数据...');
            panel.update();
            return;
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

          // 冷却检查
          if (Date.now() - this.lastBetTime < BET_COOLDOWN) {
            panel.update();
            return;
          }

          // 不重复同一区块下注
          if (this.lastBetBlock === this.currentPageBlock) {
            panel.update();
            return;
          }

          // 等待上一注结果
          if (this.pendingBet) {
            await this._checkPendingResult();
            panel.update();
            return;
          }

          // 确定下注目标
          const gameType = detectGameType();
          const decision = await TargetSelector.determine(
            this.config.autoTarget, gameType, this.config, this._blocks
          );

          if (!decision.bet) {
            panel.update();
            return;
          }

          // 检查游戏类型与下注方向匹配
          if (gameType === 'PARITY' && (decision.target === 'BIG' || decision.target === 'SMALL')) {
            panel.update();
            return;
          }
          if (gameType === 'SIZE' && (decision.target === 'ODD' || decision.target === 'EVEN')) {
            panel.update();
            return;
          }

          // 计算金额
          const balance = 10000; // 使用虚拟余额或配置余额
          const amount = StrategyEngine.calcAmount(
            this.config.strategy,
            { ...this.state, odds: this.config.odds, kellyFraction: this.config.kellyFraction },
            this.config.baseBet, balance, decision.conf
          );

          if (amount <= 0) {
            panel.addLog('计算金额为0，跳过');
            return;
          }

          // ===== 执行下注流程 =====
          // 步骤1: 设置金额 (重置→输入→确定)
          panel.addLog(`设置金额: ${amount}...`);
          const amountSet = await SiteAdapter.setAmount(amount);
          if (!amountSet) {
            panel.addLog('金额设置失败，跳过本轮');
            panel.update();
            return;
          }

          await delay(500);

          // 步骤2: 点击下注按钮
          const targetLabel = TARGET_TEXT[decision.target] || decision.target;
          const placed = SiteAdapter.placeBet(decision.target);
          if (placed) {
            this.lastBetTime = Date.now();
            this.lastBetBlock = this.currentPageBlock;
            this.stats.totalBet += amount;

            const record = {
              id: Date.now().toString(),
              timestamp: Date.now(),
              target: decision.target,
              amount,
              blockHeight: this.currentPageBlock,
              strategy: this.config.strategy,
              autoTarget: this.config.autoTarget,
              confidence: decision.conf,
              status: 'PENDING'
            };
            this.betHistory.unshift(record);
            if (this.betHistory.length > 100) this.betHistory = this.betHistory.slice(0, 100);
            this.pendingBet = record;

            panel.addLog(`下注 ${targetLabel} ¥${amount} 区块${this.currentPageBlock} (${STRATEGY_LABELS[this.config.strategy]})`);
            ApiClient.saveBet(record);
            panel.update();
          } else {
            panel.addLog(`未找到 ${targetLabel} 按钮，跳过`);
          }

          panel.update();
        } catch (err) {
          console.error('[HAXI插件] 引擎错误:', err);
          panel.addLog('引擎异常: ' + err.message);
        }
      }, POLL_INTERVAL);
    }

    async _checkPendingResult() {
      if (!this.pendingBet) return;

      const record = this.pendingBet;
      const betBlock = record.blockHeight;

      // 查找该区块是否已出结果
      const resultBlock = this._blocks.find(b => b.height === betBlock);
      if (!resultBlock) return; // 还未开奖

      let isWin = false;
      const target = record.target;

      if (target === 'ODD' || target === 'EVEN') {
        isWin = resultBlock.type === target;
      } else if (target === 'BIG' || target === 'SMALL') {
        isWin = resultBlock.sizeType === target;
      }

      // 计算赔付
      const payout = isWin ? record.amount * this.config.odds : 0;
      const netProfit = payout - record.amount;

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
      const targetLabel = TARGET_TEXT[target] || target;
      panel.addLog(`${resultLabel} ${targetLabel} 区块${betBlock} ${isWin ? '+' : ''}${netProfit.toFixed(1)}`);

      ApiClient.saveStats(this.stats);
      ApiClient.saveBet(record);
    }

    async _fetchBlocks() {
      try {
        const result = await ApiClient.getBlocks(80, this.config.ruleValue, this.config.startBlock);
        if (result.success && result.data) {
          this._blocks = result.data;
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
          <!-- 区块匹配状态 -->
          <div class="haxi-block-status" id="haxi-block-status">
            <div class="haxi-block-row">
              <span class="haxi-block-label">页面区块</span>
              <span class="haxi-block-value" id="haxi-page-block">--</span>
            </div>
            <div class="haxi-block-row">
              <span class="haxi-block-label">后端区块</span>
              <span class="haxi-block-value" id="haxi-backend-block">--</span>
            </div>
            <div class="haxi-block-row">
              <span class="haxi-block-label">匹配状态</span>
              <span class="haxi-block-value" id="haxi-block-match">等待中</span>
            </div>
          </div>

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
        this.engine.start();
        $('haxi-btn-start').style.display = 'none';
        $('haxi-btn-stop').style.display = 'block';
        this.addLog('自动下注已启动');
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
        this.addLog('配置已保存到后端');
      };

      $('haxi-btn-reset').onclick = () => {
        this.engine.resetStats();
        this.logs = [];
        this.addLog('统计已重置');
        this.update();
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
        startBlock: parseInt($('haxi-startblock').value) || 0
      });
    }

    _updateVisibility() {
      const $ = (id) => document.getElementById(id);
      const strategy = $('haxi-strategy').value;
      const target = $('haxi-target').value;

      const show = (id, visible) => { if ($(id)) $(id).style.display = visible ? 'flex' : 'none'; };
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
        startX = e.clientX;
        startY = e.clientY;
        const rect = panelEl.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        const onMove = (e2) => {
          panelEl.style.left = (startLeft + e2.clientX - startX) + 'px';
          panelEl.style.top = (startTop + e2.clientY - startY) + 'px';
          panelEl.style.right = 'auto';
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

      // 区块匹配状态
      const pageBlock = this.engine.currentPageBlock;
      const backendBlock = this.engine.latestBackendBlock;
      if ($('haxi-page-block')) {
        $('haxi-page-block').textContent = pageBlock ? pageBlock.toString() : '--';
      }
      if ($('haxi-backend-block')) {
        $('haxi-backend-block').textContent = backendBlock ? backendBlock.toString() : '--';
      }
      if ($('haxi-block-match')) {
        if (!pageBlock || !backendBlock) {
          $('haxi-block-match').textContent = '等待中';
          $('haxi-block-match').style.color = '#f59e0b';
        } else if (this.engine.blockMatched) {
          $('haxi-block-match').textContent = '已匹配';
          $('haxi-block-match').style.color = '#22c55e';
        } else {
          $('haxi-block-match').textContent = '不匹配';
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
          const blockStr = b.blockHeight ? `#${b.blockHeight}` : '';
          return `<div class="haxi-history-item">
            <span>${label} ¥${b.amount} ${blockStr}</span>
            ${status}
          </div>`;
        }).join('');
      }

      // 同步状态到Chrome storage
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'SAVE_PLUGIN_STATE', state: this.engine.stats });
        }
      } catch (e) { /* ignore */ }
    }
  }

  // ==================== 初始化 ====================
  console.log('[HAXI插件] Content script 已加载');

  // 从Chrome storage获取API URL
  function loadApiUrl() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'GET_API_URL' }, (response) => {
            if (response && response.apiUrl) {
              API_URL = response.apiUrl;
              console.log('[HAXI插件] API URL:', API_URL);
            }
            resolve();
          });
        } else {
          resolve();
        }
      } catch (e) {
        resolve();
      }
    });
  }

  const engine = new BetEngine();
  let panel = null;

  async function init() {
    // 加载API URL配置
    await loadApiUrl();

    // 等待页面渲染（React SPA可能需要时间）
    let retries = 0;
    const maxRetries = 20;

    const tryInit = () => {
      retries++;
      const gameType = detectGameType();

      // 检查页面是否有游戏元素
      const hasInput = !!SiteAdapter.findAmountInput();
      const hasBlock = !!SiteAdapter.getCurrentBlock();
      const isReady = hasInput || hasBlock || gameType;

      if (isReady || retries >= maxRetries) {
        console.log(`[HAXI插件] 初始化 (尝试${retries}): 游戏=${gameType || '未检测'}, 输入框=${hasInput}, 区块=${hasBlock}`);

        if (!gameType && retries < maxRetries) {
          // 还没检测到游戏类型，继续等
          setTimeout(tryInit, 1500);
          return;
        }

        // 创建面板
        panel = new ControlPanel(engine);
        panel.create();

        if (gameType) {
          panel.addLog('插件已加载 - ' + (gameType === 'PARITY' ? '尾数单双' : '尾数大小'));
        } else {
          panel.addLog('插件已加载 - 游戏类型未检测，请确认在游戏页面');
        }

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

        // 启动区块监测（即使未开始自动下注也持续读取区块信息）
        startBlockMonitor();
      } else {
        setTimeout(tryInit, 1500);
      }
    };

    // 首次延迟2秒等React渲染
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
  }

  // 区块监测 - 持续读取页面区块和后端区块并更新显示
  function startBlockMonitor() {
    setInterval(async () => {
      if (engine.running) return; // 引擎运行时由引擎自己更新

      engine.currentPageBlock = SiteAdapter.getCurrentBlock();

      try {
        const result = await ApiClient.getBlocks(1, engine.config.ruleValue, engine.config.startBlock);
        if (result.success && result.data && result.data.length > 0) {
          engine.latestBackendBlock = result.data[0].height;
          const expected = engine.latestBackendBlock + engine.config.ruleValue;
          engine.blockMatched = engine.currentPageBlock === expected;
        }
      } catch (e) { /* ignore */ }

      if (panel) panel.update();
    }, 5000);
  }

  // 启动
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }

})();
