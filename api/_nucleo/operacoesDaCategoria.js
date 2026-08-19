/**
 * As operações de Categoria da Story 2.14 — criar/editar e excluir.
 *
 * ─── ELAS PASSAM PELA MESMA PORTA, E ISSO CONTINUA SENDO A ENTREGA ──────────
 *
 * "Nenhum cliente escreve no banco, e o único caminho é a função em `api/`" é a
 * regra que sustenta a RLS inteira: não existe política de escrita em
 * `categorias`, `tags` nem `posts_tags` para `anon` ou `authenticated`, e o
 * privilégio foi revogado inclusive de `PUBLIC`. Este módulo NÃO é uma função
 * de plataforma: ele é chamado pelo mesmo `api/posts.js`, escolhido pelo campo
 * `operacao` do corpo, conferido contra o vocabulário fechado de
 * `src/domain/blog/operacoes.js`.
 *
 * ─── E ELAS REAPROVEITAM O QUE JÁ EXISTE ────────────────────────────────────
 *
 * `autorizar` (token válido **e** cadastro, nessa ordem, sempre antes de
 * escrever), `falhaDaEscrita` e o classificador vêm dos módulos que já os têm,
 * importados. Um segundo classificador divergiria no primeiro código de erro
 * que só um conhece.
 *
 * ─── E O QUE VAI PARA O COMANDO É MONTADO À MÃO ─────────────────────────────
 *
 * O corpo do pedido **nunca** é espalhado sobre o comando. Se fosse,
 * `{ operacao: 'salvarCategoria', id: '…', criado_em: '1999-01-01' }`
 * reescreveria a data de criação pela porta de trás — é a mesma regra que
 * `definirDestaque` fixou, e ela vale para toda operação nova.
 *
 * Nenhuma das duas lança: exceção que suba daqui vira 500 sem tipo, e a tela
 * fica sem saber se deve pedir para tentar de novo ou para consertar algo.
 */

/* O vocabulário e as regras vêm do DOMÍNIO, e são os MESMOS que a tela usa. */
import {
  CORES_DE_CATEGORIA,
  CHAVES_DE_ICONE_DE_CATEGORIA,
  COR_PADRAO,
  ICONE_PADRAO,
  ORDEM_MAXIMA_DA_CATEGORIA,
  ehChaveDeIconeDeCategoria,
  ehCorDeCategoria,
  lerOrdemDeCategoria,
  normalizarNomeDeCategoria,
  problemaNoNomeDeCategoria,
} from "../../src/domain/blog/categorias.js";
import {
  OPERACAO_EXCLUIR_CATEGORIA,
  OPERACAO_SALVAR_CATEGORIA,
} from "../../src/domain/blog/operacoes.js";
import { gerarSlug, problemaNoSlug } from "../../src/domain/blog/slug.js";
import { autorizar } from "./operacoesDoPost.js";
import {
  ERRO_CONFLITO,
  ERRO_DADOS_INVALIDOS,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  falha,
  falhaDaEscrita,
  PADRAO_UUID,
} from "./salvarPost.js";

/* ─── As frases, uma por operação ────────────────────────────────────────── */

const SEM_PERMISSAO_PARA_SALVAR =
  "Sua sessão não autoriza mexer nas categorias. Entre no Painel de novo e tente outra vez.";
const SEM_PERMISSAO_PARA_EXCLUIR =
  "Sua sessão não autoriza excluir categorias. Entre no Painel de novo e tente outra vez.";

const SEM_RESPOSTA_PARA_SALVAR =
  "Não conseguimos falar com o servidor para salvar a categoria. Espere um instante e tente de novo.";
const SEM_RESPOSTA_PARA_EXCLUIR =
  "Não conseguimos falar com o servidor para excluir a categoria. Espere um instante e tente de novo.";

const SEM_CADASTRO_PARA_CATEGORIA =
  "Esta conta não está cadastrada no Painel, então não pode mexer nas categorias. Avise quem cuida das contas.";

/* O teto de `ordem` mora no DOMÍNIO, junto da cor e do ícone: a tela aceitava
   quatro dígitos e este arquivo recusava acima de mil, então digitar 5000
   passava no formulário e voltava recusado da rede. Reexportado aqui porque
   quem lê este módulo procura o teto neste módulo. */
export { ORDEM_MAXIMA_DA_CATEGORIA };

/**
 * A lista FECHADA dos campos que uma gravação de Categoria aceita.
 *
 * Mesma razão da lista de campos do Post: o que não está aqui não chega ao
 * banco, e não chega **por construção**, não por revisão. `slug` é aceito
 * porque o Autor pode querer escolher o endereço; quando ele não vem, é
 * derivado do nome pela MESMA função que o Post usa.
 */
