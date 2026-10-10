# Issues 提交指南

## 📋 仓库状态

**当前状态**: Issues 功能已被禁用

要启用 Issues，仓库管理员需要：
1. 访问 https://github.com/UR-xiaoyang/MetaStudy/settings
2. 勾选 "Features" 下的 "Issues"

---

## 📂 已准备的内容

### 1. 产品路线图
**文件**: `ROADMAP.md`

包含：
- ✅ 当前状态 (v1.0)
- 🎯 短期目标 (v1.1 - v1.3)
- 🚀 中期目标 (v2.0)
- 🔮 长期愿景 (v3.0+)
- 🛠️ 技术债务与优化
- 💡 创新方向探索

### 2. Issue 模板
**目录**: `.github/ISSUE_TEMPLATE/`

已创建 3 个模板：
- `feature_request.md` - 功能请求
- `bug_report.md` - Bug 报告
- `roadmap_task.md` - Roadmap 功能追踪

### 3. 预备 Issues
**目录**: `.github/ISSUES_DRAFT/`

已准备 2 个详细 Issue：
- `01-asr-feature.md` - v1.1 真实音频转写
- `02-llm-enhancement.md` - v1.2 LLM 智能增强

---

## 🚀 启用 Issues 后的操作步骤

### 方法 1：使用 GitHub CLI（推荐）

```bash
cd "F:/project/移动云/try"

# 提交当前更改
git add .
git commit -m "docs: 添加产品路线图和 Issue 模板"

# 推送到远程（确保网络稳定）
git push origin feat/p1-improvements

# 创建 Issue #1: v1.1 音频转写
gh issue create \
  --title "[Roadmap] v1.1 - 真实音频转写功能" \
  --body-file .github/ISSUES_DRAFT/01-asr-feature.md \
  --label "roadmap,enhancement,P0"

# 创建 Issue #2: v1.2 LLM 增强
gh issue create \
  --title "[Roadmap] v1.2 - LLM 智能增强" \
  --body-file .github/ISSUES_DRAFT/02-llm-enhancement.md \
  --label "roadmap,enhancement,P0"
```

### 方法 2：通过 GitHub 网页手动创建

1. **访问仓库**: https://github.com/UR-xiaoyang/MetaStudy/issues

2. **创建 Issue #1**:
   - 点击 "New Issue"
   - 标题: `[Roadmap] v1.1 - 真实音频转写功能`
   - 标签: `roadmap`, `enhancement`, `P0`
   - 内容: 复制 `.github/ISSUES_DRAFT/01-asr-feature.md` 内容
   - 点击 "Submit new issue"

3. **创建 Issue #2**:
   - 标题: `[Roadmap] v1.2 - LLM 智能增强`
   - 标签: `roadmap`, `enhancement`, `P0`
   - 内容: 复制 `.github/ISSUES_DRAFT/02-llm-enhancement.md` 内容
   - 点击 "Submit new issue"

---

## 🏷️ 建议的标签体系

创建以下标签（Settings → Labels）：

### 优先级
- `P0` - 🔴 核心功能缺失，严重影响使用
- `P1` - 🟠 重要功能，明显提升体验
- `P2` - 🟡 锦上添花，可以等待

### 类型
- `bug` - 🐛 错误或问题
- `enhancement` - ✨ 新功能或改进
- `roadmap` - 🗺️ 路线图追踪
- `documentation` - 📚 文档改进
- `question` - ❓ 疑问或讨论

### 状态
- `blocked` - 🚫 被阻塞，等待依赖
- `in-progress` - 🏗️ 进行中
- `ready` - ✅ 准备开始
- `wontfix` - ❌ 不会修复

### 领域
- `frontend` - 前端相关
- `backend` - 后端相关
- `ai/ml` - AI/机器学习相关
- `security` - 安全相关

---

## 📊 Issue 工作流建议

### 阶段 1：需求与设计
1. 创建 Issue（使用 roadmap_task 模板）
2. 标签: `roadmap`, `ready`
3. 在 Issue 中讨论技术方案
4. 确定验收标准

### 阶段 2：开发
1. 更新标签: `in-progress`
2. 创建分支: `feat/issue-<number>-<name>`
3. 定期更新 Issue 进度（勾选任务清单）
4. 遇到阻塞时标记 `blocked`

### 阶段 3：测试与审查
1. 创建 PR，关联 Issue（在 PR 描述中写 `Closes #1`）
2. 请求代码审查
3. 通过测试验证验收标准

### 阶段 4：完成
1. 合并 PR（Issue 自动关闭）
2. 更新 ROADMAP.md（标记完成 ✅）
3. 发布 Release Notes

---

## 🎯 近期 Issues 优先级

推荐创建顺序：

1. **[P0] v1.1 - 真实音频转写** (#1)
   - 核心功能缺失
   - 后续 LLM 依赖
   - 预计 2-3 周

2. **[P0] v1.2 - LLM 智能增强** (#2)
   - 依赖 #1
   - 核心竞争力
   - 预计 3-4 周

3. **[P1] v1.3 - 产品体验优化** (#3)
   - 视频支持、搜索、移动端
   - 预计 2-3 周

4. **[P1] 数据库重构** (#4)
   - 技术债务清理
   - 移除冗余字段
   - 预计 1 周

5. **[P1] 安全加固** (#5)
   - CORS 白名单
   - Rate Limiting
   - 文件签名 URL
   - 预计 1 周

---

## 📝 Issue 编写最佳实践

### ✅ 好的 Issue 示例
```markdown
# [Roadmap] v1.1 - 真实音频转写功能

## 🎯 功能目标
实现上传音频后的离线自动转写。

## 📋 任务清单
- [ ] 技术方案选型
- [ ] 后端 API 开发
- [ ] 前端 UI 实现

## ⏱️ 预计工期
2-3 周

## ✅ 验收标准
- [ ] 转写准确率 > 90%
- [ ] 响应时间 < 3 分钟
```

### ❌ 不好的 Issue 示例
```markdown
# 加个音频转写

就是能转写音频就行了。
```

### 关键要素
1. **清晰的目标** - 要解决什么问题？
2. **可执行的任务** - 分解为具体步骤
3. **明确的标准** - 如何判断完成？
4. **合理的工期** - 预计需要多久？

---

## 🔗 相关资源

- **产品路线图**: [ROADMAP.md](../ROADMAP.md)
- **设计文档**: [DESIGN.md](../DESIGN.md)
- **迁移指南**: [MIGRATION.md](../MIGRATION.md)
- **项目说明**: [README.md](../README.md)

---

## 💬 其他沟通渠道

如果 Issues 暂时无法启用，可以使用：

1. **GitHub Discussions** (如果启用)
   - 访问: https://github.com/UR-xiaoyang/MetaStudy/discussions

2. **Pull Request 评论**
   - 在 PR 中讨论功能设计和实现

3. **项目 Wiki** (如果启用)
   - 维护详细的技术文档

4. **邮件**
   - 联系仓库所有者讨论

---

**最后更新**: 2026-10-07  
**维护者**: @UR-xiaoyang
