/**
 * O transporte da API do Asaas — e nada além disso.
 *
 * Espelha a divisão que `api/_nucleo/acesso.js` já usa para o Supabase: aqui
 * mora `fetch`, cabeçalho e tradução de resposta em valor. Nenhuma decisão de
 * produto passa por este arquivo. Quem decide o que criar é
 * `api/_nucleo/pedidoDeAssinatura.js`.
 *
 * ─── O AMBIENTE SAI DA CHAVE, NÃO DE UMA SEGUNDA VARIÁVEL ─────────────────
 *
 * A chave do Asaas carrega o ambiente no prefixo: `$aact_hmlg_` é sandbox,
 * `$aact_prod_` é produção. Então a URL base é DERIVADA da chave, em vez de
 * configurada ao lado dela.
 *
 * O motivo é o modo de falhar. Com duas variáveis independentes, o erro
 * possível é apontar a chave de sandbox para `api.asaas.com` — e esse erro não
 * dá exceção: dá `401`, que parece credencial errada, num ambiente em que a
 * credencial está certa. Pior ainda no sentido contrário: chave de produção
 * contra sandbox cobraria de verdade em teste. Derivando, o par nunca se
 * desencontra.
 *
 * ─── A CHAVE NÃO VAZA ────────────────────────────────────────────────────
 *
 * Variável sem prefixo `VITE_` (que iria para o bundle do navegador), nunca em
 * arquivo do repositório, nunca impressa. `esconder()` é a segunda trava: a API
 * do Asaas às vezes ecoa o que recebeu na mensagem de erro, e um detalhe de
 * erro que repetisse a chave a colocaria no log do servidor.
 */

/* ─── Ambiente ─────────────────────────────────────────────────────────── */

export const VARIAVEIS_DO_ASAAS = Object.freeze({
  chave: "ASAAS_CHAVE_DE_API",
  tokenDoWebhook: "ASAAS_TOKEN_DO_WEBHOOK",
  urlDoProvisionamento: "PROVISIONAMENTO_URL",
  segredoDoProvisionamento: "PROVISIONAMENTO_SEGREDO",
});

const BASES = Object.freeze({
  sandbox: "https://api-sandbox.asaas.com/v3",
  producao: "https://api.asaas.com/v3",
});

/**
 * O ambiente da chave. `null` quando o prefixo não é conhecido — e nesse caso o
 * pedido é recusado antes de sair, em vez de ir para a base errada.
 */
export function ambienteDaChave(chave) {
  const valor = typeof chave === "string" ? chave.trim() : "";
  if (valor.startsWith("$aact_hmlg_") || valor.startsWith("$aact_YTU")) {
    return "sandbox";
  }
  if (valor.startsWith("$aact_prod_")) return "producao";
  return null;
}

export function baseDoAmbiente(ambiente) {
  return BASES[ambiente] ?? "";
}

/**
 * Lê o que o Asaas precisa do ambiente do processo.
 *
 * `chave` e `tokenDoWebhook` são obrigatórios. O par de provisionamento é
 * opcional aqui de propósito: sem ele o checkout funciona e o pagamento é
 * registrado — só o disparo da criação da conta fica pendente, visível como
 * pendente. Faltar o webhook de provisionamento não deve impedir de receber.
 */
export function lerAmbienteDoAsaas(ambiente = {}) {
  const pegar = (nome) => {
    const bruto = ambiente[nome];
    return typeof bruto === "string" && bruto.trim() !== "" ? bruto.trim() : "";
  };

  const chave = pegar(VARIAVEIS_DO_ASAAS.chave);
  const tokenDoWebhook = pegar(VARIAVEIS_DO_ASAAS.tokenDoWebhook);

  const faltando = [];
  if (chave === "") faltando.push(VARIAVEIS_DO_ASAAS.chave);
  if (tokenDoWebhook === "") faltando.push(VARIAVEIS_DO_ASAAS.tokenDoWebhook);
  if (faltando.length > 0) return { ok: false, faltando, invalidas: [] };

  const ambienteDoAsaas = ambienteDaChave(chave);
  if (ambienteDoAsaas === null) {
    return {
      ok: false,
      faltando: [],
      invalidas: [
        `${VARIAVEIS_DO_ASAAS.chave}: prefixo desconhecido: esperado $aact_hmlg_ (sandbox) ou $aact_prod_ (produção)`,
      ],
    };
  }

  // O token do webhook não pode ser a chave da API. A documentação do Asaas
  // avisa isso em destaque, e a conferência é barata: o token viaja em todo
  // webhook, e webhook chega de fora.
  if (tokenDoWebhook === chave) {
    return {
      ok: false,
      faltando: [],
      invalidas: [
        `${VARIAVEIS_DO_ASAAS.tokenDoWebhook}: não use a chave da API como token do webhook`,
      ],
    };
  }
  if (tokenDoWebhook.length < 20) {
    return {
      ok: false,
      faltando: [],
      invalidas: [
        `${VARIAVEIS_DO_ASAAS.tokenDoWebhook}: curto demais para servir de segredo (mínimo 20 caracteres)`,
      ],
    };
  }

  return {
    ok: true,
    config: {
      chave,
      ambiente: ambienteDoAsaas,
      base: baseDoAmbiente(ambienteDoAsaas),
      tokenDoWebhook,
      urlDoProvisionamento: pegar(VARIAVEIS_DO_ASAAS.urlDoProvisionamento),
      segredoDoProvisionamento: pegar(
        VARIAVEIS_DO_ASAAS.segredoDoProvisionamento,
      ),
    },
  };
}

