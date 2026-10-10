/* Gramáticas de exemplo carregadas pelo seletor do topo. */
(function (raiz) {
  'use strict';
  (raiz.LFTC = raiz.LFTC || {}).Exemplos = [
    {
      nome: 'Número par de a (GLUD)',
      texto: '# a aparece um número par de vezes\nS -> aA | bS | ε\nA -> aS | bA',
      cadeia: 'abab',
      lote: '+ε\n+aa\n+baab\n+aba\n+bbb\n-a\n-abaa',
    },
    {
      nome: 'Termina em "ab" (GLUE)',
      texto: '# linear à esquerda: a derivação cresce para a esquerda\nS -> Ab\nA -> Ba | a\nB -> Ba | Bb | a | b',
      cadeia: 'bbab',
      lote: '+ab\n+aab\n+bab\n-ba\n-abb\n-ε',
    },
    {
      nome: 'Múltiplos de 3 em binário',
      texto: '# o estado guarda o resto da divisão por 3\nS -> 0S | 1A | ε\nA -> 0B | 1S\nB -> 0A | 1B',
      cadeia: '1001',
      lote: '+0\n+11\n+110\n+1001\n-1\n-10\n-111',
    },
    {
      nome: 'Palavras longas e unitárias (GLD)',
      texto: '# w com mais de um terminal gera estados intermediários\nS -> abS | B\nB -> baB | c | ε',
      cadeia: 'ababbac',
      lote: '+ε\n+ab\n+ba\n+abbac\n+abc\n-a\n-ca',
    },
    {
      nome: 'Contém "aa" — minimização',
      texto: '# o AFD tem estados finais equivalentes que a minimização junta\nS -> aS | bS | aA\nA -> aB\nB -> aB | bB | ε',
      cadeia: 'baab',
      lote: '+aa\n+baab\n+abaa\n+aaa\n-abab\n-a\n-ε',
    },
    {
      nome: 'Linguagem finita',
      texto: 'S -> aA | b\nA -> b | bb',
      cadeia: 'abb',
      lote: '+b\n+ab\n+abb\n-abbb\n-a',
    },
    {
      nome: 'Com erros (para ver o diagnóstico)',
      texto: 'S -> aA | Sb\nA -> aB | ε\nB -> a+b',
      cadeia: '',
      lote: '',
    },
  ];
})(typeof self !== 'undefined' ? self : this);
