/**
 * A criação do pedido de assinatura — a lógica, sem HTTP.
 *
 * Este é o único lugar que decide o que criar no Asaas. `api/assinar.js` é o
 * invólucro de plataforma: traduz requisição em argumento e resultado em
 * resposta, e nada mais.
 *
 * ═══ COMO A IDEMPOTÊNCIA FUNCIONA AQUI ═══════════════════════════════════
 *
 * A API do Asaas não tem cabeçalho de idempotência. A documentação deles diz,
 * com essas palavras, que em caso de timeout ou resposta inconclusiva o certo é
 * CONSULTAR antes de repetir — repetir às cegas cria cobrança duplicada. E
 * ainda avisa que a API **permite criar cliente duplicado**, empurrando a
 * unicidade para quem integra.
 *
 * Então a proteção é construída em quatro camadas, de fora para dentro:
 *
 *   1. **Pedido pendente por CNPJ.** Se já existe pedido `rascunho` ou
 *      `aguardando_pagamento` para este CNPJ com o MESMO dimensionamento,
 *      devolvemos a mesma fatura. Nada é criado.
 *   2. **Índice único parcial no banco.** Duas requisições no mesmo instante
 *      não passam pela camada 1 (ambas leem "não existe"); a segunda esbarra no
 *      índice `pedidos_de_assinatura_um_pendente_por_cnpj` e é tratada como
 *      corrida perdida — relemos e devolvemos a fatura da vencedora.
 *   3. **Consulta por `externalReference` no Asaas.** Antes de criar cliente ou
 *      assinatura, perguntamos se já existe para esta referência. É o que
 *      protege a retentativa após timeout.
 *   4. **Consulta por CNPJ no Asaas.** Cliente já cadastrado é reaproveitado.
 *
 * ═══ E QUANDO O DIMENSIONAMENTO MUDA ════════════════════════════════════
 *
 * Se o cliente volta e refaz o pedido com outro plano ou outro número de
 * usuários, o pendente anterior é CANCELADO — e a assinatura dele é removida no
 * Asaas. Sem essa remoção ele passaria a ter duas assinaturas ativas e receberia
 * duas cobranças todo mês, o que é pior que qualquer erro de tela.
 */

import {
  ESTADOS,
  VERSAO_DOS_TERMOS,
  descricaoDaAssinatura,
  primeiroVencimento,
  validarPedido,
} from "../../src/domain/assinatura/pedido.js";
import { planoPorId, precoMensal } from "../../src/domain/assinatura/planos.js";

/* ─── Tipos de erro ────────────────────────────────────────────────────────
 *
 * O núcleo devolve TIPO, não status HTTP: ele não conhece HTTP. A tradução é
 * uma tabela, no invólucro.
 */
export const TIPOS = Object.freeze({
  FORMULARIO_INVALIDO: "FormularioInvalido",
  CONFIGURACAO: "Configuracao",
  ASAAS_RECUSOU: "AsaasRecusou",
  ASAAS_INDISPONIVEL: "AsaasIndisponivel",
  BANCO: "Banco",
  BANCO_INDISPONIVEL: "BancoIndisponivel",
});

/** SQLSTATE de violação de unicidade. */
const UNICIDADE_VIOLADA = "23505";

function falha(tipo, mensagem, detalhe = "") {
  return { ok: false, tipo, mensagem, detalhe };
}

/** Erro do transporte traduzido em tipo. `status: 0` é "não falamos". */
function falhaDoAsaas(resposta) {
  if (resposta.status === 0) {
    return falha(
      TIPOS.ASAAS_INDISPONIVEL,
      "não conseguimos falar com o sistema de cobrança agora. Tente em alguns instantes.",
      `${resposta.codigo}: ${resposta.mensagem}`,
    );
  }
  return falha(
    TIPOS.ASAAS_RECUSOU,
    "o sistema de cobrança recusou os dados enviados.",
    `${resposta.codigo}: ${resposta.mensagem}`,
  );
}

function falhaDoBanco(resposta) {
  if (resposta.status === 0) {
    return falha(
      TIPOS.BANCO_INDISPONIVEL,
      "não conseguimos registrar seu pedido agora. Tente em alguns instantes.",
      `${resposta.codigo}: ${resposta.mensagem}`,
    );
  }
  return falha(
    TIPOS.BANCO,
    "não conseguimos registrar seu pedido.",
    `${resposta.codigo}: ${resposta.mensagem}`,
  );
}

