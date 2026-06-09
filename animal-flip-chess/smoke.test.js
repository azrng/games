const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;

function read(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function createClassList(element) {
    const classes = new Set();
    return {
        add(...names) {
            names.forEach((name) => classes.add(name));
        },
        remove(...names) {
            names.forEach((name) => classes.delete(name));
        },
        contains(name) {
            return classes.has(name);
        },
        toggle(name, force) {
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
            if (shouldAdd) classes.add(name);
            else classes.delete(name);
            return shouldAdd;
        }
    };
}

function matchesSelector(element, selector) {
    if (selector.startsWith('.')) {
        const className = selector.slice(1);
        return element.classList.contains(className);
    }

    const dataMatch = selector.match(/^\[data-row="(\d+)"\]\[data-col="(\d+)"\]$/);
    if (dataMatch) {
        return String(element.dataset.row) === dataMatch[1] && String(element.dataset.col) === dataMatch[2];
    }

    return false;
}

function collectMatches(element, selector, result) {
    if (matchesSelector(element, selector)) result.push(element);
    for (const child of element.children) collectMatches(child, selector, result);
}

function runScriptWithContext() {
    const elements = new Map();
    let now = 1000;
    const timers = [];

    function createElement(id) {
        let classNameValue = '';
        const element = {
            id,
            textContent: '',
            hidden: false,
            disabled: false,
            dataset: {},
            style: {},
            children: [],
            listeners: {},
            classList: null,
            addEventListener(type, handler) {
                if (!this.listeners[type]) this.listeners[type] = [];
                this.listeners[type].push(handler);
            },
            dispatch(type, event = {}) {
                const payload = {
                    preventDefault() {},
                    sourceCapabilities: null,
                    ...event
                };
                for (const handler of this.listeners[type] || []) handler(payload);
            },
            appendChild(child) {
                child.parentNode = this;
                this.children.push(child);
                return child;
            },
            querySelectorAll(selector) {
                const result = [];
                collectMatches(this, selector, result);
                return result;
            },
            querySelector(selector) {
                return this.querySelectorAll(selector)[0] || null;
            }
        };
        element.classList = createClassList(element);
        Object.defineProperty(element, 'className', {
            get() {
                return classNameValue;
            },
            set(value) {
                classNameValue = String(value);
                element.classList = createClassList(element);
                if (classNameValue.trim()) {
                    element.classList.add(...classNameValue.trim().split(/\s+/));
                }
            }
        });
        Object.defineProperty(element, 'innerHTML', {
            get() {
                return this._innerHTML || '';
            },
            set(value) {
                this._innerHTML = String(value);
                if (value === '') this.children = [];
            }
        });
        elements.set(id, element);
        return element;
    }

    [
        'board', 'turn-text', 'player-a-info', 'player-b-info',
        'player-a-count', 'player-b-count', 'rps-modal', 'rps-status',
        'result-modal', 'result-title', 'result-desc', 'result-a',
        'result-b', 'restart-btn', 'play-again-btn', 'hint-btn',
        'undo-btn'
    ].forEach(createElement);

    const rpsButtons = ['rock', 'scissors', 'paper'].map((choice) => {
        const btn = createElement(`rps-${choice}`);
        btn.dataset.choice = choice;
        btn.classList.add('rps-btn');
        return btn;
    });

    const hintText = createElement('hint-text');
    hintText.classList.add('hint-text');
    hintText.textContent = '点击翻牌或移动棋子，大吃小，鼠吃象。';

    const document = {
        createElement(tag) {
            return createElement(`${tag}-${elements.size}`);
        },
        getElementById(id) {
            return elements.get(id) || null;
        },
        querySelectorAll(selector) {
            if (selector === '.rps-btn') return rpsButtons;
            return [];
        },
        querySelector(selector) {
            if (selector === '.hint-text') return hintText;
            return null;
        }
    };

    const date = {
        now() {
            return now;
        },
        advance(ms) {
            now += ms;
        }
    };

    const context = {
        window: {},
        document,
        Math,
        JSON,
        Date: date,
        setTimeout(fn, delay = 0) {
            timers.push({ fn, delay });
            return timers.length;
        },
        clearTimeout() {}
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return { api: context.window.AnimalFlipChess, elements, date };
}

function tap(cardEl, date, advanceMs = 80) {
    cardEl.dispatch('touchstart', { touches: [{ clientX: 1, clientY: 1 }] });
    cardEl.dispatch('touchend', { changedTouches: [{ clientX: 1, clientY: 1 }] });
    date.advance(advanceMs);
}

function cell(elements, row, col) {
    const cardEl = elements.get('board').querySelector(`[data-row="${row}"][data-col="${col}"]`);
    assert(cardEl, `cell ${row},${col} should exist`);
    return cardEl;
}

function setBattleBoard(api) {
    api.setStateForTest({
        currentPlayer: 'a',
        phase: 'play',
        board: [
            [
                { animal: 'elephant', owner: 'a', flipped: true, captured: false },
                { animal: 'cat', owner: 'b', flipped: true, captured: false },
                { animal: 'dog', owner: null, flipped: false, captured: false },
                { animal: 'wolf', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'rat', owner: null, flipped: false, captured: false },
                { animal: 'lion', owner: null, flipped: false, captured: false },
                { animal: 'tiger', owner: null, flipped: false, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'cat', owner: null, flipped: false, captured: false },
                { animal: 'dog', owner: null, flipped: false, captured: false },
                { animal: 'wolf', owner: null, flipped: false, captured: false },
                { animal: 'rat', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'lion', owner: null, flipped: false, captured: false },
                { animal: 'tiger', owner: null, flipped: false, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false },
                { animal: 'elephant', owner: null, flipped: false, captured: false }
            ]
        ]
    });
}

function testFilesAndStylesExist() {
    const html = read('index.html');
    const css = read('style.css');
    const script = read('script.js');

    assert(html.includes('viewport-fit=cover'), 'mobile page should use viewport-fit=cover');
    assert(css.includes('owner-badge'), 'cards should display visible owner badges');
    assert(css.includes('valid-move'), 'selected pieces should reveal valid move targets');
    assert(css.includes('card.valid-move.captured'), 'captured empty cells should be rendered as valid walk targets');
    assert(script.includes('AnimalFlipChess'), 'script should expose test API');
}

function testOwnerClassesAndMoveHintsRender() {
    const { api, elements } = runScriptWithContext();
    setBattleBoard(api);

    cell(elements, 0, 0).dispatch('click');

    const own = cell(elements, 0, 0);
    const enemy = cell(elements, 0, 1);

    assert(own.classList.contains('selected'), 'own piece should show selected state');
    assert(own.classList.contains('player-a'), 'human piece should have player-a class');
    assert(enemy.classList.contains('player-b'), 'AI piece should have player-b class');
    assert(enemy.classList.contains('valid-move'), 'adjacent capturable enemy should be marked valid');
}

function testFastMobileDoubleTapCanCapture() {
    const { api, elements, date } = runScriptWithContext();
    setBattleBoard(api);

    tap(cell(elements, 0, 0), date, 80);
    tap(cell(elements, 0, 1), date, 80);

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][1].owner, 'a', 'human piece should move into captured target');
    assert.strictEqual(state.board[0][1].animal, 'elephant', 'attacking piece should occupy target');
    assert.strictEqual(state.board[0][0].captured, true, 'source cell should become an empty cell after moving');
    assert.strictEqual(state.currentPlayer, 'b', 'turn should switch after successful move');
}

