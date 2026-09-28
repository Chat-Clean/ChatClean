/**
 * O HTML Servido de Carreiras: `/carreiras` e `/carreiras/:slug` (Story 5.8).
 *
 * ─── O MESMO PIPELINE DO BLOG, SEM COPIÁ-LO ───────────────────────────────
 *
 * A página é o SHELL DO BUILD (`lerShell`) com duas regiões trocadas inteiras
 * (`trocarRegiao`): a de metadados (`regiaoDeMetadados`) e a do corpo
 * (`CORPO-DO-ARTIGO`), que vem ANTES de `<div id="root">` e leva o
 * `<noscript>` e o `JobPosting`. Status, cache, etiquetas e diagnóstico passam
 * por `responderDocumento`. Tudo isso é IMPORTADO do Blog; o que mora aqui é
 * só a decisão de Carreiras: que status cada situação tem, que metadado e que
 * corpo cada página declara.
 *
 * ─── A CANÔNICA VEM DO BANCO, NUNCA DA REQUISIÇÃO ─────────────────────────
 *
 * O caminho que chega em `req.url` é o desta função (`/api/carreiras`), e o
 * Slug da consulta é o que o visitante digitou. A canônica é o Domínio
 * Canônico mais o caminho montado com o Slug que o BANCO devolveu
 * (`enderecoDaPaginaDaVaga`).
 *
 * ─── FALHA DE LEITURA É 500 COM O SHELL INTACTO ───────────────────────────
 *
 * Nas DUAS rotas: responder 200 com "sem vagas" deixaria o CDN guardar 60 s de
 * uma ausência falsa; responder 404 afirmaria que a Vaga não existe. O shell
 * embutido, sem troca nenhuma, deixa a aplicação assumir no navegador.
 *
 * ─── SÓ A ABERTA TEM JOBPOSTING ───────────────────────────────────────────
 *
 * E ele sai da função pura do domínio (`jobPostingDaVaga`), que recebe a
 * Descrição JÁ CONFERIDA aqui pelo vocabulário do renderizador
 * (`conferirConteudo`): a Descrição recusada não entra no `<noscript>` nem no
 * `JobPosting`, e a resposta continua 200 com o diagnóstico degradado.
 */

import {
  IMAGEM_PADRAO_DO_SITE,
  enderecoDaImagemPadrao,
} from "../../src/domain/blog/compartilhamento.js";
import { LISTAS_DE_CLASSIFICACAO } from "../../src/domain/carreiras/classificacoes.js";
import {
  rotuloDoEstadoDaVaga,
  SITUACAO_ABERTA,
  SITUACAO_ENCERRADA,
  SITUACAO_INEXISTENTE,
} from "../../src/domain/carreiras/estados.js";
import {
  jobPostingDaVaga,
  problemaNoJobPosting,
  TITULO_DA_LISTAGEM_DE_VAGAS,
  tituloServidoDaVaga,
  VAGA_NAO_ENCONTRADA,
} from "../../src/domain/carreiras/jobPosting.js";
import {
  ENDERECO_DO_CURRICULO,
  enderecoDaPaginaDaVaga,
  linkDeCandidaturaValido,
  textoDoLocal,
  TITULO_DE_RESERVA_DA_ENCERRADA,
} from "../../src/domain/carreiras/vaga.js";
import { conferirConteudo, MARCA_CORPO_FIM, MARCA_CORPO_INICIO } from "./artigo.js";
/* O caractere de etiqueta é o de `cache.js`, IMPORTADO (revisão da 5.8). */
import { CARACTERE_DE_ETIQUETA } from "./cache.js";
import {
  DIAGNOSTICO_CONTEUDO_RECUSADO,
  DIAGNOSTICO_EXCECAO,
  DIAGNOSTICO_LEITURA_FALHOU,
  DIAGNOSTICO_OK,
  DIAGNOSTICO_REGIAO_AUSENTE,
  DIAGNOSTICO_SEM_DOMINIO,
  DIAGNOSTICO_SEM_SHELL,
} from "./diagnostico.js";
import { dominioDoAmbiente, responderDefeito, responderDocumento } from "./entrega.js";
import { situacaoDaVagaServida, vagasAbertasServidas } from "./leitura.js";
import { escapar, MARCA_FIM, MARCA_INICIO, regiaoDeMetadados } from "./metadados.js";
import { lerShell as lerShellDoBuild, trocarRegiao } from "./shell.js";

