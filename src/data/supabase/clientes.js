/**
 * O ÚNICO lugar do front-end que instancia cliente Supabase (AD-6).
 *
 * Nenhum outro módulo chama `createClient` — a verificação de acesso afirma
 * isso lendo `src/` inteiro. A razão não é estética: dois clientes criados em
 * lugares diferentes acabam com configurações de sessão divergentes, e a
 * pergunta "quem está logado?" passa a ter duas respostas.
 *
 * São dois clientes, com propósitos opostos:
 *
 *   `clienteAutenticado()` — o do Painel. Guarda a sessão em `localStorage`
 *   (sobrevive a recarregamento E a fechar a aba) e renova o token
 *   silenciosamente. `detectSessionInUrl: false` porque não existe fluxo de
 *   link mágico nem de OAuth neste módulo: deixá-lo ligado faria o cliente
 *   vasculhar a URL de toda navegação atrás de fragmento de autenticação.
 *
 *   `clientePublico()` — leitura anônima, sem guardar sessão alguma. Existe
 *   para o site público do Épico 2; o Painel não o usa.
 *
 * A única chave do Supabase que chega ao navegador é a PUBLICÁVEL. Ela é
 * pública por natureza: quem protege os dados é a RLS do banco, não o segredo
 * da chave. Chave de serviço nunca entra em variável `VITE_*` — a verificação
 * varre o bundle publicado atrás dela.
 */

import { createClient } from "@supabase/supabase-js";

const URL_SUPABASE = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const CHAVE_PUBLICAVEL = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
).trim();

/**
 * Chave de armazenamento da sessão. Nomeada de propósito: o valor guardado
 * aqui é um token assinado pelo Supabase, verificado no servidor a cada
 * chamada. Escrevê-lo à mão não concede acesso — é exatamente a diferença
 * entre esta sessão e o portão falso que ela substitui.
 */
export const CHAVE_DE_SESSAO = "cc-painel-sessao";

/** Falta de ambiente é erro de configuração, não de credencial. */
export class ConfiguracaoAusente extends Error {
  constructor(faltando) {
    super(
      `Configuração do Supabase ausente: ${faltando.join(", ")}. ` +
        "Copie `.env.example` para `.env` e preencha os valores antes de abrir o Painel.",
    );
    this.name = "ConfiguracaoAusente";
    this.faltando = faltando;
  }
}

/** Nomes das variáveis que faltam, ou lista vazia se está tudo no lugar. */
export function variaveisAusentes() {
  const faltando = [];
  if (URL_SUPABASE === "") faltando.push("VITE_SUPABASE_URL");
  if (CHAVE_PUBLICAVEL === "") faltando.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  return faltando;
}

function exigirAmbiente() {
  const faltando = variaveisAusentes();
  if (faltando.length > 0) throw new ConfiguracaoAusente(faltando);
}

let autenticado = null;
let publico = null;

/**
 * Cliente do Painel: sessão persistida entre recarregamentos e fechamento de
 * aba, com renovação silenciosa.
 *
 * Instanciação preguiçosa e memoizada. Preguiçosa porque este módulo é
 * importado pela rota `/admin`, que faz parte do mesmo bundle do site público:
 * lançar no topo do módulo derrubaria o site inteiro por falta de `.env`.
 * Memoizada porque duas instâncias disputariam a mesma chave de armazenamento
 * e o mesmo temporizador de renovação.
 */
export function clienteAutenticado() {
  exigirAmbiente();
  if (autenticado === null) {
    autenticado = createClient(URL_SUPABASE, CHAVE_PUBLICAVEL, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: CHAVE_DE_SESSAO,
      },
    });
  }
  return autenticado;
}

/** Cliente de leitura anônima: não guarda sessão nem renova token. */
export function clientePublico() {
  exigirAmbiente();
  if (publico === null) {
    publico = createClient(URL_SUPABASE, CHAVE_PUBLICAVEL, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return publico;
}
