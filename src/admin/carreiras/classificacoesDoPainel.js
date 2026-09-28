/**
 * As regras puras e as frases da tela de Departamentos, Tipos e Níveis
 * (Story 5.6).
 *
 * Sem React e sem rede: `TelaDeClassificacoes.jsx` chama estas funções, e a
 * verificação as importa e executa no Node. Função pura não mora em arquivo de
 * componente.
 *
 * O molde é `admin/blog/categorias.js`, lido e nunca importado:
 * `admin/carreiras` e `admin/blog` não se importam (AD-15).
 *
 * ─── O VOCABULÁRIO NÃO MORA AQUI ────────────────────────────────────────────
 *
 * Que listas existem, que Cor e que Equivalente um item pode ter, o teto da
 * Ordem e a regra do nome são do DOMÍNIO (`domain/carreiras/classificacoes.js`),
 * porque o servidor os consulta para recusar. O que mora aqui é o que só a
 * tela precisa: as situações, os rótulos, as frases e o corpo do pedido.
 *
 * ─── NADA AQUI LANÇA ────────────────────────────────────────────────────────
 *
 * Um item com dado torto (sem nome, contagem ilegível, Cor ou Equivalente
 * legado) não pode derrubar a tela: vira "sem nome", "Uso desconhecido" ou o
 * código cru, nunca exceção.
 */

import {
  COR_PADRAO_DE_CLASSIFICACAO,
  FRASE_DA_ORDEM,
  LISTAS_DE_CLASSIFICACAO,
  ORDEM_MAXIMA_DA_CLASSIFICACAO,
  TAMANHO_MAXIMO_DO_NOME_DE_CLASSIFICACAO,
  aparenciaDaCorDeClassificacao,
  ehCorDeClassificacao,
  ehEquivalenteJobPosting,
  normalizarNomeDeClassificacao,
  problemaNoNomeDaClassificacao,
  rotuloDoEquivalente,
} from "../../domain/carreiras/classificacoes.js";
import {
  OPERACAO_EXCLUIR_CLASSIFICACAO,
  OPERACAO_SALVAR_CLASSIFICACAO,
} from "../../domain/carreiras/operacoes.js";

/* ─── As situações da tela ───────────────────────────────────────────────── */

export const SITUACAO_CARREGANDO = "carregando";
export const SITUACAO_ERRO = "erro";
export const SITUACAO_LISTA = "lista";
/**
 * O formulário é superfície própria, que SUBSTITUI a tela (como nas
 * Categorias): a contagem de uso não fica visível atrás de um campo de texto.
 * Uma lista vazia não é situação da tela: ela é dita na própria seção, com a
 * chamada para criar, porque as outras duas listas podem ter itens.
 */
export const SITUACAO_FORMULARIO = "formulario";

/** Lista FECHADA: uma situação nova só entra editando este arquivo. */
export const SITUACOES_DA_TELA = Object.freeze([
  SITUACAO_CARREGANDO,
  SITUACAO_ERRO,
  SITUACAO_LISTA,
  SITUACAO_FORMULARIO,
]);

/**
 * A situação da tela. O formulário vem antes de tudo (uma releitura não passa
 * o esqueleto por cima do que a pessoa digitou), e o erro vem antes da lista:
 * erro não é lista vazia.
 */
export function situacaoDaTela({ editando = false, carregando = false, erro = null } = {}) {
  if (editando) return SITUACAO_FORMULARIO;
  if (carregando) return SITUACAO_CARREGANDO;
  if (erro !== null && erro !== undefined && erro !== false) return SITUACAO_ERRO;
  return SITUACAO_LISTA;
}

/**
 * A leitura veio inteira? Um objeto com UMA LISTA em cada tabela de
 * `LISTAS_DE_CLASSIFICACAO`. Uma tabela ausente ou fora de forma não vira
 * seção vazia (que convidaria a criar o que talvez já exista): a tela inteira
 * vai para o erro, com "Tentar de novo".
 */
