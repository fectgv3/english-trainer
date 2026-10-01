// 探测本地代理（server.mjs）是否在线，并刷新顶部状态胶囊
import { refreshModePill } from './config.js';

export function startProxyProbe() {
  const tick = () => {
    fetch('/api/health', { signal: AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined })
      .then((r) => r.ok)
      .then((ok) => refreshModePill(ok))
      .catch(() => refreshModePill(false));
  };
  tick();
  setInterval(tick, 15000);
}
