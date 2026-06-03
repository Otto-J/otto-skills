#!/usr/bin/env node

/**
 * Generate Podcast
 * 主流程脚本：将文本内容转换为完整的播客音频
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { generateDialogue } from './dialogue-generator.mjs';
import { buildSRT } from './srt-builder.mjs';

const TTS_CLI_PATH = path.join(process.env.HOME, '.claude/skills/tts-generator/scripts/tts-cli.js');

/**
 * 获取可用音色列表
 */
function getAvailableVoices() {
  try {
    const output = execSync(`node "${TTS_CLI_PATH}" list-voices`, { encoding: 'utf-8' });
    const lines = output.split('\n');
    const voices = [];

    let currentName = null;

    for (const line of lines) {
      // 匹配音色名称行: "2. 音色名称"
      const nameMatch = line.match(/^\d+\.\s+(.+)$/);
      if (nameMatch) {
        currentName = nameMatch[1].trim();
        continue;
      }

      // 匹配 ID 行: "   ID: uspeech:xxx"
      const idMatch = line.match(/^\s+ID:\s+(.+)$/);
      if (idMatch && currentName) {
        const voiceId = idMatch[1].trim();
        // 过滤掉片头音色和特殊音色
        if (!currentName.includes('intro') && !currentName.includes('narrator')) {
          voices.push({ name: currentName, id: voiceId });
        }
        currentName = null;
      }
    }

    return voices;
  } catch (error) {
    console.error('获取音色列表失败:', error.message);
    return [];
  }
}

/**
 * 自动选择音色
 */
function selectVoices(voices) {
  if (voices.length < 2) {
    throw new Error('可用音色少于 2 个，请先使用 tts-generator 克隆至少 2 个音色');
  }

  return {
    interviewer: voices[0].id,
    interviewerName: voices[0].name,
    expert: voices[1].id,
    expertName: voices[1].name
  };
}

/**
 * 生成 TTS 音频
 */
function generateTTS(srtPath, voiceId, outputDir) {
  console.log(`正在生成 ${voiceId} 的音频...`);

  // 转换为绝对路径
  const absoluteSrtPath = path.resolve(srtPath);
  const absoluteOutputDir = path.resolve(outputDir);

  try {
    execSync(
      `node "${TTS_CLI_PATH}" generate-from-srt "${absoluteSrtPath}" --voice-id "${voiceId}" --output "${absoluteOutputDir}"`,
      { stdio: 'inherit' }
    );
    console.log(`✓ ${voiceId} 音频生成完成`);
  } catch (error) {
    throw new Error(`生成 ${voiceId} 音频失败: ${error.message}`);
  }
}

/**
 * 合并音频
 */
