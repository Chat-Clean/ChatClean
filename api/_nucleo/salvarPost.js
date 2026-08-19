/**
 * O núcleo da escrita: o ÚNICO caminho pelo qual um Post é gravado.
 *
 * Nenhum cliente escreve. A RLS da Story 2.1 nega escrita a `anon` e a
 * `authenticated`, e isso é deliberado — não há política de escrita, e o
 * privilégio foi revogado inclusive de `PUBLIC`. Esta função grava com a chave
 * de serviço, e é por isso que ela carrega o peso inteiro da verificação:
 *
 *   1. confere o token do chamador **contra o Supabase, no servidor**;
 *   2. valida o documento contra o schema fechado de `domain/blog` — a MESMA
 *      função que o Editor usa, importada, não uma segunda implementação;
 *   3. **deriva** `conteudo_html` pelo renderizador único;
 *   4. resolve o Autor no servidor;
 *   5. grava documento e HTML **na mesma operação**.
 *
 * ─── Por que o núcleo é separado do invólucro da plataforma ─────────────────
 *
 * Uma função escrita diretamente no formato da Vercel só é exercitável
 * publicando ou emulando a plataforma. Com o núcleo separado, a verificação
 * chama a MESMA lógica que roda em produção, com sessão real e banco real — e o
 * invólucro que fica sem cobertura (`api/posts.js`) é fino o bastante para ser
 * lido de uma vez.
 *
 * Este módulo não conhece requisição, resposta, cabeçalho nem `process.env`. Ele
 * recebe o token, o corpo e o acesso, e devolve um resultado tipado.
 *
 * ─── O que este módulo NÃO faz, de propósito ────────────────────────────────
 *
 * A capa e o SEO continuam de fora, dos Épicos 3 e 4. A lista de campos aceitos
 * é FECHADA, e o que vem fora dela é ignorado e relatado — nunca gravado. O
 * Autor continua sendo resolvido aqui, e `autor_id`/`autor_nome` do cliente
 * continuam ignorados.
 *
 * ─── O que a Story 2.8 acrescentou: a TRANSIÇÃO ─────────────────────────────
 *
 * `estado` passou a ser aceito — **validado contra a máquina de transições de
 * `domain/blog/transicoes.js`**, a mesma que a tela consulta para desenhar os
 * botões. O Estado de partida é o que está GRAVADO (ou `rascunho`, na criação),
 * nunca o que o cliente diz que era, e transição fora da máquina é recusada com
 * erro tipado, sem gravar nada. Validar só na tela deixaria a regra a um
 * `fetch` de distância de ser contornada.
 *
 * Duas regras de data vêm junto, e as duas são sobre a listagem:
 *
 *   * salvar alterações de um Post **publicado** não escreve `publicado_em` —
 *     a coluna nem entra no comando. A listagem ordena por essa data, e uma
 *     correção de vírgula que reescrevesse a data faria o Post pular para o
 *     topo do blog como se fosse novo;
 *   * ir para **publicado** exige data no passado: se a efetiva for nula ou
 *     recente demais, o instante vira agora menos a margem de relógio (ver
 *     `MARGEM_DE_RELOGIO_MS`). "Publicar agora" que deixasse a data no futuro
 *     gravaria um Post que se diz publicado e continua invisível pela política
 *     de leitura. Republicar um arquivado com data antiga **conserva** a data
 *     antiga, e é por isso que a regra olha o futuro, não a nulidade.
 *
 * ─── O que a Story 2.9 acrescentou: AGENDAR PARA TRÁS NÃO COLA ──────────────
 *
 * Marcar um agendamento para um instante já vencido é recusado aqui, com erro
 * próprio — distinto de "faltou data" — e com a saída nomeada: a recusa carrega
 * `alternativa: "publicar"`, a chave da ação da máquina que põe o Post no ar
 * agora, que é quase sempre o que a pessoa queria. Recusar sem dizer o que
 * fazer em seguida é um beco.
 *
 * A publicação na hora marcada continua sendo **decorrência da política de
 * leitura**, e não trabalho deste módulo: não há cron, gatilho nem processo que
 * troque `agendado` por `publicado`. Um Post agendado cuja hora chegou é
 * visível porque `estado in ('publicado','agendado') and publicado_em <= now()`
 * o inclui — e é por isso que ele continua salvável depois de vencido.
 *
 * ─── O que a Story 2.6 acrescentou ──────────────────────────────────────────
 *
 * Os metadados do Post (`categoria_id`, `tags`, `publicado_em`, `tempo_leitura`)
 * passaram a ser aceitos, e o ciclo de vida do endereço passou a existir por
 * inteiro:
 *
 *   * colisão de Slug é detectada **antes de gravar**, contra Post ativo e
 *     contra Slug aposentado — com a exceção deliberada do Post que retoma um
 *     endereço que já foi dele;
 *   * trocar o Slug de um Post que já esteve no ar **aposenta o anterior**, na
 *     mesma transação, pela função de banco `aposentar_slug_do_post`. A 2.5
 *     recusava essa troca porque o PostgREST não escreve em duas tabelas
 *     atomicamente; a função de banco é o que faltava.
 */

import {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
} from "../../src/data/blog/resultado.js";
/* O formato do endereço vem do DOMÍNIO, não de uma quarta cópia da expressão
   regular escrita aqui. A tela gera o Slug com `gerarSlug`, este módulo o
   valida com o mesmo formato, e o banco o impõe em `posts_slug_formato`: os
   três precisam concordar, e a única forma de garantir isso é não haver três. */
import {
  FORMATO_DE_SLUG,
  TAMANHO_MAXIMO_DO_SLUG,
} from "../../src/domain/blog/slug.js";
/* As regras da Tag digitada vêm do DOMÍNIO — as MESMAS que a gaveta usa para
   separar por vírgula e mostrar o que vai ser gravado. Uma segunda
   normalização aqui faria a tela e o servidor discordarem sobre o que é a
   mesma Tag, e a divergência apareceria como duas linhas em `tags` que ninguém
   consegue juntar depois. */
import {
  LIMITE_DE_TAGS,
  chaveDaTag,
  normalizarNomeDeTag,
  problemaNaTag,
} from "../../src/domain/blog/tags.js";
/* A máquina de transições vem do DOMÍNIO, e é a MESMA que a tela consulta. Uma
   segunda tabela escrita aqui divergiria da barra de ações na primeira mudança,
   e a divergência apareceria como botão que falha — ou, pior, como transição
   que a barra não oferece e o servidor aceita. */
import { ESTADOS, ehEstado } from "../../src/domain/blog/estados.js";
import {
  ACAO_PUBLICAR,
  ESTADO_INICIAL,
  exigeDataDePublicacao,
  motivoDaRecusa,
  transicaoPermitida,
} from "../../src/domain/blog/transicoes.js";
/* O fuso vem do DOMÍNIO, e é o mesmo módulo que a gaveta usa. A recusa de uma
   data passada devolve a data POR EXTENSO — é assim que quem digitou "hoje às
   9h" por engano vê que o sistema entendeu hoje de manhã, e não amanhã. */
import { formatarDataEHoraPorExtenso } from "../../src/domain/blog/formato.js";
import { derivarHtml } from "../../src/render/blog/paraHtml.js";

/* ─── O vocabulário de erro ──────────────────────────────────────────────── */
//
// Os cinco primeiros são IMPORTADOS de `data/blog/resultado.js`, e não
// reescritos: as duas camadas falam com a mesma tela, e duas grafias de
// "permissao" seriam duas telas diferentes para a mesma coisa.
//
// Os dois últimos são novos porque uma ESCRITA tem modos de falha que uma
// leitura não tem: entrada que não serve, e colisão com o que já está gravado.
// A divergência é deliberada e está registrada aqui para não ser lida como
// esquecimento.

export const ERRO_DADOS_INVALIDOS = "dados_invalidos";
export const ERRO_CONFLITO = "conflito";

/* Os cinco importados são REEXPORTADOS aqui para que quem consome a escrita
   tenha um lugar só de onde tirar o vocabulário inteiro. Sem isto, o invólucro
   importaria cinco nomes de um módulo e dois de outro — e a próxima pessoa
   escreveria `"permissao"` à mão. */
export {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
};

export const TIPOS_DE_ERRO = Object.freeze([
  ERRO_REDE,
  ERRO_PERMISSAO,
  ERRO_NAO_ENCONTRADO,
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_DADOS_INVALIDOS,
  ERRO_CONFLITO,
]);

/**
 * A frase padrão de cada tipo. Voz direta: diz o que houve e o que fazer.
 *
 * A frase de `permissao` é a MESMA para pedido sem token e para token forjado ou
 * vencido, e isso é requisito: distinguir os dois na resposta diria a quem
 * tenta se o token que ele inventou tem forma válida.
 */
