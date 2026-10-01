/**
 * Quando uma visita vira uma leitura.
 *
 * ─── A REGRA ────────────────────────────────────────────────────────────────
 *
 * Conta uma leitura quem fica com o artigo VISÍVEL por `TEMPO_DE_LEITURA_MS`.
 * Abrir e fechar não conta; deixar a aba escondida não conta, e o relógio para
 * enquanto ela está escondida e continua de onde parou quando volta.
 *
 * Cada navegador conta um Post uma vez só. Recarregar, voltar no dia seguinte
 * ou reler não soma de novo.
 *
 * ─── O QUE FICA NO NAVEGADOR, E SOB QUAL CONSENTIMENTO ──────────────────────
 *
 * Para não contar duas vezes, o navegador guarda a lista dos Posts já contados.
 * É lembrança de conveniência, então segue a categoria de preferências do aviso
 * de cookies: com ela aceita, a lista fica no armazenamento permanente; sem
 * ela, fica só no da aba, e some quando a aba fecha. Nos dois casos a lista
 * nunca sai do navegador.
 *
 * O que vai para o banco é o identificador do Post e nada mais: nenhum dado de
 * quem leu. Ver `data/blog/leituras.js`.
 *
 * ─── NADA AQUI PODE ATRAPALHAR A LEITURA ────────────────────────────────────
 *
 * Armazenamento bloqueado, rede fora do ar, função recusada: tudo isso vira
 * leitura não contada, em silêncio. Quem abriu o artigo veio ler.
 */

import { useEffect } from "react";
import { registrarLeituraDoPost } from "@/data/blog/leituras";
import { consentiu } from "@/domain/consentimento/cookies";
import { lerDecisao } from "@/lib/consentimento";

/** Quanto tempo de artigo visível faz de uma visita uma leitura. */
export const TEMPO_DE_LEITURA_MS = 15000;

/** Onde a lista dos Posts já contados fica no navegador. */
export const CHAVE_DOS_POSTS_LIDOS = "chatclean.posts-lidos";

/** O teto da lista: o suficiente para o blog inteiro, sem crescer para sempre. */
const MAXIMO_DE_POSTS_LEMBRADOS = 300;

/* Os Posts cuja leitura já foi tentada NESTA página, com ou sem sucesso: uma
   função fora do ar não é chamada de novo a cada artigo aberto. */
const tentados = new Set();

/** O armazenamento que o consentimento permite, ou `null` quando nenhum existe. */
function armazenamento() {
  try {
    return consentiu(lerDecisao(), "preferencias")
      ? window.localStorage
      : window.sessionStorage;
  } catch {
    return null;
  }
}

function lerLidos(deposito) {
  try {
    const lista = JSON.parse(deposito.getItem(CHAVE_DOS_POSTS_LIDOS) ?? "[]");
    return Array.isArray(lista) ? lista.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Este navegador já contou a leitura deste Post? */
export function jaFoiContado(postId) {
  if (tentados.has(postId)) return true;
  const deposito = armazenamento();
  return deposito !== null && lerLidos(deposito).includes(postId);
}

/** Lembra que a leitura deste Post foi contada. */
export function marcarComoContado(postId) {
  const deposito = armazenamento();
  if (deposito === null) return;
  try {
    const lidos = lerLidos(deposito).filter((id) => id !== postId);
    lidos.push(postId);
    deposito.setItem(
      CHAVE_DOS_POSTS_LIDOS,
      JSON.stringify(lidos.slice(-MAXIMO_DE_POSTS_LEMBRADOS)),
    );
  } catch {
    /* cota estourada ou armazenamento bloqueado: a leitura já foi contada, e o
       pior caso é contá-la de novo numa outra visita. */
  }
}

/**
 * Conta a leitura do Post depois de `TEMPO_DE_LEITURA_MS` de artigo visível.
 *
 * `postId` nulo desliga: é assim que a página diz que ainda não há artigo na
 * tela (carregando, erro, não encontrado).
 */
export function useContarLeitura(postId) {
  useEffect(() => {
    if (typeof postId !== "string" || postId === "") return undefined;
    /* Navegador comandado por automação não é leitor. */
    if (window.navigator?.webdriver === true) return undefined;
    if (jaFoiContado(postId)) return undefined;

    let restante = TEMPO_DE_LEITURA_MS;
    let inicio = 0;
    let relogio = null;

    const parar = () => {
      if (relogio === null) return;
      clearTimeout(relogio);
      relogio = null;
      restante -= Date.now() - inicio;
    };

    const contar = async () => {
      relogio = null;
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      /* Outra aba pode ter contado este Post enquanto o relógio andava. */
      if (jaFoiContado(postId)) return;
      tentados.add(postId);
      try {
        const resultado = await registrarLeituraDoPost(postId);
        if (resultado?.ok === true) marcarComoContado(postId);
      } catch {
        /* a camada não lança; se lançar, a leitura só não é contada. */
      }
    };

    const andar = () => {
      if (relogio !== null || document.visibilityState !== "visible") return;
      inicio = Date.now();
      relogio = setTimeout(contar, Math.max(0, restante));
    };

    function aoMudarVisibilidade() {
      if (document.visibilityState === "visible") andar();
      else parar();
    }

    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    andar();

    return () => {
      parar();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [postId]);
}
