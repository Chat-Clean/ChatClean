/**
 * Leitura de Vagas e de Classificações: a camada de dados de Carreiras.
 *
 * O desenho é o de `src/data/blog/`, reaproveitado por IMPORTAÇÃO: o contrato
 * de resultado (`resultado.js`), a obtenção de cliente e as guardas de
 * entrada (`comum.js`). Nada é copiado de lá.
 *
 * **A separação de papéis é do MÓDULO, não do chamador.** As leituras
 * públicas obtêm só o cliente anônimo; as do Painel, só o cliente com sessão.
 * Não há parâmetro para escolher.
 *
 * **Nenhuma consulta pública filtra por Estado.** Quem decide que só a Vaga
 * Aberta é pública é o banco: a política `vagas_leitura_anonima` para a
 * leitura direta da tabela, e as duas funções de entrega (`vagas_abertas`,
 * `situacao_da_vaga`). Elas são `security definer`, então a política NÃO se
 * aplica dentro delas, e por necessidade repetem o mesmo predicado
 * (`estado = 'aberta'`); a ferramenta `verificar:carreiras` confere, em
 * transação desfeita, que a política e as duas funções só entregam Aberta.
 * Repetir o filtro AQUI seria uma terceira cópia, e sem o banco para julgá-la.
 *
 * **Só leitura, e nunca lança.** Toda função devolve `sucesso(dados)` ou uma
 * falha tipada (`rede`, `permissao`, `configuracao`, `nao_encontrado`,
 * `inesperado`). A escrita de Vaga passa pela função de servidor (Story 5.3).
 */

import {
  CAMPOS_SO_DA_ABERTA,
  ehEstadoDaVaga,
  ESTADOS_DA_VAGA,
  ehSituacaoDaVaga,
  SITUACAO_ABERTA,
  SITUACAO_ENCERRADA,
  SITUACAO_INEXISTENTE,
  SITUACOES_DA_VAGA,
} from "../../domain/carreiras/estados.js";
import {
  clienteDoPainelOuFalha,
  clientePublicoOuFalha,
  deslocamentoValido,
  ehSlug,
  ehUuid,
  limiteValido,
  termoValido,
} from "../blog/comum.js";
import {
  consultar,
  descrever,
  ehFaixaAlemDoFim,
  ERRO_INESPERADO,
  exigirLista,
  exigirRegistro,
  falha,
  naoEncontrado,
  sinalDePrazo,
  sucesso,
} from "../blog/resultado.js";

/* ─── Os nomes que viajam ────────────────────────────────────────────────── */

/** As funções de banco que este módulo chama. Nome escrito uma vez só. */
export const FUNCAO_DAS_VAGAS_ABERTAS = "vagas_abertas";
export const FUNCAO_DA_SITUACAO = "situacao_da_vaga";
export const FUNCAO_DE_BUSCA_DE_VAGAS = "buscar_vagas_do_painel";

/** As colunas de uma Vaga inteira, uma a uma, na grafia do banco. */
export const COLUNAS_DA_VAGA = Object.freeze([
  "id",
  "titulo",
  "slug",
  "estado",
  "departamento_id",
  "tipo_id",
  "nivel_id",
  "modalidade",
  "localizacao",
  "resumo",
  "descricao",
  "descricao_html",
  "link_de_candidatura",
  "aberta_em",
  "criado_em",
  "atualizado_em",
]);

/** As colunas da listagem do Painel: tudo menos o documento e o HTML. */
export const COLUNAS_DA_LISTAGEM_DE_VAGAS = Object.freeze(
  COLUNAS_DA_VAGA.filter((c) => c !== "descricao" && c !== "descricao_html"),
);

/** As colunas de cada lista de Classificação. */
export const COLUNAS_DAS_CLASSIFICACOES = Object.freeze({
  departamentos: Object.freeze(["id", "nome", "cor", "ordem"]),
  tipos_de_vaga: Object.freeze(["id", "nome", "equivalente_jobposting", "ordem"]),
  niveis: Object.freeze(["id", "nome", "cor", "ordem"]),
});

