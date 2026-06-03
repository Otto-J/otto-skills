# 使用示例

## 基本用法

### 1. 处理默认目录

```bash
cd ~/.claude/skills/pdf-extract/scripts
node rename-invoices.mjs
```

### 2. 处理指定目录

```bash
export PDF_DIR="/path/to/your/invoices"
node rename-invoices.mjs
```

## 完整示例

```bash
# 进入脚本目录
cd ~/.claude/skills/pdf-extract/scripts

# 设置发票目录（可选）
export PDF_DIR="$HOME/Documents/invoices/2025/month-01"

# 运行脚本
node rename-invoices.mjs
```

## 输出示例

```
📄 PDF 发票信息提取工具

📂 处理目录: /Users/example/Documents/invoices/2025/month-01

📊 找到 30 个 PDF 文件

🔄 第一步: 重命名为临时文件名...
  ✅ invoice-sample-001... -> temp_1737361234567_abc123.pdf
  ✅ invoice-sample-002... -> temp_1737361234568_def456.pdf
  ...

⏳ 第二步: 提取文本和解析金额...
  处理中 30/30: invoice-sample-030...

📋 解析结果:
================================================================================

1. invoice-sample-001.pdf
   金额: ¥101.70 | 项目: 餐饮服务
   所有金额: [¥100.69, ¥1.01, ¥101.70]

2. invoice-sample-002.pdf
   金额: ¥131.12 | 项目: 服装鞋帽
   所有金额: [¥116.03, ¥15.09, ¥131.12]

...

🔄 第三步: 重命名为最终格式...

  ✅ invoice-sample-001... -> 101.70-餐饮服务-1737361234567.pdf
  ✅ invoice-sample-002... -> 131.12-服装鞋帽-1737361234568.pdf
  ...

================================================================================

✅ 处理完成!

📊 统计信息:
   总文件数: 30
   成功处理: 28 (93.3%)
   失败: 2 (6.7%)
   总金额: ¥4443.13

💾 文件命名格式: {金额}-{项目}-{时间戳}.pdf
📂 处理目录: /Users/example/Documents/invoices/2025/month-01
```

## 文件名对比

### 处理前
```
invoice-sample-001.pdf
invoice-sample-002.pdf
invoice-sample-003.pdf
```

### 处理后
```
101.70-餐饮服务-1737361234567.pdf
131.12-服装鞋帽-1737361234568.pdf
2360.00-住宿服务-1737361234569.pdf
```

## 常见问题

### Q: 如何恢复原文件名？

A: 脚本没有备份功能，建议处理前先复制备份：

```bash
cp -r /path/to/invoices /path/to/invoices_backup
```

### Q: 为什么有些文件识别失败？

A: 可能原因：
- PDF 是扫描件/图片（需要 OCR）
- PDF 文本内容缺失
- 特殊格式发票

失败的文件会保留原文件名。

### Q: 如何批量处理多个目录？

A: 使用循环：

```bash
for dir in ~/Documents/invoices/2025/*/; do
  export PDF_DIR="$dir"
  node ~/.claude/skills/pdf-extract/scripts/rename-invoices.mjs
done
```

### Q: 金额识别不准确怎么办？

A: 可以调整脚本中的过滤规则，编辑 `rename-invoices.mjs` 第 48-52 行。