export const CAMPOS_DA_CATEGORIA = Object.freeze([
  "id",
  "nome",
  "slug",
  "icone",
  "cor",
  "ordem",
  "operacao",
]);

/**
 * O identificador da Categoria no corpo — conferido antes de qualquer ida ao
 * banco, e **opcional**: ausente significa "crie".
 *
 * Devolve `{ ok: true, id }` com `id` em `null` quando não veio nenhum. O
 * formato é conferido aqui e não deixado para o PostgREST porque um
 * identificador malformado no filtro volta como erro de sintaxe do Postgres — a
 * pessoa leria "22P02" onde deveria ler que o pedido não diz qual categoria.
 */
function idDaCategoria(corpo, { obrigatorio }) {
  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  const bruto = ehObjeto ? corpo.id : undefined;
  if (bruto === undefined || bruto === null || bruto === "") {
    if (!obrigatorio) return { ok: true, id: null };
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual categoria deve ser alterada.",
      detalhe: "id de categoria ausente no corpo do pedido",
    });
  }
  const id = typeof bruto === "string" ? bruto.trim() : "";
  if (id === "" || !PADRAO_UUID.test(id)) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual categoria deve ser alterada.",
      detalhe: `id de categoria fora do formato: ${JSON.stringify(String(bruto).slice(0, 60))}`,
    });
  }
  return { ok: true, id };
}

/**
 * Lê o corpo de uma gravação de Categoria.
 *
 * Devolve `{ ok: true, campos, ignorados }` ou `{ ok: false, mensagem, detalhe }`.
 * Todos os problemas de uma vez: recusar um campo por pedido faria o Autor
 * descobrir os três erros em três viagens.
 *
 * **Criar exige nome**; editar preserva o que não veio. É a mesma convenção do
 * Post — ausente preserva, valor fora de forma é problema NOMEADO, nunca
 * descartado em silêncio.
 */
