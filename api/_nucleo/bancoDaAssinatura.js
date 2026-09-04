/**
 * O acesso ao Supabase que o checkout usa — pedidos, eventos e
 * provisionamentos.
 *
 * Existe separado de `acesso.js` porque `acesso.js` é o transporte do blog: os
 * métodos dele são `lerPost`, `inserirCategoria`, `definirTags`. Acrescentar
 * pedido de assinatura ali misturaria dois domínios num arquivo que já tem 900
 * linhas. O que os dois compartilham é a leitura do ambiente, e é isso — e só
 * isso — que este módulo importa de lá.
 *
 * Escreve com a **chave de serviço**, que ignora RLS e privilégio. É por isso
 * que ela existe: a migração 20260903120000 não dá política nenhuma a `anon` e
 * a `authenticated` — nem de leitura, porque aqui há dado pessoal — e a função
 * de servidor é o único caminho.
 */

import { lerAmbiente } from "./acesso.js";

export const PRAZO_TOTAL_PADRAO_MS = 9000;
export const PRAZO_POR_CHAMADA_PADRAO_MS = 5000;

/** As colunas que voltam do pedido. Lista fechada: `select=*` cresce sozinho. */
export const COLUNAS_DO_PEDIDO = Object.freeze([
  "id",
  "estado",
  "nome",
  "email",
  "telefone",
  "cnpj",
  "razao_social",
  "plano_id",
  "usuarios",
  "conexoes",
  "dia_de_vencimento",
  "valor_centavos",
  "referencia_externa",
  "asaas_cliente_id",
  "asaas_assinatura_id",
  "asaas_cobranca_id",
  "fatura_url",
  "criado_em",
]);

const SELECAO = COLUNAS_DO_PEDIDO.join(",");

