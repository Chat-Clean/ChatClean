/**
 * Verificação do MCP do Painel. Roda em Node, sem rede e sem banco:
 *
 *   npm run verificar:mcp
 *
 * Confere a ponte Markdown ↔ documento, os tokens, o transporte HTTP, o que
 * cada ferramenta manda aos executores do Painel e que a identidade do token
 * chega ao executor de verdade.
 */

import fs from "node:fs";

import { FERRAMENTAS } from "../api/_nucleo/ferramentasDoMcp.js";
import { COLUNAS_DA_VAGA } from "../api/_nucleo/leiturasDoMcp.js";
import sharp from "sharp";

import {
  RecusaDeImagem,
  TETO_DO_DOWNLOAD,
  baixarImagem,
  criarImportador,
  ehEnderecoInterno,
  otimizarImagem,
} from "../api/_nucleo/imagensDoMcp.js";
import { documentoDoMarkdown, enderecosDeImagemDoMarkdown, markdownDoDocumento } from "../api/_nucleo/markdown.js";
import {
  VERSOES_DO_PROTOCOLO,
  atenderMcp,
  hashDoToken,
  lerTokens,
  montarContexto,
  problemaNosArgumentos,
  tokenReconhecido,
} from "../api/_nucleo/mcp.js";
import { excluirPost } from "../api/_nucleo/operacoesDoPost.js";
import { COLUNAS_DA_VAGA as COLUNAS_DO_NAVEGADOR } from "../src/data/carreiras/leitura.js";
import { createHash } from "node:crypto";

import { atenderRotaDoMcp } from "../api/_nucleo/mcp.js";
import { ROTA_DA_AUTORIZACAO, verificar as verificarAssinado } from "../api/_nucleo/oauthDoMcp.js";
import { SEGMENTO_DA_CONEXAO_DO_CLAUDE } from "../src/admin/shell/conexaoDoClaude.js";

