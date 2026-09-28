/**
 * As regras puras das duas telas públicas de Carreiras (Story 5.7):
 * `/carreiras` e a Página da Vaga, `/carreiras/:slug`.
 *
 * Mesma razão de `blogPublico.js` existir: função pura em arquivo de
 * componente quebra a recarga rápida e o lint cobra, e a verificação
 * EXECUTA estas funções em vez de ler JSX.
 *
 * ─── ERRO ANTES DE VAZIO ────────────────────────────────────────────────────
 *
 * A lista pública tem quatro situações, e a ordem entre elas é regra: uma
 * leitura que falhou nunca se apresenta como "nenhuma vaga aberta". Quem lê
 * "nenhuma vaga" desiste de procurar; quem lê "não deu para carregar" tenta
 * de novo. Trocar um pelo outro manda a pessoa para a conclusão errada.
 *
 * ─── A SITUAÇÃO DA VAGA É DO BANCO ──────────────────────────────────────────
 *
 * Aberta, Encerrada e inexistente vêm de `situacao_da_vaga`, pela camada de
 * dados, e são as palavras de `domain/carreiras/estados.js`. Rascunho e
 * endereço que nunca existiu são a MESMA situação, e esta tela não tem como
 * distinguir os dois: é essa a garantia.
 *
 * ─── NADA AQUI LANÇA ────────────────────────────────────────────────────────
 *
 * Fora as duas guardas de vocabulário fechado (`falaDaLista` e `falaDaVaga`),
 * que acusam erro de programação. `formatarData` e `rotuloDaModalidade`
 * lançam de propósito no caminho de escrita; no meio de uma página pública,
 * um `aberta_em` torto ou uma Modalidade desconhecida viram ausência da
 * linha, e a página continua de pé.
 *
 * Módulo puro: sem React, sem rede, sem DOM. Importa por caminho relativo
 * para a verificação executá-lo no Node.
 */

import { formatarData } from "../domain/blog/formato.js";
import {
  rotuloDoEstadoDaVaga,
  SITUACAO_ABERTA,
  SITUACAO_ENCERRADA,
  SITUACAO_INEXISTENTE,
} from "../domain/carreiras/estados.js";
import {
  aparenciaDaCorDeClassificacao,
  ehModalidade,
  rotuloDaModalidade,
} from "../domain/carreiras/classificacoes.js";
import {
  enderecoDaPaginaDaVaga,
  linkDeCandidaturaValido,
  textoDoLocal,
} from "../domain/carreiras/vaga.js";

/* ─── O endereço de fora ─────────────────────────────────────────────────── */

/**
 * O envio de currículo pelo WhatsApp, o MESMO do estado vazio de antes da
 * Story 5.7: sem Vaga Aberta, a página ainda convida a pessoa a se apresentar.
 * É a ÚNICA casa do número e da frase nas páginas de Carreiras: o vazio da
 * lista, a Vaga Encerrada e o convite final de `/carreiras` leem daqui.
 */
export const ENDERECO_DO_CURRICULO =
  "https://api.whatsapp.com/send?phone=5584998900718&text=Gostaria+de+enviar+meu+curr%C3%ADculo+para+futuras+oportunidades";

/** O endereço da lista pública. */
export const ENDERECO_DAS_VAGAS = "/carreiras";

/* ─── As situações da lista ──────────────────────────────────────────────── */

export const LISTA_CARREGANDO = "lista-carregando";
export const LISTA_ERRO = "lista-erro";
export const LISTA_VAZIA = "lista-vazia";
export const LISTA_PRONTA = "lista-pronta";

/** As quatro telas da lista pública, e só elas. */
export const SITUACOES_DA_LISTA = Object.freeze([
  LISTA_CARREGANDO,
  LISTA_ERRO,
  LISTA_VAZIA,
  LISTA_PRONTA,
]);

/**
 * Qual das quatro telas da lista mostrar. Carregando primeiro; depois o ERRO,
 * conferido antes de qualquer vazio; depois vazio ou pronta.
 */
export function situacaoDaLista({ carregando = false, erro = null, vagas = null } = {}) {
  if (carregando === true) return LISTA_CARREGANDO;
  if (erro !== null && erro !== undefined && erro !== false) return LISTA_ERRO;
  if (!Array.isArray(vagas)) return LISTA_ERRO;
  return vagas.length === 0 ? LISTA_VAZIA : LISTA_PRONTA;
}

