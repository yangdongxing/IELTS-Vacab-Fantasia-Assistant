# 雅思真经划词划划看 (IELTS Vocab Fantasia Assistant)

> 专为雅思考生打造的沉浸式划词标记与背词助手。在任意网页上划选英文段落，点击弹出的按钮即可**直接在正文中加粗标记真经核心词汇**（已加粗文本自动加波浪线区分），鼠标 Hover 展示 Tips 气泡与发音，点击微缩图展开全屏居中高清大图与原声例句记忆覆层，支持键盘拼写验证互动！

---

## 🚀 核心工作流

1. **选中文本**：用鼠标在任意网页上划选英文句子或段落。
2. **点击按钮**：选区右上角浮现 **【📖 标记真经 (N)】** 经典红色胶囊按钮。
3. **正文标注与双语对照**：
   - 单词自动高亮：采用 Kindle / Apple Books 级别的柔和荧光标记；
   - **自动段落下插入 Google 神经网络双语译文**：段落下方无侵入插入浅蓝沉浸式翻译卡片，支持一键折叠/展开与关闭。
4. **悬浮 Tips 气泡**：鼠标移至标记词上，平滑浮现暗色卡片（发音、中文释义、微缩配图，支持顶部边界智能避让）。
5. **全屏记忆覆层 (Modal)**：
   - 点击 Tips 中的微缩图，弹出全屏居中记忆卡片；
   - 包含高清大图、词目发音、真题语境例句（黄色考点词高亮与例句发音）；
   - 底部支持**单词拼写验证**：敲入正确单词后触发绿色对钩反馈与下落动画，停留 3 秒后自动平滑关闭覆层；
   - 随时可按 `ESC` 键或点击卡片外部遮罩快速退出。

---

## 📦 安装与使用

### 方式 A：油猴脚本 (Tampermonkey) — 推荐

1. 确保浏览器已安装 **[Tampermonkey](https://www.tampermonkey.net/)** 扩展。
2. **一键安装**：直接在浏览器中打开 [`tampermonkey/tampermonkey.user.js`](tampermonkey/tampermonkey.user.js)，Tampermonkey 会自动弹出安装确认弹窗，点击"安装"即可！
3. 在任意英文网页（BBC、Medium、Wikipedia 等）划选英文即可即时体验！

### 方式 B：Chrome 扩展程序 (Manifest V3)

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`。
2. 开启右上角的 **开发者模式 (Developer Mode)**。
3. 点击 **加载已解压的扩展程序 (Load unpacked)**。
4. 选择本项目的 `chrome-extension/` 文件夹即可完成安装。

---

## 🚀 启动本地辅助服务 (可选)

本地服务提供 **图片静态加速 (3,600+ 配图 0 延迟秒开)**、**打点数据持久化** 与 **Google 翻译代理加速**：

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

## 📊 数据统计与打点管理台

项目配备独立的统计管理后台页面 [`tampermonkey/stats.html`](tampermonkey/stats.html)：

* **数据持久化**：全自动双重持久化（浏览器 `localStorage` + 本地文件同步）；
* **统计指标**：正文标记次数、覆层查看次数、拼写成功次数；
* **表格功能**：实时搜索过滤、多维排序、一键发音、导出 CSV/JSON、数据同步与重置。

---

## 📁 项目结构

```
IELTS-Vacab-Fantasia-Assistant/
├── README.md                       # 本文件
├── server.py                       # 本地辅助服务（可选）
├── start.sh                        # 一键启动服务
├── chrome-extension/               # Chrome 扩展程序
│   ├── manifest.json               # Manifest V3 配置
│   ├── content_script.js           # 内容脚本
│   └── data/
│       └── dictionary.json         # 词库数据
└── tampermonkey/                   # 油猴脚本
    ├── tampermonkey.user.js        # Tampermonkey 用户脚本
    ├── test.html                   # 功能测试页
    └── stats.html                  # 统计数据大屏
```

---

## 🔗 相关项目

- **[IELTS-Vacab-Fantasia](https://github.com/yangdongxing/IELTS-Vacab-Fantasia)** — 雅思词汇真经主项目（词库、故事串记、在线网站）