const MENSAGENS = Object.freeze({
  [ERRO_REDE]:
    "Não conseguimos falar com o servidor para salvar. Tente de novo em instantes.",
  [ERRO_PERMISSAO]:
    "Sua sessão não autoriza esta gravação. Entre no Painel de novo e tente salvar.",
  [ERRO_NAO_ENCONTRADO]:
    "Este post não existe mais. Ele pode ter sido apagado por outra pessoa.",
  [ERRO_CONFIGURACAO]:
    "O servidor de gravação está sem configuração. Avise quem cuida da publicação.",
  [ERRO_INESPERADO]:
    "Algo saiu do previsto ao salvar. O conteúdo continua aqui — tente de novo.",
  [ERRO_DADOS_INVALIDOS]:
    "Não conseguimos salvar com o que foi enviado. Confira os campos e tente de novo.",
  [ERRO_CONFLITO]:
    "Já existe um post com este endereço. Escolha outro antes de salvar.",
});

export function ehTipoDeErro(valor) {
  return typeof valor === "string" && TIPOS_DE_ERRO.includes(valor);
}

/**
 * Falha tipada.
 *
 * `detalhe` existe para DIAGNÓSTICO e não para a tela: o invólucro registra e
 * não devolve. Tipo fora da lista não lança — vira `inesperado` com o valor
 * recebido no detalhe, pelo mesmo motivo que em `data/blog/resultado.js`.
 *
 * `alternativa` é a SAÍDA que a recusa oferece, e a única coisa deste objeto
 * que a tela executa: a chave de uma ação da máquina de transições (hoje só
 * `publicar`). Ela viaja pelo invólucro junto de `tipo` e `mensagem` porque uma
 * recusa sem saída obriga a pessoa a adivinhar o próximo passo — e quem sabe
 * qual é a saída é quem recusou. A tela a procura na tabela do Estado atual
 * antes de desenhar botão nenhum, então este campo não manda nada: ele nomeia.
 */
export function falha(
  tipo,
  {
    mensagem = "",
    detalhe = "",
    faltando = null,
    codigo = "",
    status = null,
    alternativa = null,
  } = {},
) {
  const valido = ehTipoDeErro(tipo);
  const t = valido ? tipo : ERRO_INESPERADO;
  const propria = typeof mensagem === "string" && mensagem.trim() !== "" ? mensagem : null;
  const erro = {
    tipo: t,
    mensagem: propria ?? MENSAGENS[t],
    detalhe: valido
      ? String(detalhe ?? "")
      : `tipo de erro desconhecido (${JSON.stringify(tipo)}) — ${String(detalhe ?? "")}`,
    codigo: String(codigo ?? ""),
    status: Number.isFinite(Number(status)) && status !== null ? Number(status) : null,
  };
  if (Array.isArray(faltando)) erro.faltando = Object.freeze([...faltando]);
  if (typeof alternativa === "string" && alternativa.trim() !== "") {
    erro.alternativa = alternativa.trim();
  }
  return Object.freeze({ ok: false, erro: Object.freeze(erro) });
}

/* ─── Os campos que a gravação aceita ────────────────────────────────────── */

/**
 * Lista FECHADA. É a lista de permissão do corpo do pedido, e a razão de ela
 * existir é a mesma do schema fechado do conteúdo: o que não está aqui não
 * chega ao banco, e não chega por construção, não por revisão.
 */
export const CAMPOS_ACEITOS = Object.freeze([
  "id",
  "slug",
  "titulo",
  "resumo",
  "conteudo",
  // Os quatro metadados da Story 2.6. `tags` é o único que não é coluna de
  // `posts`: ele vira associação em `posts_tags`, por uma função de banco.
  // Desde a Story 2.14 ele chega por NOME, e não por identificador — a tela é
  // um campo de texto separado por vírgula, e quem resolve nome em
  // identificador (reaproveitando o que existe, criando o que falta) é
  // `resolverTags`, aqui no servidor.
  "categoria_id",
  "tags",
  "publicado_em",
  "tempo_leitura",
  /* Story 2.8. `estado` é aceito, e "aceito" aqui significa VALIDADO contra a
     máquina de transições — não gravado como veio. É a única coisa do corpo
     cujo valor é conferido contra o que já está no banco. */
  "estado",
  /* Story 2.12. `operacao` não é campo do Post: é o que diz QUAL operação está
     sendo pedida, e quem o lê é o invólucro, contra o vocabulário fechado de
     `domain/blog/operacoes.js`. Ele está aqui para não ser relatado como
     "ignorado" num salvamento que o declara — o que faria a tela avisar que
     descartou algo que ela mesma mandou de propósito. Ele nunca chega ao banco:
     `lerCorpo` não o copia para `campos`, e o comando só carrega o que está lá. */
  "operacao",
]);

/**
 * Os campos que o cliente pode tentar enviar e que são ignorados **com nome**.
 *
 * Estão nomeados, e não só ausentes da lista acima, porque cada um é uma
 * tentativa com significado próprio, e a resposta diz qual foi descartada:
 *
 *   `conteudo_html` — HTML nunca é entrada; o gravado é o derivado.
 *   `autor_id`, `autor_nome` — o Autor é resolvido no servidor, sempre.
 *   `destaque`      — Story 2.12: coluna que esta porta escreve, mas só pela
 *                    operação `destacar`. Um salvamento que o traga é o Editor
 *                    devolvendo ao servidor um Post que ele leu do banco, e
 *                    aceitá-lo faria a gaveta mudar o Destaque de passagem, sem
 *                    ninguém ter pedido.
 *
 * `publicado_em` saiu desta lista na Story 2.6 e `estado` na 2.8 — mas as duas
 * saídas são de naturezas diferentes, e confundi-las seria destravar a segunda
 * pelo argumento da primeira. A data é dado que o Autor preenche na gaveta; o
 * Estado é PEDIDO de transição, aceito só quando a máquina de `domain/blog`
 * declara aquele caminho. Continuar na lista de ignorados seria dizer "o campo
 * não existe"; o que ele é agora é "o campo é conferido".
 */
export const CAMPOS_IGNORADOS = Object.freeze([
  "conteudo_html",
  "autor_id",
  "autor_nome",
  "destaque",
]);

const TAMANHO_MAXIMO_DO_TITULO = 300;

/**
 * Tetos que o banco NÃO impõe, e que por isso precisam existir aqui.
 *
 * `titulo` e `slug` têm restrição na tabela; `resumo` e o documento não tinham
 * teto nenhum. São escolhas da IMPLEMENTAÇÃO, não decisão de produto:
 *
 *   `resumo`   600 caracteres é cerca de quatro linhas de cartão de listagem —
 *              acima disso o campo deixou de ser resumo.
 *   `conteudo` 1.000.000 caracteres de JSON, o MESMO teto que a restrição do
 *              banco impõe. Um artigo de 20 mil caracteres dá cerca de 60 kB,
 *              então é uma ordem de grandeza de folga. Ele também é o que
 *              limita a LARGURA do documento: a travessia recursiva da
 *              restrição é proporcional ao número de nós, e sem teto de tamanho
 *              um documento com centenas de milhares de irmãos transformaria
 *              cada gravação numa varredura de milhões de linhas.
 *   `ignorados` 40 nomes na lista, com a contagem inteira ao lado. O relatório
 *              de descartes do schema já tinha teto e este não tinha: dez mil
 *              chaves inventadas no corpo voltavam como dez mil strings.
 */
const TAMANHO_MAXIMO_DO_RESUMO = 600;
export const TAMANHO_MAXIMO_DO_CONTEUDO = 1_000_000;
export const LIMITE_DE_IGNORADOS = 40;

/**
 * Tetos dos metadados da Story 2.6, pela mesma razão dos de cima: o banco não
 * os impõe, e sem teto uma lista de cem mil tags vira uma transação que não
 * termina.
 *
 *   `tags`          30 por Post. Acima disso a lista deixou de classificar e
 *                   passou a ser texto livre com vírgulas.
 *   `tempo_leitura` 1.000 minutos, dezesseis horas de leitura. Não é limite de
 *                   produto: é o que impede um inteiro absurdo (ou negativo,
 *                   que a restrição `posts_tempo_leitura_nao_negativo` já
 *                   recusa no banco) de chegar lá para ser recusado como erro
 *                   de banco em vez de como campo mal preenchido.
 */
/* O teto de Tags mora no DOMÍNIO desde a Story 2.14: a gaveta desenhava as
   pílulas sem aviso até a gravação falhar, e este módulo existe para tela e
   servidor não discordarem. Reexportado porque quem lê os tetos da gravação os
   procura aqui. */
export { LIMITE_DE_TAGS };
const TEMPO_DE_LEITURA_MAXIMO = 1000;

/**
 * O formato de identificador, declarado UMA vez no servidor.
 *
 * Exportado porque `operacoesDoPost.js` precisa exatamente do mesmo, e a
 * terceira cópia da regra é a que diverge — é o mesmo argumento que o cabeçalho
 * daquele arquivo usa contra um segundo classificador de erro. A verificação
 * compara este padrão com o `FORMATO_DE_UUID` de `src/data/blog/comum.js` sobre
 * um corpus, porque servidor e cliente recusando identificadores diferentes
 * apareceria como um pedido que o Painel monta e a porta não entende.
 */