const TABELAS_DAS_CLASSIFICACOES = Object.freeze(Object.keys(COLUNAS_DAS_CLASSIFICACOES));

/* ─── Formas ─────────────────────────────────────────────────────────────── */

function ehObjeto(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

function problemaNaVaga(linha) {
  if (!ehObjeto(linha)) return `esperava um objeto e veio ${descrever(linha)}`;
  if (typeof linha.id !== "string" || linha.id === "") return "`id` ausente";
  if (typeof linha.slug !== "string" || linha.slug === "") return "`slug` ausente";
  if (typeof linha.titulo !== "string") return "`titulo` ausente";
  if (!ehEstadoDaVaga(linha.estado)) {
    return `\`estado\` fora do vocabulário (${ESTADOS_DA_VAGA.join(", ")}): ${JSON.stringify(linha.estado)}`;
  }
  return null;
}

function problemaNaVagaAberta(linha) {
  if (!ehObjeto(linha)) return `esperava um objeto e veio ${descrever(linha)}`;
  if (linha.situacao !== SITUACAO_ABERTA) return `\`situacao\` não é aberta: ${JSON.stringify(linha.situacao)}`;
  if (typeof linha.slug !== "string" || linha.slug === "") return "`slug` ausente";
  if (typeof linha.titulo !== "string" || linha.titulo === "") return "`titulo` ausente";
  return null;
}

function problemaNaSituacao(linha) {
  if (!ehObjeto(linha)) return `esperava um objeto e veio ${descrever(linha)}`;
  if (!ehSituacaoDaVaga(linha.situacao)) {
    return `\`situacao\` fora do vocabulário (${SITUACOES_DA_VAGA.join(", ")}): ${JSON.stringify(linha.situacao)}`;
  }
  return null;
}

function problemaNaClassificacao(linha) {
  if (!ehObjeto(linha)) return `esperava um objeto e veio ${descrever(linha)}`;
  if (typeof linha.id !== "string" || linha.id === "") return "`id` ausente";
  if (typeof linha.nome !== "string" || linha.nome === "") return "`nome` ausente";
  return null;
}

/**
 * A situação de quem não existe, pronta: todos os campos nulos. É o que volta
 * para Slug fora do formato, sem ir à rede.
 */
const SITUACAO_VAZIA = Object.freeze({
  situacao: SITUACAO_INEXISTENTE,
  slug: null,
  titulo: null,
  ...Object.fromEntries(CAMPOS_SO_DA_ABERTA.map((campo) => [campo, null])),
});

/**
 * A linha da situação, com os campos de conteúdo APAGADOS fora da Aberta. O
 * banco já não os devolve; esta é a segunda trava, que custa nada e fecha o
 * caso de a função ser trocada por uma versão frouxa sem ninguém reler aqui.
 *
 * Fora da Aberta a saída é montada por LISTA DE PERMISSÃO, e nunca copiando a
 * linha: uma coluna que a função passasse a devolver, e que ninguém listou em
 * `CAMPOS_SO_DA_ABERTA`, atravessaria uma cópia inteira sem ser vista. Na
 * Encerrada passam só `situacao`, `slug` e `titulo`; na inexistente, só
 * `situacao`. Toda outra chave da forma pública existe, e é nula.
 */
function recortarSituacao(linha) {
  if (linha.situacao === SITUACAO_ABERTA) return Object.freeze({ ...linha });
  const encerrada = linha.situacao === SITUACAO_ENCERRADA;
  return Object.freeze({
    ...SITUACAO_VAZIA,
    situacao: encerrada ? SITUACAO_ENCERRADA : SITUACAO_INEXISTENTE,
    slug: encerrada && typeof linha.slug === "string" ? linha.slug : null,
    titulo: encerrada && typeof linha.titulo === "string" ? linha.titulo : null,
  });
}

/**
 * O número de uma agregação embutida do PostgREST (`vagas(count)`), ou `null`
 * quando não dá para ler. Nulo, e nunca zero: "nenhuma vaga usa" é a frase que
 * libera uma exclusão, e ela não se inventa de uma resposta ilegível.
 */
function contagemEmbutida(bruto) {
  const primeiro = Array.isArray(bruto) ? bruto[0] : bruto;
  if (!ehObjeto(primeiro)) return null;
  const total = primeiro.count;
  return Number.isInteger(total) && total >= 0 ? total : null;
}

/* ─── Leituras PÚBLICAS ──────────────────────────────────────────────────── */

/**
 * As Vagas Abertas, as mais recentes primeiro, com os nomes e as Cores das
 * Classificações. Pela função `vagas_abertas`, que só devolve Aberta e já vem
 * ordenada por `aberta_em` decrescente.
 */
export async function listarVagasAbertas() {
  const operacao = "listarVagasAbertas";
  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados.rpc(FUNCAO_DAS_VAGAS_ABERTAS).abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;
  return exigirLista(resposta.dados, { operacao, validarItem: problemaNaVagaAberta });
}

/**
 * A situação de um endereço `/carreiras/:slug`: `aberta` (com a Vaga),
 * `encerrada` (só título e Slug) ou `inexistente` (nada). Rascunho responde
 * inexistente, e isso é decidido pelo banco.
 *
 * Slug fora do formato não vira consulta: volta inexistente na hora. Vírgula,
 * ponto e parêntese quebrariam o pedido antes de chegar ao banco.
 */
export async function lerSituacaoDaVaga(slug) {
  const operacao = "lerSituacaoDaVaga";
  if (!ehSlug(slug)) return sucesso(SITUACAO_VAZIA);

  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados.rpc(FUNCAO_DA_SITUACAO, { p_slug: slug }).abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  const lista = exigirLista(resposta.dados, { operacao, validarItem: problemaNaSituacao });
  if (!lista.ok) return lista;
  if (lista.dados.length !== 1) {
    return falha(ERRO_INESPERADO, {
      operacao,
      detalhe: `esperava exatamente uma linha de situação e vieram ${lista.dados.length}`,
    });
  }
  return sucesso(recortarSituacao(lista.dados[0]));
}

/**
 * As três listas de Classificação, cada uma na ordem definida no Painel
 * (`ordem`, e o nome no empate). Pelo cliente público: Departamento, Tipo e
 * Nível são vocabulário, não dado restrito.
 *
 * Devolve `{ departamentos, tipos_de_vaga, niveis }`. Uma lista que falha
 * derruba a leitura inteira: um formulário com o Nível faltando não é um
 * formulário que se possa preencher.
 */
export async function listarClassificacoes() {
  const operacao = "listarClassificacoes";
  const cliente = clientePublicoOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const respostas = await Promise.all(
    TABELAS_DAS_CLASSIFICACOES.map((tabela) =>
      consultar(operacao, () =>
        cliente.dados
          .from(tabela)
          .select(COLUNAS_DAS_CLASSIFICACOES[tabela].join(","))
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true })
          .abortSignal(sinalDePrazo()),
      ),
    ),
  );

  const saida = {};
  for (let i = 0; i < TABELAS_DAS_CLASSIFICACOES.length; i += 1) {
    const resposta = respostas[i];
    if (!resposta.ok) return resposta;
    const lista = exigirLista(resposta.dados, { operacao, validarItem: problemaNaClassificacao });
    if (!lista.ok) return lista;
    saida[TABELAS_DAS_CLASSIFICACOES[i]] = lista.dados;
  }
  return sucesso(saida);
}

