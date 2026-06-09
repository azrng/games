## Why

动物翻翻棋的猜拳先手功能存在逻辑 bug。当前实现中，玩家 A 选择后直接判定胜负，没有等待玩家 B 选择。这是因为事件处理和状态管理存在问题，导致猜拳流程无法正确等待两位玩家都做出选择。

## What Changes

- 修复猜拳逻辑，确保等待两位玩家都选择后再判定胜负
- 优化猜拳 UI 交互，明确区分两位玩家的选择阶段
- 添加选择状态重置功能，支持重新开始猜拳

## Capabilities

### New Capabilities
- `rps-flow`: 猜拳流程控制，包括双玩家选择等待、胜负判定和状态管理

### Modified Capabilities
<!-- 无现有规范需要修改 -->

## Impact

- 修改 `animal-flip-chess/script.js` 中的 `handleRPS` 函数
- 修改猜拳弹窗的事件监听逻辑
- 可能需要调整 UI 状态显示
