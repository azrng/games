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
        'mistakes-text',
        'empty-text',
        'grid',
        'palette',
        'feedback-text',
        'clear-btn',
        'restart-btn',
        'levels-btn',
        'win-modal',
        'result-stars',
        'result-mistakes',
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
    return { api: context.window.SudokuApi, storage };
}

/* (a) 文件与目录约定：页面元信息、脚本顺序、自包含样式、目录注册 */
function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes("../js/game-back.js"), 'page should mount the shared back button script');
    assert(html.includes('<title>儿童数独 - 游戏平台</title>'), 'page title should follow hub convention');
    assert(html.includes('id="grid"'), 'page should host the sudoku grid');
    assert(html.includes('id="palette"'), 'page should host the emoji palette');
    assert(
        html.indexOf('"script.js"') !== -1 && html.indexOf('"script.js"') < html.indexOf('"../js/game-back.js"'),
        'script.js should be loaded before the shared back button script'
    );

    const css = read('style.css');
    assert(css.includes('--sd-'), 'style should use the self-contained --sd- variable prefix');
    assert(css.includes('display: grid'), 'board should use CSS Grid');
    assert(css.includes('padding-top: calc(max(16px, env(safe-area-inset-top)) + 44px)'), 'header should avoid the floating back button');

    const script = read('script.js');
    assert(script.includes('generatePuzzle'), 'script should expose puzzle generation');
    assert(script.includes('windowObject.SudokuApi'), 'script should expose window.SudokuApi');

    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    assert(catalog.includes('slug: "mini-sudoku"'), 'catalog should register mini-sudoku');
    assert(catalog.includes('mobilePath: "src/mini-sudoku/index.html"'), 'catalog should route mobile to mini-sudoku');
}

/* (b) 12 关 × 2 种子：givens 与 solution 一致、唯一解、完整解合法、同种子可复现、总耗时 < 20 秒 */
function testGeneratedPuzzles() {
    const { api } = runScriptWithContext();
    const startedAt = Date.now();
    let generated = 0;

    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        for (const offset of [0, 1]) {
            const seed = (api.levelSeed(level) + offset * 987654321) >>> 0;
            const puzzle = api.generatePuzzle(level, seed);
            generated += 1;

            const replay = api.generatePuzzle(level, seed);
            assert.strictEqual(
                JSON.stringify(puzzle.givens),
                JSON.stringify(replay.givens),
                `level ${level} seed ${offset} should reproduce the same givens`
            );

            assert.strictEqual(puzzle.size, config.size, `level ${level} should use size ${config.size}`);

            /* givens 是挖洞后留下的提示格：数量 = 总格数 - 挖空数 */
            const total = config.size * config.size;
            assert.strictEqual(puzzle.givens.length, total - config.blanks, `level ${level} seed ${offset} should dig exactly ${config.blanks} cells`);
            const givenGrid = new Array(total).fill(0);
            for (const given of puzzle.givens) {
                assert(given.index >= 0 && given.index < total, `level ${level} seed ${offset} given index should stay in range`);
                assert.strictEqual(
                    puzzle.solution[given.index],
                    given.value,
                    `level ${level} seed ${offset} given ${given.index} should come from the solution`
                );
                givenGrid[given.index] = given.value;
            }

            assert.strictEqual(
                api.countSolutions(givenGrid, config.size, config.boxRows, config.boxCols, 2),
                1,
                `level ${level} seed ${offset} should keep a unique solution`
            );
            assert.strictEqual(
                api.validateGrid(puzzle.solution, config.size, config.boxRows, config.boxCols),
                true,
                `level ${level} seed ${offset} solution should be a valid complete grid`
            );
        }
    }

    const elapsed = Date.now() - startedAt;
    assert(elapsed < 20000, `generating ${generated} puzzles should finish within 20s (took ${elapsed}ms)`);
    console.log(`    ${generated} puzzles generated in ${elapsed}ms`);
}