let falhas = 0;
function afirmar(descricao, condicao, detalhe = "") {
  if (condicao) console.log(`  OK    ${descricao}`);
  else {
    falhas += 1;
    console.log(`  FALHA ${descricao}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

const CONTA = "11111111-2222-4333-8444-555555555555";
const POST_ID = "00000000-0000-4000-8000-000000000001";
const TOKEN = "ccmcp_tokenDeTeste";
const AMBIENTE = {
  MCP_TOKENS: JSON.stringify([{ nome: "teste", conta: CONTA, hash: hashDoToken(TOKEN) }]),
  SUPABASE_URL: "https://exemplo.supabase.co",
  SUPABASE_CHAVE_PUBLICAVEL: "chave-publicavel-de-teste",
  SUPABASE_CHAVE_DE_SERVICO: "chave-de-servico-de-teste",
};

/* ─── Markdown ──────────────────────────────────────────────────────────── */

console.log("\nMarkdown ↔ documento");
{
  const r = documentoDoMarkdown("# Título\n\nTexto **forte** e *leve* com [link](https://chatclean.com.br).\n\n- um\n- dois\n\n```js\nx\n```");
  const tipos = r.ok ? r.documento.content.map((n) => n.type) : [];
  afirmar("converte títulos, parágrafo, lista e código para os nós do Editor", r.ok && tipos.join() === "heading,paragraph,bulletList,codeBlock", tipos.join());
  afirmar("título de nível 1 vira nível 2 (o nível 1 é o título do post)", r.ok && r.documento.content[0].attrs.level === 2);
  const marcas = r.ok ? r.documento.content[1].content.flatMap((t) => (t.marks ?? []).map((m) => m.type)) : [];
  afirmar("negrito, itálico e link viram marcas", ["bold", "italic", "link"].every((m) => marcas.includes(m)), marcas.join());
  const volta = r.ok ? markdownDoDocumento(r.documento) : "";
  afirmar("volta para Markdown legível", volta.includes("## Título") && volta.includes("**forte**") && volta.includes("- um"), volta);
  const ida2 = documentoDoMarkdown(volta);
  afirmar("ida e volta preservam o documento", ida2.ok && JSON.stringify(ida2.documento) === JSON.stringify(r.documento));
  afirmar("Markdown vazio é recusado com motivo", documentoDoMarkdown("  ").ok === false);
  const img = documentoDoMarkdown("![foto](https://x.com/a.png)\n\ntexto");
  afirmar("imagem sem endereço no site fica de fora com aviso", img.ok && img.avisos.some((a) => a.includes("x.com/a.png")));
  const js = documentoDoMarkdown("[x](javascript:alert(1))");
  const temLink = js.ok && JSON.stringify(js.documento).includes("javascript:");
  afirmar("link javascript: não passa (a validação do Editor o derruba)", js.ok && !temLink);
}

/* ─── Tokens ────────────────────────────────────────────────────────────── */

console.log("\nTokens");
{
  const tokens = lerTokens(AMBIENTE);
  afirmar("MCP_TOKENS válido é lido", tokens.length === 1);
  afirmar("o token certo é reconhecido", tokenReconhecido(TOKEN, tokens)?.conta === CONTA);
  afirmar("token errado não é reconhecido", tokenReconhecido("ccmcp_outro", tokens) === null);
  afirmar("token sem o prefixo não é reconhecido", tokenReconhecido("tokenDeTeste", tokens) === null);
  const erroAntes = console.error;
  console.error = () => {};
  afirmar("entrada malformada é ignorada", lerTokens({ MCP_TOKENS: '[{"nome":"x","conta":"nao-uuid","hash":"abc"}]' }).length === 0);
  afirmar("JSON quebrado não aceita token nenhum", lerTokens({ MCP_TOKENS: "[{" }).length === 0);
  console.error = erroAntes;
  afirmar("sem a variável, nenhum token", lerTokens({}).length === 0);
}

/* ─── HTTP ──────────────────────────────────────────────────────────────── */

function resposta() {
  const r = { status_: 200, cabecalhos: {}, corpo: undefined, fim: false };
  r.status = (s) => ((r.status_ = s), r);
  r.json = (c) => ((r.corpo = c), (r.fim = true), r);
  r.end = () => ((r.fim = true), r);
  r.setHeader = (k, v) => (r.cabecalhos[k.toLowerCase()] = v);
  return r;
}
const leitorFalso = () => ({});
const acessoFalso = () => ({ ok: true, acesso: {} });
async function pedir(corpo, { metodo = "POST", token = TOKEN } = {}) {
  const res = resposta();
  await atenderMcp(
    { method: metodo, headers: token ? { authorization: `Bearer ${token}` } : {}, body: corpo, query: { via: "mcp" } },
    res,
    { ambiente: AMBIENTE, fabricarAcesso: acessoFalso, fabricarLeitor: leitorFalso },
  );
  return res;
}

console.log("\nTransporte");
{
  afirmar("GET responde 405 com Allow: POST", (await pedir(null, { metodo: "GET" })).status_ === 405);
  const semToken = await pedir({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: "" });
  afirmar("sem token responde 401 com WWW-Authenticate", semToken.status_ === 401 && Boolean(semToken.cabecalhos["www-authenticate"]));
  afirmar("token errado responde 401", (await pedir({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: "ccmcp_x" })).status_ === 401);
  const ini = await pedir({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  afirmar("initialize negocia a versão pedida e anuncia ferramentas", ini.corpo?.result?.protocolVersion === "2025-03-26" && Boolean(ini.corpo?.result?.capabilities?.tools));
  const icone = ini.corpo?.result?.serverInfo?.icons?.[0];
  afirmar(
    "initialize anuncia o ícone da ChatClean (sem fundo) e o site",
    icone?.src?.endsWith("/icone-chatclean.png") && icone?.mimeType === "image/png" && Boolean(ini.corpo?.result?.serverInfo?.websiteUrl),
  );
  const pngDoIcone = fs.existsSync("public/icone-chatclean.png") ? await sharp("public/icone-chatclean.png").metadata() : null;
  afirmar("o ícone existe em public/, quadrado e com transparência", pngDoIcone?.width === pngDoIcone?.height && pngDoIcone?.hasAlpha === true);
  const ini2 = await pedir({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  afirmar("versão desconhecida recebe a mais nova suportada", ini2.corpo?.result?.protocolVersion === VERSOES_DO_PROTOCOLO[0]);
  const notif = await pedir({ jsonrpc: "2.0", method: "notifications/initialized" });
  afirmar("notificação responde 202 sem corpo", notif.status_ === 202 && notif.corpo === undefined);
  const lista = await pedir({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const ferramentas = lista.corpo?.result?.tools ?? [];
  afirmar("tools/list devolve as ferramentas com esquema", ferramentas.length === FERRAMENTAS.length && ferramentas.every((f) => f.inputSchema?.type === "object"));
  const destrutivas = ferramentas.filter((f) => f.annotations?.destructiveHint).map((f) => f.name);
  afirmar(
    "publicar, excluir e colocar no ar são marcadas como destrutivas",
    ["mudar_estado_do_post", "excluir_post", "excluir_categoria", "excluir_vaga", "mudar_estado_da_vaga", "salvar_noticia"].every((n) => destrutivas.includes(n)),
    destrutivas.join(", "),
  );
  afirmar("criar_post não é destrutiva (nasce rascunho)", !destrutivas.includes("criar_post"));
  const desconhecido = await pedir({ jsonrpc: "2.0", id: 3, method: "resources/list" });
  afirmar("método desconhecido responde -32601", desconhecido.corpo?.error?.code === -32601);
  const lote = await pedir([{ jsonrpc: "2.0", id: 4, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }]);
  afirmar("lote responde só às mensagens com id", Array.isArray(lote.corpo) && lote.corpo.length === 1);
  const argErrado = await pedir({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "listar_posts", arguments: { nada: 1 } } });
  afirmar("argumento desconhecido volta como erro da ferramenta", argErrado.corpo?.result?.isError === true);
}

/* ─── Ferramentas ───────────────────────────────────────────────────────── */

const POST_GRAVADO = {
  id: POST_ID,
  slug: "post-teste",
  titulo: "Post teste",
  resumo: "Resumo.",
  conteudo: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Antigo." }] }] },
  categoria_id: null,
  posts_tags: [{ tag: { nome: "whatsapp" } }],
  tempo_leitura: 3,
  estado: "rascunho",
  publicado_em: null,
  destaque: false,
};

function contextoFalso(post = POST_GRAVADO) {
  const escritas = [];
  return {
    escritas,
    quem: "teste",
    leitor: {
      lerPost: async () => ({ ok: true, dados: post }),
      listarCategorias: async () => ({ ok: true, dados: [{ id: "c0000000-0000-4000-8000-000000000001", nome: "Atendimento", slug: "atendimento" }] }),
    },
    escrever: async (executor, corpo) => {
      escritas.push({ executor: executor.name, corpo });
      return { ok: true, dados: { post: { ...post, ...corpo } } };
    },
  };
}
const ferramenta = (nome) => FERRAMENTAS.find((f) => f.nome === nome);

console.log("\nFerramentas");
{
  const ctx = contextoFalso();
  await ferramenta("criar_post").executar(
    { titulo: "Como usar a API Oficial!", resumo: "R.", conteudo_markdown: "## Oi\n\ntexto", categoria: "atendimento", tags: ["api"] },
    ctx,
  );
  const c = ctx.escritas[0]?.corpo ?? {};
  afirmar("criar_post grava pelo executor do Painel", ctx.escritas[0]?.executor === "salvarPost");
  afirmar("criar_post nasce rascunho", c.estado === "rascunho");
  afirmar("criar_post gera o endereço do título", c.slug === "como-usar-a-api-oficial");
  afirmar("criar_post resolve a categoria pelo nome", c.categoria_id === "c0000000-0000-4000-8000-000000000001");
  afirmar("criar_post manda o documento do Editor, não Markdown", c.conteudo?.type === "doc");
  let recusou = "";
  try {
    await ferramenta("criar_post").executar({ titulo: "x", resumo: "r", conteudo_markdown: "t", categoria: "Inexistente" }, contextoFalso());
  } catch (e) {
    recusou = e.message;
  }
  afirmar("categoria inexistente é recusada listando as que existem", recusou.includes("Atendimento"), recusou);
}
{
  const ctx = contextoFalso();
  await ferramenta("editar_post").executar({ id: POST_ID, titulo: "Novo título" }, ctx);
  const c = ctx.escritas[0]?.corpo ?? {};
  afirmar("editar_post troca só o pedido e mantém o resto", c.titulo === "Novo título" && c.resumo === "Resumo." && c.conteudo === POST_GRAVADO.conteudo);
  afirmar("editar_post mantém o Estado e as tags", c.estado === "rascunho" && c.tags?.[0] === "whatsapp");
}
{
  const ctx = contextoFalso();
  await ferramenta("mudar_estado_do_post").executar({ id: POST_ID, acao: "agendar", data_hora: "2099-01-01T09:00:00-03:00" }, ctx);
  const c = ctx.escritas[0]?.corpo ?? {};
  afirmar("agendar manda estado agendado e a data em UTC", c.estado === "agendado" && c.publicado_em === "2099-01-01T12:00:00.000Z", JSON.stringify(c.publicado_em));
  let semData = "";
  try {
    await ferramenta("mudar_estado_do_post").executar({ id: POST_ID, acao: "agendar" }, contextoFalso());
  } catch (e) {
    semData = e.message;
  }
  afirmar("agendar sem data é recusado antes de ir ao banco", semData.includes("data_hora"));
  let invalida = "";
  try {
    await ferramenta("mudar_estado_do_post").executar({ id: POST_ID, acao: "reagendar" }, contextoFalso());
  } catch (e) {
    invalida = e.message;
  }
  afirmar("ação que o Estado não aceita é recusada com as possíveis", invalida.includes("Ações possíveis"), invalida);
}
afirmar(
  "esquema obriga os campos que a ferramenta exige",
  problemaNosArgumentos(ferramenta("criar_post").esquema, { titulo: "x" }) !== null,
);
afirmar(
  "esquema recusa valor fora da lista",
  problemaNosArgumentos(ferramenta("listar_posts").esquema, { estado: "publicada" }) !== null,
);

/* ─── Imagens ───────────────────────────────────────────────────────────── */

console.log("\nImagens");
{
  const NOSSO = "https://exemplo.supabase.co/storage/v1/object/public/imagens-do-blog/corpo/aaaaaaaa-1111.webp";
  const md = "Texto.\n\n![Gráfico](https://fotos.exemplo.com/a.png)\n\n![Outra](https://fora.exemplo.com/b.png)";
  afirmar(
    "acha os endereços das imagens do Markdown",
    JSON.stringify(enderecosDeImagemDoMarkdown(md)) === JSON.stringify(["https://fotos.exemplo.com/a.png", "https://fora.exemplo.com/b.png"]),
  );
  const r = documentoDoMarkdown(md, undefined, { imagens: new Map([["https://fotos.exemplo.com/a.png", NOSSO]]) });
  const img = r.ok ? r.documento.content.find((n) => n.type === "image") : null;
  afirmar("imagem trazida vira bloco de imagem com o endereço do bucket e a descrição", img?.attrs?.src === NOSSO && img?.attrs?.alt === "Gráfico");
  afirmar("imagem que não foi trazida fica de fora, com aviso", r.ok && r.avisos.some((a) => a.includes("fora.exemplo.com")));
  afirmar("a imagem volta como ![descrição](endereço) ao ler", markdownDoDocumento(r.documento).includes(`![Gráfico](${NOSSO})`));

  const marca = documentoDoMarkdown("A ==amarela **forte**== e =={verde}verde== e <mark>mark</mark>; a == b fica.");
  const trechos = marca.ok ? marca.documento.content[0].content : [];
  const corDe = (t) => trechos.find((n) => n.text === t)?.marks?.find((m) => m.type === "highlight")?.attrs?.cor;
  afirmar("marca-texto ==…== vira destaque amarelo, também com negrito dentro", corDe("amarela ") === "amarelo" && corDe("forte") === "amarelo");
  afirmar("=={verde}…== escolhe a cor, e <mark> também vale", corDe("verde") === "verde" && corDe("mark") === "amarelo");
  afirmar("'a == b' continua texto", trechos.some((n) => n.text?.includes("a == b") && !n.marks));
  const cores = documentoDoMarkdown("=={azul}a== =={rosa}b== =={ Green }c== =={amarela}d== =={pink}e== =={vermelho}f==");
  const corDoTrecho = (t) =>
    cores.ok ? cores.documento.content[0].content.find((n) => n.text === t)?.marks?.[0]?.attrs?.cor : null;
  afirmar(
    "as quatro cores do sistema, também em inglês ou no feminino",
    corDoTrecho("a") === "azul" && corDoTrecho("b") === "rosa" && corDoTrecho("c") === "verde" &&
      corDoTrecho("d") === "amarelo" && corDoTrecho("e") === "rosa",
  );
  afirmar(
    "cor que o sistema não tem vira amarelo, com aviso listando as cores",
    corDoTrecho("f") === "amarelo" && cores.avisos.some((t) => t.includes("vermelho") && t.includes("azul")),
  );
  const voltaDaMarca = markdownDoDocumento(marca.documento);
  afirmar(
    "o marca-texto volta como ==…== e a ida e volta preserva o documento",
    voltaDaMarca.includes("==amarela **forte**==") && voltaDaMarca.includes("=={verde}verde==") &&
      JSON.stringify(documentoDoMarkdown(voltaDaMarca).documento) === JSON.stringify(marca.documento),
    voltaDaMarca,
  );

  afirmar(
    "endereços internos são reconhecidos",
    ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"].every(ehEnderecoInterno),
  );
  afirmar("endereço público passa", !ehEnderecoInterno("8.8.8.8") && !ehEnderecoInterno("2606:4700::1111"));

  const publico = async () => [{ address: "93.184.216.34", family: 4 }];
  const interno = async () => [{ address: "10.0.0.5", family: 4 }];
  const pngGrande = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#16a34a" } }).png().toBuffer();
  const respostaDeImagem = (bytes) =>
    new Response(bytes, { status: 200, headers: { "content-type": "image/png", "content-length": String(bytes.length) } });

  const recusa = async (fn) => {
    try {
      await fn();
      return "";
    } catch (e) {
      return e instanceof RecusaDeImagem ? e.message : `OUTRO: ${e.message}`;
    }
  };
  afirmar("http:// é recusado", (await recusa(() => baixarImagem("http://fotos.exemplo.com/a.png", { resolver: publico }))).includes("https"));
  afirmar(
    "host que resolve para rede interna é recusado",
    (await recusa(() => baixarImagem("https://interno.exemplo.com/a.png", { resolver: interno, buscar: async () => respostaDeImagem(pngGrande) }))) !== "",
  );
  afirmar("IP interno direto é recusado", (await recusa(() => baixarImagem("https://169.254.169.254/latest", { resolver: publico }))) !== "");
  const redireciona = async (url) =>
    String(url).includes("primeiro")
      ? new Response(null, { status: 302, headers: { location: "https://127.0.0.1/segredo" } })
      : respostaDeImagem(pngGrande);
  afirmar(
    "redirecionamento para rede interna é recusado",
    (await recusa(() => baixarImagem("https://primeiro.exemplo.com/a.png", { resolver: publico, buscar: redireciona }))) !== "",
  );
  const enorme = async () => new Response("x", { status: 200, headers: { "content-length": String(TETO_DO_DOWNLOAD + 1) } });
  afirmar("arquivo acima do teto é recusado antes de baixar", (await recusa(() => baixarImagem("https://a.exemplo.com/x.png", { resolver: publico, buscar: enorme }))).includes("20 MB"));

  const otimizada = await otimizarImagem(pngGrande);
  const meta = await sharp(otimizada.bytes).metadata();
  afirmar("imagem grande vira WebP com no máximo 1600 px e 1 MB", meta.format === "webp" && meta.width === 1600 && otimizada.bytes.length <= 1024 * 1024);
  afirmar("arquivo que não é imagem é recusado", (await recusa(() => otimizarImagem(Buffer.from("<html>não sou imagem</html>")))) !== "");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  afirmar("SVG é recusado", (await recusa(() => otimizarImagem(svg))).includes("SVG"));

  const enviados = [];
  const buscarFalso = async (url, opcoes = {}) => {
    if (String(url).includes("/storage/v1/object/")) {
      enviados.push({ url: String(url), metodo: opcoes.method, chave: opcoes.headers?.apikey, tipo: opcoes.headers?.["Content-Type"] });
      return new Response("{}", { status: 200 });
    }
    return respostaDeImagem(pngGrande);
  };
  const importador = criarImportador(
    { url: "https://exemplo.supabase.co", chaveDeServico: "chave-de-servico-de-teste" },
    { buscar: buscarFalso, resolver: publico },
  );
  const enderecoCapa = await importador.importar("https://fotos.exemplo.com/capa.png", "capa");
  afirmar(
    "a capa vai para capas/ no bucket do site, como WebP, pela chave de serviço",
    /\/storage\/v1\/object\/public\/imagens-do-blog\/capas\/[0-9a-f-]{36}\.webp$/.test(enderecoCapa) &&
      enviados[0]?.metodo === "POST" &&
      enviados[0]?.chave === "chave-de-servico-de-teste" &&
      enviados[0]?.tipo === "image/webp",
    enderecoCapa,
  );
  const enderecoCorpo = await importador.importar("https://fotos.exemplo.com/b.png", "corpo");
  afirmar("a imagem do corpo vai para corpo/", /\/imagens-do-blog\/corpo\/[0-9a-f-]{36}\.webp$/.test(enderecoCorpo));
  const antes = enviados.length;
  afirmar("imagem que já é do bucket não é baixada de novo", (await importador.importar(NOSSO.replace("exemplo.supabase.co", "exemplo.supabase.co"), "corpo")) === NOSSO && enviados.length === antes);

  /* As ferramentas */
  const importadorFalso = {
    importar: async (url, destino) => {
      if (String(url).includes("quebrada")) throw new RecusaDeImagem("O site da imagem respondeu 404. Confira o endereço.");
      return `https://exemplo.supabase.co/storage/v1/object/public/imagens-do-blog/${destino === "corpo" ? "corpo" : "capas"}/novo-${destino}.webp`;
    },
  };
  const ctx = { ...contextoFalso(), importador: importadorFalso };
  let semAlt = "";
  try {
    await ferramenta("criar_post").executar({ titulo: "Com capa", resumo: "R.", conteudo_markdown: "texto", capa_url: "https://fotos.exemplo.com/c.png" }, ctx);
  } catch (e) {
    semAlt = e.message;
  }
  afirmar("capa sem descrição é recusada antes de gravar", semAlt.includes("capa_alt"));
  const ctx2 = { ...contextoFalso(), importador: importadorFalso };
  const criado = await ferramenta("criar_post").executar(
    {
      titulo: "Post com imagens",
      resumo: "R.",
      conteudo_markdown: "Intro.\n\n![Painel](https://fotos.exemplo.com/p.png)\n\n![x](https://fotos.exemplo.com/quebrada.png)",
      capa_url: "https://fotos.exemplo.com/capa.png",
      capa_alt: "Equipe atendendo no WhatsApp",
      imagem_compartilhamento_url: "https://fotos.exemplo.com/og.png",
    },
    ctx2,
  );
  const c = ctx2.escritas[0]?.corpo ?? {};
  afirmar("criar_post grava a capa trazida e a descrição", c.imagem_url?.endsWith("/capas/novo-capa.webp") && c.imagem_alt === "Equipe atendendo no WhatsApp");
  afirmar("e a imagem de compartilhamento", c.seo_imagem_url?.endsWith("/capas/novo-capa.webp"));
  afirmar("e a imagem do corpo como bloco do Editor", JSON.stringify(c.conteudo).includes("/corpo/novo-corpo.webp"));
  afirmar("imagem que falhou não derruba o post: vira aviso", criado.avisos.some((a) => a.includes("404")));
  const ctx3 = { ...contextoFalso({ ...POST_GRAVADO, imagem_url: "https://x/capa.webp", imagem_alt: "algo" }), importador: importadorFalso };
  await ferramenta("editar_post").executar({ id: POST_ID, capa_url: "" }, ctx3);
  const c3 = ctx3.escritas[0]?.corpo ?? {};
  afirmar("editar_post com capa_url vazio tira a capa", c3.imagem_url === null && c3.imagem_alt === null);
}

