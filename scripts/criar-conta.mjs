#!/usr/bin/env node
/**
 * Criação de Conta do Painel (Stories 1.3 e 1.4).
 *
 * Com o registro público fechado (Story 1.2) e sem convite nem recuperação de
 * senha no escopo do épico, esta é a ÚNICA via de onboarding.
 *
 * Uso:
 *   npm run conta:criar -- --email pessoa@chatclean.com.br --nome "Nome Completo"
 *   npm run conta:criar -- --email … --nome … --dry-run   valida sem escrever
 *   npm run conta:remover -- --email pessoa@chatclean.com.br
 *
 * A senha NUNCA vem por argumento: linha de comando aparece em histórico de
 * shell e na lista de processos da máquina. Ela é digitada sem eco, duas vezes,
 * ou lida de `SUPABASE_SENHA_DA_CONTA` quando não há terminal interativo. Não é
 * impressa, ecoada, gravada em arquivo nem registrada em log — o script sequer
 * a mantém depois de montar o hash.
 *
 * ─── Por que SQL e não a Admin API ──────────────────────────────────────────
 *
 * A Admin API (`POST /auth/v1/admin/users`) exige a chave de SERVIÇO. Buscá-la
 * para criar uma conta faria um segredo de escrita circular por script local e
 * por variável de ambiente, contra AD-19. A Management API já executa SQL com
 * privilégio suficiente e usa o token de conta que o ambiente já tem.
 *
 * ─── A armadilha do INSERT, verificada antes de escrever isto ───────────────
 *
 * Inserir só os campos óbvios cria uma Conta que EXISTE, dispara o gatilho do
 * perfil e não consegue autenticar: o login devolve `500 unexpected_failure /
 * "Database error querying schema"`. O GoTrue lê as colunas de token como texto
 * não-nulo, e um INSERT que as deixa NULL quebra a leitura. Por isso as oito
 * são preenchidas com string vazia, explicitamente — quatro delas não têm
 * default e nasceriam NULL.
 */

import { Writable } from "node:stream";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  executarScript,
  executarSql,
  lerToken,
  literal,
  NOME_PROJETO,
  parar,
  REF_PROJETO,
  registrarSegredo,
  sanitizar,
} from "./supabase-comum.mjs";

/** GoTrue lê estas oito como texto; NULL nelas quebra o login. */
export const COLUNAS_DE_TOKEN = [
  "confirmation_token",
  "recovery_token",
  "email_change",
  "email_change_token_new",
  "email_change_token_current",
  "phone_change",
  "phone_change_token",
  "reauthentication_token",
];

export const TAMANHO_MINIMO_DA_SENHA = 10;

/**
 * bcrypt trunca a entrada em 72 BYTES e não avisa: acima disso, duas senhas
 * diferentes que compartilham os 72 primeiros bytes abrem a mesma Conta. A
 * contagem é em bytes, não em caracteres — acento ocupa dois em UTF-8, e uma
 * senha de 70 caracteres acentuados já passaria do limite.
 */
export const TAMANHO_MAXIMO_DA_SENHA_EM_BYTES = 72;

/**
 * SQL que cria a Conta completa: a linha em `auth.users`, a identidade de
 * e-mail que o GoTrue espera, e — pelo gatilho `on_auth_user_created` da Story
 * 1.2 — o perfil com o nome de exibição.
 *
 * Tudo em UM comando: o endpoint de query da Management API é transacional por
 * requisição, então ou nasce Conta com identidade e perfil, ou não nasce nada.
 * Conta sem identidade seria uma Conta pela metade, e limpá-la depois exigiria
 * exatamente o SQL manual que estes scripts existem para eliminar.
 */
export function sqlDeCriacaoDeConta({ email, senha, nome }) {
  const vazios = COLUNAS_DE_TOKEN.map(() => "''").join(", ");
  return `
with nova as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    ${COLUNAS_DE_TOKEN.join(", ")}
  ) values (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    lower(btrim(${literal(email)})),
    extensions.crypt(${literal(senha)}, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome_exibicao', ${literal(nome)}),
    now(), now(),
    ${vazios}
  )
  returning id, email
), identidade as (
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  select
    gen_random_uuid(), nova.id, nova.id::text,
    jsonb_build_object(
      'sub', nova.id::text,
      'email', nova.email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email', now(), now(), now()
  from nova
  returning user_id
)
select nova.id::text as id, nova.email as email from nova`;
}

/** Remoção completa: `on delete cascade` leva identidade, sessões e perfil. */
export function sqlDeRemocaoDeConta(email) {
  return `delete from auth.users where email = lower(btrim(${literal(email)})) returning id::text as id`;
}

/* ─── Validação ───────────────────────────────────────────────────────────── */

