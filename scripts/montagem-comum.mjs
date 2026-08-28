/**
 * O arranjo de montagem de tela, num lugar só.
 *
 * ─── POR QUE ISTO FOI EXTRAÍDO ──────────────────────────────────────────────
 *
 * Ele nasceu dentro de `verificar-editor.mjs`, que era a única ferramenta que
 * montava componente React. A Story 2.13 precisa montar a rota da
 * pré-visualização em `verificar-acesso.mjs` — para PROVAR que sem sessão o
 * conteúdo do Post não monta, em vez de LER que o portão está lá. Duplicar o
 * arranjo daria dois JSDOM configurados de formas que divergiriam no primeiro
 * ajuste de um deles, e o divergente é sempre o que ninguém está olhando.
 *
 * O que mora aqui é o que não é de nenhuma tela em particular: o navegador de
 * mentira e o empacotador. O que cada ferramenta monta, e com quais dublês,
 * continua sendo dela.
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";

export const raizDoProjeto = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Um navegador de mentira, mas um DOM de verdade.
 *
 * Cada remendo aqui foi medido, não suposto — ver os comentários internos.
 */
export function montarNavegador({ url = "https://painel.local/" } = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body><div id='area'></div></body></html>",
    { pretendToBeVisual: true, url },
  );
  const w = dom.window;
  const expor = (nome, valor) => {
    try {
      Object.defineProperty(globalThis, nome, {
        value: valor,
        configurable: true,
        writable: true,
      });
    } catch {
      /* propriedade sem escrita no Node: o jsdom já supre a maioria */
    }
  };
  for (const nome of Object.getOwnPropertyNames(w)) {
    if (nome in globalThis) continue;
    try {
      expor(nome, w[nome]);
    } catch {
      /* getters que estouram ao serem lidos não interessam aqui */
    }
  }
  /* Os construtores de evento do JSDOM sobrepõem os do Node, e a sobreposição
     é obrigatória, não cosmética. O Node 22+ já traz `Event` e `CustomEvent`
     globais, então o laço acima os pula (`nome in globalThis` é verdadeiro) — e
     uma biblioteca que faça `new CustomEvent(...)` produz um objeto que o
     `dispatchEvent` do jsdom RECUSA com "parameter 1 is not of type 'Event'".
     É o que acontecia ao montar o diálogo do shadcn: o Radix dispara eventos
     próprios ao abrir, e a tela inteira caía num erro que não é da tela. */
  for (const nome of ["Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "FocusEvent"]) {
    if (w[nome]) expor(nome, w[nome]);
  }
  expor("window", w);
  expor("document", w.document);
  expor("navigator", w.navigator);
  /* Geometria de mentira. O jsdom não faz layout, e o ProseMirror pergunta a
     posição do cursor na tela sempre que um comando pede foco. Sem isto, cada
     comando cospe uma pilha de `getClientRects is not a function` no meio da
     saída — ruído que esconderia uma FALHA de verdade na hora de ler. */
  const retangulo = () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
  });
  for (const prototipo of [w.Range.prototype, w.Element.prototype, w.Text.prototype]) {
    if (typeof prototipo.getClientRects !== "function") {
      prototipo.getClientRects = () => [retangulo()];
    }
    if (typeof prototipo.getBoundingClientRect !== "function") {
      prototipo.getBoundingClientRect = retangulo;
    }
  }
  w.Range.prototype.getClientRects = () => [retangulo()];

  /* O jsdom não implementa `ClipboardEvent`, e é dele que o caminho de colagem
     do ProseMirror depende: `view.pasteHTML` constrói um para disparar o
     pipeline real. Sem este remendo a prova de colagem não roda — e trocá-la
     por leitura de código é exatamente o que a story proíbe. */
  if (typeof globalThis.ClipboardEvent !== "function") {
    const Clipboard = class ClipboardEvent extends w.Event {
      constructor(tipo, init = {}) {
        super(tipo, init);
        this.clipboardData = init.clipboardData ?? null;
      }
    };
    expor("ClipboardEvent", Clipboard);
    w.ClipboardEvent = Clipboard;
  }
  return w;
}

