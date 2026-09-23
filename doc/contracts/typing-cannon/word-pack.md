---
doc_id: CON-TC001
doc_type: contract
module: typing-cannon
status: superseded
last_updated: 2026-09-23
related:
  - doc/design/typing-cannon/adult-word-packs.md
---

# 单词大炮 · 词包数据结构契约（CON-TC001）

> 状态：**superseded**。阶段 1 已落地为 `src/typing-cannon/wordpacks.js`，代码即最终事实来源；本文只保留用途、校验要点与变更记录，不再维护第二份完整字段表。

## 用途

约定词包文件（`wordpacks.js`）与游戏引擎（`script.js`）之间的数据格式。新增词包只按本结构写数据，不改引擎。

## 结构定义

```js
window.WordPacks = [
  {
    id: 'daily-core',            // 包唯一标识，英文短横线；存档键、去重均依赖它
    name: '日常高频核心',         // 菜单分组显示名
    icon: '🎯',                  // 菜单分组图标
    tone: 'adult',               // 'kid' | 'adult'，决定文案语气与默认呈现方向
    desc: '一句话说明',           // 显示在分组标题旁
    levels: [
      {
        name: '动作',             // 关卡名（菜单卡片与 HUD 显示）
        fall: 45,                // 掉落速度 px/s
        spawn: 2.4,              // 出生间隔秒
        goal: 10,                // 过关需击碎词数
        direction: 'recall',     // 'copy' 显示英文抄写 | 'recall' 显示释义回忆拼写
        words: [
          { w: 'duty',           // 英文单词，小写
            ipa: '/ˈdjuːti/',    // 音标，recall 关必填
            zh: 'n. 责任；义务',  // 中文释义，recall 关必填；copy 关可省略
            emoji: null          // 图标；recall 关为 null，copy 关沿用现有 emoji
          }
        ]
      }
    ]
  }
];
```

## 校验规则（smoke test 依据）

1. `id` 全局唯一，匹配 `^[a-z0-9-]+$`。
2. 每关 `words` 非空；`fall > 0`、`spawn > 0`、`goal ≥ 5`。
3. 包内 `w` 唯一；仅含 `a-z`。
4. **仅 recall 关：同一关内单词首字母唯一**（盲打时消除自动锁定歧义）；copy 关单词可见，沿用历史数据不受此限。
5. `direction === 'recall'` 的关：每词 `zh` 与 `ipa` 非空，`emoji` 为 `null`。
6. `direction === 'copy'` 的关：每词 `emoji` 非空（保持现有渲染）。
7. `tone` 仅允许 `'kid' | 'adult'`；内置 `kid-core` 包必须存在（旧体验兜底）。

## 迁移说明

现有 `script.js` 内 THEMES 的二元组 `['egg','🥚']` 统一转换为 `{ w, emoji, ipa: null, zh: null }`，12 关合并为 `kid-core` 包；字段扩展不影响引擎对旧关卡的渲染。

## 变更记录

| 日期 | 变更 | 状态 |
| --- | --- | --- |
| 2026-09-23 | 初稿创建 | draft |
| 2026-09-23 | 首字母唯一约束收窄到 recall 关（kid-core 历史数据存在 cat/cup 同首字母，copy 关可见单词不受影响）；关卡增加可选 `icon` 字段 | superseded（已落地为 wordpacks.js，代码为最终事实来源） |
