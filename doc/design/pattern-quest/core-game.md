---
doc_id: DES-PQ001
doc_type: design
module: pattern-quest
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/pattern-quest/core-game.md
---

# 图案找规律 · 核心玩法（DES-PQ001）

## 需求追溯

- 关联 REQ-PQ001，覆盖其全部「本次覆盖」范围，无遗留项。
- 结构与风格基准：对齐 `src/lights-out/`——IIFE + `'use strict'`、纯函数挂 `window.PatternApi` 供测试、mulberry32 种子随机、localStorage try/catch 内存兜底、vm 沙箱 smoke 测试。
- 本设计未覆盖 REQ 项：无（REQ「本次不覆盖」的平台层改动本设计亦不涉及）。

## 技术设计

### 模块职责与数据流

```text
script.js（单文件，IIFE）
  题型表 PATTERN_TYPES / 档位表 LEVEL_TYPES
        │  puzzleSeed(level, index) 确定性种子
        ▼
  generatePuzzle(level, seed) ──▶ { type, rule, unit, sequence, answer, options, patternDesc }
        │                              │ applyRule(rule, unit, i) 逐项求值（答案同源推导）
        ▼                              ▼
  渲染：序列卡 + 「?」卡          generateOptions(answer, rule, seed) 4 选卡
        │
        ▼
  点击判定 tilesEqual(option, answer) ──▶ 对：✅ 揭示 → 下一题 / 结算
                                        └─▶ 错：抖动禁用，可重选
  存档：saveUnlockedLevel（只增）/ saveStars（保最大）──▶ localStorage（兜底内存）
```

- `index.html`：`main.game-shell`（页头 + 进度条 + 序列区 + 备选区 + 操作栏）与两个 `overlay-modal` 弹窗（结算 / 关卡选择）；`</body>` 前依次引入 `script.js` 与 `../js/game-back.js`。
- `style.css`：自包含，`:root` 内 `--pq-*` 变量；彩色圆点 / 方块 / 三角 / 菱形为纯 CSS 图形（`clip-path` + 主题色），emoji 变色不依赖图片或 filter。
- `smoke.test.js`：node 原生 `assert` + `fs` + `vm` 沙箱（Map 桩 localStorage、最小 document 桩），直接执行 `script.js` 全文。

### 规律模型

三个 Kind 覆盖全部题型，`items` 统一传循环节（grow 时为单元素数组）：

| Kind | applyRule 求值 | 题型示例（循环节） |
| --- | --- | --- |
| `cycle` | `items[index % items.length]` 原样 | ab `[A,B]`、aabb `[A,A,B,B]`、abc `[A,B,C]`、abcd `[A,B,C,D]`、tint `[红圆,蓝圆]`、mixed `[A×1,B×2]`、long `[A,B,C]` |
| `grow` | `{...items[0], count: start + step*index}` | grow `[🍎×1]` → 1,2,3,4 |
| `combo` | `{...items[index % len], count: countStart + countStep*index}` | combo `[A,B]` → A1 B2 A3 B4 A5 |

答案恒为 `applyRule(rule, unit, sequence.length)`，与展示序列同源推导，天然无歧义。

### 题型档位表

| 关卡 | 档位 | 题型（types，`patternTypesForLevel` 返回序） | 展示项 show | 档位范围 |
| --- | --- | --- | --- | --- |
| 1-3 | 1 | `ab` / `aabb` | 4 | 4-4 |
| 4-6 | 2 | `abc`(5) / `grow`(3) | 3-5 | 3-5 |
| 7-9 | 3 | `tint`(6) / `mixed`(5) | 5-6 | 5-6 |
| 10-12 | 4 | `abcd`(6) / `combo`(4) / `long`(7-9 随机) | 4-9 | 4-9 |

- 素材分池：动物（第 1 档、mixed）、水果（abc / grow / combo / long），`ab` / `abcd` 随机取池；tint 关形状取 circle / square / triangle / diamond，颜色取 red / blue / green / amber / purple 中 2 色。
- `levelConfig(level)` 返回 `{ level, band, puzzles: 6, types, showMin, showMax }`，档位范围与题型 show 声明互相校验（smoke 断言）。

### 选项生成算法（generateOptions）

1. 按 `tileKey = tint|shape|count` 建去重表，正确项先占位。
2. 三个干扰桶：`sameShapeDiff`（同形状不同数量；tint 题为同形状不同色）、`sameCountDiff`（同数量不同形状 / 同色不同形）、`outside`（形状与数量或颜色均不同，即序列外元素）。
3. 每桶种子洗牌后各取第 1 个，再按序补足 3 个；不足时从全素材库防御性补齐（正常路径不会触达）。
4. 正确项 + 3 干扰项整体再洗牌输出，正确项位置随种子变化。

### 存档与星级

- 键：`pattern-quest-unlocked-level`、`pattern-quest-stars-<level>`；读写均 try/catch，异常时退回 `memoryFallback` 对象。
- `saveUnlockedLevel`：新值大于已存值才写入（通关时传 `level + 1`，`clampLevel` 兜底不超 12）。
- `saveStars`：与历史值取最大后写入；`loadStars` 默认 0、上限 3。
- `starRating(correct, total)`：全对 3 星；`correct × 3 ≥ total × 2` 得 2 星；其余 1 星（6 题下 ≥4 题即 2 星）。

### 技术决策

