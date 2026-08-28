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

/**
 * Leitura de ambiente que funciona no navegador E fora dele.
 *
 * No navegador o valor vem de `import.meta.env.VITE_*`, que o Vite substitui
 * estaticamente no build — por isso o texto do acesso é preservado
 * literalmente, dentro de um leitor, em vez de reescrito com acesso dinâmico
 * que a substituição não alcançaria.
 *
 * Fora do navegador `import.meta.env` não existe e o acesso LANÇA. O `try`
 * cobre esse caso; a ferramenta de verificação da camada de dados precisa
 * importar estes clientes e EXECUTÁ-LOS de verdade — ler no código que o
 * cliente público tem `persistSession: false` não prova que ele não envia
 * sessão, prova só que ele não a guarda.
 *
 * O que for engolido fica REGISTRADO em `QUEDAS_DE_AMBIENTE`, e não perdido:
 * um `catch` mudo aqui esconderia qualquer outro defeito de leitura de
 * ambiente atrás de "o ambiente está vazio", e a ferramenta confere que o
 * único motivo observado é o esperado.
 */
export const QUEDAS_DE_AMBIENTE = [];

function doVite(leitor) {
  try {
    return leitor();
  } catch (excecao) {
    QUEDAS_DE_AMBIENTE.push({
      nome: String(excecao?.name ?? "Error"),
      mensagem: String(excecao?.message ?? excecao),
    });
    return undefined;
  }
}

const AMBIENTE_FORA_DO_NAVEGADOR = globalThis.process?.env ?? {};

function lerAmbiente(nome, valorDoVite) {
  const bruto =
    typeof valorDoVite === "string" && valorDoVite !== ""
      ? valorDoVite
      : AMBIENTE_FORA_DO_NAVEGADOR[nome];
  return String(bruto ?? "").trim();
}

const URL_SUPABASE = lerAmbiente(
  "VITE_SUPABASE_URL",
  doVite(() => import.meta.env.VITE_SUPABASE_URL),
);
const CHAVE_PUBLICAVEL = lerAmbiente(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  doVite(() => import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
);

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

/**
 * A URL do projeto, ou `""` quando o ambiente não a declara.
 *
 * **Não é segredo**: ela já viaja no bundle desde sempre, é o endereço para
 * onde toda consulta do navegador vai, e é o prefixo de toda capa pública. O
 * que este módulo guarda de sensível é a chave, e a chave continua sem porta de
 * saída — a asserção de bundle limpo de `verificar:acesso` cobra isso.
 *
 * Existe porque a gaveta precisa decidir se um endereço gravado é uma capa
 * NOSSA para saber em que modo o campo abre, e a única alternativa era decidir
 * pela FORMA do endereço — que classifica a capa de outro projeto Supabase como
 * nossa e esconde, num campo que ninguém opera, exatamente o valor que a pessoa
 * foi editar.
 *
 * `""` em vez de lançar: quem pergunta está escolhendo rótulo de campo, e
 * derrubar o Editor por falta de `.env` trocaria um problema pequeno por um
 * grande. Quem precisa do ambiente de verdade continua chamando `exigirAmbiente`.
 */
export function urlDoProjeto() {
  return URL_SUPABASE;
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
