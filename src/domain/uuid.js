/**
 * O formato de identificador do banco, sem nada em volta.
 *
 * Morava só em `data/blog/comum.js`, que também monta o cliente do Supabase:
 * quem importava `ehUuid` para conferir um endereço (as rotas do Painel, a
 * página de Notícias) trazia o cliente inteiro para o pacote da home. Lá ele
 * continua exportado, pela mesma definição daqui.
 *
 * Puro: sem rede, sem React.
 */

/** Formato de identificador do banco: `uuid` gerado pelo Postgres. */
export const FORMATO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ehUuid(valor) {
  return typeof valor === "string" && FORMATO_DE_UUID.test(valor.trim());
}
