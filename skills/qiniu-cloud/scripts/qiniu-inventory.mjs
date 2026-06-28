#!/usr/bin/env node
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import process from 'node:process'

import qiniu from 'qiniu'

const DEFAULT_CDN_LIMIT = 1000
const DEFAULT_CERT_LIMIT = 100
const DEFAULT_TIMEOUT_MS = 20000
const DEFAULT_MAX_PAGES = 20

function readEnv(name, fallback = '') {
  const value = process.env[name]
  return value == null || value === '' ? fallback : value
}

function readIntEnv(name, fallback) {
  const raw = readEnv(name)
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function readBoolEnv(name, fallback = false) {
  const raw = readEnv(name)
  if (!raw) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())
}

function requireEnv(name, aliases = []) {
  const value = [name, ...aliases].map((key) => readEnv(key)).find(Boolean)
  if (!value) {
    throw new Error('Missing Qiniu credentials. Export QINIU_AK/QINIU_SK or qiniu_ak/qiniu_sk before running this script.')
  }
  return value
}

function makeMac() {
  return new qiniu.auth.digest.Mac(requireEnv('QINIU_AK', ['qiniu_ak']), requireEnv('QINIU_SK', ['qiniu_sk']))
}

async function listBuckets(mac) {
  debug('listing buckets')
  const buckets = normalizeArray(await qboxApiRequest(mac, new URL('https://uc.qiniuapi.com/buckets'), 'POST'))

  if (!readBoolEnv('QINIU_INCLUDE_BUCKET_DOMAINS')) {
    return buckets.map((bucket) => ({ name: bucket }))
  }

  const rows = []
  for (const bucket of buckets) {
    try {
      const domainsUrl = new URL('https://uc.qiniuapi.com/v3/domains')
      domainsUrl.searchParams.set('tbl', bucket)
      const domainsResponse = await qboxApiRequest(mac, domainsUrl, 'POST')
      rows.push({
        name: bucket,
        domains: normalizeArray(domainsResponse),
      })
    } catch (error) {
      rows.push({
        name: bucket,
        domains: [],
        error: shortError(error),
      })
    }
  }
  return rows
}

async function listCdnDomains(mac) {
  const limit = readIntEnv('QINIU_CDN_LIMIT', DEFAULT_CDN_LIMIT)
  const maxPages = readIntEnv('QINIU_MAX_PAGES', DEFAULT_MAX_PAGES)
  const includeDetails = readBoolEnv('QINIU_INCLUDE_CDN_DETAILS')
  const domains = []
  let marker = ''
  let page = 0

  do {
    page += 1
    if (page > maxPages) throw new Error(`CDN domain pagination exceeded QINIU_MAX_PAGES=${maxPages}`)
    const url = new URL('https://api.qiniu.com/domain')
    url.searchParams.set('limit', String(limit))
    if (marker) url.searchParams.set('marker', marker)

    debug(`listing CDN domains page ${page}`)
    const body = await qiniuApiRequest(mac, url, 'GET')
    const pageDomains = normalizeArray(body.domains)
    domains.push(...pageDomains)
    const nextMarker = body.marker || ''
    if (!pageDomains.length || nextMarker === marker) break
    marker = nextMarker
  } while (marker)

  if (!includeDetails) return domains.map(normalizeCdnDomain)

  const detailed = []
  for (const domain of domains) {
    const name = typeof domain === 'string' ? domain : domain.name
    if (!name) {
      detailed.push(domain)
      continue
    }

    try {
      const detail = await qiniuApiRequest(mac, new URL(`https://api.qiniu.com/domain/${encodeURIComponent(name)}`), 'GET')
      detailed.push(detail)
    } catch (error) {
      detailed.push({ ...normalizeCdnDomain(domain), error: shortError(error) })
    }
  }
  return detailed.map(normalizeCdnDomain)
}

async function listHttpsCertificates(mac) {
  const limit = readIntEnv('QINIU_CERT_LIMIT', DEFAULT_CERT_LIMIT)
  const maxPages = readIntEnv('QINIU_MAX_PAGES', DEFAULT_MAX_PAGES)
  const certificates = []
  let marker = ''
  let page = 0

  do {
    page += 1
    if (page > maxPages) throw new Error(`HTTPS certificate pagination exceeded QINIU_MAX_PAGES=${maxPages}`)
    const url = new URL('https://fusion.qiniuapi.com/sslcert')
    url.searchParams.set('marker', marker)
    url.searchParams.set('limit', String(limit))

    debug(`listing HTTPS certificates page ${page}`)
    const body = await qboxApiRequest(mac, url, 'GET')
    const pageCertificates = normalizeArray(body.certs)
    certificates.push(...pageCertificates)
    const nextMarker = body.marker || ''
    if (!pageCertificates.length || nextMarker === marker) break
    marker = nextMarker
  } while (marker)

  return certificates.map(normalizeCertificate)
}

