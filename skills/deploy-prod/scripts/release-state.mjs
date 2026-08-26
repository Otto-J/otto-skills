#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const expectedRepo = 'marswaveai/cola'
const canonicalTagPattern = /^admin-release(\d{8})-(\d{2})$/

const run = async (command, args, options = {}) => {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
  } catch (error) {
    if (options.allowFailure) {
      return {
        ok: false,
        stdout: String(error.stdout ?? '').trim(),
        stderr: String(error.stderr ?? error.message ?? '').trim(),
      }
    }
    throw new Error(`${command} ${args.join(' ')} failed: ${String(error.stderr ?? error.message ?? '').trim()}`)
  }
}

const lines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean)

const compareTags = (left, right) => {
  const leftMatch = canonicalTagPattern.exec(left)
  const rightMatch = canonicalTagPattern.exec(right)
  if (!leftMatch || !rightMatch) return left.localeCompare(right)
  return `${leftMatch[1]}${leftMatch[2]}`.localeCompare(`${rightMatch[1]}${rightMatch[2]}`)
}

const shanghaiDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}${values.month}${values.day}`
}

const resolveRepoRoot = async () => {
  const result = await run('git', ['rev-parse', '--show-toplevel'])
  return result.stdout
}

const onlineReleases = async () => {
  const result = await run('gh', [
    'release',
    'list',
    '--repo',
    expectedRepo,
    '--limit',
    '1000',
    '--json',
    'tagName,name,isDraft,isPrerelease,publishedAt',
  ])
  return JSON.parse(result.stdout)
}

const remoteCanonicalTags = async () => {
  const result = await run('gh', [
    'api',
    `repos/${expectedRepo}/git/matching-refs/tags/admin-release`,
    '--paginate',
    '--jq',
    '.[].ref',
  ])
  return [...new Set(lines(result.stdout)
    .map((ref) => ref.replace(/^refs\/tags\//, ''))
    .filter((tag) => canonicalTagPattern.test(tag)))]
    .sort(compareTags)
}

const audit = async () => {
  const [tags, releases] = await Promise.all([remoteCanonicalTags(), onlineReleases()])
  const canonicalReleases = releases
    .filter((release) => canonicalTagPattern.test(release.tagName))
    .sort((left, right) => compareTags(left.tagName, right.tagName))
  const finalReleases = canonicalReleases.filter((release) => !release.isDraft && !release.isPrerelease)
  const tagSet = new Set(tags)
  const releaseByTag = new Map(canonicalReleases.map((release) => [release.tagName, release]))
  const finalReleaseByTag = new Map(finalReleases.map((release) => [release.tagName, release]))
  const tagsWithoutRelease = tags.filter((tag) => !releaseByTag.has(tag))
  const tagsWithNonFinalRelease = tags.filter((tag) => releaseByTag.has(tag) && !finalReleaseByTag.has(tag))
  const releasesWithoutTag = canonicalReleases
    .filter((release) => !tagSet.has(release.tagName))
    .map((release) => release.tagName)
  const matched = tags
    .filter((tag) => finalReleaseByTag.has(tag))
    .map((tag) => ({
      tag,
      publishedAt: finalReleaseByTag.get(tag).publishedAt,
      url: `https://github.com/${expectedRepo}/releases/tag/${encodeURIComponent(tag)}`,
    }))

  return {
    repository: expectedRepo,
    checkedAt: new Date().toISOString(),
    counts: {
      canonicalTags: tags.length,
      canonicalReleases: canonicalReleases.length,
      finalReleases: finalReleases.length,
      matched: matched.length,
      tagsWithoutRelease: tagsWithoutRelease.length,
      tagsWithNonFinalRelease: tagsWithNonFinalRelease.length,
      releasesWithoutTag: releasesWithoutTag.length,
    },
    latestMatched: matched.slice(-10).reverse(),
    tagsWithoutRelease,
    tagsWithNonFinalRelease,
    releasesWithoutTag,
  }
}

