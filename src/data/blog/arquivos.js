/**
 * O envio da capa para o Storage — o único módulo do navegador que manda
 * arquivo, e o que sai daqui é um ENDEREÇO.
 *
 * ─── POR QUE ISTO NÃO CONTRADIZ "NENHUM CLIENTE ESCREVE" ────────────────────
 *
 * A regra do projeto é sobre as TABELAS: a RLS nega escrita a `anon` e a
 * `authenticated` em `posts`, `categorias`, `tags`, `posts_tags` e
 * `slugs_antigos`, e o único caminho para elas é a função em `api/`. Ela
 * continua inteira — o endereço que este módulo devolve entra no Post pela
 * porta única, como qualquer outro campo.
 *
 * O ARQUIVO é outro recurso, com outro cadeado: a política de `storage.objects`
 * da Story 3.1, que exige sessão para inserir e para remover, e libera só a
 * leitura ao anônimo. Mandar um megabyte por uma função de servidor para
 * reescrever a mesma garantia com a chave de serviço tornaria a política
 * irrelevante — e o critério de aceite descreve literalmente "a escrita e a
 * exclusão exigem sessão autenticada", o que só faz sentido se quem escreve é a
 * sessão.
 *
 * ─── O CLIENTE VEM DO PONTO ÚNICO ──────────────────────────────────────────
 *
 * `clienteDoPainelOuFalha`, de `comum.js`, como toda leitura do Painel. A Story
 * 2.6 já pegou uma regressão em que a escrita chamava `clienteAutenticado()`
 * direto, e a asserção de fronteira de `verificar:dados` cobra que todo ponto
 * que obtém cliente esteja na lista de permissão — este está.
 *
 * ─── E A RECUSA ACONTECE ANTES DA REDE ─────────────────────────────────────
 *
 * Espécie e tamanho são conhecidos no navegador antes de o primeiro byte sair.
 * Recusar depois de subir um megabyte gasta a espera de quem já errou. O
 * vocabulário é o do domínio, importado — o mesmo que o bucket aplica do outro
 * lado, e o mesmo que o servidor cobra sobre o endereço.
 */

import {
  BUCKET_DAS_IMAGENS,
  BYTES_DA_ASSINATURA,
  CACHE_DA_CAPA_EM_SEGUNDOS,
  baseDoEnderecoPublico as baseDe,
  caminhoDaCapa,
  caminhoDaCapaNoEndereco,
  caminhoDoCorpo,
  caminhoDoCorpoNoEndereco,
  especieDeclarada,
  problemaNoArquivo,
  problemaNoArquivoDoCorpo,
  LARGURA_MAXIMA_DA_IMAGEM_DO_CORPO,
  QUALIDADE_DO_WEBP,
} from "../../domain/blog/arquivos.js";
import { clienteDoPainelOuFalha } from "./comum.js";
import { urlDoProjeto } from "../supabase/clientes.js";
import { ERRO_DADOS_INVALIDOS as TIPO_DE_DADOS_INVALIDOS } from "./escrita.js";
import {
  ERRO_CONFIGURACAO,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  ERRO_PERMISSAO,
  daRespostaDoSupabase,
  deExcecao,
  falha,
  sucesso,
} from "./resultado.js";

/**
 * Remove do Storage uma capa que o servidor NUNCA VIU.
 *
 * ─── POR QUE ESTA REMOÇÃO É DO CLIENTE, E A OUTRA É DO SERVIDOR ────────────
 *
 * São dois arquivos com donos diferentes:
 *
 *   o que JÁ ESTÁ GRAVADO num Post é do servidor. Ele sai depois de a linha
 *   mudar, com a chave de serviço, porque enquanto o Autor não salvou a capa
 *   que está no ar continua sendo aquela — apagá-la daqui deixaria um Post
 *   publicado apontando para um arquivo que não existe mais;
 *
 *   o que foi ENVIADO NESTA SESSÃO e ainda não foi salvo é do Autor. O
 *   servidor não sabe que ele existe, então nenhum salvamento futuro o
 *   alcança: trocar a capa duas vezes antes de salvar deixava o primeiro
 *   arquivo no bucket PARA SEMPRE, e sem nem virar resíduo, porque não havia
 *   quem o nomeasse.
 *
 * É também o que dá uso à política de remoção autenticada do bucket. Sem ela,
 * a política seria capacidade concedida e nunca exercida — superfície sem
 * contrapartida, que é o argumento que este projeto já usou para revogar a
 * busca do Painel de `anon`.
 *
 * Devolve resultado ou erro TIPADO, como tudo aqui. **Nunca lança.** Endereço
 * que não é deste bucket devolve `nao_encontrado` sem tentar nada: a chave é
 * a sessão do Autor, e apagar às cegas com ela é tão ruim quanto com a de
 * serviço.
 */
