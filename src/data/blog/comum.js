/**
 * O que os três módulos de leitura compartilham: como se obtém cada cliente,
 * o que é um slug, e qual é o teto de uma listagem.
 *
 * Existe porque a alternativa é pior: três cópias da obtenção de cliente, com
 * assinaturas diferentes, fazem a regra "a escolha do cliente é do módulo"
 * virar três regras parecidas — e a primeira que divergir divergirá em
 * silêncio. A exigência de sessão do Painel, em especial, precisa ser
 * declarada UMA vez: é ela que impede o Painel de abrir com o subconjunto
 * anônimo achando que está completo.
 */

import { ehEstado } from "../../domain/blog/estados.js";
import { clienteAutenticado, clientePublico } from "../supabase/clientes.js";
import { deExcecao, ERRO_PERMISSAO, falha, sucesso } from "./resultado.js";

/* ─── Slug ───────────────────────────────────────────────────────────────── */

/**
 * O MESMO formato que a Story 2.1 fixou no banco
 * (`posts_slug_formato`): minúsculas, dígitos e hífen simples entre segmentos.
 *
 * Validar antes de consultar não é zelo: vírgula, ponto e parêntese são
 * METACARACTERES do filtro do PostgREST. Um slug com qualquer um deles produz
 * filtro malformado, 400, e o visitante vê defeito onde deveria ver "página
 * não encontrada" — e o 301 da Story 4.5 quebraria pelo mesmo caminho.
 */
export const FORMATO_DE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Comprimento máximo de `posts.slug` no banco. */
export const TAMANHO_MAXIMO_DO_SLUG = 200;

export function ehSlug(valor) {
  return (
    typeof valor === "string" &&
    valor.length > 0 &&
    valor.length <= TAMANHO_MAXIMO_DO_SLUG &&
    FORMATO_DE_SLUG.test(valor)
  );
}

/** Formato de identificador do banco: `uuid` gerado pelo Postgres. */
export const FORMATO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor) {
  return typeof valor === "string" && FORMATO_DE_UUID.test(valor.trim());
}

/* ─── Tamanho de página ──────────────────────────────────────────────────── */

/** Teto de segurança: listagem sem limite é varredura sem limite. */
export const LIMITE_PADRAO = 200;
export const LIMITE_MAXIMO = 500;

export function limiteValido(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return LIMITE_PADRAO;
  return Math.min(Math.floor(n), LIMITE_MAXIMO);
}

