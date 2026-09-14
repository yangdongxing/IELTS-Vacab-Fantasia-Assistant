# 雅思真经划词划划看 (IELTS Vocab Fantasia Assistant)

> 专为雅思考生打造的沉浸式划词标记与背词助手。在任意网页上划选英文段落，点击弹出的按钮即可**直接在正文中加粗标记真经核心词汇**（已加粗文本自动加波浪线区分），鼠标 Hover 展示 Tips 气泡与发音，点击微缩图展开全屏居中高清大图与原声例句记忆覆层，支持键盘拼写验证互动！

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
2. **点击标记**：选区右上角浮现 **【标记真经 (N)】** 胶囊按钮。
3. **正文标注与双语对照**：
   - 单词自动高亮：采用柔和荧光标记，保持原文版面整洁；
   - **段落下无侵入插入双语对照卡片**：自动插入神经翻译卡片，配备 `[🔄]` 重试、`[🔊 朗读英文]`、`[🎙️ 选中文本]`（点击提示 `Opt+Esc`）及 `[✕]` 关闭。
4. **悬浮 Tips 气泡**：鼠标 Hover 标记词，轻量浮现暗色卡片（词义、发音、微缩配图，支持顶部边界智能避让）。
5. **全覆层记忆卡片 (Modal)**：
   - 点击微缩图展开全屏高清记忆卡片，**自动播报【单词英文 + 中文词性与释义】**；
   - 包含高清助记图、真题语境例句（黄色考点词高亮，点击例句可双语朗读）；
   - 底部支持**单词拼写交互验证**：敲入正确单词后触发对钩动画，自动倒计时闭环退出；随时可按 `ESC` 键关闭。

---

## 🧠 学习理念与科学依据（为什么这样读更有效？）

不同于脱离语境的死记硬背或频繁切换窗口查词典，本项目基于**第二语言习得（SLA）**与**认知心理学**原理设计：

### 1. 降低外在负荷，守护阅读“心流”
> 认知负荷理论（Cognitive Load Theory - John Sweller）

传统阅读外刊最大的痛点是**“语流中断”**：遇到生词 $\rightarrow$ 离开阅读界面 $\rightarrow$ 翻查词典 $\rightarrow$ 丢失短期工作记忆。本项目将生词释义与段落翻译紧密贴合在当前视线内，将查词的外在认知负荷降到最低，让大脑将全部算力集中在理解语篇逻辑与上下文信息上。

### 2. 依托脚手架，实现“可理解性输入”
> 输入假说（Input Hypothesis - Stephen Krashen）

真实英文外刊（如 BBC、Medium、The Economist）的词汇与句法密度通常处于学习者的舒适区之外（$i + 2$ 甚至更高）。插件通过核心词注记与段落对照充当了**即时认知脚手架（Scaffolding）**，将晦涩语篇平滑拉回至最高效的 **$i + 1$ 黄金吸收区间**。

### 3. 在多样语境中实现“附带词汇习得”
> 词汇覆盖率与附带习得（Paul Nation）

母语者的绝大多数高级词汇都是在海量泛读中“附带习得”的。当一个学术词汇（如 `deteriorate`、`irreversible`）在一个月内的不同新闻中反复以不同的真实语境出现，大脑突触会自动建立立体的语义网络与搭配（Collocation）感知。

### 4. 多感官协同与主动提取闭环
> 双重编码理论（Allan Paivio）& 检索练习效应（Retrieval Practice）

- **视觉通道**：正文荧光高亮 + 悬浮释义 + 记忆卡片语义助记图；
- **听觉通道**：点击 `[🎙️ 选中文本]` 配合系统级原生语音（Mac: `Option+Esc` / Win: `Ctrl+Shift+U`）纯净整段流利朗读；全覆层弹窗自动播报【单词 + 中文词性释义】；
- **动觉提取**：记忆弹窗输入框强制进行低压力的键盘拼写检验，形成“输入-印证-提取”的完整认知闭环。

---

### 💡 科学使用建议（避免“熟练度错觉”）

认知科学表明，看着双语对照完全看懂，容易产生**熟练度错觉（Illusion of Competence）**。推荐采用以下**黄金三步法**，让日常阅读收益最大化：

1. **先通读，抓骨架**：先裸读段落，尝试利用上下文推测主旨与生词大意；
2. **再标记，建印证**：划选或三击段落点击【标记真经】，对照神经译文印证自己的理解，形成顿悟反馈；
3. **后盲听，磨耳力**：点击卡片上的【🎙️ 选中文本】按下快捷键，闭上眼睛跟随纯正原生语音复盘全段声音与语义，将视觉词汇真正内化为听觉直觉。

---

## 📦 安装与使用

### 油猴脚本 (Tampermonkey) — 极速安装

1. 确保浏览器已安装 **[Tampermonkey](https://www.tampermonkey.net/)** 扩展。
2. **一键安装**：直接打开 [tampermonkey.user.js](https://yangdongxing.github.io/IELTS-Vacab-Fantasia-Assistant/tampermonkey/tampermonkey.user.js)，Tampermonkey 会自动弹出安装确认弹窗，点击"安装"即可！
3. 在任意英文网页（BBC、Medium、Wikipedia 等）划选英文即可即时体验！

---

## 🚀 启动本地辅助服务 (可选)

本地服务提供 **图片静态加速 (3,600+ 配图 0 延迟秒开)**、**打点数据持久化** 与 **翻译代理加速**：

```bash
python3 server.py
# 或者一键启动:
./start.sh
```

> **说明**：
> - 服务默认运行在 `http://127.0.0.1:8777/`，已开启全跨域 CORS 支持；
> - 浏览器访问 `http://127.0.0.1:8777/stats` 即可进入统计数据大屏；
> - 图片目录自动从同级 `IELTS-Vacab-Fantasia-Images/images/` 或 `IELTS-Vacab-Fantasia/assets/images/` 发现；
> - 若本地服务未开启，脚本会自动降级回退（图片走 CDN），不影响基础功能。

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
│   └── stats.json                  # 打点数据持久化
└── tampermonkey/                   # 油猴脚本
    ├── tampermonkey.user.js        # Tampermonkey 用户脚本
    ├── test.html                   # 功能测试页
    └── stats.html                  # 统计数据大屏
```

## GitHub Pages

`main` 分支推送后，`.github/workflows/deploy-pages.yml` 会自动部署。首次使用需在仓库 **Settings > Pages > Source** 中选择 **GitHub Actions**。

站点地址：<https://yangdongxing.github.io/IELTS-Vacab-Fantasia-Assistant/>
