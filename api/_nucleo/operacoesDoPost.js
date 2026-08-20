/**
 * As operações da Story 2.12 — excluir um Post e alternar o Destaque dele.
 *
 * ─── ELAS PASSAM PELA MESMA PORTA, E ISSO É A ENTREGA ───────────────────────
 *
 * "Nenhum cliente escreve no banco, e o único caminho é a função em `api/`" é a
 * regra que sustenta a RLS inteira: não existe política de escrita para `anon`
 * nem para `authenticated`, e o privilégio foi revogado inclusive de `PUBLIC`.
 * Uma segunda rota de escrita seria uma segunda superfície para autenticar,
 * classificar erro e defender — e a segunda sempre fica para trás da primeira.
 *
 * Então este módulo NÃO é uma função de plataforma: ele é chamado pelo mesmo
 * `api/posts.js`, escolhido pelo campo `operacao` do corpo, conferido contra o
 * vocabulário fechado de `src/domain/blog/operacoes.js`.
 *
 * ─── E ELAS REAPROVEITAM O QUE JÁ EXISTE ────────────────────────────────────
 *
 * `identificarChamador`, `perfilOuFalha`, `classificar`, `falha` e
 * `falhaDaEscrita` vêm de `salvarPost.js`, importados. Um segundo classificador
 * divergiria no primeiro código de erro que só um conhece — e a divergência
 * apareceria como "algo saiu do previsto" numa tela e "tente de novo" na outra,
 * para a mesma resposta do banco.
 *
 * Nenhuma das duas lança: exceção que suba daqui vira 500 sem tipo, e a tela
 * fica sem saber se deve pedir para tentar de novo ou para consertar algo.
 */

/* O vocabulário vem do DOMÍNIO, e é o MESMO que o cliente usa para nomear o
   que está pedindo. Escrever `"excluir"` à mão aqui criaria a segunda grafia
   que o módulo de domínio existe para impedir — e a divergência apareceria só
   no dia em que alguém renomeasse uma delas. */
import {
  OPERACAO_DESTACAR,
  OPERACAO_EXCLUIR,
} from "../../src/domain/blog/operacoes.js";
import {
  ERRO_DADOS_INVALIDOS,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  falha,
  falhaDaEscrita,
  identificarChamador,
  PADRAO_UUID,
  perfilOuFalha,
  removerCapaAnterior,
} from "./salvarPost.js";

/**
 * As frases de recusa de permissão, uma por operação.
 *
 * A frase de `salvarPost` manda "tente salvar", e mandar quem tentou excluir
 * salvar de novo é conselho errado. Elas são idênticas para pedido sem token,
 * token forjado e token vencido — a distinção diria a quem tenta se o token
 * que ele inventou tem forma válida.
 */
const SEM_PERMISSAO_PARA_EXCLUIR =
  "Sua sessão não autoriza excluir posts. Entre no Painel de novo e tente outra vez.";
const SEM_PERMISSAO_PARA_DESTACAR =
  "Sua sessão não autoriza mudar o destaque. Entre no Painel de novo e tente outra vez.";

/**
 * E as frases da INDISPONIBILIDADE, que são outras.
 *
 * O Supabase fora do ar não é sessão inválida, e mandar "entre de novo" a
 * quem não tem o que consertar é conselho errado. O vocabulário genérico do
 * núcleo diz "...para salvar" em todos os casos — a mesma fuga que a story
 * mandou fechar do lado do cliente, e que aqui alcança os dois ramos em que a
 * rede falha: a conferência do token e a leitura do perfil.
 */
const SEM_RESPOSTA_PARA_EXCLUIR =
  "Não conseguimos falar com o servidor para excluir o post. Espere um instante e tente excluir de novo.";
const SEM_RESPOSTA_PARA_DESTACAR =
  "Não conseguimos falar com o servidor para mudar o destaque. Espere um instante e tente de novo.";

/**
 * A recusa para quem tem token válido e não está cadastrado no Painel.
 * Autenticar não é autorizar — ver `perfilOuFalha`.
 */
export const SEM_CADASTRO =
  "Esta conta não está cadastrada no Painel, então não pode mexer nos posts. Avise quem cuida das contas.";

