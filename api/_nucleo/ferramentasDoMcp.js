/**
 * As ferramentas que o MCP oferece ao Claude.
 *
 * Cada ferramenta é uma AÇÃO DO PAINEL, não uma tabela. Toda escrita passa pelo
 * MESMO executor que o Painel usa (`salvarPost`, `salvarVaga`...), com as
 * mesmas regras: máquina de Estados, aposentadoria de endereço, saneamento do
 * conteúdo, lista fechada de campos. O MCP não tem caminho próprio até o banco
 * para escrever.
 *
 * Três cuidados que são do MCP:
 *   * post novo nasce RASCUNHO. Publicar, agendar, arquivar e excluir são
 *     ferramentas separadas, marcadas como destrutivas, para o cliente pedir
 *     confirmação antes;
 *   * o conteúdo chega em Markdown e é convertido para o documento do Editor
 *     (`markdown.js`), e o que não coube volta como aviso;
 *   * editar um post relê o que está gravado e troca só o que foi pedido, porque
 *     a gravação do Post exige o conteúdo inteiro;
 *   * imagem chega por ENDEREÇO (capa, compartilhamento ou `![](…)` no corpo) e é
 *     trazida para o bucket do site antes de gravar (`imagensDoMcp.js`).
 */

import { CHAVES_DE_ICONE_DE_CATEGORIA, CORES_DE_CATEGORIA } from "../../src/domain/blog/categorias.js";
import { ESTADOS, publicadoPorAgendamento } from "../../src/domain/blog/estados.js";
import { VOCABULARIO_DA_DESCRICAO } from "../../src/domain/blog/schema.js";
import { gerarSlug } from "../../src/domain/blog/slug.js";
import { acaoDoEstado, acoesDoEstado } from "../../src/domain/blog/transicoes.js";
import { ESTADOS_DA_VAGA } from "../../src/domain/carreiras/estados.js";
import { acoesDoEstadoDaVaga } from "../../src/domain/carreiras/transicoes.js";

import { TAMANHO_MAXIMO_DO_ALTERNATIVO } from "../../src/domain/blog/arquivos.js";

import { RecusaDeImagem } from "./imagensDoMcp.js";
import { ehIdentificador } from "./leiturasDoMcp.js";
import { documentoDoMarkdown, enderecosDeImagemDoMarkdown, markdownDoDocumento } from "./markdown.js";
import { excluirCategoria, salvarCategoria } from "./operacoesDaCategoria.js";
import { excluirNoticia, salvarNoticia } from "./operacoesDaNoticia.js";
import { excluirVaga, mudarEstadoDaVaga, salvarVaga } from "./operacoesDaVaga.js";
import { definirDestaque, excluirPost } from "./operacoesDoPost.js";
import { salvarPost } from "./salvarPost.js";

/* ─── Vocabulário que o Claude vê ────────────────────────────────────────── */

/** As ações de Estado do Post, menos "salvar" (que mantém o Estado). */
const ACOES_DE_ESTADO_DO_POST = [
  ...new Set(ESTADOS.flatMap((e) => acoesDoEstado(e).map((a) => a.chave)).filter((c) => c !== "salvar")),
];
const ACOES_DE_ESTADO_DA_VAGA = [
  ...new Set(ESTADOS_DA_VAGA.flatMap((e) => acoesDoEstadoDaVaga(e).map((a) => a.chave))),
].filter((c) => c !== "excluir");

/** `var(--categoria-verde-bg)` ↔ `verde`. */
const CORES = Object.fromEntries(
  CORES_DE_CATEGORIA.map((valor) => [/--categoria-([a-z]+)-bg/.exec(valor)?.[1] ?? valor, valor]),
);
const nomeDaCor = (valor) => Object.keys(CORES).find((k) => CORES[k] === valor) ?? valor;

const DIAS = [7, 30, 90];

/* ─── Formas de resposta ─────────────────────────────────────────────────── */

export class Recusa extends Error {}

