## ADDED Requirements

### Requirement: 响应式棋盘布局
游戏 SHALL 在移动端设备上自动调整棋盘尺寸，使其适配屏幕宽度，保持 4x4 棋盘的正方形比例。

#### Scenario: 竖屏模式下棋盘适配
- **WHEN** 用户在 375px 宽度的手机上打开游戏
- **THEN** 棋盘宽度 SHALL 为屏幕宽度的 90%，居中显示，保持正方形比例

#### Scenario: 小屏设备适配
- **WHEN** 用户在 320px 宽度的小屏手机上打开游戏
- **THEN** 棋盘和所有 UI 元素 SHALL 正常显示，不出现横向滚动条

### Requirement: UI 元素自适应排列
游戏界面元素（玩家信息、操作按钮、状态栏）SHALL 在移动端垂直堆叠排列，确保所有内容在单屏内可见。

#### Scenario: 竖屏模式 UI 排列
- **WHEN** 用户在移动端竖屏模式下进入游戏
- **THEN** 玩家信息区 SHALL 在棋盘上方，操作按钮 SHALL 在棋盘下方，所有区域无需滚动即可完整显示

### Requirement: 安全区域适配
游戏 SHALL 适配带有刘海、圆角的现代手机屏幕，内容不被遮挡。

#### Scenario: 刘海屏适配
- **WHEN** 用户在带有刘海的 iPhone 上打开游戏
- **THEN** 游戏内容 SHALL 使用 safe-area-inset 属性，不被刘海或底部指示条遮挡

### Requirement: 横竖屏切换支持
游戏 SHALL 在用户旋转设备时自动调整布局，保持游戏状态不变。

#### Scenario: 竖屏切换到横屏
- **WHEN** 用户在游戏中将设备从竖屏旋转到横屏
- **THEN** 游戏 SHALL 重新排列布局适配横屏宽度，棋盘和游戏状态保持不变
