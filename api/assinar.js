/**
 * O invólucro de plataforma da criação da assinatura.
 *
 * Fino de propósito, como `api/posts.js`: traduz requisição em argumento e
 * resultado em resposta. Toda a lógica — validar, gravar, criar no Asaas de
 * forma idempotente, resolver a fatura — mora em
 * `api/_nucleo/pedidoDeAssinatura.js`.
 *
 * Três coisas que este arquivo decide, e só ele:
 *
 * **1. O que a resposta revela.** O erro tipado carrega `detalhe` para
 * diagnóstico — SQLSTATE, código do Asaas, mensagem crua. Isso vai para o log
 * do servidor e **não** para o corpo da resposta. Quem chama recebe `tipo`,
 * `mensagem` e, quando é erro de formulário, o mapa `erros` campo → frase.
 *
 * **2. O código HTTP.** O núcleo devolve tipo, não status. A tradução é uma
 * tabela, aqui.
 *
 * **3. De onde vem o IP do aceite.** Prova de consentimento se registra com
 * origem, e a origem só existe nesta camada.
 *
 * ─── O QUE NÃO É LOGADO ──────────────────────────────────────────────────
 *
 * Nem o corpo da requisição, nem CNPJ, nem e-mail, nem telefone. Dado pessoal
 * vai para o banco, onde a RLS não dá política a ninguém — não para o log, que
 * é o lugar onde dado pessoal vaza sem ninguém perceber. O log recebe o
 * identificador do pedido e o tipo do erro, que é o que serve para diagnosticar.
 */

import { asaasDoAmbiente } from "./_nucleo/asaas.js";
import { bancoDoAmbiente } from "./_nucleo/bancoDaAssinatura.js";
import {
  TIPOS,
  criarPedidoDeAssinatura,
} from "./_nucleo/pedidoDeAssinatura.js";

export const CODIGO_HTTP = Object.freeze({
  [TIPOS.FORMULARIO_INVALIDO]: 422,
  [TIPOS.CONFIGURACAO]: 500,
  [TIPOS.ASAAS_RECUSOU]: 502,
  [TIPOS.ASAAS_INDISPONIVEL]: 503,
  [TIPOS.BANCO]: 500,
  [TIPOS.BANCO_INDISPONIVEL]: 503,
});

/** O corpo como objeto, venha ele parseado pela plataforma ou como texto. */
export function corpoComoObjeto(corpo) {
  if (corpo === null || corpo === undefined) return {};
  if (typeof corpo === "object" && !Array.isArray(corpo)) return corpo;
  if (typeof corpo === "string") {
    try {
      const lido = JSON.parse(corpo);
      return typeof lido === "object" && lido !== null && !Array.isArray(lido)
        ? lido
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * O IP de quem pediu.
 *
 * `x-forwarded-for` chega como lista quando há mais de um proxy no caminho; o
 * primeiro é o cliente. É informação de auditoria, não de autorização — nada
 * neste fluxo confia nela para decidir coisa alguma.
 */
export function ipDoPedido(cabecalhos = {}) {
  const bruto = cabecalhos["x-forwarded-for"] ?? cabecalhos["X-Forwarded-For"];
  if (typeof bruto !== "string" || bruto.trim() === "") return null;
  return bruto.split(",")[0].trim().slice(0, 60) || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      tipo: "MetodoNaoPermitido",
      mensagem: "use POST para contratar.",
    });
  }

  const banco = bancoDoAmbiente(process.env);
  if (!banco.ok) {
    console.error(
      "[assinar] configuração do banco incompleta:",
      JSON.stringify({ faltando: banco.faltando, invalidas: banco.invalidas }),
    );
    return res.status(500).json({
      tipo: TIPOS.CONFIGURACAO,
      mensagem: "a contratação está indisponível. Já fomos avisados.",
    });
  }

  const asaas = asaasDoAmbiente(process.env);
  if (!asaas.ok) {
    console.error(
      "[assinar] configuração do Asaas incompleta:",
      JSON.stringify({ faltando: asaas.faltando, invalidas: asaas.invalidas }),
    );
    return res.status(500).json({
      tipo: TIPOS.CONFIGURACAO,
      mensagem: "a contratação está indisponível. Já fomos avisados.",
    });
  }

  const resultado = await criarPedidoDeAssinatura({
    corpo: corpoComoObjeto(req.body),
    banco: banco.banco,
    asaas: asaas.asaas,
    ip: ipDoPedido(req.headers),
  });

  if (!resultado.ok) {
    console.error(
      `[assinar] ${resultado.tipo}: ${resultado.detalhe ?? ""}`.trim(),
    );
    const status = CODIGO_HTTP[resultado.tipo] ?? 500;
    return res.status(status).json({
      tipo: resultado.tipo,
      mensagem: resultado.mensagem,
      ...(resultado.erros ? { erros: resultado.erros } : {}),
    });
  }

  // Divergência não é falha do pedido: a cobrança existe e a fatura está de pé.
  // Precisa ficar no log para alguém conciliar, e não na cara do cliente.
  if (resultado.divergencia) {
    console.error(`[assinar] divergência: ${resultado.divergencia}`);
  }

  return res.status(resultado.reaproveitado ? 200 : 201).json({
    pedidoId: resultado.pedidoId,
    faturaUrl: resultado.faturaUrl,
    valorCentavos: resultado.valorCentavos,
    reaproveitado: resultado.reaproveitado,
  });
}
