#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import shutil
import subprocess
import sys
import urllib.parse
from collections import Counter, defaultdict
from pathlib import Path


DEFAULT_OWNER = "dcloudio"
DEFAULT_REPO = "uni-app"
DEFAULT_USER = "fxy060608"


def run(cmd):
    result = subprocess.run(cmd, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(
            "command failed: "
            + " ".join(cmd)
            + "\nSTDOUT:\n"
            + result.stdout
            + "\nSTDERR:\n"
            + result.stderr
        )
    return result.stdout


def gh_api(path, fields=None, paginate=False):
    cmd = ["gh", "api", "-X", "GET"]
    if paginate:
        cmd.append("--paginate")
    cmd.append(path)
    for key, value in (fields or {}).items():
        cmd.extend(["-f", f"{key}={value}"])
    return json.loads(run(cmd))


def parse_date(value):
    return dt.date.fromisoformat(value)


def iso_utc(date_value, end=False):
    time = dt.time.max if end else dt.time.min
    return dt.datetime.combine(date_value, time, tzinfo=dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_github_date(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))


def activity_date(author_date, committer_date):
    dates = [value for value in (author_date, committer_date) if value]
    return max(dates, key=parse_github_date) if dates else None


def row_in_window(row, since_iso, until_iso):
    start = parse_github_date(since_iso)
    end = parse_github_date(until_iso)
    commit = row.get("commit") or {}
    dates = []
    for role in ("author", "committer"):
        value = (commit.get(role) or {}).get("date")
        if value:
            dates.append(parse_github_date(value))
    return any(start <= value <= end for value in dates)


def list_branches(owner, repo):
    rows = gh_api(f"/repos/{owner}/{repo}/branches", {"per_page": "100"}, paginate=True)
    return [row["name"] for row in rows]


def list_user_commits(owner, repo, branch, user, since_iso, until_iso):
    commits = {}
    for field_name in ("author", "committer"):
        rows = gh_api(
            f"/repos/{owner}/{repo}/commits",
            {
                "sha": branch,
                "since": since_iso,
                "until": until_iso,
                field_name: user,
                "per_page": "100",
            },
            paginate=True,
        )
        for row in rows:
            if row_in_window(row, since_iso, until_iso):
                commits[row["sha"]] = row
    return list(commits.values())


def commit_detail(owner, repo, sha):
    encoded = urllib.parse.quote(sha, safe="")
    return gh_api(f"/repos/{owner}/{repo}/commits/{encoded}")


def compact_file_stats(files):
    prefixes = Counter()
    extensions = Counter()
    samples = []
    totals = {"added": 0, "removed": 0, "changed": 0}
    for file_info in files:
        filename = file_info["filename"]
        parts = filename.split("/")
        prefix = "/".join(parts[:2]) if len(parts) > 1 else parts[0]
        prefixes[prefix] += 1
        suffix = Path(filename).suffix or "(no ext)"
        extensions[suffix] += 1
        totals["added"] += file_info.get("additions", 0)
        totals["removed"] += file_info.get("deletions", 0)
        totals["changed"] += file_info.get("changes", 0)
        if len(samples) < 12:
            samples.append(
                {
                    "filename": filename,
                    "status": file_info.get("status"),
                    "additions": file_info.get("additions", 0),
                    "deletions": file_info.get("deletions", 0),
                    "changes": file_info.get("changes", 0),
                }
            )
    return {
        "file_count": len(files),
        "totals": totals,
        "top_prefixes": prefixes.most_common(10),
        "top_extensions": extensions.most_common(10),
        "sample_files": samples,
    }


def classify_theme(title, prefixes):
    lower = title.lower()
    prefix_names = {name for name, _ in prefixes}
    if "independent" in lower or "独立分包" in title:
        return "微信小程序独立分包"
    if "vite" in lower or "packages/vite-plugin-uni" in prefix_names:
        return "Vite 升级与构建"
    if "release" in lower:
        return "版本发布"
    if "harmony" in lower or "packages/uni-app-harmony" in prefix_names:
        return "Harmony 兼容"
    if "sourcemap" in lower:
        return "Source map 与测试兼容"
    if "vapor" in lower or "蒸汽" in title:
        return "Vapor 模式兼容"
    return "其他维护"


def make_markdown(data):
    lines = []
    lines.append(f"# {data['repo']} - {data['user']} weekly branch activity")
    lines.append("")
    lines.append(f"- Window: `{data['window']['since_date']}` to `{data['window']['until_date']}` UTC")
    lines.append(f"- Branches scanned: {len(data['branches_scanned'])}")
    lines.append(f"- Branches with matching commits: {len(data['branches_with_activity'])}")
    lines.append(f"- Unique matching commits: {len(data['commits'])}")
    lines.append("")

    if not data["commits"]:
        lines.append("No matching GitHub-associated author or committer commits were found in this window.")
        return "\n".join(lines) + "\n"

    lines.append("## Branch overview")
    for branch, shas in sorted(data["branches_with_activity"].items()):
        lines.append(f"- `{branch}`: {len(shas)} commits")
    lines.append("")

    lines.append("## Main themes")
    for theme, count in data["aggregate"]["themes"]:
        lines.append(f"- {theme}: {count} commits")
    lines.append("")

    lines.append("## Top changed areas")
    for prefix, count in data["aggregate"]["top_prefixes"]:
        lines.append(f"- `{prefix}`: touched in {count} commit-file entries")
    lines.append("")

    lines.append("## Commits")
    rows = sorted(data["commits"].items(), key=lambda kv: kv[1]["activity_date"], reverse=True)
    for sha, item in rows:
        short = sha[:7]
        branches = ", ".join(f"`{branch}`" for branch in item["branches"])
        stats = item["file_stats"]["totals"]
        lines.append(f"### `{short}` {item['message_title']}")
        lines.append(f"- Activity date: {item['activity_date']}")
        lines.append(f"- Authored: {item['author_date']}; committed: {item['committer_date']}")
        lines.append(f"- Branches: {branches}")
        lines.append(f"- Theme: {item['theme']}")
        lines.append(f"- Files: {item['file_stats']['file_count']}, +{stats['added']} -{stats['removed']}")
        if item["file_stats"]["top_prefixes"]:
            areas = ", ".join(f"`{name}` ({count})" for name, count in item["file_stats"]["top_prefixes"][:5])
            lines.append(f"- Areas: {areas}")
        if item["file_stats"]["sample_files"]:
            sample = ", ".join(f"`{file_info['filename']}`" for file_info in item["file_stats"]["sample_files"][:6])
            lines.append(f"- Sample files: {sample}")
        lines.append(f"- URL: {item['html_url']}")
        lines.append("")
    return "\n".join(lines)


def make_summary(data):
    lines = []
    lines.append(f"# {data['repo']} weekly summary for {data['user']}")
    lines.append("")
    lines.append(f"Window: `{data['window']['since_date']}` to `{data['window']['until_date']}` UTC")
    lines.append("")

    commit_count = len(data["commits"])
    active_branches = data["branches_with_activity"]
    lines.append(
        f"Scanned {len(data['branches_scanned'])} branches. Found {commit_count} unique commits across "
        f"{len(active_branches)} active branches."
    )
    lines.append("")

    if not commit_count:
        lines.append("No matching activity was found for this user in the selected window.")
        return "\n".join(lines) + "\n"

    lines.append("## Workstreams")
    for branch, shas in sorted(active_branches.items(), key=lambda kv: len(kv[1]), reverse=True):
        branch_commits = [data["commits"][sha] for sha in shas if sha in data["commits"]]
        themes = Counter(item["theme"] for item in branch_commits)
        top_theme = themes.most_common(1)[0][0] if themes else "其他维护"
        latest = max(item["activity_date"] for item in branch_commits)
        examples = sorted(branch_commits, key=lambda item: item["activity_date"], reverse=True)[:3]
        lines.append(f"- `{branch}`: {len(branch_commits)} commits, latest `{latest}`, main theme: {top_theme}.")
        for item in examples:
            lines.append(f"  - `{item['sha'][:7]}` {item['message_title']}")
    lines.append("")

    lines.append("## Main themes")
    for theme, count in data["aggregate"]["themes"]:
        lines.append(f"- {theme}: {count} commits")
    lines.append("")

    lines.append("## Changed areas")
    for prefix, count in data["aggregate"]["top_prefixes"][:10]:
        lines.append(f"- `{prefix}`: {count} commit-file entries")
    lines.append("")

    early_authored = [
        item
        for item in data["commits"].values()
        if item["author_date"] and item["author_date"][:10] < data["window"]["since_date"]
    ]
    if early_authored:
        lines.append("## Date note")
        lines.append(
            "Some commits were authored before the window and committed into a branch during the window; "
            "they are counted as weekly branch activity."
        )
        for item in sorted(early_authored, key=lambda value: value["activity_date"], reverse=True):
            lines.append(
                f"- `{item['sha'][:7]}` authored `{item['author_date']}`, committed `{item['committer_date']}`: "
                f"{item['message_title']}"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def collect_data(owner, repo, user, since_date, until_date, branch_filter):
    since_iso = iso_utc(since_date)
    until_iso = iso_utc(until_date, end=True)
    branches = branch_filter or list_branches(owner, repo)
    branches_with_activity = defaultdict(list)
    commits = {}

    for branch in branches:
        print(f"scanning {branch}", file=sys.stderr)
        for commit in list_user_commits(owner, repo, branch, user, since_iso, until_iso):
            sha = commit["sha"]
            branches_with_activity[branch].append(sha)
            if sha in commits:
                continue
            detail = commit_detail(owner, repo, sha)
            payload = detail["commit"]
            author = payload.get("author") or {}
            committer = payload.get("committer") or {}
            author_date = author.get("date")
            committer_date = committer.get("date")
            title = payload.get("message", "").splitlines()[0]
            file_stats = compact_file_stats(detail.get("files", []))
            commits[sha] = {
                "sha": sha,
                "message_title": title,
                "message": payload.get("message", ""),
                "activity_date": activity_date(author_date, committer_date),
                "author_date": author_date,
                "committer_date": committer_date,
                "author": {
                    "name": author.get("name"),
                    "email": author.get("email"),
                    "github_login": (detail.get("author") or {}).get("login"),
                },
                "committer": {
                    "name": committer.get("name"),
                    "email": committer.get("email"),
                    "github_login": (detail.get("committer") or {}).get("login"),
                },
                "html_url": detail.get("html_url"),
                "file_stats": file_stats,
                "theme": classify_theme(title, file_stats["top_prefixes"]),
                "branches": [],
            }

    for branch, shas in branches_with_activity.items():
        for sha in shas:
            if sha in commits:
                commits[sha]["branches"].append(branch)

    aggregate_prefixes = Counter()
    aggregate_extensions = Counter()
    aggregate_themes = Counter()
    for item in commits.values():
        aggregate_prefixes.update(dict(item["file_stats"]["top_prefixes"]))
        aggregate_extensions.update(dict(item["file_stats"]["top_extensions"]))
        aggregate_themes[item["theme"]] += 1

    return {
        "repo": f"{owner}/{repo}",
        "user": user,
        "window": {
            "since_date": since_date.isoformat(),
            "until_date": until_date.isoformat(),
            "since": since_iso,
            "until": until_iso,
        },
        "branches_scanned": branches,
        "branches_with_activity": {key: value for key, value in sorted(branches_with_activity.items())},
        "commits": commits,
        "aggregate": {
            "themes": aggregate_themes.most_common(),
            "top_prefixes": aggregate_prefixes.most_common(20),
            "top_extensions": aggregate_extensions.most_common(20),
        },
    }


def default_window(days):
    today = dt.datetime.now(dt.timezone.utc).date()
    return today - dt.timedelta(days=days), today


def main():
    parser = argparse.ArgumentParser(description="Generate dcloudio/uni-app weekly branch activity reports.")
    parser.add_argument("--owner", default=DEFAULT_OWNER)
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--user", default=DEFAULT_USER)
    parser.add_argument("--since", help="Start date, YYYY-MM-DD UTC")
    parser.add_argument("--until", help="End date, YYYY-MM-DD UTC")
    parser.add_argument("--days", type=int, default=7, help="Default lookback when --since/--until are omitted")
    parser.add_argument("--branches", nargs="*", help="Optional branch list to scan")
    parser.add_argument("--out-dir", default="outputs")
    args = parser.parse_args()

    if shutil.which("gh") is None:
        raise RuntimeError("gh is required but was not found on PATH")

    if args.since or args.until:
        if not (args.since and args.until):
            raise RuntimeError("--since and --until must be provided together")
        since_date = parse_date(args.since)
        until_date = parse_date(args.until)
    else:
        since_date, until_date = default_window(args.days)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"uniapp_news_weekly_{args.user}_{since_date.isoformat()}_{until_date.isoformat()}"

    data = collect_data(args.owner, args.repo, args.user, since_date, until_date, args.branches)
    json_path = out_dir / f"{stem}.json"
    md_path = out_dir / f"{stem}.md"
    summary_path = out_dir / f"{stem}_summary.md"

    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text(make_markdown(data), encoding="utf-8")
    summary_path.write_text(make_summary(data), encoding="utf-8")

    print(f"wrote {json_path}")
    print(f"wrote {md_path}")
    print(f"wrote {summary_path}")
    print(f"branches scanned: {len(data['branches_scanned'])}")
    print(f"branches with activity: {len(data['branches_with_activity'])}")
    print(f"unique commits: {len(data['commits'])}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
