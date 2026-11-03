// 用 Node 批量跑 AI，验证：能不能全部通关、步数是否接近规划下界、有没有卡死/自撞
const path = require('path');
require(path.join(__dirname, '..', 'src', 'engine.js'));
const { Game } = globalThis.Engine;

const ROUNDS = 200;
let win = 0, over = 0, maxStuck = 0;
const steps = [], gaps = [];
const t0 = Date.now();

for (let i = 0; i < ROUNDS; i++) {
  const g = new Game(i + 1);
  const opt = g.optTotal;
  g.runToEnd();
  if (g.status === 'win') {
    win++;
    steps.push(g.steps);
    gaps.push(g.steps - opt);
    if (g.steps - opt > maxStuck) maxStuck = g.steps - opt;
  } else {
    over++;
    if (over <= 3) console.log('  失败局:', g.steps, g.status, g.deathReason, 'seed', g.seed);
  }
}

const avg = a => (a.reduce((x, y) => x + y, 0) / a.length);
steps.sort((a, b) => a - b);

console.log(`局数 ${ROUNDS}  通关 ${win}  失败 ${over}  用时 ${Date.now() - t0}ms`);
console.log(`步数  最短 ${steps[0]}  中位 ${steps[(steps.length / 2) | 0]}  平均 ${avg(steps).toFixed(1)}  最长 ${steps[steps.length - 1]}`);
console.log(`与规划下界的差距  平均 ${avg(gaps).toFixed(2)}  最大 ${maxStuck}`);
