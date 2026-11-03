/*
 * engine.js —— 贪吃蛇吃豆 · 纯逻辑内核（不依赖 DOM，可在 Node 里直接跑）
 *
 * 规则：
 *   地图 100×100，四周是墙（越界即死）
 *   开局蛇长 3 格，随机位置 + 随机朝向
 *   随机撒 10 个苹果，互不重叠、不在蛇身上
 *   每走 1 格 = 1 步；吃到苹果蛇身 +1
 *   撞墙 / 撞自己 → 游戏结束（本局成绩无效）
 *   10 个苹果吃完 → 通关
 *
 * AI 思路：
 *   1) 用 BFS 在“把蛇身当障碍”的网格上求真实最短路径（不是曼哈顿近似）
 *   2) 用 Held-Karp 动态规划在 10 个苹果上解出精确的访问顺序（TSP 最短巡游）
 *   3) 每走一步前做“安全闸”：模拟落子后做洪水填充，
 *      若剩余自由空间不足以容纳整条蛇，就换目标或改走空间最大的方向，避免把自己困死
 */
(function (root) {
  'use strict';

  const N = 100;                 // 地图边长
  const APPLE_COUNT = 10;        // 苹果数量
  const START_LEN = 3;           // 初始蛇长
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const INF = Infinity;

  // ---- 复用的缓冲区，避免每步新建数组（高速回放时很关键）----
  const DIST = new Int32Array(N * N);
  const PREV = new Int32Array(N * N);
  const QUEUE = new Int32Array(N * N);
  const BLOCKED = new Uint8Array(N * N);
  const SEEN = new Uint8Array(N * N);

  const idx = (x, y) => y * N + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 把蛇身写进障碍表。蛇头自己不算障碍；skipTail 时尾巴那格视为“即将腾空”
  function setBlocked(snake, skipTail) {
    BLOCKED.fill(0);
    const end = skipTail ? snake.length - 1 : snake.length;
    for (let i = 1; i < end; i++) BLOCKED[idx(snake[i].x, snake[i].y)] = 1;
  }

  // 从 (sx,sy) 出发的 BFS，结果写进 DIST / PREV（-1 表示不可达）
  function bfs(sx, sy) {
    DIST.fill(-1);
    PREV.fill(-1);
    const s = idx(sx, sy);
    let qh = 0, qt = 0;
    DIST[s] = 0;
    QUEUE[qt++] = s;
    while (qh < qt) {
      const cur = QUEUE[qh++];
      const cx = cur % N, cy = (cur / N) | 0;
      const nd = DIST[cur] + 1;
      for (let i = 0; i < 4; i++) {
        const nx = cx + DIRS[i][0], ny = cy + DIRS[i][1];
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (DIST[ni] !== -1 || BLOCKED[ni]) continue;
        DIST[ni] = nd;
        PREV[ni] = cur;
        QUEUE[qt++] = ni;
      }
    }
  }

  // 洪水填充：从 (sx,sy) 能走到的格子数（用来判断会不会把自己困死）
  function freeCells(sx, sy) {
    SEEN.fill(0);
    const s = idx(sx, sy);
    if (BLOCKED[s]) return 0;
    let qh = 0, qt = 0, count = 0;
    SEEN[s] = 1;
    QUEUE[qt++] = s;
    count = 1;
    while (qh < qt) {
      const cur = QUEUE[qh++];
      const cx = cur % N, cy = (cur / N) | 0;
      for (let i = 0; i < 4; i++) {
        const nx = cx + DIRS[i][0], ny = cy + DIRS[i][1];
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (SEEN[ni] || BLOCKED[ni]) continue;
        SEEN[ni] = 1;
        QUEUE[qt++] = ni;
        count++;
      }
    }
    return count;
  }

  class Game {
    constructor(seed) {
      this.seed = (seed === undefined || seed === null) ? ((Math.random() * 1e9) | 0) : seed;
      this.rng = mulberry32(this.seed);
      this.reset();
    }

    /* ---------------- 开局 ---------------- */
    reset(seed) {
      if (seed !== undefined && seed !== null) {
        this.seed = seed;
        this.rng = mulberry32(seed);
      }
      const r = this.rng;

      // 随机朝向 + 随机位置（留边距，保证蛇身整条都在场内）
      const d = DIRS[Math.floor(r() * 4)];
      const hx = 10 + Math.floor(r() * (N - 20));
      const hy = 10 + Math.floor(r() * (N - 20));
      this.snake = [];
      for (let i = 0; i < START_LEN; i++) {
        this.snake.push({ x: hx - i * d[0], y: hy - i * d[1] });
      }
      this.dir = { x: d[0], y: d[1] };

      // 10 个苹果：不重叠、不落在蛇身上
      this.apples = [];
      const used = new Set(this.snake.map(p => idx(p.x, p.y)));
      let guard = 0;
      while (this.apples.length < APPLE_COUNT && guard++ < 100000) {
        const x = 2 + Math.floor(r() * (N - 4));
        const y = 2 + Math.floor(r() * (N - 4));
        const k = idx(x, y);
        if (used.has(k)) continue;
        used.add(k);
        this.apples.push({ x, y });
      }

      this.steps = 0;
      this.status = 'ready';      // ready | running | over | win
      this.deathReason = '';
      this.history = [];
      this.path = [];             // 当前路线（用于画面上的虚线引导）
      this.plan = this.computePlan();
      this.optTotal = this.plan.total;  // 规划出来的最短巡游长度（参考下界）
      this.record();
    }

    /* -------- 规划：BFS 距离矩阵 + Held-Karp 精确最短巡游 -------- */
    computePlan() {
      const head = this.snake[0];
      const n = this.apples.length;
      if (n === 0) return { order: [], total: 0 };

      setBlocked(this.snake, true);
      bfs(head.x, head.y);
      const fromHead = this.apples.map(a => DIST[idx(a.x, a.y)]);

      const keep = [];
      for (let i = 0; i < n; i++) if (fromHead[i] >= 0) keep.push(i);
      if (keep.length === 0) return { order: [], total: 0 };

      const k = keep.length;
      const pts = keep.map(i => this.apples[i]);

      // 两两之间的真实最短步数（苹果之间也是 BFS，不是曼哈顿）
      const dm = [];
      for (let i = 0; i < k; i++) {
        setBlocked(this.snake, true);
        bfs(pts[i].x, pts[i].y);
        const row = new Array(k);
        for (let j = 0; j < k; j++) {
          const d = DIST[idx(pts[j].x, pts[j].y)];
          row[j] = d >= 0 ? d : Math.abs(pts[j].x - pts[i].x) + Math.abs(pts[j].y - pts[i].y);
        }
        dm.push(row);
      }
      const d0 = keep.map(i => {
        const d = fromHead[i];
        return d >= 0 ? d : Math.abs(this.apples[i].x - head.x) + Math.abs(this.apples[i].y - head.y);
      });

      // Held-Karp DP：dp[mask][last]
      const full = 1 << k;
      const dp = new Float64Array(full * k).fill(INF);
      const par = new Int8Array(full * k).fill(-1);
      for (let i = 0; i < k; i++) dp[(1 << i) * k + i] = d0[i];

      for (let mask = 1; mask < full; mask++) {
        for (let i = 0; i < k; i++) {
          if (!(mask & (1 << i))) continue;
          const cur = dp[mask * k + i];
          if (cur === INF) continue;
          for (let j = 0; j < k; j++) {
            if (mask & (1 << j)) continue;
            const nm = mask | (1 << j);
            const nc = cur + dm[i][j];
            if (nc < dp[nm * k + j]) {
              dp[nm * k + j] = nc;
              par[nm * k + j] = i;
            }
          }
        }
      }

      let bestI = 0, bestCost = INF;
      for (let i = 0; i < k; i++) {
        const c = dp[(full - 1) * k + i];
        if (c < bestCost) { bestCost = c; bestI = i; }
      }

      const order = [];
      let mask = full - 1, i = bestI;
      while (i !== -1) {
        order.push(pts[i]);
        const p = par[mask * k + i];
        mask &= ~(1 << i);
        i = p;
      }
      order.reverse();
      return { order, total: bestCost === INF ? 0 : bestCost };
    }

    /* -------- 单步决策：返回下一步坐标 -------- */
    chooseMove() {
      if (this.apples.length === 0) return null;
      const head = this.snake[0];

      for (let attempt = 0; attempt < 4; attempt++) {
        if (!this.plan || !this.plan.order || this.plan.order.length === 0) {
          this.plan = this.computePlan();
          if (!this.plan.order.length) break;
        }
        // 去掉已经被吃掉的（或已不在场的）目标
        while (this.plan.order.length && !this.apples.some(a => a.x === this.plan.order[0].x && a.y === this.plan.order[0].y)) {
          this.plan.order.shift();
        }
        if (!this.plan.order.length) break;

        const target = this.plan.order[0];
        setBlocked(this.snake, true);
        bfs(head.x, head.y);
        const ti = idx(target.x, target.y);
        if (DIST[ti] < 0) { this.plan = null; continue; }   // 目标被围死 → 重新规划

        const step = this.firstStep(ti);
        if (!step) { this.plan = null; continue; }

        if (this.isSafe(step)) {
          this.path = this.buildPath(ti);
          return step;
        }
        this.plan = null;   // 这一步会把蛇困住 → 重新规划
      }

      this.path = [];
      return this.survivalMove();
    }

    firstStep(ti) {
      const path = [];
      let cur = ti;
      while (PREV[cur] !== -1) {
        path.push(cur);
        cur = PREV[cur];
      }
      if (path.length === 0) return null;
      const c = path[path.length - 1];
      return { x: c % N, y: (c / N) | 0 };
    }

    buildPath(ti) {
      const path = [];
      let cur = ti;
      while (PREV[cur] !== -1) {
        path.push({ x: cur % N, y: (cur / N) | 0 });
        cur = PREV[cur];
      }
      return path.reverse();
    }

    // 模拟落子后的蛇（吃苹果则不变尾巴，否则去尾）
    simulate(step) {
      if (!inb(step.x, step.y)) return null;
      const eating = this.apples.some(a => a.x === step.x && a.y === step.y);
      const limit = eating ? this.snake.length : this.snake.length - 1;
      for (let i = 0; i < limit; i++) {
        if (this.snake[i].x === step.x && this.snake[i].y === step.y) return null;
      }
      const arr = [{ x: step.x, y: step.y }];
      for (let i = 0; i < limit; i++) arr.push(this.snake[i]);
      return arr;
    }

    // 安全闸：走完这一步之后，蛇头还能活动的空间够不够长
    isSafe(step) {
      const ns = this.simulate(step);
      if (!ns) return false;
      BLOCKED.fill(0);
      for (let i = 1; i < ns.length; i++) BLOCKED[idx(ns[i].x, ns[i].y)] = 1;
      const free = freeCells(step.x, step.y);
      return free >= ns.length + 2;
    }

    // 兜底：往“剩余空间最大”的方向跑
    survivalMove() {
      const head = this.snake[0];
      let best = null, bestFree = -1;
      for (let i = 0; i < 4; i++) {
        const step = { x: head.x + DIRS[i][0], y: head.y + DIRS[i][1] };
        const ns = this.simulate(step);
        if (!ns) continue;
        BLOCKED.fill(0);
        for (let j = 1; j < ns.length; j++) BLOCKED[idx(ns[j].x, ns[j].y)] = 1;
        const free = freeCells(step.x, step.y);
        if (free > bestFree) { bestFree = free; best = step; }
      }
      return best;
    }

    /* -------- 落子：碰撞判定 + 计步 + 吃豆 -------- */
    applyStep(step) {
      const head = this.snake[0];
      const nx = step.x, ny = step.y;

      if (!inb(nx, ny)) { this.die('撞墙'); return; }

      const ai = this.apples.findIndex(a => a.x === nx && a.y === ny);
      const eating = ai >= 0;
      const limit = eating ? this.snake.length : this.snake.length - 1;
      for (let i = 0; i < limit; i++) {
        if (this.snake[i].x === nx && this.snake[i].y === ny) { this.die('撞到自己'); return; }
      }

      this.dir = { x: nx - head.x, y: ny - head.y };
      this.snake.unshift({ x: nx, y: ny });
      this.steps++;

      if (eating) {
        this.apples.splice(ai, 1);
        if (this.apples.length === 0) this.status = 'win';
      } else {
        this.snake.pop();
      }
      this.record();
    }

    die(reason) {
      this.status = 'over';
      this.deathReason = reason;
      this.record();
    }

    aiStep() {
      if (this.status === 'over' || this.status === 'win') return false;
      if (this.status === 'ready') this.status = 'running';
      const mv = this.chooseMove();
      if (!mv) { this.die('无路可走'); return false; }
      this.applyStep(mv);
      return true;
    }

    runToEnd(maxSteps) {
      const cap = maxSteps || 20000;
      let n = 0;
      while (this.status !== 'over' && this.status !== 'win' && n++ < cap) this.aiStep();
      return this.steps;
    }

    record() {
      this.history.push({
        snake: this.snake.map(p => [p.x, p.y]),
        apples: this.apples.map(a => [a.x, a.y]),
        steps: this.steps,
        status: this.status,
        target: (this.plan && this.plan.order && this.plan.order[0])
          ? [this.plan.order[0].x, this.plan.order[0].y]
          : null
      });
    }
  }

  root.Engine = { Game, N, APPLE_COUNT, START_LEN, DIRS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