const preflight = async () => {
  const repoRoot = await resolveRepoRoot()
  const repoResult = await run('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
    cwd: repoRoot,
  })
  if (repoResult.stdout !== expectedRepo) {
    throw new Error(`expected GitHub repository ${expectedRepo}, got ${repoResult.stdout || 'unknown'}`)
  }

  await run('git', ['fetch', 'origin', 'main', '--tags', '--prune'], { cwd: repoRoot })
  const target = (await run('git', ['rev-parse', 'origin/main^{commit}'], { cwd: repoRoot })).stdout
  const branch = (await run('git', ['branch', '--show-current'], { cwd: repoRoot })).stdout || '(detached)'
  const head = (await run('git', ['rev-parse', 'HEAD^{commit}'], { cwd: repoRoot })).stdout
  const worktree = lines((await run('git', ['status', '--porcelain'], { cwd: repoRoot })).stdout)
  const reachableTagList = lines((await run('git', [
    'tag',
    '--merged',
    target,
    '--list',
    'admin-release*',
    '--sort=-version:refname',
  ], { cwd: repoRoot })).stdout).filter((tag) => canonicalTagPattern.test(tag))
  const allCanonicalTags = lines((await run('git', [
    'tag',
    '--list',
    'admin-release*',
    '--sort=-version:refname',
  ], { cwd: repoRoot })).stdout).filter((tag) => canonicalTagPattern.test(tag))
  const releases = await onlineReleases()
  const publishedReleaseTags = new Set(releases
    .filter((release) => canonicalTagPattern.test(release.tagName) && !release.isDraft && !release.isPrerelease)
    .map((release) => release.tagName))
  const previousReleaseTag = reachableTagList.find((tag) => publishedReleaseTags.has(tag))
  if (!previousReleaseTag) {
    throw new Error('no published canonical Admin Release is reachable from origin/main')
  }

  const newerTagsWithoutRelease = reachableTagList
    .slice(0, reachableTagList.indexOf(previousReleaseTag))
    .filter((tag) => !publishedReleaseTags.has(tag))
  const allFiles = lines((await run('git', ['diff', '--name-only', `${previousReleaseTag}..${target}`], {
    cwd: repoRoot,
  })).stdout)
  const dashboardFiles = allFiles.filter((file) => file.startsWith('apps/admin-dashboard/'))
  const dashboardCommitLines = lines((await run('git', [
    'log',
    '--no-merges',
    '--format=%H%x09%s',
    `${previousReleaseTag}..${target}`,
    '--',
    'apps/admin-dashboard',
  ], { cwd: repoRoot })).stdout)
  const dashboardCommits = dashboardCommitLines.map((line) => {
    const separator = line.indexOf('\t')
    return separator === -1
      ? { sha: line, subject: '' }
      : { sha: line.slice(0, separator), subject: line.slice(separator + 1) }
  })

  const date = shanghaiDate()
  const sequence = allCanonicalTags
    .map((tag) => canonicalTagPattern.exec(tag))
    .filter((match) => match?.[1] === date)
    .reduce((highest, match) => Math.max(highest, Number.parseInt(match[2], 10)), 0) + 1
  if (sequence > 99) throw new Error(`Admin release sequence exhausted for ${date}`)
  const proposedTag = `admin-release${date}-${String(sequence).padStart(2, '0')}`
  const proposedRelease = releases.find((release) => release.tagName === proposedTag)

  const blockers = []
  if (dashboardFiles.length === 0) blockers.push('no apps/admin-dashboard changes since previous published Admin Release')
  if (dashboardCommits.length === 0) blockers.push('no Admin Dashboard commits since previous published Admin Release')
  if (newerTagsWithoutRelease.length > 0) blockers.push('newer canonical Admin tags without Releases must be reconciled first')
  if (allCanonicalTags.includes(proposedTag)) blockers.push(`proposed tag already exists: ${proposedTag}`)
  if (proposedRelease) blockers.push(`proposed Release already exists: ${proposedTag}`)

  return {
    ok: blockers.length === 0,
    repository: expectedRepo,
    checkedAt: new Date().toISOString(),
    source: {
      ref: 'origin/main',
      targetSha: target,
      localBranch: branch,
      localHeadSha: head,
      localHeadMatchesTarget: head === target,
      dirtyPathCount: worktree.length,
    },
    previousPublishedAdminRelease: previousReleaseTag,
    proposedTag,
    dashboardCommits,
    dashboardFiles,
    unrelatedChangedFileCount: allFiles.length - dashboardFiles.length,
    newerTagsWithoutRelease,
    blockers,
  }
}

const main = async () => {
  const command = process.argv[2]
  if (!['preflight', 'audit'].includes(command)) {
    throw new Error('usage: release-state.mjs <preflight|audit>')
  }
  const result = command === 'preflight' ? await preflight() : await audit()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (command === 'preflight' && !result.ok) process.exitCode = 2
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`)
  process.exitCode = 1
})
