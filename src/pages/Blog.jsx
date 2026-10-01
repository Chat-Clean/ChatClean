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
  ChevronLeft,
  ChevronRight,
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
import { LINK_DO_WHATSAPP } from "@/domain/whatsapp";


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

/* A luz de latão no canto do cartão de Destaque, a mesma do cabeçalho da
   conversa com a Jéssica. */
/* Em pixels. Abaixo do primeiro, o gesto ainda é um clique; acima do segundo,
   o arrasto troca de cartão ao soltar. */
const LIMIAR_DO_ARRASTO = 6;
const LIMIAR_DE_TROCA = 40;

const BOTAO_DO_CARROSSEL =
  "grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-emerald-950/15 bg-white text-emerald-950 transition-colors hover:bg-emerald-950 hover:text-creme disabled:pointer-events-none disabled:opacity-35";

const LUZ_DO_DESTAQUE =
  "radial-gradient(circle at 100% 0%, rgba(183,146,62,0.28), transparent 55%), radial-gradient(circle at 0% 100%, rgba(81,188,105,0.14), transparent 50%)";

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
  /* MAIS DE UM POST PODE ESTAR DESTACADO — a coluna não é única. Todos sobem
     para a seção de destaques, na ordem da camada, e nenhum se repete na grade. */
  const destaques = lista.filter((p) => p.destaque === true);
  const demais = lista.filter((p) => p.destaque !== true);

  /* ── A CAPA QUE NÃO CARREGA É CAPA AUSENTE (mesmo padrão de BlogPost.jsx,
     Story 3.2) ── Post sem `imagem_url`, ou cuja imagem falha ao carregar,
     cai no MESMO fallback: o cartão de Destaque mostra o `aurora-bg` da
     moldura, e o cartão da grade fica sem faixa de imagem — nunca um `<img>`
     quebrado. `onError` é o único sinal que o navegador dá. */

  /* A grade tem VÁRIOS cartões, e a resposta é POR CARTÃO — a mesma regra dos
     relacionados em `BlogPost.jsx`: um cartão com a imagem podre não pode
     esconder a dos outros.
     Sem efeito de reinício: o registro é chaveado por `post.id`, um
     identificador estável, e nunca é limpo. Uma versão anterior o zerava a
     cada mudança de `lista` — mas `lista` troca de referência a cada "carregar
     mais" (Blog.jsx:190, `setPosts` concatenando), e zerar apagava o registro
     dos cartões JÁ na tela, fazendo imagens já conhecidas como quebradas
     tentarem carregar de novo. Um `id` que já falhou continua no Set para
     sempre — inofensivo: o mesmo Post não muda de imagem sem a página
     recarregar, e a entrada de um Post que saiu da lista só ocupa memória, não
     desenha nada. */
  const [capasQuebradas, setCapasQuebradas] = useState(() => new Set());
  const marcarCapaQuebrada = useCallback((id) => {
    setCapasQuebradas((atuais) => {
      if (atuais.has(id)) return atuais;
      const proximo = new Set(atuais);
      proximo.add(id);
      return proximo;
    });
  }, []);

  return (
    <div
      className="min-h-screen bg-creme text-zinc-900 selection:bg-emerald-500 selection:text-white"
      data-tela="blog-publico"
      data-situacao={situacao}
      data-relendo={relendo ? "1" : "0"}
    >
      <Navbar />

      {/* Hero aurora */}
      <section className="relative aurora-bg aurora-beams pt-32 pb-16 md:pt-40 md:pb-24 overflow-hidden">
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
            <span className="text-yellow-300">
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
      <section className="bg-creme border-b border-creme-borda sticky top-20 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 md:py-4">
          {falhouAoCarregarCategorias ? (
            <p
              role="status"
              data-papel="falha-das-categorias"
              className="mb-2 text-center text-sm text-zinc-500"
            >
              {FALHA_DAS_CATEGORIAS}
            </p>
          ) : null}
          {/* No celular a faixa é UMA linha que rola de lado: ela fica presa no
              topo, e quebrada em três linhas tomava metade da tela de quem lê. */}
          <div className="sem-barra-de-rolagem -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:justify-center md:overflow-visible md:px-0">
            {[{ id: CATEGORIA_TODOS, nome: CATEGORIA_TODOS }, ...categorias].map(
              (cat) => (
                <button
                  key={cat.id}
                  type="button"
                  data-categoria={cat.id}
                  aria-pressed={cat.id === categoriaAtiva}
                  onClick={() => escolherCategoria(cat.id)}
                  className={`shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
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

      <main className="max-w-7xl mx-auto px-4 py-10 md:py-16">

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
          <div data-papel="esqueleto" className="pt-4 pb-16">
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

        {/* OS DESTAQUES. Um só: o cartão sozinho. Mais de um: o carrossel. */}
        {situacao === LISTA_PRONTA && destaque && (
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mb-12 md:mb-16"
            data-papel="destaque"
          >
            {destaques.length > 1 ? (
              <CarrosselDeDestaques
                posts={destaques}
                capasQuebradas={capasQuebradas}
                aoQuebrar={marcarCapaQuebrada}
              />
            ) : (
              <>
                <p className="mb-4 text-xs font-bold uppercase tracking-widest text-emerald-700">
                  Post em destaque
                </p>
                <CartaoDeDestaque
                  post={destaque}
                  capaQuebrada={capasQuebradas.has(destaque.id)}
                  aoQuebrar={marcarCapaQuebrada}
                />
              </>
            )}
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
                  <div className="h-full rounded-3xl border border-zinc-100 hover:border-emerald-200 bg-white overflow-hidden flex flex-col green-glow transition-all duration-500">
                    {/* A CAPA DO CARTÃO. Post sem `imagem_url`, ou cuja imagem
                        falha ao carregar, fica sem faixa — nunca um `<img>`
                        quebrado. `loading="lazy"`: a grade inteira fica abaixo
                        da dobra, e carregar toda capa de host de terceiro antes
                        de a pessoa rolar até ela é gastar a rede por uma
                        imagem que talvez ninguém veja. */}
                    {typeof post.imagem_url === "string" &&
                      post.imagem_url.trim() !== "" &&
                      !capasQuebradas.has(post.id) && (
                        <img
                          src={post.imagem_url.trim()}
                          alt={post.imagem_alt ?? post.titulo}
                          data-papel="capa-do-cartao"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          width={1200}
                          height={630}
                          onError={() => marcarCapaQuebrada(post.id)}
                          className="w-full h-auto aspect-1200/630 object-cover"
                        />
                      )}
                    <div className="p-6 md:p-8 flex flex-1 flex-col">
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

        {/* Chamada para o time comercial */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl aurora-bg aurora-beams px-6 py-8 md:p-12 text-center"
        >
          <div className="absolute inset-0 bg-grid-white opacity-30 pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-block px-3 py-1.5 rounded-full bg-white/20 border border-white/30 text-white text-xs font-bold uppercase tracking-widest mb-6">
              Fale com um especialista
            </span>
            <h3 className="text-3xl md:text-4xl font-black text-white tracking-tighter mb-4">
              Quantos clientes ficaram sem resposta hoje?
            </h3>
            <p className="text-white/80 mb-8 max-w-xl mx-auto">
              Com a ChatClean, toda a equipe atende no mesmo número de WhatsApp, com CRM e chatbot, pela API Oficial. Conte como você atende hoje e a gente mostra por onde começar.
            </p>
            <a
              href={LINK_DO_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 whitespace-nowrap px-6 md:px-8 py-4 bg-white text-emerald-700 font-bold rounded-full shadow-xl hover:shadow-2xl hover:scale-[1.03] transition-all duration-300"
            >
              Falar com um especialista
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
 * O cartão de um Post em destaque. É ESCURO de propósito: com o mesmo cartão
 * branco da grade, só o rótulo acima dizia que aquele Post era diferente dos
 * outros.
 *
 * A capa vai emoldurada e na proporção dela: nada é cortado e nada é escrito
 * por cima. Quando falta ou falha, o `aurora-bg` da moldura é o fallback.
 * Borda, e não `ring` nem sombra: dentro do carrossel o trilho recorta o que
 * passa da caixa do cartão.
 */
function CartaoDeDestaque({ post, capaQuebrada, aoQuebrar }) {
  const endereco = typeof post.imagem_url === "string" ? post.imagem_url.trim() : "";
  const mostrarCapa = endereco !== "" && !capaQuebrada;
  return (
    <Link to={`/blog/${post.slug}`} aria-label={rotuloDoCartao(post)} className="group block h-full">
      <div className="relative grid h-full overflow-hidden rounded-3xl border border-yellow-400/25 bg-emerald-950 transition-colors duration-500 group-hover:border-yellow-400/60 md:grid-cols-2 md:items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: LUZ_DO_DESTAQUE }}
        />
        <div className="relative p-3 pb-0 md:p-4 md:pr-0">
          <div className="relative flex aspect-1200/630 items-center justify-center overflow-hidden rounded-2xl aurora-bg">
            {mostrarCapa ? (
              <img
                src={endereco}
                alt={post.imagem_alt ?? ""}
                data-papel="capa-do-destaque"
                referrerPolicy="no-referrer"
                onError={() => aoQuebrar(post.id)}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <FileText aria-hidden="true" className="h-10 w-10 text-white/60" />
            )}
          </div>
        </div>
        <div className="relative flex flex-col p-6 md:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {nomeDaCategoria(post) !== "" && (
              <span className="inline-block px-3 py-1 rounded-full bg-yellow-300 text-emerald-950 text-xs font-bold">
                {nomeDaCategoria(post)}
              </span>
            )}
            {textoDoTempoDeLeitura(post) !== "" && (
              <span className="flex items-center gap-1 whitespace-nowrap text-xs text-creme/70">
                <Clock className="h-3.5 w-3.5" />
                {textoDoTempoDeLeitura(post)}
              </span>
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-creme tracking-tight mb-6 md:mb-4 group-hover:text-yellow-300 transition-colors">
            {post.titulo}
          </h2>
          {/* O resumo só a partir do tablet: no celular ele dobrava a altura do
              cartão, e o título já diz do que o Post trata. */}
          <p className="hidden text-creme/75 leading-relaxed mb-6 md:line-clamp-4">{post.resumo}</p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-creme/70">
              {nomeDoAutor(post) !== "" && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <User className="h-4 w-4" />
                  {nomeDoAutor(post)}
                </span>
              )}
              {textoDaData(post) !== "" && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="h-4 w-4" />
                  {textoDaData(post)}
                </span>
              )}
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-yellow-300 px-5 py-2.5 text-sm font-bold text-emerald-950 transition-all group-hover:gap-3">
              Ler artigo
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * Mais de um Post em destaque: um cartão por vez, numa faixa que rola de lado.
 *
 * A rolagem é a do NAVEGADOR (`scroll-snap`), e não uma animação nossa: o dedo
 * arrasta no celular, o trackpad e o teclado funcionam sem código, e as setas e
 * os pontos só pedem ao trilho que role até um cartão. Não há troca automática:
 * um cartão que some sozinho tira o texto de quem estava lendo.
 *
 * O cartão seguinte aparece na beirada, no celular e no computador: é o que diz
 * que há mais. No computador o trilho também se arrasta com o mouse.
 */
function CarrosselDeDestaques({ posts, capasQuebradas, aoQuebrar }) {
  const trilho = useRef(null);
  const [ativo, setAtivo] = useState(0);
  const atual = Math.min(ativo, posts.length - 1);

  /* A distância entre o começo de um cartão e o do seguinte. */
  const passoDoTrilho = () => {
    const itens = trilho.current?.children;
    return itens && itens.length > 1 ? itens[1].offsetLeft - itens[0].offsetLeft : 0;
  };

  const aoRolar = () => {
    const passo = passoDoTrilho();
    if (passo <= 0) return;
    const indice = Math.round(trilho.current.scrollLeft / passo);
    setAtivo(Math.min(posts.length - 1, Math.max(0, indice)));
  };

  const irPara = (indice) => {
    trilho.current?.scrollTo({ left: indice * passoDoTrilho() });
  };

  /* ── ARRASTAR COM O MOUSE ──────────────────────────────────────────────
     O dedo já arrasta sozinho (é rolagem nativa); o mouse não, e por isso só
     ele é tratado aqui. Enquanto arrasta, o trilho segue o cursor sem encaixe
     e sem suavização; ao soltar, vai para o cartão vizinho na direção do
     arrasto — ou volta ao mesmo, se o movimento foi curto.

     O clique que fecha um arrasto é descartado: sem isso, soltar o mouse em
     cima do cartão abriria o Post que a pessoa só queria empurrar de lado. */
  const arrasto = useRef({ ativo: false, moveu: false, x: 0, rolagem: 0, indice: 0 });

  const aoApertar = (evento) => {
    if (evento.pointerType !== "mouse" || evento.button !== 0) return;
    arrasto.current = {
      ativo: true,
      moveu: false,
      x: evento.clientX,
      rolagem: trilho.current.scrollLeft,
      indice: atual,
    };
  };

  const aoMover = (evento) => {
    const a = arrasto.current;
    if (!a.ativo) return;
    const dx = evento.clientX - a.x;
    const el = trilho.current;
    if (!a.moveu) {
      if (Math.abs(dx) < LIMIAR_DO_ARRASTO) return;
      a.moveu = true;
      el.setPointerCapture?.(evento.pointerId);
      el.style.scrollSnapType = "none";
      el.style.scrollBehavior = "auto";
      el.style.userSelect = "none";
      el.style.cursor = "grabbing";
    }
    el.scrollLeft = a.rolagem - dx;
  };

  const aoSoltar = (evento) => {
    const a = arrasto.current;
    if (!a.ativo) return;
    a.ativo = false;
    if (!a.moveu) return;
    const el = trilho.current;
    const dx = evento.clientX - a.x;
    const vizinho = Math.abs(dx) > LIMIAR_DE_TROCA ? a.indice + (dx < 0 ? 1 : -1) : a.indice;
    const destino = Math.min(posts.length - 1, Math.max(0, vizinho));
    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.style.userSelect = "";
    el.style.cursor = "";
    el.scrollTo({ left: destino * passoDoTrilho(), behavior: semMovimento ? "auto" : "smooth" });
    /* O encaixe só volta depois de a rolagem assentar: religado antes, o
       navegador saltaria para o cartão mais próximo no meio do caminho. */
    setTimeout(() => {
      el.style.scrollSnapType = "";
      el.style.scrollBehavior = "";
    }, 500);
  };

  const aoClicarNoTrilho = (evento) => {
    if (!arrasto.current.moveu) return;
    arrasto.current.moveu = false;
    evento.preventDefault();
    evento.stopPropagation();
  };

  return (
    <div role="group" aria-roledescription="carrossel" aria-label="Posts em destaque">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
          Posts em destaque
        </p>
        <div className="hidden items-center gap-2 md:flex">
          <button
            type="button"
            data-acao="destaque-anterior"
            aria-label="Destaque anterior"
            disabled={atual === 0}
            onClick={() => irPara(atual - 1)}
            className={BOTAO_DO_CARROSSEL}
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            data-acao="proximo-destaque"
            aria-label="Próximo destaque"
            disabled={atual === posts.length - 1}
            onClick={() => irPara(atual + 1)}
            className={BOTAO_DO_CARROSSEL}
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        ref={trilho}
        onScroll={aoRolar}
        onPointerDown={aoApertar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onClickCapture={aoClicarNoTrilho}
        onDragStart={(evento) => evento.preventDefault()}
        data-papel="trilho-dos-destaques"
        className="sem-barra-de-rolagem -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 motion-reduce:scroll-auto md:mx-0 md:cursor-grab md:scroll-px-0 md:gap-6 md:px-0"
      >
        {posts.map((post, i) => (
          <div
            key={post.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${posts.length}`}
            className="w-[88%] shrink-0 snap-start md:w-[92%]"
          >
            <CartaoDeDestaque
              post={post}
              capaQuebrada={capasQuebradas.has(post.id)}
              aoQuebrar={aoQuebrar}
            />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        {posts.map((post, i) => (
          <button
            key={post.id}
            type="button"
            aria-label={`Ir para o destaque ${i + 1} de ${posts.length}`}
            aria-current={i === atual ? "true" : undefined}
            onClick={() => irPara(i)}
            className="grid h-6 place-items-center cursor-pointer"
          >
            <span
              className={`block h-2 rounded-full transition-all duration-300 ${
                i === atual ? "w-6 bg-emerald-950" : "w-2 bg-emerald-950/25"
              }`}
            />
          </button>
        ))}
      </div>
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
      className={`mx-auto mb-16 max-w-xl rounded-3xl border p-10 text-center ${
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
