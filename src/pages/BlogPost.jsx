import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  User,
  Clock,
  Share2,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { getPostBySlug, getRelatedPosts } from "../data/blogPosts";

const BlogPost = () => {
  const { slug } = useParams();
  const post = getPostBySlug(slug);

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Post não encontrado
          </h1>
          <p className="text-gray-600 mb-8">
            O post que você está procurando não existe.
          </p>
          <Link to="/blog">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao Blog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const relatedPosts = getRelatedPosts(post.id, post.categoria);

  const sharePost = () => {
    if (navigator.share) {
      navigator.share({
        title: post.titulo,
        text: post.resumo,
        url: window.location.href,
      });
    } else {
      // Fallback para copiar URL
      navigator.clipboard.writeText(window.location.href);
      alert("Link copiado para a área de transferência!");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Link to="/blog">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar ao Blog
                </Button>
              </Link>
            </div>
            <Button variant="outline" size="sm" onClick={sharePost}>
              <Share2 className="h-4 w-4 mr-2" />
              Compartilhar
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Post Header */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Badge>{post.categoria}</Badge>
            <span className="text-sm text-gray-500">•</span>
            <div className="flex items-center text-sm text-gray-500">
              <Clock className="h-4 w-4 mr-1" />
              {post.tempo} de leitura
            </div>
          </div>

          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            {post.titulo}
          </h1>

          <p className="text-xl text-gray-600 mb-6">{post.resumo}</p>

          <div className="flex items-center justify-between text-sm text-gray-500 border-t pt-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <User className="h-4 w-4 mr-1" />
                {post.autor}
              </div>
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                {post.data}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {post.tags?.map((tag, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Post Content */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <div className="prose prose-lg max-w-none">
            {post.conteudo.split("\n").map((paragraph, index) => {
              if (paragraph.trim() === "") return null;

              if (paragraph.startsWith("# ")) {
                return (
                  <h1
                    key={index}
                    className="text-3xl font-bold text-gray-900 mt-8 mb-4"
                  >
                    {paragraph.slice(2)}
                  </h1>
                );
              }

              if (paragraph.startsWith("## ")) {
                return (
                  <h2
                    key={index}
                    className="text-2xl font-bold text-gray-900 mt-6 mb-3"
                  >
                    {paragraph.slice(3)}
                  </h2>
                );
              }

              if (paragraph.startsWith("### ")) {
                return (
                  <h3
                    key={index}
                    className="text-xl font-bold text-gray-900 mt-4 mb-2"
                  >
                    {paragraph.slice(4)}
                  </h3>
                );
              }

              if (paragraph.startsWith("- ")) {
                return (
                  <li key={index} className="text-gray-700 mb-1">
                    {paragraph.slice(2)}
                  </li>
                );
              }

              if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
                return (
                  <p key={index} className="font-bold text-gray-900 mb-3">
                    {paragraph.slice(2, -2)}
                  </p>
                );
              }

              return (
                <p key={index} className="text-gray-700 mb-4 leading-relaxed">
                  {paragraph}
                </p>
              );
            })}
          </div>
        </div>

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-8 text-white text-center mb-8">
          <h3 className="text-2xl font-bold mb-4">Gostou do conteúdo?</h3>
          <p className="text-green-100 mb-6">
            Descubra como a ChatClean pode transformar o atendimento da sua
            empresa
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={() =>
              window.open(
                "https://api.whatsapp.com/send?phone=5584996950105&text=Gostaria+de+saber+mais+sobre+a+ChatClean",
                "_blank",
              )
            }
          >
            <BookOpen className="h-5 w-5 mr-2" />
            Agendar Demonstração Gratuita
          </Button>
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <div className="mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">
              Posts Relacionados
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              {relatedPosts.map((relatedPost) => (
                <Card
                  key={relatedPost.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader>
                    <Badge variant="secondary" className="w-fit mb-2">
                      {relatedPost.categoria}
                    </Badge>
                    <CardTitle className="text-lg">
                      {relatedPost.titulo}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="mb-4">
                      {relatedPost.resumo}
                    </CardDescription>
                    <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-1" />
                        {relatedPost.autor}
                      </div>
                      <div className="flex items-center">
                        <Clock className="h-4 w-4 mr-1" />
                        {relatedPost.tempo}
                      </div>
                    </div>
                    <Link to={`/blog/${relatedPost.slug}`}>
                      <Button variant="outline" className="w-full">
                        Ler Artigo
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-center">
          <Link to="/blog">
            <Button variant="outline" size="lg">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Ver Todos os Posts
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
};

export default BlogPost;
