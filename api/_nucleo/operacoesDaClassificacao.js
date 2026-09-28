/**
 * As operações de Classificação da Story 5.3: salvar e excluir um
 * Departamento, um Tipo ou um Nível.
 *
 * No molde das operações de Categoria (`operacoesDaCategoria.js`), com três
 * diferenças que são o ponto:
 *
 *   * a TABELA vem de `LISTAS_DE_CLASSIFICACAO` pela chave `lista` do corpo,
 *     e nunca do texto do pedido. Chave fora da lista é 422, sem ida ao banco;
 *   * a colisão de nome é conferida SEM caixa nem acento, como o índice único
 *     do banco (`normalizar_busca(nome)`), e o 23505 dele é a rede de baixo;
 *   * em uso é contado pela coluna da lista em `vagas`, e o 23503 da chave
 *     estrangeira `restrict` vira 409 com o número, nunca 422.
 *
 * As frases falam de Departamento, Tipo e Nível, nunca de post nem de
 * categoria. Nenhuma função lança.
 */

import {
  OPERACAO_EXCLUIR_CLASSIFICACAO,
  OPERACAO_SALVAR_CLASSIFICACAO,
} from "../../src/domain/carreiras/operacoes.js";
import {
  EQUIVALENTES_JOBPOSTING,
  FRASE_DA_ORDEM,
  LISTAS_DE_CLASSIFICACAO,
  ORDEM_MAXIMA_DA_CLASSIFICACAO,
  ehCorDeClassificacao,
  ehEquivalenteJobPosting,
  fraseDeNomeRepetido,
  fraseDeNomeRepetidoNoBanco,
  listaDeClassificacao,
  normalizarNomeDeClassificacao,
  problemaNoNomeDaClassificacao,
} from "../../src/domain/carreiras/classificacoes.js";
import { autorizar } from "./autenticacao.js";
import {
  falhaDaEscritaDeCarreiras,
  falhaDeExcecao,
  relatorioDeIgnorados,
} from "./operacoesDaVaga.js";
import {
  ERRO_CONFLITO,
  ERRO_DADOS_INVALIDOS,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  PADRAO_UUID,
  detalhar,
  falha,
} from "./salvarPost.js";

/* ─── As frases da autorização ───────────────────────────────────────────── */

export const SEM_PERMISSAO_PARA_CLASSIFICACOES =
  "Sua sessão não autoriza mexer nos Departamentos, Tipos e Níveis. Entre no Painel de novo e tente outra vez.";
export const SEM_CADASTRO_PARA_CLASSIFICACOES =
  "Esta conta não está cadastrada no Painel, então não pode mexer nos Departamentos, Tipos e Níveis. Avise quem cuida das contas.";
const SEM_RESPOSTA_PARA_SALVAR =
  "Não conseguimos falar com o servidor para salvar a classificação. Espere um instante e tente de novo.";
const SEM_RESPOSTA_PARA_EXCLUIR =
  "Não conseguimos falar com o servidor para excluir a classificação. Espere um instante e tente de novo.";

/**
 * O teto de `ordem`. O banco só exige `>= 0`; o teto é higiene de entrada.
 * Desde a Story 5.6 ele mora no DOMÍNIO, com o mesmo valor, e a tela de
 * Classificações o lê de lá: a regra tem um dono só. Reexportado aqui para
 * quem já o lia deste módulo.
 */
export { ORDEM_MAXIMA_DA_CLASSIFICACAO };

/**
 * A chave de comparação de um nome: sem caixa e sem acento, o espelho JS de
 * `public.normalizar_busca` (`lower(unaccent(x))`). Não precisa ser perfeito:
 * o índice único do banco é quem decide, e o 23505 dele cai na mesma frase.
 * Serve para a recusa dizer QUAL nome já existe.
 */
