// 游戏常量
const BOARD_SIZE = 15; // 15x15的棋盘
const CELL_SIZE = 40; // 每个格子的大小
const PIECE_RADIUS = 18; // 棋子半径

// 游戏状态
let gameState = {
    board: Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0)), // 0: 空, 1: 黑, 2: 白
    currentPlayer: 1, // 1: 黑, 2: 白
    gameMode: null, // 'ai' 或 'player'
    aiLevel: 'medium',
    stepCount: 0,
    gameOver: false,
    winner: null,
    lastMove: null,
    moveHistory: [],
    hintsRemaining: 3,
    soundEnabled: true,
    forbiddenRuleEnabled: false,
    theme: 'classic'
};

// DOM元素
const canvas = document.getElementById('game-board');
const ctx = canvas.getContext('2d');
const currentPlayerDisplay = document.getElementById('current-player');
const stepCountDisplay = document.getElementById('step-count');
const gameMenu = document.getElementById('game-menu');
const gameResult = document.getElementById('game-result');
const resultMessage = document.getElementById('result-message');
const resultSteps = document.getElementById('result-steps');
const placeSound = document.getElementById('place-sound');
const winSound = document.getElementById('win-sound');

// 初始化游戏
function initGame() {
    // 设置画布大小
    canvas.width = BOARD_SIZE * CELL_SIZE;
    canvas.height = BOARD_SIZE * CELL_SIZE;
    
    // 绑定事件监听器
    canvas.addEventListener('click', handleCanvasClick);
    document.getElementById('vs-ai').addEventListener('click', () => startGame('ai'));
    document.getElementById('vs-player').addEventListener('click', () => startGame('player'));
    document.getElementById('undo-btn').addEventListener('click', undoMove);
    document.getElementById('hint-btn').addEventListener('click', showHint);
    document.getElementById('restart-btn').addEventListener('click', restartGame);
    document.getElementById('menu-btn').addEventListener('click', showMenu);
    document.getElementById('play-again-btn').addEventListener('click', restartGame);
    document.getElementById('back-to-menu-btn').addEventListener('click', showMenu);
    document.getElementById('ai-level').addEventListener('change', (e) => {
        gameState.aiLevel = e.target.value;
    });
    document.getElementById('theme-selector').addEventListener('change', (e) => {
        gameState.theme = e.target.value;
        drawBoard();
    });
    document.getElementById('sound-toggle').addEventListener('change', (e) => {
        gameState.soundEnabled = e.target.checked;
    });
    document.getElementById('forbidden-rule').addEventListener('change', (e) => {
        gameState.forbiddenRuleEnabled = e.target.checked;
    });
    
    // 显示菜单
    showMenu();
}

// 开始游戏
function startGame(mode) {
    gameState = {
        board: Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0)),
        currentPlayer: 1,
        gameMode: mode,
        aiLevel: document.getElementById('ai-level').value,
        stepCount: 0,
        gameOver: false,
        winner: null,
        lastMove: null,
        moveHistory: [],
        hintsRemaining: 3,
        soundEnabled: document.getElementById('sound-toggle').checked,
        forbiddenRuleEnabled: document.getElementById('forbidden-rule').checked,
        theme: document.getElementById('theme-selector').value
    };
    
    gameMenu.classList.add('hidden');
    gameResult.classList.add('hidden');
    updateGameInfo();
    drawBoard();
    
    // 如果是AI模式且AI先手（白棋），让AI走棋
    if (mode === 'ai' && gameState.currentPlayer === 2) {
        setTimeout(makeAIMove, 500);
    }
}

