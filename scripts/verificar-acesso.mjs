#!/usr/bin/env node
/**
 * Ferramenta de verificação do acesso ao Painel (Stories 1.3 e 1.4).
 *
 * Mesmo contrato das verificações anteriores: uma linha por asserção, código 0
 * se todas passarem, 1 caso contrário. Cobre cada linha da matriz de I/O da
 * story, em três frentes:
 *
 *   ESTÁTICO — sobre `src/`, sem rede: nenhuma ocorrência da senha antiga, do
 *   nome da constante que a guardava nem da chave do portão falso; nenhum
 *   caminho em que armazenamento do navegador decida acesso; nenhum caminho de
 *   autosserviço na tela de entrada; `createClient` chamado num único arquivo;
 *   e o portão de fato envolvendo a rota `/admin`.
 *
 *   BUNDLE — sobre `dist/assets/*.js`: contém a chave publicável e nenhuma
 *   chave de serviço, token de conta ou vestígio da senha antiga.
 *
 *   COMPORTAMENTAL — com uma Conta temporária criada e removida pelo próprio
 *   script: login com a senha certa devolve sessão e lê o perfil; senha errada
 *   e e-mail inexistente produzem resposta idêntica; a sessão se renova por
 *   refresh token; e o registro direto pela API pública é recusado.
 *
 * Sem `SUPABASE_ACCESS_TOKEN` no ambiente as asserções comportamentais FALHAM
 * como ausentes — nunca são puladas em silêncio.
 *
 * Uso: npm run verificar:acesso
 */

import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

/* O arranjo de montagem de tela — o MESMO que `verificar-editor.mjs` usa. A
   seção (i) monta o portão e a prévia num DOM de verdade: ler que o portão
   envolve a rota não é o mesmo que ver o conteúdo não montar. */
import {
  caminhoDeModulo,
  comoModulo,
  compilarParaNode,
  criarPastaDeCompilacao,
  montarNavegador,
} from "./montagem-comum.mjs";

import {
  ERRO_CREDENCIAL,
  ERRO_LIMITE,
  ERRO_REDE,
  ERRO_SERVIDOR,
  mensagemDoErro,
  SESSAO_INDETERMINADA,
  SESSAO_RECUSADA,
  SESSAO_VALIDA,
  validarSessaoNoServidor,
} from "../src/admin/shell/sessao.js";
import {
  executarScript,
  executarSql,
  lerToken,
  literal,
  NOME_PROJETO,
  raiz,
  REF_PROJETO,
  sanitizar,
  TIMEOUT_MS,
  URL_PROJETO,
} from "./supabase-comum.mjs";
import {
  lerArgumentos,
  sqlDeCriacaoDeConta,
  sqlDeRemocaoDeConta,
  TAMANHO_MAXIMO_DA_SENHA_EM_BYTES,
  TAMANHO_MINIMO_DA_SENHA,
  validarEntrada,
  validarSenha,
} from "./criar-conta.mjs";

let falhas = 0;
let adiadas = 0;

function secao(titulo) {
  console.log(`\n${titulo}`);
}

/**
 * A asserção não pôde ser executada por limite do ambiente, não por defeito.
 *
 * Existe por causa do limite de taxa do GoTrue: `npm run verificar` roda a cada
 * ciclo, e execuções seguidas esbarram nele. Pintar isso de vermelho ensinaria
 * a ignorar o vermelho. Mas também não pode virar silêncio — foi o defeito que
 * a revisão da Story 1.2 mais atacou —, então sai com marca própria e é
 * contado no veredito final, onde ninguém deixa de ver.
 */
function adiar(descricao, motivo) {
  adiadas += 1;
  console.log(`  ADIADA ${descricao} — ${sanitizar(motivo)}`);
}

function afirmar(descricao, condicao, detalhe = "") {
  if (condicao) {
    console.log(`  OK    ${descricao}`);
  } else {
    falhas += 1;
    console.log(
      `  FALHA ${descricao}${detalhe ? ` — ${sanitizar(detalhe)}` : ""}`,
    );
  }
  return Boolean(condicao);
}

function lerOuFalhar(caminho, descricao) {
  try {
    return readFileSync(caminho, "utf8");
  } catch (erro) {
    afirmar(descricao, false, erro.message);
    return null;
  }
}

