# podcast-highlight-mix examples

## Xiaoyu full-ASR example

```bash
node podcast-highlight-mix/scripts/build-mix.mjs \
  --input /Users/otto/Movies/xiaoyu/asr-auralwise-20260627-174614/xiaoyu-vibecoding-1.asr-16k-mono-64k.json \
  --source-dir /Users/otto/Movies/xiaoyu \
  --start 678 \
  --end 781 \
  --title "为什么零基础学员要自己做作业批改工具" \
  --out runs/xiaoyu-homework-tool/mix.json
```

This generates a sub-3-minute `mix.json` from the original ASR JSON. The text remains raw ASR text. The shot list is deterministic and every shot is under 10 seconds.