const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarEntrada({ email, nome }) {
  const problemas = [];
  if (!email) problemas.push("--email é obrigatório");
  else if (!PADRAO_EMAIL.test(email)) problemas.push(`--email inválido: ${email}`);
  if (!nome) problemas.push("--nome é obrigatório");
  else if (nome.trim().length === 0) problemas.push("--nome não pode ser vazio");
  else if (nome.trim().length > 120) {
    problemas.push("--nome excede 120 caracteres (restrição de `perfis`)");
  }
  return problemas;
}

export function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < TAMANHO_MINIMO_DA_SENHA) {
    return `a senha precisa ter ao menos ${TAMANHO_MINIMO_DA_SENHA} caracteres`;
  }
  const bytes = Buffer.byteLength(senha, "utf8");
  if (bytes > TAMANHO_MAXIMO_DA_SENHA_EM_BYTES) {
    return (
      `a senha excede ${TAMANHO_MAXIMO_DA_SENHA_EM_BYTES} bytes (tem ${bytes}). ` +
      "bcrypt descartaria o excesso em silêncio, e duas senhas diferentes abririam a mesma Conta"
    );
  }
  if (senha.trim() !== senha) {
    return "a senha não pode começar nem terminar com espaço — é fonte silenciosa de erro ao digitar de novo";
  }
  return null;
}

/* ─── Leitura da senha ────────────────────────────────────────────────────── */

/**
 * Pergunta sem eco. O prompt é escrito ANTES de silenciar a saída, senão ele
 * próprio seria engolido.
 */
function perguntarOculto(rotulo) {
  return new Promise((resolver) => {
    let mudo = false;
    const saida = new Writable({
      write(pedaco, codificacao, pronto) {
        if (!mudo) process.stdout.write(pedaco, codificacao);
        pronto();
      },
    });
    const leitor = createInterface({
      input: process.stdin,
      output: saida,
      terminal: true,
    });
    process.stdout.write(rotulo);
    mudo = true;
    leitor.question("", (resposta) => {
      leitor.close();
      process.stdout.write("\n");
      resolver(resposta);
    });
  });
}

/**
 * A senha vem do ambiente (para automação) ou do terminal, digitada duas vezes.
 *
 * A confirmação não é zelo excessivo: não existe fluxo de recuperação neste
 * épico, e a digitação é cega. Um erro de tecla aqui produziria uma Conta que
 * ninguém consegue abrir e que só o próximo script consegue apagar.
 */
async function obterSenha() {
  // Registrada como segredo assim que existe, e ANTES de chegar perto de um
  // comando SQL: ela é interpolada no `insert`, e erro de Postgres costuma
  // ecoar o trecho do comando que falhou. Registrar aqui garante que nenhum
  // caminho de erro a imprima, inclusive os que ainda não existem.
  const guardar = (senha) => {
    registrarSegredo(senha);
    return senha;
  };

  const doAmbiente = process.env.SUPABASE_SENHA_DA_CONTA;
  if (typeof doAmbiente === "string" && doAmbiente !== "") {
    guardar(doAmbiente);
    const problema = validarSenha(doAmbiente);
    if (problema) parar(`SUPABASE_SENHA_DA_CONTA: ${problema}`);
    console.log("  Senha lida de SUPABASE_SENHA_DA_CONTA.");
    return doAmbiente;
  }

  if (!process.stdin.isTTY) {
    parar(
      "sem terminal interativo e sem SUPABASE_SENHA_DA_CONTA no ambiente. " +
        "A senha nunca é aceita por argumento de linha de comando.",
    );
  }

  const senha = guardar(await perguntarOculto("  Senha da conta (não aparece): "));
  const problema = validarSenha(senha);
  if (problema) parar(problema);

  const confirmacao = guardar(await perguntarOculto("  Repita a senha: "));
  if (confirmacao !== senha) parar("as duas digitações não conferem.");

  return senha;
}

/* ─── Interface de linha de comando ───────────────────────────────────────── */

const OPCOES_COM_VALOR = ["--email", "--nome"];
const FLAGS = ["--dry-run", "--simular", "--remover"];

export function lerArgumentos(argumentos) {
  const valores = { email: null, nome: null, simulacao: false, remover: false };
  const desconhecidos = [];
  for (let i = 0; i < argumentos.length; i += 1) {
    const a = argumentos[i];
    if (OPCOES_COM_VALOR.includes(a)) {
      const valor = argumentos[i + 1];
      if (valor === undefined || valor.startsWith("--")) {
        desconhecidos.push(`${a} sem valor`);
        continue;
      }
      if (a === "--email") valores.email = valor.trim().toLowerCase();
      else valores.nome = valor.trim();
      i += 1;
    } else if (a === "--dry-run" || a === "--simular") valores.simulacao = true;
    else if (a === "--remover") valores.remover = true;
    else desconhecidos.push(a);
  }
  return { valores, desconhecidos };
}

