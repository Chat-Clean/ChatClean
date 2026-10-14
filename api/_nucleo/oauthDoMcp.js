/**
 * OAuth do MCP: o Claude se conecta ao Painel com a conta de quem está logado.
 *
 * O fluxo é o que o MCP pede (OAuth 2.1 com PKCE), na forma mais simples que o
 * claude.ai e o Claude Code aceitam:
 *
 *   1. o cliente bate em /mcp sem token, recebe 401 e o endereço dos metadados;
 *   2. lê os metadados e se registra (`/mcp/registrar`, registro dinâmico);
 *   3. abre `/admin/conectar-claude` no navegador. Quem está logado no Painel vê
 *      "Autorizar o Claude" e clica; a tela pede o código a `/mcp/autorizar`
 *      com a sessão do Painel e devolve o navegador ao cliente;
 *   4. o cliente troca o código por tokens em `/mcp/token`.
 *
 * ─── SEM TABELA ────────────────────────────────────────────────────────────
 *
 * Nada é guardado. O `client_id`, o código e os tokens são ASSINADOS (HMAC) com
 * uma chave derivada da chave de serviço do Supabase, e carregam dentro o que
 * precisam (Conta, endereço de retorno, desafio do PKCE, validade). Trocar a
 * chave de serviço invalida todas as conexões de uma vez; é o "revogar tudo".
 *
 * A Conta que autorizou é a autora de tudo que o Claude fizer, e ela precisa
 * ter perfil no Painel: conferido ao autorizar e a cada renovação (de hora em
 * hora), e de novo pelo executor em toda escrita.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PREFIXO_OAUTH = "ccoa.";
const VALIDADE_DO_CODIGO_S = 5 * 60;
const VALIDADE_DO_ACESSO_S = 60 * 60;
const VALIDADE_DA_RENOVACAO_S = 60 * 24 * 60 * 60;

/* ─── Endereços ──────────────────────────────────────────────────────────── */

