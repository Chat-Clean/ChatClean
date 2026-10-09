/**
 * As operações de Notícia: criar/editar e excluir.
 *
 * ─── ELAS PASSAM PELA MESMA PORTA ───────────────────────────────────────────
 *
 * Este módulo NÃO é uma função de plataforma: ele é chamado pelo mesmo
 * `api/posts.js`, escolhido pelo campo `operacao` do corpo, conferido contra o
 * vocabulário fechado de `src/domain/blog/operacoes.js`. Não existe política de
 * escrita em `noticias` para `anon` nem para `authenticated`.
 *
 * `autorizar` (token válido **e** cadastro, nessa ordem, antes de escrever),
 * `falhaDaEscrita` e o classificador vêm dos módulos que já os têm, como em
 * `operacoesDaCategoria.js`.
 *
 * ─── O QUE VAI PARA O COMANDO É MONTADO À MÃO ───────────────────────────────
 *
 * O corpo do pedido **nunca** é espalhado sobre o comando: `criado_em` e
 * `publicada_em` não viajam de carona. `publicada_em` é decidido AQUI, na
 * primeira publicação, e não muda depois.
 *
 * Nenhuma das duas lança.
 */

import {
  VIDEO_AUSENTE,
  VIDEO_NAO_RECONHECIDO,
  identificadorDoYoutube,
  normalizarDescricaoDaNoticia,
  normalizarTituloDaNoticia,
  problemaNaDescricaoDaNoticia,
  problemaNoTituloDaNoticia,
} from "../../src/domain/blog/noticias.js";
import {
  OPERACAO_EXCLUIR_NOTICIA,
  OPERACAO_SALVAR_NOTICIA,
} from "../../src/domain/blog/operacoes.js";
import { autorizar } from "./operacoesDoPost.js";
import {
  ERRO_DADOS_INVALIDOS,
  ERRO_INESPERADO,
  ERRO_NAO_ENCONTRADO,
  falha,
  falhaDaEscrita,
  PADRAO_UUID,
} from "./salvarPost.js";

/* ─── As frases, uma por operação ────────────────────────────────────────── */

const SEM_PERMISSAO_PARA_SALVAR =
  "Sua sessão não autoriza mexer nas notícias. Entre no Painel de novo e tente outra vez.";
const SEM_PERMISSAO_PARA_EXCLUIR =
  "Sua sessão não autoriza excluir notícias. Entre no Painel de novo e tente outra vez.";

const SEM_RESPOSTA_PARA_SALVAR =
  "Não conseguimos falar com o servidor para salvar a notícia. Espere um instante e tente de novo.";
const SEM_RESPOSTA_PARA_EXCLUIR =
  "Não conseguimos falar com o servidor para excluir a notícia. Espere um instante e tente de novo.";

const SEM_CADASTRO_PARA_NOTICIA =
  "Esta conta não está cadastrada no Painel, então não pode mexer nas notícias. Avise quem cuida das contas.";

const NOTICIA_AUSENTE =
  "Esta notícia não existe mais. Ela pode ter sido excluída por outra pessoa.";

/**
 * A lista FECHADA dos campos que uma gravação de Notícia aceita. O que não está
 * aqui não chega ao banco, por construção.
 *
 * `video` é o que a pessoa colou (link ou identificador); a coluna gravada é
 * `youtube_id`, derivada dele pelo domínio.
 */
export const CAMPOS_DA_NOTICIA = Object.freeze([
  "id",
  "titulo",
  "descricao",
  "video",
  "publicada",
  "operacao",
]);

/** O identificador da Notícia no corpo. Opcional ao salvar: ausente é "crie". */
function idDaNoticia(corpo, { obrigatorio }) {
  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  const bruto = ehObjeto ? corpo.id : undefined;
  if (bruto === undefined || bruto === null || bruto === "") {
    if (!obrigatorio) return { ok: true, id: null };
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual notícia deve ser alterada.",
      detalhe: "id de notícia ausente no corpo do pedido",
    });
  }
  const id = typeof bruto === "string" ? bruto.trim() : "";
  if (id === "" || !PADRAO_UUID.test(id)) {
    return falha(ERRO_DADOS_INVALIDOS, {
      mensagem: "Não reconhecemos qual notícia deve ser alterada.",
      detalhe: `id de notícia fora do formato: ${JSON.stringify(String(bruto).slice(0, 60))}`,
    });
  }
  return { ok: true, id };
}

