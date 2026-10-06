#!/usr/bin/env node
/**
 * A sincronização das buscas do Google.
 *
 * Copia para `public.buscas_do_google` o que o Search Console mede do site:
 * cliques, impressões e posição média, por dia, em quatro recortes — o site
 * inteiro, cada página, cada termo de busca, e cada termo dentro de cada
 * página. O Painel lê do banco, e nunca do Google.
 *
 * ─── POR QUE COPIAR, E NÃO CONSULTAR NA HORA ──────────────────────────────
 *
 * A chave que fala com o Google é segredo e não pode chegar ao navegador. O
 * dado já chega com dois ou três dias de atraso, então consultá-lo ao vivo não
 * o deixaria mais fresco. E o Google guarda dezesseis meses: o que for copiado
 * fica.
 *
 * ─── TODA EXECUÇÃO REFAZ OS ÚLTIMOS DIAS ──────────────────────────────────
 *
 * O Google revisa os números dos dias recentes. Por isso cada execução pede de
 * novo os últimos `--dias` (dez, por padrão) e GRAVA POR CIMA: a chave da
 * tabela é (dia, página, termo), e a mesma linha é substituída, nunca somada.
 * Rodar duas vezes no mesmo dia dá o mesmo banco que rodar uma.
 *
 * ─── SEM DEPENDÊNCIA ──────────────────────────────────────────────────────
 *
 * A conta de serviço assina um JWT e o troca por um token: são trinta linhas
 * com o `crypto` do Node. A biblioteca oficial do Google traria dezenas de
 * megabytes para fazer o mesmo pedido.
 *
 * ─── SEGREDOS ─────────────────────────────────────────────────────────────
 *
 * Os dois vêm do AMBIENTE, e nunca de arquivo do repositório:
 *
 *   GOOGLE_CONTA_DE_SERVICO    o JSON da chave da conta de serviço, inteiro
 *   SUPABASE_CHAVE_DE_SERVICO  a chave de serviço do Supabase. É a que ESCREVE.
 *
 * Nenhum dos dois é impresso, nem em mensagem de erro.
 *
 * Uso:
 *   node scripts/sincronizar-buscas.mjs                os últimos 10 dias
 *   node scripts/sincronizar-buscas.mjs --dias=480     a primeira carga
 *   node scripts/sincronizar-buscas.mjs --dry-run      busca e conta, sem gravar
 *
 * Saída: 0 quando gravou (ou simulou), 1 quando algo falhou, 2 quando falta
 * configuração.
 */

import { createSign } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** A propriedade do Search Console. É o endereço oficial do site, com a barra. */
export const SITE_PADRAO = "https://chatclean.com.br/";

/** O projeto do Supabase, quando o ambiente não declara outro. */
const URL_PADRAO_DO_BANCO = "https://wvuaztlzifukmybtdbfh.supabase.co";

/** Só leitura: a sincronização não altera nada no Search Console. */
const ESCOPO = "https://www.googleapis.com/auth/webmasters.readonly";

/** O teto de linhas por pedido que o Google aceita. */
const LINHAS_POR_PEDIDO = 25000;

/** Quantas linhas vão por gravação. */
const LINHAS_POR_GRAVACAO = 500;

/** Os tetos da tabela. Texto maior que isso é cortado, e não recusado. */
const TAMANHO_MAXIMO_DA_PAGINA = 2048;
const TAMANHO_MAXIMO_DO_TERMO = 512;

/**
 * Os quatro recortes, cada um com as dimensões que pede ao Google.
 *
 * São pedidos em SEPARADO porque não se somam: com a dimensão de termo o Google
 * omite as buscas raras, por privacidade, e a soma dos termos de uma página
 * fica menor que o total da página.
 */
export const RECORTES = Object.freeze([
  Object.freeze({ nome: "site", dimensoes: Object.freeze(["date"]) }),
  Object.freeze({ nome: "páginas", dimensoes: Object.freeze(["date", "page"]) }),
  Object.freeze({ nome: "termos", dimensoes: Object.freeze(["date", "query"]) }),
  Object.freeze({ nome: "termos por página", dimensoes: Object.freeze(["date", "page", "query"]) }),
]);

/* ─── O período ──────────────────────────────────────────────────────────── */

/** `AAAA-MM-DD` de um instante, em UTC. */
function diaDe(instante) {
  return new Date(instante).toISOString().slice(0, 10);
}

/**
 * O período pedido: os últimos `dias` dias, hoje incluído.
 *
 * Os dias do Search Console são do fuso do Pacífico, e não do nosso. Não há
 * conversão a fazer: a data é a que o Google devolve em cada linha, e é ela que
 * é gravada. O período só diz ATÉ ONDE pedir.
 */
export function periodoDe(dias, agora = Date.now()) {
  const quantos = Number.isInteger(dias) && dias >= 1 ? Math.min(dias, 480) : 10;
  return {
    startDate: diaDe(agora - (quantos - 1) * 86400000),
    endDate: diaDe(agora),
  };
}

