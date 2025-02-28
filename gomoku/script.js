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
    updateCanvasSize();
    
    // 绑定事件监听器
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleCanvasTouch, { passive: false });
    window.addEventListener('resize', handleResize);
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
    
    // 确保画布大小正确
    updateCanvasSize();
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
    
    // 计算实际的单元格大小
    const cellSize = canvas.width / BOARD_SIZE;
    
    // 绘制棋盘背景
    ctx.fillStyle = getBoardColor();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格线
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    
    // 绘制横线
    for (let i = 0; i < BOARD_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(cellSize / 2, i * cellSize + cellSize / 2);
        ctx.lineTo(canvas.width - cellSize / 2, i * cellSize + cellSize / 2);
        ctx.stroke();
    }
    
    // 绘制竖线
    for (let i = 0; i < BOARD_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize + cellSize / 2, cellSize / 2);
        ctx.lineTo(i * cellSize + cellSize / 2, canvas.height - cellSize / 2);
        ctx.stroke();
    }
    
    // 绘制天元和星位
    const starPoints = [3, 7, 11];
    for (let i of starPoints) {
        for (let j of starPoints) {
            ctx.beginPath();
            ctx.arc(i * cellSize + cellSize / 2, j * cellSize + cellSize / 2, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#000';
            ctx.fill();
        }
    }
    
    // 绘制棋子
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] !== 0) {
                drawPiece(i, j, gameState.board[i][j], cellSize);
            }
        }
    }
    
    // 标记最后一步
    if (gameState.lastMove) {
        const [x, y] = gameState.lastMove;
        ctx.beginPath();
        ctx.arc(x * cellSize + cellSize / 2, y * cellSize + cellSize / 2, 5, 0, Math.PI * 2);
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
function drawPiece(x, y, player, cellSize) {
    // 如果没有提供cellSize，则使用默认的CELL_SIZE
    cellSize = cellSize || CELL_SIZE;
    
    const pieceRadius = cellSize * 0.45; // 棋子半径相对于单元格大小的比例
    const centerX = x * cellSize + cellSize / 2;
    const centerY = y * cellSize + cellSize / 2;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, pieceRadius, 0, Math.PI * 2);
    
    // 创建渐变效果
    const gradient = ctx.createRadialGradient(
        centerX - pieceRadius / 3.6, centerY - pieceRadius / 3.6, pieceRadius / 18,
        centerX, centerY, pieceRadius
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
    
    // 计算点击位置相对于画布的坐标，考虑页面滚动和缩放因素
    const scaleX = canvas.width / rect.width;    // 画布的实际宽度与显示宽度的比例
    const scaleY = canvas.height / rect.height;  // 画布的实际高度与显示高度的比例
    
    // 获取点击位置相对于画布的坐标
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    
    // 计算实际的单元格大小
    const cellSize = canvas.width / BOARD_SIZE;
    
    // 计算棋盘格子坐标
    const x = Math.floor(canvasX / cellSize);
    const y = Math.floor(canvasY / cellSize);
    
    if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && gameState.board[x][y] === 0) {
        makeMove(x, y);
        
        // 如果是AI模式且游戏未结束，让AI走棋
        if (gameState.gameMode === 'ai' && !gameState.gameOver) {
            setTimeout(makeAIMove, 500);
        }
    }
}

