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
        setAttribute(name) {
            element.attributes = element.attributes || {};
            return element.attributes[name];
        },
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
        Date,
        Number,
        String,
        JSON,
        Array,
        Object
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInNewContext(read('script.js'), context, { filename: 'script.js' });
    return { context, storage };
}

function json(value) {
    return JSON.stringify(value);
}

function testFilesAndCatalogExist() {
    const html = read('index.html');
    assert.ok(html.includes('../js/game-back.js'), 'index.html 应引入共享返回按钮');
    assert.ok(html.includes('viewport-fit=cover'), 'index.html 应含 viewport-fit=cover');
    assert.ok(html.includes('user-scalable=no'), 'index.html 应禁止缩放');
    const games = read('../data/games.js');
    assert.ok(games.includes('slug: "nonogram"'), 'games.js 应注册 nonogram');
    const app = read('../js/app.js');
    assert.ok(app.includes('"nonogram"'), 'app.js gameMeta 应含 nonogram');
    const css = read('style.css');
    assert.ok(css.includes('touch-action: manipulation'), 'style.css 应含触控优化样式');
}

function testLevelSizeMapping() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    assert.strictEqual(NG.levelSize(1), 5, '第 1 关应为 5×5');
    assert.strictEqual(NG.levelSize(8), 5, '第 8 关应为 5×5');
    assert.strictEqual(NG.levelSize(9), 10, '第 9 关应为 10×10');
    assert.strictEqual(NG.levelSize(20), 10, '第 20 关应为 10×10');
    assert.strictEqual(NG.levelSize(21), 15, '第 21 关应为 15×15');
}

function testComputeClues() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    assert.strictEqual(json(NG.computeClues([0, 1, 1, 0, 1])), json([2, 1]), '提示应为 [2,1]');
    assert.strictEqual(json(NG.computeClues([0, 0, 0])), json([0]), '空行提示应为 [0]');
    assert.strictEqual(json(NG.computeClues([1, 1, 1, 1, 1])), json([5]), '满行提示应为 [5]');
    assert.strictEqual(json(NG.computeClues([1, 0, 1, 0, 1])), json([1, 1, 1]), '提示应为 [1,1,1]');
}

function testSolveLine() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    // 3 格线放 3：全部必填
    const full = NG.solveLine([3], [-1, -1, -1]);
    assert.strictEqual(json(full.fill), json([0, 1, 2]), '整线块应全填');
    // 5 格线放 [2]，已知中格为填：两种摆法交集无新必填，但尾部 3、4 格必空
    const mid = NG.solveLine([2], [-1, 1, -1, -1, -1]);
    assert.strictEqual(json(mid.fill), json([]), '两种摆法交集应无新必填');
    assert.strictEqual(json(mid.empty), json([3, 4]), '尾部剩余格应必空');
    // 矛盾：块长超过可用空间
    assert.strictEqual(NG.solveLine([3], [0, -1, -1]), null, '无合法摆放应返回 null');
    // 空提示：全部必空
    const blank = NG.solveLine([0], [-1, -1, -1]);
    assert.strictEqual(json(blank.empty), json([0, 1, 2]), '空提示应全标空');
}

function testGeneratedLevelsAreUniqueAndDeterministic() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    for (let level = 1; level <= 10; level += 1) {
        const data = NG.generateLevel(level);
        assert.strictEqual(NG.solveUnique(data.solution), 'solved', '第 ' + level + ' 关底图应唯一解');
        // 提示组与底图自洽
        data.clues.rows.forEach((clue, r) => {
            assert.strictEqual(json(NG.computeClues(data.solution[r])), json(clue), '行提示应与底图一致');
        });
        for (let c = 0; c < data.size; c += 1) {
            const column = data.solution.map((row) => row[c]);
            assert.strictEqual(json(NG.computeClues(column)), json(data.clues.cols[c]), '列提示应与底图一致');
        }
    }
    // 同关两次生成完全一致（确定性）
    const a = NG.generateLevel(3);
    const b = NG.generateLevel(3);
    assert.strictEqual(json(a.solution), json(b.solution), '同关布局应可复现');
    assert.strictEqual(json(a.clues), json(b.clues), '同关提示应可复现');
}

function testCheckWin() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    const data = NG.generateLevel(2);
    const size = data.size;
    // 按底图填充应判胜
    const winCells = data.solution.map((row) => row.map((v) => (v === 1 ? 1 : 0)));
    assert.strictEqual(NG.checkWin(winCells, data.clues), true, '按底图填充应判胜');
    // 全空应判负（题面必有非空行列）
    const emptyCells = Array.from({ length: size }, () => new Array(size).fill(0));
    assert.strictEqual(NG.checkWin(emptyCells, data.clues), false, '全空不应判胜');
    // 锁定格（提示揭示）同样计入填格
    const lockedCells = data.solution.map((row) => row.map((v) => (v === 1 ? 3 : 0)));
    assert.strictEqual(NG.checkWin(lockedCells, data.clues), true, '锁定填格应等价判胜');
}