function exigirId(valor, oQue) {
  if (!ehIdentificador(valor)) throw new Recusa(`Informe o id (uuid) d${oQue}. Use a ferramenta de listar para achá-lo.`);
  return valor;
}

function dadosOuRecusa(lido, oQue) {
  if (!lido.ok) throw new Recusa(lido.mensagem);
  if (lido.dados === null || lido.dados === undefined) throw new Recusa(`Não encontrei ${oQue} com esse id.`);
  return lido.dados;
}

/** O resultado de um executor do Painel: sucesso ou a mensagem que o Painel mostraria. */
function resultadoDaEscrita(resultado) {
  if (resultado.ok) return resultado.dados;
  const { erro } = resultado;
  const partes = [erro.mensagem || "O Painel recusou a operação."];
  if (Array.isArray(erro.faltando) && erro.faltando.length > 0) partes.push(`Faltando: ${erro.faltando.join(", ")}.`);
  throw new Recusa(partes.join(" "));
}

function conteudoDoMarkdown(markdown, vocabulario, imagens) {
  const convertido = documentoDoMarkdown(markdown, vocabulario, { imagens });
  if (!convertido.ok) throw new Recusa(convertido.mensagem);
  return convertido;
}

/* ─── Imagens ────────────────────────────────────────────────────────────── */

const IMAGENS_POR_PEDIDO = 12;

/** Uma imagem trazida para o bucket. Recusa vira `Recusa`, com o motivo. */
async function importarImagem(ctx, endereco, destino) {
  try {
    return await ctx.importador.importar(String(endereco).trim(), destino);
  } catch (excecao) {
    if (excecao instanceof RecusaDeImagem) throw new Recusa(excecao.message);
    throw excecao;
  }
}

/**
 * As imagens do corpo trazidas para o bucket: o mapa que `documentoDoMarkdown`
 * usa. Imagem que falha não derruba o post: vira aviso, e o resto entra.
 */
