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
        type: '',
        addEventListener() {},
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        replaceChildren(child) {
            this.children = child ? [child] : [];
        },
        remove() {},
        focus() {},
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 480, height: 640, right: 480, bottom: 640 };
        },
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

function runScriptWithContext(options = {}) {
    const storage = new Map(options.seedStorage || []);
    const brokenStorage = Boolean(options.brokenStorage);
    const elements = new Map();

    const localStorageStub = {
        getItem(key) {
            if (brokenStorage) throw new Error('storage unavailable');
            return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
            if (brokenStorage) throw new Error('storage unavailable');
            storage.set(key, String(value));
        },
        removeItem(key) {
            if (brokenStorage) throw new Error('storage unavailable');
            storage.delete(key);
        }
    };

    const documentObject = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        createDocumentFragment() {
            return createElement('fragment');
        },
        addEventListener() {}
    };

    /* requestAnimationFrame 桩不执行回调，游戏循环不被驱动，纯函数由断言直接验证 */
    const context = {
        window: {
            localStorage: localStorageStub,
            devicePixelRatio: 1,
            requestAnimationFrame() {
                return 1;
            },
            cancelAnimationFrame() {},
            addEventListener() {}
        },
        document: documentObject,
        Math,
        console
    };
    context.window.window = context.window;
    context.window.document = documentObject;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.Breakout, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes("../js/game-back.js"), 'page should mount the shared back button script');
    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('charset="UTF-8"'), 'page should declare UTF-8');
    assert(html.includes('<canvas id="board"'), 'page should host the game canvas');
    assert(html.includes('id="result-modal"'), 'page should include the result modal');
    assert(html.includes('id="level-modal"'), 'page should include the level picker modal');
    assert(html.indexOf('src="script.js"') >= 0, 'page should load the game script');
    assert(html.indexOf('src="script.js"') < html.indexOf('../js/game-back.js'),
        'game script should load before the shared back button script');

    const css = read('style.css');
    assert(css.includes('touch-action: manipulation'), 'body should keep light touch behaviour');
    assert(/touch-action:\s*none/.test(css), 'canvas should disable default touch gestures');
    assert(css.includes('#board'), 'stylesheet should style the canvas board');
    assert(css.includes('env(safe-area-inset-top)'), 'stylesheet should respect safe areas');

    const script = read('script.js');
    assert(script.includes('breakout-unlocked-level'), 'script should use the unlocked-level save key');
    assert(script.includes('breakout-best'), 'script should use the best-score save key');
    assert(script.includes('windowObject.Breakout'), 'script should export the Breakout api');
    assert(script.startsWith('// @ts-check'), 'script should start with a ts-check hint');

    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    assert(catalog.includes('slug: "breakout"'), 'catalog should register breakout');
    const homeApp = fs.readFileSync(path.join(root, '..', 'js', 'app.js'), 'utf8');
    assert(homeApp.includes('"breakout"'), 'home page should give breakout an icon and tag');
}

function testGenerateLayout() {
    const { api } = runScriptWithContext();
    const seed = 20261010;

    /* 同关同种子两次生成完全一致（确定性），且不传种子时用内置基准种子仍可复现 */
    const first = api.generateLayout(3, seed);
    const second = api.generateLayout(3, seed);
    assert.deepStrictEqual(first, second, 'same level and seed should produce identical layouts');
    assert.deepStrictEqual(api.generateLayout(3), api.generateLayout(3),
        'default seed should stay deterministic');

    /* 不同关布局不同 */
    assert.notDeepStrictEqual(api.generateLayout(1, seed), api.generateLayout(2, seed),
        'different levels should generate different layouts');

    /* 行数随关卡递增至 7 封顶，列数恒为 10 */
    const expectedRows = [4, 5, 6, 7, 7, 7];
    for (let level = 1; level <= 6; level += 1) {
        const layout = api.generateLayout(level, seed);
        assert.strictEqual(layout.rows, expectedRows[level - 1], `level ${level} row count should match`);
        assert.strictEqual(layout.cols, 10, 'column count should stay 10');
        assert.strictEqual(layout.bricks.length, layout.rows, 'bricks should have one row array per row');
        for (const row of layout.bricks) {
            assert.strictEqual(row.length, layout.cols, 'each row should span all columns');
            for (const cell of row) {
                assert.strictEqual(typeof cell, 'boolean', 'brick cells should be booleans');
            }
        }
        /* 第 2 行起隔行留空道：奇数行至少留一个空格，避免砖阵封死 */
        for (let row = 1; row < layout.rows; row += 2) {
            assert.ok(layout.bricks[row].some((cell) => cell === false),
                `level ${level} row ${row} should keep an empty lane`);
        }
    }

    /* 砖块密度随关卡整体提高：末关砖数明显多于首关 */
    const filledCount = (layout) => layout.bricks.reduce(
        (sum, row) => sum + row.filter((cell) => cell).length, 0);
    const counts = [];
    for (let level = 1; level <= 6; level += 1) {
        counts.push(filledCount(api.generateLayout(level, seed)));
    }
    assert.ok(counts[5] > counts[0], 'level 6 should place more bricks than level 1');
    assert.ok(counts[3] > counts[0], 'level 4 should place more bricks than level 1');
}

