/**
 * As regras da Vaga que não são Estado: limites, Link de Candidatura, o que
 * uma Vaga precisa ter para ficar Aberta, e o Slug.
 *
 * Domínio puro. Cada regra aqui tem um espelho no banco
 * (`supabase/migrations/20260924120000_vagas_e_classificacoes.sql`, com o link e
 * o invariante da Aberta refeitos em `20260924140000_descricao_e_link_estritos.sql`), e a
 * ferramenta `verificar:carreiras` confere os dois lados sobre os mesmos
 * casos: o Painel recusa com frase, o servidor recusa com 422, e o banco
 * recusa o que escapar.
 */

import { FORMATO_DE_SLUG, TAMANHO_MAXIMO_DO_SLUG, gerarSlug } from "../blog/slug.js";

/**
 * O formato do Slug e a frase que o explica, os MESMOS do Post (a regra do
 * endereço é uma só). Reexportados daqui (Story 5.4) para o formulário de Vaga
 * julgar o endereço pela regra do domínio sem importar `domain/blog/slug`,
 * que fica fora da lista de permissão de `admin/carreiras`.
 */
export { FORMATO_DE_SLUG, problemaNoSlug } from "../blog/slug.js";
import { decodificarEntidades, textoDoDocumento } from "../blog/schema.js";
import { ehModalidade, MODALIDADE_REMOTA, rotuloDaModalidade } from "./classificacoes.js";
import { ehEstadoDaVaga, ESTADO_INICIAL_DA_VAGA, rotuloDoEstadoDaVaga } from "./estados.js";

/**
 * Os tetos, em caracteres (pontos de código, como o `char_length` do banco).
 * Cada um é o de um CHECK de `public.vagas`.
 */
export const LIMITES_DA_VAGA = Object.freeze({
  titulo: 120,
  slug: TAMANHO_MAXIMO_DO_SLUG,
  resumo: 200,
  localizacao: 80,
  link_de_candidatura: 2048,
});

/** Quantos caracteres, contando por ponto de código. */
export function tamanhoEmCaracteres(valor) {
  return typeof valor === "string" ? [...valor].length : 0;
}

/** Tem ao menos um caractere que não é espaço? */
function preenchido(valor) {
  return typeof valor === "string" && /\S/u.test(valor);
}

/* ─── Link de Candidatura ────────────────────────────────────────────────── */

/**
 * O caractere é controle (C0 ou C1) ou espaço de qualquer espécie?
 *
 * Por PONTO DE CÓDIGO e não por faixa numa expressão regular: caractere de
 * controle escrito num literal de regex é invisível na revisão, e o lint o
 * proíbe. C0 é 0x00 a 0x1F, DEL é 0x7F, C1 é 0x80 a 0x9F; o espaço é o `\s`
 * do Unicode (inclui NBSP, os espaços de largura fixa, 0x2028, 0x2029 e
 * 0xFEFF). O CHECK do banco lista o mesmo conjunto, caractere a caractere.
 */
function controleOuEspaco(caractere) {
  const ponto = caractere.codePointAt(0);
  return ponto <= 0x20 || (ponto >= 0x7f && ponto <= 0x9f) || /\s/u.test(caractere);
}

/**
 * O Link de Candidatura é aceitável?
 *
 * Só endereço ABSOLUTO `http` ou `https` (caixa do esquema indiferente), com
 * `//` seguido de um host, até 2048 caracteres, sem espaço de espécie nenhuma
 * e sem caractere de controle C0 ou C1. `mailto:`, `javascript:`, `data:`,
 * `ftp:`, endereço relativo e as formas relativas disfarçadas (`https:x`,
 * `http:/x`, `https:///x`) ficam de fora: o botão Candidatar-se abre o link
 * numa aba nova, e ele precisa ser uma página de outro lugar.
 *
 * O formato é o MESMO do CHECK `vagas_link_de_candidatura_valido` refeito em
 * `20260924140000_descricao_e_link_estritos.sql`: esquema, `//`, primeiro
 * caractere do host que não é barra, e nenhum controle ou espaço até o fim.
 * Por cima dele o endereço precisa ser entendido pelo analisador de URL com um
 * host: o domínio pode ser MAIS estrito que o banco, nunca mais frouxo. Nunca
 * lança.
 */
