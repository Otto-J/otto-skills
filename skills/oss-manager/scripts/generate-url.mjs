#!/usr/bin/env node

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createOSSClient } from './upload.mjs';

// 加载项目根目录的 .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../../../../');
dotenv.config({ path: resolve(projectRoot, '.env') });

// 生成 URL
function generateUrls(objectName) {
  const bucket = process.env.OSS_BUCKET;
  const region = process.env.OSS_REGION;

  // 公网 URL
  const publicUrl = `https://${bucket}.${region}.aliyuncs.com/${objectName}`;

  // OSS 内部 URL
  const ossUrl = `oss://${bucket}/${objectName}`;

  return {
    publicUrl,
    ossUrl
  };
}

// 生成签名 URL
async function generateSignedUrl(objectName, expires = 3600) {
  const client = createOSSClient();

  try {
    const signedUrl = client.signatureUrl(objectName, {
      expires,
      method: 'GET'
    });

    return signedUrl;
  } catch (error) {
    console.error('❌ 生成签名 URL 失败:', error.message);
    return null;
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('用法: node generate-url.mjs <对象名> [选项]');
    console.log();
    console.log('参数:');
    console.log('  <对象名>  OSS 对象名');
    console.log();
    console.log('选项:');
    console.log('  --signed           生成带签名的临时 URL');
    console.log('  --expires <秒数>   签名 URL 的有效期（默认 3600 秒）');
    console.log('  --help, -h         显示帮助信息');
    console.log();
    console.log('示例:');
    console.log('  node generate-url.mjs transcriptions/audio.mp3');
    console.log('  node generate-url.mjs transcriptions/audio.mp3 --signed');
    console.log('  node generate-url.mjs transcriptions/audio.mp3 --signed --expires 86400');
    process.exit(0);
  }

  const objectName = args[0];
  const needSigned = args.includes('--signed');
  let expires = 3600;

  // 解析 expires 参数
  const expiresIndex = args.indexOf('--expires');
  if (expiresIndex !== -1 && args[expiresIndex + 1]) {
    expires = parseInt(args[expiresIndex + 1]);
  }

  console.log('━'.repeat(60));
  console.log('🔗 生成 OSS URL');
  console.log('━'.repeat(60));
  console.log(`Bucket: ${process.env.OSS_BUCKET}`);
  console.log(`对象: ${objectName}`);
  console.log('━'.repeat(60));
  console.log();

  const urls = generateUrls(objectName);

  console.log('📋 URL 格式\n');

  console.log('1. 公网 URL (永久有效)');
  console.log(`   ${urls.publicUrl}\n`);

  console.log('2. OSS 内部 URL (用于 API 调用)');
  console.log(`   ${urls.ossUrl}\n`);

  if (needSigned) {
    const signedUrl = await generateSignedUrl(objectName, expires);
    if (signedUrl) {
      const hours = Math.floor(expires / 3600);
      const minutes = Math.floor((expires % 3600) / 60);
      let expiresText = '';
      if (hours > 0) expiresText += `${hours}小时`;
      if (minutes > 0) expiresText += `${minutes}分钟`;
      if (!expiresText) expiresText = `${expires}秒`;

      console.log(`3. 签名 URL (${expiresText}有效)`);
      console.log(`   ${signedUrl}\n`);
    }
  }

  console.log('💡 提示');
  console.log('   - 公网 URL 需要 Bucket 设置为公共读');
  console.log('   - OSS 内部 URL 用于阿里云服务间调用');
  console.log('   - 签名 URL 适用于私有文件的临时访问');
  console.log();
}

// 导出函数
export { generateUrls, generateSignedUrl };

// 如果直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ 错误:', error);
    process.exit(1);
  });
}
