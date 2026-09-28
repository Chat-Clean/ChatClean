/**
 * A Vaga para máquina: o `JobPosting` do schema.org e o título servido
 * (Story 5.8, C-FR-20).
 *
 * ─── QUEM LÊ PRIMEIRO NÃO É GENTE ─────────────────────────────────────────
 *
 * O Google Vagas lê o `JobPosting`; o gerador de prévia lê o título. Nenhum
 * dos dois executa JavaScript, e é por isso que as duas coisas saem do HTML
 * Servido (`api/_nucleo/paginaDeCarreiras.js`). A REGRA mora aqui, pura, para
 * ser executada e conferida sem servidor.
 *
 * ─── DADO INVENTADO É PIOR QUE DADO AUSENTE ───────────────────────────────
 *
 * O `JobPosting` sai INTEIRO ou não sai: faltando um campo obrigatório
 * (título, Descrição, `aberta_em`, a Modalidade ou a Localização que ela
 * exige), a função devolve `null` e diz por quê em `problemaNoJobPosting`. Um
 * `JobPosting` pela metade é recusado pelo buscador e, pior, pode ser aceito
 * com um local ou uma data que ninguém escreveu.
 *
 * A Descrição chega JÁ CONFERIDA: quem serve a página passa `descricao_html`
 * nulo quando o HTML gravado não passou na conferência do vocabulário
 * (`conferirConteudo`, do servidor). Este módulo não confere HTML: o domínio
 * não importa o servidor.
 *
 * Puro: sem React, sem rede, sem `fs`.
 */

import { enderecoDoLogotipo, raizDoSite } from "../blog/compartilhamento.js";
import {
  ehEquivalenteJobPosting,
  ehModalidade,
  MODALIDADE_REMOTA,
  modalidadeExigeLocalizacao,
} from "./classificacoes.js";
import { enderecoDaPaginaDaVaga, FORMATO_DE_SLUG, LIMITES_DA_VAGA } from "./vaga.js";

/* ─── O título servido ───────────────────────────────────────────────────── */

/** A marca das páginas de Carreiras, no fim de todo título de Vaga. */
export const MARCA_DAS_VAGAS = "Vagas ChatClean";

/**
 * O separador entre o título da Vaga e a marca. É o título que a spec da
 * Story 5.8 e o contexto do épico fixam ("{título} — Vagas ChatClean"), e é a
 * ÚNICA casa do travessão: `verificar:interface` o absolve por linha.
 */
export const SEPARADOR_DO_TITULO_DA_VAGA = " — ";

/** O título da listagem `/carreiras`. */
export const TITULO_DA_LISTAGEM_DE_VAGAS = "Vagas ChatClean | Trabalhe com a gente";

/** O que o `<h1>` e o título dizem de um endereço sem Vaga. */
export const VAGA_NAO_ENCONTRADA = "Vaga não encontrada";

