/**
 * O cliente da função de escrita — o único jeito de o Painel mexer num Post.
 *
 * São CINCO operações e UMA porta: salvar (Story 2.5), excluir e alternar
 * Destaque (Story 2.12), e salvar e excluir Categoria (Story 2.14) — estas
 * duas mexendo em outra tabela, e mesmo assim sem endereço próprio. Elas se
 * distinguem por um campo do corpo, conferido contra o vocabulário fechado de
 * `domain/blog/operacoes.js` — nunca por um endereço a mais, nunca por um
 * método HTTP a mais, e nunca por uma escrita do cliente direto no banco.
 *
 * **Não escreve no banco.** Nenhum módulo do navegador escreve: a RLS da Story
 * 2.1 nega escrita a `anon` e a `authenticated`, e isso é deliberado. O que este
 * arquivo faz é falar com a função de servidor da Story 2.5 (`/api/posts`), que
 * é quem tem a chave de serviço, confere o token, valida o documento e grava.
 *
 * Ele mora em `data/blog` porque é rede: a tela não monta requisição, não lê
 * cabeçalho e não traduz código HTTP. Ela chama uma função e recebe resultado ou
 * **erro tipado**, como em toda a camada.
 *
 * ─── O token vem da sessão, e é a única coisa que a tela empresta ───────────
 *
 * A identidade não viaja no corpo do pedido — o servidor a confere contra o
 * Supabase a partir do cabeçalho `Authorization`. Se ela viesse no corpo,
 * qualquer detentor de sessão assinaria um Post com o nome de outra pessoa.
 */

// O cliente vem de `comum.js`, o único lugar da camada que o obtém (AD-6).
// A asserção de fronteira cobra isso — e cobrou: a primeira versão importava
// `clienteAutenticado` direto daqui e a verificação da camada de dados falhou.
/* O vocabulário das operações vem do DOMÍNIO — o MESMO módulo que a função de
   servidor importa para decidir o que executar. Escrever `"excluir"` à mão aqui
   criaria a segunda grafia, e a divergência apareceria como uma operação
   recusada pelo servidor com "não reconhecemos a operação pedida" sobre um
   botão que o Painel oferece. */
import {
  OPERACAO_DESTACAR,
  OPERACAO_EXCLUIR,
  OPERACAO_EXCLUIR_CATEGORIA,
  OPERACAO_SALVAR,
  OPERACAO_SALVAR_CATEGORIA,
} from "../../domain/blog/operacoes.js";
import { ehUuid, tokenDoPainelOuFalha } from "./comum.js";
import {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  ERRO_REDE,
  MENSAGENS_DE_LEITURA,
  ehTipoDeErro,
  falha,
  sucesso,
} from "./resultado.js";

/**
 * Os dois tipos que uma ESCRITA tem e uma leitura não.
 *
 * Estão escritos aqui com a MESMA grafia de `api/_nucleo/salvarPost.js`, e as
 * duas listas são comparadas por igualdade pela ferramenta de verificação —
 * porque duas grafias de "conflito" seriam duas telas diferentes para a mesma
 * coisa, e a divergência só apareceria no dia em que alguém tentasse reusar um
 * endereço.
 *
 * Eles não estão em `resultado.js` porque aquele módulo é o vocabulário da
 * LEITURA: acrescentá-los lá faria toda consulta passar a declarar modos de
 * falha que ela não tem.
 */
export const ERRO_DADOS_INVALIDOS = "dados_invalidos";
export const ERRO_CONFLITO = "conflito";

/** O vocabulário completo que uma gravação pode devolver. */
export const TIPOS_DE_ERRO_DE_ESCRITA = Object.freeze([
  ERRO_REDE,
  ERRO_PERMISSAO,
  ERRO_NAO_ENCONTRADO,
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_DADOS_INVALIDOS,
  ERRO_CONFLITO,
]);

/** A rota da função de servidor. Uma só, e declarada uma vez. */
export const ROTA_DE_ESCRITA = "/api/posts";

