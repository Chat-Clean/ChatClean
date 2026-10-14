/**
 * Markdown ↔ documento do Editor, para o MCP.
 *
 * O Claude escreve em Markdown; o Editor grava um documento JSON (Tiptap) num
 * vocabulário FECHADO (`src/domain/blog/schema.js`). Este módulo faz a ponte
 * nos dois sentidos e nada além disso:
 *
 *   * `documentoDoMarkdown` lê com o analisador do `marked` (só o léxico, nada
 *     de HTML) e monta os nós que o vocabulário conhece. O resultado passa por
 *     `validarDocumento`, a MESMA conferência do Editor, e o servidor ainda
 *     confere de novo ao gravar: esta ponte não é a guardiã de nada.
 *   * `markdownDoDocumento` devolve o texto para o Claude ler e editar.
 *
 * O que o Markdown tem e o vocabulário não tem vira texto simples, e não some:
 * título de nível 1 vira nível 2 (o nível 1 é o título do Post), de nível 4
 * em diante vira 3, código em linha vira texto, tabela e HTML viram parágrafo
 * com o texto cru. Imagem no corpo fica de fora, porque o vocabulário só aceita
 * imagem do nosso armazenamento, e é avisado.
 */

import { Lexer } from "marked";

import {
  VOCABULARIO_DO_POST,
  validarDocumento,
} from "../../src/domain/blog/schema.js";

/* ─── Markdown → documento ──────────────────────────────────────────────── */

function texto(t, marcas = []) {
  if (typeof t !== "string" || t === "") return null;
  return marcas.length > 0 ? { type: "text", text: t, marks: marcas } : { type: "text", text: t };
}

