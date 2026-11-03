// 把 engine.js / app.js 内联进 template.html，产出单文件 index.html
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const root = path.join(dir, '..');

const tpl = fs.readFileSync(path.join(dir, 'template.html'), 'utf8');
const engine = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');
const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');

const out = tpl
  .replace('/*{{ENGINE}}*/', () => engine)
  .replace('/*{{APP}}*/', () => app);

fs.writeFileSync(path.join(root, 'index.html'), out, 'utf8');
console.log('已生成 index.html，', out.length, '字符');
