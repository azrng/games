const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

/* 可复现的 mulberry32 种子随机 */
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* 加载脚本：页面 UI 因缺少棋盘 canvas 而不启动，仅暴露 window.Tetris */
function loadScript() {
    const context = {
        window: {},
        document: {
            getElementById: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {}
        },
        performance: { now: () => 0 },
        requestAnimationFrame: () => 1,
        localStorage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        }
    };
    context.window.window = context.window;
    vm.createContext(context);
    vm.runInContext(read('script.js'), context);
    return context.window.Tetris;
}

const T = loadScript();

function testFilesAndStructure() {
    const html = read('index.html');
    assert(html.includes('charset="UTF-8"'), 'page should declare UTF-8');
    assert(html.includes('src="script.js"'), 'page should load the rewritten script');
    assert(html.includes('id="board-canvas"'), 'page should keep the board canvas');
    assert(html.includes('id="hold-canvas"') && html.includes('id="next-canvas"'),
        'page should provide hold and next canvases');
    assert(html.includes('../js/game-back.js'), 'page should mount the shared back button');
    assert(html.includes('id="mobile-gate"') && html.includes('mobile-gate-continue'),
        'page should keep the mobile gate and its continue button');
    assert(html.includes('app_tetris_mobile_gate_dismissed'),
        'gate dismissal should stay in sessionStorage');
    assert(!html.includes('app-1.0.1.js'), 'page should not reference the old react-tetris bundle');
    assert(!html.includes('width=640'), 'page should drop the legacy 640px viewport hack');

    const css = read('style.css');
    assert(css.includes('safe-area-inset-top'), 'layout should avoid the top safe area');
    assert(css.includes('pointer: coarse'), 'touch pad should show on coarse pointers');

    const script = read('script.js');
    for (const marker of ['TETRIS_KICKS_JLSTZ', 'TETRIS_KICKS_I', 'detectTSpin', 'ghostY', 'doHold']) {
        assert(script.includes(marker), `script should contain ${marker}`);
    }
    assert(script.includes('window.Tetris'), 'script should export the test surface');
}

function testSevenBag() {
    /* 空棋盘上只统计出块序列：每块落下后清板，避免堆到顶部误判结束 */
    for (const seed of [1, 42, 2026]) {
        const game = T.createTetrisCore(mulberry32(seed));
        game.start();
        const seq = [];
        for (let i = 0; i < 28; i++) {
            seq.push(game.core.active.type);
            game.core.board.forEach((row) => row.fill(null));
            game.hardDrop();
            assert(!game.core.over, `seed ${seed} block ${i}: empty board should never top out`);
        }
        for (let w = 0; w < 4; w++) {
            const windowTypes = seq.slice(w * 7, w * 7 + 7).sort().join('');
            assert.strictEqual(windowTypes, 'IJLOSTZ',
                `seed ${seed} window ${w} should contain all 7 shapes once`);
        }
    }
}

function testSRSSpins() {
    /* JLSTZ 踢墙：T 块贴左墙竖排障碍中旋转仍成功 */
    const game = T.createTetrisCore(mulberry32(7));
    game.start();
    game.core.board.forEach((row) => row.fill(null));
    game.core.active.type = 'T';
    game.core.active.rot = 0;
    game.core.active.x = 0;
    game.core.active.y = 10;
    assert(game.rotate(-1), 'T should rotate counter-clockwise against the left wall via SRS kick');
    assert.strictEqual(game.core.active.rot, 3, 'rotation should land on state 3');

    /* I 块墙踢：rot1（竖直）-> rot2（水平） */
    const g2 = T.createTetrisCore(mulberry32(7));
    g2.start();
    g2.core.board.forEach((row) => row.fill(null));
    g2.core.active.type = 'I';
    g2.core.active.rot = 1;
    g2.core.active.x = 0;
    g2.core.active.y = 10;
    assert(g2.rotate(1), 'I should kick-rotate from vertical to horizontal near the wall');
    assert.strictEqual(g2.core.active.rot, 2, 'I rotation should land on state 2');

    /* 被完全封死的旋转必须失败（踢墙表救不了的场景） */
    const g3 = T.createTetrisCore(mulberry32(7));
    g3.start();
    g3.core.board.forEach((row) => row.fill(null));
    g3.core.active.type = 'T';
    g3.core.active.rot = 0;
    g3.core.active.x = 4;
    g3.core.active.y = 10;
    // 在 T 周围铺满其他格子，只留 T 自身形状的空间
    for (let y = 9; y <= 12; y++) {
        for (let x = 3; x <= 6; x++) {
            const inT = [[5, 10], [4, 11], [5, 11], [6, 11]].some(([cx, cy]) => cx === x && cy === y);
            if (!inT) g3.core.board[y][x] = 'J';
        }
    }
    assert(!g3.rotate(1), 'rotation with zero kick room should fail');
    assert.strictEqual(g3.core.active.rot, 0, 'failed rotation should not change state');
}

