/**
 * A chegada numa página pública de Carreiras (Story 5.7): a rolagem ao topo e
 * o foco no `<h1>`, as duas coisas que a navegação do cliente não faz sozinha
 * dentro de `/carreiras`.
 *
 * ─── POR QUE AQUI, E NÃO SÓ NO `AnimatedRoutes` ─────────────────────────────
 *
 * A chave de transição das páginas é o primeiro segmento do caminho. Ir de
 * `/carreiras` para `/carreiras/x`, de uma Vaga para outra, ou de uma Vaga de
 * volta para `/carreiras`, não troca a chave: o `AnimatedRoutes` não remonta
 * nada e não rola. Quem rola, então, é a página.
 *
 * ─── SÓ NA IDA (PUSH), NUNCA NA VOLTA (POP) ─────────────────────────────────
 *
 * Ir a uma página nova começa no topo: é conteúdo que ninguém leu ainda. Voltar
 * pelo navegador NÃO força o topo (a posição de volta é do `AnimatedRoutes`),
 * e o carregamento direto também chega como POP: nele a página já nasce no
 * topo, e o foco fica onde o navegador o pôs, sem ser roubado.
 *
 * ─── O FOCO VAI AO `<h1>` QUANDO A TELA NOVA ESTÁ PRONTA ────────────────────
 *
 * Depois de um PUSH, quem usa leitor de tela ou teclado continuaria no link
 * que clicou, e que já não existe. O foco vai ao `<h1>` da tela nova (que tem
 * `tabIndex={-1}`), mas só quando ela estiver pronta: no esqueleto ainda não
 * há `<h1>`, e o foco espera a leitura terminar.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Rola ao topo sem animação. A forma com objeto primeiro; um navegador que a
 * recuse ganha a forma antiga; e um sem rolagem nenhuma não derruba a página.
 */
export function rolarAoTopo() {
  try {
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  } catch {
    /* a forma com objeto foi recusada: vai a de reserva */
  }
  try {
    window.scrollTo(0, 0);
  } catch {
    /* sem rolagem, a página continua de pé */
  }
}

/**
 * Rola ao topo a cada navegação de IDA e, quando `pronta`, leva o foco ao
 * `<h1>` dentro do elemento da ref devolvida. Na volta (POP) não faz nada.
 */
export function useChegadaDaPagina(pronta) {
  const { key } = useLocation();
  const tipoDeNavegacao = useNavigationType();
  const refDaTela = useRef(null);
  const focoPendente = useRef(false);

  useEffect(() => {
    if (tipoDeNavegacao === "POP") return;
    rolarAoTopo();
    focoPendente.current = true;
  }, [key, tipoDeNavegacao]);

  useEffect(() => {
    if (!pronta || !focoPendente.current) return;
    focoPendente.current = false;
    const titulo = refDaTela.current?.querySelector("h1") ?? null;
    if (titulo === null) return;
    try {
      titulo.focus({ preventScroll: true });
    } catch {
      /* sem foco, a página continua de pé */
    }
  }, [pronta, key]);

  return refDaTela;
}
