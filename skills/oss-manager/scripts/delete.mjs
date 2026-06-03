#!/usr/bin/env node

import 'dotenv/config';
import { createOSSClient } from './upload.mjs';
import { listFiles } from './list.mjs';
import readline from 'readline';

// 从 URL 中提取 OSS 对象名称
function extractObjectNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    return pathname.startsWith('/') ? pathname.slice(1) : pathname;
  } catch (error) {
    console.error('❌ 无效的 URL:', url);
    return null;
  }
}

// 删除单个文件
async function deleteObject(objectName) {
  const client = createOSSClient();

  try {
    console.log(`\n🗑️  正在删除: ${objectName}`);
    await client.delete(objectName);
    console.log(`   ✅ 删除成功`);
    return true;
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      console.log(`   ⚠️  文件不存在`);
      return true;
    }
    console.error(`   ❌ 删除失败: ${error.message}`);
    return false;
  }
}

// 批量删除
async function deleteMultiple(objectNames, skipConfirm = false) {
  if (objectNames.length === 0) {
    console.log('✨ 没有需要删除的文件');
    return { success: true, deleted: 0, failed: 0 };
  }

  // 确认删除
  if (!skipConfirm) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question(`\n⚠️  确定要删除 ${objectNames.length} 个文件吗？(yes/no): `, resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('❌ 已取消');
      return { success: false, deleted: 0, failed: 0 };
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('🗑️  开始批量删除');
  console.log('='.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const objectName of objectNames) {
    const success = await deleteObject(objectName);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 删除统计');
  console.log('='.repeat(60));
  console.log(`成功: ${successCount} 个`);
  console.log(`失败: ${failCount} 个`);
  console.log('='.repeat(60));

  return {
    success: true,
    deleted: successCount,
    failed: failCount
  };
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('用法: node delete.mjs <对象名或URL> [选项]');
    console.log();
    console.log('参数:');
    console.log('  <对象名或URL>  OSS 对象名或完整 URL');
    console.log();
    console.log('选项:');
    console.log('  --all          删除所有文件（需要确认）');
    console.log('  --prefix <前缀> 删除指定前缀的所有文件');
    console.log('  --yes          跳过确认提示');
    console.log('  --help, -h     显示帮助信息');
    console.log();
    console.log('示例:');
    console.log('  node delete.mjs transcriptions/audio.mp3');
    console.log('  node delete.mjs https://bucket.oss-cn-beijing.aliyuncs.com/audio.mp3');
    console.log('  node delete.mjs --prefix transcriptions/');
    console.log('  node delete.mjs --all');
    console.log('  node delete.mjs --prefix transcriptions/ --yes');
    process.exit(0);
  }

  const skipConfirm = args.includes('--yes') || args.includes('-y');

  // 删除所有文件
  if (args.includes('--all')) {
    const result = await listFiles();
    if (!result.success) {
      process.exit(1);
    }

    const objectNames = result.objects.map(obj => obj.name);
    await deleteMultiple(objectNames, skipConfirm);
    return;
  }

  // 删除指定前缀的文件
  const prefixIndex = args.indexOf('--prefix');
  if (prefixIndex !== -1 && args[prefixIndex + 1]) {
    const prefix = args[prefixIndex + 1];
    const result = await listFiles({ prefix });

    if (!result.success) {
      process.exit(1);
    }

    const objectNames = result.objects.map(obj => obj.name);
    await deleteMultiple(objectNames, skipConfirm);
    return;
  }

  // 删除单个文件
  const input = args[0];
  let objectName;

  // 判断是 URL 还是对象名称
  if (input.startsWith('http://') || input.startsWith('https://')) {
    objectName = extractObjectNameFromUrl(input);
  } else {
    objectName = input;
  }

  if (!objectName) {
    console.error('❌ 无效的输入');
    process.exit(1);
  }

  console.log('━'.repeat(60));
  console.log('🗑️  删除 OSS 文件');
  console.log('━'.repeat(60));
  console.log(`Bucket: ${process.env.OSS_BUCKET}`);
  console.log(`对象: ${objectName}`);
  console.log('━'.repeat(60));

  await deleteObject(objectName);
  console.log('\n✨ 完成!');
}

// 导出函数
export { deleteObject, deleteMultiple };

// 如果直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ 错误:', error);
    process.exit(1);
  });
}
