# 课后练习助手系统 — 设计文档

> 版本：v0.1（骨架 + 教学功能迭代版）
> 定位：面向教师与学生的课后练习辅助系统，围绕「课程」组织课堂录音、图片、习题、笔记、错题与学习计划。

---

## 1. 项目概述

「课后练习助手」是一款**桌面 Web 应用**，帮助学生在课后围绕课堂内容进行复习，帮助教师掌握学情。系统以「班级 → 课程」为组织核心，一条课程聚合了课堂录音、课程图片、自动习题、笔记、留言、错题本、AI 学习计划等资源，并区分「学生端」与「老师端」两套能力。

### 1.1 核心价值
- **学生端**：沉浸式课后学习——录音复盘、图文对照、自动习题、错题本、AI 学习计划、学习打卡。
- **老师端**：学情查看——课程级数据看板、全班错题汇总、老师交流区（教研沟通）。

### 1.2 技术形态
| 维度 | 选型 |
|------|------|
| 桌面壳 | Electron |
| 前端 | Vue 3 + Vite + 原生 CSS |
| 后端 | Node.js + Express |
| 数据库 | SQLite（`node:sqlite` 内置驱动，无原生编译） |
| 文件存储 | 本地文件系统目录（`backend/storage/{audios,images}`） |
| 包管理 | npm workspaces（多包 monorepo） |

### 1.3 目录结构
```
练习助手/
├─ package.json              # 根：workspaces + 并行开发脚本
├─ npmw.cmd                  # PATH 包装脚本（Windows 环境注入 node）
├─ backend/                  # 后端 API
│  ├─ package.json
│  └─ src/
│     ├─ server.js           # Express 入口、路由挂载、静态文件
│     ├─ db.js               # SQLite 连接、建表、迁移、存储目录
│     ├─ auth.js             # 密码哈希、JWT 签发/校验、鉴权中间件
│     ├─ messageUtil.js      # 留言嵌套树构建（复用）
│     ├─ questionGenerator.js # 本地规则习题生成器
│     ├─ noteGenerator.js    # 本地规则笔记生成器
│     └─ routes/             # 各资源 REST 路由
├─ frontend/                 # 前端 SPA
│  ├─ package.json
│  ├─ vite.config.js
│  └─ src/
│     ├─ main.js / App.vue   # 入口与视图路由
│     ├─ api/client.js       # 集中式 HTTP 客户端
│     ├─ components/         # 通用组件（MarkdownView、StudyPlanView）
│     └─ views/              # 页面级组件
└─ electron/                 # 桌面壳
   ├─ package.json
   ├─ main.js                # 主进程：启动后端 + 加载前端
   └─ preload.js             # 预加载脚本
```

---

## 2. 系统架构

### 2.1 分层架构
```
┌─────────────────────────────────────────────┐
│  表现层（Electron 壳 + Vue SPA）             │
│  视图：登录 / 我的班级 / 班级课程 / 课程详情 / 个人中心
├─────────────────────────────────────────────┤
│  业务逻辑层（后端 REST API）                  │
│  auth / classes / courses / uploads /       │
│  questions / messages / notes / wrongs /    │
│  teacher-chats / plans / study-logs / profile
├─────────────────────────────────────────────┤
│  数据访问层（node:sqlite 同步 SQL 交互）       │
├─────────────────────────────────────────────┤
│  数据层                                       │
│  SQLite（结构化数据） + 本地文件（音频/图片）    │
└─────────────────────────────────────────────┘
```

### 2.2 关键架构决策
1. **数据与文件分离**：数据库只存音频/图片的元数据（文件名字、路径、尺寸、时长），文件本体放在 `storage/` 目录，未来可平滑迁移对象存储。
2. **课程为聚合根**：录音、图片、习题、笔记、留言、错题、学习计划都以 `course_id` 归属课程，便于课程级删除与统计。
3. **本地规则智能**：习题、笔记、学习计划均基于课程标题、学科、转写文本、资源文件名做**本地规则聚合生成**，不依赖外部大模型 Key，可离线运行。
4. **认证无状态**：使用 HMAC-SHA256 签发的 base64url JWT，`authMiddleware` 统一鉴权，按角色控制操作。
5. **Express 错误处理**：统一错误中间件返回 JSON，前端 `client.js` 集中处理错误提示。

---

## 3. 数据模型

