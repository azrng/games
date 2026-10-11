---
doc_id: REQ-PQ001
doc_type: requirement
module: pattern-quest
status: approved
last_updated: 2026-10-10
related:
  - doc/design/pattern-quest/core-game.md
---

# 图案找规律 · 核心玩法（REQ-PQ001）

## 背景

平台儿童向游戏缺少经典的「图案序列找规律」益智玩法。`src/data/games.js` 已注册 `pattern-quest` 条目（移动端路径 `src/pattern-quest/index.html`，儿童向、双端可玩），需要按仓库「纯静态、无构建、自包含」的约定补齐游戏本体实现。

## 目标与范围

**本次覆盖**：
1. 12 关 × 每关 6 题的图案规律闯关：题面顶部一排图案序列卡（最后一张是「?」卡），下方 4 个备选卡点选作答。
2. 四档规律类型递进：二元素循环 → 三元素循环 / 数量递增 → 颜色交替 / 形状数量混合 → 四元素循环 / 双属性 / 更长序列。
3. 答对 ✅ 动画并自动进入下一题；答错备选卡抖动、温和提示，可重选其余卡片；首次作答结果计入星级。
4. 星级规则（首答全对 3 星、首答答对 ≥4 题 2 星、其余 1 星）、解锁进度与每关星级存档（键前缀 `pattern-quest-`）。
5. 关卡选择弹窗（未解锁关卡禁用展示）与重开本关按钮。

**本次不覆盖**：首页入口与目录数据调整（`src/data/games.js` 已注册，不改）、平台级组件、其他游戏。

## 用户角色

- 3-8 岁儿童：以触屏点选为主，需要大触控目标、明亮配色、即时且温和的对错反馈。
- 家长 / 成人：通过关卡选择弹窗与星级了解孩子进度，可随时重开或换关。

## 页面清单

- `src/pattern-quest/index.html`（唯一页面，自包含）
- `src/pattern-quest/style.css`（自包含样式，`:root` 变量以 `--pq-` 为前缀）
- `src/pattern-quest/script.js`（游戏逻辑，纯函数挂 `window.PatternApi` 供测试）
- `src/data/games.js`（已注册条目，本次不改）

## 核心业务流程

1. 进入页面自动进入最新解锁关（无存档从第 1 关开始）。
2. 每题展示序列与「?」卡，下方 4 张备选卡：
   - 点中正确项：备选卡 ✅ 动画、「?」卡揭示正确图案、约 1 秒后自动进入下一题；
   - 点错：该卡抖动并禁用，提示语温和，其余卡片可继续重选；本题首次作答不再计为首答正确。
3. 每关 6 题答完弹出结算：星级 + 首答答对数；保存历史最高星级并解锁下一关；第 12 关通关后结算不再出现「下一关」。
4. 「关卡选择」可随时切换到任意已解锁关卡；「重开本关」重置当前关 6 题与首答计数。

## 关键业务对象

1. 图案项 `{ shape, count, tint }`：`shape` 为 emoji（动物 / 水果）或 CSS 图形名（circle / square / triangle / diamond）；`count` 为数量（emoji 重复渲染个数）；`tint` 为颜色键（red / blue / green / amber / purple，`null` 表示 emoji 原色）。
2. 规律对象（三 Kind，全部可用 `applyRule` 求值）：

| Kind | 求值规则 | 适用题型 |
| --- | --- | --- |
| `cycle` | 循环节原样重复 | ABAB / AABB / ABC / ABCD / 颜色交替 / 形状数量混合 / 长序列 |
| `grow` | 数量 = start + step × index | 数量递增 |
| `combo` | 形状按循环节循环，数量 = countStart + countStep × index | 形状循环 × 数量递增 |

3. 题型档位（12 关 × 6 题递进）：

| 关卡 | 档位 | 题型集合 | 展示项数量 |
| --- | --- | --- | --- |
| 1-3 | 1 | ab（ABAB）/ aabb（AABB，动物水果 emoji） | 4 |
| 4-6 | 2 | abc（ABCABC）/ grow（数量递增） | 3-5 |
| 7-9 | 3 | tint（同形状颜色交替，纯 CSS 图形）/ mixed（形状循环 + 数量 1、2 交替） | 5-6 |
| 10-12 | 4 | abcd（四元素循环）/ combo（形状循环 × 数量递增）/ long（展示 7-9 项求第 8-10 项） | 4-9 |

4. 选项生成：正确项 + 3 个干扰项；干扰项来自「同形状不同数量 / 同数量不同形状（或同形状不同色调）/ 序列外元素」三类策略，全部与正确项互异且彼此互异。
5. 星级：`starRating(correct, total)`，6 题全对 3 星、答对 ≥4 题（正确率 ≥ 三分之二）2 星、其余 1 星。
6. 存档：`pattern-quest-unlocked-level`（只增不减）、`pattern-quest-stars-<level>`（保留历史最大值）；localStorage 不可用时内存兜底。

## 边界场景与异常

- localStorage 不可用（隐私模式等）：读写静默降级到内存，本局可玩、不报错；不做跨会话存档承诺。
- 全部 12 关通关：结算弹窗不再出现「下一关」按钮。
- 答错：不惩罚、不锁题，可继续重选；该卡禁用以防重复点。
- 越界关卡号（小于 1 或大于 12）：按边界关卡（1 / 12）兜底。
- 长序列（最多 9 项）在小屏：序列卡自动换行展示，不横向溢出。

## 非功能要求

- 纯静态、无构建、无新增第三方依赖；静态打开页面即可玩。
- 触控目标 ≥ 44px；`<meta viewport>` 含 `viewport-fit=cover, user-scalable=no`；顶部内容避让左上角悬浮返回按钮。
- 儿童向明亮配色，样式自包含（`--pq-*` 变量）；不依赖图片，颜色规律用纯 CSS 图形表达。
- 同种子题目完全可复现（种子随机）；`node src/pattern-quest/smoke.test.js` 直接跑通。

## 验收标准

1. 共 12 关、每关 6 题；每题题型都在该关档位声明集合内，序列长度符合档位范围（第 10-12 关长序列展示 7-9 项求第 8-10 项）。
2. 答案严格按规律推导，可用 `applyRule(rule, items, index)` 独立复核；4 个备选互异且恰好包含一个正确项。
3. 星级边界：6/6 → 3 星、≥4/6 → 2 星、其余 → 1 星；解锁进度只增不减；星级保留历史最大值；所有存储键以 `pattern-quest-` 为前缀。
4. 页面含 `viewport-fit=cover`、`user-scalable=no`，按顺序挂载 `script.js` 与 `../js/game-back.js`，标题为「图案找规律 - 游戏平台」。
5. `node src/pattern-quest/smoke.test.js` 通过并输出 `pattern quest smoke test passed`。

## 已确认记录

1. 2026-10-10 用户随开发指令确认需求并直接落地，不单独走文档评审轮次。
