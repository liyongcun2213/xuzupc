const fs = require('fs');
const acorn = require('acorn');

const code = fs.readFileSync('server.js', 'utf8');

try {
  acorn.parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    locations: true
  });
  console.log('Parse OK');
} catch (e) {
  console.log('Parse error:');
  console.log('Message:', e.message);
  console.log('Location:', e.loc);
}
