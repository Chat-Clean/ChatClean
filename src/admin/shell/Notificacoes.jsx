/**
 * As notificações do Painel.
 *
 * O `sonner` está instalado desde antes deste épico e nunca foi importado uma
 * única vez. Sem um ponto único, cada tela do Épico 2 inventaria o seu — e
 * "Salvo!" numa, "Post salvo com sucesso" noutra e um alerta do navegador na
 * terceira é exatamente o que a direção de voz proíbe.
 *
 * A voz é a da direção visual, e ela é **estrutural, não apenas recomendada**:
 *
 *   - confirmação **nomeia o que aconteceu** — "Post salvo", não "Pronto!";
 *   - erro diz **o que houve e o que fazer** — por isso `notificarErro` exige
 *     as duas metades como argumentos separados. Não dá para chamar só com a
 *     primeira e deixar a pessoa sem saída.
 *
 * As regras em si moram em `voz.js`, puras e importáveis, para poderem ser
 * executadas pela verificação em vez de conferidas por regex. A política de
 * violação também é de lá: lança em desenvolvimento, registra em produção e
 * **mostra a notificação assim mesmo** — mensagem ruim ainda é melhor que
 * silêncio, e engolir a notificação por causa da própria guarda seria a guarda
 * causando o defeito que ela existe para impedir.
 *
 * Aparência: o `Toaster` recebe a classe `.painel` porque ele é renderizado em
 * portal, fora da árvore do Painel — sem ela, `var(--popover)` resolveria para
 * o neutro do site público e a notificação sairia com a cor errada.
 */

import { Toaster, toast } from "sonner";

import { diagnosticarMensagem, diagnosticarRotuloDeAcao, exigir } from "./voz";

/**
 * Operação concluída. `oQueAconteceu` nomeia o fato: "Post salvo",
 * "Vaga excluída", "Vagas originais restauradas".
 */
// eslint-disable-next-line react-refresh/only-export-components -- o ponto único de notificação mora junto do Toaster que ele alimenta; a função é pura e sem estado.
export function notificarSucesso(oQueAconteceu, detalhe) {
  exigir(diagnosticarMensagem("o que aconteceu", oQueAconteceu));
  return toast.success(oQueAconteceu, detalhe ? { description: detalhe } : undefined);
}

/**
 * Operação falhou. As duas metades são obrigatórias:
 *   `oQueHouve`  — "Não deu para salvar o post"
 *   `oQueFazer`  — "Confira a conexão e tente salvar de novo."
 *
 * Exigir as duas é o que impede a notificação de virar um beco sem saída.
 *
 * `saida` é opcional e vai um passo além da frase: `{ rotulo, aoAcionar }` vira
 * um botão na própria notificação. Ele existe para a recusa cuja alternativa é
 * conhecida — agendar para o passado, cuja saída é publicar agora —, e o
 * rótulo passa pela MESMA guarda do botão de diálogo (`diagnosticarRotuloDeAcao`)
 * porque é a mesma situação: a pessoa lê o botão, não o parágrafo, antes de
 * clicar, e aqui ela está prestes a pôr um Post no ar.
 */
// eslint-disable-next-line react-refresh/only-export-components -- idem: a regra de voz e o transporte da mensagem não se separam sem convidar a divergência.
export function notificarErro(oQueHouve, oQueFazer, saida = null) {
  exigir(diagnosticarMensagem("o que houve", oQueHouve));
  exigir(diagnosticarMensagem("o que fazer", oQueFazer));
  const opcoes = { description: oQueFazer };
  if (saida) {
    exigir(diagnosticarRotuloDeAcao(saida.rotulo));
    opcoes.action = { label: saida.rotulo, onClick: saida.aoAcionar };
  }
  return toast.error(oQueHouve, opcoes);
}

/**
 * O `Toaster`. Montado **uma vez só**, na casca do Painel. Duas montagens
 * produzem duas pilhas de notificação e a mesma mensagem aparecendo em dobro.
 */
export default function Notificacoes() {
  return (
    <Toaster
      // Portal: o elemento nasce fora da árvore do Painel, e sem `.painel` os
      // tokens da marca não existem neste escopo.
      className="painel"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-cartao",
          description: "text-muted-foreground",
          actionButton: "rounded-controle",
          cancelButton: "rounded-controle",
          closeButton: "rounded-pilula",
        },
      }}
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--success-bg": "var(--popover)",
        "--success-text": "var(--popover-foreground)",
        "--success-border": "var(--border)",
        "--error-bg": "var(--popover)",
        "--error-text": "var(--popover-foreground)",
        "--error-border": "var(--border)",
        "--border-radius": "var(--radius-cartao)",
      }}
    />
  );
}
