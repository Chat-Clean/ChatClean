/**
 * As Classificações da Vaga (Departamento, Tipo e Nível), a Modalidade e o
 * Equivalente JobPosting.
 *
 * Domínio puro. Departamento, Tipo e Nível são DADO (tabelas no banco, que o
 * Painel edita); o que mora aqui é o vocabulário fechado em volta deles: que
 * listas existem, que Cor e que Equivalente um valor pode ter, e a regra do
 * nome.
 *
 * ─── A COR É A PALETA DAS CATEGORIAS, IMPORTADA ───────────────────────────
 *
 * `CORES_DE_CLASSIFICACAO` É `CORES_DE_CATEGORIA` (o mesmo objeto), e não uma
 * cópia: uma cor acrescentada à paleta vale para as duas no mesmo instante. O
 * CHECK de cor no banco é comparado com esta lista pela ferramenta
 * `verificar:carreiras`.
 */

import { COR_PADRAO, CORES_DE_CATEGORIA, aparenciaDaCategoria, ehCorDeCategoria } from "../blog/categorias.js";

/**
 * As três listas de Classificação, na ordem em que o formulário as mostra.
 * `tabela` é o nome da tabela no banco; `coluna` é a chave estrangeira em
 * `vagas`; `temCor` e `temEquivalente` dizem que campo além do nome cada uma
 * tem.
 */
export const LISTAS_DE_CLASSIFICACAO = Object.freeze([
  Object.freeze({
    chave: "departamento",
    rotulo: "Departamento",
    plural: "Departamentos",
    tabela: "departamentos",
    coluna: "departamento_id",
    temCor: true,
    temEquivalente: false,
  }),
  Object.freeze({
    chave: "tipo",
    rotulo: "Tipo",
    plural: "Tipos",
    tabela: "tipos_de_vaga",
    coluna: "tipo_id",
    temCor: false,
    temEquivalente: true,
  }),
  Object.freeze({
    chave: "nivel",
    rotulo: "Nível",
    plural: "Níveis",
    tabela: "niveis",
    coluna: "nivel_id",
    temCor: true,
    temEquivalente: false,
  }),
]);

/** A lista de chave dada, ou `null`. */
export function listaDeClassificacao(chave) {
  return LISTAS_DE_CLASSIFICACAO.find((lista) => lista.chave === chave) ?? null;
}

/* ─── Modalidade ─────────────────────────────────────────────────────────── */

/**
 * Lista fechada NO CÓDIGO, e não dado: cada Modalidade tem significado para o
 * `JobPosting` (a remota vira `TELECOMMUTE`). O CHECK `vagas_modalidade_valida`
 * é comparado com os valores daqui.
 */
export const MODALIDADES = Object.freeze([
  Object.freeze({ valor: "presencial", rotulo: "Presencial" }),
  Object.freeze({ valor: "hibrido", rotulo: "Híbrido" }),
  Object.freeze({ valor: "remoto", rotulo: "Remoto" }),
]);

export const MODALIDADE_REMOTA = "remoto";

export function ehModalidade(valor) {
  return typeof valor === "string" && MODALIDADES.some((m) => m.valor === valor);
}

/** O rótulo da Modalidade. Lança fora do vocabulário, como o Estado. */
export function rotuloDaModalidade(valor) {
  const achada = MODALIDADES.find((m) => m.valor === valor);
  if (!achada) {
    throw new Error(
      `Modalidade desconhecida: ${JSON.stringify(valor)}. ` +
        `Os únicos valores são: ${MODALIDADES.map((m) => m.valor).join(", ")}.`,
    );
  }
  return achada.rotulo;
}

/** A Modalidade exige Localização? Toda, menos a remota. */
export function modalidadeExigeLocalizacao(valor) {
  return ehModalidade(valor) && valor !== MODALIDADE_REMOTA;
}

/* ─── Equivalente JobPosting ─────────────────────────────────────────────── */

/**
 * O `employmentType` do schema.org, lista fechada e completa. O CHECK
 * `tipos_de_vaga_equivalente_valido` é comparado com esta lista.
 */
export const EQUIVALENTES_JOBPOSTING = Object.freeze([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACTOR",
  "TEMPORARY",
  "INTERN",
  "VOLUNTEER",
  "PER_DIEM",
  "OTHER",
]);

export function ehEquivalenteJobPosting(valor) {
  return typeof valor === "string" && EQUIVALENTES_JOBPOSTING.includes(valor);
}

/**
 * O rótulo legível de cada Equivalente, para a tela de Classificações (Story
 * 5.6). Lista FECHADA, com exatamente as chaves de `EQUIVALENTES_JOBPOSTING`
 * (a verificação compara os dois conjuntos): quem escolhe o Equivalente de um
 * Tipo lê a palavra, e o código do schema.org vai junto, entre parênteses.
 */
export const ROTULOS_DOS_EQUIVALENTES = Object.freeze({
  FULL_TIME: "Tempo integral",
  PART_TIME: "Meio período",
  CONTRACTOR: "Prestação de serviço",
  TEMPORARY: "Temporário",
  INTERN: "Estágio",
  VOLUNTEER: "Voluntariado",
  PER_DIEM: "Por diária",
  OTHER: "Outro",
});

/**
 * O rótulo legível de um Equivalente, ou `null` fora da lista. Tolerante: a
 * tela mostra um Equivalente legado pelo código cru, sem lançar.
 */
export function rotuloDoEquivalente(valor) {
  return ehEquivalenteJobPosting(valor) ? ROTULOS_DOS_EQUIVALENTES[valor] : null;
}

