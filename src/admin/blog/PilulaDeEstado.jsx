/**
 * A pílula de Estado do Post.
 *
 * **Cor nunca é o único portador de estado.** A pílula traz o ponto colorido e
 * a palavra por extenso, sempre — quem não distingue os verdes do azul lê
 * "Publicado" do mesmo jeito, e a palavra é a mesma em toda superfície porque
 * vem do vocabulário fechado, não de uma string escrita aqui.
 *
 * O par de cor também vem do domínio, por `var(--state-…)`, e não de classe
 * utilitária montada por concatenação: `bg-state-${estado}-bg` é uma classe que
 * o Tailwind não gera, porque ele lê o código-fonte como texto e nunca vê a
 * string final. Seria uma pílula sem cor nenhuma em produção, e verde em
 * desenvolvimento só se alguém tivesse escrito a variante inteira em algum
 * lugar por acaso.
 *
 * **Ausente e desconhecido não são a mesma coisa.** Post sem Estado é o caso de
 * hoje — a persistência só chega no Épico 2 —, então valor ausente não é
 * defeito: a pílula simplesmente não aparece. Valor PRESENTE e fora do
 * vocabulário é defeito, e o domínio continua lançando para ele
 * (`aparenciaDoEstado`); o que muda aqui é que a explosão não acontece durante
 * o render de uma listagem, onde derrubaria a tela inteira por causa de uma
 * linha. A política de `voz.js` decide: lança em desenvolvimento, registra em
 * produção, e em nenhum dos dois casos vira pílula em branco.
 */

import { aparenciaDoEstado, ehEstado } from "@/domain/blog/estados";
import { exigir } from "@/admin/shell/voz";
import { cn } from "@/lib/utils";

export default function PilulaDeEstado({ estado, className }) {
  // Ausente: nada a mostrar, e nada de errado.
  if (estado === null || estado === undefined || estado === "") return null;

  if (!ehEstado(estado)) {
    exigir(
      `Estado de Post desconhecido na pílula: ${JSON.stringify(estado)}. ` +
        "O vocabulário é fechado — veja `src/domain/blog/estados.js`.",
    );
    return null;
  }

  const { rotulo, fundo, tinta } = aparenciaDoEstado(estado);

  return (
    <span
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
        // A mesma tinta do texto: o par já foi verificado entre 4,90:1 e
        // 5,80:1 contra o fundo, então o ponto passa com folga do piso de 3:1
        // exigido de elemento não textual.
        style={{ backgroundColor: tinta }}
      />
      {rotulo}
    </span>
  );
}
