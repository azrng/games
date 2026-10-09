// @ts-check
/* 拼音打字乐园 · 核心逻辑
 * 状态机：MENU → PLAY → RESULT（零失败设计：没有任何失败/终止分支，按错只累计 wrongCount 影响星级与动画）
 * 存储契约见 doc/contracts/pinyin-typing/core-game.md（CON-PT001）
 * 对外通过 window.PT 暴露最小 API，供 smoke 测试与后续扩展复用
 */

const PT_SAVE_KEY = 'pinyin_typing_save_v1';
const PT_ROUND_SIZE = 8; // 每局字数
const PT_TIERS = [
    { id: 'sprout', icon: '🌱', name: '启蒙档', age: '5-6 岁', combo: false },
    { id: 'basic', icon: '🌟', name: '基础档', age: '6-7 岁', combo: false },
    { id: 'rocket', icon: '🚀', name: '挑战档', age: '7-8 岁', combo: true },
    { id: 'advanced', icon: '🎓', name: '进阶档', age: '8-9 岁', combo: true }
];
/** 挑战/进阶档显示连击统计 */
function isComboTier(tierId) {
    const tier = PT_TIERS.find((t) => t.id === tierId);
    return !!(tier && tier.combo);
}
const PT_KB_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const PT_TONE_VOWELS = { a: 'āáǎà', o: 'ōóǒò', e: 'ēéěè', i: 'īíǐì', u: 'ūúǔù' };
const PT_CELEBRATION_EMOJIS = ['⭐', '✨', '🌸', '🎉', '💫', '🌈'];
const PT_PRAISE = ['真棒！', '太厉害了！', '你真聪明！', '继续加油！'];

/** @typedef {{h: string, p: string, t: number, e: string, w: string}} PtEntry 字库条目 */
/**
 * @typedef {object} PtSave 本地存档结构（CON-PT001）
 * @property {number} version
 * @property {boolean} muted
 * @property {Object<string, Object<string, number>>} stars 各档每字历史最佳星级（1-3）
 * @property {Object<string, number>} bestCombo 各档历史最高连击
 * @property {Object<string, Object<string, number>>} misses 各档每字累计按错次数（小绊脚石，3 星清零）
 * @property {string} updatedAt
 */

/** 全局对局状态 */
const G = {
    tier: /** @type {string|null} */ (null),
    queue: /** @type {PtEntry[]} */ ([]),
    qi: 0,
    slotIdx: 0,
    wrongCount: 0,
    combo: 0,
    bestCombo: 0,
    roundStars: /** @type {number[]} */ ([]),
    newStickers: /** @type {PtEntry[]} */ ([]),
    tierWasComplete: false,
    running: false
};
/** @type {Record<string, HTMLElement>} 键位字母 → 键帽元素 */
const KEY_ELS = {};
/** @type {HTMLElement[]} 当前字的槽位元素 */
let SLOT_ELS = [];
let STORE_WARNED = false;

let PT_SAVE = loadSave();

/* ---------- 存档（读写全部 try/catch 兜底） ---------- */

/** @returns {PtSave} 全新默认存档（档位键随 PT_TIERS 扩展） */
function defaultSave() {
    const stars = {};
    const bestCombo = {};
    const misses = {};
    PT_TIERS.forEach((tier) => {
        stars[tier.id] = {};
        bestCombo[tier.id] = 0;
        misses[tier.id] = {};
    });
    return {
        version: 1,
        muted: false,
        stars,
        bestCombo,
        misses,
        updatedAt: ''
    };
}

/** 读取存档：损坏或版本不符一律重置为默认，绝不抛错 */
function loadSave() {
    try {
        const raw = localStorage.getItem(PT_SAVE_KEY);
        if (!raw) return defaultSave();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== 1) return defaultSave();
        const save = defaultSave();
        if (typeof parsed.muted === 'boolean') save.muted = parsed.muted;
        PT_TIERS.forEach((tier) => {
            const tierStars = parsed.stars && parsed.stars[tier.id];
            if (tierStars && typeof tierStars === 'object') {
                Object.keys(tierStars).forEach((h) => {
                    const v = Number(tierStars[h]);
                    if (v >= 1 && v <= 3) save.stars[tier.id][h] = v;
                });
            }
            const best = Number(parsed.bestCombo && parsed.bestCombo[tier.id]);
            if (best > 0) save.bestCombo[tier.id] = Math.floor(best);
            // 小绊脚石：旧存档缺字段时保持默认空表；只收正整数
            const tierMisses = parsed.misses && parsed.misses[tier.id];
            if (tierMisses && typeof tierMisses === 'object') {
                Object.keys(tierMisses).forEach((h) => {
                    const v = Number(tierMisses[h]);
                    if (v > 0 && Number.isInteger(v)) save.misses[tier.id][h] = v;
                });
            }
        });
        return save;
    } catch (e) {
        return defaultSave();
    }
}

