# 第三方许可与致谢（THIRD-PARTY NOTICES）

本插件除自身代码外，包含改编自第三方开源项目的内容。以下逐项列明来源、许可与改动范围。

---

## 1. academic-humanizer

- **来源**：<https://github.com/AIScientists-Dev/academic-humanizer>（v0.3.3）
- **许可**：MIT License，Copyright (c) 2026 AIScientists-Dev
- **引入位置**
  - `skills/cnki-agent/references/academic-humanizer-en.md`（改编全文：六层规则、论断↔证据、NSF/NIH 申请书模式）
  - `lib/index.js` 中的英文引擎：`EN_AI_WORDS`、`EN_PHRASES`、`EN_OVERCLAIM`、`EN_VAGUE_HEDGE`、`EN_INTENSIFIERS`、`EN_EMPHASIS`、`EN_CLAIM_MARK`、`EN_EVIDENCE_MARK`、`PROPOSAL_WEAK`、`claimEvidence()`、`proposalWeakMoves()`、`proposalChecklist()`、`buildReportEn()`
  - `cnki_de_aigc` 的 `lang` / `docType` / `agency` 参数
- **改动说明**：原文为英文 SKILL.md；本插件将其重排为中文playbook 结构（便于中文用户执行），并把规则实现为可运行的体检引擎（词表、正则、论断-证据审计、申请书弱招检测）。未改变原规则的含义与取舍。

原项目致谢（随本项目一并保留）：

- **blader/humanizer**（<https://github.com/blader/humanizer>，MIT）——通用 AI 写作痕迹目录（Layer 1 的来源）。
- **koaeraser/ARMS**（<https://github.com/koaeraser/ARMS>）——影响了原项目对「论断-证据」与「数值精确性」的强调。

### MIT License (academic-humanizer)

```text
MIT License

Copyright (c) 2026 AIScientists-Dev

This work builds on "humanizer" by blader (https://github.com/blader/humanizer, MIT) and adopts
standards from "ARMS" (https://github.com/koaeraser/ARMS); see the Acknowledgments in README.md.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## 2. 其他

- `assets/tools/draw_diagram.py`、`assets/tools/format_docx.py`：本插件原创，依赖 `python-docx`（MIT）与 `Pillow`（HPND/PIL License）。
- 去 AIGC 中文规则（`references/de-aigc-playbook.md`）：本插件原创整理。
- 参考文献格式：依据 GB/T 7714—2015 / 2025 国家标准文本归纳；标准原文版权归国家标准化管理委员会，本插件仅表述规则要点。

> 若你是上述项目的作者且认为本仓库的引用方式需要调整，请开 issue，我们会在下一次发布中修改。