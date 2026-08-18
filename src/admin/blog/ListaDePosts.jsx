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
 * ─── QUATRO TELAS, E TRÊS DELAS NÃO TÊM LINHA NENHUMA ───────────────────────
 *
 * Carregando, erro, vazio e lista. As três primeiras são fáceis de colapsar numa
 * só, e colapsá-las é o defeito:
 *
 *   - **carregando** mostra esqueleto, nunca tela em branco — branco é
 *     indistinguível de "não há nada", e a pessoa vai embora achando que perdeu
 *     o trabalho;
 *   - **erro** diz o que houve e o que fazer, com a frase do erro TIPADO que a
 *     camada devolve: sessão expirada pede entrar de novo, rede pede tentar de
 *     novo, e as duas oferecem o botão;
 *   - **vazio** é superfície de primeira classe — a primeira tela que um Autor
 *     novo vê — e leva ao primeiro Post.
 *
 * Erro e vazio mostram, os dois, uma lista sem linhas, e é só isso que têm em
 * comum. Trocar um pelo outro é como um Autor conclui que o que escreveu sumiu.
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
 * Não busca e não filtra (Story 2.11). Não oferece ações por linha além de abrir
 * o Post (Story 2.12). E não escreve nada: nenhum cliente escreve no banco.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, Star } from "lucide-react";

import PilulaDeEstado from "@/admin/blog/PilulaDeEstado";
import {
  DESCRICAO_DO_VAZIO,
  ROTULO_DE_RECARREGAR,
  ROTULO_DO_PRIMEIRO_POST,
  TITULO_DO_ERRO,
  TITULO_DO_VAZIO,
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

export default function ListaDePosts({
  aoAbrirPost,
  aoCriarPost,
  aoContar,
  recarregarEm = 0,
}) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [posts, setPosts] = useState([]);
  /* O contador de tentativas é o que faz o botão de "tentar de novo" REFAZER a
     leitura: sem uma dependência que muda, o efeito não roda outra vez e o botão
     vira enfeite. */
  const [tentativa, setTentativa] = useState(0);

  /* `aoContar` viaja por referência para ficar FORA das dependências do efeito.
     Uma função recriada a cada renderização da página — que é o caso normal —
     faria a listagem recarregar em laço, e o laço só apareceria em produção,
     como uma consulta por segundo. */
  const contar = useRef(aoContar);
  useEffect(() => {
    contar.current = aoContar;
  }, [aoContar]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);

    (async () => {
      const resultado = await listarPostsDoPainel();
      if (!vivo) return;
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
      contar.current?.(ordenados.length);
    })();

    return () => {
      vivo = false;
    };
  }, [recarregarEm, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

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
