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
 * ─── O QUE ESTA TELA NÃO FAZ ────────────────────────────────────────────────
 *
 * Não filtra em memória o que veio do recorte. Não oferece ações por linha além
 * de abrir o Post (Story 2.12). E não escreve nada: nenhum cliente escreve no
 * banco.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileText, SearchX, Star } from "lucide-react";

import PilulaDeEstado from "@/admin/blog/PilulaDeEstado";
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
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { listarPostsDoPainel, ordenarListagem } from "@/data/blog/posts";
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
        contar.current?.(ordenados.length);
      }
    })();

    return () => {
      ultimoPedido.current += 1;
    };
  }, [recarregarEm, tentativa, termoAplicado, estadosAplicados]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

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
        className="mx-auto max-w-xl rounded-cartao border border-destructive/40 bg-destructive/10 p-6 text-center"
      >
        <AlertCircle aria-hidden="true" className="mx-auto size-8 text-destructive" />
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
  return (
    <ul data-estado-da-lista="lista" className="flex flex-col gap-3">
      {posts.map((post) => (
        <Linha key={post.id} post={post} aoAbrir={() => aoAbrirPost?.(post)} />
      ))}
    </ul>
  );
}

/**
 * Uma linha da listagem.
 *
 * **Um único controle por linha, e ele cobre o cartão inteiro.** O título é o
 * botão, e um vão posicionado dentro dele estica a área clicável sobre todo o
 * cartão sem inventar um segundo alvo para a mesma ação — dois controles que
 * fazem a mesma coisa são dois anúncios para quem navega por leitor de tela. As
 * ações por linha (ver, arquivar, excluir) são da Story 2.12.
 *
 * **Comentário aqui é código para o Tailwind.** Ele varre o fonte como TEXTO e
 * não distingue prosa de classe: a primeira versão deste comentário citava o
 * nome de uma variante de pseudo-elemento, e só por isso a utilitária
 * correspondente foi gerada — com ela, uma declaração nova na camada base sobre
 * `*`, que vale para o site público inteiro. A verificação de fundação acusou.
 * Nome de classe não se cita em prosa; descreve-se.
 */
function Linha({ post, aoAbrir }) {
  const categoria = nomeDaCategoria(post);
  const monograma = monogramaDaCategoria(post);
  const capa = typeof post.imagem_url === "string" ? post.imagem_url.trim() : "";
  const data = textoDaData(post);
  const agendamento = textoDoAgendamento(post);
  const tempo = textoDoTempoDeLeitura(post);
  const autor = String(post.autor_nome ?? "").trim();

  return (
    <li
      data-post={post.id}
      className={cn(
        "relative flex items-center gap-4 rounded-cartao",
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
          <h3 className="min-w-0 text-sm font-bold text-ink">
            <button
              type="button"
              data-abrir={post.id}
              aria-label={rotuloParaAbrir(post)}
              onClick={() => aoAbrir?.()}
              className={cn(
                ANEL_DE_FOCO,
                "block max-w-full truncate rounded-controle text-left",
              )}
            >
              {/* A área clicável cobre o CARTÃO INTEIRO, e continua sendo um só
                  controle: o vão é filho do botão, então o toque em qualquer
                  ponto da linha aciona este botão. Dois controles para a mesma
                  ação seriam dois anúncios para quem navega por leitor de tela.

                  É um `span` posicionado, e não um `::after`: o pseudo-elemento
                  obrigaria o Tailwind a registrar `--tw-content` na camada base,
                  sobre `*` — a regra que vale para o site público inteiro, e que
                  a verificação de fundação compara com o baseline. Um efeito
                  colateral global por causa de um vão de clique numa linha do
                  Painel é preço alto demais por um pseudo-elemento. */}
              <span aria-hidden="true" className="absolute inset-0 rounded-cartao" />
              {post.titulo}
            </button>
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
    </li>
  );
}
