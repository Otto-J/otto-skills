---
name: ijustcc-rss-reader
description: Manage the private ijust.cc RSS reader through its Bearer-authenticated Admin API. Use when the user wants an agent to list, add, edit, refresh, or delete RSS subscriptions; import or export OPML; inspect feeds or article content; query unread, read, or starred entries; mark articles or one feed read/unread; or debug `/api/admin/rss/*` behavior. Supports production and local development targets with strict confirmation for destructive or bulk operations.
---

# iJust.cc RSS Reader

Operate the private RSS service with `curl`. Prefer structured JSON responses and keep the saved Admin JWT out of output and command logs.

## Establish the target and token

Use production unless the user explicitly asks for local development:

```bash
RSS_ORIGIN="${IJUSTCC_API_BASE:-https://ijust.cc}"
RSS_API="$RSS_ORIGIN/api/admin/rss"
RSS_TOKEN_FILE="$HOME/.ijustcc/token"
test -r "$RSS_TOKEN_FILE"
RSS_TOKEN="$(< "$RSS_TOKEN_FILE")"
```

- State the selected origin before every write operation.
- Never print, paste, log, or commit `RSS_TOKEN`.
- Send `Authorization: Bearer $RSS_TOKEN` on every request.
- If the token is missing or a request returns `401`, stop and ask the user to run `ijustcc-admin-api/scripts/auth.mjs`; do not request their password in chat.
- For local use, set `IJUSTCC_API_BASE=http://127.0.0.1:4323` only when the user asks to operate the local reader.

## Follow the safe operation sequence

1. Resolve the target origin.
2. List feeds before translating a title into an ID.
3. Read the exact feed or entry before changing it.
4. Report the resolved title, ID, current state, and intended change.
5. Obtain explicit confirmation for feed deletion or feed-wide read-state changes.
6. Execute one scoped mutation and read it back.

Listing, reading, searching, exporting, and refreshing are safe read-oriented operations. Adding/importing subscriptions and changing a single entry may proceed when directly requested. Do not infer a broader mutation from a read request.

## Inspect feeds and articles

List feeds with counts:

```bash
curl --fail-with-body -sS "$RSS_API/feeds" \
  -H "Authorization: Bearer $RSS_TOKEN" | jq '.feeds'
```

For an aggregate overview without dumping every feed:

```bash
curl --fail-with-body -sS "$RSS_API/feeds" \
  -H "Authorization: Bearer $RSS_TOKEN" | \
  jq '{feedCount: (.feeds | length), totalUnread: ([.feeds[].unreadCount] | add // 0), totalStarred: ([.feeds[].starredCount] | add // 0)}'
```

Resolve a feed ID by listing feeds; do not guess IDs. Then read one feed:

```bash
curl --fail-with-body -sS "$RSS_API/feeds/$RSS_FEED_ID" \
  -H "Authorization: Bearer $RSS_TOKEN" | jq '.feed'
```

Query entries. `state` is `all`, `read`, `unread`, or `starred`; `limit` is `1..300`; `offset` is non-negative. Add `q` for search.

```bash
curl --fail-with-body -sS \
  "$RSS_API/entries?feedId=$RSS_FEED_ID&state=unread&limit=100&offset=0" \
  -H "Authorization: Bearer $RSS_TOKEN" | jq
```

Omit `feedId` only when the user asks for entries across all feeds. Read article content with:

```bash
curl --fail-with-body -sS "$RSS_API/entries/$RSS_ENTRY_ID" \
  -H "Authorization: Bearer $RSS_TOKEN" | jq '.entry'
```

## Manage subscriptions

Add a feed:

```bash
curl --fail-with-body -sS -X POST "$RSS_API/feeds" \
  -H "Authorization: Bearer $RSS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/feed.xml","title":"Example","category":"Tech"}' | jq
```

Edit only the requested fields after showing the current feed and intended values:

```bash
curl --fail-with-body -sS -X PATCH "$RSS_API/feeds/$RSS_FEED_ID" \
  -H "Authorization: Bearer $RSS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Example Notes","category":"Reading"}' | jq '.feed'
```

Refresh one resolved feed, or refresh all only when the user clearly asks for all feeds:

```bash
curl --fail-with-body -sS -X POST "$RSS_API/feeds/$RSS_FEED_ID/refresh" \
  -H "Authorization: Bearer $RSS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}' | jq

curl --fail-with-body -sS -X POST "$RSS_API/refresh" \
  -H "Authorization: Bearer $RSS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}' | jq
```

Delete only after listing feeds and receiving confirmation for the exact title and ID. Deletion also removes that feed's locally stored articles:

```bash
curl --fail-with-body -sS -X DELETE "$RSS_API/feeds/$RSS_FEED_ID" \
  -H "Authorization: Bearer $RSS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}' | jq
```

## Manage article consumption state

Change one entry when directly requested:

```bash
curl --fail-with-body -sS -X PATCH "$RSS_API/entries/$RSS_ENTRY_ID" \
  -H "Authorization: Bearer $RSS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"read":true,"starred":false}' | jq '.entry'
```

For a feed-wide change, first report its title, ID, `totalCount`, `unreadCount`, and direction; obtain explicit confirmation. Then use:

```bash
curl --fail-with-body -sS -X PATCH "$RSS_API/feeds/$RSS_FEED_ID/entries" \
  -H "Authorization: Bearer $RSS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"read":true}' | jq
```

Use `{"read":false}` to mark that feed unread. Never use the legacy global `POST /mark-read` route unless the user explicitly asks to change every feed.

## Import and export OPML

Before import, resolve the absolute file path, verify it is readable, report its size and approximate `xmlUrl` count, and confirm production versus local target. Import with NDJSON progress:

```bash
wc -c "$RSS_OPML_FILE"
rg -o 'xmlUrl=' "$RSS_OPML_FILE" | wc -l
jq -Rs '{opml:.}' "$RSS_OPML_FILE" | \
  curl --fail-with-body -sS -N -X POST "$RSS_API/import" \
    -H "Authorization: Bearer $RSS_TOKEN" \
    -H 'Accept: application/x-ndjson' \
    -H 'Content-Type: application/json' \
    --data-binary @-
```

Interpret events as follows:

- `saved`: the subscription is already persisted.
- `refreshed`: article refresh succeeded.
- `failed`: that feed failed to save or refresh; remaining feeds continue.
- `complete`: the whole import finished.
- `fatal`: the stream failed; previously emitted `saved` items remain persisted.

Do not blindly retry an import after a timeout or broken connection. List feeds first because progressive imports may already have written subscriptions.

Export to a new absolute path. If the path exists, ask before overwriting it:

```bash
curl --fail-with-body -sS "$RSS_API/export" \
  -H "Authorization: Bearer $RSS_TOKEN" \
  -o "$RSS_OPML_OUTPUT"
wc -c "$RSS_OPML_OUTPUT"
```

## Verify mutations and handle failures

- After add, edit, delete, or bulk state changes, list/read the affected resource and report the confirmed result.
- After refresh, report successful and failed feed counts; do not hide per-feed errors.
- Use `curl --fail-with-body -sS` so non-2xx response bodies remain visible.
- Treat `504` or a disconnected import stream as an unknown completion state, not a rollback.
- Do not retry POST, PATCH, or DELETE automatically unless a read-back proves the mutation did not happen.
- Keep responses concise; summarize large entry lists instead of dumping article HTML unless the user requested the full content.
