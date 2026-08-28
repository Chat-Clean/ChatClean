/**
 * O DOMÍNIO CANÔNICO do site, para quem desenha metadado no Painel.
 *
 * ─── POR QUE NÃO É `window.location.origin` ────────────────────────────────
 *
 * A primeira versão desta seção lia a origem do navegador, com o argumento de
 * que o Painel é uma rota do próprio site. O argumento vale para produção e
 * falha em todo o resto:
 *
 *   **Implantação de prévia.** A origem é o host efêmero da prévia. A herança
 *   mostrada apontaria para `https://algo-abc123.vercel.app/…`, e a promessa da
 *   Prévia (Story 3.5) — "você confere aqui o que o WhatsApp vai receber" —
 *   passaria a ser falsa exatamente no ambiente criado para conferir coisas.
 *
 *   **Host `http` que não é local.** `raizDoSite` recusa, e com razão: um
 *   endereço `http://` de terceiro não é canônico. A seção inteira caía no
 *   defeito de montagem, e a frase mandava procurar "a variável de ambiente do
 *   domínio do site" — que, sem este módulo, não existia.
 *
 * O épico já decidiu isto por escrito: "Domínio Canônico por variável de
 * ambiente, nunca constante". Este módulo é essa variável.
 *
 * ─── E A ORIGEM CONTINUA VALENDO, COMO ÚLTIMO RECURSO ──────────────────────
 *
 * Sem a variável declarada, quem desenvolve em `http://localhost:5173` teria a
 * seção inteira substituída por uma caixa vermelha de defeito de montagem — uma
 * falha que não é falha, na máquina de todo mundo, todo dia. A origem entra
 * nesse caso e **só** nesse: ela é aceita quando serve como domínio canônico,
 * que é o que `raizDoSite` julga. A variável, quando existe, ganha sempre.
 */

import { raizDoSite } from "@/domain/blog/compartilhamento";

/**
 * O que foi engolido ao ler o ambiente — nunca perdido.
 *
 * Mesmo desenho de `QUEDAS_DE_AMBIENTE` em `data/supabase/clientes.js`, e pela
 * mesma razão escrita lá: um `catch` mudo esconderia qualquer outro defeito de
 * leitura atrás de "o ambiente está vazio".
 */
export const QUEDAS_AO_LER_O_DOMINIO = [];

/** O nome da variável, declarado uma vez — a frase de defeito o cita. */
export const VARIAVEL_DO_DOMINIO = "VITE_DOMINIO_DO_SITE";

function doVite(leitor) {
  try {
    return leitor();
  } catch (excecao) {
    QUEDAS_AO_LER_O_DOMINIO.push({
      nome: String(excecao?.name ?? "Error"),
      mensagem: String(excecao?.message ?? excecao),
    });
    return undefined;
  }
}

/** Serve como Domínio Canônico? Quem julga é o domínio, e só ele. */
export function serveComoDominio(valor) {
  try {
    raizDoSite(valor);
    return true;
  } catch {
    return false;
  }
}

/**
 * O Domínio Canônico, ou `""` quando não há nenhum utilizável.
 *
 * Os dois parâmetros existem para a verificação poder EXECUTAR esta função com
 * cada combinação em vez de ler o código dela — ambiente com e sem a variável,
 * origem de produção, de prévia, local e `http` de terceiro. Em uso real
 * nenhum dos dois é passado.
 */
export function dominioDoSite({ declarado, origem } = {}) {
  /* O ACESSO É LITERAL, e isso não é estilo: o Vite substitui
     `import.meta.env.VITE_X` ESTATICAMENTE, procurando o texto exato no
     código-fonte. Um acesso por chave calculada — `import.meta.env[nome]` —
     não é alcançado pela substituição, e no navegador devolveria `undefined`
     mesmo com a variável declarada na plataforma: a herança mostrada cairia na
     origem em produção, que é exatamente o defeito que este módulo existe para
     consertar. `data/supabase/clientes.js` registra a mesma armadilha.

     Fora do navegador `import.meta.env` não existe e o acesso LANÇA — daí o
     leitor, e daí `QUEDAS_AO_LER_O_DOMINIO`, que guarda o motivo em vez de
     engoli-lo. */
  const daVariavel = String(
    declarado ??
      doVite(() => import.meta.env.VITE_DOMINIO_DO_SITE) ??
      globalThis.process?.env?.[VARIAVEL_DO_DOMINIO] ??
      "",
  ).trim();
  /* A VARIÁVEL GANHA SEMPRE, inclusive numa implantação de prévia — é ela que
     faz a herança mostrada ser a que produção emite. */
  if (daVariavel !== "" && serveComoDominio(daVariavel)) return daVariavel;

  const daOrigem = String(
    origem ?? (typeof window === "undefined" ? "" : (window.location?.origin ?? "")),
  ).trim();
  return serveComoDominio(daOrigem) ? daOrigem : "";
}
