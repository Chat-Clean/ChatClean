/**
 * Barra o menu de contexto ("Salvar imagem como…") e o arrastar de imagem
 * no site público. É dissuasão, não proteção: a imagem já está no navegador
 * de quem vê, e as ferramentas de desenvolvedor continuam chegando nela.
 *
 * O Painel (`.painel`) fica de fora: o editor arrasta imagem para
 * reposicionar, e quem escreve precisa do menu do navegador.
 */
function ehImagemDoSite(alvo) {
  return alvo instanceof HTMLImageElement && !alvo.closest(".painel");
}

function barrar(evento) {
  if (ehImagemDoSite(evento.target)) evento.preventDefault();
}

export function protegerImagens(documento = document) {
  documento.addEventListener("contextmenu", barrar);
  documento.addEventListener("dragstart", barrar);
}
