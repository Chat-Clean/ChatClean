/**
 * As situações do envio da capa e o que a tela diz em cada uma.
 *
 * Vive fora do componente pela convenção do projeto — arquivo de componente que
 * exporta função perde a recarga rápida e o lint cobra —, e porque é isto que
 * torna "a indicação de progresso não mente" uma regra EXECUTÁVEL: a
 * verificação importa `falaDoEnvio` e a chama, em vez de procurar um trecho de
 * JSX com uma expressão regular.
 *
 * ─── A INDICAÇÃO É INDETERMINADA, E ISSO É DECLARADO ────────────────────────
 *
 * Não há percentual aqui, e a ausência é o requisito. O cliente único do
 * projeto (`data/supabase/clientes.js`) não expõe progresso medido no envio ao
 * Storage; obtê-lo exigiria um terceiro jeito de falar com o Supabase — uma
 * superfície nova para autenticar e classificar erro, que é exatamente o que a
 * Story 2.12 argumentou contra. Com teto de 1 MB, "está enviando" é uma
 * indicação honesta, e uma barra que anda sozinha até 90% e para seria uma
 * medida que ninguém mediu.
 *
 * É por isso, também, que `src/components/ui/progress.jsx` não existe: o
 * invólucro do componente de progresso da biblioteca só se justifica quando há
 * valor a mostrar. O que a tela usa é uma região viva (`role="status"`), que é
 * o que anuncia "está acontecendo" sem afirmar quanto.
 */

/* A REGRA DO ENDEREÇO VEM DO DOMÍNIO, e nunca é reescrita aqui — nem o veredito
   (`enderecoDeImagemPermitido`) nem a fala de cada recusa
   (`problemaNoEnderecoDaImagem`), que moram lá ao lado de
   `problemaNoTextoAlternativo`. Este módulo só usa a leitura do endereço para
   decidir MODO DE TELA, que é o assunto dele. */
import { caminhoDaCapaNoEndereco } from "@/domain/blog/arquivos";

/** Nenhum envio em curso. */
export const ENVIO_PARADO = "capa-parado";
/** O arquivo está subindo. Sem percentual — ver o cabeçalho. */
export const ENVIO_EM_CURSO = "capa-enviando";
/** O arquivo foi recusado, ou o envio falhou. A frase vem junto. */
export const ENVIO_RECUSADO = "capa-recusado";

/**
 * O vocabulário FECHADO das situações.
 *
 * Os valores são prefixados por `capa-` de propósito: as outras máquinas de
 * situação do projeto (a prévia, o blog público) usam `carregando` e `falha`, e
 * uma colisão de valor faria a fala de uma tela responder pela outra sem nada
 * lançar. A verificação cobra interseção vazia.
 */
export const SITUACOES_DO_ENVIO = Object.freeze([
  ENVIO_PARADO,
  ENVIO_EM_CURSO,
  ENVIO_RECUSADO,
]);

export function ehSituacaoDoEnvio(valor) {
  return typeof valor === "string" && SITUACOES_DO_ENVIO.includes(valor);
}

/**
 * O que a tela diz enquanto o arquivo sobe.
 *
 * Uma frase só, e ela é do vocabulário — não "Enviando… 47%", que seria uma
 * medida inventada, nem "Aguarde", que não diz o que está acontecendo.
 */
export const FALA_DO_ENVIO_EM_CURSO = "Enviando a imagem…";

/**
 * A fala da situação, ou `""` quando não há o que dizer.
 *
 * Situação fora do vocabulário devolve `""` em vez de lançar: uma exceção aqui
 * derrubaria a gaveta inteira por causa de um rótulo, e gaveta em branco é pior
 * que rótulo faltando.
 */
export function falaDoEnvio(situacao) {
  return situacao === ENVIO_EM_CURSO ? FALA_DO_ENVIO_EM_CURSO : "";
}

/** O rótulo do seletor muda quando já existe capa: escolher vira trocar. */
export function rotuloDoSeletor(temCapa) {
  return temCapa ? "Trocar imagem" : "Escolher imagem";
}

/* ─── AS DUAS ORIGENS DA CAPA (Story 3.2) ────────────────────────────────────
 *
 * O campo de capa passou a ter dois modos: enviar um arquivo para o bucket, ou
 * informar um endereço já hospedado em outro lugar. O vocabulário é FECHADO
 * pela mesma razão que o das situações do envio — e prefixado pela mesma:
 * `arquivo` e `endereco` soltos colidiriam com meia dúzia de nomes das outras
 * telas, e uma colisão de valor faz a fala de uma responder pela outra sem nada
 * lançar.
 *
 * **O modo é estado de TELA, e não campo do Post.** O que vai para o servidor
 * continua sendo `imagem_url` e `imagem_alt`; o banco não sabe nem precisa
 * saber de onde a imagem veio. É por isso que ele não entra em
 * `CAMPOS_DA_GAVETA` nem em `corpoDoPedido`.
 */

