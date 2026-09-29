/**
 * A conta do rolamento automático e do redimensionamento da imagem do Post.
 *
 * O rolamento é genérico e mora em `src/admin/comum/arrasto.js`; este arquivo
 * o reexporta com os mesmos nomes, para que quem importava daqui continue
 * importando daqui. O redimensionamento é do Blog: só o vocabulário do Post
 * tem imagem, e os limites da largura são os de `NOS.image.width`.
 */

export { deslocamentoDoArrasto, VELOCIDADE_MAXIMA, ZONA_DE_ROLAMENTO } from "../comum/arrasto.js";

/* ─── O redimensionamento da imagem ──────────────────────────────────────── */

/**
 * Os limites da largura gravada, em pixels.
 *
 * São os MESMOS que `NOS.image.width` declara em `domain/blog/schema.js` e que
 * a restrição do banco cobra. Estão repetidos aqui, e não importados, por uma
 * razão de direção: `arrasto.js` é módulo de tela, e o domínio não conhece
 * tela. A verificação (`verificar-editor`, seção d2) executa o validador de
 * `width` do schema nos dois lados de cada limite e compara com estas duas
 * constantes, para que "repetido" nunca vire "divergente".
 */
export const LARGURA_MINIMA = 80;
export const LARGURA_MAXIMA = 1600;

/**
 * A largura depois de arrastar o punho, presa aos limites.
 *
 * O punho fica no canto DIREITO: arrastar para a direita aumenta, para a
 * esquerda diminui — por isso o deslocamento entra somando, sem inversão de
 * sinal. A altura não aparece na conta porque não é gravada: a proporção é do
 * CSS, e é o que torna o redimensionamento proporcional por construção, em
 * vez de por uma multiplicação que poderia sair errada.
 *
 * O arredondamento é para inteiro porque o schema exige inteiro — largura
 * fracionária seria descartada na higienização, e o Autor veria o tamanho
 * voltar sozinho ao abrir o Post de novo.
 */
export function larguraRedimensionada({ larguraInicial, deslocamento } = {}) {
  const base = Number(larguraInicial);
  const passo = Number(deslocamento);
  if (!Number.isFinite(base)) return LARGURA_MINIMA;
  const bruta = Math.round(base + (Number.isFinite(passo) ? passo : 0));
  return Math.max(LARGURA_MINIMA, Math.min(LARGURA_MAXIMA, bruta));
}
