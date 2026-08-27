/**
 * A tela de edição de Post: o Editor para o corpo, a gaveta para o resto.
 *
 * É o primeiro consumidor do Editor da Story 2.4 e da função de escrita da
 * Story 2.5 — as duas existiam sem ninguém montá-las. O que esta tela
 * acrescenta é o que liga uma coisa à outra: os metadados, e o ciclo de vida do
 * endereço.
 *
 * ─── O SLUG É GERADO NA CRIAÇÃO, E DEPOIS É DO POST ─────────────────────────
 *
 * É a diferença entre um endereço e um rótulo. Enquanto o Post está nascendo, o
 * endereço acompanha o título — é conveniência, e ninguém compartilhou nada
 * ainda. Depois que o Post existe, corrigir uma palavra do título **não** pode
 * mudar o endereço: quem guardou o link continua tendo direito a chegar aqui.
 *
 * E, mesmo na criação, o acompanhamento para no instante em que o Autor digita
 * o endereço à mão: sobrescrever o que a pessoa acabou de escrever, porque ela
 * mexeu no título depois, é o mesmo desrespeito, em escala menor.
 *
 * ─── Salvar é sempre explícito, e por isso sair é protegido ─────────────────
 *
 * Não há salvamento automático — nem em intervalo, nem ao sair. Falha ao salvar
 * mantém o Autor aqui com o conteúdo intacto: a tela nunca volta para a listagem
 * sem que a gravação tenha acontecido de verdade.
 *
 * O preço de não salvar sozinho é que fechar a aba no momento errado apaga o que
 * foi escrito, e a tela paga esse preço perguntando — nas TRÊS formas de sair:
 * voltar para a listagem (o diálogo daqui), fechar a aba e recarregar (o evento
 * de descarregamento do navegador). A pergunta só aparece quando há alteração
 * pendente de verdade, e o ouvinte do navegador é **removido** assim que ela
 * some: uma pergunta que aparece sempre é treinada em duas semanas, e no dia em
 * que havia trabalho de verdade a pessoa clica em "sair" sem ler.
 *
 * ─── A gaveta recolhe, e o texto não estica ─────────────────────────────────
 *
 * Recolher devolve 294px ao redor do texto, e a medida de leitura NÃO muda: a
 * largura vira margem, porque `.artigo` fixa 68ch no próprio elemento e a área
 * de escrita centraliza (`mx-auto`, em `configuracao.js`). Se recolher esticasse
 * o texto, o Autor seria punido por pedir mais espaço para escrever.
 *
 * O estado da gaveta **não** é lembrado entre sessões: nada em `src/admin/`
 * toca armazenamento do navegador, e a previsibilidade vale mais que a memória.
 * Em tela estreita ela nasce recolhida, pelo mesmo mecanismo — não há uma
 * segunda regra responsiva no CSS para divergir desta.
 *
 * ─── As ações são DERIVADAS do Estado, nunca escritas à mão ─────────────────
 *
 * O botão único "Salvar" virou o conjunto que a máquina de
 * `domain/blog/transicoes.js` declara para o Estado atual — a MESMA tabela que
 * o servidor consulta para validar. Não há lista de botões neste arquivo: se
 * houvesse, ela divergiria da regra gravada na primeira mudança, e a divergência
 * apareceria como botão que falha ou, pior, como caminho que a barra esconde e
 * o servidor aceita.
 *
 * A pílula mostra onde o Post está antes de o Autor escolher para onde vai, e
 * publicar **não** tira ninguém daqui: o Estado muda na tela e aparece o link
 * para ver no site. Voltar para a listagem sem confirmação visível seria pedir
 * que a pessoa fosse conferir se deu certo.
 *
 * ─── AGENDAR: A CONFIRMAÇÃO DIZ A DATA, E A RECUSA TEM SAÍDA ────────────────
 *
 * Confirmar um agendamento repetindo o texto do campo não confirma nada — é o
 * que a pessoa acabou de digitar. A confirmação lê o instante que o SERVIDOR
 * gravou e o escreve por extenso, no fuso de apresentação: "quinta-feira, 3 de
 * setembro de 2026, às 09:00". É o único ponto do fluxo em que um erro de fuso
 * aparece antes de o Post ir ao ar — se a pessoa digita 9h e a tela confirma
 * 06:00, o engano aparece ali, e não três horas depois, para o leitor.
 *
 * Do outro lado, a recusa de uma data já vencida chega do servidor com a saída
 * NOMEADA, pela chave de uma ação da máquina. A tela procura essa chave na
 * tabela do Estado atual e oferece o botão na própria notificação: quem errou o
 * dia quase sempre queria publicar agora, e a diferença entre um beco e uma
 * bifurcação é justamente esse botão.
 *
 * O que esta tela **não** faz é publicar o Post na hora marcada. Não há nada
 * aqui esperando relógio: um Post agendado fica visível porque a política de
 * leitura o inclui quando `publicado_em` chega, com o Painel fechado.
 *
 * ─── O ARQUIVO TEM DOIS DONOS, E ISSO É DECLARADO ───────────────────────────
 *
 * A capa que já está GRAVADA num Post é do servidor: ela sai depois de a linha
 * mudar, com a chave de serviço, porque enquanto o Autor não salvou a capa que
 * está no ar continua sendo aquela.
 *
 * A capa ENVIADA nesta sessão e ainda não salva é do Autor, e é esta tela que a
 * limpa — com a sessão dele, pela política de remoção do bucket. Sem isso,
 * trocar a capa duas vezes antes de salvar deixava a primeira no bucket para
 * sempre: o servidor não sabe que ela existe, então nenhum salvamento futuro a
 * alcança, e ela nem vira resíduo porque não há quem a nomeie.
 *
 * **O que continua sem cobertura, e a decisão está aqui:** fechar a aba ou
 * recarregar depois de enviar e antes de salvar deixa o arquivo no bucket. A
 * limpeza exigiria trabalho no evento de descarregamento, que não espera
 * promessa — o navegador mata a página antes de a remoção sair —, e a
 * alternativa (uma varredura de órfãos) é infraestrutura que esta story não
 * tem. O custo é um arquivo inerte de no máximo 1 MB num bucket de leitura
 * pública, e o caminho comum — trocar e tirar a capa — está coberto.
 *
 * ─── O que esta tela NÃO faz ────────────────────────────────────────────────
 *
 * Não grava direto no banco: nenhum cliente escreve, e o único caminho é
 * `data/blog/escrita.js`, que fala com a função de servidor. Não decide se a
 * transição vale: ela oferece o que a máquina declara, e quem recusa de verdade
 * é o servidor — inclusive para quem chamar a API direto. E não tem campo de
 * Autor: ele é resolvido no servidor, a partir da Conta autenticada.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ExternalLink, Eye, Loader2 } from "lucide-react";

/* A pergunta "dá para ver este Post no site?" e o endereço público moram em
   `acoes.js`, e a listagem faz a MESMA pergunta pelas mesmas funções. Enquanto
   cada tela montava a sua, o comentário de lá prometia "escrito uma vez" e o
   projeto tinha duas — e duas divergem no dia em que o prefixo do blog mudar,
   com a divergência aparecendo como um link que erra. */
import { DESTINO_SITE, destinoDeVer, rotuloDeVer } from "@/admin/blog/acoes";
import Editor from "@/admin/blog/Editor";
import GavetaDeMetadados from "@/admin/blog/GavetaDeMetadados";
import PilulaDeEstado from "@/admin/blog/PilulaDeEstado";
import { larguraDaGaveta, nasceAberta } from "@/admin/blog/gaveta";
import {
  FRASES_DE_FALTA,
  confirmacaoDoAgendamento,
  corpoDoPedido,
  faltandoNaGaveta,
  textoDaDataDoCampo,
  valoresDoPost,
  valoresVazios,
} from "@/admin/blog/metadados";
import {
  ROTULO_PARA_FICAR,
  ROTULO_PARA_SAIR,
  TITULO_DA_SAIDA,
  descricaoDaSaida,
  haPendencia,
  instantaneo,
} from "@/admin/blog/pendencia";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import {
  ROTULO_PARA_MANTER_ENDERECO,
  ROTULO_PARA_TROCAR_ENDERECO,
  TITULO_DA_TROCA_DE_ENDERECO,
  descricaoDaTrocaDeEndereco,
} from "@/admin/blog/enderecos";
/* A DECISAO vem do dominio, e e a mesma que o caminho de escrita consulta para
   aposentar o endereco anterior. Uma regra propria aqui avisaria de uma quebra
   que o servidor nao vai causar, ou calaria sobre uma que vai. */
