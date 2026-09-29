/**
 * A Página da Vaga, `/carreiras/:slug` (Story 5.7).
 *
 * ─── TRÊS TELAS, E NUNCA DUAS AO MESMO TEMPO ────────────────────────────────
 *
 * A situação vem de `lerSituacaoDaVaga`, que pergunta ao banco: `aberta` (com
 * a Vaga), `encerrada` (só o título) ou `inexistente` (Rascunho e endereço que
 * nunca existiu dão a MESMA resposta, e a tela não tem como distinguir). Mais
 * o carregamento e o erro de leitura, que é distinto de inexistente. Cada
 * tela é um `return` antecipado, com o SEU `<h1>`: nunca dois. Em toda tela o
 * conteúdo fica dentro de `<main>` (a `Moldura`), e o `<h1>` também.
 *
 * Uma falha `nao_encontrado` da camada é "Vaga não encontrada", e não erro:
 * repetir não faz a Vaga aparecer. Uma Aberta sem título é resposta inválida
 * (erro de leitura, com tentar de novo); uma Encerrada sem título mostra o
 * título de reserva do módulo puro, porque a tela continua útil sem ele.
 *
 * ─── A DESCRIÇÃO É O HTML GRAVADO ───────────────────────────────────────────
 *
 * `descricao_html` é derivado no servidor, na mesma escrita, pelo renderizador
 * único. Aqui ele é só injetado dentro de `.artigo`, a mesma classe do Blog:
 * nada deriva HTML em tempo de leitura.
 *
 * ─── CANDIDATAR-SE SÓ COM LINK VÁLIDO ───────────────────────────────────────
 *
 * O botão aparece no topo e depois da Descrição, em nova aba com
 * `noopener noreferrer`, e só quando o link passa pela MESMA regra do Painel
 * e do servidor. Sem link válido, o botão não existe, e a página continua.
 *
 * ─── AS OUTRAS VAGAS ────────────────────────────────────────────────────────
 *
 * Na Vaga Aberta, a lista das outras Vagas Abertas é acessório e falha em
 * silêncio (a seção some), como os relacionados do Blog: quem abriu veio ler
 * a Vaga. Na Encerrada ela é o CONTEÚDO: sem Vaga Aberta, o convite do
 * currículo; com falha, a frase de erro, o tentar de novo DA LISTA e o link
 * para `/carreiras`, sem afirmar que não há vagas. Lida com sucesso para um
 * Slug, ela não é relida por causa de uma nova leitura da situação.
 *
 * ─── A ROLAGEM E O FOCO ─────────────────────────────────────────────────────
 *
 * São de `useChegadaDaPagina`: rola ao topo a cada navegação de ida (PUSH),
 * não força o topo na volta do navegador (POP), e leva o foco ao `<h1>` da
 * tela nova quando ela termina de carregar, sem roubar o foco no carregamento
 * direto.
 *
 * ─── O `<head>` NÃO É DESTA PÁGINA (AD-8) ───────────────────────────────────
 *
 * A página não toca o `<head>`: título, descrição, canônica e dado
 * estruturado são do HTML servido (Story 5.8). Por DECISÃO, o título da aba
 * NÃO muda na navegação do cliente (de `/carreiras` para uma Vaga, ou de uma
 * Vaga para outra): continua o da página em que a pessoa entrou. O
 * carregamento direto de `/carreiras/:slug` terá o título certo pelo HTML
 * servido da Story 5.8.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, ExternalLink, FileQuestion, MapPin } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { StaggerGroup, StaggerItem } from "../components/animated/StaggerGroup";
import { lerSituacaoDaVaga, listarVagasAbertas } from "@/data/carreiras/leitura";
import CartaoDeVaga from "./CartaoDeVaga";
import SemVagasAbertas from "./SemVagasAbertas";
import { useChegadaDaPagina } from "./useChegadaDaPagina";
import {
  CONVITE_DA_CANDIDATURA,
  ENDERECO_DAS_VAGAS,
  LISTA_ERRO,
  ROTULO_DA_CANDIDATURA,
  ROTULO_DE_RECARREGAR_A_LISTA,
  ROTULO_DE_RECARREGAR_A_VAGA,
  ROTULO_DE_VER_AS_VAGAS,
  TEXTO_DE_CARREGANDO_A_VAGA,
  TITULO_DAS_OUTRAS_VAGAS,
  TITULO_DAS_VAGAS_ABERTAS,
  VAGA_ABERTA,
  VAGA_CARREGANDO,
  VAGA_ENCERRADA,
  VAGA_ERRO,
  classificacoesDaVaga,
  descricaoGravada,
  falaDaLista,
  falaDaVaga,
  falhaDeExcecao,
  linkDeCandidaturaSeguro,
  localDaVaga,
  outrasVagas,
  rotuloDaCandidatura,
  situacaoDaVagaPublica,
  textoDaAbertura,
  tituloDaVagaPublica,
} from "./carreirasPublico";

/** As outras Vagas: ainda lendo, lidas, ou a leitura falhou. */
const OUTRAS_LENDO = "lendo";
const OUTRAS_LIDAS = "lidas";
const OUTRAS_FALHA = "falha";

