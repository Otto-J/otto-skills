#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const REPO = 'marswaveai/cola'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function usage() {
  console.error(
    'Usage: collect-issue-context.mjs <issue-url-or-number> [--output <json>] [--download-images <dir>]'
  )
}

function parseArgs(argv) {
  const args = { issue: '', output: '', imageDir: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--output') {
      args.output = argv[++index] || ''
    } else if (value === '--download-images') {
      args.imageDir = argv[++index] || ''
    } else if (!args.issue) {
      args.issue = value
    } else {
      throw new Error(`Unknown argument: ${value}`)
    }
  }
  if (!args.issue) throw new Error('Issue URL or number is required')
  if (argv.includes('--output') && !args.output) throw new Error('--output requires a path')
  if (argv.includes('--download-images') && !args.imageDir) {
    throw new Error('--download-images requires a directory')
  }
  return args
}

function parseIssueNumber(value) {
  if (/^\d+$/.test(value)) return Number(value)
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('Expected a marswaveai/cola Issue URL or numeric Issue number')
  }
  const match = /^\/marswaveai\/cola\/issues\/(\d+)\/?$/.exec(url.pathname)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !match) {
    throw new Error('Only github.com/marswaveai/cola/issues/<number> is supported')
  }
  return Number(match[1])
}

function trustedAttachmentUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return (
      host === 'storage.googleapis.com' ||
      /^(?:[a-z0-9.-]+\.)?oss-[a-z0-9-]+\.aliyuncs\.com$/.test(host) ||
      (host === 'github.com' && url.pathname.startsWith('/user-attachments/')) ||
      host.endsWith('.githubusercontent.com') ||
      host === 'github-production-user-asset-6210df.s3.amazonaws.com'
    )
  } catch {
    return false
  }
}

function attachmentNames(label, value) {
  let pathName = ''
  let dispositionName = ''
  try {
    const url = new URL(value)
    pathName = path.basename(decodeURIComponent(url.pathname))
    const disposition = url.searchParams.get('response-content-disposition') || ''
    dispositionName = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(disposition)?.[1] || ''
  } catch {
    // URL validity is checked before this helper is called.
  }
  return [label, dispositionName, pathName].map((item) => String(item || '').trim()).filter(Boolean)
}

function classifyAttachment(label, value) {
  const names = attachmentNames(label, value).map((name) => name.toLowerCase())
  if (names.some((name) => name.endsWith('.zip'))) return 'zip'
  if (names.some((name) => /\.(?:png|jpe?g|gif|webp|heic|heif|bmp)$/.test(name))) {
    return 'image'
  }
  return 'other'
}

function discoverAttachments(text, source, createdAt) {
  const result = []
  const linkPattern = /(!?)\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g
  for (const match of text.matchAll(linkPattern)) {
    const url = match[3].replaceAll('&amp;', '&')
    if (!trustedAttachmentUrl(url)) continue
    result.push({
      label: match[2].trim(),
      url,
      kind: classifyAttachment(match[2], url),
      source,
      createdAt
    })
  }
  return result
}

function containsSensitiveQuery(value) {
  try {
    const url = new URL(value)
    return [...url.searchParams.keys()].some((key) =>
      /^(?:access[_-]?token|auth|awsaccesskeyid|credential|expires?|key|ossaccesskeyid|se|sig|signature|sp|spr|sr|st|sv|token|x-amz-.+)$/i.test(
        key
      )
    )
  } catch {
    return false
  }
}

function redactText(value) {
  let text = String(value || '')
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
  text = text.replace(
    /^.*?(?:\*\*|__)?(Report ID|User ID|Device ID|Device|Email)(?:\*\*|__)?\s*(?::(?:\*\*|__)?|\|).*$/gim,
    (_line, label) => `${label}: [redacted]`
  )
  text = text.replace(/\b(?:gh[opsu]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,})\b/g, '[redacted-token]')
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted-token]')
  text = text.replace(/https?:\/\/[^\s)]+/g, (value) => {
    const url = value.replaceAll('&amp;', '&')
    return trustedAttachmentUrl(url) || containsSensitiveQuery(url)
      ? '[private-attachment-url]'
      : value
  })
  return text
}

async function ghJson(endpoint, paginate = false) {
  const args = ['api']
  if (paginate) args.push('--paginate', '--slurp')
  args.push(endpoint)
  const { stdout } = await execFileAsync('gh', args, { maxBuffer: 20 * 1024 * 1024 })
  return JSON.parse(stdout)
}

