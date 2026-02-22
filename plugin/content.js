/**
 * ========================================================
 *  哈希游戏下注执行器 - Content Script v4.0
 *  纯执行器: 前端托管任务 → 插件执行真实下注
 *  移除: 策略引擎/目标选择器/自动下注循环/配置UI
 *  保留: SiteAdapter / WSClient / RealBetReceiver / 状态面板
 * ========================================================
 */
(function () {
  'use strict';

  // ==================== 配置常量 ====================
  let API_URL = 'http://localhost:3001';
  let WS_URL = 'ws://localhost:8080';
  const BET_DELAY_MS = 100;

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

    getCurrentBlock() {
      let maxBlock = null;
      const candidates = document.querySelectorAll('div[color="#fff"][font-size="24px"][font-weight="600"]');
      for (const el of candidates) {
        const num = parseInt(el.textContent.trim());
        if (!isNaN(num) && num > 1000000) {
          if (!maxBlock || num > maxBlock) maxBlock = num;
        }
      }
      if (maxBlock) return maxBlock;

      const wavxa = document.querySelector('.Wavxa');
      if (wavxa) {
        const num = parseInt(wavxa.textContent.trim());
        if (!isNaN(num) && num > 1000000) return num;
      }

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
     * 完整下注流程: 重置 → 选择目标 → 输入金额 → 确认
     */
    async executeBet(target, amount) {
      // 步骤1: 重置
      const resetBtn = this.findResetButton();
      if (resetBtn) {
        resetBtn.click();
        await delay(BET_DELAY_MS);
      }

      // 步骤2: 选择目标(单/双/大/小) - 必须在确认之前!
      const targetBtn = this.findBetButton(target);
      if (!targetBtn) return { success: false, reason: '未找到目标按钮' };
      targetBtn.click();
      await delay(BET_DELAY_MS);

      // 步骤3: 输入金额
      const input = this.findAmountInput();
      if (!input) return { success: false, reason: '未找到金额输入框' };

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

      // 步骤4: 确认提交
      const confirmBtn = this.findConfirmButton();
      if (confirmBtn) {
        confirmBtn.click();
        await delay(BET_DELAY_MS);
        return { success: true };
      }
      return { success: false, reason: '未找到确认按钮' };
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
    blocks: [],
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
          if (panel) {
            panel.addLog('WS实时连接已建立');
            panel.update();
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'connected') return;

            if (data.height && data.hash) {
              this.latestBlock = data;
              this.blocks.unshift(data);
              if (this.blocks.length > 200) this.blocks = this.blocks.slice(0, 200);

              this.listeners.forEach(fn => {
                try { fn(data); } catch (e) { /* ignore */ }
              });
            }
          } catch (e) { /* ignore parse errors */ }
        };

        this.ws.onclose = () => {
          this.connected = false;
          console.log('[HAXI插件] WebSocket断开, 将在', this.reconnectDelay, 'ms后重连');
          if (panel) panel.update();
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
    }
  };

  // ==================== 真实下注接收器 (前端→插件) ====================
  const RealBetReceiver = {
    queue: [],
    processing: false,
    results: [],
    totalExecuted: 0,
    totalSuccess: 0,
    totalFailed: 0,

    init() {
      // 监听前端发送的真实下注命令
      document.addEventListener('haxi-real-bet', (e) => {
        const cmd = e.detail;
        if (!cmd || !cmd.target || !cmd.amount) return;
        console.log('[HAXI插件] 收到真实下注命令:', cmd);
        this.queue.push(cmd);
        if (panel) panel.addLog(`[队列+] ${TARGET_TEXT[cmd.target]} ¥${cmd.amount} ${cmd.taskName || ''}`);
        this._processQueue();
      });

      // 监听余额查询
      document.addEventListener('haxi-query-balance', () => {
        const balance = this.readRealBalance();
        document.dispatchEvent(new CustomEvent('haxi-balance-result', {
          detail: { balance, timestamp: Date.now() }
        }));
      });

      // 监听插件就绪查询
      document.addEventListener('haxi-query-ready', () => {
        document.dispatchEvent(new CustomEvent('haxi-ready-result', {
          detail: {
            ready: true,
            version: '4.0',
            currentBlock: SiteAdapter.getCurrentBlock(),
            balance: this.readRealBalance()
          }
        }));
      });

      console.log('[HAXI插件] 真实下注接收器已启动');
      if (panel) panel.addLog('下注执行器就绪');
    },

    /**
     * 读取平台真实余额
     */
    readRealBalance() {
      // 方法1: 精确class匹配
      const span = document.querySelector('span.jwlTOs');
      if (span) {
        const val = parseFloat(span.textContent.trim());
        if (!isNaN(val)) return val;
      }
      // 方法2: 在已知父容器中查找
      const containers = document.querySelectorAll('.fQggfv, .sc-Rmtcm');
      for (const c of containers) {
        const spans = c.querySelectorAll('span');
        for (const s of spans) {
          const text = s.textContent.trim();
          if (/^\d+\.?\d*$/.test(text)) {
            const val = parseFloat(text);
            if (!isNaN(val)) return val;
          }
        }
      }
      return null;
    },

    async _processQueue() {
      if (this.processing || this.queue.length === 0) return;
      this.processing = true;

      while (this.queue.length > 0) {
        const cmd = this.queue.shift();
        const t0 = Date.now();

        try {
          const currentBlock = SiteAdapter.getCurrentBlock();

          // 执行真实下注
          const result = await SiteAdapter.executeBet(cmd.target, cmd.amount);
          const elapsed = Date.now() - t0;

          this.totalExecuted++;
          if (result.success) this.totalSuccess++;
          else this.totalFailed++;

          const betResult = {
            taskId: cmd.taskId,
            taskName: cmd.taskName,
            blockHeight: cmd.blockHeight || currentBlock,
            target: cmd.target,
            amount: cmd.amount,
            ruleId: cmd.ruleId,
            success: result.success,
            reason: result.reason || '',
            elapsed,
            timestamp: Date.now(),
            balanceAfter: this.readRealBalance()
          };

          // 返回结果给前端
          document.dispatchEvent(new CustomEvent('haxi-bet-result', {
            detail: betResult
          }));

          this.results.unshift(betResult);
          if (this.results.length > 50) this.results = this.results.slice(0, 50);

          const targetLabel = TARGET_TEXT[cmd.target] || cmd.target;
          if (result.success) {
            if (panel) panel.addLog(`[执行] ${targetLabel} ¥${cmd.amount} ${cmd.taskName || ''} [${elapsed}ms]`);
          } else {
            if (panel) panel.addLog(`[失败] ${result.reason}`);
          }
          if (panel) panel.update();

          // 多个下注之间短暂延迟
          if (this.queue.length > 0) await delay(BET_DELAY_MS);

        } catch (err) {
          this.totalExecuted++;
          this.totalFailed++;
          console.error('[HAXI插件] 真实下注错误:', err);
          document.dispatchEvent(new CustomEvent('haxi-bet-result', {
            detail: {
              taskId: cmd.taskId,
              blockHeight: cmd.blockHeight,
              target: cmd.target,
              amount: cmd.amount,
              success: false,
              reason: err.message,
              timestamp: Date.now()
            }
          }));
          if (panel) panel.addLog(`[异常] ${err.message}`);
        }
      }

      this.processing = false;
    }
  };

  // ==================== 状态面板 (精简版) ====================
  class StatusPanel {
    constructor() {
      this.logs = [];
      this.minimized = false;
      this.container = null;
      this.currentPageBlock = null;
    }

    create() {
      if (this.container) return;

      // 注入CSS
      const style = document.createElement('style');
      style.textContent = this._buildCSS();
      document.head.appendChild(style);

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

    _buildCSS() {
      return `
        .haxi-panel {
          position: fixed; top: 20px; right: 20px; width: 300px; max-height: 80vh;
          background: #0f172a; border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(99,102,241,0.3);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
          font-size: 13px; color: #e2e8f0; overflow: hidden;
        }
        .haxi-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          cursor: move; user-select: none;
        }
        .haxi-header-left { display: flex; align-items: center; gap: 8px; }
        .haxi-header-right { display: flex; gap: 4px; }
        .haxi-title { font-size: 13px; font-weight: 800; color: white; letter-spacing: 0.5px; }
        .haxi-version {
          font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.9);
          background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 10px;
        }
        .haxi-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .haxi-dot-idle { background: #94a3b8; }
        .haxi-dot-active { background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: haxi-pulse 1.5s infinite; }
        @keyframes haxi-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .haxi-btn-icon {
          width: 24px; height: 24px; border: none; border-radius: 6px;
          background: rgba(255,255,255,0.15); color: white; font-size: 16px; font-weight: bold;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background 0.2s; line-height: 1;
        }
        .haxi-btn-icon:hover { background: rgba(255,255,255,0.3); }
        .haxi-btn-close:hover { background: #ef4444; }
        .haxi-body {
          padding: 10px; overflow-y: auto; max-height: calc(80vh - 46px);
        }
        .haxi-body::-webkit-scrollbar { width: 3px; }
        .haxi-body::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }

        /* Status Grid */
        .haxi-status-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px;
        }
        .haxi-status-card {
          background: #1e293b; border-radius: 10px; padding: 8px 10px;
          border: 1px solid #334155;
        }
        .haxi-status-card.full { grid-column: 1 / -1; }
        .haxi-status-label {
          font-size: 10px; font-weight: 600; color: #64748b;
          text-transform: uppercase; letter-spacing: 0.3px;
        }
        .haxi-status-value {
          font-size: 13px; font-weight: 800; color: #e0e7ff;
          font-family: 'SF Mono', 'Menlo', monospace; margin-top: 2px;
        }

        /* Execution Stats */
        .haxi-exec-bar {
          display: flex; gap: 6px; margin-bottom: 10px;
        }
        .haxi-exec-stat {
          flex: 1; text-align: center; background: #1e293b; border-radius: 8px;
          padding: 6px 4px; border: 1px solid #334155;
        }
        .haxi-exec-num { font-size: 16px; font-weight: 800; }
        .haxi-exec-label { font-size: 9px; font-weight: 600; color: #64748b; text-transform: uppercase; }

        /* Recent Bets */
        .haxi-section-title {
          font-size: 10px; font-weight: 700; color: #64748b;
          text-transform: uppercase; letter-spacing: 0.5px;
          margin-bottom: 6px; padding-left: 2px;
        }
        .haxi-bet-list {
          background: #1e293b; border-radius: 10px; padding: 4px;
          max-height: 140px; overflow-y: auto; margin-bottom: 10px;
          border: 1px solid #334155;
        }
        .haxi-bet-list::-webkit-scrollbar { width: 3px; }
        .haxi-bet-list::-webkit-scrollbar-thumb { background: #475569; border-radius: 2px; }
        .haxi-bet-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 5px 8px; font-size: 11px; font-weight: 600;
          border-bottom: 1px solid #0f172a;
        }
        .haxi-bet-item:last-child { border-bottom: none; }
        .haxi-bet-target { color: #a5b4fc; }
        .haxi-bet-amount { color: #fbbf24; font-family: monospace; }
        .haxi-bet-task { color: #64748b; font-size: 10px; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .haxi-bet-ok { color: #22c55e; font-weight: 800; }
        .haxi-bet-fail { color: #ef4444; font-weight: 800; }
        .haxi-bet-time { color: #475569; font-size: 10px; font-family: monospace; }

        /* Logs */
        .haxi-log-list {
          background: #1e293b; border-radius: 10px; padding: 4px;
          max-height: 100px; overflow-y: auto;
          border: 1px solid #334155;
        }
        .haxi-log-list::-webkit-scrollbar { width: 3px; }
        .haxi-log-list::-webkit-scrollbar-thumb { background: #475569; border-radius: 2px; }
        .haxi-log-item { font-size: 10px; color: #94a3b8; padding: 2px 6px; }
        .haxi-log-ts { color: #475569; margin-right: 4px; font-family: monospace; }

        /* Queue indicator */
        .haxi-queue-badge {
          display: inline-block; min-width: 16px; text-align: center;
          background: #6366f1; color: white; font-size: 10px; font-weight: 800;
          padding: 1px 5px; border-radius: 8px; margin-left: 4px;
        }
        .haxi-queue-badge.empty { background: #334155; color: #64748b; }

        @media (max-width: 768px) {
          .haxi-panel { width: 280px; right: 10px; top: 10px; }
        }
      `;
    }

    _buildHTML() {
      const gameType = detectGameType();
      const gameLabel = gameType === 'PARITY' ? '单双' : gameType === 'SIZE' ? '大小' : '?';

      return `
        <div class="haxi-header" id="haxi-drag-handle">
          <div class="haxi-header-left">
            <span class="haxi-dot haxi-dot-idle" id="haxi-status-dot"></span>
            <span class="haxi-title">HAXI 执行器</span>
            <span class="haxi-version">v4.0 ${gameLabel}</span>
          </div>
          <div class="haxi-header-right">
            <button class="haxi-btn-icon" id="haxi-btn-minimize" title="最小化">−</button>
            <button class="haxi-btn-icon haxi-btn-close" id="haxi-btn-close" title="关闭">×</button>
          </div>
        </div>

        <div class="haxi-body" id="haxi-body">
          <!-- 状态卡片 -->
          <div class="haxi-status-grid">
            <div class="haxi-status-card">
              <div class="haxi-status-label">下注区块</div>
              <div class="haxi-status-value" id="haxi-page-block">--</div>
            </div>
            <div class="haxi-status-card">
              <div class="haxi-status-label">平台余额</div>
              <div class="haxi-status-value" id="haxi-real-balance" style="color:#fbbf24">--</div>
            </div>
            <div class="haxi-status-card">
              <div class="haxi-status-label">后端区块</div>
              <div class="haxi-status-value" id="haxi-backend-block">--</div>
            </div>
            <div class="haxi-status-card">
              <div class="haxi-status-label">数据源</div>
              <div class="haxi-status-value" id="haxi-ws-status">等待</div>
            </div>
          </div>

          <!-- 执行统计 -->
          <div class="haxi-exec-bar">
            <div class="haxi-exec-stat">
              <div class="haxi-exec-num" id="haxi-exec-total" style="color:#a5b4fc">0</div>
              <div class="haxi-exec-label">已执行</div>
            </div>
            <div class="haxi-exec-stat">
              <div class="haxi-exec-num" id="haxi-exec-ok" style="color:#22c55e">0</div>
              <div class="haxi-exec-label">成功</div>
            </div>
            <div class="haxi-exec-stat">
              <div class="haxi-exec-num" id="haxi-exec-fail" style="color:#ef4444">0</div>
              <div class="haxi-exec-label">失败</div>
            </div>
            <div class="haxi-exec-stat">
              <div class="haxi-exec-num" id="haxi-exec-queue" style="color:#fbbf24">0</div>
              <div class="haxi-exec-label">队列</div>
            </div>
          </div>

          <!-- 最近执行 -->
          <div class="haxi-section-title">最近执行</div>
          <div class="haxi-bet-list" id="haxi-bet-list"></div>

          <!-- 日志 -->
          <div class="haxi-section-title">运行日志</div>
          <div class="haxi-log-list" id="haxi-log-list"></div>
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
        this.container.style.display = 'none';
      };
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
      el.innerHTML = this.logs.slice(0, 15).map(l =>
        `<div class="haxi-log-item"><span class="haxi-log-ts">${l.ts}</span>${l.msg}</div>`
      ).join('');
    }

    update() {
      const $ = (id) => document.getElementById(id);

      // 区块
      if ($('haxi-page-block')) {
        const block = this.currentPageBlock || SiteAdapter.getCurrentBlock();
        $('haxi-page-block').textContent = block ? block.toString() : '--';
      }

      // 后端区块
      if ($('haxi-backend-block')) {
        const bb = WSClient.latestBlock ? WSClient.latestBlock.height : null;
        $('haxi-backend-block').textContent = bb ? bb.toString() : '--';
      }

      // WS状态
      if ($('haxi-ws-status')) {
        if (WSClient.connected) {
          $('haxi-ws-status').textContent = 'WS实时';
          $('haxi-ws-status').style.color = '#22c55e';
        } else {
          $('haxi-ws-status').textContent = '断开';
          $('haxi-ws-status').style.color = '#ef4444';
        }
      }

      // 平台余额
      if ($('haxi-real-balance')) {
        const rb = RealBetReceiver.readRealBalance();
        $('haxi-real-balance').textContent = rb !== null ? rb.toFixed(2) : '--';
      }

      // 状态指示灯 (有WS连接=绿色)
      if ($('haxi-status-dot')) {
        $('haxi-status-dot').className = 'haxi-dot ' + (WSClient.connected ? 'haxi-dot-active' : 'haxi-dot-idle');
      }

      // 执行统计
      if ($('haxi-exec-total')) $('haxi-exec-total').textContent = RealBetReceiver.totalExecuted;
      if ($('haxi-exec-ok')) $('haxi-exec-ok').textContent = RealBetReceiver.totalSuccess;
      if ($('haxi-exec-fail')) $('haxi-exec-fail').textContent = RealBetReceiver.totalFailed;
      if ($('haxi-exec-queue')) $('haxi-exec-queue').textContent = RealBetReceiver.queue.length;

      // 最近执行列表
      const betListEl = $('haxi-bet-list');
      if (betListEl) {
        const items = RealBetReceiver.results.slice(0, 15);
        if (items.length === 0) {
          betListEl.innerHTML = '<div class="haxi-log-item" style="text-align:center;color:#475569">等待前端发送下注命令...</div>';
        } else {
          betListEl.innerHTML = items.map(b => {
            const targetLabel = TARGET_TEXT[b.target] || b.target;
            const statusBadge = b.success
              ? '<span class="haxi-bet-ok">OK</span>'
              : '<span class="haxi-bet-fail">FAIL</span>';
            const timeStr = new Date(b.timestamp).toLocaleTimeString('zh-CN');
            return `<div class="haxi-bet-item">
              <span class="haxi-bet-target">${targetLabel}</span>
              <span class="haxi-bet-amount">¥${b.amount}</span>
              <span class="haxi-bet-task">${b.taskName || ''}</span>
              ${statusBadge}
              <span class="haxi-bet-time">${timeStr}</span>
            </div>`;
          }).join('');
        }
      }
    }
  }

  // ==================== 初始化 ====================
  console.log('[HAXI插件] Content Script v4.0 已加载');

  function loadApiUrl() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'GET_API_URL' }, (response) => {
            if (response && response.apiUrl) {
              API_URL = response.apiUrl;
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
        // 创建状态面板
        panel = new StatusPanel();
        panel.create();

        if (gameType) {
          panel.addLog('v4.0 已加载 - ' + (gameType === 'PARITY' ? '尾数单双' : '尾数大小'));
        } else {
          panel.addLog('v4.0 已加载 - 等待游戏页面');
        }

        // 连接WebSocket
        WSClient.connect();

        // 启动真实下注接收器(前端→插件通信)
        RealBetReceiver.init();

        // 区块监测(显示实时状态)
        startBlockMonitor();
      } else {
        setTimeout(tryInit, 1500);
      }
    };

    setTimeout(tryInit, 2000);
  }

  // 区块监测 - MutationObserver + WS + 轮询
  function startBlockMonitor() {
    let monitorObserver = null;

    const updateStatus = () => {
      panel.currentPageBlock = SiteAdapter.getCurrentBlock();
      if (panel) panel.update();
    };

    // MutationObserver: 页面区块变化时即时更新
    const setupObserver = () => {
      const candidates = document.querySelectorAll('div[color="#fff"][font-size="24px"][font-weight="600"]');
      if (candidates.length === 0) return;

      const parents = new Set();
      for (const el of candidates) {
        const p = el.parentElement ? (el.parentElement.parentElement || el.parentElement) : null;
        if (p) parents.add(p);
      }

      if (monitorObserver) monitorObserver.disconnect();
      monitorObserver = new MutationObserver(updateStatus);
      for (const p of parents) {
        monitorObserver.observe(p, { childList: true, subtree: true, characterData: true });
      }
    };

    setupObserver();
    setTimeout(setupObserver, 5000);

    // WS事件: 后端区块更新时即时刷新
    WSClient.onBlock(() => updateStatus());

    // 保底轮询(3秒)
    setInterval(updateStatus, 3000);
  }

  // 启动
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }

})();
