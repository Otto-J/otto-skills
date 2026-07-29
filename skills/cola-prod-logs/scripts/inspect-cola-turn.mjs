#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_DATA_DIR = path.join(process.env.HOME || '/Users/otto', '.cola')
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function parseArgs(argv) {
  const args = {
    text: '',
    dataDir: DEFAULT_DATA_DIR,
    sinceMinutes: 180,
    around: '',
    windowMinutes: 30,
    json: false
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--text') args.text = argv[++index] || ''
    else if (arg === '--data-dir') args.dataDir = argv[++index] || DEFAULT_DATA_DIR
    else if (arg === '--since-minutes') args.sinceMinutes = Number(argv[++index])
    else if (arg === '--around') args.around = argv[++index] || ''
    else if (arg === '--window-minutes') args.windowMinutes = Number(argv[++index])
    else if (arg === '--json') args.json = true
  }
  return args
}

function usage() {
  console.error('Usage: inspect-cola-turn.mjs --text TEXT [--since-minutes N | --around "YYYY-MM-DD HH:mm"] [--window-minutes N] [--data-dir DIR] [--json]')
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s，。！？、：；,.!?:;"'`“”‘’（）()\[\]{}<>《》]/g, '')
}

function similarity(query, candidate) {
  const q = normalize(query)
  const c = normalize(candidate)
  if (!q || !c) return 0
  if (c.includes(q) || q.includes(c)) return Math.min(q.length, c.length) / Math.max(q.length, c.length) + 1
  const grams = (value) => {
    const out = new Set()
    for (let index = 0; index < value.length - 1; index += 1) out.add(value.slice(index, index + 2))
    return out
  }
  const qg = grams(q)
  const cg = grams(c)
  let overlap = 0
  for (const gram of qg) if (cg.has(gram)) overlap += 1
  return overlap / Math.max(1, qg.size)
}

function parseAround(value) {
  if (!value) return null
  if (/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date())
    value = `${today} ${value}`
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0)) - SHANGHAI_OFFSET_MS
}

function localTime(ms) {
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(new Date(ms)).replaceAll('/', '-')
}

