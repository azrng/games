const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* 参照 lights-out / pattern-quest 的 vm 沙箱模式：Map 桩 localStorage + 最小 document 桩，直接整文件执行 script.js */
function runScriptWithContext() {
    const storage = new Map();
    const elements = new Map();

    function createElement(id) {
        const element = {
            id,
            textContent: '',
            hidden: false,
            disabled: false,
            type: '',
            dataset: {},
            style: {},
            className: '',
            children: [],
            classList: {
                add() {},
                remove() {},
                toggle() {}
            },
            addEventListener() {},
            appendChild(child) {
                this.children.push(child);
            },
            replaceChildren(...children) {
                this.children = children;
            },
            setAttribute(name, value) {
                this[name] = value;
            },
            removeAttribute(name) {
                delete this[name];
            }
        };
        elements.set(id, element);
        return element;
    }

    /* 与 script.js 启动时 getElementById 的清单保持一致 */
    [
        'level-text',
        'flips-text',
        'pairs-text',
        'best-text',
        'grid',
        'tip-bar',
        'tip-close-btn',
        'restart-btn',
        'levels-btn',
        'win-modal',
        'result-stars',
        'result-flips',
        'result-best',
        'replay-btn',
        'next-btn',
        'level-modal',
        'level-grid',
        'close-levels-btn'
    ].forEach(createElement);

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        createDocumentFragment() {
            return { children: [], appendChild(child) { this.children.push(child); } };
        },
        getElementById(id) {
            return elements.get(id) || null;
        },
        addEventListener() {}
    };

    const context = {
        window: {
            localStorage: {
                getItem(key) {
                    return storage.has(key) ? storage.get(key) : null;
                },
                setItem(key, value) {
                    storage.set(key, String(value));
                }
            }
        },
        document,
        Math,
        setTimeout() {
            return 1;
        },
        clearTimeout() {}
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.MemoryApi, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('../js/game-back.js'), 'page should mount the shared back button script');
    assert(
        html.indexOf('src="script.js"') >= 0 && html.indexOf('src="script.js"') < html.indexOf('../js/game-back.js'),
        'page should load script.js before the shared back button script'
    );
    assert(html.includes('<title>记忆翻牌 - 游戏平台</title>'), 'page title should follow the platform convention');
    assert(html.includes('id="grid"'), 'page should render the card grid host');
    assert(html.includes('id="tip-bar"'), 'page should include the first-visit how-to-play tip bar');
    assert(css.includes('--mm-'), 'style should be self-contained with mm-prefixed variables');
    assert(css.includes('preserve-3d'), 'cards should flip with a real 3D transform');
    assert(css.includes('backface-visibility'), 'card faces should hide the reverse side');
    assert(css.includes('prefers-reduced-motion'), 'style should degrade animations for reduced motion');
    /* 移动端页头顶部留白 = max(16px, safe-area) + 44px ≥ 56px，避让左上角悬浮返回按钮 */
    assert(css.includes('max(16px, env(safe-area-inset-top)) + 44px'), 'header should clear the floating back button');
    assert(script.includes('buildDeck'), 'game should build decks from theme pools');
    assert(script.includes('evaluatePair'), 'game should decide matches through evaluatePair');
    assert(catalog.includes('slug: "memory-match"'), 'catalog should register memory-match');
    assert(catalog.includes('mobilePath: "src/memory-match/index.html"'), 'catalog should route mobile to memory-match');
}

function testThemePool() {
    const { api } = runScriptWithContext();

    assert(Array.isArray(api.THEMES) && api.THEMES.length >= 5, 'theme pool should contain at least 5 themes');
    const keys = new Set();
    for (const theme of api.THEMES) {
        assert(typeof theme.key === 'string' && theme.key.length > 0, 'each theme should declare a key');
        assert(typeof theme.name === 'string' && theme.name.length > 0, 'each theme should declare a display name');
        assert(Array.isArray(theme.emoji) && theme.emoji.length >= 18, `theme ${theme.key} should offer at least 18 emojis`);
        assert.strictEqual(
            new Set(theme.emoji).size,
            theme.emoji.length,
            `theme ${theme.key} should not repeat emojis`
        );
        keys.add(theme.key);
    }
    assert.strictEqual(keys.size, api.THEMES.length, 'theme keys should be unique');
}

