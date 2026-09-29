/**
 * O que fazer com o conteúdo que chega de fora, antes de ele entrar no editor:
 * o núcleo comum, sem vocabulário.
 *
 * Este módulo não importa nada. O validador, o documento vazio e as frases
 * chegam por parâmetro, de quem conhece o vocabulário (`admin/blog/conteudo.js`,
 * por exemplo): `admin/comum` não importa `domain/` (emenda a AD-15).
 *
 * **Por que higienizar a entrada não é zelo excessivo.** O Tiptap constrói o
 * documento com `Node.fromJSON`, e um nó que o schema não conhece faz esse
 * caminho estourar. Medido: o Tiptap não deixa o erro subir; ele o captura,
 * avisa no console e monta o editor **vazio**. Sem o saneamento, um documento
 * gravado com uma tabela dentro abriria em branco, sem uma palavra na tela, e
 * quem escreve descobriria a perda só depois de salvar por cima.
 *
 * Arquivo `.js` e sem import nenhum: o Node o importa e a verificação executa o
 * fabricador com o validador que quiser.
 */

/**
 * Junta os nomes do que foi removido numa frase curta.
 *
 * Só nó e marca entram: atributo descartado é o conteúdo ficando mais limpo,
 * não sumindo, e contá-lo inflava o aviso (um `h1` aparecia como dois trechos
 * removidos, porque o nível cai antes do nó). O parêntese de diagnóstico
 * (`heading (atributo obrigatório fora do schema)`) é cortado: ele existe para
 * quem investiga, não para quem escreve.
 */
export function nomearDescartados(descartados, truncado) {
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
 * Fabrica o `prepararConteudo` de um vocabulário.
 *
 *   `validar(documento)`   o validador do vocabulário, com o contrato de
 *                          `validarDocumentoNoVocabulario`: nunca lança, e
 *                          devolve `{ ok, documento, descartados,
 *                          totalDescartado, descartadosTruncados }` ou
 *                          `{ ok: false, erro }`;
 *   `documentoVazio()`     o documento com que o editor abre quando não há o
 *                          que abrir;
 *   `mensagens.recusado`   a frase de quando a entrada não é documento;
 *   `mensagens.limpo({ total, nomes })`  a frase de quando algo saiu.
 *
 * Parâmetro que falta é defeito de quem liga o vocabulário, e aparece na
 * CRIAÇÃO, com nome, e não na primeira vez que alguém abre um documento.
 */
export function criarPrepararConteudo({ validar, documentoVazio, mensagens } = {}) {
  if (typeof validar !== "function") {
    throw new TypeError("criarPrepararConteudo: `validar` precisa ser uma função.");
  }
  if (typeof documentoVazio !== "function") {
    throw new TypeError("criarPrepararConteudo: `documentoVazio` precisa ser uma função.");
  }
  if (typeof mensagens?.recusado !== "string" || typeof mensagens?.limpo !== "function") {
    throw new TypeError(
      "criarPrepararConteudo: `mensagens` precisa trazer `recusado` (texto) e `limpo` (função).",
    );
  }

  /**
   * Sana o documento que chega de fora e devolve, junto, o que precisa ser
   * dito a quem escreve.
   *
   * Nenhum dos dois casos é silencioso, e é essa a diferença em relação a
   * registrar no console: conteúdo que some sem aviso vira perda permanente no
   * primeiro salvamento.
   */
  return function prepararConteudo(documento) {
    if (documento === undefined) return { documento: documentoVazio(), aviso: null };

    const resultado = validar(documento);

    if (!resultado.ok) {
      return {
        documento: documentoVazio(),
        aviso: {
          gravidade: "recusado",
          mensagem: mensagens.recusado,
          detalhe: resultado.erro.detalhe,
        },
      };
    }

    if (resultado.totalDescartado > 0) {
      return {
        documento: resultado.documento,
        aviso: {
          gravidade: "limpo",
          mensagem: mensagens.limpo({
            total: resultado.totalDescartado,
            nomes: nomearDescartados(resultado.descartados, resultado.descartadosTruncados),
          }),
          detalhe: "",
        },
      };
    }

    return { documento: resultado.documento, aviso: null };
  };
}