export const PADRAO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O vocabulário, por extenso, para a frase de recusa. Vem do domínio. */
const ESTADOS_DO_POST = ESTADOS.join(", ");

/**
 * A margem de relógio de "publicar agora".
 *
 * **Medido, não suposto**: o relógio da máquina que roda esta função e o do
 * Postgres não são o mesmo relógio, e na medição desta story o do servidor
 * estava dois segundos ADIANTADO. A política de leitura anônima compara
 * `publicado_em <= now()` com o relógio DO BANCO — então gravar o instante do
 * servidor como data de publicação deixava o Post publicado e invisível pelo
 * tempo da diferença. É o defeito clássico "publiquei e não apareceu", que some
 * sozinho antes de alguém conseguir investigar.
 *
 * Um minuto é folga de sobra para deriva de NTP e não significa nada
 * editorialmente: a listagem ordena por dia e hora, e nenhum Post disputa
 * posição com outro por sessenta segundos.
 *
 * O que ela NÃO resolve é o banco estar adiantado em relação ao servidor por
 * mais de um minuto — nesse caso o Post continua invisível até a hora chegar, e
 * quem acusa é a asserção de leitura anônima de `verificar:escrita`.
 */
export const MARGEM_DE_RELOGIO_MS = 60_000;

/* ─── Classificação do que o banco e o GoTrue respondem ──────────────────── */

/**
 * Traduz a resposta do acesso num dos tipos.
 *
 * A ordem importa. Transporte primeiro, porque falha de rede vem SEM status e
 * cairia em defeito; depois credencial; depois as violações que o Postgres
 * nomeia por SQLSTATE, porque `23505` (unicidade) é conflito e `23514`
 * (restrição de verificação) é entrada que não serve — e tratá-las igual daria
 * à tela o conselho errado nos dois casos.
 */
export function classificar({ status = 0, codigo = "" } = {}) {
  const n = Number(status);
  if (!Number.isFinite(n) || n === 0 || n === 408 || n === 429 || n >= 500) {
    return ERRO_REDE;
  }
  if (n === 401 || n === 403) return ERRO_PERMISSAO;
  if (codigo === "42501") return ERRO_PERMISSAO;
  // Unicidade de slug — inclusive a que o gatilho `exigir_slug_livre` levanta
  // com o mesmo SQLSTATE quando o slug está aposentado apontando para outro
  // Post. Os dois são a mesma frase para quem escreve: escolha outro endereço.
  if (n === 409 || codigo === "23505") return ERRO_CONFLITO;
  // Restrição de verificação, coluna obrigatória, tipo inválido, chave
  // estrangeira: o pedido chegou e o que ele pede não pode existir.
  if (["23514", "23502", "23503", "22P02", "22007"].includes(codigo)) {
    return ERRO_DADOS_INVALIDOS;
  }
  /* 404 do PostgREST significa ROTA ou TABELA inexistente, não "post não
     encontrado" — traduzi-lo como ausência esconderia um schema quebrado atrás
     de uma tela calma. Ausência de linha é decidida por quem chama, sobre a
     resposta vazia. É o mesmo raciocínio de `data/blog/resultado.js`. */
  if (n === 404) return ERRO_INESPERADO;
  if (n >= 400 && n < 500) return ERRO_DADOS_INVALIDOS;
  return ERRO_INESPERADO;
}

/** Detalhe legível de uma resposta do acesso, para o log do servidor. */
export function detalhar(resultado, oQue) {
  const partes = [oQue, `HTTP ${resultado?.status ?? "?"}`];
  if (resultado?.codigo) partes.push(String(resultado.codigo));
  if (resultado?.mensagem) partes.push(String(resultado.mensagem));
  return partes.join(" | ").slice(0, 500);
}

/**
 * A frase para o caso em que a **restrição do banco** recusou o conteúdo.
 *
 * Se isto aparecer pelo caminho da função, é sinal de que a validação e a
 * restrição divergiram — e a mensagem precisa dizer isso a quem investiga sem
 * dizer nada a quem tenta.
 */
function mensagemDeRecusaDoBanco(resultado) {
  const texto = `${resultado?.mensagem ?? ""}`;
  if (/posts_conteudo_html_seguro|posts_conteudo_no_vocabulario/.test(texto)) {
    return "O banco recusou este conteúdo: ele contém algo que um artigo não pode ter. Abra o post no Editor e salve de novo.";
  }
  return "";
}

/* ─── Validação do corpo ─────────────────────────────────────────────────── */

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : null;
}

/** O que veio, em uma frase, para o detalhe do log. */
function descreverValor(valor) {
  if (valor === null) return "null";
  if (Array.isArray(valor)) return `lista de ${valor.length}`;
  return typeof valor;
}

/**
 * Um instante COMPLETO — dia, hora e deslocamento —, normalizado em ISO 8601.
 *
 * Devolve `null` para tudo o que não é instante, e a exigência do deslocamento
 * é o ponto: `"2026-08-17"` é aceito por `Date.parse` como meia-noite em UTC,
 * que é 21h do dia ANTERIOR em São Paulo. Uma data civil que atravessasse aqui
 * publicaria o Post um dia antes do combinado, e ninguém veria a conversão
 * acontecer. `"2026-08-17T00:30"`, sem deslocamento, é pior ainda: o
 * comportamento passa a depender do fuso da máquina que interpretar.
 *
 * A tela converte a hora de parede de São Paulo em instante antes de enviar —
 * é o que `deCampoDeInstante`, em `domain/blog/formato.js`, faz.
 */
const INSTANTE_COMPLETO =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,9})?(Z|z|[+-]\d{2}:?\d{2})$/;

function comoInstante(valor) {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  const casou = INSTANTE_COMPLETO.exec(limpo);
  if (!casou) return null;

  /* O CALENDÁRIO É CONFERIDO AQUI, e não deixado para `Date.parse`.
     Medido: `Date.parse("2026-02-31T10:00:00Z")` NÃO devolve `NaN` no V8 — ele
     cai no analisador legado e responde 3 de março. Um dia que não existe
     atravessaria como uma data silenciosamente diferente da que foi digitada, e
     a única pista seria o Post publicar no dia errado. */
  const ano = Number(casou[1]);
  const mes = Number(casou[2]);
  const dia = Number(casou[3]);
  const hora = Number(casou[4]);
  const minuto = Number(casou[5]);
  const segundo = Number(casou[6] ?? 0);
  if (mes < 1 || mes > 12 || dia < 1 || hora > 23 || minuto > 59 || segundo > 59) {
    return null;
  }
  const redondo = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    redondo.getUTCFullYear() !== ano ||
    redondo.getUTCMonth() !== mes - 1 ||
    redondo.getUTCDate() !== dia
  ) {
    return null;
  }

  const ms = Date.parse(limpo);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** O tamanho do documento em caracteres de JSON, ou `null` se não serializa. */
function tamanhoDoConteudo(valor) {
  try {
    return JSON.stringify(valor)?.length ?? 0;
  } catch {
    return null;
  }
}

/**
 * Separa o que a gravação aceita do que ela ignora, e diz **tudo** o que está
 * errado de uma vez.
 *
 * Devolve `{ ok: true, campos, ignorados, totalIgnorado }` ou
 * `{ ok: false, mensagem, detalhe, faltando }`. Ela não toca no conteúdo: quem
 * valida documento é o schema, e ele é chamado depois.
 *
 * **Por que ela acumula em vez de retornar no primeiro problema.** A versão
 * anterior saía no primeiro erro de formato, então título vazio mais slug
 * malformado reportava só o slug — e quem preenche o formulário conserta um erro
 * por salvamento, descobrindo o seguinte só depois de clicar de novo. O critério
 * de aceite fala de "campo faltante indicado", no plural natural de um
 * formulário.
 */
