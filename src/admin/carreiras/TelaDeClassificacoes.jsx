/**
 * A tela de Departamentos, Tipos e Níveis do Painel (Story 5.6).
 *
 * O molde é `admin/blog/TelaDeCategorias.jsx`, lido e nunca importado:
 * `admin/carreiras` e `admin/blog` não se importam (AD-15). E sem
 * `framer-motion`, que está fora da lista de permissão de `admin/carreiras`.
 *
 * ─── ELA NASCE DENTRO DO PORTÃO ─────────────────────────────────────────────
 *
 * A rota é filha de `/admin` em `main.jsx`, e o portão está no elemento do
 * pai: se este componente está renderizando, a sessão já foi verificada. A
 * volta é a aba Carreiras (`ENDERECO_DA_LISTAGEM`).
 *
 * ─── AS CLASSIFICAÇÕES SÃO DADO ─────────────────────────────────────────────
 *
 * A tela lê por `listarClassificacoesDoPainel` (chaveada por TABELA: a tela
 * itera `LISTAS_DE_CLASSIFICACAO` e lê `dados[lista.tabela]`) e escreve só por
 * `salvarClassificacao` e `excluirClassificacao`, pelos apelidos exatos que a
 * verificação troca por dublê. Depois de salvar ou excluir, a lista é RELIDA:
 * a contagem de uso e a ordem são do banco. O formulário de Vaga lê as
 * Classificações ao montar, então um item novo aparece lá sem recarregar.
 *
 * ─── O USO APARECE ANTES DE ALGUÉM TENTAR ───────────────────────────────────
 *
 * Cada item diz quantas Vagas o usam, e é esse número que decide se o alvo de
 * excluir está disponível. `null` (não deu para contar) nunca vira zero. O
 * bloqueio de verdade é a chave estrangeira `restrict`: a tela explica, o
 * banco garante.
 *
 * ─── REORDENAR É PELO CAMPO ORDEM ───────────────────────────────────────────
 *
 * Sem arrasto e sem botões de subir e descer: trocar a ordem de dois itens
 * seriam duas gravações não atômicas, e uma falha no meio deixaria ordens
 * repetidas. É o precedente das Categorias.
 *
 * ─── A REPETIÇÃO REPETE O PEDIDO, NÃO O FORMULÁRIO ──────────────────────────
 *
 * "Tentar de novo" na notificação reenvia o pedido CAPTURADO no momento da
 * falha (a lista, o id e o corpo), e nunca lê o formulário da hora do clique:
 * entre a falha e o clique a pessoa pode ter aberto outro item, e gravar o
 * formulário dele com o id do primeiro seria gravar a coisa errada no lugar
 * errado. A trava guarda o item da ação, e é dela que a região viva lê.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ChevronLeft, Loader2, Plus, SquarePen, Trash2 } from "lucide-react";

import {
  COMPLEMENTO_DA_AJUDA_DA_ORDEM,
  AJUDA_DO_NOME,
  DESCRICAO_DA_TELA,
  EXEMPLO_DA_ORDEM,
  FRASE_DA_ACAO_OCUPADA,
  FRASE_DO_ITEM_SEM_ID,
  MARCA_DE_OBRIGATORIO,
  OPCAO_SEM_EQUIVALENTE,
  RESERVA_DA_ACAO,
  RESERVA_DA_LEITURA,
  ROTULO_DA_COR,
  ROTULO_DA_ORDEM,
  ROTULO_DE_CANCELAR,
  ROTULO_DE_CONFIRMAR_EXCLUSAO_PADRAO,
  ROTULO_DE_NOVA_TENTATIVA,
  ROTULO_DE_VOLTAR,
  ROTULO_DO_EQUIVALENTE,
  ROTULO_DO_NOME,
  SITUACAO_CARREGANDO,
  SITUACAO_ERRO,
  SITUACAO_FORMULARIO,
  TEXTO_DE_EDITAR,
  TEXTO_DE_EXCLUIR,
  TEXTO_DO_CARREGAMENTO,
  TITULO_DA_TELA,
  TITULO_DO_ERRO,
  ausenciaNaExclusao,
  confirmacaoDaExclusao,
  confirmacaoDoSalvamento,
  corDoItem,
  corpoDaClassificacao,
  descricaoDaExclusao,
  falhaDaExclusao,
  falhaDoSalvamento,
  idDoItem,
  leituraLegivel,
  motivoDeNaoExcluir,
  nomeParaFrase,
  podeExcluir,
  rotuloDaPrimeira,
  rotuloDeConfirmarExclusao,
  rotuloDeEditar,
  rotuloDeEnviar,
  rotuloDeExcluir,
  rotuloDeNova,
  rotuloDoGrupoDeCor,
  situacaoDaTela,
  textoDaAcaoEmCurso,
  textoDaCorEscolhida,
  textoDaCorNaLinha,
  textoDaOrdem,
  textoDoEquivalente,
  textoDoEquivalenteNaLinha,
  textoDoUso,
  textoDoVazio,
  tituloDaExclusao,
  tituloDoFormulario,
  usoDaClassificacao,
  valoresDaClassificacao,
  valoresVazios,
} from "@/admin/carreiras/classificacoesDoPainel";
import { falhaPassageira, mensagemDaFalha } from "@/admin/carreiras/falhas";
import { ENDERECO_DA_LISTAGEM } from "@/admin/carreiras/rotas";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { listarClassificacoesDoPainel } from "@/data/carreiras/leitura";
import {
  ERRO_CONFLITO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_REDE,
  excluirClassificacao,
  salvarClassificacao,
} from "@/data/carreiras/escrita";
import {
  CORES_DE_CLASSIFICACAO,
  EQUIVALENTES_JOBPOSTING,
  FRASE_DA_ORDEM,
  LISTAS_DE_CLASSIFICACAO,
  aparenciaDaCorDeClassificacao,
  ehEquivalenteJobPosting,
  ehFraseDeNomeRepetido,
} from "@/domain/carreiras/classificacoes";
import {
  OPERACAO_EXCLUIR_CLASSIFICACAO,
  OPERACAO_SALVAR_CLASSIFICACAO,
} from "@/domain/carreiras/operacoes";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Quantas linhas fantasma o esqueleto desenha. */
const LINHAS_DO_ESQUELETO = 3;