/* ─── As frases, uma por operação ────────────────────────────────────────── */

/**
 * O que cada operação FAZ, em palavras — e o que se pede para tentar de novo.
 *
 * Existe porque a frase genérica de escrita dizia "salvar" para todo mundo, e
 * quem acabou de tentar excluir um Post lia "tente salvar de novo": conselho
 * errado, sobre uma ação que a pessoa não pediu. O servidor já resolveu isso do
 * lado dele (`SEM_PERMISSAO_PARA_EXCLUIR` e `SEM_PERMISSAO_PARA_DESTACAR`, em
 * `api/_nucleo/operacoesDoPost.js`); esta é a metade que faltava, para os ramos
 * em que o servidor não manda mensagem nenhuma — 5xx, 401 sem corpo JSON, proxy
 * no caminho, rota ausente no ambiente.
 *
 * As chaves são as do vocabulário fechado, e a verificação cobra que sejam
 * exatamente elas: uma operação nova sem frase própria cairia na de salvar sem
 * que nada acusasse.
 */
const VERBOS_DA_OPERACAO = Object.freeze({
  [OPERACAO_SALVAR]: Object.freeze({
    fazer: "salvar o post",
    tentar: "tente salvar de novo",
    conflito: "Já existe um post com este endereço. Escolha outro antes de salvar.",
    ausente: "O post que você está editando já não está no Painel. Volte à listagem para ver o que existe agora.",
  }),
  [OPERACAO_EXCLUIR]: Object.freeze({
    fazer: "excluir o post",
    tentar: "tente excluir de novo",
    /* CONFLITO AO EXCLUIR NÃO É COLISÃO DE ENDEREÇO. A frase de salvar mandava
       quem tentou excluir "escolher outro endereço antes de salvar" — conselho
       sobre uma ação que a pessoa não pediu, num campo que ela não tocou. */
    conflito:
      "Alguma coisa ainda depende deste post, então ele não pode sair agora. Recarregue o Painel e tente excluir de novo.",
    ausente: "Este post já não está no Painel, alguém pode tê-lo excluído antes.",
  }),
  [OPERACAO_DESTACAR]: Object.freeze({
    fazer: "mudar o destaque do post",
    tentar: "tente mudar o destaque de novo",
    conflito:
      "O destaque deste post foi mudado por outra pessoa enquanto você mexia nele. Recarregue o Painel para ver como ele está.",
    ausente: "Este post já não está no Painel, então não dá para mudar o destaque dele.",
  }),
  /* Story 2.14. As Categorias falam da CATEGORIA, e não do post: quem acabou de
     tentar renomear uma categoria lendo "tente salvar o post de novo" procura o
     defeito numa tela que não abriu. */
  [OPERACAO_SALVAR_CATEGORIA]: Object.freeze({
    fazer: "salvar a categoria",
    tentar: "tente salvar de novo",
    conflito: "Já existe uma categoria com este nome ou este endereço. Escolha outro antes de salvar.",
    ausente: "A categoria que você está editando já não está no Painel. Volte à lista de categorias para ver o que existe agora.",
  }),
  [OPERACAO_EXCLUIR_CATEGORIA]: Object.freeze({
    fazer: "excluir a categoria",
    tentar: "tente excluir de novo",
    conflito: "Há posts usando esta categoria. Mude a categoria desses posts antes de excluí-la.",
    ausente: "Esta categoria já não está no Painel, alguém pode tê-la excluído antes.",
  }),
});

/**
 * A frase de uma falha de escrita quando o servidor não mandou a dele.
 *
 * Exportada para ser EXECUTADA pela verificação: as guardas de voz de
 * `admin/shell/voz.js` são rodadas sobre cada combinação de operação e tipo, e
 * é assim que "cada operação tem frase própria em cada ramo" deixa de ser uma
 * promessa do comentário.
 *
 * Operação desconhecida cai na de salvar — e não numa frase vazia: mensagem
 * ruim ainda é melhor que silêncio, que é a mesma política de `voz.js`.
 */