/* (b2) 求解器与校验器的正确性：完整解唯一、空盘解数按上限剪枝、冲突盘无解 */
function testSolverBasics() {
    const { api } = runScriptWithContext();

    /* 手工构造的合法 4×4 完整解 */
    const solved = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
    assert.strictEqual(api.validateGrid(solved, 4, 2, 2), true, 'hand-made solved grid should validate');
    assert.strictEqual(api.countSolutions(solved, 4, 2, 2, 2), 1, 'a solved grid has exactly one completion');

    const broken = solved.slice();
    broken[3] = 1; /* 首行出现两个 1 */
    assert.strictEqual(api.validateGrid(broken, 4, 2, 2), false, 'conflicting grid should not validate');
    assert.strictEqual(api.countSolutions(broken, 4, 2, 2, 2), 0, 'conflicting givens leave no solution');

    const incomplete = solved.slice(0, 15);
    assert.strictEqual(api.validateGrid(incomplete, 4, 2, 2), false, 'incomplete grid should not validate');

    const empty4 = new Array(16).fill(0);
    assert.strictEqual(api.countSolutions(empty4, 4, 2, 2, 2), 2, 'empty board should stop counting at the limit');

    /* boxIndexOf：4×4 为 2×2 四宫，6×6 为 2 行 3 列六宫，宫按先行后列编号 */
    assert.strictEqual(api.boxIndexOf(5, 4, 2, 2), 0, '4x4 cell (r1,c1) belongs to box 0');
    assert.strictEqual(api.boxIndexOf(6, 4, 2, 2), 1, '4x4 cell (r1,c2) belongs to box 1');
    assert.strictEqual(api.boxIndexOf(9, 6, 2, 3), 1, '6x6 cell (r1,c3) belongs to box 1');
    assert.strictEqual(api.boxIndexOf(21, 6, 2, 3), 3, '6x6 cell (r3,c3) belongs to box 3');
}

/* (c) conflictCells：行/列/宫冲突样例（含 4×4 与 6×6 宫判定），无冲突返回空 */
function testConflictCells() {
    const { api } = runScriptWithContext();

    function conflictsOf(grid, size, boxRows, boxCols) {
        return Array.from(api.conflictCells(grid, size, boxRows, boxCols));
    }

    /* 4×4 行冲突：r0 两格同为 1 */
    const row4 = new Array(16).fill(0);
    row4[0] = 1;
    row4[1] = 1;
    assert.deepStrictEqual(conflictsOf(row4, 4, 2, 2), [0, 1], '4x4 row conflict should mark both cells');

    /* 4×4 列冲突：c0 的 r0 与 r2 同为 2 */
    const col4 = new Array(16).fill(0);
    col4[0] = 2;
    col4[8] = 2;
    assert.deepStrictEqual(conflictsOf(col4, 4, 2, 2), [0, 8], '4x4 column conflict should mark both cells');

    /* 4×4 宫冲突：r0c0 与 r1c1 同在左上宫 */
    const box4 = new Array(16).fill(0);
    box4[0] = 3;
    box4[5] = 3;
    assert.deepStrictEqual(conflictsOf(box4, 4, 2, 2), [0, 5], '4x4 box conflict should mark both cells');

    /* 4×4 三连同值：同行三个 4 全部标冲突 */
    const triple4 = new Array(16).fill(0);
    triple4[0] = 4;
    triple4[1] = 4;
    triple4[2] = 4;
    assert.deepStrictEqual(conflictsOf(triple4, 4, 2, 2), [0, 1, 2], 'three same values in a row should mark all three');

    /* 4×4 无冲突：不同行列宫的同值不算冲突，空盘返回空 */
    const apart4 = new Array(16).fill(0);
    apart4[0] = 4;
    apart4[10] = 4;
    assert.deepStrictEqual(conflictsOf(apart4, 4, 2, 2), [], 'values sharing no unit should not conflict');
    assert.deepStrictEqual(conflictsOf(new Array(16).fill(0), 4, 2, 2), [], 'empty grid should have no conflicts');

    /* 6×6 宫判定：宫为 2 行 3 列，r0c0 与 r1c1 同在首宫 */
    const box6 = new Array(36).fill(0);
    box6[0] = 5;
    box6[4] = 5;
    assert.deepStrictEqual(conflictsOf(box6, 6, 2, 3), [0, 4], '6x6 box conflict should mark both cells');

    /* 6×6 同宫但不同行列：r0c2 与 r1c0 同在首宫 */
    const box6b = new Array(36).fill(0);
    box6b[2] = 6;
    box6b[6] = 6;
    assert.deepStrictEqual(conflictsOf(box6b, 6, 2, 3), [2, 6], '6x6 cells sharing only a box should conflict');

    /* 6×6 行冲突：r0 首尾两格；列冲突：c0 首尾两格 */
    const row6 = new Array(36).fill(0);
    row6[0] = 6;
    row6[5] = 6;
    assert.deepStrictEqual(conflictsOf(row6, 6, 2, 3), [0, 5], '6x6 row conflict should mark both cells');

    const col6 = new Array(36).fill(0);
    col6[0] = 6;
    col6[30] = 6;
    assert.deepStrictEqual(conflictsOf(col6, 6, 2, 3), [0, 30], '6x6 column conflict should mark both cells');

    /* 6×6 无冲突：不同行列宫（r0c0 与 r1c3）同值不算冲突 */
    const apart6 = new Array(36).fill(0);
    apart6[0] = 6;
    apart6[9] = 6;
    assert.deepStrictEqual(conflictsOf(apart6, 6, 2, 3), [], '6x6 values sharing no unit should not conflict');

    /* 生成的完整解不应有任何冲突 */
    const { api: freshApi } = runScriptWithContext();
    const puzzle = freshApi.generatePuzzle(9, freshApi.levelSeed(9));
    assert.deepStrictEqual(
        conflictsOf(puzzle.solution, puzzle.size, puzzle.boxRows, puzzle.boxCols),
        [],
        'generated solution should be conflict free'
    );
}

