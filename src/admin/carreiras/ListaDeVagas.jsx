/**
 * A listagem de Vagas do Painel (Story 5.5), lendo do banco.
 *
 * O molde é `admin/blog/ListaDePosts.jsx`, lido e nunca importado:
 * `admin/carreiras` e `admin/blog` não se importam (AD-15).
 *
 * ─── CINCO TELAS, E QUATRO DELAS NÃO TÊM LINHA NENHUMA ──────────────────────
 *
 * Carregando (esqueleto), erro (com "tentar de novo"), vazio de busca (com
 * "limpar busca"), vazio inicial (com Nova Vaga) e a lista. Quem escolhe entre
 * elas é `situacaoDaLista`, e cada uma sai com `data-estado-da-lista`. A falha
 * de QUALQUER das duas leituras (as Vagas e as Classificações) é erro, nunca
 * vazio.
 *
 * ─── A BUSCA ACONTECE NO BANCO ──────────────────────────────────────────────
 *
 * O termo e o Estado chegam por propriedade JÁ APLICADOS (a espera da
 * digitação é da aba, dona do campo) e viajam como argumento de
 * `listarVagasDoPainel`; quem tira acento e caixa é o Postgres. Toda resposta
 * carrega o número do pedido: a que chega tarde é descartada. Com linhas na
 * tela, uma busca nova não pisca o esqueleto por cima delas.
 *
 * ─── AS AÇÕES RESOLVEM NA LINHA ─────────────────────────────────────────────
 *
 * As da tabela do domínio para o Estado da linha, mais Editar e Ver no site,
 * sempre à vista (nada condicionado a hover), alcançáveis por teclado. Um
 * pedido de cada vez na lista inteira: a trava é uma referência (o segundo
 * clique chega antes do redesenho), e os alvos que escrevem desabilitam em
 * TODAS as linhas enquanto ela está presa. Depois de mudar o Estado, a linha
 * passa a mostrar a Vaga que o SERVIDOR devolveu (ou sai, se o Estado novo
 * está fora do filtro); depois de excluir, a linha sai e o foco volta a um
 * lugar previsível. Uma escrita que mexeu na lista invalida a leitura que
 * ainda estava em voo, e a lista é relida: a resposta atrasada, pedida antes
 * da escrita, não ressuscita nem desfaz a linha.
 *
 * ─── A TELA NÃO ESCREVE NO BANCO ────────────────────────────────────────────
 *
 * A escrita passa só por `@/data/carreiras/escrita`, e a leitura só por
 * `@/data/carreiras/leitura`, pelos apelidos exatos que a verificação troca
 * por dublê.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Briefcase,
  ExternalLink,
  Loader2,
  SearchX,
  SquarePen,
  Trash2,
} from "lucide-react";

import {
  DESCRICAO_DA_VAGA_INEXISTENTE,
  DESCRICAO_DO_VAZIO,
  FALHA_DA_EXCLUSAO,
  FALHA_DA_MUDANCA_DE_ESTADO,
  RESERVA_DA_ACAO,
  RESERVA_DA_LEITURA,
  ROTULO_DA_NOVA_VAGA,
  ROTULO_DE_CONFIRMAR_EXCLUSAO,
  ROTULO_DE_LIMPAR_BUSCA,
  ROTULO_DE_NOVA_TENTATIVA,
  TEXTO_DO_CARREGAMENTO,
  TIPO_EDITAR,
  TIPO_ESTADO,
  TIPO_EXCLUIR,
  TIPO_VER,
  TITULO_DA_VAGA_INEXISTENTE,
  TITULO_DO_ERRO,
  TITULO_DO_VAZIO,
  TITULO_DO_VAZIO_DE_BUSCA,
  combinarLeituras,
  descricaoDaExclusao,
  descricaoDoVazioDeBusca,
  haBuscaAtiva,
  linhaDaVaga,
  pedidoDeBusca,
  rotuloAcessivelDaAcao,
  situacaoDaLista,
  textoDaAcaoEmCurso,
  tituloDaExclusao,
} from "@/admin/carreiras/listagem";
import { falhaPassageira, mensagemDaFalha } from "@/admin/carreiras/falhas";
import { ENDERECO_DA_VAGA_NOVA } from "@/admin/carreiras/rotas";
import PilulaDeEstado from "@/admin/comum/PilulaDeEstado";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { exigir } from "@/admin/shell/voz";
import { listarClassificacoesDoPainel, listarVagasDoPainel } from "@/data/carreiras/leitura";
import {
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_REDE,
  excluirVaga,
  mudarEstadoDaVaga,
} from "@/data/carreiras/escrita";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Quantas linhas fantasma o esqueleto desenha. */
const LINHAS_DO_ESQUELETO = 3;

