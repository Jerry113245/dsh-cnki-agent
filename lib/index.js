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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

详细流程见 \`references/workflow.md\`，精读检查单见 \`references/reading-checklist.md\`，研究版图模板见 \`references/research-map.md\`，降 AIGC 与语体配平规则见 \`references/de-aigc-playbook.md\`。

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
- **降 AIGC / 配平语体**（硬规则，详见 \`references/de-aigc-playbook.md\`）：
  - 三条总原则：结构先行（先改语序/句式/段落节奏，再碰词）、具体优先（抽象拔高换成可核验的数值/条件/机制）、语体守门（改完必须仍是论文）。
  - 判断标准只有一档合格：\`降重不足（仍像 AI）\` 与 \`降重过度（口语化）\` 都不合格，要的是 \`书面学术\`。
  - 每段 AI 高频词 ≤2 个；段末总结套句全文 ≤1 处；泛化结尾（"具有重要意义/前景广阔"）0 处；模糊归因（无出处的"专家认为/研究表明"）0 处；破折号每段 ≤1 个；正文加粗 ≤5 处；全文术语只用一个叫法。
  - **禁止**靠口语、网络用语、情绪词、碎句、硬造金句来"降 AI"；**禁止**为更像人而补造数据、文献、访谈、异常值。
  - 改写前先划**保护区**（引用编号、图表公式、数据与百分比、术语、直接引语），全程原样保留。
  - 噪声预算：每千字保留 2~3 处轻度模式化特征，全部磨平会因过度均质反而更像机器稿。

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

// ---------------------------------------------------------------- 降 AIGC 词表

/** 最高优先级：几乎只出现在 AI 文本中的词，每段出现即需处理。 */
const AI_WORDS_TOP = [
  '值得注意的是',
  '至关重要',
  '深入探讨',
  '系统性',
  '全方位',
  '多维度',
  '深度剖析',
  '高度契合',
  '紧密结合',
  '有机融合',
  '无缝衔接',
  '稳步提升',
  '持续优化',
  '全面提升',
  '显著提升',
  '不可或缺',
  '举足轻重',
  '深远影响',
  '广泛关注',
  '深刻揭示',
];

/** 高优先级：AI 使用频率远高于人类。 */
const AI_WORDS_HIGH = [
  '此外',
  '与此同时',
  '综上所述',
  '需要指出的是',
  '研究表明',
  '分析认为',
  '具体而言',
  '具体来说',
  '旨在',
  '赋能',
  '助力',
  '聚焦',
  '锚定',
  '凸显',
  '彰显',
  '阐述',
  '阐明',
  '进一步',
  '从而',
  '进而',
];

/** 学术论文专属 AI 短语。 */
const AI_PHRASES = [
  '本文旨在',
  '进行了深入分析',
  '具有广阔的应用前景',
  '奠定了坚实的基础',
  '提供了重要的参考价值',
  '引起了广泛关注',
  '发挥着重要作用',
  '取得了显著的成效',
  '有待进一步研究',
  '具有重要的理论意义',
  '开辟了新的途径',
  '前景广阔',
];

/** 口语化 / 网络用语黑名单：降 AI 时绝对不许引入。 */
const COLLOQUIAL_WORDS = [
  '说白了',
  '说实话',
  '老实说',
  '这事儿',
  '搞定',
  '踩坑',
  '手感',
  '崩了',
  '绝绝子',
  '破防',
  '离谱',
  '逆天',
  '拿捏',
  '整活',
  'yyds',
  'emo',
  '反正就是',
  '大概齐',
  '说到底',
];

/** 模糊归因：无具体出处的权威借势，既是 AI 特征也是学术规范问题。 */
const VAGUE_ATTRIBUTIONS = ['专家认为', '研究表明', '学界普遍认为', '业内普遍认为', '有观点认为', '相关研究指出', '众所周知'];

const SECTION_TERMS = ['引言', '前言', '文献综述', '研究设计', '研究方法', '结果', '讨论', '结论', '局限', '展望', '摘要'];
const BREAKDOWNS = ['首先', '其次', '再次', '最后', '其一', '其二', '其三'];
const CLOSERS = ['综上所述', '由此可见', '不难发现', '可以看出', '总之'];

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}

function collectHits(text, dict) {
  const hits = [];
  for (const word of dict) {
    const count = countOccurrences(text, word);
    if (count > 0) hits.push({ word, count });
  }
  return hits.sort((a, b) => b.count - a.count);
}

/** 句长变异系数：越低说明句子长度越均匀，越像机器输出。 */
function sentenceMetrics(text) {
  const sentences = text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const lengths = sentences.map((s) => s.length);
  if (lengths.length === 0) return { sentences: 0, avg: 0, cv: 0, max: 0 };
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((acc, len) => acc + (len - avg) ** 2, 0) / lengths.length;
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
  return { sentences: lengths.length, avg: Number(avg.toFixed(1)), cv: Number(cv.toFixed(2)), max: Math.max(...lengths) };
}

/** 按段落做风险打分，≥2 分标为高风险（单项命中已足以提示，命中越多越可疑）。 */
function paragraphRisks(text) {
  const paragraphs = text
    .split(/\n{2,}|\r\n\s*\r\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 12);
  return paragraphs
    .map((paragraph, index) => {
      const reasons = [];
      let score = 0;
      if (/^(依据|基于|根据).{0,12}(理论|框架|视角)/.test(paragraph) || /^随着.{0,20}(发展|普及|推进)/.test(paragraph)) {
        score += 1;
        reasons.push('段首是理论/时代背景起笔');
      }
      if (/(此案例|这一案例).{0,6}(印证|揭示|挑战|说明)/.test(paragraph) || /(由此可见|综上所述|总之)[^。]{0,20}。$/.test(paragraph)) {
        score += 1;
        reasons.push('段末总结套句');
      }
      if (BREAKDOWNS.filter((w) => paragraph.includes(w)).length >= 2) {
        score += 1;
        reasons.push('首先/其次/再次 编号并列');
      }
      if (paragraph.includes('——') && countOccurrences(paragraph, '——') > 1) {
        score += 1;
        reasons.push('破折号超 1 个');
      }
      if (collectHits(paragraph, AI_WORDS_TOP).length >= 2) {
        score += 1;
        reasons.push('最高优先级 AI 词过多');
      }
      if (collectHits(paragraph, VAGUE_ATTRIBUTIONS).length > 0) {
        score += 1;
        reasons.push('模糊归因');
      }
      if (/(具有重要意义|前景广阔|深远影响|提供了新思路)/.test(paragraph)) {
        score += 1;
        reasons.push('泛化拔高表述');
      }
      if (/(首先[^。]{2,40}；[^。]{1,10}其次)/.test(paragraph) || /(其一[^。]{2,40}；[^。]{1,10}其二)/.test(paragraph)) {
        score += 1;
        reasons.push('对称并列句式');
      }
      return { index: index + 1, preview: paragraph.slice(0, 40), score, reasons };
    })
    .filter((p) => p.score >= 2);
}

function buildReport(text) {
  const total = text.length;
  const top = collectHits(text, AI_WORDS_TOP);
  const high = collectHits(text, AI_WORDS_HIGH);
  const phrases = collectHits(text, AI_PHRASES);
  const colloquial = collectHits(text, COLLOQUIAL_WORDS);
  const vague = collectHits(text, VAGUE_ATTRIBUTIONS);
  const dashes = countOccurrences(text, '——');
  const bold = countOccurrences(text, '**') / 2;
  const metrics = sentenceMetrics(text);
  const risky = paragraphRisks(text);
  const closers = collectHits(text, CLOSERS);

  const findings = [];
  if (colloquial.length) findings.push(`命中口语/网络用语 ${colloquial.length} 种（${colloquial.map((h) => h.word).join('、')}）——这是降 AI 改过头的信号，必须改回书面学术表达。`);
  if (vague.length) findings.push(`模糊归因 ${vague.reduce((n, h) => n + h.count, 0)} 处（${vague.map((h) => h.word).join('、')}）——要么补具体出处，要么改成本文判断。`);
  if (top.length) findings.push(`最高优先级 AI 高频词 ${top.reduce((n, h) => n + h.count, 0)} 处，涉及 ${top.length} 个词。`);
  if (high.length) findings.push(`高优先级 AI 高频词 ${high.reduce((n, h) => n + h.count, 0)} 处。`);
  if (phrases.length) findings.push(`学术 AI 短语 ${phrases.reduce((n, h) => n + h.count, 0)} 处（如「${phrases[0].word}」）。`);
  if (closers.length) findings.push(`段末总结套句 ${closers.reduce((n, h) => n + h.count, 0)} 处，建议全文保留 ≤1 处。`);
  if (dashes > 0) findings.push(`破折号 ${dashes} 处；阈值是每段 ≤1 个。`);
  if (bold > 5) findings.push(`正文加粗 ${bold} 处，超过上限 5 处。`);
  if (metrics.sentences >= 6 && metrics.cv < 0.4) findings.push(`句长变异系数 ${metrics.cv}（<0.4），句子长度过于均匀，需要长短句交错。`);
  if (risky.length) findings.push(`高风险段落 ${risky.length} 段（评分 ≥2）。`);

  const verdict =
    colloquial.length > 0
      ? '不合格：出现了口语/网络用语，语体已经破防，先退回书面表达再谈降 AI。'
      : vague.length > 0
        ? '需处理：存在模糊归因，这是检测器与人审都会盯的硬问题。'
        : risky.length > 0 || top.length + high.length > 3
          ? '需改写：模式化特征明显，按 references/de-aigc-playbook.md 第 3 节逐项处理。'
          : '基本通过：未发现明显机器痕迹，注意保留少量自然噪声，不要过度打磨。';

  const lines = [
    '# 去 AI 味体检报告',
    '',
    `- 字数：${total}`,
    `- 句数：${metrics.sentences}，平均句长：${metrics.avg} 字，变异系数：${metrics.cv}${metrics.sentences >= 6 && metrics.cv < 0.4 ? '（偏低，句子过匀）' : ''}，最长句：${metrics.max} 字`,
    `- 结论：${verdict}`,
    '',
    '## 一、硬指标',
    '',
    '| 指标 | 实测 | 阈值 | 判定 |',
    '|---|---|---|---|',
    `| 口语/网络用语 | ${colloquial.reduce((n, h) => n + h.count, 0)} | 0 | ${colloquial.length ? '✗' : '✓'} |`,
    `| 模糊归因 | ${vague.reduce((n, h) => n + h.count, 0)} | 0 | ${vague.length ? '✗' : '✓'} |`,
    `| 段末总结套句 | ${closers.reduce((n, h) => n + h.count, 0)} | ≤1 | ${closers.reduce((n, h) => n + h.count, 0) <= 1 ? '✓' : '✗'} |`,
    `| 破折号 | ${dashes} | 每段 ≤1 | ${dashes <= risky.length + 1 && dashes === 0 ? '✓' : '需人工核对分段'} |`,
    `| 正文加粗 | ${bold} | ≤5 | ${bold <= 5 ? '✓' : '✗'} |`,
  ];
  if (top.length) {
    lines.push('', '## 二、最高优先级 AI 高频词', '', '| 词 | 次数 |', '|---|---|', ...top.map((h) => `| ${h.word} | ${h.count} |`));
  }
  if (high.length) {
    lines.push('', '## 三、高优先级 AI 高频词', '', '| 词 | 次数 |', '|---|---|', ...high.slice(0, 12).map((h) => `| ${h.word} | ${h.count} |`));
  }
  if (phrases.length) {
    lines.push('', '## 四、学术 AI 短语', '', ...phrases.map((h) => `- ${h.word}（${h.count} 次）`));
  }
  if (risky.length) {
    lines.push('', '## 五、高风险段落', '');
    for (const p of risky) {
      lines.push(`- 第 ${p.index} 段〔${p.score} 分〕${p.reasons.join('；')}`, `  > ${p.preview}…`);
    }
  }
  lines.push(
    '',
    '## 六、处理顺序',
    '',
    '1. 先修**硬指标**（口语、模糊归因、泛化结尾）——这些不是风格问题，是规范问题；',
    '2. 再按**移位 → 砍尾 → 破对称 → 换词**处理高风险段落；',
    '3. 最后回头问一句：**读起来还是论文吗？** 不是就退回去。',
    '',
    '> 规则全文见 `references/de-aigc-playbook.md`。本报告只做诊断，不改动原文；改写必须由人确认。',
  );
  return { lines, verdict, findings, metrics, risky };
}

// ---------------------------------------------------------------------------
// 英文模式：academic-humanizer（MIT, AIScientists-Dev）
// 规则全文见 references/academic-humanizer-en.md
// ---------------------------------------------------------------------------

const EN_AI_WORDS = [
  'delve', 'delving', 'underscore', 'underscores', 'underscoring', 'intricate', 'tapestry',
  'testament', 'pivotal', 'showcase', 'showcasing', 'foster', 'fostering', 'leverage',
  'leveraging', 'realm', 'seamless', 'seamlessly', 'paramount', 'transformative',
  'groundbreaking', 'cutting-edge', 'revolutionize', 'harness', 'cornerstone', 'myriad',
  'holistic', 'multifaceted', 'unprecedented', 'meticulous', 'vibrant', 'profound', 'crucial',
];

const EN_PHRASES = [
  'it is worth noting that', 'it is important to note that', 'it should be emphasized that',
  'in recent years', 'with the rapid development', 'despite recent advances', 'in order to',
  'paving the way', 'paves the way', 'to the best of our knowledge', 'for the first time',
  'plays a crucial role', 'plays a vital role', 'serves as', 'a wide range of',
  'in the realm of', 'has attracted increasing attention', 'has attracted significant attention',
  'has drawn considerable attention', 'extensive experiments', 'state-of-the-art performance',
  'provides valuable insights', 'sheds light on', 'opens new avenues', 'holds great promise',
  'of paramount importance', 'bridges the gap', 'in today\'s',
];

const EN_OVERCLAIM = ['prove', 'proves', 'proved', 'proving', 'demonstrate', 'demonstrates', 'demonstrated', 'establish', 'establishes', 'established', 'confirm', 'confirms', 'confirmed', 'guarantee', 'guarantees', 'guaranteed'];
const EN_VAGUE_HEDGE = ['somewhat', 'relatively', 'fairly', 'to some extent', 'quite', 'rather'];
const EN_INTENSIFIERS = ['extensive', 'comprehensive', 'thorough', 'numerous', 'various', 'a wide range of'];
const EN_EMPHASIS = ['notably', 'importantly', 'significantly', 'interestingly'];

const EN_CLAIM_MARK = /\b(proves?|proved|proving|demonstrates?|demonstrated|demonstrating|establishes?|established|confirms?|confirmed|guarantees?|superior|state-of-the-art|outperforms?|outperformed|significantly|dramatically|substantially|novel|first)\b/i;
const EN_EVIDENCE_MARK = /(\d)|\b(Fig(?:ure)?s?\.?\s*\d)|(\bTables?\s*\d)|(\bEqs?\.?\s*\(?\d)|(\bSections?\s*\d)|(\[\d)/i;

/** 按 CJK 字符占比判断语种。 */
function detectLang(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (cjk === 0) return 'en';
  if (latin === 0) return 'zh';
  return cjk / (cjk + latin) > 0.2 ? 'zh' : 'en';
}

/** 英文按词边界、忽略大小写统计。 */
function countWord(text, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  return (text.match(re) || []).length;
}

function collectHitsEn(text, dict) {
  const hits = [];
  for (const word of dict) {
    const count = countWord(text, word);
    if (count > 0) hits.push({ word, count });
  }
  return hits.sort((a, b) => b.count - a.count);
}

function enSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 3);
}

/** 英文句长统计：按词数，变异系数同样用于判断句子是否过匀。 */
function enSentenceMetrics(text) {
  const sentences = enSentences(text);
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  if (!lengths.length) return { sentences: 0, avg: 0, cv: 0, max: 0 };
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((acc, len) => acc + (len - avg) ** 2, 0) / lengths.length;
  return {
    sentences: lengths.length,
    avg: Number(avg.toFixed(1)),
    cv: avg > 0 ? Number((Math.sqrt(variance) / avg).toFixed(2)) : 0,
    max: Math.max(...lengths),
  };
}

/** Layer 4：论断有没有证据指针、动词有没有强过证据。 */
function claimEvidence(text) {
  const rows = [];
  for (const sentence of enSentences(text)) {
    if (!EN_CLAIM_MARK.test(sentence)) continue;
    const hasEvidence = EN_EVIDENCE_MARK.test(sentence);
    const overclaim = EN_OVERCLAIM.filter((v) => countWord(sentence, v) > 0);
    const reasons = [];
    if (!hasEvidence) reasons.push('无证据指针');
    if (overclaim.length) reasons.push(`动词过强（${overclaim.join('/')}）`);
    if (/\bsignificantly\b/i.test(sentence) && !/\d/.test(sentence)) reasons.push('significantly 未量化');
    if (!reasons.length) continue;
    rows.push({ sentence, reasons, hasEvidence });
  }
  return rows;
}

/** 申请书模式检查单（NSF / NIH），只做结构提示，不代替官方指南。 */
function proposalChecklist(agency) {
  const nih = [
    'Specific Aims 一页内是否已给出：问题 → 已知 → **缺口/关键需求**？',
    '是否写明 **long-term goal** 与 **central hypothesis**，并给出假设的形成依据？',
    '是否有 "**The objective of this application is…**" 这句中心承诺？',
    '2–3 个 Aim 是否各自为「一行目标 + 一句方法 + 预期结果」？',
    'Aims 之间是否**平行独立**（不出现 Aim 2/3 依赖 Aim 1 成功）？确有依赖是否写了 fallback？',
    '是否有**收益段**：成功了会改变什么？',
    '中心假设是否被 hedge 掉（"will explore whether possibly…"）？',
  ];
  const nsf = [
    'Project Summary 是否三个口径自足：**Overview / Intellectual Merit / Broader Impacts**？',
    'Project Description 前 1–2 页是否完成：长期愿景 → 本申请目标 → 缺口 → thrusts → 收益？',
    '是否有一张总览图？',
    'Broader Impacts 是否实质且与研究整合（不是"mentor students and disseminate"）？',
    '每个大胆论断旁是否贴着可行性支点（预实验、前期发表、经典定理、合作者/推荐信）？',
  ];
  const rows = agency === 'nsf' ? nsf : nih;
  return ['| # | 检查项 | 状态 |', '|---|---|---|', ...rows.map((r, i) => `| ${i + 1} | ${r} | 人工核对 |`)];
}

/** 申请书特有的弱招（Layer 6.3），逐条给命中片段与改法。 */
const PROPOSAL_WEAK = [
  { re: /\b(is|are)\s+(a\s+)?(very\s+|highly\s+|extremely\s+)?(important|timely|critical|crucial)(\s+(and|or)\s+(important|timely|critical|crucial))?\s+(problem|issue|challenge|topic|area|question)\b/i, name: '空泛重要性', fix: '换成「没有它会怎样」的具体代价' },
  { re: /\b(has|have)\s+(many|a wide range of|numerous)\s+applications\b/i, name: '空泛重要性', fix: '点名一个具体应用场景' },
  { re: /\b(groundbreaking|revolutioni[sz]e|paradigm[- ]shift|game[- ]chang)/i, name: '空洞影响', fix: '换成具体收益（改变谁的什么行为/指标）' },
  { re: /\b(might|may)\s+possibly\b|\bwill\s+explore\s+whether\b|\bwe\s+will\s+try\s+to\b/i, name: '中心假设被 hedge 掉', fix: 'Aims 页的假设应为可证伪的承诺' },
  { re: /\bAim\s*\d\s*[:.\-–]\s*(apply|extend|develop|use|build|implement|run|test|improve)\b/i, name: '把方法当 aim', fix: '改成以"问题/结果"开头的 aim' },
  { re: /\bif\s+Aims?\s*(1|one)\b|\bdepends?\s+on\s+(the\s+)?success\s+of\s+Aim/i, name: '多米诺 aim', fix: '写成平行独立，或写明 fallback' },
  { re: /\b(mentor\s+students|disseminat\w*\s+(via|through)\s+(talks|papers|publications))\b/i, name: '样板化 Broader Impacts', fix: '具体、可枚举、与研究绑定' },
];

function proposalWeakMoves(text) {
  const rows = [];
  const sentences = enSentences(text);
  for (const item of PROPOSAL_WEAK) {
    for (const sentence of sentences) {
      if (item.re.test(sentence)) {
        rows.push({ name: item.name, sentence, fix: item.fix });
        break;
      }
    }
  }
  return rows;
}

function buildReportEn(text, docType, agency) {
  const words = (text.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
  const metrics = enSentenceMetrics(text);
  const aiWords = collectHitsEn(text, EN_AI_WORDS);
  const phrases = collectHitsEn(text, EN_PHRASES);
  const overclaim = collectHitsEn(text, EN_OVERCLAIM);
  const vague = collectHitsEn(text, EN_VAGUE_HEDGE);
  const intensifiers = collectHitsEn(text, EN_INTENSIFIERS);
  const emphasis = collectHitsEn(text, EN_EMPHASIS);
  const claims = claimEvidence(text);
  const weak = docType === 'proposal' ? proposalWeakMoves(text) : [];
  const emDash = countOccurrences(text, '\u2014') + Math.floor(countOccurrences(text, ' -- ') / 1);
  const citations = text.match(/\[\d+(?:\s*,\s*\d+)+\]/g) || [];
  const novelty = countWord(text, 'novel') + countWord(text, 'novelty');
  const longSentences = enSentences(text).filter((s) => s.split(/\s+/).length > 30);
  const sentences = enSentences(text);
  const connectives = ['Moreover', 'Furthermore', 'Additionally', 'In particular', 'Notably', 'Importantly'];
  const stacked = [];
  for (let i = 1; i < sentences.length; i += 1) {
    const a = connectives.some((c) => sentences[i - 1].startsWith(c));
    const b = connectives.some((c) => sentences[i].startsWith(c));
    if (a && b) stacked.push(sentences[i].slice(0, 70));
  }

  const totalTells = aiWords.reduce((n, h) => n + h.count, 0) + phrases.reduce((n, h) => n + h.count, 0);
  const verdict =
    claims.length >= 3 || overclaim.reduce((n, h) => n + h.count, 0) >= 3
      ? '不合格：论断跑在证据前面（Layer 4 未过）。先补证据指针或降级动词，再去谈用词。'
      : weak.length >= 2
        ? `需处理：申请书弱招命中 ${[...new Set(weak.map((w) => w.name))].length} 类（${[...new Set(weak.map((w) => w.name))].join('、')}），这些直接决定首页评分。`
        : claims.length > 0
          ? '需处理：存在无证据支撑的论断，这是审稿人与编辑最先盯的硬问题。'
          : totalTells > Math.max(4, Math.round(words / 120))
            ? '需改写：AI 词与套话密度偏高，按 Layer 1/2 逐项处理。'
            : emDash > 0 || longSentences.length > 0
              ? '接近通过：还有破折号或超长句需要处理。'
              : '基本通过：未发现明显机器痕迹，注意保留有证据支撑的 hedging 与被动语态。';

  const findings = [];
  if (claims.length) findings.push(`无证据/过强论断 ${claims.length} 处——优先修这个，不要只换词。`);
  if (weak.length) {
    const names = [...new Set(weak.map((w) => w.name))];
    findings.push(`申请书弱招 ${names.length} 类（${names.join('、')}）——首页失分点。`);
  }
  if (emDash > 0) findings.push(`破折号 ${emDash} 处；学术英文要求全部删除，改用逗号、冒号、括号或断句。`);
  if (longSentences.length) findings.push(`超过 30 词的长句 ${longSentences.length} 句，需拆分（一句一意）。`);
  if (aiWords.length) findings.push(`AI 高频词 ${aiWords.reduce((n, h) => n + h.count, 0)} 处，涉及 ${aiWords.length} 个词。`);
  if (phrases.length) findings.push(`套话/空洞短语 ${phrases.reduce((n, h) => n + h.count, 0)} 处。`);
  if (novelty > 1 && docType === 'paper') findings.push(`novel/novelty 出现 ${novelty} 次；论文一般全文 ≤1 次。`);
  if (citations.length) findings.push(`引用堆砌 ${citations.length} 处（如 ${citations[0]}），应只引真正相关的 1–2 篇并说明为什么。`);
  if (vague.length) findings.push(`模糊 hedging ${vague.reduce((n, h) => n + h.count, 0)} 处，应量化或删。`);
  if (stacked.length) findings.push(`连续句以连接词开头 ${stacked.length} 处，逻辑应自己走。`);
  if (metrics.sentences >= 6 && metrics.cv < 0.4) findings.push(`句长变异系数 ${metrics.cv}（<0.4），句子长度过于均匀。`);

  const lines = [
    '# Academic Humanizer 体检报告（英文模式）',
    '',
    `- 文档类型：${docType === 'proposal' ? '基金申请书' : '论文'}${docType === 'proposal' ? `（${String(agency).toUpperCase()}）` : ''}`,
    `- 词数：${words}；句数：${metrics.sentences}；平均句长：${metrics.avg} 词；变异系数：${metrics.cv}${metrics.sentences >= 6 && metrics.cv < 0.4 ? '（偏低，句子过匀）' : ''}；最长句：${metrics.max} 词`,
    `- 结论：${verdict}`,
    '',
    '## 一、硬指标',
    '',
    '| 指标 | 实测 | 阈值 | 判定 |',
    '|---|---|---|---|',
    `| 无证据/过强论断 | ${claims.length} | 0 | ${claims.length ? '✗' : '✓'} |`,
    `| 破折号 (em-dash) | ${emDash} | 0 | ${emDash ? '✗' : '✓'} |`,
    `| 超长句 (>30 词) | ${longSentences.length} | 0 | ${longSentences.length ? '✗' : '✓'} |`,
    `| AI 高频词 | ${aiWords.reduce((n, h) => n + h.count, 0)} | 每段 ≤2 | ${aiWords.reduce((n, h) => n + h.count, 0) === 0 ? '✓' : '人工核对'} |`,
    `| 套话短语 | ${phrases.reduce((n, h) => n + h.count, 0)} | 0 | ${phrases.length ? '✗' : '✓'} |`,
    `| 过强动词 | ${overclaim.reduce((n, h) => n + h.count, 0)} | 0 | ${overclaim.length ? '✗' : '✓'} |`,
    `| 空强度词 | ${intensifiers.reduce((n, h) => n + h.count, 0)} | 0 | ${intensifiers.length ? '✗' : '✓'} |`,
    `| 模糊 hedging | ${vague.reduce((n, h) => n + h.count, 0)} | 0 | ${vague.length ? '✗' : '✓'} |`,
    `| 引用堆砌 | ${citations.length} | 0 | ${citations.length ? '✗' : '✓'} |`,
  ];

  if (claims.length) {
    lines.push('', '## 二、论断↔证据（Layer 4，最高优先级）', '', '| # | 句子 | 问题 |', '|---|---|---|');
    for (let i = 0; i < Math.min(claims.length, 12); i += 1) {
      const row = claims[i];
      const safe = row.sentence.replace(/\|/g, '\\|').slice(0, 150);
      lines.push(`| ${i + 1} | ${safe} | ${row.reasons.join('；')} |`);
    }
    lines.push('', '> 改法只有两条：**补上证据指针**（数字/图/表/引用），或**把动词降到证据能支撑的强度**。不许为了好看把 hedging 改成断言。');
  }

  if (aiWords.length) {
    lines.push('', '## 三、AI 高频词', '', '| 词 | 次数 |', '|---|---|', ...aiWords.map((h) => `| ${h.word} | ${h.count} |`));
  }
  if (phrases.length) {
    lines.push('', '## 四、套话与空洞短语', '', ...phrases.map((h) => `- \`${h.word}\`（${h.count} 次）`));
  }
  if (longSentences.length) {
    lines.push('', '## 五、超长句（拆分）', '');
    for (const s of longSentences.slice(0, 6)) {
      lines.push(`- （${s.split(/\s+/).length} 词）${s.slice(0, 160)}${s.length > 160 ? '…' : ''}`);
    }
  }
  if (docType === 'proposal') {
    if (weak.length) {
      lines.push('', '## 六、申请书弱招（Layer 6.3）', '', '| 类型 | 命中片段 | 改法 |', '|---|---|---|');
      for (const w of weak) {
        const safe = w.sentence.replace(/\|/g, '\\|').slice(0, 120);
        lines.push(`| ${w.name} | ${safe} | ${w.fix} |`);
      }
    }
    lines.push('', '## 六·二、申请书结构检查单', '', ...proposalChecklist(agency));
    lines.push('', '> 申请书不要压平愿景；纪律换成「论断↔可行性」。前三页改得最狠：钩子、缺口、中心思想、aims、收益。');
  }
  lines.push(
    '',
    '## 七、处理顺序',
    '',
    '1. **Layer 4 先做**：无证据论断补指针或降级动词——这是硬问题，不是风格问题；',
    '2. **Layer 2 再做**：过强动词、意义拔高、空强度词、套路开头、贡献列表套话；',
    '3. **Layer 1 最后**：AI 词、破折号、超长句、连接词堆叠；',
    '4. **不要动**：有证据支撑的 hedging、恰当的被动、we、定义/符号/术语、任何数字与引用。',
    '',
    '> 规则全文见 `references/academic-humanizer-en.md`（改编自 AIScientists-Dev/academic-humanizer，MIT）。本报告只诊断，不改原文。',
  );
  return { lines, verdict, findings, metrics, words, claims: claims.length };
}