const FALAS_DA_LISTA = Object.freeze({
  [LISTA_ERRO]: Object.freeze({
    oQueHouve: "Não deu para carregar as vagas",
    oQueFazer: "Confira a conexão e tente carregar de novo.",
    repetir: true,
  }),
  [LISTA_VAZIA]: Object.freeze({
    oQueHouve: "Nenhuma vaga aberta no momento",
    oQueFazer:
      "Não temos oportunidades abertas agora, mas adoraríamos conhecer você. Envie seu currículo e entraremos em contato assim que surgir algo!",
    repetir: false,
  }),
});

/**
 * A fala de uma situação da lista sem cartão (erro ou vazia). Lança para
 * qualquer outra: situação desconhecida é erro de programação, e uma fala
 * neutra seria a página em branco que esta tela existe para impedir.
 */
export function falaDaLista(situacao) {
  if (typeof situacao !== "string" || !Object.hasOwn(FALAS_DA_LISTA, situacao)) {
    throw new Error(
      `Situação da lista de vagas sem fala: ${JSON.stringify(situacao)}. ` +
        `As únicas com fala são: ${Object.keys(FALAS_DA_LISTA).join(", ")}.`,
    );
  }
  return FALAS_DA_LISTA[situacao];
}

/** O que a região viva anuncia enquanto a lista carrega. */
export const TEXTO_DE_CARREGANDO_A_LISTA = "Carregando as vagas abertas.";

/** O rótulo do que tenta a leitura da lista outra vez. */
export const ROTULO_DE_RECARREGAR_A_LISTA = "Tentar carregar as vagas de novo";

/** O rótulo do convite do estado vazio. */
export const ROTULO_DO_CURRICULO = "Enviar Currículo";

/* ─── As situações da Página da Vaga ─────────────────────────────────────── */

export const VAGA_CARREGANDO = "vaga-carregando";
export const VAGA_ABERTA = "vaga-aberta";
export const VAGA_ENCERRADA = "vaga-encerrada";
export const VAGA_INEXISTENTE = "vaga-inexistente";
export const VAGA_ERRO = "vaga-erro";

/** As cinco telas da Página da Vaga, e só elas. Mutuamente exclusivas. */
export const SITUACOES_DA_VAGA_PUBLICA = Object.freeze([
  VAGA_CARREGANDO,
  VAGA_ABERTA,
  VAGA_ENCERRADA,
  VAGA_INEXISTENTE,
  VAGA_ERRO,
]);

/** A situação do banco para a tela: a tradução é uma tabela, não uma cadeia de `if`. */
const TELA_DA_SITUACAO = Object.freeze({
  [SITUACAO_ABERTA]: VAGA_ABERTA,
  [SITUACAO_ENCERRADA]: VAGA_ENCERRADA,
  [SITUACAO_INEXISTENTE]: VAGA_INEXISTENTE,
});

/**
 * Qual das cinco telas mostrar. Carregando primeiro; depois o ERRO, que é
 * distinto de inexistente (a leitura que falhou não diz que a Vaga não
 * existe); depois a situação que o banco respondeu. Uma resposta sem situação
 * do vocabulário é erro, nunca "não encontrada": a tela não inventa ausência.
 */
export function situacaoDaVagaPublica({ carregando = false, erro = null, vaga = null } = {}) {
  if (carregando === true) return VAGA_CARREGANDO;
  if (ehFalhaDeNaoEncontrado(erro)) return VAGA_INEXISTENTE;
  if (erro !== null && erro !== undefined && erro !== false) return VAGA_ERRO;
  const situacao = vaga !== null && typeof vaga === "object" ? vaga.situacao : undefined;
  if (typeof situacao !== "string" || !Object.hasOwn(TELA_DA_SITUACAO, situacao)) return VAGA_ERRO;
  /* Aberta sem título é resposta INVÁLIDA: a tela da Vaga Aberta não se
     monta com um `<h1>` vazio. É erro de leitura, com tentar de novo. */
  if (situacao === SITUACAO_ABERTA && texto(vaga.titulo) === "") return VAGA_ERRO;
  return TELA_DA_SITUACAO[situacao];
}

/**
 * O tipo de falha "não existe" da camada de dados (`ERRO_NAO_ENCONTRADO` de
 * `data/blog/resultado.js`). Repetido aqui porque o módulo puro não importa
 * de `data/`; a verificação confere que as duas grafias são a mesma.
 */
export const TIPO_DE_ERRO_NAO_ENCONTRADO = "nao_encontrado";

/**
 * A falha da camada que diz que a Vaga NÃO EXISTE vira a tela "Vaga não
 * encontrada", e não "tente de novo": repetir não faz a Vaga aparecer. Os
 * demais tipos (rede, permissão, configuração, inesperado) continuam erro.
 */
