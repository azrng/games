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
            tagName: id.split('-')[0].toUpperCase(),
            attributes: {},
            type: '',
            addEventListener(type, handler) {
                if (!this.listeners[type]) this.listeners[type] = [];
                this.listeners[type].push(handler);
            },
            setAttribute(name, value) {
                this.attributes[name] = String(value);
            },
            getAttribute(name) {
                return this.attributes[name] || null;
            },
            dispatch(type, event = {}) {
                const payload = {
                    preventDefault() {},
                    sourceCapabilities: null,
                    ...event
                };
                for (const handler of this.listeners[type] || []) handler(payload);
            },
            focus() {},
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
        'player-a-count', 'player-b-count', 'header-tip', 'result-modal', 'result-title', 'result-desc', 'result-a',
        'result-b', 'restart-btn', 'play-again-btn'
    ].forEach(createElement);

    const hintText = createElement('hint-text');
    hintText.classList.add('hint-text');
    hintText.textContent = '点击翻牌或移动棋子，大吃小，鼠吃象。';

    const document = {
        createElement(tag) {
            const element = createElement(`${tag}-${elements.size}`);
            element.tagName = tag.toUpperCase();
            return element;
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
            const timer = { fn, delay, cleared: false };
            timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            if (timer) timer.cleared = true;
        }
    };
    context.window.window = context.window;
    context.window.document = document;

    vm.runInNewContext(read('script.js'), context);
    return {
        api: context.window.AnimalFlipChess,
        elements,
        date,
        runTimersThrough(maxDelay) {
            for (const timer of timers) {
                if (!timer.cleared && timer.delay <= maxDelay) {
                    timer.cleared = true;
                    timer.fn();
                }
            }
        }
    };
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
                { animal: 'tiger', owner: 'b', flipped: true, captured: false },
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
    assert(html.includes('name="description"'), 'page should include a meta description');
    assert(!html.includes('id="rps-modal"'), 'page should not render RPS modal');
    assert(css.includes('owner-badge'), 'cards should display visible owner badges');
    assert(html.includes('id="header-tip"'), 'page should include a header action tip');
    assert(css.includes('.header-tip.show'), 'header action tip should have a visible state');
    assert(css.includes('valid-move'), 'selected pieces should reveal valid move targets');
    assert(css.includes('card.valid-move.captured'), 'captured empty cells should be rendered as valid walk targets');
    assert(!css.includes('.card:active .card-inner'), 'touch pressing feedback should not duplicate :active transforms');
    assert(!html.includes('id="hint-btn"'), 'page should not render hint button');
    assert(!html.includes('id="undo-btn"'), 'page should not render undo button');
    assert(!script.includes('moveHistory'), 'script should not keep undo history');
    assert(script.includes('++emptyIdCounter'), 'empty cell ids should use a stable counter');
    assert(script.includes('AnimalFlipChess'), 'script should expose test API');
}