// 绘制棋盘
function drawBoard() {
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制棋盘背景
    ctx.fillStyle = getBoardColor();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格线
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    
    // 绘制横线
    for (let i = 0; i < BOARD_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(CELL_SIZE / 2, i * CELL_SIZE + CELL_SIZE / 2);
        ctx.lineTo(canvas.width - CELL_SIZE / 2, i * CELL_SIZE + CELL_SIZE / 2);
        ctx.stroke();
    }
    
    // 绘制竖线
    for (let i = 0; i < BOARD_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 2);
        ctx.lineTo(i * CELL_SIZE + CELL_SIZE / 2, canvas.height - CELL_SIZE / 2);
        ctx.stroke();
    }
    
    // 绘制天元和星位
    const starPoints = [3, 7, 11];
    for (let i of starPoints) {
        for (let j of starPoints) {
            ctx.beginPath();
            ctx.arc(i * CELL_SIZE + CELL_SIZE / 2, j * CELL_SIZE + CELL_SIZE / 2, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#000';
            ctx.fill();
        }
    }
    
    // 绘制棋子
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] !== 0) {
                drawPiece(i, j, gameState.board[i][j]);
            }
        }
    }
    
    // 标记最后一步
    if (gameState.lastMove) {
        const [x, y] = gameState.lastMove;
        ctx.beginPath();
        ctx.arc(x * CELL_SIZE + CELL_SIZE / 2, y * CELL_SIZE + CELL_SIZE / 2, 5, 0, Math.PI * 2);
        ctx.fillStyle = gameState.board[x][y] === 1 ? '#fff' : '#000';
        ctx.fill();
    }
}

// 根据主题获取棋盘颜色
function getBoardColor() {
    switch (gameState.theme) {
        case 'wood':
            return '#d2a679';
        case 'modern':
            return '#f0f0f0';
        case 'classic':
        default:
            return '#e9c396';
    }
}

// 绘制棋子
function drawPiece(x, y, player) {
    const centerX = x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = y * CELL_SIZE + CELL_SIZE / 2;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, PIECE_RADIUS, 0, Math.PI * 2);
    
    // 创建渐变效果
    const gradient = ctx.createRadialGradient(
        centerX - 5, centerY - 5, 1,
        centerX, centerY, PIECE_RADIUS
    );
    
    if (player === 1) { // 黑棋
        gradient.addColorStop(0, '#666');
        gradient.addColorStop(1, '#000');
    } else { // 白棋
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(1, '#ccc');
    }
    
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // 添加边缘
    ctx.strokeStyle = player === 1 ? '#000' : '#999';
    ctx.lineWidth = 1;
    ctx.stroke();
}

// 处理画布点击事件
function handleCanvasClick(e) {
    if (gameState.gameOver || (gameState.gameMode === 'ai' && gameState.currentPlayer === 2)) {
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
    const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);
    
    if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && gameState.board[x][y] === 0) {
        makeMove(x, y);
        
        // 如果是AI模式且游戏未结束，让AI走棋
        if (gameState.gameMode === 'ai' && !gameState.gameOver) {
            setTimeout(makeAIMove, 500);
        }
    }
}

// 走棋
function makeMove(x, y) {
    // 检查禁手规则
    if (gameState.forbiddenRuleEnabled && gameState.currentPlayer === 1) {
        if (isForbiddenMove(x, y)) {
            alert('禁手位置，请选择其他位置');
            return;
        }
    }
    
    gameState.board[x][y] = gameState.currentPlayer;
    gameState.lastMove = [x, y];
    gameState.moveHistory.push({x, y, player: gameState.currentPlayer});
    gameState.stepCount++;
    
    // 播放落子音效
    if (gameState.soundEnabled) {
        placeSound.currentTime = 0;
        placeSound.play();
    }
    
    // 检查游戏状态
    checkGameStatus(x, y);
    
    drawBoard();
}

// AI走棋
function makeAIMove() {
    if (gameState.gameOver) return;
    
    let move;
    switch (gameState.aiLevel) {
        case 'easy':
            move = findRandomMove();
            break;
        case 'hard':
            move = findBestMove(3); // 深度为3的搜索
            break;
        case 'medium':
        default:
            move = findBestMove(2); // 深度为2的搜索
            break;
    }
    
    if (move) {
        makeMove(move.x, move.y);
    }
}

// 寻找随机有效的走法（简单AI）
function findRandomMove() {
    const emptyPositions = [];
    
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                emptyPositions.push({x: i, y: j});
            }
        }
    }
    
    if (emptyPositions.length > 0) {
        return emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
    }
    
    return null;
}

