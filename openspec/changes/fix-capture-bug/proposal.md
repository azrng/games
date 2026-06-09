## Why

玩家尝试用己方棋子吃对方棋子时操作没反应。可能原因：
1. 点击敌方棋子时没有先选中己方棋子
2. 棋子等级不够无法吃对方（但没有视觉反馈）
3. 移动验证逻辑有 bug

## What Changes

- 修复吃子操作的响应问题
- 添加操作失败时的视觉反馈
- 确保选择己方棋子后能正常吃相邻敌方棋子

## Capabilities

### New Capabilities
- `fix-capture`: 修复吃子操作 bug 并添加反馈

### Modified Capabilities
<!-- 无 -->

## Impact

- 修改 `animal-flip-chess/script.js` 中的移动和战斗逻辑
