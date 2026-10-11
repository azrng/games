---
doc_id: DES-SP001
doc_type: design
module: shopping-cashier
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/shopping-cashier/core-game.md
---

# 购物小掌柜 · 核心玩法（DES-SP001）

## 需求追溯

- 关联 REQ-SP001，覆盖其全部「本次覆盖」范围（1-6 项），无未覆盖项。
- 「本次不覆盖」项（音效、多语言、后台配置、真实货币素材、家长报表）均不涉及本设计。
- 档位数值、星级规则、存档键名以 REQ-SP001「关键业务对象」为准；本设计补充实现结构、原型与异常处理。

## 技术设计

### 模块职责与数据流

```text
script.js（IIFE + 'use strict'，挂 window.CashierApi）
├─ 纯函数层（node + vm 可直接测试）
│   levelConfig(level) ──▶ { mode, priceMin, priceMax, paid?, denominations }
│   denominations(level) ──▶ 本关开放面额（取自 levelConfig）
│   generateOrder(level, seed) ──▶ { item:{emoji,name}, price, paid?, customer }
│   computeChange(paid, price) / orderDue(order) ──▶ 本单目标金额 Z
│   evaluatePayment(selected, due) ──▶ { result: 'exact'|'over'|'short', diff, total }
│   coinCountSummary(selected) ──▶ [{ value, count }] 面额张数汇总（降序）
│   greedyBreakdown(amount, denominations) ──▶ 贪心拆分或 null（可表示性校验）
│   starRating(mistakes) ──▶ 3 | 2 | 1
│   loadUnlockedLevel/saveUnlockedLevel、loadStars/saveStars ──▶ 存档（只增不减/保留最大）
└─ UI 层
    startLevel ──▶ renderMoneyButtons + loadOrder(0)
    loadOrder ──▶ updateOrderView / updateTrayView / updateProgressView
    addNote/removeNote/clearTray ──▶ 付款台选中面额数组
    submitPayment ──▶ handleExact（成功动画 + 弹窗）或差额提示（失误 +1）
    finishLevel ──▶ saveStars + saveUnlockedLevel ──▶ 结算弹窗（星级/下一关）
```

- 结构完全沿用 `src/lights-out/` 模式：IIFE 传 `window`/`document`、mulberry32 种子随机、`safeGetItem/safeSetItem` 内存兜底、`vm` 沙箱测试。
- 种子：`levelSeed(level) = (BASE_SEED + level * 6271) >>> 0`，`orderSeed = (levelSeed + orderIndex * 7919) >>> 0`，同关同单号跨会话可复现。
- 商品池 34 条 `{ emoji, name, minPrice, maxPrice }`（≥24）；生成价格时取「商品区间 ∩ 关卡值域」交集后抽整数，保证值域正确。
- 存档键：`shopping-cashier-unlocked-level`、`shopping-cashier-stars-<level>`（STARS_KEY_PREFIX `shopping-cashier-stars-`）。

### 技术决策

1. **价格取商品区间与关卡值域交集**：商品自带生活化价格带（棒棒糖 1-5 元、书包 30-90 元），交集既保证「价格在档位值域内」，又避免低关卡抽出书包、高关卡全是糖果的失真感；交集为空时回退全池并按关卡值域兜底。
2. **找零可表示性靠结构保证 + 贪心校验兜底**：1 元面额全关卡恒开放，任意整数元找零必然可组合；`greedyBreakdown` 同时作为生成侧兜底与 smoke 测试的组合校验工具（面额体系 {1,5,10,20,50} 为贪心规范体系）。
3. **找零档不预显示 Z**：题面只给「应收 X / 顾客付了 Y」，保留心算训练；付错后的差额提示（多了/还差 N 元）按 REQ 允许，作为儿童反馈通路。
4. **付款台用面额数组 `selected`**：`evaluatePayment/coinCountSummary` 均以数组为入参、纯对象出参，天然可序列化、vm 沙箱可测；撤回一张 = `lastIndexOf + splice`。
5. **通关循环不新增路由**：第 12 关结算后「下一关」按钮文案切换为「从头再玩」，复用同一 `next-btn`。
6. **关卡起始点**：进入页面从最高已解锁关开始（不单独持久化 current-level，存档面收敛为 REQ 规定的两类键）。

### 样式要点

- 自包含 CSS，`:root` 全部 `--sc-` 前缀；儿童向暖色明亮主题（奶油底 + 橙色主按钮）。
- 1 元为银色圆形硬币（径向渐变 + 内高光），5/10/20/50/100 元为纸币色块（对角渐变 + 白色内描边，紫/蓝/棕/绿/红贴近真实人民币主色但卡通化）；未开放面额 `disabled` 置灰。
- 触控目标：面额按钮 ≥ 64px 高（硬币 68px 圆）、付款台标签 44px、动作按钮 48-56px。
- 移动端 `.game-shell` 顶部 padding 追加 44px 避让悬浮返回按钮（合计 ≥ 56px）。

## 界面原型

主界面 · 凑整付款态（第 6 关，已放 10 元 + 5 元，付错一次后的差额反馈）：