/** As falhas que oferecem "Tentar de novo": as passageiras, e só elas. */
const TIPOS_PASSAGEIROS = Object.freeze([ERRO_REDE, ERRO_INESPERADO]);

/** O campo que recebe o foco quando o formulário abre. */
const ID_DO_CAMPO_NOME = "classificacao-nome";

/**
 * Um alvo de ação da linha: 40px, anel de foco e contorno PERMANENTE. Nada
 * condicionado a hover, nada nasce transparente nem escondido.
 */
const CLASSE_DO_ALVO_DE_ACAO = cn(
  ANEL_DE_FOCO,
  ALVO_DE_TOQUE,
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-controle px-3",
  "border border-border-strong bg-surface text-sm font-semibold text-ink-secondary",
  "disabled:pointer-events-none disabled:opacity-60",
  "aria-disabled:cursor-not-allowed aria-disabled:text-ink-muted",
);

const CLASSE_DE_CAMPO = "w-full rounded-controle border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted";

/** A escrita respondeu com sucesso? */
function deuCerto(resultado) {
  return resultado !== null && typeof resultado === "object" && resultado.ok === true;
}

/** A falha tipada de uma exceção, depois de registrada. */
function falhaDeExcecao(falha) {
  return { ok: false, erro: { tipo: ERRO_INESPERADO, mensagem: "", detalhe: String(falha) } };
}

/** O primeiro elemento de `raiz` que casa com `seletor` e com o atributo dado. */
function acharPorAtributo(raiz, seletor, atributo, valor) {
  if (!raiz || valor === null || valor === undefined) return null;
  return [...raiz.querySelectorAll(seletor)].find((el) => el.getAttribute(atributo) === valor) ?? null;
}