/** A imagem sobe do computador do Autor para o bucket. */
export const ORIGEM_ENVIADA = "capa-de-arquivo";
/** A imagem já está hospedada em outro lugar; o Post guarda a referência. */
export const ORIGEM_DE_FORA = "capa-de-endereco";

/** O vocabulário FECHADO das origens, na ordem em que a tela as oferece. */
export const ORIGENS_DA_CAPA = Object.freeze([ORIGEM_ENVIADA, ORIGEM_DE_FORA]);

export function ehOrigemDaCapa(valor) {
  return typeof valor === "string" && ORIGENS_DA_CAPA.includes(valor);
}

/**
 * O rótulo de cada origem — o nome acessível do controle que a escolhe.
 *
 * Origem fora do vocabulário devolve `""` pela mesma razão que `falaDoEnvio`:
 * uma exceção aqui derrubaria a gaveta inteira por causa de um rótulo.
 */
export function rotuloDaOrigem(origem) {
  if (origem === ORIGEM_ENVIADA) return "Enviar arquivo";
  if (origem === ORIGEM_DE_FORA) return "Informar endereço";
  return "";
}

/** O nome acessível do grupo que escolhe entre as duas. */
export const ROTULO_DA_ORIGEM_DA_CAPA = "Origem da imagem de capa";

/** O rótulo do campo onde o endereço de fora é digitado. */
export const ROTULO_DO_ENDERECO_DA_CAPA = "Endereço da imagem";

/**
 * Em que modo o campo de capa nasce, dado o endereço que já está no formulário
 * e a raiz do NOSSO projeto.
 *
 * DERIVADO, e não guardado: um Post gravado com capa de fora precisa abrir com
 * o campo de endereço à vista e preenchido — abrir no modo de envio esconderia
 * do Autor exatamente o valor que ele foi editar.
 *
 * ─── A RAIZ É PEDIDA, E NÃO RECORTADA DO PRÓPRIO ENDEREÇO ──────────────────
 *
 * A primeira versão recortava a raiz de dentro do endereço com
 * `baseDoEnderecoPublico`, e o defeito era o que este docstring diz existir para
 * evitar: a capa de OUTRO projeto Supabase —
 * `https://outro.example/storage/v1/object/public/imagens-do-blog/capas/…` —
 * tem a forma exata da nossa e classificava como enviada, escondendo o endereço
 * num campo `readOnly`. Agora a comparação é com a raiz de verdade, que o
 * Editor pede à camada de dados.
 *
 * **Raiz desconhecida é "de fora", e não "nossa".** Sem `.env`, ou num
 * ambiente que não declara a URL, a resposta segura é a que mostra o endereço:
 * errar para o lado de exibir custa um campo a mais na tela; errar para o outro
 * esconde o valor. Sem capa nenhuma, o modo é o de envio, que é o comum.
 */
export function origemDoEndereco(endereco, base = "") {
  const texto = String(endereco ?? "").trim();
  if (texto === "") return ORIGEM_ENVIADA;
  return caminhoDaCapaNoEndereco(base, texto) === null
    ? ORIGEM_DE_FORA
    : ORIGEM_ENVIADA;
}

/* ─── O QUE A DEGRADAÇÃO ANUNCIA ─────────────────────────────────────────── */

/**
 * O nome acessível da caixa que substitui a imagem.
 *
 * A caixa da LISTAGEM é `aria-hidden`, e com razão: a linha inteira já diz o
 * título e a Categoria em texto, e anunciar a letra de novo seria repetição. Na
 * gaveta não há esse texto em volta — quem usa leitor de tela recebia silêncio
 * no lugar da capa, sem saber se ela existe, se sumiu ou se nunca foi posta.
 *
 * TRÊS falas, porque são três fatos diferentes: o Post não tem capa; a capa que
 * a pessoa escolheu não carregou; ou o endereço que ela digitou não serve. As
 * duas últimas vêm acompanhadas da frase que diz o que fazer — a do carregamento
 * ao lado da caixa, a do endereço colada ao campo. Esta só nomeia o desenhado.
 */
