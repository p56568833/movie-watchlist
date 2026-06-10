# 🎬 片单 · THE COLLECTION

**CC 铁皮电影盘风格 · 多片单电影收藏应用**

全栈单页应用，管理多个电影片单，集成 TMDB 实时搜索、影人详情、系列浏览、发现页。

---

## 功能亮点

- 🔍 **智能搜索** — 搜索框支持中英文，自动区分影人和电影
- 👤 **影人详情** — 头像、简介（可折叠）、导演/编剧/参演作品分区展示
- 🎬 **电影详情** — 横版剧照 banner、TMDB 评分、演员表、导演可跳转
- 📦 **系列浏览** — 自动识别电影系列（如教父、指环王），横向卡片展示全部作品
- 🔥 **发现页** — 全球流行 + 🇨🇳 大陆热映，浏览 TMDB 热门电影一键添加
- 🔗 **无限跳转** — 影人 → 电影 → 导演 → 另一部电影… 导航栈支持逐层返回
- 📋 **多片单管理** — 创建/编辑/删除片单，点击切换
- 🔐 **用户认证** — 注册/登录，JWT 鉴权，多用户数据隔离

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite（`@libsql/client`，可选 Turso 云同步） |
| 前端 | Vanilla HTML/CSS/JS，ES Modules，零框架 |
| 电影数据 | TMDB API v3（前端直调 + 后端代理） |
| 认证 | JWT（`jsonwebtoken`） |

## 项目结构

```
movie-watchlist/
├── server.js             # 启动入口（端口、局域网 IP、优雅退出）
├── app.js                # Express 应用（路由、中间件）
├── db.js                 # 数据库层（lists + movies + users CRUD）
├── package.json          # 依赖
├── vercel.json           # Vercel 部署配置
├── middleware/
│   └── auth.js           # JWT 认证中间件
├── routes/
│   ├── auth.js           # 注册 / 登录
│   ├── lists.js          # 片单 CRUD
│   ├── movies.js         # 电影 CRUD
│   └── tmdb.js           # TMDB 代理（collection API）
├── scripts/
│   └── migrate-to-turso.js
├── public/
│   ├── index.html        # 页面结构
│   ├── app.js            # 前端入口
│   ├── style.css         # 样式入口（@import 全部模块）
│   ├── js/               # 前端逻辑（24 个模块）
│   │   ├── init.js           # 初始化 & 模块编排
│   │   ├── state.js          # 全局状态管理（pub/sub）
│   │   ├── api.js            # 后端 API 封装
│   │   ├── dom.js            # DOM 工具
│   │   ├── utils.js          # 通用工具
│   │   ├── constants.js      # TMDB 基地址 & 图片 CDN
│   │   ├── auth.js           # 前端登录/注册 UI
│   │   ├── tmdbSearch.js     # TMDB 搜索（影人+电影分区）
│   │   ├── tmdbApi.js        # TMDB API（详情/系列/相似/发现）
│   │   ├── discover.js       # 发现页（流行 + 大陆热映）
│   │   ├── detailPanel.js    # 电影详情页
│   │   ├── detailStack.js    # 导航栈（影人↔电影循环跳转）
│   │   ├── personDetail.js   # 影人详情页
│   │   ├── lists.js          # 片单 CRUD & 侧栏渲染
│   │   ├── movies.js         # 电影列表渲染 & 筛选
│   │   ├── movieCard.js      # 电影卡片组件
│   │   ├── movieForm.js      # 添加/编辑电影表单
│   │   ├── listForm.js       # 新建/编辑片单表单
│   │   ├── navigation.js     # 页面导航（打破循环依赖）
│   │   ├── settings.js       # TMDB API Key 设置
│   │   ├── deletePopover.js  # 删除确认气泡
│   │   ├── deleteConfirm.js  # 删除确认弹窗
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
│       ├── 16-delete-popover.css
│       ├── 17-detail-panel.css   # 电影详情页
│       ├── 19-responsive.css # 响应式
│       └── 20-person-detail.css  # 影人详情页
└── test/
    ├── api.test.js       # API 集成测试
    ├── db.test.js        # 数据库单元测试
    └── frontend.test.js  # 前端单元测试
```

## 快速启动