export function lerCorpo(corpo, { criando }) {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) {
    return {
      ok: false,
      mensagem: "O pedido de gravação não veio no formato esperado.",
      detalhe: `esperava um objeto e veio ${
        corpo === null ? "null" : Array.isArray(corpo) ? `lista de ${corpo.length}` : typeof corpo
      }`,
      faltando: [],
    };
  }

  const todosIgnorados = Object.keys(corpo).filter(
    (chave) => !CAMPOS_ACEITOS.includes(chave),
  );

  const faltando = [];
  const problemas = [];
  const detalhes = [];
  const campos = {};

  const titulo = texto(corpo.titulo);
  if (titulo === null || titulo === "") {
    faltando.push("titulo");
  } else if (titulo.length > TAMANHO_MAXIMO_DO_TITULO) {
    problemas.push(
      `O título passa de ${TAMANHO_MAXIMO_DO_TITULO} caracteres. Encurte antes de salvar.`,
    );
    detalhes.push(`titulo com ${titulo.length} caracteres`);
  } else {
    campos.titulo = titulo;
  }

  const slug = texto(corpo.slug);
  if (slug === null || slug === "") {
    // Slug é obrigatório para NASCER (é chave de URL) e opcional na edição:
    // salvar o texto de um post sem mexer no endereço é o caso comum.
    if (criando) faltando.push("slug");
  } else if (!FORMATO_DE_SLUG.test(slug) || slug.length > TAMANHO_MAXIMO_DO_SLUG) {
    problemas.push(
      "O endereço do post aceita apenas letras minúsculas sem acento, números e hífen entre palavras.",
    );
    detalhes.push(`slug fora do formato: ${JSON.stringify(slug.slice(0, 80))}`);
  } else {
    campos.slug = slug;
  }

  /* O RESUMO É OBRIGATÓRIO (Story 2.6), com a mesma forma do slug: exigido
     para NASCER, opcional na edição no sentido de "omitir preserva o que já
     está gravado". O que mudou em relação à 2.5 é que ele não pode mais ser
     APAGADO: enviar `null` ou vazio deixou de limpar o campo e passou a ser
     "falta preencher", porque o critério de aceite diz que Título e Resumo são
     obrigatórios e o campo que falta é indicado. Limpar um resumo já gravado
     deixaria o Post num estado que a tela não permite criar. */
  if (corpo.resumo === undefined) {
    if (criando) faltando.push("resumo");
  } else {
    const resumo = corpo.resumo === null ? "" : texto(corpo.resumo);
    if (resumo === null) {
      problemas.push("O resumo do post precisa ser texto.");
      detalhes.push(`resumo veio ${typeof corpo.resumo}`);
    } else if (resumo === "") {
      faltando.push("resumo");
    } else if (resumo.length > TAMANHO_MAXIMO_DO_RESUMO) {
      problemas.push(
        `O resumo passa de ${TAMANHO_MAXIMO_DO_RESUMO} caracteres. Encurte antes de salvar.`,
      );
      detalhes.push(`resumo com ${resumo.length} caracteres`);
    } else {
      campos.resumo = resumo;
    }
  }

  /* ── Os metadados da gaveta ─────────────────────────────────────────────
     Os quatro seguem a mesma convenção: ausente preserva, `null` limpa, valor
     fora de forma é problema NOMEADO — nunca descartado em silêncio, porque um
     metadado que some sem aviso é descoberto quando o Post já está no ar. */

  if (corpo.categoria_id !== undefined) {
    if (corpo.categoria_id === null || corpo.categoria_id === "") {
      campos.categoria_id = null;
    } else {
      const categoria = texto(corpo.categoria_id);
      if (categoria === null || !PADRAO_UUID.test(categoria)) {
        problemas.push("Não reconhecemos a categoria escolhida. Escolha uma da lista.");
        detalhes.push(
          `categoria_id fora do formato de identificador: ${JSON.stringify(String(corpo.categoria_id).slice(0, 60))}`,
        );
      } else {
        campos.categoria_id = categoria;
      }
    }
  }

  /* ── AS TAGS CHEGAM POR NOME (Story 2.14) ───────────────────────────────
     Até a Story 2.13 a lista era de IDENTIFICADORES de Tags que já existiam, e
     `definir_tags_do_post` recusava qualquer identificador desconhecido. A tela
     passou a ser um campo de texto separado por vírgula, e texto produz NOMES:
     alguém tem de normalizar, procurar a que já existe e criar a que falta.
     Esse alguém é `resolverTags`, adiante, e a normalização é a MESMA do
     domínio (`domain/blog/tags.js`), importada — uma segunda regra aqui
     produziria uma Tag duplicada no banco, que é defeito sem desfazer. */
  if (corpo.tags !== undefined) {
    if (corpo.tags === null) {
      campos.tags = [];
    } else if (!Array.isArray(corpo.tags)) {
      problemas.push("As tags do post precisam vir como uma lista.");
      detalhes.push(`tags veio ${descreverValor(corpo.tags)}`);
    } else {
      const nomes = [];
      const vistas = new Set();
      const recusadas = [];
      for (const bruta of corpo.tags) {
        if (typeof bruta !== "string") {
          /* A FRASE ENTRA UMA VEZ. Dez elementos que não são texto repetiam a
             mesma sentença dez vezes na mensagem — o mesmo cuidado que as
             outras recusas desta lista já tinham. */
          const aviso = "As tags do post são texto.";
          if (!recusadas.includes(aviso)) recusadas.push(aviso);
          detalhes.push(`tag não é texto: ${descreverValor(bruta)}`);
          continue;
        }
        const nome = normalizarNomeDeTag(bruta);
        const problema = problemaNaTag(nome);
        if (problema !== null) {
          if (!recusadas.includes(problema)) recusadas.push(problema);
          detalhes.push(`tag recusada: ${JSON.stringify(String(bruta).slice(0, 60))}`);
          continue;
        }
        // Repetida é a mesma Tag, e a chave de igualdade é o SLUG: "Vendas" e
        // "vendas" produzem a mesma linha em `tags`, e mandar as duas
        // transformaria uma escolha inofensiva em erro de unicidade.
        const chave = chaveDaTag(nome);
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        nomes.push(nome);
      }
      /* O TETO VALE SOBRE O QUE VAI SER GRAVADO, e não sobre o que chegou.
         Contá-lo antes do colapso fazia trinta e uma repetições da MESMA Tag
         serem recusadas como trinta e uma tags, quando o que chega ao banco é
         uma — e é a mesma ordem que `separarTags` usa na tela. */
      if (nomes.length > LIMITE_DE_TAGS) {
        recusadas.push(
          `Um post aceita no máximo ${LIMITE_DE_TAGS} tags. Escolha as que classificam de verdade.`,
        );
        detalhes.push(`tags distintas: ${nomes.length}`);
      }
      if (recusadas.length > 0) problemas.push(...recusadas);
      else campos.tags = nomes;
    }
  }

  if (corpo.publicado_em !== undefined) {
    if (corpo.publicado_em === null || corpo.publicado_em === "") {
      campos.publicado_em = null;
    } else {
      const instante = comoInstante(corpo.publicado_em);
      if (instante === null) {
        problemas.push(
          "A data de publicação não é um momento válido. Informe dia e hora — o horário é o de Brasília.",
        );
        detalhes.push(
          `publicado_em não é instante: ${JSON.stringify(String(corpo.publicado_em).slice(0, 60))}`,
        );
      } else {
        campos.publicado_em = instante;
      }
    }
  }

  if (corpo.tempo_leitura !== undefined) {
    if (corpo.tempo_leitura === null || corpo.tempo_leitura === "") {
      campos.tempo_leitura = 0;
    } else {
      const minutos = Number(corpo.tempo_leitura);
      if (!Number.isInteger(minutos) || minutos < 0 || minutos > TEMPO_DE_LEITURA_MAXIMO) {
        problemas.push(
          `O tempo de leitura é um número inteiro de minutos, de 0 a ${TEMPO_DE_LEITURA_MAXIMO}.`,
        );
        detalhes.push(
          `tempo_leitura fora da faixa: ${JSON.stringify(String(corpo.tempo_leitura).slice(0, 60))}`,
        );
      } else {
        campos.tempo_leitura = minutos;
      }
    }
  }

  /* O ESTADO PEDIDO, conferido contra o vocabulário FECHADO.
     Aqui só se decide se a palavra existe; se a MUDANÇA é permitida depende do
     que está gravado, e isso é decidido em `gravar`, contra a máquina. Valor
     fora da lista — inclusive `null`, que seria "apagar o estado" — é recusado
     com o nome do campo: um Post sem Estado não é representável no banco, e
     tratá-lo como limpeza produziria uma pílula em branco na listagem. */
  if (corpo.estado !== undefined) {
    const estado = texto(corpo.estado);
    if (estado === null || !ehEstado(estado)) {
      problemas.push(
        `Não reconhecemos o estado pedido para o post. Os estados são: ${ESTADOS_DO_POST}.`,
      );
      detalhes.push(
        `estado fora do vocabulário: ${JSON.stringify(String(corpo.estado).slice(0, 60))}`,
      );
    } else {
      campos.estado = estado;
    }
  }

  if (corpo.conteudo === undefined) {
    faltando.push("conteudo");
  } else {
    const tamanho = tamanhoDoConteudo(corpo.conteudo);
    if (tamanho === null) {
      problemas.push(
        "Não conseguimos ler o conteúdo enviado. Abra o post no Editor e salve de novo.",
      );
      detalhes.push("o conteúdo não pôde ser serializado como JSON");
    } else if (tamanho > TAMANHO_MAXIMO_DO_CONTEUDO) {
      problemas.push(
        "Este post é grande demais para ser gravado. Divida o conteúdo em mais de um post.",
      );
      detalhes.push(
        `conteudo com ${tamanho} caracteres de JSON (teto ${TAMANHO_MAXIMO_DO_CONTEUDO})`,
      );
    }
  }

  if (faltando.length > 0 || problemas.length > 0) {
    const frases = [];
    if (faltando.length === 1) frases.push(`Falta preencher: ${faltando[0]}.`);
    else if (faltando.length > 1) {
      frases.push(`Faltam preencher: ${faltando.join(", ")}.`);
    }
    frases.push(...problemas);
    return {
      ok: false,
      mensagem: frases.join(" "),
      detalhe: [
        faltando.length > 0 ? `campos ausentes ou vazios: ${faltando.join(", ")}` : "",
        ...detalhes,
      ]
        .filter(Boolean)
        .join(" | "),
      faltando,
    };
  }

  return {
    ok: true,
    campos,
    // Teto na LISTA, contagem sem teto — o mesmo desenho do relatório de
    // descartes do schema, e pela mesma razão: quem avisa precisa saber quantos
    // foram, e a resposta não pode virar o gargalo.
    ignorados: todosIgnorados.slice(0, LIMITE_DE_IGNORADOS),
    totalIgnorado: todosIgnorados.length,
    ignoradosTruncados: todosIgnorados.length > LIMITE_DE_IGNORADOS,
  };
}

