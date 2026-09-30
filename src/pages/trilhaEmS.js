/**
 * A geometria da trilha em S da página de integrações. Sem React e sem DOM:
 * recebe medidas, devolve números e o `d` do caminho SVG.
 */

/**
 * Onde fica o nó de cada etapa, na largura da coluna da trilha: alterna
 * entre a esquerda e a direita, e é essa alternância que faz o S. `folga` é a
 * fração da largura que fica entre a borda e o nó.
 */
export function posicaoDoNo(indice, largura, folga = 0.25) {
  return indice % 2 === 0 ? largura * folga : largura * (1 - folga);
}

/**
 * O caminho que liga os nós, de cima (y = 0) até embaixo (y = altura).
 *
 * Entre dois nós, uma curva cúbica cujos pontos de controle ficam na mesma
 * coluna de cada nó e na altura do meio do trecho: a linha desce reta do
 * nó, faz a curva no meio do caminho e chega reta no próximo. Acima do
 * primeiro nó e abaixo do último, a linha segue reta até a borda.
 */
export function caminhoEmS(pontos, altura) {
  if (!Array.isArray(pontos) || pontos.length === 0) return "";
  const n = (v) => Math.round(v * 10) / 10;
  const [primeiro] = pontos;
  const ultimo = pontos[pontos.length - 1];
  let d = `M ${n(primeiro.x)} 0 L ${n(primeiro.x)} ${n(primeiro.y)}`;
  for (let i = 1; i < pontos.length; i += 1) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const meio = (a.y + b.y) / 2;
    d += ` C ${n(a.x)} ${n(meio)} ${n(b.x)} ${n(meio)} ${n(b.x)} ${n(b.y)}`;
  }
  d += ` L ${n(ultimo.x)} ${n(altura)}`;
  return d;
}

/**
 * Em que fração do desenho da linha cada nó é alcançado. A linha é
 * desenhada pelo comprimento, então a fração vem do comprimento medido até
 * cada nó (`comprimentos`), e não da altura: numa curva, meia altura não é
 * meio comprimento.
 */
export function fracoesDosNos(comprimentos, total) {
  if (!(total > 0)) return comprimentos.map(() => 0);
  return comprimentos.map((c) => Math.min(Math.max(c / total, 0), 1));
}