function testBuildDeckContract() {
    const { api } = runScriptWithContext();

    /* 12 关 × 多种子：长度、配对完整性、同种子复现 */
    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        const theme = api.themeForLevel(level);
        for (const seed of [api.levelSeed(level), 12345, 987654321]) {
            const deck = api.buildDeck(theme.key, config.pairs, seed);
            assert.strictEqual(deck.length, config.pairs * 2, `level ${level}: deck size should be 2 × pairs`);

            const countByPair = new Map();
            const emojiToPair = new Map();
            for (const card of deck) {
                countByPair.set(card.pairId, (countByPair.get(card.pairId) || 0) + 1);
                const seen = emojiToPair.get(card.emoji);
                if (seen === undefined) {
                    emojiToPair.set(card.emoji, card.pairId);
                } else {
                    assert.strictEqual(seen, card.pairId, `level ${level}: one emoji should never map to two pairs`);
                }
            }
            assert.strictEqual(countByPair.size, config.pairs, `level ${level}: pair count should match config`);
            for (const count of countByPair.values()) {
                assert.strictEqual(count, 2, `level ${level}: every pairId should appear exactly twice`);
            }
            assert.strictEqual(emojiToPair.size, config.pairs, `level ${level}: card faces should have no duplicate pairs`);

            const again = api.buildDeck(theme.key, config.pairs, seed);
            assert.strictEqual(JSON.stringify(again), JSON.stringify(deck), 'same seed should reproduce the same deck');
        }
    }

    /* 不同种子多数分布不同 */
    let differ = 0;
    const trials = 8;
    for (let t = 0; t < trials; t += 1) {
        const base = 1000 + t * 7919;
        const a = api.buildDeck('animals', 8, base);
        const b = api.buildDeck('animals', 8, base + 1);
        if (JSON.stringify(a) !== JSON.stringify(b)) differ += 1;
    }
    assert(differ >= trials - 2, 'different seeds should mostly produce different arrangements');

    /* 越界 pairs 兜底：按主题池上限收敛，每张卡仍是完整一对 */
    const animals = api.THEMES.find((theme) => theme.key === 'animals');
    const capped = api.buildDeck('animals', 999, 7);
    assert.strictEqual(capped.length, animals.emoji.length * 2, 'oversized pairs should clamp to the pool size');
    const tiny = api.buildDeck('animals', 0, 7);
    assert.strictEqual(tiny.length, 2, 'degenerate pairs should clamp to one pair');
}

function testEvaluatePair() {
    const { api } = runScriptWithContext();

    const catA = { emoji: '🐱', pairId: 3 };
    const catB = { emoji: '🐱', pairId: 3 };
    const dog = { emoji: '🐶', pairId: 4 };
    assert.strictEqual(api.evaluatePair(catA, catB), true, 'same pairId should match');
    assert.strictEqual(api.evaluatePair(catA, dog), false, 'different pairId should not match');
    assert.strictEqual(api.evaluatePair(null, catB), false, 'missing first card should not match');
    assert.strictEqual(api.evaluatePair(catA, null), false, 'missing second card should not match');
    assert.strictEqual(api.evaluatePair(undefined, undefined), false, 'both missing should not match');
}

