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
        'player-a-count', 'player-b-count', 'result-modal', 'result-title', 'result-desc', 'result-a',
        'result-b', 'restart-btn', 'play-again-btn', 'hint-btn',
        'undo-btn'
    ].forEach(createElement);

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
    assert(!html.includes('id="rps-modal"'), 'page should not render RPS modal');
    assert(css.includes('owner-badge'), 'cards should display visible owner badges');
    assert(css.includes('valid-move'), 'selected pieces should reveal valid move targets');
    assert(css.includes('card.valid-move.captured'), 'captured empty cells should be rendered as valid walk targets');
    assert(script.includes('AnimalFlipChess'), 'script should expose test API');
}

function testInitialDeckHasOneAnimalPerOwner() {
    const { api, elements } = runScriptWithContext();
    const state = api.getStateForTest();
    const ownerAnimals = { a: new Map(), b: new Map() };

    assert.strictEqual(state.phase, 'play', 'game should start directly without RPS modal');
    assert(['你先手', '电脑先手'].includes(elements.get('turn-text').textContent),
        'turn indicator should immediately show who starts');

    for (const row of state.board) {
        for (const card of row) {
            assert(card.owner === 'a' || card.owner === 'b', 'each hidden card should have a preset owner');
            ownerAnimals[card.owner].set(card.animal, (ownerAnimals[card.owner].get(card.animal) || 0) + 1);
        }
    }

    assert.strictEqual(ownerAnimals.a.size, 8, 'human should have 8 distinct animals');
    assert.strictEqual(ownerAnimals.b.size, 8, 'AI should have 8 distinct animals');
    for (const [animal, count] of ownerAnimals.a) {
        assert.strictEqual(count, 1, `human should have one ${animal}`);
    }
    for (const [animal, count] of ownerAnimals.b) {
        assert.strictEqual(count, 1, `AI should have one ${animal}`);
    }
}

function testFlipKeepsPresetOwnerAndShowsTurnPrompt() {
    const { api, elements } = runScriptWithContext();
    api.setStateForTest({
        currentPlayer: 'a',
        phase: 'play',
        openingTurn: true,
        board: [
            [
                { animal: 'elephant', owner: 'b', flipped: false, captured: false },
                { animal: 'cat', owner: 'a', flipped: false, captured: false },
                { animal: 'dog', owner: 'a', flipped: false, captured: false },
                { animal: 'wolf', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'rat', owner: 'a', flipped: false, captured: false },
                { animal: 'lion', owner: 'b', flipped: false, captured: false },
                { animal: 'tiger', owner: 'a', flipped: false, captured: false },
                { animal: 'leopard', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'cat', owner: 'b', flipped: false, captured: false },
                { animal: 'dog', owner: 'b', flipped: false, captured: false },
                { animal: 'wolf', owner: 'a', flipped: false, captured: false },
                { animal: 'rat', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'lion', owner: 'a', flipped: false, captured: false },
                { animal: 'tiger', owner: 'b', flipped: false, captured: false },
                { animal: 'leopard', owner: 'a', flipped: false, captured: false },
                { animal: 'elephant', owner: 'a', flipped: false, captured: false }
            ]
        ]
    });

    assert.strictEqual(elements.get('turn-text').textContent, '你先手');
    assert.strictEqual(elements.get('hint-text').textContent, '你先手：点背面牌翻开，或选择你的棋子移动吃子。');

    cell(elements, 0, 0).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][0].owner, 'b', 'flipping should reveal preset owner, not current player');
    assert.strictEqual(elements.get('turn-text').textContent, '电脑思考中');
    assert.strictEqual(elements.get('hint-text').textContent, '电脑回合：正在思考下一步。');
}

