---
doc_id: DES-TC002
doc_type: design
module: typing-cannon
status: approved
last_updated: 2026-09-23
related:
  - doc/requirements/typing-cannon/review-book.md
  - doc/contracts/typing-cannon/review-book.md
---

# 单词大炮 · 错词本 · 设计（DES-TC002）

## 需求追溯

- 覆盖 REQ-TC002 全部范围项（采集持久化、复习局、毕业机制）；"待确认项"按假设值（阈值 2、单局 10 词）落地为常量。
- 不覆盖项（按天调度、听写、导入、同步）不在本设计内。

## 契约引用

- 存储结构：CON-TC002（**待落地草案**）；落地后 `script.js` 内实现为事实来源。
- 词包数据：沿用 CON-TC001 已落地结构（`src/typing-cannon/wordpacks.js`）。

## 技术设计

### 模块职责

全部改动收敛在 `script.js`（存储 + 回写 + 复习局构建）与 `index.html`（菜单按钮）；`wordpacks.js` 不动；`smoke.test.js` 增加错词本用例。

### 数据流向与状态变化

```text
词义关对局（level / review）
  handleChar 打错(有锁定) ─▶ G.wrongWords ─┐
  loseLife 漏接           ─▶ G.missedWords ─┼─▶ 结算 levelClear/levelFailed
  destroyItem 击碎        ─▶ G.killedWords ─┘      └─ reviewApply() 回写 localStorage
菜单 renderEnHome ── reviewCount() ──▶ "📖 错词复习（N）"按钮（N=0 置灰）
startReview() ── reviewTakeDue(10) ─▶ 合成 entry{direction:'recall'} ─▶ G.mode='review'
```

- 新增对局状态 `G.mode = 'review'`；凡按 `mode === 'level'` 取关卡参数的分支改用 `isLevelRun()`（level 或 review），含掉落速度、生成间隔、词池、词义方向、HUD 标题、失败结算路由。
- `G.killedWords`（Set）：destroyItem 记录本局击碎的词，供连对判定。
- 复习局合成 pack `{id:'review', tone:'adult'}` 与 entry（name 错词复习 / fall 44 / spawn 2.4 / goal=词数 / direction recall）；星星、解锁逻辑对 review 模式短路。
- `collectWords()` 改为直接从 `G.entry.words` 建词元索引（原 WORD_INDEX 全局表删除，两个模式统一）。

### 关键技术决策

1. **复习复用词义关引擎**：review 只是"词表来自错词本的 recall 关"，不新增玩法代码路径；预展示、气泡、生词记录全部继承。
2. **回写集中在结算函数**：仅 levelClear / levelFailed 调用 `reviewApply`；Esc / 回菜单中断不触碰存储（REQ 边界）。
3. **简化 SRS**：`right≥2` 毕业 + `ts` 升序取词替代按天间隔调度；数据里已存 `ts`，后续升级为到期时间算法不需要迁移存储。
4. **错词条目快照 ipa/zh**：复习局词元直接用条目快照，不反查词包（词包后续改动不影响已有条目渲染）。

## 界面原型（ASCII 线框）

### 选关菜单按钮排（新增第三枚）

```text
│  [🌪️ 无尽模式▶] [🅰️ 字母练习] [📖 错词复习（7）]  │
│  （N=0 时按钮置灰 disabled）                      │
```

### 复习局（复用词义关画面）

```text
│ 🏆 940       📖 错词复习        ❤️❤️🖤           │
│             ▓▓▓▓▓▓░░░░ 6/7                      │
│   ╭──────────╮   ╭──────────────────╮           │
│   │ 狭窄的    │   │ narrow /ˈnærəʊ/  │ ← 预展示   │
│   │ n a r _  │   │ adj. 狭窄的       │           │
│   ╰──────────╯   ╰──────────────────╯           │
```

### 复习局结算

```text
│  游戏结束   复习完成，本子里还剩 3 个词。          │
│  [得分][复习词数][准确率][连击][WPM]              │
│  📖 本局生词（2）…（复用现有区块）                │
│  [再复习一轮] [关卡选择] [主菜单]                 │
空状态：错词本清空时显示"错词本清空了，全部掌握！"
```

## 交互与异常

| 场景 | 处理 |
| --- | --- |
| 错词本为空点复习 | 按钮置灰不可点；`startReview` 内空词表直接 return 兜底 |
| 复习局 3 心用完 | 走 levelFailed：照常回写（打错/漏接清零），词保留在本 |
| 复习局清完 | 走 levelClear：连对累加 / 毕业移除，结算显示剩余词数 |
| Esc / 回菜单中断 | 不结算、不回写（沿用现有"放弃不结算"） |
| localStorage 不可用 | 静默降级为内存态（与现有存档策略一致） |
| 复习局进度条 | kills/goal 与词义关一致 |

## 验证方式

1. `node smoke.test.js`：新增用例——采集写回（漏接两词 → 本内条目 right=0、快照齐全）、复习局构建（mode=review、词表来自本）、连对累加（一轮后 right=1）、毕业移除（两轮后条目删除、计数归零）、持久化写入、菜单按钮置灰/计数。
2. 手工冒烟（浏览器）：菜单按钮计数 → 词义关故意漏词 → 结算后计数增加 → 刷新后保留 → 复习局打完一轮看连对/毕业提示。