export function leituraLegivel(dados) {
  return ehObjeto(dados) && LISTAS_DE_CLASSIFICACAO.every((lista) => Array.isArray(dados[lista.tabela]));
}

/** O identificador do item, quando ele tem um utilizável; senão `null`. */
export function idDoItem(item) {
  const id = ehObjeto(item) ? item.id : undefined;
  return typeof id === "string" && id.trim() !== "" ? id : null;
}

/* ─── As frases da tela ──────────────────────────────────────────────────── */

export const TITULO_DA_TELA = "Departamentos, Tipos e Níveis";
export const DESCRICAO_DA_TELA =
  "Eles classificam as vagas no formulário, na listagem e nos filtros do site. Renomear muda o nome em todas as vagas de uma vez. A ordem define a sequência no formulário e nos filtros.";
export const ROTULO_DE_VOLTAR = "Voltar para as vagas";
export const TEXTO_DO_CARREGAMENTO = "Carregando os departamentos, tipos e níveis.";
export const TITULO_DO_ERRO = "Não conseguimos carregar os departamentos, tipos e níveis";
export const RESERVA_DA_LEITURA =
  "Confira a conexão e tente de novo. Se continuar, recarregue a página do Painel.";
export const ROTULO_DE_NOVA_TENTATIVA = "Tentar de novo";
export const ROTULO_DE_CANCELAR = "Cancelar e voltar para a lista";
export const RESERVA_DA_ACAO = "Confira a conexão e tente de novo. A lista continua como estava.";
/** O item sem identificador: nada é enviado, porque não há o que apontar. */
export const FRASE_DO_ITEM_SEM_ID =
  "Este item chegou sem identificador, então não dá para gravá-lo nem excluí-lo daqui. Recarregue a página do Painel.";
/** A repetição pela notificação chegou com outra gravação ainda em curso. */
export const FRASE_DA_ACAO_OCUPADA =
  "Outra gravação ainda está em curso nesta tela. Espere ela terminar e use Tentar de novo outra vez.";

/* ─── Os textos visíveis da tela ─────────────────────────────────────────── */

/** O texto visível dos alvos da linha; o nome acessível nomeia o item. */
export const TEXTO_DE_EDITAR = "Editar";
export const TEXTO_DE_EXCLUIR = "Excluir";
export const ROTULO_DO_NOME = "Nome";
export const AJUDA_DO_NOME = `(obrigatório, até ${TAMANHO_MAXIMO_DO_NOME_DE_CLASSIFICACAO} caracteres)`;
export const ROTULO_DA_COR = "Cor";
export const ROTULO_DO_EQUIVALENTE = "Equivalente no Google Vagas";
export const MARCA_DE_OBRIGATORIO = "(obrigatório)";
export const OPCAO_SEM_EQUIVALENTE = "Escolha o equivalente";
export const ROTULO_DA_ORDEM = "Ordem no formulário e nos filtros";
export const COMPLEMENTO_DA_AJUDA_DA_ORDEM = "Os menores vêm primeiro; em branco vale 0.";
export const EXEMPLO_DA_ORDEM = "0";
export const TEXTO_DA_ORDEM_DESCONHECIDA = "Ordem não definida";

/** O rótulo do link da aba Carreiras para esta tela. */
export const ROTULO_DO_LINK_DA_ABA = "Classificações";
/** O nome acessível começa pelo texto visível (quem fala o que vê acha o link). */
export const ROTULO_ACESSIVEL_DO_LINK_DA_ABA = "Classificações: departamentos, tipos e níveis";

/* ─── O nome, sempre utilizável ──────────────────────────────────────────── */

