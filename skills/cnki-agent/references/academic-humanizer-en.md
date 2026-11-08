# 英文论文与基金申请 · 学术人味改写（ACADEMIC-HUMANIZER）

> 适用对象：**英文论文**（abstract / intro / related work / rebuttal）与**英文基金申请书**（NSF Project Summary 与 Project Description、NIH Specific Aims、各类 fellowship）。
>
> 不适用：中文论文（用 `de-aigc-playbook.md`）、博客、营销文案、个人随笔。
>
> **一句话原则：学术写作本来就有正确的人类声音——中性、精确、第三人称复数、每个论断都挂在证据上。** 任务不是"加人味"，而是（1）剥掉 AI 痕迹但不口语化，（2）补上通用 humanizer 缺失的纪律：**每个论断挣得它的数字、图表或引用，没有哪个动词可以强过它的证据。**

## 0. 边界（先划线）

- **不改任何数字、公式、引用。** 同义、同结构、同内容，只动表达层。
- **不是规避 AI 使用披露的工具。** 用了它不免除披露义务；以目标期刊/基金的披露政策为准。
- **不注入观点、幽默、第一人称"性格"。** 对技术写作而言，中性精确**就是**人味。
- 不虚构预实验、前期资助、合作者、推荐信。缺证据就标注缺口，交给作者补。

---

## 1. 通用 AI 痕迹目录（Layer 1）

| 痕迹类型 | 识别特征 | 改法 |
|---|---|---|
| 拔高意义 | "marking a pivotal moment", "plays a crucial role" | 换成具体缺口与代价 |
| 假深度 -ing 尾巴 | "…, highlighting…", "…, underscoring…", "…, paving the way for…" | 删掉或改成主句 |
| 促销/比喻词 | rich, vibrant, groundbreaking, transformative | 删；给数字 |
| 模糊归因 | "experts argue" 无引用 | 补引用或改为本文判断 |
| AI 高频词 | delve, underscore, intricate, tapestry, testament, landscape（抽象义）, pivotal, showcase, foster, leverage（填充义）, realm, seamless | 换常用词或删 |
| 规避系动词 | "serves as" → "is" | 还原 be 动词 |
| 否定并列 | "not just X, but Y" | 拆成两句或直陈 |
| 三连排比 | X, Y, and Z 凑数 | 只留真需要的项 |
| 优雅变异 | 同一对象轮换同义词 | 统一称呼 |
| 填充语 | "it is worth noting that", "in order to" | 删 / 改 "to" |
| 超长堆叠句 | >30 词或 3+ 从句 | 一句一意，砍无信息从句 |
| 破折号 | em-dash（—） | **全部删除**，改用逗号、冒号、括号或断句 |

**范例**

- Before: *Additionally, an enduring testament to the method's value is its ability to delve into intricate dependencies, showcasing a seamless integration that underscores its pivotal role.*
- After: *The method also captures higher-order dependencies, which the baselines miss (Table 2).*

---

## 2. 学术特有的 AI 痕迹（Layer 2，逐条硬查）

**2.1 过强论断动词**
经验研究只 *shows* / *provides evidence*，不 *prove* 普遍真理。
Watch: demonstrate, prove, establish, confirm, guarantee；无限定的 "significantly"。
- Before: *We prove that our method significantly outperforms all prior approaches.*
- After: *Our method improves held-out accuracy by 4–7 points over the strongest prior approach (Table 3); the gain is significant at p < 0.01 by a paired test.*

**2.2 意义拔高**
Watch: paves the way for, a crucial/pivotal step toward, has the potential to revolutionize, opens new avenues, sheds light on, of paramount importance, bridges the gap.

**2.3 空强度词**
Watch: extensive / comprehensive / thorough experiments, a wide range of, numerous, various。
- Before: *We conduct extensive experiments on a wide range of datasets.*
- After: *We evaluate on three datasets (ImageNet, CIFAR-100, and iNaturalist).*

**2.4 新颖性灌水**
Watch: "novel" 一节出现多于 1 次；"to the best of our knowledge"；"for the first time"。

**2.5 套路开头**
Watch: "In recent years, X has attracted increasing attention"; "With the rapid development of…"; "Despite recent advances,…"。
- 改法：第一句直接给**结构性局限或具体缺口**。

**2.6 连接词堆叠**
不要让连续句子都以 Moreover / Furthermore / Additionally / In particular 开头；让逻辑自己走。
- Before: *Moreover, the method is fast. Furthermore, it is simple. Additionally, it scales.*
- After: *The method is fast and simple, and it scales to one million rows (Section 5).*

**2.7 贡献列表套话**
每条贡献必须是一个**具体结果**，不是摘要复述。
- Before: *Our contributions are: (1) a novel method; (2) extensive experiments; (3) strong results.*
- After: *We (1) introduce a metadata-aware encoder that reaches 0.91 AUROC vs 0.86 for the strongest baseline; (2) show it stays within 2 points under 20% label noise where the baseline drops 9; (3) release the benchmark.*

