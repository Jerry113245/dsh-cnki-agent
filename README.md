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
| 引用与排版 | GB/T 7714—2015 引用审计、Word 样式与交叉引用 |
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

`cnki_search` 参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `keywords` | string[] | 必填，逐个顺序检索 |
| `mode` | `precise` \| `general` | `precise` 做短语检索（加引号），默认 `general` |
| `site` | string | 回退通道使用的站点限定，默认 `kns.cnki.net` |
| `maxResultsPerKeyword` | integer | 每个关键词最多保留多少条（1–20，默认 8） |
| `saveTo` | string | 目录路径，写入 Markdown 检索报告 |
| `noBrowser` | boolean | 强制只用回退通道 |

## 技能

`skills/cnki-agent/` 是一份完整的技能包（纯 Markdown，可离线阅读）：

- `SKILL.md` — 路由表（R1 研究版图 / R2 写作链 / R3 检索 / R4 精读 / R5 修订）与输出纪律
- `references/workflow.md` — 六段式工作流与阶段闸门
- `references/reading-checklist.md` — 核心期刊编辑视角的精读检查单
- `references/research-map.md` — 研究版图模板

写作纪律（写进技能与系统提示，不靠模型自觉）：

- 检索词必须单元化、可复现，一条检索式一个词；
- 未获取的段落标注「未获取」，不补写；
- 数据、文献、结论一律不得虚构；
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
├── skills/cnki-agent/    # 技能包（SKILL.md + references）
├── locale/               # zh / en 元信息
├── README.md
└── LICENSE
```

## 开发

插件包内的代码**只允许 import `node:*` 内置模块**，其余能力一律通过 `ctx.get('<service>')` 探测，这样包在任何 profile 里都能加载。工具的 JSON Schema 手写，且 `type` 必须是单个字符串——写成 `type: ['string','null']` 会让整条插件行加载失败。

工具返回值必须是**无损 JSON**：`undefined` 会让整次调用被判 `value is not lossless JSON`，所有输出都要先规整成纯数据。

语法自检：

```bash
node --check lib/index.js && node --check lib/client.js
```

## License

MIT © 2026 CNKIAgent contributors

---

本项目与同方知网（CNKI）官方无关，仅以自动化方式使用其公开检索界面；请遵守目标站点的服务条款与所在机构的数据库使用规定。
