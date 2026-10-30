// dsh-cnki-agent —— 宿主半侧。
//
// 设计约束（对齐 DSH 0.2.1-rc.3）：
//   - 除 node:* 外不 import 任何模块（不依赖 schemastery），安装零解析风险；
//   - 所有可选服务一律 ctx.get() 探测，缺失就降级，不阻塞插件激活；
//   - 工具参数手写 JSON Schema。
//
// 提供：
//   skills : cnki-agent 综合技能
//   tools  : cnki_search（逐词顺序检索）/ cnki_reading_plan（精读检查单）
//            cnki_research_map（研究版图）/ cnki_library（检索历史与文献库）
//   routes : /api/cnki/library（GET）给右侧栏面板读检索历史与文献库
//   prompt : 常驻上下文，规定"先拆词、再逐词检索、再精读、最后动笔"

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'dsh-cnki-agent';
export const inject = [];

/** 本进程内注册过的工具，供浏览器桥接取用（按 base 名索引 bcdp_*）。 */
const TOOL_REGISTRY = new Map();

/**
 * 浏览器工具由别的插件注册，可能在 apply 之后才出现；
 * 首次调用时惰性填充，避免加载顺序导致桥接永远为空。
 */
function ensureToolRegistry(tools) {
  if (TOOL_REGISTRY.size > 0) return;
  try {
    for (const schema of tools.schemas?.() ?? []) {
      const def = tools.get?.(schema.name);
      if (def) TOOL_REGISTRY.set(def.name, def);
    }
  } catch {
    /* 读取失败保持为空，桥接自动降级 */
  }
}

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_NAME = 'cnki-agent';
const LIBRARY_LIMIT = 200;

// ---------------------------------------------------------------- 技能正文

const SKILL_BODY = `# CNKIAgent · 知网论文研究—写作综合技能

你是 CNKIAgent：一名兼具**文献检索能力**与**核心期刊编辑眼光**的研究顾问。所有学术工作都要先检索、再阅读、再判断，最后才动笔；任何一步缺少证据，都必须明确说明缺什么，不得虚构文献、数据、访谈或结论。

详细流程见 \`references/workflow.md\`，精读检查单见 \`references/reading-checklist.md\`，研究版图模板见 \`references/research-map.md\`。

## 0. 路由：先判断用户要哪一档

| 用户说 | 走哪条路线 |
|---|---|
| 给出主题/关键词/文献摘要，要板块分析、切入点、选题 | **R1 研究版图**：\`cnki_research_map\` |
| 要写论文、要大纲、要引言、要正文 | **R2 写作链**：检索 → 精读 → 大纲 → 引言 → 正文 → 审计 → 排版 |
| 只要检索/找文献/找核心期刊文章 | **R3 检索**：\`cnki_search\` |
| 给了 PDF/正文，要精读、要仿写、要审稿意见 | **R4 精读**：\`cnki_reading_plan\` |
| 已有稿子，要改语言、查引用、按期刊格式排版 | **R5 修订**：编辑修订 + 文献审计 + Word 排版 |

一次任务只走一条主路线，需要时再挂子路线。

## 1. 关键词自动识别与逐个检索（硬规则）

1. 把需求切成**检索词单元**：主题词 + 限定词（学科、方法、对象、情境、时间）。
2. 判定模式：\`precise\`（明确概念、要核心期刊、要可直接引用）或 \`general\`（模糊兴趣，允许同义词扩展）。
3. **逐个执行**：\`cnki_search\` 的 \`keywords\` 按顺序跑，一次一个词；不要把多个词拼成一条 query 后声称"已完成多词检索"。
4. 每个词回归三件事：命中数、可用篇数、是否跑偏；跑偏就换检索式重跑并写明换法。
5. 保留**可复现的检索式与日期**，作为引用溯源依据；每次检索自动进入插件文献库（右侧栏可见）。
6. 知网正文受登录与验证码限制：拿不到全文就标注"未取得全文"，只用摘要级信息，不得脑补正文内容。

## 2. 精读：以核心期刊编辑的眼光读

元信息 → 目录结构 → 引言逐句解剖（背景/已有研究/缺口/问题/贡献/结构预告）→ 理论基础是否真用 → 研究设计可复现性 → 发现是否回应问题 → 讨论是否回扣理论 → 语体与 AIGC 特征 → 可仿写句型骨架。

引言通行结构（用户提供原文时以其为准）：4~6 段，段间用"已有研究…但其…"转折承接；引言回答"为什么值得研究"，不回答"研究做了什么"。

## 3. 研究版图与选题（R1）

先概览版图（问题/理论/对象/方法/结论），再比较共同点与分歧（分歧要落到位：理论假设、对象、情境、测量、时间窗），再给三个切入点（属于：解释不足/对象有限/情境未讨论/理论可拓展），最后三个实证题目（研究价值/创新来源/实施难度）。

## 4. 写作链（R2，必须分步且等确认）

- **大纲**：三级标题 + 每节"解决什么问题/用什么材料/与前后关系"，并标出最需论证的三处。
- **引言**：写完停下等确认。
- **正文**：一次一小节，800~1000 字；判断先行 → 材料解释 → 关系揭示 → 收束衔接；缺材料要明说。
- **校订**：编辑口径改语言，不改结论；可疑处单列。
- **减少 AIGC**：少用模板连接词；多写具体主体、时间、数据、条件；长短句交替；段落结构不要齐整划一。

## 5. 格式与引用（R5）

默认 GB/T 7714—2015 顺序编码制；正文标记与文后条目双向可查；用 Word 交叉引用而非手打编号；先建样式再套格式，表格用三线表，目录与页码用域。

## 6. 输出纪律

先结论、再证据、再不确定项；每次检索/精读结束给"下一步三选一"；额度不足或网络不通时明确告知并给续做入口。
`;

