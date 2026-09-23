"use strict";
/* ==================== 全局调度 ==================== */
const canvas = document.getElementById('enCanvas');

/* 返回平台首页：原三合一大菜单拆分后，"主菜单"指向游戏平台入口页 */
function goHub() { location.href = '../../index.html'; }

/* 打开英语选关菜单 */
function showEnMenu() {
  G.state = 'menu';
  document.getElementById('enOver').classList.add('hidden');
  document.getElementById('enTopBtn').classList.add('hidden');
  renderBoard('menuBoardRows');
  renderEnHome();
  document.getElementById('enMenu').classList.remove('hidden');
}

/* ==================== 英语 · 单词大炮 ==================== */
const ctx = canvas.getContext('2d');
let W = 0, H = 0, groundY = 0, dpr = 1;

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  groundY = H - 64;
  if (G) {
    G.cannon.x = W / 2; G.cannon.y = groundY;
    // 窗口变窄（横竖屏切换/软键盘弹出）时把场上气泡拉回可视区，避免屏幕外的词落地扣命
    for (const it of G.items) it.x = Math.min(Math.max(it.x, 60), W - 60);
  }
}
window.addEventListener('resize', resize);

if (!ctx.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r); this.closePath(); return this;
  };
}

/* ---- 词包（数据在 wordpacks.js，契约 CON-TC001；本文件只消费） ---- */
const PACKS = Array.isArray(window.WordPacks) && window.WordPacks.length ? window.WordPacks : [];
if (!PACKS.length) console.warn('[typing-cannon] wordpacks.js 未加载或为空，闯关不可用，仅无尽/字母练习可玩');
const packById = (id) => PACKS.find(p => p.id === id) || null;
const KID_PACK_ID = 'kid-core';
const kidLevels = () => {
  const kp = packById(KID_PACK_ID);
  return kp ? kp.levels : PACKS.flatMap(p => p.levels);
};
/* 儿童包沿用拆分前的 4 段分组标签；其余包整体一个分组 */
const KID_GROUP_LABELS = [[0, '🌱 入门（第1~3关）'], [3, '🌟 成长（第4~6关）'], [6, '🚀 冒险（第7~9关）'], [9, '👑 终极（第10~12关）']];

/* ---- 错词本（持久化 + 简化 SRS：连对 2 次毕业，打错/漏接清零重来） ---- */
const REVIEW_KEY = 'typcannon_review_v1';
const REVIEW_PACK = { id: 'review', name: '错词复习', icon: '📖', tone: 'adult', levels: [] };
const REVIEW_GRADUATE = 2;   // 连对毕业阈值
const REVIEW_TAKE = 10;      // 单局复习词数上限
let reviewBook = {};
try { const r = JSON.parse(localStorage.getItem(REVIEW_KEY) || 'null'); if (r && typeof r === 'object') reviewBook = r; } catch (e) {}
function reviewPersist() { try { localStorage.setItem(REVIEW_KEY, JSON.stringify(reviewBook)); } catch (e) {} }
function reviewCount() { return Object.keys(reviewBook).length; }
/* 结算回写：missed/wrong 入本并清零连对；本内词完整拼对连对 +1，达阈值毕业 */
function reviewApply(missed, wrong, killed) {
  const now = Date.now();
  for (const w of new Set([...missed, ...wrong, ...killed])) {
    let e = reviewBook[w];
    if (!e) {
      if (!missed.has(w) && !wrong.has(w)) continue;   // 干净击杀且不在本：不采集
      const meta = G.entry.words.find(x => x.w === w) || {};
      e = reviewBook[w] = { w, packId: G.pack.id, ipa: meta.ipa || null, zh: meta.zh || null, right: 0, ts: 0 };
    }
    e.ts = now;
    if (missed.has(w) || wrong.has(w)) e.right = 0;
    else { e.right++; if (e.right >= REVIEW_GRADUATE) delete reviewBook[w]; }
  }
  reviewPersist();
}
/* 复习局词表：最久未练的前 N 个 */
function reviewTakeDue(n = REVIEW_TAKE) {
  return Object.values(reviewBook)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, n)
    .map(e => ({ w: e.w, emoji: null, ipa: e.ipa, zh: e.zh }));
}
function startReview() {   // 📖 错词复习
  const words = reviewTakeDue();
  if (!words.length) return;
  G.mode = 'review';
  G.pack = REVIEW_PACK;
  G.levelIdx = 0;
  G.entry = { name: '错词复习', icon: '📖', fall: 44, spawn: 2.4, goal: words.length, direction: 'recall', words };
  G.level = 1; G.lives = 3; G.killsNeeded = words.length;
  prepareRun();
  G.toast = { text: '📖 错词复习', sub: '完整拼对 2 轮，这个词就毕业！', t: 2.6 };
}

/* ---- 听写模式（TTS 念词，凭发音拼写；词表运行时从成人词包随机抽取） ---- */
const DICTATION_TAKE = 10;   // 单局听写词数
const dictationAvailable = () => typeof window.speechSynthesis !== 'undefined';
function startDictation(packId) {   // 🎧 听写挑战
  if (!dictationAvailable()) return;
  const pack = packById(packId);
  if (!pack) return;
  const pool = pack.levels.flatMap(l => l.words).filter(x => x.zh);
  const words = [...pool].sort(() => Math.random() - 0.5).slice(0, DICTATION_TAKE)
    .map(x => ({ w: x.w, emoji: null, ipa: x.ipa, zh: x.zh }));
  if (!words.length) return;
  G.mode = 'dictation';
  G.pack = pack;
  G.levelIdx = 0;
  G.entry = { name: '听写挑战', icon: '🎧', fall: 46, spawn: 2.4, goal: words.length, direction: 'dictation', words };
  G.level = 1; G.lives = 3; G.killsNeeded = words.length;
  prepareRun();
  G.toast = { text: '🎧 听写挑战', sub: '听发音拼单词，点击气泡可以重听！', t: 2.6 };
}

