const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function createElement(id) {
    const listeners = {};
    return {
        id,
        textContent: '',
        disabled: false,
        checked: id === 'ai-first',
        value: id === 'difficulty' ? '4' : (id === 'theme' ? 'classic' : ''),
        style: {},
        parentElement: { clientWidth: 360 },
        classList: {
            add() {},
            remove() {}
        },
        addEventListener(type, handler) {
            listeners[type] = handler;
        },
        dispatch(type, event) {
            if (listeners[type]) {
                listeners[type](event || { target: this });
            }
        },
        getContext() {
            return createCanvasContext();
        },
        getBoundingClientRect() {
            return { width: 340, height: 340, left: 0, top: 0 };
        }
    };
}

function createCanvasContext() {
    return {
        setTransform() {},
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        arc() {},
        fill() {},
        stroke() {},
        save() {},
        restore() {},
        createRadialGradient() {
            return { addColorStop() {} };
        }
    };
}

function createMemoryStorage(initial) {
    const data = new Map(Object.entries(initial || {}));
    return {
        getItem(key) {
            return data.has(key) ? data.get(key) : null;
        },
        setItem(key, value) {
            data.set(key, String(value));
        },
        removeItem(key) {
            data.delete(key);
        }
    };
}

function testMobileHtmlDoesNotExposeHintButton() {
    const html = fs.readFileSync(path.join(root, 'mobile.html'), 'utf8');
    assert(!html.includes('id="hint-btn"'), 'mobile.html should not render hint-btn');
    assert(!html.includes('提示'), 'mobile.html should not render hint copy');
    assert(html.includes('id="stats-text"'), 'mobile.html should render the stats card');
}

function testDesktopHtmlRendersStatsCard() {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert(html.includes('id="stats-text"'), 'index.html should render the stats pill');
}

function testSaveModuleWiredIntoScriptAndWorker() {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const worker = fs.readFileSync(path.join(root, 'ai-worker.js'), 'utf8');
    assert(script.includes('gomoku_save_v1'), 'script should persist progress via localStorage');
    assert(worker.includes("case 'restore'"), 'worker should accept a restore action to rebuild the board');
    assert(worker.includes('restoreFn'), 'worker should implement the restore replay');
}

function testCatalogDescriptionDoesNotPromiseMobileHint() {
    /* 目录迁移后 catalog 位于 src/data/games.js */
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    assert(!catalog.includes('支持提示和调试信息'), 'catalog description should not promise hint support generically');
    assert(catalog.includes('PC 端保留提示能力'), 'catalog description should scope hint support to PC');
}

function testSharedScriptInitializesWithoutHintButton() {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const { elements, context } = createScriptContext();

    assert.doesNotThrow(() => vm.runInNewContext(script, context), 'script should initialize when hint-btn is absent');
}

function createScriptContext(storage = createMemoryStorage(), replies = {}) {
    const elements = new Map();
    [
        'board-canvas',
        'start-btn',
        'undo-btn',
        'resign-btn',
        'status-text',
        'step-count',
        'stats-text',
        'loading-overlay',
        'result-modal',
        'result-message',
        'result-steps',
        'ai-first',
        'difficulty',
        'theme',
        'forbidden-toggle',
        'play-again-btn',
        'close-modal-btn'
    ].forEach((id) => elements.set(id, createElement(id)));

    const document = {
        readyState: 'complete',
        getElementById(id) {
            return elements.get(id) || null;
        },
        addEventListener() {}
    };

    const workerMessages = [];
    const context = {
        document,
        window: {
            devicePixelRatio: 1,
            localStorage: storage,
            getComputedStyle() {
                return { paddingLeft: '0', paddingRight: '0' };
            },
            addEventListener() {}
        },
        Worker: function Worker() {
            this.postMessage = function postMessage(message) {
                workerMessages.push(message);
                // 可选：按动作自动应答，让主线程 .then 链路在测试里跑通
                if (replies[message.action] && typeof this.onmessage === 'function') {
                    this.onmessage({ data: { action: message.action, payload: replies[message.action] } });
                }
            };
        },
        Math,
        Promise,
        setTimeout,
        clearTimeout
    };
    context.window.window = context.window;
    context.workerMessages = workerMessages;

    return { elements, context, workerMessages, storage };
}

function testToggleTouchTargetCoversVisibleSwitch() {
    const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    assert(!/\.toggle input\s*\{[^}]*width:\s*0\s*;[^}]*height:\s*0\s*;/s.test(css), 'toggle input should not be zero-sized');
    assert(/\.toggle input\s*\{[^}]*width:\s*100%\s*;[^}]*height:\s*100%\s*;/s.test(css), 'toggle input should cover the visible switch');
}

function testStartReadsCurrentSettingsControls() {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const { elements, context } = createScriptContext();

    vm.runInNewContext(script, context);

    elements.get('ai-first').checked = false;
    elements.get('difficulty').value = '8';
    elements.get('start-btn').dispatch('click');

    const startMessage = context.workerMessages.find((message) => message.action === 'start');
    assert(startMessage, 'start should send a worker message');
    assert.strictEqual(startMessage.payload.aiFirst, false, 'start should read current ai-first control');
    assert.strictEqual(startMessage.payload.depth, 8, 'start should read current difficulty control');
}

