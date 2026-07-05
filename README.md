# 华语云课 HuaLearn Global

面向欧洲与全球中国用户的在线授课平台框架。项目采用 monorepo：

- `apps/web`: Next.js + Tailwind CSS 信息展示站、学习端、机构管理端
- `apps/api`: FastAPI + SQLAlchemy 服务层
- `docker-compose.yml`: PostgreSQL + Redis 本地开发依赖

## 快速启动

1. 复制环境变量：

```powershell
Copy-Item .env.example .env
```

2. 启动 PostgreSQL 和 Redis：

```powershell
docker compose up -d
```

3. 启动后端：

```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
uvicorn app.main:app --reload --port 8000
```

后端启动时会自动建表并写入 dummy 数据。API 文档地址：`http://localhost:8000/docs`

4. 启动前端：

```powershell
cd apps/web
npm install
npm run dev
```

前端地址：`http://localhost:3000`

## 演示账号

- 学生：`student@example.com` / `password123`
- 机构管理员：`admin@example.com` / `password123`

当前认证是 demo token 骨架，后续可替换为 JWT、OAuth 回调和 Stripe 订阅 Webhook。

## 核心页面

- `/`: 信息展示首页，包含导航、搜索、登录/注册入口、机构、热门课程、YouTube 引流、热门老师、页脚
- `/courses`: 课程分类与机构筛选页
- `/courses/[slug]`: 课程详情页
- `/courses/[slug]/register`: 按月订阅注册页，每门课程 39 欧元/月
- `/teachers/[slug]`: 老师详情页
- `/blog`: 博客列表与详情
- `/learn`: 学生上课平台，包含课程进度、章节菜单、视频/讲义/练习/测验与笔记区域
- `/admin`: 机构管理员平台，包含数据概览、课程、题库、老师、订阅和判卷管理入口
- `/admin/login`: 机构后台登录页，管理员和老师使用账号密码进入后台
- `/admin/register`: 机构注册入口

## 前端模块结构

- `apps/web/app/(marketing)`: 信息展示网站
- `apps/web/app/(student)/learn`: 学生上课平台
- `apps/web/app/(admin)/admin`: 机构后台管理系统
- `apps/web/components/admin`: 机构后台页面、登录页和管理模块组件

## API 分组

- `POST /api/v1/auth/register`: email 注册
- `POST /api/v1/auth/login`: email 登录
- `GET /api/v1/auth/social/{provider}/login-url`: Google/Facebook 登录 URL 占位
- `GET /api/v1/institutions`: 机构列表
- `GET /api/v1/courses`: 课程列表，支持 `category`、`institution`、`level`、`hot`
- `GET /api/v1/courses/{slug}`: 课程详情
- `GET /api/v1/teachers`: 老师列表
- `GET /api/v1/blog`: 博客列表
- `GET /api/v1/learn/me/dashboard`: 学生学习首页数据
- `POST /api/v1/learn/items/{item_id}/complete`: 标记课件完成
- `POST /api/v1/learn/questions/{question_id}/submit`: 提交题目答案
- `GET /api/v1/admin/overview`: 管理端统计
- `GET/POST /api/v1/admin/courses`: 课程管理
- `GET/POST /api/v1/admin/teachers`: 老师管理
- `GET/POST /api/v1/admin/questions`: 题库管理
- `GET /api/v1/admin/subscriptions`: 订阅管理
- `GET /api/v1/admin/grading`: 人工判卷队列

## 数据库表结构

- `institutions`: 教育机构信息、LOGO、区域、官网
- `users`: 学生、机构管理员、超级管理员，支持 email 与社交登录来源
- `teachers`: 老师资料、所属机构、头像、擅长方向
- `courses`: 课程主表，包含分类、级别、价格、试听视频、课程大纲、热门状态
- `course_chapters`: 课程章节
- `lesson_items`: 章节下的课件，类型包含视频、讲义、练习、测验
- `enrollments`: 用户报名/学习进度
- `progress_records`: 每个课件的完成记录、分数和学生笔记
- `questions`: 题库，覆盖单选、多选、填空、编程、改代码、判断、阅读、听力、口语、写作、媒体上传
- `submissions`: 学生答题提交，支持自动判卷和人工判卷
- `subscriptions`: 每门课程 39 欧元/月的订阅记录
- `blog_posts`: 展示站博客文章

## 后续建议

- 接入 Alembic 管理数据库迁移
- 用 NextAuth 或自建 OAuth 回调完成 Google/Facebook 登录
- 用 Stripe Checkout + Webhook 落地欧元订阅
- 为编程题接入沙箱执行服务，例如 Judge0、Firecracker 或自托管容器池
- 为口语题接入语音转写、发音评分和人工复核流程
