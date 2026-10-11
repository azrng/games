(function setupMemoryMatch(windowObject, documentObject) {
    'use strict';

    const SLUG = 'memory-match';
    const UNLOCK_KEY = 'memory-match-unlocked-level';
    const STAR_KEY_PREFIX = 'memory-match-stars-';
    const BEST_KEY_PREFIX = 'memory-match-best-';
    const TIP_KEY = 'memory-match-tip-dismissed';
    const BASE_SEED = 20261010;
    const FLIP_BACK_DELAY = 800; /* 不配对时正面展示时长（毫秒），期间锁定点击防连点 */
    const WIN_DELAY = 700; /* 全部配对后等弹跳动画播完再弹结算（毫秒） */
    const memoryFallback = {};

    /* —— 主题池：按关轮换抽取，每组至少 18 个不同 emoji（最多一关要 18 对）—— */
    const THEMES = [
        {
            key: 'animals',
            name: '动物',
            emoji: ['🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🦁', '🐸', '🐵', '🐷', '🐨', '🐯', '🐔', '🦉', '🐴', '🦄', '🐢', '🐝', '🐘']
        },
        {
            key: 'fruits',
            name: '水果',
            emoji: ['🍎', '🍇', '🍓', '🍋', '🍑', '🍉', '🍒', '🍍', '🥝', '🍌', '🥑', '🍐', '🥭', '🥥', '🍅', '🫐', '🌽', '🥕', '🍊', '🍈', '🥒']
        },
        {
            key: 'transport',
            name: '交通',
            emoji: ['🚗', '🚌', '🚒', '🚓', '🚲', '✈️', '🚂', '🚁', '🚕', '🛵', '🚀', '⛵', '🚛', '🏎️', '🚑', '🛴', '🚤', '🛸', '🚚', '🚜']
        },
        {
            key: 'foods',
            name: '食物',
            emoji: ['🍔', '🍟', '🍕', '🍝', '🍩', '🍰', '🌮', '🧁', '🍦', '🥨', '🍿', '🥞', '🌭', '🥐', '🍢', '🍡', '🥟', '🍫', '🍪', '🍯', '🍭']
        },
        {
            key: 'ocean',
            name: '海洋',
            emoji: ['🐠', '🐟', '🐬', '🐳', '🐙', '🦀', '🦞', '🦐', '🦑', '🦪', '🦈', '🐡', '🦭', '🐢', '🐚', '🐊', '🐧', '🌊']
        }
    ];

    /* —— 12 关卡阵递进表：pairs 对数 × cols 列数，行数 = 卡数 / 列数 —— */
    const LEVEL_TABLE = [
        { pairs: 6, cols: 3 }, { pairs: 6, cols: 3 },
        { pairs: 8, cols: 4 }, { pairs: 8, cols: 4 },
        { pairs: 10, cols: 4 }, { pairs: 10, cols: 4 },
        { pairs: 12, cols: 4 }, { pairs: 12, cols: 4 },
        { pairs: 15, cols: 5 }, { pairs: 15, cols: 5 },
        { pairs: 18, cols: 6 }, { pairs: 18, cols: 6 }
    ];

    const state = {
        level: 1,
        deck: [],
        cardButtons: [],
        revealed: [],
        firstIndex: -1,
        matchedCount: 0,
        flips: 0,
        locked: false,
        flipBackTimer: 0
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        flipsText: documentObject.getElementById('flips-text'),
        pairsText: documentObject.getElementById('pairs-text'),
        bestText: documentObject.getElementById('best-text'),
        grid: documentObject.getElementById('grid'),
        tipBar: documentObject.getElementById('tip-bar'),
        tipCloseBtn: documentObject.getElementById('tip-close-btn'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
        resultFlips: documentObject.getElementById('result-flips'),
        resultBest: documentObject.getElementById('result-best'),
        replayBtn: documentObject.getElementById('replay-btn'),
        nextBtn: documentObject.getElementById('next-btn'),
        levelModal: documentObject.getElementById('level-modal'),
        levelGrid: documentObject.getElementById('level-grid'),
        closeLevelsBtn: documentObject.getElementById('close-levels-btn')
    };

    /* 存档读写兜底：localStorage 不可用时退回内存，保证本局可玩不报错 */
    function safeGetItem(key) {
        try {
            return windowObject.localStorage.getItem(key);
        } catch (_) {
            return Object.prototype.hasOwnProperty.call(memoryFallback, key) ? memoryFallback[key] : null;
        }
    }

    function safeSetItem(key, value) {
        try {
            windowObject.localStorage.setItem(key, value);
        } catch (_) {
            memoryFallback[key] = value;
        }
    }

    /* mulberry32 种子随机数，保证同种子牌阵完全可复现 */
    function createSeededRandom(seed) {
        let a = seed >>> 0;
        return function random() {
            a += 0x6D2B79F5;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* Fisher-Yates 种子洗牌：就地打乱并返回原数组 */
    function seededShuffle(list, random) {
        for (let i = list.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            const tmp = list[i];
            list[i] = list[j];
            list[j] = tmp;
        }
        return list;
    }

    function clampLevel(level) {
        const parsed = Number.isFinite(level) ? Math.floor(level) : 1;
        return Math.min(Math.max(parsed, 1), LEVEL_TABLE.length);
    }

    function levelCount() {
        return LEVEL_TABLE.length;
    }

    function levelConfig(level) {
        const safe = clampLevel(level);
        const base = LEVEL_TABLE[safe - 1];
        return {
            level: safe,
            pairs: base.pairs,
            cols: base.cols,
            rows: (base.pairs * 2) / base.cols
        };
    }

    /* 关卡主题按 12 关顺序在主题池上轮换 */
    function themeForLevel(level) {
        return THEMES[(clampLevel(level) - 1) % THEMES.length];
    }

    /* 关卡牌阵的确定性种子 */
    function levelSeed(level) {
        return (BASE_SEED + clampLevel(level) * 6271) >>> 0;
    }

    /* 构造牌阵：先种子洗牌主题池抽出本关图案，再复制成对后整体洗牌。
       返回 [{ emoji, pairId }]，长度恒为 2 × pairs，每个 pairId 恰好 2 张 */
    function buildDeck(themeKey, pairs, seed) {
        const theme = THEMES.find((item) => item.key === themeKey) || THEMES[0];
        const safePairs = Math.min(Math.max(Math.floor(pairs) || 0, 1), theme.emoji.length);
        const random = createSeededRandom(seed >>> 0);
        const pool = seededShuffle(theme.emoji.slice(), random);
        const deck = [];
        for (let pairId = 0; pairId < safePairs; pairId += 1) {
            deck.push({ emoji: pool[pairId], pairId });
            deck.push({ emoji: pool[pairId], pairId });
        }
        return seededShuffle(deck, random);
    }

    /* 配对判定：pairId 相等即为同款 */
    function evaluatePair(a, b) {
        if (!a || !b) return false;
        return a.pairId === b.pairId;
    }

    /* 星级：翻两张记 1 次。≤ 对数×2 三星（零失误完美），≤ 对数×2.5 两星，其余一星 */
    function starRating(flips, pairs) {
        const safePairs = Math.max(Math.floor(pairs) || 0, 1);
        const safeFlips = Math.max(Math.floor(flips) || 0, 0);
        if (safeFlips <= safePairs * 2) return 3;
        if (safeFlips <= safePairs * 2.5) return 2;
        return 1;
    }

    function loadUnlockedLevel() {
        const parsed = Number.parseInt(safeGetItem(UNLOCK_KEY) || '', 10);
        return Number.isFinite(parsed) ? clampLevel(parsed) : 1;
    }

    /* 解锁进度只增不减 */
    function saveUnlockedLevel(level) {
        const next = clampLevel(level);
        if (next > loadUnlockedLevel()) {
            safeSetItem(UNLOCK_KEY, String(next));
        }
    }

    function starKey(level) {
        return STAR_KEY_PREFIX + clampLevel(level);
    }

    function loadStars(level) {
        const parsed = Number.parseInt(safeGetItem(starKey(level)) || '', 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;
        return Math.min(parsed, 3);
    }

    /* 星级保留历史最大值 */
    function saveStars(level, stars) {
        const safe = Math.min(Math.max(Math.floor(stars) || 0, 0), 3);
        const next = Math.max(loadStars(level), safe);
        safeSetItem(starKey(level), String(next));
        return next;
    }

    function loadBest(level) {
        const parsed = Number.parseInt(safeGetItem(BEST_KEY_PREFIX + clampLevel(level)) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    /* 最佳成绩保留历史最少翻牌次数，0 表示尚无记录 */
    function saveBest(level, flips) {
        const safe = Math.max(Math.floor(flips) || 0, 0);
        if (safe <= 0) return loadBest(level);
        const previous = loadBest(level);
        const next = previous > 0 ? Math.min(previous, safe) : safe;
        safeSetItem(BEST_KEY_PREFIX + clampLevel(level), String(next));
        return next;
    }

    function updateHeader() {
        const totalPairs = state.deck.length / 2;
        const best = loadBest(state.level);
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.flipsText.textContent = String(state.flips);
        elements.pairsText.textContent = `${state.matchedCount} / ${totalPairs}`;
        elements.bestText.textContent = best > 0 ? String(best) : '--';
    }

    function flipCard(index, faceUp) {
        const button = state.cardButtons[index];
        if (!button) return;
        if (faceUp) {
            button.classList.add('is-flipped');
            button.setAttribute('aria-label', `第 ${index + 1} 张卡：${state.deck[index].emoji}`);
        } else {
            button.classList.remove('is-flipped');
            button.setAttribute('aria-label', `第 ${index + 1} 张卡，背面朝上`);
        }
    }

    function markMatched(firstIndex, secondIndex) {
        const first = state.cardButtons[firstIndex];
        const second = state.cardButtons[secondIndex];
        if (first) first.classList.add('is-matched');
        if (second) second.classList.add('is-matched');
    }

    function renderStars(container, stars) {
        const nodes = [];
        for (let index = 0; index < 3; index += 1) {
            const span = documentObject.createElement('span');
            span.textContent = '★';
            if (index >= stars) {
                span.className = 'star-off';
            }
            nodes.push(span);
        }
        container.replaceChildren(...nodes);
    }

    function showWinModal() {
        const config = levelConfig(state.level);
        const stars = starRating(state.flips, config.pairs);
        const best = saveBest(state.level, state.flips);
        saveStars(state.level, stars);
        saveUnlockedLevel(state.level + 1);
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
        elements.resultFlips.textContent = String(state.flips);
        elements.resultBest.textContent = String(best);
        elements.nextBtn.hidden = state.level >= levelCount();
        elements.winModal.hidden = false;
        updateHeader();
    }

    /* 点卡主流程：已翻开 / 已配对 / 锁定中一律忽略；
       第二张翻开即计 1 次翻牌，配对成功保持正面，失败约 800ms 后翻回 */
    function handleCardTap(index) {
        if (state.locked) return;
        if (state.revealed[index]) return;
        state.revealed[index] = true;
        flipCard(index, true);

        if (state.firstIndex < 0) {
            state.firstIndex = index;
            return;
        }

        const firstIndex = state.firstIndex;
        state.firstIndex = -1;
        state.flips += 1;
        updateHeader();

        if (evaluatePair(state.deck[firstIndex], state.deck[index])) {
            state.matchedCount += 1;
            markMatched(firstIndex, index);
            updateHeader();
            if (state.matchedCount === state.deck.length / 2) {
                state.locked = true;
                state.flipBackTimer = setTimeout(showWinModal, WIN_DELAY);
            }
            return;
        }

        state.locked = true;
        state.flipBackTimer = setTimeout(() => {
            flipCard(firstIndex, false);
            flipCard(index, false);
            state.revealed[firstIndex] = false;
            state.revealed[index] = false;
            state.locked = false;
        }, FLIP_BACK_DELAY);
    }

    function renderBoard() {
        const config = levelConfig(state.level);
        const fragment = documentObject.createDocumentFragment();
        const buttons = [];

        elements.grid.setAttribute('data-cols', String(config.cols));
        elements.grid.setAttribute('aria-label', `第 ${state.level} 关卡阵，${config.cols} 列 ${config.rows} 行`);

        state.deck.forEach((card, index) => {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'memory-card';
            button.setAttribute('data-index', String(index));
            button.setAttribute('aria-label', `第 ${index + 1} 张卡，背面朝上`);

            const inner = documentObject.createElement('span');
            inner.className = 'card-inner';

            const back = documentObject.createElement('span');
            back.className = 'card-face card-back';

            const front = documentObject.createElement('span');
            front.className = 'card-face card-front';
            front.textContent = card.emoji;

            inner.appendChild(back);
            inner.appendChild(front);
            button.appendChild(inner);
            button.addEventListener('click', () => handleCardTap(index));
            buttons.push(button);
            fragment.appendChild(button);
        });

        elements.grid.replaceChildren(fragment);
        state.cardButtons = buttons;
    }

    function renderLevelPicker() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= levelCount(); level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'level-item';
            if (level > unlocked) {
                button.disabled = true;
                button.classList.add('is-locked');
                button.setAttribute('aria-label', `第 ${level} 关还未解锁`);
                button.textContent = '🔒';
            } else {
                const stars = loadStars(level);
                const num = documentObject.createElement('span');
                num.className = 'level-num';
                num.textContent = String(level);
                const starRow = documentObject.createElement('span');
                starRow.className = 'level-stars';
                starRow.textContent = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '未挑战';
                button.appendChild(num);
                button.appendChild(starRow);
                button.setAttribute('aria-label', `第 ${level} 关，${stars} 星`);
                if (level === state.level) {
                    button.classList.add('is-current');
                }
                button.addEventListener('click', () => {
                    elements.levelModal.hidden = true;
                    startLevel(level);
                });
            }
            fragment.appendChild(button);
        }
        elements.levelGrid.replaceChildren(fragment);
    }

    function startLevel(level) {
        if (state.flipBackTimer) {
            clearTimeout(state.flipBackTimer);
            state.flipBackTimer = 0;
        }
        const safe = clampLevel(level);
        const config = levelConfig(safe);
        const theme = themeForLevel(safe);
        state.level = safe;
        state.deck = buildDeck(theme.key, config.pairs, levelSeed(safe));
        state.revealed = new Array(state.deck.length).fill(false);
        state.firstIndex = -1;
        state.matchedCount = 0;
        state.flips = 0;
        state.locked = false;

        elements.winModal.hidden = true;
        elements.levelModal.hidden = true;
        renderBoard();
        updateHeader();
    }

    elements.restartBtn.addEventListener('click', () => startLevel(state.level));
    elements.replayBtn.addEventListener('click', () => startLevel(state.level));
    elements.nextBtn.addEventListener('click', () => startLevel(state.level + 1));
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelPicker();
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });
    /* 玩法提示条：关闭一次后记入存档，之后不再出现 */
    elements.tipCloseBtn.addEventListener('click', () => {
        safeSetItem(TIP_KEY, '1');
        elements.tipBar.hidden = true;
    });

    windowObject.MemoryApi = {
        SLUG,
        THEMES,
        FLIP_BACK_DELAY,
        BASE_SEED,
        createSeededRandom,
        seededShuffle,
        levelCount,
        levelConfig,
        levelSeed,
        themeForLevel,
        buildDeck,
        evaluatePair,
        starRating,
        loadUnlockedLevel,
        saveUnlockedLevel,
        loadStars,
        saveStars,
        loadBest,
        saveBest
    };

    /* 进入游戏：优先落到最新解锁关；首次进入（无关闭记录）展示玩法提示条 */
    elements.tipBar.hidden = safeGetItem(TIP_KEY) === '1';
    startLevel(loadUnlockedLevel());
})(window, document);
