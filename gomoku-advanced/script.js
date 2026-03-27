(function() {
    'use strict';

    var BOARD_SIZE = 15;
    var STAR_POINTS = [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
    var THEMES = {
        classic: { bg: '#e9c396', line: '#333' },
        wood:    { bg: '#d2a679', line: '#5c3a1e' },
        modern:  { bg: '#f0f0f0', line: '#555' }
    };

    // Game State
    var game = {
        board: [],
        currentPlayer: 0,
        history: [],
        winner: 0,
        status: 'idle',
        aiFirst: true,
        depth: 4,
        theme: 'classic',
        forbiddenMoves: false,
        hints: 3,
        loading: false,
        hintMove: null,
        hintTimer: null
    };

    // DOM Elements
    var canvas, ctx;
    var startBtn, undoBtn, resignBtn, hintBtn;
    var statusText, stepCount;
    var loadingOverlay;
    var resultModal, resultMessage, resultSteps;

    // Worker
    var worker;

    function init() {
        canvas = document.getElementById('board-canvas');
        ctx = canvas.getContext('2d');
        startBtn = document.getElementById('start-btn');
        undoBtn = document.getElementById('undo-btn');
        resignBtn = document.getElementById('resign-btn');
        hintBtn = document.getElementById('hint-btn');
        statusText = document.getElementById('status-text');
        stepCount = document.getElementById('step-count');
        loadingOverlay = document.getElementById('loading-overlay');
        resultModal = document.getElementById('result-modal');
        resultMessage = document.getElementById('result-message');
        resultSteps = document.getElementById('result-steps');

        worker = new Worker('ai-worker.js');

        resetBoard();
        resizeCanvas();
        render();
        bindEvents();
    }

    function resetBoard() {
        game.board = [];
        for (var i = 0; i < BOARD_SIZE; i++) {
            game.board.push(new Array(BOARD_SIZE).fill(0));
        }
        game.currentPlayer = 0;
        game.history = [];
        game.winner = 0;
        game.hintMove = null;
        if (game.hintTimer) {
            clearTimeout(game.hintTimer);
            game.hintTimer = null;
        }
    }

    function resizeCanvas() {
        var container = canvas.parentElement;
        var maxSize = Math.min(container.clientWidth || 600, 600);
        var dpr = window.devicePixelRatio || 1;
        canvas.width = maxSize * dpr;
        canvas.height = maxSize * dpr;
        canvas.style.width = maxSize + 'px';
        canvas.style.height = maxSize + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        render();
    }

    function getCellSize() {
        return parseFloat(canvas.style.width) / (BOARD_SIZE + 1);
    }

    function getDisplaySize() {
        return parseFloat(canvas.style.width);
    }

    // ===== Worker Communication =====
    function sendToWorker(action, payload) {
        return new Promise(function(resolve) {
            worker.onmessage = function(event) {
                if (event.data.action === action) {
                    resolve(event.data.payload);
                }
            };
            worker.postMessage({ action: action, payload: payload });
        });
    }

    // ===== Game Actions =====
    function startGame() {
        game.hints = 3;
        game.loading = true;
        updateUI();
        loadingOverlay.classList.remove('hidden');
        resultModal.classList.add('hidden');

        sendToWorker('start', {
            board_size: BOARD_SIZE,
            aiFirst: game.aiFirst,
            depth: game.depth
        }).then(function(data) {
            applyWorkerData(data);
            game.status = 'gaming';
            game.loading = false;
            loadingOverlay.classList.add('hidden');
            updateUI();
            render();
            checkGameOver();
        });
    }

    function handleCanvasClick(e) {
        if (game.loading || game.status !== 'gaming') return;

        var rect = canvas.getBoundingClientRect();
        var x, y;
        if (e.touches) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        var cellSize = getCellSize();
        var col = Math.round(x / cellSize - 1);
        var row = Math.round(y / cellSize - 1);

        if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
        if (game.board[row][col] !== 0) return;

        // Forbidden move check (only for black)
        if (game.forbiddenMoves && game.currentPlayer === 1) {
            if (isForbiddenMove(game.board, row, col)) {
                statusText.textContent = '禁手位置，当前不能落子';
                return;
            }
        }

        // Clear hint
        game.hintMove = null;

        game.loading = true;
        updateUI();
        loadingOverlay.classList.remove('hidden');

        sendToWorker('move', {
            position: [row, col],
            depth: game.depth
        }).then(function(data) {
            applyWorkerData(data);
            game.loading = false;
            loadingOverlay.classList.add('hidden');
            updateUI();
            render();
            checkGameOver();
        });
    }

    function undoMove() {
        if (game.loading || game.history.length < 2) return;

        game.loading = true;
        loadingOverlay.classList.remove('hidden');

        sendToWorker('undo').then(function(data) {
            applyWorkerData(data);
            game.loading = false;
            loadingOverlay.classList.add('hidden');
            game.hintMove = null;
            updateUI();
            render();
        });
    }

    function resign() {
        if (game.status !== 'gaming') return;
        // Current player resigns, opponent wins
        game.winner = -game.currentPlayer;
        game.status = 'idle';
        showResult();
    }

    function showHint() {
        if (game.loading || game.status !== 'gaming' || game.hints <= 0) return;

        game.hints--;
        game.loading = true;
        loadingOverlay.classList.remove('hidden');

        sendToWorker('hint', { depth: Math.min(game.depth, 4) }).then(function(data) {
            game.loading = false;
            loadingOverlay.classList.add('hidden');
            if (data.move) {
                game.hintMove = data.move;
                if (game.hintTimer) clearTimeout(game.hintTimer);
                game.hintTimer = setTimeout(function() {
                    game.hintMove = null;
                    render();
                }, 3000);
            }
            updateUI();
            render();
        });
    }

    function applyWorkerData(data) {
        game.board = data.board;
        game.winner = data.winner;
        game.currentPlayer = data.current_player;
        game.history = data.history;
    }

    function checkGameOver() {
        if (game.winner !== 0) {
            game.status = 'idle';
            // Small delay so user can see the final move
            setTimeout(showResult, 300);
        }
    }

    function showResult() {
        var msg = '';
        if (game.winner === 1) {
            msg = '黑棋获胜';
        } else if (game.winner === -1) {
            msg = '白棋获胜';
        } else {
            msg = '平局';
        }
        resultMessage.textContent = msg;
        resultSteps.textContent = '总步数：' + game.history.length;
        resultModal.classList.remove('hidden');
    }

    // ===== Forbidden Move Rules =====
    function countConsecutive(board, x, y, dx, dy) {
        var player = board[x][y];
        var count = 1;
        var i = 1;
        while (true) {
            var nx = x + i * dx;
            var ny = y + i * dy;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE || board[nx][ny] !== player) break;
            count++;
            i++;
        }
        i = 1;
        while (true) {
            var nx2 = x - i * dx;
            var ny2 = y - i * dy;
            if (nx2 < 0 || nx2 >= BOARD_SIZE || ny2 < 0 || ny2 >= BOARD_SIZE || board[nx2][ny2] !== player) break;
            count++;
            i++;
        }
        return count;
    }

    function isOpenThreeCheck(board, x, y, dx, dy) {
        var count = 1;
        var openEnds = 0;
        var i = 1;
        var open1 = false;
        while (true) {
            var nx = x + i * dx;
            var ny = y + i * dy;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (board[nx][ny] === 1) {
                count++;
            } else if (board[nx][ny] === 0) {
                open1 = true;
                break;
            } else {
                break;
            }
            i++;
        }
        i = 1;
        var open2 = false;
        while (true) {
            var nx2 = x - i * dx;
            var ny2 = y - i * dy;
            if (nx2 < 0 || nx2 >= BOARD_SIZE || ny2 < 0 || ny2 >= BOARD_SIZE) break;
            if (board[nx2][ny2] === 1) {
                count++;
            } else if (board[nx2][ny2] === 0) {
                open2 = true;
                break;
            } else {
                break;
            }
            i++;
        }
        if (open1) openEnds++;
        if (open2) openEnds++;
        return count === 3 && openEnds === 2;
    }

    function isFourCheck(board, x, y, dx, dy) {
        var count = 1;
        var openEnds = 0;
        var i = 1;
        var open1 = false;
        while (true) {
            var nx = x + i * dx;
            var ny = y + i * dy;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (board[nx][ny] === 1) {
                count++;
            } else if (board[nx][ny] === 0) {
                open1 = true;
                break;
            } else {
                break;
            }
            i++;
        }
        i = 1;
        var open2 = false;
        while (true) {
            var nx2 = x - i * dx;
            var ny2 = y - i * dy;
            if (nx2 < 0 || nx2 >= BOARD_SIZE || ny2 < 0 || ny2 >= BOARD_SIZE) break;
            if (board[nx2][ny2] === 1) {
                count++;
            } else if (board[nx2][ny2] === 0) {
                open2 = true;
                break;
            } else {
                break;
            }
            i++;
        }
        if (open1) openEnds++;
        if (open2) openEnds++;
        return count === 4 && openEnds >= 1;
    }

    function isForbiddenMove(board, x, y) {
        if (!game.forbiddenMoves) return false;

        // Simulate placing the piece
        board[x][y] = 1;

        var hasLongConnect =
            countConsecutive(board, x, y, 1, 0) > 5 ||
            countConsecutive(board, x, y, 0, 1) > 5 ||
            countConsecutive(board, x, y, 1, 1) > 5 ||
            countConsecutive(board, x, y, 1, -1) > 5;

        var openThreeCount = 0;
        if (isOpenThreeCheck(board, x, y, 1, 0)) openThreeCount++;
        if (isOpenThreeCheck(board, x, y, 0, 1)) openThreeCount++;
        if (isOpenThreeCheck(board, x, y, 1, 1)) openThreeCount++;
        if (isOpenThreeCheck(board, x, y, 1, -1)) openThreeCount++;

        var fourCount = 0;
        if (isFourCheck(board, x, y, 1, 0)) fourCount++;
        if (isFourCheck(board, x, y, 0, 1)) fourCount++;
        if (isFourCheck(board, x, y, 1, 1)) fourCount++;
        if (isFourCheck(board, x, y, 1, -1)) fourCount++;

        // Restore
        board[x][y] = 0;

        return hasLongConnect || openThreeCount >= 2 || fourCount >= 2;
    }

    // ===== Canvas Rendering =====
    function render() {
        if (!ctx) return;
        var size = getDisplaySize();
        var cellSize = getCellSize();
        var theme = THEMES[game.theme];

        // Clear
        ctx.clearRect(0, 0, size, size);

        // Board background
        ctx.fillStyle = theme.bg;
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size, 8);
        ctx.fill();

        // Grid lines
        ctx.strokeStyle = theme.line;
        ctx.lineWidth = 1;
        for (var i = 0; i < BOARD_SIZE; i++) {
            var pos = (i + 1) * cellSize;
            // Horizontal
            ctx.beginPath();
            ctx.moveTo(cellSize, pos);
            ctx.lineTo(cellSize * BOARD_SIZE, pos);
            ctx.stroke();
            // Vertical
            ctx.beginPath();
            ctx.moveTo(pos, cellSize);
            ctx.lineTo(pos, cellSize * BOARD_SIZE);
            ctx.stroke();
        }

        // Star points
        ctx.fillStyle = theme.line;
        for (var s = 0; s < STAR_POINTS.length; s++) {
            var sp = STAR_POINTS[s];
            ctx.beginPath();
            ctx.arc((sp[1] + 1) * cellSize, (sp[0] + 1) * cellSize, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Forbidden move markers (only for black's turn)
        if (game.forbiddenMoves && game.status === 'gaming' && game.currentPlayer === 1) {
            for (var fi = 0; fi < BOARD_SIZE; fi++) {
                for (var fj = 0; fj < BOARD_SIZE; fj++) {
                    if (game.board[fi][fj] === 0 && isForbiddenMove(game.board, fi, fj)) {
                        var fx = (fj + 1) * cellSize;
                        var fy = (fi + 1) * cellSize;
                        ctx.strokeStyle = '#ff0000';
                        ctx.lineWidth = 1.5;
                        var ms = cellSize * 0.15;
                        ctx.beginPath();
                        ctx.moveTo(fx - ms, fy - ms);
                        ctx.lineTo(fx + ms, fy + ms);
                        ctx.moveTo(fx + ms, fy - ms);
                        ctx.lineTo(fx - ms, fy + ms);
                        ctx.stroke();
                    }
                }
            }
        }

        // Pieces
        for (var pi = 0; pi < BOARD_SIZE; pi++) {
            for (var pj = 0; pj < BOARD_SIZE; pj++) {
                if (game.board[pi][pj] !== 0) {
                    drawPiece(pi, pj, game.board[pi][pj], cellSize);
                }
            }
        }

        // Last move marker
        if (game.history.length > 0) {
            var last = game.history[game.history.length - 1];
            var lx = (last.j + 1) * cellSize;
            var ly = (last.i + 1) * cellSize;
            var lr = cellSize * 0.08;
            ctx.fillStyle = last.role === 1 ? '#fff' : '#000';
            ctx.beginPath();
            ctx.arc(lx, ly, lr, 0, Math.PI * 2);
            ctx.fill();
        }

        // Hint marker
        if (game.hintMove) {
            var hx = (game.hintMove[1] + 1) * cellSize;
            var hy = (game.hintMove[0] + 1) * cellSize;
            var hr = cellSize * 0.38;
            ctx.fillStyle = 'rgba(255, 200, 0, 0.5)';
            ctx.beginPath();
            ctx.arc(hx, hy, hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 150, 0, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    function drawPiece(row, col, role, cellSize) {
        var x = (col + 1) * cellSize;
        var y = (row + 1) * cellSize;
        var r = cellSize * 0.42;

        ctx.save();
        if (role === 1) {
            // Black stone
            var grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
            grad.addColorStop(0, '#666');
            grad.addColorStop(1, '#000');
            ctx.fillStyle = grad;
        } else {
            // White stone
            var grad2 = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
            grad2.addColorStop(0, '#fff');
            grad2.addColorStop(1, '#ccc');
            ctx.fillStyle = grad2;
        }

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        ctx.restore();
    }

    // ===== UI Updates =====
    function updateUI() {
        // Status
        if (game.status === 'idle' && game.history.length === 0) {
            statusText.textContent = '点击“开始”进入游戏';
        } else if (game.status === 'gaming') {
            var playerText = game.currentPlayer === 1 ? '黑棋' : '白棋';
            statusText.textContent = '当前回合：' + playerText;
        }

        // Step count
        stepCount.textContent = game.history.length;

        // Buttons
        startBtn.disabled = game.loading;
        undoBtn.disabled = game.loading || game.status !== 'gaming' || game.history.length < 2;
        resignBtn.disabled = game.loading || game.status !== 'gaming';
        hintBtn.disabled = game.loading || game.status !== 'gaming' || game.hints <= 0;
        hintBtn.textContent = '提示 (' + game.hints + ')';
    }

    // ===== Event Binding =====
    function bindEvents() {
        canvas.addEventListener('click', handleCanvasClick);
        canvas.addEventListener('touchstart', function(e) {
            e.preventDefault();
            handleCanvasClick(e);
        }, { passive: false });

        startBtn.addEventListener('click', startGame);
        undoBtn.addEventListener('click', undoMove);
        resignBtn.addEventListener('click', resign);
        hintBtn.addEventListener('click', showHint);

        document.getElementById('ai-first').addEventListener('change', function(e) {
            game.aiFirst = e.target.checked;
        });

        document.getElementById('difficulty').addEventListener('change', function(e) {
            game.depth = parseInt(e.target.value);
        });

        document.getElementById('theme').addEventListener('change', function(e) {
            game.theme = e.target.value;
            render();
        });

        document.getElementById('forbidden-toggle').addEventListener('change', function(e) {
            game.forbiddenMoves = e.target.checked;
            render();
        });

        document.getElementById('play-again-btn').addEventListener('click', function() {
            resultModal.classList.add('hidden');
            startGame();
        });

        document.getElementById('close-modal-btn').addEventListener('click', function() {
            resultModal.classList.add('hidden');
        });

        window.addEventListener('resize', function() {
            resizeCanvas();
        });
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