function testStarFor() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    assert.strictEqual(NG.starFor(1, 30000, 0), 3, '5×5 达标零提示应 3 星');
    assert.strictEqual(NG.starFor(1, 30001, 0), 2, '5×5 超时零提示应 2 星');
    assert.strictEqual(NG.starFor(1, 10000, 1), 1, '用过提示应 1 星');
    assert.strictEqual(NG.starFor(9, 150000, 0), 3, '10×10 达标零提示应 3 星');
    assert.strictEqual(NG.starFor(9, 150001, 0), 2, '10×10 超时零提示应 2 星');
    assert.strictEqual(NG.starFor(21, 420000, 0), 3, '15×15 达标零提示应 3 星');
}

function testPersistence() {
    const { context, storage } = buildContext();
    const NG = context.window.Nonogram;
    assert.strictEqual(NG.readUnlocked(), 1, '无存档解锁关应为 1');
    assert.strictEqual(NG.readBestMs(1), null, '无存档最快时间应为 null');
    assert.ok(NG.writeBestMs(1, 45000), '首次写入最快应成功');
    assert.strictEqual(NG.readBestMs(1), 45000, '读回应一致');
    assert.ok(!NG.writeBestMs(1, 60000), '更慢不应覆盖');
    assert.ok(NG.writeBestMs(1, 30000), '更快应覆盖');
    assert.strictEqual(storage.get('nonogram-best-1'), '30000', '存储键应为 nonogram-best-1');
    NG.writeStars(1, 2);
    NG.writeStars(1, 1);
    assert.strictEqual(NG.readStars(1), 2, '星级只增不减');
}

/** 缺陷回归：提示揭示的锁定格（值 3）不可被点击改写——旧实现点击会把 3 清成 0，静默丢掉提示 */
function testHintLockedCellNotEditable() {
    const { context } = buildContext();
    const NG = context.window.Nonogram;
    const board = context.document.getElementById('board');
    const size = NG.levelSize(1);
    const solution = NG.generateLevel(1).solution;
    /* renderBoard 子元素顺序：corner + size 个列提示，随后每行 [行提示 + size 个格子] */
    const cellOf = (r, c) => board.children[1 + size + r * (size + 1) + 1 + c];

    /* 用一次提示：随机揭示一个正解格为锁定填态 3 */
    context.document.getElementById('hint-btn').handlers.click();

    /* 整盘填成正确状态：正解格点 1 次（锁定格应保持 3 不受点击影响），空格点 2 次标叉 */
    for (let r = 0; r < size; r += 1) {
        for (let c = 0; c < size; c += 1) {
            const clicks = solution[r][c] === 1 ? 1 : 2;
            for (let i = 0; i < clicks; i += 1) cellOf(r, c).handlers.click();
        }
    }
    assert.strictEqual(
        context.document.getElementById('win-modal').hidden,
        false,
        '锁定格未被点击清掉时，整盘正确填涂应触发通关'
    );
}

testFilesAndCatalogExist();
testLevelSizeMapping();
testComputeClues();
testSolveLine();
testGeneratedLevelsAreUniqueAndDeterministic();
testCheckWin();
testStarFor();
testPersistence();
testLongPressFullSequence();
testTouchMoveAndCancelAbortLongPress();
testTouchCancelAbortsLongPress();
testSyntheticClickConsumesLongPressFlag();
testStaleLongPressFlagDoesNotBlockMouseRightClick();
testHintLockedCellNotEditable();

/* ---------- 触摸长按时序用例（事件桩可驱动，见 element.handlers 收集监听器） ---------- */

/** 从棋盘子元素中取出格子按钮桩（tag 为 button 的元素） */
function getCellButtons(contextObject) {
    const board = contextObject.document.getElementById('board');
    return board.children.filter((el) => el.tag === 'button');
}

/**
 * 构建可手动触发长按定时器的上下文：
 * 默认桩的 setTimeout 会丢弃回调，这里覆写为捕获回调，用 fire() 模拟 350ms 到点。
 */
function buildLongPressContext() {
    const built = buildContext();
    let timerCallback = null;
    let clearCount = 0;
    built.context.window.setTimeout = (fn) => {
        timerCallback = fn;
        return 7;
    };
    built.context.window.clearTimeout = () => {
        clearCount += 1;
    };
    built.longPress = {
        fire() {
            const callback = timerCallback;
            timerCallback = null;
            if (callback) callback();
        },
        pending() {
            return timerCallback !== null;
        },
        clearCount() {
            return clearCount;
        }
    };
    return built;
}

