---
doc_id: CON-GH001
doc_type: contract
module: game-hub
status: superseded
last_updated: 2026-10-08
related:
  - doc/requirements/game-hub/age-filter.md
  - doc/design/game-hub/age-filter.md
---

# 游戏平台 · 首页目录适龄分类结构（CON-GH001 · 已落地）

> 状态：已落地为 `src/data/games.js`（最终事实来源，2026-10-08 起）。本文件仅保留结论与来源链接，字段结构以代码为准，不再维护第二份完整定义。

## 落地结论

- `GAME_CATALOG` 条目的 `meta` 字段为 `null` 或 `{ age: "kids" | "adult" | "all", device?: "desktop" | "mobile" | "all" }`。
  - `age`：缺失/非法按 `"all"` 兜底（2026-10-08 落地）。
  - `device`：REQ-GH002 / DES-GH002 增量扩展，缺失/非法同样按 `"all"` 兜底（2026-10-08 落地）。
- `meta` 缺失、缺少 `age` 键或取值非法时，消费方（`src/js/app.js` 的 `normalizeAge`）一律按 `"all"` 兜底，不抛错、不隐藏条目。
- 筛选语义为包含关系：儿童 Tab = kids + all，成人 Tab = adult + all，全部 Tab = 全量；设备维度同理（电脑端 = desktop + all，移动端 = mobile + all），两维度叠加时列表展示交集。

## 原草案要点（历史存档）

- 阶段 0 期间约定：`meta` 从占位 `null` 扩展为对象，仅增不改顶层结构；消费方经统一归一化函数读取 `meta.age`。

## GAME_CATALOG 条目结构扩展

现有结构（`src/data/games.js`，消费方 `src/js/app.js`）保持不变，仅 `meta` 字段从占位 `null` 扩展为对象：

```json
{
  "slug": "math-hero",
  "title": "数学小勇士",
  "path": "src/math-hero/index.html",
  "mobilePath": "src/math-hero/index.html",
  "icon": "img/game.svg",
  "desc": "……",
  "readme": null,
  "meta": { "age": "kids" }
}
```

## meta.age 字段

| 属性 | 约定 |
| --- | --- |
| 类型 | 字符串枚举：`"kids"` / `"adult"` / `"all"` |
| 缺省语义 | 整个 `meta` 为 `null`、缺少 `age` 键、或取值不在枚举内时，消费方一律按 `"all"` 处理（展示于全部 Tab），禁止因数据缺失抛错或隐藏条目 |
| 业务含义 | 见 REQ-GH001「关键业务对象」：kids=儿童专属、adult=成人向、all=全龄 |

## 消费规则

- 消费方只有 `src/js/app.js`；Tab 过滤逻辑统一经过同一个归一化函数读取 `meta.age`，不允许多处各自判断。
- `meta` 结构为增量扩展：未来如需追加字段（如适龄徽章文案、分龄上下限），在 `meta` 对象内扩展，不改条目顶层结构。