export async function removerImagemDeCapa(
  endereco,
  { obterCliente = clienteDoPainelOuFalha } = {},
) {
  const operacao = "removerImagemDeCapa";
  const caminho = caminhoDaCapaNoEndereco(baseDe(endereco), endereco);
  if (caminho === null) {
    return falha(ERRO_NAO_ENCONTRADO, {
      operacao,
      detalhe: `endereço fora do bucket das imagens: ${JSON.stringify(String(endereco ?? "").slice(0, 120))}`,
    });
  }

  const cliente = await obterCliente(operacao);
  if (!cliente.ok) return cliente;

  let resposta;
  try {
    resposta = await cliente.dados.storage.from(BUCKET_DAS_IMAGENS).remove([caminho]);
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }
  if (resposta?.error) return daRespostaDoSupabase(resposta, operacao);
  return sucesso({ caminho });
}

/**
 * A recusa de FORMA do arquivo — IMPORTADA, e não escrita de novo.
 *
 * Ela nasceu em `escrita.js` na Story 2.5, e a primeira versão deste módulo a
 * declarava aqui "com a mesma grafia". Mesma grafia é a promessa que uma
 * terceira cópia faz e não cumpre: nada compararia as duas, e a divergência
 * apareceria como um arquivo recusado que a tela classifica como defeito.
 *
 * Ela não mora em `resultado.js` porque aquele módulo é o vocabulário da
 * LEITURA: acrescentá-la lá faria toda consulta declarar um modo de falha que
 * ela não tem.
 */
export { ERRO_DADOS_INVALIDOS } from "./escrita.js";

/**
 * O endereço público de um caminho, montado pelo cliente.
 *
 * A URL base do projeto **não** é lida aqui: quem a conhece é
 * `data/supabase/clientes.js`, o único lugar que instancia cliente. O que este
 * módulo faz é perguntar ao próprio cliente — o supabase-js já sabe montar o
 * endereço público, e uma segunda montagem aqui divergiria no dia em que o
 * Storage mudasse o prefixo.
 */
function enderecoPublico(cliente, caminho) {
  try {
    const bruto = cliente.storage.from(BUCKET_DAS_IMAGENS).getPublicUrl(caminho);
    const url = String(bruto?.data?.publicUrl ?? "").trim();
    return url === "" ? null : url;
  } catch {
    return null;
  }
}

/* A RAIZ DO PROJETO DENTRO DE UM ENDEREÇO PÚBLICO vem do DOMÍNIO desde a Story
   3.2 — `baseDoEnderecoPublico`, importada aqui com o nome curto `baseDe`.
   Ela morava neste arquivo, e subiu quando o segundo consumidor apareceu: a
   gaveta precisa da mesma pergunta para decidir em que modo o campo de capa
   nasce, e duas implementações do mesmo recorte divergiriam no dia em que o
   Storage mudasse o prefixo.

   Ela existe para que a conferência do endereço devolvido seja feita pela MESMA
   função do domínio que o servidor usa, sem este módulo precisar conhecer a
   variável de ambiente — que é de `data/supabase/clientes.js`, e não daqui. */