/* ─── A escrita ──────────────────────────────────────────────────────────── */

/**
 * Grava um Post.
 *
 * `token` é o JWT do chamador; `corpo` é o que ele enviou; `acesso` é o que sabe
 * falar com o Supabase. Devolve `{ ok: true, dados }` ou `{ ok: false, erro }` —
 * **nunca lança**, porque exceção que suba daqui vira 500 sem tipo, e a tela
 * fica sem saber se deve pedir para tentar de novo ou para consertar um campo.
 */
export async function salvarPost({ token, corpo, acesso }) {
  try {
    return await gravar({ token, corpo, acesso });
  } catch (excecao) {
    return falha(ERRO_INESPERADO, {
      detalhe: `exceção não prevista: ${String(excecao?.stack ?? excecao?.message ?? excecao)}`,
      codigo: String(excecao?.name ?? ""),
    });
  }
}

/**
 * Quem está pedindo, conferido **contra o Supabase, no servidor**.
 *
 * Devolve `{ ok: true, conta }` ou uma falha tipada, pronta para quem chama
 * repassar. Mora fora de `gravar` porque toda operação da porta única faz
 * exatamente esta pergunta, e uma segunda cópia dela divergiria na primeira
 * mudança de política — a operação nova que "esqueceu" de conferir o token é
 * o defeito que este arquivo existe para tornar impossível.
 *
 * Ausência de token, token forjado e token vencido dão o MESMO erro, com a
 * MESMA frase: distinguir os três na resposta diria a quem tenta se o token
 * que ele inventou tem forma válida. `mensagem` troca a frase para todos de
 * uma vez, nunca para um só — é por isso que ela é um argumento da função e
 * não um parâmetro de cada recusa.
 *
 * E nada de identidade vinda do corpo do pedido: quem manda o pedido também
 * mandaria o nome de quem ele quisesse ser.
 */
export async function identificarChamador({
  token,
  acesso,
  mensagem = "",
  /* A FRASE DA INDISPONIBILIDADE é outra frase, e também é da operação.
     Antes ela era forçada a `""` aqui, e o vocabulário genérico devolvia "Não
     conseguimos falar com o servidor para SALVAR" a quem tentou excluir — a
     mesma fuga que a story mandou fechar do outro lado. Padrão vazio mantém o
     comportamento de quem não passa nada: cai no genérico. */
  mensagemDeRede = "",
}) {
  const credencial = typeof token === "string" ? token.trim() : "";
  if (credencial === "") {
    return falha(ERRO_PERMISSAO, {
      mensagem,
      detalhe: "pedido sem credencial no cabeçalho Authorization",
    });
  }

  const identidade = await acesso.contaDoToken(credencial);
  if (!identidade.ok) {
    const tipo = classificar(identidade);
    // 401 e 403 do GoTrue são "este token não vale". Qualquer outra coisa é
    // indisponibilidade, e confundir as duas mandaria a pessoa entrar de novo
    // quando o problema é o servidor.
    return falha(tipo === ERRO_REDE ? ERRO_REDE : ERRO_PERMISSAO, {
      mensagem: tipo === ERRO_REDE ? mensagemDeRede : mensagem,
      detalhe: detalhar(identidade, "conferência do token no Supabase"),
      codigo: identidade.codigo,
      status: identidade.status,
    });
  }

  const conta = identidade.dados ?? {};
  if (typeof conta.id !== "string" || conta.id === "") {
    return falha(ERRO_PERMISSAO, {
      mensagem,
      detalhe: "o Supabase confirmou o token mas não devolveu identificador de Conta",
    });
  }

  return { ok: true, conta };
}

