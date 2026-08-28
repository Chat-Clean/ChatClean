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
import { ROTULO_DA_CAPA, caminhoDaCapaNoEndereco } from "@/domain/blog/arquivos";

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

/**
 * O nome acessível do grupo que escolhe entre as duas origens.
 *
 * Recebe o nome do CAMPO porque a gaveta passou a ter dois controles de imagem
 * (Story 3.4): a Capa e a Imagem de Compartilhamento. Dois grupos de rádio com
 * o mesmo nome acessível fariam quem navega por leitor de tela ouvir "Origem da
 * imagem de capa" duas vezes e não ter como saber qual está operando.
 */
export function rotuloDoGrupoDeOrigem(nome) {
  return `Origem da ${String(nome ?? "").trim().toLowerCase()}`;
}

/** O nome acessível do grupo da CAPA — derivado, e não escrito de novo. */
export const ROTULO_DA_ORIGEM_DA_CAPA = rotuloDoGrupoDeOrigem(ROTULO_DA_CAPA);

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

/* ─── OS DOIS CAMPOS DE IMAGEM DA GAVETA (Story 3.4) ─────────────────────────
 *
 * A gaveta passou a ter DOIS controles de imagem, e os dois são o MESMO
 * controle: a Capa e a Imagem de Compartilhamento têm o mesmo vocabulário de
 * esquema, as mesmas duas origens, a mesma recusa antes do salvamento e a mesma
 * degradação. Um campo de texto cru para a segunda, ao lado de um controle de
 * dois modos para a primeira, seria a definição de sinônimo — e o Autor teria
 * de aprender duas maneiras de fazer a mesma coisa.
 *
 * O que muda entre eles é só o NOME, e é por isso que ele é parâmetro em toda
 * fala deste módulo.
 */

/**
 * Os nomes com que cada campo de imagem se identifica no documento.
 *
 * ─── POR QUE ELES SÃO DECLARADOS, E NÃO MONTADOS ─────────────────────────
 *
 * Os dois controles são o MESMO componente, e sem nomes distintos as duas
 * instâncias seriam indistinguíveis para quem lê o documento — a verificação,
 * que procura a miniatura da capa, acharia a da imagem de compartilhamento e
 * afirmaria sobre a errada. Montá-los por interpolação (`miniatura-de-${campo}`)
 * teria sido mais curto e teria renomeado `miniatura-da-capa`, que é um contrato
 * de tela fixado na Story 3.1 e lido em dez asserções — mudar contrato para
 * ganhar simetria de string é trocar o que importa pelo que é bonito.
 *
 * O mapa é FECHADO, e a verificação cobra que ele cubra os dois campos com
 * nomes que não se repetem.
 */
export const PAPEIS_DO_CAMPO_DE_IMAGEM = Object.freeze({
  imagem_url: Object.freeze({
    campo: "campo-da-capa",
    origem: "origem-da-capa",
    seletor: "arquivo-da-capa",
    miniatura: "miniatura-da-capa",
    quebrada: "capa-quebrada",
    ausente: "capa-ausente",
    degradada: "capa-degradada",
    ajudaDaAusencia: "ajuda-da-capa-ausente",
    envio: "envio-em-curso",
    recusaDaCadeia: "recusa-da-cadeia-da-capa",
  }),
  seo_imagem_url: Object.freeze({
    campo: "campo-da-imagem-de-seo",
    origem: "origem-da-imagem-de-seo",
    seletor: "arquivo-da-imagem-de-seo",
    miniatura: "miniatura-da-imagem-de-seo",
    quebrada: "imagem-de-seo-quebrada",
    ausente: "imagem-de-seo-ausente",
    degradada: "imagem-de-seo-degradada",
    ajudaDaAusencia: "ajuda-da-imagem-de-seo-ausente",
    envio: "envio-de-imagem-de-seo-em-curso",
    recusaDaCadeia: "recusa-da-cadeia-da-imagem-de-seo",
  }),
});

