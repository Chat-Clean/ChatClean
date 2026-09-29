/**
 * O formulário de Vaga do Painel (Story 5.4), em rota própria:
 * `/admin/carreiras/vaga/nova` e `/admin/carreiras/vaga/:id`.
 *
 * O molde é a tela de edição de Post, lida e nunca importada: `admin/carreiras`
 * e `admin/blog` não se importam (AD-15). O que as duas compartilham mora em
 * `admin/comum` (a casca do editor, a barra, a pendência, a pílula).
 *
 * ─── O QUE A TELA FAZ ───────────────────────────────────────────────────────
 *
 * - Os campos da Vaga, nativos, no padrão da gaveta do Post.
 * - As Classificações vindas do BANCO, na ordem definida lá.
 * - A Descrição no editor comum, com o vocabulário reduzido: a barra só tem
 *   os controles da projeção, derivados dela.
 * - As ações de Estado DERIVADAS de `acoesDoEstadoDaVaga`, a mesma tabela que
 *   o servidor consulta, SEM a exclusão (ela é da listagem, na Story 5.5).
 * - Os erros do servidor junto do campo, e nada do que foi digitado se perde.
 * - A proteção de saída: o diálogo ao voltar, e o `beforeunload` só enquanto
 *   houver pendência.
 *
 * ─── O SLUG ACOMPANHA O TÍTULO ATÉ A PRIMEIRA ABERTURA ──────────────────────
 *
 * Enquanto a pessoa não edita o endereço à mão e a Vaga nunca esteve Aberta,
 * o endereço é derivado do título pela regra do domínio (`slugDaVaga`). Depois
 * da primeira abertura ele fica só leitura, com o motivo dito ao lado: é a
 * mesma trava que o banco impõe, dita antes de a pessoa tentar. Travado, o
 * campo mostra o endereço GRAVADO.
 *
 * ─── TODA AÇÃO DE ESTADO SALVA A PENDÊNCIA ANTES ────────────────────────────
 *
 * Mudar o Estado de uma Vaga com alteração não salva mudaria a versão
 * GRAVADA, não a que está na tela. Por isso toda ação de Estado (abrir,
 * encerrar, reabrir) salva primeiro e só muda o Estado depois que o
 * salvamento deu certo; se ele falha, o Estado fica como estava.
 *
 * ─── UMA AÇÃO POR VEZ, E ELA SEMPRE TERMINA ─────────────────────────────────
 *
 * Salvar e mudar o Estado passam por uma trava SÍNCRONA (`useRef`): o segundo
 * clique chega antes de o React redesenhar os botões desabilitados, e sem a
 * trava ele mandaria um segundo pedido (na Vaga nova, uma segunda Vaga). A
 * trava é solta num `finally`: exceção nenhuma deixa a tela ocupada para
 * sempre. Resposta que chega depois de a tela sair é ignorada.
 *
 * ─── A FALHA PASSAGEIRA OFERECE "TENTAR DE NOVO" ────────────────────────────
 *
 * Quando salvar ou mudar o Estado falha por `rede` ou `inesperado`, a
 * notificação traz a ação de resolver, que repete a MESMA operação com o que
 * está na tela. As outras falhas (`configuracao`, `permissao`,
 * `dados_invalidos`, `conflito`, `nao_encontrado`) não: repetir o mesmo pedido
 * daria a mesma recusa, e o que resolve é corrigir o campo marcado.
 *
 * ─── A TELA NÃO ESCREVE NO BANCO ────────────────────────────────────────────
 *
 * A escrita passa só por `@/data/carreiras/escrita`, que fala com a função de
 * servidor. A leitura, só por `@/data/carreiras/leitura`. Os dois entram pelos
 * apelidos exatos, para a verificação trocá-los por dublê, e os tipos de erro
 * vêm deles também: `formulario.js` os recebe por parâmetro.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ChevronLeft, Loader2, RotateCw } from "lucide-react";

import EditorDaDescricao from "@/admin/carreiras/EditorDaDescricao";
import {
  MOTIVO_DO_SLUG_TRAVADO,
  classificacoesAusentes,
  classificacoesComoListas,
  corpoParaSalvar,
  errosDoServidor,
  problemasLocais,
  slugDoTitulo,
  slugTravado,
  vagaInexistente,
  valoresDaVaga,
  valoresGravados,
  valoresVazios,
} from "@/admin/carreiras/formulario";
import { falhaPassageira, mensagemDaFalha } from "@/admin/carreiras/falhas";
import {
  ENDERECO_DA_LISTAGEM,
  PARAMETRO_DA_VAGA,
  enderecoDaVaga,
} from "@/admin/carreiras/rotas";
import PilulaDeEstado from "@/admin/comum/PilulaDeEstado";
import {
  ROTULO_PARA_FICAR,
  ROTULO_PARA_SAIR,
  TITULO_DA_SAIDA,
  descricaoDaSaida,
  haPendencia,
  instantaneo,
} from "@/admin/comum/pendencia";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import {
  LISTAS_DE_CLASSIFICACAO,
  MODALIDADES,
  MODALIDADE_REMOTA,
  modalidadeExigeLocalizacao,
} from "@/domain/carreiras/classificacoes";
import { ESTADO_INICIAL_DA_VAGA, aparenciaDoEstadoDaVaga } from "@/domain/carreiras/estados";
import { acoesDoEstadoDaVaga } from "@/domain/carreiras/transicoes";
import { LIMITES_DA_VAGA, tamanhoEmCaracteres } from "@/domain/carreiras/vaga";
import { documentoVazio } from "@/domain/blog/schema";
import { ehUuid } from "@/data/blog/comum";
import {
  ERRO_NAO_ENCONTRADO,
  lerVagaDoPainelPorId,
  listarClassificacoesDoPainel,
} from "@/data/carreiras/leitura";
import {
  ERRO_CONFLITO,
  ERRO_INESPERADO,
  ERRO_REDE,
  mudarEstadoDaVaga,
  salvarVaga,
} from "@/data/carreiras/escrita";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CLASSE_DE_CAMPO =
  "w-full rounded-controle border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-muted transition-colors";

/** As falhas que oferecem "Tentar de novo": as passageiras, e só elas. */
const TIPOS_PASSAGEIROS = Object.freeze([ERRO_REDE, ERRO_INESPERADO]);

