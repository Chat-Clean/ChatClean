/**
 * O invólucro de plataforma da escrita de Carreiras (Story 5.3).
 *
 * `POST /api/carreiras` é a ÚNICA função de escrita do módulo: Vagas e
 * Classificações passam todas por aqui, escolhidas pelo campo `operacao` do
 * corpo contra o vocabulário fechado de `src/domain/carreiras/operacoes.js`.
 * A operação é dado, não endereço, e é OBRIGATÓRIA: pedido sem ela é 422, e
 * não vira gravação por omissão.
 *
 * Fino de propósito, no molde de `api/posts.js`: traduz requisição em
 * argumento e resultado em resposta. A lógica mora em
 * `api/_nucleo/operacoesDaVaga.js` e `api/_nucleo/operacoesDaClassificacao.js`.
 * O que o invólucro do Blog já resolve (código HTTP por tipo, token do
 * cabeçalho, corpo em qualquer forma, resposta sem `detalhe`) é IMPORTADO de
 * lá, pelo mesmo objeto: uma segunda cópia divergiria na primeira correção.
 *
 * O GET desta rota (o HTML Servido da Vaga) é da Story 5.8. Até lá, só POST.
 */

import {
  OPERACAO_EXCLUIR_CLASSIFICACAO,
  OPERACAO_EXCLUIR_VAGA,
  OPERACAO_MUDAR_ESTADO_DA_VAGA,
  OPERACAO_SALVAR_CLASSIFICACAO,
  OPERACAO_SALVAR_VAGA,
  OPERACOES_DE_CARREIRAS,
  operacaoPedidaDeCarreiras,
} from "../src/domain/carreiras/operacoes.js";
import { acessoDoAmbiente, VARIAVEIS } from "./_nucleo/acesso.js";
import { identificarChamador } from "./_nucleo/autenticacao.js";
import {
  excluirClassificacao,
  salvarClassificacao,
} from "./_nucleo/operacoesDaClassificacao.js";
import { excluirVaga, mudarEstadoDaVaga, salvarVaga } from "./_nucleo/operacoesDaVaga.js";
import {
  ERRO_CONFIGURACAO,
  ERRO_DADOS_INVALIDOS,
  ERRO_INESPERADO,
  falha,
} from "./_nucleo/salvarPost.js";
import {
  CODIGO_HTTP,
  RECUSA_SEM_CREDENCIAL,
  corpoComoObjeto,
  respostaDeErro,
  tokenDoCabecalho,
} from "./posts.js";

/**
 * A TABELA DE DESPACHO: a lista de permissão das operações desta porta. A
 * chave é conferida contra a LISTA do domínio antes do acesso, e o acesso é
 * conferido de novo com `Object.hasOwn`, pela razão de `api/posts.js`
 * (`"constructor"` e `"__proto__"` não podem alcançar nada).
 */
export const EXECUTORES = Object.freeze({
  [OPERACAO_SALVAR_VAGA]: salvarVaga,
  [OPERACAO_MUDAR_ESTADO_DA_VAGA]: mudarEstadoDaVaga,
  [OPERACAO_EXCLUIR_VAGA]: excluirVaga,
  [OPERACAO_SALVAR_CLASSIFICACAO]: salvarClassificacao,
  [OPERACAO_EXCLUIR_CLASSIFICACAO]: excluirClassificacao,
});

/** O executor da operação, ou `null`. */
export function executorDe(operacao) {
  if (!OPERACOES_DE_CARREIRAS.includes(operacao)) return null;
  if (!Object.hasOwn(EXECUTORES, operacao)) return null;
  const executor = EXECUTORES[operacao];
  return typeof executor === "function" ? executor : null;
}

/** A frase do 405. */
export const SO_POST =
  "Esta rota grava vagas e classificações e aceita apenas POST.";

/**
 * O que o log registra de uma operação recusada: o TIPO e o TAMANHO do que
 * veio, nunca o texto. O campo `operacao` é escrito por quem chama, e o log
 * não é lugar onde qualquer um escreve à vontade (revisão da 5.3).
 */