/* ─── Identidade chega ao executor de verdade ───────────────────────────── */

console.log("\nIdentidade");
{
  const chamadas = [];
  const acesso = {
    contaDoToken: async () => ({ ok: false, status: 401, dados: null, mensagem: "não deveria ser chamado" }),
    perfilDaConta: async (id) => (chamadas.push(["perfil", id]), { ok: true, dados: { id, nome_exibicao: "Teste" } }),
    excluirPost: async (id) => (chamadas.push(["excluir", id]), { ok: true, dados: { id, imagem_url: null, seo_imagem_url: null, conteudo: null } }),
    removerArquivos: async () => ({ ok: true, dados: [] }),
    removerArquivo: async () => ({ ok: true, dados: null }),
  };
  const ctx = montarContexto({ entrada: { nome: "teste", conta: CONTA }, acesso, leitor: {} });
  const r = await ctx.escrever(excluirPost, { id: POST_ID });
  afirmar("o executor do Painel recebe a Conta do token e confere o perfil dela", chamadas.some(([k, v]) => k === "perfil" && v === CONTA), JSON.stringify(chamadas));
  afirmar("e executa a operação", r.ok === true && chamadas.some(([k]) => k === "excluir"), JSON.stringify(r.erro ?? ""));
}

/* ─── Amarras com o resto do projeto ────────────────────────────────────── */

