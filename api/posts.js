/**
 * O invólucro de plataforma da escrita de Post.
 *
 * Fino de propósito: ele traduz requisição em argumento e resultado em resposta,
 * e nada mais. Toda a lógica — conferir o token, validar o documento, derivar o
 * HTML, resolver o Autor, gravar — mora em `api/_nucleo/salvarPost.js`, que é
 * exercitável localmente contra o projeto real. O que fica sem cobertura aqui é
 * exatamente o que se lê de uma vez.
 *
 * Na Vercel, cada arquivo em `api/` é uma função de runtime Node; arquivo e
 * diretório com `_` no começo não são rotas, e é por isso que o núcleo mora em
 * `api/_nucleo/`.
 *
 * ─── Três coisas que este arquivo decide, e só ele ──────────────────────────
 *
 * **1. QUAL operação está sendo pedida.** Desde a Story 2.12 esta porta faz
 * mais de uma coisa — salvar, excluir e alternar Destaque um Post; e, desde a
 * Story 2.14, salvar e excluir uma Categoria —, escolhidas por um campo do
 * corpo conferido contra o vocabulário fechado de `domain/blog/operacoes.js`.
 * A escolha mora aqui, e não no núcleo, porque é aqui que o corpo chega da
 * rede: é o ponto exato em que a lista de permissão precisa existir.
 *
 * **2. O que a resposta revela.** O erro tipado carrega `detalhe` para
 * diagnóstico — SQLSTATE, mensagem do PostgREST, nome de restrição. Isso vai
 * para o log do servidor e **não** para o corpo da resposta: quem chama recebe
 * `tipo` e `mensagem`, que é o suficiente para a tela agir.
 *
 * **2. O código HTTP.** O núcleo devolve tipo, não status: ele não conhece HTTP.
 * A tradução é uma tabela, aqui.
 */

import {
  OPERACAO_DESTACAR,
  OPERACAO_EXCLUIR,
  OPERACAO_EXCLUIR_CATEGORIA,
  OPERACAO_SALVAR,
  OPERACAO_SALVAR_CATEGORIA,
  OPERACOES,
  operacaoPedida,
} from "../src/domain/blog/operacoes.js";
import { acessoDoAmbiente, VARIAVEIS } from "./_nucleo/acesso.js";
import {
  excluirCategoria,
  salvarCategoria,
} from "./_nucleo/operacoesDaCategoria.js";
import { definirDestaque, excluirPost } from "./_nucleo/operacoesDoPost.js";
import {
  ERRO_CONFIGURACAO,
  ERRO_CONFLITO,
  ERRO_DADOS_INVALIDOS,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
  falha,
  salvarPost,
} from "./_nucleo/salvarPost.js";

/**
 * Tipo de erro → código HTTP.
 *
 * `rede` sai como 502 e não 500 porque a falha é do que está atrás desta função,
 * não dela; `dados_invalidos` sai como 422 porque o pedido está bem formado e o
 * conteúdo dele é que não serve.
 */
export const CODIGO_HTTP = Object.freeze({
  [ERRO_PERMISSAO]: 401,
  [ERRO_DADOS_INVALIDOS]: 422,
  [ERRO_NAO_ENCONTRADO]: 404,
  [ERRO_CONFLITO]: 409,
  [ERRO_CONFIGURACAO]: 500,
  [ERRO_REDE]: 502,
  [ERRO_INESPERADO]: 500,
});

/**
 * A TABELA DE DESPACHO — a lista de permissão das operações desta porta.
 *
 * ─── Por que uma operação a mais não é uma rota a mais ──────────────────────
 *
 * "Nenhum cliente escreve no banco, e o único caminho é a função em `api/`" é a
 * regra que sustenta a RLS inteira. Excluir e alternar Destaque poderiam ter
 * ganhado `api/posts-excluir.js` e `api/posts-destacar.js`, e cada uma delas
 * teria de repetir a conferência do token, a exigência de cadastro, a
 * classificação do erro e a ocultação do detalhe — quatro coisas que a segunda
 * cópia faz pior. Então a operação é **dado**, não endereço.
 *
 * ─── E por que a escolha é por lista de PERMISSÃO ───────────────────────────
 *
 * O corpo vem da rede. `EXECUTORES[operacao]` sozinho é uma armadilha
 * conhecida: `operacao: "constructor"` devolveria uma função que ninguém
 * declarou, e `"__proto__"` alcançaria o protótipo. Por isso a chave é
 * conferida contra a LISTA congelada do domínio ANTES do acesso, e o acesso é
 * conferido de novo com `Object.hasOwn`. Lista de proibição sempre tem uma
 * forma de evasão que ninguém pensou ainda.
 *
 * TODAS as funções têm a MESMA assinatura (`{ token, corpo, acesso }`) e o
 * mesmo contrato de retorno, e é isso que permite ao invólucro continuar sem
 * saber qual delas está chamando — inclusive quando a operação nova mexe em
 * outra tabela.
 */
