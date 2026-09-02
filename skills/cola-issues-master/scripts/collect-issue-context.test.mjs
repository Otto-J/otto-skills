import assert from 'node:assert/strict'
import test from 'node:test'

import {
  containsSensitiveQuery,
  discoverAttachments,
  extensionForImage,
  parseIssueNumber,
  redactText,
  trustedAttachmentUrl
} from './collect-issue-context.mjs'

test('accepts only marswaveai/cola issue references', () => {
  assert.equal(parseIssueNumber('4995'), 4995)
  assert.equal(parseIssueNumber('https://github.com/marswaveai/cola/issues/4995'), 4995)
  assert.throws(
    () => parseIssueNumber('https://github.com/marswaveai/other/issues/4995'),
    /Only github\.com\/marswaveai\/cola/
  )
})

test('discovers trusted attachments without retaining them in redacted text', () => {
  const imageUrl =
    'https://bucket.oss-ap-southeast-1.aliyuncs.com/report.png?OSSAccessKeyId=private&Signature=secret'
  const zipUrl = 'https://storage.googleapis.com/example/report.zip?token=private'
  const body = `![screenshot](${imageUrl})\n[logs](${zipUrl})`
  const attachments = discoverAttachments(body, 'body', '2026-09-02T00:00:00Z')

  assert.deepEqual(
    attachments.map(({ kind, source }) => ({ kind, source })),
    [
      { kind: 'image', source: 'body' },
      { kind: 'zip', source: 'body' }
    ]
  )
  assert.equal(redactText(body).includes('OSSAccessKeyId'), false)
  assert.equal(redactText(body).includes('Signature='), false)
  assert.equal(redactText(body).match(/\[private-attachment-url\]/g)?.length, 2)
})

test('redacts identity fields and credentials', () => {
  const fakeApiToken = ['sk', '1234567890abcdefghijkl'].join('-')
  const input = [
    'Report ID: report-123',
    '**User ID:** `user-123`',
    '- **Device:** device-123',
    '__Device ID__: device-id-123',
    '* **Email:** person@example.com',
    'Authorization: Bearer abc.def.ghi',
    `token: ${fakeApiToken}`
  ].join('\n')
  const output = redactText(input)

  assert.equal(output.includes('report-123'), false)
  assert.equal(output.includes('user-123'), false)
  assert.equal(output.includes('device-123'), false)
  assert.equal(output.includes('device-id-123'), false)
  assert.equal(output.includes('person@example.com'), false)
  assert.equal(output.includes('abc.def.ghi'), false)
  assert.equal(output.includes(fakeApiToken), false)
})

test('redacts sensitive fields inside common Markdown containers', () => {
  const input = [
    '1. **User ID:** ordered-user',
    '> **Device:** quoted-device',
    '- [ ] **Report ID:** task-report',
    '| **User ID** | table-user |'
  ].join('\n')
  const output = redactText(input)

  for (const secret of ['ordered-user', 'quoted-device', 'task-report', 'table-user']) {
    assert.equal(output.includes(secret), false)
  }
  assert.equal(output.match(/\[redacted\]/g)?.length, 4)
})

test('redacts signed URLs on any host while preserving ordinary public URLs', () => {
  const aws = 'https://example.com/file?X-Amz-Credential=private&X-Amz-Signature=secret'
  const azure = 'https://files.example.net/blob?sv=2026-01-01&sig=secret'
  const generic = 'https://downloads.example.org/file?signature=secret&expires=1234'
  const publicUrl = 'https://github.com/marswaveai/cola/issues/4995'
  const output = redactText([aws, azure, generic, publicUrl].join('\n'))

  assert.equal(output.match(/\[private-attachment-url\]/g)?.length, 3)
  assert.equal(output.includes(publicUrl), true)
  assert.equal(containsSensitiveQuery(aws), true)
  assert.equal(containsSensitiveQuery(publicUrl), false)
})

test('recognizes image content from magic bytes', () => {
  assert.equal(extensionForImage(Buffer.from([0x89, 0x50, 0x4e, 0x47])), '.png')
  assert.equal(extensionForImage(Buffer.from([0xff, 0xd8, 0xff])), '.jpg')
  assert.equal(extensionForImage(Buffer.from('GIF89a')), '.gif')
  assert.equal(extensionForImage(Buffer.from('not an image')), '')
})

test('rejects untrusted attachment hosts', () => {
  assert.equal(trustedAttachmentUrl('https://storage.googleapis.com/example/a.png'), true)
  assert.equal(trustedAttachmentUrl('https://example.com/a.png'), false)
  assert.equal(trustedAttachmentUrl('http://storage.googleapis.com/example/a.png'), false)
})
