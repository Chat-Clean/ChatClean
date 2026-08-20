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
  FALA_DA_CAPA_QUEBRADA,
  ROTULO_DE_REMOVER_CAPA,
  alternativoDaMiniatura,
  falaDoEnvio,
  rotuloDoSeletor,
} from "@/admin/blog/capa";
/* O vocabulário do arquivo vem do DOMÍNIO: o `accept` do seletor é DERIVADO da
   mesma lista fechada que a camada de dados usa para recusar e que o bucket
   aplica. Escrevê-lo à mão aqui faria o seletor oferecer o que o envio recusa. */
import {
  ACEITO_NO_SELETOR,
  ROTULOS_DE_IMAGEM,
  TAMANHO_MAXIMO_DA_IMAGEM,
  TAMANHO_MAXIMO_DO_ALTERNATIVO,
  formatarTamanho,
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
  const enviando = situacaoDoEnvio === ENVIO_EM_CURSO;

  /* A CAPA QUE NÃO CARREGA. `onError` do `<img>` é o único sinal que o
     navegador dá, e ele é por ENDEREÇO: trocar a capa precisa devolver o
     benefício da dúvida à imagem nova, senão uma falha antiga condenaria todas
     as seguintes. */
  const [capaQuebrada, setCapaQuebrada] = useState(false);
  useEffect(() => {
    setCapaQuebrada(false);
  }, [capa]);

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
  const envioRecusado = situacaoDoEnvio === ENVIO_RECUSADO && Boolean(recusaDoEnvio);
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
            O rótulo "Imagem de capa" nomeia o SELETOR DE ARQUIVO, e não o
            campo escondido do endereço. A primeira versão fazia o contrário: o
            único controle operável da seção — o `input[type=file]`, visualmente
            escondido e acionado pelo botão — ficava sem nome acessível
            nenhum, e o cabeçalho deste arquivo promete rótulo associado para
            todos os campos. Quem navega por leitor de tela ouvia "botão para
            escolher arquivo" e nada mais. */}
        <div className="flex flex-col gap-1.5" data-papel="campo-da-capa">
          <Rotulo para={idDe("arquivo-da-capa")}>Imagem de capa</Rotulo>

          {/* O ENDEREÇO NÃO É DIGITÁVEL nesta story. O campo existe, guarda o
              que o envio devolveu e é `readOnly`: imagem por endereço externo é
              a Story 3.2, e um campo de texto aberto aqui aceitaria endereço de
              fora que o servidor recusaria em seguida.

              Ele fica escondido do desenho e presente no documento, e por isso
              NÃO carrega `data-campo`: aquele atributo é o que a verificação lê
              para conferir a ordem dos campos da gaveta, e um controle que
              ninguém opera não é um campo do formulário. Quem representa a capa
              na ordem é o seletor. */}
          <input
            type="url"
            id={idDe("imagem_url")}
            name="imagem_url"
            data-valor="imagem_url"
            value={capa}
            readOnly
            hidden
          />

          {/* A MINIATURA, E O QUE ACONTECE QUANDO O ARQUIVO SUMIU.
              Um endereço que não resolve mais — arquivo removido por fora,
              bucket trocado — desenharia o ícone de imagem quebrada e mais
              nada, e o Autor salvaria um Post cuja capa não existe achando que
              ela está lá. `onError` troca a miniatura por uma frase que diz o
              que houve e o que fazer. */}
          {capa !== "" && !capaQuebrada ? (
            <img
              src={capa}
              alt={alternativoDaMiniatura(valores.imagem_alt)}
              data-papel="miniatura-da-capa"
              onError={() => setCapaQuebrada(true)}
              className="aspect-[16/9] w-full rounded-cartao border border-border-soft object-cover"
            />
          ) : capa !== "" ? (
            <p
              data-papel="capa-quebrada"
              role="alert"
              className="flex items-start gap-1.5 rounded-cartao border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>{FALA_DA_CAPA_QUEBRADA}</span>
            </p>
          ) : (
            <p
              data-papel="capa-ausente"
              className="rounded-cartao border border-dashed border-border-soft px-3 py-4 text-center text-xs text-ink-muted"
            >
              Sem imagem de capa. O artigo aparece com o monograma da categoria.
            </p>
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

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={seletor}
              type="file"
              id={idDe("arquivo-da-capa")}
              data-campo="arquivo-da-capa"
              /* O `accept` é DERIVADO da lista fechada do domínio. Ele é
                 conveniência do seletor e não garantia: quem arrasta um PDF
                 para dentro dele mesmo assim é recusado pela camada de dados,
                 antes de qualquer rede, e depois pelo próprio bucket. */
              accept={ACEITO_NO_SELETOR}
              disabled={desabilitado || enviando}
              onChange={escolher}
              aria-invalid={envioRecusado ? "true" : undefined}
              /* A recusa quando ela existe, a ajuda quando não. O que o leitor
                 de tela precisa ouvir junto do controle é o limite — antes de a
                 pessoa escolher — e o motivo — depois de ela errar. */
              aria-describedby={
                envioRecusado ? idDoErro("arquivo-da-capa") : idDaAjuda("imagem_url")
              }
              className="sr-only"
            />
            {/* `data-acao-da-capa`, e NÃO `data-acao`: aquele atributo é o
                vocabulário FECHADO das ações da máquina de transições, contado
                pela verificação para cobrar que a barra ofereça exatamente o
                que o Estado declara. Escolher e trocar imagem não são
                transições — usá-lo aqui faria "Escolher imagem" ser lida como
                uma ação de Estado, e a asserção acusou na primeira execução. */}
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

          <p id={idDaAjuda("imagem_url")} className="text-xs text-ink-muted">
            {ROTULOS_DE_IMAGEM.join(", ")} até{" "}
            <span className="dado">{formatarTamanho(TAMANHO_MAXIMO_DA_IMAGEM)}</span>.
          </p>
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