/** O nome desta rota, para o diagnóstico e o registro de evento. */
export const ROTA_DE_CARREIRAS = "carreiras";

/** O caminho da listagem, declarado uma vez. */
export const CAMINHO_DA_LISTAGEM = "/carreiras";

/** O link de volta à listagem, no fim de todo `<noscript>` de Vaga. */
const LINK_PARA_A_LISTAGEM = `        <p><a href="${CAMINHO_DA_LISTAGEM}">Ver as vagas abertas na ChatClean</a></p>`;

/** O tipo do documento que as duas páginas prometem. */
export const TIPO_DA_PAGINA_DE_CARREIRAS = "text/html; charset=utf-8";

/**
 * O STATUS DE CADA SITUAÇÃO, mapa fechado. Uma situação nova que ninguém
 * classificasse não teria status aqui, e cai no 500 de defeito, nunca num 200
 * por omissão. A política de cache sai do status (`politicaDeCache`).
 */
export const STATUS_DA_SITUACAO_DA_VAGA = Object.freeze({
  [SITUACAO_ABERTA]: 200,
  [SITUACAO_ENCERRADA]: 410,
  [SITUACAO_INEXISTENTE]: 404,
});

/** A listagem é 200 por ser uma página que existe, e não por omissão. */
export const STATUS_DA_LISTAGEM_DE_VAGAS = 200;

/** A etiqueta da coleção de Carreiras (a do Blog é `blog`, e não se mistura). */
export const ETIQUETA_DE_CARREIRAS = "carreiras";

/**
 * As etiquetas de cache de uma resposta de Carreiras: a da coleção, e a da
 * Vaga quando há Slug (do BANCO) no vocabulário de etiqueta.
 */
export function etiquetasDeCarreiras(slug = null) {
  const etiquetas = [ETIQUETA_DE_CARREIRAS];
  if (typeof slug === "string" && CARACTERE_DE_ETIQUETA.test(slug)) etiquetas.push(`vaga:${slug}`);
  return etiquetas;
}

/** A descrição fixa da listagem. */
export const DESCRICAO_DA_LISTAGEM_DE_VAGAS =
  "As vagas abertas na ChatClean, com a descrição de cada uma e o link para se candidatar.";

/**
 * O que a requisição pede: a listagem (sem `slug` na consulta) ou a página de
 * uma Vaga. O `slug` presente e torto (vazio, lista por repetição, outro tipo)
 * vira `null`, que é a Vaga que não existe: a pergunta ambígua não vira
 * consulta, e também não vira listagem.
 */
export function pedidoDeCarreiras(req) {
  const consulta = req?.query;
  if (consulta === null || typeof consulta !== "object" || !Object.hasOwn(consulta, "slug") || consulta.slug === undefined) {
    return { pagina: "listagem" };
  }
  const bruto = consulta.slug;
  return { pagina: "vaga", slug: typeof bruto === "string" && bruto !== "" ? bruto : null };
}

/**
 * O JSON-LD pronto para dentro de `<script>`. TODO `<` vira `<`, que é
 * o mesmo caractere para quem lê JSON e não fecha o bloco (`</script>`) nem
 * abre comentário (`<!--`): a troca é sobre a saída já serializada, no
 * padrão de `artigo.js`, só que mais larga.
 */
export function serializarJsonLd(dados) {
  return JSON.stringify(dados, null, 2).replace(/</g, "\\u003c");
}

/* ─── Metadados ──────────────────────────────────────────────────────────── */

function imagemPadrao(raiz) {
  return {
    endereco: enderecoDaImagemPadrao(raiz),
    largura: IMAGEM_PADRAO_DO_SITE.largura,
    altura: IMAGEM_PADRAO_DO_SITE.altura,
    tipo: IMAGEM_PADRAO_DO_SITE.tipo,
    alternativo: IMAGEM_PADRAO_DO_SITE.alternativo,
  };
}