export function chaveDoNomeDaClassificacao(nome) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** A lista do corpo, pela lista fechada do domínio, ou a recusa. */
function listaDoCorpo(corpo) {
  const bruto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo) ? corpo.lista : undefined;
  const lista = typeof bruto === "string" ? listaDeClassificacao(bruto.trim()) : null;
  if (lista === null) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: `Não reconhecemos a lista pedida. As listas de classificação são: ${LISTAS_DE_CLASSIFICACAO.map((l) => l.chave).join(", ")}.`,
      detalhe: `lista fora do vocabulário: ${JSON.stringify(String(bruto).slice(0, 40))}`,
    });
  }
  return { ok: true, lista };
}

/** O identificador no corpo; ausente cria quando não é obrigatório. */
function idDaClassificacao(corpo, lista, { obrigatorio }) {
  const bruto = corpo.id;
  if (bruto === undefined || bruto === null || bruto === "") {
    if (!obrigatorio) return { ok: true, id: null };
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: `Não reconhecemos qual ${lista.rotulo} deve ser alterado.`,
      detalhe: `id de ${lista.chave} ausente no corpo do pedido`,
    });
  }
  const id = typeof bruto === "string" ? bruto.trim() : "";
  if (!PADRAO_UUID.test(id)) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: `Não reconhecemos qual ${lista.rotulo} deve ser alterado.`,
      detalhe: `id de ${lista.chave} fora do formato: ${JSON.stringify(String(bruto).slice(0, 60))}`,
    });
  }
  return { ok: true, id };
}

/** Os campos que um salvamento aceita, para a lista dada. */
export function camposDaClassificacao(lista) {
  return Object.freeze([
    "id",
    "lista",
    "nome",
    ...(lista.temCor ? ["cor"] : []),
    ...(lista.temEquivalente ? ["equivalente_jobposting"] : []),
    "ordem",
    "operacao",
  ]);
}

/**
 * Lê o corpo de um salvamento. Criar exige nome (e, no Tipo, o Equivalente
 * JobPosting, que é obrigatório no banco). A Cor é da paleta fechada. Campo
 * que não é da lista (a Cor de um Tipo, por exemplo) é ignorado e relatado.
 */
export function lerCorpoDaClassificacao(corpo, lista, { criando }) {
  const campos = {};
  const problemas = [];
  const detalhes = [];

  if (corpo.nome === undefined) {
    if (criando) {
      problemas.push(`O ${lista.rotulo} precisa de um nome.`);
      detalhes.push("nome ausente na criação");
    }
  } else {
    const problema = typeof corpo.nome === "string" ? problemaNoNomeDaClassificacao(corpo.nome) : "O nome precisa ser texto.";
    if (problema !== null) {
      problemas.push(problema);
      detalhes.push(`nome recusado: ${JSON.stringify(String(corpo.nome).slice(0, 80))}`);
    } else {
      campos.nome = normalizarNomeDeClassificacao(corpo.nome);
    }
  }

  if (lista.temCor && corpo.cor !== undefined) {
    if (ehCorDeClassificacao(corpo.cor)) campos.cor = corpo.cor;
    else {
      problemas.push("Essa cor não está entre as cores disponíveis.");
      detalhes.push(`cor fora da paleta: ${JSON.stringify(String(corpo.cor).slice(0, 60))}`);
    }
  }

  if (lista.temEquivalente) {
    if (corpo.equivalente_jobposting === undefined) {
      if (criando) {
        problemas.push(`Um ${lista.rotulo} precisa do equivalente para o Google Vagas.`);
        detalhes.push("equivalente_jobposting ausente na criação");
      }
    } else if (ehEquivalenteJobPosting(corpo.equivalente_jobposting)) {
      campos.equivalente_jobposting = corpo.equivalente_jobposting;
    } else {
      problemas.push(`O equivalente para o Google Vagas precisa ser um destes: ${EQUIVALENTES_JOBPOSTING.join(", ")}.`);
      detalhes.push(
        `equivalente fora da lista: ${JSON.stringify(String(corpo.equivalente_jobposting).slice(0, 40))}`,
      );
    }
  }

  if (corpo.ordem !== undefined) {
    const bruto = corpo.ordem;
    if (bruto === null || bruto === "") campos.ordem = 0;
    else {
      const numero =
        typeof bruto === "number" ? bruto : typeof bruto === "string" && /^[0-9]{1,7}$/.test(bruto.trim()) ? Number(bruto.trim()) : NaN;
      if (Number.isInteger(numero) && numero >= 0 && numero <= ORDEM_MAXIMA_DA_CLASSIFICACAO) {
        campos.ordem = numero;
      } else {
        problemas.push(FRASE_DA_ORDEM);
        detalhes.push(`ordem recusada: ${JSON.stringify(String(bruto).slice(0, 20))}`);
      }
    }
  }

  if (problemas.length > 0) {
    return { ok: false, mensagem: problemas.join(" "), detalhe: detalhes.join(" | ") };
  }
  if (Object.keys(campos).length === 0) {
    return {
      ok: false,
      mensagem: `O pedido não traz nada para mudar no ${lista.rotulo}.`,
      detalhe: "nenhum campo aceito veio no corpo",
    };
  }
  return { ok: true, campos, ...relatorioDeIgnorados(corpo, camposDaClassificacao(lista)) };
}

