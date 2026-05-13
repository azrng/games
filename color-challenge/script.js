(function setupColorChallenge(windowObject, documentObject) {
    'use strict';

    const SLUG = 'color-challenge';
    const HIGH_SCORE_KEY = 'color-challenge-high-score';
    const BEST_ROUNDS_KEY = 'color-challenge-best-rounds';
    const MIN_COLOR_DELTA = 7;

    const state = {
        round: 1,
        score: 0,
        startedAt: Date.now(),
        elapsedSeconds: 0,
        acceptingInput: false,
        answerIndex: 0,
        tiles: [],
        timerId: 0
    };

    const elements = {
        roundText: documentObject.getElementById('round-text'),
        scoreText: documentObject.getElementById('score-text'),
        bestScore: documentObject.getElementById('best-score'),
        bestRounds: documentObject.getElementById('best-rounds'),
        timerText: documentObject.getElementById('timer-text'),
        grid: documentObject.getElementById('grid'),
        resultModal: documentObject.getElementById('result-modal'),
        resultScore: documentObject.getElementById('result-score'),
        resultRounds: documentObject.getElementById('result-rounds'),
        resultBestScore: documentObject.getElementById('result-best-score'),
        resultBestRounds: documentObject.getElementById('result-best-rounds'),
        restartBtn: documentObject.getElementById('restart-btn')
    };

    function getStorageNumber(key) {
        const value = windowObject.localStorage.getItem(key);
        const parsed = Number.parseInt(value || '0', 10);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function loadRecords() {
        return {
            highScore: getStorageNumber(HIGH_SCORE_KEY),
            bestRounds: getStorageNumber(BEST_ROUNDS_KEY)
        };
    }

    function saveRecords(result) {
        const records = loadRecords();
        const nextHighScore = Math.max(records.highScore, result.score);
        const nextBestRounds = Math.max(records.bestRounds, result.rounds);
        windowObject.localStorage.setItem(HIGH_SCORE_KEY, String(nextHighScore));
        windowObject.localStorage.setItem(BEST_ROUNDS_KEY, String(nextBestRounds));
        return { highScore: nextHighScore, bestRounds: nextBestRounds };
    }

    function getGridSize(round) {
        if (round <= 5) return 2;
        if (round <= 10) return 3;
        if (round <= 20) return 4;
        if (round <= 30) return 5;
        return 6;
    }

    function getColorDelta(round) {
        return Math.max(MIN_COLOR_DELTA, 30 - Math.floor((round - 1) * 0.72));
    }

    function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function createRoundColors(round) {
        const hue = randomInt(0, 359);
        const saturation = randomInt(46, 76);
        const lightness = randomInt(40, 64);
        const delta = getColorDelta(round);
        const direction = Math.random() > 0.5 ? 1 : -1;
        const hueDelta = Math.max(4, Math.round(delta * 0.7)) * direction;
        const lightDelta = Math.max(3, Math.round(delta * 0.36)) * direction;

        return {
            base: `hsl(${hue} ${saturation}% ${lightness}%)`,
            different: `hsl(${(hue + hueDelta + 360) % 360} ${clamp(saturation + direction * 2, 34, 84)}% ${clamp(lightness + lightDelta, 28, 76)}%)`
        };
    }

    function updateHeader() {
        const records = loadRecords();
        elements.roundText.textContent = String(state.round);
        elements.scoreText.textContent = String(state.score);
        elements.bestScore.textContent = String(records.highScore);
        elements.bestRounds.textContent = String(records.bestRounds);
        elements.timerText.textContent = `${state.elapsedSeconds}秒`;
    }

    function renderRound() {
        const gridSize = getGridSize(state.round);
        const total = gridSize * gridSize;
        const colors = createRoundColors(state.round);
        const answerIndex = randomInt(0, total - 1);
        const fragment = documentObject.createDocumentFragment ? documentObject.createDocumentFragment() : null;
        const tiles = [];

        state.answerIndex = answerIndex;
        state.acceptingInput = true;
        elements.grid.classList.remove('is-wrong');
        elements.grid.style.gridTemplateColumns = `repeat(${gridSize}, minmax(0, 1fr))`;
        elements.grid.setAttribute('aria-label', `第 ${state.round} 轮，${gridSize} 乘 ${gridSize} 色块`);

        for (let index = 0; index < total; index += 1) {
            const tile = documentObject.createElement('button');
            tile.type = 'button';
            tile.className = 'color-tile';
            tile.style.backgroundColor = index === answerIndex ? colors.different : colors.base;
            tile.dataset.index = String(index);
            tile.setAttribute('aria-label', `色块 ${index + 1}`);
            tile.addEventListener('click', () => handleTileClick(index, tile));
            tiles.push(tile);

            if (fragment) {
                fragment.appendChild(tile);
            }
        }

        if (fragment) {
            elements.grid.replaceChildren(fragment);
        } else {
            elements.grid.replaceChildren(...tiles);
        }
        state.tiles = tiles;
    }

    function startTimer() {
        if (state.timerId) {
            clearInterval(state.timerId);
        }
        state.startedAt = Date.now();
        state.elapsedSeconds = 0;
        state.timerId = setInterval(() => {
            state.elapsedSeconds = Math.floor((Date.now() - state.startedAt) / 1000);
            updateHeader();
        }, 1000);
    }

    function startGame() {
        state.round = 1;
        state.score = 0;
        state.acceptingInput = false;
        elements.resultModal.hidden = true;
        startTimer();
        updateHeader();
        renderRound();
    }

    function advanceRound(tile) {
        state.acceptingInput = false;
        tile.classList.add('is-correct');
        state.score += 1;
        state.round += 1;
        updateHeader();
        setTimeout(() => {
            renderRound();
        }, 140);
    }

    function endGame() {
        state.acceptingInput = false;
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = 0;
        }

        const roundsSurvived = state.round - 1;
        const records = saveRecords({ score: state.score, rounds: roundsSurvived });
        elements.grid.classList.add('is-wrong');
        elements.resultScore.textContent = String(state.score);
        elements.resultRounds.textContent = String(roundsSurvived);
        elements.resultBestScore.textContent = String(records.highScore);
        elements.resultBestRounds.textContent = String(records.bestRounds);

        setTimeout(() => {
            elements.resultModal.hidden = false;
            updateHeader();
        }, 180);
    }

    function handleTileClick(index, tile) {
        if (!state.acceptingInput) {
            return;
        }

        if (index === state.answerIndex) {
            advanceRound(tile);
            return;
        }

        endGame();
    }

    elements.restartBtn.addEventListener('click', startGame);

    windowObject.ColorChallenge = {
        SLUG,
        MIN_COLOR_DELTA,
        getGridSize,
        getColorDelta,
        createRoundColors,
        loadRecords,
        saveRecords
    };

    startGame();
})(window, document);
