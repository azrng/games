const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* 与点灯模板一致的 vm 沙箱：localStorage 用 Map 桩，DOM 元素用通用桩对象 */
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
            title: '',
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
        'goal-text',
        'cups',
        'status-text',
        'fill-btn',
        'empty-btn',
        'undo-btn',
        'hint-btn',
        'hint-count',
        'restart-btn',
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
    return { api: context.window.WaterApi, storage, elements };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('../js/game-back.js'), 'page should mount the shared back button script');
    assert(html.includes('倒水谜题 - 游戏平台'), 'page title should follow platform convention');
    assert(html.includes('id="cups"'), 'page should render a cups host');
    assert(html.includes('id="fill-btn"'), 'page should include the fill control');
    assert(html.includes('id="empty-btn"'), 'page should include the empty control');
    assert(css.includes('--wp-'), 'styles should use the water-pour variable prefix');
    assert(css.includes('min-height: 44px'), 'touch targets should stay at least 44px');
    assert(script.includes('windowObject.WaterApi'), 'script should expose window.WaterApi');
    assert(catalog.includes('slug: "water-pour"'), 'catalog should register water-pour');
    assert(catalog.includes('mobilePath: "src/water-pour/index.html"'), 'catalog should route mobile to water-pour');
}

/* pour 边界：同杯 / 源空 / 目标已满 / 越界原样返回，正常倒入转移 min(源量, 目标余量) */
function testPourEdges() {
    const { api } = runScriptWithContext();
    const caps = [5, 3];

    const base = [4, 1];
    assert.deepStrictEqual(api.pour(base, caps, 0, 1), [2, 3], 'pour should move min(source, room)');
    const reverse = [1, 3];
    assert.deepStrictEqual(api.pour(reverse, caps, 1, 0), [4, 0], 'pouring back should drain the small cup');

    const sameCup = [2, 2];
    assert.strictEqual(api.pour(sameCup, caps, 1, 1), sameCup, 'pouring into itself should return the original state');
    const drySource = [0, 2];
    assert.strictEqual(api.pour(drySource, caps, 0, 1), drySource, 'empty source should return the original state');
    const fullTarget = [2, 3];
    assert.strictEqual(api.pour(fullTarget, caps, 0, 1), fullTarget, 'full target should return the original state');
    const untouched = [1, 1];
    assert.strictEqual(api.pour(untouched, caps, 0, 9), untouched, 'out-of-range target should be a no-op');
    assert.strictEqual(api.pour(untouched, caps, -1, 1), untouched, 'negative index should be a no-op');

    /* fill / empty 边界：装满取容量、倒光归零、越界原样返回 */
    assert.deepStrictEqual(api.fill([0, 0], caps, 0), [5, 0], 'fill should top the cup up to capacity');
    assert.deepStrictEqual(api.fill([2, 3], caps, 1), [2, 3], 'filling a full cup keeps the amounts');
    assert.deepStrictEqual(api.empty([4, 2], caps, 1), [4, 0], 'empty should zero the cup');
    const kept = [3, 1];
    assert.strictEqual(api.fill(kept, caps, 7), kept, 'fill with a bad index should be a no-op');
    assert.strictEqual(api.empty(kept, caps, -2), kept, 'empty with a bad index should be a no-op');

    /* applyAction 分发：pour / fill / empty 三种动作类型都能正确落状态 */
    assert.deepStrictEqual(api.applyAction([4, 1], caps, { type: 'pour', from: 0, to: 1 }), [2, 3]);
    assert.deepStrictEqual(api.applyAction([0, 0], caps, { type: 'fill', from: 1, to: -1 }), [0, 3]);
    assert.deepStrictEqual(api.applyAction([3, 2], caps, { type: 'empty', from: 0, to: -1 }), [0, 2]);
    assert.deepStrictEqual(api.applyAction([3, 2], caps, null), [3, 2], 'a null action should keep the state');
}

/* isSolved 边界：恰好等于才算过关，超过目标不算 */
function testIsSolvedEdges() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.isSolved([3, 4], 4), true, 'exact amount counts as solved');
    assert.strictEqual(api.isSolved([2, 6, 1], 6), true, 'any cup hitting the target wins');
    assert.strictEqual(api.isSolved([5, 0], 3), false, 'exceeding the target is not solved');
    assert.strictEqual(api.isSolved([0, 0], 0), true, 'an all-zero state trivially matches a zero target');
}

