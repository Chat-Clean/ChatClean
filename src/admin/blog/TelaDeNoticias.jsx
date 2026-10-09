/**
 * A tela de Notícias do Painel: os vídeos que aparecem no blog.
 *
 * ─── ELA NASCE DENTRO DO PORTÃO, E É ROTA, NÃO ABA ──────────────────────────
 *
 * Filha de `/admin`, irmã das Categorias: não há decisão de acesso aqui, e se
 * este componente está renderizando a sessão já foi verificada.
 *
 * ─── O VÍDEO FICA NO YOUTUBE ────────────────────────────────────────────────
 *
 * A tela não envia arquivo nenhum: o Autor cola o link do vídeo, e a prévia do
 * formulário mostra a miniatura que o YouTube tem para ele. É a confirmação de
 * que o link colado é o vídeo certo, antes de salvar.
 *
 * ─── ELA LÊ PELA CAMADA E ESCREVE PELA PORTA ÚNICA ──────────────────────────
 *
 * A leitura é a do Painel (publicadas ou não); a escrita é a função de servidor
 * que salva Post, com a operação como campo do corpo. Publicar e tirar do ar
 * são a MESMA operação de salvar, com um campo só.
 *
 * ─── CINCO SITUAÇÕES, E NENHUMA DELAS É TELA EM BRANCO ──────────────────────
 *
 * Carregando, erro, vazio, lista e formulário. As frases e a derivação da
 * situação moram em `noticias.js`, puras.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ChevronLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  SquarePen,
  Trash2,
  Video,
} from "lucide-react";

import {
  ACAO_DE_PUBLICAR,
  AVISO_DE_MAIS_NOTICIAS,
  DESCRICAO_DA_TELA,
  DESCRICAO_DO_VAZIO,
  FRASES_DE_FALTA,
  ROTULO_DA_PRIMEIRA,
  ROTULO_DE_CANCELAR,
  ROTULO_DE_CARREGAR_MAIS,
  ROTULO_DE_CONFIRMAR_EXCLUSAO,
  ROTULO_DE_NOVA,
  ROTULO_DE_RECARREGAR,
  ROTULO_DE_VOLTAR,
  SITUACAO_CARREGANDO,
  SITUACAO_ERRO,
  SITUACAO_FORMULARIO,
  SITUACAO_LISTA,
  SITUACAO_VAZIA,
  TITULO_DA_TELA,
  TITULO_DO_ERRO,
  TITULO_DO_VAZIO,
  confirmacaoDaExclusao,
  confirmacaoDaPublicacao,
  confirmacaoDoSalvamento,
  corpoDaNoticia,
  descricaoDaExclusao,
  estaPublicada,
  falhaDaExclusao,
  falhaDaPublicacao,
  falhaDoSalvamento,
  faltandoNoFormulario,
  rotuloDaPublicacao,
  rotuloDeAlternarPublicacao,
  rotuloDeEditar,
  rotuloDeExcluir,
  rotuloDeVerNoYoutube,
  situacaoDaTela,
  textoDaAcaoEmCurso,
  textoDaDataDaNoticia,
  tituloDaExclusao,
  valoresDaNoticia,
  valoresVazios,
  videoDoFormulario,
} from "@/admin/blog/noticias";
import { BASE_DO_PAINEL } from "@/admin/blog/rotas";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { excluirNoticia, salvarNoticia } from "@/data/blog/escrita";
import { listarNoticiasDoPainel } from "@/data/blog/noticias";
import {
  TAMANHO_MAXIMO_DA_DESCRICAO_DA_NOTICIA,
  TAMANHO_MAXIMO_DO_TITULO_DA_NOTICIA,
  enderecoNoYoutube,
  miniaturaDeReserva,
} from "@/domain/blog/noticias";
import { OPERACAO_EXCLUIR_NOTICIA, OPERACAO_SALVAR_NOTICIA } from "@/domain/blog/operacoes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pageTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Quantas linhas fantasma o esqueleto desenha enquanto os dados vêm. */
const LINHAS_DO_ESQUELETO = 3;

