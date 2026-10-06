import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search, FileText, Briefcase, Tags, TrendingUp, Globe } from "lucide-react";

import BarraSuperior, { idDaAba } from "@/admin/shell/BarraSuperior";
import EditorDePost from "@/admin/blog/EditorDePost";
import ListaDePosts from "@/admin/blog/ListaDePosts";
import FiltroDeData from "@/admin/blog/FiltroDeData";
import { selecionarEstadoExclusivo } from "@/admin/blog/listagem";
import {
  ENDERECO_DAS_BUSCAS,
  ENDERECO_DAS_CATEGORIAS,
  ENDERECO_DAS_LEITURAS,
} from "@/admin/blog/rotas";
import AbaDeCarreiras from "@/admin/carreiras/AbaDeCarreiras";
import { ABA_DE_CARREIRAS, PARAMETRO_DA_ABA } from "@/admin/carreiras/rotas";
import { ESTADOS, rotuloDoEstado } from "@/domain/blog/estados";
import { PERIODO_VAZIO } from "@/domain/blog/periodo";
import { formatarNumero } from "@/domain/blog/formato";
import { pageTransition, staggerContainer, staggerItem } from "@/lib/motion";

/* O `id` do painel de conteúdo, apontado pelo `aria-controls` das abas. */
const ID_DO_CONTEUDO = "conteudo-do-painel";

/* ─── Acesso ───────────────────────────────────────────────────────────
   Esta página não decide mais nada sobre acesso. A senha em texto claro, a
   chave gravada no armazenamento do navegador e a tela de login artesanal
   saíram daqui: quem decide é `PortaoDeSessao`, acima da rota, contra a sessão
   do Supabase. Se este componente está renderizando, a sessão já foi
   verificada no servidor. */

/* A lista fixa de Categorias que vivia aqui SAIU: Categoria vem de dado, não de
   constante no código (`categorias` no Supabase), e a gaveta de metadados da
   Story 2.6 lê a lista pela camada de dados.

   O MAPA DE ÍCONE POR NOME saiu junto, na Story 2.10. A listagem nova mostra a
   capa do Post ou o monograma da Categoria (`ListaDePosts.jsx`), e a Story
   2.14 fechou o buraco pelo lado certo: o ícone voltou como CHAVE de um mapa
   fechado (`admin/blog/iconesDeCategoria.js`) escolhida pelo Autor na tela de
   Categorias, e a cor entrou junto, por `style`, de um vocabulário fechado do
   domínio. */

/* ─── Carreiras saiu desta página (Story 5.5) ──────────────────────────
   O formulário de Vaga, as cores, os departamentos e níveis fixos, a lista em
   memória, a busca que filtrava o que já estava carregado, as ações que só
   apareciam com o ponteiro em cima, o diálogo de restaurar e o armazenamento
   do navegador que sustentava tudo isso SAÍRAM do repositório. A aba Carreiras
   agora é um módulo: `admin/carreiras/AbaDeCarreiras`, que lê do banco e
   escreve pela função de servidor. Esta página só declara a aba, guarda a
   contagem que a barra mostra e monta o componente dentro do `tabpanel`. */

/* O `slugify` artesanal que vivia aqui SAIU. A geração de endereço é domínio
   puro agora (`src/domain/blog/slug.js`), pela razão de sempre: a tela, a função
   de escrita e a verificação precisam concordar sobre o que é um endereço
   válido, e a única forma de garantir isso é não haver três cópias da regra. */

/* O modal de confirmação artesanal que vivia aqui SAIU do repositório. Quem
   confirma agora é `DialogoDeConfirmacao`, sobre o `alert-dialog` do shadcn
   (Story 1.6), montado pelas listagens que excluem. */

