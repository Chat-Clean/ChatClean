/**
 * O shell que as rotas de página servem — e o que acontece quando ele falta.
 *
 * ─── FALHAR ALTO, E NUNCA CAIR NO DO REPOSITÓRIO ──────────────────────────
 *
 * O recurso óbvio, quando o passo de build não rodou, seria ler o
 * `index.html` do repositório. Ele é o pior dos dois caminhos: a resposta sai
 * com sucesso, o navegador pede `/src/main.jsx`, recebe o apanha-tudo de volta,
 * e o visitante fica com uma tela em branco — sem nada nos registros dizendo
 * por quê. Uma resposta que declara o defeito é ruim para uma pessoa e ótima
 * para quem precisa consertar; a outra é ruim para as duas.
 *
 * Por isso este módulo não tem recurso. Ele responde `{ok:false, defeito}`, e
 * quem chama transforma isso em erro de servidor com a frase — nunca em página.
 */

/** A frase, declarada: a verificação a compara, e ela não pode ser montada. */
export const DEFEITO_SEM_SHELL =
  "O shell do build não foi embutido: `npm run build` precisa rodar " +
  "`scripts/gerar-shell.mjs` depois do `vite build`. " +
  "Servir o `index.html` do repositório entregaria uma página que não carrega.";

/**
 * Lê o shell embutido.
 *
 * O módulo embutido é GERADO e não versionado, então a importação pode falhar —
 * e falhar aqui é o caminho normal de um repositório recém-clonado que ainda não
 * construiu. A importação é dinâmica justamente para que essa ausência vire
 * resultado tipado em vez de derrubar o carregamento da função inteira.
 */
export async function lerShell({ importar = () => import("./shell.gerado.js") } = {}) {
  try {
    const modulo = await importar();
    const html = modulo?.SHELL;
    if (typeof html !== "string" || html === "") {
      return { ok: false, defeito: DEFEITO_SEM_SHELL };
    }
    return {
      ok: true,
      html,
      ativos: Array.isArray(modulo.ATIVOS_DO_SHELL) ? modulo.ATIVOS_DO_SHELL : [],
    };
  } catch {
    return { ok: false, defeito: DEFEITO_SEM_SHELL };
  }
}

/* ─── A REGIÃO DE METADADOS (Story 4.3) ─────────────────────────────────── */

export const DEFEITO_SEM_MARCADORES =
  "O shell embutido não traz os marcadores da região de metadados " +
  "(`METADADOS-DA-PAGINA:INICIO` e `:FIM`), ou os traz repetidos. Servir o " +
  "shell intacto entregaria os metadados da HOME em todo Post, em silêncio — " +
  "e é justamente o defeito que a Story 4.3 conserta.";

/**
 * Troca a região de metadados do shell, inteira.
 *
 * ─── SUBSTITUIÇÃO TOTAL, E NÃO REMENDO ────────────────────────────────────
 *
 * O que está entre os marcadores sai FORA e o que chega entra no lugar. Não há
 * caminho aqui que edite etiqueta: procurar a etiqueta `og:title` para trocá-la
 * seria lista de proibição, e sobraria a da home ao lado da do Post no dia em
 * que o casamento não previsse uma aspa.
 *
 * ─── E FALTAR MARCADOR É DEFEITO, NÃO RECURSO ─────────────────────────────
 *
 * Devolver o shell intacto seria a página do Post anunciando a home, com
 * sucesso e sem rastro — o pior tipo de falha, e o projeto já tem nome para
 * ele: resposta que responde bem e entrega errado.
 */
export function trocarMetadados(html, regiao, { inicio, fim }) {
  if (typeof html !== "string") {
    return { ok: false, defeito: DEFEITO_SEM_MARCADORES };
  }

  const i = html.indexOf(inicio);
  if (i === -1) return { ok: false, defeito: DEFEITO_SEM_MARCADORES };

  /* UM SEGUNDO INÍCIO significa região ambígua: o corte pegaria só a primeira, e
     a segunda sobreviveria com o valor da home. Não é hipótese — é o que
     acontece quando alguém copia o bloco para "testar uma coisa". */
  if (html.indexOf(inicio, i + inicio.length) !== -1) {
    return { ok: false, defeito: DEFEITO_SEM_MARCADORES };
  }

  /* O FIM é procurado DEPOIS do início. Buscar no documento inteiro aceitaria
     um fim que viesse antes, e o corte sairia com comprimento negativo. */
  const j = html.indexOf(fim, i + inicio.length);
  if (j === -1) return { ok: false, defeito: DEFEITO_SEM_MARCADORES };

  /* Os dois marcadores são comentários, e o de fim precisa ser REPOSTO inteiro:
     sem ele, uma troca seguinte não encontraria onde parar. */
  const fechamento = html.indexOf("-->", j);
  if (fechamento === -1) return { ok: false, defeito: DEFEITO_SEM_MARCADORES };

  const antes = html.slice(0, i);
  const depois = html.slice(fechamento + 3);
  return { ok: true, html: `${antes}${inicio} -->\n${regiao}\n    ${fim} -->${depois}` };
}