export function fraseDaEscrita(operacao, tipo) {
  const verbo = VERBOS_DA_OPERACAO[operacao] ?? VERBOS_DA_OPERACAO[OPERACAO_SALVAR];
  if (tipo === ERRO_PERMISSAO) {
    return `Sua sessão não autoriza ${verbo.fazer}. Entre no Painel de novo e ${verbo.tentar}.`;
  }
  if (tipo === ERRO_REDE) {
    return `Não conseguimos falar com o servidor para ${verbo.fazer}. Confira a conexão e ${verbo.tentar}.`;
  }
  if (tipo === ERRO_NAO_ENCONTRADO) return verbo.ausente;
  if (tipo === ERRO_CONFLITO) return verbo.conflito;
  if (tipo === ERRO_DADOS_INVALIDOS) {
    return `Não conseguimos ${verbo.fazer} com o que foi enviado. Confira os campos e ${verbo.tentar}.`;
  }
  if (tipo === ERRO_CONFIGURACAO) {
    return `A configuração do servidor está incompleta, então não dá para ${verbo.fazer}. Avise quem cuida do projeto.`;
  }
  return `Não deu para ${verbo.fazer} agora. Espere um instante e ${verbo.tentar}.`;
}

/**
 * As frases padrão da LEITURA, como conjunto.
 *
 * `tokenDoPainelOuFalha` vive em `comum.js` e devolve as falhas do vocabulário
 * de leitura — inclusive "Esta leitura exige uma sessão válida", que é o que
 * quem tentou excluir um Post lia. Aqui a frase recebida é comparada com este
 * conjunto: se é uma das genéricas da leitura, ela é trocada pela da operação;
 * se é própria (a da configuração ausente NOMEIA as variáveis que faltam), ela
 * atravessa intacta.
 */
const FRASES_DA_LEITURA = new Set(Object.values(MENSAGENS_DE_LEITURA));

/** Prazo do lado do navegador. Maior que o do servidor, para não cortá-lo. */
export const PRAZO_DE_ESCRITA_MS = 20000;

/**
 * Tipo de erro para as respostas em que o servidor não conseguiu dizer o seu.
 *
 * O caso que importa é o 404 do HTML: em desenvolvimento (`vite`) a rota
 * `/api/posts` não existe, e o servidor devolve a página do aplicativo com
 * status 200 ou 404. Sem esta tradução, a tela diria "post não encontrado" para
 * um ambiente que simplesmente não tem a função publicada.
 */
function tipoDoStatus(status) {
  if (status === 401 || status === 403) return ERRO_PERMISSAO;
  if (status === 404) return ERRO_CONFIGURACAO;
  if (status === 409) return ERRO_CONFLITO;
  if (status === 422 || status === 400 || status === 405) return ERRO_DADOS_INVALIDOS;
  if (status === 408 || status === 429 || status >= 500) return ERRO_REDE;
  return ERRO_INESPERADO;
}

/**
 * Falha de escrita, com os dois tipos extras aceitos.
 *
 * `falha` de `resultado.js` só conhece os cinco da leitura e transformaria
 * `conflito` em `inesperado` — a tela perderia justamente a informação que
 * distingue "escolha outro endereço" de "tente de novo". Por isso o objeto é
 * montado aqui quando o tipo é um dos dois novos, com a MESMA forma.
 */