/* ═══════════════════════════════════════════════════════════════════ */
/*  COMPONENTE PRINCIPAL                                                */
/* ═══════════════════════════════════════════════════════════════════ */
export default function AdminBlog() {
  /* ── Aba ativa ────────────────────────────────────────────────────
     A aba é DERIVADA da URL, a cada renderização, e não um estado copiado
     dela uma vez: `?aba=carreiras` abre Carreiras (é para onde o formulário de
     Vaga volta), e qualquer outro valor, ou nenhum, abre o Blog. Um estado
     inicializado pela URL ficaria surdo a ela depois (voltar no navegador, um
     link para `/admin?aba=carreiras` com a página montada). Os nomes do
     parâmetro e do valor são os do módulo de Carreiras.

     Trocar de aba ESCREVE o parâmetro, substituindo a entrada do histórico
     (trocar de aba não é navegar): Carreiras põe `?aba=carreiras`, e o Blog
     tira o parâmetro, porque o Blog é a aba de quem não pede nenhuma. */
  const [parametros, setParametros] = useSearchParams();
  const activeTab = parametros.get(PARAMETRO_DA_ABA) === ABA_DE_CARREIRAS ? ABA_DE_CARREIRAS : "blog";
  const trocarDeAba = (aba) => {
    setParametros(
      (atuais) => {
        const proximos = new URLSearchParams(atuais);
        if (aba === ABA_DE_CARREIRAS) proximos.set(PARAMETRO_DA_ABA, ABA_DE_CARREIRAS);
        else proximos.delete(PARAMETRO_DA_ABA);
        return proximos;
      },
      { replace: true },
    );
  };

  /* ── Estado — Blog ────────────────────────────────────────────────
     A LISTA NÃO MORA AQUI. Quem carrega os Posts é `ListaDePosts`, pela
     camada de dados, com o carregamento, o erro e o vazio dela.

     O que fica aqui é só o que a PÁGINA precisa saber: quantos Posts há (a
     contagem da aba, que a barra exibe) e quando a lista precisa recarregar.
     `contagemDePosts` nasce `null` — "ainda não sei" — e não `0`: um zero
     enquanto os dados vêm anuncia "nenhum post" para quem tem doze. */
  const [contagemDePosts, setContagemDePosts] = useState(null);
  const [versaoDaLista, setVersaoDaLista] = useState(0);
  const [blogView, setBlogView] = useState("list"); // "list" | "form"
  const [editingPost, setEditingPost] = useState(null);

  /* ── Estado — Carreiras ───────────────────────────────────────────
     Só a contagem da aba, pelo mesmo motivo e com a mesma regra da de Posts:
     `null` até a aba ter sido visitada e a lista ter respondido. */
  const [contagemDeVagas, setContagemDeVagas] = useState(null);

  /* ── O que se pede à busca ────────────────────────────────────────────
     A página só GUARDA o pedido: o termo digitado e os Estados marcados. Quem
     consulta é a listagem, pela camada de dados, e quem busca de verdade é o
     Postgres — insensível a maiúsculas e a acento, sobre título, Categoria,
     Autor e Tags. */
  const [buscaDePosts, setBuscaDePosts] = useState("");
  const [estadosDoFiltro, setEstadosDoFiltro] = useState([]);
  /* A FAIXA DE DATAS é pedido, como o termo e os Estados: a página só a guarda,
     e quem recorta é o Postgres. `PERIODO_VAZIO` é "sem filtro", que é diferente
     de "nenhum dia" — a distinção mora no domínio, não aqui. */
  const [periodoDoFiltro, setPeriodoDoFiltro] = useState(PERIODO_VAZIO);
  /* A abertura do painel de data é da PÁGINA porque "limpar a busca" precisa
     fechá-lo: sem isso, quem limpou pelo vazio de busca continuaria com o
     painel aberto sobre uma lista que já mudou. */
  const [filtroDeDataAberto, setFiltroDeDataAberto] = useState(false);
  const limparBuscaDePosts = () => {
    setBuscaDePosts("");
    setEstadosDoFiltro([]);
    setPeriodoDoFiltro(PERIODO_VAZIO);
    setFiltroDeDataAberto(false);
  };

  /* ── Ações — Blog ─────────────────────────────────────────────── */
  /* Salvar NÃO fecha o Editor. A regra do épico é explícita — publicar não tira
     o Autor do Editor —, e o mesmo vale para salvar: quem acabou de gravar
     costuma continuar escrevendo. Quem sai é o botão de voltar, e só ele.

     O QUE ESTA FUNÇÃO GARANTE é que a listagem, quando o Autor voltar, já saiba
     do que foi gravado: a versão muda, e a lista relê pela camada de dados. */
  const handleSavePost = () => { setVersaoDaLista((n) => n + 1); };

  /* Não existe `handleDeletePost`: as ações por linha do Post, com o caminho
     único de escrita, moram em `ListaDePosts` (Story 2.12). */

  /* ── A barra: as abas ─────────────────────────────────────────────

     A casca não conhece Post nem Vaga (AD-15) — as abas chegam nela como dados.
     A contagem vai formatada: número é dado, e a barra o exibe em `.dado`. Não
     há ação de aba: Restaurar saiu com as vagas de exemplo (Story 5.5). */
  const abas = [
    {
      id: "blog",
      rotulo: "Blog",
      Icone: FileText,
      /* `null` enquanto a listagem carrega: a barra omite a contagem, em vez de
         anunciar zero para quem tem doze posts. */
      contagem: contagemDePosts === null ? null : formatarNumero(contagemDePosts),
      href: "/blog",
      rotuloDoLink: "Abrir o blog publicado em nova aba",
    },
    {
      id: ABA_DE_CARREIRAS,
      rotulo: "Carreiras",
      Icone: Briefcase,
      /* `null` até a aba ser visitada: a contagem é da listagem de Vagas, que
         só é montada com a aba ativa. */
      contagem: contagemDeVagas === null ? null : formatarNumero(contagemDeVagas),
      href: "/carreiras",
      rotuloDoLink: "Abrir a página de carreiras em nova aba",
    },
  ];

  /* ── Render principal ─────────────────────────────────────────── */
  //
  // O Editor e a listagem são ramos do MESMO `AnimatePresence`, com
  // `mode="wait"` — a tela que sai termina a saída antes de a que entra
  // começar a entrar, então as duas nunca disputam a mesma área ao mesmo
  // tempo. A chave (`key="editor"` / `key="lista"`) é o que diz ao
  // `AnimatePresence` que são telas DIFERENTES.
  return (
    <AnimatePresence mode="wait">
      {blogView === "form" ? (
        <motion.div
          key="editor"
          initial={pageTransition.initial}
          animate={pageTransition.animate}
          exit={pageTransition.exit}
          className="h-screen overflow-hidden"
        >
          <EditorDePost
            postId={editingPost?.id ?? null}
            aoSalvar={handleSavePost}
            aoSair={() => { setBlogView("list"); setEditingPost(null); }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="lista"
          initial={pageTransition.initial}
          animate={pageTransition.animate}
          exit={pageTransition.exit}
          className="painel h-screen flex flex-col bg-background text-ink overflow-hidden"
        >

      {/* ────── Barra superior ─────────────────────────────────────
          Vive na casca (`admin/shell`), não aqui: é compartilhada com
          Carreiras. A página só diz quais abas existem. */}
      <BarraSuperior
        titulo="Painel de conteúdo | ChatClean"
        abas={abas}
        abaAtiva={activeTab}
        aoTrocarAba={trocarDeAba}
        idDoConteudo={ID_DO_CONTEUDO}
      />

      {/* ────── Toolbar do Blog: busca + filtros + novo ──────────────
          É SÓ do Blog. A faixa de Carreiras mora no módulo dela
          (`AbaDeCarreiras`), dentro do `tabpanel`: as duas deixaram de ser os
          dois ramos de um ternário. A busca daqui vai ao banco, e o campo só
          guarda o que foi digitado. */}
      {activeTab === "blog" && (
      <motion.div
        variants={staggerContainer(0.08)}
        initial="hidden"
        animate="visible"
        className="shrink-0 border-b border-zinc-800 px-6 py-4 flex items-center gap-3 flex-wrap"
      >
            <motion.div variants={staggerItem} className="relative flex-1 min-w-[14rem] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
              <input
                value={buscaDePosts}
                onChange={(e) => setBuscaDePosts(e.target.value)}
                placeholder="Buscar por título, categoria, autor ou tag..."
                aria-label="Buscar posts por título, categoria, autor ou tag"
                data-busca="posts"
                className="w-full bg-surface border border-border-soft rounded-xl pl-10 pr-4 py-2.5 text-sm text-ink outline-none focus:border-emerald-500 transition-colors placeholder:text-ink-muted"
              />
            </motion.div>
            {/* Os filtros de Estado. As palavras vêm do vocabulário fechado do
                domínio — escrevê-las aqui criaria o sinônimo que ele existe
                para impedir —, e cada botão diz se está marcado por `aria-
                pressed`, não só pela cor. */}
            <motion.div
              variants={staggerItem}
              role="group"
              aria-label="Filtrar posts por estado"
              className="flex flex-wrap items-center gap-1.5"
            >
              {ESTADOS.map((estado) => {
                const marcado = estadosDoFiltro.includes(estado);
                return (
                  <button
                    key={estado}
                    type="button"
                    data-filtro-de-estado={estado}
                    aria-pressed={marcado}
                    onClick={() =>
                      setEstadosDoFiltro((atuais) => selecionarEstadoExclusivo(atuais, estado))
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      marcado
                        ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                        : "bg-surface border-border-soft text-ink-muted hover:text-ink hover:border-border-strong"
                    }`}
                  >
                    {rotuloDoEstado(estado)}
                  </button>
                );
              })}
            </motion.div>
            {/* O FILTRO DE DATA, ao lado dos de Estado e antes dos botões: ele é
                da mesma família — recorta o que a lista mostra — e a família
                fica junta. */}
            <motion.div variants={staggerItem}>
              <FiltroDeData
                periodo={periodoDoFiltro}
                aoMudar={setPeriodoDoFiltro}
                aberto={filtroDeDataAberto}
                aoMudarAbertura={setFiltroDeDataAberto}
              />
            </motion.div>
            {/* O vão que empurra "Novo Post" para a borda. */}
            <div className="flex-1" />
            {/* A ENTRADA PARA AS BUSCAS NO GOOGLE: cliques, impressões e
                posição do site inteiro, vindos do Search Console. */}
            <motion.div variants={staggerItem}>
              <Link
                to={ENDERECO_DAS_BUSCAS}
                data-acao="abrir-buscas"
                className="flex items-center gap-2 border border-border-soft hover:border-border-strong text-ink-secondary hover:text-ink px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">Google</span>
              </Link>
            </motion.div>
            {/* A ENTRADA PARA AS LEITURAS: a evolução das leituras dos Posts.
                Link para uma rota irmã, como o das Categorias ao lado. */}
            <motion.div variants={staggerItem}>
              <Link
                to={ENDERECO_DAS_LEITURAS}
                data-acao="abrir-leituras"
                className="flex items-center gap-2 border border-border-soft hover:border-border-strong text-ink-secondary hover:text-ink px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
              >
                <TrendingUp className="w-4 h-4" />
                <span className="hidden sm:inline">Leituras</span>
              </Link>
            </motion.div>
            {/* A ENTRADA PARA AS CATEGORIAS (Story 2.14). É um LINK para uma
                rota irmã, e não uma terceira aba. */}
            <motion.div variants={staggerItem}>
              <Link
                to={ENDERECO_DAS_CATEGORIAS}
                data-acao="abrir-categorias"
                className="flex items-center gap-2 border border-border-soft hover:border-border-strong text-ink-secondary hover:text-ink px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
              >
                <Tags className="w-4 h-4" />
                <span className="hidden sm:inline">Categorias</span>
              </Link>
            </motion.div>
        <motion.button
          variants={staggerItem}
          onClick={() => { setEditingPost(null); setBlogView("form"); }}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Post</span>
        </motion.button>
      </motion.div>
      )}

      {/* ────── Lista ───────────────────────────────────────────
          É o painel que as abas controlam: sem `tabpanel` associado, o
          `role="tab"` da barra apontaria para lugar nenhum. */}
      <div
        id={ID_DO_CONTEUDO}
        role="tabpanel"
        aria-labelledby={idDaAba(activeTab)}
        tabIndex={-1}
        className="flex-1 overflow-y-auto p-6"
      >

        {/* ── POSTS ───────────────────────────────────────────────
            A LISTAGEM LÊ O SUPABASE. Carregamento, erro e vazio são dela.

            `recarregarEm` é a costura com o Editor: salvar muda a versão, a
            lista relê, e o Autor que acabou de gravar encontra o Post. */}
        {activeTab === "blog" && (
          <ListaDePosts
            recarregarEm={versaoDaLista}
            termo={buscaDePosts}
            estados={estadosDoFiltro}
            periodo={periodoDoFiltro}
            aoContar={setContagemDePosts}
            aoAbrirPost={(post) => { setEditingPost(post); setBlogView("form"); }}
            aoCriarPost={() => { setEditingPost(null); setBlogView("form"); }}
            aoLimparBusca={limparBuscaDePosts}
          />
        )}

        {/* ── VAGAS ───────────────────────────────────────────────
            O módulo inteiro: a faixa, a lista, as ações e o diálogo. Montado
            só com a aba ativa, e por isso só lê o banco quando é visitado. */}
        {activeTab === ABA_DE_CARREIRAS && <AbaDeCarreiras aoContar={setContagemDeVagas} />}
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