/* ---- 英语闯关存档（星星按词包分命名空间：stars[包id][关卡序]） ---- */
const EN_SAVE_KEY = 'typcannonLevelsV1';
let enSave = { stars: {} };
try { const s = JSON.parse(localStorage.getItem(EN_SAVE_KEY) || 'null'); if (s && typeof s === 'object') enSave = Object.assign(enSave, s); } catch (e) {}
function enPersist() { try { localStorage.setItem(EN_SAVE_KEY, JSON.stringify(enSave)); } catch (e) {} }
/* 旧存档迁移：数字键（旧儿童关卡序号）一次性归入 kid-core 命名空间，幂等 */
(function migrateSave() {
  const st = enSave.stars || {};
  if (st[KID_PACK_ID] || !Object.keys(st).some(k => /^\d+$/.test(k))) return;
  enSave.stars = { [KID_PACK_ID]: st };
  enPersist();
})();
function enStarsFor(packId, i) { const p = enSave.stars[packId]; return (p && p[i]) || 0; }
function enUnlocked(packId, i) { return i === 0 || enStarsFor(packId, i - 1) > 0; }
function enStarTotal() {
  let sum = 0;
  for (const p of Object.values(enSave.stars)) for (const v of Object.values(p)) sum += v;
  return sum;
}
function enLevelTotal() { return PACKS.reduce((a, p) => a + p.levels.length, 0); }

/* ---- 英语选关界面 ---- */
function renderEnHome() {
  document.getElementById('enStarTotal').textContent = '⭐ ' + enStarTotal() + '/' + (enLevelTotal() * 3);
  const best = +(localStorage.getItem('typcannon_best') || 0);
  document.getElementById('enBest').textContent = best > 0 ? best : '—';
  const pb = +(localStorage.getItem('typcannon_prac_best') || 0);
  document.getElementById('enPracBest').textContent = pb > 0 ? pb + ' 个' : '—';
  const rb = document.getElementById('reviewBtn');
  rb.textContent = '📖 错词复习（' + reviewCount() + '）';
  rb.disabled = reviewCount() === 0;
  let html = '';
  for (const pack of PACKS) {
    const groups = pack.id === KID_PACK_ID ? KID_GROUP_LABELS
      : [[0, pack.icon + ' ' + pack.name + (pack.tone === 'adult' ? ' · 🧠 词义回忆' : '')]];
    for (const [start, label] of groups) {
      const end = pack.id === KID_PACK_ID ? Math.min(start + 3, pack.levels.length) : pack.levels.length;
      // 成人包分组标题右侧提供听写入口（无语音能力时不渲染）
      const chip = pack.tone === 'adult' && dictationAvailable()
        ? `<button class="en-dictation-btn" data-pack="${pack.id}">🎧 听写</button>` : '';
      html += `<div class="en-group-label"><span>${label}</span>${chip}</div><div class="en-level-row">`;
      for (let i = start; i < end; i++) {
        const lv = pack.levels[i], st = enStarsFor(pack.id, i), lock = !enUnlocked(pack.id, i);
        const faceIcon = lock ? '🔒' : lv.icon;
        html += `<button class="en-level-card" data-pack="${pack.id}" data-i="${i}" ${lock ? 'disabled' : ''}>` +
          `<span class="en-lc-icon">${faceIcon}</span>` +
          `<span class="en-lc-name">${i + 1}.${lv.name}</span>` +
          `<span class="en-lc-stars">${[0, 1, 2].map(k => `<i class="${k < st ? 'on' : ''}">⭐</i>`).join('')}</span>` +
          `</button>`;
      }
      html += '</div>';
    }
  }
  document.getElementById('enGrid').innerHTML = html;
}

/* ---- 音效 ---- */
let audioCtx = null, muted = false;
function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(freq, dur = 0.08, type = 'square', vol = 0.12, when = 0) {
  if (muted || !audioCtx) return;
  const t = audioCtx.currentTime + when;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  correct(c) { beep(420 * Math.pow(2, (c % 10) / 12), 0.07, 'square', 0.10); },
  wrong()    { beep(110, 0.18, 'sawtooth', 0.14); },
  destroy()  { beep(523, .09,'square',.12); beep(659,.09,'square',.12,.07); beep(784,.14,'square',.12,.14); },
  levelup()  { [523,659,784,1047].forEach((f,i)=>beep(f,.12,'triangle',.16,i*.09)); },
  hurt()     { beep(220,.2,'sawtooth',.16); beep(160,.25,'sawtooth',.14,.12); },
  over()     { [440,349,294,220].forEach((f,i)=>beep(f,.22,'triangle',.16,i*.16)); },
  shot()     { beep(880,0.045,'square',0.05); }
};

/* ---- 游戏状态 ---- */
const G = {
  state: 'menu',          // menu | playing | paused | over
  mode: 'endless',        // endless（无尽） | level（闯关） | practice（字母练习）
  pack: PACKS[0] || null, entry: null, levelIdx: 0, rounds: 0,
  items: [], bullets: [], particles: [], floats: [],
  clouds: [],
  score: 0, lives: 5, level: 1, kills: 0, killsNeeded: 8,
  combo: 0, bestCombo: 0, typedOk: 0, mistakes: 0,
  wrongWords: new Set(), missedWords: new Set(), killedWords: new Set(),   // 本局生词与击碎记录
  cleanKills: 0,   // 听写局"一次拼对"的词数（事件计数，同一词重复出现各算一次）
  spawnTimer: 0, playTime: 0, lock: null,
  cannon: { x: 0, y: 0, angle: -Math.PI / 2, recoil: 0, flash: 0 },
  shake: 0, toast: null, startTime: 0
};
resize();

for (let i = 0; i < 6; i++) {
  G.clouds.push({ x: Math.random() * 1600, y: 40 + Math.random() * 160,
    s: 0.6 + Math.random() * 0.9, v: 8 + Math.random() * 14 });
}

/* 掉落难度（闯关/复习/听写用关卡自带参数；无尽随关卡提速；字母练习随时间轻微提速） */
const isLevelRun = () => G.mode === 'level' || G.mode === 'review' || G.mode === 'dictation';   // 三种模式共用一套关卡引擎
const isRecallLike = () => isLevelRun() && (G.entry.direction === 'recall' || G.entry.direction === 'dictation');   // 词义卡类：只给进度槽不给原词
const wordSpeedScale = () => 1 + Math.random() * (isLevelRun() ? 0.12 : G.mode === 'practice' ? 0.18 : 0.35);
const enFall = () => isLevelRun() ? G.entry.fall
  : G.mode === 'practice' ? Math.min(115, 82 + G.playTime * 0.6)
  : Math.min(120, 26 + G.level * 14);       // px/s
const enSpawn = () => isLevelRun() ? G.entry.spawn
  : G.mode === 'practice' ? Math.max(0.85, 1.45 - G.playTime * 0.004)
  : Math.max(0.45, 1.9 - G.level * 0.16); // 秒
const enUnlockTier = () => Math.min(kidLevels().length - 1, Math.floor(G.level * 1.2)); // 无尽模式词表随关卡解锁

// 字母练习：A~Z 单个字母（emoji 为 null 表示按字母牌绘制）
const LETTER_POOL = 'abcdefghijklmnopqrstuvwxyz'.split('').map(ch => ({ w: ch, emoji: null, ipa: null, zh: null }));

