/**
 * As regras do formulário de Vaga, puras (Story 5.4).
 *
 * Sem React e sem rede: a tela (`EditorDeVaga.jsx`) chama estas funções, e a
 * verificação as importa e executa no Node. Função pura não mora em arquivo de
 * componente (a recarga rápida quebra e o lint cobra).
 *
 * ─── A CHECAGEM LOCAL É A DO DOMÍNIO, NÃO UMA SEGUNDA ─────────────────────
 *
 * Os tetos são os de `LIMITES_DA_VAGA`, o link é julgado por
 * `linkDeCandidaturaValido`, e o nome de cada campo é o de
 * `ROTULOS_DOS_CAMPOS`: as MESMAS peças que o servidor usa. A checagem local
 * só evita a viagem; quem decide de verdade continua sendo o servidor, e a
 * resposta dele (`faltando`, conflito) é traduzida aqui, campo a campo.
 *
 * ─── O CORPO É MONTADO À MÃO ──────────────────────────────────────────────
 *
 * `corpoParaSalvar` nunca espalha `valores`: cada coluna é nomeada. `estado`
 * e `aberta_em` nunca viajam (o Estado muda só pela ação de Estado, e
 * `aberta_em` é do banco), e o Slug fica de fora quando está travado.
 *
 * ─── SEM MÓDULO DE DADOS AQUI DENTRO ──────────────────────────────────────
 *
 * Este módulo não importa `data/carreiras`: os tipos de erro chegam POR
 * PARÂMETRO, de quem chama (a tela os lê de `@/data/carreiras/*`, pelos
 * apelidos que a verificação troca por dublê). Um import relativo de lá
 * puxaria o módulo de dados REAL para dentro do pacote montado, por baixo do
 * dublê.
 */

import { documentoVazio } from "../../domain/blog/schema.js";
import { ESTADO_INICIAL_DA_VAGA } from "../../domain/carreiras/estados.js";
import { LISTAS_DE_CLASSIFICACAO } from "../../domain/carreiras/classificacoes.js";
import {
  FORMATO_DE_SLUG,
  LIMITES_DA_VAGA,
  ROTULOS_DOS_CAMPOS,
  linkDeCandidaturaValido,
  problemaNoSlug,
  slugDaVaga,
  tamanhoEmCaracteres,
} from "../../domain/carreiras/vaga.js";

/** Os campos de texto e de escolha do formulário, na ordem da tela. */
export const CAMPOS_DO_FORMULARIO = Object.freeze([
  "titulo",
  "slug",
  "departamento_id",
  "tipo_id",
  "nivel_id",
  "modalidade",
  "localizacao",
  "resumo",
  "link_de_candidatura",
]);

/** As colunas das três Classificações, na ordem do domínio. */
export const COLUNAS_DAS_CLASSIFICACOES = Object.freeze(
  LISTAS_DE_CLASSIFICACAO.map((lista) => lista.coluna),
);

/** Por que o Slug não se edita mais. Dito ao lado do campo. */
export const MOTIVO_DO_SLUG_TRAVADO =
  "O endereço ficou fixo quando a vaga foi aberta pela primeira vez: quem já tem o link continua chegando aqui.";

function texto(valor) {
  return typeof valor === "string" ? valor : "";
}

/** O formulário de uma Vaga que ainda não existe. */
export function valoresVazios() {
  return Object.fromEntries(CAMPOS_DO_FORMULARIO.map((campo) => [campo, ""]));
}

/** O formulário preenchido com a Vaga lida do banco. Nulo vira texto vazio. */
export function valoresDaVaga(vaga) {
  const v = vaga !== null && typeof vaga === "object" ? vaga : {};
  return Object.fromEntries(CAMPOS_DO_FORMULARIO.map((campo) => [campo, texto(v[campo])]));
}

