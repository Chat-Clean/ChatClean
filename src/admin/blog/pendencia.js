/**
 * A alteração pendente: o que ainda não foi salvo, e o que se diz sobre isso.
 *
 * Salvar é sempre explícito — não há salvamento automático, nem em intervalo
 * nem ao sair. O preço disso é que fechar a aba no momento errado apaga o que
 * foi escrito, e é este módulo que paga o preço: ele diz, a qualquer instante,
 * se o que está na tela difere do que foi gravado por último.
 *
 * ─── POR QUE A PERGUNTA SÓ APARECE COM PENDÊNCIA ───────────────────────────
 *
 * Uma confirmação que aparece sempre é treinada em duas semanas: a pessoa
 * aprende a clicar em "sair" sem ler, e no dia em que havia trabalho de verdade
 * ela clica igual. A pergunta só protege enquanto for rara — por isso a
 * pendência é rastreada de verdade, comparando conteúdo, e não presumida a
 * partir de "houve algum evento na tela".
 *
 * ─── POR QUE A COMPARAÇÃO É CANÔNICA ──────────────────────────────────────
 *
 * O documento do Editor e os valores da gaveta são objetos, e a igualdade de
 * objeto em JavaScript é de identidade: `{a:1} !== {a:1}`. Comparar por
 * referência acusaria pendência a cada renderização. Comparar por
 * `JSON.stringify` cru acusaria pendência quando só a ORDEM das chaves mudasse
 * — e ela muda: o Postgres devolve `jsonb` com as chaves reordenadas, então o
 * documento que volta do banco é o mesmo documento com outra serialização. A
 * ordem de chave em JSON não carrega significado; a de array carrega, e por
 * isso arrays são preservados como estão.
 *
 * As funções são puras e importáveis fora do navegador, que é o que permite à
 * verificação exercitá-las em vez de ler a intenção delas.
 */

/**
 * Serializa com as chaves de objeto em ordem estável, preservando arrays.
 *
 * `undefined` dentro de objeto some na serialização (é o que `JSON.stringify`
 * já faz), e isso é desejado: um campo ausente e um campo `undefined` são a
 * mesma ausência para quem edita.
 */
function canonico(valor) {
  if (valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map(canonico);
  const saida = {};
  for (const chave of Object.keys(valor).sort()) {
    if (valor[chave] === undefined) continue;
    saida[chave] = canonico(valor[chave]);
  }
  return saida;
}

/**
 * O retrato do que está na tela: a gaveta mais o corpo do Post.
 *
 * O retrato é uma **string**, e não um objeto, de propósito: guardá-lo em
 * estado do React sem risco de alguém mutá-lo por engano, e compará-lo com
 * `===`, é o que mantém o rastreamento barato o bastante para rodar a cada
 * tecla num documento de 20 mil caracteres.
 */
export function instantaneo(valores, documento) {
  return JSON.stringify(canonico({ valores: valores ?? null, documento: documento ?? null }));
}

/**
 * Há alteração pendente?
 *
 * `referencia` é o retrato do último estado salvo — ou do estado em que o Post
 * foi aberto, que é o mesmo estado do banco. `null` significa "ainda não sei o
 * que está gravado" (a tela ainda está carregando), e nesse caso não há
 * pendência: perguntar antes de a tela ter conteúdo é a confirmação inútil que
 * ensina a ignorar confirmações.
 */
export function haPendencia(atual, referencia) {
  if (typeof referencia !== "string") return false;
  return atual !== referencia;
}

/* ─── O que se diz ao sair ──────────────────────────────────────────────── */

export const TITULO_DA_SAIDA = "Sair sem salvar?";

/**
 * A consequência, factual e sem alarme: o que se perde, e por quê.
 *
 * O post é nomeado — a confirmação que não diz sobre o que está perguntando
 * obriga a pessoa a lembrar em qual aba ela estava.
 */
export function descricaoDaSaida(titulo) {
  const nome = String(titulo ?? "").trim();
  const alvo = nome === "" ? "deste post" : `de “${nome}”`;
  return (
    `As alterações ${alvo} feitas desde o último salvamento serão descartadas. ` +
    "O Painel não salva sozinho: volte e use Salvar para guardá-las."
  );
}

/** O rótulo diz o que o botão faz, e o que ele faz é sair perdendo o trabalho. */
export const ROTULO_PARA_SAIR = "Sair sem salvar";

/** E o caminho seguro diz para onde ele leva de volta. */
export const ROTULO_PARA_FICAR = "Continuar editando";