function pickWord() {
  const poolAll = isLevelRun() ? G.entry.words
    : G.mode === 'practice' ? LETTER_POOL
    : kidLevels().slice(0, enUnlockTier() + 1).flatMap(l => l.words);
  let pool = poolAll.filter(x => !G.items.some(it => it.word === x.w));
  if (!pool.length) pool = poolAll;
  const p = pool[Math.floor(Math.random() * pool.length)];
  return { word: p.w, emoji: p.emoji, ipa: p.ipa, zh: p.zh };
}

function spawnItem() {
  const { word, emoji, ipa, zh } = pickWord();
  // 词义回忆（recall）与听写（dictation）：气泡不显示原词；其余（copy/字母）维持原样
  const dir = isLevelRun() && G.entry.direction === 'recall' ? 'recall'
    : isLevelRun() && G.entry.direction === 'dictation' ? 'dictation'
    : G.mode === 'practice' ? 'letter' : 'copy';
  let x = 0, tries = 0;
  do {
    x = 60 + Math.random() * (W - 120);
    tries++;
  } while (tries < 12 && G.items.some(it => Math.abs(it.x - x) < 95));
  G.items.push({
    word, emoji, ipa, zh, dir, x, y: -50,
    vy: enFall() * wordSpeedScale(),
    typed: 0, flash: 0, hitFlash: 0, wobble: Math.random() * Math.PI * 2,
    seen: dir === 'recall' || dir === 'dictation' ? false : true,   // 词义/听写卡进入视野后才触发预展示或朗读
    introT: 0
  });
}

function shootAt(item) {
  const c = G.cannon;
  c.recoil = 1; c.flash = 1;
  sfx.shot();
  G.bullets.push({ x: c.x + Math.cos(c.angle) * 46, y: c.y + Math.sin(c.angle) * 46,
    tx: item.x, ty: item.y, item, speed: 760, trail: [] });
}

function burst(x, y, colors, n = 22, power = 200) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = power * (0.3 + Math.random() * 0.7);
    G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      life: 0.5 + Math.random() * 0.5, maxLife: 1,
      size: 2 + Math.random() * 4, color: colors[Math.floor(Math.random() * colors.length)] });
  }
}
function floatText(x, y, text, color, size = 22) {
  G.floats.push({ x, y, text, color, size, life: 1 });
}

/* ==================== 输入处理（修复版） ====================
   规则：
   1. 每次按键，在【所有还没打完】的掉落物中寻找“下一个待打字母 = 按键”的目标，
      新单词只会从【第一个字母】开始比对，绝不会在单词中间被套中；
   2. 若当前锁定单词能继续（前缀对齐）就继续，同时场上还有其它匹配的单词时，
      【越靠下（y 越大，越接近地面）越优先】，先打最危险的；
   3. 全部不匹配才判为错误按键；
   4. 首字母相同的词同场时（copy 关数据允许），自动锁定未必是玩家想要的目标，
      点击气泡可手动切换锁定（保留已打进度）。 */
function handleChar(ch) {
  if (G.state !== 'playing') return;
  if (!/^[a-z]$/.test(ch)) return;
  ensureAudio();

  let best = null;
  for (const it of G.items) {
    if (it.typed >= it.word.length) continue;     // 已打完（待销毁）
    if (it.word[it.typed] !== ch) continue;       // 必须对齐单词的下一字母
    if (!best || it.y > best.y) best = it;        // 优先打最靠下的
  }
  if (!best) {
    G.combo = 0; G.mistakes++;
    if (G.lock) {
      G.lock.flash = 0.6;   // 打错时当前词闪红提示
      // 词义关/听写关：打错过字母的词记为生词；无锁定误按视为手误不记录
      if (isRecallLike()) {
        G.wrongWords.add(G.lock.word);
        // 词义关打错零惩罚会鼓励逐字母试错：清空已打进度，让暴力枚举从头再来
        G.lock.typed = 0;
        floatText(G.lock.x, G.lock.y - 14, '拼错啦，从头拼！', '#ef4444', 16);
      }
    }
    G.cannon.flash = 1; sfx.wrong();
    return;
  }
  G.lock = best;
  best.typed++; best.hitFlash = 1;
  G.typedOk++; G.combo++;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  shootAt(best);
  sfx.correct(G.combo);
  if (best.typed >= best.word.length) destroyItem(best);
}

function destroyItem(it) {
  const i = G.items.indexOf(it);
  if (i >= 0) G.items.splice(i, 1);
  if (G.lock === it) G.lock = null;
  G.kills++;
  G.killedWords.add(it.word);
  const gain = 30 + it.word.length * 12 + Math.min(G.combo, 20) * 3;
  G.score += gain;
  floatText(it.x, it.y - 10, '+' + gain, '#f59e0b', 24);
  // 听写卡击碎时揭示"单词 + 释义"，即时反馈刚才听到的是什么
  if (it.dir === 'dictation') {
    floatText(it.x, it.y - 44, it.word + (it.zh ? ' ' + it.zh : ''), '#38bdf8', 15);
    if (!G.wrongWords.has(it.word)) G.cleanKills++;   // 未打错过的才算"一次拼对"
  }
  burst(it.x, it.y, ['#fbbf24','#f97316','#ef4444','#fff'], 26, 240);
  sfx.destroy();
  if (G.mode === 'practice') {
    if (G.kills % 26 === 0) {          // 每打掉 26 个字母 = 一轮字母表
      G.rounds++;
      G.toast = { text: '🎉 打完第 ' + G.rounds + ' 轮字母表！', sub: '再快一点，冲向下一轮！', t: 2.2 };
      burst(it.x, it.y - 60, ['#f472b6', '#a78bfa', '#38bdf8', '#facc15'], 36, 300);
      sfx.levelup();
    }
    return;
  }
  if (G.kills >= G.killsNeeded) {
    if (G.mode === 'endless') levelUp();
    else levelClear();
  }
}

function levelUp() {
  G.level++;
  G.kills = 0;
  G.killsNeeded = 8 + (G.level - 1) * 2;
  G.toast = { text: '第 ' + G.level + ' 关！', sub: '速度提升，小心！', t: 2 };
  burst(W / 2, H / 2 - 60, ['#38bdf8','#818cf8','#f472b6','#facc15'], 40, 320);
  sfx.levelup();
}