/**
 * A raiz do projeto, para quem precisa perguntar "esta capa é NOSSA?".
 *
 * Devolve `""` quando o ambiente não a declara, e quem chama trata isso como
 * "não sei" — nunca como "não é nossa".
 *
 * Ela é exposta daqui, e não importada de `data/supabase/clientes.js` pelo
 * Painel, porque a arquitetura diz que quem fala com a infraestrutura de
 * cliente é a camada de dados. O Editor pergunta a esta camada, como pergunta
 * todo o resto.
 *
 * **Isto é a resposta EXATA, e não a forma.** `baseDoEnderecoPublico` recorta a
 * raiz de dentro do próprio endereço, e por isso classifica a capa de OUTRO
 * projeto Supabase como nossa: ela serve para conferir o endereço que o nosso
 * Storage acabou de devolver, e não para julgar um endereço vindo de fora.
 */
export function baseDoProjeto() {
  return String(urlDoProjeto() ?? "").replace(/\/+$/, "");
}

/**
 * Os primeiros bytes do arquivo — e SÓ eles.
 *
 * `BYTES_DA_ASSINATURA` é doze hoje. Isto não é "ler o arquivo em memória":
 * `File.slice` devolve uma fatia preguiçosa, e o que chega à memória é o
 * cabeçalho. Ler o arquivo inteiro para texto ou para base64 é o que a Story
 * 3.1 proíbe, e há varredura no projeto que acusa.
 *
 * Devolve `null` quando não dá para ler — e `null` é tratado como espécie
 * desconhecida, que é recusa, e não como "tudo bem".
 */
