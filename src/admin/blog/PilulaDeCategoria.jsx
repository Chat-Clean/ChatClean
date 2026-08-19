/**
 * A pílula de Categoria — cor e ícone, do dado (Story 2.14).
 *
 * **Cor nunca é o único portador.** A pílula traz o desenho e o nome por
 * extenso, sempre: quem não distingue os tons lê "Automação" do mesmo jeito, e
 * o nome vem do banco, não de uma lista escrita aqui.
 *
 * ─── O PAR DE COR É VALOR, APLICADO POR `style` ─────────────────────────────
 *
 * O mesmo caminho de `PilulaDeEstado.jsx`, e pelo mesmo motivo:
 * `bg-categoria-${cor}` é uma classe que o Tailwind não gera, porque ele lê o
 * código-fonte como TEXTO e nunca vê a string final. Seria uma pílula sem cor
 * nenhuma em produção, e colorida em desenvolvimento só se alguém tivesse
 * escrito a variante inteira em algum lugar por acaso.
 *
 * O valor guardado em `categorias.cor` é a própria referência
 * `var(--categoria-…-bg)`, do vocabulário fechado de `domain/blog/categorias.js`
 * — e o par (fundo e tinta) é derivado dele, porque contraste é propriedade de
 * um PAR e uma cor sozinha não se mede.
 *
 * ─── AUSENTE E DESCONHECIDO NÃO DERRUBAM A TELA ─────────────────────────────
 *
 * Categoria sem cor é caso normal (a coluna nasce com `''`), e Categoria com
 * cor fora do vocabulário é dado antigo ou corrompido. Os dois caem na cor
 * padrão: uma listagem inteira não pode cair por causa de uma linha. Quem
 * RECUSA cor fora do vocabulário é a escrita, no servidor, onde ainda dá para
 * dizer o que houve.
 */

import { ICONES_DE_CATEGORIA } from "@/admin/blog/iconesDeCategoria";
import {
  aparenciaDaCategoria,
  iconeDaCategoria,
} from "@/domain/blog/categorias";
import { cn } from "@/lib/utils";

export default function PilulaDeCategoria({ categoria, className }) {
  // Sem Categoria não há pílula, e não há nada de errado: Categoria é opcional
  // na gaveta, e o Post sem uma continua sendo um Post.
  if (categoria === null || categoria === undefined) return null;

  const { fundo, tinta } = aparenciaDaCategoria(categoria);
  const chave = iconeDaCategoria(categoria);
  const Icone = ICONES_DE_CATEGORIA[chave]?.desenho;
  const nome = String(categoria.nome ?? "").trim();

  return (
    <span
      /* A Categoria também sai como DADO, e não só como palavra desenhada: é
         por aqui que a verificação lê o que a tela está mostrando sem casar
         texto traduzido. */
      data-papel="pilula-de-categoria"
      data-categoria={categoria.id ?? ""}
      data-icone={chave}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pilula px-2.5 py-1",
        "text-xs font-semibold leading-none whitespace-nowrap",
        className,
      )}
      style={{ backgroundColor: fundo, color: tinta }}
    >
      {Icone ? <Icone aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      {nome === "" ? "categoria sem nome" : nome}
    </span>
  );
}