function aparado(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * "{título} — Vagas ChatClean". Título ausente ou em branco devolve `null`:
 * quem serve escolhe a reserva (a da Encerrada, ou a de não encontrada), e
 * esta função não inventa uma.
 */
export function tituloServidoDaVaga(titulo) {
  const limpo = aparado(titulo);
  return limpo === "" ? null : `${limpo}${SEPARADOR_DO_TITULO_DA_VAGA}${MARCA_DAS_VAGAS}`;
}

/* ─── O local ────────────────────────────────────────────────────────────── */

/** "Cidade, UF": a UF são duas letras maiúsculas depois da última vírgula. */
const CIDADE_E_UF = /^(.+?),\s*([A-Z]{2})$/;

/**
 * As 27 Unidades da Federação, lista FECHADA (revisão da Story 5.8). Só uma
 * sigla daqui vira `addressRegion`: "Natal, XX" ou "Lisboa, PT" não são
 * endereço brasileiro com estado, e vão inteiros em `addressLocality`.
 */
export const UFS_DO_BRASIL = Object.freeze([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

/**
 * O endereço de uma Localização em texto livre. Quando casa "Cidade, UF" e
 * a UF é uma das 27, vira `addressLocality` e `addressRegion`; senão, o texto inteiro vai em
 * `addressLocality`. O país é sempre o Brasil. Sem texto, `null`.
 */
export function enderecoPostalDaLocalizacao(localizacao) {
  const limpo = aparado(localizacao);
  if (limpo === "") return null;
  const partes = CIDADE_E_UF.exec(limpo);
  const cidade = partes ? partes[1].trim() : "";
  if (partes && cidade !== "" && UFS_DO_BRASIL.includes(partes[2])) {
    return { "@type": "PostalAddress", addressLocality: cidade, addressRegion: partes[2], addressCountry: "BR" };
  }
  return { "@type": "PostalAddress", addressLocality: limpo, addressCountry: "BR" };
}

/* ─── O JobPosting ───────────────────────────────────────────────────────── */

/**
 * Instante ISO 8601 com data, hora e fuso (revisão da Story 5.8): é o que o
 * `timestamptz` do banco devolve, e é o que o buscador lê sem adivinhar.
 * "September 1, 2026", "2026/09/01" e "2026" o `Date.parse` aceitaria, e cada
 * motor leria de um jeito: não passam.
 */
const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

function instanteValido(valor) {
  return typeof valor === "string" && INSTANTE_ISO.test(valor) && Number.isFinite(Date.parse(valor));
}

function descricaoComTexto(html) {
  if (typeof html !== "string") return false;
  return /\S/u.test(html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;|&#xa0;/gi, " "));
}

function raizOuNulo(raiz) {
  try {
    return raizDoSite(raiz);
  } catch {
    return null;
  }
}

function slugValido(slug) {
  return typeof slug === "string" && slug.length <= LIMITES_DA_VAGA.slug && FORMATO_DE_SLUG.test(slug);
}

/**
 * O que impede esta Vaga de ter `JobPosting`, ou `null` quando nada impede.
 * Nunca lança. A ordem é a da leitura de quem conserta: primeiro o endereço,
 * depois o conteúdo, depois o local.
 */
export function problemaNoJobPosting(vaga, { raiz } = {}) {
  if (vaga === null || typeof vaga !== "object") return "a Vaga não veio";
  if (raizOuNulo(raiz) === null) return "o Domínio Canônico não é uma origem válida";
  if (!slugValido(vaga.slug)) return "o Slug da Vaga está fora do formato";
  if (aparado(vaga.titulo) === "") return "a Vaga não tem título";
  if (!descricaoComTexto(vaga.descricao_html)) return "a Descrição está ausente ou foi recusada";
  if (!instanteValido(vaga.aberta_em)) return "a Vaga não tem `aberta_em` reconhecível";
  if (!ehModalidade(vaga.modalidade)) return `a Modalidade está fora do vocabulário: ${JSON.stringify(vaga.modalidade)}`;
  if (modalidadeExigeLocalizacao(vaga.modalidade) && aparado(vaga.localizacao) === "") {
    return "a Modalidade exige Localização, e ela está vazia";
  }
  return null;
}

/**
 * O `JobPosting` da Vaga Aberta, como objeto, ou `null` (veja
 * `problemaNoJobPosting`). `raiz` é o Domínio Canônico; a `url` é ele mais o
 * caminho montado com o Slug da Vaga, nunca o endereço da requisição.
 *
 * `employmentType` sai só quando o Equivalente JobPosting do Tipo está na
 * lista fechada: um valor fora dela é omitido, e não traduzido.
 */
export function jobPostingDaVaga(vaga, { raiz } = {}) {
  if (problemaNoJobPosting(vaga, { raiz }) !== null) return null;
  const origem = raizDoSite(raiz);

  const dados = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: aparado(vaga.titulo),
    description: vaga.descricao_html,
    datePosted: vaga.aberta_em,
  };
  if (ehEquivalenteJobPosting(vaga.equivalente_jobposting)) {
    dados.employmentType = vaga.equivalente_jobposting;
  }
  dados.hiringOrganization = {
    "@type": "Organization",
    name: "ChatClean",
    sameAs: origem,
    logo: enderecoDoLogotipo(origem),
  };
  dados.directApply = false;
  dados.url = `${origem}${enderecoDaPaginaDaVaga(vaga.slug)}`;

  if (vaga.modalidade === MODALIDADE_REMOTA) {
    dados.jobLocationType = "TELECOMMUTE";
    dados.applicantLocationRequirements = { "@type": "Country", name: "Brasil" };
  } else {
    dados.jobLocation = {
      "@type": "Place",
      address: enderecoPostalDaLocalizacao(vaga.localizacao),
    };
  }
  return dados;
}