/** Desfaz as entidades que o léxico do `marked` deixa no texto. */
function semEntidades(t) {
  return String(t ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function emLinha(tokens, marcas, avisos) {
  const saida = [];
  for (const tk of tokens ?? []) {
    switch (tk.type) {
      case "strong":
        saida.push(...emLinha(tk.tokens, [...marcas, { type: "bold" }], avisos));
        break;
      case "em":
        saida.push(...emLinha(tk.tokens, [...marcas, { type: "italic" }], avisos));
        break;
      case "link":
        saida.push(
          ...emLinha(tk.tokens, [...marcas, { type: "link", attrs: { href: tk.href } }], avisos),
        );
        break;
      case "br":
        saida.push({ type: "hardBreak" });
        break;
      case "image":
        avisos.add(
          "Imagens no corpo não entram pelo MCP: o Editor só aceita imagem enviada ao armazenamento do site. O texto alternativo ficou no lugar.",
        );
        if (tk.text) saida.push(texto(semEntidades(tk.text), marcas));
        break;
      case "text":
      case "escape":
      case "codespan":
      case "html":
      case "del":
        if (Array.isArray(tk.tokens) && tk.tokens.length > 0 && tk.type !== "codespan") {
          saida.push(...emLinha(tk.tokens, marcas, avisos));
        } else {
          saida.push(texto(semEntidades(tk.text ?? tk.raw), marcas));
        }
        break;
      default:
        saida.push(texto(semEntidades(tk.raw), marcas));
    }
  }
  return saida.filter(Boolean);
}

function paragrafo(conteudo) {
  return conteudo.length > 0 ? { type: "paragraph", content: conteudo } : null;
}

function blocos(tokens, avisos) {
  const saida = [];
  for (const tk of tokens ?? []) {
    switch (tk.type) {
      case "space":
        break;
      case "heading": {
        const nivel = tk.depth <= 2 ? 2 : 3;
        const conteudo = emLinha(tk.tokens, [], avisos);
        if (conteudo.length > 0) saida.push({ type: "heading", attrs: { level: nivel }, content: conteudo });
        break;
      }
      case "paragraph":
        saida.push(paragrafo(emLinha(tk.tokens, [], avisos)));
        break;
      case "text":
        // Texto solto de item de lista "apertado" chega como `text` com filhos.
        saida.push(paragrafo(emLinha(tk.tokens ?? [tk], [], avisos)));
        break;
      case "blockquote": {
        const filhos = blocos(tk.tokens, avisos);
        if (filhos.length > 0) saida.push({ type: "blockquote", content: filhos });
        break;
      }
      case "list": {
        const itens = tk.items
          .map((item) => {
            const filhos = blocos(item.tokens, avisos);
            return filhos.length > 0 ? { type: "listItem", content: filhos } : null;
          })
          .filter(Boolean);
        if (itens.length === 0) break;
        if (tk.ordered) {
          const inicio = Number.isInteger(tk.start) && tk.start > 1 ? tk.start : 1;
          saida.push({ type: "orderedList", attrs: { start: inicio }, content: itens });
        } else {
          saida.push({ type: "bulletList", content: itens });
        }
        break;
      }
      case "code":
        saida.push({
          type: "codeBlock",
          attrs: { language: tk.lang ? String(tk.lang).trim() || null : null },
          content: tk.text ? [{ type: "text", text: tk.text }] : [],
        });
        break;
      case "hr":
        saida.push({ type: "horizontalRule" });
        break;
      default:
        // Tabela, HTML em bloco e o que mais vier: o texto cru, como parágrafo.
        if (typeof tk.raw === "string" && tk.raw.trim() !== "") {
          avisos.add(`Um bloco do tipo "${tk.type}" não existe no Editor e entrou como texto simples.`);
          saida.push(paragrafo([texto(tk.raw.trim())].filter(Boolean)));
        }
    }
  }
  return saida.filter(Boolean);
}

/**
 * `{ ok: true, documento, avisos }` ou `{ ok: false, mensagem }`.
 *
 * `vocabulario` é o do Post por padrão; a descrição da Vaga passa o dela, e o
 * que ela não aceita (código, citação, linha) cai na validação, com aviso.
 */
export function documentoDoMarkdown(markdown, vocabulario = VOCABULARIO_DO_POST) {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    return { ok: false, mensagem: "O conteúdo veio vazio. Escreva o texto em Markdown." };
  }
  const avisos = new Set();
  let tokens;
  try {
    tokens = new Lexer({ gfm: true }).lex(markdown);
  } catch (excecao) {
    return { ok: false, mensagem: `Não consegui ler o Markdown: ${String(excecao?.message ?? excecao)}` };
  }
  const bruto = { type: "doc", content: blocos(tokens, avisos) };
  const validado = validarDocumento(bruto, vocabulario);
  if (!validado.ok) return { ok: false, mensagem: validado.erro?.mensagem ?? "Conteúdo fora do formato." };
  if (validado.totalDescartado > 0) {
    avisos.add(
      `${validado.totalDescartado} trecho(s) não cabem no Editor e ficaram de fora (${validado.descartados
        .map((d) => d.nome)
        .join(", ")}).`,
    );
  }
  return { ok: true, documento: validado.documento, avisos: [...avisos] };
}

/* ─── Documento → Markdown ──────────────────────────────────────────────── */

function escapar(t) {
  return String(t).replace(/([\\*_`[\]])/g, "\\$1");
}

function linhaDeTexto(nos) {
  let s = "";
  for (const no of nos ?? []) {
    if (no.type === "hardBreak") {
      s += "  \n";
      continue;
    }
    if (no.type === "image") {
      s += `![${no.attrs?.alt ?? ""}](${no.attrs?.src ?? ""})`;
      continue;
    }
    if (no.type !== "text") continue;
    let t = escapar(no.text ?? "");
    const marcas = no.marks ?? [];
    if (marcas.some((m) => m.type === "italic")) t = `*${t}*`;
    if (marcas.some((m) => m.type === "bold")) t = `**${t}**`;
    const link = marcas.find((m) => m.type === "link");
    if (link?.attrs?.href) t = `[${t}](${link.attrs.href})`;
    s += t;
  }
  return s;
}

function prefixar(texto, primeiro, demais) {
  return texto
    .split("\n")
    .map((linha, i) => (linha === "" ? "" : (i === 0 ? primeiro : demais) + linha))
    .join("\n");
}

function blocoParaMarkdown(no) {
  switch (no.type) {
    case "paragraph":
      return linhaDeTexto(no.content);
    case "heading":
      return `${"#".repeat(no.attrs?.level ?? 2)} ${linhaDeTexto(no.content)}`;
    case "blockquote":
      return prefixar(listaDeBlocos(no.content), "> ", "> ");
    case "bulletList":
      return (no.content ?? [])
        .map((item) => prefixar(listaDeBlocos(item.content), "- ", "  "))
        .join("\n");
    case "orderedList": {
      const inicio = no.attrs?.start ?? 1;
      return (no.content ?? [])
        .map((item, i) => prefixar(listaDeBlocos(item.content), `${inicio + i}. `, "   "))
        .join("\n");
    }
    case "codeBlock":
      return `\`\`\`${no.attrs?.language ?? ""}\n${(no.content ?? []).map((t) => t.text ?? "").join("")}\n\`\`\``;
    case "horizontalRule":
      return "---";
    case "image":
      return `![${no.attrs?.alt ?? ""}](${no.attrs?.src ?? ""})`;
    default:
      return linhaDeTexto(no.content);
  }
}

function listaDeBlocos(nos) {
  return (nos ?? []).map(blocoParaMarkdown).filter((b) => b !== "").join("\n\n");
}

/** O documento gravado, como Markdown. Documento ausente vira texto vazio. */
export function markdownDoDocumento(documento) {
  if (!documento || typeof documento !== "object") return "";
  return listaDeBlocos(documento.content);
}
