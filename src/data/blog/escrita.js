/**
 * O cliente da função de escrita — o único jeito de o Painel gravar um Post.
 *
 * **Não escreve no banco.** Nenhum módulo do navegador escreve: a RLS da Story
 * 2.1 nega escrita a `anon` e a `authenticated`, e isso é deliberado. O que este
 * arquivo faz é falar com a função de servidor da Story 2.5 (`/api/posts`), que
 * é quem tem a chave de serviço, confere o token, valida o documento e grava.
 *
 * Ele mora em `data/blog` porque é rede: a tela não monta requisição, não lê
 * cabeçalho e não traduz código HTTP. Ela chama uma função e recebe resultado ou
 * **erro tipado**, como em toda a camada.
 *
 * ─── O token vem da sessão, e é a única coisa que a tela empresta ───────────
 *
 * A identidade não viaja no corpo do pedido — o servidor a confere contra o
 * Supabase a partir do cabeçalho `Authorization`. Se ela viesse no corpo,
 * qualquer detentor de sessão assinaria um Post com o nome de outra pessoa.
 */

// O cliente vem de `comum.js`, o único lugar da camada que o obtém (AD-6).
// A asserção de fronteira cobra isso — e cobrou: a primeira versão importava
// `clienteAutenticado` direto daqui e a verificação da camada de dados falhou.
import { tokenDoPainelOuFalha } from "./comum.js";
import {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
  ehTipoDeErro,
  falha,
  sucesso,
} from "./resultado.js";

/**
 * Os dois tipos que uma ESCRITA tem e uma leitura não.
 *
 * Estão escritos aqui com a MESMA grafia de `api/_nucleo/salvarPost.js`, e as
 * duas listas são comparadas por igualdade pela ferramenta de verificação —
 * porque duas grafias de "conflito" seriam duas telas diferentes para a mesma
 * coisa, e a divergência só apareceria no dia em que alguém tentasse reusar um
 * endereço.
 *
 * Eles não estão em `resultado.js` porque aquele módulo é o vocabulário da
 * LEITURA: acrescentá-los lá faria toda consulta passar a declarar modos de
 * falha que ela não tem.
 */
export const ERRO_DADOS_INVALIDOS = "dados_invalidos";
export const ERRO_CONFLITO = "conflito";

/** O vocabulário completo que uma gravação pode devolver. */
export const TIPOS_DE_ERRO_DE_ESCRITA = Object.freeze([
  ERRO_REDE,
  ERRO_PERMISSAO,
  ERRO_NAO_ENCONTRADO,
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_DADOS_INVALIDOS,
  ERRO_CONFLITO,
]);

/** A rota da função de servidor. Uma só, e declarada uma vez. */
export const ROTA_DE_ESCRITA = "/api/posts";

/** Prazo do lado do navegador. Maior que o do servidor, para não cortá-lo. */
export const PRAZO_DE_ESCRITA_MS = 20000;

/**
 * Tipo de erro para as respostas em que o servidor não conseguiu dizer o seu.
 *
 * O caso que importa é o 404 do HTML: em desenvolvimento (`vite`) a rota
 * `/api/posts` não existe, e o servidor devolve a página do aplicativo com
 * status 200 ou 404. Sem esta tradução, a tela diria "post não encontrado" para
 * um ambiente que simplesmente não tem a função publicada.
 */
function tipoDoStatus(status) {
  if (status === 401 || status === 403) return ERRO_PERMISSAO;
  if (status === 404) return ERRO_CONFIGURACAO;
  if (status === 409) return ERRO_CONFLITO;
  if (status === 422 || status === 400 || status === 405) return ERRO_DADOS_INVALIDOS;
  if (status === 408 || status === 429 || status >= 500) return ERRO_REDE;
  return ERRO_INESPERADO;
}

/**
 * Falha de escrita, com os dois tipos extras aceitos.
 *
 * `falha` de `resultado.js` só conhece os cinco da leitura e transformaria
 * `conflito` em `inesperado` — a tela perderia justamente a informação que
 * distingue "escolha outro endereço" de "tente de novo". Por isso o objeto é
 * montado aqui quando o tipo é um dos dois novos, com a MESMA forma.
 */
