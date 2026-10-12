(function setupPatternQuest(windowObject, documentObject) {
    'use strict';

    const SLUG = 'pattern-quest';
    const UNLOCK_KEY = 'pattern-quest-unlocked-level';
    const STAR_KEY_PREFIX = 'pattern-quest-stars-';
    const BASE_SEED = 20261010;
    const PUZZLES_PER_LEVEL = 6;
    const TOTAL_LEVELS = 12;
    const memoryFallback = {};

    /* —— 图案素材：emoji 动物 / 水果，以及纯 CSS 图形（用于“同形状变色”关卡）—— */
    const POOL_ANIMALS = ['🐶', '🐱', '🐰', '🐻', '🐼', '🐨', '🐷', '🦊', '🐸', '🐵'];
    const POOL_FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍉', '🍍', '🥝', '🍑', '🍒'];
    const CSS_SHAPES = ['circle', 'square', 'triangle', 'diamond'];
    const TINT_KEYS = ['red', 'blue', 'green', 'amber', 'purple'];
    const TINT_LABELS = { red: '红色', blue: '蓝色', green: '绿色', amber: '黄色', purple: '紫色' };
    const SHAPE_LABELS = { circle: '圆形', square: '方形', triangle: '三角形', diamond: '菱形' };

    /* —— 题型声明：kind 为规律求值方式；show 为展示项数量（数组表示随机区间）；desc 是给孩子看的规律提示。
       cycle 类型的 show 必须取循环节长度的整数倍：否则孩子把已展示序列整体当循环节也能自洽读通，
       推出的“下一项”与正解不同，形成两可答案（smoke 的歧义校验器负责把关） —— */
    const PATTERN_TYPES = {
        ab: { kind: 'cycle', show: 4, desc: '两个图案轮流出现' },
        aabb: { kind: 'cycle', show: 4, desc: '两个一组重复出现' },
        abc: { kind: 'cycle', show: 6, desc: '三个图案依次循环' },
        grow: { kind: 'grow', show: 3, desc: '数量一次比一次多 1' },
        tint: { kind: 'cycle', show: 6, desc: '颜色交替出现' },
        mixed: { kind: 'cycle', show: 6, desc: '形状轮流出现，数量 1、2 交替' },
        abcd: { kind: 'cycle', show: 8, desc: '四个图案依次循环' },
        combo: { kind: 'combo', show: 4, desc: '形状轮流出现，数量每次加 1' },
        long: { kind: 'cycle', show: 9, desc: '找规律，补上下一张' }
    };

    /* —— 12 关题型档位（题目只会从对应集合里抽取，难度逐档递进）—— */
    const LEVEL_TYPES = {
        1: ['ab'],
        2: ['ab', 'aabb'],
        3: ['ab', 'aabb'],
        4: ['abc'],
        5: ['abc', 'grow'],
        6: ['abc', 'grow'],
        7: ['tint'],
        8: ['tint', 'mixed'],
        9: ['tint', 'mixed'],
        10: ['abcd', 'combo'],
        11: ['abcd', 'combo', 'long'],
        12: ['abcd', 'combo', 'long']
    };

    /* —— 各档位展示项数量契约：band → { showMin, showMax }，范围需覆盖档位内全部题型的 show —— */
    const BAND_SHOW = {
        1: { showMin: 4, showMax: 4 },
        2: { showMin: 3, showMax: 6 },
        3: { showMin: 4, showMax: 6 },
        4: { showMin: 4, showMax: 9 }
    };

    const state = {
        level: 1,
        questionIndex: 0,
        correct: 0,
        firstTry: true,
        locked: false,
        puzzle: null,
        questionCard: null,
        optionButtons: []
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        questionText: documentObject.getElementById('question-text'),
        hitText: documentObject.getElementById('hit-text'),
        progressTrack: documentObject.getElementById('progress-track'),
        progressFill: documentObject.getElementById('progress-fill'),
        patternRow: documentObject.getElementById('pattern-row'),
        patternDesc: documentObject.getElementById('pattern-desc'),
        feedbackText: documentObject.getElementById('feedback-text'),
        optionsGrid: documentObject.getElementById('options-grid'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
        resultText: documentObject.getElementById('result-text'),
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

    /* mulberry32 种子随机数，保证同种子题目完全可复现 */
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

    function clampLevel(level) {
        const parsed = Number.isFinite(level) ? Math.floor(level) : 1;
        return Math.min(Math.max(parsed, 1), TOTAL_LEVELS);
    }

    function bandOf(level) {
        const safe = clampLevel(level);
        if (safe <= 3) return 1;
        if (safe <= 6) return 2;
        if (safe <= 9) return 3;
        return 4;
    }

    function levelCount() {
        return TOTAL_LEVELS;
    }

    /* 每关题型档位声明（返回副本，避免外部改动影响内部表） */
    function patternTypesForLevel(level) {
        return LEVEL_TYPES[clampLevel(level)].slice();
    }

    function levelConfig(level) {
        const safe = clampLevel(level);
        const band = bandOf(safe);
        return {
            level: safe,
            band,
            puzzles: PUZZLES_PER_LEVEL,
            types: patternTypesForLevel(safe),
            showMin: BAND_SHOW[band].showMin,
            showMax: BAND_SHOW[band].showMax
        };
    }

    /* 关内第 questionIndex 题（0 起）的确定性种子 */
    function puzzleSeed(level, questionIndex) {
        return (BASE_SEED + clampLevel(level) * 7919 + questionIndex * 613) >>> 0;
    }

    function pickIndex(random, length) {
        return Math.floor(random() * length);
    }

    function pickOne(random, list) {
        return list[pickIndex(random, list.length)];
    }

    /* 不重复抽取 n 个元素 */
    function pickDistinct(random, list, n) {
        const remaining = list.slice();
        const picked = [];
        while (picked.length < n && remaining.length > 0) {
            const at = pickIndex(random, remaining.length);
            picked.push(remaining.splice(at, 1)[0]);
        }
        return picked;
    }

    function shuffleInPlace(list, random) {
        for (let i = list.length - 1; i > 0; i -= 1) {
            const j = pickIndex(random, i + 1);
            const tmp = list[i];
            list[i] = list[j];
            list[j] = tmp;
        }
    }

    /* 图案项唯一键：色调 | 形状 | 数量 */
    function tileKey(tile) {
        return `${tile.tint || 'none'}|${tile.shape}|${tile.count}`;
    }

    function tilesEqual(a, b) {
        return tileKey(a) === tileKey(b);
    }

    /* 规律求值：items 为循环节（grow 时是单元素数组），index 从 0 计。
       cycle → 循环节原样重复；grow → 数量按 start + step × index 递增；
       combo → 形状按循环节循环，数量按 countStart + countStep × index 递增 */
    function applyRule(rule, items, index) {
        const base = items[index % items.length];
        if (rule.kind === 'grow') {
            return { shape: base.shape, tint: base.tint || null, count: rule.start + rule.step * index };
        }
        if (rule.kind === 'combo') {
            return { shape: base.shape, tint: base.tint || null, count: rule.countStart + rule.countStep * index };
        }
        return { shape: base.shape, tint: base.tint || null, count: base.count };
    }

    /* 按题型构造循环节与规律对象 */
    function buildUnit(typeId, random) {
        if (typeId === 'grow') {
            return {
                unit: [{ shape: pickOne(random, POOL_FRUITS), tint: null, count: 1 }],
                rule: { kind: 'grow', start: 1, step: 1 }
            };
        }
        if (typeId === 'combo') {
            const shapes = pickDistinct(random, POOL_FRUITS, 2);
            return {
                unit: shapes.map((shape) => ({ shape, tint: null, count: 1 })),
                rule: { kind: 'combo', countStart: 1, countStep: 1 }
            };
        }
        if (typeId === 'tint') {
            const shape = pickOne(random, CSS_SHAPES);
            const tints = pickDistinct(random, TINT_KEYS, 2);
            return {
                unit: tints.map((tint) => ({ shape, tint, count: 1 })),
                rule: { kind: 'cycle' }
            };
        }
        if (typeId === 'aabb') {
            const shapes = pickDistinct(random, POOL_ANIMALS, 2);
            return {
                unit: [
                    { shape: shapes[0], tint: null, count: 1 },
                    { shape: shapes[0], tint: null, count: 1 },
                    { shape: shapes[1], tint: null, count: 1 },
                    { shape: shapes[1], tint: null, count: 1 }
                ],
                rule: { kind: 'cycle' }
            };
        }
        if (typeId === 'mixed') {
            const shapes = pickDistinct(random, POOL_ANIMALS, 2);
            return {
                unit: [
                    { shape: shapes[0], tint: null, count: 1 },
                    { shape: shapes[1], tint: null, count: 2 }
                ],
                rule: { kind: 'cycle' }
            };
        }
        /* 剩余题型：ab / abc / abcd / long */
        const pool = typeId === 'abc' || typeId === 'long' ? POOL_FRUITS : pickOne(random, [POOL_ANIMALS, POOL_FRUITS]);
        const period = typeId === 'abc' ? 3 : typeId === 'abcd' ? 4 : typeId === 'long' ? 3 : 2;
        const shapes = pickDistinct(random, pool, period);
        return {
            unit: shapes.map((shape) => ({ shape, tint: null, count: 1 })),
            rule: { kind: 'cycle' }
        };
    }

    function resolveShow(show, random) {
        if (Array.isArray(show)) {
            return show[0] + pickIndex(random, show[1] - show[0] + 1);
        }
        return show;
    }

    /* 选项生成：正确项 + 3 个干扰项。
       干扰项策略：同形状不同数量 / 同数量不同形状（或同形状不同色调）/ 序列外元素；
       全程按 key 去重，保证彼此互异且都不等于正确项 */
    function generateOptions(answer, rule, seed) {
        const random = createSeededRandom(seed >>> 0);
        const seen = Object.create(null);
        seen[tileKey(answer)] = true;
        const picked = [];
        const tryPush = (tile) => {
            const key = tileKey(tile);
            if (seen[key]) return;
            seen[key] = true;
            picked.push(tile);
        };

        const sameShapeDiff = [];
        const sameCountDiff = [];
        const outside = [];
        if (answer.tint) {
            for (const tint of TINT_KEYS) {
                if (tint === answer.tint) continue;
                sameShapeDiff.push({ shape: answer.shape, tint, count: 1 });
            }
            for (const shape of CSS_SHAPES) {
                if (shape === answer.shape) continue;
                sameCountDiff.push({ shape, tint: answer.tint, count: 1 });
                for (const tint of TINT_KEYS) {
                    outside.push({ shape, tint, count: 1 });
                }
            }
        } else {
            const pool = findPool(answer.shape) || POOL_ANIMALS;
            const other = pool === POOL_ANIMALS ? POOL_FRUITS : POOL_ANIMALS;
            for (const delta of [-2, -1, 1, 2]) {
                const count = answer.count + delta;
                if (count >= 1) sameShapeDiff.push({ shape: answer.shape, tint: null, count });
            }
            for (const shape of pool) {
                if (shape === answer.shape) continue;
                sameCountDiff.push({ shape, tint: null, count: answer.count });
            }
            for (const shape of other) {
                outside.push({ shape, tint: null, count: Math.max(1, answer.count - 1) });
                outside.push({ shape, tint: null, count: answer.count + 1 });
            }
        }

        const buckets = [sameShapeDiff, sameCountDiff, outside];
        for (const bucket of buckets) {
            shuffleInPlace(bucket, random);
            if (bucket.length > 0) tryPush(bucket[0]);
        }
        for (const bucket of buckets) {
            for (const tile of bucket) {
                if (picked.length >= 3) break;
                tryPush(tile);
            }
        }
        /* 防御兜底：极小概率候选不足时从全素材库补齐（正常路径不会走到） */
        if (picked.length < 3) {
            for (const pool of [POOL_ANIMALS, POOL_FRUITS]) {
                for (const shape of pool) {
                    for (let count = 1; count <= 5 && picked.length < 3; count += 1) {
                        tryPush({ shape, tint: null, count });
                    }
                }
            }
        }
        const options = [{ shape: answer.shape, tint: answer.tint || null, count: answer.count }, ...picked];
        shuffleInPlace(options, random);
        return options;
    }

    function findPool(shape) {
        if (POOL_ANIMALS.indexOf(shape) >= 0) return POOL_ANIMALS;
        if (POOL_FRUITS.indexOf(shape) >= 0) return POOL_FRUITS;
        return null;
    }

    /* 生成一道题目：同 (level, seed) 完全可复现，answer 严格由 applyRule 推导 */
    function generatePuzzle(level, seed) {
        const safeLevel = clampLevel(level);
        const random = createSeededRandom(seed >>> 0);
        const typeId = pickOne(random, patternTypesForLevel(safeLevel));
        const spec = PATTERN_TYPES[typeId];
        const built = buildUnit(typeId, random);
        const show = resolveShow(spec.show, random);
        const sequence = [];
        for (let index = 0; index < show; index += 1) {
            sequence.push(applyRule(built.rule, built.unit, index));
        }
        const answer = applyRule(built.rule, built.unit, show);
        const options = generateOptions(answer, built.rule, (seed >>> 0) + 40503);
        return {
            level: safeLevel,
            type: typeId,
            kind: spec.kind,
            rule: built.rule,
            unit: built.unit,
            sequence,
            answer,
            options,
            patternDesc: spec.desc
        };
    }

    /* 星级：首次作答全部答对 3 星，正确率不低于三分之二 2 星，其余 1 星 */
    function starRating(correct, total) {
        if (!(total > 0)) return 1;
        const safe = Math.min(Math.max(correct, 0), total);
        if (safe === total) return 3;
        if (safe * 3 >= total * 2) return 2;
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

    function describeTile(tile) {
        if (tile.tint) {
            return `${TINT_LABELS[tile.tint] || tile.tint}${SHAPE_LABELS[tile.shape] || tile.shape}`;
        }
        return tile.count > 1 ? `${tile.shape} × ${tile.count}` : tile.shape;
    }

    /* 往容器里填图案内容：有色调用纯 CSS 图形，否则渲染 emoji（数量为重复个数） */
    function fillTileContent(container, tile) {
        if (tile.tint) {
            const shapeEl = documentObject.createElement('span');
            shapeEl.className = `css-shape shape-${tile.shape} tint-${tile.tint}`;
            container.appendChild(shapeEl);
            return;
        }
        const emojiSpan = documentObject.createElement('span');
        if (tile.count >= 6) {
            emojiSpan.className = 'emoji-cluster emoji-xs';
        } else if (tile.count >= 4) {
            emojiSpan.className = 'emoji-cluster emoji-sm';
        } else {
            emojiSpan.className = 'emoji-cluster';
        }
        emojiSpan.textContent = tile.shape.repeat(tile.count);
        container.appendChild(emojiSpan);
    }

    function buildTileCard(tile, extraClass, label) {
        const card = documentObject.createElement('div');
        card.className = extraClass ? `tile-card ${extraClass}` : 'tile-card';
        if (label) {
            card.setAttribute('aria-label', label);
        }
        fillTileContent(card, tile);
        return card;
    }

    function setFeedback(text, tone) {
        elements.feedbackText.textContent = text;
        elements.feedbackText.className = tone ? `feedback-text tone-${tone}` : 'feedback-text';
    }

    function updateProgress() {
        elements.questionText.textContent = `第 ${state.questionIndex + 1} / ${PUZZLES_PER_LEVEL} 题`;
        elements.hitText.textContent = `首答答对 ${state.correct}`;
        elements.progressFill.style.width = `${(state.questionIndex / PUZZLES_PER_LEVEL) * 100}%`;
        elements.progressTrack.setAttribute('aria-valuemin', '0');
        elements.progressTrack.setAttribute('aria-valuemax', String(PUZZLES_PER_LEVEL));
        elements.progressTrack.setAttribute('aria-valuenow', String(state.questionIndex));
    }

    function renderOptions() {
        const fragment = documentObject.createDocumentFragment();
        state.optionButtons = [];
        state.puzzle.options.forEach((tile, index) => {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'option-card';
            button.dataset.index = String(index);
            button.setAttribute('aria-label', `备选 ${index + 1}：${describeTile(tile)}`);
            fillTileContent(button, tile);
            button.addEventListener('click', () => handleOptionTap(index));
            fragment.appendChild(button);
            state.optionButtons.push(button);
        });
        elements.optionsGrid.replaceChildren(fragment);
    }

    function renderPuzzle() {
        const puzzle = state.puzzle;
        elements.levelText.textContent = `第 ${state.level} 关`;

        const fragment = documentObject.createDocumentFragment();
        for (const tile of puzzle.sequence) {
            fragment.appendChild(buildTileCard(tile, '', describeTile(tile)));
        }
        const questionCard = documentObject.createElement('div');
        questionCard.className = 'tile-card is-question';
        questionCard.setAttribute('aria-label', '问号卡：想一想下一张是什么？');
        const mark = documentObject.createElement('span');
        mark.className = 'question-mark';
        mark.textContent = '?';
        questionCard.appendChild(mark);
        fragment.appendChild(questionCard);
        elements.patternRow.replaceChildren(fragment);
        state.questionCard = questionCard;

        elements.patternDesc.textContent = `规律提示：${puzzle.patternDesc}`;
        setFeedback('想一想，「?」处应该放哪一张？', '');
        renderOptions();
        updateProgress();
    }

    function loadQuestion() {
        state.puzzle = generatePuzzle(state.level, puzzleSeed(state.level, state.questionIndex));
        renderPuzzle();
    }

    function handleOptionTap(index) {
        if (state.locked) return;
        const tile = state.puzzle.options[index];
        const button = state.optionButtons[index];
        if (!tile || !button) return;
        if (tilesEqual(tile, state.puzzle.answer)) {
            const wasFirst = state.firstTry;
            state.firstTry = false;
            if (wasFirst) {
                state.correct += 1;
            }
            state.locked = true;
            for (const other of state.optionButtons) {
                other.disabled = true;
            }
            button.classList.add('is-correct');
            revealAnswer();
            setFeedback(wasFirst ? '答对啦，一次就找对了！' : '答对啦！', 'good');
            updateProgress();
            setTimeout(advanceQuestion, 950);
        } else {
            state.firstTry = false;
            button.disabled = true;
            button.classList.add('is-wrong');
            setFeedback('不对哦，再想想其他卡片～', 'bad');
        }
    }

    /* 答对后把「?」卡揭示为正确图案 */
    function revealAnswer() {
        const card = state.questionCard;
        if (!card) return;
        card.className = 'tile-card is-revealed';
        card.setAttribute('aria-label', `答案是${describeTile(state.puzzle.answer)}`);
        card.replaceChildren();
        fillTileContent(card, state.puzzle.answer);
    }

    function advanceQuestion() {
        if (state.questionIndex + 1 >= PUZZLES_PER_LEVEL) {
            showWinModal();
            return;
        }
        state.questionIndex += 1;
        state.firstTry = true;
        state.locked = false;
        loadQuestion();
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
        const stars = starRating(state.correct, PUZZLES_PER_LEVEL);
        saveStars(state.level, stars);
        saveUnlockedLevel(state.level + 1);
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
        elements.resultText.textContent = `首次答对 ${state.correct} / ${PUZZLES_PER_LEVEL} 题`;
        elements.nextBtn.hidden = state.level >= TOTAL_LEVELS;
        elements.winModal.hidden = false;
        updateProgress();
    }

    function renderLevelPicker() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
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
        state.level = clampLevel(level);
        state.questionIndex = 0;
        state.correct = 0;
        state.firstTry = true;
        state.locked = false;
        elements.winModal.hidden = true;
        elements.levelModal.hidden = true;
        loadQuestion();
    }

    elements.restartBtn.addEventListener('click', () => startLevel(state.level));
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelPicker();
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });
    elements.replayBtn.addEventListener('click', () => startLevel(state.level));
    elements.nextBtn.addEventListener('click', () => startLevel(state.level + 1));

    windowObject.PatternApi = {
        SLUG,
        BASE_SEED,
        PUZZLES_PER_LEVEL,
        TOTAL_LEVELS,
        PATTERN_TYPES,
        createSeededRandom,
        bandOf,
        levelCount,
        levelConfig,
        patternTypesForLevel,
        puzzleSeed,
        applyRule,
        generatePuzzle,
        generateOptions,
        tileKey,
        tilesEqual,
        starRating,
        loadUnlockedLevel,
        saveUnlockedLevel,
        loadStars,
        saveStars
    };

    /* 进入游戏：优先落到最新解锁关，无存档则从第 1 关开始 */
    startLevel(loadUnlockedLevel());
})(window, document);
