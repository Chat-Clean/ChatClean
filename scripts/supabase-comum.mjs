/**
 * Peças compartilhadas pelos utilitários de Supabase da Story 1.2:
 * o cliente da Management API, a leitura do token e o leitor de SQL que a
 * verificação estática usa.
 *
 * O MCP do Supabase é somente-leitura por configuração (`create schema` falha
 * com `25006: cannot execute CREATE SCHEMA in a read-only transaction`), então
 * ele serve para inspecionar, nunca para aplicar. A aplicação vai pela
 * Management API com `Bearer $SUPABASE_ACCESS_TOKEN`.
 *
 * **O token nunca é impresso.** Ele só sai daqui dentro de um cabeçalho HTTP;
 * toda mensagem que chega ao console passa por `sanitizar()`.
 */

import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Projeto alvo. O padrão é o projeto deste trabalho; `SUPABASE_PROJECT_REF` e
 * `SUPABASE_PROJECT_NOME` permitem apontar para outro (staging, projeto de
 * outro dev) sem editar código — sem isso, um clone limpo só saberia falar
 * com um projeto específico.
 */
export const REF_PROJETO =
  (process.env.SUPABASE_PROJECT_REF ?? "").trim() || "rkoxomfgkloukitqizma";
export const NOME_PROJETO =
  (process.env.SUPABASE_PROJECT_NOME ?? "").trim() || "blog-chatclean";
export const URL_PROJETO = `https://${REF_PROJETO}.supabase.co`;
export const API = "https://api.supabase.com/v1";

/** Nenhuma chamada pendura o processo para sempre. */
export const TIMEOUT_MS = 30000;

export const raiz = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const dirMigracoes = path.join(raiz, "supabase", "migrations");

/* ─── Parada ─────────────────────────────────────────────────────────────── */

/**
 * Erro de parada: quem chama `parar()` interrompe o fluxo e o topo do script
 * decide o código de saída.
 *
 * Por que não `process.exit()`: no Windows, encerrar o processo com socket de
 * `fetch` ainda aberto dispara `Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)` no libuv e o código de saída vira lixo — verificado, a
 * simulação imprimia tudo certo e devolvia `-1073740791`. Uma ferramenta de
 * verificação cujo código de saída não é confiável não verifica nada. Setar
 * `process.exitCode` e deixar o laço de eventos drenar sai limpo.
 */
export class Parada extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "Parada";
  }
}

export function parar(mensagem) {
  throw new Parada(mensagem);
}

/**
 * Executa o corpo do script e traduz `Parada` em código de saída 1, sem nunca
 * chamar `process.exit()`.
 */
export async function executarScript(corpo) {
  try {
    await corpo();
  } catch (erro) {
    if (erro instanceof Parada) {
      console.error(`\nFALHA  ${sanitizar(erro.message)}`);
      process.exitCode = 1;
      return;
    }
    console.error(`\nFALHA  erro inesperado: ${sanitizar(erro?.stack ?? erro)}`);
    process.exitCode = 1;
  }
}

/* ─── Token ──────────────────────────────────────────────────────────────── */

export function lerToken() {
  const bruto = process.env.SUPABASE_ACCESS_TOKEN;
  const token = typeof bruto === "string" ? bruto.trim() : "";
  return token === "" ? null : token;
}

/**
 * Outros segredos que passam por estes scripts em tempo de execução.
 *
 * O token de conta não é o único: a criação de Conta interpola a SENHA num
 * comando SQL, e erro de Postgres costuma ecoar um trecho do comando que
 * falhou. Sem registrá-la aqui, uma falha de sintaxe imprimiria a senha da
 * pessoa no console — e daí no histórico do terminal e no log de CI.
 */
const segredos = new Set();

/**
 * Passa a ocultar `valor` em toda saída sanitizada.
 *
 * O piso de comprimento não é zelo: registrar uma cadeia curta ou comum faria
 * `sanitizar` mutilar mensagens legítimas, e uma saída ilegível é tão ruim
 * quanto uma vazada.
 */
export function registrarSegredo(valor) {
  const s = typeof valor === "string" ? valor : "";
  if (s.length >= 6) segredos.add(s);
}

