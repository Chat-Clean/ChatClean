/**
 * A volta do cliente depois de pagar, em regra pura.
 *
 * Sem React, sem rede: o endereço para onde o Asaas devolve a pessoa, o formato
 * do identificador que viaja nesse endereço, e o que cada Estado do pedido
 * significa para quem está olhando a tela.
 *
 * ─── POR QUE O RETORNO EXISTE ────────────────────────────────────────────
 *
 * Sem ele, quem paga fica na página do Asaas com um comprovante e nenhuma
 * pista do que acontece depois. A conta é liberada por webhook, em segundos ou
 * em minutos, e nesse intervalo a pessoa não tem onde olhar. A tela de retorno
 * é esse lugar.
 *
 * ─── O IDENTIFICADOR VIAJA NA QUERYSTRING, E ISSO É DELIBERADO ───────────
 *
 * O `uuid` do pedido é a única chave da consulta pública. Ele tem 122 bits de
 * entropia: adivinhar um é inviável, e é a mesma classe de segredo que um link
 * de redefinição de senha usa. Mas link se compartilha por engano, então a
 * leitura que ele abre devolve o MÍNIMO: Estado, plano e valor. Nome, e-mail,
 * telefone e CNPJ não saem por aqui, nem para quem tem o identificador certo.
 *
 * ─── O VOCABULÁRIO É FECHADO ─────────────────────────────────────────────
 *
 * `leituraDoEstado` cobre os oito Estados e recusa qualquer outro. Estado novo
 * no banco sem fala aqui vira erro na hora, e não uma tela em branco no pior
 * momento possível da vida do cliente, que é logo depois de ele ter pagado.
 */

import { ESTADOS } from "./pedido.js";

/** Onde a pessoa cai quando volta do Asaas. */
export const CAMINHO_DO_RETORNO = "/assinatura/recebido";

/** O nome do parâmetro que carrega o pedido nesse endereço. */
export const PARAMETRO_DO_PEDIDO = "pedido";

/** O formato que o banco gera em `gen_random_uuid()`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O texto é um identificador de pedido?
 *
 * A porta de leitura confere isto ANTES de falar com o banco: querystring é
 * escrita por quem chama, e recusar a forma errada aqui evita transformar
 * qualquer lixo numa consulta.
 */
export function ehIdentificadorDePedido(bruto) {
  return typeof bruto === "string" && UUID.test(bruto.trim());
}

/**
 * O endereço absoluto para onde o Asaas devolve a pessoa depois de pagar.
 *
 * Devolve `null` quando falta o Domínio Canônico ou o pedido: sem endereço
 * absoluto não há retorno possível, e mandar um caminho relativo para o Asaas
 * levaria o cliente para uma página do Asaas que não existe. Sem retorno o
 * checkout continua funcionando como antes, que é o comportamento certo para
 * um ambiente que não declarou domínio.
 */
export function enderecoDeRetorno(dominio, pedidoId) {
  if (typeof dominio !== "string" || dominio.trim() === "") return null;
  if (!ehIdentificadorDePedido(pedidoId)) return null;

  const raiz = dominio.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raiz)) return null;

  const parametros = new URLSearchParams({
    [PARAMETRO_DO_PEDIDO]: pedidoId.trim(),
  });
  return `${raiz}${CAMINHO_DO_RETORNO}?${parametros.toString()}`;
}

/**
 * O que a tela diz, por Estado.
 *
 * `situacao` é o que a tela usa para escolher cor e ícone; `titulo` e `texto`
 * são o que a pessoa lê. `aguardando` diz que ainda não há confirmação, e não
 * "pago": quem confirma pagamento é o webhook, e a tela não sabe mais que ele.
 */
const FALAS = Object.freeze({
  [ESTADOS.RASCUNHO]: Object.freeze({
    situacao: "aguardando",
    titulo: "Pedido registrado",
    texto:
      "Recebemos seu pedido. Assim que o pagamento for compensado, a conta é liberada e você recebe o acesso por e-mail.",
  }),
  [ESTADOS.AGUARDANDO_PAGAMENTO]: Object.freeze({
    situacao: "aguardando",
    titulo: "Estamos aguardando a confirmação",
    texto:
      "O pagamento por Pix costuma cair em poucos minutos, e o boleto em até dois dias úteis. Você recebe o acesso por e-mail assim que a compensação chegar. Pode fechar esta página.",
  }),
  [ESTADOS.PAGO]: Object.freeze({
    situacao: "pago",
    titulo: "Pagamento confirmado",
    texto:
      "Estamos criando a sua conta agora. Em alguns minutos você recebe o acesso por e-mail.",
  }),
  [ESTADOS.PROVISIONANDO]: Object.freeze({
    situacao: "pago",
    titulo: "Criando a sua conta",
    texto:
      "O pagamento foi confirmado e a conta está sendo preparada. O acesso chega por e-mail em alguns minutos.",
  }),
  [ESTADOS.ATIVO]: Object.freeze({
    situacao: "ativo",
    titulo: "Sua conta está liberada",
    texto:
      "Enviamos o acesso para o e-mail cadastrado. Se ele não chegar, confira a caixa de spam e fale com a gente.",
  }),
  [ESTADOS.VENCIDO]: Object.freeze({
    situacao: "problema",
    titulo: "A cobrança venceu",
    texto:
      "A fatura passou do vencimento e ainda não foi compensada. Fale com a gente para gerar uma nova.",
  }),
  [ESTADOS.CANCELADO]: Object.freeze({
    situacao: "encerrado",
    titulo: "Este pedido foi cancelado",
    texto:
      "Nada foi cobrado por ele. Se você quiser contratar de novo, é só refazer o pedido.",
  }),
  [ESTADOS.FALHA_NO_PROVISIONAMENTO]: Object.freeze({
    situacao: "problema",
    titulo: "Recebemos o pagamento e travamos na liberação",
    texto:
      "O pagamento está confirmado e a sua conta ainda não subiu. Já fomos avisados e estamos resolvendo. Se preferir falar com a gente agora, estamos no WhatsApp.",
  }),
});

/** As situações que a tela sabe desenhar. */
export const SITUACOES = Object.freeze([
  "aguardando",
  "pago",
  "ativo",
  "encerrado",
  "problema",
]);

/**
 * A fala de um Estado. Vocabulário fechado: Estado desconhecido lança.
 *
 * Lança em vez de devolver um texto genérico porque um Estado sem fala é
 * defeito nosso, e a tela genérica esconderia esse defeito exatamente de quem
 * poderia consertá-lo.
 */
export function leituraDoEstado(estado) {
  const fala = FALAS[estado];
  if (!fala) {
    throw new Error(
      `O vocabulário é fechado. Os únicos valores são: ${Object.keys(FALAS).join(", ")}.`,
    );
  }
  return fala;
}

/** O pedido ainda pode mudar de Estado sozinho? Decide se a tela reconsulta. */
export function valeReconsultar(estado) {
  return (
    estado === ESTADOS.RASCUNHO ||
    estado === ESTADOS.AGUARDANDO_PAGAMENTO ||
    estado === ESTADOS.PAGO ||
    estado === ESTADOS.PROVISIONANDO
  );
}
