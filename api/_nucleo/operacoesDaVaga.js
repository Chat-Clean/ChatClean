/**
 * As operações de Vaga da Story 5.3: salvar, mudar de Estado e excluir.
 *
 * Chamadas por `api/carreiras.js`, escolhidas pelo campo `operacao` do corpo
 * contra o vocabulário fechado de `src/domain/carreiras/operacoes.js`. Todas
 * têm a assinatura `{ token, corpo, acesso }` e o contrato de retorno das
 * operações do Blog: `{ ok: true, dados }` ou a falha tipada. Nenhuma lança.
 *
 * ─── O QUE ELAS REAPROVEITAM, E O QUE NÃO ──────────────────────────────────
 *
 * Reaproveitam por IMPORTAÇÃO: `autorizar` (token válido e cadastro no Painel,
 * nessa ordem, antes de qualquer escrita), `falha`, `classificar`, o formato
 * de identificador e o renderizador único. NÃO reaproveitam `falhaDaEscrita`,
 * porque as frases dela são de post: quem acabou de salvar uma vaga não pode
 * ler "já existe um post com este endereço". As frases daqui falam de vaga.
 *
 * ─── O ESTADO GRAVADO DECIDE ───────────────────────────────────────────────
 *
 * Toda decisão de Estado (a transição, a exclusão, a trava do Slug, o
 * invariante da Aberta num salvamento) é tomada sobre o registro LIDO do
 * banco, e nunca sobre o que o pedido diz que a Vaga é. E a gravação leva o
 * Estado lido no filtro: se ele mudou no meio, o comando não alcança a linha.
 *
 * ─── AS COLUNAS SÃO MONTADAS À MÃO ─────────────────────────────────────────
 *
 * O corpo nunca é espalhado sobre o comando. `estado`, `aberta_em`,
 * `descricao_html` e qualquer campo desconhecido são ignorados e relatados.
 * `aberta_em` é do banco (gatilho `vagas_maquina_de_estados`), e
 * `descricao_html` é derivado aqui, da Descrição, na mesma escrita.
 */

import {
  OPERACAO_EXCLUIR_VAGA,
  OPERACAO_MUDAR_ESTADO_DA_VAGA,
  OPERACAO_SALVAR_VAGA,
} from "../../src/domain/carreiras/operacoes.js";
import { ESTADOS_DA_VAGA, rotuloDoEstadoDaVaga } from "../../src/domain/carreiras/estados.js";
import {
  acaoDoEstadoDaVaga,
  acoesDoEstadoDaVaga,
  exclusaoDaVagaPermitida,
  motivoDaRecusa,
  transicaoDaVagaPermitida,
} from "../../src/domain/carreiras/transicoes.js";
import {
  LIMITES_DA_VAGA,
  ROTULOS_DOS_CAMPOS,
  linkDeCandidaturaValido,
  problemasParaAbrir,
  slugDaVaga,
  tamanhoEmCaracteres,
} from "../../src/domain/carreiras/vaga.js";
import {
  LISTAS_DE_CLASSIFICACAO,
  MODALIDADES,
  ehModalidade,
} from "../../src/domain/carreiras/classificacoes.js";
import { VOCABULARIO_DA_VAGA } from "../../src/domain/carreiras/descricao.js";
import { FORMATO_DE_SLUG, TAMANHO_MAXIMO_DO_SLUG } from "../../src/domain/blog/slug.js";
import { derivarHtml } from "../../src/render/blog/paraHtml.js";
import { autorizar } from "./autenticacao.js";
import {
  ERRO_CONFLITO,
  ERRO_DADOS_INVALIDOS,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
  LIMITE_DE_IGNORADOS,
  PADRAO_UUID,
  classificar,
  detalhar,
  falha,
} from "./salvarPost.js";

/* ─── As frases da autorização, uma por operação ─────────────────────────── */

export const SEM_PERMISSAO_PARA_VAGAS =
  "Sua sessão não autoriza mexer nas vagas. Entre no Painel de novo e tente outra vez.";
export const SEM_CADASTRO_PARA_VAGAS =
  "Esta conta não está cadastrada no Painel, então não pode mexer nas vagas. Avise quem cuida das contas.";

const SEM_RESPOSTA = Object.freeze({
  [OPERACAO_SALVAR_VAGA]:
    "Não conseguimos falar com o servidor para salvar a vaga. Espere um instante e tente de novo.",
  [OPERACAO_MUDAR_ESTADO_DA_VAGA]:
    "Não conseguimos falar com o servidor para mudar o estado da vaga. Espere um instante e tente de novo.",
  [OPERACAO_EXCLUIR_VAGA]:
    "Não conseguimos falar com o servidor para excluir a vaga. Espere um instante e tente de novo.",
});

