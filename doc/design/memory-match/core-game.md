---
doc_id: DES-MM001
doc_type: design
module: memory-match
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/memory-match/core-game.md
---

# 记忆翻牌 · 核心玩法（DES-MM001）

## 需求追溯

- 关联 REQ-MM001，覆盖其全部「本次覆盖」范围，无遗留项。
- 结构与风格基准：对齐 `src/lights-out/` 与同批 `src/pattern-quest/`——IIFE + `'use strict'`、纯函数挂 `window.MemoryApi` 供测试、mulberry32 种子随机、localStorage try/catch 内存兜底、vm 沙箱 smoke 测试。
- 本设计未覆盖 REQ 项：无（REQ「本次不覆盖」的平台层改动本设计亦不涉及）。

## 技术设计

### 模块职责与数据流

```text
script.js（单文件，IIFE）
  主题池 THEMES / 关卡表 LEVEL_TABLE
        │  levelSeed(level) 确定性种子 + themeForLevel(level) 按关轮换
        ▼
  buildDeck(themeKey, pairs, seed) ──▶ [{ emoji, pairId }] × 2×pairs
        │
        ▼
  渲染 renderBoard()：卡背网格（CSS 3D 翻转）
        │
        ▼
  点击 handleCardTap(index) ──▶ evaluatePair(a, b)（pairId 相等判定）
        │                                   │
        │            同款：is-matched（弹跳 + 绿色高亮）──▶ 全配对？──▶ showWinModal
        │            └─ 不同：锁定 800ms 后翻回（防连点）
        ▼
  结算：starRating(flips, pairs) ──▶ saveStars / saveBest / saveUnlockedLevel ──▶ localStorage（兜底内存）
```

- `index.html`：`main.game-shell`（页头 + 玩法提示条 + 记分板 + 卡阵 + 操作栏）与两个 `overlay-modal` 弹窗（结算 / 关卡选择）；`</body>` 前依次引入 `script.js` 与 `../js/game-back.js`。
- `style.css`：自包含，`:root` 内 `--mm-*` 变量；卡背为渐变 + `radial-gradient` 圆点花纹 + `::after` 问号，无图片依赖；`prefers-reduced-motion` 降级。
- `smoke.test.js`：node 原生 `assert` + `fs` + `vm` 沙箱（Map 桩 localStorage、最小 document 桩），直接执行 `script.js` 全文。

### 牌阵生成（buildDeck）

两段 Fisher-Yates 种子洗牌，同 `(themeKey, pairs, seed)` 完全可复现：

1. `seededShuffle(theme.emoji.slice(), random)`：洗主题池副本，取前 `pairs` 个作为本关图案（对数超出池按池上限收敛，退化值按 1 对兜底）。
2. 复制成对：`pairId = 0..pairs-1`，每图案 push 2 张 `{ emoji, pairId }`。
3. `seededShuffle(deck, random)`：整体洗牌输出。

种子来源：`levelSeed(level) = (BASE_SEED + level × 6271) >>> 0`；随机数为 mulberry32（与 lights-out / pattern-quest 同款实现）。

### 翻牌状态机

状态：`revealed[]`（已翻开/已配对标记）、`firstIndex`（第一张翻开的位置，-1 表示无）、`locked`（判定锁定）、`flips`（翻牌次数，翻两张记 1 次）。

| 当前状态 | 点击行为 |
| --- | --- |
| `locked`（失败回翻倒计时 / 通关结算前） | 忽略 |
| 该卡已翻开或已配对（`revealed[i]`） | 忽略 |
| 无第一张 | 翻开，记为第一张，不计次 |
| 有第一张 | 翻开并 `flips += 1`；`evaluatePair` 判定——同款：两张 `is-matched`（弹跳 + 高亮，`pointer-events: none`），配对数 +1，全配对则延迟 700ms 弹结算；不同：`locked = true`，800ms 后两张翻回并解锁 |

重开 / 切关时清理未决的回翻定时器，避免跨局串状态。

### 关卡与窄屏降列