/* ─── Prazo ────────────────────────────────────────────────────────────────
 *
 * A plataforma mata a função entre 10 e 15 segundos, e o fluxo de criação faz
 * até quatro chamadas em sequência (consultar assinatura, consultar cliente,
 * criar cliente, criar assinatura). Prazo só por chamada somaria 20 segundos de
 * teto interno: ele nunca dispararia, a plataforma cortaria primeiro, e o
 * cliente receberia um 504 cru — o pior desfecho possível, porque a assinatura
 * pode ter sido criada e ninguém saberia.
 *
 * O prazo TOTAL é compartilhado entre as chamadas do mesmo pedido. Mesma
 * decisão de `acesso.js`, e pelo mesmo motivo.
 */
export const PRAZO_TOTAL_PADRAO_MS = 9000;
export const PRAZO_POR_CHAMADA_PADRAO_MS = 5000;

/* ─── O acesso ─────────────────────────────────────────────────────────── */

export function criarAsaas({
  chave,
  base,
  buscar = globalThis.fetch,
  prazoTotalMs = PRAZO_TOTAL_PADRAO_MS,
  prazoPorChamadaMs = PRAZO_POR_CHAMADA_PADRAO_MS,
  agora = () => Date.now(),
}) {
  const esconder = (texto) => {
    let s = String(texto ?? "");
    if (typeof chave === "string" && chave.length >= 8) {
      s = s.split(chave).join("«credencial oculta»");
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

  /**
   * Uma chamada ao Asaas, traduzida em valor.
   *
   * Devolve sempre `{ ok, status, dados, codigo, mensagem }`. `status: 0`
   * significa "não falamos com o servidor" — e essa distinção é o que separa
   * "consulte antes de repetir" de "isso não vai dar".
   */
  async function pedir(caminho, { metodo = "GET", corpo } = {}) {
    const restante = restanteMs();
    if (restante <= 0) {
      return {
        ok: false,
        status: 0,
        dados: null,
        codigo: "PrazoEsgotado",
        mensagem: "o prazo do pedido terminou antes desta chamada ao Asaas",
      };
    }

    let resposta;
    try {
      resposta = await buscar(`${base}${caminho}`, {
        method: metodo,
        headers: {
          access_token: chave,
          "Content-Type": "application/json",
          // Obrigatório para contas criadas a partir de 13/06/2024. Sem ele a
          // requisição é recusada com mensagem que não explica o motivo.
          "User-Agent": "ChatClean/1.0 (+https://chatclean.com.br)",
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
        mensagem: esconder(erro?.message ?? "falha de rede ao falar com o Asaas"),
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
      // O Asaas devolve `{ errors: [{ code, description }] }`.
      const primeiro = Array.isArray(dados?.errors) ? dados.errors[0] : null;
      return {
        ok: false,
        status: resposta.status,
        dados,
        codigo: String(primeiro?.code ?? `http_${resposta.status}`),
        mensagem: esconder(
          primeiro?.description ?? `o Asaas respondeu ${resposta.status}`,
        ).slice(0, 500),
      };
    }

    return { ok: true, status: resposta.status, dados, codigo: "", mensagem: "" };
  }

  return {
    /** Reinicia o relógio do prazo total. Só a verificação usa. */
    reiniciarPrazo() {
      armadoEm = null;
    },

    /**
     * O cliente com este CNPJ, ou `null`.
     *
     * Existe porque **a API do Asaas permite criar cliente duplicado** — a
     * documentação deles diz isso com todas as letras e empurra a checagem para
     * quem integra. Sem esta consulta, cada retentativa criaria outro cliente
     * com o mesmo CNPJ, e a conciliação viraria um problema permanente.
     */
    async clientePorCnpj(cnpj) {
      const resposta = await pedir(
        `/customers?cpfCnpj=${encodeURIComponent(cnpj)}&limit=1`,
      );
      if (!resposta.ok) return resposta;
      const primeiro = Array.isArray(resposta.dados?.data)
        ? resposta.dados.data[0]
        : null;
      return { ...resposta, dados: primeiro ?? null };
    },

    async criarCliente({ nome, cnpj, email, telefone, referenciaExterna }) {
      return pedir("/customers", {
        metodo: "POST",
        corpo: {
          name: nome,
          cpfCnpj: cnpj,
          email,
          mobilePhone: telefone,
          externalReference: referenciaExterna,
          notificationDisabled: false,
        },
      });
    },

    /**
     * A assinatura criada para esta referência, ou `null`.
     *
     * Esta é a consulta que torna a criação idempotente. O Asaas não tem
     * cabeçalho de idempotência; a orientação da documentação deles é consultar
     * antes de repetir, e `externalReference` é o campo que eles oferecem para
     * isso.
     */
    async assinaturaPorReferencia(referenciaExterna) {
      const resposta = await pedir(
        `/subscriptions?externalReference=${encodeURIComponent(
          referenciaExterna,
        )}&limit=1`,
      );
      if (!resposta.ok) return resposta;
      const primeira = Array.isArray(resposta.dados?.data)
        ? resposta.dados.data[0]
        : null;
      return { ...resposta, dados: primeira ?? null };
    },

    /**
     * Cria a assinatura mensal.
     *
     * `billingType: UNDEFINED` é o que permite Pix E boleto na mesma cobrança:
     * o pagador escolhe na fatura, entre os meios habilitados na conta. Não
     * existe forma de criar uma cobrança com dois `billingType` fixos ao mesmo
     * tempo — `UNDEFINED` é o mecanismo previsto para essa escolha.
     *
     * ─── O RETORNO ────────────────────────────────────────────────────────
     *
     * `callback.successUrl` é para onde o Asaas devolve quem pagou, e
     * `autoRedirect` faz a volta acontecer sozinha. Sem isso, o cliente termina
     * o pagamento numa página que não é nossa e nunca mais volta — nem para
     * saber que a conta está sendo criada.
     *
     * O campo só é enviado quando há endereço: mandar `callback` vazio ou com
     * caminho relativo é recusado pelo Asaas, e derrubaria a criação inteira da
     * assinatura por causa de um ambiente sem Domínio Canônico declarado.
     */
    async criarAssinatura({
      clienteId,
      valor,
      primeiroVencimento,
      descricao,
      referenciaExterna,
      retornoUrl = null,
    }) {
      const retorno =
        typeof retornoUrl === "string" && retornoUrl.trim() !== ""
          ? { callback: { successUrl: retornoUrl.trim(), autoRedirect: true } }
          : {};

      return pedir("/subscriptions", {
        metodo: "POST",
        corpo: {
          customer: clienteId,
          billingType: "UNDEFINED",
          value: valor,
          nextDueDate: primeiroVencimento,
          cycle: "MONTHLY",
          description: descricao,
          externalReference: referenciaExterna,
          ...retorno,
        },
      });
    },

    /**
     * Remove uma assinatura.
     *
     * Usado quando o cliente refaz o pedido com outro dimensionamento: sem
     * remover a anterior, ele passaria a ter duas assinaturas ativas e receberia
     * duas cobranças todo mês.
     */
    async removerAssinatura(id) {
      return pedir(`/subscriptions/${encodeURIComponent(id)}`, {
        metodo: "DELETE",
      });
    },

    /** As cobranças da assinatura, mais recente primeiro. */
    async cobrancasDaAssinatura(id) {
      const resposta = await pedir(
        `/subscriptions/${encodeURIComponent(id)}/payments?limit=1`,
      );
      if (!resposta.ok) return resposta;
      const primeira = Array.isArray(resposta.dados?.data)
        ? resposta.dados.data[0]
        : null;
      return { ...resposta, dados: primeira ?? null };
    },
  };
}

/** O acesso montado a partir do ambiente do processo. */
export function asaasDoAmbiente(ambiente, opcoes = {}) {
  const lido = lerAmbienteDoAsaas(ambiente);
  if (!lido.ok) return lido;
  return {
    ok: true,
    config: lido.config,
    asaas: criarAsaas({ ...lido.config, ...opcoes }),
  };
}