// ===== 存档（localStorage）=====
function buildSavedGame() {
    const board = Array.from({ length: 15 }, () => new Array(15).fill(0));
    board[7][7] = 1;
    board[7][8] = -1;
    board[8][7] = 1;
    return {
        board,
        currentPlayer: -1,
        history: [
            { i: 7, j: 7, role: 1 },
            { i: 7, j: 8, role: -1 },
            { i: 8, j: 7, role: 1 }
        ],
        hints: 2,
        playerRole: -1,
        winner: 0
    };
}

function testRestoreBootsFromSavedGame() {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const storage = createMemoryStorage({
        gomoku_save_v1: JSON.stringify({
            version: 1,
            settings: { aiFirst: false, depth: 6, theme: 'wood', forbiddenMoves: true },
            stats: { wins: 3, losses: 2 },
            game: buildSavedGame()
        })
    });
    const { elements, context, workerMessages } = createScriptContext(storage);
    vm.runInNewContext(script, context);

    const restoreMessage = workerMessages.find((message) => message.action === 'restore');
    assert(restoreMessage, 'boot should send a restore message when a saved game exists');
    assert.strictEqual(restoreMessage.payload.size, 15, 'restore should carry the board size');
    assert.strictEqual(restoreMessage.payload.history.length, 3, 'restore should replay the full history');

    // 设置项从存档回填到控件
    assert.strictEqual(elements.get('ai-first').checked, false, 'saved aiFirst should be applied to the control');
    assert.strictEqual(elements.get('difficulty').value, '6', 'saved depth should be applied to the control');
    assert.strictEqual(elements.get('theme').value, 'wood', 'saved theme should be applied to the control');
    assert.strictEqual(elements.get('forbidden-toggle').checked, true, 'saved forbidden rule should be applied');

    // 战绩文案来自存档
    assert.strictEqual(elements.get('stats-text').textContent, '3胜 2负',
        'stats text should render from the saved record');
}

function testSettingsPersistOnChange() {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const { elements, context, storage } = createScriptContext();
    vm.runInNewContext(script, context);

    elements.get('theme').value = 'wood';
    elements.get('theme').dispatch('change');

    const saved = JSON.parse(storage.getItem('gomoku_save_v1'));
    assert(saved && saved.settings, 'settings change should persist the save');
    assert.strictEqual(saved.settings.theme, 'wood', 'new theme should be in the saved settings');
    assert.strictEqual(saved.settings.depth, 4, 'untouched settings should keep their defaults');
}

function testCorruptSaveIgnoredOnBoot() {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const storage = createMemoryStorage({
        gomoku_save_v1: JSON.stringify({
            version: 1,
            stats: { wins: 5, losses: 1 },
            settings: { aiFirst: 'yes', depth: 99, theme: 'gold', forbiddenMoves: 'maybe' },
            game: { history: [{ i: 99, j: -3, role: 7 }], winner: 0, hints: 2 }
        })
    });
    const { elements, context, workerMessages } = createScriptContext(storage);
    vm.runInNewContext(script, context);

    assert(!workerMessages.some((message) => message.action === 'restore'),
        'out-of-bounds history should not be sent to the worker');
    assert(!workerMessages.some((message) => message.action === 'start'),
        'boot should not auto-start a game');
    // 无效设置不覆盖控件默认值
    assert.strictEqual(elements.get('theme').value, 'classic', 'invalid saved settings should not touch controls');
    assert.strictEqual(elements.get('stats-text').textContent, '5胜 1负',
        'stats should survive even when settings and game are invalid');
}

async function testRoundTripSaveRestore() {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

    // 第一遍：走真实 start 流程（worker 应答黑棋首子），产出运行时快照
    const board = Array.from({ length: 15 }, () => new Array(15).fill(0));
    board[7][7] = 1;
    const startReply = {
        board,
        winner: 0,
        current_player: -1,
        history: [{ i: 7, j: 7, role: 1 }],
        size: 15,
        score: 0,
        bestPath: [],
        currentDepth: 0
    };
    const first = createScriptContext(undefined, { start: startReply });
    vm.runInNewContext(script, first.context);
    first.elements.get('start-btn').dispatch('click');
    // 让 .then 链路的微任务跑完
    await new Promise((resolve) => setImmediate(resolve));

    const raw = first.storage.getItem('gomoku_save_v1');
    assert(raw, 'start round should persist a save');
    const saved = JSON.parse(raw);
    assert(saved.game, 'start round should persist the in-progress game');

    // 第二遍：同一 storage 重新启动，必须能恢复（生产者与校验器对齐的往返验证）
    const second = createScriptContext(first.storage);
    vm.runInNewContext(script, second.context);
    const restoreMessage = second.workerMessages.find((message) => message.action === 'restore');
    assert(restoreMessage, 'round-trip: snapshot produced at runtime should be restorable on next boot');
    assert.strictEqual(restoreMessage.payload.history.length, 1, 'restore should replay the saved history');
    assert.strictEqual(
        second.elements.get('stats-text').textContent,
        '0胜 0负',
        'stats should render after the round-trip boot'
    );
}

testMobileHtmlDoesNotExposeHintButton();
testDesktopHtmlRendersStatsCard();
testSaveModuleWiredIntoScriptAndWorker();
testCatalogDescriptionDoesNotPromiseMobileHint();
testSharedScriptInitializesWithoutHintButton();
testToggleTouchTargetCoversVisibleSwitch();
testStartReadsCurrentSettingsControls();
testRestoreBootsFromSavedGame();
testSettingsPersistOnChange();
testCorruptSaveIgnoredOnBoot();

(async () => {
    await testRoundTripSaveRestore();
    console.log('mobile gomoku smoke test passed');
})();
