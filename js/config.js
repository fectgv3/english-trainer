// 用户设置（API Key 只存本机浏览器 localStorage）
import { store } from './storage.js';

export const DEFAULT_SETTINGS = {
  apiBase: 'https://api.openai.com/v1', // 任何 OpenAI 兼容接口均可
  apiKey: '',
  model: 'gpt-4o-mini',
  useProxy: true,  // 经本地 server.mjs 代理转发，避免浏览器 CORS
  demo: false,     // 演示模式：不调用 AI，用内置示例题
};

let settings = { ...DEFAULT_SETTINGS, ...store.get('settings', {}) };

export function getSettings() {
  return settings;
}

export function saveSettings(patch) {
  settings = { ...settings, ...patch };
  store.set('settings', settings);
  refreshModePill();
}

// 顶部状态胶囊：显示当前模式 + 代理状态
export function refreshModePill(proxyOk = null) {
  const pill = document.getElementById('mode-pill');
  if (!pill) return;
  if (proxyOk === null) proxyOk = pill.dataset.proxy === '1';
  pill.dataset.proxy = proxyOk ? '1' : '0';
  const proxyText = proxyOk ? ' · 代理✓' : ' · 代理✗';
  if (settings.demo) {
    pill.textContent = '演示模式' + proxyText;
    pill.className = 'pill demo';
  } else if (settings.apiKey) {
    pill.textContent = `${settings.model}（已配置 Key）` + proxyText;
    pill.className = 'pill ok';
  } else {
    pill.textContent = '未配置 API Key' + proxyText;
    pill.className = 'pill warn';
  }
}
