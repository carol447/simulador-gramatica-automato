/*
 * Conversão de gramática linear em AFN-ε, produção por produção.
 *
 * Linear à direita (A → wB | w | ε | B):
 *   estados = variáveis ∪ {qf}; inicial = símbolo inicial; final = qf
 *   A → a₁…aₖB   cadeia de k transições de A até B (estados intermediários q1, q2…)
 *   A → a₁…aₖ    cadeia de k transições de A até qf
 *   A → B        A --ε--> B
 *   A → ε        A --ε--> qf
 *
 * Linear à esquerda (A → Bw | w | ε | B) — a derivação é lida "de trás para frente":
 *   estados = {q0} ∪ variáveis; inicial = q0; final = símbolo inicial
 *   A → Ba₁…aₖ   cadeia de k transições de B até A
 *   A → a₁…aₖ    cadeia de k transições de q0 até A
 *   A → B        B --ε--> A
 *   A → ε        q0 --ε--> A
 */
(function (raiz, fabrica) {
  const G = typeof require === 'function' ? require('./gramatica.js') : raiz.LFTC.Gramatica;
  const modulo = fabrica(G);
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else (raiz.LFTC = raiz.LFTC || {}).Conversao = modulo;
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';

  /**
   * @param g        gramática lida por Gramatica.ler
   * @param direcao  'direita' | 'esquerda'
   * @returns { af, passos: [{ indice, producao, linha, transicoes: [{de, simbolo, para}] }] }
   */
  function gramaticaParaAFN(g, direcao) {
    if (direcao !== 'direita' && direcao !== 'esquerda') throw new Error(`direção inválida: ${direcao}`);
    const direita = direcao === 'direita';
    const estados = [];
    const ids = new Set();
    const addEstado = (id) => { if (!ids.has(id)) { ids.add(id); estados.push({ id, rotulo: id }); } };

    const extremo = direita ? 'qf' : 'q0';
    if (!direita) addEstado(extremo);
    g.variaveis.forEach(addEstado);
    if (direita) addEstado(extremo);

    let intermediarios = 0;
    const novoIntermediario = () => {
      const id = `q${++intermediarios}`;
      addEstado(id);
      return id;
    };

    const transicoes = [];
    const passos = [];

    g.producoes.forEach((p, indice) => {
      const w = G.palavraDe(p);
      const B = G.variavelDe(p);
      // Origem e destino da cadeia de transições que representa a produção.
      const [de, para] = direita ? [p.lhs, B || extremo] : [B || extremo, p.lhs];
      const geradas = [];
      const add = (x, simbolo, y) => {
        const t = { de: x, simbolo, para: y, origem: indice };
        transicoes.push(t);
        geradas.push({ de: x, simbolo, para: y });
      };
      if (w.length === 0) {
        add(de, '', para);
      } else {
        let atual = de;
        w.forEach((a, i) => {
          const prox = i === w.length - 1 ? para : novoIntermediario();
          add(atual, a, prox);
          atual = prox;
        });
      }
      passos.push({ indice, producao: G.textoProducao(p), linha: p.linha, transicoes: geradas });
    });

    // Intermediários são criados depois de qf; reordena para qf ficar por último.
    if (direita) {
      const i = estados.findIndex((e) => e.id === extremo);
      estados.push(estados.splice(i, 1)[0]);
    }

    const af = {
      estados,
      alfabeto: g.terminais.slice(),
      inicial: direita ? g.inicial : extremo,
      finais: [direita ? extremo : g.inicial],
      transicoes,
    };
    return { af, passos };
  }

  return { gramaticaParaAFN };
});
