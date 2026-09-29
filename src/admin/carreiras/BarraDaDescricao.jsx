/**
 * A barra de ferramentas da Descrição da Vaga: a barra comum com a
 * configuração do vocabulário reduzido (Story 5.4).
 *
 * A barra (fixa e flutuante) mora em `src/admin/comum/BarraDoEditor.jsx` e
 * percorre os controles que a configuração DERIVOU do vocabulário: ela não tem
 * lista própria. Sem imagem e sem destaque na projeção, o botão de enviar
 * imagem e a paleta de cor simplesmente não nascem. `ICONES` é o mapa comum,
 * um superconjunto: a barra só o consulta pelas chaves que a projeção entrega.
 */

import BarraComum from "@/admin/comum/BarraDoEditor";
import { ICONES } from "@/admin/comum/icones";
import { configuracaoDaDescricao } from "@/admin/carreiras/configuracaoDaDescricao";

export default function BarraDaDescricao({ editor, className }) {
  return (
    <BarraComum
      editor={editor}
      className={className}
      configuracao={configuracaoDaDescricao}
      icones={ICONES}
    />
  );
}
