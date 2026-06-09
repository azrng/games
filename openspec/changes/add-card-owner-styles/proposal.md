## Why

翻开的卡牌无法清晰区分是玩家的还是电脑的。当前只有细细的边框颜色区分（红色 vs 蓝色），在实际游戏中很难一眼看出哪些是自己的牌、哪些是对方的牌。

## What Changes

- 增强翻开卡牌的视觉样式，添加背景色区分
- 玩家 A（你）的牌使用红色/粉色背景
- 玩家 B（电脑）的牌使用蓝色背景
- 保持卡牌图案清晰可见

## Capabilities

### New Capabilities
- `card-owner-styles`: 增强卡牌所有者视觉区分

### Modified Capabilities
<!-- 无现有规范需要修改 -->

## Impact

- 修改 `animal-flip-chess/style.css` 中的卡牌样式
- 可能需要调整颜色变量
