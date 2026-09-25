/**
 * O cliente da escrita de Carreiras: o único jeito de o Painel mexer numa
 * Vaga ou numa Classificação (Story 5.3).
 *
 * **Não escreve no banco.** A RLS nega escrita a `anon` e a `authenticated`
 * em `vagas`, `departamentos`, `tipos_de_vaga` e `niveis`, de propósito. O que
 * este módulo faz é falar com a função de servidor `POST /api/carreiras`, que
 * tem a chave de serviço, confere o token, valida pelo domínio e grava.
 *
 * Cinco operações e UMA porta, nomeadas pelo vocabulário fechado de
 * `domain/carreiras/operacoes.js` (o mesmo que o servidor usa para decidir).
 * A operação viaja no CORPO, declarada DEPOIS dos campos, para um corpo
 * trazido de outro lugar nunca escolher a operação no lugar de quem chamou.
 *
 * Não importa `data/blog/escrita.js`: aquele cliente fala de post. Reusa do
 * Blog só o que é neutro, de `comum.js` (o token do Painel e o formato de
 * identificador) e de `resultado.js` (o contrato de resultado). Toda função
 * devolve `{ ok: true, dados }` ou `{ ok: false, erro }` e **nunca lança**.
 *
 * `buscar` e `obterToken` são injetáveis, com o comportamento real como
 * padrão, para a verificação observar o pedido que sairia para a rede.
 */

import {
  OPERACAO_EXCLUIR_CLASSIFICACAO,
  OPERACAO_EXCLUIR_VAGA,
  OPERACAO_MUDAR_ESTADO_DA_VAGA,
  OPERACAO_SALVAR_CLASSIFICACAO,
  OPERACAO_SALVAR_VAGA,
} from "../../domain/carreiras/operacoes.js";
import { ehUuid, tokenDoPainelOuFalha } from "../blog/comum.js";
import {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
  MENSAGENS_DE_LEITURA,
  ehTipoDeErro,
  falha,
  sucesso,
} from "../blog/resultado.js";

/**
 * Os dois tipos que uma ESCRITA tem e uma leitura não, com a MESMA grafia do
 * servidor (`api/_nucleo/salvarPost.js`). A verificação compara a lista
 * inteira com a do servidor.
 */
export const ERRO_DADOS_INVALIDOS = "dados_invalidos";
export const ERRO_CONFLITO = "conflito";

/** O vocabulário completo que uma escrita de Carreiras pode devolver. */
export const TIPOS_DE_ERRO_DA_ESCRITA_DE_CARREIRAS = Object.freeze([
  ERRO_REDE,
  ERRO_PERMISSAO,
  ERRO_NAO_ENCONTRADO,
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_DADOS_INVALIDOS,
  ERRO_CONFLITO,
]);

/** A rota da função de servidor. Uma só, declarada uma vez. */
export const ROTA_DA_ESCRITA_DE_CARREIRAS = "/api/carreiras";

/** Prazo do navegador. Maior que o do servidor, para não cortá-lo. */
export const PRAZO_DA_ESCRITA_DE_CARREIRAS_MS = 20000;

/* ─── As frases, uma por operação ────────────────────────────────────────── */

/**
 * O que cada operação faz, em palavras, para os ramos em que o servidor não
 * manda frase (5xx, 401 sem corpo, proxy, rota ausente). As chaves são as do
 * vocabulário fechado, e a verificação cobra que sejam exatamente elas.
 */
