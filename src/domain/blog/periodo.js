/**
 * O Período — a faixa de datas que a listagem do Painel recorta.
 *
 * Domínio puro (AD-1): sem React, sem rede, sem `document`. O que mora aqui é o
 * que a tela, a camada de dados e a verificação precisam concordar sobre o que
 * é uma data escolhida — e a única forma de garantir que concordem é não haver
 * três cópias da regra.
 *
 * ─── DATA CIVIL DE UM LADO, INSTANTE DO OUTRO ───────────────────────────────
 *
 * O Autor escolhe um DIA (`2026-09-02`); o banco guarda INSTANTE (`timestamptz`,
 * em UTC). A tradução entre os dois é a armadilha inteira deste módulo, e é a
 * mesma que `formato.js` documenta: `new Date("2026-09-02")` é meia-noite em
 * UTC, que é 21h do dia ANTERIOR em São Paulo. Um filtro escrito assim mostra o
 * Post publicado às 22h no dia seguinte ao que o Autor pediu — e ninguém
 * desconfia, porque a lista continua parecendo plausível.
 *
 * Por isso a conversão passa por `deCampoDeInstante`, que lê hora de parede no
 * fuso do negócio e devolve instante em UTC. Nada aqui escreve `-03:00` à mão:
 * o deslocamento é perguntado ao `Intl`, e continua certo se a regra de fuso
 * mudar.
 *
 * ─── A FAIXA É SEMIABERTA, E ISSO NÃO É DETALHE ─────────────────────────────
 *
 * `[desde, ateExclusivo)`: o começo do dia pedido, inclusive, até o começo do
 * dia SEGUINTE ao último dia pedido, exclusive. A alternativa óbvia — terminar
 * em `23:59:59` — perde tudo o que acontece no último segundo do dia, e é o
 * tipo de defeito que só aparece no Post publicado às 23:59:30.
 *
 * ─── O QUE ESTE MÓDULO NÃO FAZ ──────────────────────────────────────────────
 *
 * Não consulta, não ordena e não decide QUAL coluna é comparada — quem sabe que
 * a data da linha é `COALESCE(publicado_em, atualizado_em)` é a camada de dados,
 * que é quem monta a consulta. Aqui só se responde "qual faixa de instantes o
 * Autor pediu".
 */

import {
  deCampoDeInstante,
  formatarData,
  paraCampoDeInstante,
} from "./formato.js";

/* ─── Data civil ─────────────────────────────────────────────────────────── */

/** `AAAA-MM-DD` — o formato que um `<input type="date">` produz e o Postgres lê. */
const FORMATO_DE_DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

const dois = (n) => String(n).padStart(2, "0");

/**
 * É um dia que existe no calendário?
 *
 * O padrão sozinho não basta: `2026-02-31` casa com ele e não existe. A ida e a
 * volta por `Date.UTC` acusam — 31 de fevereiro volta como 3 de março. A
 * aritmética aqui é toda em UTC de propósito: data civil não tem fuso, e
 * envolver um faria o dia mudar conforme a máquina de quem filtra.
 */
export function ehDataCivil(valor) {
  if (typeof valor !== "string") return false;
  const casou = FORMATO_DE_DATA_CIVIL.exec(valor.trim());
  if (!casou) return false;
  const [, ano, mes, dia] = casou;
  const instante = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  return (
    instante.getUTCFullYear() === Number(ano) &&
    instante.getUTCMonth() === Number(mes) - 1 &&
    instante.getUTCDate() === Number(dia)
  );
}

/**
 * Soma (ou subtrai) dias de uma data civil, devolvendo outra data civil.
 *
 * Vira mês, vira ano e ano bissexto saem de graça — quem faz a conta é o
 * calendário do `Date`, e não uma soma de milissegundos, que erraria em
 * qualquer fuso com horário de verão.
 */
export function somarDias(dataCivil, dias) {
  if (!ehDataCivil(dataCivil)) return null;
  const [, ano, mes, dia] = FORMATO_DE_DATA_CIVIL.exec(dataCivil.trim());
  const alvo = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia) + dias));
  return `${String(alvo.getUTCFullYear()).padStart(4, "0")}-${dois(
    alvo.getUTCMonth() + 1,
  )}-${dois(alvo.getUTCDate())}`;
}

/**
 * Que dia é hoje **em São Paulo** — e não na máquina de quem abriu o Painel.
 *
 * `paraCampoDeInstante` já responde a pergunta difícil (as partes do instante
 * no fuso do negócio); aqui só se descarta a hora. Perguntar `getDate()` ao
 * `Date` responderia no fuso local, e num navegador em Tóquio "hoje" seria
 * amanhã.
 */
export function diaCivilDoInstante(instante = new Date()) {
  const campo = paraCampoDeInstante(instante);
  return campo === "" ? null : campo.slice(0, 10);
}

/* ─── O Período ──────────────────────────────────────────────────────────── */

/** Sem filtro nenhum — que é diferente de "nenhum dia". */
export const PERIODO_VAZIO = Object.freeze({ de: null, ate: null });

/**
 * O Período em forma canônica: só dia que existe, e nunca de trás para frente.
 *
 * Data que não é dia do calendário vira ausência **aqui**, e vira recusa na
 * camada de dados (`separarPeriodo`) — a distinção é a mesma do filtro de
 * Estado: a tela normaliza o que mostra, a fronteira de rede recusa o que não
 * entende, e nenhuma das duas manda valor torto ao banco.
 *
 * Faixa invertida é TROCADA, não descartada: quem digita 05/09 no "de" e 01/09
 * no "até" pediu esses cinco dias, e devolver lista vazia seria responder à
 * ordem de digitação em vez de à pergunta. A comparação de texto basta porque
 * `AAAA-MM-DD` ordena por texto exatamente como ordena no tempo.
 */
