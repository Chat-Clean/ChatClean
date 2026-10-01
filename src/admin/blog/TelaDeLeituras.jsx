/**
 * A tela de Leituras do Painel: a evolução das leituras, dia a dia.
 *
 * ─── O QUE ELA RESPONDE ─────────────────────────────────────────────────────
 *
 * A listagem de Posts diz QUANTO cada Post foi lido. Esta tela diz QUANDO: se o
 * blog está sendo mais ou menos lido, em que dia houve um pico, e quais Posts
 * puxaram o período.
 *
 * ─── OS FILTROS RECORTAM TUDO O QUE ESTÁ EMBAIXO DELES ──────────────────────
 *
 * O período vale para os três números, para o gráfico e para a tabela de Posts:
 * as três coisas saem do mesmo recorte, então os números concordam entre si. O
 * Post escolhido estreita os números e o gráfico; a tabela continua listando
 * todos, porque é nela que se escolhe o Post, e uma lista de um item só não
 * deixa trocar.
 *
 * ─── AS SOMAS ACONTECEM NO BANCO ────────────────────────────────────────────
 *
 * Esta tela não soma linha nenhuma de leitura: pede ao banco o total de cada
 * dia e o total de cada Post no período. Somar aqui funcionaria com poucos
 * Posts e passaria a mentir quando a resposta fosse cortada.
 *
 * ─── RECARREGAR NÃO PISCA ───────────────────────────────────────────────────
 *
 * Só a PRIMEIRA leitura mostra esqueleto. Trocar de período ou de Post mantém o
 * que já está na tela, esmaecido, até a resposta chegar: um esqueleto a cada
 * clique faria a tela inteira pular. E cada pedido leva um número, para a
 * resposta que chega atrasada não sobrescrever a mais nova.
 *
 * ─── SÓ LEITURA ─────────────────────────────────────────────────────────────
 *
 * Nada aqui escreve. Quem conta a leitura é a página pública do artigo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, BarChart3, ChevronLeft, X } from "lucide-react";

import GraficoDeLeituras from "@/admin/blog/GraficoDeLeituras";
import PilulaDeEstado from "@/admin/blog/PilulaDeEstado";
import {
  DESCRICAO_DA_TELA,
  DESCRICAO_DO_VAZIO,
  PERIODO_PADRAO,
  PERIODOS,
  ROTULO_DA_TABELA_DE_DIAS,
  ROTULO_DE_RECARREGAR,
  ROTULO_DE_TODOS_OS_POSTS,
  ROTULO_DE_VOLTAR,
  TITULO_DA_TELA,
  TITULO_DO_ERRO,
  TITULO_DO_GRAFICO,
  TITULO_DO_RANKING,
  TITULO_DO_VAZIO,
  diaCompleto,
  resumoDaSerie,
  textoDaMedia,
  textoDeLeituras,
  textoDoPeriodo,
} from "@/admin/blog/leituras";
import { BASE_DO_PAINEL } from "@/admin/blog/rotas";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { lerLeiturasPorDia, listarPostsMaisLidos } from "@/data/blog/leituras";
import { ehEstado } from "@/domain/blog/estados";
import { formatarNumero } from "@/domain/blog/formato";
import { pageTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

const SITUACAO_CARREGANDO = "carregando";
const SITUACAO_ERRO = "erro";
const SITUACAO_PRONTA = "pronta";

export default function TelaDeLeituras() {
  const [dias, setDias] = useState(PERIODO_PADRAO);
  /* O Post escolhido guarda o TÍTULO junto do identificador: trocar de período
     pode tirá-lo da tabela, e o filtro precisa continuar dizendo qual é. */
  const [post, setPost] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [relendo, setRelendo] = useState(false);

  const ultimoPedido = useRef(0);
  const postId = post?.id ?? null;

  useEffect(() => {
    ultimoPedido.current += 1;
    const pedido = ultimoPedido.current;
    setRelendo(true);

    (async () => {
      let respostas;
      try {
        respostas = await Promise.all([
          lerLeiturasPorDia({ dias, postId }),
          listarPostsMaisLidos({ dias }),
        ]);
      } catch {
        respostas = [{ ok: false, erro: null }, { ok: false, erro: null }];
      }
      if (ultimoPedido.current !== pedido) return;

      const [porDia, porPost] = respostas;
      const falhou = [porDia, porPost].find((r) => r?.ok !== true);
      if (falhou) {
        /* ERRO NÃO É VAZIO. O que estava na tela sai junto: números velhos
           embaixo de uma mensagem de falha dizem que ainda valem. */
        setDados(null);
        setErro(falhou?.erro ?? { mensagem: "" });
      } else {
        setDados({ serie: porDia.dados, ranking: porPost.dados, dias });
        setErro(null);
      }
      setRelendo(false);
    })();

    return () => {
      ultimoPedido.current += 1;
    };
  }, [dias, postId, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  const situacao =
    erro !== null ? SITUACAO_ERRO : dados === null ? SITUACAO_CARREGANDO : SITUACAO_PRONTA;

  return (
    <motion.div
      initial={pageTransition.initial}
      animate={pageTransition.animate}
      className="painel min-h-screen bg-background"
      data-tela="leituras"
    >
      <header className="border-b border-border-soft bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-4">
          <Link
            to={BASE_DO_PAINEL}
            data-acao="voltar"
            className={cn(
              ANEL_DE_FOCO,
              ALVO_DE_TOQUE,
              "inline-flex items-center gap-1.5 rounded-controle px-2 py-1",
              "text-sm font-medium text-ink-secondary hover:text-ink",
            )}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {ROTULO_DE_VOLTAR}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8" data-situacao={situacao}>
        <h1 className="text-2xl font-black text-ink">{TITULO_DA_TELA}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-secondary">{DESCRICAO_DA_TELA}</p>

        {/* ── Os filtros: uma linha só, acima de tudo o que eles recortam ── */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Período" className="flex flex-wrap items-center gap-1.5">
            {PERIODOS.map((periodo) => {
              const marcado = periodo.dias === dias;
              return (
                <button
                  key={periodo.dias}
                  type="button"
                  data-periodo={periodo.dias}
                  aria-pressed={marcado}
                  onClick={() => setDias(periodo.dias)}
                  className={cn(
                    ANEL_DE_FOCO,
                    ALVO_DE_TOQUE,
                    "rounded-pilula border px-3 py-1.5 text-xs font-bold transition-colors",
                    marcado
                      ? "border-brand-action bg-brand-wash text-brand-action"
                      : "border-border-soft bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
                  )}
                >
                  {periodo.rotulo}
                </button>
              );
            })}
          </div>

          {/* O Post em recorte. Aparece só quando há um: sem ele, a tela já é
              a de todos os Posts, e não há o que desfazer. */}
          {post !== null ? (
            <button
              type="button"
              data-acao="todos-os-posts"
              onClick={() => setPost(null)}
              aria-label={`Mostrando só o post ${post.titulo}. Voltar para todos os posts.`}
              className={cn(
                ANEL_DE_FOCO,
                ALVO_DE_TOQUE,
                "inline-flex max-w-full items-center gap-1.5 rounded-pilula border border-border-strong",
                "bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunk",
              )}
            >
              <span className="truncate">{post.titulo}</span>
              <X aria-hidden="true" className="size-3.5 shrink-0" />
            </button>
          ) : null}
        </div>

        <p role="status" aria-live="polite" className="sr-only" data-papel="anuncio">
          {situacao === SITUACAO_CARREGANDO
            ? "Carregando as leituras."
            : relendo
              ? "Atualizando as leituras."
              : ""}
        </p>

        <div className="mt-6">
          {situacao === SITUACAO_CARREGANDO ? (
            <div aria-hidden="true" data-papel="esqueleto" className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-cartao" />
                ))}
              </div>
              <Skeleton className="h-80 rounded-cartao" />
            </div>
          ) : situacao === SITUACAO_ERRO ? (
            <div
              role="alert"
              className="mx-auto max-w-xl rounded-cartao border border-destructive-ink/70 bg-destructive-ink/10 p-6 text-center"
            >
              <AlertCircle aria-hidden="true" className="mx-auto size-8 text-destructive-ink" />
              <h2 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_ERRO}</h2>
              {/* A frase do erro TIPADO: ela já diz o que fazer, e é diferente
                  para sessão expirada, rede fora e ambiente ausente. */}
              <p className="mt-2 text-sm text-ink-secondary">{erro?.mensagem}</p>
              <Button
                type="button"
                variant="outline"
                data-acao="repetir"
                onClick={tentarDeNovo}
                className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
              >
                {ROTULO_DE_RECARREGAR}
              </Button>
            </div>
          ) : (
            <Conteudo
              dados={dados}
              relendo={relendo}
              postEscolhido={post}
              aoEscolherPost={setPost}
            />
          )}
        </div>
      </main>
    </motion.div>
  );
}

