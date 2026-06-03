---
name: oss-manager
description: 阿里云 OSS 对象存储管理工具。支持上传、删除、列出文件，生成访问 URL。为播客音频文件提供云存储支持，便于语音识别 API 调用和 CDN 分发。
---

# 阿里云 OSS 管理器

管理阿里云 OSS 对象存储中的文件，支持上传、删除、列出、生成 URL 等操作。

## 核心功能

- 📤 **上传文件** - 上传本地文件到 OSS
- 🗑️ **删除文件** - 删除单个或批量删除文件
- 📋 **列出文件** - 列出指定目录的所有文件
- 🔗 **生成 URL** - 生成公网访问 URL 和 OSS 内部 URL
- 📊 **文件信息** - 查看文件大小、修改时间等信息
- 🧹 **批量清理** - 批量删除指定目录的文件

## 快速开始

### 环境配置

在项目根目录的 `.env` 文件中配置 OSS 凭证：

```bash
OSS_REGION=oss-cn-beijing
OSS_ACCESS_KEY_ID=your-access-key-id
OSS_ACCESS_KEY_SECRET=your-access-key-secret
OSS_BUCKET=your-bucket-name
```

### 安装依赖

```bash
npm install ali-oss dotenv
# 或
bun add ali-oss dotenv
```

### 基础用法

```bash
# 上传文件
node .claude/skills/oss-manager/scripts/upload.mjs /path/to/file.mp3

# 列出所有文件
node .claude/skills/oss-manager/scripts/list.mjs

# 删除文件
node .claude/skills/oss-manager/scripts/delete.mjs file.mp3

# 生成 URL
node .claude/skills/oss-manager/scripts/generate-url.mjs file.mp3
```

## 命令详解

### 1. upload.mjs - 上传文件

上传本地文件到 OSS。

```bash
node .claude/skills/oss-manager/scripts/upload.mjs <本地文件路径> [OSS对象名]
```

**参数**:
- `<本地文件路径>`: 必填，本地文件的完整路径
- `[OSS对象名]`: 可选，OSS 中的对象名称（默认使用文件名）

**选项**:
- `--prefix <前缀>`: 添加路径前缀（如 `transcriptions/`）
- `--storage-class <类型>`: 存储类型（Standard/IA/Archive，默认 Standard）

**示例**:

```bash
# 上传文件（使用原文件名）
node .claude/skills/oss-manager/scripts/upload.mjs /path/to/audio.mp3

# 上传并指定 OSS 对象名
node .claude/skills/oss-manager/scripts/upload.mjs /path/to/audio.mp3 my-audio.mp3

# 上传到指定目录
node .claude/skills/oss-manager/scripts/upload.mjs /path/to/audio.mp3 --prefix transcriptions/

# 使用低频存储
node .claude/skills/oss-manager/scripts/upload.mjs /path/to/audio.mp3 --storage-class IA
```

**输出示例**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 上传文件到 OSS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bucket: whispergongji
Region: oss-cn-beijing
本地文件: /path/to/audio.mp3
OSS 对象: transcriptions/audio.mp3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

正在上传... ████████████████████ 100%

✅ 上传成功!

📊 文件信息
   大小: 15.23 MB
   ETag: "d41d8cd98f00b204e9800998ecf8427e"

🔗 访问 URL
   公网: https://whispergongji.oss-cn-beijing.aliyuncs.com/transcriptions/audio.mp3
   OSS: oss://whispergongji/transcriptions/audio.mp3
```

---

### 2. list.mjs - 列出文件

列出 OSS 中的文件。

```bash
node .claude/skills/oss-manager/scripts/list.mjs [选项]
```

**选项**:
- `--prefix <前缀>`: 只列出指定前缀的文件（如 `transcriptions/`）
- `--max <数量>`: 最多列出多少个文件（默认 100）
- `--details`: 显示详细信息（大小、修改时间等）

**示例**:

```bash
# 列出所有文件
node .claude/skills/oss-manager/scripts/list.mjs

# 列出指定目录的文件
node .claude/skills/oss-manager/scripts/list.mjs --prefix transcriptions/

# 显示详细信息
node .claude/skills/oss-manager/scripts/list.mjs --details

