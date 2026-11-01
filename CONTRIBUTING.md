# 贡献与开发约定

## 提交前自检

```bash
node --check lib/index.js
node --check lib/client.js
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8'))"
```

## 三条硬约束

### 1. 包内只允许 import `node:*`

宿主半侧 `lib/index.js` 与客户端半侧 `lib/client.js` 都**不能** import `@deepseek-ai/*`、`react` 之外的运行期包，也不能依赖 `schemastery` 之类的间接依赖。

所有宿主能力一律探测式获取：

```js
const tools = ctx.get('tools');
const skills = ctx.get('skills');
const web = ctx.get('web');
const systemPrompt = ctx.get('systemPrompt');
```

拿不到就**跳过并打印一行警告**，不要 throw——抛错会让整条插件行不激活。

### 2. 工具 JSON Schema 的 `type` 必须是单个字符串

```js
// ✗ 会让整条插件行加载失败
{ updatedAt: { type: ['string', 'null'] } }

// ✓
{ updatedAt: { type: 'string' } }
```

### 3. 工具返回值必须是无损 JSON

返回值里出现 `undefined`、函数、`Map`，整次调用会被判：

```
tool "cnki_search" returned invalid output: value is not lossless JSON
```

所以输出前统一规整成纯数据（字符串/数字/布尔/数组/普通对象），参考 `lib/index.js` 中 `cleanResults` 的写法。

## 浏览器通道

浏览器能力来自 `dsh-browser-cdp` 注册的 `bcdp_*` 工具。它们是**由别的插件注册**的，可能在 `apply()` 之后才出现，所以桥接必须**惰性查找**（见 `ensureToolRegistry`），不能在 `apply` 时一次性快照。

当前用到的四个工具：

| 工具 | 用途 |
|---|---|
| `bcdp_status` | 探活 |
| `bcdp_space` | 打开/关闭浏览器任务空间 |
| `bcdp_navigate` | 打开知网检索页 |
| `bcdp_js` | 填检索框、提交、解析结果表 |

> 遇到知网安全验证页（`/verify`）时，桥接会报「未解析到结果行」，此时交由用户在可见窗口人工过一次滑块。

## 结果解析

知网结果表的稳定特征（2026-10 实测）：

- 检索框：`#txt_search`
- 提交按钮：`.search-btn`
- 题录行：`table tr` 内的 `a[href*="/kcms2/article/abstract"]`
- 列序：题名 / 作者 / 来源 / 发表时间 / 数据库
- 命中总量：`.pagerTitleCell` 文本里的第一个数字

知网前端改版时优先检查这几处。

## 改动记录

在 PR 描述里写清：改了什么、为什么、如何验证（最好附一次真实检索的关键词与命中数）。
