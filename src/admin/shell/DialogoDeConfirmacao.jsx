/**
 * O diálogo de confirmação do Painel, sobre o `alert-dialog` do shadcn.
 *
 * Substitui o modal artesanal que vivia dentro de `AdminBlog.jsx` — um `div`
 * fixo com `z-[100]`, sem `role`, sem armadilha de foco, sem `Esc`, sem devolver
 * o foco ao elemento que o abriu e com o botão perigoso alcançável primeiro
 * pelo teclado. O componente do sistema resolve os seis de uma vez.
 *
 * Três decisões que não são de aparência:
 *
 *   **Cancelar é o foco inicial.** Confirmação destrutiva não pode ter o botão
 *   perigoso como caminho de menor resistência: quem aperta Enter por reflexo
 *   precisa cair no caminho seguro.
 *
 *   **O conteúdo carrega `.painel`.** O `AlertDialogContent` monta em portal,
 *   preso ao `body` — fora da árvore do Painel. Sem a classe, `var(--primary)`,
 *   `var(--card)` e `var(--destructive)` resolveriam para os neutros de
 *   `:root`, e o diálogo sairia com a cor do site público em vez da marca. Vale
 *   para qualquer componente em portal.
 *
 *   **O rótulo nomeia a ação.** "Excluir post", não "Confirmar"; "Restaurar
 *   vagas originais", não "OK". Um rótulo genérico obriga a pessoa a reler o
 *   texto para saber o que o botão faz — e é lendo o rótulo que ela decide. A
 *   regra vive em `voz.js`, e a violação lança em desenvolvimento e fica
 *   registrada em produção: derrubar o Painel por causa de um rótulo ruim
 *   custaria mais que o rótulo ruim.
 *
 * ─── E O QUE ESTÁ ACONTECENDO SE OUVE DE DENTRO ─────────────────────────────
 *
 * `ocupado` desabilita o botão de confirmação e troca o rótulo pelo texto do
 * que está em curso. Ele existe porque o diálogo é `aria-modal`: uma região
 * viva que fique FORA dele não é lida por quem está dentro — e quem está dentro
 * é exatamente quem acabou de confirmar uma ação irreversível e precisa saber
 * que ela começou. O anúncio mora aqui, dentro do modal, e o botão desabilitado
 * é o que impede a segunda confirmação de sair enquanto a primeira corre.
 */

import { useRef } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ANEL_DE_FOCO } from "./foco";
import { diagnosticarRotuloDeAcao, exigir } from "./voz";

/**
 * @param {boolean}  aberto
 * @param {Function} aoMudarAbertura      recebe o novo estado de abertura
 * @param {string}   titulo               a pergunta ("Excluir post?")
 * @param {string}   descricao            a consequência, em uma frase
 * @param {string}   rotuloDeConfirmacao  o que o botão faz ("Excluir post")
 * @param {Function} aoConfirmar
 * @param {boolean}  perigo               destrutivo (vermelho) ou não
 * @param {string}   ocupado              o que está acontecendo agora, ou `""`
 */
export default function DialogoDeConfirmacao({
  aberto,
  aoMudarAbertura,
  titulo,
  descricao,
  rotuloDeConfirmacao,
  aoConfirmar,
  perigo = true,
  rotuloDeCancelamento = "Cancelar",
  ocupado = "",
}) {
  const refDeCancelar = useRef(null);

  exigir(diagnosticarRotuloDeAcao(rotuloDeConfirmacao));

  return (
    <AlertDialog open={aberto} onOpenChange={aoMudarAbertura}>
      <AlertDialogContent
        // `.painel` porque isto vive em portal, fora da árvore do Painel.
        className="painel rounded-cartao"
        // O foco inicial é do Cancelar, sempre. Explícito: o caminho seguro não
        // pode depender de a biblioteca continuar escolhendo o mesmo padrão.
        onOpenAutoFocus={(evento) => {
          const cancelar = refDeCancelar.current;
          // Sem o elemento não há para onde mandar o foco — deixar o padrão da
          // biblioteca agir é melhor que impedir o foco e não dar destino a ele.
          if (!cancelar) return;
          evento.preventDefault();
          cancelar.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="tracking-tight">{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* O ANÚNCIO VIVE DENTRO DO MODAL. Fora dele, `aria-modal` esconde a
              região de quem está no diálogo — que é justamente quem precisa
              ouvi-la. Fica no rodapé, antes dos botões, e some quando não há
              nada em curso. */}
          <p
            role="status"
            aria-live="polite"
            data-papel="dialogo-em-curso"
            className="sr-only"
          >
            {ocupado}
          </p>
          <AlertDialogCancel
            ref={refDeCancelar}
            disabled={ocupado !== ""}
            className={cn("min-h-10 rounded-controle", ANEL_DE_FOCO)}
          >
            {rotuloDeCancelamento}
          </AlertDialogCancel>
          {/* Não é `AlertDialogAction`: aquele fecha o diálogo por conta
              própria em qualquer caso. Aqui quem fecha é `aoConfirmar`, para
              que uma ação que falha possa manter o diálogo aberto com a
              mensagem à vista. */}
          <Button
            variant={perigo ? "destructive" : "default"}
            onClick={aoConfirmar}
            disabled={ocupado !== ""}
            aria-busy={ocupado !== "" ? "true" : undefined}
            data-papel="confirmar"
            className={cn("min-h-10 rounded-controle font-semibold", ANEL_DE_FOCO)}
          >
            {ocupado !== "" ? ocupado : rotuloDeConfirmacao}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
