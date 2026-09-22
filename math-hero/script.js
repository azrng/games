"use strict";
/* ==================== 数学 · 小勇士（IIFE 隔离，避免与英语模块命名冲突） ==================== */
(() => {
'use strict';

/* 返回平台首页：原三合一大菜单拆分后，"主菜单"指向游戏平台入口页 */
function goHub() { location.href = '../index.html'; }
const $m = s => document.querySelector(s);
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = a => a[rnd(0, a.length - 1)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function dateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------- 存档 ---------------- */
const SAVE_KEY = 'mathHeroSaveV1';
let save = { stars: {}, sound: true, speech: false, seenTip: false, daily: {} };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (s && typeof s === 'object') save = Object.assign(save, s);
} catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
function unlocked(i) { return i === 0 || (save.stars[i - 1] || 0) > 0; }

/* ---------------- 题目生成 ---------------- */
// 每个生成器返回 { text: 算式, ans: 正确答案 }
function Q(text, ans) { return { text, ans }; }
function genAdd10() { const a = rnd(1, 9), b = rnd(1, 10 - a); return Q(`${a} + ${b}`, a + b); }
function genSub10() { const a = rnd(1, 10), b = rnd(1, a); return Q(`${a} − ${b}`, a - b); }
function genMix10() { return Math.random() < .5 ? genAdd10() : genSub10(); }
function genAdd20() {
  if (Math.random() < .6) { const a = rnd(3, 9), b = rnd(11 - a, 20 - a); return Q(`${a} + ${b}`, a + b); }
  const a = rnd(2, 9), b = rnd(2, 20 - a); return Q(`${a} + ${b}`, a + b);
}
function genSub20() { const a = rnd(11, 18), b = rnd(a - 9, 9); return Q(`${a} − ${b}`, a - b); }
function genMix20() { return Math.random() < .5 ? genAdd20() : genSub20(); }
function genMul15() { const a = rnd(2, 5), b = rnd(2, 9); return Q(`${a} × ${b}`, a * b); }
function genMul69() { const a = rnd(6, 9), b = rnd(2, 9); return Q(`${a} × ${b}`, a * b); }
function genDiv() { const d = rnd(2, 9), t = rnd(2, 9); return Q(`${d * t} ÷ ${d}`, t); }
function genAdd100() { const a = rnd(11, 79), b = rnd(11, 100 - a); return Q(`${a} + ${b}`, a + b); }
function genSub100() { const a = rnd(31, 99), b = rnd(11, a - 10); return Q(`${a} − ${b}`, a - b); }
function genMixBig() {
  const r = Math.random();
  if (r < .35) { const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 30); return Q(`${a} × ${b} + ${c}`, a * b + c); }
  if (r < .6) { const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, a * b - 1); return Q(`${a} × ${b} − ${c}`, a * b - c); }
  if (r < .8) { const a = rnd(11, 49), b = rnd(11, 49), c = rnd(2, 20); return Q(`${a} + ${b} − ${c}`, a + b - c); }
  const a = rnd(21, 60), b = rnd(2, 20), c = rnd(2, 20); return Q(`${a} − ${b} + ${c}`, a - b + c);
}

