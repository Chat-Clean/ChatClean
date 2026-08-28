/**
 * O diagnóstico da entrega (Story 4.10).
 *
 * ─── TODA RESPOSTA SE EXPLICA ─────────────────────────────────────────────
 *
 * Sem isto, uma falha só é percebida por quem olha os registros de propósito,
 * ou por um visitante que tropeça nela. O cabeçalho diz, numa palavra, se a
 * resposta saiu como esperado; o registro de evento diz o resto, e só existe
 * quando há desvio — uma resposta `ok` não loga nada, porque log constante é
 * ruído que ninguém lê no dia em que precisar.
 *
 * ─── O STATUS HTTP NÃO MUDA POR CAUSA DISTO ───────────────────────────────
 *
 * O diagnóstico é informação ADICIONAL. As garantias da Story 4.5 — nunca 200
 * numa falha, nunca 404 numa falha de leitura — continuam exatamente como
 * estão. O que este módulo acrescenta é o PORQUÊ, para quem olhar depois.
 *
 * Puro: sem rede, sem `fs`.
 */

/** O nome do cabeçalho. Uma palavra composta, para não colidir com nada padrão. */
export const CABECALHO_DE_DIAGNOSTICO = "X-Entrega-Diagnostico";

/** O caminho normal. Nada é registrado quando o diagnóstico é este. */
export const DIAGNOSTICO_OK = "ok";

/**
 * A leitura do Supabase falhou.
 *
 * Em `/blog/:slug` isto dispara a degradação para o shell de verdade (Story
 * 4.10); em `/sitemap.xml` e `/llms.txt` o diagnóstico é o mesmo — a CAUSA é
 * idêntica —, mas a resposta continua sendo o defeito puro, porque as Stories
 * 4.7 e 4.8 já decidiram, por escrito, que essas duas não degradam.
 */
export const DIAGNOSTICO_LEITURA_FALHOU = "degradado:leitura-falhou";

/** O Conteúdo de um Post não passou na conferência da Story 4.4. A página
 * continua 200, com metadado certo; só o corpo do artigo fica de fora. */
export const DIAGNOSTICO_CONTEUDO_RECUSADO = "degradado:conteudo-recusado";

/** O Domínio Canônico não foi declarado no ambiente. Falha de configuração de
 * implantação, não de tempo de execução — sem ele não há como montar endereço
 * absoluto nenhum, e não há shell alternativo a servir. */
export const DIAGNOSTICO_SEM_DOMINIO = "falha:sem-dominio";

/** O shell do build não foi embutido. Falha de implantação: o passo de build
 * não rodou o gerador do shell. */
export const DIAGNOSTICO_SEM_SHELL = "falha:sem-shell";

/** O shell embutido não traz os marcadores de região. Bug de implantação —
 * shell presente, mas incompleto. */
export const DIAGNOSTICO_REGIAO_AUSENTE = "falha:regiao-ausente";

/** O método da requisição não está no vocabulário da rota. */
export const DIAGNOSTICO_METODO_RECUSADO = "falha:metodo-recusado";

/**
 * O chamador de `responderDefeito` não passou um diagnóstico.
 *
 * NUNCA é para aparecer numa resposta de verdade — é o valor que aparece se um
 * lugar novo de falha esquecer de nomear a si mesmo, e existe para ISSO ser
 * visível em vez de virar `"undefined"` escrito num cabeçalho HTTP.
 */
export const DIAGNOSTICO_SEM_NOME = "falha:sem-diagnostico";

/** O vocabulário inteiro, para quem quiser variar sobre ele. */
export const DIAGNOSTICOS_CONHECIDOS = Object.freeze([
  DIAGNOSTICO_OK,
  DIAGNOSTICO_LEITURA_FALHOU,
  DIAGNOSTICO_CONTEUDO_RECUSADO,
  DIAGNOSTICO_SEM_DOMINIO,
  DIAGNOSTICO_SEM_SHELL,
  DIAGNOSTICO_REGIAO_AUSENTE,
  DIAGNOSTICO_METODO_RECUSADO,
  DIAGNOSTICO_SEM_NOME,
]);

/**
 * O nível de registro de um diagnóstico, ou `null` quando não se registra nada.
 *
 * Derivado do PREFIXO, e não passado por cada chamador: um diagnóstico novo
 * que esqueça de declarar o nível nasceria mudo ou barulhento por engano. O
 * prefixo já diz a gravidade — `degradado:` é a página funcionando por um
 * caminho pior; `falha:` é nada tendo sido servido do jeito certo.
 */
export function nivelDoDiagnostico(diagnostico) {
  if (diagnostico === DIAGNOSTICO_OK) return null;
  if (typeof diagnostico !== "string") return "error";
  return diagnostico.startsWith("falha:") ? "error" : "warn";
}

/** A escrita padrão: `console.error`/`console.warn` — o que a hospedagem já
 * captura como registro consultável. Um serviço externo seria um segredo a
 * mais para guardar sem necessidade. */
function escreverNoConsole(nivel, linha) {
  if (nivel === "warn") console.warn(linha);
  else console.error(linha);
}

/**
 * Registra um evento fora do caminho normal.
 *
 * O formato é fixo — `[entrega:evento] {"...":"..."}` — para ser buscável nos
 * registros da hospedagem sem depender de lembrar onde cada rota loga cada
 * coisa.
 *
 * `escrever` é injetável pela mesma razão que `buscar` na camada de leitura: o
 * caminho de registro se exercita e se confere sem depender de capturar saída
 * de console através de um limite de módulo — o que, além de frágil, não é
 * necessário: o que importa provar é QUE NÍVEL e QUE LINHA saem para cada
 * diagnóstico, e é isso que a injeção deixa exercitar direto.
 */
export function registrarEvento({
  diagnostico,
  rota = null,
  detalhe = null,
  escrever = escreverNoConsole,
}) {
  const nivel = nivelDoDiagnostico(diagnostico);
  if (nivel === null) return;

  const linha = `[entrega:evento] ${JSON.stringify({ diagnostico, rota, detalhe })}`;
  escrever(nivel, linha);
}