1. **颜色规律用纯 CSS 图形而非 emoji 变色**：CSS 无法稳定改 emoji 本体颜色，`clip-path` 图形 + 主题色即可表达「同形状不同颜色」，且无图片依赖。
2. **数量用 emoji 重复渲染**：保持图案化表达（🍎🍎🍎 而非数字 3），count ≥ 4 缩小字号防撑卡。
3. **全链路种子随机**：题型抽取、循环节构造、show 长度（long 型 7-9）、选项洗牌全部走 mulberry32；选项用派生种子 `(seed + 40503)`，同 `(level, seed)` 完全复现。
4. **首答判定收敛在点击处**：`firstTry` 仅在加载新题时重置，答错立即置 false，重选答对只加进度不加首答数。
5. **跨沙箱比较退化处理**：vm 子 realm 对象与测试 realm 原型不同，测试统一用 `tileKey` 字符串与签名对象比较，而非 `deepStrictEqual` 原对象。

## 界面原型

主界面（答题态，移动端 390px 基准）：

```text
┌──────────────────────────────────────┐
│ [← 返回]（悬浮）                      │
│ Pattern Quest          ┌──────────┐  │
│ 图案找规律              │ 第 3 关  │  │
│ 第 2 / 6 题 ▓▓▓░░░░  首答答对 1       │
│ ┌──────────────────────────────────┐ │
│ │  🐶   🐱   🐶   🐱   ╱?╲          │ │
│ │                    ╲_╱ ←「?」卡    │ │
│ │   (规律提示：两个图案轮流出现)       │ │
│ │   想一想，「?」处应该放哪一张？       │ │
│ └──────────────────────────────────┘ │
│ ┌─────────────┐   ┌─────────────┐    │
│ │     🐶      │   │     🐰      │    │
│ └─────────────┘   └─────────────┘    │
│ ┌─────────────┐   ┌─────────────┐    │
│ │     🐱      │   │     🐻      │    │
│ └─────────────┘   └─────────────┘    │
│  [  重开本关  ]     [  关卡选择  ]     │
└──────────────────────────────────────┘
```

主要状态：

```text
答对态：正确备选卡绿框 + 右上角 ✅ 弹跳（pqPop），
        「?」卡翻出正确图案（pqReveal），约 950ms 后自动下一题
答错态：点错的卡红框抖动（pqShake）并禁用变淡，
        提示「不对哦，再想想其他卡片～」，其余三张可继续点选
颜色交替题（tint）：序列卡内渲染纯 CSS 圆形，如 ●红 ●蓝 ●红 ●蓝 ●红 ●蓝 ？
结算弹窗：                       关卡选择弹窗：
┌──────────────────┐            ┌──────────────────────┐
│   Level Clear    │            │      选择关卡          │
│   规律小达人！     │            │  1★  2★★  3★★★  4🔒  │
│     ★ ★ ☆        │            │  5🔒  6🔒  7🔒   8🔒   │
│ 首次答对 5 / 6 题  │            │  …（未解锁禁用 🔒）     │
│ [再玩一次][下一关] │            │      [返回游戏]        │
└──────────────────┘            └──────────────────────┘
```

状态说明：无 loading 态（纯同步生成）；错误态即答错抖动提示，不弹窗、不惩罚；结算与关卡选择为底部浮层式居中弹窗。

## 交互与异常

### 操作流程

1. 页面加载 → `startLevel(loadUnlockedLevel())` → 生成第 1 题：渲染序列卡、「?」卡、规律提示、4 张备选卡，进度条归零。
2. 点击备选卡：正确 → 全部备选禁用、正确卡 `is-correct`、「?」卡揭示、约 950ms 后 `advanceQuestion()`；错误 → 该卡 `is-wrong` 抖动并禁用，提示语更新。
3. 第 6 题答对后弹结算：`starRating(state.correct, 6)` 计星，`saveStars` / `saveUnlockedLevel` 落档，「下一关」在通关第 12 关时隐藏。
4. 「关卡选择」→ `renderLevelPicker()` 渲染 12 关（未解锁禁用 🔒、当前关高亮、已通关显示 ★☆）；「重开本关」重置本题状态。
5. 键盘可达：全部交互为原生 `<button>`，聚焦后回车 / 空格触发；`aria-live` 播报反馈语。

### 边界表

| 场景 | 处理 |
| --- | --- |
| localStorage 不可用（隐私模式） | try/catch 退内存兜底，本局可玩，不报错 |
| 答错后连点 | 该卡禁用；锁定态（答对动画期间）全部卡片禁用 |
| 全部 12 关通关 | 结算弹窗隐藏「下一关」，可再玩一次或从关卡选择进入 |
| 越界关卡号 | `clampLevel` 收敛到 1-12 |
| 长序列小屏溢出 | 序列卡 flex-wrap 换行；数量 ≥4 的 emoji 缩小字号 |
| 干扰项候选不足 | 三桶之外从全素材库防御性补齐，保证恒 4 互异选项 |
| 存档被手动改小 | 解锁 / 星级读取后与写入逻辑取大，只增不减 |

### 验证方式

1. `node src/pattern-quest/smoke.test.js`（node + vm + assert，Map 桩 localStorage），已覆盖：
   - 文件与目录契约：viewport-fit=cover、user-scalable=no、`../js/game-back.js` 挂载、目录注册 `slug: "pattern-quest"` 与 `mobilePath`；
   - `applyRule` 三 Kind 求值（含 grow 递增）；`generatePuzzle` 答案用 `applyRule` 独立复核、4 选项互异且恰含正确项、同种子复现、正确项位置分散；
   - 各关题型在档位声明集合内、序列长度符合档位与题型声明、越界关卡兜底；
   - 星级边界（6/6→3、4/6→2、3/6→1）、解锁只增不减、星级保最大、键前缀 `pattern-quest-`。
2. 浏览器 smoke：以 node smoke + 静态结构核对为准（本任务未跑 GUI 自动化）。
