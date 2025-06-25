import fs from 'fs';

const rust = JSON.parse(fs.readFileSync('rust.json','utf8'));
const js   = JSON.parse(fs.readFileSync('js.json',  'utf8'));

console.log('rust.length =', rust.length);
console.log('js.length   =', js.length);
console.log('same length?', rust.length === js.length);

const diffs = rust
  .map((v,i) => ({ i, rust: v, js: js[i] }))
  .filter(x => x.rust !== x.js);

if (diffs.length === 0) {
  console.log('✅ arrays are identical');
} else {
  console.error('❌ found diffs:', diffs);
  process.exit(1);
}
