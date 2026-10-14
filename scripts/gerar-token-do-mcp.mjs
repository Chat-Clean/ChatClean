/**
 * Gera um token para o MCP do Painel.
 *
 *   node scripts/gerar-token-do-mcp.mjs "<nome>" <id-da-conta>
 *
 * `nome` identifica o token nos logs ("Felix - notebook"). `id-da-conta` é o
 * id da Conta no Supabase (Authentication → Users), a mesma que entra no
 * Painel e tem linha em `perfis`: o que o Claude fizer sai assinado por ela.
 *
 * Imprime o token UMA vez e a entrada para acrescentar à lista JSON da
 * variável `MCP_TOKENS` na Vercel. O token não é guardado em lugar nenhum:
 * só o hash vai para a variável.
 */

import { randomBytes } from "node:crypto";

import { PREFIXO_DO_TOKEN, hashDoToken } from "../api/_nucleo/mcp.js";
import { ehIdentificador } from "../api/_nucleo/leiturasDoMcp.js";

const [nome, conta] = process.argv.slice(2);
if (!nome || !ehIdentificador(conta)) {
  console.error('Uso: node scripts/gerar-token-do-mcp.mjs "<nome>" <id-da-conta (uuid)>');
  process.exit(1);
}

const token = PREFIXO_DO_TOKEN + randomBytes(32).toString("base64url");
const entrada = { nome, conta, hash: hashDoToken(token) };

console.log("\nToken (guarde agora; ele não aparece de novo):\n");
console.log(`  ${token}\n`);
console.log("Acrescente à lista JSON da variável MCP_TOKENS na Vercel:\n");
console.log(`  ${JSON.stringify(entrada)}\n`);
console.log("No Claude Code, conecte com:\n");
console.log(
  `  claude mcp add --transport http painel-chatclean https://chatclean.com.br/mcp --header "Authorization: Bearer ${token}"\n`,
);