function loseLife(it) {
  const i = G.items.indexOf(it);
  if (i >= 0) G.items.splice(i, 1);
  if (G.lock === it) G.lock = null;
  // 词义关：漏接的词记为生词
  if (it.dir === 'recall' || it.dir === 'dictation') G.missedWords.add(it.word);
  G.lives--;
  G.combo = 0;
  G.shake = 12;
  burst(it.x, groundY, ['#ef4444','#f97316','#94a3b8'], 30, 220);
  floatText(it.x, groundY - 40, '💥', '#ef4444', 30);
  sfx.hurt();
  if (G.lives <= 0) gameOver();
}

/* 本局生词：漏接 + 打错过去重合并，附本关词表中的音标/释义 */
function collectWords() {
  const idx = new Map(G.entry.words.map(x => [x.w, x]));
  return [...new Set([...G.missedWords, ...G.wrongWords])]
    .map(x => idx.get(x) || { w: x, ipa: null, zh: null });
}

/* 闯关成功：按剩余生命结算 1~3 星，解锁下一关 */
function levelClear() {
  G.state = 'over';
  sfx.levelup();
  burst(W / 2, H / 2 - 60, ['#38bdf8', '#818cf8', '#f472b6', '#facc15', '#4ade80'], 60, 420);
  const collectible = G.entry.direction === 'recall' || G.entry.direction === 'dictation';
  if (collectible) reviewApply(G.missedWords, G.wrongWords, G.killedWords);
  const words = collectible ? collectWords() : null;
  if (G.mode === 'review') {
    const left = reviewCount();
    openEnOver({
      greet: left ? '复习完成，本子里还剩 ' + left + ' 个词。' : '错词本清空了，全部掌握！',
      stars: null,
      showBoard: false,
      showNext: false,
      retryText: '再复习一轮',
      words
    });
    return;
  }
  if (G.mode === 'dictation') {
    openEnOver({
      greet: '听写完成，' + G.cleanKills + '/' + G.killsNeeded + ' 词一次拼对。',
      stars: null,
      showBoard: false,
      showNext: false,
      retryText: '再来一轮',
      words
    });
    return;
  }
  const stars = G.lives;                       // 过关时至少剩 1 颗心
  const prev = enStarsFor(G.pack.id, G.levelIdx);
  if (!enSave.stars[G.pack.id]) enSave.stars[G.pack.id] = {};
  enSave.stars[G.pack.id][G.levelIdx] = Math.max(prev, stars);
  enPersist();
  const last = G.levelIdx === G.pack.levels.length - 1;
  const adult = G.pack.tone === 'adult';
  openEnOver({
    greet: last ? (adult ? '👑 最后一个词包也通关了，这套词你已经拿下了。'
      : '👑 终极混战也通关了，你是单词大炮大师！')
      : stars === 3 ? (adult ? '🌟 完美通关，零失误。' : '🌟 完美通关！一颗心都没掉！')
      : stars === 2 ? (adult ? '👍 不错，只掉了一颗心。' : '👍 太棒了，只掉了一颗心！')
      : (adult ? '过关了。看看生词再前进，星星会更多。' : '过关啦！下次少掉几颗心，星星会更多！'),
    stars,
    showBoard: false,
    showNext: !last,
    retryText: '再玩一次',
    words
  });
}

function levelFailed() {
  G.state = 'over';
  sfx.over();
  const collectible = G.entry.direction === 'recall' || G.entry.direction === 'dictation';
  if (collectible) reviewApply(G.missedWords, G.wrongWords, G.killedWords);
  const words = collectible ? collectWords() : null;
  openEnOver({
    greet: G.mode === 'review' ? '复习中断也没关系，词还留在本子里。'
      : G.mode === 'dictation' ? '听写中断没关系，没听出来的词已进错词本。'
      : G.pack.tone === 'adult' ? '别急，先看看本局生词，再来一定行。'
      : '💪 单词打进城堡啦…再来一次，一定能打光它们！',
    stars: 0,
    showBoard: false,
    showNext: false,
    retryText: G.mode === 'review' || G.mode === 'dictation' ? '再来一轮' : '再玩一次',
    words
  });
}

/* 结算面板生词区块：recall 关展示漏接/打错的词，可点击发音 */
function renderOverWords(words) {
  const board = document.getElementById('enWordsBoard');
  if (!board) return;
  if (words === null) { board.classList.add('hidden'); return; }   // 非词义关不展示
  board.classList.remove('hidden');
  const title = document.getElementById('enWordsTitle');
  const box = document.getElementById('enWords');
  if (!words.length) {
    title.textContent = '📖 本局生词';
    box.innerHTML = '<div class="word-empty">本局零生词，漂亮！</div>';
    return;
  }
  title.textContent = '📖 本局生词（' + words.length + '）';
  const canSpeak = typeof window.speechSynthesis !== 'undefined';
  box.innerHTML = words.map(e =>
    `<div class="word-row"><span class="ww">${e.w}</span>` +
    (e.ipa ? `<span class="wi">${e.ipa}</span>` : '') +
    (e.zh ? `<span class="wz">${e.zh}</span>` : '') +
    (canSpeak ? `<button class="wsay" data-say="${e.w}" title="朗读">🔊</button>` : '') +
    `</div>`).join('');
}

/* 朗读单词（浏览器原生语音合成，不可用时按钮本就不渲染） */
function speakWord(text) {
  if (typeof window.speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) {}
}

/* 结算面板通用填充/展示 */
function fillOverStats() {
  const mins = Math.max(G.playTime, 1) / 60;
  const wpm = Math.round((G.typedOk / 5) / mins);
  const acc = G.typedOk + G.mistakes > 0 ? Math.round(G.typedOk * 100 / (G.typedOk + G.mistakes)) : 0;
  document.getElementById('stScore').textContent = G.score;
  document.getElementById('stLevel').textContent = G.mode === 'review' || G.mode === 'dictation' ? G.kills
    : G.mode === 'level' ? G.levelIdx + 1 : G.mode === 'practice' ? G.rounds : G.level;
  document.getElementById('stLevelK').textContent = G.mode === 'review' ? '复习词数'
    : G.mode === 'dictation' ? '听写词数'
    : G.mode === 'practice' ? '完成轮数' : '关卡';
  document.getElementById('stAcc').textContent = acc + '%';
  document.getElementById('stCombo').textContent = G.bestCombo;
  document.getElementById('stWpm').textContent = wpm;
}
function openEnOver({ greet, stars = null, showBoard = false, showNext = false, retryText = '再来一局 ↻', showNew = false, words = null }) {
  document.getElementById('overGreet').textContent = greet;
  document.getElementById('newBest').style.display = showNew ? 'block' : 'none';
  const starsEl = document.getElementById('enStars');
  if (stars === null) { starsEl.style.display = 'none'; starsEl.innerHTML = ''; }
  else {
    starsEl.style.display = 'block';
    starsEl.innerHTML = [0, 1, 2].map(i =>
      `<i class="${i < stars ? 'on' : 'off'}" style="animation-delay:${(0.2 + i * 0.25).toFixed(2)}s">${i < stars ? '⭐' : '☆'}</i>`).join('');
  }
  document.getElementById('enBoard').classList.toggle('hidden', !showBoard);
  document.getElementById('nextBtn').classList.toggle('hidden', !showNext);
  document.getElementById('retryBtn').textContent = retryText;
  renderOverWords(words);
  fillOverStats();
  document.getElementById('enTopBtn').classList.add('hidden');
  document.getElementById('enOver').classList.remove('hidden');
}

