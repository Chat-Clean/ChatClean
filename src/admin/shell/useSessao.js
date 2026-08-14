/**
 * O contexto de sessão e o hook que o consome.
 *
 * Vivem fora de `SessaoProvider.jsx` de propósito: o lint
 * (`react-refresh/only-export-components`) proíbe que um arquivo de componente
 * exporte também não-componentes. Deixando contexto e hook aqui, o arquivo do
 * provider exporta só o componente e o Fast Refresh continua funcionando.
 */

import { createContext, useContext } from "react";

export const ContextoDeSessao = createContext(null);

/**
 * Estado e ações da sessão do Painel.
 *
 * Devolve:
 *   `estado`      — "carregando" | "anonimo" | "autenticado"
 *   `email`       — e-mail da Conta autenticada, ou `null`
 *   `perfil`      — { carregando, nome, erro } com o nome de exibição vindo de
 *                   `perfis`. Nunca derivado do e-mail: o AC pede o nome da
 *                   Conta, e erro de leitura precisa aparecer como erro.
 *   `erroDeAmbiente` — mensagem de configuração ausente, ou `null`
 *   `erroDeSessao`   — a sessão guardada existe mas não pôde ser conferida com
 *                      o servidor (rede fora, 5xx, limite de taxa). Nunca
 *                      significa "token recusado": recusa vira `anonimo` sem
 *                      mensagem, porque não há nada a explicar a quem não
 *                      tinha sessão.
 *   `entrar(email, senha)` — devolve `{ ok }` ou `{ ok: false, mensagem }`
 *   `sair()`
 */
export function useSessao() {
  const valor = useContext(ContextoDeSessao);
  if (valor === null) {
    throw new Error(
      "useSessao() foi chamado fora de <SessaoProvider>. O Painel inteiro precisa estar dentro dele.",
    );
  }
  return valor;
}
