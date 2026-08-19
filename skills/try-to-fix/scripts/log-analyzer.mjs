import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import {
  ensureExtracted,
  isTextFile,
  readLines,
  recentTextLines,
  relativePath,
  walkFiles
} from './bundle-utils.mjs'

const LOG_NAME_RE = /^cola(?:-(mobile))?-(\d{4}-\d{2}-\d{2})\.log$/
const MAX_BLOCK_LINES = 18
const MAX_LOG_LINE_CHARS = 700
const DEFAULT_MAX_BLOCKS = 12
const MAX_SUPPLEMENTAL_EVIDENCE = 40
const FULL_SUPPLEMENTAL_SCAN_BYTES = 8 * 1024 * 1024

const EXPLICIT_ERROR_PATTERN = /\[(?:ERROR|FATAL)\]/
const KEYWORD_ERROR_PATTERNS = [
  /exception/i,
  /fatal/i,
  /timeout/i,
  /terminated/i,
  /mobile:error/i,
  /\[mobile:legacy\].*(?:\berror:|\berror=)/i,
  /mobile:.*failed/i,
  /\bE(?:CONN|ADDR|HOST|NET|PIPE|TIMEDOUT|AI_AGAIN)[A-Z0-9_]*\b/i,
  /refused/i,
  /crash/i,
  /closed/i
]
const NON_ERROR_LEVEL_PATTERN = /\[(?:TRACE|DEBUG|INFO)\]/
const STRONG_FAILURE_PATTERN =
  /\b(?:error|failed|failure|fatal|exception|crash|refused)\b|\bE(?:CONN|ADDR|HOST|NET|PIPE|TIMEDOUT|AI_AGAIN)[A-Z0-9_]*\b|mobile:error/i

const PROMPT_PATTERNS = [
  /\[ipc\] agent:prompt /,
  /\[agent\] prompt start /,
  /\[mobile:[^\]]+\] send prompt:/
]
const FINAL_RESPONSE_PATTERN = /\[mobile:[^\]]+\] agent response final text:/
const TOOL_PATTERN = /\[subscribe\] tool_start .* tool=([A-Za-z0-9_-]+)/

const STABLE_ERROR_PHRASES = [
  'Not connected to Cola Server',
  'Server connection lost',
  'Unexpected server response: 401',
  'ERR_NETWORK_CHANGED',
  'getSyncChanges failed',
  'pushMessages failed',
  'websocket error',
  'prompt is too long'
]

const DIAGNOSTIC_PATTERNS = [
  {
    pattern:
      /messages\.\d+\.content\.\d+\.image\.source\.base64\.media_type|Input should be 'image\/jpeg'/i,
    score: 110
  },
  {
    pattern:
      /not connected to cola server|server connection lost|econnrefused|websocket error|enotfound|err_network|err_timed_out/i,
    score: 100
  },
  { pattern: /unauthorized|forbidden|api key|token/i, score: 90 },
  { pattern: /timeout|timed out/i, score: 80 },
  { pattern: /crash|fatal|exception/i, score: 70 },
  { pattern: /failed|refused|closed|terminated/i, score: 50 }
]

