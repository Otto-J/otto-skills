---
name: deploy-prod
description: Strictly preflight and publish Cola Admin Dashboard changes to production, including the admin tag, matching image build, manual GKE deployment, same-name GitHub Release, live check, and tag/Release audit. Use only for `marswaveai/cola` Admin Dashboard production releases; do not route Cloud Server, Desktop, or Agent Runtime releases here.
---

# Deploy Prod

Publish one `apps/admin-dashboard/**` change set from `origin/main` to the Cola production Admin Dashboard. Treat the code tag, image build, GKE deployment, GitHub Release, and live response as separate evidence.

## Fixed scope

- Repository: `marswaveai/cola`.
- Source: the fetched `origin/main` commit only.
- Product surface: `apps/admin-dashboard/**`.
- Tag format: `admin-releaseYYYYMMDD-NN`, using the Asia/Shanghai date and the next unused two-digit sequence.
- Build workflow: `.github/workflows/production-admin-build.yml` (`admin-*` tag push).
- Deploy workflow: `.github/workflows/production-admin-deploy.yml` (`workflow_dispatch`, input `tag`).
- Live check: `https://dashboard.cola.app/`.

Do not publish `apps/cloud-server`, Desktop, Agent Runtime, or another dashboard with this skill. A monorepo `main` tag naturally points at unrelated changes too; report those separately, but gate this workflow on a real Admin Dashboard diff.

## Safety invariants

- Begin read-only. Re-read both workflow files and run the preflight helper before proposing a mutation.
- Require an explicit confirmation immediately before the first remote write. Show the exact tag, full target SHA, previous same-family published Release, Admin commits/files, unrelated-file count, and commands/workflows that will mutate production.
- Never tag a feature branch, local `HEAD`, an unpushed commit, or an inferred SHA. The target must equal the freshly fetched `origin/main^{commit}`.
- If there are no changed files under `apps/admin-dashboard/**` since the previous same-family published Release, stop without creating a tag.
- If a newer canonical Admin tag lacks a Release, stop and reconcile that partial release before creating another tag.
- Never move, overwrite, delete, or recreate a remote tag. Never use `--force`.
- Do not automatically retry a failed build, deploy, or Release mutation. Inspect the resulting state and ask before any rerun whose side effects are uncertain.
- Create the GitHub Release only after the matching image build, production deployment, and live HTTP check succeed.
- Use the previous published `admin-releaseYYYYMMDD-NN` Release as the generated-notes baseline. Always pass `--latest=false`; Admin releases must not replace the Desktop release as GitHub Latest.
- Do not call a tag, build, or successful workflow dispatch a completed production release. Completion requires every evidence item in the final matrix.

## 1. Read-only preflight

Set `SKILL_DIR` to this skill's installed directory, then run from a Cola checkout:

```bash
node "$SKILL_DIR/scripts/release-state.mjs" preflight
```

The helper fetches `origin/main` and tags, verifies the GitHub repository, finds the previous same-family published Release, computes the next tag, and lists scoped and unrelated changes. Fetching updates only local Git refs; it performs no remote mutation.

Also verify the current workflow contract directly:

```bash
sed -n '1,90p' .github/workflows/production-admin-build.yml
sed -n '1,100p' .github/workflows/production-admin-deploy.yml
```

Stop if the trigger, input name, image name, or production target differs from the fixed scope above. Do not silently adapt a changed production contract.

Present the preflight facts and request confirmation in this form:

```text
准备发布 Admin Dashboard：
- tag: <tag>
- target: <full origin/main SHA>
- previous Release: <tag>
- Admin commits/files: <summary>
- unrelated changed files in the monorepo range: <count>
- writes: push tag -> build image -> dispatch production deploy -> create GitHub Release
请确认发布以上 tag@SHA。
```

## 2. Create the immutable tag

After confirmation, refresh the preflight. Abort if its tag, target SHA, or change set changed.

Create an annotated local tag at the exact target and push only that ref:

```bash
git tag -a <tag> <full-target-sha> -m "Admin Dashboard production release <tag>"
git push origin refs/tags/<tag>
```

Immediately verify the remote tag resolves to the target commit. Annotated tags must be peeled to their commit before comparison. If the tag already exists, verify it resolves to the exact target and resume idempotently; if it resolves elsewhere, abort.

## 3. Require the matching image build

Find the `production-admin-build.yml` run whose event is `push`, `headBranch` is the exact tag, and `headSha` is the target SHA. There must be exactly one unambiguous matching run.

Poll or watch it to completion while keeping the user updated at least once per minute. Require `conclusion=success`. Record its run ID and URL. A missing, ambiguous, cancelled, timed-out, or failed run stops the release; do not dispatch production deployment.

## 4. Deploy that tag to production

Record the UTC dispatch time, then dispatch exactly:

```bash
gh workflow run production-admin-deploy.yml --repo marswaveai/cola --ref main -f tag=<tag>
```

Identify the new run using the workflow file, `workflow_dispatch` event, actor, and creation time. If more than one run could be the dispatch, stop rather than watching the wrong deployment.

Wait for `conclusion=success` and record the run ID and URL. Then require a successful bounded HTTP response:

```bash
curl -fsSIL --max-time 20 https://dashboard.cola.app/
```

The workflow result proves the requested image rollout; the HTTP check proves the public surface responds. Report these as separate evidence.

## 5. Create the same-name GitHub Release

First re-verify that the remote tag peels to the target SHA and that the recorded build and deploy runs both succeeded. Then create one published Release attached to the existing tag:

```bash
gh release create <tag> \
  --repo marswaveai/cola \
  --verify-tag \
  --title <tag> \
  --generate-notes \
  --notes-start-tag <previous-admin-release-tag> \
  --notes "Admin Dashboard production deployment verified. Build: <build-url> Deploy: <deploy-url> Live: https://dashboard.cola.app/ Target: <full-target-sha>" \
  --latest=false
```

If a Release already exists for the tag, do not recreate it. Verify that it is published, non-prerelease, same-name, and attached to the correct remote tag; then continue to the audit.

## 6. Final online audit

Run:

```bash
node "$SKILL_DIR/scripts/release-state.mjs" audit
```

Require the new tag to appear in `latestMatched` and not in `tagsWithoutRelease` or `releasesWithoutTag`. The final report must include:

| Evidence | Required value |
|---|---|
| Source | full `origin/main` SHA |
| Admin diff | commits and files from preflight |
| Tag | remote tag peels to source SHA |
| Image build | matching run URL, success |
| Production deploy | matching run URL, success |
| Live | checked URL and HTTP success |
| GitHub Release | same tag, published URL, `latest=false` intent |
| Association audit | matched plus any pre-existing gaps listed separately |

Call the release complete only when every required row has direct evidence. Historical missing Releases are not proof that those tags reached production; label them only as online tag/Release gaps.
