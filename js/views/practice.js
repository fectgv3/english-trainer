// 练习页：作答、提示、判分解析、错题自动入本
// 判分策略：选择题/单词题本地判；翻译等开放题先本地比对，不等价则 AI 批改（一次批量调用）或自评（对1/部分0.5/错0）
import { TYPE_LABELS, LETTERS } from '../constants.js';
import { addWrongQuestion } from '../workbook.js';
import { renderWrongBook } from './wrong.js';
import { chatJSON, getLastUsage } from '../ai.js';
import { getSettings } from '../config.js';
import { store } from '../storage.js';

const $ = (id) => document.getElementById(id);

const state = { quiz: null, answers: {}, graded: false, verdicts: {} };

export function initPracticeView() {
  // 列表在每次切换到练习页时由 renderPractice 重建
}

export function renderPractice() {
  state.quiz = store.get('currentQuiz', null);
  state.answers = {};
  state.graded = false;
  state.verdicts = {};
  render();
}

function render() {
  const box = $('question-list');
  const head = $('practice-head');
  box.innerHTML = '';
  head.innerHTML = '';
  const quiz = state.quiz;

  if (!quiz || !quiz.questions?.length) {
    head.innerHTML = '<h2>开始练习</h2>';
    box.innerHTML = '<div class="empty">还没有试卷。先到「AI 出题」生成一套题，或开启演示模式体验。</div>';
    return;
  }

  head.innerHTML = `<h2>开始练习</h2><span id="quiz-meta">共 ${quiz.questions.length} 题 · ${escapeHTML(summarize(quiz))}</span>`;
  for (const q of quiz.questions) {
    box.appendChild(renderQuestion(q));
  }
  const submit = document.createElement('button');
  submit.className = 'btn primary';
  submit.id = 'grade-btn';
  submit.textContent = '交卷判分';
  submit.addEventListener('click', gradeAll);
  box.appendChild(submit);
}

function summarize(quiz) {
  const parts = {};
  for (const q of quiz.questions) parts[q.type] = (parts[q.type] || 0) + 1;
  return Object.entries(parts).map(([t, n]) => `${TYPE_LABELS[t] || t}×${n}`).join(' · ');
}

function renderQuestion(q) {
  const card = document.createElement('div');
  card.className = 'q-card';
  card.dataset.qid = q.id;
  const isChoice = q.type === 'cloze' || q.type === 'grammar' || q.type === 'reading';
  const head = document.createElement('div');
  head.className = 'q-head';
  head.innerHTML = `<span class="q-no">${q.id.match(/\d+/)?.[0] || '?'}</span>
    <span class="q-type">${TYPE_LABELS[q.type] || q.type}</span>`;
  card.appendChild(head);

  if (q.hint) {
    const hintBtn = document.createElement('button');
    hintBtn.className = 'btn small';
    hintBtn.textContent = '看提示';
    hintBtn.addEventListener('click', () => {
      const old = card.querySelector('.hint');
      if (old) { old.remove(); return; }
      const h = document.createElement('div');
      h.className = 'hint';
      h.textContent = '💡 ' + q.hint;
      card.insertBefore(h, card.querySelector('.feedback-slot'));
    });
    head.appendChild(hintBtn);
  }

  if (q.passage) {
    const p = document.createElement('div');
    p.className = 'passage';
    p.innerHTML = `<span class="passage-tag">阅读短文</span>${escapeHTML(q.passage)}`;
    card.appendChild(p);
  }

  const stem = document.createElement('div');
  stem.className = 'q-stem';
  stem.textContent = q.stem;
  card.appendChild(stem);

  if (isChoice && q.options?.length) {
    const opts = document.createElement('div');
    opts.className = 'options';
    q.options.forEach((opt, i) => {
      const label = document.createElement('label');
      label.className = 'option';
      const letter = LETTERS[i];
      label.innerHTML = `<input type="radio" name="${q.id}" value="${letter}"><span><b>${letter}.</b> ${escapeHTML(opt)}</span>`;
      label.querySelector('input').addEventListener('change', () => { state.answers[q.id] = letter; });
      opts.appendChild(label);
    });
    card.appendChild(opts);
  } else {
    const ta = document.createElement('textarea');
    ta.className = 'text-area';
    ta.rows = q.type === 'word' ? 1 : 3;
    ta.placeholder = q.type === 'word' ? '输入单词' : '输入你的答案 / 译文';
    ta.addEventListener('input', () => { state.answers[q.id] = ta.value; });
    card.appendChild(ta);
  }

  const feedback = document.createElement('div');
  feedback.className = 'feedback-slot';
  card.appendChild(feedback);
  return card;
}

/* ---------------- 判分 ---------------- */

// 本地判定：'right' | 'wrong' | 'open'（开放题需 AI 或自评）
function judgeLocal(q, ans) {
  const isChoice = q.type === 'cloze' || q.type === 'grammar' || q.type === 'reading';
  if (isChoice) return ans.toUpperCase() === q.answer.toUpperCase() ? 'right' : 'wrong';
  if (q.type === 'word') {
    const candidates = [q.answer, ...(q.answers || [])].map((a) => normalize(a));
    return candidates.includes(normalize(ans)) ? 'right' : 'wrong';
  }
  // translation：与参考译文一致才算对，否则开放评定
  return normalizeWords(ans) === normalizeWords(q.answer) ? 'right' : 'open';
}

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
}

