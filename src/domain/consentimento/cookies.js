/**
 * O consentimento de cookies, em regra pura.
 *
 * Sem React, sem `localStorage`, sem rede: só o vocabulário das categorias e as
 * regras de quando perguntar. Quem toca no armazenamento do navegador é
 * `src/lib/consentimento.js`; quem desenha é `AvisoDeCookies.jsx`.
 *
 * ─── AS CATEGORIAS DESCREVEM O QUE O SITE FAZ DE VERDADE ─────────────────
 *
 * A tentação é declarar as quatro categorias de sempre — essenciais,
 * desempenho, funcionalidade, marketing — porque é o que todo banner declara.
 * Seria mentira: este site não tem analytics. Declarar categoria que não existe
 * é pedir consentimento para nada e enfraquecer o consentimento do que existe.
 *
 * O que existe hoje:
 *
 *   ESSENCIAIS   a própria decisão registrada aqui, e a sessão do Painel.
 *                Não são opcionais, e a lei não exige consentimento para elas.
 *   PREFERENCIAS o que o site lembra por conveniência — o rascunho do
 *                formulário de contratação, o dimensionamento escolhido.
 *   MARKETING    o Meta Pixel. É o único rastreador de terceiro do site.
 *
 * Quando entrar analytics, entra categoria nova aqui, a versão sobe, e todo
 * mundo é perguntado de novo. É para isso que a versão existe.
 *
 * ─── O SILÊNCIO É RECUSA ─────────────────────────────────────────────────
 *
 * `decisaoPadrao()` devolve tudo opcional em `false`. Quem não respondeu não
 * consentiu — "ao continuar navegando você concorda" não é consentimento sob a
 * LGPD, que exige manifestação livre, informada e inequívoca. Enquanto a
 * pessoa não decide, o Pixel não carrega.
 */

/** As categorias, na ordem em que aparecem no painel. */
export const CATEGORIAS = Object.freeze([
  {
    id: "essenciais",
    nome: "Essenciais",
    resumo:
      "Guardam a sua escolha aqui e mantêm você conectado no Painel. Sem elas o site não funciona.",
    obrigatoria: true,
  },
  {
    id: "preferencias",
    nome: "Preferências",
    resumo:
      "Lembram o que você já preencheu, como o rascunho do formulário de contratação, para não recomeçar do zero.",
    obrigatoria: false,
  },
  {
    id: "marketing",
    nome: "Marketing",
    resumo:
      "Meta Pixel, o único rastreador de terceiro do site, e a lembrança de qual anúncio trouxe você — guardada por até 90 dias, no seu navegador.",
    obrigatoria: false,
  },
]);

export const IDS_DAS_CATEGORIAS = Object.freeze(CATEGORIAS.map((c) => c.id));

export const CATEGORIAS_OPCIONAIS = Object.freeze(
  CATEGORIAS.filter((c) => !c.obrigatoria).map((c) => c.id),
);

/**
 * A versão do texto e das categorias.
 *
 * Subir esta constante faz todo mundo ser perguntado de novo. Suba quando
 * mudar o QUE é coletado — categoria nova, rastreador novo — e não quando
 * mudar a cor do botão.
 */
export const VERSAO = "2026-09-04";

/** Onde a decisão fica no navegador. */
export const CHAVE_DE_ARMAZENAMENTO = "chatclean.consentimento";

/** Tudo opcional recusado. O estado de quem ainda não respondeu. */
export function decisaoPadrao() {
  return {
    versao: VERSAO,
    decididoEm: null,
    essenciais: true,
    preferencias: false,
    marketing: false,
  };
}

/** Aceitar tudo. */
export function decisaoTotal(agora = new Date()) {
  return {
    versao: VERSAO,
    decididoEm: agora.toISOString(),
    essenciais: true,
    preferencias: true,
    marketing: true,
  };
}

/** Recusar tudo que é opcional. */
export function decisaoMinima(agora = new Date()) {
  return {
    versao: VERSAO,
    decididoEm: agora.toISOString(),
    essenciais: true,
    preferencias: false,
    marketing: false,
  };
}

/** Uma escolha campo a campo, com os opcionais que vierem marcados. */
export function decisaoEscolhida(escolhas = {}, agora = new Date()) {
  const decisao = {
    versao: VERSAO,
    decididoEm: agora.toISOString(),
    essenciais: true,
  };
  for (const id of CATEGORIAS_OPCIONAIS) {
    decisao[id] = escolhas[id] === true;
  }
  return decisao;
}

/**
 * Lê o que estava guardado.
 *
 * Recebe texto porque não conhece `localStorage`. Qualquer coisa que não seja
 * uma decisão íntegra da versão corrente vira o padrão — recusa. Texto
 * corrompido, versão antiga, chave apagada pela metade: em todos os casos a
 * resposta é perguntar de novo, nunca presumir consentimento.
 */
export function interpretar(texto) {
  if (typeof texto !== "string" || texto === "") return decisaoPadrao();

  let lido;
  try {
    lido = JSON.parse(texto);
  } catch {
    return decisaoPadrao();
  }

  if (typeof lido !== "object" || lido === null || Array.isArray(lido)) {
    return decisaoPadrao();
  }
  if (lido.versao !== VERSAO) return decisaoPadrao();
  if (typeof lido.decididoEm !== "string" || lido.decididoEm === "") {
    return decisaoPadrao();
  }

  const decisao = {
    versao: VERSAO,
    decididoEm: lido.decididoEm,
    essenciais: true,
  };
  for (const id of CATEGORIAS_OPCIONAIS) {
    decisao[id] = lido[id] === true;
  }
  return decisao;
}

/** O texto a guardar. */
export function serializar(decisao) {
  return JSON.stringify(decisao);
}

/** Ainda não houve resposta desta versão? Então pergunte. */
export function precisaPerguntar(decisao) {
  return (
    !decisao ||
    decisao.versao !== VERSAO ||
    typeof decisao.decididoEm !== "string" ||
    decisao.decididoEm === ""
  );
}

/** A categoria foi consentida? Obrigatória é sempre sim. */
export function consentiu(decisao, categoria) {
  if (categoria === "essenciais") return true;
  return decisao?.[categoria] === true;
}
