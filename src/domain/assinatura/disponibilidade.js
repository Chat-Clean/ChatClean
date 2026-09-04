/**
 * A chave que liga e desliga o checkout, em regra pura.
 *
 * Sem React, sem `import.meta`, sem `process`: recebe um ambiente e responde.
 * Quem lê o ambiente do navegador é `src/lib/checkout.js`; quem lê o do
 * servidor passa `process.env` direto.
 *
 * ═══ POR QUE UMA CHAVE, E NÃO UM BRANCH ══════════════════════════════════
 *
 * O checkout está em teste e não pode aparecer em produção, mas continua sendo
 * desenvolvido. Um branch de longa duração resolveria isso ao custo de main e
 * local divergirem para sempre, com merge toda semana e o modo de falhar mais
 * comum que existe: portar uma correção para um lado e esquecer o outro.
 *
 * Com a chave, main e a máquina de quem desenvolve rodam o MESMO commit. O que
 * muda é uma variável de ambiente.
 *
 * ═══ O PADRÃO É OCULTO, E ISSO É A PARTE IMPORTANTE ═════════════════════
 *
 * Ambiente sem a variável esconde o checkout. Então esquecer de configurar,
 * errar o nome da variável, ou subir um ambiente novo sem nada declarado, tudo
 * isso falha para o lado de ESCONDER.
 *
 * O contrário seria uma variável que precisa dizer "esconda": aí um erro de
 * digitação publicaria o checkout, e ninguém perceberia até alguém comprar.
 *
 * ═══ A LISTA DE VALORES É FECHADA ═══════════════════════════════════════
 *
 * Só `1` e `true` ligam. `sim`, `on`, `yes`, `ativo` não ligam, de propósito:
 * lista de permissão curta é conferível, e o erro que ela produz ("liguei e
 * não apareceu") é barato de descobrir. O erro do contrário ("desliguei e
 * continuou aparecendo") só aparece quando alguém compra sem poder comprar.
 */

/**
 * Os nomes aceitos, na ordem de precedência.
 *
 * Dois porque são dois mundos: `VITE_CHECKOUT_ATIVO` é assado no pacote do
 * navegador em tempo de build; `CHECKOUT_ATIVO` é lido pelo servidor em tempo
 * de execução. É a mesma convenção que `api/_nucleo/acesso.js` já usa para a
 * URL e a chave do Supabase.
 */
export const VARIAVEIS_DO_CHECKOUT = Object.freeze([
  "CHECKOUT_ATIVO",
  "VITE_CHECKOUT_ATIVO",
]);

/** Os únicos valores que ligam. Comparados sem espaço e sem caixa. */
export const VALORES_QUE_LIGAM = Object.freeze(["1", "true"]);

/**
 * O checkout está ativo neste ambiente?
 *
 * `false` para ambiente vazio, valor ausente, valor fora da lista, e para
 * qualquer coisa que não seja texto.
 */
export function checkoutAtivo(ambiente = {}) {
  for (const nome of VARIAVEIS_DO_CHECKOUT) {
    const bruto = ambiente?.[nome];
    if (typeof bruto !== "string") continue;
    const valor = bruto.trim().toLowerCase();
    if (valor === "") continue;
    return VALORES_QUE_LIGAM.includes(valor);
  }
  return false;
}
