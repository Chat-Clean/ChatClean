/**
 * Formatação de data e de número no padrão brasileiro.
 *
 * Domínio puro (AD-1). Data é o primeiro dado que o Épico 2 vai exibir, e é
 * também o mais fácil de errar: o instante é gravado em UTC (`timestamptz`), e
 * quem formata sem declarar fuso recebe o fuso da máquina de quem olha. Num
 * servidor em UTC, "publicar às 00h de terça" vira "segunda, 21h" na tela — o
 * post aparece com três horas de antecedência sobre o combinado.
 *
 * Por isso o fuso é fixo e explícito, e é aplicado **só na apresentação**
 * (AD-13): nada aqui converte, arredonda ou grava instante. Entra um instante,
 * sai texto.
 *
 * Entrada inválida **falha alto**. `Intl` diante de uma data inválida devolve
 * a string "Invalid Date", que é exatamente o tipo de defeito que chega até a
 * tela publicada sem ninguém perceber.
 */

/** O fuso do negócio. Apresentação apenas — o armazenamento continua em UTC. */
export const FUSO_DE_APRESENTACAO = "America/Sao_Paulo";

/** A localidade do negócio. */
export const LOCALIDADE = "pt-BR";

/**
 * `2026-08-14` — data civil, sem hora e sem fuso.
 *
 * É a forma que uma coluna `date` do Postgres devolve e a que mais aparece em
 * campo de formulário. **É também a armadilha:** por especificação do
 * ECMAScript, `new Date("2026-08-14")` é meia-noite em UTC, e meia-noite UTC é
 * 21h do dia ANTERIOR em São Paulo. Convertida como instante, a data civil
 * perde um dia — o erro exato que este módulo existe para impedir, entrando
 * pela porta da frente.
 *
 * Data civil não é instante: não tem hora, então não há o que converter. Ela é
 * reordenada para `DD/MM/AAAA` sem passar por fuso nenhum, e as funções que
 * pedem hora a recusam em vez de inventar uma.
 */
const DATA_CIVIL = /^(\d{4})-(\d{2})-(\d{2})$/;

function comoDataCivil(valor) {
  if (typeof valor !== "string") return null;
  const casou = DATA_CIVIL.exec(valor);
  if (!casou) return null;

  const [, ano, mes, dia] = casou;
  // `2026-02-31` casa com o padrão e não existe. A ida e volta por `Date.UTC`
  // acusa: o dia 31 de fevereiro volta como 3 de março.
  const instante = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  const redondo =
    instante.getUTCFullYear() === Number(ano) &&
    instante.getUTCMonth() === Number(mes) - 1 &&
    instante.getUTCDate() === Number(dia);
  if (!redondo) return null;

  return { ano, mes, dia };
}

/**
 * Converte `Date`, milissegundos ou string ISO em um instante válido.
 * Lança para qualquer coisa que não seja um instante — inclusive `null`,
 * `undefined`, string vazia, `Date` inválido e data civil sem hora.
 */
function paraInstante(valor) {
  if (typeof valor === "string" && DATA_CIVIL.test(valor)) {
    throw new TypeError(
      `${JSON.stringify(valor)} é data civil, sem hora e sem fuso: não é um instante. ` +
        "Use `formatarData`, ou passe o instante completo (com hora e deslocamento).",
    );
  }

  const data =
    valor instanceof Date
      ? valor
      : typeof valor === "number" || typeof valor === "string"
        ? new Date(valor)
        : null;

  if (data === null || Number.isNaN(data.getTime())) {
    throw new TypeError(
      `Instante inválido para formatação: ${JSON.stringify(valor)}. ` +
        "Esperado Date, milissegundos ou string ISO 8601.",
    );
  }
  return data;
}

/*
 * Os formatadores são criados uma vez: construir `Intl.DateTimeFormat` é caro,
 * e numa listagem ele seria reconstruído por linha.
 */

const formatadorDeData = new Intl.DateTimeFormat(LOCALIDADE, {
  timeZone: FUSO_DE_APRESENTACAO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatadorDeHora = new Intl.DateTimeFormat(LOCALIDADE, {
  timeZone: FUSO_DE_APRESENTACAO,
  hour: "2-digit",
  minute: "2-digit",
  // `h23` explícito: com `hour12: false` algumas versões do ICU emitem "24:00"
  // para a meia-noite, e meia-noite é justamente o horário de publicação
  // agendada mais comum.
  hourCycle: "h23",
});

const formatadorDeNumero = new Intl.NumberFormat(LOCALIDADE);

/**
 * `14/08/2026` — o dia.
 *
 * Instante (`Date`, milissegundos, ISO com hora) é traduzido para o dia
 * correspondente no fuso do negócio. Data civil (`2026-08-14`) é apenas
 * reordenada: sem hora não há instante, e convertê-la custaria um dia.
 */
export function formatarData(valor) {
  const civil = comoDataCivil(valor);
  if (civil) return `${civil.dia}/${civil.mes}/${civil.ano}`;
  if (typeof valor === "string" && DATA_CIVIL.test(valor)) {
    // Casou com o formato mas não é dia que existe (`2026-02-31`).
    throw new TypeError(
      `Data civil inválida: ${JSON.stringify(valor)}. Esse dia não existe no calendário.`,
    );
  }
  return formatadorDeData.format(paraInstante(valor));
}

/** `10:27` — a hora no fuso do negócio, em 24 horas. */
export function formatarHora(valor) {
  return formatadorDeHora.format(paraInstante(valor));
}

/** `14/08/2026 10:27` — dia e hora no fuso do negócio. */
export function formatarDataEHora(valor) {
  const data = paraInstante(valor);
  return `${formatadorDeData.format(data)} ${formatadorDeHora.format(data)}`;
}

/**
 * `1.234` — separador de milhar brasileiro.
 *
 * Contador é dado, não prosa: aparece ao lado do nome da aba e em colunas de
 * listagem, sempre com a classe `.dado` para alinhar pela pilha monoespaçada e
 * pelo numeral tabular.
 */
export function formatarNumero(valor) {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new TypeError(
      `Número inválido para formatação: ${JSON.stringify(valor)}.`,
    );
  }
  return formatadorDeNumero.format(valor);
}
