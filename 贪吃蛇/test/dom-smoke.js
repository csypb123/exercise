// 用最小 DOM 桩跑一遍 app.js，检查界面脚本有没有运行时错误
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function makeEl(id) {
  const el = {
    id,
    disabled: false,
    value: '0',
    max: '0',
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    _h: {},
    addEventListener(type, fn) { (this._h[type] = this._h[type] || []).push(fn); },
    fire(type, ev) { (this._h[type] || []).forEach(f => f.call(this, ev || { target: this })); }
  };
  return el;
}

const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    return typeof k === 'string' ? (() => {}) : undefined;
  },
  set(t, k, v) { t[k] = v; return true; }
});

const els = {};
[
  'board', 'stat-steps', 'stat-apples', 'stat-len', 'stat-status', 'stat-opt', 'stat-gap', 'stat-recent',
  'stat-recent-label',
  'btn-new', 'btn-ai', 'btn-step', 'btn-finish', 'btn-replay', 'btn-stats',
  'speed', 'speed-txt', 'note', 'replay-bar', 'replay-range', 'replay-txt',
  'stats-modal', 'stats-body', 'stats-sub', 'stats-close'
].forEach(id => { els[id] = makeEl(id); });

els['stats-modal'].hidden = true;   // 对应 HTML 上的 hidden 属性

els.board.getContext = () => ctxStub;
els.board.width = 700;
els.board.height = 700;
els.speed.value = '2';

const rafQueue = [];
const memStore = {};
const sandbox = {
  console,
  Math,
  Date,
  performance: { now: () => t },
  devicePixelRatio: 2,
  localStorage: {
    getItem: k => (k in memStore ? memStore[k] : null),
    setItem: (k, v) => { memStore[k] = String(v); },
    removeItem: k => { delete memStore[k]; }
  },
  requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
  document: {
    getElementById: id => els[id] || null,
    createElement: () => {
      const c = makeEl('bg');
      c.getContext = () => ctxStub;
      return c;
    },
    addEventListener: () => {}
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

let t = 0;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'engine.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8'), sandbox);

function frames(n, dtMs) {
  for (let i = 0; i < n; i++) {
    const fn = rafQueue.shift();
    if (!fn) throw new Error('requestAnimationFrame 队列空了，主循环断了');
    t += (dtMs || 16);
    fn(t);
  }
}

// 1) 空转几帧
frames(5);
console.log('初始状态 ->', els['stat-steps'].textContent, els['stat-apples'].textContent, els['stat-status'].textContent);

// 2) 点"AI 自动玩"（默认 40 步/秒），跑 3 秒虚拟时间
els['btn-ai'].fire('click');
frames(190);
console.log('跑 3 秒后 ->', '步数', els['stat-steps'].textContent, '剩余苹果', els['stat-apples'].textContent, '状态', els['stat-status'].textContent);

// 3) 一键跑完
els['btn-finish'].fire('click');
frames(3);
console.log('一键跑完 ->', '步数', els['stat-steps'].textContent, '状态', els['stat-status'].textContent);

// 4) 回放
els['btn-replay'].fire('click');
frames(60);
console.log('回放中 ->', els['replay-txt'].textContent, '| 进度条 max', els['replay-range'].max);

// 5) 拖动进度条到末尾 + 新开一局
els['replay-range'].value = '999';
els['replay-range'].fire('input', { target: els['replay-range'] });
frames(2);
els['btn-new'].fire('click');
frames(2);
console.log('新开一局 ->', '步数', els['stat-steps'].textContent, '剩余苹果', els['stat-apples'].textContent, '状态', els['stat-status'].textContent);
console.log('面板文案 ->', els['stat-opt'].textContent, '|', els['note'].innerHTML.slice(0, 40));

// 6) 成绩统计窗口：刚跑完的一局应已记账
function assert(ok, msg) {
  if (!ok) { console.error('FAIL: ' + msg); process.exitCode = 1; }
}
const saved = JSON.parse(memStore['snake-recent-games-v1'] || '[]');
console.log('已存成绩 ->', saved.length, '局，步数', saved.map(g => g.steps).join('/'));
console.log('侧栏近 10 局均步 ->', els['stat-recent-label'].textContent, els['stat-recent'].textContent);
assert(els['stat-recent-label'].textContent === '近 10 局均步', '侧栏标签应由 RECENT 生成，实际：' + els['stat-recent-label'].textContent);

els['btn-stats'].fire('click');
const body = els['stats-body'].innerHTML;
console.log('统计窗口 hidden ->', els['stats-modal'].hidden, '| 副标题 ->', els['stats-sub'].textContent);
console.log('统计窗口内容 ->', body.replace(/\s+/g, ' ').slice(0, 96));

assert(saved.length === 1, '通关局应被记录 1 次，实际 ' + saved.length);
assert(saved[0] && saved[0].status === 'win', '记录状态应为 win');
assert(els['stats-modal'].hidden === false, '点按钮后窗口应显示');
const wantAvg = saved[0].steps.toFixed(1);
assert(body.indexOf(wantAvg) >= 0, '平均步数应为 ' + wantAvg + '，实际：' + body.slice(0, 80));
assert(els['stat-recent'].textContent === wantAvg + ' 步', '侧栏均步应为 ' + wantAvg + ' 步，实际：' + els['stat-recent'].textContent);

els['stats-close'].fire('click');
console.log('点 × 关闭后 hidden ->', els['stats-modal'].hidden);
assert(els['stats-modal'].hidden === true, '点 × 后窗口应隐藏');

// 7) 再连开两局，验证多局平均与窗口容量
for (let i = 0; i < 2; i++) {
  els['btn-new'].fire('click');
  frames(2);
  els['btn-finish'].fire('click');
  frames(3);
}
els['btn-stats'].fire('click');
const all = JSON.parse(memStore['snake-recent-games-v1'] || '[]');
const mean = (all.reduce((s, g) => s + g.steps, 0) / all.length).toFixed(1);
console.log('累计成绩 ->', all.length, '局', all.map(g => g.steps).join('/'), '| 平均', mean);
console.log('副标题 ->', els['stats-sub'].textContent);

assert(all.length === 3, '应有 3 局记录，实际 ' + all.length);
assert(els['stats-sub'].textContent.indexOf('最近 3 局') === 0, '副标题应显示"最近 3 局"，实际：' + els['stats-sub'].textContent);
assert(els['stats-body'].innerHTML.indexOf(mean) >= 0, '多局平均应为 ' + mean + '，实际：' + els['stats-body'].innerHTML.slice(0, 80));
assert(els['stat-recent'].textContent === mean + ' 步', '侧栏均步应为 ' + mean + ' 步；如果是旧值说明没刷新');

console.log('SMOKE OK');
