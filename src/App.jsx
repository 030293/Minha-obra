import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard, GanttChartSquare, Calculator, TrendingUp, BookOpen,
  ShieldCheck, Users, ChevronRight, AlertTriangle, CheckCircle2, Clock,
  Plus, Flag, Diamond, FolderTree, Wallet, ArrowUpCircle, ArrowDownCircle,
  BellRing, Thermometer, Eye, Trash2, Image as ImageIcon, Upload, X, Camera,
  Building2, Download, FileSpreadsheet, FileJson, ClipboardCheck, HardHat, Package, Lightbulb,
  Gauge, History, UserCircle, ShoppingCart, Truck, Users2, CalendarDays, FileSignature, ShieldAlert, ClipboardList, Award,
} from "lucide-react";

/* ============================================================================
   PALETTE — "control room / drafting table" identity:
   graphite ribbon, blueprint steel-blue bars, amber for baseline/critical path,
   mint-green for completed work. Distinct from both source files' warm-cream
   and navy/orange looks — this one reads as planning software, not a brochure.
============================================================================ */
const G = {
  ribbon: "#171B21",
  ribbonSoft: "#232932",
  panel: "#FFFFFF",
  canvas: "#F3F4F6",
  grid: "#E4E7EB",
  ink: "#1A2027",
  sub: "#6B7280",
  faint: "#9AA3AE",
  steel: "#2D6FA3",
  steelDark: "#1F5378",
  amber: "#D9A027",
  amberDark: "#9C7311",
  mint: "#3C8A5C",
  mintBg: "#E6F3EB",
  red: "#C0392B",
  redBg: "#FBEAE7",
  gold: "#C99A2E",
  goldBg: "#F4E9CC",
  line: "#D7DBE0",
};

const fmtR$ = (n) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtPct = (v) => Math.round(v * 100) + "%";
const todayISO = new Date().toISOString().slice(0, 10); // data real do sistema — não mais hardcoded
const nowISO = () => new Date().toISOString().slice(0, 10);
const FORMAS_PAGAMENTO = ["Pix", "Boleto Bancário", "Transferência (TED/DOC)", "Cartão de Crédito", "Dinheiro", "Cheque"];
const dayMs = 86400000;
const toDate = (s) => new Date(s + "T00:00:00");
const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / dayMs);
const addDays = (iso, n) => { const d = toDate(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------------- Calendário de Dias Úteis — feriados nacionais fixos +
   móveis (calculados a partir da Páscoa pelo algoritmo de Computus) para
   2026-2027. É só um ponto de partida: edite em Dados da Obra se sua obra
   tem feriado municipal/estadual ou ponto facultativo específico. -------- */
const FERIADOS_PADRAO = [
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04",
  "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-01", "2027-05-27",
  "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-12-25",
];

/* ============================================================================
   MOTOR DE CRONOGRAMA — CPM real (Critical Path Method) com CALENDÁRIO DE
   DIAS ÚTEIS (pula fins de semana e feriados).
   Decisão de projeto: toda a matemática (forward E backward) roda em
   ÍNDICE INTEIRO de dia útil (1, 2, 3...), não em datas de calendário — só
   convertendo pra data no início (âncora) e no fim (exibição). Isso evita
   por construção qualquer assimetria entre forward/backward perto de
   feriados (testado: a versão que "empurra pro próximo dia útil" em cada
   passo gera folga artificial de ±1 dia quando um feriado cai bem na
   fronteira de uma transição — essa versão em índice puro não tem esse
   problema, porque soma/subtração de inteiros é exata).
   Forward pass: ES/EF a partir das predecessoras (Finish-to-Start + atraso/lag,
   atraso pode ser negativo para sobreposição/lead — agora em dias ÚTEIS).
   Backward pass: LS/LF a partir das sucessoras → folga total → crítico = folga 0.
   Detecta dependência circular (defensivo: a UI já impede, isto é um cinto de
   segurança caso o estado seja restaurado de um backup manipulado à mão).
============================================================================ */
function ehDiaUtil(iso, feriados, trabalhaSabado) {
  const dow = toDate(iso).getDay(); // 0=domingo, 6=sábado
  if (dow === 0) return false;
  if (dow === 6 && !trabalhaSabado) return false;
  if ((feriados || []).includes(iso)) return false;
  return true;
}
function construirCalendarioUtil(feriados, trabalhaSabado, dataBase, janela = 1300) {
  const indiceParaData = [null]; // 1-based
  const dataParaIndice = {};
  let d = addDays(dataBase, -30); // margem de segurança pra trás
  for (let i = 0; i < janela; i++) {
    if (ehDiaUtil(d, feriados, trabalhaSabado)) {
      indiceParaData.push(d);
      dataParaIndice[d] = indiceParaData.length - 1;
    }
    d = addDays(d, 1);
  }
  function dataParaIndiceProximo(data) {
    let dd = data;
    while (dataParaIndice[dd] === undefined) dd = addDays(dd, 1);
    return dataParaIndice[dd];
  }
  return { indiceParaData, dataParaIndiceProximo };
}
function computeSchedule(etapas, calendario) {
  const feriados = calendario?.feriados || [];
  const trabalhaSabado = calendario?.trabalhaSabado || false;
  const map = {};
  etapas.forEach((e) => { map[e.id] = e; });
  if (etapas.length === 0) return {};
  const anchorDates = etapas.filter((e) => (e.predecessoras || []).length === 0).map((e) => e.ini || todayISO);
  const earliestAnchor = anchorDates.length ? anchorDates.reduce((m, d) => (d < m ? d : m)) : todayISO;
  const cal = construirCalendarioUtil(feriados, trabalhaSabado, earliestAnchor);
  const dur = (e) => Math.max(1, Number(e.duracaoDias || 1));
  const lag = (e) => Number(e.atrasoDias || 0); // dias ÚTEIS, não corridos

  const computed = {};
  const visiting = new Set();
  const ciclos = new Set();
  function forward(id) {
    if (computed[id]) return computed[id];
    if (visiting.has(id)) { ciclos.add(id); return (computed[id] = { iniIdx: 1, fimIdx: 1 }); }
    visiting.add(id);
    const e = map[id];
    const preds = (e.predecessoras || []).filter((p) => map[p]);
    let iniIdx;
    if (preds.length === 0) {
      iniIdx = cal.dataParaIndiceProximo(e.ini || todayISO);
    } else {
      let maxFimIdx = null;
      preds.forEach((p) => { const r = forward(p); if (maxFimIdx === null || r.fimIdx > maxFimIdx) maxFimIdx = r.fimIdx; });
      iniIdx = maxFimIdx + 1 + lag(e);
    }
    const fimIdx = iniIdx + dur(e);
    visiting.delete(id);
    return (computed[id] = { iniIdx, fimIdx });
  }
  etapas.forEach((e) => forward(e.id));

  let projectEndIdx = 0;
  etapas.forEach((e) => { if (computed[e.id].fimIdx > projectEndIdx) projectEndIdx = computed[e.id].fimIdx; });

  const late = {};
  const visiting2 = new Set();
  function backward(id) {
    if (late[id]) return late[id];
    if (visiting2.has(id)) return (late[id] = { lsIdx: projectEndIdx, lfIdx: projectEndIdx });
    visiting2.add(id);
    const e = map[id];
    const succs = etapas.filter((o) => (o.predecessoras || []).includes(id));
    let lfIdx;
    if (succs.length === 0) {
      lfIdx = projectEndIdx;
    } else {
      let minLf = null;
      succs.forEach((s) => {
        const r = backward(s.id);
        const candidate = r.lsIdx - 1 - lag(s);
        if (minLf === null || candidate < minLf) minLf = candidate;
      });
      lfIdx = minLf;
    }
    visiting2.delete(id);
    const lsIdx = lfIdx - dur(e);
    return (late[id] = { lfIdx, lsIdx });
  }
  etapas.forEach((e) => backward(e.id));

  const result = {};
  etapas.forEach((e) => {
    const { iniIdx, fimIdx } = computed[e.id];
    const folgaDias = late[e.id].lsIdx - iniIdx;
    result[e.id] = {
      ini: cal.indiceParaData[iniIdx], fim: cal.indiceParaData[fimIdx],
      folgaDias, critico: folgaDias <= 0, ciclo: ciclos.has(e.id),
    };
  });
  return result;
}

/* isAncestor: 'ancestorId' já é (direta ou transitivamente) predecessora de
   'nodeId'? Usado para impedir que o usuário crie uma dependência circular
   ao ligar predecessoras no PredecessorPicker. */
function isAncestor(etapas, ancestorId, nodeId, visited = new Set()) {
  if (visited.has(nodeId)) return false;
  visited.add(nodeId);
  const node = etapas.find((e) => e.id === nodeId);
  if (!node) return false;
  for (const p of node.predecessoras || []) {
    if (p === ancestorId) return true;
    if (isAncestor(etapas, ancestorId, p, visited)) return true;
  }
  return false;
}

/* ============================================================================
   CPM COMBINADO — Planilha manda no Cronograma Mestre, item a item.
   Constrói UM grafo de CPM só com:
     - cada item de orçamento em modo detalhado (tem iniDetalhe) como nó
       próprio, com sua própria duração/atraso/predecessoras (que podem
       apontar para outro item da planilha OU para uma etapa sem detalhe);
     - cada etapa SEM nenhum item detalhado como nó próprio (exatamente como
       antes — zero mudança de comportamento pra quem não detalhou nada).
   Etapas COM itens detalhados saem do grafo de CPM e passam a ser só um
   "envelope" (resumo): início = menor início entre os filhos, término =
   maior término, crítica = se qualquer filho for crítico. É a mesma lógica
   que MS Project/P6 usam pra "summary task" — a diferença é que aqui isso
   acontece sozinho, sem you ter que recriar a tarefa-resumo na mão.
============================================================================ */
function resolverNoDestino(etapaId, itensPorEtapa) {
  const itens = itensPorEtapa[etapaId];
  return itens && itens.length > 0 ? itens.map((o) => o.id) : [etapaId];
}

function computeScheduleMestre(etapas, orcamento, calendario) {
  const itensPorEtapa = {};
  orcamento.forEach((o) => {
    if (!o.iniDetalhe) return;
    (itensPorEtapa[o.etapaId] = itensPorEtapa[o.etapaId] || []).push(o);
  });

  const nodes = [];
  etapas.forEach((e) => {
    const itens = itensPorEtapa[e.id];
    if (!itens || itens.length === 0) {
      // etapa sem detalhe: continua um nó de CPM normal, igual sempre foi
      nodes.push({ id: e.id, duracaoDias: e.duracaoDias, atrasoDias: e.atrasoDias, ini: e.ini, predecessoras: (e.predecessoras || []).flatMap((p) => resolverNoDestino(p, itensPorEtapa)) });
    } else {
      // etapa com detalhe: cada item da planilha é o próprio nó. Itens sem
      // predecessora própria HERDAM a(s) predecessora(s) da etapa-mãe —
      // assim o usuário não precisa recriar a dependência na mão ao
      // detalhar uma etapa que já estava ligada a outra.
      itens.forEach((o) => {
        const temPredecessoraPropria = (o.predecessorasDetalhe || []).length > 0;
        const preds = temPredecessoraPropria
          ? o.predecessorasDetalhe
          : (e.predecessoras || []).flatMap((p) => resolverNoDestino(p, itensPorEtapa));
        nodes.push({ id: o.id, duracaoDias: o.duracaoDetalheDias, atrasoDias: o.atrasoDetalheDias, ini: o.iniDetalhe, predecessoras: preds });
      });
    }
  });

  const scheduleCombinado = computeSchedule(nodes, calendario);

  // monta o "schedule mestre" por etapa: pass-through se não tem detalhe,
  // envelope (compactado) se tem.
  const scheduleMestre = {};
  etapas.forEach((e) => {
    const itens = itensPorEtapa[e.id];
    if (!itens || itens.length === 0) {
      scheduleMestre[e.id] = { ...scheduleCombinado[e.id], compactado: false, nItens: 0 };
    } else {
      let ini = null, fim = null, critico = false, folgaMin = Infinity, ciclo = false;
      itens.forEach((o) => {
        const sc = scheduleCombinado[o.id];
        if (!sc) return;
        if (!ini || sc.ini < ini) ini = sc.ini;
        if (!fim || sc.fim > fim) fim = sc.fim;
        if (sc.critico) critico = true;
        if (sc.ciclo) ciclo = true;
        if (sc.folgaDias < folgaMin) folgaMin = sc.folgaDias;
      });
      scheduleMestre[e.id] = { ini, fim, folgaDias: folgaMin === Infinity ? 0 : folgaMin, critico, ciclo, compactado: true, nItens: itens.length };
    }
  });

  return { scheduleMestre, scheduleCombinado, itensPorEtapa };
}

/* ---------------- WBS / Activities — etapas completas de uma obra de
   edificação, da terraplenagem à entrega (peso total = 100) ---------------- */
/* ---------------- Dados da Obra — cadastro geral (cliente, responsável
   técnico, empresa, endereço, contrato) usado no ribbon e na exportação ---- */
const DADOS_OBRA_SEED = {
  nome: "Residencial Jardim das Acácias",
  codigo: "OB-2026-001",
  endereco: "Rua das Flores, 123",
  bairro: "Jardim das Acácias",
  cidade: "Campinas",
  uf: "SP",
  cep: "13030-000",
  areaConstruida: "4850",
  cliente: "Construtora Horizonte Ltda.",
  cnpjCliente: "12.345.678/0001-90",
  empresaExecutora: "Construtora Horizonte Ltda.",
  cnpjEmpresa: "12.345.678/0001-90",
  responsavelTecnico: "Eng. Carlos Mendes",
  crea: "123456789-SP",
  art: "SP20260012345",
  coordenador: "Ana Paula Souza",
  dataInicio: "2026-01-05",
  dataFimPrevista: "2027-06-30",
  valorContrato: 18500000,
  regime: "Empreitada Global",
  bdi: 22,
  reservaContingenciaPct: 5,
  trabalhaSabado: false,
  feriados: FERIADOS_PADRAO,
  saldoInicialCaixa: 850000,
};

/* ---------------- WBS / Activities — etapas completas de uma obra de
   edificação, da terraplenagem à entrega (peso total = 100).
   Datas NÃO são mais digitadas livremente: só a atividade "1.0" (raiz, sem
   predecessora) tem uma data-âncora editável. Todas as outras nascem do
   motor de CPM acima a partir de duração + predecessoras + atraso (lag).
   "atrasoDias" pode ser negativo (sobreposição real de obra, ex.: elétrica
   começa antes da estrutura terminar 100%) — ver nota no chat sobre por que
   isso é mais realista que depender de tudo estar 100% pronto. ----------- */
const ETAPAS_SEED = [
  { id: "1.0", nome: "Serviços Preliminares e Mobilização", ini: "2026-01-05", duracaoDias: 15, peso: 3, predecessoras: [], atrasoDias: 0, pct: 100, atualizadoEm: "2026-01-20", numTrabalhadores: 12 },
  { id: "2.0", nome: "Terraplenagem e Movimento de Terra", duracaoDias: 20, peso: 5, predecessoras: ["1.0"], atrasoDias: 0, pct: 100, atualizadoEm: "2026-02-10", numTrabalhadores: 8 },
  { id: "3.0", nome: "Fundações", duracaoDias: 42, peso: 10, predecessoras: ["2.0"], atrasoDias: 0, pct: 100, atualizadoEm: "2026-03-25", numTrabalhadores: 22 },
  { id: "4.0", nome: "Estrutura (Concreto Armado)", duracaoDias: 168, peso: 20, predecessoras: ["3.0"], atrasoDias: 0, pct: 42, atualizadoEm: "2026-06-20", numTrabalhadores: 38 },
  { id: "5.0", nome: "Alvenaria e Vedações", duracaoDias: 136, peso: 10, predecessoras: ["3.0"], atrasoDias: 67, pct: 18, atualizadoEm: "2026-06-18", numTrabalhadores: 28 },
  { id: "6.0", nome: "Cobertura e Telhado", duracaoDias: 16, peso: 5, predecessoras: ["4.0"], atrasoDias: 0, pct: 0, atualizadoEm: null, numTrabalhadores: 14 },
  { id: "7.0", nome: "Instalações Elétricas", duracaoDias: 114, peso: 7, predecessoras: ["4.0"], atrasoDias: -28, pct: 0, atualizadoEm: null, numTrabalhadores: 16 },
  { id: "8.0", nome: "Instalações Hidrossanitárias", duracaoDias: 114, peso: 7, predecessoras: ["4.0"], atrasoDias: -28, pct: 0, atualizadoEm: null, numTrabalhadores: 14 },
  { id: "9.0", nome: "Impermeabilização", duracaoDias: 13, peso: 3, predecessoras: ["6.0"], atrasoDias: 0, pct: 0, atualizadoEm: null, numTrabalhadores: 8 },
  { id: "10.0", nome: "Revestimentos Internos", duracaoDias: 72, peso: 8, predecessoras: ["9.0"], atrasoDias: -1, pct: 0, atualizadoEm: null, numTrabalhadores: 24 },
  { id: "11.0", nome: "Revestimentos Externos / Fachada", duracaoDias: 72, peso: 6, predecessoras: ["9.0"], atrasoDias: -1, pct: 0, atualizadoEm: null, numTrabalhadores: 18 },
  { id: "12.0", nome: "Esquadrias (Portas e Janelas)", duracaoDias: 53, peso: 4, predecessoras: ["10.0"], atrasoDias: -59, pct: 0, atualizadoEm: null, numTrabalhadores: 10 },
  { id: "13.0", nome: "Pintura", duracaoDias: 36, peso: 5, predecessoras: ["10.0", "11.0"], atrasoDias: 0, pct: 0, atualizadoEm: null, numTrabalhadores: 16 },
  { id: "14.0", nome: "Pisos e Acabamentos", duracaoDias: 45, peso: 5, predecessoras: ["12.0"], atrasoDias: 7, pct: 0, atualizadoEm: null, numTrabalhadores: 20 },
  { id: "15.0", nome: "Limpeza Final e Paisagismo", duracaoDias: 12, peso: 1, predecessoras: ["13.0", "14.0"], atrasoDias: 0, pct: 0, atualizadoEm: null, numTrabalhadores: 6 },
  { id: "16.0", nome: "Entrega e Habite-se", duracaoDias: 35, peso: 1, predecessoras: ["15.0"], atrasoDias: 0, pct: 0, atualizadoEm: null, numTrabalhadores: 4 },
];

const novoInsumo = (nome, unidade, quantidadePrevista, precoUnitarioPrevisto, custoReal = 0) => ({
  id: uid(), nome, unidade, quantidadePrevista, precoUnitarioPrevisto, custoReal,
  formaPagamento: "Pix", dataPagamento: "", lancadoCaixa: false, caixaId: null,
});

const ORCAMENTO_SEED = [
  { id: "orc-2", etapaId: "2.0", categoria: "Terraplenagem e Movimento de Terra", maoObra: 250000, unidade: "m³", quantidade: 8000, precoUnitario: 50, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 50, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-01-21", duracaoDetalheDias: 14, pctDetalhe: 100, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Locação de máquinas (escavadeira/trator)", "h", 400, 1125, 450000), novoInsumo("Transporte de terra (bota-fora)", "viagem", 200, 1000, 200000)] },
  { id: "orc-3", etapaId: "3.0", categoria: "Fundações", maoObra: 1100000, unidade: "m³", quantidade: 3000, precoUnitario: 700, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 700, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-02-11", duracaoDetalheDias: 28, pctDetalhe: 100, predecessorasDetalhe: ["orc-2"], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Concreto Usinado fck 25MPa", "m³", 3000, 700, 2100000), novoInsumo("Aço CA-50", "ton", 180, 6111, 1100000)] },
  { id: "orc-4", etapaId: "4.0", categoria: "Estrutura de Concreto Armado", maoObra: 2200000, unidade: "m³", quantidade: 4500, precoUnitario: 800, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 800, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-03-26", duracaoDetalheDias: 115, pctDetalhe: 42, predecessorasDetalhe: ["orc-3"], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Concreto Usinado fck 30MPa", "m³", 1900, 974, 1850000), novoInsumo("Aço CA-50 / CA-60", "ton", 100, 6000, 600000)] },
  { id: "orc-5", etapaId: "5.0", categoria: "Alvenaria e Vedações", maoObra: 900000, unidade: "m²", quantidade: 8000, precoUnitario: 150, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 150, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-06-01", duracaoDetalheDias: 95, pctDetalhe: 18, predecessorasDetalhe: ["orc-3"], atrasoDetalheDias: 44,
    insumos: [novoInsumo("Blocos cerâmicos/concreto", "un.", 38000, 6.1, 230000), novoInsumo("Argamassa de assentamento", "saco", 5000, 30, 150000)] },
  { id: "orc-6", etapaId: "6.0", categoria: "Cobertura e Telhado", maoObra: 280000, unidade: "m²", quantidade: 2000, precoUnitario: 250, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 250, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-09-11", duracaoDetalheDias: 16, pctDetalhe: 0, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Telhas metálicas/cerâmicas", "m²", 2000, 180, 0), novoInsumo("Estrutura metálica do telhado", "kg", 12000, 12, 0)] },
  { id: "orc-7", etapaId: "7.0", categoria: "Instalações Elétricas", maoObra: 650000, unidade: "ponto", quantidade: 1600, precoUnitario: 500, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 500, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-07-31", duracaoDetalheDias: 114, pctDetalhe: 0, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Cabos e fios elétricos", "m", 25000, 8, 0), novoInsumo("Quadros, disjuntores e tomadas", "un.", 1600, 120, 0)] },
  { id: "orc-8", etapaId: "8.0", categoria: "Instalações Hidrossanitárias", maoObra: 500000, unidade: "ponto", quantidade: 1360, precoUnitario: 500, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 500, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-07-31", duracaoDetalheDias: 114, pctDetalhe: 0, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Tubos e conexões PVC/PPR", "m", 18000, 18, 0), novoInsumo("Louças e metais sanitários", "un.", 320, 850, 0)] },
  { id: "orc-9", etapaId: "9.0", categoria: "Impermeabilização", maoObra: 150000, unidade: "m²", quantidade: 900, precoUnitario: 300, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 300, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-10-06", duracaoDetalheDias: 13, pctDetalhe: 0, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Manta asfáltica/membrana impermeabilizante", "m²", 900, 220, 0), novoInsumo("Primer e acessórios", "lt", 300, 35, 0)] },
  { id: "orc-10", etapaId: "10.0", categoria: "Revestimentos Internos", maoObra: 750000, unidade: "m²", quantidade: 4500, precoUnitario: 200, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 200, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-10-26", duracaoDetalheDias: 72, pctDetalhe: 0, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Porcelanato/cerâmica interna", "m²", 4500, 65, 0), novoInsumo("Argamassa colante e rejunte", "saco", 4500, 28, 0)] },
  { id: "orc-11", etapaId: "11.0", categoria: "Revestimentos Externos / Fachada", maoObra: 550000, unidade: "m²", quantidade: 3250, precoUnitario: 200, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 200, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-10-26", duracaoDetalheDias: 72, pctDetalhe: 0, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Revestimento de fachada", "m²", 3250, 95, 0), novoInsumo("Texturas e acabamentos externos", "lt", 800, 45, 0)] },
  { id: "orc-12", etapaId: "12.0", categoria: "Esquadrias e Vidros", maoObra: 100000, unidade: "un.", quantidade: 220, precoUnitario: 4000, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 4000, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-11-11", duracaoDetalheDias: 53, pctDetalhe: 0, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Esquadrias de alumínio", "un.", 180, 3800, 0), novoInsumo("Vidros temperados", "m²", 600, 280, 0)] },
  { id: "orc-13", etapaId: "13.0", categoria: "Pintura", maoObra: 350000, unidade: "m²", quantidade: 6000, precoUnitario: 50, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 50, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2027-02-11", duracaoDetalheDias: 36, pctDetalhe: 0, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Tinta látex/acrílica", "lt", 1800, 60, 0), novoInsumo("Massa corrida e selador", "saco", 900, 70, 0)] },
  { id: "orc-1a", etapaId: "1.0", categoria: "Administração Local", maoObra: 1700000, unidade: "verba", quantidade: 1, precoUnitario: 0, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 0, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-01-05", duracaoDetalheDias: 11, pctDetalhe: 100, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Equipe de apoio administrativo (mensal)", "mês", 6, 86667, 520000), novoInsumo("Aluguel de canteiro/escritório", "mês", 6, 66667, 400000)] },
  { id: "orc-1b", etapaId: "1.0", categoria: "BDI / Indiretos", maoObra: 2400000, unidade: "verba", quantidade: 1, precoUnitario: 0, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 0, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "",
    iniDetalhe: "2026-01-05", duracaoDetalheDias: 11, pctDetalhe: 100, predecessorasDetalhe: [], atrasoDetalheDias: 0,
    insumos: [novoInsumo("Seguros e taxas administrativas", "verba", 1, 450000, 450000), novoInsumo("Despesas indiretas centrais", "verba", 1, 600000, 600000)] },
];
const materialTotal = (o) => Number(o.quantidade || 0) * Number(o.precoUnitario || 0);
// Aditivo de Material agora é quantidade × preço, igual o orçado base — não é
// mais um valor solto. Permite saber se o aditivo foi por mais quantitativo,
// por preço diferente, ou os dois (preço default = mesmo preço unitário
// original, mas é editável pra cobrir reajuste/troca de especificação).
const materialAditivoTotal = (o) => Number(o.quantidadeAditivo || 0) * Number(o.precoUnitarioAditivo ?? o.precoUnitario ?? 0);
// orçado "atual" já considera aditivos aprovados — é a base correta para EVM (BAC)
// e % consumido. orcadoOriginal fica só para auditoria/comparação na planilha.
// Aditivo é separado em Mão de Obra e Material, igual o orçado base — um
// aditivo de troca de material não é a mesma coisa de um aditivo de
// produtividade/mão de obra, e a retenção de INSS na medição do empreiteiro
// incide só sobre a parte de mão de obra, então essa distinção é real.
const aditivoTotal = (o) => Number(o.aditivoMaoObra || 0) + materialAditivoTotal(o);
const orcadoOriginal = (o) => Number(o.maoObra || 0) + materialTotal(o);
// orcadoTotal = CUSTO DIRETO orçado (mão de obra + material, original + aditivos).
// É o que alimenta EVM/BAC e % consumido — de propósito SEM encargos sociais
// nem BDI embutidos, pra controle de custo direto não se misturar com margem.
const orcadoTotal = (o) => orcadoOriginal(o) + aditivoTotal(o);
// Preço de Venda (o que de fato vai pro contrato/medição): mão de obra com
// encargos sociais (FGTS, INSS patronal, 13º, férias...) + material, tudo
// com BDI aplicado em cima. Isto é ADICIONAL ao custo direto acima — os dois
// convivem, controle de custo usa um, faturamento usa o outro.
const maoObraComEncargos = (o) => (Number(o.maoObra || 0) + Number(o.aditivoMaoObra || 0)) * (1 + Number(o.encargosSociaisPct || 0) / 100);
const custoDiretoComEncargos = (o) => maoObraComEncargos(o) + materialTotal(o) + materialAditivoTotal(o);
const precoVendaTotal = (o) => custoDiretoComEncargos(o) * (1 + Number(o.bdiPct || 0) / 100);
const realizadoTotal = (o) => (o.insumos && o.insumos.length > 0)
  ? o.insumos.reduce((s, ins) => s + Number(ins.custoReal || 0), 0)
  : Number(o.realizado || 0);

/* ============================================================================
   CURVA S — agora 100% derivada do cronograma (planejada) e de um histórico
   real de avanço (realizada), em vez de números digitados à mão.
============================================================================ */
const MES_NOMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function mesFimISO(ano, mesIdx) { return new Date(ano, mesIdx + 1, 0).toISOString().slice(0, 10); } // último dia do mês
function fracaoNoIntervalo(ini, fim, dataRef) {
  // fração [0,1] de quanto da janela [ini,fim] já passou até dataRef
  const total = diffDays(ini, fim);
  if (total <= 0) return dataRef >= fim ? 1 : 0;
  const passado = diffDays(ini, dataRef);
  return Math.max(0, Math.min(1, passado / total));
}
// % físico acumulado planejado, ponderado por peso, numa data qualquer
function pctPlanejadoEm(schedule, etapas, pesoTotal, dataISO) {
  if (!pesoTotal) return 0;
  const soma = etapas.reduce((s, e) => {
    const sc = schedule[e.id];
    if (!sc) return s;
    return s + e.peso * fracaoNoIntervalo(sc.ini, sc.fim, dataISO);
  }, 0);
  return soma / pesoTotal;
}
// série mensal planejada x realizada (realizada = histórico real registrado)
function gerarCurvaS(schedule, etapas, pesoTotal, historico) {
  if (etapas.length === 0) return [];
  const inicioProjeto = etapas.reduce((m, e) => (!m || schedule[e.id]?.ini < m ? schedule[e.id]?.ini : m), null);
  const fimProjeto = etapas.reduce((m, e) => (!m || schedule[e.id]?.fim > m ? schedule[e.id]?.fim : m), null);
  if (!inicioProjeto || !fimProjeto) return [];
  const histOrdenado = [...historico].sort((a, b) => (a.data < b.data ? -1 : 1));
  const hoje = nowISO();
  const out = [];
  let cur = new Date(toDate(inicioProjeto).getFullYear(), toDate(inicioProjeto).getMonth(), 1);
  const fimD = toDate(fimProjeto);
  while (cur <= fimD) {
    const ano = cur.getFullYear(), mesIdx = cur.getMonth();
    const inicioMesISO = cur.toISOString().slice(0, 10);
    const fimMesISO = mesFimISO(ano, mesIdx);
    const plan = Math.round(pctPlanejadoEm(schedule, etapas, pesoTotal, fimMesISO) * 100);
    // realizado: último ponto do histórico conhecido até a data de corte deste mês.
    // Mês totalmente no passado → corte = fim do mês. Mês corrente (em andamento) →
    // corte = hoje, para mostrar o avanço parcial já registrado em vez de "—".
    // Mês ainda não iniciado → sem dado nenhum, real = null (não inventa futuro).
    let real = null;
    if (inicioMesISO <= hoje) {
      const corte = fimMesISO < hoje ? fimMesISO : hoje;
      for (const h of histOrdenado) { if (h.data <= corte) real = Math.round(h.pct); else break; }
    }
    out.push({ mes: `${MES_NOMES[mesIdx]}/${String(ano).slice(2)}`, plan, real });
    cur = new Date(ano, mesIdx + 1, 1);
  }
  return out;
}

/* ============================================================================
   HISTOGRAMA DE MÃO DE OBRA — quantas pessoas a obra precisa por mês, lido
   direto do cronograma (numTrabalhadores de cada etapa × janela CPM real).
   "Pico simultâneo" = soma de quem está ativo no mês (pra dimensionar
   alojamento/efetivo máximo). "Médio ponderado" = pondera pelos dias do mês
   em que cada atividade realmente esteve ativa (mais realista pra custo).
============================================================================ */
function diasNoMes(ano, mesIdx) { return new Date(ano, mesIdx + 1, 0).getDate(); }
function diasAtivosNoMes(ini, fim, ano, mesIdx) {
  const inicioMes = new Date(ano, mesIdx, 1).toISOString().slice(0, 10);
  const fimMes = mesFimISO(ano, mesIdx);
  const inicioOverlap = ini > inicioMes ? ini : inicioMes;
  const fimOverlap = fim < fimMes ? fim : fimMes;
  if (inicioOverlap > fimOverlap) return 0;
  return diffDays(inicioOverlap, fimOverlap) + 1;
}
function gerarHistogramaMaoObra(schedule, etapas) {
  if (etapas.length === 0) return [];
  const inicioProjeto = etapas.reduce((m, e) => (!m || schedule[e.id]?.ini < m ? schedule[e.id]?.ini : m), null);
  const fimProjeto = etapas.reduce((m, e) => (!m || schedule[e.id]?.fim > m ? schedule[e.id]?.fim : m), null);
  if (!inicioProjeto || !fimProjeto) return [];
  const out = [];
  let cur = new Date(toDate(inicioProjeto).getFullYear(), toDate(inicioProjeto).getMonth(), 1);
  const fimD = toDate(fimProjeto);
  while (cur <= fimD) {
    const ano = cur.getFullYear(), mesIdx = cur.getMonth();
    const totalDiasMes = diasNoMes(ano, mesIdx);
    let efetivoMedio = 0, efetivoPico = 0;
    etapas.forEach((e) => {
      const sc = schedule[e.id];
      if (!sc) return;
      const diasAtivos = diasAtivosNoMes(sc.ini, sc.fim, ano, mesIdx);
      if (diasAtivos > 0) {
        efetivoMedio += (Number(e.numTrabalhadores || 0) * diasAtivos) / totalDiasMes;
        efetivoPico += Number(e.numTrabalhadores || 0);
      }
    });
    out.push({ mes: `${MES_NOMES[mesIdx]}/${String(ano).slice(2)}`, efetivoMedio: Math.round(efetivoMedio), efetivoPico: Math.round(efetivoPico) });
    cur = new Date(ano, mesIdx + 1, 1);
  }
  return out;
}

const HISTORICO_FISICO_SEED = [
  { data: "2026-01-20", pct: 3 },
  { data: "2026-02-10", pct: 8 },
  { data: "2026-03-25", pct: 18 },
  { data: "2026-06-18", pct: 19.8 },
  { data: "2026-06-20", pct: 28.2 },
];

const NR_SEED = [
  { nr: "NR-4", desc: "SESMT", status: "Conforme" }, { nr: "NR-5", desc: "CIPA", status: "Conforme" },
  { nr: "NR-6", desc: "EPI", status: "Conforme" }, { nr: "NR-10", desc: "Eletricidade", status: "Conforme" },
  { nr: "NR-12", desc: "Máquinas e equipamentos", status: "Em adequação" }, { nr: "NR-18", desc: "Construção civil", status: "Conforme" },
  { nr: "NR-24", desc: "Condições sanitárias", status: "Conforme" }, { nr: "NR-33", desc: "Espaços confinados", status: "Não aplicável" },
  { nr: "NR-35", desc: "Trabalho em altura", status: "Conforme" },
];

const DOCS_SEED = [
  { doc: "ART / RRT", validade: null, status: "Concluído" },
  { doc: "Alvará de Construção", validade: null, status: "Concluído" },
  { doc: "Licença Ambiental", validade: "2027-12-15", status: "Concluído" },
  { doc: "PGR", validade: "2027-01-10", status: "Concluído" },
  { doc: "PCMSO", validade: "2027-01-10", status: "Concluído" },
  { doc: "ASO (equipe)", validade: "2027-06-01", status: "Em andamento" },
  { doc: "Seguro de Obra", validade: "2027-06-30", status: "Concluído" },
  { doc: "Habite-se", validade: null, status: "Pendente" },
  { doc: "AVCB", validade: null, status: "Pendente" },
];

/* ---------------- Segurança — Registro de Acidentes e Incidentes. Os
   indicadores clássicos de canteiro (TF e TG) são calculados aqui
   automaticamente, a partir dos registros e do total de HHT informado.
   TF = (acidentes com afastamento × 1.000.000) / HHT
   TG = (dias perdidos × 1.000.000) / HHT
   Ambos são exigidos em licitação pública e auditoria de financiador. */
const ACIDENTES_SEED = [
  {
    id: "ac1", data: "2026-04-14",
    tipo: "Acidente sem afastamento",
    gravidade: "Leve",
    descricao: "Trabalhador sofreu corte superficial na mão ao manusear ferragem sem luva. Atendido no ambulatório da obra e retornou às atividades no mesmo dia.",
    funcionario: "José Andrade", funcao: "Armador", diasPerdidos: 0,
    cat: "", dataCat: null,
    acaoCorretiva: "DDS sobre uso de EPI específico para corte (luvas anti-corte), reposição de estoque de EPIs.",
    responsavel: "Técnico de Segurança",
  },
];

/* HHT acumulado — base para cálculo de TF e TG.
   Pode ser lançado como total acumulado ou por mês. */
const HHT_SEED = { totalHHT: 45000, horasDia: 8, mesAtual: todayISO.slice(0, 7) };

/* ── Last Planner / Lookahead — planejamento semanal Lean Construction.
   PPC = (tarefas concluídas / tarefas planejadas) × 100.
   Registra também o motivo quando uma tarefa não é concluída — isso é
   o que alimenta a análise de restrições (por que não concluiu?). ────── */
const LP_SEMANAS_SEED = [
  {
    id: "lp-s1", semanaNum: 24, periodoInicio: "2026-06-08", periodoFim: "2026-06-14",
    tarefas: [
      { id: "lp-t1", descricao: "Concretar laje do 4º pavimento (eixos A-D)", etapaId: "4.0", responsavel: "Roberto Lima", planejada: true, concluida: true, motivoNaoConclusao: "" },
      { id: "lp-t2", descricao: "Assentar alvenaria do 3º pavimento (bloco A)", etapaId: "5.0", responsavel: "João Pereira", planejada: true, concluida: true, motivoNaoConclusao: "" },
      { id: "lp-t3", descricao: "Instalar shaft elétrico pavimentos 1-3", etapaId: "7.0", responsavel: "Marcos Silva", planejada: true, concluida: false, motivoNaoConclusao: "Material não entregue pelo fornecedor" },
    ],
  },
  {
    id: "lp-s2", semanaNum: 25, periodoInicio: "2026-06-15", periodoFim: "2026-06-21",
    tarefas: [
      { id: "lp-t4", descricao: "Concretar laje do 5º pavimento", etapaId: "4.0", responsavel: "Roberto Lima", planejada: true, concluida: true, motivoNaoConclusao: "" },
      { id: "lp-t5", descricao: "Prumadas hidráulicas bloco B", etapaId: "8.0", responsavel: "Júlia Castro", planejada: true, concluida: true, motivoNaoConclusao: "" },
      { id: "lp-t6", descricao: "Instalar shaft elétrico pavimentos 1-3", etapaId: "7.0", responsavel: "Marcos Silva", planejada: true, concluida: true, motivoNaoConclusao: "" },
      { id: "lp-t7", descricao: "Impermeabilizar laje cobertura bloco A", etapaId: "9.0", responsavel: "Roberto Lima", planejada: true, concluida: false, motivoNaoConclusao: "Chuva imprevista — reagendado" },
    ],
  },
  {
    id: "lp-s3", semanaNum: 26, periodoInicio: "2026-06-22", periodoFim: "2026-06-28",
    tarefas: [
      { id: "lp-t8", descricao: "Alvenaria 4º pavimento bloco A e B", etapaId: "5.0", responsavel: "João Pereira", planejada: true, concluida: false, motivoNaoConclusao: "" },
      { id: "lp-t9", descricao: "Shaft elétrico pavimentos 4-6", etapaId: "7.0", responsavel: "Marcos Silva", planejada: true, concluida: false, motivoNaoConclusao: "" },
    ],
  },
];

