# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.7.0] — 2026-11-08

### 融合 academic-humanizer：英文论文与基金申请的改写纪律

整合 [AIScientists-Dev/academic-humanizer](https://github.com/AIScientists-Dev/academic-humanizer)（MIT），把它的六层规则实现为可运行的体检引擎，而不只是抄一份文档。

- **`cnki_de_aigc` 变双语**：新增 `lang`（`auto`/`zh`/`en`，默认按中文字符占比自动判断）。英文模式换一套纪律——**论断↔证据优先于用词**。
- **新增「论断↔证据」审计（Layer 4）**：逐句找出带论断标记（prove/demonstrate/establish/confirm/guarantee/superior/outperform/significantly/novel/first）但**没有数字、图、表、公式或引用指针**的句子，并标记动词强度是否超过证据、`significantly` 是否未量化。这是本插件此前缺失的能力。
- **英文词表与句式检测**：`delve/underscore/intricate/tapestry/testament/pivotal/showcase/foster/leverage/realm/seamless` 等 AI 高频词；`paves the way`、`to the best of our knowledge`、`in recent years`、`plays a crucial role`、`serves as` 等套话；过强动词、空强度词、模糊 hedging、引用堆砌 `[3, 7, 9, 12, 15]`、破折号（要求全删）、超 30 词长句、连续句以 Moreover/Furthermore/Additionally 开头。
- **基金申请模式**：`docType=proposal` + `agency=nsf|nih` 触发 NSF/NIH 结构检查单，并检测首页弱招——空泛重要性、空洞影响、中心假设被 hedge 掉、把方法当 aim、多米诺 aim、样板化 Broader Impacts。申请书**不压平愿景**，纪律换成「论断↔可行性」。
- **`references/academic-humanizer-en.md`**（新）：六层规则全文的中文重排版（通用痕迹 / 学术痕迹 11 条 / 必须保留的学术构造 / 论断↔证据 / 语域校准 / NSF·NIH 申请书模式），含中英分工表。
- **`THIRD-PARTY-NOTICES.md`**（新）：MIT 许可原文、引入位置、改动说明，以及上游 blader/humanizer 与 ARMS 的致谢。
- 技能新增 **R6-EN** 与 **R6-PROP** 两条路由；系统提示加入「英文用论断↔证据，把 suggests 改成 proves 是制造过强论断」。

### 中文模式零回归

`lang` 缺省为 `auto`，纯中文文本仍走原引擎，输出与 0.6.0 一致（已用同一段中文样本对拍）。

### 实测证据

英文样本（含 `In recent years…`、`novel`、`significantly outperforms`、`paving the way`、em-dash、连续 Moreover/Furthermore/Additionally）正确判定「需处理：存在无证据支撑的论断」，并逐条列出无证据论断、套话与破折号；NIH 申请书样本正确命中 4 类首页弱招并给出 NIH 检查单。

## [0.6.0] — 2026-11-04

### 新增：论文插图（架构图 / 流程图 / 技术路线图）

- **`cnki_diagram_plan` 工具**（新）：判断"图为什么糊"、按「有没有 Visio / 要不要在 Word 里继续改」选画图路线、直接产出可运行的 `spec.json`，并附图文规范与 5 条验收清单。
- **`assets/tools/draw_diagram.py`**（新）：把「节点 + 连线」的 JSON 渲染成三种产物。
  - `.docx`：**Word 原生 DrawingML 形状组**——真矢量、双击可改字改色、整组可缩放，不依赖 Office 组件；
  - `.svg`：给 draw.io / Illustrator 二次编辑；
  - `.png --dpi 600`：期刊只收位图时的高分辨率兜底。
  - 自动分层（最长路径）+ 重心法降交叉 + 正交折线路由；跨度 ≠ 1 的边自动走右侧通道，不穿中间节点；支持 `rect/round/terminator/diamond/ellipse/parallelogram/cylinder/hexagon` 八种形状与虚线边、边标签。
- **`references/diagram-playbook.md`**（新）：三重栅格化（96 dpi 快照 / 存储压缩 / PDF 220 dpi 重采样）与 30 秒诊断矩阵、"高保真"全局设置、五条画图路线对照（原生形状 / Word 手绘 / draw.io→SVG / Visio→EMF / 600 dpi 位图）、Visio 三种插入方式与字体转曲、draw.io 导出 SVG 的两处必改设置、SVG/EMF/PNG 选型、图文规范表、5 条验收。
- 技能新增 **R8 插图路线**，系统提示同步加入"图糊先判位图/矢量 + 无 Visio 不走 Visio 路线"。

### 环境事实（写进文档，避免给出走不通的方案）

本机 `Word.Application` COM 由 **WPS Office** 提供（Build 12.1.0.28022，路径指向 `…\office6`），**未安装 Microsoft Word，也未安装 Visio**（`Visio.Application` CLSID 未注册）。因此插图默认路线是「代码生成原生矢量形状」，Visio→EMF 仅作为有 Visio 时的参考。

### 实测证据

`draw_diagram.py` 生成的 docx（流程图与三层架构图各一）经 WPS 转 PDF 后，图形全部为路径对象、文字为真实文本，放大不失真；PNG 兜底图在 200/300 dpi 下渲染一致。

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
