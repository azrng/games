---
doc_id: DES-TC003
doc_type: design
module: typing-cannon
status: approved
last_updated: 2026-09-23
related:
  - doc/requirements/typing-cannon/dictation-mode.md
---

# 单词大炮 · 听写模式 · 设计（DES-TC003）

## 需求追溯

- 覆盖 REQ-TC003 全部范围项；单局 10 词、`rate=0.9` 按假设值落为常量。
- 不覆盖项（词表排序、语速分级、音色选择、统计）不在本设计内。

## 契约引用

- 词包数据沿用已落地的 `src/typing-cannon/wordpacks.js`（CON-TC001 superseded 后代码为事实来源）。
- 听写局为**运行时合成关卡**，`direction='dictation'` 仅存在于内存 entry，不写入词包数据文件，契约文件无需回改。

## 技术设计

### 模块职责

全部改动收敛在 `script.js`（合成听写局 + 气泡变体渲染 + 播放时机 + 采集条件扩展）、`index.html`（菜单说明一行）、`style.css`（分组标题上的听写小按钮）；`wordpacks.js` 不动。

### 数据流向与状态变化

```text
菜单 renderEnHome（speechSynthesis 可用才渲染）
  成人包分组标题 ──▶ [🎧 听写] chip ──▶ startDictation(packId)
      words = shuffle(pack 词表).slice(0, DICTATION_TAKE)
      G.mode='dictation'; entry={direction:'dictation', …合成}
spawnItem: dir='dictation'
update: 卡入视野(y>70) → seen=true; introT=1.5; speakWord(word)   ← 自动朗读
        introT>0 期间半速下坠
canvas pointerdown: 命中 dictation 卡 → speakWord 重听 + 手动锁定
handleChar/loseLife/destroyItem → wrongWords/missedWords/killedWords（方向含 dictation）
结算 levelClear/levelFailed → reviewApply（含 dictation）→ 错词本
```

### 关键技术决策

1. **复用词义关引擎**：dictation 与 recall 共享 `isLevelRun()` 关卡参数、预展示慢速、进度槽渲染与生词采集；仅"显示内容"不同——recall 显示释义，dictation 只显示 🔊。所有 `direction === 'recall'` 的游戏性判断（生词采集、拼错清零惩罚）扩展为 recall 或 dictation。
2. **合成关卡而非数据文件**：词表随机取自所选词包，不落盘；`G.pack` 指向所选词包（生词条目 `packId` 记录正确来源）。
3. **朗读时机挂在 seen 触发点**：与词义关"预展示入视野触发"同一位置，避免屏幕外浪费播报；`speakWord` 已有 `speechSynthesis` 守卫，vm / 旧环境零成本降级。
4. **击碎揭示**：destroyItem 对 dictation 卡额外 `floatText(单词 + 释义)`，即时反馈"刚才听到的是什么"，结算页生词区块提供完整回顾。
5. **能力检测**：`typeof window.speechSynthesis !== 'undefined'` 控制 chip 渲染与 `startDictation` 兜底，不引入额外配置。

## 界面原型（ASCII 线框）

### 菜单分组标题（新增听写 chip）

```text
│ ┌ 💼 职场高频核心 · 🧠 词义回忆      [🎧 听写] ─┐ │
│ │ [1.会议与沟通⭐☆☆][2.邮件🔒][3.求职🔒]      │ │
```

### 听写气泡（词义气泡变体）

```text
   预展示期（入视野 1.5s，半速）        常态
  ╭──────────────╮               ╭──────────────╮
  │     🔊       │               │  🔊  点击重听  │
  │  正在朗读…    │               │  _ _ _ _ _ _  │
  ╰──────────────╯               ╰──────────────╯
  （不出现单词 / 音标 / 释义）
```

### 听写结算

```text
│  游戏结束   听写完成，7/10 词直接拼对。           │
│  [得分][听写词数][准确率][连击][WPM]              │
│  📖 本局生词（3）…（错词入本，可发音）            │
│  [再来一轮] [关卡选择] [主菜单]                   │
```

## 交互与异常

| 场景 | 处理 |
| --- | --- |
| 不支持语音合成 | chip 不渲染；`startDictation` 首行守卫返回 |
| 点击听写气泡 | `speakWord(word)` 重听（同时按 T035 规则切换锁定） |
| 词义关/听写关拼错 | 共用"清空已打进度从头拼"惩罚，错词记入 wrongWords |
| 听写局清完 / 失败 | levelClear/levelFailed 走 dictation 分支：不产星、回写错词本 |
| Esc / 回菜单中断 | 不结算、不回写（全局约定） |

## 验证方式

1. `node smoke.test.js`：新增用例——注入 speechSynthesis 桩后菜单出现 🎧 chip；`startDictation('daily-core')` 生成 direction=dictation、词数=10 且全部来自该包；逐键击碎后 levelClear 将生词写入错词本；无语音桩时 chip 不渲染且 `startDictation` 空操作。
2. 手工冒烟（浏览器）：菜单出现 🎧 听写 → 进入听写局截图（气泡无释义）→ 击碎出现揭示 → 结算生词入本。