/** Os três números, o gráfico e a tabela, todos sobre o mesmo recorte. */
function Conteudo({ dados, relendo, postEscolhido, aoEscolherPost }) {
  const { serie, ranking, dias } = dados;
  const resumo = resumoDaSerie(serie);
  const periodo = textoDoPeriodo(dias);

  return (
    <div
      data-papel="conteudo"
      aria-busy={relendo}
      className={cn("flex flex-col gap-4 transition-opacity", relendo && "opacity-60")}
    >
      {/* ── Os três números do período ─────────────────────────────────── */}
      <dl className="grid gap-4 sm:grid-cols-3">
        <Numero rotulo={`Leituras ${periodo}`} papel="total" valor={formatarNumero(resumo.total)} />
        <Numero
          rotulo="Média por dia"
          papel="media"
          valor={textoDaMedia(resumo.mediaPorDia)}
        />
        <Numero
          rotulo="Melhor dia"
          papel="melhor-dia"
          valor={resumo.melhorDia === null ? "Nenhum" : diaCompleto(resumo.melhorDia.dia)}
          detalhe={resumo.melhorDia === null ? null : textoDeLeituras(resumo.melhorDia.total)}
        />
      </dl>

      {/* ── O gráfico ──────────────────────────────────────────────────── */}
      <section className="rounded-cartao border border-border-soft bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">{TITULO_DO_GRAFICO}</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          {postEscolhido === null ? ROTULO_DE_TODOS_OS_POSTS : postEscolhido.titulo}
        </p>

        {resumo.total === 0 ? (
          /* VAZIO NÃO É ERRO, e não é um gráfico de linha no chão: a frase diz
             o que a linha deitada deixaria a pessoa adivinhar. */
          <div className="py-12 text-center" data-papel="vazio">
            <BarChart3 aria-hidden="true" className="mx-auto size-10 text-ink-muted" />
            <h3 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_VAZIO}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-secondary">{DESCRICAO_DO_VAZIO}</p>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <GraficoDeLeituras serie={serie} />
            </div>
            {/* OS MESMOS NÚMEROS, EM TABELA. O gráfico mostra a forma; quem
                precisa do valor exato de um dia, ou não enxerga o gráfico, lê
                aqui. Do dia mais recente para o mais antigo, que é a ordem em
                que alguém procura. */}
            <details className="mt-4 text-sm" data-papel="tabela-de-dias">
              <summary
                className={cn(
                  ANEL_DE_FOCO,
                  "cursor-pointer rounded-controle font-medium text-ink-secondary hover:text-ink",
                )}
              >
                {ROTULO_DA_TABELA_DE_DIAS}
              </summary>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-controle border border-border-soft">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-surface-sunk text-xs text-ink-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Dia</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Leituras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...serie].reverse().map((ponto) => (
                      <tr key={ponto.dia} className="border-t border-border-soft">
                        <td className="dado px-3 py-1.5 text-ink-secondary">{diaCompleto(ponto.dia)}</td>
                        <td className="dado px-3 py-1.5 text-right text-ink">
                          {formatarNumero(ponto.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      {/* ── Os Posts mais lidos, que também é onde se escolhe um Post ──── */}
      {ranking.length > 0 ? (
        <section className="rounded-cartao border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-bold text-ink">{TITULO_DO_RANKING}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {`Leituras ${periodo}. Escolha um post para ver só a evolução dele.`}
          </p>
          <ol className="mt-4 flex flex-col" data-papel="ranking">
            {ranking.map((linha, i) => {
              const escolhido = postEscolhido?.id === linha.post_id;
              return (
                <li
                  key={linha.post_id}
                  data-post={linha.post_id}
                  className="flex items-center gap-3 border-t border-border-soft py-2 first:border-t-0"
                >
                  <span className="dado w-6 shrink-0 text-right text-xs text-ink-muted">{i + 1}</span>
                  <button
                    type="button"
                    data-acao="escolher-post"
                    aria-pressed={escolhido}
                    onClick={() =>
                      aoEscolherPost(escolhido ? null : { id: linha.post_id, titulo: linha.titulo })
                    }
                    className={cn(
                      ANEL_DE_FOCO,
                      ALVO_DE_TOQUE,
                      "min-w-0 flex-1 truncate rounded-controle px-2 py-1 text-left text-sm",
                      escolhido
                        ? "bg-brand-wash font-bold text-brand-action"
                        : "font-medium text-ink hover:bg-surface-sunk",
                    )}
                  >
                    {linha.titulo}
                  </button>
                  {ehEstado(linha.estado) ? <PilulaDeEstado estado={linha.estado} /> : null}
                  <span className="dado shrink-0 text-sm text-ink" data-papel="leituras-do-post">
                    {formatarNumero(linha.total)}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Um número do período: o rótulo em cima, o valor grande embaixo.
 *
 * O valor usa a fonte da interface, com algarismos de largura natural: em
 * tamanho grande, o algarismo de largura fixa deixa o número frouxo.
 */
function Numero({ rotulo, valor, detalhe = null, papel }) {
  return (
    <div className="rounded-cartao border border-border-soft bg-surface p-5" data-papel={papel}>
      <dt className="text-xs font-medium text-ink-muted">{rotulo}</dt>
      <dd className="mt-1 text-2xl font-black text-ink">{valor}</dd>
      {detalhe !== null ? <dd className="mt-0.5 text-xs text-ink-secondary">{detalhe}</dd> : null}
    </div>
  );
}
