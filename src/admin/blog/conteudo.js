/**
 * O que fazer com o conteúdo que chega de fora, antes de ele entrar no Editor.
 *
 * Vive em módulo próprio, e não dentro de `Editor.jsx`, pela mesma razão que o
 * hook de sessão vive fora do provedor: arquivo de componente que exporta
 * função perde a recarga rápida em desenvolvimento, e o lint cobra. A função
 * também é pura — a verificação a importa e executa sem montar React nenhum.
 *
 * **Por que higienizar a entrada não é zelo excessivo.** O Tiptap constrói o
 * documento com `Node.fromJSON`, e um nó que o schema não conhece faz esse
 * caminho estourar. Medido: o Tiptap não deixa o erro subir — ele o captura,
 * avisa no console e monta o editor **vazio**. Sem esta função, um post gravado
 * com uma tabela dentro abriria em branco, sem uma palavra na tela, e o Autor
 * descobriria a perda só depois de salvar por cima.
 */

import { documentoVazio, validarDocumento } from "@/domain/blog/schema";

/**
 * Junta os nomes do que foi removido numa frase curta.
 *
 * Só nó e marca entram: atributo descartado é o conteúdo ficando mais limpo,
 * não sumindo, e contá-lo inflava o aviso — um `h1` aparecia como dois trechos
 * removidos, porque o nível cai antes do nó. O parêntese de diagnóstico
 * (`heading (atributo obrigatório fora do schema)`) é cortado: ele existe para
 * quem investiga, não para quem escreve.
 */
function nomear(descartados, truncado) {
  const nomes = [
    ...new Set(
      descartados
        .filter((d) => d.especie !== "atributo")
        .map((d) => d.nome.replace(/\s*\(.*$/u, "").trim()),
    ),
  ];
  const mostrados = nomes.slice(0, 4).join(", ");
  // O teto do relatório é dito, e não escondido: com a lista truncada, a
  // enumeração pode estar incompleta mesmo que a contagem esteja certa.
  return nomes.length > 4 || truncado ? `${mostrados} e outros` : mostrados;
}

/**
 * Sana o documento que chega de fora e devolve, junto, o que precisa ser dito
 * ao Autor.
 *
 * Nenhum dos dois casos é silencioso, e é essa a diferença em relação a
 * registrar no console: conteúdo que some sem aviso vira perda permanente no
 * primeiro salvamento da Story 2.5, e o Autor descobre depois de publicado.
 */
export function prepararConteudo(documento) {
  if (documento === undefined) return { documento: documentoVazio(), aviso: null };

  const resultado = validarDocumento(documento);

  if (!resultado.ok) {
    return {
      documento: documentoVazio(),
      aviso: {
        gravidade: "recusado",
        mensagem:
          "Não conseguimos ler o conteúdo gravado deste post, então o Editor abriu vazio. " +
          "Salvar agora substitui o conteúdo original — se ele importa, saia sem salvar e avise quem cuida dos dados.",
        detalhe: resultado.erro.detalhe,
      },
    };
  }

  if (resultado.totalDescartado > 0) {
    return {
      documento: resultado.documento,
      aviso: {
        gravidade: "limpo",
        mensagem:
          `Removemos ${resultado.totalDescartado} trecho(s) que este editor não guarda: ` +
          `${nomear(resultado.descartados, resultado.descartadosTruncados)}. ` +
          "O resto do post está aqui inteiro; salvar grava exatamente o que você está vendo.",
        detalhe: "",
      },
    };
  }

  return { documento: resultado.documento, aviso: null };
}
