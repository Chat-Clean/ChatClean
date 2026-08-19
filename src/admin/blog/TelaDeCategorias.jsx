/**
 * A tela de Categorias do Painel (Story 2.14).
 *
 * ─── ELA NASCE DENTRO DO PORTÃO, E NÃO AO LADO DELE ─────────────────────────
 *
 * A rota é filha de `/admin`, e o portão está no ELEMENTO DO PAI — o mesmo que
 * a Story 2.13 montou para a pré-visualização. Não há um segundo portão aqui, e
 * não há decisão de acesso neste arquivo: se este componente está renderizando,
 * a sessão já foi verificada.
 *
 * ─── E ELA É ROTA, E NÃO ABA ────────────────────────────────────────────────
 *
 * A faixa de busca do Painel é um ternário de dois ramos, e uma terceira aba
 * cairia no ramo de Carreiras — ganhando o campo "Buscar vagas" e o botão "Nova
 * Vaga". Carreiras é módulo irmão, fora de escopo, e não pode regredir.
 *
 * ─── AS CATEGORIAS SÃO DADO ─────────────────────────────────────────────────
 *
 * Nenhuma lista de Categoria existe no fonte: esta tela lê do banco, pela
 * camada de dados, e escreve pela MESMA função de servidor que salva Post. A
 * operação é um campo do corpo, conferida contra o vocabulário fechado de
 * `domain/blog/operacoes.js` — não um endereço a mais, e não uma política de
 * escrita para `authenticated`.
 *
 * ─── A CONTAGEM DE USO APARECE ANTES DE ALGUÉM TENTAR ───────────────────────
 *
 * Cada linha diz quantos Posts usam a Categoria, e é esse número que decide se
 * o alvo de excluir está disponível. Quem conta é o banco, e é o mesmo número
 * que a recusa do servidor diz para quem tentar mesmo assim — a tela não
 * inventa a sua própria contagem. E o bloqueio de verdade é `on delete
 * restrict`: a aplicação explica, o banco garante.
 *
 * ─── CINCO SITUAÇÕES, E NENHUMA DELAS É TELA EM BRANCO ──────────────────────
 *
 * Carregando, erro, vazio, lista e formulário. As frases e a derivação da
 * situação moram em `categorias.js`, puras, para a verificação executá-las em
 * vez de ler JSX.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  Plus,
  SquarePen,
  Tags,
  Trash2,
} from "lucide-react";

import {
  AVISO_DE_MAIS_CATEGORIAS,
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
  confirmacaoDoSalvamento,
  corpoDaCategoria,
  descricaoDaExclusao,
  falhaDaExclusao,
  falhaDoSalvamento,
  faltandoNoFormulario,
  motivoDeNaoExcluir,
  podeExcluir,
  rotuloDeEditar,
  rotuloDeExcluir,
  situacaoDaTela,
  textoDaAcaoEmCurso,
  textoDoUso,
  usoDaCategoria,
  tituloDaExclusao,
  valoresDaCategoria,
  valoresVazios,
} from "@/admin/blog/categorias";
import { ICONES_DE_CATEGORIA } from "@/admin/blog/iconesDeCategoria";
import PilulaDeCategoria from "@/admin/blog/PilulaDeCategoria";
import { BASE_DO_PAINEL } from "@/admin/blog/rotas";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { excluirCategoria, salvarCategoria } from "@/data/blog/escrita";
import { listarCategoriasDoPainel } from "@/data/blog/taxonomia";
import {
  CHAVES_DE_ICONE_DE_CATEGORIA,
  CORES_DE_CATEGORIA,
  aparenciaDaCor,
} from "@/domain/blog/categorias";
import {
  OPERACAO_EXCLUIR_CATEGORIA,
  OPERACAO_SALVAR_CATEGORIA,
} from "@/domain/blog/operacoes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Quantas linhas fantasma o esqueleto desenha enquanto os dados vêm. */
const LINHAS_DO_ESQUELETO = 4;

