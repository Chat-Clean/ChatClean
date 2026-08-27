import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Pencil, Trash2, Eye, RotateCcw,
  Save,
  ChevronLeft, Search, Check,
  FileText, Briefcase,
  MapPin, Tags,
} from "lucide-react";

import BarraSuperior, { idDaAba } from "@/admin/shell/BarraSuperior";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import EditorDePost from "@/admin/blog/EditorDePost";
import ListaDePosts from "@/admin/blog/ListaDePosts";
import { selecionarEstadoExclusivo } from "@/admin/blog/listagem";
import { ENDERECO_DAS_CATEGORIAS } from "@/admin/blog/rotas";
import { ESTADOS, rotuloDoEstado } from "@/domain/blog/estados";
import { formatarNumero } from "@/domain/blog/formato";
import { getVagas, saveVaga, deleteVaga, resetVagas } from "@/lib/vagasStore";
import { pageTransition } from "@/lib/motion";

/* O `id` do painel de conteúdo, apontado pelo `aria-controls` das abas. */
const ID_DO_CONTEUDO = "conteudo-do-painel";

/* ─── Falha de gravação: dizer o que houve, sem inventar a causa ─────────
   O armazenamento do navegador falha por mais de um motivo, e a mensagem que
   servia para todos ("libere espaço") só é verdadeira para um deles. Cota
   estourada é a causa provável ao SALVAR um post com imagem embutida em
   base64; excluir e restaurar gravam menos do que havia antes e praticamente
   não estouram cota — quando falham, é outra coisa. Afirmar cota sempre manda
   a pessoa limpar espaço por um defeito que espaço nenhum resolve. */
function ehCotaEstourada(erro) {
  if (!erro) return false;
  return (
    erro.name === "QuotaExceededError" ||
    erro.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    erro.code === 22 ||
    erro.code === 1014
  );
}

/** O que fazer, conforme a causa real. */
function comoResolver(erro, acaoNoInfinitivo) {
  return ehCotaEstourada(erro)
    ? `O armazenamento do navegador está cheio. Libere espaço e tente ${acaoNoInfinitivo} de novo.`
    : `Recarregue o Painel e tente ${acaoNoInfinitivo} de novo. O detalhe do erro está no console.`;
}

/* ─── Acesso ───────────────────────────────────────────────────────────
   Esta página não decide mais nada sobre acesso. A senha em texto claro, a
   chave gravada no armazenamento do navegador e a tela de login artesanal
   saíram daqui: quem decide é `PortaoDeSessao`, acima da rota, contra a sessão
   do Supabase. Se este componente está renderizando, a sessão já foi
   verificada no servidor. */

/* A lista fixa de Categorias que vivia aqui SAIU: Categoria vem de dado, não de
   constante no código (`categorias` no Supabase), e a gaveta de metadados da
   Story 2.6 lê a lista pela camada de dados.

   O MAPA DE ÍCONE POR NOME saiu junto, na Story 2.10. Ele existia para a
   listagem em `localStorage`, que casava o NOME da categoria com um ícone
   escrito aqui — seis nomes fixos, e nada para uma sétima categoria criada no
   Painel. A listagem nova mostra a capa do Post ou o monograma da Categoria
   (`ListaDePosts.jsx`), e o monograma vem do dado, não de um mapa que precisa
   ser editado toda vez que alguém cadastra uma categoria.

   E a Story 2.14 fechou o buraco pelo lado certo: o ícone voltou, mas como
   CHAVE de um mapa fechado (`admin/blog/iconesDeCategoria.js`) escolhida pelo
   Autor na tela de Categorias — não como nome de categoria casado com desenho.
   A cor entrou junto, por `style`, de um vocabulário fechado do domínio. Quem
   cadastra, renomeia e exclui Categoria é a rota `/admin/categorias`, e não
   uma constante neste arquivo. */

