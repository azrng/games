## ADDED Requirements

### Requirement: 电脑自动猜拳
玩家选择猜拳后，电脑 SHALL 自动随机选择并判定胜负。

#### Scenario: 玩家选择后电脑自动选择
- **WHEN** 玩家点击猜拳按钮（石头、剪刀或布）
- **THEN** 系统 SHALL 在短暂延迟后自动为电脑随机选择，并显示双方选择和胜负结果

#### Scenario: 平局时自动重新猜拳
- **WHEN** 玩家和电脑选择相同
- **THEN** 系统 SHALL 显示平局提示，并自动重新开始猜拳流程

### Requirement: 电脑自动翻牌
电脑回合时，系统 SHALL 自动为电脑选择一张未翻开的牌并翻开。

#### Scenario: 电脑翻牌时机
- **WHEN** 轮到电脑回合且需要翻牌
- **THEN** 系统 SHALL 在延迟后自动选择一张未翻开的牌翻开

#### Scenario: 翻牌后战斗判定
- **WHEN** 电脑翻开的牌与玩家棋子相邻
- **THEN** 系统 SHALL 自动执行战斗判定（大吃小，鼠吃象）

### Requirement: 电脑自动移动
电脑回合时，系统 SHALL 自动为电脑选择一个有效的移动。

#### Scenario: 电脑移动时机
- **WHEN** 轮到电脑回合且需要移动棋子
- **THEN** 系统 SHALL 在延迟后自动选择一个有效的移动执行

#### Scenario: 移动优先级
- **WHEN** 电脑有多个可选移动
- **THEN** 系统 SHALL 优先选择可以吃掉玩家棋子的移动，否则随机选择

### Requirement: UI 文本更新
系统 SHALL 更新 UI 文本，明确显示人机对战模式。

#### Scenario: 玩家信息显示
- **WHEN** 游戏界面显示玩家信息
- **THEN** 系统 SHALL 将"玩家 B"改为"电脑"，明确标识电脑对手

#### Scenario: 回合提示显示
- **WHEN** 显示当前回合信息
- **THEN** 系统 SHALL 显示"你的回合"或"电脑回合"，明确标识当前操作者

### Requirement: 电脑行动延迟
系统 SHALL 在电脑行动前添加适当延迟，模拟思考时间。

#### Scenario: 猜拳延迟
- **WHEN** 玩家完成猜拳选择
- **THEN** 系统 SHALL 在 500-1000ms 延迟后显示电脑选择

#### Scenario: 游戏行动延迟
- **WHEN** 轮到电脑行动
- **THEN** 系统 SHALL 在 500-1000ms 延迟后执行电脑行动
