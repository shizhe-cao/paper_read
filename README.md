# Paper Read - 论文阅读助手

一个面向 PDF 英文论文的本地阅读助手 Web 应用：划词翻译、生词本、笔记、论文库管理、B 站讲解视频悬浮窗、AI 选段对话，帮助高效精读论文。

## 功能特性

### PDF 阅读与划词翻译
- 上传 PDF，逐页渲染（基于 pdf.js），自动适配窗口宽度，支持缩放（50% - 250%）
- 双击或划选单词即时翻译：本地离线词典（ECDICT，约 77 万词条），无需联网
- 支持词形变化推测（复数、过去式、进行时、比较级等），如 `networks` 可查出 `network`
- 翻译弹窗支持多词条展示（一次划选多个词分别查询）

### 生词本
- 翻译弹窗一键保存生词（单词 + 音标 + 释义），按论文独立管理
- **两级显示控制**：
  - 单词级：生词本中每个词可单独「隐藏/显示」，隐藏后 PDF 上不再高亮（存数据库，跨会话保持）
  - 全局级：工具栏「隐藏生词翻译」总开关，一键隐藏全部高亮
- 已保存生词在 PDF 中黄色高亮，**鼠标悬停才浮出释义**，平时阅读界面干净无干扰
- 释义悬停气泡 + 生词本卡片均可管理

### 笔记
- 阅读视图侧边栏随时记录笔记，自动关联当前页码，可跳转定位
- AI 对话可一键「整理为笔记」，存入同一笔记列表

### 论文库
- 首页论文列表：阅读状态（未读 / 在读 / 已读）、阅读进度条、最后阅读时间、笔记数 / 生词数统计
- 自动记录阅读进度（防抖上报），重新打开自动定位到上次阅读页

### B 站视频悬浮窗
- 为论文关联 B 站讲解视频（支持 BV 号 / av 号 / 完整链接 / b23.tv 短链自动解析）
- 视频以悬浮窗形式叠加在论文页面上：可拖动、可缩放（按钮 + 右下角手柄）、位置尺寸自动记忆
- 边看视频讲解边读论文

### AI 读论文助手（选段模式）
- 每篇论文可创建多个聊天任务，全部持久化存储
- **选段讨论**：创建对话时绑定论文中的一段内容（划选自动带入），AI 围绕选段回答，无需输入全文
- 聊天界面顶部展示绑定的选段，可展开收起；会话列表显示选段摘要
- 对话完成可让 AI 整理总结，生成一条笔记
- AI 设置**全局生效**（对所有论文统一配置），内置服务商预设：
  - 通义千问 Qwen（默认，阿里云百炼，推荐 `qwen-plus`）
  - OpenAI / DeepSeek / 智谱 GLM / 任意 OpenAI 兼容服务

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite 5，pdfjs-dist 3.x（页面渲染 + 文字层） |
| 后端 | Node.js + Express 4 |
| 数据库 | SQLite（better-sqlite3，WAL 模式） |
| 词典 | ECDICT（npm 包导入本地 SQLite，离线查询） |
| AI | OpenAI 兼容 API（`/chat/completions`） |

## 快速开始

### 1. 环境要求

- Node.js >= 18

### 2. 安装依赖并构建词库

```bash
npm install          # 根目录（可选）
npm run setup        # 安装前后端依赖 + 导入 ECDICT 词库到 SQLite（首次约 1-2 分钟）
```

> 词库来自 npm 包 `ecdict`（约 63MB CSV），导入后生成 `server/dict/dict.db`，此后全部离线查询。

### 3. 启动

```bash
npm run server       # 后端 http://localhost:3001
npm run client       # 前端 http://localhost:5173（另开一个终端）
```

浏览器打开 http://localhost:5173 即可使用。

### 4. 配置 AI（可选）

1. 在 [阿里云百炼控制台](https://bailian.console.aliyun.com/) 开通服务并创建 API Key（`sk-` 开头）
2. 论文库首页右上角「**AI 设置**」→ 服务商默认「通义千问 Qwen」→ 填入 API Key → 保存

配置一次全局生效；不配置 AI 时，翻译（本地词典）、生词本、笔记、视频等功能全部正常使用。

## 目录结构

```
paper_read/
├── package.json            # 根启动脚本（setup / server / client）
├── server/
│   ├── index.js            # Express 后端（API + SQLite）
│   ├── build-dict.mjs      # ECDICT CSV -> dict.db 导入脚本
│   ├── pdf-text.mjs        # PDF 全文提取（上传时异步入库）
│   ├── mock-llm.mjs        # 本地 Mock LLM 服务（无 Key 调试 AI 链路用）
│   ├── dict/               # 词库（gitignore，npm run setup 生成）
│   ├── uploads/            # 上传的 PDF（gitignore）
│   └── data/app.db         # 业务数据库（gitignore）
└── client/
    ├── src/
    │   ├── App.jsx         # 视图切换（论文库 / 阅读视图）
    │   ├── bili.js         # B 站播放器地址工具
    │   ├── styles.css
    │   └── components/
    │       ├── PaperLibrary.jsx    # 论文库首页
    │       ├── PdfViewer.jsx       # PDF 渲染 + 划词/双击取词 + 生词高亮
    │       ├── TranslatePopup.jsx  # 翻译弹窗
    │       ├── NotesPanel.jsx      # 笔记侧边栏
    │       ├── WordsPanel.jsx      # 生词本侧边栏
    │       ├── ChatPanel.jsx       # AI 对话（选段模式）
    │       ├── AiSettingsModal.jsx # AI 设置（服务商预设）
    │       ├── VideoPanel.jsx      # 视频控制条
    │       └── FloatingVideo.jsx   # 可拖动缩放视频悬浮窗
    └── vite.config.js      # /api 代理到 3001
```

## 主要 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST/DELETE | `/api/papers` | 论文列表 / 上传 / 删除 |
| PATCH | `/api/papers/:id` `/progress` `/video` | 阅读状态 / 进度 / 关联 B 站视频 |
| GET | `/api/translate?text=` | 本地词典查词 |
| GET/POST/DELETE | `/api/papers/:id/notes` `/words` | 笔记 / 生词 CRUD |
| PATCH | `/api/words/:id` | 单词级显示/隐藏 |
| GET/PUT | `/api/settings` | AI 全局配置（Key 脱敏返回） |
| POST | `/api/papers/:id/chats` | AI 会话（创建 / 发消息 / 整理为笔记等） |

## 常见问题

- **划词无翻译结果**：确认已运行过 `npm run setup`（`server/dict/dict.db` 存在）
- **AI 报「未配置」**：论文库首页「AI 设置」填入 API Key；弹窗内会显示具体报错（如 401 表示 Key 无效）
- **B 站视频白屏**：部分视频 B 站禁止站外嵌入，换一个视频或复制链接去原站观看
- **无 API Key 想调试 AI 功能**：`cd server && node mock-llm.mjs` 启动本地 Mock（3002 端口），AI 设置地址填 `http://localhost:3002/v1` 即可

## License

MIT