/* ─── A conta de serviço ─────────────────────────────────────────────────── */

const base64url = (texto) => Buffer.from(texto).toString("base64url");

/**
 * O JWT que a conta de serviço assina para pedir um token de acesso.
 *
 * Vale por uma hora, que é o máximo que o Google aceita, e carrega só o escopo
 * de leitura.
 */
export function jwtDaContaDeServico(conta, agora = Date.now()) {
  const emitido = Math.floor(agora / 1000);
  const cabeca = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: conta.client_email,
      scope: ESCOPO,
      aud: conta.token_uri,
      iat: emitido,
      exp: emitido + 3600,
    }),
  );
  const assinatura = createSign("RSA-SHA256")
    .update(`${cabeca}.${corpo}`)
    .sign(conta.private_key)
    .toString("base64url");
  return `${cabeca}.${corpo}.${assinatura}`;
}

/** A conta de serviço lida do ambiente, ou a frase do que falta nela. */
export function lerContaDeServico(bruto) {
  if (typeof bruto !== "string" || bruto.trim() === "") {
    return { ok: false, defeito: "GOOGLE_CONTA_DE_SERVICO não está no ambiente." };
  }
  let conta;
  try {
    conta = JSON.parse(bruto);
  } catch {
    return { ok: false, defeito: "GOOGLE_CONTA_DE_SERVICO não é um JSON válido. Cole o arquivo da chave inteiro." };
  }
  for (const campo of ["client_email", "private_key", "token_uri"]) {
    if (typeof conta?.[campo] !== "string" || conta[campo] === "") {
      return { ok: false, defeito: `GOOGLE_CONTA_DE_SERVICO não tem o campo ${campo}.` };
    }
  }
  return { ok: true, conta };
}

async function tokenDoGoogle(conta) {
  const resposta = await fetch(conta.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwtDaContaDeServico(conta),
    }),
    signal: AbortSignal.timeout(30000),
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || typeof corpo.access_token !== "string") {
    /* O que o Google devolve aqui é o nome do erro, e não o segredo. */
    throw new Error(
      `o Google recusou a conta de serviço (HTTP ${resposta.status}): ${corpo.error_description ?? corpo.error ?? "sem detalhe"}`,
    );
  }
  return corpo.access_token;
}

/* ─── Do Google para a tabela ────────────────────────────────────────────── */

/**
 * O caminho de uma página, sem o domínio. `null` quando não é endereço.
 *
 * Só o caminho: a consulta (`?utm_…`) sai, porque a mesma página com dois
 * parâmetros de campanha é a mesma página.
 */
export function caminhoDaPagina(endereco) {
  try {
    const caminho = new URL(String(endereco)).pathname || "/";
    return caminho.slice(0, TAMANHO_MAXIMO_DA_PAGINA);
  } catch {
    return null;
  }
}

/**
 * As linhas do Google, na forma da tabela.
 *
 * `dimensoes` diz o que cada posição de `keys` é. Linha sem data utilizável, ou
 * com página que não é endereço, é descartada: é melhor faltar uma linha do que
 * gravar uma que ninguém consegue ler de volta.
 */
export function linhasDaTabela(linhasDoGoogle, dimensoes) {
  const saida = [];
  for (const linha of Array.isArray(linhasDoGoogle) ? linhasDoGoogle : []) {
    const chaves = Array.isArray(linha?.keys) ? linha.keys : [];
    const valorDe = (dimensao) => {
      const i = dimensoes.indexOf(dimensao);
      return i === -1 ? null : chaves[i];
    };
    const dia = valorDe("date");
    if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;

    let pagina = "";
    if (dimensoes.includes("page")) {
      pagina = caminhoDaPagina(valorDe("page"));
      if (pagina === null) continue;
    }
    let termo = "";
    if (dimensoes.includes("query")) {
      termo = String(valorDe("query") ?? "").trim().slice(0, TAMANHO_MAXIMO_DO_TERMO);
      if (termo === "") continue;
    }
    saida.push({
      dia,
      pagina,
      termo,
      cliques: Math.max(0, Math.round(Number(linha.clicks) || 0)),
      impressoes: Math.max(0, Math.round(Number(linha.impressions) || 0)),
      posicao: Math.max(0, Number(linha.position) || 0),
    });
  }
  return juntarRepetidas(saida);
}

/**
 * Junta as linhas que caíram na MESMA chave.
 *
 * Acontece quando dois endereços do Google viram o mesmo caminho — a página
 * com e sem parâmetro de campanha. Duas linhas com a mesma chave na mesma
 * gravação fazem o banco recusar o lote inteiro. Cliques e impressões somam; a
 * posição é a média ponderada pelas impressões, que é a única média de posição
 * que significa alguma coisa.
 */
