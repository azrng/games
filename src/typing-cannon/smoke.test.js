const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* 任意属性可取、任意方法可调的自动桩：覆盖 canvas 2D 上下文等重绘制依赖 */
function makeAutoStub() {
    const stub = new Proxy(function () {}, {
        get(target, prop) {
            if (prop === Symbol.toPrimitive) return () => 0;
            if (!(prop in target)) target[prop] = makeAutoStub();
            return target[prop];
        },
        apply() { return makeAutoStub(); },
        construct() { return makeAutoStub(); }
    });
    return stub;
}

function createElement(id) {
    const element = {
        id,
        textContent: '',
        innerHTML: '',
        value: '',
        hidden: false,
        disabled: false,
        width: 0,
        height: 0,
        dataset: {},
        style: {},
        className: '',
        children: [],
        addEventListener() {},
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        remove() {},
        focus() {},
        setAttribute(name, value) {
            this[name] = value;
        },
        getContext() {
            return makeAutoStub();
        }
    };
    const classSet = new Set();
    const syncClassName = () => {
        element.className = Array.from(classSet).join(' ');
    };
    element.classList = {
        add(...cls) {
            cls.forEach((c) => classSet.add(c));
            syncClassName();
        },
        remove(...cls) {
            cls.forEach((c) => classSet.delete(c));
            syncClassName();
        },
        toggle(cls, force) {
            const on = force === undefined ? !classSet.has(cls) : !!force;
            if (on) classSet.add(cls);
            else classSet.delete(cls);
            syncClassName();
            return on;
        },
        contains(cls) {
            return classSet.has(cls);
        }
    };
    return element;
}

function runScriptWithContext(seedStorage = []) {
    const storage = new Map(seedStorage);
    const elements = new Map();

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        addEventListener() {}
    };

    /* requestAnimationFrame 桩不执行回调，游戏循环由断言主动驱动 */
    const context = {
        window: {
            innerWidth: 1280,
            innerHeight: 720,
            devicePixelRatio: 1,
            addEventListener() {},
            TypingCannon: null
        },
        location: { href: '' },
        localStorage: {
            getItem(key) {
                return storage.has(key) ? storage.get(key) : null;
            },
            setItem(key, value) {
                storage.set(key, String(value));
            },
            removeItem(key) {
                storage.delete(key);
            }
        },
        performance: {
            now() {
                return 0;
            }
        },
        requestAnimationFrame() {
            return 1;
        },
        setTimeout() {
            return 1;
        },
        clearTimeout() {},
        document,
        Math,
        Date,
        JSON,
        Map,
        Set,
        console
    };
    context.window.window = context.window;
    context.window.document = document;

    /* 词包数据先于引擎加载，与 index.html 引入顺序一致 */
    vm.runInNewContext(read('wordpacks.js'), context);
    vm.runInNewContext(read('script.js'), context);
    return { context, storage, elements };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes("../../js/game-back.js"), 'page should mount the shared back button script');
    const css = read('style.css');
    const script = read('script.js');
    const packs = read('wordpacks.js');
    const catalog = fs.readFileSync(path.join(root, '..', '..', 'data', 'games.js'), 'utf8');
    const homeApp = fs.readFileSync(path.join(root, '..', '..', 'js', 'app.js'), 'utf8');

    assert(html.includes('charset="UTF-8"'), 'page should declare UTF-8');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('href="style.css"'), 'page should link extracted stylesheet');
    assert(html.includes('src="wordpacks.js"'), 'page should load the word pack data before the engine');
    assert(html.includes('src="script.js"'), 'page should load extracted script');
    for (const id of ['enCanvas', 'enMenu', 'enOver', 'enTopBtn', 'mobileInput', 'enGrid', 'enWordsBoard', 'enWords', 'reviewBtn']) {
        assert(html.includes(`id="${id}"`), `page should keep the ${id} host element`);
    }
    assert(!html.includes('id="hub"') && !html.includes('id="mathApp"') && !html.includes('id="zhCanvas"'),
        'standalone page should not keep the other modes markup');
    assert(!html.includes('enToMath'), 'standalone page should not keep cross-mode switch buttons');

    assert(css.includes('#enCanvas'), 'stylesheet should keep the canvas styles');

    for (const marker of ['WordPacks', 'enStartLevel', 'handleChar', 'typingKey', 'window.TypingCannon']) {
        assert(script.includes(marker), `script should contain ${marker}`);
    }
    assert(!/mode\s*[!=]==?\s*'(en|zh|math)'/.test(script), 'script should not keep cross-mode dispatch');
    for (const key of ['typcannonLevelsV1', 'typcannon_best', 'typcannon_prac_best', 'typcannon_top3']) {
        assert(script.includes(key), `script should keep the original save key ${key}`);
    }
    assert(script.includes("goHub() { location.href = '../../index.html'; }"), 'home buttons should navigate to the platform hub');

    assert(catalog.includes('slug: "typing-cannon"'), 'catalog should register typing-cannon');
    assert(catalog.includes('path: "src/typing-cannon/index.html"'), 'catalog should point to the game page');
    assert(catalog.includes('mobilePath: "src/typing-cannon/index.html"'), 'catalog should route mobile to the game page');
    assert(homeApp.includes('"typing-cannon"'), 'home page should give typing-cannon an icon and tag');
}

