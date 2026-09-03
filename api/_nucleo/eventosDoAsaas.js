/**
 * Os webhooks do Asaas — recepção, idempotência e disparo do provisionamento.
 *
 * ═══ A ORDEM DAS OPERAÇÕES É A PARTE IMPORTANTE ══════════════════════════
 *
 * O Asaas entrega webhook no modelo *at least once*: o mesmo evento chega mais
 * de uma vez, sempre com o mesmo `id`. E ele penaliza endpoint que falha —
 * depois de **15 falhas consecutivas** a fila é PAUSADA, os eventos continuam
 * sendo gerados mas param de ser entregues até alguém reativar no painel, e
 * evento parado é **descartado em 14 dias**.
 *
 * Somando as duas coisas: um bug bobo aqui, despercebido por duas semanas, vira
 * perda definitiva de confirmação de pagamento. Por isso a ordem é
 *
 *     conferir o token → persistir o evento → responder 200 → processar
 *
 * e não "processar e responder no fim". Se o processamento falhar, o evento fica
 * gravado com o erro e `processado_em` nulo — reprocessável, e visível. O que
 * não pode acontecer é o Asaas receber erro por causa de uma regra de negócio
 * nossa.
 *
 * Devolver erro fica reservado para o caso em que NÃO conseguimos persistir:
 * aí o reenvio do Asaas é exatamente o que queremos.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { ESTADOS } from "../../src/domain/assinatura/pedido.js";

/** Quantas vezes tentamos criar a conta antes de desistir e pedir socorro. */
export const MAXIMO_DE_TENTATIVAS = 5;

/**
 * Os eventos que assinamos no Asaas.
 *
 * Lista de permissão: evento fora dela é gravado (para auditoria) e ignorado no
 * processamento. Assinar tudo e filtrar com `if` deixaria a lista implícita no
 * código, onde ninguém a lê.
 */
export const EVENTOS_QUE_TRATAMOS = Object.freeze({
  // Pago, saldo ainda não liberado. É o gatilho da liberação: esperar o
  // `RECEIVED` atrasaria a conta do cliente por causa do nosso fluxo de caixa.
  PAYMENT_CONFIRMED: "pagou",
  // Pago e saldo disponível. Pix e boleto costumam pular o CONFIRMED e cair
  // direto aqui, então os dois precisam servir de gatilho.
  PAYMENT_RECEIVED: "pagou",
  PAYMENT_OVERDUE: "venceu",
  PAYMENT_REFUNDED: "estornou",
  PAYMENT_CHARGEBACK_REQUESTED: "estornou",
  SUBSCRIPTION_DELETED: "encerrou",
  SUBSCRIPTION_INACTIVATED: "encerrou",
});

/**
 * O token do webhook confere?
 *
 * Comparação em tempo constante. Comparar segredo com `===` vaza o tamanho e o
 * prefixo pelo tempo de resposta, e este endpoint fica aberto na internet.
 * Tamanhos diferentes já saem `false` — `timingSafeEqual` lança quando os
 * buffers têm tamanhos distintos.
 */
