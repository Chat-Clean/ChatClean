/**
 * A barra de ferramentas do editor do Post: a ligação fina entre o vocabulário
 * do Post e a barra comum.
 *
 * A barra (fixa e flutuante) mora em `src/admin/comum/BarraDoEditor.jsx` e não
 * conhece domínio nenhum. Aqui o Blog entrega a ela o que é dele: a
 * configuração derivada do schema do Post (que já diz se há imagem, se há
 * destaque e com que cores), o mapa de ícones e a aparência de cada cor do
 * destaque. A assinatura é a de sempre (`editor`, `className`), e quem
 * importava daqui continua importando daqui.
 */

import BarraComum from "@/admin/comum/BarraDoEditor";
import * as configuracaoDoPost from "@/admin/blog/configuracao";
import { ICONES } from "@/admin/blog/icones";

/**
 * A aparência de cada cor de destaque, indexada pela cor: o rótulo em palavras
 * de gente e a pintura da amostra. QUAIS cores existem, e em que ordem, vem da
 * configuração (`coresDeDestaque`, derivada de `CORES_DE_DESTAQUE` do schema);
 * este mapa só diz como cada uma se apresenta.
 *
 * A amostra usa os MESMOS tokens que `.artigo mark[data-cor="…"]` usa
 * (`src/App.css`), nunca um valor livre escrito aqui: a cor que o Autor
 * escolhe no Popover é a cor que o artigo publicado mostra.
 */
const APARENCIA_DO_DESTAQUE = Object.freeze({
  amarelo: Object.freeze({ rotulo: "Amarelo", amostra: "bg-destaque-amarelo" }),
  verde: Object.freeze({ rotulo: "Verde", amostra: "bg-destaque-verde" }),
  azul: Object.freeze({ rotulo: "Azul", amostra: "bg-destaque-azul" }),
  rosa: Object.freeze({ rotulo: "Rosa", amostra: "bg-destaque-rosa" }),
});

export default function BarraDoEditor({ editor, className }) {
  return (
    <BarraComum
      editor={editor}
      className={className}
      configuracao={configuracaoDoPost}
      icones={ICONES}
      aparenciaDoDestaque={APARENCIA_DO_DESTAQUE}
    />
  );
}
