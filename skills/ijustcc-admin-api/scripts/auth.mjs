#!/usr/bin/env node
// Interactive authorization helper.
//
// Opens the /admin/authorize page in the browser, waits for the user to
// copy the displayed token, then saves it to ~/.ijustcc/token (mode 0600).
//
// Run this yourself; the token never passes through Claude's context.
//
//   node skills/ijustcc-admin-api/scripts/auth.mjs
//
// Override the target site with IJUSTCC_AUTHORIZE_URL (local dev, etc).

import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { mkdir, writeFile, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const TOKEN_DIR = join(homedir(), '.ijustcc')
const TOKEN_FILE = join(TOKEN_DIR, 'token')
const AUTHORIZE_URL =
  process.env.IJUSTCC_AUTHORIZE_URL || 'https://ijust.cc/admin/authorize'

function openBrowser(url) {
  let cmd
  let args
  if (process.platform === 'darwin') {
    cmd = 'open'
    args = [url]
  } else if (process.platform === 'win32') {
    cmd = 'cmd'
    args = ['/c', 'start', '', url]
  } else {
    cmd = 'xdg-open'
    args = [url]
  }
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
}

function looksLikeJwt(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log(`Opening browser: ${AUTHORIZE_URL}`)
  console.log(
    'Log in if needed, copy the displayed token, then paste it below.',
  )
  openBrowser(AUTHORIZE_URL)

  const rl = createInterface({ input, output })
  const token = (await rl.question('Token: ')).trim()
  rl.close()

  if (!token) {
    console.error('No token entered.')
    process.exit(1)
  }
  if (!looksLikeJwt(token)) {
    console.error('That does not look like a JWT token. Aborting.')
    process.exit(1)
  }

  await mkdir(TOKEN_DIR, { recursive: true })
  await writeFile(TOKEN_FILE, token + '\n', { mode: 0o600 })
  await chmod(TOKEN_FILE, 0o600)
  console.log(`Token saved to ${TOKEN_FILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
