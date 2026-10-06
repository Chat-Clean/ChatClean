/**
 * A tela de Buscas no Google do Painel.
 *
 * ─── O QUE ELA RESPONDE ─────────────────────────────────────────────────────
 *
 * Como o site aparece no Google: quantas vezes foi exibido, quantos cliques
 * recebeu, em que posição, por quais buscas, e quais páginas puxam o resultado.
 * Para os Posts, o clique do Google aparece ao lado da leitura contada pelo
 * site: dois números do mesmo artigo, medidos por duas fontes.
 *
 * ─── DOIS NÍVEIS: O SITE, E UMA PÁGINA ──────────────────────────────────────
 *
 * Sem página escolhida, os números, o gráfico e os termos são do site inteiro.
 * Escolher uma página na tabela estreita os três para ela. A tabela de páginas
 * continua listando todas, porque é nela que se escolhe, e uma lista de um item
 * só não deixa trocar.
 *
 * ─── OS NÚMEROS VÊM DO BANCO, E NÃO DO GOOGLE ───────────────────────────────
 *
 * Uma sincronização diária copia o Search Console para o banco. Esta tela não
 * fala com o Google, não conhece a chave dele, e não soma linha nenhuma: pede
 * ao banco os totais já prontos.
 *
 * ─── O GOOGLE ENTREGA COM ATRASO, E A TELA DIZ ATÉ ONDE VAI ─────────────────
 *
 * Os dois ou três dias mais recentes ainda não existem no Search Console. O
 * gráfico é cortado no último dia com dado, e uma frase diz qual é ele: sem
 * isso, a linha despencaria no fim e pareceria que o site sumiu do Google.
 *
 * ─── RECARREGAR NÃO PISCA ───────────────────────────────────────────────────
 *
 * Só a PRIMEIRA leitura mostra esqueleto. Trocar de período, de página ou de
 * medida mantém o que já está na tela, esmaecido, até a resposta chegar. E cada
 * pedido leva um número, para a resposta atrasada não sobrescrever a mais nova.
 *
 * ─── SÓ LEITURA ─────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, ChevronLeft, Search, X } from "lucide-react";

import GraficoDeLeituras from "@/admin/blog/GraficoDeLeituras";
import {
  DESCRICAO_DA_TELA,
  DESCRICAO_SEM_DADOS,
  DESCRICAO_SEM_TERMOS,
  MEDIDA_PADRAO,
  MEDIDAS,
  ROTULO_DA_TABELA_DE_DIAS,
  ROTULO_DE_RECARREGAR,
  ROTULO_DE_VOLTAR,
  ROTULO_DO_SITE_INTEIRO,
  TITULO_DA_TELA,
  TITULO_DAS_PAGINAS,
  TITULO_DO_ERRO,
  TITULO_DOS_TERMOS,
  TITULO_SEM_DADOS,
  TITULO_SEM_TERMOS,
  ateOUltimoDia,
  nomeDaPagina,
  resumoDasBuscas,
  rotularMedida,
  serieDaMedida,
  textoDaPosicao,
  textoDaTaxa,
} from "@/admin/blog/buscas";
import {
  PERIODO_PADRAO,
  PERIODOS,
  diaCompleto,
  textoDoPeriodo,
} from "@/admin/blog/leituras";
import { BASE_DO_PAINEL } from "@/admin/blog/rotas";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  lerBuscasPorDia,
  lerUltimoDiaDeBuscas,
  listarPaginasBuscadas,
  listarTermosBuscados,
} from "@/data/blog/buscas";
import { formatarNumero } from "@/domain/blog/formato";
import { pageTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

const SITUACAO_CARREGANDO = "carregando";
const SITUACAO_ERRO = "erro";
const SITUACAO_SEM_DADOS = "sem-dados";
const SITUACAO_PRONTA = "pronta";

/** A aparência de um botão de escolha (período e medida), marcado ou não. */
const classeDaEscolha = (marcado) =>
  cn(
    ANEL_DE_FOCO,
    ALVO_DE_TOQUE,
    "rounded-pilula border px-3 py-1.5 text-xs font-bold transition-colors",
    marcado
      ? "border-brand-action bg-brand-wash text-brand-action"
      : "border-border-soft bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
  );