const READING_CHECKLIST = `# 精读检查单（核心期刊编辑视角）

## A 元信息
- 期刊层级 / 栏目 / 年卷期 / 作者与机构 / 基金
- 判断：问题描述型、理论建构型还是实证检验型

## B 目录与小标题
- 一级标题的关系：并列 / 递进 / 对照
- 是否存在"对象—框架—实证—讨论"四段式
- 篇幅是否失衡（讨论过短、文献堆砌过长）

## C 引言解剖（逐句标注）
1. 现实背景句（是否有可核验事实或数据）
2. 已有研究句（是否点名具体学者与观点）
3. 转折缺口句（是否用"然而/但/尚缺乏"显式点出）
4. 研究问题句（单一、可回答、有边界）
5. 贡献句（理论贡献与实践贡献分别写）
6. 结构预告句

常见缺陷：缺口没说清；研究问题多个且互相不咬合；贡献只是"具有重要意义"。

## D 正文覆盖
- 概念界定是否区分相近概念
- 理论基础是否被真正使用
- 研究设计：资料来源、样本、变量/编码、分析方法、效度
- 发现：是否回应研究问题，有没有反例
- 讨论：是否回扣理论，是否交代边界与局限

## E 学术语体与 AIGC 特征
- 名词化、被动使用是否恰当
- 因果措辞强度 vs 证据强度（相关/影响/导致/决定）
- 限定词是否到位（显著、部分、在…条件下）
- AIGC 味：模板连接词堆叠、每段同结构、无具体主语的空转句

## F 可仿写点
- 3 条句型骨架（保留语法槽位，不给原文）
- 1 条结构模板（把该文骨架映射到用户主题）
`;

const RESEARCH_MAP_TEMPLATE = `# 研究版图模板

## 一、当前研究版图

| 维度 | 文献A | 文献B | 文献C | 归纳 |
|---|---|---|---|---|
| 关注的主要问题 | | | | |
| 理论视角 | | | | |
| 研究对象 | | | | |
| 研究方法 | | | | |
| 核心结论 | | | | |

## 二、共同点与分歧

- 共同点：
- 分歧（落到：理论假设 / 对象 / 情境 / 测量 / 时间窗）：

## 三、三个值得继续研究的切入点

1. 切入点名称 —— 属于哪类不足（解释不足 / 对象有限 / 情境未讨论 / 理论可拓展）—— 判断依据
2. …
3. …

## 四、三个实证选题

### 题目一
- 研究价值：
- 创新来源：
- 实施难度：高/中/低 + 最大卡点

（题目二、题目三同格式）

## 五、弃用方案

- 被弃题目 / 理由（范围过大、概念空泛、只求新奇）
`;