/** 写存档；写不进（隐私模式等）提示一次后照常玩 */
function persistSave() {
    try {
        PT_SAVE.updatedAt = new Date().toISOString();
        localStorage.setItem(PT_SAVE_KEY, JSON.stringify(PT_SAVE));
    } catch (e) {
        if (!STORE_WARNED) {
            STORE_WARNED = true;
            const el = document.getElementById('storeWarn');
            if (el) el.classList.remove('hidden');
        }
    }
}

/* ---------- 字库与取字 ---------- */

/** @returns {PtEntry[]} 指定档位的字库（wordbank.js 缺失时安全降级为空） */
function tierBank(tierId) {
    const bank = /** @type {any} */ (window).PT_WORDBANK;
    return (bank && bank[tierId]) || [];
}

/** 某字是否已点亮贴纸（打过） */
function hasStar(tierId, hanzi) {
    return bestStars(tierId, hanzi) > 0;
}

/** 某字历史最佳星级（0 = 未打过） */
function bestStars(tierId, hanzi) {
    const tier = PT_SAVE.stars[tierId];
    return (tier && tier[hanzi]) || 0;
}

/** 某字累计按错次数（小绊脚石，0 = 没绊过） */
function missCount(tierId, hanzi) {
    const tier = PT_SAVE.misses[tierId];
    return (tier && tier[hanzi]) || 0;
}

/** 记一笔按错：只写内存，字完成时随 persistSave 一次性落盘 */
function recordMiss(tierId, hanzi) {
    if (!tierId || !hanzi) return;
    if (!PT_SAVE.misses[tierId]) PT_SAVE.misses[tierId] = {};
    PT_SAVE.misses[tierId][hanzi] = missCount(tierId, hanzi) + 1;
}

/** 某档贴纸是否全部点亮（集齐） */
function isTierComplete(tierId) {
    const bank = tierBank(tierId);
    return bank.length > 0 && bank.every((entry) => hasStar(tierId, entry.h));
}

/** 错题特训取字：绊过的字按累计次数降序（并列按字库顺序）取前 size 个，可少于 size */
function pickMissQueue(tierId, size) {
    return tierBank(tierId)
        .filter((entry) => missCount(tierId, entry.h) > 0)
        .sort((a, b) => missCount(tierId, b.h) - missCount(tierId, a.h))
        .slice(0, size);
}

/** 原地 Fisher-Yates 洗牌 */
function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
    }
    return list;
}

/** 取一局字数：优先未点亮贴纸的字，不足时用已掌握字随机补齐 */
function pickQueue(tierId, size) {
    const fresh = [];
    const learned = [];
    tierBank(tierId).forEach((entry) => {
        (hasStar(tierId, entry.h) ? learned : fresh).push(entry);
    });
    shuffle(fresh);
    shuffle(learned);
    return fresh.slice(0, size).concat(learned.slice(0, Math.max(0, size - fresh.length)));
}

/* ---------- 拼音声调展示 ---------- */

/** 给无声调拼音加声调符号（仅展示，不参与输入判定）；t=0 或双字词原样返回 */
function toneMark(p, tone) {
    const t = Number(tone) || 0;
    if (t < 1 || t > 4) return p;
    let target = '';
    if (p.indexOf('a') >= 0) target = 'a';
    else if (p.indexOf('o') >= 0) target = 'o';
    else if (p.indexOf('e') >= 0) target = 'e';
    else if (p.slice(-2) === 'iu') target = 'u'; // iu 组标后：liù
    else if (p.slice(-2) === 'ui') target = 'i'; // ui 组标前：shuǐ
    else {
        for (let i = p.length - 1; i >= 0; i--) {
            if ('aeiou'.indexOf(p[i]) >= 0) { target = p[i]; break; }
        }
    }
    if (!target) return p;
    return p.replace(target, PT_TONE_VOWELS[target][t - 1]);
}

