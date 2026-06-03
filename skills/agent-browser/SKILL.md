---
name: agent-browser
description: 浏览器自动化 CLI 工具，支持 headed 模式、profile 持久化登录状态。用于网页操作、数据抓取、自动化测试。
---

# Agent Browser 浏览器自动化

## 快速开始

```bash
# 使用包装脚本（推荐）- 自动包含 --profile 和 --headed
agent-browser open https://www.baidu.com

# 或者使用完整路径
/home/otto/bin/agent-browser open https://www.baidu.com
```

## 配置文件

包装脚本位置：`/home/otto/bin/agent-browser`

```bash
#!/bin/bash
# agent-browser wrapper with persistent profile and headed mode
exec npx agent-browser --profile ~/.agent-browser-profile --headed "$@"
```

### 固定参数说明

| 参数 | 说明 |
|------|------|
| `--profile ~/.agent-browser-profile` | 持久化浏览器配置，保存登录状态 (cookies, localStorage 等) |
| `--headed` | 显示浏览器窗口（非 headless），可看到实际操作 |

## 常用命令

### 导航与页面操作

```bash
# 打开网页
agent-browser open https://www.baidu.com

# 页面导航
agent-browser back          # 后退
agent-browser forward       # 前进
agent-browser reload        # 刷新
```

### 获取页面信息

```bash
# 获取可交互元素快照（推荐）
agent-browser snapshot -i       # 仅交互式元素
agent-browser snapshot -c       # 紧凑模式
agent-browser snapshot -d 3     # 限制深度

# 获取页面内容
agent-browser get url           # 当前 URL
agent-browser get title         # 页面标题
agent-browser get text <sel>    # 元素文本
agent-browser get html          # 页面 HTML
```

### 元素操作

```bash
# 点击操作
agent-browser click @e1         # 点击引用元素
agent-browser dblclick @e1      # 双击

# 表单填写
agent-browser fill @e1 "text"   # 清空并填写
agent-browser type @e1 "text"   # 输入文本
agent-browser press Enter       # 按下按键

# 鼠标操作
agent-browser hover @e1         # 悬停
agent-browser focus @e1         # 聚焦
```

### 查找元素

```bash
# 使用 role 查找
agent-browser find role button click --name "提交"

# 使用 text 查找
agent-browser find text "登录" click

# 使用 nth 查找第 N 个
agent-browser find nth 3 click
```

### 截图与下载

```bash
# 截图（默认不启用，需要时手动添加）
agent-browser screenshot /path/to/output.png
agent-browser screenshot --full /path/to/fullpage.png

# PDF
agent-browser pdf /path/to/output.pdf
```

### 标签页管理

```bash
agent-browser tab new           # 新标签页
agent-browser tab list          # 列出标签页
agent-browser tab close         # 关闭当前标签页
agent-browser tab 2             # 切换到第 2 个标签页
```

### Cookies 与存储

```bash
agent-browser cookies get       # 获取 cookies
agent-browser cookies clear     # 清除 cookies
agent-browser storage local     # 本地存储
agent-browser storage session   # 会话存储
```

## 输出说明

### 快照引用格式

```
- link "登录" [ref=e1]
- button "百度一下" [ref=e2]
- textbox "搜索" [ref=e3]
```

使用引用操作：
- `click @e1` - 点击引用 e1
- `fill @e3 "text"` - 填写引用 e3

## 环境变量

```bash
# 自定义配置
export AGENT_BROWSER_PROFILE=~/.my-profile     # 自定义 profile 路径
export AGENT_BROWSER_HEADED=false              # 禁用 headed 模式
export AGENT_BROWSER_DEFAULT_TIMEOUT=30000     # 默认超时 (ms)
```

## 工作流程示例

### 百度搜索

```bash
# 1. 打开百度
agent-browser open https://www.baidu.com

# 2. 获取快照找到搜索框
agent-browser snapshot -i

# 3. 填写搜索框并点击（假设搜索框是@e13，按钮是@e14）
agent-browser fill @e13 "agent-browser"
agent-browser click @e14

# 4. 等待加载
agent-browser wait --load networkidle

# 5. 获取结果
agent-browser snapshot
```

### 登录状态保持

```bash
# 第一次：手动登录
agent-browser open https://example.com/login
# ... 手动操作登录 ...

# 之后：登录状态自动保持（profile 持久化）
agent-browser open https://example.com
# 已登录状态
```

## 性能优化

### 快速操作技巧

1. **Daemon 已启动时**：命令秒响应，浏览器复用
2. **使用 profile**：避免重复登录
3. **快照模式**：`-i` 仅交互元素，`-c` 紧凑模式，减少输出
4. **限制深度**：`-d 3` 限制快照树深度

### 并发控制

```bash
# 批量操作时使用 && 链式调用
agent-browser open url && agent-browser fill @e1 "text" && agent-browser click @e2
```

## 错误处理

### 常见问题

1. **元素找不到**
   ```bash
   # 重新获取快照，元素引用可能变化
   agent-browser snapshot -i
   ```

2. **页面未加载完成**
   ```bash
   # 等待网络空闲
   agent-browser wait --load networkidle
   ```

3. **浏览器未启动**
   ```bash
   # 关闭旧的 daemon，重新启动
   agent-browser close
   agent-browser open <url>
   ```

## 调试技巧

### 查看元素

```bash
# 获取完整快照
agent-browser snapshot

# 仅交互式元素（推荐）
agent-browser snapshot -i

# 高亮元素
agent-browser highlight @e1
```

### 查看控制台日志

```bash
agent-browser console
agent-browser errors
```

## 文件结构

```
~/.agent-browser-profile/    # 持久化配置文件
├── cookies/                 # Cookies 数据
├── localStorage/            # LocalStorage
└── sessionStorage/          # SessionStorage

/home/otto/bin/agent-browser # 包装脚本
```

## 注意事项

1. **默认不截图**：除非明确要求，否则不执行截图操作
2. **Profile 固定**：始终使用 `~/.agent-browser-profile` 避免登录状态丢失
3. **快速接管**：如果操作有问题，随时接管继续操作
4. **daemon 复用**：浏览器后台运行，多次操作复用同一实例

## 帮助

```bash
agent-browser -h            # 完整帮助
agent-browser <command> -h  # 命令帮助
```
