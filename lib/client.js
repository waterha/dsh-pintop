window.__ModuleLoader__.load({
  id: 'dsh-pintop',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require('react');
    function PinTopButton({ wide } = {}) {
      const [enabled, setEnabled] = React.useState(null);
      const [pending, setPending] = React.useState(true);
      const [error, setError] = React.useState('');
      const state = React.useRef({ alive: false, busy: false, desired: null, confirmed: null, version: 0, lastRead: 0, controller: null });
      const request = React.useCallback(async (next) => {
        const s = state.current;
        const controller = new AbortController();
        s.controller = controller;
        const timer = setTimeout(() => controller.abort(), 35000);
        try {
          const response = await fetch('api/dsh-pintop', {
            method: typeof next === 'boolean' ? 'POST' : 'GET',
            credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            ...(typeof next === 'boolean' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: next }) } : {})
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
          if (typeof result.enabled !== 'boolean') throw new Error('服务未返回实际窗口状态');
          return result.enabled;
        } finally { clearTimeout(timer); if (s.controller === controller) s.controller = null; }
      }, []);
      const drain = React.useCallback(async () => {
        const s = state.current;
        if (s.busy || !s.alive) return;
        s.busy = true;
        setPending(true);
        try {
          while (s.alive && s.desired !== s.confirmed) {
            const target = s.desired;
            const version = s.version;
            try {
              s.confirmed = await request(target);
              if (!s.alive) return;
              setError('');
              // A response to an older click must never overwrite a newer intent.
              if (version === s.version) setEnabled(s.confirmed);
            } catch (err) {
              if (!s.alive) return;
              setError(err.message || '切换置顶失败');
              if (version === s.version) { s.desired = s.confirmed; setEnabled(s.confirmed); break; }
            }
          }
        } finally { s.busy = false; if (s.alive) setPending(false); }
      }, [request]);
      const refresh = React.useCallback(async () => {
        const s = state.current;
        if (!s.alive || s.busy) return;
        s.busy = true;
        s.lastRead = Date.now();
        const version = s.version;
        try {
          const actual = await request();
          if (!s.alive) return;
          s.confirmed = actual;
          if (version === s.version) { s.desired = actual; setEnabled(actual); }
          setError('');
        } catch (err) { if (s.alive) setError(err.message || '读取置顶状态失败'); }
        finally {
          s.busy = false;
          if (s.alive) { setPending(false); if (s.desired !== s.confirmed) void drain(); }
        }
      }, [request, drain]);
      React.useEffect(() => {
        const s = state.current;
        s.alive = true;
        void refresh();
        const onFocus = () => { if (Date.now() - s.lastRead > 10000) void refresh(); };
        window.addEventListener('focus', onFocus);
        return () => { s.alive = false; s.controller?.abort(); window.removeEventListener('focus', onFocus); };
      }, [refresh]);
      const toggle = () => {
        const s = state.current;
        if (s.desired === null) { void refresh(); return; }
        s.desired = !s.desired;
        s.version++;
        setEnabled(s.desired);
        setError('');
        void drain();
      };
      const label = enabled === true ? '取消置顶' : '窗口置顶';
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: 4 } },
        React.createElement('button', {
          type: 'button', disabled: enabled === null && pending,
          'aria-pressed': enabled === true, 'aria-busy': pending, 'aria-label': label,
          'data-dsh-pintop': '', onClick: toggle,
          style: { background: enabled ? 'var(--dsw-alias-interactive-bg-hover, #e2e8f0)' : 'transparent', color: 'inherit', border: '1px solid var(--dsw-alias-border-primary, #8884)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', font: 'inherit', whiteSpace: 'nowrap' }
        }, wide ? '📌 ' + label : '📌'),
        error ? React.createElement('span', { role: 'alert', style: { fontSize: 11, color: 'var(--dsw-alias-danger-primary, #c44)', overflowWrap: 'anywhere' } }, error) : null
      );
    }
    exports.inject = ['slots'];
    exports.apply = (ctx) => {
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'dsh-pintop' }, PinTopButton));
    };
    return module.exports;
  }
});
