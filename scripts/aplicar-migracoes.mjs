#!/usr/bin/env node
/**
 * Aplicador de migrações do Supabase (Story 1.2).
 *
 * Lê `supabase/migrations/*.sql` em ordem lexicográfica, consulta
 * `supabase_migrations.schema_migrations` no projeto remoto, aplica só o que
 * falta pela Management API e registra a versão aplicada no mesmo formato que
 * o CLI lê — de modo que quem tiver a senha do banco depois pode usar
 * `supabase db push` normalmente: os dois caminhos leem o mesmo registro.
 *
 * `npx supabase db push` exige a senha do banco, que não está no ambiente;
 * o `SUPABASE_ACCESS_TOKEN` está. Daí este caminho.
 *
 * Uso:
 *   npm run supabase:migrar -- --dry-run   lista o que aplicaria, sem escrever
 *   npm run supabase:migrar                aplica o que falta
 *
 * O token nunca é impresso, ecoado nem registrado em log.
 * Saída: código 0 se o remoto ficou em dia; 1 em qualquer falha.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  analisarSql,
  comandosSql,
  dirMigracoes,
  executarScript,
  executarSql,
  parar,
  listarMigracoes,
  literal,
  literalArray,
  lerToken,
  NOME_PROJETO,
  raiz,
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

/* ─── Pré-condições ──────────────────────────────────────────────────────── */

// Argumento não reconhecido para antes de qualquer escrita: `--dryrun` digitado
// errado não pode virar aplicação real em produção por omissão.
if (desconhecidos.length > 0) {
  falhar(
    `argumento não reconhecido: ${desconhecidos.join(", ")}. Use ${FLAGS.join(" ou ")} para simular, ou nenhum argumento para aplicar.`,
  );
}

console.log(
  `Projeto alvo: ${NOME_PROJETO} (${REF_PROJETO})${simulacao ? "  [simulação]" : ""}`,
);

const token = lerToken();
if (!token) {
  falhar(
    "SUPABASE_ACCESS_TOKEN ausente no ambiente. Sem ele não há como falar com a Management API.",
  );
}

const migracoes = listarMigracoes();
if (migracoes.length === 0) {
  falhar(
    `nenhuma migração em ${path.relative(raiz, dirMigracoes)} — nada a aplicar, e um diretório vazio aqui é sintoma, não estado válido.`,
  );
}

const invalidas = migracoes.filter((m) => !m.valida);
if (invalidas.length > 0) {
  falhar(
    `nome de migração sem carimbo de tempo válido (esperado <AAAAMMDDHHMMSS>_<nome>.sql): ${invalidas
      .map((m) => m.nome)
      .join(", ")}`,
  );
}

/* ─── Registro de versões ────────────────────────────────────────────────── */

