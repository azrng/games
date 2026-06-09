## Why

当 AI 在猜拳后获得先手时，AI 翻开第一张牌后立即获胜。这是因为 `checkWinCondition()` 检查到玩家 A 的棋子数量为 0（因为玩家还没有翻过任何牌），就判定 AI 获胜。但实际上游戏刚开始，不应该在还有未翻开的牌时就判定胜负。

## What Changes

- 修改胜利条件判定逻辑：只有当所有牌都被翻开后，才检查棋子数量
- 或者：只有当一方明确拥有棋子且另一方为 0 时才判定胜负
- 确保游戏不会在开局阶段就错误结束

## Capabilities

### New Capabilities
- `fix-win-condition`: 修复胜利条件判定，避免在游戏初期错误结束

### Modified Capabilities
<!-- 无现有规范需要修改 -->

## Impact

- 修改 `animal-flip-chess/script.js` 中的 `checkWinCondition()` 函数
- 可能需要修改 `countPieces()` 函数的逻辑
