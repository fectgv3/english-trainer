// localStorage 封装：所有本地数据（设置、错题本、作文历史）都存这里

const PREFIX = 'et.';

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      console.warn('localStorage 写入失败', e);
    }
  },
  remove(key) {
    localStorage.removeItem(PREFIX + key);
  },
};
