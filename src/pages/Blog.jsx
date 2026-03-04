import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  User,
  ArrowRight,
  Search,
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
import { blogPosts, getPostsByCategory } from "../data/blogPosts";

const Blog = () => {
  const [categoriaAtiva, setCategoriaAtiva] = useState("Todos");
  const [termoBusca, setTermoBusca] = useState("");

  const categorias = [
    "Todos",
    "Tecnologia",
    "Estratégia",
    "Analytics",
    "Automação",
    "Tendências",
  ];

  const postsExibidos = getPostsByCategory(categoriaAtiva).filter(
    (post) =>
      post.titulo.toLowerCase().includes(termoBusca.toLowerCase()) ||
      post.resumo.toLowerCase().includes(termoBusca.toLowerCase()) ||
      post.categoria.toLowerCase().includes(termoBusca.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Blog</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Insights e Estratégias para o Sucesso
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Fique por dentro das últimas tendências, dicas práticas e
            estratégias comprovadas para revolucionar seu atendimento ao
            cliente.
          </p>
        </div>

        {/* Busca */}
        <div className="max-w-md mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar posts..."
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          {categorias.map((categoria) => (
            <Badge
              key={categoria}
              variant={categoria === categoriaAtiva ? "default" : "secondary"}
              className="cursor-pointer hover:bg-green-600 hover:text-white transition-colors"
              onClick={() => setCategoriaAtiva(categoria)}
            >
              {categoria}
            </Badge>
          ))}
        </div>

        {/* Post em Destaque */}
        {postsExibidos
          .filter((post) => post.destaque)
          .map((post) => (
            <Card key={post.id} className="mb-8 overflow-hidden">
              <div className="md:flex">
                <div className="md:w-1/3 bg-gradient-to-br from-green-500 to-green-600 p-8 text-white flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-2">
                      <ArrowRight className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-semibold">Post em Destaque</h3>
                  </div>
                </div>
                <div className="md:w-2/3 p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge>{post.categoria}</Badge>
                    <span className="text-sm text-gray-500">•</span>
                    <span className="text-sm text-gray-500">
                      {post.tempo} de leitura
                    </span>
                  </div>
                  <CardTitle className="text-2xl mb-3">{post.titulo}</CardTitle>
                  <CardDescription className="text-base mb-4">
                    {post.resumo}
                  </CardDescription>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center text-sm text-gray-500">
                      <User className="h-4 w-4 mr-1" />
                      {post.autor}
                      <Calendar className="h-4 w-4 ml-4 mr-1" />
                      {post.data}
                    </div>
                    <Link to={`/blog/${post.slug}`}>
                      <Button>
                        Ler Mais
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          ))}

        {/* Grid de Posts */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {postsExibidos
            .filter((post) => !post.destaque)
            .map((post) => (
              <Card key={post.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">{post.categoria}</Badge>
                    <span className="text-sm text-gray-500">{post.tempo}</span>
                  </div>
                  <CardTitle className="text-lg">{post.titulo}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {post.resumo}
                  </CardDescription>
                  <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-1" />
                      {post.autor}
                    </div>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {post.data}
                    </div>
                  </div>
                  <Link to={`/blog/${post.slug}`}>
                    <Button variant="outline" className="w-full">
                      Ler Artigo
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
        </div>

        {/* Mensagem quando não há posts */}
        {postsExibidos.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Nenhum post encontrado
            </h3>
            <p className="text-gray-600 mb-4">
              Tente ajustar os filtros ou termo de busca para encontrar o
              conteúdo desejado.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setCategoriaAtiva("Todos");
                setTermoBusca("");
              }}
            >
              Limpar Filtros
            </Button>
          </div>
        )}

        {/* Newsletter */}
        <div className="text-center bg-white rounded-lg p-8 shadow-sm">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            Receba Conteúdos Exclusivos
          </h3>
          <p className="text-gray-600 mb-6">
            Inscreva-se em nossa newsletter e receba dicas, estratégias e
            novidades sobre atendimento ao cliente diretamente no seu e-mail.
          </p>
          <Button
            size="lg"
            onClick={() =>
              window.open(
                "https://api.whatsapp.com/send?phone=5584996950105&text=Gostaria+de+receber+conteúdos+exclusivos+da+ChatClean",
                "_blank",
              )
            }
          >
            Inscrever-se na Newsletter
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Blog;