function ehFalhaDeNaoEncontrado(erro) {
  return erro !== null && typeof erro === "object" && erro.tipo === TIPO_DE_ERRO_NAO_ENCONTRADO;
}

/**
 * O título de reserva da Vaga Encerrada que veio sem título. A Encerrada
 * continua útil sem ele (a mensagem e as Vagas Abertas), então a tela não
 * vira erro: mostra esta frase no `<h1>`. A palavra vem do vocabulário.
 */
export const TITULO_DE_RESERVA_DA_ENCERRADA = `Vaga ${rotuloDoEstadoDaVaga("encerrada").toLowerCase()}`;

/**
 * O texto do `<h1>` da Vaga: o título dela; na Encerrada sem título, o de
 * reserva. Nunca vazio numa tela que o mostra (a Aberta sem título já é erro).
 */
export function tituloDaVagaPublica(vaga) {
  const titulo = texto(vaga?.titulo);
  if (titulo !== "") return titulo;
  return vaga?.situacao === SITUACAO_ENCERRADA ? TITULO_DE_RESERVA_DA_ENCERRADA : "";
}

const FALAS_DA_VAGA = Object.freeze({
  [VAGA_ENCERRADA]: Object.freeze({
    /* A palavra do Estado vem do vocabulário, em minúscula no meio da frase. */
    oQueHouve: `Esta vaga foi ${rotuloDoEstadoDaVaga("encerrada").toLowerCase()}`,
    oQueFazer: "As inscrições para ela terminaram. Veja abaixo as vagas abertas agora.",
    repetir: false,
  }),
  [VAGA_INEXISTENTE]: Object.freeze({
    oQueHouve: "Vaga não encontrada",
    oQueFazer:
      "A vaga que você procura não existe, ou o endereço veio errado. Veja as vagas abertas.",
    repetir: false,
  }),
  [VAGA_ERRO]: Object.freeze({
    oQueHouve: "Não deu para carregar a vaga",
    oQueFazer: "Confira a conexão e tente carregar de novo.",
    repetir: true,
  }),
});

/** A fala de uma situação da Vaga sem a Vaga completa. Lança para situação fora da lista. */
export function falaDaVaga(situacao) {
  if (typeof situacao !== "string" || !Object.hasOwn(FALAS_DA_VAGA, situacao)) {
    throw new Error(
      `Situação da vaga sem fala: ${JSON.stringify(situacao)}. ` +
        `As únicas com fala são: ${Object.keys(FALAS_DA_VAGA).join(", ")}.`,
    );
  }
  return FALAS_DA_VAGA[situacao];
}

/** O que a região viva anuncia enquanto a Vaga carrega. */
export const TEXTO_DE_CARREGANDO_A_VAGA = "Carregando a vaga.";

/** O rótulo do que tenta a leitura da Vaga outra vez. */
export const ROTULO_DE_RECARREGAR_A_VAGA = "Tentar carregar a vaga de novo";

/** O rótulo da volta para a lista. Diz para onde vai. */
export const ROTULO_DE_VER_AS_VAGAS = "Ver todas as vagas";

/** O título da seção das outras Vagas, na Vaga Aberta. */
export const TITULO_DAS_OUTRAS_VAGAS = "Outras vagas abertas";

/** O título da seção das Vagas Abertas, na Vaga Encerrada. */
export const TITULO_DAS_VAGAS_ABERTAS = "Vagas abertas";

/** O convite ao lado do segundo Candidatar-se, depois da Descrição. */
export const CONVITE_DA_CANDIDATURA =
  "A candidatura continua na página do processo seletivo, numa nova aba.";

/* ─── O que a tela lê de uma Vaga ────────────────────────────────────────── */

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * "Aberta em 10/09/2026": o dia da primeira abertura (`aberta_em`, que não
 * muda ao reabrir), no fuso de apresentação. A palavra vem do vocabulário.
 * Vazio quando não há data ou quando ela não se deixa formatar: nunca lança.
 */
export function textoDaAbertura(vaga) {
  const bruto = vaga?.aberta_em;
  if (typeof bruto !== "string" || bruto.trim() === "") return "";
  try {
    return `${rotuloDoEstadoDaVaga("aberta")} em ${formatarData(bruto)}`;
  } catch {
    return "";
  }
}

/**
 * O rótulo da Modalidade, ou vazio fora do vocabulário. `ehModalidade` é
 * perguntado ANTES de `rotuloDaModalidade`, que lança.
 */
export function rotuloDaModalidadeProtegido(valor) {
  return ehModalidade(valor) ? rotuloDaModalidade(valor) : "";
}

