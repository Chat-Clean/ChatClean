import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Eye, LogOut, RotateCcw,
  Save, X, Star, StarOff,
  ChevronLeft, Search, AlertTriangle, Check,
  Upload, ExternalLink, FileText, Briefcase,
  Cpu, Target, BarChart2, Bot, TrendingUp, Newspaper,
  MapPin,
} from "lucide-react";

import { getPosts, savePost, deletePost, resetPosts } from "@/lib/blogStore";
import { getVagas, saveVaga, deleteVaga, resetVagas } from "@/lib/vagasStore";

/* ─── Senha de acesso ──────────────────────────────────────────────── */
const ADMIN_PASSWORD = "chatclean@admin";
const AUTH_KEY = "cc_admin_auth";

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

/* ═══════════════════════════════════════════════════════════════════ */
/*  TELA DE LOGIN                                                       */
/* ═══════════════════════════════════════════════════════════════════ */
function LoginScreen({ onLogin }) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pwd === ADMIN_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, "1");
      onLogin();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/30">
            <span className="text-2xl font-black text-white">CC</span>
          </div>
          <h1 className="text-2xl font-black text-white">Admin ChatClean</h1>
          <p className="text-zinc-500 text-sm mt-1">Blog &amp; Carreiras</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">Senha</label>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••••••"
              className={`w-full bg-zinc-800 border rounded-xl px-4 py-2.5 text-white outline-none transition-colors text-sm ${
                error ? "border-red-500 focus:border-red-500" : "border-zinc-700 focus:border-emerald-500"
              }`}
              autoFocus
            />
            {error && <p className="text-red-400 text-xs mt-1.5">Senha incorreta.</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
          >
            Entrar
          </button>
        </form>
        <p className="text-center text-zinc-600 text-xs mt-4">
          Senha padrão: <code className="text-zinc-400">chatclean@admin</code>
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  MODAL DE CONFIRMAÇÃO                                                */
/* ═══════════════════════════════════════════════════════════════════ */
function ConfirmModal({ title, message, onConfirm, onCancel, confirmLabel = "Excluir", confirmClass = "bg-red-500 hover:bg-red-600" }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <h3 className="text-white font-bold">{title}</h3>
        </div>
        <p className="text-zinc-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-zinc-600 text-zinc-300 hover:border-zinc-400 transition-colors text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 rounded-xl text-white transition-colors text-sm font-bold ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

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

  const handleSubmit = (e) => {
    e.preventDefault();
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    savePost({ ...post, tags });
    setSaved(true);
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
            <p className="text-zinc-500 text-xs">{isNew ? "Criando um novo artigo" : `Editando: ${post.slug}`}</p>
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
            <input className={inputCls} value={post.slug} onChange={(e) => setPost((p) => ({ ...p, slug: e.target.value }))} placeholder="meu-artigo-slug" />
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
            <input className={inputCls} value={post.data} onChange={(e) => setPost((p) => ({ ...p, data: e.target.value }))} placeholder="15 Jan 2024" />
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
            <span className="text-xs text-zinc-600">{post.conteudo.length} caracteres</span>
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

  const handleSubmit = (e) => {
    e.preventDefault();
    saveVaga(vaga);
    setSaved(true);
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
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem(AUTH_KEY));

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

  /* Carrega dados ao autenticar */
  useEffect(() => {
    if (authed) {
      setPosts(getPosts());
      setVagas(getVagas());
    }
  }, [authed]);

  /* ── Ações — Blog ─────────────────────────────────────────────── */
  const handleSavePost = () => { setPosts(getPosts()); setBlogView("list"); setEditingPost(null); };
  const handleDeletePost = (id) => { setPosts(deletePost(id)); setDeleteTarget(null); };
  const handleResetPosts = () => { setPosts(resetPosts()); setConfirmReset(false); };

  /* ── Ações — Carreiras ────────────────────────────────────────── */
  const handleSaveVaga = () => { setVagas(getVagas()); setVagasView("list"); setEditingVaga(null); };
  const handleDeleteVaga = (id) => { setVagas(deleteVaga(id)); setDeleteTarget(null); };
  const handleResetVagas = () => { setVagas(resetVagas()); setConfirmReset(false); };

  /* ── Logout ────────────────────────────────────────────────────── */
  const handleLogout = () => { sessionStorage.removeItem(AUTH_KEY); setAuthed(false); };

  /* ── Não autenticado ──────────────────────────────────────────── */
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

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

  /* ── Render principal ─────────────────────────────────────────── */
  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white overflow-hidden">

      {/* ────── Topbar ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-zinc-800 px-6 py-3.5 flex items-center justify-between gap-4">

        {/* Lado esquerdo: logo + tabs */}
        <div className="flex items-center gap-5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <span className="text-xs font-black text-white">CC</span>
            </div>
            <div className="hidden sm:block">
              <p className="font-black text-white text-sm leading-none">Admin ChatClean</p>
              <p className="text-zinc-500 text-[11px] mt-0.5">
                {activeTab === "blog"
                  ? `${posts.length} post${posts.length !== 1 ? "s" : ""}`
                  : `${vagas.length} vaga${vagas.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>

          {/* Pills de aba */}
          <div className="flex gap-1 p-1 bg-zinc-900 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab("blog")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "blog"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Blog
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === "blog" ? "bg-emerald-500/25 text-emerald-300" : "bg-zinc-800 text-zinc-500"
              }`}>
                {posts.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("carreiras")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "carreiras"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              Carreiras
              <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === "carreiras" ? "bg-emerald-500/25 text-emerald-300" : "bg-zinc-800 text-zinc-500"
              }`}>
                {vagas.length}
              </span>
            </button>
          </div>
        </div>

        {/* Lado direito: ações */}
        <div className="flex items-center gap-2">
          {activeTab === "blog" ? (
            <Link
              to="/blog"
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ver Blog</span>
            </Link>
          ) : (
            <Link
              to="/carreiras"
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ver Carreiras</span>
            </Link>
          )}
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-amber-400 border border-zinc-700 hover:border-amber-500/50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Restaurar</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>

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

      {/* ────── Lista ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">

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
                      <span>{post.data}</span>
                      <span>{post.tempo}</span>
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

      {/* ────── Modais ────────────────────────────────────────── */}
      {deleteTarget && (
        <ConfirmModal
          title={`Excluir ${deleteTarget.type === "blog" ? "post" : "vaga"}?`}
          message={`"${deleteTarget.item.titulo}" será removido permanentemente.`}
          onConfirm={() => {
            if (deleteTarget.type === "blog") handleDeletePost(deleteTarget.item.id);
            else handleDeleteVaga(deleteTarget.item.id);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {confirmReset && (
        <ConfirmModal
          title={`Restaurar ${activeTab === "blog" ? "posts" : "vagas"} originais?`}
          message={`Todas as alterações em ${activeTab === "blog" ? "posts" : "vagas"} serão perdidas e os dados padrão serão restaurados.`}
          confirmLabel="Restaurar"
          confirmClass="bg-amber-500 hover:bg-amber-600"
          onConfirm={() => {
            if (activeTab === "blog") handleResetPosts();
            else handleResetVagas();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