function ehObjeto(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/** O nome como ele aparece nas frases: nunca vazio. */
export function nomeParaFrase(item) {
  const nome = normalizarNomeDeClassificacao(ehObjeto(item) ? item.nome : "");
  return nome === "" ? "sem nome" : nome;
}

/** "Departamento", "Tipo" ou "Nível", com reserva para lista torta. */
function rotuloDa(lista) {
  return ehObjeto(lista) && typeof lista.rotulo === "string" && lista.rotulo !== "" ? lista.rotulo : "Item";
}

/* ─── O uso ──────────────────────────────────────────────────────────────── */

/**
 * Quantas Vagas usam o item, ou `null` quando não deu para contar.
 *
 * `null` NÃO É ZERO: a camada devolve `vagas: null` quando a contagem embutida
 * não pôde ser lida, e tratar isso como zero liberaria a exclusão de um item
 * possivelmente em uso. Negativo, fracionário ou fora de forma também é
 * desconhecido.
 */
export function usoDaClassificacao(item) {
  const total = ehObjeto(item) ? item.vagas : undefined;
  if (!Number.isInteger(total) || total < 0) return null;
  return total;
}

/** "N vagas" com singular e plural por extenso. */
function quantasVagas(total) {
  return total === 1 ? "1 vaga" : `${total} vagas`;
}

/** O uso por extenso, para a linha. O desconhecido é dito como desconhecido. */
export function textoDoUso(item) {
  const total = usoDaClassificacao(item);
  if (total === null) return "Uso desconhecido";
  if (total === 0) return "Nenhuma vaga";
  return quantasVagas(total);
}

/** Só o item SABIDAMENTE sem Vaga pode ser excluído. */
export function podeExcluir(item) {
  return usoDaClassificacao(item) === 0;
}

/**
 * Por que não dá para excluir: o que houve e o que fazer, ou `null` quando dá.
 * Em uso e uso desconhecido são motivos diferentes, e pedem coisas
 * diferentes de quem lê.
 */
export function motivoDeNaoExcluir(lista, item) {
  const total = usoDaClassificacao(item);
  const rotulo = rotuloDa(lista);
  const nome = nomeParaFrase(item);
  if (total === null) {
    return Object.freeze({
      oQueHouve: `Uso desconhecido: não deu para contar as vagas do ${rotulo} ${nome}`,
      oQueFazer:
        "Carregue a lista de novo. Enquanto o número não vier, a exclusão fica indisponível: excluir sem saber poderia tirar a classificação de vagas.",
    });
  }
  if (total === 0) return null;
  return Object.freeze({
    oQueHouve: `Em uso por ${quantasVagas(total)}: o ${rotulo} ${nome} não pode ser excluído`,
    oQueFazer: `Troque o ${rotulo} ${total === 1 ? "dessa vaga" : "dessas vagas"} no formulário de cada uma, e a exclusão fica liberada.`,
  });
}

/* ─── Os rótulos das ações da linha ──────────────────────────────────────── */

/** Todo rótulo nomeia o item: dez "Editar" iguais não se distinguem. */
export function rotuloDeEditar(lista, item) {
  return `Editar o ${rotuloDa(lista)} ${nomeParaFrase(item)}`;
}

/** O de excluir diz também quando está indisponível, e por quê. */
export function rotuloDeExcluir(lista, item) {
  const base = `Excluir o ${rotuloDa(lista)} ${nomeParaFrase(item)}`;
  const motivo = motivoDeNaoExcluir(lista, item);
  return motivo === null ? base : `${base}, indisponível. ${motivo.oQueHouve}`;
}

/** O rótulo do botão de criar da seção. */
export function rotuloDeNova(lista) {
  return `Novo ${rotuloDa(lista)}`;
}

/** O vazio da seção, com a chamada para criar. */
export function textoDoVazio(lista) {
  const plural = ehObjeto(lista) && typeof lista.plural === "string" ? lista.plural.toLowerCase() : "itens";
  return `Nenhum ${rotuloDa(lista).toLowerCase()} cadastrado ainda. Crie o primeiro para usar nas vagas; os ${plural} aparecem no formulário de vaga na ordem definida aqui.`;
}

export function rotuloDaPrimeira(lista) {
  return `Criar o primeiro ${rotuloDa(lista)}`;
}

/* ─── A Cor e o Equivalente, por extenso ─────────────────────────────────── */

/**
 * A Cor do item com o NOME da cor, para a cor nunca ser o único portador:
 * `{ rotulo, sigla, fundo, tinta, conhecida }`. Cor legada cai no par neutro,
 * e o nome diz que ela está fora da paleta.
 */
export function corDoItem(item) {
  const cor = ehObjeto(item) ? item.cor : undefined;
  const aparencia = aparenciaDaCorDeClassificacao(item);
  const conhecida = ehCorDeClassificacao(cor);
  return Object.freeze({
    rotulo: conhecida ? aparencia.rotulo : "Cor fora da paleta",
    sigla: aparencia.sigla,
    fundo: aparencia.fundo,
    tinta: aparencia.tinta,
    conhecida,
  });
}

/** O Equivalente por extenso: "Tempo integral (FULL_TIME)", ou o código cru legado. */
export function textoDoEquivalente(valor) {
  const rotulo = rotuloDoEquivalente(valor);
  if (rotulo !== null) return `${rotulo} (${valor})`;
  const cru = typeof valor === "string" ? valor.trim() : "";
  return cru === "" ? "Sem equivalente" : `Fora da lista: ${cru}`;
}

/** A Cor na linha do item, por extenso. */
export function textoDaCorNaLinha(item) {
  return `Cor: ${corDoItem(item).rotulo}`;
}

/** O Equivalente na linha do Tipo, por extenso. */
export function textoDoEquivalenteNaLinha(item) {
  return `Google Vagas: ${textoDoEquivalente(ehObjeto(item) ? item.equivalente_jobposting : undefined)}`;
}

/**
 * A Ordem na linha. Ordem que não é inteiro de 0 para cima é DESCONHECIDA, e
 * é dita como tal: mostrar "0" inventaria uma posição que o banco não deu.
 */
export function textoDaOrdem(item) {
  const ordem = ehObjeto(item) ? item.ordem : undefined;
  return Number.isInteger(ordem) && ordem >= 0 ? `Ordem ${ordem}` : TEXTO_DA_ORDEM_DESCONHECIDA;
}

/** O nome acessível do grupo de Cor. */
export function rotuloDoGrupoDeCor(lista) {
  return `Cor do ${rotuloDa(lista)}`;
}

/** A Cor escolhida no formulário, por extenso (a descrição do grupo). */
export function textoDaCorEscolhida(cor) {
  return `Cor escolhida: ${corDoItem({ cor }).rotulo}`;
}

/* ─── A confirmação e as notificações ────────────────────────────────────── */

/** A pergunta do diálogo, nomeando o item. */
export function tituloDaExclusao(lista, item) {
  return `Excluir o ${rotuloDa(lista)} “${nomeParaFrase(item)}”?`;
}

/** A consequência, factual: só item sem Vaga chega aqui. */
export function descricaoDaExclusao(lista) {
  const rotulo = rotuloDa(lista);
  return `Ele sai do formulário de vaga e dos filtros do site. Nenhuma vaga é alterada, porque nenhuma vaga usa este ${rotulo}. Não dá para desfazer.`;
}

/** O rótulo do botão que confirma: diz o que faz. */
export function rotuloDeConfirmarExclusao(lista) {
  return `Excluir ${rotuloDa(lista)}`;
}

/** A reserva do rótulo, com o diálogo fechado. */
export const ROTULO_DE_CONFIRMAR_EXCLUSAO_PADRAO = "Excluir classificação";

export function confirmacaoDaExclusao(lista, item) {
  return `${rotuloDa(lista)} ${nomeParaFrase(item)} excluído`;
}

export function falhaDaExclusao(lista, item) {
  return `Não deu para excluir o ${rotuloDa(lista)} ${nomeParaFrase(item)}`;
}

/** A exclusão de um item que já tinha saído: não é falha de quem pediu. */
export function ausenciaNaExclusao(lista, item) {
  return `O ${rotuloDa(lista)} ${nomeParaFrase(item)} já não existia`;
}

export function confirmacaoDoSalvamento(lista, item, criada) {
  const nome = nomeParaFrase(item);
  return criada ? `${rotuloDa(lista)} ${nome} criado` : `${rotuloDa(lista)} ${nome} salvo`;
}

export function falhaDoSalvamento(lista, item) {
  return `Não deu para salvar o ${rotuloDa(lista)} ${nomeParaFrase(item)}`;
}

/** O que está acontecendo, para a região viva: nomeia o item. */
export function textoDaAcaoEmCurso(lista, item, operacao) {
  const alvo = `o ${rotuloDa(lista)} ${nomeParaFrase(item)}`;
  if (operacao === OPERACAO_EXCLUIR_CLASSIFICACAO) return `Excluindo ${alvo}…`;
  if (operacao === OPERACAO_SALVAR_CLASSIFICACAO) return `Salvando ${alvo}…`;
  return "";
}

/* ─── O formulário ───────────────────────────────────────────────────────── */

/** Os campos do formulário de uma lista, na ordem em que ele os oferece. */
export function camposDoFormulario(lista) {
  return Object.freeze([
    "nome",
    ...(lista?.temCor ? ["cor"] : []),
    ...(lista?.temEquivalente ? ["equivalente_jobposting"] : []),
    "ordem",
  ]);
}

export function tituloDoFormulario(lista, criando) {
  return criando ? `Novo ${rotuloDa(lista)}` : `Editar ${rotuloDa(lista)}`;
}

export function rotuloDeEnviar(lista, criando) {
  return criando ? `Criar ${rotuloDa(lista)}` : `Salvar ${rotuloDa(lista)}`;
}

export const FRASE_DO_EQUIVALENTE_AUSENTE =
  "Escolha o equivalente para o Google Vagas: é ele que diz ao Google o tipo de contratação.";
export const FRASE_DA_COR_FORA_DA_PALETA = "Escolha uma das cores da paleta.";

/**
 * O formulário de um item novo. A Cor nasce na padrão (a do banco); o
 * Equivalente nasce vazio, de propósito: escolher por reflexo o primeiro da
 * lista seria gravar um tipo de contratação que ninguém decidiu.
 */
export function valoresVazios(lista) {
  return {
    nome: "",
    cor: lista?.temCor ? COR_PADRAO_DE_CLASSIFICACAO : "",
    equivalente_jobposting: "",
    ordem: "",
  };
}

/**
 * Os valores do formulário a partir de um item gravado. Tudo vira texto, e a
 * Cor e o Equivalente vêm CRUS, mesmo legados: é comparando com eles que o
 * corpo sabe o que mudou, e um legado que ninguém tocou não é reenviado.
 */
export function valoresDaClassificacao(lista, item) {
  if (!ehObjeto(item)) return valoresVazios(lista);
  return {
    nome: typeof item.nome === "string" ? item.nome : "",
    cor: lista?.temCor && typeof item.cor === "string" ? item.cor : "",
    equivalente_jobposting:
      lista?.temEquivalente && typeof item.equivalente_jobposting === "string" ? item.equivalente_jobposting : "",
    ordem: Number.isInteger(item.ordem) ? String(item.ordem) : "",
  };
}

/**
 * A Ordem lida pela regra do domínio: vazio é 0 (como no servidor), e só
 * inteiro de 0 ao teto passa.
 */
export function lerOrdem(bruto) {
  const texto = String(bruto ?? "").trim();
  if (texto === "") return { ok: true, ordem: 0 };
  if (!/^[0-9]{1,7}$/.test(texto)) return { ok: false, motivo: FRASE_DA_ORDEM };
  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < 0 || numero > ORDEM_MAXIMA_DA_CLASSIFICACAO) {
    return { ok: false, motivo: FRASE_DA_ORDEM };
  }
  return { ok: true, ordem: numero };
}

