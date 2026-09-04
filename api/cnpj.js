/**
 * A consulta de CNPJ que preenche a razão social no formulário.
 *
 * ═══ POR QUE ISTO É UM PROXY, E NÃO UMA CHAMADA DO NAVEGADOR ═════════════
 *
 * Chamar a consulta pública direto do navegador seria menos código e três
 * problemas:
 *
 * **1. Dado pessoal de terceiro.** A resposta traz o `qsa`, o quadro de
 * sócios, com nome e CPF parcial de pessoas físicas que não são o cliente.
 * Passando por aqui, o navegador recebe UM campo, e o resto morre no servidor.
 *
 * **2. Um terceiro a mais vendo quem compra.** A Política de Privacidade diz,
 * com essas palavras, que o Meta Pixel é o único rastreador de terceiro do
 * site. Uma chamada do navegador para outro domínio entregaria a ele o IP e o
 * agente de quem está contratando, e tornaria aquela frase falsa.
 *
 * **3. Um contrato que não controlamos.** Mudança no formato da resposta
 * quebraria a tela. Aqui ela quebra a peneira, que é um lugar só.
 *
 * ═══ ESTA PORTA NUNCA IMPEDE UMA VENDA ══════════════════════════════════
 *
 * Ela é conveniência. Fonte fora do ar, CNPJ que não existe, prazo estourado:
 * a resposta é um erro que a tela ignora em silêncio, e a pessoa digita a
 * razão social como sempre digitou. Nenhum caminho daqui bloqueia o envio do
 * formulário.
 */

import { cnpjEhValido, somenteDigitos } from "../src/domain/assinatura/pedido.js";
import { razaoSocialDaResposta } from "../src/domain/assinatura/consultaDeCnpj.js";

/** A consulta pública. Sem chave, sem cadastro, e por isso sem segredo aqui. */
export const FONTE = "https://brasilapi.com.br/api/cnpj/v1";

/** A fonte é de terceiro: prazo curto, porque isto é conveniência. */
export const PRAZO_MS = 4000;

/**
 * Quem está chamando.
 *
 * Não é enfeite: a fonte responde **403 sem `User-Agent`**, e o `fetch` do
 * Node não manda um por padrão. O sintoma era a consulta inteira falhando em
 * produção enquanto o mesmo endereço abria no navegador e no `curl`, que mandam
 * o cabeçalho sozinhos.
 *
 * Também é boa vizinhança: é um serviço público e gratuito, e quem o mantém
 * precisa saber a quem falar se a gente passar do ponto.
 */
export const IDENTIFICACAO = "ChatClean/1.0 (+https://chatclean.com.br)";

/**
 * Dado de registro público muda em escala de meses, e a mesma empresa é
 * consultada de novo a cada tentativa de contratação. Um dia de cache poupa a
 * fonte e responde na hora para quem voltou.
 */
export const CACHE = "public, max-age=86400, s-maxage=86400";

/** O CNPJ pedido, venha ele da query parseada ou da URL crua. */
export function cnpjDoPedido(req) {
  const daQuery = req?.query?.cnpj;
  if (typeof daQuery === "string") return somenteDigitos(daQuery);
  if (Array.isArray(daQuery) && typeof daQuery[0] === "string") {
    return somenteDigitos(daQuery[0]);
  }

  const bruto = typeof req?.url === "string" ? req.url : "";
  const separador = bruto.indexOf("?");
  if (separador === -1) return "";
  const lido = new URLSearchParams(bruto.slice(separador + 1)).get("cnpj");
  return typeof lido === "string" ? somenteDigitos(lido) : "";
}

export default async function handler(req, res, buscar = globalThis.fetch) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({
      tipo: "MetodoNaoPermitido",
      mensagem: "esta rota atende GET.",
    });
  }

  const cnpj = cnpjDoPedido(req);

  // Os verificadores são conferidos ANTES de a requisição sair. Sem isto,
  // qualquer sequência de catorze dígitos vira uma chamada a um serviço de
  // terceiro, e nós viramos o caminho pelo qual alguém varre a base dele.
  if (!cnpjEhValido(cnpj)) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({
      tipo: "CnpjInvalido",
      mensagem: "informe um CNPJ válido.",
    });
  }

  let resposta;
  try {
    resposta = await buscar(`${FONTE}/${cnpj}`, {
      headers: { Accept: "application/json", "User-Agent": IDENTIFICACAO },
      signal: (() => {
        try {
          return AbortSignal.timeout(PRAZO_MS);
        } catch {
          return undefined;
        }
      })(),
    });
  } catch (erro) {
    console.error(`[cnpj] fonte indisponível: ${erro?.message ?? "rede"}`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({
      tipo: "FonteIndisponivel",
      mensagem: "não conseguimos consultar o CNPJ agora.",
    });
  }

  if (resposta.status === 404) {
    // CNPJ com forma válida que não existe no registro. Não é defeito nosso, e
    // vale cache: ele não vai passar a existir no minuto seguinte.
    res.setHeader("Cache-Control", CACHE);
    return res.status(404).json({
      tipo: "NaoEncontrado",
      mensagem: "não encontramos este CNPJ.",
    });
  }

  if (!resposta.ok) {
    console.error(`[cnpj] fonte respondeu ${resposta.status}`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({
      tipo: "FonteIndisponivel",
      mensagem: "não conseguimos consultar o CNPJ agora.",
    });
  }

  const corpo = await resposta.json().catch(() => null);
  const razaoSocial = razaoSocialDaResposta(corpo);

  if (razaoSocial === null) {
    console.error("[cnpj] resposta sem `razao_social`");
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({
      tipo: "RespostaInesperada",
      mensagem: "a consulta não devolveu a razão social.",
    });
  }

  // Um campo. O `qsa` e o resto do corpo param aqui.
  res.setHeader("Cache-Control", CACHE);
  return res.status(200).json({ razaoSocial });
}
