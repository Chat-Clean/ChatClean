/**
 * O tipo de navegação REAL, para as páginas que moram dentro do
 * `AnimatedRoutes` (defeito achado e corrigido em 2026-09-29).
 *
 * ─── POR QUE AS PÁGINAS NÃO PODEM PERGUNTAR AO ROTEADOR ─────────────────────
 *
 * O `AnimatedRoutes` passa `location` ao `<Routes>`, e é isso que deixa a
 * página que sai de cena com o endereço dela durante a animação. Mas o React
 * Router 7, quando recebe `location`, embrulha as rotas num contexto próprio com
 * `navigationType: "POP"` FIXO. Dentro dele, `useNavigationType()` responde
 * "POP" para tudo, inclusive para um clique num link — e a chegada das páginas
 * de Carreiras (`useChegadaDaPagina`) nunca via uma ida, nunca levava o foco
 * ao `<h1>`.
 *
 * O `AnimatedRoutes` está FORA do `<Routes>` e vê o tipo verdadeiro. Ele o
 * entrega por este contexto, junto com a chave da entrada do histórico a que o
 * tipo se refere.
 *
 * ─── A CHAVE, PARA A PÁGINA QUE ESTÁ SAINDO ─────────────────────────────────
 *
 * Numa troca de área, a página antiga continua montada durante a animação de
 * saída, e também recebe o contexto novo. Se ela lesse o "PUSH" da navegação
 * que a está tirando de cena, agiria como se tivesse acabado de chegar. Por
 * isso o tipo só vale para a página cuja entrada É a atual; para as outras,
 * é "POP", que não pede nada.
 */

import { createContext, useContext } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** `{ tipo, chave }` do `AnimatedRoutes`, ou `null` fora dele. */
export const NavegacaoRealContext = createContext(null);

/**
 * Puro. O que a página deve considerar: o tipo real quando o provedor existe e
 * a entrada é a dela; "POP" quando o provedor fala de outra entrada; e, sem
 * provedor (página montada sem o `AnimatedRoutes`), o que o roteador diz.
 * `rolagemGlobal` diz se há quem role por ela (o `AnimatedRoutes`).
 */
export function navegacaoVista(real, chaveDaPagina, tipoDoRoteador) {
  if (real === null || typeof real !== "object") {
    return { tipo: tipoDoRoteador, rolagemGlobal: false };
  }
  return { tipo: real.chave === chaveDaPagina ? real.tipo : "POP", rolagemGlobal: true };
}

/** O tipo de navegação que a página vê de verdade. Ver `navegacaoVista`. */
export function useNavegacaoReal() {
  const real = useContext(NavegacaoRealContext);
  const { key } = useLocation();
  const tipoDoRoteador = useNavigationType();
  return navegacaoVista(real, key, tipoDoRoteador);
}