/**
 * Remove qualquer eco de segredo de um texto antes de ele chegar ao console.
 * Segunda trava: nada aqui imprime segredo de propósito, mas resposta de erro
 * de API às vezes devolve o que recebeu.
 */
export function sanitizar(texto) {
  let s = String(texto ?? "");
  const token = lerToken();
  if (token) s = s.split(token).join("«token oculto»");
  for (const segredo of segredos) {
    s = s.split(segredo).join("«segredo oculto»");
  }
  return s;
}

/* ─── Management API ─────────────────────────────────────────────────────── */

/**
 * A Management API às vezes responde uma página de erro em HTML no lugar do
 * JSON — instabilidade momentânea, não defeito do projeto.
 *
 * Observado duas vezes: a asserção falhava com o texto `<!DOCTYPE html>` e
 * arrastava sete outras em cascata, e a execução seguinte passava sem
 * nenhuma alteração. Falhar é melhor que passar em falso, mas falha que não é
 * falha ensina a pessoa a ignorar falhas — que é o pior desfecho possível para
 * uma suíte inteira construída sobre a ideia de que verde significa algo.
 *
 * Daí a nova tentativa: só para resposta que não é JSON e para 5xx, com espera
 * curta. Erro real da API responde JSON com mensagem e não entra aqui.
 */
const TENTATIVAS = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 700;

const ehHtml = (texto) => /^\s*<(?:!doctype|html)\b/i.test(String(texto ?? ""));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function chamar(token, caminho, opcoes = {}) {
  let ultima = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    const resultado = await chamarUmaVez(token, caminho, opcoes);
    // Só instabilidade é repetida. Recusa legítima (4xx com JSON) sai na hora,
    // senão uma escrita negada demoraria três vezes mais para ser reportada.
    const instavel =
      resultado.instavel === true ||
      (resultado.ok === false && resultado.status >= 500);
    if (!instavel || tentativa === TENTATIVAS) {
      if (resultado.instavel && tentativa === TENTATIVAS) {
        return {
          ...resultado,
          erro: `${resultado.erro} (${TENTATIVAS} tentativas; a Management API não devolveu JSON — instabilidade, não defeito do schema)`,
        };
      }
      return resultado;
    }
    ultima = resultado;
    await esperar(ESPERA_ENTRE_TENTATIVAS_MS * tentativa);
  }
  return ultima;
}

async function chamarUmaVez(token, caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      ...opcoes,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(opcoes.headers ?? {}),
      },
    });
  } catch (erro) {
    // Falha de rede, DNS, TLS ou estouro de tempo. Vira erro de dados em vez
    // de rejeição solta: quem chama trata `{ ok: false }`, e nenhuma asserção
    // some por exceção não capturada.
    return {
      ok: false,
      status: 0,
      instavel: true,
      erro: sanitizar(`falha de rede em ${caminho}: ${erro?.message ?? erro}`),
    };
  }
  const texto = await resposta.text();
  let corpo = null;
  let eraJson = true;
  try {
    corpo = texto === "" ? null : JSON.parse(texto);
  } catch {
    corpo = texto;
    eraJson = false;
  }
  // Resposta em HTML é página de erro da borda, não resposta da API — mesmo
  // quando vem com status 200.
  if (!eraJson && ehHtml(texto)) {
    return {
      ok: false,
      status: resposta.status,
      instavel: true,
      erro: sanitizar(
        `a Management API respondeu HTML em ${caminho} (HTTP ${resposta.status})`,
      ),
    };
  }
  if (!resposta.ok) {
    const detalhe =
      corpo && typeof corpo === "object" && corpo.message
        ? corpo.message
        : String(texto).slice(0, 500);
    return { ok: false, status: resposta.status, erro: sanitizar(detalhe) };
  }
  return { ok: true, status: resposta.status, dados: corpo };
}

/**
 * Executa SQL no banco do projeto.
 *
 * O endpoint é transacional: um erro no meio do corpo desfaz o que veio antes
 * (verificado — `create table …; select 1/0;` não deixa a tabela para trás).
 * É o que sustenta "erro de SQL aborta sem aplicar parcialmente o arquivo".
 */
