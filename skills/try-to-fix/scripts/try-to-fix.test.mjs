import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ensureExtracted, runCommand } from './bundle-utils.mjs'
import {
  loadErrorMessageMappings,
  mapErrorEvidence,
  resolveErrorMessageMapping
} from './error-message-mapper.mjs'
import { analyzeFeedbackBundle } from './log-analyzer.mjs'
import {
  assessEvidenceScope,
  buildSkippedSentryEvidence,
  buildIssueEvidence,
  buildSentryCandidateQueries,
  discoverFeedbackAttachments,
  normalizeIssueComments,
  parseArgs,
  parseFeedbackIssue,
  parseSentryIssueSource,
  resolveSentryTarget,
  shouldCollectSentry
} from './try-to-fix.mjs'

function temporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('CLI requires an explicit issue and supports evidence/report inputs', () => {
  const args = parseArgs([
    '#1234',
    '--user-question',
    '这个好像修复过？',
    '--ci',
    '--output-json',
    '/tmp/evidence.json',
    '--report-file',
    '/tmp/report.md'
  ])
  assert.equal(args.issue, 1234)
  assert.equal(args.userQuestion, '这个好像修复过？')
  assert.equal(args.outputJson, '/tmp/evidence.json')
  assert.equal(args.reportFile, '/tmp/report.md')
  assert.equal('title' in args, false)
  assert.equal('reproPlan' in args, false)
})

test('attachment discovery reads body and comments across trusted hosts', () => {
  const issue = {
    createdAt: '2026-06-18T10:00:00Z',
    body: [
      '**File count:** 2',
      '[cola-logs-2026-06-18.zip](https://cola-feedback.oss-cn-hangzhou.aliyuncs.com/archive?OSSAccessKeyId=key&Signature=sig&Expires=1)',
      '[1.png](https://cola-feedback.oss-cn-hangzhou.aliyuncs.com/image?Signature=sig)'
    ].join('\n'),
    comments: [
      {
        createdAt: '2026-06-18T11:00:00Z',
        body: '[more.zip](https://github.com/user-attachments/files/123/more.zip)'
      }
    ]
  }

  const result = discoverFeedbackAttachments(issue)
  assert.equal(result.expectedFileCount, 2)
  assert.deepEqual(
    result.attachments.map((item) => item.kind),
    ['zip', 'image', 'zip']
  )
  assert.deepEqual(
    result.attachments.map((item) => item.source),
    ['body', 'body', 'comment']
  )
})

test('Sentry issues expose their exact source without requiring feedback metadata', () => {
  const source = parseSentryIssueSource({
    title: '[sentry] chat history appears empty (COLA-MACOS-3KBA)',
    body: [
      '来源：Sentry `COLA-MACOS-3KBA` · https://marswave-t7.sentry.io/issues/7703372756/',
      'Event ID：`3D4AAF5CB4C7434FB79849FCE1FC8D75`',
      '| Project | marswave-t7/cola-macos |',
      '| Short ID | COLA-MACOS-3KBA |'
    ].join('\n')
  })
  assert.deepEqual(source, {
    organization: 'marswave-t7',
    issueId: '7703372756',
    shortId: 'COLA-MACOS-3KBA',
    eventId: '3d4aaf5cb4c7434fb79849fce1fc8d75',
    project: 'cola-macos'
  })
  assert.equal(parseSentryIssueSource({ title: 'Feedback: connection failed', body: '' }), null)
  assert.equal(shouldCollectSentry({ errorBlocks: [] }, source), true)
})

test('attachment discovery ignores arbitrary markdown download hosts', () => {
  const result = discoverFeedbackAttachments({
    body: [
      '[logs.zip](https://attacker.example/logs.zip)',
      '[logs.zip](http://storage.googleapis.com/bucket/logs.zip)'
    ].join('\n'),
    comments: []
  })
  assert.equal(result.attachments.length, 0)
})

