/**
 * Os endereços da conexão do Claude com o Painel (MCP + OAuth).
 *
 * A rota da tela de autorização é a MESMA que o servidor anuncia como
 * `authorization_endpoint` (`api/_nucleo/oauthDoMcp.js`); a verificação do MCP
 * confere que as duas continuam iguais.
 */

export const SEGMENTO_DA_CONEXAO_DO_CLAUDE = "conectar-claude";
export const ROTA_DA_CONEXAO_DO_CLAUDE = SEGMENTO_DA_CONEXAO_DO_CLAUDE;

/** O caminho que se cola no Claude. */
export const CAMINHO_DO_MCP = "/mcp";

/** `https://chatclean.com.br/mcp`, ou o do ambiente aberto (prévia, local). */
export function enderecoDoMcp(origem = globalThis.location?.origin ?? "https://chatclean.com.br") {
  return `${origem}${CAMINHO_DO_MCP}`;
}