export function executarSql(token, sql) {
  return chamar(token, `/projects/${REF_PROJETO}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: sql }),
  });
}

/**
 * Revela as chaves de API do projeto — inclusive a de SERVIÇO.
 *
 * Existe porque a chave de serviço não está no ambiente e não deve estar: ela é
 * segredo de escrita, e colocá-la numa variável de sessão do desenvolvedor a
 * espalharia pelo histórico do shell e pelo log de CI. A Management API a revela
 * sob demanda, com o token de conta que o ambiente já tem, e quem chama a mantém
 * **em memória** — registrada como segredo antes de qualquer uso.
 *
 * Devolve `{ ok: true, publicavel, servico }`. `servico` prefere a chave
 * `secret` (formato novo, `sb_secret_…`) e recai na `service_role` legada
 * (JWT), porque projetos criados em épocas diferentes têm uma ou outra.
 */
export async function revelarChaves(token) {
  const r = await chamar(token, `/projects/${REF_PROJETO}/api-keys?reveal=true`);
  if (!r.ok) return r;
  const lista = Array.isArray(r.dados) ? r.dados : [];
  const de = (predicado) => lista.find(predicado)?.api_key ?? null;
  const publicavel = de((k) => k.type === "publishable") ?? de((k) => k.id === "anon");
  const servico = de((k) => k.type === "secret") ?? de((k) => k.id === "service_role");
  for (const chave of [publicavel, servico]) registrarSegredo(chave ?? "");
  return { ok: true, status: r.status, publicavel, servico };
}

export function lerConfigAuth(token) {
  return chamar(token, `/projects/${REF_PROJETO}/config/auth`);
}

export function alterarConfigAuth(token, alteracoes) {
  return chamar(token, `/projects/${REF_PROJETO}/config/auth`, {
    method: "PATCH",
    body: JSON.stringify(alteracoes),
  });
}

/* ─── Literais de SQL ────────────────────────────────────────────────────── */

/** Literal de texto seguro. `standard_conforming_strings` é `on` no Postgres. */
export function literal(valor) {
  return `'${String(valor).replace(/'/g, "''")}'`;
}

export function literalArray(valores) {
  if (valores.length === 0) return "array[]::text[]";
  return `array[${valores.map(literal).join(",")}]::text[]`;
}

/* ─── Migrações ──────────────────────────────────────────────────────────── */

/** `<14 dígitos>_<nome>.sql`, o formato que o CLI do Supabase produz e lê. */
export const PADRAO_MIGRACAO = /^(\d{14})_([A-Za-z0-9][A-Za-z0-9_-]*)\.sql$/;

/**
 * Valida o carimbo `AAAAMMDDHHMMSS` como instante real — `20261340999999`
 * casa com a regex e não é data alguma.
 */
export function carimboValido(carimbo) {
  if (!/^\d{14}$/.test(carimbo)) return false;
  const n = (i, tam) => Number(carimbo.slice(i, i + tam));
  const [ano, mes, dia, hora, min, seg] = [
    n(0, 4),
    n(4, 2),
    n(6, 2),
    n(8, 2),
    n(10, 2),
    n(12, 2),
  ];
  if (ano < 2000 || ano > 2999) return false;
  if (mes < 1 || mes > 12) return false;
  if (hora > 23 || min > 59 || seg > 59) return false;
  const data = new Date(Date.UTC(ano, mes - 1, dia, hora, min, seg));
  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

/** Arquivos de `supabase/migrations`, em ordem lexicográfica (= cronológica). */
export function listarMigracoes() {
  let entradas;
  try {
    entradas = readdirSync(dirMigracoes, { withFileTypes: true });
  } catch {
    return [];
  }
  return entradas
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".sql"))
    .map((e) => e.name)
    .sort()
    .map((nome) => {
      const casou = PADRAO_MIGRACAO.exec(nome);
      return {
        nome,
        caminho: path.join(dirMigracoes, nome),
        versao: casou ? casou[1] : null,
        rotulo: casou ? casou[2] : null,
        valida: Boolean(casou) && carimboValido(casou[1]),
      };
    });
}

/* ─── Leitor de SQL ──────────────────────────────────────────────────────── */

/**
 * Troca comentários, literais de texto e corpos com aspas-cifrão (`$$…$$`) por
 * espaços, preservando o comprimento. A verificação estática lê esta cópia:
 * sem ela, a palavra `insert` dentro de um comentário viraria política de
 * escrita, e o corpo de uma função apareceria como comando solto.
 */
