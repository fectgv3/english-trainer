// 出题页：收集自定义范围 → 抓网络素材 → AI 出题（或演示数据）
import { TYPE_LABELS, GRAMMAR_POINTS } from '../constants.js';
import { getSettings } from '../config.js';
import { generateQuiz } from '../engine.js';
import { getLastUsage } from '../ai.js';
import { DEMO_QUIZ } from '../demo.js';
import { store } from '../storage.js';

const $ = (id) => document.getElementById(id);

const DEFAULT_COUNTS = { cloze: 5, grammar: 5, word: 3, reading: 2, translation: 2 };

export function initGenerateView() {
  renderTypeChips();
  renderGrammarChips();
  renderCountInputs();
  $('gen-form').addEventListener('submit', onSubmit);
}

function renderCountInputs() {
  const box = $('count-box');
  box.innerHTML = '';
  for (const [key, label] of Object.entries(TYPE_LABELS)) {
    const lab = document.createElement('label');
    lab.className = 'chip';
    lab.innerHTML = `${label} <input id="count-${key}" type="number" min="0" max="10" value="${DEFAULT_COUNTS[key] ?? 2}" style="width:56px;padding:2px 6px;margin-left:6px">`;
    box.appendChild(lab);
  }
}

function renderTypeChips() {
  const box = $('type-chips');
  box.innerHTML = '';
  for (const [key, label] of Object.entries(TYPE_LABELS)) {
    const lab = document.createElement('label');
    lab.className = 'chip';
    const checked = key === 'cloze' || key === 'grammar' ? 'checked' : '';
    lab.innerHTML = `<input type="checkbox" value="${key}" ${checked}>${label}`;
    box.appendChild(lab);
  }
}

function renderGrammarChips() {
  const box = $('grammar-chips');
  box.innerHTML = '';
  for (const name of GRAMMAR_POINTS) {
    const lab = document.createElement('label');
    lab.className = 'chip';
    lab.innerHTML = `<input type="checkbox" value="${name}">${name}`;
    box.appendChild(lab);
  }
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function renderMaterials(materials) {
  const box = $('gen-materials');
  if (!box) return;
  box.innerHTML = '';
  if (!materials || !materials.length) {
    box.innerHTML = '<div class="empty">未启用网络素材，或素材源暂不可用（不影响出题）</div>';
    return;
  }
  for (const m of materials) {
    const div = document.createElement('div');
    div.className = 'chip-src';
    if (m.kind === 'passage') {
      div.innerHTML = `<a href="${m.url || '#'}" target="_blank" rel="noopener">${escapeHTML(m.title)}</a> <span class="pill">${escapeHTML(m.source)}</span><div class="snippet">${escapeHTML(m.snippet || '')}</div>`;
    } else if (m.kind === 'wordlist') {
      const words = m.items.map((w) => `<b>${escapeHTML(w.word)}</b> ${escapeHTML(w.meaning)}`).join('；');
      div.innerHTML = `<span class="pill">词库匹配</span> ${words} <span class="pill">${escapeHTML(m.source)}</span>`;
    } else if (m.kind === 'sentences') {
      const sents = m.items.map((s) => s.zh ? `${escapeHTML(s.en)} <i>(${escapeHTML(s.zh)})</i>` : escapeHTML(s.en)).join(' / ');
      div.innerHTML = `<span class="pill">例句</span> ${sents} <span class="pill">${escapeHTML(m.source)}</span>`;
    }
    box.appendChild(div);
  }
}

function splitWords(s) {
  return s.split(/[,，;；、\s]+/).map((w) => w.trim()).filter(Boolean).slice(0, 30);
}

async function onSubmit(e) {
  e.preventDefault();
  const st = $('gen-status');
  const btn = $('gen-submit');
  const types = [...document.querySelectorAll('#type-chips input:checked')].map((el) => el.value);

  const counts = {};
  let total = 0;
  for (const t of types) {
    const input = $('count-' + t);
    const n = Math.max(0, Math.min(10, parseInt(input ? input.value : '0', 10) || 0));
    counts[t] = n;
    total += n;
  }
  if (!total) {
    st.textContent = '请至少选择一种题型并设置题数。';
    st.className = 'status err';
    return;
  }

  const cfg = {
    types,
    counts,
    words: splitWords($('gen-words').value),
    grammar: [...document.querySelectorAll('#grammar-chips input:checked')].map((el) => el.value),
    topic: $('gen-topic').value.trim(),
    includeWeb: $('gen-web').checked,
  };

  st.className = 'status';
  btn.disabled = true;
  try {
    let quiz;
    if (getSettings().demo) {
      st.textContent = '演示模式：加载内置示例题…';
      await new Promise((r) => setTimeout(r, 600));
      quiz = { ...DEMO_QUIZ };
    } else {
      st.textContent = cfg.includeWeb ? '正在抓取网络素材 + 调用 AI 出题…' : '正在调用 AI 出题…';
      quiz = await generateQuiz(cfg);
    }
    store.set('currentQuiz', { ...quiz, meta: { cfg, createdAt: Date.now() } });
    const u = getLastUsage();
    const usageText = u ? `，消耗 ${u.total_tokens} tokens（入 ${u.prompt_tokens} / 出 ${u.completion_tokens}）` : '';
    st.textContent = `✅ 出题完成，共 ${quiz.questions.length} 题${usageText}。请到顶部「开始练习」作答。`;
    st.className = 'status ok';
    renderMaterials(quiz.materials || []);
  } catch (err) {
    st.textContent = '❌ ' + err.message;
    st.className = 'status err';
  } finally {
    btn.disabled = false;
  }
}
