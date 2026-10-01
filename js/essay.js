// 写作批改：生成题目 → 提交作文 → AI 多维度评分反馈
import { chatJSON } from './ai.js';
import { store } from './storage.js';

/* ---------------- 出作文题 ---------------- */

export async function generateEssayPrompt(cfg) {
  const { genre, topic, words } = cfg;
  const max = { '应用文': 15, '议论文': 25, '读后续写': 25, '概要写作': 25 }[genre] || 15;
  const prompt = [
    `出高中英语「${genre}」写作题，满分${max}分，只输出JSON：`,
    '{"title":"题目要求一句话(中文)","points":["要点1","要点2","要点3"],' +
    '"opening":"英文开头一句；读后续写给原文，其余可为空","wordLimit":"如 80-120 词"}',
    topic ? `话题：${topic}。` : '话题贴近高中生生活。',
    words?.length ? `引导使用词汇：${words.join('、')}。` : '',
  ].filter(Boolean).join('\n');

  const data = await chatJSON([{ role: 'user', content: prompt }], { temperature: 0.7, maxTokens: 500 });
  return {
    title: data.title || `${genre}写作`,
    genre,
    maxScore: data.maxScore || max,
    points: Array.isArray(data.points) ? data.points : [],
    opening: data.opening || '',
    wordLimit: data.wordLimit || (genre === '应用文' ? '80-120 词' : '150 词左右'),
  };
}

/* ---------------- 批改 ---------------- */

const GRADE_PROMPT = [
  '按高考评分标准批改这篇高中英语作文，只输出JSON：',
  '{"score":总分,"maxScore":满分,',
  '"dims":[{"name":"内容要点","score":0,"max":5},{"name":"词汇语法","score":0,"max":5},{"name":"结构衔接","score":0,"max":5}],',
  '"corrections":[{"orig":"原句","fixed":"改后","note":"中文说明≤20字"}],',
  '"improved":"润色范文","comments":["评语≤30字","评语≤30字"]}',
  'corrections只列需要改的句子（最多6条），improved篇幅与原文相当。',
  '',
  '题目：{TITLE}',
  '要点：{POINTS}',
  '词数：{LIMIT}；开头：{OPENING}',
  '作文："""{ESSAY}"""',
].join('\n');

export async function gradeEssay(essayMeta, text) {
  const prompt = GRADE_PROMPT
    .replace('{TITLE}', essayMeta.title || '')
    .replace('{POINTS}', (essayMeta.points || []).join('；') || '无')
    .replace('{LIMIT}', essayMeta.wordLimit || '')
    .replace('{OPENING}', essayMeta.opening || '无')
    .replace('{ESSAY}', text.slice(0, 2000));

  const data = await chatJSON([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 2000 });

  return {
    score: Number(data.score) || 0,
    maxScore: Number(data.maxScore) || essayMeta.maxScore || 15,
    dims: Array.isArray(data.dims) ? data.dims : [],
    corrections: Array.isArray(data.corrections) ? data.corrections : [],
    improved: data.improved || '',
    comments: Array.isArray(data.comments) ? data.comments : [],
  };
}

/* ---------------- 历史 ---------------- */

export function saveEssayHistory(entry) {
  const hist = store.get('essayHistory', []);
  hist.unshift({ ...entry, time: Date.now() });
  store.set('essayHistory', hist.slice(0, 30));
}

export function getEssayHistory() {
  return store.get('essayHistory', []);
}