const REVIEW_TEMPLATE = `# 降 AIGC 改写方案（待确认）

> 本方案只动**表达层**：不改研究设计、不改数据、不改结论、不改文献。确认后再落笔。

## 保护区（原样保留，不参与改写）

- [ ] 参考文献编号与条目
- [ ] 图表编号、公式、变量符号
- [ ] 数据、百分比、显著性水平
- [ ] 专业术语、量表名称
- [ ] 直接引语（引号内原话）

## 逐段改写表

| 段落 | 命中的模式 | ❌ 原文 | ✅ 改写 | 改了什么 |
|---|---|---|---|---|
| 1 | 理论起笔（①） | | | 理论名从段首移到段中 |
| 2 | 段末套句（②） | | | 删总结句，改用转折推进 |
| 3 | 三元对称（⑥） | | | 一项展开、一项带过 |
| … | | | | |

## 语体门（每一行都要过）

- [ ] 没有出现口语、网络用语、情绪词
- [ ] 没有为"更像人"补造数据、文献、访谈、异常值
- [ ] 术语全文统一，没有同义词轮换
- [ ] 破折号每段 ≤1 个，句子仍是完整书面陈述
- [ ] 通读一遍，仍然像论文

## 噪声预算

保留 2~3 处轻度模式化特征（每千字），不要全磨平。
`;

