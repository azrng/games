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
  if (G) { G.cannon.x = W / 2; G.cannon.y = groundY; }
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

/* ---- 词库：12 个主题关卡 ---- */
// 每关：name 名称 / icon 图标 / fall 掉落速度(px/s) / spawn 出生间隔(秒) / goal 击杀目标数 / words [单词, emoji]
const THEMES = [
  { name: '短词热身', icon: '🌱', fall: 32, spawn: 3.2, goal: 8, words: [
    ['egg','🥚'],['cat','🐱'],['dog','🐶'],['sun','☀️'],['bus','🚌'],['hat','🎩'],['key','🔑'],['cup','☕'] ] },
  { name: '天天见', icon: '🌟', fall: 36, spawn: 3.0, goal: 8, words: [
    ['star','⭐'],['fish','🐟'],['book','📕'],['ball','⚽'],['moon','🌙'],['tree','🌳'],['bird','🐦'],['milk','🥛'] ] },
  { name: '水果派对', icon: '🍎', fall: 40, spawn: 2.9, goal: 8, words: [
    ['apple','🍎'],['orange','🍊'],['lemon','🍋'],['grape','🍇'],['cherry','🍒'],['peach','🍑'],['kiwi','🥝'],['melon','🍈'] ] },
  { name: '动物小窝', icon: '🐾', fall: 44, spawn: 2.9, goal: 8, words: [
    ['panda','🐼'],['tiger','🐯'],['rabbit','🐰'],['mouse','🐭'],['monkey','🐵'],['duck','🦆'],['frog','🐸'],['bear','🐻'] ] },
  { name: '甜点时刻', icon: '🍰', fall: 48, spawn: 2.7, goal: 8, words: [
    ['cake','🍰'],['bread','🍞'],['candy','🍬'],['donut','🍩'],['pizza','🍕'],['cookie','🍪'],['honey','🍯'],['fries','🍟'] ] },
  { name: '我的小家', icon: '🏠', fall: 52, spawn: 2.7, goal: 8, words: [
    ['house','🏠'],['door','🚪'],['sofa','🛋️'],['phone','📱'],['clock','🕐'],['light','💡'],['bed','🛏️'],['radio','📻'] ] },
  { name: '快车出发', icon: '🚗', fall: 56, spawn: 2.5, goal: 8, words: [
    ['car','🚗'],['bike','🚲'],['ship','🚢'],['train','🚂'],['boat','⛵'],['plane','✈️'],['truck','🚚'],['jeep','🚙'] ] },
  { name: '穿衣打扮', icon: '👕', fall: 60, spawn: 2.5, goal: 8, words: [
    ['cap','🧢'],['coat','🧥'],['shoe','👟'],['sock','🧦'],['glove','🧤'],['scarf','🧣'],['dress','👗'],['pants','👖'] ] },
  { name: '自然风光', icon: '🌈', fall: 64, spawn: 2.3, goal: 8, words: [
    ['flower','🌸'],['cloud','☁️'],['water','💧'],['rain','🌧️'],['snow','❄️'],['wind','💨'],['grass','🌿'],['mountain','⛰️'] ] },
  { name: '太空漫游', icon: '🚀', fall: 68, spawn: 2.3, goal: 8, words: [
    ['rocket','🚀'],['planet','🪐'],['robot','🤖'],['alien','👽'],['comet','☄️'],['space','🌌'],['earth','🌍'],['moon','🌙'] ] },
  { name: '巨型怪物', icon: '🦖', fall: 64, spawn: 2.7, goal: 8, words: [
    ['elephant','🐘'],['dinosaur','🦕'],['umbrella','☂️'],['butterfly','🦋'],['pineapple','🍍'],['strawberry','🍓'],['crocodile','🐊'],['watermelon','🍉'] ] },
  { name: '终极混战', icon: '👑', fall: 82, spawn: 1.9, goal: 12, words: [] }
];
// 终极混战 = 前 11 关全部单词（去重）大乱斗
const MIX_POOL = [...new Map(THEMES.slice(0, 11).flatMap(t => t.words).map(w => [w[0], w])).values()];
THEMES[11].words = MIX_POOL;

/* ---- 英语闯关存档（星星） ---- */
const EN_SAVE_KEY = 'typcannonLevelsV1';
let enSave = { stars: {} };
try { const s = JSON.parse(localStorage.getItem(EN_SAVE_KEY) || 'null'); if (s && typeof s === 'object') enSave = Object.assign(enSave, s); } catch (e) {}
function enPersist() { try { localStorage.setItem(EN_SAVE_KEY, JSON.stringify(enSave)); } catch (e) {} }
function enUnlocked(i) { return i === 0 || (enSave.stars[i - 1] || 0) > 0; }
function enStarTotal() { return Object.values(enSave.stars).reduce((a, b) => a + b, 0); }

