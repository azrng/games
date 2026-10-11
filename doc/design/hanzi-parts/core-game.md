---
doc_id: DES-HZ001
doc_type: design
module: hanzi-parts
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/hanzi-parts/core-game.md
---

# 汉字拼字 · 合字工坊（DES-HZ001）

## 需求追溯

- 关联 REQ-HZ001，覆盖其全部「本次覆盖」范围：合字工坊玩法、70 字题库、12 关递进、星级、存档、关卡选择与重开。
- REQ「本次不覆盖」项（多部件字、发音、错题本、同步）同样不在本设计内。
- 技术决策 1、2 是对 REQ「边界场景与异常」中两条既定规则的落地方式说明，无范围扩张。

## 技术设计

### 模块职责与数据流

```text
hanndata.js                 script.js（IIFE）                         index.html / style.css
HanziPartsData ──▶ DATA ──▶ generateLevel(level, seed) ──▶ state ──▶ renderTargets/renderPool/renderBench
                     ──▶ tryCombine(判定范围, a, b) ──▶ 命中/未命中 ──▶ 目标卡点亮 / 抖动+失误
                     ──▶ localStorage 兜底读写 ──▶ unlocked-level / stars-<level>
```

- **`hanndata.js`**：纯数据文件，挂 `window.HanziPartsData`（70 条字条目，组合键全库唯一，smoke 测试强制校验）。仿 `src/zh-poem/poems.js` 的数据文件组织。
- **`script.js`**：单 IIFE（`'use strict'`），结构与 `src/lights-out/script.js` 对齐——纯函数与存档函数挂 `window.HanziApi`，UI 状态集中在 `state`，DOM 引用集中在 `elements`。
  - 纯函数：`combinationKey(a, b)`（部件排序拼接）、`tryCombine(data, a, b)`（在传入数组中查组合，顺序无关，返回字条目或 null）、`generateLevel(level, seed)`（mulberry32 种子随机：先抽目标字——两两组合键互异，再补干扰部件——池整体 Fisher-Yates 打乱）、`starRating(mistakes)`、`levelConfig(level)`、`levelCount()`、`levelSeed(level)`、`createSeededRandom(seed)`；存档：`loadUnlockedLevel/saveUnlockedLevel`（只增不减）、`loadStars/saveStars`（保留最大值），均经 `safeGetItem/safeSetItem` try/catch 兜底到内存对象。
  - 交互：`handlePartTap(index)` 管理选择（再点同卡取消、点第二卡触发判定）；`resolveCombination()` 以**本关目标清单**为判定范围调 `tryCombine`；成功 → 卡置灰、目标卡点亮、合成台弹结果字；失败 → 抖动 + 失误 +1；集齐后 `showWinModal()` 结算并存档。
- **`index.html`**：lights-out 式骨架；`<meta viewport>` 含 `viewport-fit=cover, user-scalable=no`；`</body>` 前依次引 `hanndata.js`、`script.js`、`../js/game-back.js`。
- **`style.css`**：自包含 `:root` `--hz-*` 变量（暖米底 + 橙/青/金儿童配色）；移动端 `@media (max-width: 680px)` 下页头 `padding-top: calc(max(16px, env(safe-area-inset-top)) + 44px)`（≥ 56px，避让悬浮返回按钮）。

### 技术决策

1. **目标字只取两个部件不同的字**：部件池要求互异（每个部件仅一张卡），`林=木+木` 这类字在池内无法拼出（需要两张「木」卡）。生成器过滤 `parts[0] !== parts[1]` 的候选；同部件字仍留在题库（`tryCombine` 全库查询可命中，亦为题库完整性保留）。
2. **判定范围是本关目标清单而非全库**：`tryCombine` 设计为接受任意字库数组；游戏层传 `state.targets`。干扰部件与所需部件可能凑出本关以外的有效字（如 氵+工=江），此时按未命中计失误并给出「拼得出来，但不是本关目标」的具体提示，避免儿童困惑，也不破坏星级规则。
3. **种子混合方式**：`generateLevel` 内部 `createSeededRandom(((seed >>> 0) + level * 7919) >>> 0)`，调用方传 `levelSeed(level)`；同 (level, seed) 输入恒定输出，满足复现要求且不同关卡自然错开。
4. **飞入动画用浮动副本**：`flyPartsToBench` 克隆选中卡为 `position: fixed` 副本，`setTimeout(16ms)` 后设置目标位移触发 CSS transition，动画结束回调结算；环境不支持 `getBoundingClientRect`（如测试桩）时跳过动画直接结算，主流程不受影响。

## 界面原型

主界面（第 1 关初始态，池 6 卡）：