/** O teto do documento da Descrição, em caracteres do JSON serializado. */
export const TAMANHO_MAXIMO_DA_DESCRICAO = 200_000;

/* ─── A falha de uma chamada ao banco, com frase de Carreiras ────────────── */

/** O gatilho `vagas_maquina_de_estados` recusou (Estado mudou no meio, SQL torto). */
export const FRASE_DA_MAQUINA_NO_BANCO =
  "O banco recusou a mudança porque ela não segue os estados da vaga. Recarregue o Painel para ver como a vaga está agora.";
/** O CHECK `vagas_aberta_completa` recusou. */
export const FRASE_DA_ABERTA_INCOMPLETA_NO_BANCO =
  "O banco recusou porque uma vaga aberta precisa estar completa. Confira os campos e tente de novo.";
/** A chave estrangeira de uma Classificação recusou (23503). */
export const FRASE_DA_CLASSIFICACAO_INEXISTENTE =
  "Um Departamento, Tipo ou Nível escolhido não existe mais. Recarregue o formulário e escolha de novo.";

/**
 * A falha de uma chamada do transporte, classificada, com frase que fala do
 * que a pessoa estava fazendo (`fazer`) e, na colisão, da frase dada
 * (`conflito`). O `detalhe` leva o que o banco disse, para o log.
 *
 * Exportada para as operações de Classificação usarem a mesma tradução.
 */
export function falhaDaEscritaDeCarreiras(resultado, { oQue, fazer, conflito }) {
  const texto = String(resultado?.mensagem ?? "");
  const codigo = String(resultado?.codigo ?? "");
  /* A CHAVE ESTRANGEIRA PRIMEIRO (revisão da 5.3). O PostgREST responde o
     23503 com HTTP 409, e `classificar` o levaria ao ramo de CONFLITO, com a
     frase de conflito dada por quem chama: salvar uma Vaga cujo Departamento
     acabou de ser excluído diria "já existe uma vaga com este endereço". Na
     escrita de Carreiras a única chave estrangeira é a da Vaga para as
     Classificações (a exclusão de Classificação trata o 23503 dela antes de
     chegar aqui), então 23503 é sempre "a Classificação escolhida não existe
     mais": entrada que não serve, 422. */
  if (codigo === "23503") {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: FRASE_DA_CLASSIFICACAO_INEXISTENTE,
      detalhe: detalhar(resultado, oQue),
      codigo: resultado?.codigo,
      status: resultado?.status,
    });
  }
  const tipo = classificar(resultado);
  let mensagem;
  if (tipo === ERRO_REDE) {
    mensagem = `Não conseguimos falar com o banco para ${fazer}. Espere um instante e tente de novo.`;
  } else if (tipo === ERRO_PERMISSAO) {
    mensagem = `O servidor não recebeu permissão do banco para ${fazer}. Avise quem cuida do projeto.`;
  } else if (tipo === ERRO_CONFLITO) {
    /* Nunca vazia: a frase padrão do núcleo é de post. */
    mensagem =
      typeof conflito === "string" && conflito.trim() !== ""
        ? conflito
        : `Houve um conflito com outro registro ao ${fazer}. Recarregue o Painel e tente de novo.`;
  } else if (tipo === ERRO_DADOS_INVALIDOS) {
    if (/vagas_maquina_de_estados/.test(texto)) {
      mensagem = FRASE_DA_MAQUINA_NO_BANCO;
    } else if (/vagas_aberta_completa/.test(texto)) {
      mensagem = FRASE_DA_ABERTA_INCOMPLETA_NO_BANCO;
    } else {
      mensagem = `O banco recusou o que foi enviado para ${fazer}. Confira os campos e tente de novo.`;
    }
  } else {
    mensagem = `O banco respondeu de um jeito que não esperávamos ao ${fazer}. Recarregue o Painel antes de tentar de novo.`;
  }
  return falha(tipo, {
    mensagem,
    detalhe: detalhar(resultado, oQue),
    codigo: resultado?.codigo,
    status: resultado?.status,
  });
}

/** A exceção que escapou, como falha tipada com frase de Carreiras. */
export function falhaDeExcecao(excecao, fazer) {
  return falha(ERRO_INESPERADO, {
    mensagem: `Não deu para ${fazer} agora. Nada do que foi digitado se perdeu; tente de novo em instantes.`,
    detalhe: `exceção não prevista ao ${fazer}: ${String(excecao?.stack ?? excecao?.message ?? excecao)}`,
    codigo: String(excecao?.name ?? ""),
  });
}

/** Os campos do corpo fora da lista, até o teto do relatório. */
export function camposIgnorados(corpo, aceitos) {
  return relatorioDeIgnorados(corpo, aceitos).ignorados;
}

