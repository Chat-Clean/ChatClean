import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  Clock,
  Search,
  User,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { blogPosts, getPostsByCategory } from "../data/blogPosts";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584996950105&text=Gostaria+de+receber+conte%C3%BAdos+exclusivos+da+ChatClean";

const categorias = ["Todos", "Tecnologia", "Estratégia", "Analytics", "Automação", "Tendências"];

export default function Blog() {
  const [categoriaAtiva, setCategoriaAtiva] = useState("Todos");
  const [termoBusca, setTermoBusca] = useState("");

  const postsExibidos = getPostsByCategory(categoriaAtiva).filter(
    (post) =>
      post.titulo.toLowerCase().includes(termoBusca.toLowerCase()) ||
      post.resumo.toLowerCase().includes(termoBusca.toLowerCase()) ||
      post.categoria.toLowerCase().includes(termoBusca.toLowerCase()),
  );

  const destaque = postsExibidos.find((p) => p.destaque);
  const demais = postsExibidos.filter((p) => !p.destaque);

  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white">
      <Navbar />

      {/* Hero aurora */}
      <section className="relative aurora-bg aurora-beams pt-40 pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/30 backdrop-blur-md text-white text-xs font-bold uppercase tracking-widest mb-6"
          >
            Conhecimento que transforma
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-black text-white tracking-tighter leading-[1.0] mb-6"
          >
            Blog{" "}
            <span className="bg-gradient-to-r from-yellow-200 via-white to-cyan-100 bg-clip-text text-transparent">
              ChatClean
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg text-white/85 mb-10"
          >
            Estratégias, tendências e dicas para escalar seu atendimento.
          </motion.p>

          {/* Busca */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative max-w-md mx-auto"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar artigos..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="w-full pl-11 pr-5 py-3.5 rounded-full bg-white/95 backdrop-blur-md text-zinc-900 placeholder-zinc-400 border border-white/60 shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-sm"
            />
          </motion.div>
        </div>
      </section>

      {/* Filtros */}
      <section className="bg-white border-b border-zinc-100 sticky top-20 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-2 justify-center">
            {categorias.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaAtiva(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                  cat === categoriaAtiva
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-zinc-100 text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 py-16">

        {/* Sem resultados */}
        {postsExibidos.length === 0 && (
          <div className="text-center py-24">
            <p className="text-zinc-500 text-lg mb-6">Nenhum artigo encontrado.</p>
            <Button
              variant="outline"
              onClick={() => { setCategoriaAtiva("Todos"); setTermoBusca(""); }}
              className="rounded-full"
            >
              Limpar filtros
            </Button>
          </div>
        )}

        {/* Post em destaque */}
        {destaque && (
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mb-16"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-4">
              Post em destaque
            </p>
            <Link to={`/blog/${destaque.slug}`} className="group block">
              <div className="rounded-3xl border border-zinc-100 hover:border-emerald-200 bg-white overflow-hidden grid md:grid-cols-5 green-glow card-3d transition-all duration-500">
                <div className="md:col-span-2 aurora-bg flex items-center justify-center p-12 min-h-48">
                  <div className="text-center">
                    <span className="inline-block px-3 py-1 rounded-full bg-white/20 border border-white/40 text-white text-xs font-bold uppercase tracking-widest mb-4">
                      {destaque.categoria}
                    </span>
                    <p className="text-white/70 text-sm">{destaque.tempo} de leitura</p>
                  </div>
                </div>
                <div className="md:col-span-3 p-8 flex flex-col justify-between">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-black text-zinc-900 tracking-tight mb-4 group-hover:text-emerald-700 transition-colors">
                      {destaque.titulo}
                    </h2>
                    <p className="text-zinc-600 leading-relaxed mb-6">{destaque.resumo}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {destaque.autor}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {destaque.data}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-sm group-hover:gap-2 transition-all">
                      Ler artigo
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {/* Grid de posts */}
        {demais.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {demais.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link to={`/blog/${post.slug}`} className="group block h-full">
                  <div className="h-full rounded-3xl border border-zinc-100 hover:border-emerald-200 bg-white p-8 flex flex-col green-glow card-3d transition-all duration-500">
                    <div className="flex items-center justify-between mb-6">
                      <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                        {post.categoria}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
                        <Clock className="h-3.5 w-3.5" />
                        {post.tempo}
                      </span>
                    </div>

                    <h3 className="text-lg font-black text-zinc-900 tracking-tight mb-3 group-hover:text-emerald-700 transition-colors flex-1">
                      {post.titulo}
                    </h3>
                    <p className="text-zinc-500 text-sm leading-relaxed mb-6 line-clamp-3">
                      {post.resumo}
                    </p>

                    <div className="flex items-center justify-between text-xs text-zinc-400 mt-auto pt-4 border-t border-zinc-100">
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {post.autor}
                      </span>
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold group-hover:gap-2 transition-all">
                        Ler
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Newsletter */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl aurora-bg aurora-beams p-12 text-center"
        >
          <div className="absolute inset-0 bg-grid-white opacity-30 pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-block px-3 py-1.5 rounded-full bg-white/20 border border-white/30 text-white text-xs font-bold uppercase tracking-widest mb-6">
              Newsletter
            </span>
            <h3 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-4">
              Receba conteúdos exclusivos
            </h3>
            <p className="text-white/80 mb-8 max-w-xl mx-auto">
              Dicas práticas, tendências e estratégias para escalar seu atendimento.
            </p>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-emerald-700 font-bold rounded-full shadow-xl hover:shadow-2xl hover:scale-[1.03] transition-all duration-300"
            >
              Inscrever-se via WhatsApp
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
