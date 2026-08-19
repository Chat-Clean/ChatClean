/**
 * Os endereços do Painel — vocabulário compartilhado, e não de uma tela só.
 *
 * ─── POR QUE ISTO NÃO MORA EM `previa.js` ───────────────────────────────────
 *
 * O endereço da pré-visualização é lido por três lugares: a declaração de rotas
 * (`main.jsx`), a decisão de para onde a ação de ver leva (`acoes.js`, que a
 * listagem e o Editor consultam) e a própria tela. Deixá-lo dentro do módulo da
 * tela faria o módulo compartilhado apontar para o módulo de UMA tela — seta
 * invertida, e um ciclo esperando a primeira pessoa que precisasse do caminho
 * contrário. Aqui a seta aponta para vocabulário, que é o que ele é.
 *
 * Não é camada nova: é um módulo puro de `admin/blog`, irmão de `listagem.js`,
 * `acoes.js` e `gaveta.js`, sob as mesmas regras — sem React, sem rede.
 *
 * ─── A ROTA VIVE SOB `/admin`, E NÃO EM `/blog` ─────────────────────────────
 *
 * O cliente do Painel compartilha sessão por ORIGEM: pré-visualizar na rota
 * pública faria a página pública ler autenticada e passaria a expor rascunho a
 * quem tem sessão. Sob `/admin` a prévia nasce dentro do portão — o mesmo, não
 * um segundo.
 *
 * ─── E O IDENTIFICADOR É CONFERIDO PELA REGRA DA CAMADA DE DADOS ────────────
 *
 * `ehUuid` é importado, não copiado. Uma terceira cópia do formato de
 * identificador é exatamente o defeito que a Story 2.12 corrigiu entre o núcleo
 * e o transporte da função de servidor.
 */

import { ehUuid } from "@/data/blog/comum";

/** A raiz do Painel — para onde as telas voltam, e de onde as filhas pendem. */
export const BASE_DO_PAINEL = "/admin";

/** O segmento que distingue a prévia das outras telas do Painel. */
export const SEGMENTO_DA_PREVIA = "previa";

/** O nome do parâmetro de rota. Escrito uma vez: a rota e a tela o leem daqui. */
export const PARAMETRO_DA_PREVIA = "id";

/**
 * O caminho da rota filha, RELATIVO ao pai `/admin` — é assim que o React
 * Router declara rota aninhada, e é assim que o portão do pai passa a valer
 * para ela sem ninguém precisar lembrar de envolvê-la.
 */
export const ROTA_DA_PREVIA = `${SEGMENTO_DA_PREVIA}/:${PARAMETRO_DA_PREVIA}`;

/**
 * A filha apanha-tudo do Painel.
 *
 * Sem ela, `/admin/previa` sem identificador e `/admin/qualquer-coisa` não
 * casam com filha nenhuma: o pai monta, o `Outlet` fica vazio e o Autor recebe
 * uma página em branco — que é indistinguível de "o Painel quebrou". Com ela, o
 * endereço desconhecido cai na mesma tela de ausência, que diz o que houve e
 * oferece a volta.
 */
export const ROTA_DESCONHECIDA = "*";

/**
 * O nome do parâmetro de consulta que avisa "há alterações não salvas".
 *
 * A prévia lê do BANCO. Quem a abre do Editor com texto pendente confere uma
 * versão que não é a que está na tela dele — e conclui a coisa errada, nos dois
 * sentidos. O aviso viaja no endereço porque a prévia abre em ABA NOVA: não há
 * estado compartilhado entre as duas abas, e inventar um seria inventar um
 * canal para dizer uma frase.
 */
export const PARAMETRO_DE_PENDENCIA = "pendente";

/** O único valor que liga o aviso. Vocabulário fechado, como todo o resto. */
export const VALOR_DE_PENDENCIA = "1";

/** O identificador é utilizável? Mesma regra da camada de dados, importada. */
export function ehIdentificadorDePost(valor) {
  return ehUuid(valor);
}

/** O endereço absoluto da prévia de um identificador. `""` quando não dá. */
export function enderecoDaPreviaDeId(id, { pendente = false } = {}) {
  const alvo = typeof id === "string" ? id.trim() : "";
  if (!ehIdentificadorDePost(alvo)) return "";
  const caminho = `${BASE_DO_PAINEL}/${SEGMENTO_DA_PREVIA}/${alvo}`;
  return pendente === true
    ? `${caminho}?${PARAMETRO_DE_PENDENCIA}=${VALOR_DE_PENDENCIA}`
    : caminho;
}

/** O endereço da prévia de um Post. `""` quando ele não tem identificador. */
export function enderecoDaPrevia(post, opcoes) {
  return enderecoDaPreviaDeId(post?.id, opcoes);
}

/**
 * O Post tem identificador, mas ele não serve? É diferente de não ter nenhum.
 *
 * Post que nunca foi salvo não tem identificador — a saída é salvar. Post cujo
 * identificador está fora do formato é dado corrompido — mandar salvar de novo
 * seria mandar a pessoa refazer um trabalho que já foi feito, por um defeito
 * que não é dela. Duas causas, duas frases.
 */
export function temIdentificadorCorrompido(post) {
  const bruto = post?.id;
  if (bruto === null || bruto === undefined) return false;
  const alvo = typeof bruto === "string" ? bruto.trim() : String(bruto);
  return alvo !== "" && !ehIdentificadorDePost(alvo);
}
