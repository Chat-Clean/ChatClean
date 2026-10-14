/**
 * Imagens pelo MCP: o Claude passa o ENDEREÇO de uma imagem (da web, de um
 * gerador de imagens, de um banco de fotos) e o servidor a traz para o mesmo
 * bucket em que o Painel guarda capas e imagens do corpo.
 *
 * Por que trazer, e não apontar para fora: imagem de terceiro some, muda ou
 * fica lenta, e o post quebra sem ninguém mexer nele. Dentro do bucket ela é
 * nossa, e a limpeza que o Painel já faz (trocar a capa apaga a antiga, excluir
 * o post apaga as imagens) passa a valer para ela também.
 *
 * O caminho de cada imagem:
 *   1. o endereço é conferido: só https, sem credencial, e o host não pode
 *      resolver para rede interna (o servidor não vira proxy para dentro);
 *   2. o download tem prazo e teto de tamanho, e redirecionamento é seguido à
 *      mão, conferindo cada salto;
 *   3. o `sharp` decodifica (o que não for imagem de verdade falha aqui), gira
 *      pela orientação da câmera, reduz a no máximo 1600 px de largura e grava
 *      WebP, baixando a qualidade até caber em 1 MB, o limite do bucket;
 *   4. sobe para `capas/` ou `corpo/` com nome aleatório, pela chave de serviço.
 */

import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import sharp from "sharp";

import {
  BUCKET_DAS_IMAGENS,
  CACHE_DA_CAPA_EM_SEGUNDOS,
  LARGURA_MAXIMA_DA_IMAGEM_DO_CORPO,
  PREFIXO_PUBLICO_DO_STORAGE,
  TAMANHO_MAXIMO_DA_IMAGEM,
  caminhoDaCapa,
  caminhoDoCorpo,
  enderecoPublicoDaCapa,
} from "../../src/domain/blog/arquivos.js";

export const TETO_DO_DOWNLOAD = 20 * 1024 * 1024;
const PRAZO_DO_DOWNLOAD_MS = 15000;
const SALTOS_MAXIMOS = 3;
const QUALIDADES = [82, 72, 62, 52, 42];
const FORMATOS_ACEITOS = ["jpeg", "png", "webp", "gif", "avif", "heif", "tiff"];

export class RecusaDeImagem extends Error {}

/* ─── Endereço ───────────────────────────────────────────────────────────── */

/** O endereço aponta para rede interna? (IPv4 e IPv6, inclusive IPv4 mapeado) */
export function ehEnderecoInterno(ip) {
  const v = String(ip).toLowerCase().replace(/^::ffff:/, "");
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(v) === 6) {
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
  }
  return true;
}

