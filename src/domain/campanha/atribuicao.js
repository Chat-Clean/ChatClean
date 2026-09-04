/**
 * De onde a pessoa veio, guardado além da visita.
 *
 * ─── O PROBLEMA QUE ISSO RESOLVE ─────────────────────────────────────────
 *
 * A captura de `utm_*` só funcionava se os parâmetros estivessem na URL no
 * instante do envio do formulário. Quem clica no anúncio na segunda, pensa, e
 * volta digitando o endereço na quinta chega como "sem campanha" — e o anúncio
 * perde o crédito de uma venda que ele trouxe. Atribuição de última visita é o
 * jeito mais comum de um anúncio bom parecer ruim.
 *
 * Guardamos a PRIMEIRA origem, não a última: é ela que explica como a pessoa
 * descobriu a ChatClean. A visita direta de quinta não descobriu nada.
 *
 * ─── LISTA DE PERMISSÃO, DE NOVO ─────────────────────────────────────────
 *
 * Só os cinco `utm_*` e o domínio de quem indicou. Guardar a URL de origem
 * inteira levaria caminho e query de terceiros para o nosso banco; guardar só o
 * host responde "veio do Google" sem carregar o que a pessoa pesquisou.
 *
 * Sem React e sem `localStorage`: quem toca no navegador é `src/lib/atribuicao.js`.
 */

export const CHAVE_DE_ARMAZENAMENTO = "chatclean.atribuicao";

/** Depois disso a origem não explica mais nada, e vira ruído. */
export const VALIDADE_EM_DIAS = 90;

export const PARAMETROS = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

const LIMITE_DE_TEXTO = 120;

function limpar(bruto) {
  return String(bruto ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, LIMITE_DE_TEXTO);
}

/** O host de quem indicou, ou null quando a origem é o próprio site. */
export function hostDoReferrer(referrer, hostAtual) {
  const bruto = limpar(referrer);
  if (bruto === "") return null;
  let host;
  try {
    host = new URL(bruto).hostname;
  } catch {
    return null;
  }
  if (host === "" || host === hostAtual) return null;
  return host.slice(0, LIMITE_DE_TEXTO);
}

/**
 * A origem desta visita, ou null quando não há nada que a explique.
 *
 * Visita direta sem parâmetro e sem referrer externo não é origem: registrar
 * `{}` gastaria a primeira posição e faria a campanha do dia seguinte perder o
 * crédito.
 */
export function origemDaVisita({
  busca = "",
  referrer = "",
  hostAtual = "",
  agora = new Date(),
} = {}) {
  const origem = {};

  let parametros;
  try {
    parametros = new URLSearchParams(busca);
  } catch {
    parametros = new URLSearchParams();
  }
  for (const chave of PARAMETROS) {
    const valor = limpar(parametros.get(chave));
    if (valor !== "") origem[chave] = valor;
  }

  const indicou = hostDoReferrer(referrer, hostAtual);
  if (indicou) origem.referrer = indicou;

  if (Object.keys(origem).length === 0) return null;

  origem.em = agora.toISOString();
  return origem;
}

/** Só os campos conhecidos, e só se ainda estiver no prazo. */
export function interpretar(texto, agora = new Date()) {
  if (typeof texto !== "string" || texto === "") return null;

  let lido;
  try {
    lido = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof lido !== "object" || lido === null || Array.isArray(lido)) {
    return null;
  }

  const quando = Date.parse(lido.em);
  if (Number.isNaN(quando)) return null;

  const dias = (agora.getTime() - quando) / 86_400_000;
  if (dias < 0 || dias > VALIDADE_EM_DIAS) return null;

  return sanitizar(lido);
}

/**
 * A forma segura do objeto, para gravar no banco.
 *
 * Roda também no servidor: o corpo da requisição é escrito por quem chama, e
 * quem chama pode mandar qualquer coisa. Sem isso, um POST direto encheria a
 * coluna `jsonb` com o que quisesse.
 */
export function sanitizar(bruto) {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return null;
  }
  const limpo = {};
  for (const chave of [...PARAMETROS, "referrer"]) {
    const valor = limpar(bruto[chave]);
    if (valor !== "") limpo[chave] = valor;
  }
  if (Object.keys(limpo).length === 0) return null;

  const quando = Date.parse(bruto.em);
  if (!Number.isNaN(quando)) limpo.em = new Date(quando).toISOString();
  return limpo;
}

export function serializar(origem) {
  return JSON.stringify(origem);
}