function skillRegistration() {
  return {
    name: SKILL_NAME,
    description:
      '知网论文研究助手 CNKIAgent：自动拆解论文需求中的关键词并逐个检索，按核心期刊编辑视角精读目录/引言/正文，输出研究版图与选题，再按"大纲→引言→正文→校订"分步写作，最后做引用审计与 Word 排版。',
    whenToUse: '用户提出论文写作、文献调研、知网检索、精读仿写、选题策划、论文修订与排版需求时。',
    content: SKILL_BODY,
    source: 'runtime',
    resourceBase: { kind: 'directory', path: join(PACKAGE_ROOT, 'skills', SKILL_NAME) },
    metadata: {
      author: 'CNKIAgent',
      version: '0.2.0',
      fusion: [
        'skill-creator（技能编排）',
        'data-analysis（结果统计）',
        'browser-use（检索通道）',
        'academic-evaluator（研究评估）',
        'academic-polish（语言润色/去 AIGC）',
        'academic-researcher（文献调研）',
        'paper-close-reading（文献精读）',
        'reference-audit（参考文献审计）',
        'journal-format（论文排版）',
        'academic-paper / deep-research / academic-pipeline / office-docx（本机既有技能）',
      ],
    },
  };
}

// ---------------------------------------------------------------- 检索

function buildQuery(keyword, mode, site) {
  if (mode === 'precise') {
    return `site:${site} "${keyword}" (核心期刊 OR 学术论文 OR 摘要 OR 关键词)`;
  }
  return `site:${site} ${keyword}`;
}

async function runOneKeyword(web, keyword, mode, site, limit, signal) {
  const query = buildQuery(keyword, mode, site);
  if (!web) {
    return { keyword, query, ok: false, error: 'web 服务不可用：无法检索。', sources: [] };
  }
  try {
    const result = await web.search({ query, maxResults: limit }, signal);
    const sources = (result?.sources ?? []).map((s, i) => ({
      rank: i + 1,
      title: s.title ?? '',
      url: s.url ?? '',
      snippet: (s.snippet ?? '').slice(0, 400),
      publishedAt: s.publishedAt ?? '',
      keyword,
    }));
    return {
      keyword,
      query,
      ok: sources.length > 0,
      truncated: Boolean(result?.truncated),
      count: sources.length,
      sources,
    };
  } catch (error) {
    return {
      keyword,
      query,
      ok: false,
      error: String(error && error.message ? error.message : error),
      sources: [],
    };
  }
}

// ---------------------------------------------------------------- 浏览器通道

const CNKI_SPACE = 'cnki';
const CNKI_HOME = 'https://kns.cnki.net/kns8s/search';

const CNKI_RESULT_SCRIPT = `(() => {
  const rows = [];
  for (const tr of document.querySelectorAll('table tr')) {
    const a = tr.querySelector('td a[href*="/kcms2/article/abstract"]');
    if (!a) continue;
    const tds = [...tr.querySelectorAll('td')];
    const title = a.textContent.trim();
    if (!title) continue;
    rows.push({
      title,
      url: a.href,
      source: tds[3] ? tds[3].textContent.trim() : '',
      date: tds[4] ? tds[4].textContent.trim() : '',
      db: tds[5] ? tds[5].textContent.trim() : '',
      cited: null,
    });
  }
  const totalText = (document.querySelector('.pagerTitleCell') || {}).textContent || '';
  const total = (totalText.match(/([\\d,]+)/) || [])[1] || '';
  return { url: location.href, title: document.title, total, rows };
})()`;

/**
 * 通过 dsh-browser-cdp 暴露的 bcdp_* 工具驱动真实浏览器。
 * 桥接是可选的：连不上就自动退回 ctx.web。
 */
function createBcdpBridge(tools) {
  const named = new Map();
  const collect = () => {
    ensureToolRegistry(tools);
    named.clear();
    for (const tool of TOOL_REGISTRY.values()) {
      const base = tool.name.replace(/^bcdp_/, '');
      if (!named.has(base)) named.set(base, tool);
    }
  };
  return {
    available: () => {
      collect();
      return named.size > 0;
    },
    names: () => {
      collect();
      return [...named.keys()];
    },
    async call(base, args) {
      collect();
      const tool = named.get(base);
      if (!tool) throw new Error(`浏览器工具不可用：${base}`);
      if (typeof tool.execute !== 'function') throw new Error(`浏览器工具不可调用：${base}`);
      return tool.execute(args ?? {}, { signal: undefined });
    },
  };
}

