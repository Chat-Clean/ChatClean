#!/usr/bin/env node
/**
 * Gera a foto da hero (`src/assets/hero-atendimento.webp`, 2800px, e a
 * variante de 1400px) a partir da foto original DSC09217 (6000x4000, fora
 * do Git): a atendente, o notebook e a mesa NÍTIDOS sobre o fundo da própria
 * foto DESFOCADO, na proporção que a hero mostra em 1440x900.
 *
 * A parte nítida é um recorte em três camadas somadas:
 *   1. a atendente, pelo alpha de um modelo de segmentação (imgly);
 *   2. o notebook, por polígono de bordas retas medido sobre a foto — o
 *      modelo o via como fundo;
 *   3. um pouco da mesa, por uma elipse esfumada — o apoio que dá relevo.
 * A cadeira sai por um polígono que acompanha a borda do blazer.
 *
 * Roda FORA do build e das dependências do projeto (os dois pacotes pesam
 * centenas de MB e só servem a este arquivo). Numa pasta temporária:
 *
 *   npm init -y && npm i sharp @imgly/background-removal-node
 *   node <este arquivo> C:/caminho/DSC09217.JPG.jpeg
 *
 * e copie os dois .webp gerados para `src/assets/`. As coordenadas abaixo
 * são da REGIÃO recortada (2000x1498) — mudou a foto, mudam as coordenadas.
 */
import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";
import { readFileSync, writeFileSync } from "node:fs";

const ORIG = process.argv[2];
if (!ORIG) throw new Error("Passe o caminho da foto original.");

// Região da original que contém mulher + notebook + mesa, reduzida a 2000px
const crop = { left: 1620, top: 720, width: 4380, height: 3280 };
const W = 2000, H = 1498;
const base = await sharp(ORIG).extract(crop).resize({ width: W }).jpeg({ quality: 90 }).toBuffer();
writeFileSync("crop.jpg", base);

// 1. A atendente, pelo modelo (roda em processo separado por conflito de sharp)
const out = await removeBackground(new Blob([readFileSync("crop.jpg")], { type: "image/jpeg" }), {
  model: "medium",
  output: { format: "image/png" },
});
writeFileSync("subject.png", Buffer.from(await out.arrayBuffer()));

