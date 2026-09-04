#!/usr/bin/env node
/**
 * O que mantém o site de pé entre um deploy e outro.
 *
 * Hoje: o ping que impede o Supabase de pausar por inatividade, e o cron que
 * o dispara.
 *
 * ─── AS DUAS GARANTIAS QUE PRECISAM SER AFIRMADAS ────────────────────────
 *
 * **Que a porta não escreve.** Ela existe para tocar no banco, e tocar no
 * banco é a única coisa que ela faz. Um dia alguém vai querer "aproveitar o
 * cron" para limpar uma tabela. A asserção afirma o método que sai e a chave
 * que vai no cabeçalho, então essa mudança acusa aqui antes de rodar.
 *
 * **Que a resposta não é cacheável.** É a falha mais silenciosa desta porta:
 * com a resposta em cache, o cron acerta a borda, nunca chega ao Supabase, e
 * o histórico do cron mostra sucesso todo dia até o projeto pausar.
 *
 * Nada aqui toca rede: o `fetch` é dublê, e é ele que registra o que sairia.
 *
 * Saída: código 0 se tudo passou; 1 em qualquer falha.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import manterAcordado, {
  TABELA,
  pedidoAutorizado,
} from "../api/manter-acordado.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let ok = 0;
let falhas = 0;

function afirmar(nome, condicao, detalhe = "") {
  if (condicao) {
    ok += 1;
    console.log(`  OK    ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

function secao(titulo) {
  console.log(`\n${titulo}\n`);
}

/* ─── Dublês ─────────────────────────────────────────────────────────────── */

function respostaDeMentira() {
  const estado = { status: null, corpo: null, cabecalhos: {} };
  const res = {
    setHeader(nome, valor) {
      estado.cabecalhos[nome] = valor;
    },
    status(codigo) {
      estado.status = codigo;
      return res;
    },
    json(corpo) {
      estado.corpo = corpo;
      return res;
    },
  };
  return { estado, res };
}

function bancoDeMentira({ status = 200, corpo = [{ id: "1" }] } = {}) {
  const chamadas = [];
  const buscar = async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    if (status === 0) throw new Error("rede caiu");
    return new Response(JSON.stringify(corpo), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { chamadas, buscar };
}

/** Roda a porta com um ambiente controlado, e devolve tudo o que aconteceu. */
async function chamar({ metodo = "GET", cabecalhos = {}, ambiente = {}, banco } = {}) {
  const b = banco ?? bancoDeMentira();
  const { estado, res } = respostaDeMentira();

  const guardado = { ...process.env };
  for (const nome of [
    "SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "SUPABASE_CHAVE_PUBLICAVEL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_CHAVE_DE_SERVICO",
    "CRON_SECRET",
  ]) {
    delete process.env[nome];
  }
  Object.assign(process.env, ambiente);

  try {
    await manterAcordado({ method: metodo, headers: cabecalhos }, res, b.buscar);
  } finally {
    for (const nome of Object.keys(process.env)) delete process.env[nome];
    Object.assign(process.env, guardado);
  }

  return { estado, chamadas: b.chamadas };
}

const CHAVE_PUBLICAVEL = "sb_publishable_CHAVE_DE_MENTIRA";
const CHAVE_DE_SERVICO = "sb_secret_ESTA_NAO_PODE_APARECER";

const AMBIENTE = Object.freeze({
  VITE_SUPABASE_URL: "https://exemplo.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: CHAVE_PUBLICAVEL,
  // Presente no ambiente de propósito: é assim em produção, e a asserção
  // precisa provar que ela está lá E não é usada.
  SUPABASE_CHAVE_DE_SERVICO: CHAVE_DE_SERVICO,
});

/* ═══ (a) A porta não escreve ══════════════════════════════════════════════ */

secao("(a) O ping lê, e só lê");

{
  const { estado, chamadas } = await chamar({ ambiente: AMBIENTE });

  afirmar("responde 200 quando o banco responde", estado.status === 200);
  afirmar("e diz que está acordado", estado.corpo?.acordado === true);
  afirmar("uma chamada ao banco, não mais", chamadas.length === 1);

  const { url, opcoes } = chamadas[0] ?? {};
  afirmar(
    "o método que SAI é GET, escrito e não presumido",
    opcoes?.method === "GET",
    String(opcoes?.method),
  );
  afirmar(
    "nenhum corpo é enviado",
    opcoes?.body === undefined || opcoes?.body === null,
  );
  afirmar(
    "consulta a tabela declarada, com teto de uma linha",
    typeof url === "string" &&
      url.includes(`/rest/v1/${TABELA}`) &&
      url.includes("limit=1") &&
      url.includes("select=id"),
    String(url),
  );
}

/* ═══ (b) A chave é a publicável, nunca a de serviço ═══════════════════════ */

secao("(b) A chave de serviço está no ambiente, e não é usada");

{
  const { chamadas } = await chamar({ ambiente: AMBIENTE });
  const cabecalhos = chamadas[0]?.opcoes?.headers ?? {};
  const serializado = JSON.stringify({ url: chamadas[0]?.url, cabecalhos });

  afirmar(
    "a chave publicável vai no `apikey`",
    cabecalhos.apikey === CHAVE_PUBLICAVEL,
  );
  afirmar(
    "e no `Authorization`, que é o que o PostgREST lê",
    cabecalhos.Authorization === `Bearer ${CHAVE_PUBLICAVEL}`,
  );
  // A garantia negativa, afirmada pelo VALOR e não pela chave do objeto: quem
  // trocar a variável de nome não escapa desta.
  afirmar(
    "a chave de serviço NÃO aparece em lugar nenhum da requisição",
    !serializado.includes(CHAVE_DE_SERVICO),
  );
}

/* ═══ (c) A resposta nunca é cacheável ═════════════════════════════════════ */

secao("(c) `no-store` em toda saída, senão o cron nunca chega ao banco");

const SAIDAS = [
  ["sucesso", { ambiente: AMBIENTE }],
  ["método recusado", { metodo: "POST", ambiente: AMBIENTE }],
  ["banco fora do ar", { ambiente: AMBIENTE, banco: bancoDeMentira({ status: 0 }) }],
  ["banco recusando", { ambiente: AMBIENTE, banco: bancoDeMentira({ status: 401 }) }],
  ["sem configuração", { ambiente: {} }],
  [
    "segredo errado",
    {
      ambiente: { ...AMBIENTE, CRON_SECRET: "o-segredo-certo" },
      cabecalhos: { authorization: "Bearer o-errado" },
    },
  ],
];

for (const [nome, argumentos] of SAIDAS) {
  const { estado } = await chamar(argumentos);
  afirmar(
    `a saída de \`${nome}\` leva \`Cache-Control: no-store\``,
    estado.cabecalhos["Cache-Control"] === "no-store",
    String(estado.cabecalhos["Cache-Control"]),
  );
}

/* ═══ (d) O que a porta recusa ═════════════════════════════════════════════ */

secao("(d) Método, configuração e segredo");

for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
  const { estado, chamadas } = await chamar({ metodo, ambiente: AMBIENTE });
  afirmar(
    `\`${metodo}\` responde 405 e NÃO toca no banco`,
    estado.status === 405 && chamadas.length === 0,
  );
}