export const EXECUTORES = Object.freeze({
  [OPERACAO_SALVAR]: salvarPost,
  [OPERACAO_EXCLUIR]: excluirPost,
  [OPERACAO_DESTACAR]: definirDestaque,
  /* Story 2.14: a Categoria virou dado, e mexer nela é escrever. Ela entra
     como OPERAÇÃO, e não como `api/categorias.js` — uma segunda rota teria de
     repetir a conferência do token, a exigência de cadastro, a classificação do
     erro e a ocultação do detalhe, quatro coisas que a segunda cópia faz pior. */
  [OPERACAO_SALVAR_CATEGORIA]: salvarCategoria,
  [OPERACAO_EXCLUIR_CATEGORIA]: excluirCategoria,
});

/**
 * O executor da operação, ou `null`.
 *
 * A dupla conferência é deliberada — ver o comentário de `EXECUTORES`. O
 * vocabulário vem do domínio, e é o mesmo que o cliente usa para nomear o que
 * pede: uma segunda lista aqui seria a divergência que só aparece no dia em que
 * uma operação nova é declarada de um lado só.
 */
export function executorDe(operacao) {
  if (!OPERACOES.includes(operacao)) return null;
  if (!Object.hasOwn(EXECUTORES, operacao)) return null;
  const executor = EXECUTORES[operacao];
  return typeof executor === "function" ? executor : null;
}

/**
 * A recusa de operação para quem NÃO apresentou credencial.
 *
 * Não enumera as operações e não repete o que veio. Quem tem sessão recebe a
 * frase completa de `operacaoPedida`, que nomeia as três — é informação útil
 * para quem está integrando o Painel, e inútil para quem está sondando.
 */
export const RECUSA_SEM_CREDENCIAL =
  "Não reconhecemos este pedido. Entre no Painel e tente de novo.";

/** O token do chamador, extraído do cabeçalho. Nunca do corpo do pedido. */
export function tokenDoCabecalho(cabecalhos = {}) {
  const bruto =
    cabecalhos.authorization ?? cabecalhos.Authorization ?? "";
  const m = /^Bearer[ \t]+(.+)$/i.exec(String(bruto).trim());
  return m ? m[1].trim() : "";
}

/**
 * O corpo, já como objeto.
 *
 * A Vercel entrega `req.body` desserializado quando o `Content-Type` é JSON,
 * mas não em todo runtime nem em toda versão — e um corpo que chega como TEXTO
 * seria lido como "não é objeto" e recusado com a mensagem errada. Quando o tipo
 * de conteúdo não é JSON, o que chega é um `Buffer`, que é ainda pior: ele *é*
 * um objeto, então passaria pela conferência de forma e cairia como "falta
 * título" sobre um pedido perfeitamente bem formado.
 *
 * Quatro formas, e nenhuma delas lança:
 *
 *   objeto        → devolvido como está (o caminho comum);
 *   texto JSON    → desserializado;
 *   texto vazio   → `null`, que o núcleo recusa como "não é objeto";
 *   texto inválido→ devolvido como TEXTO, para o núcleo recusar dizendo que veio
 *                   uma string — e não fingir que o corpo estava vazio;
 *   Buffer / Uint8Array → decodificado como UTF-8 e tratado como texto.
 */
