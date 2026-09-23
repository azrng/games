---
doc_id: CON-TC002
doc_type: contract
module: typing-cannon
status: superseded
last_updated: 2026-09-23
related:
  - doc/design/typing-cannon/review-book.md
---

# 单词大炮 · 错词本存储契约（CON-TC002）

> 状态：**superseded**。阶段 1 已落地进 `src/typing-cannon/script.js`（存储与回写实现），代码即最终事实来源；本文只保留用途、校验要点与变更记录。

## 用途

约定错词本在 localStorage（键 `typcannon_review_v1`）中的 JSON 结构与回写规则。

## 结构定义

```js
// localStorage['typcannon_review_v1'] = { <单词>: 条目 }
{
  "duty": {
    "w": "duty",           // 单词，小写，主键
    "packId": "daily-core",// 来源词包 id
    "ipa": "/ˈdjuːti/",    // 音标（入本时快照）
    "zh": "n. 责任；义务",  // 中文释义（入本时快照）
    "right": 0,            // 当前连对次数（完整拼对且未打错/漏接 +1）
    "ts": 1730000000000    // 最近接触时间戳（Date.now()，复习局按升序取词）
  }
}
```

## 回写规则（结算时执行一次）

1. 采集集合 = 本局漏接词 ∪ 本局打错过字母的词；二者均入本（新条目 `right=0`）。
2. 本局被完整击碎的词：若在本中且未打错未漏接 → `right+1`；`right ≥ 2` 移除（毕业）。
3. 打错或漏接的词：`right` 清零，`ts` 更新。
4. 干净击碎且不在本中的词不采集（错词本只收错词）。

## 校验规则（smoke test 依据）

1. 键为 `^[a-z]+$` 单词；`packId` 必须是已注册词包 id。
2. recall 词条目 `ipa` 与 `zh` 非空。
3. `right` 为非负整数；`ts` 为正数。

## 变更记录

| 日期 | 变更 | 状态 |
| --- | --- | --- |
| 2026-09-23 | 初稿创建 | draft |
| 2026-09-23 | 落地进 script.js（REVIEW_KEY='typcannon_review_v1'），代码为事实来源 | superseded |