/* 15 关结构断言：全部 BFS 有解、nextAction 合法且整条提示链按最优步数收尾 */
function testLevelCatalogAndBfs() {
    const { api, elements } = runScriptWithContext();

    assert.strictEqual(api.levelCount(), 15, 'game should ship 15 levels');
    assert.strictEqual(api.HINTS_PER_LEVEL, 3, 'each level should offer 3 hints');

    for (let level = 1; level <= api.levelCount(); level += 1) {
        const config = api.levelConfig(level);
        assert(Array.isArray(config.caps) && config.caps.length >= 2 && config.caps.length <= 3,
            `level ${level}: should use 2-3 cups`);
        assert(config.target > 0 && config.target <= Math.max(...config.caps),
            `level ${level}: target must be reachable within the largest cup`);

        const result = api.bfsSolve(config.caps, config.target);
        assert(result !== null, `level ${level}: bfsSolve should find a solution`);
        assert(Number.isInteger(result.minMoves) && result.minMoves > 0,
            `level ${level}: minMoves should be a positive integer`);

        /* nextAction 合法：类型正确、下标在界内、作用于初始状态会产生真实变化 */
        const action = result.nextAction;
        assert(action && ['pour', 'fill', 'empty'].includes(action.type),
            `level ${level}: nextAction should carry a known type`);
        const inRange = action.from >= 0 && action.from < config.caps.length
            && (action.type !== 'pour' || (action.to >= 0 && action.to < config.caps.length));
        assert(inRange, `level ${level}: nextAction indices should stay in range`);
        const initial = api.createInitialState(config.caps);
        assert(action.type !== 'empty', `level ${level}: the first move from all zeros cannot be an empty`);
        const stepped = api.applyAction(initial, config.caps, action);
        assert(!stepped.every((amount, index) => amount === initial[index]),
            `level ${level}: nextAction should change the state`);

        /* 沿提示链一路走到过关，实际步数必须等于 BFS 最优步数 */
        let cursor = initial;
        let walked = 0;
        while (!api.isSolved(cursor, config.target)) {
            const step = api.bfsSolveFrom(cursor, config.caps, config.target);
            assert(step !== null, `level ${level}: mid-game BFS should stay solvable`);
            cursor = api.applyAction(cursor, config.caps, step.nextAction);
            walked += 1;
            assert(walked <= result.minMoves, `level ${level}: guided walk must not exceed minMoves`);
        }
        assert.strictEqual(walked, result.minMoves,
            `level ${level}: following nextAction should win in exactly minMoves steps`);

        /* 开局 HUD 的最少步数应与 BFS 结果一致 */
        if (level === 1) {
            assert.strictEqual(elements.get('min-steps-text').textContent, String(result.minMoves),
                'opening HUD should show the BFS optimum for level 1');
        }
    }

    /* levelConfig 返回容量副本，外部改写不得污染关卡表 */
    const mutated = api.levelConfig(1);
    mutated.caps[0] = 999;
    assert.strictEqual(api.levelConfig(1).caps[0], 5, 'levelConfig should hand out defensive copies');
}

/* 独立暴力对拍：枚举全部水量组合，用松弛法（类 Bellman-Ford）求全 0 出发的最少步数。
   动作规则在本测试内独立重写，不复用游戏内 actionsOf / applyAction */
function bruteForceMinMoves(caps, target) {
    const total = caps.reduce((product, cap) => product * (cap + 1), 1);
    const codeOf = (state) => state.reduce((acc, amount, index) => acc * (caps[index] + 1) + amount, 0);
    const decode = (code) => {
        const state = new Array(caps.length).fill(0);
        let rest = code;
        for (let index = caps.length - 1; index >= 0; index -= 1) {
            state[index] = rest % (caps[index] + 1);
            rest = Math.floor(rest / (caps[index] + 1));
        }
        return state;
    };
    const neighbors = (state) => {
        const list = [];
        for (let i = 0; i < caps.length; i += 1) {
            if (state[i] < caps[i]) {
                const filled = state.slice();
                filled[i] = caps[i];
                list.push(filled);
            }
            if (state[i] > 0) {
                const emptied = state.slice();
                emptied[i] = 0;
                list.push(emptied);
            }
            for (let j = 0; j < caps.length; j += 1) {
                if (i !== j && state[i] > 0 && state[j] < caps[j]) {
                    const poured = state.slice();
                    const moved = Math.min(state[i], caps[j] - state[j]);
                    poured[i] -= moved;
                    poured[j] += moved;
                    list.push(poured);
                }
            }
        }
        return list;
    };

    const dist = new Array(total).fill(Infinity);
    dist[codeOf(caps.map(() => 0))] = 0;
    let changed = true;
    while (changed) {
        changed = false;
        for (let code = 0; code < total; code += 1) {
            if (dist[code] === Infinity) continue;
            for (const next of neighbors(decode(code))) {
                const nextCode = codeOf(next);
                if (dist[nextCode] > dist[code] + 1) {
                    dist[nextCode] = dist[code] + 1;
                    changed = true;
                }
            }
        }
    }

    let best = Infinity;
    for (let code = 0; code < total; code += 1) {
        if (decode(code).includes(target) && dist[code] < best) {
            best = dist[code];
        }
    }
    return Number.isFinite(best) ? best : null;
}