// 译文比对：忽略大小写、标点、空白
function normalizeWords(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const VERDICT_SCORE = { right: 1, partial: 0.5, wrong: 0 };
const VERDICT_LABEL = { right: '✓ 正确', partial: '◐ 部分正确', wrong: '✗ 错误', open: '待评定' };

async function gradeAll() {
  if (state.graded) return;
  state.graded = true;
  $('grade-btn').disabled = true;

  const quiz = state.quiz;
  for (const q of quiz.questions) {
    const card = document.querySelector(`.q-card[data-qid="${q.id}"]`);
    const ans = (state.answers[q.id] || '').trim();
    const v = judgeLocal(q, ans);
    card.classList.add('graded');

    if (v === 'open') {
      showOpenJudge(q, ans, card);
    } else {
      setVerdict(q, ans, v === 'right' ? 'right' : 'wrong', 'local', card);
    }
  }
  updateScoreLine();
  renderWrongBook();
}

// 开放题：渲染参考答案 + AI 批改 + 自评按钮
function showOpenJudge(q, ans, card) {
  const slot = card.querySelector('.feedback-slot');
  const answerText = q.answer + (q.answers?.length ? ` / ${q.answers.join(' / ')}` : '');
  slot.innerHTML = `
    <div class="explain">
      <div><b>参考答案：</b>${escapeHTML(answerText)}</div>
      <div class="explain-body">${escapeHTML(q.explain || '')}</div>
    </div>
    <div class="judge-row" data-qid="${q.id}">
      <span class="pill">开放题 · ${VERDICT_LABEL.open}</span>
      <span>自评：</span>
      <button class="btn small" data-v="right">✓ 对（1分）</button>
      <button class="btn small" data-v="partial">◐ 部分（0.5）</button>
      <button class="btn small" data-v="wrong">✗ 错（0分）</button>
    </div>`;
  slot.querySelector('.judge-row').querySelectorAll('button[data-v]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setVerdict(q, ans, btn.dataset.v, 'self', card);
      updateScoreLine();
      renderWrongBook();
    });
  });
}

// AI 批改全部开放题（一次批量调用）
export async function aiGradeOpen() {
  const s = getSettings();
  const pending = state.quiz.questions.filter((q) => {
    const v = state.verdicts[q.id];
    return judgeLocal(q, (state.answers[q.id] || '').trim()) === 'open' && (!v || v.source !== 'ai');
  });
  if (!pending.length) return;
  const lines = pending.map((q) => {
    const ans = (state.answers[q.id] || '').trim();
    return `${q.id} [${q.type}] ${q.stem.slice(0, 80)} | 参考:${q.answer} | 学生:${ans.slice(0, 200) || '（空）'}`;
  });
  const prompt = [
    '判断这些高中英语答题是否正确，只输出JSON：',
    '{"results":[{"id":"题目id","verdict":"right|partial|wrong","comment":"中文点评≤30字"}]}',
    'right=与参考答案等价或正确；partial=部分正确/有小错（拼写、时态、缺要点）；wrong=错误或未答。',
    '逐题：',
    ...lines,
  ].join('\n');
  try {
    const data = await chatJSON([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 1200 });
    for (const r of data.results || []) {
      const q = pending.find((x) => x.id === r.id);
      if (!q) continue;
      const verdict = ['right', 'partial', 'wrong'].includes(r.verdict) ? r.verdict : 'wrong';
      const card = document.querySelector(`.q-card[data-qid="${q.id}"]`);
      setVerdict(q, (state.answers[q.id] || '').trim(), verdict, 'ai', card, r.comment || '');
    }
    updateScoreLine();
    renderWrongBook();
    return getLastUsage();
  } catch (err) {
    throw err;
  }
}