const LEVELS = [
  { name: '10以内加法',  icon: '➕', gen: genAdd10,  count: 3, speed: 7,    goal: 8 },
  { name: '10以内减法',  icon: '➖', gen: genSub10,  count: 3, speed: 7,    goal: 8 },
  { name: '10以内混合',  icon: '🎈', gen: genMix10,  count: 3, speed: 7.5,  goal: 8 },
  { name: '20以内加法',  icon: '🧮', gen: genAdd20,  count: 3, speed: 8,    goal: 9 },
  { name: '20以内减法',  icon: '🪄', gen: genSub20,  count: 3, speed: 8,    goal: 9 },
  { name: '20以内混合',  icon: '⚡', gen: genMix20,  count: 4, speed: 8.5,  goal: 9 },
  { name: '乘法口诀1~5', icon: '✖️', gen: genMul15,  count: 3, speed: 8.5,  goal: 10 },
  { name: '乘法口诀6~9', icon: '🔥', gen: genMul69,  count: 4, speed: 9,    goal: 10 },
  { name: '表内除法',    icon: '🍎', gen: genDiv,    count: 4, speed: 9,    goal: 10 },
  { name: '两位数加法',  icon: '🚀', gen: genAdd100, count: 3, speed: 9.5,  goal: 10 },
  { name: '两位数减法',  icon: '🎯', gen: genSub100, count: 3, speed: 9.5,  goal: 10 },
  { name: '混合大挑战',  icon: '👑', gen: genMixBig, count: 4, speed: 10.5, goal: 12 }
];
const GROUPS = [[0, '🌱 入门（第1~3关）'], [3, '🚀 进阶（第4~6关）'], [6, '✖️ 乘除法（第7~9关）'], [9, '🏆 大挑战（第10~12关）']];
const MONSTERS = ['👾', '🐙', '👻', '🤖', '👹', '🐸', '🦊', '🐷', '🐲', '🦖', '🐵', '🦉'];

/* ---------------- 音效（Web Audio 合成） ---------------- */
let ac = null;
function initAudio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (ac && ac.state === 'suspended') ac.resume();
}
document.addEventListener('pointerdown', initAudio);
function tone(freq, dur, opt = {}) {
  if (!save.sound || !ac) return;
  const { type = 'sine', delay = 0, vol = .22, slide = null } = opt;
  try {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + .02);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + .05);
  } catch (e) {}
}
const SFX = {
  click()   { tone(520, .06, { type: 'triangle', vol: .12 }); },
  correct() { tone(660, .12); tone(880, .16, { delay: .09 }); },
  combo()   { tone(784, .1); tone(988, .1, { delay: .08 }); tone(1319, .18, { delay: .16 }); },
  wrong()   { tone(160, .2, { type: 'square', vol: .13 }); },
  fire()    { tone(900, .16, { type: 'sawtooth', vol: .1, slide: 220 }); },
  boom()    { tone(120, .3, { type: 'sawtooth', vol: .28, slide: 40 }); tone(60, .35, { type: 'square', vol: .18, slide: 30, delay: .02 }); },
  heart()   { tone(392, .15, { type: 'triangle', vol: .25 }); tone(262, .3, { type: 'triangle', vol: .25, delay: .13 }); },
  win()     { [523, 659, 784, 1046].forEach((f, i) => tone(f, .18, { delay: i * .13 })); },
  lose()    { tone(392, .2); tone(330, .2, { delay: .18 }); tone(262, .38, { delay: .36 }); },
};