/** "Híbrido · Natal, RN", pela regra do domínio (a mesma do Painel). Nunca lança. */
export function localDaVaga(vaga) {
  return textoDoLocal(vaga);
}

/**
 * As Classificações da Vaga, na ordem do formulário: Departamento (com Cor),
 * Tipo (sem Cor) e Nível (com Cor). A Cor é o par de tokens da paleta, para
 * aplicar por `style`: nenhuma classe vem do banco. Classificação sem nome
 * fica de fora, e a Cor fora da paleta cai na neutra (a função é tolerante).
 */
export function classificacoesDaVaga(vaga) {
  const itens = [
    { chave: "departamento", nome: texto(vaga?.departamento), cor: vaga?.departamento_cor, temCor: true },
    { chave: "tipo", nome: texto(vaga?.tipo), cor: null, temCor: false },
    { chave: "nivel", nome: texto(vaga?.nivel), cor: vaga?.nivel_cor, temCor: true },
  ];
  return Object.freeze(
    itens
      .filter((item) => item.nome !== "")
      .map((item) => {
        const aparencia = item.temCor ? aparenciaDaCorDeClassificacao(item.cor) : null;
        return Object.freeze({
          chave: item.chave,
          nome: item.nome,
          fundo: aparencia?.fundo ?? null,
          tinta: aparencia?.tinta ?? null,
        });
      }),
  );
}

/** O endereço da página de uma Vaga da lista, ou `null` sem Slug. */
export function enderecoDaVagaPublica(vaga) {
  return enderecoDaPaginaDaVaga(vaga?.slug);
}

/** O nome acessível do "Ver vaga" de um cartão: diz o que faz e nomeia a Vaga. */
export function rotuloDoCartao(vaga) {
  const titulo = texto(vaga?.titulo);
  return titulo === "" ? "Ver vaga sem título" : `Ver vaga: ${titulo}`;
}

/**
 * As Vagas Abertas sem a atual (pelo Slug). Tolerante: lista ausente vira
 * lista vazia, e item sem Slug fica de fora (não teria para onde levar).
 */
export function outrasVagas(lista, slugAtual) {
  if (!Array.isArray(lista)) return [];
  const atual = texto(slugAtual);
  return lista.filter(
    (vaga) =>
      vaga !== null &&
      typeof vaga === "object" &&
      texto(vaga.slug) !== "" &&
      texto(vaga.slug) !== atual,
  );
}

/**
 * O Link de Candidatura que pode virar botão, ou `null`. É a MESMA regra do
 * Painel e do servidor (`linkDeCandidaturaValido`): só `http`/`https`
 * absoluto. `javascript:`, `data:` e endereço relativo nunca viram botão.
 */
export function linkDeCandidaturaSeguro(link) {
  if (!linkDeCandidaturaValido(link)) return null;
  /* O valor NORMALIZADO: o que o navegador de fato abriria. */
  try {
    return new URL(link).href;
  } catch {
    return null;
  }
}

/** O nome acessível do Candidatar-se: o texto visível, a Vaga e a nova aba. */
export function rotuloDaCandidatura(vaga) {
  const titulo = texto(vaga?.titulo);
  return titulo === ""
    ? "Candidatar-se (abre em nova aba)"
    : `Candidatar-se à vaga ${titulo} (abre em nova aba)`;
}

/** O rótulo visível do botão de candidatura. */
export const ROTULO_DA_CANDIDATURA = "Candidatar-se";

/** O rótulo visível do link de cada cartão. */
export const ROTULO_DO_CARTAO = "Ver vaga";

/** O HTML GRAVADO da Descrição, ou vazio. Nada aqui deriva HTML de documento. */
export function descricaoGravada(vaga) {
  const html = vaga?.descricao_html;
  return typeof html === "string" ? html : "";
}

/* ─── A falha que a tela inventa quando a camada lança ───────────────────── */

/**
 * O erro tipado de uma exceção que escapou da camada. A frase é fixa, e o
 * texto cru vai para `detalhe`, que a tela não mostra: texto de exceção de
 * JavaScript não é frase de página pública. A falha é REGISTRADA no console,
 * com o prefixo do módulo: engolida, ela sumiria sem deixar rastro.
 */
export function falhaDeExcecao(excecao) {
  const falha = {
    tipo: "inesperado",
    mensagem: "Algo inesperado aconteceu ao carregar.",
    detalhe: String(excecao?.message ?? excecao),
  };
  console.error("[carreiras] falha inesperada ao carregar", falha);
  return falha;
}