function setVerdict(q, userAnswer, verdict, source, card, aiComment = '') {
  state.verdicts[q.id] = { verdict, source, comment: aiComment };
  card.dataset.verdict = verdict;

  // 开放题：更新判定行
  const row = card.querySelector('.judge-row');
  if (row) {
    const pill = row.querySelector('.pill');
    if (pill) pill.textContent = `开放题 · ${source === 'ai' ? 'AI判：' : ''}${VERDICT_LABEL[verdict]}`;
    row.querySelectorAll('button[data-v]').forEach((b) =>
      b.classList.toggle('on', b.dataset.v === verdict));
    const old = card.querySelector('.ai-comment');
    if (old) old.remove();
    if (aiComment && aiComment !== 'local') {
      const c = document.createElement('div');
      c.className = 'ai-comment';
      c.textContent = `AI 点评：${aiComment}`;
      row.after(c);
    }
  }

  // 本地判定题：高亮选项/输入框 + 解析
  const isChoice = q.type === 'cloze' || q.type === 'grammar' || q.type === 'reading';
  if (isChoice) {
    const ans = (state.answers[q.id] || '').trim();
    card.querySelectorAll('.option').forEach((label) => {
      const input = label.querySelector('input');
      if (input.value === q.answer) label.classList.add('correct');
      if (input.value === ans && verdict === 'wrong') label.classList.add('wrong');
    });
  } else {
    const ta = card.querySelector('.text-area');
    if (ta) ta.classList.add(verdict === 'right' ? 'good' : verdict === 'partial' ? 'partial' : 'bad');
  }

  if (isChoice || q.type === 'word') {
    const slot = card.querySelector('.feedback-slot');
    const answerText = isChoice
      ? `${q.answer}. ${q.options[q.answer.charCodeAt(0) - 65] || ''}`
      : [q.answer, ...(q.answers || [])].filter(Boolean).join(' / ');
    slot.innerHTML = `
      <div class="explain">
        <div class="explain-head ${verdict === 'right' ? 'good' : 'badc'}">${verdict === 'right' ? '✓ 回答正确' : '✗ 回答错误'}</div>
        <div><b>答案：</b>${escapeHTML(answerText)}</div>
        <div class="explain-body">${escapeHTML(q.explain || '')}</div>
        ${q.vocab?.length ? `<div class="explain-src">重点词：${q.vocab.map(escapeHTML).join(' · ')}</div>` : ''}
      </div>`;
  } else {
    // 翻译等开放题：本地判对时还没渲染解析块，这里补上参考答案与解析
    const slot = card.querySelector('.feedback-slot');
    if (slot && !slot.querySelector('.explain')) {
      const answerText = [q.answer, ...(q.answers || [])].filter(Boolean).join(' / ');
      const block = document.createElement('div');
      block.className = 'explain';
      block.innerHTML = `
        <div class="explain-head ${verdict === 'right' ? 'good' : 'badc'}">${verdict === 'right' ? '✓ 回答正确' : '✗ 回答错误'}</div>
        <div><b>参考答案：</b>${escapeHTML(answerText)}</div>
        <div class="explain-body">${escapeHTML(q.explain || '')}</div>
        ${q.vocab?.length ? `<div class="explain-src">重点词：${q.vocab.map(escapeHTML).join(' · ')}</div>` : ''}`;
      slot.prepend(block);
    }
  }

  // 错题入本（部分正确也值得复习）
  if (verdict !== 'right' && !card.dataset.wrongSaved) {
    card.dataset.wrongSaved = '1';
    addWrongQuestion({
      type: q.type, stem: q.stem, passage: q.passage || '',
      options: q.options || [], answer: q.answer, answers: q.answers || [],
      explain: q.explain || '', userAnswer, verdict, comment: aiComment,
    });
  }
}

function updateScoreLine() {
  const quiz = state.quiz;
  let score = 0, done = 0, openPending = 0;
  for (const q of quiz.questions) {
    const local = judgeLocal(q, (state.answers[q.id] || '').trim());
    if (state.graded && local !== 'open') { score += local === 'right' ? 1 : 0; done += 1; continue; }
    const v = state.verdicts[q.id];
    if (v) { score += VERDICT_SCORE[v.verdict] ?? 0; done += 1; }
    else if (state.graded) openPending += 1;
  }
  const total = quiz.questions.length;
  const scoreText = Number.isInteger(score) ? score : score.toFixed(1);
  let bar = document.querySelector('.score-line');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'score-line';
    document.getElementById('practice-head').appendChild(bar);
  }
  const extra = openPending
    ? `；${openPending} 道开放题待评定（可自评或点下方「AI 批改开放题」）`
    : done === total ? '，全部已评定' : '';
  bar.innerHTML = `本次得分：${scoreText} / ${total}${escapeHTML(extra)}（错题已自动收进错题本）`;

  // AI 批改按钮（开放题存在且可调用 AI 时显示）
  const s = getSettings();
  const oldBtn = document.getElementById('ai-grade-btn');
  if (oldBtn) oldBtn.remove();
  if (openPending > 0 && !s.demo && s.apiKey) {
    const btn = document.createElement('button');
    btn.id = 'ai-grade-btn';
    btn.className = 'btn primary';
    btn.textContent = `AI 批改开放题（${openPending}）`;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'AI 批改中…';
      try {
        const u = await aiGradeOpen();
        const left = countPending();
        btn.textContent = left ? `AI 批改开放题（${left}）` : '';
        btn.disabled = left === 0;
        if (!left) btn.remove();
        if (u) appendUsageNote(u.total_tokens);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'AI 批改失败，重试';
      }
    });
    bar.after(btn);
  }
}

function countPending() {
  return state.quiz.questions.filter((q) => {
    const v = state.verdicts[q.id];
    return judgeLocal(q, (state.answers[q.id] || '').trim()) === 'open' && !v;
  }).length;
}

function appendUsageNote(tokens) {
  const btn = document.getElementById('ai-grade-btn');
  const note = document.createElement('span');
  note.className = 'pill';
  note.textContent = `本次消耗 ${tokens} tokens`;
  (btn || document.querySelector('.score-line')).after(note);
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
