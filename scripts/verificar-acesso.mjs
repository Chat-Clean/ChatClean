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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

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
 * A varredura é por vizinhança de CÓDIGO, não por arquivo:
 * `blogStore`/`vagasStore` usam `localStorage` legitimamente, para conteúdo, e
 * proibir a API inteira apenas empurraria a decisão de acesso para outro nome.
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