test('feedback parser keeps attachment count separate from zip count', () => {
  const feedback = parseFeedbackIssue({
    createdAt: '2026-06-18T10:00:00Z',
    body: [
      '### Description',
      '发送后无响应',
      '---',
      'Version: 1.2.3',
      'Platform: mac',
      '**File count:** 2',
      '[logs.zip](https://storage.googleapis.com/cola/logs.zip)',
      '[screen.png](https://storage.googleapis.com/cola/screen.png)'
    ].join('\n'),
    comments: []
  })
  assert.equal(feedback.attachments.length, 2)
  assert.equal(feedback.attachments.filter((item) => item.kind === 'zip').length, 1)
  assert.equal(feedback.expectedFileCount, 2)
  assert.equal(feedback.createdAt, '2026-06-18T10:00:00Z')
})

test('issue comments redact identities, secrets, and signed URL parameters', () => {
  const [comment] = normalizeIssueComments([
    {
      author: { login: 'maintainer' },
      body: 'dev@example.com token=secret-value-123456 device_id=device-1 desktop-local-subagent-05b484c2 https://bucket.oss-cn-hangzhou.aliyuncs.com/a?OSSAccessKeyId=abc&Signature=def&Expires=1 https://github-production-user-asset-6210df.s3.amazonaws.com/a?X-Amz-Signature=ghi'
    }
  ])
  assert.match(comment.body, /\[redacted-email\]/)
  assert.match(comment.body, /token=\[redacted-secret\]/)
  assert.match(comment.body, /device_id=\[redacted-id\]/)
  assert.doesNotMatch(comment.body, /OSSAccessKeyId=abc/)
  assert.doesNotMatch(comment.body, /Signature=def/)
  assert.doesNotMatch(comment.body, /X-Amz-Signature=ghi/)
  assert.doesNotMatch(comment.body, /desktop-local-subagent-05b484c2/)
  assert.doesNotMatch(comment.body, /bucket\.oss-cn-hangzhou\.aliyuncs\.com/)
  assert.match(comment.body, /\[redacted-attachment-url\]/)
})

test('issue evidence preserves the full redacted body and every complete comment', () => {
  const longComment = `root cause: ${'x'.repeat(2400)} final conclusion`
  const evidence = buildIssueEvidence({
    number: 4449,
    title: 'plugin disappears after restart',
    body: [
      'Clone to /tmp and install the plugin through a symlink.',
      'Email: dev@example.com',
      '[logs.zip](https://storage.googleapis.com/private/logs.zip?X-Goog-Signature=secret)'
    ].join('\n'),
    createdAt: '2026-08-18T12:15:13Z',
    state: 'OPEN',
    comments: [
      { author: { login: 'maintainer' }, body: longComment, createdAt: '2026-08-18T13:00:00Z' },
      { author: { login: 'reviewer' }, body: 'second comment' }
    ]
  })
  assert.match(evidence.body, /Clone to \/tmp/)
  assert.match(evidence.body, /\[redacted-email\]/)
  assert.match(evidence.body, /\[redacted-attachment-url\]/)
  assert.doesNotMatch(evidence.body, /storage\.googleapis\.com/)
  assert.equal(evidence.comments.length, 2)
  assert.equal(evidence.comments[0].body, longComment)
  assert.match(evidence.comments[0].body, /final conclusion$/)
})

test('mobile feedback uses cola-mobile release from bundle env', () => {
  const target = resolveSentryTarget({
    feedback: { platform: 'android', version: '0.1.0' },
    logAnalysis: { envInfo: { appVersion: '0.1.0+1', buildChannel: 'staging' } },
    project: 'cola-macos'
  })
  assert.equal(target.project, 'cola-mobile')
  assert.equal(target.environment, 'staging')
  assert.deepEqual(target.releases, ['cola-mobile@0.1.0+1', 'cola-mobile@0.1.0'])
})

test('desktop feedback prefers bundle version while keeping body version as a recall route', () => {
  const target = resolveSentryTarget({
    feedback: { platform: 'mac', version: '1.0.9' },
    logAnalysis: { envInfo: { appVersion: '0.1.0+1' } },
    project: 'cola-macos'
  })
  assert.equal(target.project, 'cola-macos')
  assert.equal(target.version, '0.1.0+1')
  assert.deepEqual(target.releases, [
    'cola-server@0.1.0+1',
    'cola@0.1.0+1',
    'cola-server@1.0.9',
    'cola@1.0.9'
  ])
})