// 处理触摸事件
function handleCanvasTouch(e) {
    // 阻止默认行为（如滚动）
    e.preventDefault();
    
    if (gameState.gameOver || (gameState.gameMode === 'ai' && gameState.currentPlayer === 2)) {
        return;
    }
    
    // 获取第一个触摸点
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    
    // 计算点击位置相对于画布的坐标，考虑页面滚动和缩放因素
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // 获取触摸位置相对于画布的坐标
    const canvasX = (touch.clientX - rect.left) * scaleX;
    const canvasY = (touch.clientY - rect.top) * scaleY;
    
    // 计算实际的单元格大小
    const cellSize = canvas.width / BOARD_SIZE;
    
    // 计算棋盘格子坐标
    const x = Math.floor(canvasX / cellSize);
    const y = Math.floor(canvasY / cellSize);
    
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
        case 'medium':
            move = findBestMove(2); // 深度为2的搜索
            break;
        case 'hard':
            move = findBestMoveAlphaBeta(3, -Infinity, Infinity, true); // 将深度从4降低到3，减少计算量
            break;
        default:
            move = findBestMove(2);
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
    
    // 倒计时功能
    const countdownElement = document.getElementById('countdown-timer');
    let secondsLeft = 3;
    
    // 初始显示
    countdownElement.textContent = `弹框将在 ${secondsLeft} 秒后关闭`;
    
    // 创建倒计时定时器
    const countdownInterval = setInterval(() => {
        secondsLeft--;
        countdownElement.textContent = `弹框将在 ${secondsLeft} 秒后关闭`;
        
        if (secondsLeft <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);
    
    // 3秒后自动关闭弹框，但不重新开始游戏，保留当前棋局状态以便复盘
    setTimeout(() => {
        clearInterval(countdownInterval);
        gameResult.classList.add('hidden');
        // 移除重新开始游戏的调用，保留棋局状态
        // restartGame(); 
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
        // 计算实际的单元格大小
        const cellSize = canvas.width / BOARD_SIZE;
        const pieceRadius = cellSize * 0.45; // 棋子半径相对于单元格大小的比例
        
        // 在最佳移动位置显示提示标记
        const centerX = bestMove.x * cellSize + cellSize / 2;
        const centerY = bestMove.y * cellSize + cellSize / 2;
        
        // 绘制提示标记
        ctx.beginPath();
        ctx.arc(centerX, centerY, pieceRadius / 2, 0, Math.PI * 2);
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
    
    // 3秒后自动关闭弹框，但不重新开始游戏，保留当前棋局状态以便复盘
    setTimeout(() => {
        gameResult.classList.add('hidden');
        // 移除重新开始游戏的调用，保留棋局状态
        // restartGame();
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

// 处理窗口大小变化
function handleResize() {
    updateCanvasSize();
    drawBoard();
}

// 更新画布大小
function updateCanvasSize() {
    // 获取容器宽度
    const container = document.querySelector('.game-board-container');
    const containerWidth = container.clientWidth;
    
    // 计算合适的画布大小，确保不超过容器宽度
    const size = Math.min(containerWidth, BOARD_SIZE * CELL_SIZE);
    
    // 设置画布大小
    canvas.width = size;
    canvas.height = size;
}

// 使用Alpha-Beta剪枝的最佳走法搜索
function findBestMoveAlphaBeta(depth, alpha, beta, isMaximizingPlayer) {
    // 设置超时机制，防止计算时间过长
    const startTime = Date.now();
    const timeLimit = 1000; // 1秒超时限制
    
    // 如果是第一步，优先考虑天元位置
    if (gameState.stepCount === 0) {
        return {x: 7, y: 7}; // 天元位置
    }
    
    // 如果是第二步，考虑天元周围的位置
    if (gameState.stepCount === 1) {
        const centerX = 7;
        const centerY = 7;
        // 检查天元是否已被占用
        if (gameState.board[centerX][centerY] === 0) {
            return {x: centerX, y: centerY};
        } else {
            // 选择天元周围的一个位置
            const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            for (const [dx, dy] of offsets) {
                const x = centerX + dx;
                const y = centerY + dy;
                if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && gameState.board[x][y] === 0) {
                    return {x, y};
                }
            }
        }
    }
    
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
    
    // 检查是否需要阻止玩家获胜或形成威胁
    let bestDefensiveMove = null;
    let bestDefensiveScore = -Infinity;
    
    // 先检查玩家是否有连续三子或更多的威胁
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] === 0) {
                // 检查玩家在此位置落子是否会获胜
                gameState.board[i][j] = 1; // 玩家是黑棋
                if (checkWin(i, j)) {
                    gameState.board[i][j] = 0; // 恢复
                    return {x: i, y: j}; // 必须阻止玩家获胜
                }
                
                // 检查玩家是否有连续三子或更多
                const hasThreeOrMore = checkConsecutivePieces(i, j, 1, 3);
                
                // 评估玩家在此位置的威胁程度
                const threatScore = evaluatePlayerThreat(i, j, 1);
                gameState.board[i][j] = 0; // 恢复
                
                // 如果有连续三子或更多，大幅提高威胁分数
                const finalScore = hasThreeOrMore ? threatScore * 1.5 : threatScore;
                
                // 如果威胁分数超过当前最佳防守分数，更新最佳防守走法
                if (finalScore > bestDefensiveScore) {
                    bestDefensiveScore = finalScore;
                    bestDefensiveMove = {x: i, y: j};
                }
            }
        }
    }
    
    // 降低防守阈值，更积极地防守
    // 原来只防守活三及以上(>=1000)，现在降低到活二(>=200)
    if (bestDefensiveScore >= 200) {
        return bestDefensiveMove;
    }
    
    // 优化：只考虑已有棋子周围的空位，减少搜索范围
    const candidateMoves = getRelevantMoves();
    
    if (candidateMoves.length === 0) {
        // 如果没有相关的走法，返回棋盘中心
        return {x: Math.floor(BOARD_SIZE / 2), y: Math.floor(BOARD_SIZE / 2)};
    }
    
    // 对候选走法进行初步评估并排序，优先考虑更有潜力的走法
    candidateMoves.forEach(move => {
        gameState.board[move.x][move.y] = 2; // AI是白棋
        move.score = quickEvaluate(move.x, move.y, 2);
        gameState.board[move.x][move.y] = 0; // 恢复
    });
    
    // 按分数降序排序
    candidateMoves.sort((a, b) => b.score - a.score);
    
    // 只考虑前N个最有潜力的走法，减少搜索空间
    const maxCandidates = 10;
    const topCandidates = candidateMoves.slice(0, maxCandidates);
    
    let bestMove = null;
    let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
    
    // 对每个候选走法进行评估
    for (const move of topCandidates) {
        const {x, y} = move;
        
        // 检查是否超时
        if (Date.now() - startTime > timeLimit) {
            console.log("AI思考超时，返回当前最佳走法");
            return bestMove || topCandidates[0] || bestDefensiveMove; // 如果超时，返回当前最佳走法或第一个候选走法
        }
        
        // 模拟走棋
        gameState.board[x][y] = isMaximizingPlayer ? 2 : 1;
        
        // 递归评估
        const score = alphaBeta(depth - 1, alpha, beta, !isMaximizingPlayer, x, y, startTime, timeLimit);
        
        // 恢复棋盘
        gameState.board[x][y] = 0;
        
        // 如果返回null，表示搜索已超时
        if (score === null) {
            return bestMove || topCandidates[0] || bestDefensiveMove;
        }
        
        // 更新最佳走法
        if (isMaximizingPlayer) {
            if (score > bestScore) {
                bestScore = score;
                bestMove = {x, y};
            }
            alpha = Math.max(alpha, bestScore);
        } else {
            if (score < bestScore) {
                bestScore = score;
                bestMove = {x, y};
            }
            beta = Math.min(beta, bestScore);
        }
        
        // Alpha-Beta剪枝
        if (beta <= alpha) {
            break;
        }
    }
    
    // 如果找到了最佳进攻走法，但存在高威胁防守点，比较两者
    if (bestMove && bestDefensiveScore >= 100) { // 进一步降低防守阈值，更积极防守
        // 评估最佳进攻走法的得分
        gameState.board[bestMove.x][bestMove.y] = 2;
        const attackScore = quickEvaluate(bestMove.x, bestMove.y, 2);
        gameState.board[bestMove.x][bestMove.y] = 0;
        
        // 如果防守得分明显高于进攻得分，选择防守
        if (bestDefensiveScore > attackScore * 1.2) { // 降低防守倾向的阈值
            return bestDefensiveMove;
        }
    }
    
    return bestMove || bestDefensiveMove;
}

// 检查是否有连续的棋子
function checkConsecutivePieces(x, y, player, minCount) {
    // 模拟在(x,y)位置放置player的棋子
    const originalValue = gameState.board[x][y];
    gameState.board[x][y] = player;
    
    // 检查四个方向
    const directions = [
        [1, 0],  // 水平
        [0, 1],  // 垂直
        [1, 1],  // 主对角线
        [1, -1]  // 副对角线
    ];
    
    let hasConsecutive = false;
    
    for (const [dx, dy] of directions) {
        const count = countConsecutive(x, y, dx, dy);
        if (count >= minCount) {
            hasConsecutive = true;
            break;
        }
    }
    
    // 恢复棋盘
    gameState.board[x][y] = originalValue;
    
    return hasConsecutive;
}

// 评估玩家在某位置的威胁程度
function evaluatePlayerThreat(x, y, player) {
    let maxThreat = 0;
    
    // 检查水平方向
    maxThreat = Math.max(maxThreat, evaluateDirectionalThreat(x, y, 1, 0, player));
    // 检查垂直方向
    maxThreat = Math.max(maxThreat, evaluateDirectionalThreat(x, y, 0, 1, player));
    // 检查主对角线
    maxThreat = Math.max(maxThreat, evaluateDirectionalThreat(x, y, 1, 1, player));
    // 检查副对角线
    maxThreat = Math.max(maxThreat, evaluateDirectionalThreat(x, y, 1, -1, player));
    
    return maxThreat;
}

// 评估某一方向上的威胁
function evaluateDirectionalThreat(x, y, dx, dy, player) {
    // 获取当前方向上的连续棋子和空位情况
    const line = getLineState(x, y, dx, dy, player);
    
    // 威胁评分
    let threatScore = 0;
    
    // 活四 (0XXXX0)
    if (line.pattern.includes("0XXXX0")) {
        threatScore = 10000;
    }
    // 冲四 (_XXXX0 或 0XXXX_)
    else if (line.pattern.includes("_XXXX0") || line.pattern.includes("0XXXX_")) {
        threatScore = 5000;
    }
    // 活三 (0XXX00 或 00XXX0)
    else if (line.pattern.includes("0XXX00") || line.pattern.includes("00XXX0")) {
        threatScore = 1000;
    }
    // 眠三 (_XXX00 或 00XXX_ 或 0X0XX0 或 0XX0X0)
    else if (line.pattern.includes("_XXX00") || line.pattern.includes("00XXX_") || 
             line.pattern.includes("0X0XX0") || line.pattern.includes("0XX0X0")) {
        threatScore = 500;
    }
    // 活二 (00XX00)
    else if (line.pattern.includes("00XX00")) {
        threatScore = 300;  // 进一步提高活二的威胁分数
    }
    // 眠二 (_0XX00 或 00XX0_)
    else if (line.pattern.includes("_0XX00") || line.pattern.includes("00XX0_")) {
        threatScore = 150;  // 进一步提高眠二的威胁分数
    }
    // 连续两子 (0XX0)
    else if (line.pattern.includes("0XX0")) {
        threatScore = 120;  // 提高连续两子的威胁分数
    }
    // 新增：间隔两子 (0X0X0)
    else if (line.pattern.includes("0X0X0")) {
        threatScore = 80;  // 间隔两子也有威胁
    }
    // 新增：单子周围有空位 (00X00)
    else if (line.pattern.includes("00X00")) {
        threatScore = 30;  // 单子周围有空位，有发展潜力
    }
    
    return threatScore;
}

// 获取某一方向上的棋型
function getLineState(x, y, dx, dy, player) {
    const opponent = player === 1 ? 2 : 1;
    let pattern = "";
    
    // 向一个方向检查
    for (let i = -5; i <= 5; i++) {
        const newX = x + i * dx;
        const newY = y + i * dy;
        
        if (newX < 0 || newX >= BOARD_SIZE || newY < 0 || newY >= BOARD_SIZE) {
            pattern += "_"; // 边界外用_表示
        } else if (i === 0) {
            pattern += "X"; // 当前位置用X表示
        } else if (gameState.board[newX][newY] === player) {
            pattern += "X"; // 玩家棋子用X表示
        } else if (gameState.board[newX][newY] === opponent) {
            pattern += "_"; // 对手棋子用_表示
        } else {
            pattern += "0"; // 空位用0表示
        }
    }
    
    return { pattern };
}

// 快速评估函数，用于对候选走法进行初步排序
function quickEvaluate(x, y, player) {
    let score = 0;
    
    // 检查水平方向
    score += evaluateLine(x, y, 1, 0, player);
    // 检查垂直方向
    score += evaluateLine(x, y, 0, 1, player);
    // 检查主对角线
    score += evaluateLine(x, y, 1, 1, player);
    // 检查副对角线
    score += evaluateLine(x, y, 1, -1, player);
    
    // 额外考虑防守价值
    if (player === 2) { // AI是白棋
        const defensiveValue = evaluatePlayerThreat(x, y, 1); // 评估黑棋在此位置的威胁
        
        // 提高防守权重，更积极防守
        score += defensiveValue * 1.2; // 将防守价值纳入考量，权重提高
        
        // 额外考虑位置价值
        // 靠近中心的位置更有价值
        const centerX = Math.floor(BOARD_SIZE / 2);
        const centerY = Math.floor(BOARD_SIZE / 2);
        const distanceToCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        const positionValue = Math.max(0, 50 - distanceToCenter * 5);
        score += positionValue;
    }
    
    return score;
}

// Alpha-Beta剪枝算法
function alphaBeta(depth, alpha, beta, isMaximizingPlayer, lastX, lastY, startTime, timeLimit) {
    // 检查是否超时
    if (Date.now() - startTime > timeLimit) {
        return null; // 超时返回null
    }
    
    // 检查是否达到搜索深度或游戏结束
    if (depth === 0) {
        return evaluateBoardAdvanced();
    }
    
    // 检查最后一步是否获胜
    if (checkWin(lastX, lastY)) {
        return isMaximizingPlayer ? -100000 : 100000;
    }
    
    // 获取候选走法并进行初步排序
    const candidateMoves = getRelevantMoves();
    
    if (candidateMoves.length === 0) {
        return evaluateBoardAdvanced();
    }
    
    // 对候选走法进行初步评估并排序
    candidateMoves.forEach(move => {
        gameState.board[move.x][move.y] = isMaximizingPlayer ? 2 : 1;
        move.score = quickEvaluate(move.x, move.y, isMaximizingPlayer ? 2 : 1);
        gameState.board[move.x][move.y] = 0;
    });
    
    // 按分数排序，最大化玩家降序，最小化玩家升序
    candidateMoves.sort((a, b) => isMaximizingPlayer ? b.score - a.score : a.score - b.score);
    
    // 只考虑前N个最有潜力的走法
    const maxCandidates = 8;
    const topCandidates = candidateMoves.slice(0, maxCandidates);
    
    if (isMaximizingPlayer) {
        let maxEval = -Infinity;
        
        for (const move of topCandidates) {
            const {x, y} = move;
            gameState.board[x][y] = 2; // AI是白棋
            const eval = alphaBeta(depth - 1, alpha, beta, false, x, y, startTime, timeLimit);
            gameState.board[x][y] = 0;
            
            // 如果返回null，表示搜索已超时
            if (eval === null) {
                return null;
            }
            
            maxEval = Math.max(maxEval, eval);
            alpha = Math.max(alpha, eval);
            
            if (beta <= alpha) {
                break; // Beta剪枝
            }
        }
        
        return maxEval;
    } else {
        let minEval = Infinity;
        
        for (const move of topCandidates) {
            const {x, y} = move;
            gameState.board[x][y] = 1; // 玩家是黑棋
            const eval = alphaBeta(depth - 1, alpha, beta, true, x, y, startTime, timeLimit);
            gameState.board[x][y] = 0;
            
            // 如果返回null，表示搜索已超时
            if (eval === null) {
                return null;
            }
            
            minEval = Math.min(minEval, eval);
            beta = Math.min(beta, eval);
            
            if (beta <= alpha) {
                break; // Alpha剪枝
            }
        }
        
        return minEval;
    }
}

// 获取相关的走法（已有棋子周围的空位）
function getRelevantMoves() {
    const moves = [];
    const visited = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(false));
    
    // 搜索范围（距离已有棋子的格数）
    const searchRange = 1; // 减小搜索范围，只考虑紧邻的空位
    
    // 遍历棋盘寻找已有棋子
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (gameState.board[i][j] !== 0) {
                // 检查周围的空位
                for (let dx = -searchRange; dx <= searchRange; dx++) {
                    for (let dy = -searchRange; dy <= searchRange; dy++) {
                        const x = i + dx;
                        const y = j + dy;
                        
                        // 检查位置是否有效且未被访问过
                        if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && 
                            gameState.board[x][y] === 0 && !visited[x][y]) {
                            moves.push({x, y});
                            visited[x][y] = true;
                        }
                    }
                }
            }
        }
    }
    
    // 如果没有找到任何走法（例如第一步），返回棋盘中心位置
    if (moves.length === 0) {
        const center = Math.floor(BOARD_SIZE / 2);
        moves.push({x: center, y: center});
    }
    
    return moves;
}