{
  const { estado, chamadas } = await chamar({ ambiente: {} });
  afirmar(
    "sem configuração responde 500 sem chamar o banco",
    estado.status === 500 && chamadas.length === 0,
  );
}

{
  const { estado } = await chamar({
    ambiente: AMBIENTE,
    banco: bancoDeMentira({ status: 0 }),
  });
  afirmar("banco sem resposta vira 503, e o cron enxerga a falha", estado.status === 503);
}

{
  const { estado } = await chamar({
    ambiente: AMBIENTE,
    banco: bancoDeMentira({ status: 500 }),
  });
  afirmar("banco respondendo erro também vira 503", estado.status === 503);
}

afirmar(
  "sem `CRON_SECRET` declarado a porta fica aberta, e o cron não falha em silêncio",
  pedidoAutorizado({}, {}) === true,
);
afirmar(
  "com `CRON_SECRET` declarado, o segredo passa a ser exigido",
  pedidoAutorizado({}, { CRON_SECRET: "s3gr3d0" }) === false &&
    pedidoAutorizado({ authorization: "Bearer errado" }, { CRON_SECRET: "s3gr3d0" }) === false &&
    pedidoAutorizado({ authorization: "Bearer s3gr3d0" }, { CRON_SECRET: "s3gr3d0" }) === true,
);

{
  const { estado, chamadas } = await chamar({
    ambiente: { ...AMBIENTE, CRON_SECRET: "o-segredo-certo" },
    cabecalhos: { authorization: "Bearer o-errado" },
  });
  afirmar(
    "segredo errado responde 401 sem tocar no banco",
    estado.status === 401 && chamadas.length === 0,
  );
}

{
  const { estado, chamadas } = await chamar({
    ambiente: { ...AMBIENTE, CRON_SECRET: "o-segredo-certo" },
    cabecalhos: { authorization: "Bearer o-segredo-certo" },
  });
  afirmar(
    "segredo certo passa e o ping acontece",
    estado.status === 200 && chamadas.length === 1,
  );
}

/* ═══ (e) O cron declarado ═════════════════════════════════════════════════ */

secao("(e) O `vercel.json` dispara essa porta, e uma vez por dia");

const vercel = JSON.parse(readFileSync(path.join(raiz, "vercel.json"), "utf8"));
const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
const oNosso = crons.find((c) => c?.path === "/api/manter-acordado");

afirmar("existe um cron para `/api/manter-acordado`", oNosso !== undefined);
afirmar(
  "com cinco campos de agendamento",
  typeof oNosso?.schedule === "string" && oNosso.schedule.trim().split(/\s+/).length === 5,
  String(oNosso?.schedule),
);
{
  // Diário: dia do mês, mês e dia da semana são coringa, e a hora é fixa. Um
  // agendamento mais raro que isso não cabe na janela de sete dias com folga,
  // e o plano gratuito da Vercel não aceita mais frequente que diário.
  const campos = String(oNosso?.schedule ?? "").trim().split(/\s+/);
  const [minuto, hora, diaDoMes, mes, diaDaSemana] = campos;
  afirmar(
    "roda todo dia, em hora fixa",
    diaDoMes === "*" &&
      mes === "*" &&
      diaDaSemana === "*" &&
      /^\d{1,2}$/.test(minuto ?? "") &&
      /^\d{1,2}$/.test(hora ?? ""),
    campos.join(" "),
  );
}
afirmar(
  "a porta existe como função, e o cron não aponta para o vazio",
  readFileSync(path.join(raiz, "api", "manter-acordado.js"), "utf8").includes(
    "export default async function handler",
  ),
);

/* ─── Fecho ──────────────────────────────────────────────────────────────── */

console.log("");
if (falhas > 0) {
  console.log(`Entrega NÃO verificada: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log(`Entrega verificada: ${ok} asserções passaram.`);
}