/** O recuo das telas sem hero, abaixo da Navbar fixa: o MESMO em todas. */
const CORPO_SEM_HERO = "flex items-center justify-center min-h-screen px-4 pt-24";

/** O `<h1>` recebe foco por programa (depois de navegar), sem contorno de teclado. */
const FOCO_DO_TITULO = "outline-none";

export default function VagaPublica() {
  const { slug } = useParams();
  const alvo = typeof slug === "string" ? slug.trim() : "";

  const [tentativa, setTentativa] = useState(0);
  /* A resposta guarda PARA QUAL endereço e tentativa ela veio: enquanto não
     houver resposta do pedido de agora, a tela está carregando. Assim, ao
     trocar de Vaga, o quadro seguinte já é o esqueleto, e nunca a Vaga
     anterior com o endereço novo. */
  const [lida, setLida] = useState(null);
  const [tentativaDasOutras, setTentativaDasOutras] = useState(0);
  const [lidasAsOutras, setLidasAsOutras] = useState(null);

  /* A SITUAÇÃO. A camada devolve `inexistente` sem ir à rede para Slug torto,
     então todo endereço passa por ela. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      let resultado;
      try {
        resultado = await lerSituacaoDaVaga(alvo);
      } catch (excecao) {
        resultado = { ok: false, erro: falhaDeExcecao(excecao) };
      }
      if (!vivo) return;
      setLida(
        resultado?.ok === true
          ? { alvo, tentativa, vaga: resultado.dados ?? null, erro: null }
          : { alvo, tentativa, vaga: null, erro: resultado?.erro ?? falhaDeExcecao(null) },
      );
    })();
    return () => {
      vivo = false;
    };
  }, [alvo, tentativa]);

  const atual = lida !== null && lida.alvo === alvo && lida.tentativa === tentativa ? lida : null;
  const vaga = atual?.vaga ?? null;
  const situacao = situacaoDaVagaPublica({
    carregando: atual === null,
    erro: atual?.erro ?? null,
    vaga,
  });
  const precisaDasOutras = situacao === VAGA_ABERTA || situacao === VAGA_ENCERRADA;
  /* Lidas com sucesso para ESTE Slug: uma nova leitura da situação (tentar de
     novo) não as relê. */
  const outrasJaLidas =
    lidasAsOutras !== null && lidasAsOutras.alvo === alvo && lidasAsOutras.estado === OUTRAS_LIDAS;

  const refDaTela = useChegadaDaPagina(situacao !== VAGA_CARREGANDO);

  /* AS OUTRAS VAGAS. Leitura separada: a falha dela NÃO derruba a Vaga. */
  useEffect(() => {
    if (!precisaDasOutras || outrasJaLidas) return undefined;
    let vivo = true;
    (async () => {
      let resultado;
      try {
        resultado = await listarVagasAbertas();
      } catch (excecao) {
        resultado = { ok: false, erro: falhaDeExcecao(excecao) };
      }
      if (!vivo) return;
      setLidasAsOutras(
        resultado?.ok === true && Array.isArray(resultado.dados)
          ? { alvo, tentativa: tentativaDasOutras, estado: OUTRAS_LIDAS, vagas: outrasVagas(resultado.dados, alvo) }
          : { alvo, tentativa: tentativaDasOutras, estado: OUTRAS_FALHA, vagas: [] },
      );
    })();
    return () => {
      vivo = false;
    };
  }, [precisaDasOutras, outrasJaLidas, alvo, tentativaDasOutras]);

  const outras =
    outrasJaLidas ||
    (lidasAsOutras !== null && lidasAsOutras.alvo === alvo && lidasAsOutras.tentativa === tentativaDasOutras)
      ? lidasAsOutras
      : { estado: OUTRAS_LENDO, vagas: [] };

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);
  const tentarAsOutrasDeNovo = useCallback(() => setTentativaDasOutras((n) => n + 1), []);

  if (situacao === VAGA_CARREGANDO) {
    return (
      <Moldura situacao={situacao} refDaTela={refDaTela}>
        <div data-corpo={situacao} className={CORPO_SEM_HERO}>
          <div data-papel="esqueleto" className="w-full max-w-3xl">
            <p role="status" className="sr-only">
              {TEXTO_DE_CARREGANDO_A_VAGA}
            </p>
            <div aria-hidden="true" className="space-y-4">
              <div className="flex gap-2">
                <div className="h-6 w-24 rounded-full bg-zinc-100 animate-pulse" />
                <div className="h-6 w-16 rounded-full bg-zinc-100 animate-pulse" />
              </div>
              <div className="h-10 w-3/5 rounded-lg bg-zinc-100 animate-pulse" />
              <div className="h-4 w-2/5 rounded bg-zinc-100 animate-pulse" />
              <div className="h-4 w-full rounded bg-zinc-100 animate-pulse" />
              <div className="h-4 w-4/5 rounded bg-zinc-100 animate-pulse" />
            </div>
          </div>
        </div>
      </Moldura>
    );
  }

  if (situacao === VAGA_ENCERRADA) {
    const fala = falaDaVaga(VAGA_ENCERRADA);
    return (
      <Moldura situacao={situacao} refDaTela={refDaTela}>
        <section data-corpo={situacao} className="relative pt-40 pb-16 md:pb-20 bg-creme overflow-hidden">
          <div className="absolute inset-0 bg-grid pointer-events-none" />
          <div className="relative max-w-3xl mx-auto px-4 text-center">
            <span
              data-papel="aviso"
              className="inline-block px-3 py-1.5 rounded-full bg-white border border-zinc-200 text-zinc-600 text-xs font-bold uppercase tracking-widest mb-6 shadow-sm"
            >
              {fala.oQueHouve}
            </span>
            <h1
              tabIndex={-1}
              data-papel="titulo"
              className={`text-4xl md:text-6xl font-black text-zinc-900 tracking-tighter leading-[1.05] mb-6 break-words ${FOCO_DO_TITULO}`}
            >
              {tituloDaVagaPublica(vaga)}
            </h1>
            <p data-papel="o-que-fazer" className="text-lg text-zinc-600 max-w-xl mx-auto">
              {fala.oQueFazer}
            </p>
          </div>
        </section>
        <section
          aria-labelledby="titulo-das-vagas-abertas"
          className="py-16 md:py-24 bg-creme-profundo relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-grid pointer-events-none" />
          <div className="relative max-w-4xl mx-auto px-4">
            <h2
              id="titulo-das-vagas-abertas"
              className="text-3xl md:text-4xl font-black text-zinc-900 tracking-tighter mb-10 text-center"
            >
              {TITULO_DAS_VAGAS_ABERTAS}
            </h2>
            <ListaDasOutras outras={outras} naFalha="repetir" noVazio="curriculo" aoRepetir={tentarAsOutrasDeNovo} />
          </div>
        </section>
      </Moldura>
    );
  }

  if (situacao !== VAGA_ABERTA) {
    return (
      <Moldura situacao={situacao} refDaTela={refDaTela}>
        <div data-corpo={situacao} className={CORPO_SEM_HERO}>
          <SituacaoRuim situacao={situacao} aoRepetir={tentarDeNovo} />
        </div>
      </Moldura>
    );
  }

  const classificacoes = classificacoesDaVaga(vaga);
  const local = localDaVaga(vaga);
  const abertura = textoDaAbertura(vaga);
  const link = linkDeCandidaturaSeguro(vaga?.link_de_candidatura);
  const html = descricaoGravada(vaga);
  const resumo = typeof vaga?.resumo === "string" ? vaga.resumo.trim() : "";

  return (
    <Moldura situacao={situacao} refDaTela={refDaTela}>
      {/* Hero aurora: a Vaga em uma olhada, e a primeira candidatura. */}
      <section
        data-corpo={situacao}
        className="relative aurora-bg aurora-beams pt-36 md:pt-40 pb-16 md:pb-20 overflow-hidden"
      >
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto px-4">
          <Link
            to={ENDERECO_DAS_VAGAS}
            data-acao="voltar"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-white/80 hover:text-white transition-colors mb-8 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {ROTULO_DE_VER_AS_VAGAS}
          </Link>

          {classificacoes.length > 0 && (
            <ul data-papel="classificacoes" aria-label="Classificações da vaga" className="flex flex-wrap gap-2 mb-6">
              {classificacoes.map((item) => (
                <li
                  key={item.chave}
                  data-classificacao={item.chave}
                  className={
                    item.fundo === null
                      ? "text-xs font-bold px-3 py-1 rounded-full bg-white/15 border border-white/40 text-white"
                      : "text-xs font-bold px-3 py-1 rounded-full"
                  }
                  style={item.fundo === null ? undefined : { backgroundColor: item.fundo, color: item.tinta }}
                >
                  {item.nome}
                </li>
              ))}
            </ul>
          )}

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            tabIndex={-1}
            data-papel="titulo"
            className={`text-4xl md:text-6xl font-black text-white tracking-tighter leading-[1.05] mb-6 break-words ${FOCO_DO_TITULO}`}
          >
            {tituloDaVagaPublica(vaga)}
          </motion.h1>

          {(local !== "" || abertura !== "") && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85 mb-8">
              {local !== "" && (
                <span data-papel="local" className="flex items-center gap-1.5">
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                  {local}
                </span>
              )}
              {abertura !== "" && (
                <span data-papel="abertura" className="flex items-center gap-1.5">
                  <CalendarDays aria-hidden="true" className="h-4 w-4" />
                  {abertura}
                </span>
              )}
            </div>
          )}

          {link !== null && <BotaoDeCandidatura vaga={vaga} link={link} onde="topo" claro />}
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 py-14 md:py-20">
        {resumo !== "" && (
          <p
            data-papel="resumo"
            className="text-lg md:text-xl text-zinc-800 font-medium leading-relaxed border-l-4 border-emerald-500 pl-5 mb-12"
          >
            {resumo}
          </p>
        )}

        {/* A DESCRIÇÃO: o `descricao_html` GRAVADO, dentro de `.artigo`. */}
        {html.trim() !== "" && (
          <div className="artigo" data-papel="descricao" dangerouslySetInnerHTML={{ __html: html }} />
        )}

        {link !== null && (
          <div
            data-papel="candidatura-final"
            className="mt-14 bg-white rounded-3xl border border-zinc-100 p-6 md:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
          >
            <p className="text-zinc-600 text-sm leading-relaxed max-w-sm">{CONVITE_DA_CANDIDATURA}</p>
            <BotaoDeCandidatura vaga={vaga} link={link} onde="fim" />
          </div>
        )}
      </div>

      {outras.estado === OUTRAS_LIDAS && outras.vagas.length > 0 && (
        <section
          data-papel="outras-vagas"
          aria-labelledby="titulo-das-outras-vagas"
          className="py-16 md:py-24 bg-creme-profundo relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-grid pointer-events-none" />
          <div className="relative max-w-4xl mx-auto px-4">
            <h2
              id="titulo-das-outras-vagas"
              className="text-3xl md:text-4xl font-black text-zinc-900 tracking-tighter mb-10"
            >
              {TITULO_DAS_OUTRAS_VAGAS}
            </h2>
            <ListaDasOutras outras={outras} naFalha="nada" noVazio="nada" />
          </div>
        </section>
      )}
    </Moldura>
  );
}