/* ─── Leituras do PAINEL ─────────────────────────────────────────────────── */

/**
 * A listagem do Painel: toda Vaga, inclusive Rascunho e Encerrada, com busca e
 * filtro de Estado opcionais, da atualizada mais recentemente para a mais
 * antiga.
 *
 * A busca é a função `buscar_vagas_do_painel` (`security invoker`: a RLS
 * continua decidindo o que volta). O termo viaja como ARGUMENTO e quem tira
 * acento e caixa é o Postgres, nunca o navegador. O Estado é recusado aqui
 * quando está fora do vocabulário, e de novo no banco, na conversão para o
 * enum.
 */
export async function listarVagasDoPainel({ termo, estado, limite, deslocamento } = {}) {
  const operacao = "listarVagasDoPainel";

  const pedido =
    estado === null || estado === undefined || estado === "" ? null : estado;
  if (pedido !== null && !ehEstadoDaVaga(pedido)) {
    return falha(ERRO_INESPERADO, {
      operacao,
      mensagem:
        "O filtro de estado recebeu um valor que não existe. Recarregue o Painel e tente de novo.",
      detalhe: `fora do vocabulário fechado (${ESTADOS_DA_VAGA.join(", ")}): ${JSON.stringify(estado)}`,
    });
  }

  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const tamanho = limiteValido(limite);
  const inicio = deslocamentoValido(deslocamento);
  const busca = termoValido(termo);

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .rpc(FUNCAO_DE_BUSCA_DE_VAGAS, {
        p_termo: busca === "" ? null : busca,
        p_estado: pedido,
      })
      .select(COLUNAS_DA_LISTAGEM_DE_VAGAS.join(","))
      .order("atualizado_em", { ascending: false })
      .order("id", { ascending: true })
      .range(inicio, inicio + tamanho - 1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) {
    return ehFaixaAlemDoFim(resposta) ? sucesso([]) : resposta;
  }
  return exigirLista(resposta.dados, { operacao, validarItem: problemaNaVaga });
}