async function principal() {
  const { valores, desconhecidos } = lerArgumentos(process.argv.slice(2));

  // Argumento não reconhecido para antes de qualquer escrita — o mesmo
  // contrato dos scripts da Story 1.2, pelo mesmo motivo: `--dryrun` digitado
  // errado não pode virar escrita em produção.
  if (desconhecidos.length > 0) {
    parar(
      `argumento não reconhecido: ${desconhecidos.join(", ")}. ` +
        `Use ${OPCOES_COM_VALOR.join(", ")} e, opcionalmente, ${FLAGS.join(" / ")}.`,
    );
  }

  const token = lerToken();
  if (!token) {
    parar(
      "SUPABASE_ACCESS_TOKEN ausente no ambiente. Sem ele não há como falar com a Management API.",
    );
  }

  console.log(
    `Projeto alvo: ${NOME_PROJETO} (${REF_PROJETO})${valores.simulacao ? "  [simulação]" : ""}`,
  );

  /* ── Remoção ───────────────────────────────────────────────────────────── */
  if (valores.remover) {
    if (!valores.email) parar("--remover exige --email.");
    if (valores.simulacao) {
      console.log(`\nSimulação: removeria a conta ${valores.email}. Nada foi alterado.`);
      return;
    }
    const r = await executarSql(token, sqlDeRemocaoDeConta(valores.email));
    if (!r.ok) parar(`remoção recusada: ${r.erro}`);
    const removidas = Array.isArray(r.dados) ? r.dados.length : 0;
    console.log(
      removidas > 0
        ? `\nConta ${valores.email} removida.`
        : `\nNenhuma conta com o e-mail ${valores.email} — nada a remover.`,
    );
    return;
  }

  /* ── Criação ───────────────────────────────────────────────────────────── */
  const problemas = validarEntrada(valores);
  if (problemas.length > 0) parar(problemas.join("; "));

  const existente = await executarSql(
    token,
    `select id::text as id from auth.users where email = lower(btrim(${literal(valores.email)}))`,
  );
  if (!existente.ok) parar(`não foi possível consultar as contas: ${existente.erro}`);
  if (Array.isArray(existente.dados) && existente.dados.length > 0) {
    parar(
      `já existe uma conta com o e-mail ${valores.email}. ` +
        "Use `npm run conta:remover -- --email …` antes, se a intenção era recriá-la.",
    );
  }

  console.log(`\n  E-mail: ${valores.email}`);
  console.log(`  Nome de exibição: ${valores.nome}`);

  if (valores.simulacao) {
    console.log(
      "\nSimulação: a conta seria criada com identidade de e-mail e perfil. Nada foi escrito, e nenhuma senha foi pedida.",
    );
    return;
  }

  const senha = await obterSenha();

  const criacao = await executarSql(
    token,
    sqlDeCriacaoDeConta({ email: valores.email, senha, nome: valores.nome }),
  );
  // `sanitizar` de novo aqui, mesmo que `chamar()` já sanitize na origem: o
  // caminho da senha até o console é curto demais para depender de uma trava só.
  if (!criacao.ok) parar(sanitizar(`criação recusada: ${criacao.erro}`));

  const linha = Array.isArray(criacao.dados) ? criacao.dados[0] : null;
  if (!linha?.id) parar("o INSERT não devolveu identificador — a conta pode não ter nascido.");

  // Releitura: o INSERT diz o que a API fez; isto é o que o projeto passou a
  // valer. O perfil vem do gatilho, e ele engole exceção de propósito (Story
  // 1.2) — sem esta conferência, Conta sem nome de exibição passaria calada.
  const perfil = await executarSql(
    token,
    `select p.nome_exibicao
       from public.perfis p
      where p.id = ${literal(linha.id)}::uuid`,
  );
  if (!perfil.ok) parar(`não foi possível reler o perfil: ${perfil.erro}`);
  const nomeGravado = Array.isArray(perfil.dados) ? perfil.dados[0]?.nome_exibicao : null;

  console.log(`\nConta criada: ${linha.email}`);
  console.log(`  id: ${linha.id}`);
  if (nomeGravado) {
    console.log(`  perfil: "${nomeGravado}"`);
  } else {
    parar(
      "a Conta nasceu, mas SEM perfil — o gatilho on_auth_user_created falhou em silêncio. " +
        "Remova a conta e investigue antes de usá-la.",
    );
  }
  console.log("\nEntre pelo Painel em /admin com este e-mail e a senha digitada.");
}

/* Só roda como programa; importado, exporta apenas as peças. A verificação de
   acesso reaproveita o mesmo SQL — duplicá-lo faria a Conta de teste nascer
   por um caminho diferente do real, e o teste deixaria de testar o real. */
const ehEntrada =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ehEntrada) {
  await executarScript(principal);
}