/**
 * Cria (e limpa) a pasta de trabalho da compilação.
 *
 * A pasta fica DENTRO do projeto, sob `node_modules/.cache`, e não no
 * temporário do sistema: o pacote compilado importa `react` e as bibliotecas
 * como externos, e a resolução do Node procura `node_modules` subindo a partir
 * do arquivo. Fora do projeto, não há de onde resolver.
 *
 * A varredura do que sobrou acontece na ENTRADA, e não na saída: no Windows a
 * pasta que acabou de ser importada fica presa pelo processo que a carregou, e
 * a remoção no fim da execução falha em silêncio — uma execução por dia
 * deixaria um rastro que ninguém percebe até o disco reclamar.
 */
export function criarPastaDeCompilacao(prefixo) {
  const cache = path.join(raizDoProjeto, "node_modules", ".cache");
  mkdirSync(cache, { recursive: true });
  for (const entrada of readdirSync(cache, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith(prefixo)) continue;
    try {
      rmSync(path.join(cache, entrada.name), { recursive: true, force: true });
    } catch {
      /* presa por outro processo: a próxima execução tenta de novo */
    }
  }
  return mkdtempSync(path.join(cache, prefixo));
}

/** O caminho de um módulo do projeto, na forma que um `import` aceita. */
export function caminhoDeModulo(relativo) {
  return JSON.stringify(
    path.join(raizDoProjeto, relativo).split(path.sep).join("/"),
  );
}

/** O caminho de um arquivo absoluto, na forma que um `import` aceita. */
export function comoModulo(arquivo) {
  return JSON.stringify(arquivo.split(path.sep).join("/"));
}

/**
 * Compila componentes React para um pacote que o Node consegue importar.
 *
 * **Roda ANTES de o DOM falso subir, e essa ordem é deliberada.** O `build` do
 * Vite é um processo de construção: ele decide plugins, ambiente e resolução
 * olhando para o processo em que roda. Com `window` e `document` de mentira
 * instalados em `globalThis`, qualquer coisa na cadeia que pergunte "estou num
 * navegador?" recebe sim, e o pacote compilado deixa de ser o que a aplicação
 * usa. Compilar primeiro, poluir depois.
 *
 * O JSX não é importável pelo Node, então ele é compilado pelo MESMO
 * empacotador que a aplicação usa — não por um transformador paralelo que
 * poderia divergir do que vai para produção.
 *
 * `alias` chega pronto do chamador: a ordem importa, e o apelido específico
 * precisa vir ANTES do genérico `"@"`, senão o dublê nunca entra.
 */
export async function compilarParaNode({ pasta, fonte, alias }) {
  const { build } = await import("vite");
  const plugin = (await import("@vitejs/plugin-react")).default;

  const entrada = path.join(pasta, "entrada.jsx");
  writeFileSync(entrada, fonte);

  /* O `build` do Vite escreve `NODE_ENV=production` no processo INTEIRO, e
     não desfaz. Isso importa aqui e é sutil: `react` pode já ter sido carregado
     na variante de desenvolvimento e `react-dom/client` ainda não. Sem
     restaurar, cada um viria de uma variante diferente e o React estouraria com
     `dispatcher.getOwner is not a function` — medido, não suposto. */
  const ambienteAntes = process.env.NODE_ENV;
  try {
    await build({
      configFile: false,
      logLevel: "silent",
      plugins: [plugin()],
      resolve: {
        alias: { ...alias, "@": path.join(raizDoProjeto, "src") },
      },
      build: {
        ssr: entrada,
        outDir: path.join(pasta, "saida"),
        emptyOutDir: true,
        minify: false,
        rollupOptions: { output: { format: "es", entryFileNames: "entrada.js" } },
      },
    });
  } finally {
    if (ambienteAntes === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ambienteAntes;
  }

  return { pasta, arquivo: path.join(pasta, "saida", "entrada.js") };
}
