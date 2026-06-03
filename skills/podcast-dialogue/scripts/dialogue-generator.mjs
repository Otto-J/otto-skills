#!/usr/bin/env node

/**
 * Dialogue Generator
 * 将文本内容转换为双人播客对话脚本
 */

import fs from 'fs';

// 中文语速: 约 4-5 字/秒
const CHARS_PER_SECOND = 4.5;

/**
 * 计算文本朗读时长（秒）
 */
function calculateDuration(text) {
  const charCount = text.length;
  return Math.ceil(charCount / CHARS_PER_SECOND);
}

/**
 * 系统提示词
 */
const SYSTEM_PROMPT = `你是一个专业的技术播客脚本编写专家，擅长将技术文档改编为口语化的面试式对话。

对话场景：面试官在面试一位技术专家，询问他做过的项目和设计思路。

角色设定：
- 询问者(interviewer): 像面试官，问"你是怎么做的"、"为什么这样设计"、"遇到什么问题"
- 解答者(expert): 像候选人，用口语化的中文解释自己的思考过程和实际落地方案

对话要求：
1. 口语化表达，少用英文术语，多用中文描述（例如：用"核心文件"代替"reference"，用"生成类型"代替"Generated"）
2. 每段对话30-60字，节奏轻快自然
3. 询问者要像真实面试官：追问细节、质疑设计、要求举例
4. 解答者要讲思考过程：为什么这样做、遇到什么坑、怎么解决的
5. 用具体例子说明（如：某个文件怎么组织、某个命令怎么执行）
6. 避免抽象概念堆砌，避免文档式表达
7. 对话要有互动感，不要像念稿子

输出格式：
必须返回纯 JSON 数组，不要有任何其他文字：
[
  { "speaker": "interviewer", "text": "..." },
  { "speaker": "expert", "text": "..." }
]`;

/**
 * 对话生成提示词模板
 */
function buildDialoguePrompt(content) {
  return `请将以下技术文档改编为面试式对话脚本：

${content}

场景设定：
面试官在面试一位技术专家，询问他做过的这个项目。面试官会追问细节、质疑设计、要求举例。

对话要求：
1. 开场：面试官问"你做过什么项目"或"这个项目是干什么的"
2. 主体：按原文逻辑展开，但要像真实面试对话
   - 面试官：追问"为什么这样设计"、"遇到什么问题"、"怎么解决的"
   - 候选人：讲思考过程、实际做法、具体例子（如某个文件怎么组织、某个命令怎么执行）
3. 口语化表达：
   - 少用英文术语（Generated → 自动生成类型，reference → 参考文档，instructions → 使用说明）
   - 多用"我们"、"当时"、"后来"、"比如说"等口语词汇
   - 用"这个东西"、"那个地方"等指代，不要太书面
4. 每段30-60字，节奏轻快
5. 要有互动感：面试官会打断、追问、质疑

直接返回 JSON 数组，格式如下：
[
  { "speaker": "interviewer", "text": "你能介绍一下这个项目吗，主要解决什么问题？" },
  { "speaker": "expert", "text": "这个项目是给 AI 编程助手做知识库的。我们发现 AI 看完整文档太浪费了，就想办法把文档拆成小块..." }
]`;
}

/**
 * 调用 Dashscope API 生成对话
 */
async function callDashscopeAPI(messages) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('请设置 DASHSCOPE_API_KEY 环境变量');
  }

  const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: messages,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * 生成对话（多轮迭代优化）
 */
async function generateDialogue(content) {
  console.log('正在生成对话脚本...');
  console.log(`内容长度: ${content.length} 字`);

  const prompt = buildDialoguePrompt(content);

  // 第一轮：生成初始对话
  console.log('第 1 轮：生成初始对话...');
  let responseText = await callDashscopeAPI([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ]);

  // 第二轮：优化口语化和互动感
  console.log('第 2 轮：优化口语化和互动感...');
  responseText = await callDashscopeAPI([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
    { role: 'assistant', content: responseText },
    { role: 'user', content: '请优化这个对话脚本，让它更像真实面试对话：\n1. 减少英文术语，用中文口语表达（如：Generated → 自动生成的，reference → 参考文档）\n2. 增加口语词汇："我们当时"、"后来发现"、"比如说"、"这个东西"\n3. 面试官要追问细节："具体怎么做的"、"为什么不用XX方案"、"遇到什么坑"\n4. 候选人要讲思考过程和具体例子（如：某个文件怎么组织、某个命令怎么执行）\n5. 每段30-60字，节奏轻快\n6. 保持 JSON 格式，直接返回优化后的数组' }
  ]);

  // 第三轮：检查面试感和科普性
  console.log('第 3 轮：检查面试感和科普性...');
  responseText = await callDashscopeAPI([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: '请检查以下对话脚本，确保它像真实面试对话：\n1. 每段30-60字，听起来不累\n2. 英文术语要少，能用中文就用中文\n3. 面试官要像真人：会打断、会质疑、会追问"为什么不这样做"\n4. 候选人要讲故事：用"我们当时"、"后来发现"、"比如说"这样的口语\n5. 要有科普作用：普通人能听懂，不是念技术文档\n6. 对话要有节奏感：一问一答，不要长篇大论\n7. JSON 格式正确，直接返回修正后的数组\n\n' + responseText }
  ]);

  console.log('✓ 对话生成完成\n');

  // 提取 JSON 数组
  let dialogues;
  try {
    // 尝试直接解析
    dialogues = JSON.parse(responseText);
  } catch (e) {
    // 如果失败，尝试提取 JSON 部分
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      dialogues = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('无法解析对话脚本 JSON');
    }
  }

  // 为每段对话添加时长估算
  dialogues = dialogues.map(d => ({
    ...d,
    duration: calculateDuration(d.text)
  }));

  console.log(`✓ 生成了 ${dialogues.length} 段对话`);

  return dialogues;
}

/**
 * 保存对话脚本到文件
 */
function saveDialogue(dialogues, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(dialogues, null, 2), 'utf-8');
  console.log(`✓ 对话脚本已保存到: ${outputPath}`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  let content = '';
  let outputPath = 'dialogue.json';

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
    console.error('  node dialogue-generator.mjs --input content.txt --output dialogue.json');
    console.error('  node dialogue-generator.mjs --text "内容..." --output dialogue.json');
    console.error('  cat content.txt | node dialogue-generator.mjs --output dialogue.json');
    process.exit(1);
  }

  try {
    const dialogues = await generateDialogue(content.trim());
    saveDialogue(dialogues, outputPath);

    // 输出统计信息
    const totalDuration = dialogues.reduce((sum, d) => sum + d.duration, 0);
    const interviewerCount = dialogues.filter(d => d.speaker === 'interviewer').length;
    const expertCount = dialogues.filter(d => d.speaker === 'expert').length;

    console.log('\n统计信息:');
    console.log(`  总对话数: ${dialogues.length}`);
    console.log(`  询问者: ${interviewerCount} 段`);
    console.log(`  解答者: ${expertCount} 段`);
    console.log(`  预计时长: ${Math.ceil(totalDuration)} 秒 (约 ${Math.ceil(totalDuration / 60)} 分钟)`);
  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateDialogue, calculateDuration };