/**
 * O relatório COMPLETO do que foi ignorado, no molde de `lerCorpo` do Post:
 * a lista até o teto (`LIMITE_DE_IGNORADOS`), o total, e se a lista foi
 * cortada. Sem o total, um corpo com cinco mil campos a mais apareceria como
 * "quarenta ignorados", e quem lê não saberia que faltou relatar o resto.
 */
export function relatorioDeIgnorados(corpo, aceitos) {
  const todos = Object.keys(corpo ?? {}).filter((c) => !aceitos.includes(c));
  return Object.freeze({
    ignorados: Object.freeze(todos.slice(0, LIMITE_DE_IGNORADOS)),
    totalIgnorado: todos.length,
    ignoradosTruncados: todos.length > LIMITE_DE_IGNORADOS,
  });
}

const ehObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * O identificador da Vaga no corpo. Ausente é "crie" quando não é
 * obrigatório; fora do formato é recusa, antes de qualquer ida ao banco.
 */
function idDaVaga(corpo, { obrigatorio }) {
  const bruto = ehObjeto(corpo) ? corpo.id : undefined;
  if (bruto === undefined || bruto === null || bruto === "") {
    if (!obrigatorio) return { ok: true, id: null };
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual vaga deve ser alterada.",
      detalhe: "id de vaga ausente no corpo do pedido",
    });
  }
  const id = typeof bruto === "string" ? bruto.trim() : "";
  if (id === "" || !PADRAO_UUID.test(id)) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual vaga deve ser alterada.",
      detalhe: `id de vaga fora do formato: ${JSON.stringify(String(bruto).slice(0, 60))}`,
    });
  }
  return { ok: true, id };
}

/** A Vaga que não existe mais, dita como ausência. */
function vagaAusente(id) {
  return falha(ERRO_NAO_ENCONTRADO, {
    mensagem: "Esta vaga não está mais no Painel. Ela pode ter sido excluída por outra pessoa.",
    detalhe: `nenhuma vaga com id ${id}`,
  });
}

/* ─── A leitura do corpo de um salvamento ───────────────────────────────── */

/**
 * A lista FECHADA dos campos que `salvarVaga` aceita. O que não está aqui não
 * chega ao banco, por construção. `estado` e `aberta_em` ficam de fora de
 * propósito: o Estado muda só por `mudarEstadoDaVaga`, e `aberta_em` é do
 * banco. `descricao_html` também: ele é DERIVADO da Descrição, aqui.
 */
export const CAMPOS_DA_VAGA = Object.freeze([
  "id",
  "titulo",
  "slug",
  "departamento_id",
  "tipo_id",
  "nivel_id",
  "modalidade",
  "localizacao",
  "resumo",
  "descricao",
  "link_de_candidatura",
  "operacao",
]);

/** As colunas que a gravação escreve, nesta ordem, e nenhuma outra. */
export const COLUNAS_GRAVAVEIS_DA_VAGA = Object.freeze([
  "titulo",
  "slug",
  "departamento_id",
  "tipo_id",
  "nivel_id",
  "modalidade",
  "localizacao",
  "resumo",
  "descricao",
  "descricao_html",
  "link_de_candidatura",
]);

/** Texto aparado dentro do teto, `""` para nulo, ou o problema. */
function textoLimitado(valor, teto, rotulo) {
  if (valor === null) return { ok: true, valor: "" };
  if (typeof valor !== "string") {
    return { ok: false, problema: `${rotulo} precisa ser texto.` };
  }
  const limpo = valor.trim();
  if (tamanhoEmCaracteres(limpo) > teto) {
    return { ok: false, problema: `${rotulo} passa de ${teto} caracteres. Encurte antes de salvar.` };
  }
  return { ok: true, valor: limpo };
}

/**
 * Lê o corpo de um salvamento de Vaga.
 *
 * Devolve `{ ok: true, campos, ignorados, totalIgnorado, ignoradosTruncados,
 * descarte }` ou
 * `{ ok: false, mensagem, detalhe, faltando }`, com TODOS os problemas de uma
 * vez. Criar exige título e as três Classificações; editar preserva o que não
 * veio. Um Rascunho pode nascer sem Link, sem Descrição e sem Modalidade.
 */
