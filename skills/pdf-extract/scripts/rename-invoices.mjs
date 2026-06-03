import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// 配置区域 - 根据需要修改
// ============================================
const PDF_DIR = process.env.PDF_DIR || path.join(process.cwd(), 'invoices');
// ============================================

// 使用 pdfjs-dist
let pdfjsLib;
try {
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
} catch (e) {
  console.error('❌ 未安装 pdfjs-dist，请运行: cd ~/.claude/skills/pdf-extract/scripts && npm install pdfjs-dist');
  process.exit(1);
}

/**
 * 从 PDF 中提取文本内容
 */
async function extractText(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(dataBuffer),
    useSystemFonts: true,
    useWorkerFetch: false,
  });

  const pdfDocument = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + ' ';
  }

  return fullText;
}

/**
 * 解析发票信息：金额和项目
 */
function parseInvoiceInfo(text) {
  let amount = '';
  let item = '';
  const allAmounts = [];

  // ============================================
  // 金额提取逻辑
  // ============================================
  const amountRegex = /¥\s*([\d,]+\.?\d*)/g;
  let match;

  while ((match = amountRegex.exec(text)) !== null) {
    const originalStr = match[1];
    const value = parseFloat(originalStr.replace(/,/g, ''));

    // 过滤条件：
    // 1. 金额是有效数字
    // 2. 金额 > 0
    // 3. 金额 < 100万（排除发票号码）
    // 4. 数字字符串长度 < 15
    // 5. 去掉小数点后不超过 12 位
    const isValidAmount = !isNaN(value)
      && value > 0
      && value < 1000000
      && originalStr.length < 15
      && originalStr.replace(/\./g, '').length < 12;

    if (isValidAmount) {
      allAmounts.push(value);
    }
  }

  // 取最大的金额作为价税合计
  if (allAmounts.length > 0) {
    const maxAmount = Math.max(...allAmounts);
    amount = maxAmount.toFixed(2);
  }

  // ============================================
  // 项目名称提取逻辑
  // ============================================
  const itemPatterns = [
    /\*[^*]+\*\s*([^*\s]{2,})/,  // *餐饮服务*餐饮服务
    /\*[^*]+\*([^*\s]+)/,         // 取第二个*后的内容
  ];

  for (const pattern of itemPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let candidate = match[1].replace(/[*\*]/g, '').trim();
      // 项目名称长度：2-30 字符
      if (candidate && candidate.length >= 2 && candidate.length <= 30) {
        item = candidate;
        break;
      }
    }
  }

  return { amount, item, allAmounts };
}

/**
 * 主处理函数
 */