export function corpoComoObjeto(corpo) {
  let texto = corpo;
  if (corpo instanceof Uint8Array) {
    // `Buffer` é subclasse de `Uint8Array`, então um teste cobre os dois — e não
    // depende de `Buffer` existir no runtime.
    try {
      texto = new TextDecoder("utf-8", { fatal: false }).decode(corpo);
    } catch {
      return null;
    }
  }
  if (typeof texto !== "string") return texto;
  if (texto.trim() === "") return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/**
 * O corpo da resposta: tipo e frase. `detalhe` NUNCA sai daqui.
 *
 * `faltando` e `alternativa` saem porque as duas são para a TELA agir, não para
 * diagnóstico: uma diz qual campo marcar, a outra diz qual saída oferecer. Sem
 * a segunda, a recusa de um agendamento no passado chegaria como uma frase que
 * menciona publicar agora e um botão que não existe.
 */
export function respostaDeErro(erro) {
  return {
    ok: false,
    erro: {
      tipo: erro.tipo,
      mensagem: erro.mensagem,
      ...(erro.faltando ? { faltando: erro.faltando } : {}),
      ...(erro.alternativa ? { alternativa: erro.alternativa } : {}),
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    /* CONTINUA SÓ POST, e isso não é descuido depois da Story 2.12: excluir não
       virou `DELETE` e destacar não virou `PATCH`. O método HTTP é transporte;
       a operação é dado, conferido contra o vocabulário fechado. Espalhar as
       operações por verbos criaria três caminhos de entrada onde a regra do
       projeto pede um. */
    res.setHeader("Allow", "POST");
    const erro = falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Esta rota escreve posts e aceita apenas POST.",
    }).erro;
    res.status(405).json(respostaDeErro(erro));
    return;
  }

  const montagem = acessoDoAmbiente(process.env);
  if (!montagem.ok) {
    // O que falta é dito no LOG, com nome. Na resposta, não: a lista de
    // variáveis de ambiente de um servidor não é informação de quem chama.
    console.error(
      `[api/posts] configuração inutilizável — ausentes: ${montagem.faltando.join(", ") || "nenhuma"}; ` +
        `inválidas: ${(montagem.invalidas ?? []).join("; ") || "nenhuma"}. ` +
        `Aceitas: ${Object.values(VARIAVEIS).map((n) => n.join(" ou ")).join(" / ")}`,
    );
    const erro = falha(ERRO_CONFIGURACAO, {}).erro;
    res.status(CODIGO_HTTP[ERRO_CONFIGURACAO]).json(respostaDeErro(erro));
    return;
  }

  const corpo = corpoComoObjeto(req.body);
  const token = tokenDoCabecalho(req.headers ?? {});

  /* ─── A OPERAÇÃO É ESCOLHIDA ANTES DE QUALQUER ESCRITA ───────────────────
     Corpo forjado com operação fora do vocabulário morre aqui, sem ida ao banco
     e sem nada gravado — a recusa é por construção, não por revisão.

     ─── MAS QUEM NÃO SE IDENTIFICOU NÃO OUVE O VOCABULÁRIO ────────────────
     A recusa antes trazia a lista completa das operações e registrava o valor
     recebido no log — as duas coisas para quem não apresentou credencial
     nenhuma. Enumerar dava o mapa da porta de graça, e o log virava um lugar
     onde qualquer um escreve à vontade, um pedido por linha. Agora a frase
     detalhada e o registro dependem de haver credencial; sem ela a recusa é
     seca e silenciosa. Continua sem escrever nada, que é o que importa. */
  const pedida = operacaoPedida(corpo);
  if (!pedida.ok) {
    const identificado = token !== "";
    if (identificado) console.error(`[api/posts] operação recusada: ${pedida.detalhe}`);
    const erro = falha(ERRO_DADOS_INVALIDOS, {
      mensagem: identificado ? pedida.mensagem : RECUSA_SEM_CREDENCIAL,
    }).erro;
    res.status(CODIGO_HTTP[ERRO_DADOS_INVALIDOS]).json(respostaDeErro(erro));
    return;
  }

  const executor = executorDe(pedida.operacao);
  if (executor === null) {
    /* O vocabulário declara uma operação que a tabela não executa. Não é pedido
       mal formado — é defeito de programação, e dizer "dados inválidos" a quem
       chamou mandaria a pessoa procurar o erro no próprio pedido. */
    console.error(
      `[api/posts] operação sem executor: ${pedida.operacao}. ` +
        `Declaradas: ${OPERACOES.join(", ")}; executáveis: ${Object.keys(EXECUTORES).join(", ")}.`,
    );
    const erro = falha(ERRO_INESPERADO, {}).erro;
    res.status(CODIGO_HTTP[ERRO_INESPERADO]).json(respostaDeErro(erro));
    return;
  }

  const resultado = await executor({
    token,
    corpo,
    acesso: montagem.acesso,
  });

  if (!resultado.ok) {
    const { erro } = resultado;
    if (erro.detalhe) {
      console.error(
        `[api/posts] ${pedida.operacao} | ${erro.tipo}${erro.codigo ? ` (${erro.codigo})` : ""}: ${erro.detalhe}`,
      );
    }
    res.status(CODIGO_HTTP[erro.tipo] ?? 500).json(respostaDeErro(erro));
    return;
  }

  /* ─── O RESÍDUO É NOMEADO, NUNCA SILENCIOSO (Story 3.1) ─────────────────
     A operação deu certo E sobrou um arquivo no bucket: a linha saiu, a capa
     anterior não. É sucesso — excluir o Post e trocar a capa são autoritativos,
     e nenhum dos dois se desfaz por causa de um arquivo —, mas "sobrou lixo" é
     coisa que alguém precisa poder descobrir. Ele vai para o log do servidor
     COM O CAMINHO, que é o que permite limpar depois, e viaja na resposta sem
     o motivo interno, como todo o resto. */
  const residuo = resultado.dados?.residuo ?? null;
  if (residuo) {
    console.error(
      `[api/posts] ${pedida.operacao} | resíduo no Storage: o arquivo ${residuo.arquivo} ` +
        `NÃO foi removido e continua no bucket — ${residuo.motivo}`,
    );
  }

  /* E O QUE SAI NA RESPOSTA É SÓ O ARQUIVO.
     `motivo` é o mesmo tipo de coisa que `detalhe` — SQLSTATE, texto do
     Storage, nome de restrição —, e a regra desta porta é que detalhe interno
     vai para o log e não para o corpo. Quem chama precisa saber QUE sobrou
     alguma coisa e QUAL arquivo é, para poder limpar; por que sobrou é
     diagnóstico de servidor. */
  const dados = residuo
    ? { ...resultado.dados, residuo: { arquivo: residuo.arquivo } }
    : resultado.dados;

  /* 201 é do que NASCEU — o Post (`criado`) e a Categoria (`criada`). As
     operações que mexem no que já existe saem com 200, e nenhuma das duas
     chaves existe na resposta delas. */
  const nasceu =
    resultado.dados.criado === true || resultado.dados.criada === true;
  res.status(nasceu ? 201 : 200).json({
    ok: true,
    dados,
  });
}
