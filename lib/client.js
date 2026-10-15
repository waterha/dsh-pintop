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
      const busy = React.useRef(false);
      const alive = React.useRef(true);
      const refresh = React.useCallback(async (next) => {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 40000);
        try {
          const response = await fetch('api/dsh-pintop', {
            method: typeof next === 'boolean' ? 'POST' : 'GET',
            credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            ...(typeof next === 'boolean' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: next }) } : {})
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
          if (typeof result.enabled !== 'boolean') throw new Error('服务未返回实际窗口状态');
          if (alive.current) { setEnabled(result.enabled); setError(''); }
        } catch (err) {
          if (alive.current) { setEnabled(null); setError(err.message || '读取置顶状态失败'); }
        } finally {
          clearTimeout(timer); busy.current = false;
          if (alive.current) setPending(false);
        }
      }, []);
      React.useEffect(() => {
        alive.current = true;
        refresh();
        const onFocus = () => refresh();
        window.addEventListener('focus', onFocus);
        return () => { alive.current = false; window.removeEventListener('focus', onFocus); };
      }, [refresh]);
      const label = enabled === true ? '取消置顶' : '窗口置顶';
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0, gap: 4 } },
        React.createElement('button', {
          type: 'button', disabled: pending || enabled === null,
          'aria-pressed': enabled === true, 'aria-busy': pending, 'aria-label': label,
          title: error || (pending ? '正在读取 Windows 窗口状态…' : label),
          onClick: () => refresh(!enabled),
          style: { background: enabled ? 'var(--dsw-alias-interactive-bg-hover, #e2e8f0)' : 'transparent', color: 'inherit', border: '1px solid var(--dsw-alias-border-primary, #8884)', borderRadius: 8, padding: '7px 10px', cursor: pending || enabled === null ? 'default' : 'pointer', opacity: pending || enabled === null ? 0.55 : 1, font: 'inherit', whiteSpace: 'nowrap' }
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
