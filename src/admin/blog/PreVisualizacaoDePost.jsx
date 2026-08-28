/**
 * A pré-visualização de um Post — a tela que responde "o que vai sair?" antes
 * de publicar (Story 2.13).
 *
 * ─── ELA NASCE DENTRO DO PORTÃO, E NÃO AO LADO DELE ─────────────────────────
 *
 * A rota é filha de `/admin`, e o portão está no ELEMENTO DO PAI. Não há um
 * segundo portão aqui, e não há decisão de acesso neste arquivo: se este
 * componente está renderizando, a sessão já foi verificada — exatamente como
 * acontece com o Painel. Envolver cada rota filha seria lembrar de envolver
 * cada rota filha, e o dia em que alguém esquecesse seria o dia em que um Post
 * não publicado ficaria legível por endereço.
 *
 * ─── O QUE SE VÊ É O QUE SAIRÁ ──────────────────────────────────────────────
 *
 * O HTML mostrado é o `conteudo_html` **gravado**, e não um derivado na hora.
 * As duas coisas são iguais no dia em que o Post foi salvo — foram gravadas na
 * mesma transação. Deixam de ser iguais no dia em que o renderizador muda: aí
 * rederivar mostraria o que o código de HOJE faria, enquanto o que está no ar
 * continua sendo o gravado. A promessa desta tela é "o que se vê é o que
 * sairá", então a fonte é o que sairá.
 *
 * E ele é injetado dentro de `.artigo` — a classe global da Story 2.3, a mesma
 * que o Editor veste e que o site público vestirá —, **sobre o fundo do site**.
 * A promessa não vale só para o texto: o par texto/fundo é o que decide
 * contraste, e a raiz desta tela é do Painel, onde `--background` resolve outro
 * valor. Por isso o artigo é pintado com um token que `.painel` não remapeia.
 *
 * ─── POR IDENTIFICADOR, NUNCA POR ENDEREÇO ──────────────────────────────────
 *
 * Rascunho pode não ter endereço nenhum, e é justamente o rascunho que mais
 * precisa ser conferido. O identificador existe desde que a linha nasce.
 *
 * Identificador fora do formato **não vira pedido à rede**: ele não poderia
 * existir, e mandá-lo ao servidor só trocaria uma ausência imediata por uma
 * ausência mais lenta. A conferência usa a MESMA regra da camada de dados,
 * importada de `rotas.js`, e não uma cópia.
 *
 * ─── CINCO SITUAÇÕES, E NENHUMA DELAS É TELA EM BRANCO ──────────────────────
 *
 * Carregando, pronta, ausente, sem permissão e falha — esta última partida em
 * duas, porque rede fora pede insistir e ambiente mal configurado pede outra
 * pessoa. As frases moram em `previa.js`, puras, para a verificação executá-las
 * em vez de ler JSX. **Nem a leitura nem o `noindex` podem lançar aqui**: uma
 * exceção dentro do efeito derrubaria para o limite de erro justamente a tela
 * que existe para nunca ficar em branco.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, ChevronLeft, FileQuestion, ShieldAlert } from "lucide-react";

import PilulaDeEstado from "@/admin/blog/PilulaDeEstado";
import {
  ARTIGO_VAZIO,
  AVISO_DA_PREVIA,
  AVISO_DE_PENDENCIA,
  CLASSE_DO_FUNDO_DO_ARTIGO,
  DETALHE_DE_IDENTIFICADOR_INVALIDO,
  ROTULO_DE_REPETIR,
  ROTULO_DE_VOLTAR,
  SITUACAO_AUSENTE,
  SITUACAO_CARREGANDO,
  SITUACAO_FALHA,
  SITUACAO_FALHA_PERMANENTE,
  SITUACAO_PRONTA,
  TEXTO_DE_CARREGANDO,
  TITULO_DA_TELA,
  aplicarNoindex,
  falaDaSituacao,
  nasceCarregando,
  situacaoDaTela,
} from "@/admin/blog/previa";
import {
  BASE_DO_PAINEL,
  PARAMETRO_DA_PREVIA,
  PARAMETRO_DE_PENDENCIA,
  ehIdentificadorDePost,
} from "@/admin/blog/rotas";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { lerPostDoPainelPorId } from "@/data/blog/posts";
import { ERRO_INESPERADO } from "@/data/blog/resultado";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** O ícone de cada situação sem artigo. Mapa fechado, como o de Categoria. */
const ICONE_DA_SITUACAO = {
  [SITUACAO_AUSENTE]: FileQuestion,
  [SITUACAO_FALHA]: AlertCircle,
  [SITUACAO_FALHA_PERMANENTE]: AlertCircle,
};

