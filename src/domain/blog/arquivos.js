/**
 * O vocabulário fechado do arquivo de imagem: que espécies existem, qual é o
 * teto de tamanho, como um endereço público do bucket se monta e se desmonta, e
 * o que faz um endereço de capa ser aceitável.
 *
 * Puro: sem React, sem rede, sem `fetch`, sem cliente. É importado pelos três
 * lados que precisam concordar — a **tela** (que recusa antes de mandar), o
 * **servidor** (que recusa de novo, inclusive de quem não passou pela tela) e a
 * **verificação** (que compara este módulo com a restrição do banco sobre um
 * corpus). Duas listas divergem no primeiro formato novo; uma lista importada
 * por todo mundo não tem como divergir.
 *
 * ─── POR QUE A ESPÉCIE É DECIDIDA PELO CONTEÚDO, E NÃO PELO NOME ────────────
 *
 * `documento.pdf` renomeado para `foto.png` chega ao navegador com
 * `type: "image/png"` em alguns sistemas e com o tipo do PDF em outros — o
 * `type` de um `File` vem do palpite do sistema operacional sobre a extensão, e
 * palpite não é garantia. O que decide aqui é a **assinatura**: os primeiros
 * bytes do arquivo, comparados com a lista fechada. É a mesma disciplina da
 * lista de permissão que vale para o resto do projeto, aplicada ao byte.
 *
 * ─── E POR QUE SVG NÃO ESTÁ AQUI ────────────────────────────────────────────
 *
 * `image/svg+xml` é uma imagem para o navegador e um DOCUMENTO para o motor de
 * renderização: ele carrega `<script>`, `onload` e referência externa, e um
 * bucket de leitura pública servindo SVG do mesmo domínio do site é execução de
 * script de terceiro no nosso domínio. A ausência é a decisão, e ela está
 * asserida — `ESPECIES_SEMPRE_RECUSADAS` existe para que "esquecemos" e
 * "decidimos" não sejam a mesma coisa.
 *
 * ─── E POR QUE O TETO É PEQUENO ─────────────────────────────────────────────
 *
 * 1 MB é deliberado e menor que o usual: os geradores de prévia de link do
 * WhatsApp e da Meta impõem limites bem abaixo de 5 MB e tempos de espera
 * curtos, então uma capa de 4 MB seria aceita aqui e ignorada por eles — o
 * defeito apareceria como "o link não mostra imagem", longe da causa.
 *
 * ─── O ÚNICO IMPORT DESTE ARQUIVO ───────────────────────────────────────────
 *
 * `TAMANHO_MAXIMO_DO_ENDERECO`, `temCaractereForaDoEndereco` e
 * `enderecoDeImagemPermitido` moram em `domain/blog/schema.js` — o nó `image`
 * do documento (`NOS.image`) precisa da MESMA regra dentro da travessia
 * síncrona de `validarDocumento`, e `schema.js` é o único arquivo do domínio
 * que não importa nada (a condição que o mantém executável antes de qualquer
 * DOM). Reexportadas abaixo com o MESMO nome: quem já importava desta capa
 * continua importando o mesmo símbolo, e `imagem_url`/`seo_imagem_url` e o
 * `src` de `NOS.image` continuam validados pela ÚNICA função, nunca por uma
 * segunda regra de endereço.
 */
import {
  TAMANHO_MAXIMO_DO_ENDERECO,
  temCaractereForaDoEndereco,
  enderecoDeImagemPermitido,
} from "./schema.js";
export { TAMANHO_MAXIMO_DO_ENDERECO, enderecoDeImagemPermitido };

/* ─── O bucket, e o formato do endereço público ──────────────────────────── */

/**
 * O bucket das imagens do blog. Nome declarado UMA vez: ele aparece na
 * migração, na política, no envio e na remoção, e uma segunda grafia seria um
 * envio bem-sucedido para um bucket que política nenhuma protege.
 */
export const BUCKET_DAS_IMAGENS = "imagens-do-blog";

/** A pasta das capas dentro do bucket. */
export const PASTA_DAS_CAPAS = "capas";

