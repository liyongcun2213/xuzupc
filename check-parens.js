const fs = require('fs');

const code = fs.readFileSync('server.js', 'utf8');

let line = 1;
let col = 0;
let stack = [];
let inSingle = false;
let inDouble = false;
let inTemplate = false;
let inLineComment = false;
let inBlockComment = false;
let prev = '';
let lastSingleStart = null;
let lastDoubleStart = null;
let lastTemplateStart = null;

for (let i = 0; i < code.length; i++) {
  const ch = code[i];
  const next = code[i + 1];

  if (ch === '\n') {
    line++;
    col = 0;
    inLineComment = false;
    prev = ch;
    continue;
  }

  col++;

  if (inLineComment) {
    prev = ch;
    continue;
  }

  if (inBlockComment) {
    if (ch === '*' && next === '/') {
      inBlockComment = false;
      i++;
      col++;
      prev = '';
      continue;
    }
    prev = ch;
    continue;
  }

  if (inSingle) {
    if (ch === '\'' && prev !== '\\') {
      inSingle = false;
    }
    prev = ch;
    continue;
  }

  if (inDouble) {
    if (ch === '"' && prev !== '\\') {
      inDouble = false;
    }
    prev = ch;
    continue;
  }

  if (inTemplate) {
    if (ch === '`' && prev !== '\\') {
      inTemplate = false;
    }
    prev = ch;
    continue;
  }

  if (ch === '/' && next === '/') {
    inLineComment = true;
    i++;
    col++;
    prev = '';
    continue;
  }

  if (ch === '/' && next === '*') {
    inBlockComment = true;
    i++;
    col++;
    prev = '';
    continue;
  }

  if (ch === '\'') {
    inSingle = true;
    lastSingleStart = { line, col };
    prev = ch;
    continue;
  }

  if (ch === '"') {
    inDouble = true;
    lastDoubleStart = { line, col };
    prev = ch;
    continue;
  }

  if (ch === '`') {
    inTemplate = true;
    lastTemplateStart = { line, col };
    prev = ch;
    continue;
  }

  if (ch === '(') {
    stack.push({ line, col });
  } else if (ch === ')') {
    if (!stack.length) {
      console.log('Extra ) at', line, col);
    } else {
      stack.pop();
    }
  }

  prev = ch;
}

console.log('Unmatched ( count:', stack.length);
console.log('Stack:', stack);
console.log('inSingle:', inSingle, 'lastSingleStart:', lastSingleStart);
console.log('inDouble:', inDouble, 'lastDoubleStart:', lastDoubleStart);
console.log('inTemplate:', inTemplate, 'lastTemplateStart:', lastTemplateStart);
