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

function testMobileHtmlDoesNotExposeHintButton() {
    const html = fs.readFileSync(path.join(root, 'mobile.html'), 'utf8');
    assert(!html.includes('id="hint-btn"'), 'mobile.html should not render hint-btn');
    assert(!html.includes('提示'), 'mobile.html should not render hint copy');
}

function testCatalogDescriptionDoesNotPromiseMobileHint() {
    const catalog = fs.readFileSync(path.join(root, '..', 'data', 'games.js'), 'utf8');
    assert(!catalog.includes('支持提示和调试信息'), 'catalog description should not promise hint support generically');
    assert(catalog.includes('PC 端保留提示能力'), 'catalog description should scope hint support to PC');
}

function testSharedScriptInitializesWithoutHintButton() {
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    const { elements, context } = createScriptContext();

    assert.doesNotThrow(() => vm.runInNewContext(script, context), 'script should initialize when hint-btn is absent');
}

function createScriptContext() {
    const elements = new Map();
    [
        'board-canvas',
        'start-btn',
        'undo-btn',
        'resign-btn',
        'status-text',
        'step-count',
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
            getComputedStyle() {
                return { paddingLeft: '0', paddingRight: '0' };
            },
            addEventListener() {}
        },
        Worker: function Worker() {
            this.postMessage = function postMessage(message) {
                workerMessages.push(message);
            };
        },
        Math,
        Promise,
        setTimeout,
        clearTimeout
    };
    context.window.window = context.window;
    context.workerMessages = workerMessages;

    return { elements, context };
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

testMobileHtmlDoesNotExposeHintButton();
testCatalogDescriptionDoesNotPromiseMobileHint();
testSharedScriptInitializesWithoutHintButton();
testToggleTouchTargetCoversVisibleSwitch();
testStartReadsCurrentSettingsControls();

console.log('mobile gomoku smoke test passed');
