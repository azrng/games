const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function assertSameJSON(actual, expected) {
    assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
}

function loadApi() {
    const storage = new Map();
    const elements = new Map();

    function createElement(id) {
        const listeners = {};
        const element = {
            id,
            textContent: '',
            hidden: false,
            disabled: false,
            dataset: {},
            style: {},
            className: '',
            classList: {
                add() {},
                remove() {},
                toggle() {}
            },
            addEventListener(type, handler) {
                listeners[type] = handler;
            },
            appendChild() {},
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
        'size-label',
        'steps-text',
        'timer-text',
        'best-steps',
        'best-time',
        'board',
        'size-panel',
        'result-modal',
        'result-size',
        'result-steps',
        'result-time',
        'result-best-steps',
        'result-best-time',
        'undo-btn',
        'shuffle-btn',
        'reset-btn',
        'size-btn',
        'play-again-btn',
        'change-size-btn'
    ].forEach(createElement);

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        createDocumentFragment() {
            return createElement(`fragment-${elements.size}`);
        },
        querySelectorAll(selector) {
            if (selector === '.size-card') {
                return [
                    { dataset: { size: '3' }, addEventListener() {} },
                    { dataset: { size: '4' }, addEventListener() {} },
                    { dataset: { size: '5' }, addEventListener() {} }
                ];
            }
            return [];
        },
        getElementById(id) {
            return elements.get(id) || null;
        },
        addEventListener() {}
    };

    const context = {
        window: {
            innerWidth: 390,
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
        Date,
        setInterval() {
            return 1;
        },
        clearInterval() {},
        setTimeout(callback) {
            callback();
            return 1;
        },
        confirm() {
            return true;
        }
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.SlidingPuzzle, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('user-scalable=no'), 'mobile viewport should disable scaling');
    assert(html.includes('id="board"'), 'page should include board host');
    assert(html.includes('data-size="3"'), 'page should provide 3x3 option');
    assert(html.includes('data-size="4"'), 'page should provide 4x4 option');
    assert(html.includes('data-size="5"'), 'page should provide 5x5 option');
    assert(css.includes('display: grid'), 'board should use CSS Grid');
    assert(!script.includes('<canvas'), 'game should not depend on Canvas');
    assert(catalog.includes('slug: "sliding-puzzle"'), 'catalog should register sliding puzzle');
    assert(catalog.includes('mobilePath: "sliding-puzzle/index.html"'), 'catalog should route mobile to sliding puzzle');
}

function testPuzzleRules() {
    const { api } = loadApi();

    assertSameJSON(api.createSolvedBoard(3), [1, 2, 3, 4, 5, 6, 7, 8, 0]);
    assert.strictEqual(api.isSolved([1, 2, 3, 4, 5, 6, 7, 8, 0]), true);
    assert.strictEqual(api.isSolved([1, 2, 3, 4, 5, 6, 7, 0, 8]), false);
    assert.strictEqual(api.canMove([1, 2, 3, 4, 5, 6, 7, 0, 8], 8, 3), true);
    assert.strictEqual(api.canMove([1, 2, 3, 4, 5, 6, 7, 0, 8], 1, 3), false);

    const moved = api.moveTile([1, 2, 3, 4, 5, 6, 7, 0, 8], 8, 3);
    assertSameJSON(moved, [1, 2, 3, 4, 5, 6, 7, 8, 0]);
}

function testShuffleAndRecords() {
    const { api, storage } = loadApi();
    const board = api.shuffleBoard(4, 90);

    assert.strictEqual(board.length, 16);
    assert.strictEqual(api.isSolved(board), false, 'shuffle should not return solved board');
    assert.strictEqual(api.isSolvable(board, 4), true, 'shuffle should produce solvable board');

    api.saveRecord(4, { steps: 80, seconds: 110 });
    assert.strictEqual(storage.get('sliding-puzzle-4-best-steps'), '80');
    assert.strictEqual(storage.get('sliding-puzzle-4-best-time'), '110');
    assertSameJSON(api.loadRecord(4), { bestSteps: 80, bestTime: 110 });
    api.saveRecord(4, { steps: 90, seconds: 120 });
    assertSameJSON(api.loadRecord(4), { bestSteps: 80, bestTime: 110 });
}

testFilesAndCatalogExist();
testPuzzleRules();
testShuffleAndRecords();

console.log('sliding puzzle smoke test passed');