/** Android Chrome 长按全序列：定时器标叉 → contextmenu → 合成 click，格子只翻转一次，撤销栈只多 1 条 */
function testLongPressFullSequence() {
    const { context, longPress } = buildLongPressContext();
    const cell = getCellButtons(context)[0];
    const prevented = [];
    cell.handlers.touchstart();
    assert.ok(longPress.pending(), 'touchstart 应登记 350ms 长按定时器');
    longPress.fire();
    assert.ok(cell.className.includes('is-mark'), '长按到点应直接标叉');
    cell.handlers.contextmenu({ preventDefault: () => prevented.push(1) });
    assert.strictEqual(prevented.length, 1, 'contextmenu 应阻止默认长按菜单');
    assert.ok(cell.className.includes('is-mark'), 'contextmenu 不应再翻转已标叉的格子');
    cell.handlers.click();
    assert.ok(cell.className.includes('is-mark'), '合成 click 不应再翻转（净效果只标一次叉）');
    // 撤销栈恰有 1 条快照：撤销一次回到初始空格，再撤销无快照可弹
    context.document.getElementById('undo-btn').handlers.click();
    assert.strictEqual(cell.className, 'nono-cell', '撤销一次应回到初始空格');
    context.document.getElementById('undo-btn').handlers.click();
    assert.strictEqual(cell.className, 'nono-cell', '再次撤销应无快照可弹（栈中仅 1 条）');
}

/** touchmove / touchcancel 应取消长按定时器，后续点击仍走正常三态切换 */
function testTouchMoveAndCancelAbortLongPress() {
    const { context, longPress } = buildLongPressContext();
    const cell = getCellButtons(context)[0];
    cell.handlers.touchstart();
    cell.handlers.touchmove();
    assert.strictEqual(longPress.clearCount(), 1, 'touchmove 应清除长按定时器');
    assert.strictEqual(cell.className, 'nono-cell', '手指移动后不应在起点落叉');
    cell.handlers.touchend();
    cell.handlers.click();
    assert.ok(cell.className.includes('is-fill'), '移动+抬起后的点击应正常三态切换为填');
}

/** touchcancel（如来电、系统手势打断）同样应取消长按 */
function testTouchCancelAbortsLongPress() {
    const { context, longPress } = buildLongPressContext();
    const cell = getCellButtons(context)[0];
    cell.handlers.touchstart();
    cell.handlers.touchcancel();
    assert.strictEqual(longPress.clearCount(), 1, 'touchcancel 应清除长按定时器');
    cell.handlers.touchend();
    cell.handlers.click();
    assert.ok(cell.className.includes('is-fill'), '取消后抬起点击应正常三态切换为填');
}

/** 旧 WebView 流：长按后无 contextmenu，只有 touchend + 合成 click，click 应消费标志而不是再翻转 */
function testSyntheticClickConsumesLongPressFlag() {
    const { context, longPress } = buildLongPressContext();
    const cells = getCellButtons(context);
    const cell = cells[0];
    cell.handlers.touchstart();
    longPress.fire();
    cell.handlers.touchend();
    cell.handlers.click();
    assert.ok(cell.className.includes('is-mark'), '合成 click 应消费长按标志，保持只标一次叉');
}

/** 触摸长按后的残留标志不得影响桌面鼠标右键（混合设备场景） */
function testStaleLongPressFlagDoesNotBlockMouseRightClick() {
    const { context, longPress } = buildLongPressContext();
    const cells = getCellButtons(context);
    // 长按既无 contextmenu 也无 click：标志残留为 true
    cells[0].handlers.touchstart();
    longPress.fire();
    cells[0].handlers.touchend();
    // 此时用鼠标右键点另一格：应正常标叉
    const another = cells[1];
    another.handlers.contextmenu({ preventDefault() {} });
    assert.ok(another.className.includes('is-mark'), '残留长按标志不应吞掉桌面右键标叉');
    // 桌面右键标叉后左键继续三态切换（叉→空），行为与修复前一致
    another.handlers.click();
    assert.strictEqual(another.className, 'nono-cell', '右键标叉后左键应按三态回到空');
}

/* 生成性能粗测：最大规格出题耗时应可忽略 */
const started = Date.now();
buildContext().context.window.Nonogram.generateLevel(21);
console.log('15×15 第 21 关生成耗时 ' + (Date.now() - started) + 'ms');
console.log('nonogram smoke test passed');
