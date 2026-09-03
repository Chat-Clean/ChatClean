/**
 * A captação do lead da API Oficial.
 *
 * Mesmo formato de `api/assinar.js`: fino, traduzindo requisição em argumento e
 * resultado em resposta. A regra do que é um lead válido está em
 * `src/domain/lead/lead.js`, importada pelos dois lados.
 *
 * ─── O QUE A RESPOSTA REVELA ─────────────────────────────────────────────
 *
 * Erro de formulário volta com o mapa campo → frase, porque a pessoa precisa
 * saber o que corrigir. Erro de banco volta como uma frase só: SQLSTATE e
 * mensagem crua vão para o log do servidor.
 *
 * ─── O QUE NÃO É LOGADO ──────────────────────────────────────────────────
 *
 * Nem nome, nem e-mail, nem telefone, nem o corpo da requisição. O log recebe o
 * identificador da linha e o tipo do erro — o que serve para diagnosticar. Dado
 * pessoal vai para a tabela, onde a RLS não dá política a ninguém.
 *
 * ─── O REDIRECIONAMENTO PARA O WHATSAPP É MONTADO AQUI ───────────────────
 *
 * E não no navegador. Assim o número de destino é uma decisão do servidor: se
 * alguém adulterar o formulário, o pior que consegue é gravar um lead com o
 * próprio nome errado — não desviar a conversa para outro número.
 */

import { bancoDoAmbiente, TIPOS } from "./_nucleo/bancoDeLeads.js";
import {
  campanhaDaBusca,
  enderecoDoWhatsApp,
  validarLead,
} from "../src/domain/lead/lead.js";

export const CODIGO_HTTP = Object.freeze({
  [TIPOS.FORMULARIO_INVALIDO]: 422,
  [TIPOS.CONFIGURACAO]: 500,
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
 * O IP de quem pediu. Auditoria do consentimento, não autorização: nada neste
 * fluxo decide coisa alguma com base nele.
 */
export function ipDoPedido(cabecalhos = {}) {
  const bruto = cabecalhos["x-forwarded-for"] ?? cabecalhos["X-Forwarded-For"];
  if (typeof bruto !== "string" || bruto.trim() === "") return null;
  return bruto.split(",")[0].trim().slice(0, 60) || null;
}

/** O caminho de onde o clique veio, limitado e sem querystring. */
export function origemDoPedido(corpo = {}) {
  const bruto = corpo.origem;
  if (typeof bruto !== "string" || bruto.trim() === "") return null;
  return bruto.trim().split("?")[0].slice(0, 200) || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      tipo: "MetodoNaoPermitido",
      mensagem: "use POST para pedir contato.",
    });
  }

  const corpo = corpoComoObjeto(req.body);

  const validado = validarLead(corpo);
  if (!validado.ok) {
    return res.status(CODIGO_HTTP[TIPOS.FORMULARIO_INVALIDO]).json({
      tipo: TIPOS.FORMULARIO_INVALIDO,
      mensagem: "confira os campos marcados.",
      erros: validado.erros,
    });
  }

  const banco = bancoDoAmbiente(process.env);
  if (!banco.ok) {
    console.error(`[lead] ${banco.tipo}: ${banco.detalhe}`);
    return res.status(CODIGO_HTTP[TIPOS.CONFIGURACAO]).json({
      tipo: TIPOS.CONFIGURACAO,
      mensagem: "o pedido de contato está indisponível. Já fomos avisados.",
    });
  }

  const { lead } = validado;
  const gravado = await banco.banco.inserir({
    nome: lead.nome,
    email: lead.email,
    telefone: lead.telefone,
    empresa: lead.empresa,
    atendentes: lead.atendentes,
    origem: origemDoPedido(corpo),
    campanha: campanhaDaBusca(corpo.campanha),
    aceite_versao: lead.aceiteVersao,
    aceite_ip: ipDoPedido(req.headers),
  });

  if (!gravado.ok) {
    console.error(`[lead] ${gravado.tipo}: ${gravado.detalhe ?? ""}`.trim());
    return res.status(CODIGO_HTTP[gravado.tipo] ?? 500).json({
      tipo: gravado.tipo,
      mensagem: gravado.mensagem,
    });
  }

  console.log(`[lead] gravado ${gravado.id}`);

  return res.status(201).json({
    leadId: gravado.id,
    whatsappUrl: enderecoDoWhatsApp(lead),
  });
}