function gameOver() {
  G.state = 'over';
  if (isLevelRun()) { levelFailed(); return; }
  if (G.mode === 'practice') { practiceOver(); return; }
  sfx.over();
  const rank = saveScore(G.score, G.level);
  let greet;
  if (rank === 0) greet = '🏆 太厉害了，刷新了最高纪录！';
  else if (rank > 0) greet = '🎉 进入荣耀榜第 ' + (rank + 1) + ' 名！';
  else if (G.level >= 5) greet = '⭐ 已经打到第 ' + G.level + ' 关啦，就差一点上榜！';
  else greet = '再来一次会更好！';
  renderBoard('overBoardRows', rank);
  const best = +(localStorage.getItem('typcannon_best') || 0);
  const isNew = G.score > best;
  if (isNew) localStorage.setItem('typcannon_best', G.score);
  openEnOver({ greet, stars: null, showBoard: true, showNext: false, retryText: '再来一局 ↻', showNew: isNew });
}

/* 开始游戏（无尽模式 / 闯关模式共用重置） */
function prepareRun() {
  G.state = 'playing';
  G.items = []; G.bullets = []; G.particles = []; G.floats = [];
  G.score = 0; G.kills = 0;
  G.combo = 0; G.bestCombo = 0; G.typedOk = 0; G.mistakes = 0;
  G.wrongWords = new Set(); G.missedWords = new Set(); G.killedWords = new Set();
  G.cleanKills = 0;
  G.spawnTimer = 0.5; G.playTime = 0; G.lock = null; G.toast = null;
  G.cannon.angle = -Math.PI / 2;
  document.getElementById('enMenu').classList.add('hidden');
  document.getElementById('enOver').classList.add('hidden');
  document.getElementById('enTopBtn').classList.remove('hidden');
  ensureAudio();
}
function startGame() {          // 🌪️ 无尽模式
  G.mode = 'endless';
  G.level = 1; G.lives = 5; G.killsNeeded = 8;
  prepareRun();
  G.toast = { text: '🌪️ 无尽模式', sub: '没有终点，越打越快，冲鸭！', t: 2.4 };
}
function enStartLevel(packId, idx) {   // 📖 闯关模式（按词包 + 关卡序）
  const pack = packById(packId);
  if (!pack || !pack.levels[idx]) return;
  G.mode = 'level';
  G.pack = pack;
  G.levelIdx = idx;
  G.entry = pack.levels[idx];
  G.level = 1; G.lives = 3; G.killsNeeded = G.entry.goal;
  prepareRun();
  const recall = G.entry.direction === 'recall';
  G.toast = { text: (G.entry.icon || pack.icon) + ' ' + G.entry.name,
    sub: recall ? '看中文释义，凭回忆拼出单词！' : '消灭 ' + G.entry.goal + ' 个单词就过关！', t: 2.6 };
}

/* 字母练习结算 */
function practiceOver() {
  G.state = 'over';
  sfx.over();
  const best = +(localStorage.getItem('typcannon_prac_best') || 0);
  const isNew = G.kills > best && G.kills > 0;
  if (isNew) localStorage.setItem('typcannon_prac_best', G.kills);
  let greet;
  if (isNew) greet = '🏆 打破纪录！这次一共打掉了 ' + G.kills + ' 个字母！';
  else if (G.rounds >= 2) greet = '⭐ 好厉害，完整打完了 ' + G.rounds + ' 轮字母表！';
  else if (G.kills > 0) greet = '💪 认识了 ' + G.kills + ' 个字母，再多练练就全认识啦！';
  else greet = '别灰心，看着掉下来的字母按键盘就好啦！';
  openEnOver({ greet, stars: null, showBoard: false, showNext: false, retryText: '再练一次', showNew: isNew });
}

function startPractice() {      // 🅰️ 字母练习
  G.mode = 'practice';
  G.level = 1; G.lives = 5; G.killsNeeded = 26; G.rounds = 0;
  prepareRun();
  G.toast = { text: '🅰️ 字母练习', sub: '掉下来是哪个字母，就按哪个键！', t: 2.6 };
}

/* ==================== 更新 ==================== */
function update(dt) {
  for (const c of G.clouds) { c.x += c.v * dt; if (c.x > W + 160) c.x = -160; }

  if (G.state !== 'playing') {
    updateParticles(dt);
    return;
  }
  G.playTime += dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  if (G.cannon.recoil > 0) G.cannon.recoil = Math.max(0, G.cannon.recoil - dt * 6);
  if (G.cannon.flash > 0) G.cannon.flash = Math.max(0, G.cannon.flash - dt * 6);
  if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }

  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    spawnItem();
    G.spawnTimer = enSpawn() * (0.85 + Math.random() * 0.3);
  }

  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    // 词条预展示期（recall/听写卡进入视野后 1.5 秒）：半速下坠；听写卡同时自动朗读一次
    if ((it.dir === 'recall' || it.dir === 'dictation') && !it.seen && it.y > 70) {
      it.seen = true; it.introT = 1.5;
      if (it.dir === 'dictation') speakWord(it.word);
    }
    const fall = it.introT > 0 ? it.vy * 0.45 : it.vy;
    it.y += fall * dt;
    if (it.introT > 0) it.introT -= dt;
    it.wobble += dt * 3;
    if (it.flash > 0) it.flash = Math.max(0, it.flash - dt);
    if (it.hitFlash > 0) it.hitFlash = Math.max(0, it.hitFlash - dt * 5);
    if (it.y > groundY - 26) loseLife(it);
  }

  const c = G.cannon;
  let targetAngle = -Math.PI / 2 + Math.sin(G.playTime * 1.2) * 0.08;
  if (G.lock) targetAngle = Math.atan2(G.lock.y - c.y, G.lock.x - c.x);
  let d = targetAngle - c.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  c.angle += d * Math.min(1, dt * 14);

  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    if (b.item && G.items.includes(b.item)) { b.tx = b.item.x; b.ty = b.item.y; }
    const dx = b.tx - b.x, dy = b.ty - b.y, dist = Math.hypot(dx, dy);
    const step = b.speed * dt;
    b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 6) b.trail.shift();
    if (dist <= step + 8) {
      if (b.item && G.items.includes(b.item)) b.item.hitFlash = 1;
      burst(b.tx, b.ty, ['#fde68a','#fbbf24'], 6, 90);
      G.bullets.splice(i, 1);
    } else {
      b.x += dx / dist * step; b.y += dy / dist * step;
    }
  }

  updateParticles(dt);
}

