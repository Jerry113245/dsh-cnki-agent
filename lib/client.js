// dsh-cnki-agent —— 浏览器半侧。
//
// 两个注册面：
//   1) plugins.row.config（key = <包名>#<行 id>）：设置 → 插件 → CNKIAgent →
//      行上的「配置」按钮。打开后是设置表单 + 调用记录，这是"我怎么知道插件
//      被调用"的可视化答案。summary 视图只在插件行里显示一行摘要。
//   2) sidebar.right.pane.tab：「CNKI 文献库」右侧栏面板，读检索历史。
//
// 数据来源是宿主路由：GET /api/cnki/library、GET /api/cnki/activity、
// POST /api/cnki/settings。样式只用宿主主题变量（--dsw-alias-*），
// 明暗主题自动跟随；不用外部依赖，不读别的插件的 DOM。

window.__ModuleLoader__.load({
  id: 'dsh-cnki-agent',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;

    const LIBRARY_API = '/api/cnki/library';
    const ACTIVITY_API = '/api/cnki/activity';
    const SETTINGS_API = '/api/cnki/settings';

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
      pageWrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: '2px 0 8px',
        fontSize: 13,
        lineHeight: 1.6,
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
      btnPrimary: {
        cursor: 'pointer',
        fontSize: 12,
        padding: '4px 14px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
        fontWeight: 500,
      },
      row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
      field: {
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '8px 0',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      label: { fontWeight: 500 },
      hint: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11 },
      input: {
        width: 88,
        padding: '3px 8px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12,
      },
      select: {
        padding: '3px 8px',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 12,
      },
      table: { display: 'flex', flexDirection: 'column', gap: 2 },
      tr: {
        display: 'grid',
        gridTemplateColumns: '56px 108px 1fr 44px',
        gap: 8,
        alignItems: 'baseline',
        fontSize: 11,
        padding: '3px 0',
        borderBottom: '1px dashed var(--dsw-alias-border-l1)',
      },
      errColor: 'var(--dsw-alias-state-error-primary)',
      okColor: 'var(--dsw-alias-state-success-primary)',
      missColor: 'var(--dsw-alias-state-warn-primary)',
    };

    const TOOL_LABELS = {
      cnki_search: '逐词检索',
      cnki_reading_plan: '精读计划',
      cnki_research_map: '研究版图',
      cnki_library: '文献库',
      cnki_de_aigc: '去 AI 味',
      cnki_word_plan: 'Word 排版',
      cnki_diagram_plan: '插图规划',
    };

    function Chip({ text }) {
      return h('span', { style: S.tag }, text);
    }

    async function getJson(url) {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }

    async function readLibrary() {
      return getJson(LIBRARY_API);
    }

    function readActivity() {
      return getJson(ACTIVITY_API);
    }

    async function writeSettings(patch) {
      const res = await fetch(SETTINGS_API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json && json.error) || `HTTP ${res.status}`);
      return json;
    }

    function clockOf(iso) {
      try {
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch {
        return '';
      }
    }

    function agoOf(iso) {
      const ms = Date.now() - new Date(iso).getTime();
      if (!Number.isFinite(ms) || ms < 0) return '';
      if (ms < 60000) return '刚刚';
      if (ms < 3600000) return `${Math.floor(ms / 60000)} 分钟前`;
      if (ms < 86400000) return `${Math.floor(ms / 3600000)} 小时前`;
      return `${Math.floor(ms / 86400000)} 天前`;
    }

    // ------------------------------------------------------------ 调用记录

    function useActivity(pollMs) {
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const alive = useRef(true);

      const load = useCallback(async () => {
        try {
          const json = await readActivity();
          if (alive.current) {
            setData(json);
            setError(null);
          }
        } catch (e) {
          if (alive.current) setError(String(e && e.message ? e.message : e));
        }
      }, []);

      useEffect(() => {
        alive.current = true;
        load();
        if (!pollMs) return () => { alive.current = false; };
        const timer = setInterval(load, pollMs);
        return () => {
          alive.current = false;
          clearInterval(timer);
        };
      }, [load, pollMs]);

      return { data, error, reload: load };
    }

    function ActivityList({ activity }) {
      if (!activity || !activity.recent || activity.recent.length === 0) {
        return h(
          'div',
          { style: S.card },
          h('div', { style: { fontWeight: 600 } }, '还没有调用记录'),
          h(
            'div',
            { style: S.muted },
            '在对话里让 CNKIAgent 做一次检索或体检，这里就会出现工具名、参数摘要、成败与耗时。',
          ),
        );
      }
      return h(
        'div',
        { style: S.table },
        h('div', { style: { ...S.tr, color: 'var(--dsw-alias-label-secondary)' } },
          h('span', null, '时间'),
          h('span', null, '工具'),
          h('span', null, '参数摘要'),
          h('span', null, '耗时'),
        ),
        ...activity.recent.map((c, i) =>
          h(
            'div',
            { key: `${c.at}-${i}`, style: S.tr },
            h('span', { style: S.muted }, clockOf(c.at)),
            h(
              'span',
              { style: { color: c.ok ? S.okColor : S.errColor, fontWeight: 500 } },
              `${c.ok ? '✓' : '✗'} ${TOOL_LABELS[c.name] || c.name}`,
            ),
            h(
              'span',
              { style: { ...S.query, color: c.ok ? undefined : S.errColor } },
              c.error ? `${c.summary} — ${c.error}` : c.summary || '（无参数）',
            ),
            h('span', { style: S.muted }, c.ms == null ? '—' : `${c.ms}ms`),
          ),
        ),
      );
    }

    function CountChips({ counts }) {
      const entries = Object.entries(counts || {}).filter(([, n]) => n > 0);
      if (entries.length === 0) return null;
      return h(
        'div',
        { style: { marginTop: 4 } },
        ...entries
          .sort((a, b) => b[1] - a[1])
          .map(([name, n], i) => h(Chip, { key: i, text: `${TOOL_LABELS[name] || name} ×${n}` })),
      );
    }

    // ------------------------------------------------- 设置页（plugins.row.config）

    function SettingsPage(props) {
      const view = props && props.view === 'summary' ? 'summary' : 'page';
      const { data, error, reload } = useActivity(view === 'page' ? 4000 : 0);
      const [draft, setDraft] = useState(null);
      const [busy, setBusy] = useState(false);
      const [notice, setNotice] = useState(null);
      const [saveError, setSaveError] = useState(null);

      // 首次拿到宿主设置时初始化草稿；之后不再覆盖用户正在编辑的值。
      useEffect(() => {
        if (data && data.settings && draft === null) setDraft({ ...data.settings });
      }, [data, draft]);

      if (view === 'summary') {
        const activity = data && data.activity;
        if (error) return h('span', { style: { color: S.errColor, fontSize: 11 } }, '设置接口不可用');
        if (!activity) return h('span', { style: S.muted }, '读取调用记录…');
        const total = activity.total || 0;
        return h(
          'span',
          { style: S.muted },
          total === 0
            ? '尚未在本机调用过工具'
            : `已调用 ${total} 次${activity.recent[0] ? ` · 最近 ${agoOf(activity.recent[0].at)}` : ''}`,
        );
      }

      const activity = data && data.activity;
      const settings = data && data.settings;

      const save = async () => {
        if (!draft) return;
        setBusy(true);
        setNotice(null);
        setSaveError(null);
        try {
          const res = await writeSettings(draft);
          if (res.settings) setDraft({ ...res.settings });
          setNotice(
            res.settingsError
              ? `设置已生效，但没能写盘（重启后会丢）：${res.settingsError}`
              : '已保存并立即生效',
          );
          await reload();
        } catch (e) {
          setSaveError(String(e && e.message ? e.message : e));
        } finally {
          setBusy(false);
        }
      };

      const dirty = Boolean(draft && settings && Object.keys(draft).some((k) => draft[k] !== settings[k]));

      return h(
        'div',
        { style: S.pageWrap },

        // —— 调用记录 ——
        h(
          'section',
          null,
          h('div', { style: S.row },
            h('span', { style: { ...S.sectionTitle, fontSize: 11 } }, '调用记录'),
            h('span', { style: S.muted },
              activity
                ? `${activity.total} 次${activity.since ? ` · 自 ${clockOf(activity.since)}` : ''}`
                : '读取中…'),
          ),
          h('div', { style: { ...S.hint, marginTop: 2 } },
            '这里是宿主侧的真实调用计数，工具被调用一次就记一次（含失败）。关掉下方"记录调用"后不再累计。'),
          h('div', { style: { marginTop: 8 } }, h(ActivityList, { activity })),
          activity ? h(CountChips, { counts: activity.counts }) : null,
          error
            ? h('div', { style: { ...S.card, marginTop: 8 } },
                h('div', { style: { color: S.errColor } }, '读不到调用记录'),
                h('div', { style: S.muted }, error),
              )
            : null,
        ),

        // —— 运行设置 ——
        h(
          'section',
          null,
          h('div', { style: S.sectionTitle }, '运行设置'),
          !draft &&
            h('div', { style: { ...S.hint, marginTop: 6 } }, '读取设置…'),

          draft &&
            h(
              'div',
              null,
              h(
                'div',
                { style: S.field },
                h('div', { style: S.row },
                  h('span', { style: S.label }, '记录调用日志'),
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'switch',
                      'aria-checked': draft.recordActivity ? 'true' : 'false',
                      onClick: () => setDraft({ ...draft, recordActivity: !draft.recordActivity }),
                      style: {
                        cursor: 'pointer',
                        width: 40,
                        height: 22,
                        borderRadius: 999,
                        border: '1px solid var(--dsw-alias-border-l2)',
                        background: draft.recordActivity
                          ? 'var(--dsw-alias-brand-primary)'
                          : 'var(--dsw-alias-bg-layer-2)',
                        position: 'relative',
                        padding: 0,
                      },
                    },
                    h('span', {
                      style: {
                        position: 'absolute',
                        top: 2,
                        left: draft.recordActivity ? 20 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 120ms ease',
                      },
                    }),
                  ),
                ),
                h('div', { style: S.hint }, '关掉后不再累计调用记录，已有记录保留。'),
              ),

              h(
                'div',
                { style: S.field },
                h('div', { style: S.row },
                  h('span', { style: S.label }, '默认语种'),
                  h(
                    'select',
                    {
                      style: S.select,
                      value: draft.defaultLang,
                      onChange: (e) => setDraft({ ...draft, defaultLang: e.target.value }),
                    },
                    h('option', { value: 'auto' }, '自动判断'),
                    h('option', { value: 'zh' }, '中文'),
                    h('option', { value: 'en' }, '英文'),
                  ),
                ),
                h('div', { style: S.hint }, 'cnki_de_aigc 未显式指定 lang 时用这个值。'),
              ),

              h(
                'div',
                { style: S.field },
                h('div', { style: S.row },
                  h('span', { style: S.label }, '每词检索条数'),
                  h('input', {
                    type: 'number',
                    min: 1,
                    max: 20,
                    style: S.input,
                    value: draft.defaultMaxResults,
                    onChange: (e) => setDraft({ ...draft, defaultMaxResults: Number(e.target.value) }),
                  }),
                ),
                h('div', { style: S.hint }, 'cnki_search 未显式指定 maxResultsPerKeyword 时的默认值（1–20）。'),
              ),

              h(
                'div',
                { style: S.field },
                h('div', { style: S.row },
                  h('span', { style: S.label }, '优先走本地浏览器'),
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'switch',
                      'aria-checked': draft.browserChannel ? 'true' : 'false',
                      onClick: () => setDraft({ ...draft, browserChannel: !draft.browserChannel }),
                      style: {
                        cursor: 'pointer',
                        width: 40,
                        height: 22,
                        borderRadius: 999,
                        border: '1px solid var(--dsw-alias-border-l2)',
                        background: draft.browserChannel
                          ? 'var(--dsw-alias-brand-primary)'
                          : 'var(--dsw-alias-bg-layer-2)',
                        position: 'relative',
                        padding: 0,
                      },
                    },
                    h('span', {
                      style: {
                        position: 'absolute',
                        top: 2,
                        left: draft.browserChannel ? 20 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 120ms ease',
                      },
                    }),
                  ),
                ),
                h('div', { style: S.hint }, '开启时优先用 dsh-browser-cdp 驱动本机 Edge 打开知网；关闭则退回 web 检索。'),
              ),
            ),

          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 } },
            h(
              'button',
              { type: 'button', style: S.btnPrimary, disabled: busy || !dirty, onClick: save },
              busy ? '保存中…' : '保存',
            ),
            dirty && !busy ? h('span', { style: S.hint }, '有未保存的改动') : null,
            notice ? h('span', { style: { ...S.hint, color: S.okColor } }, notice) : null,
            saveError ? h('span', { style: { ...S.hint, color: S.errColor } }, saveError) : null,
          ),

          data && data.settingsFile
            ? h('div', { style: { ...S.hint, marginTop: 8 } },
                `设置文件：${data.settingsFile}`,
                data.settingsError ? `（写盘失败：${data.settingsError}）` : '',
              )
            : null,
        ),

        // —— 统计 ——
        h(
          'section',
          null,
          h('div', { style: S.sectionTitle }, '本机状态'),
          h('div', { style: { ...S.hint, marginTop: 6 } },
            data
              ? `已注册工具 ${data.tools ?? '?'} 个 · 文献库 ${data.library ? data.library.searches : 0} 次检索 / ${data.library ? data.library.sources : 0} 条来源`
              : '读取中…',
          ),
        ),
      );
    }

    // ------------------------------------------------------ 右侧栏面板

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
        // 原生设置页：插件行上的「配置」入口（Settings → 插件 → CNKIAgent）。
        ctx.slots.inject('plugins.row.config', () =>
          ctx.slots.register(
            { name: 'plugins.row.config', key: 'dsh-cnki-agent#dsh-cnki-agent', order: 10 },
            SettingsPage,
          ),
        );

        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'cnki-library', order: 40 }, Panel),
        );
      },
    };
  },
});