/** As falhas que oferecem "Tentar de novo": as passageiras, e só elas. */
const TIPOS_PASSAGEIROS = Object.freeze([ERRO_REDE, ERRO_INESPERADO]);

/**
 * A aparência de um alvo de ação da linha: contorno PERMANENTE, alvo de toque
 * de 40px e anel de foco. Nada condicionado a hover, nada nasce transparente.
 */
const CLASSE_DO_ALVO_DE_ACAO = cn(
  ANEL_DE_FOCO,
  ALVO_DE_TOQUE,
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-controle px-3",
  "border border-border-strong bg-surface text-sm font-semibold text-ink-secondary",
  "transition-colors hover:bg-surface-sunk hover:text-ink",
  "disabled:pointer-events-none disabled:opacity-60",
);

/** A escrita respondeu com sucesso? */
function deuCerto(resultado) {
  return resultado !== null && typeof resultado === "object" && resultado.ok === true;
}

export default function ListaDeVagas({ termo = "", estado = null, aoContar, aoLimparBusca }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [vagas, setVagas] = useState([]);
  const [indice, setIndice] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  /* O pedido que está valendo. O termo já chega aplicado (a espera da
     digitação é da aba), e o Estado fora do vocabulário vira "sem filtro". */
  const busca = pedidoDeBusca({ termo, estado });
  const buscando = haBuscaAtiva(busca);

  /* `aoContar` por referência, fora das dependências do efeito: uma função
     recriada a cada renderização faria a lista recarregar em laço. */
  const contar = useRef(aoContar);
  useEffect(() => {
    contar.current = aoContar;
  }, [aoContar]);

  /* O recorte em vigor, lido pelas ações DEPOIS do `await`: o filtro pode ter
     mudado enquanto a escrita viajava, e o que vale é o de agora. */
  const recorte = useRef(busca);
  useEffect(() => {
    recorte.current = busca;
  });

  const montada = useRef(false);
  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  /* O total CONHECIDO de Vagas (sem recorte), que é o que a aba mostra. */
  const totalConhecido = useRef(null);

  /* ── O pedido em curso: cada leitura leva um número ──
     `leituraEmVoo` diz se há uma resposta que ainda vai chegar: é ela que uma
     escrita bem-sucedida precisa invalidar. */
  const ultimoPedido = useRef(0);
  const leituraEmVoo = useRef(false);

  useEffect(() => {
    ultimoPedido.current += 1;
    const pedido = ultimoPedido.current;
    leituraEmVoo.current = true;

    /* Esqueleto só quando não há o que preservar na tela (a primeira carga, ou
       depois de um erro). Com linhas à vista, a busca nova troca as linhas
       quando a resposta chega, sem piscar a tela inteira. */
    const semNadaNaTela = vagas.length === 0 || erro !== null;
    if (semNadaNaTela) setCarregando(true);
    else setAtualizando(true);
    setErro(null);

    const pedida = pedidoDeBusca({ termo: busca.termo, estado: busca.estado });

    (async () => {
      let lidas = null;
      let classificacoes = null;
      try {
        [lidas, classificacoes] = await Promise.all([
          listarVagasDoPainel({ termo: pedida.termo, estado: pedida.estado }),
          listarClassificacoesDoPainel(),
        ]);
      } catch (falha) {
        /* A camada não lança; um dublê ou um defeito futuro podem. Esqueleto
           eterno nunca: vira erro, com "tentar de novo", e o motivo fica no
           console para quem investiga. */
        console.error("[Painel] A leitura da lista de vagas lançou em vez de devolver erro tipado.", falha);
        lidas = { ok: false, erro: { tipo: ERRO_INESPERADO, mensagem: "", detalhe: String(falha) } };
      }
      if (ultimoPedido.current !== pedido) return;
      leituraEmVoo.current = false;

      const combinado = combinarLeituras(lidas, classificacoes);
      const recortada = haBuscaAtiva(pedida);
      if (!combinado.ok) {
        /* ERRO NÃO É VAZIO, e as linhas velhas saem junto: embaixo de uma
           mensagem de falha elas diriam que ainda valem. */
        setVagas([]);
        setIndice(null);
        setErro(combinado.erro);
        setCarregando(false);
        setAtualizando(false);
        if (!recortada) contar.current?.(null);
        return;
      }
      setVagas(combinado.vagas);
      setIndice(combinado.indice);
      setErro(null);
      setCarregando(false);
      setAtualizando(false);
      /* A contagem da aba é quantas Vagas EXISTEM, não quantas sobraram do
         recorte: só sem busca ativa ela é anunciada. */
      if (!recortada) {
        totalConhecido.current = combinado.vagas.length;
        contar.current?.(combinado.vagas.length);
      }
    })();

    return () => {
      ultimoPedido.current += 1;
    };
    /* `vagas.length` e `erro` só DECIDEM se este ciclo mostra esqueleto; não
       disparam o efeito de novo. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tentativa, busca.termo, busca.estado]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  /**
   * Uma escrita bem-sucedida mexeu na lista: a leitura que ainda estava em voo
   * foi pedida ANTES dela, e a resposta, quando chegar, traria a linha como
   * era (a excluída de volta, o Estado antigo). O número do pedido avança, a
   * resposta atrasada é descartada, e a lista é relida, agora depois da
   * escrita. Sem leitura em voo não há o que invalidar, e não se relê nada.
   */
  const invalidarLeituraEmVoo = useCallback(() => {
    if (!leituraEmVoo.current) return;
    ultimoPedido.current += 1;
    leituraEmVoo.current = false;
    setTentativa((n) => n + 1);
  }, []);

  /* ── A trava global de ação ── */
  const trinco = useRef(null);
  const [emCurso, setEmCurso] = useState(null);
  const [paraExcluir, setParaExcluir] = useState(null);

  const abrirAcao = useCallback((vaga, chave) => {
    if (trinco.current !== null) return false;
    trinco.current = { id: vaga.id, chave };
    setEmCurso(trinco.current);
    return true;
  }, []);

  const fecharAcao = useCallback(() => {
    trinco.current = null;
    if (montada.current) setEmCurso(null);
  }, []);

  /** A Vaga deixou de EXISTIR: sai da lista, e o total conhecido desce. */
  const removerDaLista = useCallback((id) => {
    setVagas((atuais) => atuais.filter((v) => v.id !== id));
    if (typeof totalConhecido.current === "number") {
      totalConhecido.current = Math.max(0, totalConhecido.current - 1);
      contar.current?.(totalConhecido.current);
    }
  }, []);

  /**
   * A Vaga continua existindo, mas saiu do RECORTE (o Estado novo está fora do
   * filtro): sai da lista, e o total, que conta quantas existem, não muda.
   */
  const tirarDoRecorte = useCallback((id) => {
    setVagas((atuais) => atuais.filter((v) => v.id !== id));
  }, []);

  /* ── Devolver o foco depois de a linha sair ──
     A região da lista existe em TODAS as telas; o destino é o primeiro Editar
     que sobrou, ou a própria região. */
  const regiao = useRef(null);
  const devolverFoco = useCallback(() => {
    const agendar =
      typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    agendar(() => {
      const raiz = regiao.current;
      if (!raiz) return;
      const primeiro = raiz.querySelector('[data-acao="editar"]');
      (primeiro ?? raiz).focus?.();
    });
  }, []);

  /**
   * A ação de resolver da notificação, quando a falha é passageira. A
   * notificação vive mais que a aba: quem sai da aba e aperta "Tentar de novo"
   * depois não dispara escrita nenhuma numa lista que já não está na tela.
   */
  const saidaDa = (falha, repetir) =>
    falhaPassageira(falha, TIPOS_PASSAGEIROS)
      ? {
          rotulo: ROTULO_DE_NOVA_TENTATIVA,
          aoAcionar: () => {
            if (montada.current) repetir();
          },
        }
      : null;

  /**
   * Abre, encerra ou reabre a Vaga pela função de servidor. A linha passa a
   * refletir a Vaga DEVOLVIDA, ou sai, se o Estado novo está fora do filtro;
   * na recusa, a linha fica como estava e a notificação traz a frase do
   * servidor. Vaga que já não existe sai da lista.
   */
  const mudarEstado = async (vaga, acao) => {
    if (!abrirAcao(vaga, acao.chave)) return;
    let resultado;
    try {
      resultado = await mudarEstadoDaVaga(vaga.id, acao.chave);
    } catch (falha) {
      console.error("[Painel] A mudança de Estado da vaga lançou em vez de devolver erro tipado.", falha);
      resultado = { ok: false, erro: { tipo: ERRO_INESPERADO, mensagem: "", detalhe: String(falha) } };
    } finally {
      fecharAcao();
    }
    if (!montada.current) return;

    if (!deuCerto(resultado)) {
      const falha = resultado?.erro ?? null;
      if (falha?.tipo === ERRO_NAO_ENCONTRADO) {
        /* A linha mostrava o que o banco não tem: ela sai, e a frase diz isso,
           sem "a lista continua como estava" e sem "Tentar de novo". */
        invalidarLeituraEmVoo();
        removerDaLista(vaga.id);
        devolverFoco();
        notificarErro(FALHA_DA_MUDANCA_DE_ESTADO, DESCRICAO_DA_VAGA_INEXISTENTE, null);
        return;
      }
      notificarErro(
        FALHA_DA_MUDANCA_DE_ESTADO,
        mensagemDaFalha(falha, RESERVA_DA_ACAO),
        saidaDa(falha, () => mudarEstado(vaga, acao)),
      );
      return;
    }
    const devolvida =
      resultado.dados?.vaga !== null && typeof resultado.dados?.vaga === "object" ? resultado.dados.vaga : null;
    const atualizada = devolvida !== null ? { ...vaga, ...devolvida, id: vaga.id } : { ...vaga, estado: acao.destino };
    invalidarLeituraEmVoo();
    const filtro = recorte.current.estado;
    if (filtro !== null && atualizada.estado !== filtro) {
      tirarDoRecorte(vaga.id);
      devolverFoco();
    } else {
      setVagas((atuais) => atuais.map((v) => (v.id === vaga.id ? atualizada : v)));
    }
    notificarSucesso(acao.confirmacao, String(atualizada.titulo ?? "").trim() || undefined);
  };

  /**
   * Exclui a Vaga, depois da confirmação que a nomeou. Vaga que já não existe
   * também sai da lista: insistir numa linha que o banco não tem é a tela
   * mostrando o que não está lá. A notificação, nesse caso, diz que ela já não
   * existia, e não oferece "Tentar de novo".
   *
   * A REPETIÇÃO pela notificação ("Tentar de novo", só em falha passageira)
   * chama esta função de novo SEM reabrir o diálogo, de propósito: a pessoa já
   * confirmou esta exclusão, desta Vaga, e o que falhou foi a viagem, não a
   * decisão. Reabrir o diálogo pediria uma segunda confirmação do mesmo ato.
   */
  const excluir = async (vaga, acao) => {
    if (!abrirAcao(vaga, acao.chave)) return;
    let resultado;
    try {
      resultado = await excluirVaga(vaga.id);
    } catch (falha) {
      console.error("[Painel] A exclusão da vaga lançou em vez de devolver erro tipado.", falha);
      resultado = { ok: false, erro: { tipo: ERRO_INESPERADO, mensagem: "", detalhe: String(falha) } };
    } finally {
      fecharAcao();
    }
    if (!montada.current) return;
    setParaExcluir(null);

    const ok = deuCerto(resultado);
    const falha = ok ? null : (resultado?.erro ?? null);
    const inexistente = falha?.tipo === ERRO_NAO_ENCONTRADO;
    if (ok || inexistente) {
      invalidarLeituraEmVoo();
      removerDaLista(vaga.id);
      devolverFoco();
    }
    if (inexistente) {
      notificarErro(TITULO_DA_VAGA_INEXISTENTE, DESCRICAO_DA_VAGA_INEXISTENTE, null);
      return;
    }
    if (!ok) {
      notificarErro(
        FALHA_DA_EXCLUSAO,
        mensagemDaFalha(falha, RESERVA_DA_ACAO),
        saidaDa(falha, () => excluir(vaga, acao)),
      );
      return;
    }
    notificarSucesso(acao.confirmacao, String(vaga.titulo ?? "").trim() || undefined);
  };

  /* ── Qual tela ── */
  const situacao = situacaoDaLista({ carregando, erro, quantidade: vagas.length, buscando });

  let conteudo = null;
  if (situacao === "carregando") {
    conteudo = (
      <div data-estado-da-lista="carregando" className="flex flex-col gap-3">
        <p role="status" className="sr-only">
          {TEXTO_DO_CARREGAMENTO}
        </p>
        {Array.from({ length: LINHAS_DO_ESQUELETO }, (_, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="flex items-center gap-4 rounded-cartao border border-border-soft bg-surface p-4"
          >
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-6 w-24 shrink-0 rounded-pilula" />
          </div>
        ))}
      </div>
    );
  } else if (situacao === "erro") {
    conteudo = (
      <div
        data-estado-da-lista="erro"
        role="alert"
        className="mx-auto max-w-xl rounded-cartao border border-destructive-ink/70 bg-destructive-ink/10 p-6 text-center"
      >
        <AlertCircle aria-hidden="true" className="mx-auto size-8 text-destructive-ink" />
        <h3 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_ERRO}</h3>
        <p className="mt-2 text-sm text-ink-secondary" data-papel="motivo-do-erro">
          {mensagemDaFalha(erro, RESERVA_DA_LEITURA)}
        </p>
        <Button
          type="button"
          variant="outline"
          data-papel="tentar-de-novo"
          onClick={tentarDeNovo}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
        >
          {ROTULO_DE_NOVA_TENTATIVA}
        </Button>
      </div>
    );
  } else if (situacao === "vazio-de-busca") {
    conteudo = (
      <div
        data-estado-da-lista="vazio-de-busca"
        className="mx-auto max-w-xl rounded-cartao border border-border-soft bg-surface p-8 text-center"
      >
        <SearchX aria-hidden="true" className="mx-auto size-10 text-ink-muted" />
        <h3 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_VAZIO_DE_BUSCA}</h3>
        <p className="mt-2 text-sm text-ink-secondary">{descricaoDoVazioDeBusca(busca)}</p>
        <Button
          type="button"
          variant="outline"
          data-papel="limpar-busca"
          onClick={() => aoLimparBusca?.()}
          className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}
        >
          {ROTULO_DE_LIMPAR_BUSCA}
        </Button>
      </div>
    );
  } else if (situacao === "vazio") {
    conteudo = (
      <div
        data-estado-da-lista="vazio"
        className="mx-auto max-w-xl rounded-cartao border border-border-soft bg-surface p-8 text-center"
      >
        <Briefcase aria-hidden="true" className="mx-auto size-10 text-ink-muted" />
        <h3 className="mt-3 text-base font-semibold text-ink">{TITULO_DO_VAZIO}</h3>
        <p className="mt-2 text-sm text-ink-secondary">{DESCRICAO_DO_VAZIO}</p>
        <Button asChild className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "mt-4")}>
          <Link to={ENDERECO_DA_VAGA_NOVA} data-papel="nova-vaga">
            {ROTULO_DA_NOVA_VAGA}
          </Link>
        </Button>
      </div>
    );
  } else {
    conteudo = (
      <ul
        data-estado-da-lista="lista"
        data-atualizando={atualizando ? "true" : undefined}
        className="flex flex-col gap-3"
      >
        {vagas.map((vaga) => (
          <Linha
            key={vaga.id}
            vaga={vaga}
            indice={indice}
            emCurso={emCurso?.id === vaga.id ? emCurso.chave : null}
            ocupado={emCurso !== null}
            aoMudarEstado={(acao) => mudarEstado(vaga, acao)}
            aoPedirExclusao={(acao) => setParaExcluir({ vaga, acao })}
          />
        ))}
      </ul>
    );
  }

  const vagaEmCurso = emCurso === null ? null : (vagas.find((v) => v.id === emCurso.id) ?? null);

  return (
    <>
      {/* A região da lista: sempre montada, recebe foco por código quando a
          linha que tinha o foco sai. */}
      <div ref={regiao} tabIndex={-1} data-papel="regiao-da-lista" className="outline-hidden">
        {conteudo}
      </div>

      {/* O que está acontecendo, para quem ouve a tela. */}
      <p role="status" aria-live="polite" className="sr-only" data-papel="acao-em-curso">
        {vagaEmCurso === null ? "" : textoDaAcaoEmCurso(vagaEmCurso, emCurso.chave)}
      </p>

      {/* UM diálogo, SEMPRE montado e controlado por `aberto`: montagem
          condicional nunca transita de aberto para fechado, e o foco não volta
          a quem abriu. Ele nomeia a Vaga, e o rótulo diz o que o botão faz. */}
      <DialogoDeConfirmacao
        aberto={paraExcluir !== null}
        aoMudarAbertura={(aberto) => {
          if (!aberto && trinco.current === null) setParaExcluir(null);
        }}
        titulo={paraExcluir === null ? "" : tituloDaExclusao(paraExcluir.vaga)}
        descricao={paraExcluir === null ? "" : descricaoDaExclusao(paraExcluir.vaga)}
        rotuloDeConfirmacao={ROTULO_DE_CONFIRMAR_EXCLUSAO}
        ocupado={
          paraExcluir !== null && emCurso?.id === paraExcluir.vaga.id
            ? textoDaAcaoEmCurso(paraExcluir.vaga, emCurso.chave)
            : ""
        }
        aoConfirmar={() => {
          if (paraExcluir !== null) excluir(paraExcluir.vaga, paraExcluir.acao);
        }}
      />
    </>
  );
}