/**
 * O corpo do pedido de gravação: `{ ok: true, corpo, vazio }` ou
 * `{ ok: false, campo, motivo }`, com a recusa LOCAL pelas regras do domínio
 * antes de qualquer envio.
 *
 * Criando, vão o nome, a Cor (listas com Cor), o Equivalente (o Tipo, onde é
 * obrigatório) e a Ordem. Editando (`original` é o item gravado), vai SÓ o que
 * mudou; uma Cor ou um Equivalente legado que ninguém tocou não é reenviado
 * (o servidor o recusaria, e renomear ficaria travado). Sem mudança nenhuma,
 * `vazio` é verdadeiro e o corpo não viaja: a tela fecha o formulário sem
 * pedido (o servidor responderia "nada para mudar").
 */
export function corpoDaClassificacao(lista, valores, { original = null } = {}) {
  const v = ehObjeto(valores) ? valores : valoresVazios(lista);
  const criando = !ehObjeto(original);

  /* O nome é comparado com o original NORMALIZADO: um nome gravado com espaço
     sobrando, que ninguém tocou, não viaja nem é conferido de novo. */
  const nome = normalizarNomeDeClassificacao(v.nome);
  const nomeMudou = criando || nome !== normalizarNomeDeClassificacao(original.nome);
  if (nomeMudou) {
    const problemaNoNome = problemaNoNomeDaClassificacao(nome);
    if (problemaNoNome !== null) return { ok: false, campo: "nome", motivo: problemaNoNome };
  }

  let cor;
  if (lista?.temCor) {
    const corOriginal = criando ? undefined : original.cor;
    if (criando || v.cor !== corOriginal) {
      if (!ehCorDeClassificacao(v.cor)) return { ok: false, campo: "cor", motivo: FRASE_DA_COR_FORA_DA_PALETA };
      cor = v.cor;
    }
  }

  let equivalente;
  if (lista?.temEquivalente) {
    const valor = typeof v.equivalente_jobposting === "string" ? v.equivalente_jobposting : "";
    const equivalenteOriginal = criando ? undefined : original.equivalente_jobposting;
    if (valor === "") {
      return { ok: false, campo: "equivalente_jobposting", motivo: FRASE_DO_EQUIVALENTE_AUSENTE };
    }
    if (criando || valor !== equivalenteOriginal) {
      if (!ehEquivalenteJobPosting(valor)) {
        return { ok: false, campo: "equivalente_jobposting", motivo: FRASE_DO_EQUIVALENTE_AUSENTE };
      }
      equivalente = valor;
    }
  }

  /* A Ordem que ninguém tocou (o campo tem o MESMO texto com que o formulário
     abriu) não é lida nem enviada: uma Ordem desconhecida (o campo abre
     vazio, e vazio valeria 0) ou um legado acima do teto não travam renomear,
     nem viram outra posição sem ninguém pedir. */
  let ordem;
  const ordemIntocada =
    !criando && String(v.ordem ?? "").trim() === String(valoresDaClassificacao(lista, original).ordem).trim();
  if (!ordemIntocada) {
    const lida = lerOrdem(v.ordem);
    if (!lida.ok) return { ok: false, campo: "ordem", motivo: lida.motivo };
    if (criando || lida.ordem !== original.ordem) ordem = lida.ordem;
  }

  const corpo = {};
  if (nomeMudou) corpo.nome = nome;
  if (cor !== undefined) corpo.cor = cor;
  if (equivalente !== undefined) corpo.equivalente_jobposting = equivalente;
  if (ordem !== undefined) corpo.ordem = ordem;
  return { ok: true, corpo, vazio: Object.keys(corpo).length === 0 };
}
