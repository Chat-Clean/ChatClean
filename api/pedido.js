/**
 * A leitura pública do pedido, para a tela de retorno.
 *
 * Uma pergunta só: em que pé está o pedido `X`. Quem responde é o banco, pela
 * chave de serviço, porque a RLS não dá política de leitura a ninguém em
 * `pedidos_de_assinatura` — dado pessoal não se lê do navegador.
 *
 * ═══ O QUE ESTA PORTA DEVOLVE, E O QUE ELA NUNCA DEVOLVE ═════════════════
 *
 * Devolve: Estado, plano, dimensionamento e valor. Não devolve nome, e-mail,
 * telefone, CNPJ, razão social, nem o endereço da fatura.
 *
 * O identificador do pedido é o único segredo desta porta, e ele viaja na
 * querystring: aparece no histórico do navegador, e sobrevive num link colado
 * em qualquer lugar. Um `uuid` é inviável de adivinhar, mas é fácil de
 * COMPARTILHAR sem querer — então a resposta é dimensionada para o pior caso,
 * que é ela cair na mão de outra pessoa. Nesse caso, o que vazou foi "existe um
 * pedido do plano Pro para 5 usuários", e nada que identifique alguém.
 *
 * A fatura fica de fora pelo mesmo raciocínio: a página do Asaas mostra o nome
 * e o documento de quem paga, e devolvê-la aqui transformaria esta leitura
 * mínima num vazamento de dado pessoal por link compartilhado. Quem precisa da
 * fatura de novo a recebe por e-mail, do próprio Asaas.
 *
 * ═══ POR QUE NÃO TEM CACHE ═══════════════════════════════════════════════
 *
 * O Estado muda por webhook, em segundos. Uma resposta guardada por qualquer
 * intermediário faria a tela dizer "aguardando" depois de a conta já estar de
 * pé — que é exatamente o momento em que a pessoa está olhando.
 */

import { bancoDoAmbiente } from "./_nucleo/bancoDaAssinatura.js";
import { planoPorId } from "../src/domain/assinatura/planos.js";
import {
  PARAMETRO_DO_PEDIDO,
  ehIdentificadorDePedido,
} from "../src/domain/assinatura/retorno.js";

/** O identificador pedido, venha ele da querystring parseada ou da URL crua. */
export function identificadorDoPedido(req) {
  const daQuery = req?.query?.[PARAMETRO_DO_PEDIDO];
  if (typeof daQuery === "string") return daQuery.trim();
  if (Array.isArray(daQuery) && typeof daQuery[0] === "string") {
    return daQuery[0].trim();
  }

  const bruto = typeof req?.url === "string" ? req.url : "";
  const separador = bruto.indexOf("?");
  if (separador === -1) return "";
  const lido = new URLSearchParams(bruto.slice(separador + 1)).get(
    PARAMETRO_DO_PEDIDO,
  );
  return typeof lido === "string" ? lido.trim() : "";
}

/** O que a tela recebe. Nenhum campo pessoal atravessa esta função. */
export function leituraPublica(linha) {
  const plano = planoPorId(linha.plano_id);
  return {
    estado: linha.estado,
    planoId: linha.plano_id,
    planoNome: plano?.nome ?? null,
    usuarios: linha.usuarios,
    conexoes: linha.conexoes,
    valorCentavos: linha.valor_centavos,
    diaDeVencimento: linha.dia_de_vencimento,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({
      tipo: "MetodoNaoPermitido",
      mensagem: "esta rota atende GET.",
    });
  }

  res.setHeader("Cache-Control", "no-store");

  const id = identificadorDoPedido(req);
  if (!ehIdentificadorDePedido(id)) {
    // Recusar a FORMA antes de falar com o banco: querystring é escrita por
    // quem chama, e sem isto qualquer texto viraria uma consulta.
    return res.status(400).json({
      tipo: "PedidoInvalido",
      mensagem: "pedido não informado.",
    });
  }

  const banco = bancoDoAmbiente(process.env);
  if (!banco.ok) {
    console.error(
      "[pedido] configuração do banco incompleta:",
      JSON.stringify({ faltando: banco.faltando, invalidas: banco.invalidas }),
    );
    return res.status(500).json({
      tipo: "Configuracao",
      mensagem: "não conseguimos consultar seu pedido agora.",
    });
  }

  const lido = await banco.banco.pedidoPorId(id);
  if (!lido.ok) {
    console.error(`[pedido] ${lido.codigo}: ${lido.mensagem}`);
    return res.status(lido.status === 0 ? 503 : 500).json({
      tipo: "Banco",
      mensagem: "não conseguimos consultar seu pedido agora.",
    });
  }

  if (lido.dados === null) {
    // Mesma resposta para pedido que nunca existiu e para identificador de
    // outra pessoa: distinguir os dois transformaria esta porta num oráculo
    // que confirma quais pedidos existem.
    return res.status(404).json({
      tipo: "NaoEncontrado",
      mensagem: "não encontramos este pedido.",
    });
  }

  return res.status(200).json(leituraPublica(lido.dados));
}