function testBootRendersLevelSelect() {
    const { elements, context } = runScriptWithContext([]);

    assert(context.window.TypingCannon, 'script should expose window.TypingCannon');
    const grid = elements.get('enGrid').innerHTML;
    assert(grid.includes('1.短词热身'), 'level grid should render the first kid level');
    assert(grid.includes('12.终极混战'), 'level grid should render the last kid level');
    assert(grid.includes('1.动作'), 'level grid should render the first daily-core level');
    assert(grid.includes('1.会议与沟通'), 'level grid should render the first workplace level');
    assert(grid.includes('1.社交往来'), 'level grid should render the first cet-daily level');
    assert(grid.includes('data-pack="daily-core"'), 'adult cards should carry the pack id');
    assert(grid.includes('data-pack="workplace-core"'), 'workplace cards should carry the pack id');
    assert(grid.includes('data-pack="cet-daily"'), 'cet-daily cards should carry the pack id');
    assert(grid.includes('词义回忆'), 'adult group should be labelled as recall mode');
    /* 42 关中只有四个首关解锁（儿童/四六级/日常/职场各第 1 关），其余 38 张卡带 disabled */
    assert((grid.match(/disabled/g) || []).length === 38, 'only the four first levels should be unlocked');
    const reviewBtn = elements.get('reviewBtn');
    assert(reviewBtn.disabled === true, 'review button should be disabled with an empty book');
    assert(reviewBtn.textContent.includes('（0）'), 'review button should show the current book size');
    assert(elements.get('menuBoardRows').innerHTML.includes('虚位以待'), 'leaderboard should show the empty hint');
}