# 限制数量
node .claude/skills/oss-manager/scripts/list.mjs --max 50
```

**输出示例**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 OSS 文件列表
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bucket: whispergongji
前缀: transcriptions/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

找到 3 个文件:

[1] transcriptions/audio1.mp3
    大小: 15.23 MB
    最后修改: 2026-02-08 10:30:00

[2] transcriptions/audio2.mp3
    大小: 22.45 MB
    最后修改: 2026-02-08 11:15:00

[3] transcriptions/audio3.mp3
    大小: 18.67 MB
    最后修改: 2026-02-08 12:00:00

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 统计
   总文件数: 3
   总大小: 56.35 MB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 3. delete.mjs - 删除文件

删除 OSS 中的文件。

```bash
node .claude/skills/oss-manager/scripts/delete.mjs <对象名或URL>
```

**参数**:
- `<对象名或URL>`: 必填，OSS 对象名或完整 URL

**选项**:
- `--all`: 删除所有文件（需要确认）
- `--prefix <前缀>`: 删除指定前缀的所有文件
- `--yes`: 跳过确认提示

**示例**:

```bash
# 删除单个文件（使用对象名）
node .claude/skills/oss-manager/scripts/delete.mjs transcriptions/audio.mp3

# 删除单个文件（使用 URL）
node .claude/skills/oss-manager/scripts/delete.mjs https://whispergongji.oss-cn-beijing.aliyuncs.com/audio.mp3

# 删除指定目录的所有文件
node .claude/skills/oss-manager/scripts/delete.mjs --prefix transcriptions/

# 删除所有文件（需要确认）
node .claude/skills/oss-manager/scripts/delete.mjs --all

# 跳过确认
node .claude/skills/oss-manager/scripts/delete.mjs --prefix transcriptions/ --yes
```

**输出示例**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗑️  删除 OSS 文件
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bucket: whispergongji
对象: transcriptions/audio.mp3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🗑️  正在删除: transcriptions/audio.mp3
   ✅ 删除成功

✨ 完成!
```

---

### 4. generate-url.mjs - 生成 URL

生成文件的访问 URL。

```bash
node .claude/skills/oss-manager/scripts/generate-url.mjs <对象名>
```

**参数**:
- `<对象名>`: 必填，OSS 对象名

**选项**:
- `--signed`: 生成带签名的临时 URL
- `--expires <秒数>`: 签名 URL 的有效期（默认 3600 秒）

**示例**:

```bash
# 生成公网 URL
node .claude/skills/oss-manager/scripts/generate-url.mjs transcriptions/audio.mp3

# 生成带签名的临时 URL（1小时有效）
node .claude/skills/oss-manager/scripts/generate-url.mjs transcriptions/audio.mp3 --signed

# 生成 24 小时有效的签名 URL
node .claude/skills/oss-manager/scripts/generate-url.mjs transcriptions/audio.mp3 --signed --expires 86400
```

**输出示例**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 生成 OSS URL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bucket: whispergongji
对象: transcriptions/audio.mp3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 URL 格式

1. 公网 URL (永久有效)
   https://whispergongji.oss-cn-beijing.aliyuncs.com/transcriptions/audio.mp3

2. OSS 内部 URL (用于 API 调用)
   oss://whispergongji/transcriptions/audio.mp3

3. 签名 URL (1小时有效)
   https://whispergongji.oss-cn-beijing.aliyuncs.com/transcriptions/audio.mp3?Expires=1707384000&OSSAccessKeyId=xxx&Signature=xxx

💡 提示
   - 公网 URL 需要 Bucket 设置为公共读
   - OSS 内部 URL 用于阿里云服务间调用
   - 签名 URL 适用于私有文件的临时访问
```

---

## 与其他 Skill 集成

### 集成到播客工作流

```bash
# 1. 检查本周更新
node .claude/skills/weekly-podcast-checker/scripts/check-updates.mjs

# 2. 下载音频（假设已下载到 weekly-podcast/Syntax/episode-900.mp3）

# 3. 上传到 OSS
node .claude/skills/oss-manager/scripts/upload.mjs \
  weekly-podcast/Syntax/episode-900.mp3 \
  --prefix transcriptions/

# 4. 生成 OSS URL 用于语音识别
node .claude/skills/oss-manager/scripts/generate-url.mjs \
  transcriptions/episode-900.mp3

# 5. 调用语音识别 API（使用 OSS URL）

# 6. 处理完成后删除 OSS 文件
node .claude/skills/oss-manager/scripts/delete.mjs \
  transcriptions/episode-900.mp3
```

### 在脚本中使用

```javascript
import { uploadToOSS, deleteFromOSS, generateOSSUrl } from '.claude/skills/oss-manager/scripts/oss-client.mjs';

// 上传文件
const result = await uploadToOSS('/path/to/audio.mp3', {
  prefix: 'transcriptions/',
  storageClass: 'Standard'
});
console.log('OSS URL:', result.url);

// 生成 URL
const urls = generateOSSUrl('transcriptions/audio.mp3');
console.log('公网 URL:', urls.publicUrl);
console.log('OSS URL:', urls.ossUrl);

