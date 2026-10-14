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
 *
 * ─── O AGENDADO QUE JÁ ESTÁ NO AR ──────────────────────────────────────────
 *
 * No banco ele continua `agendado` (é a passagem do tempo que o publica), mas
 * "Agendado" num Post que todo mundo já pode ler parece que nada aconteceu. Com
 * `publicadoEm` no passado, a pílula diz "Publicado", com a cor de publicado, e
 * leva um relógio discreto que conta a origem: saiu pelo agendamento. A dica
 * diz quando. `jaNoAr` serve a quem sabe que o Post esteve no ar sem ter a
 * data (a tela de leituras: Post com leitura foi lido por alguém).
 */

import { CalendarClock } from "lucide-react";

import { aparenciaDoEstado, ehEstado, publicadoPorAgendamento } from "@/domain/blog/estados";
import { formatarDataEHora } from "@/domain/blog/formato";
import PilulaComum from "@/admin/comum/PilulaDeEstado";
import { exigir } from "@/admin/shell/voz";

function dicaDoAgendamento(publicadoEm) {
  try {
    return publicadoEm
      ? `Publicado pelo agendamento em ${formatarDataEHora(publicadoEm)}`
      : "Publicado pelo agendamento";
  } catch {
    return "Publicado pelo agendamento";
  }
}

export default function PilulaDeEstado({ estado, publicadoEm = null, jaNoAr = false, className }) {
  // Ausente: nada a mostrar, e nada de errado.
  if (estado === null || estado === undefined || estado === "") return null;

  if (!ehEstado(estado)) {
    exigir(
      `Estado de Post desconhecido na pílula: ${JSON.stringify(estado)}. ` +
        "O vocabulário é fechado — veja `src/domain/blog/estados.js`.",
    );
    return null;
  }

  const porAgendamento =
    estado === "agendado" &&
    (jaNoAr || publicadoPorAgendamento({ estado, publicado_em: publicadoEm }));

  if (porAgendamento) {
    const dica = dicaDoAgendamento(publicadoEm);
    return (
      <PilulaComum
        estado="publicado"
        aparencia={aparenciaDoEstado("publicado")}
        className={className}
        title={dica}
        data-origem="agendamento"
      >
        <CalendarClock aria-hidden="true" className="-mr-0.5 size-3 shrink-0 opacity-75" />
        <span className="sr-only">{`, ${dica.charAt(0).toLowerCase()}${dica.slice(1)}`}</span>
      </PilulaComum>
    );
  }

  return (
    <PilulaComum
      estado={estado}
      aparencia={aparenciaDoEstado(estado)}
      className={className}
    />
  );
}
