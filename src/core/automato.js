/*
 * Autômatos finitos e suas transformações.
 *
 * Um autômato é um objeto simples (serializável em JSON):
 *   {
 *     estados:    [{ id, rotulo, conjunto? }],   // conjunto: estados de origem (AFD / mínimo)
 *     alfabeto:   ['a', 'b'],
 *     inicial:    'S',
 *     finais:     ['qf'],
 *     transicoes: [{ de, simbolo, para, origem? }] // simbolo '' = transição ε
 *   }
 *
 * Operações: ε-fecho, simulação passo a passo, remoção de ε, construção de
 * subconjuntos, minimização (refinamento de partições), equivalência,
 * enumeração de palavras e conversão de volta para gramática.
 */
(function (raiz, fabrica) {
  const modulo = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else (raiz.LFTC = raiz.LFTC || {}).Automato = modulo;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = '';

  // ------------------------------------------------------------ índices
  /** delta: id -> Map(simbolo -> Set(id)); inclui '' para ε. */
  function indexar(af) {
    const delta = new Map(af.estados.map((e) => [e.id, new Map()]));
    for (const t of af.transicoes) {
      const m = delta.get(t.de);
      if (!m.has(t.simbolo)) m.set(t.simbolo, new Set());
      m.get(t.simbolo).add(t.para);
    }
    return delta;
  }

  function cache(af) {
    if (!af._delta) Object.defineProperty(af, '_delta', { value: indexar(af), enumerable: false });
    return af._delta;
  }

  const ordenar = (af, ids) => {
    const pos = new Map(af.estados.map((e, i) => [e.id, i]));
    return [...ids].sort((a, b) => pos.get(a) - pos.get(b));
  };

  function rotuloDe(af, id) {
    const e = af.estados.find((x) => x.id === id);
    return e ? e.rotulo : id;
  }

  function temEpsilon(af) {
    return af.transicoes.some((t) => t.simbolo === EPS);
  }

  function ehDeterministico(af) {
    if (temEpsilon(af)) return false;
    const vistos = new Set();
    for (const t of af.transicoes) {
      const k = t.de + '\u0000' + t.simbolo;
      if (vistos.has(k)) return false;
      vistos.add(k);
    }
    return true;
  }

  // ------------------------------------------------------------ ε-fecho e movimento
  function fechoEpsilon(af, conjunto) {
    const delta = cache(af);
    const fecho = new Set(conjunto);
    const pilha = [...conjunto];
    while (pilha.length) {
      const q = pilha.pop();
      const eps = delta.get(q)?.get(EPS);
      if (!eps) continue;
      for (const r of eps) if (!fecho.has(r)) { fecho.add(r); pilha.push(r); }
    }
    return fecho;
  }

  function mover(af, conjunto, simbolo) {
    const delta = cache(af);
    const destino = new Set();
    for (const q of conjunto) {
      const alvo = delta.get(q)?.get(simbolo);
      if (alvo) for (const r of alvo) destino.add(r);
    }
    return destino;
  }

  const contemFinal = (af, conjunto) => af.finais.some((f) => conjunto.has(f));

  // ------------------------------------------------------------ simulação
  /** Índices das transições ε percorridas para fechar `conjunto` a partir de `base`. */
  function arestasDoFecho(af, base, fecho) {
    const usadas = [];
    af.transicoes.forEach((t, i) => {
      if (t.simbolo === EPS && fecho.has(t.de) && fecho.has(t.para) && !base.has(t.para)) {
        usadas.push(i);
      }
    });
    return usadas;
  }

  /**
   * Executa a cadeia e devolve todos os passos:
   *   passos[k] = { posicao: k, lido, ativos: [ids], transicoes: [índices], aceita }
   * O passo 0 é o ε-fecho do inicial; o passo k é após ler cadeia[k-1].
   */
  function simular(af, cadeia) {
    const simbolos = [...cadeia];
    const foraDoAlfabeto = simbolos.filter((s) => !af.alfabeto.includes(s));
    const base0 = new Set([af.inicial]);
    let atual = fechoEpsilon(af, base0);
    const passos = [{
      posicao: 0,
      lido: null,
      ativos: ordenar(af, atual),
      transicoes: arestasDoFecho(af, base0, atual),
      aceita: contemFinal(af, atual),
    }];
    simbolos.forEach((c, k) => {
      const usadas = [];
      af.transicoes.forEach((t, i) => { if (t.simbolo === c && atual.has(t.de)) usadas.push(i); });
      const movidos = mover(af, atual, c);
      const prox = fechoEpsilon(af, movidos);
      usadas.push(...arestasDoFecho(af, movidos, prox));
      atual = prox;
      passos.push({ posicao: k + 1, lido: c, ativos: ordenar(af, atual), transicoes: usadas, aceita: contemFinal(af, atual) });
    });
    return { passos, aceita: passos[passos.length - 1].aceita, foraDoAlfabeto: [...new Set(foraDoAlfabeto)] };
  }

  function aceita(af, cadeia) {
    let atual = fechoEpsilon(af, new Set([af.inicial]));
    for (const c of cadeia) {
      atual = fechoEpsilon(af, mover(af, atual, c));
      if (!atual.size) return false;
    }
    return contemFinal(af, atual);
  }

  // ------------------------------------------------------------ AFN-ε -> AFN
  /**
   * Remove transições ε: δ'(q, a) = E(δ(E(q), a)); q é final se E(q) contém final.
   * Estados inalcançáveis após a remoção são descartados.
   * Devolve { af, fechos: [{ estado, fecho, final }] }.
   */
  function removerEpsilon(af) {
    const fechos = [];
    const transicoes = [];
    const finais = [];
    for (const e of af.estados) {
      const E = fechoEpsilon(af, new Set([e.id]));
      const final = contemFinal(af, E);
      fechos.push({ estado: e.id, fecho: ordenar(af, E), final });
      if (final) finais.push(e.id);
      for (const a of af.alfabeto) {
        for (const r of ordenar(af, fechoEpsilon(af, mover(af, E, a)))) {
          transicoes.push({ de: e.id, simbolo: a, para: r });
        }
      }
    }
    const novo = podarInalcancaveis({
      estados: af.estados.map((e) => ({ id: e.id, rotulo: e.rotulo })),
      alfabeto: af.alfabeto.slice(),
      inicial: af.inicial,
      finais,
      transicoes,
    });
    return { af: novo, fechos };
  }

  function alcancaveis(af) {
    const delta = cache(af);
    const vistos = new Set([af.inicial]);
    const fila = [af.inicial];
    while (fila.length) {
      const q = fila.shift();
      for (const destinos of delta.get(q).values()) {
        for (const r of destinos) if (!vistos.has(r)) { vistos.add(r); fila.push(r); }
      }
    }
    return vistos;
  }

  /** Estados a partir dos quais algum final é alcançável. */
  function coalcancaveis(af) {
    const inversa = new Map(af.estados.map((e) => [e.id, []]));
    for (const t of af.transicoes) inversa.get(t.para).push(t.de);
    const vistos = new Set(af.finais);
    const fila = [...af.finais];
    while (fila.length) {
      const q = fila.shift();
      for (const p of inversa.get(q)) if (!vistos.has(p)) { vistos.add(p); fila.push(p); }
    }
    return vistos;
  }

  function restringir(af, manter) {
    return {
      estados: af.estados.filter((e) => manter.has(e.id)),
      alfabeto: af.alfabeto.slice(),
      inicial: af.inicial,
      finais: af.finais.filter((f) => manter.has(f)),
      transicoes: af.transicoes.filter((t) => manter.has(t.de) && manter.has(t.para)),
    };
  }

  function podarInalcancaveis(af) {
    return restringir(af, alcancaveis(af));
  }

  /** Mantém só estados úteis (alcançáveis e co-alcançáveis); o inicial fica sempre. */
  function aparar(af) {
    const alc = alcancaveis(af);
    const co = coalcancaveis(af);
    const manter = new Set([...alc].filter((q) => co.has(q)));
    manter.add(af.inicial);
    return restringir(af, manter);
  }

  // ------------------------------------------------------------ AFN -> AFD
  /**
   * Construção de subconjuntos a partir do ε-fecho do inicial (aceita AFN-ε).
   * O AFD é parcial: o conjunto vazio (estado de erro) não é desenhado.
   * Devolve { af, tabela: [{ id, conjunto, final, destinos: {a: id|null} }] }.
   */
  function determinizar(af, prefixo = 'D') {
    const chave = (s) => ordenar(af, s).join(',');
    const inicial = fechoEpsilon(af, new Set([af.inicial]));
    const ids = new Map([[chave(inicial), `${prefixo}0`]]);
    const fila = [inicial];
    const estados = [];
    const transicoes = [];
    const finais = [];
    const tabela = [];
    while (fila.length) {
      const S = fila.shift();
      const id = ids.get(chave(S));
      const conjunto = ordenar(af, S).map((q) => rotuloDe(af, q));
      const final = contemFinal(af, S);
      estados.push({ id, rotulo: id, conjunto });
      if (final) finais.push(id);
      const linha = { id, conjunto, final, destinos: {} };
      for (const a of af.alfabeto) {
        const T = fechoEpsilon(af, mover(af, S, a));
        if (!T.size) { linha.destinos[a] = null; continue; }
        const k = chave(T);
        if (!ids.has(k)) { ids.set(k, `${prefixo}${ids.size}`); fila.push(T); }
        linha.destinos[a] = ids.get(k);
        transicoes.push({ de: id, simbolo: a, para: ids.get(k) });
      }
      tabela.push(linha);
    }
    return {
      af: { estados, alfabeto: af.alfabeto.slice(), inicial: `${prefixo}0`, finais, transicoes },
      tabela,
    };
  }

  /** Torna o AFD total acrescentando um estado de erro, se faltar alguma transição. */
  function completar(afd, idErro = '∅') {
    const delta = cache(afd);
    const faltam = [];
    for (const e of afd.estados) {
      for (const a of afd.alfabeto) if (!delta.get(e.id).has(a)) faltam.push({ de: e.id, simbolo: a, para: idErro });
    }
    if (!faltam.length) return afd;
    return {
      estados: [...afd.estados, { id: idErro, rotulo: idErro, conjunto: [] }],
      alfabeto: afd.alfabeto.slice(),
      inicial: afd.inicial,
      finais: afd.finais.slice(),
      transicoes: [...afd.transicoes, ...faltam, ...afd.alfabeto.map((a) => ({ de: idErro, simbolo: a, para: idErro }))],
    };
  }

  // ------------------------------------------------------------ minimização
  /**
   * Minimização por refinamento de partições (Moore).
   * Entrada: AFD (parcial ou total). Passos: remove inalcançáveis, completa com
   * estado de erro, refina {F, Q−F} até estabilizar, junta os blocos e remove o
   * estado morto. Os estados do resultado são numerados em ordem de busca em largura.
   * Devolve { af, rodadas: [[[rotulos...], ...], ...], blocos: [{ id, membros }] }.
   */
  function minimizar(afd, prefixo = 'M') {
    if (!ehDeterministico(afd)) throw new Error('minimizar: o autômato precisa ser determinístico');
    const total = completar(podarInalcancaveis(afd));
    const delta = cache(total);
    const destino = (q, a) => [...delta.get(q).get(a)][0];
    const ehFinal = new Set(total.finais);

    let bloco = new Map(total.estados.map((e) => [e.id, ehFinal.has(e.id) ? 0 : 1]));
    // Normaliza índices para que a partição inicial não tenha bloco vazio.
    const normalizar = (m) => {
      const ren = new Map();
      const out = new Map();
      for (const e of total.estados) {
        const b = m.get(e.id);
        if (!ren.has(b)) ren.set(b, ren.size);
        out.set(e.id, ren.get(b));
      }
      return out;
    };
    bloco = normalizar(bloco);
    const fotografar = (m) => {
      const grupos = [];
      for (const e of total.estados) {
        const b = m.get(e.id);
        (grupos[b] = grupos[b] || []).push(e.rotulo);
      }
      return grupos;
    };
    const rodadas = [fotografar(bloco)];

    for (;;) {
      const assinaturas = new Map();
      const novo = new Map();
      for (const e of total.estados) {
        const assinatura = [bloco.get(e.id), ...total.alfabeto.map((a) => bloco.get(destino(e.id, a)))].join('|');
        if (!assinaturas.has(assinatura)) assinaturas.set(assinatura, assinaturas.size);
        novo.set(e.id, assinaturas.get(assinatura));
      }
      const qtdAntes = new Set(bloco.values()).size;
      bloco = normalizar(novo);
      if (new Set(bloco.values()).size === qtdAntes) break;
      rodadas.push(fotografar(bloco));
    }

    // Quociente
    const representante = new Map();
    for (const e of total.estados) if (!representante.has(bloco.get(e.id))) representante.set(bloco.get(e.id), e.id);
    const quociente = {
      estados: [...representante.keys()].map((b) => ({ id: `b${b}`, rotulo: `b${b}` })),
      alfabeto: total.alfabeto.slice(),
      inicial: `b${bloco.get(total.inicial)}`,
      finais: [...new Set(total.finais.map((f) => `b${bloco.get(f)}`))],
      transicoes: [],
    };
    for (const [b, rep] of representante) {
      for (const a of total.alfabeto) quociente.transicoes.push({ de: `b${b}`, simbolo: a, para: `b${bloco.get(destino(rep, a))}` });
    }
    const util = aparar(quociente);

    // Renumera em largura a partir do inicial (forma canônica).
    const ordem = [];
    const vistos = new Set([util.inicial]);
    const fila = [util.inicial];
    const dUtil = cache(util);
    while (fila.length) {
      const q = fila.shift();
      ordem.push(q);
      for (const a of util.alfabeto) {
        const d = dUtil.get(q).get(a);
        if (!d) continue;
        const r = [...d][0];
        if (!vistos.has(r)) { vistos.add(r); fila.push(r); }
      }
    }
    const novoId = new Map(ordem.map((q, i) => [q, `${prefixo}${i}`]));
    const membros = (b) => total.estados.filter((e) => `b${bloco.get(e.id)}` === b).map((e) => e.rotulo);
    const af = {
      estados: ordem.map((q) => ({ id: novoId.get(q), rotulo: novoId.get(q), conjunto: membros(q) })),
      alfabeto: util.alfabeto.slice(),
      inicial: novoId.get(util.inicial),
      finais: ordem.filter((q) => util.finais.includes(q)).map((q) => novoId.get(q)),
      transicoes: util.transicoes
        .filter((t) => novoId.has(t.de) && novoId.has(t.para))
        .map((t) => ({ de: novoId.get(t.de), simbolo: t.simbolo, para: novoId.get(t.para) })),
    };
    return { af, rodadas, blocos: af.estados.map((e) => ({ id: e.id, membros: e.conjunto })) };
  }

  // ------------------------------------------------------------ análise da linguagem
  /**
   * Equivalência de dois autômatos quaisquer pelo produto dos AFDs.
   * Devolve { equivalentes, contraexemplo } (a menor cadeia em que discordam).
   */
  function equivalentes(a, b) {
    const ea = fechoEpsilon(a, new Set([a.inicial]));
    const eb = fechoEpsilon(b, new Set([b.inicial]));
    const alfabeto = [...new Set([...a.alfabeto, ...b.alfabeto])].sort();
    const chave = (x, y) => ordenar(a, x).join(',') + '#' + ordenar(b, y).join(',');
    const vistos = new Set([chave(ea, eb)]);
    const fila = [[ea, eb, '']];
    while (fila.length) {
      const [x, y, w] = fila.shift();
      if (contemFinal(a, x) !== contemFinal(b, y)) return { equivalentes: false, contraexemplo: w };
      for (const c of alfabeto) {
        const nx = fechoEpsilon(a, mover(a, x, c));
        const ny = fechoEpsilon(b, mover(b, y, c));
        const k = chave(nx, ny);
        if (!vistos.has(k)) { vistos.add(k); fila.push([nx, ny, w + c]); }
      }
    }
    return { equivalentes: true, contraexemplo: null };
  }

  /**
   * Palavras aceitas em ordem de tamanho e depois alfabética, até `tamanhoMax`
   * e no máximo `limite` palavras. Prefixos que não levam a final são podados.
   */
  function palavras(af, tamanhoMax = 6, limite = 30) {
    const { af: d } = determinizar(af);
    const util = coalcancaveis(d);
    const delta = cache(d);
    const alfabeto = d.alfabeto.slice().sort();
    const saida = [];
    let nivel = util.has(d.inicial) ? [[d.inicial, '']] : [];
    for (let n = 0; n <= tamanhoMax && nivel.length && saida.length < limite; n++) {
      for (const [q, w] of nivel) {
        if (d.finais.includes(q)) { saida.push(w); if (saida.length >= limite) break; }
      }
      if (n === tamanhoMax) break;
      const prox = [];
      for (const [q, w] of nivel) {
        for (const a of alfabeto) {
          const r = delta.get(q).get(a);
          if (!r) continue;
          const alvo = [...r][0];
          if (util.has(alvo)) prox.push([alvo, w + a]);
        }
        if (prox.length > 50000) break; // proteção para alfabetos grandes
      }
      nivel = prox;
    }
    return saida;
  }

  /**
   * Vazia, finita (com a quantidade de palavras e o tamanho máximo) ou infinita.
   * Usa o AFD aparado: a linguagem é infinita se houver ciclo entre estados úteis.
   */
  function classificarLinguagem(af) {
    const { af: d } = determinizar(af);
    const util = aparar(d);
    if (!util.finais.length) return { tipo: 'vazia' };
    const delta = cache(util);
    const cor = new Map();
    let ciclo = false;
    const visitar = (q) => {
      cor.set(q, 1);
      for (const destinos of delta.get(q).values()) {
        for (const r of destinos) {
          if (cor.get(r) === 1) ciclo = true;
          else if (!cor.has(r)) visitar(r);
          if (ciclo) return;
        }
      }
      cor.set(q, 2);
    };
    visitar(util.inicial);
    if (ciclo) return { tipo: 'infinita' };
    // DAG: conta caminhos até finais e o maior tamanho.
    const memo = new Map();
    const contar = (q) => {
      if (memo.has(q)) return memo.get(q);
      let qtd = util.finais.includes(q) ? 1 : 0;
      let maior = util.finais.includes(q) ? 0 : -Infinity;
      for (const destinos of delta.get(q).values()) {
        for (const r of destinos) {
          const [c, m] = contar(r);
          qtd += c;
          maior = Math.max(maior, m + 1);
        }
      }
      memo.set(q, [qtd, maior]);
      return memo.get(q);
    };
    const [quantidade, maiorTamanho] = contar(util.inicial);
    return { tipo: 'finita', quantidade, maiorTamanho };
  }

  /**
   * Gramática linear unitária à direita equivalente a um AFD:
   * p --a--> q vira P -> aQ; cada final Q ganha Q -> ε.
   * O inicial vira S; os demais recebem letras A, B, C... (ou A1, A2... se faltar letra).
   */
  function paraGramatica(af) {
    const util = aparar(af);
    const letras = 'ABCDEFGHIJKLMNOPQRTUVWXYZ'.split(''); // sem S
    const nomes = new Map([[util.inicial, 'S']]);
    let k = 0;
    for (const e of util.estados) {
      if (nomes.has(e.id)) continue;
      nomes.set(e.id, util.estados.length <= 26 ? letras[k] : `A${k + 1}`);
      k++;
    }
    const linhas = [];
    for (const e of util.estados) {
      const alts = util.transicoes
        .filter((t) => t.de === e.id)
        .map((t) => (t.simbolo === EPS ? '' : t.simbolo) + nomes.get(t.para));
      if (util.finais.includes(e.id)) alts.push('ε');
      if (alts.length) linhas.push(`${nomes.get(e.id)} -> ${alts.join(' | ')}`);
    }
    if (!linhas.length) linhas.push('S -> S   # linguagem vazia');
    return { texto: linhas.join('\n'), nomes };
  }

  // ------------------------------------------------------------ exportação
  /** Agrupa transições paralelas: [{ de, para, simbolos: [..], indices: [..] }]. */
  function agruparArestas(af) {
    const grupos = new Map();
    af.transicoes.forEach((t, i) => {
      const k = t.de + '\u0000' + t.para;
      if (!grupos.has(k)) grupos.set(k, { de: t.de, para: t.para, simbolos: [], indices: [] });
      const g = grupos.get(k);
      if (!g.simbolos.includes(t.simbolo)) g.simbolos.push(t.simbolo);
      g.indices.push(i);
    });
    for (const g of grupos.values()) {
      g.simbolos.sort((x, y) => (x === EPS) - (y === EPS) || x.localeCompare(y));
    }
    return [...grupos.values()];
  }

  const mostrarSimbolo = (s) => (s === EPS ? 'ε' : s);

  function paraDOT(af, nome = 'AF') {
    const q = (s) => '"' + String(s).replace(/"/g, '\\"') + '"';
    const linhas = [`digraph ${q(nome)} {`, '  rankdir=LR;', '  node [shape=circle];', '  __inicio [shape=point, label=""];'];
    for (const e of af.estados) {
      linhas.push(`  ${q(e.id)} [label=${q(e.rotulo)}${af.finais.includes(e.id) ? ', shape=doublecircle' : ''}];`);
    }
    linhas.push(`  __inicio -> ${q(af.inicial)};`);
    for (const g of agruparArestas(af)) {
      linhas.push(`  ${q(g.de)} -> ${q(g.para)} [label=${q(g.simbolos.map(mostrarSimbolo).join(', '))}];`);
    }
    linhas.push('}');
    return linhas.join('\n');
  }

  /** Tabela de transição: colunas = alfabeto (+ ε se houver). */
  function tabelaTransicao(af) {
    const colunas = [...af.alfabeto];
    if (temEpsilon(af)) colunas.push(EPS);
    const delta = cache(af);
    const linhas = af.estados.map((e) => ({
      id: e.id,
      rotulo: e.rotulo,
      conjunto: e.conjunto,
      inicial: e.id === af.inicial,
      final: af.finais.includes(e.id),
      celulas: colunas.map((a) => ordenar(af, delta.get(e.id).get(a) || []).map((r) => rotuloDe(af, r))),
    }));
    return { colunas, linhas };
  }

  return {
    EPS, indexar, fechoEpsilon, mover, simular, aceita, temEpsilon, ehDeterministico,
    removerEpsilon, determinizar, completar, minimizar, alcancaveis, coalcancaveis, aparar,
    podarInalcancaveis, equivalentes, palavras, classificarLinguagem, paraGramatica,
    agruparArestas, paraDOT, tabelaTransicao, mostrarSimbolo, rotuloDe,
  };
});