// 高级棋盘评估函数
function evaluateBoardAdvanced() {
    let score = 0;
    
    // 评估AI（白棋）的局面
    const aiScore = evaluatePlayerAdvanced(2);
    
    // 评估玩家（黑棋）的局面
    const playerScore = evaluatePlayerAdvanced(1);
    
    // AI的得分减去玩家的得分
    score = aiScore - playerScore;
    
    return score;
}

// 评估某一方的局面
function evaluatePlayerAdvanced(player) {
    let score = 0;
    
    // 棋型及其对应分数
    const patternScores = {
        'five': 100000,    // 五连
        'openFour': 10000, // 活四
        'fourFour': 10000, // 双四
        'fourThree': 10000, // 四三
        'blockedFour': 1000, // 冲四
        'openThree': 1000, // 活三
        'threeThree': 5000, // 双三
        'blockedThree': 100, // 冲三
        'openTwo': 100,    // 活二
        'blockedTwo': 10   // 冲二
    };
    
    // 统计各种棋型数量
    const patterns = {
        'five': 0,
        'openFour': 0,
        'blockedFour': 0,
        'openThree': 0,
        'blockedThree': 0,
        'openTwo': 0,
        'blockedTwo': 0
    };
    
    // 水平方向
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j <= BOARD_SIZE - 5; j++) {
            const line = [];
            for (let k = 0; k < 5; k++) {
                line.push(gameState.board[i][j + k]);
            }
            updatePatterns(line, patterns, player);
        }
    }
    
    // 垂直方向
    for (let i = 0; i <= BOARD_SIZE - 5; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            const line = [];
            for (let k = 0; k < 5; k++) {
                line.push(gameState.board[i + k][j]);
            }
            updatePatterns(line, patterns, player);
        }
    }
    
    // 主对角线方向
    for (let i = 0; i <= BOARD_SIZE - 5; i++) {
        for (let j = 0; j <= BOARD_SIZE - 5; j++) {
            const line = [];
            for (let k = 0; k < 5; k++) {
                line.push(gameState.board[i + k][j + k]);
            }
            updatePatterns(line, patterns, player);
        }
    }
    
    // 副对角线方向
    for (let i = 0; i <= BOARD_SIZE - 5; i++) {
        for (let j = 4; j < BOARD_SIZE; j++) {
            const line = [];
            for (let k = 0; k < 5; k++) {
                line.push(gameState.board[i + k][j - k]);
            }
            updatePatterns(line, patterns, player);
        }
    }
    
    // 计算特殊棋型组合
    const fourFour = Math.floor(patterns.openFour / 2) + Math.floor(patterns.blockedFour / 2);
    const fourThree = Math.min(patterns.openFour + patterns.blockedFour, patterns.openThree);
    const threeThree = Math.floor(patterns.openThree / 2);
    
    // 计算总分
    score += patterns.five * patternScores.five;
    score += patterns.openFour * patternScores.openFour;
    score += patterns.blockedFour * patternScores.blockedFour;
    score += patterns.openThree * patternScores.openThree;
    score += patterns.blockedThree * patternScores.blockedThree;
    score += patterns.openTwo * patternScores.openTwo;
    score += patterns.blockedTwo * patternScores.blockedTwo;
    
    // 加上特殊组合的分数
    score += fourFour * patternScores.fourFour;
    score += fourThree * patternScores.fourThree;
    score += threeThree * patternScores.threeThree;
    
    return score;
}