/* ---------- 对局流程 ---------- */

/**
 * 判键：命中的字母返回 true 并推进槽位；非字母键直接忽略；按错只累计 wrongCount、清连击
 * @param {string} key 小写字母键
 * @returns {boolean}
 */
function handleKey(key) {
    if (!G.running) return false;
    const cur = currentEntry();
    if (!cur || !/^[a-z]$/.test(key)) return false;
    if (key === cur.p[G.slotIdx]) {
        G.combo += 1;
        if (G.combo > G.bestCombo) G.bestCombo = G.combo;
        G.slotIdx += 1;
        renderSlotFilled(G.slotIdx - 1);
        renderHud();
        beep('hit');
        if (G.slotIdx >= cur.p.length) completeWord();
        else updateKeyHighlight();
        return true;
    }
    G.wrongCount += 1;
    G.combo = 0;
    recordMiss(G.tier, cur.h);
    renderHud();
    renderMiss(key);
    beep('miss');
    return false;
}

function currentEntry() {
    return G.queue[G.qi] || null;
}

/** 星级规则：本字零按错 3 星，1-2 次按错 2 星，更多 1 星 */
function computeStars(wrongCount) {
    if (wrongCount === 0) return 3;
    if (wrongCount <= 2) return 2;
    return 1;
}

/**
 * 开一局：取字 → 进对局页 → 出第一个字
 * @param {string} tierId 档位 id
 * @param {PtEntry[]=} fixedQueue 错题特训的固定队列（不传走常规取字）
 */
function startGame(tierId, fixedQueue) {
    if (!tierBank(tierId).length) return;
    G.tier = tierId;
    G.queue = (fixedQueue && fixedQueue.length ? fixedQueue : pickQueue(tierId, PT_ROUND_SIZE)).slice(0, PT_ROUND_SIZE);
    G.qi = 0;
    G.combo = 0;
    G.bestCombo = 0;
    G.roundStars = [];
    G.newStickers = [];
    G.tierWasComplete = isTierComplete(tierId);
    G.running = true;
    ['play', 'result'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('data-tier', tierId);
    });
    switchScreen('play');
    nextWord();
}

/** 装载当前字并自动朗读一次 */
function nextWord() {
    const cur = currentEntry();
    if (!cur) return;
    G.slotIdx = 0;
    G.wrongCount = 0;
    renderWord(cur);
    renderHud();
    speakEntry(cur);
}

/** 单字完成：计星 → 写档 → 庆祝 → 停顿后自动进下一字（庆祝间隙不判键，防止连按串字） */
function completeWord() {
    const cur = currentEntry();
    if (!cur) return;
    const stars = computeStars(G.wrongCount);
    G.roundStars.push(stars);
    if (bestStars(G.tier, cur.h) === 0) G.newStickers.push(cur);
    if (!PT_SAVE.stars[G.tier]) PT_SAVE.stars[G.tier] = {};
    PT_SAVE.stars[G.tier][cur.h] = Math.max(bestStars(G.tier, cur.h), stars);
    // 3 星 = 本局零按错，搬走绊脚石（清零重算，给掌握正反馈）
    if (stars === 3 && PT_SAVE.misses[G.tier]) delete PT_SAVE.misses[G.tier][cur.h];
    if (isComboTier(G.tier)) {
        PT_SAVE.bestCombo[G.tier] = Math.max(PT_SAVE.bestCombo[G.tier] || 0, G.bestCombo);
    }
    persistSave();
    G.running = false;
    renderHud();
    celebrate();
    speak(PT_PRAISE[Math.floor(Math.random() * PT_PRAISE.length)]);
    setTimeout(advanceRound, 950);
}

/** 庆祝结束后流转：还有字就继续，打满一局进结算（测试可直接调用） */
function advanceRound() {
    G.qi += 1;
    if (G.qi >= G.queue.length) showResult();
    else {
        G.running = true;
        nextWord();
    }
}

function showResult() {
    G.running = false;
    renderResult();
    switchScreen('result');
}