// 寻找最佳走法（中级和高级AI）
function findBestMove(depth) {
    // 这是一个简化版的AI算法，实际上可以使用极大极小算法或Alpha-Beta剪枝
    let bestScore = -Infinity;
    let bestMove = null;
    
    // 首先检查是否有立即获胜的走法
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                gameState.board[i][j] = 2; // AI是白棋
                if (checkWin(i, j)) {
                    gameState.board[i][j] = 0; // 恢复
                    return {x: i, y: j};
                }
                gameState.board[i][j] = 0; // 恢复
            }
        }
    }
    
    // 检查是否需要阻止玩家获胜
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                gameState.board[i][j] = 1; // 玩家是黑棋
                if (checkWin(i, j)) {
                    gameState.board[i][j] = 0; // 恢复
                    return {x: i, y: j};
                }
                gameState.board[i][j] = 0; // 恢复
            }
        }
    }
    
    // 评估每个可能的走法
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                gameState.board[i][j] = 2;
                let score = evaluatePosition(i, j, 2, depth);
                gameState.board[i][j] = 0;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMove = {x: i, y: j};
                }
            }
        }
    }
    
    return bestMove;
}

// 评估位置的分数
function evaluatePosition(x, y, player, depth) {
    let score = 0;
    
    // 检查水平方向
    score += evaluateLine(x, y, 1, 0, player);
    // 检查垂直方向
    score += evaluateLine(x, y, 0, 1, player);
    // 检查主对角线
    score += evaluateLine(x, y, 1, 1, player);
    // 检查副对角线
    score += evaluateLine(x, y, 1, -1, player);
    
    // 如果深度大于1，递归评估对手的最佳应对
    if (depth > 1) {
        let bestOpponentScore = Infinity;
        const opponent = player === 1 ? 2 : 1;
        
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (gameState.board[i][j] === 0) {
                    gameState.board[i][j] = opponent;
                    let opponentScore = evaluatePosition(i, j, opponent, depth - 1);
                    gameState.board[i][j] = 0;
                    
                    bestOpponentScore = Math.min(bestOpponentScore, opponentScore);
                }
            }
        }
        
        // 减去对手的最佳得分
        score -= bestOpponentScore;
    }
    
    return score;
}

// 评估一条线上的得分
function evaluateLine(x, y, dx, dy, player) {
    let count = 1; // 当前位置已经有一个棋子
    let open = 0; // 开放端数量
    
    // 向一个方向检查
    let i = 1;
    while (true) {
        const newX = x + i * dx;
        const newY = y + i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE) {
            break;
        }
        
        if (gameState.board[newX][newY] === player) {
            count++;
        } else if (gameState.board[newX][newY] === 0) {
            open++;
            break;
        } else {
            break;
        }
        
        i++;
    }
    
    // 向另一个方向检查
    i = 1;
    while (true) {
        const newX = x - i * dx;
        const newY = y - i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE) {
            break;
        }
        
        if (gameState.board[newX][newY] === player) {
            count++;
        } else if (gameState.board[newX][newY] === 0) {
            open++;
            break;
        } else {
            break;
        }
        
        i++;
    }
    
    // 根据连子数和开放端数量评分
    if (count >= 5) return 10000; // 五连珠
    if (count === 4 && open === 2) return 5000; // 活四
    if (count === 4 && open === 1) return 1000; // 冲四
    if (count === 3 && open === 2) return 500; // 活三
    if (count === 3 && open === 1) return 100; // 冲三
    if (count === 2 && open === 2) return 50; // 活二
    if (count === 2 && open === 1) return 10; // 冲二
    
    return 0;
}

// 检查是否获胜
function checkWin(x, y) {
    const player = gameState.board[x][y];
    
    // 检查水平方向
    if (countConsecutive(x, y, 1, 0) >= 5) return true;
    // 检查垂直方向
    if (countConsecutive(x, y, 0, 1) >= 5) return true;
    // 检查主对角线
    if (countConsecutive(x, y, 1, 1) >= 5) return true;
    // 检查副对角线
    if (countConsecutive(x, y, 1, -1) >= 5) return true;
    
    return false;
}

