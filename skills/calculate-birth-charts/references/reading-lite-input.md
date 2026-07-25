# reading-lite 用户引导

> 本文档仅用于 `ming-engine-doubao-reading-lite`（解读辅助版）。
> 此版本**不包含排盘引擎**，不能自行计算八字、紫微、占星。

## 此版本能做什么

1. 引导你收集完整的出生信息（日期、时间、地点、时区等）
2. 接收已由完整 Ming Engine 生成的 `facts`（结构化命盘事实）
3. 按 Ming Engine 的"说人话"输出规范生成事业、感情、财运等自然语言解读
4. 提供专业依据、时间线、风险提示和现实建议

## 此版本不能做什么

- **不能自行排盘**——不能计算八字四柱、紫微星曜、占星行星位置
- **不能计算吉凶、喜用神、大运流年、神煞、刑冲合害**——这些都需要完整引擎
- **不能合婚/关系配对**——需要完整引擎的 synastry 功能
- 如果你没有已生成的 facts，此版本无法提供任何排盘结果

## 如何使用 reading-lite 版本

### 方式一：已有完整引擎的 facts（推荐）

1. 在装有任何完整版 Ming Engine 的环境（Codex / Qoder / WorkBuddy）中运行排盘
2. 将生成的 `interpretation.json` 中的 facts 部分复制出来
3. 粘贴到豆包，说："我已从完整 Ming Engine 拿到了 facts，帮我按规范写一份事业解读"
4. 豆包会按 reading-style.md 的 7 步结构生成大白话解读

### 方式二：先收集信息，后续再解读

1. 告诉豆包你的出生信息
2. 豆包会引导你收集所有必要字段
3. 豆包会将信息整理为 `birth-input.json` 格式，方便你拿去完整引擎排盘
4. 拿到 facts 后回来让豆包解读

## 输入的 facts 格式

如果你有完整引擎生成的 `interpretation.json`，直接粘贴 facts 部分即可。引擎输出的 facts 格式如下：

```json
{
  "facts": [
    {
      "topic": "事业",
      "claim": "日主甲木身强，喜金火调候",
      "polarity": "吉",
      "reason": "...",
      "evidence": { "ref": "...", "note": "..." }
    }
  ]
}
```

## 重要声明

- 此版本仅供传统文化、娱乐与自我反思用途
- 非科学预测，不构成医疗、法律、投资或人生重大决策建议
- 如需完整排盘能力，请使用 Codex / Qoder / WorkBuddy 上的完整版 Ming Engine
