# CNKIAgent · 知网论文研究助手

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> 输入一段论文需求，它拆关键词、逐词检索知网、按核心期刊编辑的视角精读、出研究版图与选题，再按「大纲 → 引言 → 正文 → 校订」分步写作。
> 全程不虚构文献、不虚构数据，检索式可复现。

---

## 目录

- [它解决什么问题](#它解决什么问题)
- [核心特性](#核心特性)
- [安装](#安装)
- [前置条件：真实知网检索靠本地浏览器](#前置条件真实知网检索靠本地浏览器)
- [快速上手](#快速上手)
- [工具](#工具)
- [技能](#技能)
- [右侧栏文献库面板](#右侧栏文献库面板)
- [去 AI 味与语体配平](#去-ai-味与语体配平)
- [Word 排版 · 公式 · 交叉引用](#word-排版--公式--交叉引用)
- [论文插图 · 架构图 / 流程图](#论文插图--架构图--流程图)
- [设计原则](#设计原则)
- [已知限制](#已知限制)
- [仓库结构](#仓库结构)
- [开发](#开发)
- [License](#license)

---

## 它解决什么问题

用大模型写论文，最常见的三种失败不是"文笔差"，而是：

1. **检索是假的**——没有真的打开知网，文献是编的；
2. **读得浅**——只看标题和摘要里的一两句话，就开始下结论；
3. **一次写完全文**——没有大纲、没有确认、没有校订，结构塌陷。

CNKIAgent 把这三件事反过来做：**真实检索 → 编辑视角精读 → 分步写作**。

## 核心特性

| 特性 | 说明 |
|---|---|
| 真实知网检索 | 通过 [dsh-browser-cdp](https://www.npmjs.com/package/dsh-browser-cdp) 驱动**本机 Edge**，打开 `kns.cnki.net` 真实页面按关键词检索并解析结果表 |
| 逐词顺序执行 | 一个关键词一条检索式，顺序跑、失败不中断，每条检索式原样保留，可复现 |
| 精确 / 泛检索 | `precise` 加引号做短语检索，`general` 做主题词组合检索 |
| 编辑视角精读 | 检查单覆盖：目录结构、引言逐句解剖、正文覆盖、语体与 AIGC 特征、可仿写句型 |
| 研究版图 | 多篇文献按五维对照 → 共同点/分歧 → 三个切入点 → 三个实证题目 |
| 分步写作 | 三级大纲 → 引言 → 逐节正文（800–1000 字/节）→ 校订，**每步停下等确认** |
| 引用与排版 | GB/T 7714 引用审计（2015/2025）、Word 样式体系、题注与交叉引用、公式 SEQ 编号、三线表 |
| 论文插图 | 架构图/流程图/技术路线图，生成 Word 原生矢量形状组；自动分层与正交路由 |
| 右侧栏面板 | 检索历史与文献清单实时可见 |
| 优雅降级 | 浏览器通道不可用时自动回退到 `ctx.web`，并明确标注通道 |

## 安装

### 方式一：源码目录安装（推荐）

```bash
git clone https://github.com/Jerry113245/dsh-cnki-agent.git
```

然后在 DSH 里执行（绝对路径指向克隆下来的目录）：

```
plugin_manager install_bundle target = "<克隆路径>/dsh-cnki-agent"
```

安装返回 `application: applied` 即为生效。

### 方式二：npm 包安装

```
plugin_manager install_bundle target = "dsh-cnki-agent@0.3.0"
```

### 卸载 / 升级

版本替换需要先卸载再安装：

```
plugin_manager remove_bundle   target = "dsh-cnki-agent"
plugin_manager install_bundle  target = "<路径或版本>"
```

## 前置条件：真实知网检索靠本地浏览器

`cnki_search` 有两条通道：

| 通道 | 条件 | 命中质量 |
|---|---|---|
| **浏览器通道（推荐）** | 安装 `dsh-browser-cdp`，本机装有 Edge/Chrome | 真实知网题录：标题、期刊、日期、文献类型 |
| 回退通道 | DSH 配置了可用的 web 搜索 provider | 多为摘要页/镜像，`site:` 命中率不稳 |

安装浏览器通道：

```
plugin_manager install_bundle target = "dsh-browser-cdp@1.7.4"
```

> **首次访问知网会遇到滑块安全验证。** 浏览器窗口是可见的，人工过一次滑块即可，之后自动化检索正常。插件不会也无法绕过验证码。

## 快速上手

在对话里直接说需求即可触发技能 `cnki-agent`：

```
帮我写一篇关于"人工智能对教育公平影响"的论文，要求核心期刊水平
```

它会把需求拆成检索词单元，并逐个执行：

```
cnki_search(keywords = ["人工智能 教育公平", "数字鸿沟 教育"], mode = "general")
```

拿到题录后精读：

```
cnki_reading_plan(titles = ["...", "..."])
```

再合成研究版图与选题：

```
cnki_research_map(topic = "人工智能与教育公平", papers = [...])
```

> 写作链是**分步**的：三级大纲 → 引言 → 正文（一次一小节）→ 校订。每次都会停下来等你确认，不会一口气写完。

## 工具

| 工具 | 说明 |
|---|---|
| `cnki_search` | 按顺序逐个检索关键词，返回每条检索式 + 题录（标题/期刊/日期/文献类型/摘要页链接）；`saveTo` 可落盘 Markdown 检索报告 |
| `cnki_reading_plan` | 生成精读检查单：目录、引言逐句、正文覆盖、语体、AIGC 特征、仿写骨架 |
| `cnki_research_map` | 把多篇文献合成为研究版图：五维对照 → 共同点/分歧 → 三个切入点 → 三个实证题目 |
| `cnki_library` | 读取内存中的检索历史与文献库（与右侧栏面板共用同一份数据） |
| `cnki_de_aigc` | 去 AI 味体检与改写方案：AI 高频词、模糊归因、段末套句、对称并列、句长变异系数、破折号/加粗密度、口语化越界；`mode` 取 `scan` / `review` / `check` |
| `cnki_word_plan` | Word 排版方案 + 参考文献格式审计：12 步执行顺序、三层域（SEQ/REF/TOC）、三线表磅值、GB/T 7714 顺序编码制、交付自检清单；
| `cnki_diagram_plan` | 论文插图方案：判断图为什么糊、按「有没有 Visio / 要不要在 Word 里改」选画图路线（原生矢量形状 / Visio→EMF / draw.io→SVG / 600dpi 位图），直接产出可运行的 `spec.json` |
efs 可逐条审格式 |

`cnki_search` 参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `keywords` | string[] | 必填，逐个顺序检索 |
| `mode` | `precise` \| `general` | `precise` 做短语检索（加引号），默认 `general` |
| `site` | string | 回退通道使用的站点限定，默认 `kns.cnki.net` |
| `maxResultsPerKeyword` | integer | 每个关键词最多保留多少条（1–20，默认 8） |
| `saveTo` | string | 目录路径，写入 Markdown 检索报告 |
| 
oBrowser` | boolean | 强制只用回退通道 |

## 技能

`skills/cnki-agent/` 是一份完整的技能包（纯 Markdown，可离线阅读）：

- `SKILL.md` — 路由表（R1 研究版图 / R2 写作链 / R3 检索 / R4 精读 / R5 修订 / R6 去 AI 味）与输出纪律
- `references/workflow.md` — 六段式工作流与阶段闸门
- `references/word-playbook.md` — Word 排版全手册（样式 / 题注 / 公式 / 三线表 / 参考文献）
- `references/diagram-playbook.md` — 论文插图全手册（三重栅格化 / Visio·EMF / draw.io·SVG / 原生矢量 / 图文规范）
- `references/reading-checklist.md` — 核心期刊编辑视角的精读检查单
- `references/research-map.md` — 研究版图模板
- `references/de-aigc-playbook.md` — 去 AI 味与语体配平规则（降 AIGC 全手册）

写作纪律（写进技能与系统提示，不靠模型自觉）：

- 检索词必须单元化、可复现，一条检索式一个词；
- 未获取的段落标注「未获取」，不补写；
- 数据、文献、结论一律不得虚构；
- 降 AI 时语体优先：不许口语化凑降低率，不许补造事实；
- 写作链必须分步，每步停下等用户确认。

## 右侧栏文献库面板

插件在 `sidebar.right.pane.tab` 注册了一个「CNKI 文献库」页签：

- 顶部：检索次数 / 来源条数 / 最近更新时间 + 刷新按钮；
- 检索历史卡片：模式徽章、命中数、每条检索式带 ✓/✗；
- 文献清单：标题（可点开知网摘要页）、期刊·日期·类型、所属关键词；
- 每 20 秒轮询一次，与 `cnki_library` 工具共用 `/api/cnki/library` 路由。

样式只使用 DSH 主题变量（`--dsw-alias-*`），明暗主题自动跟随。

## 已实测

2026-10-30 在本机 Edge 上的真实检索记录（未经修饰）：

| 检索式 | 模式 | 命中 |
|---|---|---|
| `人工智能 教育公平` | general | 知网页面显示 1,463 条，插件返回前 5 条题录 |
| `"数字素养 教师"` | precise | 返回《信息生态视域下教师数字素养提升的价值、梗阻与路径》等题录 |
| `"职业教育 产教融合"` | precise | 返回《基于黄炎培职业教育教师观的教学创新团队建设模式与实践探索》等题录 |

题录字段含题名、期刊/报纸名、发表时间、文献类型与知网摘要页链接。

## 去 AI 味与语体配平

论文最容易死在两个方向：**太像 AI**（模板句式、整齐并列、空洞拔高），和**改过头**（满篇口语、网络词，机审过了人审被打回）。

CNKIAgent 0.4 把这件事做成可执行的规则 + 可跑的工具：

```
cnki_de_aigc(text="……", mode="scan")    # 体检：硬指标 + 高风险段落
cnki_de_aigc(text="……", mode="review")  # 生成逐段改写方案，等确认
cnki_de_aigc(filePath="C:/稿子/第三节.md", mode="check")  # 改完复查
```

### 三条总原则

1. **结构先行**——先改语序、句式、段落节奏，再碰词。只换同义词基本无效。
2. **具体优先**——把抽象拔高换成可核验的数值、条件、机制、边界。**更像人 ≠ 更口语。**
3. **语体守门**——改完必须还是论文。**语体优先于"降低率"**，宁可保留一点生硬。

### 三级落点（只有中间一列合格）

| ❌ 降重不足（仍像 AI） | ❌ 降重过度（口语化） | ✅ 恰当（书面学术） |
|---|---|---|
| 实验结果充分表明该方法具有显著优越性 | 一测就知道这方法真的行 | 在三组测试集上，该方法的平均误差低于对照方法约 12% |
| 上述差异归因于多种因素的综合作用 | 说白了就是好几个原因凑一块儿了 | 这一差异可能主要来自样本分布不均与特征冗余 |
| 尽管取得一定成果，但仍存在局限性 | 当然啦，这方法也不是万能的 | 本文仅在实验室条件下验证，放大到真实场景后的表现尚待考察 |

### 硬指标

| 指标 | 阈值 |
|---|---|
| AI 高频词 | 每段 ≤2 个 |
| 段末总结套句（"此案例印证了…/由此可见"） | 全文 ≤1 处 |
| 泛化结尾（"具有重要意义/前景广阔"） | 0 处 |
| 模糊归因（无出处的"专家认为/研究表明"） | 0 处 |
| 破折号 | 每段 ≤1 个 |
| 正文加粗 | 全文 ≤5 处 |
| 术语 | 全文一个叫法，禁止同义词轮换 |
| 口语 / 网络用语 | 0 处 |

完整规则（17 类模式改前/改后示例、两级 AI 词表、口语黑名单、评分表、合规边界）见 [`skills/cnki-agent/references/de-aigc-playbook.md`](skills/cnki-agent/references/de-aigc-playbook.md)。

### 不做的事

- 不靠口语、网络用语、情绪词、碎句来"降 AI"；
- 不为"更像人"补造数据、文献、访谈、异常值；
- 不让 AI 整篇重写一遍（会叠加指纹，有时不降反升）；
- 不追求 0%（人类论文不可能零痕迹，过度均质反而更像机器稿）。

规则来源：Wikipedia《Signs of AI writing》、GitHub [`xiaofenggan01/aigc-reduce`](https://github.com/xiaofenggan01/aigc-reduce)（MIT）、GitHub [`redbaronyyyyy-eng/humanizer-zh-academic`](https://github.com/redbaronyyyyy-eng/humanizer-zh-academic)（MIT），以及 B 站 / CSDN 上多篇实测帖的经验值（仅作参考，非权威标准）。

## Word 排版 · 公式 · 交叉引用

论文最后一步永远是"做成能交的 Word"。这一步最容易翻车的地方不是文笔，而是**编号**：手打的"图 4-1""（3）""[12]"在增删一次之后就会全线错乱。

CNKIAgent 0.5 把这件事拆成「规则 + 方案 + 程序化体检」三层。

### 三条铁律

1. **一切编号来自域，不手打。** 图 / 表 / 公式用 `SEQ`，正文引用用 `REF`，目录用 `TOC`。
2. **一切格式来自样式，不手调。** 标题必须套用内置「标题 1/2/3」，否则题注的"包含章节号"读不到。
3. **改完必须 F9。** `Ctrl+A` → `F9`，域不会自动重算。

### 工具

```
cnki_word_plan(topic="人工智能与教育公平", numberByChapter=true, refs=["张三. 题名[J]. 刊名, 2025, 45(3): 1-9."])
```

输出 12 步执行顺序、三层域说明、三线表磅值、顺序编码制要点、交付自检清单，并对 `refs` 逐条审计格式（年卷分号、页码波浪线、专著缺出版地、网页缺引用日期、类型标识缺失…）。

```
python assets/tools/format_docx.py check  thesis.docx     # 排版体检，有 error 退出码 1
python assets/tools/format_docx.py build  thesis.md out.docx --title "论文题目"
```

`check` 会查：域 / 题注 / 手打交叉引用 / 标题样式 / 竖线表 / 重复标题行 / 非规范西文字体 / Markdown 残留 / 参考文献编号断档。
`build` 生成带样式骨架的 docx：内置标题样式、首行缩进 2 字符、中文字体 `w:eastAsia`、**三线表**（顶底 1.5 磅 / 栏目线 0.75 磅、无竖线、跨页重复标题行）、`SEQ` 题注域、`PAGE` 页码。

### 公式编号怎么排

公式不用"题注"（题注是给图表设计的，标签会混进图表目录）。标准做法是 **样式 + 制表位 + `SEQ` 域 + 书签**：

```
（ { STYLEREF 标题 1 \s } - { SEQ 公式 \* ARABIC \s 1 } ）
```

- 段落用自建「公式」样式：1/2 处居中制表位（放公式）、右边界右对齐制表位（放编号）；
- `STYLEREF` 取章号、`SEQ ... \s 1` 让每章重新从 1 开始；
- 正文引用靠**书签 + `REF` 域**，不能用题注交叉引用。

### 参考文献

- 正文标注放在句末标点**之前**：`……已成为研究热点[1]。`；连续 `[1-3]`，不连续 `[1,3,5]`；
- 条目标点：项目之间 `. `，年与卷之间 `, `，卷期与页码之间 `: `，析出文献 `//`；页码用 `-` 不用 `~`；
- **不要靠 Word 自带"交叉引用"维护参考文献编号顺序**——它不会按首次引用重排。用 Zotero / EndNote 插域，或给条目设书签再用 `REF`；
- 版本：GB/T 7714—2015 仍是多数模板依据；**GB/T 7714—2025 已于 2026-07-01 实施**，新增 `[DS]` 数据集、`[PP]` 预印本等类型。以学校 / 期刊通知为准。

完整规则（样式体系、题注 / `SEQ` / `REF` 三层域、三线表新建表格样式、12 类文献示例、报错排查表、python-docx 能做/不能做）见 [`skills/cnki-agent/references/word-playbook.md`](skills/cnki-agent/references/word-playbook.md)。

## 论文插图 · 架构图 / 流程图

论文插图糊，99% 不是"分辨率没调好"，而是**它从源头就是位图**。从画好到进 PDF，一张图要过三道可能把它变成位图的关：粘贴时按 96 dpi 抓快照 → Word 默认压缩 → 导出 PDF 按 220 dpi 再采样。**调高 PPI 救不回来**，那只放大已有像素。

### 30 秒判断你的图是不是矢量

| 检测 | 矢量正常 | 位图异常 |
|---|---|---|
| Word 里右键图片 | 有【编辑图片】/【转换为形状】 | 只有【设置图片格式】 |
| 放大到 400% | 边缘始终锐利 | 马赛克、锯齿 |
| 另存 PDF 看图像属性 | `Vector graphic` | `Image (RGB, 96 dpi)` |

### 五条路线

| 路线 | 矢量 | 能在 Word 里改 | 需要什么 |
|---|---|---|---|
| **代码生成原生形状**（本插件默认） | ✅ | ✅ | 只要 Python |
| Word / WPS 原生绘图 | ✅ | ✅ | Office |
| draw.io → SVG | ✅ | 转换后可改 | 浏览器 |
| Visio → 选择性粘贴 EMF | ✅ | ✅ 双击回 Visio | 装了 Visio |
| 位图 300/600 dpi | ❌ | ❌ | 期刊强制时 |

### 一行命令出图

```bash
python assets/tools/draw_diagram.py build spec.json 图3-2.docx --caption "图 3-2 平台总体架构"
python assets/tools/draw_diagram.py build spec.json 图3-2.svg   # 要二次编辑时
python assets/tools/draw_diagram.py build spec.json 图3-2.png --dpi 600   # 期刊只收位图时
```

规格只要写"谁连谁"，布局自动排：

```json
{
  "nodes": [
    {"id": "c1", "label": "Web 前端", "shape": "round", "level": 0},
    {"id": "g",  "label": "统一接入网关", "level": 1},
    {"id": "db", "label": "业务库", "shape": "cylinder", "level": 2}
  ],
  "edges": [
    {"from": "c1", "to": "g"},
    {"from": "g", "to": "db", "label": "读写", "dashed": true}
  ]
}
```

输出的 `.docx` 里是 **Word 原生 DrawingML 形状组**：真矢量、双击就能改字改色、整组可缩放，不依赖 Visio 也不依赖 Word 安装。八种形状（矩形/圆角/起止/判断/椭圆/数据/存储/准备）、虚线边、边标签、自动分层与正交折线都支持；跨层的边自动走右侧通道，不会穿过中间节点。

### 必做的全局设置

文件 → 选项 → 高级 → **图像大小和质量** → 勾选【不压缩文件中的图像】，默认分辨率设为【高保真】。

> 本机实测：`Word.Application` COM 由 **WPS Office** 提供（Build 12.1.0.28022），未安装 Microsoft Word 与 Visio。所以本插件默认走"代码生成原生矢量"，Visio 路线仅作为有 Visio 时的参考。

完整规则（三重栅格化、诊断矩阵、Visio 三种插入方式与字体转曲 `Ctrl+Shift+Q`、draw.io 导出 SVG 的两处必改设置、SVG/EMF/PNG 选型、图文规范表、5 条验收）见 [`skills/cnki-agent/references/diagram-playbook.md`](skills/cnki-agent/references/diagram-playbook.md)。

## 设计原则

1. **不虚构。** 没检索到的文献不写进参考文献，没读到的段落标「未获取」。
2. **可复现。** 每条检索式原样回显，换一个人、换一天能跑出同样结果。
3. **编辑视角。** 不是"总结摘要"，而是判断：这篇文章凭什么发出、它的缺口在哪、我能仿写哪一句。
4. **阶段闸门。** 大纲、引言、每一节正文、校订，都是独立的确认点。

## 已知限制

- **知网正文需登录且有反爬。** 插件获取到的是题录（标题/期刊/日期/文献类型）+ 摘要页链接，**不保证取得全文 PDF**；正文引用需你登录知网后逐篇阅读。
- **首次检索需人工过滑块验证。** 插件不绕过验证码。
- 检索结果按知网默认排序返回，未做时间/被引/期刊等级的二次筛选。
- 面板与 `cnki_library` 的数据保存在进程内存，**DSH 重启后清空**。
- 依赖 DSH 运行时的 `ctx.tools` / `ctx.skills` / `ctx.web` / `ctx.connection` 服务，版本要求 `dsh >= 0.2.0-rc.2 < 0.3.0-0`。

## 仓库结构

```
dsh-cnki-agent/
├── package.json          # bundle 清单（dsh.bundle.patch / dsh.client）
├── cordis.patch.yml      # 插入一行插件条目
├── lib/
│   ├── index.js          # 宿主半侧：技能 + 工具 + 路由 + 系统提示
│   └── client.js         # 客户端半侧：右侧栏文献库面板
├── skills/cnki-agent/    # 技能包：SKILL.md + references（workflow / reading-checklist / research-map / de-aigc-playbook / word-playbook）
├── assets/tools/         # format_docx.py 排版体检与生成；draw_diagram.py 原生矢量插图
├── locale/               # zh / en 元信息
├── README.md
└── LICENSE
```

## 开发

插件包内的代码**只允许 import 
ode:*` 内置模块**，其余能力一律通过 `ctx.get('<service>')` 探测，这样包在任何 profile 里都能加载。工具的 JSON Schema 手写，且 `type` 必须是单个字符串——写成 `type: ['string','null']` 会让整条插件行加载失败。

工具返回值必须是**无损 JSON**：`undefined` 会让整次调用被判 `value is not lossless JSON`，所有输出都要先规整成纯数据。

语法自检：

```bash
node --check lib/index.js && node --check lib/client.js
```

## License

MIT © 2026 CNKIAgent contributors

---

本项目与同方知网（CNKI）官方无关，仅以自动化方式使用其公开检索界面；请遵守目标站点的服务条款与所在机构的数据库使用规定。
