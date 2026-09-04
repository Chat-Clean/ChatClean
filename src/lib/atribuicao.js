/**
 * A atribuição de campanha, do lado do navegador.
 *
 * ─── CAPTURA EM MEMÓRIA, GRAVAÇÃO SÓ COM CONSENTIMENTO ───────────────────
 *
 * A origem é lida do endereço no instante em que o site carrega, e fica numa
 * variável de módulo. Nada é gravado até haver consentimento de marketing.
 *
 * A ordem importa: a faixa de cookies aparece DEPOIS que a página carregou, e a
 * pessoa costuma responder depois de já ter navegado — momento em que os
 * `utm_*` já saíram da barra de endereço. Sem a captura em memória, aceitar
 * cookies gravaria uma origem vazia e a campanha perderia o crédito
 * justamente de quem consentiu.
 *
 * Quem recusa não deixa rastro: a variável morre com a aba e nada é escrito.
 */

import {
  CHAVE_DE_ARMAZENAMENTO,
  interpretar,
  origemDaVisita,
  serializar,
} from "@/domain/campanha/atribuicao";
import { consentiu } from "@/domain/consentimento/cookies";

/** A origem desta carga de página, capturada uma vez e mantida em memória. */
const origemDesteCarregamento =
  typeof window === "undefined"
    ? null
    : origemDaVisita({
        busca: window.location.search,
        referrer: document.referrer,
        hostAtual: window.location.hostname,
      });

export function lerAtribuicao() {
  try {
    return interpretar(window.localStorage.getItem(CHAVE_DE_ARMAZENAMENTO));
  } catch {
    return null;
  }
}

/**
 * Grava a primeira origem, se houver consentimento e ainda não houver uma.
 *
 * Não sobrescreve: primeira origem é primeira. A segunda campanha que trouxe a
 * pessoa de volta é interessante, mas não foi ela que apresentou a ChatClean.
 */
export function registrarOrigem(decisao) {
  if (typeof window === "undefined") return null;
  if (!consentiu(decisao, "marketing")) return null;

  const guardada = lerAtribuicao();
  if (guardada) return guardada;
  if (!origemDesteCarregamento) return null;

  try {
    window.localStorage.setItem(
      CHAVE_DE_ARMAZENAMENTO,
      serializar(origemDesteCarregamento),
    );
  } catch {
    return origemDesteCarregamento;
  }
  return origemDesteCarregamento;
}

/** Apaga a origem guardada. Chamado quando o consentimento é retirado. */
export function esquecerOrigem() {
  try {
    window.localStorage.removeItem(CHAVE_DE_ARMAZENAMENTO);
  } catch {
    // Sem armazenamento não há o que apagar.
  }
}

/**
 * O que vai junto do formulário.
 *
 * A origem guardada quando existe; senão, a desta carga — assim um formulário
 * enviado na mesma visita em que a pessoa chegou pelo anúncio não perde a
 * campanha só porque ela ainda não respondeu a faixa de cookies.
 */
export function atribuicaoParaEnvio() {
  return lerAtribuicao() ?? origemDesteCarregamento;
}
