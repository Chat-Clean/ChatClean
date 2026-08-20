/**
 * A listagem de Posts do Painel.
 *
 * ─── A COSTURA QUE ESTA TELA FECHA ──────────────────────────────────────────
 *
 * Até aqui o Painel **gravava no Supabase e listava o `localStorage`**. O Autor
 * salvava um Post, voltava para a listagem e não o encontrava — não porque a
 * gravação falhasse, mas porque a tela que deveria mostrar o resultado estava
 * lendo outra coisa. Esta lista lê `data/blog/posts.js`, com sessão, e é a única
 * origem: manter a leitura antiga "por segurança" é exatamente como o Painel
 * chegou a mostrar de uma fonte e escrever noutra.
 *
 * ─── CINCO TELAS, E QUATRO DELAS NÃO TÊM LINHA NENHUMA ──────────────────────
 *
 * Carregando, erro, vazio inicial, vazio de busca e lista. As quatro primeiras
 * são fáceis de colapsar numa só, e colapsá-las é o defeito:
 *
 *   - **carregando** mostra esqueleto, nunca tela em branco — branco é
 *     indistinguível de "não há nada", e a pessoa vai embora achando que perdeu
 *     o trabalho;
 *   - **erro** diz o que houve e o que fazer, com a frase do erro TIPADO que a
 *     camada devolve: sessão expirada pede entrar de novo, rede pede tentar de
 *     novo, e as duas oferecem o botão;
 *   - **vazio inicial** é superfície de primeira classe — a primeira tela que um
 *     Autor novo vê — e leva ao primeiro Post;
 *   - **vazio de busca** diz que não há correspondência para AQUELE termo, e
 *     oferece limpar. É o único dos três que alguém causou, e o único com
 *     desfazer.
 *
 * Os quatro mostram uma lista sem linhas, e é só isso que têm em comum. Trocar
 * um pelo outro é como um Autor conclui que o que escreveu sumiu — quem
 * procurou "estratégia" e recebeu o convite de escrever o primeiro post não tem
 * como saber que o arquivo continua lá.
 *
 * ─── A BUSCA ACONTECE NO BANCO ──────────────────────────────────────────────
 *
 * Esta tela não filtra nada: ela PEDE o recorte à camada, que pede ao Postgres.
 * Filtrar aqui a lista já carregada funcionaria enquanto houvesse poucos Posts
 * e passaria a mentir exatamente quando a busca ficasse necessária. O termo
 * chega por propriedade e sai por argumento; quem tira acento e caixa é o banco.
 *
 * E digitação é RAJADA: uma consulta por tecla castiga o banco e faz respostas
 * chegarem fora de ordem. O termo espera a digitação parar, e toda resposta
 * carrega o número do pedido — a que chega tarde é descartada em vez de
 * sobrescrever a mais nova, que é o defeito clássico de busca enquanto se
 * digita e aparece como resultado de um termo que já não está no campo.
 *
 * ─── O ESTADO APARECE POR PONTO **E** PALAVRA ───────────────────────────────
 *
 * A pílula é a mesma do Editor (`PilulaDeEstado`) — segundo consumidor, não
 * segunda implementação —, e cor nunca é o único portador: quem não distingue os
 * verdes do azul lê "Publicado" do mesmo jeito. Post agendado ganha a data
 * futura ao lado do rótulo, porque "Agendado" sozinho responde metade da
 * pergunta de quem abriu a listagem para decidir onde continuar.
 *
 * ─── A ORDEM VEM DA CAMADA ──────────────────────────────────────────────────
 *
 * `ordenarListagem` é importada, não reescrita. A regra é
 * `COALESCE(publicado_em, atualizado_em)` decrescente com desempate
 * determinístico por `id`, e uma segunda cópia dela aqui divergiria no primeiro
 * empate — o caso que ninguém testa e que faz a lista trocar de sequência entre
 * dois carregamentos.
 *
 * ─── AS AÇÕES RESOLVEM NA LINHA (Story 2.12) ───────────────────────────────
 *
 * Quatro alvos por linha — editar, ver, alternar Destaque e excluir —
 * de 40×40, **com contorno permanente**. Ação revelada por hover não existe no
 * celular, não existe para quem navega por teclado e não existe para quem não
 * sabe que deve passar o ponteiro por cima: o contorno é o que transforma
 * "descobrir" em "ver".
 *
 * **Nenhuma delas escreve no banco.** Excluir e destacar viajam por
 * `data/blog/escrita.js`, que fala com a MESMA função de servidor que salva —
 * a operação é um campo do corpo, conferido contra o vocabulário fechado de
 * `domain/blog/operacoes.js`, e não um endereço a mais. A RLS que nega escrita
 * a `anon` e a `authenticated` continua intacta.
 *
 * **A lista se acerta sozinha.** Depois de excluir, a linha sai daqui; depois
 * de destacar, a estrela reflete o valor que o servidor GRAVOU — lido da
 * resposta, não o que a tela pediu. Nenhuma das duas recarrega a página.
 *
 * **Um pedido de cada vez.** O trinco é `emCurso`, e ele é uma referência, não
 * um estado: dois cliques no mesmo tique do relógio veriam o mesmo estado
 * antigo e disparariam duas exclusões, e a segunda voltaria como "post não
 * encontrado" sobre um Post que a primeira acabou de apagar.
 *
 * ─── O QUE ESTA TELA NÃO FAZ ────────────────────────────────────────────────
 *
 * Não filtra em memória o que veio do recorte. Não DECIDE para onde a ação de
 * ver leva: quem responde "dá para ver isto, e como" é `acoes.js`, o mesmo
 * módulo que o Editor consulta — duas telas decidindo por conta própria é como
 * um sinônimo entra no projeto. E não escreve no banco: nenhum cliente escreve.
 *
 * ─── VER, DEPOIS DA STORY 2.13 ──────────────────────────────────────────────
 *
 * A ação de ver deixou de ser indisponível para Post não publicado: ela leva à
 * pré-visualização sob o Painel, que abre por identificador e por isso não
 * depende de o rascunho ter endereço.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  SearchX,
  SquarePen,
  Star,
  Trash2,
} from "lucide-react";

import PilulaDeEstado from "@/admin/blog/PilulaDeEstado";
import {
  DESTINO_SITE,
  ROTULO_DE_CONFIRMAR_EXCLUSAO,
  confirmacaoDaExclusao,
  confirmacaoDeDestaque,
  descricaoDaExclusao,
  destinoDeVer,
  estaDestacado,
  falhaDaExclusao,
  falhaDeDestaque,
  motivoDeNaoVer,
  rotuloDeDestaque,
  rotuloDeExcluir,
  rotuloDeVer,
  textoDaAcaoEmCurso,
  tituloDaExclusao,
} from "@/admin/blog/acoes";
import {
  DESCRICAO_DO_VAZIO,
  ROTULO_DE_LIMPAR_BUSCA,
  ROTULO_DE_RECARREGAR,
  ROTULO_DO_PRIMEIRO_POST,
  TITULO_DO_ERRO,
  TITULO_DO_VAZIO,
  TITULO_DO_VAZIO_DE_BUSCA,
  descricaoDoVazioDeBusca,
  haBuscaAtiva,
  monogramaDaCategoria,
  nomeDaCategoria,
  rotuloParaAbrir,
  textoDaData,
  textoDoAgendamento,
  textoDoTempoDeLeitura,
} from "@/admin/blog/listagem";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
/* A fala do resíduo do Storage (Story 3.1) mora no módulo puro da capa — a
   MESMA que o Editor usa quando a troca de capa deixa arquivo para trás. */
