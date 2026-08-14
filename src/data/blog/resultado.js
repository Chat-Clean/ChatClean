/**
 * O contrato de retorno da camada de dados do blog.
 *
 * Toda função de `data/blog` devolve `{ ok: true, dados }` ou
 * `{ ok: false, erro }`. Nunca lança para quem chama, nunca devolve `null`
 * para significar falha, e nunca engole exceção em silêncio — as duas últimas
 * são a mesma exigência vista dos dois lados: **a exceção vira valor**.
 *
 * O erro é TIPADO porque a tela precisa decidir entre "tente de novo" e "isso
 * não existe". Sem tipo, toda falha vira a mesma mensagem inútil, e um
 * servidor fora do ar fica indistinguível de um slug errado — o mesmo defeito
 * que `mensagemDoErro` já resolve para a sessão do Painel, aqui aplicado à
 * leitura.
 *
 * Os cinco tipos, e o que cada um manda quem chama fazer:
 *
 *   `rede`          — não falamos com o servidor, ou ele não conseguiu
 *                     responder. Tentar de novo faz sentido.
 *   `permissao`     — a sessão não autoriza (ou não existe). Entrar de novo.
 *   `nao_encontrado`— a consulta chegou e não há nada. Tentar de novo não muda.
 *   `configuracao`  — falta ambiente. Ninguém que use a tela pode consertar.
 *   `inesperado`    — defeito. O detalhe existe para diagnosticar, não para
 *                     ser mostrado como está.
 *
 * ─── Por que são CINCO, e não os sete de `sessao.js` ────────────────────────
 *
 * `src/admin/shell/sessao.js` separa limite de taxa (429) e falha de servidor
 * (5xx) de rede fora. Aqui os três moram em `rede` de propósito: o critério de
 * aceite fixa exatamente cinco tipos, e os três pertencem à mesma família do
 * ponto de vista de QUEM LÊ — "o servidor não entregou, tente de novo". Quem
 * precisar da distinção fina não perde nada: `erro.status` e `erro.codigo`
 * viajam no erro, e é deles que uma mensagem mais específica pode nascer sem
 * inventar um sexto tipo. A divergência é deliberada e está registrada aqui
 * para não ser lida como esquecimento.
 *
 * Módulo puro: não importa React, não importa Supabase, não toca rede. É o
 * que permite exercitá-lo direto na ferramenta de verificação.
 */

export const ERRO_REDE = "rede";
export const ERRO_PERMISSAO = "permissao";
export const ERRO_NAO_ENCONTRADO = "nao_encontrado";
export const ERRO_CONFIGURACAO = "configuracao";
export const ERRO_INESPERADO = "inesperado";

/** Os cinco tipos, na ordem em que a matriz de I/O da story os nomeia. */
export const TIPOS_DE_ERRO = Object.freeze([
  ERRO_REDE,
  ERRO_PERMISSAO,
  ERRO_NAO_ENCONTRADO,
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
]);

/**
 * A frase padrão de cada tipo. Voz direta: diz o que houve e o que fazer.
 * Quem chama pode trocar a frase, mas nunca o tipo — é o tipo que decide o
 * comportamento da tela.
 */
const MENSAGENS = Object.freeze({
  [ERRO_REDE]:
    "Não conseguimos falar com o servidor. Verifique a conexão e tente de novo.",
  [ERRO_PERMISSAO]:
    "Esta leitura exige uma sessão válida. Entre no Painel e tente de novo.",
  [ERRO_NAO_ENCONTRADO]: "Não encontramos o que você procura.",
  [ERRO_CONFIGURACAO]: "A configuração do Supabase está incompleta.",
  [ERRO_INESPERADO]:
    "Algo saiu do previsto ao ler os dados. Tente de novo em instantes.",
});

export function ehTipoDeErro(valor) {
  return typeof valor === "string" && TIPOS_DE_ERRO.includes(valor);
}

/**
 * Descrição curta de um valor, para o detalhe de um erro de formato.
 * Exportada porque toda validação de forma da camada precisa dela — três
 * cópias da mesma frase divergiriam na primeira vez que uma fosse ajustada.
 */
export function descrever(valor) {
  if (valor === null) return "null";
  if (Array.isArray(valor)) return `lista de ${valor.length}`;
  return typeof valor;
}

/* ─── Prazo ──────────────────────────────────────────────────────────────── */

