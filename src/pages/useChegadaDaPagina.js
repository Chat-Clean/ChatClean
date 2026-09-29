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
 * ─── O TIPO DE NAVEGAÇÃO VEM DO `AnimatedRoutes` (2026-09-29) ──────────────
 *
 * O parágrafo acima deixou de ser verdade em duas partes. Dentro do
 * `AnimatedRoutes`, `useNavigationType()` responde "POP" para tudo (o React
 * Router 7 fixa "POP" no `<Routes location>`), e este gancho nunca via uma
 * ida: em produção, nem o topo nem o foco aconteciam. O tipo real vem agora de
 * `useNavegacaoReal`. E o `AnimatedRoutes` passou a rolar também dentro da
 * mesma área: com ele presente, a ROLAGEM é dele (topo na ida, posição anotada
 * na volta), e aqui fica só o foco. Sem ele (a página montada sozinha), este
 * gancho continua rolando ao topo na ida.
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
import { useLocation } from "react-router-dom";
import { useNavegacaoReal } from "@/components/animated/navegacaoReal";

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
 * A cada navegação de IDA (a real, ver `useNavegacaoReal`), rola ao topo
 * quando não há `AnimatedRoutes` para rolar, e, quando `pronta`, leva o foco
 * ao `<h1>` dentro do elemento da ref devolvida. Na volta (POP) não faz nada.
 */
export function useChegadaDaPagina(pronta) {
  const { key } = useLocation();
  const { tipo: tipoDeNavegacao, rolagemGlobal } = useNavegacaoReal();
  const refDaTela = useRef(null);
  const focoPendente = useRef(false);

  useEffect(() => {
    if (tipoDeNavegacao === "POP") return;
    if (!rolagemGlobal) rolarAoTopo();
    focoPendente.current = true;
  }, [key, tipoDeNavegacao, rolagemGlobal]);

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