function testOnlyNewlyFlippedCardAnimates() {
    const { api, elements } = runScriptWithContext();
    api.setStateForTest({
        currentPlayer: 'a',
        phase: 'play',
        board: [
            [
                { animal: 'elephant', owner: 'a', flipped: true, captured: false },
                { animal: 'cat', owner: 'b', flipped: false, captured: false },
                { animal: 'dog', owner: 'a', flipped: false, captured: false },
                { animal: 'wolf', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'rat', owner: 'a', flipped: false, captured: false },
                { animal: 'lion', owner: 'b', flipped: false, captured: false },
                { animal: 'tiger', owner: 'a', flipped: false, captured: false },
                { animal: 'leopard', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'cat', owner: 'a', flipped: false, captured: false },
                { animal: 'dog', owner: 'b', flipped: false, captured: false },
                { animal: 'wolf', owner: 'a', flipped: false, captured: false },
                { animal: 'rat', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'lion', owner: 'a', flipped: false, captured: false },
                { animal: 'tiger', owner: 'b', flipped: false, captured: false },
                { animal: 'leopard', owner: 'a', flipped: false, captured: false },
                { animal: 'elephant', owner: 'b', flipped: false, captured: false }
            ]
        ]
    });

    cell(elements, 0, 1).dispatch('click');

    assert(cell(elements, 0, 0).classList.contains('no-flip-animation'),
        'previously flipped card should not replay flip animation');
    assert(!cell(elements, 0, 1).classList.contains('no-flip-animation'),
        'newly flipped card should keep flip animation');
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
                { animal: 'elephant', owner: 'a', flipped: false, captured: false },
                { animal: 'cat', owner: 'b', flipped: false, captured: false },
                { animal: 'dog', owner: 'a', flipped: false, captured: false },
                { animal: 'wolf', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'rat', owner: 'a', flipped: false, captured: false },
                { animal: 'lion', owner: 'b', flipped: false, captured: false },
                { animal: 'tiger', owner: 'a', flipped: false, captured: false },
                { animal: 'leopard', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'cat', owner: 'a', flipped: false, captured: false },
                { animal: 'dog', owner: 'b', flipped: false, captured: false },
                { animal: 'wolf', owner: 'a', flipped: false, captured: false },
                { animal: 'rat', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'lion', owner: 'a', flipped: false, captured: false },
                { animal: 'tiger', owner: 'b', flipped: false, captured: false },
                { animal: 'leopard', owner: 'a', flipped: false, captured: false },
                { animal: 'elephant', owner: 'b', flipped: false, captured: false }
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
                { animal: 'elephant', owner: 'a', flipped: false, captured: false },
                { animal: 'cat', owner: 'b', flipped: true, captured: false },
                { animal: 'dog', owner: 'a', flipped: false, captured: false },
                { animal: 'wolf', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'rat', owner: 'a', flipped: false, captured: false },
                { animal: 'lion', owner: 'b', flipped: false, captured: false },
                { animal: 'tiger', owner: 'a', flipped: false, captured: false },
                { animal: 'leopard', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'cat', owner: 'a', flipped: false, captured: false },
                { animal: 'dog', owner: 'b', flipped: false, captured: false },
                { animal: 'wolf', owner: 'a', flipped: false, captured: false },
                { animal: 'rat', owner: 'b', flipped: false, captured: false }
            ],
            [
                { animal: 'lion', owner: 'a', flipped: false, captured: false },
                { animal: 'tiger', owner: 'b', flipped: false, captured: false },
                { animal: 'leopard', owner: 'a', flipped: false, captured: false },
                { animal: 'elephant', owner: 'b', flipped: false, captured: false }
            ]
        ]
    });

    cell(elements, 0, 0).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][1].owner, 'b', 'adjacent enemy should remain until explicit move');
    assert.strictEqual(state.board[0][1].captured, false, 'adjacent enemy should not be auto-captured by flip');
}

testFilesAndStylesExist();
testInitialDeckHasOneAnimalPerOwner();
testFlipKeepsPresetOwnerAndShowsTurnPrompt();
testOnlyNewlyFlippedCardAnimates();
testOwnerClassesAndMoveHintsRender();
testFastMobileDoubleTapCanCapture();
testCapturedCellCanBeMoveTarget();
testFlipDoesNotEmptyAdjacentUnflippedCard();
testFlipDoesNotAutoCaptureAdjacentEnemy();

console.log('animal flip chess smoke test passed');
