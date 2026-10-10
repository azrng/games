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
        addEventListener() {}
    };

    /* requestAnimationFrame 桩不执行回调，游戏循环不被驱动，纯函数由断言直接验证 */
    const context = {
        window: {
            localStorage: localStorageStub,
            requestAnimationFrame() {
                return 1;
            },
            cancelAnimationFrame() {}
        },
        document: documentObject,
        Math,
        console
    };
    context.window.window = context.window;
    context.window.document = documentObject;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.Snake, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert(html.includes("../js/game-back.js"), 'page should mount the shared back button script');
    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'mobile page should disable viewport scaling');
    assert(html.includes('charset="UTF-8"'), 'page should declare UTF-8');
    assert(html.includes('<canvas id="board"'), 'page should host the game canvas');
    assert(html.includes('id="over-modal"'), 'page should include the game-over modal');

    const css = read('style.css');
    assert(css.includes('touch-action'), 'stylesheet should tune touch behaviour');
    assert(css.includes('#board'), 'stylesheet should style the canvas board');

    const script = read('script.js');
    assert(script.includes('snake-best'), 'script should use the snake-best save key');
    assert(script.includes('windowObject.Snake'), 'script should export the Snake api');

    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    assert(catalog.includes('slug: "snake"'), 'catalog should register snake');
    const homeApp = fs.readFileSync(path.join(root, '..', 'js', 'app.js'), 'utf8');
    assert(homeApp.includes('"snake"'), 'home page should give snake an icon and tag');
}

function testNextDirection() {
    const { api } = runScriptWithContext();

    /* 跳过相同方向与 180° 反向后取首个合法项（非法项留待后续步进再跳过） */
    let result = api.nextDirection('up', ['up', 'left', 'right', 'down']);
    assert.strictEqual(result.direction, 'left', 'should skip same and opposite directions');
    assert.deepStrictEqual(Array.from(result.remaining), ['right', 'down'], 'tail after the taken item should be kept');

    /* 队列尾部的合法项保留，供后续步进继续消化 */
    result = api.nextDirection('right', ['up', 'left']);
    assert.strictEqual(result.direction, 'up');
    assert.deepStrictEqual(Array.from(result.remaining), ['left']);

    /* 反向输入被丢弃 */
    result = api.nextDirection('up', ['down', 'left']);
    assert.strictEqual(result.direction, 'left');
    assert.deepStrictEqual(Array.from(result.remaining), []);

    /* 空队列与全非法队列保持原方向 */
    result = api.nextDirection('right', []);
    assert.strictEqual(result.direction, 'right');
    result = api.nextDirection('left', ['right', 'left']);
    assert.strictEqual(result.direction, 'left');
    assert.deepStrictEqual(Array.from(result.remaining), []);
}

/* 跨 vm 沙箱比较蛇身数组：逐格断言坐标，规避不同 realm 的 Object.prototype 不一致 */
function assertSnakeEquals(actual, expected, message) {
    assert.strictEqual(actual.length, expected.length, message || 'snake length should match');
    for (let index = 0; index < expected.length; index += 1) {
        assert.strictEqual(actual[index].x, expected[index].x, `snake cell ${index} x should match`);
        assert.strictEqual(actual[index].y, expected[index].y, `snake cell ${index} y should match`);
    }
}