/* ── Garantia / Assistência Técnica pós-entrega.
   Art. 618 CC: 5 anos de responsabilidade estrutural. Outros sistemas têm
   prazos próprios (NBR 17170 / norma de desempenho). A data de vencimento
   é calculada automaticamente a partir da data de entrega da obra.
   Chamados de garantia têm custo — isso impacta diretamente a margem real
   do empreendimento, que a obra pensa que termina na entrega. ─────────── */
const GARANTIAS_SEED = [
  { id: "ga1", sistema: "Estrutura e fundações", prazoMeses: 60, descricao: "Art. 618 CC — solidez e segurança estrutural" },
  { id: "ga2", sistema: "Impermeabilização", prazoMeses: 60, descricao: "NBR 17170 — garantia de estanqueidade" },
  { id: "ga3", sistema: "Instalações elétricas", prazoMeses: 12, descricao: "Funcionamento e segurança dos circuitos" },
  { id: "ga4", sistema: "Instalações hidrossanitárias", prazoMeses: 12, descricao: "Estanqueidade e funcionamento das tubulações" },
  { id: "ga5", sistema: "Revestimentos (azulejo/porcelanato)", prazoMeses: 12, descricao: "Aderência e rejuntamento" },
  { id: "ga6", sistema: "Esquadrias e vidros", prazoMeses: 12, descricao: "Funcionamento, vedação e fixação" },
  { id: "ga7", sistema: "Pintura interna", prazoMeses: 6, descricao: "Cobertura e acabamento" },
  { id: "ga8", sistema: "Pintura externa / fachada", prazoMeses: 24, descricao: "Aderência, cor e proteção" },
];
const CHAMADOS_GARANTIA_SEED = [];

const EQUIPE_SEED = [
  { nome: "João Pereira", funcao: "Pedreiro", vinculo: "CLT", indice: 1.05 },
  { nome: "Marcos Silva", funcao: "Eletricista", vinculo: "Empreiteiro", indice: 0.95 },
  { nome: "Júlia Castro", funcao: "Encanadora", vinculo: "Terceiro", indice: 1.10 },
  { nome: "Roberto Lima", funcao: "Mestre de Obras", vinculo: "Empreiteiro", indice: 1.00 },
  { nome: "Ana Paula Souza", funcao: "Coordenadora", vinculo: "CLT", indice: 1.08 },
];

/* ---------------- Matriz de Riscos e Banco de Lições Aprendidas — estavam
   no Excel e no primeiro painel, mas não tinham sido portados para este
   app. Voltam aqui com os mesmos campos do pedido original. -------------- */
const RISCOS_SEED = [
  { id: "r1", risco: "Atraso na entrega de concreto pela central", probabilidade: 3, impacto: 4, plano: "Manter fornecedor backup cadastrado e contrato de SLA com multa por atraso", responsavel: "Eng. Carlos Mendes", status: "Monitorando" },
  { id: "r2", risco: "Período chuvoso impactando concretagem e escavação", probabilidade: 4, impacto: 3, plano: "Antecipar serviços internos no período chuvoso; cobertura provisória em áreas críticas", responsavel: "Ana Paula Souza", status: "Monitorando" },
  { id: "r3", risco: "Escassez de mão de obra qualificada na região", probabilidade: 3, impacto: 4, plano: "Parceria com sindicato local para captação; treinamento interno de equipe própria", responsavel: "RH Obra", status: "Aberto" },
  { id: "r4", risco: "Reajuste de preços de aço/cimento acima do orçado", probabilidade: 2, impacto: 5, plano: "Compras programadas com contratos de longo prazo; trava de preço com fornecedor principal", responsavel: "Suprimentos", status: "Mitigado" },
  { id: "r5", risco: "Acidente de trabalho grave em altura ou eletricidade", probabilidade: 2, impacto: 5, plano: "Treinamentos NR-35/NR-10 semanais, auditorias de PT e uso de EPI fiscalizado", responsavel: "Téc. Segurança", status: "Monitorando" },
  { id: "r6", risco: "Atraso em aprovações/licenças municipais (Habite-se, AVCB)", probabilidade: 3, impacto: 3, plano: "Protocolar documentação com 90 dias de antecedência da entrega prevista", responsavel: "Eng. Carlos Mendes", status: "Aberto" },
];

const LICOES_SEED = [
  { id: "l1", data: "2026-03-20", problema: "Concretagem em período chuvoso causou retrabalho na laje do 2º pavimento", solucao: "Realocação rápida da equipe para serviços internos durante a chuva", impacto: "Perda de 1,5 dia de produtividade na equipe de estrutura", recomendacao: "Antecipar cronograma de concretagem para fora do período chuvoso em obras futuras na região", responsavel: "Eng. Carlos Mendes" },
  { id: "l2", data: "2026-05-05", problema: "Fornecedor de concreto atrasou entregas recorrentes em maio", solucao: "Acionamento de fornecedor backup evitou paralisação da concretagem", impacto: "Sem perda de prazo, mas custo unitário 8% maior no fornecedor backup", recomendacao: "Negociar cláusula de SLA mais rígida (multa por atraso) em próximos contratos de fornecimento de concreto", responsavel: "Suprimentos" },
];

/* ---------------- Não Conformidades — o elo entre "deu errado na hora" e
   custo/prazo real: cada NC pode gerar retrabalho (custo) e atraso, e se
   repetir, deveria nascer um Risco ou virar Lição Aprendida (mesma lógica
   de qualidade do PBQP-H/ISO 9001, sem precisar do jargão pra usar). ----- */
const NAO_CONFORMIDADES_SEED = [
  {
    id: "nc1", numero: 1, data: "2026-06-12", etapaId: "4.0",
    descricao: "Cobrimento de armadura fora de especificação em 3 pilares do 4º pavimento (medido 1,5cm, projeto exige 2,5cm)",
    tipo: "Execução", gravidade: "Alta",
    acaoCorretiva: "Demolição parcial e reexecução do cobrimento conforme NBR 6118, com nova inspeção antes da concretagem",
    responsavelCorrecao: "Roberto Lima", prazoCorrecao: "2026-06-18", status: "Corrigida",
    custoRetrabalho: 8500, abertoPor: "Eng. Carlos Mendes",
  },
  {
    id: "nc2", numero: 2, data: "2026-06-22", etapaId: "5.0",
    descricao: "Lote de blocos cerâmicos recebido com resistência abaixo do especificado em ensaio de recebimento",
    tipo: "Material", gravidade: "Média",
    acaoCorretiva: "Lote devolvido ao fornecedor; substituição por lote aprovado em laudo",
    responsavelCorrecao: "Suprimentos", prazoCorrecao: "2026-07-02", status: "Em Correção",
    custoRetrabalho: 0, abertoPor: "Ana Paula Souza",
  },
];

const DIARIO_SEED = [
  { data: "20/06/2026", clima: "Ensolarado", temp: "27°C", equipe: 38, equipamentos: "1 grua, 1 betoneira, 2 andaimes", servicos: "Armação e forma de pilares 5º pav.", ocorrencias: "Nenhuma", visitas: "—", produtividade: 0.91, observacoes: "" },
  { data: "22/06/2026", clima: "Ensolarado", temp: "29°C", equipe: 42, equipamentos: "2 gruas, 1 betoneira, 3 andaimes", servicos: "Concretagem laje 5º pav.; alvenaria 3º pav.", ocorrencias: "Atraso na entrega de concreto (30 min)", visitas: "Cliente — visita de acompanhamento às 14h", produtividade: 0.94, observacoes: "Reprogramação do início da concretagem" },
  { data: "23/06/2026", clima: "Nublado", temp: "22°C", equipe: 40, equipamentos: "1 grua, 2 andaimes", servicos: "Instalações elétricas 3º pav.; reboco 2º pav.", ocorrencias: "Nenhuma", visitas: "Fiscalização da Prefeitura (rotina)", produtividade: 0.89, observacoes: "" },
  { data: "24/06/2026", clima: "Chuva leve", temp: "18°C", equipe: 28, equipamentos: "1 betoneira", servicos: "Serviços internos (acabamento) devido à chuva", ocorrencias: "Chuva impediu concretagem externa", visitas: "—", produtividade: 0.71, observacoes: "Equipe realocada para serviços internos" },
  { data: "25/06/2026", clima: "Ensolarado", temp: "26°C", equipe: 45, equipamentos: "2 gruas, 1 betoneira, 4 andaimes", servicos: "Concretagem laje 6º pav.; alvenaria 4º pav.", ocorrencias: "Nenhuma", visitas: "—", produtividade: 0.97, observacoes: "Recuperação de produtividade após chuva" },
];

/* ---------------- Fluxo de Caixa — entradas e saídas com vencimento,
   usado para gerar alertas de contas vencidas / a vencer ------------------ */
const CAIXA_SEED = [
  { id: "c1", data: "2026-06-01", tipo: "Entrada", categoria: "Medição Cliente", descricao: "Medição nº5 — maio/26", valor: 1910000, vencimento: "2026-06-05", status: "Recebido" },
  { id: "c2", data: "2026-06-10", tipo: "Saída", categoria: "Fornecedor", descricao: "Cimentos Vale — NF 4521", valor: 46500, vencimento: "2026-06-20", status: "Pago" },
  { id: "c3", data: "2026-06-15", tipo: "Saída", categoria: "Folha de Pagamento", descricao: "Salários equipe própria — junho/26", valor: 185000, vencimento: "2026-06-30", status: "Pendente" },
  { id: "c4", data: "2026-06-18", tipo: "Saída", categoria: "Fornecedor", descricao: "AçoForte — NF 8832", valor: 59800, vencimento: "2026-06-22", status: "Pendente" },
  { id: "c5", data: "2026-06-20", tipo: "Saída", categoria: "Subcontratada", descricao: "ElétricaTotal — medição parcial", valor: 120000, vencimento: "2026-07-02", status: "Pendente" },
  { id: "c6", data: "2026-06-22", tipo: "Entrada", categoria: "Aporte do Cliente", descricao: "Antecipação para compra de esquadrias", valor: 300000, vencimento: "2026-06-22", status: "Recebido" },
  { id: "c7", data: "2026-06-24", tipo: "Saída", categoria: "Tributos", descricao: "INSS / FGTS — competência maio", valor: 78000, vencimento: "2026-06-28", status: "Pendente" },
  { id: "c8", data: "2026-06-25", tipo: "Saída", categoria: "Equipamentos", descricao: "Locação de grua — junho/26", valor: 42000, vencimento: "2026-07-10", status: "Pendente" },
];

/* ---------------- Medições — controle de medição "para cima" (com o
   dono da obra / cliente, base do faturamento) e "para baixo" (com cada
   empreiteiro/subcontratada, base do pagamento) -------------------------- */
const MEDICAO_DONO_SEED = [
  { id: "md1", numero: 1, periodo: "jan/26", data: "2026-01-31", valorMedido: 1180000, retencaoPct: 5, status: "Paga" },
  { id: "md2", numero: 2, periodo: "fev/26", data: "2026-02-28", valorMedido: 1450000, retencaoPct: 5, status: "Paga" },
  { id: "md3", numero: 3, periodo: "mar/26", data: "2026-03-31", valorMedido: 1620000, retencaoPct: 5, status: "Paga" },
  { id: "md4", numero: 4, periodo: "abr/26", data: "2026-04-30", valorMedido: 1780000, retencaoPct: 5, status: "Faturada" },
  { id: "md5", numero: 5, periodo: "mai/26", data: "2026-05-31", valorMedido: 1910000, retencaoPct: 5, status: "Aprovada" },
  { id: "md6", numero: 6, periodo: "jun/26", data: "2026-06-26", valorMedido: 1980000, retencaoPct: 5, status: "Pendente" },
];

const MEDICAO_EMPREITEIRO_SEED = [
  { id: "me1", empreiteiro: "Fundações Sul Eng.", etapaId: "3.0", numero: 1, periodo: "fev/26", valorMedido: 1100000, retencaoPct: 10, status: "Paga" },
  { id: "me2", empreiteiro: "Fundações Sul Eng.", etapaId: "3.0", numero: 2, periodo: "mar/26", valorMedido: 2100000, retencaoPct: 10, status: "Paga" },
  { id: "me3", empreiteiro: "ElétricaTotal", etapaId: "7.0", numero: 1, periodo: "jun/26", valorMedido: 120000, retencaoPct: 5, status: "Aprovada" },
  { id: "me4", empreiteiro: "HidroPlus", etapaId: "8.0", numero: 1, periodo: "jun/26", valorMedido: 85000, retencaoPct: 5, status: "Pendente" },
  { id: "me5", empreiteiro: "Vidro & Cia", etapaId: "12.0", numero: 1, periodo: "jun/26", valorMedido: 0, retencaoPct: 5, status: "Pendente" },
];

/* ---------------- Contratos com Empreiteiros — valor contratado de cada
   subcontratada, usado para calcular o saldo (contratado - medido) -------- */
const EMPREITEIROS_SEED = [
  { nome: "Fundações Sul Eng.", servico: "Fundações e Estrutura", valorContratado: 5200000 },
  { nome: "ElétricaTotal", servico: "Instalações Elétricas", valorContratado: 1450000 },
  { nome: "HidroPlus", servico: "Instalações Hidrossanitárias", valorContratado: 1180000 },
  { nome: "Vidro & Cia", servico: "Esquadrias e Vidros", valorContratado: 980000 },
];

/* ---------------- Compras / Suprimentos — vinculado ao cronograma pela
   etapa: "Data Necessária" = início (CPM) da etapa menos o lead time de
   compra, pra alertar se o fornecedor vai atrasar a obra (não só "está
   atrasado" isolado — atrasado EM RELAÇÃO ao que o cronograma precisa). --- */
const COMPRAS_SEED = [
  { id: "cp1", item: "Concreto Usinado fck 25MPa", etapaId: "3.0", fornecedor: "Central de Concreto SA", dataSolicitacao: "2025-12-15", leadTimeDias: 20, previsaoEntrega: "2026-02-05", status: "Entregue", valor: 2100000 },
  { id: "cp2", item: "Aço CA-50", etapaId: "3.0", fornecedor: "AçoForte Distribuidora", dataSolicitacao: "2025-12-10", leadTimeDias: 30, previsaoEntrega: "2026-01-25", status: "Entregue", valor: 1100000 },
  { id: "cp3", item: "Concreto Usinado fck 30MPa", etapaId: "4.0", fornecedor: "Central de Concreto SA", dataSolicitacao: "2026-03-01", leadTimeDias: 15, previsaoEntrega: "2026-03-20", status: "Em entrega parcial", valor: 1850000 },
  { id: "cp4", item: "Telhas metálicas/cerâmicas", etapaId: "6.0", fornecedor: "TelhaSul Materiais", dataSolicitacao: "2026-06-20", leadTimeDias: 45, previsaoEntrega: "2026-08-10", status: "Pedido emitido", valor: 360000 },
  { id: "cp5", item: "Cabos e fios elétricos", etapaId: "7.0", fornecedor: "ElétricaTotal Suprimentos", dataSolicitacao: "2026-06-15", leadTimeDias: 60, previsaoEntrega: "2026-08-20", status: "Em cotação", valor: 200000 },
  { id: "cp6", item: "Esquadrias de alumínio", etapaId: "12.0", fornecedor: "Vidro & Cia", dataSolicitacao: "2026-06-25", leadTimeDias: 90, previsaoEntrega: "2026-09-25", status: "Solicitado", valor: 684000 },
  { id: "cp7", item: "Porcelanato/cerâmica interna", etapaId: "10.0", fornecedor: "RevestMax", dataSolicitacao: "", leadTimeDias: 35, previsaoEntrega: "", status: "Não solicitado", valor: 292500 },
];

/* ---------------- Gestão de Mudanças — Termos Aditivos Contratuais. É o
   elo que faltava entre o aditivo financeiro (planilha) e o impacto de
   prazo (cronograma): aprovar um termo aqui aplica os dois ao mesmo tempo,
   na mesma transação, com motivo e aprovação registrados. Antes de
   aprovado, é só uma PROPOSTA — não altera orçamento nem cronograma. ----- */
const TERMOS_ADITIVOS_SEED = [
  {
    id: "ta1", numero: 1, data: "2026-06-10",
    titulo: "Solo rochoso encontrado na escavação — reforço de fundação",
    motivo: "Sondagem complementar identificou camada rochosa não prevista no projeto original entre os eixos B3-B5. Necessário reforço de fundação com maior volume de concreto e armação.",
    status: "Solicitado", solicitadoPor: "Eng. Carlos Mendes", aprovadoPor: null, dataDecisao: null,
    orcamentoItemId: "orc-3", aditivoMaoObraProposto: 45000, quantidadeAditivoProposta: 60, precoUnitarioAditivoProposto: 700,
    impactoPrazoDias: 5, aplicado: false,
  },
  {
    id: "ta2", numero: 2, data: "2026-06-24",
    titulo: "Troca de especificação de revestimento de fachada (solicitação do cliente)",
    motivo: "Cliente solicitou upgrade do revestimento de fachada de textura acrílica para porcelanato de fachada ventilada, conforme e-mail de 22/06.",
    status: "Em Análise", solicitadoPor: "Eng. Carlos Mendes", aprovadoPor: null, dataDecisao: null,
    orcamentoItemId: "orc-11", aditivoMaoObraProposto: 80000, quantidadeAditivoProposta: 0, precoUnitarioAditivoProposto: 0,
    impactoPrazoDias: 8, aplicado: false,
  },
];

/* ---------------- Registro Fotográfico — agrupado por mês, vinculado ao
   diário de obra pela data (formato BR no diário, ISO aqui) -------------- */
const toBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const toISO = (br) => (br ? br.split("/").reverse().join("-") : "");
const mesLabel = (iso) => {
  if (!iso) return "Sem data";
  const [y, m] = iso.split("-");
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[Number(m) - 1]}/${y.slice(2)}`;
};

const FOTOS_SEED = [
  { id: "f1", data: "2026-06-20", legenda: "Armação de pilares — 5º pavimento", etapaId: "4.0", url: "https://picsum.photos/seed/obra-pilar5/480/340" },
  { id: "f2", data: "2026-06-22", legenda: "Concretagem da laje — 5º pavimento", etapaId: "4.0", url: "https://picsum.photos/seed/obra-laje5/480/340" },
  { id: "f3", data: "2026-06-23", legenda: "Alvenaria em execução — 3º pavimento", etapaId: "5.0", url: "https://picsum.photos/seed/obra-alvenaria3/480/340" },
  { id: "f4", data: "2026-06-24", legenda: "Acabamento interno durante a chuva", etapaId: "5.0", url: "https://picsum.photos/seed/obra-chuva/480/340" },
  { id: "f5", data: "2026-06-25", legenda: "Concretagem da laje — 6º pavimento", etapaId: "4.0", url: "https://picsum.photos/seed/obra-laje6/480/340" },
  { id: "f6", data: "2026-05-12", legenda: "Fôrmas da fundação — radier", etapaId: "3.0", url: "https://picsum.photos/seed/obra-fundacao/480/340" },
  { id: "f7", data: "2026-04-02", legenda: "Movimento de terra — corte e aterro", etapaId: "2.0", url: "https://picsum.photos/seed/obra-terraplenagem/480/340" },
];

const PIE_COLORS = [G.steel, G.amber, G.mint, G.gold, "#7C8CA8", "#A35A2E", "#5B7A8C", "#8C6F45"];

function statusTone(status) {
  if (status === "Conforme" || status === "Concluído") return { c: G.mint, bg: G.mintBg };
  if (status === "Em adequação" || status === "Em andamento" || status === "Vence em breve") return { c: G.amberDark, bg: G.goldBg };
  if (status === "Não conforme" || status === "Pendente" || status === "VENCIDO") return { c: G.red, bg: G.redBg };
  return { c: G.faint, bg: "#EEF0F2" };
}
function alertaValidade(validade) {
  if (!validade) return null;
  const diff = diffDays(todayISO, validade);
  if (diff < 0) return "VENCIDO";
  if (diff < 60) return "Vence em breve";
  return "OK";
}
function alertaCaixa(item) {
  if (item.status !== "Pendente") return null;
  const diff = diffDays(todayISO, item.vencimento);
  if (diff < 0) return "VENCIDO";
  if (diff <= 5) return "Vence em breve";
  return null;
}
function alertaNC(nc) {
  if (nc.status === "Corrigida" || nc.status === "Verificada") return null;
  const diff = diffDays(todayISO, nc.prazoCorrecao);
  if (diff < 0) return "VENCIDO";
  if (diff <= 3) return "Vence em breve";
  return null;
}

/* ============================================================================
   PERSISTÊNCIA — funciona dentro do Claude (window.storage, por conversa) E
   fora dele (localStorage, por navegador), sem precisar trocar nada na hora
   de copiar este componente para um projeto Vite/Next.js padrão. Se nenhum
   dos dois existir (ex.: renderização em servidor), os dados simplesmente
   não persistem entre sessões — o app continua funcionando normalmente.
============================================================================ */
/* ============================================================================
   PERSISTÊNCIA — funciona dentro do Claude (window.storage, por conversa) E
   fora dele (localStorage, por navegador), sem precisar trocar nada na hora
   de copiar este componente para um projeto Vite/Next.js padrão. Se nenhum
   dos dois existir (ex.: renderização em servidor), os dados simplesmente
   não persistem entre sessões — o app continua funcionando normalmente.

   MULTIPROJETO: cada obra tem sua própria chave de armazenamento
   ("p6obra:projeto:<id>"). A lista de obras (metadado leve: nome, código,
   data de criação) fica numa chave separada ("p6obra:lista_projetos"). Isso
   significa que TODO o motor interno (CPM, EVM, orçamento, etc.) continua
   exatamente igual — só o "endereço" de onde ele lê/grava mudou.
============================================================================ */
const STORAGE_KEY_ANTIGA = "p6obra:state"; // chave única usada antes do multiprojeto — só pra migração
const STORAGE_KEY_LISTA = "p6obra:lista_projetos";
const chaveProjeto = (projetoId) => `p6obra:projeto:${projetoId}`;
function temStorageClaude() {
  return typeof window !== "undefined" && !!window.storage && typeof window.storage.get === "function";
}
function temLocalStorage() {
  try { return typeof localStorage !== "undefined" && !!localStorage; } catch { return false; }
}
function backendDePersistencia() {
  if (temStorageClaude()) return "Claude Artifacts (vinculado a esta conversa)";
  if (temLocalStorage()) return "navegador local (localStorage) — sobrevive a recarregar a página, mas é só neste dispositivo/navegador";
  return "nenhum — os dados não serão salvos ao recarregar";
}
async function lerChave(chave) {
  try {
    if (temStorageClaude()) {
      const r = await window.storage.get(chave, false);
      return r ? JSON.parse(r.value) : null;
    }
  } catch {}
  try {
    if (temLocalStorage()) {
      const raw = localStorage.getItem(chave);
      return raw ? JSON.parse(raw) : null;
    }
  } catch {}
  return null;
}
async function gravarChave(chave, valor) {
  try {
    if (temStorageClaude()) { await window.storage.set(chave, JSON.stringify(valor), false); return; }
  } catch {}
  try {
    if (temLocalStorage()) localStorage.setItem(chave, JSON.stringify(valor));
  } catch {}
}
async function removerChave(chave) {
  try { if (temStorageClaude()) { await window.storage.delete(chave, false); return; } } catch {}
  try { if (temLocalStorage()) localStorage.removeItem(chave); } catch {}
}
async function loadState(projetoId) {
  return lerChave(chaveProjeto(projetoId));
}
async function saveState(projetoId, s) {
  return gravarChave(chaveProjeto(projetoId), s);
}
async function loadListaProjetos() {
  return (await lerChave(STORAGE_KEY_LISTA)) || [];
}
async function saveListaProjetos(lista) {
  return gravarChave(STORAGE_KEY_LISTA, lista);
}
/* Migração: usuários que já tinham uma obra salva na chave antiga (única,
   pré-multiprojeto) não perdem o trabalho — ela se torna a primeira obra
   da lista automaticamente, na primeira vez que o portfólio carrega. */
async function migrarOuInicializarPortfolio() {
  const listaExistente = await loadListaProjetos();
  if (listaExistente.length > 0) return listaExistente;
  const estadoAntigo = await lerChave(STORAGE_KEY_ANTIGA);
  const novoId = uid();
  if (estadoAntigo) {
    await saveState(novoId, estadoAntigo);
    const nome = estadoAntigo.dadosObra?.nome || "Minha Obra";
    const codigo = estadoAntigo.dadosObra?.codigo || novoId;
    const lista = [{ id: novoId, nome, codigo, criadoEm: nowISO() }];
    await saveListaProjetos(lista);
    return lista;
  }
  // obra realmente do zero (nenhuma lista, nenhum estado antigo pra migrar):
  // salva um objeto vazio como estado — o "{}" é truthy, então o
  // ObraWorkspace cai no branch "if (s)" do carregamento, e cada campo
  // individualmente recai pro seu *_SEED correspondente (s.etapas ||
  // ETAPAS_SEED, etc.), reconstruindo o estado completo da demonstração sem
  // duplicar a lista de seeds aqui (evita os dois ficarem dessincronizados).
  await saveState(novoId, {});
  const lista = [{ id: novoId, nome: DADOS_OBRA_SEED.nome, codigo: DADOS_OBRA_SEED.codigo, criadoEm: nowISO() }];
  await saveListaProjetos(lista);
  return lista;
}
/* Resumo leve de uma obra pra exibir no card do portfólio, sem precisar
   "entrar" nela — reusa as MESMAS funções puras do motor principal. */
function calcularResumoProjeto(estado) {
  if (!estado) return null;
  const etapas = estado.etapas || ETAPAS_SEED;
  const orcamento = estado.orcamento || ORCAMENTO_SEED;
  const dadosObra = estado.dadosObra || DADOS_OBRA_SEED;
  const caixa = estado.caixa || [];
  const calendario = { feriados: dadosObra.feriados || [], trabalhaSabado: !!dadosObra.trabalhaSabado };
  let pctFisico = 0, totalOrcado = 0, totalRealizado = 0, desvio = 0;
  try {
    const { scheduleMestre } = computeScheduleMestre(etapas, orcamento, calendario);
    const pesoTotal = etapas.reduce((s, e) => s + e.peso, 0) || 1;
    const pctEfetivoPorEtapa = {};
    etapas.forEach((e) => {
      const itens = orcamento.filter((o) => o.etapaId === e.id && o.iniDetalhe);
      pctEfetivoPorEtapa[e.id] = itens.length > 0
        ? itens.reduce((s, o) => s + orcadoTotal(o) * (Number(o.pctDetalhe) || 0), 0) / (itens.reduce((s, o) => s + orcadoTotal(o), 0) || 1)
        : e.pct;
    });
    pctFisico = etapas.reduce((s, e) => s + (e.peso * (pctEfetivoPorEtapa[e.id] || 0)) / 100, 0) / pesoTotal;
    totalOrcado = orcamento.reduce((s, o) => s + orcadoTotal(o), 0);
    totalRealizado = orcamento.reduce((s, o) => s + realizadoTotal(o), 0);
    const pctPlanHoje = pctPlanejadoEm(scheduleMestre, etapas, pesoTotal, todayISO);
    desvio = Math.round((pctFisico - pctPlanHoje) * 1000) / 10;
  } catch {}
  const totalEntradas = caixa.filter((c) => c.tipo === "Entrada").reduce((s, c) => s + Number(c.valor || 0), 0);
  const totalSaidas = caixa.filter((c) => c.tipo === "Saída").reduce((s, c) => s + Number(c.valor || 0), 0);
  const saldoCaixa = Number(dadosObra.saldoInicialCaixa || 0) + totalEntradas - totalSaidas;
  return {
    nome: dadosObra.nome, codigo: dadosObra.codigo, cliente: dadosObra.cliente,
    valorContrato: Number(dadosObra.valorContrato || 0), pctFisico, totalOrcado, totalRealizado, desvio,
    saldoCaixa, totalEntradas, totalSaidas,
  };
}

function Badge({ status }) {
  const t = statusTone(status);
  return (
    <span style={{ background: t.bg, color: t.c, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 3, whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}
function Panel({ children, style }) {
  return <div style={{ background: G.panel, border: `1px solid ${G.grid}`, borderRadius: 3, ...style }}>{children}</div>;
}
function PanelHead({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 13px", borderBottom: `1px solid ${G.grid}`, background: "#FAFBFC" }}>
      {Icon && <Icon size={13} color={G.steel} />}
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: G.ink }}>{children}</span>
    </div>
  );
}
function KPI({ label, value, sub, accent }) {
  return (
    <Panel style={{ padding: "11px 14px", borderLeft: `3px solid ${accent || G.steel}` }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: G.sub }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: G.ink, marginTop: 3, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: G.faint, marginTop: 1 }}>{sub}</div>}
    </Panel>
  );
}

/* Editable-cell convention (industry standard spreadsheet color coding):
   blue text + pale-blue fill = hardcoded input the user can change.
   Everything else (black text, white/gray fill) is a calculated, read-only formula. */
const EDIT_BG = "#EAF2FC";
const EDIT_BORDER = "#9FC2E8";
const EDIT_TEXT = "#1456A0";

function EditCell({ value, onChange, type = "text", align = "left", width, prefix, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, borderRadius: 3, padding: "2px 6px", width: width || "100%" }}>
      {prefix && <span style={{ fontSize: 11, color: EDIT_TEXT, marginRight: 3 }}>{prefix}</span>}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        style={{
          border: "none", background: "transparent", padding: 0, width: "100%",
          color: EDIT_TEXT, fontWeight: 700, textAlign: align,
          fontFamily: type === "number" ? "'JetBrains Mono', monospace" : "inherit",
        }}
      />
    </div>
  );
}
function EditSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700, borderRadius: 3, padding: "3px 5px", width: "100%" }}>
      {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
function PredecessorPicker({ etapas, atual, onChange }) {
  const lista = atual.predecessoras || [];
  const opcoes = etapas.filter((e) => e.id !== atual.id && !lista.includes(e.id) && !isAncestor(etapas, atual.id, e.id));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
      {lista.map((pid) => (
        <span key={pid} style={{ background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 9, display: "flex", alignItems: "center", gap: 3 }}>
          {pid}
          <button onClick={() => onChange(lista.filter((p) => p !== pid))} style={{ background: "none", border: "none", color: EDIT_TEXT, cursor: "pointer", padding: 0, fontSize: 11, lineHeight: 1 }}>×</button>
        </span>
      ))}
      {opcoes.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onChange([...lista, e.target.value])}
          style={{ fontSize: 10, border: `1px dashed ${EDIT_BORDER}`, borderRadius: 3, color: G.sub, background: "transparent", padding: "1px 3px" }}>
          <option value="">+ ligar</option>
          {opcoes.map((o) => <option key={o.id} value={o.id}>{o.id}</option>)}
        </select>
      )}
    </div>
  );
}

/* Igual ao de cima, mas pro nível detalhado: a predecessora de um item da
   planilha pode ser OUTRO item da planilha (qualquer etapa, não só a mesma)
   OU uma etapa que ainda não foi detalhada. Rótulo legível em vez do id
   técnico, e o cheque de ciclo roda no mesmo grafo combinado que o CPM usa. */
function PredecessorPickerDetalhe({ orcamento, etapas, atual, onChange }) {
  const itensDetalhados = orcamento.filter((o) => o.iniDetalhe && o.id !== atual.id);
  const etapasComDetalhe = new Set(orcamento.filter((o) => o.iniDetalhe).map((o) => o.etapaId));
  const etapasSemDetalhe = etapas.filter((e) => !etapasComDetalhe.has(e.id));
  const pool = [
    ...itensDetalhados.map((o) => ({ id: o.id, label: `${o.etapaId} · ${o.categoria}`, etapaId: o.etapaId })),
    ...etapasSemDetalhe.map((e) => ({ id: e.id, label: `${e.id} · ${e.nome} (etapa s/ detalhe)`, etapaId: e.id })),
  ];
  const grafoParaCiclo = [
    ...orcamento.filter((o) => o.iniDetalhe).map((o) => ({ id: o.id, predecessoras: o.predecessorasDetalhe || [] })),
    ...etapasSemDetalhe.map((e) => ({ id: e.id, predecessoras: e.predecessoras || [] })),
  ];
  const lista = atual.predecessorasDetalhe || [];
  const opcoes = pool.filter((p) => !lista.includes(p.id) && !isAncestor(grafoParaCiclo, atual.id, p.id));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {lista.map((pid) => {
        const ref = pool.find((p) => p.id === pid) || itensDetalhados.find((o) => o.id === pid) || { label: pid };
        const outraEap = ref.etapaId && ref.etapaId !== atual.etapaId;
        return (
          <span key={pid} title={outraEap ? "Predecessora de outra EAP/categoria" : "Predecessora da mesma EAP"}
            style={{ background: outraEap ? G.goldBg : EDIT_BG, border: `1px solid ${outraEap ? G.gold : EDIT_BORDER}`, color: outraEap ? G.amberDark : EDIT_TEXT, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 9, display: "flex", alignItems: "center", gap: 4 }}>
            {outraEap && <span style={{ fontSize: 9 }}>↗</span>}
            {ref.label || pid}
            <button onClick={() => onChange(lista.filter((p) => p !== pid))} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
          </span>
        );
      })}
      {opcoes.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onChange([...lista, e.target.value])}
          style={{ fontSize: 10.5, border: `1px dashed ${EDIT_BORDER}`, borderRadius: 3, color: G.sub, background: "transparent", padding: "2px 5px" }}>
          <option value="">+ ligar predecessora</option>
          <optgroup label="Mesma EAP/categoria">
            {opcoes.filter((o) => o.etapaId === atual.etapaId).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </optgroup>
          <optgroup label="Outra EAP/categoria">
            {opcoes.filter((o) => o.etapaId !== atual.etapaId).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </optgroup>
        </select>
      )}
    </div>
  );
}

/* Sucessoras (read-only, calculado): quem tem ESTE item como predecessora —
   em qualquer EAP/categoria, não só na mesma. É o espelho do Picker acima. */
function SucessorasDetalhe({ orcamento, etapas, atual }) {
  const diretas = orcamento.filter((o) => o.iniDetalhe && (o.predecessorasDetalhe || []).includes(atual.id))
    .map((o) => ({ id: o.id, label: `${o.etapaId} · ${o.categoria}`, etapaId: o.etapaId }));
  const etapasHerdam = etapas.filter((e) => (e.predecessoras || []).includes(atual.etapaId));
  if (diretas.length === 0 && etapasHerdam.length === 0) return <span style={{ color: G.faint, fontSize: 10.5 }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {diretas.map((d) => {
        const outraEap = d.etapaId !== atual.etapaId;
        return (
          <span key={d.id} title={outraEap ? "Sucessora de outra EAP/categoria" : "Sucessora da mesma EAP"}
            style={{ background: outraEap ? G.goldBg : "#F4F5F6", border: `1px solid ${outraEap ? G.gold : G.grid}`, color: outraEap ? G.amberDark : G.sub, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 9 }}>
            {outraEap && "↗ "}{d.label}
          </span>
        );
      })}
      {etapasHerdam.map((e) => (
        <span key={e.id} title="Etapa inteira (sem detalhe próprio) herda esta predecessora a partir de TODOS os itens detalhados desta EAP"
          style={{ background: G.goldBg, border: `1px solid ${G.gold}`, color: G.amberDark, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 9 }}>
          ↗ {e.id} · {e.nome} (via EAP)
        </span>
      ))}
    </div>
  );
}
function EditableLegend({ note }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}`, flexWrap: "wrap" }}>
      <span style={{ width: 13, height: 13, background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, borderRadius: 2, display: "inline-block" }} />
      <span><b style={{ color: EDIT_TEXT }}>Azul</b> = célula editável (entrada manual)</span>
      <span style={{ width: 13, height: 13, background: "#F4F5F6", border: `1px solid ${G.grid}`, borderRadius: 2, display: "inline-block", marginLeft: 10 }} />
      <span><b style={{ color: G.ink }}>Cinza/preto</b> = calculado automaticamente (fórmula)</span>
      {note && <span style={{ marginLeft: 10, color: G.faint }}>· {note}</span>}
    </div>
  );
}
function Modal({ onClose, children, width = 640 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(23,27,33,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 5, width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.25)" }}>
        {children}
      </div>
    </div>
  );
}

const TABS = [
  { k: "dash", l: "Dashboard", icon: LayoutDashboard },
  { k: "obra", l: "Dados da Obra", icon: Building2 },
  { k: "gantt", l: "Cronograma (Gantt)", icon: GanttChartSquare },
  { k: "eap", l: "EAP / Orçamento", icon: Calculator },
  { k: "caixa", l: "Fluxo de Caixa", icon: Wallet },
  { k: "medicaoDono", l: "Medição c/ Dono da Obra", icon: ClipboardCheck },
  { k: "medicaoEmp", l: "Medição c/ Empreiteiro", icon: HardHat },
  { k: "curva", l: "Curva S", icon: TrendingUp },
  { k: "evm", l: "Indicadores (EVM)", icon: Gauge },
  { k: "compras", l: "Compras / Suprimentos", icon: ShoppingCart },
  { k: "mudancas", l: "Gestão de Mudanças", icon: FileSignature },
  { k: "diario", l: "Diário de Obra", icon: BookOpen },
  { k: "fotos", l: "Fotos Mensais", icon: ImageIcon },
  { k: "qsms", l: "Documentos & QSMS", icon: ShieldCheck },
  { k: "riscos", l: "Qualidade (Riscos & NC)", icon: AlertTriangle },
  { k: "licoes", l: "Lições Aprendidas", icon: Lightbulb },
  { k: "lastplanner", l: "Last Planner (PPC)", icon: ClipboardList },
  { k: "garantia", l: "Garantia / Pós-Entrega", icon: Award },
  { k: "equipe", l: "Equipe", icon: Users },
];

