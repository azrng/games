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
        'program-count',
        'par-text',
        'best-text',
        'grid',
        'status-text',
        'program-strip',
        'program-hint',
        'btn-forward',
        'btn-left',
        'btn-right',
        'run-btn',
        'stop-btn',
        'clear-btn',
        'demo-btn',
        'restart-btn',
        'levels-btn',
        'win-modal',
        'result-stars',
        'result-steps',
        'result-par',
        'result-gems',
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
    return { api: context.window.RobotApi, storage };
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');

    assert(html.includes('viewport-fit=cover'), 'page should use viewport-fit=cover');
    assert(html.includes('user-scalable=no'), 'page should disable viewport scaling');
    assert(html.includes('../js/game-back.js'), 'page should mount the shared back button script');
    assert(html.includes('编程小机器人 - 游戏平台'), 'page title should follow platform convention');
    assert(html.includes('id="grid"'), 'page should render a robot grid host');
    assert(html.includes('id="program-strip"'), 'page should render the program strip');
    assert(css.includes('--cr-'), 'styles should use the code-robot variable prefix');
    assert(css.includes('display: grid'), 'board should use CSS Grid');
    assert(script.includes('windowObject.RobotApi'), 'script should expose window.RobotApi');
    assert(catalog.includes('slug: "code-robot"'), 'catalog should register code-robot');
    assert(catalog.includes('mobilePath: "src/code-robot/index.html"'), 'catalog should route mobile to code-robot');
}

/* 12 关结构断言 + 每关参考解法必须恰好 par 步通关且集齐宝石 */
function testLevelCatalogAndReferenceSolutions() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.levelCount(), 12, 'game should ship 12 levels');

    for (let level = 1; level <= api.levelCount(); level += 1) {
        const parsed = api.parseLevel(level);
        const definition = api.getLevel(level);

        const expectedSize = level <= 4 ? 5 : level <= 8 ? 6 : 7;
        assert.strictEqual(parsed.size, expectedSize, `level ${level}: board size should follow the tier plan`);
        assert(parsed.start && parsed.goal, `level ${level}: start and goal must exist`);
        assert(!parsed.walls.includes(api.cellIndex(parsed.size, parsed.goal.row, parsed.goal.col)),
            `level ${level}: goal cell must not be a wall`);

        if (level <= 3) {
            assert.strictEqual(parsed.walls.length, 0, `level ${level}: opening levels should have no walls`);
        } else if (level <= 6) {
            assert(parsed.walls.length > 0, `level ${level}: wall tier should contain walls`);
        }
        if (level <= 6) {
            assert.strictEqual(parsed.gems.length, 0, `level ${level}: no gems before level 7`);
        } else if (level <= 9) {
            assert(parsed.gems.length >= 1 && parsed.gems.length <= 2, `level ${level}: gem tier has 1-2 gems`);
        } else {
            assert(parsed.gems.length >= 2, `level ${level}: complex tier needs multiple gems`);
        }

        assert.strictEqual(
            api.maxProgramLength(level),
            parsed.par + 4,
            `level ${level}: program cap should be par + 4`
        );
        assert.strictEqual(definition.referenceProgram.length, parsed.par,
            `level ${level}: reference program length should equal par`);

        const result = api.simulateProgram(level, definition.referenceProgram);
        assert.strictEqual(result.ok, true, `level ${level}: reference program should clear the level`);
        assert.strictEqual(result.steps, parsed.par, `level ${level}: reference program should take exactly par steps`);
        assert.strictEqual(result.gemsCollected, parsed.gems.length,
            `level ${level}: reference program should collect every gem`);
        assert.strictEqual(result.crashAt, 0, `level ${level}: reference program should never crash`);
    }
}