function testCapturedCellCanBeMoveTarget() {
    const { api, elements } = runScriptWithContext();
    setBattleBoard(api);
    api.setStateForTest({
        ...api.getStateForTest(),
        board: [
            [
                { animal: 'elephant', owner: 'a', flipped: true, captured: false },
                { animal: 'cat', owner: null, flipped: true, captured: true },
                { animal: 'dog', owner: null, flipped: false, captured: false },
                { animal: 'wolf', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'rat', owner: null, flipped: false, captured: false },
                { animal: 'lion', owner: null, flipped: false, captured: false },
                { animal: 'tiger', owner: null, flipped: false, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'cat', owner: null, flipped: false, captured: false },
                { animal: 'dog', owner: null, flipped: false, captured: false },
                { animal: 'wolf', owner: null, flipped: false, captured: false },
                { animal: 'rat', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'lion', owner: null, flipped: false, captured: false },
                { animal: 'tiger', owner: null, flipped: false, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false },
                { animal: 'elephant', owner: null, flipped: false, captured: false }
            ]
        ]
    });

    cell(elements, 0, 0).dispatch('click');
    assert(cell(elements, 0, 1).classList.contains('valid-move'), 'captured adjacent cell should be valid');
    cell(elements, 0, 1).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][1].owner, 'a', 'piece should move into empty captured cell');
    assert.strictEqual(state.board[0][1].captured, false, 'target cell should become an active piece');
}

