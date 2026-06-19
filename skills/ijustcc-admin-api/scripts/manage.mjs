#!/usr/bin/env node
// Manage posts via the admin API: list, get, delete.
//
//   node skills/ijustcc-admin-api/scripts/manage.mjs list
//   node skills/ijustcc-admin-api/scripts/manage.mjs get <collection> <slug>
//   node skills/ijustcc-admin-api/scripts/manage.mjs delete <collection> <slug>
//
// Uses the token saved by auth.mjs. Creating/updating posts is handled by
// publish.mjs. Override the target site with IJUSTCC_API_BASE (local dev, etc).

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

async function readToken() {
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
  return token
}

function usage() {
  console.error(
    'Usage:\n' +
      '  manage.mjs list\n' +
      '  manage.mjs get <collection> <slug>\n' +
      '  manage.mjs delete <collection> <slug>',
  )
  process.exit(1)
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2)
  const token = await readToken()

  let method
  let path
  if (cmd === 'list') {
    method = 'GET'
    path = '/api/admin/posts'
  } else if (cmd === 'get' || cmd === 'delete') {
    if (!a || !b) usage()
    method = cmd === 'get' ? 'GET' : 'DELETE'
    path = `/api/admin/posts/${encodeURIComponent(a)}/${encodeURIComponent(b)}`
  } else {
    usage()
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`${cmd} failed (${res.status}):`, JSON.stringify(body))
    process.exit(1)
  }
  if (cmd === 'delete') {
    console.log(`Deleted ${a}/${b}`)
  } else {
    console.log(JSON.stringify(body, null, 2))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
