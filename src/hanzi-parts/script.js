(function setupHanziParts(windowObject, documentObject) {
    'use strict';

    const SLUG = 'hanzi-parts';
    const UNLOCK_KEY = 'hanzi-parts-unlocked-level';
    const STARS_KEY_PREFIX = 'hanzi-parts-stars-';
    const BASE_SEED = 20261010;
    const LEVEL_TOTAL = 12;
    const FLY_DURATION_MS = 340;
    const SHAKE_DURATION_MS = 480;
    const memoryFallback = {};

    /* 题库读取自 hanndata.js；数据文件缺失（直接打开等）时降级为空库，页面仍可渲染骨架 */
    const DATA = Array.isArray(windowObject.HanziPartsData) ? windowObject.HanziPartsData : [];

    const state = {
        level: 1,
        targets: [],
        targetCards: [],
        pool: [],
        cardButtons: [],
        selected: [],
        foundCount: 0,
        mistakes: 0,
        locked: false,
        clearTimer: 0
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        progressText: documentObject.getElementById('progress-text'),
        mistakesText: documentObject.getElementById('mistakes-text'),
        starsText: documentObject.getElementById('stars-text'),
        targetList: documentObject.getElementById('target-list'),
        benchStage: documentObject.getElementById('bench-stage'),
        benchMessage: documentObject.getElementById('bench-message'),
        pool: documentObject.getElementById('pool'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
        resultMistakes: documentObject.getElementById('result-mistakes'),
        resultChars: documentObject.getElementById('result-chars'),
        replayBtn: documentObject.getElementById('replay-btn'),
        nextBtn: documentObject.getElementById('next-btn'),
        levelModal: documentObject.getElementById('level-modal'),
        levelGrid: documentObject.getElementById('level-grid'),
        closeLevelsBtn: documentObject.getElementById('close-levels-btn')
    };

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

    /* mulberry32 种子随机数，保证同种子关卡可复现 */
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

    function levelCount() {
        return LEVEL_TOTAL;
    }

    /* 关卡档位：1-4 关 3 字（池 6）、5-8 关 4 字（池 8）、9-12 关 5 字（池 10） */
    function levelConfig(level) {
        if (level <= 4) return { targetCount: 3, poolSize: 6 };
        if (level <= 8) return { targetCount: 4, poolSize: 8 };
        return { targetCount: 5, poolSize: 10 };
    }

    function levelSeed(level) {
        return (BASE_SEED + level * 6271) >>> 0;
    }

    /* 组合规范键：部件按字典序排序后拼接，保证 日+月 与 月+日 等价 */
    function combinationKey(a, b) {
        return [a, b].slice().sort().join('+');
    }

    /* 在给定字库中查找两部件能组成的字条目，顺序无关；找不到返回 null */
    function tryCombine(data, a, b) {
        const key = combinationKey(a, b);
        for (const entry of data) {
            if (combinationKey(entry.parts[0], entry.parts[1]) === key) return entry;
        }
        return null;
    }

    /* 星级只看失误次数：0 失误三星、不超过 3 次两星、其余一星 */
    function starRating(mistakes) {
        if (mistakes <= 0) return 3;
        if (mistakes <= 3) return 2;
        return 1;
    }

    /* 用种子随机打乱数组副本（Fisher-Yates），不修改原数组 */
    function seededShuffle(list, random) {
        const next = list.slice();
        for (let i = next.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            const tmp = next[i];
            next[i] = next[j];
            next[j] = tmp;
        }
        return next;
    }

    /* 关卡生成：抽目标字（两两组合键互不相同）+ 干扰部件，同种子结果完全一致。
       目标只取两个部件不同的字：部件池要求互异，林=木+木这类同部件字需要两张相同部件卡才能拼出 */
    function generateLevel(level, seed) {
        const config = levelConfig(level);
        const random = createSeededRandom(((seed >>> 0) + level * 7919) >>> 0);

        const candidates = [];
        for (const entry of DATA) {
            if (entry.parts[0] !== entry.parts[1]) candidates.push(entry);
        }
        const targets = [];
        const usedKeys = new Set();
        for (const entry of seededShuffle(candidates, random)) {
            const key = combinationKey(entry.parts[0], entry.parts[1]);
            if (usedKeys.has(key)) continue;
            usedKeys.add(key);
            targets.push(entry);
            if (targets.length === config.targetCount) break;
        }

        /* 部件池 = 全部所需部件（去重）+ 干扰部件，整体打乱后输出 */
        const pool = [];
        const inPool = new Set();
        const addPart = (part) => {
            if (!inPool.has(part)) {
                inPool.add(part);
                pool.push(part);
            }
        };
        for (const entry of targets) {
            addPart(entry.parts[0]);
            addPart(entry.parts[1]);
        }
        const bankParts = [];
        for (const entry of DATA) {
            for (const part of entry.parts) {
                if (!inPool.has(part)) bankParts.push(part);
            }
        }
        const shuffledBank = seededShuffle(bankParts, random);
        const distractorCount = Math.max(0, config.poolSize - pool.length);
        for (let i = 0; i < distractorCount && i < shuffledBank.length; i += 1) {
            addPart(shuffledBank[i]);
        }
        return { targets, pool: seededShuffle(pool, random) };
    }

    function loadUnlockedLevel() {
        const parsed = Number.parseInt(safeGetItem(UNLOCK_KEY) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    /* 解锁只增不减 */
    function saveUnlockedLevel(level) {
        if (level > loadUnlockedLevel()) {
            safeSetItem(UNLOCK_KEY, String(level));
        }
        return loadUnlockedLevel();
    }

    function loadStars(level) {
        const parsed = Number.parseInt(safeGetItem(STARS_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed >= 1 && parsed <= 3 ? parsed : 0;
    }

    /* 星级保留历史最好成绩 */
    function saveStars(level, stars) {
        const next = Math.max(loadStars(level), stars);
        safeSetItem(STARS_KEY_PREFIX + level, String(next));
        return next;
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

    function updateHeader() {
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.progressText.textContent = `${state.foundCount}/${state.targets.length}`;
        elements.mistakesText.textContent = String(state.mistakes);
        renderStars(elements.starsText, starRating(state.mistakes));
    }

    function renderTargets() {
        const fragment = documentObject.createDocumentFragment();
        const cards = [];
        for (const entry of state.targets) {
            const card = documentObject.createElement('div');
            card.className = 'target-card';
            card.setAttribute('aria-label', `目标字 ${entry.char}，待拼出`);
            const pinyin = documentObject.createElement('span');
            pinyin.className = 'target-pinyin';
            pinyin.textContent = '？';
            const charEl = documentObject.createElement('strong');
            charEl.className = 'target-char';
            charEl.textContent = '？';
            const word = documentObject.createElement('span');
            word.className = 'target-word';
            word.textContent = '待拼出';
            card.appendChild(pinyin);
            card.appendChild(charEl);
            card.appendChild(word);
            fragment.appendChild(card);
            cards.push({ entry, card, pinyinEl: pinyin, charEl, wordEl: word });
        }
        elements.targetList.replaceChildren(fragment);
        state.targetCards = cards;
    }

    function markTargetFound(entry) {
        for (const item of state.targetCards) {
            if (item.entry === entry) {
                item.card.classList.add('is-found');
                item.card.setAttribute('aria-label', `已拼出 ${entry.char}`);
                item.pinyinEl.textContent = entry.pinyin;
                item.charEl.textContent = entry.char;
                item.wordEl.textContent = entry.word;
            }
        }
    }

    /* 合成台两种内容：占位/已选部件槽位，以及拼中后的结果字卡 */
    function renderBenchSlots(parts) {
        const stage = documentObject.createElement('div');
        stage.className = 'bench-slots';
        const slots = parts.slice(0, 2);
        while (slots.length < 2) slots.push(null);
        slots.forEach((part, index) => {
            if (index === 1) {
                const plus = documentObject.createElement('span');
                plus.className = 'bench-plus';
                plus.textContent = '+';
                stage.appendChild(plus);
            }
            const chip = documentObject.createElement('span');
            chip.className = part ? 'bench-chip' : 'bench-slot';
            chip.textContent = part || '？';
            stage.appendChild(chip);
        });
        elements.benchStage.replaceChildren(stage);
    }

    function showBenchIdle() {
        elements.benchStage.classList.remove('is-error');
        renderBenchSlots([]);
        elements.benchMessage.textContent = '点两个部件，拼出目标清单里的字';
    }

    function refreshBenchSelection() {
        renderBenchSlots(state.selected.map((index) => state.pool[index]));
        elements.benchMessage.textContent = state.selected.length === 1 ? '再点一个部件试试' : '看看能拼出什么字？';
    }

    function showBenchResult(entry) {
        elements.benchStage.classList.remove('is-error');
        const stage = documentObject.createElement('div');
        stage.className = 'bench-result is-pop';
        const charEl = documentObject.createElement('strong');
        charEl.textContent = entry.char;
        const info = documentObject.createElement('span');
        info.className = 'bench-info';
        info.textContent = `${entry.pinyin} · ${entry.word}`;
        stage.appendChild(charEl);
        stage.appendChild(info);
        elements.benchStage.replaceChildren(stage);
        elements.benchMessage.textContent = `拼出了「${entry.char}」，真棒！`;
    }

    /* 把两张选中部件卡以浮动副本的形式飞入合成台；环境不支持读取布局时直接结算 */
    function flyPartsToBench(cards, done) {
        const benchBox = typeof elements.benchStage.getBoundingClientRect === 'function'
            ? elements.benchStage.getBoundingClientRect()
            : null;
        const clones = [];
        if (benchBox) {
            for (const card of cards) {
                const box = card.getBoundingClientRect();
                const clone = documentObject.createElement('div');
                clone.className = 'fly-part';
                clone.textContent = card.textContent;
                clone.style.left = `${box.left + box.width / 2}px`;
                clone.style.top = `${box.top + box.height / 2}px`;
                documentObject.body.appendChild(clone);
                clones.push({ clone, x: box.left + box.width / 2, y: box.top + box.height / 2 });
            }
            /* 下一帧再设置目标位移，保证过渡动画从卡片原位起飞 */
            windowObject.setTimeout(() => {
                const targetX = benchBox.left + benchBox.width / 2;
                const targetY = benchBox.top + benchBox.height / 2;
                for (const item of clones) {
                    item.clone.style.transform = `translate(${targetX - item.x}px, ${targetY - item.y}px) scale(0.45)`;
                    item.clone.classList.add('is-flying');
                }
            }, 16);
        }
        windowObject.setTimeout(() => {
            for (const item of clones) {
                if (item.clone.remove) item.clone.remove();
            }
            done();
        }, benchBox ? FLY_DURATION_MS : 0);
    }

    function clearSelection() {
        state.selected = [];
        for (const button of state.cardButtons) {
            button.classList.remove('is-selected');
        }
    }

    function handleCombineSuccess(entry, firstIndex, secondIndex) {
        state.foundCount += 1;
        for (const index of [firstIndex, secondIndex]) {
            const button = state.cardButtons[index];
            button.classList.remove('is-selected');
            button.classList.add('is-used');
            button.disabled = true;
        }
        state.selected = [];
        markTargetFound(entry);
        showBenchResult(entry);
        updateHeader();
        if (state.foundCount === state.targets.length) {
            state.locked = true;
            windowObject.setTimeout(showWinModal, 650);
        } else {
            state.locked = false;
        }
    }

    function handleCombineMiss(firstPart, secondPart, firstIndex, secondIndex) {
        state.mistakes += 1;
        for (const index of [firstIndex, secondIndex]) {
            const button = state.cardButtons[index];
            button.classList.remove('is-selected');
            button.classList.add('is-shaking');
        }
        elements.benchStage.classList.add('is-error');
        /* 命中题库但不是本关目标时给出更具体的提示，星级扣减规则不变 */
        const bankHit = tryCombine(DATA, firstPart, secondPart);
        elements.benchMessage.textContent = bankHit
            ? `「${bankHit.char}」拼得出来，但不是本关目标，看看清单再试！`
            : '这两个部件拼不出字，换一对试试！';
        updateHeader();
        state.clearTimer = windowObject.setTimeout(() => {
            state.clearTimer = 0;
            elements.benchStage.classList.remove('is-error');
            for (const index of [firstIndex, secondIndex]) {
                state.cardButtons[index].classList.remove('is-shaking');
            }
            state.selected = [];
            showBenchIdle();
            state.locked = false;
        }, SHAKE_DURATION_MS);
    }

    function resolveCombination() {
        const [firstIndex, secondIndex] = state.selected;
        const firstPart = state.pool[firstIndex];
        const secondPart = state.pool[secondIndex];
        state.locked = true;
        flyPartsToBench([state.cardButtons[firstIndex], state.cardButtons[secondIndex]], () => {
            const hit = tryCombine(state.targets, firstPart, secondPart);
            if (hit) {
                handleCombineSuccess(hit, firstIndex, secondIndex);
            } else {
                handleCombineMiss(firstPart, secondPart, firstIndex, secondIndex);
            }
        });
    }

    function handlePartTap(index) {
        if (state.locked) return;
        const button = state.cardButtons[index];
        if (!button || button.disabled) return;
        const position = state.selected.indexOf(index);
        if (position >= 0) {
            /* 再次点击已选中的卡片表示取消选择 */
            state.selected.splice(position, 1);
            button.classList.remove('is-selected');
            refreshBenchSelection();
            return;
        }
        if (state.selected.length >= 2) return;
        state.selected.push(index);
        button.classList.add('is-selected');
        if (state.selected.length < 2) {
            refreshBenchSelection();
            return;
        }
        resolveCombination();
    }

    function renderPool() {
        const fragment = documentObject.createDocumentFragment();
        const buttons = [];
        state.pool.forEach((part, index) => {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'part-card';
            button.dataset.index = String(index);
            button.setAttribute('aria-label', `部件 ${part}`);
            button.textContent = part;
            button.addEventListener('click', () => handlePartTap(index));
            buttons.push(button);
            fragment.appendChild(button);
        });
        elements.pool.replaceChildren(fragment);
        state.cardButtons = buttons;
    }

    function showWinModal() {
        const stars = starRating(state.mistakes);
        const saved = saveStars(state.level, stars);
        saveUnlockedLevel(state.level + 1);
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${saved} 星`);
        elements.resultMistakes.textContent = String(state.mistakes);
        const fragment = documentObject.createDocumentFragment();
        for (const entry of state.targets) {
            const item = documentObject.createElement('div');
            item.className = 'learned-item';
            const charEl = documentObject.createElement('strong');
            charEl.textContent = entry.char;
            const info = documentObject.createElement('span');
            info.textContent = `${entry.pinyin} · ${entry.word}`;
            item.appendChild(charEl);
            item.appendChild(info);
            fragment.appendChild(item);
        }
        elements.resultChars.replaceChildren(fragment);
        elements.nextBtn.hidden = state.level >= levelCount();
        elements.winModal.hidden = false;
    }

    function renderLevelPicker() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= levelCount(); level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'level-item';
            button.dataset.level = String(level);
            const locked = level > unlocked;
            const stars = loadStars(level);
            button.setAttribute('aria-label', locked ? `第 ${level} 关，未解锁` : `第 ${level} 关，已获得 ${stars} 星`);
            const num = documentObject.createElement('span');
            num.className = 'level-num';
            num.textContent = String(level);
            const starRow = documentObject.createElement('span');
            starRow.className = 'level-stars';
            starRow.textContent = locked ? '🔒' : stars > 0 ? '★'.repeat(stars) : '·';
            button.appendChild(num);
            button.appendChild(starRow);
            if (level === state.level) {
                button.classList.add('is-current');
            }
            if (locked) {
                button.classList.add('is-locked');
                button.disabled = true;
            }
            button.addEventListener('click', () => {
                elements.levelModal.hidden = true;
                startLevel(level);
            });
            fragment.appendChild(button);
        }
        elements.levelGrid.replaceChildren(fragment);
    }

    function startLevel(level) {
        if (state.clearTimer) {
            windowObject.clearTimeout(state.clearTimer);
            state.clearTimer = 0;
        }
        const safeLevel = Math.min(Math.max(1, level), levelCount());
        const generated = generateLevel(safeLevel, levelSeed(safeLevel));

        state.level = safeLevel;
        state.targets = generated.targets;
        state.pool = generated.pool;
        state.selected = [];
        state.foundCount = 0;
        state.mistakes = 0;
        state.locked = false;

        elements.winModal.hidden = true;
        elements.levelModal.hidden = true;
        renderTargets();
        renderPool();
        showBenchIdle();
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

    windowObject.HanziApi = {
        SLUG,
        BASE_SEED,
        LEVEL_TOTAL,
        DATA,
        combinationKey,
        tryCombine,
        generateLevel,
        starRating,
        levelConfig,
        levelCount,
        levelSeed,
        createSeededRandom,
        loadUnlockedLevel,
        saveUnlockedLevel,
        loadStars,
        saveStars
    };

    /* 续玩进度：直接回到最新解锁的关卡 */
    startLevel(Math.min(loadUnlockedLevel(), levelCount()));
})(window, document);
