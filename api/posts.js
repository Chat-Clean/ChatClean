/**
 * O invólucro de plataforma da escrita de Post.
 *
 * Fino de propósito: ele traduz requisição em argumento e resultado em resposta,
 * e nada mais. Toda a lógica — conferir o token, validar o documento, derivar o
 * HTML, resolver o Autor, gravar — mora em `api/_nucleo/salvarPost.js`, que é
 * exercitável localmente contra o projeto real. O que fica sem cobertura aqui é
 * exatamente o que se lê de uma vez.
 *
 * Na Vercel, cada arquivo em `api/` é uma função de runtime Node; arquivo e
 * diretório com `_` no começo não são rotas, e é por isso que o núcleo mora em
 * `api/_nucleo/`.
 *
 * ─── Duas coisas que este arquivo decide, e só ele ──────────────────────────
 *
 * **1. O que a resposta revela.** O erro tipado carrega `detalhe` para
 * diagnóstico — SQLSTATE, mensagem do PostgREST, nome de restrição. Isso vai
 * para o log do servidor e **não** para o corpo da resposta: quem chama recebe
 * `tipo` e `mensagem`, que é o suficiente para a tela agir.
 *
 * **2. O código HTTP.** O núcleo devolve tipo, não status: ele não conhece HTTP.
 * A tradução é uma tabela, aqui.
 */

import { acessoDoAmbiente, VARIAVEIS } from "./_nucleo/acesso.js";
import {
  ERRO_CONFIGURACAO,
  ERRO_CONFLITO,
  ERRO_DADOS_INVALIDOS,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
  falha,
  salvarPost,
} from "./_nucleo/salvarPost.js";

/**
 * Tipo de erro → código HTTP.
 *
 * `rede` sai como 502 e não 500 porque a falha é do que está atrás desta função,
 * não dela; `dados_invalidos` sai como 422 porque o pedido está bem formado e o
 * conteúdo dele é que não serve.
 */
export const CODIGO_HTTP = Object.freeze({
  [ERRO_PERMISSAO]: 401,
  [ERRO_DADOS_INVALIDOS]: 422,
  [ERRO_NAO_ENCONTRADO]: 404,
  [ERRO_CONFLITO]: 409,
  [ERRO_CONFIGURACAO]: 500,
  [ERRO_REDE]: 502,
  [ERRO_INESPERADO]: 500,
});

/** O token do chamador, extraído do cabeçalho. Nunca do corpo do pedido. */
export function tokenDoCabecalho(cabecalhos = {}) {
  const bruto =
    cabecalhos.authorization ?? cabecalhos.Authorization ?? "";
  const m = /^Bearer[ \t]+(.+)$/i.exec(String(bruto).trim());
  return m ? m[1].trim() : "";
}

/**
 * O corpo, já como objeto.
 *
 * A Vercel entrega `req.body` desserializado quando o `Content-Type` é JSON,
 * mas não em todo runtime nem em toda versão — e um corpo que chega como TEXTO
 * seria lido como "não é objeto" e recusado com a mensagem errada. Quando o tipo
 * de conteúdo não é JSON, o que chega é um `Buffer`, que é ainda pior: ele *é*
 * um objeto, então passaria pela conferência de forma e cairia como "falta
 * título" sobre um pedido perfeitamente bem formado.
 *
 * Quatro formas, e nenhuma delas lança:
 *
 *   objeto        → devolvido como está (o caminho comum);
 *   texto JSON    → desserializado;
 *   texto vazio   → `null`, que o núcleo recusa como "não é objeto";
 *   texto inválido→ devolvido como TEXTO, para o núcleo recusar dizendo que veio
 *                   uma string — e não fingir que o corpo estava vazio;
 *   Buffer / Uint8Array → decodificado como UTF-8 e tratado como texto.
 */
export function corpoComoObjeto(corpo) {
  let texto = corpo;
  if (corpo instanceof Uint8Array) {
    // `Buffer` é subclasse de `Uint8Array`, então um teste cobre os dois — e não
    // depende de `Buffer` existir no runtime.
    try {
      texto = new TextDecoder("utf-8", { fatal: false }).decode(corpo);
    } catch {
      return null;
    }
  }
  if (typeof texto !== "string") return texto;
  if (texto.trim() === "") return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/**
 * O corpo da resposta: tipo e frase. `detalhe` NUNCA sai daqui.
 *
 * `faltando` e `alternativa` saem porque as duas são para a TELA agir, não para
 * diagnóstico: uma diz qual campo marcar, a outra diz qual saída oferecer. Sem
 * a segunda, a recusa de um agendamento no passado chegaria como uma frase que
 * menciona publicar agora e um botão que não existe.
 */
export function respostaDeErro(erro) {
  return {
    ok: false,
    erro: {
      tipo: erro.tipo,
      mensagem: erro.mensagem,
      ...(erro.faltando ? { faltando: erro.faltando } : {}),
      ...(erro.alternativa ? { alternativa: erro.alternativa } : {}),
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    const erro = falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Esta rota grava posts e aceita apenas POST.",
    }).erro;
    res.status(405).json(respostaDeErro(erro));
    return;
  }

  const montagem = acessoDoAmbiente(process.env);
  if (!montagem.ok) {
    // O que falta é dito no LOG, com nome. Na resposta, não: a lista de
    // variáveis de ambiente de um servidor não é informação de quem chama.
    console.error(
      `[api/posts] configuração inutilizável — ausentes: ${montagem.faltando.join(", ") || "nenhuma"}; ` +
        `inválidas: ${(montagem.invalidas ?? []).join("; ") || "nenhuma"}. ` +
        `Aceitas: ${Object.values(VARIAVEIS).map((n) => n.join(" ou ")).join(" / ")}`,
    );
    const erro = falha(ERRO_CONFIGURACAO, {}).erro;
    res.status(CODIGO_HTTP[ERRO_CONFIGURACAO]).json(respostaDeErro(erro));
    return;
  }

  const resultado = await salvarPost({
    token: tokenDoCabecalho(req.headers ?? {}),
    corpo: corpoComoObjeto(req.body),
    acesso: montagem.acesso,
  });

  if (!resultado.ok) {
    const { erro } = resultado;
    if (erro.detalhe) {
      console.error(
        `[api/posts] ${erro.tipo}${erro.codigo ? ` (${erro.codigo})` : ""}: ${erro.detalhe}`,
      );
    }
    res.status(CODIGO_HTTP[erro.tipo] ?? 500).json(respostaDeErro(erro));
    return;
  }

  res.status(resultado.dados.criado ? 201 : 200).json({
    ok: true,
    dados: resultado.dados,
  });
}