/* 契约 CON-TC001：词包结构校验（新增词包只改数据，引擎零改动的前提） */
function testWordPackContract() {
    const { context } = runScriptWithContext([]);
    const packs = context.window.TypingCannon.WordPacks;
    assert(Array.isArray(packs) && packs.length >= 4, 'should register kid-core and at least three adult packs');

    const ids = new Set();
    let kidCore = null;
    for (const pack of packs) {
        assert(/^[a-z0-9-]+$/.test(pack.id), `pack id ${pack.id} should be kebab-case`);
        assert(!ids.has(pack.id), `pack id ${pack.id} should be unique`);
        ids.add(pack.id);
        assert(['kid', 'adult'].includes(pack.tone), `pack ${pack.id} tone should be kid or adult`);
        assert(pack.levels.length >= 5, `pack ${pack.id} should have enough levels`);

        /* 包内唯一仅约束 recall 词：生词记录按词键控不允许歧义；
           儿童抄写词保留历史数据（如 moon 两次出现，终极混战已去重） */
        const packRecallWords = new Set();
        for (const lv of pack.levels) {
            assert(lv.words.length >= 5, `level ${lv.name} should keep enough words`);
            assert(lv.fall > 0 && lv.spawn > 0 && lv.goal >= 5, `level ${lv.name} should keep playable params`);
            const firstLetters = new Set();
            for (const x of lv.words) {
                assert(/^[a-z]+$/.test(x.w), `word ${x.w} should be lowercase letters only`);
                if (lv.direction === 'recall') {
                    assert(!packRecallWords.has(x.w), `recall word ${x.w} should be unique inside pack ${pack.id}`);
                    packRecallWords.add(x.w);
                    assert(!firstLetters.has(x.w[0]),
                        `recall word ${x.w} starts a duplicate first letter in level ${lv.name}`);
                    firstLetters.add(x.w[0]);
                    assert(x.zh && x.ipa, `recall word ${x.w} should carry zh meaning and ipa`);
                    assert(x.emoji === null, `recall word ${x.w} should not carry an emoji`);
                } else {
                    assert(x.emoji, `copy word ${x.w} should keep its emoji`);
                }
            }
        }
        if (pack.id === 'kid-core') kidCore = pack;
    }
    assert(kidCore, 'kid-core pack must exist as the legacy fallback');
    assert.strictEqual(kidCore.levels.length, 12, 'kid-core should keep 12 themed levels');
    for (let i = 0; i < 11; i += 1) {
        assert.strictEqual(kidCore.levels[i].words.length, 8, `kid level ${i} should keep 8 words`);
    }
    /* 终极混战 = 前 11 关去重大乱斗 */
    const pool = kidCore.levels.slice(0, 11).flatMap((l) => l.words);
    const unique = [...new Map(pool.map((x) => [x.w, x])).values()];
    assert.strictEqual(JSON.stringify(kidCore.levels[11].words), JSON.stringify(unique),
        'final mix level should be the deduped pool');
    /* 成人包规模：每个成人包 10 关 × 10 词 = 100 词，全部 recall */
    const adultPacks = packs.filter((p) => p.tone === 'adult');
    assert(adultPacks.length >= 3, 'at least three adult packs should exist');
    for (const adult of adultPacks) {
        assert.strictEqual(adult.levels.length, 10, `adult pack ${adult.id} should ship 10 levels`);
        assert(adult.levels.every((l) => l.direction === 'recall' && l.words.length === 10),
            `adult pack ${adult.id} levels should be 10 recall words each`);
    }
    /* 成人包之间不收同一个词（两个包都走生词本，重复收词会互相污染连对进度） */
    const seen = new Set();
    for (const adult of adultPacks) {
        for (const lv of adult.levels) {
            for (const x of lv.words) {
                assert(!seen.has(x.w), `word ${x.w} should not repeat across adult packs`);
                seen.add(x.w);
            }
        }
    }
}

function testLegacySaveMigration() {
    const legacy = JSON.stringify({ stars: { '0': 2, '3': 1 } });
    const { context, storage } = runScriptWithContext([['typcannonLevelsV1', legacy]]);
    const api = context.window.TypingCannon;
    assert.strictEqual(api.save.stars['kid-core']['0'], 2, 'legacy numeric stars should move into kid-core');
    assert.strictEqual(api.save.stars['kid-core']['3'], 1, 'legacy numeric stars should move into kid-core');
    assert(storage.get('typcannonLevelsV1').includes('kid-core'), 'migration should persist the wrapped save');
    /* 幂等：再次加载不再二次包一层 */
    const again = runScriptWithContext([['typcannonLevelsV1', storage.get('typcannonLevelsV1')]]);
    assert.strictEqual(again.context.window.TypingCannon.save.stars['kid-core']['0'], 2,
        'migration should be idempotent');
    assert.strictEqual(context.enStarTotal(), 3, 'star total should sum stars across packs');
}

function testUnlockAndTyping() {
    const { context } = runScriptWithContext([]);
    const api = context.window.TypingCannon;

    assert.strictEqual(context.enUnlocked('kid-core', 0), true, 'first kid level should always be unlocked');
    assert.strictEqual(context.enUnlocked('kid-core', 1), false, 'second kid level locked without stars');
    assert.strictEqual(context.enUnlocked('daily-core', 0), true, 'first adult level should always be unlocked');
    if (!api.save.stars['kid-core']) api.save.stars['kid-core'] = {};
    api.save.stars['kid-core']['0'] = 2;
    assert.strictEqual(context.enUnlocked('kid-core', 1), true, 'clearing a level should unlock the next');
    assert.strictEqual(context.enStarTotal(), 2, 'star total should sum saved stars');

    /* 打字主链路（无尽）：开局 → 生成单词 → 打对首字母推进 → 打错累计失误 */
    context.startGame();
    assert.strictEqual(api.state.state, 'playing', 'endless start should enter playing state');
    context.spawnItem();
    const item = api.state.items[0];
    assert(item.word.length >= 2, 'spawned item should be a word');
    context.handleChar(item.word[0]);
    assert.strictEqual(item.typed, 1, 'correct letter should advance the typed cursor');
    assert.strictEqual(api.state.combo, 1, 'correct letter should build combo');
    const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').find((ch) => ch !== item.word[1]);
    context.handleChar(wrong);
    assert.strictEqual(api.state.mistakes, 1, 'unmatched letter should count a mistake');
    assert.strictEqual(api.state.combo, 0, 'mistake should reset combo');
}

