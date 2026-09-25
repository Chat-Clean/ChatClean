/**
 * O editor da Descrição da Vaga: a casca comum (`admin/comum/EditorDeTexto`)
 * ligada ao vocabulário reduzido (Story 5.4).
 *
 * Sem sobreposições: a prévia de arrasto e o punho de redimensionar existem
 * para imagem, e a Descrição não tem imagem. Sem extensão extra: o widget de
 * envio é do Blog. O que entra aqui é só o que a configuração derivou da
 * projeção, e o saneamento da entrada contra ela.
 *
 * O documento inicial é lido UMA vez pela casca; trocar de Vaga é trocar de
 * editor, e quem monta a tela faz isso pela `key`.
 */

import BarraDaDescricao from "@/admin/carreiras/BarraDaDescricao";
import {
  extensoesDaDescricao,
  opcoesDaDescricao,
} from "@/admin/carreiras/configuracaoDaDescricao";
import { prepararConteudoDaDescricao } from "@/admin/carreiras/conteudoDaDescricao";
import EditorDeTexto from "@/admin/comum/EditorDeTexto";

export default function EditorDaDescricao({ documento, aoMudar, aoAvisar, rotulo, className }) {
  return (
    <EditorDeTexto
      documento={documento}
      aoMudar={aoMudar}
      aoAvisar={aoAvisar}
      prepararConteudo={prepararConteudoDaDescricao}
      extensoes={extensoesDaDescricao()}
      opcoes={opcoesDaDescricao(rotulo ? { rotulo } : undefined)}
      barra={BarraDaDescricao}
      className={className}
    />
  );
}