export function lerCorpoDaCategoria(corpo, { criando }) {
  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  if (!ehObjeto) {
    return {
      ok: false,
      mensagem: "O pedido de gravação da categoria não veio no formato esperado.",
      detalhe: `corpo não é objeto: ${typeof corpo}`,
    };
  }

  const campos = {};
  const problemas = [];
  const detalhes = [];
  const ignorados = Object.keys(corpo).filter((c) => !CAMPOS_DA_CATEGORIA.includes(c));

  /* ── Nome ────────────────────────────────────────────────────────────── */
  if (corpo.nome === undefined) {
    if (criando) {
      problemas.push("A categoria precisa de um nome.");
      detalhes.push("nome ausente na criação");
    }
  } else {
    const nome = normalizarNomeDeCategoria(corpo.nome);
    const problema = problemaNoNomeDeCategoria(nome);
    if (problema !== null) {
      problemas.push(problema);
      detalhes.push(`nome recusado: ${JSON.stringify(String(corpo.nome).slice(0, 80))}`);
    } else {
      campos.nome = nome;
    }
  }

  /* ── Endereço ────────────────────────────────────────────────────────────
     Ausente na criação é DERIVADO do nome, pela mesma `gerarSlug` que o Post
     usa: uma segunda normalização aqui seria a terceira cópia da regra. Ausente
     na edição preserva — renomear não muda o endereço sozinho, pelo mesmo
     motivo que o Slug de um Post publicado não muda quando o título muda. */
  const derivarSlug = () => {
    if (campos.nome === undefined) return;
    const gerado = gerarSlug(campos.nome);
    if (!gerado.ok) {
      problemas.push(gerado.motivo);
      detalhes.push(`slug não derivável de ${JSON.stringify(campos.nome)}`);
    } else {
      campos.slug = gerado.slug;
    }
  };

  if (corpo.slug === undefined) {
    if (criando) derivarSlug();
  } else if (corpo.slug === null || String(corpo.slug).trim() === "") {
    /* VAZIO EXPLÍCITO NÃO É AUSÊNCIA. Na criação ele é "derive do nome"; na
       edição ele é um pedido de apagar o endereço, e o banco recusa endereço
       vazio (`categorias_slug_nao_vazio`). Ele passava sem virar campo nem
       problema — descarte silencioso num módulo cujo cabeçalho promete o
       contrário. */
    if (criando) derivarSlug();
    else {
      problemas.push(
        "O endereço da categoria não pode ficar vazio: é por ele que ela é encontrada no site.",
      );
      detalhes.push("slug vazio na edição");
    }
  } else {
    const slug = typeof corpo.slug === "string" ? corpo.slug.trim() : "";
    const problema = problemaNoSlug(slug);
    if (problema !== null) {
      problemas.push(problema);
      detalhes.push(`slug recusado: ${JSON.stringify(String(corpo.slug).slice(0, 80))}`);
    } else {
      campos.slug = slug;
    }
  }

  /* ── Cor ─────────────────────────────────────────────────────────────────
     Lista de PERMISSÃO. Cor livre não se mede, e contraste que não se mede é
     contraste que não existe — o par de cada cor do vocabulário é medido por
     `verificar:fundacao`. */
  if (corpo.cor === undefined) {
    if (criando) campos.cor = COR_PADRAO;
  } else if (!ehCorDeCategoria(corpo.cor)) {
    problemas.push("Essa cor não está entre as cores de categoria disponíveis.");
    detalhes.push(
      `cor fora do vocabulário: ${JSON.stringify(String(corpo.cor).slice(0, 80))} | aceitas: ${CORES_DE_CATEGORIA.join(", ")}`,
    );
  } else {
    campos.cor = corpo.cor;
  }

  /* ── Ícone ───────────────────────────────────────────────────────────────
     Chave de um mapa FECHADO no código, e não nome de componente nem caminho
     de arquivo. Chave fora do mapa é recusada aqui; chave órfã e chave faltando
     são acusadas pela auditoria bidirecional da verificação. */
  if (corpo.icone === undefined) {
    if (criando) campos.icone = ICONE_PADRAO;
  } else if (!ehChaveDeIconeDeCategoria(corpo.icone)) {
    problemas.push("Esse ícone não está entre os ícones de categoria disponíveis.");
    detalhes.push(
      `icone fora do mapa: ${JSON.stringify(String(corpo.icone).slice(0, 80))} | aceitos: ${CHAVES_DE_ICONE_DE_CATEGORIA.join(", ")}`,
    );
  } else {
    campos.icone = corpo.icone;
  }

  /* ── Ordem ─────────────────────────────────────────────────────────────
     `null` e `""` LIMPAM (a coluna é `not null default 0`), como a data de
     publicação faz no Post — eles passavam sem virar campo nem problema. E a
     leitura vem do DOMÍNIO: `Number(true)` é 1 e `Number([5])` é 5, e os dois
     atravessavam `Number.isInteger` para virar coluna. */
  if (corpo.ordem !== undefined) {
    if (corpo.ordem === null || corpo.ordem === "") {
      campos.ordem = 0;
    } else {
      const lida = lerOrdemDeCategoria(corpo.ordem);
      if (!lida.ok) {
        problemas.push(lida.motivo);
        detalhes.push(
          `ordem recusada: ${JSON.stringify(String(corpo.ordem).slice(0, 40))}`,
        );
      } else {
        campos.ordem = lida.ordem;
      }
    }
  }

  if (problemas.length > 0) {
    return {
      ok: false,
      mensagem: problemas.join(" "),
      detalhe: detalhes.join(" | "),
    };
  }

  if (Object.keys(campos).length === 0) {
    return {
      ok: false,
      mensagem: "O pedido não traz nada para mudar na categoria.",
      detalhe: "nenhum campo aceito veio no corpo",
    };
  }

  return { ok: true, campos, ignorados };
}

/**
 * A recusa de colisão, dizendo **qual** já existe.
 *
 * "Já existe uma categoria assim" manda a pessoa procurar; dizer o nome resolve
 * na hora. Devolve a falha tipada ou `null` quando o caminho está livre.
 */
async function colisao({ acesso, campos, id }) {
  if (campos.nome !== undefined) {
    const dono = await acesso.categoriaPorNome(campos.nome);
    if (!dono.ok) return falhaDaEscrita(dono, "conferência do nome da categoria");
    if (dono.dados !== null && dono.dados.id !== id) {
      return falha(ERRO_CONFLITO, {
        mensagem: `Já existe uma categoria chamada “${dono.dados.nome}”. Escolha outro nome.`,
        detalhe: `nome ${JSON.stringify(campos.nome)} já pertence à categoria ${dono.dados.id}`,
      });
    }
  }
  if (campos.slug !== undefined) {
    const dono = await acesso.categoriaPorSlug(campos.slug);
    if (!dono.ok) return falhaDaEscrita(dono, "conferência do endereço da categoria");
    if (dono.dados !== null && dono.dados.id !== id) {
      return falha(ERRO_CONFLITO, {
        mensagem: `O endereço “${campos.slug}” já é da categoria “${dono.dados.nome}”. Escolha outro.`,
        detalhe: `slug ${JSON.stringify(campos.slug)} já pertence à categoria ${dono.dados.id}`,
      });
    }
  }
  return null;
}