/* simulateProgram 边界：撞墙、出界、宝石未集齐、程序截断、过关即提前结束 */
function testSimulateEdges() {
    const { api } = runScriptWithContext();

    /* 撞墙：第 4 关向右走到 (3,2) 的墙 */
    const wallRun = api.simulateProgram(4, ['F', 'F', 'L', 'F', 'F']);
    assert.strictEqual(wallRun.ok, false, 'walking into a wall must fail');
    assert.strictEqual(wallRun.crashAt, 5, 'crash position should point at the forward command');
    assert.strictEqual(wallRun.crashReason, 'wall', 'crash reason should be wall');
    assert.strictEqual(wallRun.steps, 4, 'steps should count completed moves before the crash');

    /* 出界：第 2 关从顶行继续向上冲出棋盘 */
    const boundsRun = api.simulateProgram(2, ['F', 'F', 'F', 'F', 'F']);
    assert.strictEqual(boundsRun.ok, false, 'leaving the board must fail');
    assert.strictEqual(boundsRun.crashAt, 5, 'out-of-bounds should report the failing command');
    assert.strictEqual(boundsRun.crashReason, 'bounds', 'crash reason should be bounds');

    /* 宝石未集齐到达终点：不算过关 */
    const greedyRun = api.simulateProgram(8, ['F', 'F', 'F', 'R', 'F', 'F', 'F', 'F', 'F', 'L', 'F', 'F']);
    assert.strictEqual(greedyRun.ok, false, 'reaching the goal without gems must not win');
    assert.strictEqual(greedyRun.crashAt, 0, 'no crash happened in the greedy run');
    assert.strictEqual(greedyRun.gemsCollected, 0, 'greedy run should report zero gems');
    assert.strictEqual(greedyRun.steps, 12, 'greedy run should consume the whole program');

    /* 收集部分宝石但未通关：第 7 关前进 4 步捡到第一颗宝石 */
    const partialRun = api.simulateProgram(7, ['F', 'F', 'F', 'F']);
    assert.strictEqual(partialRun.ok, false, 'stopping on a gem is not a win');
    assert.strictEqual(partialRun.gemsCollected, 1, 'partial run should collect one gem');
    assert.strictEqual(partialRun.crashAt, 0, 'partial run has no crash');

    /* 程序超长：按 maxProgramLength 截断执行 */
    const truncatedRun = api.simulateProgram(2, new Array(20).fill('L'));
    assert.strictEqual(truncatedRun.steps, api.maxProgramLength(2), 'program should be truncated to the cap');
    assert.strictEqual(truncatedRun.ok, false, 'a turn-only program should not win');
    assert.strictEqual(truncatedRun.crashAt, 0, 'turn-only program should not crash');

    /* 到达终点即过关，多余指令不再执行 */
    const earlyWin = api.simulateProgram(1, ['F', 'F', 'F', 'F', 'F', 'F']);
    assert.strictEqual(earlyWin.ok, true, 'straight run should win level 1');
    assert.strictEqual(earlyWin.steps, 4, 'win should stop the program right at the goal');

    /* stepRobot 纯函数：左转四次回到原朝向，撞墙时位置不变 */
    const parsed = api.parseLevel(1);
    let run = api.createRunState(parsed);
    assert.strictEqual(run.facing, 'R', 'level 1 should start facing right');
    run = api.stepRobot(parsed, run, 'L').state;
    assert.strictEqual(run.facing, 'U', 'left turn from right should face up');
    run = api.stepRobot(parsed, run, 'L').state;
    run = api.stepRobot(parsed, run, 'L').state;
    run = api.stepRobot(parsed, run, 'L').state;
    assert.strictEqual(run.facing, 'R', 'four left turns should face right again');

    const wallParsed = api.parseLevel(4);
    const blockedRun = { row: 3, col: 1, facing: 'R', collected: [], steps: 2 };
    const blocked = api.stepRobot(wallParsed, blockedRun, 'F');
    assert(blocked.crashed, 'forward into a wall should crash');
    assert.strictEqual(blocked.state.row, 3, 'crash should not move the robot');
    assert.strictEqual(blocked.state.col, 1, 'crash should not move the robot');
}

/* 星级边界与存档规则：unlocked 只增不减、stars 保留最大值 */
function testStarRatingAndRecords() {
    const { api, storage } = runScriptWithContext();

    assert.strictEqual(api.starRating(5, 5), 3, 'par steps earn three stars');
    assert.strictEqual(api.starRating(6, 5), 2, 'par+1 earns two stars');
    assert.strictEqual(api.starRating(7, 5), 2, 'par+2 earns two stars');
    assert.strictEqual(api.starRating(8, 5), 1, 'par+3 still clears with one star');

    api.saveUnlockedLevel(5);
    assert.strictEqual(storage.get('code-robot-unlocked-level'), '5', 'unlock should persist');
    api.saveUnlockedLevel(3);
    assert.strictEqual(storage.get('code-robot-unlocked-level'), '5', 'unlock level should never regress');
    api.saveUnlockedLevel(99);
    assert.strictEqual(storage.get('code-robot-unlocked-level'), '12', 'unlock should clamp to level count');

    api.saveStars(3, 2);
    assert.strictEqual(storage.get('code-robot-stars-3'), '2', 'stars should persist');
    api.saveStars(3, 3);
    assert.strictEqual(storage.get('code-robot-stars-3'), '3', 'better stars should overwrite');
    api.saveStars(3, 1);
    assert.strictEqual(storage.get('code-robot-stars-3'), '3', 'worse stars should keep the maximum');
    assert.strictEqual(api.loadStars(9), 0, 'unplayed levels default to zero stars');
}

testFilesAndCatalogExist();
testLevelCatalogAndReferenceSolutions();
testSimulateEdges();
testStarRatingAndRecords();

console.log('code robot smoke test passed');