function falhaDeEscrita(tipo, { operacao = "", mensagem = "", detalhe = "", faltando = null, status = null, codigo = "", alternativa = null } = {}) {
  if (ehTipoDeErro(tipo)) {
    return falha(tipo, { operacao, mensagem, detalhe, faltando, status, codigo });
  }
  const conhecido = TIPOS_DE_ERRO_DE_ESCRITA.includes(tipo) ? tipo : ERRO_INESPERADO;
  const erro = {
    tipo: conhecido,
    mensagem:
      typeof mensagem === "string" && mensagem.trim() !== ""
        ? mensagem
        : conhecido === ERRO_CONFLITO
          ? "Já existe um post com este endereço. Escolha outro antes de salvar."
          : "Não conseguimos salvar com o que foi enviado. Confira os campos e tente de novo.",
    operacao,
    detalhe: String(detalhe ?? ""),
    codigo: String(codigo ?? ""),
    status: Number.isFinite(Number(status)) && status !== null ? Number(status) : null,
  };
  if (Array.isArray(faltando)) erro.faltando = Object.freeze([...faltando]);
  /* A SAÍDA que o servidor nomeou (Story 2.9): a chave de uma ação da máquina
     de transições. Ela atravessa a camada como texto e nada mais — quem decide
     se aquela ação existe no Estado em que o Post está é a tela, consultando a
     máquina. Uma chave que a máquina não declare simplesmente não vira botão. */
  if (typeof alternativa === "string" && alternativa.trim() !== "") {
    erro.alternativa = alternativa.trim();
  }
  return Object.freeze({ ok: false, erro: Object.freeze(erro) });
}

/**
 * O PEDIDO À FUNÇÃO DE SERVIDOR — a única porta, e ela é uma só função aqui.
 *
 * Todas as operações do vocabulário fechado compartilham este caminho inteiro:
 * o token pelo ponto único, o prazo, a leitura da resposta, a tradução do erro
 * e a frase de "a função não respondeu neste ambiente". É a mesma porta, e
 * precisa **parecer** a mesma porta — cinco cópias divergiriam na primeira
 * mudança de tratamento de erro, e a divergência apareceria como uma operação
 * que diz "tente de novo" e outra que diz "entre de novo" para a mesma falha
 * de rede.
 *
 * `operacao` viaja no CORPO, e não no endereço nem no método: o vocabulário é
 * fechado e conferido no servidor. `rotulo` é só o nome da chamada no erro
 * tipado, para quem lê o log saber qual delas falhou.
 *
 * ─── AS DUAS COSTURAS, E POR QUE ELAS EXISTEM ───────────────────────────────
 *
 * `buscar` e `obterToken` são injetáveis, com o comportamento real como padrão.
 * Não é adorno de teste: sem elas, o que este módulo PÕE no corpo do pedido só
 * seria observável abrindo uma sessão de verdade, e a verificação teria de se
 * contentar em LER o código — que é o que a regra 2 do projeto proíbe. Com a
 * costura, a asserção confere o corpo que sairia para a rede, e trocar
 * `{ ...corpo, operacao }` por `corpo` passa a fazer a suíte gritar em vez de
 * transformar toda exclusão em salvamento silencioso.
 *
 * Devolve `{ ok: true, dados }` ou `{ ok: false, erro }`. **Nunca lança.**
 */