async function gravar({ token, corpo, acesso }) {
  /* ── 1. Quem está pedindo ──────────────────────────────────────────────── */

  const chamador = await identificarChamador({ token, acesso });
  if (!chamador.ok) return chamador;
  const conta = chamador.conta;

  /* ── 2. O que ele está pedindo ─────────────────────────────────────────── */

  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  if (!ehObjeto) {
    // A forma do corpo é decidida por `lerCorpo`, que já sabe descrever o que
    // veio no lugar — chamá-lo aqui evita uma segunda frase para o mesmo caso.
    const recusa = lerCorpo(corpo, { criando: true });
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: recusa.mensagem,
      detalhe: recusa.detalhe,
      faltando: recusa.faltando,
    });
  }

  const bruto = corpo;
  const id = texto(bruto.id);
  /* `id` ausente é criação; `id` PRESENTE e fora do formato é recusa, e não
     criação silenciosa. A diferença é sutil e importa: um cliente que manda
     `id: 123` está tentando salvar um post existente, e criar um novo no lugar
     duplicaria conteúdo em vez de acusar o erro. */
  const informouId = bruto.id !== undefined && bruto.id !== null && bruto.id !== "";
  if (informouId && (id === null || !PADRAO_UUID.test(id))) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual post deve ser salvo.",
      detalhe: `id fora do formato de identificador: ${JSON.stringify(String(bruto.id).slice(0, 60))}`,
    });
  }
  const criando = !informouId;

  const lido = lerCorpo(bruto, { criando });
  if (!lido.ok) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: lido.mensagem,
      detalhe: lido.detalhe,
      faltando: lido.faltando,
    });
  }

  /* ── 3. O conteúdo, validado e derivado no mesmo passo ─────────────────── */
  //
  // A validação é a MESMA função que o Editor usa (`validarDocumento`), e o HTML
  // sai do renderizador único. Não há segunda implementação de nenhum dos dois,
  // e não há HTML aceito de fora — `conteudo_html` do cliente já foi para a
  // lista de ignorados na leitura do corpo.

  const derivado = derivarHtml(bruto.conteudo);
  if (!derivado.ok) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: derivado.erro.mensagem,
      detalhe: derivado.erro.detalhe ?? "",
    });
  }

  const conteudo = {
    conteudo: derivado.documento,
    conteudo_html: derivado.html,
  };

  /* ── 4. A TRANSIÇÃO, contra o que está GRAVADO ─────────────────────────── */
  //
  // O Estado de partida vem do banco — ou é `rascunho`, quando o Post está
  // nascendo. Nunca do corpo do pedido: quem manda o pedido também mandaria o
  // Estado de partida que lhe fosse conveniente, e "de publicado para rascunho"
  // viraria "de rascunho para rascunho" com uma linha a mais no JSON.
  //
  // A conferência acontece ANTES de qualquer escrita — inclusive antes da
  // aposentadoria do endereço, que grava — para que "transição recusada, nada
  // gravado" seja consequência da ordem e não de sorte.

  const existente = criando ? null : await acesso.lerPost(id);
  if (existente !== null) {
    if (!existente.ok) return falhaDaEscrita(existente, "leitura do post a atualizar");
    if (existente.dados === null) {
      return falha(ERRO_NAO_ENCONTRADO, { detalhe: `nenhum post com id ${id}` });
    }
  }

  const estadoAtual = criando ? ESTADO_INICIAL : existente.dados.estado;
  const transicao = resolverTransicao({
    estadoAtual,
    campos: lido.campos,
    dataAtual: criando ? null : (existente.dados.publicado_em ?? null),
  });
  if (!transicao.ok) return transicao.recusa;

  /* As colunas de metadado, já com a decisão de data aplicada. `dataForcada`
     preenche (publicar agora, republicar com data futura) e `preservarData`
     RETIRA a coluna do comando — a data de um Post no ar não é reescrita por um
     salvamento, e não escrevê-la é mais forte que escrever o mesmo valor. */
  const metadados = colunasDeMetadado(lido.campos);
  if (transicao.dataForcada !== undefined) metadados.publicado_em = transicao.dataForcada;
  if (transicao.preservarData) delete metadados.publicado_em;
  /* `estado` entra no comando SÓ quando muda. Salvar não é transição, e a
     ausência da coluna é o que torna isso propriedade do comando em vez de
     igualdade de valores. Na criação, ausente significa o padrão da coluna:
     todo Post nasce rascunho. */
  const colunaDeEstado = transicao.mudouDeEstado ? { estado: transicao.estado } : {};

  /* ── 5. Gravar ─────────────────────────────────────────────────────────── */

  if (criando) {
    /* A COLISÃO É VERIFICADA ANTES DE GRAVAR, e não descoberta pela violação
       de unicidade. A restrição existe e vai barrar de qualquer forma — mas aí
       a pessoa recebe um erro de banco depois de escrever o Post inteiro.
       Verificar antes é o que transforma isso num aviso enquanto ainda dá para
       escolher outro endereço. O banco continua sendo a última linha, não a
       primeira. */
    const livre = await enderecoLivre({ acesso, slug: lido.campos.slug, id: null });
    if (!livre.ok) return livre;

    const autor = await resolverAutor({ acesso, conta });
    if (!autor.ok) return autor;

    /* `tags` fica de fora — ela não é coluna de `posts`. `estado` só entra
       quando o Autor pediu uma transição junto da criação ("Publicar agora"
       num Post que ainda não existe): sem pedido, o padrão da coluna faz o
       Post nascer rascunho, e é assim que ele nasce invisível por construção. */
    const escrita = await acesso.inserirPost({
      slug: lido.campos.slug,
      titulo: lido.campos.titulo,
      resumo: lido.campos.resumo ?? "",
      ...conteudo,
      ...metadados,
      ...colunaDeEstado,
      autor_id: autor.autor_id,
      autor_nome: autor.autor_nome,
    });
    if (!escrita.ok) return falhaDaEscrita(escrita, "criação do post");
    if (escrita.dados === null) {
      return falha(ERRO_INESPERADO, {
        detalhe: "a criação não devolveu a linha gravada",
      });
    }
    const tags = await gravarTags({ acesso, id: escrita.dados.id, lido });
    if (!tags.ok) return tags;
    return sucesso({ post: escrita.dados, criado: true, lido, derivado, tags: tags.tags });
  }

  /* ── O ENDEREÇO DE UM POST QUE JÁ ESTEVE NO AR MUDA APOSENTANDO O ANTERIOR ─ */
  //
  // `slugs_antigos` existe como base do redirecionamento permanente (301), e
  // esta função é o único caminho de escrita — então trocar o slug sem aposentar
  // o anterior quebraria, em silêncio, toda URL já publicada.
  //
  // A Story 2.5 RECUSAVA a troca, porque aposentar exige escrever em duas
  // tabelas atomicamente e o PostgREST faz uma por chamada. A função de banco
  // `aposentar_slug_do_post` é o que faltava: uma chamada, uma transação, as
  // duas escritas juntas ou nenhuma.

  const trocandoEndereco =
    lido.campos.slug !== undefined && lido.campos.slug !== existente.dados.slug;
  /* O endereço já foi trocado pela função de banco? É esta pergunta, e não "o
     endereço mudou?", que decide se o comando comum ainda precisa carregá-lo. */
  let enderecoJaAplicado = false;

  if (trocandoEndereco) {
    const livre = await enderecoLivre({ acesso, slug: lido.campos.slug, id });
    if (!livre.ok) return livre;

    /* Duas razões para o endereço ser trocado pela função de banco em vez de
       pelo comando comum:

         * o Post JÁ ESTEVE NO AR — há links a preservar, e o anterior precisa
           virar destino de redirecionamento;
         * ou o endereço novo é um endereço APOSENTADO DESTE MESMO POST — é o
           desfazer de uma renomeação, e a linha de aposentadoria precisa sair
           junto, senão o mesmo endereço ficaria ativo e aposentado ao mesmo
           tempo.

       Fora desses dois casos é rascunho estreando endereço: nunca teve URL, não
       há nada a aposentar, e criar uma linha em `slugs_antigos` para um endereço
       que ninguém viu só bloquearia o reúso dele por outro Post. */
    const precisaAposentar = jaEsteveNoAr(existente.dados) || livre.retomadoDoProprioPost;

    if (precisaAposentar) {
      const troca = await acesso.aposentarSlug(id, lido.campos.slug);
      if (!troca.ok) return falhaDaEscrita(troca, "aposentadoria do endereço anterior");
      enderecoJaAplicado = true;
    }
  }

  /* O AUTOR NÃO ENTRA NO COMANDO DE ATUALIZAÇÃO.
     Não é esquecimento: é a metade do critério de aceite que se perde em
     implementação distraída. Revisar o texto de alguém não pode transferir a
     autoria, então `autor_id` e `autor_nome` simplesmente não são tocados —
     ausência é a forma mais forte de "não muda", porque não há valor a
     calcular errado. `estado` segue o mesmo mecanismo, com a diferença de que
     ele PODE entrar: `colunaDeEstado` é vazio quando o destino é o Estado
     atual, então salvar continua sem tocar a coluna. */
  const alteracao = { titulo: lido.campos.titulo, ...conteudo, ...metadados, ...colunaDeEstado };
  /* O `slug` só fica de fora quando a função de banco JÁ o aplicou: mandá-lo de
     novo seria uma segunda escrita do mesmo valor, e um `update` de slug dispara
     o gatilho de unicidade contra a linha de aposentadoria que a função acabou
     de criar. Quando não houve aposentadoria — rascunho estreando endereço —, é
     este comando que troca o endereço, e omiti-lo faria a troca sumir. */
  if (lido.campos.slug !== undefined && !enderecoJaAplicado) {
    alteracao.slug = lido.campos.slug;
  }
  if (lido.campos.resumo !== undefined) alteracao.resumo = lido.campos.resumo;

  const escrita = await acesso.atualizarPost(id, alteracao);
  if (!escrita.ok) return falhaDaEscrita(escrita, "atualização do post");
  if (escrita.dados === null) {
    // A leitura acima achou a linha e o PATCH não: alguém apagou o Post entre
    // as duas chamadas. É ausência, não defeito.
    return falha(ERRO_NAO_ENCONTRADO, {
      detalhe: `o post ${id} desapareceu entre a leitura e a gravação`,
    });
  }
  const tags = await gravarTags({ acesso, id, lido });
  if (!tags.ok) return tags;
  return sucesso({ post: escrita.dados, criado: false, lido, derivado, tags: tags.tags });
}

/**
 * A transição pedida, resolvida contra o que está gravado.
 *
 * Devolve `{ ok: true, estado, mudouDeEstado, dataForcada, preservarData }` ou
 * `{ ok: false, recusa }` — com a recusa já tipada, para quem chama só repassar.
 *
 * `estado` ausente no corpo significa "fique onde está", e não "volte para
 * rascunho": salvar sem falar de Estado é o caso comum, e transformá-lo em
 * transição implícita despublicaria posts por omissão.
 *
 * As duas regras de data moram aqui porque são a MESMA decisão vista de dois
 * lados — quem entra no ar precisa de um instante já passado, e quem já está no
 * ar não tem esse instante reescrito. Ver o cabeçalho do módulo.
 */
