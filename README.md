# 🎬 片单 · THE COLLECTION

**CC 铁皮电影盘风格 · 多片单电影收藏应用**

全栈单页应用，管理多个电影片单，集成 TMDB 实时搜索、影人详情、电影详情循环跳转。

---

## 功能亮点

- 🔍 **智能搜索** — 搜索框支持中英文，自动区分影人和电影，搜导演/演员名直接出人
- 👤 **影人详情** — 头像、简介（可折叠）、导演/编剧/参演作品分区展示
- 🎬 **电影详情** — 横版剧照 banner、TMDB 评分、演员表、导演可点击跳转
- 🔗 **无限跳转** — 影人 → 电影 → 导演 → 另一部电影… 导航栈支持逐层返回
- 📋 **多片单管理** — 创建/编辑/删除片单，拖拽或点击切换
- 🏷️ **标签系统** — 自定义标签，按标签筛选
- 🎨 **CC 铁皮盘美学** — 深色主题、噪点纹理、拉丝金属卡片、金红配色

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite（sql.js，纯 JS/WASM，零原生依赖） |
| 前端 | Vanilla HTML/CSS/JS，ES Modules，无框架 |
| 电影数据 | TMDB API v3（前端直调，Key 存 localStorage） |
| 测试 | Node.js 内置 `node:test`（49 项） |
| 字体 | Playfair Display + Noto Serif SC（Google Fonts） |

## 项目结构

```
movie-watchlist/
├── server.js             # 启动入口（端口、局域网 IP、优雅退出）
├── app.js                # Express 应用（路由、中间件）
├── db.js                 # SQLite 数据库层（lists + movies CRUD）
├── package.json          # 依赖：express, sql.js
├── Dockerfile            # 多阶段 Docker 构建
├── railway.toml          # Railway 部署配置
├── public/
│   ├── index.html        # 页面结构（侧边栏 + 主内容 + 全部弹窗）
│   ├── app.js            # 前端入口（ES Module）
│   ├── style.css         # 样式入口（@import 所有模块）
│   ├── js/               # 前端逻辑（18 个模块）
│   │   ├── init.js           # 初始化 & 模块编排
│   │   ├── state.js          # 全局状态管理
│   │   ├── api.js            # 后端 API 封装
│   │   ├── dom.js            # DOM 工具（$ / $$）
│   │   ├── utils.js          # 通用工具（esc / posterUrl）
│   │   ├── constants.js      # TMDB URL & 图片基地址
│   │   ├── tmdbSearch.js     # TMDB 搜索（影人+电影分区）
│   │   ├── personDetail.js   # 影人详情页
│   │   ├── detailPanel.js    # 电影详情页
│   │   ├── detailStack.js    # 导航栈（影人↔电影循环跳转）
│   │   ├── lists.js          # 片单 CRUD & 侧栏渲染
│   │   ├── movies.js         # 电影列表渲染 & 筛选
│   │   ├── movieCard.js      # 电影卡片组件
│   │   ├── movieForm.js      # 添加/编辑电影表单
│   │   ├── listForm.js       # 新建/编辑片单表单
│   │   ├── settings.js       # TMDB API Key 设置
│   │   ├── deletePopover.js  # 删除确认气泡
│   │   ├── toast.js          # Toast 通知
│   │   └── events.js         # 全局事件绑定
│   └── styles/           # CSS 模块（20 个文件）
│       ├── 01-tokens.css     # CSS 变量
│       ├── 02-reset.css      # 重置 & body 背景
│       ├── 03-layout.css     # 整体布局 & 噪点纹理
│       ├── 04-sidebar.css    # 侧边栏
│       ├── 05-header.css     # 顶栏
│       ├── 06-buttons.css    # 按钮
│       ├── 07-toolbar.css    # 筛选工具栏
│       ├── 08-tmdb-search.css# TMDB 搜索栏 & 下拉
│       ├── 09-movie-grid.css # 电影网格
│       ├── 10-movie-card.css # 电影卡片
│       ├── 11-empty-state.css# 空状态
│       ├── 12-modal.css      # 通用弹窗
│       ├── 13-forms.css      # 表单
│       ├── 14-tags.css       # 标签
│       ├── 15-toast.css      # Toast
│       ├── 16-delete-popover.css # 删除确认气泡
│       ├── 17-detail-panel.css   # 电影详情页
│       ├── 18-floating-delete.css# (已废弃，保留引用)
│       ├── 19-responsive.css # 响应式
│       └── 20-person-detail.css  # 影人详情页
└── test/
    ├── api.test.js       # API 集成测试（27 项）
    └── db.test.js        # 数据库单元测试（22 项）
```

