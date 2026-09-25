/**
 * As regras da listagem de Vagas do Painel, puras (Story 5.5).
 *
 * Sem React e sem rede: a aba (`AbaDeCarreiras.jsx`) e a lista
 * (`ListaDeVagas.jsx`) chamam estas funções, e a verificação as importa e
 * executa no Node. Função pura não mora em arquivo de componente.
 *
 * O molde é `admin/blog/listagem.js` e `admin/blog/acoes.js`, lidos e nunca
 * importados: `admin/carreiras` e `admin/blog` não se importam (AD-15).
 *
 * ─── A LINHA É DERIVADA, NUNCA DECIDIDA AQUI ────────────────────────────────
 *
 * As ações de Estado da linha são as de `acoesDoEstadoDaVaga`, a MESMA tabela
 * que o servidor consulta e que o formulário usa. Esta lista não tem uma
 * segunda cópia da máquina: ela só acrescenta Editar (sempre) e Ver no site
 * (quando a Vaga tem página pública), e põe Excluir por último.
 *
 * ─── O QUE VEM TORTO DO BANCO NÃO DERRUBA A LISTA ───────────────────────────
 *
 * A junção com as Classificações é tolerante: um identificador sem par vira
 * um rótulo neutro, com a cor padrão. Um Estado fora do vocabulário não lança
 * aqui: a linha fica só com Editar, e quem ACUSA o defeito é a guarda da tela,
 * pela política de `voz.js` (`exigir`).
 */

import {
  ESTADOS_DA_VAGA,
  ESTADO_INICIAL_DA_VAGA,
  aparenciaDoEstadoDaVaga,
  ehEstadoDaVaga,
  rotuloDoEstadoDaVaga,
} from "../../domain/carreiras/estados.js";
import {
  ACAO_ABRIR,
  ACAO_ENCERRAR,
  ACAO_EXCLUIR,
  ACAO_REABRIR,
  acoesDoEstadoDaVaga,
} from "../../domain/carreiras/transicoes.js";
import {
  LISTAS_DE_CLASSIFICACAO,
  aparenciaDaCorDeClassificacao,
  ehModalidade,
  rotuloDaModalidade,
} from "../../domain/carreiras/classificacoes.js";
import { enderecoDaVaga } from "./rotas.js";

/**
 * Quanto a listagem espera a digitação parar antes de consultar o banco.
 * Exportado porque a verificação precisa do número DE VERDADE.
 */
export const ESPERA_DA_BUSCA_MS = 250;

/* ─── A busca ────────────────────────────────────────────────────────────── */

/**
 * Os botões do filtro de Estado: um por Estado, na ordem do ciclo de vida, com
 * a palavra do vocabulário (nunca escrita à mão).
 */
export const FILTROS_DE_ESTADO = Object.freeze(
  ESTADOS_DA_VAGA.map((estado) => Object.freeze({ estado, rotulo: rotuloDoEstadoDaVaga(estado) })),
);

/**
 * O pedido que viaja para a camada de dados: o termo aparado e UM Estado do
 * vocabulário, ou nenhum. Estado fora do vocabulário vira "sem filtro" aqui, e
 * não uma consulta que a camada recusaria.
 */
export function pedidoDeBusca({ termo, estado } = {}) {
  return Object.freeze({
    termo: typeof termo === "string" ? termo.trim() : "",
    estado: ehEstadoDaVaga(estado) ? estado : null,
  });
}

/** Há recorte pedido? Termo não vazio ou um Estado escolhido. */
export function haBuscaAtiva(pedido) {
  const { termo, estado } = pedidoDeBusca(pedido);
  return termo !== "" || estado !== null;
}

/**
 * O filtro é de UM Estado: clicar no marcado desmarca, clicar noutro troca.
 * Valor fora do vocabulário limpa o filtro.
 */
export function alternarEstadoDoFiltro(atual, estado) {
  if (!ehEstadoDaVaga(estado)) return null;
  return atual === estado ? null : estado;
}

/* ─── As leituras e a situação da lista ──────────────────────────────────── */

/** As cinco telas da lista, e só elas. */
export const SITUACOES_DA_LISTA = Object.freeze([
  "carregando",
  "erro",
  "vazio-de-busca",
  "vazio",
  "lista",
]);

/**
 * Qual das cinco telas mostrar. Erro vem antes do vazio: uma leitura que
 * falhou nunca se apresenta como "nenhuma vaga". E o vazio de busca vem antes
 * do vazio inicial: quem procurou algo precisa ler que não houve
 * correspondência, e não o convite de criar a primeira vaga.
 */
