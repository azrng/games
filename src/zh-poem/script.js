"use strict";
/* ==================== 全局调度 ==================== */
/* 返回平台首页：原三合一大菜单拆分后，"主菜单"指向游戏平台入口页 */
function goHub() { location.href = '../../index.html'; }

/* 打开语文开始页 */
function showZhMenu() {
  ZH.state = 'menu';
  document.getElementById('zhOver').classList.add('hidden');
  document.getElementById('zhTopBtn').classList.add('hidden');
  renderZhHome();
  document.getElementById('zhMenu').classList.remove('hidden');
}

/* ==================== 语文 · 点字成诗 ==================== */
const zhCanvasEl = document.getElementById('zhCanvas');
const zhCtx = zhCanvasEl.getContext('2d');

/* 独立画布尺寸（合体版复用英语画布的宽高，拆分后自行维护） */
let W = 0, H = 0;

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
const zrnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const zpick = a => a[zrnd(0, a.length - 1)];
function zshuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = zrnd(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const zTween = v => v * v * (3 - 2 * v);   // smoothstep

/* ---- 题库：词语（随机空首/末字） + 古诗（空任意一个只出现一次的字） ---- */
const ZH_WORDS = ['太阳', '月亮', '星星', '白云', '花朵', '雨水', '雪花', '彩虹', '草地', '大树',
  '小草', '大山', '大海', '石头', '泥土', '小鸟', '小鱼', '老虎', '狮子', '熊猫',
  '青蛙', '蜜蜂', '蝴蝶', '蚂蚁', '苹果', '香蕉', '西瓜', '草莓', '樱桃', '菠萝',
  '雨伞', '雪人', '天空', '森林', '河流', '树叶', '松树', '竹子', '玉米', '葡萄',
  '桃子', '橙子', '小狗', '小猫', '白马', '奶牛', '绵羊', '鸭子', '公鸡', '乌龟',
  '蜗牛', '刺猬', '金鱼', '海豚', '贝壳', '沙滩', '帆船', '火车', '飞机', '汽车',
  '桌子', '椅子', '台灯', '电视', '书包', '铅笔', '橡皮', '篮球', '足球', '气球',
  '风筝', '灯笼', '饺子', '面条', '米饭', '学校', '老师', '朋友', '快乐', '早晨'];
const ZH_POEMS = [
  ['床前明月光', '疑是地上霜', '举头望明月', '低头思故乡'],          // 静夜思
  ['春眠不觉晓', '处处闻啼鸟', '夜来风雨声', '花落知多少'],          // 春晓
  ['锄禾日当午', '汗滴禾下土', '谁知盘中餐', '粒粒皆辛苦'],          // 悯农
  ['曲项向天歌', '白毛浮绿水', '红掌拨清波'],                        // 咏鹅
  ['远看山有色', '近听水无声', '春去花还在', '人来鸟不惊'],          // 画
  ['小时不识月', '呼作白玉盘'],                                      // 古朗月行
  ['解落三秋叶', '能开二月花', '过江千尺浪', '入竹万竿斜'],          // 风
  ['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼'],          // 登鹳雀楼
  ['碧玉妆成一树高', '万条垂下绿丝绦', '不知细叶谁裁出', '二月春风似剪刀'], // 咏柳
  ['日照香炉生紫烟', '遥看瀑布挂前川', '飞流直下三千尺', '疑是银河落九天'], // 望庐山瀑布
  ['墙角数枝梅', '凌寒独自开', '遥知不是雪', '为有暗香来'],          // 梅花
  ['一去二三里', '烟村四五家', '亭台六七座', '八九十枝花'],          // 山村咏怀
  ['江南可采莲', '莲叶何田田', '鱼戏莲叶间'],                        // 江南
  ['横看成岭侧成峰', '远近高低各不同', '不识庐山真面目', '只缘身在此山中'] // 题西林壁
];
const ZH_ALL = [...new Set((ZH_WORDS.join('') + ZH_POEMS.flat().join('')).split(''))];

/* ---- 语文存档 ---- */
const ZH_SAVE_KEY = 'yuwenSaveV1';
let zhSave = { bestScore: 0, bestGroups: 0, bestRounds: 0 };
try {
  const s = JSON.parse(localStorage.getItem(ZH_SAVE_KEY) || 'null');
  if (s && typeof s === 'object') zhSave = Object.assign(zhSave, s);
} catch (e) {}
function zhPersist() { try { localStorage.setItem(ZH_SAVE_KEY, JSON.stringify(zhSave)); } catch (e) {} }
function renderZhHome() {
  document.getElementById('zhBestScore').textContent = zhSave.bestScore > 0 ? zhSave.bestScore : '—';
  document.getElementById('zhBestGroups').textContent = zhSave.bestGroups > 0 ? zhSave.bestGroups + ' 组' : '—';
  document.getElementById('zhBestRounds').textContent = zhSave.bestRounds > 0 ? zhSave.bestRounds + ' 轮' : '—';
}

const ZH = {
  state: 'menu',          // menu | playing | over
  q: null,                // { phrase, blank, answer, chars[] }
  stage: 0,               // 0 出题掉落 | 1 答对飞字 | 2 展示完整诗句
  stageT: 0,
  opts: [],               // 掉落字牌 { ch, right, x, y, vy, seed }
  spawnT: 0, respawnT: 0,
  clouds: [], parts: [], floats: [],
  score: 0, groups: 0, rounds: 0, hearts: 3,
  combo: 0, bestCombo: 0, wrong: 0, lastWrongAt: -9,
  blurred: false,
  shake: 0, toast: null, playT: 0, lastPhrase: ''
};
for (let i = 0; i < 7; i++) ZH.clouds.push({ x: Math.random() * 2000, y: 30 + Math.random() * 200, s: .5 + Math.random() * .8, v: 5 + Math.random() * 10 });

/* ---- 出题 ---- */
function zhNewQuestion() {
  const isWord = Math.random() < 0.5;
  let phrase = '', blank = 0, group = null;
  for (let t = 0; t < 8; t++) {
    if (isWord) {
      phrase = zpick(ZH_WORDS);
      // 词语随机空首字或末字，避免"永远猜末字"的固定套路
      blank = Math.random() < 0.5 ? 0 : phrase.length - 1;
    } else {
      group = zpick(ZH_POEMS);
      phrase = zpick(group);
      const seen = new Set(), singles = [];
      for (let i = 0; i < phrase.length; i++) {
        const c = phrase[i];
        if (!seen.has(c) && phrase.indexOf(c) === phrase.lastIndexOf(c)) singles.push(i);
        seen.add(c);
      }
      const idxs = singles.length ? singles : [...Array(phrase.length).keys()];
      blank = idxs[zrnd(0, idxs.length - 1)];
    }
    if (phrase !== ZH.lastPhrase) break;
  }
  ZH.lastPhrase = phrase;
  const answer = phrase[blank];
  const cands = [];
  const pushU = s => { for (const c of s) if (c !== answer && !cands.includes(c) && cands.length < 3) cands.push(c); };
  // 诗句：同诗他句 / 本句他字都是好干扰项；词语：不混入已显示的字，避免误导
  if (group) { pushU(group.join('')); pushU(phrase); }
  let guard = 0;
  while (cands.length < 3 && guard++ < 120) {
    const c = zpick(ZH_ALL);
    if (c !== answer && !cands.includes(c) && (group || !phrase.includes(c))) cands.push(c);
  }
  ZH.q = { phrase, blank, answer, chars: zshuffle([answer, ...cands]) };
  ZH.opts = []; ZH.spawnT = .7;
}

function zhDrop(ch, right) {
  ZH.opts.push({
    ch, right,
    x: 70 + Math.random() * (W - 140),
    y: -46,
    vy: (62 + Math.min(38, ZH.playT * .5)) * (0.88 + Math.random() * .24),
    seed: Math.random() * Math.PI * 2
  });
}

/* 字牌掉落节奏：保证对字在场上；错的字最多 3 个，掉完会补新的错字 */
function zhSpawnTick(dt) {
  ZH.spawnT -= dt;
  if (ZH.spawnT > 0) return;
  const aliveRight = ZH.opts.some(o => o.right);
  if (!aliveRight) { zhDrop(ZH.q.answer, true); ZH.spawnT = .5; return; }
  const wrongAlive = ZH.opts.filter(o => !o.right).length;
  if (wrongAlive < 3) {
    const missing = ZH.q.chars.filter(c => c !== ZH.q.answer && !ZH.opts.some(o => o.ch === c));
    const ch = missing.length ? zpick(missing) : zpick(ZH.q.chars.filter(c => c !== ZH.q.answer));
    zhDrop(ch, false);
    ZH.spawnT = .55 + Math.random() * .45;
  } else if (ZH.opts.length < 4) {
    ZH.spawnT = .5;
  } else {
    ZH.spawnT = 1.2;   // 满屏等一等
  }
}

/* 答对：字牌飞进空格，亮出整句 */
function zhHitRight(o) {
  ZH.stage = 1; ZH.stageT = 0;
  const cell = zhBlankCell();
  ZH.fly = { ch: o.ch, x: o.x, y: o.y, tx: cell.x, ty: cell.y };
  ZH.opts = [];
  ZH.combo++;
  ZH.bestCombo = Math.max(ZH.bestCombo, ZH.combo);
  const gain = 20 + 3 * Math.min(ZH.combo - 1, 10);
  ZH.score += gain;
  zhFloat(o.x, o.y - 30, '+' + gain, '#d97706', 24);
  if (ZH.combo >= 3) zhFloat(W / 2, H / 2 - 150, ZH.combo + ' 连击！', '#c2410c', 30);
  burstZH(o.x, o.y, ['#fde047', '#f59e0b', '#f97316', '#fff7ed'], 26, 240);
  ensureAudio();
  sfx.destroy();
}
function zhHitWrong(o) {
  const i = ZH.opts.indexOf(o);
  if (i >= 0) ZH.opts.splice(i, 1);
  ZH.combo = 0; ZH.wrong++;
  // 0.9 秒内的连续错点视为手滑误触：只清连击与提示，不重复扣心
  if (ZH.playT - ZH.lastWrongAt < 0.9) {
    zhFloat(o.x, o.y - 24, '别急，看清楚再点～', '#c2410c', 20);
    return;
  }
  ZH.lastWrongAt = ZH.playT;
  ZH.hearts--;
  ZH.shake = 10;
  burstZH(o.x, o.y, ['#ef4444', '#f97316', '#fecaca'], 16, 170);
  zhFloat(o.x, o.y - 24, '💔', '#dc2626', 26);
  ensureAudio();
  sfx.hurt();
  if (ZH.hearts <= 0) zhEnd();
}

/* 一组完成，进入下一组 */
function zhFinishGroup() {
  ZH.groups++;
  if (ZH.groups % 5 === 0) {
    ZH.rounds++;
    ZH.toast = { text: '🎉 打完第 ' + ZH.rounds + ' 轮！', sub: '再点几组，挑战新纪录！', t: 2.2 };
    burstZH(W / 2, H / 2 - 80, ['#fde047', '#f59e0b', '#c2410c', '#fda4af'], 40, 330);
    sfx.levelup();
  }
  zhNewQuestion();
  ZH.stage = 0;
}

function zhStartRun() {
  ZH.state = 'playing';
  ZH.opts = []; ZH.parts = []; ZH.floats = [];
  ZH.score = 0; ZH.groups = 0; ZH.rounds = 0; ZH.hearts = 3;
  ZH.combo = 0; ZH.bestCombo = 0; ZH.wrong = 0;
  ZH.stage = 0; ZH.shake = 0; ZH.playT = 0;
  ZH.toast = { text: '📜 点字成诗', sub: '先读题，再点天上掉下来的正确字！', t: 2.6 };
  document.getElementById('zhMenu').classList.add('hidden');
  document.getElementById('zhOver').classList.add('hidden');
  document.getElementById('zhTopBtn').classList.remove('hidden');
  ensureAudio();
  zhNewQuestion();
}

function zhEnd() {
  ZH.state = 'over';
  ZH.opts = []; ZH.floats = []; ZH.parts = [];
  sfx.over();
  const isNew = ZH.score > zhSave.bestScore && ZH.score > 0;
  if (ZH.score > zhSave.bestScore) zhSave.bestScore = ZH.score;
  if (ZH.groups > zhSave.bestGroups) zhSave.bestGroups = ZH.groups;
  if (ZH.rounds > zhSave.bestRounds) zhSave.bestRounds = ZH.rounds;
  zhPersist();
  const g = document.getElementById('zhGreet');
  if (isNew) g.textContent = '🏆 太厉害了，打破了最高分纪录！';
  else if (ZH.groups >= 15) g.textContent = '🎉 完成 ' + ZH.groups + ' 组，真是识字小达人！';
  else if (ZH.groups >= 8) g.textContent = '👍 认对了 ' + ZH.groups + ' 个字，越来越棒啦！';
  else if (ZH.groups > 0) g.textContent = '💪 认对了 ' + ZH.groups + ' 个字，再练练能认更多！';
  else g.textContent = '别灰心，先读一读再点，一定可以的！';
  document.getElementById('zhNew').style.display = isNew ? 'block' : 'none';
  const acc = ZH.groups + ZH.wrong > 0 ? Math.round(ZH.groups * 100 / (ZH.groups + ZH.wrong)) : 0;
  document.getElementById('zhScore').textContent = ZH.score;
  document.getElementById('zhGroups').textContent = ZH.groups;
  document.getElementById('zhRounds').textContent = ZH.rounds;
  document.getElementById('zhCombo').textContent = ZH.bestCombo;
  document.getElementById('zhAcc').textContent = acc + '%';
  document.getElementById('zhTopBtn').classList.add('hidden');
  document.getElementById('zhOver').classList.remove('hidden');
}

/* ---- 更新 ---- */
function zhUpdate(dt) {
  ZH.playT += dt;
  for (const c of ZH.clouds) { c.x += c.v * dt; if (c.x > W + 180) c.x = -180; }
  if (ZH.shake > 0) ZH.shake = Math.max(0, ZH.shake - dt * 30);
  if (ZH.toast) { ZH.toast.t -= dt; if (ZH.toast.t <= 0) ZH.toast = null; }

  if (ZH.stage === 1) {
    ZH.stageT += dt * 1.55;
    if (ZH.stageT >= 1) { ZH.stage = 2; ZH.stageT = 0; }
  } else if (ZH.stage === 2) {
    ZH.stageT += dt;
    if (ZH.stageT >= .95) zhFinishGroup();
  } else {
    for (let i = ZH.opts.length - 1; i >= 0; i--) {
      const o = ZH.opts[i];
      o.y += o.vy * dt;
      if (o.y > H - 158) ZH.opts.splice(i, 1);   // 落到诗句上方算没接到
    }
    if (!ZH.opts.some(o => o.right)) {
      ZH.respawnT -= dt;
      if (ZH.respawnT <= 0) { zhDrop(ZH.q.answer, true); ZH.respawnT = .45; }
    } else ZH.respawnT = .45;
    zhSpawnTick(dt);
  }
  updatePartsZH(dt);
}
function zhDeco(dt) {
  for (const c of ZH.clouds) { c.x += c.v * dt; if (c.x > W + 180) c.x = -180; }
  updatePartsZH(dt);
}
function updatePartsZH(dt) {
  for (let i = ZH.parts.length - 1; i >= 0; i--) {
    const p = ZH.parts[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; p.life -= dt;
    if (p.life <= 0) ZH.parts.splice(i, 1);
  }
  for (let i = ZH.floats.length - 1; i >= 0; i--) {
    const f = ZH.floats[i];
    f.y -= 44 * dt; f.life -= dt * .9;
    if (f.life <= 0) ZH.floats.splice(i, 1);
  }
}
function burstZH(x, y, colors, n, power) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = power * (.3 + Math.random() * .7);
    ZH.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, life: .5 + Math.random() * .5,
      size: 2 + Math.random() * 4, color: colors[Math.floor(Math.random() * colors.length)] });
  }
}
function zhFloat(x, y, text, color, size = 22) { ZH.floats.push({ x, y, text, color, size, life: 1 }); }