- `levelConfig(level)` 按递进表返回 `{ level, pairs, cols, rows }`，`rows = pairs×2 ÷ cols`；越界关号收敛 1-12。
- 列数由 JS 写入 `grid[data-cols]`，CSS 按属性选择器声明列数（数据与样式解耦）；窄屏断点 `≤480px` 时 `data-cols="6"` 降为 4 列、`≤350px` 降为 3 列，数据不变，卡牌 `aspect-ratio: 3/4; min-height: 44px` 保证触控目标。

### 星级与存档

- `starRating(flips, pairs)`：`≤ pairs×2` 三星、`≤ pairs×2.5` 两星、其余一星（15 对时 37→2 星、38→1 星）。
- 键：`memory-match-unlocked-level`、`memory-match-stars-<level>`、`memory-match-best-<level>`、`memory-match-tip-dismissed`；读写均 try/catch，异常退回 `memoryFallback` 对象。
- `saveUnlockedLevel`：新值大于已存值才写入（通关传 `level + 1`，clamp 不超 12）；`saveStars` 取历史最大；`saveBest` 取历史最小（0 表示无记录，非法输入不写）。

### 技术决策

1. **两段洗牌而非「先抽后置乱」**：第一段决定本关用哪些图案（同主题不同关牌面有差异），第二段决定位置分布；两段共用一个 random 序列，单种子即可完整复现。
2. **3D 翻转放在内层 span 而非 button 本体**：`perspective` 留在 button、`transform-style: preserve-3d` 放 `.card-inner`，避免按钮自身 transform 与焦点描边互相干扰；正反面 `backface-visibility: hidden` + 正面预旋转 180°，无需 JS 管理中途态。
3. **防连点用状态位而非禁用全部按钮**：`locked` 只在失败回翻窗口与通关结算前为真，配对成功后不锁全局，孩子可以立刻继续翻下一对，节奏更顺。
4. **玩法说明用可关闭提示条而非弹窗**：首次进入横幅展示、点「知道了」后写 `memory-match-tip-dismissed` 永久隐藏，不打断进入游戏；比强制弹窗对儿童更友好。
5. **跨沙箱比较退化处理**：vm 子 realm 对象与测试 realm 原型不同，牌阵比较统一用 `JSON.stringify` 字符串而非 `deepStrictEqual` 原对象。

## 界面原型

主界面（第 1 关 3×4，移动端 390px 基准）：

```text
┌──────────────────────────────────────┐
│ [← 返回]（悬浮）                       │
│ Memory Match           ┌──────────┐  │
│ 记忆翻牌                │ 第 1 关  │  │
│ ┌──────────────────────────────────┐ │
│ │ 玩法说明：每次翻开两张卡，图案相同…  │ │
│ │            [ 知道了 ]  ← 提示条    │ │
│ └──────────────────────────────────┘ │
│ ┌────────┐ ┌────────┐ ┌────────┐     │
│ │ 翻牌 3  │ │ 已配对 │ │ 本关最佳│    │
│ └────────┘ └────────┘ └────────┘     │
│ ┌───┐ ┌───┐ ┌───┐                    │
│ │░?░│ │🐱 │ │░?░│   ░?░ = 卡背        │
│ └───┘ └───┘ └───┘   （渐变+圆点+?）   │
│ ┌───┐ ┌───┐ ┌───┐                    │
│ │░?░│ │░?░│ │░?░│                    │
│ └───┘ └───┘ └───┘                    │
│ …（共 3 列 × 4 行）                   │
│  [  重开本关  ]     [  关卡选择  ]     │
└──────────────────────────────────────┘
```

主要状态：