## 快速启动

```bash
cd movie-watchlist
npm install
npm start        # 启动服务 → http://localhost:3000
npm test         # 运行全部测试（49 项）
```

## 使用指南

### 1. 配置 TMDB API Key
- 前往 [TMDB Settings → API](https://www.themoviedb.org/settings/api) 申请免费 Key
- 在应用中点左下角 ⚙️ 齿轮图标 → 输入 Key → 保存
- Key 仅存储在浏览器 localStorage，不经过服务端

### 2. 搜索 & 添加电影
- 顶部搜索框输入片名或导演/演员名
- 搜索结果分「影人」和「电影」两个区域
- 点击电影 → 进入电影详情页查看完整信息
- 点击 `+ 添加` → 直接加入当前片单
- 点击影人 → 进入影人详情页浏览作品

### 3. 浏览影人 & 电影
- 影人详情页：头像、简介（可展开）、导演/编剧/参演作品分区
- 点击作品卡片 → 跳转电影详情
- 电影详情页：横版剧照 banner、TMDB 评分、演员表
- 导演显示为可点击头像按钮 → 跳回影人详情
- 左上角 `← 返回` 逐层回退，右上角 `×` 关闭

### 4. 管理片单
- 左侧栏底部 `+ 新建片单` 创建新片单
- 点击片单名称切换
- 顶栏 ✏️ 编辑片单名称/描述
- 顶栏 🗑️ 删除片单（级联删除，最后一个不可删）

### 5. 筛选 & 排序
- 片名/导演实时搜索
- 状态筛选：全部 / 已看
- 标签筛选：点击卡片上的标签
- 排序：最近添加 / 片名 / 年份 / 评分

## API 文档

所有 API 返回 JSON，Content-Type: `application/json`。

### 片单

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/lists` | 获取全部片单 |
| POST | `/api/lists` | 创建片单 `{name, description?}` |
| PUT | `/api/lists/:id` | 更新片单 `{name?, description?}` |
| DELETE | `/api/lists/:id` | 删除片单（级联删除电影） |

### 电影

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/lists/:listId/movies` | 获取片单内电影 `?search=&status=&tag=&sort=` |
| POST | `/api/lists/:listId/movies` | 添加电影到片单 |
| PUT | `/api/movies/:id` | 更新电影 |
| DELETE | `/api/movies/:id` | 删除电影 |

### 标签

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/lists/:listId/tags` | 获取片单内所有已用标签 |

### 电影对象

```json
{
  "id": 1,
  "list_id": 1,
  "title": "寄生虫",
  "year": 2019,
  "director": "奉俊昊",
  "poster_url": "",
  "poster_path": "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
  "tmdb_id": 496243,
  "rating": 5,
  "status": "watched",
  "notes": "奉俊昊最佳",
  "tags": ["韩国", "剧情"],
  "created_at": "2026-06-08 06:06:06"
}
```

`poster_path` 拼接 `https://image.tmdb.org/t/p/w500/` 即为完整海报 URL。

## 设计风格

致敬 **The Criterion Collection** 的视觉语言：

- **配色**：深炭黑底 + CC 金红点缀
- **纹理**：SVG 噪点颗粒覆盖层 + 拉丝金属渐变卡片
- **字体**：Playfair Display 衬线标题 + Noto Serif SC 中文衬线
- **质感**：卡片悬停金边辉光 + 物理厚度阴影 + 交错入场动画
- **空状态**：CSS 浮动光碟动画

## 测试

```bash
npm test           # 运行全部 49 项测试
npm run test:api   # 仅 API 集成测试
npm run test:db    # 仅数据库单元测试
```

使用 Node.js 内置 `node:test` 测试框架，无需额外依赖。

## License

MIT