async function pedirAoServidor({
  operacao,
  rotulo,
  corpo,
  buscar,
  obterToken = tokenDoPainelOuFalha,
}) {
  const token = await obterToken(rotulo);
  if (!token.ok) {
    /* A FRASE PRECISA SER DA OPERAÇÃO. `tokenDoPainelOuFalha` fala o
       vocabulário da LEITURA, e "Esta leitura exige uma sessão válida" chegando
       a quem tentou excluir manda a pessoa procurar numa consulta que ela não
       fez. Frase própria do módulo de origem — a da configuração ausente NOMEIA
       as variáveis que faltam — atravessa intacta. */
    const generica = FRASES_DA_LEITURA.has(token.erro.mensagem);
    return falhaDeEscrita(token.erro.tipo, {
      operacao: rotulo,
      mensagem: generica
        ? fraseDaEscrita(operacao, token.erro.tipo)
        : token.erro.mensagem,
      detalhe: token.erro.detalhe,
      codigo: token.erro.codigo,
      status: token.erro.status,
      faltando: Array.isArray(token.erro.faltando) ? token.erro.faltando : null,
    });
  }

  let resposta;
  try {
    resposta = await buscar(ROTA_DE_ESCRITA, {
      method: "POST",
      signal: AbortSignal.timeout(PRAZO_DE_ESCRITA_MS),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token.dados}`,
      },
      /* A operação é declarada DEPOIS do corpo, e não antes: um corpo que
         trouxesse `operacao` por engano — de um `post` lido do banco, por
         exemplo — não pode escolher a operação no lugar de quem chamou. */
      body: JSON.stringify({ ...corpo, operacao }),
    });
  } catch (excecao) {
    /* Rede fora, prazo estourado, pedido abortado: nada foi decidido pelo
       servidor, então o conteúdo continua onde está e a frase manda tentar de
       novo — que é o conselho certo, e o único que serve aqui. */
    return falhaDeEscrita(ERRO_REDE, {
      operacao: rotulo,
      mensagem: fraseDaEscrita(operacao, ERRO_REDE),
      detalhe: String(excecao?.message ?? excecao),
      codigo: String(excecao?.name ?? ""),
    });
  }

  const texto = await resposta.text().catch(() => "");
  let corpoDaResposta = null;
  try {
    corpoDaResposta = texto === "" ? null : JSON.parse(texto);
  } catch {
    corpoDaResposta = null;
  }

  if (resposta.ok && corpoDaResposta?.ok === true) {
    return sucesso(corpoDaResposta.dados ?? null);
  }

  /* O servidor já classificou: usar o tipo dele é o que mantém uma única
     tradução de erro no projeto. O status entra só quando ele não classificou —
     resposta que não é JSON, HTML de rota inexistente, proxy no caminho. */
  const doServidor = corpoDaResposta?.erro ?? null;
  const tipo = TIPOS_DE_ERRO_DE_ESCRITA.includes(doServidor?.tipo)
    ? doServidor.tipo
    : tipoDoStatus(resposta.status);

  /* Rota inexistente e ambiente mal configurado são o MESMO tipo e problemas
     bem diferentes, e a frase genérica mandava procurar no lugar errado:
     alguém salvando um post lia "a configuração do Supabase está incompleta" e
     ia conferir chave e URL, que estavam certas. O 404 sem corpo do servidor
     só acontece quando a função não existe naquele ambiente — em `vite dev`,
     por exemplo, onde quem serve `api/` é o plugin de desenvolvimento. */
  const rotaAusente = resposta.status === 404 && doServidor === null;

  return falhaDeEscrita(tipo, {
    operacao: rotulo,
    mensagem:
      typeof doServidor?.mensagem === "string" && doServidor.mensagem.trim() !== ""
        ? doServidor.mensagem
        : rotaAusente
          ? `A função de servidor (${ROTA_DE_ESCRITA}) não respondeu neste ambiente. Em desenvolvimento ela é servida pelo Vite; se você acabou de mexer na configuração, reinicie o \`npm run dev\`.`
          /* O servidor não classificou — 5xx, 401 sem corpo JSON, proxy no
             caminho. A frase é a da OPERAÇÃO, e não a de salvar para todas. */
          : fraseDaEscrita(operacao, tipo),
    // `detalhe` do servidor nunca chega ao cliente — é decisão do invólucro, e
    // o que se registra aqui é o que dá para saber daqui.
    detalhe: `HTTP ${resposta.status} em ${ROTA_DE_ESCRITA}`,
    faltando: Array.isArray(doServidor?.faltando) ? doServidor.faltando : null,
    alternativa:
      typeof doServidor?.alternativa === "string" ? doServidor.alternativa : null,
    status: resposta.status,
  });
}

/**
 * Grava um Post pela função de servidor.
 *
 * `corpo` é o que a Story 2.5 aceita: `id` (ausente para criar), `slug`,
 * `titulo`, `resumo`, `conteudo`, `categoria_id`, `tags`, `publicado_em`,
 * `tempo_leitura` e `estado`. O que vier fora da lista é ignorado **pelo
 * servidor**, e a resposta diz quais foram — a tela pode avisar em vez de
 * deixar sumir.
 *
 * Devolve `{ ok: true, dados }` ou `{ ok: false, erro }`. **Nunca lança.**
 */