const VERBOS_DA_OPERACAO = Object.freeze({
  [OPERACAO_SALVAR_VAGA]: Object.freeze({
    fazer: "salvar a vaga",
    tentar: "tente salvar de novo",
    conflito: "Já existe uma vaga com este endereço. Escolha outro antes de salvar.",
    ausente: "A vaga que você está editando já não está no Painel. Volte à lista de vagas para ver o que existe agora.",
  }),
  [OPERACAO_MUDAR_ESTADO_DA_VAGA]: Object.freeze({
    fazer: "mudar o estado da vaga",
    tentar: "tente de novo",
    conflito: "A vaga mudou de estado enquanto você mexia nela. Recarregue o Painel para ver como ela está.",
    ausente: "Esta vaga já não está no Painel, então não dá para mudar o estado dela.",
  }),
  [OPERACAO_EXCLUIR_VAGA]: Object.freeze({
    fazer: "excluir a vaga",
    tentar: "tente excluir de novo",
    conflito: "Alguma coisa ainda depende desta vaga. Recarregue o Painel e tente excluir de novo.",
    ausente: "Esta vaga já não está no Painel, alguém pode tê-la excluído antes.",
  }),
  [OPERACAO_SALVAR_CLASSIFICACAO]: Object.freeze({
    fazer: "salvar a classificação",
    tentar: "tente salvar de novo",
    conflito: "Já existe uma classificação com este nome na lista. Escolha outro nome antes de salvar.",
    ausente: "A classificação que você está editando já não está no Painel. Recarregue a lista para ver o que existe agora.",
  }),
  [OPERACAO_EXCLUIR_CLASSIFICACAO]: Object.freeze({
    fazer: "excluir a classificação",
    tentar: "tente excluir de novo",
    conflito: "Há vagas usando esta classificação. Troque a classificação dessas vagas antes de excluí-la.",
    ausente: "Esta classificação já não está no Painel, alguém pode tê-la excluído antes.",
  }),
});

/** As operações que têm frase, para a verificação comparar com o vocabulário. */
export const OPERACOES_COM_FRASE = Object.freeze(Object.keys(VERBOS_DA_OPERACAO));

/**
 * A frase de uma falha quando o servidor não mandou a dele. Exportada para a
 * verificação executá-la em cada combinação de operação e tipo. Operação
 * desconhecida cai na de salvar a vaga, e não numa frase vazia.
 */
export function fraseDaEscritaDeCarreiras(operacao, tipo) {
  const verbo = VERBOS_DA_OPERACAO[operacao] ?? VERBOS_DA_OPERACAO[OPERACAO_SALVAR_VAGA];
  if (tipo === ERRO_PERMISSAO) {
    return `Sua sessão não autoriza ${verbo.fazer}. Entre no Painel de novo e ${verbo.tentar}.`;
  }
  if (tipo === ERRO_REDE) {
    return `Não conseguimos falar com o servidor para ${verbo.fazer}. Confira a conexão e ${verbo.tentar}.`;
  }
  if (tipo === ERRO_NAO_ENCONTRADO) return verbo.ausente;
  if (tipo === ERRO_CONFLITO) return verbo.conflito;
  if (tipo === ERRO_DADOS_INVALIDOS) {
    return `Não conseguimos ${verbo.fazer} com o que foi enviado. Confira os campos e ${verbo.tentar}.`;
  }
  if (tipo === ERRO_CONFIGURACAO) {
    return `A configuração do servidor está incompleta, então não dá para ${verbo.fazer}. Avise quem cuida do projeto.`;
  }
  return `Não deu para ${verbo.fazer} agora. Espere um instante e ${verbo.tentar}.`;
}

/** As frases genéricas da LEITURA, que a escrita troca pela da operação. */
const FRASES_DA_LEITURA = new Set(Object.values(MENSAGENS_DE_LEITURA));

/** Tipo de erro para as respostas em que o servidor não disse o seu. */
function tipoDoStatus(status) {
  if (status === 401 || status === 403) return ERRO_PERMISSAO;
  if (status === 404) return ERRO_CONFIGURACAO;
  if (status === 409) return ERRO_CONFLITO;
  if (status === 422 || status === 400 || status === 405) return ERRO_DADOS_INVALIDOS;
  if (status === 408 || status === 429 || status >= 500) return ERRO_REDE;
  return ERRO_INESPERADO;
}

/**
 * Falha de escrita com os dois tipos extras aceitos. `falha` de
 * `resultado.js` só conhece os cinco da leitura; os dois novos são montados
 * aqui, com a MESMA forma, e com a frase da OPERAÇÃO quando nenhuma veio.
 */
function falhaDaEscrita(tipo, operacao, { rotulo = "", mensagem = "", detalhe = "", faltando = null, status = null, codigo = "" } = {}) {
  const conhecido = TIPOS_DE_ERRO_DA_ESCRITA_DE_CARREIRAS.includes(tipo) ? tipo : ERRO_INESPERADO;
  const frase =
    typeof mensagem === "string" && mensagem.trim() !== ""
      ? mensagem
      : fraseDaEscritaDeCarreiras(operacao, conhecido);
  if (ehTipoDeErro(conhecido)) {
    return falha(conhecido, { operacao: rotulo, mensagem: frase, detalhe, faltando, status, codigo });
  }
  const erro = {
    tipo: conhecido,
    mensagem: frase,
    operacao: rotulo,
    detalhe: String(detalhe ?? ""),
    codigo: String(codigo ?? ""),
    status: Number.isFinite(Number(status)) && status !== null ? Number(status) : null,
  };
  if (Array.isArray(faltando)) erro.faltando = Object.freeze([...faltando]);
  return Object.freeze({ ok: false, erro: Object.freeze(erro) });
}

