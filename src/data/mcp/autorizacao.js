/**
 * A autorização da conexão do Claude, pedida com a sessão de quem está logado.
 *
 * A tela de autorização manda os parâmetros que o Claude colocou na URL e o
 * servidor devolve para onde o navegador volta (com o código, ou com a recusa).
 * Quem confere tudo é o servidor (`api/_nucleo/oauthDoMcp.js`); daqui só sai o
 * pedido, com a sessão no cabeçalho.
 *
 * O endereço é o da função, e não `/mcp/autorizar`, porque o servidor de
 * desenvolvimento não aplica as reescritas do `vercel.json`.
 */

import { tokenDoPainelOuFalha } from "../blog/comum.js";

const ENDERECO = "/api/posts?via=mcp-autorizar";

/** `{ ok: true, redirecionar }` ou `{ ok: false, mensagem }`. Nunca lança. */
export async function pedirAutorizacao(parametros, { negar = false, buscar = globalThis.fetch } = {}) {
  const sessao = await tokenDoPainelOuFalha("autorizarClaude");
  if (!sessao.ok) return { ok: false, mensagem: "Sua sessão no Painel expirou. Entre de novo e autorize." };
  try {
    const resposta = await buscar(ENDERECO, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.dados}` },
      body: JSON.stringify({ ...parametros, negar }),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (resposta.ok && typeof corpo.redirecionar === "string") return { ok: true, redirecionar: corpo.redirecionar };
    return { ok: false, mensagem: corpo.erro ?? "Não foi possível autorizar agora. Tente de novo." };
  } catch {
    return { ok: false, mensagem: "Não conseguimos falar com o servidor. Confira a conexão e tente de novo." };
  }
}