const DDL_REGISTRO = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
`;

async function registroRemoto() {
  const resposta = await executarSql(
    token,
    "select version, statements from supabase_migrations.schema_migrations order by version",
  );
  if (resposta.ok) {
    const linhas = Array.isArray(resposta.dados) ? resposta.dados : [];
    return new Map(
      linhas.map((linha) => [String(linha.version), linha.statements ?? null]),
    );
  }
  // Projeto ainda sem o registro: a tabela não existe. O casamento é estreito
  // de propósito — "does not exist" solto casaria com erro de outra natureza e
  // faria o script concluir que nada foi aplicado.
  if (
    /42p01|3f000/i.test(resposta.erro ?? "") ||
    /relation .*schema_migrations.* does not exist/i.test(resposta.erro ?? "") ||
    /schema "supabase_migrations" does not exist/i.test(resposta.erro ?? "")
  ) {
    return new Map();
  }
  falhar(`não foi possível ler o registro de migrações: ${resposta.erro}`);
  return new Map();
}

const registro = await registroRemoto();
const jaAplicadas = new Set(registro.keys());
const pendentes = migracoes.filter((m) => !jaAplicadas.has(m.versao));

// Migração já aplicada que mudou no disco: o repositório e o banco divergiram
// e ninguém saberia — o filtro por versão pularia o arquivo em silêncio.
const alteradas = [];
for (const m of migracoes) {
  if (!jaAplicadas.has(m.versao)) continue;
  const registrados = registro.get(m.versao);
  if (!Array.isArray(registrados)) continue; // registro antigo, sem comparação possível
  const atuais = comandosSql(readFileSync(m.caminho, "utf8")).map((c) => c.bruto);
  const igual =
    registrados.length === atuais.length &&
    registrados.every((s, i) => String(s).trim() === atuais[i].trim());
  if (!igual) alteradas.push(m.nome);
}
if (alteradas.length > 0) {
  falhar(
    `migração já aplicada foi editada depois: ${alteradas.join(", ")}. ` +
      "Migração aplicada é registro histórico — crie uma migração nova em vez de reescrever esta.",
  );
}

console.log(`\nMigrações no repositório (${migracoes.length}):`);
for (const m of migracoes) {
  const estado = jaAplicadas.has(m.versao) ? "aplicada " : "pendente ";
  console.log(`  ${estado} ${m.nome}`);
}

const orfas = [...jaAplicadas].filter(
  (v) => !migracoes.some((m) => m.versao === v),
);
if (orfas.length > 0) {
  console.log(
    `\nAviso: versões registradas no remoto sem arquivo correspondente: ${orfas.join(", ")}`,
  );
}

if (pendentes.length === 0) {
  console.log("\nRemoto já está em dia: nenhuma migração pendente.");
  return;
}

if (simulacao) {
  console.log(`\nAplicaria ${pendentes.length} migração(ões), nesta ordem:`);
  for (const m of pendentes) {
    const conteudo = readFileSync(m.caminho, "utf8");
    console.log(
      `  ${m.nome}  (${comandosSql(conteudo).length} comando(s), ${Buffer.byteLength(conteudo, "utf8")} bytes)`,
    );
  }
  console.log("\nSimulação: nada foi escrito no projeto remoto.");
  return;
}

/* ─── Aplicação ──────────────────────────────────────────────────────────── */

const preparo = await executarSql(token, DDL_REGISTRO);
if (!preparo.ok) {
  falhar(`não foi possível preparar o registro de migrações: ${preparo.erro}`);
}

console.log("");
for (const m of pendentes) {
  const conteudo = readFileSync(m.caminho, "utf8");
  const analise = analisarSql(conteudo);
  if (analise.problemas.length > 0) {
    falhar(`${m.nome} está malformada: ${analise.problemas.join("; ")}`);
  }
  const comandos = comandosSql(conteudo).map((c) => c.bruto);
  if (comandos.length === 0) {
    falhar(
      `${m.nome} não contém comando algum — registrar uma versão sem DDL faria o remoto parecer em dia sem estar.`,
    );
  }

  // O endpoint é transacional: o arquivo inteiro entra ou nada entra.
  const aplicacao = await executarSql(token, conteudo);
  if (!aplicacao.ok) {
    falhar(
      `${m.nome} não foi aplicada (nada foi gravado — o endpoint desfaz o arquivo inteiro): ${aplicacao.erro}`,
    );
  }

  const anotacao = await executarSql(
    token,
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values (${literal(m.versao)}, ${literal(m.rotulo)}, ${literalArray(comandos)})
     on conflict (version) do update
       set name = excluded.name, statements = excluded.statements`,
  );
  if (!anotacao.ok) {
    falhar(
      `${m.nome} foi aplicada mas a versão NÃO foi registrada — corrija antes de rodar de novo: ${anotacao.erro}`,
    );
  }

  console.log(`  aplicada  ${m.nome}  (versão ${m.versao} registrada)`);
}

/* ─── Confirmação por releitura ──────────────────────────────────────────── */

const depois = await registroRemoto();
const faltando = migracoes.filter((m) => !depois.has(m.versao)).map((m) => m.nome);
if (faltando.length > 0) {
  falhar(
    `releitura do registro não confirmou: ${faltando.join(", ")} ainda ausente(s) em supabase_migrations.schema_migrations`,
  );
}

console.log(
  `\nRemoto em dia: ${migracoes.length} migração(ões) registrada(s) em supabase_migrations.schema_migrations.`,
);

});
