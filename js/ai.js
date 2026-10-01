// AI 客户端：OpenAI 兼容 chat/completions 接口
// 直连浏览器可能被 CORS 拦截，因此默认走本地 server.mjs 代理

const PROXY_BASE = 'http://localhost:5175';

// 最近一次 AI 调用的 token 用量（来自上游返回的 usage 字段）
let lastUsage = null;
export function getLastUsage() {
  return lastUsage;
}

function joinBase(base, path) {
  return base.replace(/\/+$/, '') + path;
}

// 每次调用时动态读取最新设置，避免循环依赖
async function loadSettings() {
  const { getSettings } = await import('./config.js');
  return getSettings();
}

export async function callChat(messages, opts = {}) {
  const s = await loadSettings();
  const { temperature = 0.7, json = false, maxTokens = 0 } = opts;
  if (s.demo) {
    throw new Error('演示模式不调用 AI（如需真实出题请关闭演示模式）');
  }
  if (!s.apiKey) {
    throw new Error('未配置 API Key，请到「设置」页填写，或开启演示模式');
  }
  const url = s.useProxy
    ? `${PROXY_BASE}/api/chat`
    : joinBase(s.apiBase, '/chat/completions');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(s.useProxy ? {} : { Authorization: `Bearer ${s.apiKey}` }),
      },
      body: JSON.stringify({
        model: s.model,
        messages,
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (e) {
    throw new Error(
      s.useProxy
        ? `无法连接本地代理 ${PROXY_BASE}，请先运行 node server.mjs（或关闭「使用本地代理」）`
        : `网络请求失败：${e.message}`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 接口返回 ${res.status}：${text.slice(0, 200)}`);
  }
  const data = await res.json();
  lastUsage = data.usage || null;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回内容为空');
  return content;
}

// 拉取账号当前真实可用的模型列表（GET {API Base}/models）
// 不消耗 token；不同服务商返回格式略有差异，统一抽取成字符串数组
export async function listModels() {
  const s = await loadSettings();
  if (s.demo) throw new Error('演示模式不调用 AI 接口，无法拉取模型列表');
  if (!s.apiKey) throw new Error('请先填写 API Key，再拉取可用模型');
  const url = s.useProxy ? `${PROXY_BASE}/api/models` : joinBase(s.apiBase, '/models');
  const headers = s.useProxy
    ? { 'x-api-key': `Bearer ${s.apiKey}`, 'x-api-base': s.apiBase }
    : { Authorization: `Bearer ${s.apiKey}` };
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    throw new Error(
      s.useProxy
        ? `无法连接本地代理 ${PROXY_BASE}，请先运行 node server.mjs（或关闭「使用本地代理」）`
        : `网络请求失败：${e.message}`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404) throw new Error('该接口没有提供模型列表（404），请手动输入模型名');
    if (res.status === 401 || res.status === 403) {
      throw new Error(`API Key 无法读取模型列表（${res.status}），请检查 Key 是否有效，或直接手动输入模型名`);
    }
    throw new Error(`模型列表接口返回 ${res.status}：${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return extractModelIds(data);
}

// 兼容 OpenAI（data[].id）、部分中转站（models[].name）与直接返回数组的形式
export function extractModelIds(data) {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : Array.isArray(data?.result)
          ? data.result
          : [];
  const ids = list
    .map((m) => (typeof m === 'string' ? m : m?.id || m?.name || m?.model))
    .filter((x) => typeof x === 'string' && x.trim())
    .map((x) => x.trim());
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

// 便捷封装：带 JSON 解析（容忍 ```json 围栏）
export async function chatJSON(messages, opts = {}) {
  const raw = await callChat(messages, { ...opts, json: true });
  return parseJSON(raw);
}

export function parseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    // 去掉 ```json ... ``` 围栏后再试
    const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) {
      try { return JSON.parse(m[1]); } catch { /* fallthrough */ }
    }
    // 截取第一个 { 到最后一个 } 之间内容
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error('AI 返回的不是有效 JSON');
  }
}