```text
┌────────────────────────────────────────┐
│ [返回]  Shopping Cashier               │
│         购物小掌柜            ┌第 6 关┐ │
│  ● ● ○ ○ ○                    失误 1 次 │
│ ┌────────────────────────────────────┐ │
│ │ (🧒) 我想买「玩偶熊」                │ │
│ │  ┌──────┐   ┌────────┐             │ │
│ │  │  🧸  │   │  24元  │ ◀─ 价签     │ │
│ │  └──────┘   └────────┘             │ │
│ └────────────────────────────────────┘ │
│ ┌─ 付款台 ─────────────────已付 15 元─┐ │
│ │   (5元 × 1)  (10元 × 1)  ◀点标签撤回 │ │
│ └────────────────────────────────────┘ │
│        还差 9 元，调整一下再试试！        │
│ ┌──────┐  ┌──────┐  ┌──────┐          │
│ │(1元) │  │ 5元  │  │ 10元 │          │
│ │硬币  │  │纸币  │  │纸币  │          │
│ └──────┘  └──────┘  └──────┘          │
│ ┌──────┐  ┌──────┐  ┌──────┐          │
│ │ 20元 │  │ 50元 │  │100元 │(置灰)     │
│ └──────┘  └──────┘  └──────┘          │
│ ┌──────────── 付账 ────────────┐       │
│ └──────────────────────────────┘       │
│ ┌─ 清空 ─┐   ┌─ 重开 ─┐  ┌─ 关卡 ─┐    │
│ └────────┘   └────────┘  └────────┘    │
└────────────────────────────────────────┘
```

找零态（第 10 关，只多一条「应收/顾客付了」提示条，目标金额不展示）：

```text
│ (👵) 我想买「书包」                      │
│   🎒 书包      ┌ 36元 ┐                 │
│ ┌────────────────────────────────────┐ │
│ │ 应收 36 元，顾客付了 50 元，请找零    │ │
│ └────────────────────────────────────┘ │
│ 付款台 已付 0 元 —— 玩家需自己凑出 14 元  │
```

结算弹窗（本关第 5 单完成，星级入档）：

```text
┌──────────────────────────────┐
│         Level Clear          │
│        第 6 关完成！           │
│           ★ ★ ☆             │
│        本关失误 1 次           │
│  ┌─ 再玩一次 ─┐ ┌─ 下一关 ─┐  │
│  └────────────┘ └───────────┘  │
└──────────────────────────────┘
```

状态说明：反馈区三态——默认引导语（灰）、付错警告（红 + 抖动动画）、付对表扬（绿 + 弹跳动画）；单订单成功弹窗隐藏星级区，仅显示「已完成 n/5 单」；关卡选择弹窗列出 1~最高解锁关，已获星关卡金色描边、当前关橙色高亮。

## 交互与异常

### 操作流程

1. 页面加载 → `startLevel(loadUnlockedLevel())` 渲染首单与全部 6 个面额按钮（未开放置灰）。
2. 点面额按钮 → `selected` 追加 → 付款台金额与张数实时刷新；点付款台面额标签撤回一张；「清空」一键清空。
3. 点「付账」→ `evaluatePayment`：
   - `exact` → 成功反馈 + 750ms 动画 → 中途单弹「算对了（n/5）」，第 5 单弹结算（星级 + 解锁下一关）。
   - `over`/`short` → 失误 +1、提示「多了/还差 N 元」，可继续调整重复付账，直到付对。
4. 「关卡」→ 弹窗列出已解锁关卡（含星级标记）；「重开」→ 重置本关（失误清零、回到第 1 单）。
5. 键盘可达：全部控件为原生 `<button>`，聚焦后回车/空格等效。

### 边界与异常处理

| 场景 | 处理 |
| --- | --- |
| localStorage 读写异常（隐私模式/沙箱） | `safeGetItem/safeSetItem` 退化为内存对象，游戏可玩、不报错 |
| 付款台为空点「付账」 | 轻提示「先点下面的面额放点钱吧」，不计失误 |
| 找零可能为 0 元 | 第 11-12 关价格上限取 99 元，结构性保证 Z ≥ 1 |
| 商品区间与关卡值域无交集 | 过滤后候选为空时回退全池，并按关卡值域兜底抽价 |
| 未开放面额被点按 | 按钮 `disabled`，`addNote` 内再做开放校验双保险 |
| 12 关通关后再点「下一关」 | 文案已是「从头再玩」，回到第 1 关 |
| 结算动画期间连点 | `state.locked` 锁定输入，动画结束进入弹窗后统一恢复 |

### 验证方式

1. `node src/shopping-cashier/smoke.test.js`（node 原生 assert + vm 沙箱 + Map 桩 localStorage）：
   - 场景 A：文件与目录约定断言（viewport、脚本引入顺序、`--sc-` 变量、返回脚本、games.js 注册）。
   - 场景 B：`generateOrder` 12 关 × 多种子——同种子可复现、价格值域正确、找零档 Z ≥ 1 且贪心拆分可精确重组。
   - 场景 C：`evaluatePayment` 恰好/多/少与差额、`computeChange`、`coinCountSummary`、`orderDue`。
   - 场景 D：星级边界、档位递进、存档 unlocked 只增不减、stars 保留最大值。
   - 收尾输出 `shopping cashier smoke test passed`。
2. 浏览器 smoke：真实走通「凑整付款 → 付错提示 → 付对 → 下一单 → 结算 → 下一关」与找零关样本；390px 视口无横向溢出、返回按钮不遮挡标题。