function flattenCommentPages(value) {
  if (!Array.isArray(value) || value.length === 0) return []
  return Array.isArray(value[0]) ? value.flat() : value
}

function extensionForImage(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return '.png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg'
  const prefix = Buffer.from(bytes.subarray(0, 12)).toString('ascii')
  if (prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a')) return '.gif'
  if (prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP') return '.webp'
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return '.bmp'
  const boxType = Buffer.from(bytes.subarray(4, 8)).toString('ascii')
  const brand = Buffer.from(bytes.subarray(8, 12)).toString('ascii')
  if (boxType === 'ftyp' && /^(?:heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return '.heic'
  return ''
}

async function fetchTrustedImage(urlValue) {
  let currentUrl = urlValue
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    if (!trustedAttachmentUrl(currentUrl)) throw new Error('Image redirected to an untrusted host')
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000)
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Image redirect omitted Location')
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }
    if (!response.ok || !response.body) {
      throw new Error(`Image download failed with HTTP ${response.status}`)
    }
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 10 MiB limit')

    const chunks = []
    let total = 0
    for await (const chunk of response.body) {
      total += chunk.byteLength
      if (total > MAX_IMAGE_BYTES) throw new Error('Image exceeds the 10 MiB limit')
      chunks.push(Buffer.from(chunk))
    }
    const bytes = Buffer.concat(chunks)
    const contentType = (response.headers.get('content-type') || '').toLowerCase()
    const extension = extensionForImage(bytes)
    if (!extension) throw new Error('Downloaded attachment is not a supported image')
    return { bytes, contentType, extension }
  }
  throw new Error('Image exceeded the redirect limit')
}

async function downloadImages(attachments, imageDir) {
  if (!imageDir) return []
  await mkdir(imageDir, { recursive: true })
  const runDir = await mkdtemp(path.join(path.resolve(imageDir), 'issue-images-'))
  const results = []
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index]
    if (attachment.kind !== 'image') continue
    try {
      const image = await fetchTrustedImage(attachment.url)
      const fileName = `image-${index + 1}${image.extension}`
      const filePath = path.join(runDir, fileName)
      await writeFile(filePath, image.bytes)
      results.push({
        attachmentIndex: index + 1,
        fileName,
        filePath,
        sizeBytes: image.bytes.byteLength,
        contentType: image.contentType,
        ok: true
      })
    } catch (error) {
      results.push({
        attachmentIndex: index + 1,
        fileName: '',
        filePath: '',
        sizeBytes: 0,
        contentType: '',
        ok: false,
        error: redactText(error instanceof Error ? error.message : String(error))
      })
    }
  }
  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const issueNumber = parseIssueNumber(args.issue)
  const issue = await ghJson(`repos/${REPO}/issues/${issueNumber}`)
  if (issue.pull_request) throw new Error('The URL points to a Pull Request, not an Issue')
  const comments = flattenCommentPages(
    await ghJson(`repos/${REPO}/issues/${issueNumber}/comments?per_page=100`, true)
  )

  const rawAttachments = [
    ...discoverAttachments(issue.body || '', 'body', issue.created_at || ''),
    ...comments.flatMap((comment) =>
      discoverAttachments(comment.body || '', 'comment', comment.created_at || '')
    )
  ]
  const seenUrls = new Set()
  const attachments = rawAttachments.filter((attachment) => {
    if (seenUrls.has(attachment.url)) return false
    seenUrls.add(attachment.url)
    return true
  })
  const downloadedImages = await downloadImages(attachments, args.imageDir)

  const context = {
    repo: REPO,
    issue: {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      body: redactText(issue.body),
      author: issue.user?.login || '',
      labels: (issue.labels || []).map((label) => label.name),
      assignees: (issue.assignees || []).map((assignee) => assignee.login),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      url: issue.html_url
    },
    comments: comments.map((comment) => ({
      author: comment.user?.login || '',
      body: redactText(comment.body),
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      url: comment.html_url
    })),
    attachments: attachments.map((attachment, index) => ({
      index: index + 1,
      label: redactText(attachment.label),
      kind: attachment.kind,
      source: attachment.source,
      createdAt: attachment.createdAt
    })),
    downloadedImages
  }
  const serialized = `${JSON.stringify(context, null, 2)}\n`
  if (args.output) {
    const outputPath = path.resolve(args.output)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, serialized, 'utf8')
    console.log(outputPath)
  } else {
    process.stdout.write(serialized)
  }
}

export {
  containsSensitiveQuery,
  discoverAttachments,
  extensionForImage,
  parseIssueNumber,
  redactText,
  trustedAttachmentUrl
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((error) => {
    usage()
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
