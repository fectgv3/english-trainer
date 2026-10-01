// 设置页：接口地址 / API Key / 模型（从接口实时拉取）/ 代理 / 演示模式
import { API_PRESETS, NON_CHAT_MODEL_RE } from '../constants.js';
import { getSettings, saveSettings } from '../config.js';
import { callChat, getLastUsage, listModels } from '../ai.js';
import { store } from '../storage.js';

const $ = (id) => document.getElementById(id);

function status(text, kind = '') {
  const st = $('settings-status');
  st.textContent = text;
  st.className = 'status ' + kind;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const normBase = (b) => String(b || '').trim().replace(/\/+$/, '').toLowerCase();

/* ---------------- 模型列表（从接口拉取，不写死名字） ---------------- */

let models = [];      // 已拉取到的模型名
let modelBase = '';   // 拉取时对应的 API Base
const CACHE_KEY = 'modelCache';
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 小时

// 用「接口 + Key 尾号」做缓存标识，避免把完整 Key 写进缓存
const cacheTag = () => ($('api-key').value.trim().slice(-6) || '');

function readCache(base) {
  const c = store.get(CACHE_KEY, null);
  if (!c || c.base !== base || c.tag !== cacheTag()) return null;
  if (Date.now() - c.ts > CACHE_TTL) return null;
  return c;
}

// 对话模型排前面，embedding / 绘图 / 语音等沉到最后
function sortModels(ids) {
  const chat = [];
  const other = [];
  for (const id of ids) (NON_CHAT_MODEL_RE.test(id) ? other : chat).push(id);
  return [...chat, ...other];
}

function renderModelSource(note = '', warn = false) {
  const src = $('model-source');
  if (!models.length) {
    src.textContent = note || '尚未拉取';
    src.className = warn ? 'tip warn-text' : 'muted tip';
    return;
  }
  const cur = $('model').value.trim();
  const stale = Boolean(cur) && !models.includes(cur);
  const parts = [note || `共 ${models.length} 个可用模型 · 来自 ${modelBase}`];
  if (stale) parts.push(`⚠️ 当前模型「${cur}」不在列表中，可能已下线或改名`);
  src.textContent = parts.join(' · ');
  src.className = stale || warn ? 'tip warn-text' : 'muted tip';
}

function renderChips() {
  const box = $('model-chips');
  const filter = $('model-filter').value.trim().toLowerCase();
  const cur = $('model').value.trim();
  box.innerHTML = '';

  if (!models.length) {
    box.innerHTML = '<span class="muted tip">填好 API Key 后点「拉取可用模型」，会从接口读取你账号当前真实可用的模型（不消耗 token）。</span>';
    return;
  }
  const list = filter ? models.filter((m) => m.toLowerCase().includes(filter)) : models;
  $('model-filter-row').classList.toggle('hidden', models.length <= 20);
  if (!list.length) {
    box.innerHTML = `<span class="muted tip">没有匹配「${escapeHTML(filter)}」的模型。</span>`;
    return;
  }
  const cap = filter ? 120 : 60;
  for (const m of list.slice(0, cap)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn' + (m === cur ? ' on' : '');
    btn.textContent = m;
    btn.title = m;
    btn.addEventListener('click', () => {
      $('model').value = m;
      saveSettings({ model: m });
      renderChips();
      renderModelSource();
      status(`✅ 已选择模型 ${m}。`);
    });
    box.appendChild(btn);
  }
  if (list.length > cap) {
    const tip = document.createElement('span');
    tip.className = 'muted tip';
    tip.textContent = `共 ${list.length} 个，仅显示前 ${cap} 个，请在上方筛选框缩小范围`;
    box.appendChild(tip);
  }
}

async function fetchModels({ silent = false } = {}) {
  const btn = $('fetch-models');
  const base = $('api-base').value.trim();
  if (!silent) { btn.disabled = true; btn.textContent = '拉取中…'; }
  if (silent) $('model-source').textContent = '正在拉取可用模型…';
  try {
    const ids = await listModels();
    models = sortModels(ids);
    modelBase = base;
    store.set(CACHE_KEY, { base, tag: cacheTag(), ts: Date.now(), ids: models });
    const list = $('model-options');
    list.innerHTML = '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      list.appendChild(opt);
    }
    renderChips();
    renderModelSource();
    if (!silent) status(`✅ 拉取到 ${models.length} 个可用模型，点下方标签即可选用。`, 'ok');
  } catch (e) {
    models = [];
    modelBase = '';
    renderChips();
    renderModelSource(`拉取失败：${e.message}`, true);
    if (!silent) status('❌ ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '拉取可用模型';
  }
}

/* ---------------- 初始化 ---------------- */

function buildPresets() {
  const sel = $('provider-preset');
  for (const p of API_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.base;
    opt.textContent = `${p.name} · ${p.base}`;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    $('api-base').value = sel.value;
    saveSettings({ apiBase: sel.value });
    models = [];
    renderChips();
    renderModelSource('接口地址已切换，请重新「拉取可用模型」。', true);
    status('✅ 已填入接口地址，接着填 API Key 并拉取模型列表。');
  });
}

