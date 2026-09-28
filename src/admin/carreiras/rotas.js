/**
 * Os endereços de Carreiras no Painel (Stories 5.4 e 5.5).
 *
 * Módulo puro, sem React e sem rede, irmão de `admin/blog/rotas.js` e sem
 * importar nada dele: `admin/carreiras` e `admin/blog` nunca se importam
 * (AD-15). As rotas do formulário são FILHAS de `/admin` em `main.jsx`, e por
 * isso nascem dentro do mesmo portão de sessão que as telas do Blog.
 *
 * ─── A LISTAGEM É UMA ABA, E A ABA ESTÁ NA URL (Story 5.5) ──────────────────
 *
 * A listagem de Vagas mora na aba Carreiras do Painel, e a aba inicial vem do
 * parâmetro `?aba=carreiras`. É por ele que a volta do formulário cai na aba
 * Carreiras, e não no Blog: `ENDERECO_DA_LISTAGEM` o traz. O Painel lê o
 * parâmetro pelos nomes exportados daqui, e não por uma segunda grafia.
 */

/** O Painel: o pai das rotas do formulário. */
const BASE_DO_PAINEL = "/admin";

/** O segmento do parâmetro de rota. Escrito uma vez: a rota e a tela o leem daqui. */
export const PARAMETRO_DA_VAGA = "id";

/** O nome do parâmetro de busca que escolhe a aba inicial do Painel. */
export const PARAMETRO_DA_ABA = "aba";

/** O valor do parâmetro (e o identificador da aba) de Carreiras. */
export const ABA_DE_CARREIRAS = "carreiras";

/** A rota filha da Vaga nova, RELATIVA ao pai `/admin`. */
export const ROTA_DA_VAGA_NOVA = "carreiras/vaga/nova";

/** A rota filha de uma Vaga que existe, RELATIVA ao pai `/admin`. */
export const ROTA_DA_VAGA = `carreiras/vaga/:${PARAMETRO_DA_VAGA}`;

/** Para onde o formulário volta: o Painel, já na aba Carreiras. */
export const ENDERECO_DA_LISTAGEM = `${BASE_DO_PAINEL}?${PARAMETRO_DA_ABA}=${ABA_DE_CARREIRAS}`;

/** O endereço absoluto da Vaga nova. */
export const ENDERECO_DA_VAGA_NOVA = `${BASE_DO_PAINEL}/${ROTA_DA_VAGA_NOVA}`;

/**
 * A rota filha da tela de Departamentos, Tipos e Níveis (Story 5.6), RELATIVA
 * ao pai `/admin`: nasce dentro do mesmo portão de sessão. A volta dela é
 * `ENDERECO_DA_LISTAGEM`, a aba Carreiras.
 */
export const ROTA_DAS_CLASSIFICACOES = "carreiras/classificacoes";

/** O endereço absoluto da tela de Classificações, para o link da aba. */
export const ENDERECO_DAS_CLASSIFICACOES = `${BASE_DO_PAINEL}/${ROTA_DAS_CLASSIFICACOES}`;

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
  return `${BASE_DO_PAINEL}/carreiras/vaga/${encodeURIComponent(limpo)}`;
}
