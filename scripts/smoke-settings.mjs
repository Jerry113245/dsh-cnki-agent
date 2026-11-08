#!/usr/bin/env node
// 宿主半侧冒烟测试：不启动 DSH，用假 ctx 把 apply() 跑起来，
// 验证 ①7 个工具都被装了调用钩子 ②/api/cnki/activity 能读到调用记录
// ③/api/cnki/settings 能校验并落盘 ④关掉记录后不再累计。
//
// 用法：node scripts/smoke-settings.mjs

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const sandbox = await mkdtemp(join(tmpdir(), 'cnki-settings-'));
process.env.DSH_PROFILE_DIR = sandbox;

const { apply } = await import('../lib/index.js');

// ---- 假宿主 ----
const registeredTools = [];
const routes = [];
const disposers = [];

const fakeTools = {
  register(def) {
    registeredTools.push(def);
    return async () => {};
  },
  schemas: () => [],
  get: () => undefined,
};

const ctx = {
  get(key) {
    if (key === 'tools') return fakeTools;
    if (key === 'skills') return { register: () => async () => {} };
    if (key === 'systemPrompt') return { context: () => async () => {} };
    if (key === 'connection') {
      return {
        fetch: {
          register(route) {
            routes.push(route);
            return async () => {};
          },
        },
      };
    }
    return undefined;
  },
};

apply(ctx);

// ---- 1) 工具都被包装 ----
check('注册了 7 个工具', registeredTools.length === 7, registeredTools.map((t) => t.name).join(', '));
check(
  '每个工具都带调用钩子',
  registeredTools.every((t) => t.__cnkiInstrumented === true),
  registeredTools.filter((t) => !t.__cnkiInstrumented).map((t) => t.name).join(',') || '全部已包装',
);

const byName = (n) => registeredTools.find((t) => t.name === n);
const activityRoute = routes.find((r) => r.path === '/api/cnki/activity');
const settingsRoute = routes.find((r) => r.path === '/api/cnki/settings');
check('注册了 3 条路由', routes.length === 3, routes.map((r) => r.path).join(', '));
check('有 GET /api/cnki/activity', Boolean(activityRoute));
check('有 POST /api/cnki/settings', Boolean(settingsRoute));

const readActivity = async () => (await activityRoute.fetch(new Request('http://x/api/cnki/activity'))).json();
const postSettings = async (body) =>
  (
    await settingsRoute.fetch(
      new Request('http://x/api/cnki/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
  ).json();

// ---- 2) 调用一次真工具，记录必须出现 ----
const before = await readActivity();
check('初始调用数为 0', before.activity.total === 0, `total=${before.activity.total}`);

const report = await byName('cnki_de_aigc').execute({
  text: '本文提出了一种新的方法。值得注意的是，该方法具有重要的理论意义和实践价值。综上所述，本研究为后续工作提供了有益参考。',
  mode: 'scan',
});
check('cnki_de_aigc 正常返回报告', typeof report.report === 'string' && report.report.length > 50, `report=${(report.report || '').length} 字`);

const after = await readActivity();
check('调用后被记了 1 次', after.activity.total === 1, `total=${after.activity.total}`);
check('按工具名计数', after.activity.counts.cnki_de_aigc === 1, JSON.stringify(after.activity.counts));
check(
  '最近调用含成败与耗时',
  Boolean(after.activity.recent[0]) && after.activity.recent[0].ok === true && typeof after.activity.recent[0].ms === 'number',
  JSON.stringify(after.activity.recent[0]?.ms),
);
check('参数摘要不含全文', Boolean(after.activity.recent[0]?.summary) && !after.activity.recent[0].summary.includes('综上所述'), after.activity.recent[0]?.summary);

// ---- 3) 失败也要留痕 ----
await byName('cnki_de_aigc')
  .execute({ text: '   ' })
  .catch(() => {});
const afterFail = await readActivity();
check('失败调用也记录', afterFail.activity.total === 2 && afterFail.activity.recent[0].ok === false, `total=${afterFail.activity.total}, ok=${afterFail.activity.recent[0].ok}`);

// ---- 4) 设置写入 + 越界夹取 ----
const saved = await postSettings({ defaultLang: 'en', defaultMaxResults: 999, recordActivity: true, bogus: 'x' });
check('合法值被接受', saved.settings.defaultLang === 'en', saved.settings.defaultLang);
check('越界值夹到 20', saved.settings.defaultMaxResults === 20, String(saved.settings.defaultMaxResults));
check('未知字段被丢弃', !('bogus' in saved.settings));
check('写盘成功', !saved.settingsError, saved.settingsError || saved.settingsFile);

const onDisk = JSON.parse(await readFile(saved.settingsFile, 'utf8'));
check('落盘内容与返回一致', onDisk.defaultLang === 'en' && onDisk.defaultMaxResults === 20, saved.settingsFile);

const illegal = await postSettings({ defaultLang: 'xx' });
check('非法语种被忽略', illegal.settings.defaultLang === 'en', illegal.settings.defaultLang);

// ---- 5) defaultLang 真的影响工具默认行为 ----
const backToZh = await postSettings({ defaultLang: 'en' });
const enReport = await byName('cnki_de_aigc').execute({ text: 'We propose a novel framework that significantly improves accuracy.' });
check('defaultLang=en 时英文文本走英文规则', /claim|evidence|论断|证据|overclaim|hedging/i.test(enReport.report), `lang=${enReport.lang ?? 'n/a'}`);

// ---- 6) 关掉记录后不再累计 ----
await postSettings({ recordActivity: false });
const beforeOff = (await readActivity()).activity.total;
await byName('cnki_de_aigc').execute({ text: '这是一段用于测试的中文文本，方法部分描述实验流程。' });
const afterOff = (await readActivity()).activity.total;
check('关闭记录后不再累计', afterOff === beforeOff, `${beforeOff} -> ${afterOff}`);

await postSettings({ recordActivity: true });

// ---- 收尾 ----
await rm(sandbox, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length > 0) {
  console.error(`失败：${failed.map((f) => f.name).join('; ')}`);
  process.exit(1);
}