export function lerCorpoDaVaga(corpo, { criando }) {
  if (!ehObjeto(corpo)) {
    return {
      ok: false,
      mensagem: "O pedido de gravação da vaga não veio no formato esperado.",
      detalhe: `corpo não é objeto: ${typeof corpo}`,
      faltando: [],
    };
  }

  const campos = {};
  const problemas = [];
  const detalhes = [];
  const faltando = [];
  const recusar = (campo, problema, detalhe) => {
    problemas.push(problema);
    detalhes.push(detalhe);
    if (!faltando.includes(campo)) faltando.push(campo);
  };
  let descarte = null;

  /* ── Título ── */
  if (corpo.titulo === undefined) {
    if (criando) recusar("titulo", "A vaga precisa de um título.", "titulo ausente na criação");
  } else {
    const lido = textoLimitado(corpo.titulo, LIMITES_DA_VAGA.titulo, "O título");
    if (!lido.ok) recusar("titulo", lido.problema, "titulo fora de forma");
    else if (lido.valor === "") recusar("titulo", "A vaga precisa de um título.", "titulo vazio");
    else campos.titulo = lido.valor;
  }

  /* ── Endereço ──
     Ausente (ou vazio) na criação é DERIVADO do título pela regra do Post.
     Vazio na edição é pedido de apagar o endereço, e isso não existe. */
  const derivarSlug = () => {
    if (campos.titulo === undefined) return;
    const gerado = slugDaVaga(campos.titulo);
    if (!gerado.ok) recusar("slug", gerado.motivo, "slug não derivável do título");
    else campos.slug = gerado.slug;
  };
  if (corpo.slug === undefined) {
    if (criando) derivarSlug();
  } else if (corpo.slug === null || (typeof corpo.slug === "string" && corpo.slug.trim() === "")) {
    if (criando) derivarSlug();
    else recusar("slug", "O endereço da vaga não pode ficar vazio.", "slug vazio na edição");
  } else {
    const slug = typeof corpo.slug === "string" ? corpo.slug.trim() : "";
    if (slug.length > TAMANHO_MAXIMO_DO_SLUG || !FORMATO_DE_SLUG.test(slug)) {
      recusar(
        "slug",
        "O endereço da vaga só pode ter letras minúsculas sem acento, números e hífens entre eles.",
        `slug recusado: ${JSON.stringify(String(corpo.slug).slice(0, 80))}`,
      );
    } else {
      campos.slug = slug;
    }
  }

  /* ── As três Classificações ── */
  for (const lista of LISTAS_DE_CLASSIFICACAO) {
    const bruto = corpo[lista.coluna];
    if (bruto === undefined) {
      if (criando) {
        recusar(lista.coluna, `A vaga precisa de um ${lista.rotulo}.`, `${lista.coluna} ausente na criação`);
      }
      continue;
    }
    const id = typeof bruto === "string" ? bruto.trim() : "";
    if (!PADRAO_UUID.test(id)) {
      recusar(
        lista.coluna,
        `Escolha um ${lista.rotulo} da lista.`,
        `${lista.coluna} fora do formato: ${JSON.stringify(String(bruto).slice(0, 60))}`,
      );
    } else {
      campos[lista.coluna] = id;
    }
  }

  /* ── Modalidade ── */
  if (corpo.modalidade !== undefined) {
    if (corpo.modalidade === null || corpo.modalidade === "") campos.modalidade = null;
    else if (ehModalidade(corpo.modalidade)) campos.modalidade = corpo.modalidade;
    else {
      recusar(
        "modalidade",
        `A modalidade precisa ser uma destas: ${MODALIDADES.map((m) => m.rotulo).join(", ")}.`,
        `modalidade fora do vocabulário: ${JSON.stringify(String(corpo.modalidade).slice(0, 40))}`,
      );
    }
  }

  /* ── Localização e Resumo ── */
  for (const [campo, rotulo] of [
    ["localizacao", "A localização"],
    ["resumo", "O resumo"],
  ]) {
    if (corpo[campo] === undefined) continue;
    const lido = textoLimitado(corpo[campo], LIMITES_DA_VAGA[campo], rotulo);
    if (!lido.ok) recusar(campo, lido.problema, `${campo} fora de forma`);
    else campos[campo] = lido.valor;
  }

  /* ── Link de Candidatura ── */
  if (corpo.link_de_candidatura !== undefined) {
    const bruto = corpo.link_de_candidatura;
    if (bruto === null || (typeof bruto === "string" && bruto.trim() === "")) {
      campos.link_de_candidatura = null;
    } else if (typeof bruto === "string" && linkDeCandidaturaValido(bruto.trim())) {
      campos.link_de_candidatura = bruto.trim();
    } else {
      recusar(
        "link_de_candidatura",
        "O link de candidatura precisa ser um endereço completo, começando com http:// ou https://.",
        `link recusado: ${JSON.stringify(String(bruto).slice(0, 80))}`,
      );
    }
  }

  /* ── Descrição ──
     Validar é higienizar: o que está fora da projeção reduzida cai, e o que
     caiu é relatado. O HTML sai do renderizador único, sobre o documento já
     saneado, e é gravado no MESMO comando. */
  if (corpo.descricao !== undefined) {
    let tamanho = 0;
    try {
      tamanho = JSON.stringify(corpo.descricao)?.length ?? 0;
    } catch {
      tamanho = Infinity;
    }
    if (tamanho > TAMANHO_MAXIMO_DA_DESCRICAO) {
      recusar(
        "descricao",
        "A descrição da vaga está longa demais para ser salva. Encurte o texto e tente de novo.",
        `descricao com ${tamanho} caracteres serializados`,
      );
    } else {
      const derivado = derivarHtml(corpo.descricao, VOCABULARIO_DA_VAGA);
      if (!derivado.ok) {
        recusar(
          "descricao",
          derivado.erro?.mensagem || VOCABULARIO_DA_VAGA.mensagens.formato,
          `descricao recusada: ${derivado.erro?.detalhe ?? ""}`,
        );
      } else {
        campos.descricao = derivado.documento;
        campos.descricao_html = derivado.html;
        descarte = Object.freeze({
          total: derivado.totalDescartado,
          saneados: derivado.totalSaneado,
          itens: derivado.descartados,
          truncado: derivado.descartadosTruncados,
        });
      }
    }
  }

  if (problemas.length > 0) {
    return {
      ok: false,
      mensagem: problemas.join(" "),
      detalhe: detalhes.join(" | "),
      faltando,
    };
  }
  if (Object.keys(campos).length === 0) {
    return {
      ok: false,
      mensagem: "O pedido não traz nada para mudar na vaga.",
      detalhe: "nenhum campo aceito veio no corpo",
      faltando: [],
    };
  }
  return { ok: true, campos, ...relatorioDeIgnorados(corpo, CAMPOS_DA_VAGA), descarte };
}