```text
配对成功：两张卡绿框 + 光晕，mmBounce 轻微弹跳，保持正面，可立即继续翻
┌───┐ ┌───┐
│🐱 │ │🐱 │  ← is-matched（success 描边 + glow）
└───┘ └───┘

配对失败：两张保持正面 800ms（locked，点任何卡无效）后自动翻回卡背
┌───┐ ┌───┐        800ms 后
│🐶 │ │🐰 │  ────────────▶  ░?░  ░?░
└───┘ └───┘

结算弹窗：                          关卡选择弹窗：
┌──────────────────┐            ┌──────────────────────┐
│   Level Clear    │            │      选择关卡          │
│  全部配对成功！    │            │  1★★  2★☆  3未挑战 4🔒 │
│   ★ ★ ☆（依次弹出）│            │  5🔒  6🔒  7🔒   8🔒   │
│ 翻牌 9 ｜ 历史 8   │            │  …（未解锁禁用 🔒）     │
│ [再玩一次][下一关] │            │      [返回游戏]        │
└──────────────────┘            └──────────────────────┘
```

状态说明：无 loading 态（牌阵同步生成）；错误态即失败回翻提示，不弹窗、不惩罚；结算与关卡选择为居中弹窗；提示条仅首次进入出现。

## 交互与异常

### 操作流程

1. 页面加载 → 提示条按存档决定显隐 → `startLevel(loadUnlockedLevel())`：生成牌阵、渲染卡背网格、记分板归零（最佳显示历史最少翻牌次数或 `--`）。
2. 点卡 → `handleCardTap` 按状态机处理：翻开 / 判定 / 弹跳高亮或锁定回翻；`aria-label` 随翻面同步更新（「第 n 张卡：emoji」/「背面朝上」）。
3. 全部配对 → 延迟 700ms 弹结算：`starRating` 计星（星星 `mmStarPop` 依次弹出）、`saveBest` / `saveStars` / `saveUnlockedLevel` 落档；第 12 关隐藏「下一关」。
4. 「关卡选择」→ `renderLevelPicker()` 渲染 12 关（未解锁禁用 🔒、当前关高亮、已通关显示 ★☆）；「重开本关」清理定时器并重置本关。
5. 键盘可达：全部交互为原生 `<button>`，聚焦后回车 / 空格触发；卡阵 `aria-live="polite"`。

### 边界表

| 场景 | 处理 |
| --- | --- |
| localStorage 不可用（隐私模式） | try/catch 退内存兜底，本局可玩，不报错 |
| 连点同一张 / 已配对的卡 | `revealed` 标记拦截，忽略点击 |
| 失败回翻窗口内连点其他卡 | `locked` 状态拦截，800ms 后统一解锁 |
| 重开 / 切关时有未决回翻定时器 | `startLevel` 先 `clearTimeout` 再重置状态 |
| 全部 12 关通关 | 结算弹窗隐藏「下一关」，可再玩一次或从关卡选择进入 |
| 越界关卡号 | `clampLevel` 收敛到 1-12 |
| 对数超出主题池 / 退化值 | `buildDeck` 按池上限收敛，最小 1 对 |
| 窄屏 6 列卡阵溢出 | `≤480px` 降 4 列、`≤350px` 降 3 列，卡牌最小 44px |
| 存档被手动改小 | 解锁 / 星级 / 最佳读写逻辑取大 / 取小，只保留更优值 |

### 验证方式

1. `node src/memory-match/smoke.test.js`（node + vm + assert，Map 桩 localStorage），已覆盖：
   - 文件与目录契约：viewport-fit=cover、user-scalable=no、`../js/game-back.js` 挂载（且在 script.js 之后）、标题约定、3D 翻转与 reduced-motion 样式、页头避让返回按钮留白、目录注册 `slug: "memory-match"` 与 `mobilePath`；
   - 主题池 ≥5 组、每组 ≥18 个不重复 emoji；`buildDeck` 12 关 × 多种子：长度 2×pairs、每 pairId 恰 2 张、同种子复现、不同种子多数分布不同、卡面无重复配对、越界兜底；
   - `evaluatePair` 正反例（含空值）；`starRating` 边界（6/15/18 对的 ×2 与 ×2.5 前后）；
   - 关卡递进表逐关比对（对数 / 列数 / 行数）、越界兜底、主题轮换覆盖全部主题；
   - 存档：解锁只增不减、星级保最大、最佳保最少翻牌、全部键 `memory-match-` 前缀。
2. 浏览器 smoke：以 node smoke + 静态结构核对为准（本任务未跑 GUI 自动化）。