/** O rótulo da ação de resolver. Aprovado pela regra de voz do Painel. */
const ROTULO_DE_NOVA_TENTATIVA = "Tentar de novo";

/* As frases de reserva: a falha sem frase nunca vira notificação muda. */
const RESERVA_DA_CARGA =
  "Confira a conexão e tente de novo. Se continuar, recarregue a página do Painel.";
const RESERVA_DO_SALVAR =
  "Confira a conexão e tente salvar de novo. O que está na tela continua aqui.";
const RESERVA_DO_ESTADO =
  "Confira a conexão e tente mudar o estado de novo. O que está na tela continua aqui.";

/** As ações de Estado que o FORMULÁRIO oferece: as da máquina, sem excluir. */
function acoesDoFormulario(estado) {
  if (typeof estado !== "string" || estado === "") return [];
  return acoesDoEstadoDaVaga(estado).filter((acao) => acao.exclui !== true);
}

/**
 * A rota. O identificador vem de `useParams`, e trocar de Vaga troca a `key`
 * da tela: o editor lê o documento UMA vez, e é a `key` que o renova.
 *
 * A Vaga que NASCE aqui não troca de tela: o endereço passa de `nova` para o
 * identificador, mas a chave continua a mesma, para o que está na tela (o
 * cursor, o documento) não ser relido do banco logo depois de salvo.
 */
export default function EditorDeVaga() {
  const { [PARAMETRO_DA_VAGA]: id } = useParams();
  const local = useLocation();
  const navegar = useNavigate();
  const [criada, setCriada] = useState(null);

  const chaveDaNova = `nova-${local.key}`;
  const chave =
    id === undefined ? chaveDaNova : criada !== null && criada.id === id ? criada.chave : `vaga-${id}`;

  const aoCriar = useCallback(
    (novoId) => {
      setCriada({ id: novoId, chave });
      navegar(enderecoDaVaga(novoId), { replace: true });
    },
    [chave, navegar],
  );
  const aoSair = useCallback(() => navegar(ENDERECO_DA_LISTAGEM), [navegar]);

  return <TelaDaVaga key={chave} idInicial={id ?? null} aoCriar={aoCriar} aoSair={aoSair} />;
}