import { falaDoResiduo } from "@/admin/blog/capa";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { definirDestaque, excluirPost } from "@/data/blog/escrita";
import { listarPostsDoPainel, ordenarListagem } from "@/data/blog/posts";
import { ERRO_NAO_ENCONTRADO } from "@/data/blog/resultado";
import { OPERACAO_DESTACAR, OPERACAO_EXCLUIR } from "@/domain/blog/operacoes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Quantas linhas fantasma o esqueleto desenha enquanto os dados vêm. */
const LINHAS_DO_ESQUELETO = 4;

/**
 * Quanto a listagem espera a digitação parar antes de consultar o banco.
 *
 * Exportado porque a verificação precisa do número DE VERDADE: uma espera
 * escrita à mão na ferramenta e outra aqui divergem no dia em que uma das duas
 * mudar, e a asserção passaria a provar outra coisa.
 *
 * Curto o bastante para não parecer travado, longo o bastante para uma palavra
 * inteira digitada em rajada virar UMA consulta.
 */
export const ESPERA_DA_BUSCA_MS = 250;

/**
 * A aparência de um alvo de ação da linha — 40×40 e **contorno permanente**.
 *
 * O contorno é a entrega, não o enfeite: nada aqui é condicionado a `hover`,
 * nada nasce transparente e nada nasce escondido. A verificação monta a lista e
 * confere a lista de classes do elemento renderizado — se alguém trocar a borda
 * por uma que só aparece com o ponteiro em cima, a asserção acusa antes de o
 * defeito voltar ao celular.
 *
 * `size-10` são os 40×40 exatos; `ALVO_DE_TOQUE` é o piso que sobrevive a um
 * ícone maior ou a um `padding` diferente. Os dois juntos, de propósito.
 */
