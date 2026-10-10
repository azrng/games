---
doc_id: DES-IG001
doc_type: design
module: idiom-guess
status: approved
last_updated: 2026-10-10
related:
  - doc/requirements/idiom-guess/core-game.md
---

# 猜成语 · 技术设计（DES-IG001）

## 需求追溯

实现 REQ-IG001 全部验收标准；无契约文档（题库结构简单，写入数据文件头注释）。

## 数据来源与生成管道

- **常用成语主表**：antfu/handle（汉兜，MIT）的成语列表——社区验证过的常用四字成语集（约 5600 条）。
- **拼音与释义补全**：pwxcoo/chinese-xinhua（MIT）`data/idiom.json`（约 3 万条，含 pinyin 数组、explanation、derivation）。
- `src/idiom-guess/build-idiom-bank.js`（node 内置 https，零 npm 依赖，对齐 `src/pinyin-typing/build-wordbank.js` 惯例）：
  1. 拉取两数据源到系统临时目录缓存（带超时与失败重试 1 次）。
  2. 以汉兜成语表为主键，从 chinese-xinhua 匹配 `pinyin`（4 项）与 `explanation`（非空取前 120 字）；出处 derivation 取非空首条。
  3. 汉兜表中无释义的条目剔除后仍需 ≥ 900 条，不足则从 chinese-xinhua 按"4 汉字 + 拼音 4 项 + 释义非空"补足至 1000 条（种子随机抽样保证可复现）。
  4. 输出 `src/idiom-guess/idiom-bank.js`：`window.IDIOM_BANK = [{w,p,e,s}, ...]`（w 按拼音序排列去重），文件头注明两数据源、许可与筛选条件；同时输出统计摘要注释（条数）。
- 运行时兜底：`idiom-bank.js` 缺失或非法时使用 script.js 内置 30 条保底数组（`Array.isArray(window.IDIOM_BANK)` 判定，对齐 zh-poem 降级模式）。

## 技术设计

**文件结构**：`src/idiom-guess/` 六件套（四件套 + `idiom-bank.js` 数据产物 + `build-idiom-bank.js` 生成脚本；DOM 渲染对齐 `src/lights-out/` 惯例）。

**script.js 架构**：
- IIFE + 首行 `// @ts-check` + 全中文注释；常量：`SLUG = "idiom-guess"`、存档键 `idiom-stats`（单键 JSON：`{ version, last, best, total }`，last=当前连胜、best=最高连胜、total=累计猜中）、机会 9 次、提示 2 次。
- 纯函数（挂 `window.IdiomGuess` 导出）：
  - `judge(guess, answer)`：两遍扫描——第一遍标 green 并统计答案剩余字频，第二遍对非 green 位按剩余字频标 orange，其余 gray；返回 `["green","orange",...]`。
  - `pickAnswer(bank, random)`：随机取一条；`normalizeInput(text)`：过滤非汉字字符并截取 4 个，返回 `{ chars, ok }`（ok=false 表示不足 4 汉字）。
  - `revealHint(answer, greens)`：随机取一个非 green 位置返回下标。
  - `readStats()/writeStats(stats)`：`{ last, best, total }` JSON，try/catch + 内存兜底。
- 渲染：猜测行列表（历史行着色块 + 拼音小字行）、输入区文本框（`maxlength` 不设，提交时 normalize）；胜利/失败横幅复用 overlay-modal。
- 拼音展示：猜测行下小字为所猜 4 字拼音（从题库查不到的字显示 "?"，宽松处理）；答案拼音在横幅完整展示。

## 界面原型

```text
┌──────────────────────────────────────┐
│ IDIOM GUESS          连胜 3 · 最高 7 │
│              猜 成 语                 │
├──────────────────────────────────────┤
│  提示锁定：      [ 光 ]               │  ← 提示揭示字浮块
│  ┌──┬──┬──┬──┐  xīng gāo cǎi liè    │
│  │兴│高│采│烈│  全绿=猜中            │  ← 历史猜测行（着色+拼音）
│  ├──┼──┼──┼──┤                        │
│  │画│蛇│添│足│  huà shé tiān zú     │
│  ├──┼──┼──┼──┤                        │
│  │  │  │  │  │                        │  ← 剩余空行（共 9 行）
│  └──┴──┴──┴──┘                        │
│  [输入四个汉字________] [提交] [提示×2]│
│  规则：绿=字位对 橙=字对位错 灰=无此字 │
└──────────────────────────────────────┘
胜利横幅：答案大字 + 拼音 + 释义 + 出处 + 连胜/累计 + [下一局]；
失败横幅：公布答案与释义 + [下一局]；
异常态：题库缺失用保底库；存储不可用连胜显示"-"仍可玩。
```

## 交互与异常

- 输入框回车等效提交；提交后清空并保持焦点，下一行获得光标。
- 判定与着色在提交时同步完成（无异步）；历史行仅渲染不回改。
- 提示后该位置答案字以锁定样式浮块常显（不改判定逻辑，仅视觉辅助）。
- 存储读写 try/catch 静默降级；smoke 以 `window.IdiomGuess` 导出纯函数断言。