// 计算连续棋子数
function countConsecutive(x, y, dx, dy) {
    const player = gameState.board[x][y];
    let count = 1; // 当前位置已经有一个棋子
    
    // 向一个方向检查
    let i = 1;
    while (true) {
        const newX = x + i * dx;
        const newY = y + i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE || gameState.board[newX][newY] !== player) {
            break;
        }
        
        count++;
        i++;
    }
    
    // 向另一个方向检查
    i = 1;
    while (true) {
        const newX = x - i * dx;
        const newY = y - i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE || gameState.board[newX][newY] !== player) {
            break;
        }
        
        count++;
        i++;
    }
    
    return count;
}

// 检查是否是禁手
function isForbiddenMove(x, y) {
    if (!gameState.forbiddenRuleEnabled || gameState.currentPlayer !== 1) {
        return false;
    }
    
    // 模拟落子
    gameState.board[x][y] = 1;
    
    // 检查长连禁手（超过五连）
    const hasLongConnect = 
        countConsecutive(x, y, 1, 0) > 5 || 
        countConsecutive(x, y, 0, 1) > 5 || 
        countConsecutive(x, y, 1, 1) > 5 || 
        countConsecutive(x, y, 1, -1) > 5;
    
    // 检查三三禁手（两个活三）
    let openThreeCount = 0;
    
    // 水平方向
    if (isOpenThree(x, y, 1, 0)) openThreeCount++;
    // 垂直方向
    if (isOpenThree(x, y, 0, 1)) openThreeCount++;
    // 主对角线
    if (isOpenThree(x, y, 1, 1)) openThreeCount++;
    // 副对角线
    if (isOpenThree(x, y, 1, -1)) openThreeCount++;
    
    // 检查四四禁手（两个冲四或活四）
    let fourCount = 0;
    
    // 水平方向
    if (isFour(x, y, 1, 0)) fourCount++;
    // 垂直方向
    if (isFour(x, y, 0, 1)) fourCount++;
    // 主对角线
    if (isFour(x, y, 1, 1)) fourCount++;
    // 副对角线
    if (isFour(x, y, 1, -1)) fourCount++;
    
    // 恢复棋盘
    gameState.board[x][y] = 0;
    
    return hasLongConnect || openThreeCount >= 2 || fourCount >= 2;
}

// 检查是否形成活三
function isOpenThree(x, y, dx, dy) {
    // 模拟落子
    const originalValue = gameState.board[x][y];
    gameState.board[x][y] = 1;
    
    let result = false;
    let count = 1;
    let openEnds = 0;
    
    // 向一个方向检查
    let i = 1;
    let open1 = false;
    while (true) {
        const newX = x + i * dx;
        const newY = y + i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE) {
            break;
        }
        
        if (gameState.board[newX][newY] === 1) {
            count++;
        } else if (gameState.board[newX][newY] === 0) {
            open1 = true;
            break;
        } else {
            break;
        }
        
        i++;
    }
    
    // 向另一个方向检查
    i = 1;
    let open2 = false;
    while (true) {
        const newX = x - i * dx;
        const newY = y - i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE) {
            break;
        }
        
        if (gameState.board[newX][newY] === 1) {
            count++;
        } else if (gameState.board[newX][newY] === 0) {
            open2 = true;
            break;
        } else {
            break;
        }
        
        i++;
    }
    
    if (open1) openEnds++;
    if (open2) openEnds++;
    
    // 活三：三个连续的棋子，两端都是空位
    result = (count === 3 && openEnds === 2);
    
    // 恢复棋盘
    gameState.board[x][y] = originalValue;
    
    return result;
}