function testBoardCellsAreAccessibleButtons() {
    const { elements } = runScriptWithContext();
    const firstCell = cell(elements, 0, 0);

    assert.strictEqual(firstCell.tagName, 'BUTTON', 'board cells should be keyboard-focusable buttons');
    assert.strictEqual(firstCell.type, 'button', 'board cell buttons should not submit forms');
    assert(firstCell.getAttribute('aria-label').includes('1行1列'), 'board cells should expose position labels');
    assert(firstCell.getAttribute('aria-label').includes('未翻开的牌'), 'hidden cards should not expose animal identity');
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

function testSameAnimalCanCancelOut() {
    const { api } = runScriptWithContext();

    assert.strictEqual(api.canBattle('elephant', 'elephant'), true,
        'same animal should be a valid cancel-out target');
    assert.strictEqual(api.canBattle('rat', 'rat'), true,
        'same rat pieces should be able to cancel each other out');
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

function testActionTipShowsAfterPlayerMove() {
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

    cell(elements, 0, 0).dispatch('click');

    assert.strictEqual(elements.get('header-tip').textContent, '你翻开了象',
        'successful player action should show a header tip');
    assert.strictEqual(elements.get('header-tip').hidden, false,
        'header tip should become visible after a successful player action');
}

function testSameAnimalMoveCancelsBothPieces() {
    const { api, elements } = runScriptWithContext();
    api.setStateForTest({
        currentPlayer: 'a',
        phase: 'play',
        board: [
            [
                { animal: 'elephant', owner: 'a', flipped: true, captured: false },
                { animal: 'elephant', owner: 'b', flipped: true, captured: false },
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
                { animal: 'lion', owner: 'a', flipped: true, captured: false },
                { animal: 'tiger', owner: 'b', flipped: true, captured: false },
                { animal: 'leopard', owner: null, flipped: false, captured: false },
                { animal: 'cat', owner: null, flipped: false, captured: false }
            ]
        ]
    });

    cell(elements, 0, 0).dispatch('click');

    assert(cell(elements, 0, 1).classList.contains('valid-move'),
        'same animal enemy should be marked as a valid cancel-out target');

    cell(elements, 0, 1).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][0].owner, null, 'attacker cell should become empty after same-animal cancel-out');
    assert.strictEqual(state.board[0][0].captured, true, 'attacker should disappear after same-animal cancel-out');
    assert.strictEqual(state.board[0][1].owner, null, 'defender cell should become empty after same-animal cancel-out');
    assert.strictEqual(state.board[0][1].captured, true, 'defender should disappear after same-animal cancel-out');
    assert.strictEqual(state.currentPlayer, 'b', 'turn should switch after same-animal cancel-out');
    assert.strictEqual(elements.get('header-tip').textContent, '你和电脑的象抵消了',
        'same-animal cancel-out should show a header tip');
}

function testOnlyNewlyFlippedCardAnimates() {
    const { api, elements, runTimersThrough } = runScriptWithContext();
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
    runTimersThrough(620);

    assert(cell(elements, 0, 0).classList.contains('no-flip-animation'),
        'previously flipped card should not replay flip animation');
    assert(cell(elements, 0, 1).classList.contains('no-flip-animation'),
        'newly flipped card should become stable after its flip animation finishes');
}

function testFlipAnimationIsOptInOnly() {
    const css = read('style.css');
    assert(css.includes('.card.flip-animating .card-inner'),
        'flip transition should be opt-in for the card that was just flipped');
    assert(css.includes('.card.flipped:not(.flip-animating) .card-back'),
        'stable flipped cards should hide the back face instead of relying on 3D rotation');
    assert(css.includes('.card.flipped:not(.flip-animating) .card-front'),
        'stable flipped cards should render the front face directly');
    assert(css.includes('.card.flip-animating.selected .card-front'),
        'only animating selected cards should keep the rotated front transform');
    assert(!/\.card\.captured\s+\.card-inner\s*\{[^}]*rotateY\(180deg\)/s.test(css),
        'captured stable cells should not rely on rotated inner rendering');
    assert(!/^\.card-inner\s*\{[^}]*transition:\s*transform\s+0\.6s/ms.test(css),
        'stable board renders should not give every card a flip transition');

    const { api, elements } = runScriptWithContext();
    api.setStateForTest({
        currentPlayer: 'a',
        phase: 'play',
        animatingFlipIds: ['b-cat'],
        board: [
            [
                { id: 'a-elephant', animal: 'elephant', owner: 'a', flipped: true, captured: false },
                { id: 'b-cat', animal: 'cat', owner: 'b', flipped: true, captured: false },
                { id: 'a-dog', animal: 'dog', owner: 'a', flipped: true, captured: false },
                { id: 'b-wolf', animal: 'wolf', owner: 'b', flipped: true, captured: false }
            ],
            [
                { id: 'a-rat', animal: 'rat', owner: 'a', flipped: true, captured: false },
                { id: 'b-lion', animal: 'lion', owner: 'b', flipped: true, captured: false },
                { id: 'a-tiger', animal: 'tiger', owner: 'a', flipped: true, captured: false },
                { id: 'b-leopard', animal: 'leopard', owner: 'b', flipped: true, captured: false }
            ],
            [
                { id: 'a-cat', animal: 'cat', owner: 'a', flipped: true, captured: false },
                { id: 'b-dog', animal: 'dog', owner: 'b', flipped: true, captured: false },
                { id: 'a-wolf', animal: 'wolf', owner: 'a', flipped: true, captured: false },
                { id: 'b-rat', animal: 'rat', owner: 'b', flipped: true, captured: false }
            ],
            [
                { id: 'a-lion', animal: 'lion', owner: 'a', flipped: true, captured: false },
                { id: 'b-tiger', animal: 'tiger', owner: 'b', flipped: true, captured: false },
                { id: 'a-leopard', animal: 'leopard', owner: 'a', flipped: true, captured: false },
                { id: 'b-elephant', animal: 'elephant', owner: 'b', flipped: true, captured: false }
            ]
        ]
    });

    assert(!cell(elements, 0, 0).classList.contains('flip-animating'),
        'stable flipped cards should not receive the flip animation class');
    assert(cell(elements, 0, 1).classList.contains('flip-animating'),
        'only the card being flipped should receive the flip animation class');
    assert(!cell(elements, 0, 2).classList.contains('flip-animating'),
        'other stable flipped cards should remain visually stable');
}