/* 2 杯小状态空间 + 一个 3 杯样例：BFS 最小步数必须与暴力枚举一致（含无解判定） */
function testBfsMatchesBruteForce() {
    const { api } = runScriptWithContext();

    const samples = [
        { caps: [5, 3], target: 4 },
        { caps: [7, 4], target: 5 },
        { caps: [9, 4], target: 6 },
        { caps: [11, 6], target: 8 },
        { caps: [5, 3], target: 1 },
        { caps: [8, 5, 3], target: 4 },
        /* 偶数容量永远量不出奇数：双方都应判定无解 */
        { caps: [4, 6], target: 5 }
    ];

    for (const sample of samples) {
        const brute = bruteForceMinMoves(sample.caps, sample.target);
        const bfs = api.bfsSolve(sample.caps, sample.target);
        if (brute === null) {
            assert(bfs === null,
                `caps ${sample.caps} target ${sample.target}: BFS should also report unsolvable`);
        } else {
            assert(bfs !== null,
                `caps ${sample.caps} target ${sample.target}: BFS should find a solution`);
            assert.strictEqual(bfs.minMoves, brute,
                `caps ${sample.caps} target ${sample.target}: BFS optimum should match brute force`);
        }
    }
}

/* 星级边界与存档规则：unlocked 只增不减、stars 保留最大、best 保留最小 */
function testStarRatingAndRecords() {
    const { api, storage } = runScriptWithContext();

    assert.strictEqual(api.starRating(6, 6), 3, 'optimal moves earn three stars');
    assert.strictEqual(api.starRating(7, 6), 2, 'optimal+1 earns two stars');
    assert.strictEqual(api.starRating(9, 6), 2, 'optimal+3 still earns two stars');
    assert.strictEqual(api.starRating(10, 6), 1, 'optimal+4 clears with one star');
    assert.strictEqual(api.starRating(30, 6), 1, 'any clearing run earns at least one star');

    assert.strictEqual(api.loadUnlockedLevel(), 1, 'fresh progress should start at level 1');
    assert.strictEqual(api.loadStars(3), 0, 'unplayed levels default to zero stars');
    assert.strictEqual(api.loadBest(3), 0, 'unplayed levels default to zero best');

    api.saveUnlockedLevel(5);
    assert.strictEqual(storage.get('water-pour-unlocked-level'), '5', 'unlock should persist');
    api.saveUnlockedLevel(3);
    assert.strictEqual(storage.get('water-pour-unlocked-level'), '5', 'unlock level should never regress');
    api.saveUnlockedLevel(99);
    assert.strictEqual(storage.get('water-pour-unlocked-level'), '15', 'unlock should clamp to level count');
    assert.strictEqual(api.loadUnlockedLevel(), 15, 'loadUnlockedLevel should read the clamped value');

    api.saveStars(3, 2);
    assert.strictEqual(storage.get('water-pour-stars-3'), '2', 'stars should persist');
    api.saveStars(3, 3);
    assert.strictEqual(storage.get('water-pour-stars-3'), '3', 'better stars should overwrite');
    api.saveStars(3, 1);
    assert.strictEqual(storage.get('water-pour-stars-3'), '3', 'worse stars should keep the maximum');

    assert.strictEqual(api.saveBest(3, 8), 8, 'first clear records the step count');
    assert.strictEqual(api.saveBest(3, 6), 6, 'fewer steps should overwrite');
    assert.strictEqual(api.saveBest(3, 12), 6, 'more steps should keep the minimum');
    assert.strictEqual(storage.get('water-pour-best-3'), '6', 'best steps should persist the minimum');
}

testFilesAndCatalogExist();
testPourEdges();
testIsSolvedEdges();
testLevelCatalogAndBfs();
testBfsMatchesBruteForce();
testStarRatingAndRecords();

console.log('water pour smoke test passed');
