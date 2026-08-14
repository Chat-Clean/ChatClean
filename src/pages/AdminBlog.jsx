import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Eye, RotateCcw,
  Save, X, Star, StarOff,
  ChevronLeft, Search, Check,
  Upload, FileText, Briefcase,
  Cpu, Target, BarChart2, Bot, TrendingUp, Newspaper,
  MapPin,
} from "lucide-react";

import BarraSuperior, { idDaAba } from "@/admin/shell/BarraSuperior";
import DialogoDeConfirmacao from "@/admin/shell/DialogoDeConfirmacao";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import { formatarNumero } from "@/domain/blog/formato";
import { getPosts, savePost, deletePost } from "@/lib/blogStore";
import { getVagas, saveVaga, deleteVaga, resetVagas } from "@/lib/vagasStore";

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

/* ─── Categorias do blog ──────────────────────────────────────────── */
const CATEGORIAS = ["Tecnologia", "Estratégia", "Analytics", "Automação", "Tendências", "Novidades"];

/* ─── Ícone por categoria ──────────────────────────────────────────── */
const CATEGORY_ICON = {
  Tecnologia:   { Icon: Cpu,        bg: "bg-blue-500/15",    text: "text-blue-400"    },
  "Estratégia": { Icon: Target,     bg: "bg-purple-500/15",  text: "text-purple-400"  },
  Analytics:    { Icon: BarChart2,  bg: "bg-amber-500/15",   text: "text-amber-400"   },
  "Automação":  { Icon: Bot,        bg: "bg-emerald-500/15", text: "text-emerald-400" },
  "Tendências": { Icon: TrendingUp, bg: "bg-rose-500/15",    text: "text-rose-400"    },
  Novidades:    { Icon: Newspaper,  bg: "bg-cyan-500/15",    text: "text-cyan-400"    },
};

function CategoryThumb({ categoria }) {
  const cfg = CATEGORY_ICON[categoria] || { Icon: Cpu, bg: "bg-zinc-700", text: "text-zinc-400" };
  return (
    <div className={`w-full h-full flex items-center justify-center rounded-xl ${cfg.bg}`}>
      <cfg.Icon className={`w-7 h-7 ${cfg.text}`} strokeWidth={1.5} />
    </div>
  );
}

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

/* ─── Post vazio ──────────────────────────────────────────────────── */
const EMPTY_POST = {
  id: null,
  slug: "",
  titulo: "",
  resumo: "",
  categoria: "Tecnologia",
  autor: "",
  data: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }),
  tempo: "5 min",
  destaque: false,
  imagem: "",
  conteudo: "",
  tags: [],
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

/* ─── Gera slug ───────────────────────────────────────────────────── */
function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/* O modal de confirmação artesanal que vivia aqui SAIU do repositório.
   Era um `div` fixo sem `role`, sem armadilha de foco, sem `Esc`, sem devolver
   o foco a quem o abriu, e com o botão destrutivo alcançável antes do Cancelar.
   Quem confirma agora é `DialogoDeConfirmacao`, sobre o `alert-dialog` do
   shadcn (Story 1.6). */