/* ─── Peças comuns às três operações ────────────────────────────────────── */

/** A frase do que falta para abrir, com os rótulos do formulário. */
export function fraseDoQueFalta(faltando, { aberta }) {
  const nomes = faltando.map((c) => ROTULOS_DOS_CAMPOS[c] ?? c).join(", ");
  return aberta
    ? `Uma vaga aberta precisa continuar completa. Falta: ${nomes}.`
    : `Para abrir a vaga, falta: ${nomes}.`;
}

/**
 * A gravação voltou sem linha. Com o Estado no filtro, isso é uma de duas
 * coisas: a Vaga sumiu, ou ela mudou de Estado no meio. Relê para dizer qual.
 */
async function semLinhaDeVolta({ acesso, id, fazer }) {
  const relida = await acesso.lerVaga(id);
  if (!relida.ok) {
    return falhaDaEscritaDeCarreiras(relida, {
      oQue: "releitura da vaga",
      fazer,
      conflito: "A vaga mudou enquanto você mexia nela. Recarregue o Painel para ver como ela está.",
    });
  }
  if (relida.dados === null) return vagaAusente(id);
  return falha(ERRO_CONFLITO, {
    mensagem: "A vaga mudou de estado enquanto você mexia nela. Recarregue o Painel para ver como ela está agora.",
    detalhe: `vaga ${id} não estava mais no Estado lido; agora está ${relida.dados.estado}`,
  });
}

/**
 * A ação de mudança de Estado de chave `chave`, lida da linha do Estado
 * GRAVADO, ou `null` (a ação não existe nesse Estado, ou é a exclusão).
 *
 * É daqui, e só daqui, que sai o destino de `mudarEstadoDaVaga` (revisão da
 * 5.3). Antes o destino era a primeira ocorrência da chave em QUALQUER
 * Estado: com a tabela de hoje dá no mesmo, porque cada chave vive num Estado
 * só, mas uma chave repetida com destinos diferentes levaria a Vaga para o
 * destino de outro Estado. `acoesDe` é injetável para a verificação exercer
 * exatamente esse caso com uma tabela de mentira. Não lança.
 */
export function resolverAcaoNoEstado(estadoGravado, chave, { acoesDe = acoesDoEstadoDaVaga } = {}) {
  let acoes;
  try {
    acoes = acoesDe(estadoGravado);
  } catch {
    return null;
  }
  const acao = (Array.isArray(acoes) ? acoes : []).find((a) => a?.chave === chave) ?? null;
  if (acao === null || acao.exclui === true || typeof acao.destino !== "string") return null;
  return acao;
}

/**
 * Para onde a ação leva em ALGUM Estado. Serve SÓ à frase da recusa (a
 * `motivoDaRecusa` pergunta por um destino); a decisão nunca usa isto.
 */