/** Quantas Notícias a tela pede por vez. Mesmo desenho de lote das Categorias. */
export const TAMANHO_DO_LOTE = 50;

/** O alvo de ação da linha: 40×40 e contorno permanente, como nas Categorias. */
const CLASSE_DO_ALVO_DE_ACAO = cn(
  ANEL_DE_FOCO,
  ALVO_DE_TOQUE,
  "inline-flex size-10 shrink-0 items-center justify-center rounded-controle",
  "border border-border-strong bg-surface text-ink-secondary",
  "transition-colors hover:bg-surface-sunk hover:text-ink",
  "disabled:pointer-events-none disabled:opacity-60",
);

const CLASSE_DE_CAMPO =
  "w-full rounded-controle border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-muted transition-colors";

export default function TelaDeNoticias() {
  const [noticias, setNoticias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  /* `null` = a lista; um objeto = o formulário. `{ id: null }` é criar. */
  const [emEdicao, setEmEdicao] = useState(null);
  const [valores, setValores] = useState(valoresVazios);
  const [recusa, setRecusa] = useState(null);

  /* O trinco é uma REFERÊNCIA, e global: um pedido de cada vez na tela
     inteira. Dois cliques no mesmo tique veriam o mesmo estado antigo. */
  const trinco = useRef(null);
  const [emCurso, setEmCurso] = useState(null);
  const [paraExcluir, setParaExcluir] = useState(null);

  const ultimoPedido = useRef(0);
  const [lotes, setLotes] = useState(1);
  const [haMais, setHaMais] = useState(false);

  useEffect(() => {
    ultimoPedido.current += 1;
    const pedido = ultimoPedido.current;
    setCarregando(true);
    setErro(null);

    (async () => {
      /* A camada devolve erro tipado e não lança, mas uma rejeição sem
         tratamento deixaria o esqueleto girando para sempre. */
      let resultado;
      try {
        resultado = await listarNoticiasDoPainel({ limite: TAMANHO_DO_LOTE * lotes });
      } catch (excecao) {
        resultado = {
          ok: false,
          erro: { tipo: "inesperado", mensagem: String(excecao?.message ?? excecao) },
        };
      }
      if (ultimoPedido.current !== pedido) return;
      if (!resultado?.ok) {
        /* ERRO NÃO É VAZIO, e a lista anterior sai junto. */
        setNoticias([]);
        setHaMais(false);
        setErro(resultado?.erro ?? { tipo: "inesperado", mensagem: "" });
        setCarregando(false);
        return;
      }
      setNoticias(resultado.dados);
      setHaMais(resultado.dados.length >= TAMANHO_DO_LOTE * lotes);
      setErro(null);
      setCarregando(false);
    })();

    return () => {
      ultimoPedido.current += 1;
    };
  }, [tentativa, lotes]);

  const relerLista = useCallback(() => setTentativa((n) => n + 1), []);

  const abrirAcao = useCallback((noticia, operacao) => {
    if (trinco.current !== null) return false;
    trinco.current = { id: noticia?.id ?? null, operacao };
    setEmCurso(trinco.current);
    return true;
  }, []);

  const fecharAcao = useCallback(() => {
    trinco.current = null;
    setEmCurso(null);
  }, []);

  const abrirFormulario = useCallback((noticia) => {
    setEmEdicao(noticia ?? { id: null });
    setValores(noticia ? valoresDaNoticia(noticia) : valoresVazios());
    setRecusa(null);
  }, []);

  const fecharFormulario = useCallback(() => {
    setEmEdicao(null);
    setRecusa(null);
  }, []);

  /** Grava a Notícia, criando ou editando, e relê a lista. */
  const salvar = useCallback(async () => {
    if (emEdicao === null) return;

    const montado = corpoDaNoticia(valores);
    if (!montado.ok) {
      setRecusa(montado);
      notificarErro(falhaDoSalvamento({ titulo: valores.titulo }), montado.motivo);
      return;
    }
    setRecusa(null);

    const alvo = { ...emEdicao, titulo: montado.corpo.titulo };
    if (!abrirAcao(alvo, OPERACAO_SALVAR_NOTICIA)) return;

    /* O trinco sai no `finally`, sempre: preso, ele desabilita a tela inteira. */
    let resultado;
    try {
      resultado = await salvarNoticia(montado.corpo, { id: emEdicao.id ?? null });
    } catch (excecao) {
      resultado = {
        ok: false,
        erro: { tipo: "inesperado", mensagem: String(excecao?.message ?? excecao) },
      };
    } finally {
      fecharAcao();
    }

    if (!resultado.ok) {
      notificarErro(falhaDoSalvamento(alvo), resultado.erro.mensagem);
      return;
    }
    const gravada = resultado.dados?.noticia ?? alvo;
    notificarSucesso(confirmacaoDoSalvamento(gravada, resultado.dados?.criada === true));
    fecharFormulario();
    relerLista();
  }, [abrirAcao, emEdicao, fecharAcao, fecharFormulario, relerLista, valores]);

  /**
   * Põe no ar ou tira do ar, sem abrir o formulário.
   *
   * O que viaja é o valor DESEJADO, e não um pedido de inversão: o clique
   * repetido não desfaz a si mesmo. E a confirmação fala do valor GRAVADO.
   */
  const alternarPublicacao = useCallback(
    async (noticia) => {
      if (!abrirAcao(noticia, ACAO_DE_PUBLICAR)) return;

      let resultado;
      try {
        resultado = await salvarNoticia(
          { publicada: !estaPublicada(noticia) },
          { id: noticia.id },
        );
      } catch (excecao) {
        resultado = {
          ok: false,
          erro: { tipo: "inesperado", mensagem: String(excecao?.message ?? excecao) },
        };
      } finally {
        fecharAcao();
      }

      if (!resultado.ok) {
        notificarErro(falhaDaPublicacao(noticia), resultado.erro.mensagem);
        if (resultado.erro.tipo === "nao_encontrado") relerLista();
        return;
      }
      notificarSucesso(confirmacaoDaPublicacao(resultado.dados?.noticia ?? noticia));
      relerLista();
    },
    [abrirAcao, fecharAcao, relerLista],
  );

  /** Exclui a Notícia, depois da confirmação que a nomeou. */
  const excluir = useCallback(
    async (noticia) => {
      if (!abrirAcao(noticia, OPERACAO_EXCLUIR_NOTICIA)) return;

      let resultado;
      try {
        resultado = await excluirNoticia(noticia.id);
      } catch (excecao) {
        resultado = {
          ok: false,
          erro: { tipo: "inesperado", mensagem: String(excecao?.message ?? excecao) },
        };
      } finally {
        fecharAcao();
      }
      setParaExcluir(null);

      if (!resultado.ok) {
        notificarErro(falhaDaExclusao(noticia), resultado.erro.mensagem);
        /* Ausência também acerta a lista: outra aba pode tê-la excluído. */
        if (resultado.erro.tipo === "nao_encontrado") relerLista();
        return;
      }
      notificarSucesso(confirmacaoDaExclusao(noticia));
      relerLista();
    },
    [abrirAcao, fecharAcao, relerLista],
  );

  const situacao = situacaoDaTela({
    editando: emEdicao !== null,
    carregando,
    erro,
    noticias,
  });

  const noticiaEmCurso = useMemo(() => {
    if (emCurso === null) return null;
    if (emEdicao !== null) return { ...emEdicao, titulo: valores.titulo };
    return noticias.find((n) => n.id === emCurso.id) ?? null;
  }, [noticias, emCurso, emEdicao, valores.titulo]);

  return (
    <motion.div
      initial={pageTransition.initial}
      animate={pageTransition.animate}
      className="painel min-h-screen bg-background"
      data-tela="noticias"
    >
      <header className="border-b border-border-soft bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-6 py-4">
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
          <div className="flex-1" />
          {situacao === SITUACAO_LISTA || situacao === SITUACAO_VAZIA ? (
            <Button
              type="button"
              data-acao="nova"
              onClick={() => abrirFormulario(null)}
              className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2")}
            >
              <Plus aria-hidden="true" className="size-4" />
              {ROTULO_DE_NOVA}
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8" data-estado-da-lista={situacao}>
        <h1 className="text-2xl font-black text-ink">{TITULO_DA_TELA}</h1>
        <p className="mt-2 text-sm text-ink-secondary">{DESCRICAO_DA_TELA}</p>

        <div className="mt-6">
          {situacao === SITUACAO_CARREGANDO ? (
            <div className="flex flex-col gap-3" data-papel="esqueleto">
              <p role="status" className="sr-only">
                Carregando as notícias.
              </p>
              {Array.from({ length: LINHAS_DO_ESQUELETO }, (_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="flex items-center gap-4 rounded-cartao border border-border-soft bg-surface p-4"
                >
                  <Skeleton className="aspect-video w-32 rounded-controle" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : situacao === SITUACAO_ERRO ? (
            <div
              role="alert"
              className="mx-auto max-w-xl rounded-cartao border border-destructive-ink/70 bg-destructive-ink/10 p-6 text-center"
            >
              <AlertCircle aria-hidden="true" className="mx-auto size-8 text-destructive-ink" />
              <h2 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_ERRO}</h2>
              <p className="mt-2 text-sm text-ink-secondary">{erro?.mensagem}</p>
              <Button
                type="button"
                variant="outline"
                data-acao="repetir"
                onClick={relerLista}
                className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
              >
                {ROTULO_DE_RECARREGAR}
              </Button>
            </div>
          ) : situacao === SITUACAO_VAZIA ? (
            <div className="mx-auto max-w-xl rounded-cartao border border-border-soft bg-surface p-8 text-center">
              <Video aria-hidden="true" className="mx-auto size-10 text-ink-muted" />
              <h2 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_VAZIO}</h2>
              <p className="mt-2 text-sm text-ink-secondary">{DESCRICAO_DO_VAZIO}</p>
              <Button
                type="button"
                data-acao="primeira"
                onClick={() => abrirFormulario(null)}
                className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
              >
                {ROTULO_DA_PRIMEIRA}
              </Button>
            </div>
          ) : situacao === SITUACAO_FORMULARIO ? (
            <Formulario
              valores={valores}
              aoMudar={(campo, valor) => setValores((atuais) => ({ ...atuais, [campo]: valor }))}
              recusa={recusa}
              ocupado={emCurso !== null}
              criando={emEdicao?.id === null || emEdicao?.id === undefined}
              aoSalvar={salvar}
              aoCancelar={fecharFormulario}
            />
          ) : (
            <ul className="flex flex-col gap-3" data-papel="noticias">
              {noticias.map((noticia) => (
                <Linha
                  key={noticia.id}
                  noticia={noticia}
                  emCurso={emCurso?.id === noticia.id ? emCurso.operacao : null}
                  ocupado={emCurso !== null}
                  aoEditar={() => abrirFormulario(noticia)}
                  aoAlternarPublicacao={() => alternarPublicacao(noticia)}
                  aoPedirExclusao={() => setParaExcluir(noticia)}
                />
              ))}
            </ul>
          )}

          {situacao === SITUACAO_LISTA && haMais ? (
            <div
              data-papel="ha-mais"
              className="mt-4 flex flex-wrap items-center justify-center gap-3"
            >
              <p className="text-sm text-ink-secondary">{AVISO_DE_MAIS_NOTICIAS}</p>
              <Button
                type="button"
                variant="outline"
                data-acao="carregar-mais"
                onClick={() => setLotes((n) => n + 1)}
                className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE)}
              >
                {ROTULO_DE_CARREGAR_MAIS}
              </Button>
            </div>
          ) : null}
        </div>

        {/* O que está acontecendo, para quem ouve a tela. */}
        <p role="status" aria-live="polite" className="sr-only" data-papel="acao-em-curso">
          {noticiaEmCurso === null ? "" : textoDaAcaoEmCurso(noticiaEmCurso, emCurso.operacao)}
        </p>
      </main>

      <DialogoDeConfirmacao
        aberto={paraExcluir !== null}
        aoMudarAbertura={(aberto) => {
          if (!aberto && trinco.current === null) setParaExcluir(null);
        }}
        titulo={paraExcluir === null ? "" : tituloDaExclusao(paraExcluir)}
        descricao={paraExcluir === null ? "" : descricaoDaExclusao()}
        rotuloDeConfirmacao={ROTULO_DE_CONFIRMAR_EXCLUSAO}
        ocupado={
          paraExcluir !== null && emCurso?.id === paraExcluir.id
            ? textoDaAcaoEmCurso(paraExcluir, emCurso.operacao)
            : ""
        }
        aoConfirmar={() => {
          if (paraExcluir !== null) excluir(paraExcluir);
        }}
      />
    </motion.div>
  );
}

/** A miniatura do vídeo. Sem ela, ou quando ela falha, fica o ícone. */
function Miniatura({ youtubeId, className }) {
  const [quebrada, setQuebrada] = useState(false);
  const endereco = miniaturaDeReserva(youtubeId);
  return (
    <div
      className={cn(
        "flex aspect-video shrink-0 items-center justify-center overflow-hidden",
        "rounded-controle border border-border-soft bg-surface-sunk",
        className,
      )}
    >
      {endereco !== "" && !quebrada ? (
        <img
          src={endereco}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setQuebrada(true)}
          className="size-full object-cover"
        />
      ) : (
        <Video aria-hidden="true" className="size-6 text-ink-muted" />
      )}
    </div>
  );
}

/** Uma linha da lista: a miniatura, o título, o estado e as ações. */
function Linha({
  noticia,
  emCurso = null,
  ocupado = false,
  aoEditar,
  aoAlternarPublicacao,
  aoPedirExclusao,
}) {
  const excluindo = emCurso === OPERACAO_EXCLUIR_NOTICIA;
  const publicando = emCurso === ACAO_DE_PUBLICAR;
  const noAr = estaPublicada(noticia);
  const data = textoDaDataDaNoticia(noticia);

  return (
    <li
      data-noticia={noticia.id}
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-cartao",
        "border border-border-soft bg-surface p-4",
        "transition-colors hover:border-border-strong",
      )}
    >
      <Miniatura youtubeId={noticia.youtube_id} className="w-32" />

      <div className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
        <h3 className="text-sm font-semibold text-ink">{noticia.titulo}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* O estado é dito por PALAVRA, e não só pela cor. */}
          <span
            data-papel="publicacao"
            data-publicada={noAr ? "1" : "0"}
            className={cn(
              "rounded-pilula border px-2 py-0.5 text-xs font-bold",
              noAr
                ? "border-brand-action bg-brand-wash text-brand-action"
                : "border-border-strong bg-surface-sunk text-ink-secondary",
            )}
          >
            {rotuloDaPublicacao(noticia)}
          </span>
          {data !== "" ? <span className="dado text-xs text-ink-muted">{data}</span> : null}
        </div>
      </div>

      <div data-papel="acoes" className="flex shrink-0 items-center gap-1.5">
        <a
          href={enderecoNoYoutube(noticia.youtube_id)}
          target="_blank"
          rel="noopener noreferrer"
          data-acao="ver-no-youtube"
          aria-label={rotuloDeVerNoYoutube(noticia)}
          className={CLASSE_DO_ALVO_DE_ACAO}
        >
          <ExternalLink aria-hidden="true" className="size-4" />
        </a>

        <button
          type="button"
          data-acao="alternar-publicacao"
          aria-label={rotuloDeAlternarPublicacao(noticia)}
          aria-busy={publicando ? "true" : undefined}
          disabled={ocupado}
          onClick={() => aoAlternarPublicacao?.()}
          className={CLASSE_DO_ALVO_DE_ACAO}
        >
          {publicando ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : noAr ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </button>

        <button
          type="button"
          data-acao="editar"
          aria-label={rotuloDeEditar(noticia)}
          disabled={ocupado}
          onClick={() => aoEditar?.()}
          className={CLASSE_DO_ALVO_DE_ACAO}
        >
          <SquarePen aria-hidden="true" className="size-4" />
        </button>

        <button
          type="button"
          data-acao="excluir"
          aria-label={rotuloDeExcluir(noticia)}
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

/** O formulário de criar e de editar: o mesmo, porque a operação é a mesma. */
function Formulario({ valores, aoMudar, recusa, ocupado, criando, aoSalvar, aoCancelar }) {
  const faltando = faltandoNoFormulario(valores);
  const campoRecusado = recusa?.campo ?? "";
  /* Campo obrigatório vazio só fica vermelho DEPOIS de uma tentativa de salvar:
     um formulário novo que nasce todo marcado de erro acusa quem ainda não
     digitou nada. */
  const invalido = (campo) => campoRecusado === campo;
  const youtubeId = videoDoFormulario(valores);

  return (
    <form
      data-papel="formulario"
      className="mx-auto max-w-xl rounded-cartao border border-border-soft bg-surface p-6"
      onSubmit={(evento) => {
        evento.preventDefault();
        aoSalvar?.();
      }}
    >
      <h2 className="text-base font-semibold text-ink">
        {criando ? "Nova notícia" : "Editar notícia"}
      </h2>

      <div className="mt-5 flex flex-col gap-5">
        {/* ── Vídeo ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="noticia-video"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink"
          >
            Link do vídeo no YouTube
            <span className="text-xs font-medium text-ink-muted">(obrigatório)</span>
          </label>
          <input
            id="noticia-video"
            name="video"
            data-campo="video"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={valores.video ?? ""}
            disabled={ocupado}
            aria-invalid={invalido("video") ? "true" : undefined}
            aria-describedby={invalido("video") ? "noticia-video-erro" : "noticia-video-ajuda"}
            onChange={(e) => aoMudar?.("video", e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className={cn(
              CLASSE_DE_CAMPO,
              ANEL_DE_FOCO,
              "dado",
              invalido("video") ? "border-destructive" : "border-border-soft",
            )}
          />
          <p
            id="noticia-video-erro"
            role={invalido("video") ? "alert" : undefined}
            hidden={!invalido("video")}
            className="text-xs font-medium text-destructive"
          >
            {campoRecusado === "video" ? recusa.motivo : FRASES_DE_FALTA.video}
          </p>
          <p id="noticia-video-ajuda" className="text-xs text-ink-muted">
            Cole o endereço do vídeo, do jeito que o YouTube mostra. O vídeo precisa estar como
            público ou não listado para tocar no site.
          </p>
          {/* A PRÉVIA: a miniatura que o YouTube tem para o link colado. É a
              confirmação de que é o vídeo certo, antes de salvar. */}
          {youtubeId !== "" ? (
            <div data-papel="previa-do-video" className="mt-1 flex items-center gap-3">
              <Miniatura key={youtubeId} youtubeId={youtubeId} className="w-40" />
              <p className="text-xs text-ink-secondary">Este é o vídeo que vai aparecer.</p>
            </div>
          ) : null}
        </div>

        {/* ── Título ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="noticia-titulo"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink"
          >
            Título
            <span className="text-xs font-medium text-ink-muted">(obrigatório)</span>
          </label>
          <input
            id="noticia-titulo"
            name="titulo"
            data-campo="titulo"
            type="text"
            maxLength={TAMANHO_MAXIMO_DO_TITULO_DA_NOTICIA}
            value={valores.titulo ?? ""}
            disabled={ocupado}
            aria-invalid={invalido("titulo") ? "true" : undefined}
            aria-describedby={invalido("titulo") ? "noticia-titulo-erro" : undefined}
            onChange={(e) => aoMudar?.("titulo", e.target.value)}
            placeholder="O que há de novo na ChatClean"
            className={cn(
              CLASSE_DE_CAMPO,
              ANEL_DE_FOCO,
              invalido("titulo") ? "border-destructive" : "border-border-soft",
            )}
          />
          <p
            id="noticia-titulo-erro"
            role={invalido("titulo") ? "alert" : undefined}
            hidden={!invalido("titulo")}
            className="text-xs font-medium text-destructive"
          >
            {campoRecusado === "titulo" && !faltando.includes("titulo")
              ? recusa.motivo
              : FRASES_DE_FALTA.titulo}
            {/* Título vazio ganha a frase que explica PARA QUE ele serve; título
                recusado por outro motivo (o teto) ganha o motivo. */}
          </p>
        </div>

        {/* ── Descrição ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="noticia-descricao" className="text-sm font-semibold text-ink">
            Descrição
          </label>
          <textarea
            id="noticia-descricao"
            name="descricao"
            data-campo="descricao"
            rows={6}
            maxLength={TAMANHO_MAXIMO_DA_DESCRICAO_DA_NOTICIA}
            value={valores.descricao ?? ""}
            disabled={ocupado}
            aria-invalid={invalido("descricao") ? "true" : undefined}
            aria-describedby={
              invalido("descricao") ? "noticia-descricao-erro" : "noticia-descricao-ajuda"
            }
            onChange={(e) => aoMudar?.("descricao", e.target.value)}
            placeholder="Do que o vídeo trata, para quem abrir a página dele."
            className={cn(
              CLASSE_DE_CAMPO,
              ANEL_DE_FOCO,
              "resize-y",
              invalido("descricao") ? "border-destructive" : "border-border-soft",
            )}
          />
          <p
            id="noticia-descricao-erro"
            role={invalido("descricao") ? "alert" : undefined}
            hidden={!invalido("descricao")}
            className="text-xs font-medium text-destructive"
          >
            {campoRecusado === "descricao" ? recusa.motivo : ""}
          </p>
          <p id="noticia-descricao-ajuda" className="text-xs text-ink-muted">
            Aparece abaixo do vídeo, na página de assistir. As quebras de linha são mantidas.
          </p>
        </div>

        {/* ── Publicada ────────────────────────────────────────────────── */}
        <label
          htmlFor="noticia-publicada"
          className="flex items-start gap-3 rounded-controle border border-border-soft p-3"
        >
          <input
            id="noticia-publicada"
            name="publicada"
            data-campo="publicada"
            type="checkbox"
            checked={valores.publicada === true}
            disabled={ocupado}
            onChange={(e) => aoMudar?.("publicada", e.target.checked)}
            className={cn(ANEL_DE_FOCO, "mt-0.5 size-4 accent-emerald-600")}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-ink">Publicar no blog</span>
            <span className="text-xs text-ink-muted">
              Desmarcada, a notícia fica salva no Painel e ninguém a vê no site.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          data-acao="salvar"
          disabled={ocupado}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2")}
        >
          {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {criando ? "Cadastrar notícia" : "Salvar notícia"}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-acao="cancelar"
          disabled={ocupado}
          onClick={() => aoCancelar?.()}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE)}
        >
          {ROTULO_DE_CANCELAR}
        </Button>
      </div>
    </form>
  );
}