// 删除文件
await deleteFromOSS('transcriptions/audio.mp3');
```

---

## 最佳实践

### 1. 文件命名规范

```
transcriptions/
├── {podcast-name}/
│   ├── {episode-id}.mp3
│   └── {episode-id}-result.json
└── temp/
    └── {timestamp}-{filename}
```

**推荐命名**:
- 使用小写字母和连字符
- 包含时间戳或 episode ID
- 按播客名称分目录

### 2. 存储类型选择

| 存储类型 | 适用场景 | 成本 |
|---------|---------|------|
| Standard | 频繁访问的文件 | 高 |
| IA (低频访问) | 不常访问的归档文件 | 中 |
| Archive (归档) | 长期归档 | 低 |

**建议**:
- 临时转录文件：Standard（处理完立即删除）
- 已处理的音频：IA（偶尔访问）
- 历史归档：Archive（长期保存）

### 3. 生命周期管理

在 OSS 控制台设置生命周期规则：

```
transcriptions/temp/ → 7天后自动删除
transcriptions/archive/ → 30天后转为归档存储
```

### 4. 安全建议

✅ **推荐做法**:
- 使用 RAM 子账号，限制权限范围
- 定期轮换 AccessKey
- 不要将 AccessKey 提交到代码仓库
- 使用 `.env` 文件管理凭证

❌ **避免**:
- 在代码中硬编码 AccessKey
- 使用主账号的 AccessKey
- 将 Bucket 设置为完全公开

---

## 环境要求

### 必需

- Node.js v18+
- 阿里云 OSS 账号
- AccessKey ID 和 AccessKey Secret

### 依赖

```json
{
  "dependencies": {
    "ali-oss": "^6.18.0",
    "dotenv": "^16.0.0"
  }
}
```

---

## 常见问题

### Q: 如何获取 OSS AccessKey？

1. 登录阿里云控制台
2. 进入 AccessKey 管理页面
3. 创建 AccessKey（建议使用 RAM 子账号）
4. 保存 AccessKey ID 和 AccessKey Secret

### Q: 上传失败怎么办？

**检查项**:
1. AccessKey 是否正确
2. Bucket 名称是否正确
3. Region 是否匹配
4. 网络连接是否正常
5. 文件是否存在且可读

### Q: 如何设置 Bucket 为公共读？

在 OSS 控制台：
1. 选择 Bucket
2. 权限管理 → Bucket 授权策略
3. 设置为"公共读"

**注意**: 公共读意味着任何人都可以访问文件，请谨慎设置。

### Q: 删除文件后能恢复吗？

不能。OSS 删除是永久性的，建议：
- 删除前做好备份
- 使用版本控制功能
- 设置回收站（OSS 控制台配置）

### Q: 如何批量上传文件？

```bash
# 使用 shell 循环
for file in weekly-podcast/Syntax/*.mp3; do
  node .claude/skills/oss-manager/scripts/upload.mjs "$file" --prefix transcriptions/
done
```

---

## 故障排除

### 错误: AccessDenied

**原因**: AccessKey 权限不足

**解决**:
1. 检查 RAM 用户权限
2. 确保有 OSS 读写权限
3. 检查 Bucket 策略

### 错误: NoSuchBucket

**原因**: Bucket 不存在或名称错误

**解决**:
1. 检查 `.env` 中的 `OSS_BUCKET` 配置
2. 确认 Bucket 已创建
3. 检查 Region 是否匹配

### 错误: RequestTimeout

**原因**: 网络超时

**解决**:
1. 检查网络连接
2. 增加超时时间
3. 尝试使用内网 Endpoint（如果在阿里云 ECS 上）

### 上传速度慢

**优化方案**:
1. 使用分片上传（大文件）
2. 使用内网 Endpoint
3. 选择就近的 Region

---

## 技术细节

### OSS 客户端配置

```javascript
import OSS from 'ali-oss';

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  authorizationV4: true,  // 使用 V4 签名
  timeout: 60000          // 60秒超时
});
```

### URL 格式说明

**公网 URL**:
```
https://{bucket}.{region}.aliyuncs.com/{object-key}
```

**OSS 内部 URL**:
```
oss://{bucket}/{object-key}
```

**签名 URL**:
```
https://{bucket}.{region}.aliyuncs.com/{object-key}?Expires={timestamp}&OSSAccessKeyId={id}&Signature={sig}
```

---

## 相关资源

- 阿里云 OSS 文档: https://help.aliyun.com/product/31815.html
- ali-oss SDK: https://github.com/ali-sdk/ali-oss
- 配合使用: `weekly-podcast-checker` - 播客更新检查
- 配合使用: `parse-tingwu` - 语音识别（需要 OSS URL）
