#!/usr/bin/env node

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import OSS from 'ali-oss';

// 加载项目根目录的 .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../../../');
dotenv.config({ path: resolve(projectRoot, '.env') });
import { readFileSync, statSync } from 'fs';
import { basename } from 'path';

// 初始化 OSS 客户端
function createOSSClient() {
  const requiredEnvVars = ['OSS_REGION', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_BUCKET'];
  const missing = requiredEnvVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.error('❌ 缺少必需的环境变量:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\n请在 .env 文件中配置 OSS 凭证');
    process.exit(1);
  }

  return new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    authorizationV4: true,
    timeout: 600000,  // 10分钟超时
  });
}

// 格式化文件大小
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// 上传文件
async function uploadFile(localPath, ossObjectName, options = {}) {
  const client = createOSSClient();

  try {
    // 获取文件信息
    const stats = statSync(localPath);
    const fileSize = stats.size;

    console.log('━'.repeat(60));
    console.log('📤 上传文件到 OSS');
    console.log('━'.repeat(60));
    console.log(`Bucket: ${process.env.OSS_BUCKET}`);
    console.log(`Region: ${process.env.OSS_REGION}`);
    console.log(`本地文件: ${localPath}`);
    console.log(`OSS 对象: ${ossObjectName}`);
    console.log(`文件大小: ${formatSize(fileSize)}`);
    console.log('━'.repeat(60));
    console.log();

    // 上传选项
    const uploadOptions = {
      headers: {
        'x-oss-storage-class': options.storageClass || 'Standard'
      }
    };

    console.log('正在上传...');

    const result = await client.put(ossObjectName, localPath, uploadOptions);

    console.log('\n✅ 上传成功!\n');
    console.log('📊 文件信息');
    console.log(`   大小: ${formatSize(fileSize)}`);
    console.log(`   ETag: ${result.res.headers.etag}`);
    console.log();
    console.log('🔗 访问 URL');
    console.log(`   公网: ${result.url}`);
    console.log(`   OSS: oss://${process.env.OSS_BUCKET}/${ossObjectName}`);
    console.log();

    return {
      success: true,
      url: result.url,
      ossUrl: `oss://${process.env.OSS_BUCKET}/${ossObjectName}`,
      objectName: ossObjectName,
      size: fileSize,
      etag: result.res.headers.etag
    };

  } catch (error) {
    console.error('\n❌ 上传失败:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('用法: node upload.mjs <本地文件路径> [OSS对象名] [选项]');
    console.log();
    console.log('参数:');
    console.log('  <本地文件路径>  必填，本地文件的完整路径');
    console.log('  [OSS对象名]     可选，OSS 中的对象名称（默认使用文件名）');
    console.log();
    console.log('选项:');
    console.log('  --prefix <前缀>        添加路径前缀（如 transcriptions/）');
    console.log('  --storage-class <类型> 存储类型（Standard/IA/Archive，默认 Standard）');
    console.log();
    console.log('示例:');
    console.log('  node upload.mjs /path/to/audio.mp3');
    console.log('  node upload.mjs /path/to/audio.mp3 my-audio.mp3');
    console.log('  node upload.mjs /path/to/audio.mp3 --prefix transcriptions/');
    console.log('  node upload.mjs /path/to/audio.mp3 --storage-class IA');
    process.exit(1);
  }

  const localPath = args[0];
  let ossObjectName = args[1] || basename(localPath);

  // 解析选项
  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--prefix' && args[i + 1]) {
      const prefix = args[i + 1];
      ossObjectName = prefix + basename(localPath);
      i++;
    } else if (args[i] === '--storage-class' && args[i + 1]) {
      options.storageClass = args[i + 1];
      i++;
    }
  }

  // 检查文件是否存在
  try {
    statSync(localPath);
  } catch (error) {
    console.error(`❌ 文件不存在: ${localPath}`);
    process.exit(1);
  }

  // 上传文件
  const result = await uploadFile(localPath, ossObjectName, options);

  if (!result.success) {
    process.exit(1);
  }
}

// 导出函数供其他脚本使用
export { uploadFile, createOSSClient };

// 如果直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ 错误:', error);
    process.exit(1);
  });
}