/**
 * O que a tela mostra depois de salvar: o que o SERVIDOR gravou, campo a
 * campo, por cima do que está na tela. Campo que a resposta não traz continua
 * como estava, para nada do que foi digitado sumir por uma resposta parcial.
 *
 * Só os campos do formulário saem daqui (nada de `estado`, `aberta_em` ou
 * campo estranho vindo de qualquer um dos lados), e nulo vira texto vazio: o
 * campo nativo não mostra `null`.
 */
export function valoresGravados(valores, vaga) {
  const naTela = valores !== null && typeof valores === "object" ? valores : {};
  const doServidor = vaga !== null && typeof vaga === "object" ? vaga : {};
  return Object.fromEntries(
    CAMPOS_DO_FORMULARIO.map((campo) => [
      campo,
      texto(Object.hasOwn(doServidor, campo) ? doServidor[campo] : naTela[campo]),
    ]),
  );
}

/**
 * O Slug desta Vaga está travado? Depois da primeira abertura, sim: com
 * `aberta_em` preenchido, ou com o Estado fora do inicial (Rascunho). É a
 * mesma regra que o banco impõe, dita antes de a pessoa tentar.
 */
export function slugTravado(vaga) {
  if (vaga === null || typeof vaga !== "object") return false;
  if (typeof vaga.aberta_em === "string" && vaga.aberta_em.trim() !== "") return true;
  return typeof vaga.estado === "string" && vaga.estado !== ESTADO_INICIAL_DA_VAGA;
}

/** O Slug derivado do título pela regra do domínio, ou `""` quando não dá. */
export function slugDoTitulo(titulo) {
  const gerado = slugDaVaga(texto(titulo));
  return gerado.ok ? gerado.slug : "";
}

/**
 * Os campos opcionais que, vazios, viajam como `null`. É o contrato ÚNICO do
 * vazio: `api/_nucleo/operacoesDaVaga.js` aceita `null` nos quatro e grava
 * cada um na forma da coluna (`modalidade` e `link_de_candidatura` ficam
 * nulos; `localizacao` e `resumo`, texto vazio). Mandar `""` num e `null`
 * noutro seria dois jeitos de dizer "nada" no mesmo corpo.
 */
export const OPCIONAIS_NULOS_QUANDO_VAZIOS = Object.freeze([
  "modalidade",
  "localizacao",
  "resumo",
  "link_de_candidatura",
]);

const aparado = (valor) => texto(valor).trim();
const ouNulo = (valor) => (aparado(valor) === "" ? null : aparado(valor));

/**
 * O corpo do salvamento, coluna a coluna, todo texto aparado.
 *
 * `travado`: o Slug não viaja. `criando` com Slug vazio: ele não viaja, e o
 * servidor o deriva do título. Os opcionais vazios viajam como `null`
 * (`OPCIONAIS_NULOS_QUANDO_VAZIOS`). A Descrição vai sempre como documento (o
 * servidor recusa `null`): sem nada escrito, o documento vazio.
 */
export function corpoParaSalvar(valores, documento, { travado = false, criando = false } = {}) {
  const v = valores !== null && typeof valores === "object" ? valores : {};
  const corpo = {
    titulo: aparado(v.titulo),
    departamento_id: aparado(v.departamento_id),
    tipo_id: aparado(v.tipo_id),
    nivel_id: aparado(v.nivel_id),
    modalidade: ouNulo(v.modalidade),
    localizacao: ouNulo(v.localizacao),
    resumo: ouNulo(v.resumo),
    link_de_candidatura: ouNulo(v.link_de_candidatura),
    descricao:
      documento !== null && typeof documento === "object" ? documento : documentoVazio(),
  };
  if (!travado) {
    const slug = texto(v.slug).trim();
    if (slug !== "" || !criando) corpo.slug = slug;
  }
  return corpo;
}

/* ─── As frases de cada campo ────────────────────────────────────────────── */

const rotuloDe = (campo) => ROTULOS_DOS_CAMPOS[campo] ?? campo;