async function imagensDoCorpo(ctx, markdown) {
  const mapa = new Map();
  const avisos = [];
  const enderecos = enderecosDeImagemDoMarkdown(markdown);
  if (enderecos.length > IMAGENS_POR_PEDIDO) {
    throw new Recusa(`São ${enderecos.length} imagens no corpo; o limite por pedido é ${IMAGENS_POR_PEDIDO}. Divida em edições.`);
  }
  // Quatro de cada vez: uma por uma, um post com muitas imagens passaria do
  // prazo da função; todas juntas, o pico de memória cresceria sem teto.
  const fila = [...enderecos];
  const trabalhar = async () => {
    for (let endereco = fila.shift(); endereco !== undefined; endereco = fila.shift()) {
      try {
        mapa.set(endereco, await importarImagem(ctx, endereco, "corpo"));
      } catch (excecao) {
        if (!(excecao instanceof Recusa)) throw excecao;
        avisos.push(`Imagem ${endereco.slice(0, 80)}: ${excecao.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, enderecos.length) }, trabalhar));
  return { mapa, avisos };
}

/**
 * Capa e imagem de compartilhamento: endereço → coluna. `""` ou `null` tira a
 * imagem. Capa exige descrição (o banco recusa capa sem `imagem_alt`).
 */
async function aplicarImagensDoPost(ctx, args, corpo) {
  if (args.capa_url !== undefined) {
    if (args.capa_url === null || String(args.capa_url).trim() === "") {
      corpo.imagem_url = null;
      corpo.imagem_alt = null;
    } else {
      const alt = String(args.capa_alt ?? corpo.imagem_alt ?? "").trim();
      if (alt === "") throw new Recusa("Toda capa precisa de capa_alt: uma frase dizendo o que a imagem mostra.");
      corpo.imagem_url = await importarImagem(ctx, args.capa_url, "capa");
      corpo.imagem_alt = alt;
    }
  } else if (args.capa_alt !== undefined) {
    corpo.imagem_alt = String(args.capa_alt).trim() || null;
  }
  if (corpo.imagem_alt && corpo.imagem_alt.length > TAMANHO_MAXIMO_DO_ALTERNATIVO) {
    throw new Recusa(`capa_alt tem mais de ${TAMANHO_MAXIMO_DO_ALTERNATIVO} caracteres. Resuma.`);
  }
  if (args.imagem_compartilhamento_url !== undefined) {
    const valor = args.imagem_compartilhamento_url;
    corpo.seo_imagem_url =
      valor === null || String(valor).trim() === "" ? null : await importarImagem(ctx, valor, "capa");
  }
}

/* ─── Posts ──────────────────────────────────────────────────────────────── */

function resumoDoPost(p) {
  return {
    id: p.id,
    titulo: p.titulo,
    estado: publicadoPorAgendamento(p) ? "publicado (pelo agendamento)" : p.estado,
    publicado_em: p.publicado_em,
    destaque: p.destaque,
    categoria: p.categoria?.nome ?? null,
    endereco: `/blog/${p.slug}`,
  };
}

async function categoriaPorNomeOuId(ctx, valor) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === "") return null;
  if (ehIdentificador(valor)) return valor;
  const lidas = dadosOuRecusa(await ctx.leitor.listarCategorias(), "categorias");
  const alvo = String(valor).trim().toLowerCase();
  const achada = lidas.find((c) => c.nome.toLowerCase() === alvo || c.slug === alvo);
  if (!achada) {
    throw new Recusa(
      `Não existe a categoria "${valor}". As que existem: ${lidas.map((c) => c.nome).join(", ")}. ` +
        "Para criar uma nova, use salvar_categoria.",
    );
  }
  return achada.id;
}

/** O corpo completo de gravação a partir do que está no banco. */
function corpoDoPostGravado(p) {
  return {
    id: p.id,
    slug: p.slug,
    titulo: p.titulo,
    resumo: p.resumo,
    conteudo: p.conteudo,
    categoria_id: p.categoria_id,
    tags: (p.posts_tags ?? []).map((t) => t.tag?.nome).filter(Boolean),
    tempo_leitura: p.tempo_leitura,
    imagem_url: p.imagem_url,
    imagem_alt: p.imagem_alt,
    seo_titulo: p.seo_titulo,
    seo_descricao: p.seo_descricao,
    seo_imagem_url: p.seo_imagem_url,
    estado: p.estado,
    publicado_em: p.publicado_em,
  };
}

const CAMPOS_DO_POST = {
  titulo: { type: "string", description: "Título do post." },
  resumo: { type: "string", description: "Resumo de uma ou duas frases (aparece no cartão do blog e no Google)." },
  conteudo_markdown: {
    type: "string",
    description:
      "O artigo em Markdown. Use ## e ### para seções (o # é o título do post), **negrito**, *itálico*, links, listas, " +
      "citações e blocos de código. Imagens: ![o que a imagem mostra](https://endereço-da-imagem), numa linha própria; " +
      "o servidor traz cada uma para o site (até 12 por pedido).",
  },
  capa_url: {
    type: "string",
    description:
      "Endereço https da imagem de capa (JPEG, PNG, WebP ou AVIF). O servidor baixa, otimiza e guarda no site. Vazio tira a capa.",
  },
  capa_alt: { type: "string", description: "O que a capa mostra, em uma frase (obrigatório com capa_url; até 300 caracteres)." },
  imagem_compartilhamento_url: {
    type: "string",
    description: "Imagem para WhatsApp, redes e Google (opcional; vazio herda a capa). Mesmo formato da capa.",
  },
  categoria: { type: "string", description: "Nome (ou id) de uma categoria existente." },
  tags: { type: "array", items: { type: "string" }, description: "Nomes das tags; as que não existem são criadas." },
  tempo_leitura: { type: "integer", minimum: 1, description: "Minutos de leitura." },
  slug: { type: "string", description: "Endereço do post (opcional; gerado do título na criação)." },
  seo_titulo: { type: "string", description: "Título para o Google (opcional; vazio herda o título)." },
  seo_descricao: { type: "string", description: "Descrição para o Google (opcional; vazio herda o resumo)." },
};

/* ─── O catálogo ─────────────────────────────────────────────────────────── */

const objeto = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const idDe = (oQue) => ({ type: "string", description: `Id (uuid) d${oQue}.` });
const periodo = { type: "integer", enum: DIAS, description: "Período em dias (7, 30 ou 90). Padrão: 30." };

export const FERRAMENTAS = [
  /* ── Posts ── */
  {
    nome: "listar_posts",
    titulo: "Listar posts",
    descricao:
      "Lista os posts do blog (todos os Estados), mais recentes primeiro. Filtra por texto (título, autor, categoria, tag) e por Estado.",
    somenteLeitura: true,
    esquema: objeto({
      busca: { type: "string" },
      estado: { type: "string", enum: [...ESTADOS] },
      limite: { type: "integer", minimum: 1, maximum: 100 },
    }),
    async executar(args, ctx) {
      const lidos = dadosOuRecusa(
        await ctx.leitor.listarPosts({
          termo: args.busca?.trim() || null,
          estado: args.estado ?? null,
          limite: args.limite ?? 30,
        }),
        "posts",
      );
      return { posts: lidos.map(resumoDoPost) };
    },
  },
  {
    nome: "ler_post",
    titulo: "Ler post",
    descricao: "Lê um post inteiro, com o conteúdo em Markdown, para revisar ou editar.",
    somenteLeitura: true,
    esquema: objeto({ id: idDe("o post") }, ["id"]),
    async executar(args, ctx) {
      const p = dadosOuRecusa(await ctx.leitor.lerPost(exigirId(args.id, "o post")), "post");
      return {
        ...resumoDoPost(p),
        resumo: p.resumo,
        tags: (p.posts_tags ?? []).map((t) => t.tag?.nome).filter(Boolean),
        tempo_leitura: p.tempo_leitura,
        autor: p.autor_nome,
        seo_titulo: p.seo_titulo,
        seo_descricao: p.seo_descricao,
        capa_url: p.imagem_url,
        capa_alt: p.imagem_alt,
        imagem_compartilhamento_url: p.seo_imagem_url,
        acoes_de_estado_possiveis: acoesDoEstado(p.estado).filter((a) => a.chave !== "salvar").map((a) => a.chave),
        conteudo_markdown: markdownDoDocumento(p.conteudo),
      };
    },
  },
  {
    nome: "criar_post",
    titulo: "Criar post (rascunho)",
    descricao:
      "Cria um post novo como RASCUNHO. Não publica: para publicar ou agendar, use mudar_estado_do_post depois.",
    esquema: objeto(CAMPOS_DO_POST, ["titulo", "resumo", "conteudo_markdown"]),
    async executar(args, ctx) {
      const imagens = await imagensDoCorpo(ctx, args.conteudo_markdown);
      const conteudo = conteudoDoMarkdown(args.conteudo_markdown, undefined, imagens.mapa);
      let slug = args.slug?.trim();
      if (!slug) {
        const gerado = gerarSlug(args.titulo ?? "");
        if (!gerado.ok) throw new Recusa(gerado.motivo);
        slug = gerado.slug;
      }
      const corpo = {
        titulo: args.titulo,
        resumo: args.resumo,
        slug,
        conteudo: conteudo.documento,
        estado: "rascunho",
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
        ...(args.tempo_leitura !== undefined ? { tempo_leitura: args.tempo_leitura } : {}),
        ...(args.seo_titulo !== undefined ? { seo_titulo: args.seo_titulo } : {}),
        ...(args.seo_descricao !== undefined ? { seo_descricao: args.seo_descricao } : {}),
      };
      const categoria = await categoriaPorNomeOuId(ctx, args.categoria);
      if (categoria !== undefined) corpo.categoria_id = categoria;
      await aplicarImagensDoPost(ctx, args, corpo);
      const gravado = resultadoDaEscrita(await ctx.escrever(salvarPost, corpo));
      return { criado: resumoDoPost(gravado.post ?? gravado), avisos: [...imagens.avisos, ...conteudo.avisos] };
    },
  },
  {
    nome: "editar_post",
    titulo: "Editar post",
    descricao:
      "Altera campos de um post existente, sem mudar o Estado. Mande só o que muda; o resto continua como está. " +
      "conteudo_markdown substitui o artigo inteiro: leia com ler_post antes.",
    esquema: objeto({ id: idDe("o post"), ...CAMPOS_DO_POST }, ["id"]),
    async executar(args, ctx) {
      const atual = dadosOuRecusa(await ctx.leitor.lerPost(exigirId(args.id, "o post")), "post");
      const corpo = corpoDoPostGravado(atual);
      let avisos = [];
      for (const campo of ["titulo", "resumo", "tags", "tempo_leitura", "slug", "seo_titulo", "seo_descricao"]) {
        if (args[campo] !== undefined) corpo[campo] = args[campo];
      }
      if (args.conteudo_markdown !== undefined) {
        const imagens = await imagensDoCorpo(ctx, args.conteudo_markdown);
        const conteudo = conteudoDoMarkdown(args.conteudo_markdown, undefined, imagens.mapa);
        corpo.conteudo = conteudo.documento;
        avisos = [...imagens.avisos, ...conteudo.avisos];
      }
      const categoria = await categoriaPorNomeOuId(ctx, args.categoria);
      if (categoria !== undefined) corpo.categoria_id = categoria;
      await aplicarImagensDoPost(ctx, args, corpo);
      const gravado = resultadoDaEscrita(await ctx.escrever(salvarPost, corpo));
      return { salvo: resumoDoPost(gravado.post ?? gravado), avisos };
    },
  },
  {
    nome: "mudar_estado_do_post",
    titulo: "Publicar, agendar ou arquivar post",
    descricao:
      "Muda o Estado de um post pela mesma máquina do Painel: publicar agora, agendar (exige data_hora), reagendar, " +
      "cancelar agendamento, arquivar ou voltar ao ar. Afeta o site público: confirme com a pessoa antes.",
    destrutiva: true,
    esquema: objeto(
      {
        id: idDe("o post"),
        acao: { type: "string", enum: ACOES_DE_ESTADO_DO_POST },
        data_hora: {
          type: "string",
          description: "Para agendar/reagendar: data e hora ISO 8601 com fuso, ex. 2026-10-20T09:00:00-03:00.",
        },
      },
      ["id", "acao"],
    ),
    async executar(args, ctx) {
      const atual = dadosOuRecusa(await ctx.leitor.lerPost(exigirId(args.id, "o post")), "post");
      const acao = acaoDoEstado(atual.estado, args.acao);
      if (!acao) {
        const possiveis = acoesDoEstado(atual.estado).filter((a) => a.chave !== "salvar").map((a) => a.chave);
        throw new Recusa(
          `Um post ${atual.estado} não aceita "${args.acao}". Ações possíveis agora: ${possiveis.join(", ") || "nenhuma"}.`,
        );
      }
      const corpo = { ...corpoDoPostGravado(atual), estado: acao.destino };
      if (acao.exigeData) {
        const instante = Date.parse(args.data_hora ?? "");
        if (!Number.isFinite(instante)) throw new Recusa("Esta ação exige data_hora (ISO 8601 com fuso).");
        corpo.publicado_em = new Date(instante).toISOString();
      }
      const gravado = resultadoDaEscrita(await ctx.escrever(salvarPost, corpo));
      return { acao: acao.rotulo, post: resumoDoPost(gravado.post ?? gravado) };
    },
  },
  {
    nome: "destacar_post",
    titulo: "Destacar post",
    descricao: "Liga ou desliga o destaque de um post no blog.",
    destrutiva: true,
    esquema: objeto({ id: idDe("o post"), destaque: { type: "boolean" } }, ["id", "destaque"]),
    async executar(args, ctx) {
      const r = resultadoDaEscrita(
        await ctx.escrever(definirDestaque, { id: exigirId(args.id, "o post"), destaque: args.destaque }),
      );
      return { ok: true, resultado: r };
    },
  },
  {
    nome: "excluir_post",
    titulo: "Excluir post",
    descricao: "Exclui um post para sempre, com as imagens dele. Não tem volta: confirme com a pessoa antes.",
    destrutiva: true,
    esquema: objeto({ id: idDe("o post") }, ["id"]),
    async executar(args, ctx) {
      resultadoDaEscrita(await ctx.escrever(excluirPost, { id: exigirId(args.id, "o post") }));
      return { excluido: args.id };
    },
  },

  {
    nome: "enviar_imagem",
    titulo: "Trazer imagem para o site",
    descricao:
      "Baixa uma imagem de um endereço https, otimiza (WebP, até 1600 px e 1 MB) e guarda no site. Devolve o endereço " +
      "para usar no corpo (![descrição](endereço)) ou como capa. Normalmente não é preciso: criar_post e editar_post " +
      "já trazem as imagens sozinhos.",
    esquema: objeto(
      {
        url: { type: "string", description: "Endereço https da imagem." },
        destino: { type: "string", enum: ["corpo", "capa"], description: "Onde ela vai ser usada. Padrão: corpo." },
      },
      ["url"],
    ),
    async executar(args, ctx) {
      return { endereco: await importarImagem(ctx, args.url, args.destino ?? "corpo") };
    },
  },

  /* ── Categorias ── */
  {
    nome: "listar_categorias",
    titulo: "Listar categorias",
    descricao: "Lista as categorias do blog.",
    somenteLeitura: true,
    esquema: objeto({}),
    async executar(_args, ctx) {
      const lidas = dadosOuRecusa(await ctx.leitor.listarCategorias(), "categorias");
      return { categorias: lidas.map((c) => ({ ...c, cor: nomeDaCor(c.cor) })) };
    },
  },
  {
    nome: "salvar_categoria",
    titulo: "Criar ou renomear categoria",
    descricao: "Cria uma categoria (sem id) ou altera uma existente (com id).",
    esquema: objeto(
      {
        id: idDe("a categoria (só para alterar)"),
        nome: { type: "string" },
        cor: { type: "string", enum: Object.keys(CORES) },
        icone: { type: "string", enum: [...CHAVES_DE_ICONE_DE_CATEGORIA] },
        ordem: { type: "integer", minimum: 0 },
      },
      ["nome"],
    ),
    async executar(args, ctx) {
      const corpo = { nome: args.nome };
      if (args.id !== undefined) corpo.id = exigirId(args.id, "a categoria");
      if (args.cor !== undefined) corpo.cor = CORES[args.cor];
      if (args.icone !== undefined) corpo.icone = args.icone;
      if (args.ordem !== undefined) corpo.ordem = args.ordem;
      return { categoria: resultadoDaEscrita(await ctx.escrever(salvarCategoria, corpo)) };
    },
  },
  {
    nome: "excluir_categoria",
    titulo: "Excluir categoria",
    descricao: "Exclui uma categoria que nenhum post usa.",
    destrutiva: true,
    esquema: objeto({ id: idDe("a categoria") }, ["id"]),
    async executar(args, ctx) {
      resultadoDaEscrita(await ctx.escrever(excluirCategoria, { id: exigirId(args.id, "a categoria") }));
      return { excluida: args.id };
    },
  },

  /* ── Notícias em vídeo ── */
  {
    nome: "listar_noticias",
    titulo: "Listar notícias em vídeo",
    descricao: "Lista as notícias em vídeo (YouTube) do blog.",
    somenteLeitura: true,
    esquema: objeto({}),
    async executar(_args, ctx) {
      return { noticias: dadosOuRecusa(await ctx.leitor.listarNoticias(), "notícias") };
    },
  },
  {
    nome: "salvar_noticia",
    titulo: "Cadastrar ou alterar notícia em vídeo",
    descricao:
      "Cadastra (sem id) ou altera (com id) uma notícia em vídeo. publicada=true coloca no blog na hora: confirme antes.",
    destrutiva: true,
    esquema: objeto(
      {
        id: idDe("a notícia (só para alterar)"),
        video: { type: "string", description: "Link do vídeo no YouTube." },
        titulo: { type: "string" },
        descricao: { type: "string" },
        publicada: { type: "boolean" },
      },
      [],
    ),
    async executar(args, ctx) {
      let corpo = {};
      if (args.id !== undefined) {
        const atual = dadosOuRecusa(await ctx.leitor.lerNoticia(exigirId(args.id, "a notícia")), "notícia");
        corpo = {
          id: atual.id,
          titulo: atual.titulo,
          descricao: atual.descricao,
          video: `https://www.youtube.com/watch?v=${atual.youtube_id}`,
          publicada: atual.publicada,
        };
      }
      for (const campo of ["video", "titulo", "descricao", "publicada"]) {
        if (args[campo] !== undefined) corpo[campo] = args[campo];
      }
      return { noticia: resultadoDaEscrita(await ctx.escrever(salvarNoticia, corpo)) };
    },
  },
  {
    nome: "excluir_noticia",
    titulo: "Excluir notícia em vídeo",
    descricao: "Exclui uma notícia em vídeo. Não tem volta: confirme antes.",
    destrutiva: true,
    esquema: objeto({ id: idDe("a notícia") }, ["id"]),
    async executar(args, ctx) {
      resultadoDaEscrita(await ctx.escrever(excluirNoticia, { id: exigirId(args.id, "a notícia") }));
      return { excluida: args.id };
    },
  },

  /* ── Vagas ── */
  {
    nome: "listar_vagas",
    titulo: "Listar vagas",
    descricao: "Lista as vagas de Carreiras, com Estado.",
    somenteLeitura: true,
    esquema: objeto({}),
    async executar(_args, ctx) {
      return { vagas: dadosOuRecusa(await ctx.leitor.listarVagas(), "vagas") };
    },
  },
  {
    nome: "ler_vaga",
    titulo: "Ler vaga",
    descricao: "Lê uma vaga inteira, com a descrição em Markdown.",
    somenteLeitura: true,
    esquema: objeto({ id: idDe("a vaga") }, ["id"]),
    async executar(args, ctx) {
      const v = dadosOuRecusa(await ctx.leitor.lerVaga(exigirId(args.id, "a vaga")), "vaga");
      const { descricao, ...resto } = v;
      return {
        ...resto,
        acoes_de_estado_possiveis: acoesDoEstadoDaVaga(v.estado).map((a) => a.chave).filter((c) => c !== "excluir"),
        descricao_markdown: markdownDoDocumento(descricao),
      };
    },
  },
  {
    nome: "salvar_vaga",
    titulo: "Criar ou alterar vaga",
    descricao:
      "Cria uma vaga como rascunho (sem id) ou altera uma existente (com id; mande só o que muda). " +
      "Departamento, tipo e nível são ids: veja listar_classificacoes.",
    esquema: objeto({
      id: idDe("a vaga (só para alterar)"),
      titulo: { type: "string" },
      slug: { type: "string" },
      departamento_id: { type: "string" },
      tipo_id: { type: "string" },
      nivel_id: { type: "string" },
      modalidade: { type: "string", enum: ["presencial", "hibrido", "remoto"] },
      localizacao: { type: "string" },
      resumo: { type: "string" },
      descricao_markdown: { type: "string", description: "Descrição em Markdown (títulos, parágrafos e listas)." },
      link_de_candidatura: { type: "string", description: "Endereço completo (http/https) para se candidatar." },
    }),
    async executar(args, ctx) {
      const corpo = {};
      if (args.id !== undefined) corpo.id = exigirId(args.id, "a vaga");
      const campos = ["titulo", "slug", "departamento_id", "tipo_id", "nivel_id", "modalidade", "localizacao", "resumo", "link_de_candidatura"];
      for (const campo of campos) if (args[campo] !== undefined) corpo[campo] = args[campo];
      let avisos = [];
      if (args.descricao_markdown !== undefined) {
        const convertido = conteudoDoMarkdown(args.descricao_markdown, VOCABULARIO_DA_DESCRICAO);
        corpo.descricao = convertido.documento;
        avisos = convertido.avisos;
      }
      return { vaga: resultadoDaEscrita(await ctx.escrever(salvarVaga, corpo)), avisos };
    },
  },
  {
    nome: "mudar_estado_da_vaga",
    titulo: "Abrir, encerrar ou reabrir vaga",
    descricao: "Abre, encerra ou reabre uma vaga no site. Afeta o site público: confirme antes.",
    destrutiva: true,
    esquema: objeto({ id: idDe("a vaga"), acao: { type: "string", enum: ACOES_DE_ESTADO_DA_VAGA } }, ["id", "acao"]),
    async executar(args, ctx) {
      return {
        vaga: resultadoDaEscrita(
          await ctx.escrever(mudarEstadoDaVaga, { id: exigirId(args.id, "a vaga"), acao: args.acao }),
        ),
      };
    },
  },
  {
    nome: "excluir_vaga",
    titulo: "Excluir vaga",
    descricao: "Exclui uma vaga. Não tem volta: confirme antes.",
    destrutiva: true,
    esquema: objeto({ id: idDe("a vaga") }, ["id"]),
    async executar(args, ctx) {
      resultadoDaEscrita(await ctx.escrever(excluirVaga, { id: exigirId(args.id, "a vaga") }));
      return { excluida: args.id };
    },
  },
  {
    nome: "listar_classificacoes",
    titulo: "Listar departamentos, tipos e níveis",
    descricao: "Lista os departamentos, tipos de vaga e níveis, com os ids que salvar_vaga pede.",
    somenteLeitura: true,
    esquema: objeto({}),
    async executar(_args, ctx) {
      return dadosOuRecusa(await ctx.leitor.listarClassificacoes(), "classificações");
    },
  },

  /* ── Métricas ── */
  {
    nome: "ver_leituras",
    titulo: "Ver leituras do blog",
    descricao: "Leituras por dia e os posts mais lidos no período. Com post_id, só a evolução daquele post.",
    somenteLeitura: true,
    esquema: objeto({ dias: periodo, post_id: idDe("o post (opcional)") }),
    async executar(args, ctx) {
      const dias = args.dias ?? 30;
      const postId = args.post_id === undefined ? null : exigirId(args.post_id, "o post");
      const [porDia, porPost] = await Promise.all([
        ctx.leitor.leiturasPorDia(dias, postId),
        postId ? Promise.resolve({ ok: true, dados: null }) : ctx.leitor.leiturasPorPost(dias),
      ]);
      const serie = dadosOuRecusa(porDia, "leituras");
      return {
        dias,
        total: serie.reduce((s, d) => s + Number(d.total), 0),
        por_dia: serie,
        ...(porPost.dados ? { mais_lidos: dadosOuRecusa(porPost, "leituras").slice(0, 20) } : {}),
      };
    },
  },
  {
    nome: "ver_buscas_google",
    titulo: "Ver buscas no Google",
    descricao:
      "Cliques, impressões e posição no Google (Search Console): por dia, páginas mais clicadas e termos de busca. " +
      "Com pagina (ex. /blog/meu-post), só aquela página.",
    somenteLeitura: true,
    esquema: objeto({ dias: periodo, pagina: { type: "string" } }),
    async executar(args, ctx) {
      const dias = args.dias ?? 30;
      const pagina = args.pagina?.trim() || null;
      const [porDia, porPagina, porTermo, ultimo] = await Promise.all([
        ctx.leitor.buscasPorDia(dias, pagina),
        ctx.leitor.buscasPorPagina(dias),
        ctx.leitor.buscasPorTermo(dias, pagina),
        ctx.leitor.ultimoDiaDeBuscas(),
      ]);
      return {
        dias,
        dados_ate: ultimo.ok ? ultimo.dados : null,
        por_dia: dadosOuRecusa(porDia, "buscas"),
        paginas: pagina ? undefined : dadosOuRecusa(porPagina, "buscas").slice(0, 30),
        termos: dadosOuRecusa(porTermo, "buscas").slice(0, 50),
      };
    },
  },
];