export function mascararSql(sql) {
  return analisarSql(sql).mascara;
}

/**
 * Como `mascararSql`, mas também devolve os problemas encontrados.
 *
 * Sem isto, um literal ou um bloco `$$` sem fechamento faz o mascarador
 * branquear o resto do arquivo em silêncio: o leitor enxerga zero comando e
 * toda asserção estática passa por vacuidade — verde justamente sobre o
 * arquivo quebrado. Agora o desequilíbrio é reportado.
 */
export function analisarSql(sql) {
  const problemas = [];
  const n = sql.length;
  let saida = "";
  let i = 0;
  const branco = (ate) => {
    saida += sql.slice(i, ate).replace(/[^\n]/g, " ");
    i = ate;
  };
  const linhaDe = (pos) => sql.slice(0, pos).split("\n").length;
  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") {
      const fim = sql.indexOf("\n", i);
      branco(fim === -1 ? n : fim);
    } else if (c === "/" && sql[i + 1] === "*") {
      // Comentário de bloco em SQL aninha.
      let profundidade = 1;
      let j = i + 2;
      while (j < n && profundidade > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          profundidade += 1;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          profundidade -= 1;
          j += 2;
        } else j += 1;
      }
      if (profundidade > 0) {
        problemas.push(`comentário de bloco sem fechamento na linha ${linhaDe(i)}`);
      }
      branco(j);
    } else if (c === "'") {
      // `E'…'` aceita barra invertida como escape; literal comum, não.
      const comEscape = /[Ee]$/.test(sql.slice(Math.max(0, i - 1), i));
      let j = i + 1;
      let fechou = false;
      while (j < n) {
        if (comEscape && sql[j] === "\\") j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") {
          j += 1;
          fechou = true;
          break;
        } else j += 1;
      }
      if (!fechou) {
        problemas.push(`literal de texto sem fechamento na linha ${linhaDe(i)}`);
      }
      branco(Math.min(j, n));
    } else if (c === '"') {
      // Identificador entre aspas: não é comentário nem texto, mas pode conter
      // ponto e vírgula, e precisa sobreviver à divisão em comandos. `""` é
      // aspa escapada e não encerra o identificador.
      let j = i + 1;
      let fechou = false;
      while (j < n) {
        if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
        else if (sql[j] === '"') {
          j += 1;
          fechou = true;
          break;
        } else j += 1;
      }
      if (!fechou) {
        problemas.push(`identificador entre aspas sem fechamento na linha ${linhaDe(i)}`);
      }
      // O ponto e vírgula vira espaço para não dividir o comando ao meio; o
      // resto do identificador é preservado.
      saida += sql.slice(i, Math.min(j, n)).replace(/;/g, " ");
      i = Math.min(j, n);
    } else if (c === "$") {
      const marca = /^\$[A-Za-z_]?[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (marca) {
        const fim = sql.indexOf(marca[0], i + marca[0].length);
        if (fim === -1) {
          problemas.push(
            `bloco ${marca[0]} sem fechamento a partir da linha ${linhaDe(i)}`,
          );
        }
        branco(fim === -1 ? n : fim + marca[0].length);
      } else {
        saida += c;
        i += 1;
      }
    } else {
      saida += c;
      i += 1;
    }
  }
  return { mascara: saida, problemas };
}

/**
 * Divide o SQL em comandos. Devolve, para cada um, o texto original (`bruto`)
 * e a versão mascarada em minúsculas (`limpo`), que é sobre a qual toda
 * asserção estática decide.
 */
export function comandosSql(sql) {
  const mascara = mascararSql(sql);
  const comandos = [];
  let inicio = 0;
  for (let i = 0; i < mascara.length; i += 1) {
    if (mascara[i] === ";") {
      comandos.push([inicio, i]);
      inicio = i + 1;
    }
  }
  if (inicio < mascara.length) comandos.push([inicio, mascara.length]);
  return comandos
    .map(([a, b]) => ({
      bruto: sql.slice(a, b).trim(),
      limpo: mascara.slice(a, b).trim().replace(/\s+/g, " ").toLowerCase(),
    }))
    .filter((cmd) => cmd.limpo !== "");
}