function testStarRatingBoundaries() {
    const { api } = runScriptWithContext();

    /* 6 对：≤12 三星、≤15 两星、≥16 一星 */
    assert.strictEqual(api.starRating(6, 6), 3, 'perfect play should earn 3 stars');
    assert.strictEqual(api.starRating(12, 6), 3, 'flips at pairs × 2 should stay 3 stars');
    assert.strictEqual(api.starRating(13, 6), 2, 'flips just above pairs × 2 should drop to 2 stars');
    assert.strictEqual(api.starRating(15, 6), 2, 'flips at pairs × 2.5 should keep 2 stars');
    assert.strictEqual(api.starRating(16, 6), 1, 'flips beyond pairs × 2.5 should drop to 1 star');

    /* 15 对：×2.5 = 37.5，37 两星、38 一星 */
    assert.strictEqual(api.starRating(30, 15), 3);
    assert.strictEqual(api.starRating(37, 15), 2);
    assert.strictEqual(api.starRating(38, 15), 1);

    /* 18 对边界 */
    assert.strictEqual(api.starRating(36, 18), 3);
    assert.strictEqual(api.starRating(45, 18), 2);
    assert.strictEqual(api.starRating(46, 18), 1);
}

function testLevelProgression() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelCount(), 12, 'game should ship exactly 12 levels');

    /* 关卡卡阵递进表：与规格逐关一致 */
    const expected = [
        [6, 3], [6, 3],
        [8, 4], [8, 4],
        [10, 4], [10, 4],
        [12, 4], [12, 4],
        [15, 5], [15, 5],
        [18, 6], [18, 6]
    ];
    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        assert.strictEqual(config.level, level);
        assert.strictEqual(config.pairs, expected[level - 1][0], `level ${level}: pairs should follow the spec table`);
        assert.strictEqual(config.cols, expected[level - 1][1], `level ${level}: cols should follow the spec table`);
        assert.strictEqual(config.rows, (config.pairs * 2) / config.cols, `level ${level}: rows should fill the grid`);
    }

    /* 越界关卡请求按边界关卡兜底 */
    assert.strictEqual(api.levelConfig(0).level, 1);
    assert.strictEqual(api.levelConfig(0).pairs, 6);
    assert.strictEqual(api.levelConfig(99).level, 12);
    assert.strictEqual(api.levelConfig(99).pairs, 18);

    /* 主题按关轮换：12 关覆盖全部主题 */
    const rotated = new Set();
    for (let level = 1; level <= api.levelCount(); level += 1) {
        rotated.add(api.themeForLevel(level).key);
    }
    const allKeys = api.THEMES.map((theme) => theme.key);
    assert.deepStrictEqual([...rotated].sort(), [...allKeys].sort(), 'level rotation should cover every theme');
}

function testStorageRules() {
    const { api, storage } = runScriptWithContext();

    /* 解锁进度只增不减，无存档默认第 1 关 */
    assert.strictEqual(api.loadUnlockedLevel(), 1, 'fresh save should start at level 1');
    api.saveUnlockedLevel(5);
    api.saveUnlockedLevel(2);
    assert.strictEqual(storage.get('memory-match-unlocked-level'), '5', 'unlock level should never regress');
    assert.strictEqual(api.loadUnlockedLevel(), 5);

    /* 星级保留历史最大值 */
    assert.strictEqual(api.loadStars(3), 0, 'unplayed level should have 0 stars');
    api.saveStars(3, 2);
    api.saveStars(3, 3);
    api.saveStars(3, 1);
    assert.strictEqual(storage.get('memory-match-stars-3'), '3', 'stars should keep the maximum');
    assert.strictEqual(api.loadStars(3), 3);

    /* 最佳成绩保留历史最少翻牌次数 */
    assert.strictEqual(api.loadBest(4), 0, 'unplayed level should have no best record');
    api.saveBest(4, 20);
    api.saveBest(4, 14);
    api.saveBest(4, 18);
    assert.strictEqual(storage.get('memory-match-best-4'), '14', 'best flips should keep the minimum');
    assert.strictEqual(api.loadBest(4), 14);

    /* 全部存储键遵循 memory-match- 前缀约定 */
    for (const key of storage.keys()) {
        assert(key.indexOf('memory-match-') === 0, `storage key ${key} should use the memory-match- prefix`);
    }
}

testFilesAndCatalogExist();
testThemePool();
testBuildDeckContract();
testEvaluatePair();
testStarRatingBoundaries();
testLevelProgression();
testStorageRules();

console.log('memory match smoke test passed');
