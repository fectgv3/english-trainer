#!/usr/bin/env node
// 本地开发服务器：静态托管 english-trainer + AI 接口代理（避免浏览器 CORS）
// 用法：node server.mjs   →  http://localhost:5175
// 无任何第三方依赖，Node 18+ 自带 fetch。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = __dirname;
const envPort = Number(process.env.PORT);
const PORT = Number.isInteger(envPort) && envPort > 0 ? envPort : 5175;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5 * 1024 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// 简单内存限流：每分钟每 IP 最多 60 次 AI 调用
const hits = new Map();
function rateLimit(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length <= 60;
}

// 解析并校验 x-api-key / x-api-base（/api/chat 与 /api/models 共用）
// 出错时已自行回复，返回 null
function resolveUpstream(req, res) {
  const auth = req.headers['x-api-key'];
  if (!auth || !auth.startsWith('Bearer ')) {
    send(res, 401, JSON.stringify({ error: '缺少 API Key（x-api-key 头）' }));
    return null;
  }
  const baseRaw = req.headers['x-api-base'] || 'https://api.openai.com/v1';
  let base;
  try {
    base = new URL(baseRaw);
    if (!/^https?:$/.test(base.protocol)) throw new Error('bad protocol');
  } catch {
    send(res, 400, JSON.stringify({ error: 'API Base 无效' }));
    return null;
  }
  return { auth, origin: base.origin + base.pathname.replace(/\/+$/, '') };
}

const server = http.createServer(async (req, res) => {
  // 便于本地调试时观察请求（如需静默可注释掉）
  if (req.url.startsWith('/api/') && req.method !== 'GET') console.log(`[api] ${req.method} ${req.url}`);

  const u = new URL(req.url, `http://${req.headers.host}`);

  // ---- 健康检查 ----
  if (u.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, ts: Date.now(), proxy: Boolean(process.env.HTTPS_PROXY || process.env.HTTP_PROXY) }));
  }

  // ---- 网络素材抓取代理（Wikipedia / 词库 / 例句，服务器端走系统代理）----
  if (u.pathname === '/api/fetch' && req.method === 'GET') {
    const target = u.searchParams.get('url');
    let tURL;
    try {
      tURL = new URL(target || '');
      if (!/^https?:$/.test(tURL.protocol)) throw new Error();
      // 仅允许抓取公网地址，避免被用来探测内网/本机服务
      if (/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(tURL.hostname.toLowerCase())) {
        throw new Error();
      }
    } catch {
      return send(res, 400, JSON.stringify({ error: 'url 参数无效（仅支持公网 http/https 地址）' }));
    }
    try {
      const upstream = await fetch(tURL, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': 'EnglishTrainer/0.1 (local study tool)' },
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(text);
    } catch (e) {
      return send(res, 502, JSON.stringify({ error: `抓取失败：${e.message}` }));
    }
  }

  // ---- 可用模型列表代理（GET {API Base}/models，账号真实可用的模型，避免写死的名字过期）----
  if (u.pathname === '/api/models' && req.method === 'GET') {
    if (!rateLimit(req.socket.remoteAddress || '?')) {
      return send(res, 429, JSON.stringify({ error: '请求过于频繁，请稍后再试' }));
    }
    const up = resolveUpstream(req, res);
    if (!up) return;
    try {
      const upstream = await fetch(up.origin + '/models', {
        headers: { Authorization: up.auth },
        signal: AbortSignal.timeout(15000),
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(text);
    } catch (e) {
      return send(res, 502, JSON.stringify({ error: `拉取模型列表失败：${e.message}` }));
    }
  }

  // ---- AI 代理 ----
  if (u.pathname === '/api/chat' && req.method === 'POST') {
    if (!rateLimit(req.socket.remoteAddress || '?')) {
      return send(res, 429, JSON.stringify({ error: '请求过于频繁，请稍后再试' }));
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, JSON.stringify({ error: 'invalid JSON body' }));
    }
    const up = resolveUpstream(req, res);
    if (!up) return;
    const target = up.origin + '/chat/completions';
    const auth = up.auth;

    try {
      const upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
        },
        body: JSON.stringify(body),
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(text);
    } catch (e) {
      return send(res, 502, JSON.stringify({ error: `转发失败：${e.message}` }));
    }
  }

  // ---- 静态文件 ----
  let rel = decodeURIComponent(u.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'forbidden', 'text/plain');
  }
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`❌ 端口 ${PORT} 已被占用：可能是上一次的服务仍在运行。`);
    console.error('   可先关闭旧窗口，或用 PORT=5176 node server.mjs 换一个端口。');
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, HOST, () => {
  const proxyOn = Boolean(process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
  console.log(`✅ 高中英语 AI 训练场已启动: http://localhost:${PORT}`);
  console.log(`   - 出网代理: ${proxyOn ? process.env.HTTPS_PROXY || process.env.HTTP_PROXY : '未设置（直连）'}`);
  console.log('   - AI 代理: POST /api/chat · 模型列表: GET /api/models（头: x-api-key, x-api-base）');
  console.log('   - 素材代理: GET /api/fetch?url=');
  console.log('   - 用 Ctrl+C 停止服务');
});