/* ---- 布局 ---- */
function zhBlankCell() {
  const n = ZH.q.phrase.length;
  const cw = 52, gap = 6;
  const total = n * cw + (n - 1) * gap;
  return { x: W / 2 - total / 2 + ZH.q.blank * (cw + gap) + cw / 2, y: H - 74 };
}
function zhResize() {
  const d = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  zhCanvasEl.width = window.innerWidth * d;
  zhCanvasEl.height = window.innerHeight * d;
  zhCtx.setTransform(d, 0, 0, d, 0, 0);
  // 窗口变窄时把场上字牌拉回可视区，避免屏幕外的牌既看不见也点不到
  for (const o of ZH.opts) o.x = Math.min(Math.max(o.x, 70), W - 70);
}
zhResize();
window.addEventListener('resize', zhResize);

/* ---- 绘制 ---- */
function zhDraw() {
  const c = zhCtx;
  c.clearRect(0, 0, W, H);
  c.save();
  if (ZH.shake > 0) c.translate((Math.random() - .5) * ZH.shake, (Math.random() - .5) * ZH.shake);

  // 宣纸天空
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#fdf7e7'); sky.addColorStop(.75, '#faf0d7'); sky.addColorStop(1, '#f3e3bd');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);

  // 朱砂太阳 + 淡云
  c.fillStyle = 'rgba(230,120,80,.9)';
  c.beginPath(); c.arc(W - 130, 96, 40, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(230,120,80,.18)';
  c.beginPath(); c.arc(W - 130, 96, 62, 0, Math.PI * 2); c.fill();
  for (const cl of ZH.clouds) {
    c.fillStyle = 'rgba(255,255,255,.8)';
    c.beginPath();
    c.arc(cl.x, cl.y, 20 * cl.s, 0, Math.PI * 2);
    c.arc(cl.x + 24 * cl.s, cl.y - 9 * cl.s, 16 * cl.s, 0, Math.PI * 2);
    c.arc(cl.x + 48 * cl.s, cl.y, 18 * cl.s, 0, Math.PI * 2);
    c.arc(cl.x + 24 * cl.s, cl.y + 9 * cl.s, 20 * cl.s, 0, Math.PI * 2);
    c.fill();
  }

  // 掉落的字牌
  for (const o of ZH.opts) {
    const dx = o.x + Math.sin(o.y * .02 + o.seed) * 7;
    c.save();
    c.translate(dx, o.y);
    c.fillStyle = 'rgba(255,253,246,.97)';
    c.beginPath(); c.roundRect(-31, -31, 62, 62, 14); c.fill();
    c.strokeStyle = '#c9a876'; c.lineWidth = 2.5;
    c.beginPath(); c.roundRect(-31, -31, 62, 62, 14); c.stroke();
    c.fillStyle = '#4a2f1b';
    c.font = 'bold 40px "Microsoft YaHei","PingFang SC",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(o.ch, 0, 2);
    c.restore();
  }

  // 飞字动画（答对）
  if (ZH.stage === 1 && ZH.fly) {
    const f = ZH.fly, k = zTween(Math.min(1, ZH.stageT));
    const x = f.x + (f.tx - f.x) * k, y = f.y + (f.ty - f.y) * k - Math.sin(k * Math.PI) * 60;
    c.fillStyle = 'rgba(255,253,246,.97)';
    c.beginPath(); c.roundRect(x - 31, y - 31, 62, 62, 14); c.fill();
    c.strokeStyle = '#f59e0b'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x - 31, y - 31, 62, 62, 14); c.stroke();
    c.fillStyle = '#4a2f1b';
    c.font = 'bold 40px "Microsoft YaHei","PingFang SC",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(f.ch, x, y + 2);
  }

  // 书案 + 诗句条
  c.fillStyle = '#e2c79b';
  c.fillRect(0, H - 26, W, 26);
  c.fillStyle = '#c9a878';
  c.fillRect(0, H - 26, W, 5);
  c.fillStyle = 'rgba(255,255,255,.96)';
  c.beginPath(); c.roundRect(20, H - 132, W - 40, 100, 20); c.fill();
  c.strokeStyle = '#b45309'; c.lineWidth = 3;
  c.beginPath(); c.roundRect(20, H - 132, W - 40, 100, 20); c.stroke();
  c.strokeStyle = 'rgba(180,83,9,.35)'; c.lineWidth = 1.5;
  c.beginPath(); c.roundRect(30, H - 122, W - 60, 80, 14); c.stroke();

  c.textAlign = 'center'; c.textBaseline = 'middle';
  if (ZH.q && ZH.state !== 'menu') {
    const n = ZH.q.phrase.length, cw = 52, gap = 6;
    const total = n * cw + (n - 1) * gap;
    const x0 = W / 2 - total / 2, yc = H - 74;
    const done = ZH.stage === 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (cw + gap) + cw / 2;
      const isBlank = i === ZH.q.blank;
      if (isBlank) {
        c.fillStyle = done ? '#dcfce7' : '#fef3c7';
        c.beginPath(); c.roundRect(x - cw / 2 + 4, yc - 25, cw - 8, 50, 10); c.fill();
        c.strokeStyle = done ? '#16a34a' : '#d97706';
        c.lineWidth = 2.5;
        c.setLineDash([7, 5]);
        c.beginPath(); c.roundRect(x - cw / 2 + 4, yc - 25, cw - 8, 50, 10); c.stroke();
        c.setLineDash([]);
        if (done) {
          c.fillStyle = '#15803d';
          c.font = 'bold 42px "Microsoft YaHei","PingFang SC",sans-serif';
          c.fillText(ZH.q.answer, x, yc + 2);
        } else {
          c.fillStyle = '#d9b98a';
          c.font = '36px "Microsoft YaHei","PingFang SC",sans-serif';
          c.fillText('？', x, yc + 2);
        }
      } else {
        c.fillStyle = '#4a2f1b';
        c.font = 'bold 42px "Microsoft YaHei","PingFang SC",sans-serif';
        c.fillText(ZH.q.phrase[i], x, yc + 2);
      }
    }
    // 缺字提示
    if (ZH.stage === 0) {
      c.font = '13px "Microsoft YaHei",sans-serif';
      c.fillStyle = '#b08a5a';
      c.fillText('这里缺一个字，天上掉下来的字里点出它！', W / 2, H - 116);
    }
  } else {
    c.font = '15px "Microsoft YaHei",sans-serif';
    c.fillStyle = '#b39a72';
    c.fillText('📜 词语或诗句缺了一个字——天上掉下来的字里，点出正确的那个！', W / 2, H - 88);
  }

  // 粒子 / 飘字
  for (const p of ZH.parts) {
    c.globalAlpha = Math.max(0, p.life);
    c.fillStyle = p.color;
    c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
  for (const f of ZH.floats) {
    c.globalAlpha = Math.max(0, f.life);
    c.font = `bold ${f.size}px "Microsoft YaHei",sans-serif`;
    c.textAlign = 'center';
    c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,.9)';
    c.strokeText(f.text, f.x, f.y);
    c.fillStyle = f.color;
    c.fillText(f.text, f.x, f.y);
  }
  c.globalAlpha = 1;

  c.restore();
  if (ZH.state === 'playing') zhHUD(c);
}