function TelaDaVaga({ idInicial, aoCriar, aoSair }) {
  const prefixo = useId();
  const idDe = (nome) => `${prefixo}-campo-${nome}`;
  const idDoErro = (nome) => `${prefixo}-erro-${nome}`;
  const idDaAjuda = (nome) => `${prefixo}-ajuda-${nome}`;

  /* O identificador vive em estado: depois de a Vaga nascer, esta mesma tela
     passa a editar, e é isso que muda o pedido de salvar. */
  const [id, setId] = useState(idInicial);
  /* A Vaga que esta tela CARREGA é a da montagem. Quando a Vaga nasce aqui, o
     endereço (e a propriedade) passa a ter o identificador, mas o que está na
     tela já é o gravado: reler agora descartaria o cursor e o documento. */
  const [idDaCarga] = useState(idInicial);
  const criando = id === null || id === undefined || id === "";

  const [tentativa, setTentativa] = useState(0);
  const [carga, setCarga] = useState({ situacao: "carregando", erro: null });

  const [classificacoes, setClassificacoes] = useState(() => classificacoesComoListas(null));
  const [valores, setValores] = useState(valoresVazios);
  const [documento, setDocumento] = useState(documentoVazio);
  /* O que está GRAVADO: Estado, primeira abertura e endereço. É daqui que as
     ações e a trava do Slug são derivadas, nunca do que a tela tem. */
  const [gravada, setGravada] = useState(null);
  const [erros, setErros] = useState({});
  const [referencia, setReferencia] = useState(null);
  const [acaoEmCurso, setAcaoEmCurso] = useState(null);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  /* A Vaga nasceu no servidor, mas a resposta não trouxe o identificador:
     salvar de novo criaria OUTRA Vaga. A tela para de oferecer escrita. */
  const [semIdentificador, setSemIdentificador] = useState(false);

  /* O endereço foi digitado à mão? A partir daí ele para de acompanhar o
     título. `ref`: nada na tela depende disto para desenhar. */
  const slugAMao = useRef(false);
  /* A trava síncrona de escrita, e se a tela ainda está na página. */
  const emVoo = useRef(false);
  const montada = useRef(false);
  /* As operações da renderização MAIS RECENTE: "Tentar de novo" repete com o
     que está na tela quando a pessoa clica, e não com o de quando falhou. */
  const recentes = useRef({ salvar: async () => false, mudarEstado: async () => false });

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  const estado = gravada?.estado ?? null;
  const travado = slugTravado(gravada);
  const acoes = useMemo(() => acoesDoFormulario(estado), [estado]);
  const ocupado = acaoEmCurso !== null;

  const retratoAtual = useMemo(() => instantaneo(valores, documento), [valores, documento]);
  const pendente = haPendencia(retratoAtual, referencia);

  /* ── Carga ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    let vivo = true;
    setCarga({ situacao: "carregando", erro: null });
    setReferencia(null);

    /* Identificador torto na URL não vai à rede: nenhuma Vaga tem este
       endereço, e a resposta seria a mesma depois de uma viagem. */
    if (idDaCarga !== null && !ehUuid(idDaCarga)) {
      setCarga({ situacao: "inexistente", erro: null });
      return () => {
        vivo = false;
      };
    }

    (async () => {
      try {
        const [lidas, lida] = await Promise.all([
          listarClassificacoesDoPainel(),
          idDaCarga !== null ? lerVagaDoPainelPorId(idDaCarga) : Promise.resolve(null),
        ]);
        if (!vivo) return;

        /* A Vaga que não existe e a leitura que falhou são estados DISTINTOS:
           um pede voltar à listagem, o outro pede tentar de novo. */
        if (idDaCarga !== null) {
          if (lida === null || typeof lida !== "object" || lida.ok !== true) {
            setCarga({
              situacao: vagaInexistente(lida?.erro, ERRO_NAO_ENCONTRADO) ? "inexistente" : "erro",
              erro: lida?.erro ?? null,
            });
            return;
          }
          if (lida.dados === null || typeof lida.dados !== "object") {
            setCarga({ situacao: "inexistente", erro: null });
            return;
          }
        }
        if (lidas === null || typeof lidas !== "object" || lidas.ok !== true) {
          setCarga({ situacao: "erro", erro: lidas?.erro ?? null });
          return;
        }

        const listas = classificacoesComoListas(lidas.dados);
        setClassificacoes(listas);
        if (idDaCarga !== null) {
          const vaga = lida.dados;
          const doBanco = valoresDaVaga(vaga);
          const conteudo =
            vaga.descricao !== null && typeof vaga.descricao === "object"
              ? vaga.descricao
              : documentoVazio();
          setValores(doBanco);
          setDocumento(conteudo);
          setGravada({ estado: vaga.estado, aberta_em: vaga.aberta_em ?? null, slug: vaga.slug });
          /* Um endereço gravado que não é o derivado do título foi escolhido à
             mão: o título não o reescreve. */
          slugAMao.current = doBanco.slug !== slugDoTitulo(doBanco.titulo);
          setReferencia(instantaneo(doBanco, conteudo));
          /* A Classificação gravada que saiu da lista é dita ao abrir, e não
             só quando o salvar a recusar. */
          setErros(classificacoesAusentes(doBanco, listas));
        } else {
          setReferencia(instantaneo(valoresVazios(), documentoVazio()));
        }
        setCarga({ situacao: "pronta", erro: null });
      } catch {
        /* A camada de dados não lança; um dublê, uma extensão do navegador ou
           um defeito futuro podem. Esqueleto eterno nunca: vira erro de carga,
           com "tentar de novo". */
        if (!vivo) return;
        setCarga({ situacao: "erro", erro: null });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [idDaCarga, tentativa]);

  /* ── Mudanças nos campos ─────────────────────────────────────────────── */

  const mudarCampo = useCallback(
    (campo, valor) => {
      setValores((atuais) => {
        if (campo === "slug") {
          slugAMao.current = true;
          return { ...atuais, slug: valor };
        }
        if (campo === "titulo" && !travado && !slugAMao.current) {
          return { ...atuais, titulo: valor, slug: slugDoTitulo(valor) };
        }
        return { ...atuais, [campo]: valor };
      });
      /* A marca some assim que a pessoa mexe no campo: mantê-la até o próximo
         salvamento acusaria um erro já corrigido. */
      setErros((atuais) => {
        if (!Object.hasOwn(atuais, campo) && !(campo === "titulo" && Object.hasOwn(atuais, "slug"))) {
          return atuais;
        }
        const restantes = { ...atuais };
        delete restantes[campo];
        if (campo === "titulo" && !slugAMao.current) delete restantes.slug;
        return restantes;
      });
    },
    [travado],
  );

  const mudarDocumento = useCallback((doc) => {
    setDocumento(doc);
    setErros((atuais) => {
      if (!Object.hasOwn(atuais, "descricao")) return atuais;
      const restantes = { ...atuais };
      delete restantes.descricao;
      return restantes;
    });
  }, []);

  /* ── A trava e a saída de uma falha ─────────────────────────────────── */

  /** A ação de resolver da notificação, quando a falha é passageira. */
  const saidaDa = (erro, repetir) =>
    falhaPassageira(erro, TIPOS_PASSAGEIROS)
      ? { rotulo: ROTULO_DE_NOVA_TENTATIVA, aoAcionar: repetir }
      : null;

  /**
   * Roda UMA escrita por vez. A segunda chamada antes do redesenho é
   * ignorada pela trava síncrona, e a trava é solta sempre, no `finally`.
   */
  const comTrava = async (chave, operacao) => {
    if (emVoo.current) return false;
    emVoo.current = true;
    setAcaoEmCurso(chave);
    try {
      return await operacao();
    } catch {
      if (montada.current) {
        notificarErro(
          "A vaga não foi gravada por uma falha no Painel",
          "Recarregue a página e confira a vaga antes de salvar de novo.",
        );
      }
      return false;
    } finally {
      emVoo.current = false;
      if (montada.current) setAcaoEmCurso(null);
    }
  };

  /* ── Salvar ──────────────────────────────────────────────────────────── */

  /**
   * Salva o que está na tela, SEM olhar a trava (quem chama a segura).
   * Devolve o que ficou gravado (`{ valores, gravada }`), ou `null` quando
   * nada foi gravado: é por isso que a ação de Estado sabe se pode seguir.
   */
  const gravarOQueEstaNaTela = async (repetir) => {
    const locais = {
      ...classificacoesAusentes(valores, classificacoes),
      ...problemasLocais(valores, { travado, criando }),
    };
    if (Object.keys(locais).length > 0) {
      setErros(locais);
      notificarErro(
        "Falta corrigir um campo da vaga",
        "O campo está marcado no formulário. Corrija e salve de novo.",
      );
      return null;
    }

    let resultado;
    try {
      resultado = await salvarVaga(corpoParaSalvar(valores, documento, { travado, criando }), {
        id: criando ? null : id,
      });
    } catch {
      resultado = { ok: false, erro: { tipo: ERRO_INESPERADO, mensagem: "" } };
    }
    if (!montada.current) return null;

    if (resultado === null || typeof resultado !== "object" || resultado.ok !== true) {
      /* NADA é descartado: os valores e o documento ficam onde estavam, e a
         pendência continua pendente. */
      const erro = resultado?.erro ?? null;
      setErros(errosDoServidor(erro, { tipoDeConflito: ERRO_CONFLITO }));
      notificarErro(
        "Não deu para salvar a vaga",
        mensagemDaFalha(erro, RESERVA_DO_SALVAR),
        saidaDa(erro, repetir),
      );
      return null;
    }

    const vaga =
      resultado.dados?.vaga !== null && typeof resultado.dados?.vaga === "object"
        ? resultado.dados.vaga
        : null;

    /* A Vaga nova PRECISA voltar com identificador. Sem ele, a tela ficaria
       criando, e o próximo Salvar mandaria uma segunda Vaga. */
    if (criando && !(typeof vaga?.id === "string" && ehUuid(vaga.id))) {
      setSemIdentificador(true);
      notificarErro(
        "A vaga foi enviada, mas o servidor não devolveu o endereço dela",
        "Volte para a listagem e abra a vaga por lá antes de editar, para não criar uma vaga repetida.",
      );
      return null;
    }

    const gravados = valoresGravados(valores, vaga);
    const novaGravada = {
      estado: typeof vaga?.estado === "string" ? vaga.estado : (gravada?.estado ?? ESTADO_INICIAL_DA_VAGA),
      aberta_em: vaga && Object.hasOwn(vaga, "aberta_em") ? vaga.aberta_em : (gravada?.aberta_em ?? null),
      slug: typeof vaga?.slug === "string" ? vaga.slug : gravados.slug,
    };
    setValores(gravados);
    setGravada(novaGravada);
    setErros({});
    /* A pendência some AQUI, e só aqui, com o retrato do que foi gravado. */
    setReferencia(instantaneo(gravados, documento));
    notificarSucesso(criando ? "Vaga criada" : "Vaga salva", gravados.titulo);

    if (criando) {
      setId(vaga.id);
      aoCriar?.(vaga.id);
    }
    return { valores: gravados, gravada: novaGravada };
  };

  const salvar = () =>
    semIdentificador
      ? Promise.resolve(false)
      : comTrava("salvar", async () => {
          const salvo = await gravarOQueEstaNaTela(() => recentes.current.salvar());
          return salvo !== null;
        });

  /* ── Mudar o Estado ──────────────────────────────────────────────────── */

  const mudarEstado = (chave) => {
    const acao = acoes.find((a) => a.chave === chave) ?? null;
    if (acao === null || semIdentificador) return Promise.resolve(false);
    return comTrava(chave, async () => {
      const repetir = () => recentes.current.mudarEstado(chave);
      if (criando) {
        notificarErro(
          "A vaga ainda não foi salva",
          "Salve a vaga primeiro; depois disso as ações de estado aparecem aqui.",
        );
        return false;
      }

      /* Toda ação de Estado salva a pendência ANTES; se o salvar falha, o
         Estado fica como estava. */
      let base = { valores, gravada };
      if (pendente) {
        const salvo = await gravarOQueEstaNaTela(repetir);
        if (salvo === null) return false;
        base = salvo;
      }

      let resultado;
      try {
        resultado = await mudarEstadoDaVaga(id, acao.chave);
      } catch {
        resultado = { ok: false, erro: { tipo: ERRO_INESPERADO, mensagem: "" } };
      }
      if (!montada.current) return false;

      if (resultado === null || typeof resultado !== "object" || resultado.ok !== true) {
        const erro = resultado?.erro ?? null;
        setErros(errosDoServidor(erro, { tipoDeConflito: ERRO_CONFLITO }));
        notificarErro(
          "Não deu para mudar o estado da vaga",
          mensagemDaFalha(erro, RESERVA_DO_ESTADO),
          saidaDa(erro, repetir),
        );
        return false;
      }

      /* A tela passa a mostrar a Vaga que o SERVIDOR devolveu: o Estado, a
         primeira abertura, o endereço (fixo, se travou agora) e os campos.
         O Slug GRAVADO chega ao campo por `valoresGravados`: é a mesma
         coluna, e o campo travado mostra o que o servidor devolveu. */
      const vaga =
        resultado.dados?.vaga !== null && typeof resultado.dados?.vaga === "object"
          ? resultado.dados.vaga
          : null;
      const anterior = base.gravada;
      const novaGravada = {
        estado: typeof vaga?.estado === "string" ? vaga.estado : acao.destino,
        aberta_em:
          vaga && Object.hasOwn(vaga, "aberta_em") ? vaga.aberta_em : (anterior?.aberta_em ?? null),
        slug: typeof vaga?.slug === "string" ? vaga.slug : (anterior?.slug ?? base.valores.slug),
      };
      const novosValores = valoresGravados(base.valores, vaga);
      setGravada(novaGravada);
      setValores(novosValores);
      setErros({});
      setReferencia(instantaneo(novosValores, documento));
      notificarSucesso(acao.confirmacao, novosValores.titulo);
      return true;
    });
  };

  useEffect(() => {
    recentes.current = { salvar, mudarEstado };
  });

  /* ── Sair ────────────────────────────────────────────────────────────── */

  /* Fechar a aba e recarregar: o ouvinte existe SÓ enquanto há pendência. */
  useEffect(() => {
    if (!pendente) return undefined;
    const aoDescarregar = (evento) => {
      evento.preventDefault();
      evento.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", aoDescarregar);
    return () => window.removeEventListener("beforeunload", aoDescarregar);
  }, [pendente]);

  const sair = useCallback(() => {
    if (!pendente) {
      aoSair?.();
      return;
    }
    setConfirmandoSaida(true);
  }, [pendente, aoSair]);

  const sairDescartando = useCallback(() => {
    setConfirmandoSaida(false);
    aoSair?.();
  }, [aoSair]);

  /* ── Desenho ─────────────────────────────────────────────────────────── */

  const titulo = criando ? "Nova vaga" : "Editar vaga";

  if (carga.situacao === "inexistente") {
    return (
      <Moldura aoSair={aoSair} titulo="Editar vaga">
        <div
          role="alert"
          data-situacao="inexistente"
          className="m-6 max-w-2xl rounded-cartao border border-border-soft bg-surface p-6"
        >
          <h3 className="text-base font-semibold text-ink">Esta vaga não existe</h3>
          <p className="mt-2 text-sm text-ink-secondary">
            Nenhuma vaga tem este endereço no Painel. Ela pode ter sido excluída, ou o link
            está incompleto.
          </p>
          <Button
            type="button"
            data-papel="voltar-para-listagem"
            onClick={() => aoSair?.()}
            className={cn(ANEL_DE_FOCO, "mt-4 gap-2")}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Voltar para a listagem
          </Button>
        </div>
      </Moldura>
    );
  }

  if (carga.situacao === "erro") {
    return (
      <Moldura aoSair={aoSair} titulo={titulo}>
        <div
          role="alert"
          data-situacao="erro"
          className="m-6 max-w-2xl rounded-cartao border border-destructive/40 bg-destructive/10 p-6"
        >
          <h3 className="text-base font-semibold text-ink">
            Não conseguimos carregar o formulário da vaga
          </h3>
          <p className="mt-2 text-sm text-ink-secondary" data-papel="motivo-da-carga">
            {mensagemDaFalha(carga.erro, RESERVA_DA_CARGA)}
          </p>
          <Button
            type="button"
            data-papel="tentar-de-novo"
            onClick={() => setTentativa((atual) => atual + 1)}
            className={cn(ANEL_DE_FOCO, "mt-4 gap-2")}
          >
            <RotateCw aria-hidden="true" className="size-4" />
            Tentar de novo
          </Button>
        </div>
      </Moldura>
    );
  }

  const carregando = carga.situacao === "carregando";
  const semEscrita = ocupado || carregando || semIdentificador;
  const campo = (nome, { ajuda = false, extra = "" } = {}) => {
    const invalido = Object.hasOwn(erros, nome);
    const descritores = [ajuda ? idDaAjuda(nome) : null, invalido ? idDoErro(nome) : null].filter(
      Boolean,
    );
    return {
      id: idDe(nome),
      name: nome,
      "data-campo": nome,
      disabled: ocupado,
      "aria-invalid": invalido ? "true" : undefined,
      "aria-describedby": descritores.length > 0 ? descritores.join(" ") : undefined,
      className: cn(
        CLASSE_DE_CAMPO,
        ANEL_DE_FOCO,
        invalido ? "border-destructive" : "border-border-soft",
        extra,
      ),
    };
  };
  const mudar = (nome) => (evento) => mudarCampo(nome, evento.target.value);
  const exigeLocalizacao = modalidadeExigeLocalizacao(valores.modalidade);
  const ajudaDaLocalizacao =
    valores.modalidade === MODALIDADE_REMOTA
      ? "Opcional: a vaga é remota."
      : exigeLocalizacao
        ? "Necessária para abrir a vaga nesta modalidade."
        : "Necessária para abrir a vaga, a não ser que ela seja remota.";

  return (
    <Moldura
      aoSair={sair}
      voltarDesabilitado={ocupado}
      titulo={titulo}
      subtitulo={
        criando ? "Criando uma vaga nova" : (
          <>
            Editando: <span className="dado">{gravada?.slug ?? valores.slug}</span>
          </>
        )
      }
      acao={
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {estado !== null ? (
            <PilulaDeEstado estado={estado} aparencia={aparenciaDoEstadoDaVaga(estado)} />
          ) : null}
          <Button
            type="button"
            data-acao="salvar"
            onClick={() => salvar()}
            aria-busy={acaoEmCurso === "salvar" ? "true" : undefined}
            disabled={semEscrita}
            className={cn(ANEL_DE_FOCO, "gap-2")}
          >
            {acaoEmCurso === "salvar" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            Salvar
          </Button>
          {acoes.map((acao) => (
            <Button
              key={acao.chave}
              type="button"
              variant="outline"
              data-acao={acao.chave}
              data-destino={acao.destino}
              onClick={() => mudarEstado(acao.chave)}
              aria-busy={acaoEmCurso === acao.chave ? "true" : undefined}
              disabled={semEscrita}
              className={cn(ANEL_DE_FOCO, "gap-2")}
            >
              {acaoEmCurso === acao.chave ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              {acao.rotulo}
            </Button>
          ))}
        </div>
      }
    >
      {carregando ? (
        <div data-situacao="carregando" aria-busy="true" className="flex min-h-0 flex-1 gap-4 p-4">
          <div className="flex-1 space-y-3" aria-hidden="true">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <Skeleton aria-hidden="true" className="hidden h-64 w-80 shrink-0 lg:block" />
        </div>
      ) : (
        <div
          data-situacao="pronta"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden"
        >
          <div className="flex min-h-96 min-w-0 flex-col gap-1.5 lg:min-h-0 lg:flex-1">
            {/* O aviso de conteúdo limpo é do PRÓPRIO editor (ele o desenha
                acima do texto): uma notificação por cima repetiria o mesmo
                aviso em dois lugares. */}
            <EditorDaDescricao
              documento={documento}
              aoMudar={mudarDocumento}
              className="min-h-96 min-w-0 flex-1 lg:min-h-0"
            />
            <Recusa id={idDoErro("descricao")}>{erros.descricao}</Recusa>
          </div>

          <form
            aria-label="Dados da vaga"
            noValidate
            onSubmit={(evento) => {
              evento.preventDefault();
              salvar();
            }}
            className="flex shrink-0 flex-col gap-5 rounded-cartao border border-border-soft bg-surface p-4 lg:w-96 lg:overflow-y-auto"
          >
            {semIdentificador ? (
              <p
                role="alert"
                data-situacao="sem-identificador"
                className="rounded-controle border border-destructive/40 bg-destructive/10 p-3 text-sm text-ink"
              >
                O servidor não devolveu o endereço desta vaga. Para não criar uma vaga repetida,
                volte para a listagem e abra a vaga por lá.
              </p>
            ) : null}

            {/* ── Título ── */}
            <div className="flex flex-col gap-1.5">
              <Rotulo para={idDe("titulo")} obrigatorio>
                Título
              </Rotulo>
              <input
                type="text"
                {...campo("titulo")}
                value={valores.titulo}
                onChange={mudar("titulo")}
              />
              <Recusa id={idDoErro("titulo")}>{erros.titulo}</Recusa>
            </div>

            {/* ── Endereço (Slug) ── */}
            <div className="flex flex-col gap-1.5">
              <Rotulo para={idDe("slug")}>Endereço no site</Rotulo>
              <input
                type="text"
                {...campo("slug", { ajuda: true, extra: "dado" })}
                readOnly={travado}
                aria-readonly={travado ? "true" : undefined}
                data-travado={travado ? "true" : undefined}
                value={valores.slug}
                onChange={travado ? undefined : mudar("slug")}
                placeholder="analista-de-cs"
              />
              <Recusa id={idDoErro("slug")}>{erros.slug}</Recusa>
              <p id={idDaAjuda("slug")} data-papel="ajuda-do-slug" className="text-xs text-ink-muted">
                {travado
                  ? MOTIVO_DO_SLUG_TRAVADO
                  : "Gerado do título enquanto você não o edita. Depois da primeira abertura ele não muda mais."}
              </p>
            </div>

            {/* ── As três Classificações, do banco ── */}
            {LISTAS_DE_CLASSIFICACAO.map((lista) => {
              const itens = classificacoes[lista.tabela] ?? [];
              const escolhido = valores[lista.coluna];
              const foraDaLista = escolhido !== "" && !itens.some((item) => item.id === escolhido);
              return (
                <div key={lista.chave} className="flex flex-col gap-1.5">
                  <Rotulo para={idDe(lista.coluna)} obrigatorio>
                    {lista.rotulo}
                  </Rotulo>
                  <select
                    {...campo(lista.coluna)}
                    value={escolhido}
                    onChange={mudar(lista.coluna)}
                  >
                    <option value="">Escolha um {lista.rotulo}</option>
                    {/* A Classificação gravada que saiu da lista aparece como
                        é, e não escondida atrás do texto de escolha. */}
                    {foraDaLista ? (
                      <option value={escolhido} data-papel="classificacao-ausente">
                        {`${escolhido} (não existe mais)`}
                      </option>
                    ) : null}
                    {itens.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome}
                      </option>
                    ))}
                  </select>
                  <Recusa id={idDoErro(lista.coluna)}>{erros[lista.coluna]}</Recusa>
                </div>
              );
            })}

            {/* ── Modalidade ── */}
            <div className="flex flex-col gap-1.5">
              <Rotulo para={idDe("modalidade")}>Modalidade</Rotulo>
              <select
                {...campo("modalidade", { ajuda: true })}
                value={valores.modalidade}
                onChange={mudar("modalidade")}
              >
                <option value="">Escolha a modalidade</option>
                {MODALIDADES.map((modalidade) => (
                  <option key={modalidade.valor} value={modalidade.valor}>
                    {modalidade.rotulo}
                  </option>
                ))}
              </select>
              <Recusa id={idDoErro("modalidade")}>{erros.modalidade}</Recusa>
              <p id={idDaAjuda("modalidade")} className="text-xs text-ink-muted">
                Necessária para abrir a vaga.
              </p>
            </div>

            {/* ── Localização ── */}
            <div className="flex flex-col gap-1.5">
              <Rotulo para={idDe("localizacao")}>Localização</Rotulo>
              <input
                type="text"
                {...campo("localizacao", { ajuda: true })}
                value={valores.localizacao}
                onChange={mudar("localizacao")}
                placeholder="São Paulo, SP"
              />
              <Recusa id={idDoErro("localizacao")}>{erros.localizacao}</Recusa>
              <p
                id={idDaAjuda("localizacao")}
                data-papel="ajuda-da-localizacao"
                className="text-xs text-ink-muted"
              >
                {ajudaDaLocalizacao}
              </p>
            </div>

            {/* ── Resumo ── */}
            <div className="flex flex-col gap-1.5">
              <Rotulo para={idDe("resumo")}>Resumo</Rotulo>
              <textarea
                rows={3}
                {...campo("resumo", { ajuda: true, extra: "resize-y" })}
                value={valores.resumo}
                onChange={mudar("resumo")}
              />
              <Recusa id={idDoErro("resumo")}>{erros.resumo}</Recusa>
              <p id={idDaAjuda("resumo")} className="text-xs text-ink-muted">
                Necessário para abrir a vaga.{" "}
                <span className="dado" data-papel="contador-do-resumo">
                  {tamanhoEmCaracteres(valores.resumo)}/{LIMITES_DA_VAGA.resumo}
                </span>
              </p>
            </div>

            {/* ── Link de Candidatura ── */}
            <div className="flex flex-col gap-1.5">
              <Rotulo para={idDe("link_de_candidatura")}>Link de Candidatura</Rotulo>
              <input
                type="url"
                inputMode="url"
                {...campo("link_de_candidatura", { ajuda: true, extra: "dado" })}
                value={valores.link_de_candidatura}
                onChange={mudar("link_de_candidatura")}
                placeholder="https://"
              />
              <Recusa id={idDoErro("link_de_candidatura")}>{erros.link_de_candidatura}</Recusa>
              <p id={idDaAjuda("link_de_candidatura")} className="text-xs text-ink-muted">
                Necessário para abrir a vaga. Endereço completo, começando com http:// ou https://.
              </p>
            </div>
          </form>
        </div>
      )}

      {/* A confirmação de saída: só chega a abrir quando há pendência. */}
      <DialogoDeConfirmacao
        aberto={confirmandoSaida}
        aoMudarAbertura={setConfirmandoSaida}
        titulo={TITULO_DA_SAIDA}
        descricao={descricaoDaSaida(valores.titulo, "desta vaga")}
        rotuloDeConfirmacao={ROTULO_PARA_SAIR}
        rotuloDeCancelamento={ROTULO_PARA_FICAR}
        aoConfirmar={sairDescartando}
      />
    </Moldura>
  );
}

/** A casca da tela: voltar, título e as ações da direita. */
function Moldura({ aoSair, voltarDesabilitado = false, titulo, subtitulo = null, acao = null, children }) {
  /* A janela não rola enquanto o formulário está aberto (cada painel interno
     tem a própria rolagem), e o valor anterior é RESTAURADO na saída: as
     outras telas do Painel rolam de propósito. */
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  return (
    <div className="painel flex h-screen flex-col overflow-hidden bg-surface-sunk text-ink">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Desabilitado enquanto uma escrita está em voo: sair no meio de
              uma criação deixaria a Vaga nascer sem ninguém na tela. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Voltar para a listagem"
            disabled={voltarDesabilitado}
            onClick={() => aoSair?.()}
            className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">{titulo}</h2>
            {subtitulo ? <p className="truncate text-xs text-ink-muted">{subtitulo}</p> : null}
          </div>
        </div>
        {acao}
      </div>
      {children}
    </div>
  );
}

/** O rótulo, com a obrigatoriedade dita por extenso. */
function Rotulo({ para, obrigatorio = false, children }) {
  return (
    <label htmlFor={para} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
      {children}
      {obrigatorio ? (
        <span className="text-xs font-medium text-ink-muted">(obrigatório)</span>
      ) : null}
    </label>
  );
}

/**
 * A recusa de um campo. Fica SEMPRE montada, e já nasce como região viva
 * (`role="alert"`, `aria-live`): o leitor de tela só anuncia a mudança de uma
 * região que ele já conhecia. Sem erro, ela fica vazia; o `aria-describedby`
 * do campo aponta para ela quando há erro.
 */
function Recusa({ id, children }) {
  const visivel = typeof children === "string" && children.trim() !== "";
  return (
    <p
      id={id}
      role="alert"
      aria-live="assertive"
      data-papel="recusa"
      className="flex items-start gap-1.5 text-xs font-medium text-destructive"
    >
      {visivel ? (
        <>
          <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{children}</span>
        </>
      ) : null}
    </p>
  );
}