/* ─── Cores disponíveis para vagas ────────────────────────────────── */
const VAGA_COLORS = [
  { label: "Azul",    accent: "from-blue-500 to-cyan-600",      bg: "bg-blue-50",    dot: "bg-blue-500"    },
  { label: "Verde",   accent: "from-emerald-500 to-green-600",  bg: "bg-emerald-50", dot: "bg-emerald-500" },
  { label: "Roxo",    accent: "from-purple-500 to-fuchsia-600", bg: "bg-purple-50",  dot: "bg-purple-500"  },
  { label: "Laranja", accent: "from-orange-500 to-red-500",     bg: "bg-orange-50",  dot: "bg-orange-500"  },
  { label: "Rosa",    accent: "from-pink-500 to-rose-600",      bg: "bg-pink-50",    dot: "bg-pink-500"    },
  { label: "Amarelo", accent: "from-yellow-500 to-orange-500",  bg: "bg-yellow-50",  dot: "bg-yellow-500"  },
];

/* ─── Departamentos ─────────────────────────────────────────────────── */
const DEPARTAMENTOS = ["Tecnologia", "Atendimento", "Marketing", "Comercial", "Operações", "Financeiro", "RH", "Design"];

/* ─── Cores de nível (tema escuro admin) ───────────────────────────── */
const NIVEL_COLORS = {
  "Júnior": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Pleno:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Sênior": "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

/* ─── Vaga vazia ──────────────────────────────────────────────────── */
const EMPTY_VAGA = {
  id: null,
  titulo: "",
  departamento: "Tecnologia",
  localizacao: "",
  tipo: "CLT",
  nivel: "Pleno",
  descricao: "",
  accent: "from-blue-500 to-cyan-600",
  bg: "bg-blue-50",
  ativa: true,
};

/* O `slugify` artesanal que vivia aqui SAIU. A geração de endereço é domínio
   puro agora (`src/domain/blog/slug.js`), pela razão de sempre: a tela, a função
   de escrita e a verificação precisam concordar sobre o que é um endereço
   válido, e a única forma de garantir isso é não haver três cópias da regra. A
   versão daqui, além do mais, deixava passar hífen no começo e no fim — o que o
   banco recusa em `posts_slug_formato`. */

/* O modal de confirmação artesanal que vivia aqui SAIU do repositório.
   Era um `div` fixo sem `role`, sem armadilha de foco, sem `Esc`, sem devolver
   o foco a quem o abriu, e com o botão destrutivo alcançável antes do Cancelar.
   Quem confirma agora é `DialogoDeConfirmacao`, sobre o `alert-dialog` do
   shadcn (Story 1.6). */

/* ═══════════════════════════════════════════════════════════════════ */
/*  FORMULÁRIO DE VAGA (criar / editar)                                 */
/* ═══════════════════════════════════════════════════════════════════ */
function VagaForm({ vaga: initialVaga, onSave, onCancel }) {
  const [vaga, setVaga] = useState({ ...EMPTY_VAGA, ...initialVaga });
  const [saved, setSaved] = useState(false);

  const isNew = !vaga.id;

  const handleColorSelect = (color) => {
    setVaga((v) => ({ ...v, accent: color.accent, bg: color.bg }));
  };

  /* Mesma correção do formulário de post: sucesso declarado só depois de a
     gravação ter acontecido de verdade. */
  const handleSubmit = (e) => {
    e.preventDefault();
    try {
      saveVaga(vaga);
    } catch (erro) {
      console.error("[Painel] falha ao salvar vaga", erro);
      notificarErro(
        "Não deu para salvar a vaga",
        comoResolver(erro, "salvar"),
      );
      return;
    }
    setSaved(true);
    notificarSucesso("Vaga salva", vaga.titulo);
    setTimeout(() => { setSaved(false); onSave(); }, 800);
  };

  const field = (label, node) => (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">{label}</label>
      {node}
    </div>
  );

  const inputCls = "w-full bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors placeholder:text-zinc-600";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-white font-black text-lg">{isNew ? "Nova Vaga" : "Editar Vaga"}</h2>
            <p className="text-zinc-500 text-xs">{isNew ? "Criando nova oportunidade" : `Editando: ${vaga.titulo}`}</p>
          </div>
        </div>
        <button
          type="submit"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-emerald-500 hover:bg-emerald-600 text-white transition-all"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Salvo!" : "Salvar"}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 p-6 space-y-5 pb-16">
        {/* Título */}
        {field("Título *",
          <input required className={inputCls} value={vaga.titulo} onChange={(e) => setVaga((v) => ({ ...v, titulo: e.target.value }))} placeholder="ex: Desenvolvedor Front-end" />
        )}

        {/* Departamento + Localização */}
        <div className="grid grid-cols-2 gap-4">
          {field("Departamento",
            <select className={inputCls} value={vaga.departamento} onChange={(e) => setVaga((v) => ({ ...v, departamento: e.target.value }))}>
              {DEPARTAMENTOS.map((d) => <option key={d} value={d} className="bg-zinc-900">{d}</option>)}
            </select>
          )}
          {field("Localização",
            <input required className={inputCls} value={vaga.localizacao} onChange={(e) => setVaga((v) => ({ ...v, localizacao: e.target.value }))} placeholder="Remoto / São Paulo..." />
          )}
        </div>

        {/* Tipo + Nível */}
        <div className="grid grid-cols-2 gap-4">
          {field("Tipo de contratação",
            <select className={inputCls} value={vaga.tipo} onChange={(e) => setVaga((v) => ({ ...v, tipo: e.target.value }))}>
              {["CLT", "PJ", "Estágio", "Freela"].map((t) => <option key={t} value={t} className="bg-zinc-900">{t}</option>)}
            </select>
          )}
          {field("Nível",
            <select className={inputCls} value={vaga.nivel} onChange={(e) => setVaga((v) => ({ ...v, nivel: e.target.value }))}>
              {["Júnior", "Pleno", "Sênior"].map((n) => <option key={n} value={n} className="bg-zinc-900">{n}</option>)}
            </select>
          )}
        </div>

        {/* Cor */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Cor do cartão</label>
          <div className="flex gap-3 flex-wrap mb-4">
            {VAGA_COLORS.map((color) => (
              <button
                key={color.label}
                type="button"
                onClick={() => handleColorSelect(color)}
                title={color.label}
                className={`flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl border-2 transition-all ${
                  vaga.accent === color.accent
                    ? "border-white/40 bg-zinc-800 scale-110"
                    : "border-transparent hover:border-zinc-700"
                }`}
              >
                <div className={`w-7 h-7 rounded-full ${color.dot} shadow-lg`} />
                <span className="text-[10px] text-zinc-400 font-medium">{color.label}</span>
              </button>
            ))}
          </div>

          {/* Preview card */}
          <div className="flex items-center gap-3 p-3.5 bg-zinc-800/80 rounded-2xl border border-zinc-700">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${vaga.accent} flex items-center justify-center shrink-0 shadow-lg`}>
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{vaga.titulo || "Título da vaga"}</p>
              <p className="text-xs text-zinc-500">{vaga.departamento} · {vaga.localizacao || "Localização"} · {vaga.tipo}</p>
            </div>
          </div>
        </div>

        {/* Status ativa */}
        {field("Status da vaga",
          <button
            type="button"
            onClick={() => setVaga((v) => ({ ...v, ativa: !v.ativa }))}
            className={`flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              vaga.ativa
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500"
            }`}
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${vaga.ativa ? "bg-emerald-400" : "bg-zinc-600"}`} />
            {vaga.ativa ? "Vaga ativa (visível no site)" : "Vaga inativa (oculta no site)"}
          </button>
        )}

        {/* Descrição */}
        {field("Descrição *",
          <textarea
            required
            className={`${inputCls} resize-y`}
            rows={6}
            value={vaga.descricao}
            onChange={(e) => setVaga((v) => ({ ...v, descricao: e.target.value }))}
            placeholder="Descreva as responsabilidades, requisitos e diferenciais da vaga..."
          />
        )}
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  COMPONENTE PRINCIPAL                                                */
/* ═══════════════════════════════════════════════════════════════════ */
export default function AdminBlog() {
  /* ── Aba ativa ────────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState("blog"); // "blog" | "carreiras"

  /* ── Estado — Blog ────────────────────────────────────────────────
     A LISTA NÃO MORA MAIS AQUI. Quem carrega os Posts é `ListaDePosts`, pela
     camada de dados, com o carregamento, o erro e o vazio dela — três telas que
     a página não tem como orquestrar sem virar a listagem por outro nome.

     O que fica aqui é só o que a PÁGINA precisa saber: quantos Posts há (a
     contagem da aba, que a barra exibe) e quando a lista precisa recarregar.
     `contagemDePosts` nasce `null` — "ainda não sei" — e não `0`: um zero
     enquanto os dados vêm anuncia "nenhum post" para quem tem doze. */
  const [contagemDePosts, setContagemDePosts] = useState(null);
  const [versaoDaLista, setVersaoDaLista] = useState(0);
  const [blogView, setBlogView] = useState("list"); // "list" | "form"
  const [editingPost, setEditingPost] = useState(null);

  /* ── O que se pede à busca ────────────────────────────────────────────
     A página só GUARDA o pedido: o termo digitado e os Estados marcados. Quem
     consulta é a listagem, pela camada de dados, e quem busca de verdade é o
     Postgres — insensível a maiúsculas e a acento, sobre título, Categoria,
     Autor e Tags. Filtrar aqui a lista já carregada é o que a Story 2.10
     removeu de propósito: funciona enquanto há poucos Posts e passa a mentir
     exatamente quando a busca fica necessária. */
  const [buscaDePosts, setBuscaDePosts] = useState("");
  const [estadosDoFiltro, setEstadosDoFiltro] = useState([]);
  const limparBuscaDePosts = () => {
    setBuscaDePosts("");
    setEstadosDoFiltro([]);
  };

  /* ── Estado — Carreiras ───────────────────────────────────────── */
  const [vagas, setVagas] = useState([]);
  const [vagasView, setVagasView] = useState("list");
  const [editingVaga, setEditingVaga] = useState(null);
  const [vagasSearch, setVagasSearch] = useState("");

  /* ── Modais ────────────────────────────────────────────────────── */
  /* Só vaga: excluir Post saiu com o `blogStore` (ver acima). O campo `type`
     continua no formato para a Story 2.12 recolocar o Post por lá, agora pelo
     caminho único de escrita. */
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: "vaga", item }
  const [confirmReset, setConfirmReset] = useState(false);

  /* Carrega as vagas na montagem. A página só é montada com sessão verificada —
     o portão está acima da rota —, então não há mais condição a checar aqui.
     Os Posts NÃO são carregados aqui: quem os lê é `ListaDePosts`, pela camada
     de dados, e ler duas vezes em dois lugares é como o Painel chegou a mostrar
     de uma origem e gravar noutra. */
  useEffect(() => {
    setVagas(getVagas());
  }, []);

  /* ── Ações — Blog ─────────────────────────────────────────────── */
  /* Salvar NÃO fecha o Editor. A regra do épico é explícita — publicar não tira
     o Autor do Editor —, e o mesmo vale para salvar: quem acabou de gravar
     costuma continuar escrevendo. Quem sai é o botão de voltar, e só ele.

     O QUE ESTA FUNÇÃO GARANTE é que a listagem, quando o Autor voltar, já saiba
     do que foi gravado: a versão muda, e a lista relê pela camada de dados. Sem
     isto o Autor salva e volta para uma lista que ainda não viu o Post — que é
     precisamente a costura que esta story fecha. */
  const handleSavePost = () => { setVersaoDaLista((n) => n + 1); };

  /* Não existe `handleDeletePost`, e a ausência é a entrega: excluir Post
     passava por `blogStore`, que grava no armazenamento do navegador. Depois da
     Story 2.10 a lista vem do Supabase, e apagar do `localStorage` removeria uma
     linha que a listagem nem mostra — a aparência de ter excluído, sem excluir
     nada. As ações por linha, com o caminho único de escrita, são da Story 2.12.

     Também não existe `handleResetPosts`: Restaurar só é oferecida na aba
     Carreiras (Story 1.5), então o caminho de restaurar posts não tem como ser
     acionado. Deixá-lo escrito seria código morto se passando por
     funcionalidade — e um dia alguém religaria o botão confiando num caminho que
     ninguém exercitou. */

  /* ── Ações — Carreiras ────────────────────────────────────────── */
  const handleSaveVaga = () => { setVagas(getVagas()); setVagasView("list"); setEditingVaga(null); };

  const handleDeleteVaga = (id) => {
    try {
      setVagas(deleteVaga(id));
      setDeleteTarget(null);
      notificarSucesso("Vaga excluída");
    } catch (erro) {
      console.error("[Painel] falha ao excluir vaga", erro);
      notificarErro("Não deu para excluir a vaga", comoResolver(erro, "excluir"));
    }
  };

  const handleResetVagas = () => {
    try {
      setVagas(resetVagas());
      setConfirmReset(false);
      notificarSucesso("Vagas originais restauradas");
    } catch (erro) {
      console.error("[Painel] falha ao restaurar vagas", erro);
      notificarErro("Não deu para restaurar as vagas", comoResolver(erro, "restaurar"));
    }
  };

  /* ── A barra: abas e ações da aba ativa ───────────────────────── */

  /* A casca não conhece Post nem Vaga (AD-15) — as abas chegam nela como dados.
     A contagem vai formatada: número é dado, e a barra o exibe em `.dado`. */
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
      id: "carreiras",
      rotulo: "Carreiras",
      Icone: Briefcase,
      contagem: formatarNumero(vagas.length),
      href: "/carreiras",
      rotuloDoLink: "Abrir a página de carreiras em nova aba",
    },
  ];

  /* Restaurar é global e destrutiva, e some da aba Blog — é lá que ela nunca
     pertenceu. Em Carreiras continua exatamente como hoje: o módulo está fora
     de escopo e não pode regredir (AD-15). Passar a ação em vez de escrevê-la
     na barra é o que permite as duas coisas ao mesmo tempo. */
  const acoesDaAba =
    activeTab === "carreiras"
      ? [
          {
            id: "restaurar",
            rotulo: "Restaurar",
            Icone: RotateCcw,
            aoAcionar: () => setConfirmReset(true),
          },
        ]
      : [];

  /* ── Editor de post (tela cheia) ──────────────────────────────────
     O formulário de `localStorage` com campo de Autor digitável e caixa de
     Markdown SAIU: quem edita post agora é o Editor visual da Story 2.4 com a
     gaveta de metadados da 2.6, e quem grava é a função de servidor da 2.5. A
     listagem SAIU na Story 2.10, e virou `ListaDePosts` — o que ficou aqui é
     para onde "editar" e "novo" levam, e o aviso de que gravou.

     A troca com a listagem NÃO É MAIS `return` condicional (item 5): um
     `return` cedo troca a árvore inteira num quadro só, e é por isso que a
     versão anterior não animava — não havia `AnimatePresence` para animar,
     porque as duas telas nunca coexistiam nem por um instante. Agora as duas
     são ramos de UM retorno só, mais abaixo. */

  /* ── Formulário de vaga (tela cheia) ──────────────────────────── */
  /* `blogView !== "form"` é a guarda que preserva a prioridade de ANTES desta
     mudança: o Editor de Post sempre vencia quando os dois estavam abertos.
     Sem ela, este `return` antecipado passaria na frente do ramo do Editor
     (mais abaixo, dentro do `AnimatePresence`) sempre que os dois Estados
     fossem "form" ao mesmo tempo — inversão de prioridade, e não decisão. */
  if (vagasView === "form" && blogView !== "form") {
    return (
      <VagaForm
        vaga={editingVaga}
        onSave={handleSaveVaga}
        onCancel={() => { setVagasView("list"); setEditingVaga(null); }}
      />
    );
  }

  /* ── Filtros ──────────────────────────────────────────────────────
     Só Carreiras filtra aqui, sobre o que já está na memória. O Blog NÃO tem
     equivalente nesta página, e a ausência é a entrega: a busca de Post
     acontece no Postgres — insensível a maiúsculas e a acento, sobre título,
     Categoria, Autor e Tags —, e um `includes` de minúsculas sobre a lista
     carregada não é nada disso. Reintroduzi-lo aqui daria duas buscas com
     resultados diferentes para a mesma pergunta. */
  const filteredVagas = vagas.filter(
    (v) =>
      v.titulo.toLowerCase().includes(vagasSearch.toLowerCase()) ||
      v.departamento.toLowerCase().includes(vagasSearch.toLowerCase()) ||
      v.localizacao.toLowerCase().includes(vagasSearch.toLowerCase()),
  );

  /* O rótulo do diálogo de exclusão precisa existir mesmo com ele fechado —
     agora que a montagem é permanente, não condicional. Só há um tipo de alvo
     desde a Story 2.10: excluir Post saiu junto com o `blogStore`. */
  const tipoDoAlvo = "vaga";

  /* ── Render principal ─────────────────────────────────────────── */
  //
  // O Editor e a listagem são ramos do MESMO `AnimatePresence`, com
  // `mode="wait"` — a tela que sai termina a saída antes de a que entra
  // começar a entrar, então as duas nunca disputam a mesma área ao mesmo
  // tempo. A chave (`key="editor"` / `key="lista"`) é o que diz ao
  // `AnimatePresence` que são telas DIFERENTES, e não a mesma tela
  // reordenando props — sem ela não haveria saída para animar.
  return (
    <AnimatePresence mode="wait">
      {blogView === "form" ? (
        <motion.div
          key="editor"
          initial={pageTransition.initial}
          animate={pageTransition.animate}
          exit={pageTransition.exit}
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
          Vive na casca (`admin/shell`), não mais aqui: é compartilhada com
          Carreiras. A página só diz quais abas existem e quais ações a aba
          ativa oferece. */}
      <BarraSuperior
        titulo="Painel de conteúdo — ChatClean"
        abas={abas}
        abaAtiva={activeTab}
        aoTrocarAba={setActiveTab}
        idDoConteudo={ID_DO_CONTEUDO}
        acoesDaAba={acoesDaAba}
      />

      {/* ────── Toolbar: busca + filtros + novo ──────────────────
          A faixa é COMPARTILHADA com Carreiras, e a fronteira é o que não pode
          escorregar: cada aba tem a sua busca, e a de Carreiras continua
          filtrando o que já está na memória do navegador — módulo fora de
          escopo, que não pode regredir. A do Blog é outra coisa: ela vai ao
          banco, e o campo aqui só guarda o que foi digitado. */}
      {/* A quebra de linha entra SÓ na aba Blog: ela é que ganhou quatro
          filtros ao lado do campo. Ligá-la nas duas mudaria como a faixa de
          Carreiras se comporta em tela estreita, e Carreiras não pode
          regredir. */}
      <div
        className={`shrink-0 border-b border-zinc-800 px-6 py-4 flex items-center gap-3 ${
          activeTab === "blog" ? "flex-wrap" : ""
        }`}
      >
        {activeTab === "blog" ? (
          <>
            <div className="relative flex-1 min-w-[14rem] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={buscaDePosts}
                onChange={(e) => setBuscaDePosts(e.target.value)}
                placeholder="Buscar por título, categoria, autor ou tag..."
                aria-label="Buscar posts por título, categoria, autor ou tag"
                data-busca="posts"
                className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
              />
            </div>
            {/* Os filtros de Estado. As palavras vêm do vocabulário fechado do
                domínio — escrevê-las aqui criaria o sinônimo que ele existe
                para impedir —, e cada botão diz se está marcado por `aria-
                pressed`, não só pela cor. */}
            <div
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
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-300"
                        : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
                    }`}
                  >
                    {rotuloDoEstado(estado)}
                  </button>
                );
              })}
            </div>
            {/* O vão que empurra "Novo Post" para a borda. Ele é da aba Blog e
                só dela: em Carreiras o botão sempre veio logo depois do campo,
                e mover um controle de módulo fora de escopo é regressão. */}
            <div className="flex-1" />
            {/* A ENTRADA PARA AS CATEGORIAS (Story 2.14).
                É um LINK para uma rota irmã, e não uma terceira aba: a faixa em
                que ele está é um ternário de dois ramos, e uma aba a mais
                cairia no ramo de Carreiras — ganhando o campo "Buscar vagas" e
                o botão "Nova Vaga". Ele só existe na aba Blog, como tudo o mais
                deste ramo. */}
            <Link
              to={ENDERECO_DAS_CATEGORIAS}
              data-acao="abrir-categorias"
              className="flex items-center gap-2 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
            >
              <Tags className="w-4 h-4" />
              <span className="hidden sm:inline">Categorias</span>
            </Link>
          </>
        ) : (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              value={vagasSearch}
              onChange={(e) => setVagasSearch(e.target.value)}
              placeholder="Buscar vagas..."
              className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
            />
          </div>
        )}
        <button
          onClick={() => {
            if (activeTab === "blog") { setEditingPost(null); setBlogView("form"); }
            else { setEditingVaga(null); setVagasView("form"); }
          }}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">
            {activeTab === "blog" ? "Novo Post" : "Nova Vaga"}
          </span>
        </button>
      </div>

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
            A LISTAGEM LÊ O SUPABASE, e não mais o `localStorage`. Carregamento,
            erro e vazio são dela: são três telas distintas, e a página não teria
            como orquestrá-las sem virar a listagem por outro nome.

            `recarregarEm` é a costura com o Editor: salvar muda a versão, a
            lista relê, e o Autor que acabou de gravar encontra o Post. */}
        {activeTab === "blog" && (
          <ListaDePosts
            recarregarEm={versaoDaLista}
            termo={buscaDePosts}
            estados={estadosDoFiltro}
            aoContar={setContagemDePosts}
            aoAbrirPost={(post) => { setEditingPost(post); setBlogView("form"); }}
            aoCriarPost={() => { setEditingPost(null); setBlogView("form"); }}
            aoLimparBusca={limparBuscaDePosts}
          />
        )}

        {/* ── VAGAS ─────────────────────────────────────────────── */}
        {activeTab === "carreiras" && (
          filteredVagas.length === 0 ? (
            <div className="text-center py-20 text-zinc-600">
              <Briefcase className="w-12 h-12 mx-auto mb-4 opacity-25" />
              <p className="text-base font-medium">Nenhuma vaga encontrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVagas.map((vaga) => (
                <div
                  key={vaga.id}
                  className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors group"
                >
                  {/* Ícone colorido */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${vaga.accent} flex items-center justify-center shrink-0 shadow-lg`}>
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white text-sm truncate">{vaga.titulo}</h3>
                      {!vaga.ativa && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-500 border border-zinc-700 shrink-0">
                          Inativa
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="bg-zinc-800 px-2 py-0.5 rounded-full">{vaga.departamento}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {vaga.localizacao}
                      </span>
                      <span>{vaga.tipo}</span>
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${NIVEL_COLORS[vaga.nivel] || "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
                        {vaga.nivel}
                      </span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Link
                      to="/carreiras"
                      target="_blank"
                      className="p-2 rounded-xl hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                      title="Ver página de carreiras"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => { setEditingVaga(vaga); setVagasView("form"); }}
                      className="p-2 rounded-xl hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ type: "vaga", item: vaga })}
                      className="p-2 rounded-xl hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ────── Diálogos ──────────────────────────────────────────
          Montados SEMPRE, controlados por `open`. Montagem condicional
          (`{alvo && <Dialogo …>}`) nunca transita de aberto para fechado: o
          componente desmonta, e com ele o `onCloseAutoFocus` do Radix, que é
          quem devolve o foco ao botão que abriu o diálogo. Quem fecha por `Esc`
          ou por Cancelar perdia o foco no `body` e recomeçava a tabulação do
          topo da página.

          O rótulo do botão diz o que ele faz — "Excluir post", não
          "Confirmar" —, e Cancelar é o foco inicial. */}
      <DialogoDeConfirmacao
        aberto={Boolean(deleteTarget)}
        aoMudarAbertura={(aberto) => { if (!aberto) setDeleteTarget(null); }}
        titulo={`Excluir ${tipoDoAlvo}?`}
        descricao={`"${deleteTarget?.item?.titulo ?? ""}" será removido permanentemente.`}
        rotuloDeConfirmacao={`Excluir ${tipoDoAlvo}`}
        aoConfirmar={() => {
          if (!deleteTarget) return;
          handleDeleteVaga(deleteTarget.item.id);
        }}
      />

      {/* Restaurar não é excluir. O modal artesanal distinguia — âmbar para
          restaurar, vermelho para excluir — e a distinção de gravidade não
          pode se perder na troca: `perigo={false}`. */}
      <DialogoDeConfirmacao
        aberto={confirmReset}
        aoMudarAbertura={(aberto) => { if (!aberto) setConfirmReset(false); }}
        titulo="Restaurar vagas originais?"
        descricao="Todas as alterações em vagas serão perdidas e os dados padrão serão restaurados."
        rotuloDeConfirmacao="Restaurar vagas originais"
        perigo={false}
        aoConfirmar={handleResetVagas}
      />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