```bash
cd movie-watchlist
npm install
npm start        # 启动服务 → http://localhost:3000
npm test         # 运行全部测试
```

手机等局域网设备可通过启动时打印的 IP 访问。

### 环境变量

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口（默认 3000） |
| `DB_PATH` | SQLite 文件路径（默认 `movies.db`） |
| `TURSO_URL` | Turso 数据库 URL（设置后使用远程 Turso） |
| `TURSO_AUTH_TOKEN` | Turso 认证 Token |
| `JWT_SECRET` | JWT 签名密钥（生产环境务必设置） |

### 用户认证

应用支持注册/登录，JWT 鉴权。不登录可以浏览但无法管理片单。设置 `JWT_SECRET` 环境变量以确保安全。

## 使用指南

### 1. 配置 TMDB API Key
- 前往 [TMDB Settings → API](https://www.themoviedb.org/settings/api) 申请免费 Key
- 在应用中点 ⚙️ 齿轮图标 → 输入 Key → 保存
- Key 仅存储在浏览器 localStorage

### 2. 搜索 & 添加电影
- 顶部搜索框输入片名或导演/演员名
- 结果分「影人」和「电影」两个区域
- 点击电影 → 进入详情页
- 点击 `+ 添加` → 直接加入当前片单
- 点击影人 → 进入影人详情页

### 3. 发现页
- 侧栏「发现」进入
- 🔥 **流行** — TMDB 全球热门电影
- 🇨🇳 **大陆热映** — 中国大陆院线正在上映
- 点击添加按钮一键入库

### 4. 电影详情
- 横版剧照 banner、TMDB 评分、类型标签
- 导演为可点击头像按钮 → 跳转影人详情
- 演员表横向浏览
- 📦 **系列** — 自动识别并展示全部系列电影（如教父三部曲）
- 🎬 **相似推荐** — TMDB 算法推荐
- 左上角 `← 返回` 逐层回退，右上角 `×` 关闭

### 5. 管理片单
- 左侧栏底部 `+ 新建片单`
- 点击片单名称切换
- 顶栏 ✏️ 编辑 / 🗑️ 删除

### 6. 筛选 & 排序
- 片名/导演实时搜索
- 标签筛选：点击卡片上的标签
- 排序：最近添加 / 片名 / 年份 / 评分

## API 文档

所有 API 返回 JSON。需要认证的接口带 `Authorization: Bearer <token>` 头。

### 认证

| Method | Path | 认证 | 说明 |
|--------|------|:----:|------|
| POST | `/api/auth/register` | — | 注册 `{username, password}` |
| POST | `/api/auth/login` | — | 登录 `{username, password}` |
| GET | `/api/auth/me` | ✅ | 获取当前用户 |

### 片单

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/lists` | 获取用户的全部片单 |
| POST | `/api/lists` | 创建片单 `{name, description?}` |
| PUT | `/api/lists/:id` | 更新片单 |
| DELETE | `/api/lists/:id` | 删除片单（级联删除电影） |

### 电影

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/lists/:listId/movies` | 获取片单内电影 `?search=&status=&tag=&sort=` |
| POST | `/api/lists/:listId/movies` | 添加电影到片单 |
| PUT | `/api/movies/:id` | 更新电影 |
| DELETE | `/api/movies/:id` | 删除电影 |

### TMDB 代理

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/tmdb/collection/:id` | 获取系列电影列表 |

### 电影对象

```json
{
  "id": 1,
  "list_id": 1,
  "title": "寄生虫",
  "year": 2019,
  "director": "奉俊昊",
  "poster_path": "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
  "tmdb_id": 496243,
  "rating": 5,
  "status": "watched",
  "notes": "奉俊昊最佳",
  "tagline": "他们是不可信的",
  "tags": ["韩国", "剧情"],
  "created_at": "2026-06-08 06:06:06"
}
```

## 设计风格

致敬 **The Criterion Collection** 视觉语言：

- **配色**：深炭黑底 + CC 金红点缀
- **纹理**：SVG 噪点覆盖层 + 拉丝金属渐变卡片
- **字体**：Playfair Display 衬线 + Noto Serif SC 中文衬线
- **质感**：卡片悬停金边辉光 + 物理厚度阴影 + 交错入场动画

## License

MIT