/** Uma Vaga pelo identificador, do lado do Painel: é assim que o formulário a abre. */
export async function lerVagaDoPainelPorId(id) {
  const operacao = "lerVagaDoPainelPorId";
  if (!ehUuid(id)) {
    return naoEncontrado({ operacao, detalhe: "identificador ausente ou fora do formato uuid" });
  }
  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const resposta = await consultar(operacao, () =>
    cliente.dados
      .from("vagas")
      .select(COLUNAS_DA_VAGA.join(","))
      .eq("id", id.trim())
      .limit(1)
      .abortSignal(sinalDePrazo()),
  );
  if (!resposta.ok) return resposta;

  const lista = exigirLista(resposta.dados, { operacao, validarItem: problemaNaVaga });
  if (!lista.ok) return lista;
  if (lista.dados.length === 0) {
    return naoEncontrado({ operacao, detalhe: "nenhuma vaga com este identificador" });
  }
  return exigirRegistro(lista.dados[0], { operacao, validar: problemaNaVaga });
}

/**
 * As três listas de Classificação com QUANTAS Vagas usam cada item, para a
 * tela de Classificações. Pelo cliente do PAINEL: a contagem roda sob a RLS de
 * `vagas`, e pelo anônimo ela contaria só as Abertas, dizendo "nenhuma vaga
 * usa" sobre um Departamento com três Rascunhos.
 *
 * Cada item ganha `vagas`: o número, ou `null` quando não deu para contar.
 */
export async function listarClassificacoesDoPainel() {
  const operacao = "listarClassificacoesDoPainel";
  const cliente = await clienteDoPainelOuFalha(operacao);
  if (!cliente.ok) return cliente;

  const respostas = await Promise.all(
    TABELAS_DAS_CLASSIFICACOES.map((tabela) =>
      consultar(operacao, () =>
        cliente.dados
          .from(tabela)
          .select(`${COLUNAS_DAS_CLASSIFICACOES[tabela].join(",")},vagas(count)`)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true })
          .abortSignal(sinalDePrazo()),
      ),
    ),
  );

  const saida = {};
  for (let i = 0; i < TABELAS_DAS_CLASSIFICACOES.length; i += 1) {
    const resposta = respostas[i];
    if (!resposta.ok) return resposta;
    const lista = exigirLista(resposta.dados, { operacao, validarItem: problemaNaClassificacao });
    if (!lista.ok) return lista;
    saida[TABELAS_DAS_CLASSIFICACOES[i]] = lista.dados.map((linha) => ({
      ...linha,
      vagas: contagemEmbutida(linha.vagas),
    }));
  }
  return sucesso(saida);
}
