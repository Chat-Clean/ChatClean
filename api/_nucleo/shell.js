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