/**
 * A frase do nome repetido, com o nome que JÁ existe. Desde a revisão da Story
 * 5.6 ela mora no DOMÍNIO, com o mesmo texto, para a tela reconhecê-la pela
 * forma; reexportada aqui para quem já a lia deste módulo.
 */
export { fraseDeNomeRepetido };

/**
 * Cria ou edita uma Classificação (`{ lista, id?, nome, cor?,
 * equivalente_jobposting?, ordem? }`).
 *
 * `{ ok: true, dados: { operacao, criada, lista, classificacao, ignorados,
 * totalIgnorado, ignoradosTruncados } }`.
 * Renomear não copia nome para lugar nenhum: a Vaga aponta para a
 * Classificação pelo id, e o site público lê o nome dela.
 */
export async function salvarClassificacao({ token, corpo, acesso }) {
  const fazer = "salvar a classificação";
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_CLASSIFICACOES,
      mensagemDeRede: SEM_RESPOSTA_PARA_SALVAR,
      mensagemDeCadastro: SEM_CADASTRO_PARA_CLASSIFICACOES,
    });
    if (!autorizado.ok) return autorizado;

    const pedida = listaDoCorpo(corpo);
    if (!pedida.ok) return pedida;
    const { lista } = pedida;

    const alvo = idDaClassificacao(corpo, lista, { obrigatorio: false });
    if (!alvo.ok) return alvo;
    const criando = alvo.id === null;

    const lido = lerCorpoDaClassificacao(corpo, lista, { criando });
    if (!lido.ok) {
      return falha(ERRO_DADOS_INVALIDOS, { mensagem: lido.mensagem, detalhe: lido.detalhe });
    }

    const conflito = fraseDeNomeRepetidoNoBanco(lista);
    const fazerAqui = `salvar o ${lista.rotulo}`;

    if (!criando) {
      const atual = await acesso.lerClassificacao(lista.chave, alvo.id);
      if (!atual.ok) return falhaDaEscritaDeCarreiras(atual, { oQue: `leitura de ${lista.tabela}`, fazer: fazerAqui, conflito });
      if (atual.dados === null) {
        return falha(ERRO_NAO_ENCONTRADO, {
          mensagem: `Este ${lista.rotulo} não existe mais. Ele pode ter sido excluído por outra pessoa.`,
          detalhe: `nenhuma linha em ${lista.tabela} com id ${alvo.id}`,
        });
      }
    }

    /* A COLISÃO, sem caixa nem acento, dizendo QUAL nome já existe. */
    if (lido.campos.nome !== undefined) {
      const nomes = await acesso.listarNomesDaClassificacao(lista.chave);
      if (!nomes.ok) {
        return falhaDaEscritaDeCarreiras(nomes, { oQue: `nomes de ${lista.tabela}`, fazer: fazerAqui, conflito });
      }
      /* O PRÓPRIO item não colide consigo mesmo. Os identificadores são
         comparados NORMALIZADOS (minúsculas): o formato aceita UUID em
         maiúsculas, o banco devolve em minúsculas, e sem isso editar a Cor
         enviando o próprio nome daria "já existe um Departamento chamado". */
      const proprio = alvo.id === null ? null : alvo.id.toLowerCase();
      const chave = chaveDoNomeDaClassificacao(lido.campos.nome);
      const dono = (Array.isArray(nomes.dados) ? nomes.dados : []).find(
        (linha) =>
          String(linha?.id ?? "").toLowerCase() !== proprio && chaveDoNomeDaClassificacao(linha?.nome) === chave,
      );
      if (dono) {
        return falha(ERRO_CONFLITO, {
          mensagem: fraseDeNomeRepetido(lista, dono.nome),
          detalhe: `nome ${JSON.stringify(lido.campos.nome)} colide com ${lista.tabela} ${dono.id}`,
        });
      }
    }

    const colunas = {};
    for (const nome of ["nome", "cor", "equivalente_jobposting", "ordem"]) {
      if (lido.campos[nome] !== undefined) colunas[nome] = lido.campos[nome];
    }

    const escrita = criando
      ? await acesso.inserirClassificacao(lista.chave, colunas)
      : await acesso.atualizarClassificacao(lista.chave, alvo.id, colunas);
    if (!escrita.ok) {
      return falhaDaEscritaDeCarreiras(escrita, {
        oQue: criando ? `criação em ${lista.tabela}` : `gravação em ${lista.tabela}`,
        fazer: fazerAqui,
        conflito,
      });
    }
    if (escrita.dados === null) {
      if (criando) {
        return falha(ERRO_INESPERADO, {
          mensagem: `O ${lista.rotulo} pode ter sido criado, mas o servidor não confirmou. Recarregue a lista antes de tentar de novo.`,
          detalhe: `a criação em ${lista.tabela} não devolveu a linha gravada`,
        });
      }
      return falha(ERRO_NAO_ENCONTRADO, {
        mensagem: `Este ${lista.rotulo} não existe mais. Ele pode ter sido excluído por outra pessoa.`,
        detalhe: `nenhuma linha em ${lista.tabela} com id ${alvo.id} para gravar`,
      });
    }

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_SALVAR_CLASSIFICACAO,
        criada: criando,
        lista: lista.chave,
        classificacao: escrita.dados,
        ignorados: lido.ignorados,
        totalIgnorado: lido.totalIgnorado,
        ignoradosTruncados: lido.ignoradosTruncados,
      }),
    });
  } catch (excecao) {
    return falhaDeExcecao(excecao, fazer);
  }
}