/* ---- 英语选关界面 ---- */
const EN_GROUPS = [[0, '🌱 入门（第1~3关）'], [3, '🌟 成长（第4~6关）'], [6, '🚀 冒险（第7~9关）'], [9, '👑 终极（第10~12关）']];
function renderEnHome() {
  document.getElementById('enStarTotal').textContent = '⭐ ' + enStarTotal() + '/' + (THEMES.length * 3);
  const best = +(localStorage.getItem('typcannon_best') || 0);
  document.getElementById('enBest').textContent = best > 0 ? best : '—';
  const pb = +(localStorage.getItem('typcannon_prac_best') || 0);
  document.getElementById('enPracBest').textContent = pb > 0 ? pb + ' 个' : '—';
  let html = '';
  for (const [start, label] of EN_GROUPS) {
    html += `<div class="en-group-label">${label}</div><div class="en-level-row">`;
    for (let i = start; i < start + 3; i++) {
      const t = THEMES[i], st = enSave.stars[i] || 0, lock = !enUnlocked(i);
      html += `<button class="en-level-card" data-i="${i}" ${lock ? 'disabled' : ''}>` +
        `<span class="en-lc-icon">${lock ? '🔒' : t.icon}</span>` +
        `<span class="en-lc-name">${i + 1}.${t.name}</span>` +
        `<span class="en-lc-stars">${[0, 1, 2].map(k => `<i class="${k < st ? 'on' : ''}">⭐</i>`).join('')}</span>` +
        `</button>`;
    }
    html += '</div>';
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
  levelIdx: 0, theme: THEMES[0], rounds: 0,
  items: [], bullets: [], particles: [], floats: [],
  clouds: [],
  score: 0, lives: 5, level: 1, kills: 0, killsNeeded: 8,
  combo: 0, bestCombo: 0, typedOk: 0, mistakes: 0,
  spawnTimer: 0, playTime: 0, lock: null,
  cannon: { x: 0, y: 0, angle: -Math.PI / 2, recoil: 0, flash: 0 },
  shake: 0, toast: null, startTime: 0
};
resize();

for (let i = 0; i < 6; i++) {
  G.clouds.push({ x: Math.random() * 1600, y: 40 + Math.random() * 160,
    s: 0.6 + Math.random() * 0.9, v: 8 + Math.random() * 14 });
}

/* 掉落难度（闯关模式用主题自带参数；无尽模式随关卡提速；字母练习随时间轻微提速） */
const wordSpeedScale = () => 1 + Math.random() * (G.mode === 'level' ? 0.12 : G.mode === 'practice' ? 0.18 : 0.35);
const enFall = () => G.mode === 'level' ? G.theme.fall
  : G.mode === 'practice' ? Math.min(115, 82 + G.playTime * 0.6)
  : Math.min(120, 26 + G.level * 14);       // px/s
const enSpawn = () => G.mode === 'level' ? G.theme.spawn
  : G.mode === 'practice' ? Math.max(0.85, 1.45 - G.playTime * 0.004)
  : Math.max(0.45, 1.9 - G.level * 0.16); // 秒
const enUnlockTier = () => Math.min(THEMES.length - 1, Math.floor(G.level * 1.2)); // 无尽模式词表随关卡解锁

// 字母练习：A~Z 单个字母（emoji 为 null 表示按字母牌绘制）
const LETTER_POOL = 'abcdefghijklmnopqrstuvwxyz'.split('').map(ch => [ch, null]);

function pickWord() {
  const poolAll = G.mode === 'level' ? G.theme.words
    : G.mode === 'practice' ? LETTER_POOL
    : THEMES.slice(0, enUnlockTier() + 1).flatMap(t => t.words);
  let pool = poolAll.filter(w => !G.items.some(it => it.word === w[0]));
  if (!pool.length) pool = poolAll;
  const p = pool[Math.floor(Math.random() * pool.length)];
  return { word: p[0], emoji: p[1] };
}

function spawnItem() {
  const { word, emoji } = pickWord();
  let x = 0, tries = 0;
  do {
    x = 60 + Math.random() * (W - 120);
    tries++;
  } while (tries < 12 && G.items.some(it => Math.abs(it.x - x) < 95));
  G.items.push({
    word, emoji, x, y: -50,
    vy: enFall() * wordSpeedScale(),
    typed: 0, flash: 0, hitFlash: 0, wobble: Math.random() * Math.PI * 2
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
   3. 全部不匹配才判为错误按键。 */
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
  const gain = 30 + it.word.length * 12 + Math.min(G.combo, 20) * 3;
  G.score += gain;
  floatText(it.x, it.y - 10, '+' + gain, '#f59e0b', 24);
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
  G.lives--;
  G.combo = 0;
  G.shake = 12;
  burst(it.x, groundY, ['#ef4444','#f97316','#94a3b8'], 30, 220);
  floatText(it.x, groundY - 40, '💥', '#ef4444', 30);
  sfx.hurt();
  if (G.lives <= 0) gameOver();
}

/* 闯关成功：按剩余生命结算 1~3 星，解锁下一关 */
function levelClear() {
  G.state = 'over';
  sfx.levelup();
  burst(W / 2, H / 2 - 60, ['#38bdf8', '#818cf8', '#f472b6', '#facc15', '#4ade80'], 60, 420);
  const stars = G.lives;                       // 过关时至少剩 1 颗心
  const prev = enSave.stars[G.levelIdx] || 0;
  enSave.stars[G.levelIdx] = Math.max(prev, stars);
  enPersist();
  const last = G.levelIdx === THEMES.length - 1;
  openEnOver({
    greet: last ? '👑 终极混战也通关了，你是单词大炮大师！'
      : stars === 3 ? '🌟 完美通关！一颗心都没掉！'
      : stars === 2 ? '👍 太棒了，只掉了一颗心！'
      : '过关啦！下次少掉几颗心，星星会更多！',
    stars,
    showBoard: false,
    showNext: !last,
    retryText: '再玩一次'
  });
}

function levelFailed() {
  G.state = 'over';
  sfx.over();
  openEnOver({
    greet: '💪 单词打进城堡啦…再来一次，一定能打光它们！',
    stars: 0,
    showBoard: false,
    showNext: false,
    retryText: '再玩一次'
  });
}

/* 结算面板通用填充/展示 */
function fillOverStats() {
  const mins = Math.max(G.playTime, 1) / 60;
  const wpm = Math.round((G.typedOk / 5) / mins);
  const acc = G.typedOk + G.mistakes > 0 ? Math.round(G.typedOk * 100 / (G.typedOk + G.mistakes)) : 0;
  document.getElementById('stScore').textContent = G.score;
  document.getElementById('stLevel').textContent = G.mode === 'level' ? G.levelIdx + 1 : G.mode === 'practice' ? G.rounds : G.level;
  document.getElementById('stLevelK').textContent = G.mode === 'practice' ? '完成轮数' : '关卡';
  document.getElementById('stAcc').textContent = acc + '%';
  document.getElementById('stCombo').textContent = G.bestCombo;
  document.getElementById('stWpm').textContent = wpm;
}
function openEnOver({ greet, stars = null, showBoard = false, showNext = false, retryText = '再来一局 ↻', showNew = false }) {
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
  fillOverStats();
  document.getElementById('enTopBtn').classList.add('hidden');
  document.getElementById('enOver').classList.remove('hidden');
}

function gameOver() {
  G.state = 'over';
  if (G.mode === 'level') { levelFailed(); return; }
  if (G.mode === 'practice') { practiceOver(); return; }
  sfx.over();
  const rank = saveScore(G.score, G.level);
  let greet;
  if (rank === 0) greet = '🏆 王乐乐太厉害了，刷新了最高纪录！';
  else if (rank > 0) greet = '🎉 王乐乐进入了荣耀榜第 ' + (rank + 1) + ' 名！';
  else if (G.level >= 5) greet = '⭐ 王乐乐都打到第 ' + G.level + ' 关啦，就差一点上榜！';
  else greet = '王乐乐，再来一次会更好！';
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
function enStartLevel(idx) {    // 📖 闯关模式
  G.mode = 'level';
  G.levelIdx = idx;
  G.theme = THEMES[idx];
  G.level = 1; G.lives = 3; G.killsNeeded = G.theme.goal;
  prepareRun();
  G.toast = { text: G.theme.icon + ' ' + G.theme.name, sub: '消灭 ' + G.theme.goal + ' 个单词就过关！', t: 2.6 };
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
  else greet = '王乐乐别灰心，看着掉下来的字母按键盘就好啦！';
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
    it.y += it.vy * dt;
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

  if (it.emoji) {
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
  ctx.fillText('🏆 ' + G.score, 20, 14);

  ctx.textAlign = 'center';
  ctx.font = 'bold 22px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(15,30,60,.85)';
  if (G.mode === 'level') ctx.fillText(G.theme.icon + ' ' + G.theme.name, W / 2, 16);
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
  const hSlots = G.mode === 'level' ? 3 : 5;
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

/* ==================== 主循环 ==================== */
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;
  if (canvas.style.display !== 'none') {
    update(dt);
    draw();
  }
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
canvas.addEventListener('pointerdown', () => {
  if (G.state === 'playing' && usingTouch) mobileInput.focus();
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
document.getElementById('nextBtn').addEventListener('click', () => {
  if (G.levelIdx < THEMES.length - 1) enStartLevel(G.levelIdx + 1);
});
document.getElementById('retryBtn').addEventListener('click', () => {
  if (G.mode === 'level') enStartLevel(G.levelIdx);
  else if (G.mode === 'practice') startPractice();
  else startGame();
});
document.getElementById('enTopBtn').addEventListener('click', showEnMenu);
document.getElementById('enGrid').addEventListener('click', e => {
  const c = e.target.closest('.en-level-card');
  if (c && !c.disabled) enStartLevel(+c.dataset.i);
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

/* 供 smoke test 校验词库与内部状态 */
window.TypingCannon = { THEMES: THEMES, state: G, save: enSave };