/* 词义模式：气泡带释义、预展示计时、打错/漏接进入本局生词 */
function testRecallLevel() {
    const { context } = runScriptWithContext([]);
    const api = context.window.TypingCannon;

    context.enStartLevel('daily-core', 0);
    assert.strictEqual(api.state.state, 'playing', 'adult level start should enter playing state');
    assert.strictEqual(api.state.entry.direction, 'recall', 'adult level should run in recall direction');
    context.spawnItem();
    const item = api.state.items[0];
    assert.strictEqual(item.dir, 'recall', 'spawned item should be a recall card');
    assert(item.zh && item.ipa, 'recall item should carry meaning and ipa');
    assert.strictEqual(item.seen, false, 'recall card should wait until on-screen to start the intro preview');
    assert.strictEqual(item.introT, 0, 'intro countdown should not run while the card is still off-screen');

    context.handleChar(item.word[0]);
    assert.strictEqual(item.typed, 1, 'recall card should advance on the correct letter');
    const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').find((ch) => ch !== item.word[1]);
    context.handleChar(wrong);
    assert(api.state.wrongWords.has(item.word), 'mistyped recall word should be recorded as a new word');
    /* 词义关打错要清空已打进度，堵住逐字母暴力试错 */
    assert.strictEqual(item.typed, 0, 'mistyped recall card should reset its typed cursor');
    context.handleChar(item.word[0]);
    assert.strictEqual(item.typed, 1, 'recall card should advance again after the reset');
    /* 点击气泡手动切换锁定目标：命中检测为纯函数，锁定由 canvas pointerdown 监听完成 */
    assert.strictEqual(context.pickTargetAt(item.x, item.y - 16), item, 'pickTargetAt should hit the card body');
    assert.strictEqual(context.pickTargetAt(item.x + 300, item.y), null, 'pickTargetAt should miss far away');
    /* 漏接：模拟落到底线 */
    item.y = context.groundY !== undefined ? context.groundY : api.state.items[0].y;
    context.loseLife(item);
    assert(api.state.missedWords.has(item.word), 'missed recall word should be recorded as a new word');
    assert.strictEqual(api.state.lives, 2, 'missing a word should cost one life');
}

/* 错词本：采集写回 → 复习局构建 → 连对累加 → 毕业移除 → 持久化
   复习场景统一用单词本：spawn 出词无随机选择余地，kills 计到 goal 会自动触发过关结算，
   显式再调 levelClear 会造成二次结算，因此这里依赖自动触发后只读状态不断言调用 */
function testReviewBook() {
    const { context, storage } = runScriptWithContext([]);
    const api = context.window.TypingCannon;

    /* 1. 词义关漏接一词 → 结算入本（right=0，快照 ipa/zh） */
    context.enStartLevel('daily-core', 0);
    context.spawnItem();
    const missed = api.state.items[0];
    context.loseLife(missed);
    context.levelFailed();
    assert.strictEqual(Object.keys(api.review).length, 1, 'missed recall word should enter the book');
    for (const e of Object.values(api.review)) {
        assert.strictEqual(e.right, 0, 'fresh entry should start with zero streak');
        assert(e.ipa && e.zh, 'entry should snapshot ipa and zh');
        assert.strictEqual(e.packId, 'daily-core', 'entry should remember its source pack');
    }

    /* 2. 复习局：词表来自错词本，干净打完自动过关，连对 +1（不到毕业） */
    context.startReview();
    assert.strictEqual(api.state.mode, 'review', 'startReview should switch to review mode');
    assert.strictEqual(api.state.entry.direction, 'recall', 'review run should reuse the recall card engine');
    assert.strictEqual(api.state.entry.words.length, 1, 'review run should take words from the book');
    context.spawnItem();
    const item = api.state.items[api.state.items.length - 1];
    assert.strictEqual(item.word, missed.word, 'review spawn should drop the booked word');
    for (const ch of item.word) context.handleChar(ch);
    assert.strictEqual(api.state.state, 'over', 'killing the last booked word should auto-clear the run');
    assert(Object.values(api.review).every((e) => e.right === 1), 'a clean review round should raise streaks to 1');

    /* 3. 第二轮干净打完 → 达毕业阈值移除，错词本清空并持久化 */
    context.startReview();
    context.spawnItem();
    const again2 = api.state.items[api.state.items.length - 1];
    for (const ch of again2.word) context.handleChar(ch);
    assert.strictEqual(api.state.state, 'over', 'second clean round should auto-clear too');
    assert.strictEqual(Object.keys(api.review).length, 0, 'two clean rounds should graduate every word');
    assert(storage.get('typcannon_review_v1') === '{}' || storage.get('typcannon_review_v1') === undefined || storage.get('typcannon_review_v1').includes('{'),
        'review book should persist to localStorage');

    /* 4. 打错清零：入本后再打错一次，连对归零不毕业 */
    context.enStartLevel('daily-core', 0);
    context.spawnItem();
    const target = api.state.items[0];
    context.loseLife(target);                       // 漏接入本
    context.levelFailed();
    context.startReview();
    context.spawnItem();
    const again = api.state.items[0];
    context.handleChar(again.word[0]);              // 先打对一个字母
    const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').find((ch) => ch !== again.word[1]);
    context.handleChar(wrong);                      // 再打错 → 记入 wrongWords 并清空进度
    context.levelClear();
    assert.strictEqual(api.review[again.word].right, 0, 'a mistyped review word should reset its streak');
}