/* (d) 档位递进（4×4→6×6、各档挖空数单调不减）、图案表、星级边界 */
function testLevelProgressionAndStars() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelCount(), 12);
    assert.strictEqual(api.levelConfig(1).size, 4, 'levels 1-6 should be 4x4');
    assert.strictEqual(api.levelConfig(6).size, 4);
    assert.strictEqual(api.levelConfig(7).size, 6, 'levels 7-12 should be 6x6');
    assert.strictEqual(api.levelConfig(12).size, 6);
    assert.strictEqual(api.levelConfig(1).boxRows, 2);
    assert.strictEqual(api.levelConfig(1).boxCols, 2, '4x4 should use 2x2 boxes');
    assert.strictEqual(api.levelConfig(7).boxRows, 2);
    assert.strictEqual(api.levelConfig(7).boxCols, 3, '6x6 should use 2-row 3-col boxes');

    /* 挖空数端点与档位内单调不减（跨档位时 6×6 起点重置，棋盘变大难度仍递增） */
    assert.strictEqual(api.levelConfig(1).blanks, 4, 'level 1 should dig 4 cells');
    assert.strictEqual(api.levelConfig(6).blanks, 8, 'level 6 should dig 8 cells');
    assert.strictEqual(api.levelConfig(7).blanks, 6, 'level 7 should dig 6 cells');
    assert.strictEqual(api.levelConfig(12).blanks, 14, 'level 12 should dig 14 cells');
    for (let level = 2; level <= 6; level += 1) {
        assert(
            api.levelConfig(level).blanks >= api.levelConfig(level - 1).blanks,
            `4x4 blanks should never decrease at level ${level}`
        );
    }
    for (let level = 8; level <= 12; level += 1) {
        assert(
            api.levelConfig(level).blanks >= api.levelConfig(level - 1).blanks,
            `6x6 blanks should never decrease at level ${level}`
        );
    }

    assert.strictEqual(api.EMOJIS[4].length, 4, '4x4 should offer 4 animal emojis');
    assert.strictEqual(new Set(api.EMOJIS[4]).size, 4, '4x4 emojis should be distinct');
    assert.strictEqual(api.EMOJIS[6].length, 6, '6x6 should offer 6 fruit emojis');
    assert.strictEqual(new Set(api.EMOJIS[6]).size, 6, '6x6 emojis should be distinct');

    assert.strictEqual(api.starRating(0), 3, 'zero mistakes should earn 3 stars');
    assert.strictEqual(api.starRating(1), 2, '1 mistake should earn 2 stars');
    assert.strictEqual(api.starRating(3), 2, '3 mistakes should earn 2 stars');
    assert.strictEqual(api.starRating(4), 1, '4 mistakes should earn 1 star');
    assert.strictEqual(api.starRating(99), 1, 'many mistakes should still earn 1 star');
}

/* (d2) 存档：unlocked 只增不减、stars 保留最大值、全新进度默认第 1 关 */
function testStorageNeverRegresses() {
    const fresh = runScriptWithContext();
    assert.strictEqual(fresh.api.loadUnlockedLevel(), 1, 'fresh progress should start at level 1');
    assert.strictEqual(fresh.api.loadStars(3), 0, 'fresh progress should have no stars');

    const { api, storage } = runScriptWithContext();
    api.saveUnlockedLevel(4);
    api.saveUnlockedLevel(3);
    api.saveUnlockedLevel(4);
    assert.strictEqual(storage.get('mini-sudoku-unlocked-level'), '4', 'unlocked level should never regress');

    api.saveStars(2, 2);
    api.saveStars(2, 1);
    assert.strictEqual(storage.get('mini-sudoku-stars-2'), '2', 'stars should keep the maximum');
    api.saveStars(2, 3);
    assert.strictEqual(storage.get('mini-sudoku-stars-2'), '3', 'stars should upgrade to 3');
    api.saveStars(5, 1);
    assert.strictEqual(storage.get('mini-sudoku-stars-5'), '1', 'stars of other levels should save independently');
}

testFilesAndCatalogExist();
testGeneratedPuzzles();
testSolverBasics();
testConflictCells();
testLevelProgressionAndStars();
testStorageNeverRegresses();

console.log('mini sudoku smoke test passed');
