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
 *
 * ─── As duas funções de CAMPO, e por que elas não quebram a regra acima ─────
 *
 * `paraCampoDeInstante` e `deCampoDeInstante` traduzem entre um instante e o
 * que um `<input type="datetime-local">` mostra. Elas são apresentação nos dois
 * sentidos — o campo exibe hora de parede em São Paulo, e o que o Autor digita
 * ali é hora de parede em São Paulo. O que fica **gravado** continua sendo o
 * instante, em UTC, e a comparação de visibilidade continua rodando em UTC na
 * política do banco.
 *
 * Elas moram aqui, e não na tela, exatamente porque a alternativa é a armadilha
 * que este módulo existe para fechar: `new Date("2026-08-17T00:30")` é
 * meia-noite e meia **no fuso da máquina de quem digita**. Num navegador em
 * Lisboa, agendar para 00h30 em São Paulo publicaria o Post no dia anterior.
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
 * `sexta-feira, 14 de agosto de 2026, às 10:27` — a data POR EXTENSO.
 *
 * Existe para a confirmação de um agendamento, e o dia da semana está aí de
 * propósito: é o único ponto do fluxo em que um erro de fuso fica visível
 * ANTES de o Post sair no ar. `01/09/2026 00:30` e `31/08/2026 21:30` são
 * quase o mesmo texto e diferem em um dia inteiro; "terça-feira, 1º de
 * setembro" e "segunda-feira, 31 de agosto" ninguém confunde.
 *
 * A vírgula antes de "às" não é enfeite: sem ela, `pt-BR` produz
 * "…de 2026 às 10:27", e o número cola visualmente no ano.
 *
 * Data civil (`2026-08-14`) é recusada como em todo o resto do módulo — sem
 * hora não há instante, e um agendamento sem hora não é agendamento.
 */
const formatadorPorExtenso = new Intl.DateTimeFormat(LOCALIDADE, {
  timeZone: FUSO_DE_APRESENTACAO,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatarDataEHoraPorExtenso(valor) {
  const data = paraInstante(valor);
  return `${formatadorPorExtenso.format(data)}, às ${formatadorDeHora.format(data)}`;
}

/* ─── Instante ↔ campo de data e hora ────────────────────────────────────── */

/**
 * As partes de um instante lidas **no fuso do negócio**, como números.
 *
 * `formatToParts` é o único jeito honesto de perguntar "que horas são em São
 * Paulo neste instante" sem depender do fuso da máquina. Os métodos `getHours`
 * e companhia respondem sempre no fuso local, que é justamente o que não serve.
 */
const formatadorDePartes = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_DE_APRESENTACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partesNoFuso(data) {
  const partes = {};
  for (const { type, value } of formatadorDePartes.formatToParts(data)) {
    if (type !== "literal") partes[type] = Number(value);
  }
  return partes;
}

/**
 * O deslocamento do fuso do negócio, em milissegundos, NESTE instante.
 *
 * São Paulo não tem horário de verão desde 2019, mas isso é uma decisão
 * política que já mudou duas vezes e pode mudar de novo — e a base de dados de
 * fusos do runtime é atualizada. Perguntar o deslocamento ao `Intl` em vez de
 * escrever `-03:00` é o que faz esta conversão continuar certa quando a regra
 * mudar, sem ninguém precisar lembrar deste arquivo.
 */
function deslocamentoEm(instanteMs) {
  const p = partesNoFuso(new Date(instanteMs));
  const comoSeFosseUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoSeFosseUtc - instanteMs;
}

/** `2026-08-17T14:30` — o valor de um `<input type="datetime-local">`. */
const CAMPO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Um instante, escrito como o campo de data e hora o mostra em São Paulo.
 *
 * Devolve `""` para ausência — `null` e `undefined` são "sem data de
 * publicação", que é estado normal de um rascunho, e não erro. Instante
 * inválido continua falhando alto, como todo o resto do módulo.
 */
export function paraCampoDeInstante(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  const data = paraInstante(valor);
  const p = partesNoFuso(data);
  const dois = (n) => String(n).padStart(2, "0");
  return `${String(p.year).padStart(4, "0")}-${dois(p.month)}-${dois(p.day)}T${dois(p.hour)}:${dois(p.minute)}`;
}

/**
 * O que o Autor digitou no campo, lido como hora de parede em São Paulo e
 * devolvido como instante em UTC (ISO 8601, com `Z`).
 *
 * Devolve `null` para campo vazio — apagar a data é uma ação legítima — e
 * **lança** para valor que não é hora de parede nenhuma, pela mesma razão que o
 * resto do módulo lança: uma data inválida que atravessa em silêncio vira
 * `publicado_em` errado num Post no ar.
 *
 * **A conversão é feita em duas passagens**, e não em uma. O deslocamento
 * depende do instante, e o instante é o que estamos calculando: a primeira
 * passagem chuta o deslocamento pela hora de parede lida como se fosse UTC, e a
 * segunda o confere contra o instante obtido. Elas só divergem na hora exata em
 * que um fuso muda de deslocamento — e é exatamente ali que a conversão de uma
 * passagem só erra por uma hora inteira.
 */
export function deCampoDeInstante(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string" || valor.trim() === "") return null;

  const casou = CAMPO_LOCAL.exec(valor.trim());
  if (!casou) {
    throw new TypeError(
      `${JSON.stringify(valor)} não é uma data com hora. ` +
        "Esperado AAAA-MM-DDTHH:MM, como o campo de data e hora escreve.",
    );
  }

  const [, ano, mes, dia, hora, minuto, segundo] = casou;
  const comoSeFosseUtc = Date.UTC(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    Number(segundo ?? 0),
  );

  /* `2026-02-31T10:00` casa com o padrão e não existe: a ida e volta por
     `Date.UTC` acusa, porque 31 de fevereiro volta como 3 de março. O mesmo
     vale para hora 25 e minuto 61. */
  const conferencia = new Date(comoSeFosseUtc);
  const redondo =
    conferencia.getUTCFullYear() === Number(ano) &&
    conferencia.getUTCMonth() === Number(mes) - 1 &&
    conferencia.getUTCDate() === Number(dia) &&
    conferencia.getUTCHours() === Number(hora) &&
    conferencia.getUTCMinutes() === Number(minuto);
  if (!redondo) {
    throw new TypeError(
      `Data e hora inválidas: ${JSON.stringify(valor)}. Esse momento não existe no calendário.`,
    );
  }

  const primeiro = comoSeFosseUtc - deslocamentoEm(comoSeFosseUtc);
  const segundoPasso = comoSeFosseUtc - deslocamentoEm(primeiro);
  return new Date(segundoPasso).toISOString();
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
