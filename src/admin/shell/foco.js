/**
 * O anel de foco do Painel, em um lugar só.
 *
 * A direção visual pede **2px em `brand-action`** em todo elemento interativo.
 * Repetir a string de classe em cada componente faria os 2px virarem 3px num
 * arquivo e o token virar outro no seguinte — e ninguém percebe, porque foco de
 * teclado é a coisa que menos se olha durante o desenvolvimento.
 *
 * **Por que existe o deslocamento branco.** `brand-action` (#007a2a) sobre
 * `brand-chrome` (#005c3a) — o fundo da barra superior — dá 1,47:1. O anel
 * seria invisível justamente onde a navegação por teclado começa. Com 2px de
 * `surface` entre o elemento e o anel, as duas fronteiras passam com folga:
 * branco sobre cromia dá 8,1:1 e `brand-action` sobre branco dá 5,5:1. A cor
 * declarada continua sendo `brand-action`, como a direção manda; o que o
 * deslocamento faz é torná-la visível.
 *
 * `outline-hidden` (e não `outline-none`) mantém um contorno transparente de
 * 2px, que o modo de alto contraste do Windows repinta com a cor do sistema.
 * Zerar o contorno de vez apagaria o foco para quem depende exatamente dele.
 */
export const ANEL_DE_FOCO =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/**
 * Alvo de toque mínimo de 40×40, usado junto do anel em controle de ícone,
 * onde o conteúdo sozinho não chega perto disso.
 *
 * **O 40 vem do projeto, não de uma norma** — e a distinção importa porque a
 * citação errada é copiada adiante. Não existe critério de tamanho de alvo em
 * WCAG 2.1 AA: o 2.5.5 é AAA e pede 44×44; o 2.5.8, que é AA, só chega na
 * WCAG 2.2 e pede 24×24. O piso de 40 do épico fica entre os dois, mais
 * exigente que o AA que existe hoje e mais realista que o AAA.
 */
export const ALVO_DE_TOQUE = "min-h-10 min-w-10";
