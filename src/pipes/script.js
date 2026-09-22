(function setupPipes(windowObject, documentObject) {
    'use strict';

    const SLUG = 'pipes';
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const UNLOCK_KEY = 'pipes-unlocked-level';
    const CURRENT_KEY = 'pipes-current-level';
    const BEST_KEY_PREFIX = 'pipes-best-';
    const BASE_SEED = 20260726;
    const memoryFallback = {};

    /* 方向掩码：上=1 右=2 下=4 左=8 */
    const DIRS = [
        { bit: 1, dx: 0, dy: -1, opposite: 4 },
        { bit: 2, dx: 1, dy: 0, opposite: 8 },
        { bit: 4, dx: 0, dy: 1, opposite: 1 },
        { bit: 8, dx: -1, dy: 0, opposite: 2 }
    ];

    const state = {
        level: 1,
        size: 3,
        source: 0,
        solvedMasks: [],
        cells: [],
        rotationDegrees: [],
        cellButtons: [],
        cellSvgs: [],
        steps: 0,
        minSteps: 0,
        locked: false
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        stepsText: documentObject.getElementById('steps-text'),
        minStepsText: documentObject.getElementById('min-steps-text'),
        bestText: documentObject.getElementById('best-text'),
        grid: documentObject.getElementById('grid'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
        resultSteps: documentObject.getElementById('result-steps'),
        resultMin: documentObject.getElementById('result-min'),
        resultBest: documentObject.getElementById('result-best'),
        replayBtn: documentObject.getElementById('replay-btn'),
        nextBtn: documentObject.getElementById('next-btn'),
        levelModal: documentObject.getElementById('level-modal'),
        levelGrid: documentObject.getElementById('level-grid'),
        closeLevelsBtn: documentObject.getElementById('close-levels-btn')
    };

    function safeGetItem(key) {
        try {
            return windowObject.localStorage.getItem(key);
        } catch (_) {
            return Object.prototype.hasOwnProperty.call(memoryFallback, key) ? memoryFallback[key] : null;
        }
    }

    function safeSetItem(key, value) {
        try {
            windowObject.localStorage.setItem(key, value);
        } catch (_) {
            memoryFallback[key] = value;
        }
    }

    function getStorageNumber(key, fallback) {
        const parsed = Number.parseInt(safeGetItem(key) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    /* mulberry32 种子随机数，保证同关卡布局可复现 */
    function createSeededRandom(seed) {
        let a = seed >>> 0;
        return function random() {
            a += 0x6D2B79F5;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function levelConfig(level) {
        return { size: Math.min(7, 3 + Math.floor((level - 1) / 3)) };
    }

    function levelSeed(level) {
        return (BASE_SEED + level * 7919) >>> 0;
    }

    function rotateMask(mask, times) {
        const count = ((times === undefined ? 1 : times) % 4 + 4) % 4;
        let result = mask & 15;
        for (let i = 0; i < count; i += 1) {
            result = ((result << 1) | (result >>> 3)) & 15;
        }
        return result;
    }

    /* 迭代随机 DFS 生成覆盖全格的生成树，返回每格连接掩码与树根（水源） */
    function generateTree(size, random) {
        const total = size * size;
        const masks = new Array(total).fill(0);
        const visited = new Array(total).fill(false);
        const source = Math.floor(random() * total);
        const stack = [source];
        visited[source] = true;

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const cx = current % size;
            const cy = Math.floor(current / size);
            const candidates = [];
            for (const dir of DIRS) {
                const nx = cx + dir.dx;
                const ny = cy + dir.dy;
                if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                const neighbor = ny * size + nx;
                if (!visited[neighbor]) {
                    candidates.push({ dir, neighbor });
                }
            }
            if (candidates.length === 0) {
                stack.pop();
                continue;
            }
            const picked = candidates[Math.floor(random() * candidates.length)];
            masks[current] |= picked.dir.bit;
            masks[picked.neighbor] |= picked.dir.opposite;
            visited[picked.neighbor] = true;
            stack.push(picked.neighbor);
        }

        return { masks, source };
    }

    /* 从任一格洪泛，返回与其连通的格子集合（双向开口匹配才算连通） */
    function computeConnected(masks, size, start) {
        const reached = new Set([start]);
        const queue = [start];
        while (queue.length > 0) {
            const current = queue.shift();
            const cx = current % size;
            const cy = Math.floor(current / size);
            for (const dir of DIRS) {
                if ((masks[current] & dir.bit) === 0) continue;
                const nx = cx + dir.dx;
                const ny = cy + dir.dy;
                if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                const neighbor = ny * size + nx;
                if (reached.has(neighbor)) continue;
                if ((masks[neighbor] & dir.opposite) === 0) continue;
                reached.add(neighbor);
                queue.push(neighbor);
            }
        }
        return reached;
    }

    /* 通关判定：所有开口都有邻格对接（无泄漏），且全部格子连通 */
    function isSolved(masks, size) {
        const total = size * size;
        for (let index = 0; index < total; index += 1) {
            const cx = index % size;
            const cy = Math.floor(index / size);
            for (const dir of DIRS) {
                if ((masks[index] & dir.bit) === 0) continue;
                const nx = cx + dir.dx;
                const ny = cy + dir.dy;
                if (nx < 0 || ny < 0 || nx >= size || ny >= size) return false;
                if ((masks[ny * size + nx] & dir.opposite) === 0) return false;
            }
        }
        return computeConnected(masks, size, 0).size === total;
    }

    /* 单格转回目标形状所需的最少顺时针次数 */
    function minimalCellSteps(currentMask, solvedMask) {
        for (let k = 0; k < 4; k += 1) {
            if (rotateMask(currentMask, k) === solvedMask) return k;
        }
        return 0;
    }

    /* 打乱：每格随机旋转；若打乱结果恰好已解，则强制旋转一个非全对称格 */
    function scrambleBoard(solvedMasks, size, random) {
        const cells = solvedMasks.map((mask) => rotateMask(mask, Math.floor(random() * 4)));
        if (isSolved(cells, size)) {
            const target = cells.findIndex((mask) => mask !== 15);
            if (target >= 0) {
                cells[target] = rotateMask(cells[target], 1);
            }
        }
        return cells;
    }

    function minimalStepsForBoard(cells, solvedMasks) {
        let total = 0;
        for (let index = 0; index < cells.length; index += 1) {
            total += minimalCellSteps(cells[index], solvedMasks[index]);
        }
        return total;
    }

    function starRating(steps, minSteps) {
        if (steps <= minSteps) return 3;
        if (steps <= Math.ceil(minSteps * 1.6)) return 2;
        return 1;
    }

    function loadBest(level) {
        const parsed = Number.parseInt(safeGetItem(BEST_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function saveBest(level, steps) {
        const previous = loadBest(level);
        const next = previous > 0 ? Math.min(previous, steps) : steps;
        safeSetItem(BEST_KEY_PREFIX + level, String(next));
        return next;
    }

    function loadUnlockedLevel() {
        return getStorageNumber(UNLOCK_KEY, 1);
    }

    function saveUnlockedLevel(level) {
        if (level > loadUnlockedLevel()) {
            safeSetItem(UNLOCK_KEY, String(level));
        }
    }

    function loadCurrentLevel() {
        return Math.min(getStorageNumber(CURRENT_KEY, 1), loadUnlockedLevel());
    }

    function saveCurrentLevel(level) {
        safeSetItem(CURRENT_KEY, String(level));
    }

    function createSvgElement(tag, attrs) {
        const node = documentObject.createElementNS(SVG_NS, tag);
        for (const name of Object.keys(attrs)) {
            node.setAttribute(name, attrs[name]);
        }
        return node;
    }

    /* 按掩码绘制单格管道：开口连线到边缘，端点/水源画储水节点 */
    function buildCellSvg(mask, isSource) {
        const svg = createSvgElement('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
        const openBits = DIRS.filter((dir) => (mask & dir.bit) !== 0);
        const segments = [];
        for (const dir of openBits) {
            const edgeX = 50 + dir.dx * 50;
            const edgeY = 50 + dir.dy * 50;
            segments.push(`M50 50 L${edgeX} ${edgeY}`);
        }
        const shape = createSvgElement('path', {
            d: segments.join(' '),
            class: 'pipe-shape',
            'stroke-width': '18',
            'stroke-linecap': 'round'
        });
        svg.appendChild(shape);
        if (isSource || openBits.length === 1) {
            const node = createSvgElement('circle', {
                cx: '50',
                cy: '50',
                r: isSource ? '22' : '15',
                class: 'pipe-node',
                'stroke-width': '8'
            });
            svg.appendChild(node);
        }
        return svg;
    }

    function updateHeader() {
        const best = loadBest(state.level);
        elements.levelText.textContent = `第 ${state.level} 关`;
        elements.stepsText.textContent = String(state.steps);
        elements.minStepsText.textContent = String(state.minSteps);
        elements.bestText.textContent = best > 0 ? String(best) : '--';
    }

    function updateConnectivity() {
        const reached = computeConnected(state.cells, state.size, state.source);
        for (let index = 0; index < state.cellButtons.length; index += 1) {
            if (reached.has(index)) {
                state.cellButtons[index].classList.add('is-connected');
            } else {
                state.cellButtons[index].classList.remove('is-connected');
            }
        }
    }

    function renderStars(container, stars) {
        const nodes = [];
        for (let index = 0; index < 3; index += 1) {
            const span = documentObject.createElement('span');
            span.textContent = '★';
            if (index >= stars) {
                span.className = 'star-off';
            }
            nodes.push(span);
        }
        container.replaceChildren(...nodes);
    }

    function showWinModal() {
        const stars = starRating(state.steps, state.minSteps);
        const best = saveBest(state.level, state.steps);
        saveUnlockedLevel(state.level + 1);
        renderStars(elements.resultStars, stars);
        elements.resultStars.setAttribute('aria-label', `${stars} 星`);
        elements.resultSteps.textContent = String(state.steps);
        elements.resultMin.textContent = String(state.minSteps);
        elements.resultBest.textContent = String(best);
        elements.winModal.hidden = false;
        updateHeader();
    }

    function handleCellTap(index) {
        if (state.locked) return;
        state.cells[index] = rotateMask(state.cells[index], 1);
        state.rotationDegrees[index] += 90;
        state.steps += 1;
        state.cellSvgs[index].style.transform = `rotate(${state.rotationDegrees[index]}deg)`;
        updateConnectivity();
        updateHeader();
        if (isSolved(state.cells, state.size)) {
            state.locked = true;
            elements.grid.classList.add('is-solved');
            setTimeout(showWinModal, 560);
        }
    }

    function renderBoard() {
        const total = state.size * state.size;
        const fragment = documentObject.createDocumentFragment();
        const buttons = [];
        const svgs = [];

        elements.grid.classList.remove('is-solved');
        elements.grid.style.gridTemplateColumns = `repeat(${state.size}, minmax(0, 1fr))`;
        elements.grid.setAttribute('aria-label', `第 ${state.level} 关，${state.size} 乘 ${state.size} 管道棋盘`);

        for (let index = 0; index < total; index += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'pipe-cell';
            if (index === state.source) {
                button.classList.add('is-source');
            }
            button.dataset.index = String(index);
            button.setAttribute('aria-label', `管道格 ${index + 1}`);
            const svg = buildCellSvg(state.cells[index], index === state.source);
            button.appendChild(svg);
            button.addEventListener('click', () => handleCellTap(index));
            buttons.push(button);
            svgs.push(svg);
            fragment.appendChild(button);
        }

        elements.grid.replaceChildren(fragment);
        state.cellButtons = buttons;
        state.cellSvgs = svgs;
        updateConnectivity();
    }

    function startLevel(level) {
        const config = levelConfig(level);
        const random = createSeededRandom(levelSeed(level));
        const tree = generateTree(config.size, random);

        state.level = level;
        state.size = config.size;
        state.source = tree.source;
        state.solvedMasks = tree.masks;
        state.cells = scrambleBoard(tree.masks, config.size, random);
        state.rotationDegrees = new Array(config.size * config.size).fill(0);
        state.steps = 0;
        state.minSteps = Math.max(1, minimalStepsForBoard(state.cells, state.solvedMasks));
        state.locked = false;

        elements.winModal.hidden = true;
        saveCurrentLevel(level);
        renderBoard();
        updateHeader();
    }

    function renderLevelPicker() {
        const unlocked = loadUnlockedLevel();
        const fragment = documentObject.createDocumentFragment();
        for (let level = 1; level <= unlocked; level += 1) {
            const button = documentObject.createElement('button');
            button.type = 'button';
            button.className = 'level-item';
            button.textContent = String(level);
            if (level === state.level) {
                button.classList.add('is-current');
            }
            button.addEventListener('click', () => {
                elements.levelModal.hidden = true;
                startLevel(level);
            });
            fragment.appendChild(button);
        }
        elements.levelGrid.replaceChildren(fragment);
    }

    elements.restartBtn.addEventListener('click', () => startLevel(state.level));
    elements.replayBtn.addEventListener('click', () => startLevel(state.level));
    elements.nextBtn.addEventListener('click', () => startLevel(state.level + 1));
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelPicker();
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });

    windowObject.Pipes = {
        SLUG,
        DIRS,
        createSeededRandom,
        levelConfig,
        levelSeed,
        rotateMask,
        generateTree,
        computeConnected,
        isSolved,
        minimalCellSteps,
        minimalStepsForBoard,
        scrambleBoard,
        starRating,
        loadBest,
        saveBest,
        loadUnlockedLevel,
        saveUnlockedLevel
    };

    startLevel(loadCurrentLevel());
})(window, document);