test('evidence scope distinguishes runtime-backed feedback from issue-only reports', () => {
  assert.deepEqual(
    assessEvidenceScope({ feedback: {}, downloads: [], logAnalysis: {}, sentry: { releases: [] } }),
    { mode: 'issue-and-code-only', anchorQuality: 'none', anchorReasons: [] }
  )
  const runtime = assessEvidenceScope({
    feedback: { deviceId: 'private-device' },
    downloads: [{ failed: false, duplicateOf: null }],
    logAnalysis: {
      selectedLogs: [{ relativePath: 'logs/cola-2026-08-19.log' }],
      errorTime: null,
      errorPhrases: []
    },
    sentry: { releases: ['cola-server@1.3.3'] }
  })
  assert.equal(runtime.mode, 'runtime-backed')
  assert.equal(runtime.anchorQuality, 'strong')
  assert.deepEqual(runtime.anchorReasons, [
    'validated-attachment',
    'selected-log',
    'identity',
    'release'
  ])
  const sourceSentry = assessEvidenceScope({
    feedback: {},
    downloads: [],
    logAnalysis: {},
    sentry: { source: { exact: true }, releases: [] }
  })
  assert.deepEqual(sourceSentry, {
    mode: 'runtime-backed',
    anchorQuality: 'strong',
    anchorReasons: ['direct-sentry-source']
  })
})

test('Sentry candidate retrieval uses several recall routes without unresolved gating', () => {
  const routes = buildSentryCandidateQueries({
    environment: 'production',
    deviceId: 'device-1',
    userId: 'user-1',
    releases: ['cola@1.2.3', 'cola-server@1.2.3'],
    errorPhrases: ['Server connection lost'],
    mappedErrors: [{ matchedValue: 'rate limit', rawError: 'rate limit exceeded' }],
    timeWindow: {
      start: '2026-06-22T15:52:00.000Z',
      end: '2026-06-22T17:52:00.000Z'
    }
  })
  assert.ok(routes.some((route) => route.reason === 'environment-baseline'))
  assert.ok(routes.some((route) => route.reason === 'device'))
  assert.ok(routes.some((route) => route.reason === 'user'))
  assert.ok(routes.some((route) => route.reason === 'release'))
  assert.ok(routes.some((route) => route.reason === 'error-phrase'))
  assert.ok(routes.some((route) => route.reason === 'error-token'))
  assert.ok(routes.some((route) => route.reason === 'time-overlap'))
  assert.ok(routes.some((route) => route.reason === 'resolved-environment-history'))
  assert.equal(
    routes.some((route) => route.query.includes('is:unresolved')),
    false
  )
})

test('generic Sentry retrieval requires a log error anchor and exposes an explicit skipped result', () => {
  assert.equal(shouldCollectSentry({ errorBlocks: [] }), false)
  assert.equal(shouldCollectSentry({ errorBlocks: [{ source: 'keyword-error' }] }), false)
  assert.equal(shouldCollectSentry({ errorBlocks: [{ source: 'explicit-error' }] }), true)
  assert.equal(
    shouldCollectSentry({
      errorBlocks: [{ source: 'keyword-error' }, { source: 'explicit-error' }]
    }),
    true
  )
  assert.deepEqual(
    buildSkippedSentryEvidence({
      project: 'cola-macos',
      environment: 'production',
      releases: ['cola-server@1.4.1']
    }),
    {
      skipped: true,
      skipReason: 'no-explicit-log-error',
      project: 'cola-macos',
      environment: 'production',
      releases: ['cola-server@1.4.1'],
      timeWindow: null,
      retrievalComplete: null,
      candidateCount: 0,
      eventCheckedCandidateCount: 0,
      candidateQueries: [],
      candidates: [],
      errors: []
    }
  )
})

test('error mapping prefers exact rules and then ordered keyword rules', () => {
  const config = {
    available: true,
    rules: [
      {
        id: 'first',
        exact: ['exact failure'],
        keywords: ['overlap'],
        messages: { 'zh-CN': '第一条', en: 'first' },
        actions: ['retry'],
        sources: []
      },
      {
        id: 'second',
        exact: [],
        keywords: ['overlap', 'quota'],
        messages: { 'zh-CN': '第二条' },
        actions: ['open_plan_settings'],
        sources: []
      }
    ]
  }
  assert.equal(resolveErrorMessageMapping('EXACT FAILURE', config)?.ruleId, 'first')
  assert.equal(resolveErrorMessageMapping('an overlap happened', config)?.ruleId, 'first')
  assert.equal(resolveErrorMessageMapping('quota exceeded', config)?.ruleId, 'second')
  assert.deepEqual(
    mapErrorEvidence(['quota exceeded', 'quota exceeded'], config).map((item) => item.ruleId),
    ['second']
  )
})

