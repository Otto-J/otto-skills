#!/usr/bin/env node

import 'dotenv/config';
import { createOSSClient } from './upload.mjs';

// 格式化文件大小
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// 列出文件
async function listFiles(options = {}) {
  const client = createOSSClient();

  try {
    const listOptions = {
      prefix: options.prefix || '',
      'max-keys': options.maxKeys || 100
    };

    console.log('━'.repeat(60));
    console.log('📋 OSS 文件列表');
    console.log('━'.repeat(60));
    console.log(`Bucket: ${process.env.OSS_BUCKET}`);
    if (options.prefix) {
      console.log(`前缀: ${options.prefix}`);
    }
    console.log('━'.repeat(60));
    console.log();

    const result = await client.list(listOptions);

    if (result.objects && result.objects.length > 0) {
      console.log(`找到 ${result.objects.length} 个文件:\n`);

      let totalSize = 0;

      result.objects.forEach((obj, index) => {
        console.log(`[${index + 1}] ${obj.name}`);

        if (options.details) {
          console.log(`    大小: ${formatSize(obj.size)}`);
          console.log(`    最后修改: ${obj.lastModified}`);
          console.log(`    ETag: ${obj.etag}`);
        }

        console.log();
        totalSize += obj.size;
      });

      console.log('━'.repeat(60));
      console.log('📊 统计');
      console.log(`   总文件数: ${result.objects.length}`);
      console.log(`   总大小: ${formatSize(totalSize)}`);
      console.log('━'.repeat(60));

      return {
        success: true,
        objects: result.objects,
        count: result.objects.length,
        totalSize
      };

    } else {
      console.log('📭 目录为空\n');
      return {
        success: true,
        objects: [],
        count: 0,
        totalSize: 0
      };
    }

  } catch (error) {
    console.error('❌ 列出文件失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  const options = {
    prefix: '',
    maxKeys: 100,
    details: false
  };

  // 解析参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prefix' && args[i + 1]) {
      options.prefix = args[i + 1];
      i++;
    } else if (args[i] === '--max' && args[i + 1]) {
      options.maxKeys = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--details' || args[i] === '-d') {
      options.details = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('用法: node list.mjs [选项]');
      console.log();
      console.log('选项:');
      console.log('  --prefix <前缀>  只列出指定前缀的文件');
      console.log('  --max <数量>     最多列出多少个文件（默认 100）');
      console.log('  --details, -d    显示详细信息');
      console.log('  --help, -h       显示帮助信息');
      console.log();
      console.log('示例:');
      console.log('  node list.mjs');
      console.log('  node list.mjs --prefix transcriptions/');
      console.log('  node list.mjs --details');
      console.log('  node list.mjs --max 50');
      process.exit(0);
    }
  }

  const result = await listFiles(options);

  if (!result.success) {
    process.exit(1);
  }
}

// 导出函数
export { listFiles };

// 如果直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ 错误:', error);
    process.exit(1);
  });
}