export function normalizarPeriodo(valor) {
  const limpar = (bruto) => (ehDataCivil(bruto) ? bruto.trim() : null);
  const de = limpar(valor?.de);
  const ate = limpar(valor?.ate);
  if (de !== null && ate !== null && de > ate) return { de: ate, ate: de };
  return { de, ate };
}

/** Há alguma ponta pedida? É o que faz o Período contar como busca em curso. */
export function haPeriodo(valor) {
  const { de, ate } = normalizarPeriodo(valor);
  return de !== null || ate !== null;
}

/** Dois Períodos pedem a mesma coisa? Usado para marcar o atalho em vigor. */
export function mesmoPeriodo(a, b) {
  const um = normalizarPeriodo(a);
  const outro = normalizarPeriodo(b);
  return um.de === outro.de && um.ate === outro.ate;
}

/**
 * A faixa de INSTANTES que o Período pede, em UTC — `[desde, ateExclusivo)`.
 *
 * É o que viaja para o banco. `null` em qualquer ponta é "sem limite deste
 * lado": só "de" é "a partir de", só "até" é "até", e nenhum dos dois é
 * ausência de filtro.
 */
export function faixaDeInstantes(valor) {
  const { de, ate } = normalizarPeriodo(valor);
  return {
    desde: de === null ? null : deCampoDeInstante(`${de}T00:00`),
    /* O começo do dia SEGUINTE, exclusive — ver o cabeçalho. */
    ateExclusivo: ate === null ? null : deCampoDeInstante(`${somarDias(ate, 1)}T00:00`),
  };
}

/**
 * O Período por extenso, para o rótulo do controle e para a frase do vazio de
 * busca.
 *
 * Um dia só não vira "01/09/2026 a 01/09/2026": a faixa de um dia é o dia.
 */
export function textoDoPeriodo(valor) {
  const { de, ate } = normalizarPeriodo(valor);
  if (de === null && ate === null) return "";
  if (de !== null && ate !== null) {
    return de === ate
      ? formatarData(de)
      : `${formatarData(de)} a ${formatarData(ate)}`;
  }
  if (de !== null) return `a partir de ${formatarData(de)}`;
  return `até ${formatarData(ate)}`;
}

/**
 * O mesmo Período, mas **encaixável numa frase** — "em 02/09/2026", "de
 * 01/09/2026 a 05/09/2026", "a partir de 01/09/2026", "até 05/09/2026".
 *
 * Existe separado de `textoDoPeriodo` porque as duas situações pedem coisas
 * diferentes: o rótulo do controle é curto e sem preposição, e a frase do vazio
 * de busca precisa de regência. Quem montasse a preposição do lado de fora
 * escreveria "em a partir de 01/09" no primeiro caso de ponta única — e as
 * datas passariam a ter duas grafias, uma no controle e outra na frase.
 */
export function textoDoPeriodoEmFrase(valor) {
  const { de, ate } = normalizarPeriodo(valor);
  if (de === null && ate === null) return "";
  if (de !== null && ate !== null) {
    return de === ate
      ? `em ${formatarData(de)}`
      : `de ${formatarData(de)} a ${formatarData(ate)}`;
  }
  if (de !== null) return `a partir de ${formatarData(de)}`;
  return `até ${formatarData(ate)}`;
}

/* ─── Atalhos ────────────────────────────────────────────────────────────── */

/**
 * O vocabulário FECHADO de atalhos. Cada um responde uma pergunta que alguém
 * faz de verdade ao abrir a listagem, e nenhum inventa um recorte que a pessoa
 * não conseguiria montar à mão nos dois campos.
 *
 * `dias` é o tamanho da janela contando o dia de hoje; `mes` é o único que não
 * tem tamanho fixo, porque o mês não tem.
 */
export const ATALHOS_DE_PERIODO = Object.freeze([
  Object.freeze({ id: "hoje", rotulo: "Hoje", dias: 1 }),
  Object.freeze({ id: "sete-dias", rotulo: "Últimos 7 dias", dias: 7 }),
  Object.freeze({ id: "trinta-dias", rotulo: "Últimos 30 dias", dias: 30 }),
  Object.freeze({ id: "mes", rotulo: "Este mês", dias: null }),
]);

export function ehAtalhoDePeriodo(id) {
  return ATALHOS_DE_PERIODO.some((atalho) => atalho.id === id);
}

/**
 * A faixa de um atalho, ancorada no dia de hoje **no fuso do negócio**.
 *
 * `agora` é argumento, e não uma leitura do relógio escondida lá dentro: é o
 * que torna "últimos 7 dias" uma regra verificável em vez de uma função que só
 * pode ser conferida contra si mesma.
 *
 * Atalho fora do vocabulário devolve Período vazio — nunca uma faixa
 * inventada.
 */
export function faixaDoAtalho(id, agora = new Date()) {
  const atalho = ATALHOS_DE_PERIODO.find((a) => a.id === id) ?? null;
  if (atalho === null) return { ...PERIODO_VAZIO };
  const hoje = diaCivilDoInstante(agora);
  if (hoje === null) return { ...PERIODO_VAZIO };
  if (atalho.dias === null) return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
  return { de: somarDias(hoje, -(atalho.dias - 1)), ate: hoje };
}