/** A volta para a listagem. Existe em TODAS as situações, inclusive nas ruins. */
function Voltar() {
  return (
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
  );
}

export default function PreVisualizacaoDePost() {
  const parametros = useParams();
  const [consulta] = useSearchParams();
  const identificador = parametros[PARAMETRO_DA_PREVIA] ?? "";
  const valido = ehIdentificadorDePost(identificador);
  /* Quem abriu com alterações pendentes no Editor diz isso no próprio endereço.
     A prévia lê do BANCO: sem o aviso, o Autor confere um texto que não é o que
     está na tela dele e conclui a coisa errada, nos dois sentidos. */
  const comPendencia = consulta.get(PARAMETRO_DE_PENDENCIA) === "1";

  const [post, setPost] = useState(null);
  const [erro, setErro] = useState(null);
  /* Identificador fora do formato nasce ausente, e não carregando: não há
     pedido nenhum a esperar. Anunciar "abrindo…" para algo que nunca vai abrir
     é a tela mentindo sobre o que está fazendo. */
  const [carregando, setCarregando] = useState(() => nasceCarregando(valido));
  const [tentativa, setTentativa] = useState(0);

  /* ── `noindex`, a SEGUNDA camada ────────────────────────────────────────
     A primeira é o cabeçalho de resposta da entrega, que vale para quem não
     executa JavaScript. Esta aqui existe para as duas dizerem a mesma coisa —
     é o que impede uma mudança de entrega de apagar a garantia em silêncio. */
  useEffect(() => aplicarNoindex(document), []);

  useEffect(() => {
    if (!valido) {
      setPost(null);
      setErro(null);
      setCarregando(false);
      return undefined;
    }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      /* A CAMADA DEVOLVE ERRO TIPADO E NÃO LANÇA — mas confiar nisso aqui é
         apostar a única promessa desta tela numa disciplina de outro módulo.
         Uma rejeição sem tratamento deixaria o esqueleto girando para sempre,
         que é a tela em branco com outro nome. */
      let resultado;
      try {
        resultado = await lerPostDoPainelPorId(identificador);
      } catch (excecao) {
        resultado = {
          ok: false,
          erro: {
            tipo: ERRO_INESPERADO,
            mensagem: String(excecao?.message ?? excecao),
          },
        };
      }
      if (!vivo) return;
      if (!resultado?.ok) {
        setPost(null);
        setErro(resultado?.erro ?? { tipo: ERRO_INESPERADO, mensagem: "" });
        setCarregando(false);
        return;
      }
      setPost(resultado.dados);
      setErro(null);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [identificador, valido, tentativa]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  /* A situação é DERIVADA, e a derivação inteira mora no módulo puro — inclusive
     a ORDEM dos ramos, que é regra e não detalhe de escrita: um identificador
     ruim que chega por navegação encontra `carregando` ainda ligado do endereço
     anterior, e a ordem errada mostraria o esqueleto de uma leitura que nunca
     vai sair. Dentro de um ternário de JSX isso só poderia ser conferido por
     leitura; ali é uma entrada de tabela que a verificação executa. */
  const situacao = situacaoDaTela({ valido, carregando, erro, post });

  const html = typeof post?.conteudo_html === "string" ? post.conteudo_html : "";

  return (
    <div
      className="painel min-h-screen bg-background"
      data-tela="previa"
      data-situacao={situacao}
    >
      <header className="border-b border-border-soft bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-6 py-4">
          <Voltar />
          <div className="flex-1" />
          {post !== null ? <PilulaDeEstado estado={post.estado} /> : null}
        </div>
        {/* O AVISO É PERMANENTE, e não um enfeite: esta página tem a aparência
            do site e NÃO é o site. Sem ele, alguém confere um rascunho, vê a
            página bonita e conclui que já está no ar. */}
        <p
          data-papel="aviso-da-previa"
          className="mx-auto max-w-4xl px-6 pb-3 text-xs font-medium text-ink-muted"
        >
          {AVISO_DA_PREVIA}
        </p>
        {comPendencia ? (
          <p
            role="status"
            data-papel="aviso-de-pendencia"
            className={cn(
              "mx-auto max-w-4xl px-6 pb-3 text-xs font-semibold",
              "text-brand-action",
            )}
          >
            {AVISO_DE_PENDENCIA}
          </p>
        ) : null}
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="sr-only">{TITULO_DA_TELA}</h1>

        {situacao === SITUACAO_CARREGANDO ? (
          <div data-papel="esqueleto">
            <p role="status" className="sr-only">
              {TEXTO_DE_CARREGANDO}
            </p>
            <div aria-hidden="true" className="space-y-4">
              <Skeleton className="h-9 w-3/5" />
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        ) : situacao === SITUACAO_PRONTA ? (
          /* O ARTIGO SOBRE O FUNDO DO SITE. `--background` resolve outro valor
             dentro de `.painel`; o token desta classe não é remapeado, então o
             par texto/fundo é o mesmo que o visitante verá. */
          <article
            className={cn(
              CLASSE_DO_FUNDO_DO_ARTIGO,
              "rounded-cartao border border-border-soft p-6",
            )}
          >
            <h2 data-papel="titulo" className="text-3xl font-black text-ink">
              {post.titulo}
            </h2>
            {String(post.resumo ?? "").trim() !== "" ? (
              <p data-papel="resumo" className="mt-3 text-base text-ink-secondary">
                {post.resumo}
              </p>
            ) : null}
            <div className="mt-6 border-t border-border-soft pt-6">
              {html.trim() === "" ? (
                <p data-papel="artigo-vazio" className="text-sm text-ink-muted">
                  {ARTIGO_VAZIO}
                </p>
              ) : (
                /* O HTML GRAVADO, dentro de `.artigo`. Nenhuma classe utilitária
                   vive no conteúdo: quem envolve é quem estiliza — ver a Story
                   2.3. E nada aqui deriva HTML em tempo de leitura. */
                <div
                  className="artigo"
                  data-papel="artigo"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}
            </div>
          </article>
        ) : (
          <SituacaoRuim
            situacao={situacao}
            detalhe={valido ? (erro?.mensagem ?? "") : DETALHE_DE_IDENTIFICADOR_INVALIDO}
            aoRepetir={tentarDeNovo}
          />
        )}
      </main>
    </div>
  );
}

/**
 * Ausência, falta de permissão e as duas falhas — cada uma dizendo o que houve
 * e o que fazer, e nenhuma delas em branco.
 */
function SituacaoRuim({ situacao, detalhe, aoRepetir }) {
  const fala = falaDaSituacao(situacao);
  const Icone = ICONE_DA_SITUACAO[situacao] ?? ShieldAlert;
  const grave = situacao === SITUACAO_FALHA || situacao === SITUACAO_FALHA_PERMANENTE;
  return (
    <div
      role="alert"
      data-papel="situacao"
      className={cn(
        "mx-auto max-w-xl rounded-cartao border p-6 text-center",
        grave ? "border-destructive-ink/70 bg-destructive-ink/10" : "border-border-soft bg-surface",
      )}
    >
      <Icone
        aria-hidden="true"
        className={cn("mx-auto size-8", grave ? "text-destructive-ink" : "text-ink-muted")}
      />
      <h2 data-papel="o-que-houve" className="mt-3 text-base font-semibold text-ink">
        {fala.oQueHouve}
      </h2>
      {detalhe !== "" ? (
        <p data-papel="detalhe" className="mt-2 text-sm text-ink-secondary">
          {detalhe}
        </p>
      ) : null}
      <p data-papel="o-que-fazer" className="mt-2 text-sm text-ink-secondary">
        {fala.oQueFazer}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {fala.repetir ? (
          <Button
            type="button"
            variant="outline"
            data-acao="repetir"
            onClick={() => aoRepetir?.()}
            className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE)}
          >
            {ROTULO_DE_REPETIR}
          </Button>
        ) : null}
        <Voltar />
      </div>
    </div>
  );
}