async function assinaturaDe(arquivo) {
  try {
    const fatia = arquivo.slice(0, BYTES_DA_ASSINATURA);
    const buffer = await fatia.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/** Um identificador de arquivo, no formato que `caminhoDaCapa` aceita. */
function identificadorNovo() {
  const aleatorio = globalThis.crypto?.randomUUID;
  if (typeof aleatorio === "function") return globalThis.crypto.randomUUID();
  /* Runtime sem `crypto.randomUUID` (jsdom antigo, navegador fora de contexto
     seguro). O nome não é segredo — ele só precisa não colidir —, e derrubar o
     envio por causa da forma do nome trocaria um problema pequeno por um
     grande.

     ─── E O SORTEIO PRECISA PRODUZIR O COMPRIMENTO QUE ELE PROMETE ────────
     A versão anterior usava `Math.random().toString(36).slice(2, 10)`, que
     devolve MENOS de oito caracteres com frequência nada desprezível (o
     `toString(36)` de `0.5` é `"0.i"`) e `""` quando o sorteio dá zero. O nome
     saía curto, `caminhoDaCapa` o reprovava, e o envio morria em
     `inesperado` — exatamente o problema grande que o comentário dizia estar
     evitando. Agora o comprimento é construído, não torcido. */
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  let chave = "";
  while (chave.length < 24) {
    chave += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return `${chave}-${Date.now().toString(36)}`;
}

/**
 * Envia a capa e devolve o **endereço público absoluto**.
 *
 * `{ ok: true, dados: { url, caminho } }` ou `{ ok: false, erro }` — erro
 * TIPADO, com a mesma forma do resto da camada. **Nunca lança.**
 *
 * As costuras (`obterCliente`, `lerAssinatura`, `novoIdentificador`) são
 * injetáveis com o comportamento real como padrão, pela mesma razão que as de
 * `escrita.js`: sem elas, o que este módulo manda para o Storage só seria
 * observável abrindo uma sessão de verdade, e a verificação teria de se
 * contentar em LER o código.
 */
export async function enviarImagemDeCapa(
  arquivo,
  {
    obterCliente = clienteDoPainelOuFalha,
    lerAssinatura = assinaturaDe,
    novoIdentificador = identificadorNovo,
  } = {},
) {
  const operacao = "enviarImagemDeCapa";

  if (arquivo === null || typeof arquivo !== "object" || typeof arquivo.slice !== "function") {
    return falhaDoEnvio({
      operacao,
      mensagem: "Escolha um arquivo de imagem para a capa.",
      detalhe: `o que chegou não é um arquivo: ${arquivo === null ? "null" : typeof arquivo}`,
    });
  }

  /* ── A RECUSA VEM ANTES DA REDE, E ANTES ATÉ DO CLIENTE ───────────────
     Obter o cliente pode falhar por falta de `.env`, e um arquivo de 5 MB
     recusado com "a configuração do Supabase está incompleta" mandaria a
     pessoa consertar a coisa errada. Tamanho e espécie primeiro. */
  const assinatura = await lerAssinatura(arquivo);
  const problema = problemaNoArquivo({
    tamanho: arquivo.size,
    tipo: arquivo.type,
    assinatura,
  });
  if (problema !== null) {
    return falhaDoEnvio({
      operacao,
      mensagem: problema,
      detalhe:
        `arquivo recusado antes da rede: ${arquivo.size} bytes, ` +
        `tipo ${JSON.stringify(String(arquivo.type ?? ""))}`,
    });
  }

  const caminho = caminhoDaCapa(especieDeclarada(arquivo.type), novoIdentificador());
  if (caminho === null) {
    return falha(ERRO_INESPERADO, {
      operacao,
      detalhe: "não foi possível montar o caminho da capa no bucket",
    });
  }

  const cliente = await obterCliente(operacao);
  if (!cliente.ok) return cliente;

  let resposta;
  try {
    resposta = await cliente.dados.storage.from(BUCKET_DAS_IMAGENS).upload(caminho, arquivo, {
      /* NUNCA sobrescreve. Cada capa nasce com nome próprio, e `upsert` seria a
         única forma de um envio apagar o arquivo de outro Post. Sem política de
         `update` no bucket ele nem funcionaria — e falhar por política é pior
         que não pedir. */
      upsert: false,
      contentType: especieDeclarada(arquivo.type),
      cacheControl: String(CACHE_DA_CAPA_EM_SEGUNDOS),
    });
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }

  if (resposta?.error) {
    const erro = daRespostaDoSupabase(resposta, operacao);
    /* SESSÃO VENCIDA DIZ PARA ENTRAR DE NOVO. A política do bucket recusa quem
       não é `authenticated`, e o Storage responde com violação de RLS — que o
       classificador já lê como permissão. A frase genérica da leitura ("Esta
       leitura exige uma sessão válida") fala de uma consulta que ninguém fez;
       esta fala do envio. */
    if (erro.erro.tipo === ERRO_PERMISSAO) {
      return falha(ERRO_PERMISSAO, {
        operacao,
        mensagem:
          "Sua sessão não autoriza enviar imagens. Entre no Painel de novo e envie outra vez.",
        detalhe: erro.erro.detalhe,
        codigo: erro.erro.codigo,
        status: erro.erro.status,
      });
    }
    return erro;
  }

  const url = enderecoPublico(cliente.dados, caminho);
  /* O ENDEREÇO É CONFERIDO CONTRA O DOMÍNIO ANTES DE VOLTAR. O arquivo está no
     bucket; o que não pode acontecer é a tela receber um endereço que o
     servidor vai recusar na hora de salvar — a pessoa veria a miniatura
     aparecer e o salvamento falhar por um motivo que ela não causou. */
  if (url === null || caminhoDaCapaNoEndereco(baseDe(url), url) === null) {
    return falha(ERRO_CONFIGURACAO, {
      operacao,
      mensagem:
        "A imagem subiu, mas não conseguimos montar o endereço público dela. Avise quem cuida do projeto.",
      detalhe:
        "endereço devolvido pelo Storage fora do formato esperado: " +
        JSON.stringify(String(url ?? "").slice(0, 120)),
    });
  }

  return sucesso({ url, caminho });
}

/**
 * Reduz e converte a imagem para WebP, no navegador, antes de qualquer rede.
 *
 * NÃO é exportada de propósito: é etapa interna de `enviarImagemDoCorpo`, e
 * exportá-la a colocaria na lista de funções de escrita que `verificar:dados`
 * cobra usarem o cliente de sessão — esta não fala com rede nenhuma.
 *
 * ─── POR QUE A CONVERSÃO EXISTE ─────────────────────────────────────────
 *
 * É ela que permite o teto GENEROSO de entrada (10 MB) sem afrouxar nada do
 * lado do armazenamento: uma foto de câmera de 8 MB vira algo na casa das
 * centenas de kB, e o bucket — que continua com o limite da capa — nunca
 * chega perto de ser incomodado. O leitor do blog também ganha: WebP no
 * lugar de JPEG de câmera é a diferença entre um artigo que abre e um que
 * arrasta no celular.
 *
 * ─── E POR QUE ELA NUNCA DERRUBA O ENVIO ────────────────────────────────
 *
 * Navegador sem `toBlob`, sem WebP, ou imagem que o decodificador recusa:
 * qualquer um desses devolve `null`, e quem chama sobe o arquivo ORIGINAL.
 * Otimização é ganho, não requisito — e falhar a inserção da imagem porque a
 * compressão não rolou seria trocar um benefício por um defeito.
 */
async function otimizarParaWebp(arquivo) {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return null;
  }

  let desenho = null;
  try {
    desenho = await createImageBitmap(arquivo);

    const escala = Math.min(1, LARGURA_MAXIMA_DA_IMAGEM_DO_CORPO / desenho.width);
    const largura = Math.max(1, Math.round(desenho.width * escala));
    const altura = Math.max(1, Math.round(desenho.height * escala));

    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const pincel = tela.getContext("2d");
    if (pincel === null) return null;
    pincel.drawImage(desenho, 0, 0, largura, altura);

    const convertido = await new Promise((resolver) => {
      if (typeof tela.toBlob !== "function") {
        resolver(null);
        return;
      }
      tela.toBlob((blob) => resolver(blob), "image/webp", QUALIDADE_DO_WEBP);
    });

    /* `toBlob` devolve PNG quando o navegador não sabe fazer WebP — conferir
       o tipo é o que impede subir um PNG gigante achando que é um WebP
       pequeno. E se o resultado ficou MAIOR que a entrada (acontece com
       imagem já otimizada, ou com PNG de poucas cores), o original vence:
       converter para piorar não é otimizar. */
    if (convertido === null || convertido.type !== "image/webp") return null;
    if (convertido.size >= arquivo.size && escala === 1) return null;

    return convertido;
  } catch {
    return null;
  } finally {
    desenho?.close?.();
  }
}

/**
 * Envia uma imagem INLINE do corpo do Post e devolve o **endereço público
 * absoluto** — espelho de `enviarImagemDeCapa`, acima, trocando a pasta do
 * bucket (`caminhoDoCorpo`, em vez de `caminhoDaCapa`), a mensagem que nomeia
 * o que falhou e o TETO DE ENTRADA, que aqui é o do corpo (10 MB) e não o da
 * capa (1 MB) — ver `domain/blog/arquivos.js` para o porquê de serem
 * diferentes. MESMO bucket (`imagens-do-blog`), MESMO desenho de nome de
 * arquivo (identificador novo, nunca o nome escolhido pelo Autor).
 *
 * A imagem é REDUZIDA E CONVERTIDA para WebP antes de subir. O teto maior de
 * entrada e a conversão são a mesma decisão: aceitar o arquivo grande que a
 * pessoa tem em mãos, e guardar o pequeno que o leitor vai baixar.
 *
 * É a função que `ImageUploadNode.configure({ upload })` injeta no editor
 * (`admin/blog/BarraDoEditor.jsx`): o Tiptap chama `upload(arquivo)`, esta
 * função sobe o arquivo e devolve a URL que vira `src` do nó `image`.
 *
 * `{ ok: true, dados: { url, caminho } }` ou `{ ok: false, erro }` — erro
 * TIPADO. **Nunca lança.**
 */
export async function enviarImagemDoCorpo(
  arquivo,
  {
    obterCliente = clienteDoPainelOuFalha,
    lerAssinatura = assinaturaDe,
    novoIdentificador = identificadorNovo,
  } = {},
) {
  const operacao = "enviarImagemDoCorpo";

  if (arquivo === null || typeof arquivo !== "object" || typeof arquivo.slice !== "function") {
    return falhaDoEnvio({
      operacao,
      mensagem: "Escolha um arquivo de imagem para inserir no texto.",
      detalhe: `o que chegou não é um arquivo: ${arquivo === null ? "null" : typeof arquivo}`,
    });
  }

  const assinatura = await lerAssinatura(arquivo);
  /* O TETO DO CORPO, e não o da capa. A conferência de espécie continua sendo
     pelos BYTES — a extensão trocada morre aqui, antes da rede, como na capa. */
  const problema = problemaNoArquivoDoCorpo({
    tamanho: arquivo.size,
    tipo: arquivo.type,
    assinatura,
  });
  if (problema !== null) {
    return falhaDoEnvio({
      operacao,
      mensagem: problema,
      detalhe:
        `arquivo recusado antes da rede: ${arquivo.size} bytes, ` +
        `tipo ${JSON.stringify(String(arquivo.type ?? ""))}`,
    });
  }

  /* A OTIMIZAÇÃO ACONTECE DEPOIS DA RECUSA E ANTES DA REDE. Depois, porque
     converter um arquivo que vai ser recusado é trabalho jogado fora — e
     porque a conferência de espécie precisa ver os bytes ORIGINAIS, não os
     que o canvas produziu. Antes da rede, porque o ponto todo é o bucket
     receber o arquivo pequeno.

     Falhou a conversão? `otimizarParaWebp` devolve `null` e o ORIGINAL sobe —
     ver o comentário dela. Por isso `paraEnviar` e `especie` andam juntos: o
     caminho no bucket leva a extensão do que realmente vai subir. */
  const otimizado = await otimizarParaWebp(arquivo);
  const paraEnviar = otimizado ?? arquivo;
  const especie = otimizado === null ? especieDeclarada(arquivo.type) : "image/webp";

  const caminho = caminhoDoCorpo(especie, novoIdentificador());
  if (caminho === null) {
    return falha(ERRO_INESPERADO, {
      operacao,
      detalhe: "não foi possível montar o caminho da imagem no bucket",
    });
  }

  const cliente = await obterCliente(operacao);
  if (!cliente.ok) return cliente;

  let resposta;
  try {
    resposta = await cliente.dados.storage.from(BUCKET_DAS_IMAGENS).upload(caminho, paraEnviar, {
      // NUNCA sobrescreve — mesmo motivo de `enviarImagemDeCapa`: cada envio
      // nasce com nome próprio.
      upsert: false,
      // A espécie do que REALMENTE sobe: `image/webp` quando a conversão deu
      // certo, a original quando ela não deu. É a mesma que nomeou o caminho.
      contentType: especie,
      cacheControl: String(CACHE_DA_CAPA_EM_SEGUNDOS),
    });
  } catch (excecao) {
    return deExcecao(excecao, operacao);
  }

  if (resposta?.error) {
    const erro = daRespostaDoSupabase(resposta, operacao);
    if (erro.erro.tipo === ERRO_PERMISSAO) {
      return falha(ERRO_PERMISSAO, {
        operacao,
        mensagem:
          "Sua sessão não autoriza enviar imagens. Entre no Painel de novo e envie outra vez.",
        detalhe: erro.erro.detalhe,
        codigo: erro.erro.codigo,
        status: erro.erro.status,
      });
    }
    return erro;
  }

  const url = enderecoPublico(cliente.dados, caminho);
  if (url === null || caminhoDoCorpoNoEndereco(baseDe(url), url) === null) {
    return falha(ERRO_CONFIGURACAO, {
      operacao,
      mensagem:
        "A imagem subiu, mas não conseguimos montar o endereço público dela. Avise quem cuida do projeto.",
      detalhe:
        "endereço devolvido pelo Storage fora do formato esperado: " +
        JSON.stringify(String(url ?? "").slice(0, 120)),
    });
  }

  return sucesso({ url, caminho });
}

/**
 * Falha de FORMA do arquivo, com o tipo que a leitura não conhece.
 *
 * `falha` de `resultado.js` transformaria `dados_invalidos` em `inesperado` — e
 * a tela perderia a distinção entre "este arquivo não serve, escolha outro" e
 * "algo saiu do previsto". Por isso o objeto é montado aqui, com a MESMA forma.
 */
function falhaDoEnvio({ operacao, mensagem, detalhe }) {
  return Object.freeze({
    ok: false,
    erro: Object.freeze({
      tipo: TIPO_DE_DADOS_INVALIDOS,
      mensagem,
      operacao,
      detalhe: String(detalhe ?? ""),
      codigo: "",
      status: null,
    }),
  });
}