/**
 * Cria ou edita uma Categoria.
 *
 * `{ ok: true, dados: { operacao, criada, categoria, ignorados } }`.
 *
 * ─── RENOMEAR NÃO COPIA NOME PARA LUGAR NENHUM ──────────────────────────────
 *
 * O Post aponta para a Categoria (`posts.categoria_id`) e **não guarda o nome
 * dela** — a listagem traz a Categoria embutida na consulta. É isso que faz
 * renomear acertar todos os Posts sozinho, sem nenhum deles ser tocado. Se
 * algum consumidor guardar o nome, ele passa a mentir a partir do primeiro
 * renomear, e ninguém descobre até alguém comparar duas telas.
 */
export async function salvarCategoria({ token, corpo, acesso }) {
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_SALVAR,
      mensagemDeRede: SEM_RESPOSTA_PARA_SALVAR,
      mensagemDeCadastro: SEM_CADASTRO_PARA_CATEGORIA,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDaCategoria(corpo, { obrigatorio: false });
    if (!alvo.ok) return alvo;
    const criando = alvo.id === null;

    const lido = lerCorpoDaCategoria(corpo, { criando });
    if (!lido.ok) {
      return falha(ERRO_DADOS_INVALIDOS, {
        mensagem: lido.mensagem,
        detalhe: lido.detalhe,
      });
    }

    /* Editar exige que ela exista — e a ausência é dita como ausência, não como
       "algo saiu do previsto": duas abas do Painel abertas é o caminho normal
       para editar uma Categoria que a outra acabou de excluir. */
    if (!criando) {
      const atual = await acesso.lerCategoria(alvo.id);
      if (!atual.ok) return falhaDaEscrita(atual, "leitura da categoria");
      if (atual.dados === null) {
        return falha(ERRO_NAO_ENCONTRADO, {
          mensagem: "Esta categoria não existe mais. Ela pode ter sido excluída por outra pessoa.",
          detalhe: `nenhuma categoria com id ${alvo.id}`,
        });
      }
    }

    const conflito = await colisao({ acesso, campos: lido.campos, id: alvo.id });
    if (conflito !== null) return conflito;

    /* AS COLUNAS SÃO MONTADAS À MÃO. O corpo não é espalhado sobre o comando:
       se fosse, `criado_em` e `id` viajariam de carona num pedido que só queria
       renomear. */
    const colunas = {};
    for (const nome of ["nome", "slug", "icone", "cor", "ordem"]) {
      if (lido.campos[nome] !== undefined) colunas[nome] = lido.campos[nome];
    }

    const escrita = criando
      ? await acesso.inserirCategoria(colunas)
      : await acesso.atualizarCategoria(alvo.id, colunas);
    if (!escrita.ok) {
      return falhaDaEscrita(
        escrita,
        criando ? "criação da categoria" : "gravação da categoria",
      );
    }
    if (escrita.dados === null) {
      /* CRIAR E EDITAR FALHAM DE JEITOS DIFERENTES. Uma criação que volta sem
         representação não é "a categoria não existe mais" — ela acabou de
         nascer, ou não nasceu; dizer ausência mandaria o Autor procurar por
         algo que ele nunca teve, e o detalhe diria "id null". */
      if (criando) {
        return falha(ERRO_INESPERADO, {
          mensagem:
            "A categoria pode ter sido criada, mas o servidor não confirmou. Recarregue a lista antes de tentar de novo.",
          detalhe: "a criação da categoria não devolveu a linha gravada",
        });
      }
      return falha(ERRO_NAO_ENCONTRADO, {
        mensagem: "Esta categoria não existe mais. Ela pode ter sido excluída por outra pessoa.",
        detalhe: `nenhuma categoria com id ${alvo.id} para gravar`,
      });
    }

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_SALVAR_CATEGORIA,
        criada: criando,
        categoria: escrita.dados,
        ignorados: Object.freeze([...lido.ignorados]),
      }),
    });
  } catch (excecao) {
    return falha(ERRO_INESPERADO, {
      detalhe: `exceção não prevista ao salvar categoria: ${String(
        excecao?.stack ?? excecao?.message ?? excecao,
      )}`,
      codigo: String(excecao?.name ?? ""),
    });
  }
}

/**
 * A frase da recusa por uso, com o NÚMERO.
 *
 * "Não deu" sem o número deixa o Autor sem saber o que fazer a seguir: com ele,
 * a pessoa sabe se abre três Posts ou desiste. Exportada para a verificação
 * executá-la em vez de casar texto.
 */