function testMovingPieceDoesNotReplayFlippedCardAnimations() {
    const { api, elements } = runScriptWithContext();
    setBattleBoard(api);

    cell(elements, 0, 0).dispatch('click');
    cell(elements, 0, 1).dispatch('click');

    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const state = api.getStateForTest();
            const card = state.board[r][c];
            if (card.flipped || card.captured) {
                assert(!cell(elements, r, c).classList.contains('flip-animating'),
                    `cell ${r},${c} should not replay flip animation after a move`);
                assert(cell(elements, r, c).classList.contains('no-flip-animation'),
                    `cell ${r},${c} should stay visually stable after a move`);
            }
        }
    }
}

function testOldFlippedCardNodeIsPreservedOnNextFlip() {
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

    const oldFlippedCard = cell(elements, 0, 0);
    cell(elements, 0, 1).dispatch('click');

    assert.strictEqual(cell(elements, 0, 0), oldFlippedCard,
        'previously flipped card DOM node should be preserved when another card flips');
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

function testDesktopClickCanCapture() {
    const { api, elements } = runScriptWithContext();
    setBattleBoard(api);

    cell(elements, 0, 0).dispatch('click');
    cell(elements, 0, 1).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][1].owner, 'a', 'desktop click should move into captured target');
    assert.strictEqual(state.board[0][0].captured, true, 'desktop click move should leave an empty source cell');
}

function testEmptyCellIdsUseCounter() {
    const { api, elements } = runScriptWithContext();
    setBattleBoard(api);

    cell(elements, 0, 0).dispatch('click');
    cell(elements, 0, 1).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.board[0][0].id, 'empty-0-0-1', 'empty cell id should use a stable counter');
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