async function conferirEndereco(bruto, resolver) {
  let url;
  try {
    url = new URL(bruto);
  } catch {
    throw new RecusaDeImagem(`"${String(bruto).slice(0, 80)}" não é um endereço de imagem.`);
  }
  if (url.protocol !== "https:") throw new RecusaDeImagem("A imagem precisa vir de um endereço https://.");
  if (url.username || url.password) throw new RecusaDeImagem("O endereço da imagem não pode ter usuário e senha.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const enderecos = isIP(host) ? [host] : (await resolver(host)).map((r) => r.address);
  if (enderecos.length === 0 || enderecos.some(ehEnderecoInterno)) {
    throw new RecusaDeImagem("Esse endereço não é de um site público.");
  }
  return url;
}

const resolverPadrao = (host) => lookup(host, { all: true, verbatim: true });

/* ─── Download ───────────────────────────────────────────────────────────── */

async function lerComTeto(resposta) {
  const declarado = Number(resposta.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > TETO_DO_DOWNLOAD) {
    throw new RecusaDeImagem("A imagem passa de 20 MB. Use uma versão menor.");
  }
  const partes = [];
  let total = 0;
  for await (const parte of resposta.body) {
    total += parte.length;
    if (total > TETO_DO_DOWNLOAD) throw new RecusaDeImagem("A imagem passa de 20 MB. Use uma versão menor.");
    partes.push(parte);
  }
  return Buffer.concat(partes);
}

export async function baixarImagem(endereco, { buscar = globalThis.fetch, resolver = resolverPadrao } = {}) {
  let atual = endereco;
  for (let salto = 0; salto <= SALTOS_MAXIMOS; salto += 1) {
    const url = await conferirEndereco(atual, resolver);
    let resposta;
    try {
      resposta = await buscar(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(PRAZO_DO_DOWNLOAD_MS),
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8", "User-Agent": "ChatClean-Painel/1.0 (+https://chatclean.com.br)" },
      });
    } catch {
      throw new RecusaDeImagem("Não consegui baixar a imagem (o site não respondeu a tempo).");
    }
    if (resposta.status >= 300 && resposta.status < 400 && resposta.headers.get("location")) {
      atual = new URL(resposta.headers.get("location"), url).toString();
      continue;
    }
    if (!resposta.ok) throw new RecusaDeImagem(`O site da imagem respondeu ${resposta.status}. Confira o endereço.`);
    return lerComTeto(resposta);
  }
  throw new RecusaDeImagem("O endereço da imagem redireciona demais.");
}

/* ─── Otimização ─────────────────────────────────────────────────────────── */

/** WebP de no máximo 1600 px de largura e 1 MB. */
export async function otimizarImagem(bytes) {
  let meta;
  try {
    meta = await sharp(bytes, { animated: false, limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw new RecusaDeImagem("O arquivo desse endereço não é uma imagem.");
  }
  if (!FORMATOS_ACEITOS.includes(meta.format)) {
    throw new RecusaDeImagem("Formato de imagem não aceito. Use JPEG, PNG, WebP ou AVIF (SVG não entra).");
  }
  for (const quality of QUALIDADES) {
    const saida = await sharp(bytes, { animated: false, limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: LARGURA_MAXIMA_DA_IMAGEM_DO_CORPO, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    if (saida.data.length <= TAMANHO_MAXIMO_DA_IMAGEM) {
      return { bytes: saida.data, largura: saida.info.width, altura: saida.info.height };
    }
  }
  throw new RecusaDeImagem("Mesmo comprimida, a imagem passa de 1 MB. Use uma imagem mais simples.");
}

/* ─── Envio ao bucket ────────────────────────────────────────────────────── */

/** O endereço já é de uma imagem do nosso bucket? Então não precisa trazer. */
export function ehDoNossoBucket(endereco, urlDoSupabase) {
  const prefixo = `${String(urlDoSupabase).replace(/\/+$/, "")}${PREFIXO_PUBLICO_DO_STORAGE}${BUCKET_DAS_IMAGENS}/`;
  return typeof endereco === "string" && endereco.startsWith(prefixo);
}

/**
 * Cria o importador. `config` é o de `lerAmbiente` (`url`, `chaveDeServico`).
 * `importar(endereco, destino)` devolve o endereço público no bucket;
 * `destino` é "capa" (capa e imagem de compartilhamento) ou "corpo".
 */
export function criarImportador(config, { buscar = globalThis.fetch, resolver = resolverPadrao } = {}) {
  const base = String(config.url).replace(/\/+$/, "");

  async function enviar(caminho, bytes) {
    const resposta = await buscar(`${base}/storage/v1/object/${BUCKET_DAS_IMAGENS}/${caminho}`, {
      method: "POST",
      signal: AbortSignal.timeout(PRAZO_DO_DOWNLOAD_MS),
      headers: {
        apikey: config.chaveDeServico,
        Authorization: `Bearer ${config.chaveDeServico}`,
        "Content-Type": "image/webp",
        "Cache-Control": `max-age=${CACHE_DA_CAPA_EM_SEGUNDOS}`,
        "x-upsert": "false",
      },
      body: bytes,
    });
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => "");
      console.error(`[mcp] envio ao bucket falhou: ${resposta.status} ${texto.slice(0, 200)}`);
      throw new RecusaDeImagem("Não consegui guardar a imagem no armazenamento do site. Tente de novo.");
    }
  }

  return {
    async importar(endereco, destino) {
      if (ehDoNossoBucket(endereco, base)) return endereco;
      const otimizada = await otimizarImagem(await baixarImagem(endereco, { buscar, resolver }));
      const nome = randomUUID();
      const caminho = destino === "corpo" ? caminhoDoCorpo("image/webp", nome) : caminhoDaCapa("image/webp", nome);
      await enviar(caminho, otimizada.bytes);
      return enderecoPublicoDaCapa(base, caminho);
    },
  };
}
