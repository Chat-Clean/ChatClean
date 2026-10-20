/**
 * Uma cópia do shell do build por página fixa, com os metadados DELA.
 *
 * ─── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 *
 * O apanha-tudo serve `index.html` para toda rota da aplicação, e a região de
 * metadados dele é a da HOME. `/sobre`, `/integracoes` e as outras páginas
 * fixas chegavam ao buscador com o título da home e canônica `/`, isto é,
 * declarando-se cópias dela, e o Search Console não as indexava.
 *
 * Este passo roda depois do build, troca a região (`trocarRegiao`, a mesma da
 * página do Post) pela de cada página de `PAGINAS_FIXAS` e grava o resultado
 * em `dist/paginas/<arquivo>.html`. `vercel.json` reescreve cada caminho para
 * a sua cópia, antes do apanha-tudo. A aplicação carrega igual: o resto do
 * shell, ativos com hash incluídos, é o do build.
 *
 * ─── O DOMÍNIO É O QUE O SHELL JÁ DECLARA ─────────────────────────────────
 *
 * A raiz sai da canônica da home no próprio `dist/index.html`, e não de uma
 * segunda declaração: o build local não tem a variável de ambiente, e as
 * cópias têm de apontar para o mesmo domínio que o shell servido aponta.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MARCA_FIM, MARCA_INICIO, regiaoDeMetadados } from "../api/_nucleo/metadados.js";
import { trocarRegiao } from "../api/_nucleo/shell.js";
import {
  IMAGEM_PADRAO_DO_SITE,
  enderecoDaImagemPadrao,
  raizDoSite,
} from "../src/domain/blog/compartilhamento.js";
import { PAGINAS_FIXAS, arquivoDaPaginaFixa } from "../src/domain/paginasFixas.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ORIGEM = "dist/index.html";

/** A raiz do site pela canônica da home, ou lança. */
export function raizDoShell(html) {
  const canonica = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (typeof canonica !== "string") {
    throw new Error(`${ORIGEM} não declara canônica: não há de onde tirar o domínio.`);
  }
  return raizDoSite(new URL(canonica).origin);
}

/** O HTML de uma página fixa, ou lança. */
export function htmlDaPaginaFixa(shell, pagina, raizDoSiteResolvida) {
  const regiao = regiaoDeMetadados({
    titulo: pagina.titulo,
    descricao: pagina.descricao,
    canonica: `${raizDoSiteResolvida}${pagina.caminho}`,
    tipo: "website",
    imagem: {
      endereco: enderecoDaImagemPadrao(raizDoSiteResolvida),
      largura: IMAGEM_PADRAO_DO_SITE.largura,
      altura: IMAGEM_PADRAO_DO_SITE.altura,
      tipo: IMAGEM_PADRAO_DO_SITE.tipo,
      alternativo: IMAGEM_PADRAO_DO_SITE.alternativo,
    },
  });
  const trocado = trocarRegiao(shell, regiao, { inicio: MARCA_INICIO, fim: MARCA_FIM });
  if (!trocado.ok) throw new Error(`${pagina.caminho}: ${trocado.defeito}`);
  return trocado.html;
}

/** Gera as cópias. Devolve a lista de arquivos gravados; lança se o build não rodou. */
export function gerar() {
  const origem = path.join(raiz, ORIGEM);
  if (!existsSync(origem)) {
    throw new Error(`${ORIGEM} não existe: rode \`vite build\` antes.`);
  }
  const shell = readFileSync(origem, "utf8");
  const raizResolvida = raizDoShell(shell);
  const gravados = [];
  for (const pagina of PAGINAS_FIXAS) {
    const destino = path.join(raiz, "dist", arquivoDaPaginaFixa(pagina));
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, htmlDaPaginaFixa(shell, pagina, raizResolvida));
    gravados.push(`${pagina.caminho} -> dist${arquivoDaPaginaFixa(pagina)}`);
  }
  return gravados;
}

/* Só executa quando chamado direto: importar este módulo não escreve nada. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const gravados = gerar();
  console.log(`Páginas fixas com metadados próprios: ${gravados.length}`);
  for (const g of gravados) console.log(`  ${g}`);
}