export function situacaoDaLista({ carregando = false, erro = null, quantidade = 0, buscando = false } = {}) {
  if (carregando) return "carregando";
  if (erro !== null && erro !== undefined && erro !== false) return "erro";
  if (!Number.isInteger(quantidade) || quantidade <= 0) return buscando ? "vazio-de-busca" : "vazio";
  return "lista";
}

function ehObjeto(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/** O erro de uma resposta que falhou, sempre como objeto. */
function erroDa(resposta) {
  return ehObjeto(resposta) && ehObjeto(resposta.erro) ? resposta.erro : { tipo: null, mensagem: "" };
}

/**
 * Junta as DUAS leituras da lista: as Vagas e as Classificações. A falha de
 * QUALQUER uma dá erro, nunca lista vazia: uma lista sem os nomes dos
 * Departamentos não é a lista, e uma lista de Vagas que não chegou não é
 * "nenhuma vaga".
 *
 * Devolve `{ ok: true, vagas, indice }` ou `{ ok: false, erro }`.
 */
export function combinarLeituras(lidasVagas, lidasClassificacoes) {
  if (!ehObjeto(lidasVagas) || lidasVagas.ok !== true) {
    return { ok: false, erro: erroDa(lidasVagas) };
  }
  if (!ehObjeto(lidasClassificacoes) || lidasClassificacoes.ok !== true) {
    return { ok: false, erro: erroDa(lidasClassificacoes) };
  }
  if (!Array.isArray(lidasVagas.dados)) {
    return { ok: false, erro: { tipo: null, mensagem: "" } };
  }
  const vagas = lidasVagas.dados.filter(
    (vaga) => ehObjeto(vaga) && typeof vaga.id === "string" && vaga.id !== "",
  );
  return { ok: true, vagas, indice: indiceDasClassificacoes(lidasClassificacoes.dados) };
}

/**
 * As três listas de Classificação como mapas de identificador para item,
 * chaveados pela chave do domínio (`departamento`, `tipo`, `nivel`). Lista
 * ausente ou que não é lista vira mapa vazio.
 */
export function indiceDasClassificacoes(dados) {
  const indice = {};
  for (const lista of LISTAS_DE_CLASSIFICACAO) {
    const itens = ehObjeto(dados) && Array.isArray(dados[lista.tabela]) ? dados[lista.tabela] : [];
    const mapa = new Map();
    for (const item of itens) {
      if (ehObjeto(item) && typeof item.id === "string" && item.id !== "") mapa.set(item.id, item);
    }
    indice[lista.chave] = mapa;
  }
  return indice;
}

/* ─── A linha ────────────────────────────────────────────────────────────── */

/** O rótulo neutro de uma Classificação que não está na lista. */
export function rotuloDaClassificacaoAusente(lista) {
  return `${lista.rotulo} não encontrado`;
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

/** "Híbrido · Natal, RN", "Remoto", ou vazio. Modalidade desconhecida não lança. */
export function textoDoLocal(vaga) {
  const modalidade = ehModalidade(vaga?.modalidade) ? rotuloDaModalidade(vaga.modalidade) : "";
  return [modalidade, texto(vaga?.localizacao)].filter((parte) => parte !== "").join(" · ");
}

/**
 * O endereço público da Vaga, só quando ela tem página: Aberta ou Encerrada,
 * que são os Estados de quem já passou da criação. O Rascunho nunca teve
 * endereço no site. Sem Slug, nada.
 */
export function enderecoPublicoDaVaga(vaga) {
  if (!ehEstadoDaVaga(vaga?.estado) || vaga.estado === ESTADO_INICIAL_DA_VAGA) return null;
  const slug = texto(vaga.slug);
  if (slug === "") return null;
  return `/carreiras/${encodeURIComponent(slug)}`;
}

/**
 * A linha pronta para desenhar: título, Estado (com a aparência, ou `null`
 * quando fora do vocabulário), as três Classificações juntadas pelo
 * identificador (nome, e o par de cor das que têm Cor) e o local.
 */
export function linhaDaVaga(vaga, indice) {
  const v = ehObjeto(vaga) ? vaga : {};
  const estadoValido = ehEstadoDaVaga(v.estado);
  const classificacoes = {};
  for (const lista of LISTAS_DE_CLASSIFICACAO) {
    const id = typeof v[lista.coluna] === "string" ? v[lista.coluna] : null;
    const item = id !== null ? (indice?.[lista.chave]?.get?.(id) ?? null) : null;
    const nome = item !== null ? texto(item.nome) : "";
    const conhecida = nome !== "";
    const aparencia = lista.temCor ? aparenciaDaCorDeClassificacao(conhecida ? item : null) : null;
    classificacoes[lista.chave] = Object.freeze({
      chave: lista.chave,
      id,
      conhecida,
      rotulo: conhecida ? nome : rotuloDaClassificacaoAusente(lista),
      fundo: aparencia?.fundo ?? null,
      tinta: aparencia?.tinta ?? null,
    });
  }
  return Object.freeze({
    id: typeof v.id === "string" ? v.id : "",
    titulo: texto(v.titulo),
    estado: v.estado,
    estadoValido,
    aparenciaDoEstado: estadoValido ? aparenciaDoEstadoDaVaga(v.estado) : null,
    departamento: classificacoes.departamento,
    tipo: classificacoes.tipo,
    nivel: classificacoes.nivel,
    local: textoDoLocal(v),
    acoes: acoesDaLinha(v),
  });
}

/* ─── As ações da linha ──────────────────────────────────────────────────── */

export const ACAO_EDITAR = "editar";
export const ACAO_VER_NO_SITE = "ver";

/** Os tipos de ação da linha: link interno, mudança de Estado, link externo e exclusão. */
export const TIPO_EDITAR = "editar";
export const TIPO_ESTADO = "estado";
export const TIPO_VER = "ver";
export const TIPO_EXCLUIR = "excluir";

/**
 * As ações da linha, na ordem da tela: Editar, as mudanças de Estado da
 * tabela do domínio, Ver no site (só com página pública) e Excluir (quando a
 * tabela a oferece). Estado fora do vocabulário fica só com Editar: a tabela
 * não tem linha para ele, e inventar uma seria a segunda máquina.
 */
export function acoesDaLinha(vaga) {
  const editar = Object.freeze({
    chave: ACAO_EDITAR,
    tipo: TIPO_EDITAR,
    rotulo: "Editar",
    endereco: enderecoDaVaga(vaga?.id),
    acao: null,
  });
  if (!ehEstadoDaVaga(vaga?.estado)) return Object.freeze([editar]);

  const doDominio = acoesDoEstadoDaVaga(vaga.estado);
  const saida = [editar];
  for (const acao of doDominio) {
    if (acao.exclui !== true) {
      saida.push(Object.freeze({ chave: acao.chave, tipo: TIPO_ESTADO, rotulo: acao.rotulo, endereco: null, acao }));
    }
  }
  const publico = enderecoPublicoDaVaga(vaga);
  if (publico !== null) {
    saida.push(
      Object.freeze({ chave: ACAO_VER_NO_SITE, tipo: TIPO_VER, rotulo: "Ver no site", endereco: publico, acao: null }),
    );
  }
  for (const acao of doDominio) {
    if (acao.exclui === true) {
      saida.push(Object.freeze({ chave: acao.chave, tipo: TIPO_EXCLUIR, rotulo: acao.rotulo, endereco: null, acao }));
    }
  }
  return Object.freeze(saida);
}

/** O nome acessível de uma ação da linha: a ação e a Vaga, porque há uma por linha. */
export function rotuloAcessivelDaAcao(acao, vaga) {
  const titulo = texto(vaga?.titulo) || "vaga sem título";
  const sufixo = acao.tipo === TIPO_VER ? " (abre em nova aba)" : "";
  return `${acao.rotulo}: ${titulo}${sufixo}`;
}

const GERUNDIOS = Object.freeze({
  [ACAO_ABRIR]: "Abrindo",
  [ACAO_ENCERRAR]: "Encerrando",
  [ACAO_REABRIR]: "Reabrindo",
  [ACAO_EXCLUIR]: "Excluindo",
});

/** O que está acontecendo, para quem ouve a tela: nomeia a Vaga. */
export function textoDaAcaoEmCurso(vaga, chave) {
  const titulo = texto(vaga?.titulo) || "sem título";
  const verbo = Object.hasOwn(GERUNDIOS, chave) ? GERUNDIOS[chave] : "Mudando o estado de";
  return `${verbo} a vaga "${titulo}".`;
}

/* ─── A exclusão ─────────────────────────────────────────────────────────── */

/**
 * O rótulo do botão de confirmar: o da ação de excluir da TABELA do domínio
 * ("Excluir vaga"), lido de lá, que diz o que o botão faz. Se a tabela um dia
 * deixar de oferecer a exclusão no Estado inicial, a carga deste módulo não
 * lança (derrubaria a aba inteira na importação): cai no mesmo rótulo, escrito
 * aqui como reserva.
 */
export const ROTULO_DE_CONFIRMAR_EXCLUSAO =
  acoesDoEstadoDaVaga(ESTADO_INICIAL_DA_VAGA).find((acao) => acao.exclui === true)?.rotulo ?? "Excluir vaga";

/** A pergunta do diálogo: nomeia a Vaga. */
export function tituloDaExclusao(vaga) {
  const titulo = texto(vaga?.titulo);
  return titulo === "" ? "Excluir esta vaga?" : `Excluir a vaga "${titulo}"?`;
}

/** A consequência, numa frase. */
export function descricaoDaExclusao() {
  return "A vaga sai do Painel e do site para sempre. Não dá para desfazer.";
}

/* ─── As frases das notificações ─────────────────────────────────────────── */

export const FALHA_DA_MUDANCA_DE_ESTADO = "Não deu para mudar o estado da vaga";
export const FALHA_DA_EXCLUSAO = "Não deu para excluir a vaga";
export const RESERVA_DA_ACAO =
  "Confira a conexão e tente de novo. A lista continua como estava.";

/**
 * A Vaga que a escrita não encontrou (`nao_encontrado`): a linha SAI da lista,
 * então a frase não pode dizer que a lista continua como estava, e não há o
 * que tentar de novo. A exclusão tem título próprio (a pessoa queria que a
 * Vaga sumisse, e ela já tinha sumido); a mudança de Estado usa o título da
 * falha dela, com a mesma explicação.
 */
export const TITULO_DA_VAGA_INEXISTENTE = "A vaga já não existia";
export const DESCRICAO_DA_VAGA_INEXISTENTE =
  "Alguém pode ter excluído a vaga antes. Ela saiu da lista.";

/**
 * O rótulo da ação de resolver, aprovado pela regra de voz do Painel. É o
 * mesmo na notificação de uma escrita e na tela de erro da leitura: um texto
 * só, uma constante só (antes havia também `ROTULO_DE_RECARREGAR`, com o
 * mesmo texto).
 */
export const ROTULO_DE_NOVA_TENTATIVA = "Tentar de novo";

/* ─── Os textos das telas vazias e de erro ───────────────────────────────── */

/** O título da aba para quem navega por cabeçalhos: o `<h2>` acima das linhas. */
export const TITULO_DA_ABA = "Vagas";
export const TEXTO_DO_CARREGAMENTO = "Carregando as vagas.";
export const TITULO_DO_ERRO = "Não conseguimos carregar as vagas";
export const RESERVA_DA_LEITURA =
  "Confira a conexão e tente de novo. Se continuar, recarregue a página do Painel.";
export const TITULO_DO_VAZIO = "Nenhuma vaga cadastrada ainda";
export const DESCRICAO_DO_VAZIO =
  "Crie a primeira vaga. Ela só aparece no site depois de aberta.";
export const ROTULO_DA_NOVA_VAGA = "Nova Vaga";
export const TITULO_DO_VAZIO_DE_BUSCA = "Nenhuma vaga corresponde à busca";
export const ROTULO_DE_LIMPAR_BUSCA = "Limpar busca";

/** O que foi procurado, dito de volta: o termo e o Estado, quando há. */
export function descricaoDoVazioDeBusca(pedido) {
  const { termo, estado } = pedidoDeBusca(pedido);
  const partes = [];
  if (termo !== "") partes.push(`com "${termo}"`);
  if (estado !== null) partes.push(`no estado ${rotuloDoEstadoDaVaga(estado).toLowerCase()}`);
  const recorte = partes.length > 0 ? ` ${partes.join(" e ")}` : "";
  return `Nenhuma vaga${recorte}. Limpe a busca para ver todas.`;
}

/* ─── A faixa ────────────────────────────────────────────────────────────── */

export const ROTULO_DA_BUSCA = "Buscar vagas por título, departamento ou localização";
export const DICA_DA_BUSCA = "Buscar por título, departamento ou localização...";
export const ROTULO_DO_FILTRO = "Filtrar vagas por estado";
