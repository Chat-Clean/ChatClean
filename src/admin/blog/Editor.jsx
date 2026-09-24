/**
 * O Editor visual do Post: a ligação fina entre o vocabulário do Post e a
 * casca comum (`src/admin/comum/EditorDeTexto.jsx`).
 *
 * A casca (aviso, barra, página que rola, esqueleto, rolagem ao arrastar) não
 * conhece domínio nenhum. Aqui fica o que é só do Blog: as extensões e as
 * opções derivadas do schema do Post, o widget de envio de imagem, a prévia do
 * arrasto, o punho de redimensionar e o saneamento da entrada contra o schema
 * do Post. A assinatura é a de sempre (`documento`, `aoMudar`, `aoAvisar`,
 * `rotulo`, `className`), e o Blog não muda de comportamento.
 */

import BarraDoEditor from "@/admin/blog/BarraDoEditor";
import { extensoesDoEditor, opcoesDoEditor } from "@/admin/blog/configuracao";
import { prepararConteudo } from "@/admin/blog/conteudo";
import { ExtensaoDeUploadDeImagem } from "@/admin/blog/extensaoDeUploadDeImagem";
import PreviaDeArrasto from "@/admin/blog/PreviaDeArrasto";
import PunhoDeRedimensionar from "@/admin/blog/PunhoDeRedimensionar";
import EditorDeTexto from "@/admin/comum/EditorDeTexto";

/**
 * O que se desenha junto do texto do Post. A prévia do arrasto e o punho de
 * redimensionar ficam fora de `configuracao.js` porque aquele arquivo precisa
 * continuar Node-executável, sem React; os dois se desenham em
 * `position: fixed`, então o lugar na árvore não decide onde aparecem.
 */
function sobreposicoesDoPost(editor) {
  return (
    <>
      <PreviaDeArrasto />
      <PunhoDeRedimensionar editor={editor} />
    </>
  );
}

export default function Editor({
  documento,
  aoMudar,
  aoAvisar,
  rotulo = "Conteúdo do post",
  className,
}) {
  return (
    <EditorDeTexto
      documento={documento}
      aoMudar={aoMudar}
      aoAvisar={aoAvisar}
      prepararConteudo={prepararConteudo}
      /* `ExtensaoDeUploadDeImagem` entra AQUI, e não dentro de
         `extensoesDoEditor()`: o widget de upload tem um NodeView em React, e
         `configuracao.js` precisa continuar Node-executável, sem JSX. O widget
         é EFÊMERO (nunca aparece em `NOS_PERMITIDOS`), então ele não precisa
         estar na lista que a verificação cruza contra o schema. */
      extensoes={[...extensoesDoEditor(), ExtensaoDeUploadDeImagem]}
      opcoes={opcoesDoEditor({ rotulo })}
      barra={BarraDoEditor}
      sobreposicoes={sobreposicoesDoPost}
      className={className}
    />
  );
}