export function fraseDeCategoriaEmUso(nome, total) {
  const quantos =
    total === 1 ? "1 post depende" : `${total} posts dependem`;
  return `Não dá para excluir a categoria “${nome}”: ${quantos} dela. Mude a categoria desses posts antes de excluí-la.`;
}

/**
 * Exclui uma Categoria — se ela não estiver em uso.
 *
 * ─── A CONTAGEM EXPLICA A RECUSA; O BANCO É QUEM RECUSA ─────────────────────
 *
 * `posts.categoria_id` é `on delete restrict` desde a migração desta story, e
 * por isso a exclusão de uma Categoria em uso é impossível **venha ela de
 * onde vier** — do console do projeto, de um script, de qualquer detentor da
 * chave de serviço. A contagem feita aqui existe para a frase poder dizer
 * quantos Posts dependem dela; sem o `restrict`, uma aplicação que esquecesse
 * de contar desassociaria tudo em silêncio, que é o modo de falha que ninguém
 * descobre.
 *
 * A ordem também importa: contar ANTES de mandar o `DELETE` é o que produz a
 * frase útil. Se o banco recusar mesmo assim — corrida entre a contagem e o
 * comando —, a recusa dele é traduzida com a mesma frase, sem o número.
 */
export async function excluirCategoria({ token, corpo, acesso }) {
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_EXCLUIR,
      mensagemDeRede: SEM_RESPOSTA_PARA_EXCLUIR,
      mensagemDeCadastro: SEM_CADASTRO_PARA_CATEGORIA,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDaCategoria(corpo, { obrigatorio: true });
    if (!alvo.ok) return alvo;

    const atual = await acesso.lerCategoria(alvo.id);
    if (!atual.ok) return falhaDaEscrita(atual, "leitura da categoria");
    if (atual.dados === null) {
      return falha(ERRO_NAO_ENCONTRADO, {
        mensagem: "Esta categoria já não está no Painel — alguém pode tê-la excluído antes.",
        detalhe: `nenhuma categoria com id ${alvo.id} para excluir`,
      });
    }

    const contagem = await acesso.contarPostsDaCategoria(alvo.id);
    if (!contagem.ok) {
      return falhaDaEscrita(contagem, "contagem de posts da categoria");
    }
    const total = Number(contagem.dados?.total ?? 0);
    if (total > 0) {
      return falha(ERRO_CONFLITO, {
        mensagem: fraseDeCategoriaEmUso(atual.dados.nome, total),
        detalhe: `categoria ${alvo.id} em uso por ${total} post(s)`,
      });
    }

    const apagada = await acesso.excluirCategoria(alvo.id);
    if (!apagada.ok) {
      /* O BANCO RECUSOU MESMO ASSIM — é a corrida entre a contagem e o comando,
         e `posts_categoria_id_fkey` é a defesa que sobrevive a ela. A frase
         precisa dizer o que houve, e não "algo saiu do previsto". */
      /* O CÓDIGO PRIMEIRO, o nome da restrição depois.
         Casar só a mensagem faz uma resposta localizada, truncada ou reescrita
         por um proxy cair no balde de "confira os campos" — sobre uma exclusão,
         onde não há campo nenhum para conferir. `23503` é violação de chave
         estrangeira e viaja em `codigo`, que o transporte já extrai. */
      const violouChaveEstrangeira =
        String(apagada.codigo ?? "") === "23503" ||
        /posts_categoria_id_fkey/.test(String(apagada.mensagem ?? ""));
      if (violouChaveEstrangeira) {
        return falha(ERRO_CONFLITO, {
          mensagem: `Não dá para excluir a categoria “${atual.dados.nome}”: há posts usando ela. Mude a categoria desses posts antes de excluí-la.`,
          detalhe: `o banco recusou por posts_categoria_id_fkey — ${apagada.mensagem}`,
          codigo: apagada.codigo,
          status: apagada.status,
        });
      }
      return falhaDaEscrita(apagada, "exclusão da categoria");
    }
    if (apagada.dados === null) {
      return falha(ERRO_NAO_ENCONTRADO, {
        mensagem: "Esta categoria já não está no Painel — alguém pode tê-la excluído antes.",
        detalhe: `nenhuma categoria com id ${alvo.id} para excluir`,
      });
    }

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_EXCLUIR_CATEGORIA,
        id: alvo.id,
        categoria: apagada.dados,
      }),
    });
  } catch (excecao) {
    return falha(ERRO_INESPERADO, {
      detalhe: `exceção não prevista ao excluir categoria: ${String(
        excecao?.stack ?? excecao?.message ?? excecao,
      )}`,
      codigo: String(excecao?.name ?? ""),
    });
  }
}
