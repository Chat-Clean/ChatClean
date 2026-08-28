#!/usr/bin/env node
/**
 * O alarme da pausa do Supabase (Story 4.10).
 *
 * O projeto gratuito do Supabase pausa depois de 7 dias sem atividade. Sem um
 * alarme, a primeira notícia disso seria alguém reclamando que o blog sumiu —
 * e a distância entre a pausa e essa reclamação pode ser dias.
 *
 * ─── O QUE ELE FAZ, E POR QUE ISSO BASTA ──────────────────────────────────
 *
 * Ele busca o mapa do site publicado, resolve o endereço de um Post a partir
 * dele — e não de um endereço fixo escrito aqui, que quebraria no dia em que
 * aquele Post fosse arquivado ou renomeado, e o alarme passaria a disparar
 * pelo motivo errado —, busca essa página e a da home, e compara os títulos.
 *
 * Com o Supabase pausado, `/blog/:slug` degrada para o shell CRU (Story 4.10):
 * o título que volta é literalmente o da home, porque é o shell sem
 * substituição de região nenhuma que é servido. É esse sinal, e não uma
 * suposição, que este script mede.
 *
 * ─── SEM EXECUTAR JAVASCRIPT ──────────────────────────────────────────────
 *
 * A busca é `fetch` de texto puro — o mesmo que um rastreador faz. Um
 * navegador de verdade correndo a aplicação React mascararia exatamente o
 * sintoma que este alarme existe para pegar: a aplicação, do lado do cliente,
 * teria seu PRÓPRIO estado de carregamento e nunca mostraria o título cru do
 * shell.
 *
 * Uso:
 *   npm run entrega:monitorar-pausa -- --dominio=https://chatclean.com.br
 *   VITE_DOMINIO_DO_SITE=https://chatclean.com.br npm run entrega:monitorar-pausa
 *
 * ─── A EXECUÇÃO PERIÓDICA É PENDÊNCIA DE OPERAÇÃO ─────────────────────────
 *
 * Este arquivo é o QUE rodar. QUANDO rodar é um agendador externo — GitHub
 * Actions, Vercel Cron, ou qualquer outro — que este repositório não tem e que
 * esta story não configura: um agendador que eu não posso observar daqui não é
 * uma garantia, é uma esperança escrita como se fosse garantia.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/** Extrai o primeiro endereço de Post do mapa do site (XML).
 *
 * Pelo MAPA, e não por um slug fixo escrito no código: um endereço fixo
 * quebraria no dia em que aquele Post fosse arquivado ou renomeado, e o
 * alarme passaria a disparar por um motivo que não é a pausa. */
export function enderecoDoPrimeiroPost(xmlDoMapa, raiz) {
  const semBarra = String(raiz ?? "").replace(/\/+$/, "");
  const prefixo = `<loc>${semBarra}/blog/`;
  const partes = String(xmlDoMapa ?? "").split(prefixo);
  if (partes.length < 2) return null;
  const resto = partes[1].split("</loc>")[0];
  if (typeof resto !== "string" || resto.trim() === "") return null;
  return `${semBarra}/blog/${resto}`;
}

/** O texto entre `<title>` e `</title>`, ou `null`. */
export function extrairTitulo(html) {
  const m = /<title>([^<]*)<\/title>/i.exec(String(html ?? ""));
  return m === null ? null : m[1].trim();
}

/**
 * A avaliação: o Post degradou para o título da home?
 *
 * Devolve `{ alerta, motivo }`. `alerta` é `true` quando não dá para confirmar
 * que o Post está sendo servido de verdade — e "não dá para confirmar" é
 * tratado como alarme, não como saúde: o lado seguro de uma checagem de pausa
 * é desconfiar, porque o custo de um alarme falso é uma olhada; o custo de um
 * silêncio falso é dias sem ninguém saber que o blog está fora do ar.
 */
export function avaliarPausa({ enderecoDoPost, tituloDoPost, tituloDaHome }) {
  if (enderecoDoPost === null) {
    return {
      alerta: true,
      motivo:
        "o mapa do site não trouxe nenhum endereço de Post — sem um Post para checar, não dá para confirmar que o blog está servindo de verdade.",
    };
  }
  if (tituloDoPost === null || tituloDaHome === null) {
    return {
      alerta: true,
      motivo: `não foi possível ler o título de ${tituloDoPost === null ? "o Post" : "a home"} — a página buscada não respondeu com um <title>.`,
    };
  }
  if (tituloDoPost === tituloDaHome) {
    return {
      alerta: true,
      motivo: `${enderecoDoPost} respondeu com o título da HOME ("${tituloDaHome}") — sinal de que a leitura do Supabase está falhando e a rota degradou para o shell.`,
    };
  }
  return { alerta: false, motivo: `${enderecoDoPost} respondeu com título próprio: "${tituloDoPost}".` };
}

/**
 * A checagem inteira: busca o mapa, resolve um Post, busca as duas páginas,
 * compara. `buscar` é injetável pela mesma razão de sempre neste projeto: o
 * caminho inteiro se exercita sem rede.
 */
export async function verificarPausa({ raiz, buscar = globalThis.fetch }) {
  const semBarra = String(raiz ?? "").replace(/\/+$/, "");
  if (semBarra === "") {
    return { alerta: true, motivo: "nenhum domínio foi informado — nada para checar." };
  }

  let xmlDoMapa = null;
  try {
    const r = await buscar(`${semBarra}/sitemap.xml`);
    if (r.ok) xmlDoMapa = await r.text();
  } catch {
    xmlDoMapa = null;
  }
  if (xmlDoMapa === null) {
    return {
      alerta: true,
      motivo: `${semBarra}/sitemap.xml não respondeu — sem o mapa, não há como escolher um Post para checar.`,
    };
  }

  const enderecoDoPost = enderecoDoPrimeiroPost(xmlDoMapa, semBarra);

  const buscarTitulo = async (endereco) => {
    if (endereco === null) return null;
    try {
      const r = await buscar(endereco);
      return extrairTitulo(await r.text());
    } catch {
      return null;
    }
  };

  const [tituloDoPost, tituloDaHome] = await Promise.all([
    buscarTitulo(enderecoDoPost),
    buscarTitulo(semBarra === "" ? null : `${semBarra}/`),
  ]);

  return avaliarPausa({ enderecoDoPost, tituloDoPost, tituloDaHome });
}

async function principal() {
  const args = process.argv.slice(2);
  const doArgumento = args
    .find((a) => a.startsWith("--dominio="))
    ?.slice("--dominio=".length);
  const raiz = doArgumento ?? process.env.VITE_DOMINIO_DO_SITE ?? "";

  if (raiz.trim() === "") {
    console.error(
      "Nenhum domínio informado. Use --dominio=https://exemplo.com.br ou declare VITE_DOMINIO_DO_SITE.",
    );
    process.exitCode = 2;
    return;
  }

  const resultado = await verificarPausa({ raiz });
  if (resultado.alerta) {
    console.error(`ALERTA — ${resultado.motivo}`);
    process.exitCode = 1;
  } else {
    console.log(`OK — ${resultado.motivo}`);
    process.exitCode = 0;
  }
}

const ehEntrada =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ehEntrada) {
  await principal();
}
