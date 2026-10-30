# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.3.0] — 2026-10-30

### 新增

- **真实知网检索通道**：`cnki_search` 通过 `dsh-browser-cdp` 的 `bcdp_*` 工具驱动本机 Edge，打开 `kns.cnki.net` 真实检索并解析结果表，返回标题 / 期刊 / 日期 / 文献类型 / 摘要页链接。
- 浏览器通道失败时自动回退到 `ctx.web`，并在结果里用 `browserError` 说明失败原因。
- `cnki_search` 新增 `noBrowser` 参数，可强制只用回退通道。
- 检索报告 `saveTo` 落盘 Markdown（含每条检索式与命中）。

### 修复

- `value is not lossless JSON`：工具返回值里混入 `undefined` 导致整次调用被判非法，现在统一规整成无损 JSON。
- 浏览器工具由其他插件注册、可能在 `apply()` 之后才出现，桥接改为惰性查找，避免加载顺序导致通道永远为空。
- `package.json` 编码：修正 BOM 与乱码，改为干净的 UTF-8。

## [0.2.0] — 2026-10-29

### 新增

- 右侧栏文献库面板：`sidebar.right.pane.tab` 页签「CNKI 文献库」，展示检索历史与文献清单。
- 宿主路由 `GET /api/cnki/library` 与工具 `cnki_library`，面板与工具共用同一份内存数据。

### 修复

- 工具输出 schema 里的 `type: ['string','null']` 改为 `type: 'string'`，修复整条插件行不激活的问题。

## [0.1.0] — 2026-10-29

### 新增

- 首个可用版本：技能 `cnki-agent`、工具 `cnki_search` / `cnki_reading_plan` / `cnki_research_map`、系统提示上下文。
- 逐关键词顺序检索，精确/泛检索两种模式，检索式可复现。
