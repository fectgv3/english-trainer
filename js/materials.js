// 网络素材抓取：词库 / 例句库 / 语篇素材（带缓存，离线可用）
// 所有请求经本地 server.mjs 的 /api/fetch 转发（服务器端可走系统代理出网）。
// 数据源：
//   - 高中词汇表: github mahavivo/english-wordlists（jsDelivr CDN，含中文释义）
//   - 例句: Tatoeba (CC BY) https://tatoeba.org
//   - 语篇: Wikipedia REST API (CC BY-SA)

const MEM_CACHE = new Map();

// 经本地代理转发抓取文本；server 未启动时返回 null（降级不报错）
async function fetchTextViaProxy(url, ms = 10000) {
  if (MEM_CACHE.has(url)) return MEM_CACHE.get(url);
  try {
    const text = await Promise.race([
      fetch('/api/fetch?url=' + encodeURIComponent(url)).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('超时')), ms)),
    ]);
    MEM_CACHE.set(url, text);
    return text;
  } catch {
    return null;
  }
}

async function fetchJSONViaProxy(url, ms = 10000) {
  const text = await fetchTextViaProxy(url, ms);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ---------------- 词库 ---------------- */

// mahavivo/english-wordlists: COCA 20000 词频表（含中文释义）
// 文件格式：词条行 + 释义行 + "——————" 分隔线
const WORDLIST_URL =
  'https://cdn.jsdelivr.net/gh/mahavivo/english-wordlists@master/COCA_with_translation.txt';

let wordlistCache = null; // null=未加载, Map=已加载

export async function loadWordlist() {
  if (wordlistCache) return wordlistCache;
  wordlistCache = new Map();
  const text = await fetchTextViaProxy(WORDLIST_URL, 15000);
  if (!text) return wordlistCache;

  const addWord = (w) => {
    if (!wordlistCache.has(w)) wordlistCache.set(w, '');
    return w;
  };
  const addMeaning = (w, m) => {
    m = m.trim();
    if (!w || !m) return;
    const prev = wordlistCache.get(w);
    wordlistCache.set(w, prev ? (prev + ' ' + m).slice(0, 150) : m.slice(0, 150));
  };
  // "单词 + 词性释义" 同行格式，如 "abandon vt. 遗弃"
  const WORD_MEANING_RE =
    /^([A-Za-z][A-Za-z'\- ]{0,30}?)\s+(?=(?:n|v|vt|vi|adj|adv|prep|conj|pron|art|aux|num|int|abbr)\.)(.+)$/;

  let last = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^[—\-\s]+$/.test(t)) continue; // 分隔线
    if (/^[A-Za-z][A-Za-z'\- ]{0,30}$/.test(t)) {
      last = addWord(t.toLowerCase()); // 纯词条行
      continue;
    }
    const wm = t.match(WORD_MEANING_RE);
    if (wm) {
      last = addWord(wm[1].trim().toLowerCase());
      addMeaning(last, wm[2]);
      continue;
    }
    addMeaning(last, t); // 纯释义行，归属最近词条
  }
  return wordlistCache;
}

/* ---------------- 例句库（Tatoeba） ---------------- */

export async function fetchTatoebaSentences(word, n = 2) {
  const url =
    `https://api.tatoeba.org/unstable/sentences?lang=eng&q=${encodeURIComponent(word)}` +
    `&sort=relevance&limit=${n}`;
  const data = await fetchJSONViaProxy(url, 8000);
  const rows = data?.data || [];
  return rows.slice(0, n).map((item) => ({ en: item.text, zh: '' }));
}

/* ---------------- 语篇素材（Wikipedia） ---------------- */

export async function fetchWikipedia(topic, n = 2) {
  const url =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=' +
    encodeURIComponent(topic) +
    `&srlimit=${n}`;
  const data = await fetchJSONViaProxy(url, 10000);
  const hits = data?.query?.search || [];
  return hits.slice(0, n).map((h) => ({
    title: h.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
    snippet: (h.snippet || '').replace(/<[^>]+>/g, ''),
  }));
}

/* ---------------- 汇总入口 ---------------- */

// 依据出题配置抓取素材，尽力而为：任一来源失败不影响整体
export async function fetchWebMaterials(cfg) {
  const { words, topic, types } = cfg;
  const materials = [];

  // 1) 维基百科语篇（用于阅读理解 / 完形）
  if (topic) {
    const pages = await fetchWikipedia(topic, 2);
    pages.forEach((p) => materials.push({ ...p, source: 'Wikipedia (CC BY-SA)', kind: 'passage' }));
  }

  // 2) 词库中匹配的释义（用于词汇题）
  if (words && words.length) {
    const dict = await loadWordlist();
    if (dict.size) {
      const found = words
        .map((w) => w.toLowerCase().trim())
        .filter((w) => dict.has(w))
        .slice(0, 8)
        .map((w) => ({ word: w, meaning: dict.get(w) }));
      if (found.length) {
        materials.push({ kind: 'wordlist', source: 'mahavivo/english-wordlists (GitHub)', items: found });
      }
    }
  }

  // 3) 例句（翻译题 / 词形题参考）
  if (words?.length && (types?.includes('translation') || types?.includes('word'))) {
    const sents = await fetchTatoebaSentences(words[0], 2);
    if (sents.length) {
      materials.push({ kind: 'sentences', source: 'Tatoeba (CC BY)', items: sents });
    }
  }

  return materials;
}
