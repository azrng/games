## ADDED Requirements

### Requirement: 猜拳流程控制
系统 SHALL 等待两位玩家都做出选择后再判定胜负，不能在一位玩家选择后立即判定。

#### Scenario: 玩家 A 选择后等待玩家 B
- **WHEN** 玩家 A 点击猜拳按钮（石头、剪刀或布）
- **THEN** 系统 SHALL 显示"等待玩家 B 选择..."，按钮保持可用状态供玩家 B 选择

#### Scenario: 两位玩家都选择后判定胜负
- **WHEN** 玩家 A 和玩家 B 都已做出选择
- **THEN** 系统 SHALL 比较两位玩家的选择，判定胜负并显示结果

#### Scenario: 平局时重新开始
- **WHEN** 两位玩家选择相同（都是石头、剪刀或布）
- **THEN** 系统 SHALL 显示平局提示，并重置选择状态让两位玩家重新选择

### Requirement: 猜拳状态管理
系统 SHALL 正确管理猜拳状态，确保选择过程清晰可追踪。

#### Scenario: 状态重置
- **WHEN** 猜拳平局或游戏重新开始
- **THEN** 系统 SHALL 重置所有猜拳选择状态，清除之前的选择记录

#### Scenario: 选择状态显示
- **WHEN** 玩家 A 已选择但玩家 B 未选择
- **THEN** 系统 SHALL 明确显示当前等待玩家 B 选择，玩家 A 的选择应有视觉标记

### Requirement: 猜拳 UI 交互
系统 SHALL 提供清晰的 UI 反馈，让玩家知道当前状态和下一步操作。

#### Scenario: 按钮状态管理
- **WHEN** 玩家 A 做出选择后
- **THEN** 猜拳按钮 SHALL 保持可用状态，但玩家 A 的选择应有视觉标记（如高亮边框）

#### Scenario: 结果显示
- **WHEN** 猜拳判定出胜负
- **THEN** 系统 SHALL 显示获胜者信息（如"玩家 A 赢了！"），并在短暂延迟后进入游戏
