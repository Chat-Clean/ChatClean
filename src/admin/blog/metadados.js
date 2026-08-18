/**
 * Os metadados do Post, do lado da tela: quais campos existem, como eles saem
 * de um Post gravado e como voltam para a função de escrita.
 *
 * Vive em módulo próprio, e não dentro de `GavetaDeMetadados.jsx`, pela mesma
 * razão que `conteudo.js` vive fora de `Editor.jsx`: arquivo de componente que
 * exporta função perde a recarga rápida em desenvolvimento, e o lint cobra. As
 * funções também são **puras** — a verificação as importa e executa sem montar
 * React nenhum, que é a única forma de provar a regra do Slug em vez de a ler.
 */

import { deCampoDeInstante, paraCampoDeInstante } from "@/domain/blog/formato";

/**
 * Os sete campos da gaveta, na ordem em que ela os oferece.
 *
 * A ordem é significativa e está declarada uma vez: Título e Slug primeiro
 * porque um gera o outro; Resumo em seguida porque é o segundo obrigatório; e a
 * classificação depois, porque ela é escolha e não escrita.
 */
export const CAMPOS_DA_GAVETA = Object.freeze([
  "titulo",
  "slug",
  "resumo",
  "categoria_id",
  "tags",
  "publicado_em",
  "tempo_leitura",
]);

/**
 * Os que a gravação exige.
 *
 * A lista existe aqui **e** na função de servidor, e as duas são comparadas pela
 * verificação: a tela precisa saber o que marcar como obrigatório antes de
 * mandar, e o servidor precisa recusar de qualquer jeito — inclusive de quem não
 * passou pela tela.
 */
export const CAMPOS_OBRIGATORIOS = Object.freeze(["titulo", "resumo"]);

/**
 * A frase de cada campo que falta.
 *
 * Uma por campo, e não uma genérica: "preencha os campos obrigatórios" obriga a
 * pessoa a percorrer a gaveta procurando qual é. `conteudo` está aqui mesmo não
 * sendo campo da gaveta porque a função de servidor pode nomeá-lo como faltante,
 * e a tela precisa ter o que dizer quando isso acontecer.
 */
export const FRASES_DE_FALTA = Object.freeze({
  titulo: "O título é obrigatório: é ele que nomeia o post na listagem e no site.",
  resumo: "O resumo é obrigatório: é ele que aparece no cartão da listagem e na busca.",
  slug: "O endereço é obrigatório: é por ele que o post é encontrado no site.",
  conteudo: "O post precisa de conteúdo antes de ser salvo.",
});

/** A gaveta de um Post que ainda não existe. */
export function valoresVazios() {
  return {
    titulo: "",
    slug: "",
    resumo: "",
    categoria_id: "",
    tags: [],
    publicado_em: "",
    tempo_leitura: "",
  };
}

/**
 * Os valores da gaveta a partir de uma linha de `posts`.
 *
 * Tudo vira **texto**, inclusive o número: um campo controlado do React com
 * `value={null}` passa a não controlado no meio da digitação, e o aviso disso
 * aparece no console muito depois de o defeito ter acontecido.
 *
 * `publicado_em` é o único que converte, e converte para hora de parede em São
 * Paulo — é o que o campo de data e hora mostra. O instante em UTC continua
 * sendo o que está gravado.
 */
export function valoresDoPost(post, tags = []) {
  if (post === null || typeof post !== "object") return valoresVazios();
  return {
    titulo: typeof post.titulo === "string" ? post.titulo : "",
    slug: typeof post.slug === "string" ? post.slug : "",
    resumo: typeof post.resumo === "string" ? post.resumo : "",
    categoria_id: typeof post.categoria_id === "string" ? post.categoria_id : "",
    tags: Array.isArray(tags) ? tags.map((t) => String(t?.id ?? t)) : [],
    publicado_em: post.publicado_em ? paraCampoDeInstante(post.publicado_em) : "",
    tempo_leitura:
      Number.isFinite(Number(post.tempo_leitura)) && Number(post.tempo_leitura) > 0
        ? String(post.tempo_leitura)
        : "",
  };
}

/**
 * O corpo do pedido de gravação.
 *
 * Devolve `{ ok: true, corpo }` ou `{ ok: false, campo, motivo }` — a recusa
 * nomeia o CAMPO para que a gaveta possa apontá-lo, em vez de a tela mostrar uma
 * frase solta no rodapé.
 *
 * **`estado` é o DESTINO da ação escolhida** (Story 2.8), e não um campo da
 * gaveta: ele vem da máquina de transições, que é quem sabe para onde cada ação
 * leva. Omiti-lo é dizer ao servidor "fique onde está". Quem decide se a
 * mudança é permitida é o servidor, contra a mesma máquina — a tela não oferecer
 * o botão é conveniência, não garantia.
 *
 * Autor continua de fora: ele é resolvido no servidor, sempre.
 */
export function corpoDoPedido({ id = null, valores, documento, estado = null }) {
  const v = valores ?? valoresVazios();

  let publicado_em = null;
  try {
    publicado_em = deCampoDeInstante(v.publicado_em);
  } catch (erro) {
    return {
      ok: false,
      campo: "publicado_em",
      motivo:
        "A data de publicação não é um momento válido. Informe dia e hora — o horário é o de Brasília.",
      detalhe: String(erro?.message ?? erro),
    };
  }

  const minutos = String(v.tempo_leitura ?? "").trim();
  if (minutos !== "" && !/^\d{1,4}$/.test(minutos)) {
    return {
      ok: false,
      campo: "tempo_leitura",
      motivo: "O tempo de leitura é um número inteiro de minutos.",
    };
  }

  const corpo = {
    titulo: String(v.titulo ?? "").trim(),
    slug: String(v.slug ?? "").trim(),
    resumo: String(v.resumo ?? "").trim(),
    conteudo: documento,
    categoria_id: String(v.categoria_id ?? "").trim() === "" ? null : v.categoria_id,
    tags: Array.isArray(v.tags) ? [...v.tags] : [],
    publicado_em,
    tempo_leitura: minutos === "" ? 0 : Number(minutos),
  };
  if (id) corpo.id = id;
  if (estado) corpo.estado = estado;
  return { ok: true, corpo };
}

/**
 * Os campos vazios entre os obrigatórios, **antes** de o pedido sair.
 *
 * A função de servidor recusa do mesmo jeito, e é ela que decide de verdade —
 * inclusive para quem chama a API direto. O que esta faz é evitar a viagem: o
 * Autor que esqueceu o resumo vê a marca no campo sem esperar o servidor
 * responder.
 */
export function faltandoNaGaveta(valores) {
  const v = valores ?? {};
  return CAMPOS_OBRIGATORIOS.filter((campo) => String(v[campo] ?? "").trim() === "");
}

/**
 * A data de publicação em hora de parede de São Paulo, como texto legível.
 *
 * O valor de entrada é o do próprio campo (`AAAA-MM-DDTHH:MM`), que já está em
 * hora de São Paulo: reformatá-lo fecha o ciclo e mostra, na tela, que o que se
 * digita é o que se lê. Valor parcial — o navegador entrega valores incompletos
 * enquanto a pessoa digita — vira uma frase, nunca uma exceção.
 */
export function textoDaDataDoCampo(valorDoCampo) {
  if (!valorDoCampo) return "— sem data de publicação";
  const casou = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(valorDoCampo));
  if (!casou) return "— data incompleta";
  const [, ano, mes, dia, hora, minuto] = casou;
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}