/**
 * Quantas Categorias a tela pede por vez.
 *
 * Ela é uma lista curta por natureza — mas "curta por natureza" é expectativa,
 * não garantia, e a camada tem teto próprio. Sem lote, passando do teto uma
 * Categoria simplesmente sumia da tela, e a situação continuava sendo "lista":
 * indistinguível de tudo à vista. Exportado porque a verificação precisa do
 * número DE VERDADE — um escrito à mão na ferramenta divergiria deste.
 */
export const TAMANHO_DO_LOTE = 50;

/**
 * A aparência de um alvo de ação da linha — 40×40 e **contorno permanente**.
 *
 * A mesma de `ListaDePosts.jsx`, pela mesma razão: nada é condicionado a
 * `hover`, nada nasce transparente e nada nasce escondido. Ação revelada por
 * hover não existe no celular, não existe para quem navega por teclado, e não
 * existe para quem não sabe que deve passar o ponteiro por cima.
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

const CLASSE_DE_CAMPO =
  "w-full rounded-controle border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-muted transition-colors";

export default function TelaDeCategorias() {
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  /* `null` = a lista; um objeto = o formulário. `{ id: null }` é criar. */
  const [emEdicao, setEmEdicao] = useState(null);
  const [valores, setValores] = useState(valoresVazios);
  const [recusa, setRecusa] = useState(null);

  /* O trinco é uma REFERÊNCIA, e não estado: dois cliques no mesmo tique do
     relógio veriam o mesmo estado antigo e disparariam duas exclusões. Ele é
     global — um pedido de cada vez na tela inteira —, então os alvos de TODAS
     as linhas desabilitam enquanto ele está preso. */
  const trinco = useRef(null);
  const [emCurso, setEmCurso] = useState(null);
  const [paraExcluir, setParaExcluir] = useState(null);

  const ultimoPedido = useRef(0);

  /* ── QUANTAS CATEGORIAS JÁ FORAM PEDIDAS ────────────────────────────────
     A camada tem teto (`LIMITE_PADRAO`), e a tela pedia sem dizer nada: passando
     dele, Categoria sumia da tela sem que nada dissesse que existem mais — e a
     situação continuava sendo "lista", indistinguível de tudo à vista. Agora a
     tela pede um lote por vez e SABE quando pode haver mais. */
  const [lotes, setLotes] = useState(1);
  const [haMais, setHaMais] = useState(false);

  useEffect(() => {
    ultimoPedido.current += 1;
    const pedido = ultimoPedido.current;
    setCarregando(true);
    setErro(null);

    (async () => {
      /* A CAMADA DEVOLVE ERRO TIPADO E NÃO LANÇA — mas confiar nisso aqui é
         apostar a promessa desta tela numa disciplina de outro módulo. Uma
         rejeição sem tratamento deixaria o esqueleto girando para sempre, que é
         a tela em branco com outro nome. */
      let resultado;
      try {
        resultado = await listarCategoriasDoPainel({ limite: TAMANHO_DO_LOTE * lotes });
      } catch (excecao) {
        resultado = {
          ok: false,
          erro: { tipo: "inesperado", mensagem: String(excecao?.message ?? excecao) },
        };
      }
      if (ultimoPedido.current !== pedido) return;
      if (!resultado?.ok) {
        /* ERRO NÃO É VAZIO. A lista anterior é descartada junto: mostrar linhas
           velhas embaixo de uma mensagem de falha diz que elas ainda valem. */
        setCategorias([]);
        setHaMais(false);
        setErro(resultado?.erro ?? { tipo: "inesperado", mensagem: "" });
        setCarregando(false);
        return;
      }
      setCategorias(resultado.dados);
      /* Um lote CHEIO é a única evidência que a tela tem de que pode haver
         mais: o PostgREST não diz o total sem contagem, e pedir contagem só
         para desenhar um botão custaria uma varredura por abertura de tela. */
      setHaMais(resultado.dados.length >= TAMANHO_DO_LOTE * lotes);
      setErro(null);
      setCarregando(false);
    })();

    return () => {
      ultimoPedido.current += 1;
    };
  }, [tentativa, lotes]);

  const relerLista = useCallback(() => setTentativa((n) => n + 1), []);

  const abrirAcao = useCallback((categoria, operacao) => {
    if (trinco.current !== null) return false;
    trinco.current = { id: categoria?.id ?? null, operacao };
    setEmCurso(trinco.current);
    return true;
  }, []);

  const fecharAcao = useCallback(() => {
    trinco.current = null;
    setEmCurso(null);
  }, []);

  const abrirFormulario = useCallback((categoria) => {
    setEmEdicao(categoria ?? { id: null });
    setValores(categoria ? valoresDaCategoria(categoria) : valoresVazios());
    setRecusa(null);
  }, []);

  const fecharFormulario = useCallback(() => {
    setEmEdicao(null);
    setRecusa(null);
  }, []);

  /**
   * Grava a Categoria — criando ou editando, pela mesma operação.
   *
   * Depois de gravar, a lista é RELIDA em vez de remendada: renomear muda o
   * nome em todos os Posts que a usam, e a contagem de uso de uma Categoria
   * nova é do banco. Remendar a lista aqui faria a tela mostrar um número que
   * ela mesma calculou.
   */
  const salvar = useCallback(async () => {
    if (emEdicao === null) return;

    const montado = corpoDaCategoria(valores);
    if (!montado.ok) {
      setRecusa(montado);
      notificarErro(
        falhaDoSalvamento({ nome: valores.nome }),
        montado.motivo,
      );
      return;
    }
    setRecusa(null);

    const alvo = { ...emEdicao, nome: montado.corpo.nome };
    if (!abrirAcao(alvo, OPERACAO_SALVAR_CATEGORIA)) return;

    /* O TRINCO SAI NO `finally`, SEMPRE. A camada devolve erro tipado e não
       lança — mas apostar o trinco global nessa disciplina de outro módulo é o
       que faz uma rejeição inesperada desabilitar TODOS os alvos da tela para
       sempre, sem aviso nenhum. É o mesmo conserto que a prévia recebeu. */
    let resultado;
    try {
      resultado = await salvarCategoria(montado.corpo, { id: emEdicao.id ?? null });
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
    const gravada = resultado.dados?.categoria ?? alvo;
    notificarSucesso(
      confirmacaoDoSalvamento(gravada, resultado.dados?.criada === true),
    );
    fecharFormulario();
    relerLista();
  }, [abrirAcao, emEdicao, fecharAcao, fecharFormulario, relerLista, valores]);

  /**
   * Exclui a Categoria — depois da confirmação que a nomeou.
   *
   * A recusa por uso vem do SERVIDOR com o número dentro, e é essa frase que a
   * tela mostra: quem contou é quem sabe. E o banco recusa de qualquer jeito,
   * por `posts_categoria_id_fkey`.
   */
  const excluir = useCallback(
    async (categoria) => {
      if (!abrirAcao(categoria, OPERACAO_EXCLUIR_CATEGORIA)) return;

      /* Mesmo motivo do salvamento: o trinco é global, e preso é a tela
         inteira parada sem dizer por quê. */
      let resultado;
      try {
        resultado = await excluirCategoria(categoria.id);
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
        notificarErro(falhaDaExclusao(categoria), resultado.erro.mensagem);
        /* Ausência também acerta a lista: duas abas do Painel abertas é o
           caminho normal para excluir o que a outra já excluiu. */
        if (resultado.erro.tipo === "nao_encontrado") relerLista();
        return;
      }
      notificarSucesso(confirmacaoDaExclusao(categoria));
      relerLista();
    },
    [abrirAcao, fecharAcao, relerLista],
  );

  /** O alvo de excluir indisponível DIZ o motivo, em vez de sumir. */
  const explicarIndisponivel = useCallback((categoria) => {
    const motivo = motivoDeNaoExcluir(categoria);
    if (motivo === null) return;
    notificarErro(motivo.oQueHouve, motivo.oQueFazer);
  }, []);

  const situacao = situacaoDaTela({
    editando: emEdicao !== null,
    carregando,
    erro,
    categorias,
  });

  const categoriaEmCurso = useMemo(() => {
    if (emCurso === null) return null;
    if (emEdicao !== null) return { ...emEdicao, nome: valores.nome };
    return categorias.find((c) => c.id === emCurso.id) ?? null;
  }, [categorias, emCurso, emEdicao, valores.nome]);

  return (
    <div className="painel min-h-screen bg-background" data-tela="categorias">
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
              {/* O esqueleto é decorativo para quem ouve a tela: quatro vultos
                  anunciados um a um não informam nada. Quem informa é o
                  `status`, que fala uma vez. */}
              <p role="status" className="sr-only">
                Carregando as categorias.
              </p>
              {Array.from({ length: LINHAS_DO_ESQUELETO }, (_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="flex items-center gap-4 rounded-cartao border border-border-soft bg-surface p-4"
                >
                  <Skeleton className="h-6 w-32 rounded-pilula" />
                  <div className="flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : situacao === SITUACAO_ERRO ? (
            <div
              role="alert"
              className="mx-auto max-w-xl rounded-cartao border border-destructive-ink/70 bg-destructive-ink/10 p-6 text-center"
            >
              <AlertCircle
                aria-hidden="true"
                className="mx-auto size-8 text-destructive-ink"
              />
              <h2 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_ERRO}</h2>
              {/* A frase do erro TIPADO: ela já diz o que fazer, e é diferente
                  para sessão expirada, rede fora e ambiente ausente. */}
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
              <Tags aria-hidden="true" className="mx-auto size-10 text-ink-muted" />
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
              aoMudar={(campo, valor) =>
                setValores((atuais) => ({ ...atuais, [campo]: valor }))
              }
              recusa={recusa}
              ocupado={emCurso !== null}
              criando={emEdicao?.id === null || emEdicao?.id === undefined}
              aoSalvar={salvar}
              aoCancelar={fecharFormulario}
            />
          ) : (
            <ul className="flex flex-col gap-3" data-papel="categorias">
              {categorias.map((categoria) => (
                <Linha
                  key={categoria.id}
                  categoria={categoria}
                  emCurso={emCurso?.id === categoria.id ? emCurso.operacao : null}
                  ocupado={emCurso !== null}
                  aoEditar={() => abrirFormulario(categoria)}
                  aoPedirExclusao={() => setParaExcluir(categoria)}
                  aoExplicarIndisponivel={() => explicarIndisponivel(categoria)}
                />
              ))}
            </ul>
          )}

          {/* HÁ MAIS DO QUE ESTÁ À VISTA, E A TELA DIZ ISSO.
              Sem esta faixa, passar do teto da camada fazia Categoria sumir sem
              que nada dissesse que ela existe — e a tela continuava mostrando a
              situação "lista", indistinguível de tudo à vista. */}
          {situacao === SITUACAO_LISTA && haMais ? (
            <div
              data-papel="ha-mais"
              className="mt-4 flex flex-wrap items-center justify-center gap-3"
            >
              <p className="text-sm text-ink-secondary">{AVISO_DE_MAIS_CATEGORIAS}</p>
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

        {/* O QUE ESTÁ ACONTECENDO, PARA QUEM OUVE A TELA. O alvo desabilitado
            já diz "espere" a quem vê o giro; quem navega por leitor de tela
            ouviria apenas um botão que parou de responder. */}
        <p role="status" aria-live="polite" className="sr-only" data-papel="acao-em-curso">
          {categoriaEmCurso === null
            ? ""
            : textoDaAcaoEmCurso(categoriaEmCurso, emCurso.operacao)}
        </p>
      </main>

      {/* A CONFIRMAÇÃO É O COMPONENTE DO SISTEMA, e ela NOMEIA a Categoria. */}
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
    </div>
  );
}

/** Uma linha da lista: a pílula com cor e ícone, o uso, e as duas ações. */
function Linha({
  categoria,
  emCurso = null,
  ocupado = false,
  aoEditar,
  aoPedirExclusao,
  aoExplicarIndisponivel,
}) {
  const excluindo = emCurso === OPERACAO_EXCLUIR_CATEGORIA;
  const liberada = podeExcluir(categoria);

  return (
    <li
      data-categoria={categoria.id}
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-cartao",
        "border border-border-soft bg-surface p-4",
        "transition-colors hover:border-border-strong",
      )}
    >
      <PilulaDeCategoria categoria={categoria} />

      <span className="dado text-xs text-ink-muted" data-papel="endereco">
        {categoria.slug}
      </span>

      <div className="flex-1" />

      {/* O USO APARECE ANTES DE ALGUÉM TENTAR. É ele que explica por que o alvo
          de excluir está disponível ou não, e é o mesmo número que a recusa do
          servidor diz — quem conta é o banco, nas duas vezes. */}
      <span
        data-papel="uso"
        data-uso={usoDaCategoria(categoria) === null ? "desconhecido" : String(usoDaCategoria(categoria))}
        className="dado shrink-0 text-xs text-ink-secondary"
      >
        {textoDoUso(categoria)}
      </span>

      <div data-papel="acoes" className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          data-acao="editar"
          aria-label={rotuloDeEditar(categoria)}
          disabled={ocupado}
          onClick={() => aoEditar?.()}
          className={CLASSE_DO_ALVO_DE_ACAO}
        >
          <SquarePen aria-hidden="true" className="size-4" />
        </button>

        {liberada ? (
          <button
            type="button"
            data-acao="excluir"
            aria-label={rotuloDeExcluir(categoria)}
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
        ) : (
          /* `aria-disabled` e não `disabled`: o alvo continua alcançável pelo
             teclado e continua podendo DIZER o motivo. Um controle desligado de
             verdade some da navegação e explica coisa nenhuma. */
          <button
            type="button"
            data-acao="excluir"
            data-indisponivel="true"
            aria-disabled="true"
            aria-label={rotuloDeExcluir(categoria)}
            onClick={() => aoExplicarIndisponivel?.()}
            className={CLASSE_DO_ALVO_DE_ACAO}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Um grupo de escolha única — o padrão de rádios, cumprido.
 *
 * ─── POR QUE UM COMPONENTE, E NÃO DOZE BOTÕES ───────────────────────────────
 *
 * A versão anterior punha `role="radio"` em cada botão e parava aí: os doze
 * entravam na ordem de tabulação e as setas não faziam nada. Quem ouve a tela
 * recebia o anúncio de um grupo de rádios e encontrava um comportamento que não
 * é o de um grupo de rádios — pior que não anunciar padrão nenhum, porque a
 * pessoa passa a procurar o que não existe.
 *
 * O que este componente implementa é o mínimo do padrão:
 *
 *   - **uma parada de tabulação para o grupo inteiro** (`tabIndex` itinerante:
 *     só a opção marcada é alcançável por Tab; se nenhuma está, a primeira é);
 *   - **setas percorrem e ESCOLHEM**, com volta nas pontas — é o que a
 *     especificação de rádio manda, e é o que faz o grupo ser navegável sem
 *     ponteiro;
 *   - **Home e End** vão às pontas.
 *
 * A aparência de cada opção é decidida por quem chama (`renderizar`), porque
 * cor e ícone se mostram de formas diferentes — mas o COMPORTAMENTO é um só.
 */
function GrupoDeEscolha({
  rotulo,
  campo,
  nomeDoGrupo,
  opcoes,
  escolhida,
  desabilitado,
  aoEscolher,
  renderizar,
}) {
  const referencias = useRef([]);
  const posicaoMarcada = Math.max(0, opcoes.indexOf(escolhida));

  const irPara = (indice) => {
    const destino = (indice + opcoes.length) % opcoes.length;
    aoEscolher?.(opcoes[destino]);
    /* O FOCO ACOMPANHA A ESCOLHA. Sem isso, a seta move a marcação e deixa o
       foco para trás: a próxima seta parte do lugar errado, e quem navega por
       teclado perde a referência do que está selecionado. */
    referencias.current[destino]?.focus?.();
  };

  const aoTeclar = (evento, indice) => {
    const teclas = {
      ArrowRight: indice + 1,
      ArrowDown: indice + 1,
      ArrowLeft: indice - 1,
      ArrowUp: indice - 1,
      Home: 0,
      End: opcoes.length - 1,
    };
    if (!Object.hasOwn(teclas, evento.key)) return;
    evento.preventDefault();
    irPara(teclas[evento.key]);
  };

  return (
    <fieldset data-campo={campo} className="flex flex-col gap-1.5">
      <legend className="text-sm font-semibold text-ink">{rotulo}</legend>
      <div role="radiogroup" aria-label={nomeDoGrupo} className="flex flex-wrap gap-2">
        {opcoes.map((opcao, indice) => {
          const marcada = escolhida === opcao;
          const aparencia = renderizar(opcao, marcada);
          return (
            <button
              key={opcao}
              ref={(elemento) => {
                referencias.current[indice] = elemento;
              }}
              type="button"
              role="radio"
              aria-checked={marcada}
              aria-label={aparencia.rotulo}
              /* ITINERANTE: uma parada de tabulação para o grupo. */
              tabIndex={indice === posicaoMarcada ? 0 : -1}
              disabled={desabilitado}
              onClick={() => aoEscolher?.(opcao)}
              onKeyDown={(evento) => aoTeclar(evento, indice)}
              {...aparencia.dados}
              style={aparencia.estilo}
              className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, aparencia.classe)}
            >
              {aparencia.conteudo}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * O formulário de criar e de editar — o mesmo, porque a operação é a mesma.
 *
 * A cor é escolhida entre as do vocabulário FECHADO, e cada opção se mostra
 * pintada por `style`: escolher cor lendo o nome de um token não é escolher
 * cor. O ícone, idem, com o desenho do mapa fechado.
 */
function Formulario({
  valores,
  aoMudar,
  recusa,
  ocupado,
  criando,
  aoSalvar,
  aoCancelar,
}) {
  const faltando = faltandoNoFormulario(valores);
  const campoRecusado = recusa?.campo ?? "";
  const invalido = (campo) => faltando.includes(campo) || campoRecusado === campo;

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
        {criando ? "Nova categoria" : "Editar categoria"}
      </h2>

      <div className="mt-5 flex flex-col gap-5">
        {/* ── Nome ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="categoria-nome"
            className="flex items-center gap-1.5 text-sm font-semibold text-ink"
          >
            Nome
            <span className="text-xs font-medium text-ink-muted">(obrigatório)</span>
          </label>
          <input
            id="categoria-nome"
            name="nome"
            data-campo="nome"
            type="text"
            value={valores.nome ?? ""}
            disabled={ocupado}
            aria-invalid={invalido("nome") ? "true" : undefined}
            aria-describedby={invalido("nome") ? "categoria-nome-erro" : undefined}
            onChange={(e) => aoMudar?.("nome", e.target.value)}
            placeholder="Automação"
            className={cn(
              CLASSE_DE_CAMPO,
              ANEL_DE_FOCO,
              invalido("nome") ? "border-destructive" : "border-border-soft",
            )}
          />
          {/* A recusa fica SEMPRE montada e some pelo conteúdo: o alvo de
              `aria-describedby` que não existe é anunciado como nada. */}
          <p
            id="categoria-nome-erro"
            role={invalido("nome") ? "alert" : undefined}
            hidden={!invalido("nome")}
            className="text-xs font-medium text-destructive"
          >
            {campoRecusado === "nome" ? recusa.motivo : FRASES_DE_FALTA.nome}
          </p>
        </div>

        {/* ── Endereço ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="categoria-slug"
            className="text-sm font-semibold text-ink"
          >
            Endereço no site
          </label>
          <input
            id="categoria-slug"
            name="slug"
            data-campo="slug"
            type="text"
            value={valores.slug ?? ""}
            disabled={ocupado}
            aria-invalid={invalido("slug") ? "true" : undefined}
            aria-describedby={
              invalido("slug") ? "categoria-slug-erro" : "categoria-slug-ajuda"
            }
            onChange={(e) => aoMudar?.("slug", e.target.value)}
            placeholder="automacao"
            className={cn(
              CLASSE_DE_CAMPO,
              ANEL_DE_FOCO,
              "dado",
              invalido("slug") ? "border-destructive" : "border-border-soft",
            )}
          />
          <p
            id="categoria-slug-erro"
            role={invalido("slug") ? "alert" : undefined}
            hidden={!invalido("slug")}
            className="text-xs font-medium text-destructive"
          >
            {campoRecusado === "slug" ? recusa.motivo : FRASES_DE_FALTA.slug}
          </p>
          <p id="categoria-slug-ajuda" className="text-xs text-ink-muted">
            Gerado do nome quando você deixa em branco. Depois disso ele não muda
            sozinho.
          </p>
        </div>

        {/* ── Cor ──────────────────────────────────────────────────────────
            Vocabulário FECHADO, e cada opção se mostra pintada: escolher cor
            lendo o nome de um token não é escolher cor.

            E o grupo se OPERA como grupo de rádios: uma única parada de
            tabulação, setas percorrendo as opções. Doze botões tabuláveis com
            `role="radio"` anunciam um padrão que o teclado não cumpre — pior
            que não anunciar nada. */}
        <GrupoDeEscolha
          rotulo="Cor"
          campo="cor"
          nomeDoGrupo="Cor da categoria"
          opcoes={CORES_DE_CATEGORIA}
          escolhida={valores.cor}
          desabilitado={ocupado}
          aoEscolher={(cor) => aoMudar?.("cor", cor)}
          renderizar={(cor, escolhida) => {
            const aparencia = aparenciaDaCor(cor);
            return {
              rotulo: aparencia.rotulo,
              dados: { "data-cor": cor },
              estilo: { backgroundColor: aparencia.fundo, color: aparencia.tinta },
              classe: cn(
                "inline-flex size-10 items-center justify-center rounded-controle border-2",
                escolhida ? "border-brand-action" : "border-border-soft",
              ),
              /* A SIGLA VEM DO VOCABULÁRIO, e é única por cor. Ela era os dois
                 primeiros caracteres do rótulo — e "Ci" servia a Ciano E a
                 Cinza, então a marca que existe "para quem não distingue os
                 tons" não distinguia as duas. */
              conteudo: (
                <span aria-hidden="true" className="text-xs font-black">
                  {aparencia.sigla}
                </span>
              ),
            };
          }}
        />

        {/* ── Ícone ────────────────────────────────────────────────────── */}
        <GrupoDeEscolha
          rotulo="Ícone"
          campo="icone"
          nomeDoGrupo="Ícone da categoria"
          opcoes={CHAVES_DE_ICONE_DE_CATEGORIA}
          escolhida={valores.icone}
          desabilitado={ocupado}
          aoEscolher={(chave) => aoMudar?.("icone", chave)}
          renderizar={(chave, escolhido) => {
            const entrada = ICONES_DE_CATEGORIA[chave];
            const Icone = entrada?.desenho;
            return {
              /* O nome acessível é a PALAVRA DE INTERFACE, e não a chave: quem
                 ouve a tela recebia "faisca", "chip", "robo" — nome de código,
                 sem acento e sem sentido fora do fonte. */
              rotulo: entrada?.rotulo ?? chave,
              dados: { "data-icone": chave },
              classe: cn(
                CLASSE_DO_ALVO_DE_ACAO,
                escolhido && "border-brand-action bg-brand-wash text-brand-action",
              ),
              conteudo: Icone ? (
                <Icone aria-hidden="true" className="size-4" />
              ) : (
                chave
              ),
            };
          }}
        />

        {/* ── Ordem ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="categoria-ordem" className="text-sm font-semibold text-ink">
            Ordem no filtro
          </label>
          <input
            id="categoria-ordem"
            name="ordem"
            data-campo="ordem"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={valores.ordem ?? ""}
            disabled={ocupado}
            aria-invalid={invalido("ordem") ? "true" : undefined}
            aria-describedby={invalido("ordem") ? "categoria-ordem-erro" : undefined}
            onChange={(e) => aoMudar?.("ordem", e.target.value)}
            placeholder="1"
            className={cn(
              CLASSE_DE_CAMPO,
              ANEL_DE_FOCO,
              "dado",
              invalido("ordem") ? "border-destructive" : "border-border-soft",
            )}
          />
          <p
            id="categoria-ordem-erro"
            role={invalido("ordem") ? "alert" : undefined}
            hidden={!invalido("ordem")}
            className="text-xs font-medium text-destructive"
          >
            {campoRecusado === "ordem" ? recusa.motivo : ""}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          data-acao="salvar"
          disabled={ocupado}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2")}
        >
          {ocupado ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          {criando ? "Criar categoria" : "Salvar categoria"}
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