/* ═══════════════════════════════════════════════════════════════════ */
/*  FORMULÁRIO DE POST (criar / editar)                                 */
/* ═══════════════════════════════════════════════════════════════════ */
function PostForm({ post: initialPost, onSave, onCancel }) {
  const [post, setPost] = useState({ ...EMPTY_POST, ...initialPost });
  const [tagsInput, setTagsInput] = useState((initialPost?.tags || []).join(", "));
  const [imgMode, setImgMode] = useState("url");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);

  const isNew = !post.id;

  const handleTituloChange = (value) => {
    setPost((p) => ({
      ...p,
      titulo: value,
      slug: isNew ? slugify(value) : p.slug,
    }));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPost((p) => ({ ...p, imagem: reader.result }));
    reader.readAsDataURL(file);
  };

  /* Salvar é a operação que de fato estoura: o post carrega a imagem de capa
     embutida em base64, e é ela que enche a cota do `localStorage`. Antes,
     `setSaved(true)` era incondicional — a tela dizia "Salvo!" e voltava para a
     listagem mesmo quando a gravação tinha lançado, e o post sumia no
     recarregamento seguinte sem que nada explicasse por quê. */
  const handleSubmit = (e) => {
    e.preventDefault();
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      savePost({ ...post, tags });
    } catch (erro) {
      console.error("[Painel] falha ao salvar post", erro);
      notificarErro(
        "Não deu para salvar o post",
        comoResolver(erro, "salvar"),
      );
      return;
    }
    setSaved(true);
    notificarSucesso("Post salvo", post.titulo);
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
            <h2 className="text-white font-black text-lg">{isNew ? "Novo Post" : "Editar Post"}</h2>
            {/* Slug é dado, não prosa: só ele vai em `.dado`, não a frase toda. */}
            <p className="text-zinc-500 text-xs">
              {isNew ? "Criando um novo artigo" : <>Editando: <span className="dado">{post.slug}</span></>}
            </p>
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
        {field("Título *",
          <input required className={inputCls} value={post.titulo} onChange={(e) => handleTituloChange(e.target.value)} placeholder="Título do artigo" />
        )}

        <div className="grid grid-cols-2 gap-4">
          {field("Slug (URL)",
            <input className={`${inputCls} dado`} value={post.slug} onChange={(e) => setPost((p) => ({ ...p, slug: e.target.value }))} placeholder="meu-artigo-slug" />
          )}
          {field("Destaque",
            <button
              type="button"
              onClick={() => setPost((p) => ({ ...p, destaque: !p.destaque }))}
              className={`flex items-center gap-2 w-full px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                post.destaque
                  ? "bg-amber-500/10 border-amber-500/50 text-amber-400"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {post.destaque ? <Star className="w-4 h-4" /> : <StarOff className="w-4 h-4" />}
              {post.destaque ? "Post em destaque" : "Marcar destaque"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {field("Categoria",
            <select className={inputCls} value={post.categoria} onChange={(e) => setPost((p) => ({ ...p, categoria: e.target.value }))}>
              {CATEGORIAS.map((c) => <option key={c} value={c} className="bg-zinc-900">{c}</option>)}
            </select>
          )}
          {field("Autor",
            <input className={inputCls} value={post.autor} onChange={(e) => setPost((p) => ({ ...p, autor: e.target.value }))} placeholder="Nome do autor" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {field("Data",
            <input className={`${inputCls} dado`} value={post.data} onChange={(e) => setPost((p) => ({ ...p, data: e.target.value }))} placeholder="15 Jan 2024" />
          )}
          {field("Tempo de leitura",
            <input className={inputCls} value={post.tempo} onChange={(e) => setPost((p) => ({ ...p, tempo: e.target.value }))} placeholder="5 min" />
          )}
        </div>

        {/* Imagem */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1.5">Imagem de capa</label>
          <div className="flex gap-1 mb-3 p-1 bg-zinc-800 rounded-xl w-fit">
            {["url", "upload"].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setImgMode(mode)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                  imgMode === mode ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {mode === "url" ? "URL" : "Upload"}
              </button>
            ))}
          </div>
          {imgMode === "url" ? (
            <input className={inputCls} value={post.imagem} onChange={(e) => setPost((p) => ({ ...p, imagem: e.target.value }))} placeholder="https://exemplo.com/imagem.jpg" />
          ) : (
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 w-full border-2 border-dashed border-zinc-700 hover:border-emerald-500 rounded-xl p-4 text-zinc-400 hover:text-emerald-400 transition-colors text-sm"
              >
                <Upload className="w-5 h-5" />
                Clique para selecionar uma imagem
              </button>
            </div>
          )}
          {post.imagem && (
            <div className="mt-3 relative">
              <img src={post.imagem} alt="Preview" className="w-full h-40 object-cover rounded-xl border border-zinc-700" onError={(e) => { e.target.style.display = "none"; }} />
              <button type="button" onClick={() => setPost((p) => ({ ...p, imagem: "" }))} className="absolute top-2 right-2 p-1 bg-zinc-900/80 rounded-full text-zinc-400 hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {field("Resumo (meta descrição) *",
          <textarea required className={`${inputCls} resize-none`} rows={3} value={post.resumo} onChange={(e) => setPost((p) => ({ ...p, resumo: e.target.value }))} placeholder="Breve descrição do artigo (exibida na listagem e no SEO)" />
        )}

        {field("Tags (separadas por vírgula)",
          <input className={inputCls} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="WhatsApp, CRM, Automação" />
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Conteúdo (Markdown) *</label>
            <span className="dado text-xs text-zinc-600">{post.conteudo.length} caracteres</span>
          </div>
          <textarea
            required
            className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
            rows={20}
            value={post.conteudo}
            onChange={(e) => setPost((p) => ({ ...p, conteudo: e.target.value }))}
            placeholder={`# Título do Artigo\n\nEscreva seu conteúdo em Markdown aqui...\n\n## Seção\n\nTexto com **negrito** e *itálico*.\n\n- Item 1\n- Item 2`}
          />
          <p className="text-zinc-600 text-xs mt-1.5">Suporte a Markdown: **negrito**, *itálico*, ## títulos, - listas, `código`</p>
        </div>
      </div>
    </form>
  );
}

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

  /* ── Estado — Blog ────────────────────────────────────────────── */
  const [posts, setPosts] = useState([]);
  const [blogView, setBlogView] = useState("list"); // "list" | "form"
  const [editingPost, setEditingPost] = useState(null);
  const [blogSearch, setBlogSearch] = useState("");

  /* ── Estado — Carreiras ───────────────────────────────────────── */
  const [vagas, setVagas] = useState([]);
  const [vagasView, setVagasView] = useState("list");
  const [editingVaga, setEditingVaga] = useState(null);
  const [vagasSearch, setVagasSearch] = useState("");

  /* ── Modais ────────────────────────────────────────────────────── */
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: "blog"|"vaga", item }
  const [confirmReset, setConfirmReset] = useState(false);

  /* Carrega dados na montagem. A página só é montada com sessão verificada —
     o portão está acima da rota —, então não há mais condição a checar aqui. */
  useEffect(() => {
    setPosts(getPosts());
    setVagas(getVagas());
  }, []);

  /* ── Ações — Blog ─────────────────────────────────────────────── */
  const handleSavePost = () => { setPosts(getPosts()); setBlogView("list"); setEditingPost(null); };

  /* Excluir e restaurar também gravam, e também podem falhar — por motivo que
     raramente é cota, já que ambas escrevem menos do que havia antes. O erro é
     capturado e registrado, e a mensagem só fala em espaço quando o erro é
     mesmo de cota: mandar limpar espaço por um defeito que espaço nenhum
     resolve é pior que não dizer nada. */
  const handleDeletePost = (id) => {
    try {
      setPosts(deletePost(id));
      setDeleteTarget(null);
      notificarSucesso("Post excluído");
    } catch (erro) {
      console.error("[Painel] falha ao excluir post", erro);
      notificarErro("Não deu para excluir o post", comoResolver(erro, "excluir"));
    }
  };

  /* Não existe `handleResetPosts`: Restaurar só é oferecida na aba Carreiras
     (Story 1.5), então o caminho de restaurar posts não tem como ser acionado.
     Deixá-lo escrito seria código morto se passando por funcionalidade — e um
     dia alguém religaria o botão confiando num caminho que ninguém exercitou.
     A restauração de posts volta quando o Épico 2 decidir se ela deve existir. */

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
      contagem: formatarNumero(posts.length),
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

  /* ── Formulário de post (tela cheia) ──────────────────────────── */
  if (blogView === "form") {
    return (
      <PostForm
        post={editingPost}
        onSave={handleSavePost}
        onCancel={() => { setBlogView("list"); setEditingPost(null); }}
      />
    );
  }

  /* ── Formulário de vaga (tela cheia) ──────────────────────────── */
  if (vagasView === "form") {
    return (
      <VagaForm
        vaga={editingVaga}
        onSave={handleSaveVaga}
        onCancel={() => { setVagasView("list"); setEditingVaga(null); }}
      />
    );
  }

  /* ── Filtros ──────────────────────────────────────────────────── */
  const search = activeTab === "blog" ? blogSearch : vagasSearch;
  const setSearch = activeTab === "blog" ? setBlogSearch : setVagasSearch;

  const filteredPosts = posts.filter(
    (p) =>
      p.titulo.toLowerCase().includes(blogSearch.toLowerCase()) ||
      p.categoria.toLowerCase().includes(blogSearch.toLowerCase()) ||
      p.autor.toLowerCase().includes(blogSearch.toLowerCase()),
  );

  const filteredVagas = vagas.filter(
    (v) =>
      v.titulo.toLowerCase().includes(vagasSearch.toLowerCase()) ||
      v.departamento.toLowerCase().includes(vagasSearch.toLowerCase()) ||
      v.localizacao.toLowerCase().includes(vagasSearch.toLowerCase()),
  );

  /* O rótulo do diálogo de exclusão precisa existir mesmo com ele fechado —
     agora que a montagem é permanente, não condicional. */
  const tipoDoAlvo = deleteTarget?.type === "vaga" ? "vaga" : "post";

  /* ── Render principal ─────────────────────────────────────────── */
  return (
    <div className="painel h-screen flex flex-col bg-zinc-950 text-white overflow-hidden">

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

      {/* ────── Toolbar: busca + novo ──────────────────────────── */}
      <div className="shrink-0 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === "blog" ? "Buscar posts..." : "Buscar vagas..."}
            className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
          />
        </div>
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

        {/* ── POSTS ─────────────────────────────────────────────── */}
        {activeTab === "blog" && (
          filteredPosts.length === 0 ? (
            <div className="text-center py-20 text-zinc-600">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-25" />
              <p className="text-base font-medium">Nenhum post encontrado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors group"
                >
                  {/* Thumb */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-zinc-800">
                    {post.imagem ? (
                      <img
                        src={post.imagem}
                        alt={post.titulo}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <CategoryThumb categoria={post.categoria} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white text-sm truncate">{post.titulo}</h3>
                      {post.destaque && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="bg-zinc-800 px-2 py-0.5 rounded-full">{post.categoria}</span>
                      {post.autor && <span>{post.autor}</span>}
                      {/* Data e tempo de leitura são dados: alinham em coluna
                          entre as linhas da listagem, com numeral tabular. */}
                      <span className="dado">{post.data}</span>
                      <span className="dado">{post.tempo}</span>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Link
                      to={`/blog/${post.slug}`}
                      target="_blank"
                      className="p-2 rounded-xl hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                      title="Ver post"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => { setEditingPost(post); setBlogView("form"); }}
                      className="p-2 rounded-xl hover:bg-emerald-500/10 text-zinc-400 hover:text-emerald-400 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ type: "blog", item: post })}
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
          if (deleteTarget.type === "blog") handleDeletePost(deleteTarget.item.id);
          else handleDeleteVaga(deleteTarget.item.id);
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
    </div>
  );
}
