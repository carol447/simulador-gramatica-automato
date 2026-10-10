/*
 * Leitura, validação e classificação de gramáticas regulares (lineares).
 *
 * Sintaxe aceita (uma regra por linha):
 *   S -> aA | bB | ε        alternativas separadas por |
 *   A → abA                 seta também como → ou ::=
 *   | b                     linha iniciada por | continua a regra anterior
 *   # comentário            tudo após # é ignorado
 *
 * Variáveis: letra maiúscula seguida opcionalmente de dígitos e apóstrofos (S, A1, B').
 * Terminais: letras minúsculas e dígitos, um caractere cada (a, b, 0, 1).
 * Palavra vazia: ε, λ, & ou "eps".
 */
(function (raiz, fabrica) {
  const modulo = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = modulo;
  else (raiz.LFTC = raiz.LFTC || {}).Gramatica = modulo;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPSILON = 'ε';
  const MARCAS_VAZIA = new Set(['ε', 'λ', '&', 'eps', 'epsilon']);
  const SETA = /->|→|::=/;

  const TIPOS = {
    GLD: { direcao: 'direita', unitaria: false, nome: 'Linear à Direita (GLD)' },
    GLE: { direcao: 'esquerda', unitaria: false, nome: 'Linear à Esquerda (GLE)' },
    GLUD: { direcao: 'direita', unitaria: true, nome: 'Linear Unitária à Direita (GLUD)' },
    GLUE: { direcao: 'esquerda', unitaria: true, nome: 'Linear Unitária à Esquerda (GLUE)' },
  };

  const ehVariavel = (s) => /^[A-Z][0-9]*'*$/.test(s);
  const ehTerminal = (s) => /^[a-z0-9]$/.test(s);

  /** Quebra o lado direito em símbolos. Devolve { simbolos } ou { erro, coluna }. */
  function tokenizar(texto) {
    const simbolos = [];
    let i = 0;
    while (i < texto.length) {
      const c = texto[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[A-Z]/.test(c)) {
        let j = i + 1;
        while (j < texto.length && /[0-9]/.test(texto[j])) j++;
        while (j < texto.length && texto[j] === "'") j++;
        simbolos.push(texto.slice(i, j));
        i = j;
      } else if (/[a-z0-9]/.test(c)) {
        simbolos.push(c);
        i++;
      } else if (MARCAS_VAZIA.has(c)) {
        return { erro: `"${c}" (palavra vazia) deve aparecer sozinho na alternativa`, coluna: i };
      } else {
        return { erro: `símbolo "${c}" não reconhecido`, coluna: i };
      }
    }
    return { simbolos };
  }

  /**
   * Forma de uma produção:
   *   vazia     A -> ε
   *   terminal  A -> w        (w ≠ ε)
   *   direita   A -> wB       (w ≠ ε)
   *   esquerda  A -> Bw       (w ≠ ε)
   *   unitaria  A -> B
   *   invalida  qualquer outra coisa (duas variáveis, variável no meio...)
   */
  function formaDe(rhs) {
    if (rhs.length === 0) return 'vazia';
    const posVars = rhs.map((s, i) => (ehVariavel(s) ? i : -1)).filter((i) => i >= 0);
    if (posVars.length === 0) return 'terminal';
    if (posVars.length > 1) return 'invalida';
    if (rhs.length === 1) return 'unitaria';
    if (posVars[0] === rhs.length - 1) return 'direita';
    if (posVars[0] === 0) return 'esquerda';
    return 'invalida';
  }

  /** Terminais da produção (o "w" de A -> wB / A -> Bw / A -> w). */
  function palavraDe(p) {
    return p.rhs.filter(ehTerminal);
  }

  /** Variável do lado direito, se houver. */
  function variavelDe(p) {
    return p.rhs.find(ehVariavel) || null;
  }

  function textoProducao(p) {
    return `${p.lhs} → ${p.rhs.length ? p.rhs.join('') : EPSILON}`;
  }

  /**
   * Lê o texto da gramática.
   * Devolve { gramatica|null, erros: [{linha, mensagem}], avisos: [{linha?, mensagem}] }.
   * A variável inicial é o lado esquerdo da primeira regra.
   */
  function ler(texto) {
    const erros = [];
    const producoes = [];
    const vistas = new Set();
    let ultimoLhs = null;

    texto.split(/\r?\n/).forEach((bruta, idx) => {
      const linha = idx + 1;
      const semComentario = bruta.replace(/#.*$/, '');
      if (!semComentario.trim()) return;

      let lhs;
      let corpo;
      const continuacao = semComentario.trim().startsWith('|');
      if (continuacao) {
        if (!ultimoLhs) {
          erros.push({ linha, mensagem: 'linha começa com "|" mas não há regra anterior para continuar' });
          return;
        }
        lhs = ultimoLhs;
        corpo = semComentario.trim().slice(1);
      } else {
        const partes = semComentario.split(SETA);
        if (partes.length !== 2) {
          erros.push({
            linha,
            mensagem: partes.length < 2 ? 'falta a seta "->" (use A -> aB | b)' : 'mais de uma seta na mesma linha',
          });
          return;
        }
        lhs = partes[0].trim();
        corpo = partes[1];
        if (!ehVariavel(lhs)) {
          erros.push({
            linha,
            mensagem: lhs
              ? `lado esquerdo "${lhs}" não é uma variável (use maiúscula: S, A, B1...)`
              : 'lado esquerdo vazio',
          });
          return;
        }
        ultimoLhs = lhs;
      }

      const alternativas = corpo.split('|');
      alternativas.forEach((alt, k) => {
        const limpa = alt.trim();
        if (!limpa) {
          erros.push({
            linha,
            mensagem: k === alternativas.length - 1 && alternativas.length > 1
              ? 'alternativa vazia após "|" (para palavra vazia escreva ε)'
              : 'alternativa vazia (para palavra vazia escreva ε)',
          });
          return;
        }
        let rhs;
        if (MARCAS_VAZIA.has(limpa)) {
          rhs = [];
        } else {
          const t = tokenizar(limpa);
          if (t.erro) {
            erros.push({ linha, mensagem: `em "${limpa}": ${t.erro}` });
            return;
          }
          rhs = t.simbolos;
        }
        const p = { lhs, rhs, linha };
        p.forma = formaDe(rhs);
        if (p.forma === 'invalida') {
          erros.push({
            linha,
            mensagem: `"${textoProducao(p)}" não é linear: o lado direito pode ter no máximo uma variável, no início ou no fim`,
          });
          return;
        }
        const chave = textoProducao(p);
        if (vistas.has(chave)) return; // duplicata: ignora em silêncio
        vistas.add(chave);
        producoes.push(p);
      });
    });

    if (!erros.length && !producoes.length) {
      erros.push({ linha: null, mensagem: 'a gramática está vazia' });
    }
    if (erros.length) return { gramatica: null, erros, avisos: [] };

    const variaveis = [];
    const terminais = new Set();
    const addVar = (v) => { if (!variaveis.includes(v)) variaveis.push(v); };
    for (const p of producoes) {
      addVar(p.lhs);
      for (const s of p.rhs) (ehVariavel(s) ? addVar(s) : terminais.add(s));
    }

    const gramatica = {
      inicial: producoes[0].lhs,
      variaveis,
      terminais: [...terminais].sort(),
      producoes,
    };
    return { gramatica, erros: [], avisos: analisar(gramatica) };
  }

  /** Classifica: direção (direita/esquerda/ambas) e se é unitária (|w| ≤ 1). */
  function classificar(g) {
    const direitas = g.producoes.filter((p) => p.forma === 'direita');
    const esquerdas = g.producoes.filter((p) => p.forma === 'esquerda');
    const unitaria = g.producoes.every((p) => palavraDe(p).length <= 1);
    let direcao;
    if (direitas.length && esquerdas.length) direcao = 'mista';
    else if (esquerdas.length) direcao = 'esquerda';
    else if (direitas.length) direcao = 'direita';
    else direcao = 'ambas'; // só A -> w, A -> ε e A -> B: serve como GLD e GLE
    return { direcao, unitaria, exemploDireita: direitas[0], exemploEsquerda: esquerdas[0] };
  }

  /**
   * Resolve o tipo pedido ("auto" ou GLD/GLE/GLUD/GLUE) contra a gramática.
   * Devolve { tipo, direcao } ou { erros }.
   */
  function resolverTipo(g, pedido) {
    const c = classificar(g);
    if (c.direcao === 'mista') {
      return {
        erros: [
          {
            linha: c.exemploEsquerda.linha,
            mensagem:
              `mistura produções à direita ("${textoProducao(c.exemploDireita)}", linha ${c.exemploDireita.linha}) ` +
              `e à esquerda ("${textoProducao(c.exemploEsquerda)}"). Gramáticas lineares mistas podem gerar linguagens ` +
              'não regulares; use só um dos lados.',
          },
        ],
      };
    }
    if (pedido === 'auto') {
      const dir = c.direcao === 'esquerda' ? 'esquerda' : 'direita';
      const tipo = (c.unitaria ? 'GLU' : 'GL') + (dir === 'direita' ? 'D' : 'E');
      return { tipo, direcao: dir };
    }
    const alvo = TIPOS[pedido];
    if (!alvo) return { erros: [{ linha: null, mensagem: `tipo desconhecido: ${pedido}` }] };
    const erros = [];
    if (c.direcao !== 'ambas' && c.direcao !== alvo.direcao) {
      const ex = alvo.direcao === 'direita' ? c.exemploEsquerda : c.exemploDireita;
      erros.push({
        linha: ex.linha,
        mensagem: `${pedido} só aceita produções ${alvo.direcao === 'direita' ? 'A → wB' : 'A → Bw'}, mas há "${textoProducao(ex)}"`,
      });
    }
    if (alvo.unitaria) {
      for (const p of g.producoes) {
        const w = palavraDe(p);
        if (w.length > 1) {
          erros.push({ linha: p.linha, mensagem: `${pedido} exige |w| ≤ 1, mas "${textoProducao(p)}" tem |w| = ${w.length}` });
        }
      }
    }
    return erros.length ? { erros } : { tipo: pedido, direcao: alvo.direcao };
  }

  /** Avisos de qualidade: variáveis sem regra, inalcançáveis e improdutivas. */
  function analisar(g) {
    const avisos = [];
    const comRegra = new Set(g.producoes.map((p) => p.lhs));
    for (const v of g.variaveis) {
      if (!comRegra.has(v)) {
        const uso = g.producoes.find((p) => p.rhs.includes(v));
        avisos.push({ linha: uso.linha, mensagem: `a variável ${v} é usada mas não tem regras` });
      }
    }

    const alc = alcancaveis(g);
    for (const v of g.variaveis) {
      if (!alc.has(v)) {
        const def = g.producoes.find((p) => p.lhs === v);
        avisos.push({ linha: def ? def.linha : null, mensagem: `a variável ${v} não é alcançável a partir de ${g.inicial}` });
      }
    }

    const prod = produtivas(g);
    for (const v of g.variaveis) {
      if (comRegra.has(v) && !prod.has(v)) {
        const def = g.producoes.find((p) => p.lhs === v);
        avisos.push({ linha: def.linha, mensagem: `a variável ${v} nunca termina (não gera nenhuma cadeia de terminais)` });
      }
    }
    if (!prod.has(g.inicial)) {
      avisos.push({ linha: null, mensagem: `${g.inicial} não gera nenhuma cadeia: a linguagem é vazia` });
    }
    return avisos;
  }

  function alcancaveis(g) {
    const vistos = new Set([g.inicial]);
    const pilha = [g.inicial];
    while (pilha.length) {
      const a = pilha.pop();
      for (const p of g.producoes) {
        if (p.lhs !== a) continue;
        const b = variavelDe(p);
        if (b && !vistos.has(b)) { vistos.add(b); pilha.push(b); }
      }
    }
    return vistos;
  }

  function produtivas(g) {
    const prod = new Set();
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const p of g.producoes) {
        if (prod.has(p.lhs)) continue;
        const b = variavelDe(p);
        if (!b || prod.has(b)) { prod.add(p.lhs); mudou = true; }
      }
    }
    return prod;
  }

  /** Texto canônico da gramática, agrupando alternativas por variável. */
  function formatar(g) {
    return g.variaveis
      .filter((v) => g.producoes.some((p) => p.lhs === v))
      .map((v) => {
        const alts = g.producoes.filter((p) => p.lhs === v).map((p) => (p.rhs.length ? p.rhs.join('') : EPSILON));
        return `${v} -> ${alts.join(' | ')}`;
      })
      .join('\n');
  }

  return {
    EPSILON, TIPOS, ler, classificar, resolverTipo, analisar, formatar,
    textoProducao, palavraDe, variavelDe, ehVariavel, ehTerminal,
  };
});
