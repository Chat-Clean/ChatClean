/**
 * A listagem do Blog Público — agora lendo do Supabase (Story 2.15).
 *
 * ─── A VISIBILIDADE É DA POLÍTICA, E DE MAIS NADA ───────────────────────────
 *
 * Nenhuma consulta desta página repete o filtro de Estado. O que aparece aqui é
 * o que a política de leitura anônima da Story 2.1 libera — publicado, ou
 * agendado cuja hora já passou. Se algum dia esta tela precisasse repetir o
 * filtro para estar correta, o erro estaria na política.
 *
 * E a leitura é pelo cliente ANÔNIMO, incondicionalmente: quem tem sessão
 * aberta no mesmo navegador vê exatamente o que um visitante vê. A escolha do
 * cliente é do módulo de dados, não desta tela — não há parâmetro para pedir
 * outro.
 *
 * ─── UM PEDIDO SÓ, E UM EFEITO SÓ ───────────────────────────────────────────
 *
 * Termo, Categoria, deslocamento e tentativa vivem num ESTADO ÚNICO. Com um
 * estado por dimensão, trocar de Categoria disparava dois pedidos — um com o
 * deslocamento velho e outro com ele zerado —, e o segundo podia voltar antes
 * do primeiro. Aqui cada mudança produz um pedido, e o pedido é o que o efeito
 * observa.
 *
 * ─── SEIS SITUAÇÕES, E NENHUMA DELAS É PÁGINA EM BRANCO ─────────────────────
 *
 * Carregando, pronta, vazia, sem-resultado, falha e falha permanente. As regras
 * e as frases moram em `blogPublico.js`, puras, para a verificação executá-las
 * em vez de ler JSX.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Clock,
  FileText,
  Search,
  User,
} from "lucide-react";
import { Button } from "../components/ui/button";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { buscarPostsPublicos } from "@/data/blog/posts";
import { listarCategorias } from "@/data/blog/taxonomia";
import {
  CATEGORIA_TODOS,
  ESPERA_DA_BUSCA_MS,
  FALHA_DAS_CATEGORIAS,
  LISTA_CARREGANDO,
  LISTA_FALHA,
  LISTA_FALHA_PERMANENTE,
  LISTA_PRONTA,
  ROTULO_DE_CARREGAR_MAIS,
  ROTULO_DE_LIMPAR_FILTROS,
  ROTULO_DE_RECARREGAR_A_LISTA,
  TAMANHO_DA_PAGINA,
  TEXTO_DE_ATUALIZANDO_A_LISTA,
  TEXTO_DE_CARREGANDO_A_LISTA,
  anuncioDaLista,
  categoriasDoFiltro,
  estaRelendo,
  falaDaLista,
  falhaDeExcecao,
  haMaisParaCarregar,
  nomeDaCategoria,
  nomeDoAutor,
  rotuloDoCartao,
  situacaoDaLista,
  textoDaData,
  textoDoTempoDeLeitura,
} from "./blogPublico";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584996950105&text=Gostaria+de+receber+conte%C3%BAdos+exclusivos+da+ChatClean";

/* ─── AS CATEGORIAS VÊM DO BANCO (Story 2.14) ──────────────────────────────
 *
 * A constante que vivia aqui — `["Todos", "Tecnologia", "Estratégia",
 * "Analytics", "Automação", "Tendências"]` — SAIU. Ela era a terceira cópia da
 * lista de Categorias, e as três já divergiam entre si: esta tinha CINCO, e
 * "Novidades" não estava nela. Um post publicado em "Novidades" não era
 * alcançável por filtro nenhum no site, e ninguém percebeu, porque não havia um
 * lugar só que dissesse quais Categorias existem. Agora há: a tabela.
 *
 * "Todos" continua fora do banco porque ele não é uma Categoria — é a ausência
 * de filtro, e cadastrá-lo criaria uma Categoria que ninguém pode usar num
 * post. Ele mora em `blogPublico.js`, escrito UMA vez, e o filtro por Categoria
 * viaja por IDENTIFICADOR: casar por nome era o que o armazenamento no
 * navegador fazia, e renomear uma Categoria deixava os posts dela inalcançáveis.
 */

/** O pedido inicial: sem termo, sem Categoria, primeira página. */
const PEDIDO_INICIAL = Object.freeze({
  termo: "",
  categoriaId: null,
  deslocamento: 0,
  tentativa: 0,
});

