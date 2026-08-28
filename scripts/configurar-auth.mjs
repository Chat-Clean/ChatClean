#!/usr/bin/env node
/**
 * Configurador de autenticação do projeto Supabase (Story 1.2).
 *
 * Fecha o registro público (`disable_signup: true`) pela Management API e
 * relê a configuração para confirmar. É a metade do critério de aceite que
 * não vive em SQL: não há autosserviço no Painel, e contas são criadas
 * apenas pelo console do Supabase.
 *
 * Uso:
 *   npm run supabase:auth -- --dry-run   mostra o estado atual, sem alterar
 *   npm run supabase:auth                fecha o registro público
 *
 * O token nunca é impresso, ecoado nem registrado em log.
 * Saída: código 0 se o registro está fechado ao fim; 1 em qualquer falha.
 */

import {
  alterarConfigAuth,
  executarScript,
  lerConfigAuth,
  parar,
  lerToken,
  NOME_PROJETO,
  REF_PROJETO,
} from "./supabase-comum.mjs";

const FLAGS = ["--dry-run", "--simular"];
const argumentos = process.argv.slice(2);
const desconhecidos = argumentos.filter((a) => !FLAGS.includes(a));
const simulacao = argumentos.some((a) => FLAGS.includes(a));

// `parar()` lança; o topo traduz em código de saída. Nunca `process.exit()`:
// ver a nota em supabase-comum.mjs sobre o libuv no Windows.
const falhar = parar;

await executarScript(async () => {

console.log(
  `Projeto alvo: ${NOME_PROJETO} (${REF_PROJETO})${simulacao ? "  [simulação]" : ""}`,
);

const token = lerToken();
if (!token) {
  falhar(
    "SUPABASE_ACCESS_TOKEN ausente no ambiente. Sem ele não há como falar com a Management API.",
  );
}

// Argumento não reconhecido para antes de qualquer escrita.
if (desconhecidos.length > 0) {
  falhar(
    `argumento não reconhecido: ${desconhecidos.join(", ")}. Use ${FLAGS.join(" ou ")} para simular, ou nenhum argumento para aplicar.`,
  );
}

const antes = await lerConfigAuth(token);
if (!antes.ok) falhar(`não foi possível ler a configuração de auth: ${antes.erro}`);
if (!antes.dados || typeof antes.dados !== "object") {
  falhar("GET /config/auth respondeu sem corpo — não dá para saber o estado atual.");
}

console.log(`\n  disable_signup antes: ${antes.dados.disable_signup}`);

if (antes.dados.disable_signup === true) {
  console.log("  Registro público já está fechado — nada a alterar.");
  return;
}

if (simulacao) {
  console.log("\nSimulação: aplicaria `disable_signup: true`. Nada foi alterado.");
  return;
}

const alteracao = await alterarConfigAuth(token, { disable_signup: true });
if (!alteracao.ok) {
  falhar(`PATCH /config/auth recusado: ${alteracao.erro}`);
}

// Releitura: a resposta do PATCH é o que a API diz ter feito; a releitura é o
// que o projeto de fato passou a valer.
const depois = await lerConfigAuth(token);
if (!depois.ok) {
  falhar(`não foi possível reler a configuração de auth: ${depois.erro}`);
}

console.log(`  disable_signup depois: ${depois.dados.disable_signup}`);

if (depois.dados.disable_signup !== true) {
  falhar(
    "a releitura não confirmou o fechamento: `disable_signup` continua diferente de true.",
  );
}

console.log("\nRegistro público fechado e confirmado por releitura.");

});