export function juntarRepetidas(linhas) {
  const porChave = new Map();
  for (const linha of linhas) {
    const chave = `${linha.dia}\u0000${linha.pagina}\u0000${linha.termo}`;
    const anterior = porChave.get(chave);
    if (anterior === undefined) {
      porChave.set(chave, { ...linha });
      continue;
    }
    const impressoes = anterior.impressoes + linha.impressoes;
    anterior.posicao =
      impressoes > 0
        ? (anterior.posicao * anterior.impressoes + linha.posicao * linha.impressoes) / impressoes
        : 0;
    anterior.cliques += linha.cliques;
    anterior.impressoes = impressoes;
  }
  return [...porChave.values()].map((linha) => ({
    ...linha,
    posicao: Math.round(linha.posicao * 100) / 100,
  }));
}

/* ─── Os dois pedidos de rede ────────────────────────────────────────────── */

async function buscarRecorte({ token, site, periodo, dimensoes }) {
  const endereco = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const todas = [];
  for (let inicio = 0; ; inicio += LINHAS_POR_PEDIDO) {
    const resposta = await fetch(endereco, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...periodo,
        dimensions: dimensoes,
        rowLimit: LINHAS_POR_PEDIDO,
        startRow: inicio,
      }),
      signal: AbortSignal.timeout(60000),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new Error(
        `o Search Console recusou o pedido (HTTP ${resposta.status}): ${corpo?.error?.message ?? "sem detalhe"}`,
      );
    }
    const linhas = Array.isArray(corpo.rows) ? corpo.rows : [];
    todas.push(...linhas);
    if (linhas.length < LINHAS_POR_PEDIDO) break;
  }
  return todas;
}

async function gravar({ banco, chave, linhas }) {
  for (let i = 0; i < linhas.length; i += LINHAS_POR_GRAVACAO) {
    const resposta = await fetch(`${banco}/rest/v1/buscas_do_google?on_conflict=dia,pagina,termo`, {
      method: "POST",
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
        /* Grava por cima da linha que já existe: é o que faz rodar duas vezes
           dar o mesmo resultado que rodar uma. */
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(linhas.slice(i, i + LINHAS_POR_GRAVACAO)),
      signal: AbortSignal.timeout(60000),
    });
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => "");
      throw new Error(`o banco recusou a gravação (HTTP ${resposta.status}): ${texto.slice(0, 300)}`);
    }
  }
}

/* ─── A execução ─────────────────────────────────────────────────────────── */

async function principal() {
  const args = process.argv.slice(2);
  const simulacao = args.includes("--dry-run");
  const diasPedidos = Number(args.find((a) => a.startsWith("--dias="))?.slice("--dias=".length));
  const periodo = periodoDe(Number.isInteger(diasPedidos) ? diasPedidos : 10);

  const site = (process.env.SITE_DO_SEARCH_CONSOLE ?? "").trim() || SITE_PADRAO;
  const banco = ((process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim() || URL_PADRAO_DO_BANCO).replace(/\/+$/, "");
  const chave = (process.env.SUPABASE_CHAVE_DE_SERVICO ?? "").trim();

  const lida = lerContaDeServico(process.env.GOOGLE_CONTA_DE_SERVICO);
  if (!lida.ok) {
    console.error(`FALTA CONFIGURAÇÃO — ${lida.defeito}`);
    process.exitCode = 2;
    return;
  }
  if (!simulacao && chave === "") {
    console.error("FALTA CONFIGURAÇÃO — SUPABASE_CHAVE_DE_SERVICO não está no ambiente. Use --dry-run para só conferir a leitura do Google.");
    process.exitCode = 2;
    return;
  }

  console.log(`Propriedade: ${site}`);
  console.log(`Período: ${periodo.startDate} a ${periodo.endDate}${simulacao ? "  [simulação: nada será gravado]" : ""}`);

  try {
    const token = await tokenDoGoogle(lida.conta);
    let total = 0;
    for (const recorte of RECORTES) {
      const doGoogle = await buscarRecorte({ token, site, periodo, dimensoes: recorte.dimensoes });
      const linhas = linhasDaTabela(doGoogle, recorte.dimensoes);
      if (!simulacao && linhas.length > 0) await gravar({ banco, chave, linhas });
      total += linhas.length;
      console.log(`  ${recorte.nome.padEnd(18)} ${String(linhas.length).padStart(6)} linha(s)`);
    }
    console.log(simulacao ? `Simulação: ${total} linha(s) seriam gravadas.` : `Gravado: ${total} linha(s).`);
    if (total === 0) {
      console.log(
        "O Google não devolveu linha nenhuma. Em propriedade recém-verificada isso é normal nos primeiros dias; se persistir, confira se a conta de serviço foi adicionada como usuário da propriedade.",
      );
    }
  } catch (erro) {
    console.error(`FALHOU — ${String(erro?.message ?? erro)}`);
    process.exitCode = 1;
  }
}

const executadoDiretamente =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDiretamente) await principal();
