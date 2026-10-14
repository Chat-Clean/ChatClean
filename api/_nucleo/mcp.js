/**
 * O servidor MCP do Painel: o Claude opera o admin pelas ferramentas de
 * `ferramentasDoMcp.js`.
 *
 * ─── TRANSPORTE ────────────────────────────────────────────────────────────
 *
 * HTTP "streamable" do MCP, SEM ESTADO: cada `POST` traz uma mensagem JSON-RPC
 * e recebe a resposta em JSON. Não há sessão nem fluxo SSE, porque nenhuma
 * ferramenta precisa avisar nada depois de responder, e uma função serverless
 * não segura conexão aberta. `GET` e `DELETE` respondem 405, que é o que a
 * especificação manda para servidor que não oferece fluxo.
 *
 * Não usa função própria: `/mcp` é reescrito para `/api/posts?via=mcp` no
 * `vercel.json`. O plano tem teto de 12 funções: o MCP não gasta nenhuma, como
 * Carreiras já fez ao servir a página pela função da escrita.
 *
 * ─── IDENTIDADE ────────────────────────────────────────────────────────────
 *
 * Token pessoal no cabeçalho `Authorization: Bearer ccmcp_…`. Os tokens moram
 * na variável `MCP_TOKENS` da Vercel, como lista JSON de
 * `{ nome, conta, hash }`: `conta` é o id da Conta no Supabase (a mesma que
 * entra no Painel e tem linha em `perfis`), `hash` é o SHA-256 do token. O
 * token em si nunca é guardado. Gerar: `node scripts/gerar-token-do-mcp.mjs`.
 * Revogar: tirar a linha da variável e publicar de novo.
 *
 * Conferido o token, os executores do Painel recebem um `acesso` em que
 * `contaDoToken` responde com essa Conta. Todo o resto (perfil obrigatório,
 * regras de escrita) é o caminho de sempre.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { acessoDoAmbiente, lerAmbiente } from "./acesso.js";
import { FERRAMENTAS, Recusa } from "./ferramentasDoMcp.js";
import { criarLeitor, ehIdentificador } from "./leiturasDoMcp.js";

export const PREFIXO_DO_TOKEN = "ccmcp_";
export const VERSOES_DO_PROTOCOLO = Object.freeze(["2025-06-18", "2025-03-26", "2024-11-05"]);
const INFORMACOES_DO_SERVIDOR = Object.freeze({ name: "chatclean-painel", title: "Painel ChatClean", version: "1.0.0" });

const INSTRUCOES =
  "Ferramentas do Painel de conteúdo da ChatClean (blog, notícias em vídeo, vagas e métricas). " +
  "Posts novos nascem como rascunho. Antes de publicar, agendar, arquivar, excluir ou colocar algo no ar, " +
  "mostre à pessoa o que vai acontecer e espere a confirmação. Escreva o conteúdo em Markdown, em português do Brasil.";

/* ─── Tokens ─────────────────────────────────────────────────────────────── */

export function hashDoToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

/** As entradas válidas de `MCP_TOKENS`. Entrada malformada é ignorada e registrada. */
export function lerTokens(ambiente = {}) {
  const bruto = ambiente.MCP_TOKENS;
  if (typeof bruto !== "string" || bruto.trim() === "") return [];
  let lista;
  try {
    lista = JSON.parse(bruto);
  } catch {
    console.error("[mcp] MCP_TOKENS não é JSON; nenhum token aceito.");
    return [];
  }
  if (!Array.isArray(lista)) return [];
  return lista.filter((t, i) => {
    const valido =
      t && typeof t.nome === "string" && ehIdentificador(t.conta) && /^[0-9a-f]{64}$/.test(String(t.hash));
    if (!valido) console.error(`[mcp] MCP_TOKENS[${i}] ignorado: precisa de nome, conta (uuid) e hash (sha256).`);
    return valido;
  });
}

/** A entrada do token, ou `null`. Compara todos os hashes em tempo constante. */
export function tokenReconhecido(token, tokens) {
  if (typeof token !== "string" || !token.startsWith(PREFIXO_DO_TOKEN)) return null;
  const pedido = Buffer.from(hashDoToken(token), "hex");
  let achado = null;
  for (const t of tokens) {
    if (timingSafeEqual(pedido, Buffer.from(t.hash, "hex")) && achado === null) achado = t;
  }
  return achado;
}