function testReflectAngle() {
    const { api } = runScriptWithContext();
    const PI = Math.PI;

    /* 中点命中：竖直向上（canvas 坐标 y 向下，-90° 方向） */
    assert.ok(Math.abs(api.reflectAngle(0) + PI / 2) < 1e-9,
        'offset 0 should aim straight up (-90 degrees)');

    /* 边缘命中：±1 → 与竖直方向夹角 60°、与水平方向夹角 30° 的斜角 */
    assert.ok(Math.abs(api.reflectAngle(1) + PI / 6) < 1e-9,
        'offset 1 should reflect at -30 degrees (up-right oblique)');
    assert.ok(Math.abs(api.reflectAngle(-1) + 5 * PI / 6) < 1e-9,
        'offset -1 should reflect at -150 degrees (up-left oblique)');

    /* 越界 offset 钳制到 [-1,1] */
    assert.strictEqual(api.reflectAngle(5), api.reflectAngle(1), 'offset should clamp to 1');
    assert.strictEqual(api.reflectAngle(-5), api.reflectAngle(-1), 'offset should clamp to -1');

    /* 全区间输出都在允许范围内：始终朝上、与水平夹角落在 [30°,150°]、垂直分量 |sin| ≥ 0.5 恒非零 */
    for (let i = -24; i <= 24; i += 1) {
        const angle = api.reflectAngle(i / 24);
        assert.ok(angle <= -PI / 6 + 1e-9 && angle >= -5 * PI / 6 - 1e-9,
            `offset ${i / 24} angle should stay inside [30,150] degrees, got ${angle}`);
        assert.ok(Math.sin(angle) < 0, 'ball should always fly upward after paddle bounce');
        assert.ok(Math.abs(Math.sin(angle)) >= 0.5 - 1e-9,
            'vertical component should never approach zero (no horizontal dead loop)');
    }
}

/* 构造测试砖阵：全 false，仅 filled 列表中的格子为 true */
function makeBricks(rows, cols, filled) {
    const grid = [];
    for (let r = 0; r < rows; r += 1) {
        grid.push(new Array(cols).fill(false));
    }
    for (const [r, c] of filled) {
        grid[r][c] = true;
    }
    return grid;
}