/** Esc / 回选档：对局零损失，直接放弃本局 */
function goMenu() {
    G.running = false;
    renderMenu();
    switchScreen('menu');
}

/* ---------- DOM 渲染 ---------- */

function elById(id) {
    return document.getElementById(id);
}

/** 当前所在页（Esc 回选档用） */
let CURRENT_SCREEN = 'menu';

function switchScreen(name) {
    CURRENT_SCREEN = name;
    ['menu', 'play', 'result', 'album', 'review'].forEach((id) => {
        const el = elById(id);
        if (el) el.classList.toggle('hidden', id !== name);
    });
}

/** 创建元素并设类名与文本（禁止拼 HTML 字符串） */
function mk(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function renderMenu() {
    const grid = elById('tierGrid');
    if (!grid) return;
    grid.innerHTML = '';
    let totalGot = 0;
    let totalCount = 0;
    let missChars = 0;
    PT_TIERS.forEach((tier) => {
        const bank = tierBank(tier.id);
        let got = 0;
        let starSum = 0;
        bank.forEach((entry) => {
            const s = bestStars(tier.id, entry.h);
            if (s > 0) got += 1;
            starSum += s;
        });
        totalGot += got;
        totalCount += bank.length;
        bank.forEach((entry) => {
            if (missCount(tier.id, entry.h) > 0) missChars += 1;
        });
        const card = mk('button', 'pt-tier');
        card.type = 'button';
        card.setAttribute('data-tier', tier.id);
        card.setAttribute('role', 'listitem');
        const inner = mk('span', 'pt-tier-inner');
        inner.appendChild(mk('span', 'pt-tier-icon', tier.icon));
        inner.appendChild(mk('span', 'pt-tier-name', tier.name));
        inner.appendChild(mk('span', 'pt-tier-age', tier.age));
        inner.appendChild(mk('span', 'pt-tier-stat', `🧧 贴纸 ${got}/${bank.length}`));
        inner.appendChild(mk('span', 'pt-tier-stat', `⭐ 星星 ${starSum}`));
        card.appendChild(inner);
        grid.appendChild(card);
    });
    const albumBtn = elById('albumBtn');
    if (albumBtn) albumBtn.textContent = `📖 我的贴纸册 ${totalGot}/${totalCount}`;
    const reviewBtn = elById('reviewBtn');
    if (reviewBtn) reviewBtn.textContent = missChars > 0 ? `🎯 小绊脚石 ${missChars}` : '🎯 小绊脚石';
}

function renderKeyboard() {
    const kb = elById('kb');
    if (!kb) return;
    PT_KB_ROWS.forEach((row) => {
        const rowEl = mk('div', 'pt-kb-row');
        row.split('').forEach((letter) => {
            const keyEl = mk('span', 'pt-key', letter);
            keyEl.setAttribute('data-key', letter);
            KEY_ELS[letter] = keyEl;
            rowEl.appendChild(keyEl);
        });
        kb.appendChild(rowEl);
    });
}

function renderWord(cur) {
    const emojiEl = elById('cardEmoji');
    const hanziEl = elById('cardHanzi');
    const infoEl = elById('cardInfo');
    // 扩量字库无插图时隐藏图位，保持大字卡居中
    if (emojiEl) {
        emojiEl.textContent = cur.e || '';
        emojiEl.classList.toggle('hidden', !cur.e);
    }
    if (hanziEl) hanziEl.textContent = cur.h;
    if (infoEl) {
        // 单字展示带调拼音（+例词，若有）；双字词直接展示拼音
        infoEl.textContent = cur.h.length > 1 ? cur.p : (cur.w ? `${toneMark(cur.p, cur.t)} · ${cur.w}` : toneMark(cur.p, cur.t));
    }
    const slots = elById('slots');
    if (slots) {
        slots.innerHTML = '';
        SLOT_ELS = [];
        cur.p.split('').forEach((letter) => {
            const slot = mk('span', 'pt-slot', letter);
            slots.appendChild(slot);
            SLOT_ELS.push(slot);
        });
    }
    updateKeyHighlight();
}

function renderSlotFilled(index) {
    const slot = SLOT_ELS[index];
    if (slot) slot.classList.add('pt-filled');
}

function updateKeyHighlight() {
    const cur = currentEntry();
    const nextLetter = cur ? cur.p[G.slotIdx] : '';
    Object.keys(KEY_ELS).forEach((letter) => {
        KEY_ELS[letter].classList.toggle('pt-next', letter === nextLetter);
    });
}

function renderHud() {
    const progress = elById('hudProgress');
    const stars = elById('hudStars');
    const combo = elById('hudCombo');
    if (progress) progress.textContent = `第 ${Math.min(G.qi + 1, G.queue.length)}/${G.queue.length} 字`;
    if (stars) stars.textContent = `⭐ ${totalStars()}`;
    if (combo) {
        combo.classList.toggle('hidden', !isComboTier(G.tier));
        combo.textContent = `🔥 连击 ${G.combo}`;
    }
}

function renderMiss(key) {
    const card = elById('hanziCard');
    if (card) {
        card.classList.remove('pt-shake');
        void card.offsetWidth;
        card.classList.add('pt-shake');
    }
    const keyEl = KEY_ELS[key];
    if (keyEl) {
        keyEl.classList.add('pt-miss');
        setTimeout(() => keyEl.classList.remove('pt-miss'), 300);
    }
}

/** 三档星星总数（全档累计，跨档也计入，给孩子总量感） */
function totalStars() {
    let sum = 0;
    PT_TIERS.forEach((tier) => {
        tierBank(tier.id).forEach((entry) => {
            sum += bestStars(tier.id, entry.h);
        });
    });
    return sum;
}

/* ---------- 贴纸册与小绊脚石（存档的两个只读视图） ---------- */

/** 贴纸册当前查看的档位 */
let ALBUM_TIER = PT_TIERS[0].id;
/** 小绊脚石当前查看的档位 */
let REVIEW_TIER = PT_TIERS[0].id;

/** 渲染四档 tab（贴纸册/小绊脚石共用，点击行为由调用方容器委托） */
function renderTabs(containerId, activeTier) {
    const box = elById(containerId);
    if (!box) return;
    box.innerHTML = '';
    PT_TIERS.forEach((tier) => {
        const tab = mk('button', tier.id === activeTier ? 'pt-tab pt-tab-on' : 'pt-tab', `${tier.icon} ${tier.name}`);
        tab.type = 'button';
        tab.setAttribute('data-tier', tier.id);
        box.appendChild(tab);
    });
}

function openAlbum(tierId) {
    ALBUM_TIER = tierId || G.tier || PT_TIERS[0].id;
    renderAlbum();
    switchScreen('album');
}

/** 贴纸册：已收展示插图+汉字+星级（点击重听），未收只画「？」剪影 */
function renderAlbum() {
    renderTabs('albumTabs', ALBUM_TIER);
    const bank = tierBank(ALBUM_TIER);
    const stat = elById('albumStat');
    if (stat) {
        let got = 0;
        bank.forEach((entry) => {
            if (hasStar(ALBUM_TIER, entry.h)) got += 1;
        });
        const done = bank.length > 0 && got >= bank.length;
        stat.textContent = done ? `🏆 集齐 ${bank.length} 张，太棒啦！` : `🧧 已收 ${got}/${bank.length}`;
        stat.classList.toggle('pt-album-done', done);
    }
    const grid = elById('albumGrid');
    if (!grid) return;
    grid.innerHTML = '';
    bank.forEach((entry) => {
        const got = hasStar(ALBUM_TIER, entry.h);
        const card = mk('button', got ? 'pt-sticker' : 'pt-sticker pt-sticker-off');
        card.type = 'button';
        if (got) {
            card.setAttribute('data-hanzi', entry.h);
            card.setAttribute('aria-label', `贴纸 ${entry.h}，点一下听读音`);
            card.appendChild(mk('span', 'pt-sticker-emoji', entry.e || '🧧'));
            card.appendChild(mk('span', 'pt-sticker-hanzi', entry.h));
            const stars = mk('span', 'pt-sticker-stars');
            for (let s = 0; s < 3; s++) {
                const star = mk('span', 'pt-star', '⭐');
                if (s < bestStars(ALBUM_TIER, entry.h)) star.classList.add('pt-on');
                stars.appendChild(star);
            }
            card.appendChild(stars);
        } else {
            card.setAttribute('aria-label', '还没收到的贴纸');
            card.disabled = true;
            card.appendChild(mk('span', 'pt-sticker-mystery', '？'));
        }
        grid.appendChild(card);
    });
}

function openReview(tierId) {
    REVIEW_TIER = tierId || G.tier || PT_TIERS[0].id;
    renderReview();
    switchScreen('review');
}

/** 小绊脚石：绊过的字按累计次数降序列出，可一键特训 */
function renderReview() {
    renderTabs('reviewTabs', REVIEW_TIER);
    const list = elById('reviewList');
    if (!list) return;
    list.innerHTML = '';
    const rows = pickMissQueue(REVIEW_TIER, Infinity);
    const trainBtn = elById('trainBtn');
    if (trainBtn) {
        trainBtn.classList.toggle('hidden', rows.length === 0);
        trainBtn.textContent = rows.length > 0 ? `🎯 开始特训（${Math.min(rows.length, PT_ROUND_SIZE)} 字短局）` : '🎯 开始特训';
    }
    const emptyTip = elById('reviewEmpty');
    if (emptyTip) emptyTip.classList.toggle('hidden', rows.length > 0);
    rows.forEach((entry) => {
        const row = mk('div', 'pt-review-row');
        row.appendChild(mk('span', 'pt-review-emoji', entry.e || '🧧'));
        row.appendChild(mk('span', 'pt-review-hanzi', entry.h));
        row.appendChild(mk('span', 'pt-review-pinyin', entry.h.length > 1 ? entry.p : toneMark(entry.p, entry.t)));
        row.appendChild(mk('span', 'pt-review-count', `绊了 ${missCount(REVIEW_TIER, entry.h)} 次`));
        list.appendChild(row);
    });
}

function renderResult() {
    const title = elById('resultTitle');
    if (title) {
        const perfect = G.roundStars.length > 0 && G.roundStars.every((s) => s === 3);
        title.textContent = perfect ? '🏆 满分！太厉害了！' : '🎉 本局打完啦！';
    }
    const starBox = elById('resultStars');
    if (starBox) {
        starBox.innerHTML = '';
        G.queue.forEach((entry, i) => {
            const row = mk('div', 'pt-star-row');
            const got = G.roundStars[i] || 0;
            row.appendChild(mk('span', 'pt-star-char', entry.e ? `${entry.e} ${entry.h}` : entry.h));
            for (let s = 1; s <= 3; s++) {
                const star = mk('span', 'pt-star', '⭐');
                if (s <= got) star.classList.add('pt-on');
                row.appendChild(star);
            }
            row.style.animationDelay = `${i * 0.08}s`;
            starBox.appendChild(row);
        });
    }
    const stickerBox = elById('resultStickers');
    if (stickerBox) {
        stickerBox.innerHTML = '';
        if (G.newStickers.length === 0) {
            stickerBox.appendChild(mk('span', 'pt-chip-none', '本局没有新贴纸，再来一局收新的吧！'));
        } else {
            stickerBox.appendChild(mk('span', 'pt-chip-none', '🧧 新收贴纸（点一下看贴纸册）：'));
            G.newStickers.forEach((entry, i) => {
                const chip = mk('span', 'pt-chip', entry.h);
                chip.setAttribute('data-hanzi', entry.h);
                chip.style.animationDelay = `${0.15 + i * 0.08}s`;
                stickerBox.appendChild(chip);
            });
        }
    }
    const comboEl = elById('resultCombo');
    if (comboEl) {
        comboEl.classList.toggle('hidden', !isComboTier(G.tier));
        comboEl.textContent = `🔥 本局最高连击 ${G.bestCombo}`;
    }
    // 本局收齐该档最后一张贴纸 → 奖杯横幅 + 加撒一把彩点
    const trophy = elById('resultTrophy');
    if (trophy) {
        const justCompleted = !G.tierWasComplete && !!G.tier && isTierComplete(G.tier);
        trophy.classList.toggle('hidden', !justCompleted);
        if (justCompleted) {
            const tier = PT_TIERS.find((t) => t.id === G.tier);
            trophy.textContent = `🏆 恭喜集齐【${tier ? tier.name : ''}】全部贴纸！`;
            celebrate();
        }
    }
}

function celebrate() {
    const card = elById('hanziCard');
    if (card) {
        card.classList.remove('pt-win');
        void card.offsetWidth;
        card.classList.add('pt-win');
    }
    for (let i = 0; i < 12; i++) {
        const bit = mk('span', 'pt-confetti', PT_CELEBRATION_EMOJIS[Math.floor(Math.random() * PT_CELEBRATION_EMOJIS.length)]);
        bit.style.left = `calc(50% + ${Math.round(Math.random() * 160 - 80)}px)`;
        bit.style.top = '40%';
        bit.style.setProperty('--dx', `${Math.round(Math.random() * 260 - 130)}px`);
        bit.style.setProperty('--dy', `${Math.round(-120 - Math.random() * 160)}px`);
        bit.style.animationDelay = `${(Math.random() * 0.15).toFixed(2)}s`;
        document.body.appendChild(bit);
        const node = bit;
        setTimeout(() => { if (node && node.remove) node.remove(); }, 1100);
    }
}

/* ---------- 语音与音效（都做静默降级，不阻塞玩法） ---------- */

function speakEntry(cur) {
    // 单字念「字 + 例词」（无例词只念字），双字词直接念词
    speak(cur.h.length > 1 ? cur.h : (cur.w ? `${cur.h}，${cur.w}` : cur.h));
}

/** @param {boolean=} interrupt 是否打断上一段朗读（默认打断） */
function speak(text, interrupt) {
    if (PT_SAVE.muted || !text) return;
    try {
        const synth = /** @type {any} */ (window).speechSynthesis;
        if (!synth || !synth.speak) return;
        if (interrupt !== false && synth.cancel) synth.cancel();
        const u = new (/** @type {any} */ (window).SpeechSynthesisUtterance)(text);
        u.lang = 'zh-CN';
        u.rate = 0.85; // 放慢一点，照顾低龄理解
        synth.speak(u);
    } catch (e) {
        /* 无语音环境：静默降级，拼音照常显示 */
    }
}

let AUDIO_CTX = null;

/** 轻量提示音：hit 命中 / miss 按错 / win 过字 */
function beep(kind) {
    if (PT_SAVE.muted) return;
    try {
        const Ctx = /** @type {any} */ (window).AudioContext || /** @type {any} */ (window).webkitAudioContext;
        if (!Ctx) return;
        if (!AUDIO_CTX) AUDIO_CTX = new Ctx();
        const conf = { hit: [660, 0.08, 'sine'], miss: [170, 0.13, 'sawtooth'], win: [880, 0.3, 'sine'] }[kind] || [440, 0.08, 'sine'];
        const osc = AUDIO_CTX.createOscillator();
        const gain = AUDIO_CTX.createGain();
        const t = AUDIO_CTX.currentTime;
        osc.type = conf[2];
        osc.frequency.setValueAtTime(conf[0], t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + conf[1]);
        osc.connect(gain);
        gain.connect(AUDIO_CTX.destination);
        osc.start(t);
        osc.stop(t + conf[1]);
    } catch (e) {
        /* 无音频环境：静默降级 */
    }
}

function renderSound() {
    const menuBtn = elById('soundBtn');
    const playBtn = elById('muteBtn');
    if (menuBtn) menuBtn.textContent = PT_SAVE.muted ? '🔇 声音：关' : '🔊 声音：开';
    if (playBtn) playBtn.textContent = PT_SAVE.muted ? '🔇' : '🔊';
}

function toggleMute() {
    PT_SAVE.muted = !PT_SAVE.muted;
    persistSave();
    renderSound();
    if (!PT_SAVE.muted) speak('声音打开啦');
}

/* ---------- 输入与初始化 ---------- */

function onKeydown(e) {
    if (e.key === 'Escape') {
        // 任意非选档页 Esc 都回选档（对局零损失，册/错题页同理）
        if (CURRENT_SCREEN !== 'menu') goMenu();
        return;
    }
    // 大写键（CapsLock / 键盘印字习惯）统一转小写再判
    handleKey(String(e.key || '').toLowerCase());
}

function init() {
    renderMenu();
    renderKeyboard();
    renderSound();
    document.addEventListener('keydown', onKeydown);
    const soundBtn = elById('soundBtn');
    const muteBtn = elById('muteBtn');
    const againBtn = elById('againBtn');
    const menuBtn = elById('menuBtn');
    const albumBtn = elById('albumBtn');
    const reviewBtn = elById('reviewBtn');
    const albumBackBtn = elById('albumBackBtn');
    const reviewBackBtn = elById('reviewBackBtn');
    const trainBtn = elById('trainBtn');
    const albumTabs = elById('albumTabs');
    const reviewTabs = elById('reviewTabs');
    const albumGrid = elById('albumGrid');
    const resultStickers = elById('resultStickers');
    const card = elById('hanziCard');
    if (soundBtn) soundBtn.addEventListener('click', toggleMute);
    if (muteBtn) muteBtn.addEventListener('click', toggleMute);
    if (againBtn) againBtn.addEventListener('click', () => startGame(/** @type {string} */ (G.tier)));
    if (menuBtn) menuBtn.addEventListener('click', goMenu);
    if (albumBtn) albumBtn.addEventListener('click', () => openAlbum(G.tier));
    if (reviewBtn) reviewBtn.addEventListener('click', () => openReview(G.tier));
    if (albumBackBtn) albumBackBtn.addEventListener('click', goMenu);
    if (reviewBackBtn) reviewBackBtn.addEventListener('click', goMenu);
    if (trainBtn) {
        trainBtn.addEventListener('click', () => {
            startGame(REVIEW_TIER, pickMissQueue(REVIEW_TIER, PT_ROUND_SIZE));
        });
    }
    if (albumTabs) {
        // 事件委托：tab 是动态创建的
        albumTabs.addEventListener('click', (e) => {
            const target = /** @type {any} */ (e.target);
            const tabEl = target && target.closest ? target.closest('.pt-tab') : null;
            const tier = tabEl && tabEl.getAttribute('data-tier');
            if (tier) {
                ALBUM_TIER = tier;
                renderAlbum();
            }
        });
    }
    if (reviewTabs) {
        reviewTabs.addEventListener('click', (e) => {
            const target = /** @type {any} */ (e.target);
            const tabEl = target && target.closest ? target.closest('.pt-tab') : null;
            const tier = tabEl && tabEl.getAttribute('data-tier');
            if (tier) {
                REVIEW_TIER = tier;
                renderReview();
            }
        });
    }
    if (albumGrid) {
        // 点已收贴纸重听朗读（未收剪影 disabled，点不到）
        albumGrid.addEventListener('click', (e) => {
            const target = /** @type {any} */ (e.target);
            const cardEl = target && target.closest ? target.closest('.pt-sticker') : null;
            const hanzi = cardEl && cardEl.getAttribute('data-hanzi');
            if (!hanzi) return;
            const entry = tierBank(ALBUM_TIER).find((c) => c.h === hanzi);
            if (entry) speakEntry(entry);
        });
    }
    if (resultStickers) {
        // 结算页新贴纸可点，直达该档贴纸册
        resultStickers.addEventListener('click', (e) => {
            const target = /** @type {any} */ (e.target);
            if (target && target.closest && target.closest('.pt-chip')) {
                openAlbum(G.tier);
            }
        });
    }
    if (card) {
        card.addEventListener('click', () => {
            const cur = currentEntry();
            if (cur && G.running) speakEntry(cur);
        });
    }
    const grid = elById('tierGrid');
    if (grid) {
        // 事件委托：档位卡片是动态创建的
        grid.addEventListener('click', (e) => {
            const target = /** @type {any} */ (e.target);
            const cardEl = target && target.closest ? target.closest('.pt-tier') : null;
            const tier = cardEl && cardEl.getAttribute('data-tier');
            if (tier) startGame(tier);
        });
    }
}

init();

/* ---------- 对外最小 API（smoke 测试与后续扩展入口） ---------- */
/** @type {any} */ (window).PT = {
    PT_SAVE, G, PT_TIERS, PT_ROUND_SIZE,
    loadSave, persistSave, defaultSave,
    tierBank, pickQueue, pickMissQueue, toneMark, computeStars,
    handleKey, startGame, nextWord, completeWord, advanceRound, showResult, goMenu,
    hasStar, bestStars, missCount, recordMiss, isTierComplete,
    openAlbum, openReview, renderAlbum, renderReview
};