function zhHUD(c) {
  const ink = 'rgba(74,47,27,.9)';
  // 得分（x 起点 104 避开左上角平台返回按钮）
  c.textAlign = 'left'; c.textBaseline = 'top';
  c.font = 'bold 26px "Microsoft YaHei",sans-serif';
  c.fillStyle = ink;
  c.fillText('🏆 ' + ZH.score, 104, 14);
  // 轮次/组 + 本轮进度
  c.textAlign = 'center';
  c.font = 'bold 22px "Microsoft YaHei",sans-serif';
  c.fillStyle = ink;
  c.fillText('第 ' + (ZH.rounds + 1) + ' 轮 · 第 ' + (ZH.groups + 1) + ' 组', W / 2, 16);
  const bw = 150, prog = (ZH.groups % 5) / 5;
  c.fillStyle = 'rgba(74,47,27,.18)';
  c.beginPath(); c.roundRect(W / 2 - bw / 2, 46, bw, 8, 4); c.fill();
  c.fillStyle = '#c2410c';
  c.beginPath(); c.roundRect(W / 2 - bw / 2, 46, bw * prog, 8, 4); c.fill();
  // 心
  c.textAlign = 'right';
  c.font = '22px "Segoe UI Emoji",sans-serif';
  let hearts = '';
  for (let i = 0; i < 3; i++) hearts += i < ZH.hearts ? '❤️' : '🖤';
  c.fillText(hearts, W - 128, 14);
  // 连击
  if (ZH.combo >= 3) {
    c.textAlign = 'center';
    c.font = 'bold 24px "Microsoft YaHei",sans-serif';
    c.fillStyle = '#c2410c';
    c.fillText(ZH.combo + ' 连击！', W / 2, 68);
  }
  // 提示条
  if (ZH.toast) {
    c.globalAlpha = Math.min(1, ZH.toast.t * 2);
    c.textAlign = 'center';
    c.font = 'bold 44px "Microsoft YaHei",sans-serif';
    c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,.92)';
    c.strokeText(ZH.toast.text, W / 2, H / 2 - 130);
    c.fillStyle = '#b45309';
    c.fillText(ZH.toast.text, W / 2, H / 2 - 130);
    c.font = '20px "Microsoft YaHei",sans-serif';
    c.fillStyle = '#8a5a2b';
    c.fillText(ZH.toast.sub, W / 2, H / 2 - 86);
    c.globalAlpha = 1;
  }
}