// 更新棋型统计
function updatePatterns(line, patterns, player) {
    const opponent = player === 1 ? 2 : 1;
    
    // 检查五连
    if (countInLine(line, player) === 5 && countInLine(line, opponent) === 0) {
        patterns.five++;
        return;
    }
    
    // 检查活四 (0XXXX0)
    if (countInLine(line, player) === 4 && countInLine(line, opponent) === 0) {
        if (line[0] === 0 && line[4] === 0) {
            patterns.openFour++;
        } else {
            patterns.blockedFour++;
        }
        return;
    }
    
    // 检查活三 (0XXX00 或 00XXX0)
    if (countInLine(line, player) === 3 && countInLine(line, opponent) === 0) {
        const zeros = countInLine(line, 0);
        if (zeros === 2) {
            // 检查是否是活三
            if ((line[0] === 0 && line[4] === 0) || 
                (line[0] === 0 && line[1] === 0) || 
                (line[3] === 0 && line[4] === 0)) {
                patterns.openThree++;
            } else {
                patterns.blockedThree++;
            }
        }
        return;
    }
    
    // 检查活二 (00XX00)
    if (countInLine(line, player) === 2 && countInLine(line, opponent) === 0) {
        const zeros = countInLine(line, 0);
        if (zeros === 3) {
            // 检查是否是活二
            if ((line[0] === 0 && line[3] === 0 && line[4] === 0) || 
                (line[0] === 0 && line[1] === 0 && line[4] === 0)) {
                patterns.openTwo++;
            } else {
                patterns.blockedTwo++;
            }
        }
        return;
    }
}

// 计算一条线上某种棋子的数量
function countInLine(line, player) {
    return line.filter(cell => cell === player).length;
}

// 初始化游戏
window.onload = function() {
    initGame();
};