/**
 * Lê o corpo de uma gravação de Notícia.
 *
 * Devolve `{ ok: true, campos, ignorados }` ou `{ ok: false, mensagem, detalhe }`,
 * com todos os problemas de uma vez. **Criar exige título e vídeo**; editar
 * preserva o que não veio.
 */
export function lerCorpoDaNoticia(corpo, { criando }) {
  const ehObjeto = corpo !== null && typeof corpo === "object" && !Array.isArray(corpo);
  if (!ehObjeto) {
    return {
      ok: false,
      mensagem: "O pedido de gravação da notícia não veio no formato esperado.",
      detalhe: `corpo não é objeto: ${typeof corpo}`,
    };
  }

  const campos = {};
  const problemas = [];
  const detalhes = [];
  const ignorados = Object.keys(corpo).filter((c) => !CAMPOS_DA_NOTICIA.includes(c));

  /* ── Título ──────────────────────────────────────────────────────────── */
  if (corpo.titulo === undefined) {
    if (criando) {
      problemas.push("A notícia precisa de um título.");
      detalhes.push("titulo ausente na criação");
    }
  } else {
    const problema = problemaNoTituloDaNoticia(corpo.titulo);
    if (problema !== null) {
      problemas.push(problema);
      detalhes.push(`titulo recusado: ${JSON.stringify(String(corpo.titulo).slice(0, 80))}`);
    } else {
      campos.titulo = normalizarTituloDaNoticia(corpo.titulo);
    }
  }

  /* ── Descrição ───────────────────────────────────────────────────────────
     Opcional. `null` e `""` LIMPAM: a coluna é `not null default ''`. */
  if (corpo.descricao !== undefined) {
    const problema = problemaNaDescricaoDaNoticia(corpo.descricao);
    if (problema !== null) {
      problemas.push(problema);
      detalhes.push(`descricao recusada: ${typeof corpo.descricao}`);
    } else {
      campos.descricao = normalizarDescricaoDaNoticia(corpo.descricao);
    }
  }

  /* ── Vídeo ───────────────────────────────────────────────────────────────
     O que chega é o que a pessoa colou; o que se grava são os 11 caracteres.
     A derivação é a do DOMÍNIO, a mesma que a tela usa para a prévia. */
  if (corpo.video === undefined) {
    if (criando) {
      problemas.push(VIDEO_AUSENTE);
      detalhes.push("video ausente na criação");
    }
  } else if (typeof corpo.video !== "string" || corpo.video.trim() === "") {
    problemas.push(VIDEO_AUSENTE);
    detalhes.push(`video vazio ou fora de forma: ${typeof corpo.video}`);
  } else {
    const youtubeId = identificadorDoYoutube(corpo.video);
    if (youtubeId === "") {
      problemas.push(VIDEO_NAO_RECONHECIDO);
      detalhes.push(`video não reconhecido: ${JSON.stringify(corpo.video.slice(0, 120))}`);
    } else {
      campos.youtube_id = youtubeId;
    }
  }

  /* ── Publicada ───────────────────────────────────────────────────────────
     Booleano e nada mais: `"false"` é texto verdadeiro para quem compara
     frouxo, e é o valor que decide o que o visitante vê. */
  if (corpo.publicada === undefined) {
    if (criando) campos.publicada = false;
  } else if (typeof corpo.publicada !== "boolean") {
    problemas.push("A notícia só pode estar publicada ou não publicada.");
    detalhes.push(`publicada não é booleano: ${JSON.stringify(String(corpo.publicada).slice(0, 40))}`);
  } else {
    campos.publicada = corpo.publicada;
  }

  if (problemas.length > 0) {
    return { ok: false, mensagem: problemas.join(" "), detalhe: detalhes.join(" | ") };
  }

  if (Object.keys(campos).length === 0) {
    return {
      ok: false,
      mensagem: "O pedido não traz nada para mudar na notícia.",
      detalhe: "nenhum campo aceito veio no corpo",
    };
  }

  return { ok: true, campos, ignorados };
}

/**
 * Cria ou edita uma Notícia.
 *
 * `{ ok: true, dados: { operacao, criada, noticia, ignorados } }`.
 *
 * ─── `publicada_em` É DA PRIMEIRA PUBLICAÇÃO ────────────────────────────────
 *
 * Ele ordena a lista do site. Gravado quando a Notícia é publicada sem ainda
 * ter data, e nunca reescrito: tirar do ar e pôr de volta não a leva ao topo.
 */