function destinoNominalDaAcao(chave) {
  for (const estado of ESTADOS_DA_VAGA) {
    const acao = acaoDoEstadoDaVaga(estado, chave);
    if (acao !== null && acao.exclui !== true) return acao.destino;
  }
  return null;
}

/** As ações de mudança de Estado que existem, lidas da MAQUINA. */
const ACOES_DE_MUDANCA = Object.freeze(
  [...new Set(ESTADOS_DA_VAGA.flatMap((e) => acoesDoEstadoDaVaga(e)).filter((a) => a.exclui !== true).map((a) => a.chave))],
);

/* ─── salvarVaga ─────────────────────────────────────────────────────────── */

/**
 * Cria ou edita uma Vaga.
 *
 * `{ ok: true, dados: { operacao, criada, vaga, ignorados, descarte } }`.
 *
 * A Vaga nasce Rascunho: o comando de criação não leva `estado`, e o banco
 * recusaria outro. O Slug vem do título quando não vem no pedido, e trava
 * depois da primeira abertura. Salvar uma Vaga ABERTA exige que o resultado
 * continue completo (`problemasParaAbrir` sobre o gravado mais o pedido).
 */
export async function salvarVaga({ token, corpo, acesso }) {
  const fazer = "salvar a vaga";
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_VAGAS,
      mensagemDeRede: SEM_RESPOSTA[OPERACAO_SALVAR_VAGA],
      mensagemDeCadastro: SEM_CADASTRO_PARA_VAGAS,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDaVaga(corpo, { obrigatorio: false });
    if (!alvo.ok) return alvo;
    const criando = alvo.id === null;

    const lido = lerCorpoDaVaga(corpo, { criando });
    if (!lido.ok) {
      return falha(ERRO_DADOS_INVALIDOS, {
        mensagem: lido.mensagem,
        detalhe: lido.detalhe,
        faltando: lido.faltando.length > 0 ? lido.faltando : null,
      });
    }
    const campos = { ...lido.campos };

    /* O REGISTRO GRAVADO, na edição. É sobre ele que a trava do Slug e o
       invariante da Aberta são julgados. */
    let gravada = null;
    if (!criando) {
      const atual = await acesso.lerVaga(alvo.id);
      if (!atual.ok) {
        return falhaDaEscritaDeCarreiras(atual, { oQue: "leitura da vaga", fazer, conflito: "" });
      }
      if (atual.dados === null) return vagaAusente(alvo.id);
      gravada = atual.dados;

      if (campos.slug !== undefined && campos.slug === gravada.slug) delete campos.slug;
      const jaAberta = gravada.aberta_em !== null || gravada.estado !== "rascunho";
      if (campos.slug !== undefined && jaAberta) {
        return falha(ERRO_DADOS_INVALIDOS, {
          mensagem:
            "O endereço desta vaga travou quando ela foi aberta pela primeira vez e não muda mais: ele pode já ter sido divulgado.",
          detalhe: `slug travado: ${gravada.slug} -> ${campos.slug} (estado ${gravada.estado})`,
        });
      }
    }

    /* As Classificações escolhidas EXISTEM? A chave estrangeira recusaria do
       mesmo jeito; conferir antes é o que permite dizer QUAL. */
    for (const lista of LISTAS_DE_CLASSIFICACAO) {
      const id = campos[lista.coluna];
      if (id === undefined) continue;
      const achada = await acesso.lerClassificacao(lista.chave, id);
      if (!achada.ok) {
        return falhaDaEscritaDeCarreiras(achada, { oQue: `leitura de ${lista.tabela}`, fazer, conflito: "" });
      }
      if (achada.dados === null) {
        return falha(ERRO_DADOS_INVALIDOS, {
          mensagem: `O ${lista.rotulo} escolhido não existe mais. Recarregue o formulário e escolha de novo.`,
          detalhe: `${lista.coluna} ${id} ausente em ${lista.tabela}`,
          faltando: [lista.coluna],
        });
      }
    }

    /* SALVAR UMA ABERTA não pode deixá-la incompleta. */
    if (gravada !== null && gravada.estado === "aberta") {
      const faltando = problemasParaAbrir({ ...gravada, ...campos });
      if (faltando.length > 0) {
        return falha(ERRO_DADOS_INVALIDOS, {
          mensagem: fraseDoQueFalta(faltando, { aberta: true }),
          detalhe: `salvar a vaga aberta ${gravada.id} a deixaria sem: ${faltando.join(", ")}`,
          faltando,
        });
      }
    }

    /* COLISÃO DE ENDEREÇO, dita com o nome de quem já o tem. O índice único é
       a última linha; o 23505 dele cai na mesma frase. */
    const conflitoDoSlug = "Já existe uma vaga com este endereço. Escolha outro antes de salvar.";
    if (campos.slug !== undefined) {
      const dono = await acesso.vagaPorSlug(campos.slug);
      if (!dono.ok) {
        return falhaDaEscritaDeCarreiras(dono, { oQue: "conferência do endereço da vaga", fazer, conflito: conflitoDoSlug });
      }
      if (dono.dados !== null && dono.dados.id !== alvo.id) {
        return falha(ERRO_CONFLITO, {
          mensagem: `O endereço “${campos.slug}” já é da vaga “${dono.dados.titulo}”. Escolha outro antes de salvar.`,
          detalhe: `slug ${JSON.stringify(campos.slug)} já pertence à vaga ${dono.dados.id}`,
        });
      }
    }

    /* AS COLUNAS SÃO MONTADAS À MÃO, da lista fechada. */
    const colunas = {};
    for (const nome of COLUNAS_GRAVAVEIS_DA_VAGA) {
      if (campos[nome] !== undefined) colunas[nome] = campos[nome];
    }
    if (!criando && Object.keys(colunas).length === 0) {
      return Object.freeze({
        ok: true,
        dados: Object.freeze({
          operacao: OPERACAO_SALVAR_VAGA,
          criada: false,
          vaga: gravada,
          ignorados: lido.ignorados,
          totalIgnorado: lido.totalIgnorado,
          ignoradosTruncados: lido.ignoradosTruncados,
          descarte: lido.descarte,
        }),
      });
    }

    const escrita = criando
      ? await acesso.inserirVaga(colunas)
      : await acesso.atualizarVaga(alvo.id, colunas, { estado: gravada.estado });
    if (!escrita.ok) {
      return falhaDaEscritaDeCarreiras(escrita, {
        oQue: criando ? "criação da vaga" : "gravação da vaga",
        fazer,
        conflito: conflitoDoSlug,
      });
    }
    if (escrita.dados === null) {
      if (criando) {
        return falha(ERRO_INESPERADO, {
          mensagem:
            "A vaga pode ter sido criada, mas o servidor não confirmou. Recarregue a lista antes de tentar de novo.",
          detalhe: "a criação da vaga não devolveu a linha gravada",
        });
      }
      return semLinhaDeVolta({ acesso, id: alvo.id, fazer });
    }

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_SALVAR_VAGA,
        criada: criando,
        vaga: escrita.dados,
        ignorados: lido.ignorados,
        totalIgnorado: lido.totalIgnorado,
        ignoradosTruncados: lido.ignoradosTruncados,
        descarte: lido.descarte,
      }),
    });
  } catch (excecao) {
    return falhaDeExcecao(excecao, fazer);
  }
}