export function resumoDaOperacaoRecusada(corpo) {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
    return `corpo não é objeto (${Array.isArray(corpo) ? "lista" : corpo === null ? "null" : typeof corpo})`;
  }
  const bruto = corpo.operacao;
  if (bruto === undefined) return "operacao ausente";
  if (typeof bruto === "string") return `operacao fora do vocabulário (texto com ${bruto.length} caractere(s))`;
  return `operacao fora do vocabulário (${bruto === null ? "null" : Array.isArray(bruto) ? "lista" : typeof bruto})`;
}

/** A frase da configuração ausente. As variáveis vão só para o log. */
export const SEM_CONFIGURACAO =
  "O servidor de Carreiras está sem configuração. Avise quem cuida do projeto.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    const erro = falha(ERRO_DADOS_INVALIDOS, { mensagem: SO_POST }).erro;
    res.status(405).json(respostaDeErro(erro));
    return;
  }

  const montagem = acessoDoAmbiente(process.env);
  if (!montagem.ok) {
    console.error(
      `[api/carreiras] configuração inutilizável: ausentes: ${montagem.faltando.join(", ") || "nenhuma"}; ` +
        `inválidas: ${(montagem.invalidas ?? []).join("; ") || "nenhuma"}. ` +
        `Aceitas: ${Object.values(VARIAVEIS).map((n) => n.join(" ou ")).join(" / ")}`,
    );
    const erro = falha(ERRO_CONFIGURACAO, { mensagem: SEM_CONFIGURACAO }).erro;
    res.status(CODIGO_HTTP[ERRO_CONFIGURACAO]).json(respostaDeErro(erro));
    return;
  }

  const corpo = corpoComoObjeto(req.body);
  const token = tokenDoCabecalho(req.headers ?? {});

  /* A OPERAÇÃO É ESCOLHIDA ANTES DE QUALQUER ESCRITA, e é obrigatória. Quem
     não se IDENTIFICOU não ouve o vocabulário e não deixa rastro no log: a
     recusa é seca.

     Identificar é o token VALER, e não só existir (revisão da 5.3): antes,
     qualquer `Bearer x` recebia a lista das operações. Com token presente, ele
     é conferido no GoTrue antes da resposta; token que não vale (ou GoTrue
     fora do ar) recebe a mesma recusa de quem não mandou nenhum. E mesmo a
     quem se identificou o log registra só o tipo e o tamanho do que veio. */
  const pedida = operacaoPedidaDeCarreiras(corpo);
  if (!pedida.ok) {
    let identificado = false;
    if (token !== "") {
      try {
        const chamador = await identificarChamador({ token, acesso: montagem.acesso });
        identificado = chamador?.ok === true;
      } catch {
        identificado = false;
      }
    }
    if (identificado) {
      console.error(`[api/carreiras] operação recusada: ${resumoDaOperacaoRecusada(corpo)}`);
    }
    const erro = falha(ERRO_DADOS_INVALIDOS, {
      mensagem: identificado ? pedida.mensagem : RECUSA_SEM_CREDENCIAL,
    }).erro;
    res.status(CODIGO_HTTP[ERRO_DADOS_INVALIDOS]).json(respostaDeErro(erro));
    return;
  }

  const executor = executorDe(pedida.operacao);
  if (executor === null) {
    console.error(
      `[api/carreiras] operação sem executor: ${pedida.operacao}. ` +
        `Declaradas: ${OPERACOES_DE_CARREIRAS.join(", ")}; executáveis: ${Object.keys(EXECUTORES).join(", ")}.`,
    );
    const erro = falha(ERRO_INESPERADO, {
      mensagem: "Esta operação de Carreiras ainda não está disponível. Avise quem cuida do projeto.",
    }).erro;
    res.status(CODIGO_HTTP[ERRO_INESPERADO]).json(respostaDeErro(erro));
    return;
  }

  const resultado = await executor({ token, corpo, acesso: montagem.acesso });

  if (!resultado.ok) {
    const { erro } = resultado;
    if (erro.detalhe) {
      console.error(
        `[api/carreiras] ${pedida.operacao} | ${erro.tipo}${erro.codigo ? ` (${erro.codigo})` : ""}: ${erro.detalhe}`,
      );
    }
    res.status(CODIGO_HTTP[erro.tipo] ?? 500).json(respostaDeErro(erro));
    return;
  }

  /* 201 é do que NASCEU (a Vaga e a Classificação criadas); o resto é 200. */
  const nasceu = resultado.dados?.criada === true;
  res.status(nasceu ? 201 : 200).json({ ok: true, dados: resultado.dados });
}
