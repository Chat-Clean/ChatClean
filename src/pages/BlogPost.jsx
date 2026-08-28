/**
 * O artigo do Blog Público — agora lendo do Supabase (Story 2.15).
 *
 * ─── O ARTIGO É O `conteudo_html` GRAVADO ───────────────────────────────────
 *
 * O interpretador artesanal de Markdown que vivia dentro do `<article>` foi
 * REMOVIDO, não adaptado. Ele emitia `h1` e `h4`, que o Estilo do Artigo não
 * estiliza, e nunca soube renderizar link, citação, bloco de código nem linha
 * divisória — que o vocabulário do Editor entende desde a Story 2.4. Adaptá-lo
 * seria manter um segundo renderizador, sempre atrás do primeiro.
 *
 * O que a página mostra é o HTML **gravado**, injetado dentro de `.artigo` — a
 * mesma classe global e o mesmo caminho da pré-visualização. É o que faz
 * Editor, prévia e site mostrarem a mesma coisa: os três leem a mesma coisa.
 * **Nada aqui deriva HTML em tempo de leitura.**
 *
 * ─── A VISIBILIDADE É DA POLÍTICA ───────────────────────────────────────────
 *
 * `lerPostPublicoPorSlug` usa o cliente anônimo incondicionalmente. Um Post não
 * publicado responde AUSÊNCIA, com a mesma frase de um endereço que nunca
 * existiu — para quem tem sessão e para quem não tem. Distinguir os dois
 * entregaria a existência do rascunho a quem não pode vê-lo.
 *
 * ─── CINCO SITUAÇÕES, E NENHUMA DELAS É PÁGINA EM BRANCO ────────────────────
 *
 * Carregando, pronto, ausente e as duas falhas. As regras e as frases moram em
 * `blogPublico.js`, puras, para a verificação executá-las em vez de ler JSX.
 *
 * ─── A CAPA QUE NÃO CARREGA É CAPA AUSENTE (Story 3.2) ──────────────────────
 *
 * Desde que a capa pode apontar para outro domínio, ela apodrece: o host sai do
 * ar, o arquivo é removido lá, o endereço muda. "Não carregou" é tratado como
 * "não tem" — o ramo que esta página já sabia desenhar —, no artigo e em cada
 * cartão de relacionado, porque um ícone de imagem quebrada emoldurado com
 * sombra é o defeito entregue junto com a funcionalidade.
 *
 * ─── TAG E RELACIONADO SÃO ACESSÓRIOS ───────────────────────────────────────
 *
 * As duas leituras são separadas da do Post, e a falha de qualquer uma delas
 * NÃO derruba o artigo: quem abriu veio ler o texto. Um bloco lateral que some
 * é uma perda pequena; um artigo que não abre por causa dele é a página em
 * branco entrando pela porta dos fundos.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  FileQuestion,
  Share2,
  User,
} from "lucide-react";
import { Button } from "../components/ui/button";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { ehSlug } from "@/data/blog/comum";
import { lerPostPublicoPorSlug, listarRelacionadosPublicos } from "@/data/blog/posts";
import { listarTagsDoPostPublico } from "@/data/blog/taxonomia";
import {
  ARTIGO_CARREGANDO,
  ARTIGO_FALHA,
  ARTIGO_PRONTO,
  ARTIGO_SEM_CONTEUDO,
  ROTULO_DE_RECARREGAR_O_ARTIGO,
  ROTULO_DE_VOLTAR_AO_BLOG,
  TEXTO_DE_CARREGANDO_O_ARTIGO,
  falaDoArtigo,
  falhaDeExcecao,
  htmlGravado,
  idDaCategoria,
  nasceCarregandoOArtigo,
  nomeDaCategoria,
  nomeDoAutor,
  rotuloDoCartao,
  situacaoDoArtigo,
  textoDaData,
  textoDoTempoDeLeitura,
} from "./blogPublico";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584998900718&text=Gostaria+de+saber+mais+sobre+a+ChatClean";

export default function BlogPost() {
  const { slug } = useParams();
  const alvo = typeof slug === "string" ? slug.trim() : "";
  /* A MESMA regra da camada de dados, importada — não uma cópia. Slug fora do
     formato não vira pedido à rede: ele não poderia existir, e mandá-lo ao
     servidor só trocaria uma ausência imediata por uma ausência mais lenta. */
  const valido = ehSlug(alvo);

  const [post, setPost] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(() => nasceCarregandoOArtigo(valido));
  const [tentativa, setTentativa] = useState(0);
  const [tags, setTags] = useState([]);
  const [relacionados, setRelacionados] = useState([]);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!valido) {
      setPost(null);
      setErro(null);
      setCarregando(false);
      setTags([]);
      setRelacionados([]);
      return undefined;
    }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      /* A camada devolve erro tipado e não lança — mas confiar nisso aqui é
         apostar a única promessa desta tela numa disciplina de outro módulo.
         E o texto da exceção NÃO vira frase de tela: `falhaDeExcecao` guarda o
         cru em `detalhe`, que esta página não renderiza. */
      let resultado;
      try {
        resultado = await lerPostPublicoPorSlug(alvo);
      } catch (excecao) {
        resultado = { ok: false, erro: falhaDeExcecao(excecao) };
      }
      if (!vivo) return;
      if (!resultado?.ok) {
        setPost(null);
        setTags([]);
        setRelacionados([]);
        setErro(resultado?.erro ?? falhaDeExcecao(null));
        setCarregando(false);
        return;
      }
      setPost(resultado.dados);
      setErro(null);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [alvo, valido, tentativa]);

  /* AS TAGS. Leitura separada, e falha silenciosa DE PROPÓSITO: as pastilhas
     somem, o artigo fica. */
  useEffect(() => {
    const id = post?.id;
    if (typeof id !== "string" || id === "") {
      setTags([]);
      return undefined;
    }
    let vivo = true;
    (async () => {
      let resultado;
      try {
        resultado = await listarTagsDoPostPublico(id);
      } catch {
        resultado = { ok: false };
      }
      if (!vivo) return;
      setTags(resultado?.ok === true ? resultado.dados : []);
    })();
    return () => {
      vivo = false;
    };
  }, [post]);

  /* OS RELACIONADOS, pela CATEGORIA e sem o próprio Post. Casar por NOME era o
     que o armazenamento no navegador fazia — e renomear a Categoria quebrava a
     relação sem nada acusar. Agora há identificador. Post sem Categoria não tem
     relacionados, e isso é resposta, não erro. */
  useEffect(() => {
    const id = post?.id;
    const categoria = idDaCategoria(post);
    if (typeof id !== "string" || id === "" || categoria === null) {
      setRelacionados([]);
      return undefined;
    }
    let vivo = true;
    (async () => {
      let resultado;
      try {
        resultado = await listarRelacionadosPublicos({
          categoriaId: categoria,
          exceto: id,
        });
      } catch {
        resultado = { ok: false };
      }
      if (!vivo) return;
      setRelacionados(resultado?.ok === true ? resultado.dados : []);
    })();
    return () => {
      vivo = false;
    };
  }, [post]);

  const tentarDeNovo = useCallback(() => setTentativa((n) => n + 1), []);

  /* ── A CAPA QUE NÃO CARREGA É CAPA AUSENTE (Story 3.2) ──────────────────
     Antes da 3.2 toda capa vinha do nosso bucket, e um endereço gravado
     resolvia. Agora ela pode apontar para outro domínio — e endereço de fora
     APODRECE: o host sai do ar, o arquivo é removido lá, o endereço muda. Um
     `<img>` com endereço morto desenha o ícone de imagem quebrada do
     navegador, dentro de uma moldura com sombra, e o leitor vê o defeito.

     "Não carregou" é tratado como "não tem", que é o ramo que a página já sabe
     desenhar: o artigo simplesmente não mostra capa. `onError` é o único sinal
     que o navegador dá, e ele é por ENDEREÇO — o benefício da dúvida volta a
     cada Post, senão uma falha condenaria o artigo seguinte.

     Os RELACIONADOS têm o mesmo problema e uma resposta por cartão, e não uma
     só: um relacionado com a imagem podre não pode esconder a dos outros. */
  const [capaQuebrada, setCapaQuebrada] = useState(false);
  const enderecoDaCapa =
    typeof post?.imagem_url === "string" ? post.imagem_url.trim() : "";
  useEffect(() => {
    setCapaQuebrada(false);
  }, [enderecoDaCapa]);
  const mostrarCapa = enderecoDaCapa !== "" && !capaQuebrada;

  const [capasPodres, setCapasPodres] = useState(() => new Set());
  useEffect(() => {
    /* A MESMA GUARDA DA IRMÃ ABAIXO: um conjunto novo a cada mudança de
       relacionados forçaria renderização quando não havia nada a limpar, e a
       lista de relacionados é relida sempre que o Post muda. */
    setCapasPodres((atuais) => (atuais.size === 0 ? atuais : new Set()));
  }, [relacionados]);
  const marcarRelacionadoPodre = useCallback((id) => {
    setCapasPodres((atuais) => {
      if (atuais.has(id)) return atuais;
      const proximo = new Set(atuais);
      proximo.add(id);
      return proximo;
    });
  }, []);

  const situacao = situacaoDoArtigo({ slugValido: valido, carregando, erro, post });
  const html = htmlGravado(post);

  /**
   * Compartilhar — e NENHUM caminho daqui pode rejeitar sem tratamento.
   *
   * Três modos de falha, todos normais: cancelar a folha de compartilhamento
   * rejeita a promessa de `share`; `clipboard` não existe fora de origem segura
   * e a leitura da propriedade vira `TypeError` dentro do manipulador do
   * clique; e a escrita pode ser negada por permissão. Nenhum deles é defeito
   * do site, e nenhum deles pode virar rejeição não tratada numa página
   * pública.
   */
  const compartilhar = () => {
    if (post === null) return;
    const endereco = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        // Cancelar a folha é uma escolha da pessoa, não um erro a reportar.
        navigator.share({ title: post.titulo, text: post.resumo ?? "", url: endereco })
          .catch(() => {});
        return;
      }
      const areaDeTransferencia = navigator.clipboard;
      if (!areaDeTransferencia || typeof areaDeTransferencia.writeText !== "function") {
        return;
      }
      areaDeTransferencia
        .writeText(endereco)
        .then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        })
        .catch(() => {});
    } catch {
      /* origem sem `clipboard`, permissão negada de forma síncrona: a página
         continua de pé, que é a única coisa que importa aqui. */
    }
  };

  if (situacao !== ARTIGO_PRONTO) {
    return (
      <div
        className="min-h-screen bg-white selection:bg-emerald-500 selection:text-white"
        data-tela="artigo-publico"
        data-situacao={situacao}
      >
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          {situacao === ARTIGO_CARREGANDO ? (
            <div data-papel="esqueleto" className="w-full max-w-3xl px-4">
              <p role="status" className="sr-only">
                {TEXTO_DE_CARREGANDO_O_ARTIGO}
              </p>
              <div aria-hidden="true" className="space-y-4">
                <div className="h-10 w-3/5 rounded-lg bg-zinc-100 animate-pulse" />
                <div className="h-4 w-2/5 rounded bg-zinc-100 animate-pulse" />
                <div className="h-4 w-full rounded bg-zinc-100 animate-pulse" />
                <div className="h-4 w-full rounded bg-zinc-100 animate-pulse" />
                <div className="h-4 w-4/5 rounded bg-zinc-100 animate-pulse" />
              </div>
            </div>
          ) : (
            <SituacaoRuim
              situacao={situacao}
              aoRepetir={tentarDeNovo}
            />
          )}
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white"
      data-tela="artigo-publico"
      data-situacao={situacao}
    >
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
            {/* Categoria é NULÁVEL: sem ela a pastilha não existe, e nada quebra. */}
            {nomeDaCategoria(post) !== "" && (
              <span
                data-papel="categoria"
                className="inline-block px-3 py-1 rounded-full bg-white/20 border border-white/40 text-white text-xs font-bold uppercase tracking-widest"
              >
                {nomeDaCategoria(post)}
              </span>
            )}
            {textoDoTempoDeLeitura(post) !== "" && (
              <span
                data-papel="tempo-de-leitura"
                className="flex items-center gap-1 text-white/70 text-xs"
              >
                <Clock className="h-3.5 w-3.5" />
                {textoDoTempoDeLeitura(post)}
              </span>
            )}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            data-papel="titulo"
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
            {nomeDoAutor(post) !== "" && (
              <span data-papel="autor" className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {nomeDoAutor(post)}
              </span>
            )}
            {textoDaData(post) !== "" && (
              <span data-papel="data" className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {textoDaData(post)}
              </span>
            )}
            <button
              type="button"
              onClick={compartilhar}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
            >
              <Share2 className="h-4 w-4" />
              {copiado ? "Link copiado! ✓" : "Compartilhar"}
            </button>
          </motion.div>
        </div>
      </section>

      {/* Imagem de capa — e a que NÃO CARREGA é tratada como capa ausente.
          Ver o comentário de `capaQuebrada`: endereço de fora apodrece, e a
          moldura com sombra em volta do ícone de imagem quebrada seria o
          defeito emoldurado. */}
      {mostrarCapa && (
        <div className="max-w-3xl mx-auto px-4 -mt-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="rounded-2xl overflow-hidden shadow-2xl border border-zinc-100"
          >
            <img
              src={enderecoDaCapa}
              alt={post.imagem_alt ?? post.titulo}
              data-papel="capa-do-artigo"
              /* ─── O HOST DE FORA NÃO RECEBE O LEITOR (Story 3.2) ──────
                 Desde que a capa pode apontar para outro domínio, cada
                 visitante faz um pedido a um servidor que não é nosso. Sem
                 `referrerPolicy`, esse pedido leva junto o endereço do artigo
                 que a pessoa está lendo — o host de fora passa a saber IP e o
                 que se lê aqui, e a Política de Privacidade do site não fala
                 disso. `no-referrer` entrega só o que é inevitável.

                 E as dimensões são DECLARADAS: a proporção reserva o espaço
                 antes de a imagem chegar, e a caixa não pula quando ela chega —
                 nem fica alta e vazia quando ela nunca chega. */
              referrerPolicy="no-referrer"
              width={1200}
              height={630}
              onError={() => setCapaQuebrada(true)}
              className="w-full h-72 md:h-96 object-cover"
            />
          </motion.div>
        </div>
      )}

      {/* Conteúdo */}
      <main className="max-w-3xl mx-auto px-4 py-16">

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-10" data-papel="tags">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium"
              >
                #{tag.nome}
              </span>
            ))}
          </div>
        )}

        {/* O ARTIGO: o `conteudo_html` GRAVADO, dentro de `.artigo`.
            Nenhuma classe utilitária vive no conteúdo — quem envolve é quem
            estiliza (Story 2.3). E nada aqui deriva HTML em tempo de leitura. */}
        <article className="mb-16">
          {html.trim() === "" ? (
            <p data-papel="artigo-vazio" className="text-zinc-500">
              {ARTIGO_SEM_CONTEUDO}
            </p>
          ) : (
            <div
              className="artigo"
              data-papel="artigo"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
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
        {relacionados.length > 0 && (
          <div className="mb-10" data-papel="relacionados">
            <h3 className="text-2xl font-black text-zinc-900 tracking-tighter mb-6">
              Artigos relacionados
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              {relacionados.map((rel, i) => (
                <motion.div
                  key={rel.id}
                  data-post={rel.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.5 }}
                >
                  <Link
                    to={`/blog/${rel.slug}`}
                    aria-label={rotuloDoCartao(rel)}
                    className="group block h-full"
                  >
                    <div className="h-full rounded-2xl border border-zinc-100 hover:border-emerald-200 bg-white overflow-hidden green-glow card-3d transition-all duration-400">
                      {/* A capa do relacionado, com a mesma regra do artigo e
                          uma resposta POR CARTÃO: um relacionado com a imagem
                          podre não pode esconder a dos outros. */}
                      {typeof rel.imagem_url === "string" &&
                        rel.imagem_url.trim() !== "" &&
                        !capasPodres.has(rel.id) && (
                          <img
                            src={rel.imagem_url.trim()}
                            alt={rel.imagem_alt ?? rel.titulo}
                            data-papel="capa-relacionada"
                            /* O mesmo cuidado da capa do artigo, e um a mais:
                               o cartão de relacionado está abaixo da dobra, e
                               carregar três imagens de hosts de terceiro antes
                               de alguém rolar até elas é gastar a rede da
                               pessoa — e entregá-la a três servidores — por uma
                               imagem que talvez ninguém veja. */
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            width={1200}
                            height={630}
                            onError={() => marcarRelacionadoPodre(rel.id)}
                            className="w-full h-32 object-cover"
                          />
                        )}
                      <div className="p-5">
                        {nomeDaCategoria(rel) !== "" && (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-3">
                            {nomeDaCategoria(rel)}
                          </span>
                        )}
                        <h4 className="font-black text-zinc-900 tracking-tight mb-2 text-sm group-hover:text-emerald-700 transition-colors">
                          {rel.titulo}
                        </h4>
                        {textoDoTempoDeLeitura(rel) !== "" && (
                          <span className="flex items-center gap-1 text-xs text-zinc-400">
                            <Clock className="h-3 w-3" />
                            {textoDoTempoDeLeitura(rel)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Volta */}
        <div className="flex justify-start">
          <Link to="/blog">
            <Button
              variant="outline"
              className="rounded-full border-zinc-200 text-zinc-700 hover:border-emerald-300 hover:text-emerald-700"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {ROTULO_DE_VOLTAR_AO_BLOG}
            </Button>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}

/**
 * Ausência e as duas falhas — cada uma dizendo o que houve e o que fazer, e
 * nenhuma delas em branco.
 *
 * A ausência é a mesma para um endereço que nunca existiu e para um Post que
 * ainda não está no ar: a indistinguibilidade é a garantia.
 */
function SituacaoRuim({ situacao, aoRepetir }) {
  const fala = falaDoArtigo(situacao);
  const grave = situacao === ARTIGO_FALHA;
  const Icone = grave ? AlertCircle : FileQuestion;
  return (
    <div role="alert" data-papel="situacao" className="text-center px-4 max-w-xl">
      <Icone
        aria-hidden="true"
        className={`mx-auto h-10 w-10 ${grave ? "text-red-500" : "text-zinc-300"}`}
      />
      <h1
        data-papel="o-que-houve"
        className="mt-4 text-3xl font-black text-zinc-900 tracking-tighter mb-4"
      >
        {fala.oQueHouve}
      </h1>
      <p data-papel="o-que-fazer" className="text-zinc-500 mb-8">
        {fala.oQueFazer}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {fala.repetir && (
          <Button
            type="button"
            data-acao="repetir"
            onClick={() => aoRepetir?.()}
            className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            {ROTULO_DE_RECARREGAR_O_ARTIGO}
          </Button>
        )}
        <Link to="/blog">
          <Button
            variant="outline"
            data-acao="voltar"
            className="rounded-full border-zinc-200 text-zinc-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {ROTULO_DE_VOLTAR_AO_BLOG}
          </Button>
        </Link>
      </div>
    </div>
  );
}