function dateKeyFromValue(value) {
  if (!value) return ''
  const direct = String(value).match(/\d{4}-\d{2}-\d{2}/)
  if (direct) return direct[0]

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function listColaLogs(root) {
  return walkFiles(root)
    .map((fullPath) => {
      const name = path.basename(fullPath)
      const match = LOG_NAME_RE.exec(name)
      if (!match) return null

      const relPath = relativePath(root, fullPath)
      if (!relPath.split('/').includes('logs')) return null

      return {
        dateKey: match[2],
        fullPath,
        logKind: match[1] === 'mobile' ? 'mobile' : 'desktop',
        relPath
      }
    })
    .filter(Boolean)
    .toSorted((left, right) => left.dateKey.localeCompare(right.dateKey))
}

function logKindForPlatform(platform) {
  const normalized = String(platform || '')
    .trim()
    .toLowerCase()
  if (normalized === 'android' || normalized === 'ios') return 'mobile'
  if (
    normalized === 'mac' ||
    normalized === 'macos' ||
    normalized === 'windows' ||
    normalized === 'win'
  )
    return 'desktop'
  return ''
}

function orderByPreferredLogKind(candidates, preferredKind) {
  return candidates.toSorted((left, right) => {
    if (left.logKind === preferredKind && right.logKind !== preferredKind) return -1
    if (right.logKind === preferredKind && left.logKind !== preferredKind) return 1
    return left.relPath.localeCompare(right.relPath)
  })
}

function chooseLogFiles(logs, createdAt, platform) {
  if (logs.length === 0) return []

  const preferredKind = logKindForPlatform(platform)
  const targetDate = dateKeyFromValue(createdAt)
  if (targetDate) {
    const exact = orderByPreferredLogKind(
      logs.filter((log) => log.dateKey === targetDate),
      preferredKind
    )
    if (exact.length > 0) {
      return exact.map((log) => ({ ...log, selectedBy: 'feedback-date' }))
    }

    const targetMs = new Date(`${targetDate}T00:00:00Z`).getTime()
    const closestDate = [...new Set(logs.map((log) => log.dateKey))].toSorted((left, right) => {
      const leftMs = new Date(`${left}T00:00:00Z`).getTime()
      const rightMs = new Date(`${right}T00:00:00Z`).getTime()
      return Math.abs(leftMs - targetMs) - Math.abs(rightMs - targetMs)
    })[0]
    if (closestDate) {
      return orderByPreferredLogKind(
        logs.filter((log) => log.dateKey === closestDate),
        preferredKind
      ).map((log) => ({ ...log, selectedBy: 'nearest-feedback-date' }))
    }
  }

  const newestDate = logs.at(-1)?.dateKey
  return orderByPreferredLogKind(
    newestDate ? logs.filter((log) => log.dateKey === newestDate) : logs.slice(-1),
    preferredKind
  ).map((log) => ({ ...log, selectedBy: 'newest-log' }))
}

function startsNewLogEntry(line) {
  return /^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(line)
}

function isNoisyContextLine(line) {
  if (!line) return false
  if (line.includes('[subscribe] auto_compaction_end')) return true
  if (line.includes('"summary"') && line.length > MAX_LOG_LINE_CHARS) return true
  if (line.includes('systemPrompt') && line.length > MAX_LOG_LINE_CHARS) return true
  return false
}

function isMobileStackFrameLine(line) {
  return /^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\]\s+\[ERROR\]\s+#\d+\s+/.test(line)
}

