/**
 * A chave do checkout, do lado do navegador.
 *
 * ─── O ACESSO PRECISA SER LITERAL ────────────────────────────────────────
 *
 * O Vite substitui `import.meta.env.VITE_X` ESTATICAMENTE, procurando o texto
 * exato no código-fonte. Um acesso por chave calculada, `import.meta.env[nome]`,
 * não é alcançado pela substituição e devolveria `undefined` no navegador mesmo
 * com a variável declarada na plataforma. Aqui isso significaria o checkout
 * escondido em produção mesmo depois de ligado, e ninguém entenderia por quê.
 *
 * `src/admin/blog/dominio.js` e `src/data/supabase/clientes.js` registram a
 * mesma armadilha.
 *
 * ─── E PRECISA SER PROTEGIDO ─────────────────────────────────────────────
 *
 * Fora do navegador `import.meta.env` não existe e o acesso LANÇA. As
 * ferramentas de verificação importam módulos do site em Node, então a queda
 * vira `undefined`, que o domínio já trata como desligado.
 *
 * ─── UMA VEZ, NA CARGA DO MÓDULO ─────────────────────────────────────────
 *
 * O valor é constante durante a vida da página: ele foi assado no pacote. Ler
 * a cada render seria trabalho repetido para responder sempre a mesma coisa.
 */

import { checkoutAtivo } from "@/domain/assinatura/disponibilidade";

function doVite(leitor) {
  try {
    return leitor();
  } catch {
    return undefined;
  }
}

export const CHECKOUT_ATIVO = checkoutAtivo({
  VITE_CHECKOUT_ATIVO: doVite(() => import.meta.env.VITE_CHECKOUT_ATIVO),
});