/** `https://chatclean.com.br`, ou o host da prévia/desenvolvimento que recebeu o pedido. */
export function baseDoPedido(req) {
  const cab = req.headers ?? {};
  const host = String(cab["x-forwarded-host"] ?? cab.host ?? "chatclean.com.br").split(",")[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = String(cab["x-forwarded-proto"] ?? (local ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}

export const ROTA_DA_AUTORIZACAO = "/admin/conectar-claude";

export function metadadosDoRecurso(base) {
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    resource_name: "Painel ChatClean",
  };
}

export function metadadosDoServidor(base) {
  return {
    issuer: base,
    authorization_endpoint: `${base}${ROTA_DA_AUTORIZACAO}`,
    token_endpoint: `${base}/mcp/token`,
    registration_endpoint: `${base}/mcp/registrar`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

/**
 * Para onde o navegador pode voltar. Só o Claude: claude.ai/claude.com, e a
 * porta local que o Claude Code abre. Um app qualquer não consegue se passar
 * pelo Claude para receber o código de quem clicar em "Autorizar".
 */
export function retornoPermitido(uri) {
  let url;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:" && /^(?:[a-z0-9-]+\.)*claude\.(?:ai|com)$/.test(url.hostname)) return true;
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

/* ─── Assinatura ─────────────────────────────────────────────────────────── */

function chaveDe(ambiente) {
  const servico = ambiente?.SUPABASE_CHAVE_DE_SERVICO;
  if (typeof servico !== "string" || servico.trim() === "") return null;
  return createHmac("sha256", servico.trim()).update("chatclean-mcp-oauth-v1").digest();
}

const b64 = (texto) => Buffer.from(texto, "utf8").toString("base64url");
const deB64 = (texto) => Buffer.from(texto, "base64url").toString("utf8");

export function assinar(conteudo, ambiente) {
  const chave = chaveDe(ambiente);
  if (!chave) throw new Error("SUPABASE_CHAVE_DE_SERVICO ausente: sem chave para assinar.");
  const corpo = b64(JSON.stringify(conteudo));
  const assinatura = createHmac("sha256", chave).update(corpo).digest("base64url");
  return `${PREFIXO_OAUTH}${corpo}.${assinatura}`;
}

/** O conteúdo, se a assinatura confere, o tipo é o pedido e não venceu. Senão `null`. */
export function verificar(token, tipo, ambiente, agora = Date.now()) {
  const chave = chaveDe(ambiente);
  if (!chave || typeof token !== "string" || !token.startsWith(PREFIXO_OAUTH)) return null;
  const [corpo, assinatura] = token.slice(PREFIXO_OAUTH.length).split(".");
  if (!corpo || !assinatura) return null;
  const esperada = createHmac("sha256", chave).update(corpo).digest();
  const recebida = Buffer.from(assinatura, "base64url");
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;
  let conteudo;
  try {
    conteudo = JSON.parse(deB64(corpo));
  } catch {
    return null;
  }
  if (conteudo?.t !== tipo) return null;
  if (typeof conteudo.exp !== "number" || conteudo.exp * 1000 < agora) return null;
  return conteudo;
}

const agoraS = () => Math.floor(Date.now() / 1000);
const resumo = (texto) => createHash("sha256").update(String(texto)).digest("base64url").slice(0, 22);

/* ─── Registro dinâmico ──────────────────────────────────────────────────── */

export function registrarCliente(pedido, ambiente) {
  const uris = Array.isArray(pedido?.redirect_uris) ? pedido.redirect_uris.filter((u) => typeof u === "string") : [];
  if (uris.length === 0 || !uris.every(retornoPermitido)) {
    return {
      status: 400,
      corpo: {
        error: "invalid_redirect_uri",
        error_description: "Só o Claude (claude.ai, claude.com ou o Claude Code local) pode se conectar a este Painel.",
      },
    };
  }
  const nome = typeof pedido.client_name === "string" ? pedido.client_name.slice(0, 80) : "Claude";
  const client_id = assinar({ t: "cliente", ru: uris, nome, exp: agoraS() + 10 * 365 * 24 * 3600 }, ambiente);
  return {
    status: 201,
    corpo: {
      client_id,
      client_id_issued_at: agoraS(),
      client_name: nome,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

/** O nome do cliente para a tela de autorização mostrar. Só exibição: quem decide é `autorizar`. */
export function nomeDoClienteParaExibir(clientId) {
  try {
    const corpo = String(clientId).slice(PREFIXO_OAUTH.length).split(".")[0];
    return JSON.parse(deB64(corpo)).nome ?? "Claude";
  } catch {
    return "Claude";
  }
}

/* ─── Autorização (a tela do Painel chama com a sessão de quem está logado) ─ */

function comRetorno(uri, parametros) {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(parametros)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  return url.toString();
}

/**
 * `pedido`: `{ client_id, redirect_uri, code_challenge, code_challenge_method, state, negar }`.
 * `identificar(token)`: a Conta e o nome de quem está logado, ou `null`.
 * Devolve `{ status, corpo }`; em sucesso `corpo.redirecionar` é para onde o navegador vai.
 */
export async function autorizar({ pedido, tokenDaSessao, ambiente, identificar }) {
  const cliente = verificar(pedido?.client_id, "cliente", ambiente);
  const retorno = pedido?.redirect_uri;
  if (!cliente || typeof retorno !== "string" || !cliente.ru.includes(retorno) || !retornoPermitido(retorno)) {
    // Sem cliente válido não há para onde devolver com segurança: o erro fica na tela.
    return { status: 400, corpo: { erro: "Este pedido de conexão não é válido. Comece de novo pelo Claude." } };
  }
  if (pedido.negar === true) {
    return { status: 200, corpo: { redirecionar: comRetorno(retorno, { error: "access_denied", state: pedido.state }) } };
  }
  if (pedido.code_challenge_method !== "S256" || typeof pedido.code_challenge !== "string" || pedido.code_challenge.length < 43) {
    return { status: 200, corpo: { redirecionar: comRetorno(retorno, { error: "invalid_request", error_description: "PKCE S256 obrigatório", state: pedido.state }) } };
  }
  const quem = await identificar(tokenDaSessao);
  if (!quem) return { status: 401, corpo: { erro: "Sua sessão no Painel expirou. Entre de novo e autorize." } };

  const code = assinar(
    {
      t: "codigo",
      conta: quem.conta,
      nome: quem.nome,
      cid: resumo(pedido.client_id),
      ru: retorno,
      cc: pedido.code_challenge,
      exp: agoraS() + VALIDADE_DO_CODIGO_S,
    },
    ambiente,
  );
  return { status: 200, corpo: { redirecionar: comRetorno(retorno, { code, state: pedido.state }) } };
}

/* ─── Token ──────────────────────────────────────────────────────────────── */

function parDeTokens({ conta, nome, cid }, ambiente) {
  return {
    access_token: assinar({ t: "acesso", conta, nome, exp: agoraS() + VALIDADE_DO_ACESSO_S }, ambiente),
    token_type: "Bearer",
    expires_in: VALIDADE_DO_ACESSO_S,
    refresh_token: assinar({ t: "renovacao", conta, nome, cid, exp: agoraS() + VALIDADE_DA_RENOVACAO_S }, ambiente),
  };
}

const erroDeToken = (error, error_description) => ({ status: 400, corpo: { error, error_description } });

/**
 * `pedido`: os campos do formulário de /token. `aindaTemPerfil(conta)` confere
 * no banco se a Conta continua no Painel (na renovação).
 */
export async function trocarToken({ pedido, ambiente, aindaTemPerfil }) {
  const tipo = pedido?.grant_type;
  if (tipo === "authorization_code") {
    const codigo = verificar(pedido.code, "codigo", ambiente);
    if (!codigo) return erroDeToken("invalid_grant", "Código inválido ou vencido.");
    if (codigo.ru !== pedido.redirect_uri) return erroDeToken("invalid_grant", "redirect_uri diferente do autorizado.");
    if (pedido.client_id && resumo(pedido.client_id) !== codigo.cid) return erroDeToken("invalid_grant", "client_id diferente do autorizado.");
    const desafio = createHash("sha256").update(String(pedido.code_verifier ?? "")).digest("base64url");
    if (desafio !== codigo.cc) return erroDeToken("invalid_grant", "code_verifier não confere (PKCE).");
    return { status: 200, corpo: parDeTokens(codigo, ambiente) };
  }
  if (tipo === "refresh_token") {
    const renovacao = verificar(pedido.refresh_token, "renovacao", ambiente);
    if (!renovacao) return erroDeToken("invalid_grant", "Renovação inválida ou vencida. Conecte de novo.");
    if (!(await aindaTemPerfil(renovacao.conta))) {
      return erroDeToken("invalid_grant", "Esta conta não está mais no Painel.");
    }
    return { status: 200, corpo: parDeTokens(renovacao, ambiente) };
  }
  return erroDeToken("unsupported_grant_type", "Use authorization_code ou refresh_token.");
}

/** A Conta de um token de acesso OAuth, no formato das entradas de token do MCP. */
export function entradaDoAcesso(token, ambiente) {
  const acesso = verificar(token, "acesso", ambiente);
  return acesso ? { nome: acesso.nome ?? "Claude", conta: acesso.conta } : null;
}