/**
 * A frase da recusa por uso, com o NÚMERO de Vagas. Exportada para a
 * verificação executá-la.
 */
export function fraseDeClassificacaoEmUso(lista, nome, total) {
  const quantas = total === 1 ? "1 vaga" : `${total} vagas`;
  const dessas = total === 1 ? "dessa vaga" : "dessas vagas";
  return `Não dá para excluir o ${lista.rotulo} “${nome}”: em uso por ${quantas}. Troque o ${lista.rotulo} ${dessas} antes de excluir.`;
}

/** A mesma recusa, quando o número não pôde ser contado: nunca um número inventado. */
export function fraseDeClassificacaoEmUsoSemNumero(lista, nome) {
  return `Não dá para excluir o ${lista.rotulo} “${nome}”: ele está em uso por vagas. Troque o ${lista.rotulo} dessas vagas antes de excluir.`;
}

/**
 * Exclui uma Classificação que nenhuma Vaga usa (`{ lista, id }`).
 *
 * A contagem EXPLICA a recusa; a chave estrangeira `restrict` é quem recusa.
 * Se o banco recusar mesmo assim (corrida entre a contagem e o comando), o
 * 23503 é conflito, com a contagem refeita para a frase dizer quantas.
 *
 * `{ ok: true, dados: { operacao, lista, id, classificacao } }`.
 */
