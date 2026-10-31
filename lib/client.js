// dsh-cnki-agent —— 浏览器半侧。
//
// 在右侧栏注册一个标签页：「CNKI 文献库」。
// 数据来自宿主路由 GET /api/cnki/library（检索历史 + 去重后的文献清单）。
// 样式只用宿主主题变量（--dsw-alias-*），明暗主题自动跟随；
// 不用外部依赖，不读别的插件的 DOM。

window.__ModuleLoader__.load({
  id: 'dsh-cnki-agent',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const API = '/api/cnki/library';

    const S = {
      wrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '10px 12px',
        height: '100%',
        overflowY: 'auto',
        fontSize: 12,
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-primary)',
      },
      head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
      title: { fontWeight: 600, fontSize: 13 },
      muted: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11 },
      sectionTitle: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 10,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
      },
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 8,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      },
      query: {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 11,
        wordBreak: 'break-all',
      },
      link: { color: 'var(--dsw-alias-brand-primary)', textDecoration: 'none', fontWeight: 500 },
      tag: {
        display: 'inline-block',
        padding: '0 6px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: 10,
        marginRight: 4,
      },
      btn: {
        alignSelf: 'flex-start',
        cursor: 'pointer',
        fontSize: 11,
        padding: '2px 10px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
      },
      errColor: 'var(--dsw-alias-state-error-primary)',
      okColor: 'var(--dsw-alias-state-success-primary)',
      missColor: 'var(--dsw-alias-state-warn-primary)',
    };

    function Chip({ text }) {
      return h('span', { style: S.tag }, text);
    }

    async function readLibrary() {
      const res = await fetch(API, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }

    function Panel() {
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);

      const load = useCallback(async () => {
        setBusy(true);
        try {
          setData(await readLibrary());
          setError(null);
        } catch (e) {
          setError(String(e && e.message ? e.message : e));
        } finally {
          setBusy(false);
        }
      }, []);

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const json = await readLibrary();
            if (alive) {
              setData(json);
              setError(null);
            }
          } catch (e) {
            if (alive) setError(String(e && e.message ? e.message : e));
          }
        })();
        const timer = setInterval(() => {
          if (alive) load();
        }, 20000);
        return () => {
          alive = false;
          clearInterval(timer);
        };
      }, [load]);

      const searches = (data && data.searches) || [];
      const sources = (data && data.sources) || [];
      const counts = (data && data.counts) || { searches: 0, sources: 0 };

      return h(
        'div',
        { style: S.wrap },
        h(
          'div',
          { style: S.head },
          h('span', { style: S.title }, 'CNKI 文献库'),
          h('span', { style: S.muted }, `${counts.searches} 次检索 · ${counts.sources} 条文献`),
        ),
        h('button', { style: S.btn, onClick: load, disabled: busy }, busy ? '刷新中…' : '刷新'),
        error &&
          h(
            'div',
            { style: S.card },
            h('div', { style: { color: S.errColor } }, '读不到数据'),
            h('div', { style: S.muted }, error),
            h('div', { style: S.muted }, '插件未激活或宿主路由不可用；在对话里跑一次 cnki_search 即会产生数据。'),
          ),
        !data && !error && h('div', { style: S.muted }, '读取中…'),
        data &&
          searches.length === 0 &&
          !error &&
          h(
            'div',
            { style: S.card },
            h('div', { style: { fontWeight: 600 } }, '还没有检索记录'),
            h('div', { style: S.muted }, '对 CNKIAgent 说「检索：关键词A、关键词B」，它逐词检索后结果会出现在这里。'),
          ),
        searches.length > 0 &&
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            h('div', { style: S.sectionTitle }, '检索历史'),
            ...searches.map((s, i) =>
              h(
                'div',
                { key: `${s.at}-${i}`, style: S.card },
                h(
                  'div',
                  null,
                  h(Chip, { text: s.mode === 'precise' ? '精确' : '泛检索' }),
                  h(Chip, { text: `${s.totalSources || 0} 条` }),
                  s.failed && s.failed.length ? h(Chip, { text: `未命中 ${s.failed.length}` }) : null,
                ),
                h('div', { style: { fontWeight: 600 } }, (s.keywords || []).join(' / ')),
                ...(s.results || []).map((r, j) =>
                  h(
                    'div',
                    { key: j, style: { ...S.query, color: r.ok ? S.okColor : S.missColor } },
                    `${r.ok ? '✓' : '✗'} ${r.query}`,
                  ),
                ),
                h('div', { style: S.muted }, new Date(s.at).toLocaleString()),
              ),
            ),
          ),
        sources.length > 0 &&
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 } },
            h('div', { style: S.sectionTitle }, '文献清单'),
            ...sources.map((p, i) =>
              h(
                'div',
                { key: `${p.url}-${i}`, style: S.card },
                h('a', { style: S.link, href: p.url, target: '_blank', rel: 'noreferrer' }, p.title || p.url),
                h('div', { style: S.muted }, `${p.keyword || ''}${p.publishedAt ? ' · ' + p.publishedAt : ''}`),
                p.snippet ? h('div', { style: S.muted }, p.snippet) : null,
              ),
            ),
          ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'cnki-library', order: 40 }, Panel),
        );
      },
    };
  },
});