function resolverTransicao({ estadoAtual, campos, dataAtual, agora = Date.now() }) {
  const alvo = campos.estado === undefined ? estadoAtual : campos.estado;

  if (!transicaoPermitida(estadoAtual, alvo)) {
    return {
      ok: false,
      recusa: falha(ERRO_DADOS_INVALIDOS, {
        mensagem: motivoDaRecusa(estadoAtual, alvo),
        detalhe: `transição fora da máquina: ${estadoAtual} → ${alvo}`,
      }),
    };
  }

  const mudouDeEstado = alvo !== estadoAtual;
  // `undefined` é "o pedido não falou de data"; `null` é "o pedido pediu sem
  // data". A distinção decide se o que vale é o gravado ou a limpeza.
  const efetiva = campos.publicado_em === undefined ? dataAtual : campos.publicado_em;

  /* SALVAR ALTERAÇÕES DE UM POST NO AR NÃO MEXE NA DATA.
     A listagem ordena por ela: corrigir uma vírgula não pode fazer o Post
     pular para o topo do blog como se fosse novo. A coluna sai do comando —
     não há valor a escrever, certo ou errado. */
  if (alvo === "publicado" && estadoAtual === "publicado") {
    return {
      ok: true,
      estado: alvo,
      mudouDeEstado: false,
      dataForcada: undefined,
      preservarData: true,
    };
  }

  if (alvo === "publicado") {
    const instante = efetiva === null || efetiva === undefined ? Number.NaN : Date.parse(efetiva);
    /* Data JÁ PASSADA fica como está — é o que faz republicar um arquivado
       conservar a data original em vez de reaparecer como novidade. Nula ou
       recente demais vira o limite: um Post publicado com data que o BANCO
       ainda considera futura se diz no ar e continua invisível pela política de
       leitura, que é o estado mais confuso que este código pode produzir.

       "Passada" aqui é passada com a margem de relógio inteira — o mesmo
       limite dos dois lados da comparação, para que não exista faixa em que a
       data é aceita como passada e mesmo assim precise ser reescrita. */
    const limite = agora - MARGEM_DE_RELOGIO_MS;
    const jaPassou = Number.isFinite(instante) && instante <= limite;
    return {
      ok: true,
      estado: alvo,
      mudouDeEstado,
      dataForcada: jaPassou ? undefined : new Date(limite).toISOString(),
      preservarData: false,
    };
  }

  /* Quem chega aqui precisando de data é `agendado` — `publicado` já saiu nas
     duas cláusulas acima. A lista consultada é a do domínio, espelho da
     restrição do banco: o banco recusaria de qualquer jeito, e o que se ganha
     aqui é a frase que diz o que preencher em vez de um erro de restrição. */
  if (exigeDataDePublicacao(alvo) && (efetiva === null || efetiva === undefined)) {
    return {
      ok: false,
      recusa: falha(ERRO_DADOS_INVALIDOS, {
        mensagem:
          "Para agendar, informe a data e a hora em que o post deve ir ao ar — o horário é o de Brasília.",
        detalhe: `transição para ${alvo} sem publicado_em, no pedido e no que está gravado`,
        faltando: ["publicado_em"],
      }),
    };
  }

  /* ── AGENDAR PARA TRÁS É RECUSADO, E A RECUSA TEM SAÍDA ────────────────
     Agendar para hoje mais cedo é erro de digitação comum — trocar o dia, ou
     escolher 09:00 às onze da manhã. Gravar isso publicaria o Post na hora,
     por decorrência da política de leitura, com o Estado dizendo "agendado":
     ninguém entende o que aconteceu, e o Autor descobre pelo leitor.

     A recusa é DISTINTA da de falta de data — outra frase, e `alternativa` no
     lugar de `faltando` —, porque as duas pedem coisas diferentes de quem
     tentou: uma pede que preencha, a outra pede que escolha entre uma data
     futura e publicar agora. É esta última que a chave carrega.

     "Passada" é passada com a MARGEM DE RELÓGIO inteira, o mesmo limite que
     "publicar agora" usa acima. A margem entra do lado permissivo de
     propósito: o relógio desta máquina pode estar adiantado em relação ao de
     quem digitou, e recusar por engano um agendamento legítimo é pior que
     aceitar um que vai ao ar um minuto antes.

     ── E POR QUE UM AGENDADO VENCIDO CONTINUA SALVÁVEL ──
     Um Post agendado NÃO vira publicado quando a hora chega: o Estado guarda a
     intenção do Autor, e quem o mostra é a política. Então "agendado com data
     no passado" não é anomalia — é o estado final normal de todo Post
     agendado, já visível para o leitor. Recusar um salvamento desses seria
     impedir a correção de uma vírgula num Post no ar. A recusa vale para quem
     ESTÁ MEXENDO no agendamento: entrando nele, ou pedindo hora diferente da
     gravada. A comparação é feita no MINUTO, que é a granularidade em que o
     Autor escolhe — o campo de data e hora não tem segundos, e uma ida e volta
     por ele não pode passar por "mudou a hora". */
  if (alvo === "agendado") {
    const instante = Date.parse(String(efetiva));
    const limite = agora - MARGEM_DE_RELOGIO_MS;
    const gravado = dataAtual === null || dataAtual === undefined ? Number.NaN : Date.parse(String(dataAtual));
    const minuto = (ms) => (Number.isFinite(ms) ? Math.floor(ms / 60_000) : Number.NaN);
    const mexeuNoAgendamento = mudouDeEstado || minuto(instante) !== minuto(gravado);

    if (Number.isFinite(instante) && instante <= limite && mexeuNoAgendamento) {
      return {
        ok: false,
        recusa: falha(ERRO_DADOS_INVALIDOS, {
          mensagem:
            `Esta data já passou: ${formatarDataEHoraPorExtenso(instante)}. ` +
            "Escolha um momento futuro para agendar, ou publique agora.",
          detalhe: `agendamento para ${new Date(instante).toISOString()}, já vencido`,
          alternativa: ACAO_PUBLICAR,
        }),
      };
    }
  }

  return {
    ok: true,
    estado: alvo,
    mudouDeEstado,
    dataForcada: undefined,
    preservarData: false,
  };
}

/**
 * O Post já esteve visível para quem não tem sessão?
 *
 * É a pergunta que decide se existe link a preservar, e ela é respondida pela
 * MESMA regra da política de leitura anônima: estado publicável e data de
 * publicação já atingida. Ler `publicado_em !== null` sozinho, como a 2.5 fazia,
 * deixou de servir na 2.6 — agora a gaveta preenche a data, e um rascunho com
 * data futura passaria a ser tratado como Post no ar, aposentando endereços que
 * ninguém nunca viu.
 *
 * Rascunho é `false` sempre: rascunho é invisível por construção. Arquivado com
 * data no passado é `true`: ele esteve no ar, e o link continua na mão de quem
 * o guardou.
 */
function jaEsteveNoAr(post) {
  if (post?.estado === "rascunho") return false;
  const quando = post?.publicado_em ? Date.parse(post.publicado_em) : Number.NaN;
  return Number.isFinite(quando) && quando <= Date.now();
}

/**
 * Este endereço pode pertencer a este Post?
 *
 * Devolve `{ ok: true, retomadoDoProprioPost }` ou uma falha de conflito. A
 * consulta é contra os DOIS lugares em que um endereço existe:
 *
 *   * `posts` — outro Post ativo com o mesmo endereço;
 *   * `slugs_antigos` — endereço aposentado, que ainda resolve por
 *     redirecionamento e por isso não pode ser dado a outro Post.
 *
 * A exceção deliberada, que a Story 2.1 registrou no gatilho: um Post pode
 * retomar um endereço aposentado que aponta para ELE MESMO. É o desfazer de uma
 * renomeação, e o resolvedor consulta o endereço ativo antes do aposentado —
 * então não há ambiguidade.
 */
async function enderecoLivre({ acesso, slug, id }) {
  if (slug === undefined || slug === null || slug === "") {
    return { ok: true, retomadoDoProprioPost: false };
  }

  const ativo = await acesso.postPorSlug(slug);
  if (!ativo.ok) return falhaDaEscrita(ativo, "conferência do endereço entre os posts");
  if (ativo.dados !== null && ativo.dados.id !== id) {
    return falha(ERRO_CONFLITO, {
      mensagem: `Já existe um post no endereço "${slug}". Escolha outro antes de salvar.`,
      detalhe: `slug ${slug} já pertence ao post ${ativo.dados.id}`,
    });
  }

  const aposentado = await acesso.slugAposentado(slug);
  if (!aposentado.ok) {
    return falhaDaEscrita(aposentado, "conferência do endereço entre os aposentados");
  }
  if (aposentado.dados !== null) {
    if (aposentado.dados.post_id !== id) {
      return falha(ERRO_CONFLITO, {
        mensagem:
          `O endereço "${slug}" já foi de outro post e continua redirecionando para ele. ` +
          "Escolha outro antes de salvar.",
        detalhe: `slug ${slug} está aposentado apontando para o post ${aposentado.dados.post_id}`,
      });
    }
    return { ok: true, retomadoDoProprioPost: true };
  }

  return { ok: true, retomadoDoProprioPost: false };
}

/** Os metadados que são COLUNA de `posts`. `tags` não é, e por isso fica fora. */
function colunasDeMetadado(campos) {
  const saida = {};
  for (const nome of ["categoria_id", "publicado_em", "tempo_leitura"]) {
    if (campos[nome] !== undefined) saida[nome] = campos[nome];
  }
  return saida;
}

/**
 * O conjunto de Tags do Post, gravado pela função de banco.
 *
 * ─── O que esta escrita NÃO garante, e por quê ──────────────────────────────
 *
 * O conjunto de tags entra ou não entra por inteiro — a função de banco troca as
 * associações numa transação só. O que ela não faz é entrar na MESMA transação
 * que o texto do Post: são duas chamadas, e o PostgREST não as junta. Se a
 * segunda falhar, o texto está salvo e as tags não — e a frase de erro diz
 * exatamente isso, para que a pessoa saiba que reabrir e salvar de novo conserta
 * em vez de duplicar.
 *
 * A escolha é deliberada: amarrar as duas exigiria mover a gravação inteira para
 * dentro de uma função de banco, o que faria a validação do documento e a
 * derivação do HTML terem de existir em SQL — a terceira implementação do
 * renderizador que a arquitetura proíbe. Endereço quebrado é dano permanente e
 * silencioso; tag faltando é visível na volta ao Editor.
 */
async function gravarTags({ acesso, id, lido }) {
  if (lido.campos.tags === undefined) return { ok: true, tags: null };

  const resolvidas = await resolverTags({ acesso, nomes: lido.campos.tags });
  if (!resolvidas.ok) return resolvidas;

  const resposta = await acesso.definirTags(id, resolvidas.ids);
  if (!resposta.ok) {
    const tipo = classificar(resposta);
    return falha(tipo, {
      mensagem:
        "O texto do post foi salvo, mas as tags não. Abra o post e salve de novo para aplicá-las.",
      detalhe: detalhar(resposta, "gravação das tags do post"),
      codigo: resposta.codigo,
      status: resposta.status,
    });
  }
  return { ok: true, tags: [...resolvidas.nomes] };
}