export default function TelaDeClassificacoes() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  /* `null` = as listas; `{ lista, original, sessao }` = o formulário
     (`original` nulo é criar). `sessao` diz QUAL abertura do formulário é
     esta: a resposta de um pedido só mexe no formulário que o enviou. */
  const [emEdicao, setEmEdicao] = useState(null);
  const [valores, setValores] = useState(null);
  const [recusa, setRecusa] = useState(null);
  const sessaoAtual = useRef(0);
  const vezDaRecusa = useRef(0);

  /* A trava é uma REFERÊNCIA: o segundo clique chega antes do redesenho. Ela
     é global, um pedido de cada vez na tela inteira, e GUARDA o item da ação
     (`{ id, operacao, lista, item }`): a região viva e o `aria-busy` leem
     dela, e não do formulário ou do diálogo, que podem já ser outros. */
  const trinco = useRef(null);
  const [emCurso, setEmCurso] = useState(null);
  const [paraExcluir, setParaExcluir] = useState(null);

  const montada = useRef(false);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  /* ── A leitura, com número de pedido ── */
  const ultimoPedido = useRef(0);
  const temDados = useRef(false);
  /* Há leitura em curso? O foco devolvido espera por ela: o alvo pode mudar
     (o "Criar o primeiro" some quando a seção deixa de estar vazia). */
  const lendo = useRef(false);

  useEffect(() => {
    ultimoPedido.current += 1;
    lendo.current = true;
    const pedido = ultimoPedido.current;
    /* Esqueleto só sem nada na tela (a primeira carga, ou depois de um erro).
       Com as listas à vista, a releitura troca os itens quando a resposta
       chega, sem piscar a tela inteira. */
    if (temDados.current) setAtualizando(true);
    else setCarregando(true);
    setErro(null);

    (async () => {
      let resultado;
      try {
        resultado = await listarClassificacoesDoPainel();
      } catch (falha) {
        /* A camada não lança; um dublê ou um defeito futuro podem. Esqueleto
           eterno nunca: vira erro, com "tentar de novo". */
        console.error("[Painel] A leitura das classificações lançou em vez de devolver erro tipado.", falha);
        resultado = falhaDeExcecao(falha);
      }
      if (ultimoPedido.current !== pedido) return;
      /* Cada tabela precisa vir como LISTA: uma que falte ou venha torta não
         vira seção vazia, vira o estado de erro. */
      if (!deuCerto(resultado) || !leituraLegivel(resultado.dados)) {
        /* ERRO NÃO É LISTA VAZIA, e os itens velhos saem junto. */
        temDados.current = false;
        setDados(null);
        setErro(deuCerto(resultado) ? { tipo: ERRO_INESPERADO, mensagem: "" } : (resultado?.erro ?? { tipo: null, mensagem: "" }));
      } else {
        temDados.current = true;
        setDados(resultado.dados);
        setErro(null);
      }
      setCarregando(false);
      setAtualizando(false);
      lendo.current = false;
    })();

    return () => {
      ultimoPedido.current += 1;
    };
  }, [tentativa]);

  const relerLista = useCallback(() => setTentativa((n) => n + 1), []);

  const abrirAcao = useCallback((trava) => {
    if (trinco.current !== null) return false;
    trinco.current = trava;
    setEmCurso(trava);
    return true;
  }, []);

  const fecharAcao = useCallback(() => {
    trinco.current = null;
    if (montada.current) setEmCurso(null);
  }, []);

  /* ── O foco: ao abrir, no Nome; ao fechar, de volta a quem abriu ── */
  const principal = useRef(null);
  const origemDoFormulario = useRef(null);
  const focoPendente = useRef(null);

  const recusar = useCallback((campo, motivo) => {
    vezDaRecusa.current += 1;
    setRecusa({ ok: false, campo, motivo, vez: vezDaRecusa.current });
  }, []);

  const abrirFormulario = useCallback((lista, original, acao) => {
    if (trinco.current !== null) return;
    sessaoAtual.current += 1;
    origemDoFormulario.current = { chave: lista.chave, id: original ? idDoItem(original) : null, acao };
    focoPendente.current = "nome";
    setEmEdicao({ lista, original: original ?? null, sessao: sessaoAtual.current });
    setValores(original ? valoresDaClassificacao(lista, original) : valoresVazios(lista));
    setRecusa(null);
  }, []);

  const fecharFormulario = useCallback(() => {
    sessaoAtual.current += 1;
    focoPendente.current = "origem";
    setEmEdicao(null);
    setValores(null);
    setRecusa(null);
  }, []);

  useEffect(() => {
    const pendente = focoPendente.current;
    const raiz = principal.current;
    if (pendente === null || !raiz) return;
    if (pendente === "nome") {
      const campo = raiz.querySelector(`#${ID_DO_CAMPO_NOME}`);
      if (!campo) return;
      focoPendente.current = null;
      campo.focus?.();
      return;
    }
    if (raiz.querySelector('form[data-papel="formulario"]') !== null || lendo.current) return;
    focoPendente.current = null;
    /* Quem abriu: o Editar do item, ou o "Novo" (ou "Criar o primeiro") da
       seção. Se ele sumiu (a seção deixou de estar vazia, o item saiu), o
       alvo previsível é o "Novo" da seção; sem ele, o próprio `<main>`. */
    const origem = origemDoFormulario.current;
    const secao = origem ? acharPorAtributo(raiz, "section[data-lista]", "data-lista", origem.chave) : null;
    const linha = origem?.id ? acharPorAtributo(raiz, "li[data-classificacao]", "data-classificacao", origem.id) : null;
    const candidatos = [
      linha?.querySelector('[data-acao="editar"]'),
      origem?.acao === "primeira" ? secao?.querySelector('[data-acao="primeira"]') : null,
      secao?.querySelector('[data-acao="nova"]'),
    ].filter((el) => el && !el.disabled);
    (candidatos[0] ?? raiz).focus?.();
  });

  /* ── Devolver o foco depois de o item sair ── */
  const devolverFoco = useCallback((chave) => {
    const agendar =
      typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    agendar(() => {
      const raiz = principal.current;
      if (!raiz) return;
      const secao = acharPorAtributo(raiz, "section[data-lista]", "data-lista", chave);
      const destino = secao?.querySelector('[data-acao="nova"]') ?? null;
      (destino ?? raiz).focus?.();
    });
  }, []);

  /**
   * A ação de resolver da notificação. A notificação vive mais que a tela:
   * sem a tela montada, "Tentar de novo" não faz nada.
   */
  const saidaQueRepete = (repetir) => ({
    rotulo: ROTULO_DE_NOVA_TENTATIVA,
    aoAcionar: () => {
      if (montada.current) repetir();
    },
  });

  /**
   * Envia UM pedido de gravação já montado (`{ lista, id, corpo, alvo,
   * sessao }`). É o mesmo caminho do formulário e do "Tentar de novo": a
   * repetição reenvia EXATAMENTE este pedido, capturado quando falhou.
   *
   * - Sucesso: notifica, fecha o formulário SE ele ainda é o que enviou, e
   *   relê a lista.
   * - Nome repetido (`conflito` com a frase de nome repetido): a frase vai ao
   *   campo nome, se o formulário ainda é o que enviou, e à notificação.
   *   Outro conflito fica só na notificação.
   * - `nao_encontrado`: o item já não existe; o formulário fecha e a lista é
   *   relida.
   * - `inesperado` numa CRIAÇÃO: o item pode ter sido criado sem confirmação
   *   (é o que o servidor diz). Repetir poderia criar outro: sem "Tentar de
   *   novo", a lista é relida para mostrar o que existe.
   * - `rede`, e `inesperado` numa edição (repetir pelo id é idempotente):
   *   "Tentar de novo".
   */
  const gravar = async (pedido, { repeticao = false } = {}) => {
    const { lista, id, corpo, alvo, sessao } = pedido;
    const criando = id === null;
    const repetir = () => gravar(pedido, { repeticao: true });
    if (!abrirAcao({ id, operacao: OPERACAO_SALVAR_CLASSIFICACAO, lista, item: alvo })) {
      /* Só a repetição chega aqui com a trava presa (o formulário fica
         desabilitado): ela avisa, e oferece a repetição de novo. */
      if (repeticao) notificarErro(falhaDoSalvamento(lista, alvo), FRASE_DA_ACAO_OCUPADA, saidaQueRepete(repetir));
      return;
    }

    let resultado;
    try {
      resultado = await salvarClassificacao(lista.chave, corpo, { id });
    } catch (falha) {
      console.error("[Painel] O salvamento da classificação lançou em vez de devolver erro tipado.", falha);
      resultado = falhaDeExcecao(falha);
    } finally {
      fecharAcao();
    }
    if (!montada.current) return;
    const noMesmoFormulario = sessaoAtual.current === sessao;

    if (!deuCerto(resultado)) {
      const falha = resultado?.erro ?? null;
      const tipo = falha?.tipo ?? null;
      const frase = mensagemDaFalha(falha, RESERVA_DA_ACAO);
      if (tipo === ERRO_CONFLITO && ehFraseDeNomeRepetido(lista, frase) && noMesmoFormulario) recusar("nome", frase);
      const talvezCriado = criando && tipo === ERRO_INESPERADO;
      const repetivel = falhaPassageira(falha, TIPOS_PASSAGEIROS) && !talvezCriado;
      notificarErro(falhaDoSalvamento(lista, alvo), frase, repetivel ? saidaQueRepete(repetir) : null);
      if (tipo === ERRO_NAO_ENCONTRADO || talvezCriado) {
        if (noMesmoFormulario) fecharFormulario();
        relerLista();
      }
      return;
    }
    const gravada = resultado.dados?.classificacao ?? alvo;
    notificarSucesso(confirmacaoDoSalvamento(lista, gravada, resultado.dados?.criada === true));
    if (noMesmoFormulario) fecharFormulario();
    relerLista();
  };

  /**
   * O envio do formulário. A recusa LOCAL (regras do domínio) não envia nada;
   * nada mudado fecha sem pedido; o resto vira UM pedido capturado.
   */
  const salvar = () => {
    if (emEdicao === null || valores === null || trinco.current !== null) return;
    const { lista, original, sessao } = emEdicao;

    const montado = corpoDaClassificacao(lista, valores, { original });
    if (!montado.ok) {
      recusar(montado.campo, montado.motivo);
      notificarErro(falhaDoSalvamento(lista, { nome: valores.nome }), montado.motivo);
      return;
    }
    setRecusa(null);
    if (montado.vazio) {
      /* Nada mudou: não há o que gravar, e o servidor responderia "nada para
         mudar". O formulário fecha como no Cancelar. */
      fecharFormulario();
      return;
    }
    const id = original === null ? null : idDoItem(original);
    if (original !== null && id === null) {
      /* Editar sem id seria CRIAR outro item: nada é enviado. */
      notificarErro(falhaDoSalvamento(lista, original), FRASE_DO_ITEM_SEM_ID);
      return;
    }
    const alvo = { ...(original ?? {}), nome: montado.corpo.nome ?? original?.nome ?? valores.nome };
    gravar({ lista, id, corpo: montado.corpo, alvo, sessao });
  };

  /**
   * Exclui o item, depois da confirmação que o nomeou. A recusa do servidor
   * (em uso por corrida) é notificada com a frase dele, e a lista é relida
   * para mostrar o uso de agora. O item que já não existia sai da lista (pela
   * releitura), e a notificação diz isso, sem "Tentar de novo". Falha
   * passageira não relê (a lista não mudou) e oferece "Tentar de novo", que
   * repete SEM reabrir o diálogo: a pessoa já confirmou, e o que falhou foi a
   * viagem.
   */
  const excluir = async (lista, item, { repeticao = false } = {}) => {
    const id = idDoItem(item);
    const fecharDialogoDoItem = () =>
      setParaExcluir((atual) => (atual !== null && idDoItem(atual.item) === id ? null : atual));
    if (id === null) {
      fecharDialogoDoItem();
      notificarErro(falhaDaExclusao(lista, item), FRASE_DO_ITEM_SEM_ID);
      return;
    }
    const repetir = () => excluir(lista, item, { repeticao: true });
    if (!abrirAcao({ id, operacao: OPERACAO_EXCLUIR_CLASSIFICACAO, lista, item })) {
      if (repeticao) notificarErro(falhaDaExclusao(lista, item), FRASE_DA_ACAO_OCUPADA, saidaQueRepete(repetir));
      return;
    }
    let resultado;
    try {
      resultado = await excluirClassificacao(lista.chave, id);
    } catch (falha) {
      console.error("[Painel] A exclusão da classificação lançou em vez de devolver erro tipado.", falha);
      resultado = falhaDeExcecao(falha);
    } finally {
      fecharAcao();
    }
    if (!montada.current) return;
    fecharDialogoDoItem();

    if (!deuCerto(resultado)) {
      const falha = resultado?.erro ?? null;
      const frase = mensagemDaFalha(falha, RESERVA_DA_ACAO);
      if (falha?.tipo === ERRO_NAO_ENCONTRADO) {
        notificarErro(ausenciaNaExclusao(lista, item), frase);
        relerLista();
        devolverFoco(lista.chave);
        return;
      }
      const passageira = falhaPassageira(falha, TIPOS_PASSAGEIROS);
      notificarErro(falhaDaExclusao(lista, item), frase, passageira ? saidaQueRepete(repetir) : null);
      if (!passageira) relerLista();
      return;
    }
    notificarSucesso(confirmacaoDaExclusao(lista, item));
    relerLista();
    devolverFoco(lista.chave);
  };

  /** O alvo de excluir indisponível DIZ o motivo, sem abrir diálogo. */
  const explicarIndisponivel = (lista, item) => {
    const motivo = motivoDeNaoExcluir(lista, item);
    if (motivo === null) return;
    notificarErro(motivo.oQueHouve, motivo.oQueFazer);
  };

  const situacao = situacaoDaTela({ editando: emEdicao !== null, carregando, erro });

  let conteudo = null;
  if (situacao === SITUACAO_CARREGANDO) {
    conteudo = (
      <div className="flex flex-col gap-3" data-papel="esqueleto">
        <p role="status" className="sr-only">
          {TEXTO_DO_CARREGAMENTO}
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
    );
  } else if (situacao === SITUACAO_ERRO) {
    conteudo = (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-cartao border border-destructive-ink/70 bg-destructive-ink/10 p-6 text-center"
      >
        <AlertCircle aria-hidden="true" className="mx-auto size-8 text-destructive-ink" />
        <h2 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_ERRO}</h2>
        <p className="mt-2 text-sm text-ink-secondary" data-papel="motivo-do-erro">
          {mensagemDaFalha(erro, RESERVA_DA_LEITURA)}
        </p>
        <Button
          type="button"
          variant="outline"
          data-acao="repetir"
          onClick={relerLista}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
        >
          {ROTULO_DE_NOVA_TENTATIVA}
        </Button>
      </div>
    );
  } else if (situacao === SITUACAO_FORMULARIO) {
    conteudo = (
      <Formulario
        lista={emEdicao.lista}
        original={emEdicao.original}
        valores={valores}
        aoMudar={(campo, valor) => {
          setValores((atuais) => ({ ...atuais, [campo]: valor }));
          setRecusa((atual) => (atual?.campo === campo ? null : atual));
        }}
        recusa={recusa}
        ocupado={emCurso !== null}
        aoSalvar={salvar}
        aoCancelar={fecharFormulario}
      />
    );
  } else {
    conteudo = (
      <div
        className="flex flex-col gap-8"
        data-papel="listas"
        data-atualizando={atualizando ? "true" : undefined}
        aria-busy={atualizando ? "true" : undefined}
      >
        {LISTAS_DE_CLASSIFICACAO.map((lista) => (
          <Secao
            key={lista.chave}
            lista={lista}
            itens={Array.isArray(dados?.[lista.tabela]) ? dados[lista.tabela] : []}
            emCurso={emCurso}
            atualizando={atualizando}
            aoCriar={(acao) => abrirFormulario(lista, null, acao)}
            aoEditar={(item) => abrirFormulario(lista, item, "editar")}
            aoPedirExclusao={(item) => {
              if (trinco.current === null) setParaExcluir({ lista, item });
            }}
            aoExplicarIndisponivel={(item) => explicarIndisponivel(lista, item)}
          />
        ))}
      </div>
    );
  }

  const excluindoNoDialogo =
    paraExcluir !== null &&
    emCurso !== null &&
    emCurso.operacao === OPERACAO_EXCLUIR_CLASSIFICACAO &&
    emCurso.id === idDoItem(paraExcluir.item);

  return (
    <div className="painel min-h-screen bg-background" data-tela="classificacoes">
      <header className="border-b border-border-soft bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-6 py-4">
          <Link
            to={ENDERECO_DA_LISTAGEM}
            data-acao="voltar"
            className={cn(
              ANEL_DE_FOCO,
              ALVO_DE_TOQUE,
              "inline-flex items-center gap-1.5 rounded-controle border border-border-strong px-3 py-1",
              "text-sm font-medium text-ink-secondary",
            )}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {ROTULO_DE_VOLTAR}
          </Link>
        </div>
      </header>

      <main
        ref={principal}
        tabIndex={-1}
        className="mx-auto max-w-4xl px-6 py-8 outline-hidden"
        data-estado-da-lista={situacao}
        aria-busy={emCurso !== null ? "true" : undefined}
      >
        <h1 className="text-2xl font-black text-ink">{TITULO_DA_TELA}</h1>
        <p className="mt-2 text-sm text-ink-secondary">{DESCRICAO_DA_TELA}</p>

        <div className="mt-6">{conteudo}</div>

        {/* O que está acontecendo, para quem ouve a tela: lido da TRAVA. */}
        <p role="status" aria-live="polite" className="sr-only" data-papel="acao-em-curso">
          {emCurso === null ? "" : textoDaAcaoEmCurso(emCurso.lista, emCurso.item, emCurso.operacao)}
        </p>
      </main>

      {/* UM diálogo, SEMPRE montado e controlado por `aberto`, que nomeia o
          item; o rótulo diz o que o botão faz. */}
      <DialogoDeConfirmacao
        aberto={paraExcluir !== null}
        aoMudarAbertura={(aberto) => {
          if (!aberto && trinco.current === null) setParaExcluir(null);
        }}
        titulo={paraExcluir === null ? "" : tituloDaExclusao(paraExcluir.lista, paraExcluir.item)}
        descricao={paraExcluir === null ? "" : descricaoDaExclusao(paraExcluir.lista)}
        rotuloDeConfirmacao={
          paraExcluir === null ? ROTULO_DE_CONFIRMAR_EXCLUSAO_PADRAO : rotuloDeConfirmarExclusao(paraExcluir.lista)
        }
        ocupado={excluindoNoDialogo ? textoDaAcaoEmCurso(emCurso.lista, emCurso.item, emCurso.operacao) : ""}
        aoConfirmar={() => {
          if (paraExcluir !== null) excluir(paraExcluir.lista, paraExcluir.item);
        }}
      />
    </div>
  );
}