/* ---------------------------------- Gantt ---------------------------------- */
function Gantt({ etapas, schedule, scheduleCombinado, orcamento, custoPorEtapaMap = {} }) {
  const [etapasRecolhidas, setEtapasRecolhidas] = React.useState({});
  const toggleEtapa = (id) => setEtapasRecolhidas((r) => ({ ...r, [id]: !r[id] }));

  // monta lista plana de linhas: uma por etapa (resumo) + uma por item (real)
  const linhas = useMemo(() => {
    const out = [];
    etapas.forEach((e) => {
      const sc = schedule[e.id];
      const itens = orcamento.filter((o) => o.etapaId === e.id);
      out.push({ tipo: "etapa", e, sc, itens });
      if (!etapasRecolhidas[e.id]) {
        itens.forEach((o) => {
          const scItem = scheduleCombinado?.[o.id];
          if (scItem) out.push({ tipo: "item", o, scItem, etapa: e });
        });
      }
    });
    return out;
  }, [etapas, orcamento, schedule, scheduleCombinado, etapasRecolhidas]);

  const projStart = useMemo(() => {
    let m = null;
    linhas.forEach((l) => {
      const ini = l.tipo === "etapa" ? l.sc?.ini : l.scItem?.ini;
      if (ini && (!m || ini < m)) m = ini;
    });
    return m || todayISO;
  }, [linhas]);

  const projEnd = useMemo(() => {
    let m = null;
    linhas.forEach((l) => {
      const fim = l.tipo === "etapa" ? l.sc?.fim : l.scItem?.fim;
      if (fim && (!m || fim > m)) m = fim;
    });
    return m || todayISO;
  }, [linhas]);

  const totalDays = Math.max(1, diffDays(projStart, projEnd));
  const todayPct = Math.min(100, Math.max(0, (diffDays(projStart, todayISO) / totalDays) * 100));

  const months = useMemo(() => {
    const out = [];
    let cur = new Date(toDate(projStart).getFullYear(), toDate(projStart).getMonth(), 1);
    const end = toDate(projEnd);
    while (cur <= end) {
      const startOffset = Math.max(0, diffDays(projStart, cur.toISOString().slice(0, 10)));
      out.push({ label: cur.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), left: (startOffset / totalDays) * 100 });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return out;
  }, [projStart, projEnd, totalDays]);

  const ROW_H = 30;

  return (
    <Panel>
      <PanelHead icon={GanttChartSquare}>Cronograma — Gantt com Itens da Planilha (CPM Real)</PanelHead>
      <div style={{ display: "flex", gap: 14, padding: "6px 13px", borderBottom: `1px solid ${G.grid}`, fontSize: 10, color: G.sub, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 22, height: 7, background: "#2E3542", borderRadius: 2, display: "inline-block" }} /> Fase (resumo)</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 22, height: 11, background: G.steel, borderRadius: 2, display: "inline-block" }} /> Item (em andamento)</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 22, height: 11, background: G.amber, borderRadius: 2, display: "inline-block" }} /> Item crítico</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 22, height: 11, background: G.mint, borderRadius: 2, display: "inline-block" }} /> Concluído</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Flag size={10} color={G.red} /> Crítico</span>
      </div>
      <div style={{ display: "flex", fontSize: 11 }}>
        {/* Coluna de nomes */}
        <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${G.grid}` }}>
          <div style={{ height: 24, background: G.ribbonSoft, display: "grid", gridTemplateColumns: "44px 1fr 52px", padding: "0 8px", alignItems: "center" }}>
            <span style={{ fontSize: 9.5, color: "#8590A0", fontWeight: 700 }}>EAP</span>
            <span style={{ fontSize: 9.5, color: "#8590A0", fontWeight: 700 }}>Atividade / Item</span>
            <span style={{ fontSize: 9.5, color: "#8590A0", fontWeight: 700, textAlign: "right" }}>%</span>
          </div>
          {linhas.map((l, idx) => {
            if (l.tipo === "etapa") {
              const recolhido = etapasRecolhidas[l.e.id];
              const pctEtapa = l.itens.length > 0
                ? Math.round(l.itens.reduce((s, o) => s + (o.pctDetalhe || 0), 0) / l.itens.length)
                : l.e.pct;
              return (
                <div key={l.e.id} onClick={() => toggleEtapa(l.e.id)}
                  style={{ height: ROW_H, background: "#1E2530", borderBottom: `1px solid #2E3542`, display: "grid", gridTemplateColumns: "44px 1fr 52px", padding: "0 8px", alignItems: "center", cursor: l.itens.length > 0 ? "pointer" : "default" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: G.amber, fontSize: 10, fontWeight: 800 }}>{l.e.id}</span>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                    {l.itens.length > 0 && <ChevronRight size={11} color={G.amber} style={{ transform: recolhido ? "none" : "rotate(90deg)", flexShrink: 0 }} />}
                    {l.sc.critico && <Flag size={9} color={G.red} />}
                    {l.e.nome}
                  </span>
                  <span style={{ textAlign: "right", color: "#8590A0", fontWeight: 700, fontSize: 10 }}>{pctEtapa}%</span>
                </div>
              );
            } else {
              return (
                <div key={l.o.id}
                  style={{ height: ROW_H, background: "#fff", borderBottom: `1px solid ${G.grid}`, display: "grid", gridTemplateColumns: "44px 1fr 52px", padding: "0 8px", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: G.faint, paddingLeft: 12 }}>└</span>
                  <span style={{ color: G.ink, fontWeight: 500, fontSize: 10.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4, paddingLeft: 8 }}>
                    {l.scItem.critico && <Flag size={9} color={G.red} />}
                    {l.o.categoria}
                  </span>
                  <span style={{ textAlign: "right", color: l.o.pctDetalhe >= 100 ? G.mint : G.ink, fontWeight: 700, fontSize: 10 }}>{l.o.pctDetalhe || 0}%</span>
                </div>
              );
            }
          })}
        </div>

        {/* Área das barras */}
        <div style={{ flex: 1, overflowX: "auto" }}>
          <div style={{ position: "relative", minWidth: 640 }}>
            {/* cabeçalho meses */}
            <div style={{ height: 24, background: G.ribbonSoft, position: "relative" }}>
              {months.map((m, i) => (
                <div key={i} style={{ position: "absolute", left: `${m.left}%`, top: 0, height: "100%", borderLeft: "1px solid rgba(255,255,255,0.12)", paddingLeft: 4, fontSize: 9.5, color: "#C9D1DB", display: "flex", alignItems: "center", fontWeight: 600 }}>
                  {m.label}
                </div>
              ))}
            </div>
            {/* grade e barras */}
            <div style={{ position: "relative" }}>
              {months.map((m, i) => (
                <div key={i} style={{ position: "absolute", left: `${m.left}%`, top: 0, bottom: 0, width: 1, background: G.grid }} />
              ))}
              {/* linha de hoje */}
              <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: G.red, zIndex: 5 }}>
                <div style={{ position: "absolute", top: -1, left: -15, fontSize: 8, color: G.red, fontWeight: 800, background: "#fff", padding: "0 2px", whiteSpace: "nowrap" }}>HOJE</div>
              </div>

              {linhas.map((l, idx) => {
                if (l.tipo === "etapa") {
                  const ini = l.sc?.ini, fim = l.sc?.fim;
                  if (!ini || !fim) return <div key={l.e.id} style={{ height: ROW_H, borderBottom: `1px solid #2E3542`, background: "#1A1F28" }} />;
                  const left = (diffDays(projStart, ini) / totalDays) * 100;
                  const width = Math.max(0.4, (diffDays(ini, fim) / totalDays) * 100);
                  const pctEtapa = l.itens.length > 0
                    ? Math.round(l.itens.reduce((s, o) => s + (o.pctDetalhe || 0), 0) / l.itens.length)
                    : l.e.pct;
                  return (
                    <div key={l.e.id} style={{ height: ROW_H, borderBottom: `1px solid #2E3542`, background: "#1A1F28", position: "relative" }}>
                      <div title={`${l.e.nome}: ${toBR(ini)} → ${toBR(fim)}`}
                        style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 11, height: 8, background: "#2E3542", borderRadius: 2, overflow: "hidden", border: `1px solid #3E4B60` }}>
                        <div style={{ height: "100%", width: `${pctEtapa}%`, background: "#4A6080" }} />
                      </div>
                    </div>
                  );
                } else {
                  const ini = l.scItem?.ini, fim = l.scItem?.fim;
                  if (!ini || !fim) return <div key={l.o.id} style={{ height: ROW_H, borderBottom: `1px solid ${G.grid}` }} />;
                  const left = (diffDays(projStart, ini) / totalDays) * 100;
                  const width = Math.max(0.4, (diffDays(ini, fim) / totalDays) * 100);
                  const pct = l.o.pctDetalhe || 0;
                  const barColor = pct >= 100 ? G.mint : l.scItem.critico ? G.amber : G.steel;
                  return (
                    <div key={l.o.id} style={{ height: ROW_H, borderBottom: `1px solid ${G.grid}`, position: "relative", background: "#fff" }}>
                      <div title={`${l.o.categoria}: ${toBR(ini)} → ${toBR(fim)} · ${pct}% concluído · ${l.scItem.critico ? "CRÍTICO" : "folga " + l.scItem.folgaDias + "du"}`}
                        style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 7, height: 14, background: "#fff", border: `1.5px solid ${barColor}`, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: barColor, opacity: 0.85 }} />
                      </div>
                    </div>
                  );
                }
              })}

              {/* conectores: predecessoras entre itens */}
              {(() => {
                const posMap = {};
                linhas.forEach((l, idx) => {
                  const id = l.tipo === "etapa" ? l.e.id : l.o.id;
                  const ini = l.tipo === "etapa" ? l.sc?.ini : l.scItem?.ini;
                  const fim = l.tipo === "etapa" ? l.sc?.fim : l.scItem?.fim;
                  if (ini && fim) posMap[id] = { left: (diffDays(projStart, ini) / totalDays) * 100, width: Math.max(0.4, (diffDays(ini, fim) / totalDays) * 100), row: idx };
                });
                return linhas.map((l) => {
                  if (l.tipo !== "item") return null;
                  return (l.o.predecessorasDetalhe || []).map((pid) => {
                    const pred = posMap[pid], cur = posMap[l.o.id];
                    if (!pred || !cur) return null;
                    const mesmaEtapa = orcamento.find((o) => o.id === pid)?.etapaId === l.o.etapaId;
                    const cor = mesmaEtapa ? G.faint : G.amber;
                    const predEnd = pred.left + pred.width;
                    const predY = pred.row * ROW_H + ROW_H / 2;
                    const curY = cur.row * ROW_H + ROW_H / 2;
                    const horizLeft = Math.min(predEnd, cur.left);
                    const horizWidth = Math.max(0.3, Math.abs(cur.left - predEnd));
                    return (
                      <React.Fragment key={`${pid}->${l.o.id}`}>
                        <div style={{ position: "absolute", left: `${horizLeft}%`, width: `${horizWidth}%`, top: predY, height: 1.5, background: cor, zIndex: 3 }} />
                        <div style={{ position: "absolute", left: `${cur.left}%`, top: Math.min(predY, curY), width: 1.5, height: Math.abs(curY - predY) || 1.5, background: cor, zIndex: 3 }} />
                        <div style={{ position: "absolute", left: `calc(${cur.left}% - 3px)`, top: curY - 3, width: 6, height: 6, borderRadius: "50%", background: cor, zIndex: 4 }} />
                      </React.Fragment>
                    );
                  });
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------------
   Gantt Detalhado — ao contrário do Gantt Mestre (que manda no cronograma
   e empurra % para a planilha), este nasce da PLANILHA: cada barra é um
   item de orçamento com data/duração/% próprios, agrupado por etapa. O
   rollup correspondente sobe para a etapa-mãe (ver pctEfetivoPorEtapa).
------------------------------------------------------------------------- */
function GanttDetalhado({ orcamento, etapas, scheduleCombinado }) {
  const itens = useMemo(() => orcamento.filter((o) => o.iniDetalhe), [orcamento]);
  if (itens.length === 0) {
    return (
      <Panel style={{ padding: 30, textAlign: "center", color: G.faint }}>
        Nenhum item da planilha orçamentária está com data de início detalhada ainda.
        Clique em "Detalhar cronograma" num item da planilha abaixo para ele aparecer aqui.
      </Panel>
    );
  }
  const dataDe = (o, campo) => scheduleCombinado[o.id]?.[campo];
  const projStart = itens.reduce((m, o) => (!m || dataDe(o, "ini") < m ? dataDe(o, "ini") : m), null);
  const projEnd = itens.reduce((m, o) => (!m || dataDe(o, "fim") > m ? dataDe(o, "fim") : m), null);
  const totalDays = Math.max(1, diffDays(projStart, projEnd));
  const todayPct = Math.min(100, Math.max(0, (diffDays(projStart, todayISO) / totalDays) * 100));

  const months = [];
  let cur = new Date(toDate(projStart).getFullYear(), toDate(projStart).getMonth(), 1);
  const end = toDate(projEnd);
  while (cur <= end) {
    const startOffset = Math.max(0, diffDays(projStart, cur.toISOString().slice(0, 10)));
    months.push({ label: cur.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), left: (startOffset / totalDays) * 100 });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  // agrupado na ordem das etapas, só etapas que têm pelo menos 1 item detalhado
  const grupos = etapas.map((e) => ({ etapa: e, itens: itens.filter((o) => o.etapaId === e.id) })).filter((g) => g.itens.length > 0);
  const ordemLinhas = grupos.flatMap((g) => g.itens.map((o) => o.id));
  const barPos = {};
  ordemLinhas.forEach((id, idx) => {
    const o = itens.find((it) => it.id === id);
    const sc = scheduleCombinado[id];
    if (!sc) return;
    barPos[id] = { left: (diffDays(projStart, sc.ini) / totalDays) * 100, width: Math.max(0.6, (diffDays(sc.ini, sc.fim) / totalDays) * 100), row: idx };
  });

  return (
    <Panel>
      <PanelHead icon={Package}>Cronograma Detalhado — Por Item da Planilha Orçamentária (CPM real)</PanelHead>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 10, color: G.sub, padding: "6px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 1.4, background: G.faint, display: "inline-block" }} /> dependência dentro da mesma EAP</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 1.4, background: G.amber, display: "inline-block" }} /> dependência cruzando EAP/categoria diferente</span>
      </div>
      <div style={{ display: "flex", fontSize: 11.5 }}>
        <div style={{ width: 290, flexShrink: 0, borderRight: `1px solid ${G.grid}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 56px", padding: "7px 10px", background: G.ribbonSoft, color: "#fff", fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>
            <span>Item da Planilha</span><span style={{ textAlign: "right" }}>% Conc.</span>
          </div>
          {grupos.map((g) => (
            <React.Fragment key={g.etapa.id}>
              <div style={{ padding: "5px 10px", background: "#F0F1F2", fontSize: 10, fontWeight: 800, color: G.sub, textTransform: "uppercase", height: 24, display: "flex", alignItems: "center" }}>
                {g.etapa.id} {g.etapa.nome}
              </div>
              {g.itens.map((o) => {
                const sc = scheduleCombinado[o.id];
                return (
                  <div key={o.id} style={{ display: "grid", gridTemplateColumns: "1fr 56px", padding: "9px 10px", borderBottom: `1px solid ${G.grid}`, height: 36, alignItems: "center" }}>
                    <span style={{ color: G.ink, fontWeight: 600, fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                      {sc?.critico && <Flag size={9} color={G.red} />}
                      {o.categoria}
                    </span>
                    <span style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: o.pctDetalhe === 100 ? G.mint : G.ink }}>{o.pctDetalhe}%</span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div style={{ flex: 1, overflowX: "auto", position: "relative" }}>
          <div style={{ position: "relative", minWidth: 640 }}>
            <div style={{ display: "flex", height: 24, background: G.ribbonSoft, position: "relative" }}>
              {months.map((m, i) => (
                <div key={i} style={{ position: "absolute", left: `${m.left}%`, top: 0, height: "100%", borderLeft: "1px solid rgba(255,255,255,0.15)", paddingLeft: 5, fontSize: 9.5, color: "#C9D1DB", display: "flex", alignItems: "center", fontWeight: 600 }}>{m.label}</div>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              {months.map((m, i) => <div key={i} style={{ position: "absolute", left: `${m.left}%`, top: 0, bottom: 0, width: 1, background: G.grid }} />)}
              <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: G.red, zIndex: 5 }}>
                <div style={{ position: "absolute", top: -2, left: -4, fontSize: 8.5, color: G.red, fontWeight: 800, background: "#fff", padding: "0 2px" }}>HOJE</div>
              </div>
              {grupos.map((g) => (
                <React.Fragment key={g.etapa.id}>
                  <div style={{ height: 24, borderBottom: `1px solid ${G.grid}`, background: "rgba(244,245,246,0.6)" }} />
                  {g.itens.map((o) => {
                    const sc = scheduleCombinado[o.id];
                    if (!sc) return <div key={o.id} style={{ height: 36, borderBottom: `1px solid ${G.grid}` }} />;
                    const left = (diffDays(projStart, sc.ini) / totalDays) * 100;
                    const width = Math.max(0.6, (diffDays(sc.ini, sc.fim) / totalDays) * 100);
                    const cor = o.pctDetalhe >= 100 ? G.mint : sc.critico ? G.amber : G.steel;
                    return (
                      <div key={o.id} style={{ height: 36, borderBottom: `1px solid ${G.grid}`, position: "relative" }}>
                        <div title={`${o.categoria}: ${sc.ini} → ${sc.fim} (${o.pctDetalhe}%) · folga ${sc.folgaDias}d`}
                          style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 8, height: 18, background: "#fff", border: `1.5px solid ${cor}`, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${o.pctDetalhe}%`, background: cor, opacity: o.pctDetalhe >= 100 ? 1 : 0.85 }} />
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
              {/* conectores de dependência entre itens detalhados — âmbar quando
                  cruza EAP/categoria, cinza quando é dentro da mesma EAP */}
              {itens.map((o) =>
                (o.predecessorasDetalhe || []).filter((pid) => barPos[pid]).map((pid) => {
                  const pred = barPos[pid], curPos = barPos[o.id];
                  if (!pred || !curPos) return null;
                  const predItem = itens.find((it) => it.id === pid);
                  const corLinha = predItem && predItem.etapaId !== o.etapaId ? G.amber : G.faint;
                  const predEnd = pred.left + pred.width;
                  const predY = pred.row * 36 + 17, curY = curPos.row * 36 + 17;
                  const horizLeft = Math.min(predEnd, curPos.left);
                  const horizWidth = Math.max(0.3, Math.abs(curPos.left - predEnd));
                  return (
                    <React.Fragment key={`${pid}->${o.id}`}>
                      <div style={{ position: "absolute", left: `${horizLeft}%`, width: `${horizWidth}%`, top: predY, height: 1.4, background: corLinha, zIndex: 3 }} />
                      <div style={{ position: "absolute", left: `${curPos.left}%`, top: Math.min(predY, curY), width: 1.4, height: Math.abs(curY - predY) || 1.4, background: corLinha, zIndex: 3 }} />
                      <div style={{ position: "absolute", left: `calc(${curPos.left}% - 3px)`, top: curY - 3, width: 6, height: 6, borderRadius: "50%", background: corLinha, zIndex: 4 }} />
                    </React.Fragment>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------ App ----------------------------------- */
function ObraWorkspace({ projetoId, onVoltarPortfolio }) {
  const [tab, setTab] = useState("dash");
  const [etapas, setEtapas] = useState(ETAPAS_SEED);
  const [orcamento, setOrcamento] = useState(ORCAMENTO_SEED);
  const [linhasExpandidas, setLinhasExpandidas] = useState({});
  // colunas que podem ser ocultadas nas tabelas — true = visível (padrão)
  const [colunasVisiveis, setColunasVisiveis] = useState({
    orc_unidade: true, orc_qtd: true, orc_precoUnit: true,
    orc_material: true, orc_aditivoMO: true, orc_aditivoMat: true,
    orc_encargos: false, orc_bdi: false, orc_precoVenda: false,
    orc_realizado: true, orc_saldo: true, orc_pctConsumido: true,
    orc_pctExecucao: true,
  });
  function toggleColuna(key) {
    setColunasVisiveis((cv) => ({ ...cv, [key]: !cv[key] }));
  }
  const [etapasExpandidas, setEtapasExpandidas] = useState({});
  const [diario, setDiario] = useState(DIARIO_SEED);
  const [caixa, setCaixa] = useState(CAIXA_SEED);
  const [fotos, setFotos] = useState(FOTOS_SEED);
  const [nrs, setNrs] = useState(NR_SEED);
  const [docs, setDocs] = useState(DOCS_SEED);
  const [equipe, setEquipe] = useState(EQUIPE_SEED);
  const [dadosObra, setDadosObra] = useState(DADOS_OBRA_SEED);
  const [medicoesDono, setMedicoesDono] = useState(MEDICAO_DONO_SEED);
  const [medicoesEmp, setMedicoesEmp] = useState(MEDICAO_EMPREITEIRO_SEED);
  const [empreiteiros, setEmpreiteiros] = useState(EMPREITEIROS_SEED);
  const [riscos, setRiscos] = useState(RISCOS_SEED);
  const [licoes, setLicoes] = useState(LICOES_SEED);
  const [historicoFisico, setHistoricoFisico] = useState(HISTORICO_FISICO_SEED);
  const [usuarioAtual, setUsuarioAtual] = useState("Eng. Carlos Mendes");
  const [historicoEdicoes, setHistoricoEdicoes] = useState([]);
  const [baseline, setBaseline] = useState(null);
  const [compras, setCompras] = useState(COMPRAS_SEED);
  const [termosAditivos, setTermosAditivos] = useState(TERMOS_ADITIVOS_SEED);
  const [naoConformidades, setNaoConformidades] = useState(NAO_CONFORMIDADES_SEED);
  const [acidentes, setAcidentes] = useState(ACIDENTES_SEED);
  const [hhtConfig, setHhtConfig] = useState(HHT_SEED);
  const [lpSemanas, setLpSemanas] = useState(LP_SEMANAS_SEED);
  const [lpSemanaAtiva, setLpSemanaAtiva] = useState(LP_SEMANAS_SEED[LP_SEMANAS_SEED.length - 1]?.id || null);
  const [garantias, setGarantias] = useState(GARANTIAS_SEED);
  const [chamadosGarantia, setChamadosGarantia] = useState(CHAMADOS_GARANTIA_SEED);
  const [loaded, setLoaded] = useState(false);
  const [novo, setNovo] = useState({ data: "", clima: "Ensolarado", temp: "", equipe: "", equipamentos: "", servicos: "", ocorrencias: "", visitas: "", produtividade: "", observacoes: "" });
  const [novoCaixa, setNovoCaixa] = useState({ tipo: "Saída", data: todayISO, categoria: "", descricao: "", valor: "", vencimento: "", status: "Pendente" });
  const [novaFoto, setNovaFoto] = useState({ data: todayISO, legenda: "", etapaId: ETAPAS_SEED[0].id, preview: null });
  const [novaMedicaoDono, setNovaMedicaoDono] = useState({ periodo: "", data: todayISO, valorMedido: "", retencaoPct: 5, status: "Pendente", lancarCaixa: true });
  const [novaMedicaoEmp, setNovaMedicaoEmp] = useState({ empreiteiro: "", etapaId: ETAPAS_SEED[0].id, periodo: "", valorMedido: "", retencaoPct: 5, status: "Pendente" });
  const [diarioSelecionado, setDiarioSelecionado] = useState(null);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);

  useEffect(() => {
    loadState(projetoId).then((s) => {
      if (s) {
        setEtapas(s.etapas || ETAPAS_SEED); setDiario(s.diario || DIARIO_SEED);
        setOrcamento(s.orcamento || ORCAMENTO_SEED); setCaixa(s.caixa || CAIXA_SEED);
        setFotos(s.fotos || FOTOS_SEED); setNrs(s.nrs || NR_SEED);
        setDocs(s.docs || DOCS_SEED); setEquipe(s.equipe || EQUIPE_SEED);
        setDadosObra(s.dadosObra || DADOS_OBRA_SEED);
        setMedicoesDono(s.medicoesDono || MEDICAO_DONO_SEED);
        setMedicoesEmp(s.medicoesEmp || MEDICAO_EMPREITEIRO_SEED);
        setEmpreiteiros(s.empreiteiros || EMPREITEIROS_SEED);
        setRiscos(s.riscos || RISCOS_SEED);
        setLicoes(s.licoes || LICOES_SEED);
        setHistoricoFisico(s.historicoFisico || HISTORICO_FISICO_SEED);
        setUsuarioAtual(s.usuarioAtual || "Eng. Carlos Mendes");
        setHistoricoEdicoes(s.historicoEdicoes || []);
        setBaseline(s.baseline || null);
        setCompras(s.compras || COMPRAS_SEED);
        setTermosAditivos(s.termosAditivos || TERMOS_ADITIVOS_SEED);
        setNaoConformidades(s.naoConformidades || NAO_CONFORMIDADES_SEED);
        setAcidentes(s.acidentes || ACIDENTES_SEED);
        setHhtConfig(s.hhtConfig || HHT_SEED);
        setLpSemanas(s.lpSemanas || LP_SEMANAS_SEED);
        setLpSemanaAtiva(s.lpSemanaAtiva || (LP_SEMANAS_SEED[LP_SEMANAS_SEED.length - 1]?.id || null));
        setGarantias(s.garantias || GARANTIAS_SEED);
        setChamadosGarantia(s.chamadosGarantia || CHAMADOS_GARANTIA_SEED);
      } else {
        // obra nova (sem nada salvo ainda): mantém a EAP/orçamento como
        // modelo de partida (zerado), mas NÃO carrega diário/caixa/riscos/
        // etc. da demo — isso começa 100% vazio, é uma obra de verdade.
        setEtapas(ETAPAS_SEED.map((e) => ({ ...e, pct: 0, atualizadoEm: null })));
        setOrcamento(ORCAMENTO_SEED.map((o) => ({ ...o, id: uid(), maoObra: 0, quantidade: 0, precoUnitario: 0, realizado: 0, pctDetalhe: 0, iniDetalhe: null, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 0, motivoAditivo: "", insumos: [] })));
        setDiario([]);
        setCaixa([]);
        setFotos([]);
        setEquipe([]);
        setMedicoesDono([]);
        setMedicoesEmp([]);
        setEmpreiteiros([]);
        setRiscos([]);
        setLicoes([]);
        setHistoricoFisico([]);
        setCompras([]);
        setTermosAditivos([]);
        setNaoConformidades([]);
        setAcidentes([]);
        setHhtConfig({ totalHHT: 0, horasDia: 8, mesAtual: todayISO.slice(0, 7) });
        setLpSemanas([]);
        setLpSemanaAtiva(null);
        setGarantias(GARANTIAS_SEED);
        setChamadosGarantia([]);
        setNrs(NR_SEED);
        setDocs(DOCS_SEED.map((d) => ({ ...d, status: "Pendente", validade: null })));
        setDadosObra({ ...DADOS_OBRA_SEED, nome: "Nova Obra", codigo: projetoId, valorContrato: 0, saldoInicialCaixa: 0 });
        setUsuarioAtual("Eng. Responsável");
        setHistoricoEdicoes([]);
        setBaseline(null);
      }
      setLoaded(true);
    });
  }, [projetoId]);
  useEffect(() => { if (loaded) saveState(projetoId, { etapas, diario, orcamento, caixa, fotos, nrs, docs, equipe, dadosObra, medicoesDono, medicoesEmp, empreiteiros, riscos, licoes, historicoFisico, usuarioAtual, historicoEdicoes, baseline, compras, termosAditivos, naoConformidades, acidentes, hhtConfig, lpSemanas, lpSemanaAtiva, garantias, chamadosGarantia }); }, [projetoId, etapas, diario, orcamento, caixa, fotos, nrs, docs, equipe, dadosObra, medicoesDono, medicoesEmp, empreiteiros, riscos, licoes, historicoFisico, usuarioAtual, historicoEdicoes, baseline, compras, termosAditivos, naoConformidades, acidentes, hhtConfig, lpSemanas, lpSemanaAtiva, garantias, chamadosGarantia, loaded]);

  const pesoTotal = etapas.reduce((s, e) => s + e.peso, 0);
  const calendario = useMemo(() => ({ feriados: dadosObra.feriados || [], trabalhaSabado: !!dadosObra.trabalhaSabado }), [dadosObra.feriados, dadosObra.trabalhaSabado]);
  const { scheduleMestre: schedule, scheduleCombinado, itensPorEtapa } = useMemo(() => computeScheduleMestre(etapas, orcamento, calendario), [etapas, orcamento, calendario]);
  const temCicloCombinado = Object.values(scheduleCombinado).some((s) => s.ciclo);

  /* ==========================================================================
     ROLLUP planilha → cronograma. Quando um item do orçamento tem
     "iniDetalhe" preenchido, ele está em modo detalhado: o % concluído da
     ETAPA passa a ser a média ponderada (pelo valor orçado) do % concluído
     dos itens detalhados dela — não o contrário. Etapa sem nenhum item
     detalhado continua usando o % manual de sempre (fallback).
  ========================================================================== */
  const pctEfetivoPorEtapa = useMemo(() => {
    const map = {};
    etapas.forEach((e) => {
      const itens = orcamento.filter((o) => o.etapaId === e.id && o.iniDetalhe);
      if (itens.length > 0) {
        const totalOrc = itens.reduce((s, o) => s + orcadoTotal(o), 0);
        map[e.id] = totalOrc ? itens.reduce((s, o) => s + orcadoTotal(o) * (Number(o.pctDetalhe) || 0), 0) / totalOrc : 0;
      } else {
        map[e.id] = e.pct;
      }
    });
    return map;
  }, [etapas, orcamento]);
  const etapasParaGantt = useMemo(() => etapas.map((e) => ({ ...e, pct: Math.round((pctEfetivoPorEtapa[e.id] || 0) * 10) / 10 })), [etapas, pctEfetivoPorEtapa]);
  const pctFisico = etapas.reduce((s, e) => s + (e.peso * (pctEfetivoPorEtapa[e.id] || 0)) / 100, 0) / pesoTotal;

  // toda vez que o % físico real mudar, registra (ou atualiza) o ponto de hoje
  // no histórico — é isso que constrói a curva "realizada" de verdade, em vez
  // de depender de números digitados à mão.
  useEffect(() => {
    if (!loaded) return;
    const hojePctArred = Math.round(pctFisico * 1000) / 10; // 1 casa decimal
    setHistoricoFisico((h) => {
      const hoje = nowISO();
      const existe = h.find((p) => p.data === hoje);
      if (existe && existe.pct === hojePctArred) return h;
      const semHoje = h.filter((p) => p.data !== hoje);
      return [...semHoje, { data: hoje, pct: hojePctArred }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pctFisico, loaded]);

  const totalOrcado = orcamento.reduce((s, o) => s + orcadoTotal(o), 0);
  const totalRealizado = orcamento.reduce((s, o) => s + realizadoTotal(o), 0);
  const totalMaoObra = orcamento.reduce((s, o) => s + Number(o.maoObra || 0) + Number(o.aditivoMaoObra || 0), 0);
  const totalMaterial = orcamento.reduce((s, o) => s + materialTotal(o) + materialAditivoTotal(o), 0);
  const totalAditivoMaoObra = orcamento.reduce((s, o) => s + Number(o.aditivoMaoObra || 0), 0);
  const totalAditivoMaterial = orcamento.reduce((s, o) => s + materialAditivoTotal(o), 0);
  const totalAditivos = totalAditivoMaoObra + totalAditivoMaterial;
  const totalOrcadoOriginal = orcamento.reduce((s, o) => s + orcadoOriginal(o), 0);
  const totalPrecoVenda = orcamento.reduce((s, o) => s + precoVendaTotal(o), 0);
  // % de execução de UM item da planilha: usa o detalhe próprio dele quando
  // existir; senão cai para o % (já com rollup) da etapa-mãe. Planilha manda,
  // cronograma mestre é o fallback — não o contrário.
  function pctExecucaoItem(o) {
    if (o.iniDetalhe) return (Number(o.pctDetalhe) || 0) / 100;
    return (pctEfetivoPorEtapa[o.etapaId] || 0) / 100;
  }
  const totalValorSugerido = orcamento.reduce((s, o) => s + orcadoTotal(o) * pctExecucaoItem(o), 0);
  const orcamentoComTotal = useMemo(() => orcamento.map((o) => ({ ...o, material: materialTotal(o), orcado: orcadoTotal(o), realizado: realizadoTotal(o) })), [orcamento]);
  const custoPorEtapaMap = useMemo(() => {
    const map = {};
    etapas.forEach((e) => { map[e.id] = { orcado: 0, realizado: 0 }; });
    orcamento.forEach((o) => {
      if (!map[o.etapaId]) map[o.etapaId] = { orcado: 0, realizado: 0 };
      map[o.etapaId].orcado += orcadoTotal(o);
      map[o.etapaId].realizado += realizadoTotal(o);
    });
    return map;
  }, [etapas, orcamento]);
  /* Compras x Cronograma: "Data Necessária" = início (CPM) da etapa que
     consome o item. Se a previsão de entrega for depois disso, o suprimento
     ameaça atrasar a obra — não é só "está atrasado" isolado. */
  const comprasComAlerta = useMemo(() => compras.map((c) => {
    const dataNecessaria = schedule[c.etapaId]?.ini || null;
    const entregue = c.status === "Entregue";
    let alerta = null;
    if (!entregue && dataNecessaria) {
      if (!c.previsaoEntrega) alerta = "sem previsão";
      else if (c.previsaoEntrega > dataNecessaria) alerta = "ameaça o cronograma";
      else if (diffDays(nowISO(), dataNecessaria) <= 14) alerta = "necessidade próxima";
    }
    return { ...c, dataNecessaria, alerta };
  }), [compras, schedule]);
  const curvaABC = useMemo(() => {
    const total = orcamentoComTotal.reduce((s, o) => s + o.orcado, 0);
    const sorted = [...orcamentoComTotal].sort((a, b) => b.orcado - a.orcado);
    let acumulado = 0;
    return sorted.map((o) => {
      acumulado += o.orcado;
      const pctAcumulado = total ? acumulado / total : 0;
      const classe = pctAcumulado <= 0.8 ? "A" : pctAcumulado <= 0.95 ? "B" : "C";
      return { ...o, pctIndividual: total ? o.orcado / total : 0, pctAcumulado, classe };
    });
  }, [orcamentoComTotal]);
  const curvaS = useMemo(() => gerarCurvaS(schedule, etapas, pesoTotal, historicoFisico), [schedule, etapas, pesoTotal, historicoFisico]);
  const histogramaMaoObra = useMemo(() => gerarHistogramaMaoObra(schedule, etapas), [schedule, etapas]);
  const picoMaoObra = useMemo(() => histogramaMaoObra.reduce((m, h) => Math.max(m, h.efetivoPico), 0), [histogramaMaoObra]);
  const pctPlanejadoHoje = pctPlanejadoEm(schedule, etapas, pesoTotal, todayISO);
  const desvio = Math.round((pctFisico - pctPlanejadoHoje) * 1000) / 10; // pontos percentuais, 1 casa decimal

  /* ==========================================================================
     EVM (Earned Value Management) — fórmulas padrão PMBOK, calculadas a
     partir do que já existe no sistema (nada digitado à mão):
     - orçadoBase = custo direto da EAP (sem reserva) — é a base de PV/EV,
       porque reserva de contingência não tem escopo físico pra "% concluído".
     - BAC = orçadoBase + Reserva de Contingência (% configurável em Dados da
       Obra) — é o orçamento TOTAL no término, usado no EAC.
     - PV = % planejado hoje × orçadoBase · EV = % físico real × orçadoBase
     - AC = realizado total. EAC usa a fórmula "atípica" (assume que a
       eficiência de custo atual continua até o fim, sobre o BAC com reserva).
  ========================================================================== */
  const orcadoBase = totalOrcado;
  const reservaContingencia = orcadoBase * (Number(dadosObra.reservaContingenciaPct || 0) / 100);
  const BAC = orcadoBase + reservaContingencia;
  const PV = pctPlanejadoHoje * orcadoBase;
  const EV = pctFisico * orcadoBase;
  const AC = totalRealizado;
  const CV = EV - AC;
  const SV = EV - PV;
  const CPI = AC ? EV / AC : 0;
  const SPI = PV ? EV / PV : 0;
  const EAC = CPI ? AC + (BAC - EV) / CPI : BAC;
  const ETC = EAC - AC;
  const VAC = BAC - EAC;

  function registrarHistorico(modulo, descricao) {
    setHistoricoEdicoes((h) => [...h, { id: uid(), data: nowISO(), hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }), usuario: usuarioAtual, modulo, descricao }].slice(-300));
  }
  const prodMedia = diario.reduce((s, d) => s + d.produtividade, 0) / diario.length;

  const caixaOrdenado = useMemo(() => [...caixa].sort((a, b) => (a.data < b.data ? -1 : 1)), [caixa]);
  const caixaComSaldo = useMemo(() => {
    let saldo = Number(dadosObra.saldoInicialCaixa || 0);
    return caixaOrdenado.map((c) => {
      saldo += c.tipo === "Entrada" ? Number(c.valor || 0) : -Number(c.valor || 0);
      return { ...c, saldo };
    });
  }, [caixaOrdenado, dadosObra.saldoInicialCaixa]);
  const totalEntradas = caixa.filter((c) => c.tipo === "Entrada").reduce((s, c) => s + Number(c.valor || 0), 0);
  const totalSaidas = caixa.filter((c) => c.tipo === "Saída").reduce((s, c) => s + Number(c.valor || 0), 0);
  const saldoAtual = Number(dadosObra.saldoInicialCaixa || 0) + totalEntradas - totalSaidas;
  const alertasCaixa = caixa.map((c) => ({ ...c, alerta: alertaCaixa(c) })).filter((c) => c.alerta);
  const caixaPorCategoria = useMemo(() => {
    const map = {};
    caixa.forEach((c) => {
      if (!map[c.categoria]) map[c.categoria] = { categoria: c.categoria, entrada: 0, saida: 0 };
      if (c.tipo === "Entrada") map[c.categoria].entrada += Number(c.valor || 0);
      else map[c.categoria].saida += Number(c.valor || 0);
    });
    return Object.values(map);
  }, [caixa]);

  const medicaoDonoCalc = (m) => {
    const retido = Number(m.valorMedido || 0) * (Number(m.retencaoPct || 0) / 100);
    return { retido, liquido: Number(m.valorMedido || 0) - retido };
  };
  const totalMedidoDono = medicoesDono.reduce((s, m) => s + Number(m.valorMedido || 0), 0);
  const totalRetidoDono = medicoesDono.reduce((s, m) => s + medicaoDonoCalc(m).retido, 0);
  const totalLiquidoDono = totalMedidoDono - totalRetidoDono;
  const valorContratoAtual = Number(dadosObra.valorContrato || 0) + totalAditivos;
  const pctContratoMedido = valorContratoAtual ? totalMedidoDono / valorContratoAtual : 0;
  const valorAcumuladoEsperado = pctFisico * valorContratoAtual;
  const valorSugeridoMedicaoDono = Math.max(0, valorAcumuladoEsperado - totalMedidoDono);

  const totalMedidoEmp = medicoesEmp.reduce((s, m) => s + Number(m.valorMedido || 0), 0);
  const totalRetidoEmp = medicoesEmp.reduce((s, m) => s + Number(m.valorMedido || 0) * (Number(m.retencaoPct || 0) / 100), 0);
  const totalLiquidoEmp = totalMedidoEmp - totalRetidoEmp;
  const medicaoPorEmpreiteiro = useMemo(() => {
    const map = {};
    empreiteiros.forEach((emp) => { map[emp.nome] = { empreiteiro: emp.nome, contratado: Number(emp.valorContratado || 0), medido: 0, retido: 0 }; });
    medicoesEmp.forEach((m) => {
      if (!map[m.empreiteiro]) map[m.empreiteiro] = { empreiteiro: m.empreiteiro, contratado: 0, medido: 0, retido: 0 };
      map[m.empreiteiro].medido += Number(m.valorMedido || 0);
      map[m.empreiteiro].retido += Number(m.valorMedido || 0) * (Number(m.retencaoPct || 0) / 100);
    });
    return Object.values(map).map((m) => ({ ...m, saldo: m.contratado - m.medido, pctConsumido: m.contratado ? m.medido / m.contratado : 0 }));
  }, [medicoesEmp, empreiteiros]);

  function updateEtapa(id, campo, valor) {
    setEtapas((es) => es.map((e) => {
      if (e.id !== id) return e;
      if (campo === "pct" && valor !== e.pct) registrarHistorico("Cronograma", `${e.nome} (${e.id}): % concluído ${e.pct}% → ${valor}%`);
      const semAtualizar = campo === "predecessoras";
      return { ...e, [campo]: valor, atualizadoEm: semAtualizar ? e.atualizadoEm : nowISO(), atualizadoPor: semAtualizar ? e.atualizadoPor : usuarioAtual };
    }));
  }
  function addEtapa() {
    setEtapas((es) => [...es, { id: `${es.length + 1}.0`, nome: "Nova atividade", ini: todayISO, duracaoDias: 5, peso: 0, predecessoras: [], atrasoDias: 0, pct: 0, atualizadoEm: nowISO(), atualizadoPor: usuarioAtual, numTrabalhadores: 0 }]);
  }
  function removeEtapa(id) {
    setEtapas((es) => es.filter((e) => e.id !== id).map((e) => ({ ...e, predecessoras: (e.predecessoras || []).filter((p) => p !== id) })));
  }
  function toggleExpandEtapa(etapaId) {
    setEtapasExpandidas((ex) => ({ ...ex, [etapaId]: !ex[etapaId] }));
  }
  function congelarBaseline() {
    const snap = {};
    etapas.forEach((e) => { snap[e.id] = { ini: schedule[e.id].ini, fim: schedule[e.id].fim }; });
    setBaseline({ congeladoEm: nowISO(), congeladoPor: usuarioAtual, etapas: snap, pctFisicoNaEpoca: pctFisico, orcadoBaseNaEpoca: totalOrcado });
    registrarHistorico("Cronograma", `Baseline congelada (todas as ${etapas.length} atividades) em ${toBR(nowISO())}`);
  }
  function limparBaseline() {
    registrarHistorico("Cronograma", "Baseline removida");
    setBaseline(null);
  }
  function updateCompra(idx, campo, valor) {
    setCompras((cs) => cs.map((c, i) => (i === idx ? { ...c, [campo]: valor } : c)));
  }
  function addCompra() {
    setCompras((cs) => [...cs, { id: uid(), item: "Novo item", etapaId: etapas[0].id, fornecedor: "", dataSolicitacao: "", leadTimeDias: 15, previsaoEntrega: "", status: "Não solicitado", valor: 0 }]);
  }
  function removeCompra(idx) {
    setCompras((cs) => cs.filter((_, i) => i !== idx));
  }
  function solicitarCompra(idx) {
    const c = compras[idx];
    const hoje = nowISO();
    setCompras((cs) => cs.map((x, i) => (i === idx ? { ...x, dataSolicitacao: hoje, previsaoEntrega: addDays(hoje, Number(x.leadTimeDias || 0)), status: "Solicitado" } : x)));
    registrarHistorico("Compras", `Solicitação emitida: ${c.item} (previsão ${toBR(addDays(hoje, Number(c.leadTimeDias || 0)))})`);
  }
  /* ============================================================================
     GESTÃO DE MUDANÇAS — Termos Aditivos. O ponto central: aprovar um termo
     aplica o impacto financeiro (na planilha) E o impacto de prazo (no
     cronograma) NA MESMA AÇÃO, pra eles nunca ficarem dessincronizados de
     novo. Antes de aprovado, é só uma proposta — não toca em nada real.
  ============================================================================ */
  function addTermoAditivo() {
    const proximoNumero = termosAditivos.reduce((m, t) => Math.max(m, t.numero), 0) + 1;
    setTermosAditivos((ts) => [...ts, {
      id: uid(), numero: proximoNumero, data: todayISO, titulo: "Novo termo aditivo", motivo: "",
      status: "Solicitado", solicitadoPor: usuarioAtual, aprovadoPor: null, dataDecisao: null,
      orcamentoItemId: orcamento[0]?.id || null, aditivoMaoObraProposto: 0, quantidadeAditivoProposta: 0, precoUnitarioAditivoProposto: 0,
      impactoPrazoDias: 0, aplicado: false,
    }]);
  }
  function updateTermoAditivo(idx, campo, valor) {
    setTermosAditivos((ts) => ts.map((t, i) => (i === idx ? { ...t, [campo]: valor } : t)));
  }
  function removeTermoAditivo(idx) {
    setTermosAditivos((ts) => ts.filter((_, i) => i !== idx));
  }
  function rejeitarTermoAditivo(idx) {
    const t = termosAditivos[idx];
    setTermosAditivos((ts) => ts.map((x, i) => (i === idx ? { ...x, status: "Rejeitado", dataDecisao: nowISO(), aprovadoPor: usuarioAtual } : x)));
    registrarHistorico("Gestão de Mudanças", `Termo Aditivo nº${t.numero} REJEITADO — ${t.titulo}`);
  }
  function aprovarEAplicarTermoAditivo(idx) {
    const t = termosAditivos[idx];
    if (!t || t.aplicado) return;
    const oIdx = orcamento.findIndex((o) => o.id === t.orcamentoItemId);
    if (oIdx === -1) return;
    const item = orcamento[oIdx];

    // 1) aplica o impacto financeiro no item da planilha
    setOrcamento((os) => os.map((o, i) => (i !== oIdx ? o : {
      ...o,
      aditivoMaoObra: Number(o.aditivoMaoObra || 0) + Number(t.aditivoMaoObraProposto || 0),
      quantidadeAditivo: Number(o.quantidadeAditivo || 0) + Number(t.quantidadeAditivoProposta || 0),
      precoUnitarioAditivo: t.precoUnitarioAditivoProposto ? Number(t.precoUnitarioAditivoProposto) : (o.precoUnitarioAditivo ?? o.precoUnitario),
      motivoAditivo: o.motivoAditivo ? `${o.motivoAditivo} | Termo nº${t.numero}: ${t.titulo}` : `Termo nº${t.numero}: ${t.titulo}`,
    })));

    // 2) aplica o impacto de prazo — no SUB-ITEM se ele já tiver cronograma
    //    detalhado próprio, senão na ETAPA-MÃE (mesma regra que o resto do
    //    sistema usa pra decidir "quem manda" na data).
    if (Number(t.impactoPrazoDias || 0) !== 0) {
      if (item.iniDetalhe) {
        setOrcamento((os) => os.map((o, i) => (i !== oIdx ? o : { ...o, duracaoDetalheDias: Math.max(1, Number(o.duracaoDetalheDias || 1) + Number(t.impactoPrazoDias || 0)) })));
      } else {
        setEtapas((es) => es.map((e) => (e.id !== item.etapaId ? e : { ...e, duracaoDias: Math.max(1, Number(e.duracaoDias || 1) + Number(t.impactoPrazoDias || 0)) })));
      }
    }

    setTermosAditivos((ts) => ts.map((x, i) => (i !== idx ? x : { ...x, status: "Aprovado", aprovadoPor: usuarioAtual, dataDecisao: nowISO(), aplicado: true })));
    registrarHistorico("Gestão de Mudanças", `Termo Aditivo nº${t.numero} APROVADO e aplicado — ${t.titulo} (${fmtR$(Number(t.aditivoMaoObraProposto || 0) + Number(t.quantidadeAditivoProposta || 0) * Number(t.precoUnitarioAditivoProposto || 0))}${t.impactoPrazoDias ? `, +${t.impactoPrazoDias}du de prazo` : ""})`);
  }

  /* ============================================================================
     RELATÓRIO EXECUTIVO — HTML puro com concatenação de strings (sem template
     literals aninhados, para compatibilidade garantida com qualquer bundler).
  ============================================================================ */
  function gerarRelatorioExecutivo() {
    const dataRel = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const ncVencidas  = naoConformidades.filter((n) => n.status !== "Corrigida" && n.status !== "Verificada" && alertaNC(n) === "VENCIDO");
    const comprasAm   = comprasComAlerta.filter((c) => c.alerta === "ameaça o cronograma");
    const termosAb    = termosAditivos.filter((t) => t.status === "Solicitado" || t.status === "Em Análise");
    const etapasSumm  = etapas.map((e) => {
      const sc = schedule[e.id], itens = orcamento.filter((o) => o.etapaId === e.id);
      const pctReal = itens.length > 0 ? Math.round(itens.reduce((s, o) => s + (o.pctDetalhe || 0), 0) / itens.length) : e.pct;
      return { e, sc, pctReal, custo: custoPorEtapaMap[e.id] || { orcado: 0, realizado: 0 } };
    });
    const ind = indicadoresSeguranca;
    const css = "*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;font-size:11px;color:#1A1F29}@page{size:A4;margin:18mm 15mm}@media print{.np{display:none}}.ph{display:flex;justify-content:space-between;border-bottom:3px solid #1E2530;padding-bottom:12px;margin-bottom:18px}.titulo{font-size:18px;font-weight:800}.sub{font-size:11px;color:#6B7280;margin-top:3px}.meta{text-align:right;font-size:10px;color:#6B7280}.meta strong{display:block;font-size:12px;font-weight:700}section{margin-bottom:20px}h2{font-size:11px;font-weight:800;color:#fff;background:#1E2530;padding:6px 10px;border-radius:4px 4px 0 0;text-transform:uppercase}.kg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:10px 0}.kpi{border:1px solid #E5E7EB;border-radius:6px;padding:10px 12px}.kl{font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase}.kv{font-size:20px;font-weight:800;margin-top:2px}.ks{font-size:9px;color:#6B7280;margin-top:2px}.red .kv{color:#DC2626}.grn .kv{color:#059669}.amb .kv{color:#D97706}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#F3F4F6;color:#374151;font-weight:700;padding:6px 8px;text-align:left;border-bottom:1px solid #E5E7EB}td{padding:6px 8px;border-bottom:1px solid #F3F4F6}tr:nth-child(even) td{background:#FAFAFA}.tag{display:inline-block;padding:2px 7px;border-radius:8px;font-size:9px;font-weight:700}.tc{background:#FEE2E2;color:#DC2626}.to{background:#D1FAE5;color:#059669}.ta{background:#FEF3C7;color:#D97706}.tb{background:#DBEAFE;color:#2563EB}.ar{display:flex;gap:8px;padding:7px 10px;border-bottom:1px solid #F3F4F6}.as{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:30px}.ab{border-top:1.5px solid #374151;padding-top:6px}.btn{position:fixed;bottom:20px;right:20px;background:#1E2530;color:#fff;border:none;padding:12px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer}";
    const kv = function(lbl, val, sub, cls) { return "<div class='kpi " + (cls||"") + "'><div class='kl'>" + lbl + "</div><div class='kv'>" + val + "</div>" + (sub ? "<div class='ks'>" + sub + "</div>" : "") + "</div>"; };
    const tg = function(cls, txt) { return "<span class='tag " + cls + "'>" + txt + "</span>"; };
    const cronRows = etapasSumm.map(function(x) {
      const bc = x.pctReal>=100?"#059669":x.sc&&x.sc.critico?"#D97706":"#2563EB";
      return "<tr><td style='font-family:monospace;font-weight:700'>" + x.e.id + "</td><td>" + x.e.nome + "</td><td>" + (x.sc?toBR(x.sc.ini):"—") + "</td><td>" + (x.sc?toBR(x.sc.fim):"—") + "</td><td><div style='display:flex;align-items:center;gap:6px'><div style='width:60px;height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden'><div style='width:" + x.pctReal + "%;height:100%;background:" + bc + "'></div></div><span style='font-weight:700'>" + x.pctReal + "%</span></div></td><td>" + tg(x.pctReal>=100?"to":x.sc&&x.sc.critico?"tc":"tb", x.pctReal>=100?"Concluída":x.sc&&x.sc.critico?"Crítico":"Em andamento") + "</td><td>" + (x.sc&&x.sc.critico?"—":((x.sc&&x.sc.folgaDias)||0)+"du") + "</td></tr>";
    }).join("");
    const finRows = etapasSumm.map(function(x) {
      const pc = x.custo.orcado?Math.round(x.custo.realizado/x.custo.orcado*100):0;
      return "<tr><td style='font-family:monospace;font-weight:700'>" + x.e.id + "</td><td>" + x.e.nome + "</td><td>" + fmtR$(x.custo.orcado) + "</td><td>" + fmtR$(x.custo.realizado) + "</td><td style='color:" + (x.custo.orcado-x.custo.realizado<0?"#DC2626":"#059669") + ";font-weight:700'>" + fmtR$(x.custo.orcado-x.custo.realizado) + "</td><td>" + tg(x.custo.orcado&&x.custo.realizado/x.custo.orcado>0.9?"tc":x.custo.orcado&&x.custo.realizado/x.custo.orcado>0.6?"ta":"to", pc+"%") + "</td></tr>";
    }).join("");
    let alertasHtml = "";
    if (ncVencidas.length || comprasAm.length || termosAb.length) {
      alertasHtml = "<section><h2>Alertas e Pendências</h2><div style='border:1px solid #E5E7EB;border-radius:0 0 4px 4px'>";
      ncVencidas.forEach(function(n) { alertasHtml += "<div class='ar'><span>🔴</span><div><strong>NC nº" + n.numero + " VENCIDA:</strong> " + n.descricao.slice(0,120) + " — " + n.responsavelCorrecao + ", prazo " + toBR(n.prazoCorrecao) + "</div></div>"; });
      comprasAm.forEach(function(c) { alertasHtml += "<div class='ar'><span>⚠️</span><div><strong>Compra ameaça cronograma:</strong> " + c.item + " — necessário em " + toBR(c.dataNecessaria) + "</div></div>"; });
      termosAb.forEach(function(t) { alertasHtml += "<div class='ar'><span>📋</span><div><strong>Termo Aditivo nº" + t.numero + " pendente:</strong> " + t.titulo + "</div></div>"; });
      alertasHtml += "</div></section>";
    }
    const html = "<!doctype html><html lang='pt-BR'><head><meta charset='UTF-8'/><title>Relatório — " + dadosObra.nome + "</title><style>" + css + "</style></head><body>" +
      "<div class='np'><button class='btn' onclick='window.print()'>🖨️ Imprimir / Salvar PDF</button></div>" +
      "<div class='ph'><div><div class='titulo'>" + dadosObra.nome + "</div><div class='sub'>" + dadosObra.codigo + " · " + dadosObra.cliente + " · " + dadosObra.responsavelTecnico + " (CREA " + dadosObra.crea + ")</div><div class='sub' style='margin-top:4px'>Regime: " + dadosObra.regime + " · Início: " + toBR(dadosObra.dataInicio) + " · Término: " + toBR(dadosObra.dataFimPrevista) + "</div></div><div class='meta'><strong>Relatório Executivo</strong>" + dataRel + "<br/>Emitido por: " + usuarioAtual + "</div></div>" +
      "<section><h2>Indicadores Principais</h2><div class='kg'>" +
        kv("% Físico Executado", fmtPct(pctFisico), "Ponderado pelo peso EAP", pctFisico>=0.5?"grn":pctFisico<0.2?"":"amb") +
        kv("Desvio de Cronograma", (desvio>0?"+":"") + desvio + " p.p.", desvio>=0?"No prazo ou adiantado":"Atraso", desvio<-2?"red":desvio>0?"grn":"") +
        kv("Custo Realizado (AC)", fmtR$(AC), "Orçado Base: " + fmtR$(orcadoBase)) +
        kv("% Orçamento Consumido", fmtPct(totalOrcado?totalRealizado/totalOrcado:0), "Saldo: " + fmtR$(totalOrcado-totalRealizado), totalRealizado/(totalOrcado||1)>0.9?"red":"") +
      "</div></section>" +
      "<section><h2>EVM — Earned Value Management</h2><table><thead><tr><th>BAC</th><th>PV</th><th>EV</th><th>AC</th><th>CPI</th><th>SPI</th><th>EAC</th><th>VAC</th></tr></thead><tbody><tr><td><strong>" + fmtR$(BAC) + "</strong></td><td>" + fmtR$(PV) + "</td><td>" + fmtR$(EV) + "</td><td>" + fmtR$(AC) + "</td><td>" + tg(CPI>=1?"to":CPI>=0.9?"ta":"tc", CPI.toFixed(2)) + "</td><td>" + tg(SPI>=1?"to":SPI>=0.9?"ta":"tc", SPI.toFixed(2)) + "</td><td><strong>" + fmtR$(EAC) + "</strong></td><td>" + tg(VAC>=0?"to":"tc", fmtR$(VAC)) + "</td></tr></tbody></table><div style='font-size:9px;color:#6B7280;padding:5px 0'>CPI/SPI menores que 1 indicam desvio de custo/prazo. VAC negativo = projeção de estouro.</div></section>" +
      "<section><h2>Situação do Cronograma</h2><table><thead><tr><th>EAP</th><th>Fase</th><th>Início</th><th>Término</th><th>%</th><th>Status</th><th>Folga</th></tr></thead><tbody>" + cronRows + "</tbody></table></section>" +
      "<section><h2>Resumo Financeiro</h2><table><thead><tr><th>EAP</th><th>Fase</th><th>Orçado</th><th>Realizado</th><th>Saldo</th><th>%</th></tr></thead><tbody>" + finRows + "<tr style='font-weight:800;background:#F3F4F6'><td colspan='2'>TOTAL</td><td>" + fmtR$(totalOrcado) + "</td><td>" + fmtR$(totalRealizado) + "</td><td style='color:" + (totalOrcado-totalRealizado<0?"#DC2626":"#059669") + ";font-weight:800'>" + fmtR$(totalOrcado-totalRealizado) + "</td><td>" + (totalOrcado?Math.round(totalRealizado/totalOrcado*100):0) + "%</td></tr></tbody></table></section>" +
      "<section><h2>Indicadores de Segurança do Trabalho</h2><div class='kg'>" +
        kv("Dias sem Acidente c/ Afastamento", ind.diasSemAcidente, "dias consecutivos", ind.diasSemAcidente>=30?"grn":"amb") +
        kv("Taxa de Frequência (TF)", ind.TF!==null?ind.TF.toFixed(2):"—", "HHT: " + (ind.HHT||0).toLocaleString("pt-BR"), ind.TF===null?"":ind.TF>5?"red":"grn") +
        kv("Taxa de Gravidade (TG)", ind.TG!==null?ind.TG.toFixed(2):"—", ind.totalDiasPerdidos + " dias perdidos") +
        kv("Acidentes Registrados", acidentes.length, ind.acComAfastamento + " c/ afastamento", ind.acComAfastamento>0?"red":"grn") +
      "</div></section>" +
      alertasHtml +
      "<div class='as'><div class='ab'><div style='font-size:10px;font-weight:700'>" + dadosObra.responsavelTecnico + "</div><div style='font-size:9px;color:#6B7280'>CREA " + dadosObra.crea + " · " + dadosObra.empresaExecutora + "</div></div><div class='ab'><div style='font-size:10px;font-weight:700'>" + dadosObra.cliente + "</div><div style='font-size:9px;color:#6B7280'>Representante / Fiscal de Obra</div></div></div>" +
      "</body></html>";
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  }
  function addDiario() {
    if (!novo.data || !novo.equipe || !novo.servicos) return;
    setDiario([...diario, {
      data: novo.data.split("-").reverse().join("/"), clima: novo.clima, temp: novo.temp,
      equipe: Number(novo.equipe), equipamentos: novo.equipamentos, servicos: novo.servicos,
      ocorrencias: novo.ocorrencias || "Nenhuma", visitas: novo.visitas || "—",
      produtividade: Number(novo.produtividade) / 100 || 0, observacoes: novo.observacoes,
    }]);
    setNovo({ data: "", clima: "Ensolarado", temp: "", equipe: "", equipamentos: "", servicos: "", ocorrencias: "", visitas: "", produtividade: "", observacoes: "" });
  }
  function updateOrcamento(idx, campo, valor) {
    if ((campo === "aditivoMaoObra" || campo === "quantidadeAditivo" || campo === "precoUnitarioAditivo") && Number(valor) !== Number(orcamento[idx]?.[campo] || 0)) {
      const rotulos = { aditivoMaoObra: "mão de obra", quantidadeAditivo: "quantidade", precoUnitarioAditivo: "preço unitário" };
      registrarHistorico("Orçamento (Aditivo)", `${orcamento[idx]?.categoria}: aditivo de ${rotulos[campo]} ${fmtR$(orcamento[idx]?.[campo] || 0)} → ${fmtR$(valor)}`);
    }
    setOrcamento((os) => os.map((o, i) => (i === idx ? { ...o, [campo]: valor } : o)));
  }
  function addLinhaOrcamento() {
    setOrcamento((os) => [...os, { id: uid(), etapaId: etapas[0].id, categoria: "Nova categoria de custo", maoObra: 0, unidade: "un.", quantidade: 0, precoUnitario: 0, realizado: 0, aditivoMaoObra: 0, quantidadeAditivo: 0, precoUnitarioAditivo: 0, encargosSociaisPct: 90, bdiPct: 22, motivoAditivo: "", predecessorasDetalhe: [], atrasoDetalheDias: 0, insumos: [] }]);
  }
  function removeLinhaOrcamento(idx) {
    setOrcamento((os) => os.filter((_, i) => i !== idx));
  }
  function ativarDetalheOrcamento(idx) {
    setOrcamento((os) => os.map((o, i) => {
      if (i !== idx) return o;
      const etapaPai = etapas.find((e) => e.id === o.etapaId);
      // usa o início CPM da etapa-pai como âncora — NÃO usa todayISO porque
      // a etapa pode começar em qualquer data futura, e o subitem precisa
      // partir daí pra o CPM combinado fazer sentido.
      const iniAncora = schedule[etapaPai?.id]?.ini || etapaPai?.ini || todayISO;
      const duracao = etapaPai?.duracaoDias || 30;
      return { ...o, iniDetalhe: iniAncora, duracaoDetalheDias: duracao, pctDetalhe: etapaPai?.pct || 0 };
    }));
    registrarHistorico("Cronograma Detalhado", `Detalhamento ativado: ${orcamento[idx]?.categoria}`);
  }
  function ativarTodosItensDaEtapa(etapaId) {
    const etapaPai = etapas.find((e) => e.id === etapaId);
    const iniAncora = schedule[etapaId]?.ini || etapaPai?.ini || todayISO;
    const duracao = etapaPai?.duracaoDias || 30;
    const pct = etapaPai?.pct || 0;
    setOrcamento((os) => os.map((o) => {
      if (o.etapaId !== etapaId || o.iniDetalhe) return o;
      return { ...o, iniDetalhe: iniAncora, duracaoDetalheDias: duracao, pctDetalhe: pct };
    }));
    registrarHistorico("Cronograma Detalhado", `Detalhamento ativado em todos os itens da etapa ${etapaId}`);
  }
  function removerDetalheOrcamento(idx) {
    const idRemovido = orcamento[idx]?.id;
    setOrcamento((os) => os.map((o, i) => {
      if (i === idx) return { ...o, iniDetalhe: null, predecessorasDetalhe: [] };
      return { ...o, predecessorasDetalhe: (o.predecessorasDetalhe || []).filter((p) => p !== idRemovido) };
    }));
  }
  function toggleExpandOrcamento(idx) {
    setLinhasExpandidas((le) => ({ ...le, [idx]: !le[idx] }));
  }
  function addInsumo(orcIdx) {
    setOrcamento((os) => os.map((o, i) => (i !== orcIdx ? o : {
      ...o, insumos: [...(o.insumos || []), novoInsumo("Novo insumo", "un.", 0, 0, 0)],
    })));
    setLinhasExpandidas((le) => ({ ...le, [orcIdx]: true }));
  }
  function updateInsumo(orcIdx, insIdx, campo, valor) {
    setOrcamento((os) => os.map((o, i) => (i !== orcIdx ? o : {
      ...o, insumos: o.insumos.map((ins, k) => (k === insIdx ? { ...ins, [campo]: valor } : ins)),
    })));
  }
  function removeInsumo(orcIdx, insIdx) {
    const ins = orcamento[orcIdx].insumos[insIdx];
    if (ins.lancadoCaixa && ins.caixaId) setCaixa((cs) => cs.filter((c) => c.id !== ins.caixaId));
    setOrcamento((os) => os.map((o, i) => (i !== orcIdx ? o : { ...o, insumos: o.insumos.filter((_, k) => k !== insIdx) })));
  }
  function lancarInsumoCaixa(orcIdx, insIdx) {
    const o = orcamento[orcIdx], ins = o.insumos[insIdx];
    if (!ins.custoReal || !ins.dataPagamento) return;
    const novoId = uid();
    setCaixa((cs) => [...cs, {
      id: novoId, data: ins.dataPagamento, tipo: "Saída", categoria: `Insumo — ${o.categoria}`,
      descricao: `${ins.nome} (${ins.formaPagamento}) — ${o.categoria}`,
      valor: Number(ins.custoReal), vencimento: ins.dataPagamento, status: "Pago",
    }]);
    setOrcamento((os) => os.map((oo, i) => (i !== orcIdx ? oo : {
      ...oo, insumos: oo.insumos.map((iv, k) => (k === insIdx ? { ...iv, lancadoCaixa: true, caixaId: novoId } : iv)),
    })));
    registrarHistorico("Fluxo de Caixa", `Saída lançada: ${ins.nome} — ${fmtR$(ins.custoReal)} (${ins.formaPagamento})`);
  }
  function desvincularInsumoCaixa(orcIdx, insIdx) {
    const ins = orcamento[orcIdx].insumos[insIdx];
    setCaixa((cs) => cs.filter((c) => c.id !== ins.caixaId));
    setOrcamento((os) => os.map((oo, i) => (i !== orcIdx ? oo : {
      ...oo, insumos: oo.insumos.map((iv, k) => (k === insIdx ? { ...iv, lancadoCaixa: false, caixaId: null } : iv)),
    })));
  }
  function addCaixa() {
    if (!novoCaixa.descricao || !novoCaixa.valor) return;
    setCaixa([...caixa, { id: uid(), ...novoCaixa, valor: Number(novoCaixa.valor), vencimento: novoCaixa.vencimento || novoCaixa.data }]);
    registrarHistorico("Fluxo de Caixa", `${novoCaixa.tipo} lançada: ${novoCaixa.descricao} — ${fmtR$(novoCaixa.valor)}`);
    setNovoCaixa({ tipo: "Saída", data: todayISO, categoria: "", descricao: "", valor: "", vencimento: "", status: "Pendente" });
  }
  function removeCaixa(id) {
    setCaixa((cs) => cs.filter((c) => c.id !== id));
  }
  function updateCaixaStatus(id, status) {
    setCaixa((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
  }
  function handleFotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setNovaFoto((f) => ({ ...f, preview: reader.result }));
    reader.readAsDataURL(file);
  }
  function addFoto() {
    if (!novaFoto.preview || !novaFoto.legenda) return;
    setFotos([...fotos, { id: uid(), data: novaFoto.data, legenda: novaFoto.legenda, etapaId: novaFoto.etapaId, url: novaFoto.preview }]);
    setNovaFoto({ data: todayISO, legenda: "", etapaId: ETAPAS_SEED[0].id, preview: null });
  }
  function removeFoto(id) {
    setFotos((fs) => fs.filter((f) => f.id !== id));
  }
  function updateNr(idx, status) {
    setNrs((ns) => ns.map((n, i) => (i === idx ? { ...n, status } : n)));
  }
  function updateDoc(idx, campo, valor) {
    setDocs((ds) => ds.map((d, i) => (i === idx ? { ...d, [campo]: valor } : d)));
  }
  function updateEquipe(idx, campo, valor) {
    setEquipe((es) => es.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));
  }
  function addEquipe() {
    setEquipe((es) => [...es, { nome: "Novo colaborador", funcao: "", vinculo: "CLT", indice: 1 }]);
  }
  function removeEquipe(idx) {
    setEquipe((es) => es.filter((_, i) => i !== idx));
  }
  function updateRisco(idx, campo, valor) {
    setRiscos((rs) => rs.map((r, i) => (i === idx ? { ...r, [campo]: valor } : r)));
  }
  function addRisco() {
    setRiscos((rs) => [...rs, { id: uid(), risco: "Novo risco identificado", probabilidade: 3, impacto: 3, plano: "", responsavel: "", status: "Aberto" }]);
  }
  function removeRisco(idx) {
    setRiscos((rs) => rs.filter((_, i) => i !== idx));
  }
  function updateLicao(idx, campo, valor) {
    setLicoes((ls) => ls.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
  }
  function addLicao() {
    setLicoes((ls) => [...ls, { id: uid(), data: nowISO(), problema: "", solucao: "", impacto: "", recomendacao: "", responsavel: "" }]);
  }
  function removeLicao(idx) {
    setLicoes((ls) => ls.filter((_, i) => i !== idx));
  }
  function addNaoConformidade() {
    const proximoNumero = naoConformidades.reduce((m, n) => Math.max(m, n.numero), 0) + 1;
    setNaoConformidades((ns) => [...ns, {
      id: uid(), numero: proximoNumero, data: nowISO(), etapaId: etapas[0]?.id || null,
      descricao: "", tipo: "Execução", gravidade: "Média",
      acaoCorretiva: "", responsavelCorrecao: usuarioAtual, prazoCorrecao: addDays(nowISO(), 7), status: "Aberta",
      custoRetrabalho: 0, abertoPor: usuarioAtual,
    }]);
  }
  function updateNaoConformidade(idx, campo, valor) {
    const nc = naoConformidades[idx];
    if (campo === "status" && valor !== nc.status) {
      registrarHistorico("Qualidade (NC)", `NC nº${nc.numero}: status ${nc.status} → ${valor}`);
    }
    setNaoConformidades((ns) => ns.map((n, i) => (i === idx ? { ...n, [campo]: valor } : n)));
  }
  function removeNaoConformidade(idx) {
    setNaoConformidades((ns) => ns.filter((_, i) => i !== idx));
  }
  /* ── Acidentes / Segurança ────────────────────────────────────────────── */
  function addAcidente() {
    setAcidentes((as) => [...as, {
      id: uid(), data: todayISO, tipo: "Quase acidente", gravidade: "Leve",
      descricao: "", funcionario: "", funcao: "", diasPerdidos: 0,
      cat: "", dataCat: null, acaoCorretiva: "", responsavel: usuarioAtual,
    }]);
  }
  function updateAcidente(idx, campo, valor) {
    setAcidentes((as) => as.map((a, i) => (i === idx ? { ...a, [campo]: valor } : a)));
  }
  function removeAcidente(idx) {
    setAcidentes((as) => as.filter((_, i) => i !== idx));
  }
  /* ── Last Planner ─────────────────────────────────────────────────────── */
  function addSemanaLP() {
    const ultima = lpSemanas[lpSemanas.length - 1];
    const novaNum = ultima ? ultima.semanaNum + 1 : 1;
    const novaInicio = ultima ? addDays(ultima.periodoFim, 1) : todayISO;
    const novaFim = addDays(novaInicio, 6);
    const nova = { id: uid(), semanaNum: novaNum, periodoInicio: novaInicio, periodoFim: novaFim, tarefas: [] };
    setLpSemanas((ss) => [...ss, nova]);
    setLpSemanaAtiva(nova.id);
  }
  function addTarefaLP(semanaId) {
    setLpSemanas((ss) => ss.map((s) => s.id !== semanaId ? s : {
      ...s, tarefas: [...s.tarefas, { id: uid(), descricao: "Nova tarefa", etapaId: etapas[0]?.id || "", responsavel: usuarioAtual, planejada: true, concluida: false, motivoNaoConclusao: "" }],
    }));
  }
  function updateTarefaLP(semanaId, tarefaId, campo, valor) {
    setLpSemanas((ss) => ss.map((s) => s.id !== semanaId ? s : {
      ...s, tarefas: s.tarefas.map((t) => t.id !== tarefaId ? t : { ...t, [campo]: valor }),
    }));
  }
  function removeTarefaLP(semanaId, tarefaId) {
    setLpSemanas((ss) => ss.map((s) => s.id !== semanaId ? s : { ...s, tarefas: s.tarefas.filter((t) => t.id !== tarefaId) }));
  }
  const ppcHistorico = useMemo(() => lpSemanas.map((s) => {
    const planejadas = s.tarefas.filter((t) => t.planejada).length;
    const concluidas = s.tarefas.filter((t) => t.planejada && t.concluida).length;
    return { semana: "Sem " + s.semanaNum, planejadas, concluidas, ppc: planejadas > 0 ? Math.round((concluidas / planejadas) * 100) : null };
  }), [lpSemanas]);
  const causasNaoConclusao = useMemo(() => {
    const map = {};
    lpSemanas.forEach((s) => s.tarefas.forEach((t) => {
      if (t.planejada && !t.concluida && t.motivoNaoConclusao) {
        map[t.motivoNaoConclusao] = (map[t.motivoNaoConclusao] || 0) + 1;
      }
    }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [lpSemanas]);
  /* ── Garantia / Assistência Técnica ──────────────────────────────────── */
  function updateGarantia(idx, campo, valor) {
    setGarantias((gs) => gs.map((g, i) => (i === idx ? { ...g, [campo]: valor } : g)));
  }
  function addChamadoGarantia() {
    setChamadosGarantia((cs) => [...cs, { id: uid(), data: todayISO, sistema: garantias[0]?.sistema || "", descricao: "", cliente: "", status: "Aberto", custoAtendimento: 0, responsavel: usuarioAtual }]);
  }
  function updateChamadoGarantia(idx, campo, valor) {
    setChamadosGarantia((cs) => cs.map((c, i) => (i === idx ? { ...c, [campo]: valor } : c)));
  }
  function removeChamadoGarantia(idx) {
    setChamadosGarantia((cs) => cs.filter((_, i) => i !== idx));
  }
  /* ── Indicadores de Segurança (calculados) ───────────────────────────── */
  const indicadoresSeguranca = useMemo(() => {
    const HHT = Number(hhtConfig.totalHHT || 0);
    const acComAfastamento = acidentes.filter((a) => a.tipo === "Acidente com afastamento");
    const acTotal = acidentes.filter((a) => a.tipo === "Acidente com afastamento" || a.tipo === "Acidente sem afastamento");
    const totalDiasPerdidos = acComAfastamento.reduce((s, a) => s + Number(a.diasPerdidos || 0), 0);
    const TF = HHT > 0 ? (acComAfastamento.length * 1000000) / HHT : null;
    const TG = HHT > 0 ? (totalDiasPerdidos * 1000000) / HHT : null;
    const TAT = HHT > 0 ? (acTotal.length * 1000000) / HHT : null;
    // dias sem acidente com afastamento: desde o último acidente ou desde início da obra
    const datasAcAfastamento = acComAfastamento.map((a) => a.data).sort();
    const ultimoAcidente = datasAcAfastamento[datasAcAfastamento.length - 1];
    const diasSemAcidente = ultimoAcidente
      ? diffDays(ultimoAcidente, todayISO)
      : diffDays(dadosObra.dataInicio || todayISO, todayISO);
    return { TF, TG, TAT, diasSemAcidente, acComAfastamento: acComAfastamento.length, acSemAfastamento: acTotal.length - acComAfastamento.length, totalDiasPerdidos, HHT };
  }, [acidentes, hhtConfig, dadosObra.dataInicio]);
  function updateDadosObra(campo, valor) {
    setDadosObra((d) => ({ ...d, [campo]: valor }));
  }
  function baixarArquivo(conteudo, nomeArquivo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nomeArquivo;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function exportarOrcamentoCSV() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["EAP", "Categoria de Custo", "Mão de Obra (R$)", "Unidade", "Quantidade", "Preço Unitário (R$)", "Material (R$)", "Aditivo M.Obra (R$)", "Quantidade Aditivo", "Preço Unit. Aditivo (R$)", "Aditivo Material (R$)", "Motivo do Aditivo", "Orçado Total — Custo Direto (R$)", "Realizado (R$)", "Saldo (R$)", "% Consumido", "% Execução", "Encargos Sociais (%)", "BDI (%)", "Preço de Venda (R$)"];
    const linhas = orcamento.map((o) => {
      const orc = orcadoTotal(o), real = realizadoTotal(o), mat = materialTotal(o);
      return [o.etapaId, o.categoria, o.maoObra, o.unidade, o.quantidade, o.precoUnitario, mat, o.aditivoMaoObra || 0, o.quantidadeAditivo || 0, o.precoUnitarioAditivo ?? o.precoUnitario, materialAditivoTotal(o), o.motivoAditivo || "", orc, real, orc - real, orc ? ((real / orc) * 100).toFixed(1) + "%" : "0%", Math.round(pctExecucaoItem(o) * 1000) / 10 + "%", o.encargosSociaisPct || 0, o.bdiPct || 0, precoVendaTotal(o)];
    });
    const totalLinha = ["", "TOTAL GERAL", totalMaoObra - totalAditivoMaoObra, "", "", "", totalMaterial - totalAditivoMaterial, totalAditivoMaoObra, "", "", totalAditivoMaterial, "", totalOrcado, totalRealizado, totalOrcado - totalRealizado, totalOrcado ? ((totalRealizado / totalOrcado) * 100).toFixed(1) + "%" : "0%", "", "", "", totalPrecoVenda];
    const csv = [header, ...linhas, totalLinha].map((l) => l.map(esc).join(";")).join("\n");
    baixarArquivo("\ufeff" + csv, `orcamento_${dadosObra.codigo || "obra"}.csv`, "text/csv;charset=utf-8;");
  }
  function exportarBackupJSON() {
    const backup = { dadosObra, etapas, orcamento, caixa, diario, nrs, docs, equipe, medicoesDono, medicoesEmp, empreiteiros, riscos, licoes, historicoFisico, usuarioAtual, historicoEdicoes, fotos: fotos.map((f) => ({ ...f, url: f.url?.startsWith("data:") ? "[imagem local removida do backup]" : f.url })) };
    baixarArquivo(JSON.stringify(backup, null, 2), `backup_${dadosObra.codigo || "obra"}.json`, "application/json;charset=utf-8;");
  }
  function exportarCaixaCSV() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Data", "Tipo", "Categoria", "Descrição", "Vencimento", "Status", "Valor (R$)"];
    const linhas = caixaComSaldo.map((c) => [new Date(c.data).toLocaleDateString("pt-BR"), c.tipo, c.categoria, c.descricao, c.vencimento ? new Date(c.vencimento).toLocaleDateString("pt-BR") : "", c.status, c.valor]);
    const csv = [header, ...linhas].map((l) => l.map(esc).join(";")).join("\n");
    baixarArquivo("\ufeff" + csv, `fluxo_caixa_${dadosObra.codigo || "obra"}.csv`, "text/csv;charset=utf-8;");
  }
  function updateEmpreiteiro(idx, campo, valor) {
    setEmpreiteiros((es) => es.map((e, i) => (i === idx ? { ...e, [campo]: valor } : e)));
  }
  function addEmpreiteiro() {
    setEmpreiteiros((es) => [...es, { nome: "Novo empreiteiro", servico: "", valorContratado: 0 }]);
  }
  function removeEmpreiteiro(idx) {
    setEmpreiteiros((es) => es.filter((_, i) => i !== idx));
  }
  function addMedicaoDono() {
    if (!novaMedicaoDono.periodo || !novaMedicaoDono.valorMedido) return;
    const numero = medicoesDono.length + 1;
    const valor = Number(novaMedicaoDono.valorMedido);
    const retencao = Number(novaMedicaoDono.retencaoPct || 0);
    const liquido = valor - valor * (retencao / 100);
    setMedicoesDono((ms) => [...ms, { id: uid(), numero, periodo: novaMedicaoDono.periodo, data: novaMedicaoDono.data, valorMedido: valor, retencaoPct: retencao, status: novaMedicaoDono.status }]);
    if (novaMedicaoDono.lancarCaixa) {
      const vencimento = new Date(toDate(novaMedicaoDono.data).getTime() + 30 * dayMs).toISOString().slice(0, 10);
      setCaixa((cs) => [...cs, {
        id: uid(), data: novaMedicaoDono.data, tipo: "Entrada", categoria: "Medição Cliente",
        descricao: `Medição nº${numero} — ${novaMedicaoDono.periodo} (líquido, retenção ${retencao}%)`,
        valor: Math.round(liquido), vencimento, status: "Pendente",
      }]);
    }
    registrarHistorico("Medição (Dono)", `Medição nº${numero} lançada — ${novaMedicaoDono.periodo} — ${fmtR$(valor)}`);
    setNovaMedicaoDono({ periodo: "", data: todayISO, valorMedido: "", retencaoPct: 5, status: "Pendente", lancarCaixa: true });
  }
  function usarValorSugerido() {
    setNovaMedicaoDono((n) => ({ ...n, valorMedido: Math.round(valorSugeridoMedicaoDono) }));
  }
  function removeMedicaoDono(id) {
    setMedicoesDono((ms) => ms.filter((m) => m.id !== id));
  }
  function updateMedicaoDonoStatus(id, status) {
    setMedicoesDono((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));
  }
  function addMedicaoEmp() {
    if (!novaMedicaoEmp.empreiteiro || !novaMedicaoEmp.periodo || !novaMedicaoEmp.valorMedido) return;
    setMedicoesEmp((ms) => [...ms, { id: uid(), numero: ms.filter((m) => m.empreiteiro === novaMedicaoEmp.empreiteiro).length + 1, ...novaMedicaoEmp, valorMedido: Number(novaMedicaoEmp.valorMedido) }]);
    registrarHistorico("Medição (Empreiteiro)", `${novaMedicaoEmp.empreiteiro} — ${novaMedicaoEmp.periodo} — ${fmtR$(novaMedicaoEmp.valorMedido)}`);
    setNovaMedicaoEmp({ empreiteiro: "", etapaId: ETAPAS_SEED[0].id, periodo: "", valorMedido: "", retencaoPct: 5, status: "Pendente" });
  }
  function removeMedicaoEmp(id) {
    setMedicoesEmp((ms) => ms.filter((m) => m.id !== id));
  }
  function updateMedicaoEmpStatus(id, status) {
    setMedicoesEmp((ms) => ms.map((m) => (m.id === id ? { ...m, status } : m)));
  }
  const fotosPorMes = useMemo(() => {
    const grupos = {};
    [...fotos].sort((a, b) => (a.data < b.data ? 1 : -1)).forEach((f) => {
      const mes = (f.data || "").slice(0, 7);
      if (!grupos[mes]) grupos[mes] = [];
      grupos[mes].push(f);
    });
    return Object.entries(grupos).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [fotos]);
  function fotosDoDia(dataBR) {
    return fotos.filter((f) => f.data === toISO(dataBR));
  }

  return (
    <div style={{ fontFamily: "Inter, ui-sans-serif, system-ui", background: G.canvas, minHeight: "100%", color: G.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
        * { box-sizing: border-box; }
        table { border-collapse: collapse; width: 100%; font-size: 12px; }
        th { text-align: left; padding: 7px 10px; background: ${G.ribbonSoft}; color: #fff; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
        td { padding: 6px 10px; border-bottom: 1px solid ${G.grid}; }
        tr:nth-child(even) td { background: #FAFBFC; }
        input, select { font-family: inherit; font-size: 12px; padding: 5px 7px; border: 1px solid #CBD2D9; border-radius: 3px; }
        button { cursor: pointer; }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: #C7CCD3; border-radius: 4px; }
      `}</style>

      {/* Ribbon */}
      <div style={{ background: G.ribbon, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {onVoltarPortfolio && (
            <button onClick={onVoltarPortfolio} title="Voltar ao Portfólio de Obras"
              style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", borderRadius: 4, padding: "6px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              <ChevronRight size={13} style={{ transform: "rotate(180deg)" }} /> Portfólio
            </button>
          )}
          <FolderTree size={17} color={G.amber} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{dadosObra.nome} <span style={{ color: G.faint, fontWeight: 500 }}>· {dadosObra.codigo}</span></div>
            <div style={{ fontSize: 10.5, color: "#8590A0" }}>{dadosObra.empresaExecutora} · {dadosObra.responsavelTecnico} (CREA {dadosObra.crea}) · Início {toBR(dadosObra.dataInicio)}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 18, fontSize: 11 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#8590A0", fontSize: 9.5, textTransform: "uppercase" }}>% Físico</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 14 }}>{fmtPct(pctFisico)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#8590A0", fontSize: 9.5, textTransform: "uppercase" }}>Desvio</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 14, color: desvio >= 0 ? "#7FCB9C" : "#E59A8C" }}>{(desvio >= 0 ? "+" : "") + desvio} p.p.</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "stretch", position: "relative" }}>
          {/* seta esquerda */}
          <button onClick={() => { const el = document.getElementById("tab-scroll-bar"); if (el) el.scrollBy({ left: -200, behavior: "smooth" }); }}
            style={{ flexShrink: 0, background: "rgba(0,0,0,0.25)", border: "none", color: "#fff", padding: "0 10px", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center" }}>‹</button>
          {/* abas roláveis — sem scrollbar visível, controladas pelas setas */}
          <div id="tab-scroll-bar" style={{ overflowX: "auto", overflowY: "hidden", display: "flex", gap: 2, padding: "0 4px", flex: 1, scrollbarWidth: "none" }}>
            <style>{`#tab-scroll-bar::-webkit-scrollbar{display:none}`}</style>
            {TABS.map((t) => {
              const Icon = t.icon, active = tab === t.k;
              return (
                <button key={t.k} onClick={() => setTab(t.k)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "9px 13px", border: "none",
                    background: active ? G.canvas : "transparent", color: active ? G.ink : "#AEB7C2",
                    fontSize: 12, fontWeight: active ? 700 : 600, borderRadius: "4px 4px 0 0",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                  <Icon size={13.5} /> {t.l}
                </button>
              );
            })}
          </div>
          {/* seta direita */}
          <button onClick={() => { const el = document.getElementById("tab-scroll-bar"); if (el) el.scrollBy({ left: 200, behavior: "smooth" }); }}
            style={{ flexShrink: 0, background: "rgba(0,0,0,0.25)", border: "none", color: "#fff", padding: "0 10px", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center" }}>›</button>
        </div>
      </div>

      <div style={{ padding: "20px 22px" }}>
        {tab === "dash" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, flex: 1 }}>
                <KPI label="% Físico Executado" value={fmtPct(pctFisico)} sub="Ponderado por peso EAP" accent={G.steel} />
                <KPI label="Desvio de Cronograma" value={(desvio >= 0 ? "+" : "") + desvio + " p.p."} accent={desvio >= 0 ? G.mint : G.red} />
                <KPI label="Custo Realizado" value={fmtR$(totalRealizado)} sub={`Orçado: ${fmtR$(totalOrcado)}`} accent={G.steel} />
                <KPI label="% Orçamento Consumido" value={fmtPct(totalRealizado / totalOrcado)} accent={G.amberDark} />
                <KPI label="Produtividade Média (RDO)" value={fmtPct(prodMedia)} accent={G.mint} />
              </div>
              <button onClick={gerarRelatorioExecutivo}
                style={{ flexShrink: 0, background: G.ribbon, color: "#fff", border: "none", borderRadius: 6, padding: "10px 16px", fontWeight: 800, fontSize: 12.5, display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                <FileSignature size={14} /> Relatório Executivo
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14, marginBottom: 14 }}>
              <Panel>
                <PanelHead icon={TrendingUp}>Curva S — Avanço Físico Acumulado</PanelHead>
                <div style={{ padding: 12 }}>
                  <ResponsiveContainer width="100%" height={230}>
                    <LineChart data={curvaS} margin={{ left: -10 }}>
                      <CartesianGrid stroke={G.grid} />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip formatter={(v) => v + "%"} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="plan" name="Planejado" stroke={G.steel} strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="real" name="Realizado" stroke={G.amber} strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel>
                <PanelHead icon={Calculator}>Distribuição do Orçamento</PanelHead>
                <div style={{ padding: 12 }}>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie data={orcamentoComTotal} dataKey="orcado" nameKey="categoria" innerRadius={42} outerRadius={82}>
                        {orcamentoComTotal.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtR$(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
            </div>
            <Gantt etapas={etapasParaGantt} schedule={schedule} scheduleCombinado={scheduleCombinado} orcamento={orcamento} custoPorEtapaMap={custoPorEtapaMap} />
          </>
        )}

        {tab === "obra" && (
          <>
            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={Building2}>Dados Gerais da Obra</PanelHead>
              <EditableLegend note="Estes dados alimentam o ribbon superior e os arquivos exportados." />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 16 }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Nome da Obra</label><EditCell value={dadosObra.nome} onChange={(v) => updateDadosObra("nome", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Código da Obra</label><EditCell value={dadosObra.codigo} onChange={(v) => updateDadosObra("codigo", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Área Construída (m²)</label><EditCell type="number" value={dadosObra.areaConstruida} onChange={(v) => updateDadosObra("areaConstruida", v)} /></div>

                <div><label style={{ fontSize: 10, color: G.sub }}>Endereço (Rua, nº)</label><EditCell value={dadosObra.endereco} onChange={(v) => updateDadosObra("endereco", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Bairro</label><EditCell value={dadosObra.bairro} onChange={(v) => updateDadosObra("bairro", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>CEP</label><EditCell value={dadosObra.cep} onChange={(v) => updateDadosObra("cep", v)} /></div>

                <div><label style={{ fontSize: 10, color: G.sub }}>Cidade</label><EditCell value={dadosObra.cidade} onChange={(v) => updateDadosObra("cidade", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>UF</label>
                  <EditSelect value={dadosObra.uf} onChange={(v) => updateDadosObra("uf", v)}
                    options={["SP", "RJ", "MG", "PR", "RS", "SC", "BA", "ES", "GO", "DF"].map((u) => ({ v: u, l: u }))} />
                </div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Data de Início</label><EditCell type="date" value={dadosObra.dataInicio} onChange={(v) => updateDadosObra("dataInicio", v)} /></div>
              </div>
            </Panel>

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={Users}>Cliente e Responsáveis Técnicos</PanelHead>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 16 }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Cliente / Contratante</label><EditCell value={dadosObra.cliente} onChange={(v) => updateDadosObra("cliente", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>CNPJ do Cliente</label><EditCell value={dadosObra.cnpjCliente} onChange={(v) => updateDadosObra("cnpjCliente", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Coordenador de Obra</label><EditCell value={dadosObra.coordenador} onChange={(v) => updateDadosObra("coordenador", v)} /></div>

                <div><label style={{ fontSize: 10, color: G.sub }}>Empresa Executora</label><EditCell value={dadosObra.empresaExecutora} onChange={(v) => updateDadosObra("empresaExecutora", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>CNPJ da Empresa</label><EditCell value={dadosObra.cnpjEmpresa} onChange={(v) => updateDadosObra("cnpjEmpresa", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Engenheiro Responsável</label><EditCell value={dadosObra.responsavelTecnico} onChange={(v) => updateDadosObra("responsavelTecnico", v)} /></div>

                <div><label style={{ fontSize: 10, color: G.sub }}>CREA</label><EditCell value={dadosObra.crea} onChange={(v) => updateDadosObra("crea", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>ART</label><EditCell value={dadosObra.art} onChange={(v) => updateDadosObra("art", v)} /></div>
              </div>
            </Panel>

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={Calculator}>Contrato</PanelHead>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, padding: 16 }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Valor do Contrato Original (R$)</label><EditCell type="number" prefix="R$" value={dadosObra.valorContrato} onChange={(v) => updateDadosObra("valorContrato", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Regime de Contratação</label>
                  <EditSelect value={dadosObra.regime} onChange={(v) => updateDadosObra("regime", v)}
                    options={["Empreitada Global", "Empreitada por Preço Unitário", "Administração a Preço de Custo", "Empreitada Integral (RDC Integrado)"].map((r) => ({ v: r, l: r }))} />
                </div>
                <div><label style={{ fontSize: 10, color: G.sub }}>BDI (%)</label><EditCell type="number" value={dadosObra.bdi} onChange={(v) => updateDadosObra("bdi", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Data Prevista de Término</label><EditCell type="date" value={dadosObra.dataFimPrevista} onChange={(v) => updateDadosObra("dataFimPrevista", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Reserva de Contingência (%)</label><EditCell type="number" value={dadosObra.reservaContingenciaPct} onChange={(v) => updateDadosObra("reservaContingenciaPct", v)} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Saldo Inicial de Caixa (R$)</label><EditCell type="number" prefix="R$" value={dadosObra.saldoInicialCaixa} onChange={(v) => updateDadosObra("saldoInicialCaixa", v)} /></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "0 16px 12px", flexWrap: "wrap" }}>
                <FileSpreadsheet size={12} color={G.amberDark} />
                <span>
                  <b style={{ color: G.ink }}>Valor Atual com Aditivos: {fmtR$(Number(dadosObra.valorContrato || 0) + totalAditivos)}</b>
                  {" "}— calculado automaticamente ({fmtR$(dadosObra.valorContrato)} original {totalAditivos >= 0 ? "+" : ""} {fmtR$(totalAditivos)} em aditivos lançados na planilha orçamentária). Não edite este número direto — lance o aditivo linha a linha na aba EAP/Orçamento, com motivo, pra manter o histórico auditável.
                </span>
              </div>
            </Panel>

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={CalendarDays}>Calendário de Obra — Dias Úteis</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
                <CheckCircle2 size={12} color={G.mint} />
                O Cronograma inteiro (mestre e detalhado) calcula em dias úteis de verdade — pula fins de semana e os feriados abaixo automaticamente, em todas as datas e na folga/caminho crítico.
              </div>
              <div style={{ padding: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: G.ink, cursor: "pointer", marginBottom: 14 }}>
                  <input type="checkbox" checked={dadosObra.trabalhaSabado} onChange={(e) => updateDadosObra("trabalhaSabado", e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: G.steel, cursor: "pointer" }} />
                  Obra trabalha sábado (meio período ou integral)
                </label>
                <label style={{ fontSize: 10, color: G.sub }}>Feriados considerados (nacionais 2026-2027 pré-carregados — adicione municipais/estaduais se houver)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6, marginBottom: 10 }}>
                  {(dadosObra.feriados || []).sort().map((f) => (
                    <span key={f} style={{ background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 9, display: "flex", alignItems: "center", gap: 5 }}>
                      {toBR(f)}
                      <button onClick={() => updateDadosObra("feriados", (dadosObra.feriados || []).filter((x) => x !== f))}
                        style={{ background: "none", border: "none", color: EDIT_TEXT, cursor: "pointer", padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                  <div>
                    <label style={{ fontSize: 10, color: G.sub }}>Adicionar feriado</label>
                    <input type="date" id="novo-feriado-input" style={{ border: `1px solid ${EDIT_BORDER}`, background: EDIT_BG, color: EDIT_TEXT, fontWeight: 700, borderRadius: 3, padding: "6px 8px" }} />
                  </div>
                  <button onClick={() => {
                    const input = document.getElementById("novo-feriado-input");
                    if (input.value && !(dadosObra.feriados || []).includes(input.value)) {
                      updateDadosObra("feriados", [...(dadosObra.feriados || []), input.value]);
                      input.value = "";
                    }
                  }} style={{ background: G.steel, color: "#fff", border: "none", padding: "7px 13px", borderRadius: 4, fontWeight: 700, fontSize: 11.5 }}>
                    + Adicionar
                  </button>
                </div>
              </div>
            </Panel>

            <Panel>
              <PanelHead icon={Download}>Exportar</PanelHead>
              <div style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 12 }}>
                <button onClick={exportarOrcamentoCSV}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: G.steel, color: "#fff", border: "none", padding: "11px 16px", borderRadius: 4, fontWeight: 700, fontSize: 12.5 }}>
                  <FileSpreadsheet size={15} /> Exportar Orçamento (.csv — abre no Excel)
                </button>
                <button onClick={exportarBackupJSON}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", color: G.ink, border: `1px solid ${G.grid}`, padding: "11px 16px", borderRadius: 4, fontWeight: 700, fontSize: 12.5 }}>
                  <FileJson size={15} /> Exportar Backup Completo (.json)
                </button>
              </div>
              <div style={{ padding: "0 16px 16px", fontSize: 11, color: G.sub }}>
                O CSV traz a planilha orçamentária (EAP, categoria, mão de obra, material, orçado, realizado, saldo e % consumido) pronta para abrir no Excel ou Google Sheets.
                O backup em JSON guarda todos os módulos do sistema (cronograma, orçamento, caixa, diário, equipe, documentos) para arquivar ou restaurar depois.
              </div>
            </Panel>

            <Panel style={{ marginTop: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: temStorageClaude() || temLocalStorage() ? G.mint : G.red, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: G.sub }}>
                <b style={{ color: G.ink }}>Persistência ativa:</b> {backendDePersistencia()}.
                {!temStorageClaude() && temLocalStorage() && " Use o backup em JSON acima periodicamente — localStorage não sincroniza entre dispositivos."}
              </span>
            </Panel>

            <Panel style={{ marginTop: 14 }}>
              <PanelHead icon={UserCircle}>Identificação do Usuário (simulada)</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
                <AlertTriangle size={12} color={G.amberDark} />
                <span>Isto <b>não é autenticação real</b> — é só um nome que fica anexado às edições daqui pra frente, pra simular auditoria multiusuário. Login de verdade exige o backend (ver schema SQL).</span>
              </div>
              <div style={{ padding: 14, maxWidth: 320 }}>
                <label style={{ fontSize: 10, color: G.sub }}>Editando como</label>
                <EditCell value={usuarioAtual} onChange={setUsuarioAtual} />
              </div>
            </Panel>

            <Panel style={{ marginTop: 14 }}>
              <PanelHead icon={History}>Histórico de Alterações (Auditoria)</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
                Registra automaticamente: avanço de cronograma, lançamentos de caixa e medições. Últimas 300 ações, mais recente primeiro.
              </div>
              {historicoEdicoes.length === 0 ? (
                <div style={{ padding: 20, color: G.faint, fontSize: 12, fontStyle: "italic", textAlign: "center" }}>Nenhuma alteração registrada ainda nesta sessão.</div>
              ) : (
                <table>
                  <thead><tr><th style={{ width: 110 }}>Data</th><th style={{ width: 60 }}>Hora</th><th style={{ width: 140 }}>Usuário</th><th style={{ width: 140 }}>Módulo</th><th>Descrição</th></tr></thead>
                  <tbody>
                    {historicoEdicoes.slice().reverse().slice(0, 50).map((h) => (
                      <tr key={h.id}>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{toBR(h.data)}</td>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{h.hora}</td>
                        <td style={{ fontWeight: 700 }}>{h.usuario}</td>
                        <td><span style={{ background: "#F4F5F6", color: G.sub, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 9 }}>{h.modulo}</span></td>
                        <td>{h.descricao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </>
        )}

        {tab === "gantt" && (
          <>
            <Panel style={{ marginBottom: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              {baseline ? (() => {
                const etapaFinal = etapas[etapas.length - 1];
                const baseFim = baseline.etapas[etapaFinal.id]?.fim;
                const atualFim = schedule[etapaFinal.id]?.fim;
                const desvioProjetoD = baseFim && atualFim ? diffDays(baseFim, atualFim) : 0;
                return (
                  <>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: G.ink }}>
                      <CheckCircle2 size={13} color={G.mint} /> <b>Baseline congelada</b> em {toBR(baseline.congeladoEm)} por {baseline.congeladoPor}
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: desvioProjetoD > 0 ? G.red : desvioProjetoD < 0 ? G.mint : G.sub }}>
                      Atraso acumulado do projeto: {desvioProjetoD > 0 ? "+" : ""}{desvioProjetoD} dia(s) {desvioProjetoD > 0 ? "(atrasado)" : desvioProjetoD < 0 ? "(adiantado)" : "(no prazo)"}
                    </span>
                    <button onClick={congelarBaseline} style={{ marginLeft: "auto", background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11, fontWeight: 700, padding: "6px 11px", borderRadius: 4 }}>Recongelar agora</button>
                    <button onClick={limparBaseline} style={{ background: "none", border: `1px solid ${G.grid}`, color: G.sub, fontSize: 11, fontWeight: 700, padding: "6px 11px", borderRadius: 4 }}>Remover baseline</button>
                  </>
                );
              })() : (
                <>
                  <span style={{ fontSize: 11.5, color: G.sub }}>Nenhuma baseline congelada ainda — sem ela, não dá pra medir atraso acumulado de verdade (só comparar com "hoje").</span>
                  <button onClick={congelarBaseline} style={{ marginLeft: "auto", background: G.steel, color: "#fff", border: "none", fontSize: 11.5, fontWeight: 700, padding: "7px 13px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle2 size={13} /> Congelar Baseline agora
                  </button>
                </>
              )}
            </Panel>
            <Gantt etapas={etapasParaGantt} schedule={schedule} scheduleCombinado={scheduleCombinado} orcamento={orcamento} custoPorEtapaMap={custoPorEtapaMap} />
            <Panel style={{ marginTop: 10 }}>
              <PanelHead icon={GanttChartSquare}>Cronograma — Itens da Planilha como Atividades do CPM</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}`, flexWrap: "wrap", fontSize: 10.5 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: G.ink }}><span style={{ width: 12, height: 10, background: G.ribbon, borderRadius: 2, display: "inline-block" }} /> Fase (resumo automático — lê dos itens)</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: G.ink }}><span style={{ width: 12, height: 10, background: "#fff", border: `1px solid ${G.grid}`, borderRadius: 2, display: "inline-block" }} /> Item da planilha (atividade real do CPM — edite duração, predecessoras e % aqui)</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: G.red }}><Flag size={11} /> Caminho crítico</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 1200, borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ background: G.ribbon }}>
                      <th style={{ width: 70, color: "#fff", padding: "8px 8px", fontSize: 11, textAlign: "center" }}>EAP</th>
                      <th style={{ minWidth: 200, color: "#fff", padding: "8px 10px", fontSize: 11, textAlign: "left" }}>Atividade / Item</th>
                      <th style={{ width: 90, color: "#fff", padding: "8px 8px", fontSize: 11, textAlign: "center" }}>Duração<br/><span style={{ fontWeight: 400, fontSize: 9 }}>d.úteis</span></th>
                      <th style={{ width: 108, color: "#fff", padding: "8px 8px", fontSize: 11, textAlign: "center" }}>Início</th>
                      <th style={{ width: 108, color: "#fff", padding: "8px 8px", fontSize: 11, textAlign: "center" }}>Término</th>
                      <th style={{ width: 100, color: "#fff", padding: "8px 8px", fontSize: 11, textAlign: "center" }}>Crítico/Folga</th>
                      <th style={{ minWidth: 170, background: G.amberDark, color: "#fff", padding: "8px 10px", fontSize: 11, textAlign: "left" }}>◀ Predecessoras</th>
                      <th style={{ minWidth: 150, background: "#3A6B4A", color: "#fff", padding: "8px 10px", fontSize: 11, textAlign: "left" }}>Sucessoras ▶</th>
                      <th style={{ width: 130, color: "#fff", padding: "8px 8px", fontSize: 11, textAlign: "center" }}>% Concluído</th>
                      <th style={{ width: 32, color: "#fff" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {etapas.map((e) => {
                      const sc = schedule[e.id];
                      const custo = custoPorEtapaMap[e.id] || { orcado: 0, realizado: 0 };
                      const itensDaEtapa = orcamento.filter((o) => o.etapaId === e.id);
                      const temItens = itensDaEtapa.length > 0;
                      const estaExpandido = etapasExpandidas[e.id] !== false; // default: expandido
                      return (
                        <React.Fragment key={e.id}>
                          {/* ── LINHA DE FASE/ETAPA (resumo) ── */}
                          <tr style={{ background: "#1E2530", cursor: temItens ? "pointer" : "default" }}
                            onClick={() => temItens && toggleExpandEtapa(e.id)}>
                            <td style={{ color: G.amber, fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, fontSize: 12, padding: "8px 8px", textAlign: "center" }}>{e.id}</td>
                            <td style={{ color: "#fff", fontWeight: 700, fontSize: 12.5, padding: "8px 10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                {temItens && <ChevronRight size={13} color={G.amber} style={{ transform: estaExpandido ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />}
                                <EditCell value={e.nome} onChange={(v) => { updateEtapa(e.id, "nome", v); }} style={{ color: "#fff", background: "transparent", border: "none" }} onClick={(ev) => ev.stopPropagation()} />
                              </div>
                              {temItens && <div style={{ fontSize: 9.5, color: "#8590A0", marginLeft: 20, fontWeight: 400 }}>
                                resumo de {itensDaEtapa.length} item(ns) · {sc.critico ? "crítico" : `folga ${sc.folgaDias}du`}
                              </div>}
                            </td>
                            <td style={{ color: "#8590A0", textAlign: "center", fontSize: 11, padding: "8px 8px" }}>
                              {temItens ? diffDays(sc.ini, sc.fim) + "du" : (
                                <EditCell type="number" align="right" value={e.duracaoDias} onChange={(v) => updateEtapa(e.id, "duracaoDias", Number(v))} style={{ color: "#fff" }} onClick={(ev) => ev.stopPropagation()} />
                              )}
                            </td>
                            <td style={{ color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 11.5, padding: "8px 8px" }}>{toBR(sc.ini)}</td>
                            <td style={{ color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 11.5, padding: "8px 8px" }}>{toBR(sc.fim)}</td>
                            <td style={{ textAlign: "center", padding: "8px 8px" }}>
                              {sc.critico ? <span style={{ color: G.red, fontWeight: 800, fontSize: 11 }}><Flag size={10} /> Crítico</span>
                                : <span style={{ color: "#8590A0", fontSize: 11 }}>+{sc.folgaDias}du</span>}
                            </td>
                            <td colSpan={temItens ? 3 : 1} style={{ padding: "8px 10px" }}>
                              {!temItens && <PredecessorPicker etapas={etapas} atual={e} onChange={(v) => updateEtapa(e.id, "predecessoras", v)} />}
                            </td>
                            {!temItens && <>
                              <td style={{ padding: "8px 10px" }}>
                                <span style={{ color: "#8590A0", fontSize: 11 }}>{etapas.filter(o=>(o.predecessoras||[]).includes(e.id)).map(o=>o.id).join(", ") || "—"}</span>
                              </td>
                              <td style={{ padding: "8px 8px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <EditCell type="number" width={44} align="right" value={e.pct} onChange={(v) => updateEtapa(e.id, "pct", Math.max(0, Math.min(100, Number(v))))} style={{ color: "#fff" }} onClick={(ev) => ev.stopPropagation()} />
                                  <div style={{ flex: 1, height: 5, background: "#2E3542", borderRadius: 3, overflow: "hidden", minWidth: 20 }}>
                                    <div style={{ height: "100%", width: `${e.pct}%`, background: e.pct >= 100 ? G.mint : G.amber }} />
                                  </div>
                                </div>
                              </td>
                            </>}
                            <td style={{ padding: "8px 8px" }}>
                              {!temItens && <button onClick={(ev) => { ev.stopPropagation(); removeEtapa(e.id); }} style={{ background: "none", border: "none", color: "#555" }}><Trash2 size={13} /></button>}
                            </td>
                          </tr>

                          {/* ── LINHAS DE ITENS DA PLANILHA (atividades reais do CPM) ── */}
                          {temItens && estaExpandido && itensDaEtapa.map((o) => {
                            const oIdx = orcamento.findIndex((x) => x.id === o.id);
                            const scItem = scheduleCombinado[o.id];
                            const temPredPropria = (o.predecessorasDetalhe || []).length > 0;
                            const ehRaizItem = !temPredPropria && (e.predecessoras || []).length === 0;
                            return (
                              <tr key={o.id} style={{ background: "#fff", borderBottom: `1px solid ${G.grid}` }}>
                                <td style={{ color: G.faint, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "7px 8px", textAlign: "center", paddingLeft: 22 }}>└</td>
                                <td style={{ padding: "7px 10px", paddingLeft: 28, fontSize: 12, fontWeight: 600, color: G.ink }}>
                                  {o.categoria}
                                  <div style={{ fontSize: 9.5, color: G.faint, fontWeight: 400 }}>{o.unidade} · {fmtR$(orcadoTotal(o))}</div>
                                </td>
                                <td style={{ padding: "7px 8px" }}>
                                  <EditCell type="number" align="right" value={o.duracaoDetalheDias} onChange={(v) => updateOrcamento(oIdx, "duracaoDetalheDias", Math.max(1, Number(v)))} />
                                </td>
                                <td style={{ padding: "7px 8px" }}>
                                  {ehRaizItem ? (
                                    <EditCell type="date" value={o.iniDetalhe} onChange={(v) => updateOrcamento(oIdx, "iniDetalhe", v)} />
                                  ) : (
                                    <div style={{ textAlign: "center", fontWeight: 700, color: G.ink, background: "#F4F5F6", borderRadius: 3, padding: "4px 6px", fontSize: 11 }}>{toBR(scItem?.ini)}</div>
                                  )}
                                </td>
                                <td style={{ padding: "7px 8px" }}>
                                  <div style={{ textAlign: "center", fontWeight: 700, color: G.ink, background: "#F4F5F6", borderRadius: 3, padding: "4px 6px", fontSize: 11 }}>{toBR(scItem?.fim)}</div>
                                </td>
                                <td style={{ textAlign: "center", padding: "7px 8px" }}>
                                  {scItem?.critico
                                    ? <span style={{ color: G.red, fontWeight: 800, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 3 }}><Flag size={10} /> Crítico</span>
                                    : <span style={{ color: G.sub, fontSize: 11 }}>+{scItem?.folgaDias}du</span>}
                                </td>
                                <td style={{ padding: "7px 10px", background: "#FFFBF4" }}>
                                  <PredecessorPickerDetalhe orcamento={orcamento} etapas={etapas} atual={o} onChange={(novas) => updateOrcamento(oIdx, "predecessorasDetalhe", novas)} />
                                </td>
                                <td style={{ padding: "7px 10px", background: "#F4FBF6" }}>
                                  <SucessorasDetalhe orcamento={orcamento} etapas={etapas} atual={o} />
                                </td>
                                <td style={{ padding: "7px 8px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                    <EditCell type="number" width={46} align="right" value={o.pctDetalhe} onChange={(v) => updateOrcamento(oIdx, "pctDetalhe", Math.max(0, Math.min(100, Number(v))))} />
                                    <div style={{ flex: 1, height: 5, background: G.grid, borderRadius: 3, overflow: "hidden", minWidth: 20 }}>
                                      <div style={{ height: "100%", width: `${o.pctDetalhe}%`, background: o.pctDetalhe >= 100 ? G.mint : G.amber }} />
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: "7px 8px", textAlign: "center" }}>
                                  {temPredPropria && (
                                    <div>
                                      <label style={{ fontSize: 9, color: G.faint, display: "block" }}>lag</label>
                                      <EditCell type="number" width={36} align="right" value={o.atrasoDetalheDias} onChange={(v) => updateOrcamento(oIdx, "atrasoDetalheDias", Number(v))} />
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: 10 }}>
                <button onClick={addEtapa}
                  style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Adicionar fase/etapa
                </button>
              </div>
            </Panel>

            <div style={{ marginTop: 14, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ height: 1, flex: 1, background: G.grid }} />
              <span style={{ fontSize: 10.5, color: G.sub, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Cronograma Detalhado (vem da Planilha Orçamentária)</span>
              <span style={{ height: 1, flex: 1, background: G.grid }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 0 10px" }}>
              <CheckCircle2 size={12} color={G.mint} />
              Aqui a direção é invertida: cada barra é um item da planilha de custos (não da EAP mestre). Edite o % de cada item na aba "EAP / Orçamento" (expanda a linha) — o avanço sobe automaticamente para a etapa correspondente no cronograma mestre acima.
            </div>
            <GanttDetalhado orcamento={orcamento} etapas={etapas} scheduleCombinado={scheduleCombinado} />
          </>
        )}

        {tab === "eap" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Mão de Obra Total" value={fmtR$(totalMaoObra)} accent={G.steel} />
              <KPI label="Material Total" value={fmtR$(totalMaterial)} accent={G.steel} />
              <KPI label="Orçado Total (Custo Direto)" value={fmtR$(totalOrcado)} accent={G.ink} />
              <KPI label="Realizado Total" value={fmtR$(totalRealizado)} accent={G.amberDark} />
              <KPI label="% Consumido" value={fmtPct(totalOrcado ? totalRealizado / totalOrcado : 0)} accent={G.mint} />
              <KPI label="Preço de Venda (c/ Encargos+BDI)" value={fmtR$(totalPrecoVenda)} sub={`margem: ${fmtR$(totalPrecoVenda - totalOrcado)}`} accent={G.mint} />
            </div>
            <Panel>
              <PanelHead icon={Calculator}>Planilha Orçamentária Executiva — EAP de Custos (Mão de Obra + Material)</PanelHead>
              <EditableLegend note="Material é Quantidade × Preço Unitário (igual Aditivo Material agora). % Execução vem do Cronograma. Encargos Sociais e BDI por item ficam na linha expandida (▸) — Orçado Total aqui é custo direto puro, sem margem." />
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", background: "#F7F7F5", borderBottom: `1px solid ${G.grid}`, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10.5, color: G.sub, fontWeight: 700 }}>Colunas visíveis:</span>
                {[
                  { k: "orc_unidade", l: "Un." }, { k: "orc_qtd", l: "Qtd" }, { k: "orc_precoUnit", l: "Preço Unit." },
                  { k: "orc_material", l: "Material" }, { k: "orc_aditivoMO", l: "Adit. M.Obra" }, { k: "orc_aditivoMat", l: "Adit. Material" },
                  { k: "orc_encargos", l: "Enc.Sociais" }, { k: "orc_bdi", l: "BDI" }, { k: "orc_precoVenda", l: "Preço Venda" },
                  { k: "orc_realizado", l: "Realizado" }, { k: "orc_saldo", l: "Saldo" },
                  { k: "orc_pctConsumido", l: "% Consumido" }, { k: "orc_pctExecucao", l: "% Execução" },
                ].map(({ k, l }) => (
                  <button key={k} onClick={() => toggleColuna(k)}
                    style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 9, border: "none", cursor: "pointer",
                      background: colunasVisiveis[k] ? G.steel : G.grid, color: colunasVisiveis[k] ? "#fff" : G.sub }}>
                    {colunasVisiveis[k] ? "✓ " : ""}{l}
                  </button>
                ))}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ minWidth: 1620 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 28 }}></th>
                      <th style={{ width: 70 }}>EAP</th>
                      <th style={{ minWidth: 180 }}>Categoria de Custo</th>
                      <th style={{ width: 130 }}>Mão de Obra (R$)</th>
                      {colunasVisiveis.orc_unidade && <th style={{ width: 70 }}>Unidade</th>}
                      {colunasVisiveis.orc_qtd && <th style={{ width: 95 }}>Quantidade</th>}
                      {colunasVisiveis.orc_precoUnit && <th style={{ width: 110 }}>Preço Unit. (R$)</th>}
                      {colunasVisiveis.orc_material && <th style={{ width: 120 }}>Material (R$)</th>}
                      {colunasVisiveis.orc_aditivoMO && <th style={{ width: 105 }}>Aditivo M.Obra (R$)</th>}
                      {colunasVisiveis.orc_aditivoMat && <th style={{ width: 105 }}>Aditivo Material (calc.)</th>}
                      <th style={{ width: 120 }}>Orçado Total (R$)</th>
                      {colunasVisiveis.orc_realizado && <th style={{ width: 130 }}>Realizado (R$)</th>}
                      {colunasVisiveis.orc_saldo && <th style={{ width: 110 }}>Saldo (R$)</th>}
                      {colunasVisiveis.orc_pctConsumido && <th style={{ width: 90 }}>% Consumido</th>}
                      {colunasVisiveis.orc_pctExecucao && <th style={{ width: 130 }}>% Execução</th>}
                      {colunasVisiveis.orc_precoVenda && <th style={{ width: 130 }}>Preço Venda (R$)</th>}
                      <th style={{ width: 130 }}>Valor Sugerido Medição</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orcamento.map((o, i) => {
                      const orc = orcadoTotal(o), real = realizadoTotal(o), mat = materialTotal(o);
                      const pct = orc ? real / orc : 0;
                      const etapaLigada = etapas.find((e) => e.id === o.etapaId);
                      const pctExecucao = pctExecucaoItem(o);
                      const valorSugerido = orc * pctExecucao;
                      return (
                        <React.Fragment key={i}>
                        <tr>
                          <td style={{ textAlign: "center" }}>
                            <button onClick={() => toggleExpandOrcamento(i)} title="Ver insumos"
                              style={{ background: "none", border: "none", color: G.steel, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20 }}>
                              <ChevronRight size={14} style={{ transform: linhasExpandidas[i] ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                            </button>
                          </td>
                          <td>
                            <EditSelect value={o.etapaId} onChange={(v) => updateOrcamento(i, "etapaId", v)}
                              options={etapas.map((e) => ({ v: e.id, l: e.id }))} />
                          </td>
                          <td>
                            <EditCell value={o.categoria} onChange={(v) => updateOrcamento(i, "categoria", v)} />
                            <span style={{ color: G.faint, fontSize: 10, marginLeft: 2 }}>{etapaLigada?.nome}</span>
                          </td>
                          <td><EditCell type="number" prefix="R$" align="right" value={o.maoObra} onChange={(v) => updateOrcamento(i, "maoObra", v)} /></td>
                          {colunasVisiveis.orc_unidade && <td><EditCell value={o.unidade} onChange={(v) => updateOrcamento(i, "unidade", v)} /></td>}
                          {colunasVisiveis.orc_qtd && <td><EditCell type="number" align="right" value={o.quantidade} onChange={(v) => updateOrcamento(i, "quantidade", v)} /></td>}
                          {colunasVisiveis.orc_precoUnit && <td><EditCell type="number" prefix="R$" align="right" value={o.precoUnitario} onChange={(v) => updateOrcamento(i, "precoUnitario", v)} /></td>}
                          {colunasVisiveis.orc_material && <td style={{ textAlign: "right", fontWeight: 700, color: G.ink, background: "#F4F5F6" }}>{fmtR$(mat)}</td>}
                          {colunasVisiveis.orc_aditivoMO && <td><EditCell type="number" prefix="R$" align="right" value={o.aditivoMaoObra} onChange={(v) => updateOrcamento(i, "aditivoMaoObra", v)} /></td>}
                          {colunasVisiveis.orc_aditivoMat && <td style={{ textAlign: "right", fontWeight: 700, color: G.ink, background: "#F4F5F6" }}>
                            {fmtR$(materialAditivoTotal(o))}
                            {Number(o.quantidadeAditivo) !== 0 && (
                              <div style={{ fontSize: 8.5, color: G.faint, fontWeight: 500, textTransform: "none" }}>
                                {o.quantidadeAditivo > 0 ? "+" : ""}{o.quantidadeAditivo} {o.unidade} × {fmtR$(o.precoUnitarioAditivo ?? o.precoUnitario)}
                              </div>
                            )}
                          </td>}
                          <td style={{ textAlign: "right", fontWeight: 700, color: G.ink, background: "#F4F5F6" }}>
                            {fmtR$(orc)}
                            {aditivoTotal(o) !== 0 && (
                              <div style={{ fontSize: 8.5, color: G.amberDark, fontWeight: 700, textTransform: "none" }}>
                                {aditivoTotal(o) > 0 ? "+ " : ""}{fmtR$(aditivoTotal(o))} s/ orig. {fmtR$(orcadoOriginal(o))}
                              </div>
                            )}
                          </td>
                          {colunasVisiveis.orc_realizado && <td>
                            {(o.insumos && o.insumos.length > 0) ? (
                              <div style={{ textAlign: "right", fontWeight: 700, color: G.ink, background: "#F4F5F6", padding: "4px 7px", borderRadius: 3 }}>
                                {fmtR$(real)}
                                <div style={{ fontSize: 8.5, color: G.faint, fontWeight: 500, textTransform: "none" }}>somado dos insumos ↓</div>
                              </div>
                            ) : (
                              <EditCell type="number" prefix="R$" align="right" value={o.realizado} onChange={(v) => updateOrcamento(i, "realizado", v)} />
                            )}
                          </td>}
                          {colunasVisiveis.orc_saldo && <td style={{ textAlign: "right", fontWeight: 700, color: G.ink, background: "#F4F5F6" }}>{fmtR$(orc - real)}</td>}
                          {colunasVisiveis.orc_pctConsumido && <td style={{ textAlign: "right", fontWeight: 800, background: "#F4F5F6", color: pct > 0.9 ? G.red : pct > 0.6 ? G.amberDark : G.mint }}>{fmtPct(pct)}</td>}
                          {colunasVisiveis.orc_pctExecucao && <td style={{ background: "#F4F5F6" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px" }}>
                              <span style={{ fontWeight: 800, color: pctExecucao === 1 ? G.mint : G.steel, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{fmtPct(pctExecucao)}</span>
                              <div style={{ flex: 1, height: 6, background: G.grid, borderRadius: 3, overflow: "hidden", minWidth: 26 }}>
                                <div style={{ height: "100%", width: `${pctExecucao * 100}%`, background: pctExecucao === 1 ? G.mint : G.steel }} />
                              </div>
                              {o.iniDetalhe && <Package size={11} color={G.steel} title="Cronograma detalhado deste item" />}
                            </div>
                          </td>}
                          {colunasVisiveis.orc_precoVenda && <td style={{ textAlign: "right", fontWeight: 700, color: G.mint, background: "#F4F5F6" }}>{fmtR$(precoVendaTotal(o))}</td>}
                          <td style={{ textAlign: "right", fontWeight: 700, color: G.amberDark, background: "#F4F5F6", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(valorSugerido)}</td>
                          <td>
                            <button onClick={() => removeLinhaOrcamento(i)} title="Remover linha"
                              style={{ background: "none", border: "none", color: G.faint, fontSize: 15, fontWeight: 800, padding: "0 4px" }}>×</button>
                          </td>
                        </tr>
                        {linhasExpandidas[i] && (
                          <tr>
                            <td colSpan={17} style={{ padding: 0, background: "#FAFBFC", borderBottom: `2px solid ${G.grid}` }}>
                              <div style={{ padding: "12px 16px 14px" }}>
                                <div style={{ marginBottom: 14, padding: 10, background: G.goldBg, borderRadius: 4, border: `1px solid ${G.gold}` }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: G.amberDark, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                    <FileSpreadsheet size={13} /> Aditivo — Quantitativo e Justificativa
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "110px 130px 130px 1fr", gap: 10, marginBottom: 8 }}>
                                    <div>
                                      <label style={{ fontSize: 10, color: G.sub }}>Quantidade Aditivo</label>
                                      <EditCell type="number" align="right" value={o.quantidadeAditivo} onChange={(v) => updateOrcamento(i, "quantidadeAditivo", v)} />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, color: G.sub }}>Preço Unit. Aditivo (R$)</label>
                                      <EditCell type="number" prefix="R$" align="right" value={o.precoUnitarioAditivo ?? o.precoUnitario} onChange={(v) => updateOrcamento(i, "precoUnitarioAditivo", v)} />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, color: G.sub }}>= Aditivo Material (R$)</label>
                                      <div style={{ textAlign: "right", fontWeight: 700, color: G.ink, background: "#F4F5F6", borderRadius: 3, padding: "5px 8px" }}>{fmtR$(materialAditivoTotal(o))}</div>
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, color: G.sub }}>Quantidade Orçada Total (orig. + aditivo)</label>
                                      <div style={{ fontWeight: 700, color: G.ink, background: "#F4F5F6", borderRadius: 3, padding: "5px 8px" }}>{(Number(o.quantidade || 0) + Number(o.quantidadeAditivo || 0)).toLocaleString("pt-BR")} {o.unidade}</div>
                                    </div>
                                  </div>
                                  <label style={{ fontSize: 10, color: G.sub }}>Motivo / justificativa do aditivo (recomendado para auditoria)</label>
                                  <EditCell value={o.motivoAditivo} onChange={(v) => updateOrcamento(i, "motivoAditivo", v)} placeholder="Ex.: Acréscimo de quantitativo aprovado em RFI-014, troca de especificação solicitada pelo cliente..." />
                                </div>

                                <div style={{ marginBottom: 14, padding: 10, background: "#F0F4FA", borderRadius: 4, border: `1px solid ${G.grid}` }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: G.ink, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                    <Calculator size={13} color={G.steel} /> Encargos Sociais e BDI — Custo Direto x Preço de Venda
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "130px 110px 1fr 1fr", gap: 10 }}>
                                    <div>
                                      <label style={{ fontSize: 10, color: G.sub }}>Encargos Sociais (%) s/ M.Obra</label>
                                      <EditCell type="number" align="right" value={o.encargosSociaisPct} onChange={(v) => updateOrcamento(i, "encargosSociaisPct", v)} />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, color: G.sub }}>BDI (%)</label>
                                      <EditCell type="number" align="right" value={o.bdiPct} onChange={(v) => updateOrcamento(i, "bdiPct", v)} />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, color: G.sub }}>Custo Direto (sem BDI)</label>
                                      <div style={{ fontWeight: 700, color: G.ink, background: "#fff", borderRadius: 3, padding: "5px 8px", border: `1px solid ${G.grid}` }}>{fmtR$(orc)}</div>
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 10, color: G.sub }}>Preço de Venda (M.Obra c/ encargos + Material + BDI)</label>
                                      <div style={{ fontWeight: 800, color: G.mint, background: "#fff", borderRadius: 3, padding: "5px 8px", border: `1px solid ${G.grid}` }}>{fmtR$(precoVendaTotal(o))}</div>
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 9.5, color: G.faint, marginTop: 6 }}>
                                    Custo Direto é o que entra no controle de EVM/BAC desta planilha. Preço de Venda é informativo — o que a obra cobra do cliente, incluindo encargos sobre mão de obra e margem (BDI).
                                  </div>
                                </div>

                                <div style={{ fontSize: 11, fontWeight: 800, color: G.ink, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                  <Package size={13} color={G.steel} /> Insumos de "{o.categoria}" — Previsto x Real
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: G.sub, marginBottom: 8 }}>
                                  <span style={{ width: 12, height: 12, background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, borderRadius: 2, display: "inline-block" }} />
                                  Custo Real, Forma de Pagamento e Data são editáveis — clique no ícone da carteira para lançar no Fluxo de Caixa.
                                </div>
                                <table style={{ minWidth: 980 }}>
                                  <thead>
                                    <tr>
                                      <th>Insumo</th><th style={{ width: 60 }}>Unid.</th>
                                      <th style={{ width: 100 }}>Qtd. Prevista</th><th style={{ width: 120 }}>Preço Unit. Previsto</th>
                                      <th style={{ width: 120 }}>Previsto Total</th><th style={{ width: 130 }}>Custo Real (R$)</th>
                                      <th style={{ width: 160 }}>Forma de Pagamento</th><th style={{ width: 120 }}>Data Pagamento</th>
                                      <th style={{ width: 100 }}>Fluxo de Caixa</th><th style={{ width: 50 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(o.insumos || []).map((ins, k) => {
                                      const previstoTotal = Number(ins.quantidadePrevista || 0) * Number(ins.precoUnitarioPrevisto || 0);
                                      return (
                                        <tr key={ins.id}>
                                          <td><EditCell value={ins.nome} onChange={(v) => updateInsumo(i, k, "nome", v)} /></td>
                                          <td><EditCell value={ins.unidade} onChange={(v) => updateInsumo(i, k, "unidade", v)} /></td>
                                          <td><EditCell type="number" align="right" value={ins.quantidadePrevista} onChange={(v) => updateInsumo(i, k, "quantidadePrevista", v)} /></td>
                                          <td><EditCell type="number" prefix="R$" align="right" value={ins.precoUnitarioPrevisto} onChange={(v) => updateInsumo(i, k, "precoUnitarioPrevisto", v)} /></td>
                                          <td style={{ textAlign: "right", fontWeight: 700, color: G.ink, background: "#F0F1F2" }}>{fmtR$(previstoTotal)}</td>
                                          <td><EditCell type="number" prefix="R$" align="right" value={ins.custoReal} onChange={(v) => updateInsumo(i, k, "custoReal", v)} /></td>
                                          <td><EditSelect value={ins.formaPagamento} onChange={(v) => updateInsumo(i, k, "formaPagamento", v)} options={FORMAS_PAGAMENTO.map((f) => ({ v: f, l: f }))} /></td>
                                          <td><EditCell type="date" value={ins.dataPagamento} onChange={(v) => updateInsumo(i, k, "dataPagamento", v)} /></td>
                                          <td style={{ textAlign: "center" }}>
                                            {ins.lancadoCaixa ? (
                                              <button onClick={() => desvincularInsumoCaixa(i, k)} title="Remover do Fluxo de Caixa"
                                                style={{ background: G.mintBg, color: G.mint, border: "none", borderRadius: 3, padding: "4px 8px", fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 4, margin: "0 auto" }}>
                                                <CheckCircle2 size={11} /> Lançado
                                              </button>
                                            ) : (
                                              <button onClick={() => lancarInsumoCaixa(i, k)} title="Lançar no Fluxo de Caixa" disabled={!ins.custoReal || !ins.dataPagamento}
                                                style={{ background: ins.custoReal && ins.dataPagamento ? G.steel : "#D9DDE2", color: "#fff", border: "none", borderRadius: 3, padding: "4px 8px", fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", gap: 4, margin: "0 auto", cursor: ins.custoReal && ins.dataPagamento ? "pointer" : "not-allowed" }}>
                                                <Wallet size={11} /> Lançar
                                              </button>
                                            )}
                                          </td>
                                          <td><button onClick={() => removeInsumo(i, k)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={12} /></button></td>
                                        </tr>
                                      );
                                    })}
                                    {(!o.insumos || o.insumos.length === 0) && (
                                      <tr><td colSpan={10} style={{ color: G.faint, fontStyle: "italic", fontSize: 11.5, textAlign: "center", padding: 14 }}>Nenhum insumo detalhado ainda.</td></tr>
                                    )}
                                  </tbody>
                                </table>
                                <button onClick={() => addInsumo(i)}
                                  style={{ marginTop: 8, background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                                  <Plus size={12} /> Adicionar insumo
                                </button>

                                <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px dashed ${G.grid}` }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: G.ink, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                                    <GanttChartSquare size={13} color={G.steel} /> Cronograma deste item
                                  </div>
                                  {o.iniDetalhe ? (() => {
                                    const scItem = scheduleCombinado[o.id];
                                    return (
                                      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11.5, color: G.ink, flexWrap: "wrap" }}>
                                        <span><b>{toBR(scItem?.ini)}</b> → <b>{toBR(scItem?.fim)}</b></span>
                                        <span style={{ color: G.sub }}>{o.pctDetalhe}% concluído</span>
                                        {scItem?.critico ? (
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: G.red, fontWeight: 800, fontSize: 10.5 }}><Flag size={10} /> Crítico</span>
                                        ) : <span style={{ color: G.sub, fontSize: 10.5 }}>folga {scItem?.folgaDias}d</span>}
                                        <span style={{ color: G.faint, fontSize: 10.5, fontStyle: "italic" }}>
                                          Editável (predecessoras, atraso, duração, %) na aba Cronograma — expanda "{etapaLigada?.nome}" lá.
                                        </span>
                                      </div>
                                    );
                                  })() : (
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                      <span style={{ fontSize: 11, color: G.sub }}>Hoje, o % desta linha segue o % manual da etapa "{etapaLigada?.nome}". Para detalhar o cronograma item a item, vá na aba Cronograma, expanda "{etapaLigada?.nome}" e clique "Detalhar" — ou ative rapidamente aqui:</span>
                                      <button onClick={() => ativarDetalheOrcamento(i)}
                                        style={{ background: G.steel, color: "#fff", border: "none", fontSize: 11, fontWeight: 700, padding: "7px 12px", borderRadius: 4, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
                                        <GanttChartSquare size={12} /> Detalhar cronograma
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                    <tr>
                      <td colSpan={3} style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, fontSize: 11.5, textTransform: "uppercase" }}>TOTAL GERAL</td>
                      <td style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalMaoObra)}</td>
                      <td colSpan={2} style={{ background: G.ribbonSoft }} />
                      <td style={{ background: G.ribbonSoft }} />
                      <td style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalMaterial)}</td>
                      <td style={{ background: G.ribbonSoft, color: totalAditivoMaoObra !== 0 ? G.amber : "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{totalAditivoMaoObra > 0 ? "+" : ""}{fmtR$(totalAditivoMaoObra)}</td>
                      <td style={{ background: G.ribbonSoft, color: totalAditivoMaterial !== 0 ? G.amber : "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{totalAditivoMaterial > 0 ? "+" : ""}{fmtR$(totalAditivoMaterial)}</td>
                      <td style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalOrcado)}</td>
                      <td style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalRealizado)}</td>
                      <td style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalOrcado - totalRealizado)}</td>
                      <td style={{ background: G.ribbonSoft, color: G.amber, fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtPct(totalOrcado ? totalRealizado / totalOrcado : 0)}</td>
                      <td style={{ background: G.ribbonSoft }} />
                      <td style={{ background: G.ribbonSoft, color: G.amber, fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalValorSugerido)}</td>
                      <td style={{ background: G.ribbonSoft }} />
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ padding: 10 }}>
                <button onClick={addLinhaOrcamento}
                  style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Adicionar linha de custo
                </button>
              </div>
            </Panel>

            <Panel style={{ marginTop: 14, padding: 12 }}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={orcamentoComTotal}>
                  <CartesianGrid stroke={G.grid} />
                  <XAxis dataKey="categoria" tick={{ fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1e6).toFixed(1) + "M"} />
                  <Tooltip formatter={(v) => fmtR$(v)} />
                  <Legend />
                  <Bar dataKey="maoObra" name="Mão de Obra" fill={G.steel} radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="material" name="Material" fill={G.gold} radius={[3, 3, 0, 0]} stackId="a" />
                  <Bar dataKey="realizado" name="Realizado" fill={G.amber} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel style={{ marginTop: 14 }}>
              <PanelHead icon={TrendingUp}>Curva ABC — Classificação de Custos por Relevância</PanelHead>
              <div style={{ padding: 12 }}>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={curvaABC}>
                    <CartesianGrid stroke={G.grid} />
                    <XAxis dataKey="categoria" tick={{ fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={70} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1e6).toFixed(1) + "M"} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                    <Tooltip formatter={(v, name) => (name === "% Acumulado" ? v.toFixed(1) + "%" : fmtR$(v))} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="orcado" name="Orçado (R$)" radius={[3, 3, 0, 0]}>
                      {curvaABC.map((o, i) => <Cell key={i} fill={o.classe === "A" ? G.red : o.classe === "B" ? G.amber : G.mint} />)}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey={(d) => d.pctAcumulado * 100} name="% Acumulado" stroke={G.steel} strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 16, padding: "0 13px 10px", fontSize: 10.5, color: G.sub }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, background: G.red, borderRadius: 2, display: "inline-block" }} /> Classe A — até 80% do custo acumulado</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, background: G.amber, borderRadius: 2, display: "inline-block" }} /> Classe B — 80% a 95%</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, background: G.mint, borderRadius: 2, display: "inline-block" }} /> Classe C — 95% a 100%</span>
              </div>
              <table>
                <thead><tr><th>Categoria</th><th>Orçado (R$)</th><th>% Individual</th><th>% Acumulado</th><th>Classe</th></tr></thead>
                <tbody>
                  {curvaABC.map((o, i) => (
                    <tr key={i}>
                      <td>{o.categoria}</td>
                      <td style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(o.orcado)}</td>
                      <td style={{ textAlign: "right" }}>{fmtPct(o.pctIndividual)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtPct(o.pctAcumulado)}</td>
                      <td>
                        <span style={{
                          background: o.classe === "A" ? G.redBg : o.classe === "B" ? G.goldBg : G.mintBg,
                          color: o.classe === "A" ? G.red : o.classe === "B" ? G.amberDark : G.mint,
                          fontWeight: 800, fontSize: 11, padding: "2px 10px", borderRadius: 3,
                        }}>{o.classe}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </>
        )}

        {tab === "curva" && (
          <Panel>
            <PanelHead icon={TrendingUp}>Curva S — Físico-Financeira (Linha de Base x Real)</PanelHead>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
              <CheckCircle2 size={12} color={G.mint} />
              <span><b style={{ color: G.ink }}>Planejado</b> = calculado a partir das datas e pesos do Cronograma (aba Gantt). <b style={{ color: G.ink }}>Realizado</b> = histórico real de avanço, registrado automaticamente toda vez que o % concluído de uma atividade muda. Nenhum número aqui é digitado à mão.</span>
            </div>
            <div style={{ padding: 14 }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={curvaS}>
                  <CartesianGrid stroke={G.grid} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v) => v + "%"} />
                  <Legend />
                  <Line type="monotone" dataKey="plan" name="% Planejado Acum." stroke={G.steel} strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="real" name="% Realizado Acum." stroke={G.amber} strokeWidth={3} dot={{ r: 4 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <table>
              <thead><tr><th>Mês</th><th>% Planejado</th><th>% Realizado</th><th>Desvio</th></tr></thead>
              <tbody>
                {curvaS.map((c, i) => (
                  <tr key={i}>
                    <td>{c.mes}</td><td>{c.plan}%</td><td>{c.real !== null ? c.real + "%" : "—"}</td>
                    <td style={{ fontWeight: 700, color: c.real === null ? G.faint : c.real - c.plan >= 0 ? G.mint : G.red }}>
                      {c.real !== null ? (c.real - c.plan >= 0 ? "+" : "") + (c.real - c.plan) + " p.p." : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {tab === "evm" && (
          <>
            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={Gauge}>Indicadores EVM — Earned Value Management (PMBOK)</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}`, flexWrap: "wrap" }}>
                <CheckCircle2 size={12} color={G.mint} />
                <span>Todos os valores abaixo vêm de outras abas — nada é digitado aqui. <b style={{ color: G.ink }}>BAC</b> = Orçamento (EAP) · <b style={{ color: G.ink }}>AC</b> = Realizado (EAP/Insumos) · <b style={{ color: G.ink }}>PV/EV</b> = Cronograma × BAC.</span>
              </div>
            </Panel>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="BAC — Orçamento Total" value={fmtR$(BAC)} sub={`Base ${fmtR$(orcadoBase)} + Contingência ${fmtR$(reservaContingencia)}`} accent={G.ink} />
              <KPI label="PV — Valor Planejado" value={fmtR$(PV)} sub={`Planned Value · ${fmtPct(pctPlanejadoHoje)} do BAC`} accent={G.steel} />
              <KPI label="EV — Valor Agregado" value={fmtR$(EV)} sub={`Earned Value · ${fmtPct(pctFisico)} do BAC`} accent={G.steel} />
              <KPI label="AC — Custo Real" value={fmtR$(AC)} sub="Actual Cost (realizado)" accent={G.amberDark} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="CPI — Índice de Custo" value={CPI.toFixed(2)} sub={CPI >= 1 ? "Dentro ou abaixo do orçado" : "Gastando mais do que o planejado"} accent={CPI >= 1 ? G.mint : G.red} />
              <KPI label="SPI — Índice de Prazo" value={SPI.toFixed(2)} sub={SPI >= 1 ? "No prazo ou adiantado" : "Atrasado em relação ao planejado"} accent={SPI >= 1 ? G.mint : G.red} />
              <KPI label="CV — Variação de Custo" value={fmtR$(CV)} sub={CV >= 0 ? "Economia até aqui" : "Estourou o orçado até aqui"} accent={CV >= 0 ? G.mint : G.red} />
              <KPI label="SV — Variação de Prazo" value={fmtR$(SV)} sub={SV >= 0 ? "Adiantado em valor" : "Atrasado em valor"} accent={SV >= 0 ? G.mint : G.red} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="EAC — Estimativa no Término" value={fmtR$(EAC)} sub="Estimate at Completion (custo final projetado)" accent={EAC > BAC ? G.red : G.mint} />
              <KPI label="ETC — Estimativa para Terminar" value={fmtR$(ETC)} sub="Estimate to Complete (quanto falta gastar)" accent={G.steel} />
              <KPI label="VAC — Variação no Término" value={fmtR$(VAC)} sub={VAC >= 0 ? "Projeção: terminar dentro do orçado" : "Projeção: estourar o orçado"} accent={VAC >= 0 ? G.mint : G.red} />
            </div>

            <Panel style={{ marginBottom: 14, padding: 12 }}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={[{ nome: "Hoje", BAC, EAC, PV, EV, AC }]}>
                  <CartesianGrid stroke={G.grid} />
                  <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1e6).toFixed(1) + "M"} />
                  <Tooltip formatter={(v) => fmtR$(v)} />
                  <Legend />
                  <Bar dataKey="BAC" name="BAC (orçado)" fill={G.ink} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="EAC" name="EAC (projetado)" fill={G.red} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="PV" name="PV (planejado)" fill={G.steel} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="EV" name="EV (agregado)" fill={G.mint} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="AC" name="AC (real)" fill={G.amber} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel>
              <PanelHead>Como interpretar</PanelHead>
              <div style={{ padding: 14, fontSize: 12, color: G.ink, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <b>CPI {"<"} 1</b> → cada R$1 gasto está entregando menos de R$1 de valor — a obra está custando mais do que devia para o que foi entregue.<br /><br />
                  <b>SPI {"<"} 1</b> → o valor entregue está abaixo do que o cronograma previa para esta data — a obra está atrasada em termos de valor produzido (mesma leitura do "Desvio" na Curva S, em outra unidade).
                </div>
                <div>
                  <b>EAC</b> assume que a eficiência de custo observada até agora (CPI) se repete no restante da obra — é a projeção mais usada quando o desvio já tem causa estrutural (não foi um evento isolado).<br /><br />
                  <b>VAC negativo</b> é o alerta mais sério desta aba: ao ritmo atual, a obra vai terminar acima do orçamento — quanto mais negativo, maior o estouro projetado.
                </div>
              </div>
            </Panel>
          </>
        )}

        {tab === "compras" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Itens Cadastrados" value={compras.length} accent={G.steel} />
              <KPI label="Valor Total" value={fmtR$(compras.reduce((s, c) => s + Number(c.valor || 0), 0))} accent={G.ink} />
              <KPI label="Entregues" value={compras.filter((c) => c.status === "Entregue").length} accent={G.mint} />
              <KPI label="Ameaçam o Cronograma" value={comprasComAlerta.filter((c) => c.alerta === "ameaça o cronograma").length} accent={comprasComAlerta.some((c) => c.alerta === "ameaça o cronograma") ? G.red : G.mint} />
            </div>

            {comprasComAlerta.some((c) => c.alerta) && (
              <Panel style={{ marginBottom: 14, borderLeft: `3px solid ${G.red}` }}>
                <PanelHead icon={BellRing}>Alertas — Suprimento x Cronograma</PanelHead>
                <div style={{ padding: "10px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
                  {comprasComAlerta.filter((c) => c.alerta).map((c) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, flexWrap: "wrap" }}>
                      {c.alerta === "ameaça o cronograma" ? <AlertTriangle size={14} color={G.red} /> : <Clock size={14} color={G.amberDark} />}
                      <Badge status={c.alerta === "ameaça o cronograma" ? "VENCIDO" : "Vence em breve"} />
                      <span style={{ color: G.ink, fontWeight: 600 }}>{c.item}</span>
                      <span style={{ color: G.faint }}>· necessário p/ {etapas.find((e) => e.id === c.etapaId)?.nome}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: G.sub }}>
                        Necessário em <b style={{ color: G.ink }}>{toBR(c.dataNecessaria)}</b>
                        {c.previsaoEntrega && <> · Previsão de entrega <b style={{ color: G.ink }}>{toBR(c.previsaoEntrega)}</b></>}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <Panel>
              <PanelHead icon={ShoppingCart}>Compras / Suprimentos — Vinculado ao Cronograma</PanelHead>
              <EditableLegend note='"Data Necessária" vem do início (CPM) da etapa que consome o item — não é digitada, é puxada do Cronograma. Clique em "Solicitar" pra emitir agora e calcular a previsão automaticamente pelo lead time.' />
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 170 }}>Item</th><th style={{ minWidth: 140 }}>EAP / Etapa</th><th style={{ minWidth: 140 }}>Fornecedor</th>
                    <th style={{ width: 100 }}>Solicitação</th><th style={{ width: 90 }}>Lead Time</th><th style={{ width: 110 }}>Previsão Entrega</th>
                    <th style={{ width: 110 }}>Data Necessária</th><th style={{ width: 130 }}>Status</th><th style={{ width: 110 }}>Valor (R$)</th><th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {comprasComAlerta.map((c, i) => (
                    <tr key={c.id}>
                      <td><EditCell value={c.item} onChange={(v) => updateCompra(i, "item", v)} /></td>
                      <td><EditSelect value={c.etapaId} onChange={(v) => updateCompra(i, "etapaId", v)} options={etapas.map((e) => ({ v: e.id, l: `${e.id} ${e.nome}` }))} /></td>
                      <td><EditCell value={c.fornecedor} onChange={(v) => updateCompra(i, "fornecedor", v)} /></td>
                      <td>{c.dataSolicitacao ? <span style={{ fontSize: 11 }}>{toBR(c.dataSolicitacao)}</span> : <span style={{ color: G.faint, fontSize: 10.5 }}>—</span>}</td>
                      <td><EditCell type="number" align="right" value={c.leadTimeDias} onChange={(v) => updateCompra(i, "leadTimeDias", Number(v))} /></td>
                      <td>
                        {c.dataSolicitacao ? (
                          <EditCell type="date" value={c.previsaoEntrega} onChange={(v) => updateCompra(i, "previsaoEntrega", v)} />
                        ) : <span style={{ color: G.faint, fontSize: 10.5 }}>—</span>}
                      </td>
                      <td style={{ textAlign: "center", background: "#F4F5F6", fontWeight: 700, fontSize: 11 }}>{toBR(c.dataNecessaria)}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <EditSelect value={c.status} onChange={(v) => updateCompra(i, "status", v)}
                            options={["Não solicitado", "Solicitado", "Em cotação", "Pedido emitido", "Em entrega parcial", "Entregue", "Cancelado"].map((s) => ({ v: s, l: s }))} />
                          {c.alerta && <span title={c.alerta}><AlertTriangle size={13} color={c.alerta === "ameaça o cronograma" ? G.red : G.amberDark} /></span>}
                        </div>
                      </td>
                      <td><EditCell type="number" prefix="R$" align="right" value={c.valor} onChange={(v) => updateCompra(i, "valor", v)} /></td>
                      <td style={{ display: "flex", gap: 4 }}>
                        {!c.dataSolicitacao && (
                          <button onClick={() => solicitarCompra(i)} title="Solicitar agora"
                            style={{ background: G.steel, color: "#fff", border: "none", fontSize: 10, fontWeight: 700, padding: "5px 7px", borderRadius: 4, display: "flex", alignItems: "center", gap: 3 }}>
                            <Truck size={11} />
                          </button>
                        )}
                        <button onClick={() => removeCompra(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: 10 }}>
                <button onClick={addCompra} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Adicionar item de compra
                </button>
              </div>
            </Panel>
          </>
        )}

        {tab === "mudancas" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Termos Cadastrados" value={termosAditivos.length} accent={G.steel} />
              <KPI label="Aprovados" value={termosAditivos.filter((t) => t.status === "Aprovado").length} accent={G.mint} />
              <KPI label="Pendentes de Decisão" value={termosAditivos.filter((t) => t.status === "Solicitado" || t.status === "Em Análise").length} accent={termosAditivos.some((t) => t.status === "Solicitado" || t.status === "Em Análise") ? G.amberDark : G.mint} />
              <KPI label="Valor Aprovado (impacto financeiro)" value={fmtR$(termosAditivos.filter((t) => t.aplicado).reduce((s, t) => s + Number(t.aditivoMaoObraProposto || 0) + Number(t.quantidadeAditivoProposta || 0) * Number(t.precoUnitarioAditivoProposto || 0), 0))} accent={G.ink} />
            </div>

            <Panel>
              <PanelHead icon={FileSignature}>Termos Aditivos Contratuais — Gestão de Mudanças</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
                <CheckCircle2 size={12} color={G.mint} />
                Aprovar um termo aplica o impacto financeiro (planilha) E o impacto de prazo (cronograma) juntos, na mesma ação — esse é o elo que faltava entre as duas abas. Antes de aprovado é só uma proposta; nada é alterado no orçamento ou no cronograma.
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Nº</th><th style={{ minWidth: 220 }}>Título / Motivo</th><th style={{ minWidth: 150 }}>Item Vinculado</th>
                    <th style={{ width: 130 }}>Valor Proposto</th><th style={{ width: 100 }}>Impacto Prazo</th><th style={{ width: 120 }}>Status</th><th style={{ width: 170 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {termosAditivos.map((t, i) => {
                    const item = orcamento.find((o) => o.id === t.orcamentoItemId);
                    const valorProposto = Number(t.aditivoMaoObraProposto || 0) + Number(t.quantidadeAditivoProposta || 0) * Number(t.precoUnitarioAditivoProposto || 0);
                    const podeDecidir = !t.aplicado && (t.status === "Solicitado" || t.status === "Em Análise");
                    return (
                      <React.Fragment key={t.id}>
                        <tr>
                          <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: G.sub, background: "#F4F5F6", textAlign: "center" }}>{t.numero}</td>
                          <td>
                            <EditCell value={t.titulo} onChange={(v) => updateTermoAditivo(i, "titulo", v)} />
                            <div style={{ fontSize: 10, color: G.faint, marginTop: 2 }}>Solicitado por {t.solicitadoPor} em {toBR(t.data)}{t.aprovadoPor ? ` · decidido por ${t.aprovadoPor} em ${toBR(t.dataDecisao)}` : ""}</div>
                          </td>
                          <td>
                            {t.aplicado ? (
                              <span style={{ fontSize: 11.5, color: G.ink }}>{item?.etapaId} · {item?.categoria}</span>
                            ) : (
                              <EditSelect value={t.orcamentoItemId} onChange={(v) => updateTermoAditivo(i, "orcamentoItemId", v)}
                                options={orcamento.map((o) => ({ v: o.id, l: `${o.etapaId} · ${o.categoria}` }))} />
                            )}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: G.ink, background: "#F4F5F6", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(valorProposto)}</td>
                          <td style={{ textAlign: "center", background: "#F4F5F6", fontWeight: 700, color: t.impactoPrazoDias ? G.amberDark : G.faint }}>{t.impactoPrazoDias ? `+${t.impactoPrazoDias}du` : "—"}</td>
                          <td>
                            <span style={{
                              background: t.status === "Aprovado" ? G.mintBg : t.status === "Rejeitado" ? G.redBg : G.goldBg,
                              color: t.status === "Aprovado" ? G.mint : t.status === "Rejeitado" ? G.red : G.amberDark,
                              fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 9, whiteSpace: "nowrap",
                            }}>{t.status}{t.aplicado ? " ✓" : ""}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                              {podeDecidir && (
                                <>
                                  <button onClick={() => aprovarEAplicarTermoAditivo(i)}
                                    style={{ background: G.mint, color: "#fff", border: "none", borderRadius: 4, padding: "5px 8px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                                    Aprovar e Aplicar
                                  </button>
                                  <button onClick={() => rejeitarTermoAditivo(i)}
                                    style={{ background: "none", border: `1px solid ${G.grid}`, color: G.sub, borderRadius: 4, padding: "5px 8px", fontSize: 10, fontWeight: 700 }}>
                                    Rejeitar
                                  </button>
                                </>
                              )}
                              {!t.aplicado && (
                                <button onClick={() => removeTermoAditivo(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {!t.aplicado && (t.status === "Solicitado" || t.status === "Em Análise") && (
                          <tr>
                            <td></td>
                            <td colSpan={6} style={{ background: "#FAFBFC", padding: "10px 14px" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 110px 90px", gap: 10, alignItems: "end" }}>
                                <div>
                                  <label style={{ fontSize: 10, color: G.sub }}>Motivo / Justificativa</label>
                                  <EditCell value={t.motivo} onChange={(v) => updateTermoAditivo(i, "motivo", v)} placeholder="Descreva o motivo técnico/contratual deste aditivo..." />
                                </div>
                                <div><label style={{ fontSize: 10, color: G.sub }}>Aditivo M.Obra (R$)</label><EditCell type="number" prefix="R$" align="right" value={t.aditivoMaoObraProposto} onChange={(v) => updateTermoAditivo(i, "aditivoMaoObraProposto", v)} /></div>
                                <div><label style={{ fontSize: 10, color: G.sub }}>Qtd. Material Adicional</label><EditCell type="number" align="right" value={t.quantidadeAditivoProposta} onChange={(v) => updateTermoAditivo(i, "quantidadeAditivoProposta", v)} /></div>
                                <div><label style={{ fontSize: 10, color: G.sub }}>Preço Unit. (R$)</label><EditCell type="number" prefix="R$" align="right" value={t.precoUnitarioAditivoProposto} onChange={(v) => updateTermoAditivo(i, "precoUnitarioAditivoProposto", v)} /></div>
                                <div><label style={{ fontSize: 10, color: G.sub }}>Prazo (d.úteis)</label><EditCell type="number" align="right" value={t.impactoPrazoDias} onChange={(v) => updateTermoAditivo(i, "impactoPrazoDias", Number(v))} /></div>
                              </div>
                              <div style={{ fontSize: 9.5, color: G.faint, marginTop: 6 }}>
                                Status: <EditSelect value={t.status} onChange={(v) => updateTermoAditivo(i, "status", v)} options={["Solicitado", "Em Análise"].map((s) => ({ v: s, l: s }))} /> — mude pra "Em Análise" enquanto avalia; aprovação de verdade só pelo botão "Aprovar e Aplicar" acima (isso grava quem decidiu e quando).
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: 10 }}>
                <button onClick={addTermoAditivo} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Novo Termo Aditivo
                </button>
              </div>
            </Panel>
          </>
        )}

        {tab === "diario" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Dias Registrados" value={diario.length} accent={G.steel} />
              <KPI label="Equipe Média no Período" value={Math.round(diario.reduce((s, d) => s + d.equipe, 0) / diario.length)} accent={G.steel} />
              <KPI label="Produtividade Média" value={fmtPct(prodMedia)} accent={prodMedia >= 0.9 ? G.mint : G.amberDark} />
              <KPI label="Dias com Ocorrência" value={diario.filter((d) => d.ocorrencias && d.ocorrencias !== "Nenhuma").length} accent={G.red} />
            </div>
            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={BookOpen}>Novo Registro de Diário de Obra (RDO)</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
                <span style={{ width: 13, height: 13, background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, borderRadius: 2, display: "inline-block" }} />
                <span>Todos os campos abaixo são pontos de lançamento manual do encarregado/engenheiro residente.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "120px 100px 70px 80px 1.4fr", gap: 8, padding: "13px 13px 6px" }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Data</label><EditCell type="date" value={novo.data} onChange={(v) => setNovo({ ...novo, data: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Clima</label>
                  <select style={{ width: "100%", background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700 }} value={novo.clima} onChange={(e) => setNovo({ ...novo, clima: e.target.value })}>
                    <option>Ensolarado</option><option>Nublado</option><option>Chuva leve</option><option>Chuva forte</option>
                  </select>
                </div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Temp.</label><EditCell value={novo.temp} onChange={(v) => setNovo({ ...novo, temp: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Equipe</label><EditCell type="number" value={novo.equipe} onChange={(v) => setNovo({ ...novo, equipe: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Equipamentos em operação</label><EditCell value={novo.equipamentos} onChange={(v) => setNovo({ ...novo, equipamentos: v })} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 80px auto", gap: 8, padding: "6px 13px 13px", alignItems: "end" }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Serviços executados</label><EditCell value={novo.servicos} onChange={(v) => setNovo({ ...novo, servicos: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Ocorrências / problemas</label><EditCell value={novo.ocorrencias} onChange={(v) => setNovo({ ...novo, ocorrencias: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Visitas / fiscalização</label><EditCell value={novo.visitas} onChange={(v) => setNovo({ ...novo, visitas: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Produtiv. (%)</label><EditCell type="number" value={novo.produtividade} onChange={(v) => setNovo({ ...novo, produtividade: v })} /></div>
                <button onClick={addDiario} style={{ background: G.steel, color: "#fff", border: "none", padding: "8px 14px", borderRadius: 3, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, height: 33 }}>
                  <Plus size={13} /> Adicionar
                </button>
              </div>
              <div style={{ padding: "0 13px 13px" }}>
                <label style={{ fontSize: 10, color: G.sub }}>Observações gerais</label>
                <EditCell value={novo.observacoes} onChange={(v) => setNovo({ ...novo, observacoes: v })} />
              </div>
            </Panel>
            <Panel>
              <PanelHead>Histórico de RDOs (persistido localmente)</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
                <Eye size={12} color={G.steel} /> Clique em qualquer linha para abrir o detalhe completo do dia, incluindo as fotos vinculadas.
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Data</th><th>Clima</th><th>Equipe</th><th>Equipamentos</th>
                    <th>Serviços executados</th><th>Ocorrências</th><th>Visitas</th><th>Produtividade</th><th>Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {diario.slice().reverse().map((r, i) => {
                    const fotosDia = fotosDoDia(r.data);
                    return (
                    <tr key={i} onClick={() => setDiarioSelecionado(r)} style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#EAF2FC")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", fontWeight: 700, color: G.steel }}>{r.data}</td>
                      <td>{r.clima}{r.temp && <div style={{ color: G.faint, fontSize: 10 }}>{r.temp}</div>}</td>
                      <td>{r.equipe}</td>
                      <td style={{ color: G.sub, fontSize: 11 }}>{r.equipamentos || "—"}</td>
                      <td>
                        {r.servicos}
                        {r.observacoes && <div style={{ color: G.faint, fontStyle: "italic", fontSize: 10.5, marginTop: 2 }}>{r.observacoes}</div>}
                      </td>
                      <td style={{ color: r.ocorrencias && r.ocorrencias !== "Nenhuma" ? G.red : G.faint, fontWeight: r.ocorrencias && r.ocorrencias !== "Nenhuma" ? 700 : 400 }}>
                        {r.ocorrencias || "Nenhuma"}
                      </td>
                      <td style={{ color: G.sub, fontSize: 11 }}>{r.visitas || "—"}</td>
                      <td style={{ fontWeight: 700, color: r.produtividade >= 0.9 ? G.mint : r.produtividade >= 0.8 ? G.amberDark : G.red }}>
                        {(r.produtividade * 100).toFixed(0)}%
                      </td>
                      <td>
                        {fotosDia.length > 0 ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, color: G.steel, fontWeight: 700, fontSize: 11 }}>
                            <ImageIcon size={12} /> {fotosDia.length}
                          </span>
                        ) : <span style={{ color: G.faint }}>—</span>}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </>
        )}

        {tab === "caixa" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button onClick={exportarCaixaCSV}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: G.ink, border: `1px solid ${G.grid}`, padding: "7px 13px", borderRadius: 4, fontWeight: 700, fontSize: 11.5 }}>
                <FileSpreadsheet size={13} /> Exportar Extrato (.csv — pronto para sistema contábil/ERP)
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Saldo Atual" value={fmtR$(saldoAtual)} accent={saldoAtual >= 0 ? G.mint : G.red} />
              <KPI label="Total Entradas" value={fmtR$(totalEntradas)} accent={G.steel} sub={<span style={{ display: "flex", alignItems: "center", gap: 3 }}><ArrowUpCircle size={11} /> no período</span>} />
              <KPI label="Total Saídas" value={fmtR$(totalSaidas)} accent={G.amberDark} sub={<span style={{ display: "flex", alignItems: "center", gap: 3 }}><ArrowDownCircle size={11} /> no período</span>} />
              <KPI label="Alertas Ativos" value={alertasCaixa.length} accent={alertasCaixa.length ? G.red : G.mint} />
            </div>

            {alertasCaixa.length > 0 && (
              <Panel style={{ marginBottom: 14, borderLeft: `3px solid ${G.red}` }}>
                <PanelHead icon={BellRing}>Alertas de Vencimento</PanelHead>
                <div style={{ padding: "10px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
                  {alertasCaixa.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12 }}>
                      {a.alerta === "VENCIDO" ? <AlertTriangle size={14} color={G.red} /> : <Clock size={14} color={G.amberDark} />}
                      <Badge status={a.alerta} />
                      <span style={{ color: G.ink, fontWeight: 600 }}>{a.descricao}</span>
                      <span style={{ color: G.faint }}>· {a.categoria}</span>
                      <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: G.ink }}>{fmtR$(a.valor)}</span>
                      <span style={{ color: G.sub, fontSize: 11 }}>venc. {new Date(a.vencimento).toLocaleDateString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={Wallet}>Novo Lançamento</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
                <span style={{ width: 13, height: 13, background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, borderRadius: 2, display: "inline-block" }} />
                <span>Lance entradas (recebimentos) e saídas (pagamentos) — alertas são calculados automaticamente pela data de vencimento.</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "100px 120px 140px 1.4fr 120px 120px 110px auto", gap: 8, padding: 13, alignItems: "end" }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Tipo</label>
                  <select style={{ width: "100%", background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700 }} value={novoCaixa.tipo} onChange={(e) => setNovoCaixa({ ...novoCaixa, tipo: e.target.value })}>
                    <option>Saída</option><option>Entrada</option>
                  </select>
                </div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Data</label><EditCell type="date" value={novoCaixa.data} onChange={(v) => setNovoCaixa({ ...novoCaixa, data: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Categoria</label><EditCell value={novoCaixa.categoria} onChange={(v) => setNovoCaixa({ ...novoCaixa, categoria: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Descrição</label><EditCell value={novoCaixa.descricao} onChange={(v) => setNovoCaixa({ ...novoCaixa, descricao: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Valor (R$)</label><EditCell type="number" align="right" value={novoCaixa.valor} onChange={(v) => setNovoCaixa({ ...novoCaixa, valor: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Vencimento</label><EditCell type="date" value={novoCaixa.vencimento} onChange={(v) => setNovoCaixa({ ...novoCaixa, vencimento: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Status</label>
                  <select style={{ width: "100%", background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700 }} value={novoCaixa.status} onChange={(e) => setNovoCaixa({ ...novoCaixa, status: e.target.value })}>
                    <option>Pendente</option><option>Pago</option><option>Recebido</option>
                  </select>
                </div>
                <button onClick={addCaixa} style={{ background: G.steel, color: "#fff", border: "none", padding: "8px 14px", borderRadius: 3, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, height: 33 }}>
                  <Plus size={13} /> Lançar
                </button>
              </div>
            </Panel>

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead>Extrato — Saldo Acumulado (saldo inicial: {fmtR$(dadosObra.saldoInicialCaixa)})</PanelHead>
              <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Vencimento</th><th>Status</th><th>Valor</th><th>Saldo</th><th></th></tr></thead>
                <tbody>
                  {caixaComSaldo.map((c) => {
                    const al = alertaCaixa(c);
                    return (
                      <tr key={c.id}>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>{new Date(c.data).toLocaleDateString("pt-BR")}</td>
                        <td>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 700, color: c.tipo === "Entrada" ? G.mint : G.red }}>
                            {c.tipo === "Entrada" ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />} {c.tipo}
                          </span>
                        </td>
                        <td>{c.categoria}</td>
                        <td>{c.descricao}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{c.vencimento ? new Date(c.vencimento).toLocaleDateString("pt-BR") : "—"}</td>
                        <td>
                          <select value={c.status} onChange={(e) => updateCaixaStatus(c.id, e.target.value)}
                            style={{ background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700, fontSize: 11, borderRadius: 3, padding: "2px 4px" }}>
                            <option>Pendente</option><option>Pago</option><option>Recebido</option>
                          </select>
                          {al && <span style={{ marginLeft: 6 }}><Badge status={al} /></span>}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: c.tipo === "Entrada" ? G.mint : G.red, fontFamily: "'JetBrains Mono', monospace" }}>
                          {c.tipo === "Entrada" ? "+" : "−"}{fmtR$(c.valor)}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", background: "#F4F5F6" }}>{fmtR$(c.saldo)}</td>
                        <td>
                          <button onClick={() => removeCaixa(c.id)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>

            <Panel style={{ padding: 12 }}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={caixaPorCategoria}>
                  <CartesianGrid stroke={G.grid} />
                  <XAxis dataKey="categoria" tick={{ fontSize: 9 }} interval={0} angle={-18} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                  <Tooltip formatter={(v) => fmtR$(v)} />
                  <Legend />
                  <Bar dataKey="entrada" name="Entradas" fill={G.mint} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="saida" name="Saídas" fill={G.red} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </>
        )}

        {tab === "fotos" && (
          <>
            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={Camera}>Nova Foto</PanelHead>
              <EditableLegend note="Envie uma imagem do canteiro — ela é vinculada à data e fica disponível também no detalhe do Diário de Obra." />
              <div style={{ display: "grid", gridTemplateColumns: "150px 1.4fr 220px auto", gap: 8, padding: 13, alignItems: "end" }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Data</label><EditCell type="date" value={novaFoto.data} onChange={(v) => setNovaFoto({ ...novaFoto, data: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Legenda</label><EditCell value={novaFoto.legenda} onChange={(v) => setNovaFoto({ ...novaFoto, legenda: v })} placeholder="Ex.: Concretagem da laje térrea" /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Etapa / EAP relacionada</label>
                  <EditSelect value={novaFoto.etapaId} onChange={(v) => setNovaFoto({ ...novaFoto, etapaId: v })} options={etapas.map((e) => ({ v: e.id, l: `${e.id} ${e.nome}` }))} />
                </div>
                <button onClick={addFoto} disabled={!novaFoto.preview || !novaFoto.legenda}
                  style={{ background: novaFoto.preview ? G.steel : "#B7C2CC", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 3, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, height: 33 }}>
                  <Plus size={13} /> Adicionar
                </button>
              </div>
              <div style={{ padding: "0 13px 13px" }}>
                {novaFoto.preview ? (
                  <div style={{ position: "relative", width: 200 }}>
                    <img src={novaFoto.preview} alt="preview" style={{ width: 200, height: 130, objectFit: "cover", borderRadius: 4, border: `1px solid ${G.grid}` }} />
                    <button onClick={() => setNovaFoto({ ...novaFoto, preview: null })}
                      style={{ position: "absolute", top: 4, right: 4, background: "rgba(23,27,33,0.7)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, width: 200, height: 90, border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, borderRadius: 4, cursor: "pointer", fontSize: 11, background: EDIT_BG }}>
                    <Upload size={16} />
                    Escolher imagem
                    <input type="file" accept="image/*" onChange={handleFotoUpload} style={{ display: "none" }} />
                  </label>
                )}
              </div>
            </Panel>

            {fotosPorMes.length === 0 ? (
              <Panel style={{ padding: 30, textAlign: "center", color: G.faint }}>Nenhuma foto cadastrada ainda.</Panel>
            ) : fotosPorMes.map(([mes, lista]) => (
              <Panel key={mes} style={{ marginBottom: 14 }}>
                <PanelHead icon={ImageIcon}>{mesLabel(mes)} <span style={{ color: G.faint, fontWeight: 500, marginLeft: 6, textTransform: "none" }}>({lista.length} foto{lista.length > 1 ? "s" : ""})</span></PanelHead>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, padding: 13 }}>
                  {lista.map((f) => (
                    <div key={f.id} style={{ position: "relative" }}>
                      <img src={f.url} alt={f.legenda} onClick={() => setFotoAmpliada(f)}
                        style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 4, border: `1px solid ${G.grid}`, cursor: "pointer" }} />
                      <div style={{ fontSize: 10.5, color: G.ink, marginTop: 4, fontWeight: 600, lineHeight: 1.25 }}>{f.legenda}</div>
                      <div style={{ fontSize: 9.5, color: G.faint, display: "flex", justifyContent: "space-between" }}>
                        <span>{toBR(f.data)}</span>
                        <span>{etapas.find((e) => e.id === f.etapaId)?.id}</span>
                      </div>
                      <button onClick={() => removeFoto(f.id)} title="Remover"
                        style={{ position: "absolute", top: 4, right: 4, background: "rgba(23,27,33,0.65)", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </>
        )}
        {tab === "medicaoDono" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Total Medido" value={fmtR$(totalMedidoDono)} accent={G.steel} />
              <KPI label="Retenção Acumulada" value={fmtR$(totalRetidoDono)} accent={G.amberDark} />
              <KPI label="Líquido a Receber/Recebido" value={fmtR$(totalLiquidoDono)} accent={G.mint} />
              <KPI label="% do Contrato Medido" value={fmtPct(pctContratoMedido)} sub={`Contrato atual: ${fmtR$(valorContratoAtual)}${totalAditivos !== 0 ? ` (orig. ${fmtR$(dadosObra.valorContrato)})` : ""}`} accent={G.ink} />
            </div>
            <Panel style={{ marginBottom: 14, borderLeft: `3px solid ${G.amber}` }}>
              <PanelHead icon={TrendingUp}>Sugestão de Medição — Baseada no Cronograma</PanelHead>
              <div style={{ padding: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
                <div>
                  <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700 }}>% Físico do Cronograma</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: G.steel, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPct(pctFisico)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700 }}>Valor Acumulado Esperado</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: G.ink, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(valorAcumuladoEsperado)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700 }}>Já Medido (acumulado)</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: G.ink, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalMedidoDono)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700 }}>Valor Sugerido Próxima Medição</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: G.amberDark, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(valorSugeridoMedicaoDono)}</div>
                </div>
                <button onClick={usarValorSugerido}
                  style={{ marginLeft: "auto", background: G.amber, color: "#fff", border: "none", padding: "9px 16px", borderRadius: 4, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <ClipboardCheck size={14} /> Usar valor sugerido
                </button>
              </div>
              <div style={{ padding: "0 14px 12px", fontSize: 10.5, color: G.sub }}>
                Cálculo: % físico acumulado do cronograma × valor do contrato, menos o que já foi medido — é o avanço físico ainda não faturado.
              </div>
            </Panel>

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={ClipboardCheck}>Nova Medição — Dono da Obra (faturamento ao cliente)</PanelHead>
              <EditableLegend note="Cada medição lançada aqui é o que será faturado ao cliente, descontando a retenção contratual." />
              <div style={{ display: "grid", gridTemplateColumns: "110px 130px 150px 110px 120px auto", gap: 8, padding: "13px 13px 4px", alignItems: "end" }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Período</label><EditCell value={novaMedicaoDono.periodo} onChange={(v) => setNovaMedicaoDono({ ...novaMedicaoDono, periodo: v })} placeholder="jul/26" /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Data</label><EditCell type="date" value={novaMedicaoDono.data} onChange={(v) => setNovaMedicaoDono({ ...novaMedicaoDono, data: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Valor Medido (R$)</label><EditCell type="number" prefix="R$" align="right" value={novaMedicaoDono.valorMedido} onChange={(v) => setNovaMedicaoDono({ ...novaMedicaoDono, valorMedido: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Retenção (%)</label><EditCell type="number" align="right" value={novaMedicaoDono.retencaoPct} onChange={(v) => setNovaMedicaoDono({ ...novaMedicaoDono, retencaoPct: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Status</label>
                  <select style={{ width: "100%", background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700 }} value={novaMedicaoDono.status} onChange={(e) => setNovaMedicaoDono({ ...novaMedicaoDono, status: e.target.value })}>
                    <option>Pendente</option><option>Aprovada</option><option>Faturada</option><option>Paga</option>
                  </select>
                </div>
                <button onClick={addMedicaoDono} style={{ background: G.steel, color: "#fff", border: "none", padding: "8px 14px", borderRadius: 3, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, height: 33 }}>
                  <Plus size={13} /> Lançar
                </button>
              </div>
              <div style={{ padding: "0 13px 13px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: G.sub, cursor: "pointer" }}>
                  <input type="checkbox" checked={novaMedicaoDono.lancarCaixa} onChange={(e) => setNovaMedicaoDono({ ...novaMedicaoDono, lancarCaixa: e.target.checked })}
                    style={{ width: 14, height: 14, accentColor: G.steel, cursor: "pointer" }} />
                  Lançar também como Entrada no Fluxo de Caixa (valor líquido, vencimento em 30 dias)
                </label>
              </div>
            </Panel>
            <Panel style={{ marginBottom: 14 }}>
              <PanelHead>Histórico de Medições — Cliente</PanelHead>
              <table>
                <thead><tr><th>Nº</th><th>Período</th><th>Data</th><th>Valor Medido</th><th>Retenção (%)</th><th>Valor Retido</th><th>Valor Líquido</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {medicoesDono.map((m) => {
                    const { retido, liquido } = medicaoDonoCalc(m);
                    return (
                      <tr key={m.id}>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{m.numero}</td>
                        <td>{m.periodo}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{new Date(m.data).toLocaleDateString("pt-BR")}</td>
                        <td style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(m.valorMedido)}</td>
                        <td style={{ textAlign: "right" }}>{m.retencaoPct}%</td>
                        <td style={{ textAlign: "right", color: G.amberDark, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(retido)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: G.mint, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(liquido)}</td>
                        <td>
                          <select value={m.status} onChange={(e) => updateMedicaoDonoStatus(m.id, e.target.value)}
                            style={{ background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700, fontSize: 11, borderRadius: 3, padding: "2px 4px" }}>
                            <option>Pendente</option><option>Aprovada</option><option>Faturada</option><option>Paga</option>
                          </select>
                        </td>
                        <td><button onClick={() => removeMedicaoDono(m.id)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={3} style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, fontSize: 11.5, textTransform: "uppercase" }}>TOTAL</td>
                    <td style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalMedidoDono)}</td>
                    <td style={{ background: G.ribbonSoft }} />
                    <td style={{ background: G.ribbonSoft, color: "#fff", fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalRetidoDono)}</td>
                    <td style={{ background: G.ribbonSoft, color: G.amber, fontWeight: 800, textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalLiquidoDono)}</td>
                    <td colSpan={2} style={{ background: G.ribbonSoft }} />
                  </tr>
                </tbody>
              </table>
            </Panel>
            <Panel style={{ padding: 12 }}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={medicoesDono}>
                  <CartesianGrid stroke={G.grid} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1e6).toFixed(1) + "M"} />
                  <Tooltip formatter={(v) => fmtR$(v)} />
                  <Bar dataKey="valorMedido" name="Valor Medido" fill={G.steel} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </>
        )}

        {tab === "medicaoEmp" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Total Contratado" value={fmtR$(empreiteiros.reduce((s, e) => s + Number(e.valorContratado || 0), 0))} accent={G.ink} />
              <KPI label="Total Medido (Empreiteiros)" value={fmtR$(totalMedidoEmp)} accent={G.steel} />
              <KPI label="Retenção Acumulada" value={fmtR$(totalRetidoEmp)} accent={G.amberDark} />
              <KPI label="Líquido a Pagar/Pago" value={fmtR$(totalLiquidoEmp)} accent={G.mint} />
            </div>

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={HardHat}>Contratos com Empreiteiros / Subcontratadas</PanelHead>
              <EditableLegend note="O valor contratado aqui define o saldo de cada empreiteiro nas medições abaixo." />
              <table>
                <thead><tr><th>Empreiteiro</th><th>Serviço</th><th>Valor Contratado (R$)</th><th></th></tr></thead>
                <tbody>
                  {empreiteiros.map((e, i) => (
                    <tr key={i}>
                      <td><EditCell value={e.nome} onChange={(v) => updateEmpreiteiro(i, "nome", v)} /></td>
                      <td><EditCell value={e.servico} onChange={(v) => updateEmpreiteiro(i, "servico", v)} /></td>
                      <td><EditCell type="number" prefix="R$" align="right" value={e.valorContratado} onChange={(v) => updateEmpreiteiro(i, "valorContratado", v)} /></td>
                      <td><button onClick={() => removeEmpreiteiro(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: 10 }}>
                <button onClick={addEmpreiteiro} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Adicionar empreiteiro
                </button>
              </div>
            </Panel>

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={HardHat}>Nova Medição — Empreiteiro / Subcontratada</PanelHead>
              <EditableLegend note="Cada medição lançada aqui é o que será pago ao empreiteiro, descontando a retenção contratual dele." />
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.3fr 110px 130px 100px 120px auto", gap: 8, padding: 13, alignItems: "end" }}>
                <div><label style={{ fontSize: 10, color: G.sub }}>Empreiteiro</label>
                  <EditSelect value={novaMedicaoEmp.empreiteiro} onChange={(v) => setNovaMedicaoEmp({ ...novaMedicaoEmp, empreiteiro: v })}
                    options={[{ v: "", l: "Selecione..." }, ...empreiteiros.map((e) => ({ v: e.nome, l: e.nome }))]} />
                </div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Etapa / EAP</label>
                  <EditSelect value={novaMedicaoEmp.etapaId} onChange={(v) => setNovaMedicaoEmp({ ...novaMedicaoEmp, etapaId: v })} options={etapas.map((e) => ({ v: e.id, l: `${e.id} ${e.nome}` }))} />
                </div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Período</label><EditCell value={novaMedicaoEmp.periodo} onChange={(v) => setNovaMedicaoEmp({ ...novaMedicaoEmp, periodo: v })} placeholder="jul/26" /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Valor Medido (R$)</label><EditCell type="number" prefix="R$" align="right" value={novaMedicaoEmp.valorMedido} onChange={(v) => setNovaMedicaoEmp({ ...novaMedicaoEmp, valorMedido: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Retenção (%)</label><EditCell type="number" align="right" value={novaMedicaoEmp.retencaoPct} onChange={(v) => setNovaMedicaoEmp({ ...novaMedicaoEmp, retencaoPct: v })} /></div>
                <div><label style={{ fontSize: 10, color: G.sub }}>Status</label>
                  <select style={{ width: "100%", background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700 }} value={novaMedicaoEmp.status} onChange={(e) => setNovaMedicaoEmp({ ...novaMedicaoEmp, status: e.target.value })}>
                    <option>Pendente</option><option>Aprovada</option><option>Paga</option>
                  </select>
                </div>
                <button onClick={addMedicaoEmp} style={{ background: G.steel, color: "#fff", border: "none", padding: "8px 14px", borderRadius: 3, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, height: 33 }}>
                  <Plus size={13} /> Lançar
                </button>
              </div>
            </Panel>

            {medicaoPorEmpreiteiro.map((res) => {
              const medicoesDoEmpreiteiro = medicoesEmp.filter((m) => m.empreiteiro === res.empreiteiro);
              return (
                <Panel key={res.empreiteiro} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", borderBottom: `1px solid ${G.grid}`, background: "#FAFBFC", flexWrap: "wrap", gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: G.ink, display: "flex", alignItems: "center", gap: 6 }}><HardHat size={13} color={G.steel} /> {res.empreiteiro}</span>
                    <div style={{ display: "flex", gap: 18, fontSize: 11 }}>
                      <span>Contratado: <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(res.contratado)}</b></span>
                      <span>Medido: <b style={{ fontFamily: "'JetBrains Mono', monospace", color: G.steel }}>{fmtR$(res.medido)}</b></span>
                      <span>Saldo: <b style={{ fontFamily: "'JetBrains Mono', monospace", color: res.saldo >= 0 ? G.mint : G.red }}>{fmtR$(res.saldo)}</b></span>
                      <span>% Consumido: <b style={{ color: res.pctConsumido > 0.9 ? G.red : res.pctConsumido > 0.6 ? G.amberDark : G.mint }}>{fmtPct(res.pctConsumido)}</b></span>
                    </div>
                  </div>
                  <div style={{ padding: "8px 13px 0" }}>
                    <div style={{ height: 7, background: G.grid, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, res.pctConsumido * 100)}%`, background: res.pctConsumido > 0.9 ? G.red : res.pctConsumido > 0.6 ? G.amber : G.mint }} />
                    </div>
                  </div>
                  {medicoesDoEmpreiteiro.length === 0 ? (
                    <div style={{ padding: 16, color: G.faint, fontSize: 12, fontStyle: "italic" }}>Nenhuma medição lançada ainda para este empreiteiro.</div>
                  ) : (
                    <table>
                      <thead><tr><th>Nº</th><th>Etapa</th><th>Período</th><th>Valor Medido</th><th>Retenção</th><th>Valor Líquido</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {medicoesDoEmpreiteiro.map((m) => {
                          const retido = Number(m.valorMedido || 0) * (Number(m.retencaoPct || 0) / 100);
                          const liquido = Number(m.valorMedido || 0) - retido;
                          return (
                            <tr key={m.id}>
                              <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{m.numero}</td>
                              <td style={{ color: G.sub, fontSize: 11 }}>{etapas.find((e) => e.id === m.etapaId)?.id} {etapas.find((e) => e.id === m.etapaId)?.nome}</td>
                              <td>{m.periodo}</td>
                              <td style={{ textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(m.valorMedido)}</td>
                              <td style={{ textAlign: "right", color: G.amberDark }}>{m.retencaoPct}% · {fmtR$(retido)}</td>
                              <td style={{ textAlign: "right", fontWeight: 700, color: G.mint, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(liquido)}</td>
                              <td>
                                <select value={m.status} onChange={(e) => updateMedicaoEmpStatus(m.id, e.target.value)}
                                  style={{ background: EDIT_BG, border: `1px solid ${EDIT_BORDER}`, color: EDIT_TEXT, fontWeight: 700, fontSize: 11, borderRadius: 3, padding: "2px 4px" }}>
                                  <option>Pendente</option><option>Aprovada</option><option>Paga</option>
                                </select>
                              </td>
                              <td><button onClick={() => removeMedicaoEmp(m.id)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </Panel>
              );
            })}

            <Panel style={{ padding: 12 }}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={medicaoPorEmpreiteiro}>
                  <CartesianGrid stroke={G.grid} />
                  <XAxis dataKey="empreiteiro" tick={{ fontSize: 9 }} interval={0} angle={-12} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                  <Tooltip formatter={(v) => fmtR$(v)} />
                  <Legend />
                  <Bar dataKey="contratado" name="Contratado" fill={G.ink} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="medido" name="Medido" fill={G.steel} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="retido" name="Retido" fill={G.amber} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </>
        )}

        {tab === "qsms" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Panel>
              <PanelHead icon={ShieldCheck}>Checklist de Normas Regulamentadoras</PanelHead>
              <EditableLegend note="Status de cada NR é o ponto editável." />
              <table>
                <thead><tr><th>NR</th><th>Descrição</th><th>Status</th></tr></thead>
                <tbody>
                  {nrs.map((n, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{n.nr}</td>
                      <td>{n.desc}</td>
                      <td>
                        <EditSelect value={n.status} onChange={(v) => updateNr(i, v)}
                          options={[{ v: "Conforme", l: "Conforme" }, { v: "Em adequação", l: "Em adequação" }, { v: "Não conforme", l: "Não conforme" }, { v: "Não aplicável", l: "Não aplicável" }]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel>
              <PanelHead icon={CheckCircle2}>Documentação Legal — com Alerta de Vencimento</PanelHead>
              <EditableLegend note="Status e validade são editáveis; o alerta recalcula sozinho." />
              <table>
                <thead><tr><th>Documento</th><th>Validade</th><th>Status</th><th>Alerta</th></tr></thead>
                <tbody>
                  {docs.map((d, i) => {
                    const al = alertaValidade(d.validade);
                    return (
                      <tr key={i}>
                        <td>{d.doc}</td>
                        <td><EditCell type="date" value={d.validade || ""} onChange={(v) => updateDoc(i, "validade", v)} /></td>
                        <td>
                          <EditSelect value={d.status} onChange={(v) => updateDoc(i, "status", v)}
                            options={[{ v: "Pendente", l: "Pendente" }, { v: "Em andamento", l: "Em andamento" }, { v: "Concluído", l: "Concluído" }, { v: "Vencido", l: "Vencido" }]} />
                        </td>
                        <td>
                          {al ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: statusTone(al).c }}>
                              {al === "VENCIDO" && <AlertTriangle size={12} />}
                              {al === "OK" && <CheckCircle2 size={12} />}
                              {al === "Vence em breve" && <Clock size={12} />}
                              {al}
                            </span>
                          ) : <span style={{ color: G.faint }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </div>
        )}

        {/* ── SEGURANÇA — Indicadores e Registro de Acidentes ─────────────── */}
        {tab === "qsms" && (
          <div style={{ marginTop: 14 }}>
            {/* KPIs de Segurança */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 14 }}>
              <div style={{ background: "#fff", border: `3px solid ${indicadoresSeguranca.diasSemAcidente >= 30 ? G.mint : G.amberDark}`, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 9.5, color: G.faint, textTransform: "uppercase", fontWeight: 700 }}>Dias sem Acidente c/ Afastamento</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: indicadoresSeguranca.diasSemAcidente >= 30 ? G.mint : G.amberDark }}>{indicadoresSeguranca.diasSemAcidente}</div>
                <div style={{ fontSize: 9.5, color: G.sub }}>dias consecutivos</div>
              </div>
              <KPI label="Taxa de Frequência (TF)" value={indicadoresSeguranca.TF !== null ? indicadoresSeguranca.TF.toFixed(2) : "—"} sub="acidentes c/ afast. × 10⁶ / HHT" accent={indicadoresSeguranca.TF === null ? G.faint : indicadoresSeguranca.TF > 5 ? G.red : G.mint} />
              <KPI label="Taxa de Gravidade (TG)" value={indicadoresSeguranca.TG !== null ? indicadoresSeguranca.TG.toFixed(2) : "—"} sub="dias perdidos × 10⁶ / HHT" accent={indicadoresSeguranca.TG === null ? G.faint : indicadoresSeguranca.TG > 100 ? G.red : G.mint} />
              <KPI label="Acidentes com Afastamento" value={indicadoresSeguranca.acComAfastamento} accent={indicadoresSeguranca.acComAfastamento > 0 ? G.red : G.mint} />
              <KPI label="Acidentes sem Afastamento" value={indicadoresSeguranca.acSemAfastamento} accent={indicadoresSeguranca.acSemAfastamento > 0 ? G.amberDark : G.mint} />
            </div>

            {/* Configuração do HHT */}
            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={Users2}>Horas Homem Trabalhadas (HHT) — Base para TF e TG</PanelHead>
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <label style={{ fontSize: 10, color: G.sub, display: "block", marginBottom: 4 }}>Total HHT Acumulado na Obra</label>
                  <EditCell type="number" align="right" value={hhtConfig.totalHHT} onChange={(v) => setHhtConfig((h) => ({ ...h, totalHHT: Number(v) }))} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: G.sub, display: "block", marginBottom: 4 }}>Horas trabalhadas por dia</label>
                  <EditCell type="number" align="right" value={hhtConfig.horasDia} onChange={(v) => setHhtConfig((h) => ({ ...h, horasDia: Number(v) }))} />
                </div>
                <div style={{ fontSize: 10.5, color: G.sub, paddingBottom: 6 }}>
                  HHT = nº de trabalhadores × dias trabalhados × horas/dia. Lance o total acumulado desde o início da obra.
                </div>
              </div>
            </Panel>

            {/* Registro de Acidentes */}
            <Panel>
              <PanelHead icon={ShieldAlert}>Registro de Acidentes e Incidentes</PanelHead>
              <EditableLegend note="Registre quase acidentes também — eles sinalizam riscos reais antes do acidente acontecer. Acidentes com afastamento entram no cálculo do TF e TG acima." />
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Data</th>
                    <th style={{ width: 160 }}>Tipo</th>
                    <th style={{ width: 90 }}>Gravidade</th>
                    <th style={{ minWidth: 200 }}>Descrição</th>
                    <th style={{ minWidth: 130 }}>Funcionário / Função</th>
                    <th style={{ width: 80 }}>Dias Perdidos</th>
                    <th style={{ width: 90 }}>CAT nº</th>
                    <th style={{ minWidth: 160 }}>Ação Corretiva</th>
                    <th style={{ width: 110 }}>Responsável</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {acidentes.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: "center", color: G.mint, fontWeight: 700, padding: 16 }}>
                      <CheckCircle2 size={14} style={{ marginRight: 6 }} />
                      Nenhum acidente registrado — excelente! Registre também quase acidentes.
                    </td></tr>
                  )}
                  {acidentes.map((a, i) => (
                    <tr key={a.id}>
                      <td><EditCell type="date" value={a.data} onChange={(v) => updateAcidente(i, "data", v)} /></td>
                      <td>
                        <EditSelect value={a.tipo} onChange={(v) => updateAcidente(i, "tipo", v)}
                          options={["Quase acidente", "Acidente sem afastamento", "Acidente com afastamento", "Acidente fatal"].map((t) => ({ v: t, l: t }))} />
                      </td>
                      <td>
                        <EditSelect value={a.gravidade} onChange={(v) => updateAcidente(i, "gravidade", v)}
                          options={["Leve", "Moderado", "Grave", "Fatal"].map((g) => ({ v: g, l: g }))} />
                      </td>
                      <td><EditCell value={a.descricao} onChange={(v) => updateAcidente(i, "descricao", v)} /></td>
                      <td>
                        <EditCell value={a.funcionario} onChange={(v) => updateAcidente(i, "funcionario", v)} placeholder="Nome" />
                        <EditCell value={a.funcao} onChange={(v) => updateAcidente(i, "funcao", v)} placeholder="Função" />
                      </td>
                      <td>
                        {(a.tipo === "Acidente com afastamento" || a.tipo === "Acidente fatal") ? (
                          <EditCell type="number" align="right" value={a.diasPerdidos} onChange={(v) => updateAcidente(i, "diasPerdidos", Number(v))} />
                        ) : <span style={{ color: G.faint, fontSize: 10.5, display: "block", textAlign: "center" }}>—</span>}
                      </td>
                      <td>
                        {(a.tipo === "Acidente com afastamento" || a.tipo === "Acidente fatal") ? (
                          <EditCell value={a.cat} onChange={(v) => updateAcidente(i, "cat", v)} placeholder="Nº CAT" />
                        ) : <span style={{ color: G.faint, fontSize: 10.5, display: "block", textAlign: "center" }}>—</span>}
                      </td>
                      <td><EditCell value={a.acaoCorretiva} onChange={(v) => updateAcidente(i, "acaoCorretiva", v)} /></td>
                      <td><EditCell value={a.responsavel} onChange={(v) => updateAcidente(i, "responsavel", v)} /></td>
                      <td><button onClick={() => removeAcidente(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: 10 }}>
                <button onClick={addAcidente} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Registrar Acidente / Incidente
                </button>
              </div>
            </Panel>
          </div>
        )}

        {tab === "riscos" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Riscos Mapeados" value={riscos.length} accent={G.steel} />
              <KPI label="Severidade Alta (≥15)" value={riscos.filter((r) => r.probabilidade * r.impacto >= 15).length} accent={G.red} />
              <KPI label="Em Aberto" value={riscos.filter((r) => r.status === "Aberto").length} accent={G.amberDark} />
              <KPI label="Mitigados" value={riscos.filter((r) => r.status === "Mitigado").length} accent={G.mint} />
            </div>
            <Panel>
              <PanelHead icon={AlertTriangle}>Matriz de Riscos — Probabilidade x Impacto</PanelHead>
              <EditableLegend note="Severidade = Probabilidade × Impacto (1-5 cada), calculada automaticamente." />
              <table>
                <thead><tr><th style={{ minWidth: 220 }}>Risco</th><th style={{ width: 100 }}>Probabilidade</th><th style={{ width: 90 }}>Impacto</th><th style={{ width: 90 }}>Severidade</th><th style={{ minWidth: 220 }}>Plano de Resposta</th><th style={{ width: 140 }}>Responsável</th><th style={{ width: 120 }}>Status</th><th></th></tr></thead>
                <tbody>
                  {riscos.map((r, i) => {
                    const sev = r.probabilidade * r.impacto;
                    const sevColor = sev >= 15 ? G.red : sev >= 8 ? G.amberDark : G.mint;
                    return (
                      <tr key={r.id}>
                        <td><EditCell value={r.risco} onChange={(v) => updateRisco(i, "risco", v)} /></td>
                        <td><EditCell type="number" align="right" value={r.probabilidade} onChange={(v) => updateRisco(i, "probabilidade", Math.max(1, Math.min(5, Number(v))))} /></td>
                        <td><EditCell type="number" align="right" value={r.impacto} onChange={(v) => updateRisco(i, "impacto", Math.max(1, Math.min(5, Number(v))))} /></td>
                        <td style={{ textAlign: "center", fontWeight: 800, color: sevColor, background: "#F4F5F6" }}>{sev}</td>
                        <td><EditCell value={r.plano} onChange={(v) => updateRisco(i, "plano", v)} /></td>
                        <td><EditCell value={r.responsavel} onChange={(v) => updateRisco(i, "responsavel", v)} /></td>
                        <td>
                          <EditSelect value={r.status} onChange={(v) => updateRisco(i, "status", v)}
                            options={[{ v: "Aberto", l: "Aberto" }, { v: "Monitorando", l: "Monitorando" }, { v: "Mitigado", l: "Mitigado" }, { v: "Materializado", l: "Materializado" }]} />
                        </td>
                        <td><button onClick={() => removeRisco(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: 10 }}>
                <button onClick={addRisco} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Adicionar risco
                </button>
              </div>
            </Panel>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, margin: "18px 0 14px" }}>
              <KPI label="NCs Abertas/Em Correção" value={naoConformidades.filter((n) => n.status !== "Corrigida" && n.status !== "Verificada").length} accent={G.amberDark} />
              <KPI label="Vencidas" value={naoConformidades.filter((n) => alertaNC(n) === "VENCIDO").length} accent={naoConformidades.some((n) => alertaNC(n) === "VENCIDO") ? G.red : G.mint} />
              <KPI label="Gravidade Alta/Crítica" value={naoConformidades.filter((n) => n.gravidade === "Alta" || n.gravidade === "Crítica").length} accent={G.red} />
              <KPI label="Custo de Retrabalho Total" value={fmtR$(naoConformidades.reduce((s, n) => s + Number(n.custoRetrabalho || 0), 0))} accent={G.ink} />
            </div>

            {naoConformidades.some((n) => alertaNC(n)) && (
              <Panel style={{ marginBottom: 14, borderLeft: `3px solid ${G.red}` }}>
                <PanelHead icon={BellRing}>Alertas — Prazo de Correção</PanelHead>
                <div style={{ padding: "10px 13px", display: "flex", flexDirection: "column", gap: 7 }}>
                  {naoConformidades.filter((n) => alertaNC(n)).map((n) => (
                    <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, flexWrap: "wrap" }}>
                      <Badge status={alertaNC(n)} />
                      <span style={{ color: G.ink, fontWeight: 600 }}>NC nº{n.numero}: {n.descricao.slice(0, 60)}{n.descricao.length > 60 ? "..." : ""}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: G.sub }}>Prazo: <b style={{ color: G.ink }}>{toBR(n.prazoCorrecao)}</b> · {n.responsavelCorrecao}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <Panel>
              <PanelHead icon={ShieldAlert}>Não Conformidades — Registro e Ação Corretiva</PanelHead>
              <EditableLegend note="Toda NC tem prazo de correção e responsável. Se o mesmo tipo de NC se repetir, considere virar um Risco (acima) ou registrar como Lição Aprendida." />
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>Nº</th><th style={{ minWidth: 220 }}>Descrição</th><th style={{ width: 130 }}>EAP</th>
                    <th style={{ width: 100 }}>Tipo</th><th style={{ width: 90 }}>Gravidade</th><th style={{ minWidth: 180 }}>Ação Corretiva</th>
                    <th style={{ width: 130 }}>Responsável</th><th style={{ width: 100 }}>Prazo</th><th style={{ width: 110 }}>Custo Retrab.</th>
                    <th style={{ width: 120 }}>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {naoConformidades.map((n, i) => {
                    const alerta = alertaNC(n);
                    return (
                      <tr key={n.id}>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 800, color: G.sub, background: "#F4F5F6", textAlign: "center" }}>{n.numero}</td>
                        <td><EditCell value={n.descricao} onChange={(v) => updateNaoConformidade(i, "descricao", v)} /></td>
                        <td><EditSelect value={n.etapaId} onChange={(v) => updateNaoConformidade(i, "etapaId", v)} options={etapas.map((e) => ({ v: e.id, l: e.id }))} /></td>
                        <td>
                          <EditSelect value={n.tipo} onChange={(v) => updateNaoConformidade(i, "tipo", v)}
                            options={["Execução", "Material", "Projeto", "Segurança"].map((t) => ({ v: t, l: t }))} />
                        </td>
                        <td>
                          <EditSelect value={n.gravidade} onChange={(v) => updateNaoConformidade(i, "gravidade", v)}
                            options={["Baixa", "Média", "Alta", "Crítica"].map((g) => ({ v: g, l: g }))} />
                        </td>
                        <td><EditCell value={n.acaoCorretiva} onChange={(v) => updateNaoConformidade(i, "acaoCorretiva", v)} /></td>
                        <td><EditCell value={n.responsavelCorrecao} onChange={(v) => updateNaoConformidade(i, "responsavelCorrecao", v)} /></td>
                        <td>
                          <EditCell type="date" value={n.prazoCorrecao} onChange={(v) => updateNaoConformidade(i, "prazoCorrecao", v)} />
                          {alerta && <div style={{ marginTop: 2 }}><Badge status={alerta} /></div>}
                        </td>
                        <td><EditCell type="number" prefix="R$" align="right" value={n.custoRetrabalho} onChange={(v) => updateNaoConformidade(i, "custoRetrabalho", v)} /></td>
                        <td>
                          <EditSelect value={n.status} onChange={(v) => updateNaoConformidade(i, "status", v)}
                            options={["Aberta", "Em Correção", "Corrigida", "Verificada"].map((s) => ({ v: s, l: s }))} />
                        </td>
                        <td><button onClick={() => removeNaoConformidade(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: 10 }}>
                <button onClick={addNaoConformidade} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Registrar Não Conformidade
                </button>
              </div>
            </Panel>
          </>
        )}

        {tab === "licoes" && (
          <Panel>
            <PanelHead icon={Lightbulb}>Banco de Lições Aprendidas</PanelHead>
            <EditableLegend note="Registre problema, solução aplicada, impacto e recomendação — vira referência para a próxima obra." />
            <table>
              <thead><tr><th style={{ width: 100 }}>Data</th><th style={{ minWidth: 200 }}>Problema</th><th style={{ minWidth: 200 }}>Solução Aplicada</th><th style={{ minWidth: 160 }}>Impacto</th><th style={{ minWidth: 200 }}>Recomendação</th><th style={{ width: 140 }}>Responsável</th><th></th></tr></thead>
              <tbody>
                {licoes.map((l, i) => (
                  <tr key={l.id}>
                    <td><EditCell type="date" value={l.data} onChange={(v) => updateLicao(i, "data", v)} /></td>
                    <td><EditCell value={l.problema} onChange={(v) => updateLicao(i, "problema", v)} /></td>
                    <td><EditCell value={l.solucao} onChange={(v) => updateLicao(i, "solucao", v)} /></td>
                    <td><EditCell value={l.impacto} onChange={(v) => updateLicao(i, "impacto", v)} /></td>
                    <td><EditCell value={l.recomendacao} onChange={(v) => updateLicao(i, "recomendacao", v)} /></td>
                    <td><EditCell value={l.responsavel} onChange={(v) => updateLicao(i, "responsavel", v)} /></td>
                    <td><button onClick={() => removeLicao(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: 10 }}>
              <button onClick={addLicao} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                <Plus size={13} /> Adicionar lição aprendida
              </button>
            </div>
          </Panel>
        )}

        {tab === "equipe" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
              <KPI label="Cadastrados (nominal)" value={equipe.length} accent={G.steel} />
              <KPI label="Pico de Efetivo Simultâneo" value={picoMaoObra} sub="maior mês, somando atividades ativas ao mesmo tempo" accent={G.amberDark} />
              <KPI label="Efetivo Médio Hoje" value={histogramaMaoObra.find((h) => h.mes === `${MES_NOMES[toDate(todayISO).getMonth()]}/${String(toDate(todayISO).getFullYear()).slice(2)}`)?.efetivoMedio ?? "—"} accent={G.mint} />
            </div>

            <Panel style={{ marginBottom: 14 }}>
              <PanelHead icon={Users2}>Histograma de Mão de Obra — Efetivo Necessário por Mês</PanelHead>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: G.sub, padding: "7px 13px", background: "#FCFCFA", borderBottom: `1px solid ${G.grid}` }}>
                <CheckCircle2 size={12} color={G.mint} />
                Lido direto do Cronograma: cada atividade tem um efetivo estimado (editável na Tabela de Atividades), e isso é somado/ponderado pela janela CPM real de cada mês — não é digitado aqui.
              </div>
              <div style={{ padding: 14 }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={histogramaMaoObra}>
                    <CartesianGrid stroke={G.grid} />
                    <XAxis dataKey="mes" tick={{ fontSize: 9.5 }} interval={1} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="efetivoMedio" name="Efetivo médio ponderado" fill={G.steel} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="efetivoPico" name="Pico simultâneo (dimensionamento)" fill={G.amber} radius={[3, 3, 0, 0]} fillOpacity={0.45} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <PanelHead icon={Users}>Equipe — Funcionários, Empreiteiros e Terceiros (cadastro nominal)</PanelHead>
              <EditableLegend note="Nome, função, vínculo e índice são editáveis célula a célula." />
              <table>
                <thead><tr><th>Nome</th><th>Função</th><th>Vínculo</th><th>Índice de Produtividade</th><th></th></tr></thead>
                <tbody>
                  {equipe.map((p, i) => (
                    <tr key={i}>
                      <td><EditCell value={p.nome} onChange={(v) => updateEquipe(i, "nome", v)} /></td>
                      <td><EditCell value={p.funcao} onChange={(v) => updateEquipe(i, "funcao", v)} /></td>
                      <td>
                        <EditSelect value={p.vinculo} onChange={(v) => updateEquipe(i, "vinculo", v)}
                          options={[{ v: "CLT", l: "CLT" }, { v: "Empreiteiro", l: "Empreiteiro" }, { v: "Terceiro", l: "Terceiro" }, { v: "Estagiário", l: "Estagiário" }]} />
                      </td>
                      <td style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <EditCell type="number" width={70} align="right" value={Math.round(p.indice * 100)} onChange={(v) => updateEquipe(i, "indice", Number(v) / 100)} />
                        <span style={{ fontWeight: 700, color: p.indice >= 1 ? G.mint : G.amberDark }}>{fmtPct(p.indice)}</span>
                      </td>
                      <td><button onClick={() => removeEquipe(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: 10 }}>
                <button onClick={addEquipe} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                  <Plus size={13} /> Adicionar membro da equipe
                </button>
              </div>
            </Panel>
          </>
        )}

        {/* ── LAST PLANNER ────────────────────────────────────────────────── */}
        {tab === "lastplanner" && (() => {
          const semanaAtual = lpSemanas.find((s) => s.id === lpSemanaAtiva) || null;
          const tarefasSemana = semanaAtual?.tarefas || [];
          const planejadas = tarefasSemana.filter((t) => t.planejada).length;
          const concluidas = tarefasSemana.filter((t) => t.planejada && t.concluida).length;
          const ppcAtual = planejadas > 0 ? Math.round((concluidas / planejadas) * 100) : null;
          const ppcMedio = ppcHistorico.filter((h) => h.ppc !== null).reduce((s, h, _, a) => s + h.ppc / a.length, 0);
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
                <KPI label="PPC — Semana Atual" value={ppcAtual !== null ? ppcAtual + "%" : "—"} sub={concluidas + " de " + planejadas + " tarefas concluídas"} accent={ppcAtual === null ? G.faint : ppcAtual >= 80 ? G.mint : ppcAtual >= 60 ? G.amberDark : G.red} />
                <KPI label="PPC Médio Histórico" value={ppcHistorico.length > 0 ? Math.round(ppcMedio) + "%" : "—"} sub={lpSemanas.length + " semana(s) registrada(s)"} accent={G.steel} />
                <KPI label="Tarefas Planejadas (semana)" value={planejadas} accent={G.steel} />
                <KPI label="Causas de não-conclusão" value={causasNaoConclusao.length} accent={causasNaoConclusao.length > 0 ? G.amberDark : G.mint} />
              </div>

              {ppcHistorico.length > 1 && (
                <Panel style={{ marginBottom: 14 }}>
                  <PanelHead icon={TrendingUp}>Histórico de PPC — Percentual do Planejado Concluído</PanelHead>
                  <div style={{ padding: 14 }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={ppcHistorico}>
                        <CartesianGrid stroke={G.grid} />
                        <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                        <Tooltip formatter={(v) => v + "%"} />
                        <Bar dataKey="ppc" name="PPC" fill={G.steel} radius={[3, 3, 0, 0]}>
                          {ppcHistorico.map((h, i) => (
                            <Cell key={i} fill={h.ppc === null ? G.faint : h.ppc >= 80 ? G.mint : h.ppc >= 60 ? G.amber : G.red} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ fontSize: 10, color: G.sub, marginTop: 6, textAlign: "center" }}>
                      Meta Lean: PPC &ge; 80% consistente. Abaixo de 60% exige análise de restrições.
                    </div>
                  </div>
                </Panel>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
                <Panel>
                  <PanelHead icon={ClipboardList}>Plano Semanal — Tarefas Comprometidas</PanelHead>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 13px", borderBottom: `1px solid ${G.grid}`, overflowX: "auto" }}>
                    {lpSemanas.map((s) => (
                      <button key={s.id} onClick={() => setLpSemanaAtiva(s.id)}
                        style={{ padding: "5px 12px", borderRadius: 4, border: `1.5px solid ${s.id === lpSemanaAtiva ? G.steel : G.grid}`, background: s.id === lpSemanaAtiva ? G.steel : "transparent", color: s.id === lpSemanaAtiva ? "#fff" : G.ink, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
                        Sem {s.semanaNum}<br/><span style={{ fontWeight: 400, fontSize: 9.5 }}>{toBR(s.periodoInicio)}</span>
                      </button>
                    ))}
                    <button onClick={addSemanaLP}
                      style={{ padding: "5px 10px", borderRadius: 4, border: `1.5px dashed ${EDIT_BORDER}`, background: "transparent", color: EDIT_TEXT, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
                      <Plus size={11} /> Semana
                    </button>
                  </div>
                  {semanaAtual ? (
                    <>
                      <div style={{ padding: "8px 13px", fontSize: 11, color: G.sub, borderBottom: `1px solid ${G.grid}` }}>
                        Semana {semanaAtual.semanaNum}: {toBR(semanaAtual.periodoInicio)} a {toBR(semanaAtual.periodoFim)}
                        {ppcAtual !== null && <span style={{ marginLeft: 10, fontWeight: 700, color: ppcAtual >= 80 ? G.mint : ppcAtual >= 60 ? G.amberDark : G.red }}>PPC: {ppcAtual}%</span>}
                      </div>
                      <table>
                        <thead><tr>
                          <th style={{ width: 30 }}></th>
                          <th>Tarefa comprometida</th>
                          <th style={{ width: 100 }}>EAP</th>
                          <th style={{ width: 120 }}>Responsável</th>
                          <th style={{ width: 90 }}>Concluída?</th>
                          <th style={{ minWidth: 160 }}>Motivo (se não)</th>
                          <th style={{ width: 28 }}></th>
                        </tr></thead>
                        <tbody>
                          {tarefasSemana.map((t) => (
                            <tr key={t.id} style={{ background: t.planejada && t.concluida ? "#F0FDF4" : t.planejada && !t.concluida ? "#FFFBEB" : "#FAFAFA" }}>
                              <td style={{ textAlign: "center" }}>
                                <input type="checkbox" checked={t.planejada} onChange={(e) => updateTarefaLP(semanaAtual.id, t.id, "planejada", e.target.checked)} style={{ accentColor: G.steel }} />
                              </td>
                              <td><EditCell value={t.descricao} onChange={(v) => updateTarefaLP(semanaAtual.id, t.id, "descricao", v)} /></td>
                              <td>
                                <EditSelect value={t.etapaId} onChange={(v) => updateTarefaLP(semanaAtual.id, t.id, "etapaId", v)}
                                  options={etapas.map((e) => ({ v: e.id, l: e.id + " " + e.nome.slice(0, 15) }))} />
                              </td>
                              <td><EditCell value={t.responsavel} onChange={(v) => updateTarefaLP(semanaAtual.id, t.id, "responsavel", v)} /></td>
                              <td style={{ textAlign: "center" }}>
                                <input type="checkbox" checked={t.concluida} onChange={(e) => updateTarefaLP(semanaAtual.id, t.id, "concluida", e.target.checked)} style={{ accentColor: G.mint }} />
                              </td>
                              <td>
                                {t.planejada && !t.concluida ? (
                                  <EditCell value={t.motivoNaoConclusao} onChange={(v) => updateTarefaLP(semanaAtual.id, t.id, "motivoNaoConclusao", v)} placeholder="Qual restrição impediu?" />
                                ) : <span style={{ color: G.faint, fontSize: 10 }}>—</span>}
                              </td>
                              <td><button onClick={() => removeTarefaLP(semanaAtual.id, t.id)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={12} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div style={{ padding: 10 }}>
                        <button onClick={() => addTarefaLP(semanaAtual.id)} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                          <Plus size={13} /> Comprometer tarefa
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: 24, textAlign: "center", color: G.faint }}>Crie uma semana para começar o planejamento.</div>
                  )}
                </Panel>

                <Panel>
                  <PanelHead icon={AlertTriangle}>Análise de Restrições</PanelHead>
                  <EditableLegend note="Por que as tarefas não foram concluídas? O que repetir mais de 1x vira risco a mitigar." />
                  {causasNaoConclusao.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: G.mint, fontWeight: 700 }}>
                      <CheckCircle2 size={16} style={{ marginBottom: 4 }} /><br/>Nenhuma restrição registrada.
                    </div>
                  ) : causasNaoConclusao.map(([causa, count]) => (
                    <div key={causa} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 13px", borderBottom: `1px solid ${G.grid}` }}>
                      <div style={{ width: 22, height: 22, background: count > 1 ? G.red : G.amberDark, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{count}</div>
                      <span style={{ fontSize: 11.5, color: G.ink }}>{causa}</span>
                    </div>
                  ))}
                </Panel>
              </div>
            </>
          );
        })()}

        {/* ── GARANTIA / PÓS-ENTREGA ──────────────────────────────────────── */}
        {tab === "garantia" && (() => {
          const dataEntregaObra = dadosObra.dataFimPrevista || todayISO;
          const totalCustoGarantia = chamadosGarantia.reduce((s, c) => s + Number(c.custoAtendimento || 0), 0);
          const abertos = chamadosGarantia.filter((c) => c.status === "Aberto").length;
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
                <KPI label="Sistemas com Garantia" value={garantias.length} accent={G.steel} />
                <KPI label="Chamados Abertos" value={abertos} accent={abertos > 0 ? G.amberDark : G.mint} />
                <KPI label="Chamados Totais" value={chamadosGarantia.length} accent={G.steel} />
                <KPI label="Custo de Atendimento (total)" value={fmtR$(totalCustoGarantia)} sub="impacta a margem real da obra" accent={totalCustoGarantia > 0 ? G.red : G.mint} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Panel>
                  <PanelHead icon={Award}>Sistemas e Prazos de Garantia</PanelHead>
                  <EditableLegend note="Prazos conforme NBR 17170 e Art. 618 CC. Data de entrega = previsão de término em Dados da Obra. Ajuste se a entrega real for diferente." />
                  <table>
                    <thead><tr>
                      <th>Sistema</th><th style={{ width: 100 }}>Prazo</th><th style={{ width: 110 }}>Vence em</th><th style={{ width: 90 }}>Situação</th>
                    </tr></thead>
                    <tbody>
                      {garantias.map((g, i) => {
                        const vencimento = addDays(dataEntregaObra, g.prazoMeses * 30);
                        const diasRestantes = diffDays(todayISO, vencimento);
                        const vencida = diasRestantes < 0;
                        const proxima = !vencida && diasRestantes < 90;
                        return (
                          <tr key={g.id}>
                            <td>
                              <EditCell value={g.sistema} onChange={(v) => updateGarantia(i, "sistema", v)} />
                              <div style={{ fontSize: 9.5, color: G.faint }}>{g.descricao}</div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <EditCell type="number" align="right" value={g.prazoMeses} onChange={(v) => updateGarantia(i, "prazoMeses", Number(v))} />
                              <div style={{ fontSize: 9, color: G.faint }}>meses</div>
                            </td>
                            <td style={{ textAlign: "center", fontWeight: 700, fontSize: 11, color: vencida ? G.red : proxima ? G.amberDark : G.ink }}>{toBR(vencimento)}</td>
                            <td style={{ textAlign: "center" }}>
                              <span style={{ background: vencida ? G.redBg : proxima ? G.goldBg : G.mintBg, color: vencida ? G.red : proxima ? G.amberDark : G.mint, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 9 }}>
                                {vencida ? "Vencida" : proxima ? diasRestantes + "d" : "Vigente"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Panel>

                <Panel>
                  <PanelHead icon={BellRing}>Chamados de Assistência Técnica</PanelHead>
                  <EditableLegend note="Registre o custo de cada atendimento — ele reduz a margem real da obra, que muitas vezes só é calculada no encerramento." />
                  {chamadosGarantia.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: G.mint, fontWeight: 700 }}>
                      <CheckCircle2 size={16} style={{ marginBottom: 4 }} /><br/>Nenhum chamado registrado.
                    </div>
                  ) : (
                    <table>
                      <thead><tr><th style={{ width: 90 }}>Data</th><th>Sistema</th><th>Descrição</th><th style={{ width: 100 }}>Custo (R$)</th><th style={{ width: 90 }}>Status</th><th></th></tr></thead>
                      <tbody>
                        {chamadosGarantia.map((c, i) => (
                          <tr key={c.id}>
                            <td><EditCell type="date" value={c.data} onChange={(v) => updateChamadoGarantia(i, "data", v)} /></td>
                            <td><EditCell value={c.sistema} onChange={(v) => updateChamadoGarantia(i, "sistema", v)} /></td>
                            <td><EditCell value={c.descricao} onChange={(v) => updateChamadoGarantia(i, "descricao", v)} /></td>
                            <td><EditCell type="number" prefix="R$" align="right" value={c.custoAtendimento} onChange={(v) => updateChamadoGarantia(i, "custoAtendimento", v)} /></td>
                            <td><EditSelect value={c.status} onChange={(v) => updateChamadoGarantia(i, "status", v)} options={["Aberto", "Em atendimento", "Concluído"].map((s) => ({ v: s, l: s }))} /></td>
                            <td><button onClick={() => removeChamadoGarantia(i)} style={{ background: "none", border: "none", color: G.faint }}><Trash2 size={13} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={{ padding: 10 }}>
                    <button onClick={addChamadoGarantia} style={{ background: "transparent", border: `1.5px dashed ${EDIT_BORDER}`, color: EDIT_TEXT, fontSize: 11.5, fontWeight: 700, padding: "6px 12px", borderRadius: 4, display: "flex", alignItems: "center", gap: 5 }}>
                      <Plus size={13} /> Registrar chamado
                    </button>
                  </div>
                </Panel>
              </div>
            </>
          );
        })()}

        {diarioSelecionado && (
          <Modal onClose={() => setDiarioSelecionado(null)} width={680}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${G.grid}`, background: G.ribbonSoft }}>
              <div>
                <div style={{ fontSize: 9.5, color: "#9AA6B5", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.5 }}>Diário de Obra</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>{diarioSelecionado.data}</div>
              </div>
              <button onClick={() => setDiarioSelecionado(null)} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div><div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700 }}>Clima</div><div style={{ fontSize: 13, fontWeight: 700, color: G.ink }}>{diarioSelecionado.clima} {diarioSelecionado.temp && `· ${diarioSelecionado.temp}`}</div></div>
                <div><div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700 }}>Equipe</div><div style={{ fontSize: 13, fontWeight: 700, color: G.ink }}>{diarioSelecionado.equipe} colaboradores</div></div>
                <div><div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700 }}>Produtividade</div><div style={{ fontSize: 13, fontWeight: 700, color: diarioSelecionado.produtividade >= 0.9 ? G.mint : diarioSelecionado.produtividade >= 0.8 ? G.amberDark : G.red }}>{(diarioSelecionado.produtividade * 100).toFixed(0)}%</div></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Equipamentos em operação</div>
                <div style={{ fontSize: 13, color: G.ink }}>{diarioSelecionado.equipamentos || "—"}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Serviços executados</div>
                <div style={{ fontSize: 13, color: G.ink }}>{diarioSelecionado.servicos}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Ocorrências / problemas</div>
                  <div style={{ fontSize: 13, color: diarioSelecionado.ocorrencias !== "Nenhuma" ? G.red : G.ink, fontWeight: diarioSelecionado.ocorrencias !== "Nenhuma" ? 700 : 400 }}>{diarioSelecionado.ocorrencias || "Nenhuma"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Visitas / fiscalização</div>
                  <div style={{ fontSize: 13, color: G.ink }}>{diarioSelecionado.visitas || "—"}</div>
                </div>
              </div>
              {diarioSelecionado.observacoes && (
                <div style={{ marginBottom: 16, background: "#FCFCFA", border: `1px solid ${G.grid}`, borderRadius: 4, padding: 10 }}>
                  <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700, marginBottom: 3 }}>Observações gerais</div>
                  <div style={{ fontSize: 13, color: G.ink, fontStyle: "italic" }}>{diarioSelecionado.observacoes}</div>
                </div>
              )}
              <div style={{ fontSize: 9.5, color: G.sub, textTransform: "uppercase", fontWeight: 700, marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <ImageIcon size={12} /> Fotos do dia
              </div>
              {fotosDoDia(diarioSelecionado.data).length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                  {fotosDoDia(diarioSelecionado.data).map((f) => (
                    <div key={f.id}>
                      <img src={f.url} alt={f.legenda} onClick={() => setFotoAmpliada(f)}
                        style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 4, border: `1px solid ${G.grid}`, cursor: "pointer" }} />
                      <div style={{ fontSize: 10, color: G.sub, marginTop: 3 }}>{f.legenda}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: G.faint, fontStyle: "italic" }}>Nenhuma foto vinculada a este dia — adicione em "Fotos Mensais".</div>
              )}
            </div>
          </Modal>
        )}

        {fotoAmpliada && (
          <Modal onClose={() => setFotoAmpliada(null)} width={720}>
            <div style={{ position: "relative" }}>
              <img src={fotoAmpliada.url} alt={fotoAmpliada.legenda} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", background: "#0E1116" }} />
              <button onClick={() => setFotoAmpliada(null)} style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} />
              </button>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, color: G.ink, fontSize: 13.5 }}>{fotoAmpliada.legenda}</div>
              <div style={{ fontSize: 11.5, color: G.sub, marginTop: 2 }}>{toBR(fotoAmpliada.data)} · {etapas.find((e) => e.id === fotoAmpliada.etapaId)?.nome}</div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   PORTFÓLIO DE OBRAS — a camada de multiprojeto. Cada card é uma obra com
   armazenamento próprio (chave separada); abrir um card monta o
   ObraWorkspace de cima com key={projetoId}, o que faz o React remontar
   ele do zero (estado limpo, carregando os dados certos) sem precisar
   tocar em nenhuma das ~50 variáveis internas do motor da obra.
============================================================================ */
function CardObra({ meta, resumo, onAbrir, confirmandoExclusao, onPedirExcluir, onConfirmarExcluir, onCancelarExcluir }) {
  const carregando = resumo === undefined;
  const statusInfo = (() => {
    if (carregando || !resumo) return { label: "—", color: G.faint };
    if (resumo.pctFisico >= 0.999) return { label: "Concluída", color: G.mint };
    if (resumo.desvio < -2) return { label: "Atrasada", color: G.red };
    if (resumo.desvio < 0) return { label: "Atenção", color: G.amberDark };
    return { label: "No prazo", color: G.mint };
  })();
  return (
    <div style={{ background: "#fff", border: `1px solid ${G.grid}`, borderRadius: 8, padding: 18, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14.5, color: G.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.nome}</div>
          <div style={{ fontSize: 11, color: G.sub }}>{meta.codigo}</div>
        </div>
        <span style={{ background: statusInfo.color + "22", color: statusInfo.color, fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 9, whiteSpace: "nowrap", flexShrink: 0 }}>{statusInfo.label}</span>
      </div>

      {carregando ? (
        <div style={{ fontSize: 11.5, color: G.faint, fontStyle: "italic" }}>Carregando resumo...</div>
      ) : resumo ? (
        <>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: G.sub, marginBottom: 3 }}>
              <span>% Físico</span><span style={{ fontWeight: 700, color: G.ink }}>{fmtPct(resumo.pctFisico)}</span>
            </div>
            <div style={{ height: 7, background: G.grid, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, resumo.pctFisico * 100)}%`, background: resumo.pctFisico >= 0.999 ? G.mint : G.steel }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
            <div><div style={{ color: G.faint, fontSize: 9.5, textTransform: "uppercase" }}>Contrato</div><div style={{ fontWeight: 700, color: G.ink }}>{fmtR$(resumo.valorContrato)}</div></div>
            <div><div style={{ color: G.faint, fontSize: 9.5, textTransform: "uppercase" }}>Realizado</div><div style={{ fontWeight: 700, color: G.ink }}>{fmtR$(resumo.totalRealizado)}</div></div>
            <div><div style={{ color: G.faint, fontSize: 9.5, textTransform: "uppercase" }}>Saldo de Caixa</div><div style={{ fontWeight: 700, color: resumo.saldoCaixa >= 0 ? G.mint : G.red }}>{fmtR$(resumo.saldoCaixa)}</div></div>
            <div><div style={{ color: G.faint, fontSize: 9.5, textTransform: "uppercase" }}>Desvio Prazo</div><div style={{ fontWeight: 700, color: resumo.desvio >= 0 ? G.mint : G.red }}>{resumo.desvio >= 0 ? "+" : ""}{resumo.desvio} p.p.</div></div>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11.5, color: G.faint, fontStyle: "italic" }}>Obra ainda sem dados.</div>
      )}

      {confirmandoExclusao ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: G.redBg, borderRadius: 4, padding: "8px 10px" }}>
          <span style={{ fontSize: 11, color: G.red, fontWeight: 700, flex: 1 }}>Excluir esta obra e todos os dados dela?</span>
          <button onClick={onConfirmarExcluir} style={{ background: G.red, color: "#fff", border: "none", borderRadius: 4, padding: "5px 9px", fontSize: 10.5, fontWeight: 700 }}>Excluir</button>
          <button onClick={onCancelarExcluir} style={{ background: "none", border: `1px solid ${G.grid}`, borderRadius: 4, padding: "5px 9px", fontSize: 10.5, fontWeight: 700, color: G.sub }}>Cancelar</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onAbrir} style={{ flex: 1, background: G.steel, color: "#fff", border: "none", borderRadius: 4, padding: "9px 0", fontWeight: 700, fontSize: 12 }}>Abrir</button>
          <button onClick={onPedirExcluir} title="Excluir obra" style={{ background: "none", border: `1px solid ${G.grid}`, color: G.faint, borderRadius: 4, padding: "9px 11px" }}><Trash2 size={14} /></button>
        </div>
      )}
    </div>
  );
}

export default function Portfolio() {
  const [lista, setLista] = useState(null); // null = carregando ainda
  const [projetoAtivoId, setProjetoAtivoId] = useState(null);
  const [resumos, setResumos] = useState({});
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(null);

  async function recarregarResumos(listaAtual) {
    const entradas = await Promise.all(listaAtual.map(async (p) => {
      const estado = await loadState(p.id);
      return [p.id, estado ? calcularResumoProjeto(estado) : null];
    }));
    setResumos(Object.fromEntries(entradas));
  }

  useEffect(() => {
    migrarOuInicializarPortfolio().then(async (l) => {
      setLista(l);
      recarregarResumos(l);
    });
  }, []);

  async function criarNovaObra() {
    const novoId = uid();
    const novaMeta = { id: novoId, nome: "Nova Obra", codigo: novoId.toUpperCase(), criadoEm: nowISO() };
    const novaLista = [...(lista || []), novaMeta];
    setLista(novaLista);
    await saveListaProjetos(novaLista);
    setProjetoAtivoId(novoId);
  }
  async function confirmarExcluirObra(id) {
    const novaLista = (lista || []).filter((p) => p.id !== id);
    setLista(novaLista);
    await saveListaProjetos(novaLista);
    await removerChave(chaveProjeto(id));
    setResumos((r) => { const novo = { ...r }; delete novo[id]; return novo; });
    setConfirmandoExclusao(null);
  }
  function voltarAoPortfolio() {
    setProjetoAtivoId(null);
    if (lista) recarregarResumos(lista);
  }

  if (projetoAtivoId) {
    return <ObraWorkspace key={projetoAtivoId} projetoId={projetoAtivoId} onVoltarPortfolio={voltarAoPortfolio} />;
  }

  if (lista === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: G.sub, fontFamily: "'Inter', sans-serif", background: G.canvas }}>
        Carregando portfólio...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: G.canvas, fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'); * { box-sizing: border-box; } button { cursor: pointer; }`}</style>
      <div style={{ background: G.ribbon, color: "#fff", padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, maxWidth: 1200, margin: "0 auto" }}>
          <FolderTree size={24} color={G.amber} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Portfólio de Obras</div>
            <div style={{ fontSize: 11.5, color: "#8590A0" }}>{lista.length} obra{lista.length !== 1 ? "s" : ""} cadastrada{lista.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={criarNovaObra} style={{ marginLeft: "auto", background: G.amber, color: "#1A1F29", border: "none", borderRadius: 5, padding: "10px 16px", fontWeight: 800, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Nova Obra
          </button>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {lista.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: G.faint, fontSize: 13 }}>Nenhuma obra ainda. Clique em "Nova Obra" para começar.</div>
        ) : (() => {
          const resumosValidos = lista.map((m) => resumos[m.id]).filter(Boolean);
          const consolCarregando = resumosValidos.length < lista.length;
          const totalContratos = resumosValidos.reduce((s, r) => s + r.valorContrato, 0);
          const totalRealizadoPortfolio = resumosValidos.reduce((s, r) => s + r.totalRealizado, 0);
          const totalSaldoCaixa = resumosValidos.reduce((s, r) => s + r.saldoCaixa, 0);
          const pctFisicoMedio = resumosValidos.length ? resumosValidos.reduce((s, r) => s + r.pctFisico, 0) / resumosValidos.length : 0;
          const dadosComparacao = lista.map((m) => ({
            nome: m.nome.length > 16 ? m.nome.slice(0, 15) + "…" : m.nome,
            pctFisico: resumos[m.id] ? Math.round(resumos[m.id].pctFisico * 100) : 0,
            valorContrato: resumos[m.id]?.valorContrato || 0,
            totalRealizado: resumos[m.id]?.totalRealizado || 0,
          }));
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
                <div style={{ background: "#fff", border: `1px solid ${G.grid}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 9.5, color: G.faint, textTransform: "uppercase", fontWeight: 700 }}>Carteira Total (Contratos)</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: G.ink, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalContratos)}</div>
                </div>
                <div style={{ background: "#fff", border: `1px solid ${G.grid}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 9.5, color: G.faint, textTransform: "uppercase", fontWeight: 700 }}>Realizado Total</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: G.amberDark, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalRealizadoPortfolio)}</div>
                </div>
                <div style={{ background: "#fff", border: `1px solid ${G.grid}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 9.5, color: G.faint, textTransform: "uppercase", fontWeight: 700 }}>Caixa Consolidado (todas as obras)</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: totalSaldoCaixa >= 0 ? G.mint : G.red, fontFamily: "'JetBrains Mono', monospace" }}>{fmtR$(totalSaldoCaixa)}</div>
                </div>
                <div style={{ background: "#fff", border: `1px solid ${G.grid}`, borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 9.5, color: G.faint, textTransform: "uppercase", fontWeight: 700 }}>% Físico Médio</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: G.steel, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPct(pctFisicoMedio)}</div>
                </div>
              </div>
              {consolCarregando && <div style={{ fontSize: 10.5, color: G.faint, marginBottom: 10, fontStyle: "italic" }}>Carregando resumo de todas as obras...</div>}

              {lista.length > 1 && (
                <div style={{ background: "#fff", border: `1px solid ${G.grid}`, borderRadius: 8, padding: 16, marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: G.ink, marginBottom: 10 }}>Comparação entre Obras</div>
                  <ResponsiveContainer width="100%" height={Math.max(180, lista.length * 38)}>
                    <BarChart data={dadosComparacao} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid stroke={G.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => (v / 1e6).toFixed(1) + "M"} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={110} />
                      <Tooltip formatter={(v, n) => (n === "pctFisico" ? v + "%" : fmtR$(v))} />
                      <Legend />
                      <Bar dataKey="valorContrato" name="Contrato (R$)" fill={G.ink} radius={[0, 3, 3, 0]} />
                      <Bar dataKey="totalRealizado" name="Realizado (R$)" fill={G.amber} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                {lista.map((meta) => (
                  <CardObra key={meta.id} meta={meta} resumo={resumos[meta.id]}
                    onAbrir={() => setProjetoAtivoId(meta.id)}
                    confirmandoExclusao={confirmandoExclusao === meta.id}
                    onPedirExcluir={() => setConfirmandoExclusao(meta.id)}
                    onConfirmarExcluir={() => confirmarExcluirObra(meta.id)}
                    onCancelarExcluir={() => setConfirmandoExclusao(null)}
                  />
                ))}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