function mergeAudio(interviewerDir, expertDir, outputPath) {
  console.log('正在合并音频...');

  const mergeScriptPath = path.join(
    process.env.HOME,
    '.claude/skills/tts-generator/scripts/merge-dialogue-audio.mjs'
  );

  try {
    execSync(
      `node "${mergeScriptPath}" --interviewer "${interviewerDir}" --expert "${expertDir}" --output "${outputPath}"`,
      { stdio: 'inherit' }
    );
    console.log(`✓ 播客已生成: ${outputPath}`);
  } catch (error) {
    throw new Error(`合并音频失败: ${error.message}`);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  let content = '';
  let outputPath = 'podcast.mp3';
  let previewOnly = false;
  let interviewerVoice = null;
  let expertVoice = null;
  let skipDialogueGeneration = false;

  // 解析命令行参数
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      content = fs.readFileSync(args[i + 1], 'utf-8');
      i++;
    } else if (args[i] === '--text' && args[i + 1]) {
      content = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--preview') {
      previewOnly = true;
    } else if (args[i] === '--interviewer-voice' && args[i + 1]) {
      interviewerVoice = args[i + 1];
      i++;
    } else if (args[i] === '--expert-voice' && args[i + 1]) {
      expertVoice = args[i + 1];
      i++;
    } else if (args[i] === '--skip-dialogue') {
      skipDialogueGeneration = true;
    }
  }

  // 如果没有从参数获取内容，尝试从标准输入读取
  if (!content) {
    if (!process.stdin.isTTY) {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      content = Buffer.concat(chunks).toString('utf-8');
    }
  }

  if (!content || content.trim() === '') {
    console.error('错误: 请提供内容');
    console.error('用法:');
    console.error('  node generate-podcast.mjs --input content.txt --output podcast.mp3');
    console.error('  node generate-podcast.mjs --text "内容..." --output podcast.mp3');
    console.error('  cat content.txt | node generate-podcast.mjs --output podcast.mp3');
    process.exit(1);
  }

  try {
    console.log('=== 播客生成流程 ===\n');

    // 创建输出目录
    const outputDir = 'output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 步骤 1: 生成或加载对话脚本
    const dialoguePath = path.join(outputDir, 'dialogue.json');
    let dialogues;

    if (skipDialogueGeneration && fs.existsSync(dialoguePath)) {
      console.log('步骤 1/5: 加载已有对话脚本');
      dialogues = JSON.parse(fs.readFileSync(dialoguePath, 'utf-8'));
      console.log(`✓ 已加载 ${dialogues.length} 段对话\n`);
    } else {
      console.log('步骤 1/5: 生成对话脚本');
      dialogues = await generateDialogue(content.trim());
      fs.writeFileSync(dialoguePath, JSON.stringify(dialogues, null, 2), 'utf-8');
      console.log(`✓ 对话脚本已保存: ${dialoguePath}\n`);
    }

    // 如果只是预览，到此结束
    if (previewOnly) {
      console.log('预览模式，已生成对话脚本');
      return;
    }

    // 步骤 2: 构建 SRT 字幕
    console.log('步骤 2/5: 构建 SRT 字幕');
    const splitDir = path.join(outputDir, 'split');
    const { interviewerPath, expertPath } = buildSRT(dialogues, splitDir);
    console.log('');

    // 步骤 3: 选择音色
    console.log('步骤 3/5: 选择音色');
    let selectedVoices;

    const voices = getAvailableVoices();

    if (interviewerVoice && expertVoice) {
      // 用户指定了音色，需要将名称转换为 ID
      const interviewerVoiceObj = voices.find(v => v.name === interviewerVoice || v.id === interviewerVoice);
      const expertVoiceObj = voices.find(v => v.name === expertVoice || v.id === expertVoice);

      if (!interviewerVoiceObj || !expertVoiceObj) {
        throw new Error('指定的音色不存在，请使用 list-voices 查看可用音色');
      }

      selectedVoices = {
        interviewer: interviewerVoiceObj.id,
        interviewerName: interviewerVoiceObj.name,
        expert: expertVoiceObj.id,
        expertName: expertVoiceObj.name
      };
      console.log(`✓ 使用指定音色:`);
    } else {
      selectedVoices = selectVoices(voices);
      console.log(`✓ 自动选择音色:`);
    }
    console.log(`  询问者: ${selectedVoices.interviewerName || selectedVoices.interviewer}`);
    console.log(`  解答者: ${selectedVoices.expertName || selectedVoices.expert}\n`);

    // 步骤 4: 生成 TTS 音频
    console.log('步骤 4/5: 生成 TTS 音频');
    const interviewerAudioDir = path.join(outputDir, 'audio_interviewer');
    const expertAudioDir = path.join(outputDir, 'audio_expert');

    generateTTS(interviewerPath, selectedVoices.interviewer, interviewerAudioDir);
    generateTTS(expertPath, selectedVoices.expert, expertAudioDir);
    console.log('');

    // 步骤 5: 合并音频
    console.log('步骤 5/5: 合并音频');
    mergeAudio(interviewerAudioDir, expertAudioDir, outputPath);

    console.log('\n=== 播客生成完成 ===');
    console.log(`输出文件: ${outputPath}`);
  } catch (error) {
    console.error('\n错误:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