export function deslocamentoValido(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/* ─── O que se pede a uma busca ──────────────────────────────────────────── */

/**
 * Teto do termo de busca. Um campo de texto aceita colar um documento
 * inteiro, e mandar um megabyte por tecla digitada ao banco é o mesmo
 * problema da listagem sem limite: varredura sem limite.
 */
export const TAMANHO_MAXIMO_DO_TERMO = 200;

/**
 * O termo, pronto para viajar como ARGUMENTO da busca — nunca como pedaço de
 * um padrão nem de uma expressão de filtro.
 *
 * O que esta função faz é só aparar e truncar. **Ela não normaliza acento nem
 * caixa**, e isso é regra do épico, não esquecimento: normalizar no cliente
 * daria duas normalizações — a do navegador e a do banco — que divergiriam na
 * primeira diferença de versão de dicionário, e "estrategia" acharia
 * "Estratégia" numa máquina e não na outra. Quem normaliza é o Postgres, dos
 * dois lados da comparação, pela mesma função.
 *
 * Nenhum caractere é removido nem escapado: `%`, `_`, aspas e parêntese são
 * TEXTO, e continuam sendo, porque a comparação lá no banco é de contenção
 * literal e não de padrão. Escapar aqui faria a pessoa que busca "50%"
 * encontrar outra coisa.
 *
 * O corte é por ponto de código, e não por índice de unidade: cortar
 * "automação" ao meio de um par substituto viraria um caractere de reposição
 * no meio do termo.
 */
export function termoValido(valor) {
  if (typeof valor !== "string") return "";
  const aparado = valor.trim();
  if (aparado === "") return "";
  const pontos = [...aparado];
  return pontos.length <= TAMANHO_MAXIMO_DO_TERMO
    ? aparado
    : pontos.slice(0, TAMANHO_MAXIMO_DO_TERMO).join("");
}

/**
 * Separa os Estados pedidos entre os que existem e os que não existem.
 *
 * O vocabulário é fechado (`domain/blog/estados.js`), e valor fora dele é
 * **recusado, não ignorado**: descartar em silêncio faria o Painel mostrar uma
 * lista mais larga do que o filtro na tela diz, e ninguém saberia por quê.
 * Quem chama transforma `recusados` em erro tipado — e o banco recusa outra
 * vez, na conversão para o enum, porque o que vem da tela chega à consulta.
 *
 * Lista ausente ou vazia é "sem filtro", que é diferente de "nenhum Estado".
 * Repetição é colapsada: marcar duas vezes o mesmo Estado é a mesma pergunta.
 */
export function separarEstados(valor) {
  if (valor === null || valor === undefined) return { pedidos: [], recusados: [] };
  const bruta = Array.isArray(valor) ? valor : [valor];
  const pedidos = [];
  const recusados = [];
  for (const item of bruta) {
    const texto = typeof item === "string" ? item.trim() : "";
    if (ehEstado(texto)) {
      if (!pedidos.includes(texto)) pedidos.push(texto);
    } else {
      recusados.push(JSON.stringify(item));
    }
  }
  return { pedidos, recusados };
}

/* ─── Clientes ───────────────────────────────────────────────────────────── */

/**
 * O cliente de leitura anônima. Instanciar pode lançar `ConfiguracaoAusente`
 * quando falta `.env`; aqui a exceção já vira valor, para que nem o site
 * público caia por falta de ambiente — ele mostra erro de configuração, não
 * uma tela branca.
 */
export function clientePublicoOuFalha(operacao) {
  try {
    return sucesso(clientePublico());
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
}

/**
 * O cliente do Painel MAIS a garantia de que existe sessão.
 *
 * Sem sessão, o PostgREST não recusa: ele responde 200 com o subconjunto
 * ANÔNIMO, porque a política `to authenticated` simplesmente não se aplica.
 * O Painel abriria com metade dos posts e nada teria falhado — por isso a
 * ausência de sessão vira `permissao` aqui, explicitamente.
 *
 * `getSession()` não valida nada no servidor (é a lição da Story 1.4) e não é
 * usado para CONCEDER acesso: quem concede continua sendo a RLS. Ele só
 * escolhe qual erro tipado devolver. Sessão forjada passa por esta porta e
 * esbarra no servidor, que responde 401 — e 401 é `permissao` do mesmo jeito.
 */
export async function clienteDoPainelOuFalha(operacao) {
  let cliente;
  try {
    cliente = clienteAutenticado();
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
  try {
    const { data, error } = await cliente.auth.getSession();
    if (error) {
      return falha(ERRO_PERMISSAO, {
        operacao,
        detalhe: String(error?.message ?? error),
        status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
      });
    }
    if (!data?.session) {
      return falha(ERRO_PERMISSAO, {
        operacao,
        detalhe: "não há sessão ativa — a leitura do Painel exige uma",
      });
    }
    return sucesso(cliente);
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
}

/**
 * O token da sessão atual, ou uma falha tipada.
 *
 * Mora aqui, e não no módulo de escrita, porque este é o único lugar da camada
 * que obtém cliente — a asserção de fronteira cobra isso, e cobrou: a primeira
 * versão da escrita chamava `clienteAutenticado()` direto e a verificação
 * acusou. Obter cliente em dois lugares é como a pergunta "quem está logado?"
 * passa a ter duas respostas.
 *
 * O token existe porque a gravação NÃO usa o PostgREST: ela chama a função de
 * servidor, que confere o token por conta própria. Aqui ele é apenas
 * transportado — quem concede continua sendo o servidor.
 */
export async function tokenDoPainelOuFalha(operacao) {
  let cliente;
  try {
    cliente = clienteAutenticado();
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
  try {
    const { data, error } = await cliente.auth.getSession();
    if (error) {
      return falha(ERRO_PERMISSAO, {
        operacao,
        detalhe: String(error?.message ?? error),
        status: Number.isFinite(Number(error?.status)) ? Number(error.status) : null,
      });
    }
    const token = data?.session?.access_token ?? "";
    if (typeof token !== "string" || token === "") {
      return falha(ERRO_PERMISSAO, {
        operacao,
        detalhe: "não há sessão ativa — a gravação exige uma",
      });
    }
    return sucesso(token);
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
}