/* ─── JSON-RPC ───────────────────────────────────────────────────────────── */

const ERRO_DE_FORMA = -32600;
const METODO_DESCONHECIDO = -32601;
const PARAMETROS_INVALIDOS = -32602;

const respostaRpc = (id, result) => ({ jsonrpc: "2.0", id, result });
const erroRpc = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function descricaoDaFerramenta(f) {
  return {
    name: f.nome,
    title: f.titulo,
    description: f.descricao,
    inputSchema: f.esquema,
    annotations: {
      title: f.titulo,
      readOnlyHint: Boolean(f.somenteLeitura),
      destructiveHint: Boolean(f.destrutiva),
      openWorldHint: false,
    },
  };
}

/** Confere os argumentos contra o esquema (o que o esquema daqui usa: tipos, enum, obrigatórios). */
export function problemaNosArgumentos(esquema, args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return "Os argumentos precisam ser um objeto.";
  for (const campo of esquema.required ?? []) {
    if (args[campo] === undefined || args[campo] === null || args[campo] === "") return `Falta o argumento "${campo}".`;
  }
  for (const [campo, valor] of Object.entries(args)) {
    const regra = esquema.properties?.[campo];
    if (!regra) return `Argumento desconhecido: "${campo}".`;
    if (valor === undefined) continue;
    const tipo = regra.type;
    const certo =
      (tipo === "string" && typeof valor === "string") ||
      (tipo === "boolean" && typeof valor === "boolean") ||
      (tipo === "integer" && Number.isInteger(valor)) ||
      (tipo === "array" && Array.isArray(valor) && valor.every((v) => typeof v === "string"));
    if (!certo) return `"${campo}" precisa ser ${tipo}.`;
    if (regra.enum && !regra.enum.includes(valor)) return `"${campo}" precisa ser um destes: ${regra.enum.join(", ")}.`;
    if (tipo === "integer" && regra.minimum !== undefined && valor < regra.minimum) return `"${campo}" é pequeno demais.`;
    if (tipo === "integer" && regra.maximum !== undefined && valor > regra.maximum) return `"${campo}" é grande demais.`;
  }
  return null;
}

function resultadoDeFerramenta(dados, erro = false) {
  const texto = typeof dados === "string" ? dados : JSON.stringify(dados, null, 2);
  return {
    content: [{ type: "text", text: texto }],
    ...(erro || typeof dados === "string" ? {} : { structuredContent: dados }),
    isError: erro,
  };
}

/**
 * Responde UMA mensagem JSON-RPC. Devolve o objeto de resposta, ou `null` para
 * notificação (que não tem resposta).
 */
export async function responderMensagem(mensagem, contexto) {
  if (!mensagem || mensagem.jsonrpc !== "2.0" || typeof mensagem.method !== "string") {
    return erroRpc(mensagem?.id, ERRO_DE_FORMA, "Mensagem JSON-RPC 2.0 inválida.");
  }
  const { id, method, params = {} } = mensagem;
  const notificacao = id === undefined;

  switch (method) {
    case "initialize": {
      const pedida = params?.protocolVersion;
      const versao = VERSOES_DO_PROTOCOLO.includes(pedida) ? pedida : VERSOES_DO_PROTOCOLO[0];
      return respostaRpc(id, {
        protocolVersion: versao,
        capabilities: { tools: { listChanged: false } },
        serverInfo: INFORMACOES_DO_SERVIDOR,
        instructions: INSTRUCOES,
      });
    }
    case "ping":
      return notificacao ? null : respostaRpc(id, {});
    case "tools/list":
      return respostaRpc(id, { tools: FERRAMENTAS.map(descricaoDaFerramenta) });
    case "tools/call": {
      const ferramenta = FERRAMENTAS.find((f) => f.nome === params?.name);
      if (!ferramenta) return erroRpc(id, PARAMETROS_INVALIDOS, `Ferramenta desconhecida: ${String(params?.name)}`);
      const args = params.arguments ?? {};
      const problema = problemaNosArgumentos(ferramenta.esquema, args);
      if (problema) return respostaRpc(id, resultadoDeFerramenta(problema, true));
      console.log(`[mcp] ${contexto.quem} → ${ferramenta.nome}${args.id ? ` (${args.id})` : ""}`);
      try {
        return respostaRpc(id, resultadoDeFerramenta(await ferramenta.executar(args, contexto)));
      } catch (excecao) {
        if (excecao instanceof Recusa) return respostaRpc(id, resultadoDeFerramenta(excecao.message, true));
        console.error(`[mcp] ${ferramenta.nome} falhou: ${String(excecao?.stack ?? excecao)}`);
        return respostaRpc(id, resultadoDeFerramenta("Erro inesperado no servidor. Tente de novo.", true));
      }
    }
    default:
      if (notificacao) return null; // notifications/initialized, cancelled… nada a responder
      return erroRpc(id, METODO_DESCONHECIDO, `Método não suportado: ${method}`);
  }
}

