// 错题本视图
import { TYPE_LABELS, LETTERS } from '../constants.js';
import {
  getWrongBook,
  removeWrongQuestion,
  clearWrongBook,
  buildRetryQuiz,
} from '../workbook.js';
import { store } from '../storage.js';

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const $ = (id) => document.getElementById(id);

const VERDICT_TEXT = { partial: '部分正确', wrong: '错误', right: '正确' };

export function initWrongView() {
  $('wrong-clear').addEventListener('click', () => {
    if (confirm('确定清空全部错题吗？')) {
      clearWrongBook();
      renderWrongBook();
    }
  });

  // 用错题本生成一套重练卷，跳到练习页作答
  $('wrong-retry').addEventListener('click', () => {
    const list = getWrongBook();
    if (!list.length) return;
    if (!confirm(`用这 ${list.length} 道错题生成一套重练卷？当前试卷会被替换。`)) return;
    store.set('currentQuiz', { ...buildRetryQuiz(), meta: { retry: true, createdAt: Date.now() } });
    document.querySelector('.nav-btn[data-view="practice"]')?.click();
  });
}

export function renderWrongBook() {
  const list = getWrongBook();
  const box = $('wrong-list');
  box.innerHTML = '';
  // 顶栏角标
  const badge = $('wrong-count');
  if (badge) {
    badge.textContent = String(list.length);
    badge.classList.toggle('hidden', !list.length);
  }
  const retryBtn = $('wrong-retry');
  if (retryBtn) retryBtn.disabled = !list.length;

  if (!list.length) {
    box.innerHTML = '<div class="empty">错题本是空的，快去练习吧！答错的题会自动收进来。</div>';
    return;
  }
  for (const item of list) {
    box.appendChild(renderItem(item));
  }
}

function renderItem(item) {
  const div = document.createElement('div');
  div.className = 'wrong-item';
  const isChoice = item.options && item.options.length > 0;
  const letters = isChoice
    ? `<div class="explain-src">${item.options.map((o, i) => `${LETTERS[i]}. ${escapeHTML(o)}`).join('　')}</div>`
    : '';
  // 上次作答情况（自评或 AI 判定）
  const mine = item.userAnswer
    ? `<div><b>你的答案：</b>${escapeHTML(item.userAnswer)}</div>`
    : '<div><b>你的答案：</b><span class="muted">（未作答）</span></div>';
  const verdict = item.verdict
    ? `<span class="pill">上次：${VERDICT_TEXT[item.verdict] || escapeHTML(item.verdict)}</span>`
    : '';
  const aiComment = item.comment
    ? `<div class="ai-comment">AI 点评：${escapeHTML(item.comment)}</div>`
    : '';
  const answerLabel = isChoice && /^[A-D]$/i.test(item.answer)
    ? `${item.answer}. ${escapeHTML(item.options[item.answer.toUpperCase().charCodeAt(0) - 65] || '')}`
    : escapeHTML(item.answer);

  div.innerHTML = `
    <div class="meta"><span class="pill">${TYPE_LABELS[item.type] || item.type}</span>
      ${verdict}
      <span>${new Date(item.wrongAt).toLocaleString()}</span>
      <button class="btn small danger">移除</button></div>
    <div class="stem">${escapeHTML(item.stem)}</div>
    ${letters}
    ${mine}
    <div><b>答案：</b>${answerLabel}</div>
    <div class="explain-body">${escapeHTML(item.explain || '')}</div>
    ${aiComment}`;
  div.querySelector('button').addEventListener('click', () => {
    removeWrongQuestion(item.stem);
    renderWrongBook();
  });
  return div;
}