async function qiniuApiRequest(mac, url, method, body) {
  const contentType = body ? 'application/json' : ''
  const bodyText = body ? JSON.stringify(body) : ''
  const headers = {
    Authorization: generateQiniuApiToken(mac, url, method, contentType, bodyText),
  }
  if (contentType) headers['Content-Type'] = contentType

  return jsonRequest(url, { method, headers, body: bodyText || undefined })
}

function generateQiniuApiToken(mac, url, method, contentType, bodyText) {
  let access = `${method.toUpperCase()} ${url.pathname}${url.search}`
  access += `\nHost: ${url.host}`
  if (contentType) access += `\nContent-Type: ${contentType}`
  access += '\n\n'
  if (bodyText) access += bodyText

  const digest = crypto.createHmac('sha1', mac.secretKey).update(access).digest('base64')
  return `Qiniu ${mac.accessKey}:${digest.replace(/\//g, '_').replace(/\+/g, '-')}`
}

async function qboxApiRequest(mac, url, method, body) {
  const headers = {
    Authorization: qiniu.util.generateAccessToken(mac, url.toString(), ''),
  }
  const bodyText = body ? JSON.stringify(body) : ''
  if (body) headers['Content-Type'] = 'application/json'

  return jsonRequest(url, { method, headers, body: bodyText || undefined })
}

async function jsonRequest(url, options) {
  const timeoutMs = readIntEnv('QINIU_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${options.method} ${url.hostname}${url.pathname}${url.search} timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { raw: text }
  }

  if (!response.ok || isApiError(payload)) {
    const message = payload.error || payload.message || response.statusText
    throw new Error(`${options.method} ${url.pathname}${url.search} failed: ${response.status} ${message}`)
  }

  return payload
}

function isApiError(payload) {
  return payload && typeof payload.code === 'number' && payload.code !== 0 && payload.code !== 200
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value
  if (value == null) return []
  return [value]
}

function normalizeCdnDomain(domain) {
  if (typeof domain === 'string') return { name: domain }
  return pickDefined({
    name: domain.name,
    cname: domain.cname,
    type: domain.type,
    protocol: domain.protocol,
    product: domain.product,
    platform: domain.platform,
    geoCover: domain.geoCover,
    operatingState: domain.operatingState,
    freezeType: domain.freezeType,
    createAt: domain.createAt,
    modifyAt: domain.modifyAt,
    source: domain.source,
    https: domain.https,
    error: domain.error,
  })
}

function normalizeCertificate(cert) {
  return pickDefined({
    certid: cert.certid || cert.certID || cert.id,
    name: cert.name,
    common_name: cert.common_name || cert.commonName,
    dnsnames: cert.dnsnames,
    not_before: cert.not_before,
    not_after: cert.not_after,
    create_time: cert.create_time,
    not_before_iso: unixToIso(cert.not_before),
    not_after_iso: unixToIso(cert.not_after),
    create_time_iso: unixToIso(cert.create_time),
  })
}

function unixToIso(value) {
  if (!value) return undefined
  return new Date(Number(value) * 1000).toISOString()
}

function pickDefined(input) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function shortError(error) {
  return error instanceof Error ? error.message : String(error)
}

function debug(message) {
  if (readBoolEnv('QINIU_DEBUG')) {
    console.error(`[qiniu-inventory] ${message}`)
  }
}

async function main() {
  const mac = makeMac()
  debug('starting inventory')
  const report = {
    generatedAt: new Date().toISOString(),
    account: {
      accessKey: `${mac.accessKey.slice(0, 4)}...${mac.accessKey.slice(-4)}`,
    },
    buckets: readBoolEnv('QINIU_SKIP_BUCKETS') ? [] : await listBuckets(mac),
    cdnDomains: readBoolEnv('QINIU_SKIP_CDN') ? [] : await listCdnDomains(mac),
    httpsCertificates: readBoolEnv('QINIU_SKIP_CERTS') ? [] : await listHttpsCertificates(mac),
  }
  debug('inventory complete')

  const outputPath = readEnv('QINIU_INVENTORY_OUTPUT')
  const text = JSON.stringify(report, null, 2)
  if (outputPath) {
    await fs.writeFile(outputPath, `${text}\n`)
    console.error(`Wrote Qiniu inventory to ${outputPath}`)
  } else {
    console.log(text)
  }
}

main().catch((error) => {
  console.error(shortError(error))
  process.exit(1)
})