export function fraseDeObrigatorio(campo) {
  return COLUNAS_DAS_CLASSIFICACOES.includes(campo)
    ? `Escolha um ${rotuloDe(campo)} da lista.`
    : `Preencha o campo ${rotuloDe(campo)}.`;
}

export function fraseDeTamanho(campo, teto) {
  return `O campo ${rotuloDe(campo)} passa de ${teto} caracteres. Encurte antes de salvar.`;
}

export function fraseDoLink() {
  return (
    `O campo ${rotuloDe("link_de_candidatura")} precisa ser um endereço completo, ` +
    "começando com http:// ou https://."
  );
}

/** Reserva, caso a frase do domínio não venha: nunca campo marcado sem frase. */
export function fraseDoFormatoDoSlug() {
  return (
    `O campo ${rotuloDe("slug")} aceita apenas letras minúsculas sem acento, números ` +
    "e hífen entre palavras."
  );
}

/** A frase de uma Classificação gravada que não está mais na lista. */
export function fraseDaClassificacaoAusente(coluna) {
  return `O ${rotuloDe(coluna)} gravado não existe mais. Escolha um ${rotuloDe(coluna)} da lista.`;
}

/** A frase de um campo que o servidor devolveu em `faltando`. */
export function fraseDoServidor(campo) {
  return `O campo ${rotuloDe(campo)} precisa ser preenchido ou corrigido antes de continuar.`;
}

/**
 * O que impede salvar, como mapa de campo para frase. Vazio quer dizer "pode
 * enviar". As regras são as do domínio: título e as três Classificações
 * obrigatórios, os tetos de `LIMITES_DA_VAGA`, e o Link de Candidatura por
 * `linkDeCandidaturaValido` quando preenchido.
 */
export function problemasLocais(valores, { travado = false, criando = false } = {}) {
  const v = valores !== null && typeof valores === "object" ? valores : {};
  const problemas = {};

  if (texto(v.titulo).trim() === "") problemas.titulo = fraseDeObrigatorio("titulo");
  for (const coluna of COLUNAS_DAS_CLASSIFICACOES) {
    if (texto(v[coluna]).trim() === "") problemas[coluna] = fraseDeObrigatorio(coluna);
  }

  for (const campo of ["titulo", "slug", "resumo", "localizacao", "link_de_candidatura"]) {
    if (problemas[campo] || (campo === "slug" && travado)) continue;
    const teto = LIMITES_DA_VAGA[campo];
    if (tamanhoEmCaracteres(texto(v[campo]).trim()) > teto) {
      problemas[campo] = fraseDeTamanho(campo, teto);
    }
  }

  /* O Slug só é julgado quando viaja: travado, ele fica de fora do corpo. Na
     edição ele é obrigatório; na criação, vazio quer dizer "derive do título".
     Preenchido, o formato é o do domínio (`FORMATO_DE_SLUG`), com a frase do
     domínio (`problemaNoSlug`). */
  const slug = texto(v.slug).trim();
  if (!travado && !problemas.slug) {
    if (slug === "") {
      if (!criando) problemas.slug = fraseDeObrigatorio("slug");
    } else if (!FORMATO_DE_SLUG.test(slug)) {
      problemas.slug = problemaNoSlug(slug) ?? fraseDoFormatoDoSlug();
    }
  }

  const link = texto(v.link_de_candidatura).trim();
  if (!problemas.link_de_candidatura && link !== "" && !linkDeCandidaturaValido(link)) {
    problemas.link_de_candidatura = fraseDoLink();
  }

  return problemas;
}

/**
 * As Classificações carregadas, sempre como listas: o que não é lista vira
 * lista vazia, e item sem identificador de texto fica de fora. A tela desenha
 * daqui.
 */
