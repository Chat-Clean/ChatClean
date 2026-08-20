/**
 * A gaveta de metadados do Post — o que descreve o Post, ao lado do que ele diz.
 *
 * Nove campos: Título, Slug, Resumo, Imagem de capa, Descrição da imagem,
 * Categoria, Tags, Data de Publicação e tempo de leitura. Cada um com
 * **rótulo associado** — `<label for>` ligado ao
 * `id` do controle, e não um texto solto acima dele: sem a associação, quem
 * navega por leitor de tela ouve "caixa de edição" nove vezes seguidas e
 * precisa adivinhar qual é qual.
 *
 * ─── O que esta gaveta NÃO faz ──────────────────────────────────────────────
 *
 * Ela não grava, não conhece Supabase e não decide quando o Slug acompanha o
 * título. É um componente controlado: recebe `valores`, avisa `aoMudar`, e quem
 * monta a tela (`EditorDePost`) é que sabe se o Post está nascendo ou sendo
 * editado — que é exatamente a diferença que decide o destino do Slug.
 *
 * Também não existe campo de **Autor**: ele é resolvido no servidor desde a
 * Story 2.5, a partir da Conta autenticada. O campo digitável que existia na
 * tela de `localStorage` não se reproduz aqui, e a ausência é o requisito.
 *
 * ─── A CAPA, DEPOIS DA STORY 3.1 ───────────────────────────────────────────
 *
 * A gaveta ganhou o campo de imagem e, colado nele, o de descrição. A ordem é
 * do módulo de metadados e o motivo está lá: capa é CONTEÚDO, e a descrição é
 * obrigatória quando há capa — o banco a exige desde a Story 2.1, e perguntá-la
 * em outro lugar do formulário produziria a recusa depois do envio.
 *
 * **Ela continua sem conhecer rede.** O que ela faz é emitir o arquivo que a
 * pessoa escolheu e desenhar a situação que recebe: enviando, recusado, ou nem
 * uma coisa nem outra. Quem fala com o Storage é o Editor, pela camada de
 * dados. E a indicação de progresso é INDETERMINADA de propósito — ver o
 * cabeçalho de `capa.js`.
 *
 * ─── A CAPA TEM DUAS ORIGENS, DEPOIS DA STORY 3.2 ──────────────────────────
 *
 * Enviar um arquivo, ou informar o endereço de uma imagem já hospedada em outro
 * lugar. O que o Post guarda é o mesmo nos dois casos — `imagem_url` —, e por
 * isso o modo **não é campo do formulário**: é estado de tela, do vocabulário
 * fechado de `capa.js`, e não entra em `CAMPOS_DA_GAVETA` nem no corpo do
 * pedido. O servidor não precisa saber de onde a imagem veio.
 *
 * O modo é DERIVADO do endereço enquanto ninguém escolheu um — abrir um Post
 * com capa de fora no modo de envio esconderia o valor que o Autor foi editar —,
 * e alternar **não perde o que estava no outro modo**: o endereço de cada um
 * fica guardado, e volta ao ser reescolhido. Alternância que apaga o que a
 * pessoa digitou é alternância que ela aprende a não usar.
 *
 * E a imagem que não carrega — de fora ou do bucket — degrada para o
 * **monograma da Categoria**, o mesmo que a listagem desenha para o mesmo Post,
 * ocupando exatamente o espaço que a imagem ocuparia.
 *
 * ─── CATEGORIA E TAG, DEPOIS DA STORY 2.14 ──────────────────────────────────
 *
 * A **Categoria** continua sendo um menu nativo — é o controle que cabe em
 * 340px e que quem navega por teclado já sabe operar —, mas a escolhida passa a
 * aparecer com COR e ÍCONE ao lado dele: os dois já chegavam da camada de dados
 * e eram descartados. A cor vai por `style`, do vocabulário fechado do domínio;
 * o ícone é chave de um mapa fechado no código. Nenhuma classe do Tailwind é
 * montada em tempo de execução — ela não existiria no CSS compilado.
 *
 * As **Tags** deixaram de ser um menu múltiplo com "Segure Ctrl" na ajuda.
 * Aquilo não é entrada de texto, não existe no celular, e não permitia criar
 * tag nenhuma: só dava para escolher entre as que já existiam. Agora o campo é
 * texto separado por vírgula, com as já usadas SUGERIDAS ao lado — e quem
 * separa, normaliza e colapsa a repetida é `domain/blog/tags.js`, a mesma
 * função que o servidor usa para não haver duas ideias do que é a mesma Tag.
 *
 * ─── O campo que falta é INDICADO ───────────────────────────────────────────
 *
 * `faltando` é a lista de nomes de campo vazios que a gravação recusa — a mesma
 * lista que a função de servidor devolve em `erro.faltando`. Cada campo dela
 * ganha `aria-invalid`, borda de recusa e uma frase própria ligada por
 * `aria-describedby`. Uma mensagem genérica no rodapé ("preencha os campos
 * obrigatórios") obriga a pessoa a percorrer a gaveta procurando qual é.
 *
 * ─── O fuso entra AQUI, e só aqui ───────────────────────────────────────────
 *
 * A Data de Publicação é `timestamptz` no banco e instante em UTC no caminho
 * inteiro. O campo mostra e lê **hora de parede em São Paulo**, pelas funções de
 * `domain/blog/formato.js` — o único lugar do projeto que conhece o fuso. A
 * comparação de visibilidade continua em UTC, na política do banco.
 *
 * ─── ABERTA OU RECOLHIDA — E QUEM DECIDE NÃO É ELA ──────────────────────────
 *
 * A gaveta ocupa 340px aberta e um trilho de 46px recolhida, e o controle de
 * reabrir fica **dentro do trilho**: uma gaveta que some sem deixar como voltar
 * é pior que uma gaveta larga. O estado vem de fora, como tudo aqui — quem monta
 * a tela é que sabe se a tela é estreita, e é lá que a regra de nascimento mora.
 *
 * Os campos continuam MONTADOS quando ela recolhe, apenas escondidos pelo
 * atributo `hidden`. Desmontá-los faria o `aria-controls` do controle apontar
 * para um elemento que não existe — e um alvo ausente é anunciado como nada.
 */

