# 学生自习助手

面向学生的个人课后自习辅助系统，帮助你围绕课程内容进行复习、练习和学习管理。

## 核心功能

- **个人学习空间**：独立学习环境，所有课程资料仅你可见
- **课程管理**：创建课程，上传录音和图片，自动生成笔记和习题
- **离线转写**：上传 mp3/m4a/wav/webm，后台队列转写、进度轮询、失败重试，结果可人工校对
- **AI 增强**：LLM 生成笔记与分层习题、语义批改简答题、个性化错题讲解与学习计划（未配置时自动降级为规则模板）
- **智能练习**：自动生成选择题、填空题、简答题，在线答题 + 自动批改
- **错题本**：收集错题，获取详细讲解
- **学习计划**：自动生成预习、复习、练习三阶段计划
- **学习打卡**：自动计时，GitHub 风格热力图展示学习日历

## 技术栈

- 前端：Vue 3 + Vite
- 后端：Node.js + Express + SQLite
- 认证：JWT
- 文件存储：本地文件系统
- 音频转写：OpenAI 兼容 ASR 接口 或 本地 whisper 命令行（可切换）
- 智能增强：OpenAI 兼容 LLM（智谱 GLM / 通义 / DeepSeek / vLLM / Ollama）

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

# 音频转写（可选，留空则关闭离线转写）
ASR_PROVIDER=openai
ASR_API_URL=https://api.openai.com/v1/audio/transcriptions
ASR_API_KEY=sk-...
ASR_MODEL=whisper-1

# LLM 智能增强（可选，留空则自动使用规则模板）
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_API_KEY=...
LLM_MODEL=glm-4-flash
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

覆盖：ASR 队列（成功/重试/失败/陈旧任务回收）、转写 provider（multipart、认证、超时、本地命令）、LLM 客户端（重试、超时、JSON 提取、成本审计）、AI 降级链、批改与讲解、个人空间隔离、跨用户权限隔离，以及一条启动真实后端进程的端到端测试（上传 → 转写 → AI 笔记/出题/批改/讲解/计划）。

## 主要 API

- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/classes` - 获取学习空间
- `POST /api/courses` - 创建课程
- `POST /api/uploads/audios/:courseId` - 上传录音
- `POST /api/questions/generate/:courseId` - 生成习题
- `POST /api/quiz/:courseId/submit` - 提交答案
- `POST /api/quiz/:courseId/explain/:questionId` - 生成错题讲解
- `POST /api/transcribe/:recordingId/start` - 启动音频转写
- `GET /api/transcribe/:recordingId/status` - 查询转写进度
- `POST /api/transcribe/:recordingId/retry` - 重试转写
- `PUT /api/transcribe/:recordingId/result` - 保存人工校对的转写
- `GET /api/transcribe/capabilities` - 转写服务能力
- `GET /api/ai/status` - LLM 能力与近 7 天成本
- `POST /api/wrongs/:courseId` - 添加错题
- `POST /api/plans/generate/:courseId` - 生成学习计划
- `POST /api/study-logs/:courseId` - 上报学习时长

完整 API 文档见代码注释。

## 权限控制

- 课程隔离：用户只能访问自己创建的课程
- 文件隔离：录音/图片仅创建者可访问
- 学习记录隔离：答题/错题/打卡仅本人可见

## 已知限制

1. 音频转写：需要自行配置 ASR 服务（`ASR_PROVIDER` + 密钥/本地命令）；未配置时界面明确提示，不会伪造转写结果。中文准确率取决于所选服务，本项目未做基准测试
2. 转写进度：云 ASR 接口不暴露逐秒进度，进度条反映「排队 / 上传 / 识别 / 解析」阶段
3. 习题质量：LLM 未配置时退回规则模板（课堂原话挖空），覆盖面有限；LLM 题目质量取决于模型与提示词
4. 批改准确性：单次提交最多对 3 道简答题调用 LLM，其余降级为评分点匹配；评分为启发式，不替代教师判分
5. 成本控制：`llm_calls` 记录 tokens 与估算成本，但暂无用户级配额与限流
6. 学习计划：未配置 LLM 时为模板；AI 计划只读取最近 5 次答题与 10 条错题

## 未来计划

1. 真实 ASR：已支持 OpenAI 兼容接口与本地 whisper 命令行（v1.1）
2. LLM 增强：笔记、出题、批改、讲解、计划均已接入，未配置时自动降级（v1.2）
3. 数据库优化
4. 跨设备同步
5. Electron 封装

## 文档

- [设计文档](./DESIGN.md)
- [数据迁移指南](./MIGRATION.md)

## 版本

- v1.0（2026-10-07）：学生个人自习版
- v1.1 / v1.2（2026-10-26）：离线音频转写 + LLM 智能增强（可配置、可降级）
- v0.1（2026-09）：初始版本（班级协作）

## 许可证

MIT
