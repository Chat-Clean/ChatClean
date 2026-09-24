/**
 * A pílula de Estado do Post: a guarda do vocabulário, ligada ao desenho comum.
 *
 * O desenho (ponto colorido, palavra por extenso, `data-estado`) mora em
 * `src/admin/comum/PilulaDeEstado.jsx`, que não conhece Estado nenhum. Aqui
 * fica o que é do Post: a palavra e o par de cor vêm de `aparenciaDoEstado`,
 * o vocabulário fechado de `domain/blog/estados.js`, e não de uma tabela
 * própria.
 *
 * **Ausente e desconhecido não são a mesma coisa.** Valor ausente não é
 * defeito: a pílula simplesmente não aparece. Valor PRESENTE e fora do
 * vocabulário é defeito, e o domínio continua lançando para ele
 * (`aparenciaDoEstado`); o que muda aqui é que a explosão não acontece durante
 * o render de uma listagem, onde derrubaria a tela inteira por causa de uma
 * linha. A política de `voz.js` decide: lança em desenvolvimento, registra em
 * produção, e em nenhum dos dois casos vira pílula em branco.
 */

import { aparenciaDoEstado, ehEstado } from "@/domain/blog/estados";
import PilulaComum from "@/admin/comum/PilulaDeEstado";
import { exigir } from "@/admin/shell/voz";

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

  return (
    <PilulaComum
      estado={estado}
      aparencia={aparenciaDoEstado(estado)}
      className={className}
    />
  );
}