function testFlipHeuristicIgnoresHiddenCardContents() {
    const { api } = runScriptWithContext();

    // Two identical boards differing ONLY in the animal/owner hidden under
    // the same face-down cell. A fair flip heuristic must score the flip
    // identically, since neither side should know what is under the card.
    const baseBoard = [
        [
            { animal: 'elephant', owner: 'a', flipped: true, captured: false },
            { animal: 'cat', owner: 'b', flipped: false, captured: false },
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
    ];

    // Variant where the hidden cell (0,1) secretly favors the AI (AI's own elephant).
    const aiFavorBoard = baseBoard.map(row => row.map(c => ({ ...c })));
    aiFavorBoard[0][1] = { animal: 'elephant', owner: 'b', flipped: false, captured: false };

    // Variant where the hidden cell (0,1) secretly favors the human (human's cat).
    const humanFavorBoard = baseBoard.map(row => row.map(c => ({ ...c })));
    humanFavorBoard[0][1] = { animal: 'cat', owner: 'a', flipped: false, captured: false };

    api.setStateForTest({ currentPlayer: 'b', phase: 'play', board: aiFavorBoard });
    const stateA = api.getStateForTest();
    const scoreFavorAi = api.scoreFlipHeuristic(stateA, 0, 1);

    api.setStateForTest({ currentPlayer: 'b', phase: 'play', board: humanFavorBoard });
    const stateB = api.getStateForTest();
    const scoreFavorHuman = api.scoreFlipHeuristic(stateB, 0, 1);

    // The flip score must not depend on what is hidden under the card. A
    // peeking heuristic would score the AI's own elephant far higher than the
    // human's weak cat.
    assert.strictEqual(
        scoreFavorAi, scoreFavorHuman,
        'flip heuristic must be content-blind: hidden card contents must not affect the score'
    );
}

function testEliminatingAllPiecesEndsGameEvenWithHiddenCards() {
    const { api, elements } = runScriptWithContext();
    // Human has one revealed rat adjacent to the AI's last revealed elephant.
    // The rest are face-down. When the human's rat eats the AI's elephant
    // (rat beats elephant), the AI is eliminated and the game must end
    // immediately, even though many face-down cards remain.
    api.setStateForTest({
        currentPlayer: 'a',
        phase: 'play',
        board: [
            [
                { animal: 'rat', owner: 'a', flipped: true, captured: false },
                { animal: 'elephant', owner: 'b', flipped: true, captured: false },
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

    // Select the human elephant, then capture the adjacent AI rat.
    cell(elements, 0, 0).dispatch('click');
    cell(elements, 0, 1).dispatch('click');

    const state = api.getStateForTest();
    assert.strictEqual(state.phase, 'end', 'game should end when a side loses its last piece');
    assert.strictEqual(elements.get('result-title').textContent, '你获胜！',
        'human should win after eliminating the AI');
}

function testAiFlipDoesNotAlwaysFavorOwnStrongCard() {
    // Statistical fairness check: across many random fresh deals, the AI's
    // first flip (when it moves first) must not systematically target its own
    // strongest pieces. A peeking AI would almost always flip its elephant or
    // lion first; a fair AI treats all face-down cells as unknown.
    let ownStrongFirstFlips = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
        const { api, elements, date, runTimersThrough } = runScriptWithContext();
        const state = api.getStateForTest();
        if (state.currentPlayer !== 'b') continue; // only inspect AI-first games

        // Run the AI's scheduled turn (its first move of the game).
        runTimersThrough(1500);
        date.advance(2000);
        runTimersThrough(620);

        const after = api.getStateForTest();
        // Find the cell the AI just flipped (the only newly-flipped card).
        let flippedCell = null;
        for (const row of after.board) {
            for (const card of row) {
                if (card.flipped && !card.captured) {
                    // Newly flipped: not in the initial state (all hidden),
                    // so it's the one the AI flipped.
                    flippedCell = card;
                }
            }
        }
        if (!flippedCell) continue;
        // Count cases where AI flipped its own elephant or lion on turn one.
        if (flippedCell.owner === 'b' && (flippedCell.animal === 'elephant' || flippedCell.animal === 'lion')) {
            ownStrongFirstFlips++;
        }
    }

    // If the AI were peeking, this ratio would approach 100%. A fair AI that
    // treats its 8 face-down pieces uniformly would flip its own elephant or
    // lion first at most ~2/8 = 25% of the time, plus the human's pieces which
    // never count here. Use a generous threshold well below a cheating baseline.
    assert.ok(ownStrongFirstFlips < trials * 0.5,
        `AI should not systematically flip its own strong cards first (got ${ownStrongFirstFlips}/${trials})`);
}

testFilesAndStylesExist();
testBoardCellsAreAccessibleButtons();
testInitialDeckHasOneAnimalPerOwner();
testSameAnimalCanCancelOut();
testFlipKeepsPresetOwnerAndShowsTurnPrompt();
testActionTipShowsAfterPlayerMove();
testSameAnimalMoveCancelsBothPieces();
testOnlyNewlyFlippedCardAnimates();
testFlipAnimationIsOptInOnly();
testMovingPieceDoesNotReplayFlippedCardAnimations();
testOldFlippedCardNodeIsPreservedOnNextFlip();
testOwnerClassesAndMoveHintsRender();
testFastMobileDoubleTapCanCapture();
testDesktopClickCanCapture();
testEmptyCellIdsUseCounter();
testCapturedCellCanBeMoveTarget();
testFlipDoesNotEmptyAdjacentUnflippedCard();
testFlipDoesNotAutoCaptureAdjacentEnemy();
testFlipHeuristicIgnoresHiddenCardContents();
testEliminatingAllPiecesEndsGameEvenWithHiddenCards();
testAiFlipDoesNotAlwaysFavorOwnStrongCard();

console.log('animal flip chess smoke test passed');