/** Todos os arquivos de código sob um diretório, recursivamente. */
function arquivosDe(dir, extensoes) {
  const achados = [];
  const andar = (atual) => {
    let entradas;
    try {
      entradas = readdirSync(atual, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const completo = path.join(atual, e.name);
      if (e.isDirectory()) andar(completo);
      else if (extensoes.some((ext) => e.name.endsWith(ext))) achados.push(completo);
    }
  };
  andar(dir);
  return achados;
}

const rel = (p) => path.relative(raiz, p).split(path.sep).join("/");

/** Linhas que casam com um padrão, no formato `arquivo:linha`. */
/** Leitura padrao: o texto inteiro, comentario incluido. */
const padraoDeLinhas = (t) => t.split(/\r?\n/);

function ocorrencias(arquivos, padrao, emLinhas = padraoDeLinhas) {
  const achados = [];
  for (const arquivo of arquivos) {
    let texto;
    try {
      texto = readFileSync(arquivo, "utf8");
    } catch {
      continue;
    }
    // `emLinhas` decide se a leitura e sobre o texto BRUTO ou so sobre o
    // CODIGO. Prosa que EXPLICA a regra ja acusou o proprio arquivo que a
    // cumpre, e uma assercao que acusa a documentacao da regra acaba
    // desligada por incomodo. Varredura de SEGREDO continua no bruto:
    // segredo em comentario e segredo vazado do mesmo jeito.
    emLinhas(texto).forEach((linha, i) => {
      if (padrao.test(linha)) achados.push(`${rel(arquivo)}:${i + 1}`);
    });
  }
  return achados;
}

const DIR_SRC = path.join(raiz, "src");
const DIR_DIST = path.join(raiz, "dist");

await executarScript(async () => {

/* ─── (a) O portão falso não existe mais em lugar algum de `src/` ────────── */

secao("(a) nenhum vestígio do portão falso no código-fonte");

const fontes = arquivosDe(DIR_SRC, [".js", ".jsx", ".css"]);
afirmar(
  "há código-fonte para inspecionar",
  fontes.length > 0,
  "src/ não devolveu arquivo algum — a varredura passaria por vacuidade",
);

for (const [rotulo, padrao] of [
  ["a senha em texto claro (`chatclean@admin`)", /chatclean@admin/],
  ["a constante `ADMIN_PASSWORD`", /ADMIN_PASSWORD/],
  ["a chave do portão falso (`cc_admin_auth`)", /cc_admin_auth/],
]) {
  const achados = ocorrencias(fontes, padrao);
  afirmar(
    `src/ não contém ${rotulo}`,
    achados.length === 0,
    achados.join(", "),
  );
}

/**
 * Nenhum caminho em que armazenamento do navegador decida acesso.
 *
 * A varredura é por vizinhança de CÓDIGO, não por arquivo: `vagasStore` usa
 * `localStorage` legitimamente, para conteúdo de Carreiras, e proibir a API
 * inteira apenas empurraria a decisão de acesso para outro nome.
 * (`blogStore` estava nesta frase até a Story 2.15, quando o armazenamento de
 * Post no navegador saiu do projeto. Quem cobra a ausência dele é
 * `verificar:interface`, sem exceção nenhuma.)
 * O que se proíbe é a coincidência entre armazenamento do navegador e
 * vocabulário de acesso — que é exatamente a forma do defeito removido:
 * `sessionStorage.getItem(AUTH_KEY)`.
 *
 * Comentários são removidos antes da leitura: este próprio arquivo e os que ele
 * inspeciona explicam em prosa o defeito que eliminaram, e prosa não decide
 * acesso. As varreduras por literal (senha antiga, chave do portão) continuam
 * lendo o texto BRUTO, comentário incluído — segredo em comentário é segredo
 * vazado do mesmo jeito.
 */
const VOCABULARIO_DE_ACESSO =
  /(auth|login|logad|logged|sess[aã]o|session|acesso|credencia|senha|password|token|admin|autoriz|permiss)/i;

/**
 * Linhas com comentário de bloco e de linha trocados por vazio, preservando a
 * numeração. Best-effort: `//` dentro de literal só aparece em URL, e nenhuma
 * decisão de acesso vive depois de uma URL na mesma linha.
 */
function linhasDeCodigo(texto) {
  const linhas = texto.split(/\r?\n/);
  let emBloco = false;
  return linhas.map((linhaOriginal) => {
    let linha = linhaOriginal;
    let saida = "";
    while (linha.length > 0) {
      if (emBloco) {
        const fim = linha.indexOf("*/");
        if (fim === -1) return saida;
        linha = linha.slice(fim + 2);
        emBloco = false;
        continue;
      }
      const bloco = linha.indexOf("/*");
      const linhaComentario = linha.indexOf("//");
      if (bloco !== -1 && (linhaComentario === -1 || bloco < linhaComentario)) {
        saida += linha.slice(0, bloco);
        linha = linha.slice(bloco + 2);
        emBloco = true;
        continue;
      }
      if (linhaComentario !== -1) {
        saida += linha.slice(0, linhaComentario);
        return saida;
      }
      saida += linha;
      linha = "";
    }
    return saida;
  });
}

/** Números de linha (1-based) em que armazenamento e acesso se encontram. */
function linhasSuspeitas(texto) {
  const linhas = linhasDeCodigo(texto);
  const achados = [];
  linhas.forEach((linha, i) => {
    if (!/\b(sessionStorage|localStorage)\b/.test(linha)) return;
    // O próprio identificador é apagado antes do teste: `sessionStorage`
    // contém "session" e faria toda linha se acusar sozinha.
    const vizinhanca = linhas
      .slice(Math.max(0, i - 2), i + 3)
      .join("\n")
      .replace(/\b(sessionStorage|localStorage)\b/g, "«armazenamento»");
    if (VOCABULARIO_DE_ACESSO.test(vizinhanca)) achados.push(i + 1);
  });
  return achados;
}

// Antes de confiar no detector, exercitá-lo. Uma asserção estática que nunca
// foi vista acusando é uma promessa, não uma verificação: foi a família de
// defeitos mais grave da revisão da Story 1.2.
{
  const casos = [
    [
      "acusa o portão falso exatamente como ele era",
      'const AUTH_KEY = "cc_admin_auth";\nconst [authed] = useState(() => !!sessionStorage.getItem(AUTH_KEY));',
      true,
    ],
    [
      "acusa mesmo com o nome trocado, se o vocabulário de acesso está por perto",
      'function podeEntrar() {\n  return localStorage.getItem("meu_acesso") === "1";\n}',
      true,
    ],
    [
      "não acusa armazenamento de conteúdo",
      'const KEY = "cc_blog_posts";\nlocalStorage.setItem(KEY, JSON.stringify(posts));',
      false,
    ],
    [
      "não acusa prosa em comentário que descreve o defeito removido",
      '// O portão antigo lia sessionStorage para decidir acesso de admin.\nconst posts = getPosts();',
      false,
    ],
  ];
  for (const [nome, fonte, esperaAcusar] of casos) {
    afirmar(
      `detector de portão forjado: ${nome}`,
      (linhasSuspeitas(fonte).length > 0) === esperaAcusar,
      `acusou: ${linhasSuspeitas(fonte).join(", ") || "nada"}`,
    );
  }
}

{
  const suspeitas = [];
  for (const arquivo of fontes) {
    for (const linha of linhasSuspeitas(readFileSync(arquivo, "utf8"))) {
      suspeitas.push(`${rel(arquivo)}:${linha}`);
    }
  }
  afirmar(
    "nenhum uso de armazenamento do navegador perto de vocabulário de acesso",
    suspeitas.length === 0,
    suspeitas.join(", "),
  );
}

{
  // A casca do Painel não toca armazenamento do navegador de forma alguma:
  // quem guarda sessão ali é o supabase-js, com token assinado.
  const naCasca = ocorrencias(
    arquivosDe(path.join(DIR_SRC, "admin"), [".js", ".jsx"]),
    /\b(sessionStorage|localStorage)\b/,
    // Sobre o CODIGO: o proprio arquivo que CUMPRE a regra a explica em
    // prosa, e citar o nome do armazenamento para dizer que ele NAO se
    // reproduz aqui nao pode acusar quem escreveu a explicacao.
    linhasDeCodigo,
  );
  afirmar(
    "src/admin/ não toca sessionStorage nem localStorage",
    naCasca.length === 0,
    naCasca.join(", "),
  );
}

/* ─── (b) Um só instanciador de cliente, e o portão acima da rota ────────── */

secao("(b) a arquitetura de acesso está onde deveria");

{
  const comCreateClient = [
    ...new Set(
      ocorrencias(fontes, /\bcreateClient\s*\(/).map((o) => o.split(":")[0]),
    ),
  ];
  afirmar(
    "createClient é chamado em um único arquivo (AD-6)",
    comCreateClient.length === 1,
    comCreateClient.join(", ") || "nenhum arquivo chama createClient",
  );
  afirmar(
    "esse arquivo é src/data/supabase/clientes.js",
    comCreateClient[0] === "src/data/supabase/clientes.js",
    comCreateClient[0] ?? "—",
  );
}

/* ─── O CAMINHO ÚNICO DE ESCRITA, e os verbos que ele ganhou ─────────────── */
//
// "Nenhum cliente escreve no banco" é a regra que sustenta a RLS inteira: não
// existe política de escrita para `anon` nem para `authenticated`. A Story 2.12
// acrescentou dois verbos — excluir e alternar Destaque — e é exatamente no dia
// de acrescentar um verbo que alguém precisa "só desta vez" chamar o PostgREST
// direto: `delete()` de uma linha parece pequeno demais para justificar uma ida
// à função de servidor. Esta varredura existe para esse dia.

{
  const VERBOS_DE_ESCRITA = ["insert", "update", "upsert", "delete"];

  /**
   * As escritas do PostgREST num texto — e só elas.
   *
   * A busca é pela CORRENTE, e não pelo verbo solto: `.delete(` sozinho acusa
   * `Map.prototype.delete`, que a casca usa duas vezes para esquecer aba e
   * token, e uma asserção que grita sobre um `Map` é uma asserção que alguém
   * desliga. O que caracteriza escrita no banco é o verbo pendurado numa
   * seleção de tabela — `.from("posts").delete()` —, então a janela começa no
   * `.from(` e vai até onde a corrente costuma acabar.
   *
   * `Array.from(` é excluído pelo nome: ele não é seleção de tabela nenhuma.
   */
  const escritasDoPostgrest = (texto) => {
    const achados = [];
    for (const m of texto.matchAll(/(\w*)\.from\s*\(/g)) {
      if (m[1] === "Array") continue;
      const janela = texto.slice(m.index, m.index + 400);
      for (const verbo of VERBOS_DE_ESCRITA) {
        if (new RegExp(`\\.${verbo}\\s*\\(`).test(janela)) achados.push(verbo);
      }
    }
    return achados;
  };

  const comEscritaDireta = [];
  for (const arquivo of fontes) {
    let texto;
    try {
      texto = readFileSync(arquivo, "utf8");
    } catch {
      continue;
    }
    for (const verbo of escritasDoPostgrest(texto)) {
      comEscritaDireta.push(`${rel(arquivo)} → ${verbo}`);
    }
  }
  afirmar(
    "nenhum módulo de src/ escreve no banco pelo cliente — nem `insert`, nem `update`, nem `upsert`, nem `delete`",
    comEscritaDireta.length === 0,
    comEscritaDireta.join(", "),
  );
  /* AUTOTESTE DO DETECTOR, nos dois sentidos. Sem o positivo, um detector
     quebrado deixaria a varredura passar por vacuidade; sem o negativo, ela
     acusaria `Map.delete` e seria desligada por incômodo — que dá no mesmo. */
  afirmar(
    "o detector acusa uma escrita de verdade e ignora o `delete` de um `Map`",
    escritasDoPostgrest('cliente.from("posts").delete().eq("id", id)').includes("delete") &&
      escritasDoPostgrest('cliente.from("posts").select("id")').length === 0 &&
      escritasDoPostgrest("mapa.delete(chave)").length === 0 &&
      escritasDoPostgrest("Array.from(lista).filter(Boolean)").length === 0,
  );

  /* `rpc` é caso à parte: a busca sem acento da Story 2.11 é uma FUNÇÃO do
     banco, e chamá-la é leitura. O que não pode é uma segunda chamada aparecer
     sem ninguém reparar — função de banco é o caminho natural para "escrever
     sem escrever". */
  const comRpc = [
    ...new Set(ocorrencias(fontes, /\.rpc\s*\(/).map((o) => o.split(":")[0])),
  ];
  afirmar(
    "a única função de banco chamada por src/ é a busca da listagem, e ela é leitura",
    comRpc.length === 1 && comRpc[0] === "src/data/blog/posts.js",
    comRpc.join(", ") || "nenhuma — a busca da Story 2.11 deveria estar aqui",
  );

  /* E A ROTA DA FUNÇÃO tem UM cliente. Dois módulos falando com `/api/posts`
     seriam dois lugares para autenticar, classificar erro e traduzir mensagem —
     e o segundo sempre fica para trás do primeiro. */
  const comRota = [
    ...new Set(ocorrencias(fontes, /["'`]\/api\/posts["'`]/).map((o) => o.split(":")[0])),
  ];
  afirmar(
    "só um módulo de src/ conhece o endereço da função de escrita, e ele é `data/blog/escrita.js`",
    comRota.length === 1 && comRota[0] === "src/data/blog/escrita.js",
    comRota.join(", ") || "nenhum módulo conhece a rota — a escrita não teria por onde sair",
  );

  /* E AS TELAS chegam à escrita por ele, nunca por um `fetch` próprio. O Painel
     tem duas superfícies que escrevem — o Editor e a listagem — e as duas
     importam as funções da camada. */
  const escritoras = [
    "src/admin/blog/EditorDePost.jsx",
    "src/admin/blog/ListaDePosts.jsx",
  ];
  /* ARQUIVO AUSENTE NÃO É APROVAÇÃO. As duas varreduras abaixo devolviam
     `false` em silêncio para caminho inexistente: renomear uma das telas
     fazia as asserções passarem sem ler nada — a forma mais silenciosa de uma
     asserção deixar de verificar. */
  const ausentes = escritoras.filter((r) => !existsSync(path.join(raiz, r)));
  afirmar(
    `as ${escritoras.length} telas que escrevem existem onde a varredura procura`,
    ausentes.length === 0,
    `${ausentes.join(", ")} — arquivo movido ou renomeado deixaria as duas asserções abaixo sem objeto`,
  );
  const comFetchProprio = escritoras.filter((relativo) => {
    const completo = path.join(raiz, relativo);
    if (!existsSync(completo)) return false;
    return /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(
      readFileSync(completo, "utf8"),
    );
  });
  afirmar(
    "nem o Editor nem a listagem falam com a rede por conta própria — as duas passam pela camada de dados",
    comFetchProprio.length === 0,
    comFetchProprio.join(", "),
  );
  const semImportarAEscrita = escritoras.filter((relativo) => {
    const completo = path.join(raiz, relativo);
    if (!existsSync(completo)) return false;
    return !/from\s+["']@\/data\/blog\/escrita["']/.test(readFileSync(completo, "utf8"));
  });
  afirmar(
    "e as duas importam a escrita da camada — a listagem exclui e destaca pela MESMA porta que o Editor salva",
    semImportarAEscrita.length === 0,
    semImportarAEscrita.join(", "),
  );
}

const clientes = lerOuFalhar(
  path.join(DIR_SRC, "data", "supabase", "clientes.js"),
  "src/data/supabase/clientes.js existe",
);
if (clientes !== null) {
  afirmar(
    "o cliente do Painel persiste a sessão",
    /persistSession:\s*true/.test(clientes),
  );
  afirmar(
    "o cliente do Painel renova o token silenciosamente",
    /autoRefreshToken:\s*true/.test(clientes),
  );
  afirmar(
    "o cliente do Painel não vasculha a URL (detectSessionInUrl: false)",
    /detectSessionInUrl:\s*false/.test(clientes),
  );
  afirmar(
    "existe um cliente público que não guarda sessão",
    /clientePublico/.test(clientes) && /persistSession:\s*false/.test(clientes),
  );
  afirmar(
    "a falta de variável de ambiente falha com mensagem clara",
    /ConfiguracaoAusente/.test(clientes) &&
      /VITE_SUPABASE_URL/.test(clientes) &&
      /VITE_SUPABASE_PUBLISHABLE_KEY/.test(clientes),
  );
  afirmar(
    "nenhuma chave de serviço é lida pelo cliente",
    !/SERVICE_ROLE|service_role|sb_secret_/.test(clientes),
  );
}

const principal = lerOuFalhar(path.join(DIR_SRC, "main.jsx"), "src/main.jsx existe");
if (principal !== null) {
  const rota = /path="\/admin"[\s\S]{0,400}?<AdminBlog\s*\/>/.exec(principal)?.[0] ?? "";
  afirmar(
    "a rota /admin é envolvida por SessaoProvider",
    /<SessaoProvider>/.test(rota),
    "o portão precisa estar acima da página, não dentro dela",
  );
  afirmar(
    "a rota /admin é envolvida por PortaoDeSessao",
    /<PortaoDeSessao>/.test(rota),
    "o portão precisa estar acima da página, não dentro dela",
  );

  /* ─── O PORTÃO SUBIU PARA A ROTA-PAI (Story 2.13) ───────────────────────
     As duas asserções acima continuam valendo palavra por palavra; o que muda
     é que `/admin` deixou de ser rota-folha. Envolver cada rota filha seria
     lembrar de envolver cada rota filha, e o dia em que alguém esquecesse
     seria o dia em que um Post não publicado ficaria legível por endereço.
     As linhas abaixo ESTENDEM a garantia: o portão está no elemento do pai, o
     pai serve `Outlet`, e todas as telas do Painel são filhas dele. */
  const ELEMENTO_DO_PAI =
    /path="\/admin"\s*element=\{\s*<SessaoProvider>\s*<PortaoDeSessao>\s*<Outlet\s*\/>\s*<\/PortaoDeSessao>\s*<\/SessaoProvider>\s*\}/;
  const semEspacos = principal.replace(/\s+/g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  afirmar(
    "o elemento do PAI é o portão, e o que ele serve é `Outlet` — a filha nasce protegida em vez de precisar lembrar de se proteger",
    ELEMENTO_DO_PAI.test(semEspacos.replace(/\s+/g, "")),
    semEspacos.slice(semEspacos.indexOf('path="/admin"'), semEspacos.indexOf('path="/admin"') + 220),
  );
  afirmar(
    "e o Painel de hoje virou a rota-ÍNDICE do pai — ele não declara portão próprio",
    /<Route\s+index\s+element=\{<AdminBlog\s*\/>\}\s*\/>/.test(semEspacos),
    "índice ausente faria `/admin` abrir vazio",
  );
  afirmar(
    "a pré-visualização é rota FILHA, pelo caminho que o módulo declara — não por um endereço escrito à mão aqui",
    /<Route\s+path=\{ROTA_DA_PREVIA\}\s+element=\{<PreVisualizacaoDePost\s*\/>\}\s*\/>/.test(
      semEspacos,
    ) && /ROTA_DA_PREVIA/.test(principal),
    "endereço escrito à mão aqui divergiria do que a listagem e o Editor montam",
  );
  /* E EXISTE FILHA APANHA-TUDO. Sem ela, `/admin/previa` sem identificador e
     `/admin/qualquer-coisa` não casam com filha nenhuma: o pai monta, o
     `Outlet` fica vazio, e o Autor recebe uma página em branco — que é
     indistinguível de "o Painel quebrou". */
  afirmar(
    "e há filha APANHA-TUDO sob `/admin` — endereço desconhecido cai numa tela, e não em página em branco",
    /<Route\s+path=\{ROTA_DESCONHECIDA\}\s+element=\{<PreVisualizacaoDePost\s*\/>\}\s*\/>/.test(
      semEspacos,
    ) && /ROTA_DESCONHECIDA/.test(principal),
    "sem ela o `Outlet` do pai fica vazio e a tela de ausência nunca aparece",
  );
  /* NENHUMA FILHA TEM PORTÃO PRÓPRIO. Um segundo portão numa filha seria uma
     segunda decisão de acesso — e a segunda sempre fica para trás da primeira.
     A contagem é sobre o arquivo inteiro: exatamente uma montagem de cada. */
  afirmar(
    "há EXATAMENTE um portão e um provedor de sessão no arquivo inteiro — nenhuma filha reabre a decisão de acesso",
    (principal.match(/<PortaoDeSessao>/g) ?? []).length === 1 &&
      (principal.match(/<SessaoProvider>/g) ?? []).length === 1,
    `portões: ${(principal.match(/<PortaoDeSessao>/g) ?? []).length} | provedores: ${(principal.match(/<SessaoProvider>/g) ?? []).length}`,
  );
  /* E TODA ROTA DE PAINEL MORA SOB `/admin`. Uma tela do Painel declarada como
     rota irmã — fora do pai — nasceria fora do portão, e nada acima acusaria.

     ─── O RECORTE DO BLOCO É BALANCEADO, E NÃO "ATÉ O PRIMEIRO FECHAMENTO"
     `[\s\S]*?<\/Route>` funciona enquanto TODAS as filhas forem autofechadas.
     Uma filha escrita com tag de fechamento, ou uma neta, truncaria o bloco — e
     a asserção passaria a julgar um pedaço, calada. Aqui o recorte conta
     aberturas e fechamentos.

     ─── E AS TELAS SÃO DERIVADAS, e não duas expressões escritas à mão. Uma
     tela nova declarada como rota irmã nasceria fora do portão e passaria sem
     ninguém acusar, porque ninguém teria lembrado de acrescentá-la à lista. */
  {
    /** O bloco `<Route path="/admin"> … </Route>`, com aninhamento contado. */
    const blocoBalanceado = (fonte, marcador) => {
      const inicio = fonte.indexOf(marcador);
      if (inicio === -1) return "";
      const abre = fonte.lastIndexOf("<Route", inicio);
      if (abre === -1) return "";
      let profundidade = 0;
      for (let i = abre; i < fonte.length; i += 1) {
        if (fonte.startsWith("</Route>", i)) {
          profundidade -= 1;
          if (profundidade === 0) return fonte.slice(abre, i + "</Route>".length);
          continue;
        }
        if (fonte.startsWith("<Route", i)) {
          // Autofechada não abre nível: `<Route … />`.
          const fim = fonte.indexOf(">", i);
          if (fim !== -1 && fonte[fim - 1] === "/") {
            i = fim;
            continue;
          }
          profundidade += 1;
          i = fim === -1 ? i : fim;
        }
      }
      return "";
    };
    /* AUTOTESTE do recorte: a forma que quebrava o anterior precisa ser lida
       inteira, e o balanceamento precisa parar no fechamento certo. */
    {
      const comFilhaFechada =
        '<Route path="/admin" element={<X />}>\n' +
        "  <Route index element={<A />} />\n" +
        '  <Route path="p"><Route index element={<B />} /></Route>\n' +
        "</Route>\n" +
        '<Route path="/blog" element={<C />} />';
      const recortado = blocoBalanceado(comFilhaFechada, 'path="/admin"');
      afirmar(
        "o recorte do bloco de `/admin` é BALANCEADO: filha com tag de fechamento e neta não o truncam, e ele para no fechamento certo",
        recortado.includes("<B />") &&
          recortado.endsWith("</Route>") &&
          !recortado.includes("<C />"),
        recortado.replace(/\s+/g, " ").slice(0, 140),
      );
    }

    const bloco = blocoBalanceado(principal, 'path="/admin"');
    /* AS TELAS DO PAINEL, DERIVADAS DOS IMPORTS. Todo componente importado de
       `admin/` ou `pages/AdminBlog` é uma tela do Painel — e cada uma delas
       precisa ser montada dentro do bloco, e só lá. */
    const telasDoPainel = [
      ...principal.matchAll(
        /import\s+([A-Z][\w]*)\s+from\s+["'][^"']*(?:admin\/|AdminBlog)[^"']*["']/g,
      ),
    ]
      .map((m) => m[1])
      /* O provedor e o portão são a CASCA, não telas: eles montam o bloco, não
         são montados por ele. */
      .filter((nome) => !["SessaoProvider", "PortaoDeSessao"].includes(nome));

    afirmar(
      "a lista de telas do Painel foi DERIVADA dos imports, e não saiu vazia — vazia ela aprovaria qualquer coisa",
      bloco !== "" && telasDoPainel.length >= 2,
      `telas: ${telasDoPainel.join(", ") || "nenhuma"}`,
    );
    const foraDoBloco = telasDoPainel.filter((nome) => {
      const padrao = new RegExp(`<${nome}\\s*/>`, "g");
      const noArquivo = (principal.match(padrao) ?? []).length;
      const noBloco = (bloco.match(padrao) ?? []).length;
      return noBloco === 0 || noBloco !== noArquivo;
    });
    afirmar(
      "e TODAS elas são montadas só dentro do bloco de `/admin` — uma rota irmã nasceria fora do portão",
      foraDoBloco.length === 0,
      foraDoBloco.join(", "),
    );
  }
}

const portao = lerOuFalhar(
  path.join(DIR_SRC, "admin", "shell", "PortaoDeSessao.jsx"),
  "src/admin/shell/PortaoDeSessao.jsx existe",
);
if (portao !== null) {
  afirmar(
    "o portão mostra esqueleto enquanto a sessão carrega, nunca o Painel",
    /estado === "carregando"/.test(portao) && /Skeleton/.test(portao),
  );
  afirmar(
    "o portão só libera com estado explicitamente autenticado",
    /estado !== "autenticado"/.test(portao),
    "comparar pelo negativo faz um estado novo nascer fechado, não aberto",
  );
}

const pagina = lerOuFalhar(
  path.join(DIR_SRC, "pages", "AdminBlog.jsx"),
  "src/pages/AdminBlog.jsx existe",
);
if (pagina !== null) {
  afirmar(
    "a página do Painel não decide mais sobre acesso",
    !/\bauthed\b/.test(pagina) && !/LoginScreen/.test(pagina),
    "estado de autenticação dentro da página é o defeito original em outra forma",
  );
  /*
   * Sair continua no menu sob o nome do Autor — o que mudou na Story 1.5 é por
   * onde o menu chega à tela: a barra saiu da página para a casca, e é ela que
   * monta o menu agora. Verificar a corrente inteira (página → barra → menu →
   * `sair()`) é mais forte que procurar o nome do componente na página: cortar
   * qualquer elo derruba a asserção.
   */
  const barraDaCasca = lerOuFalhar(
    path.join(DIR_SRC, "admin", "shell", "BarraSuperior.jsx"),
    "src/admin/shell/BarraSuperior.jsx existe",
  );
  afirmar(
    "Sair vive no menu sob o nome do Autor, montado pela barra da casca",
    /<BarraSuperior\b/.test(pagina) &&
      barraDaCasca !== null &&
      /<MenuDoAutor\b/.test(barraDaCasca),
  );
  const menuDoAutor = lerOuFalhar(
    path.join(DIR_SRC, "admin", "shell", "MenuDoAutor.jsx"),
    "src/admin/shell/MenuDoAutor.jsx existe",
  );
  afirmar(
    "e o menu de fato encerra a sessão",
    menuDoAutor !== null &&
      /useSessao\(\)/.test(menuDoAutor) &&
      /await sair\(\)/.test(menuDoAutor),
  );
  afirmar(
    "Restaurar continua intocado na página (é de Carreiras, AD-15)",
    /setConfirmReset\(true\)/.test(pagina) && /Restaurar/.test(pagina),
  );
}

/* ─── (c) A tela de entrada não oferece autosserviço nem dica ────────────── */

secao("(c) a tela de entrada");

const tela = lerOuFalhar(
  path.join(DIR_SRC, "admin", "shell", "TelaDeEntrada.jsx"),
  "src/admin/shell/TelaDeEntrada.jsx existe",
);
if (tela !== null) {
  const proibidos = [
    ["chamada de cadastro", /\bsignUp\s*\(/],
    ["chamada de redefinição de senha", /resetPasswordForEmail|updateUser\s*\(/],
    ["texto de cadastro", /cadastr|criar\s+conta|nova\s+conta|registrar|inscre/i],
    ["texto de recuperação", /esqueci|esqueceu|recuperar|redefinir|reset(ar)?\s+senha/i],
    ["dica de credencial", /senha\s+padr|credencial\s+padr|senha:\s*\S|password:\s*["'`]/i],
  ];
  for (const [rotulo, padrao] of proibidos) {
    afirmar(
      `a tela de entrada não tem ${rotulo}`,
      !padrao.test(tela),
      (tela.match(padrao) ?? []).join(" "),
    );
  }
  afirmar(
    "os dois campos têm rótulo associado por htmlFor",
    (tela.match(/<Label\s+htmlFor=/g) ?? []).length >= 2,
  );
  afirmar(
    "o erro vive numa região `alert` permanente, anunciada por leitor de tela",
    /role="alert"/.test(tela),
  );
  // Sobre o CÓDIGO, não sobre a prosa: o arquivo explica em comentário por que
  // não soma `aria-live`, e a explicação não pode disparar o alarme.
  afirmar(
    "a região de erro não soma `aria-live` ao `role=\"alert\"`",
    !/aria-live/.test(linhasDeCodigo(tela).join("\n")),
    "role=alert já implica região viva assertiva; somar aria-live faz leitores divergirem sobre a prioridade",
  );
  afirmar(
    "o envio trata exceção, não só resultado negativo",
    /catch\s*\{/.test(tela) || /catch\s*\(/.test(tela),
    "sem `catch`, uma exceção deixaria o botão normal e a tela muda",
  );
  afirmar(
    "campos vazios são barrados antes de ir ao servidor",
    /trim\(\)\s*===\s*""/.test(tela),
    "enviar em branco voltaria como 'E-mail ou senha inválidos', mentindo sobre a causa",
  );
  afirmar(
    "há estado de envio visível",
    /enviando/.test(tela) && /disabled=\{enviando\}/.test(tela),
  );
  afirmar(
    "a tela consome os tokens do Painel (classe `painel`)",
    /className="painel/.test(tela),
    "fora de `.painel` os tokens da marca não valem e a tela nasce com a cor errada",
  );
}

const provedor = lerOuFalhar(
  path.join(DIR_SRC, "admin", "shell", "SessaoProvider.jsx"),
  "src/admin/shell/SessaoProvider.jsx existe",
);
if (provedor !== null) {
  afirmar(
    "o nome de exibição vem de `perfis`, não do e-mail",
    /from\("perfis"\)/.test(provedor) && /nome_exibicao/.test(provedor),
  );
  afirmar(
    "sair encerra a sessão pelo Supabase",
    /auth\.signOut\(/.test(provedor),
  );
  afirmar(
    "sair também derruba a sessão local quando o servidor recusa",
    /scope:\s*"local"/.test(provedor),
    "sem isto, Sair com rede ruim deixaria o token assinado no navegador",
  );
  // O ponto central da story: NENHUM caminho declara "autenticado" a partir de
  // `getSession()`, que devolve o que está guardado sem tocar a rede.
  afirmar(
    "o acesso só é concedido depois de validar a sessão no servidor",
    /validarSessaoNoServidor/.test(provedor),
    "getSession() não verifica nada — decidir por ele é o portão forjável de volta",
  );
  const trechosQueConcedem = [
    ...provedor.matchAll(/setEstado\(\s*"autenticado"\s*\)/g),
  ];
  afirmar(
    "conceder acesso acontece em pontos contados, todos após a validação",
    trechosQueConcedem.length === 2,
    `encontrados ${trechosQueConcedem.length} (esperados 2: token já validado e veredito válido)`,
  );
  afirmar(
    "a leitura do perfil trata rejeição da promessa",
    /\.catch\(/.test(provedor),
    "sem `catch`, o menu mostraria 'Carregando…' para sempre",
  );
}

const menu = lerOuFalhar(
  path.join(DIR_SRC, "admin", "shell", "MenuDoAutor.jsx"),
  "src/admin/shell/MenuDoAutor.jsx existe",
);
if (menu !== null) {
  const codigoDoMenu = linhasDeCodigo(menu).join("\n");
  afirmar(
    "o menu do Autor oferece Sair",
    /DropdownMenuItem/.test(menu) && /sair\(\)/.test(menu) && /Sair/.test(menu),
  );
  afirmar(
    "sair no menu tem estado pendente e trata rejeição",
    /saindo/.test(codigoDoMenu) && /catch/.test(codigoDoMenu),
    "promessa solta deixaria a pessoa achando que saiu sem ter saído",
  );
  afirmar(
    "o gatilho do menu tem nome acessível próprio",
    /aria-label=/.test(codigoDoMenu),
    "concatenar texto oculto ao nome visível vira 'Fulano de Tal Abrir menu da conta'",
  );
  // A Story 1.1 inteira existiu para que cor viesse de token. Cor crua aqui
  // volta a fixar a paleta no componente e não sobrevive à repintura da 1.5.
  const coresCruas = [
    ...codigoDoMenu.matchAll(
      /\b(?:text|bg|border|ring)-(zinc|slate|gray|neutral|stone|red|amber|yellow|emerald|green|blue|indigo|purple|pink|rose|cyan|teal|orange)-\d{2,3}\b/g,
    ),
  ].map((m) => m[0]);
  afirmar(
    "o menu do Autor não usa cor crua da paleta — só token",
    coresCruas.length === 0,
    coresCruas.join(", "),
  );
}

/* — A biblioteca de primitivos entra por um caminho só — */
{
  const comUmbrella = ocorrencias(fontes, /from\s+["']radix-ui["']/);
  afirmar(
    "nenhum componente importa o pacote guarda-chuva `radix-ui`",
    comUmbrella.length === 0,
    `${comUmbrella.join(", ")} — dois grafos da mesma biblioteca acabam em duas cópias de Portal/context`,
  );
  const declarado = (() => {
    try {
      return JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
    } catch {
      return null;
    }
  })();
  afirmar(
    "`radix-ui` (guarda-chuva) não é dependência do projeto",
    declarado !== null && !declarado.dependencies?.["radix-ui"],
    "os pacotes @radix-ui/react-* individuais já cobrem o que o shadcn usa",
  );
}

/* ─── (c2) As funções puras, EXECUTADAS ──────────────────────────────────── */

secao("(c2) as regras de sessão e de conta, executadas de verdade");

// Estas quatro existiam verificadas só por regex sobre o texto do arquivo.
// Inverter a comparação de `validarSenha` para `>`, ou fazer `lerArgumentos`
// ignorar flag desconhecida, manteria tudo verde — e a segunda regressão faria
// `--dryrun` escrever conta de verdade em produção, exatamente o que o
// comentário do script promete nunca acontecer. Aqui elas rodam.

{
  const casos = [
    ["rede fora (status 0)", { status: 0 }, ERRO_REDE],
    [
      "falha de fetch com nova tentativa",
      { name: "AuthRetryableFetchError", status: 0 },
      ERRO_REDE,
    ],
    ["limite de taxa (429)", { status: 429 }, ERRO_LIMITE],
    ["erro de servidor (500)", { status: 500 }, ERRO_SERVIDOR],
    ["credencial recusada (400)", { status: 400 }, ERRO_CREDENCIAL],
    [
      "e-mail inexistente (400, mesmo corpo)",
      { status: 400, code: "invalid_credentials" },
      ERRO_CREDENCIAL,
    ],
  ];
  for (const [nome, erro, esperado] of casos) {
    const obtido = mensagemDoErro(erro);
    afirmar(
      `mensagemDoErro: ${nome}`,
      obtido === esperado,
      `esperado "${esperado}", obtido "${obtido}"`,
    );
  }
  afirmar(
    "mensagemDoErro: infraestrutura e credencial NÃO compartilham mensagem",
    mensagemDoErro({ status: 0 }) !== mensagemDoErro({ status: 400 }),
    "confundir 'servidor fora' com 'senha errada' faz trocar a senha certa por outra",
  );
  afirmar(
    "mensagemDoErro: senha errada e e-mail inexistente dão a MESMA frase",
    mensagemDoErro({ status: 400, code: "invalid_credentials" }) ===
      mensagemDoErro({ status: 400, code: "user_not_found" }),
  );
}

{
  const noLimite = "a".repeat(TAMANHO_MINIMO_DA_SENHA);
  const curta = "a".repeat(TAMANHO_MINIMO_DA_SENHA - 1);
  afirmar(
    `validarSenha: aceita exatamente ${TAMANHO_MINIMO_DA_SENHA} caracteres`,
    validarSenha(noLimite) === null,
    String(validarSenha(noLimite)),
  );
  afirmar(
    `validarSenha: recusa ${TAMANHO_MINIMO_DA_SENHA - 1} caracteres`,
    typeof validarSenha(curta) === "string",
    "a fronteira invertida (`>` no lugar de `>=`) passaria despercebida por regex",
  );
  // bcrypt trunca em 72 BYTES e não avisa. Acento ocupa dois bytes, então uma
  // senha de 40 caracteres acentuados já passa do limite — contar caracteres
  // deixaria duas senhas diferentes abrindo a mesma Conta.
  const seteDoisBytes = "a".repeat(TAMANHO_MAXIMO_DA_SENHA_EM_BYTES);
  afirmar(
    `validarSenha: aceita exatamente ${TAMANHO_MAXIMO_DA_SENHA_EM_BYTES} bytes`,
    validarSenha(seteDoisBytes) === null,
    String(validarSenha(seteDoisBytes)),
  );
  afirmar(
    "validarSenha: recusa 73 bytes (bcrypt truncaria em silêncio)",
    typeof validarSenha(`${seteDoisBytes}a`) === "string",
  );
  const acentuada = "á".repeat(37); // 37 caracteres, 74 bytes
  afirmar(
    "validarSenha: conta BYTES, não caracteres (37 acentos = 74 bytes)",
    Buffer.byteLength(acentuada, "utf8") > TAMANHO_MAXIMO_DA_SENHA_EM_BYTES &&
      typeof validarSenha(acentuada) === "string",
    `bytes: ${Buffer.byteLength(acentuada, "utf8")}, veredito: ${validarSenha(acentuada)}`,
  );
  afirmar(
    "validarSenha: recusa espaço nas pontas",
    typeof validarSenha(` ${noLimite} `) === "string",
  );
}

{
  afirmar(
    "validarEntrada: aceita e-mail e nome válidos",
    validarEntrada({ email: "pessoa@chatclean.com.br", nome: "Pessoa" }).length === 0,
  );
  afirmar(
    "validarEntrada: recusa e-mail malformado",
    validarEntrada({ email: "nao-e-email", nome: "Pessoa" }).length > 0,
  );
  afirmar(
    "validarEntrada: exige nome",
    validarEntrada({ email: "pessoa@chatclean.com.br", nome: "" }).length > 0,
  );
  afirmar(
    "validarEntrada: recusa nome acima de 120 caracteres (restrição de `perfis`)",
    validarEntrada({
      email: "pessoa@chatclean.com.br",
      nome: "n".repeat(121),
    }).length > 0,
  );
}

{
  const typo = lerArgumentos(["--dryrun", "--email", "a@b.com", "--nome", "X"]);
  afirmar(
    "lerArgumentos: `--dryrun` (typo) cai em desconhecidos, NÃO vira simulação",
    typo.desconhecidos.includes("--dryrun") && typo.valores.simulacao === false,
    // Esta é a regressão cara: se o typo fosse ignorado, o script escreveria
    // conta de verdade em produção achando que estava simulando.
    `desconhecidos: ${typo.desconhecidos.join(", ")}, simulacao: ${typo.valores.simulacao}`,
  );
  const bom = lerArgumentos(["--dry-run", "--email", "A@B.com", "--nome", " X "]);
  afirmar(
    "lerArgumentos: `--dry-run` liga a simulação e normaliza os valores",
    bom.desconhecidos.length === 0 &&
      bom.valores.simulacao === true &&
      bom.valores.email === "a@b.com" &&
      bom.valores.nome === "X",
    JSON.stringify(bom),
  );
  const semValor = lerArgumentos(["--email", "--nome", "X"]);
  afirmar(
    "lerArgumentos: opção sem valor é acusada, não engolida",
    semValor.desconhecidos.some((d) => d.includes("--email")),
    `desconhecidos: ${semValor.desconhecidos.join(", ")}`,
  );
}

/* ─── (d) Fronteira de camadas: a casca não conhece domínio (AD-15) ──────── */

secao("(d) admin/shell não conhece domínio algum");

{
  const daCasca = arquivosDe(path.join(DIR_SRC, "admin", "shell"), [".js", ".jsx"]);
  afirmar("a casca tem arquivos", daCasca.length > 0);
  const vazamentos = ocorrencias(
    daCasca,
    /from\s+["']@?\/?(\.\.\/)*(src\/)?(pages|admin\/blog)\//,
  );
  afirmar(
    "a casca não importa de pages/ nem de admin/blog/",
    vazamentos.length === 0,
    vazamentos.join(", "),
  );
  const dominio = ocorrencias(daCasca, /\b(blogStore|vagasStore|getPosts|getVagas)\b/);
  afirmar(
    "a casca não conhece Post nem Vaga",
    dominio.length === 0,
    dominio.join(", "),
  );
}

/* ─── (e) Dependências e componentes que a story instala ─────────────────── */

secao("(e) dependências e componentes");

const pacote = lerOuFalhar(path.join(raiz, "package.json"), "package.json legível");
let pkg = null;
if (pacote !== null) {
  try {
    pkg = JSON.parse(pacote);
  } catch (erro) {
    afirmar("package.json parseia como JSON", false, erro.message);
  }
}
if (pkg) {
  afirmar(
    "@supabase/supabase-js é dependência de runtime",
    Boolean(pkg.dependencies?.["@supabase/supabase-js"]),
    `encontrado em devDependencies: ${Boolean(pkg.devDependencies?.["@supabase/supabase-js"])}`,
  );
  afirmar(
    'script "verificar:acesso" declarado',
    Boolean(pkg.scripts?.["verificar:acesso"]),
  );
  afirmar(
    "`verificar` encadeia também a verificação de acesso",
    /verificar:acesso/.test(pkg.scripts?.verificar ?? ""),
    `encontrado: ${pkg.scripts?.verificar ?? "ausente"}`,
  );
  for (const script of ["conta:criar", "conta:remover"]) {
    afirmar(`script "${script}" declarado`, Boolean(pkg.scripts?.[script]));
  }
}

for (const componente of ["input", "label", "dropdown-menu"]) {
  afirmar(
    `src/components/ui/${componente}.jsx instalado`,
    existsSync(path.join(DIR_SRC, "components", "ui", `${componente}.jsx`)),
  );
}

/* ─── (f) O bundle publicado ─────────────────────────────────────────────── */

secao("(f) bundle publicado em dist/");

const chavePublicavel = (() => {
  for (const arquivo of [".env", ".env.example"]) {
    const caminho = path.join(raiz, arquivo);
    if (!existsSync(caminho)) continue;
    const m = /VITE_SUPABASE_PUBLISHABLE_KEY\s*=\s*(\S+)/.exec(
      readFileSync(caminho, "utf8"),
    );
    if (m) return m[1];
  }
  return null;
})();
afirmar(
  "a chave publicável está declarada no ambiente",
  Boolean(chavePublicavel),
  "sem ela não há como afirmar o que o bundle deveria conter",
);

const bundles = arquivosDe(path.join(DIR_DIST, "assets"), [".js"]);
const temBundle = afirmar(
  "dist/assets/*.js existe",
  bundles.length > 0,
  "rode `npm run build` antes de verificar o bundle",
);

if (temBundle) {
  // Bundle velho é pior que bundle ausente: as asserções abaixo passariam
  // sobre um artefato anterior às mudanças e diriam nada.
  const maisNovoDaFonte = [
    ...arquivosDe(DIR_SRC, [".js", ".jsx", ".css", ".html"]),
    path.join(raiz, "package.json"),
    path.join(raiz, "index.html"),
    path.join(raiz, "vite.config.js"),
  ]
    .filter((p) => existsSync(p))
    .reduce((maior, p) => Math.max(maior, statSync(p).mtimeMs), 0);
  const maisVelhoDoBundle = bundles.reduce(
    (menor, p) => Math.min(menor, statSync(p).mtimeMs),
    Infinity,
  );
  afirmar(
    "o bundle é mais novo que o código-fonte",
    maisVelhoDoBundle >= maisNovoDaFonte,
    "dist/ está velho — rode `npm run build` e verifique de novo",
  );

  const juntos = bundles.map((b) => readFileSync(b, "utf8")).join("\n");

  afirmar(
    "o bundle contém a chave publicável",
    Boolean(chavePublicavel) && juntos.includes(chavePublicavel),
    "o Painel não conseguiria falar com o Supabase",
  );

  const proibidosNoBundle = [
    ["chave de serviço (`sb_secret_`)", /sb_secret_[A-Za-z0-9_-]{8,}/],
    ["token de conta da Management API (`sbp_`)", /\bsbp_[0-9a-f]{40}\b/],
    ["JWT de service_role", /"role"\s*:\s*"service_role"|service_role/],
    ["a senha antiga do Painel", /chatclean@admin/],
    ["a chave do portão falso", /cc_admin_auth/],
    ["a constante ADMIN_PASSWORD", /ADMIN_PASSWORD/],
  ];
  for (const [rotulo, padrao] of proibidosNoBundle) {
    const achado = padrao.exec(juntos);
    afirmar(
      `o bundle não contém ${rotulo}`,
      achado === null,
      achado ? `encontrado: ${String(achado[0]).slice(0, 24)}…` : "",
    );
  }

  // A chave publicável é a ÚNICA credencial do Supabase no bundle. Qualquer
  // outra chave com o prefixo do projeto é vazamento, não ajuste.
  const outrasChaves = [
    ...new Set(juntos.match(/\bsb_[a-z]+_[A-Za-z0-9_-]{10,}/g) ?? []),
  ].filter((k) => k !== chavePublicavel);
  afirmar(
    "nenhuma outra chave do Supabase viaja no bundle",
    outrasChaves.length === 0,
    outrasChaves.map((k) => `${k.slice(0, 18)}…`).join(", "),
  );
}

/* ─── (g) Comportamento real, contra o projeto ───────────────────────────── */

secao(`(g) login real contra ${NOME_PROJETO} (${REF_PROJETO})`);

const token = lerToken();
const temToken = afirmar(
  "SUPABASE_ACCESS_TOKEN presente no ambiente",
  Boolean(token),
  "sem ele a Conta temporária não pode ser criada — e as asserções não são puladas em silêncio",
);

/** POST/GET com tempo limite; falha de rede vira dado, não rejeição solta. */
async function chamar(url, opcoes = {}) {
  try {
    const r = await fetch(url, {
      ...opcoes,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { alcancou: true, status: r.status, corpo: await r.text() };
  } catch (erro) {
    return { alcancou: false, status: 0, corpo: "", erro: String(erro?.message ?? erro) };
  }
}

function autenticar(email, senha) {
  return chamar(`${URL_PROJETO}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
}

/** Limite de taxa do GoTrue: não é defeito do produto, é o ambiente dizendo não. */
const ehLimite = (r) => r?.status === 429;

/**
 * Armazenamento em memória com a mesma interface que o supabase-js espera do
 * `localStorage`. É o que permite simular, em Node, exatamente o que um
 * visitante faz ao escrever no console do navegador.
 */
function armazenamentoDeTeste(inicial) {
  const mapa = new Map(Object.entries(inicial ?? {}));
  return {
    mapa,
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => {
      mapa.set(k, String(v));
    },
    removeItem: (k) => {
      mapa.delete(k);
    },
  };
}

/** Cliente supabase-js REAL, com uma sessão já plantada no armazenamento. */
function clienteComSessaoGuardada(sessaoGuardada) {
  const chave = "cc-painel-sessao-teste";
  const armazenamento = armazenamentoDeTeste({
    [chave]: JSON.stringify(sessaoGuardada),
  });
  const cliente = createClient(URL_PROJETO, chavePublicavel, {
    auth: {
      storage: armazenamento,
      storageKey: chave,
      persistSession: true,
      // Sem renovação automática: o teste não quer temporizador de fundo
      // segurando o laço de eventos depois do veredito.
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return { cliente, armazenamento, chave };
}

if (temToken && chavePublicavel) {
  // Sufixo aleatório para que execuções concorrentes não disputem a mesma
  // Conta, e para que um resto de execução interrompida nunca seja reusado.
  const sufixo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const emailTemp = `verificacao.acesso+${sufixo}@chatclean.com.br`;
  const emailInexistente = `nao.existe+${sufixo}@chatclean.com.br`;
  const nomeTemp = "Conta Temporária de Verificação";
  // Senha de vida curta, gerada aqui e jamais escrita em arquivo nem impressa.
  const senhaTemp = `Vf-${sufixo}-${Math.random().toString(36).slice(2, 10)}!aZ9`;
  const senhaErrada = `${senhaTemp}-errada`;

  // Varredura de restos, ANTES de criar a próxima Conta de teste.
  //
  // O `finally` abaixo cobre asserção que falha e exceção que sobe — mas não
  // cobre o processo sendo morto no meio (terminal fechado, saída canalizada
  // para um `head` que fecha o cano, CI cancelado). Nesses casos sobra uma
  // Conta de teste viva num projeto de PRODUÇÃO, que é precisamente a porta
  // que estas stories fecham. A varredura limpa e ACUSA: se sobrou, a
  // execução falha uma vez e a seguinte já nasce limpa.
  const PADROES_DE_TESTE = [
    "verificacao.acesso+%@chatclean.com.br",
    "registro.direto+%@chatclean.com.br",
  ];
  const restos = await executarSql(
    token,
    `delete from auth.users
      where ${PADROES_DE_TESTE.map((p) => `email like ${literal(p)}`).join(" or ")}
      returning email`,
  );
  const sobraram = restos.ok && Array.isArray(restos.dados) ? restos.dados : [];
  afirmar(
    "nenhuma Conta de verificação sobrou de execuções anteriores",
    restos.ok && sobraram.length === 0,
    restos.ok
      ? `${sobraram.length} conta(s) removida(s) agora: ${sobraram.map((r) => r.email).join(", ")}`
      : restos.erro,
  );

  let criada = false;
  try {
    const criacao = await executarSql(
      token,
      sqlDeCriacaoDeConta({ email: emailTemp, senha: senhaTemp, nome: nomeTemp }),
    );
    const linha = criacao.ok && Array.isArray(criacao.dados) ? criacao.dados[0] : null;
    criada = Boolean(linha?.id);
    afirmar(
      "a Conta temporária foi criada pelo mesmo caminho do onboarding real",
      criada,
      criacao.ok ? "o INSERT não devolveu id" : criacao.erro,
    );

    if (criada) {
      const perfil = await executarSql(
        token,
        `select nome_exibicao from public.perfis where id = ${literal(linha.id)}::uuid`,
      );
      afirmar(
        "o gatilho criou o perfil junto da Conta",
        perfil.ok &&
          Array.isArray(perfil.dados) &&
          perfil.dados[0]?.nome_exibicao === nomeTemp,
        perfil.ok
          ? `encontrado: ${perfil.dados?.[0]?.nome_exibicao ?? "nenhum perfil"}`
          : perfil.erro,
      );

      /* — Credencial válida — */
      const boa = await autenticar(emailTemp, senhaTemp);
      let sessao = null;
      try {
        sessao = boa.corpo ? JSON.parse(boa.corpo) : null;
      } catch {
        sessao = null;
      }
      const MOTIVO_LIMITE =
        "o GoTrue respondeu 429 (limite de taxa). Não é defeito do Painel: a asserção não pôde ser exercida agora.";
      if (ehLimite(boa)) {
        adiar("login com a senha certa devolve 200 com token de acesso", MOTIVO_LIMITE);
      } else {
        afirmar(
          "login com a senha certa devolve 200 com token de acesso",
          boa.alcancou && boa.status === 200 && Boolean(sessao?.access_token),
          boa.alcancou ? `HTTP ${boa.status} ${boa.corpo.slice(0, 200)}` : boa.erro,
        );
      }

      /* — O nome do Autor, lido de `perfis` COM a sessão da própria Conta — */
      if (sessao?.access_token) {
        const leitura = await chamar(
          `${URL_PROJETO}/rest/v1/perfis?select=nome_exibicao&id=eq.${linha.id}`,
          {
            headers: {
              apikey: chavePublicavel,
              Authorization: `Bearer ${sessao.access_token}`,
            },
          },
        );
        let perfis = null;
        try {
          perfis = JSON.parse(leitura.corpo);
        } catch {
          perfis = null;
        }
        afirmar(
          "a sessão lê o próprio perfil pela política de RLS",
          leitura.status === 200 && perfis?.[0]?.nome_exibicao === nomeTemp,
          `HTTP ${leitura.status} ${leitura.corpo.slice(0, 200)}`,
        );
      } else if (ehLimite(boa)) {
        adiar("a sessão lê o próprio perfil pela política de RLS", MOTIVO_LIMITE);
      } else {
        afirmar("a sessão lê o próprio perfil pela política de RLS", false, "sem token de acesso");
      }

      /* — O sentido que importa da RLS: SEM sessão não se lê nada — */
      {
        const anonima = await chamar(
          `${URL_PROJETO}/rest/v1/perfis?select=nome_exibicao`,
          { headers: { apikey: chavePublicavel } },
        );
        let linhasAnonimas = null;
        try {
          linhasAnonimas = JSON.parse(anonima.corpo);
        } catch {
          linhasAnonimas = null;
        }
        // A política de leitura é `to authenticated`: sem sessão, o PostgREST
        // devolve 200 com conjunto VAZIO (a RLS filtra, não recusa) ou um 401.
        // As duas respostas servem; o que não pode é vazar linha.
        afirmar(
          "sem sessão, a chave publicável não lê perfil algum",
          (anonima.status === 200 &&
            Array.isArray(linhasAnonimas) &&
            linhasAnonimas.length === 0) ||
            anonima.status === 401,
          `HTTP ${anonima.status} ${anonima.corpo.slice(0, 200)}`,
        );
        afirmar(
          "nenhum nome de exibição vaza para quem não tem sessão",
          !anonima.corpo.includes(nomeTemp),
          anonima.corpo.slice(0, 200),
        );
      }

      /* ─── O PORTÃO FORJADO — a prova central da Story 1.4 ───────────────
         Não basta trocar a chave do portão falso pelo token do supabase-js:
         `getSession()` devolve o que está guardado SEM tocar a rede. Aqui o
         cliente é o supabase-js de verdade, com um armazenamento em memória
         contendo exatamente o objeto que um visitante escreveria no console. */
      {
        const agora = Math.floor(Date.now() / 1000);
        const sessaoForjada = {
          access_token: "forjado",
          refresh_token: "forjado",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: agora + 3600,
          user: {
            id: "00000000-0000-0000-0000-000000000000",
            aud: "authenticated",
            role: "authenticated",
            email: "invasor@exemplo.com",
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        };
        const { cliente, armazenamento, chave } =
          clienteComSessaoGuardada(sessaoForjada);

        // Premissa do mecanismo, registrada em NOTA e não em asserção: se um
        // dia o supabase-js passar a validar aqui, isso é melhora, não falha.
        const { data: guardada } = await cliente.auth.getSession();
        console.log(
          `  NOTA  getSession() ${guardada?.session ? "ACEITA" : "recusa"} a sessão forjada — é por isso que a validação no servidor existe`,
        );

        const veredito = await validarSessaoNoServidor(cliente);
        afirmar(
          "sessão forjada no armazenamento é RECUSADA pela validação no servidor",
          veredito.veredito === SESSAO_RECUSADA,
          `veredito: ${veredito.veredito} (${veredito.erro?.status ?? "sem status"} ${veredito.erro?.message ?? ""})`,
        );
        afirmar(
          "a sessão forjada é apagada do armazenamento, não sobrevive ao recarregar",
          armazenamento.mapa.get(chave) === undefined,
          `restou: ${String(armazenamento.mapa.get(chave) ?? "nada").slice(0, 80)}`,
        );
        const { data: depoisDaLimpeza } = await cliente.auth.getSession();
        afirmar(
          "depois da recusa, o cliente não tem mais sessão alguma",
          !depoisDaLimpeza?.session,
          "a sessão forjada continuaria disponível para a próxima tentativa",
        );
      }

      /* — O terceiro veredito: rede fora NÃO pode deslogar sessão legítima —
         Recusa e indisponibilidade não podem ser a mesma coisa. Se falha de
         rede apagasse a sessão, uma oscilação de Wi-Fi expulsaria quem tem
         credencial válida no meio do trabalho. */
      if (sessao?.access_token) {
        const chaveOffline = "cc-painel-sessao-teste";
        const armazenamentoOffline = armazenamentoDeTeste({
          [chaveOffline]: JSON.stringify(sessao),
        });
        // Porta 9 é o serviço `discard`: a conexão é recusada de imediato, sem
        // esperar tempo limite.
        const clienteOffline = createClient("http://127.0.0.1:9", chavePublicavel, {
          auth: {
            storage: armazenamentoOffline,
            storageKey: chaveOffline,
            persistSession: true,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const vereditoOffline = await validarSessaoNoServidor(clienteOffline);
        afirmar(
          "servidor inalcançável dá veredito INDETERMINADO, não recusa",
          vereditoOffline.veredito === SESSAO_INDETERMINADA,
          `veredito: ${vereditoOffline.veredito}`,
        );
        afirmar(
          "veredito indeterminado NÃO apaga a sessão guardada",
          armazenamentoOffline.mapa.get(chaveOffline) !== undefined,
          "apagar aqui expulsaria quem tem sessão legítima a cada oscilação de rede",
        );
      }

      /* — E o contrapeso: sessão REAL precisa ser aceita — */
      if (sessao?.access_token) {
        const { cliente } = clienteComSessaoGuardada(sessao);
        const veredito = await validarSessaoNoServidor(cliente);
        afirmar(
          "sessão real obtida no login é ACEITA pela mesma validação",
          veredito.veredito === SESSAO_VALIDA &&
            veredito.usuario?.email === emailTemp,
          `veredito: ${veredito.veredito}, e-mail: ${veredito.usuario?.email ?? "—"}`,
        );
      } else if (ehLimite(boa)) {
        adiar("sessão real obtida no login é ACEITA pela mesma validação", MOTIVO_LIMITE);
      } else {
        afirmar(
          "sessão real obtida no login é ACEITA pela mesma validação",
          false,
          "sem sessão real para testar — a recusa acima poderia ser recusa de tudo",
        );
      }

      /* — Renovação silenciosa: é o que faz a sessão sobreviver ao tempo — */
      let sessaoRenovada = null;
      if (sessao?.refresh_token) {
        const renovada = await chamar(
          `${URL_PROJETO}/auth/v1/token?grant_type=refresh_token`,
          {
            method: "POST",
            headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: sessao.refresh_token }),
          },
        );
        try {
          sessaoRenovada = JSON.parse(renovada.corpo);
        } catch {
          sessaoRenovada = null;
        }
        if (ehLimite(renovada)) {
          adiar("a sessão se renova por refresh token (renovação silenciosa)", MOTIVO_LIMITE);
        } else {
          afirmar(
            "a sessão se renova por refresh token (renovação silenciosa)",
            renovada.status === 200 && Boolean(sessaoRenovada?.access_token),
            `HTTP ${renovada.status} ${renovada.corpo.slice(0, 200)}`,
          );
        }
      } else if (ehLimite(boa)) {
        adiar("a sessão se renova por refresh token (renovação silenciosa)", MOTIVO_LIMITE);
      } else {
        afirmar("a sessão se renova por refresh token (renovação silenciosa)", false, "sem refresh token");
      }

      /* ─── SAIR, de verdade ──────────────────────────────────────────────
         As asserções de Sair eram regex sobre o texto ("`auth.signOut(`
         existe"). Remover o segundo passo do logout manteria tudo verde — e o
         efeito seria um token assinado sobrevivendo no `localStorage` de uma
         máquina compartilhada, renovado sozinho, abrindo o Painel no próximo
         carregamento. Aqui o logout acontece e a consequência é medida. */
      {
        const viva = sessaoRenovada?.access_token ? sessaoRenovada : sessao;
        if (viva?.access_token && viva?.refresh_token) {
          const saida = await chamar(`${URL_PROJETO}/auth/v1/logout`, {
            method: "POST",
            headers: {
              apikey: chavePublicavel,
              Authorization: `Bearer ${viva.access_token}`,
            },
          });
          afirmar(
            "sair encerra a sessão no servidor",
            saida.status === 204 || saida.status === 200,
            `HTTP ${saida.status} ${saida.corpo.slice(0, 200)}`,
          );

          const depoisDeSair = await chamar(
            `${URL_PROJETO}/auth/v1/token?grant_type=refresh_token`,
            {
              method: "POST",
              headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
              body: JSON.stringify({ refresh_token: viva.refresh_token }),
            },
          );
          if (ehLimite(depoisDeSair)) {
            adiar("depois de Sair, o refresh token deixa de valer", MOTIVO_LIMITE);
          } else {
            afirmar(
              "depois de Sair, o refresh token deixa de valer",
              depoisDeSair.status !== 200,
              `HTTP ${depoisDeSair.status} ${depoisDeSair.corpo.slice(0, 200)} — recarregar devolveria o acesso`,
            );
          }
        } else if (ehLimite(boa)) {
          adiar("sair encerra a sessão no servidor", MOTIVO_LIMITE);
          adiar("depois de Sair, o refresh token deixa de valer", MOTIVO_LIMITE);
        } else {
          afirmar("sair encerra a sessão no servidor", false, "sem sessão viva para encerrar");
        }
      }

      /* — Senha errada e e-mail inexistente: respostas indistinguíveis — */
      const errada = await autenticar(emailTemp, senhaErrada);
      const inexistente = await autenticar(emailInexistente, senhaTemp);
      const limitadoNaComparacao = ehLimite(errada) || ehLimite(inexistente);

      if (limitadoNaComparacao) {
        adiar("senha errada é recusada", MOTIVO_LIMITE);
        adiar("e-mail inexistente é recusado", MOTIVO_LIMITE);
        adiar("senha errada e e-mail inexistente produzem resposta idêntica", MOTIVO_LIMITE);
      } else {
        afirmar(
          "senha errada é recusada",
          errada.alcancou && errada.status === 400,
          errada.alcancou ? `HTTP ${errada.status}` : errada.erro,
        );
        afirmar(
          "e-mail inexistente é recusado",
          inexistente.alcancou && inexistente.status === 400,
          inexistente.alcancou ? `HTTP ${inexistente.status}` : inexistente.erro,
        );

        // O e-mail é removido do corpo antes da comparação: se um dia ele passar
        // a ser ecoado, a diferença estaria nele e não no motivo — e isso é outro
        // defeito, coberto pela asserção seguinte.
        const semEmail = (t, ...emails) =>
          emails.reduce((acc, e) => acc.split(e).join("«email»"), t);
        afirmar(
          "senha errada e e-mail inexistente produzem resposta idêntica",
          errada.status === inexistente.status &&
            semEmail(errada.corpo, emailTemp, emailInexistente) ===
              semEmail(inexistente.corpo, emailTemp, emailInexistente),
          `senha errada: HTTP ${errada.status} ${errada.corpo.slice(0, 120)} | inexistente: HTTP ${inexistente.status} ${inexistente.corpo.slice(0, 120)}`,
        );
      }
      afirmar(
        "nenhuma das duas respostas ecoa o e-mail consultado",
        !errada.corpo.includes(emailTemp) &&
          !inexistente.corpo.includes(emailInexistente),
        "ecoar o e-mail entrega ao atacante a confirmação de que a conta existe",
      );
    }

    /* — Registro direto pela API pública continua recusado — */
    const registro = await chamar(`${URL_PROJETO}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: chavePublicavel, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `registro.direto+${sufixo}@chatclean.com.br`,
        password: senhaTemp,
      }),
    });
    // A sonda precisa ter ALCANÇADO o fluxo: 401 de chave rotacionada, 404 de
    // rota mudada ou 429 de limite devolvem "não-2xx" sem testar nada.
    const alcancouRegistro =
      registro.alcancou && ![401, 403, 404, 429].includes(registro.status);
    afirmar(
      "a sonda de registro alcançou o endpoint",
      alcancouRegistro,
      registro.erro || `HTTP ${registro.status} ${registro.corpo.slice(0, 160)}`,
    );
    afirmar(
      "registro direto pela chave publicável é rejeitado",
      alcancouRegistro &&
        registro.status === 422 &&
        /signup.*disabled|signups?_not_allowed|signups not allowed/i.test(registro.corpo),
      `HTTP ${registro.status} ${registro.corpo.slice(0, 200)}`,
    );
    const sobrou = await executarSql(
      token,
      `select count(*)::int as n from auth.users where email = ${literal(`registro.direto+${sufixo}@chatclean.com.br`)}`,
    );
    const nasceu = sobrou.ok && (sobrou.dados?.[0]?.n ?? 0) > 0;
    if (nasceu) {
      await executarSql(
        token,
        sqlDeRemocaoDeConta(`registro.direto+${sufixo}@chatclean.com.br`),
      );
    }
    afirmar(
      "a tentativa de registro não criou conta alguma",
      !nasceu,
      nasceu ? "uma conta nasceu e foi removida — o registro público NÃO está fechado" : "",
    );
  } finally {
    // A Conta temporária sai daqui MESMO que uma asserção acima tenha falhado
    // ou que algo tenha lançado. Deixar conta de teste viva num projeto de
    // produção seria abrir exatamente a porta que esta story fecha.
    const remocao = await executarSql(token, sqlDeRemocaoDeConta(emailTemp));
    const restou = await executarSql(
      token,
      `select count(*)::int as n from auth.users where email = ${literal(emailTemp)}`,
    );
    afirmar(
      "a Conta temporária foi removida ao fim",
      remocao.ok && restou.ok && (restou.dados?.[0]?.n ?? 1) === 0,
      remocao.ok ? (restou.erro ?? "ainda existe") : remocao.erro,
    );
  }
} else if (temToken) {
  afirmar(
    "chave publicável disponível para o teste de login",
    false,
    "sem ela nenhuma asserção comportamental pode rodar",
  );
}

/* ─── (h) A entrega: o que fica na FRENTE de rota, e o `noindex` ─────────── */

secao("(h) a entrega: nada na frente de rota alcança /admin, e o noindex não depende de JavaScript");

/**
 * O padrão de origem da Vercel, virado em expressão regular.
 *
 * `/(.*)`, `/admin/:caminho*` e `/admin` são formas diferentes de dizer o que
 * uma regra alcança, e a pergunta desta seção — "o que fica na frente de
 * `/admin`?" — só se responde COMPARANDO. Casar texto não responde: a reescrita
 * apanha-tudo não contém a palavra "admin" e alcança `/admin` mesmo assim.
 */
function comoRegex(origem) {
  if (typeof origem !== "string" || origem === "") {
    throw new Error(`origem de regra ausente: ${JSON.stringify(origem)}`);
  }
  let corpo = "";
  let i = 0;
  while (i < origem.length) {
    const c = origem[i];
    if (c === "(") {
      // Grupo já escrito em expressão regular: copiado como está.
      const fim = origem.indexOf(")", i);
      if (fim === -1) {
        throw new Error(`grupo não fechado em ${JSON.stringify(origem)}`);
      }
      corpo += origem.slice(i, fim + 1);
      i = fim + 1;
      continue;
    }
    if (c === ":") {
      // `:nome` casa um segmento; `:nome*` casa o resto do caminho.
      const resto = origem.slice(i + 1);
      const nome = /^[A-Za-z0-9_]+/.exec(resto)?.[0] ?? "";
      if (nome === "") {
        throw new Error(`parâmetro sem nome em ${JSON.stringify(origem)}`);
      }
      i += 1 + nome.length;
      if (origem[i] === "(") {
        // `:nome(padrao)` — o padrão é do chamador e entra como está.
        const fim = origem.indexOf(")", i);
        if (fim === -1) {
          throw new Error(`padrão de parâmetro não fechado em ${JSON.stringify(origem)}`);
        }
        corpo += origem.slice(i, fim + 1);
        i = fim + 1;
        if (origem[i] === "*" || origem[i] === "+" || origem[i] === "?") {
          throw new Error(
            `forma não suportada \`:${nome}(...)${origem[i]}\` em ${JSON.stringify(origem)}`,
          );
        }
        continue;
      }
      if (origem[i] === "*") {
        corpo += ".*";
        i += 1;
      } else if (origem[i] === "+") {
        corpo += ".+";
        i += 1;
      } else if (origem[i] === "?") {
        /* Segmento OPCIONAL. Traduzi-lo como obrigatório faria uma regra que
           alcança `/admin` ser contada como se não alcançasse — que é o modo de
           erro que esta seção inteira existe para não ter. */
        throw new Error(`parâmetro opcional \`:${nome}?\` não é suportado`);
      } else {
        corpo += "[^/]+";
      }
      continue;
    }
    if (c === "*") {
      throw new Error(`curinga solto \`*\` não é suportado em ${JSON.stringify(origem)}`);
    }
    corpo += c.replace(/[.*+?^${}|[\]\\]/g, "\\$&");
    i += 1;
  }
  return new RegExp(`^${corpo}$`);
}

/**
 * A regra alcança este endereço?
 *
 * **Forma não suportada FALHA ALTO**, e isso é o coração desta seção. Devolver
 * `false` para o que o modelo não entende transforma uma regra que intercepta
 * `/admin` numa regra contada como se não interceptasse — e a asserção de
 * entrega inteira passaria verde sobre uma garantia que deixou de existir. Se o
 * modelo divergir do que a plataforma faz, isto precisa quebrar.
 */
function alcanca(origem, endereco) {
  return comoRegex(origem).test(endereco);
}

/**
 * A regra é condicional? `has` e `missing` fazem a Vercel aplicá-la só em
 * algumas requisições — e uma regra condicional não pode ser tratada como
 * sempre válida nem como inexistente. Enquanto o projeto não usa nenhuma, a
 * resposta honesta é recusar a configuração inteira.
 */
function ehCondicional(regra) {
  return (
    Object.hasOwn(regra ?? {}, "has") ||
    Object.hasOwn(regra ?? {}, "missing") ||
    Object.hasOwn(regra ?? {}, "methods")
  );
}

/* AUTOTESTE do comparador. Sem ele, um comparador que devolvesse `false` para
   tudo faria a lista de permissão inteira passar por vácuo — e a Borda plantada
   no dia do Épico 4 não seria vista. */
afirmar(
  "o comparador de origem reconhece o apanha-tudo, o segmento, o resto do caminho e o padrão explícito",
  alcanca("/(.*)", "/admin") &&
    alcanca("/(.*)", "/admin/previa/abc") &&
    alcanca("/admin", "/admin") &&
    !alcanca("/admin", "/admin/previa/abc") &&
    alcanca("/admin/:caminho*", "/admin/previa/abc") &&
    alcanca("/admin/:caminho*", "/admin/") &&
    !alcanca("/admin/:caminho*", "/blog") &&
    alcanca("/blog/:slug", "/blog/guia") &&
    !alcanca("/blog/:slug", "/admin") &&
    alcanca("/([aA][dD][mM][iI][nN])", "/Admin") &&
    alcanca("/([aA][dD][mM][iI][nN])", "/admin") &&
    !alcanca("/([aA][dD][mM][iI][nN])", "/blog"),
  "um comparador que sempre responde não deixaria a lista de permissão vazia — e vazia ela aprova tudo",
);
/* FORMA NÃO SUPORTADA FALHA ALTO. Devolver "não alcança" para o que o modelo
   não entende é o modo de erro que apaga a garantia inteira em silêncio: a
   regra que intercepta `/admin` sai da conta, e a lista de permissão fica
   vazia — e vazia ela aprova tudo. */
{
  const recusadas = [
    ["parâmetro opcional", "/admin/:caminho?"],
    ["curinga solto", "/admin/*"],
    ["grupo não fechado", "/admin/(x"],
    ["origem ausente", ""],
    ["origem que não é texto", null],
  ];
  const passaramCaladas = recusadas.filter(([, origem]) => {
    try {
      comoRegex(origem);
      return true;
    } catch {
      return false;
    }
  });
  afirmar(
    "e forma não suportada FALHA ALTO em vez de virar “não alcança” — o silêncio aqui esvaziaria a lista de permissão",
    passaramCaladas.length === 0,
    passaramCaladas.map(([nome]) => nome).join(", "),
  );
}

const ENDERECOS_DO_PAINEL = ["/admin", "/admin/previa/00000000-0000-4000-8000-000000000000"];

/**
 * A lista de PERMISSÃO das superfícies de entrega.
 *
 * Não é a lista do que é proibido — lista de proibição sempre tem uma forma de
 * evasão que ninguém pensou ainda. É a enumeração dos lugares onde, neste
 * projeto, alguma coisa PODE ficar na frente de uma rota; cada um é declarado
 * como esperado-presente ou esperado-ausente, e a asserção cobra o conjunto.
 *
 * Hoje a Função de Borda não existe: `api/posts.js` é função de runtime Node,
 * não há `middleware.*` na raiz e não há `supabase/functions/`. "Não passa pela
 * Borda" é, portanto, verdade por VÁCUO — e verdade por vácuo é a que some sem
 * avisar. Esta lista é o que transforma o vácuo numa asserção que acusa no dia
 * em que o Épico 4 criar a Borda sem excluir `/admin`.
 */
const SUPERFICIES_DA_ENTREGA = Object.freeze([
  {
    nome: "configuração da Vercel",
    caminhos: ["vercel.json"],
    esperada: "presente",
  },
  {
    nome: "middleware (Vercel/Next), que roda ANTES de toda rota",
    caminhos: [
      "middleware.js",
      "middleware.ts",
      "middleware.mjs",
      "src/middleware.js",
      "src/middleware.ts",
      "src/middleware.mjs",
    ],
    esperada: "ausente",
  },
  {
    nome: "cabeçalhos e redirecionamentos servidos como arquivo estático",
    caminhos: ["public/_headers", "public/_redirects", "public/_routes.json", "static.json"],
    esperada: "ausente",
  },
  {
    nome: "configuração de outra hospedagem",
    caminhos: ["netlify.toml", "firebase.json", "_routes.json", "wrangler.toml"],
    esperada: "ausente",
  },
  {
    nome: "Funções de Borda do Supabase",
    caminhos: ["supabase/functions"],
    esperada: "ausente",
  },
  /* AS DUAS SUPERFÍCIES MAIS ANTIGAS DO ASSUNTO. Numa story cujo tema é
     `noindex` em `/admin`, `robots.txt` e `sitemap.xml` são exatamente os
     arquivos que governam rastreamento — deixá-los fora da enumeração seria a
     lista de permissão com um buraco no lugar mais óbvio. */
  {
    nome: "declaração de rastreamento (robots.txt)",
    caminhos: ["public/robots.txt"],
    esperada: "presente",
  },
  {
    nome: "mapa do site (sitemap.xml)",
    caminhos: ["public/sitemap.xml"],
    esperada: "presente",
  },
]);

/** As superfícies que existem quando não deveriam, e as que faltam. */
function divergenciasDeSuperficie(existe) {
  const problemas = [];
  for (const superficie of SUPERFICIES_DA_ENTREGA) {
    const presentes = superficie.caminhos.filter((c) => existe(c));
    if (superficie.esperada === "presente" && presentes.length === 0) {
      problemas.push(`${superficie.nome}: esperada e AUSENTE`);
    }
    if (superficie.esperada === "ausente" && presentes.length > 0) {
      problemas.push(`${superficie.nome}: apareceu em ${presentes.join(", ")}`);
    }
  }
  return problemas;
}

{
  const existe = (relativo) => existsSync(path.join(raiz, relativo));
  const problemas = divergenciasDeSuperficie(existe);
  afirmar(
    "as superfícies de entrega são exatamente as declaradas — nenhuma camada nova apareceu na frente das rotas",
    problemas.length === 0,
    problemas.join(" | "),
  );
  /* AUTOTESTE: uma Borda PLANTADA precisa ser acusada. Sem esta linha, um
     enumerador que respondesse "nada existe" deixaria a asserção acima verde
     para sempre. */
  const comBordaPlantada = divergenciasDeSuperficie(
    (relativo) => relativo === "vercel.json" || relativo === "middleware.js",
  );
  const comBordaDoSupabase = divergenciasDeSuperficie(
    (relativo) => relativo === "vercel.json" || relativo === "supabase/functions",
  );
  const esperadasPresentes = SUPERFICIES_DA_ENTREGA.filter(
    (s) => s.esperada === "presente",
  ).length;
  afirmar(
    "e o enumerador ACUSA uma Borda plantada — de middleware na raiz e de função do Supabase",
    comBordaPlantada.length === 1 + (esperadasPresentes - 1) &&
      comBordaPlantada.some((p) => /middleware/.test(p)) &&
      comBordaDoSupabase.some((p) => /Borda do Supabase/.test(p)) &&
      divergenciasDeSuperficie(() => false).length === esperadasPresentes,
    `${comBordaPlantada.join(" | ")} || ${comBordaDoSupabase.join(" | ")}`,
  );
}

/* ── O rastreamento declarado: nenhum dos dois ANUNCIA o Painel ─────────── */
{
  const robots = lerOuFalhar(
    path.join(raiz, "public", "robots.txt"),
    "public/robots.txt existe",
  );
  const sitemap = lerOuFalhar(
    path.join(raiz, "public", "sitemap.xml"),
    "public/sitemap.xml existe",
  );

  /** As linhas VIVAS de robots.txt — comentário não é diretiva. */
  const diretivas = (robots ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));

  afirmar(
    "nenhuma diretiva viva de `robots.txt` cita `/admin` — o arquivo não ANUNCIA o Painel a quem não sabia dele",
    diretivas.every((l) => !/\/admin/i.test(l)),
    diretivas.filter((l) => /\/admin/i.test(l)).join(" | "),
  );
  /* E ELE NÃO BLOQUEIA A LEITURA, de propósito. `Disallow: /admin` trabalharia
     CONTRA o `noindex`: o rastreador que obedece ao bloqueio não busca a
     página, portanto nunca lê a diretiva — e um endereço descoberto por link
     continuaria podendo ser listado, só que sem conteúdo. Bloquear a leitura é
     o jeito de a diretiva nunca ser lida. */
  afirmar(
    "e ele não DESAUTORIZA a leitura de `/admin` — bloquear a busca é o jeito de o `noindex` nunca ser lido",
    diretivas.every((l) => !/^disallow\s*:\s*\/admin/i.test(l)),
    diretivas.filter((l) => /^disallow/i.test(l)).join(" | "),
  );
  afirmar(
    "e o mapa do site não lista `/admin` nem filha nenhuma dele",
    sitemap !== null && !/\/admin/i.test(sitemap),
    (/(<loc>[^<]*\/admin[^<]*<\/loc>)/i.exec(sitemap ?? "") ?? [])[0] ?? "",
  );
  /* CONTROLE POSITIVO: o mapa precisa listar ALGUMA coisa, senão a linha acima
     passaria por um arquivo vazio. */
  afirmar(
    "o mapa do site lista as páginas públicas — um arquivo vazio faria a linha acima passar por vácuo",
    ((sitemap ?? "").match(/<loc>/g) ?? []).length >= 3,
    `entradas: ${((sitemap ?? "").match(/<loc>/g) ?? []).length}`,
  );
}

/* ── Nenhuma função de `api/` roda na Borda ──────────────────────────────── */
{
  /** A fonte declara runtime de Borda? Lista de permissão: só Node é aceito. */
  const declaraBorda = (fonte) =>
    /runtime\s*[:=]\s*["'`]edge["'`]/.test(fonte) ||
    /export\s+const\s+runtime\s*=\s*["'`]edge["'`]/.test(fonte) ||
    /from\s+["']next\/server["']/.test(fonte);

  const funcoes = arquivosDe(path.join(raiz, "api"), [".js", ".mjs", ".ts"]);
  const naBorda = funcoes.filter((f) => declaraBorda(readFileSync(f, "utf8")));
  afirmar(
    "há funções de servidor para inspecionar — zero arquivos faria a varredura passar por vacuidade",
    funcoes.length > 0,
    `api/: ${funcoes.length} arquivo(s)`,
  );
  afirmar(
    "nenhuma função de `api/` declara runtime de Borda — o caminho único de escrita continua em Node",
    naBorda.length === 0,
    naBorda.map((f) => rel(f)).join(", "),
  );
  afirmar(
    "e o detector de Borda acusa as três formas de declará-la",
    declaraBorda("export const config = { runtime: 'edge' };") &&
      declaraBorda('export const runtime = "edge";') &&
      declaraBorda('import { NextResponse } from "next/server";') &&
      !declaraBorda("export const config = { runtime: 'nodejs' };"),
  );
}

/* ── O que a configuração da Vercel põe na frente de `/admin` ────────────── */
const configuracaoDaEntrega = (() => {
  const bruto = lerOuFalhar(path.join(raiz, "vercel.json"), "vercel.json existe");
  if (bruto === null) return null;
  try {
    return JSON.parse(bruto);
  } catch (erro) {
    afirmar("vercel.json é JSON válido", false, erro.message);
    return null;
  }
})();

if (configuracaoDaEntrega !== null) {
  /* AS CHAVES SÃO UMA LISTA FECHADA. `routes`, `redirects`, `functions` e
     `crons` são todas formas de pôr algo na frente de uma rota, e nenhuma delas
     existe hoje. Cobrar o CONJUNTO — e não a ausência de cada nome — é o que
     faz uma chave inventada amanhã cair aqui em vez de passar. */
  const chaves = Object.keys(configuracaoDaEntrega).sort();
  afirmar(
    "a configuração de entrega declara exatamente `headers` e `rewrites` — qualquer camada nova cai nesta linha",
    JSON.stringify(chaves) === JSON.stringify(["headers", "rewrites"]),
    chaves.join(", "),
  );

  const reescritas = configuracaoDaEntrega.rewrites ?? [];
  afirmar(
    "a única reescrita é o apanha-tudo que serve o documento da aplicação",
    reescritas.length === 1 &&
      reescritas[0].source === "/(.*)" &&
      reescritas[0].destination === "/index.html",
    JSON.stringify(reescritas),
  );

  /* NENHUMA REGRA É CONDICIONAL. `has`, `missing` e `methods` fazem a Vercel
     aplicar a regra só em algumas requisições — e uma regra condicional não
     pode ser tratada como sempre válida nem como inexistente. Enquanto o
     projeto não usa nenhuma, a resposta honesta é cobrar a ausência delas em
     vez de fingir que o modelo daqui as entende. */
  {
    const condicionais = [];
    for (const chave of ["rewrites", "redirects", "routes", "headers"]) {
      for (const regra of configuracaoDaEntrega[chave] ?? []) {
        if (ehCondicional(regra)) condicionais.push(`${chave}:${regra.source ?? regra.src}`);
      }
    }
    afirmar(
      "nenhuma regra de entrega é CONDICIONAL — o modelo desta ferramenta não sabe julgar `has`/`missing`, e fingir que sabe é pior",
      condicionais.length === 0,
      condicionais.join(" | "),
    );
    afirmar(
      "e o detector de condicional reconhece as três formas",
      ehCondicional({ has: [] }) &&
        ehCondicional({ missing: [] }) &&
        ehCondicional({ methods: ["GET"] }) &&
        !ehCondicional({ source: "/x" }),
    );
  }

  /* O CONJUNTO DO QUE ALCANÇA `/admin`, calculado e comparado. */
  const alcancam = [];
  for (const chave of ["rewrites", "redirects", "routes"]) {
    for (const regra of configuracaoDaEntrega[chave] ?? []) {
      const origem = regra.source ?? regra.src ?? "";
      if (ENDERECOS_DO_PAINEL.some((e) => alcanca(origem, e))) {
        alcancam.push(`${chave}:${origem}`);
      }
    }
  }
  afirmar(
    "o que fica na frente de `/admin` é EXATAMENTE a reescrita apanha-tudo — nada de redirecionamento, rota ou destino próprio",
    JSON.stringify(alcancam) === JSON.stringify(["rewrites:/(.*)"]),
    alcancam.join(" | "),
  );

  /* ── `noindex` na entrega: a camada que vale sem JavaScript ───────────── */
  const moduloDaPrevia = lerOuFalhar(
    path.join(DIR_SRC, "admin", "blog", "previa.js"),
    "src/admin/blog/previa.js existe",
  );
  /* O NOME DO CABEÇALHO VEM DO MÓDULO, e não de um literal escrito aqui.
     Enquanto o nome vivia em três lugares — `vercel.json`, a constante do
     módulo e a comparação desta ferramenta —, a constante prometia ser fonte
     única e não travava nada: renomear duas das três deixava a suíte verde. */
  const nomeDoCabecalho =
    /CABECALHO_DE_ROBOS\s*=\s*["']([^"']+)["']/.exec(moduloDaPrevia ?? "")?.[1] ?? "";
  afirmar(
    "o nome do cabeçalho de robôs é declarado no módulo — e é ele que esta ferramenta usa para procurar, não um literal próprio",
    nomeDoCabecalho !== "",
    "sem a constante não há fonte única: o nome passaria a existir em três cópias sem trava",
  );

  const cabecalhos = configuracaoDaEntrega.headers ?? [];
  const roboDe = (endereco) => {
    const valores = [];
    for (const grupo of cabecalhos) {
      if (!alcanca(grupo.source ?? "", endereco)) continue;
      for (const h of grupo.headers ?? []) {
        if (String(h.key ?? "").toLowerCase() === nomeDoCabecalho.toLowerCase()) {
          valores.push(h.value);
        }
      }
    }
    return valores;
  };
  afirmar(
    "e a entrega usa EXATAMENTE esse nome — nenhum outro cabeçalho entrou de carona",
    cabecalhos.every((g) =>
      (g.headers ?? []).every((h) => String(h.key ?? "") === nomeDoCabecalho),
    ),
    cabecalhos
      .flatMap((g) => (g.headers ?? []).map((h) => h.key))
      .join(", "),
  );
  afirmar(
    "a entrega declara `noindex` para `/admin` E para as filhas dela — a prévia é uma filha",
    ENDERECOS_DO_PAINEL.every((e) => roboDe(e).some((v) => /noindex/i.test(v))),
    ENDERECOS_DO_PAINEL.map((e) => `${e}: ${roboDe(e).join(", ") || "nenhum"}`).join(" | "),
  );
  /* ─── E VALE COM QUALQUER CAIXA NO ENDEREÇO ────────────────────────────
     O roteador do navegador casa `/Admin/previa/…` sem diferenciar caixa; o
     cabeçalho da entrega compara texto. Sem cobrir as variantes, um endereço do
     Painel seria servido SEM o `noindex` — e portanto indexável — só por ter
     sido escrito com maiúscula. */
  {
    const variantes = [
      "/Admin",
      "/ADMIN",
      "/aDmIn",
      "/Admin/previa/00000000-0000-4000-8000-000000000000",
      "/ADMIN/previa/00000000-0000-4000-8000-000000000000",
    ];
    const descobertas = variantes.filter((e) => !roboDe(e).some((v) => /noindex/i.test(v)));
    afirmar(
      "e vale para o endereço escrito com QUALQUER caixa — o roteador casa `/Admin`, e o cabeçalho precisa acompanhar",
      descobertas.length === 0,
      descobertas.join(", "),
    );
  }
  afirmar(
    "e o `noindex` NÃO alcança o site público — a garantia é do Painel, não uma tesoura sobre o blog",
    ["/", "/blog", "/blog/guia-de-atalhos", "/carreiras"].every(
      (e) => roboDe(e).length === 0,
    ),
    ["/", "/blog", "/blog/guia-de-atalhos", "/carreiras"]
      .map((e) => `${e}: ${roboDe(e).join(", ") || "nenhum"}`)
      .join(" | "),
  );

  /* AS DUAS CAMADAS DIZEM A MESMA COISA, e o valor vem de um lugar só. Duas
     constantes divergem no dia em que uma delas mudar, e a divergência
     apareceria como cabeçalho dizendo uma coisa e documento dizendo outra. */
  if (moduloDaPrevia !== null) {
    const valorDoModulo =
      /VALOR_DE_NOINDEX\s*=\s*["']([^"']+)["']/.exec(moduloDaPrevia)?.[1] ?? "";
    afirmar(
      "o valor da diretiva é o MESMO na entrega e no documento — uma constante só, e não duas que divergem",
      valorDoModulo !== "" &&
        ENDERECOS_DO_PAINEL.every((e) => roboDe(e).includes(valorDoModulo)),
      `módulo: ${JSON.stringify(valorDoModulo)} | entrega: ${roboDe("/admin").join(", ")}`,
    );
  }

  /* E O `index.html` CONTINUA DIZENDO `index, follow` — é contra isto que o
     cabeçalho precisa valer, e é por isto que meta injetada por JavaScript não
     bastaria sozinha: a reescrita apanha-tudo serve ESTE documento para
     `/admin` também. */
  {
    const documento = lerOuFalhar(path.join(raiz, "index.html"), "index.html existe");
    const meta =
      documento === null
        ? ""
        : (/<meta\s+name="robots"\s+content="([^"]*)"/.exec(documento)?.[1] ?? "");
    afirmar(
      "o documento servido para TODA rota ainda diz `index` — o cabeçalho é a única camada que responde antes do JavaScript",
      /index/i.test(meta) && !/noindex/i.test(meta),
      `meta do documento: ${JSON.stringify(meta)}`,
    );
  }
}

/* ─── (i) O portão, OBSERVADO: sem sessão o conteúdo não monta ───────────── */

secao("(i) o portão montado: sem sessão, a prévia não chega ao DOM");

/*
 * POR QUE ESTA SEÇÃO EXISTE, E POR QUE ELA VEM POR ÚLTIMO.
 *
 * Ler que `PortaoDeSessao` envolve a rota não é o mesmo que VER o conteúdo não
 * montar. A rota da prévia é a primeira tela do Painel com endereço próprio, e
 * "quem não está autenticado não monta o conteúdo protegido nem por um
 * instante" é uma afirmação sobre comportamento — não sobre a forma do JSX.
 *
 * Vem por último porque montar o DOM de mentira instala `window`, `document` e
 * `navigator` em `globalThis`, e as seções anteriores falam com a rede de
 * verdade. Poluir depois é a única ordem em que uma coisa não estraga a outra.
 *
 * O arranjo é o de `montagem-comum.mjs` — o MESMO que `verificar-editor.mjs`
 * usa. Um segundo JSDOM configurado à parte divergiria do primeiro no primeiro
 * ajuste de qualquer um dos dois.
 */
{
  const montagem = await (async () => {
    const pasta = criarPastaDeCompilacao("verificar-acesso-");
    /* Os dois conversores de caminho vêm do módulo compartilhado: eles foram
       extraídos para lá exatamente para não existirem em três cópias. */
    const real = caminhoDeModulo;
    const arquivo = (nome) => path.join(pasta, nome);
    const modulo = comoModulo;

    writeFileSync(
      arquivo("controle.js"),
      "export const controle = {\n" +
        "  estado: 'anonimo',\n" +
        /* O que a fronteira de dados RECEBEU. É por aqui que "nem por um
           instante" deixa de ser uma frase: um efeito que rodasse no ramo
           errado apareceria aqui, mesmo que o DOM já tivesse sido trocado. */
        "  leituras: [],\n" +
        "  post: { ok: false, erro: { tipo: 'nao_encontrado', mensagem: 'sem post' } },\n" +
        "};\n",
    );

    writeFileSync(
      arquivo("duble-posts.js"),
      `export * from ${real("src/data/blog/posts.js")};\n` +
        'import { controle } from "./controle.js";\n' +
        "export async function lerPostDoPainelPorId(id) {\n" +
        "  controle.leituras.push(id);\n" +
        "  return controle.post;\n" +
        "}\n",
    );

    /* O PORTÃO E O HOOK SÃO OS REAIS, e a sessão entra pelo CONTEXTO — o mesmo
       que `SessaoProvider` alimenta em produção. Dublar `useSessao` trocaria
       justamente a peça que decide; o que se troca aqui é só quem informa o
       estado, porque o provedor de verdade falaria com o Supabase e "falhou
       por falta de ambiente" é a falha que não é falha. */
    const fonte =
      `export { default as PortaoDeSessao } from ${real("src/admin/shell/PortaoDeSessao.jsx")};\n` +
      `export { ContextoDeSessao } from ${real("src/admin/shell/useSessao.js")};\n` +
      `export { default as PreVisualizacaoDePost } from ${real("src/admin/blog/PreVisualizacaoDePost.jsx")};\n` +
      `export * as previa from ${real("src/admin/blog/previa.js")};\n` +
      `export * as rotas from ${real("src/admin/blog/rotas.js")};\n` +
      `export { controle } from ${modulo(arquivo("controle.js"))};\n`;

    const compilado = await compilarParaNode({
      pasta,
      fonte,
      alias: { "@/data/blog/posts": arquivo("duble-posts.js") },
    });
    return { pasta, arquivo: compilado.arquivo };
  })().catch((erro) => {
    afirmar(
      "o portão e a prévia compilam pelo empacotador da aplicação",
      false,
      String(erro?.message ?? erro).slice(0, 300),
    );
    return null;
  });

  if (montagem) {
    afirmar("o portão e a prévia compilam pelo empacotador da aplicação", true);

    const janela = montarNavegador();
    const modulo = await import(pathToFileURL(montagem.arquivo).href);
    const React = (await import("react")).default;
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    const roteador = await import("react-router-dom");
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
      writable: true,
    });

    const ID = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";
    modulo.controle.post = {
      ok: true,
      dados: {
        id: ID,
        slug: "",
        titulo: "Rascunho que não pode vazar",
        resumo: "",
        estado: "rascunho",
        conteudo_html: "<p>SEGREDO DO RASCUNHO</p>",
      },
    };

    /* A MESMA COMPOSIÇÃO DE `main.jsx`: o portão no elemento do PAI, e a prévia
       como filha servida por `Outlet`. Se o portão não montar `children`, a
       filha não existe — é essa a garantia que se observa aqui. */
    const montar = async () => {
      const alvo = janela.document.createElement("div");
      janela.document.body.appendChild(alvo);
      const valorDaSessao = {
        estado: modulo.controle.estado,
        email:
          modulo.controle.estado === "autenticado" ? "autor@exemplo.local" : null,
        perfil: { carregando: false, nome: "Autor de Prova", erro: null },
        erroDeAmbiente: null,
        erroDeSessao: null,
        entrar: async () => ({ ok: false, mensagem: "não nesta prova" }),
        sair: async () => {},
      };
      const raizReact = createRoot(alvo);
      await act(async () => {
        raizReact.render(
          React.createElement(
            modulo.ContextoDeSessao.Provider,
            { value: valorDaSessao },
            React.createElement(
              roteador.MemoryRouter,
              {
                initialEntries: [
                  `${modulo.rotas.BASE_DO_PAINEL}/${modulo.rotas.SEGMENTO_DA_PREVIA}/${ID}`,
                ],
              },
              React.createElement(
                roteador.Routes,
                null,
                React.createElement(
                  roteador.Route,
                  {
                    path: modulo.rotas.BASE_DO_PAINEL,
                    element: React.createElement(
                      modulo.PortaoDeSessao,
                      null,
                      React.createElement(roteador.Outlet),
                    ),
                  },
                  React.createElement(roteador.Route, {
                    path: modulo.rotas.ROTA_DA_PREVIA,
                    element: React.createElement(modulo.PreVisualizacaoDePost),
                  }),
                ),
              ),
            ),
          ),
        );
      });
      return {
        previa: () => alvo.querySelector('[data-tela="previa"]'),
        entrada: () => alvo.querySelector("form input[type='password']"),
        texto: () => alvo.textContent ?? "",
        async desmontar() {
          await act(async () => raizReact.unmount());
          alvo.remove();
        },
      };
    };

    for (const estado of ["anonimo", "carregando"]) {
      modulo.controle.estado = estado;
      modulo.controle.leituras = [];
      const tela = await montar();
      afirmar(
        `com a sessão em "${estado}", a prévia NÃO chega ao DOM — o portão é o mesmo do Painel, e ele não abriu`,
        tela.previa() === null,
        `encontrado: ${tela.previa()?.getAttribute("data-situacao")}`,
      );
      afirmar(
        `e nada do Post vazou em "${estado}": nenhuma leitura saiu, e o conteúdo não apareceu na página`,
        modulo.controle.leituras.length === 0 &&
          !tela.texto().includes("SEGREDO DO RASCUNHO") &&
          !tela.texto().includes("Rascunho que não pode vazar"),
        `leituras: ${modulo.controle.leituras.length}`,
      );
      await tela.desmontar();
    }

    afirmar(
      "sem sessão o que aparece é a TELA DE ENTRADA, no mesmo endereço — não um redirecionamento que apaga para onde a pessoa ia",
      await (async () => {
        modulo.controle.estado = "anonimo";
        const tela = await montar();
        const temEntrada = tela.entrada() !== null;
        await tela.desmontar();
        return temEntrada;
      })(),
    );

    /* CONTROLE POSITIVO. Sem ele, um componente que nunca montasse em situação
       nenhuma — porque o pacote quebrou, porque a rota não casa — faria as
       asserções acima passarem sem provar nada sobre o portão. */
    {
      modulo.controle.estado = "autenticado";
      modulo.controle.leituras = [];
      const tela = await montar();
      afirmar(
        "e COM sessão a mesma rota monta a prévia e lê o Post — sem isto, as recusas acima passariam por um pacote quebrado",
        tela.previa() !== null &&
          JSON.stringify(modulo.controle.leituras) === JSON.stringify([ID]) &&
          tela.texto().includes("Rascunho que não pode vazar"),
        `previa: ${tela.previa() !== null} | leituras: ${JSON.stringify(modulo.controle.leituras)}`,
      );
      await tela.desmontar();
    }

    /* ── NAVEGAR ENTRE IRMÃS NÃO PODE DERRUBAR O PAI ──────────────────────
       `AnimatePresence` em modo "wait" desmonta e remonta a árvore quando a
       CHAVE muda. Com o caminho inteiro como chave, ir de `/admin` para
       `/admin/previa/:id` derrubava `SessaoProvider` e `PortaoDeSessao` junto:
       o bootstrap de sessão recomeçava e o esqueleto piscava — o portão
       continuava correto, mas a continuidade que os comentários prometem não
       existia. A chave passou a ser o primeiro segmento. */
    {
      const { chaveDaTransicao } = await import(
        pathToFileURL(path.join(DIR_SRC, "lib", "motion.js")).href
      );
      afirmar(
        "a chave da transição é o PRIMEIRO SEGMENTO: navegar entre irmãs de `/admin` não remonta o provedor nem o portão",
        chaveDaTransicao("/admin") === chaveDaTransicao("/admin/previa/abc") &&
          chaveDaTransicao("/admin") === chaveDaTransicao("/admin/previa/abc?pendente=1") &&
          chaveDaTransicao("/blog/um-post") === chaveDaTransicao("/blog"),
        `${chaveDaTransicao("/admin")} × ${chaveDaTransicao("/admin/previa/abc")}`,
      );
      afirmar(
        "e a troca de PÁGINA continua sendo uma chave diferente — a animação não some junto",
        chaveDaTransicao("/") !== chaveDaTransicao("/admin") &&
          chaveDaTransicao("/blog") !== chaveDaTransicao("/admin") &&
          chaveDaTransicao("/carreiras") !== chaveDaTransicao("/blog"),
        `${chaveDaTransicao("/")} | ${chaveDaTransicao("/blog")} | ${chaveDaTransicao("/admin")}`,
      );
      /* E A CASCA DE ANIMAÇÃO USA ESSA FUNÇÃO — sem esta linha, ela poderia
         continuar chaveando pelo caminho inteiro com a asserção acima verde. */
      const casca = lerOuFalhar(
        path.join(DIR_SRC, "components", "animated", "AnimatedRoutes.jsx"),
        "src/components/animated/AnimatedRoutes.jsx existe",
      );
      afirmar(
        "e é essa função que a casca de animação usa como chave — não o caminho inteiro",
        casca !== null &&
          /key=\{chaveDaTransicao\(location\.pathname\)\}/.test(casca) &&
          !/key=\{location\.pathname\}/.test(casca),
        (/key=\{[^}]*\}/.exec(casca ?? "") ?? [])[0] ?? "",
      );
    }

    try {
      rmSync(montagem.pasta, { recursive: true, force: true });
    } catch {
      /* no Windows a pasta pode ficar presa pelo processo; a próxima execução varre */
    }
  }
}

/* ─── Veredito ───────────────────────────────────────────────────────────── */

console.log("");
// O adiamento aparece no veredito, sempre, mesmo quando tudo passou: uma
// asserção que não rodou não pode se esconder atrás de uma linha verde.
if (adiadas > 0) {
  console.log(
    `ATENÇÃO: ${adiadas} asserção(ões) NÃO foram exercidas (limite de taxa do GoTrue). Rode de novo em alguns minutos para cobri-las.`,
  );
}
if (falhas === 0) {
  console.log(
    adiadas === 0
      ? "Acesso verificado: todas as asserções passaram."
      : `Acesso verificado com ressalva: nenhuma falha, mas ${adiadas} asserção(ões) ficaram sem exercício.`,
  );
  process.exitCode = 0;
} else {
  console.log(`Acesso NÃO verificado: ${falhas} asserção(ões) falharam.`);
  process.exitCode = 1;
}

});