function redact(value, redactEnvironment = false) {
  if (typeof value !== 'string') return value
  let output = value
  if (redactEnvironment) {
    output = output.replace(/(^|\n)(\d+:)?(export\s+)?([A-Z][A-Z0-9_]{2,})=(['"]?)[^\s;]+\5/gm, '$1$2$3$4=<redacted>')
  }
  return output
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s"']+/gi, '$1<redacted>')
    .replace(/((?:api[_-]?key|token|secret|password|cookie|private[_-]?key)[A-Za-z0-9_-]*\s*[:=]\s*)["']?[^\s"']+["']?/gi, '$1<redacted>')
    .replace(/\b(gk_live_|sk-|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9._-]+\b/g, '<redacted>')
}

function compact(value, max = 500, redactEnvironment = false) {
  const text = redact(String(value || ''), redactEnvironment).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

async function listLogFiles(logDir) {
  const entries = await readdir(logDir, { withFileTypes: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(logDir, entry.name))
}

function userText(message) {
  if (message?.role !== 'user' || !Array.isArray(message.content)) return ''
  return message.content.filter((item) => item?.type === 'text').map((item) => item.text || '').join('\n')
}

function summarizeMessages(messages) {
  const events = []
  for (const [index, message] of messages.entries()) {
    for (const item of Array.isArray(message.content) ? message.content : []) {
      if (item?.type === 'toolCall') {
        const args = item.arguments || {}
        events.push({ index, role: message.role, type: 'toolCall', tool: item.name, detail: compact(args.command || args.path || args.content || JSON.stringify(args), 700) })
      } else if (item?.type === 'text' && item.text) {
        events.push({ index, role: message.role, type: message.role === 'toolResult' ? 'toolResult' : 'text', tool: message.toolName || null, isError: message.isError === true, detail: compact(item.text, 700, message.role === 'toolResult') })
      }
    }
  }
  return events
}

async function traceCandidates(files, query, startMs, endMs) {
  const candidates = []
  const traceFiles = files.filter((file) => /^trace-.*\.jsonl$/.test(path.basename(file)))
  for (const file of traceFiles) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].includes('"full_run"') || !lines[index].includes('"role":"user"')) continue
      let record
      try { record = JSON.parse(lines[index]) } catch { continue }
      if (record.type !== 'full_run' || !Array.isArray(record.messages)) continue
      const input = userText(record.messages[0])
      const score = similarity(query, input)
      const time = Number(record.startTime)
      if (score < 0.34 || !Number.isFinite(time) || time < startMs || time > endMs) continue
      candidates.push({ source: file, line: index + 1, score, time, record, input })
    }
  }
  return candidates.sort((a, b) => b.score - a.score || b.time - a.time)
}

async function findMainEvidence(files, candidate) {
  const mainFiles = files.filter((file) => /^cola-\d{4}-\d{2}-\d{2}\.log$/.test(path.basename(file)))
  const evidence = []
  let promptId = null
  const promptPrefix = `prompt_${candidate.time}_`
  for (const file of mainFiles) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
    for (const line of lines) {
      const match = new RegExp(`promptId=(${promptPrefix}[A-Za-z0-9]+)`).exec(line)
      if (match) { promptId = match[1]; break }
    }
    if (promptId) {
      lines.forEach((line, index) => {
        if (line.includes(promptId) && /(prompt start|session ready|tool_start|tool_end|agent_end|complete)/.test(line)) {
          evidence.push({ file, line: index + 1, text: compact(line, 500) })
        }
      })
    }
  }
  return { promptId, evidence: evidence.slice(0, 80) }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.text) { usage(); process.exitCode = 2; return }
  const logDir = path.join(args.dataDir, 'logs')
  const around = parseAround(args.around)
  if (args.around && !around) throw new Error(`Invalid --around value: ${args.around}`)
  const now = Date.now()
  const startMs = around ? around - args.windowMinutes * 60_000 : now - args.sinceMinutes * 60_000
  const endMs = around ? around + args.windowMinutes * 60_000 : now + 60_000
  const files = await listLogFiles(logDir)
  const candidates = await traceCandidates(files, args.text, startMs, endMs)
  if (candidates.length === 0) {
    console.error(`No matching Cola turn found in ${logDir}. Try a wider time window or a shorter text fragment.`)
    process.exitCode = 1
    return
  }
  const selected = candidates[0]
  const mainEvidence = await findMainEvidence(files, selected)
  const modelMessage = selected.record.messages.find((message) => message?.provider || message?.model)
  const result = {
    query: args.text,
    match: {
      input: compact(selected.input, 500),
      localTime: localTime(selected.time),
      epochMs: selected.time,
      score: Number(selected.score.toFixed(3)),
      promptId: mainEvidence.promptId,
      sessionKey: selected.record.sessionKey || null,
      runId: selected.record.runId || null,
      provider: modelMessage?.provider || null,
      model: modelMessage?.model || null,
      traceFile: selected.source,
      traceLine: selected.line
    },
    alternatives: candidates.slice(1, 4).map((item) => ({ input: compact(item.input, 200), localTime: localTime(item.time), score: Number(item.score.toFixed(3)), traceFile: item.source, traceLine: item.line })),
    timeline: summarizeMessages(selected.record.messages),
    mainLogEvidence: mainEvidence.evidence
  }
  if (args.json) console.log(JSON.stringify(result, null, 2))
  else {
    console.log(`Match: ${result.match.input}`)
    console.log(`Time: ${result.match.localTime} Asia/Shanghai`)
    console.log(`promptId: ${result.match.promptId || 'unavailable'}`)
    console.log(`Session: ${result.match.sessionKey || 'unavailable'}`)
    console.log(`Model: ${[result.match.provider, result.match.model].filter(Boolean).join('/') || 'unavailable'}`)
    console.log(`Trace: ${result.match.traceFile}:${result.match.traceLine}`)
    console.log('\nTimeline:')
    result.timeline.forEach((event) => console.log(`- [${event.index}] ${event.role} ${event.type}${event.tool ? ` ${event.tool}` : ''}: ${event.detail}`))
    if (result.alternatives.length) {
      console.log('\nOther candidates:')
      result.alternatives.forEach((item) => console.log(`- ${item.localTime} score=${item.score} ${item.input}`))
    }
  }
}

main().catch((error) => {
  console.error(compact(error?.stack || error?.message || error))
  process.exitCode = 1
})
