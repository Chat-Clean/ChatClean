/**
 * A Tag digitada: como um texto com vírgulas vira uma lista de Tags.
 *
 * Domínio puro (AD-1), e ele mora aqui — e não em `admin/blog` junto das frases
 * da tela — por uma razão estrutural: **quem normaliza é a tela E o servidor**.
 * A gaveta separa por vírgula e mostra o que vai ser gravado; a função de
 * escrita recebe NOMES pela rede e precisa chegar exatamente ao mesmo resultado,
 * inclusive para quem não passou pela tela. Uma segunda regra no servidor
 * divergiria da do Painel, e a divergência apareceria como uma Tag duplicada no
 * banco — defeito que não tem como desfazer sozinho.
 *
 * `api/` não pode importar de `admin/blog` (é a direção proibida) e não pode
 * importar `lucide-react`. `domain/blog` é o único lugar que os dois lados
 * alcançam.
 *
 * ─── DIGITAR TAG É MUDANÇA DE MODELO, NÃO DE WIDGET ─────────────────────────
 *
 * Até a Story 2.13 a tela escolhia **identificadores** de Tags que já existiam,
 * e o banco recusava qualquer identificador desconhecido. Digitar produz
 * **nomes**: alguém tem de normalizar, procurar a que já existe e criar a que
 * falta. Isso é escrita, então é a porta única — o widget é a parte pequena.
 *
 * ─── A CHAVE DE IGUALDADE É O SLUG, E NÃO O NOME ────────────────────────────
 *
 * "Atendimento", "atendimento" e "ATENDIMENTO " são a mesma Tag. Quem decide
 * isso é `gerarSlug`, a MESMA função que o Post usa para o endereço — não uma
 * segunda regra de normalização escrita aqui. É por isso que `tags.slug` tem
 * unicidade no banco e `tags.nome` não: o slug é a identidade, o nome é a
 * grafia escolhida por quem cadastrou primeiro.
 */

import { gerarSlug } from "./slug.js";

/** O separador que a tela oferece e que o servidor entende. Um só. */
export const SEPARADOR_DE_TAGS = ",";

/** O teto de `tags_nome_nao_vazio`, no banco. Escrito uma vez. */
export const TAMANHO_MAXIMO_DO_NOME_DE_TAG = 80;

/**
 * Quantas Tags um Post aceita.
 *
 * Ele morava só no servidor, e a gaveta desenhava as pílulas sem aviso até a
 * gravação falhar — quem digitou trinta e uma descobria depois de escrever o
 * artigo inteiro. Este módulo existe para a tela e o servidor não discordarem;
 * o teto é parte do que eles precisam concordar.
 *
 * Acima disso a lista deixou de classificar e passou a ser texto livre com
 * vírgulas.
 */
export const LIMITE_DE_TAGS = 30;

/**
 * O nome como ele fica gravado: aparado, com espaço interno colapsado.
 *
 * Colapsar o espaço interno não é capricho de estilo — "inteligência  artificial"
 * e "inteligência artificial" produzem o MESMO slug, então sem o colapso as duas
 * grafias disputariam a mesma linha da tabela e a segunda seria recusada por
 * unicidade, com o Autor lendo um erro de banco sobre um espaço que ele não vê.
 */
export function normalizarNomeDeTag(valor) {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}

/**
 * A chave de igualdade de uma Tag — o slug — ou `""` quando o nome não produz
 * nenhum.
 *
 * Nunca lança: ela roda a cada tecla enquanto o Autor digita, e uma exceção ali
 * derrubaria a gaveta no meio de uma palavra.
 */
export function chaveDaTag(nome) {
  const limpo = normalizarNomeDeTag(nome);
  if (limpo === "") return "";
  const gerado = gerarSlug(limpo);
  return gerado.ok ? gerado.slug : "";
}

/**
 * O que impede este texto de ser Tag, ou `null` quando nada impede.
 *
 * A frase, e não um booleano: a tela precisa dizer qual das Tags digitadas não
 * serve, e o servidor precisa recusar com a mesma frase.
 */
export function problemaNaTag(valor) {
  const limpo = normalizarNomeDeTag(valor);
  if (limpo === "") return "Uma tag não pode ficar vazia.";
  if (limpo.length > TAMANHO_MAXIMO_DO_NOME_DE_TAG) {
    return `A tag “${limpo.slice(0, 20)}…” passa de ${TAMANHO_MAXIMO_DO_NOME_DE_TAG} caracteres. Encurte antes de salvar.`;
  }
  if (chaveDaTag(limpo) === "") {
    return `A tag “${limpo}” não tem nenhuma letra ou número. Escreva uma palavra.`;
  }
  return null;
}

/**
 * O texto digitado, separado por vírgula, virando a lista de nomes de Tag.
 *
 * Três regras, e as três são o motivo de a função existir:
 *
 *   - **separa por vírgula**, e só por vírgula: quebra de linha e ponto e
 *     vírgula não são separadores, porque "Vendas; Marketing" digitado por
 *     engano viraria uma Tag chamada "Vendas; Marketing" e a pessoa veria o
 *     resultado na hora, em vez de descobrir uma regra secreta;
 *   - **normaliza** cada pedaço;
 *   - **colapsa a repetida** pela CHAVE, preservando a primeira grafia: quem
 *     digita "Vendas, vendas" quis uma Tag, não duas.
 *
 * Pedaço vazio some sem virar Tag — a vírgula final é o jeito normal de digitar
 * uma lista, e recusá-la seria brigar com quem escreve.
 *
 * Devolve `{ nomes, problemas }`: a lista pronta e o que foi recusado, com a
 * frase. Nunca lança, e nunca descarta em silêncio — Tag que some sem aviso é
 * descoberta quando o Post já está no ar.
 */
export function separarTags(texto) {
  const bruto = typeof texto === "string" ? texto : "";
  const nomes = [];
  const problemas = [];
  const vistas = new Set();

  for (const pedaco of bruto.split(SEPARADOR_DE_TAGS)) {
    const nome = normalizarNomeDeTag(pedaco);
    if (nome === "") continue;
    const problema = problemaNaTag(nome);
    if (problema !== null) {
      if (!problemas.includes(problema)) problemas.push(problema);
      continue;
    }
    const chave = chaveDaTag(nome);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    nomes.push(nome);
  }

  /* O TETO VALE SOBRE O QUE VAI SER GRAVADO, e não sobre o que foi digitado.
     Contá-lo antes do colapso faria "vendas, vendas, vendas…" trinta e uma
     vezes ser recusado como trinta e uma Tags, quando o que chega ao banco é
     uma. A recusa nomeia o teto em vez de cortar em silêncio: uma lista que
     encolhe sozinha é descoberta na volta ao Editor. */
  if (nomes.length > LIMITE_DE_TAGS) {
    problemas.push(
      `Um post aceita no máximo ${LIMITE_DE_TAGS} tags. Escolha as que classificam de verdade.`,
    );
  }

  return { nomes, problemas };
}

/**
 * A lista de nomes de volta ao texto do campo.
 *
 * Vírgula e espaço, sempre — é a forma que `separarTags` lê de volta sem
 * mudar nada, e é o que faz o campo ser idempotente entre uma abertura e outra.
 */
export function textoDasTags(nomes) {
  const lista = Array.isArray(nomes) ? nomes : [];
  return lista
    .map((n) => normalizarNomeDeTag(typeof n === "string" ? n : (n?.nome ?? "")))
    .filter((n) => n !== "")
    .join(`${SEPARADOR_DE_TAGS} `);
}