import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  ImagePlus,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
} from "lucide-react";

import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { FRASES_DE_FALTA, textoDaDataDoCampo } from "@/admin/blog/metadados";
/* As situações e as falas do envio moram em módulo próprio — função pura não
   mora em arquivo de componente, e é assim que a verificação as executa em vez
   de procurá-las no JSX. */
import {
  ENVIO_EM_CURSO,
  ENVIO_RECUSADO,
  ENVIO_PARADO,
  CAPA_AUSENTE,
  CAPA_COM_ENDERECO_RECUSADO,
  CAPA_QUE_NAO_CARREGOU,
  FALA_DA_CAPA_QUEBRADA,
  ORIGENS_DA_CAPA,
  ORIGEM_DE_FORA,
  ORIGEM_ENVIADA,
  ROTULO_DA_ORIGEM_DA_CAPA,
  ROTULO_DE_REMOVER_CAPA,
  ROTULO_DO_ENDERECO_DA_CAPA,
  alternativoDaMiniatura,
  falaDoEnvio,
  origemDoEndereco,
  rotuloDaCapaDegradada,
  rotuloDaOrigem,
  rotuloDoSeletor,
} from "@/admin/blog/capa";
/* A CAIXA DO MONOGRAMA é o COMPONENTE que a linha da listagem também desenha —
   não uma caixa parecida montada aqui. É o que faz "Editor e listagem mostram a
   mesma coisa para o mesmo Post" ser estrutura, e não coincidência. */
import MonogramaDaCapa from "@/admin/blog/MonogramaDaCapa";
/* O vocabulário do arquivo vem do DOMÍNIO: o `accept` do seletor é DERIVADO da
   mesma lista fechada que a camada de dados usa para recusar e que o bucket
   aplica. Escrevê-lo à mão aqui faria o seletor oferecer o que o envio recusa. */
import {
  ACEITO_NO_SELETOR,
  ROTULOS_DE_IMAGEM,
  TAMANHO_MAXIMO_DA_IMAGEM,
  TAMANHO_MAXIMO_DO_ALTERNATIVO,
  formatarTamanho,
  problemaNoEnderecoDaImagem,
  problemaNoTextoAlternativo,
} from "@/domain/blog/arquivos";
import { larguraDaGaveta, rotuloDoControle } from "@/admin/blog/gaveta";
import PilulaDeCategoria from "@/admin/blog/PilulaDeCategoria";
/* As regras da Tag digitada vêm do DOMÍNIO — as MESMAS que o servidor usa. */
import {
  LIMITE_DE_TAGS,
  SEPARADOR_DE_TAGS,
  chaveDaTag,
  separarTags,
} from "@/domain/blog/tags";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CLASSE_DE_CAMPO =
  "w-full rounded-controle border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-muted transition-colors";