export function criarBancoDaAssinatura({
  url,
  chaveDeServico,
  buscar = globalThis.fetch,
  prazoTotalMs = PRAZO_TOTAL_PADRAO_MS,
  prazoPorChamadaMs = PRAZO_POR_CHAMADA_PADRAO_MS,
  agora = () => Date.now(),
}) {
  const esconder = (texto) => {
    let s = String(texto ?? "");
    if (typeof chaveDeServico === "string" && chaveDeServico.length >= 8) {
      s = s.split(chaveDeServico).join("«credencial oculta»");
    }
    return s;
  };

  let armadoEm = null;
  const restanteMs = () => {
    if (armadoEm === null) armadoEm = agora();
    return prazoTotalMs - (agora() - armadoEm);
  };

  function sinal(ms) {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      return undefined;
    }
  }

  async function pedir(caminho, { metodo = "GET", corpo, prefer } = {}) {
    const restante = restanteMs();
    if (restante <= 0) {
      return {
        ok: false,
        status: 0,
        dados: null,
        codigo: "PrazoEsgotado",
        mensagem: "o prazo do pedido terminou antes desta chamada ao banco",
      };
    }

    let resposta;
    try {
      resposta = await buscar(`${url}/rest/v1${caminho}`, {
        method: metodo,
        headers: {
          apikey: chaveDeServico,
          Authorization: `Bearer ${chaveDeServico}`,
          "Content-Type": "application/json",
          ...(prefer ? { Prefer: prefer } : {}),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: sinal(Math.min(restante, prazoPorChamadaMs)),
      });
    } catch (erro) {
      return {
        ok: false,
        status: 0,
        dados: null,
        codigo: "Rede",
        mensagem: esconder(erro?.message ?? "falha de rede ao falar com o banco"),
      };
    }

    const bruto = await resposta.text().catch(() => "");
    let dados = null;
    if (bruto !== "") {
      try {
        dados = JSON.parse(bruto);
      } catch {
        return {
          ok: false,
          status: resposta.status,
          dados: null,
          codigo: "RespostaNaoJson",
          mensagem: esconder(bruto).slice(0, 500),
        };
      }
    }

    if (!resposta.ok) {
      return {
        ok: false,
        status: resposta.status,
        dados,
        // `code` do PostgREST é o SQLSTATE: 23505 é violação de unicidade, e
        // quem chama precisa distinguir isso de erro genérico.
        codigo: String(dados?.code ?? `http_${resposta.status}`),
        mensagem: esconder(
          dados?.message ?? `o banco respondeu ${resposta.status}`,
        ).slice(0, 500),
      };
    }

    return { ok: true, status: resposta.status, dados, codigo: "", mensagem: "" };
  }

  const primeiro = (resposta) => {
    if (!resposta.ok) return resposta;
    const linha = Array.isArray(resposta.dados) ? resposta.dados[0] : null;
    return { ...resposta, dados: linha ?? null };
  };

  return {
    reiniciarPrazo() {
      armadoEm = null;
    },

    /**
     * O pedido ainda pendente deste CNPJ, ou `null`.
     *
     * "Pendente" é `rascunho` ou `aguardando_pagamento` — o mesmo recorte do
     * índice único parcial da migração. É esta consulta que faz um segundo envio
     * do formulário reaproveitar a cobrança em vez de abrir outra.
     */
    async pedidoPendentePorCnpj(cnpj) {
      return primeiro(
        await pedir(
          `/pedidos_de_assinatura?cnpj=eq.${encodeURIComponent(
            cnpj,
          )}&estado=in.(rascunho,aguardando_pagamento)&select=${SELECAO}&limit=1`,
        ),
      );
    },

    async pedidoPorId(id) {
      return primeiro(
        await pedir(
          `/pedidos_de_assinatura?id=eq.${encodeURIComponent(
            id,
          )}&select=${SELECAO}&limit=1`,
        ),
      );
    },

    /** O pedido de uma assinatura do Asaas — o caminho que o webhook usa. */
    async pedidoPorAssinatura(asaasAssinaturaId) {
      return primeiro(
        await pedir(
          `/pedidos_de_assinatura?asaas_assinatura_id=eq.${encodeURIComponent(
            asaasAssinaturaId,
          )}&select=${SELECAO}&limit=1`,
        ),
      );
    },

    async inserirPedido(campos) {
      return primeiro(
        await pedir(`/pedidos_de_assinatura?select=${SELECAO}`, {
          metodo: "POST",
          corpo: campos,
          prefer: "return=representation",
        }),
      );
    },

    async atualizarPedido(id, campos) {
      return primeiro(
        await pedir(
          `/pedidos_de_assinatura?id=eq.${encodeURIComponent(
            id,
          )}&select=${SELECAO}`,
          { metodo: "PATCH", corpo: campos, prefer: "return=representation" },
        ),
      );
    },

    /**
     * Registra o evento recebido do Asaas.
     *
     * Devolve `{ ok, novo }`. `novo: false` significa que este evento já estava
     * gravado — entrega repetida, que é o comportamento normal do Asaas
     * (*at least once*), não erro.
     *
     * A trava é o `Prefer: resolution=ignore-duplicates` sobre a chave primária
     * `id`: o banco descarta a repetição. Verificar antes com um `select` e
     * inserir depois perderia a corrida entre duas entregas simultâneas.
     */
    async registrarEvento({ id, evento, corpo, pedidoId = null }) {
      const resposta = await pedir("/eventos_do_asaas?select=id", {
        metodo: "POST",
        corpo: { id, evento, corpo, pedido_id: pedidoId },
        prefer: "return=representation,resolution=ignore-duplicates",
      });
      if (!resposta.ok) return resposta;
      const gravou = Array.isArray(resposta.dados) && resposta.dados.length > 0;
      return { ...resposta, dados: null, novo: gravou };
    },

    async marcarEventoProcessado(id, erro = null) {
      return pedir(`/eventos_do_asaas?id=eq.${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        corpo: { processado_em: new Date().toISOString(), erro },
      });
    },

    async vincularEventoAoPedido(id, pedidoId) {
      return pedir(`/eventos_do_asaas?id=eq.${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        corpo: { pedido_id: pedidoId },
      });
    },

    /**
     * Abre uma tentativa de provisionamento.
     *
     * O par (pedido, tentativa) é único no banco. Quando duas execuções tentam
     * abrir a mesma tentativa — o que acontece se o mesmo evento for processado
     * em paralelo —, a segunda recebe `23505` e desiste. É a idempotência do
     * disparo, e ela não depende de a aplicação lembrar de verificar.
     */
    async abrirProvisionamento({ pedidoId, tentativa, chaveDeIdempotencia }) {
      const resposta = await pedir("/provisionamentos?select=id,tentativa", {
        metodo: "POST",
        corpo: {
          pedido_id: pedidoId,
          tentativa,
          chave_de_idempotencia: chaveDeIdempotencia,
        },
        prefer: "return=representation",
      });
      if (!resposta.ok) {
        return { ...resposta, jaAberto: resposta.codigo === "23505" };
      }
      return { ...primeiro(resposta), jaAberto: false };
    },

    async concluirProvisionamento(id, { ok, statusHttp, resposta: corpo }) {
      return pedir(`/provisionamentos?id=eq.${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        corpo: {
          ok,
          status_http: statusHttp ?? null,
          resposta: corpo === undefined || corpo === null ? null : String(corpo).slice(0, 4000),
          respondido_em: new Date().toISOString(),
        },
      });
    },

    async tentativasDoProvisionamento(pedidoId) {
      const resposta = await pedir(
        `/provisionamentos?pedido_id=eq.${encodeURIComponent(
          pedidoId,
        )}&select=tentativa,ok&order=tentativa.desc&limit=1`,
      );
      if (!resposta.ok) return resposta;
      const linha = Array.isArray(resposta.dados) ? resposta.dados[0] : null;
      return { ...resposta, dados: linha ?? null };
    },
  };
}

/** O acesso montado a partir do ambiente do processo. */
export function bancoDoAmbiente(ambiente, opcoes = {}) {
  const lido = lerAmbiente(ambiente);
  if (!lido.ok) return lido;
  return {
    ok: true,
    banco: criarBancoDaAssinatura({
      url: lido.config.url,
      chaveDeServico: lido.config.chaveDeServico,
      ...opcoes,
    }),
  };
}