export async function salvarNoticia({ token, corpo, acesso }) {
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_SALVAR,
      mensagemDeRede: SEM_RESPOSTA_PARA_SALVAR,
      mensagemDeCadastro: SEM_CADASTRO_PARA_NOTICIA,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDaNoticia(corpo, { obrigatorio: false });
    if (!alvo.ok) return alvo;
    const criando = alvo.id === null;

    const lido = lerCorpoDaNoticia(corpo, { criando });
    if (!lido.ok) {
      return falha(ERRO_DADOS_INVALIDOS, { mensagem: lido.mensagem, detalhe: lido.detalhe });
    }

    let atual = null;
    if (!criando) {
      const leitura = await acesso.lerNoticia(alvo.id);
      if (!leitura.ok) return falhaDaEscrita(leitura, "leitura da notícia");
      if (leitura.dados === null) {
        return falha(ERRO_NAO_ENCONTRADO, {
          mensagem: NOTICIA_AUSENTE,
          detalhe: `nenhuma notícia com id ${alvo.id}`,
        });
      }
      atual = leitura.dados;
    }

    /* AS COLUNAS SÃO MONTADAS À MÃO, a partir da lista do que foi lido. */
    const colunas = {};
    for (const nome of ["titulo", "descricao", "youtube_id", "publicada"]) {
      if (lido.campos[nome] !== undefined) colunas[nome] = lido.campos[nome];
    }
    if (colunas.publicada === true && (atual?.publicada_em ?? null) === null) {
      colunas.publicada_em = new Date().toISOString();
    }

    const escrita = criando
      ? await acesso.inserirNoticia(colunas)
      : await acesso.atualizarNoticia(alvo.id, colunas);
    if (!escrita.ok) {
      return falhaDaEscrita(escrita, criando ? "criação da notícia" : "gravação da notícia");
    }
    if (escrita.dados === null) {
      if (criando) {
        return falha(ERRO_INESPERADO, {
          mensagem:
            "A notícia pode ter sido criada, mas o servidor não confirmou. Recarregue a lista antes de tentar de novo.",
          detalhe: "a criação da notícia não devolveu a linha gravada",
        });
      }
      return falha(ERRO_NAO_ENCONTRADO, {
        mensagem: NOTICIA_AUSENTE,
        detalhe: `nenhuma notícia com id ${alvo.id} para gravar`,
      });
    }

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_SALVAR_NOTICIA,
        criada: criando,
        noticia: escrita.dados,
        ignorados: Object.freeze([...lido.ignorados]),
      }),
    });
  } catch (excecao) {
    return falha(ERRO_INESPERADO, {
      detalhe: `exceção não prevista ao salvar notícia: ${String(
        excecao?.stack ?? excecao?.message ?? excecao,
      )}`,
      codigo: String(excecao?.name ?? ""),
    });
  }
}

/**
 * Exclui uma Notícia. O vídeo continua no YouTube: o que sai é a linha.
 *
 * `{ ok: true, dados: { operacao, id, noticia } }`.
 */
export async function excluirNoticia({ token, corpo, acesso }) {
  try {
    const autorizado = await autorizar({
      token,
      acesso,
      mensagem: SEM_PERMISSAO_PARA_EXCLUIR,
      mensagemDeRede: SEM_RESPOSTA_PARA_EXCLUIR,
      mensagemDeCadastro: SEM_CADASTRO_PARA_NOTICIA,
    });
    if (!autorizado.ok) return autorizado;

    const alvo = idDaNoticia(corpo, { obrigatorio: true });
    if (!alvo.ok) return alvo;

    const apagada = await acesso.excluirNoticia(alvo.id);
    if (!apagada.ok) return falhaDaEscrita(apagada, "exclusão da notícia");
    if (apagada.dados === null) {
      return falha(ERRO_NAO_ENCONTRADO, {
        mensagem: "Esta notícia já não está no Painel, alguém pode tê-la excluído antes.",
        detalhe: `nenhuma notícia com id ${alvo.id} para excluir`,
      });
    }

    return Object.freeze({
      ok: true,
      dados: Object.freeze({
        operacao: OPERACAO_EXCLUIR_NOTICIA,
        id: alvo.id,
        noticia: apagada.dados,
      }),
    });
  } catch (excecao) {
    return falha(ERRO_INESPERADO, {
      detalhe: `exceção não prevista ao excluir notícia: ${String(
        excecao?.stack ?? excecao?.message ?? excecao,
      )}`,
      codigo: String(excecao?.name ?? ""),
    });
  }
}
