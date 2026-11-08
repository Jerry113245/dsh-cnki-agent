// 英文/中文去 AI 味引擎冒烟测试：node scripts/smoke-humanizer.mjs
// 校验三件事：英文论断↔证据报告、中文模式零回归、申请书模式检查单。

const mod = await import('../lib/index.js');

const registered = [];
mod.apply({
  get: (name) =>
    name === 'tools'
      ? { register: (tool) => { registered.push(tool); return () => {}; } }
      : null,
});

const tool = registered.find((t) => t.name === 'cnki_de_aigc');
if (!tool) throw new Error('cnki_de_aigc 未注册');

// 1) 英文：含套路开头、过强动词、em-dash、断言无证据
const enText = [
  'In recent years, graph learning has attracted increasing attention.',
  'We propose a novel method and demonstrate that it significantly outperforms baselines, paving the way for a new paradigm.',
  'Our method improves F1 by 3-6 points over focal loss (Table 2).',
].join(' ');
const en = await tool.execute({ text: enText, lang: 'en' }, {});
if (en.lang !== 'en') throw new Error(`英文模式未生效：lang=${en.lang}`);
if (!en.report.includes('论断')) throw new Error('英文报告缺少论断↔证据小节');
if (!Array.isArray(en.findings) || en.findings.length === 0) throw new Error('英文 findings 为空');
if (!/不合格|需处理|需改写|接近通过|基本通过/.test(en.verdict)) throw new Error(`英文结论异常：${en.verdict}`);

// 2) 中文：零回归（原引擎输出结构不变）
const zhText = '随着技术的发展，该领域受到广泛关注。研究表明，这一方法具有重要意义。首先，数据质量需要提升；其次，模型结构需要优化。';
const zh = await tool.execute({ text: zhText }, {});
if (zh.lang !== 'zh') throw new Error(`中文自动识别失败：lang=${zh.lang}`);
if (!zh.report.includes('去 AI 味体检报告')) throw new Error('中文报告标题变了（回归）');
if (!zh.report.includes('语体标定')) throw new Error('中文报告缺少语体标定（回归）');

// 3) 申请书模式：弱招 + 检查单
const propText = 'Early detection is a very important and timely problem. In this proposal we will explore whether machine learning might possibly help. Aim 1: apply our model to ICU data.';
const prop = await tool.execute({ text: propText, lang: 'en', docType: 'proposal', agency: 'nih' }, {});
if (!prop.report.includes('申请书')) throw new Error('申请书模式未生效');
if (!prop.report.includes('Specific Aims')) throw new Error('NIH 检查单缺失');
if (!prop.findings.some((f) => f.includes('弱招'))) throw new Error('申请书弱招未检出');

// 4) 混排文本应按中文字符占比判为中文
const mixed = await tool.execute({ text: '本文提出了一种新方法 novel method，并在三组数据集上做了实验，误差降低了 12%。' }, {});
if (mixed.lang !== 'zh') throw new Error(`混排文本应判为 zh，实际 ${mixed.lang}`);

console.log('✓ humanizer 引擎冒烟通过');
console.log('  en :', en.verdict.slice(0, 36));
console.log('  zh :', zh.lang, '|', zh.verdict.slice(0, 30));
console.log('  prop:', prop.findings.find((f) => f.includes('弱招')));