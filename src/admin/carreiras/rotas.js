/**
 * Os endereços do formulário de Vaga no Painel (Story 5.4).
 *
 * Módulo puro, sem React e sem rede, irmão de `admin/blog/rotas.js` e sem
 * importar nada dele: `admin/carreiras` e `admin/blog` nunca se importam
 * (AD-15). As duas rotas são FILHAS de `/admin` em `main.jsx`, e por isso
 * nascem dentro do mesmo portão de sessão que as telas do Blog.
 *
 * `ENDERECO_DA_LISTAGEM` é `/admin` por enquanto: a listagem de Vagas é da
 * Story 5.5, e até lá a volta cai no Painel, onde a aba Carreiras mora.
 */

/** O segmento do parâmetro de rota. Escrito uma vez: a rota e a tela o leem daqui. */
export const PARAMETRO_DA_VAGA = "id";

/** A rota filha da Vaga nova, RELATIVA ao pai `/admin`. */
export const ROTA_DA_VAGA_NOVA = "carreiras/vaga/nova";

/** A rota filha de uma Vaga que existe, RELATIVA ao pai `/admin`. */
export const ROTA_DA_VAGA = `carreiras/vaga/:${PARAMETRO_DA_VAGA}`;

/** Para onde o formulário volta. */
export const ENDERECO_DA_LISTAGEM = "/admin";

/** O endereço absoluto da Vaga nova. */
export const ENDERECO_DA_VAGA_NOVA = `${ENDERECO_DA_LISTAGEM}/${ROTA_DA_VAGA_NOVA}`;

/**
 * O endereço absoluto de uma Vaga pelo identificador. O identificador é
 * codificado: ele vem da rede, e um caractere de barra nele mudaria de rota.
 *
 * Sem identificador (nulo, vazio ou só espaço), a volta é a listagem: um
 * endereço `/admin/carreiras/vaga/` cairia na tela de ausência, e não em
 * lugar nenhum que a pessoa pediu.
 */
export function enderecoDaVaga(id) {
  const limpo = String(id ?? "").trim();
  if (limpo === "") return ENDERECO_DA_LISTAGEM;
  return `${ENDERECO_DA_LISTAGEM}/carreiras/vaga/${encodeURIComponent(limpo)}`;
}