/* ─── Cor ────────────────────────────────────────────────────────────────── */

/** A paleta das Categorias, o MESMO objeto. */
export const CORES_DE_CLASSIFICACAO = CORES_DE_CATEGORIA;

/**
 * A Cor de quem não escolheu nenhuma: a mesma do `default` das colunas `cor`
 * de `departamentos` e `niveis` no banco (o cinza), que é a cor padrão das
 * Categorias. A verificação compara com o texto da migração.
 */
export const COR_PADRAO_DE_CLASSIFICACAO = COR_PADRAO;

export function ehCorDeClassificacao(valor) {
  return ehCorDeCategoria(valor);
}

/**
 * O par de cor de um Departamento ou de um Nível: `{ rotulo, sigla, fundo,
 * tinta }`, do catálogo das Categorias (Story 5.5).
 *
 * **Tolerante, e por delegação.** Quem decide o que é "sem cor" e o que é cor
 * fora do vocabulário é `aparenciaDaCategoria`, a MESMA função que pinta a
 * pílula de Categoria: os dois casos caem na cor padrão, neutra, e nada lança.
 * Uma listagem inteira não pode cair por causa de uma linha, e quem RECUSA cor
 * fora da lista é a escrita, no servidor. Aceita a Classificação inteira (lê
 * `cor`), o próprio valor da cor, ou nada.
 */
export function aparenciaDaCorDeClassificacao(classificacao) {
  const cor =
    typeof classificacao === "string"
      ? classificacao
      : classificacao !== null && typeof classificacao === "object"
        ? classificacao.cor
        : undefined;
  return aparenciaDaCategoria({ cor });
}

/* ─── Ordem ──────────────────────────────────────────────────────────────── */

/**
 * O teto de `ordem` (Story 5.6: a regra passou a ter um dono só). O banco só
 * exige `>= 0`; o teto é higiene de entrada, e o servidor
 * (`api/_nucleo/operacoesDaClassificacao.js`) e a tela de Classificações o
 * leem DAQUI.
 */
export const ORDEM_MAXIMA_DA_CLASSIFICACAO = 100_000;

/**
 * A frase da Ordem fora da regra (revisão da Story 5.6: mora aqui, com o
 * MESMO texto que o servidor já dizia). O servidor recusa com ela, e a tela
 * a mostra na ajuda do campo e na recusa local: as duas leem daqui.
 */
export const FRASE_DA_ORDEM = `A ordem é um número inteiro de 0 a ${ORDEM_MAXIMA_DA_CLASSIFICACAO}.`;

/* ─── Nome ───────────────────────────────────────────────────────────────── */

/** Teto do nome, o mesmo do CHECK `*_nome_valido` das três tabelas. */
export const TAMANHO_MAXIMO_DO_NOME_DE_CLASSIFICACAO = 80;

/**
 * O nome como ele é gravado: aparado, com o espaço interno colapsado. A
 * unicidade sem caixa nem acento é do BANCO (índice sobre
 * `normalizar_busca`), nunca do navegador.
 */
export function normalizarNomeDeClassificacao(valor) {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}

/** O que impede o nome de ser gravado, ou `null`. */
export function problemaNoNomeDaClassificacao(valor) {
  const limpo = normalizarNomeDeClassificacao(valor);
  if (limpo === "") return "A classificação precisa de um nome.";
  if ([...limpo].length > TAMANHO_MAXIMO_DO_NOME_DE_CLASSIFICACAO) {
    return `O nome passa de ${TAMANHO_MAXIMO_DO_NOME_DE_CLASSIFICACAO} caracteres. Encurte antes de salvar.`;
  }
  return null;
}

/* ─── Nome repetido ──────────────────────────────────────────────────────── */

/**
 * A frase do nome repetido, com o nome que JÁ existe (revisão da Story 5.6:
 * saiu do servidor para cá com o MESMO texto). O servidor recusa com ela, e
 * a tela a RECONHECE pela forma, com `ehFraseDeNomeRepetido`, para pôr a
 * recusa no campo nome.
 */
export function fraseDeNomeRepetido(lista, existente) {
  return `Já existe um ${lista.rotulo} chamado “${existente}”. Escolha outro nome.`;
}

/**
 * A mesma recusa quando quem acusa é o índice único do banco (o 23505), sem
 * o nome do existente. Mesmo texto que o servidor já dizia.
 */
export function fraseDeNomeRepetidoNoBanco(lista) {
  return `Já existe um ${lista.rotulo} com este nome, sem contar maiúsculas e acentos. Escolha outro nome.`;
}

/**
 * A frase é uma das duas de nome repetido, para a lista dada? Reconhece pela
 * FORMA gerada pelas próprias funções acima (o começo e o fim em volta do
 * nome existente), e não por um pedaço de texto copiado: se a frase mudar,
 * o reconhecimento muda junto. Não lança.
 */
export function ehFraseDeNomeRepetido(lista, frase) {
  if (typeof frase !== "string" || lista === null || typeof lista !== "object" || typeof lista.rotulo !== "string") {
    return false;
  }
  if (frase === fraseDeNomeRepetidoNoBanco(lista)) return true;
  const MARCA = "\u0000";
  const [inicio, fim] = fraseDeNomeRepetido(lista, MARCA).split(MARCA);
  return (
    frase.length > inicio.length + fim.length &&
    frase.startsWith(inicio) &&
    frase.endsWith(fim) &&
    !frase.includes(MARCA)
  );
}