**2.8 引用堆砌**
只引真正相关的 1–2 篇，并说明为什么。
- Before: *Many methods exist [3, 7, 9, 12, 15].*
- After: *The closest prior method is TabNet [7], which encodes all features jointly; we instead condition on feature-type metadata.*

**2.9 用模糊词假装谨慎**
Watch: somewhat, relatively, fairly, to some extent, quite → 量化或删。

**2.10 样板强调**
Watch: "It is worth noting that", "It should be emphasized that", "Notably,", "Importantly,"。
**重要的事自己会显现**，不需要贴标签。

**2.11 超长从句堆叠句**
Watch: >30 词，或 3+ 个 which/that/while/with 从句。
- Before: *Existing methods, though promising, are largely empirical, with unclear principles underpinning their behavior, which limits their reliability and further progress.*
- After: *Existing methods stay empirical. Their principles are unclear, which limits reliability and progress.*

---

## 3. 必须保留的（Layer 3，别改过头）

通用 humanizer 会把合法的学术构造一起铲平，这些要留：

- **有证据支撑的 hedging 是对的，且是必需的。** 保留 "suggests", "is consistent with", "we hypothesize that", "may indicate", "appears to"。
  **错误改法**：把 *"the results suggest X"* 改成 *"the results prove X"* ——这是在制造过强论断。
- **被动语态**在施动者无关时是恰当的：*"Samples were normalized to total protein."*
- **第一人称复数 "we"** 是标准写法，不要为了躲它而改写。
- **分号、偶尔的三连**适度可留；**破折号是例外，全删**。
- **正式定义、方法/指标名、术语、公式与符号**原样保留。
- **绝不新增、删除或改动数字、公式、引用**；每一个 cite key 都要在。

---

## 4. 论断↔证据（Layer 4，本手册的重心）

对每一个经验性论断问两件事：**(a) 它有没有数字、图、表或引用在文中支撑？(b) 动词强度是否匹配这个证据？**

| 症状 | 处理 | 示例 |
|---|---|---|
| 无支撑论断 | 补证据指针或降级 | *more robust* → *accuracy drops 2 points under shift vs 11 for baseline (Figure 3)* |
| 动词强于证据 | 降级动词 | *demonstrates universally superior* → *matches or exceeds the strongest baseline on these three datasets (Table 2)* |
| 幅度模糊 | 换成数字或**区间**并标注归属 | *a large improvement* → *a 2–6% improvement in balanced accuracy over the strongest baseline* |

**三条细则**

1. 优先给**区间**（如 2–6%）而非单一均值，除非说明了平均方式；每个数字都要标注**方法、指标、对照基线**。
2. 比较时**对着最强对手比**，不要挑最弱的基线刷分。
3. 一处证据只能支撑一处论断；不要把"在三个数据集上成立"写成"普遍成立"。

---

## 5. 声音与场合校准（Layer 5）

- 作者给了旧稿/已发表论文就先读一段，记录：**句长节奏、连接词习惯、hedging 的位置与力度、每节怎么开头、记号习惯、反复出现的措辞**，然后照着写。
- 同时匹配目标场合的语域：

| 场合 | 语域 |
|---|---|
| ICLR / NeurIPS / ACL | 简短、直接、结果先行，少铺垫 |
| Nature / PNAS / Science | 说明性更强，先讲问题与意义，再给结果 |
| 中文期刊英文摘要 | 中性、完整句子、避免营销词 |

- 没有样本时，默认"干净、精确、符合场合"，**不是**通用 humanizer 那种随便、带个人观点的口气。

---

## 6. 基金申请模式（Layer 6，NSF / NIH）

申请书不是论文。它卖的是**愿景 + 可行性**，而且评审人是"打分"的。语域要切换：论文层会砍掉的雄心语言（"long-term goal", "pioneer", "transformative", "establish a foundation"）在这里**是恰当且被期待的**，前提是有可信的计划与证据托底。

**所以：申请书模式不要压平愿景，而是换一套纪律——论断↔可行性。**

### 6.1 结构与"首页决定分数"

- **NSF**：一页 **Project Summary**，三个评审口径各自自足——**Overview / Intellectual Merit / Broader Impacts**。Project Description 开头 1–2 页内完成：**长期愿景 → 本申请的目标 → 缺口 → 具体 thrust/aim → 收益**，并配一张总览图。Broader Impacts 必须实质且与研究整合，不能是事后补丁。
- **NIH (R01)**：**Specific Aims 一页就是整个申请**，是读得最多、最决定性的一页。标准弧线：
  1. 开场：问题、已知、**缺口/关键需求**；
  2. **长期目标** + **中心假设**及其依据；
  3. "**The objective of this application is…**" + 假设是怎么形成的；
  4. **2–3 个 Aim**，每个 = 一行目标 + 一句方法 + 预期结果；
  5. **收益段**：成功了会改变什么。
  之后才是 **Significance / Innovation / Approach** 三个独立打分的部分。