/**
 * Uma linha: título, a pílula de Estado, Departamento e Nível com a Cor (por
 * `style`), Tipo, Modalidade/Localização e as ações.
 */
function Linha({ vaga, indice, emCurso = null, ocupado = false, aoMudarEstado, aoPedirExclusao }) {
  const linha = linhaDaVaga(vaga, indice);

  /* A GUARDA do vocabulário: Estado fora da lista é defeito, e ele é acusado
     pela política de `voz.js` (lança em desenvolvimento, registra em
     produção). A linha continua de pé, só com Editar. */
  if (!linha.estadoValido) {
    exigir(
      `Estado de Vaga desconhecido na listagem: ${JSON.stringify(vaga?.estado)}. ` +
        "O vocabulário é fechado, veja `src/domain/carreiras/estados.js`.",
    );
  }

  return (
    <li
      data-vaga={linha.id}
      className="flex flex-wrap items-center gap-4 rounded-cartao border border-border-soft bg-surface p-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 data-papel="titulo" className="min-w-0 max-w-full truncate text-sm font-bold text-ink">
            {linha.titulo === "" ? "Vaga sem título" : linha.titulo}
          </h3>
          {linha.aparenciaDoEstado !== null ? (
            <PilulaDeEstado estado={linha.estado} aparencia={linha.aparenciaDoEstado} />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <Classificacao dado={linha.departamento} />
          <Classificacao dado={linha.nivel} />
          <span data-papel="tipo" data-conhecida={linha.tipo.conhecida ? "true" : "false"}>
            {linha.tipo.rotulo}
          </span>
          {linha.local !== "" ? <span data-papel="local">{linha.local}</span> : null}
        </div>
      </div>

      <div data-papel="acoes" className="flex flex-wrap items-center gap-1.5">
        {linha.acoes.map((acao) => {
          const rotulo = rotuloAcessivelDaAcao(acao, vaga);
          if (acao.tipo === TIPO_EDITAR) {
            return (
              <Link
                key={acao.chave}
                to={acao.endereco}
                data-acao={acao.chave}
                aria-label={rotulo}
                className={CLASSE_DO_ALVO_DE_ACAO}
              >
                <SquarePen aria-hidden="true" className="size-4" />
                {acao.rotulo}
              </Link>
            );
          }
          if (acao.tipo === TIPO_VER) {
            return (
              <a
                key={acao.chave}
                href={acao.endereco}
                target="_blank"
                rel="noopener noreferrer"
                data-acao={acao.chave}
                aria-label={rotulo}
                className={CLASSE_DO_ALVO_DE_ACAO}
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {acao.rotulo}
              </a>
            );
          }
          const girando = emCurso === acao.chave;
          const exclui = acao.tipo === TIPO_EXCLUIR;
          return (
            <button
              key={acao.chave}
              type="button"
              data-acao={acao.chave}
              data-destino={acao.tipo === TIPO_ESTADO ? acao.acao.destino : undefined}
              aria-label={rotulo}
              aria-busy={girando ? "true" : undefined}
              disabled={ocupado}
              onClick={() => (exclui ? aoPedirExclusao?.(acao.acao) : aoMudarEstado?.(acao.acao))}
              className={cn(
                CLASSE_DO_ALVO_DE_ACAO,
                exclui && "hover:border-destructive-ink/50 hover:bg-destructive-ink/10 hover:text-destructive-ink",
              )}
            >
              {girando ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : exclui ? (
                <Trash2 aria-hidden="true" className="size-4" />
              ) : null}
              {acao.rotulo}
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** Departamento ou Nível: o nome, com o par de cor aplicado por `style`. */
function Classificacao({ dado }) {
  return (
    <span
      data-papel={dado.chave}
      data-conhecida={dado.conhecida ? "true" : "false"}
      className="inline-flex items-center rounded-pilula px-2 py-0.5 font-semibold"
      style={{ backgroundColor: dado.fundo ?? undefined, color: dado.tinta ?? undefined }}
    >
      {dado.rotulo}
    </span>
  );
}