export async function salvarPost(corpo, { buscar = globalThis.fetch, obterToken } = {}) {
  return pedirAoServidor({
    operacao: OPERACAO_SALVAR,
    rotulo: "salvarPost",
    corpo,
    buscar,
    obterToken,
  });
}

/**
 * Exclui um Post — pela MESMA porta, e não por um `delete` do cliente.
 *
 * A RLS nega escrita a `authenticated`, e isso é deliberado: uma exclusão pelo
 * cliente exigiria política de escrita, e política de escrita "só para excluir"
 * é política de escrita.
 *
 * O identificador é conferido AQUI antes de viajar, pelo mesmo motivo que o
 * slug é conferido antes de virar filtro: o que vem da tela chega ao servidor,
 * e recusar cedo dá uma frase melhor que a resposta de um filtro malformado.
 *
 * ─── E A RECUSA LOCAL É `dados_invalidos`, NUNCA `nao_encontrado` ────────────
 *
 * A distinção não é de gosto. `nao_encontrado` é a resposta do SERVIDOR sobre
 * um Post que já saiu, e a tela age sobre ela tirando a linha da lista — é o
 * caminho normal do segundo clique. Um identificador malformado nunca chegou a
 * ser pedido a ninguém: classificá-lo como ausência faria a linha sumir e a
 * contagem cair sem que nada tivesse acontecido no banco. O servidor classifica
 * o MESMO defeito como `dados_invalidos` (`idDoCorpo`, em
 * `api/_nucleo/operacoesDoPost.js`), e a verificação compara os dois lados: dois
 * vereditos para o mesmo id seriam duas telas para o mesmo defeito.
 *
 * Devolve `{ ok: true, dados: { operacao, id, post } }` ou `{ ok: false, erro }`.
 * Post que já não existe volta do servidor como `nao_encontrado`.
 */
export async function excluirPost(id, { buscar = globalThis.fetch, obterToken } = {}) {
  const rotulo = "excluirPost";
  if (!ehUuid(id)) {
    return falhaDeEscrita(ERRO_DADOS_INVALIDOS, {
      operacao: rotulo,
      mensagem: "Não reconhecemos qual post deve ser excluído.",
      detalhe: `id fora do formato de identificador: ${JSON.stringify(String(id).slice(0, 60))}`,
    });
  }
  return pedirAoServidor({
    operacao: OPERACAO_EXCLUIR,
    rotulo,
    corpo: { id: String(id).trim() },
    buscar,
    obterToken,
  });
}

/**
 * Liga ou desliga o Destaque de um Post — também pela mesma porta.
 *
 * `destaque` é o valor DESEJADO, e não um pedido de inversão. Com inversão, o
 * clique repetido desfaria a si mesmo e dois Autores mexendo no mesmo Post ao
 * mesmo tempo o deixariam no estado de ninguém. Aqui a operação é idempotente:
 * pedir duas vezes o mesmo valor tem o mesmo efeito que pedir uma.
 *
 * Devolve `{ ok: true, dados: { operacao, id, destaque, post } }` — `destaque`
 * é o valor **gravado**, lido da linha que voltou, e é ele que a tela mostra.
 */
export async function definirDestaque(
  id,
  destaque,
  { buscar = globalThis.fetch, obterToken } = {},
) {
  const rotulo = "definirDestaque";
  /* `dados_invalidos`, e não `nao_encontrado` — ver a explicação em
     `excluirPost`: ausência é veredito do servidor, e a tela age sobre ela. */
  if (!ehUuid(id)) {
    return falhaDeEscrita(ERRO_DADOS_INVALIDOS, {
      operacao: rotulo,
      mensagem: "Não reconhecemos em qual post mudar o destaque.",
      detalhe: `id fora do formato de identificador: ${JSON.stringify(String(id).slice(0, 60))}`,
    });
  }
  if (typeof destaque !== "boolean") {
    return falhaDeEscrita(ERRO_DADOS_INVALIDOS, {
      operacao: rotulo,
      mensagem: "O destaque de um post só pode ser ligado ou desligado.",
      detalhe: `destaque não é booleano: ${JSON.stringify(String(destaque).slice(0, 60))}`,
    });
  }
  return pedirAoServidor({
    operacao: OPERACAO_DESTACAR,
    rotulo,
    corpo: { id: String(id).trim(), destaque },
    buscar,
    obterToken,
  });
}