async function runKeywordInBrowser(bridge, keyword, mode, limit, signal) {
  const query = mode === 'precise' ? `"${keyword}"` : keyword;
  const entry = { keyword, query, channel: 'browser-cdp', ok: false, sources: [] };
  try {
    const status = await bridge.call('status', {});
    if (!status || status.ok !== true) throw new Error(status?.reason || '浏览器通道不可用');
    // 确保空间存在
    try {
      await bridge.call('space', { op: 'open', name: CNKI_SPACE });
    } catch {
      /* 已存在时 open 会报错，忽略 */
    }
    // 打开检索首页，在检索框输入后提交
    await bridge.call('navigate', { space: CNKI_SPACE, url: CNKI_HOME, wait: true, timeout: 45000 });
    const filled = await bridge.call('js', {
      space: CNKI_SPACE,
      expression: `(() => { const el = document.querySelector('#txt_search'); if (!el) return false; el.focus(); el.value = ${JSON.stringify(query)}; el.dispatchEvent(new Event('input', { bubbles: true })); const f = el.closest('form'); if (f) { f.submit(); return true; } const b = document.querySelector('.search-btn') || document.querySelector('input.search-btn'); if (b) { b.click(); return true; } return false; })()`,
    });
    if (filled && filled.result === false) throw new Error('知网检索框未找到');
    // 等结果表出现
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const extracted = await bridge.call('js', { space: CNKI_SPACE, expression: CNKI_RESULT_SCRIPT });
    const payload = extracted && (extracted.result || extracted);
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (rows.length === 0) throw new Error('未解析到结果行（可能撞上知网安全验证）');
    entry.ok = true;
    entry.total = payload.total || '';
    entry.pageUrl = payload.url || '';
    entry.count = Math.min(rows.length, limit);
    entry.sources = rows.slice(0, limit).map((row, index) => ({
      rank: index + 1,
      title: row.title,
      url: row.url,
      snippet: [row.source, row.date, row.db].filter(Boolean).join(' · '),
      publishedAt: row.date || '',
      keyword,
    }));
    return entry;
  } catch (error) {
    entry.error = String(error && error.message ? error.message : error);
    return entry;
  }
}

// ---------------------------------------------------------------- 插件体

