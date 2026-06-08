# 🎬 片单 · THE COLLECTION

**CC 铁皮电影盘风格 · 多片单电影收藏应用**

全栈单页应用，管理多个电影片单，集成 TMDB 实时搜索自动填充海报与信息。

---

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite（sql.js，纯 JS/WASM，零原生依赖） |
| 前端 | Vanilla HTML/CSS/JS（无框架） |
| 电影数据 | TMDB API v3（前端直调，Key 存 localStorage） |
| 字体 | Playfair Display + Noto Serif SC（Google Fonts） |

## 项目结构

```
movie-watchlist/
├── package.json          # 依赖：express, sql.js
├── server.js             # Express 服务器 + RESTful API
├── db.js                 # SQLite 数据库层（lists + movies CRUD）
├── movies.db             # SQLite 数据库文件（自动创建）
├── README.md             # 本文件
├── .gitignore
└── public/               # 前端静态资源
    ├── index.html        # 页面结构（侧边栏 + 主内容 + 弹窗）
    ├── style.css         # CC 铁皮盘美学样式
    └── app.js            # 前端交互逻辑（TMDB、多片单、表单）
```

## 快速启动

```bash
cd movie-watchlist
npm install
npm start
# → 打开 http://localhost:3000
```

## 使用流程

### 1. 配置 TMDB API Key
- 前往 [TMDB Settings → API](https://www.themoviedb.org/settings/api) 申请免费 Key
- 在应用中点左下角 **⚙ 齿轮图标** → 输入 Key → 保存
- Key 仅存储在浏览器 localStorage，不经过服务端

### 2. 管理片单
- **新建片单**：左侧栏底部「+ 新建片单」
- **切换片单**：点击左侧栏中的片单名称
- **重命名/描述**：顶栏 ✏️ 编辑按钮
- **删除片单**：顶栏 🗑️ 删除按钮（级联删除片单内所有电影，最后一个片单不可删除）

### 3. 添加电影
- 点击「添加电影」按钮
- **TMDB 搜索**：在弹窗顶部搜索框输入片名 → 点选结果自动填充片名/年份/海报
- **补充信息**：导演、评分（1-5 星）、状态（想看/已看）、标签、备注
- 保存后电影卡片自动出现在当前片单中

### 4. 浏览与筛选
- 🔍 **搜索**：片名/导演实时搜索
- 🏷️ **状态筛选**：全部 / 想看 / 已看
- 🔖 **标签筛选**：点击卡片上的标签即可按标签过滤
- 📊 **排序**：最近添加 / 片名 / 年份 / 评分

## API 文档

所有 API 返回 JSON，Content-Type: `application/json`。

### 片单

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/lists` | 获取全部片单 |
| POST | `/api/lists` | 创建片单 `{name, description?}` |
| PUT | `/api/lists/:id` | 更新片单 `{name?, description?}` |
| DELETE | `/api/lists/:id` | 删除片单（级联删除电影） |

### 电影（list-scoped）

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

### 电影对象 Schema

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

「CC 铁皮电影盘」致敬 **The Criterion Collection** 的视觉语言：

- **配色**：深炭黑底 `#0d0d0d` + CC 金铜色 `#c4a265` 点缀
- **纹理**：SVG 噪点颗粒覆盖层 + 拉丝金属渐变卡片
- **字体**：Playfair Display 衬线标题 + Noto Serif SC 中文衬线
- **质感**：卡片悬停金边辉光 + 物理厚度阴影 + 交错入场动画
- **空状态**：CSS 浮动光碟动画

## 迁移说明

旧版（无多片单）数据库自动迁移：
1. 首次启动时自动创建 `lists` 表
2. 旧 `movies` 表自动追加 `list_id`、`tmdb_id`、`poster_path` 列
3. 自动创建「我的片单」并将所有旧电影归入其中

## License

MIT