function testFlipDoesNotEmptyAdjacentUnflippedCard() {
    const { api, elements } = runScriptWithContext();
    api.setStateForTest({
        currentPlayer: 'a',
        phase: 'play',
        board: [
            [
                { animal: 'elephant', owner: null, flipped: false, captured: false },
                { animal: 'cat', owner: null, flipped: false, captured: false },
                { animal: 'dog', owner: null, flipped: false, captured: false },
                { animal: 'wolf', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'rat', owner: null, flipped: false, captured: false },
                { animal: 'lion', owner: null, flipped: false, captured: false },
                { animal: 'tiger', owner: null, flipped: false, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'cat', owner: null, flipped: false, captured: false },
                { animal: 'dog', owner: null, flipped: false, captured: false },
                { animal: 'wolf', owner: null, flipped: false, captured: false },
                { animal: 'rat', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'lion', owner: null, flipped: false, captured: false },
                { animal: 'tiger', owner: null, flipped: false, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false },
                { animal: 'elephant', owner: null, flipped: false, captured: false }
            ]
        ]
    });

    cell(elements, 0, 0).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][0].flipped, true, 'clicked card should be flipped');
    assert.strictEqual(state.board[0][0].captured, false, 'clicked card should stay on board');
    assert.strictEqual(state.board[0][1].flipped, false, 'adjacent unflipped card should stay face down');
    assert.strictEqual(state.board[0][1].captured, false, 'adjacent unflipped card should not become empty');
}

function testFlipDoesNotAutoCaptureAdjacentEnemy() {
    const { api, elements } = runScriptWithContext();
    api.setStateForTest({
        currentPlayer: 'a',
        phase: 'play',
        board: [
            [
                { animal: 'elephant', owner: null, flipped: false, captured: false },
                { animal: 'cat', owner: 'b', flipped: true, captured: false },
                { animal: 'dog', owner: null, flipped: false, captured: false },
                { animal: 'wolf', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'rat', owner: null, flipped: false, captured: false },
                { animal: 'lion', owner: null, flipped: false, captured: false },
                { animal: 'tiger', owner: null, flipped: false, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'cat', owner: null, flipped: false, captured: false },
                { animal: 'dog', owner: null, flipped: false, captured: false },
                { animal: 'wolf', owner: null, flipped: false, captured: false },
                { animal: 'rat', owner: null, flipped: false, captured: false }
            ],
            [
                { animal: 'lion', owner: null, flipped: false, captured: false },
                { animal: 'tiger', owner: null, flipped: false, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false },
                { animal: 'elephant', owner: null, flipped: false, captured: false }
            ]
        ]
    });

    cell(elements, 0, 0).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][1].owner, 'b', 'adjacent enemy should remain until explicit move');
    assert.strictEqual(state.board[0][1].captured, false, 'adjacent enemy should not be auto-captured by flip');
}

testFilesAndStylesExist();
testOwnerClassesAndMoveHintsRender();
testFastMobileDoubleTapCanCapture();
testCapturedCellCanBeMoveTarget();
testFlipDoesNotEmptyAdjacentUnflippedCard();
testFlipDoesNotAutoCaptureAdjacentEnemy();

console.log('animal flip chess smoke test passed');
