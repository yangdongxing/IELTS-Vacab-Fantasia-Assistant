# 雅思真经划词划划看 (IELTS Vocab Fantasia Assistant)

> 专为雅思考生与英语进阶者打造的沉浸式外刊阅读与背词助手。在任意网页上划选（或三击）英文段落，点击弹出的【标记真经】按钮即可**在正文中柔和高亮真经核心词汇**，段落下方无侵入生成神经网络双语对照卡片；鼠标 Hover 展示词义气泡与发音，点击微缩图展开全屏居中高清大图、双语例句与真题语境，支持键盘拼写交互验证与系统级纯净朗读！

<p align="center">
  <a href="https://yangdongxing.github.io/IELTS-Vacab-Fantasia-Assistant/"><strong>🌐 在线访问 →</strong></a>
  &nbsp;&nbsp;|&nbsp;&nbsp;
  <a href="https://yangdongxing.github.io/IELTS-Vacab-Fantasia-Assistant/tampermonkey/stats.html"><strong>📊 数据统计大屏 →</strong></a>
</p>

---

## 🔗 项目关系

本项目是 **[IELTS-Vacab-Fantasia](https://github.com/yangdongxing/IELTS-Vacab-Fantasia)** 的配套浏览器工具，**独立部署、独立使用**。

| 项目 | 定位 | 内容 |
|------|------|------|
| **[IELTS-Vacab-Fantasia](https://github.com/yangdongxing/IELTS-Vacab-Fantasia)** | 词汇主项目 | 3600+ 雅思核心词汇、章节串记、故事串记、在线学习网站 |
| **本项目 (Assistant)** | 浏览器工具 | 极简实用的油猴脚本，在任意网页上实战阅读与练词 |

> 两个项目**完全解耦**：本项目 clone 后即可独立使用，无需依赖主项目的任何文件。

---

## 🚀 核心工作流

1. **选中文本**：在任意网页上划选（或**三击整段**）英文句子或段落。
2. **点击标记**：选区右上角浮现 **【标记真经 (N)】** 经典红色胶囊按钮。
3. **正文标注与双语对照**：
   - 单词自动高亮：采用柔和荧光标记，保持原文版面整洁；
   - **段落下无侵入插入双语对照卡片**：自动插入神经翻译卡片，配备 `[🔄]` 重试、`[🔊 朗读英文]`、`[🎙️ 选中文本]`（点击提示 `Opt+Esc`）及 `[✕]` 关闭。
4. **悬浮 Tips 气泡**：鼠标 Hover 标记词，轻量浮现暗色卡片（词义、发音、微缩配图，支持顶部边界智能避让）。
5. **全覆层记忆卡片 (Modal)**：
   - 点击高亮单词或 Tips 微缩图展开纯净全屏高清记忆卡片；
   - **自动播报【单词英文 + 中文词性与释义】**，包含高清助记图、真题语境例句（黄色考点词高亮，点击例句可双语朗读）；
   - 底部支持**单词拼写交互验证**：敲入正确单词后触发对钩动画，**自动无缝循环流转本段落的各个单词**；随时可按 `ESC` 键或点击卡片外部遮罩快速关闭。

---

## 🧠 为什么这种模式能重塑你的语言大脑？

用第二语言习得（SLA, Second Language Acquisition）、认知心理学以及神经科学的研究模型来评估，**这种“脚手架式外刊泛读”对英语能力的提升不仅极其显著，更是突破中高级瓶颈（如雅思 6.5 分突破到 7.5~8 分）最高效的科学路径。**

具体而言，这种模式从以下 **5 个核心科学维度**重塑了你的语言大脑：

---

### 1. 将阻断性文本降维为“可理解性输入”
> **理论支撑：斯蒂芬·克拉申（Stephen Krashen）的输入假说（$i + 1$）与情感过滤假说（Affective Filter）**

* **自然阅读的困境（$i + 3$）**：英国《卫报》、《经济学人》等外刊的词汇量与句式复杂度通常处于 $i + 3$ 甚至 $i + 5$ 水平。当生词率超过 5% 时，人类大脑会因解码负荷过重而启动“自我防御”，产生高焦虑与厌倦感，语言习得机制（LAD）直接关闭。
* **插件的降维效应**：插件通过“真经核心词高亮 + 悬浮释义 + 段落神经对照”，扮演了极其强大的**认知脚手架（Cognitive Scaffolding）**。它没有替代你的阅读，而是把原本会中断你思维的难点“垫平”，把文本精准拉回到了最高效的 **$i + 1$ 黄金吸收区间**。

---

### 2. 彻底消除查词阻力，放大“附带词汇习得”
> **理论支撑：保罗·内森（Paul Nation）的词汇覆盖率研究 & 附带习得理论（Incidental Acquisition）**

* 语言学界公认：**母语者 85% 以上的高级词汇是在真实阅读中“附带习得”的，而不是死背词汇表。**
* 传统查词的致命缺陷是**“语流中断（Cognitive Disruption）”**：遇到生词 $\rightarrow$ 切屏或查词典 $\rightarrow$ 耗时 10~15 秒 $\rightarrow$ 丢失刚刚建立的句子短期工作记忆。一篇文章查 5 次词，心流彻底瓦解。
* **零阻力注记**：插件让词义触手可及。同一个学术词汇（如 `deteriorate`、`irreversible`），你在 1 个月内的新闻中在不同语境下遇到 **6~10 次**，大脑突触便会自动建立高强度的语义连接，彻底转化为随时可提取的**深层词汇库（Active Vocabulary）**。

---

### 3. 极度降低外在认知负荷，专注深层语义加工
> **理论支撑：约翰·斯威勒（John Sweller）的认知负荷理论（Cognitive Load Theory）**

人类工作记忆（Working Memory）的容量极度有限（仅能同时维持 3~4 个信息块）：
* **外在负荷（查词、排版跳跃、句意断裂）**：被插件压缩到接近于 **0%**。
* **相关负荷（语法解析、逻辑推理、语篇主旨、同义替换感知）**：得以调用你大脑 **100% 的带宽**。
在阅读时，你的大脑不用疲于做“逐词翻译”，而是在做“原语逻辑吸收”——这是培养**英语思维（直觉理解而非中英互译）**的有效途径。

---

### 4. 双通道多感官协同：视觉 + 听觉 + 动觉
> **理论支撑：阿兰·佩维奥（Allan Paivio）的双重编码理论（Dual-Coding Theory）**

这套阅读流构建了极其罕见的**“全通道记忆增强环”**：
1. **视觉通道（Visual）**：真实排版文本 + 考点词高亮 + 记忆弹窗的高清语义配图。
2. **听觉通道（Auditory）**：利用系统的自然神经语音（Mac: `Option + Esc` / Windows: `Ctrl + Shift + U`），整段流畅朗读，激活大脑语言区的**语音回路（Phonological Loop）**，建立单词的“音-意对应”；全覆层弹窗自动播报【单词英文 + 中文词性与释义】。
3. **动觉与主动提取（Kinesthetic & Retrieval）**：全覆层弹窗中键盘拼写校验，强迫大脑执行“主动检索”，对抗艾宾浩斯遗忘曲线。

脑神经影像学证明：**多通道共同激活时，大脑额叶、颞叶和顶叶的神经网络会形成网状交叉联想，抗遗忘能力相比单一阅读大幅提升。**

---

### 5. 获得真实的语用搭配（Collocation），摆脱“中式英语”
新闻文本由各领域顶级采编记者产出，具有极高的语用价值：
* 背单词书你只知道 `drastic` 是“激烈的”；
* 读新闻你会反复看到 `drastic measures`（严厉措施）、`drastic changes`（剧烈变化）。
这种成块状的**词块（Lexical Chunks）**吸收，不仅大幅提升阅读速度，更能直接反哺雅思写作与口语中的地道表达（Lexical Resource 评分项）。

---

### 💡 科学使用建议（避免潜在心理陷阱）

为了让这种科学辅助达到最大收益，请注意防范一个心理学现象：**熟练度错觉（Illusion of Competence）**——即“看着对照翻译全懂了，误以为自己完全掌握了”。

建议的**黄金三步阅读法**：
1. **先裸读，抓骨架**：先用肉眼快速扫过该段落，凭上下文尝试推断生词大意。
2. **后标记，建印证**：选中断落点击【标记真经】，对照插件的中文神经翻译，印证自己刚才的猜测（产生“顿悟”反馈，记忆最深刻）。
3. **闭眼听，练耳力**：点击卡片上的【🎙️ 选中文本】按下快捷键（Mac: `Option + Esc` / Win: `Ctrl + Shift + U`），在脑海中跟随系统原生自然语音复盘全段声音与语义。

**实践建议**：只要每天坚持通过这种低摩擦力、高正向反馈的模式阅读 20~30 分钟，你的词汇量增长、语感内化速度将显著超越传统孤立背词方式。

---

## 📦 安装与使用

### 油猴脚本 (Tampermonkey) — 极速安装

1. 确保浏览器已安装 **[Tampermonkey](https://www.tampermonkey.net/)** 扩展。
2. **一键安装**：直接打开 [tampermonkey.user.js](https://yangdongxing.github.io/IELTS-Vacab-Fantasia-Assistant/tampermonkey/tampermonkey.user.js)，Tampermonkey 会自动弹出安装确认弹窗，点击"安装"即可！
3. 在任意英文网页（BBC、Medium、Wikipedia 等）划选英文即可即时体验！

---

## 🚀 启动本地辅助服务 (可选)

> 💡 **提示**：本项目的 **3,600+ 高清助记图已全部托管于全球高速 CDN (Cloudflare Workers)**，开箱即用，**日常使用无需启动本地服务或下载庞大本地图库**。

本地服务（`server.py`）为**纯可选组件**，仅在需要以下辅助功能时启动：
- **学习行为数据本地归档**：将浏览器中的划词标记、弹窗查看与拼写验证打点同步持久化至本地 `data/stats.json`；
- **本地统计大屏服务**：通过 `http://127.0.0.1:8777/stats` 离线访问统计看板；
- **网络受限时的备用翻译代理**：提供本地 Google / MyMemory 备用翻译代理。

```bash
python3 server.py
# 或者一键启动:
./start.sh
```

---

## 📊 数据统计大屏

在线访问：[📊 stats.html →](https://yangdongxing.github.io/IELTS-Vacab-Fantasia-Assistant/tampermonkey/stats.html)

* **数据持久化**：全自动双重持久化（浏览器 `localStorage` + 本地文件同步）；
* **统计指标**：正文标记次数、覆层查看次数、拼写成功次数；
* **表格功能**：实时搜索过滤、多维排序、一键发音、导出 CSV/JSON、数据同步与重置。

---

## 📁 项目结构

```
IELTS-Vacab-Fantasia-Assistant/
├── index.html                      # GitHub Pages 导航首页
├── README.md                       # 本文件
├── server.py                       # 本地辅助服务（可选）
├── start.sh                        # 一键启动服务
├── data/
│   ├── dictionary.json             # 词库数据（3631 词）
│   └── stats.json                  # 打点数据本地归档
└── tampermonkey/                   # 油猴脚本
    ├── tampermonkey.user.js        # Tampermonkey 用户脚本（核心）
    ├── test.html                   # 功能测试页
    └── stats.html                  # 统计数据大屏
```

## GitHub Pages

`main` 分支推送后，`.github/workflows/deploy-pages.yml` 会自动部署。首次使用需在仓库 **Settings > Pages > Source** 中选择 **GitHub Actions**。

站点地址：<https://yangdongxing.github.io/IELTS-Vacab-Fantasia-Assistant/>