/** Os papéis de um campo de imagem, ou os da Capa como último recurso. */
export function papeisDoCampoDeImagem(campo) {
  return PAPEIS_DO_CAMPO_DE_IMAGEM[campo] ?? PAPEIS_DO_CAMPO_DE_IMAGEM.imagem_url;
}

/** O identificador do seletor de arquivo de cada campo de imagem. */
export function nomeDoSeletorDeArquivo(campo) {
  return papeisDoCampoDeImagem(campo).seletor;
}

/** Os campos do Post que a gaveta oferece pelo controle de imagem, na ordem. */
export const CAMPOS_DE_IMAGEM_DA_GAVETA = Object.freeze(
  Object.keys(PAPEIS_DO_CAMPO_DE_IMAGEM),
);

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

/**
 * A fala de cada situação, montada a partir do NOME do campo.
 *
 * O nome é parâmetro desde a Story 3.4, quando a gaveta ganhou um segundo
 * controle de imagem: uma caixa degradada que dissesse "imagem de capa" no
 * lugar da Imagem de Compartilhamento anunciaria o campo errado — e quem usa
 * leitor de tela não teria como saber qual dos dois falhou.
 */
const FALAS_DA_CAPA_DEGRADADA = Object.freeze({
  [CAPA_AUSENTE]: (nome) => `Sem ${nome}.`,
  [CAPA_QUE_NAO_CARREGOU]: (nome) => `A ${nome} não carregou.`,
  [CAPA_COM_ENDERECO_RECUSADO]: (nome) => `O endereço informado não serve como ${nome}.`,
});

/**
 * O nome padrão do campo de imagem: a Capa, que é quem existia primeiro.
 *
 * DERIVADO de `ROTULO_DA_CAPA`, do domínio — as falas deste módulo escrevem o
 * nome em minúsculas no meio da frase, e o rótulo da tela o escreve
 * capitalizado. São duas apresentações de UM nome, e não dois nomes.
 */
export const NOME_DA_CAPA = ROTULO_DA_CAPA.toLowerCase();

export function rotuloDaCapaDegradada({
  categoria = "",
  situacao = CAPA_AUSENTE,
  nome = NOME_DA_CAPA,
} = {}) {
  const categoriaNomeada = String(categoria ?? "").trim();
  const comCategoria = categoriaNomeada === "" ? "" : ` da categoria ${categoriaNomeada}`;
  /* Situação fora do vocabulário cai na ausência em vez de lançar, pela mesma
     razão de `falaDoEnvio`: uma exceção aqui derrubaria a gaveta inteira por
     causa de um rótulo. */
  const fala = FALAS_DA_CAPA_DEGRADADA[situacao] ?? FALAS_DA_CAPA_DEGRADADA[CAPA_AUSENTE];
  return `${fala(String(nome ?? NOME_DA_CAPA).trim().toLowerCase())} No lugar dela, o monograma${comCategoria}.`;
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
export function falaDaImagemQuebrada(nome = NOME_DA_CAPA) {
  return (
    `A ${String(nome ?? NOME_DA_CAPA).trim().toLowerCase()} não carregou. ` +
    "Ela pode ter sido removida do servidor, envie outra ou tire a imagem antes de salvar."
  );
}

/** A fala da CAPA quebrada — derivada, e não escrita de novo. */
export const FALA_DA_CAPA_QUEBRADA = falaDaImagemQuebrada(NOME_DA_CAPA);

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
export function alternativoDaMiniatura(alternativo, nome = ROTULO_DA_CAPA) {
  const texto = String(alternativo ?? "").trim();
  if (texto !== "") return texto;
  /* O nome chega JÁ COMO A TELA O ESCREVE, e não é levantado aqui: extrair a
     primeira letra e passá-la para maiúscula é a forma do MONOGRAMA, que mora
     num arquivo só (`listagem.js`) e é cobrada por varredura em
     `verificar:interface`. Uma capitalização inocente aqui acusaria lá — e a
     varredura estaria certa: é assim que a segunda implementação começa. */
  return `${String(nome ?? "").trim()} escolhida, ainda sem descrição`;
}