function falhaDeEscrita(tipo, { operacao = "", mensagem = "", detalhe = "", faltando = null, status = null, codigo = "" } = {}) {
  if (ehTipoDeErro(tipo)) {
    return falha(tipo, { operacao, mensagem, detalhe, faltando, status, codigo });
  }
  const conhecido = TIPOS_DE_ERRO_DE_ESCRITA.includes(tipo) ? tipo : ERRO_INESPERADO;
  const erro = {
    tipo: conhecido,
    mensagem:
      typeof mensagem === "string" && mensagem.trim() !== ""
        ? mensagem
        : conhecido === ERRO_CONFLITO
          ? "Já existe um post com este endereço. Escolha outro antes de salvar."
          : "Não conseguimos salvar com o que foi enviado. Confira os campos e tente de novo.",
    operacao,
    detalhe: String(detalhe ?? ""),
    codigo: String(codigo ?? ""),
    status: Number.isFinite(Number(status)) && status !== null ? Number(status) : null,
  };
  if (Array.isArray(faltando)) erro.faltando = Object.freeze([...faltando]);
  return Object.freeze({ ok: false, erro: Object.freeze(erro) });
}


/**
 * Grava um Post pela função de servidor.
 *
 * `corpo` é o que a Story 2.5 aceita: `id` (ausente para criar), `slug`,
 * `titulo`, `resumo`, `conteudo`, `categoria_id`, `tags`, `publicado_em` e
 * `tempo_leitura`. O que vier fora da lista é ignorado **pelo servidor**, e a
 * resposta diz quais foram — a tela pode avisar em vez de deixar sumir.
 *
 * Devolve `{ ok: true, dados }` ou `{ ok: false, erro }`. **Nunca lança.**
 */
export async function salvarPost(corpo, { buscar = globalThis.fetch } = {}) {
  const operacao = "salvarPost";

  const token = await tokenDoPainelOuFalha(operacao);
  if (!token.ok) return token;

  let resposta;
  try {
    resposta = await buscar(ROTA_DE_ESCRITA, {
      method: "POST",
      signal: AbortSignal.timeout(PRAZO_DE_ESCRITA_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token.dados}`,
      },
      body: JSON.stringify(corpo),
    });
  } catch (excecao) {
    /* Rede fora, prazo estourado, pedido abortado: nada foi decidido pelo
       servidor, então o conteúdo continua onde está e a frase manda tentar de
       novo — que é o conselho certo, e o único que serve aqui. */
    return falha(ERRO_REDE, {
      operacao,
      detalhe: String(excecao?.message ?? excecao),
      codigo: String(excecao?.name ?? ""),
    });
  }

  const texto = await resposta.text().catch(() => "");
  let corpoDaResposta = null;
  try {
    corpoDaResposta = texto === "" ? null : JSON.parse(texto);
  } catch {
    corpoDaResposta = null;
  }

  if (resposta.ok && corpoDaResposta?.ok === true) {
    return sucesso(corpoDaResposta.dados ?? null);
  }

  /* O servidor já classificou: usar o tipo dele é o que mantém uma única
     tradução de erro no projeto. O status entra só quando ele não classificou —
     resposta que não é JSON, HTML de rota inexistente, proxy no caminho. */
  const doServidor = corpoDaResposta?.erro ?? null;
  const tipo = TIPOS_DE_ERRO_DE_ESCRITA.includes(doServidor?.tipo)
    ? doServidor.tipo
    : tipoDoStatus(resposta.status);

  return falhaDeEscrita(tipo, {
    operacao,
    mensagem: typeof doServidor?.mensagem === "string" ? doServidor.mensagem : "",
    // `detalhe` do servidor nunca chega ao cliente — é decisão do invólucro, e
    // o que se registra aqui é o que dá para saber daqui.
    detalhe: `HTTP ${resposta.status} em ${ROTA_DE_ESCRITA}`,
    faltando: Array.isArray(doServidor?.faltando) ? doServidor.faltando : null,
    status: resposta.status,
  });
}
