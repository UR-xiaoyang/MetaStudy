# 学生自习助手 - 数据迁移指南

## 数据库遗留问题

当前系统已改造为纯个人学习模式，但数据库仍保留原班级协作的表结构和旧数据：

### 遗留字段
- `classes.invite_code` - 不再使用
- `class_members.role` - 固定为 'student'
- `teacher_chats` 表 - 已删除路由，但表结构仍在

### 旧数据
- 旧账号（包括老师账号）
- 旧班级、旧课程（可能是共享班级的课程）
- 旧学习记录、答题记录

## 选项 1：保留旧数据（推荐用于开发/测试）

**适用场景**：本地开发、测试环境

**操作**：无需操作，系统会自动处理：
- 旧账号登录后按学生身份处理
- 旧课程如果 `created_by` 匹配，仍可访问
- 新注册用户自动创建个人学习空间

**限制**：
- 旧共享课程（非个人创建）可能无法访问
- 数据库包含冗余字段

## 选项 2：清理并重建数据库（推荐用于演示/部署）

**适用场景**：正式演示、生产部署

### 步骤 1：备份旧数据
```bash
cp backend/data/practice.db backend/data/practice.db.backup
```

### 步骤 2：删除旧数据库
```bash
rm backend/data/practice.db
```

### 步骤 3：重启后端，自动创建新数据库
```bash
npm run start --workspace backend
```

新数据库将：
- 仅包含必要的表结构
- 无冗余字段（invite_code/role 仍存在但不使用）
- 无历史数据

### 步骤 4：注册新用户测试
访问前端，注册新用户，验证个人学习空间自动创建。

## 选项 3：迁移旧数据到个人空间（未实现）

**需要开发迁移脚本**：

1. 为每个用户创建个人学习空间
2. 将用户创建的课程迁移到个人空间
3. 保留学习记录、答题记录、错题关联
4. 删除共享班级、删除 teacher_chats 表

**迁移脚本示例**（供参考，未测试）：

```javascript
// backend/scripts/migrate-to-personal.js
import { db } from '../src/db.js';
import { ensurePersonalClass } from '../src/personalCourses.js';

// 1. 为每个用户创建个人学习空间
const users = db.prepare('SELECT id FROM users').all();
for (const user of users) {
  ensurePersonalClass(db, user.id);
}

// 2. 将用户创建的课程迁移到个人空间
const courses = db.prepare('SELECT id, created_by FROM courses').all();
for (const course of courses) {
  const space = db.prepare(
    'SELECT c.id FROM classes c JOIN class_members cm ON cm.class_id = c.id WHERE cm.user_id = ? AND c.is_personal = 1'
  ).get(course.created_by);
  
  if (space) {
    db.prepare('UPDATE courses SET class_id = ? WHERE id = ?').run(space.id, course.id);
  }
}

// 3. 删除非个人班级
db.prepare('DELETE FROM classes WHERE is_personal = 0').run();

// 4. 删除 teacher_chats 表（可选）
db.prepare('DROP TABLE IF EXISTS teacher_chats').run();

console.log('迁移完成');
```

运行：
```bash
node backend/scripts/migrate-to-personal.js
```

## 当前建议

**开发阶段**：选项 1（保留旧数据，继续开发）

**演示/部署前**：选项 2（清理重建，干净环境）

**生产环境**：如有真实用户数据，开发并测试选项 3 迁移脚本

## 注意事项

1. 任何数据库操作前请备份 `backend/data/practice.db`
2. 迁移脚本需在停止后端服务时运行
3. 清理数据库后所有用户账号和学习记录将丢失
4. 测试环境可多次清理重建，生产环境需谨慎
