/**
 * 哈希游戏自动下注 - Background Service Worker
 * 负责跨页面通信和持久化存储
 */

// 默认后端API地址
const DEFAULT_API_URL = 'http://localhost:3001';

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_API_URL') {
    chrome.storage.local.get(['apiUrl'], (result) => {
      sendResponse({ apiUrl: result.apiUrl || DEFAULT_API_URL });
    });
    return true; // 异步响应
  }

  if (message.type === 'SET_API_URL') {
    chrome.storage.local.set({ apiUrl: message.apiUrl }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'SAVE_PLUGIN_STATE') {
    chrome.storage.local.set({ pluginState: message.state }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'LOAD_PLUGIN_STATE') {
    chrome.storage.local.get(['pluginState'], (result) => {
      sendResponse({ state: result.pluginState || null });
    });
    return true;
  }

  if (message.type === 'PLUGIN_STATUS') {
    // 转发到 popup
    chrome.runtime.sendMessage(message).catch(() => {});
  }
});

// 安装时初始化
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    apiUrl: DEFAULT_API_URL,
    pluginState: null
  });
  console.log('[HAXI Plugin] 插件已安装');
});