/* ─── mudarEstadoDaVaga ──────────────────────────────────────────────────── */

/** Os campos de uma mudança de Estado. */
export const CAMPOS_DA_MUDANCA_DE_ESTADO = Object.freeze(["id", "acao", "operacao"]);

/**
 * Abre, encerra ou reabre uma Vaga (`{ id, acao }`).
 *
 * `{ ok: true, dados: { operacao, acao, estadoAnterior, vaga, ignorados } }`.
 *
 * A ação é julgada contra o Estado GRAVADO, pela MAQUINA: a ação precisa
 * existir naquele Estado e a transição precisa ser permitida. Abrir e reabrir
 * exigem `problemasParaAbrir` vazio. O comando leva só `estado`: `aberta_em`
 * é gravado pelo banco na primeira abertura e mantido ao reabrir.
 */
export async function mudarEstadoDaVaga({ token, corpo, acesso }) {
  const fazer = "mudar o estado da vaga";
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_VAGAS,
      mensagemDeRede: SEM_RESPOSTA[OPERACAO_MUDAR_ESTADO_DA_VAGA],
      mensagemDeCadastro: SEM_CADASTRO_PARA_VAGAS,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDaVaga(corpo, { obrigatorio: true });
    if (!alvo.ok) return alvo;

    const acao = typeof corpo.acao === "string" ? corpo.acao.trim() : "";
    if (!ACOES_DE_MUDANCA.includes(acao)) {
      return falha(ERRO_DADOS_INVALIDOS, {
        mensagem: `Não reconhecemos a mudança pedida. As mudanças de estado de uma vaga são: ${ACOES_DE_MUDANCA.join(", ")}. Para excluir, use a exclusão da vaga.`,
        detalhe: `acao fora do vocabulário: ${JSON.stringify(String(corpo.acao).slice(0, 40))}`,
      });
    }

    const atual = await acesso.lerVaga(alvo.id);
    if (!atual.ok) {
      return falhaDaEscritaDeCarreiras(atual, { oQue: "leitura da vaga", fazer, conflito: "" });
    }
    if (atual.dados === null) return vagaAusente(alvo.id);
    const gravada = atual.dados;

    /* O DESTINO SAI DO ESTADO GRAVADO: a ação é procurada na linha dele. */
    const acaoNoEstado = resolverAcaoNoEstado(gravada.estado, acao);
    const destino = acaoNoEstado === null ? null : acaoNoEstado.destino;
    if (destino === null || !transicaoDaVagaPermitida(gravada.estado, destino)) {
      const nominal = destinoNominalDaAcao(acao);
      const saidas = (() => {
        try {
          return acoesDoEstadoDaVaga(gravada.estado).map((a) => a.rotulo).join(", ");
        } catch {
          return "";
        }
      })();
      const rotulo = (() => {
        try {
          return rotuloDoEstadoDaVaga(gravada.estado).toLowerCase();
        } catch {
          return String(gravada.estado);
        }
      })();
      return falha(ERRO_DADOS_INVALIDOS, {
        mensagem:
          motivoDaRecusa(gravada.estado, nominal) ??
          `A ação "${acao}" não vale para uma vaga ${rotulo}. O que dá para fazer agora: ${saidas}.`,
        detalhe: `transição recusada: ${gravada.estado} --${acao}--> ${destino ?? `(${nominal})`}`,
      });
    }

    if (destino === "aberta") {
      const faltando = problemasParaAbrir(gravada);
      if (faltando.length > 0) {
        return falha(ERRO_DADOS_INVALIDOS, {
          mensagem: fraseDoQueFalta(faltando, { aberta: false }),
          detalhe: `abrir a vaga ${gravada.id} exige: ${faltando.join(", ")}`,
          faltando,
        });
      }
    }

    const escrita = await acesso.atualizarVaga(alvo.id, { estado: destino }, { estado: gravada.estado });
    if (!escrita.ok) {
      return falhaDaEscritaDeCarreiras(escrita, {
        oQue: `transição ${gravada.estado} -> ${destino}`,
        fazer,
        conflito: "A vaga mudou enquanto você mexia nela. Recarregue o Painel para ver como ela está.",
      });
    }
    if (escrita.dados === null) return semLinhaDeVolta({ acesso, id: alvo.id, fazer });

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_MUDAR_ESTADO_DA_VAGA,
        acao,
        estadoAnterior: gravada.estado,
        vaga: escrita.dados,
        ...relatorioDeIgnorados(corpo, CAMPOS_DA_MUDANCA_DE_ESTADO),
      }),
    });
  } catch (excecao) {
    return falhaDeExcecao(excecao, fazer);
  }
}