### 3.1 实体关系（ER 概览）
```
users ─┬─< class_members >─ classes（多对多 + 班级内角色）
       └─< owner_id

classes ─< courses（一班级多课程）
courses ─< recordings / images / questions / messages / notes / wrong_questions / study_plans
users ─< recordings(上传) / images(上传) / messages / wrong_questions(创建) / study_plans(持有) / study_logs
classes ─< teacher_chats（班级级教师群聊）
```

### 3.2 表结构
| 表 | 作用 | 关键字段 |
|----|------|----------|
| `users` | 用户 | `username`(唯一)、`password`(加盐哈希)、`role`(teacher/student) |
| `classes` | 班级 | `name`、`invite_code`(唯一，随机8位hex)、`owner_id` |
| `class_members` | 班级成员 | `(class_id,user_id)` 联合唯一、`role` |
| `courses` | 课程 | `class_id`、`title`、`subject` |
| `recordings` | 课堂录音 | `filename`、`storage`、`duration`、`size`、`transcript`(转写文本) |
| `images` | 课程图片 | `filename`、`storage`、`size` |
| `questions` | 自动习题 | `type`(choice/fill/essay)、`question`、`options`(JSON)、`answer` |
| `messages` | 课程留言 | `parent_id`(楼层式回复)、`content` |
| `teacher_chats` | 班级老师群聊 | `content` |
| `notes` | 课程笔记 | `content`、`auto_generated` |
| `wrong_questions` | 错题本 | `question_id`(可空)、`content`、`my_answer`、`correct_answer`、`source`(manual/question) |
| `study_plans` | AI 学习计划 | `preview`/`review`/`practice`(markdown)、`state`(勾选完成状态 JSON) |
| `study_logs` | 学习打卡日志 | `(user_id,course_id,log_date)` 联合唯一、`seconds`(当天累加秒数) |

### 3.3 数据约束
- `PRAGMA foreign_keys = ON` 开启外键级联，删课程/班级会级联清理子资源。
- 轻量**滚动迁移**：对已存在的表通过 `ALTER TABLE ... ADD COLUMN`（捕获重复列异常）实现增量字段升级（如 `transcript`、`parent_id`、`state`）。

---

## 4. 功能模块详解

### 4.1 认证与账号（auth）
- `POST /api/auth/register`：注册，支持选择老师/学生角色；密码用 `scrypt + 随机盐` 存储。
- `POST /api/auth/login`：登录，返回用户信息与签名 token。
- 后续所有接口经 `authMiddleware` 校验 `Authorization: Bearer <token>`。

### 4.2 班级管理（classes）
- **老师**：创建班级（自动生成唯一邀请码）、删除自己创建的班级。
- **学生**：凭邀请码加入班级。
- 班级列表接口返回成员数、我的身份（`my_role`）。

### 4.3 课程资源（courses / uploads）
- 班级下创建课程，一个课程为一个教学单元。
- **录音**：学生端课程详情页用浏览器 `MediaRecorder` 录制，上传到 `storage/audios/`，记录时长。
- **图片**：上传到 `storage/images/`，支持预览。
- 课程详情接口聚合返回录音、图片、习题、留言树、笔记、错题。

### 4.4 自动习题（questions + questionGenerator）
- 用本地规则从课程标题、学科、录音/图片文件名提取关键词。
- 生成三种题型：**单选（choice）**、**填空（fill）**、**简答（essay）**，每题带参考答案。
- 前端单选题 ABCD 可点击作答，答题后即时判对错。

### 4.5 笔记（notes + noteGenerator）
- 一键生成结构化笔记：基本信息、课程资源清单、知识要点、复习建议，并嵌入转写摘录。
- 实现「AI 生成」与「手动编辑保存」两种模式（`auto_generated` 标记）。

### 4.6 留言与讨论（messages）
- 课程级留言板，**楼层式嵌套回复**（`parent_id`），老师学生可互回。
- 留言树在后端统一构建（`fetchMessagesTree`），避免前端递归复杂度。
- 老师或留言作者可删除。

### 4.7 错题本与汇总（wrongs）
- **学生**：做题标记「加入错题本」（`source=question`），或手动添加（`source=manual`）。
- **老师**：班级级「错题汇总」接口，跨课程聚合全班学生错题（`GET /api/wrongs/class-report/:classId`，仅老师角色）。
- 权限校验：老师汇总接口要求 `role === 'teacher'`。

### 4.8 老师交流区（teacher-chats）
- 班级内的教师群聊，仅该班级的**老师成员**可访问（`class_members.role='teacher'` 校验）。
- 用于班主任与各科老师教研沟通。