/**
 * O identificador do Post, conferido antes de qualquer ida ao banco.
 *
 * Devolve `{ ok: true, id }` ou a falha tipada. O formato é conferido AQUI e
 * não deixado para o PostgREST porque um identificador malformado no filtro
 * volta como erro de sintaxe do Postgres — a pessoa leria "22P02" onde deveria
 * ler que o pedido não diz qual post.
 */
function idDoCorpo(corpo) {
  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  const bruto = ehObjeto ? corpo.id : undefined;
  const id = typeof bruto === "string" ? bruto.trim() : "";
  if (id === "" || !PADRAO_UUID.test(id)) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual post deve ser alterado.",
      detalhe: `id ausente ou fora do formato de identificador: ${JSON.stringify(
        String(bruto).slice(0, 60),
      )}`,
    });
  }
  return { ok: true, id };
}

/**
 * Quem pode mexer: token válido **e** cadastro no Painel, nesta ordem.
 *
 * As duas conferências acontecem ANTES de qualquer escrita, para que "recusado,
 * nada mudou" seja consequência da ordem e não de sorte.
 *
 * **Exportada** desde a Story 2.14: as operações de Categoria fazem exatamente
 * a mesma pergunta, e uma segunda cópia dela divergiria na primeira mudança de
 * política — a operação nova que "esqueceu" de exigir cadastro é o defeito que
 * este arquivo existe para tornar impossível. O que cada operação traz de
 * próprio são as FRASES, que viajam como argumento.
 */
export async function autorizar({
  token,
  acesso,
  mensagem,
  mensagemDeRede,
  /* A frase do CADASTRO também é da operação — "não pode mexer nos posts" dito
     a quem tentou renomear uma Categoria manda a pessoa procurar no lugar
     errado. O padrão é a dos Posts, que é o caso de quem não passa nada. */
  mensagemDeCadastro = SEM_CADASTRO,
}) {
  const chamador = await identificarChamador({
    token,
    acesso,
    mensagem,
    /* A frase da INDISPONIBILIDADE viaja junto, e é da operação. Sem ela, o
       ramo de rede caía no vocabulário genérico do núcleo e quem tentou
       excluir lia "Não conseguimos falar com o servidor para salvar". */
    mensagemDeRede,
  });
  if (!chamador.ok) return chamador;
  const perfil = await perfilOuFalha({
    acesso,
    conta: chamador.conta,
    mensagem: mensagemDeCadastro,
    /* O MESMO para a leitura do perfil: ela também vai ao banco, e falhar ali
       é indisponibilidade, não falta de cadastro. */
    mensagemDeRede,
  });
  if (!perfil.ok) return perfil;
  return { ok: true, conta: chamador.conta };
}

/**
 * Exclui um Post.
 *
 * `{ ok: true, dados: { operacao: 'excluir', id, post } }` — `post` é a linha
 * que saiu, e ela viaja porque a tela anuncia o que aconteceu **nomeando** o
 * Post: uma confirmação genérica depois de uma ação irreversível não deixa
 * ninguém conferir que sumiu o que devia sumir.
 *
 * Post que já não existe é `nao_encontrado`, e não sucesso silencioso: é o
 * caminho normal do segundo clique numa exclusão em curso, e a tela precisa
 * distingui-lo para acertar a lista sem anunciar duas exclusões.
 */