/**
 * Toda consulta tem prazo. Sem ele, uma conexão pendurada — o caso em que o
 * servidor aceita a conexão e nunca responde — deixa a tela em carregamento
 * para SEMPRE, sem erro, sem vazio e sem nada para a pessoa fazer. É o único
 * modo de falha que nenhum tipo de erro alcançaria, porque nenhum erro chega.
 */
export const PRAZO_PADRAO_MS = 15000;

export function sinalDePrazo(ms = PRAZO_PADRAO_MS) {
  const prazo = Number(ms);
  const efetivo = Number.isFinite(prazo) && prazo > 0 ? prazo : PRAZO_PADRAO_MS;
  try {
    return AbortSignal.timeout(efetivo);
  } catch {
    // Runtime sem `AbortSignal.timeout`: seguir sem prazo é pior que falhar,
    // mas falhar aqui derrubaria a leitura inteira. Sem sinal, sem prazo.
    return undefined;
  }
}

/* ─── Construtores ───────────────────────────────────────────────────────── */

/**
 * Sucesso. O invólucro é congelado; `dados` não é, porque quem lista precisa
 * poder ordenar e filtrar sem copiar tudo de novo.
 */
export function sucesso(dados) {
  return Object.freeze({ ok: true, dados });
}

/**
 * Falha tipada.
 *
 * Tipo fora da lista NÃO lança — vira `inesperado` com o valor recebido no
 * detalhe. Lançar aqui contradiria a promessa central do módulo em nome de
 * uma checagem que só um defeito interno dispararia; o detalhe preserva a
 * informação para quem for diagnosticar.
 *
 * `codigo` e `status` viajam junto quando existem: são o que permite a uma
 * tela distinguir 429 de 500 sem que a camada precise de um sexto tipo.
 */
export function falha(
  tipo,
  { operacao = "", detalhe = "", mensagem = "", faltando = null, codigo = "", status = null } = {},
) {
  const valido = ehTipoDeErro(tipo);
  const t = valido ? tipo : ERRO_INESPERADO;
  // Só uma string NÃO VAZIA substitui a frase padrão: `null`, `undefined` e
  // número viravam a palavra "null" na tela ao passar por `String()`.
  const propria =
    typeof mensagem === "string" && mensagem.trim() !== "" ? mensagem : null;
  const erro = {
    tipo: t,
    mensagem: propria ?? MENSAGENS[t],
    operacao: typeof operacao === "string" ? operacao : "",
    detalhe: valido
      ? typeof detalhe === "string"
        ? detalhe
        : String(detalhe ?? "")
      : `tipo de erro desconhecido (${JSON.stringify(tipo)}) — ${String(detalhe ?? "")}`,
    codigo: typeof codigo === "string" ? codigo : String(codigo ?? ""),
    status: Number.isFinite(Number(status)) && status !== null ? Number(status) : null,
  };
  if (Array.isArray(faltando)) erro.faltando = Object.freeze([...faltando]);
  return Object.freeze({ ok: false, erro: Object.freeze(erro) });
}

/** Atalho para o caso mais comum da camada pública. */
export function naoEncontrado({ operacao = "", detalhe = "", mensagem = "" } = {}) {
  return falha(ERRO_NAO_ENCONTRADO, { operacao, detalhe, mensagem });
}

/** `true` para qualquer valor que cumpra o contrato — usado nas verificações. */
export function ehResultado(valor) {
  if (valor === null || typeof valor !== "object") return false;
  if (valor.ok === true) return Object.hasOwn(valor, "dados");
  if (valor.ok === false) {
    const erro = valor.erro;
    return (
      erro !== null &&
      typeof erro === "object" &&
      ehTipoDeErro(erro.tipo) &&
      typeof erro.mensagem === "string" &&
      erro.mensagem !== ""
    );
  }
  return false;
}

/** `true` se o resultado falhou com exatamente este tipo. */
export function falhouCom(resultado, tipo) {
  return resultado?.ok === false && resultado.erro?.tipo === tipo;
}

/**
 * O PostgREST responde 416 (`PGRST103`) quando a faixa pedida começa depois do
 * fim do conjunto. Isso é uma página vazia, não defeito: quem pagina pedindo a
 * página seguinte de uma lista que acabou de encolher cairia numa tela de erro
 * onde deveria ver "nada mais por aqui".
 */
export function ehFaixaAlemDoFim(resultado) {
  if (resultado?.ok !== false) return false;
  return resultado.erro?.status === 416 || resultado.erro?.codigo === "PGRST103";
}

