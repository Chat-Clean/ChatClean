/**
 * O palco do motion do Flow (`MotionDoFlow.jsx`): coordenadas e roteiro, sem
 * React.
 *
 * Há dois arranjos da mesma cena. No PAISAGEM (computador, tablet) os blocos
 * ficam lado a lado e as ligações saem pela direita e entram pela esquerda,
 * como no editor. No RETRATO (celular) os mesmos blocos descem em coluna, em
 * zigue-zague, e as ligações saem por baixo e entram por cima: a cena cabe
 * na largura do celular com texto legível, em vez de só encolher.
 *
 * A largura de todo arranjo é 1000 unidades, e `emCq` converte unidades em
 * `cqw` (1 unidade = 0,1% da largura do palco). `escala` aumenta texto e
 * respiros no retrato, que tem menos pixels por unidade.
 */

export const LARGURA_DO_PALCO = 1000;

export const ARRANJOS = Object.freeze({
  paisagem: Object.freeze({
    nome: "paisagem",
    altura: 560,
    escala: 1,
    orientacao: "horizontal",
    botao: Object.freeze({ x: 770, y: 22, largura: 200, altura: 40 }),
    blocos: Object.freeze({
      webhook: Object.freeze({ x: 40, y: 205, largura: 240 }),
      api: Object.freeze({ x: 370, y: 70, largura: 250 }),
      conteudo: Object.freeze({ x: 710, y: 250, largura: 250 }),
    }),
    repouso: Object.freeze({ x: 470, y: 470 }),
    /** Onde fica cada alça: o lado do bloco e a posição ao longo dele. */
    alcas: Object.freeze({
      saidaDoWebhook: Object.freeze({ lado: "direita", ao: "50%" }),
      entradaDaApi: Object.freeze({ lado: "esquerda", ao: "22%" }),
      saidaDaApi: Object.freeze({ lado: "direita", ao: "66%" }),
      entradaDoConteudo: Object.freeze({ lado: "esquerda", ao: "30%" }),
    }),
  }),
  retrato: Object.freeze({
    nome: "retrato",
    altura: 1640,
    escala: 2.2,
    orientacao: "vertical",
    botao: Object.freeze({ x: 470, y: 36, largura: 490, altura: 96 }),
    blocos: Object.freeze({
      webhook: Object.freeze({ x: 40, y: 470, largura: 600 }),
      api: Object.freeze({ x: 360, y: 830, largura: 600 }),
      conteudo: Object.freeze({ x: 40, y: 1260, largura: 600 }),
    }),
    repouso: Object.freeze({ x: 500, y: 1580 }),
    alcas: Object.freeze({
      saidaDoWebhook: Object.freeze({ lado: "baixo", ao: "50%" }),
      entradaDaApi: Object.freeze({ lado: "cima", ao: "50%" }),
      saidaDaApi: Object.freeze({ lado: "baixo", ao: "50%" }),
      entradaDoConteudo: Object.freeze({ lado: "cima", ao: "50%" }),
    }),
  }),
});

/** Abaixo desta largura (em px) o palco usa o arranjo em retrato. */
export const LARGURA_DO_RETRATO = 560;

export function arranjoPara(larguraEmPixels) {
  return larguraEmPixels > 0 && larguraEmPixels < LARGURA_DO_RETRATO ? ARRANJOS.retrato : ARRANJOS.paisagem;
}

/** Uma medida do palco em `cqw`, como texto de CSS. */
export function emCq(unidades) {
  return `${Math.round(unidades * 100) / 1000}cqw`;
}

/** Posição absoluta de um elemento do palco, como `style` em `cqw`. */
export function estiloNoPalco(x, y, largura) {
  return { left: emCq(x), top: emCq(y), width: largura === undefined ? undefined : emCq(largura) };
}

/** Converte uma medida em pixels do palco para unidades do palco. */
export function emUnidades(pixels, larguraDoPalcoEmPixels) {
  return larguraDoPalcoEmPixels > 0 ? (pixels * LARGURA_DO_PALCO) / larguraDoPalcoEmPixels : 0;
}

/**
 * Uma ligação em curva, de uma alça de saída a uma de entrada, em unidades.
 * Na horizontal, sai para a direita e chega pela esquerda; na vertical, sai
 * para baixo e chega por cima. As alças são medidas no DOM (`MotionDoFlow`),
 * porque a altura de cada bloco depende do texto dentro dele.
 */
export function ligacao(de, para, orientacao = "horizontal") {
  if (orientacao === "vertical") {
    const meio = (para.y - de.y) / 2;
    return `M ${de.x} ${de.y} C ${de.x} ${de.y + meio}, ${para.x} ${para.y - meio}, ${para.x} ${para.y}`;
  }
  const meio = (para.x - de.x) / 2;
  return `M ${de.x} ${de.y} C ${de.x + meio} ${de.y}, ${para.x - meio} ${para.y}, ${para.x} ${para.y}`;
}

/** O centro do botão "Adicionar bloco", onde o cursor clica. */
export function centroDoBotao(arranjo) {
  return { x: arranjo.botao.x + arranjo.botao.largura / 2, y: arranjo.botao.y + arranjo.botao.altura / 2 };
}

/**
 * Onde o bloco novo aparece quando o botão é clicado: logo ABAIXO do botão,
 * centrado nele (sem passar da borda direita do palco). É um deslocamento em
 * relação à posição final do bloco, em unidades.
 */
export function conteudoSobOBotao(arranjo) {
  const { botao, blocos, escala } = arranjo;
  const largura = blocos.conteudo.largura;
  const x = Math.min(botao.x + botao.largura / 2 - largura / 2, LARGURA_DO_PALCO - largura - 5 * escala);
  return { x: x - blocos.conteudo.x, y: botao.y + botao.altura + 24 * escala - blocos.conteudo.y };
}

/** Onde o cursor pega o bloco novo: o meio do cabeçalho, na posição final. */
export function pegaDoConteudo(arranjo) {
  const { conteudo } = arranjo.blocos;
  return { x: conteudo.x + conteudo.largura / 2, y: conteudo.y + 14 * arranjo.escala };
}

/** Onde o cursor pega o bloco novo enquanto ele ainda está sob o botão. */
export function pegaSobOBotao(arranjo) {
  const pega = pegaDoConteudo(arranjo);
  const sob = conteudoSobOBotao(arranjo);
  return { x: pega.x + sob.x, y: pega.y + sob.y };
}

/**
 * Pontos ao longo de um caminho SVG, para o cursor percorrer a mesma curva
 * que a ligação desenha. `amostras` instantes igualmente espaçados no tempo;
 * `suavizar` (a mesma curva de aceleração do traço) diz que fração do
 * comprimento já foi percorrida em cada instante. Devolve os pontos e a
 * fração desenhada, para o traço e o cursor andarem juntos.
 */
export function percursoAoLongo(caminho, suavizar, amostras = 28) {
  const total = caminho.getTotalLength();
  const pontos = [];
  for (let i = 0; i <= amostras; i += 1) {
    const fracao = suavizar(i / amostras);
    const p = caminho.getPointAtLength(total * fracao);
    pontos.push({ x: p.x, y: p.y, fracao });
  }
  return { total, pontos };
}
