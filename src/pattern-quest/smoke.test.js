const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* 参照 lights-out 的 vm 沙箱模式：Map 桩 localStorage + 最小 document 桩，直接整文件执行 script.js */
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
        'question-text',
        'hit-text',
        'progress-track',
        'progress-fill',
        'pattern-row',
        'pattern-desc',
        'feedback-text',
        'options-grid',
        'restart-btn',
        'levels-btn',
        'win-modal',
        'result-stars',
        'result-text',
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
    return { api: context.window.PatternApi, storage };
}

/* vm 沙箱内的对象与测试侧原型不同，deepStrictEqual 不可用；
   图案项统一用 tileKey（色调|形状|数量）做结构化比较 */
function assertTileKeyEqual(api, actual, expected, message) {
    assert.strictEqual(api.tileKey(actual), api.tileKey(expected), message);
}

/* 题目的可比较签名：全部退化为基本类型 */
function puzzleSignature(api, puzzle) {
    return {
        level: puzzle.level,
        type: puzzle.type,
        kind: puzzle.kind,
        rule: {
            kind: puzzle.rule.kind,
            start: puzzle.rule.start,
            step: puzzle.rule.step,
            countStart: puzzle.rule.countStart,
            countStep: puzzle.rule.countStep
        },
        sequence: puzzle.sequence.map((tile) => api.tileKey(tile)),
        answer: api.tileKey(puzzle.answer),
        options: puzzle.options.map((tile) => api.tileKey(tile)),
        patternDesc: puzzle.patternDesc
    };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes("../js/game-back.js"), 'page should mount the shared back button script');
    assert(html.includes('<title>图案找规律 - 游戏平台</title>'), 'page title should follow the platform convention');
    assert(html.includes('id="pattern-row"'), 'page should render the sequence host');
    assert(html.includes('id="options-grid"'), 'page should render the options host');
    assert(css.includes('--pq-'), 'style should be self-contained with pq-prefixed variables');
    assert(css.includes('@keyframes'), 'style should define the feedback animations');
    assert(script.includes('generatePuzzle'), 'game should generate puzzles from rules');
    assert(script.includes('applyRule'), 'game should evaluate rules through applyRule');
    assert(catalog.includes('slug: "pattern-quest"'), 'catalog should register pattern-quest');
    assert(catalog.includes('mobilePath: "src/pattern-quest/index.html"'), 'catalog should route mobile to pattern-quest');
}

function testApplyRuleKinds() {
    const { api } = runScriptWithContext();

    /* cycle：循环节原样重复 */
    const abUnit = [
        { shape: '🐶', tint: null, count: 1 },
        { shape: '🐱', tint: null, count: 1 }
    ];
    assertTileKeyEqual(api, api.applyRule({ kind: 'cycle' }, abUnit, 0), { shape: '🐶', tint: null, count: 1 });
    assertTileKeyEqual(api, api.applyRule({ kind: 'cycle' }, abUnit, 1), { shape: '🐱', tint: null, count: 1 });
    assertTileKeyEqual(api, api.applyRule({ kind: 'cycle' }, abUnit, 2), { shape: '🐶', tint: null, count: 1 });
    assertTileKeyEqual(api, api.applyRule({ kind: 'cycle' }, abUnit, 5), { shape: '🐱', tint: null, count: 1 });

    /* grow：数量按 start + step × index 递增 */
    const appleUnit = [{ shape: '🍎', tint: null, count: 1 }];
    assertTileKeyEqual(api, api.applyRule({ kind: 'grow', start: 1, step: 1 }, appleUnit, 0), { shape: '🍎', tint: null, count: 1 });
    assertTileKeyEqual(api, api.applyRule({ kind: 'grow', start: 1, step: 1 }, appleUnit, 2), { shape: '🍎', tint: null, count: 3 });
    assertTileKeyEqual(api, api.applyRule({ kind: 'grow', start: 1, step: 1 }, appleUnit, 3), { shape: '🍎', tint: null, count: 4 });

    /* combo：形状按循环节循环，数量按 countStart + countStep × index 递增 */
    const comboUnit = [
        { shape: '🍇', tint: null, count: 1 },
        { shape: '🍌', tint: null, count: 1 }
    ];
    assertTileKeyEqual(api, api.applyRule({ kind: 'combo', countStart: 1, countStep: 1 }, comboUnit, 0), { shape: '🍇', tint: null, count: 1 });
    assertTileKeyEqual(api, api.applyRule({ kind: 'combo', countStart: 1, countStep: 1 }, comboUnit, 1), { shape: '🍌', tint: null, count: 2 });
    assertTileKeyEqual(api, api.applyRule({ kind: 'combo', countStart: 1, countStep: 1 }, comboUnit, 5), { shape: '🍌', tint: null, count: 6 });
}

