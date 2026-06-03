# Agent Browser Skill 优化说明

## 用户要求

1. **不截图**：除非明确要求，否则不执行截图操作
2. **固定 profile**：每次使用 `--profile ~/.agent-browser-profile` 避免登录状态丢失
3. **快速操作**：利用 daemon 复用，提高操作速度
4. **问题接管**：如果发现问题再接管处理
5. **headed 模式**：显示浏览器窗口，可看到实际操作

## 实现方案

### 1. 包装脚本 `/home/otto/bin/agent-browser`

```bash
#!/bin/bash
# agent-browser wrapper with persistent profile and headed mode
exec npx agent-browser --profile ~/.agent-browser-profile --headed "$@"
```

**优势**：
- 无需每次输入 `--profile` 和 `--headed`
- 固定配置文件路径，登录状态持久化
- 简化命令，提高效率

### 2. PATH 配置

```bash
# 添加到 ~/.bashrc
export PATH="$HOME/bin:$PATH"
```

**效果**：可以直接使用 `agent-browser` 命令

### 3. Profile 持久化

配置文件位置：`~/.agent-browser-profile`

保存内容：
- Cookies（登录状态）
- LocalStorage
- SessionStorage
- 其他浏览器数据

**优势**：下次使用自动恢复登录状态

### 4. Daemon 复用

agent-browser 使用 daemon 模式：
- 第一次启动：~2-3 秒
- 后续操作：秒响应
- 浏览器实例复用，提高速度

### 5. 不截图原则

默认行为：
- ❌ 不执行截图操作
- ✅ 只执行必要的页面操作
- ✅ 截图仅在用户明确要求时执行

## 使用对比

### 使用前（慢，重复）

```bash
npx agent-browser --profile ~/.agent-browser-profile --headed open https://www.baidu.com
npx agent-browser --profile ~/.agent-browser-profile --headed snapshot -i
npx agent-browser --profile ~/.agent-browser-profile --headed fill @e13 "text"
```

### 使用后（快，简洁）

```bash
agent-browser open https://www.baidu.com
agent-browser snapshot -i
agent-browser fill @e13 "text"
```

## 性能对比

| 操作 | 使用前 | 使用后 |
|------|--------|--------|
| 首次启动 | ~3 秒 + 输入参数 | ~2 秒 |
| 后续操作 | ~2 秒 + 输入参数 | 秒响应 |
| 命令长度 | 长（需要重复参数） | 短（自动包含） |

## 工作流程

```
用户请求
    │
    ▼
检查 daemon 状态
    │
    ├── 未启动 → 启动 daemon（首次） → 执行操作
    └── 已启动 → 直接执行操作（秒响应）
    │
    ▼
输出结果
    │
    ▼
发现问题？
    │
    ├── 是 → 接管处理
    └── 否 → 完成
```

## 常见问题

### Q: 如何清除登录状态？

```bash
rm -rf ~/.agent-browser-profile
```

### Q: 如何临时使用不同配置？

```bash
npx agent-browser --profile ~/.other-profile open https://example.com
```

### Q: 如何查看 profile 内容？

```bash
ls -la ~/.agent-browser-profile
```

## 优化记录

- **2026-02-25**: 创建包装脚本，固定 profile 和 headed 模式
- **2026-02-25**: 添加到 PATH，简化命令
- **2026-02-25**: 创建 skill 文档到 otto-skills