export function classificacoesComoListas(lidas) {
  const origem = lidas !== null && typeof lidas === "object" ? lidas : {};
  return Object.fromEntries(
    LISTAS_DE_CLASSIFICACAO.map((lista) => [
      lista.tabela,
      Array.isArray(origem[lista.tabela])
        ? origem[lista.tabela].filter(
            (item) => item !== null && typeof item === "object" && typeof item.id === "string",
          )
        : [],
    ]),
  );
}

/**
 * As Classificações GRAVADAS que não estão mais na lista carregada, como mapa
 * de coluna para frase. Sem isto, o `<select>` mostraria o texto de escolha
 * por cima de um identificador oculto, e o salvar o mandaria de volta.
 */
export function classificacoesAusentes(valores, listas) {
  const v = valores !== null && typeof valores === "object" ? valores : {};
  const porTabela = classificacoesComoListas(listas);
  const ausentes = {};
  for (const lista of LISTAS_DE_CLASSIFICACAO) {
    const gravado = texto(v[lista.coluna]).trim();
    if (gravado === "") continue;
    if (!porTabela[lista.tabela].some((item) => item.id === gravado)) {
      ausentes[lista.coluna] = fraseDaClassificacaoAusente(lista.coluna);
    }
  }
  return ausentes;
}

/**
 * A resposta de erro do servidor como mapa de campo para frase.
 *
 * Cada campo de `faltando` que o domínio sabe nomear vira uma marca com a
 * frase do rótulo dele; o conflito marca o Slug com a frase do servidor.
 * O resto não tem campo: vai só para a notificação, por quem chama.
 *
 * `tipoDeConflito` chega de quem chama (a tela o lê de
 * `@/data/carreiras/escrita`). Sem ele, nenhum erro é tomado por conflito.
 */
export function errosDoServidor(erro, { tipoDeConflito = null } = {}) {
  const marcas = {};
  if (erro === null || typeof erro !== "object") return marcas;
  if (Array.isArray(erro.faltando)) {
    for (const campo of erro.faltando) {
      if (typeof campo === "string" && Object.hasOwn(ROTULOS_DOS_CAMPOS, campo)) {
        marcas[campo] = fraseDoServidor(campo);
      }
    }
  }
  if (typeof tipoDeConflito === "string" && erro.tipo === tipoDeConflito) {
    marcas.slug =
      typeof erro.mensagem === "string" && erro.mensagem.trim() !== ""
        ? erro.mensagem
        : fraseDoServidor("slug");
  }
  return marcas;
}

/**
 * A leitura disse que a Vaga não existe (e não que a leitura falhou)?
 * `tipoNaoEncontrado` chega de quem chama (de `@/data/carreiras/leitura`).
 */
export function vagaInexistente(erro, tipoNaoEncontrado) {
  return (
    typeof tipoNaoEncontrado === "string" &&
    erro !== null &&
    typeof erro === "object" &&
    erro.tipo === tipoNaoEncontrado
  );
}

/**
 * A falha pede "Tentar de novo"? Só a PASSAGEIRA, e `tiposPassageiros` chega
 * de quem chama. A tela passa `rede` e `inesperado` (queda, prazo, 5xx,
 * resposta ilegível, exceção: repetir pode dar certo). `configuracao`,
 * `permissao`, `dados_invalidos`, `conflito` e `nao_encontrado` NÃO: repetir o
 * mesmo pedido daria a mesma recusa, e o botão ensinaria a apertar à toa.
 */
export function falhaPassageira(erro, tiposPassageiros) {
  return (
    Array.isArray(tiposPassageiros) &&
    erro !== null &&
    typeof erro === "object" &&
    typeof erro.tipo === "string" &&
    tiposPassageiros.includes(erro.tipo)
  );
}

/** A frase de uma falha, com reserva quando o servidor não mandou nenhuma. */
export function mensagemDaFalha(erro, reserva) {
  const mensagem = erro !== null && typeof erro === "object" ? erro.mensagem : null;
  return typeof mensagem === "string" && mensagem.trim() !== "" ? mensagem : reserva;
}
