(() => {
    'use strict';

    // 动物等级：大吃小，鼠吃象
    const ANIMALS = {
        elephant: { name: '象', rank: 8, icon: '🐘' },
        lion:     { name: '狮', rank: 7, icon: '🦁' },
        tiger:    { name: '虎', rank: 6, icon: '🐯' },
        leopard:  { name: '豹', rank: 5, icon: '🐆' },
        wolf:     { name: '狼', rank: 4, icon: '🐺' },
        dog:      { name: '狗', rank: 3, icon: '🐶' },
        cat:      { name: '猫', rank: 2, icon: '🐱' },
        rat:      { name: '鼠', rank: 1, icon: '🐭' }
    };

    const ANIMAL_KEYS = Object.keys(ANIMALS);
    const BOARD_SIZE = 4;
    const TOTAL_CARDS = BOARD_SIZE * BOARD_SIZE;

    const TAP_THRESHOLD = 10;
    const DEBOUNCE_DELAY = 180;
    const AI_DELAY = 1300;
    const FLIP_ANIMATION_MS = 620;

    let board = [];
    let currentPlayer = 'a'; // 'a' (human) or 'b' (AI)
    let phase = 'play';      // 'play', 'end'
    let selectedCard = null; // currently selected card for moving
    let lastTap = { time: 0, row: null, col: null };
    let touchStartPos = null; // For distinguishing tap vs swipe
    let aiThinking = false;  // Is AI currently thinking
    let aiTurnToken = 0;     // Incremented each game; stale AI callbacks are discarded
    let openingTurn = false;
    let shownFlippedIds = new Set();
    let animatingFlipIds = new Set();
    let flipStabilizeTimers = new Map();
    let emptyIdCounter = 0;
    let hintMessageTimer = null;
    let headerTipTimer = null;

    // DOM elements
    const boardEl = document.getElementById('board');
    const turnText = document.getElementById('turn-text');
    const playerAInfo = document.getElementById('player-a-info');
    const playerBInfo = document.getElementById('player-b-info');
    const playerACount = document.getElementById('player-a-count');
    const playerBCount = document.getElementById('player-b-count');
    const headerTip = document.getElementById('header-tip');
    const resultModal = document.getElementById('result-modal');
    const resultTitle = document.getElementById('result-title');
    const resultDesc = document.getElementById('result-desc');
    const resultA = document.getElementById('result-a');
    const resultB = document.getElementById('result-b');
    const restartBtn = document.getElementById('restart-btn');
    const playAgainBtn = document.getElementById('play-again-btn');

    // Initialize game
    function initGame() {
        board = [];
        currentPlayer = Math.random() < 0.5 ? 'a' : 'b';
        phase = 'play';
        selectedCard = null;
        openingTurn = true;
        shownFlippedIds = new Set();
        animatingFlipIds = new Set();
        clearFlipStabilizeTimers();
        emptyIdCounter = 0;
        clearHintMessage();
        clearHeaderTip();
        aiTurnToken++;

        // Create one full animal set for each side.
        let cards = [];
        for (const key of ANIMAL_KEYS) {
            cards.push({ id: `a-${key}`, animal: key, owner: 'a', flipped: false, captured: false });
            cards.push({ id: `b-${key}`, animal: key, owner: 'b', flipped: false, captured: false });
        }

        // Shuffle
        for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
        }

        // Place on board
        for (let r = 0; r < BOARD_SIZE; r++) {
            board[r] = [];
            for (let c = 0; c < BOARD_SIZE; c++) {
                board[r][c] = cards[r * BOARD_SIZE + c];
            }
        }

        renderBoard();
        updateUI();

        if (currentPlayer === 'b') {
            scheduleAITurn();
        }
    }

    // Render board
    function renderBoard() {
        ensureBoardCells();
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                updateCardElement(getCardElement(r, c), r, c);
            }
        }
        syncShownFlippedCards();
        animatingFlipIds = new Set();
    }

    function ensureBoardCells() {
        if (boardEl.children.length === TOTAL_CARDS) return;

        boardEl.innerHTML = '';
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cardEl = document.createElement('button');
                cardEl.type = 'button';
                cardEl.dataset.row = r;
                cardEl.dataset.col = c;
                addTouchEventListeners(cardEl, r, c);
                boardEl.appendChild(cardEl);
            }
        }
    }

    function getCardElement(row, col) {
        return boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    }

    function refreshCard(row, col) {
        updateCardElement(getCardElement(row, col), row, col);
    }

    function updateCardElement(cardEl, row, col) {
        const card = board[row][col];
        const classes = ['card'];

        if (card.flipped || card.captured) classes.push('flipped');
        if (card.captured) classes.push('captured');
        if (animatingFlipIds.has(card.id)) classes.push('flip-animating');
        if ((card.flipped || card.captured) && !animatingFlipIds.has(card.id)) {
            classes.push('no-flip-animation');
        }
        if (card.flipped || card.captured) {
            if (card.owner === 'a') classes.push('player-a');
            if (card.owner === 'b') classes.push('player-b');
        }
        if (phase === 'play' && currentPlayer === 'a' && !aiThinking && !card.captured) {
            if (!card.flipped || (card.flipped && card.owner === 'a')) {
                classes.push('actionable');
            }
        }
        if (selectedCard && selectedCard.row === row && selectedCard.col === col) {
            classes.push('selected');
        }
        if (selectedCard && isValidMoveTarget(row, col)) {
            classes.push('valid-move');
        }

        cardEl.className = classes.join(' ');
        cardEl.disabled = phase === 'end' || currentPlayer === 'b' || aiThinking;
        cardEl.setAttribute('aria-label', getCardAriaLabel(card, row, col));

        const animal = ANIMALS[card.animal];
        const ownerLabel = card.flipped && card.owner === 'a' ? '你' :
            card.flipped && card.owner === 'b' ? '电脑' : '';
        const content = card.captured
            ? '<span class="empty-label">空</span>'
            : `<span class="animal-icon">${animal.icon}</span><span class="animal-name">${animal.name}</span>`;
        const nextMarkup = `
                    <div class="card-inner">
                        <div class="card-face card-back"></div>
                        <div class="card-face card-front">
                            ${ownerLabel ? `<span class="owner-badge">${ownerLabel}</span>` : ''}
                            ${content}
                        </div>
                    </div>
                `;

        if (cardEl.dataset.renderKey !== `${card.id}:${card.flipped}:${card.captured}:${card.owner}`) {
            cardEl.innerHTML = nextMarkup;
            cardEl.dataset.renderKey = `${card.id}:${card.flipped}:${card.captured}:${card.owner}`;
        }
    }

    function getCardAriaLabel(card, row, col) {
        const position = `${row + 1}行${col + 1}列`;
        if (card.captured) return `${position}，空格`;
        if (!card.flipped) return `${position}，未翻开的牌`;

        const ownerLabel = card.owner === 'a' ? '你的' : '电脑的';
        return `${position}，${ownerLabel}${ANIMALS[card.animal].name}`;
    }

    function markCardForFlipAnimation(card) {
        if (!card || shownFlippedIds.has(card.id)) return;
        animatingFlipIds.add(card.id);
    }

    function scheduleFlipStabilize(cardId, row, col) {
        if (flipStabilizeTimers.has(cardId)) {
            clearTimeout(flipStabilizeTimers.get(cardId));
        }

        const timer = setTimeout(() => {
            flipStabilizeTimers.delete(cardId);
            animatingFlipIds.delete(cardId);
            const card = board[row]?.[col];
            if (card && card.id === cardId) {
                refreshCard(row, col);
            }
        }, FLIP_ANIMATION_MS);

        flipStabilizeTimers.set(cardId, timer);
    }

    function clearFlipStabilizeTimers() {
        for (const timer of flipStabilizeTimers.values()) {
            clearTimeout(timer);
        }
        flipStabilizeTimers = new Map();
    }

    function syncShownFlippedCards() {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const card = board[r][c];
                if (card.flipped || card.captured) {
                    shownFlippedIds.add(card.id);
                }
            }
        }
    }

    // Add touch event listeners with debounce and tap/swipe detection
    function addTouchEventListeners(element, row, col) {
        let startX, startY;

        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            touchStartPos = { x: startX, y: startY };

            // Add press feedback
            element.classList.add('pressing');
        }, { passive: false });

        element.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const dx = Math.abs(touch.clientX - startX);
            const dy = Math.abs(touch.clientY - startY);

            // If moved too far, it's a swipe not a tap
            if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
                element.classList.remove('pressing');
            }
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            element.classList.remove('pressing');

            if (!touchStartPos) return;

            const touch = e.changedTouches[0];
            const dx = Math.abs(touch.clientX - touchStartPos.x);
            const dy = Math.abs(touch.clientY - touchStartPos.y);

            // Only count as tap if didn't move far
            if (dx <= TAP_THRESHOLD && dy <= TAP_THRESHOLD) {
                const now = Date.now();
                const isRepeatedSameCell = lastTap.row === row &&
                    lastTap.col === col &&
                    now - lastTap.time < DEBOUNCE_DELAY;
                if (!isRepeatedSameCell) {
                    lastTap = { time: now, row, col };
                    onCardClick(row, col);
                }
            }

            touchStartPos = null;
        }, { passive: false });

        // Also support mouse click for desktop
        element.addEventListener('click', (e) => {
            // Prevent double-firing on touch devices
            if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
            onCardClick(row, col);
        });
    }

    // Update UI state
    function updateUI() {
        const aCount = countPieces('a');
        const bCount = countPieces('b');
        playerACount.textContent = aCount;
        playerBCount.textContent = bCount;

        playerAInfo.classList.toggle('active', currentPlayer === 'a' && phase === 'play');
        playerBInfo.classList.toggle('active', currentPlayer === 'b' && phase === 'play');

        if (phase === 'play') {
            if (aiThinking) {
                turnText.textContent = openingTurn ? '电脑先手' : '电脑思考中';
            } else {
                turnText.textContent = currentPlayer === 'a'
                    ? (openingTurn ? '你先手' : '你的回合')
                    : '电脑回合';
            }
        } else if (phase === 'end') {
            turnText.textContent = '游戏结束';
        } else {
            turnText.textContent = '准备开始';
        }

        updateHintText();

    }

    function updateHintText() {
        const hintEl = document.querySelector('.hint-text');
        if (!hintEl || hintEl.dataset.locked === 'true') return;

        if (phase === 'end') {
            hintEl.textContent = '本局结束，可以重新开始。';
        } else if (aiThinking || currentPlayer === 'b') {
            if (openingTurn) {
                hintEl.textContent = '电脑先手：正在思考第一步。';
                return;
            }
            hintEl.textContent = '电脑回合：正在思考下一步。';
        } else if (selectedCard) {
            hintEl.textContent = '轮到你：点相邻高亮格移动或吃子。';
        } else if (openingTurn) {
            hintEl.textContent = '你先手：点背面牌翻开，或选择你的棋子移动吃子。';
        } else {
            hintEl.textContent = '轮到你：点背面牌翻开，或选择你的棋子移动吃子。';
        }
    }

    // Count pieces for a player
    function countPieces(player) {
        let count = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c].owner === player && !board[r][c].captured) {
                    count++;
                }
            }
        }
        return count;
    }

    // Card click handler
    function onCardClick(row, col) {
        if (phase === 'end') return;
        if (currentPlayer === 'b' || aiThinking) return;

        const card = board[row][col];

        // In 'play' phase, player can flip or move
        if (card.flipped || card.captured) {
            // Card is already flipped - handle as move
            handleMove(row, col, card);
        } else {
            // Card is face down - handle as flip
            handleFlip(row, col, card);
        }
    }

    // Handle flip action
    function handleFlip(row, col, card) {
        if (card.flipped) return;

        markCardForFlipAnimation(card);

        card.flipped = true;

        selectedCard = null;
        renderBoard();
        scheduleFlipStabilize(card.id, row, col);
        updateUI();

        // Check win condition
        if (checkWinCondition()) return;

        showActionTip(`${getPlayerName(currentPlayer)}翻开了${ANIMALS[card.animal].name}`);

        // Switch player
        openingTurn = false;
        switchPlayer();
    }

    // Handle move action
    function handleMove(row, col, card) {
        if (selectedCard && selectedCard.row === row && selectedCard.col === col) {
            selectedCard = null;
            renderBoard();
            showHintMessage('已取消选择');
            return;
        }

        // If clicking own piece, select it
        if (card.owner === currentPlayer && card.flipped && !card.captured) {
            selectedCard = { row, col };
            renderBoard();
            showHintMessage('请选择相邻可吃的牌或空格');
            return;
        }

        // If clicking enemy piece without selecting own piece first
        if (card.owner && card.owner !== currentPlayer && card.flipped && !card.captured && !selectedCard) {
            showHintMessage('请先选择你的棋子');
            return;
        }

        if (card.captured && !selectedCard) {
            showHintMessage('请先选择你的棋子');
            return;
        }

        // If a piece is selected and clicking valid target
        if (selectedCard) {
            if (isValidMoveTarget(row, col)) {
                executeMove(selectedCard.row, selectedCard.col, row, col);
            } else {
                // Deselect if clicking invalid target
                selectedCard = null;
                renderBoard();
                showHintMessage('无法移动到该位置');
            }
        }
    }

    // Show hint message temporarily
    function showHintMessage(msg) {
        const hintEl = document.querySelector('.hint-text');
        if (hintEl) {
            if (hintMessageTimer) {
                clearTimeout(hintMessageTimer);
            }
            hintEl.dataset.locked = 'true';
            hintEl.textContent = msg;
            hintEl.style.color = 'var(--player-a)';
            hintMessageTimer = setTimeout(() => {
                hintEl.style.color = '';
                hintEl.dataset.locked = 'false';
                hintMessageTimer = null;
                updateHintText();
            }, 1500);
        }
    }

    function clearHintMessage() {
        if (hintMessageTimer) {
            clearTimeout(hintMessageTimer);
            hintMessageTimer = null;
        }
        const hintEl = document.querySelector('.hint-text');
        if (hintEl) {
            hintEl.dataset.locked = 'false';
            hintEl.style.color = '';
        }
    }

    // Check if target is valid move
    function isValidMoveTarget(targetRow, targetCol) {
        if (!selectedCard) return false;

        const sr = selectedCard.row;
        const sc = selectedCard.col;
        const dr = Math.abs(targetRow - sr);
        const dc = Math.abs(targetCol - sc);

        // Must be adjacent (up, down, left, right)
        if (!((dr === 1 && dc === 0) || (dr === 0 && dc === 1))) return false;

        const target = board[targetRow][targetCol];
        const source = board[sr][sc];

        // Can't move to own piece
        if (target.owner === currentPlayer && target.flipped && !target.captured) return false;

        // Can move to empty (captured) or enemy
        if (target.captured) return true;
        if (!target.flipped) return false; // Can't move to unflipped card

        // Battle check
        return canBattle(source.animal, target.animal);
    }

    // Battle logic: can attacker beat defender?
    function canBattle(attacker, defender) {
        const a = ANIMALS[attacker];
        const d = ANIMALS[defender];

        if (attacker === defender) return true;

        // Rat beats elephant
        if (attacker === 'rat' && defender === 'elephant') return true;
        // Elephant can't beat rat
        if (attacker === 'elephant' && defender === 'rat') return false;

        return a.rank >= d.rank;
    }

    // Execute move
    function executeMove(fromRow, fromCol, toRow, toCol) {
        const source = board[fromRow][fromCol];
        const target = board[toRow][toCol];
        const isCapture = target.owner && target.owner !== currentPlayer && target.flipped;
        const isCancelOut = isCapture && source.animal === target.animal;

        const actorName = getPlayerName(currentPlayer);
        const opponentName = getPlayerName(target.owner);
        const sourceName = ANIMALS[source.animal].name;

        if (isCancelOut) {
            board[fromRow][fromCol] = createEmptyCell(fromRow, fromCol, source.animal);
            board[toRow][toCol] = createEmptyCell(toRow, toCol, target.animal);
            selectedCard = null;

            renderBoard();
            updateUI();

            // Check win condition
            if (checkWinCondition()) return;

            showActionTip(`${actorName}和${opponentName}的${sourceName}抵消了`);

            openingTurn = false;
            switchPlayer();
            return;
        }

        // If target is enemy, capture it
        if (isCapture) {
            target.captured = true;
            target.owner = null;
        }

        const actionTip = isCapture
            ? `${actorName}用${sourceName}吃子`
            : `${actorName}移动${sourceName}`;

        // Move source to target position
        board[toRow][toCol] = { ...source };
        board[fromRow][fromCol] = createEmptyCell(fromRow, fromCol, source.animal);

        selectedCard = null;

        renderBoard();
        updateUI();

        // Check win condition
        if (checkWinCondition()) return;

        showActionTip(actionTip);

        openingTurn = false;
        switchPlayer();
    }

    function createEmptyCell(row, col, animal) {
        return { id: `empty-${row}-${col}-${++emptyIdCounter}`, animal, owner: null, flipped: true, captured: true };
    }

    // Schedule AI turn with turn-token guard
    function scheduleAITurn() {
        aiThinking = true;
        updateUI();
        const token = aiTurnToken;
        setTimeout(() => {
            if (aiTurnToken !== token) return;
            aiTurn();
        }, AI_DELAY);
    }

    // Switch player
    function switchPlayer() {
        currentPlayer = currentPlayer === 'a' ? 'b' : 'a';
        selectedCard = null;
        updateUI();

        // If it's AI's turn, let AI play
        if (currentPlayer === 'b' && phase === 'play') {
            scheduleAITurn();
        }
    }

    // AI turn logic
    function aiTurn() {
        if (phase !== 'play' || currentPlayer !== 'b') return;
        aiThinking = true;
        updateUI();

        // Decide whether to flip or move
        const hasUnflipped = hasUnflippedCards();
        const hasMovable = hasValidMoves('b', { includeFlips: false });

        if (hasUnflipped && (!hasMovable || Math.random() < 0.5)) {
            // Flip a card
            aiFlipCard();
        } else if (hasMovable) {
            // Move a piece
            aiMovePiece();
        } else {
            // No valid moves, skip
            aiThinking = false;
            switchPlayer();
        }
    }

    // Check if there are unflipped cards
    function hasUnflippedCards() {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (!board[r][c].flipped && !board[r][c].captured) return true;
            }
        }
        return false;
    }

    // AI flip card logic
    function aiFlipCard() {
        // Find best card to flip (prioritize near player's pieces)
        const candidates = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (!board[r][c].flipped && !board[r][c].captured) {
                    let score = 0;
                    // Check if adjacent to player's pieces (higher priority)
                    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                    for (const [dr, dc] of directions) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
                        const neighbor = board[nr][nc];
                        if (neighbor.owner === 'a' && neighbor.flipped) {
                            score += 1;
                        }
                    }
                    candidates.push({ row: r, col: c, score });
                }
            }
        }

        if (candidates.length === 0) {
            aiThinking = false;
            switchPlayer();
            return;
        }

        // Sort by score (descending) and pick best with some randomness
        candidates.sort((a, b) => b.score - a.score);
        const topScore = candidates[0].score;
        const topCandidates = candidates.filter(c => c.score === topScore);
        const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)];

        // Execute flip
        const card = board[chosen.row][chosen.col];
        markCardForFlipAnimation(card);
        card.flipped = true;
        renderBoard();
        scheduleFlipStabilize(card.id, chosen.row, chosen.col);
        updateUI();

        aiThinking = false;
        if (checkWinCondition()) return;

        showActionTip(`电脑翻开了${ANIMALS[card.animal].name}`);

        openingTurn = false;
        switchPlayer();
    }

    // AI move piece logic
    function aiMovePiece() {
        const moves = [];

        // Find all valid moves
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const card = board[r][c];
                if (card.owner !== 'b' || card.captured || !card.flipped) continue;

                const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                for (const [dr, dc] of directions) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;

                    const target = board[nr][nc];
                    if (target.captured) {
                        moves.push({ fromRow: r, fromCol: c, toRow: nr, toCol: nc, score: 0 });
                    } else if (target.flipped && target.owner === 'a' && canBattle(card.animal, target.animal)) {
                        // Can eat player's piece - higher priority
                        moves.push({ fromRow: r, fromCol: c, toRow: nr, toCol: nc, score: ANIMALS[target.animal].rank });
                    }
                }
            }
        }

        if (moves.length === 0) {
            aiThinking = false;
            openingTurn = false;
            switchPlayer();
            return;
        }

        // Sort by score (descending) and pick best
        moves.sort((a, b) => b.score - a.score);
        const bestScore = moves[0].score;
        const bestMoves = moves.filter(m => m.score === bestScore);
        const chosen = bestMoves[Math.floor(Math.random() * bestMoves.length)];

        aiThinking = false;
        executeMove(chosen.fromRow, chosen.fromCol, chosen.toRow, chosen.toCol);
    }

    // Check win condition (called after an action, before switching player)
    function checkWinCondition() {
        // If there are still unflipped cards, don't end the game based on piece count
        const hasUnflipped = hasUnflippedCards();

        if (!hasUnflipped) {
            // All cards are flipped, check piece counts
            const aCount = countPieces('a');
            const bCount = countPieces('b');

            if (aCount === 0) {
                endGame('b', '你的棋子全部被吃掉');
                return true;
            }
            if (bCount === 0) {
                endGame('a', '电脑的棋子全部被吃掉');
                return true;
            }
        }

        // Check if the NEXT player has any valid moves
        const nextPlayer = currentPlayer === 'a' ? 'b' : 'a';
        if (!hasValidMoves(nextPlayer)) {
            const winner = currentPlayer;
            const loserName = nextPlayer === 'a' ? '你' : '电脑';
            endGame(winner, `${loserName}无可用操作`);
            return true;
        }

        return false;
    }

    // Check if player has valid moves
    function hasValidMoves(player, options = {}) {
        const includeFlips = options.includeFlips !== false;

        // Check for unflipped cards (can flip)
        if (includeFlips) {
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (!board[r][c].flipped && !board[r][c].captured) return true;
                }
            }
        }

        // Check for movable pieces
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const card = board[r][c];
                if (card.owner !== player || card.captured || !card.flipped) continue;

                // Check adjacent cells
                const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                for (const [dr, dc] of directions) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;

                    const target = board[nr][nc];
                    if (target.captured) return true; // Can move to empty
                    if (!target.flipped) continue;
                    if (target.owner === player) continue;
                    if (canBattle(card.animal, target.animal)) return true;
                }
            }
        }

        return false;
    }

    // End game
    function endGame(winner, reason) {
        phase = 'end';
        aiThinking = false;
        clearHeaderTip();
        updateUI();

        const winnerName = winner === 'a' ? '你' : '电脑';
        resultTitle.textContent = `${winnerName}获胜！`;
        resultDesc.textContent = reason;
        resultA.textContent = countPieces('a');
        resultB.textContent = countPieces('b');
        if (resultModal) resultModal.hidden = false;
    }

    function getPlayerName(player) {
        return player === 'a' ? '你' : '电脑';
    }

    function showActionTip(message) {
        if (!headerTip) return;

        if (headerTipTimer) {
            clearTimeout(headerTipTimer);
        }

        headerTip.textContent = message;
        headerTip.hidden = false;
        headerTip.classList.remove('show');
        void headerTip.offsetWidth;
        headerTip.classList.add('show');

        headerTipTimer = setTimeout(() => {
            headerTip.classList.remove('show');
            headerTip.hidden = true;
            headerTipTimer = null;
        }, 1250);
    }

    function clearHeaderTip() {
        if (headerTipTimer) {
            clearTimeout(headerTipTimer);
            headerTipTimer = null;
        }
        if (headerTip) {
            headerTip.classList.remove('show');
            headerTip.hidden = true;
            headerTip.textContent = '';
        }
    }

    restartBtn.addEventListener('click', initGame);
    playAgainBtn.addEventListener('click', () => {
        if (resultModal) resultModal.hidden = true;
        initGame();
    });

    // Start game
    initGame();

    window.AnimalFlipChess = {
        ANIMALS,
        canBattle,
        getStateForTest() {
            return {
                board: board.map((row) => row.map((card) => ({ ...card }))),
                currentPlayer,
                phase,
                selectedCard: selectedCard ? { ...selectedCard } : null,
                aiThinking,
                openingTurn
            };
        },
        setStateForTest(nextState) {
            board = nextState.board.map((row, rowIndex) => row.map((card, colIndex) => ({
                id: card.id || `${card.owner || 'none'}-${card.animal}-${rowIndex}-${colIndex}`,
                ...card
            })));
            currentPlayer = nextState.currentPlayer || 'a';
            phase = nextState.phase || 'play';
            selectedCard = nextState.selectedCard || null;
            aiThinking = Boolean(nextState.aiThinking);
            openingTurn = Boolean(nextState.openingTurn);
            shownFlippedIds = new Set();
            for (const row of board) {
                for (const card of row) {
                    if (card.flipped || card.captured) shownFlippedIds.add(card.id);
                }
            }
            animatingFlipIds = new Set(nextState.animatingFlipIds || []);
            clearFlipStabilizeTimers();
            emptyIdCounter = 0;
            clearHintMessage();
            renderBoard();
            updateUI();
        }
    };
})();
