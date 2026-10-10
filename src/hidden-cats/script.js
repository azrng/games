    (function () {
        "use strict";

        /* ===== 常量与配置 ===== */
        const STORAGE_PREFIX = "hidden-cats-";
        const MIN_SCALE = 0.4;
        const MAX_SCALE = 3.0;
        const HIT_RADIUS_MULT = 1.3;
        const SKETCH_LINE = "#8c7a6b";
        const SKETCH_LIGHT = "#b8a696";
        const CAT_LINE = "#8a5a3b";
        /* 猫咪姿势数量：0-3 基础姿势（坐/蹲/蜷/站），4-7 扩展姿势（伸懒腰/拱背/趴平/回望） */
        const CAT_POSE_COUNT = 8;

        const SCENE_TEMPLATES = ["travel", "harbor", "library", "garden", "kitchen", "museum"];
        const LEVEL_DIFFICULTY = [
            { from: 1, cats: 3, size: 1120, obstaclePerCat: 3, extraObstacles: 10, textureBoost: 0.72, decoyBase: 10, minCatSpacing: 0.13, candidateMultiplier: 5 },
            { from: 4, cats: 4, size: 1280, obstaclePerCat: 4, extraObstacles: 13, textureBoost: 0.84, decoyBase: 13, minCatSpacing: 0.12, candidateMultiplier: 5 },
            { from: 7, cats: 5, size: 1440, obstaclePerCat: 4, extraObstacles: 15, textureBoost: 0.94, decoyBase: 16, minCatSpacing: 0.11, candidateMultiplier: 6 },
            { from: 11, cats: 7, size: 1640, obstaclePerCat: 5, extraObstacles: 18, textureBoost: 1.04, decoyBase: 19, minCatSpacing: 0.1, candidateMultiplier: 6 },
            { from: 16, cats: 9, size: 1840, obstaclePerCat: 5, extraObstacles: 22, textureBoost: 1.14, decoyBase: 22, minCatSpacing: 0.09, candidateMultiplier: 7 },
        ];

        function levelDifficulty(level) {
            let tier = LEVEL_DIFFICULTY[0];
            for (const item of LEVEL_DIFFICULTY) {
                if (level >= item.from) tier = item;
            }
            const nextTier = LEVEL_DIFFICULTY.find((item) => item.from > tier.from);
            const tierProgress = nextTier ? Math.min(level - tier.from, nextTier.from - tier.from - 1) : Math.min(level - tier.from, 8);
            return {
                ...tier,
                size: Math.min(tier.size + tierProgress * 52, 2200),
            };
        }

        function rawShuffledSceneTemplatesForCycle(cycle) {
            const shuffled = SCENE_TEMPLATES.slice();
            const random = seededRandom(deriveSeed((cycle + 1) * 2654435761, 71));
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }

        function shuffledSceneTemplatesForCycle(cycle) {
            const shuffled = rawShuffledSceneTemplatesForCycle(cycle);
            if (cycle > 0) {
                const previous = shuffledSceneTemplatesForCycle(cycle - 1);
                for (let i = 0; i < shuffled.length; i++) {
                    if (shuffled[i] !== previous[i]) continue;
                    const swapIndex = shuffled.findIndex((item, candidateIndex) => (
                        candidateIndex !== i &&
                        item !== previous[i] &&
                        shuffled[i] !== previous[candidateIndex]
                    ));
                    if (swapIndex >= 0) {
                        [shuffled[i], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[i]];
                    }
                }
            }
            return shuffled;
        }

        function sceneTemplateForLevel(level) {
            const cycle = Math.floor((level - 1) / SCENE_TEMPLATES.length);
            const index = (level - 1) % SCENE_TEMPLATES.length;
            return shuffledSceneTemplatesForCycle(cycle)[index];
        }

        /* 每关猫咪数量由难度配置表控制 */
        function catCount(level) {
            return Math.min(levelDifficulty(level).cats, 10);
        }

        /* 画布尺寸随难度配置递增 */
        function canvasSize(level) {
            return levelDifficulty(level).size;
        }

        /* 干扰物数量 */
        function obstacleCount(cats, level) {
            const difficulty = levelDifficulty(level);
            return cats * difficulty.obstaclePerCat + difficulty.extraObstacles;
        }

        function hintsForLevel(cats, level) {
            return Math.max(2, Math.min(5, Math.ceil(cats / 3) + (level >= 10 ? 1 : 0)));
        }

        /* ===== DOM 引用 ===== */
        const $ = (s) => document.querySelector(s);
        let canvas = $("#gameCanvas");
        let ctx = canvas.getContext("2d");
        const wrap = $("#canvasWrap");

        const uiLevel = $("#levelLabel");
        const uiSteps = $("#stepCount");
        const uiTimer = $("#timerDisplay");
        const uiProgressCount = $("#progressCount");
        const uiProgressFill = $("#progressFill");
        const uiHintBadge = $("#hintBadge");
        const btnHint = $("#btnHint");
        const btnResetView = $("#btnResetView");
        const btnLevels = $("#btnLevels");
        const btnRestart = $("#btnRestart");
        const btnReplay = $("#btnReplay");
        const btnShare = $("#btnShare");
        const btnNext = $("#btnNext");
        const winOverlay = $("#winOverlay");
        const introOverlay = $("#introOverlay");
        const levelOverlay = $("#levelOverlay");
        const levelPanel = $("#levelPanel");
        const levelGrid = $("#levelGrid");
        const levelScrollHint = $("#levelScrollHint");
        const btnIntroStart = $("#btnIntroStart");
        const btnCloseLevels = $("#btnCloseLevels");
        const proximityToast = $("#proximityToast");
        const comboToast = $("#comboToast");
        const shareToast = $("#shareToast");

        /* ===== 游戏状态 ===== */
        let state = {};

        function initState(level, levelSeed) {
            const size = canvasSize(level);
            const cats = catCount(level);
            const stableSeed = normalizeSeed(levelSeed || createLevelSeed(level));
            state = {
                level,
                size,
                levelSeed: stableSeed,
                sceneTemplate: sceneTemplateForLevel(level),
                difficulty: levelDifficulty(level),
                sceneSeed: deriveSeed(stableSeed, 11),
                catSeed: deriveSeed(stableSeed, 23),
                obstacleSeed: deriveSeed(stableSeed, 37),
                hintSeed: deriveSeed(stableSeed, 53),
                cats: [],           // { x, y, r, found, variant }
                obstacles: [],      // { x, y, type, scale, rotation }
                landmarks: [],
                foundCount: 0,
                totalCats: cats,
                steps: 0,
                hints: hintsForLevel(cats, level),
                startTime: null,
                elapsed: 0,
                timerInterval: null,
                scale: 1,
                offsetX: 0,
                offsetY: 0,
                won: false,
                backgroundCanvas: null,
                currentStars: 0,
                dpr: 1,
                lastFoundAt: 0,
                comboCount: 0,
                maxCombo: 0,
            };
        }

        /* ===== 绘制工具 ===== */

        /* 随机整数 [min, max] */
        function randInt(min, max, random = Math.random) { return Math.floor(random() * (max - min + 1)) + min; }
        function randFloat(min, max, random = Math.random) { return random() * (max - min) + min; }

        function normalizeSeed(seed) {
            let value = Math.floor(seed) % 2147483647;
            if (value <= 0) value += 2147483646;
            return value;
        }

        function createLevelSeed(level) {
            return normalizeSeed(Date.now() + level * 2654435761 + Math.floor(Math.random() * 1000000));
        }

        function deriveSeed(seed, salt) {
            return normalizeSeed(seed + salt * 1000003 + (seed % 9973) * (salt + 17));
        }

        function seededRandom(seed) {
            let value = seed % 2147483647;
            if (value <= 0) value += 2147483646;
            return () => {
                value = value * 16807 % 2147483647;
                return (value - 1) / 2147483646;
            };
        }

        function pickFrom(list, random) {
            return list[Math.floor(random() * list.length)];
        }

        /* 单块画布背板的最大边长（px）。部分 iOS Safari 的画布面积上限约
           1677 万像素（4096²）：高关卡 size≥2200 且 dpr≥2 时主画布+背景缓存
           双份背板可能分配失败导致白屏，需按尺寸反向钳制 dpr */
        const MAX_CANVAS_EDGE = 4096;
        function canvasDpr(size) {
            const raw = Math.max(1, Math.min(window.devicePixelRatio || 1, 2.5));
            if (!size || size <= 0) return raw;
            return Math.max(1, Math.min(raw, MAX_CANVAS_EDGE / size));
        }

        function configureCanvasForDpr(targetCanvas, targetCtx, size, dpr = canvasDpr(size)) {
            targetCanvas.width = Math.round(size * dpr);
            targetCanvas.height = Math.round(size * dpr);
            if (targetCanvas.style) {
                targetCanvas.style.width = `${size}px`;
                targetCanvas.style.height = `${size}px`;
            }
            if (targetCtx.setTransform) {
                targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            } else {
                targetCtx.scale(dpr, dpr);
            }
            return dpr;
        }

        /*
         * 描绘猫咪的躯干剪影（单个闭合路径，供贴纸层填充+描边）。
         * 儿童简笔画比例：躯干浑圆饱满，具体形状按姿势区分；
         * 头、耳、尾在 drawCat 中按"贴纸层叠"补齐（后画的填充
         * 会盖住先画部位的交线，避免旧版多形状叠加暴露内部线条）。
         */
        function traceCatOutline(pose, s) {
            ctx.beginPath();
            if (pose === 0) {
                /* 正面坐姿：梨形圆身 */
                ctx.ellipse(0, 0.16 * s, 0.30 * s, 0.28 * s, 0, 0, Math.PI * 2);
            } else if (pose === 1) {
                /* 面包蹲：横向圆 loaf */
                ctx.ellipse(-0.08 * s, 0.18 * s, 0.40 * s, 0.24 * s, 0, 0, Math.PI * 2);
            } else if (pose === 2) {
                /* 蜷睡：大圆球 */
                ctx.arc(-0.05 * s, 0.10 * s, 0.40 * s, 0, Math.PI * 2);
            } else if (pose === 3) {
                /* 站立：横向胶囊身 */
                ctx.ellipse(-0.05 * s, 0.05 * s, 0.34 * s, 0.20 * s, 0, 0, Math.PI * 2);
            } else if (pose === 4) {
                /* 伸懒腰：前低后高的斜长身 */
                ctx.ellipse(0.10 * s, 0.00 * s, 0.42 * s, 0.17 * s, -0.42, 0, Math.PI * 2);
            } else if (pose === 5) {
                /* 拱背：半圆拱形背 */
                ctx.arc(-0.02 * s, 0.26 * s, 0.40 * s, Math.PI, Math.PI * 2);
                ctx.closePath();
            } else if (pose === 6) {
                /* 趴平：贴地的扁宽身 */
                ctx.ellipse(-0.02 * s, 0.20 * s, 0.40 * s, 0.15 * s, 0, 0, Math.PI * 2);
            } else {
                /* 回望：朝左的横向圆身 */
                ctx.ellipse(0.08 * s, 0.16 * s, 0.36 * s, 0.22 * s, 0, 0, Math.PI * 2);
            }
        }

        /* 闭眼弧（"∪"形安睡眼） */
        function drawSleepyEye(x, y, s, r = 0.05) {
            ctx.beginPath();
            ctx.arc(x * s, y * s, r * s, Math.PI * 0.15, Math.PI * 0.85);
            ctx.stroke();
        }

        /* 贴纸层：一次 beginPath 内画完形状后填充+描边 */
        function sticker(shape) {
            ctx.beginPath();
            shape();
            ctx.fill();
            ctx.stroke();
        }

        /* 圆角三角耳：耳基埋进头部（被头贴纸层盖住），耳尖伸出到头缘上方 */
        function drawCatEar(hx, hy, hr, s, dir) {
            const bx2 = hx + dir * hr * 0.25;      /* 耳基内侧（头圆内） */
            const bx = hx + dir * hr * 0.72;       /* 耳基外侧（头圆内） */
            const tipx = hx + dir * hr * 1.05;     /* 耳尖略向外撇 */
            const tipy = hy - hr - 0.16;           /* 高出头顶 */
            sticker(() => {
                ctx.moveTo(bx2 * s, (hy - hr * 0.72) * s);
                ctx.quadraticCurveTo(bx * s, (hy - hr * 0.95) * s, tipx * s, tipy * s);
                ctx.quadraticCurveTo((bx + dir * 0.03) * s, (hy - hr * 0.55) * s, bx * s, (hy - hr * 0.42) * s);
                ctx.closePath();
            });
        }

        function drawCat(cx, cy, size, rotation, variant, found) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rotation);

            const s = size;
            const pose = variant % CAT_POSE_COUNT;
            /* 回望姿势头朝左，脸部细节需要镜像 */
            const facing = pose === 7 ? -1 : 1;
            /* 未找到：淡奶油暖底若隐若现；找到：亮橙点亮庆祝 */
            const fillColor = found ? "rgba(255, 152, 56, 0.55)" : "rgba(255, 216, 168, 0.14)";
            const lineColor = found ? "#d97706" : CAT_LINE;
            const detailColor = found ? "#b45309" : "#7a4a28";

            ctx.fillStyle = fillColor;
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = Math.max(2.2, s * 0.06);
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            /* 各姿势的头部圆心/半径与身体形状（单位坐标 ×s） */
            let hx = 0, hy = -0.28, hr = 0.30; /* 正面坐姿默认 */
            if (pose === 1) { hx = 0.30; hy = -0.20; hr = 0.24; }
            else if (pose === 2) { hx = 0.26; hy = -0.24; hr = 0.22; }
            else if (pose === 3) { hx = 0.34; hy = -0.24; hr = 0.24; }
            else if (pose === 4) { hx = -0.46; hy = 0.12; hr = 0.21; }
            else if (pose === 5) { hx = 0.34; hy = 0.02; hr = 0.23; }
            else if (pose === 6) { hx = 0.30; hy = -0.04; hr = 0.23; }
            else if (pose === 7) { hx = -0.28; hy = -0.18; hr = 0.24; }

            /* 1) 尾巴（最底层，粗笔触曲线） */
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = Math.max(2.4, s * 0.075);
            ctx.beginPath();
            if (pose === 0) {
                /* 从身左后绕到身前的粗尾巴 */
                ctx.moveTo(-0.26 * s, 0.34 * s);
                ctx.bezierCurveTo(-0.52 * s, 0.42 * s, -0.50 * s, 0.10 * s, -0.24 * s, 0.10 * s);
            } else if (pose === 1) {
                /* 沿身前收拢 */
                ctx.moveTo(-0.42 * s, 0.28 * s);
                ctx.bezierCurveTo(-0.56 * s, 0.34 * s, -0.46 * s, 0.44 * s, -0.26 * s, 0.40 * s);
                ctx.bezierCurveTo(-0.12 * s, 0.37 * s, -0.02 * s, 0.34 * s, 0.06 * s, 0.30 * s);
            } else if (pose === 2) {
                /* 环抱身前，尾尖收到脸颊旁 */
                ctx.moveTo(-0.40 * s, 0.16 * s);
                ctx.bezierCurveTo(-0.34 * s, 0.40 * s, -0.06 * s, 0.50 * s, 0.18 * s, 0.36 * s);
                ctx.bezierCurveTo(0.30 * s, 0.28 * s, 0.36 * s, 0.16 * s, 0.36 * s, 0.04 * s);
            } else {
                /* S 形上翘 */
                ctx.moveTo(-0.34 * s, -0.02 * s);
                ctx.bezierCurveTo(-0.52 * s, -0.10 * s, -0.54 * s, -0.34 * s, -0.40 * s, -0.44 * s);
            }
            if (pose === 4) {
                /* 伸懒腰：从高抬的臀部向上翘 */
                ctx.moveTo(0.45 * s, -0.15 * s);
                ctx.bezierCurveTo(0.63 * s, -0.27 * s, 0.61 * s, -0.45 * s, 0.47 * s, -0.51 * s);
            } else if (pose === 5) {
                /* 拱背：尾根在左，尾尖上勾 */
                ctx.moveTo(-0.38 * s, 0.18 * s);
                ctx.bezierCurveTo(-0.56 * s, 0.26 * s, -0.58 * s, -0.02 * s, -0.44 * s, -0.12 * s);
            } else if (pose === 6) {
                /* 趴平：贴地绕到身前 */
                ctx.moveTo(-0.36 * s, 0.28 * s);
                ctx.bezierCurveTo(-0.52 * s, 0.34 * s, -0.50 * s, 0.44 * s, -0.32 * s, 0.42 * s);
            } else if (pose === 7) {
                /* 回望：尾从右后方上扬 */
                ctx.moveTo(0.40 * s, 0.10 * s);
                ctx.bezierCurveTo(0.56 * s, 0.02 * s, 0.58 * s, -0.18 * s, 0.46 * s, -0.28 * s);
            }
            ctx.stroke();

            ctx.lineWidth = Math.max(2.2, s * 0.06);

            /* 2) 站立/伸懒腰/趴平姿势先补腿脚 */
            if (pose === 3) {
                ctx.beginPath();
                ctx.moveTo(-0.20 * s, 0.22 * s);
                ctx.lineTo(-0.20 * s, 0.44 * s);
                ctx.moveTo(0.12 * s, 0.22 * s);
                ctx.lineTo(0.12 * s, 0.44 * s);
                ctx.stroke();
            } else if (pose === 4) {
                /* 前爪向前下方伸展 */
                ctx.beginPath();
                ctx.moveTo(-0.26 * s, 0.18 * s);
                ctx.lineTo(-0.46 * s, 0.28 * s);
                ctx.moveTo(-0.18 * s, 0.24 * s);
                ctx.lineTo(-0.38 * s, 0.34 * s);
                ctx.stroke();
            } else if (pose === 6) {
                /* 趴平：下巴前的小前爪 */
                ctx.beginPath();
                ctx.moveTo(0.38 * s, 0.24 * s);
                ctx.lineTo(0.38 * s, 0.40 * s);
                ctx.moveTo(0.48 * s, 0.20 * s);
                ctx.lineTo(0.48 * s, 0.36 * s);
                ctx.stroke();
            }

            /* 3) 耳朵（会被头部覆盖耳根） */
            drawCatEar(hx, hy, hr, s, -1);
            drawCatEar(hx, hy, hr, s, 1);

            /* 4) 身体贴纸层 */
            sticker(() => traceCatOutline(pose, s));

            /* 5) 头部贴纸层（盖住耳根与身体交线） */
            sticker(() => {
                ctx.arc(hx * s, hy * s, hr * s, 0, Math.PI * 2);
            });

            /* 6) 脸部细节：闭眼 + 小鼻头 + 胡须（更轻的笔触） */
            const detailWidth = Math.max(1.5, s * 0.035);
            const whiskerSpread = 0.12;
            ctx.strokeStyle = detailColor;
            ctx.lineWidth = detailWidth;

            const eyeY = hy + 0.02;
            const noseY = hy + 0.10;
            drawSleepyEye(hx - facing * hr * 0.42, eyeY, s, 0.045);
            if (pose === 0) drawSleepyEye(hx + facing * hr * 0.42, eyeY, s, 0.045);
            /* 小三角鼻头 */
            ctx.beginPath();
            ctx.moveTo((hx - 0.022) * s, (noseY - 0.012) * s);
            ctx.lineTo((hx + 0.022) * s, (noseY - 0.012) * s);
            ctx.lineTo(hx * s, (noseY + 0.018) * s);
            ctx.closePath();
            ctx.fillStyle = detailColor;
            ctx.fill();
            ctx.fillStyle = fillColor;
            /* 胡须（朝向侧伸出） */
            const wx = hx + facing * hr * 0.86;
            ctx.beginPath();
            ctx.moveTo((wx - facing * 0.02) * s, (hy + 0.06) * s);
            ctx.quadraticCurveTo((wx + facing * 0.06) * s, (hy + 0.03) * s, (wx + facing * 0.13) * s, (hy + 0.02 - whiskerSpread * 0.4) * s);
            ctx.moveTo((wx - facing * 0.02) * s, (hy + 0.11) * s);
            ctx.quadraticCurveTo((wx + facing * 0.06) * s, (hy + 0.10) * s, (wx + facing * 0.13) * s, (hy + 0.09 + whiskerSpread * 0.4) * s);
            ctx.stroke();

            ctx.restore();
        }

        /* 干扰物：残缺的猫形线条（圆头带双耳起伏但没有完整身体），
           与真猫同一造型语言，颜色更淡、只有线条没有填充，保持可区分 */
        function drawCatDecoy(x, y, size, rotation = 0) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rotation);
            const s = size;
            const M = (px, py) => ctx.moveTo(px * s, py * s);
            const C = (x1, y1, x2, y2, px, py) => ctx.bezierCurveTo(x1 * s, y1 * s, x2 * s, y2 * s, px * s, py * s);
            const Q = (x1, y1, px, py) => ctx.quadraticCurveTo(x1 * s, y1 * s, px * s, py * s);
            sketchStyle(Math.max(1.4, s * 0.05), SKETCH_LIGHT);
            /* 圆头轮廓（开放弧，带双耳起伏） */
            ctx.beginPath();
            M(-0.26, -0.02);
            C(-0.30, -0.18, -0.26, -0.32, -0.18, -0.38);
            Q(-0.16, -0.50, -0.10, -0.52);
            Q(-0.04, -0.44, 0.02, -0.42);
            Q(0.06, -0.52, 0.13, -0.53);
            Q(0.19, -0.46, 0.20, -0.36);
            C(0.27, -0.28, 0.28, -0.16, 0.24, -0.04);
            ctx.stroke();
            /* 残缺的背部弧线 */
            ctx.beginPath();
            M(-0.30, 0.10);
            C(-0.08, 0.22, 0.18, 0.20, 0.38, 0.08);
            ctx.stroke();
            /* 尾巴样弧线 */
            ctx.beginPath();
            M(0.32, 0.12);
            Q(0.55, 0.02, 0.44, -0.22);
            ctx.stroke();
            ctx.restore();
        }

        function sketchStyle(width = 1.4, color = SKETCH_LINE) {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
        }

        function strokeEllipse(x, y, rx, ry, rot = 0) {
            ctx.beginPath();
            ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
            ctx.stroke();
        }

        function drawCloud(x, y, scale = 1, random = Math.random) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            sketchStyle(1.5, SKETCH_LIGHT);
            const lift = (random() - 0.5) * 18;
            ctx.beginPath();
            ctx.moveTo(-86, 10);
            ctx.bezierCurveTo(-64, -24 + lift, -32, -24, -18, -4);
            ctx.bezierCurveTo(2, -44, 50, -38 + lift, 60, -2);
            ctx.bezierCurveTo(94, -4, 112, 14, 94, 32);
            ctx.lineTo(-72, 32);
            ctx.bezierCurveTo(-108, 30, -112, 14, -86, 10);
            ctx.stroke();
            ctx.restore();
        }

        function drawBird(x, y, scale = 1, rotation = 0) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rotation);
            ctx.scale(scale, scale);
            sketchStyle(1.6, SKETCH_LINE);
            ctx.beginPath();
            ctx.moveTo(-52, 0);
            ctx.quadraticCurveTo(-22, -40, 0, -6);
            ctx.quadraticCurveTo(28, -42, 56, -2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(20, 6);
            ctx.lineTo(0, 12);
            ctx.stroke();
            ctx.restore();
        }

        function drawColosseum(x, y, w, h, lean = 0) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(lean);
            sketchStyle(2, SKETCH_LINE);
            ctx.beginPath();
            ctx.moveTo(0, h * 0.16);
            ctx.quadraticCurveTo(w * 0.46, -h * 0.05, w, h * 0.12);
            ctx.lineTo(w * 0.92, h);
            ctx.lineTo(w * 0.05, h);
            ctx.closePath();
            ctx.stroke();

            for (let row = 0; row < 5; row++) {
                const yy = h * (0.2 + row * 0.16);
                ctx.beginPath();
                ctx.moveTo(w * 0.03, yy);
                ctx.quadraticCurveTo(w * 0.48, yy - h * 0.05, w * 0.96, yy);
                ctx.stroke();
            }

            for (let row = 0; row < 4; row++) {
                const yy = h * (0.27 + row * 0.16);
                for (let i = 0; i < 9; i++) {
                    const ax = w * (0.1 + i * 0.09);
                    const aw = w * 0.055;
                    const ah = h * 0.09;
                    ctx.beginPath();
                    ctx.moveTo(ax, yy + ah);
                    ctx.lineTo(ax, yy + ah * 0.38);
                    ctx.quadraticCurveTo(ax + aw * 0.5, yy - ah * 0.25, ax + aw, yy + ah * 0.38);
                    ctx.lineTo(ax + aw, yy + ah);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

        function drawLeaningTower(x, y, w, h, lean = -0.08) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(lean);
            sketchStyle(2, SKETCH_LINE);
            ctx.strokeRect(0, 0, w, h);
            for (let row = 0; row < 7; row++) {
                const yy = h * (0.08 + row * 0.125);
                ctx.beginPath();
                ctx.moveTo(-w * 0.08, yy);
                ctx.lineTo(w * 1.08, yy);
                ctx.stroke();
                for (let i = 0; i < 5; i++) {
                    const ax = w * (0.12 + i * 0.17);
                    ctx.beginPath();
                    ctx.moveTo(ax, yy + h * 0.08);
                    ctx.lineTo(ax, yy + h * 0.03);
                    ctx.quadraticCurveTo(ax + w * 0.055, yy - h * 0.02, ax + w * 0.11, yy + h * 0.03);
                    ctx.lineTo(ax + w * 0.11, yy + h * 0.08);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }

        function drawStreetBlocks(size, random) {
            sketchStyle(1.5, SKETCH_LINE);
            const baseY = size * (0.44 + random() * 0.05);
            const count = 6 + Math.floor(random() * 3);
            for (let i = 0; i < count; i++) {
                const x = size * (0.39 + i * (0.046 + random() * 0.015));
                const y = baseY - (i % 3) * size * (0.025 + random() * 0.018);
                const w = size * (0.055 + random() * 0.03);
                const h = size * (0.15 + random() * 0.08);
                ctx.strokeRect(x, y, w, h);
                ctx.beginPath();
                ctx.moveTo(x - w * 0.08, y);
                ctx.lineTo(x + w * 0.5, y - h * 0.18);
                ctx.lineTo(x + w * 1.08, y);
                ctx.stroke();
                for (let yy = y + h * 0.18; yy < y + h * 0.86; yy += h * 0.22) {
                    for (let xx = x + w * 0.18; xx < x + w * 0.78; xx += w * 0.32) {
                        ctx.strokeRect(xx, yy, w * 0.16, h * 0.12);
                    }
                }
            }
        }

        function drawAirship(size, random) {
            const x = size * (0.48 + random() * 0.16);
            const y = size * (0.04 + random() * 0.06);
            const w = size * (0.22 + random() * 0.1);
            const h = size * (0.075 + random() * 0.035);
            ctx.save();
            sketchStyle(1.7, SKETCH_LINE);
            strokeEllipse(x + w * 0.5, y + h * 0.5, w * 0.5, h * 0.5);
            for (let i = 1; i < 6; i++) {
                ctx.beginPath();
                ctx.moveTo(x + w * (i / 6), y + h * 0.06);
                ctx.quadraticCurveTo(x + w * 0.52, y + h * 0.5, x + w * (i / 6), y + h * 0.94);
                ctx.stroke();
            }
            ctx.strokeRect(x + w * 0.26, y + h * 0.78, w * 0.32, h * 0.28);
            ctx.beginPath();
            ctx.moveTo(x + w * 0.98, y + h * 0.5);
            ctx.lineTo(x + w * 1.1, y + h * 0.38);
            ctx.lineTo(x + w * 1.08, y + h * 0.62);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        }

        function drawArtistAndTable(size, random) {
            ctx.save();
            sketchStyle(1.8, SKETCH_LINE);
            const cx = size * (0.79 + random() * 0.08);
            const cy = size * (0.18 + random() * 0.05);
            strokeEllipse(cx, cy, size * 0.04, size * 0.055);
            ctx.beginPath();
            ctx.moveTo(cx - size * 0.045, cy - size * 0.05);
            ctx.quadraticCurveTo(cx, cy - size * 0.12, cx + size * 0.055, cy - size * 0.05);
            ctx.stroke();
            for (let i = 0; i < 9; i++) {
                ctx.beginPath();
                ctx.moveTo(cx - size * 0.055 + i * size * 0.014, cy + size * 0.05);
                ctx.quadraticCurveTo(cx - size * 0.03 + i * size * 0.01, cy + size * 0.13, cx - size * 0.015 + i * size * 0.01, cy + size * 0.19);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(cx - size * 0.07, cy + size * 0.08);
            ctx.lineTo(cx - size * 0.12, cy + size * 0.32);
            ctx.moveTo(cx + size * 0.07, cy + size * 0.08);
            ctx.lineTo(cx + size * 0.12, cy + size * 0.32);
            ctx.stroke();

            const tx = size * (0.61 + random() * 0.04);
            const ty = size * (0.56 + random() * 0.05);
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(size * 0.98, ty + size * 0.04);
            ctx.lineTo(size * 0.93, size * 0.93);
            ctx.lineTo(tx - size * 0.03, size * 0.82);
            ctx.closePath();
            ctx.stroke();
            for (let i = 0; i < 8; i++) {
                strokeEllipse(tx + size * (0.06 + i * 0.035), ty + size * (0.09 + (i % 3) * 0.075), size * 0.035, size * 0.02, i * 0.35);
            }
            ctx.restore();
        }

        function drawHillsAndRoads(size, random) {
            sketchStyle(1.4, SKETCH_LIGHT);
            for (let i = 0; i < 6; i++) {
                const y = size * (0.56 + i * (0.038 + random() * 0.012));
                ctx.beginPath();
                ctx.moveTo(size * 0.28, y);
                for (let x = size * 0.34; x < size * 0.68; x += size * 0.08) {
                    ctx.quadraticCurveTo(x, y - size * 0.04, x + size * 0.07, y);
                }
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(size * 0.45, size * 0.95);
            ctx.bezierCurveTo(size * 0.5, size * 0.78, size * 0.58, size * 0.75, size * 0.63, size * 0.58);
            ctx.stroke();
        }

        function drawHarborScene(size, random) {
            drawCloud(size * (0.16 + random() * 0.08), size * (0.08 + random() * 0.06), size / 1250, random);
            drawCloud(size * (0.66 + random() * 0.14), size * (0.11 + random() * 0.05), size / 1180, random);
            drawBird(size * 0.78, size * 0.18, size / 1450, -0.08);

            sketchStyle(1.5, SKETCH_LIGHT);
            for (let i = 0; i < 6; i++) {
                const y = size * (0.42 + i * 0.055);
                ctx.beginPath();
                ctx.moveTo(size * 0.04, y);
                for (let x = size * 0.12; x < size * 0.96; x += size * 0.11) {
                    ctx.quadraticCurveTo(x, y - size * (0.018 + random() * 0.014), x + size * 0.08, y);
                }
                ctx.stroke();
            }

            sketchStyle(1.9, SKETCH_LINE);
            const hulls = [
                { x: 0.08, y: 0.5, w: 0.34, h: 0.14, mast: 0.3 },
                { x: 0.52, y: 0.47, w: 0.38, h: 0.16, mast: 0.34 },
            ];
            hulls.forEach((boat) => {
                const x = size * (boat.x + random() * 0.025);
                const y = size * (boat.y + random() * 0.03);
                const w = size * boat.w;
                const h = size * boat.h;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + w, y);
                ctx.quadraticCurveTo(x + w * 0.78, y + h, x + w * 0.18, y + h * 0.92);
                ctx.closePath();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x + w * 0.44, y);
                ctx.lineTo(x + w * 0.44, y - size * boat.mast);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x + w * 0.45, y - size * boat.mast * 0.94);
                ctx.lineTo(x + w * 0.45, y - size * boat.mast * 0.16);
                ctx.lineTo(x + w * 0.78, y - size * boat.mast * 0.18);
                ctx.closePath();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x + w * 0.41, y - size * boat.mast * 0.82);
                ctx.lineTo(x + w * 0.12, y - size * boat.mast * 0.12);
                ctx.lineTo(x + w * 0.41, y - size * boat.mast * 0.08);
                ctx.closePath();
                ctx.stroke();
                for (let i = 0; i < 5; i++) {
                    strokeEllipse(x + w * (0.18 + i * 0.13), y + h * 0.32, size * 0.018, size * 0.012);
                }
            });

            sketchStyle(1.6, SKETCH_LINE);
            for (let i = 0; i < 10; i++) {
                const x = size * (0.05 + i * 0.1 + random() * 0.012);
                ctx.beginPath();
                ctx.moveTo(x, size * 0.62);
                ctx.lineTo(x - size * 0.025, size * 0.9);
                ctx.moveTo(x + size * 0.035, size * 0.62);
                ctx.lineTo(x + size * 0.012, size * 0.9);
                ctx.stroke();
                ctx.strokeRect(x - size * 0.03, size * 0.62, size * 0.09, size * 0.024);
            }

            for (let i = 0; i < 8; i++) {
                const cx = size * (0.12 + random() * 0.78);
                const cy = size * (0.72 + random() * 0.18);
                strokeEllipse(cx, cy, size * (0.03 + random() * 0.02), size * 0.018, random() * 0.6);
                ctx.beginPath();
                ctx.moveTo(cx - size * 0.04, cy);
                ctx.lineTo(cx + size * 0.04, cy);
                ctx.stroke();
            }
        }

        function drawLibraryScene(size, random) {
            sketchStyle(1.9, SKETCH_LINE);
            const shelfCount = 4;
            for (let row = 0; row < shelfCount; row++) {
                const y = size * (0.16 + row * 0.18);
                ctx.strokeRect(size * 0.06, y, size * 0.88, size * 0.12);
                ctx.beginPath();
                ctx.moveTo(size * 0.06, y + size * 0.12);
                ctx.lineTo(size * 0.94, y + size * 0.12);
                ctx.stroke();
                let x = size * 0.08;
                while (x < size * 0.91) {
                    const w = size * (0.018 + random() * 0.018);
                    const h = size * (0.07 + random() * 0.04);
                    ctx.strokeRect(x, y + size * 0.11 - h, w, h);
                    if (random() < 0.28) {
                        ctx.beginPath();
                        ctx.moveTo(x + w * 0.5, y + size * 0.11 - h);
                        ctx.lineTo(x + w * 0.5, y + size * 0.11);
                        ctx.stroke();
                    }
                    x += w + size * (0.006 + random() * 0.01);
                }
            }

            sketchStyle(1.7, SKETCH_LINE);
            const deskY = size * 0.78;
            ctx.strokeRect(size * 0.17, deskY, size * 0.66, size * 0.055);
            ctx.beginPath();
            ctx.moveTo(size * 0.22, deskY + size * 0.055);
            ctx.lineTo(size * 0.18, size * 0.94);
            ctx.moveTo(size * 0.78, deskY + size * 0.055);
            ctx.lineTo(size * 0.83, size * 0.94);
            ctx.stroke();
            for (let i = 0; i < 11; i++) {
                const x = size * (0.22 + i * 0.052);
                const y = deskY - size * (0.018 + random() * 0.05);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate((random() - 0.5) * 0.35);
                ctx.strokeRect(-size * 0.025, -size * 0.018, size * 0.05, size * 0.036);
                ctx.restore();
            }

            sketchStyle(1.3, SKETCH_LIGHT);
            for (let i = 0; i < 16; i++) {
                const x = size * (0.1 + random() * 0.8);
                const y = size * (0.1 + random() * 0.82);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.quadraticCurveTo(x + size * 0.025, y - size * 0.012, x + size * 0.055, y + size * 0.006);
                ctx.stroke();
            }
        }

        function drawGardenScene(size, random) {
            drawCloud(size * 0.18, size * 0.08, size / 1350, random);
            drawCloud(size * 0.72, size * 0.12, size / 1280, random);

            sketchStyle(1.5, SKETCH_LIGHT);
            for (let i = 0; i < 5; i++) {
                const y = size * (0.56 + i * 0.055);
                ctx.beginPath();
                ctx.moveTo(size * 0.05, y);
                for (let x = size * 0.12; x < size * 0.96; x += size * 0.12) {
                    ctx.quadraticCurveTo(x, y - size * (0.025 + random() * 0.015), x + size * 0.08, y);
                }
                ctx.stroke();
            }

            sketchStyle(1.8, SKETCH_LINE);
            for (let i = 0; i < 7; i++) {
                const x = size * (0.08 + i * 0.135 + random() * 0.018);
                const y = size * (0.32 + random() * 0.08);
                const h = size * (0.28 + random() * 0.1);
                ctx.beginPath();
                ctx.moveTo(x, y + h);
                ctx.lineTo(x, y + h * 0.24);
                ctx.stroke();
                for (let b = 0; b < 4; b++) {
                    const side = b % 2 === 0 ? -1 : 1;
                    ctx.beginPath();
                    ctx.moveTo(x, y + h * (0.32 + b * 0.13));
                    ctx.quadraticCurveTo(x + side * size * 0.055, y + h * (0.2 + b * 0.12), x + side * size * 0.11, y + h * (0.28 + b * 0.12));
                    ctx.stroke();
                }
                strokeEllipse(x, y + h * 0.18, size * 0.055, size * 0.035, random() * 0.5);
            }

            for (let row = 0; row < 3; row++) {
                for (let i = 0; i < 8; i++) {
                    const x = size * (0.08 + i * 0.115 + random() * 0.03);
                    const y = size * (0.72 + row * 0.07 + random() * 0.025);
                    ctx.beginPath();
                    ctx.moveTo(x, y + size * 0.035);
                    ctx.lineTo(x, y - size * 0.025);
                    ctx.stroke();
                    for (let p = 0; p < 5; p++) {
                        const a = p / 5 * Math.PI * 2;
                        ctx.beginPath();
                        ctx.arc(x + Math.cos(a) * size * 0.022, y - size * 0.04 + Math.sin(a) * size * 0.018, size * 0.012, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }

            sketchStyle(1.6, SKETCH_LINE);
            ctx.beginPath();
            ctx.moveTo(size * 0.08, size * 0.84);
            ctx.quadraticCurveTo(size * 0.5, size * 0.96, size * 0.92, size * 0.84);
            ctx.stroke();
            const bhx = size * (0.72 + (random() - 0.5) * 0.04);
            const bhy = size * (0.34 + (random() - 0.5) * 0.03);
            ctx.strokeRect(bhx, bhy, size * 0.12, size * 0.1);
            ctx.beginPath();
            ctx.moveTo(bhx - size * 0.01, bhy);
            ctx.lineTo(bhx + size * 0.06, bhy - size * 0.07);
            ctx.lineTo(bhx + size * 0.13, bhy);
            ctx.stroke();
        }

        function drawKitchenScene(size, random) {
            sketchStyle(1.8, SKETCH_LINE);
            ctx.strokeRect(size * 0.06, size * 0.18, size * 0.88, size * 0.18);
            ctx.strokeRect(size * 0.08, size * 0.38, size * 0.84, size * 0.24);
            for (let i = 0; i < 8; i++) {
                const x = size * (0.1 + i * 0.1);
                ctx.beginPath();
                ctx.moveTo(x, size * 0.18);
                ctx.lineTo(x, size * 0.36);
                ctx.moveTo(x, size * 0.38);
                ctx.lineTo(x, size * 0.62);
                ctx.stroke();
                ctx.strokeRect(x + size * 0.025, size * 0.45, size * 0.026, size * 0.012);
            }

            sketchStyle(1.5, SKETCH_LINE);
            for (let i = 0; i < 7; i++) {
                const x = size * (0.14 + i * 0.11);
                const y = size * (0.22 + random() * 0.06);
                ctx.beginPath();
                ctx.moveTo(x, size * 0.18);
                ctx.lineTo(x, y);
                ctx.stroke();
                if (i % 2 === 0) {
                    strokeEllipse(x, y + size * 0.035, size * 0.025, size * 0.045);
                } else {
                    ctx.strokeRect(x - size * 0.018, y, size * 0.036, size * 0.075);
                }
            }

            const tableY = size * 0.74;
            sketchStyle(1.9, SKETCH_LINE);
            ctx.strokeRect(size * 0.16, tableY, size * 0.68, size * 0.06);
            ctx.beginPath();
            ctx.moveTo(size * 0.21, tableY + size * 0.06);
            ctx.lineTo(size * 0.17, size * 0.95);
            ctx.moveTo(size * 0.79, tableY + size * 0.06);
            ctx.lineTo(size * 0.83, size * 0.95);
            ctx.stroke();
            for (let i = 0; i < 10; i++) {
                const x = size * (0.22 + random() * 0.56);
                const y = tableY - size * (0.02 + random() * 0.08);
                strokeEllipse(x, y, size * (0.025 + random() * 0.02), size * 0.016, random() * 0.6);
            }

            sketchStyle(1.3, SKETCH_LIGHT);
            drawKitchenTileBand(size, 0.07, 0.045, 10, 2);
            drawKitchenTileBand(size, 0.07, 0.64, 10, 2);
        }

        function drawKitchenTileBand(size, xRatio, yRatio, cols, rows) {
            const tileW = size * 0.07;
            const tileH = size * 0.045;
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    ctx.strokeRect(size * (xRatio + col * 0.085), size * (yRatio + row * 0.055), tileW, tileH);
                }
            }
        }

        function drawMuseumScene(size, random) {
            sketchStyle(2, SKETCH_LINE);
            ctx.beginPath();
            ctx.moveTo(size * 0.08, size * 0.22);
            ctx.lineTo(size * 0.5, size * 0.08);
            ctx.lineTo(size * 0.92, size * 0.22);
            ctx.closePath();
            ctx.stroke();
            ctx.strokeRect(size * 0.12, size * 0.22, size * 0.76, size * 0.52);
            for (let i = 0; i < 6; i++) {
                const x = size * (0.18 + i * 0.125);
                ctx.beginPath();
                ctx.moveTo(x, size * 0.26);
                ctx.lineTo(x, size * 0.72);
                ctx.moveTo(x - size * 0.035, size * 0.26);
                ctx.lineTo(x + size * 0.035, size * 0.26);
                ctx.moveTo(x - size * 0.04, size * 0.72);
                ctx.lineTo(x + size * 0.04, size * 0.72);
                ctx.stroke();
            }

            const frames = [
                { x: 0.16, y: 0.33, w: 0.16, h: 0.14 },
                { x: 0.42, y: 0.31, w: 0.18, h: 0.16 },
                { x: 0.68, y: 0.34, w: 0.15, h: 0.13 },
            ];
            frames.forEach((frame, index) => {
                const x = size * frame.x;
                const y = size * frame.y;
                const w = size * frame.w;
                const h = size * frame.h;
                ctx.strokeRect(x, y, w, h);
                ctx.strokeRect(x + size * 0.012, y + size * 0.012, w - size * 0.024, h - size * 0.024);
                ctx.beginPath();
                if (index === 0) {
                    ctx.moveTo(x + w * 0.18, y + h * 0.75);
                    ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.25, x + w * 0.82, y + h * 0.72);
                } else if (index === 1) {
                    ctx.arc(x + w * 0.5, y + h * 0.5, Math.min(w, h) * 0.28, 0, Math.PI * 2);
                } else {
                    ctx.moveTo(x + w * 0.18, y + h * 0.2);
                    ctx.lineTo(x + w * 0.82, y + h * 0.8);
                    ctx.moveTo(x + w * 0.82, y + h * 0.2);
                    ctx.lineTo(x + w * 0.18, y + h * 0.8);
                }
                ctx.stroke();
            });

            sketchStyle(1.6, SKETCH_LINE);
            for (let i = 0; i < 4; i++) {
                const x = size * (0.2 + i * 0.18);
                ctx.strokeRect(x, size * 0.78, size * 0.11, size * 0.08);
                strokeEllipse(x + size * 0.055, size * 0.74, size * 0.035, size * 0.05);
            }

            sketchStyle(1.2, SKETCH_LIGHT);
            for (let i = 0; i < 8; i++) {
                ctx.beginPath();
                ctx.moveTo(size * (0.08 + i * 0.12), size * 0.9);
                ctx.lineTo(size * (0.18 + i * 0.12), size * 0.78);
                ctx.stroke();
            }
        }

        function drawDenseLinework(size, random) {
            const difficulty = state.difficulty || levelDifficulty(state.level || 1);
            const textureBoost = difficulty.textureBoost || 1;
            sketchStyle(1, "rgba(117,123,132,0.72)");
            const windowCount = Math.floor((75 + Math.floor(random() * 45)) * textureBoost);
            for (let i = 0; i < windowCount; i++) {
                const x = size * (0.03 + random() * 0.92);
                const y = size * (0.18 + random() * 0.68);
                const w = size * (0.012 + random() * 0.018);
                const h = size * (0.018 + random() * 0.026);
                if (random() < 0.55) {
                    ctx.strokeRect(x, y, w, h);
                    ctx.beginPath();
                    ctx.moveTo(x + w * 0.5, y);
                    ctx.lineTo(x + w * 0.5, y + h);
                    ctx.moveTo(x, y + h * 0.5);
                    ctx.lineTo(x + w, y + h * 0.5);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(x, y + h);
                    ctx.lineTo(x, y + h * 0.35);
                    ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.15, x + w, y + h * 0.35);
                    ctx.lineTo(x + w, y + h);
                    ctx.stroke();
                }
            }

            const textureCount = Math.floor((95 + Math.floor(random() * 60)) * textureBoost);
            for (let i = 0; i < textureCount; i++) {
                const x = size * random();
                const y = size * random();
                const len = size * (0.015 + random() * 0.035);
                const angle = random() * Math.PI;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.quadraticCurveTo(
                    x + Math.cos(angle + 0.8) * len * 0.45,
                    y + Math.sin(angle + 0.8) * len * 0.45,
                    x + Math.cos(angle) * len,
                    y + Math.sin(angle) * len
                );
                ctx.stroke();
            }

            const decoyCount = difficulty.decoyBase + Math.floor(random() * 12);
            const decoyRegions = SCENE_DECOY_REGIONS[state.sceneTemplate] || SCENE_DECOY_REGIONS.travel;
            for (let i = 0; i < decoyCount; i++) {
                const region = pickFrom(decoyRegions, random);
                drawCatDecoy(
                    size * (region.xMin + random() * (region.xMax - region.xMin)),
                    size * (region.yMin + random() * (region.yMax - region.yMin)),
                    size * (0.018 + random() * 0.014),
                    random() * 1.2 - 0.6
                );
            }
        }

        function drawGardenTexture(size, random, boost) {
            sketchStyle(1, "rgba(117,123,132,0.62)");
            const count = Math.floor(40 * boost);
            for (let i = 0; i < count; i++) {
                const x = size * (0.06 + random() * 0.88);
                const y = size * (0.56 + random() * 0.36);
                ctx.beginPath();
                ctx.moveTo(x, y + size * 0.018);
                ctx.quadraticCurveTo(x + size * 0.018, y - size * 0.02, x + size * 0.04, y + size * 0.012);
                ctx.moveTo(x, y + size * 0.018);
                ctx.quadraticCurveTo(x - size * 0.018, y - size * 0.015, x - size * 0.034, y + size * 0.008);
                ctx.stroke();
            }
        }

        function drawKitchenTexture(size, random, boost) {
            sketchStyle(1, "rgba(117,123,132,0.64)");
            const count = Math.floor(26 * boost);
            for (let i = 0; i < count; i++) {
                const x = size * (0.08 + random() * 0.84);
                const y = size * (0.18 + random() * 0.66);
                if (random() < 0.5) {
                    strokeEllipse(x, y, size * (0.018 + random() * 0.016), size * 0.01, random() * 0.4);
                } else {
                    ctx.strokeRect(x, y, size * (0.018 + random() * 0.02), size * (0.024 + random() * 0.02));
                }
            }
        }

        function drawMuseumTexture(size, random, boost) {
            sketchStyle(1, "rgba(117,123,132,0.58)");
            const count = Math.floor(22 * boost);
            for (let i = 0; i < count; i++) {
                const x = size * (0.1 + random() * 0.78);
                const y = size * (0.22 + random() * 0.64);
                const w = size * (0.035 + random() * 0.035);
                const h = size * (0.028 + random() * 0.03);
                ctx.strokeRect(x, y, w, h);
                ctx.beginPath();
                ctx.moveTo(x + w * 0.15, y + h * 0.72);
                ctx.lineTo(x + w * 0.45, y + h * 0.36);
                ctx.lineTo(x + w * 0.82, y + h * 0.68);
                ctx.stroke();
            }
        }

        const SCENE_TEXTURES = {
            garden: drawGardenTexture,
            kitchen: drawKitchenTexture,
            museum: drawMuseumTexture,
        };

        function drawSceneTexture(size, random) {
            const difficulty = state.difficulty || levelDifficulty(state.level || 1);
            const textureFn = SCENE_TEXTURES[state.sceneTemplate];
            if (textureFn) {
                textureFn(size, random, difficulty.textureBoost || 1);
            }
        }

        /* 绘制干扰物 */
        function drawObstacle(o) {
            ctx.save();
            ctx.translate(o.x, o.y);
            ctx.rotate(o.rotation);
            ctx.scale(o.scale, o.scale);
            ctx.strokeStyle = SKETCH_LINE;
            ctx.lineWidth = 1.4;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            const s = o.size;

            switch (o.type) {
                case "tree":
                    ctx.beginPath();
                    ctx.moveTo(0, s * 0.4);
                    ctx.lineTo(0, -s * 0.1);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(-s * 0.3, s * 0.1);
                    ctx.lineTo(0, -s * 0.35);
                    ctx.lineTo(s * 0.3, s * 0.1);
                    ctx.closePath();
                    ctx.stroke();
                    break;
                case "house":
                    ctx.strokeRect(-s * 0.3, -s * 0.1, s * 0.6, s * 0.5);
                    ctx.beginPath();
                    ctx.moveTo(-s * 0.35, -s * 0.1);
                    ctx.lineTo(0, -s * 0.4);
                    ctx.lineTo(s * 0.35, -s * 0.1);
                    ctx.closePath();
                    ctx.stroke();
                    break;
                case "flower":
                    ctx.beginPath();
                    ctx.moveTo(0, s * 0.35);
                    ctx.lineTo(0, -s * 0.05);
                    ctx.stroke();
                    for (let i = 0; i < 5; i++) {
                        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
                        ctx.beginPath();
                        ctx.arc(Math.cos(a) * s * 0.12, -s * 0.15 + Math.sin(a) * s * 0.12, s * 0.07, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    break;
                case "bottle":
                    ctx.beginPath();
                    ctx.moveTo(-s * 0.1, -s * 0.35);
                    ctx.lineTo(-s * 0.1, -s * 0.2);
                    ctx.lineTo(-s * 0.2, -s * 0.15);
                    ctx.lineTo(-s * 0.2, s * 0.3);
                    ctx.lineTo(s * 0.2, s * 0.3);
                    ctx.lineTo(s * 0.2, -s * 0.15);
                    ctx.lineTo(s * 0.1, -s * 0.2);
                    ctx.lineTo(s * 0.1, -s * 0.35);
                    ctx.stroke();
                    break;
                case "book":
                    ctx.strokeRect(-s * 0.25, -s * 0.2, s * 0.5, s * 0.4);
                    ctx.beginPath();
                    ctx.moveTo(-s * 0.05, -s * 0.2);
                    ctx.lineTo(-s * 0.05, s * 0.2);
                    ctx.stroke();
                    break;
                case "star":
                    ctx.beginPath();
                    for (let i = 0; i < 5; i++) {
                        const outerA = (i * 72 - 90) * Math.PI / 180;
                        const innerA = ((i * 72 + 36) - 90) * Math.PI / 180;
                        const ox = Math.cos(outerA) * s * 0.25;
                        const oy = Math.sin(outerA) * s * 0.25;
                        const ix = Math.cos(innerA) * s * 0.1;
                        const iy = Math.sin(innerA) * s * 0.1;
                        if (i === 0) ctx.moveTo(ox, oy);
                        else ctx.lineTo(ox, oy);
                        ctx.lineTo(ix, iy);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    break;
                case "cloud":
                    ctx.beginPath();
                    ctx.arc(-s * 0.15, 0, s * 0.15, 0, Math.PI * 2);
                    ctx.arc(s * 0.05, -s * 0.08, s * 0.18, 0, Math.PI * 2);
                    ctx.arc(s * 0.2, 0, s * 0.13, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                case "fish":
                    ctx.beginPath();
                    ctx.ellipse(0, 0, s * 0.25, s * 0.12, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(s * 0.2, 0);
                    ctx.lineTo(s * 0.38, -s * 0.1);
                    ctx.lineTo(s * 0.38, s * 0.1);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(-s * 0.1, -s * 0.02, s * 0.02, 0, Math.PI * 2);
                    ctx.fillStyle = SKETCH_LINE;
                    ctx.fill();
                    break;
                case "mushroom":
                    ctx.beginPath();
                    ctx.moveTo(-s * 0.05, s * 0.25);
                    ctx.lineTo(-s * 0.05, 0);
                    ctx.lineTo(s * 0.05, 0);
                    ctx.lineTo(s * 0.05, s * 0.25);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.ellipse(0, -s * 0.05, s * 0.2, s * 0.15, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    break;
                case "window":
                    ctx.strokeRect(-s * 0.22, -s * 0.3, s * 0.44, s * 0.6);
                    ctx.beginPath();
                    ctx.moveTo(0, -s * 0.3);
                    ctx.lineTo(0, s * 0.3);
                    ctx.moveTo(-s * 0.22, 0);
                    ctx.lineTo(s * 0.22, 0);
                    ctx.stroke();
                    break;
                case "plate":
                    strokeEllipse(0, 0, s * 0.34, s * 0.2, 0.08);
                    strokeEllipse(0, 0, s * 0.2, s * 0.1, 0.08);
                    break;
                case "leaf":
                    ctx.beginPath();
                    ctx.moveTo(-s * 0.28, s * 0.18);
                    ctx.quadraticCurveTo(0, -s * 0.36, s * 0.3, s * 0.16);
                    ctx.quadraticCurveTo(0, s * 0.28, -s * 0.28, s * 0.18);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(-s * 0.16, s * 0.16);
                    ctx.lineTo(s * 0.2, -s * 0.08);
                    ctx.stroke();
                    break;
            }
            ctx.restore();
        }

        function drawTravelScene(size, random) {
            const cloudCount = 4 + Math.floor(random() * 3);
            for (let i = 0; i < cloudCount; i++) {
                drawCloud(size * (0.08 + random() * 0.86), size * (0.04 + random() * 0.16), size / (1050 + random() * 360), random);
            }

            drawAirship(size, random);

            const birdCount = 2 + Math.floor(random() * 4);
            for (let i = 0; i < birdCount; i++) {
                drawBird(size * (0.04 + random() * 0.3), size * (0.06 + random() * 0.2), size / (1200 + random() * 500), random() - 0.5);
            }

            const colosseumX = size * (0.005 + random() * 0.035);
            drawColosseum(colosseumX, size * (0.29 + random() * 0.04), size * (0.25 + random() * 0.06), size * (0.42 + random() * 0.08), (random() - 0.5) * 0.06);
            drawLeaningTower(size * (0.27 + random() * 0.06), size * (0.18 + random() * 0.06), size * (0.12 + random() * 0.04), size * (0.54 + random() * 0.08), -0.12 + random() * 0.08);
            drawStreetBlocks(size, random);
            drawHillsAndRoads(size, random);
            drawArtistAndTable(size, random);
        }

        const SCENE_DRAWERS = {
            travel: drawTravelScene,
            harbor: drawHarborScene,
            library: drawLibraryScene,
            garden: drawGardenScene,
            kitchen: drawKitchenScene,
            museum: drawMuseumScene,
        };

        function drawSceneBackground(size, random) {
            ctx.fillStyle = "#fffbf0";
            ctx.fillRect(0, 0, size, size);
            const drawer = SCENE_DRAWERS[state.sceneTemplate] || SCENE_DRAWERS.travel;
            drawer(size, random);
            drawSceneTexture(size, random);
            drawDenseLinework(size, random);
        }

        /* 绘制参考图风格的大幅线稿场景 */
        function drawTravelSketchScene(size) {
            const random = seededRandom(state.sceneSeed);
            drawSceneBackground(size, random);
        }

        /* ===== 场景生成 ===== */
        const OBSTACLE_TYPES = ["tree", "house", "flower", "bottle", "book", "star", "cloud", "fish", "mushroom", "window", "plate", "leaf"];
        const SCENE_OBSTACLES = {
            travel: ["house", "tree", "cloud", "star", "window", "flower", "leaf", "book"],
            harbor: ["fish", "cloud", "bottle", "star", "window", "house", "plate"],
            library: ["book", "bottle", "star", "cloud", "window", "leaf", "plate"],
            garden: ["tree", "flower", "leaf", "mushroom", "cloud", "star"],
            kitchen: ["bottle", "plate", "book", "star", "leaf", "window"],
            museum: ["book", "plate", "window", "star", "leaf", "bottle"],
        };

        const SCENE_DECOY_REGIONS = {
            travel: [{ xMin: 0.04, xMax: 0.94, yMin: 0.18, yMax: 0.92 }],
            harbor: [
                { xMin: 0.08, xMax: 0.9, yMin: 0.18, yMax: 0.64 },
                { xMin: 0.05, xMax: 0.94, yMin: 0.62, yMax: 0.9 },
            ],
            library: [
                { xMin: 0.08, xMax: 0.92, yMin: 0.12, yMax: 0.72 },
                { xMin: 0.18, xMax: 0.82, yMin: 0.72, yMax: 0.9 },
            ],
            garden: [
                { xMin: 0.08, xMax: 0.92, yMin: 0.28, yMax: 0.58 },
                { xMin: 0.07, xMax: 0.92, yMin: 0.68, yMax: 0.94 },
            ],
            kitchen: [
                { xMin: 0.08, xMax: 0.92, yMin: 0.16, yMax: 0.62 },
                { xMin: 0.18, xMax: 0.84, yMin: 0.66, yMax: 0.88 },
            ],
            museum: [
                { xMin: 0.14, xMax: 0.86, yMin: 0.24, yMax: 0.72 },
                { xMin: 0.16, xMax: 0.86, yMin: 0.72, yMax: 0.9 },
            ],
        };

        function sceneObstacles() {
            return SCENE_OBSTACLES[state.sceneTemplate] || OBSTACLE_TYPES;
        }

        function sceneCatAnchors(size) {
            const random = seededRandom(state.sceneSeed + 31);
            const jitter = (value, spread) => value + (random() - 0.5) * spread;
            const anchorSets = {
                travel: [
                    { x: jitter(size * 0.08, size * 0.03), y: jitter(size * 0.58, size * 0.04), r: size * 0.017, variant: 0, rotation: -0.18 },
                    { x: jitter(size * 0.16, size * 0.05), y: jitter(size * 0.43, size * 0.05), r: size * 0.016, variant: 2, rotation: 0.12 },
                    { x: jitter(size * 0.23, size * 0.04), y: jitter(size * 0.67, size * 0.04), r: size * 0.018, variant: 1, rotation: 0.04 },
                    { x: jitter(size * 0.34, size * 0.04), y: jitter(size * 0.31, size * 0.04), r: size * 0.015, variant: 0, rotation: -0.08 },
                    { x: jitter(size * 0.37, size * 0.04), y: jitter(size * 0.62, size * 0.04), r: size * 0.017, variant: 3, rotation: 0.3 },
                    { x: jitter(size * 0.48, size * 0.05), y: jitter(size * 0.42, size * 0.04), r: size * 0.015, variant: 0, rotation: 0.05 },
                    { x: jitter(size * 0.55, size * 0.05), y: jitter(size * 0.51, size * 0.04), r: size * 0.017, variant: 1, rotation: -0.2 },
                    { x: jitter(size * 0.61, size * 0.05), y: jitter(size * 0.22, size * 0.04), r: size * 0.015, variant: 3, rotation: 0.18 },
                    { x: jitter(size * 0.72, size * 0.05), y: jitter(size * 0.56, size * 0.04), r: size * 0.016, variant: 0, rotation: -0.08 },
                    { x: jitter(size * 0.79, size * 0.05), y: jitter(size * 0.33, size * 0.04), r: size * 0.017, variant: 1, rotation: 0.2 },
                    { x: jitter(size * 0.86, size * 0.04), y: jitter(size * 0.68, size * 0.04), r: size * 0.016, variant: 2, rotation: 0.16 },
                    { x: jitter(size * 0.93, size * 0.04), y: jitter(size * 0.48, size * 0.04), r: size * 0.015, variant: 0, rotation: -0.25 },
                    { x: jitter(size * 0.44, size * 0.05), y: jitter(size * 0.76, size * 0.04), r: size * 0.016, variant: 2, rotation: 0.1 },
                    { x: jitter(size * 0.64, size * 0.05), y: jitter(size * 0.73, size * 0.04), r: size * 0.015, variant: 3, rotation: -0.18 },
                ],
                harbor: [
                    { x: jitter(size * 0.18, size * 0.05), y: jitter(size * 0.52, size * 0.04), r: size * 0.016, variant: 1, rotation: -0.1 },
                    { x: jitter(size * 0.32, size * 0.05), y: jitter(size * 0.31, size * 0.04), r: size * 0.014, variant: 3, rotation: 0.16 },
                    { x: jitter(size * 0.47, size * 0.05), y: jitter(size * 0.62, size * 0.04), r: size * 0.017, variant: 0, rotation: -0.18 },
                    { x: jitter(size * 0.64, size * 0.05), y: jitter(size * 0.42, size * 0.04), r: size * 0.015, variant: 2, rotation: 0.12 },
                    { x: jitter(size * 0.78, size * 0.05), y: jitter(size * 0.56, size * 0.04), r: size * 0.016, variant: 1, rotation: 0.2 },
                    { x: jitter(size * 0.18, size * 0.05), y: jitter(size * 0.78, size * 0.04), r: size * 0.015, variant: 0, rotation: -0.24 },
                    { x: jitter(size * 0.39, size * 0.05), y: jitter(size * 0.82, size * 0.04), r: size * 0.015, variant: 3, rotation: 0.08 },
                    { x: jitter(size * 0.72, size * 0.05), y: jitter(size * 0.76, size * 0.04), r: size * 0.016, variant: 2, rotation: -0.14 },
                ],
                library: [
                    { x: jitter(size * 0.12, size * 0.04), y: jitter(size * 0.22, size * 0.03), r: size * 0.014, variant: 0, rotation: -0.08 },
                    { x: jitter(size * 0.29, size * 0.04), y: jitter(size * 0.38, size * 0.03), r: size * 0.015, variant: 2, rotation: 0.12 },
                    { x: jitter(size * 0.48, size * 0.04), y: jitter(size * 0.2, size * 0.03), r: size * 0.014, variant: 3, rotation: -0.18 },
                    { x: jitter(size * 0.68, size * 0.04), y: jitter(size * 0.53, size * 0.03), r: size * 0.015, variant: 1, rotation: 0.18 },
                    { x: jitter(size * 0.86, size * 0.04), y: jitter(size * 0.36, size * 0.03), r: size * 0.014, variant: 0, rotation: -0.12 },
                    { x: jitter(size * 0.24, size * 0.05), y: jitter(size * 0.8, size * 0.04), r: size * 0.016, variant: 2, rotation: 0.22 },
                    { x: jitter(size * 0.52, size * 0.05), y: jitter(size * 0.77, size * 0.04), r: size * 0.016, variant: 1, rotation: -0.16 },
                    { x: jitter(size * 0.78, size * 0.05), y: jitter(size * 0.83, size * 0.04), r: size * 0.015, variant: 3, rotation: 0.1 },
                ],
                garden: [
                    { x: jitter(size * 0.14, size * 0.05), y: jitter(size * 0.5, size * 0.04), r: size * 0.015, variant: 0, rotation: -0.16 },
                    { x: jitter(size * 0.31, size * 0.05), y: jitter(size * 0.36, size * 0.04), r: size * 0.014, variant: 2, rotation: 0.18 },
                    { x: jitter(size * 0.49, size * 0.05), y: jitter(size * 0.58, size * 0.04), r: size * 0.016, variant: 1, rotation: -0.08 },
                    { x: jitter(size * 0.72, size * 0.05), y: jitter(size * 0.39, size * 0.04), r: size * 0.015, variant: 3, rotation: 0.2 },
                    { x: jitter(size * 0.82, size * 0.04), y: jitter(size * 0.78, size * 0.04), r: size * 0.016, variant: 2, rotation: -0.22 },
                    { x: jitter(size * 0.28, size * 0.05), y: jitter(size * 0.82, size * 0.04), r: size * 0.015, variant: 0, rotation: 0.12 },
                    { x: jitter(size * 0.58, size * 0.05), y: jitter(size * 0.86, size * 0.04), r: size * 0.014, variant: 3, rotation: -0.1 },
                ],
                kitchen: [
                    { x: jitter(size * 0.16, size * 0.04), y: jitter(size * 0.25, size * 0.04), r: size * 0.014, variant: 1, rotation: 0.12 },
                    { x: jitter(size * 0.34, size * 0.04), y: jitter(size * 0.48, size * 0.04), r: size * 0.015, variant: 2, rotation: -0.18 },
                    { x: jitter(size * 0.56, size * 0.04), y: jitter(size * 0.29, size * 0.04), r: size * 0.014, variant: 3, rotation: 0.16 },
                    { x: jitter(size * 0.78, size * 0.04), y: jitter(size * 0.5, size * 0.04), r: size * 0.015, variant: 0, rotation: -0.12 },
                    { x: jitter(size * 0.25, size * 0.05), y: jitter(size * 0.72, size * 0.04), r: size * 0.016, variant: 1, rotation: 0.22 },
                    { x: jitter(size * 0.52, size * 0.05), y: jitter(size * 0.68, size * 0.04), r: size * 0.016, variant: 3, rotation: -0.16 },
                    { x: jitter(size * 0.78, size * 0.05), y: jitter(size * 0.78, size * 0.04), r: size * 0.015, variant: 2, rotation: 0.1 },
                ],
                museum: [
                    { x: jitter(size * 0.18, size * 0.04), y: jitter(size * 0.34, size * 0.04), r: size * 0.014, variant: 0, rotation: -0.08 },
                    { x: jitter(size * 0.34, size * 0.04), y: jitter(size * 0.63, size * 0.04), r: size * 0.015, variant: 2, rotation: 0.18 },
                    { x: jitter(size * 0.5, size * 0.04), y: jitter(size * 0.2, size * 0.04), r: size * 0.014, variant: 3, rotation: -0.14 },
                    { x: jitter(size * 0.64, size * 0.04), y: jitter(size * 0.42, size * 0.04), r: size * 0.015, variant: 1, rotation: 0.12 },
                    { x: jitter(size * 0.82, size * 0.04), y: jitter(size * 0.62, size * 0.04), r: size * 0.015, variant: 0, rotation: -0.22 },
                    { x: jitter(size * 0.28, size * 0.05), y: jitter(size * 0.82, size * 0.04), r: size * 0.016, variant: 3, rotation: 0.2 },
                    { x: jitter(size * 0.7, size * 0.05), y: jitter(size * 0.81, size * 0.04), r: size * 0.016, variant: 2, rotation: -0.1 },
                ],
            };
            return anchorSets[state.sceneTemplate] || anchorSets.travel;
        }

        function semanticCatRegions(size) {
            const regionsByScene = {
                travel: [
                { name: "colosseum-arches", xMin: 0.06, xMax: 0.28, yMin: 0.38, yMax: 0.7, r: 0.016, variants: [0, 1], rot: [-0.22, 0.18] },
                { name: "tower-windows", xMin: 0.3, xMax: 0.43, yMin: 0.22, yMax: 0.62, r: 0.014, variants: [2, 3], rot: [-0.18, 0.24] },
                { name: "street-roofs", xMin: 0.43, xMax: 0.76, yMin: 0.31, yMax: 0.5, r: 0.015, variants: [0, 2], rot: [-0.12, 0.16] },
                { name: "cloud-edges", xMin: 0.12, xMax: 0.85, yMin: 0.08, yMax: 0.2, r: 0.013, variants: [1, 3], rot: [-0.28, 0.28] },
                { name: "road-lines", xMin: 0.44, xMax: 0.7, yMin: 0.62, yMax: 0.9, r: 0.015, variants: [0, 1, 2], rot: [-0.32, 0.22] },
                { name: "table-objects", xMin: 0.64, xMax: 0.94, yMin: 0.58, yMax: 0.86, r: 0.016, variants: [1, 2, 3], rot: [-0.2, 0.32] },
                { name: "artist-lines", xMin: 0.75, xMax: 0.9, yMin: 0.17, yMax: 0.45, r: 0.014, variants: [0, 3], rot: [-0.24, 0.2] },
                { name: "hills-texture", xMin: 0.24, xMax: 0.72, yMin: 0.52, yMax: 0.76, r: 0.015, variants: [0, 1, 2, 3], rot: [-0.2, 0.2] },
                ],
                harbor: [
                    { name: "harbor-sails", xMin: 0.16, xMax: 0.82, yMin: 0.18, yMax: 0.46, r: 0.014, variants: [0, 3], rot: [-0.28, 0.22] },
                    { name: "boat-hulls", xMin: 0.08, xMax: 0.9, yMin: 0.48, yMax: 0.64, r: 0.016, variants: [1, 2], rot: [-0.2, 0.24] },
                    { name: "pier-posts", xMin: 0.06, xMax: 0.94, yMin: 0.62, yMax: 0.9, r: 0.015, variants: [0, 1, 3], rot: [-0.18, 0.2] },
                    { name: "wave-lines", xMin: 0.05, xMax: 0.94, yMin: 0.38, yMax: 0.78, r: 0.014, variants: [1, 2, 3], rot: [-0.24, 0.24] },
                    { name: "rope-coils", xMin: 0.12, xMax: 0.86, yMin: 0.72, yMax: 0.92, r: 0.015, variants: [0, 2], rot: [-0.3, 0.28] },
                    { name: "sky-birds", xMin: 0.12, xMax: 0.88, yMin: 0.08, yMax: 0.22, r: 0.013, variants: [2, 3], rot: [-0.26, 0.26] },
                ],
                library: [
                    { name: "top-shelves", xMin: 0.08, xMax: 0.92, yMin: 0.13, yMax: 0.29, r: 0.014, variants: [0, 2], rot: [-0.18, 0.18] },
                    { name: "middle-shelves", xMin: 0.08, xMax: 0.92, yMin: 0.32, yMax: 0.55, r: 0.015, variants: [1, 3], rot: [-0.2, 0.22] },
                    { name: "lower-shelves", xMin: 0.08, xMax: 0.92, yMin: 0.5, yMax: 0.72, r: 0.015, variants: [0, 1, 2], rot: [-0.16, 0.2] },
                    { name: "desk-books", xMin: 0.18, xMax: 0.82, yMin: 0.72, yMax: 0.86, r: 0.016, variants: [1, 2, 3], rot: [-0.28, 0.28] },
                    { name: "floor-notes", xMin: 0.12, xMax: 0.88, yMin: 0.82, yMax: 0.94, r: 0.014, variants: [0, 3], rot: [-0.24, 0.24] },
                ],
                garden: [
                    { name: "flower-beds", xMin: 0.07, xMax: 0.92, yMin: 0.68, yMax: 0.92, r: 0.015, variants: [0, 1, 2], rot: [-0.24, 0.24] },
                    { name: "tree-branches", xMin: 0.08, xMax: 0.9, yMin: 0.28, yMax: 0.58, r: 0.014, variants: [1, 3], rot: [-0.22, 0.22] },
                    { name: "garden-path", xMin: 0.12, xMax: 0.88, yMin: 0.78, yMax: 0.94, r: 0.015, variants: [0, 2, 3], rot: [-0.3, 0.28] },
                    { name: "birdhouse", xMin: 0.68, xMax: 0.88, yMin: 0.25, yMax: 0.48, r: 0.014, variants: [1, 2], rot: [-0.18, 0.2] },
                    { name: "cloud-garden", xMin: 0.1, xMax: 0.86, yMin: 0.08, yMax: 0.2, r: 0.013, variants: [2, 3], rot: [-0.24, 0.24] },
                ],
                kitchen: [
                    { name: "upper-cabinets", xMin: 0.08, xMax: 0.92, yMin: 0.16, yMax: 0.36, r: 0.014, variants: [0, 2], rot: [-0.2, 0.2] },
                    { name: "counter-objects", xMin: 0.1, xMax: 0.9, yMin: 0.42, yMax: 0.62, r: 0.015, variants: [1, 2, 3], rot: [-0.24, 0.24] },
                    { name: "tableware", xMin: 0.18, xMax: 0.82, yMin: 0.66, yMax: 0.82, r: 0.016, variants: [0, 1, 3], rot: [-0.28, 0.28] },
                    { name: "tile-lines", xMin: 0.06, xMax: 0.94, yMin: 0.04, yMax: 0.62, r: 0.013, variants: [2, 3], rot: [-0.16, 0.18] },
                    { name: "table-legs", xMin: 0.16, xMax: 0.84, yMin: 0.78, yMax: 0.94, r: 0.015, variants: [0, 2], rot: [-0.22, 0.22] },
                ],
                museum: [
                    { name: "painting-frames", xMin: 0.14, xMax: 0.84, yMin: 0.3, yMax: 0.52, r: 0.014, variants: [0, 1, 3], rot: [-0.2, 0.2] },
                    { name: "columns", xMin: 0.16, xMax: 0.86, yMin: 0.24, yMax: 0.72, r: 0.015, variants: [1, 2], rot: [-0.18, 0.18] },
                    { name: "pedestals", xMin: 0.18, xMax: 0.84, yMin: 0.72, yMax: 0.88, r: 0.016, variants: [0, 2, 3], rot: [-0.24, 0.24] },
                    { name: "museum-floor", xMin: 0.1, xMax: 0.92, yMin: 0.78, yMax: 0.94, r: 0.014, variants: [1, 3], rot: [-0.28, 0.28] },
                    { name: "roof-lines", xMin: 0.12, xMax: 0.88, yMin: 0.08, yMax: 0.24, r: 0.013, variants: [0, 2], rot: [-0.2, 0.2] },
                ],
            };
            return regionsByScene[state.sceneTemplate] || regionsByScene.travel;
        }

        /* 语义区域与锚点只配置基础姿势(0-3)；按种子一半概率升级为对应扩展姿势(4-7)，让新形状自然混入画面 */
        function expandCatPose(base, random) {
            return random() < 0.5 ? base : base + (CAT_POSE_COUNT / 2);
        }

        function candidateCatsFromRegions(size, random, count) {
            const regions = semanticCatRegions(size);
            const difficulty = state.difficulty || levelDifficulty(state.level || 1);
            const targetCount = Math.max(count * difficulty.candidateMultiplier, 24);
            const candidates = [];
            for (let i = 0; i < targetCount; i++) {
                const region = pickFrom(regions, random);
                const r = size * (region.r + (random() - 0.5) * 0.004);
                candidates.push({
                    x: size * (region.xMin + random() * (region.xMax - region.xMin)),
                    y: size * (region.yMin + random() * (region.yMax - region.yMin)),
                    r,
                    variant: expandCatPose(pickFrom(region.variants, random), random),
                    rotation: region.rot[0] + random() * (region.rot[1] - region.rot[0]),
                    region: region.name,
                });
            }
            return candidates;
        }

        function shuffleWithRandom(items, random) {
            const result = items.slice();
            for (let i = result.length - 1; i > 0; i--) {
                const j = randInt(0, i, random);
                [result[i], result[j]] = [result[j], result[i]];
            }
            return result;
        }

        function pickCatCandidates(size, cats, random) {
            const anchors = sceneCatAnchors(size);
            const candidates = shuffleWithRandom(anchors.concat(candidateCatsFromRegions(size, random, cats)), random);
            const selected = [];
            const difficulty = state.difficulty || levelDifficulty(state.level || 1);
            const minDist = size * difficulty.minCatSpacing;
            const padding = size * 0.045;

            for (const candidate of candidates) {
                if (candidate.x < padding || candidate.x > size - padding || candidate.y < padding || candidate.y > size - padding) continue;
                if (selected.some((item) => Math.hypot(item.x - candidate.x, item.y - candidate.y) < minDist)) continue;
                selected.push(candidate);
                if (selected.length >= cats) break;
            }

            if (selected.length < cats) {
                for (const candidate of candidates) {
                    if (selected.includes(candidate)) continue;
                    selected.push(candidate);
                    if (selected.length >= cats) break;
                }
            }

            return selected;
        }

        function generateLevel(level, levelSeed = createLevelSeed(level)) {
            stopTimer();
            initState(level, levelSeed);
            const size = state.size;
            const cats = state.totalCats;
            const obs = obstacleCount(cats, level);
            const catRandom = seededRandom(state.catSeed);
            const obstacleRandom = seededRandom(state.obstacleSeed);
            const hintRandom = seededRandom(state.hintSeed);
            const obstacleTypes = sceneObstacles();
            state.hintRandom = hintRandom;

            /* 生成猫咪位置：从固定锚点和场景语义区域共同取样，保持同一 seed 可复现。 */
            const anchors = pickCatCandidates(size, cats, catRandom);
            state.cats = anchors.map((anchor) => ({
                x: anchor.x + randFloat(-size * 0.006, size * 0.006, catRandom),
                y: anchor.y + randFloat(-size * 0.006, size * 0.006, catRandom),
                r: Math.max(26, Math.min(44, anchor.r * 1.35)),
                found: false,
                variant: expandCatPose(anchor.variant, catRandom),
                rotation: anchor.rotation + randFloat(-0.1, 0.1, catRandom),
                region: anchor.region || "anchor",
            }));

            /* 生成干扰物：带最小间距的拒绝采样，避免画框等矩形物互相叠压成脏区 */
            const padding = size * 0.08;
            const minGap = size * 0.1;
            const placed = [];
            for (let i = 0; i < obs; i++) {
                let ox = 0;
                let oy = 0;
                for (let attempt = 0; attempt < 8; attempt++) {
                    ox = randFloat(padding * 0.5, size - padding * 0.5, obstacleRandom);
                    oy = randFloat(padding * 0.5, size - padding * 0.5, obstacleRandom);
                    if (placed.every((p) => Math.hypot(p.x - ox, p.y - oy) >= minGap)) break;
                }
                placed.push({ x: ox, y: oy });
                state.obstacles.push({
                    x: ox,
                    y: oy,
                    type: obstacleTypes[randInt(0, obstacleTypes.length - 1, obstacleRandom)],
                    size: randInt(35, 65, obstacleRandom),
                    scale: randFloat(0.7, 1.3, obstacleRandom),
                    rotation: randFloat(-0.6, 0.6, obstacleRandom),
                });
            }

            /* 设置画布像素尺寸 */
            state.dpr = configureCanvasForDpr(canvas, ctx, size);
            buildBackgroundCache();

            /* 初始缩放：让画布适应视口 */
            fitCanvasToView();

            /* 渲染 */
            renderScene();
            updateUI();
            startTimer();
        }

        /* ===== 渲染 ===== */
        function buildBackgroundCache() {
            if (typeof document.createElement !== "function") {
                state.backgroundCanvas = null;
                return;
            }

            const size = state.size;
            const activeCanvas = canvas;
            const activeCtx = ctx;
            const cache = document.createElement("canvas");
            const cacheCtx = cache.getContext && cache.getContext("2d");
            if (!cacheCtx) {
                state.backgroundCanvas = null;
                return;
            }

            configureCanvasForDpr(cache, cacheCtx, size, state.dpr);
            canvas = cache;
            ctx = cacheCtx;
            try {
                drawTravelSketchScene(size);
                state.obstacles.forEach(drawObstacle);
            } finally {
                canvas = activeCanvas;
                ctx = activeCtx;
            }
            state.backgroundCanvas = cache;
        }

        function renderScene() {
            const size = state.size;
            ctx.clearRect(0, 0, size, size);

            if (state.backgroundCanvas) {
                ctx.drawImage(state.backgroundCanvas, 0, 0, size, size);
            } else {
                drawTravelSketchScene(size);
                state.obstacles.forEach(drawObstacle);
            }

            /* 小猫轮廓藏在线稿细节里 */
            state.cats.forEach(c => {
                drawCat(c.x, c.y, c.r, c.rotation, c.variant, c.found);
            });
        }

        /* ===== 画布视口变换 ===== */
        function fitCanvasToView() {
            const vw = wrap.clientWidth;
            const vh = wrap.clientHeight;
            const size = state.size;
            const fitScale = Math.min(vw / size, vh / size);
            state.scale = fitScale * 0.9;
            state.offsetX = (vw - size * state.scale) / 2;
            state.offsetY = (vh - size * state.scale) / 2;
            applyTransform();
        }

        function applyTransform() {
            clampView();
            canvas.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
            canvas.style.transformOrigin = "0 0";
        }

        function animateViewTo(targetScale, targetOffsetX, targetOffsetY, duration = 520, onComplete) {
            const startScale = state.scale;
            const startOffsetX = state.offsetX;
            const startOffsetY = state.offsetY;
            const startAt = performance.now();
            const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

            function step(now) {
                const pct = Math.min(1, (now - startAt) / duration);
                const eased = easeOutCubic(pct);
                state.scale = startScale + (targetScale - startScale) * eased;
                state.offsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
                state.offsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;
                applyTransform();

                if (pct < 1) {
                    requestAnimationFrame(step);
                } else if (onComplete) {
                    onComplete();
                }
            }

            requestAnimationFrame(step);
        }

        function clampView() {
            const vw = wrap.clientWidth;
            const vh = wrap.clientHeight;
            const scaled = state.size * state.scale;
            const margin = 16;

            if (scaled <= vw) {
                state.offsetX = (vw - scaled) / 2;
            } else {
                const minX = vw - scaled - margin;
                const maxX = margin;
                state.offsetX = Math.min(maxX, Math.max(minX, state.offsetX));
            }

            if (scaled <= vh) {
                state.offsetY = (vh - scaled) / 2;
            } else {
                const minY = vh - scaled - margin;
                const maxY = margin;
                state.offsetY = Math.min(maxY, Math.max(minY, state.offsetY));
            }
        }

        /* ===== 触控交互 ===== */
        let pinchStartDist = 0;
        let pinchStartScale = 1;
        let panStartX = 0, panStartY = 0;
        let panStartOffX = 0, panStartOffY = 0;
        let touchStartTime = 0;
        let touchMoved = false;
        let lastTouchTapAt = 0;

        function getTouchDist(t1, t2) {
            return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        }

        wrap.addEventListener("touchstart", (e) => {
            if (state.won) return;
            e.preventDefault();

            if (e.touches.length === 1) {
                touchStartTime = Date.now();
                touchMoved = false;
                panStartX = e.touches[0].clientX;
                panStartY = e.touches[0].clientY;
                panStartOffX = state.offsetX;
                panStartOffY = state.offsetY;
            } else if (e.touches.length === 2) {
                pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
                pinchStartScale = state.scale;
            }
        }, { passive: false });

        wrap.addEventListener("touchmove", (e) => {
            if (state.won) return;
            e.preventDefault();

            if (e.touches.length === 1) {
                const dx = e.touches[0].clientX - panStartX;
                const dy = e.touches[0].clientY - panStartY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) touchMoved = true;
                state.offsetX = panStartOffX + dx;
                state.offsetY = panStartOffY + dy;
                applyTransform();
            } else if (e.touches.length === 2) {
                touchMoved = true;
                const dist = getTouchDist(e.touches[0], e.touches[1]);
                const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartScale * (dist / pinchStartDist)));
                const rect = wrap.getBoundingClientRect();
                const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                const ratio = newScale / state.scale;
                state.offsetX = cx - ratio * (cx - state.offsetX);
                state.offsetY = cy - ratio * (cy - state.offsetY);
                state.scale = newScale;
                applyTransform();
            }
        }, { passive: false });

        wrap.addEventListener("touchend", (e) => {
            if (state.won) return;

            /* 判断点击（非滑动、短按） */
            const elapsed = Date.now() - touchStartTime;
            if (!touchMoved && e.changedTouches.length === 1 && elapsed < 300) {
                const t = e.changedTouches[0];
                handleTap(t.clientX, t.clientY);
                lastTouchTapAt = Date.now();
            }
        });

        wrap.addEventListener("click", (e) => {
            if (state.won || Date.now() - lastTouchTapAt < 500) return;
            handleTap(e.clientX, e.clientY);
        });

        wrap.addEventListener("wheel", (e) => {
            if (state.won) return;
            e.preventDefault();
            const rect = wrap.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            const direction = e.deltaY > 0 ? -1 : 1;
            const factor = direction > 0 ? 1.12 : 0.9;
            const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * factor));
            const ratio = newScale / state.scale;
            state.offsetX = cx - ratio * (cx - state.offsetX);
            state.offsetY = cy - ratio * (cy - state.offsetY);
            state.scale = newScale;
            applyTransform();
        }, { passive: false });

        /* ===== 点击判定 ===== */
        function screenToCanvas(sx, sy) {
            const rect = wrap.getBoundingClientRect();
            return {
                x: (sx - rect.left - state.offsetX) / state.scale,
                y: (sy - rect.top - state.offsetY) / state.scale,
            };
        }

        function handleTap(sx, sy) {
            const { x, y } = screenToCanvas(sx, sy);
            state.steps++;
            updateUI();

            /* 检查是否命中猫咪 */
            let hit = null;
            for (const c of state.cats) {
                if (c.found) continue;
                const dist = Math.hypot(c.x - x, c.y - y);
                if (dist <= c.r * HIT_RADIUS_MULT) {
                    hit = c;
                    break;
                }
            }

            if (hit) {
                hit.found = true;
                state.foundCount++;
                const combo = registerCombo();
                hideProximityToast();
                if (combo >= 2) showComboToast(combo);
                showHitMarker(sx, sy);
                showHitParticles(sx, sy);
                renderScene();
                updateUI();

                if (state.foundCount >= state.totalCats) {
                    state.won = true;
                    stopTimer();
                    setTimeout(showWinModal, 400);
                }
            } else {
                resetCombo();
                showMissMarker(sx, sy);
                showProximityFeedback(x, y);
            }
        }

        /* ===== 命中/未中动画 ===== */
        function showHitMarker(sx, sy) {
            const rect = wrap.getBoundingClientRect();
            const size = 40;
            const el = document.createElement("div");
            el.className = "hit-marker";
            el.style.cssText = `left:${sx - rect.left - size / 2}px;top:${sy - rect.top - size / 2}px;width:${size}px;height:${size}px;`;
            wrap.appendChild(el);
            setTimeout(() => el.remove(), 600);
        }

        function showHitParticles(sx, sy) {
            const rect = wrap.getBoundingClientRect();
            for (let i = 0; i < 8; i++) {
                const angle = i / 8 * Math.PI * 2 + Math.random() * 0.28;
                const distance = 22 + Math.random() * 18;
                const el = document.createElement("span");
                el.className = "hit-particle";
                el.style.cssText = [
                    `left:${sx - rect.left}px`,
                    `top:${sy - rect.top}px`,
                    `--dx:${Math.cos(angle) * distance}px`,
                    `--dy:${Math.sin(angle) * distance}px`,
                    `animation-delay:${i * 12}ms`,
                ].join(";");
                wrap.appendChild(el);
                setTimeout(() => el.remove(), 760);
            }
        }

        function showMissMarker(sx, sy) {
            const rect = wrap.getBoundingClientRect();
            const el = document.createElement("div");
            el.className = "miss-marker";
            el.style.cssText = `left:${sx - rect.left - 10}px;top:${sy - rect.top - 10}px;`;
            wrap.appendChild(el);
            setTimeout(() => el.remove(), 700);
        }

        function showHintMarker(target) {
            const size = Math.max(46, target.r * state.scale * 3.2);
            const left = target.x * state.scale + state.offsetX - size / 2;
            const top = target.y * state.scale + state.offsetY - size / 2;
            const el = document.createElement("div");
            el.className = "hint-marker";
            el.style.cssText = `left:${left}px;top:${top}px;width:${size}px;height:${size}px;`;
            wrap.appendChild(el);
            setTimeout(() => el.remove(), 1250);
        }

        let proximityTimer = null;
        let comboTimer = null;

        function registerCombo() {
            const now = Date.now();
            state.comboCount = state.lastFoundAt && now - state.lastFoundAt <= 3000 ? state.comboCount + 1 : 1;
            state.lastFoundAt = now;
            state.maxCombo = Math.max(state.maxCombo, state.comboCount);
            return state.comboCount;
        }

        function resetCombo() {
            state.comboCount = 0;
            state.lastFoundAt = 0;
        }

        function showComboToast(combo) {
            comboToast.textContent = `${combo} 连击`;
            comboToast.classList.add("show");
            if (comboTimer) clearTimeout(comboTimer);
            comboTimer = setTimeout(() => {
                comboToast.classList.remove("show");
                comboTimer = null;
            }, 900);
        }

        function showProximityFeedback(x, y) {
            const nearest = state.cats
                .filter((cat) => !cat.found)
                .map((cat) => ({ cat, dist: Math.hypot(cat.x - x, cat.y - y) }))
                .sort((a, b) => a.dist - b.dist)[0];
            if (!nearest) return;

            const near = nearest.dist <= nearest.cat.r * 4.2;
            const warm = nearest.dist <= nearest.cat.r * 8;
            const message = near ? "很近了，小猫就在旁边！" : warm ? "有点接近啦，再找找看～" : "离小猫还远，换个地方找找吧";
            proximityToast.textContent = message;
            proximityToast.classList.add("show");

            if (proximityTimer) clearTimeout(proximityTimer);
            proximityTimer = setTimeout(hideProximityToast, 1100);
        }

        function hideProximityToast() {
            proximityToast.classList.remove("show");
            if (proximityTimer) {
                clearTimeout(proximityTimer);
                proximityTimer = null;
            }
        }

        /* ===== 计时器 ===== */
        function startTimer() {
            if (state.timerInterval) return;
            state.startTime = Date.now() - state.elapsed * 1000;
            state.timerInterval = setInterval(() => {
                state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
                uiTimer.textContent = formatTime(state.elapsed);
            }, 250);
        }

        function stopTimer() {
            if (state.timerInterval) {
                clearInterval(state.timerInterval);
                state.timerInterval = null;
            }
        }

        function formatTime(sec) {
            const m = String(Math.floor(sec / 60)).padStart(2, "0");
            const s = String(sec % 60).padStart(2, "0");
            return `${m}:${s}`;
        }

        /* ===== UI 更新 ===== */
        function updateUI() {
            uiLevel.innerHTML = `第 ${state.level} 关<small>${sceneLabel(state.sceneTemplate)}</small>`;
            uiSteps.textContent = state.steps;
            uiProgressCount.textContent = `${state.foundCount} / ${state.totalCats}`;
            const pct = state.totalCats > 0 ? (state.foundCount / state.totalCats * 100) : 0;
            uiProgressFill.style.width = pct + "%";
            uiHintBadge.textContent = state.hints;
            uiTimer.textContent = formatTime(state.elapsed);

            if (state.hints <= 0) {
                btnHint.disabled = true;
            } else {
                btnHint.disabled = false;
            }
        }

        function sceneLabel(template) {
            const labels = {
                travel: "旅行线稿",
                harbor: "港口线稿",
                library: "图书馆线稿",
                garden: "花园线稿",
                kitchen: "厨房线稿",
                museum: "博物馆线稿",
            };
            return labels[template] || "线稿场景";
        }

        function starTargets(level, cats) {
            return {
                steps3: cats + Math.ceil(cats * 1.25) + 1 + Math.floor(level / 3),
                steps2: cats + Math.ceil(cats * 2.35) + 2 + Math.floor(level / 2),
                time3: 22 + cats * 8 + level * 2,
                time2: 42 + cats * 12 + level * 3,
            };
        }

        function calculateStars(level, cats, steps, elapsed, maxCombo = 0) {
            const targets = starTargets(level, cats);
            const comboBonus = Math.min(2, Math.max(0, maxCombo - 1));
            const effectiveSteps = Math.max(cats, steps - comboBonus);
            if (effectiveSteps <= targets.steps3 && elapsed <= targets.time3) return 3;
            if (effectiveSteps <= targets.steps2 && elapsed <= targets.time2) return 2;
            return 1;
        }

        function starText(stars) {
            return "★".repeat(stars) + "☆".repeat(3 - stars);
        }

        function ratingText(stars) {
            if (stars >= 3) return "满星通关。点击和用时都控制得很好。";
            if (stars === 2) return "表现不错，再减少误点或更快找到猫咪可冲击满星。";
            return "已通关。熟悉场景后再来一次，可以争取更高星级。";
        }

        /* ===== 通关弹层 ===== */
        function showWinModal() {
            const best = getBestLevel();
            if (state.level > best) {
                saveBestLevel(state.level);
            }
            const stars = calculateStars(state.level, state.totalCats, state.steps, state.elapsed, state.maxCombo);
            state.currentStars = stars;
            const levelBest = saveLevelRecord(state.level, {
                stars,
                steps: state.steps,
                elapsed: state.elapsed,
                scene: state.sceneTemplate,
                cats: state.totalCats,
                maxCombo: state.maxCombo,
                updatedAt: new Date().toISOString(),
            });

            $("#modalLevel").textContent = state.level;
            $("#modalCats").textContent = state.totalCats;
            $("#modalSteps").textContent = state.steps;
            $("#modalTime").textContent = formatTime(state.elapsed);
            $("#modalBestLevel").textContent = Math.max(state.level, best);
            $("#modalLevelBest").textContent = levelBest ? `${starText(levelBest.stars)} / ${formatTime(levelBest.elapsed)} / ${levelBest.steps} 次` : "--";
            $("#modalStars").textContent = starText(stars);
            $("#modalStars").setAttribute("aria-label", `本关 ${stars} 星`);
            $("#modalRating").textContent = state.maxCombo >= 2 ? `${ratingText(stars)} 最高 ${state.maxCombo} 连击已计入星级。` : ratingText(stars);

            winOverlay.classList.add("show");
            showWinConfetti();
        }

        function hideWinModal() {
            winOverlay.classList.remove("show");
        }

        function showWinConfetti() {
            const colors = ["var(--primary)", "var(--success)", "var(--warning)", "var(--error)"];
            for (let i = 0; i < 22; i++) {
                const angle = i / 22 * Math.PI * 2;
                const distance = 64 + Math.random() * 54;
                const el = document.createElement("span");
                el.className = "win-confetti";
                el.style.cssText = [
                    `background:${colors[i % colors.length]}`,
                    `--dx:${Math.cos(angle) * distance}px`,
                    `--dy:${Math.sin(angle) * distance - 42}px`,
                    `animation-delay:${(i % 6) * 18}ms`,
                ].join(";");
                winOverlay.appendChild(el);
                setTimeout(() => el.remove(), 980);
            }
        }

        /* ===== 持久化 ===== */
        function getBestLevel() {
            try {
                return parseInt(localStorage.getItem(STORAGE_PREFIX + "best-level")) || 0;
            } catch { return 0; }
        }

        function saveBestLevel(level) {
            try { localStorage.setItem(STORAGE_PREFIX + "best-level", level); } catch {}
        }

        function getLevelRecords() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_PREFIX + "level-records")) || {};
            } catch { return {}; }
        }

        function saveLevelRecords(records) {
            try { localStorage.setItem(STORAGE_PREFIX + "level-records", JSON.stringify(records)); } catch {}
        }

        function isBetterRecord(next, prev) {
            if (!prev) return true;
            if (next.stars !== prev.stars) return next.stars > prev.stars;
            if (next.elapsed !== prev.elapsed) return next.elapsed < prev.elapsed;
            return next.steps < prev.steps;
        }

        function saveLevelRecord(level, record) {
            const records = getLevelRecords();
            const key = String(level);
            if (isBetterRecord(record, records[key])) {
                records[key] = record;
                saveLevelRecords(records);
            }
            return records[key];
        }

        function markIntroSeen() {
            try { localStorage.setItem(STORAGE_PREFIX + "intro-seen", "1"); } catch {}
        }

        function hasSeenIntro() {
            try { return localStorage.getItem(STORAGE_PREFIX + "intro-seen") === "1"; } catch { return true; }
        }

        function openLevelPicker() {
            const best = Math.max(getBestLevel(), state.level);
            const records = getLevelRecords();
            const maxVisible = Math.max(best + 3, 12);
            levelGrid.innerHTML = "";
            for (let level = 1; level <= maxVisible; level++) {
                const button = document.createElement("button");
                const locked = level > best + 1;
                const record = records[String(level)];
                button.type = "button";
                button.className = `level-choice${locked ? " locked" : ""}`;
                button.innerHTML = `第 ${level} 关<small>${record ? starText(record.stars) : sceneLabel(sceneTemplateForLevel(level))}</small>`;
                button.disabled = locked;
                button.addEventListener("click", () => {
                    if (locked) return;
                    hideLevelPicker();
                    hideWinModal();
                    generateLevel(level);
                });
                levelGrid.appendChild(button);
            }
            levelOverlay.classList.add("show");
            requestAnimationFrame(updateLevelScrollHint);
        }

        function hideLevelPicker() {
            levelOverlay.classList.remove("show");
        }

        function updateLevelScrollHint() {
            const hasMore = levelGrid.scrollHeight - levelGrid.scrollTop > levelGrid.clientHeight + 8;
            levelPanel.classList.toggle("has-scroll", hasMore);
            levelScrollHint.textContent = hasMore ? "向下滑动查看更多关卡" : "已显示全部可选关卡";
        }

        function showIntroIfNeeded() {
            if (!hasSeenIntro()) {
                introOverlay.classList.add("show");
            }
        }

        function closeIntro() {
            markIntroSeen();
            introOverlay.classList.remove("show");
        }

        function shareResult() {
            const text = `我在找猫咪第 ${state.level} 关拿到 ${starText(state.currentStars || 1)}，用时 ${formatTime(state.elapsed)}，点击 ${state.steps} 次。`;
            if (navigator.share) {
                navigator.share({ title: "找猫咪", text }).catch(() => {});
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => showShareFeedback("成绩已复制"));
                return;
            }
            showShareFeedback(text);
        }

        function showShareFeedback(text) {
            shareToast.textContent = text;
            shareToast.classList.add("show");
            setTimeout(() => shareToast.classList.remove("show"), 1400);
        }

        /* ===== 按钮事件 ===== */
        btnHint.addEventListener("click", () => {
            if (state.hints <= 0 || state.won) return;
            const unfound = state.cats.filter(c => !c.found);
            if (unfound.length === 0) return;

            state.hints--;
            updateUI();

            const target = unfound[Math.floor(state.hintRandom() * unfound.length)];

            /* 平滑移动到目标附近，保留玩家当前空间感。 */
            const vw = wrap.clientWidth;
            const vh = wrap.clientHeight;
            const targetScale = Math.max(state.scale, Math.min(MAX_SCALE, Math.max(1.45, state.scale * 1.18)));
            const driftX = (state.hintRandom() - 0.5) * vw * 0.18;
            const driftY = (state.hintRandom() - 0.5) * vh * 0.18;
            const targetOffsetX = vw / 2 - target.x * targetScale + driftX;
            const targetOffsetY = vh / 2 - target.y * targetScale + driftY;
            animateViewTo(targetScale, targetOffsetX, targetOffsetY, 560, () => showHintMarker(target));
        });

        btnResetView.addEventListener("click", () => {
            fitCanvasToView();
        });

        btnLevels.addEventListener("click", () => {
            openLevelPicker();
        });

        btnRestart.addEventListener("click", () => {
            stopTimer();
            hideWinModal();
            generateLevel(state.level, state.levelSeed);
        });

        btnReplay.addEventListener("click", () => {
            stopTimer();
            hideWinModal();
            generateLevel(state.level, state.levelSeed);
        });

        btnShare.addEventListener("click", () => {
            shareResult();
        });

        btnNext.addEventListener("click", () => {
            hideWinModal();
            generateLevel(state.level + 1);
        });

        btnIntroStart.addEventListener("click", () => {
            closeIntro();
        });

        btnCloseLevels.addEventListener("click", () => {
            hideLevelPicker();
        });

        levelGrid.addEventListener("scroll", () => {
            updateLevelScrollHint();
        });

        /* 窗口大小变化 */
        let resizeTimer = null;
        window.addEventListener("resize", () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                const nextDpr = canvasDpr(state.size);
                if (Math.abs(nextDpr - state.dpr) > 0.01) {
                    state.dpr = configureCanvasForDpr(canvas, ctx, state.size, nextDpr);
                    buildBackgroundCache();
                    renderScene();
                }
                fitCanvasToView();
            }, 120);
        });

        /* ===== 启动 ===== */
        generateLevel(1);
        showIntroIfNeeded();
    })();