function testGeneratePuzzleConsistency() {
    const { api } = runScriptWithContext();

    for (let level = 1; level <= api.levelCount(); level += 1) {
        for (let q = 0; q < api.PUZZLES_PER_LEVEL; q += 1) {
            const seed = api.puzzleSeed(level, q);
            const puzzle = api.generatePuzzle(level, seed);

            /* 题型必须落在关卡档位声明集合内 */
            assert(
                api.patternTypesForLevel(level).indexOf(puzzle.type) >= 0,
                `level ${level} puzzle ${q}: type ${puzzle.type} should be declared for the level`
            );

            /* 序列每一项与答案都用 applyRule 独立复核 */
            for (let i = 0; i < puzzle.sequence.length; i += 1) {
                assertTileKeyEqual(
                    api,
                    puzzle.sequence[i],
                    api.applyRule(puzzle.rule, puzzle.unit, i),
                    `level ${level} puzzle ${q}: sequence[${i}] should follow the rule`
                );
            }
            assertTileKeyEqual(
                api,
                puzzle.answer,
                api.applyRule(puzzle.rule, puzzle.unit, puzzle.sequence.length),
                `level ${level} puzzle ${q}: answer should be the next rule item`
            );

            /* 4 个选项互异且恰好包含一个正确项 */
            assert.strictEqual(puzzle.options.length, 4, 'puzzle should expose exactly 4 options');
            const keys = puzzle.options.map((tile) => api.tileKey(tile));
            assert.strictEqual(new Set(keys).size, 4, `level ${level} puzzle ${q}: options should be pairwise distinct`);
            const answerKey = api.tileKey(puzzle.answer);
            assert.strictEqual(
                keys.filter((key) => key === answerKey).length,
                1,
                `level ${level} puzzle ${q}: options should contain the answer exactly once`
            );

            /* 同种子完全可复现 */
            assert.deepStrictEqual(
                puzzleSignature(api, api.generatePuzzle(level, seed)),
                puzzleSignature(api, puzzle),
                'same seed should reproduce the same puzzle'
            );
        }
    }

    /* 正确项位置应随种子变化，不固定在同一格 */
    const positions = new Set();
    for (let q = 0; q < 24; q += 1) {
        const puzzle = api.generatePuzzle(2, api.puzzleSeed(2, q));
        positions.add(puzzle.options.findIndex((tile) => api.tilesEqual(tile, puzzle.answer)));
    }
    assert(positions.size >= 2, 'answer position should vary across puzzles');
}

function testLevelBandContract() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelCount(), 12);

    /* 各关题型档位声明（固定递进契约） */
    assert.deepStrictEqual([...api.patternTypesForLevel(1)], ['ab']);
    assert.deepStrictEqual([...api.patternTypesForLevel(2)], ['ab', 'aabb']);
    assert.deepStrictEqual([...api.patternTypesForLevel(3)], ['ab', 'aabb']);
    assert.deepStrictEqual([...api.patternTypesForLevel(4)], ['abc']);
    assert.deepStrictEqual([...api.patternTypesForLevel(5)], ['abc', 'grow']);
    assert.deepStrictEqual([...api.patternTypesForLevel(6)], ['abc', 'grow']);
    assert.deepStrictEqual([...api.patternTypesForLevel(7)], ['tint']);
    assert.deepStrictEqual([...api.patternTypesForLevel(8)], ['tint', 'mixed']);
    assert.deepStrictEqual([...api.patternTypesForLevel(9)], ['tint', 'mixed']);
    assert.deepStrictEqual([...api.patternTypesForLevel(10)], ['abcd', 'combo']);
    assert.deepStrictEqual([...api.patternTypesForLevel(11)], ['abcd', 'combo', 'long']);
    assert.deepStrictEqual([...api.patternTypesForLevel(12)], ['abcd', 'combo', 'long']);

    /* 每关 6 题：序列长度落在档位范围，且与题型声明的展示数量一致 */
    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        assert.strictEqual(config.level, level);
        assert.strictEqual(config.puzzles, 6);
        assert(config.showMin >= 3, 'should show at least 3 items');
        assert(config.showMax <= 9, 'long sequences should stay within 9 items');
        for (let q = 0; q < config.puzzles; q += 1) {
            const puzzle = api.generatePuzzle(level, api.puzzleSeed(level, q));
            assert(
                puzzle.sequence.length >= config.showMin && puzzle.sequence.length <= config.showMax,
                `level ${level}: show ${puzzle.sequence.length} should be in [${config.showMin}, ${config.showMax}]`
            );
            const spec = api.PATTERN_TYPES[puzzle.type];
            const range = Array.isArray(spec.show) ? spec.show : [spec.show, spec.show];
            assert(
                puzzle.sequence.length >= range[0] && puzzle.sequence.length <= range[1],
                `type ${puzzle.type}: show ${puzzle.sequence.length} should be in [${range[0]}, ${range[1]}]`
            );
        }
    }

    /* 越界关卡请求按边界关卡兜底 */
    assert.strictEqual(api.levelConfig(0).level, 1);
    assert.strictEqual(api.levelConfig(99).level, 12);
}