export async function excluirPost({ token, corpo, acesso }) {
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_EXCLUIR,
      mensagemDeRede: SEM_RESPOSTA_PARA_EXCLUIR,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDoCorpo(corpo);
    if (!alvo.ok) return alvo;

    const apagado = await acesso.excluirPost(alvo.id);
    if (!apagado.ok) return falhaDaEscrita(apagado, "exclusão do post");
    if (apagado.dados === null) {
      return falha(ERRO_NAO_ENCONTRADO, {
        detalhe: `nenhum post com id ${alvo.id} para excluir`,
      });
    }

    /* ── E O ARQUIVO DA CAPA SAI DEPOIS DA LINHA (Story 3.1) ─────────────
       A ordem é a mesma que o cabeçalho do transporte já registrava para
       `posts_tags` e `slugs_antigos`, e a story a escolhe por escrito: se o
       arquivo saísse antes e a linha não saísse, sobraria um Post apontando
       para uma capa que não existe — defeito visível para o leitor. Saindo
       depois, o que sobra é um arquivo que ninguém alcança num bucket de
       leitura pública: lixo, não vazamento.

       **A EXCLUSÃO É AUTORITATIVA.** Falha ao remover o arquivo não desfaz nem
       impede nada: ela vira `residuo`, que viaja na resposta e é registrado
       pelo invólucro. O Post foi excluído, e dizer "não deu" por causa de um
       arquivo faria a pessoa clicar de novo sobre uma linha que já saiu. */
    const residuo = await removerCapaAnterior({
      acesso,
      anterior: apagado.dados.imagem_url ?? null,
      atual: null,
    });

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_EXCLUIR,
        id: alvo.id,
        post: apagado.dados,
        ...(residuo === null ? {} : { residuo: Object.freeze(residuo) }),
      }),
    });
  } catch (excecao) {
    return falha(ERRO_INESPERADO, {
      detalhe: `exceção não prevista ao excluir: ${String(
        excecao?.stack ?? excecao?.message ?? excecao,
      )}`,
      codigo: String(excecao?.name ?? ""),
    });
  }
}

/**
 * Liga ou desliga o Destaque de um Post.
 *
 * ─── O VALOR É BOOLEANO, E SÓ BOOLEANO ──────────────────────────────────────
 *
 * `"false"`, `0` e `null` não são aceitos e convertidos: são recusados. A
 * conversão silenciosa é o caminho pelo qual "desmarquei o destaque" vira
 * "marquei o destaque" — `Boolean("false")` é `true` —, e o Autor descobre
 * pelo site. É o mesmo princípio da lista de permissão, aplicado ao valor.
 *
 * ─── E O DESTINO É ABSOLUTO, NUNCA "INVERTA O QUE ESTIVER LÁ" ───────────────
 *
 * A tela manda o valor que quer, e não um pedido de inversão. Com inversão, o
 * segundo clique de um duplo-clique desfaria o primeiro, e dois Autores
 * marcando o mesmo Post ao mesmo tempo o deixariam desmarcado. Idempotência é
 * o que faz o clique repetido não duplicar a operação.
 */
export async function definirDestaque({ token, corpo, acesso }) {
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_DESTACAR,
      mensagemDeRede: SEM_RESPOSTA_PARA_DESTACAR,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDoCorpo(corpo);
    if (!alvo.ok) return alvo;

    const destaque = corpo.destaque;
    if (typeof destaque !== "boolean") {
      return falha(ERRO_DADOS_INVALIDOS, {
        mensagem: "O destaque de um post só pode ser ligado ou desligado.",
        detalhe: `destaque não é booleano: ${JSON.stringify(
          String(destaque).slice(0, 60),
        )}`,
      });
    }

    /* UMA coluna no comando, montada aqui. O corpo do pedido não é espalhado
       sobre o comando em lugar nenhum: se fosse, `{ operacao: 'destacar',
       estado: 'publicado' }` publicaria um Post sem passar pela máquina de
       transições — a transição pela porta de trás. */
    const escrita = await acesso.atualizarPost(alvo.id, { destaque });
    if (!escrita.ok) return falhaDaEscrita(escrita, "gravação do destaque do post");
    if (escrita.dados === null) {
      return falha(ERRO_NAO_ENCONTRADO, {
        detalhe: `nenhum post com id ${alvo.id} para destacar`,
      });
    }

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_DESTACAR,
        id: alvo.id,
        /* O valor GRAVADO, lido da linha que voltou — não o que foi pedido. A
           tela ajusta a estrela por este campo, e ler o pedido de volta seria
           confirmar a si mesma. */
        destaque: escrita.dados.destaque === true,
        post: escrita.dados,
      }),
    });
  } catch (excecao) {
    return falha(ERRO_INESPERADO, {
      detalhe: `exceção não prevista ao destacar: ${String(
        excecao?.stack ?? excecao?.message ?? excecao,
      )}`,
      codigo: String(excecao?.name ?? ""),
    });
  }
}
