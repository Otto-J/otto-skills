# otto-skills

这个仓库用于集中维护个人 Skills 和 Agents，方便在不同 Agent 运行环境中索引、安装和复用。

## 目录作用

### `skills/`

`skills/` 存放可被 skills CLI 或 Agent 运行时识别的 Skill 包。每个一级子目录通常对应一个独立 skill，例如：

- `skills/uts-harmony/`: uni-app UTS HarmonyOS 插件开发与本地鸿蒙 API 文档检索流程。
- `skills/douyin-fetch/`: 抖音视频、音频、封面和元数据下载。
- `skills/oss-manager/`: 阿里云 OSS 上传、删除、列表和 URL 生成。
- `skills/tencent-cloud/`: 腾讯云 API 自动化辅助。
- `skills/esp32s3-box0-guide/`: ESP32-S3 BOX0 学习、刷机和验证流程。

索引规则：

- Skill 入口文件优先使用 `SKILL.md`。
- 如果历史 skill 使用了 `skill.md`，索引器需要兼容小写入口。
- `scripts/` 存放该 skill 的辅助脚本，优先使用 `.mjs` 并通过 `node xxx.mjs` 执行。
- `references/` 存放该 skill 的补充资料、流程模板、命令说明或领域知识。
- `assets/` 存放示例工程、模板、图片或其他可复用资源。
- `agents/` 如果出现在某个 skill 内部，表示该 skill 附带面向特定 Agent 运行时的配置。

### `agents/`

`agents/` 存放可直接作为子 Agent 或专用 Agent 配置使用的 Markdown 定义文件。它们不是独立 skill 包，而是面向具体任务的角色、工具权限和工作流说明，例如：

- `agents/ask-analyzer.md`: DCloud 社区问题分析器。
- `agents/harmony-api-docs.md`: 鸿蒙 API 21 本地文档检索 Agent。
- `agents/qwik-translation-worker.md`: Qwik 翻译辅助 Agent。
- `agents/xiyou-tangseng.md` / `agents/xiyou-wukong.md`: 特定角色 Agent 配置。

索引规则：

- 每个 `.md` 文件视为一个可索引 Agent 定义。
- 文件头部 YAML front matter 描述 `description`、`model`、`tools`、`permission` 等运行配置。
- Agent 文件适合被调度系统直接读取；不要把它们当成 `skills/` 下的可安装 Skill 包。

## 安装 Skill

本仓库可通过 `skills` CLI 安装。帮助信息来自：

```bash
npx skills@latest -h
```

安装整个仓库中的所有 skills 到所有支持的 agent：

```bash
npx skills@latest add Otto-J/otto-skills --all
```

只安装某一个 skill：

```bash
npx skills@latest add Otto-J/otto-skills --skill uts-harmony -y
```

安装到指定 agent：

```bash
npx skills@latest add Otto-J/otto-skills --skill uts-harmony --agent <agent-name> -y
```

全局安装，而不是安装到当前项目：

```bash
npx skills@latest add Otto-J/otto-skills --skill uts-harmony --global -y
```

先查看仓库里可安装的 skills，不执行安装：

```bash
npx skills@latest add Otto-J/otto-skills --list
```

不安装，直接生成某个 skill 的使用提示：

```bash
npx skills@latest use Otto-J/otto-skills@uts-harmony
```

也可以使用完整 GitHub URL：

```bash
npx skills@latest add https://github.com/Otto-J/otto-skills --skill uts-harmony -y
```

## 维护约定

- 新增 skill 时，在 `skills/<skill-name>/SKILL.md` 写清楚触发场景、工作流、输入输出和验证方式。
- 新增脚本时优先使用 `.mjs`，通过 `node scripts/xxx.mjs` 执行；不要依赖 `chmod +x`。
- 新增 Agent 时放在根目录 `agents/`，并在 front matter 中写清楚用途、模型、工具权限和适用场景。
- 涉及鸿蒙平台 API 或组件细节时，优先查询本地文档 `~/Documents/harmony-api-21`。