/* ─── HTTP ───────────────────────────────────────────────────────────────── */

function tokenDoPedido(req) {
  const bruto = req.headers?.authorization ?? req.headers?.Authorization ?? "";
  const m = /^Bearer[ \t]+(.+)$/i.exec(String(bruto).trim());
  return m ? m[1].trim() : "";
}

function corpoDoPedido(req) {
  const b = req.body;
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return undefined;
    }
  }
  if (b instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(b));
    } catch {
      return undefined;
    }
  }
  return b;
}

/** O contexto que as ferramentas recebem, montado depois de o token ser aceito. */
export function montarContexto({ entrada, acesso, leitor }) {
  // O executor confere o token com `acesso.contaDoToken`; aqui ele já foi
  // conferido, e a resposta é a Conta dona do token.
  const acessoDoToken = {
    ...acesso,
    contaDoToken: async () => ({ ok: true, status: 200, dados: { id: entrada.conta } }),
  };
  return {
    quem: entrada.nome,
    leitor,
    escrever: (executor, corpo) => executor({ token: "mcp", corpo, acesso: acessoDoToken }),
  };
}

/**
 * Na Vercel a reescrita de `/mcp` entrega `via=mcp` em `req.query`. O servidor
 * de desenvolvimento (`vite.config.js`) não monta `req.query`, então a URL
 * também é lida.
 */
export function ehPedidoDoMcp(req) {
  if (req.query?.via === "mcp") return true;
  try {
    return new URL(req.url ?? "", "http://local").searchParams.get("via") === "mcp";
  } catch {
    return false;
  }
}

/**
 * O ponto de entrada. `ambiente` e as fábricas são parâmetros para a
 * verificação poder exercitar o fluxo inteiro sem rede.
 */
export async function atenderMcp(req, res, { ambiente = process.env, fabricarAcesso = acessoDoAmbiente, fabricarLeitor = criarLeitor } = {}) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json(erroRpc(null, ERRO_DE_FORMA, "O MCP do Painel aceita apenas POST."));
    return;
  }

  const entrada = tokenReconhecido(tokenDoPedido(req), lerTokens(ambiente));
  if (entrada === null) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="Painel ChatClean"');
    res.status(401).json(erroRpc(null, ERRO_DE_FORMA, "Token do MCP ausente ou não reconhecido."));
    return;
  }

  const montagem = fabricarAcesso(ambiente);
  const config = lerAmbiente(ambiente);
  if (!montagem.ok || !config.ok) {
    console.error("[mcp] configuração do Supabase ausente ou inválida.");
    res.status(500).json(erroRpc(null, -32603, "O servidor está sem configuração. Avise quem cuida do Painel."));
    return;
  }
  const contexto = montarContexto({
    entrada,
    acesso: montagem.acesso,
    leitor: fabricarLeitor(config.config),
  });

  const corpo = corpoDoPedido(req);
  if (corpo === undefined || corpo === null) {
    res.status(400).json(erroRpc(null, -32700, "Corpo do pedido não é JSON."));
    return;
  }

  if (Array.isArray(corpo)) {
    const respostas = (await Promise.all(corpo.map((m) => responderMensagem(m, contexto)))).filter(Boolean);
    if (respostas.length === 0) res.status(202).end();
    else res.status(200).json(respostas);
    return;
  }
  const resposta = await responderMensagem(corpo, contexto);
  if (resposta === null) res.status(202).end();
  else res.status(200).json(resposta);
}
