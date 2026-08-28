/**
 * O que as rotas servidas têm em comum: método, domínio e resposta.
 *
 * Mora aqui, e não em cada função, porque três cópias de "só GET" divergem na
 * primeira vez que alguém precisar de uma quarta rota.
 */

import { raizDoSite } from "../../src/domain/blog/compartilhamento.js";
import { etiquetasDaResposta, politicaDeCache } from "./cache.js";
import {
  CABECALHO_DE_DIAGNOSTICO,
  DIAGNOSTICO_METODO_RECUSADO,
  DIAGNOSTICO_OK,
  DIAGNOSTICO_SEM_NOME,
  registrarEvento,
} from "./diagnostico.js";

/** Os métodos que uma rota de leitura atende. Lista fechada. */
export const METODOS_DE_LEITURA = Object.freeze(["GET", "HEAD"]);

/**
 * O Domínio Canônico, do ambiente.
 *
 * É a MESMA variável que o Painel lê na Story 3.4. Uma segunda declaração do
 * domínio — uma para o navegador, outra para o servidor — divergiria no dia em
 * que alguém trocasse só uma, e o sintoma seria uma canônica apontando para o
 * lugar errado, que ninguém percebe olhando a tela.
 *
 * NÃO se deriva da requisição: numa rota reescrita o caminho que chega é o da
 * função, e o Épico 4 registra esse engano por escrito na Story 4.5.
 */
export const VARIAVEL_DO_DOMINIO = "VITE_DOMINIO_DO_SITE";

export const DEFEITO_SEM_DOMINIO =
  `O Domínio Canônico não foi declarado: defina \`${VARIAVEL_DO_DOMINIO}\` no ambiente. ` +
  "Ele não é derivado da requisição: numa rota reescrita o caminho que chega é o da função.";

/** `{ok:true, raiz}` ou `{ok:false, defeito}`. Nunca lança, nunca adivinha. */
export function dominioDoAmbiente(ambiente = process.env) {
  const declarado = ambiente?.[VARIAVEL_DO_DOMINIO];
  if (typeof declarado !== "string" || declarado.trim() === "") {
    return { ok: false, defeito: DEFEITO_SEM_DOMINIO };
  }
  try {
    return { ok: true, raiz: raizDoSite(declarado) };
  } catch {
    return { ok: false, defeito: DEFEITO_SEM_DOMINIO };
  }
}

/** Recusa método fora do vocabulário, dizendo quais existem. */
export function metodoRecusado(req, res, { rota = null } = {}) {
  if (METODOS_DE_LEITURA.includes(req?.method)) return false;
  res.setHeader("Allow", METODOS_DE_LEITURA.join(", "));
  res.setHeader("Cache-Control", politicaDeCache(405));
  res.setHeader(CABECALHO_DE_DIAGNOSTICO, DIAGNOSTICO_METODO_RECUSADO);
  registrarEvento({ diagnostico: DIAGNOSTICO_METODO_RECUSADO, rota, detalhe: req?.method ?? null });
  res.status(405).json({
    erro: "metodo_nao_permitido",
    mensagem: `Esta rota atende ${METODOS_DE_LEITURA.join(" e ")}.`,
  });
  return true;
}

/**
 * Responde um documento, com o tipo que o endereço promete.
 *
 * O tipo é obrigatório e explícito: servir HTML num endereço que promete XML
 * seria trocar um silêncio por outro — o rastreador aceitaria a resposta e
 * descartaria o conteúdo sem dizer nada.
 */
export function responderDocumento(
  res,
  { tipo, corpo, status = 200, etiquetas = null, diagnostico = DIAGNOSTICO_OK, rota = null, detalhe = null },
) {
  res.setHeader("Content-Type", tipo);
  /* A POLÍTICA DE CACHE VEM DO MAPA (Story 4.9), e é declarada AQUI porque é
     por aqui que toda resposta de documento passa. Deixá-la em cada rota faria
     a próxima rota nascer sem — e "sem política" não é neutro: é a hospedagem
     escolhendo sozinha por quanto tempo guardar. */
  res.setHeader("Cache-Control", politicaDeCache(status));
  /* O DIAGNÓSTICO (Story 4.10) vai em TODA resposta — não só nas de falha.
     Uma rota que só declarasse o cabeçalho quando algo dá errado deixaria quem
     lê sem como distinguir "está tudo bem" de "esta rota não diagnostica". */
  res.setHeader(CABECALHO_DE_DIAGNOSTICO, diagnostico);
  registrarEvento({ diagnostico, rota, detalhe });
  /* As etiquetas SÓ acompanham o que é guardável. Numa resposta `no-store` elas
     seriam ruído: não há o que purgar. */
  if (etiquetas !== null && !politicaDeCache(status).includes("no-store")) {
    res.setHeader("Vercel-Cache-Tag", etiquetasDaResposta(etiquetas).join(","));
  }
  res.status(status);
  res.send(corpo);
}

/** O defeito de montagem, dito — e nunca disfarçado de página. */
export function responderDefeito(res, defeito, { diagnostico, rota = null } = {}) {
  console.error(`[entrega] ${defeito}`);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  /* GUARDAR UM ERRO transforma uma falha de um segundo numa falha de um minuto
     — e como o defeito costuma ser de infraestrutura, o minuto seguinte é
     justamente quando ele já pode ter passado. */
  res.setHeader("Cache-Control", politicaDeCache(500));
  /* O DIAGNÓSTICO (Story 4.10) SEMPRE tem nome. Um chamador que esquecer de
     passá-lo não vira `"undefined"` escrito num cabeçalho HTTP — vira
     `DIAGNOSTICO_SEM_NOME`, que é visível e nunca deveria sobreviver a uma
     auditoria. */
  const diagnosticoFinal = diagnostico ?? DIAGNOSTICO_SEM_NOME;
  res.setHeader(CABECALHO_DE_DIAGNOSTICO, diagnosticoFinal);
  registrarEvento({ diagnostico: diagnosticoFinal, rota, detalhe: defeito });
  res.status(500);
  res.send(`${defeito}\n`);
}