function aparado(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

/** A canônica de um Slug do banco; sem Slug, a da listagem. */
function canonicaDaVaga(raiz, slug) {
  const caminho = enderecoDaPaginaDaVaga(slug);
  return `${raiz}${caminho ?? CAMINHO_DA_LISTAGEM}`;
}

/** A frase da Encerrada. A palavra do Estado vem do vocabulário. */
export const FRASE_DA_ENCERRADA = `Esta vaga foi ${rotuloDoEstadoDaVaga(SITUACAO_ENCERRADA).toLowerCase()} e não recebe mais candidaturas.`;

/** A frase do endereço sem Vaga. */
export const FRASE_DA_VAGA_NAO_ENCONTRADA = "Este endereço não corresponde a nenhuma vaga aberta na ChatClean.";

/** Os metadados da listagem `/carreiras`. */
export function metadadosDaListagemDeVagas(raiz) {
  return {
    titulo: TITULO_DA_LISTAGEM_DE_VAGAS,
    descricao: DESCRICAO_DA_LISTAGEM_DE_VAGAS,
    canonica: `${raiz}${CAMINHO_DA_LISTAGEM}`,
    tipo: "website",
    imagem: imagemPadrao(raiz),
  };
}

/**
 * Os metadados da página de uma Vaga, pela situação. A Aberta declara o
 * título dela e o Resumo (ausente se vazio: descrição em branco é texto
 * inventado). Aberta sem título não tem reserva: o título fica `null`, e
 * quem serve responde defeito (a leitura já recusa essa linha, e esta é a
 * segunda trava, revisão da 5.8). A Encerrada, o título (ou a reserva) e a frase de encerrada; a
 * inexistente, o título de não encontrada e a canônica da listagem.
 */
export function metadadosDaVagaServida({ situacao, vaga, raiz }) {
  if (situacao === SITUACAO_ABERTA && vaga) {
    const resumo = aparado(vaga.resumo);
    return {
      titulo: tituloServidoDaVaga(vaga.titulo),
      descricao: resumo === "" ? null : resumo,
      canonica: canonicaDaVaga(raiz, vaga.slug),
      tipo: "website",
      imagem: imagemPadrao(raiz),
    };
  }
  if (situacao === SITUACAO_ENCERRADA && vaga) {
    return {
      titulo: tituloServidoDaVaga(vaga.titulo) ?? tituloServidoDaVaga(TITULO_DE_RESERVA_DA_ENCERRADA),
      descricao: FRASE_DA_ENCERRADA,
      canonica: canonicaDaVaga(raiz, vaga.slug),
      tipo: "website",
      imagem: imagemPadrao(raiz),
    };
  }
  /* O LADO SEGURO: tudo que não é Aberta nem Encerrada é a Vaga que não
     existe, sem nada dela no metadado. */
  return {
    titulo: tituloServidoDaVaga(VAGA_NAO_ENCONTRADA),
    descricao: null,
    canonica: `${raiz}${CAMINHO_DA_LISTAGEM}`,
    tipo: "website",
    imagem: imagemPadrao(raiz),
  };
}

/* ─── Corpo ──────────────────────────────────────────────────────────────── */

function noscript(linhas) {
  return ["    <noscript>", '      <article class="artigo">', ...linhas, "      </article>", "    </noscript>"].join("\n");
}

/** As Classificações e o local, em lista, só com o que tem texto. */
function classificacoesDaVaga(vaga) {
  const itens = LISTAS_DE_CLASSIFICACAO.map((lista) => [lista.rotulo, aparado(vaga[lista.chave])]);
  itens.push(["Local", textoDoLocal(vaga)]);
  const cheios = itens.filter(([, valor]) => valor !== "");
  if (cheios.length === 0) return [];
  return [
    "        <ul>",
    ...cheios.map(([rotulo, valor]) => `          <li>${escapar(rotulo)}: ${escapar(valor)}</li>`),
    "        </ul>",
  ];
}

/**
 * O corpo da página de uma Vaga: `{ html, defeito }`. `defeito` preenchido é
 * o desvio que o diagnóstico registra (a Descrição recusada, ou o
 * `JobPosting` que não pôde sair), e nunca derruba a página.
 */
export function corpoDaVagaServida({ situacao, vaga, raiz }) {
  if (situacao === SITUACAO_ABERTA && vaga) {
    let aprovada = null;
    let defeito = null;
    const html = vaga.descricao_html;
    if (typeof html === "string" && html.trim() !== "") {
      const conferido = conferirConteudo(html);
      if (conferido.ok) aprovada = html;
      else defeito = `Descrição recusada: ${conferido.defeito}`;
    }

    const linhas = [`        <h1>${escapar(aparado(vaga.titulo))}</h1>`, ...classificacoesDaVaga(vaga)];
    const resumo = aparado(vaga.resumo);
    if (resumo !== "") linhas.push(`        <p>${escapar(resumo)}</p>`);
    if (aprovada !== null) linhas.push(`        ${aprovada}`);
    if (linkDeCandidaturaValido(vaga.link_de_candidatura)) {
      const destino = new URL(vaga.link_de_candidatura).href;
      linhas.push(`        <p><a href="${escapar(destino)}" rel="noopener noreferrer">Candidatar-se</a></p>`);
    }
    linhas.push(LINK_PARA_A_LISTAGEM);

    const paraOJobPosting = { ...vaga, descricao_html: aprovada };
    const dados = jobPostingDaVaga(paraOJobPosting, { raiz });
    if (dados === null && defeito === null) {
      defeito = `JobPosting omitido: ${problemaNoJobPosting(paraOJobPosting, { raiz })}`;
    }
    const partes = [noscript(linhas)];
    if (dados !== null) {
      partes.push('    <script type="application/ld+json">', serializarJsonLd(dados), "    </script>");
    }
    return { html: partes.join("\n"), defeito };
  }

  if (situacao === SITUACAO_ENCERRADA && vaga) {
    const titulo = aparado(vaga.titulo) || TITULO_DE_RESERVA_DA_ENCERRADA;
    return {
      html: noscript([`        <h1>${escapar(titulo)}</h1>`, `        <p>${escapar(FRASE_DA_ENCERRADA)}</p>`, LINK_PARA_A_LISTAGEM]),
      defeito: null,
    };
  }

  return {
    html: noscript([
      `        <h1>${escapar(VAGA_NAO_ENCONTRADA)}</h1>`,
      `        <p>${escapar(FRASE_DA_VAGA_NAO_ENCONTRADA)}</p>`,
      LINK_PARA_A_LISTAGEM,
    ]),
    defeito: null,
  };
}

/** A frase da listagem sem Vaga Aberta. */
export const FRASE_SEM_VAGAS_ABERTAS =
  "Não há vagas abertas na ChatClean agora. Volte em breve, ou envie o seu currículo pelo nosso WhatsApp.";

/** O texto do link do currículo, que acompanha a frase (revisão da 5.8). */
export const TEXTO_DO_LINK_DO_CURRICULO = "Enviar currículo pelo WhatsApp";

/** O corpo da listagem: as Vagas Abertas, cada uma com o local e o link. */
export function corpoDaListagemDeVagas(vagas) {
  const linhas = ["        <h1>Vagas abertas na ChatClean</h1>"];
  const lista = Array.isArray(vagas) ? vagas : [];
  const itens = lista
    .map((vaga) => {
      const endereco = enderecoDaPaginaDaVaga(vaga?.slug);
      const titulo = aparado(vaga?.titulo);
      if (endereco === null || titulo === "") return null;
      const local = textoDoLocal(vaga);
      return `          <li><a href="${escapar(endereco)}">${escapar(titulo)}</a>${local === "" ? "" : ` (${escapar(local)})`}</li>`;
    })
    .filter((item) => item !== null);
  if (itens.length === 0) {
    linhas.push(
      `        <p>${escapar(FRASE_SEM_VAGAS_ABERTAS)}</p>`,
      `        <p><a href="${escapar(ENDERECO_DO_CURRICULO)}" rel="noopener noreferrer">${escapar(TEXTO_DO_LINK_DO_CURRICULO)}</a></p>`,
    );
  } else {
    linhas.push("        <ul>", ...itens, "        </ul>");
  }
  return noscript(linhas);
}

/* ─── A resposta ─────────────────────────────────────────────────────────── */

/**
 * A resposta de um HEAD: status e cabeçalhos de verdade, e nenhum corpo. O
 * mesmo `responderDocumento` decide tudo; só o envio final é trocado.
 */
function semCorpo(res) {
  const embrulho = {
    setHeader: (nome, valor) => res.setHeader(nome, valor),
    status: (codigo) => {
      res.status(codigo);
      return embrulho;
    },
    send: () => {
      if (typeof res.end === "function") res.end();
      else res.send("");
    },
  };
  return embrulho;
}

/**
 * Serve `/carreiras` ou `/carreiras/:slug` (GET ou HEAD; o método é decidido
 * por quem chama). As leituras e o shell são injetáveis para a verificação
 * exercer a matriz sem banco; o padrão é o real.
 *
 * ─── NADA LANÇA PARA A PLATAFORMA (revisão da 5.8) ────────────────────────
 *
 * Um leitor que lança, um shell que rejeita, uma montagem com bug: tudo vira
 * o defeito DITO (500, `no-store`, `falha:excecao`, evento registrado), e
 * nunca o 500 genérico da hospedagem, que não diz nada a ninguém. No HEAD, o
 * defeito também sai sem corpo.
 */
export async function servirCarreiras(req, resOriginal, opcoes = {}) {
  const res = req?.method === "HEAD" ? semCorpo(resOriginal) : resOriginal;
  try {
    await montarCarreiras(req, res, opcoes);
  } catch (erro) {
    responderDefeito(res, `A página de Carreiras falhou ao ser montada: ${erro?.message ?? erro}`, {
      diagnostico: DIAGNOSTICO_EXCECAO,
      rota: ROTA_DE_CARREIRAS,
    });
  }
}

async function montarCarreiras(
  req,
  res,
  { lerSituacao = situacaoDaVagaServida, lerAbertas = vagasAbertasServidas, lerShell = lerShellDoBuild } = {},
) {
  const rota = ROTA_DE_CARREIRAS;

  const dominio = dominioDoAmbiente();
  if (!dominio.ok) {
    responderDefeito(res, dominio.defeito, { diagnostico: DIAGNOSTICO_SEM_DOMINIO, rota });
    return;
  }
  const shell = await lerShell();
  if (!shell.ok) {
    responderDefeito(res, shell.defeito, { diagnostico: DIAGNOSTICO_SEM_SHELL, rota });
    return;
  }
  const raiz = dominio.raiz;
  const pedido = pedidoDeCarreiras(req);

  let status;
  let pagina;
  let corpo;
  let etiquetas;
  if (pedido.pagina === "listagem") {
    const lida = await lerAbertas();
    if (!lida.ok) {
      responderDocumento(res, {
        tipo: TIPO_DA_PAGINA_DE_CARREIRAS,
        status: 500,
        corpo: shell.html,
        diagnostico: DIAGNOSTICO_LEITURA_FALHOU,
        rota,
        detalhe: lida.defeito,
      });
      return;
    }
    status = STATUS_DA_LISTAGEM_DE_VAGAS;
    pagina = metadadosDaListagemDeVagas(raiz);
    corpo = { html: corpoDaListagemDeVagas(lida.vagas), defeito: null };
    etiquetas = etiquetasDeCarreiras();
  } else {
    const lida = await lerSituacao(pedido.slug);
    if (!lida.ok) {
      responderDocumento(res, {
        tipo: TIPO_DA_PAGINA_DE_CARREIRAS,
        status: 500,
        corpo: shell.html,
        diagnostico: DIAGNOSTICO_LEITURA_FALHOU,
        rota,
        detalhe: lida.defeito,
      });
      return;
    }
    status = STATUS_DA_SITUACAO_DA_VAGA[lida.situacao];
    if (typeof status !== "number") {
      responderDefeito(res, `A situação da Vaga não tem status declarado: ${JSON.stringify(lida.situacao)}.`, {
        diagnostico: DIAGNOSTICO_LEITURA_FALHOU,
        rota,
      });
      return;
    }
    const argumentos = { situacao: lida.situacao, vaga: lida.vaga, raiz };
    pagina = metadadosDaVagaServida(argumentos);
    if (pagina.titulo === null) {
      responderDefeito(res, "A Vaga aberta chegou sem título: não há o que anunciar.", {
        diagnostico: DIAGNOSTICO_LEITURA_FALHOU,
        rota,
      });
      return;
    }
    corpo = corpoDaVagaServida(argumentos);
    etiquetas = etiquetasDeCarreiras(lida.vaga?.slug ?? null);
  }

  const comMetadados = trocarRegiao(shell.html, regiaoDeMetadados(pagina), { inicio: MARCA_INICIO, fim: MARCA_FIM });
  if (!comMetadados.ok) {
    responderDefeito(res, comMetadados.defeito, { diagnostico: DIAGNOSTICO_REGIAO_AUSENTE, rota });
    return;
  }
  const comCorpo = trocarRegiao(comMetadados.html, corpo.html, { inicio: MARCA_CORPO_INICIO, fim: MARCA_CORPO_FIM });
  if (!comCorpo.ok) {
    responderDefeito(res, comCorpo.defeito, { diagnostico: DIAGNOSTICO_REGIAO_AUSENTE, rota });
    return;
  }

  responderDocumento(res, {
    tipo: TIPO_DA_PAGINA_DE_CARREIRAS,
    status,
    corpo: comCorpo.html,
    etiquetas,
    diagnostico: corpo.defeito === null ? DIAGNOSTICO_OK : DIAGNOSTICO_CONTEUDO_RECUSADO,
    rota,
    detalhe: corpo.defeito,
  });
}
