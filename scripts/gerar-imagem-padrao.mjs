#!/usr/bin/env node
/**
 * Gera os dois ativos de prévia do site, rasterizando a composição pura de
 * `ativos-comum.mjs`:
 *
 *   - a **Imagem Padrão do Site**, o cartão que WhatsApp, Facebook e LinkedIn
 *     mostram quando um link do site é compartilhado;
 *   - o **Logotipo Rasterizado**, que o dado estruturado chama de `logo`.
 *
 * Uso:
 *   npm run ativo:imagem-padrao                    grava os dois em `public/`
 *   node scripts/gerar-imagem-padrao.mjs --saida D  grava os dois no diretório D
 *   node scripts/gerar-imagem-padrao.mjs --impressoes   só imprime as impressões
 *
 * ─── POR QUE ISTO É UM SCRIPT, E NÃO UM PASSO DE BUILD ─────────────────────
 *
 * O resultado é ATIVO do projeto, versionado como qualquer outro arquivo de
 * `public/`. Um rasterizador rodando em todo `npm run build` faria o build de
 * produção depender de binário nativo por causa de arquivos que mudam uma vez
 * por ano — e faria a imagem servida depender da máquina que buildou. Aqui ele
 * é dependência de DESENVOLVIMENTO, roda quando a marca muda, e o que vai para
 * o ar é o byte conferido.
 *
 * ─── E POR QUE O MESMO ARQUIVO SAI TODA VEZ ───────────────────────────────
 *
 * Não há relógio, aleatório nem caminho absoluto dentro do PNG: as entradas são
 * o SVG, os tokens e as constantes da composição, e o rasterizador é
 * determinístico e está PREGADO numa versão exata em `package.json`.
 * `verificar:interface` roda esta geração de novo e compara byte a byte com o
 * que está versionado — ativo que ninguém consegue reproduzir é ativo que
 * ninguém consegue corrigir.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Resvg } from "@resvg/resvg-js";

import {
  ATIVO_DE_MARCA,
  COMPOSICOES,
  FONTE_DO_TOKEN,
  corDoToken,
  impressaoDaComposicao,
  svgDaComposicao,
} from "./ativos-comum.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Um documento SVG virado bytes de PNG.
 *
 * Exportada para que a verificação possa RECOMPOR os ativos por fora e comparar
 * com o que este script produz: é assim que ela prova que o fundo saiu mesmo do
 * token e que o desenho saiu mesmo do ativo de marca — trocar qualquer um dos
 * dois muda o byte, e a asserção vê.
 */
export function rasterizar(svg, largura) {
  /* `fitTo` por largura, e a altura sai do próprio `viewBox`: pedir as duas
     abriria a porta para um par que não é o do documento, e a imagem sairia
     esticada sem nada acusar. */
  const desenho = new Resvg(svg, { fitTo: { mode: "width", value: largura } });
  return desenho.render().asPng();
}

/** O documento SVG de uma composição, com as entradas lidas do repositório. */
export function composicaoDoRepositorio(composicao) {
  const marca = readFileSync(path.join(raiz, ATIVO_DE_MARCA), "utf8");
  const css = readFileSync(path.join(raiz, FONTE_DO_TOKEN), "utf8");
  const fundo = corDoToken(css, composicao.token);
  return svgDaComposicao(composicao, { marca, fundo });
}

/**
 * Os bytes do PNG de uma composição, lendo as entradas do repositório.
 *
 * Exportada para que a verificação a EXECUTE em vez de ler o texto deste
 * arquivo — comportamento se observa.
 */
export function bytesDoAtivo(composicao) {
  return rasterizar(composicaoDoRepositorio(composicao), composicao.ativo.largura);
}

/* ─── A linha de comando ─────────────────────────────────────────────────── */

/**
 * O diretório pedido em `--saida`, ou `public/`.
 *
 * Recusa valor que começa com `--`: sem isso, `--saida --impressoes` gravaria
 * um arquivo chamado `--impressoes` e a bandeira seguinte sumiria em silêncio.
 * E cria o diretório: apontar para pasta inexistente estourava com `ENOENT`
 * cru, que não diz o que fazer.
 */
function diretorioPedido(argumentos) {
  const i = argumentos.indexOf("--saida");
  if (i === -1) return path.join(raiz, "public");
  const valor = argumentos[i + 1];
  if (!valor || valor.startsWith("--")) {
    throw new Error("--saida precisa do caminho de um DIRETÓRIO logo em seguida");
  }
  const destino = path.resolve(valor);
  if (!existsSync(destino)) mkdirSync(destino, { recursive: true });
  if (!statSync(destino).isDirectory()) {
    throw new Error(`--saida precisa ser um diretório; ${destino} não é`);
  }
  return destino;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argumentos = process.argv.slice(2);

  if (argumentos.includes("--impressoes")) {
    for (const composicao of COMPOSICOES) {
      const svg = composicaoDoRepositorio(composicao);
      console.log(`${composicao.nome}: ${impressaoDaComposicao(svg)}`);
    }
  } else {
    const diretorio = diretorioPedido(argumentos);
    for (const composicao of COMPOSICOES) {
      const bytes = bytesDoAtivo(composicao);
      const destino = path.join(diretorio, path.basename(composicao.ativo.caminho));
      writeFileSync(destino, bytes);
      console.log(
        `${composicao.nome}: ${path.relative(raiz, destino).split(path.sep).join("/")} — ` +
          `${composicao.ativo.largura}x${composicao.ativo.altura}, ${bytes.length} bytes, ` +
          `derivado de ${ATIVO_DE_MARCA} sobre ${composicao.token}`,
      );
    }
  }
}