export const CAPA_AUSENTE = "capa-sem-imagem";
export const CAPA_QUE_NAO_CARREGOU = "capa-nao-carregou";
export const CAPA_COM_ENDERECO_RECUSADO = "capa-endereco-recusado";

/** O vocabulário FECHADO das três situações da caixa que substitui a imagem. */
export const SITUACOES_DA_CAPA_DEGRADADA = Object.freeze([
  CAPA_AUSENTE,
  CAPA_QUE_NAO_CARREGOU,
  CAPA_COM_ENDERECO_RECUSADO,
]);

const FALAS_DA_CAPA_DEGRADADA = Object.freeze({
  [CAPA_AUSENTE]: "Sem imagem de capa.",
  [CAPA_QUE_NAO_CARREGOU]: "A imagem de capa não carregou.",
  [CAPA_COM_ENDERECO_RECUSADO]: "O endereço informado não serve como imagem de capa.",
});

export function rotuloDaCapaDegradada({ categoria = "", situacao = CAPA_AUSENTE } = {}) {
  const nome = String(categoria ?? "").trim();
  const comCategoria = nome === "" ? "" : ` da categoria ${nome}`;
  /* Situação fora do vocabulário cai na ausência em vez de lançar, pela mesma
     razão de `falaDoEnvio`: uma exceção aqui derrubaria a gaveta inteira por
     causa de um rótulo. */
  const fala = FALAS_DA_CAPA_DEGRADADA[situacao] ?? FALAS_DA_CAPA_DEGRADADA[CAPA_AUSENTE];
  return `${fala} No lugar dela, o monograma${comCategoria}.`;
}

/**
 * O que a tela diz quando o endereço da capa não carrega.
 *
 * Um `<img>` com endereço morto desenha o ícone de imagem quebrada e mais
 * nada — e o Autor salvaria um Post cuja capa não existe achando que ela está
 * lá. A frase diz o que houve E o que fazer, como toda fala deste projeto.
 *
 * ─── ELA ACOMPANHA O MONOGRAMA, E NÃO O SUBSTITUI (Story 3.2) ──────────────
 *
 * O que ocupa o LUGAR da imagem passou a ser o monograma da Categoria — o mesmo
 * que a listagem desenha para o mesmo Post, e que ocupa exatamente o espaço que
 * a imagem ocuparia. A frase continua ao lado porque ela responde outra
 * pergunta: o monograma diz "é assim que este Post aparece sem capa", e a frase
 * diz "a capa que você escolheu não existe". Sem ela, endereço de fora que
 * apodreceu vira um Post salvo com capa morta e ninguém avisado.
 */
export const FALA_DA_CAPA_QUEBRADA =
  "A imagem de capa não carregou. Ela pode ter sido removida do servidor — envie outra ou tire a capa antes de salvar.";

/** O rótulo da ação que tira a capa do Post. */
export const ROTULO_DE_REMOVER_CAPA = "Remover imagem";

/**
 * O que se diz ao Autor quando o arquivo antigo NÃO saiu do servidor.
 *
 * O servidor registra o resíduo no log e o nomeia na resposta, e até aqui isso
 * bastava para o log e para o JSON — e não para a pessoa. "Registrado e
 * nomeado, nunca silencioso" só é verdade quando quem fez a operação fica
 * sabendo.
 *
 * A operação DEU CERTO: o Post saiu, ou a capa trocou. Por isso a fala é um
 * aviso ao lado da confirmação, e não uma falha — dizer "não deu" sobre algo
 * que deu faria a pessoa tentar de novo uma ação que já aconteceu.
 *
 * Devolve `null` quando não há resíduo, que é o caso normal.
 */
export function falaDoResiduo(residuo) {
  const arquivo = String(residuo?.arquivo ?? "").trim();
  if (arquivo === "") return null;
  return Object.freeze({
    oQueHouve: "A imagem antiga continua no servidor",
    oQueFazer:
      "A operação foi concluída, e só o arquivo anterior não saiu. " +
      `Avise quem cuida do projeto para remover ${arquivo} quando puder.`,
  });
}

/**
 * O texto alternativo que a miniatura usa enquanto o Autor ainda não descreveu
 * a imagem.
 *
 * A miniatura é decoração da própria tela de edição — quem está olhando para
 * ela acabou de escolher o arquivo. Repetir o endereço como descrição, ou
 * deixar `alt` ausente, faria o leitor de tela ler o caminho do arquivo.
 */
export function alternativoDaMiniatura(alternativo) {
  const texto = String(alternativo ?? "").trim();
  return texto === "" ? "Imagem de capa escolhida, ainda sem descrição" : texto;
}