/**
 * A casca comum das telas: navegação, a situação marcada, o `<main>` com o
 * conteúdo (e o `<h1>`) e o rodapé. A ref é a da chegada: é nela que o foco
 * procura o `<h1>`.
 */
function Moldura({ situacao, refDaTela, children }) {
  return (
    <div
      ref={refDaTela}
      className="min-h-screen bg-creme text-zinc-900 selection:bg-emerald-500 selection:text-white"
      data-tela="vaga-publica"
      data-situacao={situacao}
    >
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  );
}

/**
 * O Candidatar-se: link externo, em nova aba, sem entregar a janela nem o
 * endereço de origem ao site de fora. Só é montado com link já aprovado.
 */
function BotaoDeCandidatura({ vaga, link, onde, claro = false }) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      data-acao="candidatar"
      data-onde={onde}
      aria-label={rotuloDaCandidatura(vaga)}
      className={
        claro
          ? "inline-flex items-center gap-2 px-8 py-4 bg-white text-emerald-700 font-bold rounded-full shadow-[0_0_40px_rgba(255,255,255,0.25)] hover:scale-[1.03] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-700"
          : "inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full shadow-lg shadow-emerald-500/30 hover:scale-[1.02] transition-all duration-200 text-sm shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      }
    >
      {ROTULO_DA_CANDIDATURA}
      <ExternalLink aria-hidden="true" className="h-4 w-4" />
    </a>
  );
}