function testStepSnake() {
    const { api } = runScriptWithContext();
    const snake = [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ];

    /* 正常前进一步：头部入列、尾部出列，且不修改入参 */
    let result = api.stepSnake(snake, 'right', { x: 15, y: 5 });
    assert.strictEqual(result.dead, false);
    assert.strictEqual(result.ate, false);
    assertSnakeEquals(result.snake, [
        { x: 11, y: 10 },
        { x: 10, y: 10 },
        { x: 9, y: 10 }
    ], 'normal step should advance the head and drop the tail');
    assert.deepStrictEqual(snake, [
        { x: 10, y: 10 },
        { x: 9, y: 10 },
        { x: 8, y: 10 }
    ], 'stepSnake should not mutate the input snake');

    /* 吃到食物：ate 为 true，尾部不出列，长度 +1 */
    result = api.stepSnake(snake, 'right', { x: 11, y: 10 });
    assert.strictEqual(result.ate, true);
    assert.strictEqual(result.dead, false);
    assert.strictEqual(result.snake.length, 4);
    assert.deepStrictEqual(result.snake[result.snake.length - 1], { x: 8, y: 10 });

    /* 撞墙：新头越出棋盘即死亡 */
    result = api.stepSnake([{ x: 0, y: 5 }, { x: 1, y: 5 }], 'left', null);
    assert.strictEqual(result.dead, true);
    result = api.stepSnake([{ x: 19, y: 5 }, { x: 18, y: 5 }], 'right', null);
    assert.strictEqual(result.dead, true);
    result = api.stepSnake([{ x: 5, y: 0 }, { x: 5, y: 1 }], 'up', null);
    assert.strictEqual(result.dead, true);

    /* 撞身：蛇头撞上非尾格的身体 */
    const loopSnake = [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
        { x: 6, y: 6 }
    ];
    result = api.stepSnake(loopSnake, 'down', null);
    assert.strictEqual(result.dead, true);

    /* 尾格例外：不吃食时尾部会让出，蛇头可以进入原尾格 */
    result = api.stepSnake([{ x: 5, y: 5 }, { x: 4, y: 5 }], 'left', null);
    assert.strictEqual(result.dead, false);
    assertSnakeEquals(result.snake, [{ x: 4, y: 5 }, { x: 5, y: 5 }], 'head may enter the cell the tail vacates');

    /* 同样的尾格追尾，但本步吃到食物、尾部不出列，则判定死亡 */
    result = api.stepSnake([{ x: 5, y: 5 }, { x: 4, y: 5 }], 'left', { x: 4, y: 5 });
    assert.strictEqual(result.dead, true);
}

/* 测试用线性同余随机数：可复现且分布均匀 */
function createTestRandom(seed) {
    let a = seed >>> 0;
    return function random() {
        a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
        return a / 4294967296;
    };
}

function testSpawnFood() {
    const { api } = runScriptWithContext();
    const snake = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 }
    ];

    /* 多次生成均不落在蛇身且都在棋盘内 */
    for (let round = 0; round < 200; round += 1) {
        const food = api.spawnFood(snake, 20, 20, createTestRandom(round * 7919 + 1));
        assert(food, 'food should spawn while free cells exist');
        assert(food.x >= 0 && food.x < 20 && food.y >= 0 && food.y < 20, 'food should stay inside the board');
        assert(!snake.some((cell) => cell.x === food.x && cell.y === food.y), 'food should not overlap the snake');
    }

    /* 蛇占满 20×20 棋盘时返回 null（视为通关） */
    const fullSnake = [];
    for (let y = 0; y < 20; y += 1) {
        for (let x = 0; x < 20; x += 1) {
            fullSnake.push({ x, y });
        }
    }
    assert.strictEqual(api.spawnFood(fullSnake, 20, 20, createTestRandom(42)), null);
}

function testBestScorePersistence() {
    /* 无存档时读 0，写入后 storage 值正确 */
    const fresh = runScriptWithContext();
    assert.strictEqual(fresh.api.readBest(), 0, 'readBest should fall back to 0 without save');
    fresh.api.writeBest(120);
    assert.strictEqual(fresh.storage.get('snake-best'), '120', 'writeBest should persist the score');
    assert.strictEqual(fresh.api.readBest(), 120);

    /* 更低分不覆盖历史最高 */
    fresh.api.writeBest(80);
    assert.strictEqual(fresh.storage.get('snake-best'), '120', 'writeBest should keep the maximum');

    /* 坏数据兜底为 0 */
    const broken = runScriptWithContext({ seedStorage: [['snake-best', 'not-a-number']] });
    assert.strictEqual(broken.api.readBest(), 0, 'readBest should fall back to 0 on corrupt save');

    /* 本地存储不可用时退化为内存兜底，本会话内读写一致 */
    const isolated = runScriptWithContext({ brokenStorage: true });
    isolated.api.writeBest(60);
    assert.strictEqual(isolated.api.readBest(), 60, 'readBest should use the in-memory fallback when storage throws');
    assert.strictEqual(isolated.storage.size, 0, 'broken storage should not record anything');
}

testFilesAndCatalogExist();
testNextDirection();
testStepSnake();
testSpawnFood();
testBestScorePersistence();

console.log('snake smoke test passed');
