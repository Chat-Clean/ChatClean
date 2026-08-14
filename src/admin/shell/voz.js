/**
 * A voz do Painel, em funções puras e importáveis.
 *
 * Vive fora dos componentes por um motivo prático: enquanto estas regras eram
 * texto dentro de um `.jsx`, a verificação só conseguia olhá-las por regex — e
 * regex sobre o texto de uma regra não verifica a regra. Apagar
 * `.replace(/\p{Diacritic}/gu, "")` de `normalizar` deixaria "Não foi possível"
 * de fora da lista de vaguidão (e em pt-BR quase toda vaguidão é acentuada) sem
 * mexer numa vírgula do que as regexes procuravam. Aqui as funções são
 * executadas caso a caso, como já acontece com `estados.js` e `formato.js`.
 *
 * O que cada camada faz:
 *   `normalizar`                — reduz o texto à forma comparável;
 *   `diagnosticar*`             — PURAS: devolvem o problema ou `null`;
 *   `exigir`                    — a política: lança em desenvolvimento,
 *                                 registra e segue em produção.
 *
 * **Por que a política não é sempre `throw`.** Uma violação de voz é erro de
 * programação e precisa doer — mas doer no desenvolvimento, não na cara do
 * Autor. Lançar dentro do render, ou dentro do `catch` que ia mostrar uma
 * mensagem de erro, derruba a árvore React inteira: o Painel vira tela branca e
 * o trabalho em aberto vai junto. Em produção o defeito fica registrado no
 * console e a interface degrada — uma mensagem ruim ainda é melhor que
 * nenhuma, e "nunca silêncio" é regra da matriz.
 */

/* `import.meta.env` é do Vite e não existe no Node, que é onde a verificação
   executa estas funções. Ler com guarda mantém o módulo importável nos dois. */
const ambiente = typeof import.meta === "undefined" ? undefined : import.meta.env;

/** Verdadeiro apenas no servidor de desenvolvimento. */
export const EM_DESENVOLVIMENTO = Boolean(ambiente && ambiente.DEV);

/**
 * Minúsculas, sem acento, espaço colapsado, sem pontuação de fim.
 *
 * A ordem importa e já esteve errada: cortar a pontuação ANTES de aparar deixa
 * `"Erro! "` intacto, porque o `$` do padrão não alcança a pontuação com um
 * espaço depois — e a mensagem vazia de conteúdo passava direto pela guarda.
 * Apara primeiro, corta depois, apara de novo.
 */
export function normalizar(texto) {
  return String(texto)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.!?…:;,]+$/u, "")
    .trim();
}

/** A frase aparece no texto como sequência inteira de palavras? */
function contemFrase(texto, frase) {
  const escapada = frase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapada}($|[^\\p{L}\\p{N}])`,
    "u",
  ).test(texto);
}

/**
 * Vaguidão que contamina a frase inteira onde aparecer. "Ops, algo deu errado"
 * não fica melhor por ter uma vírgula: continua sem dizer o que houve.
 */
export const VAGUIDADES_CONTIDAS = Object.freeze([
  "ops",
  "opa",
  "algo deu errado",
  "alguma coisa deu errado",
  "ocorreu um erro",
  "erro inesperado",
  "erro desconhecido",
]);

/**
 * Vaguidão apenas quando é a mensagem TODA. "Não foi possível" sozinho não diz
 * nada; "Não foi possível excluir o post porque ele já saiu" diz — e reprovar a
 * segunda por causa da primeira empurraria o autor de volta para o genérico.
 */
export const VAGUIDADES_EXATAS = Object.freeze([
  "ok",
  "pronto",
  "feito",
  "sucesso",
  "erro",
  "falha",
  "falhou",
  "nao foi possivel",
  "tente novamente",
  "tente de novo",
]);

/**
 * O problema da mensagem, ou `null` se ela está de pé.
 * @param {string} rotuloDoArgumento  qual metade está sendo conferida
 */
export function diagnosticarMensagem(rotuloDoArgumento, texto) {
  if (typeof texto !== "string" || texto.trim() === "") {
    return (
      `Notificação sem ${rotuloDoArgumento}: recebido ${JSON.stringify(texto)}. ` +
      "Toda notificação precisa nomear o que aconteceu."
    );
  }

  const normalizado = normalizar(texto);

  if (VAGUIDADES_EXATAS.includes(normalizado)) {
    return (
      `Notificação vaga em ${rotuloDoArgumento}: ${JSON.stringify(texto)}. ` +
      'Diga o que aconteceu ("Post salvo") ou o que fazer ' +
      '("Confira a conexão e salve de novo").'
    );
  }

  const contida = VAGUIDADES_CONTIDAS.find((frase) =>
    contemFrase(normalizado, frase),
  );
  if (contida) {
    return (
      `Notificação vaga em ${rotuloDoArgumento}: ${JSON.stringify(texto)} ` +
      `contém "${contida}", que não diz nada sobre o que houve.`
    );
  }

  return null;
}

/**
 * Rótulos que não dizem o que o botão faz.
 *
 * **Âmbito: o botão de ação do diálogo de confirmação**, não todo botão do
 * Painel. É no diálogo que o rótulo carrega a decisão — a pessoa lê o botão,
 * não o parágrafo, antes de clicar. Por isso "Salvar" está na lista mesmo com o
 * formulário do Painel tendo um botão "Salvar": lá o contexto é a tela inteira
 * de edição de um Post, e o formulário é do Épico 2, fora do alcance desta
 * entrega. Num diálogo, "Salvar" sozinho não diz o que será salvo.
 */
export const ROTULOS_GENERICOS = Object.freeze([
  "ok",
  "sim",
  "nao",
  "confirmar",
  "confirmo",
  "enviar",
  "continuar",
  "prosseguir",
  "salvar",
  "aplicar",
  "concluir",
  "excluir",
  "restaurar",
  "remover",
  "apagar",
]);

/**
 * Palavras que não acrescentam objeto ao verbo. Sem elas, "Confirmar ação"
 * seria aceito por não bater exatamente com "confirmar" — e é a mesma falta de
 * informação com uma palavra a mais.
 */
const ENCHIMENTOS = new Set([
  "a",
  "o",
  "as",
  "os",
  "acao",
  "acoes",
  "operacao",
  "isso",
  "agora",
  "tudo",
  "item",
  "mudanca",
  "mudancas",
  "alteracao",
  "alteracoes",
]);

/** O problema do rótulo de ação, ou `null` se ele nomeia o que faz. */
export function diagnosticarRotuloDeAcao(rotulo) {
  if (typeof rotulo !== "string" || rotulo.trim() === "") {
    return `Diálogo de confirmação sem rótulo de ação: recebido ${JSON.stringify(rotulo)}.`;
  }

  const essencia = normalizar(rotulo)
    .split(" ")
    .filter((palavra) => !ENCHIMENTOS.has(palavra))
    .join(" ");

  if (essencia === "" || ROTULOS_GENERICOS.includes(essencia)) {
    return (
      `Rótulo genérico no diálogo de confirmação: ${JSON.stringify(rotulo)}. ` +
      'Diga o que o botão faz ("Excluir post", "Restaurar vagas originais").'
    );
  }

  return null;
}

/**
 * A política. Recebe o diagnóstico e decide o que fazer com ele.
 * Devolve `true` quando não havia problema.
 */
export function exigir(diagnostico) {
  if (diagnostico === null) return true;
  if (EM_DESENVOLVIMENTO) throw new Error(diagnostico);
  // Produção: registrado, nunca silencioso, e a interface segue de pé.
  console.error(`[voz do Painel] ${diagnostico}`);
  return false;
}