function testStepBall() {
    const { api } = runScriptWithContext();

    /* 直墙反弹：左墙反 x 轴（vx 由负转正），球心被钳制回界内 */
    let result = api.stepBall({ x: 9, y: 200, vx: -300, vy: 0, dt: 0.05, paddleX: 240, bricks: [] });
    assert.ok(result.vx > 0, 'left wall should flip vx to positive');
    assert.ok(result.x >= 7 - 1e-6, 'ball should be clamped inside the left wall');
    assert.strictEqual(result.brickHit, null);
    assert.strictEqual(result.bottom, false);

    /* 右墙与顶墙 */
    result = api.stepBall({ x: 471, y: 200, vx: 300, vy: 0, dt: 0.05, paddleX: 240, bricks: [] });
    assert.ok(result.vx < 0, 'right wall should flip vx to negative');
    assert.ok(result.x <= 473 + 1e-6, 'ball should be clamped inside the right wall');
    result = api.stepBall({ x: 240, y: 8, vx: 0, vy: -300, dt: 0.05, paddleX: 240, bricks: [] });
    assert.ok(result.vy > 0, 'top wall should flip vy to positive');
    assert.ok(result.y >= 7 - 1e-6, 'ball should be clamped below the top wall');

    /* 撞砖（纵向进入）：砖消失、按 y 轴反弹 */
    const verticalBricks = makeBricks(4, 10, [[0, 5]]);
    result = api.stepBall({ x: 263, y: 110, vx: 0, vy: -400, dt: 0.1, paddleX: 240, bricks: verticalBricks });
    assert.ok(result.brickHit, 'moving up into a brick should register a hit');
    assert.strictEqual(result.brickHit.row, 0);
    assert.strictEqual(result.brickHit.col, 5);
    assert.strictEqual(result.brickHit.axis, 'y', 'vertical entry should flip the y axis');
    assert.strictEqual(result.bricks[0][5], false, 'hit brick should be removed');
    assert.ok(result.vy > 0, 'ball should bounce back downward');
    assert.deepStrictEqual(verticalBricks[0][5], true,
        'stepBall should not mutate the input bricks');

    /* 撞砖（横向进入）：按 x 轴反弹 */
    const sideBricks = makeBricks(4, 10, [[0, 5]]);
    result = api.stepBall({ x: 200, y: 75, vx: 500, vy: 0, dt: 0.1, paddleX: 240, bricks: sideBricks });
    assert.ok(result.brickHit, 'moving right into a brick should register a hit');
    assert.strictEqual(result.brickHit.axis, 'x', 'side entry should flip the x axis');
    assert.strictEqual(result.bricks[0][5], false, 'side-hit brick should be removed');
    assert.ok(result.vx < 0, 'ball should bounce back to the left');

    /* 挡板碰撞：中心命中按 reflectAngle(0) 竖直向上反弹 */
    result = api.stepBall({ x: 240, y: 570, vx: 0, vy: 400, dt: 0.1, paddleX: 240,
        bricks: makeBricks(4, 10, []) });
    assert.strictEqual(result.paddleHit, true, 'downward ball should hit the paddle');
    assert.ok(Math.abs(result.vx) < 1e-6, 'center hit should have no horizontal component');
    assert.ok(result.vy < 0, 'paddle should send the ball back upward');
    assert.ok(result.y < 592, 'ball should rest above the paddle after bounce');

    /* 挡板碰撞：边缘命中改向斜上方，且速率守恒 */
    result = api.stepBall({ x: 238, y: 570, vx: 0, vy: 400, dt: 0.1, paddleX: 200,
        bricks: makeBricks(4, 10, []) });
    assert.strictEqual(result.paddleHit, true, 'edge hit should still reach the paddle');
    assert.ok(result.vx > 0, 'right-side hit should send the ball up-right');
    assert.ok(result.vy < 0, 'edge hit should keep the ball moving upward');
    assert.ok(Math.abs(Math.hypot(result.vx, result.vy) - 400) < 1e-6,
        'paddle bounce should preserve the ball speed');

    /* 落底：球整体越出底边时报告 bottom */
    result = api.stepBall({ x: 240, y: 620, vx: 0, vy: 500, dt: 0.1, paddleX: 240,
        bricks: makeBricks(4, 10, []) });
    assert.strictEqual(result.bottom, true, 'ball passing the floor should report bottom');
    assert.strictEqual(result.paddleHit, false, 'ball below the paddle should not hit it');

    /* 高速球分片推进不穿透：560px/s 一帧仍能命中途经的砖 */
    const tunnelBricks = makeBricks(4, 10, [[0, 5]]);
    result = api.stepBall({ x: 263, y: 140, vx: 0, vy: -560, dt: 0.12, paddleX: 240, bricks: tunnelBricks });
    assert.ok(result.brickHit, 'fast ball should still hit the brick on its path');
    assert.strictEqual(result.brickHit.row, 0);
    assert.strictEqual(result.brickHit.col, 5);

    /* 连续多步高速推进：球始终不出界（分片步进保证穿墙即失败用例会先红） */
    let ball = { x: 240, y: 300, vx: 395.98, vy: 395.98, dt: 0.05, paddleX: 240, bricks: makeBricks(4, 10, []) };
    for (let step = 0; step < 60; step += 1) {
        if (ball.bottom) break;
        ball = api.stepBall(ball);
        assert.ok(ball.x >= 7 - 1e-6 && ball.x <= 473 + 1e-6, 'ball should never escape side walls');
        assert.ok(ball.y >= 7 - 1e-6, 'ball should never escape the top wall');
        if (!ball.bottom) {
            assert.ok(ball.y <= 647 + 1e-6, 'ball should report bottom before fully leaving the board');
        }
    }

    /* 偏离挡板的落点一落到底：越出底边即刻报告 bottom，不再继续逃逸 */
    result = api.stepBall({ x: 430, y: 600, vx: 0, vy: 560, dt: 0.1, paddleX: 240,
        bricks: makeBricks(4, 10, []) });
    assert.strictEqual(result.bottom, true, 'ball aimed past the paddle should report bottom');
}

