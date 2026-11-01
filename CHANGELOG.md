# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.5.0] — 2026-11-02

### 新增：Word 排版 · 公式 · 交叉引用

- **`cnki_word_plan` 工具**（新）：输出 12 步排版执行顺序、三层域说明、三线表磅值与 `w:sz` 换算、顺序编码制要点、交付前自检清单；可对 `refs` 里的参考文献条目逐条审计常见格式错误（年卷分号、页码波浪线、专著缺出版地、网页缺引用日期、类型标识缺失…）。
- **`assets/tools/format_docx.py`**（新，python-docx）：
  - `check <docx>`：体检域 / 题注 / 交叉引用 / 标题样式 / 竖线表 / 重复标题行 / 字体 / Markdown 残留 / 参考文献编号断档，输出 Markdown 报告，有 error 时退出码 1；
  - `build <md> <docx>`：从 Markdown 生成带样式骨架的文档——标题样式、首行缩进 2 字符（`w:firstLineChars`）、中文字体（`w:eastAsia`）、三线表（顶底 1.5 磅 / 栏目线 0.75 磅、无竖线、重复标题行）、`SEQ` 题注域、`PAGE` 页码。
- **`references/word-playbook.md`**（新，约 1.3 万字符）：样式体系、题注 / `SEQ` / `REF` 三层域、公式「样式 + 制表位 + SEQ + 书签」方案（含 `STYLEREF 标题 1 \s` 按章编号）、三线表规范与新建表格样式、GB/T 7714 顺序编码制条目格式与 12 类示例、参考文献交叉引用的正确做法与坑、交付自检表、python-docx 能做 / 不能做清单。
- 技能新增 **R7 排版路线**，并把三条铁律写进技能与常驻系统提示：**编号用域不手打、格式挂样式不手调、改完 `Ctrl+A` → `F9`**。

### 修正

- 规范表述由「GB/T 7714—2015」改为「GB/T 7714（2015 / 2025）」：GB/T 7714—2025 已于 2026-07-01 实施，新增数据集 `[DS]`、预印本 `[PP]` 等类型，提交前以学校 / 期刊通知为准。

### 规则来源

国家标准全文公开系统（GB/T 7714—2025 发布 / 实施日期）、GB/T 7714 著录示例、Word 题注与 `SEQ` / `REF` 域机制教程（CSDN、InkFount）、三线表线宽规范、GitHub `ZyhSechub/chinese-thesis-workbench-skill`（MIT：默认论文格式、DOCX 交付模式 M1–M4、交付前检查清单）。

## [0.4.0] — 2026-10-31

### 新增：去 AI 味与语体配平

- **`cnki_de_aigc` 工具**（新）：对论文片段做机器痕迹体检，三种模式
  - `scan`（默认）：输出硬指标表、高风险段落清单、处理顺序；
  - `review`：生成逐段改写方案表，等用户确认后再落笔；
  - `check`：改写后复查。
- **`references/de-aigc-playbook.md`**（新，约 1.5 万字符）：完整规则手册，含
  - 检测器原理三条常识（测的是模式规律性、同义词替换无效、学术文体本身假阳性高）；
  - **三级落点对照表**：`降重不足` / `降重过度（口语化）` / `恰当（书面学术）`，只有最后一档合格；
  - 三步流程：划保护区 → 扫描定位 → 按优先级重写；
  - 17 类模式清单（理论起笔、段末套句、编号并列、三元对称、模糊归因、泛化结论、破折号滥用…）各带改前/改后示例；
  - AI 高频词两级词表、口语化黑名单、输出前 12 项自检、6 维评分、8 条常见错误、合规边界。
- 技能正文新增 **R6 去 AI 味路线**，并把硬指标写进技能与常驻系统提示：每段 AI 高频词 ≤2、段末套句全文 ≤1、泛化结尾 0、模糊归因 0、破折号每段 ≤1、正文加粗 ≤5、术语全文统一。
- 核心原则：**语体优先于"降低率"**——不许靠口语化、网络用语、碎句凑数，不许为"更像人"补造数据或文献。

### 修复

- `cnki_de_aigc` 允许通过 `filePath` 读文件，补齐 `readFile` 导入。
- `package.json` 补回 `scripts.check`、`repository` / `bugs` / `homepage` / `keywords`，`files` 加入 `scripts`。

### 规则来源

Wikipedia《Signs of AI writing》、GitHub `xiaofenggan01/aigc-reduce`（MIT）、GitHub `redbaronyyyyy-eng/humanizer-zh-academic`（MIT），以及哔哩哔哩 / CSDN 上多篇实测帖的经验值（仅作参考，非权威标准）。

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
