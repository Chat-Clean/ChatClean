/**
 * O ping diário que impede o Supabase de pausar.
 *
 * ═══ O PROBLEMA ══════════════════════════════════════════════════════════
 *
 * O projeto gratuito do Supabase pausa depois de **7 dias sem atividade**, e
 * despausar é manual. `scripts/monitorar-pausa.mjs` já sabe DETECTAR a pausa
 * depois que ela acontece; esta porta existe para ela não acontecer.
 *
 * Uma requisição por dia, disparada pelo cron da Vercel declarado em
 * `vercel.json`, dá sete visitas dentro de cada janela de sete dias. Se seis
 * falharem, a sétima ainda salva o projeto.
 *
 * ═══ ELA NÃO ESCREVE NADA. ISSO É ESTRUTURAL, NÃO PROMESSA ══════════════
 *
 * Duas travas, e nenhuma delas depende de alguém lembrar:
 *
 * **1. A chave é a PUBLICÁVEL.** A mesma que vai para o navegador. Com ela, a
 * RLS nega escrita a `anon` no banco inteiro: mesmo que este arquivo passasse
 * a mandar um `POST` por engano, o banco recusaria. A chave de serviço, que
 * ignora RLS, não é lida aqui e não tem por que estar.
 *
 * **2. O método é GET, escrito.** `fetch` sem `method` já seria GET, mas
 * escrever torna a garantia verificável de fora: `verificar:entrega` afirma
 * que o método sai GET, e a asserção falha se alguém trocar.
 *
 * ═══ POR QUE `no-store` NÃO É DETALHE ═══════════════════════════════════
 *
 * Se esta resposta fosse cacheável, o cron acertaria o cache da borda, nunca
 * chegaria ao Supabase, e o projeto pausaria com o cron marcado como bem
 * sucedido todos os dias. É a falha mais silenciosa possível para esta porta:
 * ela pareceria funcionar exatamente até o dia em que o blog sumisse.
 */

/** A tabela consultada. Pública por RLS, e sempre com linhas. */
export const TABELA = "categorias";

/** Prazo curto: é um ping, não uma consulta que alguém está esperando. */
export const PRAZO_MS = 5000;

/** Os nomes aceitos, na ordem de precedência. Iguais aos de `acesso.js`. */
export const VARIAVEIS = Object.freeze({
  url: Object.freeze(["SUPABASE_URL", "VITE_SUPABASE_URL"]),
  chavePublicavel: Object.freeze([
    "SUPABASE_CHAVE_PUBLICAVEL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  ]),
});

/** O primeiro nome com valor, ou `""`. */
function doAmbiente(ambiente, nomes) {
  for (const nome of nomes) {
    const bruto = ambiente?.[nome];
    if (typeof bruto === "string" && bruto.trim() !== "") return bruto.trim();
  }
  return "";
}

/**
 * A requisição do cron da Vercel é legítima?
 *
 * Enquanto `CRON_SECRET` não existir no ambiente, a porta fica aberta: ela só
 * faz uma leitura pública, e exigir um segredo que ninguém declarou faria o
 * cron falhar todo dia em silêncio. Declarado o segredo, a Vercel passa a
 * mandá-lo em `Authorization`, e aí ele é exigido.
 */
export function pedidoAutorizado(cabecalhos = {}, ambiente = {}) {
  const segredo = doAmbiente(ambiente, ["CRON_SECRET"]);
  if (segredo === "") return true;
  const recebido = cabecalhos.authorization ?? cabecalhos.Authorization ?? "";
  return recebido === `Bearer ${segredo}`;
}

export default async function handler(req, res, buscar = globalThis.fetch) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({
      tipo: "MetodoNaoPermitido",
      mensagem: "esta rota atende GET.",
    });
  }

  // Antes de qualquer coisa, e em toda saída: ver a nota sobre `no-store`.
  res.setHeader("Cache-Control", "no-store");

  if (!pedidoAutorizado(req.headers ?? {}, process.env)) {
    return res.status(401).json({ tipo: "NaoAutorizado", mensagem: "segredo inválido." });
  }

  const url = doAmbiente(process.env, VARIAVEIS.url).replace(/\/+$/, "");
  const chave = doAmbiente(process.env, VARIAVEIS.chavePublicavel);

  if (url === "" || chave === "") {
    console.error("[manter-acordado] configuração do Supabase incompleta");
    return res.status(500).json({
      tipo: "Configuracao",
      mensagem: "o ping não está configurado.",
    });
  }

  const comecou = Date.now();
  let resposta;
  try {
    resposta = await buscar(`${url}/rest/v1/${TABELA}?select=id&limit=1`, {
      method: "GET",
      headers: { apikey: chave, Authorization: `Bearer ${chave}` },
      signal: (() => {
        try {
          return AbortSignal.timeout(PRAZO_MS);
        } catch {
          return undefined;
        }
      })(),
    });
  } catch (erro) {
    console.error(`[manter-acordado] sem resposta: ${erro?.message ?? "rede"}`);
    return res.status(503).json({
      tipo: "BancoIndisponivel",
      mensagem: "o banco não respondeu.",
    });
  }

  const emMs = Date.now() - comecou;

  if (!resposta.ok) {
    // Status no log E no corpo: quem olha o histórico do cron na Vercel vê
    // apenas o código HTTP da nossa resposta, e precisa saber o que houve.
    console.error(`[manter-acordado] o banco respondeu ${resposta.status}`);
    return res.status(503).json({
      tipo: "BancoIndisponivel",
      mensagem: `o banco respondeu ${resposta.status}.`,
      emMs,
    });
  }

  console.log(`[manter-acordado] ok em ${emMs}ms`);
  return res.status(200).json({ acordado: true, tabela: TABELA, emMs });
}
