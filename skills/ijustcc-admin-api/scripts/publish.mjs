#!/usr/bin/env node
// Publish a post via the admin API using the token saved by auth.mjs.
//
//   node skills/ijustcc-admin-api/scripts/publish.mjs payload.json
//   cat payload.json | node skills/ijustcc-admin-api/scripts/publish.mjs -
//
// payload.json is the JSON body for POST /api/admin/posts. Override the
// target site with IJUSTCC_API_BASE (local dev, etc).

import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const API_BASE = (process.env.IJUSTCC_API_BASE || 'https://ijust.cc').replace(
  /\/$/,
  '',
)
const TOKEN_FILE = join(homedir(), '.ijustcc', 'token')

function decodeExp(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    )
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

async function readPayload() {
  const arg = process.argv[2]
  if (!arg || arg === '-') {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf8')
  }
  return readFile(arg, 'utf8')
}

async function main() {
  let token
  try {
    token = (await readFile(TOKEN_FILE, 'utf8')).trim()
  } catch {
    console.error(
      `No token at ${TOKEN_FILE}. Run: node skills/ijustcc-admin-api/scripts/auth.mjs`,
    )
    process.exit(2)
  }

  const exp = decodeExp(token)
  if (exp && Date.now() >= exp) {
    console.error('Token has expired. Re-run auth.mjs to get a fresh token.')
    process.exit(2)
  }

  const raw = await readPayload()
  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    console.error('Payload is not valid JSON.')
    process.exit(1)
  }

  const res = await fetch(`${API_BASE}/api/admin/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`Publish failed (${res.status}):`, JSON.stringify(body))
    process.exit(1)
  }
  console.log('Published:', JSON.stringify(body))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
