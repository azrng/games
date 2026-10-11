const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* ---------- DOM/localStorage 最小桩 ---------- */

function createElement(tag) {
    const element = {
        tag,
        id: '',
        textContent: '',
        title: '',
        hidden: false,
        disabled: false,
        className: '',
        dataset: {},
        style: { setProperty() {} },
        children: [],
        handlers: {},
        classList: {
            add() {},
            remove() {},
            toggle() {}
        },
        addEventListener(name, handler) {
            element.handlers[name] = handler;
        },
        appendChild(child) {
            element.children.push(child);
            return child;
        },
        replaceChildren(...children) {
            element.children = children;
        },
        setAttribute() {},
        removeAttribute() {}
    };
    return element;
}

function buildContext() {
    const storage = new Map();
    const elements = new Map();

    function getElementById(id) {
        if (!elements.has(id)) {
            const el = createElement('div');
            el.id = id;
            elements.set(id, el);
        }
        return elements.get(id);
    }

    const context = {
        window: {
            localStorage: {
                getItem: (key) => (storage.has(key) ? storage.get(key) : null),
                setItem: (key, value) => { storage.set(key, String(value)); },
                removeItem: (key) => { storage.delete(key); }
            },
            setInterval: () => 1,
            clearInterval: () => {},
            setTimeout: () => 1,
            clearTimeout: () => {},
            addEventListener() {}
        },
        document: {
            getElementById,
            createElement,
            addEventListener() {}
        },
        console,
        Math,
        Number,
        String,
        JSON,
        Array,
        Object,
        Set
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInNewContext(read('levels.js'), context, { filename: 'levels.js' });
    vm.runInNewContext(read('script.js'), context, { filename: 'script.js' });
    return { context, storage, window: context.window };
}

function keySetEquals(set, keys) {
    return set.size === keys.length && keys.every((k) => set.has(k));
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert.ok(html.includes('../js/game-back.js'), 'index.html 应引入共享返回按钮');
    assert.ok(html.includes('viewport-fit=cover'), 'index.html 应含 viewport-fit=cover');
    assert.ok(html.includes('user-scalable=no'), 'index.html 应禁止缩放');
    assert.ok(html.includes('levels.js'), 'index.html 应加载关卡数据');
    const games = read('../data/games.js');
    assert.ok(games.includes('slug: "sokoban"'), 'games.js 应注册 sokoban');
    const app = read('../js/app.js');
    assert.ok(app.includes('"sokoban"'), 'app.js gameMeta 应含 sokoban');
    const css = read('style.css');
    assert.ok(css.includes('touch-action'), 'style.css 应含触控优化样式');
    // 死角提示：提示条元素与样式必须存在
    assert.ok(html.includes('id="deadlock-hint"'), 'index.html 应含死角提示条');
    assert.ok(css.includes('.deadlock-hint'), 'style.css 应含死角提示条样式');
    assert.ok(css.includes('.is-dead'), 'style.css 应含死箱警示样式');
    assert.ok(read('script.js').includes('findDeadBoxes'), 'script.js 应导出死角检测函数');
}

function testAllLevelsParseValid() {
    const { window } = buildContext();
    const SK = window.Sokoban;
    const levels = window.SOKOBAN_LEVELS;
    assert.strictEqual(levels.length, 60, '关卡数据应为 60 关');
    levels.forEach((text, index) => {
        const level = SK.parseLevel(text);
        assert.strictEqual(level.boxes.size, level.goals.size, '第 ' + (index + 1) + ' 关箱数应等于目标数');
        assert.ok(level.boxes.size >= 1, '第 ' + (index + 1) + ' 关至少 1 箱');
        assert.ok(level.width <= 20 && level.height <= 16, '第 ' + (index + 1) + ' 关尺寸应在移动端可渲染范围');
    });
    // 非法关卡应抛错
    assert.throws(() => SK.parseLevel('####\n#@  #\n######'), /箱子/, '无箱关卡应抛错');
    assert.throws(() => SK.parseLevel('#$.#\n####'), /玩家/, '缺玩家关卡应抛错');
}

function testApplyMoveRules() {
    const { window } = buildContext();
    const SK = window.Sokoban;
    // 键值约定 keyOf(x, y) = y*100 + x
    // 迷你关 A：人在(1,1)、箱在(2,1)、目标在(4,1)
    const level = SK.parseLevel('######\n#@$ .#\n######');
    let game = SK.createState(level);

    // 向右推一格成功
    let result = SK.applyMove(game, 'right');
    assert.ok(result.moved && result.pushed, '空地推箱应成功');
    assert.strictEqual(result.game.moves, 1, '步数 +1');
    assert.strictEqual(result.game.pushes, 1, '推数 +1');
    assert.ok(result.game.boxes.has(103), '箱子应移到 (3,1)');
    const after = result.game;

    // 向左走（无箱）成功
    result = SK.applyMove(after, 'left');
    assert.ok(result.moved && !result.pushed, '空地行走应成功且非推');

    // 向上撞墙：无效
    result = SK.applyMove(after, 'up');
    assert.ok(!result.moved, '撞墙应无效');
    assert.strictEqual(result.game.moves, after.moves, '无效移动不计数');
    assert.strictEqual(result.game, after, '无效移动应原样返回同一状态');

    // 推两连箱：无效（第二箱在目标点上，用 * 保证箱数=目标数）
    const twoBoxGame = SK.createState(SK.parseLevel('######\n#@$*.#\n######'));
    result = SK.applyMove(twoBoxGame, 'right');
    assert.ok(!result.moved, '推两连箱应无效');

    // 推箱入墙：无效（箱右侧是墙）
    const wallGame = SK.createState(SK.parseLevel('#####\n#@$##\n##.##\n#####'));
    result = SK.applyMove(wallGame, 'right');
    assert.ok(!result.moved, '推箱入墙应无效');
}

function testUndoRoundtrip() {
    const { window } = buildContext();
    const SK = window.Sokoban;
    // 迷你关 A：人在(1,1)、箱在(2,1)、目标在(4,1)
    const start = SK.createState(SK.parseLevel('######\n#@$ .#\n######'));
    // 连走两步（推一格 + 空走一格），逐步撤销应精确回到初始
    const step1 = SK.applyMove(start, 'right').game;
    const step2 = SK.applyMove(step1, 'left').game;
    assert.strictEqual(step2.moves, 2, '两步后步数应为 2');
    const undo1 = SK.undoMove(step2).game;
    assert.strictEqual(undo1.moves, 1, '撤销一步回 1');
    assert.ok(keySetEquals(undo1.boxes, [103]), '撤销后箱位回到第一次推动后');
    const undo2 = SK.undoMove(undo1).game;
    assert.strictEqual(undo2.moves, 0, '撤销两步回 0');
    assert.ok(keySetEquals(undo2.boxes, [102]), '箱位回到初始');
    assert.deepStrictEqual([undo2.player.x, undo2.player.y], [start.player.x, start.player.y], '玩家回到初始');
    assert.ok(!SK.undoMove(undo2).moved, '空栈撤销应无效');
}

function testSolvedDetection() {
    const { window } = buildContext();
    const SK = window.Sokoban;
    // 一推即胜的迷你关
    const level = SK.parseLevel('#####\n#@$.#\n#####');
    const game = SK.createState(level);
    assert.ok(!SK.isSolved(game), '开局不应判胜');
    const done = SK.applyMove(game, 'right').game;
    assert.ok(SK.isSolved(done), '箱子到位应判胜');
}

function testDeadBoxDetection() {
    const { window } = buildContext();
    const SK = window.Sokoban;
    /* vm 沙箱数组原型与宿主不同，先 JSON 落回再比较 */
    const host = (arr) => JSON.parse(JSON.stringify(arr));
    // 死角关：箱在(2,1)，右(3,1)与下(2,2)均为墙，推右即入死角；目标点在(4,1)远处
    const level = SK.parseLevel('######\n#@$ ##\n##  .#\n######');
    let game = SK.createState(level);
    assert.deepStrictEqual(host(SK.findDeadBoxes(game)), [], '开局无死箱');

    // 向右推：箱子进入 (3,1)，右侧(4,1)是墙、下方(3,2)是墙 → 死角
    game = SK.applyMove(game, 'right').game;
    const dead = host(SK.findDeadBoxes(game));
    assert.strictEqual(dead.length, 1, '入角后应检出 1 个死箱');
    assert.strictEqual(dead[0], 103, '死箱应在 (3,1) 即 key 103');

    // 贴墙但可沿墙推动的箱子不算死：箱在(2,1)上方是墙，但左右通畅仍可推
    const wallSlide = SK.createState(SK.parseLevel('#####\n#@$ #\n##.##\n#####'));
    assert.deepStrictEqual(host(SK.findDeadBoxes(wallSlide)), [], '贴墙仍可左右推的箱子不算死箱');

    // 箱子停在目标点上即使被围也不算死（已归位）
    const onGoal = SK.createState(SK.parseLevel('#####\n#@ *#\n#####'));
    assert.deepStrictEqual(host(SK.findDeadBoxes(onGoal)), [], '目标点上的箱子不算死箱');
}

function testTierGrouping() {
    const { window } = buildContext();
    const SK = window.Sokoban;
    assert.strictEqual(SK.tierOfLevel(1), '入门', '第 1 关属入门');
    assert.strictEqual(SK.tierOfLevel(20), '入门', '第 20 关属入门');
    assert.strictEqual(SK.tierOfLevel(21), '进阶', '第 21 关属进阶');
    assert.strictEqual(SK.tierOfLevel(40), '进阶', '第 40 关属进阶');
    assert.strictEqual(SK.tierOfLevel(41), '挑战', '第 41 关属挑战');
    assert.strictEqual(SK.tierOfLevel(60), '挑战', '第 60 关属挑战');
}

function testPersistence() {
    const { storage, window } = buildContext();
    const SK = window.Sokoban;
    assert.strictEqual(SK.readUnlocked(), 1, '无存档解锁关应为 1');
    assert.strictEqual(SK.readBestMoves(1), 0, '无存档最少步应为 0');
    assert.ok(SK.writeBestMoves(1, 42), '首次写入最少步应成功');
    assert.strictEqual(SK.readBestMoves(1), 42, '读回应一致');
    assert.ok(!SK.writeBestMoves(1, 50), '更多步不应覆盖');
    assert.ok(SK.writeBestMoves(1, 30), '更少步应覆盖');
    assert.strictEqual(storage.get('sokoban-best-1'), '30', '存储键应为 sokoban-best-1');
}

testFilesAndCatalogExist();
testAllLevelsParseValid();
testApplyMoveRules();
testUndoRoundtrip();
testSolvedDetection();
testDeadBoxDetection();
testTierGrouping();
testPersistence();

console.log('sokoban smoke test passed');