function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += 500 * dt;
    p.life -= dt;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.y -= 46 * dt; f.life -= dt * 0.9;
    if (f.life <= 0) G.floats.splice(i, 1);
  }
}

/* ==================== 绘制 ==================== */
function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#7dd3fc'); sky.addColorStop(0.7, '#bae6fd'); sky.addColorStop(1, '#e0f2fe');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fde047';
  ctx.beginPath(); ctx.arc(W - 110, 100, 46, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(253,224,71,.25)';
  ctx.beginPath(); ctx.arc(W - 110, 100, 66, 0, Math.PI * 2); ctx.fill();

  for (const c of G.clouds) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 22 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 26 * c.s, c.y - 10 * c.s, 18 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 52 * c.s, c.y, 20 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 26 * c.s, c.y + 10 * c.s, 22 * c.s, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#4ade80'; ctx.fillRect(0, groundY, W, H - groundY);
  ctx.fillStyle = '#22c55e'; ctx.fillRect(0, groundY, W, 10);
  ctx.fillStyle = 'rgba(0,0,0,.08)';
  for (let x = 0; x < W; x += 46) ctx.fillRect(x + (x % 92), groundY + 22, 20, 6);

  for (const it of G.items) drawItem(it);

  for (const b of G.bullets) {
    for (let i = 0; i < b.trail.length; i++) {
      ctx.fillStyle = `rgba(251,191,36,${(i + 1) / b.trail.length * 0.5})`;
      ctx.beginPath(); ctx.arc(b.trail[i].x, b.trail[i].y, 3 + i, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff7ed';
    ctx.beginPath(); ctx.arc(b.x - 2, b.y - 2, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  drawCannon();

  for (const p of G.particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const f of G.floats) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.font = `bold ${f.size}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
  if (G.state === 'playing' || G.state === 'paused') drawHUD();
  if (G.state === 'paused') {
    ctx.fillStyle = 'rgba(15,30,60,.55)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = 'bold 46px "Segoe UI", sans-serif';
    ctx.fillText('⏸ 已暂停', W / 2, H / 2 - 10);
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('按 P 继续', W / 2, H / 2 + 32);
  }
}

/* 词义回忆卡 / 听写卡：常态显示释义（听写为喇叭提示）+ 字母进度槽；
   词义卡预展示期显示单词/音标/释义，听写卡只显示喇叭与重听提示 */
function drawRecallCard(it, isLocked) {
  const intro = it.introT > 0;
  const dict = it.dir === 'dictation';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // 释义字号自适应：超宽逐级缩小，最低 11px（听写卡不显示释义，跳过）
  let zhSize = 15;
  ctx.font = zhSize + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
  const maxTextW = Math.min(W - 160, 240);
  if (it.zh && !dict) while (ctx.measureText(it.zh).width > maxTextW && zhSize > 11) {
    zhSize--;
    ctx.font = zhSize + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
  }
  const zhW = it.zh && !dict ? ctx.measureText(it.zh).width : 0;

  ctx.font = 'bold 19px Consolas, "Courier New", monospace';
  const wordW = dict ? 0 : ctx.measureText(it.word).width;
  const slotW = it.word.length * 14;
  const cw = Math.max(wordW + 30, zhW + 26, slotW + 28, dict ? 132 : 118);
  const chh = intro ? 96 : 66;
  const top = -46;

  if (isLocked) {
    ctx.strokeStyle = 'rgba(56,189,248,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -14, Math.max(cw, chh) / 2 + 10, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.fillStyle = isLocked ? 'rgba(255,255,255,.96)' : 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.roundRect(-cw / 2, top, cw, chh, 12); ctx.fill();
  ctx.strokeStyle = isLocked ? '#0ea5e9' : 'rgba(148,163,184,.65)';
  ctx.lineWidth = 2; ctx.stroke();
  if (it.flash > 0) {   // 打错闪红
    ctx.globalAlpha = it.flash * 0.35;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.roundRect(-cw / 2, top, cw, chh, 12); ctx.fill();
    ctx.globalAlpha = 1;
  }

  const MONO = 'Consolas, "Courier New", monospace';
  const CN = '"Microsoft YaHei", "PingFang SC", sans-serif';
  if (dict) {
    // 听写卡：不出现单词/音标/释义，只有喇叭与重听提示
    ctx.fillStyle = '#0284c7'; ctx.font = intro ? '44px "Segoe UI Emoji", sans-serif' : '26px "Segoe UI Emoji", sans-serif';
    ctx.fillText('🔊', 0, top + (intro ? 38 : 20));
    ctx.fillStyle = '#94a3b8'; ctx.font = '12px ' + CN;
    ctx.fillText(intro ? '正在朗读，请听…' : '点击气泡重听', 0, top + (intro ? 74 : 20));
  } else if (intro) {
    ctx.fillStyle = '#0f172a'; ctx.font = 'bold 19px ' + MONO;
    ctx.fillText(it.word, 0, top + 18);
    if (it.ipa) { ctx.fillStyle = '#64748b'; ctx.font = '13px ' + MONO; ctx.fillText(it.ipa, 0, top + 40); }
    if (it.zh) { ctx.fillStyle = '#334155'; ctx.font = zhSize + 'px ' + CN; ctx.fillText(it.zh, 0, top + 68); }
  } else {
    if (it.zh) { ctx.fillStyle = '#334155'; ctx.font = zhSize + 'px ' + CN; ctx.fillText(it.zh, 0, top + 18); }
    // 字母进度槽：已打绿色、待打灰色下划线、当前锁定字母黄色高亮
    ctx.font = 'bold 17px ' + MONO;
    const startX = -((it.word.length - 1) * 14) / 2;
    for (let i = 0; i < it.word.length; i++) {
      const x = startX + i * 14;
      if (i < it.typed) {
        ctx.fillStyle = '#16a34a';
        ctx.fillText(it.word[i], x, top + 46);
      } else if (i === it.typed && isLocked) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(x - 7, top + 36, 14, 20);
        ctx.fillStyle = '#1e293b';
        ctx.fillText(it.word[i], x, top + 46);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('_', x, top + 48);
      }
    }
  }
}

function drawItem(it) {
  const wob = Math.sin(it.wobble) * 3;
  ctx.save();
  ctx.translate(it.x + wob, it.y);

  const isLocked = G.lock === it;
  if (isLocked) {
    ctx.strokeStyle = 'rgba(56,189,248,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -14, 42, 0, Math.PI * 2); ctx.stroke();
  }
  if (it.hitFlash > 0) {
    ctx.globalAlpha = it.hitFlash * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -14, 44, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (it.dir === 'recall' || it.dir === 'dictation') {
    drawRecallCard(it, isLocked);
  } else if (it.emoji) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pop = 1 + it.hitFlash * 0.25;
    ctx.fillStyle = isLocked ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.78)';
    ctx.beginPath(); ctx.arc(0, -16, 33 * pop, 0, Math.PI * 2); ctx.fill();
    if (isLocked) {
      ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, -16, 33 * pop, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.font = `${Math.round(40 * pop)}px "Segoe UI Emoji","Apple Color Emoji","Segoe UI Symbol",sans-serif`;
    ctx.fillText(it.emoji, 0, -16);

    ctx.font = 'bold 21px Consolas, "Courier New", monospace';
    const tw = ctx.measureText(it.word).width;
    const cw = Math.max(tw + 26, 80), chh = 32;
    const flash = it.flash > 0;
    ctx.fillStyle = flash ? 'rgba(239,68,68,.92)' : (isLocked ? 'rgba(15,30,60,.88)' : 'rgba(15,30,60,.62)');
    ctx.beginPath(); ctx.roundRect(-cw / 2, 8, cw, chh, 10); ctx.fill();

    const total = ctx.measureText(it.word).width;
    let cx = -total / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let i = 0; i < it.word.length; i++) {
      const ch = it.word[i];
      const chw = ctx.measureText(ch).width;
      if (i < it.typed) {
        ctx.fillStyle = flash ? '#fecaca' : '#4ade80';
        ctx.fillText(ch, cx, 25);
      } else if (i === it.typed && isLocked) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(cx - 1, 12, chw + 2, 24);
        ctx.fillStyle = '#1e293b';
        ctx.fillText(ch, cx, 25);
      } else {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillText(ch, cx, 25);
      }
      cx += chw;
    }
  } else {
    // 字母练习：彩色大字母牌，打错时牌面闪红
    const hue = (it.word.charCodeAt(0) - 97) * 360 / 26;
    const pop = 1 + it.hitFlash * 0.2;
    const wrong = it.flash > 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = isLocked ? '#ffffff' : `hsla(${hue},82%,92%,.95)`;
    ctx.beginPath(); ctx.arc(0, -16, 32 * pop, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = wrong ? '#ef4444' : (isLocked ? `hsl(${hue},75%,50%)` : `hsla(${hue},62%,66%,.95)`);
    ctx.beginPath(); ctx.arc(0, -16, 32 * pop, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = wrong ? '#dc2626' : `hsl(${hue},62%,33%)`;
    ctx.font = `bold ${Math.round(34 * pop)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(it.word.toUpperCase(), 0, -16);
  }
  ctx.restore();
}

function drawCannon() {
  const c = G.cannon;
  ctx.save();
  ctx.translate(c.x, c.y);

  ctx.fillStyle = '#334155';
  ctx.beginPath(); ctx.roundRect(-34, -16, 68, 24, 10); ctx.fill();
  ctx.fillStyle = '#1e293b';
  for (let i = -24; i <= 24; i += 12) { ctx.beginPath(); ctx.arc(i, -4, 6, 0, Math.PI * 2); ctx.fill(); }

  ctx.save();
  ctx.rotate(c.angle);
  const recoil = c.recoil * 8;
  ctx.fillStyle = '#475569';
  ctx.beginPath(); ctx.roundRect(6 - recoil, -9, 52, 18, 8); ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.beginPath(); ctx.roundRect(44 - recoil, -11, 14, 22, 5); ctx.fill();
  if (c.flash > 0) {
    ctx.globalAlpha = c.flash;
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(62 - recoil, 0, 12 * c.flash + 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.fillStyle = '#64748b';
  ctx.beginPath(); ctx.arc(0, -14, 20, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath(); ctx.arc(0, -14, 12, Math.PI, 0); ctx.fill();

  ctx.restore();
}

function drawHUD() {
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = 'bold 26px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(15,30,60,.85)';
  ctx.fillText('🏆 ' + G.score, 104, 14);  // x 起点 104 避开左上角平台返回按钮

  ctx.textAlign = 'center';
  ctx.font = 'bold 22px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(15,30,60,.85)';
  if (isLevelRun()) ctx.fillText((G.entry.direction === 'recall' ? '🧠 ' : G.entry.icon + ' ') + G.entry.name, W / 2, 16);
  else if (G.mode === 'practice') ctx.fillText('🅰️ 字母练习 · 第 ' + Math.max(1, G.rounds + 1) + ' 轮', W / 2, 16);
  else ctx.fillText('第 ' + G.level + ' 关', W / 2, 16);
  const bw = 150;
  const prog = G.mode === 'practice' ? (G.kills % 26) / 26 : Math.min(1, G.kills / G.killsNeeded);
  ctx.fillStyle = 'rgba(15,30,60,.25)';
  ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, 46, bw, 8, 4); ctx.fill();
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, 46, bw * prog, 8, 4); ctx.fill();

  ctx.textAlign = 'right';
  ctx.font = '22px "Segoe UI Emoji", sans-serif';
  let hearts = '';
  const hSlots = isLevelRun() ? 3 : 5;   // 闯关/复习/听写都是 3 心
  for (let i = 0; i < hSlots; i++) hearts += i < G.lives ? '❤️' : '🖤';
  ctx.fillText(hearts, W - 128, 14);  // 避开右上角"回菜单"按钮

  if (G.combo >= 3) {
    ctx.textAlign = 'center';
    const s = Math.min(1.3, 1 + G.combo * 0.015);
    ctx.font = `bold ${Math.round(20 * s)}px "Segoe UI", sans-serif`;
    ctx.fillStyle = G.combo >= 10 ? '#f59e0b' : '#0284c7';
    ctx.fillText(G.combo + ' 连击!', W / 2, 70);
  }

  if (G.toast) {
    ctx.globalAlpha = Math.min(1, G.toast.t * 2);
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px "Segoe UI", sans-serif';
    ctx.lineWidth = 6; ctx.strokeStyle = '#fff';
    ctx.strokeText(G.toast.text, W / 2, H / 2 - 110);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(G.toast.text, W / 2, H / 2 - 110);
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillStyle = '#334155';
    ctx.fillText(G.toast.sub, W / 2, H / 2 - 66);
    ctx.globalAlpha = 1;
  }
}

/* 命中检测：返回覆盖点 (x,y) 的未打完掉落物（绘制在上的优先），供点击手动锁定 */
function pickTargetAt(x, y) {
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    if (it.typed >= it.word.length) continue;
    if (it.dir === 'recall' || it.dir === 'dictation') {
      // 词义卡/听写卡是宽矩形（中心 y-13，宽自适应取保守值）
      if (Math.abs(x - it.x) <= 72 && Math.abs(y - (it.y - 13)) <= 48) return it;
    } else {
      // 气泡/字母牌是圆形（圆心 y-16，半径约 33）
      if (Math.hypot(x - it.x, y - (it.y - 16)) <= 46) return it;
    }
  }
  return null;
}

/* ==================== 主循环 ==================== */
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ==================== 英语模式按键处理 ==================== */
const mobileInput = document.getElementById('mobileInput');
let usingTouch = false;
let lastTypingKeyAt = -1e4;
window.addEventListener('touchstart', () => { usingTouch = true; }, { passive: true });

function typingKey(e) {
  // Esc / Backspace：放弃当前正在打的单词
  if (e.key === 'Escape' || e.key === 'Backspace') {
    if (G.state === 'playing' && G.lock) { G.lock.typed = 0; G.lock = null; }
    e.preventDefault(); return;
  }
  // F1 暂停 / F2 静音（不能用字母键当功能键，否则 p/m 开头的单词永远打不出）
  if (e.key === 'F1') {
    e.preventDefault();
    if (G.state === 'playing') G.state = 'paused';
    else if (G.state === 'paused') G.state = 'playing';
    return;
  }
  if (e.key === 'F2') { e.preventDefault(); muted = !muted; return; }
  // 只处理字母；忽略按住不放的重复按键
  if (G.state === 'playing' && /^[a-zA-Z]$/.test(e.key) && !e.repeat) {
    handleChar(e.key.toLowerCase());
    lastTypingKeyAt = performance.now();
    e.preventDefault();
  }
}

// 触屏软键盘支持（与物理键盘重复触发时自动去重）
mobileInput.addEventListener('input', () => {
  if (G.state !== 'playing') { mobileInput.value = ''; return; }
  const v = mobileInput.value;
  if (v.length) {
    if (performance.now() - lastTypingKeyAt > 80) handleChar(v[v.length - 1].toLowerCase());
    mobileInput.value = '';
  }
});
canvas.addEventListener('pointerdown', (e) => {
  if (G.state !== 'playing') return;
  // 点击气泡手动切换锁定目标（首字母重复时的兜底选择手段）
  const hit = pickTargetAt(e.clientX, e.clientY);
  if (hit && hit !== G.lock) { G.lock = hit; hit.hitFlash = 0.6; }
  if (hit && hit.dir === 'dictation') speakWord(hit.word);   // 听写卡：点击重听
  if (usingTouch) mobileInput.focus();
});

/* ==================== 按键总调度 ==================== */
window.addEventListener('keydown', (e) => { typingKey(e); });
window.addEventListener('blur', () => { if (G.state === 'playing') G.state = 'paused'; });

/* ==================== 按钮事件 ==================== */
document.getElementById('enToHub').addEventListener('click', goHub);
document.getElementById('overToMenu').addEventListener('click', showEnMenu);
document.getElementById('overToHub').addEventListener('click', goHub);
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('practiceBtn').addEventListener('click', startPractice);
document.getElementById('reviewBtn').addEventListener('click', () => { if (reviewCount()) startReview(); });
document.getElementById('nextBtn').addEventListener('click', () => {
  if (G.levelIdx < G.pack.levels.length - 1) enStartLevel(G.pack.id, G.levelIdx + 1);
});
document.getElementById('retryBtn').addEventListener('click', () => {
  if (G.mode === 'review') startReview();
  else if (G.mode === 'dictation') startDictation(G.pack.id);
  else if (G.mode === 'level') enStartLevel(G.pack.id, G.levelIdx);
  else if (G.mode === 'practice') startPractice();
  else startGame();
});
document.getElementById('enTopBtn').addEventListener('click', showEnMenu);
document.getElementById('enGrid').addEventListener('click', e => {
  const d = e.target.closest('.en-dictation-btn');
  if (d) { startDictation(d.dataset.pack); return; }
  const c = e.target.closest('.en-level-card');
  if (c && !c.disabled) enStartLevel(c.dataset.pack, +c.dataset.i);
});
/* 结算生词：点击 🔊 朗读 */
document.getElementById('enWords').addEventListener('click', e => {
  const b = e.target.closest('.wsay');
  if (b) speakWord(b.dataset.say);
});

/* ==================== 英语荣耀榜 ==================== */
const TOP_KEY = 'typcannon_top3';
function loadTop() {
  try { return JSON.parse(localStorage.getItem(TOP_KEY)) || []; } catch (e) { return []; }
}
function saveScore(score, level) {
  if (score <= 0) return -1;
  const list = loadTop();
  const entry = { score, level, date: new Date().toLocaleDateString('zh-CN') };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const rank = list.indexOf(entry);
  localStorage.setItem(TOP_KEY, JSON.stringify(list.slice(0, 3)));
  return rank < 3 ? rank : -1;
}
function medal(i) { return ['🥇', '🥈', '🥉'][i] || (i + 1) + '.'; }
function renderBoard(elId, highlight = -1) {
  const box = document.getElementById(elId);
  if (!box) return;
  const list = loadTop();
  if (!list.length) {
    box.innerHTML = '<div class="empty">虚位以待，快去创造第一个纪录吧！</div>';
    return;
  }
  box.innerHTML = list.map((e, i) =>
    `<div class="row${i === highlight ? ' me' : ''}">` +
    `<span class="medal">${medal(i)}</span><span class="num">${e.score} 分</span>` +
    `<span class="lv">第 ${e.level} 关</span><span class="date">${e.date}</span></div>`
  ).join('');
}
renderBoard('menuBoardRows');

/* 首屏：直接落在选关菜单 */
showEnMenu();

/* 供 smoke test 校验词包与内部状态 */
window.TypingCannon = { WordPacks: PACKS, state: G, save: enSave, review: reviewBook, dictationAvailable };
