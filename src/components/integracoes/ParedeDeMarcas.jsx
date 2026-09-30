import { useRef } from "react";
import { COLUNAS_DE_MARCAS } from "./colunas";
import { useLupaDasMarcas } from "./useLupaDasMarcas";

/**
 * A parede de marcas das integrações, em colunas desencontradas, com a lupa
 * que faz as marcas perto do cursor crescerem (`useLupaDasMarcas`).
 *
 * Usada na seção da home e no topo de `/integracoes`: é a mesma peça nos
 * dois lugares, para quem clica em "Ver todas as integrações" reconhecer o
 * que acabou de ver. O tamanho de cada quadro vem da largura de quem a
 * contém (`.integracoes-palco`, em `index.css`).
 */
export default function ParedeDeMarcas() {
  const refDaParede = useRef(null);
  useLupaDasMarcas(refDaParede);
  return (
    // Leitor de tela: uma lista com o nome de cada ferramenta. A arrumação
    // em colunas é só visual.
    <div ref={refDaParede} role="list" aria-label="Algumas das ferramentas integradas" className="integracoes-parede">
      {COLUNAS_DE_MARCAS.map((coluna, indice) => (
        <div key={indice} className="integracoes-coluna">
          {coluna.map((marca) => (
            <div key={marca.nome} role="listitem" className="integracao-marca">
              {/* O nome é lido pelo `alt`; a imagem não é link nem arrasta,
                  porque a parede só mostra, não navega. */}
              <img
                src={marca.imagem}
                alt={marca.nome}
                width="64"
                height="64"
                loading="lazy"
                decoding="async"
                draggable="false"
                className="integracao-desenho"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