export function linkDeCandidaturaValido(valor) {
  if (typeof valor !== "string") return false;
  if (tamanhoEmCaracteres(valor) > LIMITES_DA_VAGA.link_de_candidatura) return false;
  for (const caractere of valor) {
    if (controleOuEspaco(caractere)) return false;
  }
  if (!/^https?:\/\/[^/]/i.test(valor)) return false;
  try {
    const url = new URL(valor);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
  } catch {
    return false;
  }
}

/* ─── O que a Vaga Aberta precisa ter ────────────────────────────────────── */

/**
 * Os campos que uma Vaga Aberta sempre tem, na ordem do formulário. É a lista
 * FECHADA que `problemasParaAbrir` devolve: nada fora dela aparece.
 *
 * As chaves são os NOMES DAS COLUNAS de `public.vagas` (revisão da Story 5.3):
 * o `faltando` da função de escrita junta esta lista com a recusa da leitura
 * do corpo, e as duas falam o mesmo vocabulário, o da coluna. Antes as três
 * Classificações saíam daqui como `departamento`, `tipo` e `nivel`, e dois
 * nomes para o mesmo campo obrigavam a tela a traduzir.
 */
export const CAMPOS_PARA_ABRIR = Object.freeze([
  "titulo",
  "slug",
  "departamento_id",
  "tipo_id",
  "nivel_id",
  "modalidade",
  "resumo",
  "descricao",
  "link_de_candidatura",
  "localizacao",
]);

/** Como cada campo é chamado para quem preenche. */
export const ROTULOS_DOS_CAMPOS = Object.freeze({
  titulo: "Título",
  slug: "Endereço",
  departamento_id: "Departamento",
  tipo_id: "Tipo",
  nivel_id: "Nível",
  modalidade: "Modalidade",
  resumo: "Resumo",
  descricao: "Descrição",
  link_de_candidatura: "Link de Candidatura",
  localizacao: "Localização",
});

/**
 * A Descrição tem texto de verdade?
 *
 * Com o documento em mãos, quem responde é o DOCUMENTO: o HTML é derivado
 * dele, e um HTML com texto ao lado de um documento vazio é um par torto, não
 * uma Descrição preenchida. Quando vem também o HTML, ele precisa concordar:
 * sem as etiquetas e com as entidades DECODIFICADAS (`&nbsp;` e `&#32;` são
 * espaço), ainda sobra um caractere que não é espaço. É a mesma conta do
 * CHECK `vagas_aberta_completa`, que só enxerga o HTML.
 */
function descricaoPreenchida(vaga) {
  const temDocumento = vaga?.descricao !== null && typeof vaga?.descricao === "object";
  const temHtml = typeof vaga?.descricao_html === "string";
  if (!temDocumento && !temHtml) return false;
  if (temDocumento && !preenchido(textoDoDocumento(vaga.descricao))) return false;
  if (temHtml && !preenchido(decodificarEntidades(vaga.descricao_html.replace(/<[^>]*>/g, "")))) {
    return false;
  }
  return true;
}

/** Cabe no teto do campo? Valor ausente cabe: a falta é a outra conta. */
function cabe(valor, teto) {
  return typeof valor !== "string" || tamanhoEmCaracteres(valor) <= teto;
}

function identificador(valor) {
  return typeof valor === "string" && valor.trim() !== "";
}

/**
 * O que falta para esta Vaga poder ficar Aberta, na ordem de
 * `CAMPOS_PARA_ABRIR`. Lista vazia quer dizer "pode abrir".
 *
 * Espelha o CHECK `vagas_aberta_completa` (mais os de formato do Slug e do
 * link e os de tamanho, que valem sempre): título e Resumo com texto e dentro
 * do teto de `LIMITES_DA_VAGA`, Localização dentro do teto, as três Classificações,
 * Modalidade do vocabulário, Descrição com texto, Link de Candidatura válido
 * e, se a Modalidade não for remota, Localização. Recebe a Vaga com os nomes
 * das colunas do banco. Nunca lança.
 */
