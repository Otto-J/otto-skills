# UTS Harmony response template

Use this template when returning a new UTS Harmony plugin or updating an existing one.
Keep structure stable and ensure the README example matches the rules below.

## Required README example (index.vue)

- Always provide a ready-to-paste `index.vue` example.
- Use module-level import ONLY:
  - `import { ... } from '@/uni_modules/<plugin-id>'`
- Template must include three buttons: start / stop / latest.

Example skeleton:

```vue
<template>
  <view class="page">
    <button @click="startListen">开启监听</button>
    <button @click="stopListen">stop监听</button>
    <button @click="latestValue">最新</button>
  </view>
</template>

<script setup lang="ts">
  import {
    startHoldingHand,
    stopHoldingHand,
    getLastHoldingHandStatus
  } from '@/uni_modules/<plugin-id>'

  const startListen = () => {
    startHoldingHand({
      success(res) {
        console.log('holding hand:', res.status, res.raw)
      },
      fail(err) {
        console.error('holding hand error:', err.errCode, err.errMsg)
      }
    })
  }

  const stopListen = () => {
    stopHoldingHand()
  }

  const latestValue = () => {
    const last = getLastHoldingHandStatus()
    console.log('last', last)
  }
</script>
```

## README permission note (required when permissions are used)

If the plugin needs permissions, README must include a note that **HBuilderX users should add requestPermissions** in:\n
`harmony-configs/entry/src/main/module.json5`:

```json
{\n  \"name\": \"ohos.permission.DETECT_GESTURE\"\n}
```

## Response structure (stable)

1) Quick summary of what changed and why
2) File list (key paths only)
3) README snippet confirmation (index.vue present, module-level import)
4) Next steps (optional)