/**
 * A pasta das imagens INLINE do corpo do Post — mesmo bucket, pasta PRÓPRIA.
 *
 * `enviarImagemDoCorpo` (`data/blog/arquivos.js`) usa `caminhoDoCorpo`, abaixo,
 * exatamente como `enviarImagemDeCapa` usa `caminhoDaCapa`: um identificador
 * novo por envio, nunca o nome do arquivo escolhido. A pasta é diferente da
 * capa por decisão — a política de `storage.objects` já libera o bucket
 * inteiro para leitura e escrita autenticada (ela decide por `bucket_id`, não
 * por prefixo), então a separação aqui é só ORGANIZAÇÃO: distinguir "capa de
 * Post" de "imagem dentro do texto" ao olhar o bucket, e permitir que a
 * limpeza de órfã (`api/_nucleo/salvarPost.js`) reconheça as duas famílias
 * sem ambiguidade.
 */
export const PASTA_DO_CORPO = "corpo";

/**
 * O prefixo que o Storage do Supabase dá a todo arquivo de bucket público.
 *
 * Ele é parte do contrato do produto, não do nosso: `/storage/v1/object/public/`
 * é o caminho que serve o arquivo sem credencial nenhuma.
 */
export const PREFIXO_PUBLICO_DO_STORAGE = "/storage/v1/object/public/";

/* ─── Espécie ────────────────────────────────────────────────────────────── */

/**
 * As três espécies aceitas, cada uma com a extensão que a nomeia e a
 * ASSINATURA que a identifica.
 *
 * `assinatura` é uma lista de `[posicao, bytes]`: o WebP precisa de duas
 * (`RIFF` no começo e `WEBP` no oitavo byte), porque `RIFF` sozinho também é
 * áudio WAV e vídeo AVI.
 */