/** O pedido gravado corresponde ao que está sendo pedido agora? */
function mesmaContratacao(gravado, pedido, centavos) {
  return (
    gravado.plano_id === pedido.planoId &&
    gravado.usuarios === pedido.usuarios &&
    gravado.conexoes === pedido.conexoes &&
    gravado.dia_de_vencimento === pedido.diaDeVencimento &&
    gravado.valor_centavos === centavos
  );
}

function resultadoDoPedido(linha) {
  return {
    ok: true,
    pedidoId: linha.id,
    faturaUrl: linha.fatura_url,
    valorCentavos: linha.valor_centavos,
    reaproveitado: false,
  };
}

/**
 * Cria (ou reaproveita) o pedido de assinatura e devolve a fatura para pagar.
 *
 * `banco` e `asaas` são injetados — é o que permite exercitar o caminho de
 * indisponibilidade e o de corrida sem depender da rede.
 */
export async function criarPedidoDeAssinatura({
  corpo,
  banco,
  asaas,
  ip = null,
  agora = () => new Date(),
}) {
  /* ─── 1. O formulário ─────────────────────────────────────────────────── */

  const validado = validarPedido(corpo);
  if (!validado.ok) {
    return {
      ok: false,
      tipo: TIPOS.FORMULARIO_INVALIDO,
      mensagem: "confira os campos destacados.",
      erros: validado.erros,
      detalhe: Object.keys(validado.erros).join(", "),
    };
  }
  const pedido = validado.pedido;

  /* ─── 2. O preço, calculado AQUI ──────────────────────────────────────
   *
   * O corpo da requisição não traz valor nenhum, e se trouxesse seria
   * ignorado. O que chega do navegador é o identificador do plano e os dois
   * limites; o valor sai da tabela do domínio. Confiar no preço enviado pelo
   * cliente é deixar o cliente escolher o preço.
   */
  const plano = planoPorId(pedido.planoId);
  const preco = precoMensal(plano, pedido);
  const vencimento = primeiroVencimento(pedido.diaDeVencimento, agora());

  /* ─── 3. Pedido pendente para este CNPJ ──────────────────────────────── */

  const pendente = await banco.pedidoPendentePorCnpj(pedido.cnpj);
  if (!pendente.ok) return falhaDoBanco(pendente);

  let linha = null;

  if (pendente.dados !== null) {
    const gravado = pendente.dados;

    if (mesmaContratacao(gravado, pedido, preco.centavos)) {
      // Mesma contratação: se a fatura já existe, é ela. Este é o caminho do
      // duplo clique e do "voltar e enviar de novo".
      if (gravado.fatura_url) {
        return { ...resultadoDoPedido(gravado), reaproveitado: true };
      }
      // Pedido gravado sem fatura: a execução anterior morreu no meio. Seguimos
      // com ele, e as consultas por `externalReference` completam o que falta.
      linha = gravado;
    } else {
      // Contratação diferente: o cliente mudou de ideia. Removemos a assinatura
      // anterior no Asaas ANTES de cancelar aqui — se a remoção falhar, é
      // melhor abortar do que deixar duas cobranças mensais de pé.
      if (gravado.asaas_assinatura_id) {
        const removida = await asaas.removerAssinatura(gravado.asaas_assinatura_id);
        if (!removida.ok && removida.status !== 404) {
          return falhaDoAsaas(removida);
        }
      }
      const cancelado = await banco.atualizarPedido(gravado.id, {
        estado: ESTADOS.CANCELADO,
      });
      if (!cancelado.ok) return falhaDoBanco(cancelado);
    }
  }

  /* ─── 4. Gravar o pedido ─────────────────────────────────────────────── */

  if (linha === null) {
    const inserido = await banco.inserirPedido({
      estado: ESTADOS.RASCUNHO,
      nome: pedido.nome,
      email: pedido.email,
      telefone: pedido.telefone,
      cnpj: pedido.cnpj,
      razao_social: pedido.razaoSocial,
      plano_id: pedido.planoId,
      usuarios: pedido.usuarios,
      conexoes: pedido.conexoes,
      dia_de_vencimento: pedido.diaDeVencimento,
      valor_centavos: preco.centavos,
      termos_versao: VERSAO_DOS_TERMOS,
      termos_ip: ip,
    });

    if (!inserido.ok) {
      // Corrida perdida: outra requisição gravou o pendente deste CNPJ entre a
      // nossa consulta e a nossa gravação. O índice único é o que garante que
      // só uma passou — relemos e devolvemos o resultado da vencedora.
      if (inserido.codigo === UNICIDADE_VIOLADA) {
        const relido = await banco.pedidoPendentePorCnpj(pedido.cnpj);
        if (relido.ok && relido.dados?.fatura_url) {
          return { ...resultadoDoPedido(relido.dados), reaproveitado: true };
        }
        return falha(
          TIPOS.BANCO,
          "seu pedido já está sendo processado. Recarregue a página em alguns instantes.",
          "corrida no índice de pedido pendente por CNPJ",
        );
      }
      return falhaDoBanco(inserido);
    }
    linha = inserido.dados;
  }

  const referencia = linha.referencia_externa;

  /* ─── 5. O cliente no Asaas ──────────────────────────────────────────── */

  let clienteId = linha.asaas_cliente_id ?? null;

  if (clienteId === null) {
    const existente = await asaas.clientePorCnpj(pedido.cnpj);
    if (!existente.ok) return falhaDoAsaas(existente);

    if (existente.dados !== null) {
      clienteId = existente.dados.id;
    } else {
      const criado = await asaas.criarCliente({
        nome: pedido.razaoSocial,
        cnpj: pedido.cnpj,
        email: pedido.email,
        telefone: pedido.telefone,
        referenciaExterna: referencia,
      });
      if (!criado.ok) return falhaDoAsaas(criado);
      clienteId = criado.dados?.id ?? null;
    }

    if (!clienteId) {
      return falha(
        TIPOS.ASAAS_RECUSOU,
        "o sistema de cobrança não devolveu o cadastro do cliente.",
        "resposta sem `id` na criação do cliente",
      );
    }
  }

  /* ─── 6. A assinatura ────────────────────────────────────────────────── */

  let assinaturaId = linha.asaas_assinatura_id ?? null;

  if (assinaturaId === null) {
    // A consulta que protege a retentativa após timeout: se a criação anterior
    // chegou ao Asaas e a resposta se perdeu, a assinatura está lá.
    const jaExiste = await asaas.assinaturaPorReferencia(referencia);
    if (!jaExiste.ok) return falhaDoAsaas(jaExiste);

    if (jaExiste.dados !== null) {
      assinaturaId = jaExiste.dados.id;
    } else {
      const criada = await asaas.criarAssinatura({
        clienteId,
        valor: preco.total,
        primeiroVencimento: vencimento,
        descricao: descricaoDaAssinatura(plano, pedido),
        referenciaExterna: referencia,
      });
      if (!criada.ok) return falhaDoAsaas(criada);
      assinaturaId = criada.dados?.id ?? null;
    }

    if (!assinaturaId) {
      return falha(
        TIPOS.ASAAS_RECUSOU,
        "o sistema de cobrança não devolveu a assinatura.",
        "resposta sem `id` na criação da assinatura",
      );
    }
  }

  /* ─── 7. A fatura da primeira cobrança ───────────────────────────────── */

  const cobranca = await asaas.cobrancasDaAssinatura(assinaturaId);
  if (!cobranca.ok) return falhaDoAsaas(cobranca);

  const faturaUrl = cobranca.dados?.invoiceUrl ?? null;
  if (!faturaUrl) {
    return falha(
      TIPOS.ASAAS_RECUSOU,
      "a cobrança foi criada, mas a página de pagamento ainda não está pronta. Aguarde um instante e recarregue.",
      "assinatura sem cobrança com invoiceUrl",
    );
  }

  /* ─── 8. Fechar o pedido como aguardando pagamento ───────────────────── */

  const atualizado = await banco.atualizarPedido(linha.id, {
    estado: ESTADOS.AGUARDANDO_PAGAMENTO,
    asaas_cliente_id: clienteId,
    asaas_assinatura_id: assinaturaId,
    asaas_cobranca_id: cobranca.dados?.id ?? null,
    fatura_url: faturaUrl,
  });
  if (!atualizado.ok) {
    // A cobrança existe e a fatura está de pé. Falhar aqui e não devolver a URL
    // deixaria o cliente sem pagar uma cobrança que já foi criada — o pior dos
    // dois lados. Devolvemos a fatura e registramos a divergência.
    return {
      ok: true,
      pedidoId: linha.id,
      faturaUrl,
      valorCentavos: preco.centavos,
      reaproveitado: false,
      divergencia: `pedido ${linha.id} não teve o estado atualizado: ${atualizado.codigo}`,
    };
  }

  return resultadoDoPedido(atualizado.dados);
}