async function rasterMask(svgInner, blur = 0) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/>${svgInner}</svg>`);
  let s = sharp(svg).removeAlpha().grayscale();
  if (blur) s = s.blur(blur);
  return s.raw().toBuffer();
}

// O notebook e as mãos, por polígonos de bordas retas medidos sobre a foto
// com grade fina (o modelo de segmentação via o notebook como fundo e
// deixava as mãos com alpha fraco). As diagonais seguem as arestas reais:
// a tampa inclina para a direita ao descer, e a base desce para a direita.
const laptop = await rasterMask(
  `<polygon fill="#fff" points="64,558 478,604 556,968 146,994"/>
   <polygon fill="#fff" points="100,984 748,1000 772,1050 600,1092 140,1076"/>
   <polygon fill="#fff" points="556,795 672,792 702,835 700,905 640,978 560,970"/>
   <polygon fill="#fff" points="732,806 840,806 852,900 762,938 726,904"/>`, 1.5);

const mesa = await rasterMask(`<ellipse fill="#fff" cx="720" cy="1125" rx="600" ry="185"/>`, 40);
const semCadeira = await rasterMask(
  `<rect fill="#fff" x="0" y="0" width="${W}" height="${H}"/>
   <polygon fill="#000" points="1448,700 1445,880 1428,930 1410,962 1404,1230 1420,1380 1462,${H} ${W},${H} ${W},700"/>`, 4);
const smooth = (a, lo, hi) => { const t = Math.min(1, Math.max(0, (a - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

const { data } = await sharp("subject.png").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const orig = await sharp("crop.jpg").ensureAlpha().raw().toBuffer();
const pixels = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const x = i % W;
  let ai = smooth(data[i * 4 + 3] / 255, 0.4, 0.85) * 255;
  if (x < 560) ai = 0;                    // à esquerda só existe o notebook
  ai = (ai * semCadeira[i]) / 255;
  const rampa = Math.min(1, Math.max(0, (x - 150) / 200));
  const a = Math.max(ai, laptop[i], mesa[i] * rampa);
  pixels[i * 4] = orig[i * 4]; pixels[i * 4 + 1] = orig[i * 4 + 1]; pixels[i * 4 + 2] = orig[i * 4 + 2];
  pixels[i * 4 + 3] = Math.round(a);
}
const final = await sharp(pixels, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();

// ─── O FUNDO ─────────────────────────────────────────────────────────────
// Região que a hero mostra em 1440x900 com a mulher onde está hoje, em
// coordenadas da original: x de -4000 a 5210, y de -46 a 4546.
// À esquerda da foto não existe nada: preenche-se com a faixa da parede de
// plantas (x 900..1700, sem a porta clara nem o notebook) esticada até lá.
const X0 = -4000, X1 = 5210, Y0 = -46, Y1 = 4546;
const ALTURA_ORIG = 4000;
const faixa = { left: 900, width: 800 };
const banda = await sharp(ORIG).extract({ left: faixa.left, top: 0, width: faixa.width, height: ALTURA_ORIG }).toBuffer();
const larguraFiller = faixa.left - X0; // 4900
// a faixa esticada só 2x (pouca estria) e espelhada em sequência: período
// longo, quase sem repetição visível depois do desfoque
const trecho = await sharp(banda).resize({ width: faixa.width * 2, height: ALTURA_ORIG, fit: "fill" }).toBuffer();
const trechoEspelho = await sharp(trecho).flop().toBuffer();
const larguraTrecho = faixa.width * 2;
const pecas = [];
for (let x = larguraFiller, i = 0; x > 0; i++) {
  const w = Math.min(larguraTrecho, x);
  x -= w;
  const src = i % 2 === 0 ? trechoEspelho : trecho; // o primeiro encosta na foto pela borda esquerda da faixa
  pecas.push({ input: await sharp(src).extract({ left: larguraTrecho - w, top: 0, width: w, height: ALTURA_ORIG }).toBuffer(), left: x, top: 0 });
}
const filler = await sharp({ create: { width: larguraFiller, height: ALTURA_ORIG, channels: 3, background: "#000" } }).composite(pecas).jpeg({ quality: 95 }).toBuffer();
const direita = await sharp(ORIG).extract({ left: faixa.left, top: 0, width: X1 - faixa.left, height: ALTURA_ORIG }).toBuffer();
const largaBuf = await sharp({ create: { width: X1 - X0, height: ALTURA_ORIG, channels: 3, background: "#000" } })
  .composite([{ input: filler, left: 0, top: 0 }, { input: direita, left: larguraFiller, top: 0 }]).jpeg({ quality: 95 }).toBuffer();
// espelho só em cima/embaixo (46 e 546 px), depois reduz e desfoca
const estendida = await sharp(largaBuf).extend({ top: -Y0, bottom: Y1 - ALTURA_ORIG, extendWith: "mirror" }).toBuffer();
const OUT_W = 2800, s = OUT_W / (X1 - X0);
const fundo = await sharp(estendida).resize({ width: OUT_W }).blur(9).toBuffer();
// A mulher, o notebook e a mesa nítidos (final.png = região 1620,720 4380x3280 em 2000x1498)
const sujeito = await sharp(final).resize({ width: Math.floor(4380 * s) - 2 }).toBuffer();
const composta = await sharp(fundo).composite([{ input: sujeito, left: Math.round((1620 - X0) * s), top: Math.round((720 - Y0) * s) }]).png().toBuffer();
const meta = await sharp(composta).metadata();
console.log("gerados hero-atendimento.webp e hero-atendimento-720.webp:", meta.width, "x", meta.height);
await sharp(composta).webp({ quality: 80 }).toFile("hero-atendimento.webp");
await sharp(composta).resize({ width: 1400 }).webp({ quality: 78 }).toFile("hero-atendimento-720.webp");
