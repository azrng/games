// @ts-check
(function setupIdiomGuess(windowObject, documentObject) {
    'use strict';

    const SLUG = 'idiom-guess';
    const STATS_KEY = 'idiom-stats';
    const MAX_ATTEMPTS = 9;
    const HINTS_PER_ROUND = 2;
    const memoryFallback = {};

    /* 题库缺失/损坏时的保底题库（常态下由 idiom-bank.js 提供 1000 条） */
    const FALLBACK_BANK = [
        { w: '一心一意', p: ['yī', 'xīn', 'yī', 'yì'], e: '只有一个心眼儿，没有别的考虑。', s: '' },
        { w: '十全十美', p: ['shí', 'quán', 'shí', 'měi'], e: '各方面都非常完美，毫无缺陷。', s: '' },
        { w: '万象更新', p: ['wàn', 'xiàng', 'gēng', 'xīn'], e: '一切事物都改换了样子，出现了一番新气象。', s: '' },
        { w: '三心二意', p: ['sān', 'xīn', 'èr', 'yì'], e: '犹豫不决或意志不坚定。', s: '' },
        { w: '不约而同', p: ['bù', 'yuē', 'ér', 'tóng'], e: '事先没有商量，彼此的意见或行动却完全一致。', s: '' },
        { w: '不可思议', p: ['bù', 'kě', 'sī', 'yì'], e: '不可想象，不能理解。', s: '' },
        { w: '东张西望', p: ['dōng', 'zhāng', 'xī', 'wàng'], e: '向四处张望，形容心神不安地到处看。', s: '' },
        { w: '举世闻名', p: ['jǔ', 'shì', 'wén', 'míng'], e: '全世界都有名。', s: '' },
        { w: '亡羊补牢', p: ['wáng', 'yáng', 'bǔ', 'láo'], e: '羊丢失后再修补羊圈，比喻出了问题以后想办法补救。', s: '' },
        { w: '井底之蛙', p: ['jǐng', 'dǐ', 'zhī', 'wā'], e: '比喻见识短浅的人。', s: '' },
        { w: '画蛇添足', p: ['huà', 'shé', 'tiān', 'zú'], e: '蛇画好了又添上脚，比喻做多余的事反而坏事。', s: '' },
        { w: '守株待兔', p: ['shǒu', 'zhū', 'dài', 'tù'], e: '比喻死守经验不知变通，妄想不劳而获。', s: '' },
        { w: '掩耳盗铃', p: ['yǎn', 'ěr', 'dào', 'líng'], e: '捂住耳朵偷铃铛，比喻自己欺骗自己。', s: '' },
        { w: '杯弓蛇影', p: ['bēi', 'gōng', 'shé', 'yǐng'], e: '把酒杯里的弓影当成蛇，比喻疑神疑鬼自相惊扰。', s: '' },
        { w: '水滴石穿', p: ['shuǐ', 'dī', 'shí', 'chuān'], e: '水不停滴石头能滴穿，比喻坚持不懈终有成效。', s: '' },
        { w: '百发百中', p: ['bǎi', 'fā', 'bǎi', 'zhòng'], e: '每次都命中目标，形容射箭或射击非常准。', s: '' },
        { w: '目瞪口呆', p: ['mù', 'dèng', 'kǒu', 'dāi'], e: '瞪着眼睛说不出话，形容受惊而愣住的样子。', s: '' },
        { w: '破釜沉舟', p: ['pò', 'fǔ', 'chén', 'zhōu'], e: '砸锅沉船，比喻下定决心不留退路。', s: '' },
        { w: '胸有成竹', p: ['xiōng', 'yǒu', 'chéng', 'zhú'], e: '画竹前心中已有竹的形象，比喻做事之前已有主张。', s: '' },
        { w: '自相矛盾', p: ['zì', 'xiāng', 'máo', 'dùn'], e: '比喻言行前后抵触。', s: '' },
        { w: '叶公好龙', p: ['yè', 'gōng', 'hào', 'lóng'], e: '比喻口头上说爱好某事物，实际并不真爱好。', s: '' },
        { w: '对牛弹琴', p: ['duì', 'niú', 'tán', 'qín'], e: '比喻对不懂道理的人讲道理，白费口舌。', s: '' },
        { w: '愚公移山', p: ['yú', 'gōng', 'yí', 'shān'], e: '下定决心不怕困难，坚持不懈就一定能成功。', s: '' },
        { w: '惊弓之鸟', p: ['jīng', 'gōng', 'zhī', 'niǎo'], e: '被弓箭吓怕了的鸟，比喻受过惊吓遇事惶恐的人。', s: '' },
        { w: '雪中送炭', p: ['xuě', 'zhōng', 'sòng', 'tàn'], e: '下雪天送炭取暖，比喻在别人急需时给以帮助。', s: '' },
        { w: '鹤立鸡群', p: ['hè', 'lì', 'jī', 'qún'], e: '像鹤站在鸡群中，比喻才能或仪表十分出众。', s: '' },
        { w: '画龙点睛', p: ['huà', 'lóng', 'diǎn', 'jīng'], e: '比喻写文章或讲话在关键处点明要旨使之生动。', s: '' },
        { w: '刻舟求剑', p: ['kè', 'zhōu', 'qiú', 'jiàn'], e: '比喻拘泥固执，不懂随着情势变化处理问题。', s: '' },
        { w: '望梅止渴', p: ['wàng', 'méi', 'zhǐ', 'kě'], e: '想到梅子生津止渴，比喻用空想安慰自己。', s: '' },
        { w: '塞翁失马', p: ['sài', 'wēng', 'shī', 'mǎ'], e: '比喻坏事在一定条件下可以变成好事。', s: '' }
    ];

    /* ---------- 纯函数（导出供 smoke 断言） ---------- */

    /** 输入清洗：只保留汉字并截前 4 个；不足 4 个汉字 ok=false */
    function normalizeInput(text) {
        const chars = String(text || '').match(/[\u4e00-\u9fa5]/g) || [];
        return { chars: chars.slice(0, 4), ok: chars.length >= 4 };
    }

    /** 标准 Wordle 两遍扫描判定：先定绿并统计答案剩余字频，再派橙 */
    function judge(guess, answer) {
        const result = ['gray', 'gray', 'gray', 'gray'];
        const remain = {};
        for (let i = 0; i < 4; i += 1) {
            if (guess[i] === answer[i]) {
                result[i] = 'green';
            } else {
                remain[answer[i]] = (remain[answer[i]] || 0) + 1;
            }
        }
        for (let i = 0; i < 4; i += 1) {
            if (result[i] === 'green') continue;
            if ((remain[guess[i]] || 0) > 0) {
                result[i] = 'orange';
                remain[guess[i]] -= 1;
            }
        }
        return result;
    }

    function pickAnswer(bank, random) {
        const rand = typeof random === 'function' ? random : Math.random;
        return bank[Math.floor(rand() * bank.length)];
    }

    /** 提示：随机揭示一个尚未猜中（非绿）且未揭示过的位置下标；无可揭示返回 -1 */
    function revealHint(answer, greens, hintSet) {
        const revealed = hintSet || new Set();
        const candidates = [];
        for (let i = 0; i < 4; i += 1) {
            if (greens[i] !== 'green' && !revealed.has(i)) candidates.push(i);
        }
        if (candidates.length === 0) return -1;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /* ---------- 题库加载与校验 ---------- */

    function entryValid(entry) {
        return entry && typeof entry.w === 'string' && /^[\u4e00-\u9fa5]{4}$/.test(entry.w)
            && Array.isArray(entry.p) && entry.p.length === 4
            && entry.p.every((p) => typeof p === 'string' && p.length > 0)
            && typeof entry.e === 'string' && entry.e.length > 0;
    }

    function getBank() {
        const bank = windowObject.IDIOM_BANK;
        if (Array.isArray(bank) && bank.length > 0) {
            const valid = bank.filter(entryValid);
            if (valid.length >= 30) return valid;
        }
        return FALLBACK_BANK;
    }

    /* ---------- 存档：{ version, last, best, total } ---------- */

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

    function readStats() {
        try {
            const raw = JSON.parse(safeGetItem(STATS_KEY) || '{}');
            const stat = (value) => (Number.isFinite(value) && value >= 0 ? value : 0);
            return { version: 1, last: stat(raw.last), best: stat(raw.best), total: stat(raw.total) };
        } catch (_) {
            return { version: 1, last: 0, best: 0, total: 0 };
        }
    }

    function writeStats(stats) {
        safeSetItem(STATS_KEY, JSON.stringify({ version: 1, last: stats.last, best: stats.best, total: stats.total }));
    }

    /* ---------- 页面状态与交互 ---------- */

    const state = {
        bank: [],
        charPinyin: new Map(),
        answer: null,
        attempts: [],
        hintsLeft: HINTS_PER_ROUND,
        hintSet: new Set(),
        finished: false
    };

    const elements = {
        statsText: documentObject.getElementById('stats-text'),
        hintChips: documentObject.getElementById('hint-chips'),
        guessRows: documentObject.getElementById('guess-rows'),
        guessInput: documentObject.getElementById('guess-input'),
        submitBtn: documentObject.getElementById('submit-btn'),
        hintBtn: documentObject.getElementById('hint-btn'),
        hintCount: documentObject.getElementById('hint-count'),
        forfeitBtn: documentObject.getElementById('forfeit-btn'),
        resultModal: documentObject.getElementById('result-modal'),
        resultTitle: documentObject.getElementById('result-title'),
        resultWord: documentObject.getElementById('result-word'),
        resultPinyin: documentObject.getElementById('result-pinyin'),
        resultExplanation: documentObject.getElementById('result-explanation'),
        resultDerivation: documentObject.getElementById('result-derivation'),
        resultStats: documentObject.getElementById('result-stats'),
        nextBtn: documentObject.getElementById('next-btn')
    };

    function buildCharPinyin(bank) {
        const map = new Map();
        bank.forEach((entry) => {
            for (let i = 0; i < 4; i += 1) {
                const ch = entry.w[i];
                if (!map.has(ch)) map.set(ch, entry.p[i]);
            }
        });
        return map;
    }

    function renderStats() {
        const stats = readStats();
        elements.statsText.textContent = '连胜 ' + stats.last + ' · 最高 ' + stats.best;
    }

    /** 预渲染 9 行猜测行（空块 + 拼音占位行） */
    function renderRows() {
        elements.guessRows.replaceChildren();
        for (let r = 0; r < MAX_ATTEMPTS; r += 1) {
            const row = documentObject.createElement('div');
            row.className = 'guess-row';
            const blocks = documentObject.createElement('div');
            blocks.className = 'guess-blocks';
            for (let c = 0; c < 4; c += 1) {
                const cell = documentObject.createElement('div');
                cell.className = 'guess-cell';
                blocks.appendChild(cell);
            }
            const pinyin = documentObject.createElement('div');
            pinyin.className = 'guess-pinyin';
            row.appendChild(blocks);
            row.appendChild(pinyin);
            elements.guessRows.appendChild(row);
        }
        refreshActiveRow();
    }

    /** 只给当前待填写行加高亮；历史行的着色由 writeRow 负责，不能在这里重置 */
    function refreshActiveRow() {
        if (state.finished) return;
        const row = elements.guessRows.children[state.attempts.length];
        if (!row) return;
        Array.prototype.forEach.call(row.children[0].children, (cell) => {
            cell.className = 'guess-cell is-active';
        });
    }

    /** 提交一次猜测：清洗 → 判定 → 写行 → 结算 */
    function submitGuess() {
        if (state.finished) return;
        const normalized = normalizeInput(elements.guessInput.value);
        if (!normalized.ok) {
            elements.guessInput.classList.add('is-shake');
            windowObject.setTimeout(() => elements.guessInput.classList.remove('is-shake'), 320);
            return;
        }
        const guess = normalized.chars;
        const feedback = judge(guess, state.answer.w);
        state.attempts.push({ guess, feedback });
        elements.guessInput.value = '';
        writeRow(state.attempts.length - 1, guess, feedback);
        if (feedback.every((tone) => tone === 'green')) {
            finish(true);
        } else if (state.attempts.length >= MAX_ATTEMPTS) {
            finish(false);
        } else {
            refreshActiveRow();
        }
    }

    function pinyinOfGuess(guess) {
        const parts = guess.map((ch) => state.charPinyin.get(ch) || '?');
        return parts.join(' ');
    }

    function writeRow(rowIndex, guess, feedback) {
        const row = elements.guessRows.children[rowIndex];
        if (!row) return;
        Array.prototype.forEach.call(row.children[0].children, (cell, index) => {
            cell.textContent = guess[index];
            cell.className = 'guess-cell is-' + feedback[index];
        });
        row.children[1].textContent = pinyinOfGuess(guess);
    }

    function renderHintChips() {
        elements.hintChips.replaceChildren();
        state.hintSet.forEach((index) => {
            const chip = documentObject.createElement('span');
            chip.className = 'hint-chip';
            const label = documentObject.createElement('span');
            label.textContent = '第' + (index + 1) + '字';
            chip.appendChild(label);
            chip.appendChild(documentObject.createTextNode(state.answer.w[index]));
            elements.hintChips.appendChild(chip);
        });
    }

    function useHint() {
        if (state.finished || state.hintsLeft <= 0) return;
        // 以全部历史行中已确定全绿的位置为准，避免重复揭示
        const greens = [];
        for (let i = 0; i < 4; i += 1) {
            greens.push(state.attempts.some((attempt) => attempt.feedback[i] === 'green') ? 'green' : 'gray');
        }
        const index = revealHint(state.answer.w, greens, state.hintSet);
        if (index === -1) return;
        state.hintSet.add(index);
        state.hintsLeft -= 1;
        elements.hintCount.textContent = '(' + state.hintsLeft + ')';
        elements.hintBtn.disabled = state.hintsLeft === 0;
        renderHintChips();
    }

    function finish(won) {
        state.finished = true;
        refreshActiveRow();
        const stats = readStats();
        const last = won ? stats.last + 1 : 0;
        const next = { version: 1, last, best: Math.max(stats.best, last), total: stats.total + (won ? 1 : 0) };
        writeStats(next);
        renderStats();
        elements.resultTitle.textContent = won ? '猜中了！' : '差一点点，答案是：';
        elements.resultWord.textContent = state.answer.w;
        elements.resultPinyin.textContent = state.answer.p.join(' ');
        elements.resultExplanation.textContent = state.answer.e;
        elements.resultDerivation.textContent = state.answer.s || '';
        elements.resultStats.textContent = won
            ? '连胜 ' + next.last + ' · 最高 ' + next.best + ' · 累计猜中 ' + next.total + ' 局（本局用 ' + state.attempts.length + ' 次）'
            : '连胜清零 · 最高 ' + next.best + ' · 累计猜中 ' + next.total + ' 局';
        elements.resultModal.hidden = false;
    }

    function newRound() {
        state.answer = pickAnswer(state.bank);
        state.attempts = [];
        state.hintsLeft = HINTS_PER_ROUND;
        state.hintSet = new Set();
        state.finished = false;
        elements.guessInput.value = '';
        elements.hintCount.textContent = '(' + HINTS_PER_ROUND + ')';
        elements.hintBtn.disabled = false;
        elements.resultModal.hidden = true;
        elements.hintChips.replaceChildren();
        renderRows();
        renderStats();
    }

    function bindEvents() {
        elements.submitBtn.addEventListener('click', submitGuess);
        elements.hintBtn.addEventListener('click', useHint);
        elements.forfeitBtn.addEventListener('click', () => {
            if (!state.finished) finish(false);
        });
        elements.nextBtn.addEventListener('click', newRound);
        elements.guessInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submitGuess();
            }
        });
    }

    windowObject.IdiomGuess = {
        normalizeInput,
        judge,
        pickAnswer,
        revealHint,
        entryValid,
        getBank,
        readStats,
        writeStats
    };

    state.bank = getBank();
    state.charPinyin = buildCharPinyin(state.bank);
    bindEvents();
    newRound();
})(window, document);