const CLASSE_DO_ALVO_DE_ACAO = cn(
  ANEL_DE_FOCO,
  ALVO_DE_TOQUE,
  "inline-flex size-10 shrink-0 items-center justify-center rounded-controle",
  "border border-border-strong bg-surface text-ink-secondary",
  "transition-colors hover:bg-surface-sunk hover:text-ink",
  "disabled:pointer-events-none disabled:opacity-60",
  "aria-disabled:cursor-not-allowed aria-disabled:text-ink-muted",
);

export default function ListaDePosts({
  aoAbrirPost,
  aoCriarPost,
  aoContar,
  aoLimparBusca,
  termo = "",
  estados = [],
  recarregarEm = 0,
}) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [posts, setPosts] = useState([]);
  /* O contador de tentativas é o que faz o botão de "tentar de novo" REFAZER a
     leitura: sem uma dependência que muda, o efeito não roda outra vez e o botão
     vira enfeite. */
  const [tentativa, setTentativa] = useState(0);

  /* O termo APLICADO: o que já virou consulta, que é diferente do que está no
     campo enquanto a pessoa digita. Ele NASCE igual ao da tela para que o
     primeiro carregamento seja imediato — atrasar a primeira leitura por causa
     da espera de digitação faria o Painel abrir devendo um quarto de segundo
     sem motivo nenhum. */
  const [termoAplicado, setTermoAplicado] = useState(termo);

  /* A lista de Estados chega como propriedade, e um vetor novo a cada
     renderização da página faria o efeito rodar em laço. A CHAVE é o dado: uma
     string derivada dela, estável enquanto o conjunto for o mesmo. */
  const chaveDosEstados = (Array.isArray(estados) ? estados : []).join(",");
  const estadosAplicados = useMemo(
    () => (chaveDosEstados === "" ? [] : chaveDosEstados.split(",")),
    [chaveDosEstados],
  );

  /* `aoContar` viaja por referência para ficar FORA das dependências do efeito.
     Uma função recriada a cada renderização da página — que é o caso normal —
     faria a listagem recarregar em laço, e o laço só apareceria em produção,
     como uma consulta por segundo. */
  const contar = useRef(aoContar);
  useEffect(() => {
    contar.current = aoContar;
  }, [aoContar]);

  /* ── A espera da digitação ──────────────────────────────────────────────
     Enquanto as teclas chegam, o relógio é reiniciado e nenhuma consulta sai.
     Sem isto, "atendimento" seriam onze idas ao banco, dez delas descartadas —
     e a décima primeira poderia chegar antes da sétima. */
  useEffect(() => {
    if (termo === termoAplicado) return undefined;
    const relogio = setTimeout(() => setTermoAplicado(termo), ESPERA_DA_BUSCA_MS);
    return () => clearTimeout(relogio);
  }, [termo, termoAplicado]);

  /* ── O pedido em curso ──────────────────────────────────────────────────
     Cada leitura leva um número. Quando a resposta volta, ela só é aplicada se
     ainda for a mais nova — é assim que uma resposta atrasada deixa de
     sobrescrever um resultado mais recente. A limpeza do efeito também avança o
     número, então nada aplicado depois de desmontar. */
  const ultimoPedido = useRef(0);

  useEffect(() => {
    ultimoPedido.current += 1;
    const pedido = ultimoPedido.current;
    setCarregando(true);
    setErro(null);

    (async () => {
      const resultado = await listarPostsDoPainel({
        termo: termoAplicado,
        estados: estadosAplicados,
      });
      if (ultimoPedido.current !== pedido) return;

      if (!resultado.ok) {
        /* ERRO NÃO É VAZIO. A lista anterior é descartada junto: mostrar linhas
           velhas embaixo de uma mensagem de falha diz que elas ainda valem. */
        setPosts([]);
        setErro(resultado.erro);
        setCarregando(false);
        contar.current?.(null);
        return;
      }
      const ordenados = ordenarListagem(resultado.dados);
      setPosts(ordenados);
      setErro(null);
      setCarregando(false);
      /* A contagem da aba é quantos Posts EXISTEM, não quantos sobraram do
         filtro. Anunciar o recorte faria a aba dizer "3" para quem tem doze — e
         o número mudaria a cada tecla, sem que nada tivesse sido apagado. */
      if (!haBuscaAtiva({ termo: termoAplicado, estados: estadosAplicados })) {
        totalConhecido.current = ordenados.length;
        contar.current?.(ordenados.length);
      }
    })();

    return () => {
      ultimoPedido.current += 1;
    };
  }, [recarregarEm, tentativa, termoAplicado, estadosAplicados]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  /* ── As ações por linha (Story 2.12) ────────────────────────────────────
     `emCurso` é a ação em voo — `{ id, operacao }` — e existe DUAS vezes de
     propósito: em referência, para o trinco, e em estado, para a tela. O
     trinco precisa ser lido e escrito no mesmo tique do clique; o estado só
     chega no render seguinte, e é por essa fresta que o duplo-clique
     dispararia duas exclusões.

     ─── E O TRINCO APARECE NA TELA ────────────────────────────────────────
     Ele é GLOBAL — um pedido de cada vez na listagem inteira —, então os
     alvos de TODAS as linhas desabilitam enquanto ele está preso. A versão
     anterior desabilitava só a linha em voo: acionar destacar noutra linha
     caía no trinco e voltava sem notificação, sem `aria-busy` e sem nada —
     o mesmo "alvo que parou de funcionar sem explicar" que a story existe
     para consertar. E, no caso de excluir, ainda ABRIA um diálogo que a
     confirmação não conseguia fechar. */
  const trinco = useRef(null);
  const [emCurso, setEmCurso] = useState(null);
  /* O Post que o diálogo está perguntando sobre. `null` fecha o diálogo — a
     pergunta NOMEIA o Post, então ela não existe sem um. */
  const [paraExcluir, setParaExcluir] = useState(null);

  /* ── O total CONHECIDO de Posts, que é o que a aba mostra ───────────────
     A aba conta quantos Posts EXISTEM, não quantos sobraram do filtro — por
     isso a leitura só o anuncia quando não há busca em curso. Mas excluir sob
     um filtro ativo reduz o total de verdade, e não anunciar nada deixava a
     aba contando um Post que já não existe até a próxima leitura completa.
     Decrementar o total conhecido é diferente de anunciar o recorte: o número
     que sai daqui continua sendo "quantos existem". */
  const totalConhecido = useRef(null);

  const abrirAcao = useCallback((post, operacao) => {
    if (trinco.current !== null) return false;
    trinco.current = { id: post.id, operacao };
    setEmCurso(trinco.current);
    return true;
  }, []);

  const fecharAcao = useCallback(() => {
    trinco.current = null;
    setEmCurso(null);
  }, []);

  /* ── Tirar uma linha da lista, e acertar a contagem ─────────────────────
     A atualização é FUNCIONAL, e isso não é estilo: uma releitura concluída
     durante a ação em voo — busca com atraso, troca de filtro, "tentar de
     novo" — já substituiu `posts`, e escrever por cima do fechamento antigo
     ressuscitaria linhas que a releitura tinha trocado. */
  const removerDaLista = useCallback((id) => {
    setPosts((atuais) => atuais.filter((p) => p.id !== id));
    if (typeof totalConhecido.current === "number") {
      totalConhecido.current = Math.max(0, totalConhecido.current - 1);
      contar.current?.(totalConhecido.current);
    }
  }, []);

  /* ── Devolver o foco depois de a linha sair ─────────────────────────────
     A linha, o alvo que abriu a ação e o diálogo desmontam juntos, e o foco
     cai no `body`: quem navega por teclado perde o lugar e recomeça do topo
     da página. O destino é o primeiro alvo da lista que sobrou — e, se não
     sobrou nenhuma, a própria região da lista, que existe em todas as telas. */
  const raizDaLista = useRef(null);
  const devolverFoco = useCallback(() => {
    /* Num quadro à frente: o elemento de destino só existe depois de o React
       ter aplicado a remoção. */
    const agendar =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 0);
    agendar(() => {
      const raiz = raizDaLista.current;
      if (!raiz) return;
      const primeiro = raiz.querySelector('[data-acao="editar"]');
      (primeiro ?? raiz).focus?.();
    });
  }, []);

  /**
   * Liga ou desliga o Destaque, pela função de servidor.
   *
   * O efeito é imediato e **honesto**: a estrela muda antes da resposta, e se o
   * servidor recusar ela volta ao que era, com a notificação dizendo o que
   * houve e o que fazer. Efeito imediato que não reverte é efeito imediato que
   * mente — o Autor sai da tela achando que destacou.
   *
   * O que fica no fim é o valor GRAVADO, lido da linha que voltou. Confirmar o
   * próprio pedido seria a tela conferindo a si mesma.
   */
  const alternarDestaque = useCallback(
    async (post) => {
      if (!abrirAcao(post, OPERACAO_DESTACAR)) return;

      const desejado = !estaDestacado(post);
      const marcar = (valor) =>
        setPosts((atuais) =>
          atuais.map((p) => (p.id === post.id ? { ...p, destaque: valor } : p)),
        );

      marcar(desejado);
      const resultado = await definirDestaque(post.id, desejado);
      fecharAcao();

      if (!resultado.ok) {
        /* POST QUE JÁ NÃO EXISTE: a lista se acerta aqui também, e não só na
           exclusão. A matriz não distingue operação — insistir numa linha que
           o banco não tem é a tela mostrando o que não está lá, venha a
           ausência de onde vier. */
        if (resultado.erro.tipo === ERRO_NAO_ENCONTRADO) {
          removerDaLista(post.id);
        } else {
          marcar(!desejado);
        }
        notificarErro(falhaDeDestaque(post, desejado), resultado.erro.mensagem);
        return;
      }
      const gravado = resultado.dados?.destaque === true;
      marcar(gravado);
      notificarSucesso(confirmacaoDeDestaque(post, gravado));
    },
    [abrirAcao, fecharAcao, removerDaLista],
  );

  /**
   * Exclui o Post — depois da confirmação que o nomeou.
   *
   * Post que já não existe **também some da lista**: é o caminho normal de duas
   * abas do Painel abertas, e deixar a linha lá seria a tela insistindo num
   * Post que o banco já não tem. A mensagem diz o que houve; a lista se acerta
   * de qualquer jeito.
   */
  const excluir = useCallback(
    async (post) => {
      if (!abrirAcao(post, OPERACAO_EXCLUIR)) return;

      const resultado = await excluirPost(post.id);
      fecharAcao();
      setParaExcluir(null);

      const sumiu = resultado.ok || resultado.erro.tipo === ERRO_NAO_ENCONTRADO;
      if (sumiu) {
        removerDaLista(post.id);
        devolverFoco();
      }

      if (!resultado.ok) {
        notificarErro(falhaDaExclusao(post), resultado.erro.mensagem);
        return;
      }
      notificarSucesso(confirmacaoDaExclusao(post));
      /* E O RESÍDUO, quando existe. O Post saiu — a confirmação acima é
         verdade —, e o arquivo da capa não. Sem esta fala, "nunca silencioso"
         valia para o log do servidor e para o JSON, e não para quem clicou. */
      const sobrou = falaDoResiduo(resultado.dados?.residuo);
      if (sobrou) notificarErro(sobrou.oQueHouve, sobrou.oQueFazer);
    },
    [abrirAcao, fecharAcao, removerDaLista, devolverFoco],
  );

  /**
   * O caso em que ver não tem para onde levar.
   *
   * Depois da Story 2.13 sobrou um só, e ele não é sobre Estado: Post sem
   * identificador utilizável — dado corrompido, na prática. A ação **existe** e
   * diz o motivo, em vez de sumir: controle que desaparece deixa a pessoa
   * procurando o que fez de errado, e um link que abre uma página quebrada é
   * pior que um botão que explica.
   */
  const explicarIndisponivel = useCallback((post) => {
    const motivo = motivoDeNaoVer(post);
    if (motivo === null) return;
    notificarErro(motivo.oQueHouve, motivo.oQueFazer);
  }, []);

  /* A pergunta é sobre o que foi PEDIDO, e sobre o pedido que produziu ESTAS
     linhas — não sobre o que está no campo neste instante. Usar o termo ainda
     não aplicado piscaria a tela errada no meio da digitação. */
  const buscando = haBuscaAtiva({
    termo: termoAplicado,
    estados: estadosAplicados,
  });

  /* ── Carregando ────────────────────────────────────────────────────────
     O esqueleto é decorativo para quem ouve a tela: quatro vultos anunciados um
     a um não informam nada. Quem informa é o `status`, que fala uma vez. */
  if (carregando) {
    return (
      <div data-estado-da-lista="carregando" className="flex flex-col gap-3">
        <p role="status" className="sr-only">
          Carregando os posts.
        </p>
        {Array.from({ length: LINHAS_DO_ESQUELETO }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="flex items-center gap-4 rounded-cartao border border-border-soft bg-surface p-4"
          >
            <Skeleton className="size-16 shrink-0 rounded-cartao" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-6 w-24 shrink-0 rounded-pilula" />
          </div>
        ))}
      </div>
    );
  }

  /* ── Falha de leitura ─────────────────────────────────────────────────── */
  if (erro) {
    return (
      <div
        data-estado-da-lista="erro"
        role="alert"
        className="mx-auto max-w-xl rounded-cartao border border-destructive-ink/70 bg-destructive-ink/10 p-6 text-center"
      >
        <AlertCircle aria-hidden="true" className="mx-auto size-8 text-destructive-ink" />
        <h3 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_ERRO}</h3>
        {/* A frase do erro TIPADO: ela já diz o que fazer, e é diferente para
            sessão expirada, rede fora e ambiente ausente. Trocá-la por uma
            genérica seria apagar a única informação útil da tela. */}
        <p className="mt-2 text-sm text-ink-secondary">{erro.mensagem}</p>
        <Button
          type="button"
          variant="outline"
          onClick={tentarDeNovo}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
        >
          {ROTULO_DE_RECARREGAR}
        </Button>
      </div>
    );
  }

  /* ── Vazio de BUSCA ───────────────────────────────────────────────────
     Vem ANTES do vazio inicial de propósito: as duas telas mostram uma lista
     sem linhas, e só o que foi pedido as distingue. Quem procurou algo precisa
     ler que não houve correspondência — e não o convite de escrever o primeiro
     post, que diria que o arquivo inteiro sumiu. */
  if (posts.length === 0 && buscando) {
    return (
      <div
        data-estado-da-lista="vazio-de-busca"
        className="mx-auto max-w-xl rounded-cartao border border-border-soft bg-surface p-8 text-center"
      >
        <SearchX aria-hidden="true" className="mx-auto size-10 text-ink-muted" />
        <h3 className="mt-3 text-base font-semibold text-ink">
          {TITULO_DO_VAZIO_DE_BUSCA}
        </h3>
        <p className="mt-2 text-sm text-ink-secondary">
          {descricaoDoVazioDeBusca({
            termo: termoAplicado,
            estados: estadosAplicados,
          })}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => aoLimparBusca?.()}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
        >
          {ROTULO_DE_LIMPAR_BUSCA}
        </Button>
      </div>
    );
  }

  /* ── Vazio inicial ────────────────────────────────────────────────────── */
  if (posts.length === 0) {
    return (
      <div
        data-estado-da-lista="vazio"
        className="mx-auto max-w-xl rounded-cartao border border-border-soft bg-surface p-8 text-center"
      >
        <FileText aria-hidden="true" className="mx-auto size-10 text-ink-muted" />
        <h3 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_VAZIO}</h3>
        <p className="mt-2 text-sm text-ink-secondary">{DESCRICAO_DO_VAZIO}</p>
        <Button
          type="button"
          onClick={() => aoCriarPost?.()}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
        >
          {ROTULO_DO_PRIMEIRO_POST}
        </Button>
      </div>
    );
  }

  /* ── A lista ──────────────────────────────────────────────────────────── */
  const postEmCurso =
    emCurso === null ? null : (posts.find((p) => p.id === emCurso.id) ?? null);

  return (
    <>
      {/* `tabIndex` de -1: a lista não entra na ordem de tabulação, mas pode
          RECEBER foco por código — é o destino de emergência quando a última
          linha sai e não há mais alvo nenhum para onde mandar o foco. */}
      <ul
        ref={raizDaLista}
        tabIndex={-1}
        data-estado-da-lista="lista"
        className="flex flex-col gap-3 outline-hidden"
      >
        {posts.map((post) => (
          <Linha
            key={post.id}
            post={post}
            emCurso={emCurso?.id === post.id ? emCurso.operacao : null}
            /* O TRINCO É GLOBAL, então o impedimento também é: enquanto há
               pedido em voo, os alvos que escrevem desabilitam em TODAS as
               linhas. Clique que não acontece precisa PARECER que não vai
               acontecer — silêncio é a forma pior do mesmo impedimento. */
            ocupado={emCurso !== null}
            aoAbrir={() => aoAbrirPost?.(post)}
            aoAlternarDestaque={() => alternarDestaque(post)}
            aoExplicarIndisponivel={() => explicarIndisponivel(post)}
            aoPedirExclusao={() => setParaExcluir(post)}
          />
        ))}
      </ul>

      {/* O QUE ESTÁ ACONTECENDO, PARA QUEM OUVE A TELA.
          O alvo desabilitado já diz "espere" a quem vê o giro; quem navega por
          leitor de tela ouviria apenas um botão que parou de responder. A
          região viva fala uma vez, e nomeia o Post. */}
      <p role="status" aria-live="polite" className="sr-only" data-papel="acao-em-curso">
        {postEmCurso === null ? "" : textoDaAcaoEmCurso(postEmCurso, emCurso.operacao)}
      </p>

      {/* A CONFIRMAÇÃO É O COMPONENTE DO SISTEMA, e ela NOMEIA o Post.
          `DialogoDeConfirmacao` é o `alert-dialog` do shadcn com as três
          decisões que já foram tomadas uma vez: foco inicial no Cancelar,
          `.painel` no conteúdo em portal, e rótulo que diz o que o botão faz.
          Um diálogo próprio aqui reabriria as três. */}
      <DialogoDeConfirmacao
        aberto={paraExcluir !== null}
        aoMudarAbertura={(aberto) => {
          /* Cancelar não exclui nada — e nem fecha por baixo de uma exclusão em
             curso, que deixaria a pessoa sem saber se aconteceu. */
          if (!aberto && trinco.current === null) setParaExcluir(null);
        }}
        titulo={paraExcluir === null ? "" : tituloDaExclusao(paraExcluir)}
        descricao={paraExcluir === null ? "" : descricaoDaExclusao(paraExcluir)}
        rotuloDeConfirmacao={ROTULO_DE_CONFIRMAR_EXCLUSAO}
        /* O QUE ESTÁ ACONTECENDO, DITO DE DENTRO DO MODAL. A região viva da
           listagem fica fora do `aria-modal`, e quem confirmou está dentro:
           é justamente quem ela existiria para servir que não a ouviria. */
        ocupado={
          paraExcluir !== null && emCurso?.id === paraExcluir.id
            ? textoDaAcaoEmCurso(paraExcluir, emCurso.operacao)
            : ""
        }
        aoConfirmar={() => {
          if (paraExcluir !== null) excluir(paraExcluir);
        }}
      />
    </>
  );
}