/* ─── Categorias (Story 2.14) ────────────────────────────────────────────── */

/**
 * Cria ou edita uma Categoria — pela MESMA porta, e não por um `insert` do
 * cliente.
 *
 * A RLS nega escrita a `authenticated` em `categorias` tanto quanto em `posts`,
 * e isso é deliberado: uma categoria criada pelo cliente exigiria política de
 * escrita, e política de escrita "só para categorias" é política de escrita.
 *
 * `campos` é `{ nome, slug, icone, cor, ordem }` — o servidor tem a lista
 * fechada, e o que vier fora dela é ignorado lá. `id` ausente CRIA; `id`
 * presente edita, e é conferido aqui antes de viajar pela mesma razão que na
 * exclusão de Post: recusar cedo dá uma frase melhor que a resposta de um
 * filtro malformado, e a recusa local é `dados_invalidos` e nunca
 * `nao_encontrado`.
 *
 * Devolve `{ ok: true, dados: { operacao, criada, categoria } }` ou
 * `{ ok: false, erro }`. **Nunca lança.**
 */
export async function salvarCategoria(
  campos,
  { id = null, buscar = globalThis.fetch, obterToken } = {},
) {
  /* O rótulo é a PRÓPRIA chave da operação, importada — escrevê-la aqui como
     literal criaria a segunda grafia que o módulo de domínio existe para
     impedir, e a verificação cobra exatamente isso. */
  const rotulo = OPERACAO_SALVAR_CATEGORIA;
  const alvo = id === null || id === undefined || id === "" ? null : id;
  if (alvo !== null && !ehUuid(alvo)) {
    return falhaDeEscrita(ERRO_DADOS_INVALIDOS, {
      operacao: rotulo,
      mensagem: "Não reconhecemos qual categoria deve ser alterada.",
      detalhe: `id fora do formato de identificador: ${JSON.stringify(String(id).slice(0, 60))}`,
    });
  }
  const corpo = { ...(campos ?? {}) };
  if (alvo !== null) corpo.id = String(alvo).trim();
  else delete corpo.id;
  return pedirAoServidor({
    operacao: OPERACAO_SALVAR_CATEGORIA,
    rotulo,
    corpo,
    buscar,
    obterToken,
  });
}

/**
 * Exclui uma Categoria — também pela mesma porta.
 *
 * Categoria em uso volta do servidor como `conflito`, com a frase que diz
 * **quantos** Posts dependem dela. A tela mostra essa frase e não inventa
 * outra: quem sabe o número é quem contou.
 *
 * Devolve `{ ok: true, dados: { operacao, id, categoria } }` ou
 * `{ ok: false, erro }`. **Nunca lança.**
 */
export async function excluirCategoria(id, { buscar = globalThis.fetch, obterToken } = {}) {
  const rotulo = OPERACAO_EXCLUIR_CATEGORIA;
  if (!ehUuid(id)) {
    return falhaDeEscrita(ERRO_DADOS_INVALIDOS, {
      operacao: rotulo,
      mensagem: "Não reconhecemos qual categoria deve ser excluída.",
      detalhe: `id fora do formato de identificador: ${JSON.stringify(String(id).slice(0, 60))}`,
    });
  }
  return pedirAoServidor({
    operacao: OPERACAO_EXCLUIR_CATEGORIA,
    rotulo,
    corpo: { id: String(id).trim() },
    buscar,
    obterToken,
  });
}
