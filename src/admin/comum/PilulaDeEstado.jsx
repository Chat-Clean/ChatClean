/**
 * A pílula de Estado: o desenho, sem o vocabulário.
 *
 * **Cor nunca é o único portador de estado.** A pílula traz o ponto colorido e
 * a palavra por extenso, sempre. A palavra e o par de cor chegam prontos em
 * `aparencia` (`{ rotulo, fundo, tinta }`), vindos do vocabulário fechado de
 * quem chama: este arquivo serve o Blog e Carreiras e não conhece Estado
 * nenhum. A guarda (ausente, desconhecido) é de quem conhece o vocabulário, e
 * mora na ligação de cada módulo (`admin/blog/PilulaDeEstado.jsx`).
 *
 * O par de cor vai por `style`, a partir de `var(--state-…)` do domínio, e não
 * por classe utilitária montada por concatenação: o Tailwind lê o código-fonte
 * como texto e nunca veria a classe final.
 */

import { cn } from "@/lib/utils";

export default function PilulaDeEstado({ estado, aparencia, className }) {
  /* Sem aparência não há o que desenhar: a palavra e a cor vêm dela. A pílula
     some em vez de derrubar a tela; a guarda que ACUSA o Estado desconhecido
     é da ligação, que conhece o vocabulário. */
  if (aparencia === null || typeof aparencia !== "object") return null;
  const { rotulo, fundo, tinta } = aparencia;

  return (
    <span
      /* O Estado também sai como DADO, e não só como palavra desenhada: é por
         ele que a verificação lê o que a tela está mostrando sem casar texto
         traduzido, e é ele que uma listagem pode usar para agrupar. */
      data-estado={estado}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pilula px-2.5 py-1",
        "text-xs font-semibold leading-none whitespace-nowrap",
        className,
      )}
      style={{ backgroundColor: fundo, color: tinta }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-pilula shrink-0"
        // A mesma tinta do texto: o par já foi verificado contra o fundo, então
        // o ponto passa com folga do piso de 3:1 de elemento não textual.
        style={{ backgroundColor: tinta }}
      />
      {rotulo}
    </span>
  );
}