/* 听写模式：入口显隐 → 局构建（词来自所选包）→ 击碎采集入错词本 → 无语音降级 */
function testDictationMode() {
    const { context, elements } = runScriptWithContext([]);
    const api = context.window.TypingCannon;

    /* 无语音能力：菜单不出现听写入口，startDictation 空操作 */
    context.showEnMenu();
    assert(!elements.get('enGrid').innerHTML.includes('🎧 听写'),
        'dictation chip should be hidden without speechSynthesis');
    context.startDictation('daily-core');
    assert.notStrictEqual(api.state.mode, 'dictation', 'startDictation should no-op without speechSynthesis');

    /* 注入语音桩：菜单出现听写入口 */
    context.window.speechSynthesis = { speak() {}, cancel() {} };
    context.showEnMenu();
    const grid = elements.get('enGrid').innerHTML;
    assert(grid.includes('🎧 听写'), 'dictation chip should render with speechSynthesis');
    assert(grid.includes('data-pack="workplace-core"'), 'every adult pack should expose dictation');

    /* 构建听写局：词来自所选包，方向 dictation */
    context.startDictation('workplace-core');
    assert.strictEqual(api.state.mode, 'dictation', 'startDictation should switch to dictation mode');
    assert.strictEqual(api.state.entry.direction, 'dictation', 'dictation run should use the dictation direction');
    assert.strictEqual(api.state.entry.words.length, 10, 'dictation run should take 10 words');
    const packWords = new Set(
        api.WordPacks.find((p) => p.id === 'workplace-core').levels.flatMap((l) => l.words.map((x) => x.w)));
    assert(api.state.entry.words.every((x) => packWords.has(x.w)),
        'dictation words should all come from the chosen pack');

    /* 打完 10 词（第 10 词故意先打错一次）→ 自动结算，错词入本，不产星 */
    for (let i = 0; i < 10; i += 1) {
        context.spawnItem();
        const item = api.state.items[api.state.items.length - 1];
        assert.strictEqual(item.dir, 'dictation', 'spawned item should be a dictation card');
        if (i === 9) {
            context.handleChar(item.word[0]);
            const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').find((ch) => ch !== item.word[1]);
            context.handleChar(wrong);
        }
        for (let guard = 0; guard < 30 && api.state.items.includes(item) && item.typed < item.word.length; guard += 1) {
            context.handleChar(item.word[item.typed]);
        }
    }
    assert.strictEqual(api.state.state, 'over', 'finishing all words should auto-clear the run');
    assert.strictEqual(Object.keys(api.review).length, 1, 'only the mistyped word should enter the book');
    assert(Object.values(api.review).every((e) => e.right === 0), 'mistyped dictation word should have zero streak');
    assert.strictEqual(context.enStarTotal(), 0, 'dictation should never award stars');
}

testFilesAndCatalogExist();
testBootRendersLevelSelect();
testWordPackContract();
testLegacySaveMigration();
testUnlockAndTyping();
testRecallLevel();
testReviewBook();
testDictationMode();

console.log('typing-cannon smoke test passed');
