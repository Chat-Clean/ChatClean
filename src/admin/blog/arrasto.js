/**
 * A conta do rolamento automático enquanto se arrasta dentro do Editor.
 *
 * Vive em módulo próprio, e não dentro de `Editor.jsx`, pela razão de sempre
 * neste projeto: função pura em arquivo de componente não é executável pela
 * verificação — e aqui o que interessa provar é justamente a CONTA (a zona,
 * o sinal, o teto), não o efeito que a aplica.
 *
 * ─── POR QUE ELE EXISTE ─────────────────────────────────────────────────────
 *
 * Arrastando uma imagem para um ponto que está fora da parte visível, não há
 * como chegar lá: o arrasto de HTML5 não rola a página sozinho, e soltar para
 * rolar perde o arrasto. Sem isto, mover uma imagem do fim para o começo de um
 * post longo é impossível — e o Autor não tem como saber que é impossível.
 *
 * ─── E POR QUE SÓ O ROLAMENTO DO EDITOR ─────────────────────────────────────
 *
 * Quem rola é a caixa que rola o texto, e não a janela. A moldura do Editor é
 * `h-screen` com `overflow-hidden` (ver `EditorDePost.jsx`): a página não rola,
 * e mandar a janela rolar não faria nada além de mexer no que estiver atrás.
 */

/** A faixa, em pixels, junto de cada borda que dispara o rolamento. */
export const ZONA_DE_ROLAMENTO = 72;

/** Quantos pixels por quadro, no ponto mais fundo da faixa. */
export const VELOCIDADE_MAXIMA = 22;

/**
 * Quanto rolar neste quadro, dado onde o cursor está.
 *
 * Negativo sobe, positivo desce, zero fica parado. A velocidade é
 * PROPORCIONAL à profundidade dentro da faixa — encostar de leve na borda
 * rola devagar, chegar ao fim dela rola rápido —, porque uma velocidade única
 * ou passa do ponto que se quer alcançar ou demora demais para chegar nele.
 *
 * Passar da borda para FORA não acelera além do teto: `Math.min`/`Math.max`
 * prendem a profundidade em 1. Sem isso, arrastar para bem longe acima da
 * caixa rolaria o documento inteiro num quadro.
 *
 * `topo` e `base` são as bordas da caixa que rola, em coordenada de janela —
 * é o que `getBoundingClientRect()` devolve, e é a mesma régua de `clientY`.
 */
export function deslocamentoDoArrasto({
  y,
  topo,
  base,
  zona = ZONA_DE_ROLAMENTO,
  velocidade = VELOCIDADE_MAXIMA,
} = {}) {
  const posicao = Number(y);
  const inicio = Number(topo);
  const fim = Number(base);
  if (!Number.isFinite(posicao) || !Number.isFinite(inicio) || !Number.isFinite(fim)) {
    return 0;
  }
  /* Caixa sem altura útil não rola: sem esta guarda, uma caixa menor que duas
     zonas teria as duas faixas se sobrepondo, e o meio dela — que deveria ser
     zona morta — rolaria para os dois lados ao mesmo tempo. */
  if (fim - inicio <= zona * 2) return 0;

  if (posicao < inicio + zona) {
    const profundidade = Math.min(1, (inicio + zona - posicao) / zona);
    return -velocidade * profundidade;
  }
  if (posicao > fim - zona) {
    const profundidade = Math.min(1, (posicao - (fim - zona)) / zona);
    return velocidade * profundidade;
  }
  return 0;
}