/**
 * Uma linha da listagem.
 *
 * **Um controle por ação, e nenhum a mais.** Até a Story 2.11 o título era um
 * botão com um vão posicionado que esticava a área clicável sobre o cartão
 * inteiro. Com quatro alvos de ação na mesma linha esse vão passou a ser um
 * problema em vez de uma conveniência: ele cobre tudo o que não é alvo, então
 * um toque que erra o botão de excluir por três pixels abre o Editor, e quem
 * ouve a tela passaria a encontrar dois controles que fazem exatamente a mesma
 * coisa — o cartão inteiro e o alvo de editar. O título voltou a ser título, e
 * quem abre o Post é o primeiro dos quatro alvos.
 *
 * **Comentário aqui é código para o Tailwind.** Ele varre o fonte como TEXTO e
 * não distingue prosa de classe: a primeira versão deste comentário citava o
 * nome de uma variante de pseudo-elemento, e só por isso a utilitária
 * correspondente foi gerada — com ela, uma declaração nova na camada base sobre
 * `*`, que vale para o site público inteiro. A verificação de fundação acusou.
 * Nome de classe não se cita em prosa; descreve-se.
 */
function Linha({
  post,
  emCurso = null,
  ocupado = false,
  aoAbrir,
  aoAlternarDestaque,
  aoExplicarIndisponivel,
  aoPedirExclusao,
}) {
  const categoria = nomeDaCategoria(post);
  const monograma = monogramaDaCategoria(post);
  const capa = typeof post.imagem_url === "string" ? post.imagem_url.trim() : "";
  const data = textoDaData(post);
  const agendamento = textoDoAgendamento(post);
  const tempo = textoDoTempoDeLeitura(post);
  const autor = String(post.autor_nome ?? "").trim();

  /* As perguntas das Stories 2.12 e 2.13, respondidas pelo módulo puro. Nenhuma
     delas é a política de visibilidade do banco reescrita aqui — ver
     `acoes.js`. `destino` é a MESMA decisão que o Editor toma: site quando o
     Post está no ar, pré-visualização quando não está. */
  const destino = destinoDeVer(post);
  const destacado = estaDestacado(post);
  const destacando = emCurso === OPERACAO_DESTACAR;
  const excluindo = emCurso === OPERACAO_EXCLUIR;

  return (
    <li
      data-post={post.id}
      className={cn(
        /* `flex-wrap` é a regra de tela estreita, e ela não é responsiva
           separada: com quatro alvos de 40px o bloco de ações não cabe ao lado
           do texto num telefone, e envolver é melhor que espremer o alvo. */
        "flex flex-wrap items-center gap-4 rounded-cartao",
        "border border-border-soft bg-surface p-4",
        "transition-colors hover:border-border-strong",
      )}
    >
      {/* ── Capa ou monograma ───────────────────────────────────────────── */}
      <div className="size-16 shrink-0 overflow-hidden rounded-cartao">
        {capa !== "" ? (
          <img
            src={capa}
            alt={post.imagem_alt ?? ""}
            data-papel="capa"
            className="size-full object-cover"
          />
        ) : (
          <div
            data-papel="monograma"
            data-monograma={monograma}
            aria-hidden="true"
            className={cn(
              "flex size-full items-center justify-center",
              "bg-brand-wash text-xl font-black text-brand-action",
            )}
          >
            {/* Post sem Categoria RENDERIZA: Categoria é opcional na gaveta, e
                uma linha que some por falta dela seria um Post invisível no
                próprio Painel. */}
            {monograma === "" ? <FileText className="size-6" /> : monograma}
          </div>
        )}
      </div>

      {/* ── O que a linha diz ───────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            data-papel="titulo"
            className="min-w-0 max-w-full truncate text-sm font-bold text-ink"
          >
            {post.titulo}
          </h3>
          {post.destaque ? (
            /* Destaque não é só o desenho da estrela: a palavra vai junto, pela
               mesma razão que o Estado traz a palavra ao lado do ponto — quem
               não reconhece o ícone, ou não o enxerga, lê a marcação assim
               mesmo. */
            <span
              data-destaque="true"
              className={cn(
                "inline-flex items-center gap-1 rounded-pilula",
                "bg-brand-wash px-2 py-0.5 text-xs font-semibold text-brand-action",
              )}
            >
              <Star aria-hidden="true" className="size-3" />
              Destaque
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {categoria !== "" ? (
            <span
              data-papel="categoria"
              className="rounded-pilula bg-surface-sunk px-2 py-0.5 font-medium text-ink-secondary"
            >
              {categoria}
            </span>
          ) : null}
          {autor !== "" ? <span data-papel="autor">{autor}</span> : null}
          {/* Data e tempo de leitura são DADO: alinham em coluna entre as linhas
              da listagem, com pilha monoespaçada e numeral tabular. */}
          {data !== "" ? (
            <span className="dado" data-papel="data">{data}</span>
          ) : null}
          {tempo !== null ? (
            <span className="dado" data-papel="tempo-de-leitura">{tempo}</span>
          ) : null}
        </div>
      </div>

      {/* ── Estado ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <PilulaDeEstado estado={post.estado} />
        {agendamento !== null ? (
          /* O "para quando" do agendado, junto do rótulo. Saber que está
             agendado sem saber para quando não ajuda ninguém a decidir onde
             continuar. */
          <span className="dado text-xs text-ink-muted" data-papel="agendado-para">{agendamento}</span>
        ) : null}
      </div>

      {/* ── As ações, sempre à vista ────────────────────────────────────── */}
      <div data-papel="acoes" className="flex shrink-0 items-center gap-1.5">
        {/* EDITAR — o controle que abre o Post, agora como alvo de 40×40.
            `data-abrir` continua sendo o nome dele: é o mesmo controle da
            Story 2.10, com o mesmo rótulo, num alvo maior. */}
        <button
          type="button"
          data-acao="editar"
          data-abrir={post.id}
          aria-label={rotuloParaAbrir(post)}
          onClick={() => aoAbrir?.()}
          className={CLASSE_DO_ALVO_DE_ACAO}
        >
          <SquarePen aria-hidden="true" className="size-4" />
        </button>

        {/* VER — link de verdade nos DOIS destinos: o endereço público quando o
            Post está no ar, e a pré-visualização sob o Painel quando não. O
            desenho muda com o destino (o quadrado com seta é "sai do Painel"; o
            olho é "confere aqui dentro"), e quem ouve a tela recebe a diferença
            pelo rótulo.

            É `a` e não `button` porque abrir em aba nova é o que um endereço
            faz: o menu do meio, o toque longo e o "abrir em nova janela"
            continuam funcionando. E é ABA NOVA também na prévia — a busca, os
            filtros e a aba ativa são estado local desta página, e navegar na
            mesma aba os perderia. */}
        {destino !== null ? (
          <a
            data-acao="ver"
            data-destino-de-ver={destino.tipo}
            href={destino.endereco}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={rotuloDeVer(post)}
            className={CLASSE_DO_ALVO_DE_ACAO}
          >
            {destino.tipo === DESTINO_SITE ? (
              <ExternalLink aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </a>
        ) : (
          <button
            type="button"
            data-acao="ver"
            data-indisponivel="true"
            /* `aria-disabled` e não `disabled`: o alvo continua alcançável pelo
               teclado e continua podendo dizer o motivo. Um controle desligado
               de verdade some da navegação e explica coisa nenhuma. */
            aria-disabled="true"
            aria-label={rotuloDeVer(post)}
            onClick={() => aoExplicarIndisponivel?.()}
            className={CLASSE_DO_ALVO_DE_ACAO}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
          </button>
        )}

        {/* DESTAQUE — alterna direto, sem passar pelo Editor. O controle
            declara o que É (`aria-pressed`) e o rótulo diz o que FARÁ. */}
        <button
          type="button"
          data-acao="destacar"
          data-destaque-atual={destacado ? "true" : "false"}
          aria-pressed={destacado}
          aria-label={rotuloDeDestaque(post)}
          aria-busy={destacando ? "true" : undefined}
          disabled={ocupado}
          onClick={() => aoAlternarDestaque?.()}
          className={cn(
            CLASSE_DO_ALVO_DE_ACAO,
            destacado && "border-brand-action bg-brand-wash text-brand-action",
          )}
        >
          {destacando ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Star
              aria-hidden="true"
              className={cn("size-4", destacado && "fill-current")}
            />
          )}
        </button>

        {/* EXCLUIR — abre a confirmação, e só ela exclui. */}
        <button
          type="button"
          data-acao="excluir"
          aria-label={rotuloDeExcluir(post)}
          aria-busy={excluindo ? "true" : undefined}
          disabled={ocupado}
          onClick={() => aoPedirExclusao?.()}
          className={cn(
            CLASSE_DO_ALVO_DE_ACAO,
            "hover:border-destructive-ink/50 hover:bg-destructive-ink/10 hover:text-destructive-ink",
          )}
        >
          {excluindo ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
    </li>
  );
}