export function tokenConfere(recebido, esperado) {
  if (typeof recebido !== "string" || typeof esperado !== "string") return false;
  if (recebido.length !== esperado.length || esperado.length === 0) return false;
  return timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

/** O `id` do evento, o nome, e o que ele carrega. */
export function lerEvento(corpo) {
  const id = typeof corpo?.id === "string" ? corpo.id.trim() : "";
  const evento = typeof corpo?.event === "string" ? corpo.event.trim() : "";
  const cobranca = corpo?.payment ?? null;
  const assinatura = corpo?.subscription ?? null;
  return { id, evento, cobranca, assinatura };
}

/**
 * Qual assinatura do Asaas este evento diz respeito.
 *
 * Em evento de cobrança, `payment.subscription`; em evento de assinatura, o
 * `subscription.id`. Cobrança avulsa não tem assinatura, e nesse caso não há
 * pedido nosso para casar — o evento é gravado e ignorado.
 */
export function assinaturaDoEvento({ cobranca, assinatura }) {
  const daCobranca = cobranca?.subscription;
  if (typeof daCobranca === "string" && daCobranca !== "") return daCobranca;
  const daAssinatura = assinatura?.id;
  if (typeof daAssinatura === "string" && daAssinatura !== "") return daAssinatura;
  return null;
}

/* ─── O provisionamento ──────────────────────────────────────────────────── */

/**
 * A assinatura do corpo que enviamos ao webhook de provisionamento.
 *
 * HMAC-SHA256 sobre `timestamp.corpo`, e o timestamp entra no cálculo de
 * propósito: assinar só o corpo deixa a chamada válida para sempre, e uma
 * chamada capturada poderia ser repetida meses depois. Do outro lado, a
 * verificação é recalcular isto e recusar timestamp velho.
 */
export function assinarCorpo(corpo, segredo, timestamp) {
  return createHmac("sha256", segredo).update(`${timestamp}.${corpo}`).digest("hex");
}

/** O que o webhook de provisionamento recebe. */
export function corpoDoProvisionamento({ pedido, evento, cobranca }) {
  return {
    pedidoId: pedido.id,
    contratadoEm: pedido.criado_em,
    cliente: {
      nome: pedido.nome,
      email: pedido.email,
      telefone: pedido.telefone,
      cnpj: pedido.cnpj,
      razaoSocial: pedido.razao_social,
    },
    contratacao: {
      planoId: pedido.plano_id,
      usuarios: pedido.usuarios,
      conexoes: pedido.conexoes,
      diaDeVencimento: pedido.dia_de_vencimento,
      valorCentavos: pedido.valor_centavos,
    },
    asaas: {
      evento,
      clienteId: pedido.asaas_cliente_id,
      assinaturaId: pedido.asaas_assinatura_id,
      cobrancaId: cobranca?.id ?? pedido.asaas_cobranca_id,
      cobranca: cobranca ?? null,
    },
  };
}

/**
 * Chama o webhook que cria a conta do cliente.
 *
 * Idempotente por construção: a tentativa é aberta no banco antes de sair, e o
 * par (pedido, tentativa) é único. Duas execuções simultâneas do mesmo evento
 * não produzem duas chamadas — a segunda recebe `jaAberto` e desiste.
 *
 * A chave de idempotência viaja no cabeçalho para o outro lado poder descartar
 * repetição também. Idempotência de ponta a ponta é acordo entre as duas
 * pontas; mandar a chave é a nossa metade.
 */
export async function dispararProvisionamento({
  pedido,
  evento,
  cobranca,
  banco,
  config,
  buscar = globalThis.fetch,
  agora = () => Date.now(),
}) {
  if (!config.urlDoProvisionamento || !config.segredoDoProvisionamento) {
    return {
      ok: false,
      motivo: "provisionamento não configurado",
      pendente: true,
    };
  }

  const ultima = await banco.tentativasDoProvisionamento(pedido.id);
  if (!ultima.ok) return { ok: false, motivo: ultima.mensagem, pendente: true };
  if (ultima.dados?.ok === true) return { ok: true, jaFeito: true };

  const tentativa = (ultima.dados?.tentativa ?? 0) + 1;
  if (tentativa > MAXIMO_DE_TENTATIVAS) {
    return {
      ok: false,
      motivo: `esgotou ${MAXIMO_DE_TENTATIVAS} tentativas`,
      pendente: false,
    };
  }

  const chaveDeIdempotencia = `${pedido.id}:${pedido.asaas_cobranca_id ?? "primeira"}`;

  const aberta = await banco.abrirProvisionamento({
    pedidoId: pedido.id,
    tentativa,
    chaveDeIdempotencia,
  });
  if (aberta.jaAberto) return { ok: false, motivo: "tentativa já aberta", pendente: true };
  if (!aberta.ok) return { ok: false, motivo: aberta.mensagem, pendente: true };

  const corpo = JSON.stringify(corpoDoProvisionamento({ pedido, evento, cobranca }));
  const timestamp = String(Math.floor(agora() / 1000));

  let resposta = null;
  let statusHttp = null;
  let texto = "";

  try {
    resposta = await buscar(config.urlDoProvisionamento, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChatClean-Timestamp": timestamp,
        "X-ChatClean-Assinatura": `sha256=${assinarCorpo(
          corpo,
          config.segredoDoProvisionamento,
          timestamp,
        )}`,
        "X-ChatClean-Idempotencia": chaveDeIdempotencia,
      },
      body: corpo,
      signal: (() => {
        try {
          return AbortSignal.timeout(6000);
        } catch {
          return undefined;
        }
      })(),
    });
    statusHttp = resposta.status;
    texto = await resposta.text().catch(() => "");
  } catch (erro) {
    texto = String(erro?.message ?? "falha de rede");
  }

  const deuCerto = statusHttp !== null && statusHttp >= 200 && statusHttp < 300;

  await banco.concluirProvisionamento(aberta.dados?.id, {
    ok: deuCerto,
    statusHttp,
    resposta: texto,
  });

  return {
    ok: deuCerto,
    motivo: deuCerto ? "" : `status ${statusHttp ?? "sem resposta"}`,
    pendente: !deuCerto && tentativa < MAXIMO_DE_TENTATIVAS,
    tentativa,
  };
}

/* ─── O processamento do evento ─────────────────────────────────────────── */

/** Estados em que o pagamento já foi reconhecido — evento repetido não repisa. */
const JA_PAGO = Object.freeze([
  ESTADOS.PAGO,
  ESTADOS.PROVISIONANDO,
  ESTADOS.ATIVO,
  ESTADOS.FALHA_NO_PROVISIONAMENTO,
]);