/**
 * As outras Vagas Abertas, em cartões. `naFalha` e `noVazio` dizem o que a
 * tela quer quando a leitura falhou ou voltou vazia: na Vaga Aberta, nada; na
 * Encerrada, a frase de erro com o tentar de novo DA LISTA e o link para a
 * lista (falha), e o convite do currículo (vazio).
 */
function ListaDasOutras({ outras, naFalha, noVazio, aoRepetir }) {
  if (outras.estado === OUTRAS_LENDO) {
    return <div data-papel="outras-lendo" aria-hidden="true" className="h-40 rounded-3xl bg-white/60 animate-pulse" />;
  }
  if (outras.estado === OUTRAS_FALHA) {
    if (naFalha !== "repetir") return null;
    const fala = falaDaLista(LISTA_ERRO);
    return (
      <div data-papel="outras-falha" className="text-center py-12 px-6 bg-white rounded-3xl border border-zinc-100">
        <p role="alert" className="text-zinc-700 font-bold mb-6">
          {fala.oQueHouve}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-acao="repetir-lista"
            onClick={() => aoRepetir?.()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            {ROTULO_DE_RECARREGAR_A_LISTA}
          </button>
          <Link
            to={ENDERECO_DAS_VAGAS}
            data-acao="ver-as-vagas"
            className="inline-flex items-center gap-2 font-bold text-emerald-700 hover:text-emerald-800 underline underline-offset-4"
          >
            {ROTULO_DE_VER_AS_VAGAS}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }
  if (outras.vagas.length === 0) {
    return noVazio === "curriculo" ? <SemVagasAbertas /> : null;
  }
  return (
    <StaggerGroup className="grid md:grid-cols-2 gap-4" data-papel="lista-de-vagas">
      {outras.vagas.map((item) => (
        <StaggerItem key={item.id ?? item.slug}>
          <CartaoDeVaga vaga={item} />
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
}

/**
 * Inexistente e erro de leitura: o que houve, o que fazer, e o `<h1>` próprio.
 * No erro, o anúncio (`role="alert"`) é só o parágrafo da mensagem, nunca o
 * bloco com o título e os botões.
 */
function SituacaoRuim({ situacao, aoRepetir }) {
  const fala = falaDaVaga(situacao);
  const grave = situacao === VAGA_ERRO;
  const Icone = grave ? AlertCircle : FileQuestion;
  return (
    <div data-papel="situacao" className="text-center max-w-xl">
      <Icone aria-hidden="true" className={`mx-auto h-10 w-10 ${grave ? "text-red-500" : "text-zinc-300"}`} />
      <h1
        tabIndex={-1}
        data-papel="o-que-houve"
        className={`mt-4 text-3xl md:text-4xl font-black text-zinc-900 tracking-tighter mb-4 ${FOCO_DO_TITULO}`}
      >
        {fala.oQueHouve}
      </h1>
      <p role={grave ? "alert" : undefined} data-papel="o-que-fazer" className="text-zinc-500 mb-8">
        {fala.oQueFazer}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {fala.repetir && (
          <button
            type="button"
            data-acao="repetir"
            onClick={() => aoRepetir?.()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full text-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            {ROTULO_DE_RECARREGAR_A_VAGA}
          </button>
        )}
        <Link
          to={ENDERECO_DAS_VAGAS}
          data-acao="voltar"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-zinc-200 bg-white text-zinc-700 hover:border-emerald-300 hover:text-emerald-700 font-bold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {ROTULO_DE_VER_AS_VAGAS}
        </Link>
      </div>
    </div>
  );
}