test('error mapping loader reads the JSON contract and preserves source evidence', async () => {
  const root = temporaryDirectory('try-to-fix-mapping-')
  try {
    const configPath = path.join(
      root,
      'apps',
      'desktop',
      'src',
      'renderer',
      'config',
      'error-message-mappings.json'
    )
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        rules: [
          {
            id: 'rate-limit',
            keywords: ['rate limit'],
            messages: { 'zh-CN': '请求过于频繁' },
            actions: ['retry'],
            sources: [{ url: 'https://marswave-t7.sentry.io/issues/123456/', observed: 7 }]
          }
        ]
      })
    )
    const config = await loadErrorMessageMappings({ repoRoot: root })
    const mapping = resolveErrorMessageMapping('rate limit exceeded', config)
    assert.equal(config.available, true)
    assert.equal(config.configPath, 'apps/desktop/src/renderer/config/error-message-mappings.json')
    assert.equal(mapping.userMessage, '请求过于频繁')
    assert.equal(mapping.sources[0].observed, 7)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('log analysis reads all same-date logs and prefers the feedback platform first', async () => {
  const root = temporaryDirectory('try-to-fix-mixed-log-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      '[2026-06-22 16:52:09.421] [ERROR] Desktop error\n'
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-mobile-2026-06-22.log'),
      '[2026-06-22 16:52:09.421] [FATAL] Mobile error\n'
    )
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:51:58.124Z', platform: 'android' }
    })
    assert.equal(analysis.selectedLogs.length, 2)
    assert.equal(analysis.selectedLogs[0].kind, 'mobile')
    assert.equal(analysis.inventory.mainLogs, 2)
    assert.match(analysis.status, /完整读取 2 个/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('log analysis leaves multiple narrative dates to agent interpretation', async () => {
  const root = temporaryDirectory('try-to-fix-narrative-dates-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-08-28.log'),
      '[2026-08-28 06:00:00.000] [ERROR] contextual upgrade error\n'
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-08-29.log'),
      '[2026-08-29 06:06:00.000] [ERROR] narrated incident error\n'
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-08-30.log'),
      '[2026-08-30 10:00:00.000] [INFO] feedback submitted\n'
    )
    fs.writeFileSync(
      path.join(root, 'trace-incident.jsonl'),
      '{"ts":"2026/8/29 14:10:00","type":"tool_start"}\n'
    )

    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: {
        createdAt: '2026-08-30T10:00:01Z',
        platform: 'mac',
        description: '2026年8月28日升级，2026年8月29日14:06 充值后出现扣费。'
      }
    })

    assert.equal(analysis.logRelativePath, 'logs/cola-2026-08-30.log')
    assert.equal(analysis.selectedBy, 'feedback-date')
    assert.equal(analysis.errorBlocks.length, 0)
    assert.equal(analysis.supplementalEvidence.length, 0)
    assert.match(analysis.status, /反馈日期 2026-08-30/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('log analysis discloses when it falls back to the nearest dated log', async () => {
  const root = temporaryDirectory('try-to-fix-nearest-log-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-08-29.log'),
      '[2026-08-29 06:06:00.000] [INFO] request accepted\n'
    )

    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-08-30T10:00:01Z', platform: 'mac' }
    })

    assert.equal(analysis.selectedBy, 'nearest-feedback-date')
    assert.equal(analysis.selectedLogs[0].dateKey, '2026-08-29')
    assert.match(analysis.status, /未找到反馈日期 2026-08-30 日志，已读取最近的 2026-08-29 日志/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('supplemental evidence is capped at one hundred filtered records', async () => {
  const root = temporaryDirectory('try-to-fix-supplemental-cap-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      '[2026-06-22 16:47:18.532] [INFO] request accepted\n'
    )
    for (let index = 0; index < 101; index += 1) {
      fs.writeFileSync(
        path.join(root, `trace-failure-${String(index).padStart(3, '0')}.jsonl`),
        `${JSON.stringify({ ts: '2026/6/20 12:00:00', type: 'error' })}\n`
      )
    }

    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:52:00Z', platform: 'mac' }
    })

    assert.equal(analysis.supplementalEvidence.length, 100)
    assert.ok(analysis.supplementalEvidence.every((item) => item.selectedBy === 'failure-signal'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('desktop log timestamps stay in UTC and benign INFO close events are not errors', async () => {
  const root = temporaryDirectory('try-to-fix-desktop-utc-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-08-19.log'),
      [
        '[2026-08-19 01:58:57.800] [INFO] [mobile-relay] replaced socket closed',
        '[2026-08-19 01:58:58.312] [INFO] [mobile-relay] connected',
        '[2026-08-19 02:10:33.002] [ERROR] actual failure'
      ].join('\n')
    )
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-08-19T02:10:34Z', platform: 'mac' }
    })
    assert.equal(analysis.errorBlocks.length, 1)
    assert.equal(analysis.errorBlocks[0].primaryLine.includes('replaced socket closed'), false)
    assert.equal(analysis.errorTime, '2026-08-19T02:10:33.002Z')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('semantic feedback without a real error falls back to feedback time', async () => {
  const root = temporaryDirectory('try-to-fix-semantic-feedback-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-08-19.log'),
      [
        '[2026-08-19 01:58:57.800] [INFO] [mobile-relay] replaced socket closed',
        '[2026-08-19 01:58:58.312] [INFO] [mobile-relay] connected'
      ].join('\n')
    )
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-08-19T02:58:36Z', platform: 'mac' }
    })
    assert.equal(analysis.errorBlocks.length, 0)
    assert.equal(analysis.errorTime, null)
    assert.match(analysis.status, /没有找到明确 ERROR/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('turn lifecycle keeps an aborted prompt separate from the next still-running prompt', async () => {
  const root = temporaryDirectory('try-to-fix-turn-lifecycle-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-09-04.log'),
      [
        '[2026-09-04 13:28:10.276] [INFO] [agent] prompt start scope=desktop:local busy=false text="你现在接口好了么"',
        '[2026-09-04 13:28:10.581] [INFO] [agent] session ready promptId=prompt-first newSession=true provider=cola model=model-a',
        '[2026-09-04 13:28:10.583] [INFO] [agent] session.prompt() firing promptId=prompt-first',
        '[2026-09-04 13:30:26.013] [INFO] [ipc] agent:abort scope=desktop:local',
        '[2026-09-04 13:30:26.026] [INFO] [agent] message-stopped promptId=prompt-first',
        '[2026-09-04 13:30:26.048] [INFO] [agent] session.prompt() resolved promptId=prompt-first',
        '[2026-09-04 13:30:33.834] [INFO] [agent] prompt start scope=desktop:local busy=false text="嗨"',
        '[2026-09-04 13:30:33.906] [INFO] [agent] session ready promptId=prompt-second newSession=false provider=cola model=model-a',
        '[2026-09-04 13:30:33.907] [INFO] [agent] session.prompt() firing promptId=prompt-second'
      ].join('\n')
    )

    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-09-04T13:33:20Z', platform: 'mac' }
    })

    assert.equal(analysis.turnLifecycles.length, 2)
    assert.deepEqual(
      analysis.turnLifecycles.map((turn) => ({
        promptText: turn.promptText,
        outcome: turn.outcome,
        durationMs: turn.durationMs
      })),
      [
        { promptText: '你现在接口好了么', outcome: 'aborted', durationMs: 135_750 },
        { promptText: '嗨', outcome: 'running', durationMs: null }
      ]
    )
    assert.equal(analysis.turnLifecycles[0].abortSource, 'desktop-ipc')
    assert.notEqual(analysis.turnLifecycles[0].promptFingerprint, null)
    assert.doesNotMatch(JSON.stringify(analysis.turnLifecycles), /prompt-first|prompt-second/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('trace and session evidence is selected by hashed correlation without exposing content', async () => {
  const root = temporaryDirectory('try-to-fix-correlated-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      [
        '[2026-06-22 16:47:18.532] [INFO] [agent] prompt start sessionId=session-secret-1 text=private prompt',
        '[2026-06-22 16:52:09.421] [ERROR] request timeout sessionId=session-secret-1'
      ].join('\n')
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'trace-session-secret-1.jsonl'),
      [
        '{"type":"tool_start","sessionId":"session-secret-1"}',
        '{"type":"error","sessionId":"session-secret-1","message":"private trace detail"}'
      ].join('\n')
    )
    fs.writeFileSync(
      path.join(root, 'sessions', 'session-secret-1.json'),
      '{"sessionId":"session-secret-1","role":"assistant","content":"private session content"}'
    )
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:52:00Z', platform: 'mac' }
    })
    assert.equal(analysis.inventory.traces, 1)
    assert.equal(analysis.inventory.sessions, 1)
    assert.ok(analysis.supplementalEvidence.some((item) => item.kind === 'trace'))
    assert.ok(analysis.supplementalEvidence.some((item) => item.kind === 'session'))
    const serialized = JSON.stringify(analysis.supplementalEvidence)
    assert.doesNotMatch(serialized, /session-secret-1/)
    assert.doesNotMatch(serialized, /private trace detail|private session content/)
    assert.doesNotMatch(analysis.rawErrorLog, /private prompt/)
    assert.match(analysis.userPath, /内容已省略/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('usage evidence exposes only phase metrics and keeps unavailable values null', async () => {
  const root = temporaryDirectory('try-to-fix-usage-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      '[2026-06-22 16:52:09.421] [ERROR] quota exceeded sessionId=session-private-1\n'
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'trace-session-private-1.jsonl'),
      [
        {
          type: 'full_run',
          sessionKey: 'session-private-1',
          startTime: Date.parse('2026-06-22T16:50:00.000Z'),
          endTime: Date.parse('2026-06-22T16:51:00.000Z'),
          messages: [
            {
              role: 'assistant',
              provider: 'anthropic',
              model: 'claude-test',
              startTime: Date.parse('2026-06-22T16:50:05.000Z'),
              endTime: Date.parse('2026-06-22T16:50:55.000Z'),
              stopReason: 'toolUse',
              usage: {
                input: 12_000,
                output: 800,
                cacheRead: 6_000,
                cacheWrite: 400,
                cost: { total: 0.42 }
              },
              content: [
                { type: 'text', text: 'private assistant content' },
                { type: 'toolCall', name: 'bash', arguments: { token: 'private-secret' } }
              ]
            },
            {
              role: 'assistant',
              provider: 'anthropic',
              model: 'claude-test',
              stopReason: 'error',
              content: [{ type: 'text', text: 'another private response' }]
            }
          ]
        }
      ]
        .map(JSON.stringify)
        .join('\n')
    )

    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:52:00Z', platform: 'mac' }
    })

    assert.equal(analysis.usagePhases.length, 2)
    assert.deepEqual(
      {
        provider: analysis.usagePhases[0].provider,
        model: analysis.usagePhases[0].model,
        responseModel: analysis.usagePhases[0].responseModel,
        toolCallCount: analysis.usagePhases[0].toolCallCount,
        inputTokens: analysis.usagePhases[0].inputTokens,
        outputTokens: analysis.usagePhases[0].outputTokens,
        cacheReadTokens: analysis.usagePhases[0].cacheReadTokens,
        cacheWriteTokens: analysis.usagePhases[0].cacheWriteTokens,
        cost: analysis.usagePhases[0].cost
      },
      {
        provider: 'anthropic',
        model: 'claude-test',
        responseModel: null,
        toolCallCount: 1,
        inputTokens: 12_000,
        outputTokens: 800,
        cacheReadTokens: 6_000,
        cacheWriteTokens: 400,
        cost: 0.42
      }
    )
    assert.equal(analysis.usagePhases[1].inputTokens, null)
    assert.equal(analysis.usagePhases[1].cost, null)
    const serialized = JSON.stringify(analysis.usagePhases)
    assert.doesNotMatch(serialized, /session-private-1|private assistant|private-secret|bash/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('usage evidence merges session and trace across a model switch without duplicates', async () => {
  const root = temporaryDirectory('try-to-fix-model-switch-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.mkdirSync(path.join(root, 'sessions', 'desktop-local'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      [
        '[2026-06-22 16:52:00.000] [INFO] WS Bridge → request method=model.setTier id=request-1',
        '[2026-06-22 16:54:00.000] [INFO] [model-switch] same-session scope=desktop:local source=cola/model-paid sourceApi=openai-completions target=cola/model-free targetApi=openai-completions sessionId=session-switch-1',
        '[2026-06-22 16:55:00.000] [ERROR] DAILY_BALANCE_LIMIT_EXCEEDED sessionId=session-switch-1'
      ].join('\n')
    )

    const paidMessage = {
      role: 'assistant',
      provider: 'cola',
      model: 'model-paid',
      responseModel: 'gemini-paid',
      responseId: 'response-paid-private',
      startTime: Date.parse('2026-06-22T16:50:00.000Z'),
      endTime: Date.parse('2026-06-22T16:50:30.000Z'),
      timestamp: Date.parse('2026-06-22T16:50:30.000Z'),
      stopReason: 'error',
      usage: { input: 10_000, output: 500, cacheRead: 2_000, cost: { total: 0.3 } },
      content: []
    }
    const freeMessage = {
      role: 'assistant',
      provider: 'cola',
      model: 'model-free',
      responseModel: 'gemini-free',
      responseId: 'response-free-private',
      startTime: Date.parse('2026-06-22T16:56:00.000Z'),
      endTime: Date.parse('2026-06-22T16:56:30.000Z'),
      timestamp: Date.parse('2026-06-22T16:56:30.000Z'),
      stopReason: 'stop',
      usage: { input: 3_000, output: 700, cacheRead: 1_000, cost: { total: 0 } },
      content: []
    }
    fs.writeFileSync(
      path.join(root, 'sessions', 'desktop-local', 'active.jsonl'),
      [paidMessage, freeMessage]
        .map((message) =>
          JSON.stringify({ type: 'message', sessionId: 'session-switch-1', message })
        )
        .join('\n')
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'trace-desktop-local.jsonl'),
      `${JSON.stringify({
        type: 'full_run',
        sessionKey: 'session-switch-1',
        startTime: freeMessage.startTime,
        endTime: freeMessage.endTime,
        messages: [freeMessage]
      })}\n`
    )

    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:57:00Z', platform: 'mac' }
    })

    assert.deepEqual(
      analysis.usagePhases.map((phase) => ({
        model: phase.model,
        responseModel: phase.responseModel,
        cost: phase.cost
      })),
      [
        { model: 'model-paid', responseModel: 'gemini-paid', cost: 0.3 },
        { model: 'model-free', responseModel: 'gemini-free', cost: 0 }
      ]
    )
    assert.deepEqual(analysis.modelTransitions, [
      {
        occurredAt: '2026-06-22T16:54:00.000Z',
        sourceModel: 'cola/model-paid',
        targetModel: 'cola/model-free',
        selectionEventAt: '2026-06-22T16:52:00.000Z'
      }
    ])
    assert.doesNotMatch(
      JSON.stringify({
        usagePhases: analysis.usagePhases,
        modelTransitions: analysis.modelTransitions
      }),
      /response-(?:paid|free)-private/
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('silent stalls use trace timestamps when the main log has no correlation id', async () => {
  const root = temporaryDirectory('try-to-fix-time-trace-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      '[2026-06-22 16:47:18.532] [INFO] request accepted\n'
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'trace-private-name.jsonl'),
      '{"ts":"2026/6/23 00:51:30","type":"system_prompt","systemPrompt":"private"}\n'
    )
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:52:00Z', platform: 'mac' }
    })
    assert.equal(analysis.inventory.traces, 1)
    assert.equal(analysis.supplementalEvidence.length, 1)
    assert.equal(analysis.supplementalEvidence[0].selectedBy, 'time-window')
    assert.equal(analysis.supplementalEvidence[0].lastTimestamp, '2026-06-22T16:51:30.000Z')
    assert.doesNotMatch(
      JSON.stringify(analysis.supplementalEvidence),
      /private-name|systemPrompt|private/
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('supplemental evidence prefers epoch timing over trace wall-clock text', async () => {
  const root = temporaryDirectory('try-to-fix-epoch-trace-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      '[2026-06-22 16:47:18.532] [INFO] request accepted\n'
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'trace-with-epoch.jsonl'),
      `${JSON.stringify({
        ts: '2026/6/24 00:51:30',
        startTime: Date.parse('2026-06-22T16:51:00.000Z'),
        endTime: Date.parse('2026-06-22T16:51:30.000Z'),
        type: 'system_prompt',
        systemPrompt: 'private'
      })}\n`
    )

    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:52:00Z', platform: 'mac' }
    })

    assert.equal(analysis.supplementalEvidence.length, 1)
    assert.equal(analysis.supplementalEvidence[0].lastTimestamp, '2026-06-22T16:51:30.000Z')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('correlation discovery keeps IDs after the first 80 entries', async () => {
  const root = temporaryDirectory('try-to-fix-many-correlations-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    const sessionIds = Array.from(
      { length: 81 },
      (_value, index) => `session-${String(index).padStart(3, '0')}`
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      sessionIds
        .map(
          (sessionId, index) =>
            `[2026-06-22 16:${String(index % 60).padStart(2, '0')}:00.000] [INFO] prompt start sessionId=${sessionId}`
        )
        .join('\n')
    )
    fs.writeFileSync(
      path.join(root, 'logs', 'trace-last-session.jsonl'),
      `{"type":"tool_start","sessionId":"${sessionIds.at(-1)}"}\n`
    )

    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:59:00Z', platform: 'mac' }
    })

    assert.equal(analysis.correlations.length, 81)
    assert.ok(
      analysis.supplementalEvidence.some(
        (item) => item.selectedBy === 'correlation' && item.matchedCorrelations.length === 1
      )
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('silent stalls still pull correlated session structure without an ERROR line', async () => {
  const root = temporaryDirectory('try-to-fix-silent-stall-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-2026-06-22.log'),
      '[2026-06-22 16:47:18.532] [INFO] prompt start sessionId=session-quiet-1\n'
    )
    fs.writeFileSync(
      path.join(root, 'sessions', 'quiet.jsonl'),
      '{"type":"tool_start","sessionId":"session-quiet-1"}\n'
    )
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:52:00Z', platform: 'mac' }
    })
    assert.equal(analysis.errorBlocks.length, 0)
    assert.equal(analysis.supplementalEvidence.length, 1)
    assert.equal(analysis.supplementalEvidence[0].selectedBy, 'correlation')
    assert.ok(analysis.supplementalEvidence[0].signals.includes('tool_start'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('errorTime follows the event nearest feedback time instead of diagnostic score', async () => {
  const root = temporaryDirectory('try-to-fix-error-time-')
  try {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'logs', 'cola-mobile-2026-06-22.log'),
      [
        '[2026-06-22 12:00:00.000] [ERROR] Server connection lost',
        '[2026-06-22 16:51:59.000] [ERROR] request timeout'
      ].join('\n')
    )
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: '2026-06-22T16:52:00Z', platform: 'android' }
    })
    assert.equal(analysis.errorTime, '2026-06-22T16:51:59.000Z')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('extraction cache is reused only for the same zip hash', async () => {
  const root = temporaryDirectory('try-to-fix-zip-cache-')
  try {
    const source = path.join(root, 'source')
    const extractRoot = path.join(root, 'extracted')
    const zipPath = path.join(root, 'bundle.zip')
    fs.mkdirSync(path.join(source, 'logs'), { recursive: true })
    const logPath = path.join(source, 'logs', 'cola-2026-06-22.log')
    fs.writeFileSync(logPath, 'first\n')
    await runCommand('zip', ['-qr', zipPath, 'logs'], { cwd: source })
    const first = await ensureExtracted(zipPath, extractRoot, '')
    const second = await ensureExtracted(zipPath, extractRoot, '')
    assert.equal(first.reused, false)
    assert.equal(second.reused, true)
    assert.equal(first.sha256, second.sha256)

    fs.writeFileSync(logPath, 'second\n')
    fs.rmSync(zipPath)
    await runCommand('zip', ['-qr', zipPath, 'logs'], { cwd: source })
    const third = await ensureExtracted(zipPath, extractRoot, '')
    assert.equal(third.reused, false)
    assert.notEqual(third.sha256, first.sha256)
    assert.equal(
      fs.readFileSync(path.join(extractRoot, 'logs', 'cola-2026-06-22.log'), 'utf8'),
      'second\n'
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