export function problemasParaAbrir(vaga) {
  const v = vaga !== null && typeof vaga === "object" ? vaga : {};
  const faltam = new Set();
  if (!preenchido(v.titulo) || !cabe(v.titulo, LIMITES_DA_VAGA.titulo)) faltam.add("titulo");
  if (
    typeof v.slug !== "string" ||
    v.slug.length > LIMITES_DA_VAGA.slug ||
    !FORMATO_DE_SLUG.test(v.slug)
  ) {
    faltam.add("slug");
  }
  if (!identificador(v.departamento_id)) faltam.add("departamento_id");
  if (!identificador(v.tipo_id)) faltam.add("tipo_id");
  if (!identificador(v.nivel_id)) faltam.add("nivel_id");
  if (!ehModalidade(v.modalidade)) faltam.add("modalidade");
  if (!preenchido(v.resumo) || !cabe(v.resumo, LIMITES_DA_VAGA.resumo)) faltam.add("resumo");
  if (!descricaoPreenchida(v)) faltam.add("descricao");
  if (!linkDeCandidaturaValido(v.link_de_candidatura)) faltam.add("link_de_candidatura");
  if (v.modalidade !== MODALIDADE_REMOTA && !preenchido(v.localizacao)) {
    faltam.add("localizacao");
  }
  /* O teto da Localização vale para toda Modalidade, a remota inclusive: o
     CHECK `vagas_localizacao_tamanho` não olha a Modalidade. */
  if (!cabe(v.localizacao, LIMITES_DA_VAGA.localizacao)) faltam.add("localizacao");
  return Object.freeze(CAMPOS_PARA_ABRIR.filter((campo) => faltam.has(campo)));
}

/* ─── Slug ───────────────────────────────────────────────────────────────── */

/**
 * O Slug da Vaga, gerado do título pela MESMA regra do Post (`gerarSlug`).
 * Devolve o mesmo contrato: `{ ok: true, slug }` ou `{ ok: false, motivo }`.
 */
export function slugDaVaga(titulo) {
  return gerarSlug(titulo);
}

/* ─── O local e o endereço público ───────────────────────────────────────── */

/*
 * As duas funções moraram em `admin/carreiras/listagem.js` (Story 5.5) e
 * vieram para cá na Story 5.7: o Painel e o site público mostram o MESMO
 * local e apontam para o MESMO endereço, e uma regra que as duas telas usam
 * não pode morar numa delas.
 */

function textoAparado(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * "Híbrido · Natal, RN", "Remoto", ou vazio. Modalidade fora do vocabulário
 * não lança: `ehModalidade` é perguntado ANTES de `rotuloDaModalidade`, que
 * lança. A Localização vem aparada, e o que estiver vazio sai da frase.
 */
export function textoDoLocal(vaga) {
  const modalidade = ehModalidade(vaga?.modalidade) ? rotuloDaModalidade(vaga.modalidade) : "";
  return [modalidade, textoAparado(vaga?.localizacao)].filter((parte) => parte !== "").join(" · ");
}

/**
 * O endereço da página pública de um Slug: `/carreiras/<slug>`, com o Slug
 * codificado. Sem Slug, `null`. Não julga o Estado: quem pergunta pela
 * página de uma Vaga que o banco diz Aberta é a lista pública.
 */
export function enderecoDaPaginaDaVaga(slug) {
  const alvo = textoAparado(slug);
  return alvo === "" ? null : `/carreiras/${encodeURIComponent(alvo)}`;
}

/**
 * O endereço público da Vaga, só quando ela tem página: Aberta ou Encerrada,
 * que são os Estados de quem já passou da criação. O Rascunho nunca teve
 * endereço no site. Sem Slug, nada.
 */
export function enderecoPublicoDaVaga(vaga) {
  if (!ehEstadoDaVaga(vaga?.estado) || vaga.estado === ESTADO_INICIAL_DA_VAGA) return null;
  return enderecoDaPaginaDaVaga(vaga.slug);
}

/**
 * O título de reserva da Vaga Encerrada que veio sem título. Morou em
 * `src/pages/carreirasPublico.js` (Story 5.7) e veio para cá na Story 5.8: a
 * página do navegador e o HTML Servido mostram a MESMA frase, e o servidor
 * não importa de `src/pages`. A palavra vem do vocabulário do Estado.
 */
export const TITULO_DE_RESERVA_DA_ENCERRADA = `Vaga ${rotuloDoEstadoDaVaga("encerrada").toLowerCase()}`;

/**
 * O envio de currículo pelo WhatsApp, o MESMO do estado vazio de antes da
 * Story 5.7. Morou em `src/pages/carreirasPublico.js` e veio para cá na
 * revisão da Story 5.8: o HTML Servido da listagem sem vagas também o oferece,
 * e o servidor não importa `src/pages`. É a ÚNICA casa do número e da frase em
 * Carreiras; a página do navegador o reexporta.
 */
export const ENDERECO_DO_CURRICULO =
  "https://api.whatsapp.com/send?phone=5584998900718&text=Gostaria+de+enviar+meu+curr%C3%ADculo+para+futuras+oportunidades";