/* ---- 点击字牌（pointerdown 降低触屏延迟，掉落目标追点更跟手） ---- */
zhCanvasEl.addEventListener('pointerdown', e => {
  if (ZH.state !== 'playing' || ZH.stage !== 0) return;
  const x = e.clientX, y = e.clientY;
  for (let i = ZH.opts.length - 1; i >= 0; i--) {
    const o = ZH.opts[i];
    if (Math.hypot(x - o.x, y - o.y) <= 34) {
      if (o.right) zhHitRight(o); else zhHitWrong(o);
      return;
    }
  }
});

/* ---- 语文主循环 ---- */
let zhLastT = performance.now();
/* 失焦冻结掉落（与平台另两个游戏行为对齐），回到视口自动恢复 */
window.addEventListener('blur', () => { ZH.blurred = true; });
window.addEventListener('focus', () => { ZH.blurred = false; });
function zhLoop(t) {
  const dt = Math.min(.05, (t - zhLastT) / 1000);
  zhLastT = t;
  if (ZH.state === 'playing' && !ZH.blurred) zhUpdate(dt);
  else zhDeco(dt);
  zhDraw();
  requestAnimationFrame(zhLoop);
}
requestAnimationFrame(zhLoop);

/* ---- 语文按钮 ---- */
document.getElementById('zhStart').addEventListener('click', zhStartRun);
document.getElementById('zhRetry').addEventListener('click', zhStartRun);
document.getElementById('zhToHub').addEventListener('click', goHub);
document.getElementById('zhToMenu').addEventListener('click', showZhMenu);
document.getElementById('zhOverHub').addEventListener('click', goHub);
document.getElementById('zhTopBtn').addEventListener('click', showZhMenu);

/* 首屏：渲染纪录，开始页由页面初始状态显示 */
renderZhHome();

/* 供 smoke test 校验出题与内部状态 */
window.ZhPoem = { state: ZH, save: zhSave };
