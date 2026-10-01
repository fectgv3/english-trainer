// 应用入口
import { initGenerateView } from './views/generate.js';
import { initPracticeView, renderPractice } from './views/practice.js';
import { initEssayView, renderEssay } from './views/essay.js';
import { initWrongView, renderWrongBook } from './views/wrong.js';
import { initSettingsView } from './views/settings.js';
import { startProxyProbe } from './proxy-status.js';
import { store } from './storage.js';

const VIEWS = {
  generate: initGenerateView,
  practice: renderPractice,
  essay: renderEssay,
  wrong: renderWrongBook,
};

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  const target = document.getElementById(`view-${name}`);
  if (!target) return;
  target.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  VIEWS[name]?.();
  store.set('lastView', name);
}

function initNav() {
  document.querySelectorAll('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => showView(b.dataset.view))
  );
}

function init() {
  initNav();
  initGenerateView();
  initPracticeView();
  initEssayView();
  initWrongView();
  initSettingsView();
  startProxyProbe();
  renderWrongBook(); // 初始化顶栏错题角标
  showView(store.get('lastView', 'generate'));
}

document.addEventListener('DOMContentLoaded', init);