### 4.9 老师端学习数据看板（courses/:id/stats）
- 老师进入具体课程时，不再显示学生功能模块，而是展示**学习数据看板**：
  - 概览卡片：学生人数、错题总数、留言总数、习题数、录音数、图片数。
  - **学生错题排行**（条形图）。
  - **学生参与度**（按留言数排名，条形图）。
  - **错题来源分布**（手写/来自习题）。
- 看板数据来自 `GET /api/courses/:id/stats`，仅聚合该课程。

### 4.10 AI 学习计划（plans + StudyPlanView）
- **学生端**课程详情页顶部：一键生成「**预习 / 复习 / 练习**」三阶段学习计划。
- 计划为 markdown，前端以**专门的计划 UI** 展示（`StudyPlanView.vue`）：每阶段拆分为标题、说明、步骤清单、产出，**每个步骤前有可勾选方框**，勾选进度以百分比显示并持久化到 `study_plans.state`。
- 计划内容基于课程信息 + 转写文本 + 资源名本地规则生成。

### 4.11 学习打卡与个人中心（study-logs / profile）
- **来源**：学生端课程详情页的「⏱️ 学习打卡」计时器，点「开始学习」计时，点「结束学习」上报本次秒数，按 `(用户, 课程, 日期)` 当天累加。
- **个人中心**：点击右上角用户名进入，展示：
  - **我的班级**：班级列表（可进入）。
  - **打卡日志**（仅学生）：累计天数/小时 + **日历热力图**（每月一个网格，每天按学习时长渲染颜色深度）。
- 接口：`POST /api/study-logs/:courseId`、`GET /api/study-logs/month/:month`、`GET /api/study-logs/summary`、`GET /api/profile/me`。

### 4.12 Markdown 渲染（组件）
- `MarkdownView.vue`：基于 `marked` 将任意 markdown（笔记、计划等）渲染为结构化 HTML。
- `StudyPlanView.vue`：在上面基础上扩展了可勾选任务列表的专门计划视图。

---

## 5. 前端设计与页面流转

### 5.1 视图导航（App.vue 状态机）
```
未登录 ──登录/注册──> 我的班级(classes)
                         │ 点击班级
                         ▼
                      班级课程(courses)
                         │ 点击课程
                         ▼
                      课程详情(course)
                         │（学生端显示学习功能 / 老师端显示数据看板）
我的班级 ──点击右上角用户名──> 个人中心(profile) ──点击班级──> 班级课程
```
- 采用简单状态机（`view` 字段 + `currentClass`/`currentCourse`）而非 vue-router，保持轻量。
- 退出登录清空本地会话并重置视图。

### 5.2 前端组件职责
| 组件 | 职责 |
|------|------|
| `LoginView.vue` | 登录 / 注册切换、身份选择 |
| `ClassesView.vue` | 班级列表、创建/加入班级、进入班级、个人中心入口 |
| `ClassCoursesView.vue` | 课程列表、新建课程、老师端错题汇总与老师交流区 |
| `CourseDetailView.vue` | 核心页面：录音、图片、笔记、习题、留言、错题、学习计划、学习打卡、老师看板 |
| `ProfileView.vue` | 个人中心：我的班级 + 打卡热力图 |
| `StudyPlanView.vue` | AI 学习计划专用可勾选 UI |
| `MarkdownView.vue` | markdown → HTML 渲染 |

### 5.3 API 客户端（api/client.js）
- `request()`：统一 fetch 封装（JSON、自动注入 token、统一错误抛出）。
- `upload()`：FormData 文件上传（录音、图片）。
- 按资源域分组导出 `authApi / classApi / courseApi / uploadApi / questionApi / messageApi / noteApi / wrongApi / teacherChatApi / planApi / studyLogApi / profileApi`。
- `saveSession / loadSession / clearSession`：localStorage 会话管理。

---

## 6. 角色权限矩阵

| 操作 | 学生 | 老师 |
|------|:----:|:----:|
| 注册/登录 | ✅ | ✅ |
| 创建班级 | ❌ | ✅ |
| 加入班级（邀请码） | ✅ | ✅ |
| 创建/删除课程 | ❌ | ✅ |
| 上传录音 / 图片 | ✅ | ❌（看板只统计） |
| 生成/作答习题 | ✅ | ❌ |
| 生成笔记 | ✅ | ❌ |
| 留言 / 回复 / 删除（自己或老师） | ✅ | ✅ |
| 错题本（标记 / 手动添加） | ✅ | ❌ |
| 班级错题汇总 | ❌ | ✅（仅老师） |
| 老师交流区 | ❌ | ✅（仅班级老师） |
| 学习数据看板 | ❌ | ✅ |
| AI 学习计划（预习/复习/练习） | ✅ | ❌ |
| 学习打卡 + 个人中心热力图 | ✅ | ❌ |
| 查看个人中心 / 班级列表 | ✅ | ✅ |