export const ESPECIES_DE_IMAGEM = Object.freeze([
  Object.freeze({
    tipo: "image/jpeg",
    rotulo: "JPEG",
    extensao: "jpg",
    assinatura: Object.freeze([Object.freeze([0, Object.freeze([0xff, 0xd8, 0xff])])]),
  }),
  Object.freeze({
    tipo: "image/png",
    rotulo: "PNG",
    extensao: "png",
    assinatura: Object.freeze([
      Object.freeze([0, Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    ]),
  }),
  Object.freeze({
    tipo: "image/webp",
    rotulo: "WebP",
    extensao: "webp",
    assinatura: Object.freeze([
      Object.freeze([0, Object.freeze([0x52, 0x49, 0x46, 0x46])]), // "RIFF"
      Object.freeze([8, Object.freeze([0x57, 0x45, 0x42, 0x50])]), // "WEBP"
    ]),
  }),
]);

/**
 * As espécies que NÃO entram, e por quê.
 *
 * Uma lista de permissão diz o que passa e não diz o que foi pensado e
 * recusado. Esta diz — e a verificação cobra que nenhuma delas apareça em
 * `TIPOS_DE_IMAGEM` nem na lista de tipos do bucket. Sem ela, alguém
 * acrescentando SVG "porque é imagem" não encontraria nada que discordasse.
 */
export const ESPECIES_SEMPRE_RECUSADAS = Object.freeze([
  Object.freeze({
    tipo: "image/svg+xml",
    motivo:
      "SVG carrega script executável, e servi-lo do mesmo domínio do site é execução de terceiro no nosso domínio",
  }),
  Object.freeze({
    tipo: "image/gif",
    motivo:
      "GIF animado é vídeo com outro nome: pesa muito para uma capa e os geradores de prévia de link não o renderizam",
  }),
  Object.freeze({
    tipo: "application/pdf",
    motivo: "PDF não é imagem, e nenhum `<img>` o mostra",
  }),
]);

/** Os tipos aceitos, na ordem declarada. Lista FECHADA. */
export const TIPOS_DE_IMAGEM = Object.freeze(ESPECIES_DE_IMAGEM.map((e) => e.tipo));

/** Os rótulos, para a recusa dizer o que se aceita em palavras de gente. */
export const ROTULOS_DE_IMAGEM = Object.freeze(ESPECIES_DE_IMAGEM.map((e) => e.rotulo));

/**
 * Quantos bytes do começo do arquivo bastam para decidir a espécie.
 *
 * É o maior deslocamento somado ao maior comprimento entre as assinaturas — e
 * é calculado, não escrito: uma espécie nova com assinatura mais longa passaria
 * a ser lida pela metade se este número fosse uma constante escrita à mão.
 */
export const BYTES_DA_ASSINATURA = ESPECIES_DE_IMAGEM.reduce((maior, especie) => {
  for (const [posicao, bytes] of especie.assinatura) {
    maior = Math.max(maior, posicao + bytes.length);
  }
  return maior;
}, 0);

/** O valor do atributo `accept` do seletor de arquivo, derivado da lista. */
export const ACEITO_NO_SELETOR = TIPOS_DE_IMAGEM.join(",");

/** O teto de tamanho, em bytes. 1 MB. */
export const TAMANHO_MAXIMO_DA_IMAGEM = 1024 * 1024;

/** O teto do texto alternativo, alinhado ao que a coluna do banco aceita. */
export const TAMANHO_MAXIMO_DO_ALTERNATIVO = 300;

/**
 * O nome da Capa em palavras de gente — UMA grafia, e não quatro.
 *
 * Ele mora aqui, e não em `admin/blog/capa.js`, porque quem precisa dele não é
 * só a tela: a recusa da porta de escrita nomeia a coluna, e `api/` não pode
 * importar de `admin/`. Este módulo já é o vocabulário de imagem compartilhado
 * por tela, servidor e banco, então é a casa certa.
 *
 * Antes desta declaração o mesmo nome existia em quatro escritas independentes
 * — a constante do módulo da capa, o padrão codificado em
 * `alternativoDaMiniatura`, o literal do rótulo na gaveta e a mensagem do
 * servidor —, e o lado do SEO, que nasceu depois, já tirava tudo de um mapa só.
 */
export const ROTULO_DA_CAPA = "Imagem de capa";

/**
 * Por quanto tempo a capa pode ficar em cache, em segundos.
 *
 * Um ano. O arquivo é IMUTÁVEL por construção — cada envio nasce com nome
 * próprio e nada nunca sobrescreve —, então o único jeito de a capa mudar é o
 * endereço mudar. Mora aqui, e não como literal no envio, pela mesma razão que
 * o teto de tamanho: número solto em módulo de rede é número que ninguém
 * encontra quando precisa mudar.
 */
export const CACHE_DA_CAPA_EM_SEGUNDOS = 31536000;

/**
 * A espécie destes bytes, ou `null`.
 *
 * Aceita `Uint8Array`, `ArrayBuffer` ou lista de números — a tela entrega o que
 * `File.slice(...).arrayBuffer()` devolve, e a verificação entrega uma lista
 * escrita à mão. Nunca lança: entrada que não dá para ler é `null`, que é
 * "espécie desconhecida", que é recusa.
 */
export function especiePelosBytes(entrada) {
  let bytes;
  if (entrada instanceof Uint8Array) bytes = entrada;
  else if (entrada instanceof ArrayBuffer) bytes = new Uint8Array(entrada);
  else if (Array.isArray(entrada)) bytes = Uint8Array.from(entrada.map((n) => Number(n) & 255));
  else return null;

  for (const especie of ESPECIES_DE_IMAGEM) {
    let casou = true;
    for (const [posicao, esperados] of especie.assinatura) {
      for (let i = 0; i < esperados.length; i += 1) {
        if (bytes[posicao + i] !== esperados[i]) {
          casou = false;
          break;
        }
      }
      if (!casou) break;
    }
    if (casou) return especie.tipo;
  }
  return null;
}

/** A espécie declarada, se ela estiver no vocabulário. Senão `null`. */
export function especieDeclarada(tipo) {
  const limpo = typeof tipo === "string" ? tipo.trim().toLowerCase() : "";
  return TIPOS_DE_IMAGEM.includes(limpo) ? limpo : null;
}

/** A extensão de uma espécie do vocabulário, ou `null`. */
export function extensaoDaEspecie(tipo) {
  return ESPECIES_DE_IMAGEM.find((e) => e.tipo === especieDeclarada(tipo))?.extensao ?? null;
}

/* ─── As recusas, e por que elas dizem o número ───────────────────────────── */

/**
 * O tamanho por extenso, na unidade que a pessoa entende.
 *
 * "1048576 bytes" não é uma frase que alguém compare com o próprio arquivo.
 */
export function formatarTamanho(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "tamanho desconhecido";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} kB`;
  const mb = n / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

/**
 * A recusa de tamanho **diz o limite** — e diz também o que veio.
 *
 * "Arquivo grande demais" deixa a pessoa adivinhando quanto cortar; o critério
 * de aceite pede o limite por escrito, e o tamanho do arquivo ao lado é o que
 * transforma o limite em instrução.
 */
export function recusaDeTamanho(bytes) {
  return (
    `Esta imagem tem ${formatarTamanho(bytes)} e o limite é ` +
    `${formatarTamanho(TAMANHO_MAXIMO_DA_IMAGEM)}. Reduza o arquivo e envie de novo.`
  );
}

/** A recusa de espécie diz **o que se aceita**, e não o que veio. */
export function recusaDeEspecie() {
  const ultimo = ROTULOS_DE_IMAGEM[ROTULOS_DE_IMAGEM.length - 1];
  const primeiros = ROTULOS_DE_IMAGEM.slice(0, -1).join(", ");
  return `A capa aceita ${primeiros} ou ${ultimo}. Converta a imagem e envie de novo.`;
}

/** A recusa de arquivo vazio: ele não tem assinatura, e "0 B" não é imagem. */
export const RECUSA_DE_ARQUIVO_VAZIO =
  "Este arquivo está vazio. Escolha uma imagem e envie de novo.";

/**
 * O problema deste arquivo, ou `null` quando ele serve.
 *
 * Recebe `{ tamanho, tipo, assinatura }` — `assinatura` são os primeiros bytes,
 * já lidos. **A ordem das conferências é deliberada**: tamanho primeiro, porque
 * é a recusa mais comum e a única que não exige ler byte nenhum.
 *
 * Quando `assinatura` não é informada, a decisão fica com o tipo declarado —
 * é o caminho do SERVIDOR, que não tem o arquivo em mãos. A tela sempre
 * informa, e é por isso que a extensão trocada morre lá, antes da rede.
 */
/* ─── A IMAGEM DO CORPO TEM OUTRO TETO, E POR OUTRO MOTIVO ────────────────
 *
 * O 1 MB da capa existe por causa dos geradores de prévia de link (ver o
 * cabeçalho). Imagem no meio do artigo NUNCA vira prévia de link — aquele
 * argumento não se aplica a ela, e o teto apertado só atrapalhava quem quer
 * ilustrar um post com uma foto de câmera.
 *
 * Este número é o teto do que se pode ESCOLHER do disco, e não o do que é
 * ARMAZENADO: `enviarImagemDoCorpo` reduz e converte para WebP antes de
 * subir, e o que chega ao bucket continua pequeno — bem abaixo do limite que
 * o próprio bucket impõe, que segue sendo o da capa e não muda.
 */
export const TAMANHO_MAXIMO_DA_IMAGEM_DO_CORPO = 10 * 1024 * 1024;

/**
 * A maior largura que uma imagem do corpo pode ter depois de otimizada.
 *
 * A coluna do artigo mede 68ch — perto de 640px na tipografia do `.artigo`.
 * 1600 dá folga para tela de alta densidade (2x e um pouco) sem guardar os
 * 6000px que uma câmera moderna entrega e que ninguém jamais veria.
 */
export const LARGURA_MAXIMA_DA_IMAGEM_DO_CORPO = 1600;

/** A qualidade da conversão para WebP. */
export const QUALIDADE_DO_WEBP = 0.82;

/**
 * O problema deste arquivo para o CORPO do post, ou `null` quando ele serve.
 *
 * Mesma disciplina de `problemaNoArquivo` — inclusive a decisão por
 * assinatura de bytes, que é o que faz a extensão trocada morrer aqui —, com
 * o teto do corpo no lugar do teto da capa.
 */
export function problemaNoArquivoDoCorpo({ tamanho, tipo, assinatura } = {}) {
  const n = Number(tamanho);
  if (!Number.isFinite(n) || n <= 0) return RECUSA_DE_ARQUIVO_VAZIO;
  if (n > TAMANHO_MAXIMO_DA_IMAGEM_DO_CORPO) {
    return (
      `Esta imagem tem ${formatarTamanho(n)} e o limite é ` +
      `${formatarTamanho(TAMANHO_MAXIMO_DA_IMAGEM_DO_CORPO)}. ` +
      `Reduza o arquivo e envie de novo.`
    );
  }

  const declarada = especieDeclarada(tipo);
  if (declarada === null) return recusaDeEspecie();

  if (assinatura !== undefined && assinatura !== null) {
    const real = especiePelosBytes(assinatura);
    if (real === null || real !== declarada) return recusaDeEspecie();
  }

  return null;
}

export function problemaNoArquivo({ tamanho, tipo, assinatura } = {}) {
  const n = Number(tamanho);
  if (!Number.isFinite(n) || n <= 0) return RECUSA_DE_ARQUIVO_VAZIO;
  if (n > TAMANHO_MAXIMO_DA_IMAGEM) return recusaDeTamanho(n);

  const declarada = especieDeclarada(tipo);
  if (declarada === null) return recusaDeEspecie();

  if (assinatura !== undefined && assinatura !== null) {
    const real = especiePelosBytes(assinatura);
    /* QUEM DECIDE É O CONTEÚDO. Espécie desconhecida e espécie que não bate com
       o que o arquivo diz ser recebem a MESMA frase: distinguir as duas diria a
       quem tenta que a troca de extensão foi detectada, e a frase útil é a
       mesma nos dois casos — converta e mande de novo. */
    if (real === null || real !== declarada) return recusaDeEspecie();
  }

  return null;
}

/* ─── O nome do arquivo dentro do bucket ─────────────────────────────────── */

/**
 * O caminho da capa dentro do bucket: `capas/<identificador>.<extensao>`.
 *
 * O nome NÃO vem do nome do arquivo escolhido. Dois motivos: nome de arquivo
 * carrega acento, espaço e barra — que viram caminho inválido ou, pior, pasta
 * nova —, e dois Autores mandando `capa.png` no mesmo dia sobrescreveriam a
 * capa um do outro num bucket sem versão.
 *
 * Devolve `null` para espécie fora do vocabulário: um caminho sem extensão
 * conhecida seria um arquivo que o navegador não sabe servir.
 */
export function caminhoDaCapa(tipo, identificador) {
  const extensao = extensaoDaEspecie(tipo);
  if (extensao === null) return null;
  const chave = String(identificador ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(chave)) return null;
  return `${PASTA_DAS_CAPAS}/${chave}.${extensao}`;
}

/**
 * O caminho é um caminho de capa deste bucket? Lista de PERMISSÃO.
 *
 * Existe porque a remoção do arquivo acontece com a chave de serviço, que
 * ignora política: um caminho vindo de um endereço gravado no banco não pode
 * apagar qualquer coisa do bucket. `..`, barra no começo e pasta fora de
 * `capas/` não passam por construção.
 */
export function ehCaminhoDeCapa(caminho) {
  if (typeof caminho !== "string") return false;
  const extensoes = ESPECIES_DE_IMAGEM.map((e) => e.extensao).join("|");
  return new RegExp(
    `^${PASTA_DAS_CAPAS}/[a-z0-9][a-z0-9-]{7,63}\\.(${extensoes})$`,
  ).test(caminho);
}

/**
 * O caminho de uma imagem do CORPO dentro do bucket:
 * `corpo/<identificador>.<extensao>` — o mesmo desenho de `caminhoDaCapa`,
 * pasta trocada. Devolve `null` para espécie fora do vocabulário.
 */
export function caminhoDoCorpo(tipo, identificador) {
  const extensao = extensaoDaEspecie(tipo);
  if (extensao === null) return null;
  const chave = String(identificador ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(chave)) return null;
  return `${PASTA_DO_CORPO}/${chave}.${extensao}`;
}

/**
 * O caminho é um caminho de imagem do CORPO deste bucket? Lista de
 * PERMISSÃO, pelo mesmo motivo que `ehCaminhoDeCapa`: a remoção acontece com
 * a chave de serviço, que ignora política, e um caminho vindo de um endereço
 * gravado no documento não pode apagar qualquer coisa do bucket.
 */
export function ehCaminhoDoCorpo(caminho) {
  if (typeof caminho !== "string") return false;
  const extensoes = ESPECIES_DE_IMAGEM.map((e) => e.extensao).join("|");
  return new RegExp(
    `^${PASTA_DO_CORPO}/[a-z0-9][a-z0-9-]{7,63}\\.(${extensoes})$`,
  ).test(caminho);
}

/* ─── O endereço público, nos dois sentidos ──────────────────────────────── */

/** O endereço público absoluto de um caminho do bucket. */
export function enderecoPublicoDaCapa(base, caminho) {
  const raiz = String(base ?? "").replace(/\/+$/, "");
  if (raiz === "" || typeof caminho !== "string" || caminho === "") return null;
  return `${raiz}${PREFIXO_PUBLICO_DO_STORAGE}${BUCKET_DAS_IMAGENS}/${caminho}`;
}

/**
 * O caminho no bucket a partir de um endereço público — ou `null` quando o
 * endereço **não é deste bucket**.
 *
 * `null` é a resposta que a remoção precisa: um Post cuja capa aponta para
 * outro domínio (o que a Story 3.2 vai permitir) não tem arquivo nosso a
 * remover, e tentar removê-lo seria apagar às cegas.
 */
export function caminhoDaCapaNoEndereco(base, endereco) {
  const raiz = String(base ?? "").replace(/\/+$/, "");
  if (raiz === "" || typeof endereco !== "string") return null;
  const prefixo = `${raiz}${PREFIXO_PUBLICO_DO_STORAGE}${BUCKET_DAS_IMAGENS}/`;
  if (!endereco.startsWith(prefixo)) return null;
  const caminho = endereco.slice(prefixo.length);
  return ehCaminhoDeCapa(caminho) ? caminho : null;
}

/** O endereço é uma capa deste bucket? */
export function ehEnderecoDoBucket(base, endereco) {
  return caminhoDaCapaNoEndereco(base, endereco) !== null;
}

/**
 * O caminho de uma imagem do CORPO a partir de um endereço público — ou
 * `null` quando o endereço não é uma imagem do corpo deste bucket.
 *
 * Espelha `caminhoDaCapaNoEndereco`, trocando `ehCaminhoDeCapa` por
 * `ehCaminhoDoCorpo`: a limpeza de órfã do documento (`api/_nucleo/salvarPost.js`)
 * usa esta para não tentar apagar, com a chave de serviço, um endereço que
 * nunca foi nosso.
 */
export function caminhoDoCorpoNoEndereco(base, endereco) {
  const raiz = String(base ?? "").replace(/\/+$/, "");
  if (raiz === "" || typeof endereco !== "string") return null;
  const prefixo = `${raiz}${PREFIXO_PUBLICO_DO_STORAGE}${BUCKET_DAS_IMAGENS}/`;
  if (!endereco.startsWith(prefixo)) return null;
  const caminho = endereco.slice(prefixo.length);
  return ehCaminhoDoCorpo(caminho) ? caminho : null;
}

/**
 * A raiz do projeto DENTRO de um endereço público do Storage — `""` quando o
 * endereço não tem essa forma.
 *
 * Existe para quem precisa perguntar "este endereço é uma capa nossa?" **sem
 * conhecer a URL do projeto**: a camada de dados (que a lê do cliente, não do
 * ambiente) e a gaveta (que não conhece nem uma coisa nem outra). Quem passa a
 * raiz assim está perguntando pela FORMA, e a resposta vale para decidir modo
 * de tela — nunca para decidir remoção com chave de serviço, que continua
 * exigindo a raiz de verdade em `caminhoDaCapaNoEndereco`.
 *
 * Nasceu como uma função privada de `data/blog/arquivos.js` e subiu para cá na
 * Story 3.2, quando o segundo consumidor apareceu: duas implementações do mesmo
 * recorte divergiriam no dia em que o Storage mudasse o prefixo.
 */
export function baseDoEnderecoPublico(endereco) {
  const corte = String(endereco ?? "").indexOf(PREFIXO_PUBLICO_DO_STORAGE);
  return corte <= 0 ? "" : String(endereco).slice(0, corte);
}

/* ─── O que a COLUNA aceita ──────────────────────────────────────────────── */
/*     `TAMANHO_MAXIMO_DO_ENDERECO`, `temCaractereForaDoEndereco` e
       `enderecoDeImagemPermitido` são importadas no topo do arquivo — ver o
       comentário lá. */

/* ─── A RECUSA DO ENDEREÇO, EM PALAVRAS (Story 3.2) ──────────────────────────
 *
 * `enderecoDeImagemPermitido` responde sim ou não; estas quatro frases dizem
 * POR QUÊ. Elas moram aqui, ao lado da regra e ao lado de
 * `problemaNoTextoAlternativo`, e não num módulo de tela: quem monta o corpo do
 * pedido (`admin/blog/metadados.js`) é código puro, e fazê-lo importar de um
 * módulo de interface para saber o que é endereço aceitável inverteria a seta
 * da arquitetura.
 *
 * **Quatro motivos, quatro frases.** Uma frase só respondendo por todos faria
 * `https://exemplo.com/café.jpg` ser acusado de "esquema errado" e
 * `data:image/png;base64,…` de "endereço torto" — e mandar a pessoa consertar a
 * coisa errada é pior que não dizer nada. É a mesma correção que a Story 3.1
 * fez na descrição da imagem, que também tinha dois motivos e uma frase.
 */

/** Passou do teto. A frase DIZ o teto. */
export const RECUSA_DE_ENDERECO_LONGO =
  `O endereço da imagem passa de ${TAMANHO_MAXIMO_DO_ENDERECO} caracteres. Use um endereço mais curto.`;

/** Tem caractere fora do vocabulário: acento, espaço, aspas, sinal de marcação. */
export const RECUSA_DE_ENDERECO_COM_CARACTERE =
  "O endereço da imagem tem caracteres que não valem num endereço: acento, espaço ou aspas. " +
  "Copie o endereço direto da barra do navegador, que já vem codificado.";

/** Não começa com `https://` — é onde mora o risco executável. */
export const RECUSA_DE_ENDERECO_SEM_ESQUEMA =
  "O endereço da imagem precisa ser um endereço completo começando com https://, " +
  "cole o link da imagem, e não o conteúdo dela.";

/** Começa certo, mas o que vem depois não é um site alcançável. */
export const RECUSA_DE_ENDERECO_SEM_SITE =
  "Depois do https:// falta um site válido. Confira o endereço: ele não pode ter " +
  "usuário e senha nem porta fora de faixa.";

/**
 * O que há de errado com o endereço da imagem, ou `null` quando não há nada.
 *
 * ─── O VEREDITO É DE `enderecoDeImagemPermitido`; SÓ O MOTIVO É ESCOLHIDO ───
 *
 * A função **não reimplementa cláusula nenhuma**: ela pergunta, e só depois de
 * a resposta ser "não" é que olha o endereço de novo para escolher qual das
 * quatro frases explica melhor. A cláusula de caractere é a MESMA função que o
 * veredito usa (`temCaractereForaDoEndereco`), e não uma cópia. A verificação
 * prende as duas pontas: para todo endereço do corpus,
 * `problemaNoEnderecoDaImagem(e) === null` se e somente se
 * `enderecoDeImagemPermitido(e)`.
 *
 * Endereço vazio devolve `null`: "sem capa" é estado legítimo, e não recusa.
 * Quem cobra o par capa + descrição é `problemaNoTextoAlternativo`.
 */
export function problemaNoEnderecoDaImagem(endereco) {
  const texto = typeof endereco === "string" ? endereco.trim() : "";
  if (texto === "") return null;
  if (enderecoDeImagemPermitido(texto)) return null;

  /* A ORDEM É A DA CAUSA MAIS PRÓXIMA DE QUEM LÊ. O teto primeiro porque é o
     único motivo que não se vê olhando para o começo do endereço; o caractere
     antes do esquema porque `https://exemplo.com/café.jpg` tem esquema certo e
     seria acusado de esquema errado se a ordem fosse a inversa. */
  if (texto.length > TAMANHO_MAXIMO_DO_ENDERECO) return RECUSA_DE_ENDERECO_LONGO;
  if (temCaractereForaDoEndereco(texto)) return RECUSA_DE_ENDERECO_COM_CARACTERE;
  if (!/^https:\/\//i.test(texto)) return RECUSA_DE_ENDERECO_SEM_ESQUEMA;
  return RECUSA_DE_ENDERECO_SEM_SITE;
}

/**
 * O problema do texto alternativo, ou `null`.
 *
 * Ele é obrigatório **quando há capa**, e essa não é uma regra de tela: o banco
 * a recusa desde a Story 2.1 (`posts_imagem_exige_alt`). Cobrá-la aqui é o que
 * impede a recusa TARDIA — a que chega depois de o megabyte ter subido.
 */
export function problemaNoTextoAlternativo(alternativo, { temCapa }) {
  const texto = typeof alternativo === "string" ? alternativo.trim() : "";
  if (!temCapa) {
    return texto.length > TAMANHO_MAXIMO_DO_ALTERNATIVO
      ? `A descrição da imagem passa de ${TAMANHO_MAXIMO_DO_ALTERNATIVO} caracteres.`
      : null;
  }
  if (texto === "") {
    return (
      "A capa precisa de uma descrição: é ela que quem não enxerga a imagem recebe no lugar dela."
    );
  }
  if (texto.length > TAMANHO_MAXIMO_DO_ALTERNATIVO) {
    return `A descrição da imagem passa de ${TAMANHO_MAXIMO_DO_ALTERNATIVO} caracteres.`;
  }
  return null;
}