import { trocaDeEnderecoQuebraLinks } from "@/domain/blog/slug";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { ERRO_CONFLITO, salvarPost } from "@/data/blog/escrita";
/* O ENVIO DA CAPA (Story 3.1). Ele mora aqui, e não na gaveta, porque a gaveta
   é um componente controlado que não conhece rede — e porque é esta tela que
   já sabe distinguir nascimento de edição e coordenar o que está em curso. */
import {
  baseDoProjeto,
  enviarImagemDeCapa,
  removerImagemDeCapa,
} from "@/data/blog/arquivos";
import {
  CAMPOS_DE_IMAGEM_DA_GAVETA,
  ENVIO_EM_CURSO,
  ENVIO_PARADO,
  ENVIO_RECUSADO,
  falaDoResiduo,
} from "@/admin/blog/capa";
import { lerPostDoPainelPorId } from "@/data/blog/posts";
import { listarCategorias, listarTagsDoPainel, listarTagsDoPostNoPainel } from "@/data/blog/taxonomia";
import { dominioDoSite } from "@/admin/blog/dominio";
import { CAMPOS_DE_SEO } from "@/domain/blog/compartilhamento";
import { paraCampoDeInstante } from "@/domain/blog/formato";
import { documentoVazio } from "@/domain/blog/schema";
import { gerarSlug, problemaNoSlug } from "@/domain/blog/slug";
import {
  ENFASE_PRINCIPAL,
  ESTADO_INICIAL,
  acaoDoEstado,
  acoesDoEstado,
} from "@/domain/blog/transicoes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function EditorDePost({ postId = null, aoSair, aoSalvar }) {
  /* O identificador VIVE em estado, e não só na propriedade: depois de o Post
     nascer, esta mesma tela passa a estar editando — e é essa transição que
     desliga a geração automática do endereço. Sem ela, salvar um Post novo e
     continuar escrevendo faria o endereço voltar a perseguir o título de um
     Post que já existe. */
  const [id, setId] = useState(postId);
  const criando = id === null || id === undefined || id === "";

  /* Um prefixo por instância, do modal de agendamento — a verificação monta
     dois `EditorDePost` no mesmo bloco de propósito, e um `id` fixo faria o
     rótulo do campo de um apontar para o input do outro. */
  const idDoAgendamento = useId();

  const [carregando, setCarregando] = useState(!criando);
  const [erroDeCarga, setErroDeCarga] = useState(null);

  const [valores, setValores] = useState(valoresVazios);
  /* O endereço que o SERVIDOR tem, que não é o do campo.
     Quem editou o endereço e ainda não salvou tem no formulário um caminho que
     o servidor nunca viu — e "Ver no site" com ele abriria, em aba nova, uma
     página que não existe. O que está no ar é o que está gravado. */
  const [slugGravado, setSlugGravado] = useState("");
  /* O RETRATO DO POST COMO FOI CARREGADO — e não como está na tela.
     `trocaDeEnderecoQuebraLinks` compara o endereço de agora com o que
     está GRAVADO; comparar `valores` consigo mesmo daria `false` sempre. E o
     Estado e a data precisam ser os do banco pelo mesmo motivo: o Autor pode
     ter acabado de mudar os dois na gaveta, e a pergunta é sobre o Post que
     está no ar, não sobre o que ele quer que ele vire. */
  const [originalDoBanco, setOriginalDoBanco] = useState(null);
  const [documento, setDocumento] = useState(documentoVazio);
  const [chaveDoEditor, setChaveDoEditor] = useState("novo");

  /* A leitura das Tags do Post falhou? O campo abriria vazio, e uma lista
     vazia é um pedido legítimo de "nenhuma tag" — o salvamento apagaria todas.
     Enquanto isto estiver ligado, `tags` NÃO viaja no pedido, e o servidor
     preserva o que está gravado. */
  const [tagsIndisponiveis, setTagsIndisponiveis] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [tags, setTags] = useState([]);

  const [faltando, setFaltando] = useState([]);
  const [problemaNoEndereco, setProblemaNoEndereco] = useState(null);

  /* ── O ENVIO DA CAPA (Story 3.1) ────────────────────────────────────────
     Duas informações, e não uma: a SITUAÇÃO (parado, enviando, recusado) e a
     FRASE da recusa. Guardar só a frase faria "sem recusa" e "recusa vazia"
     serem o mesmo estado, e a região viva do progresso não teria como saber se
     deve anunciar. A frase vem pronta de quem recusou — o vocabulário do
     domínio, quando é tamanho ou espécie; o erro tipado da camada, quando é
     rede ou permissão. Esta tela não escreve nenhuma das duas. */
  /* ─── UM ENVIO POR CAMPO, DESDE A STORY 3.4 ────────────────────────────
     A gaveta ganhou um SEGUNDO controle de imagem — a Imagem de
     Compartilhamento —, e os dois podem estar em situações diferentes ao mesmo
     tempo. Um par de estados compartilhado faria o giro do envio de um aparecer
     sobre o outro, e a recusa de um acusar o campo errado. O mapa é vazio no
     começo, e campo ausente é "parado". */
  const [envios, setEnvios] = useState({});
  const situacaoDe = useCallback(
    (campo) => envios[campo]?.situacao ?? ENVIO_PARADO,
    [envios],
  );
  const anotarEnvio = useCallback((campo, situacao, recusa = null) => {
    setEnvios((atuais) => ({ ...atuais, [campo]: { situacao, recusa } }));
  }, []);

  /* AS CAPAS QUE SUBIRAM E O SERVIDOR NUNCA VIU.
     Trocar a capa duas vezes antes de salvar deixava a primeira no bucket para
     sempre: o servidor não sabe que ela existe, então nenhum salvamento futuro
     a alcança — e ela nem vira resíduo, porque não há quem a nomeie. O que
     está aqui é do Autor, e é esta tela que limpa, com a sessão dele.

     `ref` e não estado: nada na tela depende disto para desenhar, e uma
     renderização a mais por envio não paga nada. */
  const capasNaoSalvas = useRef(new Set());

  /**
   * Descarta do Storage um endereço que só existe nesta sessão.
   *
   * ─── E NUNCA UM QUE O OUTRO CAMPO AINDA USA (Story 3.4) ─────────────────
   *
   * Os dois campos de imagem podem apontar para o MESMO arquivo — usar a capa
   * também como imagem de compartilhamento é o caso mais provável de todos. Sem
   * a conferência, trocar a capa apagaria do bucket o arquivo que a Imagem de
   * Compartilhamento continua apontando, e o Post seria salvo com uma prévia de
   * endereço morto. A guarda irmã, do lado do servidor, está em
   * `removerImagensAnteriores`.
   */
  const descartarSeNaoSalva = useCallback(async (endereco, exceto = null) => {
    const alvo = String(endereco ?? "").trim();
    if (alvo === "" || !capasNaoSalvas.current.has(alvo)) return;
    const emUsoPeloOutro = CAMPOS_DE_IMAGEM_DA_GAVETA.some(
      (coluna) =>
        coluna !== exceto && String(valoresAgora.current[coluna] ?? "").trim() === alvo,
    );
    if (emUsoPeloOutro) return;
    capasNaoSalvas.current.delete(alvo);
    /* Falha aqui NÃO vira aviso: o Autor não pediu esta remoção, ela é faxina
       de uma decisão que ele já desfez, e um erro sobre um arquivo que ele nem
       sabe que existe é ruído. O que sobra é um arquivo inerte num bucket de
       leitura pública — a mesma escolha, e a mesma razão, do resíduo do
       servidor. */
    await removerImagemDeCapa(alvo);
  }, []);
  /* Qual ação está em curso, e não apenas "está salvando": é ela que ganha o
     giro e some do caminho, enquanto as outras só ficam indisponíveis. Um
     spinner em quatro botões ao mesmo tempo não diz o que está acontecendo. */
  const [acaoEmCurso, setAcaoEmCurso] = useState(null);
  const salvando = acaoEmCurso !== null;

  /* A RAIZ DO PROJETO, lida uma vez. Ela é constante durante a vida da tela — o
     ambiente não muda no meio da edição — e a gaveta a usa só para decidir em
     que modo o campo de capa abre. `""` quando o ambiente não a declara, e a
     gaveta trata isso como "não sei", que abre o campo de endereço. */
  const baseDaCapaDoProjeto = useMemo(() => baseDoProjeto(), []);

  /* O ESTADO DO POST vive aqui, e é dele que as ações são derivadas.
     Post que está nascendo começa em `rascunho` — o mesmo padrão da coluna, e
     a mesma constante que o servidor usa como Estado de partida na criação. */
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const acoes = useMemo(() => acoesDoEstado(estado), [estado]);

  /* A mesma lista, separada por ênfase: em tela estreita a ação de sempre
     fica visível e as decisões vão para o menu. A separação sai da máquina
     de transições, não de uma segunda lista escrita à mão. */
  const acoesPrincipais = useMemo(
    () => acoes.filter((a) => a.enfase === ENFASE_PRINCIPAL),
    [acoes],
  );
  const acoesSecundarias = useMemo(
    () => acoes.filter((a) => a.enfase !== ENFASE_PRINCIPAL),
    [acoes],
  );


  /* A gaveta NASCE aberta, e recolhida quando a tela é estreita. O estado é
     de montagem: nada é lido de armazenamento do navegador, e nada é escrito
     nele — toda abertura de Post começa igual, o que é o requisito. */
  const [gavetaAberta, setGavetaAberta] = useState(() =>
    nasceAberta(typeof window === "undefined" ? null : window.innerWidth),
  );
  const alternarGaveta = useCallback(() => setGavetaAberta((atual) => !atual), []);

  /* O retrato do último estado salvo. `null` enquanto a tela carrega: não há o
     que comparar, e perguntar antes de haver conteúdo é a confirmação inútil
     que ensina a ignorar confirmações. */
  const [referencia, setReferencia] = useState(() =>
    criando ? instantaneo(valoresVazios(), documentoVazio()) : null,
  );
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  /* A ação que está esperando a confirmação do endereço, ou `null`. Guardar a
     AÇÃO, e não um booleano, é o que faz o diálogo devolver o Autor ao mesmo
     botão que ele apertou: publicar e salvar-rascunho passam por aqui, e
     confirmar um levando ao outro seria pior que não perguntar. */
  const [trocaDeEnderecoPendente, setTrocaDeEnderecoPendente] = useState(null);

  /* ── O MODAL DE AGENDAMENTO (correção de UI/UX do Editor) ────────────────
     O campo de data deixou de morar na gaveta — ele era redundante com este
     botão, que hoje abre um modal em vez de só cobrar o campo de novo.

     `agendamentoPendente` guarda a AÇÃO esperando confirmação (`agendar` ou
     `reagendar`), pela mesma razão de `trocaDeEnderecoPendente`: o Autor
     confirma e cai na mesma ação que apertou.

     `rascunhoDeData` é um RASCUNHO LOCAL ao modal, e não um espelho de
     `valores.publicado_em` atualizado a cada tecla: ele só é sincronizado com
     o que está gravado no instante em que o modal ABRE (`abrirAgendamento`).
     Escrever em `valores` a cada tecla faria "Cancelar" não desfazer nada —
     o valor já teria sido escrito no estado que `salvar` usa. */
  const [agendamentoPendente, setAgendamentoPendente] = useState(null);
  const [rascunhoDeData, setRascunhoDeData] = useState("");
  /* A recusa do SERVIDOR por `publicado_em` — via o mecanismo genérico de
     `erro.faltando` — mostra aqui dentro, e não como marca num campo da
     gaveta: o campo saiu de lá. `null` quando não há recusa em curso. */
  const [erroDoAgendamento, setErroDoAgendamento] = useState(null);

  /* O ESPELHO DOS VALORES, para a faxina da capa ler o endereço de AGORA.
     `enviarCapa` e `removerCapa` não podem depender de `valores`: elas seriam
     recriadas a cada tecla digitada, e a gaveta recebe as duas como
     propriedade. O espelho é atualizado a cada renderização e lido dentro do
     callback, que é o que mantém as duas estáveis e corretas. */
  const valoresAgora = useRef(valores);
  valoresAgora.current = valores;

  const retratoAtual = useMemo(
    () => instantaneo(valores, documento),
    [valores, documento],
  );
  const pendente = haPendencia(retratoAtual, referencia);

  /* ── PARA ONDE A AÇÃO DE VER LEVA (Story 2.13) ──────────────────────────
     A tela NÃO decide: ela monta o Post como ele está agora — identificador,
     endereço, Estado e título — e pergunta a `acoes.js`, o mesmo módulo que a
     linha da listagem consulta. Uma segunda decisão aqui é como a divergência
     entre as duas telas nasceria: uma oferecendo a prévia e a outra escondendo
     a ação, para o mesmo Post.

     O ENDEREÇO É O GRAVADO, e não o do campo. Quem editou o endereço e ainda
     não salvou tem no formulário um caminho que o servidor nunca viu: abri-lo
     em aba nova levaria a uma página que não existe. O que está no ar é o que
     está gravado, e é para lá que o link do site aponta.

     A PENDÊNCIA VIAJA JUNTO para a prévia. Ela lê do banco: sem o aviso, o
     Autor confere um texto que não é o que está na tela dele. */
  const postParaVer = {
    id,
    slug: slugGravado,
    estado,
    titulo: valores.titulo,
  };
  const destinoDaVisualizacao = destinoDeVer(postParaVer, { pendente });

  /* O endereço foi digitado à mão? A partir daí ele para de acompanhar o
     título, mesmo durante a criação. É `ref` e não estado porque nada na tela
     depende dele para desenhar — e uma renderização a mais por tecla, no
     caminho que a story exige abaixo de 100 ms, é o tipo de custo que se paga
     sem perceber. */
  const enderecoDigitadoAMao = useRef(false);

  /* ── Carga ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    let vivo = true;

    (async () => {
      /* AS SUGESTÕES VÊM DO PAINEL, e não do cliente público: a política
         anônima de `tags` só devolve Tag associada a Post visível, então uma
         Tag criada num rascunho nunca seria sugerida — que é exatamente o caso
         em que o Autor recria "Atendimento" com outra grafia. */
      const [c, t] = await Promise.all([listarCategorias(), listarTagsDoPainel()]);
      if (!vivo) return;
      if (c.ok) setCategorias(c.dados);
      if (t.ok) setTags(t.dados);
      /* Falha ao ler o vocabulário NÃO impede escrever: a gaveta abre com a
         lista vazia e o resto da tela funciona. Erro que trava o Editor inteiro
         porque a lista de tags não veio seria pior que a lista faltando. */
      if (!c.ok) {
        notificarErro(
          "Não deu para carregar as categorias",
          "Você pode escrever normalmente; escolha a categoria depois de recarregar o Painel.",
        );
      }
      /* A FALHA DAS TAGS DEIXOU DE SER SILENCIOSA (Story 2.14). Ela nunca
         impediu escrever — as tags passaram a ser digitadas, e digitar não
         depende da lista —, mas o que se perde é a SUGESTÃO das já usadas, e
         quem não sabe disso acaba recriando "Atendimento" com outra grafia. */
      if (!t.ok) {
        notificarErro(
          "Não deu para carregar as tags já usadas",
          "Você pode digitar tags normalmente; as sugestões voltam quando o Painel recarregar.",
        );
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (criando) {
      setCarregando(false);
      return undefined;
    }
    let vivo = true;
    setCarregando(true);
    setErroDeCarga(null);
    // Enquanto não se sabe o que está gravado, não há pendência a rastrear.
    setReferencia(null);

    (async () => {
      const [post, tagsDoPost] = await Promise.all([
        lerPostDoPainelPorId(id),
        listarTagsDoPostNoPainel(id),
      ]);
      if (!vivo) return;
      if (!post.ok) {
        setErroDeCarga(post.erro);
        setCarregando(false);
        return;
      }
      /* AS TAGS DO POST, E O QUE ACONTECE SE ELAS NÃO VIEREM.
         O campo abriria vazio, e o primeiro salvamento APAGARIA as que existiam
         — o pedido diz "estas são as tags", e uma lista vazia é um pedido de
         nenhuma tag. A falha continua não travando o Editor, mas ela é DITA:
         quem lê o aviso sabe que precisa recarregar antes de salvar. */
      setTagsIndisponiveis(!tagsDoPost.ok);
      if (!tagsDoPost.ok) {
        notificarErro(
          "Não deu para carregar as tags deste post",
          "Elas ficam como estão: o salvamento não mexe nelas até o Painel recarregar.",
        );
      }
      const doBanco = valoresDoPost(post.dados, tagsDoPost.ok ? tagsDoPost.dados : []);
      const conteudo = post.dados.conteudo ?? documentoVazio();
      setValores(doBanco);
      setSlugGravado(typeof post.dados.slug === "string" ? post.dados.slug : "");
      setOriginalDoBanco({
        slug: post.dados.slug,
        estado: post.dados.estado,
        publicado_em: post.dados.publicado_em,
      });
      setDocumento(conteudo);
      /* O Estado vem do banco, e a camada de dados já o conferiu contra o
         vocabulário fechado — linha com Estado desconhecido vira erro tipado lá,
         e não pílula em branco aqui. */
      setEstado(post.dados.estado);
      // O que acabou de ser lido É o que está gravado: é este o retrato com que
      // tudo o que vier depois será comparado.
      setReferencia(instantaneo(doBanco, conteudo));
      // Trocar de Post é trocar de Editor: o conteúdo inicial é lido uma vez, e
      // a `key` é o mecanismo que o componente da Story 2.4 documenta.
      setChaveDoEditor(String(post.dados.id));
      /* O endereço de um Post que já existe nunca acompanha o título — e marcar
         isto aqui é a segunda trava, além de `criando`: se algum dia esta tela
         puder criar e editar no mesmo ciclo, a regra continua valendo. */
      enderecoDigitadoAMao.current = true;
      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
    // `id` só muda quando o Post nasce, e aí o efeito relê a linha gravada —
    // que é exatamente o que se quer: o que está na tela passa a ser o que
    // está no banco.
  }, [id, criando]);

  /* ── Mudanças na gaveta ──────────────────────────────────────────────── */

  const mudarCampo = useCallback(
    (campo, valor) => {
      setValores((atuais) => {
        if (campo === "slug") {
          enderecoDigitadoAMao.current = true;
          return { ...atuais, slug: valor };
        }

        if (campo !== "titulo") return { ...atuais, [campo]: valor };

        /* O ENDEREÇO ACOMPANHA O TÍTULO SÓ NA CRIAÇÃO.
           Post que já existe não vê o endereço mudar — nem publicado, nem
           rascunho. E, mesmo criando, o acompanhamento para assim que o Autor
           digita o endereço à mão. */
        if (!criando || enderecoDigitadoAMao.current) {
          return { ...atuais, titulo: valor };
        }
        const gerado = gerarSlug(valor);
        return { ...atuais, titulo: valor, slug: gerado.ok ? gerado.slug : "" };
      });

      // A marca de campo faltante some assim que a pessoa preenche: mantê-la
      // até o próximo salvamento faria a tela acusar um erro já corrigido.
      setFaltando((atuais) => atuais.filter((c) => c !== campo));
      if (campo === "slug" || campo === "titulo") setProblemaNoEndereco(null);
    },
    [criando],
  );

  /* ── A capa: escolher, enviar, e tirar ───────────────────────────────── */

  /**
   * O arquivo escolhido vai para o Storage, e o que volta é o ENDEREÇO.
   *
   * A recusa de espécie e de tamanho acontece dentro de `enviarImagemDeCapa`,
   * **antes de qualquer rede** — é lá que o vocabulário do domínio mora, e
   * repetir a conferência aqui criaria a segunda regra que a story existe para
   * não ter. O que esta tela faz é desenhar a situação e guardar o endereço.
   *
   * O arquivo ANTERIOR não é removido aqui. Ele sai no salvamento, do lado do
   * servidor, depois de a linha ser gravada: enquanto o Autor não salvou, a
   * capa que está no ar continua sendo a antiga, e apagá-la agora deixaria o
   * Post publicado apontando para um arquivo que não existe mais.
   */
  const enviarImagem = useCallback(async (campo, arquivo) => {
    anotarEnvio(campo, ENVIO_EM_CURSO, null);

    const resultado = await enviarImagemDeCapa(arquivo);

    if (!resultado.ok) {
      anotarEnvio(campo, ENVIO_RECUSADO, resultado.erro.mensagem);
      /* A NOTIFICAÇÃO E A MARCA NO CAMPO, as duas. A marca fica onde a pessoa
         vai olhar de novo; a notificação é o que ela ouve agora. Nada do
         formulário é descartado: repetir o envio é escolher outro arquivo, e o
         resto do Post continua exatamente onde estava. */
      notificarErro("Não deu para enviar a imagem", resultado.erro.mensagem);
      return;
    }

    anotarEnvio(campo, ENVIO_PARADO, null);
    /* A ANTERIOR SAI, se ela também era desta sessão. A que veio do banco NÃO
       sai daqui: ela ainda é a imagem que está no ar até o salvamento. E o
       `exceto` é ESTE campo: o endereço que está saindo dele não conta como
       "ainda em uso" por ele mesmo. */
    await descartarSeNaoSalva(valoresAgora.current[campo], campo);
    capasNaoSalvas.current.add(resultado.dados.url);
    setValores((atuais) => ({ ...atuais, [campo]: resultado.dados.url }));
    /* A MARCA DE "FALTA A DESCRIÇÃO" NÃO SOME AQUI, e a ausência é a decisão:
       trocar a imagem não descreve a nova. A versão anterior filtrava
       `"imagem_url"` de `faltando` — um campo que nunca entra nessa lista —,
       então o filtro era um no-op e o comentário ao lado falava de outro
       campo. Quem tira a marca é `mudarCampo`, quando a descrição é digitada. */
  }, [descartarSeNaoSalva, anotarEnvio]);

  /**
   * Tirar a capa é limpar o ENDEREÇO, e nada mais.
   *
   * O arquivo continua no bucket até o salvamento: é lá, no servidor, que ele
   * sai — depois de a linha ser gravada sem ele. Removê-lo daqui faria um
   * "removi sem querer, vou desfazer" perder o arquivo de vez, e faria um Post
   * publicado apontar para um arquivo apagado enquanto o Autor pensa.
   *
   * A descrição vai junto: descrição órfã de uma imagem que não existe mais
   * reapareceria como texto alternativo da próxima capa.
   */
  const removerImagem = useCallback(async (campo) => {
    anotarEnvio(campo, ENVIO_PARADO, null);
    /* Se a imagem era desta sessão, ela sai do bucket agora: o servidor nunca a
       viu, então ninguém mais viria removê-la. Se ela veio do banco, fica —
       quem a remove é o servidor, depois de a linha ser gravada sem ela. */
    await descartarSeNaoSalva(valoresAgora.current[campo], campo);
    /* A DESCRIÇÃO SAI JUNTO — mas só do campo que TEM uma. `imagem_alt` é do
       par da capa; a Imagem de Compartilhamento não tem coluna de texto
       alternativo, e limpá-la aqui apagaria a descrição da capa por causa de
       uma remoção que não foi dela. */
    const daCapa = campo === "imagem_url";
    setValores((atuais) => ({
      ...atuais,
      [campo]: "",
      ...(daCapa ? { imagem_alt: "" } : {}),
    }));
    if (daCapa) setFaltando((atuais) => atuais.filter((c) => c !== "imagem_alt"));
  }, [descartarSeNaoSalva, anotarEnvio]);

  const mudarDocumento = useCallback((doc) => {
    setDocumento(doc);
    setFaltando((atuais) => atuais.filter((c) => c !== "conteudo"));
  }, []);

  const avisarSobreConteudo = useCallback((aviso) => {
    if (!aviso) return;
    notificarErro(
      aviso.gravidade === "recusado"
        ? "Não conseguimos ler o conteúdo gravado"
        : "Parte do conteúdo colado foi removida",
      aviso.mensagem,
    );
  }, []);

  /* ── Salvar ──────────────────────────────────────────────────────────── */

  /* A saída oferecida na notificação de recusa precisa chamar `salvar` — que é
     justamente quem monta a notificação. A referência quebra o laço sem
     recriar a função a cada renderização: quando o Autor clica no botão da
     notificação, ela já aponta para a versão mais recente, com os valores que
     a tela tem naquele momento. */
  const salvarDeNovo = useRef(null);

  const salvar = useCallback(async (
    acao,
    { enderecoConfirmado = false, publicadoEmForcado = null } = {},
  ) => {
    if (salvando) return;

    /* O DADO DO MODAL DE AGENDAMENTO, quando `confirmarAgendamento` o passa.
       `valores.publicado_em` só é atualizado por `setValores`, que agenda
       para o PRÓXIMO render — lê-lo aqui, no mesmo instante em que o Autor
       confirmou o modal, ainda veria o valor antigo. O que muda com o
       agendamento é só esta coluna; o resto de `valores` continua valendo. */
    const dataDePublicacao =
      publicadoEmForcado !== null ? publicadoEmForcado : valores.publicado_em;
    const valoresParaSalvar =
      publicadoEmForcado !== null
        ? { ...valores, publicado_em: publicadoEmForcado }
        : valores;

    /* SALVAR COM UMA IMAGEM AINDA SUBINDO GRAVARIA O POST SEM ELA.
       O endereço só existe depois que o envio conclui; salvar antes mandaria
       `null` na coluna e o Autor veria a miniatura aparecer sobre um Post que
       já foi gravado sem ela — e descobriria no site. Esperar é o certo, e
       dizer que se está esperando é o que separa esperar de travar.

       A guarda vale para os DOIS campos de imagem desde a Story 3.4, e a lista
       vem de `capa.js`: percorrer só `imagem_url` deixaria a Imagem de
       Compartilhamento com exatamente o defeito que esta guarda existe para
       impedir, e o silêncio seria idêntico. */
    const subindo = CAMPOS_DE_IMAGEM_DA_GAVETA.filter(
      (campoDeImagem) => situacaoDe(campoDeImagem) === ENVIO_EM_CURSO,
    );
    if (subindo.length > 0) {
      notificarErro(
        "Uma imagem ainda está subindo",
        "Espere o envio terminar e salve de novo — assim o post já nasce com ela.",
      );
      return;
    }

    /* A ação que EXIGE data recusa aqui, com a frase da tela.
       O banco recusaria de qualquer jeito — a restrição `posts_publicavel_
       exige_data` existe desde a Story 2.1 — e o servidor recusa antes dele.
       O que se ganha recusando aqui é a REABERTURA do modal com a recusa
       dentro dele: o campo saiu da gaveta, então não há mais "campo certo"
       para marcar por fora — `setFaltando(["publicado_em"])` marcaria um
       campo que não existe mais ali. */
    if (acao.exigeData && String(dataDePublicacao ?? "").trim() === "") {
      setErroDoAgendamento(FRASES_DE_FALTA.publicado_em);
      setAgendamentoPendente(acao);
      return;
    }

    /* A conferência local não substitui a do servidor — ela evita a viagem. O
       servidor recusa do mesmo jeito, inclusive para quem chamar a API direto,
       e é a resposta DELE que a tela usa quando ela chega. */
    const faltantes = faltandoNaGaveta(valores);
    if (faltantes.length > 0) {
      setFaltando(faltantes);
      notificarErro(
        "Falta preencher um campo obrigatório",
        "O campo está marcado na gaveta ao lado. Preencha e salve de novo.",
      );
      return;
    }

    const problema = problemaNoSlug(valores.slug);
    if (problema !== null) {
      /* Endereço vazio num Post que está nascendo quase sempre é o título só
         com símbolos: a frase da geração explica melhor que a do formato. */
      const doTitulo = criando && String(valores.slug ?? "").trim() === ""
        ? gerarSlug(valores.titulo)
        : { ok: true };
      setProblemaNoEndereco(doTitulo.ok ? problema : doTitulo.motivo);
      notificarErro(
        "O endereço do post não serve",
        doTitulo.ok ? problema : doTitulo.motivo,
      );
      return;
    }

    /* ─── TROCAR O ENDEREÇO DE UM POST QUE JÁ ESTEVE NO AR (Story 4.5) ───

       A guarda fica AQUI, depois de todas as recusas e antes de qualquer
       escrita. Antes das recusas, o Autor confirmaria uma troca de endereço
       para depois descobrir que faltava a data — e teria confirmado à toa.
       Depois da escrita não seria confirmação; seria aviso.

       O caminho de escrita já faz a coisa certa sozinho: o endereço anterior
       é aposentado e passa a redirecionar. O que ele não pode decidir é se a
       pessoa ACEITA o que isso custa — links já compartilhados passando a dar
       um pulo, e o endereço antigo reservado para sempre. */
    if (
      !enderecoConfirmado &&
      trocaDeEnderecoQuebraLinks({ original: originalDoBanco, slug: valores.slug })
    ) {
      setTrocaDeEnderecoPendente(acao);
      return;
    }

    /* O DESTINO viaja no pedido, e é o servidor que decide se ele vale.
       A tela oferecer só o que a máquina declara é conveniência; a garantia é
       a validação do outro lado, contra a mesma máquina e a partir do Estado
       que está GRAVADO. */
    const pedido = corpoDoPedido({
      id: criando ? null : id,
      valores: valoresParaSalvar,
      documento,
      estado: acao.destino,
      omitirTags: tagsIndisponiveis,
    });
    if (!pedido.ok) {
      /* `publicado_em` não tem mais campo na gaveta: a recusa reabre o modal
         de agendamento, em vez de marcar um campo que não existe mais ali. */
      if (pedido.campo === "publicado_em") {
        setErroDoAgendamento(pedido.motivo);
        setAgendamentoPendente(acao);
      } else {
        setFaltando([pedido.campo]);
      }
      notificarErro("Não deu para salvar o post", pedido.motivo);
      return;
    }

    setAcaoEmCurso(acao.chave);
    const resultado = await salvarPost(pedido.corpo);
    setAcaoEmCurso(null);

    if (!resultado.ok) {
      /* NADA é descartado por falha: o Autor continua nesta tela, com os
         valores e o documento onde estavam, e a pendência continua pendente —
         é justamente agora que a proteção contra sair precisa estar de pé. */
      const { erro } = resultado;
      if (Array.isArray(erro.faltando) && erro.faltando.length > 0) {
        /* `publicado_em` NÃO vira marca de campo: a gaveta não tem mais um
           campo correspondente desde que a data passou a morar no modal de
           agendamento (mecanismo genérico de `erro.faltando`, achado da
           revisão desta correção). A saída é reabrir o modal com a frase do
           servidor dentro dele — nunca um campo marcado que ninguém vê. */
        setFaltando(erro.faltando.filter((campo) => campo !== "publicado_em"));
        if (erro.faltando.includes("publicado_em")) {
          setErroDoAgendamento(erro.mensagem);
          setAgendamentoPendente(acao);
        }
      }
      if (erro.tipo === ERRO_CONFLITO) setProblemaNoEndereco(erro.mensagem);
      /* A RECUSA QUE TEM SAÍDA VIRA UMA BIFURCAÇÃO, E NÃO UM BECO.
         O servidor nomeia a alternativa pela CHAVE de uma ação (hoje só
         `publicar`, quando o agendamento é para o passado), e a tela a procura
         na máquina, no Estado em que o Post está agora. É a máquina que decide
         se o botão existe: chave que ela não declare para este Estado não vira
         oferta nenhuma, e a tela nunca oferece um caminho que o servidor
         recusaria em seguida. */
      const saida = erro.alternativa ? acaoDoEstado(estado, erro.alternativa) : null;
      notificarErro(
        "Não deu para salvar o post",
        // A frase do servidor já diz o que houve E o que fazer; repetir uma
        // genérica por cima dela seria trocar informação por ruído.
        erro.mensagem,
        saida
          ? { rotulo: saida.rotulo, aoAcionar: () => salvarDeNovo.current?.(saida) }
          : null,
      );
      return;
    }

    setFaltando([]);
    setProblemaNoEndereco(null);

    const gravado = resultado.dados?.post ?? null;

    /* A CONFIRMAÇÃO DE UM AGENDAMENTO DIZ A DATA, POR EXTENSO.
       Devolver o texto cru do campo não confirma nada — ele é o que a pessoa
       acabou de digitar. O que ela precisa ver é a data que o SISTEMA entendeu,
       lida do instante que o servidor gravou e escrita no fuso de apresentação:
       é o único ponto do fluxo em que um erro de fuso aparece antes de o Post
       sair no ar, e o dia da semana por extenso é o que o torna óbvio. */
    const detalheDaConfirmacao =
      confirmacaoDoAgendamento(gravado, valores.titulo) ?? valores.titulo;

    /* O RESÍDUO DA TROCA DE CAPA, quando existe. Mesma regra da listagem: o
       Post foi salvo, e só o arquivo anterior não saiu. */
    const sobrou = falaDoResiduo(resultado.dados?.residuo);

    notificarSucesso(
      /* A confirmação vem da AÇÃO, não do Estado: "Post publicado" é o que
         aconteceu, e "Post salvo" para tudo deixaria o Autor sem saber se a
         publicação foi mesmo pedida. A exceção é o Post que nasceu por um
         salvamento comum, em que "Post criado" diz mais que "Rascunho salvo". */
      resultado.dados?.criado && acao.chave === "salvar" ? "Post criado" : acao.confirmacao,
      detalheDaConfirmacao,
    );
    if (sobrou) notificarErro(sobrou.oQueHouve, sobrou.oQueFazer);

    /* O QUE A TELA MOSTRA PASSA A SER O QUE O SERVIDOR GRAVOU.
       O endereço pode ter sido aposentado e trocado lá; a data de publicação
       pode ter sido preenchida (publicar agora) ou PRESERVADA contra o que a
       gaveta mandava (salvar um Post no ar). Mostrar o que a tela tinha seria
       mostrar o passado — e, no caso da data, uma mentira que só apareceria na
       próxima abertura do Post. */
    const valoresGravados = {
      ...valores,
      ...(typeof gravado?.slug === "string" ? { slug: gravado.slug } : {}),
      ...(gravado && Object.hasOwn(gravado, "publicado_em")
        ? { publicado_em: gravado.publicado_em ? paraCampoDeInstante(gravado.publicado_em) : "" }
        : {}),
      /* A CAPA GRAVADA (Story 3.1). O servidor pode ter recusado o endereço, ou
         limpado a descrição junto com a imagem — o que a tela mostra passa a
         ser o que ficou na linha, e não o que ela mandou. */
      ...(gravado && Object.hasOwn(gravado, "imagem_url")
        ? { imagem_url: gravado.imagem_url ?? "" }
        : {}),
      ...(gravado && Object.hasOwn(gravado, "imagem_alt")
        ? { imagem_alt: gravado.imagem_alt ?? "" }
        : {}),
      /* OS TRÊS CAMPOS DE SEO GRAVADOS (Story 3.4), pela mesma razão da capa:
         o servidor pode ter recusado um endereço ou aparado um texto, e o que
         a tela mostra passa a ser o que ficou na linha. */
      ...Object.fromEntries(
        CAMPOS_DE_SEO.filter((coluna) => gravado && Object.hasOwn(gravado, coluna)).map(
          (coluna) => [coluna, gravado[coluna] ?? ""],
        ),
      ),
    };
    /* ── AS CAPAS DESTA SESSÃO QUE O SALVAMENTO DEIXOU PARA TRÁS ──────────
       O QUE FOI SALVO PASSA A SER DO SERVIDOR: a partir daqui quem remove esse
       arquivo é ele, na próxima troca ou na exclusão, e a tela não pode mais
       descartá-lo por conta própria.

       O RESTO É NOSSO, E SAI AGORA. Trocar de origem — enviar um arquivo e
       depois marcar "Informar endereço" — deixava o arquivo enviado sem dono:
       o servidor compara o endereço GRAVADO com o novo e nunca fica sabendo de
       um arquivo que ele jamais viu, e este `clear()` apagava o último
       registro dele. Órfão permanente, que nenhum salvamento futuro alcança e
       que não vira nem resíduo, porque não há quem o nomeie.

       Ele NÃO sai na troca de modo, e isso é a outra metade da regra: alternar
       precisa poder ser desfeito sem reenviar o arquivo. Ele sai quando o
       salvamento decide qual endereço o Post tem de verdade — que é aqui. */
    /* AS SALVAS SÃO AS DOS DOIS CAMPOS. Filtrar só pela capa faria o arquivo
       que acabou de virar Imagem de Compartilhamento ser apagado do bucket
       logo depois de o Post apontar para ele — a linha gravada ficaria com um
       endereço morto, que é o defeito pior que o órfão. */
    const salvas = CAMPOS_DE_IMAGEM_DA_GAVETA.map((coluna) =>
      String(valoresGravados[coluna] ?? "").trim(),
    ).filter((url) => url !== "");
    const abandonadas = [...capasNaoSalvas.current].filter((url) => !salvas.includes(url));
    capasNaoSalvas.current.clear();
    for (const url of abandonadas) {
      /* Falha aqui NÃO vira aviso, pela mesma razão de `descartarSeNaoSalva`:
         o Autor não pediu esta remoção, e um erro sobre um arquivo que ele nem
         sabe que existe é ruído. O que sobra é um arquivo inerte. */
      await removerImagemDeCapa(url);
    }
    setValores(valoresGravados);
    /* O endereço gravado acompanha a resposta do servidor: ele pode ter sido
       aposentado e trocado lá, e é o novo que passa a estar no ar. */
    setSlugGravado(
      typeof gravado?.slug === "string" ? gravado.slug : valoresGravados.slug,
    );
    if (gravado?.estado) setEstado(gravado.estado);

    /* A PENDÊNCIA SOME AQUI, e só aqui.
       O retrato de referência é o dos valores GRAVADOS, pelo mesmo motivo:
       guardar o retrato do que a tela tinha faria a confirmação de saída
       aparecer logo depois de um salvamento bem-sucedido, que é o começo do
       treinamento para ignorá-la. */
    setReferencia(instantaneo(valoresGravados, documento));

    if (gravado?.id && criando) {
      // O Post nasceu: a tela passa a estar editando, e o endereço para de
      // acompanhar o título a partir deste instante.
      enderecoDigitadoAMao.current = true;
      setId(gravado.id);
    }

    aoSalvar?.(gravado);
  }, [salvando, valores, documento, criando, id, estado, aoSalvar, tagsIndisponiveis, situacaoDe, originalDoBanco]);

  useEffect(() => {
    salvarDeNovo.current = salvar;
  }, [salvar]);

  /* ── O modal de agendamento: abrir, cancelar, confirmar ─────────────────
     O botão "Agendar publicação"/"Reagendar publicação" (`acao.exigeData`)
     não chama `salvar` direto: ele abre este modal, e é a CONFIRMAÇÃO dele
     que chama `salvar`. */

  /** Abre o modal, com o rascunho sincronizado ao que está gravado AGORA. */
  const abrirAgendamento = useCallback(
    (acao) => {
      setRascunhoDeData(valores.publicado_em ?? "");
      setErroDoAgendamento(null);
      setAgendamentoPendente(acao);
    },
    [valores.publicado_em],
  );

  /**
   * Cancelar fecha sem gravar. O rascunho é LOCAL ao modal — ele nunca foi
   * escrito em `valores.publicado_em`, então não há o que desfazer ali; o
   * que este fechamento descarta é só o texto que estava no campo do modal.
   */
  const fecharAgendamento = useCallback(() => {
    setAgendamentoPendente(null);
    setErroDoAgendamento(null);
  }, []);

  /**
   * Confirmar NÃO escreve o rascunho em `valores.publicado_em` — passa o
   * valor direto a `salvar` (`publicadoEmForcado`), que usa esse valor para
   * montar o pedido sem depender de `valores` estar atualizado a tempo.
   *
   * Achado da revisão adversarial desta correção: escrever em `valores` AQUI,
   * antes de `salvar` confirmar qualquer coisa, deixava uma recusa (data
   * vencida, `erro.faltando`, o cheque local de campo vazio) com o valor
   * REJEITADO preso em `valores.publicado_em` para sempre — sem `salvar`
   * nunca ter sucesso, e sem "Cancelar" (que só fecha o modal) desfazer isso.
   * Um "Salvar" comum, depois, reenviaria esse valor rejeitado sem o Autor
   * saber. O padrão que o resto deste arquivo já segue (`valoresGravados`,
   * mais abaixo) é o certo: `valores` só reflete o que o SERVIDOR gravou,
   * nunca uma tentativa otimista — e só o sucesso de `salvar` grava.
   */
  const confirmarAgendamento = useCallback(() => {
    const acao = agendamentoPendente;
    if (!acao) return;
    const data = rascunhoDeData;
    setAgendamentoPendente(null);
    setErroDoAgendamento(null);
    salvar(acao, { publicadoEmForcado: data });
  }, [agendamentoPendente, rascunhoDeData, salvar]);

  /* ── Sair, nas três formas ───────────────────────────────────────────── */

  /**
   * Fechar a aba e recarregar.
   *
   * O ouvinte é registrado SÓ enquanto há pendência, e o `return` do efeito o
   * remove assim que ela some. Um ouvinte que fica registrado depois de salvo
   * faz o navegador perguntar sem motivo — e a pergunta sem motivo é o caminho
   * para a pessoa aprender a confirmar sem ler.
   *
   * O texto da pergunta é do navegador: `returnValue` foi mantido porque
   * navegadores antigos ainda exigem a atribuição para levar o evento a sério,
   * mas nenhum deles mostra a frase há anos.
   */
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

  /** Voltar para a listagem: a forma mais comum, e a única que é da tela. */
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

  /* A ação clicada na barra: as que EXIGEM data abrem o modal de
     agendamento em vez de salvar direto — é `confirmarAgendamento` que, no
     fim das contas, chama `salvar`. As demais seguem como sempre. */
  const acionarAcao = useCallback(
    (acao) => (acao.exigeData ? abrirAgendamento(acao) : salvar(acao)),
    [abrirAgendamento, salvar],
  );

  /* ── Desenho ─────────────────────────────────────────────────────────── */

  if (erroDeCarga) {
    return (
      <Moldura aoSair={aoSair} titulo="Editar post" subtitulo={null}>
        <div
          role="alert"
          className="m-6 max-w-2xl rounded-cartao border border-destructive/40 bg-destructive/10 p-6"
        >
          <h3 className="text-base font-semibold text-ink">
            Não conseguimos abrir este post
          </h3>
          <p className="mt-2 text-sm text-ink-secondary">{erroDeCarga.mensagem}</p>
          <p className="mt-2 text-sm text-ink-muted">
            Os posts que ainda vivem no armazenamento do navegador só passam a
            existir no servidor na Story 2.15. Use “Novo Post” para escrever um
            que já nasça gravado.
          </p>
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura
      aoSair={sair}
      titulo={criando ? "Novo post" : "Editar post"}
      subtitulo={
        criando ? (
          "Criando um artigo novo"
        ) : (
          <>
            Editando: <span className="dado">{valores.slug}</span>
          </>
        )
      }
      acao={
        /* AS AÇÕES SÃO DERIVADAS, E O ESTADO FICA À VISTA AO LADO DELAS.
           Nenhuma lista de botões é escrita aqui: `acoes` vem da máquina do
           domínio, e a ordem é a que ela declara. A pílula é a mesma da
           listagem e do filtro — a palavra por extenso, sem sinônimo. */
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <PilulaDeEstado estado={estado} />
          {/* VER — a MESMA decisão da linha da listagem, tomada no mesmo lugar
              (`acoes.js`). Ela deixou de sumir quando o Post não está
              publicado: leva à pré-visualização, que abre por identificador e
              não depende de o rascunho ter endereço. O único caso sem destino é
              o Post que ainda não foi gravado — aí não há o que pré-visualizar,
              e a ação continua ausente em vez de mentir.

              Aba nova, de propósito, nos dois destinos: o Autor continua AQUI,
              com o que ainda não foi salvo intacto. Navegar na mesma aba levaria
              embora o texto pendente — e uma troca de rota do lado do cliente
              não dispara a pergunta de descarregamento que protege as outras
              três saídas. */}
          {destinoDaVisualizacao !== null ? (
            <a
              data-acao-ver={destinoDaVisualizacao.tipo}
              href={destinoDaVisualizacao.endereco}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={rotuloDeVer(postParaVer)}
              className={cn(
                ANEL_DE_FOCO,
                "inline-flex items-center gap-1.5 rounded-controle px-2 py-1",
                "text-sm font-medium text-ink-secondary underline underline-offset-4",
                "hover:text-ink",
              )}
            >
              {destinoDaVisualizacao.tipo === DESTINO_SITE ? (
                <ExternalLink aria-hidden="true" className="size-4" />
              ) : (
                <Eye aria-hidden="true" className="size-4" />
              )}
              {destinoDaVisualizacao.tipo === DESTINO_SITE
                ? "Ver no site"
                : "Pré-visualizar"}
            </a>
          ) : null}
          {/* ─── Tela larga: as ações lado a lado ─────────────────────────
              `data-acao` vive AQUI e só aqui: é por ele que a verificação
              conta as ações oferecidas, e repeti-lo na versão compacta faria
              cada ação ser contada duas vezes no DOM — o jsdom não aplica
              media query, então os dois blocos existem para ele. */}
          <div className="hidden flex-wrap items-center gap-2 sm:flex">
            {acoes.map((acao) => (
              <Button
                key={acao.chave}
                type="button"
                data-acao={acao.chave}
                data-destino={acao.destino}
                variant={acao.enfase === ENFASE_PRINCIPAL ? "default" : "outline"}
                onClick={() => acionarAcao(acao)}
                aria-busy={acaoEmCurso === acao.chave ? "true" : undefined}
                disabled={salvando || carregando}
                className={cn(ANEL_DE_FOCO, "gap-2")}
              >
                {acaoEmCurso === acao.chave ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                {acao.rotulo}
              </Button>
            ))}
          </div>

          {/* ─── Celular: a ação de sempre à mão, as decisões no menu ─────
              Em `agendado` são quatro ações, e quatro botões lado a lado num
              telefone viram quatro alvos estreitos demais para o dedo.
              Salvar é o que se faz o tempo todo e fica a um toque; agendar,
              publicar e arquivar são decisões raras e difíceis de desfazer —
              custar um toque a mais é vantagem, não atrito. */}
          <div className="flex items-center gap-2 sm:hidden">
            {acoesPrincipais.map((acao) => (
              <Button
                key={acao.chave}
                type="button"
                data-acao-compacta={acao.chave}
                variant="default"
                onClick={() => acionarAcao(acao)}
                aria-busy={acaoEmCurso === acao.chave ? "true" : undefined}
                disabled={salvando || carregando}
                className={cn(ANEL_DE_FOCO, "gap-2")}
              >
                {acaoEmCurso === acao.chave ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                {acao.rotulo}
              </Button>
            ))}
            {acoesSecundarias.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={salvando || carregando}
                    className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2")}
                  >
                    Mudar estado do post
                    <ChevronDown aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                {/* `painel` porque o menu monta em portal, fora da árvore da
                    tela: sem a classe ele resolveria os tokens do site
                    público em vez dos do Painel. */}
                <DropdownMenuContent align="end" className="painel">
                  {acoesSecundarias.map((acao) => (
                    <DropdownMenuItem
                      key={acao.chave}
                      data-acao-compacta={acao.chave}
                      onSelect={() => acionarAcao(acao)}
                      className={cn(ALVO_DE_TOQUE, "gap-2")}
                    >
                      {acao.rotulo}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      }
    >
      {carregando ? (
        <div className="flex flex-1 gap-4 p-4" aria-hidden="true">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          {/* O esqueleto ocupa a medida em que a gaveta vai nascer: um vulto de
              340px seguido de um trilho de 46px seria um salto de leiaute. */}
          <Skeleton
            className="h-64 shrink-0"
            style={{ width: larguraDaGaveta(gavetaAberta) }}
          />
        </div>
      ) : (
        /* UMA linha, em qualquer largura de tela. A adaptação a tela estreita é
           a gaveta nascer recolhida — não uma segunda regra responsiva aqui,
           que divergiria daquela na primeira mudança. */
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          {/* A medida do texto é travada pela própria classe `.artigo`, no
              próprio elemento; recolher a gaveta devolve largura ao CONTÊINER,
              e a coluna apenas se recentraliza. O texto nunca estica. */}
          <Editor
            key={chaveDoEditor}
            documento={documento}
            aoMudar={mudarDocumento}
            aoAvisar={avisarSobreConteudo}
            className="min-h-0 min-w-0 flex-1"
          />
          <GavetaDeMetadados
            valores={valores}
            aoMudar={mudarCampo}
            faltando={faltando}
            categorias={categorias}
            tags={tags}
            problemaNoEndereco={problemaNoEndereco}
            envios={envios}
            /* O DOMÍNIO CANÔNICO da seção de SEO (Story 3.4): variável de
               ambiente, como o épico decidiu, com a origem do navegador só
               como último recurso. A versão anterior lia a origem e mais nada,
               e mentia em implantação de prévia — que é justamente o ambiente
               feito para conferir antes de publicar. Ver `admin/blog/dominio.js`. */
            dominioDoSite={dominioDoSite()}
            /* A RAIZ DO PROJETO, para a gaveta saber se a capa gravada é NOSSA
               e abrir no modo certo. Ela vem da camada de dados, e não de uma
               leitura do próprio endereço: a capa de outro projeto Supabase tem
               a forma exata da nossa, e classificá-la como enviada esconderia
               num campo `readOnly` justamente o endereço que a pessoa foi
               editar. */
            baseDaCapaDoProjeto={baseDaCapaDoProjeto}
            aoEscolherArquivo={enviarImagem}
            aoRemoverImagem={removerImagem}
            desabilitado={salvando}
            aberta={gavetaAberta}
            aoAlternar={alternarGaveta}
            className="shrink-0"
          />
        </div>
      )}

      {/* A confirmação da troca de endereço. Ela nomeia os DOIS endereços: 
          "o endereço vai mudar" obrigaria o Autor a lembrar o que digitou
          três campos acima, e ver os dois lado a lado é o que transforma a
          confirmação numa conferência em vez de num obstáculo. */}
      <DialogoDeConfirmacao
        aberto={trocaDeEnderecoPendente !== null}
        aoMudarAbertura={(aberto) => {
          if (!aberto) setTrocaDeEnderecoPendente(null);
        }}
        titulo={TITULO_DA_TROCA_DE_ENDERECO}
        descricao={descricaoDaTrocaDeEndereco({
          de: originalDoBanco?.slug ?? slugGravado,
          para: valores.slug,
        })}
        rotuloDeConfirmacao={ROTULO_PARA_TROCAR_ENDERECO}
        rotuloDeCancelamento={ROTULO_PARA_MANTER_ENDERECO}
        /* NÃO é destrutivo: nada se perde, e pintar de vermelho uma ação
           reversível gasta o vermelho que a exclusão precisa. */
        perigo={false}
        aoConfirmar={() => {
          const acao = trocaDeEnderecoPendente;
          setTrocaDeEnderecoPendente(null);
          if (acao) salvar(acao, { enderecoConfirmado: true });
        }}
      />

      {/* A confirmação de saída. Ela só chega a abrir quando há pendência: quem
          decide é `sair`, e é essa raridade que a mantém eficaz. */}
      <DialogoDeConfirmacao
        aberto={confirmandoSaida}
        aoMudarAbertura={setConfirmandoSaida}
        titulo={TITULO_DA_SAIDA}
        descricao={descricaoDaSaida(valores.titulo)}
        rotuloDeConfirmacao={ROTULO_PARA_SAIR}
        rotuloDeCancelamento={ROTULO_PARA_FICAR}
        aoConfirmar={sairDescartando}
      />

      {/* O MODAL DE AGENDAMENTO. Substitui o campo `datetime-local` solto que
          vivia na Gaveta — ele era redundante com o botão "Agendar
          publicação"/"Reagendar publicação", que hoje o abre.

          `Dialog`, e não `AlertDialog`/`DialogoDeConfirmacao`: aquele é para
          CONFIRMAR uma ação já decidida ("Excluir post?"); este é para
          COLETAR um dado antes da ação existir. Mesma razão pela qual
          `alert-dialog.jsx` não é reaproveitado aqui.

          `.painel`, porque `DialogContent` monta em portal, fora da árvore do
          Painel — sem a classe, os tokens de cor resolveriam para os do site
          público. Mesmo precedente de `DialogoDeConfirmacao.jsx`. */}
      <Dialog
        open={agendamentoPendente !== null}
        onOpenChange={(aberto) => {
          if (!aberto) fecharAgendamento();
        }}
      >
        <DialogContent className="painel rounded-cartao">
          <DialogHeader>
            <DialogTitle className="tracking-tight">
              Dia e hora da publicação
            </DialogTitle>
            <DialogDescription>
              O post vai ao ar no horário de Brasília que você informar aqui.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${idDoAgendamento}-data`}
              className="text-sm font-semibold text-ink"
            >
              Dia e hora
            </label>
            <input
              id={`${idDoAgendamento}-data`}
              type="datetime-local"
              /* `data-campo` colado perto de `className`, e não depois de
                 `onChange`/`aria-describedby`: a verificação do vocabulário
                 fechado de `.dado` (`verificar-interface.mjs`) lê vizinhança
                 no código-fonte, e um atributo longe demais sai da janela
                 que ela olha. */
              data-campo="publicado_em"
              className={cn(
                "dado w-full rounded-controle border bg-surface px-3 py-2 text-sm text-ink",
                "placeholder:text-ink-muted transition-colors",
                ANEL_DE_FOCO,
                erroDoAgendamento ? "border-destructive" : "border-border-soft",
              )}
              value={rascunhoDeData}
              onChange={(evento) => {
                setRascunhoDeData(evento.target.value);
                setErroDoAgendamento(null);
              }}
              aria-invalid={erroDoAgendamento ? "true" : undefined}
              aria-describedby={
                erroDoAgendamento
                  ? `${idDoAgendamento}-erro`
                  : `${idDoAgendamento}-ajuda`
              }
            />
            {erroDoAgendamento ? (
              <p
                id={`${idDoAgendamento}-erro`}
                role="alert"
                className="flex items-start gap-1.5 text-xs font-medium text-destructive"
              >
                {erroDoAgendamento}
              </p>
            ) : null}
            {/* O instante é gravado em UTC; o que se lê e o que se digita é a
                hora de Brasília — dizer o fuso por extenso é o que impede
                alguém de agendar 00h30 achando que agendou no fuso do
                próprio navegador. */}
            <p id={`${idDoAgendamento}-ajuda`} className="text-xs text-ink-muted">
              Horário de Brasília{" "}
              <span className="dado" data-papel="data-em-sao-paulo">
                {textoDaDataDoCampo(rascunhoDeData)}
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={fecharAgendamento}
              className={cn("min-h-10 rounded-controle", ANEL_DE_FOCO)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              data-papel="confirmar-agendamento"
              onClick={confirmarAgendamento}
              className={cn("min-h-10 rounded-controle font-semibold", ANEL_DE_FOCO)}
            >
              {agendamentoPendente?.rotulo ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Moldura>
  );
}

/** A casca da tela: voltar, título e a ação da direita. */
function Moldura({ aoSair, titulo, subtitulo, acao = null, children }) {
  return (
    <div
      /* `overflow-hidden`: sem ele, `h-screen` fixa a ALTURA da moldura, mas
         não impede o navegador de rolar quando o conteúdo — ou um artefato de
         layout com pouco texto — ultrapassa essa altura por um triz. A tela
         rolava além do fim real do conteúdo; cada painel interno (Editor e
         Gaveta) já tem a própria rolagem, então a moldura não precisa de mais
         nenhuma. Mesmo padrão já usado em `AdminBlog.jsx`. */
      className="painel flex h-screen flex-col overflow-hidden bg-surface-sunk text-ink">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Voltar para a listagem"
            onClick={() => aoSair?.()}
            className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">{titulo}</h2>
            {subtitulo ? (
              <p className="truncate text-xs text-ink-muted">{subtitulo}</p>
            ) : null}
          </div>
        </div>
        {acao}
      </div>
      {children}
    </div>
  );
}
