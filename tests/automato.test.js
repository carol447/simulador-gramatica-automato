'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Automato = require('../src/core/automato.js');
const Pipeline = require('../src/core/pipeline.js');
const Layout = require('../src/core/layout.js');
const { gera, todasAte } = require('./oraculo.js');

const EXEMPLOS = {
  // número par de a (b livre)
  parA: 'S -> aA | bS | ε\nA -> aS | bA',
  // termina em ab, linear à esquerda
  terminaAbEsq: 'S -> Ab\nA -> Aa | Ab | a',
  // GLD com palavras longas e produção unitária
  estendida: 'S -> abS | B\nB -> ba | cB | ε',
  // a*b* com unitárias encadeadas, à esquerda
  unitariasEsq: 'S -> Sb | A\nA -> Aa | C\nC -> ε',
  // linguagem finita
  finita: 'S -> aA | b\nA -> b | bb',
  // binários múltiplos de 3 (terminais numéricos)
  mult3: 'S -> 0S | 1A | ε\nA -> 0B | 1S\nB -> 0A | 1B',
  // ciclo de unitárias
  cicloUnitario: 'S -> A | a\nA -> S | bA',
  // vazia
  vazia: 'S -> aS',
};

for (const [nome, texto] of Object.entries(EXEMPLOS)) {
  test(`${nome}: AFN-ε, AFN, AFD e mínimo concordam com a gramática em todas as cadeias até 7`, () => {
    const r = Pipeline.processar(texto);
    assert.ok(r.ok, JSON.stringify(r.erros));
    const automatos = Object.values(r.etapas).map((e) => e.af);
    const alfabeto = r.gramatica.terminais;
    for (const w of todasAte(alfabeto, 7)) {
      const esperado = gera(r.gramatica, w);
      for (const af of automatos) assert.equal(Automato.aceita(af, w), esperado, `${nome}: "${w}"`);
    }
  });
}

test('o AFN não tem ε e o AFD é determinístico', () => {
  const r = Pipeline.processar(EXEMPLOS.estendida);
  assert.equal(Automato.temEpsilon(r.etapas.afne.af), true);
  assert.equal(Automato.temEpsilon(r.etapas.afn.af), false);
  assert.equal(Automato.ehDeterministico(r.etapas.afd.af), true);
  assert.equal(Automato.ehDeterministico(r.etapas.min.af), true);
});

test('produções longas geram estados intermediários', () => {
  const r = Pipeline.processar('S -> abcS | d');
  const ids = r.etapas.afne.af.estados.map((e) => e.id);
  assert.deepEqual(ids, ['S', 'q1', 'q2', 'qf']);
  assert.deepEqual(r.etapas.afne.passos[0].transicoes, [
    { de: 'S', simbolo: 'a', para: 'q1' },
    { de: 'q1', simbolo: 'b', para: 'q2' },
    { de: 'q2', simbolo: 'c', para: 'S' },
  ]);
});

test('linear à esquerda: inicial q0 e final = símbolo inicial', () => {
  const { af } = Pipeline.processar(EXEMPLOS.terminaAbEsq).etapas.afne;
  assert.equal(af.inicial, 'q0');
  assert.deepEqual(af.finais, ['S']);
  // S -> Ab vira A --b--> S
  assert.ok(af.transicoes.some((t) => t.de === 'A' && t.simbolo === 'b' && t.para === 'S'));
});

test('a mesma linguagem pela direita e pela esquerda dá o mesmo AFD mínimo', () => {
  const dir = Pipeline.processar('S -> aS | bA\nA -> bA | ε'); // a*b+
  const esq = Pipeline.processar('S -> Sb | Ab\nA -> Aa | ε');  // a*b+
  assert.equal(dir.etapas.min.af.estados.length, 2);
  assert.equal(esq.etapas.min.af.estados.length, 2);
  assert.deepEqual(Automato.equivalentes(dir.etapas.min.af, esq.etapas.min.af).equivalentes, true);
  assert.deepEqual(dir.etapas.min.af.transicoes, esq.etapas.min.af.transicoes);
});

test('minimização: múltiplos de 3 em binário têm exatamente 3 estados', () => {
  const r = Pipeline.processar(EXEMPLOS.mult3);
  assert.equal(r.etapas.min.af.estados.length, 3);
  assert.ok(r.etapas.min.rodadas.length >= 2);
});

test('minimização junta estados equivalentes e registra as rodadas', () => {
  // D0 -a-> D1, D0 -b-> D2; D1 e D2 são finais e equivalentes.
  const afd = {
    estados: ['p', 'q', 'r'].map((id) => ({ id, rotulo: id })),
    alfabeto: ['a', 'b'],
    inicial: 'p',
    finais: ['q', 'r'],
    transicoes: [
      { de: 'p', simbolo: 'a', para: 'q' }, { de: 'p', simbolo: 'b', para: 'r' },
      { de: 'q', simbolo: 'a', para: 'q' }, { de: 'r', simbolo: 'a', para: 'r' },
    ],
  };
  const { af, rodadas, blocos } = Automato.minimizar(afd);
  assert.equal(af.estados.length, 2);
  assert.deepEqual(blocos[1].membros, ['q', 'r']);
  assert.deepEqual(rodadas[0], [['p', '∅'], ['q', 'r']]); // {não finais + erro}, {finais}
  assert.throws(() => Automato.minimizar({ ...afd, transicoes: [...afd.transicoes, { de: 'p', simbolo: 'a', para: 'r' }] }), /determinístico/);
});