---

## 7. 设计方向与后续规划

### 7.1 现有方向
1. **本地优先、零外部依赖智能**：所有「AI 类」功能（习题、笔记、计划）当前用本地规则，保证开箱即用、可离线。
2. **角色化界面**：同一课程页面对学生/老师呈现完全不同的内容（学习功能 vs 数据看板）。
3. **数据驱动**：老师端逐步转向数据可视化（看板、错题汇总），为学生画像打基础。

### 7.2 后续可选增强方向（优先级排序）
- **接入大模型 / 语音识别**：将 `questionGenerator / noteGenerator / planGenerator` 平滑替换为 LLM 生成，语音转写接入 Web Speech 或第三方 ASR；保留本地降级。
- **学生画像**：结合 `study_logs`（时长）、`wrong_questions`（错题）、`study_plans` 打卡，生成学生个体学习分析。
- **老师端个人中心**：当前打卡日志仅学生可用，可为老师增加班级总体学情页。
- **实时性**：留言/群聊目前走轮询刷新，可引入 WebSocket 或 SSE 做即时通讯。
- **导出能力**：笔记、错题本、看板数据的导出（Markdown/PDF）。
- **部署化**：SQLite 升级 PostgreSQL、文件存储迁移 OSS/对象存储、前端接入正式路由库与鉴权中间件。

---

## 8. API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/classes` | 我的班级列表 |
| POST | `/api/classes` | 创建班级（老师） |
| POST | `/api/classes/join` | 加入班级 |
| DELETE | `/api/classes/:id` | 删除班级（老师/创建者） |
| GET | `/api/courses/class/:classId` | 班级下课程列表 |
| POST | `/api/courses` | 创建课程 |
| GET | `/api/courses/:id` | 课程详情（聚合资源） |
| GET | `/api/courses/:id/stats` | 学习数据看板 |
| DELETE | `/api/courses/:id` | 删除课程（老师） |
| POST | `/api/uploads/audios/:courseId` | 上传录音 |
| POST | `/api/uploads/images/:courseId` | 上传图片 |
| GET | `/files/*` | 静态文件（音频/图片） |
| POST | `/api/questions/generate/:courseId` | 生成习题 |
| GET | `/api/questions/:courseId` | 习题列表 |
| DELETE | `/api/questions/:courseId` | 清空习题（老师） |
| GET | `/api/messages/:courseId` | 留言树 |
| POST | `/api/messages/:courseId` | 发留言/回复 |
| DELETE | `/api/messages/:courseId/:messageId` | 删除留言 |
| GET/POST/PUT | `/api/notes/:courseId` 等 | 获取/生成/保存笔记 |
| GET | `/api/wrongs/:courseId` | 课程错题 |
| POST | `/api/wrongs/:courseId` | 手动添加错题 |
| POST | `/api/wrongs/:courseId/from-question` | 习题标记错题 |
| GET | `/api/wrongs/class-report/:classId` | 班级错题汇总（老师） |
| GET/POST/DELETE | `/api/teacher-chats/:classId` 等 | 老师交流区 |
| GET/POST | `/api/plans/:courseId`、`/api/plans/generate/:courseId` | 学习计划 |
| PUT | `/api/plans/state/:courseId` | 保存计划勾选状态 |
| GET/POST | `/api/study-logs/month|summary|:courseId` | 学习打卡 |
| GET | `/api/profile/me` | 个人中心（用户+班级） |
| GET | `/api/health` | 健康检查 |

---

## 9. 运行方式

```bash
# 安装依赖（Windows 需用 wrapper 注入 node 到 PATH）
npmw install

# 并行启动后端(3000) + 前端(5173)（仅后端+前端联调，不含 Electron 壳）
npm run dev

# 桌面应用（Electron 启动时自动拉起后端并加载前端）
npm run dev -w frontend    # 先起前端
npm run start -w desktop   # 再起桌面壳
```

> 注意：Electron 二进制需网络下载，若受限可设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 跳过（仅影响桌面壳打包，不影响 Web 联调）。

---

*文档结束。本文件随项目迭代同步更新。*