```text
┌────────────────────────────────────────────┐
│ [返回]                          ┌─────────┐│
│  HANZI PARTS                    │ 第 1 关 ││
│  汉字拼字                        └─────────┘│
│ ┌──────────┬──────────┬──────────┐         │
│ │ 目标进度  │   失误    │ 当前星级 │          │
│ │   0/3    │    0     │  ★★★    │          │
│ └──────────┴──────────┴──────────┘         │
│ 本关目标                                     │
│ ┌┄┄┄┄┄┄┄┐ ┌┄┄┄┄┄┄┄┐ ┌┄┄┄┄┄┄┄┐              │
│ ┆ ？(拼音) ┆ ┆ ？     ┆ ┆ ？     ┆             │
│ ┆ ？(大字) ┆ ┆ ？     ┆ ┆ ？     ┆             │
│ └┄┄┄┄┄┄┄┘ └┄┄┄┄┄┄┄┘ └┄┄┄┄┄┄┄┘              │
│ 合成台                                       │
│ ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐                │
│ ╎   ┌┄┄┄┐   +   ┌┄┄┄┐    ╎                │
│ ╎   ┆ ？ ┆       ┆ ？ ┆    ╎                │
│ └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘                │
│      点两个部件，拼出目标清单里的字             │
│ 部件池                                       │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
│ │ 日 │ │ 月 │ │ 木 │ │ 口 │ │ 女 │ │ 子 │   │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘   │
│        [ 重开本关 ]  [ 关卡选择 ]              │
└────────────────────────────────────────────┘
```

选中 + 成功态（点「日」「月」拼出 明）：

```text
│ 部件池：日、月 两卡置灰变淡（is-used）          │
│ 目标清单：┌──────┐  明 卡点亮（is-found）：     │
│           │ míng │                            │
│           │  明  │   ← 绿框 + pop 动画          │
│           │ 明天 │                            │
│ 合成台：  ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐               │
│           ╎  明   míng · 明天  ╎ ← 结果字 pop  │
│           └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘               │
│           拼出了「明」，真棒！                   │
│ 状态栏：目标进度 1/3 · 当前星级 ★★★             │
```

失败态（点「日」「口」）与过关弹窗：

```text
│ 失败：两卡抖动（is-shaking 红边）+ 合成台红底，   │
│       失误 1，当前星级 ★★                       │
│       提示：这两个部件拼不出字，换一对试试！        │
│ （若拼出题库中非本关字：「江」拼得出来，但不是本关   │
│   目标，看看清单再试！）                         │
│ 集齐后过关弹窗：                                │
│ ┌──────────────────────────────┐              │
│ │        LEVEL CLEAR            │              │
│ │        合字成功！              │              │
│ │          ★★★                  │              │
│ │        失误 0 次               │              │
│ │  ┌──── 明 míng · 明天 ────┐   │              │
│ │  ┌──── 林 lín · 树林 ────┐    │              │
│ │  ┌──── 好 hǎo · 好人 ────┐   │              │
│ │  [ 再玩一次 ]  [ 下一关 ]     │              │
│ └──────────────────────────────┘              │
```

状态说明：无 loading 态（纯同步渲染）；合成台有空槽/半选/结果三种内容态；关卡选择弹窗内关卡分 可点/当前/锁定 三态。

## 交互与异常

### 操作流程

1. 载入 → `startLevel(min(unlocked, levelCount()))` → 渲染目标/池/合成台，进入可玩态。
2. 点部件卡 → 选中高亮 + 合成台槽位更新；再点同卡取消；点第二卡 → 锁定 → 飞入动画 → 判定 → 成功/失败分支 → 解锁。
3. 成功集齐 → 650ms 后过关弹窗：`saveStars`（取最大）、`saveUnlockedLevel`（只增）、渲染所学字列表；「下一关」末关自动隐藏。
4. 键盘/读屏：部件卡为原生 `<button>`（≥44px 触控，含 aria-label）；目标卡与合成台带 aria 标注。

### 边界与异常处理

| 场景 | 处理 |
| --- | --- |
| 点已消耗（is-used）的卡或动画锁定中 | 直接忽略，状态不变 |
| 干扰+所需部件凑成题库内非目标字 | 计失误 + 具体提示「不是本关目标」，不展示该字详情 |
| 同部件字（林/朋/从/双/炎） | 不进入目标抽取；题库查询仍可命中 |
| localStorage 抛错 | `safeGetItem/safeSetItem` 兜底到内存对象，进度本次会话内有效 |
| 题库文件未加载 | `DATA = []`，页面渲染骨架不抛错 |
| 末关（12）过关 | 「下一关」隐藏；解锁值停在 13，星级照常记录 |

### 验证方式

1. 冒烟测试 `node src/hanzi-parts/smoke.test.js`（node + assert + fs + vm 沙箱，localStorage 用 Map 桩，脚本加载顺序与页面一致：先 hanndata.js 后 script.js）：
   - 文件与目录约定：viewport-fit=cover、user-scalable=no、hanndata.js、../js/game-back.js、目录 slug/mobilePath。
   - 题库：≥48 字、恰 2 部件、pinyin/word 非空、组合键全库唯一、tryCombine 正反例（含同部件字与顺序无关）。
   - 12 关生成：档位数、目标部件对互异、池规模/互异/含全部所需部件、任意顺序可拼、同种子可复现（另抽 12×20 组种子）。
   - 星级边界（0/1/3/4/99）与存档（解锁只增、星级取最大）。
   - 存储异常兜底：localStorage 抛错时退化为内存且主流程可跑。
2. 浏览器手测要点：三档关卡界面换行正常、点选/取消/连点、成功与失败动画、过关与关卡弹窗、返回按钮悬浮不遮挡页头。