// 检查是否形成冲四或活四
function isFour(x, y, dx, dy) {
    // 模拟落子
    const originalValue = gameState.board[x][y];
    gameState.board[x][y] = 1;
    
    let result = false;
    let count = 1;
    let openEnds = 0;
    
    // 向一个方向检查
    let i = 1;
    let open1 = false;
    while (true) {
        const newX = x + i * dx;
        const newY = y + i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE) {
            break;
        }
        
        if (gameState.board[newX][newY] === 1) {
            count++;
        } else if (gameState.board[newX][newY] === 0) {
            open1 = true;
            break;
        } else {
            break;
        }
        
        i++;
    }
    
    // 向另一个方向检查
    i = 1;
    let open2 = false;
    while (true) {
        const newX = x - i * dx;
        const newY = y - i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE) {
            break;
        }
        
        if (gameState.board[newX][newY] === 1) {
            count++;
        } else if (gameState.board[newX][newY] === 0) {
            open2 = true;
            break;
        } else {
            break;
        }
        
        i++;
    }
    
    if (open1) openEnds++;
    if (open2) openEnds++;
    
    // 冲四：四个连续的棋子，一端是空位
    // 活四：四个连续的棋子，两端都是空位
    result = (count === 4 && openEnds >= 1);
    
    // 恢复棋盘
    gameState.board[x][y] = originalValue;
    
    return result;
}

// 更新游戏信息显示
function updateGameInfo() {
    const playerText = gameState.currentPlayer === 1 ? '黑棋' : '白棋';
    currentPlayerDisplay.textContent = `当前回合: ${playerText}`;
    stepCountDisplay.textContent = `步数: ${gameState.stepCount}`;
    
    // 更新提示按钮文本
    const hintBtn = document.getElementById('hint-btn');
    hintBtn.textContent = `提示 (${gameState.hintsRemaining})`;
    hintBtn.disabled = gameState.hintsRemaining <= 0;
}

// 结束游戏
function endGame(winner) {
    gameState.gameOver = true;
    gameState.winner = winner;
    
    // 播放胜利音效
    if (gameState.soundEnabled) {
        winSound.play();
    }
    
    // 显示结果
    const winnerText = winner === 1 ? '黑棋' : '白棋';
    resultMessage.textContent = `${winnerText}获胜！`;
    resultSteps.textContent = `总步数: ${gameState.stepCount}`;
    gameResult.classList.remove('hidden');
    
    // 保存游戏记录
    saveGameHistory();
    
    // 3秒后自动关闭弹框
    setTimeout(() => {
        gameResult.classList.add('hidden');
        restartGame();
    }, 3000);
}

// 保存游戏历史记录
function saveGameHistory() {
    const gameHistory = {
        winner: gameState.winner,
        stepCount: gameState.stepCount,
        moves: gameState.moveHistory,
        date: new Date().toISOString()
    };
    
    localStorage.setItem('lastGameHistory', JSON.stringify(gameHistory));
}

// 悔棋
function undoMove() {
    if (gameState.moveHistory.length === 0 || gameState.gameOver) {
        return;
    }
    
    // 移除最后一步
    gameState.moveHistory.pop();
    
    // 重建棋盘
    gameState.board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
    gameState.stepCount = 0;
    gameState.lastMove = null;
    
    // 重新应用所有移动
    for (const move of gameState.moveHistory) {
        gameState.board[move.x][move.y] = move.player;
        gameState.lastMove = [move.x, move.y];
        gameState.stepCount++;
    }
    
    // 设置当前玩家
    if (gameState.moveHistory.length > 0) {
        const lastMove = gameState.moveHistory[gameState.moveHistory.length - 1];
        gameState.currentPlayer = lastMove.player === 1 ? 2 : 1;
    } else {
        gameState.currentPlayer = 1;
    }
    
    updateGameInfo();
    drawBoard();
}