/**
 * O PEDIDO À FUNÇÃO DE SERVIDOR, compartilhado pelas cinco operações. Nunca
 * lança. `detalhe` do servidor nunca chega aqui (o invólucro não o manda).
 */
async function pedirAoServidor({ operacao, corpo, buscar, obterToken = tokenDoPainelOuFalha }) {
  const rotulo = operacao;
  let token;
  try {
    token = await obterToken(rotulo);
  } catch (excecao) {
    return falhaDaEscrita(ERRO_PERMISSAO, operacao, {
      rotulo,
      detalhe: String(excecao?.message ?? excecao),
    });
  }
  if (!token?.ok) {
    const generica = FRASES_DA_LEITURA.has(token?.erro?.mensagem);
    return falhaDaEscrita(token?.erro?.tipo ?? ERRO_PERMISSAO, operacao, {
      rotulo,
      mensagem: generica ? "" : token?.erro?.mensagem,
      detalhe: token?.erro?.detalhe,
      codigo: token?.erro?.codigo,
      status: token?.erro?.status,
    });
  }

  let resposta;
  try {
    resposta = await buscar(ROTA_DA_ESCRITA_DE_CARREIRAS, {
      method: "POST",
      signal: AbortSignal.timeout(PRAZO_DA_ESCRITA_DE_CARREIRAS_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token.dados}`,
      },
      body: JSON.stringify({ ...corpo, operacao }),
    });
  } catch (excecao) {
    return falhaDaEscrita(ERRO_REDE, operacao, {
      rotulo,
      detalhe: String(excecao?.message ?? excecao),
      codigo: String(excecao?.name ?? ""),
    });
  }

  let texto = "";
  try {
    texto = await resposta.text();
  } catch {
    texto = "";
  }
  let corpoDaResposta = null;
  try {
    corpoDaResposta = texto === "" ? null : JSON.parse(texto);
  } catch {
    corpoDaResposta = null;
  }

  if (resposta.ok && corpoDaResposta?.ok === true) {
    return sucesso(corpoDaResposta.dados ?? null);
  }

  const doServidor = corpoDaResposta?.erro ?? null;
  const tipo = TIPOS_DE_ERRO_DA_ESCRITA_DE_CARREIRAS.includes(doServidor?.tipo)
    ? doServidor.tipo
    : tipoDoStatus(resposta.status);
  const rotaAusente = resposta.status === 404 && doServidor === null;

  return falhaDaEscrita(tipo, operacao, {
    rotulo,
    mensagem:
      typeof doServidor?.mensagem === "string" && doServidor.mensagem.trim() !== ""
        ? doServidor.mensagem
        : rotaAusente
          ? `A função de servidor (${ROTA_DA_ESCRITA_DE_CARREIRAS}) não respondeu neste ambiente. Em desenvolvimento ela é servida pelo Vite; se você acabou de mexer na configuração, reinicie o \`npm run dev\`.`
          : "",
    detalhe: `HTTP ${resposta.status} em ${ROTA_DA_ESCRITA_DE_CARREIRAS}`,
    faltando: Array.isArray(doServidor?.faltando) ? doServidor.faltando : null,
    status: resposta.status,
  });
}

/** A recusa local de um identificador torto: `dados_invalidos`, nunca ausência. */
function idTorto(operacao, mensagem, id) {
  return falhaDaEscrita(ERRO_DADOS_INVALIDOS, operacao, {
    rotulo: operacao,
    mensagem,
    detalhe: `id fora do formato de identificador: ${JSON.stringify(String(id).slice(0, 60))}`,
  });
}

/* ─── Vagas ──────────────────────────────────────────────────────────────── */

/**
 * Cria (sem `id`) ou edita (com `id`) uma Vaga. `campos` é o que o servidor
 * aceita: `titulo`, `slug`, `departamento_id`, `tipo_id`, `nivel_id`,
 * `modalidade`, `localizacao`, `resumo`, `descricao` e `link_de_candidatura`.
 * O resto é ignorado LÁ, e a resposta diz o quê (`ignorados`), junto do que a
 * Descrição perdeu na projeção (`descarte`).
 */
export async function salvarVaga(campos, { id = null, buscar = globalThis.fetch, obterToken } = {}) {
  const alvo = id === null || id === undefined || id === "" ? null : id;
  if (alvo !== null && !ehUuid(alvo)) {
    return idTorto(OPERACAO_SALVAR_VAGA, "Não reconhecemos qual vaga deve ser alterada.", id);
  }
  const corpo = { ...(campos ?? {}) };
  if (alvo !== null) corpo.id = String(alvo).trim();
  else delete corpo.id;
  return pedirAoServidor({ operacao: OPERACAO_SALVAR_VAGA, corpo, buscar, obterToken });
}

/**
 * Abre, encerra ou reabre uma Vaga. `acao` é a chave de uma ação da máquina
 * (`abrir`, `encerrar`, `reabrir`); quem decide se ela vale no Estado gravado
 * é o servidor.
 */
export async function mudarEstadoDaVaga(id, acao, { buscar = globalThis.fetch, obterToken } = {}) {
  if (!ehUuid(id)) {
    return idTorto(OPERACAO_MUDAR_ESTADO_DA_VAGA, "Não reconhecemos em qual vaga mudar o estado.", id);
  }
  if (typeof acao !== "string" || acao.trim() === "") {
    return falhaDaEscrita(ERRO_DADOS_INVALIDOS, OPERACAO_MUDAR_ESTADO_DA_VAGA, {
      rotulo: OPERACAO_MUDAR_ESTADO_DA_VAGA,
      mensagem: "O pedido não diz qual mudança de estado fazer na vaga.",
      detalhe: `acao ausente: ${JSON.stringify(String(acao).slice(0, 40))}`,
    });
  }
  return pedirAoServidor({
    operacao: OPERACAO_MUDAR_ESTADO_DA_VAGA,
    corpo: { id: String(id).trim(), acao: acao.trim() },
    buscar,
    obterToken,
  });
}

/** Exclui uma Vaga (só Rascunho e Encerrada; o servidor confere). */
export async function excluirVaga(id, { buscar = globalThis.fetch, obterToken } = {}) {
  if (!ehUuid(id)) {
    return idTorto(OPERACAO_EXCLUIR_VAGA, "Não reconhecemos qual vaga deve ser excluída.", id);
  }
  return pedirAoServidor({
    operacao: OPERACAO_EXCLUIR_VAGA,
    corpo: { id: String(id).trim() },
    buscar,
    obterToken,
  });
}

/* ─── Classificações ─────────────────────────────────────────────────────── */

/**
 * Cria ou edita um Departamento, um Tipo ou um Nível. `lista` é a chave do
 * domínio (`departamento`, `tipo`, `nivel`), e é o servidor que a confere
 * contra a lista fechada.
 */
export async function salvarClassificacao(lista, campos, { id = null, buscar = globalThis.fetch, obterToken } = {}) {
  const alvo = id === null || id === undefined || id === "" ? null : id;
  if (alvo !== null && !ehUuid(alvo)) {
    return idTorto(OPERACAO_SALVAR_CLASSIFICACAO, "Não reconhecemos qual classificação deve ser alterada.", id);
  }
  const corpo = { ...(campos ?? {}), lista };
  if (alvo !== null) corpo.id = String(alvo).trim();
  else delete corpo.id;
  return pedirAoServidor({ operacao: OPERACAO_SALVAR_CLASSIFICACAO, corpo, buscar, obterToken });
}

/** Exclui uma Classificação. Em uso volta como `conflito`, com o número. */
export async function excluirClassificacao(lista, id, { buscar = globalThis.fetch, obterToken } = {}) {
  if (!ehUuid(id)) {
    return idTorto(OPERACAO_EXCLUIR_CLASSIFICACAO, "Não reconhecemos qual classificação deve ser excluída.", id);
  }
  return pedirAoServidor({
    operacao: OPERACAO_EXCLUIR_CLASSIFICACAO,
    corpo: { lista, id: String(id).trim() },
    buscar,
    obterToken,
  });
}