export default function Blog() {
  /* O que está DIGITADO. O que já foi PERGUNTADO ao banco vive em `pedido`, e
     anda atrás deste por `ESPERA_DA_BUSCA_MS`. */
  const [termoBusca, setTermoBusca] = useState("");
  const [pedido, setPedido] = useState(PEDIDO_INICIAL);

  const [categorias, setCategorias] = useState([]);
  /* A FALHA É DITA. Ela era silenciosa: o filtro colapsava para só "Todos" e o
     visitante concluía que o blog tem uma categoria só. */
  const [falhouAoCarregarCategorias, setFalhouAoCarregarCategorias] =
    useState(false);

  const [posts, setPosts] = useState(null);
  const [haMais, setHaMais] = useState(false);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let resultado;
      try {
        resultado = await listarCategorias();
      } catch {
        resultado = { ok: false };
      }
      if (!vivo) return;
      if (!resultado?.ok) {
        setFalhouAoCarregarCategorias(true);
        return;
      }
      setFalhouAoCarregarCategorias(false);
      setCategorias(categoriasDoFiltro(resultado.dados));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  /* A espera da digitação. O primeiro quadro não espera: o pedido já nasce com
     o termo vazio, e o temporizador só muda algo quando alguém digita. */
  const primeiraEspera = useRef(true);
  useEffect(() => {
    if (primeiraEspera.current) {
      primeiraEspera.current = false;
      return undefined;
    }
    const relogio = setTimeout(() => {
      setPedido((p) =>
        p.termo === termoBusca ? p : { ...p, termo: termoBusca, deslocamento: 0 },
      );
    }, ESPERA_DA_BUSCA_MS);
    return () => clearTimeout(relogio);
  }, [termoBusca]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      /* A CAMADA DEVOLVE ERRO TIPADO E NÃO LANÇA — mas confiar nisso aqui é
         apostar a promessa desta tela numa disciplina de outro módulo. Uma
         rejeição sem tratamento deixaria o esqueleto girando para sempre, que é
         a página em branco com outro nome. E o texto da exceção NÃO vira frase
         de tela: `falhaDeExcecao` guarda o cru em `detalhe`, que ninguém
         renderiza. */
      let resultado;
      try {
        resultado = await buscarPostsPublicos({
          termo: pedido.termo,
          categoriaId: pedido.categoriaId,
          limite: TAMANHO_DA_PAGINA,
          deslocamento: pedido.deslocamento,
        });
      } catch (excecao) {
        resultado = { ok: false, erro: falhaDeExcecao(excecao) };
      }
      if (!vivo) return;
      if (!resultado?.ok) {
        /* A página seguinte que falha NÃO apaga o que já está na tela: quem
           rolou até aqui não perde a leitura por causa de um pedido a mais. */
        if (pedido.deslocamento === 0) setPosts(null);
        setErro(resultado?.erro ?? { tipo: "inesperado", mensagem: "" });
        setCarregando(false);
        return;
      }
      const recebidos = resultado.dados;
      setPosts((anteriores) =>
        pedido.deslocamento === 0
          ? recebidos
          : [...(anteriores ?? []), ...recebidos],
      );
      setHaMais(haMaisParaCarregar(recebidos));
      setErro(null);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [pedido]);

  const tentarDeNovo = useCallback(
    () =>
      setPedido((p) => ({ ...p, deslocamento: 0, tentativa: p.tentativa + 1 })),
    [],
  );
  const carregarMais = useCallback(
    () =>
      setPedido((p) => ({ ...p, deslocamento: p.deslocamento + TAMANHO_DA_PAGINA })),
    [],
  );
  const escolherCategoria = useCallback((id) => {
    setPedido((p) => ({
      ...p,
      categoriaId: id === CATEGORIA_TODOS ? null : id,
      deslocamento: 0,
    }));
  }, []);
  const limparFiltros = useCallback(() => {
    setTermoBusca("");
    setPedido((p) => ({ ...PEDIDO_INICIAL, tentativa: p.tentativa }));
  }, []);

  const categoriaAtiva = pedido.categoriaId ?? CATEGORIA_TODOS;

  /* A situação é DERIVADA, e a derivação inteira mora no módulo puro —
     inclusive a ORDEM dos ramos, que é regra: erro conferido depois de lista
     vazia faria uma queda de conexão aparecer como "ainda não há artigos". */
  const situacao = situacaoDaLista({
    carregando,
    erro,
    posts,
    termo: pedido.termo,
    categoria: categoriaAtiva,
  });
  const relendo = estaRelendo({ carregando, posts });

  /* A ORDEM VEM DA CAMADA — `COALESCE(publicado_em, atualizado_em)`
     decrescente, com desempate determinístico. Nada é reordenado aqui: uma
     segunda ordenação na tela divergiria da primeira no primeiro empate. */
  const lista = useMemo(() => (Array.isArray(posts) ? posts : []), [posts]);
  /* O Destaque é escolhido sobre TUDO o que já foi carregado, e não sobre a
     primeira página: um Post destacado que só aparece na segunda página assume
     o papel quando ela chega, em vez de nunca assumi-lo. */
  const destaque = lista.find((p) => p.destaque === true) ?? null;
  const demais = destaque === null ? lista : lista.filter((p) => p !== destaque);

  return (
    <div
      className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white"
      data-tela="blog-publico"
      data-situacao={situacao}
      data-relendo={relendo ? "1" : "0"}
    >
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
              data-campo="busca"
              aria-label="Buscar artigos"
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
            {falhouAoCarregarCategorias ? (
              <p
                role="status"
                data-papel="falha-das-categorias"
                className="w-full text-center text-sm text-zinc-500"
              >
                {FALHA_DAS_CATEGORIAS}
              </p>
            ) : null}
            {[{ id: CATEGORIA_TODOS, nome: CATEGORIA_TODOS }, ...categorias].map(
              (cat) => (
                <button
                  key={cat.id}
                  type="button"
                  data-categoria={cat.id}
                  aria-pressed={cat.id === categoriaAtiva}
                  onClick={() => escolherCategoria(cat.id)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                    cat.id === categoriaAtiva
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                      : "bg-zinc-100 text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  {cat.nome}
                </button>
              ),
            )}
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 py-16">

        {/* A REGIÃO VIVA. Sem ela, quem usa leitor de tela digita na busca e a
            grade muda em silêncio: não há foco a mover nem texto novo a
            anunciar, e a única pista da mudança é visual. */}
        <p role="status" aria-live="polite" data-papel="anuncio" className="sr-only">
          {carregando
            ? relendo
              ? TEXTO_DE_ATUALIZANDO_A_LISTA
              : TEXTO_DE_CARREGANDO_A_LISTA
            : situacao === LISTA_PRONTA
              ? anuncioDaLista(lista.length)
              : ""}
        </p>

        {/* Carregando pela PRIMEIRA vez: esqueleto, nunca página em branco.
            Releitura não pisca — os cartões antigos ficam. */}
        {situacao === LISTA_CARREGANDO && (
          <div data-papel="esqueleto" className="py-4">
            <div
              aria-hidden="true"
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-64 rounded-3xl border border-zinc-100 bg-zinc-50 animate-pulse"
                />
              ))}
            </div>
          </div>
        )}

        {/* Vazio, vazio de busca e as duas falhas — cada um dizendo o que houve */}
        {situacao !== LISTA_CARREGANDO && situacao !== LISTA_PRONTA && (
          <SemCartoes
            situacao={situacao}
            aoRepetir={tentarDeNovo}
            aoLimpar={limparFiltros}
          />
        )}

        {/* Post em destaque */}
        {situacao === LISTA_PRONTA && destaque && (
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mb-16"
            data-papel="destaque"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-4">
              Post em destaque
            </p>
            <Link
              to={`/blog/${destaque.slug}`}
              aria-label={rotuloDoCartao(destaque)}
              className="group block"
            >
              <div className="rounded-3xl border border-zinc-100 hover:border-emerald-200 bg-white overflow-hidden grid md:grid-cols-5 green-glow card-3d transition-all duration-500">
                <div className="md:col-span-2 aurora-bg flex items-center justify-center p-12 min-h-48">
                  <div className="text-center">
                    {nomeDaCategoria(destaque) !== "" && (
                      <span className="inline-block px-3 py-1 rounded-full bg-white/20 border border-white/40 text-white text-xs font-bold uppercase tracking-widest mb-4">
                        {nomeDaCategoria(destaque)}
                      </span>
                    )}
                    {textoDoTempoDeLeitura(destaque) !== "" && (
                      <p className="text-white/70 text-sm">
                        {textoDoTempoDeLeitura(destaque)}
                      </p>
                    )}
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
                      {nomeDoAutor(destaque) !== "" && (
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {nomeDoAutor(destaque)}
                        </span>
                      )}
                      {textoDaData(destaque) !== "" && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {textoDaData(destaque)}
                        </span>
                      )}
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
        {situacao === LISTA_PRONTA && demais.length > 0 && (
          <div
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
            data-papel="cartoes"
          >
            {demais.map((post, i) => (
              <motion.div
                key={post.id}
                data-post={post.id}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  to={`/blog/${post.slug}`}
                  aria-label={rotuloDoCartao(post)}
                  className="group block h-full"
                >
                  <div className="h-full rounded-3xl border border-zinc-100 hover:border-emerald-200 bg-white p-8 flex flex-col green-glow card-3d transition-all duration-500">
                    <div className="flex items-center justify-between mb-6">
                      {/* Categoria é NULÁVEL: sem ela o cartão aparece do mesmo
                          jeito, sem pastilha — e não com uma pastilha vazia. */}
                      {nomeDaCategoria(post) !== "" ? (
                        <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                          {nomeDaCategoria(post)}
                        </span>
                      ) : (
                        <span />
                      )}
                      {textoDoTempoDeLeitura(post) !== "" && (
                        <span className="flex items-center gap-1 text-xs text-zinc-400">
                          <Clock className="h-3.5 w-3.5" />
                          {textoDoTempoDeLeitura(post)}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-black text-zinc-900 tracking-tight mb-3 group-hover:text-emerald-700 transition-colors flex-1">
                      {post.titulo}
                    </h3>
                    <p className="text-zinc-500 text-sm leading-relaxed mb-6 line-clamp-3">
                      {post.resumo}
                    </p>

                    <div className="flex items-center justify-between text-xs text-zinc-400 mt-auto pt-4 border-t border-zinc-100">
                      {/* O Autor é NULÁVEL como a Categoria, e é condicionado do
                          mesmo jeito: o `<span>` inteiro sai, e não só o texto
                          dentro dele — senão sobra uma caixa vazia ocupando
                          espaço no rodapé do cartão. */}
                      {nomeDoAutor(post) !== "" ? (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {nomeDoAutor(post)}
                        </span>
                      ) : (
                        <span />
                      )}
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

        {/* A PAGINAÇÃO. Sem ela o blog parava no teto da camada sem dizer nada,
            e o artigo seguinte ficava inalcançável por caminho nenhum. */}
        {situacao === LISTA_PRONTA && haMais && (
          <div className="mb-16 flex justify-center">
            <Button
              type="button"
              variant="outline"
              data-acao="carregar-mais"
              disabled={carregando}
              onClick={carregarMais}
              className="rounded-full"
            >
              {ROTULO_DE_CARREGAR_MAIS}
            </Button>
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

/**
 * O vazio inicial, o vazio de busca e as duas falhas — cada um dizendo o que
 * houve e o que fazer, e nenhum deles em branco.
 *
 * "Ainda não há artigos" convida a voltar depois; "não consegui carregar" pede
 * outra ação e não pode sugerir que o blog está vazio; "nada corresponde" pede
 * para trocar o termo; e a falha permanente não oferece um botão que nunca vai
 * funcionar.
 *
 * **Nenhum detalhe técnico é mostrado.** O que sai é a fala da situação, escrita
 * para quem visita o site — nunca a mensagem de uma exceção.
 */
function SemCartoes({ situacao, aoRepetir, aoLimpar }) {
  const fala = falaDaLista(situacao);
  /* As duas falhas são alerta; os dois vazios não são. Vazio não é erro — e
     anunciá-lo como erro faria o leitor de tela interromper a leitura por uma
     notícia que não é urgente. */
  const alerta = situacao === LISTA_FALHA || situacao === LISTA_FALHA_PERMANENTE;
  const Icone = alerta ? AlertCircle : FileText;
  return (
    <div
      role={alerta ? "alert" : "status"}
      data-papel="situacao"
      className={`mx-auto max-w-xl rounded-3xl border p-10 text-center ${
        alerta ? "border-red-200 bg-red-50" : "border-zinc-100 bg-white"
      }`}
    >
      <Icone
        aria-hidden="true"
        className={`mx-auto h-8 w-8 ${alerta ? "text-red-600" : "text-zinc-400"}`}
      />
      <h2
        data-papel="o-que-houve"
        className="mt-4 text-xl font-black tracking-tight text-zinc-900"
      >
        {fala.oQueHouve}
      </h2>
      <p data-papel="o-que-fazer" className="mt-2 text-zinc-500">
        {fala.oQueFazer}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {fala.repetir && (
          <Button
            type="button"
            data-acao="repetir"
            onClick={() => aoRepetir?.()}
            className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {ROTULO_DE_RECARREGAR_A_LISTA}
          </Button>
        )}
        {fala.limpar && (
          <Button
            type="button"
            variant="outline"
            data-acao="limpar"
            onClick={() => aoLimpar?.()}
            className="rounded-full"
          >
            {ROTULO_DE_LIMPAR_FILTROS}
          </Button>
        )}
      </div>
    </div>
  );
}
