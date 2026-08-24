/**
 * Embute no pacote das funções o SHELL QUE O BUILD PRODUZIU.
 *
 * ─── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 *
 * O `index.html` do repositório termina em `<script src="/src/main.jsx">` — o
 * caminho do CÓDIGO-FONTE, que existe aqui e não existe em produção. Uma função
 * que o servisse entregaria uma página que responde com sucesso e não carrega:
 * o navegador pede `/src/main.jsx`, recebe o apanha-tudo de volta, e o visitante
 * vê uma tela em branco. É a falha silenciosa que a Story 4.1 existe para
 * impedir.
 *
 * O que serve é o `dist/index.html`, com os ativos com hash daquele build. E os
 * hashes MUDAM a cada build — então uma cópia versionada nasceria velha no build
 * seguinte, e serviria uma página apontando para ativo que já não existe. Por
 * isso o resultado é GERADO e ignorado pelo versionamento: a única cópia que
 * existe é sempre a do build atual.
 *
 * ─── A ORDEM IMPORTA ──────────────────────────────────────────────────────
 *
 * Este passo roda DEPOIS do build da aplicação, encadeado em `npm run build`.
 * Sem o `dist/`, ele falha alto em vez de escrever um shell vazio: um arquivo
 * gerado pela metade é pior que arquivo nenhum, porque o defeito só apareceria
 * no navegador de quem visita.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** De onde o shell vem — a saída do `vite build`, e nada mais. */
export const ORIGEM_DO_SHELL = "dist/index.html";

/** Onde ele é embutido. Ignorado pelo versionamento, de propósito. */
export const DESTINO_DO_SHELL = "api/_nucleo/shell.gerado.js";

/**
 * Os ativos que um shell referencia.
 *
 * Lê `src=` e `href=` que apontem para o diretório de ativos do build. É por
 * esta lista que a verificação confere que o shell embutido aponta para
 * arquivos que EXISTEM no pacote — comparar só o texto dos dois provaria que
 * são iguais, e não que o que eles prometem está lá.
 */
export function ativosDoShell(html) {
  const achados = new Set();
  const padrao = /(?:src|href)\s*=\s*"(\/assets\/[^"]+)"/g;
  let casa;
  while ((casa = padrao.exec(html)) !== null) achados.add(casa[1]);
  return [...achados].sort();
}

/** Monta o módulo embutido a partir do HTML do build. */
export function moduloDoShell(html) {
  const ativos = ativosDoShell(html);
  return (
    "/* GERADO por scripts/gerar-shell.mjs a cada `npm run build`. Não editar,\n" +
    "   não versionar: os hashes dos ativos mudam a cada build, e uma cópia\n" +
    "   guardada nasceria velha na build seguinte. */\n\n" +
    `export const SHELL = ${JSON.stringify(html)};\n\n` +
    `export const ATIVOS_DO_SHELL = Object.freeze(${JSON.stringify(ativos)});\n`
  );
}

/** Gera o módulo. Devolve `{ caminho, ativos }`; lança se o build não rodou. */
export function gerar({ destino = DESTINO_DO_SHELL } = {}) {
  const origem = path.join(raiz, ORIGEM_DO_SHELL);
  if (!existsSync(origem)) {
    throw new Error(
      `${ORIGEM_DO_SHELL} não existe — rode \`vite build\` antes. ` +
        "Este passo embute o shell do BUILD, e não o do repositório.",
    );
  }
  const html = readFileSync(origem, "utf8");
  const ativos = ativosDoShell(html);
  if (ativos.length === 0) {
    throw new Error(
      `${ORIGEM_DO_SHELL} não referencia nenhum ativo do build — ` +
        "shell assim serviria uma página sem JavaScript nenhum.",
    );
  }
  const caminho = path.join(raiz, destino);
  mkdirSync(path.dirname(caminho), { recursive: true });
  writeFileSync(caminho, moduloDoShell(html));
  return { caminho, ativos };
}

/* Só executa quando chamado direto — importar este módulo não escreve nada. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ativos } = gerar();
  console.log(`Shell embutido em ${DESTINO_DO_SHELL} — ${ativos.length} ativo(s):`);
  for (const a of ativos) console.log(`  ${a}`);
}
