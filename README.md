# 学生自习助手

面向学生的个人课后自习辅助系统，帮助你围绕课程内容进行复习、练习和学习管理。

## 核心功能

- **个人学习空间**：独立学习环境，所有课程资料仅你可见
- **课程管理**：创建课程，上传录音和图片，自动生成笔记和习题
- **智能练习**：自动生成选择题、填空题、简答题，在线答题 + 自动批改
- **错题本**：收集错题，获取详细讲解
- **学习计划**：自动生成预习、复习、练习三阶段计划
- **学习打卡**：自动计时，GitHub 风格热力图展示学习日历

## 技术栈

- 前端：Vue 3 + Vite
- 后端：Node.js + Express + SQLite
- 认证：JWT
- 文件存储：本地文件系统

## 快速开始

### 环境要求
- Node.js 18+
- npm 9+

### 安装依赖
```bash
npm install
```

### 配置环境变量
复制 `backend/.env.example` 为 `backend/.env`：
```bash
AUTH_SECRET=your-secret-key-at-least-32-chars
AUTH_TOKEN_TTL_SECONDS=604800
PORT=3000
```

### 启动开发环境
```bash
npm run dev
```
前端：http://localhost:5173  
后端：http://localhost:3000

### 生产构建
```bash
npm run build
```

### 启动生产服务
```bash
./start.sh      # Linux/macOS
start.bat       # Windows
```

## 测试

```bash
npm test --workspace backend
```

覆盖：批改逻辑、错题讲解、个人空间隔离、跨用户权限隔离

## 主要 API

- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/classes` - 获取学习空间
- `POST /api/courses` - 创建课程
- `POST /api/uploads/audios/:courseId` - 上传录音
- `POST /api/questions/generate/:courseId` - 生成习题
- `POST /api/quiz/:courseId/submit` - 提交答案
- `POST /api/wrongs/:courseId` - 添加错题
- `POST /api/plans/generate/:courseId` - 生成学习计划
- `POST /api/study-logs/:courseId` - 上报学习时长

完整 API 文档见代码注释。

## 权限控制

- 课程隔离：用户只能访问自己创建的课程
- 文件隔离：录音/图片仅创建者可访问
- 学习记录隔离：答题/错题/打卡仅本人可见

## 已知限制

1. 音频转写：浏览器 Web Speech API，不支持上传音频离线转写
2. 习题质量：关键词规则生成，不能深度理解课程内容
3. 批改准确性：简答题关键词匹配，不能判断逻辑错误
4. 错题讲解：固定话术
5. 学习计划：模板生成

## 未来计划

1. 真实 ASR：对接 Whisper/云服务
2. LLM 增强：智能笔记、出题、批改、讲解
3. 数据库优化
4. 跨设备同步
5. Electron 封装

## 文档

- [设计文档](./DESIGN.md)
- [数据迁移指南](./MIGRATION.md)

## 版本

- v1.0（2026-10-07）：学生个人自习版
- v0.1（2026-09）：初始版本（班级协作）

## 许可证

MIT