/**
 * Recebe um evento do Asaas.
 *
 * Devolve `{ aceito, novo, mensagem }`. `aceito: false` significa "não
 * conseguimos guardar" — e só nesse caso o invólucro responde erro, para o
 * Asaas reenviar.
 */
export async function receberEvento({
  corpo,
  banco,
  config,
  buscar = globalThis.fetch,
}) {
  const lido = lerEvento(corpo);
  if (lido.id === "" || lido.evento === "") {
    // Corpo sem identificador não é evento do Asaas. Recusar com 400 é melhor
    // que gravar lixo — e não conta como falha de entrega de evento real.
    return { aceito: false, novo: false, mensagem: "corpo sem id ou event", invalido: true };
  }

  const assinaturaId = assinaturaDoEvento(lido);
  let pedido = null;

  if (assinaturaId !== null) {
    const achado = await banco.pedidoPorAssinatura(assinaturaId);
    if (!achado.ok) {
      return { aceito: false, novo: false, mensagem: achado.mensagem };
    }
    pedido = achado.dados;
  }

  const registrado = await banco.registrarEvento({
    id: lido.id,
    evento: lido.evento,
    corpo,
    pedidoId: pedido?.id ?? null,
  });
  if (!registrado.ok) {
    return { aceito: false, novo: false, mensagem: registrado.mensagem };
  }

  // Entrega repetida: já está guardado, e o resultado da primeira vez vale.
  // Isto é o caminho NORMAL do modelo at-least-once, não uma anomalia.
  if (!registrado.novo) {
    return { aceito: true, novo: false, mensagem: "evento já processado" };
  }

  const acao = EVENTOS_QUE_TRATAMOS[lido.evento] ?? null;
  if (acao === null || pedido === null) {
    await banco.marcarEventoProcessado(
      lido.id,
      pedido === null ? "sem pedido correspondente" : null,
    );
    return { aceito: true, novo: true, mensagem: "evento guardado sem ação" };
  }

  let erro = null;

  if (acao === "pagou") {
    if (!JA_PAGO.includes(pedido.estado)) {
      const pago = await banco.atualizarPedido(pedido.id, { estado: ESTADOS.PAGO });
      if (!pago.ok) erro = `não marcou como pago: ${pago.codigo}`;
      else pedido = pago.dados;

      if (erro === null) {
        const provisionando = await banco.atualizarPedido(pedido.id, {
          estado: ESTADOS.PROVISIONANDO,
        });
        if (!provisionando.ok) erro = `não marcou como provisionando: ${provisionando.codigo}`;
        else pedido = provisionando.dados;
      }
    }

    if (erro === null) {
      const disparo = await dispararProvisionamento({
        pedido,
        evento: lido.evento,
        cobranca: lido.cobranca,
        banco,
        config,
        buscar,
      });

      if (disparo.ok) {
        await banco.atualizarPedido(pedido.id, { estado: ESTADOS.ATIVO });
      } else {
        erro = `provisionamento não concluído: ${disparo.motivo}`;
        // `pendente` distingue "tenta de novo" de "acabaram as tentativas". Nos
        // dois casos o pedido sai de `provisionando`, porque ninguém deve ficar
        // olhando um estado que não avança sozinho.
        await banco.atualizarPedido(pedido.id, {
          estado: ESTADOS.FALHA_NO_PROVISIONAMENTO,
        });
      }
    }
  } else if (acao === "venceu") {
    if (pedido.estado === ESTADOS.AGUARDANDO_PAGAMENTO) {
      const venceu = await banco.atualizarPedido(pedido.id, {
        estado: ESTADOS.VENCIDO,
      });
      if (!venceu.ok) erro = `não marcou como vencido: ${venceu.codigo}`;
    }
  } else if (acao === "encerrou" || acao === "estornou") {
    // Cancelar é permitido a partir de quase todo estado, e cancelado é final.
    // Estorno dentro dos sete dias do artigo 49 do CDC cai aqui.
    if (pedido.estado !== ESTADOS.CANCELADO) {
      const cancelou = await banco.atualizarPedido(pedido.id, {
        estado: ESTADOS.CANCELADO,
      });
      if (!cancelou.ok) erro = `não marcou como cancelado: ${cancelou.codigo}`;
    }
  }

  await banco.marcarEventoProcessado(lido.id, erro);

  return {
    aceito: true,
    novo: true,
    mensagem: erro === null ? "processado" : erro,
    // Erro de processamento NÃO virou erro de entrega: o evento está guardado.
    // Devolver 500 aqui gastaria uma das 15 falhas que pausam a fila.
    erroNoProcessamento: erro,
  };
}