/* ─── excluirVaga ────────────────────────────────────────────────────────── */

/**
 * Exclui uma Vaga. Só Rascunho e Encerrada: a Aberta tem endereço divulgado
 * e sai encerrando. A regra é conferida sobre o Estado GRAVADO antes do
 * comando, e o gatilho do banco a repete.
 *
 * `{ ok: true, dados: { operacao, id, vaga } }`.
 */
export async function excluirVaga({ token, corpo, acesso }) {
  const fazer = "excluir a vaga";
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_VAGAS,
      mensagemDeRede: SEM_RESPOSTA[OPERACAO_EXCLUIR_VAGA],
      mensagemDeCadastro: SEM_CADASTRO_PARA_VAGAS,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDaVaga(corpo, { obrigatorio: true });
    if (!alvo.ok) return alvo;

    const atual = await acesso.lerVaga(alvo.id);
    if (!atual.ok) {
      return falhaDaEscritaDeCarreiras(atual, { oQue: "leitura da vaga", fazer, conflito: "" });
    }
    if (atual.dados === null) return vagaAusente(alvo.id);
    const gravada = atual.dados;

    if (!exclusaoDaVagaPermitida(gravada.estado)) {
      return falha(ERRO_DADOS_INVALIDOS, {
        mensagem:
          motivoDaRecusa(gravada.estado, null) ??
          "Esta vaga não pode ser excluída no estado em que está.",
        detalhe: `exclusão recusada no estado ${gravada.estado}`,
      });
    }

    const apagada = await acesso.excluirVaga(alvo.id);
    if (!apagada.ok) {
      return falhaDaEscritaDeCarreiras(apagada, {
        oQue: "exclusão da vaga",
        fazer,
        conflito: "Alguma coisa ainda depende desta vaga. Recarregue o Painel e tente excluir de novo.",
      });
    }
    if (apagada.dados === null) return vagaAusente(alvo.id);

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_EXCLUIR_VAGA,
        id: alvo.id,
        vaga: apagada.dados,
      }),
    });
  } catch (excecao) {
    return falhaDeExcecao(excecao, fazer);
  }
}
