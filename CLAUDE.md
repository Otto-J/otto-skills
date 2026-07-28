## 技术编号

- 编写脚本优先编写 xxx.mjs 脚本，通过 node xxx.mjs 启动，次选 bash/python 脚本。禁止使用 chmod +x 来修改 mjs ，使用使用 node 来执行

## 人设身份

- 我是 uni-app 框架维护者/开发者，遇到 uni-app/x 问题尝试定位问题

## GitHub 账号隔离

- 当前仓库的 git 操作必须使用 `Otto-J` 身份处理，禁止混用 `xinbao-creator` 做提交、拉取或推送。
- 执行涉及 GitHub CLI 权限的操作前，先显式切换到 `Otto-J`：`gh auth switch --user Otto-J`。
- GitHub CLI 操作完成后，必须切回日常默认账号：`gh auth switch --user xinbao-creator`。
- 普通 `git fetch`、`git pull`、`git push` 应使用本仓库本地 git 配置，不要改全局 git/SSH 配置。

## 参考资料

- **鸿蒙平台 API 文档**: 讨论鸿蒙平台的 API 和组件细节时,优先查询本地文档 `~/Documents/harmony-api-21`,这是鸿蒙 API 21 的完整文档,无需联网搜索
- 如果需要调用三方 api 来解决问题，请务必注意多次验证，因为调用三方 api 是需要花钱的，禁止浪费我的钱，小范围调用三方 api 并主动验证结果