export function apply(ctx) {
  const disposers = [];

  /** 内存文献库：只活在本次进程内，供右侧栏面板与 cnki_library 读取。 */
  const library = { searches: [], sources: [], updatedAt: null };

  function recordSearch(entry) {
    library.searches.unshift(entry);
    if (library.searches.length > LIBRARY_LIMIT) library.searches.length = LIBRARY_LIMIT;
    for (const source of entry.sources ?? []) {
      if (library.sources.some((s) => s.url && s.url === source.url)) continue;
      library.sources.push(source);
    }
    if (library.sources.length > LIBRARY_LIMIT * 2) library.sources.length = LIBRARY_LIMIT * 2;
    library.updatedAt = new Date().toISOString();
  }

  // ---- 1) 技能 ----
  const skills = ctx.get('skills');
  if (skills) {
    disposers.push(skills.register(skillRegistration()));
  } else {
    console.warn('[cnki-agent] ctx.skills 不可用，跳过技能注册（工具仍可用）');
  }

  // ---- 2) 工具 ----
  const tools = ctx.get('tools');
  if (tools) {
    // 把本插件可用的工具填进注册表，供浏览器桥接取用
    try {
      for (const schema of tools.schemas?.() ?? []) {
        const def = tools.get?.(schema.name);
        if (def) TOOL_REGISTRY.set(def.name, def);
      }
    } catch (error) {
      console.warn(`[cnki-agent] 工具表读取失败：${String(error && error.message ? error.message : error)}`);
    }
    disposers.push(
      tools.register({
        name: 'cnki_search',
        description:
          '按顺序逐个检索关键词（默认限定知网 kns.cnki.net），支持精确/泛检索，返回可复现的检索式与来源清单，并把结果记入插件文献库。多个关键词依次执行，不做合并查询。',
        parameters: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: '检索词单元，按顺序逐个检索（先主题词，再限定词）。每个元素是一条独立检索式。',
            },
            mode: {
              type: 'string',
              enum: ['precise', 'general'],
              description: 'precise=精确检索（字段限定、要求核心期刊）；general=泛检索。默认 general。',
            },
            site: { type: 'string', description: '限定站点，默认 kns.cnki.net。' },
            maxResultsPerKeyword: { type: 'integer', description: '每个检索词最多保留多少条，默认 8，上限 20。' },
            saveTo: { type: 'string', description: '可选：把检索报告写入该目录（相对工作区或绝对路径）。' },
          },
          required: ['keywords'],
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              site: { type: 'string' },
              searched: { type: 'integer' },
              totalSources: { type: 'integer' },
              reportPath: { type: 'string' },
              results: { type: 'array', items: { type: 'object', additionalProperties: true } },
              nextSteps: { type: 'array', items: { type: 'string' } },
            },
            required: ['mode', 'site', 'results'],
            additionalProperties: true,
          },
          render: (_args, value) => {
            const lines = [
              `检索模式 ${value.mode}，站点 ${value.site}，共 ${value.searched} 个检索词、${value.totalSources} 条来源。`,
            ];
            for (const r of value.results ?? []) {
              lines.push('', `### 关键词：${r.keyword}`, `检索式：${r.query}`);
              if (!r.ok) {
                lines.push(`结果：未命中（${r.error ?? '无可用结果'}）`);
                continue;
              }
              for (const s of r.sources ?? []) {
                lines.push(`${s.rank}. ${s.title} — ${s.url}`);
                if (s.snippet) lines.push(`   ${s.snippet}`);
              }
            }
            if (value.reportPath) lines.push('', `检索报告：${value.reportPath}`);
            if (value.nextSteps?.length) lines.push('', '下一步：', ...value.nextSteps.map((s) => `- ${s}`));
            return [{ type: 'text', text: lines.join('\n') }];
          },
        },
        async execute(args, exec) {
          const input = args ?? {};
          const keywords = Array.isArray(input.keywords)
            ? input.keywords.filter((k) => typeof k === 'string' && k.trim())
            : [];
          if (keywords.length === 0) throw new Error('keywords 不能为空：请提供至少一个检索词');
          const mode = input.mode === 'precise' ? 'precise' : 'general';
          const site = typeof input.site === 'string' && input.site.trim() ? input.site.trim() : 'kns.cnki.net';
          const limit = Math.min(Math.max(Number(input.maxResultsPerKeyword) || 8, 1), 20);

          const web = ctx.get('web');
          const bcdp = createBcdpBridge(tools);
          const useBrowser = bcdp.available() && !input.noBrowser;
          const results = [];
          for (const keyword of keywords) {
            // 逐个执行：优先走真实知网页面（browser-cdp），失败再退回 ctx.web 搜索
            let result = useBrowser
              ? await runKeywordInBrowser(bcdp, keyword, mode, limit, exec?.signal)
              : null;
            if (!result || !result.ok) {
              const fallback = await runOneKeyword(web, keyword, mode, site, limit, exec?.signal);
              result = result ? { ...fallback, browserError: result.error } : fallback;
            }
            results.push(result);
          }
          // 先规整成纯 JS 数据：工具返回值必须无损 JSON，
          // 浏览器/网络解析偶尔混入 undefined 会让整个结果被判非法。
          const cleanResults = results.map((r) => ({
            keyword: String(r.keyword ?? ''),
            query: String(r.query ?? ''),
            channel: String(r.channel ?? (r.ok ? 'web' : 'none')),
            ok: Boolean(r.ok),
            count: Number(r.count ?? 0) || 0,
            total: r.total === undefined || r.total === null ? '' : String(r.total),
            error: r.error ? String(r.error) : '',
            browserError: r.browserError ? String(r.browserError) : '',
            sources: (Array.isArray(r.sources) ? r.sources : []).map((s, index) => ({
              rank: Number(s.rank ?? index + 1) || index + 1,
              title: String(s.title ?? ''),
              url: String(s.url ?? ''),
              snippet: String(s.snippet ?? ''),
              publishedAt: String(s.publishedAt ?? ''),
              keyword: String(s.keyword ?? r.keyword ?? ''),
            })),
          }));
          results.length = 0;
          results.push(...cleanResults);
          const totalSources = cleanResults.reduce((n, r) => n + r.sources.length, 0);
          const failed = cleanResults.filter((r) => !r.ok).map((r) => r.keyword);

          let reportPath;
          if (typeof input.saveTo === 'string' && input.saveTo.trim()) {
            try {
              const dir = input.saveTo.trim();
              await mkdir(dir, { recursive: true });
              const file = join(dir, `cnki-search-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
              const md = [
                '# 知网检索报告',
                '',
                `- 时间：${new Date().toISOString()}`,
                `- 模式：${mode}`,
                `- 站点：${site}`,
                `- 检索词：${keywords.join(' | ')}`,
                '',
                '## 明细',
                ...results.flatMap((r) => [
                  '',
                  `### ${r.keyword}`,
                  `检索式：\`${r.query}\``,
                  ...(r.ok
                    ? (r.sources ?? []).map((s) => `- ${s.title} — ${s.url}`)
                    : [`- 未命中：${r.error ?? '无结果'}`]),
                ]),
              ].join('\n');
              await writeFile(file, md, 'utf8');
              reportPath = file;
            } catch (error) {
              reportPath = `写入失败：${String(error && error.message ? error.message : error)}`;
            }
          }

          recordSearch({
            at: new Date().toISOString(),
            mode,
            site,
            keywords,
            searched: keywords.length,
            totalSources,
            failed,
            results: results.map((r) => ({
              keyword: r.keyword,
              query: r.query,
              ok: r.ok,
              count: r.count ?? 0,
              error: r.error,
            })),
            sources: results.flatMap((r) => r.sources ?? []),
            reportPath: reportPath || '',
          });

          const nextSteps = [];
          if (failed.length) nextSteps.push(`这些检索词未命中，建议换检索式或放宽站点后重跑：${failed.join('、')}`);
          nextSteps.push('对命中的文献调用 cnki_reading_plan 生成精读检查单，逐篇阅读后再下结论');
          nextSteps.push('需要研究版图与选题时，用 cnki_research_map 结构化合成多篇文献');

          return {
            mode,
            site,
            searched: keywords.length,
            totalSources,
            results: cleanResults,
            reportPath: reportPath || '',
            nextSteps,
          };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: 'cnki_reading_plan',
        description:
          '生成"核心期刊编辑视角"的精读检查单：目录、引言逐句解剖、正文覆盖、学术语体与 AIGC 特征、可仿写句型骨架。只给检查单与判读要点，不编造文献内容。',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '待精读文献的标题（可留空）' },
            focus: { type: 'array', items: { type: 'string' }, description: '重点关注项' },
            userTopic: { type: 'string', description: '用户自己的论文主题，用于生成仿写映射' },
          },
          additionalProperties: false,
        },
        output: {
          schema: { type: 'object', properties: { plan: { type: 'string' } }, required: ['plan'], additionalProperties: true },
          render: (_args, value) => [{ type: 'text', text: value.plan }],
        },
        async execute(args) {
          const input = args ?? {};
          const focus =
            Array.isArray(input.focus) && input.focus.length
              ? input.focus.join('、')
              : '目录、引言、正文结构、核心观点、方法、结论';
          const plan = [
            `# 精读任务：${input.title ?? '（未命名文献）'}`,
            '',
            `重点项：${focus}`,
            '',
            READING_CHECKLIST,
            '',
            '## 仿写映射',
            input.userTopic
              ? `把上述骨架映射到用户主题「${input.userTopic}」时，逐项回答：现实背景是什么、已有研究怎么归类、缺口怎么表述、研究问题怎么界定。`
              : '用户未提供主题。请先索要论文主题，再做仿写映射。',
            '',
            '> 纪律：检查单之外的文献内容一律不得凭印象补充；没有读到的段落标注"未获取"。',
          ].join('\n');
          return { plan };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: 'cnki_research_map',
        description:
          '把多篇文献的结构化信息合成为研究版图：问题/理论/对象/方法/结论 → 共同点与分歧 → 三个切入点 → 三个实证选题（价值、创新来源、实施难度）。',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: '研究主题' },
            papers: {
              type: 'array',
              description: '文献清单；每项含 title，可带 question/theory/object/method/conclusion',
              items: { type: 'object', additionalProperties: true },
            },
            interest: { type: 'string', description: '个人感兴趣的问题' },
          },
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: { template: { type: 'string' } },
            required: ['template'],
            additionalProperties: true,
          },
          render: (_args, value) => [{ type: 'text', text: value.template }],
        },
        async execute(args) {
          const input = args ?? {};
          const papers = Array.isArray(input.papers) ? input.papers : [];
          const template = [
            `# 研究版图：${input.topic ?? '（未命名主题）'}`,
            '',
            papers.length
              ? `已收录 ${papers.length} 篇文献：${papers.map((p, i) => p?.title ?? `文献${i + 1}`).join('；')}`
              : '尚未收录文献。请先检索或粘贴摘要，再生成版图。',
            input.interest ? `个人感兴趣的问题：${input.interest}` : '',
            '',
            RESEARCH_MAP_TEMPLATE,
          ]
            .filter(Boolean)
            .join('\n');
          return { template };
        },
      }),
    );

    disposers.push(
      tools.register({
        name: 'cnki_library',
        description: '读取本插件的检索历史与文献库（右侧栏面板显示同一份数据），用于回顾检索式、去重与选题复核。',
        parameters: {
          type: 'object',
          properties: { action: { type: 'string', enum: ['list', 'clear'], description: 'list 读取；clear 清空' } },
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              searches: { type: 'integer' },
              sources: { type: 'integer' },
              updatedAt: { type: 'string', description: '最近一次检索的 ISO 时间；从未检索时为空串。' },
              items: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
            additionalProperties: true,
          },
          render: (_args, value) => [
            {
              type: 'text',
              text: [
                `检索历史 ${value.searches} 次，文献库 ${value.sources} 条。`,
                ...(value.items ?? []).map(
                  (it) => `- ${it.keyword}（${it.mode}，${it.ok ? `${it.count} 条` : '未命中'}）\n  ${it.query}`,
                ),
              ].join('\n'),
            },
          ],
        },
        async execute(args) {
          const input = args ?? {};
          if (input.action === 'clear') {
            library.searches.length = 0;
            library.sources.length = 0;
            library.updatedAt = new Date().toISOString();
            return { searches: 0, sources: 0, updatedAt: library.updatedAt, items: [] };
          }
          const items = [];
          for (const search of library.searches.slice(0, 30)) {
            for (const r of search.results ?? []) {
              items.push({ keyword: r.keyword, query: r.query, ok: r.ok, count: r.count, mode: search.mode, at: search.at });
            }
          }
          return {
            searches: library.searches.length,
            sources: library.sources.length,
            updatedAt: library.updatedAt,
            items: items.slice(0, 60),
          };
        },
      }),
    );
  } else {
    console.warn('[cnki-agent] ctx.tools 不可用，跳过工具注册');
  }

  // ---- 3) 右侧栏面板的数据接口（客户端面板读它） ----
  const connection = ctx.get('connection');
  const registerRoute = connection?.fetch?.register;
  if (typeof registerRoute === 'function') {
    disposers.push(
      connection.fetch.register({
        path: '/api/cnki/library',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () =>
          new Response(
            JSON.stringify({
              searches: library.searches.slice(0, 20),
              sources: library.sources.slice(0, 80),
              counts: { searches: library.searches.length, sources: library.sources.length },
              updatedAt: library.updatedAt,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
          ),
      }),
    );
  } else {
    console.warn('[cnki-agent] connection.fetch 不可用，跳过 /api/cnki/library 路由（面板将显示提示）');
  }

  // ---- 4) 提示词上下文 ----
  const systemPrompt = ctx.get('systemPrompt');
  if (systemPrompt) {
    disposers.push(
      systemPrompt.context({
        name: 'cnki-agent',
        order: 60,
        text: () =>
          '【CNKIAgent】当用户提出论文写作、文献调研、知网检索、精读仿写或选题需求时：第一步把需求拆成检索词单元并判断精确/泛检索；第二步用 cnki_search 按顺序逐个检索，保留可复现检索式；第三步用 cnki_reading_plan 精读（目录/引言逐句/正文覆盖/语体/AIGC 特征），第四步才用 cnki_research_map 或写作链输出。写作链必须分步：三级大纲 → 引言 → 正文（一次一小节）→ 校订，每步停下等用户确认。不得虚构文献、数据与结论。',
      }),
    );
  }

  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose?.();
      } catch {
        /* 清理失败不影响卸载 */
      }
    }
  };
}
