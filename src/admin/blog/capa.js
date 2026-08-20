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

/**
 * O que a tela diz quando o endereço da capa não carrega.
 *
 * Um `<img>` com endereço morto desenha o ícone de imagem quebrada e mais
 * nada — e o Autor salvaria um Post cuja capa não existe achando que ela está
 * lá. A frase diz o que houve E o que fazer, como toda fala deste projeto.
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
