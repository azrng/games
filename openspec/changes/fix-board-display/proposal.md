## Why

猜拳结束后，游戏界面没有展示棋盘内容。这是一个显示 bug，需要修复确保猜拳后棋盘正常显示。

## What Changes

- 修复猜拳结束后棋盘不显示的问题
- 确保游戏状态正确切换到 play 阶段
- 确保棋盘在猜拳后正确渲染

## Capabilities

### New Capabilities
- `board-display-fix`: 修复棋盘显示问题

### Modified Capabilities
<!-- 无现有规范需要修改 -->

## Impact

- 修改 `animal-flip-chess/script.js` 中的状态切换逻辑
- 可能需要调整渲染时机
