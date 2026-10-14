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
import { documentoDoMarkdown, markdownDoDocumento } from "../api/_nucleo/markdown.js";
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
  afirmar("imagem no corpo fica de fora com aviso", img.ok && img.avisos.some((a) => a.includes("Imagens")));
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

console.log(falhas === 0 ? "\nMCP verificado: todas as asserções passaram." : `\nMCP NÃO verificado: ${falhas} asserção(ões) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
