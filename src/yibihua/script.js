(function setupYibiHua(windowObject, documentObject) {
    'use strict';

    const SLUG = 'yibihua';
    const TOTAL_LEVELS = 50;
    const STORAGE_PREFIX = 'yibihua-';

    const LEVEL_CONFIG = [
        { from: 1,  cols: 2, rows: 2, extra: 0,   label: '入门' },
        { from: 6,  cols: 2, rows: 3, extra: 0.1, label: '初级' },
        { from: 11, cols: 3, rows: 3, extra: 0.15,label: '进阶' },
        { from: 21, cols: 3, rows: 4, extra: 0.25,label: '挑战' },
        { from: 31, cols: 4, rows: 4, extra: 0.35,label: '困难' },
        { from: 41, cols: 4, rows: 5, extra: 0.45,label: '大师' }
    ];

    const memoryFallback = {};

    const state = {
        level: 1,
        currentLevel: null,
        currentNodeId: -1,
        drawnEdges: [],
        path: [],
        hintsUsed: 0,
        steps: 0,
        seconds: 0,
        startedAt: 0,
        timerId: 0,
        solved: false,
        cachedMaxUnlocked: null
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        starsText: documentObject.getElementById('stars-text'),
        stepsText: documentObject.getElementById('steps-text'),
        hintsText: documentObject.getElementById('hints-text'),
        board: documentObject.getElementById('board'),
        undoBtn: documentObject.getElementById('undo-btn'),
        hintBtn: documentObject.getElementById('hint-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        resetBtn: documentObject.getElementById('reset-btn'),
        resultModal: documentObject.getElementById('result-modal'),
        resultLevel: documentObject.getElementById('result-level'),
        resultSteps: documentObject.getElementById('result-steps'),
        resultTime: documentObject.getElementById('result-time'),
        resultHints: documentObject.getElementById('result-hints'),
        resultStars: documentObject.getElementById('result-stars'),
        nextBtn: documentObject.getElementById('next-btn'),
        replayBtn: documentObject.getElementById('replay-btn'),
        levelsModal: documentObject.getElementById('levels-modal'),
        levelsGrid: documentObject.getElementById('levels-grid'),
        levelsCloseBtn: documentObject.getElementById('levels-close-btn')
    };

    /* ---- seeded random ---- */
    function createRng(seed) {
        let s = seed | 0;
        return function next() {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    /* ---- storage helpers ---- */
    function safeGetItem(key) {
        try { return windowObject.localStorage.getItem(key); }
        catch (_) { return memoryFallback[key] || null; }
    }

    function safeSetItem(key, value) {
        try { windowObject.localStorage.setItem(key, value); }
        catch (_) { memoryFallback[key] = value; }
    }

    function safeRemoveItem(key) {
        try { windowObject.localStorage.removeItem(key); }
        catch (_) { delete memoryFallback[key]; }
    }

    function getStorageNumber(key) {
        const v = safeGetItem(key);
        const n = Number.parseInt(v || '0', 10);
        return Number.isFinite(n) ? n : 0;
    }

    function getStorageJSON(key) {
        try { return JSON.parse(safeGetItem(key)) || null; }
        catch (_) { return null; }
    }

    /* ---- records ---- */
    function getMaxUnlocked() {
        if (state.cachedMaxUnlocked !== null) return state.cachedMaxUnlocked;
        const v = getStorageNumber(STORAGE_PREFIX + 'max-unlocked');
        state.cachedMaxUnlocked = Math.max(1, v);
        return state.cachedMaxUnlocked;
    }

    function setMaxUnlocked(lv) {
        const cur = getMaxUnlocked();
        if (lv > cur) {
            safeSetItem(STORAGE_PREFIX + 'max-unlocked', String(lv));
            state.cachedMaxUnlocked = lv;
        }
    }

    function getLevelRecord(lv) {
        return getStorageJSON(STORAGE_PREFIX + 'level-' + lv);
    }

    function saveLevelRecord(lv, record) {
        safeSetItem(STORAGE_PREFIX + 'level-' + lv, JSON.stringify(record));
    }

    /* ---- level config lookup ---- */
    function getConfigForLevel(lv) {
        let cfg = LEVEL_CONFIG[0];
        for (let i = LEVEL_CONFIG.length - 1; i >= 0; i--) {
            if (lv >= LEVEL_CONFIG[i].from) { cfg = LEVEL_CONFIG[i]; break; }
        }
        return cfg;
    }

    /* ---- graph generation ---- */
    function edgeKey(a, b) {
        return a < b ? a + '-' + b : b + '-' + a;
    }

    function generateLevel(lv) {
        const cfg = getConfigForLevel(lv);
        const rng = createRng(lv * 7919 + 31);
        const cols = cfg.cols;
        const rows = cfg.rows;
        const total = cols * rows;

        const nodes = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = cols > 1 ? (c / (cols - 1)) : 0.5;
                const y = rows > 1 ? (r / (rows - 1)) : 0.5;
                nodes.push({ id: r * cols + c, x, y });
            }
        }

        const adjSet = new Map();
        for (let i = 0; i < total; i++) adjSet.set(i, new Set());

        function addEdge(a, b) {
            adjSet.get(a).add(b);
            adjSet.get(b).add(a);
        }

        function hasEdge(a, b) {
            return adjSet.get(a).has(b);
        }

        function degree(n) {
            return adjSet.get(n).size;
        }

        // Build zigzag Hamiltonian path (always valid on grid)
        const flipRows = rng() > 0.5;
        for (let r = 0; r < rows; r++) {
            const rr = flipRows ? (rows - 1 - r) : r;
            const leftToRight = (rr % 2 === 0) !== flipRows;
            for (let ci = 0; ci < cols - 1; ci++) {
                const c = leftToRight ? ci : (cols - 1 - ci);
                const cn = leftToRight ? (ci + 1) : (cols - 1 - ci - 1);
                addEdge(rr * cols + c, rr * cols + cn);
            }
            if (r < rows - 1) {
                const nextRr = flipRows ? (rows - 1 - r - 1) : (r + 1);
                const col = ((rr % 2 === 0) !== flipRows) ? (cols - 1) : 0;
                addEdge(rr * cols + col, nextRr * cols + col);
            }
        }

        // Path has exactly 2 odd nodes (endpoints). Add extra edges safely.
        const allPossible = [];
        for (let i = 0; i < total; i++) {
            for (const nb of getGridNeighbors(i, cols, rows)) {
                if (nb > i && !hasEdge(i, nb)) {
                    allPossible.push([i, nb]);
                }
            }
        }
        shuffle(allPossible, rng);

        const extraTarget = Math.round((total - 1) * cfg.extra);
        let extraAdded = 0;
        for (const [a, b] of allPossible) {
            if (extraAdded >= extraTarget) break;
            const da = degree(a) % 2;
            const db = degree(b) % 2;
            if (da === 0 && db === 0) {
                let curOdd = 0;
                for (let i = 0; i < total; i++) if (degree(i) % 2 !== 0) curOdd++;
                if (curOdd >= 2) continue;
            }
            addEdge(a, b);
            extraAdded += 1;
        }

        const neighbors = new Map();
        for (let i = 0; i < total; i++) neighbors.set(i, [...adjSet.get(i)]);

        const oddNodes = [];
        for (let i = 0; i < total; i++) {
            if (degree(i) % 2 !== 0) oddNodes.push(i);
        }

        let startNode = 0;
        if (oddNodes.length >= 2) startNode = oddNodes[0];

        const edgeList = [];
        const seenEdges = new Set();
        for (const [nid, nbs] of neighbors) {
            for (const nb of nbs) {
                const k = edgeKey(nid, nb);
                if (!seenEdges.has(k)) {
                    seenEdges.add(k);
                    edgeList.push({ from: nid, to: nb, key: k });
                }
            }
        }

        const eulerPath = findEulerPath(neighbors, edgeList, startNode);

        return { nodes, edges: edgeList, startNode, eulerPath, totalEdges: edgeList.length };
    }

    function getGridNeighbors(id, cols, rows) {
        const r = Math.floor(id / cols);
        const c = id % cols;
        const result = [];
        if (r > 0) result.push((r - 1) * cols + c);
        if (r < rows - 1) result.push((r + 1) * cols + c);
        if (c > 0) result.push(r * cols + (c - 1));
        if (c < cols - 1) result.push(r * cols + (c + 1));
        return result;
    }

    function shuffle(arr, rng) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
    }

    function findEulerPath(adjMap, edgeList, startNode) {
        const localAdj = new Map();
        for (const [nid, nbs] of adjMap) localAdj.set(nid, [...nbs]);

        const usedKeys = new Set();
        const stack = [startNode];
        const circuit = [];

        while (stack.length > 0) {
            let cur = stack[stack.length - 1];
            let found = false;
            const nbs = localAdj.get(cur);
            while (nbs && nbs.length > 0) {
                const nb = nbs.pop();
                const k = edgeKey(cur, nb);
                if (usedKeys.has(k)) continue;
                usedKeys.add(k);
                const nbNbs = localAdj.get(nb);
                const idx = nbNbs.indexOf(cur);
                if (idx !== -1) nbNbs.splice(idx, 1);
                stack.push(nb);
                found = true;
                break;
            }
            if (!found) {
                circuit.push(stack.pop());
            }
        }

        circuit.reverse();
        return circuit;
    }

    /* ---- stars ---- */
    function calculateStars(totalEdges, steps, hintsUsed) {
        if (totalEdges === 0) return 1;
        const efficiency = totalEdges / steps;
        if (efficiency >= 0.95 && hintsUsed === 0) return 3;
        if (efficiency >= 0.80 && hintsUsed <= 1) return 2;
        return 1;
    }

    /* ---- rendering ---- */
    function renderLevel() {
        const lv = generateLevel(state.level);
        state.currentLevel = lv;
        state.currentNodeId = lv.startNode;
        state.drawnEdges = [];
        state.path = [lv.startNode];
        state.hintsUsed = 0;
        state.steps = 0;
        state.seconds = 0;
        state.solved = false;

        const svg = elements.board;
        svg.innerHTML = '';

        const pad = 10;
        const inner = 100 - pad * 2;

        const g = documentObject.createElementNS('http://www.w3.org/2000/svg', 'g');

        for (const edge of lv.edges) {
            const nA = lv.nodes[edge.from];
            const nB = lv.nodes[edge.to];
            const line = documentObject.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', pad + nA.x * inner);
            line.setAttribute('y1', pad + nA.y * inner);
            line.setAttribute('x2', pad + nB.x * inner);
            line.setAttribute('y2', pad + nB.y * inner);
            line.classList.add('edge-line');
            line.dataset.key = edge.key;
            g.appendChild(line);
        }

        for (const node of lv.nodes) {
            const cx = pad + node.x * inner;
            const cy = pad + node.y * inner;

            const hit = documentObject.createElementNS('http://www.w3.org/2000/svg', 'circle');
            hit.setAttribute('cx', cx);
            hit.setAttribute('cy', cy);
            hit.setAttribute('r', 7);
            hit.classList.add('node-hit');
            hit.dataset.id = String(node.id);
            hit.addEventListener('click', () => handleNodeClick(node.id));
            g.appendChild(hit);

            const dot = documentObject.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', cx);
            dot.setAttribute('cy', cy);
            dot.setAttribute('r', 4);
            dot.classList.add('node-dot');
            dot.dataset.id = String(node.id);
            g.appendChild(dot);
        }

        svg.appendChild(g);
        updateBoardVisuals();
        updateHeader();
    }

    function updateBoardVisuals() {
        const lv = state.currentLevel;
        if (!lv) return;

        const drawnKeys = new Set(state.drawnEdges);
        const curNode = state.currentNodeId;

        const adjEdges = new Map();
        for (const edge of lv.edges) {
            if (drawnKeys.has(edge.key)) continue;
            if (edge.from === curNode || edge.to === curNode) {
                const neighbor = edge.from === curNode ? edge.to : edge.from;
                adjEdges.set(neighbor, edge.key);
            }
        }
        const reachableNodes = new Set(adjEdges.keys());

        const dots = elements.board.querySelectorAll('.node-dot');
        for (const dot of dots) {
            const nid = Number(dot.dataset.id);
            dot.classList.remove('is-current', 'is-start', 'is-reachable', 'is-complete');
            if (nid === curNode && !state.solved) dot.classList.add('is-current');
            if (nid === lv.startNode && nid !== curNode) dot.classList.add('is-start');
            if (reachableNodes.has(nid)) dot.classList.add('is-reachable');
        }

        const lines = elements.board.querySelectorAll('.edge-line');
        for (const line of lines) {
            line.classList.remove('is-drawn', 'is-hint');
            if (drawnKeys.has(line.dataset.key)) {
                line.classList.add('is-drawn');
            }
        }

        if (state.solved) {
            for (const dot of dots) {
                dot.classList.remove('is-current', 'is-reachable');
                dot.classList.add('is-complete');
            }
        }
    }

    /* ---- interaction ---- */
    function handleNodeClick(nid) {
        if (state.solved) return;

        const lv = state.currentLevel;
        if (!lv) return;
        if (nid === state.currentNodeId) return;

        const drawnKeys = new Set(state.drawnEdges);
        const k = edgeKey(state.currentNodeId, nid);

        let valid = false;
        for (const edge of lv.edges) {
            if (edge.key === k && !drawnKeys.has(k)) { valid = true; break; }
        }
        if (!valid) return;

        state.drawnEdges.push(k);
        state.path.push(nid);
        state.currentNodeId = nid;
        state.steps += 1;

        updateBoardVisuals();
        updateHeader();

        if (state.drawnEdges.length === lv.totalEdges) {
            handleSolved();
        }
    }

    function handleUndo() {
        if (state.solved) return;
        if (state.path.length <= 1) return;

        state.drawnEdges.pop();
        state.path.pop();
        state.currentNodeId = state.path[state.path.length - 1];

        updateBoardVisuals();
        updateHeader();
    }

    function handleHint() {
        if (state.solved) return;
        const lv = state.currentLevel;
        if (!lv) return;

        const drawnKeys = new Set(state.drawnEdges);
        let hintKey = '';

        for (let i = 0; i < lv.eulerPath.length - 1; i++) {
            const k = edgeKey(lv.eulerPath[i], lv.eulerPath[i + 1]);
            if (lv.eulerPath[i] === state.currentNodeId && !drawnKeys.has(k)) {
                hintKey = k;
                break;
            }
        }

        if (!hintKey) {
            const nextEdge = lv.edges.find((edge) => {
                if (drawnKeys.has(edge.key)) return false;
                return edge.from === state.currentNodeId || edge.to === state.currentNodeId;
            });
            if (!nextEdge) return;
            hintKey = nextEdge.key;
        }

        const hintLine = elements.board.querySelector(`.edge-line[data-key="${hintKey}"]`);
        if (hintLine) {
            hintLine.classList.add('is-hint');
            setTimeout(() => hintLine.classList.remove('is-hint'), 1500);
        }

        state.hintsUsed += 1;
        updateHeader();
    }

    function handleSolved() {
        state.solved = true;
        stopTimer();

        const lv = state.currentLevel;
        const stars = calculateStars(lv.totalEdges, state.steps, state.hintsUsed);

        const prev = getLevelRecord(state.level);
        const shouldSave = !prev || stars > prev.stars ||
            (stars === prev.stars && state.steps < prev.steps);
        if (shouldSave) {
            saveLevelRecord(state.level, {
                stars, steps: state.steps, hints: state.hintsUsed, seconds: state.seconds
            });
        }

        if (state.level < TOTAL_LEVELS) {
            setMaxUnlocked(Math.max(state.level + 1, getMaxUnlocked()));
        }

        updateBoardVisuals();
        showResultModal(stars);
    }

    function handleReset() {
        stopTimer();
        state.cachedMaxUnlocked = null;
        renderLevel();
        startTimer();
    }

    /* ---- timer ---- */
    function startTimer() {
        stopTimer();
        state.startedAt = Date.now();
        state.seconds = 0;
        state.timerId = setInterval(() => {
            state.seconds = Math.floor((Date.now() - state.startedAt) / 1000);
        }, 1000);
    }

    function stopTimer() {
        if (state.timerId) {
            clearInterval(state.timerId);
            state.timerId = 0;
        }
    }

    /* ---- UI ---- */
    function updateHeader() {
        elements.levelText.textContent = String(state.level);
        elements.stepsText.textContent = String(state.steps);
        elements.hintsText.textContent = String(state.hintsUsed);

        const rec = getLevelRecord(state.level);
        elements.starsText.textContent = rec ? starString(rec.stars) : '-';
    }

    function starString(n) {
        return '★'.repeat(n) + '☆'.repeat(3 - n);
    }

    function showResultModal(stars) {
        elements.resultLevel.textContent = String(state.level);
        elements.resultSteps.textContent = String(state.steps);
        elements.resultTime.textContent = state.seconds + '秒';
        elements.resultHints.textContent = String(state.hintsUsed);

        let starsHtml = '';
        for (let i = 0; i < 3; i++) {
            const filled = i < stars ? 'is-filled' : '';
            starsHtml += `<svg class="result-star ${filled}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>`;
        }
        elements.resultStars.innerHTML = starsHtml;

        elements.nextBtn.disabled = state.level >= TOTAL_LEVELS;

        elements.resultModal.hidden = false;
        elements.nextBtn.focus();
    }

    function showLevelsModal() {
        const maxUnlocked = getMaxUnlocked();
        let html = '';
        for (let i = 1; i <= TOTAL_LEVELS; i++) {
            const locked = i > maxUnlocked ? 'is-locked' : '';
            const rec = getLevelRecord(i);
            let starsHtml = '';
            for (let s = 0; s < 3; s++) {
                const filled = rec && s < rec.stars ? 'is-filled' : '';
                starsHtml += `<svg class="level-cell-star ${filled}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01z"/></svg>`;
            }
            html += `<button class="level-cell ${locked}" data-level="${i}" ${locked ? 'disabled' : ''}>
                <span>${i}</span>
                <span class="level-cell-stars">${starsHtml}</span>
            </button>`;
        }
        elements.levelsGrid.innerHTML = html;
        elements.levelsModal.hidden = false;
    }

    function loadLevel(lv) {
        state.level = lv;
        state.cachedMaxUnlocked = null;
        renderLevel();
        startTimer();
    }

    function handleLevelGridClick(e) {
        const cell = e.target.closest('.level-cell');
        if (!cell || cell.classList.contains('is-locked')) return;
        const lv = Number(cell.dataset.level);
        elements.levelsModal.hidden = true;
        loadLevel(lv);
    }

    /* ---- event bindings ---- */
    elements.undoBtn.addEventListener('click', handleUndo);
    elements.hintBtn.addEventListener('click', handleHint);
    elements.levelsBtn.addEventListener('click', showLevelsModal);
    elements.levelsGrid.addEventListener('click', handleLevelGridClick);
    elements.resetBtn.addEventListener('click', handleReset);
    elements.levelsCloseBtn.addEventListener('click', () => {
        elements.levelsModal.hidden = true;
    });

    elements.nextBtn.addEventListener('click', () => {
        elements.resultModal.hidden = true;
        if (state.level < TOTAL_LEVELS) {
            loadLevel(state.level + 1);
        }
    });

    elements.replayBtn.addEventListener('click', () => {
        elements.resultModal.hidden = true;
        loadLevel(state.level);
    });

    /* ---- public API ---- */
    windowObject.YibiHua = {
        SLUG,
        TOTAL_LEVELS,
        LEVEL_CONFIG,
        getConfigForLevel,
        generateLevel,
        findEulerPath,
        calculateStars,
        edgeKey,
        getMaxUnlocked,
        getLevelRecord,
        saveLevelRecord
    };

    /* ---- init ---- */
    state.level = Math.min(getMaxUnlocked(), TOTAL_LEVELS);
    renderLevel();
    startTimer();

})(window, document);