// 让下拉框回显当前接口（命中预设才高亮，否则显示「自定义」）
function syncPreset() {
  const sel = $('provider-preset');
  const base = normBase($('api-base').value);
  const hit = [...sel.querySelectorAll('option')].find((o) => normBase(o.value) === base);
  sel.value = hit ? hit.value : '';
}

export function initSettingsView() {
  const s = getSettings();
  $('api-base').value = s.apiBase;
  $('api-key').value = s.apiKey;
  $('model').value = s.model;
  $('use-proxy').checked = !!s.useProxy;
  $('demo-mode').checked = !!s.demo;

  buildPresets();
  syncPreset();
  renderChips();
  renderModelSource();

  $('fetch-models').addEventListener('click', () => fetchModels());
  $('model-filter').addEventListener('input', renderChips);

  // 表单里的选择即时生效，避免"改了没保存"的困惑
  $('api-base').addEventListener('change', () => {
    saveSettings({ apiBase: $('api-base').value.trim() || 'https://api.openai.com/v1' });
    syncPreset();
    if (normBase($('api-base').value) !== normBase(modelBase)) {
      models = [];
      modelBase = '';
      renderChips();
    }
    renderModelSource();
    status('✅ 已保存 API Base。');
  });
  $('model').addEventListener('change', () => {
    saveSettings({ model: $('model').value.trim() || 'gpt-4o-mini' });
    renderChips();
    renderModelSource();
    status('✅ 已保存模型名。');
  });
  $('use-proxy').addEventListener('change', () => {
    saveSettings({ useProxy: $('use-proxy').checked });
    status('✅ 已设置是否使用本地代理转发。');
  });
  $('demo-mode').addEventListener('change', () => {
    saveSettings({ demo: $('demo-mode').checked });
    status($('demo-mode').checked ? '✅ 演示模式已开启（不会调用 AI）。' : '✅ 演示模式已关闭。');
  });

  $('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings({
      apiBase: $('api-base').value.trim() || 'https://api.openai.com/v1',
      apiKey: $('api-key').value.trim(),
      model: $('model').value.trim() || 'gpt-4o-mini',
      useProxy: $('use-proxy').checked,
      demo: $('demo-mode').checked,
    });
    status('✅ 已保存到本机浏览器（localStorage）。', 'ok');
  });

  $('test-conn').addEventListener('click', async () => {
    if ($('demo-mode').checked) {
      status('演示模式：无需连接 AI。', 'ok');
      return;
    }
    status('测试中…');
    try {
      await callChat([{ role: 'user', content: '请只回复：连接成功' }], { temperature: 0 });
      const u = getLastUsage();
      status(`✅ 连接成功，模型可用！${u ? `（本次消耗 ${u.total_tokens} tokens）` : ''}`, 'ok');
      if (!models.length) fetchModels({ silent: true }); // 顺手刷新可用模型
    } catch (err) {
      status('❌ ' + err.message, 'err');
    }
  });

  // Key 输入即更新顶部状态
  $('api-key').addEventListener('input', () => {
    saveSettings({ apiKey: $('api-key').value.trim() });
  });
  $('api-key').addEventListener('change', () => {
    models = [];      // 换了 Key，可用模型可能不同
    modelBase = '';
    renderChips();
    renderModelSource('API Key 已更新，点「拉取可用模型」重新获取列表。', true);
  });

  // 进设置页时：有缓存就直接用，没有就静默拉一次
  const cached = readCache($('api-base').value.trim());
  if (cached) {
    models = cached.ids;
    modelBase = cached.base;
    const mins = Math.max(1, Math.round((Date.now() - cached.ts) / 60000));
    renderChips();
    renderModelSource(`共 ${models.length} 个可用模型 · 来自 ${modelBase}（${mins} 分钟前缓存）`);
  } else if (!$('demo-mode').checked && $('api-key').value.trim()) {
    fetchModels({ silent: true });
  }
}