// 显示提示
function showHint() {
    if (gameState.gameOver || gameState.hintsRemaining <= 0) {
        return;
    }
    
    // 减少提示次数
    gameState.hintsRemaining--;
    updateGameInfo();
    
    // 找到最佳移动
    let bestMove;
    if (gameState.currentPlayer === 1) {
        // 玩家是黑棋，使用AI算法找到最佳移动
        bestMove = findBestMove(2);
    } else {
        // 玩家是白棋，使用AI算法找到最佳移动
        const originalPlayer = gameState.currentPlayer;
        gameState.currentPlayer = 1; // 临时切换到黑棋
        bestMove = findBestMove(2);
        gameState.currentPlayer = originalPlayer; // 恢复
    }
    
    if (bestMove) {
        // 在最佳移动位置显示提示标记
        const centerX = bestMove.x * CELL_SIZE + CELL_SIZE / 2;
        const centerY = bestMove.y * CELL_SIZE + CELL_SIZE / 2;
        
        // 绘制提示标记
        ctx.beginPath();
        ctx.arc(centerX, centerY, PIECE_RADIUS / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 3秒后自动清除提示
        setTimeout(() => {
            if (!gameState.gameOver) {
                drawBoard();
            }
        }, 3000);
    }
}

// 重新开始游戏
function restartGame() {
    startGame(gameState.gameMode);
}

// 显示菜单
function showMenu() {
    // 重置游戏状态
    gameState = {
        board: Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0)),
        currentPlayer: 1,
        gameMode: null,
        aiLevel: document.getElementById('ai-level').value,
        stepCount: 0,
        gameOver: false,
        winner: null,
        lastMove: null,
        moveHistory: [],
        hintsRemaining: 3,
        soundEnabled: document.getElementById('sound-toggle').checked,
        forbiddenRuleEnabled: document.getElementById('forbidden-rule').checked,
        theme: document.getElementById('theme-selector').value
    };
    
    // 显示菜单，隐藏结果
    gameMenu.classList.remove('hidden');
    gameResult.classList.add('hidden');
    
    // 加载上一局游戏记录
    loadLastGameHistory();
    
    // 绘制空棋盘
    drawBoard();
}

// 加载上一局游戏记录
function loadLastGameHistory() {
    const historyJson = localStorage.getItem('lastGameHistory');
    if (historyJson) {
        try {
            const history = JSON.parse(historyJson);
            const historyDate = new Date(history.date);
            const formattedDate = `${historyDate.getFullYear()}-${(historyDate.getMonth() + 1).toString().padStart(2, '0')}-${historyDate.getDate().toString().padStart(2, '0')} ${historyDate.getHours().toString().padStart(2, '0')}:${historyDate.getMinutes().toString().padStart(2, '0')}`;
            
            // 在菜单中显示上一局记录
            const historyElement = document.createElement('div');
            historyElement.className = 'history-record';
            historyElement.innerHTML = `
                <h3>上一局游戏记录</h3>
                <p>时间: ${formattedDate}</p>
                <p>胜方: ${history.winner === 1 ? '黑棋' : '白棋'}</p>
                <p>总步数: ${history.stepCount}</p>
            `;
            
            // 检查是否已存在历史记录元素
            const existingHistory = document.querySelector('.history-record');
            if (existingHistory) {
                existingHistory.remove();
            }
            
            // 添加到菜单
            gameMenu.appendChild(historyElement);
        } catch (e) {
            console.error('加载游戏历史记录失败:', e);
        }
    }
}

// 检查是否平局
function checkDraw() {
    // 检查棋盘是否已满
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                return false; // 还有空位，不是平局
            }
        }
    }
    return true; // 棋盘已满，平局
}

// 处理平局
function handleDraw() {
    gameState.gameOver = true;
    
    // 显示结果
    resultMessage.textContent = '平局！';
    resultSteps.textContent = `总步数: ${gameState.stepCount}`;
    gameResult.classList.remove('hidden');
    
    // 保存游戏记录
    saveGameHistory();
    
    // 3秒后自动关闭弹框
    setTimeout(() => {
        gameResult.classList.add('hidden');
        restartGame();
    }, 3000);
}

// 在每次移动后检查是否平局
function checkGameStatus(x, y) {
    if (checkWin(x, y)) {
        endGame(gameState.currentPlayer);
    } else if (checkDraw()) {
        handleDraw();
    } else {
        // 切换玩家
        gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
        updateGameInfo();
    }
}

// 初始化游戏
window.onload = function() {
    initGame();
};