/* ---------------- 语音读题 ---------------- */
function speakQuestion(q) {
  if (!save.speech || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const spoken = q.text.replace(/×/g, ' 乘 ').replace(/÷/g, ' 除以 ').replace(/\+/g, ' 加 ').replace(/−/g, ' 减 ') + ' 等于几？';
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = 'zh-CN'; u.rate = .95;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith('zh'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------------- 游戏状态 ---------------- */
const areaEl = $m('#mArea'), wallEl = $m('#mWall'), heroEl = $m('#mHero'),
      comboEl = $m('#mCombo'), answerEl = $m('#mAnswer');
const game = {
  mode: 'level', levelIdx: 0, cfg: null, q: null,
  hearts: 3, score: 0, combo: 0, bestCombo: 0, solved: 0, asked: 0,
  input: '', locked: false,
  speedFactor: 1, state: 'idle', waveActive: false,
  monsters: [], fireballs: [], lastTexts: [], wrongQueue: [], waveTimer: 0
};
function mShowScreen(name) {
  ['mHome', 'mGame', 'mResult'].forEach(id => $m('#' + id).classList.toggle('active', id === name));
}

/* ---------------- 首页渲染 ---------------- */
function renderHome() {
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  $m('#mTotal').textContent = '⭐ ' + total + '/' + (LEVELS.length * 3);
  $m('#mBtnSound').textContent = save.sound ? '🔊' : '🔇';
  $m('#mBtnSpeak').textContent = save.speech ? '🗣️读题:开' : '🗣️读题:关';
  const today = dateStr();
  $m('#mDailyBest').textContent = save.daily[today] ? '最佳' + save.daily[today] + '题' : '';
  let html = '';
  for (const [start, label] of GROUPS) {
    html += `<div class="m-group-label">${label}</div><div class="m-level-row">`;
    for (let i = start; i < start + 3; i++) {
      const lv = LEVELS[i], st = save.stars[i] || 0, lock = !unlocked(i);
      html += `<button class="m-level-card" data-i="${i}" ${lock ? 'disabled' : ''}>` +
        `<span class="m-lc-icon">${lock ? '🔒' : lv.icon}</span>` +
        `<span class="m-lc-name">${i + 1}.${lv.name}</span>` +
        `<span class="m-lc-stars">${[0, 1, 2].map(k => `<i class="${k < st ? 'on' : ''}">⭐</i>`).join('')}</span>` +
        `</button>`;
    }
    html += '</div>';
  }
  $m('#mGrid').innerHTML = html;
}

/* ---------------- 出题 ---------------- */
function nextQuestion() {
  let q = null;
  // 30% 概率复习之前做错的题（间隔重复）
  if (game.wrongQueue.length && Math.random() < .3) {
    const pool = game.wrongQueue.filter(w => !game.lastTexts.slice(-3).includes(w.text));
    if (pool.length) q = pick(pool);
  }
  if (!q) {
    for (let i = 0; i < 15; i++) {
      const c = game.cfg.gen();
      if (!game.lastTexts.includes(c.text)) { q = c; break; }
    }
    if (!q) q = game.cfg.gen();
  }
  game.lastTexts.push(q.text);
  if (game.lastTexts.length > 10) game.lastTexts.shift();
  return q;
}

/* ---------------- 答题显示 ---------------- */
function renderAnswer() {
  answerEl.classList.remove('ok', 'no');
  answerEl.textContent = game.input === '' ? '？' : game.input;
}
function wiggleDisplay() {
  answerEl.classList.remove('no'); void answerEl.offsetWidth; answerEl.classList.add('no');
}
function revealAnswer(ok) {
  answerEl.classList.remove('ok', 'no'); void answerEl.offsetWidth;
  answerEl.textContent = (ok ? '✔ ' : '✗ 答案 ') + game.q.ans;
  answerEl.classList.add(ok ? 'ok' : 'no');
}

/* ---------------- 波次：一道算式 + 一只举着算式的怪兽 ---------------- */
function scheduleWave(ms) {
  clearTimeout(game.waveTimer);
  game.waveTimer = setTimeout(() => {
    if (game.state === 'playing' && !game.waveActive) spawnWave();
  }, ms);
}
function spawnWave() {
  if (game.state !== 'playing' || game.waveActive) return;
  game.monsters = game.monsters.filter(m => m.el.isConnected && m.alive);
  game.waveActive = true;
  game.asked++;
  game.input = ''; game.locked = false;
  game.q = nextQuestion();
  speakQuestion(game.q);
  renderAnswer();

  const el = document.createElement('div');
  el.className = 'm-monster';
  el.innerHTML = `<div class="m-in"><div class="m-bubble">${game.q.text} = ?</div><div class="m-body">${pick(MONSTERS)}</div></div>`;
  el.style.left = rnd(25, 75) + '%';
  const startY = -(12 + rnd(0, 10));
  el.style.top = startY + '%';
  areaEl.appendChild(el);
  game.monsters.push({ el, y: startY, jitter: rnd(-10, 10) / 100, alive: true, defeated: false, h: el.offsetHeight });
}

/* ==================== 核心战斗逻辑 ==================== */
function mShoot(m) {
  const ar = areaEl.getBoundingClientRect(), hr = heroEl.getBoundingClientRect();
  const x = hr.left - ar.left + hr.width / 2, y = hr.top - ar.top + 4;
  const el = document.createElement('div');
  el.className = 'm-fireball';
  el.textContent = '🔥';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  areaEl.appendChild(el);
  game.fireballs.push({ el, x, y, target: m, spin: 0, speed: 1000 });
  heroEl.classList.remove('throw'); void heroEl.offsetWidth; heroEl.classList.add('throw');
  SFX.fire();
}
function mUpdateFireballs(dt) {
  for (let i = game.fireballs.length - 1; i >= 0; i--) {
    const f = game.fireballs[i], t = f.target;
    if (!t.el.isConnected) { f.el.remove(); game.fireballs.splice(i, 1); continue; }
    const tx = t.el.offsetLeft;
    const ty = t.el.offsetTop + t.el.offsetHeight * .35;
    const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1;
    const step = f.speed * dt;
    if (d <= step + 16) {
      f.el.remove(); game.fireballs.splice(i, 1);
      defeatMonster(t);
      continue;
    }
    f.x += dx / d * step; f.y += dy / d * step;
    f.spin += 700 * dt;
    f.el.style.left = f.x + 'px'; f.el.style.top = f.y + 'px';
    f.el.style.transform = `translate(-50%,-50%) rotate(${f.spin}deg)`;
  }
}
function defeatMonster(m) {
  if (m.defeated) return;
  m.defeated = true; m.alive = false;
  mExplosionAt(m);
  SFX.boom();
  revealAnswer(true);
  m.el.classList.add('dead');
  setTimeout(() => m.el.remove(), 300);

  game.combo++;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  const pts = 10 + Math.min(game.combo - 1, 8) * 2;
  game.score += pts;
  game.speedFactor = clamp(game.speedFactor + .05, .8, 1.8); // 连对 → 逐渐加速
  mFloatAt(m, '+' + pts, '#2a9d8f');
  if (game.combo >= 2) mComboPop();
  if (game.combo % 5 === 0) SFX.combo();

  const qi = game.wrongQueue.indexOf(game.q); // 复习题答对了就彻底移出
  if (qi >= 0) game.wrongQueue.splice(qi, 1);
  game.solved++;
  updateHud();

  const done = game.mode === 'level' && game.solved >= game.cfg.goal;
  game.waveActive = false;
  if (done) { game.state = 'ending'; setTimeout(() => showResult(true), 1000); }
  else scheduleWave(850);
}
function breach(m) {
  m.alive = false;
  game.hearts--;
  game.combo = 0;
  game.speedFactor = clamp(game.speedFactor - .2, .8, 1.8);
  updateHud(true);
  mShakeScreen();
  SFX.wrong(); SFX.heart();
  revealAnswer(false);
  rememberWrong(game.q);
  m.el.classList.add('breach');
  setTimeout(() => m.el.remove(), 420);
  game.waveActive = false;
  mClearFireballs();
  if (game.hearts <= 0) { game.state = 'ending'; setTimeout(() => showResult(false), 1000); }
  else scheduleWave(950);
}
function rememberWrong(q) {
  if (!game.wrongQueue.includes(q)) {
    game.wrongQueue.push(q);
    if (game.wrongQueue.length > 6) game.wrongQueue.shift();
  }
}
function mClearFireballs() {
  game.fireballs.forEach(f => f.el.remove());
  game.fireballs = [];
}

/* ---------------- 答题交互 ---------------- */
function mDigit(k) {
  if (game.state !== 'playing' || !game.waveActive || game.locked) return;
  if (game.input.length >= 3) return;
  game.input += k;
  renderAnswer();
}
function mBack() {
  if (game.state !== 'playing' || !game.waveActive || game.locked) return;
  game.input = game.input.slice(0, -1);
  renderAnswer();
}
function mSubmit() {
  if (game.state !== 'playing' || !game.waveActive || game.locked) return;
  if (game.input === '') { wiggleDisplay(); SFX.wrong(); return; }
  const m = game.monsters.find(x => x.alive);
  if (!m) return;
  game.locked = true;
  if (+game.input === game.q.ans) { m.alive = false; mShoot(m); } // 打对了：火球出击
  else breach(m);                                          // 每题只有一次机会：按错即失败
}

/* ---------------- 特效 ---------------- */
function mExplosionAt(m) {
  const el = document.createElement('div');
  el.className = 'm-explosion';
  el.textContent = '💥';
  el.style.left = m.el.offsetLeft + 'px';
  el.style.top = (m.el.offsetTop + m.el.offsetHeight / 2) + 'px';
  areaEl.appendChild(el);
  setTimeout(() => el.remove(), 520);
}
function mFloatAt(m, txt, color) {
  const el = document.createElement('div');
  el.className = 'm-float-text';
  el.textContent = txt;
  el.style.color = color;
  el.style.left = m.el.offsetLeft + 'px';
  el.style.top = (m.el.offsetTop - 6) + 'px';
  areaEl.appendChild(el);
  setTimeout(() => el.remove(), 980);
}
function mComboPop() {
  comboEl.textContent = `${game.combo} 连对！`;
  comboEl.classList.remove('pop'); void comboEl.offsetWidth; comboEl.classList.add('pop');
}
function mShakeScreen() {
  areaEl.classList.remove('shake'); void areaEl.offsetWidth; areaEl.classList.add('shake');
}

/* ---------------- HUD ---------------- */
function updateHud(pulseHearts) {
  const h = $m('#mHearts');
  h.textContent = '❤️'.repeat(game.hearts) + '🤍'.repeat(Math.max(0, 3 - game.hearts));
  if (pulseHearts) { h.classList.remove('pulse'); void h.offsetWidth; h.classList.add('pulse'); }
  $m('#mScore').textContent = game.score + ' 分';
  $m('#mProgress').textContent = game.mode === 'level'
    ? `🎯 ${game.solved}/${game.cfg.goal}`
    : `🎯 答对 ${game.solved}`;
}

/* ---------------- 主循环 ---------------- */
let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  if (game.state !== 'playing') { lastTs = ts; return; }
  const dt = clamp((ts - lastTs) / 1000, 0, .05);
  lastTs = ts;
  const areaH = areaEl.clientHeight;
  if (!areaH) return;
  const wallTop = wallEl.offsetTop;
  for (const mo of game.monsters) {
    if (!mo.alive) continue;
    const sp = game.cfg.speed * game.speedFactor * (1 + mo.jitter); // 每秒下落高度（占区域高度的百分比）
    mo.y += sp * dt;
    const trig = (wallTop - mo.h) / areaH * 100;
    if (mo.y >= trig) {
      if (game.fireballs.some(f => f.target === mo)) mo.y = trig;  // 已答对、火球在飞：贴墙等待命中
      else { breach(mo); continue; }
    }
    mo.el.style.top = mo.y + '%';
  }
  mUpdateFireballs(dt);
}
requestAnimationFrame(loop);

/* ---------------- 开始 / 暂停 / 结束 ---------------- */
const TIP_HTML = `<h3>🎮 怎么玩</h3>
<p>一只小怪兽举着<b>算式</b>从天而降。<br>心算答案，在下方键盘<b>输入数字</b>，<br>按 <b>✔️</b> 或回车键开炮！</p>
<p><b>每题只有一次机会！</b><br>打错或来不及，怪兽就会撞进城堡，<br>丢一颗心 ❤️</p>
<p>守住 3 颗心、答完题目，<br>就能拿满 3 颗星 ⭐</p>`;
function mStart(mode, idx = 0) {
  mResetArea();
  game.mode = mode;
  game.levelIdx = idx;
  if (mode === 'level') {
    game.cfg = Object.assign({}, LEVELS[idx]);
  } else {
    const gens = LEVELS.filter((_, i) => unlocked(i)).map(l => l.gen);
    game.cfg = { name: '每日挑战', count: 4, speed: 9, goal: Infinity, gen: () => pick(gens)() };
  }
  game.hearts = 3; game.score = 0; game.combo = 0; game.bestCombo = 0;
  game.solved = 0; game.asked = 0;
  game.input = ''; game.locked = false;
  game.speedFactor = 1; game.q = null;
  game.lastTexts = []; game.wrongQueue = [];
  updateHud();
  renderAnswer();
  mShowScreen('mGame');
  game.state = 'playing';
  if (!save.seenTip && mode === 'level' && idx === 0) {
    save.seenTip = true; persist();
    game.state = 'paused';
    mShowModal(TIP_HTML, { okText: '开始冒险！', showCancel: false, onOk: mResumeGame });
  } else {
    scheduleWave(600);
  }
}
function mPauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  $m('#mPause').classList.remove('hidden');
}
function mResumeGame() {
  $m('#mPause').classList.add('hidden');
  game.state = 'playing';
  if (!game.waveActive) scheduleWave(300);
}
function mToHome() {
  clearTimeout(game.waveTimer);
  game.state = 'idle';
  mResetArea();
  renderHome();
  mShowScreen('mHome');
}
function mResetArea() {
  clearTimeout(game.waveTimer);
  areaEl.querySelectorAll('.m-monster,.m-fireball,.m-explosion,.m-float-text').forEach(e => e.remove());
  game.monsters = []; game.fireballs = [];
  game.waveActive = false;
  areaEl.classList.remove('shake');
}
function mStatRow(k, v) { return `<div class="m-stat"><span>${k}</span><b>${v}</b></div>`; }
function showResult(win) {
  game.state = 'over';
  const daily = game.mode === 'daily';
  $m('#mBtnNext').classList.add('hidden');
  if (daily) {
    const key = dateStr();
    const best = Math.max(save.daily[key] || 0, game.solved);
    save.daily[key] = best; persist();
    $m('#mREmoji').textContent = '🎁';
    $m('#mRTitle').textContent = '挑战结束！';
    $m('#mRStars').innerHTML = '';
    $m('#mRStats').innerHTML =
      mStatRow('答对', game.solved + ' 题') + mStatRow('最高连击', 'x' + game.bestCombo) +
      mStatRow('得分', game.score + ' 分') + mStatRow('今日最佳', best + ' 题');
  } else {
    let stars = 0;
    if (win) {
      stars = game.hearts;
      save.stars[game.levelIdx] = Math.max(save.stars[game.levelIdx] || 0, stars);
      persist();
      const last = game.levelIdx === LEVELS.length - 1;
      $m('#mREmoji').textContent = last ? '👑' : '🏆';
      $m('#mRTitle').textContent = last ? '全部通关！你是数学大英雄！' : pick(['太棒了！', '你真厉害！', '无敌小勇士！']);
      $m('#mBtnNext').classList.toggle('hidden', last);
    } else {
      $m('#mREmoji').textContent = '💪';
      $m('#mRTitle').textContent = '怪兽进城啦，别灰心！';
    }
    $m('#mRStars').innerHTML = [0, 1, 2].map(i =>
      `<i class="${i < stars ? 'on' : 'off'}" style="animation-delay:${(0.15 + i * 0.3).toFixed(2)}s">${i < stars ? '⭐' : '☆'}</i>`
    ).join('');
    $m('#mRStats').innerHTML =
      mStatRow('答对', game.solved + ' 题') + mStatRow('最高连击', 'x' + game.bestCombo) +
      mStatRow('得分', game.score + ' 分');
  }
  if (win || (daily && game.solved > 0)) SFX.win(); else SFX.lose();
  mShowScreen('mResult');
}

/* ---------------- 通用弹窗 ---------------- */
let modalCb = null;
function mShowModal(html, { okText = '确定', cancelText = '取消', onOk = null, showCancel = true } = {}) {
  $m('#mModalText').innerHTML = html;
  $m('#mModalOk').textContent = okText;
  $m('#mModalCancel').textContent = cancelText;
  $m('#mModalCancel').classList.toggle('hidden', !showCancel);
  modalCb = onOk;
  $m('#mModal').classList.remove('hidden');
}
function mHideModal() { $m('#mModal').classList.add('hidden'); modalCb = null; }

/* ---------------- 键盘按键（由外部总调度调用） ---------------- */
window.mathKey = function (e) {
  if (game.state !== 'playing' || !game.waveActive) return;
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    mDigit(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    mBack();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    mSubmit();
  }
};

/* 独立页面：键盘事件直接进入数学模式（mathKey 内部自带状态守卫） */
window.addEventListener('keydown', (e) => { window.mathKey(e); });

/* ---------------- 事件绑定 ---------------- */
// 数字小键盘
const kpGrid = $m('#mKpGrid');
let kpHtml = '';
for (let i = 1; i <= 9; i++) kpHtml += `<button class="m-kp" data-k="${i}">${i}</button>`;
kpHtml += '<button class="m-kp del" data-k="del">⌫</button>';
kpHtml += '<button class="m-kp" data-k="0">0</button>';
kpHtml += '<button class="m-kp ok" data-k="ok">✔️</button>';
kpGrid.innerHTML = kpHtml;
kpGrid.addEventListener('click', e => {
  const b = e.target.closest('.m-kp');
  if (!b) return;
  const k = b.dataset.k;
  if (k === 'ok') mSubmit();
  else if (k === 'del') mBack();
  else mDigit(k);
});

$m('#mGrid').addEventListener('click', e => {
  const c = e.target.closest('.m-level-card');
  if (c && !c.disabled) { SFX.click(); mStart('level', +c.dataset.i); }
});
$m('#mBtnDaily').addEventListener('click', () => { SFX.click(); mStart('daily'); });
$m('#mBtnSound').addEventListener('click', () => { save.sound = !save.sound; persist(); renderHome(); });
$m('#mBtnSpeak').addEventListener('click', () => { save.speech = !save.speech; persist(); renderHome(); });
$m('#mBtnHub').addEventListener('click', () => { goHub(); });
$m('#mBtnReset').addEventListener('click', () => {
  mShowModal('<h3>🗑️ 重置进度</h3><p>确定要清空全部星星和每日记录吗？</p>', {
    okText: '清空', onOk() { save.stars = {}; save.daily = {}; persist(); renderHome(); }
  });
});
$m('#mBtnPause').addEventListener('click', mPauseGame);
$m('#mBtnResume').addEventListener('click', mResumeGame);
$m('#mBtnQuit').addEventListener('click', () => { SFX.click(); mToHome(); });
$m('#mBtnQuitHub').addEventListener('click', () => { goHub(); });
$m('#mBtnNext').addEventListener('click', () => { SFX.click(); mStart('level', game.levelIdx + 1); });
$m('#mBtnRetry').addEventListener('click', () => { SFX.click(); mStart(game.mode, game.levelIdx); });
$m('#mBtnHome').addEventListener('click', () => { SFX.click(); mToHome(); });
$m('#mBtnResultHub').addEventListener('click', () => { goHub(); });
$m('#mModalOk').addEventListener('click', () => { const cb = modalCb; mHideModal(); if (cb) cb(); });
$m('#mModalCancel').addEventListener('click', mHideModal);
// 切后台自动暂停数学模式
window.addEventListener('blur', () => { if (game.state === 'playing') mPauseGame(); });
areaEl.addEventListener('contextmenu', e => e.preventDefault());

/* ---------------- 对外接口 ---------------- */
window.MathHero = {
  enter() {           // 从主菜单进入数学模式
    clearTimeout(game.waveTimer);
    game.state = 'idle';
    mResetArea();
    mHideModal();
    $m('#mPause').classList.add('hidden');
    renderHome();
    mShowScreen('mHome');
  },
  leave() {           // 切走时清理战场
    clearTimeout(game.waveTimer);
    game.state = 'idle';
    mResetArea();
    mHideModal();
    $m('#mPause').classList.add('hidden');
  },
  /* 供 smoke test 校验题库与内部状态 */
  _levels: LEVELS,
  _game: game
};
})();

/* 独立页面：加载后直接进入数学模式选关首页 */
window.MathHero.enter();