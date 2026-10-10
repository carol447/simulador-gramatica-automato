/*
 * Encadeia todas as etapas: texto → gramática → AFN-ε → AFN → AFD → AFD mínimo.
 * É o único ponto que a interface chama para processar uma gramática.
 */
(function (raiz, fabrica) {
  const req = typeof require === 'function';
  const modulo = fabrica(
    req ? require('./gramatica.js') : raiz.LFTC.Gramatica,
    req ? require('./automato.js') : raiz.LFTC.Automato,
    req ? require('./conversao.js') : raiz.LFTC.Conversao,
  );
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else (raiz.LFTC = raiz.LFTC || {}).Pipeline = modulo;
})(typeof self !== 'undefined' ? self : this, function (Gramatica, Automato, Conversao) {
  'use strict';

  /**
   * @param texto  gramática em texto
   * @param tipo   'auto' | 'GLD' | 'GLE' | 'GLUD' | 'GLUE'
   * @returns { ok: false, erros, avisos } ou
   *          { ok: true, gramatica, tipo, direcao, avisos, etapas: { afne, afn, afd, min }, linguagem }
   */
  function processar(texto, tipo = 'auto') {
    const lida = Gramatica.ler(texto);
    if (!lida.gramatica) return { ok: false, erros: lida.erros, avisos: [] };
    const g = lida.gramatica;
    const resolvido = Gramatica.resolverTipo(g, tipo);
    if (resolvido.erros) return { ok: false, erros: resolvido.erros, avisos: lida.avisos, gramatica: g };

    const afne = Conversao.gramaticaParaAFN(g, resolvido.direcao);
    const afn = Automato.removerEpsilon(afne.af);
    const afd = Automato.determinizar(afn.af);
    const min = Automato.minimizar(afd.af);

    return {
      ok: true,
      gramatica: g,
      tipo: resolvido.tipo,
      direcao: resolvido.direcao,
      avisos: lida.avisos,
      etapas: {
        afne: { af: afne.af, passos: afne.passos },
        afn: { af: afn.af, fechos: afn.fechos },
        afd: { af: afd.af, tabela: afd.tabela },
        min: { af: min.af, rodadas: min.rodadas, blocos: min.blocos },
      },
      linguagem: Automato.classificarLinguagem(min.af),
      gramaticaEquivalente: Automato.paraGramatica(min.af).texto,
    };
  }

  return { processar };
});
