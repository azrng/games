const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function runScriptWithContext() {
    const storage = new Map();
    const elements = new Map();

    function createElement(id) {
        const element = {
            id,
            textContent: '',
            hidden: false,
            disabled: false,
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

    [
        'level-text',
        'steps-text',
        'min-steps-text',
        'best-text',
        'grid',
        'restart-btn',
        'hint-btn',
        'hint-count',
        'levels-btn',
        'win-modal',
        'result-stars',
        'result-steps',
        'result-min',
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
    return { api: context.window.LightsOut, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes("../../js/game-back.js"), 'page should mount the shared back button script');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('id="grid"'), 'page should render a light grid host');
    assert(html.includes('id="hint-btn"'), 'page should include hint control');
    assert(css.includes('display: grid'), 'grid should use CSS Grid');
    assert(script.includes('generateLevel'), 'game should generate levels from reverse presses');
    assert(catalog.includes('slug: "lights-out"'), 'catalog should register lights-out');
    assert(catalog.includes('mobilePath: "src/lights-out/index.html"'), 'catalog should route mobile to lights-out');
}

function testToggleBehaviour() {
    const { api } = runScriptWithContext();
    const size = 3;
    const dark = new Array(size * size).fill(false);

    const once = api.toggleAt(dark, size, 4);
    assert.deepStrictEqual(
        once,
        [false, true, false, true, true, true, false, true, false],
        'pressing the center should flip a plus shape'
    );

    const corner = api.toggleAt(dark, size, 0);
    assert.deepStrictEqual(
        corner,
        [true, true, false, true, false, false, false, false, false],
        'corner press should only flip in-board neighbours'
    );

    const twice = api.toggleAt(once, size, 4);
    assert.deepStrictEqual(twice, dark, 'pressing the same cell twice should be identity');
}

function testGeneratedLevelsAreSolvable() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= 15; level += 1) {
        const config = api.levelConfig(level);
        const random = api.createSeededRandom(api.levelSeed(level));
        const generated = api.generateLevel(config.size, config.presses, random);

        assert(!api.isAllLit(generated.board), 'generated board should not start solved');
        /* 兜底路径可能追加一次按压，因此允许等于或多一 */
        assert(
            generated.scrambleSet.length === config.presses || generated.scrambleSet.length === config.presses + 1,
            'scramble set size should match config (or +1 via fallback)'
        );
        assert.strictEqual(new Set(generated.scrambleSet).size, generated.scrambleSet.length, 'scramble cells should be distinct');

        let board = generated.board;
        for (const index of generated.scrambleSet) {
            board = api.toggleAt(board, config.size, index);
        }
        assert(api.isAllLit(board), 'pressing the scramble set should light everything');
    }
}

function testLevelProgression() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelConfig(1).size, 3);
    assert.strictEqual(api.levelConfig(5).size, 4);
    assert.strictEqual(api.levelConfig(10).size, 5);
    assert(api.levelConfig(2).presses > api.levelConfig(1).presses, 'presses should grow with level');
    assert(api.levelConfig(30).presses <= 24, 'presses should stay below cell count');
}

function testStarRatingAndRecords() {
    const { api, storage } = runScriptWithContext();

    assert.strictEqual(api.starRating(5, 5), 3);
    assert.strictEqual(api.starRating(8, 5), 2);
    assert.strictEqual(api.starRating(9, 5), 1);

    api.saveBest(2, 12);
    api.saveBest(2, 9);
    api.saveBest(2, 20);
    assert.strictEqual(storage.get('lights-out-best-2'), '9', 'best steps should keep the minimum');

    api.saveUnlockedLevel(4);
    api.saveUnlockedLevel(3);
    assert.strictEqual(storage.get('lights-out-unlocked-level'), '4', 'unlock level should never regress');
}

testFilesAndCatalogExist();
testToggleBehaviour();
testGeneratedLevelsAreSolvable();
testLevelProgression();
testStarRatingAndRecords();

console.log('lights out smoke test passed');
