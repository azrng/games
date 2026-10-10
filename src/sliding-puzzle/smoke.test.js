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
            style: {
                setProperty(name, value) {
                    this[name] = value;
                }
            },
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
        'hint-btn',
        'hint-count',
        'result-stars',
        'shuffle-btn',
        'reset-btn',
        'size-btn',
        'play-again-btn',
        'change-size-btn',
        'confetti'
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
        clearTimeout() {},
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
    assert(html.includes("../js/game-back.js"), 'page should mount the shared back button script');
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
    assert(css.includes('@keyframes tileSlide'), 'tile moves should slide instead of teleporting');
    assert(css.includes('@keyframes solvedPulse'), 'solving should trigger a staggered tile wave');
    assert(css.includes('@keyframes confettiFall'), 'solving should celebrate with confetti');
    assert(css.includes('.tile.placed'), 'correctly placed tiles should get visual feedback');
    assert(css.includes('.tile.hint'), 'hinted tile should get a highlight style');
    assert(css.includes('.stars'), 'result modal should style star rating');
    assert(css.includes('prefers-reduced-motion'), 'decorative motion must respect reduced-motion');
    assert(html.includes('id="confetti"'), 'page should include a confetti layer');
    assert(html.includes('id="hint-btn"'), 'page should provide a hint button');
    assert(html.includes('id="result-stars"'), 'result modal should show star rating');
    assert(script.includes('computeHint'), 'script should expose a hint solver');
    assert(script.includes('--slide-x'), 'script should pass slide direction to CSS');
    assert(catalog.includes('slug: "sliding-puzzle"'), 'catalog should register sliding puzzle');
    assert(catalog.includes('mobilePath: "src/sliding-puzzle/index.html"'), 'catalog should route mobile to sliding puzzle');
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

// 校验提示对象形态：方块存在、坐标匹配、方向指向空格、目标格为空可移
function assertHintShape(api, board, size, hint) {
    assert(hint && typeof hint.tile === 'number' && hint.tile > 0, 'hint should reference a real tile');
    assert.strictEqual(board[hint.row * size + hint.col], hint.tile, 'hint row/col should match tile position');
    const emptyIndex = board.indexOf(0);
    const rowDiff = Math.floor(emptyIndex / size) - hint.row;
    const colDiff = (emptyIndex % size) - hint.col;
    const expected = rowDiff === -1 ? 'up' : rowDiff === 1 ? 'down' : colDiff === -1 ? 'left' : 'right';
    assert.strictEqual(hint.direction, expected, 'hint direction should point toward the empty cell');
    assert.strictEqual(api.canMove(board, hint.tile, size), true, 'hint should be a legal move (target cell empty)');
}

function testHintSolver3x3() {
    const { api } = loadApi();

    for (let round = 0; round < 20; round += 1) {
        let board = api.shuffleBoard(3, 24);
        let steps = 0;
        while (!api.isSolved(board) && steps < 40) {
            const hint = api.computeHint(board, 3);
            assert(hint, `round ${round}: IDA* should always find a hint on 3x3`);
            assertHintShape(api, board, 3, hint);
            board = api.moveTile(board, hint.tile, 3);
            assert.strictEqual(
                api.isSolvable(board, 3),
                true,
                `round ${round}: board should stay solvable after applying a hint step`
            );
            steps += 1;
        }
        assert.strictEqual(api.isSolved(board), true, `round ${round}: IDA* should solve 3x3 completely`);
        assert(steps <= 31, `round ${round}: 3x3 optimal solution should not exceed 31 moves`);
    }
}

function testHintLegalAllSizes() {
    const { api } = loadApi();

    [3, 4, 5].forEach((size) => {
        for (let round = 0; round < 5; round += 1) {
            const moves = size === 3 ? 24 : size === 4 ? 90 : 170;
            const board = api.shuffleBoard(size, moves);
            const hint = api.computeHint(board, size);
            assert(hint, `size ${size}: computeHint should return a hint`);
            assertHintShape(api, board, size, hint);
        }
    });
}

function testGreedy5x5NeverBreaksLocked() {
    const { api } = loadApi();

    const checkStep = (board, message) => {
        const locked = api.greedyLockedCells(board, 5);
        const hint = api.greedyHint(board, 5);
        if (!hint) {
            return null;
        }
        assert(!locked.includes(hint.row * 5 + hint.col), `${message}: greedy must not move a locked tile`);
        assert.strictEqual(api.canMove(board, hint.tile, 5), true, `${message}: greedy step should be legal`);
        return hint;
    };

    // 单步：随机打乱局面上贪心建议不破坏已归位块
    for (let round = 0; round < 5; round += 1) {
        const board = api.shuffleBoard(5, 170);
        const hint = checkStep(board, `single round ${round}`);
        assert(hint, `single round ${round}: greedy should suggest a step on fresh 5x5`);
    }

    // 连续：跟着贪心提示走完整局，全程不破坏已归位块且最终还原
    for (let round = 0; round < 2; round += 1) {
        let board = api.shuffleBoard(5, 170);
        let steps = 0;
        while (!api.isSolved(board) && steps < 300) {
            const hint = checkStep(board, `full round ${round} step ${steps}`);
            assert(hint, `full round ${round}: greedy path should stay available at step ${steps}`);
            board = api.moveTile(board, hint.tile, 5);
            steps += 1;
        }
        assert.strictEqual(api.isSolved(board), true, `full round ${round}: greedy should finish the 5x5`);
    }
}

function testStarRatingAndHintQuota() {
    const { api } = loadApi();

    assert.strictEqual(api.HINTS_PER_ROUND, 3, 'hint quota should match platform convention (3 per round)');
    assert.strictEqual(api.starRating(50, 50, false), 3, 'matching the best record earns 3 stars');
    assert.strictEqual(api.starRating(60, 50, false), 2, 'within 1.5x best earns 2 stars');
    assert.strictEqual(api.starRating(100, 50, false), 1, 'beyond 1.5x best earns 1 star');
    assert.strictEqual(api.starRating(30, 0, false), 3, 'first clear (no record) earns 3 stars');
    assert.strictEqual(api.starRating(50, 50, true), 2, 'hint usage caps stars one level down');
    assert.strictEqual(api.starRating(60, 50, true), 1);
    assert.strictEqual(api.starRating(100, 50, true), 1, 'one star is the floor even with hints');
}

testFilesAndCatalogExist();
testPuzzleRules();
testShuffleAndRecords();
testHintSolver3x3();
testHintLegalAllSizes();
testGreedy5x5NeverBreaksLocked();
testStarRatingAndHintQuota();

console.log('sliding puzzle smoke test passed');
