// 错题本：自动收录答错的题，支持重练、删除与清空
import { store } from './storage.js';

export function addWrongQuestion(entry) {
  const list = store.get('wrongBook', []);
  // 同一题干去重，保留最近一次错误
  const filtered = list.filter((e) => e.stem !== entry.stem);
  filtered.unshift({ ...entry, wrongAt: Date.now() });
  store.set('wrongBook', filtered.slice(0, 200));
}

export function getWrongBook() {
  return store.get('wrongBook', []);
}

export function removeWrongQuestion(stem) {
  const list = getWrongBook().filter((e) => e.stem !== stem);
  store.set('wrongBook', list);
}

export function clearWrongBook() {
  store.set('wrongBook', []);
}

// 把错题本还原成一套可作答的试卷（题目字段与出题引擎保持一致）
export function buildRetryQuiz() {
  const questions = getWrongBook().map((e, i) => ({
    id: `w${i + 1}`,
    type: e.type || 'grammar',
    stem: e.stem,
    passage: e.passage || '',
    options: e.options || [],
    answer: e.answer,
    answers: e.answers || [],
    explain: e.explain || '',
    hint: '',
    vocab: [],
  }));
  return { questions, materials: [] };
}