/* ─── O tradutor ─────────────────────────────────────────────────────────── */

/**
 * Falha de infraestrutura, em qualquer das formas que ela chega até aqui:
 * exceção de `fetch`, tempo limite abortado, o erro sintético que o
 * supabase-js devolve com `status: 0` quando a requisição nem saiu, e as
 * respostas em que o servidor existe mas não entregou — 408, 429 e 5xx.
 *
 * É deliberadamente o PRIMEIRO teste depois de configuração: sem isso, uma
 * resposta sem status cairia em `inesperado` e a tela ofereceria "recarregue a
 * página" onde deveria oferecer "tente de novo".
 */
function ehFalhaDeRede(bruto, status) {
  const n = Number(status);
  if (Number.isFinite(n) && (n === 0 || n === 408 || n === 429 || n >= 500)) {
    return true;
  }
  const nome = String(bruto?.name ?? "");
  if (
    /^(TypeError|AbortError|TimeoutError|FetchError|AuthRetryableFetchError)$/.test(
      nome,
    )
  ) {
    return true;
  }
  const texto = `${bruto?.message ?? ""} ${bruto?.details ?? ""} ${bruto?.code ?? ""}`;
  return /fetch\s*(failed|error)|failed to fetch|networkerror|network error|econnrefused|econnreset|enotfound|eai_again|etimedout|socket hang up|load failed|abort(ed|error)?|time[d\s-]*out|timeout|service unavailable|bad gateway/i.test(
    texto,
  );
}

/**
 * Classifica um erro bruto — do PostgREST, do GoTrue ou do runtime — num dos
 * cinco tipos.
 *
 * A ordem importa e é a razão de o tradutor existir num lugar só:
 *
 *   1. Configuração, porque ambiente ausente e chave inválida chegam
 *      disfarçados de 401 e seriam lidos como "faça login de novo" — conselho
 *      que ninguém consegue seguir.
 *   2. Rede, porque falha de transporte vem SEM status e cairia em defeito;
 *      429 e 5xx entram aqui pelo motivo registrado no cabeçalho do módulo.
 *   3. Permissão: 401/403, `42501` do Postgres e a família `PGRST3xx` do JWT.
 *   4. Não encontrado: só `PGRST116`, o "esperava uma linha e vieram zero" de
 *      `.single()`. **404 não entra aqui**: no PostgREST ele significa rota ou
 *      tabela inexistente, e traduzi-lo como "post não encontrado" esconderia
 *      um schema quebrado atrás de uma página de 404 perfeitamente calma.
 *      Ausência de linha é decidida pela camada, sobre a resposta vazia.
 *   5. O resto é defeito, e o detalhe carrega o suficiente para diagnosticar.
 */
export function classificarErro(bruto, status) {
  if (bruto?.name === "ConfiguracaoAusente") return ERRO_CONFIGURACAO;

  const mensagem = String(bruto?.message ?? "");
  const detalhes = String(bruto?.details ?? "");
  const codigo = String(bruto?.code ?? "");

  if (/invalid api key|no api key found|apikey/i.test(`${mensagem} ${bruto?.hint ?? ""}`)) {
    return ERRO_CONFIGURACAO;
  }

  if (ehFalhaDeRede(bruto, status)) return ERRO_REDE;

  if (status === 401 || status === 403) return ERRO_PERMISSAO;
  if (codigo === "42501" || /^PGRST3\d\d$/.test(codigo)) return ERRO_PERMISSAO;
  if (/permission denied|row-level security|violates row-level|jwt/i.test(`${mensagem} ${detalhes}`)) {
    return ERRO_PERMISSAO;
  }

  if (codigo === "PGRST116") return ERRO_NAO_ENCONTRADO;

  return ERRO_INESPERADO;
}

/** Detalhe legível de um erro bruto, sem despejar o objeto inteiro na tela. */
function detalharErro(bruto, status) {
  const partes = [];
  if (status !== undefined && status !== null) partes.push(`HTTP ${status}`);
  if (bruto?.code) partes.push(String(bruto.code));
  if (bruto?.message) partes.push(String(bruto.message));
  else if (bruto) partes.push(String(bruto));
  if (bruto?.details) partes.push(String(bruto.details));
  return partes.join(" | ").slice(0, 500);
}

