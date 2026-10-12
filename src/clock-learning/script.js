(function setupClockLearning(windowObject, documentObject) {
    'use strict';

    const SLUG = 'clock-learning';
    const UNLOCK_KEY = 'clock-learning-unlocked-level';
    const STARS_KEY_PREFIX = 'clock-learning-stars-';
    const BASE_SEED = 20261010;
    const QUESTIONS_PER_LEVEL = 8;
    const LEVEL_COUNT = 12;
    /* 五分钟档的合法分钟值：整点与半点已由前八关覆盖，此处刻意排除 0 和 30 */
    const FIVE_MINUTE_VALUES = [5, 10, 15, 20, 25, 35, 40, 45, 50, 55];
    /* 拨针校验容差（角度）：整点档时针±15°；半点档时针±15°/分针±9°；五分钟档时针±20°/分针±9°。
       整点档分针规格未单独约定，取 ±15°（五分钟步进下等价于必须指在 12 点）；
       半点档时针刻意取满 ±15°：半点目标时针角为 h*30+15，而按钮步长恒 30°，
       可达时针角全为 30° 的倍数，与目标最短恒差 15°，容差一旦小于 15°，
       纯按钮路径永远无法达标（拖拽不受影响），故按“指在两个数字正中间附近也算对”的低龄口径放宽 */
    const DIAL_TOLERANCES = {
        1: { hour: 15, minute: 15 },
        2: { hour: 15, minute: 9 },
        3: { hour: 20, minute: 9 }
    };
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const memoryFallback = {};

    const state = {
        level: 1,
        questionIndex: 0,
        question: null,
        firstTryCorrect: 0,
        attempted: false,
        answered: false,
        wrongAttempts: 0,
        optionButtons: [],
        dragHand: '',
        dialHourAngle: 0,
        dialMinuteAngle: 0
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        progressText: documentObject.getElementById('progress-text'),
        correctText: documentObject.getElementById('correct-text'),
        modeChip: documentObject.getElementById('mode-chip'),
        questionPrompt: documentObject.getElementById('question-prompt'),
        feedbackText: documentObject.getElementById('feedback-text'),
        clockSvg: documentObject.getElementById('clock-svg'),
        clockTicks: documentObject.getElementById('clock-ticks'),
        clockNumbers: documentObject.getElementById('clock-numbers'),
        hourHand: documentObject.getElementById('hour-hand'),
        minuteHand: documentObject.getElementById('minute-hand'),
        optionsGrid: documentObject.getElementById('options-grid'),
        dialPanel: documentObject.getElementById('dial-panel'),
        hourMinus: documentObject.getElementById('hour-minus'),
        hourPlus: documentObject.getElementById('hour-plus'),
        minuteMinus: documentObject.getElementById('minute-minus'),
        minutePlus: documentObject.getElementById('minute-plus'),
        confirmBtn: documentObject.getElementById('confirm-btn'),
        answerBurst: documentObject.getElementById('answer-burst'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
        resultCorrect: documentObject.getElementById('result-correct'),
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

    /* 任意角度归一化到 [0, 360) */
    function wrap360(angle) {
        return ((angle % 360) + 360) % 360;
    }

    /* 两个钟面角的最短弧长差，范围 [0, 180] */
    function angleDiff(angleA, angleB) {
        const diff = Math.abs(angleA - angleB) % 360;
        return diff > 180 ? 360 - diff : diff;
    }

    function levelCount() {
        return LEVEL_COUNT;
    }

    /* 关卡档位：1-4 关整点、5-8 关半点、9-12 关五分钟刻度；
       每档前两关时针范围 1~6，后两关放宽到 1~12 形成档内递进 */
    function levelConfig(level) {
        const tier = level <= 4 ? 1 : level <= 8 ? 2 : 3;
        const hourMax = level % 4 === 3 || level % 4 === 0 ? 12 : 6;
        const minuteValues = tier === 1 ? [0] : tier === 2 ? [30] : FIVE_MINUTE_VALUES;
        return { tier, hourMin: 1, hourMax, minuteValues };
    }

    /* 题目种子 = 基础种子 + 关卡/题号各自乘奇数：奇偶随题号交替，从而实现认/拨题型交替 */
    function questionSeed(level, index) {
        return (BASE_SEED + level * 4099 + index * 101) >>> 0;
    }

    /* 时刻转钟面角：12 点按 0° 计；时针角度叠加分钟带来的偏移（每分钟 0.5°） */
    function angleFromTime(hour12, minute) {
        const hour = ((hour12 % 12) + 12) % 12;
        return {
            hourAngle: wrap360(hour * 30 + minute * 0.5),
            minuteAngle: wrap360(minute * 6)
        };
    }

    /* 钟面角还原时刻（就近取整）：分针角先吸附到最近的 5 分钟刻度（游戏时间均为 5 的倍数），
       再从时针角里扣除分钟偏移后取整小时；0 点位按 12 小时制返回 12
       （如 12:00 的时针角 0° 还原为 12、时针 357.5° + 分针 345° 归到 12:00，精确 11:55 仍还原 11:55） */
    function timeFromAngles(hourAngle, minuteAngle) {
        const minute = (Math.round(wrap360(minuteAngle) / 30) * 5) % 60;
        const base = wrap360(wrap360(hourAngle) - minute * 0.5);
        const hourIndex = Math.round(base / 30) % 12;
        return { hour12: hourIndex === 0 ? 12 : hourIndex, minute };
    }

    function formatTime(hour, minute) {
        return `${hour}:${String(minute).padStart(2, '0')}`;
    }

    /* 构造 4 个互异选项：含正确答案，干扰项均取同档位合法时间（同分钟值域、时针在关内范围） */
    function buildOptions(hour, minute, config, random) {
        const labels = new Set([formatTime(hour, minute)]);
        while (labels.size < 4) {
            const candidateHour = config.hourMin + Math.floor(random() * (config.hourMax - config.hourMin + 1));
            const candidateMinute = config.minuteValues[Math.floor(random() * config.minuteValues.length)];
            labels.add(formatTime(candidateHour, candidateMinute));
        }
        const options = Array.from(labels);
        /* Fisher-Yates 洗牌，保证正确项出现位置随机 */
        for (let i = options.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            const tmp = options[i];
            options[i] = options[j];
            options[j] = tmp;
        }
        return options;
    }

    /* 生成单题：题型由种子奇偶决定（调用方按题号构种子 → 每关认/拨交替各半） */
    function generateQuestion(level, seed) {
        const config = levelConfig(level);
        const random = createSeededRandom(seed);
        const type = seed % 2 === 0 ? 'read' : 'dial';
        const hour = config.hourMin + Math.floor(random() * (config.hourMax - config.hourMin + 1));
        const minute = config.minuteValues[Math.floor(random() * config.minuteValues.length)];
        const options = buildOptions(hour, minute, config, random);
        return { type, hour, minute, options };
    }

    /* 拨针校验（角度口径）：确认按钮直接用拖拽的原始角度调用，容差真实生效 */
    function validateDialAngles(hourAngle, minuteAngle, target, level) {
        const tolerance = DIAL_TOLERANCES[levelConfig(level).tier];
        const targetAngles = angleFromTime(target.hour, target.minute);
        return angleDiff(hourAngle, targetAngles.hourAngle) <= tolerance.hour
            && angleDiff(minuteAngle, targetAngles.minuteAngle) <= tolerance.minute;
    }

    /* 拨针校验（时刻口径）：供纯函数调用与测试，内部委托同一容差实现 */
    function validateDial(hour, minute, target, level) {
        const angles = angleFromTime(hour, minute);
        return validateDialAngles(angles.hourAngle, angles.minuteAngle, target, level);
    }

    /* 星级：8 题全对 3 星，首答正确 ≥75% 得 2 星，其余 1 星 */
    function starRating(correct, total) {
        if (correct >= total) return 3;
        if (correct >= Math.ceil(total * 0.75)) return 2;
        return 1;
    }

    function loadUnlockedLevel() {
        const parsed = Number.parseInt(safeGetItem(UNLOCK_KEY) || '', 10);
        return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, LEVEL_COUNT) : 1;
    }

    function saveUnlockedLevel(level) {
        if (level > loadUnlockedLevel()) {
            safeSetItem(UNLOCK_KEY, String(level));
        }
    }

    function loadStars(level) {
        const parsed = Number.parseInt(safeGetItem(STARS_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }

    function saveStars(level, stars) {
        if (stars > loadStars(level)) {
            safeSetItem(STARS_KEY_PREFIX + level, String(stars));
        }
    }

    /* 用 SVG transform 属性旋转指针组，rotate 围绕钟心 (100, 100) */
    function setHand(hand, angle) {
        hand.setAttribute('transform', `rotate(${angle} 100 100)`);
    }

    function setHandToTime(hour, minute) {
        const angles = angleFromTime(hour, minute);
        setHand(elements.hourHand, angles.hourAngle);
        setHand(elements.minuteHand, angles.minuteAngle);
    }

    function applyDialHands() {
        setHand(elements.hourHand, state.dialHourAngle);
        setHand(elements.minuteHand, state.dialMinuteAngle);
    }

    /* 拨针初始时刻设为把正确答案整体错开（时针 +1 小时、分针 +30 分钟），避免开局即命中 */
    function setDialTime(hour, minute) {
        const angles = angleFromTime(hour, minute);
        state.dialHourAngle = angles.hourAngle;
        state.dialMinuteAngle = angles.minuteAngle;
        applyDialHands();
    }

    function updateHeader() {
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.progressText.textContent = `${Math.min(state.questionIndex + 1, QUESTIONS_PER_LEVEL)} / ${QUESTIONS_PER_LEVEL}`;
        elements.correctText.textContent = `${state.firstTryCorrect} 题`;
    }

    /* 生成钟面刻度（60 根，每 5 格一根主刻度）与 1~12 数字 */
    function buildClockFace() {
        const ticksFragment = documentObject.createDocumentFragment();
        for (let i = 0; i < 60; i += 1) {
            const major = i % 5 === 0;
            const angle = i * 6 * Math.PI / 180;
            const innerRadius = major ? 82 : 87.5;
            const line = documentObject.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', String(100 + innerRadius * Math.sin(angle)));
            line.setAttribute('y1', String(100 - innerRadius * Math.cos(angle)));
            line.setAttribute('x2', String(100 + 92 * Math.sin(angle)));
            line.setAttribute('y2', String(100 - 92 * Math.cos(angle)));
            line.setAttribute('class', major ? 'tick-major' : 'tick-minor');
            ticksFragment.appendChild(line);
        }
        elements.clockTicks.replaceChildren(ticksFragment);

        const numbersFragment = documentObject.createDocumentFragment();
        for (let n = 1; n <= 12; n += 1) {
            const angle = n * 30 * Math.PI / 180;
            const text = documentObject.createElementNS(SVG_NS, 'text');
            text.setAttribute('x', String(100 + 68 * Math.sin(angle)));
            text.setAttribute('y', String(100 - 68 * Math.cos(angle)));
            text.setAttribute('dy', '0.35em');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'clock-number');
            text.textContent = String(n);
            numbersFragment.appendChild(text);
        }
        elements.clockNumbers.replaceChildren(numbersFragment);
    }

    function renderOptions(question) {
        const fragment = documentObject.createDocumentFragment();
        const buttons = [];
        for (const label of question.options) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'option-btn';
            button.textContent = label;
            button.addEventListener('click', () => handleOptionPick(button, label));
            buttons.push(button);
            fragment.appendChild(button);
        }
        elements.optionsGrid.replaceChildren(fragment);
        state.optionButtons = buttons;
    }

    function playBurst() {
        elements.answerBurst.classList.remove('is-show');
        /* 强制回流，保证连续两题答对时动画都能重新播放 */
        void elements.answerBurst.offsetWidth;
        elements.answerBurst.classList.add('is-show');
    }

    /* 统一结算：首次作答结果计入星级；答对后延时进入下一题 */
    function settleAnswer(correct) {
        if (state.answered) return;
        if (!state.attempted) {
            state.attempted = true;
            if (correct) state.firstTryCorrect += 1;
        }
        if (!correct) {
            state.wrongAttempts += 1;
            /* 递进提示：半点拨针题第 2 次答错起追加一句点拨，避免孩子反复把时针
               对齐到整点数字却始终判负而不知道原因 */
            let message = '再试一次，你可以的！';
            if (state.question && state.question.type === 'dial'
                && state.question.minute === 30 && state.wrongAttempts >= 2) {
                message += '半点的时候，时针要指在两个数字的正中间哦';
            }
            elements.feedbackText.textContent = message;
            elements.feedbackText.classList.remove('is-success');
            updateHeader();
            return;
        }
        state.answered = true;
        elements.feedbackText.textContent = '答对啦，真棒！';
        elements.feedbackText.classList.add('is-success');
        for (const button of state.optionButtons) {
            button.disabled = true;
        }
        playBurst();
        updateHeader();
        setTimeout(showNextQuestion, 950);
    }

    function handleOptionPick(button, label) {
        if (!state.question || state.question.type !== 'read' || state.answered) return;
        const parts = label.split(':');
        const correct = Number(parts[0]) === state.question.hour && Number(parts[1]) === state.question.minute;
        if (!correct) {
            button.classList.add('is-wrong');
            setTimeout(() => button.classList.remove('is-wrong'), 480);
        }
        settleAnswer(correct);
    }

    function adjustDial(hourSteps, minuteSteps) {
        if (!state.question || state.question.type !== 'dial' || state.answered) return;
        /* 微调步长：时针 ±1 小时 = 30°，分针 ±5 分钟 = 30° */
        state.dialHourAngle = wrap360(state.dialHourAngle + hourSteps * 30);
        state.dialMinuteAngle = wrap360(state.dialMinuteAngle + minuteSteps * 30);
        elements.feedbackText.textContent = '';
        applyDialHands();
    }

    function handleConfirm() {
        if (!state.question || state.question.type !== 'dial' || state.answered) return;
        const question = state.question;
        const target = { hour: question.hour, minute: question.minute };
        const correct = validateDialAngles(state.dialHourAngle, state.dialMinuteAngle, target, state.level);
        if (!correct) {
            elements.dialPanel.classList.add('is-wrong');
            setTimeout(() => elements.dialPanel.classList.remove('is-wrong'), 480);
        }
        settleAnswer(correct);
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

    function finishLevel() {
        const stars = starRating(state.firstTryCorrect, QUESTIONS_PER_LEVEL);
        saveStars(state.level, stars);
        saveUnlockedLevel(Math.min(state.level + 1, levelCount()));
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
        elements.resultCorrect.textContent = `${state.firstTryCorrect} / ${QUESTIONS_PER_LEVEL}`;
        elements.nextBtn.hidden = state.level >= levelCount();
        elements.winModal.hidden = false;
        updateHeader();
    }

    function showNextQuestion() {
        state.questionIndex += 1;
        if (state.questionIndex >= QUESTIONS_PER_LEVEL) {
            finishLevel();
        } else {
            showQuestion();
        }
    }

    function showQuestion() {
        const seed = questionSeed(state.level, state.questionIndex);
        const question = generateQuestion(state.level, seed);
        state.question = question;
        state.attempted = false;
        state.answered = false;
        state.wrongAttempts = 0;
        state.optionButtons = [];
        elements.feedbackText.textContent = '';
        elements.feedbackText.classList.remove('is-success');
        elements.modeChip.textContent = question.type === 'read' ? '认时间' : '拨时间';
        elements.modeChip.classList.toggle('is-dial', question.type === 'dial');
        elements.clockSvg.classList.toggle('is-dial', question.type === 'dial');
        if (question.type === 'read') {
            elements.questionPrompt.textContent = '仔细看钟面，现在是几点？';
            elements.optionsGrid.hidden = false;
            elements.dialPanel.hidden = true;
            renderOptions(question);
            setHandToTime(question.hour, question.minute);
        } else {
            elements.questionPrompt.textContent = `请拨出 ${formatTime(question.hour, question.minute)}`;
            elements.optionsGrid.hidden = true;
            elements.dialPanel.hidden = false;
            setDialTime(question.hour % 12 + 1, (question.minute + 30) % 60);
        }
        updateHeader();
    }

    function startLevel(level) {
        state.level = Math.min(Math.max(1, level), levelCount());
        state.questionIndex = 0;
        state.firstTryCorrect = 0;
        elements.winModal.hidden = true;
        elements.levelModal.hidden = true;
        showQuestion();
    }

    function renderLevelPicker() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= levelCount(); level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'level-item';
            const name = documentObject.createElement('strong');
            name.textContent = String(level);
            const stars = documentObject.createElement('span');
            if (level > unlocked) {
                button.disabled = true;
                button.classList.add('is-locked');
                stars.textContent = '未解锁';
            } else {
                const earned = loadStars(level);
                stars.textContent = earned > 0 ? '★'.repeat(earned) + '☆'.repeat(3 - earned) : '☆☆☆';
            }
            if (level === state.level) {
                button.classList.add('is-current');
            }
            button.addEventListener('click', () => {
                elements.levelModal.hidden = true;
                startLevel(level);
            });
            button.appendChild(name);
            button.appendChild(stars);
            fragment.appendChild(button);
        }
        elements.levelGrid.replaceChildren(fragment);
    }

    /* ---------- 拖拽拨针：Pointer Events + atan2 角度换算 ---------- */

    function dialActive() {
        return Boolean(state.question) && state.question.type === 'dial' && !state.answered;
    }

    /* 指针位置换算为钟面角：atan2(dx, -dy) 以 12 点方向为 0°，radiusRatio 为相对钟面半径的比例 */
    function pointerMetrics(event) {
        const rect = elements.clockSvg.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        return {
            angle: wrap360(Math.atan2(dx, -dy) * 180 / Math.PI),
            radiusRatio: Math.hypot(dx, dy) / (rect.width / 2 || 1)
        };
    }

    /* 选针规则：靠近钟心（半径 < 34%）抓时针；否则抓与当前角度更接近的那根（角距相同优先分针） */
    function handlePointerDown(event) {
        if (!dialActive()) return;
        const metrics = pointerMetrics(event);
        let hand = 'minute';
        if (metrics.radiusRatio < 0.34) {
            hand = 'hour';
        } else {
            const hourDist = angleDiff(metrics.angle, state.dialHourAngle);
            const minuteDist = angleDiff(metrics.angle, state.dialMinuteAngle);
            hand = hourDist < minuteDist ? 'hour' : 'minute';
        }
        state.dragHand = hand;
        elements.feedbackText.textContent = '';
        try {
            elements.clockSvg.setPointerCapture(event.pointerId);
        } catch (_) {
            /* 部分环境不支持指针捕获，忽略后仍可靠全局 move 事件拖拽 */
        }
        event.preventDefault();
    }

    function handlePointerMove(event) {
        if (!state.dragHand || !dialActive()) return;
        const metrics = pointerMetrics(event);
        if (state.dragHand === 'hour') {
            state.dialHourAngle = metrics.angle;
        } else {
            state.dialMinuteAngle = metrics.angle;
        }
        applyDialHands();
        event.preventDefault();
    }

    function handlePointerUp() {
        state.dragHand = '';
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
    elements.hourMinus.addEventListener('click', () => adjustDial(-1, 0));
    elements.hourPlus.addEventListener('click', () => adjustDial(1, 0));
    elements.minuteMinus.addEventListener('click', () => adjustDial(0, -1));
    elements.minutePlus.addEventListener('click', () => adjustDial(0, 1));
    elements.confirmBtn.addEventListener('click', handleConfirm);
    elements.clockSvg.addEventListener('pointerdown', handlePointerDown);
    windowObject.addEventListener('pointermove', handlePointerMove);
    windowObject.addEventListener('pointerup', handlePointerUp);
    windowObject.addEventListener('pointercancel', handlePointerUp);

    windowObject.ClockApi = {
        SLUG,
        QUESTIONS_PER_LEVEL,
        LEVEL_COUNT,
        FIVE_MINUTE_VALUES,
        DIAL_TOLERANCES,
        createSeededRandom,
        wrap360,
        angleDiff,
        levelCount,
        levelConfig,
        questionSeed,
        angleFromTime,
        timeFromAngles,
        formatTime,
        generateQuestion,
        validateDialAngles,
        validateDial,
        starRating,
        loadUnlockedLevel,
        saveUnlockedLevel,
        loadStars,
        saveStars
    };

    buildClockFace();
    startLevel(loadUnlockedLevel());
})(window, document);
