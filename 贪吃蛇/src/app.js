/* app.js —— 界面层：绘制 / 播放控制 / 回放 */
(function () {
  'use strict';

  const E = window.Engine;
  const N = E.N;
  const CELL = 7;
  const SIZE = N * CELL;            // 700

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* ---------------- 棋盘底图（只画一次） ---------------- */
  const bg = document.createElement('canvas');
  bg.width = SIZE * dpr;
  bg.height = SIZE * dpr;
  (function paintGrid() {
    const g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#eef3fa';
    g.fillRect(0, 0, SIZE, SIZE);
    g.lineWidth = 1;
    for (let i = 0; i <= N; i++) {
      const p = i * CELL + 0.5;
      const major = i % 10 === 0;
      g.strokeStyle = major ? '#d5e0f0' : '#e6edf7';
      g.beginPath();
      g.moveTo(p, 0); g.lineTo(p, SIZE);
      g.moveTo(0, p); g.lineTo(SIZE, p);
      g.stroke();
    }
  })();

  /* ---------------- 状态 ---------------- */
  let game = new E.Game();
  let mode = 'idle';          // idle | ai | replay
  let replayIdx = 0;
  const SPEEDS = [4, 15, 40, 120, 400, 4000];
  const SPEED_TXT = ['4 步/秒', '15 步/秒', '40 步/秒', '120 步/秒', '400 步/秒', '瞬间'];
  let speedIdx = 2;
  let acc = 0, lastT = performance.now();

  const $ = id => document.getElementById(id);
  const ui = {
    steps: $('stat-steps'), apples: $('stat-apples'), len: $('stat-len'), status: $('stat-status'),
    opt: $('stat-opt'), gap: $('stat-gap'),
    btnNew: $('btn-new'), btnAI: $('btn-ai'), btnStep: $('btn-step'),
    btnFinish: $('btn-finish'), btnReplay: $('btn-replay'),
    speed: $('speed'), speedTxt: $('speed-txt'),
    note: $('note'), replayBar: $('replay-bar'), replayRange: $('replay-range'), replayTxt: $('replay-txt')
  };

  /* ---------------- 取当前要画的帧 ---------------- */
  function view() {
    if (mode === 'replay' && game.history.length) {
      const h = game.history[Math.min(replayIdx, game.history.length - 1)];
      return { snake: h.snake, apples: h.apples, target: h.target, path: null, steps: h.steps, status: h.status };
    }
    return {
      snake: game.snake.map(p => [p.x, p.y]),
      apples: game.apples.map(a => [a.x, a.y]),
      target: (game.plan && game.plan.order && game.plan.order[0]) ? [game.plan.order[0].x, game.plan.order[0].y] : null,
      path: game.path,
      steps: game.steps,
      status: game.status
    };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function draw() {
    const f = view();
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(bg, 0, 0, SIZE, SIZE);

    // 规划路线（淡淡的小点）
    if (f.path && f.path.length) {
      ctx.fillStyle = 'rgba(37,99,235,0.20)';
      for (let i = 0; i < f.path.length; i++) {
        const p = f.path[i];
        ctx.fillRect(p.x * CELL + 2.6, p.y * CELL + 2.6, 1.8, 1.8);
      }
    }

    // 当前目标的蓝色光圈
    if (f.target) {
      ctx.strokeStyle = 'rgba(37,99,235,0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(f.target[0] * CELL + CELL / 2, f.target[1] * CELL + CELL / 2, CELL * 0.95, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 苹果
    for (let i = 0; i < f.apples.length; i++) {
      const a = f.apples[i];
      const cx = a[0] * CELL + CELL / 2, cy = a[1] * CELL + CELL / 2;
      ctx.fillStyle = '#e5484d';
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(cx - CELL * 0.12, cy - CELL * 0.12, CELL * 0.10, 0, Math.PI * 2);
      ctx.fill();
    }

    // 蛇
    const s = f.snake;
    for (let i = s.length - 1; i >= 0; i--) {
      const p = s[i];
      if (i === 0) {
        ctx.fillStyle = '#0b6b38';
      } else {
        const t = s.length > 1 ? i / (s.length - 1) : 0;
        ctx.fillStyle = `hsl(148, ${46 - 10 * t}%, ${36 + 16 * t}%)`;
      }
      roundRect(p[0] * CELL + 0.5, p[1] * CELL + 0.5, CELL - 1, CELL - 1, i === 0 ? 2.4 : 1.8);
    }
  }

  /* ---------------- 面板 ---------------- */
  function statusText(f) {
    if (f.status === 'ready') return '待开始';
    if (f.status === 'running') return '进行中';
    if (f.status === 'win') return '通关 ✓';
    return '撞毁 ×';
  }

  function updateUI() {
    const f = view();
    ui.steps.textContent = f.steps;
    ui.apples.textContent = f.apples.length;
    ui.len.textContent = f.snake.length;
    ui.status.textContent = statusText(f);
    ui.status.className = 'v ' + (f.status === 'win' ? 'ok' : f.status === 'over' ? 'bad' : '');
    ui.opt.textContent = game.optTotal ? game.optTotal + ' 步' : '--';
    ui.gap.textContent = (f.status === 'win' || f.status === 'over') ? (f.steps - game.optTotal) + ' 步' : '--';

    const ended = f.status === 'over' || f.status === 'win';
    ui.btnAI.disabled = ended;
    ui.btnAI.textContent = mode === 'ai' ? '暂停' : (f.status === 'running' ? '继续' : 'AI 自动玩');
    ui.btnStep.disabled = ended || mode === 'replay';
    ui.btnFinish.disabled = ended || mode === 'replay';
    ui.btnReplay.disabled = game.history.length < 2;
    ui.btnReplay.textContent = mode === 'replay' ? '退出回放' : '看回放';

    ui.replayBar.style.display = mode === 'replay' ? 'block' : 'none';
    if (mode === 'replay') {
      ui.replayRange.max = String(game.history.length - 1);
      ui.replayRange.value = String(replayIdx);
      ui.replayTxt.textContent = `回放 ${replayIdx} / ${game.history.length - 1} 步`;
    }

    // 底部说明
    let note;
    if (mode === 'replay') {
      note = '正在回放历史轨迹。拖动进度条可以逐帧查看，每帧记录当时的蛇身、苹果和步数。';
    } else if (f.status === 'win') {
      note = `10 个苹果全部吃完，总步数 <b>${game.steps}</b>。规划下界 ${game.optTotal} 步，多走 ${game.steps - game.optTotal} 步。`;
    } else if (f.status === 'over') {
      note = `游戏结束：${game.deathReason}，本局成绩无效。点"新开一局"再来。`;
    } else if (mode === 'ai') {
      note = f.target
        ? `AI 正在前往苹果 (${f.target[0]}, ${f.target[1]})，剩余路线 ${f.path ? f.path.length : 0} 步。`
        : 'AI 正在规划路线…';
    } else {
      note = '点"AI 自动玩"，蛇会自动规划：先用 BFS 算真实最短路径，再用动态规划排出吃 10 个苹果的最优顺序。';
    }
    ui.note.innerHTML = note;
  }

  /* ---------------- 主循环 ---------------- */
  function loop(t) {
    const dt = Math.min(t - lastT, 250);
    lastT = t;
    const sps = SPEEDS[speedIdx];

    if (mode === 'ai' && (game.status === 'ready' || game.status === 'running')) {
      acc += dt;
      const iv = 1000 / sps;
      let guard = 0;
      while (acc >= iv && guard++ < 5000) {
        acc -= iv;
        game.aiStep();
        if (game.status === 'over' || game.status === 'win') { mode = 'idle'; acc = 0; break; }
      }
      if (guard >= 5000) acc = 0;
    } else if (mode === 'replay') {
      acc += dt;
      const iv = 1000 / Math.min(sps, 400);
      let guard = 0;
      while (acc >= iv && guard++ < 600) {
        acc -= iv;
        if (replayIdx < game.history.length - 1) replayIdx++;
        else { mode = 'idle'; break; }
      }
    } else {
      acc = 0;
    }

    draw();
    updateUI();
    requestAnimationFrame(loop);
  }

  /* ---------------- 交互 ---------------- */
  function newGame() {
    mode = 'idle';
    acc = 0;
    game = new E.Game();
    replayIdx = 0;
  }

  ui.btnNew.addEventListener('click', newGame);
  ui.btnAI.addEventListener('click', () => {
    if (game.status === 'over' || game.status === 'win') return;
    mode = mode === 'ai' ? 'idle' : 'ai';
    acc = 0;
  });
  ui.btnStep.addEventListener('click', () => {
    if (game.status === 'over' || game.status === 'win') return;
    mode = 'idle';
    game.aiStep();
    acc = 0;
  });
  ui.btnFinish.addEventListener('click', () => {
    if (game.status === 'over' || game.status === 'win') return;
    mode = 'idle';
    game.runToEnd();
  });
  ui.btnReplay.addEventListener('click', () => {
    if (mode === 'replay') { mode = 'idle'; return; }
    if (game.history.length < 2) return;
    mode = 'replay';
    replayIdx = 0;
    acc = 0;
  });
  ui.replayRange.addEventListener('input', e => {
    replayIdx = parseInt(e.target.value, 10) || 0;
  });
  ui.speed.addEventListener('input', e => {
    speedIdx = parseInt(e.target.value, 10);
    ui.speedTxt.textContent = SPEED_TXT[speedIdx];
    acc = 0;
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); ui.btnAI.click(); }
    else if (e.key === 'r' || e.key === 'R') newGame();
    else if (e.key === 'ArrowRight' && mode === 'replay') { replayIdx = Math.min(replayIdx + 1, game.history.length - 1); mode = 'idle'; }
    else if (e.key === 'ArrowLeft' && mode === 'replay') { replayIdx = Math.max(replayIdx - 1, 0); mode = 'idle'; }
  });

  ui.speedTxt.textContent = SPEED_TXT[speedIdx];
  requestAnimationFrame(loop);
})();