/**
 * NOMES DE TAG → IDENTIFICADORES, reaproveitando a que existe e criando a que
 * falta (Story 2.14).
 *
 * ─── A CHAVE DE IGUALDADE É O SLUG ──────────────────────────────────────────
 *
 * "Vendas", "vendas" e "VENDAS " são a mesma Tag, e quem decide isso é
 * `gerarSlug` — a mesma função que gera o endereço do Post, através de
 * `chaveDaTag`. É por isso que `tags.slug` tem unicidade no banco e `tags.nome`
 * não: o slug é a identidade, o nome é a grafia de quem cadastrou primeiro.
 *
 * ─── A ORDEM DAS DUAS CHAMADAS, E POR QUE ELA É ESSA ────────────────────────
 *
 * Primeiro a inserção das que faltam, com `resolution=ignore-duplicates`;
 * depois a leitura de TODAS por slug. O contrário — ler, decidir o que falta,
 * inserir — deixa uma janela em que duas gravações simultâneas do mesmo nome
 * tentam inserir a mesma linha, e a segunda estoura por unicidade. Ignorar
 * duplicata na inserção e reler depois é o que faz a corrida terminar com as
 * duas apontando para a MESMA Tag, que é o resultado certo.
 *
 * Devolve `{ ok: true, ids, nomes }` — `nomes` são as grafias que ficaram
 * gravadas, que podem não ser as digitadas quando a Tag já existia.
 */
async function resolverTags({ acesso, nomes }) {
  if (nomes.length === 0) return { ok: true, ids: [], nomes: [] };

  /* A lista de inserção é montada AQUI, com as duas colunas nomeadas — o que
     veio no corpo não é espalhado sobre o comando em lugar nenhum. */
  const desejadas = nomes.map((nome) => ({ nome, slug: chaveDaTag(nome) }));
  const slugs = desejadas.map((t) => t.slug);

  const criadas = await acesso.inserirTags(desejadas);
  if (!criadas.ok) {
    const tipo = classificar(criadas);
    return falha(tipo, {
      mensagem:
        "O texto do post foi salvo, mas as tags não. Abra o post e salve de novo para aplicá-las.",
      detalhe: detalhar(criadas, "criação das tags digitadas"),
      codigo: criadas.codigo,
      status: criadas.status,
    });
  }

  const existentes = await acesso.tagsPorSlugs(slugs);
  if (!existentes.ok) {
    const tipo = classificar(existentes);
    return falha(tipo, {
      mensagem:
        "O texto do post foi salvo, mas as tags não. Abra o post e salve de novo para aplicá-las.",
      detalhe: detalhar(existentes, "leitura das tags digitadas"),
      codigo: existentes.codigo,
      status: existentes.status,
    });
  }

  const porSlug = new Map(
    (Array.isArray(existentes.dados) ? existentes.dados : [])
      .filter((t) => t !== null && typeof t === "object")
      .map((t) => [String(t.slug), t]),
  );

  const ids = [];
  const gravados = [];
  const perdidas = [];
  for (const desejada of desejadas) {
    const linha = porSlug.get(desejada.slug);
    if (linha === undefined || typeof linha.id !== "string") {
      perdidas.push(desejada.nome);
      continue;
    }
    ids.push(linha.id);
    gravados.push(typeof linha.nome === "string" ? linha.nome : desejada.nome);
  }

  /* NENHUMA TAG SOME EM SILÊNCIO. Uma Tag que não voltou da leitura é sinal de
     que a inserção não pegou — e descartá-la calado faria o Autor salvar cinco
     tags e reabrir com quatro, que é exatamente o que a função de banco recusa
     fazer com identificador desconhecido. */
  if (perdidas.length > 0) {
    return falha(ERRO_INESPERADO, {
      mensagem:
        "O texto do post foi salvo, mas as tags não. Abra o post e salve de novo para aplicá-las.",
      detalhe: `tags que não voltaram do banco: ${perdidas.join(", ").slice(0, 200)}`,
    });
  }

  return { ok: true, ids, nomes: gravados };
}

/** Falha de uma chamada de escrita, já classificada e com frase certa. */
export function falhaDaEscrita(resultado, oQue) {
  const tipo = classificar(resultado);
  return falha(tipo, {
    mensagem:
      tipo === ERRO_DADOS_INVALIDOS ? mensagemDeRecusaDoBanco(resultado) : "",
    detalhe: detalhar(resultado, oQue),
    codigo: resultado.codigo,
    status: resultado.status,
  });
}

/**
 * O PERFIL DA CONTA — a única autorização que existe nesta porta.
 *
 * ─── Autenticar não é autorizar ─────────────────────────────────────────────
 *
 * Um token válido, por si, só diz que existe uma Conta. A versão anterior
 * aceitava Conta SEM perfil e gravava com `autor_id` nulo — um Post sem autoria
 * rastreável, escrito por alguém que o Painel nunca cadastrou. A barreira que
 * sobrava era o registro público estar fechado, que é configuração de projeto e
 * não código: uma mudança de configuração passaria a permitir escrita sem que
 * uma linha de código mudasse.
 *
 * Ter perfil é o que significa "estar cadastrado no Painel": o gatilho
 * `on_auth_user_created` da Story 1.2 o cria junto da Conta, e `conta:criar`
 * falha alto se ele não nascer. Conta sem perfil é, portanto, uma das duas
 * coisas: gatilho que falhou (defeito a investigar) ou Conta que entrou por
 * fora do onboarding. Nenhuma das duas deve assinar um artigo publicado — nem
 * excluir um, que é por que a exigência mora aqui, fora de `resolverAutor`, e
 * vale para as operações da Story 2.12 também.
 *
 * ─── O QUE ESTA PORTA **NÃO** VERIFICA: autoria ─────────────────────────────
 *
 * Estar cadastrado no Painel é toda a autorização que existe aqui. Qualquer
 * Conta cadastrada edita, arquiva e exclui o Post de qualquer outra — o Painel
 * é confiança compartilhada entre a equipe, e isso é escolha, não esquecimento.
 * `autor_nome` registra quem escreveu; ele não é dono. Escrito para que a
 * próxima pessoa não leia "perfil exigido" como "só o Autor mexe".
 *
 * Devolve `{ ok: true, perfil }` ou uma falha tipada.
 */
export async function perfilOuFalha({
  acesso,
  conta,
  mensagem = "",
  mensagemDeRede = "",
}) {
  const perfil = await acesso.perfilDaConta(conta.id);
  if (!perfil.ok) {
    /* Não adivinhar. O critério de aceite diz que o Autor é a Conta
       autenticada; gravar um Post assinado por palpite porque a leitura do
       nome falhou seria cumprir a letra e quebrar o sentido.

       E a FRASE é a da operação. Este ramo — a leitura do perfil falhando por
       rede ou por banco — ignorava `mensagem` e devolvia a frase de
       salvamento para quem tentou excluir. */
    const recusa = falhaDaEscrita(perfil, "leitura do perfil da Conta");
    if (mensagemDeRede === "") return recusa;
    return falha(recusa.erro.tipo, {
      mensagem: mensagemDeRede,
      detalhe: recusa.erro.detalhe,
      codigo: recusa.erro.codigo,
      status: recusa.erro.status,
    });
  }
  if (perfil.dados === null) {
    return falha(ERRO_PERMISSAO, {
      mensagem:
        mensagem ||
        "Esta conta não está cadastrada no Painel, então não pode assinar um post. Avise quem cuida das contas.",
      detalhe: `conta ${conta.id} autenticada mas sem linha em public.perfis`,
    });
  }
  return { ok: true, perfil: perfil.dados };
}

/**
 * O Autor de um Post NOVO, resolvido no servidor.
 *
 * O nome vem do perfil da Conta autenticada, sem digitação. Se ele viesse do
 * cliente, qualquer detentor de sessão assinaria um Post com o nome de outra
 * pessoa — e é por isso que `autor_nome` está na lista de campos ignorados.
 */
async function resolverAutor({ acesso, conta }) {
  const perfil = await perfilOuFalha({ acesso, conta });
  if (!perfil.ok) return perfil;

  const doPerfil = texto(perfil.perfil.nome_exibicao);
  const dosMetadados = texto(conta.user_metadata?.nome_exibicao);
  const doEmail = texto(conta.email);

  return {
    ok: true,
    autor_id: conta.id,
    autor_nome: doPerfil || dosMetadados || doEmail || "",
  };
}

/**
 * Sucesso.
 *
 * `ignorados` e o relatório de descartes viajam junto porque a tela precisa
 * poder dizer "o que você mandou em `conteudo_html` foi ignorado" e "a tabela
 * colada foi removida" — conteúdo que some sem aviso vira perda permanente.
 */
function sucesso({ post, criado, lido, derivado, tags = null }) {
  return Object.freeze({
    ok: true,
    dados: Object.freeze({
      post,
      criado,
      // `null` significa "o pedido não falou de tags", que é diferente de `[]`,
      // que significa "o pedido pediu nenhuma tag". A tela precisa distinguir os
      // dois para não apagar o que não tocou.
      tags: tags === null ? null : Object.freeze([...tags]),
      ignorados: Object.freeze([...lido.ignorados]),
      totalIgnorado: lido.totalIgnorado,
      ignoradosTruncados: lido.ignoradosTruncados,
      totalDescartado: derivado.totalDescartado,
      totalSaneado: derivado.totalSaneado,
      descartados: derivado.descartados,
      descartadosTruncados: derivado.descartadosTruncados,
    }),
  });
}
