/**
 * O que ocupa o lugar da imagem quando não há imagem — a caixa do monograma.
 *
 * ─── POR QUE ISTO É UM COMPONENTE, E NÃO DUAS CAIXAS PARECIDAS ─────────────
 *
 * Ela nasceu na linha da listagem e a Story 3.2 lhe deu um segundo consumidor:
 * a gaveta, que degrada para o mesmo recurso quando a capa não carrega ou
 * quando o endereço não serve. A promessa da story é que **Editor e listagem
 * mostrem a mesma coisa para o mesmo Post** — e enquanto a caixa esteve escrita
 * duas vezes, a única coisa presa era a LETRA. O fundo, a tinta e o símbolo de
 * "sem Categoria" divergiriam na primeira mexida num dos dois arquivos, e nada
 * acusaria.
 *
 * O que este componente possui, e o que ele não possui:
 *
 *   POSSUI o par de tokens (`brand-wash` atrás, `brand-action` na frente), a
 *   letra — pela função pura de `listagem.js`, nunca remontada — e o símbolo
 *   neutro de quando não há Categoria;
 *
 *   NÃO possui tamanho. A listagem desenha um quadrado de 64px na linha e a
 *   gaveta um retângulo 16/9 da largura da coluna: são contextos diferentes, e
 *   forçar um tamanho só quebraria um dos dois. O tamanho vem por `className`.
 *
 * ─── E QUEM ANUNCIA, ANUNCIA UMA VEZ ───────────────────────────────────────
 *
 * `rotulo` ausente deixa a caixa `aria-hidden`, que é o certo na listagem: a
 * linha inteira já diz título e Categoria em texto, e repetir a letra seria
 * ruído. Na gaveta não há esse texto em volta, então lá o rótulo vem — e a
 * caixa passa a ser uma imagem com nome, em vez de silêncio.
 */

import { FileText } from "lucide-react";

import { monogramaDoNome } from "@/admin/blog/listagem";
import { cn } from "@/lib/utils";

export default function MonogramaDaCapa({
  /** O NOME da Categoria. `""` ou ausente cai no recurso neutro. */
  categoria = "",
  /** O papel que a verificação lê. Cada consumidor nomeia o seu. */
  papel,
  /** O nome acessível. Ausente ⇒ a caixa é decorativa. */
  rotulo = "",
  /** O tamanho do símbolo neutro, que acompanha o tamanho da caixa. */
  classeDoSimbolo = "size-6",
  className,
}) {
  const monograma = monogramaDoNome(categoria);
  const nomeada = String(rotulo ?? "").trim() !== "";
  return (
    <div
      data-papel={papel}
      data-monograma={monograma}
      /* O RECURSO DESENHADO, dito em atributo: é o que permite afirmar que as
         duas telas caem no MESMO recurso, e não só na mesma letra. */
      data-recurso={monograma === "" ? "neutro" : "letra"}
      role={nomeada ? "img" : undefined}
      aria-label={nomeada ? rotulo : undefined}
      aria-hidden={nomeada ? undefined : "true"}
      className={cn(
        "flex items-center justify-center",
        "bg-brand-wash font-black text-brand-action",
        className,
      )}
    >
      {/* Post sem Categoria DESENHA: Categoria é opcional na gaveta, e uma
          linha que some por falta dela seria um Post invisível no Painel. */}
      {monograma === "" ? (
        <FileText aria-hidden="true" className={classeDoSimbolo} />
      ) : (
        monograma
      )}
    </div>
  );
}