// ---------------------------------------------------------------- 排版词表

/** 顺序编码制参考文献条目：常见格式错误（规则，样例串，说明）。 */
const REF_FORMAT_RULES = [
  ['年卷之间用分号', /,\s*\d{4}\s*;\s*\d+\s*\(/, '刊名与年、卷之间用逗号：教育研究, 2025, 45(3): 123-145.'],
  ['页码用波浪线', /\d\s*[~～]\s*\d/, '起止页码用连接号「-」，不用「~」'],
  ['卷期写成"第X卷 第X期"', /第\s*\d+\s*卷/, '写成 45(3)，不写「第45卷第3期」'],
  ['作者之间用顿号或分号', /,\s*[^,\s]{2,4}、|；\s*[A-Z][a-z]+/, '作者之间用英文逗号加空格'],
  ['文献类型标识缺失或错用', /^\[?\d+\]?\s*[^[]+\.[^[]*$/, '题名后应有 [J]/[M]/[D]/[C]/[N]/[S]/[P]/[R]/[EB/OL] 等标识'],
  ['专著缺出版地', /\[M\]\.\s*[^:，,。]*出版社/, '专著格式：出版地: 出版者, 年'],
  ['网页缺引用日期', /\[EB\/OL\]\.(?!\s*\()/, '网页格式：(更新日期)[引用日期]. URL.'],
];

/** 排版流程步骤，供 cnki_word_plan 输出。 */
const WORD_STEPS = [
  ['0 定模板', '先拿到学校/期刊的格式规范与模板文件；有模板一律在模板副本里填，不另起新文档。'],
  ['1 建样式', '标题 1/2/3（挂多级列表）、正文（首行缩进 2 字符）、图题、表题、公式、参考文献（悬挂缩进 2 字符）、表注。'],
  ['2 中文字体', '只设 run.font.name 中文不生效，必须同时设 w:rFonts 的 w:eastAsia。'],
  ['3 图题注', '引用→插入题注；图题在下方、表题在上方；按章编号要勾"包含章节号"并选标题 1。'],
  ['4 表题注', '同上，位置选"所选项目上方"。'],
  ['5 交叉引用', '引用→交叉引用；引用内容选"只有标签和编号"；勾"插入为超链接"。'],
  ['6 三线表', '清空边框 → 全表 1.5 磅上下框线 → 首行 0.75 磅下框线；无竖线；长表设重复标题行。'],
  ['7 公式编号', '公式段样式 + 居中制表位 + 右对齐制表位；编号用 { SEQ 公式 \\* ARABIC }，按章加 { STYLEREF 标题 1 \\s }。'],
  ['8 公式引用', '给编号设书签，正文用 REF 域或交叉引用"书签"。'],
  ['9 参考文献', '顺序编码制按首次引用排序；有 Zotero/EndNote 就用域，没有就给条目设书签再用 REF。'],
  ['10 目录页码', '目录用 TOC 域生成；前置部分罗马数字、正文阿拉伯数字，靠分节符的 pgNumType 实现。'],
  ['11 通刷', 'Ctrl+A → F9；打印前勾"更新域"；再搜一遍"错误！未定义书签"。'],
];

/** 交付前排版自检清单。 */
const WORD_CHECKLIST = `# 交付前排版自检

| 检查项 | 判据 |
|---|---|
| 样式 | 无手动改字体字号的段落；标题全部套用内置标题样式 |
| 编号 | 图、表、公式全部是域；Ctrl+A → F9 后编号连续 |
| 交叉引用 | 全文搜「错误！未定义书签」结果为 0 |
| 图表 | 图题在下、表题在上；三线表无竖线；跨页表有重复标题行 |
| 公式 | 无位图公式；编号右对齐一致；正文有首次引用 |
| 参考文献 | 正文编号与文末条目一一对应，无孤条，格式统一 |
| 目录 | 域生成，页码与正文一致 |
| 页码 | 前置罗马、正文阿拉伯；共 X 页正确 |
| 残留 | 无 ** / 反引号 / 裸链接 / 占位符 / 「待补」 |
| 字体 | 中文宋体、西文 Times New Roman，无跳字 |`;

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
      version: '0.8.0',
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
        'de-aigc-playbook（去 AI 味与语体配平：Wikipedia Signs of AI writing / aigc-reduce / humanizer-zh-academic 三源归一）',
        'academic-humanizer-en（英文论文与 NSF/NIH 申请书：论断↔证据、六层痕迹目录、首页优先、可行性对齐；源自 AIScientists-Dev/academic-humanizer, MIT）',
        'word-playbook（Word 排版：题注/SEQ/REF 域、三线表、公式编号、GB/T 7714 参考文献）',
        'diagram-playbook（论文插图：三重栅格化、Visio/EMF、draw.io SVG、原生矢量形状、图文规范）',
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

// ------------------------------------------------------- 运行设置 / 调用记录
//
// 设置与调用记录都是"派生缓存"：丢了不影响功能，只影响可视化。
// 设置落盘到 profile 目录旁的 JSON，写不进去就退回内存并如实上报。

const ACTIVITY_LIMIT = 60;

const SETTINGS_DEFAULTS = Object.freeze({
  recordActivity: true,
  defaultLang: 'auto',
  defaultMaxResults: 8,
  browserChannel: true,
});

function resolveSettingsPath() {
  const home = process.env.USERPROFILE || process.env.HOME || '.';
  const base = process.env.DSH_PROFILE_DIR || join(home, '.dsh');
  return join(base, 'cnki-agent-settings.json');
}

async function loadSettings(file, target) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed && typeof parsed === 'object') {
      for (const key of Object.keys(SETTINGS_DEFAULTS)) {
        if (key in parsed) target[key] = parsed[key];
      }
    }
  } catch {
    /* 首次运行没有文件，保持默认值 */
  }
}

async function persistSettings(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 只接受白名单字段，越界值夹回合法区间，避免面板写坏设置。 */
function normalizeSettings(input, current) {
  const next = { ...current };
  if (!input || typeof input !== 'object') return next;
  if (typeof input.recordActivity === 'boolean') next.recordActivity = input.recordActivity;
  if (input.defaultLang === 'auto' || input.defaultLang === 'zh' || input.defaultLang === 'en') {
    next.defaultLang = input.defaultLang;
  }
  const limit = Number(input.defaultMaxResults);
  if (Number.isFinite(limit)) next.defaultMaxResults = Math.min(20, Math.max(1, Math.round(limit)));
  if (typeof input.browserChannel === 'boolean') next.browserChannel = input.browserChannel;
  return next;
}

/** 调用记录里只留人类可读的参数摘要，不落全文。 */
function summarizeArgs(args) {
  if (!args || typeof args !== 'object') return '';
  const parts = [];
  if (Array.isArray(args.keywords)) parts.push(args.keywords.join(' / '));
  if (typeof args.keyword === 'string' && args.keyword.trim()) parts.push(args.keyword.trim());
  if (typeof args.text === 'string') {
    const flat = args.text.replace(/\s+/g, ' ').trim();
    parts.push(`${flat.slice(0, 36)}${flat.length > 36 ? '…' : ''}（${args.text.length} 字）`);
  }
  if (typeof args.filePath === 'string' && args.filePath.trim()) parts.push(args.filePath.trim());
  return parts.join(' · ').slice(0, 120);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
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

  // ---- 1.5) 运行设置与调用记录 ----
  const settingsFile = resolveSettingsPath();
  const settings = { ...SETTINGS_DEFAULTS };
  const activity = {
    total: 0,
    counts: Object.create(null),
    recent: [],
    since: new Date().toISOString(),
    settingsError: null,
  };

  const settingsReady = loadSettings(settingsFile, settings).catch(() => {});

  function snapshotActivity() {
    return {
      total: activity.total,
      counts: { ...activity.counts },
      recent: activity.recent.slice(0, 40),
      since: activity.since,
      enabled: settings.recordActivity !== false,
    };
  }

  function recordCall(toolName, args, ok, error, ms) {
    if (settings.recordActivity === false) return;
    activity.total += 1;
    activity.counts[toolName] = (activity.counts[toolName] ?? 0) + 1;
    activity.recent.unshift({
      at: new Date().toISOString(),
      name: toolName,
      ok,
      ms,
      error: error ? String(error).slice(0, 200) : null,
      summary: summarizeArgs(args),
    });
    if (activity.recent.length > ACTIVITY_LIMIT) activity.recent.length = ACTIVITY_LIMIT;
  }

  /**
   * 给工具包一层执行钩子：这是"我怎么知道插件被调用"的唯一凭据来源。
   * 失败也记，且不吞异常。
   */
  function instrument(def) {
    const run = def?.execute;
    if (typeof run !== 'function' || def.__cnkiInstrumented) return def;
    return {
      ...def,
      __cnkiInstrumented: true,
      async execute(args, ...rest) {
        const started = Date.now();
        try {
          const value = await run.call(this, args, ...rest);
          recordCall(def.name, args, true, null, Date.now() - started);
          return value;
        } catch (error) {
          const msg = error && error.message ? error.message : error;
          recordCall(def.name, args, false, msg, Date.now() - started);
          throw error;
        }
      },
    };
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

    const registerTool = (def) => tools.register(instrument(def));

    disposers.push(
      registerTool({
        name: 'cnki_search',
        description:
          '按顺序逐个检索关键词（默认限定知网 kns.cnki.net），支持精确/泛检索，返回可复现的检索式与来源清单，并把结果记入插件文献库。多个关键词依次执行，不做合并查询。默认每词条数与默认语种可在「设置 → 插件 → CNKIAgent → 配置」里改。',
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
          const limit = Math.min(Math.max(Number(input.maxResultsPerKeyword) || settings.defaultMaxResults || 8, 1), 20);

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
      registerTool({
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
      registerTool({
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
      registerTool({
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

    disposers.push(
      registerTool({
        name: 'cnki_de_aigc',
        description:
          '去 AI 味体检与改写方案（中英双语）。中文模式：AI 高频词、模糊归因、段末套句、对称并列、句长变异、破折号与加粗密度、口语化越界。英文模式（academic-humanizer）：AI 词汇与套话、过强动词、破折号、超长句、引用堆砌，以及最关键的"论断↔证据"审计（无证据论断、动词强于证据、significantly 未量化）；docType=proposal 时附 NSF/NIH 申请书结构检查单。原则：只动表达层，语体优先于数值，不许口语化凑降低率，不许补造数据与文献。',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: '待检文本（论文片段或整节）；也可用 filePath 指定文件' },
            filePath: { type: 'string', description: '待检文件的绝对路径（.md/.txt），与 text 二选一' },
            mode: {
              type: 'string',
              enum: ['scan', 'review', 'check'],
              description: 'scan=体检报告（默认）；review=生成逐段改写方案表；check=改写后复查',
            },
            lang: {
              type: 'string',
              enum: ['auto', 'zh', 'en'],
              description: '语种：auto=按中文字符占比自动判断（默认）；zh=中文规则；en=英文学术/申请书规则',
            },
            docType: {
              type: 'string',
              enum: ['paper', 'proposal'],
              description: '英文模式下：paper=论文（默认）；proposal=基金申请书，追加 NSF/NIH 结构检查单',
            },
            agency: {
              type: 'string',
              enum: ['nsf', 'nih'],
              description: 'docType=proposal 时的资助机构，决定检查单条目',
            },
            register: {
              type: 'string',
              enum: ['journal', 'thesis', 'report'],
              description: '中文模式的语体标定：期刊论文 / 学位论文 / 研究报告',
            },
          },
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              lang: { type: 'string' },
              report: { type: 'string' },
              verdict: { type: 'string' },
              findings: { type: 'array', items: { type: 'string' } },
              riskyParagraphs: { type: 'integer' },
              chars: { type: 'integer' },
            },
            required: ['mode', 'report', 'verdict'],
            additionalProperties: true,
          },
          render: (_args, value) => [{ type: 'text', text: value.report }],
        },
        async execute(args) {
          const input = args ?? {};
          let text = typeof input.text === 'string' ? input.text : '';
          if (!text && typeof input.filePath === 'string' && input.filePath.trim()) {
            text = await readFile(input.filePath.trim(), 'utf8');
          }
          if (!text.trim()) throw new Error('text 或 filePath 至少要给一个，且不能为空');
          const mode = input.mode === 'review' || input.mode === 'check' ? input.mode : 'scan';
          const preferred = input.lang === 'zh' || input.lang === 'en' ? input.lang : settings.defaultLang;
          const requested = preferred === 'zh' || preferred === 'en' ? preferred : detectLang(text);
          const docType = input.docType === 'proposal' ? 'proposal' : 'paper';
          const agency = input.agency === 'nsf' ? 'nsf' : 'nih';

          if (requested === 'en') {
            const { lines, verdict, findings, metrics, claims } = buildReportEn(text, docType, agency);
            const head = [...lines];
            if (mode === 'review') {
              head.push(
                '',
                '## 八、改写方案（等用户确认后再落笔）',
                '',
                '| # | 原句 | 问题类型 | 改法 | 改写后 |',
                '|---|---|---|---|---|',
                '| 1 |  | Layer 4 无证据 | 补证据指针 / 降级动词 |  |',
                '| 2 |  | Layer 2 过强动词 | 换成 show / provide evidence |  |',
                '| 3 |  | Layer 1 AI 词 | 换常用词或删 |  |',
                '',
                '改写后必须确认：**数字、公式、引用一个都没变；段落数与原文一致。**',
              );
            }
            if (mode === 'check') {
              head.push('', '## 八、复查结论', '', verdict.startsWith('基本通过') ? '改写后已无明显机器痕迹，可以进入人工通读与语域核对。' : '改写后仍有问题，先修论断↔证据，再看用词。');
            }
            return {
              mode,
              lang: 'en',
              report: head.join('\n'),
              verdict,
              findings: findings.length ? findings : ['未发现明显机器痕迹。'],
              riskyParagraphs: claims,
              chars: text.length,
            };
          }

          const register = input.register === 'thesis' || input.register === 'report' ? input.register : 'journal';
          const { lines, verdict, findings, metrics, risky } = buildReport(text);
          const registerNote = {
            journal: '期刊论文：第一人称少用（"本文"优先），口语化容忍度低，破折号适中偏少。',
            thesis: '学位论文：可用"笔者"，口语化容忍度中，破折号适中。',
            report: '研究报告：用"本研究/本报告"，口语化容忍度中低，破折号少。',
          }[register];
          const head = [...lines];
          head.splice(2, 0, `- 语体标定：${registerNote}`);
          if (mode === 'review') {
            head.push('', '## 七、改写方案（等用户确认后再落笔）', '', REVIEW_TEMPLATE);
          }
          if (mode === 'check') {
            head.push(
              '',
              '## 七、复查结论',
              '',
              verdict.startsWith('基本通过')
                ? '改写后已无明显机器痕迹，可以进入人工通读。'
                : '改写后仍有问题，按上面的高风险段落继续处理；若已出现口语化，先退回书面表达。',
            );
          }
          return {
            mode,
            lang: 'zh',
            report: head.join('\n'),
            verdict,
            findings: findings.length ? findings : ['未发现明显机器痕迹。'],
            riskyParagraphs: risky.length,
            chars: text.length,
            sentenceCv: metrics.cv,
          };
        },
      }),
    );

    disposers.push(
      registerTool({
        name: 'cnki_word_plan',
        description:
          '生成 Word 论文排版方案与交付前自检清单：样式体系、中文字体设置、图/表题注、交叉引用、三线表线宽、公式 SEQ 域编号与书签引用、GB/T 7714 参考文献格式、目录页码与 F9 通刷。可顺带审计参考文献条目的常见格式错误。',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: '论文题目或主题（可留空）' },
            refs: {
              type: 'array',
              items: { type: 'string' },
              description: '参考文献条目原文，逐条审计格式',
            },
            numberByChapter: { type: 'boolean', description: '图表是否按章编号（图 2-1 这种）' },
            hasTemplate: { type: 'boolean', description: '是否已有学校模板' },
          },
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              plan: { type: 'string' },
              steps: { type: 'array', items: { type: 'string' } },
              refFindings: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer' },
                    text: { type: 'string' },
                    issues: { type: 'array', items: { type: 'string' } },
                  },
                  additionalProperties: true,
                },
              },
            },
            required: ['plan'],
            additionalProperties: true,
          },
          render: (_args, value) => [{ type: 'text', text: value.plan }],
        },
        async execute(args) {
          const input = args ?? {};
          const refs = Array.isArray(input.refs) ? input.refs.filter((r) => typeof r === 'string' && r.trim()) : [];
          const refFindings = refs.map((text, index) => {
            const issues = [];
            for (const [label, pattern, hint] of REF_FORMAT_RULES) {
              if (pattern.test(text)) issues.push(`${label}——${hint}`);
            }
            if (!/\[(J|M|D|C|N|S|P|R|G|Z|EB|DB|CP|DS|PP)(\/OL)?\]/.test(text)) {
              issues.push('未找到文献类型标识——题名后应有 [J]/[M]/[D] 等');
            }
            return { index: index + 1, text, issues: issues.length ? issues : ['未发现常见格式错误'] };
          });

          const lines = [
            `# Word 排版方案：${input.topic ?? '（未命名论文）'}`,
            '',
            input.hasTemplate === true
              ? '- 已确认有学校模板：**一律在模板副本里填**，不另起新文档；目录、封面、图表位置需人工核对。'
              : '- 未提供学校模板：先按本文通用格式排，拿到模板后再套（套模板等于重排，越早越好）。',
            input.numberByChapter === true
              ? '- 图表按章编号：题注【编号】勾选"包含章节号"，章节样式选「标题 1」，分隔符用 `-`。'
              : '- 图表全文连号：题注直接 `SEQ 图`，不勾"包含章节号"。',
            '',
            '## 一、执行顺序',
            '',
            '| 步骤 | 动作 |',
            '|---|---|',
            ...WORD_STEPS.map(([name, detail]) => `| ${name} | ${detail} |`),
            '',
            '## 二、三层域（记住这一条就不会写错）',
            '',
            '| 层 | 域 | 作用 |',
            '|---|---|---|',
            '| 题注编号 | `SEQ 图` / `SEQ 表` / `SEQ 公式` | 生成编号，按文档流递增 |',
            '| 正文引用 | `REF 书签` | 读取编号，题注变了引用跟着变 |',
            '| 目录 | `TOC \\c "图"` / `TOC \\o "1-3"` | 收集题注或标题生成目录 |',
            '',
            '公式编号（按章）：`{ STYLEREF 标题 1 \\s } - { SEQ 公式 \\* ARABIC \\s 1 }`',
            '',
            '## 三、三线表线宽',
            '',
            '| 线 | 磅值 | python-docx 的 `w:sz` |',
            '|---|---|---|',
            '| 顶线 | 1.5 磅 | 12 |',
            '| 栏目线 | 0.75 磅 | 6 |',
            '| 底线 | 1.5 磅 | 12 |',
            '',
            '无竖线、无其他横线；`w:sz` 单位是 1/8 磅，写错一位粗细就差一倍。',
            '',
            '## 四、参考文献（顺序编码制）',
            '',
            '- 正文标注放在句末标点**之前**：`……已成为研究热点[1]。`',
            '- 连续引用写 `[1-3]`，不连续写 `[1,3,5]`；按首次引用顺序编号。',
            '- 条目标点：项目之间 `. `，年与卷之间 `, `，卷期与页码之间 `: `，析出文献用 `//`。',
            '- 超过 3 个责任者只著录前 3 个，后加 `, 等`（西文 `, et al`）。',
            '- **参考文献的交叉引用不要靠 Word 自带的"交叉引用"手动维护编号**：它不会按首次引用顺序重排。用 Zotero / EndNote 插入域，或给条目设书签再用 `REF`。',
            '- 版本提醒：GB/T 7714—2015 仍是多数模板的依据；GB/T 7714—2025 已于 2026-07-01 实施，新增数据集 `[DS]`、预印本 `[PP]` 等类型。以学校/期刊通知为准。',
            '',
          ];

          if (refFindings.length) {
            lines.push('## 五、参考文献格式审计', '', '| # | 条目 | 问题 |', '|---|---|---|');
            for (const item of refFindings) {
              lines.push(`| ${item.index} | ${item.text.slice(0, 60)} | ${item.issues.join('；')} |`);
            }
            lines.push('');
          } else {
            lines.push('## 五、参考文献格式审计', '', '未提供参考文献条目。把条目原文放进 `refs` 参数可逐条审计格式。', '');
          }

          lines.push(WORD_CHECKLIST, '', '> 完整规则见 `references/word-playbook.md`；程序化体检用 `assets/tools/format_docx.py check`。');

          return {
            plan: lines.join('\n'),
            steps: WORD_STEPS.map(([name]) => name),
            refFindings,
          };
        },
      }),
    );

    disposers.push(
      registerTool({
        name: 'cnki_diagram_plan',
        description:
          '论文插图（架构图/流程图/技术路线图）方案：判断图为什么会糊、选画图路线（原生矢量形状 / Visio→EMF / draw.io→SVG / 600dpi 位图）、给可直接运行的 draw_diagram.py 规格文件、以及图文规范与验收清单。',
        parameters: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: '图的主题，例如「平台总体架构」「研究技术路线」' },
            kind: {
              type: 'string',
              enum: ['architecture', 'flowchart', 'roadmap', 'generic'],
              description: 'architecture 架构图 / flowchart 流程图 / roadmap 技术路线图 / generic 通用',
            },
            hasVisio: { type: 'boolean', description: '本机是否安装了 Visio' },
            needEditable: { type: 'boolean', description: '是否需要在 Word 里继续改字改色' },
            nodes: {
              type: 'array',
              items: { type: 'string' },
              description: '已知的节点名称（每层用 "层级:名称1,名称2" 表示，或直接写名称）',
            },
          },
          additionalProperties: false,
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              plan: { type: 'string' },
              spec: { type: 'object', additionalProperties: true },
              route: { type: 'string' },
            },
            required: ['plan'],
            additionalProperties: true,
          },
          render: (_args, value) => [{ type: 'text', text: value.plan }],
        },
        async execute(args) {
          const input = args ?? {};
          const kind = input.kind ?? 'generic';
          const hasVisio = input.hasVisio === true;
          const needEditable = input.needEditable !== false;

          // 依据"有没有 Visio / 要不要在 Word 里继续改"给路线
          let route;
          let routeText;
          if (needEditable && !hasVisio) {
            route = 'draw_diagram.py（原生 DrawingML 形状组）';
            routeText =
              '本机没有 Visio，又要能在 Word 里改字改色 → 用 `draw_diagram.py` 生成原生形状组：真矢量、双击可编辑、不依赖任何 Office 组件。';
          } else if (needEditable && hasVisio) {
            route = 'Visio 绘制 → 选择性粘贴为 EMF';
            routeText =
              '有 Visio 且要保留可编辑性 → Visio 里 `Ctrl+A`/`Ctrl+C`，Word 里 `Ctrl+Alt+V` → 选【图片（增强型图元文件）】；要能双击回 Visio 编辑就走【插入 → 对象 → 由文件创建】。';
          } else {
            route = 'draw_diagram.py（SVG + 600dpi PNG 双出）';
            routeText =
              '不需要在 Word 里编辑 → 生成 SVG（矢量，可进 draw.io/AI 二次编辑），若投稿系统只收位图再补一张 600 dpi PNG。';
          }

          // 依据图种给默认规格
          const presets = {
            architecture: [
              ['接入层', 'Web 前端,移动端,开放 API'],
              ['网关', '统一接入网关'],
              ['服务层', '用户服务,课程服务,分析服务'],
              ['数据层', '业务库,数据湖'],
            ],
            flowchart: [
              ['开始', '开始'],
              ['处理', '收集数据,清洗数据'],
              ['判断', '是否达标？'],
              ['结束', '输出结果'],
            ],
            roadmap: [
              ['阶段一', '文献调研'],
              ['阶段二', '模型构建'],
              ['阶段三', '实证检验'],
              ['阶段四', '结论与建议'],
            ],
            generic: [['第一层', '节点 A,节点 B'], ['第二层', '节点 C'], ['第三层', '节点 D']],
          };
          const preset = presets[kind] ?? presets.generic;

          const given = Array.isArray(input.nodes) ? input.nodes.filter((n) => typeof n === 'string' && n.trim()) : [];
          const rows = given.length
            ? given.map((line) => {
                const i = line.indexOf(':');
                if (i > 0 && !line.includes('：')) return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
                const j = line.indexOf('：');
                if (j > 0) return [line.slice(0, j).trim(), line.slice(j + 1).trim()];
                return [null, line.trim()];
              })
            : preset;

          const spec = { title: input.topic ?? '（未命名插图）', direction: 'TB', nodes: [], edges: [] };
          let idx = 0;
          const levelIds = [];
          for (const [label, names] of rows) {
            const ids = [];
            for (const raw of String(names).split(/[,，、]/).map((s) => s.trim()).filter(Boolean)) {
              const id = `n${idx++}`;
              spec.nodes.push({ id, label: raw, level: levelIds.length });
              ids.push(id);
            }
            levelIds.push(ids);
          }
          for (let lv = 0; lv < levelIds.length - 1; lv += 1) {
            for (const from of levelIds[lv]) {
              for (const to of levelIds[lv + 1]) spec.edges.push({ from, to });
            }
          }
          const shapeHint =
            kind === 'flowchart'
              ? '流程图把首尾节点改成 `"shape": "terminator"`，判断节点改成 `"shape": "diamond"`，分支线用 `"label": "是" / "否"`。'
              : kind === 'architecture'
                ? '架构图把数据层节点改成 `"shape": "cylinder"`，接入层用 `"shape": "round"`。'
                : '需要区分层次时给节点加 `"shape"`（rect/round/terminator/diamond/ellipse/parallelogram/cylinder/hexagon）。';

          const lines = [
            `# 插图方案：${input.topic ?? '（未命名插图）'}`,
            '',
            `- 图种：${kind}`,
            `- 推荐路线：**${route}**`,
            `- 依据：${routeText}`,
            '',
            '## 一、先判断你的图为什么糊',
            '',
            '| 检测 | 矢量正常表现 | 位图异常信号 |',
            '|---|---|---|',
            '| Word 里右键图片 | 有【编辑图片】/【转换为形状】 | 只有【设置图片格式】 |',
            '| 放大到 400% | 边缘始终锐利 | 马赛克、锯齿 |',
            '| 另存 PDF 后看图像属性 | `Vector graphic` | `Image (RGB, 96 dpi)` |',
            '',
            '三道栅格化关：粘贴时按 96 dpi 抓位图 → Word 默认压缩 → 导出 PDF 按 220 dpi 再采样。',
            '**必做的全局设置**：文件 → 选项 → 高级 → 图像大小和质量 → 勾【不压缩文件中的图像】、默认分辨率设【高保真】。',
            '',
            '## 二、路线对照',
            '',
            '| 路线 | 矢量 | 能在 Word 里改 | 需要什么 |',
            '|---|---|---|---|',
            '| 代码生成原生形状 | ✅ | ✅ | 只要 Python |',
            '| Word/WPS 原生绘图 | ✅ | ✅ | Office |',
            '| draw.io → SVG | ✅ | 转换后可改 | 浏览器 |',
            '| Visio → 选择性粘贴 EMF | ✅ | ✅ 双击回 Visio | 装了 Visio |',
            '| 位图 300/600 dpi | ❌ | ❌ | 期刊强制时 |',
            '',
            hasVisio
              ? '> 本机已装 Visio：优先 Visio 画 + `Ctrl+Alt+V` 选【图片（增强型图元文件）】。'
              : '> 本机未装 Visio（Visio.Application 的 CLSID 未注册）：不要走 Visio 路线，用下面的代码生成或 Word/WPS 原生形状。',
            '',
            '## 三、这一张图怎么落地',
            '',
            '把下面的 JSON 存成 `spec.json`，然后：',
            '',
            '```bash',
            'python assets/tools/draw_diagram.py build spec.json 图.docx --caption "图 1-1 ' + (input.topic ?? '插图') + '"',
            'python assets/tools/draw_diagram.py build spec.json 图.svg      # 需要二次编辑时',
            'python assets/tools/draw_diagram.py build spec.json 图.png --dpi 600   # 期刊只收位图时',
            '```',
            '',
            '```json',
            JSON.stringify(spec, null, 2),
            '```',
            '',
            `**调整要点**：${shapeHint}`,
            '',
            '不写 `level` 会按最长路径自动分层；跨度 ≠ 1 的边自动走右侧通道，不会穿过中间节点。',
            '',
            '## 四、图文规范（比清晰度更容易丢分）',
            '',
            '| 项 | 做法 |',
            '|---|---|',
            '| 图题 | 图**下方**居中，「图 3-2 图名」，用题注 `SEQ` 域自动编号 |',
            '| 图中字号 | 比正文小 1–2 号（正文小四 → 图内五号/小五），不得大于正文 |',
            '| 线宽 | 0.5–1 pt，框图边框 1–1.5 pt；低于 0.25 pt 印刷断线 |',
            '| 宽度 | 单栏图不超过版心宽；超出会被 Word 压回去导致比例失真 |',
            '| 黑白可读 | 不能只靠颜色区分，还要有线型或标注 |',
            '| 首次引用 | 正文先出现「如图 3-2 所示」，再出现该图 |',
            '',
            '## 五、验收清单',
            '',
            '1. 放大 400%：线条与文字边缘锐利；',
            '2. 另存 PDF：图像属性显示 `Vector graphic`，没有 96 dpi 的 Image 对象；',
            '3. 文件体积：一张架构图几 KB 到几十 KB，几百 KB 基本是位图；',
            '4. 右键：能【编辑图片/转换为形状/编辑对象】；',
            '5. 灰度打印预览：信息仍可读。',
            '',
            '> 任何一条不过，别指望调高 PPI 能救——PPI 只放大已有像素，不恢复矢量精度。完整规则见 `references/diagram-playbook.md`。',
          ];

          return { plan: lines.join('\n'), spec, route };
        },
      }),
    );
  } else {
    console.warn('[cnki-agent] ctx.tools 不可用，跳过工具注册');
  }

  // ---- 3) 面板/设置页的数据接口 ----
  //   GET  /api/cnki/library   检索历史 + 文献清单（右侧栏面板）
  //   GET  /api/cnki/activity  调用统计 + 最近调用（设置页 / 面板共用）
  //   POST /api/cnki/settings  改写运行设置并落盘
  const connection = ctx.get('connection');
  const registerRoute = connection?.fetch?.register;
  if (typeof registerRoute === 'function') {
    disposers.push(
      connection.fetch.register({
        path: '/api/cnki/library',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () =>
          jsonResponse({
            searches: library.searches.slice(0, 20),
            sources: library.sources.slice(0, 80),
            counts: { searches: library.searches.length, sources: library.sources.length },
            updatedAt: library.updatedAt,
          }),
      }),
    );

    disposers.push(
      connection.fetch.register({
        path: '/api/cnki/activity',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () =>
          jsonResponse({
            activity: snapshotActivity(),
            settings,
            settingsFile,
            settingsError: activity.settingsError,
            library: { searches: library.searches.length, sources: library.sources.length },
            tools: typeof tools?.schemas === 'function' ? (tools.schemas() || []).length : null,
          }),
      }),
    );

    disposers.push(
      connection.fetch.register({
        path: '/api/cnki/settings',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let body = null;
          try {
            body = await request.json();
          } catch {
            return jsonResponse({ error: '请求体不是合法 JSON' }, 400);
          }
          const next = normalizeSettings(body, settings);
          Object.assign(settings, next);
          try {
            await settingsReady;
            await persistSettings(settingsFile, settings);
            activity.settingsError = null;
          } catch (error) {
            activity.settingsError = String(error && error.message ? error.message : error);
          }
          return jsonResponse({ settings, settingsError: activity.settingsError, settingsFile });
        },
      }),
    );
  } else {
    console.warn('[cnki-agent] connection.fetch 不可用，跳过 /api/cnki/* 路由（面板与设置页将显示提示）');
  }

  // ---- 4) 提示词上下文 ----
  const systemPrompt = ctx.get('systemPrompt');
  if (systemPrompt) {
    disposers.push(
      systemPrompt.context({
        name: 'cnki-agent',
        order: 60,
        text: () =>
          '【CNKIAgent】当用户要求排版、生成或修 Word 文档、插公式编号、做图表交叉引用、整理参考文献时：先用 cnki_word_plan 出排版方案，程序化体检用 assets/tools/format_docx.py（check 体检 / build 从 Markdown 生成），规则见 references/word-playbook.md；当用户说图片糊、要画架构图/流程图/技术路线图或提到 Visio 时：先用 cnki_diagram_plan 选路线出规格，再 python assets/tools/draw_diagram.py build spec.json 图.docx 生成原生矢量形状（无 Visio 时不要走 Visio 路线；糊的根因是位图被放大或重采样，调高 PPI 救不回来），规则见 references/diagram-playbook.md；铁律是一切编号用 SEQ/REF 域不手打、一切格式挂样式、改完 Ctrl+A 再 F9。当用户提出论文写作、文献调研、知网检索、精读仿写或选题需求时：第一步把需求拆成检索词单元并判断精确/泛检索；第二步用 cnki_search 按顺序逐个检索，保留可复现检索式；第三步用 cnki_reading_plan 精读（目录/引言逐句/正文覆盖/语体/AIGC 特征），第四步才用 cnki_research_map 或写作链输出。写作链必须分步：三级大纲 → 引言 → 正文（一次一小节）→ 校订，每步停下等用户确认。当用户要求降低 AIGC 率、去 AI 味、润色或"太像 AI"时：先跑 cnki_de_aigc(mode=scan) 出体检报告，再给改写方案等确认，改完用 cnki_de_aigc(mode=check) 复查；铁律是**语体优先于数值**——不许靠口语化、网络用语、碎句凑降低率，不许为"更像人"补造数据或文献。当稿件是**英文论文**时用 cnki_de_aigc(lang=en)，纪律换成 academic-humanizer 的**论断↔证据**：每个论断必须有数字/图/表/引用支撑，没有动词可以强过它的证据，破折号全删，超 30 词长句拆分，但有证据支撑的 hedging、恰当被动与 we 必须保留（把 suggests 改成 proves 是在制造过强论断）；当用户写**英文基金申请**（NSF Project Summary、NIH Specific Aims）时用 cnki_de_aigc(lang=en, docType=proposal, agency=nsf|nih)，申请书**不要压平愿景**，改的是论断↔可行性，首页（钩子/缺口/中心思想/aims/收益）改得最狠，绝不虚构预实验、前期资助或推荐信；规则见 references/academic-humanizer-en.md（改编自 AIScientists-Dev/academic-humanizer, MIT）。不得虚构文献、数据与结论。',
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