function compactLogLine(line) {
  const cleaned = line
    .replace(/\r/g, '')
    .replace(/(agent response final text:).*$/i, '$1 <redacted response>')
    .replace(
      /("(?:systemPrompt|userPrompt|prompt|content)"\s*:\s*)"[^"]*"/gi,
      '$1"<redacted content>"'
    )
    .replace(/("text"\s*:\s*)"[^"]*"/gi, '$1"<redacted text>"')
    .replace(/(\btext\s*=\s*)(?:"[^"]*"|'[^']*'|.*?)(?=\s+attachments=|$)/gi, '$1<redacted text>')
  if (cleaned.includes('messages=[')) {
    return cleaned.replace(/messages=\[[\s\S]*$/, 'messages=[omitted message payload]')
  }
  if (cleaned.length <= MAX_LOG_LINE_CHARS) return cleaned
  return `${cleaned.slice(0, MAX_LOG_LINE_CHARS)}... [truncated ${cleaned.length - MAX_LOG_LINE_CHARS} chars]`
}

function parseLogTimestamp(line, { utc = false } = {}) {
  const match = /^\[(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\.(\d+))?\]/.exec(line)
  if (!match) return null

  const millis = match[3] ? `.${match[3]}` : ''
  const zone = utc ? 'Z' : ''
  const date = new Date(`${match[1]}T${match[2]}${millis}${zone}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isKeywordErrorLine(line) {
  if (!KEYWORD_ERROR_PATTERNS.some((pattern) => pattern.test(line))) return false
  if (!NON_ERROR_LEVEL_PATTERN.test(line)) return true
  return STRONG_FAILURE_PATTERN.test(line)
}

function normalizeErrorKey(line) {
  return line
    .replace(/^\[[^\]]+\]\s*/g, '')
    .replace(/\[ERROR\]\s*/g, '')
    .replace(/\d+/g, '#')
    .trim()
}

function collectBlock(lines, index) {
  const start = Math.max(0, index - 2)
  const block = lines.slice(start, Math.min(lines.length, index + 8))

  let cursor = index + 8
  while (cursor < lines.length && block.length < MAX_BLOCK_LINES) {
    const current = lines[cursor]
    if (startsNewLogEntry(current)) break
    block.push(current)
    cursor += 1
  }

  return block
    .filter((line) => !isNoisyContextLine(line))
    .map((line) => compactLogLine(line))
    .filter((line) => line.trim().length > 0)
}

function collectErrorBlocks(lines, maxBlocks = DEFAULT_MAX_BLOCKS, options = {}) {
  const blocks = []
  const seen = new Set()
  const scanLimit = maxBlocks * 2

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (blocks.length >= scanLimit) break
    if (isNoisyContextLine(lines[index])) continue
    if (isMobileStackFrameLine(lines[index])) continue
    if (!EXPLICIT_ERROR_PATTERN.test(lines[index])) continue

    const key = normalizeErrorKey(lines[index])
    if (seen.has(key)) continue
    seen.add(key)

    const blockLines = collectBlock(lines, index)
    blocks.push({
      index,
      timestampIso: parseLogTimestamp(lines[index], options),
      lines: blockLines,
      primaryLine: lines[index].trim(),
      source: 'explicit-error'
    })
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (blocks.length >= scanLimit) break
    if (isNoisyContextLine(lines[index])) continue
    if (isMobileStackFrameLine(lines[index])) continue
    if (!isKeywordErrorLine(lines[index])) continue

    const key = normalizeErrorKey(lines[index])
    if (seen.has(key)) continue
    seen.add(key)

    const blockLines = collectBlock(lines, index)
    blocks.push({
      index,
      timestampIso: parseLogTimestamp(lines[index], options),
      lines: blockLines,
      primaryLine: lines[index].trim(),
      source: 'keyword-error'
    })
  }

  return rankErrorBlocks(blocks).slice(0, maxBlocks)
}

function collectUserPath(lines, errorIndex) {
  const searchWindow =
    errorIndex === null || errorIndex === undefined
      ? lines.slice(-180)
      : lines.slice(Math.max(0, errorIndex - 220), errorIndex + 1)

  let promptObserved = false
  const tools = []
  let finalResponseProduced = false

  for (const line of searchWindow) {
    for (const pattern of PROMPT_PATTERNS) {
      if (pattern.test(line)) promptObserved = true
    }

    if (FINAL_RESPONSE_PATTERN.test(line)) {
      finalResponseProduced = true
    }

    const toolMatch = TOOL_PATTERN.exec(line)
    if (toolMatch) tools.push(toolMatch[1])
  }

  const segments = []
  const tool = tools.at(-1) || ''
  if (promptObserved) segments.push('用户提交了一次请求（内容已省略）')
  if (tool) segments.push(`过程中进入了 \`${tool}\` 工具执行`)
  if (finalResponseProduced) segments.push('助手产生过最终响应（内容已省略）')

  return segments.length > 0
    ? `${segments.join('、')}，随后触发了日志中的报错。`
    : '日志里暂时只看到错误结果，用户操作路径需要继续补读 prompt 和 session。'
}

function cleanErrorPhrase(line) {
  return line
    .replace(/^\[[^\]]+\]\s*/g, '')
    .replace(/\[ERROR\]\s*/g, '')
    .replace(/\[[\w-]+(?::[\w-]+)*\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractErrorPhrases(blocks) {
  const joined = blocks.flatMap((block) => block.lines).join('\n')
  const phrases = []

  for (const phrase of STABLE_ERROR_PHRASES) {
    if (joined.includes(phrase)) {
      phrases.push(phrase)
    }
  }

  for (const block of blocks) {
    const phrase = cleanErrorPhrase(block.primaryLine || '')
    if (phrase) {
      phrases.push(phrase.length > 140 ? `${phrase.slice(0, 137)}...` : phrase)
    }
  }

  return [...new Set(phrases)].slice(0, 8)
}

function scoreDiagnosticSignal(block) {
  const joined = [block.primaryLine, ...block.lines].join('\n')
  let score = block.source === 'explicit-error' ? 20 : 0
  for (const item of DIAGNOSTIC_PATTERNS) {
    if (item.pattern.test(joined)) {
      score += item.score
      break
    }
  }
  return score
}

function rankErrorBlocks(blocks) {
  return blocks
    .map((block) => ({ ...block, diagnosticScore: scoreDiagnosticSignal(block) }))
    .toSorted((left, right) => {
      return right.diagnosticScore - left.diagnosticScore || left.index - right.index
    })
}

function buildNextStep(blocks) {
  const joined = blocks
    .flatMap((block) => block.lines)
    .join('\n')
    .toLowerCase()
  if (!joined) {
    return '日志里暂时缺少明确 ERROR，继续补读 tail、trace、session 和用户操作上下文。'
  }
  if (
    joined.includes('econnrefused') ||
    joined.includes('connection lost') ||
    joined.includes('not connected to cola server')
  ) {
    return '优先关注本地 Cola Server 生命周期、重连时序和异常退出原因；同一操作路径下确认 server 退出是否早于 WS bridge 连锁报错。'
  }
  if (joined.includes('timeout')) {
    return '优先关注超时阈值、请求取消和长任务执行路径；记录同一次操作的开始、超时点和服务端完成点。'
  }
  if (joined.includes('unauthorized') || joined.includes('api key')) {
    return '优先关注鉴权配置、token 刷新和密钥读取路径；对同一请求抓取鉴权前后状态。'
  }
  return '优先围绕日志里的 ERROR 对应模块定位触发点，并按用户原操作确认是否稳定命中同一段错误日志。'
}

function classifyBundleFiles(root) {
  const groups = {
    mainLogs: [],
    traces: [],
    sessions: [],
    diagnostics: [],
    crashes: [],
    other: []
  }

  for (const filePath of walkFiles(root)) {
    const relPath = relativePath(root, filePath)
    if (relPath === '.bundle-sha256') continue
    const segments = relPath.toLowerCase().split('/')
    const name = path.basename(relPath).toLowerCase()
    if (segments.includes('logs') && LOG_NAME_RE.test(path.basename(filePath))) {
      groups.mainLogs.push(filePath)
    } else if (
      segments.some((segment) => segment === 'traces' || segment === 'trace') ||
      /^trace[-_.]/i.test(path.basename(filePath))
    ) {
      groups.traces.push(filePath)
    } else if (segments.some((segment) => segment === 'sessions' || segment === 'session')) {
      groups.sessions.push(filePath)
    } else if (segments.some((segment) => segment.includes('diagnostic'))) {
      groups.diagnostics.push(filePath)
    } else if (segments.some((segment) => segment.includes('crash')) || name.endsWith('.crash')) {
      groups.crashes.push(filePath)
    } else {
      groups.other.push(filePath)
    }
  }

  return {
    groups,
    summary: Object.fromEntries(Object.entries(groups).map(([kind, files]) => [kind, files.length]))
  }
}

function correlationKind(value) {
  return value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase())
}

function fingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

function collectCorrelations(lines) {
  const pattern =
    /\b(sessionId|session_id|sessionKey|session_key|promptId|prompt_id|turnId|turn_id|traceId|trace_id|clientMessageId|client_message_id)\s*[:=]\s*["']?([A-Za-z0-9._:-]{4,})/gi
  const results = []
  const seen = new Set()
  for (const line of lines) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(line)) !== null) {
      const key = `${correlationKind(match[1])}:${match[2]}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        kind: correlationKind(match[1]),
        raw: match[2],
        fingerprint: fingerprint(match[2])
      })
    }
  }
  return results.slice(0, 80)
}

function structuralSignals(lines) {
  const joined = lines.join('\n')
  const patterns = [
    ['tool_start', /\btool_start\b|"type"\s*:\s*"tool_start"/i],
    ['tool_end', /\btool_end\b|"type"\s*:\s*"tool_end"/i],
    ['agent_end', /\bagent_end\b|"type"\s*:\s*"agent_end"/i],
    ['assistant_final', /agent response final|"role"\s*:\s*"assistant"/i],
    ['end_turn', /\bend_turn\b|"stop_reason"\s*:\s*"end_turn"/i],
    ['error', /\berror\b|\bexception\b|\bfatal\b/i],
    ['timeout', /\btimeout\b|timed out/i],
    ['cancelled', /\bcancel(?:led|ed|ation)\b|\babort(?:ed)?\b/i]
  ]
  return patterns.filter(([, pattern]) => pattern.test(joined)).map(([name]) => name)
}

function supplementalTimestamp(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsedLogTime = parseLogTimestamp(lines[index])
    if (parsedLogTime) return parsedLogTime
    const timestamps = [
      ...lines[index].matchAll(/"(?:ts|timestamp|createdAt|updatedAt|time)"\s*:\s*"([^"]+)"/g)
    ]
      .map((match) => new Date(match[1]).getTime())
      .filter((value) => !Number.isNaN(value))
    if (timestamps.length > 0) return new Date(Math.max(...timestamps)).toISOString()
  }
  return null
}

function evidenceRef(kind, root, filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return `${kind}/${fingerprint(relativePath(root, filePath))}${extension}`
}

function readSupplementalLines(filePath) {
  const stat = fs.statSync(filePath)
  return stat.size <= FULL_SUPPLEMENTAL_SCAN_BYTES
    ? { lines: readLines(filePath), scanMode: 'full' }
    : { lines: recentTextLines(filePath), scanMode: 'tail' }
}

function collectSupplementalEvidence(root, groups, correlations, feedbackTime) {
  const candidates = [
    ...groups.traces.map((filePath) => ({ kind: 'trace', filePath })),
    ...groups.sessions.map((filePath) => ({ kind: 'session', filePath })),
    ...groups.diagnostics.map((filePath) => ({ kind: 'diagnostic', filePath })),
    ...groups.crashes.map((filePath) => ({ kind: 'crash', filePath }))
  ]
  const evidence = []

  for (const candidate of candidates) {
    if (!isTextFile(candidate.filePath)) continue
    let scanned
    try {
      scanned = readSupplementalLines(candidate.filePath)
    } catch {
      continue
    }
    const matched = correlations.filter((item) =>
      scanned.lines.some((line) => line.includes(item.raw))
    )
    const signals = structuralSignals(scanned.lines)
    const lastTimestamp = supplementalTimestamp(scanned.lines)
    const feedbackMs = new Date(feedbackTime || '').getTime()
    const evidenceMs = new Date(lastTimestamp || '').getTime()
    const inTimeWindow =
      !Number.isNaN(feedbackMs) &&
      !Number.isNaN(evidenceMs) &&
      Math.abs(feedbackMs - evidenceMs) <= 2 * 60 * 60 * 1000
    const hasFailureSignal = signals.some((signal) =>
      ['error', 'timeout', 'cancelled'].includes(signal)
    )
    if (matched.length === 0 && !hasFailureSignal && !inTimeWindow) continue

    const selectedBy =
      matched.length > 0 ? 'correlation' : inTimeWindow ? 'time-window' : 'failure-signal'

    evidence.push({
      kind: candidate.kind,
      ref: evidenceRef(candidate.kind, root, candidate.filePath),
      selectedBy,
      matchedCorrelations: matched.map(({ kind, fingerprint: value }) => ({
        kind,
        fingerprint: value
      })),
      signals,
      completionHints: {
        toolStarted: signals.includes('tool_start'),
        toolEnded: signals.includes('tool_end'),
        agentEnded: signals.includes('agent_end') || signals.includes('end_turn'),
        assistantFinal: signals.includes('assistant_final')
      },
      lastTimestamp,
      scanMode: scanned.scanMode
    })
  }

  return evidence
    .toSorted((left, right) => {
      if (left.selectedBy === 'correlation' && right.selectedBy !== 'correlation') return -1
      if (right.selectedBy === 'correlation' && left.selectedBy !== 'correlation') return 1
      if (left.selectedBy === 'time-window' && right.selectedBy === 'failure-signal') return -1
      if (right.selectedBy === 'time-window' && left.selectedBy === 'failure-signal') return 1
      return String(right.lastTimestamp || '').localeCompare(String(left.lastTimestamp || ''))
    })
    .slice(0, MAX_SUPPLEMENTAL_EVIDENCE)
}

function closestErrorBlock(blocks, createdAt) {
  if (blocks.length === 0) return null
  const target = new Date(createdAt || '').getTime()
  if (Number.isNaN(target)) return blocks[0]
  return blocks.toSorted((left, right) => {
    const leftTime = new Date(left.timestampIso || '').getTime()
    const rightTime = new Date(right.timestampIso || '').getTime()
    const leftDistance = Number.isNaN(leftTime)
      ? Number.POSITIVE_INFINITY
      : Math.abs(leftTime - target)
    const rightDistance = Number.isNaN(rightTime)
      ? Number.POSITIVE_INFINITY
      : Math.abs(rightTime - target)
    return leftDistance - rightDistance
  })[0]
}

function emptyAnalysis(message) {
  return {
    root: '',
    envInfo: {},
    logFile: '',
    logRelativePath: '',
    logKind: '',
    selectedBy: '',
    selectedLogs: [],
    inventory: {
      mainLogs: 0,
      traces: 0,
      sessions: 0,
      diagnostics: 0,
      crashes: 0,
      other: 0
    },
    correlations: [],
    supplementalEvidence: [],
    errorBlocks: [],
    rawErrorLog: '',
    userPath: '日志里暂时只看到错误结果，用户操作路径需要继续补读 prompt 和 session。',
    errorPhrases: [],
    errorTime: null,
    nextStep: message,
    status: message
  }
}

function readBundleEnvInfo(root) {
  try {
    const envPath = walkFiles(root).find((filePath) => path.basename(filePath) === 'env.json')
    if (!envPath) return {}
    const parsed = JSON.parse(fs.readFileSync(envPath, 'utf-8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

export async function analyzeFeedbackBundle({
  zipPath,
  workspaceDir,
  feedback,
  maxBlocks = DEFAULT_MAX_BLOCKS
}) {
  if (!zipPath) {
    return emptyAnalysis('当前 issue 没有 zip 附件，日志分析未运行。')
  }

  const extractionStartedAt = Date.now()
  const extraction = await ensureExtracted(zipPath, workspaceDir, '')
  const extractionMs = Date.now() - extractionStartedAt
  const root = extraction.root
  const envInfo = readBundleEnvInfo(root)
  const inventory = classifyBundleFiles(root)
  const logs = listColaLogs(root)
  const selectedLogs = chooseLogFiles(logs, feedback.createdAt, feedback.platform)

  if (selectedLogs.length === 0) {
    return {
      ...emptyAnalysis(
        '当前附件里没有找到 logs/cola-YYYY-MM-DD.log 或 logs/cola-mobile-YYYY-MM-DD.log，先补日志再分析。'
      ),
      root,
      envInfo,
      inventory: inventory.summary,
      reusedExtracted: extraction.reused,
      bundleSha256: extraction.sha256,
      extractMs: extractionMs
    }
  }

  const selectedData = selectedLogs.map((selected) => {
    const lines = readLines(selected.fullPath)
    const errorBlocks = collectErrorBlocks(lines, maxBlocks, {
      // Both desktop and mobile Cola loggers write UTC timestamps without a trailing Z.
      utc: true
    }).map((block) => ({
      ...block,
      logRelativePath: selected.relPath,
      logKind: selected.logKind
    }))
    return { selected, lines, errorBlocks }
  })
  const errorBlocks = selectedData
    .flatMap((item) => item.errorBlocks)
    .toSorted(
      (left, right) =>
        right.diagnosticScore - left.diagnosticScore ||
        String(left.timestampIso || '').localeCompare(String(right.timestampIso || ''))
    )
    .slice(0, maxBlocks * selectedData.length)
  const primaryError = closestErrorBlock(errorBlocks, feedback.createdAt)
  const primaryData =
    selectedData.find((item) => item.selected.relPath === primaryError?.logRelativePath) ||
    selectedData[0]
  const allSelectedLines = selectedData.flatMap((item) => item.lines)
  const privateCorrelations = collectCorrelations(allSelectedLines)
  const supplementalEvidence = collectSupplementalEvidence(
    root,
    inventory.groups,
    privateCorrelations,
    feedback.createdAt
  )
  const rawErrorLog = errorBlocks.map((block) => block.lines.join('\n')).join('\n\n')
  const firstSelected = selectedLogs[0]

  return {
    root,
    envInfo,
    reusedExtracted: extraction.reused,
    bundleSha256: extraction.sha256,
    extractMs: extractionMs,
    logFile: firstSelected.fullPath,
    logRelativePath: firstSelected.relPath,
    logKind: firstSelected.logKind,
    selectedBy: firstSelected.selectedBy,
    selectedLogs: selectedLogs.map((selected) => ({
      relativePath: selected.relPath,
      kind: selected.logKind,
      selectedBy: selected.selectedBy
    })),
    inventory: inventory.summary,
    correlations: privateCorrelations.map(({ kind, fingerprint: value }) => ({
      kind,
      fingerprint: value
    })),
    supplementalEvidence,
    errorBlocks,
    rawErrorLog,
    userPath: collectUserPath(primaryData.lines, primaryError?.index ?? null),
    errorPhrases: extractErrorPhrases(errorBlocks),
    errorTime: primaryError?.timestampIso || null,
    nextStep: buildNextStep(errorBlocks),
    status:
      errorBlocks.length > 0
        ? `已完整读取 ${selectedLogs.length} 个反馈日期日志，并提取 ${errorBlocks.length} 组错误证据。`
        : `已完整读取 ${selectedLogs.length} 个反馈日期日志，没有找到明确 ERROR 记录。`
  }
}