### 6.2 前三页优先（改得最狠）

到第 1 页末（NIH Aims）或第 2–3 页（NSF），读者必须已经拿到：**钩子**（为什么重要，具体）、**缺口**（缺什么、代价是什么）、**中心思想**（一句话讲清你的路径）、**aims/thrusts**（干净且平行）、**收益**。
缺任何一项或被埋住，先修它，再碰后面的章节。**第 3 页没说服评审人，第 10 页救不回来。**

### 6.3 申请书特有的弱招（逐条修）

- **空泛重要性**：*"this is an important/timely problem"*, *"X has many applications"* → 换成"没有它会怎样"的具体代价。
- **把方法当 aim**：*"Aim 2: Apply transfer learning to the dataset"* → *"Aim 2: Determine whether fusing wearable and lab signals improves early detection, and for which patient subgroups it helps or hurts."*
- **多米诺 aim**（Aim 2/3 依赖 Aim 1 成功，评审人会判为脆弱）→ 改成**平行、各自独立有价值**；确有依赖就写明 fallback。
- **只有雄心没有可行性** → 每个大胆论断都要有支点：预实验数据、前期结果/发表、所依托的经典定理、合作者/推荐信。把证据贴在论断旁边。
- **样板化 Broader Impacts / 培养计划**：*"we will mentor students and disseminate via talks and papers"* → 具体、可枚举、与研究绑定：具体项目、课程、工具、可度量的 outreach。
- **被 hedge 掉的中心假设**：Aims 页的假设是**可证伪的承诺**，不是 "we will explore whether possibly…"。校准性 hedging 属于 Approach 的解释部分，不属于中心论断。

### 6.4 该保留并主动使用的（拿到资助的写法）

- **愿景/雄心框架**：开头给大胆的长期目标，本申请是通往它的一个原则性步骤。
- **run-in 引导词**便于扫读：**Goal:** / **Motivation:** / **Innovation:** / *Aim N (one-line mission):*。评审人是扫读的，可见结构能换时间。
- **一个贯穿全篇的具体例子/主角**，让抽象方法变得可感，并在各 aim 之间保持一致。
- **把挑战/aim 写成尖锐的问句**：一个干净的开放问题等于一个良定义的问题。
- **把新工作锚在深厚且有名字的经典结果上**（某个不等式、容量概念、检验），显示严谨与谱系。

---

## 7. 四步流程（审计 → 改写 → 报告）

1. **Read**：读稿 + 作者写作样本；确认文档类型（论文/申请书）与目标场合。
2. **Audit（先别改）**：逐条列出检测到的模式 + 位置 + 建议改法；逐个列经验论断的证据状态。
3. **Rewrite**：同结构同内容，保留全部论断与引用，剥掉痕迹，过强论断对齐证据，合法的 hedging 保留。
4. **Report**：给清洗后的文本 + 简短变更日志（删了哪些模式、软化了哪些论断/补了哪些证据指针、语域备注）。**原文有几段，改写后就有几段。**

---

## 8. 与中文降 AIGC 的分工

| 场景 | 用哪套 |
|---|---|
| 中文论文/学位论文正文 | `de-aigc-playbook.md`（语体优先、噪声预算、AI 词配额） |
| 英文论文 | **本文件 Layer 1–5** |
| 英文基金申请（NSF/NIH） | **本文件 Layer 6** + 第 4 节论断↔证据 |
| 中英混排的中文论文英文摘要 | Layer 2 + Layer 3（不要用中文口语化规则） |

**两套共用的铁律**：只动表达层；不补造数据与文献；语体优先于数值；改写前必须给方案等确认。

---

## 9. 来源与许可

本文件改编自 **[AIScientists-Dev/academic-humanizer](https://github.com/AIScientists-Dev/academic-humanizer)**（MIT License, Copyright (c) 2026 AIScientists-Dev），按本插件的中文论文写作场景重排并补充分工说明。

上游致谢（随原项目一并保留）：

- **[blader/humanizer](https://github.com/blader/humanizer)**（MIT）：通用 AI 写作痕迹目录（Layer 1 的来源）。
- **[koaeraser/ARMS](https://github.com/koaeraser/ARMS)**：影响本项目对"论断-证据"与"数值精确性"的强调。

> 基金申请的**当前有效要求**（页数限制、格式、截止日期）以官方为准：NSF PAPPG <https://www.nsf.gov/policies/pappg>；NIH Write Your Application <https://grants.nih.gov/grants/how-to-apply-application-guide/format-and-write/write-your-application.htm>。本文件只固化"稳定的结构"，不替代官方指南。