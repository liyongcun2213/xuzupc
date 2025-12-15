const fs = require('fs');
const acorn = require('acorn');

const code = fs.readFileSync('server.js', 'utf8');
const lines = code.split('\n');
const maxLine = parseInt(process.argv[2], 10) || lines.length;
const prefix = lines.slice(0, maxLine).join('\n');

try {
  acorn.parse(prefix, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true
  });
  console.log('Parse OK up to line', maxLine);
} catch (e) {
  console.log('Parse error up to line', maxLine);
  console.log('Message:', e.message);
  console.log('Location:', e.loc);
}