export default function GavetaDeMetadados({
  valores,
  aoMudar,
  faltando = [],
  categorias = [],
  tags = [],
  problemaNoEndereco = null,
  /* ── A CAPA (Story 3.1) ──────────────────────────────────────────────────
     A gaveta continua SEM CONHECER REDE: ela recebe a situação do envio e a
     recusa já em palavras, e emite o arquivo escolhido. Quem fala com o
     Storage é o Editor, pela camada de dados — pôr o envio aqui faria o
     componente controlado passar a ter efeito colateral, e a gaveta é montada
     sozinha pela verificação justamente porque ela não tem. */
  situacaoDoEnvio = ENVIO_PARADO,
  recusaDoEnvio = null,
  /* A RAIZ DO NOSSO PROJETO, para saber se um endereço gravado é uma capa
     nossa — e só para isso. Ela decide em que modo o campo de capa abre, e
     nunca remoção de arquivo. `""` (o padrão, e o que a gaveta montada sozinha
     recebe) significa "não sei", e "não sei" abre no modo de endereço, que é o
     que mostra o valor em vez de escondê-lo. */
  baseDaCapaDoProjeto = "",
  aoEscolherArquivo,
  aoRemoverCapa,
  desabilitado = false,
  aberta = true,
  aoAlternar,
  className,
}) {
  /* Um prefixo por instância. Dois editores na mesma página (a verificação monta
     dois de propósito) não podem compartilhar `id`, senão o `for` do primeiro
     rótulo passa a apontar para o campo do segundo — e a associação, que é o
     ponto do componente, deixa de valer sem nada quebrar visivelmente. */
  const base = useId();
  const idDosCampos = `${base}-campos`;
  const idDe = (campo) => `${base}-${campo}`;
  const idDoErro = (campo) => `${base}-${campo}-erro`;
  const idDaAjuda = (campo) => `${base}-${campo}-ajuda`;

  const falta = (campo) => faltando.includes(campo);

  /** O que todo campo da gaveta carrega, montado uma vez por campo. */
  const campo = (nome, { ajuda = false, recusa = false, extra = "" } = {}) => {
    const invalido = falta(nome) || recusa;
    return {
      id: idDe(nome),
      name: nome,
      "data-campo": nome,
      disabled: desabilitado,
      "aria-invalid": invalido ? "true" : undefined,
      "aria-describedby": invalido ? idDoErro(nome) : ajuda ? idDaAjuda(nome) : undefined,
      className: cn(
        CLASSE_DE_CAMPO,
        ANEL_DE_FOCO,
        invalido ? "border-destructive" : "border-border-soft",
        extra,
      ),
    };
  };

  const mudar = (nome) => (evento) => aoMudar?.(nome, evento.target.value);

  const enderecoRecusado = Boolean(problemaNoEndereco);

  /* ── A capa ────────────────────────────────────────────────────────────
     `capa` é o ENDEREÇO gravado (ou o que o envio acabou de devolver). A
     gaveta nunca vê o arquivo depois de emiti-lo: o que ela mostra é a imagem
     que já está no bucket, pelo mesmo endereço que o site vai usar — é assim
     que "a miniatura aparece ao concluir" prova que o envio concluiu, em vez
     de mostrar uma pré-visualização local que existiria mesmo se ele tivesse
     falhado. */
  const capa = String(valores.imagem_url ?? "").trim();
  /* O VALOR CRU vai para o campo de texto, e o aparado vai para a lógica: um
     campo controlado que apara a cada tecla não deixa digitar o espaço que a
     pessoa vai apagar em seguida, e o cursor pula. */
  const enderecoDigitado = String(valores.imagem_url ?? "");
  const enviando = situacaoDoEnvio === ENVIO_EM_CURSO;

  /* A CAPA QUE NÃO CARREGA. `onError` do `<img>` é o único sinal que o
     navegador dá, e ele é por ENDEREÇO: trocar a capa precisa devolver o
     benefício da dúvida à imagem nova, senão uma falha antiga condenaria todas
     as seguintes. */
  const [capaQuebrada, setCapaQuebrada] = useState(false);
  useEffect(() => {
    setCapaQuebrada(false);
  }, [capa]);

  /* ── OS DOIS MODOS DA CAPA (Story 3.2) ─────────────────────────────────
     O modo é DERIVADO do endereço, e a escolha explícita só vale enquanto não
     há endereço nenhum. Não é sutileza: a leitura do Post é assíncrona, então
     o formulário nasce vazio e recebe a capa gravada depois. Um modo guardado
     em `useState` ficaria preso ao que valia com o formulário em branco — e
     quem marcasse "Enviar arquivo" nesse instante veria a capa de fora do Post
     chegar e sumir dentro do campo `readOnly`, invisível e ineditável.

     Com endereço na mão, quem manda é o endereço; sem endereço, quem manda é a
     escolha da pessoa. As duas regras cabem numa linha, e é por isso que
     alternar continua funcionando: alternar esvazia o campo do modo de destino,
     e é esse vazio que devolve a palavra à escolha. */
  const [origemEscolhida, setOrigemEscolhida] = useState(null);
  const origem =
    capa === "" ? (origemEscolhida ?? ORIGEM_ENVIADA) : origemDoEndereco(capa, baseDaCapaDoProjeto);
  const deFora = origem === ORIGEM_DE_FORA;

  /* O QUE ESTAVA NO OUTRO MODO — O PAR INTEIRO, e não só o endereço.
     Alternar que apaga o que a pessoa digitou é alternância que ela aprende a
     não usar; alternar que deixa a DESCRIÇÃO da imagem anterior para trás é
     pior, porque não some nada — o texto fica, cola na imagem seguinte, e o
     Post é publicado descrevendo uma foto que ninguém vê. É a mesma razão
     escrita em `removerCapa`, no Editor: descrição órfã de uma imagem que não
     existe mais reapareceria como texto alternativo da próxima capa.

     `ref` e não estado: nada na tela depende disto para desenhar, e o que
     desenha é `valores`, que continua sendo a única verdade. */
  const guardadoPorOrigem = useRef({
    [ORIGEM_ENVIADA]: { url: "", alt: "" },
    [ORIGEM_DE_FORA]: { url: "", alt: "" },
  });
  guardadoPorOrigem.current[origem] = {
    url: enderecoDigitado,
    alt: String(valores.imagem_alt ?? ""),
  };

  const trocarOrigem = (nova) => {
    if (nova === origem) return;
    guardadoPorOrigem.current[origem] = {
      url: enderecoDigitado,
      alt: String(valores.imagem_alt ?? ""),
    };
    setOrigemEscolhida(nova);
    /* A RECUSA VOLTA A ESPERAR. O campo de destino é outro texto, e carregar a
       marca vermelha do anterior acusaria a pessoa de algo que ela não digitou. */
    setEnderecoVisto(false);
    const devolvido = guardadoPorOrigem.current[nova] ?? { url: "", alt: "" };
    if (devolvido.url !== enderecoDigitado) aoMudar?.("imagem_url", devolvido.url);
    if (devolvido.alt !== String(valores.imagem_alt ?? "")) {
      aoMudar?.("imagem_alt", devolvido.alt);
    }
  };

  /* O PROBLEMA DO ENDEREÇO, lido a cada renderização pela regra do DOMÍNIO —
     a mesma que `corpoDoPedido` consulta antes de o pedido sair, que o servidor
     cobra depois e que a restrição do banco espelha em SQL. É isto que faz a
     recusa acontecer ANTES do salvamento, em vez de voltar como violação crua. */
  const problemaNaCapa = problemaNoEnderecoDaImagem(capa);

  /* ─── MAS ELA SÓ APARECE QUANDO A PESSOA TERMINA DE ESCREVER ───────────
     `https://` digitado letra a letra passa por `h`, `ht`, `htt`… e nenhum
     deles é endereço válido. Mostrar a recusa a cada tecla pinta o campo de
     vermelho desde o primeiro caractere de toda digitação bem-sucedida — a
     falha que não é falha, que treina a pessoa a ignorar a recusa que importa.

     O sinal de "terminei" é o campo perder o foco. Digitar de novo devolve o
     benefício da dúvida, e um endereço que já é válido nunca chega aqui. */
  const [enderecoVisto, setEnderecoVisto] = useState(false);
  const recusaDoEnderecoVisivel = deFora && problemaNaCapa !== null && enderecoVisto;

  /* A capa é DESENHÁVEL quando existe e passa no vocabulário: pôr um endereço
     recusado dentro de um `<img>` faria o navegador buscar `javascript:` ou
     `data:` só para descobrir que não presta. */
  const capaDesenhavel = capa !== "" && problemaNaCapa === null;

  /* ─── A SITUAÇÃO DA CAIXA QUE SUBSTITUI A IMAGEM ────────────────────────
     Três, e não duas. "Tem endereço" não é o mesmo que "tem capa": enquanto a
     pessoa digita `h`, `ht`, `htt`… o campo tem endereço e a capa não existe
     ainda, e anunciar "a imagem não carregou" seria contar um fato que não
     aconteceu. Enquanto ela escreve, a caixa diz o que a listagem diria de um
     Post sem capa — e é só quando ela para que a recusa entra. */
  const situacaoDaCapa =
    capaQuebrada && capaDesenhavel
      ? CAPA_QUE_NAO_CARREGOU
      : recusaDoEnderecoVisivel
        ? CAPA_COM_ENDERECO_RECUSADO
        : CAPA_AUSENTE;

  /* O PROBLEMA DA DESCRIÇÃO, lido a cada renderização pela regra do DOMÍNIO —
     a mesma que `corpoDoPedido` consulta antes de o pedido sair e que o
     servidor cobra depois. Ele é `null` enquanto está tudo bem.

     O teto deixou de ser `maxLength` no controle: um campo que simplesmente
     PARA de aceitar texto no caractere 300 não diz nada a quem colou um
     parágrafo — o texto some sem aviso. Agora ele entra, a recusa aparece com
     o motivo certo, e a gravação é que não acontece. */
  const problemaNaDescricao = problemaNoTextoAlternativo(valores.imagem_alt, {
    temCapa: capa !== "",
  });
  /* A RECUSA DO ARQUIVO É DO MODO DE ARQUIVO. Ela ficava na tela depois de a
     pessoa trocar para "informar endereço", falando de um seletor que já não
     estava montado — uma acusação sem controle a que se referir. */
  const envioRecusado =
    !deFora && situacaoDoEnvio === ENVIO_RECUSADO && Boolean(recusaDoEnvio);
  const seletor = useRef(null);

  /* O seletor é REARMADO depois de cada escolha. Sem isso, escolher o mesmo
     arquivo duas vezes seguidas — o caminho normal de "recusou, eu conserto e
     mando de novo" — não dispara evento nenhum, porque o valor do controle não
     mudou, e a tela parece travada. */
  const escolher = (evento) => {
    const arquivo = evento.target.files?.[0] ?? null;
    evento.target.value = "";
    if (arquivo !== null) aoEscolherArquivo?.(arquivo);
  };

  /* ── A Categoria escolhida, com cor e ícone ────────────────────────────
     A gaveta recebe a lista de Categorias da camada de dados, que já traz
     `icone` e `cor` desde a Story 2.2 — e que a versão anterior descartava. */
  const categoriaEscolhida =
    categorias.find((c) => c.id === valores.categoria_id) ?? null;

  /* ── As Tags digitadas ─────────────────────────────────────────────────
     Lidas do TEXTO do campo pela regra do domínio, a cada renderização: é
     barato (uma string curta) e é o que faz o preview e a recusa refletirem o
     que está escrito neste instante. */
  const tagsLidas = separarTags(valores.tags ?? "");
  const tagsRecusadas = tagsLidas.problemas.length > 0;

  /* As já usadas que ainda não estão no campo. Sugerir uma Tag que a pessoa
     acabou de digitar seria oferecer o que ela já tem. */
  const escolhidas = new Set(tagsLidas.nomes.map((n) => chaveDaTag(n)));
  const sugestoes = tags.filter(
    (tag) => typeof tag?.nome === "string" && !escolhidas.has(chaveDaTag(tag.nome)),
  );

  /**
   * Acrescenta uma Tag ao TEXTO do campo, sem apagar o que já está escrito.
   *
   * A versão anterior remontava o campo a partir de `tagsLidas.nomes` — a lista
   * JÁ NORMALIZADA. Com isso, clicar numa sugestão descartava em silêncio o
   * pedaço que estava sendo digitado ("atendi") e a Tag que a separação tinha
   * recusado, e a pessoa via texto sumir por ter clicado noutro lugar. O que se
   * acrescenta é texto ao texto.
   *
   * A vírgula que já está escrita não é reposta: "Atendimento, " seguido de um
   * clique produzia "Atendimento, , Automação", e a lista lida de volta perdia
   * um item para um separador vazio que ninguém digitou.
   */
  const acrescentarTag = (nome) => {
    const atual = String(valores.tags ?? "");
    if (atual.trim() === "") {
      aoMudar?.("tags", nome);
      return;
    }
    /* Terminar em vírgula — com ou sem espaço depois — significa que o
       separador já está posto: o que falta é só o espaço antes do nome. */
    const jaTerminaEmVirgula = /,\s*$/.test(atual);
    const base = jaTerminaEmVirgula
      ? atual.replace(/\s*$/, "")
      : `${atual}${SEPARADOR_DE_TAGS}`;
    aoMudar?.("tags", `${base} ${nome}`);
  };

  return (
    <aside
      aria-label="Metadados do post"
      data-aberta={aberta ? "true" : "false"}
      /* A largura é VALOR, e não classe utilitária: é ela que a verificação lê
         no elemento, do mesmo jeito que o navegador. Ver `gaveta.js`. */
      style={{ width: larguraDaGaveta(aberta) }}
      className={cn(
        "flex min-h-0 flex-col rounded-cartao",
        "border border-border-soft bg-surface",
        aberta ? "gap-4 p-4" : "gap-2 py-2",
        className,
      )}
    >
      {/* ── O controle de recolher e reabrir ───────────────────────────── */}
      <div className={cn("flex shrink-0", aberta ? "justify-end" : "justify-center")}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => aoAlternar?.()}
          aria-label={rotuloDoControle(aberta)}
          aria-expanded={aberta}
          aria-controls={idDosCampos}
          className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO, "shrink-0 text-ink-secondary")}
        >
          {aberta ? (
            <PanelRightClose aria-hidden="true" />
          ) : (
            <PanelRightOpen aria-hidden="true" />
          )}
        </Button>
      </div>

      <div
        id={idDosCampos}
        /* `hidden` e não desmontagem: o alvo de `aria-controls` precisa existir.
           A regra do Tailwind para `[hidden]` é `!important`, então o `flex`
           daqui não a desfaz — foi medido, e é o modo de falha clássico. */
        hidden={!aberta}
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto"
      >
        {/* ── Título ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Rotulo para={idDe("titulo")} obrigatorio>
            Título
          </Rotulo>
          <input
            type="text"
            {...campo("titulo")}
            value={valores.titulo ?? ""}
            onChange={mudar("titulo")}
            placeholder="O título do artigo"
          />
          <Recusa id={idDoErro("titulo")} visivel={falta("titulo")}>
            {FRASES_DE_FALTA.titulo}
          </Recusa>
        </div>

        {/* ── Endereço (Slug) ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Rotulo para={idDe("slug")}>Endereço no site</Rotulo>
          {/* Slug é dado, não prosa: pilha monoespaçada com numeral tabular. */}
          <input
            type="text"
            {...campo("slug", { ajuda: true, recusa: enderecoRecusado, extra: "dado" })}
            value={valores.slug ?? ""}
            onChange={mudar("slug")}
            placeholder="meu-artigo"
          />
          <Recusa id={idDoErro("slug")} visivel={falta("slug") || enderecoRecusado}>
            {falta("slug") ? FRASES_DE_FALTA.slug : problemaNoEndereco}
          </Recusa>
          <p id={idDaAjuda("slug")} className="text-xs text-ink-muted">
            Gerado do título quando o post nasce. Depois disso ele não muda sozinho
            — quem já tem o link continua chegando aqui.
          </p>
        </div>

        {/* ── Resumo ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Rotulo para={idDe("resumo")} obrigatorio>
            Resumo
          </Rotulo>
          <textarea
            rows={3}
            {...campo("resumo", { extra: "resize-y" })}
            value={valores.resumo ?? ""}
            onChange={mudar("resumo")}
            placeholder="A frase que descreve o post na listagem e na busca"
          />
          <Recusa id={idDoErro("resumo")} visivel={falta("resumo")}>
            {FRASES_DE_FALTA.resumo}
          </Recusa>
        </div>

        {/* ── Imagem de capa ───────────────────────────────────────────────
            A capa é CONTEÚDO, e por isso vem depois do Resumo e antes da
            classificação. O campo de descrição vem COLADO nela, e não num
            bloco de acessibilidade no fim do formulário: o banco recusa capa
            sem descrição desde a Story 2.1, e oferecer as duas separadas
            produziria a recusa depois do envio — recusa tarde demais.

            Tudo cabe em 340px: a miniatura ocupa a largura da gaveta com
            proporção fixa, e os dois controles ficam lado a lado abaixo dela.

            ─── O RÓTULO APONTA PARA O CONTROLE QUE A PESSOA OPERA ──────────
            O rótulo "Imagem de capa" nomeia o controle do MODO ATIVO: o seletor
            de arquivo quando se envia, o campo de endereço quando se informa um.
            A primeira versão fazia o contrário: o único controle operável da
            seção — o `input[type=file]`, visualmente escondido e acionado pelo
            botão — ficava sem nome acessível nenhum, e o cabeçalho deste arquivo
            promete rótulo associado para todos os campos.

            ─── DOIS MODOS, UM CAMPO (Story 3.2) ────────────────────────────
            Enviar arquivo ou informar endereço. O que o Post guarda é o mesmo
            nos dois casos — `imagem_url` —, e por isso o modo não é campo do
            formulário: é estado de tela, do vocabulário fechado de `capa.js`.
            Só o controle do modo ATIVO é montado, e o valor do outro fica
            guardado: alternar não pode perder o que a pessoa já tinha. */}
        <div className="flex flex-col gap-1.5" data-papel="campo-da-capa">
          <Rotulo para={idDe(deFora ? "imagem_url" : "arquivo-da-capa")}>
            Imagem de capa
          </Rotulo>

          {/* A ESCOLHA DO MODO. Grupo de rádio nativo: é o controle que diz
              "uma destas duas" sem inventar semântica, cabe em 340px em duas
              linhas, e cada opção ganha nome acessível pelo próprio rótulo que
              a envolve — o vocabulário e as palavras vêm de `capa.js`. */}
          <div
            role="radiogroup"
            aria-label={ROTULO_DA_ORIGEM_DA_CAPA}
            data-papel="origem-da-capa"
            data-origem={origem}
            className="flex flex-wrap gap-x-4 gap-y-1"
          >
            {ORIGENS_DA_CAPA.map((opcao) => (
              <label
                key={opcao}
                className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-secondary"
              >
                <input
                  type="radio"
                  name={idDe("origem-da-capa")}
                  value={opcao}
                  data-origem-da-capa={opcao}
                  checked={origem === opcao}
                  disabled={desabilitado || enviando}
                  onChange={() => trocarOrigem(opcao)}
                  className={cn(ANEL_DE_FOCO, "size-3.5 accent-brand-action")}
                />
                {rotuloDaOrigem(opcao)}
              </label>
            ))}
          </div>

          {/* O ENDEREÇO. No modo de envio ele é `readOnly` e escondido — guarda
              o que o envio devolveu e ninguém o opera, e por isso NÃO carrega
              `data-campo`: aquele atributo é o que a verificação lê para
              conferir a ordem dos campos, e quem representa a capa na ordem é o
              seletor de arquivo.

              No modo de fora ele é o campo: digitável, com rótulo apontando
              para ele e com a recusa colada, e aí `data-campo` é dele. */}
          {deFora ? (
            <>
              <input
                type="url"
                {...campo("imagem_url", {
                  ajuda: true,
                  recusa: recusaDoEnderecoVisivel,
                  extra: "dado",
                })}
                data-valor="imagem_url"
                value={enderecoDigitado}
                onChange={(evento) => {
                  /* DIGITAR DEVOLVE O BENEFÍCIO DA DÚVIDA: a recusa some
                     enquanto a pessoa conserta, e volta quando ela termina. */
                  setEnderecoVisto(false);
                  aoMudar?.("imagem_url", evento.target.value);
                }}
                onBlur={() => setEnderecoVisto(true)}
                disabled={desabilitado || enviando}
                /* O ERRO **E** A AJUDA, e não um ou outro. A ajuda é o que
                   explica que se cola o LINK e não o conteúdo — e colar o
                   conteúdo é a causa comum da recusa, então some exatamente
                   quando é mais útil. A própria frase da recusa de esquema
                   termina dizendo isso; as duas juntas são a explicação inteira. */
                aria-describedby={
                  recusaDoEnderecoVisivel
                    ? `${idDoErro("imagem_url")} ${idDaAjuda("imagem_url")}`
                    : idDaAjuda("imagem_url")
                }
                placeholder="https://exemplo.com/imagem.jpg"
              />
              {/* A RECUSA ANTES DO SALVAMENTO, e ela diz QUAL dos quatro
                  motivos é: teto, caractere fora do vocabulário, esquema, ou
                  site ausente. A frase vem do DOMÍNIO, que também dá o
                  veredito — a gaveta não decide o que é endereço aceitável. */}
              <Recusa id={idDoErro("imagem_url")} visivel={recusaDoEnderecoVisivel}>
                {problemaNaCapa}
              </Recusa>
              <p id={idDaAjuda("imagem_url")} className="text-xs text-ink-muted">
                {ROTULO_DO_ENDERECO_DA_CAPA}: o link direto de uma imagem já
                publicada em outro lugar. Ela não é copiada — o post passa a
                apontar para lá.
              </p>
            </>
          ) : (
            <input
              type="url"
              id={idDe("imagem_url")}
              name="imagem_url"
              data-valor="imagem_url"
              value={capa}
              readOnly
              hidden
            />
          )}

          {/* A MINIATURA, E O QUE OCUPA O LUGAR DELA QUANDO NÃO HÁ IMAGEM.
              Um endereço que não resolve — arquivo removido por fora, host de
              terceiro que saiu do ar, endereço que o vocabulário recusa —
              desenharia o ícone de imagem quebrada e mais nada.

              ─── SEMPRE O MONOGRAMA DA CATEGORIA (Story 3.2) ───────────────
              Nos DOIS ramos: sem capa nenhuma e com capa que não carrega. É o
              mesmo componente que a linha da listagem desenha para o mesmo
              Post — se o Editor mostrasse uma frase e a listagem um monograma,
              o Autor veria duas respostas para a mesma pergunta. E ele não
              quebra o layout, porque ocupa exatamente o espaço que a imagem
              ocuparia. Sem Categoria, o recurso é o mesmo símbolo neutro.

              A FRASE, quando a capa QUEBROU, continua ao lado: ela responde
              outra pergunta. O monograma diz "é assim que este Post aparece sem
              capa"; a frase diz "a capa que você escolheu não existe" — sem ela
              o Autor salvaria um Post com capa morta sem nunca saber. */}
          {capaDesenhavel && !capaQuebrada ? (
            <img
              src={capa}
              alt={alternativoDaMiniatura(valores.imagem_alt)}
              data-papel="miniatura-da-capa"
              /* Endereço de fora não recebe o referenciador: a miniatura do
                 Painel entregaria a um host de terceiro o endereço do Editor. */
              referrerPolicy="no-referrer"
              onError={() => setCapaQuebrada(true)}
              className="aspect-[16/9] w-full rounded-cartao border border-border-soft object-cover"
            />
          ) : (
            <>
              <MonogramaDaCapa
                categoria={categoriaEscolhida?.nome ?? ""}
                papel={
                  situacaoDaCapa === CAPA_AUSENTE ? "capa-ausente" : "capa-degradada"
                }
                /* ELA É ANUNCIADA. Na listagem a caixa é decorativa, porque a
                   linha inteira diz título e Categoria em texto; aqui não há
                   esse texto em volta, e quem usa leitor de tela recebia
                   silêncio no lugar da capa. */
                rotulo={rotuloDaCapaDegradada({
                  categoria: categoriaEscolhida?.nome ?? "",
                  situacao: situacaoDaCapa,
                })}
                classeDoSimbolo="size-8"
                className="aspect-[16/9] w-full rounded-cartao border border-border-soft text-4xl"
              />
              {/* `capaQuebrada`, e não uma condição equivalente por acidente: a
                  frase fala de imagem que FALHOU AO CARREGAR. Endereço que o
                  vocabulário recusa já tem a recusa dele colada ao campo, e
                  dizer as duas coisas seria dois motivos para o mesmo erro. */}
              {situacaoDaCapa === CAPA_QUE_NAO_CARREGOU ? (
                <p
                  data-papel="capa-quebrada"
                  role="alert"
                  className="flex items-start gap-1.5 rounded-cartao border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
                >
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span>{FALA_DA_CAPA_QUEBRADA}</span>
                </p>
              ) : situacaoDaCapa === CAPA_AUSENTE ? (
                <p
                  data-papel="ajuda-da-capa-ausente"
                  className="text-center text-xs text-ink-muted"
                >
                  Sem imagem de capa. O artigo aparece com o monograma da categoria.
                </p>
              ) : null}
            </>
          )}

          {/* A INDICAÇÃO DE PROGRESSO NÃO MENTE. Região viva, sem percentual:
              o que se sabe é "está enviando", e é isso que ela diz. Ver o
              cabeçalho de `capa.js` para por que não há barra medida.

              ─── E ELA NÃO É MONTADA E DESMONTADA ─────────────────────────
              A versão anterior a escondia com `hidden`, e região viva que
              aparece e some é anunciada de forma inconsistente pelos leitores
              de tela — alguns só leem o que MUDA dentro de uma região que já
              estava lá. O elemento fica sempre no documento e o que muda é o
              TEXTO: `falaDoEnvio` devolve `""` quando não há envio, e é essa
              troca de conteúdo que o leitor anuncia. */}
          <p
            data-papel="envio-em-curso"
            role="status"
            aria-live="polite"
            data-enviando={enviando ? "true" : "false"}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium text-ink-secondary",
              enviando ? "" : "sr-only",
            )}
          >
            {enviando ? (
              <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
            ) : null}
            <span>{falaDoEnvio(situacaoDoEnvio)}</span>
          </p>

          {/* OS CONTROLES DO MODO ATIVO. Só um seletor de arquivo é montado
              por vez, e no modo de fora não há nenhum: dois controles
              representando `imagem_url` ao mesmo tempo fariam a ordem dos
              campos da gaveta ter o mesmo nome duas vezes, e a pessoa teria
              dois lugares para dizer a mesma coisa. */}
          <div className="flex flex-wrap items-center gap-2">
            {!deFora ? (
              <>
                <input
                  ref={seletor}
                  type="file"
                  id={idDe("arquivo-da-capa")}
                  data-campo="arquivo-da-capa"
                  /* O `accept` é DERIVADO da lista fechada do domínio. Ele é
                     conveniência do seletor e não garantia: quem arrasta um PDF
                     para dentro dele mesmo assim é recusado pela camada de
                     dados, antes de qualquer rede, e depois pelo bucket. */
                  accept={ACEITO_NO_SELETOR}
                  disabled={desabilitado || enviando}
                  onChange={escolher}
                  aria-invalid={envioRecusado ? "true" : undefined}
                  /* A recusa quando ela existe, a ajuda quando não. O que o
                     leitor de tela precisa ouvir junto do controle é o limite —
                     antes de a pessoa escolher — e o motivo — depois de errar. */
                  aria-describedby={
                    envioRecusado ? idDoErro("arquivo-da-capa") : idDaAjuda("imagem_url")
                  }
                  className="sr-only"
                />
                {/* `data-acao-da-capa`, e NÃO `data-acao`: aquele atributo é o
                    vocabulário FECHADO das ações da máquina de transições,
                    contado pela verificação para cobrar que a barra ofereça
                    exatamente o que o Estado declara. Escolher e trocar imagem
                    não são transições — usá-lo aqui faria "Escolher imagem" ser
                    lida como uma ação de Estado, e a asserção acusou na primeira
                    execução. */}
                <Button
                  type="button"
                  variant="outline"
                  data-acao-da-capa="escolher"
                  disabled={desabilitado || enviando}
                  onClick={() => seletor.current?.click()}
                  className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2")}
                >
                  <ImagePlus aria-hidden="true" className="size-4" />
                  {rotuloDoSeletor(capa !== "")}
                </Button>
              </>
            ) : null}
            {capa !== "" ? (
              <Button
                type="button"
                variant="ghost"
                data-acao-da-capa="remover"
                disabled={desabilitado || enviando}
                onClick={() => aoRemoverCapa?.()}
                className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2 text-ink-secondary")}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {ROTULO_DE_REMOVER_CAPA}
              </Button>
            ) : null}
          </div>

          {/* A RECUSA DO ENVIO. Sempre montada, como as outras — ela é o alvo
              de `aria-describedby` do seletor, e alvo ausente é anunciado como
              nada. A frase vem pronta de quem recusou; a gaveta não a monta,
              porque quem sabe o limite é o vocabulário do domínio. */}
          <Recusa id={idDoErro("arquivo-da-capa")} visivel={envioRecusado}>
            {recusaDoEnvio}
          </Recusa>

          {/* A AJUDA DO ENVIO só existe no modo de envio — ela é o alvo de
              `aria-describedby` do seletor, e o modo de fora tem a sua própria,
              com o mesmo identificador. Manter as duas montadas produziria
              `id` repetido, e um alvo de descrição ambíguo. */}
          {!deFora ? (
            <p id={idDaAjuda("imagem_url")} className="text-xs text-ink-muted">
              {ROTULOS_DE_IMAGEM.join(", ")} até{" "}
              <span className="dado">{formatarTamanho(TAMANHO_MAXIMO_DA_IMAGEM)}</span>.
            </p>
          ) : null}
        </div>

        {/* ── Descrição da imagem ──────────────────────────────────────────
            OFERECIDA JUNTO DA IMAGEM, e não em outro lugar do formulário. O
            banco recusa capa sem descrição (`posts_imagem_exige_alt`, Story
            2.1), então perguntá-la depois seria descobrir a falta no
            salvamento — depois de o megabyte ter subido. */}
        <div className="flex flex-col gap-1.5">
          <Rotulo para={idDe("imagem_alt")} obrigatorio={capa !== ""}>
            Descrição da imagem
          </Rotulo>
          <textarea
            rows={2}
            {...campo("imagem_alt", {
              ajuda: true,
              recusa: problemaNaDescricao !== null,
              extra: "resize-y",
            })}
            value={valores.imagem_alt ?? ""}
            onChange={mudar("imagem_alt")}
            placeholder="O que a imagem mostra, em uma frase"
          />
          {/* A RECUSA DIZ QUAL DOS DOIS MOTIVOS É. `problemaNoTextoAlternativo`
              tem duas saídas — falta e teto —, e a versão anterior mostrava
              sempre a primeira: uma descrição longa demais era acusada de
              "precisa de uma descrição", com o campo cheio de texto na frente
              da pessoa. A frase vem da MESMA função que o pedido consulta. */}
          <Recusa
            id={idDoErro("imagem_alt")}
            visivel={falta("imagem_alt") || problemaNaDescricao !== null}
          >
            {problemaNaDescricao ?? FRASES_DE_FALTA.imagem_alt}
          </Recusa>
          <p id={idDaAjuda("imagem_alt")} className="text-xs text-ink-muted">
            É o que quem não enxerga a imagem recebe no lugar dela. Obrigatória
            quando há capa, até{" "}
            <span className="dado">{TAMANHO_MAXIMO_DO_ALTERNATIVO}</span>{" "}
            caracteres.
          </p>
        </div>

        {/* ── Categoria ────────────────────────────────────────────────────
            O menu continua nativo — ele é o controle que cabe em 340px e que
            quem navega por teclado já sabe operar —, e ao lado dele a Categoria
            escolhida aparece COM COR E ÍCONE. `icone` e `cor` já chegavam da
            camada de dados desde a Story 2.2 e eram descartados aqui.

            A cor vai por `style`, do vocabulário fechado do domínio; o ícone é
            chave de um mapa fechado no código. Nenhuma classe do Tailwind é
            montada em tempo de execução — ela não existiria no CSS compilado. */}
        <div className="flex flex-col gap-1.5">
          <Rotulo para={idDe("categoria_id")}>Categoria</Rotulo>
          <select
            {...campo("categoria_id")}
            value={valores.categoria_id ?? ""}
            onChange={mudar("categoria_id")}
          >
            <option value="">Sem categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
          {categoriaEscolhida !== null ? (
            <PilulaDeCategoria
              categoria={categoriaEscolhida}
              className="self-start"
            />
          ) : null}
        </div>

        {/* ── Tags ─────────────────────────────────────────────────────────
            DIGITADAS, separadas por vírgula (Story 2.14). O menu múltiplo que
            vivia aqui só deixava escolher entre as que já existiam, e a ajuda
            dizia "Segure Ctrl" — que não é entrada de texto, não existe no
            celular e não permite criar tag nenhuma.

            O campo guarda TEXTO. Normalizar a cada tecla impediria de digitar a
            vírgula que separa a próxima tag; quem transforma texto em lista é
            `separarTags`, do domínio — a MESMA função que o servidor usa. */}
        <div className="flex flex-col gap-1.5">
          <Rotulo para={idDe("tags")}>Tags</Rotulo>
          <input
            type="text"
            {...campo("tags", { ajuda: true, recusa: tagsRecusadas })}
            value={valores.tags ?? ""}
            onChange={mudar("tags")}
            placeholder="atendimento, automação"
          />
          <Recusa id={idDoErro("tags")} visivel={tagsRecusadas}>
            {tagsLidas.problemas.join(" ")}
          </Recusa>

          {/* O QUE VAI SER GRAVADO, mostrado enquanto se digita: é aqui que a
              pessoa vê a repetida colapsar e o espaço sobrando sumir, antes de
              salvar em vez de depois. */}
          {tagsLidas.nomes.length > 0 ? (
            <ul data-papel="tags-lidas" className="flex flex-wrap gap-1.5">
              {tagsLidas.nomes.map((nome) => (
                <li
                  key={nome}
                  data-tag={nome}
                  className="rounded-pilula bg-surface-sunk px-2 py-0.5 text-xs font-medium text-ink-secondary"
                >
                  {nome}
                </li>
              ))}
            </ul>
          ) : null}

          {/* AS JÁ USADAS SÃO SUGERIDAS. Não é uma lista fechada: ela existe
              para reaproveitar em vez de recriar com outra grafia — digitar uma
              tag nova continua sendo o caminho normal. */}
          {sugestoes.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-ink-muted">Já usadas</p>
              <div data-papel="sugestoes-de-tag" className="flex flex-wrap gap-1.5">
                {sugestoes.map((tag) => (
                  <button
                    key={tag.id ?? tag.nome}
                    type="button"
                    data-sugestao={tag.nome}
                    disabled={desabilitado}
                    aria-label={`Acrescentar a tag ${tag.nome}`}
                    onClick={() => acrescentarTag(tag.nome)}
                    className={cn(
                      ANEL_DE_FOCO,
                      "rounded-pilula border border-border-soft px-2 py-0.5",
                      "text-xs font-medium text-ink-secondary",
                      "transition-colors hover:border-border-strong hover:text-ink",
                      "disabled:pointer-events-none disabled:opacity-60",
                    )}
                  >
                    {tag.nome}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <p id={idDaAjuda("tags")} className="text-xs text-ink-muted">
            Separe por vírgula, até {LIMITE_DE_TAGS}. Tag que já existe é
            reaproveitada; tag nova é criada ao salvar.
          </p>
        </div>

        {/* ── Data de Publicação ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Rotulo para={idDe("publicado_em")}>Data de publicação</Rotulo>
          <input
            type="datetime-local"
            {...campo("publicado_em", { ajuda: true, extra: "dado" })}
            value={valores.publicado_em ?? ""}
            onChange={mudar("publicado_em")}
          />
          {/* A marca de recusa precisa ter O QUE dizer: `aria-invalid` sozinho
              anuncia "inválido" e nada mais, e o `aria-describedby` do campo
              apontava para um parágrafo que não existia. */}
          <Recusa id={idDoErro("publicado_em")} visivel={falta("publicado_em")}>
            {FRASES_DE_FALTA.publicado_em}
          </Recusa>
          {/* O instante é gravado em UTC; o que se lê e o que se digita é a hora de
              Brasília. Dizer o fuso por extenso é o que impede alguém de agendar
              00h30 achando que agendou no fuso do próprio navegador. */}
          <p id={idDaAjuda("publicado_em")} className="text-xs text-ink-muted">
            Horário de Brasília{" "}
            <span className="dado" data-papel="data-em-sao-paulo">
              {textoDaDataDoCampo(valores.publicado_em)}
            </span>
          </p>
        </div>

        {/* ── Tempo de leitura ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5">
          <Rotulo para={idDe("tempo_leitura")}>Tempo de leitura (minutos)</Rotulo>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            {...campo("tempo_leitura", { extra: "dado" })}
            value={valores.tempo_leitura ?? ""}
            onChange={mudar("tempo_leitura")}
            placeholder="5"
          />
        </div>
      </div>
    </aside>
  );
}

/**
 * O rótulo, com a obrigatoriedade dita por extenso.
 *
 * Um asterisco vermelho é convenção de formulário, não informação: quem não
 * conhece a convenção, ou não distingue a cor, não recebe nada. A palavra
 * entre parênteses é lida pelo leitor de tela junto do nome do campo.
 */
function Rotulo({ para, obrigatorio = false, children }) {
  return (
    <label
      htmlFor={para}
      className="flex items-center gap-1.5 text-sm font-semibold text-ink"
    >
      {children}
      {obrigatorio ? (
        <span className="text-xs font-medium text-ink-muted">(obrigatório)</span>
      ) : null}
    </label>
  );
}

/**
 * A recusa de um campo.
 *
 * Fica **sempre montada** e some pelo conteúdo, não pela montagem condicional: o
 * `aria-describedby` do campo aponta para este `id`, e um alvo que não existe no
 * documento é anunciado como nada — a mensagem apareceria na tela e não no
 * leitor.
 */
function Recusa({ id, visivel, children }) {
  return (
    <p
      id={id}
      role={visivel ? "alert" : undefined}
      hidden={!visivel}
      className="flex items-start gap-1.5 text-xs font-medium text-destructive"
    >
      {visivel ? (
        <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      ) : null}
      <span>{children}</span>
    </p>
  );
}
