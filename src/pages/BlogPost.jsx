import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Share2,
  User,
} from "lucide-react";
import { Button } from "../components/ui/button";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { getPostBySlug, getRelatedPosts } from "../data/blogPosts";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584996950105&text=Gostaria+de+saber+mais+sobre+a+ChatClean";

export default function BlogPost() {
  const { slug } = useParams();
  const post = getPostBySlug(slug);

  if (!post) {
    return (
      <div className="min-h-screen bg-white selection:bg-emerald-500 selection:text-white">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center px-4">
            <p className="text-7xl font-black text-zinc-100 mb-4">404</p>
            <h1 className="text-3xl font-black text-zinc-900 tracking-tighter mb-4">
              Post não encontrado
            </h1>
            <p className="text-zinc-500 mb-8">O artigo que você procura não existe.</p>
            <Link to="/blog">
              <Button className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Blog
              </Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const relatedPosts = getRelatedPosts(post.id, post.categoria);

  const sharePost = () => {
    if (navigator.share) {
      navigator.share({ title: post.titulo, text: post.resumo, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copiado para a área de transferência!");
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white">
      <Navbar />

      {/* Hero aurora */}
      <section className="relative aurora-bg aurora-beams pt-40 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-grid-white opacity-40 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-3 mb-6"
          >
            <span className="inline-block px-3 py-1 rounded-full bg-white/20 border border-white/40 text-white text-xs font-bold uppercase tracking-widest">
              {post.categoria}
            </span>
            <span className="flex items-center gap-1 text-white/70 text-xs">
              <Clock className="h-3.5 w-3.5" />
              {post.tempo} de leitura
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-3xl md:text-5xl font-black text-white tracking-tighter leading-tight mb-6"
          >
            {post.titulo}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/80 text-lg mb-8"
          >
            {post.resumo}
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="flex items-center justify-center gap-6 text-sm text-white/70"
          >
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              {post.autor}
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {post.data}
            </span>
            <button
              onClick={sharePost}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
            >
              <Share2 className="h-4 w-4" />
              Compartilhar
            </button>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-16">

        {/* Tags */}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-10">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Artigo */}
        <article className="mb-16">
          {(() => {
            const lines = post.conteudo.split("\n");
            const result = [];
            let listBuffer = [];
            let listKey = 0;

            const flushList = () => {
              if (listBuffer.length === 0) return;
              result.push(
                <ul
                  key={`ul-${listKey++}`}
                  className="list-disc list-outside pl-6 space-y-2 mb-6 text-zinc-600"
                >
                  {listBuffer.map((item, i) => <li key={i} className="leading-relaxed">{item}</li>)}
                </ul>,
              );
              listBuffer = [];
            };

            lines.forEach((line, index) => {
              if (line.trim() === "") { flushList(); return; }
              if (line.startsWith("# ")) {
                flushList();
                result.push(<h1 key={index} className="text-3xl font-black text-zinc-900 tracking-tight mt-10 mb-4">{line.slice(2)}</h1>);
              } else if (line.startsWith("## ")) {
                flushList();
                result.push(<h2 key={index} className="text-2xl font-black text-zinc-900 tracking-tight mt-8 mb-3">{line.slice(3)}</h2>);
              } else if (line.startsWith("### ")) {
                flushList();
                result.push(<h3 key={index} className="text-xl font-bold text-zinc-900 mt-6 mb-2">{line.slice(4)}</h3>);
              } else if (line.startsWith("- ")) {
                listBuffer.push(line.slice(2));
              } else if (line.startsWith("**") && line.endsWith("**")) {
                flushList();
                result.push(<p key={index} className="font-bold text-zinc-900 mb-4">{line.slice(2, -2)}</p>);
              } else {
                flushList();
                result.push(<p key={index} className="text-zinc-600 mb-4 leading-relaxed">{line}</p>);
              }
            });

            flushList();
            return result;
          })()}
        </article>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl aurora-bg aurora-beams p-10 text-center mb-16"
        >
          <div className="absolute inset-0 bg-grid-white opacity-30 pointer-events-none" />
          <div className="relative z-10">
            <h3 className="text-2xl font-black text-white tracking-tighter mb-3">
              Gostou do conteúdo?
            </h3>
            <p className="text-white/80 mb-6">
              Descubra como a ChatClean pode transformar o atendimento da sua empresa.
            </p>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-emerald-700 font-bold rounded-full shadow-xl hover:scale-[1.03] transition-all duration-300"
            >
              Agendar Demo Gratuita
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </motion.div>

        {/* Posts relacionados */}
        {relatedPosts.length > 0 && (
          <div className="mb-10">
            <h3 className="text-2xl font-black text-zinc-900 tracking-tighter mb-6">
              Artigos relacionados
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              {relatedPosts.map((rel, i) => (
                <motion.div
                  key={rel.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                >
                  <Link to={`/blog/${rel.slug}`} className="group block h-full">
                    <div className="h-full rounded-2xl border border-zinc-100 hover:border-emerald-200 bg-white p-6 green-glow card-3d transition-all duration-400">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-3">
                        {rel.categoria}
                      </span>
                      <h4 className="font-black text-zinc-900 tracking-tight mb-2 text-sm group-hover:text-emerald-700 transition-colors">
                        {rel.titulo}
                      </h4>
                      <span className="flex items-center gap-1 text-xs text-zinc-400">
                        <Clock className="h-3 w-3" />
                        {rel.tempo}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Back */}
        <div className="flex justify-start">
          <Link to="/blog">
            <Button variant="outline" className="rounded-full border-zinc-200 text-zinc-700 hover:border-emerald-300 hover:text-emerald-700">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Ver todos os artigos
            </Button>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