test('simulação passo a passo registra estados ativos e transições usadas', () => {
  const { af } = Pipeline.processar('S -> aA\nA -> bA | ε').etapas.afne;
  const r = Automato.simular(af, 'abb');
  assert.equal(r.aceita, true);
  assert.equal(r.passos.length, 4);
  assert.deepEqual(r.passos[0].ativos, ['S']);
  assert.deepEqual(r.passos[1].ativos, ['A', 'qf']);
  const usadas = r.passos[1].transicoes.map((i) => af.transicoes[i]);
  assert.deepEqual(usadas.map((t) => `${t.de}${t.simbolo || 'ε'}${t.para}`), ['SaA', 'Aεqf']);
  assert.deepEqual(Automato.simular(af, 'ac').foraDoAlfabeto, ['c']);
  assert.equal(Automato.simular(af, 'ac').aceita, false);
});

test('equivalência devolve o menor contraexemplo', () => {
  const a = Pipeline.processar('S -> aS | ε').etapas.min.af;
  const b = Pipeline.processar('S -> aA | ε\nA -> aS').etapas.min.af; // (aa)*
  const r = Automato.equivalentes(a, b);
  assert.equal(r.equivalentes, false);
  assert.equal(r.contraexemplo, 'a');
});

test('palavras em ordem de tamanho e depois alfabética', () => {
  const { af } = Pipeline.processar(EXEMPLOS.parA).etapas.afn;
  assert.deepEqual(Automato.palavras(af, 2, 10), ['', 'b', 'aa', 'bb']);
  assert.deepEqual(Automato.palavras(Pipeline.processar(EXEMPLOS.vazia).etapas.afn.af, 5), []);
});

test('classifica a linguagem como vazia, finita ou infinita', () => {
  assert.deepEqual(Pipeline.processar(EXEMPLOS.vazia).linguagem, { tipo: 'vazia' });
  assert.deepEqual(Pipeline.processar(EXEMPLOS.finita).linguagem, { tipo: 'finita', quantidade: 3, maiorTamanho: 3 });
  assert.deepEqual(Pipeline.processar(EXEMPLOS.parA).linguagem, { tipo: 'infinita' });
});

test('a gramática equivalente gerada a partir do AFD mínimo reconhece a mesma linguagem', () => {
  for (const texto of Object.values(EXEMPLOS)) {
    const r = Pipeline.processar(texto);
    const volta = Pipeline.processar(r.gramaticaEquivalente);
    assert.ok(volta.ok, r.gramaticaEquivalente);
    assert.equal(Automato.equivalentes(r.etapas.min.af, volta.etapas.min.af).equivalentes, true, texto);
  }
});

test('exportação DOT e tabela de transição', () => {
  const { af } = Pipeline.processar('S -> aS | bS | a').etapas.afne;
  const dot = Automato.paraDOT(af);
  assert.match(dot, /"S" -> "S" \[label="a, b"\]/);
  assert.match(dot, /"qf" \[label="qf", shape=doublecircle\]/);
  const t = Automato.tabelaTransicao(af);
  assert.deepEqual(t.colunas, ['a', 'b']);
  assert.deepEqual(t.linhas[0].celulas, [['S', 'qf'], ['S']]);
});

test('erros do pipeline não lançam exceção', () => {
  const r = Pipeline.processar('S -> aA\nA -> Sb');
  assert.equal(r.ok, false);
  assert.match(r.erros[0].mensagem, /mistura/);
});

test('layout: camadas pela distância ao inicial, sem sobreposição', () => {
  const { af } = Pipeline.processar(EXEMPLOS.mult3).etapas.min;
  const { posicoes } = Layout.calcular(af, { dx: 150, dy: 110 });
  assert.equal(posicoes.size, af.estados.length);
  const xs = af.estados.map((e) => posicoes.get(e.id).x);
  assert.equal(xs[0], Math.min(...xs)); // inicial na primeira coluna
  const chaves = [...posicoes.values()].map((p) => `${p.x},${p.y}`);
  assert.equal(new Set(chaves).size, chaves.length);
});

test('exemplos da interface: os testes em lote embutidos conferem', () => {
  const raiz = {};
  require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../src/ui/exemplos.js'), 'utf8'), { self: raiz });
  for (const ex of raiz.LFTC.Exemplos) {
    const r = Pipeline.processar(ex.texto);
    if (!ex.lote) { assert.equal(r.ok, false, ex.nome); continue; }
    assert.ok(r.ok, ex.nome);
    for (const linha of ex.lote.split('\n')) {
      const cadeia = linha.slice(1) === 'ε' ? '' : linha.slice(1);
      assert.equal(Automato.aceita(r.etapas.afne.af, cadeia), linha[0] === '+', `${ex.nome}: ${linha}`);
    }
  }
});