console.log("\nProjeto");
{
  const doNavegador = COLUNAS_DO_NAVEGADOR.filter((c) => c !== "descricao_html");
  afirmar("as colunas da Vaga do MCP são as do Painel", JSON.stringify([...COLUNAS_DA_VAGA]) === JSON.stringify(doNavegador));
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const i = vercel.rewrites.findIndex((r) => r.source === "/mcp");
  const tudo = vercel.rewrites.findIndex((r) => r.source === "/(.*)");
  afirmar("/mcp é reescrito para a função de posts, antes da reescrita geral", i >= 0 && vercel.rewrites[i].destination === "/api/posts?via=mcp" && i < tudo);
  const funcoes = fs.readdirSync("api").filter((n) => n.endsWith(".js"));
  afirmar(
    "o MCP não gastou função: nenhum arquivo próprio em api/, e o teto de 12 do plano segue respeitado",
    !funcoes.some((n) => n.startsWith("mcp")) && funcoes.length < 12,
    funcoes.join(", "),
  );
}

/* ─── OAuth ─────────────────────────────────────────────────────────────── */

console.log("\nOAuth");
{
  let perfilExiste = true;
  const JWT_DA_SESSAO = "jwt-da-sessao-do-painel";
  const acessoOauth = () => ({
    ok: true,
    acesso: {
      contaDoToken: async (t) => (t === JWT_DA_SESSAO ? { ok: true, dados: { id: CONTA } } : { ok: false, status: 401 }),
      perfilDaConta: async (id) => ({ ok: true, dados: perfilExiste && id === CONTA ? { id, nome_exibicao: "Felix" } : null }),
    },
  });
  async function rota(via, { metodo = "POST", corpo, auth, host = "chatclean.com.br" } = {}) {
    const res = resposta();
    await atenderRotaDoMcp(
      { method: metodo, headers: { host, ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: corpo, query: { via } },
      res,
      { ambiente: AMBIENTE, fabricarAcesso: acessoOauth, fabricarLeitor: leitorFalso },
    );
    return res;
  }

  const recurso = await rota("mcp-recurso", { metodo: "GET" });
  afirmar(
    "metadados do recurso apontam o servidor de autorização",
    recurso.corpo?.resource === "https://chatclean.com.br/mcp" && recurso.corpo?.authorization_servers?.[0] === "https://chatclean.com.br",
  );
  const servidor = (await rota("mcp-servidor", { metodo: "GET" })).corpo ?? {};
  afirmar(
    "metadados do servidor anunciam PKCE S256, registro e a tela do Painel",
    servidor.code_challenge_methods_supported?.includes("S256") &&
      servidor.registration_endpoint?.endsWith("/mcp/registrar") &&
      servidor.authorization_endpoint === "https://chatclean.com.br/admin/conectar-claude",
  );
  afirmar("a rota da tela de autorização é a mesma no servidor e no Painel", ROTA_DA_AUTORIZACAO === `/admin/${SEGMENTO_DA_CONEXAO_DO_CLAUDE}`);
  const sem = await rota("mcp", { corpo: { jsonrpc: "2.0", id: 1, method: "ping" } });
  afirmar(
    "401 do /mcp diz onde começar o login (resource_metadata)",
    /resource_metadata="https:\/\/chatclean\.com\.br\/\.well-known\/oauth-protected-resource"/.test(sem.cabecalhos["www-authenticate"] ?? ""),
  );
  afirmar("preflight OPTIONS responde 204 com CORS", (await rota("mcp-token", { metodo: "OPTIONS" })).status_ === 204);

  const estranho = await rota("mcp-registrar", { corpo: { redirect_uris: ["https://golpe.example.com/cb"], client_name: "Claude" } });
  afirmar("registro recusa retorno que não é do Claude", estranho.status_ === 400);
  const RETORNO = "https://claude.ai/api/mcp/auth_callback";
  const registro = await rota("mcp-registrar", { corpo: { redirect_uris: [RETORNO], client_name: "Claude" } });
  const clientId = registro.corpo?.client_id;
  afirmar("registro do claude.ai devolve client_id", registro.status_ === 201 && typeof clientId === "string");
  const local = await rota("mcp-registrar", { corpo: { redirect_uris: ["http://localhost:53682/callback"] } });
  afirmar("registro do Claude Code (porta local) é aceito", local.status_ === 201);

  const verifier = "verificador-do-pkce-com-tamanho-suficiente-1234567890";
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const pedidoBase = { client_id: clientId, redirect_uri: RETORNO, code_challenge: challenge, code_challenge_method: "S256", state: "xyz" };
  const semSessao = await rota("mcp-autorizar", { corpo: pedidoBase, auth: "jwt-invalido" });
  afirmar("autorizar sem sessão válida do Painel é recusado", semSessao.status_ === 401);
  const outroRetorno = await rota("mcp-autorizar", { corpo: { ...pedidoBase, redirect_uri: "https://claude.ai/outro" }, auth: JWT_DA_SESSAO });
  afirmar("autorizar com retorno diferente do registrado é recusado", outroRetorno.status_ === 400);
  const negado = await rota("mcp-autorizar", { corpo: { ...pedidoBase, negar: true }, auth: JWT_DA_SESSAO });
  afirmar(
    "cancelar devolve ao Claude com access_denied",
    negado.corpo?.redirecionar?.startsWith(RETORNO) &&
      negado.corpo.redirecionar.includes("error=access_denied") &&
      negado.corpo.redirecionar.includes("state=xyz"),
  );
  const ok = await rota("mcp-autorizar", { corpo: pedidoBase, auth: JWT_DA_SESSAO });
  const destino = ok.corpo?.redirecionar ? new URL(ok.corpo.redirecionar) : null;
  const code = destino?.searchParams.get("code");
  afirmar(
    "autorizar devolve ao Claude com o código e o state",
    destino?.origin === "https://claude.ai" && Boolean(code) && destino.searchParams.get("state") === "xyz",
  );
  const conteudoDoCodigo = verificarAssinado(code, "codigo", AMBIENTE);
  afirmar("o código carrega a conta LOGADA como autora", conteudoDoCodigo?.conta === CONTA && conteudoDoCodigo?.nome === "Felix");

  const formulario = (campos) => new URLSearchParams(campos).toString();
  const errado = await rota("mcp-token", {
    corpo: formulario({ grant_type: "authorization_code", code, redirect_uri: RETORNO, code_verifier: "outro", client_id: clientId }),
  });
  afirmar("verificador do PKCE errado é recusado (invalid_grant)", errado.status_ === 400 && errado.corpo?.error === "invalid_grant");
  const troca = await rota("mcp-token", {
    corpo: formulario({ grant_type: "authorization_code", code, redirect_uri: RETORNO, code_verifier: verifier, client_id: clientId }),
  });
  const tokens = troca.corpo ?? {};
  afirmar(
    "o código vira tokens (formulário urlencoded)",
    troca.status_ === 200 && tokens.token_type === "Bearer" && Boolean(tokens.access_token) && Boolean(tokens.refresh_token),
  );
  const comAcesso = await rota("mcp", { corpo: { jsonrpc: "2.0", id: 9, method: "tools/list" }, auth: tokens.access_token });
  afirmar("o token de acesso abre o /mcp", comAcesso.status_ === 200 && (comAcesso.corpo?.result?.tools?.length ?? 0) === FERRAMENTAS.length);
  const comRenovacao = await rota("mcp", { corpo: { jsonrpc: "2.0", id: 9, method: "ping" }, auth: tokens.refresh_token });
  afirmar("token de renovação não serve como acesso", comRenovacao.status_ === 401);
  const adulterado = tokens.access_token.slice(0, -3) + "AAA";
  const comAdulterado = await rota("mcp", { corpo: { jsonrpc: "2.0", id: 9, method: "ping" }, auth: adulterado });
  afirmar("token adulterado é recusado", comAdulterado.status_ === 401);
  const renovado = await rota("mcp-token", { corpo: { grant_type: "refresh_token", refresh_token: tokens.refresh_token } });
  afirmar("a renovação devolve tokens novos", renovado.status_ === 200 && Boolean(renovado.corpo?.access_token));
  perfilExiste = false;
  const semPerfil = await rota("mcp-token", { corpo: { grant_type: "refresh_token", refresh_token: tokens.refresh_token } });
  afirmar("conta que saiu do Painel não renova mais", semPerfil.status_ === 400 && semPerfil.corpo?.error === "invalid_grant");
  afirmar("token vencido é recusado", verificarAssinado(tokens.access_token, "acesso", AMBIENTE, Date.now() + 2 * 3600 * 1000) === null);
  const outraChave = { ...AMBIENTE, SUPABASE_CHAVE_DE_SERVICO: "outra-chave-de-servico" };
  afirmar("trocar a chave de serviço invalida as conexões", verificarAssinado(tokens.access_token, "acesso", outraChave) === null);

  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const tudo = vercel.rewrites.findIndex((r) => r.source === "/(.*)");
  const precisa = ["/mcp/registrar", "/mcp/token", "/mcp/autorizar", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"];
  afirmar(
    "as rotas do OAuth estão no vercel.json antes da reescrita geral",
    precisa.every((src) => {
      const i = vercel.rewrites.findIndex((r) => r.source === src);
      return i >= 0 && i < tudo;
    }),
  );
}

console.log(falhas === 0 ? "\nMCP verificado: todas as asserções passaram." : `\nMCP NÃO verificado: ${falhas} asserção(ões) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
