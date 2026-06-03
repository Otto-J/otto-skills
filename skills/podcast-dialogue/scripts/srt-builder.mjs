#!/usr/bin/env node

/**
 * SRT Builder
 * 将对话 JSON 转换为 SRT 字幕格式
 */

import fs from 'fs';
import path from 'path';

/**
 * 格式化时间为 SRT 格式 (HH:MM:SS,mmm)
 */
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * 构建 SRT 字幕条目
 */
function buildSRTEntries(dialogues) {
  let currentTime = 0;
  const entries = [];

  dialogues.forEach((dialogue, index) => {
    const startTime = currentTime;
    const endTime = currentTime + dialogue.duration;

    entries.push({
      index: index + 1,
      startTime: formatTime(startTime),
      endTime: formatTime(endTime),
      text: dialogue.text,
      speaker: dialogue.speaker
    });

    // 添加 0.5 秒间隔
    currentTime = endTime + 0.5;
  });

  return entries;
}

/**
 * 将 SRT 条目转换为 SRT 格式文本
 */
function entriesToSRT(entries) {
  return entries.map(entry => {
    return `${entry.index}\n${entry.startTime} --> ${entry.endTime}\n${entry.text}\n`;
  }).join('\n');
}

/**
 * 按说话人分割 SRT 文件
 */
function splitBySpeaker(entries) {
  const interviewerEntries = entries.filter(e => e.speaker === 'interviewer');
  const expertEntries = entries.filter(e => e.speaker === 'expert');

  return {
    interviewer: entriesToSRT(interviewerEntries),
    expert: entriesToSRT(expertEntries)
  };
}

/**
 * 构建 SRT 字幕文件
 */
function buildSRT(dialogues, outputDir) {
  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 构建 SRT 条目
  const entries = buildSRTEntries(dialogues);

  // 按说话人分割
  const { interviewer, expert } = splitBySpeaker(entries);

  // 保存文件
  const interviewerPath = path.join(outputDir, 'interviewer.srt');
  const expertPath = path.join(outputDir, 'expert.srt');

  fs.writeFileSync(interviewerPath, interviewer, 'utf-8');
  fs.writeFileSync(expertPath, expert, 'utf-8');

  console.log(`✓ SRT 字幕已生成:`);
  console.log(`  询问者: ${interviewerPath}`);
  console.log(`  解答者: ${expertPath}`);

  return { interviewerPath, expertPath };
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  let dialoguePath = '';
  let outputDir = 'split';

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      dialoguePath = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[i + 1];
      i++;
    }
  }

  if (!dialoguePath) {
    console.error('错误: 请提供对话 JSON 文件路径');
    console.error('用法: node srt-builder.mjs --input dialogue.json --output split/');
    process.exit(1);
  }

  try {
    // 读取对话 JSON
    const dialogues = JSON.parse(fs.readFileSync(dialoguePath, 'utf-8'));

    // 构建 SRT
    buildSRT(dialogues, outputDir);
  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { buildSRT, buildSRTEntries, formatTime };
