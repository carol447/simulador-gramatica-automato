/*
 * Posicionamento automático dos estados em camadas (esquerda → direita).
 *
 * 1. Camada = distância (busca em largura) a partir do estado inicial.
 *    Estados inalcançáveis vão para uma camada extra no fim.
 * 2. Dentro de cada camada, a ordem é refinada por baricentro dos vizinhos
 *    (algumas varreduras para frente e para trás), o que reduz cruzamentos.
 * 3. Cada camada é centralizada verticalmente.
 */
(function (raiz, fabrica) {
  const modulo = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else (raiz.LFTC = raiz.LFTC || {}).Layout = modulo;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param af     autômato
   * @param opcoes { dx, dy, margemX, margemY }
   * @returns { posicoes: Map(id -> {x, y}), largura, altura }
   */
  function calcular(af, opcoes = {}) {
    const { dx = 150, dy = 110, margemX = 70, margemY = 50 } = opcoes;
    const vizinhos = new Map(af.estados.map((e) => [e.id, new Set()]));
    const sucessores = new Map(af.estados.map((e) => [e.id, new Set()]));
    for (const t of af.transicoes) {
      if (t.de === t.para) continue;
      sucessores.get(t.de).add(t.para);
      vizinhos.get(t.de).add(t.para);
      vizinhos.get(t.para).add(t.de);
    }

    const camada = new Map([[af.inicial, 0]]);
    const fila = [af.inicial];
    while (fila.length) {
      const q = fila.shift();
      for (const r of sucessores.get(q)) {
        if (!camada.has(r)) { camada.set(r, camada.get(q) + 1); fila.push(r); }
      }
    }
    const maxCamada = Math.max(0, ...camada.values());
    const temSoltos = af.estados.some((e) => !camada.has(e.id));
    for (const e of af.estados) if (!camada.has(e.id)) camada.set(e.id, maxCamada + 1);

    const camadas = [];
    for (const e of af.estados) {
      const c = camada.get(e.id);
      (camadas[c] = camadas[c] || []).push(e.id);
    }
    for (let i = 0; i < camadas.length; i++) camadas[i] = camadas[i] || [];

    // Varreduras de baricentro.
    const posicao = new Map();
    const atualizar = () => camadas.forEach((ids) => ids.forEach((id, i) => posicao.set(id, i - (ids.length - 1) / 2)));
    atualizar();
    const baricentro = (id, referencia) => {
      const vs = [...vizinhos.get(id)].filter((v) => camada.get(v) === referencia);
      if (!vs.length) return posicao.get(id);
      return vs.reduce((s, v) => s + posicao.get(v), 0) / vs.length;
    };
    for (let volta = 0; volta < 4; volta++) {
      const ida = volta % 2 === 0;
      const ordem = ida ? [...camadas.keys()].slice(1) : [...camadas.keys()].reverse().slice(1);
      for (const c of ordem) {
        const ref = ida ? c - 1 : c + 1;
        const chave = new Map(camadas[c].map((id) => [id, baricentro(id, ref)]));
        camadas[c].sort((a, b) => chave.get(a) - chave.get(b));
        atualizar();
      }
    }

    const maiorCamada = Math.max(...camadas.map((c) => c.length));
    const altura = margemY * 2 + (maiorCamada - 1) * dy;
    const posicoes = new Map();
    camadas.forEach((ids, c) => {
      const x = margemX + c * dx + (temSoltos && c === camadas.length - 1 ? dx * 0.3 : 0);
      ids.forEach((id, i) => {
        posicoes.set(id, { x, y: altura / 2 + (i - (ids.length - 1) / 2) * dy });
      });
    });
    const largura = margemX * 2 + (camadas.length - 1) * dx + (temSoltos ? dx * 0.3 : 0);
    return { posicoes, largura, altura };
  }

  return { calcular };
});
