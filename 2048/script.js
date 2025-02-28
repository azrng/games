document.addEventListener('DOMContentLoaded', () => {
    // 游戏主类
    class Game2048 {
        constructor() {
            this.gridSize = 4;
            this.startTiles = 2;
            this.tileContainer = document.querySelector('.tile-container');
            this.scoreDisplay = document.getElementById('score');
            this.bestScoreDisplay = document.getElementById('best-score');
            this.messageContainer = document.querySelector('.game-message');
            this.score = 0;
            this.bestScore = localStorage.getItem('bestScore') || 0;
            this.gameHistory = [];
            
            this.bestScoreDisplay.textContent = this.bestScore;
            
            this.setupEventListeners();
            this.startGame();
        }
        
        // 设置事件监听
        setupEventListeners() {
            // 键盘控制
            document.addEventListener('keydown', this.handleKeyDown.bind(this));
            
            // 触摸控制 - 限制为游戏容器区域
            const gameContainer = document.querySelector('.grid-container');
            let touchStartX, touchStartY;
            let touchEndX, touchEndY;
            
            gameContainer.addEventListener('touchstart', (event) => {
                event.preventDefault(); // 防止滚动
                touchStartX = event.touches[0].clientX;
                touchStartY = event.touches[0].clientY;
            }, { passive: false });
            
            gameContainer.addEventListener('touchend', (event) => {
                event.preventDefault(); // 防止点击事件
                touchEndX = event.changedTouches[0].clientX;
                touchEndY = event.changedTouches[0].clientY;
                
                const dx = touchEndX - touchStartX;
                const dy = touchEndY - touchStartY;
                
                // 确定滑动方向，增加灵敏度
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
                    // 水平滑动
                    if (dx > 0) {
                        this.move(1, 0); // 右
                    } else {
                        this.move(-1, 0); // 左
                    }
                } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
                    // 垂直滑动
                    if (dy > 0) {
                        this.move(0, 1); // 下
                    } else {
                        this.move(0, -1); // 上
                    }
                }
            }, { passive: false });
            
            gameContainer.addEventListener('touchmove', (event) => {
                // 防止页面滚动
                event.preventDefault();
            }, { passive: false });
            
            // 按钮控制
            document.getElementById('new-game-btn').addEventListener('click', () => {
                this.startGame();
            });
            
            document.getElementById('undo-btn').addEventListener('click', () => {
                this.undo();
            });
            
            document.getElementById('retry-btn').addEventListener('click', () => {
                this.startGame();
            });
            
            document.getElementById('keep-playing-btn').addEventListener('click', () => {
                this.keepPlaying();
            });
        }
        
        // 处理键盘事件
        handleKeyDown(event) {
            if (!this.isGameTerminated()) {
                // 阻止方向键滚动页面
                if ([37, 38, 39, 40].includes(event.keyCode)) {
                    event.preventDefault();
                }
                
                switch (event.keyCode) {
                    case 37: // 左
                        this.move(-1, 0);
                        break;
                    case 38: // 上
                        this.move(0, -1);
                        break;
                    case 39: // 右
                        this.move(1, 0);
                        break;
                    case 40: // 下
                        this.move(0, 1);
                        break;
                }
            }
        }
        
        // 开始新游戏
        startGame() {
            this.grid = this.createGrid();
            this.score = 0;
            this.over = false;
            this.won = false;
            this.keepPlayingAfterWin = false;
            this.gameHistory = [];
            
            this.updateScore();
            this.clearMessage();
            
            this.clearTiles();
            this.addStartTiles();
        }
        
        // 创建网格
        createGrid() {
            const grid = [];
            
            for (let i = 0; i < this.gridSize; i++) {
                grid[i] = [];
                for (let j = 0; j < this.gridSize; j++) {
                    grid[i][j] = null;
                }
            }
            
            return grid;
        }
        
        // 添加初始方块
        addStartTiles() {
            for (let i = 0; i < this.startTiles; i++) {
                this.addRandomTile();
            }
        }
        
        // 添加随机方块
        addRandomTile() {
            if (this.hasEmptyCell()) {
                const value = Math.random() < 0.9 ? 2 : 4;
                let cell;
                
                do {
                    cell = {
                        x: Math.floor(Math.random() * this.gridSize),
                        y: Math.floor(Math.random() * this.gridSize)
                    };
                } while (!this.isCellEmpty(cell));
                
                this.grid[cell.y][cell.x] = value;
                this.addTile({ x: cell.x, y: cell.y, value: value });
            }
        }
        
        // 检查是否有空格
        hasEmptyCell() {
            for (let y = 0; y < this.gridSize; y++) {
                for (let x = 0; x < this.gridSize; x++) {
                    if (!this.grid[y][x]) {
                        return true;
                    }
                }
            }
            return false;
        }
        
        // 检查单元格是否为空
        isCellEmpty(cell) {
            return !this.grid[cell.y][cell.x];
        }
        
        // 添加方块到界面
        addTile(tile) {
            const element = document.createElement('div');
            const value = tile.value;
            
            // 添加基本类
            element.classList.add('tile', `tile-${value}`);
            
            // 根据状态添加特效类
            if (tile.merged) {
                element.classList.add('tile-merged');
            } else if (!tile.previouslyExisted) {
                element.classList.add('tile-new');
            }
            
            element.textContent = value;
            
            this.positionTile(element, { x: tile.x, y: tile.y });
            this.tileContainer.appendChild(element);
        }
        
        // 定位方块
        positionTile(element, position) {
            const posX = position.x;
            const posY = position.y;
            
            const percentage = 100 / this.gridSize;
            const gap = 10; // 间隙大小
            
            element.style.left = `calc(${percentage * posX}% + ${gap}px)`;
            element.style.top = `calc(${percentage * posY}% + ${gap}px)`;
            element.style.width = `calc(${percentage}% - ${gap}px)`;
            element.style.height = `calc(${percentage}% - ${gap}px)`;
        }
        
        // 清除所有方块
        clearTiles() {
            while (this.tileContainer.firstChild) {
                this.tileContainer.removeChild(this.tileContainer.firstChild);
            }
        }
        
        // 移动方块
        move(dx, dy) {
            if (this.isGameTerminated()) return;
            
            // 保存当前状态用于撤销
            this.saveGameState();
            
            let moved = false;
            
            // 确定遍历方向
            const traversals = this.buildTraversals(dx, dy);
            
            // 清除之前的合并标记
            this.clearMergedFlags();
            
            // 遍历所有格子
            traversals.y.forEach(y => {
                traversals.x.forEach(x => {
                    const cell = { x, y };
                    const tile = this.grid[y][x];
                    
                    if (tile) {
                        const positions = this.findFarthestPosition(cell, dx, dy);
                        const next = this.getCell(positions.next);
                        
                        // 合并逻辑
                        if (next && this.grid[next.y][next.x] === tile && !this.getMergedFlag(next)) {
                            const mergedValue = tile * 2;
                            this.grid[next.y][next.x] = mergedValue;
                            this.grid[y][x] = null;
                            
                            // 标记为已合并，防止连续合并
                            this.setMergedFlag(next);
                            
                            // 更新分数
                            this.score += mergedValue;
                            
                            // 显示分数增加效果
                            this.showScoreAddition(mergedValue);
                            
                            // 检查是否达到2048
                            if (mergedValue === 2048 && !this.keepPlayingAfterWin) {
                                this.won = true;
                            }
                            
                            moved = true;
                        } else {
                            // 移动到最远位置
                            this.grid[positions.farthest.y][positions.farthest.x] = tile;
                            
                            // 只有当位置发生变化时才标记为移动
                            if (x !== positions.farthest.x || y !== positions.farthest.y) {
                                this.grid[y][x] = null;
                                moved = true;
                            }
                        }
                    }
                });
            });
            
            if (moved) {
                // 添加新方块
                this.addRandomTile();
                
                // 检查游戏状态
                if (!this.movesAvailable()) {
                    this.over = true;
                }
                
                // 重新渲染
                this.renderGrid();
                this.updateScore();
                
                // 更新游戏状态
                this.updateGameState();
            }
        }
        
        // 构建遍历顺序
        buildTraversals(dx, dy) {
            const traversals = {
                x: [],
                y: []
            };
            
            for (let i = 0; i < this.gridSize; i++) {
                traversals.x.push(i);
                traversals.y.push(i);
            }
            
            // 从移动方向的尽头开始遍历
            if (dx === 1) traversals.x = traversals.x.reverse();
            if (dy === 1) traversals.y = traversals.y.reverse();
            
            return traversals;
        }
        
        // 找到最远的可移动位置
        findFarthestPosition(cell, dx, dy) {
            let previous;
            let x = cell.x;
            let y = cell.y;
            
            do {
                previous = { x, y };
                x += dx;
                y += dy;
            } while (this.isValidPosition({ x, y }) && this.isCellEmpty({ x, y }));
            
            return {
                farthest: previous,
                next: this.isValidPosition({ x, y }) ? { x, y } : null
            };
        }
        
        // 检查位置是否有效
        isValidPosition(position) {
            // 添加空值检查
            if (!position) return false;
            
            return position.x >= 0 && position.x < this.gridSize &&
                   position.y >= 0 && position.y < this.gridSize;
        }
        
        // 获取单元格
        getCell(position) {
            if (this.isValidPosition(position)) {
                return position;
            }
            return null;
        }
        
        // 渲染网格
        renderGrid() {
            this.clearTiles();
            
            for (let y = 0; y < this.gridSize; y++) {
                for (let x = 0; x < this.gridSize; x++) {
                    const value = this.grid[y][x];
                    if (value) {
                        const isMerged = this.getMergedFlag({x, y});
                        this.addTile({ x, y, value, merged: isMerged });
                    }
                }
            }
        }
        
        // 更新分数
        updateScore() {
            this.scoreDisplay.textContent = this.score;
            
            if (this.score > this.bestScore) {
                this.bestScore = this.score;
                this.bestScoreDisplay.textContent = this.bestScore;
                localStorage.setItem('bestScore', this.bestScore);
            }
        }
        
        // 检查是否还有可用移动
        movesAvailable() {
            return this.hasEmptyCell() || this.hasPossibleMerges();
        }
        
        // 检查是否有可能的合并
        hasPossibleMerges() {
            for (let y = 0; y < this.gridSize; y++) {
                for (let x = 0; x < this.gridSize; x++) {
                    const tile = this.grid[y][x];
                    
                    if (tile) {
                        // 检查四个方向
                        for (const direction of [{ dx: 0, dy: 1 }, { dx: 1, dy: 0 }]) {
                            const { dx, dy } = direction;
                            const newX = x + dx;
                            const newY = y + dy;
                            
                            if (this.isValidPosition({ x: newX, y: newY })) {
                                const newTile = this.grid[newY][newX];
                                
                                if (newTile === tile) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            
            return false;
        }
        
        // 更新游戏状态
        updateGameState() {
            if (this.won && !this.keepPlayingAfterWin) {
                this.showMessage('游戏胜利！', 'game-won');
            } else if (this.over) {
                this.showMessage('游戏结束！', 'game-over');
            }
        }
        
        // 显示消息
        showMessage(message, className) {
            this.messageContainer.classList.add(className);
            this.messageContainer.querySelector('p').textContent = message;
            this.messageContainer.style.display = 'flex';
        }
        
        // 清除消息
        clearMessage() {
            this.messageContainer.classList.remove('game-won', 'game-over');
            this.messageContainer.style.display = 'none';
        }
        
        // 继续游戏
        keepPlaying() {
            this.keepPlayingAfterWin = true;
            this.clearMessage();
        }
        
        // 检查游戏是否结束
        isGameTerminated() {
            return this.over || (this.won && !this.keepPlayingAfterWin);
        }
        
        // 保存游戏状态
        saveGameState() {
            const state = {
                grid: JSON.parse(JSON.stringify(this.grid)),
                score: this.score,
                over: this.over,
                won: this.won,
                keepPlayingAfterWin: this.keepPlayingAfterWin
            };
            
            this.gameHistory.push(state);
            
            // 限制历史记录长度
            if (this.gameHistory.length > 10) {
                this.gameHistory.shift();
            }
        }
        
        // 撤销操作
        undo() {
            if (this.gameHistory.length > 0) {
                const previousState = this.gameHistory.pop();
                
                this.grid = previousState.grid;
                this.score = previousState.score;
                this.over = previousState.over;
                this.won = previousState.won;
                this.keepPlayingAfterWin = previousState.keepPlayingAfterWin;
                
                this.renderGrid();
                this.updateScore();
                
                if (this.isGameTerminated()) {
                    this.updateGameState();
                } else {
                    this.clearMessage();
                }
            }
        }
        
        // 添加新方法来管理合并标记
        clearMergedFlags() {
            this.mergedFlags = [];
        }
        
        setMergedFlag(cell) {
            this.mergedFlags.push(`${cell.x},${cell.y}`);
        }
        
        getMergedFlag(cell) {
            return this.mergedFlags.includes(`${cell.x},${cell.y}`);
        }
        
        // 添加显示分数增加效果的方法
        showScoreAddition(value) {
            const addition = document.createElement('div');
            addition.classList.add('score-addition');
            addition.textContent = '+' + value;
            
            // 定位到分数显示区域
            const scoreContainer = document.querySelector('.score-container');
            scoreContainer.appendChild(addition);
            
            // 动画结束后移除元素
            setTimeout(() => {
                scoreContainer.removeChild(addition);
            }, 800);
        }
    }
    
    // 初始化游戏
    new Game2048();
}); 