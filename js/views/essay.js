// 写作页：生成作文题 → 作文输入 → AI 批改 → 历史记录
import { ESSAY_GENRES } from '../constants.js';
import { getSettings } from '../config.js';
import { generateEssayPrompt, gradeEssay, saveEssayHistory, getEssayHistory } from '../essay.js';
import { getLastUsage } from '../ai.js';
import { DEMO_ESSAY } from '../demo.js';
import { store } from '../storage.js';

const $ = (id) => document.getElementById(id);

let essayMeta = null; // 当前作文题

export function initEssayView() {
  $('essay-gen-form').addEventListener('submit', onGenerate);
  $('essay-form').addEventListener('submit', onSubmit);
  $('essay-text').addEventListener('input', () => {
    const words = countWords($('essay-text').value);
    $('essay-words').textContent = `已写 ${words} 词`;
  });
}

export function renderEssay() {
  essayMeta = store.get('currentEssayMeta', null);
  if (essayMeta) renderPrompt(essayMeta);
  renderHistory();
}

function countWords(s) {
  const en = String(s || '').trim();
  if (!en) return 0;
  return en.split(/\s+/).filter(Boolean).length;
}

function onGenerate(e) {
  e.preventDefault();
  const st = $('essay-status');
  const btn = $('essay-gen-submit');
  const genre = $('essay-genre').value;
  const topic = $('essay-topic').value.trim();
  const words = $('essay-words-input').value.split(/[,，;；、\s]+/).map((w) => w.trim()).filter(Boolean).slice(0, 10);

  st.className = 'status';
  btn.disabled = true;
  (async () => {
    try {
      let meta;
      if (getSettings().demo) {
        st.textContent = '演示模式：加载内置作文题…';
        await new Promise((r) => setTimeout(r, 500));
        meta = {
          title: '给外国朋友介绍你的学校生活（应用文 · 书信）',
          genre: '应用文', maxScore: 15,
          points: ['介绍课程与社团', '描述一次印象深刻的活动', '表达欢迎与期待'],
          opening: 'Dear Chris,\nI\'m glad to hear that you\'re coming to study in China.',
          wordLimit: '80-120 词',
        };
      } else {
        st.textContent = '正在生成作文题…';
        meta = await generateEssayPrompt({ genre, topic, words });
      }
      essayMeta = meta;
      store.set('currentEssayMeta', meta);
      renderPrompt(meta);
      st.textContent = '✅ 作文题已生成，开始写作吧！';
      st.className = 'status ok';
    } catch (err) {
      st.textContent = '❌ ' + err.message;
      st.className = 'status err';
    } finally {
      btn.disabled = false;
    }
  })();
}

function renderPrompt(meta) {
  const box = $('essay-prompt-box');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="essay-prompt">
      <div class="title">${escapeHTML(meta.title)}</div>
      <div><span class="pill">${escapeHTML(meta.genre)}</span> <span class="pill">满分 ${escapeHTML(meta.maxScore)} 分</span> <span class="pill">${escapeHTML(meta.wordLimit)}</span></div>
      <ul>${(meta.points || []).map((p) => `<li>${escapeHTML(p)}</li>`).join('')}</ul>
      ${meta.opening ? `<div class="opening">${escapeHTML(meta.opening)}</div>` : ''}
    </div>`;
}

async function onSubmit(e) {
  e.preventDefault();
  const st = $('essay-status');
  const btn = $('essay-submit');
  const text = $('essay-text').value.trim();
  if (!essayMeta) {
    st.textContent = '请先生成作文题。';
    st.className = 'status err';
    return;
  }
  if (countWords(text) < 10) {
    st.textContent = '作文太短了，先写多一点再提交。';
    st.className = 'status err';
    return;
  }
  st.className = 'status';
  btn.disabled = true;
  try {
    let fb;
    if (getSettings().demo) {
      st.textContent = '演示模式：加载内置批改结果…';
      await new Promise((r) => setTimeout(r, 800));
      fb = DEMO_ESSAY;
    } else {
      st.textContent = 'AI 批改中，请稍候…';
      fb = await gradeEssay(essayMeta, text);
    }
    renderFeedback(fb);
    saveEssayHistory({ meta: essayMeta, text, feedback: fb });
    renderHistory();
    const u = getLastUsage();
    const usageText = u ? `（消耗 ${u.total_tokens} tokens）` : '';
    st.textContent = `✅ 批改完成，已存入历史${usageText}。`;
    st.className = 'status ok';
  } catch (err) {
    st.textContent = '❌ ' + err.message;
    st.className = 'status err';
  } finally {
    btn.disabled = false;
  }
}

function renderFeedback(fb) {
  const box = $('essay-feedback');
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="feedback">
      <div class="score-big">${fb.score}<small> / ${fb.maxScore} 分</small></div>
      <div class="dims">
        ${fb.dims.map((d) => `
          <div class="dim"><span>${escapeHTML(d.name)}：${d.score}/${d.max}</span>
          <div class="dim-bar"><i style="width:${Math.round((d.score / (d.max || 5)) * 100)}%"></i></div></div>`).join('')}
      </div>
      ${fb.corrections?.length ? `
      <h3>逐句修改</h3>
      ${fb.corrections.map((c) => `
        <div class="correction">
          <div><span class="orig">${escapeHTML(c.orig)}</span> → <span class="fixed">${escapeHTML(c.fixed)}</span></div>
          <div class="note">${escapeHTML(c.note)}</div>
        </div>`).join('')}` : ''}
      ${fb.improved ? `<h3>润色范文</h3><div class="improved">${escapeHTML(fb.improved)}</div>` : ''}
      ${fb.comments?.length ? `<h3>评语</h3><ul>${fb.comments.map((c) => `<li>${escapeHTML(c)}</li>`).join('')}</ul>` : ''}
    </div>`;
}

function renderHistory() {
  const hist = getEssayHistory();
  const box = $('essay-history');
  box.innerHTML = '';
  if (!hist.length) {
    box.innerHTML = '<div class="empty">暂无作文历史</div>';
    return;
  }
  for (const item of hist.slice(0, 10)) {
    const div = document.createElement('div');
    div.className = 'hist-item';
    div.innerHTML = `<span>${escapeHTML(item.meta?.title || '作文')}</span>
      <span>${new Date(item.time).toLocaleString()} · ${item.feedback?.score ?? '?'}分</span>`;
    div.addEventListener('click', () => {
      renderPrompt(item.meta || {});
      $('essay-text').value = item.text || '';
      renderFeedback(item.feedback);
    });
    box.appendChild(div);
  }
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
