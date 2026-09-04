/**
 * O rascunho da contratação, guardado no navegador.
 *
 * ─── AGORA RESPEITA O CONSENTIMENTO ──────────────────────────────────────
 *
 * O rascunho já existia, e gravava sempre. Só que a faixa de cookies declara
 * uma categoria "Preferências" e diz, com essas palavras, que ela é quem lembra
 * "o rascunho do formulário de contratação". Gravar mesmo com a categoria
 * recusada faria o painel mentir — e um painel que mente é pior que nenhum.
 *
 * ─── E GUARDA O QUE FALTAVA PARA PODER RETOMAR ───────────────────────────
 *
 * Antes só o formulário e o dia de vencimento. Plano e dimensionamento vinham
 * da querystring, então quem voltava ao site sem o link original não tinha como
 * continuar de onde parou: os dados estavam lá, mas ninguém sabia o que a
 * pessoa estava contratando.
 */

import { consentiu } from "@/domain/consentimento/cookies";
import { lerDecisao } from "@/lib/consentimento";

export const CHAVE = "chatclean:assinar:rascunho";

/** Depois disso o pedido esfriou, e a faixa de retomada vira incômodo. */
export const VALIDADE_EM_DIAS = 7;

function podeGuardar() {
  return consentiu(lerDecisao(), "preferencias");
}

/** O rascunho guardado, ou null. Fora do prazo conta como ausente. */
export function lerRascunho(agora = new Date()) {
  if (!podeGuardar()) return null;
  let lido;
  try {
    const salvo = window.localStorage.getItem(CHAVE);
    if (!salvo) return null;
    lido = JSON.parse(salvo);
  } catch {
    return null;
  }
  if (typeof lido !== "object" || lido === null) return null;

  const quando = Date.parse(lido.atualizadoEm);
  if (Number.isNaN(quando)) return null;
  const dias = (agora.getTime() - quando) / 86_400_000;
  if (dias < 0 || dias > VALIDADE_EM_DIAS) return null;

  return lido;
}

export function gravarRascunho(rascunho) {
  if (!podeGuardar()) return false;
  try {
    window.localStorage.setItem(
      CHAVE,
      JSON.stringify({ ...rascunho, atualizadoEm: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false;
  }
}

export function limparRascunho() {
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    // Sem armazenamento não há o que apagar.
  }
}

/**
 * Vale oferecer retomada?
 *
 * Só quando há plano escolhido E algum campo preenchido. Quem abriu a página e
 * saiu na mesma hora não deixou pedido pela metade — deixou uma visita, e ser
 * perseguido por ela é o tipo de coisa que faz a pessoa não voltar mais.
 */
export function valeRetomar(rascunho) {
  if (!rascunho?.plano) return false;
  const formulario = rascunho.formulario ?? {};
  return ["nome", "email", "telefone", "cnpj"].some(
    (campo) => String(formulario[campo] ?? "").trim() !== "",
  );
}

/** O endereço que devolve a pessoa exatamente ao que ela estava montando. */
export function enderecoDaRetomada(rascunho) {
  const parametros = new URLSearchParams({
    plano: String(rascunho.plano),
    usuarios: String(rascunho.usuarios ?? 1),
    conexoes: String(rascunho.conexoes ?? 1),
  });
  return `/assinar?${parametros.toString()}`;
}
