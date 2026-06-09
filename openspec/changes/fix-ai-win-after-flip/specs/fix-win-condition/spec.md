## ADDED Requirements

### Requirement: 胜利条件判定时机
系统 SHALL 只在适当时机判定游戏结束，避免在游戏初期错误结束。

#### Scenario: 游戏初期不判定胜负
- **WHEN** 还有未翻开的牌
- **THEN** 系统 SHALL NOT 仅因一方棋子数量为 0 而判定游戏结束

#### Scenario: 所有牌翻开后正常判定
- **WHEN** 所有牌都已翻开，且一方棋子数量为 0
- **THEN** 系统 SHALL 正确判定另一方获胜

#### Scenario: 无可用操作时判定
- **WHEN** 当前玩家没有任何可用操作（无法翻牌也无法移动）
- **THEN** 系统 SHALL 判定另一方获胜

### Requirement: 游戏流程完整性
游戏 SHALL 能够正常进行到自然结束，不会因逻辑错误提前终止。

#### Scenario: AI 先手正常游戏
- **WHEN** AI 赢得猜拳获得先手
- **THEN** 游戏 SHALL 继续进行，玩家有正常游戏的机会

#### Scenario: 玩家先手正常游戏
- **WHEN** 玩家赢得猜拳获得先手
- **THEN** 游戏 SHALL 正常进行，不会出现异常结束