/**
 * Uma exceção que subiu de qualquer lugar, convertida em falha tipada.
 *
 * O `status` da própria exceção é repassado ao classificador: `AuthError` e
 * `StorageError` do supabase-js carregam status, e ignorá-lo faria um 401
 * lançado cair em `inesperado` — exatamente a confusão entre "defeito" e
 * "entre de novo" que o módulo existe para evitar.
 */
export function deExcecao(excecao, operacao = "") {
  const status = Number.isFinite(Number(excecao?.status)) ? Number(excecao.status) : undefined;
  const tipo = classificarErro(excecao, status);
  return falha(tipo, {
    operacao,
    detalhe: detalharErro(excecao, status),
    codigo: excecao?.code ?? excecao?.name ?? "",
    status: status ?? null,
    // `ConfiguracaoAusente` já explica em português qual variável falta; é a
    // única mensagem bruta que serve como está para quem vê a tela.
    mensagem: tipo === ERRO_CONFIGURACAO ? String(excecao?.message ?? "") : "",
    faltando: tipo === ERRO_CONFIGURACAO ? (excecao?.faltando ?? null) : null,
  });
}

/** A resposta `{ error, status }` do supabase-js, convertida em falha tipada. */
export function daRespostaDoSupabase(resposta, operacao = "") {
  const bruto = resposta?.error ?? null;
  const status = resposta?.status;
  return falha(classificarErro(bruto, status), {
    operacao,
    detalhe: detalharErro(bruto, status),
    codigo: bruto?.code ?? "",
    status: status ?? null,
  });
}

/* ─── O invólucro que impede a exceção de escapar ────────────────────────── */

/**
 * Executa uma consulta do supabase-js e devolve `sucesso(data)` ou falha
 * tipada. É por AQUI que toda leitura da camada passa — é o ponto único em que
 * "nenhuma função lança" deixa de ser disciplina de quem escreve e vira
 * propriedade do código.
 */
export async function consultar(operacao, executar) {
  try {
    const resposta = await executar();
    if (resposta && resposta.error) return daRespostaDoSupabase(resposta, operacao);
    if (resposta === null || typeof resposta !== "object" || !("data" in resposta)) {
      return falha(ERRO_INESPERADO, {
        operacao,
        detalhe: `a resposta não tem o campo \`data\` — veio ${descrever(resposta)}`,
      });
    }
    return sucesso(resposta.data);
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
}

/* ─── Forma da resposta ──────────────────────────────────────────────────── */

/**
 * Roda um validador de forma sem deixar exceção dele escapar. Um validador
 * que lança é defeito do mesmo jeito — mas defeito que vira valor, como todo
 * o resto da camada.
 */
function avaliar(validador, valor) {
  try {
    return validador(valor) ?? null;
  } catch (excecao) {
    return `o validador de formato lançou: ${String(excecao?.message ?? excecao)}`;
  }
}

/**
 * Exige que `dados` seja uma lista cujos itens passem por `validarItem`.
 *
 * Corpo fora do formato previsto vira erro de DEFEITO, não `undefined`
 * subindo até a tela — é a última linha da matriz de I/O, e a razão de a
 * validação viver aqui e não em cada função.
 *
 * `validarItem` devolve `null` quando o item está bem, ou uma frase curta
 * dizendo o que está errado.
 */
export function exigirLista(dados, { operacao = "", validarItem = null } = {}) {
  if (!Array.isArray(dados)) {
    return falha(ERRO_INESPERADO, {
      operacao,
      detalhe: `esperava uma lista e veio ${descrever(dados)}`,
    });
  }
  if (typeof validarItem === "function") {
    for (let i = 0; i < dados.length; i += 1) {
      const problema = avaliar(validarItem, dados[i]);
      if (problema) {
        return falha(ERRO_INESPERADO, {
          operacao,
          detalhe: `item ${i} fora do formato previsto: ${problema}`,
        });
      }
    }
  }
  return sucesso(dados);
}

/** Como `exigirLista`, para um único registro. */
export function exigirRegistro(dados, { operacao = "", validar = null } = {}) {
  if (dados === null || typeof dados !== "object" || Array.isArray(dados)) {
    return falha(ERRO_INESPERADO, {
      operacao,
      detalhe: `esperava um registro e veio ${descrever(dados)}`,
    });
  }
  if (typeof validar === "function") {
    const problema = avaliar(validar, dados);
    if (problema) {
      return falha(ERRO_INESPERADO, {
        operacao,
        detalhe: `registro fora do formato previsto: ${problema}`,
      });
    }
  }
  return sucesso(dados);
}