function testGhostAndHardDrop() {
    const game = T.createTetrisCore(mulberry32(3));
    game.start();
    game.core.board.forEach((row) => row.fill(null));
    const a = game.core.active;
    // 底部两行铺满，中央留两列缝
    for (let x = 0; x < 10; x++) {
        if (x !== 4 && x !== 5) {
            game.core.board[20][x] = 'J';
            game.core.board[21][x] = 'J';
        }
    }
    a.type = 'I';
    a.rot = 0;
    a.x = 3;
    a.y = 0;
    assert.strictEqual(game.ghostY(), 18, 'I horizontal should rest on row 18 (cells at row 19)');
    const dist = game.hardDrop();
    assert.strictEqual(dist, 18, 'hard drop distance should match ghost position');
    assert.strictEqual(game.core.score, dist * 2, 'hard drop should score 2 per cell');
    assert.strictEqual(game.core.board[19][3], 'I', 'locked piece cells should be written to the board');
    assert(game.core.active, 'the next piece should spawn after locking');
}

function testTSpinScoring() {
    /* 标准 TST 槽：T-spin double 应得 1200×1 且标记 difficult（B2B 生效） */
    const game = T.createTetrisCore(mulberry32(7));
    game.start();
    const B = game.core.board;
    B.forEach((row) => row.fill(null));
    for (let x = 3; x < 10; x++) B[19][x] = 'J';
    for (let x = 0; x < 10; x++) { if (x !== 1) { B[20][x] = 'J'; B[21][x] = 'J'; } }
    B[19][0] = 'J';
    B[19][2] = 'J';
    game.core.active.type = 'T';
    game.core.active.rot = 2;
    game.core.active.x = 0;
    game.core.active.y = 19;
    game.core.lastAction = 'rotate';
    assert.strictEqual(game.detectTSpin(), 'full', 'TST slot should detect a full T-spin');
    game.lockPiece();
    assert.strictEqual(game.core.lastLock.tspin, 'full', 'lock result should carry the T-spin');
    assert.strictEqual(game.core.lastLock.clears, 2, 'TST should clear two rows');
    assert.strictEqual(game.core.score, 1200, 'T-spin double at level 1 should score 1200');
    assert.strictEqual(game.core.b2b, true, 'T-spin clears should arm back-to-back');

    /* 普通 1 消不继承 B2B */
    const g2 = T.createTetrisCore(mulberry32(7));
    g2.start();
    g2.core.b2b = true;
    const row = g2.core.board[21];
    row.fill('J');
    row[0] = null;
    row[1] = null;
    row[2] = null;
    g2.core.active.type = 'O';
    g2.core.active.rot = 0;
    g2.core.active.x = 3;
    g2.core.active.y = 20;
    g2.core.lastAction = 'move';
    g2.lockPiece();
    assert.strictEqual(g2.core.lastLock.clears, 0, 'O over the gap locks without clearing');
    // 填满末行再单消，验证 B2B 被普通消行打断
    const g3 = T.createTetrisCore(mulberry32(7));
    g3.start();
    g3.core.b2b = true;
    g3.core.board[21].fill('J');
    g3.core.active.type = 'I';
    g3.core.active.rot = 1;
    g3.core.active.x = 4;
    g3.core.active.y = 17;
    g3.core.lastAction = 'move';
    g3.lockPiece();
    assert.strictEqual(g3.core.lastLock.clears, 1, 'vertical I should fill and clear one row');
    assert.strictEqual(g3.core.b2b, false, 'a normal single clear should break back-to-back');
    assert.strictEqual(g3.core.score, 100, 'single clear at level 1 should score 100');
}

function testLockDelayAndGravity() {
    const game = T.createTetrisCore(mulberry32(5));
    game.start();
    game.core.board.forEach((row) => row.fill(null));
    // 立即把 O 块放到贴地位置
    game.core.active.type = 'O';
    game.core.active.rot = 0;
    game.core.active.x = 4;
    game.core.active.y = 20; // cells 落在 20/21 行，已贴底
    game.advance(0.4);
    assert(game.core.active, 'piece should survive inside the lock delay window');
    game.advance(0.2);
    assert(game.core.board[20][5] === 'O' && game.core.board[21][6] === 'O',
        'piece should lock after the 0.5s lock delay and be written to the board');

    // 重力：空板 I 块 level 1 约 1 秒/行，推进 2.2 秒应至少下落 2 行
    const g2 = T.createTetrisCore(mulberry32(5));
    g2.start();
    const startY = g2.core.active.y;
    g2.advance(2.2);
    assert(g2.core.active.y > startY + 1, 'gravity should pull the piece down over time');
}

function testHold() {
    const game = T.createTetrisCore(mulberry32(9));
    game.start();
    const first = game.core.active.type;
    assert(game.doHold(), 'first hold should succeed');
    assert.strictEqual(game.core.hold, first, 'hold should store the active piece');
    assert(game.core.active, 'a new piece should spawn after holding');
    const second = game.core.active.type;
    assert(!game.doHold(), 'second hold before locking should be rejected');
    assert.strictEqual(game.core.active.type, second, 'active piece should not change on rejected hold');
    // 锁定后 canHold 恢复
    game.core.board.forEach((row) => row.fill(null));
    game.hardDrop();
    assert(game.core.canHold, 'locking a piece should re-arm hold');
}

function testGameOver() {
    const game = T.createTetrisCore(mulberry32(11));
    game.start();
    // 同一区域连续硬降堆高，堆进出生区后新块无法出生
    for (let i = 0; i < 60 && !game.core.over; i++) {
        game.hardDrop();
    }
    assert(game.core.over, 'stacking into the spawn area should end the game');
}

testFilesAndStructure();
testSevenBag();
testSRSSpins();
testGhostAndHardDrop();
testTSpinScoring();
testLockDelayAndGravity();
testHold();
testGameOver();

console.log('tetris smoke test passed');
