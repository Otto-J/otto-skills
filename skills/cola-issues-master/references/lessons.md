# Cola Issue 修复经验库

这里只保存会改变后续诊断或验证决策的可复用经验。它不是修复日志、PR 列表或通用工程规范的副本。

## 条目格式

每次吸收新案例时优先合并已有条目。新增条目应包含：

- **触发信号**：什么用户说法或可见特征应触发这条路径。
- **证据顺序**：先看什么，什么只作补充。
- **最小复现**：能够隔离机制的输入和断言。
- **修复边界**：第一处分叉属于哪一层，哪些层不该动。
- **验证契约**：自动测试、真实运行时和人工验收各证明什么。
- **Failure shields**：已经走过的弯路以及快速失败方式。
- **来源**：已确认的 Issue/PR，不记录私人标识或原始附件。

## 视觉产物：浏览器正常，Cola HTML 预览乱码

**来源**：Issue #4995，PR #5005，2026-09-02 已完成人工验收。

- **触发信号**：HTML 在 Cola 的“预览”模式出现 `ä¸...`、`ç...` 一类 mojibake，而外部浏览器打开正常；截图能看到具体 artifact 文件名。
- **证据顺序**：先看截图的乱码形态和模式，再按文件 basename 搜索 trace 中的写入记录，然后检查 artifact 是否为 UTF-8、是否缺少 `<meta charset>`，最后检查自定义 protocol 的 `Content-Type`。
- **关键判断**：把预期中文的 UTF-8 字节按 Windows-1252 解码；若结果与截图一致，可以证明乱码机制，但仍应连接到实际响应头或运行时 `document.characterSet`。
- **最小复现**：UTF-8 编码、扩展名 `.html`/`.htm`、只有 body fragment、故意不带 `<head>` 与 `<meta charset>`。修改前后使用同一 fixture。
- **修复边界**：编码契约属于 Cola HTML preview protocol；不要要求每个生成器修改 HTML，也不要改 server/agent。只给 HTML 文档声明 UTF-8，保持 CSS、图片、字体等资源原 MIME。
- **验证契约**：纯函数测试覆盖 HTML/HTM 和非 HTML 资源；Electron guest DOM 断言 `document.characterSet === 'UTF-8'` 且正文为预期中文；最后由用户在真实“预览/源码”切换中验收。
- **Failure shields**：日志中的无关 Agent stream ERROR 不能解释渲染乱码，不应触发大范围 Sentry；修改前要先保留 baseline；自动脚本必须断言而不只是打印 JSON；renderer screenshot 对独立 WebView 可能是黑图。

## 通用：附件与 comments 的证据地位

- Comments 是历史调查和候选解释。先独立检查用户操作、附件和当前代码，再决定采纳、修正或推翻。
- 图片附件不是“有附件”的计数项；视觉反馈必须实际查看像素内容。
- ZIP 日志没有记录某个 UI 动作，不等于现象不存在。对于渲染、错位和静默语义错误，截图、trace 中的输入结构和确定性回放可能更直接。
- trace 中的原始会话只允许私下定位。经验库和报告只记录最小结构事实，不复制提示词、正文或本地路径。

## 通用：验证不是一个布尔值

- 修改前失败、修改后成功的同 fixture before/after，证明因果修复。
- 单元测试证明局部契约；typecheck/lint 证明静态完整；Electron/CDP 证明真实运行路径；用户验收证明目标场景可用。
- “脚本退出 0”只有在脚本包含语义断言时才是验证；等待、截图或输出状态需要单独判断。
- 始终区分 local passed、CI passed、PR approved、merged 和 released。

## 通用：测试 harness 先做快速自检

- 启动前验证 binary 的 package 位置和参数是否透传；不要默认根目录能解析 workspace package 的 CLI。
- 启动后短时间检查目标端口和日志中的 readiness，再进入长等待。
- CDP 场景、fixtures、日志和截图放在外部 runs 目录，不能污染 Cola checkout。
- harness 失败与产品失败分开报告；修好 harness 后重新执行产品断言。
