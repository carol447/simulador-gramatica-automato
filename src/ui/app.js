/*
 * Interface: editor da gramática, desenho dos autômatos com jsPlumb,
 * simulação passo a passo e painéis de construção, tabela, testes e linguagem.
 * Toda a lógica formal fica em src/core; aqui só há apresentação e eventos.
 */
(function () {
  'use strict';

  const { Automato, Pipeline, Layout, Exemplos } = window.LFTC;
  const $ = (s) => document.querySelector(s);

  const el = {
    gramatica: $('#gramatica'),
    numeros: $('#numeros'),
    tipo: $('#tipo'),
    btnGerar: $('#btnGerar'),
    diagnosticos: $('#diagnosticos'),
    resumo: $('#resumo'),
    exemplos: $('#exemplos'),
    btnCompartilhar: $('#btnCompartilhar'),
    btnTema: $('#btnTema'),
    abasAutomato: $('#abasAutomato'),
    abasPainel: $('#abasPainel'),
    viewport: $('#viewport'),
    dimensionador: $('#dimensionador'),
    palco: $('#palco'),
    vazio: $('#vazio'),
    zoomValor: $('#zoomValor'),
    cadeia: $('#cadeia'),
    fita: $('#fita'),
    statusSim: $('#statusSim'),
    rastro: $('#rastro'),
    simInicio: $('#simInicio'),
    simVoltar: $('#simVoltar'),
    simTocar: $('#simTocar'),
    simAvancar: $('#simAvancar'),
    simFim: $('#simFim'),
    velocidade: $('#velocidade'),
    construcao: $('#painel-construcao'),
    tabela: $('#painel-tabela'),
    lote: $('#lote'),
    btnLote: $('#btnLote'),
    resultadoLote: $('#resultadoLote'),
    classeLinguagem: $('#classeLinguagem'),
    tamanhoMax: $('#tamanhoMax'),
    palavras: $('#palavras'),
    gramaticaEquivalente: $('#gramaticaEquivalente'),
    btnCarregarEquivalente: $('#btnCarregarEquivalente'),
    outraGramatica: $('#outraGramatica'),
    btnComparar: $('#btnComparar'),
    resultadoComparacao: $('#resultadoComparacao'),
    aviso: $('#aviso'),
  };

  const ETAPAS = { afne: 'AFN-ε', afn: 'AFN', afd: 'AFD', min: 'AFD mínimo' };
  const PAINEIS = ['simulacao', 'construcao', 'tabela', 'lote', 'linguagem'];
  const INTERVALOS = [1300, 850, 550, 320, 160];
  const COR_ARESTA = '#6d6c67';

  const estado = {
    resultado: null,
    etapa: 'afne',
    painel: 'simulacao',
    zoom: 1,
    tamanhoPalco: { w: 0, h: 0 },
    posicoes: {},           // etapa -> Map(id -> {left, top}) arrastadas pelo usuário
    nos: new Map(),         // id do estado -> elemento
    conexoes: new Map(),    // índice da transição -> conexão jsPlumb
    sim: { passos: [], indice: 0, simbolos: [], fora: [], timer: null },
    marcasLinha: new Map(),
  };
  let jsp = null;

  // ================================================================ utilidades
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const conj = (xs) => `{${xs.join(', ')}}`;
  const sim = (s) => Automato.mostrarSimbolo(s);
  const palavra = (w) => (w === '' ? 'ε' : w);
  const afAtual = () => (estado.resultado ? estado.resultado.etapas[estado.etapa].af : null);
  const rotulo = (af, id) => Automato.rotuloDe(af, id);

  function lerLocal(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }
  function gravarLocal(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* armazenamento indisponível */ }
  }

  let timerAviso = null;
  function avisar(msg) {
    el.aviso.textContent = msg;
    el.aviso.classList.add('visivel');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => el.aviso.classList.remove('visivel'), 2200);
  }

  /** Normaliza a cadeia digitada: ignora espaços; "ε" sozinho é a cadeia vazia. */
  function lerCadeia(texto) {
    const t = texto.replace(/\s+/g, '');
    return t === 'ε' || t === 'λ' ? '' : t;
  }

  function baixar(nome, conteudo, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ================================================================ editor
  const ALTURA_LINHA = 13 * 1.6;

  function atualizarNumeros() {
    const n = el.gramatica.value.split('\n').length;
    const linhas = [];
    for (let i = 1; i <= n; i++) {
      const m = estado.marcasLinha.get(i);
      linhas.push(m ? `<span class="${m}">${i}</span>` : String(i));
    }
    el.numeros.innerHTML = linhas.join('\n') + '\n ';
    el.numeros.scrollTop = el.gramatica.scrollTop;
  }

  function irParaLinha(n) {
    const linhas = el.gramatica.value.split('\n');
    let inicio = 0;
    for (let i = 0; i < n - 1 && i < linhas.length; i++) inicio += linhas[i].length + 1;
    const fim = inicio + (linhas[n - 1] || '').length;
    el.gramatica.focus();
    el.gramatica.setSelectionRange(inicio, fim);
    el.gramatica.scrollTop = Math.max(0, (n - 3) * ALTURA_LINHA);
  }

  // ================================================================ geração
  function gerar() {
    pararAnimacao();
    const r = Pipeline.processar(el.gramatica.value, el.tipo.value);
    estado.resultado = r.ok ? r : null;
    estado.posicoes = {};
    mostrarDiagnosticos(r);
    mostrarResumo(r);
    atualizarContagens();
    salvarLocal();
    if (!r.ok) {
      limparDiagrama('Corrija os erros da gramática para ver o autômato.');
      renderPaineis();
      renderLinguagem();
      el.resultadoLote.innerHTML = '';
      atualizarHash();
      return;
    }
    desenhar({ ajustar: true });
    simularCadeia(0);
    renderPaineis();
    renderLinguagem();
    if (el.lote.value.trim()) executarLote();
    else el.resultadoLote.innerHTML = '';
    atualizarHash();
  }

  function mostrarDiagnosticos(r) {
    estado.marcasLinha = new Map();
    const itens = [];
    const item = (classe, marca, linha, msg) => {
      if (linha && !(classe === 'aviso' && estado.marcasLinha.get(linha) === 'erro')) estado.marcasLinha.set(linha, classe);
      itens.push(
        `<li class="${classe}"><span class="marca-diag" aria-hidden="true">${marca}</span>` +
        (linha ? `<button type="button" class="linha" data-linha="${linha}" title="Ir para a linha ${linha}">L${linha}</button>` : '') +
        `<span>${esc(msg)}</span></li>`,
      );
    };
    for (const e of r.erros || []) item('erro', '✕', e.linha, e.mensagem);
    for (const a of r.avisos || []) item('aviso', '!', a.linha, a.mensagem);
    if (r.ok && !(r.avisos || []).length) {
      item('ok', '✓', null, `Gramática válida (${r.tipo}): ${r.gramatica.producoes.length} produções.`);
    }
    el.diagnosticos.innerHTML = itens.join('');
    atualizarNumeros();
  }

  function mostrarResumo(r) {
    if (!r.ok) {
      el.resumo.innerHTML = '<dd class="vazio-resumo">Nenhum autômato gerado.</dd>';
      return;
    }
    const g = r.gramatica;
    const L = r.linguagem;
    const textoL = L.tipo === 'vazia' ? 'vazia (∅)'
      : L.tipo === 'finita' ? `finita: ${L.quantidade} ${L.quantidade === 1 ? 'palavra' : 'palavras'}`
      : 'infinita';
    const n = (k) => r.etapas[k].af.estados.length;
    el.resumo.innerHTML = `
      <dt>Tipo</dt><dd><span class="selo">${r.tipo}</span> ${esc(window.LFTC.Gramatica.TIPOS[r.tipo].nome.replace(/ \(.*\)/, ''))}</dd>
      <dt>Inicial</dt><dd class="mono">${esc(g.inicial)}</dd>
      <dt>Variáveis</dt><dd class="mono">${esc(conj(g.variaveis))}</dd>
      <dt>Terminais</dt><dd class="mono">Σ = ${esc(conj(g.terminais))}</dd>
      <dt>Produções</dt><dd>${g.producoes.length}</dd>
      <dt>Linguagem</dt><dd>${textoL}</dd>
      <dt>Estados</dt><dd>AFN-ε ${n('afne')} · AFN ${n('afn')} · AFD ${n('afd')} · mín. ${n('min')}</dd>`;
  }

  function atualizarContagens() {
    for (const b of el.abasAutomato.querySelectorAll('button')) {
      const k = b.dataset.etapa;
      b.querySelector('.contagem').textContent = estado.resultado ? estado.resultado.etapas[k].af.estados.length : '';
    }
  }

  // ================================================================ diagrama
  function novoPalco() {
    // Trocar o elemento descarta todos os ouvintes da instância anterior do jsPlumb.
    const novo = el.palco.cloneNode(false);
    el.palco.replaceWith(novo);
    el.palco = novo;
    if (jsp) jsp.reset();
    jsp = jsPlumb.getInstance({
      Container: el.palco,
      ConnectionsDetachable: false,
      Endpoint: 'Blank',
      PaintStyle: { stroke: COR_ARESTA, strokeWidth: 1.6 },
    });
    estado.nos = new Map();
    estado.conexoes = new Map();
  }

  function limparDiagrama(mensagem) {
    novoPalco();
    el.vazio.textContent = mensagem;
    el.vazio.hidden = false;
  }

  function desenhar({ ajustar = false } = {}) {
    const af = afAtual();
    if (!af) return;
    el.vazio.hidden = true;
    novoPalco();

    const TAM = 54;
    const layout = Layout.calcular(af, { dx: 150, dy: 115, margemX: 80, margemY: 70 });
    const salvas = estado.posicoes[estado.etapa] || new Map();
    estado.tamanhoPalco = { w: layout.largura, h: layout.altura };

    const centros = new Map();
    jsp.batch(() => {
      for (const e of af.estados) {
        const d = document.createElement('div');
        d.className = 'estado' + (e.id === af.inicial ? ' inicial' : '') + (af.finais.includes(e.id) ? ' final' : '');
        d.dataset.id = e.id;
        d.innerHTML = `<span class="nome">${esc(e.rotulo)}</span>` +
          (e.conjunto ? `<span class="conj">${esc(e.conjunto.length ? conj(e.conjunto) : '∅')}</span>` : '');
        const marcas = [e.id === af.inicial ? 'inicial' : '', af.finais.includes(e.id) ? 'final' : ''].filter(Boolean);
        d.title = e.rotulo + (marcas.length ? ` (${marcas.join(', ')})` : '') + (e.conjunto ? ` = ${conj(e.conjunto)}` : '');
        const p = salvas.get(e.id) || { left: layout.posicoes.get(e.id).x - TAM / 2, top: layout.posicoes.get(e.id).y - TAM / 2 };
        centros.set(e.id, { x: p.left + TAM / 2, y: p.top + TAM / 2 });
        d.style.left = p.left + 'px';
        d.style.top = p.top + 'px';
        el.palco.appendChild(d);
        estado.nos.set(e.id, d);
        jsp.draggable(d, { stop: () => guardarPosicao(e.id, d) });
      }

      const grupos = Automato.agruparArestas(af);
      const pares = new Set(grupos.map((g) => g.de + '\u0000' + g.para));
      for (const g of grupos) {
        const laco = g.de === g.para;
        const temVolta = !laco && pares.has(g.para + '\u0000' + g.de);
        const conexao = jsp.connect({
          source: estado.nos.get(g.de),
          target: estado.nos.get(g.para),
          connector: ['StateMachine', { curviness: temVolta ? 60 : 14, proximityLimit: 60, loopbackRadius: 15 }],
          anchors: laco ? Array(2).fill(ladoDoLaco(g.de, af, centros)) : ['Continuous', 'Continuous'],
          cssClass: 'aresta',
          detachable: false,
          overlays: [
            ['Arrow', { width: 11, length: 11, location: 1, foldback: 0.8, cssClass: 'seta', id: 'seta' }],
            ['Label', { label: esc(g.simbolos.map(sim).join(', ')), location: laco ? 0.5 : 0.5, cssClass: 'rotulo', id: 'rotulo' }],
          ],
        });
        for (const i of g.indices) estado.conexoes.set(i, conexao);
      }
    });
    if (ajustar) ajustarZoom();
    else aplicarZoom(estado.zoom);
  }

  /**
   * Escolhe o lado do estado com menos vizinhos para desenhar o laço,
   * evitando que ele cruze arestas. Embaixo há o rótulo do conjunto (AFD), então pesa mais.
   */
  function ladoDoLaco(id, af, centros) {
    const LADOS = [
      { ancora: [0.5, 0, 0, -1], v: [0, -1], extra: 0 },
      { ancora: [0.5, 1, 0, 1], v: [0, 1], extra: af.estados.some((e) => e.conjunto) ? 1.5 : 0.2 },
      { ancora: [1, 0.5, 1, 0], v: [1, 0], extra: 0.1 },
      { ancora: [0, 0.5, -1, 0], v: [-1, 0], extra: id === af.inicial ? 3 : 0.1 },
    ];
    const c = centros.get(id);
    const vizinhos = new Set();
    for (const t of af.transicoes) {
      if (t.de === id && t.para !== id) vizinhos.add(t.para);
      if (t.para === id && t.de !== id) vizinhos.add(t.de);
    }
    let melhor = LADOS[0];
    let menor = Infinity;
    for (const lado of LADOS) {
      let custo = lado.extra;
      for (const v of vizinhos) {
        const o = centros.get(v);
        const dx = o.x - c.x;
        const dy = o.y - c.y;
        const n = Math.hypot(dx, dy) || 1;
        custo += Math.max(0, (dx * lado.v[0] + dy * lado.v[1]) / n) ** 2;
      }
      if (custo < menor - 1e-9) { menor = custo; melhor = lado; }
    }
    return melhor.ancora;
  }

  function guardarPosicao(id, d) {
    if (!estado.posicoes[estado.etapa]) estado.posicoes[estado.etapa] = new Map();
    estado.posicoes[estado.etapa].set(id, { left: parseFloat(d.style.left), top: parseFloat(d.style.top) });
    // Cresce o palco se o estado foi arrastado para além da borda.
    const direita = parseFloat(d.style.left) + 140;
    const baixo = parseFloat(d.style.top) + 110;
    estado.tamanhoPalco.w = Math.max(estado.tamanhoPalco.w, direita);
    estado.tamanhoPalco.h = Math.max(estado.tamanhoPalco.h, baixo);
    aplicarZoom(estado.zoom);
  }

  function aplicarZoom(z) {
    estado.zoom = Math.min(2, Math.max(0.3, z));
    const { w, h } = estado.tamanhoPalco;
    const zw = w * estado.zoom;
    const zh = h * estado.zoom;
    el.palco.style.width = w + 'px';
    el.palco.style.height = h + 'px';
    el.palco.style.transform = `scale(${estado.zoom})`;
    el.dimensionador.style.width = zw + 'px';
    el.dimensionador.style.height = zh + 'px';
    // Centraliza quando o desenho é menor que a área visível.
    el.dimensionador.style.marginLeft = Math.max(0, (el.viewport.clientWidth - zw) / 2) + 'px';
    el.dimensionador.style.marginTop = Math.max(0, (el.viewport.clientHeight - zh) / 2) + 'px';
    if (jsp) { jsp.setZoom(estado.zoom); jsp.repaintEverything(); }
    el.zoomValor.textContent = Math.round(estado.zoom * 100) + '%';
  }

  function ajustarZoom() {
    const { w, h } = estado.tamanhoPalco;
    if (!w || !h) return aplicarZoom(1);
    const z = Math.min((el.viewport.clientWidth - 16) / w, (el.viewport.clientHeight - 16) / h, 1.3);
    aplicarZoom(z);
  }

  function limparDestaques(classe) {
    for (const d of estado.nos.values()) d.classList.remove(classe);
    for (const c of new Set(estado.conexoes.values())) {
      c.removeClass(classe);
      const o = c.getOverlay('rotulo');
      if (o) o.removeClass(classe);
    }
  }

  function destacar(classe, estados = [], transicoes = []) {
    for (const id of estados) estado.nos.get(id)?.classList.add(classe);
    for (const i of transicoes) {
      const c = estado.conexoes.get(i);
      if (!c) continue;
      c.addClass(classe);
      const o = c.getOverlay('rotulo');
      if (o) o.addClass(classe);
    }
  }

  // ================================================================ simulação
  function simularCadeia(indice = 0) {
    pararAnimacao();
    const af = afAtual();
    if (!af) {
      estado.sim = { passos: [], indice: 0, simbolos: [], fora: [], timer: null };
      el.fita.innerHTML = '';
      el.rastro.innerHTML = '';
      el.statusSim.innerHTML = '';
      atualizarBotoesSim();
      return;
    }
    const cadeia = lerCadeia(el.cadeia.value);
    const r = Automato.simular(af, cadeia);
    estado.sim = { passos: r.passos, indice: 0, simbolos: [...cadeia], fora: r.foraDoAlfabeto, timer: null };
    renderRastro(af);
    irParaPasso(Math.min(indice, r.passos.length - 1));
  }

  function renderRastro(af) {
    const { passos } = estado.sim;
    const nomes = (ids) => conj(ids.map((id) => rotulo(af, id)));
    el.rastro.innerHTML = passos.map((p, k) => {
      const texto = k === 0
        ? (Automato.temEpsilon(af) ? `início: E(${rotulo(af, af.inicial)}) = ${nomes(p.ativos)}` : `início: ${nomes(p.ativos)}`)
        : `${nomes(passos[k - 1].ativos)} —${p.lido}→ ${p.ativos.length ? nomes(p.ativos) : '∅'}`;
      return `<li data-passo="${k}"><span class="passo-n">${k === 0 ? '—' : `#${k}`}</span><span>${esc(texto)}</span></li>`;
    }).join('');
  }

  function irParaPasso(k) {
    const { passos, simbolos, fora } = estado.sim;
    if (!passos.length) return;
    k = Math.max(0, Math.min(passos.length - 1, k));
    estado.sim.indice = k;
    const af = afAtual();
    const passo = passos[k];
    const ultimo = k === passos.length - 1;

    limparDestaques('ativo');
    limparDestaques('ativa');
    limparDestaques('aceito');
    destacar('ativo', passo.ativos, []);
    destacar('ativa', [], passo.transicoes);
    if (ultimo && passo.aceita) destacar('aceito', passo.ativos.filter((id) => af.finais.includes(id)));

    // Fita
    if (!simbolos.length) {
      el.fita.innerHTML = '<div class="celula fim atual" title="cadeia vazia">ε</div>';
    } else {
      el.fita.innerHTML = simbolos.map((c, i) => {
        const cls = ['celula', i < k ? 'lida' : '', i === k ? 'atual' : '', fora.includes(c) ? 'fora' : ''].filter(Boolean).join(' ');
        return `<div class="${cls}" title="posição ${i + 1}">${esc(c)}</div>`;
      }).join('') + `<div class="celula fim${ultimo ? ' atual' : ''}" title="fim da cadeia">fim</div>`;
      rolarPara(el.fita, el.fita.querySelector('.atual'), 'x');
    }

    // Situação
    let veredito;
    if (!ultimo) veredito = '<span class="veredito andamento">em andamento</span>';
    else if (passo.aceita) veredito = '<span class="veredito aceita">✓ Aceita</span>';
    else veredito = '<span class="veredito rejeita">✕ Rejeita</span>';
    const ativos = passo.ativos.length ? conj(passo.ativos.map((id) => rotulo(af, id))) : '∅';
    const extra = [];
    if (!passo.ativos.length) extra.push('<span class="alerta-sim">nenhum estado ativo: a cadeia não pode mais ser aceita</span>');
    if (fora.length) extra.push(`<span class="alerta-sim">fora de Σ: ${esc(fora.join(', '))}</span>`);
    el.statusSim.innerHTML =
      `${veredito}<span>Passo ${k} de ${passos.length - 1}${passo.lido ? ` · leu <b class="mono">${esc(passo.lido)}</b>` : ''}</span>` +
      `<span>Ativos: <span class="conjunto">${esc(ativos)}</span></span>${extra.join('')}`;

    for (const li of el.rastro.children) li.classList.toggle('atual', Number(li.dataset.passo) === k);
    rolarPara(el.rastro, el.rastro.children[k], 'y');
    atualizarBotoesSim();
  }

  /** Rola só o contêiner (scrollIntoView rolaria a página inteira durante a animação). */
  function rolarPara(container, alvo, eixo) {
    if (!alvo) return;
    if (eixo === 'x') {
      const ini = alvo.offsetLeft; // o contêiner é position: relative
      if (ini < container.scrollLeft) container.scrollLeft = ini - 8;
      else if (ini + alvo.offsetWidth > container.scrollLeft + container.clientWidth) container.scrollLeft = ini + alvo.offsetWidth - container.clientWidth + 8;
    } else {
      const ini = alvo.offsetTop;
      if (ini < container.scrollTop) container.scrollTop = ini;
      else if (ini + alvo.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = ini + alvo.offsetHeight - container.clientHeight;
    }
  }

  function atualizarBotoesSim() {
    const { passos, indice } = estado.sim;
    const sem = !passos.length;
    el.simInicio.disabled = el.simVoltar.disabled = sem || indice === 0;
    el.simFim.disabled = el.simAvancar.disabled = sem || indice === passos.length - 1;
    el.simTocar.disabled = sem;
    const tocando = !!estado.sim.timer;
    el.simTocar.classList.toggle('tocando', tocando);
    el.simTocar.setAttribute('aria-label', tocando ? 'Pausar' : 'Reproduzir');
  }

  function pararAnimacao() {
    if (estado.sim.timer) clearInterval(estado.sim.timer);
    estado.sim.timer = null;
    atualizarBotoesSim();
  }

  function alternarAnimacao() {
    if (estado.sim.timer) return pararAnimacao();
    if (!estado.sim.passos.length) return;
    if (estado.sim.indice === estado.sim.passos.length - 1) irParaPasso(0);
    estado.sim.timer = setInterval(() => {
      if (estado.sim.indice >= estado.sim.passos.length - 1) return pararAnimacao();
      irParaPasso(estado.sim.indice + 1);
      if (estado.sim.indice >= estado.sim.passos.length - 1) pararAnimacao();
    }, INTERVALOS[Number(el.velocidade.value) - 1]);
    atualizarBotoesSim();
  }

  // ================================================================ painéis
  function renderPaineis() {
    renderConstrucao();
    renderTabela();
  }

  function vazioPainel(alvo) {
    alvo.innerHTML = '<p class="explicacao">Gere os autômatos para ver este painel.</p>';
  }

  function renderConstrucao() {
    const r = estado.resultado;
    if (!r) return vazioPainel(el.construcao);
    const etapa = r.etapas[estado.etapa];
    const af = etapa.af;
    const t = (x) => `${esc(x.de)} —${esc(sim(x.simbolo))}→ ${esc(x.para)}`;
    let html = '';

    if (estado.etapa === 'afne') {
      const g = r.gramatica;
      html += r.direcao === 'direita'
        ? `<p class="explicacao">Cada variável vira um estado; o inicial é <b>${esc(g.inicial)}</b> e o único final é <b>qf</b>.
           <b>A → wB</b> liga A a B lendo w (com estados intermediários quando |w| &gt; 1), <b>A → w</b> liga A a qf,
           e <b>A → B</b> e <b>A → ε</b> viram transições ε. Passe o mouse numa linha para ver as transições no diagrama.</p>`
        : `<p class="explicacao">Numa gramática à esquerda a derivação é lida de trás para frente: o inicial é <b>q0</b> e o final é o
           símbolo inicial <b>${esc(g.inicial)}</b>. <b>A → Bw</b> liga B a A lendo w, <b>A → w</b> liga q0 a A,
           <b>A → B</b> vira B —ε→ A e <b>A → ε</b> vira q0 —ε→ A. Passe o mouse numa linha para ver as transições no diagrama.</p>`;
      html += '<div class="tabela-wrap"><table class="dados"><thead><tr><th>Linha</th><th>Produção</th><th>Transições geradas</th></tr></thead><tbody>';
      for (const p of etapa.passos) {
        const indices = af.transicoes.map((x, i) => (x.origem === p.indice ? i : -1)).filter((i) => i >= 0);
        const estados = [...new Set(p.transicoes.flatMap((x) => [x.de, x.para]))];
        html += `<tr data-transicoes="${indices.join(',')}" data-estados="${esc(estados.join('\u0001'))}">` +
          `<td class="mono">${p.linha}</td><td class="mono">${esc(p.producao)}</td><td class="mono">${p.transicoes.map(t).join('<br>')}</td></tr>`;
      }
      html += '</tbody></table></div>';
    } else if (estado.etapa === 'afn') {
      const original = r.etapas.afne.af;
      const mantidos = new Set(af.estados.map((e) => e.id));
      html += `<p class="explicacao">Remoção das transições ε: <b>δ'(q, a) = E(δ(E(q), a))</b>, em que E é o ε-fecho.
        Um estado passa a ser final quando seu ε-fecho contém um final. Estados que ficam inalcançáveis são removidos.</p>`;
      html += '<div class="tabela-wrap"><table class="dados"><thead><tr><th>Estado</th><th>E(q)</th><th>Final no AFN</th><th>Situação</th></tr></thead><tbody>';
      for (const f of etapa.fechos) {
        html += `<tr data-estados="${esc(f.estado)}"><td class="mono">${esc(rotulo(original, f.estado))}</td>` +
          `<td class="mono">${esc(conj(f.fecho.map((q) => rotulo(original, q))))}</td><td>${f.final ? 'sim' : '—'}</td>` +
          `<td>${mantidos.has(f.estado) ? 'mantido' : '<span class="vazio-celula">removido (inalcançável)</span>'}</td></tr>`;
      }
      html += '</tbody></table></div>';
    } else if (estado.etapa === 'afd') {
      html += `<p class="explicacao">Construção de subconjuntos sobre o AFN: cada estado do AFD é um conjunto de estados do AFN,
        começando por {${esc(r.etapas.afn.af.inicial)}}. É final se contém algum final. Transições para ∅ (estado de erro) ficam
        implícitas: o desenho mostra o AFD parcial.</p>`;
      const alfa = af.alfabeto;
      html += `<div class="tabela-wrap"><table class="dados"><thead><tr><th>Estado</th><th>Conjunto do AFN</th>${alfa.map((a) => `<th class="mono">${esc(a)}</th>`).join('')}<th>Final</th></tr></thead><tbody>`;
      for (const l of etapa.tabela) {
        html += `<tr data-estados="${esc(l.id)}"><td class="mono">${esc(l.id)}</td><td class="mono">${esc(conj(l.conjunto))}</td>` +
          alfa.map((a) => `<td class="mono">${l.destinos[a] ? esc(l.destinos[a]) : '<span class="vazio-celula">∅</span>'}</td>`).join('') +
          `<td>${l.final ? 'sim' : '—'}</td></tr>`;
      }
      html += '</tbody></table></div>';
    } else {
      const antes = r.etapas.afd.af.estados.length;
      html += `<p class="explicacao">Refinamento de partições (Moore): começa com {finais} e {não finais} — com o estado de erro
        <b>∅</b> quando o AFD é parcial — e separa, a cada rodada, estados que vão para blocos diferentes com o mesmo símbolo.
        Quando nada muda, cada bloco vira um estado; o bloco de erro e estados mortos são descartados.
        ${antes === af.estados.length ? '<b>O AFD já era mínimo.</b>' : `<b>${antes} → ${af.estados.length} estados.</b>`}</p>`;
      html += '<ol class="rodadas">' + etapa.rodadas.map((blocos, i) =>
        `<li><span class="rodada-n">${i === 0 ? 'Partição inicial' : `Rodada ${i}`}</span>${blocos.map((b) => `<span class="bloco">${esc(conj(b))}</span>`).join('')}</li>`,
      ).join('') + '</ol>';
      html += '<div class="tabela-wrap"><table class="dados"><thead><tr><th>Estado mínimo</th><th>Estados do AFD que reúne</th></tr></thead><tbody>';
      for (const b of etapa.blocos) {
        html += `<tr data-estados="${esc(b.id)}"><td class="mono">${esc(b.id)}</td><td class="mono">${esc(conj(b.membros))}</td></tr>`;
      }
      html += '</tbody></table></div>';
    }
    el.construcao.innerHTML = html;
  }

  function renderTabela() {
    const af = afAtual();
    if (!af) return vazioPainel(el.tabela);
    const { colunas, linhas } = Automato.tabelaTransicao(af);
    const det = Automato.ehDeterministico(af);
    let html = `<p class="explicacao">Função de transição δ de ${ETAPAS[estado.etapa]}: <b>→</b> marca o inicial e <b>*</b> os finais.
      ${det ? 'Células vazias levam ao estado de erro.' : 'Cada célula é o conjunto de destinos.'}</p>`;
    html += `<div class="tabela-wrap"><table class="dados"><thead><tr><th>δ</th>${colunas.map((c) => `<th class="mono">${esc(sim(c))}</th>`).join('')}</tr></thead><tbody>`;
    for (const l of linhas) {
      const marca = (l.inicial ? '→' : '') + (l.final ? '*' : '');
      html += `<tr data-estados="${esc(l.id)}"><td class="mono"><span class="marcas-estado">${marca}</span>${esc(l.rotulo)}</td>` +
        l.celulas.map((c) => `<td class="mono">${c.length ? esc(det ? c[0] : conj(c)) : '<span class="vazio-celula">—</span>'}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table></div>';
    el.tabela.innerHTML = html;
  }

  // Passar o mouse numa linha de tabela destaca estados/transições no diagrama.
  function ligarRealce(container) {
    container.addEventListener('mouseover', (ev) => {
      const tr = ev.target.closest('tr[data-estados], tr[data-transicoes]');
      limparDestaques('realce');
      if (!tr) return;
      const estados = tr.dataset.estados ? tr.dataset.estados.split('\u0001') : [];
      const transicoes = tr.dataset.transicoes ? tr.dataset.transicoes.split(',').filter(Boolean).map(Number) : [];
      destacar('realce', estados, transicoes);
    });
    container.addEventListener('mouseleave', () => limparDestaques('realce'));
  }

  // ---------------------------------------------------------------- testes em lote
  function executarLote() {
    const r = estado.resultado;
    if (!r) { el.resultadoLote.innerHTML = '<p class="explicacao">Gere os autômatos primeiro.</p>'; return; }
    const casos = el.lote.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      let esperado = null;
      let resto = l;
      if (l[0] === '+' || l[0] === '-') { esperado = l[0] === '+'; resto = l.slice(1); }
      return { cadeia: lerCadeia(resto), esperado };
    });
    if (!casos.length) { el.resultadoLote.innerHTML = '<p class="explicacao">Nenhuma cadeia para testar.</p>'; return; }
    let conferem = 0;
    let falham = 0;
    const linhas = casos.map((c, i) => {
      const resultados = Object.keys(ETAPAS).map((k) => Automato.aceita(r.etapas[k].af, c.cadeia));
      const consenso = resultados.every((x) => x === resultados[0]);
      const aceita = resultados[0];
      let situacao = '<span class="vazio-celula">—</span>';
      if (!consenso) situacao = '<span class="situacao falha">✕ autômatos divergem</span>';
      else if (c.esperado !== null) {
        if (c.esperado === aceita) { conferem++; situacao = '<span class="situacao ok">✓ confere</span>'; }
        else { falham++; situacao = '<span class="situacao falha">✕ não confere</span>'; }
      }
      return `<tr data-cadeia="${esc(c.cadeia)}" title="Clique para simular"><td>${i + 1}</td><td class="mono">${esc(palavra(c.cadeia))}</td>` +
        `<td>${c.esperado === null ? '<span class="vazio-celula">—</span>' : c.esperado ? 'aceita' : 'rejeita'}</td>` +
        `<td>${aceita ? 'aceita' : 'rejeita'}</td><td>${situacao}</td></tr>`;
    });
    const comExpectativa = conferem + falham;
    el.resultadoLote.innerHTML =
      `<p class="resumo-lote">${casos.length} ${casos.length === 1 ? 'cadeia' : 'cadeias'}` +
      (comExpectativa ? ` · <span class="situacao ok">${conferem} conferem</span>` + (falham ? ` · <span class="situacao falha">${falham} não conferem</span>` : '') : '') +
      ' · resultado conferido nos 4 autômatos</p>' +
      '<div class="tabela-wrap"><table class="dados"><thead><tr><th>#</th><th>Cadeia</th><th>Esperado</th><th>Resultado</th><th>Situação</th></tr></thead>' +
      `<tbody>${linhas.join('')}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- linguagem
  function renderLinguagem() {
    const r = estado.resultado;
    el.resultadoComparacao.textContent = '';
    el.resultadoComparacao.className = 'resultado-comparacao';
    if (!r) {
      el.classeLinguagem.textContent = 'Gere os autômatos para analisar a linguagem.';
      el.palavras.innerHTML = '';
      el.gramaticaEquivalente.textContent = '';
      el.btnCarregarEquivalente.disabled = true;
      return;
    }
    const L = r.linguagem;
    el.classeLinguagem.innerHTML = L.tipo === 'vazia' ? 'A linguagem é <b>vazia</b>: nenhuma cadeia é aceita.'
      : L.tipo === 'finita' ? `A linguagem é <b>finita</b>: ${L.quantidade} ${L.quantidade === 1 ? 'palavra' : 'palavras'}, a maior com ${L.maiorTamanho} ${L.maiorTamanho === 1 ? 'símbolo' : 'símbolos'}.`
      : 'A linguagem é <b>infinita</b> (o AFD mínimo tem um ciclo entre estados úteis).';
    renderPalavras();
    el.gramaticaEquivalente.textContent = r.gramaticaEquivalente;
    el.btnCarregarEquivalente.disabled = false;
  }

  function renderPalavras() {
    const r = estado.resultado;
    if (!r) return;
    const max = Math.max(0, Math.min(12, Number(el.tamanhoMax.value) || 0));
    const LIMITE = 60;
    const ws = Automato.palavras(r.etapas.min.af, max, LIMITE + 1);
    const mostrar = ws.slice(0, LIMITE);
    el.palavras.innerHTML = mostrar.length
      ? mostrar.map((w) => `<button type="button" data-cadeia="${esc(w)}" title="Simular">${esc(palavra(w))}</button>`).join('') +
        (ws.length > LIMITE ? '<span class="nada">… (mostrando as 60 primeiras)</span>' : '')
      : `<span class="nada">Nenhuma palavra com até ${max} símbolos.</span>`;
  }

  function comparar() {
    const r = estado.resultado;
    const alvo = el.resultadoComparacao;
    if (!r) { alvo.textContent = 'Gere os autômatos primeiro.'; return; }
    const outro = Pipeline.processar(el.outraGramatica.value, 'auto');
    if (!outro.ok) {
      const e = outro.erros[0];
      alvo.className = 'resultado-comparacao falha';
      alvo.textContent = `A outra gramática tem erro${e.linha ? ` na linha ${e.linha}` : ''}: ${e.mensagem}`;
      return;
    }
    const eq = Automato.equivalentes(r.etapas.min.af, outro.etapas.min.af);
    if (eq.equivalentes) {
      alvo.className = 'resultado-comparacao ok';
      alvo.textContent = '✓ As duas gramáticas geram a mesma linguagem.';
    } else {
      const w = eq.contraexemplo;
      const aqui = Automato.aceita(r.etapas.min.af, w);
      alvo.className = 'resultado-comparacao falha';
      alvo.textContent = `✕ Linguagens diferentes. Menor contraexemplo: "${palavra(w)}", ${aqui ? 'gerada pela gramática do editor e não pela outra' : 'gerada pela outra e não pela do editor'}.`;
    }
  }

  // ================================================================ navegação
  function selecionarEtapa(etapa, { manterPasso = true } = {}) {
    if (!ETAPAS[etapa]) return;
    estado.etapa = etapa;
    for (const b of el.abasAutomato.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.etapa === etapa));
    if (!estado.resultado) return;
    const passo = manterPasso ? estado.sim.indice : 0;
    desenhar({ ajustar: !estado.posicoes[etapa] });
    simularCadeia(passo);
    renderPaineis();
    atualizarHash();
  }

  function selecionarPainel(painel) {
    if (!PAINEIS.includes(painel)) return;
    estado.painel = painel;
    for (const b of el.abasPainel.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.painel === painel));
    for (const p of PAINEIS) document.getElementById('painel-' + p).hidden = p !== painel;
    atualizarHash();
  }

  function simularPalavra(w) {
    el.cadeia.value = palavra(w);
    selecionarPainel('simulacao');
    simularCadeia(0);
    atualizarHash();
    el.cadeia.focus({ preventScroll: false });
  }

  // ================================================================ estado na URL e no navegador
  const codificar = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const decodificar = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

  function atualizarHash() {
    const p = new URLSearchParams();
    p.set('g', codificar(el.gramatica.value));
    if (el.tipo.value !== 'auto') p.set('t', el.tipo.value);
    if (el.cadeia.value) p.set('w', el.cadeia.value);
    if (estado.etapa !== 'afne') p.set('e', estado.etapa);
    if (estado.painel !== 'simulacao') p.set('a', estado.painel);
    if (el.lote.value.trim()) p.set('l', codificar(el.lote.value));
    try { history.replaceState(null, '', '#' + p.toString()); } catch (e) { /* file:// em alguns navegadores */ }
  }

  function lerHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (!p.has('g')) return null;
    try {
      return {
        g: decodificar(p.get('g')),
        l: p.has('l') ? decodificar(p.get('l')) : null,
        t: p.get('t'), w: p.get('w'), e: p.get('e'), a: p.get('a'), p: p.get('p'),
      };
    } catch (e) {
      return null;
    }
  }

  function salvarLocal() {
    gravarLocal('lftc.estado', JSON.stringify({ g: el.gramatica.value, t: el.tipo.value, w: el.cadeia.value, lote: el.lote.value }));
  }

  async function copiarLink() {
    atualizarHash();
    try {
      await navigator.clipboard.writeText(location.href);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = location.href;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    avisar('Link copiado: ele abre esta gramática, cadeia e visão.');
  }

  function alternarTema() {
    const atual = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const novo = atual === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    gravarLocal('lftc.tema', novo);
    if (jsp) jsp.repaintEverything();
  }

  function carregarExemplo(ex) {
    el.gramatica.value = ex.texto;
    el.cadeia.value = ex.cadeia;
    el.lote.value = ex.lote;
    el.tipo.value = 'auto';
    gerar();
  }

  // ================================================================ eventos
  function ligarEventos() {
    el.btnGerar.addEventListener('click', gerar);
    el.gramatica.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); gerar(); }
    });
    el.gramatica.addEventListener('input', () => { estado.marcasLinha = new Map(); atualizarNumeros(); });
    el.gramatica.addEventListener('scroll', () => { el.numeros.scrollTop = el.gramatica.scrollTop; });
    el.tipo.addEventListener('change', gerar);
    el.diagnosticos.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-linha]');
      if (b) irParaLinha(Number(b.dataset.linha));
    });

    el.exemplos.innerHTML = '<option value="">Exemplos…</option>' +
      Exemplos.map((ex, i) => `<option value="${i}">${esc(ex.nome)}</option>`).join('');
    el.exemplos.addEventListener('change', () => {
      const ex = Exemplos[Number(el.exemplos.value)];
      el.exemplos.value = '';
      if (ex) carregarExemplo(ex);
    });
    el.btnCompartilhar.addEventListener('click', copiarLink);
    el.btnTema.addEventListener('click', alternarTema);

    el.abasAutomato.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-etapa]');
      if (b) selecionarEtapa(b.dataset.etapa);
    });
    el.abasPainel.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-painel]');
      if (b) selecionarPainel(b.dataset.painel);
    });
    for (const lista of [el.abasAutomato, el.abasPainel]) {
      lista.addEventListener('keydown', (ev) => {
        if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
        const botoes = [...lista.querySelectorAll('button')];
        const i = botoes.indexOf(document.activeElement);
        if (i < 0) return;
        const prox = botoes[(i + (ev.key === 'ArrowRight' ? 1 : botoes.length - 1)) % botoes.length];
        prox.focus();
        prox.click();
        ev.preventDefault();
        ev.stopPropagation();
      });
    }

    $('#btnZoomMais').addEventListener('click', () => aplicarZoom(estado.zoom * 1.2));
    $('#btnZoomMenos').addEventListener('click', () => aplicarZoom(estado.zoom / 1.2));
    $('#btnAjustar').addEventListener('click', ajustarZoom);
    $('#btnReorganizar').addEventListener('click', () => {
      delete estado.posicoes[estado.etapa];
      desenhar({ ajustar: true });
      irParaPasso(estado.sim.indice);
    });
    document.querySelectorAll('[data-exportar]').forEach((b) => b.addEventListener('click', () => {
      b.closest('details').open = false;
      exportar(b.dataset.exportar);
    }));

    el.cadeia.addEventListener('input', () => { simularCadeia(0); atualizarHash(); salvarLocal(); });
    el.cadeia.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); alternarAnimacao(); } });
    el.simInicio.addEventListener('click', () => { pararAnimacao(); irParaPasso(0); });
    el.simVoltar.addEventListener('click', () => { pararAnimacao(); irParaPasso(estado.sim.indice - 1); });
    el.simAvancar.addEventListener('click', () => { pararAnimacao(); irParaPasso(estado.sim.indice + 1); });
    el.simFim.addEventListener('click', () => { pararAnimacao(); irParaPasso(estado.sim.passos.length - 1); });
    el.simTocar.addEventListener('click', alternarAnimacao);
    el.velocidade.addEventListener('input', () => { if (estado.sim.timer) { pararAnimacao(); alternarAnimacao(); } });
    el.rastro.addEventListener('click', (ev) => {
      const li = ev.target.closest('li[data-passo]');
      if (li) { pararAnimacao(); irParaPasso(Number(li.dataset.passo)); }
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.target.closest('input, textarea, select, [role="tablist"]') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (estado.painel !== 'simulacao' || !estado.sim.passos.length) return;
      const acoes = {
        ArrowRight: () => irParaPasso(estado.sim.indice + 1),
        ArrowLeft: () => irParaPasso(estado.sim.indice - 1),
        Home: () => irParaPasso(0),
        End: () => irParaPasso(estado.sim.passos.length - 1),
      };
      if (ev.key === ' ' && !ev.target.closest('button')) { ev.preventDefault(); alternarAnimacao(); return; }
      if (acoes[ev.key]) { ev.preventDefault(); pararAnimacao(); acoes[ev.key](); }
    });

    el.btnLote.addEventListener('click', () => { executarLote(); salvarLocal(); atualizarHash(); });
    el.resultadoLote.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr[data-cadeia]');
      if (tr) simularPalavra(tr.dataset.cadeia);
    });
    el.tamanhoMax.addEventListener('input', renderPalavras);
    el.palavras.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-cadeia]');
      if (b) simularPalavra(b.dataset.cadeia);
    });
    el.btnCarregarEquivalente.addEventListener('click', () => {
      if (!estado.resultado) return;
      el.gramatica.value = estado.resultado.gramaticaEquivalente;
      el.tipo.value = 'auto';
      gerar();
      avisar('Gramática equivalente carregada no editor.');
    });
    el.btnComparar.addEventListener('click', comparar);

    ligarRealce(el.construcao);
    ligarRealce(el.tabela);

    let timerResize = null;
    window.addEventListener('resize', () => {
      clearTimeout(timerResize);
      timerResize = setTimeout(() => aplicarZoom(estado.zoom), 120);
    });
  }

  function exportar(formato) {
    const af = afAtual();
    if (!af) { avisar('Nada para exportar: gere os autômatos primeiro.'); return; }
    const base = `automato-${estado.etapa}`;
    if (formato === 'dot') {
      baixar(`${base}.dot`, Automato.paraDOT(af, ETAPAS[estado.etapa]), 'text/vnd.graphviz');
    } else if (formato === 'json') {
      baixar(`${base}.json`, JSON.stringify(af, null, 2), 'application/json');
    } else {
      const { colunas, linhas } = Automato.tabelaTransicao(af);
      const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
      const csv = [['estado', 'inicial', 'final', ...colunas.map(sim)].map(q).join(',')]
        .concat(linhas.map((l) => [l.rotulo, l.inicial ? 'sim' : '', l.final ? 'sim' : '', ...l.celulas.map((c) => c.join(' '))].map(q).join(',')))
        .join('\r\n');
      baixar(`${base}.csv`, '﻿' + csv, 'text/csv');
    }
  }

  // ================================================================ início
  function iniciar() {
    ligarEventos();
    const daUrl = lerHash();
    let salvo = null;
    try { salvo = JSON.parse(lerLocal('lftc.estado') || 'null'); } catch (e) { salvo = null; }
    const ex = Exemplos[0];
    if (daUrl) {
      el.gramatica.value = daUrl.g;
      el.tipo.value = ['GLD', 'GLE', 'GLUD', 'GLUE'].includes(daUrl.t) ? daUrl.t : 'auto';
      el.cadeia.value = daUrl.w || '';
      el.lote.value = daUrl.l ?? (Exemplos.find((x) => x.texto === daUrl.g)?.lote || '');
    } else if (salvo && salvo.g) {
      el.gramatica.value = salvo.g;
      el.tipo.value = salvo.t || 'auto';
      el.cadeia.value = salvo.w || '';
      el.lote.value = salvo.lote || '';
    } else {
      el.gramatica.value = ex.texto;
      el.cadeia.value = ex.cadeia;
      el.lote.value = ex.lote;
    }
    if (daUrl?.e && ETAPAS[daUrl.e]) {
      estado.etapa = daUrl.e;
      for (const b of el.abasAutomato.querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.etapa === estado.etapa));
    }
    gerar();
    if (daUrl?.a) selecionarPainel(daUrl.a);
    if (daUrl?.p) irParaPasso(Number(daUrl.p));
    // Fontes da web mudam a largura dos rótulos: redesenha quando carregarem.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => jsp && jsp.repaintEverything());
  }

  jsPlumb.ready(iniciar);
})();
