/*
 * Oráculo independente dos autômatos: decide se a gramática gera w
 * aplicando as produções diretamente (ponto fixo sobre gera(A, i, j)).
 */
'use strict';
const Gramatica = require('../src/core/gramatica.js');

function gera(g, w) {
  const n = w.length;
  const sub = (i, j) => w.slice(i, j);
  const ok = new Set();
  const k = (A, i, j) => `${A}|${i}|${j}`;
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of g.producoes) {
      const x = Gramatica.palavraDe(p).join('');
      const B = Gramatica.variavelDe(p);
      for (let i = 0; i <= n; i++) {
        for (let j = i; j <= n; j++) {
          const chave = k(p.lhs, i, j);
          if (ok.has(chave)) continue;
          let vale = false;
          if (!B) vale = sub(i, j) === x;
          else if (p.forma === 'unitaria') vale = ok.has(k(B, i, j));
          else if (p.forma === 'direita') vale = j - i >= x.length && sub(i, i + x.length) === x && ok.has(k(B, i + x.length, j));
          else vale = j - i >= x.length && sub(j - x.length, j) === x && ok.has(k(B, i, j - x.length));
          if (vale) { ok.add(chave); mudou = true; }
        }
      }
    }
  }
  return ok.has(k(g.inicial, 0, n));
}

/** Todas as cadeias sobre o alfabeto até o tamanho dado (inclui ε). */
function todasAte(alfabeto, tamanho) {
  const out = [''];
  let nivel = [''];
  for (let t = 1; t <= tamanho; t++) {
    nivel = nivel.flatMap((w) => alfabeto.map((a) => w + a));
    out.push(...nivel);
  }
  return out;
}

module.exports = { gera, todasAte };