/** Uma lista: o título, o botão de criar, os itens ou a chamada do vazio. */
function Secao({ lista, itens, emCurso, atualizando, aoCriar, aoEditar, aoPedirExclusao, aoExplicarIndisponivel }) {
  const ocupado = emCurso !== null;
  const idDoTitulo = `classificacoes-${lista.chave}`;
  return (
    <section data-lista={lista.chave} aria-labelledby={idDoTitulo} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={idDoTitulo} className="text-lg font-bold text-ink">
          {lista.plural}
        </h2>
        <div className="flex-1" />
        <Button
          type="button"
          data-acao="nova"
          disabled={ocupado}
          onClick={() => aoCriar?.("nova")}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2")}
        >
          <Plus aria-hidden="true" className="size-4" />
          {rotuloDeNova(lista)}
        </Button>
      </div>

      {itens.length === 0 ? (
        <div data-papel="vazio" className="rounded-cartao border border-border-soft bg-surface p-6 text-center">
          <p className="text-sm text-ink-secondary">{textoDoVazio(lista)}</p>
          <Button
            type="button"
            variant="outline"
            data-acao="primeira"
            disabled={ocupado}
            onClick={() => aoCriar?.("primeira")}
            className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
          >
            {rotuloDaPrimeira(lista)}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((item, indice) => {
            const id = idDoItem(item);
            return (
              <Linha
                key={id ?? `sem-id-${indice}`}
                lista={lista}
                item={item}
                excluindo={id !== null && emCurso?.id === id && emCurso?.operacao === OPERACAO_EXCLUIR_CLASSIFICACAO}
                ocupado={ocupado}
                atualizando={atualizando}
                aoEditar={() => aoEditar?.(item)}
                aoPedirExclusao={() => aoPedirExclusao?.(item)}
                aoExplicarIndisponivel={() => aoExplicarIndisponivel?.(item)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Um item: o nome por extenso, a Cor com o NOME da cor em texto (a cor nunca
 * é o único portador), o Equivalente legível, a Ordem, o uso e as ações.
 * Durante a releitura, o alvo de excluir fica indisponível: o uso à vista
 * pode estar velho.
 */
function Linha({ lista, item, excluindo, ocupado, atualizando, aoEditar, aoPedirExclusao, aoExplicarIndisponivel }) {
  const liberada = podeExcluir(item);
  const uso = usoDaClassificacao(item);
  const cor = lista.temCor ? corDoItem(item) : null;
  const nome = nomeParaFrase(item);
  return (
    <li
      data-classificacao={idDoItem(item) ?? undefined}
      data-lista={lista.chave}
      className="flex flex-wrap items-center gap-4 rounded-cartao border border-border-soft bg-surface p-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span
          data-papel="nome"
          title={nome}
          className={cn(
            "max-w-full self-start truncate text-sm font-bold text-ink",
            cor !== null && "rounded-pilula px-2 py-0.5",
          )}
          style={cor !== null ? { backgroundColor: cor.fundo, color: cor.tinta } : undefined}
        >
          {nome}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {cor !== null ? (
            <span data-papel="cor" data-cor={typeof item.cor === "string" ? item.cor : ""}>
              {textoDaCorNaLinha(item)}
            </span>
          ) : null}
          {lista.temEquivalente ? <span data-papel="equivalente">{textoDoEquivalenteNaLinha(item)}</span> : null}
          <span data-papel="ordem" className="dado">
            {textoDaOrdem(item)}
          </span>
        </div>
      </div>

      <span
        data-papel="uso"
        data-uso={uso === null ? "desconhecido" : String(uso)}
        className="dado shrink-0 text-xs text-ink-secondary"
      >
        {textoDoUso(item)}
      </span>

      <div data-papel="acoes" className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          data-acao="editar"
          aria-label={rotuloDeEditar(lista, item)}
          disabled={ocupado}
          onClick={() => aoEditar?.()}
          className={CLASSE_DO_ALVO_DE_ACAO}
        >
          <SquarePen aria-hidden="true" className="size-4" />
          {TEXTO_DE_EDITAR}
        </button>

        {liberada ? (
          <button
            type="button"
            data-acao="excluir"
            aria-label={rotuloDeExcluir(lista, item)}
            aria-busy={excluindo ? "true" : undefined}
            disabled={ocupado || atualizando}
            onClick={() => aoPedirExclusao?.()}
            className={CLASSE_DO_ALVO_DE_ACAO}
          >
            {excluindo ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Trash2 aria-hidden="true" className="size-4" />
            )}
            {TEXTO_DE_EXCLUIR}
          </button>
        ) : (
          /* `aria-disabled`, e não `disabled`: o alvo continua alcançável pelo
             teclado e DIZ o motivo, sem abrir diálogo. */
          <button
            type="button"
            data-acao="excluir"
            data-indisponivel="true"
            aria-disabled="true"
            aria-label={rotuloDeExcluir(lista, item)}
            onClick={() => aoExplicarIndisponivel?.()}
            className={CLASSE_DO_ALVO_DE_ACAO}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {TEXTO_DE_EXCLUIR}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Um grupo de escolha única, o padrão de rádios cumprido: UMA parada de
 * tabulação para o grupo (a opção marcada, ou a primeira), setas que percorrem
 * e escolhem (com volta nas pontas), Home e End. Reescrito do molde das
 * Categorias, sem importá-lo. `idDaDescricao` aponta a frase que diz a
 * escolha por extenso.
 */
function GrupoDeEscolha({
  rotulo,
  campo,
  nomeDoGrupo,
  opcoes,
  escolhida,
  desabilitado,
  invalido,
  idDoErro,
  idDaDescricao,
  aoEscolher,
  renderizar,
}) {
  const referencias = useRef([]);
  const posicaoMarcada = Math.max(0, opcoes.indexOf(escolhida));

  const irPara = (indice) => {
    const destino = (indice + opcoes.length) % opcoes.length;
    aoEscolher?.(opcoes[destino]);
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

  const descritores = [invalido ? idDoErro : null, idDaDescricao ?? null].filter(Boolean).join(" ");

  return (
    <fieldset data-campo={campo} className="flex flex-col gap-1.5">
      <legend className="text-sm font-semibold text-ink">{rotulo}</legend>
      <div
        role="radiogroup"
        aria-label={nomeDoGrupo}
        aria-invalid={invalido ? "true" : undefined}
        aria-describedby={descritores === "" ? undefined : descritores}
        className="flex flex-wrap gap-2"
      >
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
 * A frase de recusa de um campo. A região é SEMPRE montada, com
 * `role="alert"` desde o começo (uma região que nasce junto com o texto nem
 * sempre é anunciada), e o texto entra com a chave `vez`: a mesma recusa
 * repetida troca o nó, e é anunciada de novo.
 */
function ErroDoCampo({ id, campo, visivel, texto, vez }) {
  return (
    <p id={id} data-erro-do-campo={campo} role="alert" className="text-xs font-medium text-destructive">
      {visivel ? <span key={vez ?? 0}>{texto}</span> : null}
    </p>
  );
}

/**
 * O formulário de criar e de editar, o mesmo, porque a operação é a mesma.
 * Nome, Cor (listas com Cor), Equivalente (o Tipo, obrigatório) e Ordem.
 */
function Formulario({ lista, original, valores, aoMudar, recusa, ocupado, aoSalvar, aoCancelar }) {
  const criando = original === null || original === undefined;
  const campoRecusado = recusa?.campo ?? "";
  const invalido = (campo) => campoRecusado === campo;
  const equivalente = valores?.equivalente_jobposting ?? "";
  const equivalenteLegado = equivalente !== "" && !ehEquivalenteJobPosting(equivalente) ? equivalente : null;

  return (
    <form
      data-papel="formulario"
      data-lista={lista.chave}
      noValidate
      className="mx-auto max-w-xl rounded-cartao border border-border-soft bg-surface p-6"
      onSubmit={(evento) => {
        evento.preventDefault();
        aoSalvar?.();
      }}
    >
      <h2 className="text-base font-semibold text-ink">{tituloDoFormulario(lista, criando)}</h2>

      <div className="mt-5 flex flex-col gap-5">
        {/* ── Nome ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ID_DO_CAMPO_NOME} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            {ROTULO_DO_NOME}
            <span className="text-xs font-medium text-ink-muted">{AJUDA_DO_NOME}</span>
          </label>
          <input
            id={ID_DO_CAMPO_NOME}
            name="nome"
            data-campo="nome"
            type="text"
            value={valores?.nome ?? ""}
            disabled={ocupado}
            aria-invalid={invalido("nome") ? "true" : undefined}
            aria-describedby={invalido("nome") ? "classificacao-nome-erro" : undefined}
            onChange={(e) => aoMudar?.("nome", e.target.value)}
            className={cn(CLASSE_DE_CAMPO, ANEL_DE_FOCO, invalido("nome") ? "border-destructive" : "border-border-soft")}
          />
          <ErroDoCampo
            id="classificacao-nome-erro"
            campo="nome"
            visivel={invalido("nome")}
            texto={recusa?.motivo}
            vez={recusa?.vez}
          />
        </div>

        {/* ── Cor: a paleta fechada, cada opção pintada por `style`, com a
            sigla e o nome acessível; a escolhida também por extenso, e é
            ela que descreve o grupo. ── */}
        {lista.temCor ? (
          <div className="flex flex-col gap-1.5">
            <GrupoDeEscolha
              rotulo={ROTULO_DA_COR}
              campo="cor"
              nomeDoGrupo={rotuloDoGrupoDeCor(lista)}
              opcoes={CORES_DE_CLASSIFICACAO}
              escolhida={valores?.cor ?? ""}
              desabilitado={ocupado}
              invalido={invalido("cor")}
              idDoErro="classificacao-cor-erro"
              idDaDescricao="classificacao-cor-escolhida"
              aoEscolher={(cor) => aoMudar?.("cor", cor)}
              renderizar={(cor, marcada) => {
                const aparencia = aparenciaDaCorDeClassificacao(cor);
                return {
                  rotulo: aparencia.rotulo,
                  dados: { "data-cor": cor },
                  estilo: { backgroundColor: aparencia.fundo, color: aparencia.tinta },
                  classe: cn(
                    "inline-flex size-10 items-center justify-center rounded-controle border-2",
                    marcada ? "border-brand-action" : "border-border-soft",
                  ),
                  conteudo: (
                    <span aria-hidden="true" className="text-xs font-black">
                      {aparencia.sigla}
                    </span>
                  ),
                };
              }}
            />
            <p id="classificacao-cor-escolhida" className="text-xs text-ink-muted" data-papel="cor-escolhida">
              {textoDaCorEscolhida(valores?.cor)}
            </p>
            <ErroDoCampo
              id="classificacao-cor-erro"
              campo="cor"
              visivel={invalido("cor")}
              texto={recusa?.motivo}
              vez={recusa?.vez}
            />
          </div>
        ) : null}

        {/* ── Equivalente JobPosting: lista fechada, com os rótulos legíveis ── */}
        {lista.temEquivalente ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="classificacao-equivalente"
              className="flex items-center gap-1.5 text-sm font-semibold text-ink"
            >
              {ROTULO_DO_EQUIVALENTE}
              <span className="text-xs font-medium text-ink-muted">{MARCA_DE_OBRIGATORIO}</span>
            </label>
            <select
              id="classificacao-equivalente"
              name="equivalente_jobposting"
              data-campo="equivalente_jobposting"
              value={equivalente}
              disabled={ocupado}
              aria-invalid={invalido("equivalente_jobposting") ? "true" : undefined}
              aria-describedby={invalido("equivalente_jobposting") ? "classificacao-equivalente-erro" : undefined}
              onChange={(e) => aoMudar?.("equivalente_jobposting", e.target.value)}
              className={cn(
                CLASSE_DE_CAMPO,
                ANEL_DE_FOCO,
                invalido("equivalente_jobposting") ? "border-destructive" : "border-border-soft",
              )}
            >
              <option value="">{OPCAO_SEM_EQUIVALENTE}</option>
              {equivalenteLegado !== null ? (
                <option value={equivalenteLegado}>{textoDoEquivalente(equivalenteLegado)}</option>
              ) : null}
              {EQUIVALENTES_JOBPOSTING.map((codigo) => (
                <option key={codigo} value={codigo}>
                  {textoDoEquivalente(codigo)}
                </option>
              ))}
            </select>
            <ErroDoCampo
              id="classificacao-equivalente-erro"
              campo="equivalente_jobposting"
              visivel={invalido("equivalente_jobposting")}
              texto={recusa?.motivo}
              vez={recusa?.vez}
            />
          </div>
        ) : null}

        {/* ── Ordem: é por ela que se reordena ── */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="classificacao-ordem" className="text-sm font-semibold text-ink">
            {ROTULO_DA_ORDEM}
          </label>
          <input
            id="classificacao-ordem"
            name="ordem"
            data-campo="ordem"
            type="text"
            inputMode="numeric"
            value={valores?.ordem ?? ""}
            disabled={ocupado}
            aria-invalid={invalido("ordem") ? "true" : undefined}
            aria-describedby={invalido("ordem") ? "classificacao-ordem-erro" : "classificacao-ordem-ajuda"}
            onChange={(e) => aoMudar?.("ordem", e.target.value)}
            placeholder={EXEMPLO_DA_ORDEM}
            className={cn(
              CLASSE_DE_CAMPO,
              ANEL_DE_FOCO,
              "dado",
              invalido("ordem") ? "border-destructive" : "border-border-soft",
            )}
          />
          <ErroDoCampo
            id="classificacao-ordem-erro"
            campo="ordem"
            visivel={invalido("ordem")}
            texto={recusa?.motivo}
            vez={recusa?.vez}
          />
          <p id="classificacao-ordem-ajuda" className="text-xs text-ink-muted">
            {`${FRASE_DA_ORDEM} ${COMPLEMENTO_DA_AJUDA_DA_ORDEM}`}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          data-acao="salvar"
          disabled={ocupado}
          aria-busy={ocupado ? "true" : undefined}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2")}
        >
          {ocupado ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {rotuloDeEnviar(lista, criando)}
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