/* 歧义校验器：cycle 类题目的展示序列若能被孩子按其他周期 p 自洽读通
   （含 p=show 的“整块读法”，此时下一项即 sequence[0]），
   该读法推出的“下一项”必须与正解一致，否则孩子按另一套读法作答会被判错。
   因此 cycle 类型的 show 必须取循环节长度的整数倍 */
function testCycleReadingsUnambiguous() {
    const { api } = runScriptWithContext();
    const conflicts = [];

    for (let level = 1; level <= api.levelCount(); level += 1) {
        for (let q = 0; q < api.PUZZLES_PER_LEVEL; q += 1) {
            const puzzle = api.generatePuzzle(level, api.puzzleSeed(level, q));
            /* grow / combo 的数量随位置递增，不是周期重复，不进入本校验范围 */
            if (puzzle.kind !== 'cycle') continue;

            const keys = puzzle.sequence.map((tile) => api.tileKey(tile));
            const answerKey = api.tileKey(puzzle.answer);
            const show = keys.length;
            for (let p = 1; p <= show; p += 1) {
                let isPeriodic = true;
                for (let i = 0; i < show; i += 1) {
                    if (keys[i] !== keys[i % p]) {
                        isPeriodic = false;
                        break;
                    }
                }
                if (!isPeriodic) continue;
                const nextKey = keys[show % p];
                if (nextKey !== answerKey) {
                    conflicts.push(
                        `L${level}Q${q + 1} ${puzzle.type} show=${show}: 周期 ${p} 读法推出下一项 ${nextKey}，正解是 ${answerKey}`
                    );
                }
            }
        }
    }

    assert.strictEqual(
        conflicts.length,
        0,
        `cycle 类题目存在自洽但与正解冲突的读法（共 ${conflicts.length} 处）：\n${conflicts.join('\n')}`
    );
}

function testStarsAndStorage() {
    const { api, storage } = runScriptWithContext();

    /* 星级边界：6/6 → 3 星，≥4/6 → 2 星，其余 → 1 星 */
    assert.strictEqual(api.starRating(6, 6), 3);
    assert.strictEqual(api.starRating(5, 6), 2);
    assert.strictEqual(api.starRating(4, 6), 2);
    assert.strictEqual(api.starRating(3, 6), 1);
    assert.strictEqual(api.starRating(0, 6), 1);
    assert.strictEqual(api.starRating(9, 6), 3, 'out-of-range correct should clamp to 3 stars');

    /* 解锁进度只增不减，无存档默认第 1 关 */
    assert.strictEqual(api.loadUnlockedLevel(), 1, 'fresh save should start at level 1');
    api.saveUnlockedLevel(4);
    api.saveUnlockedLevel(2);
    assert.strictEqual(storage.get('pattern-quest-unlocked-level'), '4', 'unlock level should never regress');
    assert.strictEqual(api.loadUnlockedLevel(), 4);

    /* 星级保留历史最大值 */
    assert.strictEqual(api.loadStars(3), 0, 'unplayed level should have 0 stars');
    api.saveStars(3, 2);
    api.saveStars(3, 3);
    api.saveStars(3, 1);
    assert.strictEqual(storage.get('pattern-quest-stars-3'), '3', 'stars should keep the maximum');
    assert.strictEqual(api.loadStars(3), 3);

    /* 全部存储键遵循 pattern-quest- 前缀约定 */
    for (const key of storage.keys()) {
        assert(key.indexOf('pattern-quest-') === 0, `storage key ${key} should use the pattern-quest- prefix`);
    }
}

testFilesAndCatalogExist();
testApplyRuleKinds();
testGeneratePuzzleConsistency();
testLevelBandContract();
testCycleReadingsUnambiguous();
testStarsAndStorage();

console.log('pattern quest smoke test passed');