export default function TelaDeBuscas() {
  const [dias, setDias] = useState(PERIODO_PADRAO);
  /* A página escolhida guarda o NOME junto do caminho: trocar de período pode
     tirá-la da tabela, e o filtro precisa continuar dizendo qual é. */
  const [pagina, setPagina] = useState(null);
  const [medida, setMedida] = useState(MEDIDA_PADRAO);
  const [tentativa, setTentativa] = useState(0);

  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [relendo, setRelendo] = useState(false);

  const ultimoPedido = useRef(0);
  const caminho = pagina?.caminho ?? null;

  useEffect(() => {
    ultimoPedido.current += 1;
    const pedido = ultimoPedido.current;
    setRelendo(true);

    (async () => {
      let respostas;
      try {
        respostas = await Promise.all([
          lerBuscasPorDia({ dias, pagina: caminho }),
          listarPaginasBuscadas({ dias }),
          listarTermosBuscados({ dias, pagina: caminho }),
          lerUltimoDiaDeBuscas(),
        ]);
      } catch {
        respostas = [{ ok: false, erro: null }];
      }
      if (ultimoPedido.current !== pedido) return;

      const falhou = respostas.find((r) => r?.ok !== true);
      if (falhou) {
        /* ERRO NÃO É VAZIO. O que estava na tela sai junto: números velhos
           embaixo de uma mensagem de falha dizem que ainda valem. */
        setDados(null);
        setErro(falhou?.erro ?? { mensagem: "" });
      } else {
        const [porDia, paginas, termos, ultimoDia] = respostas;
        setDados({
          serie: porDia.dados,
          paginas: paginas.dados,
          termos: termos.dados,
          ultimoDia: ultimoDia.dados,
          dias,
        });
        setErro(null);
      }
      setRelendo(false);
    })();

    return () => {
      ultimoPedido.current += 1;
    };
  }, [dias, caminho, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  const situacao =
    erro !== null
      ? SITUACAO_ERRO
      : dados === null
        ? SITUACAO_CARREGANDO
        : dados.ultimoDia === null
          ? SITUACAO_SEM_DADOS
          : SITUACAO_PRONTA;

  return (
    <motion.div
      initial={pageTransition.initial}
      animate={pageTransition.animate}
      className="painel min-h-screen bg-background"
      data-tela="buscas"
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
            {PERIODOS.map((periodo) => (
              <button
                key={periodo.dias}
                type="button"
                data-periodo={periodo.dias}
                aria-pressed={periodo.dias === dias}
                onClick={() => setDias(periodo.dias)}
                className={classeDaEscolha(periodo.dias === dias)}
              >
                {periodo.rotulo}
              </button>
            ))}
          </div>

          {/* A página em recorte. Aparece só quando há uma: sem ela, a tela já
              é a do site inteiro, e não há o que desfazer. */}
          {pagina !== null ? (
            <button
              type="button"
              data-acao="site-inteiro"
              onClick={() => setPagina(null)}
              aria-label={`Mostrando só a página ${pagina.nome}. Voltar para o site inteiro.`}
              className={cn(
                ANEL_DE_FOCO,
                ALVO_DE_TOQUE,
                "inline-flex max-w-full items-center gap-1.5 rounded-pilula border border-border-strong",
                "bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunk",
              )}
            >
              <span className="truncate">{pagina.nome}</span>
              <X aria-hidden="true" className="size-3.5 shrink-0" />
            </button>
          ) : null}
        </div>

        <p role="status" aria-live="polite" className="sr-only" data-papel="anuncio">
          {situacao === SITUACAO_CARREGANDO
            ? "Carregando as buscas."
            : relendo
              ? "Atualizando as buscas."
              : ""}
        </p>

        <div className="mt-6">
          {situacao === SITUACAO_CARREGANDO ? (
            <div aria-hidden="true" data-papel="esqueleto" className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
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
          ) : situacao === SITUACAO_SEM_DADOS ? (
            /* SEM DADOS NÃO É ERRO, e não é "zero cliques": a sincronização
               ainda não gravou nada, e a frase diz isso. */
            <div
              data-papel="sem-dados"
              className="mx-auto max-w-xl rounded-cartao border border-border-soft bg-surface p-8 text-center"
            >
              <Search aria-hidden="true" className="mx-auto size-10 text-ink-muted" />
              <h2 className="mt-3 text-base font-semibold text-ink">{TITULO_SEM_DADOS}</h2>
              <p className="mt-2 text-sm text-ink-secondary">{DESCRICAO_SEM_DADOS}</p>
            </div>
          ) : (
            <Conteudo
              dados={dados}
              relendo={relendo}
              medida={medida}
              aoEscolherMedida={setMedida}
              paginaEscolhida={pagina}
              aoEscolherPagina={setPagina}
            />
          )}
        </div>
      </main>
    </motion.div>
  );
}

/** Os quatro números, o gráfico e as duas tabelas, sobre o mesmo recorte. */
function Conteudo({ dados, relendo, medida, aoEscolherMedida, paginaEscolhida, aoEscolherPagina }) {
  const { paginas, termos, ultimoDia, dias } = dados;
  /* A série vai só até o último dia que o Google já entregou. */
  const serie = ateOUltimoDia(dados.serie, ultimoDia);
  const resumo = resumoDasBuscas(serie);
  const periodo = textoDoPeriodo(dias);
  const recorte = paginaEscolhida === null ? ROTULO_DO_SITE_INTEIRO : paginaEscolhida.nome;

  return (
    <div
      data-papel="conteudo"
      aria-busy={relendo}
      className={cn("flex flex-col gap-4 transition-opacity", relendo && "opacity-60")}
    >
      {/* Até onde os números vão, dito antes deles. */}
      <p className="text-xs text-ink-muted" data-papel="atualizado-ate">
        {`Dados até ${diaCompleto(ultimoDia)}. O Google entrega os números com dois a três dias de atraso.`}
      </p>

      {/* ── Os quatro números do período ───────────────────────────────── */}
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Numero rotulo={`Cliques ${periodo}`} papel="cliques" valor={formatarNumero(resumo.cliques)} />
        <Numero rotulo="Impressões" papel="impressoes" valor={formatarNumero(resumo.impressoes)} />
        <Numero
          rotulo="Taxa de cliques"
          papel="taxa"
          valor={textoDaTaxa(resumo.cliques, resumo.impressoes) ?? "Sem dado"}
        />
        <Numero
          rotulo="Posição média"
          papel="posicao"
          valor={textoDaPosicao(resumo.posicao) ?? "Sem dado"}
        />
      </dl>

      {/* ── O gráfico, uma medida por vez ──────────────────────────────── */}
      <section className="rounded-cartao border border-border-soft bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink">
              {`${MEDIDAS.find((m) => m.id === medida)?.rotulo ?? ""} por dia`}
            </h2>
            <p className="mt-0.5 truncate text-xs text-ink-muted">{recorte}</p>
          </div>
          <div role="group" aria-label="Medida do gráfico" className="flex items-center gap-1.5">
            {MEDIDAS.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                data-medida={opcao.id}
                aria-pressed={opcao.id === medida}
                onClick={() => aoEscolherMedida(opcao.id)}
                className={classeDaEscolha(opcao.id === medida)}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <GraficoDeLeituras
            serie={serieDaMedida(serie, medida)}
            rotular={rotularMedida(medida)}
            nome={MEDIDAS.find((m) => m.id === medida)?.rotulo ?? "Cliques"}
          />
        </div>

        {/* OS MESMOS NÚMEROS, EM TABELA, com as quatro medidas de cada dia: o
            gráfico mostra a forma de uma, e aqui estão todas. */}
        <details className="mt-4 text-sm" data-papel="tabela-de-dias">
          <summary
            className={cn(
              ANEL_DE_FOCO,
              "cursor-pointer rounded-controle font-medium text-ink-secondary hover:text-ink",
            )}
          >
            {ROTULO_DA_TABELA_DE_DIAS}
          </summary>
          <div className="mt-3 max-h-72 overflow-auto rounded-controle border border-border-soft">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-surface-sunk text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Dia</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Cliques</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Impressões</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Posição</th>
                </tr>
              </thead>
              <tbody>
                {[...serie].reverse().map((ponto) => (
                  <tr key={ponto.dia} className="border-t border-border-soft">
                    <td className="dado px-3 py-1.5 text-ink-secondary">{diaCompleto(ponto.dia)}</td>
                    <td className="dado px-3 py-1.5 text-right text-ink">{formatarNumero(ponto.cliques)}</td>
                    <td className="dado px-3 py-1.5 text-right text-ink">{formatarNumero(ponto.impressoes)}</td>
                    <td className="dado px-3 py-1.5 text-right text-ink-secondary">
                      {textoDaPosicao(ponto.posicao) ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      {/* Cada cartão pode encolher até a largura da coluna: sem isso, um
          título longo, que é cortado com reticências, alargaria a página. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── As páginas, que também é onde se escolhe uma ─────────────── */}
        <section className="min-w-0 rounded-cartao border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-bold text-ink">{TITULO_DAS_PAGINAS}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {`Cliques ${periodo}. Escolha uma página para ver só os números dela.`}
          </p>
          {paginas.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-secondary" data-papel="sem-paginas">
              Nenhuma página apareceu no Google neste período.
            </p>
          ) : null}
          <ol className="mt-4 flex flex-col" data-papel="paginas">
            {paginas.map((linha) => {
              const escolhida = paginaEscolhida?.caminho === linha.pagina;
              const nome = nomeDaPagina(linha);
              return (
                <li
                  key={linha.pagina}
                  data-pagina={linha.pagina}
                  className="border-t border-border-soft py-2 first:border-t-0"
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      data-acao="escolher-pagina"
                      aria-pressed={escolhida}
                      onClick={() =>
                        aoEscolherPagina(escolhida ? null : { caminho: linha.pagina, nome })
                      }
                      className={cn(
                        ANEL_DE_FOCO,
                        ALVO_DE_TOQUE,
                        "min-w-0 flex-1 truncate rounded-controle px-2 py-1 text-left text-sm",
                        escolhida
                          ? "bg-brand-wash font-bold text-brand-action"
                          : "font-medium text-ink hover:bg-surface-sunk",
                      )}
                    >
                      {nome}
                    </button>
                    <span className="dado shrink-0 text-sm text-ink" data-papel="cliques-da-pagina">
                      {formatarNumero(linha.cliques)}
                    </span>
                  </div>
                  {/* O que acompanha o clique: quantas vezes apareceu, onde, e,
                      quando a página é um Post, quantas vezes foi lida. */}
                  <p className="dado mt-0.5 px-2 text-xs text-ink-muted" data-papel="detalhe-da-pagina">
                    {[
                      `${formatarNumero(linha.impressoes)} impressões`,
                      textoDaPosicao(linha.posicao) === null ? null : `posição ${textoDaPosicao(linha.posicao)}`,
                      linha.leituras === null
                        ? null
                        : `${formatarNumero(linha.leituras)} ${linha.leituras === 1 ? "leitura" : "leituras"}`,
                    ]
                      .filter((parte) => parte !== null)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── Os termos de busca do recorte ────────────────────────────── */}
        <section className="min-w-0 rounded-cartao border border-border-soft bg-surface p-5">
          <h2 className="text-sm font-bold text-ink">{TITULO_DOS_TERMOS}</h2>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{recorte}</p>
          {termos.length === 0 ? (
            <div className="py-8 text-center" data-papel="sem-termos">
              <h3 className="text-sm font-semibold text-ink">{TITULO_SEM_TERMOS}</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-ink-secondary">{DESCRICAO_SEM_TERMOS}</p>
            </div>
          ) : (
            <ol className="mt-4 flex flex-col" data-papel="termos">
              {termos.map((linha) => (
                <li key={linha.termo} className="border-t border-border-soft py-2 first:border-t-0">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate px-2 text-sm font-medium text-ink">
                      {linha.termo}
                    </span>
                    <span className="dado shrink-0 text-sm text-ink">{formatarNumero(linha.cliques)}</span>
                  </div>
                  <p className="dado mt-0.5 px-2 text-xs text-ink-muted">
                    {[
                      `${formatarNumero(linha.impressoes)} impressões`,
                      textoDaPosicao(linha.posicao) === null ? null : `posição ${textoDaPosicao(linha.posicao)}`,
                    ]
                      .filter((parte) => parte !== null)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Um número do período: o rótulo em cima, o valor grande embaixo.
 *
 * O valor usa a fonte da interface, com algarismos de largura natural: em
 * tamanho grande, o algarismo de largura fixa deixa o número frouxo.
 */
function Numero({ rotulo, valor, papel }) {
  return (
    <div className="rounded-cartao border border-border-soft bg-surface p-5" data-papel={papel}>
      <dt className="text-xs font-medium text-ink-muted">{rotulo}</dt>
      <dd className="mt-1 text-2xl font-black text-ink">{valor}</dd>
    </div>
  );
}
