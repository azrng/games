(function setupTangram(windowObject, documentObject) {
    'use strict';

    const SLUG = 'tangram';
    const UNLOCK_KEY = 'tangram-unlocked-level';
    const STARS_KEY_PREFIX = 'tangram-stars-';
    const memoryFallback = {};

    /* 板块类型色：同类型板块与槽位共用一色，配色提示不会误导（两大三角可互换） */
    const TYPE_COLORS = { L: '#ff8a5c', M: '#58b368', S: '#4da3ff', Q: '#b56cd9', P: '#f5c93f' };
    const TYPE_NAMES = { L: '大三角', M: '中三角', S: '小三角', Q: '正方', P: '平行四边形' };
    const HINT_MODE_TEXT = ['按颜色拼', '按灰影拼', '纯剪影挑战'];

    /* 托盘用的七块标准形态（坐标为关卡坐标系的 2 倍刻度，面积：L16/M8/S4/Q8/P8） */
    const PIECE_DEFS = [
        { t: 'L', pts: [[0, 0], [8, 0], [4, 4]] },
        { t: 'L', pts: [[0, 0], [8, 0], [4, 4]] },
        { t: 'M', pts: [[0, 0], [4, 0], [0, 4]] },
        { t: 'S', pts: [[0, 0], [4, 0], [2, 2]] },
        { t: 'S', pts: [[0, 0], [4, 0], [2, 2]] },
        { t: 'Q', pts: [[2, 0], [4, 2], [2, 4], [0, 2]] },
        { t: 'P', pts: [[0, 2], [2, 0], [6, 0], [4, 2]] }
    ];

    /* 12 关剪影数据：由精确覆盖搜索生成并经采样校验的合法七块拼法（坐标为 2 倍刻度） */
    const LEVELS = [
        {name:"正方形",w:8,h:8,hint:0,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[0,0],[0,8],[4,4]]},{"t":"M","pts":[[8,8],[8,4],[4,8]]},{"t":"Q","pts":[[6,6],[4,4],[2,6],[4,8]]},{"t":"P","pts":[[6,6],[8,4],[8,0],[6,2]]},{"t":"S","pts":[[4,8],[2,6],[0,8]]},{"t":"S","pts":[[6,2],[4,4],[6,6]]}]},
        {name:"大三角形",w:16,h:8,hint:0,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[16,0],[8,0],[12,4]]},{"t":"M","pts":[[8,4],[8,8],[12,4]]},{"t":"Q","pts":[[8,4],[6,2],[4,4],[6,6]]},{"t":"P","pts":[[6,2],[8,4],[12,4],[10,2]]},{"t":"S","pts":[[10,2],[8,0],[6,2]]},{"t":"S","pts":[[8,4],[6,6],[8,8]]}]},
        {name:"正方形",w:8,h:8,hint:0,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[0,0],[0,8],[4,4]]},{"t":"M","pts":[[8,8],[8,4],[4,8]]},{"t":"Q","pts":[[8,4],[6,2],[4,4],[6,6]]},{"t":"P","pts":[[6,6],[4,8],[0,8],[2,6]]},{"t":"S","pts":[[6,6],[4,4],[2,6]]},{"t":"S","pts":[[8,0],[6,2],[8,4]]}]},
        {name:"大三角形",w:16,h:8,hint:0,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[16,0],[8,0],[12,4]]},{"t":"M","pts":[[8,4],[8,8],[12,4]]},{"t":"Q","pts":[[10,2],[8,0],[6,2],[8,4]]},{"t":"P","pts":[[6,2],[8,4],[8,8],[6,6]]},{"t":"S","pts":[[12,4],[10,2],[8,4]]},{"t":"S","pts":[[6,2],[4,4],[6,6]]}]},
        {name:"大三角形",w:16,h:8,hint:1,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[16,0],[8,0],[12,4]]},{"t":"M","pts":[[8,4],[12,4],[8,0]]},{"t":"Q","pts":[[8,4],[6,2],[4,4],[6,6]]},{"t":"P","pts":[[12,4],[10,6],[6,6],[8,4]]},{"t":"S","pts":[[8,0],[6,2],[8,4]]},{"t":"S","pts":[[6,6],[8,8],[10,6]]}]},
        {name:"正方形",w:8,h:8,hint:1,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[8,8],[8,0],[4,4]]},{"t":"M","pts":[[0,8],[4,8],[0,4]]},{"t":"Q","pts":[[4,4],[2,2],[0,4],[2,6]]},{"t":"P","pts":[[2,6],[4,8],[8,8],[6,6]]},{"t":"S","pts":[[0,4],[2,2],[0,0]]},{"t":"S","pts":[[6,6],[4,4],[2,6]]}]},
        {name:"大三角形",w:16,h:8,hint:1,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[16,0],[8,0],[12,4]]},{"t":"M","pts":[[8,4],[12,4],[8,0]]},{"t":"Q","pts":[[10,6],[8,4],[6,6],[8,8]]},{"t":"P","pts":[[6,6],[8,4],[8,0],[6,2]]},{"t":"S","pts":[[6,2],[4,4],[6,6]]},{"t":"S","pts":[[8,4],[10,6],[12,4]]}]},
        {name:"正方形",w:8,h:8,hint:1,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[8,8],[8,0],[4,4]]},{"t":"M","pts":[[0,8],[4,8],[0,4]]},{"t":"Q","pts":[[6,6],[4,4],[2,6],[4,8]]},{"t":"P","pts":[[0,0],[2,2],[2,6],[0,4]]},{"t":"S","pts":[[2,6],[4,4],[2,2]]},{"t":"S","pts":[[8,8],[6,6],[4,8]]}]},
        {name:"大三角形",w:16,h:8,hint:2,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[16,0],[8,0],[12,4]]},{"t":"M","pts":[[8,4],[8,0],[4,4]]},{"t":"Q","pts":[[10,6],[8,4],[6,6],[8,8]]},{"t":"P","pts":[[8,0],[10,2],[10,6],[8,4]]},{"t":"S","pts":[[10,6],[12,4],[10,2]]},{"t":"S","pts":[[4,4],[6,6],[8,4]]}]},
        {name:"正方形",w:8,h:8,hint:2,samples:64,slots:[{"t":"L","pts":[[0,0],[0,8],[4,4]]},{"t":"L","pts":[[0,8],[8,8],[4,4]]},{"t":"M","pts":[[8,0],[4,0],[8,4]]},{"t":"Q","pts":[[6,2],[4,0],[2,2],[4,4]]},{"t":"P","pts":[[6,2],[8,4],[8,8],[6,6]]},{"t":"S","pts":[[6,2],[4,4],[6,6]]},{"t":"S","pts":[[0,0],[2,2],[4,0]]}]},
        {name:"大三角形",w:16,h:8,hint:2,samples:64,slots:[{"t":"L","pts":[[8,0],[0,0],[4,4]]},{"t":"L","pts":[[16,0],[8,0],[12,4]]},{"t":"M","pts":[[8,4],[8,0],[4,4]]},{"t":"Q","pts":[[12,4],[10,2],[8,4],[10,6]]},{"t":"P","pts":[[4,4],[6,6],[10,6],[8,4]]},{"t":"S","pts":[[8,4],[10,2],[8,0]]},{"t":"S","pts":[[6,6],[8,8],[10,6]]}]},
        {name:"正方形",w:8,h:8,hint:2,samples:64,slots:[{"t":"L","pts":[[0,0],[0,8],[4,4]]},{"t":"L","pts":[[0,8],[8,8],[4,4]]},{"t":"M","pts":[[8,0],[4,0],[8,4]]},{"t":"Q","pts":[[8,4],[6,2],[4,4],[6,6]]},{"t":"P","pts":[[0,0],[2,2],[6,2],[4,0]]},{"t":"S","pts":[[8,4],[6,6],[8,8]]},{"t":"S","pts":[[2,2],[4,4],[6,2]]}]}
    ];

    const state = {
        level: 1,
        filled: [],
        selected: -1,
        trayOrder: [],
        locked: false
    };

    const elements = {
        levelText: documentObject.getElementById('level-text'),
        placedText: documentObject.getElementById('placed-text'),
        bestText: documentObject.getElementById('best-text'),
        board: documentObject.getElementById('board'),
        tray: documentObject.getElementById('tray'),
        hintText: documentObject.getElementById('hint-text'),
        restartBtn: documentObject.getElementById('restart-btn'),
        levelsBtn: documentObject.getElementById('levels-btn'),
        winModal: documentObject.getElementById('win-modal'),
        resultStars: documentObject.getElementById('result-stars'),
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

    function getUnlockedLevel() {
        const parsed = Number.parseInt(safeGetItem(UNLOCK_KEY) || '', 10);
        return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    }

    function saveUnlockedLevel(level) {
        const current = getUnlockedLevel();
        if (level > current) safeSetItem(UNLOCK_KEY, String(level));
    }

    function getStars(level) {
        const parsed = Number.parseInt(safeGetItem(STARS_KEY_PREFIX + level) || '', 10);
        return Number.isFinite(parsed) && parsed >= 1 && parsed <= 3 ? parsed : 0;
    }

    function saveStars(level, stars) {
        if (stars > getStars(level)) safeSetItem(STARS_KEY_PREFIX + level, String(stars));
    }

    /* mulberry32 种子随机，保证托盘顺序同种子可复现 */
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

    function levelCount() {
        return LEVELS.length;
    }

    function levelData(level) {
        const index = Math.min(Math.max(level, 1), LEVELS.length) - 1;
        return LEVELS[index];
    }

    /* 类型匹配：同型即可互填（两大三角、两小三角各自可互换） */
    function matchPiece(slotType, pieceType) {
        return slotType === pieceType;
    }

    function slotCentroid(slot) {
        const pts = slot.pts;
        let x = 0;
        let y = 0;
        for (const p of pts) {
            x += p[0];
            y += p[1];
        }
        return [x / pts.length, y / pts.length];
    }

    /* 纯剪影模式：点击处取最近的未填槽位 */
    function placeAtNearest(level, filledIndexes, x, y) {
        const data = levelData(level);
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < data.slots.length; i += 1) {
            if (filledIndexes.indexOf(i) !== -1) continue;
            const c = slotCentroid(data.slots[i]);
            const dist = (c[0] - x) * (c[0] - x) + (c[1] - y) * (c[1] - y);
            if (dist < bestDist) {
                bestDist = dist;
                best = i;
            }
        }
        return best;
    }

    /* 托盘顺序：七块下标的标准洗牌，同种子可复现 */
    function shuffleTray(seed) {
        const order = [0, 1, 2, 3, 4, 5, 6];
        const random = createSeededRandom(seed);
        for (let i = order.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            const tmp = order[i];
            order[i] = order[j];
            order[j] = tmp;
        }
        return order;
    }

    /* 零失败设计：拼错只做形状反馈，不计失误；通关即三星 */
    function starRating() {
        return 3;
    }

    function starsText(stars) {
        return '★'.repeat(stars) + '☆'.repeat(3 - stars);
    }

    /* ===== 渲染 ===== */

    const SVG_NS = 'http://www.w3.org/2000/svg';

    function svgPolygon(points, fill, stroke, strokeWidth, className) {
        const el = documentObject.createElementNS(SVG_NS, 'polygon');
        el.setAttribute('points', points.map((p) => p.join(',')).join(' '));
        el.setAttribute('fill', fill);
        if (stroke) {
            el.setAttribute('stroke', stroke);
            el.setAttribute('stroke-width', String(strokeWidth || 2));
            el.setAttribute('stroke-linejoin', 'round');
        }
        if (className) el.setAttribute('class', className);
        return el;
    }

    function renderBoard() {
        const data = levelData(state.level);
        const board = elements.board;
        board.setAttribute('viewBox', '0 0 ' + data.w + ' ' + data.h);
        while (board.firstChild) board.removeChild(board.firstChild);

        /* 槽位层 */
        const hint = data.hint;
        data.slots.forEach((slot, index) => {
            let fill = 'transparent';
            let stroke = null;
            if (hint === 0) {
                fill = TYPE_COLORS[slot.t] + '40';
                stroke = TYPE_COLORS[slot.t];
            } else if (hint === 1) {
                fill = '#e3e7ef';
                stroke = '#9aa1b5';
            } else {
                /* 纯剪影：统一深色填充，内部边界不可见 */
                fill = '#5b5044';
            }
            const poly = svgPolygon(slot.pts, fill, stroke, Math.max(2, Math.min(data.w, data.h) / 40), 'tg-slot');
            poly.setAttribute('data-slot', String(index));
            poly.addEventListener('click', () => {
                handleSlotClick(index);
            });
            board.appendChild(poly);
        });

        /* 已填板块层 */
        const filledLayer = documentObject.createElementNS(SVG_NS, 'g');
        filledLayer.setAttribute('id', 'tg-filled-layer');
        board.appendChild(filledLayer);
        state.filled.forEach((entry) => {
            filledLayer.appendChild(svgPolygon(
                data.slots[entry.slot].pts,
                TYPE_COLORS[data.slots[entry.slot].t],
                '#ffffff',
                Math.max(2, Math.min(data.w, data.h) / 60),
                'tg-piece-fill'
            ));
        });
    }

    function renderTray() {
        const tray = elements.tray;
        while (tray.firstChild) tray.removeChild(tray.firstChild);
        state.trayOrder.forEach((pieceIndex) => {
            const def = PIECE_DEFS[pieceIndex];
            const btn = documentObject.createElement('button');
            btn.type = 'button';
            btn.className = 'tray-piece';
            btn.setAttribute('aria-label', TYPE_NAMES[def.t]);
            btn.setAttribute('data-piece', String(pieceIndex));
            if (state.filled.some((entry) => entry.piece === pieceIndex)) {
                btn.classList.add('is-used');
            }
            if (state.selected === pieceIndex) {
                btn.classList.add('is-selected');
            }
            const svg = documentObject.createElementNS(SVG_NS, 'svg');
            svg.setAttribute('viewBox', '-0.6 -0.6 9.2 9.2');
            svg.appendChild(svgPolygon(def.pts, TYPE_COLORS[def.t], '#ffffff', 0.5));
            btn.appendChild(svg);
            btn.addEventListener('click', () => {
                handleTrayClick(pieceIndex);
            });
            tray.appendChild(btn);
        });
    }

    function updateHud() {
        const data = levelData(state.level);
        elements.levelText.textContent = '第 ' + state.level + ' 关';
        elements.placedText.textContent = state.filled.length + '/7';
        elements.hintText.textContent = HINT_MODE_TEXT[data.hint] + ' · ' + data.name;
        elements.hintText.classList.remove('is-warn');
        const stars = getStars(state.level);
        elements.bestText.textContent = stars > 0 ? '★'.repeat(stars) : '--';
    }

    function handleTrayClick(pieceIndex) {
        if (state.locked) return;
        if (state.filled.some((entry) => entry.piece === pieceIndex)) return;
        state.selected = state.selected === pieceIndex ? -1 : pieceIndex;
        renderTray();
    }

    function handleSlotClick(slotIndex) {
        if (state.locked) return;
        const data = levelData(state.level);
        if (state.filled.some((entry) => entry.slot === slotIndex)) return;
        if (state.selected < 0) {
            flashHint('先从下面选一块板');
            return;
        }
        const pieceDef = PIECE_DEFS[state.selected];
        if (!matchPiece(data.slots[slotIndex].t, pieceDef.t)) {
            /* 零失败：形状不匹配只提示与抖动，不计失误 */
            flashHint('形状不对，换一块试试');
            shakeSlot(slotIndex);
            state.selected = -1;
            renderTray();
            return;
        }
        state.filled.push({ slot: slotIndex, piece: state.selected });
        state.selected = -1;
        renderBoard();
        renderTray();
        updateHud();
        if (state.filled.length === data.slots.length) {
            finishLevel();
        }
    }

    /* 纯剪影模式：点在拼板任意处按最近未填槽位判定 */
    function handleBoardTap(event) {
        if (levelData(state.level).hint !== 2 || state.locked) return;
        const data = levelData(state.level);
        const rect = elements.board.getBoundingClientRect();
        const scale = data.w / Math.max(rect.width, 1);
        const x = (event.clientX - rect.left) * scale;
        const nearest = placeAtNearest(state.level, state.filled.map((entry) => entry.slot), x, 0);
        if (nearest >= 0) handleSlotClick(nearest);
    }

    function shakeSlot(slotIndex) {
        const slotEl = elements.board.querySelector('[data-slot="' + slotIndex + '"]');
        if (!slotEl) return;
        slotEl.classList.remove('is-shake');
        /* 强制重启动画 */
        void slotEl.getBoundingClientRect;
        slotEl.classList.add('is-shake');
        windowObject.setTimeout(() => {
            slotEl.classList.remove('is-shake');
        }, 400);
    }

    let hintTimer = 0;
    function flashHint(text) {
        elements.hintText.textContent = text;
        elements.hintText.classList.add('is-warn');
        windowObject.clearTimeout(hintTimer);
        hintTimer = windowObject.setTimeout(() => {
            updateHud();
        }, 1400);
    }

    function finishLevel() {
        state.locked = true;
        const stars = starRating();
        saveStars(state.level, stars);
        saveUnlockedLevel(state.level + 1);
        updateHud();
        elements.resultStars.textContent = starsText(stars);
        elements.nextBtn.hidden = state.level >= levelCount();
        windowObject.setTimeout(() => {
            elements.winModal.hidden = false;
        }, 450);
    }

    function startLevel(level) {
        state.level = Math.min(Math.max(level, 1), levelCount());
        state.filled = [];
        state.selected = -1;
        state.locked = false;
        state.trayOrder = shuffleTray(state.level * 7919 + 13);
        elements.winModal.hidden = true;
        elements.levelModal.hidden = true;
        renderBoard();
        renderTray();
        updateHud();
    }

    function renderLevelGrid() {
        const grid = elements.levelGrid;
        while (grid.firstChild) grid.removeChild(grid.firstChild);
        const unlocked = getUnlockedLevel();
        for (let i = 1; i <= levelCount(); i += 1) {
            const cell = documentObject.createElement('button');
            cell.type = 'button';
            cell.className = 'level-cell' + (i === state.level ? ' is-current' : '');
            cell.disabled = i > unlocked;
            const name = documentObject.createElement('span');
            name.textContent = String(i);
            const stars = documentObject.createElement('span');
            stars.className = 'stars';
            stars.textContent = starsText(getStars(i));
            cell.appendChild(name);
            cell.appendChild(stars);
            cell.addEventListener('click', () => {
                startLevel(i);
            });
            grid.appendChild(cell);
        }
    }

    elements.restartBtn.addEventListener('click', () => {
        startLevel(state.level);
    });
    elements.levelsBtn.addEventListener('click', () => {
        renderLevelGrid();
        elements.levelModal.hidden = false;
    });
    elements.closeLevelsBtn.addEventListener('click', () => {
        elements.levelModal.hidden = true;
    });
    elements.replayBtn.addEventListener('click', () => {
        startLevel(state.level);
    });
    elements.nextBtn.addEventListener('click', () => {
        startLevel(state.level + 1);
    });
    if (typeof elements.board.addEventListener === 'function') {
        elements.board.addEventListener('click', handleBoardTap);
    }

    /* 默认进入最高已解锁关卡 */
    startLevel(Math.min(getUnlockedLevel(), levelCount()));

    /* 供 smoke 测试调用的纯逻辑与存档接口 */
    windowObject.TangramApi = {
        SLUG,
        LEVELS,
        PIECE_DEFS,
        TYPE_COLORS,
        levelCount,
        levelData,
        matchPiece,
        placeAtNearest,
        slotCentroid,
        shuffleTray,
        starRating,
        createSeededRandom,
        getUnlockedLevel,
        saveUnlockedLevel,
        getStars,
        saveStars
    };
})(window, document);