function testLivesAndRecords() {
    /* 命耗尽：连续三次落底后进入 over 态 */
    const fresh = runScriptWithContext();
    fresh.api.startLevel(2, false);
    assert.strictEqual(fresh.api.state.phase, 'ready', 'starting a level should wait for launch');
    assert.strictEqual(fresh.api.state.lives, 3, 'a run should start with 3 lives');
    fresh.api.handleBallLoss();
    assert.strictEqual(fresh.api.state.phase, 'ready', 'losing one life should reset the ball');
    assert.strictEqual(fresh.api.state.lives, 2);
    fresh.api.handleBallLoss();
    fresh.api.handleBallLoss();
    assert.strictEqual(fresh.api.state.lives, 0, 'lives should bottom out at 0');
    assert.strictEqual(fresh.api.state.phase, 'over', 'exhausted lives should end the game');
    assert.strictEqual(fresh.api.state.modal, 'lose', 'game over should show the lose modal');

    /* 解锁进度持久化：只增不减 */
    assert.strictEqual(fresh.api.readUnlocked(), 1, 'unlocked level should default to 1');
    fresh.api.writeUnlocked(4);
    assert.strictEqual(fresh.storage.get('breakout-unlocked-level'), '4',
        'writeUnlocked should persist the level');
    fresh.api.writeUnlocked(2);
    assert.strictEqual(fresh.storage.get('breakout-unlocked-level'), '4',
        'writeUnlocked should never decrease');
    assert.strictEqual(fresh.api.readUnlocked(), 4);

    /* 最高分持久化：只增不减 */
    fresh.api.writeBest(320);
    assert.strictEqual(fresh.storage.get('breakout-best'), '320', 'writeBest should persist the score');
    fresh.api.writeBest(120);
    assert.strictEqual(fresh.api.readBest(), 320, 'writeBest should keep the maximum');

    /* 坏数据兜底：解锁与最高分分别退回默认值 */
    const corrupt = runScriptWithContext({
        seedStorage: [['breakout-unlocked-level', 'abc'], ['breakout-best', '-5']]
    });
    assert.strictEqual(corrupt.api.readUnlocked(), 1, 'corrupt unlocked save should fall back to 1');
    assert.strictEqual(corrupt.api.readBest(), 0, 'corrupt best save should fall back to 0');

    /* 本地存储不可用：退化为内存兜底，本会话内读写一致且不落盘 */
    const isolated = runScriptWithContext({ brokenStorage: true });
    isolated.api.writeBest(88);
    isolated.api.writeUnlocked(3);
    assert.strictEqual(isolated.api.readBest(), 88, 'readBest should use the in-memory fallback');
    assert.strictEqual(isolated.api.readUnlocked(), 3, 'readUnlocked should use the in-memory fallback');
    assert.strictEqual(isolated.storage.size, 0, 'broken storage should not record anything');
}

testFilesAndCatalogExist();
testGenerateLayout();
testReflectAngle();
testStepBall();
testLivesAndRecords();

console.log('breakout smoke test passed');
