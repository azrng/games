---
doc_id: CON-PT001
doc_type: contract
module: pinyin-typing
status: superseded
last_updated: 2026-10-09
related:
  - doc/requirements/pinyin-typing/core-game.md
  - doc/design/pinyin-typing/core-game.md
---

# 拼音打字乐园 · 存储与字库结构（CON-PT001 · 已落地）

> 状态：**superseded**。契约已随 T039 阶段 1 落地为代码，最终事实来源：
> - 存储：`src/pinyin-typing/script.js`（localStorage 键 `pinyin_typing_save_v1`，`loadSave`/`persistSave`）
> - 字库：`src/pinyin-typing/wordbank.js`（`window.PT_WORDBANK`，三档 40/60/60 条）
> 本文件只保留结构说明与变更记录，字段以代码为准。

## localStorage

- 键名：`pinyin_typing_save_v1`，单键存全部进度，JSON 序列化。
- 档位键：`sprout`（启蒙）/ `basic`（基础）/ `rocket`（挑战）/ `advanced`（进阶）。

```json
{
  "version": 1,
  "muted": false,
  "stars": {
    "sprout": { "妈": 3, "爸": 2 },
    "basic": {},
    "rocket": {},
    "advanced": {}
  },
  "bestCombo": { "sprout": 0, "basic": 0, "rocket": 0, "advanced": 0 },
  "misses": { "sprout": { "妈": 5 }, "basic": {}, "rocket": {}, "advanced": {} },
  "updatedAt": "2026-10-08T00:00:00.000Z"
}
```

字段语义：
- `stars[tier][汉字]`：该字历史最佳星级（1-3）；无记录 = 未打过 = 贴纸未点亮。贴纸进度由实现从 `stars` 派生，不单独存储。
- `misses[tier][汉字]`（2026-10-09 增补）：该字累计按错次数（小绊脚石，正整数）；无记录 = 没绊过。对局中按错只写内存，字完成时随整档落盘；该字任意一局打出 3 星即删除该键（清零）。读取时只收正整数，其余过滤为无记录；旧存档缺整个 `misses` 字段自动补默认，`version` 保持 1 不升级。
- `muted`：声音开关，跨会话保留。
- `bestCombo[tier]`：该档历史最高连击（连续按对字母数）。
- 读取失败或 `version` 不匹配：整体重置为默认值，不抛错。

## 字库条目（wordbank.js）

```json
{
  "h": "花",
  "p": "hua",
  "t": 1,
  "e": "🌷",
  "w": "花朵"
}
```

- `h`：汉字，档内唯一，同时是 `stars` 的键。
- `p`：拼音字母串，仅 a-z 小写、不含声调；挑战档双字词为两音节连接串（如 `"laoshi"`）。
- `t`：声调 0-4（0 为轻声），仅用于卡片展示，不参与输入。
- `e`：插图 emoji。
- `w`：示例词，用于卡片展示与朗读；双字词条目可等于词本身。

档位约束：启蒙档 `p` 长度 ≤2；基础档 ≤3；挑战档单字 ≤4，双字词为两音节连接串、单音节 ≤5 且总长 ≤8（约 20 条）。
