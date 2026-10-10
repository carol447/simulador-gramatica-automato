'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Gramatica = require('../src/core/gramatica.js');

const ler = (t) => Gramatica.ler(t);

test('lê alternativas, setas variadas, comentários e continuação com |', () => {
  const { gramatica: g, erros } = ler(`
    # paridade de a
    S -> aA | bS
    A → aS
      | bA | ε   # continua A
  `);
  assert.deepEqual(erros, []);
  assert.equal(g.inicial, 'S');
  assert.deepEqual(g.variaveis, ['S', 'A']);
  assert.deepEqual(g.terminais, ['a', 'b']);
  assert.equal(g.producoes.length, 5);
  assert.deepEqual(g.producoes.at(-1).rhs, []);
});

test('o inicial é o lado esquerdo da primeira regra, mesmo sem S', () => {
  const { gramatica: g } = ler('X -> aY\nY -> b');
  assert.equal(g.inicial, 'X');
});

test('aceita variáveis com dígitos e apóstrofo, terminais numéricos e marcas de vazio', () => {
  const { gramatica: g, erros } = ler("S -> 0A1 | λ\nA1 -> 1S | B'\nB' -> &");
  assert.deepEqual(erros, []);
  assert.deepEqual(g.variaveis, ['S', 'A1', "B'"]);
  assert.deepEqual(g.terminais, ['0', '1']);
});

test('aponta a linha de cada erro de sintaxe', () => {
  const { gramatica, erros } = ler('S -> aA\nA aB\nb -> a\nB -> a+b\nC -> a |');
  assert.equal(gramatica, null);
  assert.deepEqual(erros.map((e) => e.linha), [2, 3, 4, 5]);
  assert.match(erros[0].mensagem, /falta a seta/);
  assert.match(erros[1].mensagem, /não é uma variável/);
  assert.match(erros[2].mensagem, /"\+" não reconhecido/);
  assert.match(erros[3].mensagem, /alternativa vazia/);
});

test('recusa produção não linear', () => {
  const { erros } = ler('S -> aSb');
  assert.match(erros[0].mensagem, /não é linear/);
  assert.match(ler('S -> AB').erros[0].mensagem, /não é linear/);
});

test('detecta o tipo: GLUD, GLD, GLUE, GLE', () => {
  const tipo = (t) => Gramatica.resolverTipo(ler(t).gramatica, 'auto').tipo;
  assert.equal(tipo('S -> aS | b'), 'GLUD');
  assert.equal(tipo('S -> abS | b'), 'GLD');
  assert.equal(tipo('S -> Sa | b'), 'GLUE');
  assert.equal(tipo('S -> Sab | b'), 'GLE');
  assert.equal(tipo('S -> a | ε'), 'GLUD'); // serve para os dois lados
});

test('recusa gramática mista e explica por quê', () => {
  const g = ler('S -> aA\nA -> Sb | ε').gramatica;
  const r = Gramatica.resolverTipo(g, 'auto');
  assert.match(r.erros[0].mensagem, /mistura produções/);
  assert.equal(r.erros[0].linha, 2);
});

test('o tipo escolhido é validado contra a gramática', () => {
  const g = ler('S -> abS | a').gramatica;
  const glud = Gramatica.resolverTipo(g, 'GLUD');
  assert.match(glud.erros[0].mensagem, /\|w\| = 2/);
  const gle = Gramatica.resolverTipo(g, 'GLE');
  assert.match(gle.erros[0].mensagem, /GLE só aceita/);
  assert.deepEqual(Gramatica.resolverTipo(g, 'GLD'), { tipo: 'GLD', direcao: 'direita' });
  // Sem produções com variável, a mesma gramática serve como GLE.
  assert.equal(Gramatica.resolverTipo(ler('S -> a | ε').gramatica, 'GLUE').direcao, 'esquerda');
});

test('avisa sobre variáveis sem regra, inalcançáveis e improdutivas', () => {
  const { avisos } = ler('S -> aA | bB\nA -> aA\nC -> c');
  const texto = avisos.map((a) => a.mensagem).join('\n');
  assert.match(texto, /B é usada mas não tem regras/);
  assert.match(texto, /C não é alcançável/);
  assert.match(texto, /A nunca termina/);
  assert.match(texto, /linguagem é vazia/);
});

test('formatar agrupa as alternativas', () => {
  const { gramatica } = ler('S -> aS\nS -> b\nS -> eps');
  assert.equal(Gramatica.formatar(gramatica), 'S -> aS | b | ε');
});
