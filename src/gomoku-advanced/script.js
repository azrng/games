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

    // ===== 本地存档（localStorage，长期保存）=====
    var SAVE_KEY = 'gomoku_save_v1';
    var save = {
        version: 1,
        settings: null,   // { aiFirst, depth, theme, forbiddenMoves }
        stats: { wins: 0, losses: 0 },
        game: null         // 进行中对局快照，结束时置 null
    };

    function loadSave() {
        try {
            var raw = window.localStorage.getItem(SAVE_KEY);
            var parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || parsed.version !== 1 || typeof parsed !== 'object') return;
            if (parsed.stats && typeof parsed.stats === 'object') {
                save.stats.wins = Number(parsed.stats.wins) || 0;
                save.stats.losses = Number(parsed.stats.losses) || 0;
            }
            save.settings = isValidSettings(parsed.settings) ? parsed.settings : null;
            save.game = isValidGameSnapshot(parsed.game) ? parsed.game : null;
        } catch (error) {
            // 隐私模式等存储不可用场景：静默降级为无存档
        }
    }

    function persistSave() {
        try {
            window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
        } catch (error) {
            // 存储不可用时对局照常进行，只是不落盘
        }
    }

    function isValidSettings(settings) {
        if (!settings || typeof settings !== 'object') return false;
        if (!THEMES[settings.theme]) return false;
        var depth = parseInt(settings.depth, 10);
        if (isNaN(depth) || depth < 2 || depth > 8) return false;
        return typeof settings.aiFirst === 'boolean'
            && typeof settings.forbiddenMoves === 'boolean';
    }

    function isValidGameSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        var history = snapshot.history;
        if (!Array.isArray(history) || history.length === 0) return false;
        if (snapshot.winner !== 0) return false;

        // 在本地矩阵上重放校验：坐标合法、格子未占用、落子方与快照一致
        var replay = [];
        for (var i = 0; i < BOARD_SIZE; i++) {
            replay.push(new Array(BOARD_SIZE).fill(0));
        }
        for (var h = 0; h < history.length; h++) {
            var entry = history[h];
            if (!entry || typeof entry !== 'object') return false;
            var row = entry.i, col = entry.j, role = entry.role;
            if (!isFinite(row) || !isFinite(col)) return false;
            row = Math.round(row); col = Math.round(col);
            if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return false;
            if (role !== 1 && role !== -1) return false;
            if (replay[row][col] !== 0) return false;
            replay[row][col] = role;
        }
        if (typeof snapshot.hints !== 'number' || snapshot.hints < 0) return false;
        return true;
    }

    function snapshotGame() {
        if (game.status !== 'gaming' || game.winner !== 0 || game.history.length === 0) {
            return null;
        }
        return {
            board: JSON.parse(JSON.stringify(game.board)),
            currentPlayer: game.currentPlayer,
            history: JSON.parse(JSON.stringify(game.history)),
            hints: game.hints,
            winner: 0,
            playerRole: game.currentPlayer  // 落盘点始终轮到玩家，存档即玩家回合
        };
    }

    function persistGameState() {
        save.game = snapshotGame();
        persistSave();
    }

    function recordResult(winner) {
        // 玩家执子颜色：电脑先手时 AI 执黑(1)，玩家为白(-1)
        var playerRole = save.game && save.game.playerRole
            ? save.game.playerRole
            : (game.aiFirst ? -1 : 1);
        if (winner === playerRole) {
            save.stats.wins++;
        } else if (winner === -playerRole) {
            save.stats.losses++;
        }
        save.game = null;
        persistSave();
        updateStatsText();
    }

    function updateStatsText() {
        var statsText = document.getElementById('stats-text');
        if (statsText) {
            statsText.textContent = save.stats.wins + '胜 ' + save.stats.losses + '负';
        }
    }

    function applySavedSettingsToControls() {
        if (!save.settings) return;
        if (aiFirstInput) aiFirstInput.checked = save.settings.aiFirst;
        if (difficultySelect) difficultySelect.value = String(save.settings.depth);
        if (themeSelect) themeSelect.value = save.settings.theme;
        if (forbiddenToggle) forbiddenToggle.checked = save.settings.forbiddenMoves;
    }

    function persistSettings() {
        save.settings = {
            aiFirst: game.aiFirst,
            depth: game.depth,
            theme: game.theme,
            forbiddenMoves: game.forbiddenMoves
        };
        persistSave();
    }

    function restoreSavedGame() {
        if (!save.game) return;
        var snapshot = save.game;
        game.hints = snapshot.hints;
        sendToWorker('restore', {
            size: BOARD_SIZE,
            history: snapshot.history
        }).then(function(data) {
            applyWorkerData(data);
            game.status = 'gaming';
            updateUI();
            render();
            // 恢复后规范化存档（以 worker 回读数据为准）
            persistGameState();
        });
    }

    // DOM Elements
    var canvas, ctx;
    var startBtn, undoBtn, resignBtn, hintBtn;
    var statusText, stepCount;
    var loadingOverlay;
    var resultModal, resultMessage, resultSteps;
    var aiFirstInput, difficultySelect, themeSelect, forbiddenToggle;

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
        aiFirstInput = document.getElementById('ai-first');
        difficultySelect = document.getElementById('difficulty');
        themeSelect = document.getElementById('theme');
        forbiddenToggle = document.getElementById('forbidden-toggle');

        // 带版本参数：脚本更新时保证 worker 同步换新，避免恢复消息发进旧 worker
        worker = new Worker('ai-worker.js?v=20261010-2');

        loadSave();
        applySavedSettingsToControls();
        syncSettingsFromControls();
        resetBoard();
        resizeCanvas();
        render();
        bindEvents();
        updateStatsText();
        restoreSavedGame();
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
        var containerStyle = window.getComputedStyle(container);
        var horizontalPadding = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
        var availableWidth = (container.clientWidth || 600) - horizontalPadding;
        var maxSize = Math.min(availableWidth || 600, 600);
        var dpr = window.devicePixelRatio || 1;
        canvas.width = maxSize * dpr;
        canvas.height = maxSize * dpr;
        canvas.style.width = maxSize + 'px';
        canvas.style.height = maxSize + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        render();
    }

    function getCellSize() {
        return getDisplaySize() / (BOARD_SIZE + 1);
    }

    function getDisplaySize() {
        var rect = canvas.getBoundingClientRect();
        return Math.min(rect.width, rect.height) || parseFloat(canvas.style.width);
    }

    function getBoardPointFromEvent(e) {
        var rect = canvas.getBoundingClientRect();
        var point = e.changedTouches ? e.changedTouches[0] : (e.touches ? e.touches[0] : e);
        var displaySize = getDisplaySize();
        var scaleX = displaySize / rect.width;
        var scaleY = displaySize / rect.height;

        return {
            x: (point.clientX - rect.left) * scaleX,
            y: (point.clientY - rect.top) * scaleY
        };
    }

    function drawRoundedRect(x, y, width, height, radius) {
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, width, height, radius);
            return;
        }

        var safeRadius = Math.min(radius, width / 2, height / 2);
        ctx.moveTo(x + safeRadius, y);
        ctx.lineTo(x + width - safeRadius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        ctx.lineTo(x + width, y + height - safeRadius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        ctx.lineTo(x + safeRadius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        ctx.lineTo(x, y + safeRadius);
        ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    }

    function syncSettingsFromControls() {
        if (aiFirstInput) {
            game.aiFirst = aiFirstInput.checked;
        }
        if (difficultySelect) {
            var parsedDepth = parseInt(difficultySelect.value, 10);
            if (!isNaN(parsedDepth)) {
                game.depth = parsedDepth;
            }
        }
        if (themeSelect) {
            game.theme = themeSelect.value;
        }
        if (forbiddenToggle) {
            game.forbiddenMoves = forbiddenToggle.checked;
        }
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
        syncSettingsFromControls();
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
        syncSettingsFromControls();

        var point = getBoardPointFromEvent(e);
        var cellSize = getCellSize();
        var col = Math.round(point.x / cellSize - 1);
        var row = Math.round(point.y / cellSize - 1);

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
            persistGameState();
        });
    }

    function resign() {
        if (game.status !== 'gaming') return;
        // Current player resigns, opponent wins
        game.winner = -game.currentPlayer;
        game.status = 'idle';
        recordResult(game.winner);
        showResult();
    }

    function showHint() {
        if (game.loading || game.status !== 'gaming' || game.hints <= 0) return;
        syncSettingsFromControls();

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
            recordResult(game.winner);
            // Small delay so user can see the final move
            setTimeout(showResult, 300);
        } else {
            persistGameState();
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
        drawRoundedRect(0, 0, size, size, 8);
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
        if (hintBtn) {
            hintBtn.disabled = game.loading || game.status !== 'gaming' || game.hints <= 0;
            hintBtn.textContent = '提示 (' + game.hints + ')';
        }
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
        if (hintBtn) {
            hintBtn.addEventListener('click', showHint);
        }

        aiFirstInput.addEventListener('change', function(e) {
            game.aiFirst = e.target.checked;
            persistSettings();
        });

        difficultySelect.addEventListener('change', function(e) {
            game.depth = parseInt(e.target.value, 10);
            persistSettings();
        });

        themeSelect.addEventListener('change', function(e) {
            game.theme = e.target.value;
            persistSettings();
            render();
        });

        forbiddenToggle.addEventListener('change', function(e) {
            game.forbiddenMoves = e.target.checked;
            persistSettings();
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
