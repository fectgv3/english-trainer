// 出题引擎：AI 提示词构造 → 出题 → JSON 解析 → 展平为统一题目列表
// Token 优化：提示词紧凑、阅读题共用短文只输出一次、解析/提示限字数
import { chatJSON } from './ai.js';
import { fetchWebMaterials } from './materials.js';

const TYPE_LABELS = {
  cloze: '词句填空选择',
  grammar: '语法单选',
  word: '词形/拼写',
  reading: '阅读理解',
  translation: '句子翻译',
};

function buildPrompt(cfg) {
  const { types, counts, words, grammar, topic } = cfg;
  const lines = [];
  lines.push('你是高中英语命题专家，出高考难度练习题，每题唯一正确答案。只输出JSON，格式：');
  lines.push(
    '{"questions":[{"type":"cloze|grammar|word|reading|translation",' +
    '"stem":"题干，空处用______",' +
    '"passage":"仅reading：英语短文；多篇阅读共用一篇时只写在第一题，其余为空",' +
    '"options":["A项","B项","C项","D项"],' +
    '"answer":"选择题填A/B/C/D；word填单词；translation填参考译文",' +
    '"answers":["word/translation题的其他可接受答案，如词形变化、同义表达，无则空数组"],' +
    '"explain":"中文解析≤50字，含考点与干扰项分析",' +
    '"hint":"中文提示≤25字，不露答案",' +
    '"vocab":["重点词1","重点词2"]}]}'
  );
  lines.push('word/translation题options为[]。各题型数量：' +
    types.map((t) => `${TYPE_LABELS[t] || t}×${counts[t] || 0}`).join('，') + '。');
  if (words?.length) lines.push(`重点词汇：${words.join('、')}（考查拼写、搭配、辨析或用法）。`);
  if (grammar?.length) lines.push(`语法范围：${grammar.join('、')}。`);
  if (topic) lines.push(`语篇主题：${topic}。`);
  if (cfg.materials?.length) {
    lines.push('参考资料（融入语境，勿照抄）：');
    for (const m of cfg.materials) {
      if (m.kind === 'passage') {
        lines.push(`- ${m.title}: ${(m.snippet || '').slice(0, 200)}`);
      } else if (m.kind === 'wordlist') {
        lines.push(`- 词义: ${(m.items || []).map((w) => `${w.word}=${w.meaning}`).join(';').slice(0, 300)}`);
      } else if (m.kind === 'sentences') {
        lines.push(`- 例句: ${(m.items || []).map((s) => s.en).join(' / ').slice(0, 200)}`);
      }
    }
  }
  return lines.join('\n');
}

function normalizeQ(q, idx) {
  const type = q.type || 'grammar';
  const isChoice = type === 'cloze' || type === 'grammar' || type === 'reading';
  const out = {
    id: `q${idx + 1}`,
    type,
    stem: (q.stem || '').trim(),
    passage: (q.passage || '').trim(),
    options: Array.isArray(q.options) ? q.options : [],
    answer: (q.answer ?? '').toString().trim(),
    answers: Array.isArray(q.answers) ? q.answers.map((a) => String(a).trim()).filter(Boolean) : [],
    explain: (q.explain || '').trim(),
    hint: (q.hint || '').trim(),
    vocab: Array.isArray(q.vocab) ? q.vocab : [],
  };
  if (isChoice) {
    // 统一选项为 4 个，答案转为字母
    while (out.options.length < 4) out.options.push('');
    out.options = out.options.slice(0, 4);
    const ans = out.answer.trim().toUpperCase();
    out.answer = /^[A-D]$/.test(ans) ? ans : 'A';
  }
  return out;
}

// 主入口：cfg = { types, counts, words, grammar, topic, includeWeb }
export async function generateQuiz(cfg) {
  let materials = [];
  if (cfg.includeWeb) {
    try { materials = await fetchWebMaterials(cfg); } catch { materials = []; }
  }
  const prompt = buildPrompt({ ...cfg, materials });
  const data = await chatJSON(
    [{ role: 'user', content: prompt }],
    { temperature: 0.8, maxTokens: 4000 }
  );
  const rawList = Array.isArray(data.questions) ? data.questions : [];
  if (!rawList.length) throw new Error('AI 未返回任何题目，请重试');

  // 展平 + 阅读短文继承：共用短文时只出现一次，后面题自动补上
  const questions = [];
  let lastPassage = '';
  for (const q of rawList) {
    const nq = normalizeQ(q, questions.length);
    if (nq.type === 'reading') {
      if (!nq.passage && lastPassage) nq.passage = lastPassage;
      if (nq.passage) lastPassage = nq.passage;
    }
    questions.push(nq);
  }
  return { questions, materials };
}
