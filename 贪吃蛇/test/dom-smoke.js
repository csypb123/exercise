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
  'board', 'stat-steps', 'stat-apples', 'stat-len', 'stat-status', 'stat-opt', 'stat-gap',
  'btn-new', 'btn-ai', 'btn-step', 'btn-finish', 'btn-replay',
  'speed', 'speed-txt', 'note', 'replay-bar', 'replay-range', 'replay-txt'
].forEach(id => { els[id] = makeEl(id); });

els.board.getContext = () => ctxStub;
els.board.width = 700;
els.board.height = 700;
els.speed.value = '2';

const rafQueue = [];
const sandbox = {
  console,
  Math,
  Date,
  performance: { now: () => t },
  devicePixelRatio: 2,
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
console.log('SMOKE OK');