async function main() {
  console.log('📄 PDF 发票信息提取工具\n');
  console.log(`📂 处理目录: ${PDF_DIR}\n`);

  // 检查目录是否存在
  if (!fs.existsSync(PDF_DIR)) {
    console.error(`❌ 目录不存在: ${PDF_DIR}`);
    console.log('\n💡 提示: 设置环境变量 PDF_DIR 指定发票目录');
    console.log('   示例: export PDF_DIR=/path/to/invoices');
    process.exit(1);
  }

  const files = fs.readdirSync(PDF_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf') && !f.startsWith('.'));

  console.log(`📊 找到 ${files.length} 个 PDF 文件\n`);

  if (files.length === 0) {
    console.log('⚠️  目录中没有 PDF 文件');
    return;
  }

  // ============================================
  // 第一步：重命名为临时文件名（避免冲突）
  // ============================================
  console.log('🔄 第一步: 重命名为临时文件名...\n');
  const tempFiles = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const oldPath = path.join(PDF_DIR, file);
    const tempName = `temp_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.pdf`;
    const tempPath = path.join(PDF_DIR, tempName);

    try {
      fs.renameSync(oldPath, tempPath);
      tempFiles.push({ originalName: file, tempName, tempPath });
      console.log(`  ✅ ${file.substring(0, 50)}${file.length > 50 ? '...' : ''} -> ${tempName}`);
    } catch (error) {
      console.log(`  ❌ 重命名失败: ${file} - ${error.message}`);
    }
  }

  // ============================================
  // 第二步：提取文本并解析
  // ============================================
  console.log('\n⏳ 第二步: 提取文本和解析金额...\n');
  const results = [];

  for (let i = 0; i < tempFiles.length; i++) {
    const { originalName, tempName, tempPath } = tempFiles[i];

    process.stdout.write(`\r  处理中 ${i + 1}/${tempFiles.length}: ${originalName.substring(0, 40)}...`);

    try {
      const text = await extractText(tempPath);
      const { amount, item, allAmounts } = parseInvoiceInfo(text);

      results.push({
        tempPath,
        originalName,
        amount,
        item,
        allAmounts,
        timestamp: Date.now() + i,  // 时间戳 + 索引确保唯一性
        success: !!(amount && item)
      });
    } catch (error) {
      results.push({
        tempPath,
        originalName,
        error: error.message,
        success: false
      });
    }
  }

  console.log('\n\n📋 解析结果:\n');
  console.log('='.repeat(80));

  // 显示成功解析的文件
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  successful.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.originalName}`);
    console.log(`   金额: ¥${r.amount} | 项目: ${r.item}`);
    if (r.allAmounts && r.allAmounts.length > 1) {
      console.log(`   所有金额: [${r.allAmounts.map(a => '¥' + a.toFixed(2)).join(', ')}]`);
    }
  });

  // 显示失败的文件
  if (failed.length > 0) {
    console.log(`\n\n⚠️  ${failed.length} 个文件解析失败:`);
    failed.forEach((r, i) => {
      console.log(`${i + 1}. ${r.originalName}`);
      if (r.error) console.log(`   错误: ${r.error}`);
    });
  }

  // ============================================
  // 第三步：重命名为最终格式（带时间戳）
  // ============================================
  console.log('\n\n' + '='.repeat(80));
  console.log('\n🔄 第三步: 重命名为最终格式...\n');

  let successCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (!r.success) {
      // 解析失败的文件，恢复原文件名
      try {
        const newPath = path.join(PDF_DIR, r.originalName);
        fs.renameSync(r.tempPath, newPath);
        console.log(`  ⚠️  恢复原文件名: ${r.originalName} (无法解析)`);
      } catch (error) {
        console.log(`  ❌ 恢复失败: ${r.originalName} - ${error.message}`);
      }
      failCount++;
      continue;
    }

    const newName = `${r.amount}-${r.item}-${r.timestamp}.pdf`;
    const newPath = path.join(PDF_DIR, newName);

    try {
      fs.renameSync(r.tempPath, newPath);
      console.log(`  ✅ ${r.originalName.substring(0, 40)}... -> ${newName}`);
      successCount++;
    } catch (error) {
      console.log(`  ❌ 重命名失败: ${r.originalName} -> ${newName}`);
      console.log(`     错误: ${error.message}`);
      failCount++;
    }
  }

  // ============================================
  // 最终统计
  // ============================================
  console.log('\n' + '='.repeat(80));
  console.log('\n✅ 处理完成!\n');
  console.log(`📊 统计信息:`);
  console.log(`   总文件数: ${results.length}`);
  console.log(`   成功处理: ${successCount} (${(successCount/results.length*100).toFixed(1)}%)`);
  console.log(`   失败: ${failCount} (${(failCount/results.length*100).toFixed(1)}%)`);

  if (successful.length > 0) {
    const totalAmount = successful.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    console.log(`   总金额: ¥${totalAmount.toFixed(2)}`);
  }

  console.log('\n💾 文件命名格式: {金额}-{项目}-{时间戳}.pdf');
  console.log(`📂 处理目录: ${PDF_DIR}\n`);
}

main().catch(console.error);