export async function excluirClassificacao({ token, corpo, acesso }) {
  const fazer = "excluir a classificação";
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_CLASSIFICACOES,
      mensagemDeRede: SEM_RESPOSTA_PARA_EXCLUIR,
      mensagemDeCadastro: SEM_CADASTRO_PARA_CLASSIFICACOES,
    });
    if (!autorizado.ok) return autorizado;

    const pedida = listaDoCorpo(corpo);
    if (!pedida.ok) return pedida;
    const { lista } = pedida;

    const alvo = idDaClassificacao(corpo, lista, { obrigatorio: true });
    if (!alvo.ok) return alvo;

    const fazerAqui = `excluir o ${lista.rotulo}`;
    const ausente = () =>
      falha(ERRO_NAO_ENCONTRADO, {
        mensagem: `Este ${lista.rotulo} já não está no Painel, alguém pode tê-lo excluído antes.`,
        detalhe: `nenhuma linha em ${lista.tabela} com id ${alvo.id} para excluir`,
      });

    const atual = await acesso.lerClassificacao(lista.chave, alvo.id);
    if (!atual.ok) {
      return falhaDaEscritaDeCarreiras(atual, { oQue: `leitura de ${lista.tabela}`, fazer: fazerAqui, conflito: "" });
    }
    if (atual.dados === null) return ausente();

    const contagem = await acesso.contarVagasDaClassificacao(lista.chave, alvo.id);
    if (!contagem.ok) {
      return falhaDaEscritaDeCarreiras(contagem, { oQue: "contagem de vagas da classificação", fazer: fazerAqui, conflito: "" });
    }
    const total = Number(contagem.dados?.total ?? 0);
    if (total > 0) {
      return falha(ERRO_CONFLITO, {
        mensagem: fraseDeClassificacaoEmUso(lista, atual.dados.nome, total),
        detalhe: `${lista.tabela} ${alvo.id} em uso por ${total} vaga(s)`,
      });
    }

    const apagada = await acesso.excluirClassificacao(lista.chave, alvo.id);
    if (!apagada.ok) {
      /* O CÓDIGO PRIMEIRO: 23503 é a chave estrangeira `restrict` recusando
         uma Classificação que passou a ser usada entre a contagem e o
         comando. É conflito, e a frase diz quantas, recontadas. */
      if (String(apagada.codigo ?? "") === "23503") {
        /* Se a RECONTAGEM falhar, a frase diz que está em uso SEM inventar
           número, e a falha da recontagem vai para o log, não some. */
        const recontagem = await acesso.contarVagasDaClassificacao(lista.chave, alvo.id);
        const n = recontagem.ok ? Number(recontagem.dados?.total ?? 0) : 0;
        const semRecontagem = recontagem.ok
          ? ""
          : ` | a recontagem falhou: ${detalhar(recontagem, "recontagem de vagas da classificação")}`;
        return falha(ERRO_CONFLITO, {
          mensagem:
            Number.isInteger(n) && n > 0
              ? fraseDeClassificacaoEmUso(lista, atual.dados.nome, n)
              : fraseDeClassificacaoEmUsoSemNumero(lista, atual.dados.nome),
          detalhe: `o banco recusou pela chave estrangeira de vagas: ${apagada.mensagem}${semRecontagem}`,
          codigo: apagada.codigo,
          status: apagada.status,
        });
      }
      return falhaDaEscritaDeCarreiras(apagada, { oQue: `exclusão em ${lista.tabela}`, fazer: fazerAqui, conflito: "" });
    }
    if (apagada.dados === null) return ausente();

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_EXCLUIR_CLASSIFICACAO,
        lista: lista.chave,
        id: alvo.id,
        classificacao: apagada.dados,
      }),
    });
  } catch (excecao) {
    return falhaDeExcecao(excecao, fazer);
  }
}
