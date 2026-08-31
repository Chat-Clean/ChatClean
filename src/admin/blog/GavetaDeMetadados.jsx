/**
 * A gaveta de metadados do Post — o que descreve o Post, ao lado do que ele diz.
 *
 * Onze campos: Título, Slug, Resumo, Imagem de capa, Descrição da imagem,
 * Categoria, Tags, tempo de leitura e — na seção de SEO — Título SEO, Meta
 * Descrição e Imagem de Compartilhamento. Cada um com **rótulo associado** —
 * `<label for>` ligado ao `id` do controle, e não um texto solto acima dele:
 * sem a associação, quem navega por leitor de tela ouve "caixa de edição"
 * onze vezes seguidas e precisa adivinhar qual é qual.
 *
 * ─── A DATA DE PUBLICAÇÃO SAIU DAQUI (correção de UI/UX do Editor) ─────────
 *
 * Ela era redundante com o botão "Agendar publicação" da tela: os dois
 * cobravam o mesmo dado, e o botão não abria nada — só reclamava do campo de
 * novo. Agora só existe um lugar para informar a data: o modal que o botão
 * abre, em `EditorDePost.jsx`. Esta gaveta não conhece mais `publicado_em`.
 *
 * ─── A SEÇÃO DE SEO, DEPOIS DA STORY 3.4 ───────────────────────────────────
 *
 * Os três campos de SEO são OPCIONAIS, e opcional aqui tem o sentido forte:
 * vazio não é falta, vazio **herda** — o título do Post, o Resumo, a Imagem de
 * Capa. E a gaveta **mostra o que será herdado** embaixo de cada campo em
 * branco: um rótulo dizendo "opcional" não conta o que vai acontecer, e o Autor
 * teria de publicar e ir olhar.
 *
 * Quem decide a herança é `metadadosDoPost`, em `domain/blog/compartilhamento`
 * — a MESMA função que a Prévia (Story 3.5) e o emissor de metadado do Épico 4
 * chamam. A gaveta não tem opinião sobre isso, e é essa identidade que sustenta
 * a promessa de "o que você vê é o que o WhatsApp mostra".
 *
 * O contador de caractere **sinaliza** o comprimento usual e nunca bloqueia
 * nem trunca: não há `maxLength` em campo nenhum desta gaveta, pela decisão que
 * a Story 3.1 tomou e escreveu. O número que recusa é outro, muito maior, e é
 * o teto de higiene do domínio.
 *
 * ─── E A PRÉVIA, DEPOIS DA STORY 3.5 ───────────────────────────────────────
 *
 * A seção abre com o **Cartão de Compartilhamento**: a imagem, o título e a
 * descrição EFETIVOS — os próprios ou os herdados, a Imagem Padrão do Site
 * incluída —, atualizados a cada tecla. Ele recebe o resultado que a gaveta já
 * calculou, e não os valores do formulário: a tradução acontece UMA vez, e um
 * segundo tradutor faria o cartão mostrar um Post que não é o que está sendo
 * editado.
 *
 * Ele não se chama "pré-visualização": esse nome é da tela da Story 2.13, que
 * mostra o TEXTO como o leitor verá. Duas coisas diferentes com o mesmo nome é
 * o sinônimo que a convenção proíbe.
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
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ImagePlus,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
} from "lucide-react";

import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { FRASES_DE_FALTA } from "@/admin/blog/metadados";
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
  NOME_DA_CAPA,
  ORIGENS_DA_CAPA,
  ORIGEM_DE_FORA,
  ORIGEM_ENVIADA,
  ROTULO_DE_REMOVER_CAPA,
  ROTULO_DO_ENDERECO_DA_CAPA,
  alternativoDaMiniatura,
  falaDaImagemQuebrada,
  falaDoEnvio,
  origemDoEndereco,
  papeisDoCampoDeImagem,
  rotuloDaCapaDegradada,
  rotuloDaOrigem,
  rotuloDoGrupoDeOrigem,
  rotuloDoSeletor,
} from "@/admin/blog/capa";
/* A SEÇÃO DE SEO (Story 3.4): o contador que sinaliza e as frases da herança.
   O que decide a herança é `metadadosDoPost`, do DOMÍNIO — `seo.js` só a chama
   e traduz o resultado em frase. Nenhum `seo_titulo || titulo` mora aqui. */
import {
  ROTULOS_DE_SEO,
  acimaDoUsual,
  avisoDeComprimento,
  falaDaHeranca,
  herancaDoFormulario,
  recusaDaCadeia,
  textoDoContador,
} from "@/admin/blog/seo";
import {
  CAMPOS_DE_TEXTO_DE_SEO,
  CAMPO_DE_IMAGEM_DE_SEO,
  problemaNoTextoDeSeo,
} from "@/domain/blog/compartilhamento";
/* A CAIXA DO MONOGRAMA é o COMPONENTE que a linha da listagem também desenha —
   não uma caixa parecida montada aqui. É o que faz "Editor e listagem mostram a
   mesma coisa para o mesmo Post" ser estrutura, e não coincidência. */
import MonogramaDaCapa from "@/admin/blog/MonogramaDaCapa";
/* A PRÉVIA (Story 3.5): o cartão como o link aparece ao ser compartilhado. Ele
   lê SÓ o retorno da função de herança — o mesmo objeto que a seção de SEO usa
   para contar o que será herdado —, e não decide nada por conta própria. */
import CartaoDeCompartilhamento from "@/admin/blog/CartaoDeCompartilhamento";
/* O vocabulário do arquivo vem do DOMÍNIO: o `accept` do seletor é DERIVADO da
   mesma lista fechada que a camada de dados usa para recusar e que o bucket
   aplica. Escrevê-lo à mão aqui faria o seletor oferecer o que o envio recusa. */
import {
  ACEITO_NO_SELETOR,
  ROTULOS_DE_IMAGEM,
  ROTULO_DA_CAPA,
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
     sozinha pela verificação justamente porque ela não tem.

     ─── UM POR CAMPO, DESDE A STORY 3.4 ────────────────────────────────
     A gaveta tem DOIS controles de imagem — a Capa e a Imagem de
     Compartilhamento —, e os dois podem estar em situações diferentes ao
     mesmo tempo. Uma situação só, compartilhada, faria o giro do envio de um
     aparecer sobre o outro, e a recusa de um acusar o campo errado.
     `{ [campo]: { situacao, recusa } }`; campo ausente é "parado". */
  envios = {},
  /* A RAIZ DO NOSSO PROJETO, para saber se um endereço gravado é uma capa
     nossa — e só para isso. Ela decide em que modo o campo de capa abre, e
     nunca remoção de arquivo. `""` (o padrão, e o que a gaveta montada sozinha
     recebe) significa "não sei", e "não sei" abre no modo de endereço, que é o
     que mostra o valor em vez de escondê-lo. */
  baseDaCapaDoProjeto = "",
  /* O DOMÍNIO CANÔNICO, para a seção de SEO poder mostrar O QUE SERÁ HERDADO
     (Story 3.4). Ele não é adivinhado aqui: quem monta a tela é que sabe de
     onde o site é servido. `""` é "não sei", e "não sei" faz a seção mostrar o
     defeito de montagem NOMEADO em vez de uma herança inventada — ver
     `herancaDoFormulario`, em `admin/blog/seo.js`. */
  dominioDoSite = "",
  aoEscolherArquivo,
  aoRemoverImagem,
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

  /* Quem pediu para o sistema parar de animar não recebe o pulo do controle.
     A regra global de `index.css` zera DURAÇÃO de transição e de animação CSS,
     e não alcança mola de Framer Motion — que é JavaScript, e continuaria
     pulando com a preferência ligada. */
  const semMovimento = useReducedMotion();

  /* ─── O QUIQUE MUDOU DE LUGAR: DO BOTÃO PARA O CARTÃO INTEIRO ────────────
     Antes era `whileTap` no botão — reação ao toque, não ao efeito. Agora é
     o CARTÃO inteiro que quica quando `aberta` VIRA, e não quando alguém
     aperta.

     É CSS PURO — `@keyframes` em `index.css`, não mola de Framer Motion. A
     primeira versão usava `useAnimationControls` (o motor de animação por
     JavaScript do Framer Motion, movido a `requestAnimationFrame`), e a
     verificação do Editor PASSAVA — mas o processo do Node não terminava
     sozinho depois: o motor por JS deixa um relógio pendurado no `jsdom`
     quando a janela de teste nunca é fechada de verdade, e como o gatilho
     agora é uma MUDANÇA DE ESTADO (não um gesto), ele dispara de verdade a
     cada clique do teste — ao contrário do `whileTap` de antes, que nunca
     chegava a rodar sob um clique sintético. Uma animação CSS não tem esse
     problema: não existe relógio de JavaScript para ficar pendurado.

     `quicando` liga a classe por 430ms e desliga sozinho — o mesmo tempo da
     animação declarada em `index.css`. A LARGURA não é tocada por ela:
     `style={{ width }}`, no `<aside>` abaixo, continua sendo o VALOR que a
     verificação lê (documentado em `gaveta.js`), e a classe anima só
     `transform`, que não mexe em layout nem em `style.width`. */
  const [quicando, setQuicando] = useState(false);
  const primeiraRenderizacao = useRef(true);
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    if (semMovimento) return;
    setQuicando(true);
    const relogio = setTimeout(() => setQuicando(false), 430);
    return () => clearTimeout(relogio);
  }, [aberta, semMovimento]);

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

  /* ── O QUE É COMUM AOS DOIS CAMPOS DE IMAGEM (Story 3.4) ──────────────
     O controle de imagem — as duas origens, a miniatura, a degradação para o
     monograma, o progresso e a recusa — mora em `CampoDeImagem`, no fim deste
     arquivo, e a gaveta o desenha DUAS vezes: para a Capa e para a Imagem de
     Compartilhamento. Ele é componente, e não um trecho repetido, porque cada
     um dos dois tem estado próprio (o modo escolhido, o benefício da dúvida do
     endereço, a imagem que não carregou) — e um estado compartilhado faria a
     falha de um contaminar o outro.

     `capa` continua aqui porque a DESCRIÇÃO da imagem depende dela: o banco
     recusa capa sem descrição, e é a gaveta que decide se aquele campo é
     obrigatório agora. */
  const capa = String(valores.imagem_url ?? "").trim();

  /* O PROBLEMA DA DESCRIÇÃO, lido a cada renderização pela regra do DOMÍNIO —
     a mesma que `corpoDoPedido` consulta antes de o pedido sair e que o
     servidor cobra depois. Ele é `null` enquanto está tudo bem.

     O teto deixou de ser `maxLength` no controle: um campo que simplesmente
     PARA de aceitar texto no caractere 300 não diz nada a quem colou um
     parágrafo — o texto some sem aviso. Agora ele entra, a recusa aparece com
     o motivo certo, e a gravação é que não acontece. É a MESMA decisão que o
     contador de SEO herda: sinalizar, nunca cortar. */
  const problemaNaDescricao = problemaNoTextoAlternativo(valores.imagem_alt, {
    temCapa: capa !== "",
  });

  /** O andaime dos campos, entregue de uma vez a quem desenha um pedaço. */
  const andaime = { idDe, idDoErro, idDaAjuda, campo, desabilitado };

  /* ── O QUE SERÁ HERDADO (Story 3.4) ────────────────────────────────────
     Calculado sobre o que está no FORMULÁRIO agora, e não sobre o Post
     gravado: quem olha para a seção de SEO está justamente decidindo se
     preenche, e a herança precisa refletir o título que ele acabou de digitar.

     Quem decide é `metadadosDoPost`, do domínio, e nenhuma linha desta gaveta
     opina sobre isso. O defeito de montagem — o Domínio Canônico que não
     chegou — vira uma frase DESENHADA na seção, e não uma exceção que derruba
     a gaveta inteira nem um silêncio. */
  /* UMA CHAMADA, DOIS CONSUMIDORES. O Cartão de Compartilhamento (Story 3.5)
     lê ESTE mesmo resultado — não o formulário. Chamar `herancaDoFormulario`
     de novo lá dentro ainda usaria a mesma tradução, mas abriria a porta para
     o dia em que alguém passasse outros valores para um dos dois; com uma
     chamada só, o cartão mostra por construção o Post que está sendo editado. */
  const heranca = herancaDoFormulario(valores, { dominio: dominioDoSite });
  const metadadosDaHeranca = heranca.ok ? heranca.metadados : null;

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
         no elemento, do mesmo jeito que o navegador. Ver `gaveta.js`. Fica de
         fora do quique de propósito: a classe abaixo anima só `transform`, e a
         largura pula de um valor para o outro sem transição, como sempre foi. */
      style={{ width: larguraDaGaveta(aberta) }}
      className={cn(
        "flex min-h-0 flex-col rounded-cartao",
        "border border-border-soft bg-surface",
        quicando && "quique-do-cartao",
        /* O PADDING VERTICAL É O MESMO NOS DOIS ESTADOS, e isso não é gosto:
           era `p-4` aberta e `py-2` recolhida, então o controle de recolher
           subia 8px no instante em que a gaveta fechava. O ícone é o MESMO
           alvo antes e depois — quem acabou de clicar nele precisa encontrá-lo
           onde clicou, para reabrir sem procurar. Só o padding HORIZONTAL
           muda, porque recolhida a gaveta é um trilho de 46px e 16px de cada
           lado não caberiam. */
        aberta ? "gap-4 p-4" : "gap-2 py-4",
        className,
      )}
    >
      {/* ── O controle de recolher e reabrir ─────────────────────────────
          O quique SAIU daqui — agora é o `<aside>` inteiro que reage à troca
          de `aberta` (ver `quicando`, acima). O que resta aqui é só a troca
          do ÍCONE, uma animação diferente: entrada em mola a
          cada troca de desenho, não um pulo de toque. */}
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
          {/* O ícone TROCA quando o estado vira, e a `key` é o que faz a
              mola rodar de novo a cada troca: sem ela o React reaproveita o
              mesmo nó, o desenho muda no meio do movimento e não há entrada
              nenhuma para animar. */}
          <motion.span
            key={aberta ? "aberta" : "recolhida"}
            initial={semMovimento ? false : { scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 620, damping: 12 }}
            className="inline-flex"
          >
            {aberta ? (
              <PanelRightClose aria-hidden="true" />
            ) : (
              <PanelRightOpen aria-hidden="true" />
            )}
          </motion.span>
        </Button>
      </div>

      <div
        id={idDosCampos}
        /* `hidden` e não desmontagem: o alvo de `aria-controls` precisa existir.
           A regra do Tailwind para `[hidden]` é `!important`, então o `flex`
           daqui não a desfaz — foi medido, e é o modo de falha clássico. */
        hidden={!aberta}
        /* `px-1 -mx-1`: a caixa que rola só declarava `overflow-y-auto`, e por
           especificação CSS isso faz o navegador computar `overflow-x: auto`
           também — a caixa passa a CLIPAR o anel de foco (`ring-offset-2` +
           `ring-2`, 4px além do campo) bem na própria borda de padding. O
           padding devolve a folga que faltava; a margem negativa da mesma
           medida repõe os campos no lugar exato de antes — nada realinha. */
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1 -mx-1"
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
            Gerado do título quando o post nasce. Depois disso ele não muda sozinho,
            quem já tem o link continua chegando aqui.
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

            ─── O CONTROLE VIROU COMPONENTE (Story 3.4) ─────────────────────
            O mesmo controle desenha a Imagem de Compartilhamento, lá embaixo,
            na seção de SEO. Copiá-lo teria sido mais rápido e teria produzido
            duas maneiras de dizer a mesma coisa na mesma gaveta — que é a
            definição de sinônimo, e o que a convenção do projeto proíbe. */}
        <CampoDeImagem
          campo="imagem_url"
          rotulo={ROTULO_DA_CAPA}
          nome={NOME_DA_CAPA}
          papel="campo-da-capa"
          valor={valores.imagem_url}
          descricao={valores.imagem_alt}
          campoDaDescricao="imagem_alt"
          categoria={categoriaEscolhida?.nome ?? ""}
          base={baseDaCapaDoProjeto}
          envio={envios.imagem_url}
          andaime={andaime}
          aoMudar={aoMudar}
          aoEscolherArquivo={aoEscolherArquivo}
          aoRemoverImagem={aoRemoverImagem}
        />

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

        {/* ── SEO: como o post aparece na busca e no compartilhamento ──────
            (Story 3.4)

            SEÇÃO PRÓPRIA, e no fim: estes três não descrevem o Post, descrevem
            como ele APARECE fora do site. Os três são opcionais, e opcional
            aqui tem o sentido forte — vazio não é falta, vazio HERDA.

            ─── E A HERANÇA É MOSTRADA, NÃO PROMETIDA ───────────────────────
            Um campo vazio com um rótulo dizendo "opcional" não conta ao Autor o
            que vai acontecer se ele não preencher: ele precisaria publicar e ir
            olhar. Embaixo de cada campo em branco fica o valor que será usado,
            e quem o decide é `metadadosDoPost`, do domínio — a MESMA função que
            a Prévia da Story 3.5 e o emissor de metadado do Épico 4 chamam.
            Uma segunda opinião aqui apareceria como a Prévia mostrando uma
            coisa e o WhatsApp mostrando outra. */}
        <section
          data-papel="secao-de-seo"
          aria-labelledby={idDe("titulo-da-secao-de-seo")}
          className="flex flex-col gap-5 border-t border-border-soft pt-5"
        >
          <div className="flex flex-col gap-1">
            <h3
              id={idDe("titulo-da-secao-de-seo")}
              className="text-sm font-semibold text-ink"
            >
              Busca e compartilhamento
            </h3>
            <p className="text-xs text-ink-muted">
              Os três são opcionais. Em branco, o post usa o título, o resumo e a
              imagem de capa que estão aí em cima.
            </p>
          </div>

          {/* ── A PRÉVIA (Story 3.5) ─────────────────────────────────────
              O cartão como o link vai aparecer, com os TRÊS valores efetivos —
              os próprios ou os herdados, a Imagem Padrão do Site incluída. Ele
              vem ANTES dos campos porque é a resposta à pergunta que traz o
              Autor até aqui; os campos abaixo são como se muda a resposta.

              Ele recebe o resultado JÁ DECIDIDO, e não os valores: a tradução
              do formulário para a forma que o domínio lê acontece uma vez, e um
              segundo tradutor divergiria no primeiro campo novo — que é o
              defeito que esta story existe para não ter.

              O DEFEITO DE MONTAGEM — o Domínio Canônico que não chegou — é dito
              LÁ DENTRO, e não aqui: quem não pode virar cartão em branco é o
              cartão, e dizê-lo em dois lugares seria duas vozes para o mesmo
              fato. O nome do elemento (`heranca-indisponivel`) é o mesmo da
              Story 3.4, porque é contrato de tela e não simetria de string. */}
          <CartaoDeCompartilhamento
            heranca={heranca}
            categoria={categoriaEscolhida?.nome ?? ""}
            id={idDe("titulo-do-cartao")}
          />

          {/* OS DOIS DE TEXTO, NA ORDEM DO DOMÍNIO. `CAMPOS_DE_TEXTO_DE_SEO` é
              a mesma lista que a porta percorre para cobrar o teto — escrever
              as duas chamadas à mão faria o terceiro campo de texto nascer numa
              das duas e não na outra. O que é de TELA (linhas, exemplo, e qual
              parte da herança olhar) fica na tabela abaixo, e a partição é
              conferida no carregamento do domínio. */}
          {CAMPOS_DE_TEXTO_DE_SEO.map((campoDeTexto) => (
            <CampoDeTextoDeSeo
              key={campoDeTexto}
              campo={campoDeTexto}
              linhas={APRESENTACAO_DO_TEXTO_DE_SEO[campoDeTexto].linhas}
              valor={valores[campoDeTexto]}
              heranca={
                metadadosDaHeranca?.[APRESENTACAO_DO_TEXTO_DE_SEO[campoDeTexto].parte] ?? null
              }
              recusaDaHeranca={recusaDaCadeia(metadadosDaHeranca, campoDeTexto)}
              andaime={andaime}
              aoMudar={aoMudar}
              placeholder={APRESENTACAO_DO_TEXTO_DE_SEO[campoDeTexto].exemplo}
            />
          ))}

          <CampoDeImagem
            campo="seo_imagem_url"
            rotulo={ROTULOS_DE_SEO.seo_imagem_url}
            nome={ROTULOS_DE_SEO.seo_imagem_url}
            papel="campo-da-imagem-de-seo"
            valor={valores[CAMPO_DE_IMAGEM_DE_SEO]}
            descricao={null}
            campoDaDescricao={null}
            categoria={categoriaEscolhida?.nome ?? ""}
            base={baseDaCapaDoProjeto}
            envio={envios[CAMPO_DE_IMAGEM_DE_SEO]}
            heranca={metadadosDaHeranca?.imagem ?? null}
            /* POR QUE O QUE ESTÁ AÍ NÃO SERVE. O endereço pode estar dentro do
               vocabulário de esquema — e então não há recusa de formulário — e
               ainda assim ser recusado pela cadeia, por espécie fora da prévia.
               Sem esta linha a miniatura aparecia, a imagem caía para a capa, e
               nada dizia por quê. */
            recusaDaHeranca={recusaDaCadeia(metadadosDaHeranca, CAMPO_DE_IMAGEM_DE_SEO)}
            andaime={andaime}
            aoMudar={aoMudar}
            aoEscolherArquivo={aoEscolherArquivo}
            aoRemoverImagem={aoRemoverImagem}
          />
        </section>
      </div>
    </aside>
  );
}

/**
 * Um campo de TEXTO da seção de SEO: o campo, o contador, e a herança.
 *
 * ─── O CONTADOR SINALIZA, E NÃO FAZ MAIS NADA ──────────────────────────────
 *
 * Não há `maxLength` no controle, e a ausência é o requisito: um campo que
 * simplesmente PARA de aceitar texto no caractere 60 faz quem colou um título
 * pronto perder o resto sem aviso. É a mesma decisão que a Story 3.1 tomou para
 * a descrição da imagem, pelo mesmo motivo, e o comentário de lá é o precedente.
 *
 * O que o contador faz é mudar de cor e ganhar uma frase quando passa do
 * comprimento usual — e a frase DIZ que dá para salvar assim mesmo. Sem essa
 * metade, o aviso seria lido como recusa e o Autor encurtaria um título que
 * escolheu de propósito.
 *
 * A recusa de verdade, essa sim, existe: é o teto de HIGIENE, muito acima, e
 * quem a dá é o domínio — a mesma regra que o servidor cobra e que a restrição
 * do banco impõe.
 */
/**
 * O que é de TELA em cada campo de texto de SEO.
 *
 * Quantas linhas o controle tem, que exemplo ele mostra, e qual parte de
 * `metadadosDoPost` responde por ele. Nada aqui decide herança — a decisão é do
 * domínio; o que esta tabela faz é dizer onde LER a decisão de cada um. Ela é
 * chaveada por `CAMPOS_DE_TEXTO_DE_SEO`, e um campo novo sem entrada aqui
 * quebra alto em vez de nascer em branco.
 */
const APRESENTACAO_DO_TEXTO_DE_SEO = Object.freeze({
  seo_titulo: Object.freeze({
    linhas: 2,
    parte: "titulo",
    exemplo: "O título que aparece no Google e no WhatsApp",
  }),
  seo_descricao: Object.freeze({
    linhas: 3,
    parte: "descricao",
    exemplo: "A frase embaixo do título no resultado de busca",
  }),
});

function CampoDeTextoDeSeo({
  campo,
  linhas,
  valor,
  heranca,
  recusaDaHeranca = null,
  andaime,
  aoMudar,
  placeholder,
}) {
  const { idDe, idDoErro, idDaAjuda, campo: montar } = andaime;
  const texto = String(valor ?? "");
  const excedeu = acimaDoUsual(campo, texto);
  const aviso = avisoDeComprimento(campo, texto);
  const problema = problemaNoTextoDeSeo(campo, texto);
  const fala = falaDaHeranca(heranca);

  /* A AJUDA E A RECUSA, AS DUAS, quando as duas existem: a ajuda é o que conta
     a herança, e ela continua sendo o que o Autor precisa ouvir mesmo quando o
     teto foi estourado. */
  const descritores = [
    problema !== null ? idDoErro(campo) : null,
    idDaAjuda(campo),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5" data-papel={`campo-de-seo-${campo}`}>
      <Rotulo para={idDe(campo)}>{ROTULOS_DE_SEO[campo]}</Rotulo>
      <textarea
        rows={linhas}
        {...montar(campo, { recusa: problema !== null, extra: "resize-y" })}
        value={texto}
        onChange={(evento) => aoMudar?.(campo, evento.target.value)}
        aria-describedby={descritores.join(" ")}
        placeholder={placeholder}
      />

      {/* O CONTADOR. Dado em pilha monoespaçada com numeral tabular, como a
          data e o slug — é regra do épico para contador de caractere, e é o
          que faz o número não dançar enquanto a pessoa digita. */}
      {/* UM ELEMENTO SÓ. O `<p>` que envolvia isto tinha um filho único e
          `justify-between`, que não distribui nada entre um item — a estrutura
          prometia um segundo elemento que nunca existiu. */}
      <p
        data-papel={`contador-de-${campo}`}
        data-acima={excedeu ? "true" : "false"}
        className={cn(
          "dado text-xs",
          excedeu ? "font-medium text-brand-action" : "text-ink-muted",
        )}
      >
        {textoDoContador(campo, texto)}
      </p>

      {/* O AVISO DE COMPRIMENTO NÃO É UMA RECUSA, e por isso ele não usa
          `Recusa`: nem `role="alert"`, nem tinta destrutiva, nem
          `aria-invalid`. Ele é conselho, e conselho vestido de erro treina a
          pessoa a ignorar o erro que importa. */}
      {aviso !== null ? (
        <p
          data-papel={`aviso-de-comprimento-${campo}`}
          className="text-xs text-ink-secondary"
        >
          {aviso}
        </p>
      ) : null}

      {/* A RECUSA DE VERDADE: o teto de HIGIENE, que é o único número deste
          campo capaz de impedir o salvamento. */}
      <Recusa id={idDoErro(campo)} visivel={problema !== null}>
        {problema}
      </Recusa>

      {/* POR QUE O QUE ESTÁ AÍ NÃO FOI APROVEITADO — a frase do domínio, quando
          a cadeia recusou este elo. Ela não é `Recusa`: o teto de higiene já
          tem a sua logo acima, e esta responde por outro fato. */}
      {recusaDaHeranca !== null ? (
        <p
          data-papel={`recusa-da-cadeia-${campo}`}
          className="text-xs text-ink-secondary"
        >
          {recusaDaHeranca}
        </p>
      ) : null}

      {/* O QUE SERÁ HERDADO. Ele fica no `aria-describedby` do campo: quem usa
          leitor de tela precisa ouvir "vazio herda o título do post" junto do
          campo, e não descobrir depois de publicar. */}
      <p id={idDaAjuda(campo)} className="text-xs text-ink-muted">
        {fala ?? "Este texto é o que vai para a busca e para a prévia do link."}
      </p>
    </div>
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

/**
 * O controle de UMA imagem do Post: duas origens, miniatura, degradação,
 * progresso e recusa.
 *
 * ─── UM COMPONENTE, DOIS CAMPOS (Story 3.4) ────────────────────────────────
 *
 * A gaveta o desenha duas vezes: para a **Imagem de capa** e para a **Imagem de
 * Compartilhamento**. Elas são o mesmo tipo de valor — endereço absoluto de
 * imagem —, com o mesmo vocabulário de esquema, a mesma recusa antes do
 * salvamento e a mesma degradação. Um campo de texto cru para a segunda, ao
 * lado deste controle para a primeira, seria a definição de sinônimo: duas
 * maneiras de dizer a mesma coisa na mesma gaveta, e o Autor teria de aprender
 * as duas.
 *
 * ─── E O ESTADO É DE CADA UM ───────────────────────────────────────────────
 *
 * O modo escolhido, o benefício da dúvida do endereço e a imagem que não
 * carregou vivem AQUI, e é por isso que isto é componente e não um trecho
 * repetido: com o estado no pai, a capa que falhou marcaria a imagem de
 * compartilhamento como quebrada, e alternar o modo de uma alternaria o da
 * outra.
 *
 * ─── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
 *
 * Ele não conhece rede, como o resto da gaveta: recebe a situação do envio já
 * decidida e a recusa já em palavras, e emite o arquivo escolhido. Quem fala
 * com o Storage é o Editor, pela camada de dados.
 */
function CampoDeImagem({
  campo,
  rotulo,
  nome,
  valor,
  descricao,
  campoDaDescricao,
  categoria,
  base,
  envio,
  heranca = null,
  recusaDaHeranca = null,
  andaime,
  aoMudar,
  aoEscolherArquivo,
  aoRemoverImagem,
}) {
  const { idDe, idDoErro, idDaAjuda, campo: montar, desabilitado } = andaime;
  const papeis = papeisDoCampoDeImagem(campo);

  const situacaoDoEnvio = envio?.situacao ?? ENVIO_PARADO;
  const recusaDoEnvio = envio?.recusa ?? null;

  /* `endereco` é o ENDEREÇO gravado (ou o que o envio acabou de devolver). A
     gaveta nunca vê o arquivo depois de emiti-lo: o que ela mostra é a imagem
     que já está no bucket, pelo mesmo endereço que o site vai usar — é assim
     que "a miniatura aparece ao concluir" prova que o envio concluiu, em vez
     de mostrar uma pré-visualização local que existiria mesmo se ele tivesse
     falhado. */
  const endereco = String(valor ?? "").trim();
  /* O VALOR CRU vai para o campo de texto, e o aparado vai para a lógica: um
     campo controlado que apara a cada tecla não deixa digitar o espaço que a
     pessoa vai apagar em seguida, e o cursor pula. */
  const enderecoDigitado = String(valor ?? "");
  const enviando = situacaoDoEnvio === ENVIO_EM_CURSO;

  /* A IMAGEM QUE NÃO CARREGA. `onError` do `<img>` é o único sinal que o
     navegador dá, e ele é por ENDEREÇO: trocar a imagem precisa devolver o
     benefício da dúvida à nova, senão uma falha antiga condenaria todas as
     seguintes. */
  const [quebrada, setQuebrada] = useState(false);
  useEffect(() => {
    setQuebrada(false);
  }, [endereco]);

  /* ── OS DOIS MODOS (Story 3.2) ─────────────────────────────────────────
     O modo é DERIVADO do endereço, e a escolha explícita só vale enquanto não
     há endereço nenhum. Não é sutileza: a leitura do Post é assíncrona, então
     o formulário nasce vazio e recebe o endereço gravado depois. Um modo
     guardado em `useState` ficaria preso ao que valia com o formulário em
     branco — e quem marcasse "Enviar arquivo" nesse instante veria a imagem de
     fora do Post chegar e sumir dentro do campo `readOnly`, invisível e
     ineditável.

     Com endereço na mão, quem manda é o endereço; sem endereço, quem manda é a
     escolha da pessoa. As duas regras cabem numa linha, e é por isso que
     alternar continua funcionando: alternar esvazia o campo do modo de destino,
     e é esse vazio que devolve a palavra à escolha. */
  const [origemEscolhida, setOrigemEscolhida] = useState(null);
  const origem =
    endereco === "" ? (origemEscolhida ?? ORIGEM_ENVIADA) : origemDoEndereco(endereco, base);
  const deFora = origem === ORIGEM_DE_FORA;

  /* O QUE ESTAVA NO OUTRO MODO — O PAR INTEIRO, e não só o endereço.
     Alternar que apaga o que a pessoa digitou é alternância que ela aprende a
     não usar; alternar que deixa a DESCRIÇÃO da imagem anterior para trás é
     pior, porque não some nada — o texto fica, cola na imagem seguinte, e o
     Post é publicado descrevendo uma foto que ninguém vê. É a mesma razão
     escrita em `removerCapa`, no Editor.

     `ref` e não estado: nada na tela depende disto para desenhar, e o que
     desenha é `valores`, que continua sendo a única verdade. */
  const textoDaDescricao = String(descricao ?? "");
  const guardadoPorOrigem = useRef({
    [ORIGEM_ENVIADA]: { url: "", alt: "" },
    [ORIGEM_DE_FORA]: { url: "", alt: "" },
  });
  guardadoPorOrigem.current[origem] = { url: enderecoDigitado, alt: textoDaDescricao };

  const [enderecoVisto, setEnderecoVisto] = useState(false);

  const trocarOrigem = (nova) => {
    if (nova === origem) return;
    guardadoPorOrigem.current[origem] = { url: enderecoDigitado, alt: textoDaDescricao };
    setOrigemEscolhida(nova);
    /* A RECUSA VOLTA A ESPERAR. O campo de destino é outro texto, e carregar a
       marca vermelha do anterior acusaria a pessoa de algo que ela não digitou. */
    setEnderecoVisto(false);
    const devolvido = guardadoPorOrigem.current[nova] ?? { url: "", alt: "" };
    if (devolvido.url !== enderecoDigitado) aoMudar?.(campo, devolvido.url);
    /* A DESCRIÇÃO SÓ VIAJA QUANDO O CAMPO TEM UMA. A Imagem de
       Compartilhamento não tem coluna de texto alternativo — o Post guarda um
       só, o da capa —, e mexer nele daqui faria trocar o modo de um campo
       reescrever a descrição do outro. */
    if (campoDaDescricao !== null && devolvido.alt !== textoDaDescricao) {
      aoMudar?.(campoDaDescricao, devolvido.alt);
    }
  };

  /* O PROBLEMA DO ENDEREÇO, lido a cada renderização pela regra do DOMÍNIO —
     a mesma que `corpoDoPedido` consulta antes de o pedido sair, que o servidor
     cobra depois e que a restrição do banco espelha em SQL. É isto que faz a
     recusa acontecer ANTES do salvamento, em vez de voltar como violação crua. */
  const problemaNoEnderecoDaImagemDoCampo = problemaNoEnderecoDaImagem(endereco);

  /* ─── MAS ELA SÓ APARECE QUANDO A PESSOA TERMINA DE ESCREVER ───────────
     `https://` digitado letra a letra passa por `h`, `ht`, `htt`… e nenhum
     deles é endereço válido. Mostrar a recusa a cada tecla pinta o campo de
     vermelho desde o primeiro caractere de toda digitação bem-sucedida — a
     falha que não é falha, que treina a pessoa a ignorar a recusa que importa.

     O sinal de "terminei" é o campo perder o foco. Digitar de novo devolve o
     benefício da dúvida, e um endereço que já é válido nunca chega aqui. */
  const recusaDoEnderecoVisivel =
    deFora && problemaNoEnderecoDaImagemDoCampo !== null && enderecoVisto;

  /* A imagem é DESENHÁVEL quando existe e passa no vocabulário: pôr um endereço
     recusado dentro de um `<img>` faria o navegador buscar `javascript:` ou
     `data:` só para descobrir que não presta. */
  const desenhavel = endereco !== "" && problemaNoEnderecoDaImagemDoCampo === null;

  /* ─── A SITUAÇÃO DA CAIXA QUE SUBSTITUI A IMAGEM ────────────────────────
     Três, e não duas. "Tem endereço" não é o mesmo que "tem imagem": enquanto a
     pessoa digita `h`, `ht`, `htt`… o campo tem endereço e a imagem não existe
     ainda, e anunciar "a imagem não carregou" seria contar um fato que não
     aconteceu. */
  const situacaoDaImagem =
    quebrada && desenhavel
      ? CAPA_QUE_NAO_CARREGOU
      : recusaDoEnderecoVisivel
        ? CAPA_COM_ENDERECO_RECUSADO
        : CAPA_AUSENTE;

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
    if (arquivo !== null) aoEscolherArquivo?.(campo, arquivo);
  };

  /* O QUE SE DIZ QUANDO NÃO HÁ IMAGEM. Para a Capa é a frase da Story 3.1; para
     um campo que HERDA, é o que ele vai herdar — porque é essa a resposta à
     pergunta que a pessoa está fazendo ao olhar para o campo vazio. Quem decide
     o que é herdado é o domínio; esta linha só escolhe qual das duas frases
     cabe aqui. */
  /* A SEGUNDA FRASE NÃO DECIDE NADA, e é por isso que ela é curta. A versão
     anterior afirmava que "o artigo aparece com o monograma da categoria" — e
     isso é falso duas vezes: o monograma é recurso do PAINEL, e o que um Post
     sem capa declara ao ser compartilhado é a Imagem Padrão do Site, decidida
     pelo domínio. Uma tela que responde "o que vai acontecer" por conta própria
     é a segunda opinião que o AD-20 proíbe — e esta aparecia justo no ramo em
     que a tela já está avisando que falta alguma coisa. */
  const falaDaAusencia =
    falaDaHeranca(heranca) ?? `Sem ${String(nome).toLowerCase()}.`;

  const idDoSeletor = papeis.seletor;

  return (
    <div className="flex flex-col gap-1.5" data-papel={papeis.campo}>
      {/* ─── O RÓTULO APONTA PARA O CONTROLE QUE A PESSOA OPERA ──────────
          Ele nomeia o controle do MODO ATIVO: o seletor de arquivo quando se
          envia, o campo de endereço quando se informa um. A primeira versão
          fazia o contrário, e o único controle operável da seção ficava sem
          nome acessível nenhum. */}
      <Rotulo para={idDe(deFora ? campo : idDoSeletor)}>{rotulo}</Rotulo>

      {/* A ESCOLHA DO MODO. Grupo de rádio nativo: é o controle que diz
          "uma destas duas" sem inventar semântica, cabe em 340px em duas
          linhas, e cada opção ganha nome acessível pelo próprio rótulo que
          a envolve — o vocabulário e as palavras vêm de `capa.js`. */}
      <div
        role="radiogroup"
        aria-label={rotuloDoGrupoDeOrigem(nome)}
        data-papel={papeis.origem}
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
              name={idDe(`origem-de-${campo}`)}
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
          `data-campo`: aquele atributo é o que a verificação lê para conferir a
          ordem dos campos, e quem representa a imagem na ordem é o seletor de
          arquivo.

          No modo de fora ele é o campo: digitável, com rótulo apontando para
          ele e com a recusa colada, e aí `data-campo` é dele. */}
      {deFora ? (
        <>
          <input
            type="url"
            {...montar(campo, {
              ajuda: true,
              recusa: recusaDoEnderecoVisivel,
              extra: "dado",
            })}
            data-valor={campo}
            value={enderecoDigitado}
            onChange={(evento) => {
              /* DIGITAR DEVOLVE O BENEFÍCIO DA DÚVIDA: a recusa some
                 enquanto a pessoa conserta, e volta quando ela termina. */
              setEnderecoVisto(false);
              aoMudar?.(campo, evento.target.value);
            }}
            onBlur={() => setEnderecoVisto(true)}
            disabled={desabilitado || enviando}
            /* O ERRO **E** A AJUDA, e não um ou outro. A ajuda é o que
               explica que se cola o LINK e não o conteúdo — e colar o
               conteúdo é a causa comum da recusa, então some exatamente
               quando é mais útil. */
            aria-describedby={
              recusaDoEnderecoVisivel
                ? `${idDoErro(campo)} ${idDaAjuda(campo)}`
                : idDaAjuda(campo)
            }
            placeholder="https://exemplo.com/imagem.jpg"
          />
          {/* A RECUSA ANTES DO SALVAMENTO, e ela diz QUAL dos quatro
              motivos é: teto, caractere fora do vocabulário, esquema, ou
              site ausente. A frase vem do DOMÍNIO, que também dá o
              veredito — a gaveta não decide o que é endereço aceitável. */}
          <Recusa id={idDoErro(campo)} visivel={recusaDoEnderecoVisivel}>
            {problemaNoEnderecoDaImagemDoCampo}
          </Recusa>
          <p id={idDaAjuda(campo)} className="text-xs text-ink-muted">
            {ROTULO_DO_ENDERECO_DA_CAPA}: o link direto de uma imagem já
            publicada em outro lugar. Ela não é copiada, o post passa a
            apontar para lá.
          </p>
        </>
      ) : (
        <input
          type="url"
          id={idDe(campo)}
          name={campo}
          data-valor={campo}
          value={endereco}
          readOnly
          hidden
        />
      )}

      {/* A MINIATURA, E O QUE OCUPA O LUGAR DELA QUANDO NÃO HÁ IMAGEM.
          Um endereço que não resolve — arquivo removido por fora, host de
          terceiro que saiu do ar, endereço que o vocabulário recusa —
          desenharia o ícone de imagem quebrada e mais nada.

          ─── SEMPRE O MONOGRAMA DA CATEGORIA (Story 3.2) ───────────────
          Nos DOIS ramos: sem imagem nenhuma e com imagem que não carrega. É o
          mesmo componente que a linha da listagem desenha para o mesmo Post, e
          ele não quebra o layout, porque ocupa exatamente o espaço que a imagem
          ocuparia. */}
      {desenhavel && !quebrada ? (
        <img
          src={endereco}
          alt={alternativoDaMiniatura(descricao, rotulo)}
          data-papel={papeis.miniatura}
          /* Endereço de fora não recebe o referenciador: a miniatura do
             Painel entregaria a um host de terceiro o endereço do Editor. */
          referrerPolicy="no-referrer"
          onError={() => setQuebrada(true)}
          className="aspect-[16/9] w-full rounded-cartao border border-border-soft object-cover"
        />
      ) : (
        <>
          <MonogramaDaCapa
            categoria={categoria}
            papel={situacaoDaImagem === CAPA_AUSENTE ? papeis.ausente : papeis.degradada}
            /* ELA É ANUNCIADA. Na listagem a caixa é decorativa, porque a
               linha inteira diz título e Categoria em texto; aqui não há
               esse texto em volta, e quem usa leitor de tela recebia
               silêncio no lugar da imagem. */
            rotulo={rotuloDaCapaDegradada({
              categoria,
              situacao: situacaoDaImagem,
              nome,
            })}
            classeDoSimbolo="size-8"
            className="aspect-[16/9] w-full rounded-cartao border border-border-soft text-4xl"
          />
          {/* `quebrada`, e não uma condição equivalente por acidente: a frase
              fala de imagem que FALHOU AO CARREGAR. Endereço que o vocabulário
              recusa já tem a recusa dele colada ao campo, e dizer as duas
              coisas seria dois motivos para o mesmo erro. */}
          {situacaoDaImagem === CAPA_QUE_NAO_CARREGOU ? (
            <p
              data-papel={papeis.quebrada}
              role="alert"
              className="flex items-start gap-1.5 rounded-cartao border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>{falaDaImagemQuebrada(nome)}</span>
            </p>
          ) : situacaoDaImagem === CAPA_AUSENTE ? (
            <p
              data-papel={papeis.ajudaDaAusencia}
              className="text-center text-xs text-ink-muted"
            >
              {falaDaAusencia}
            </p>
          ) : null}
        </>
      )}

      {/* POR QUE ESTA IMAGEM NÃO VAI SER USADA.
          Não é `Recusa`: ela não impede o salvamento e o campo não é inválido —
          o valor está lá, é gravável, e a cadeia é que não o aproveita. Vestir
          isto de erro treinaria o Autor a ignorar o erro que importa, que é a
          mesma razão pela qual o aviso do contador também não é `Recusa`.
          A frase vem do DOMÍNIO, com o motivo que ele nomeou. */}
      {recusaDaHeranca !== null ? (
        <p
          data-papel={papeis.recusaDaCadeia}
          className="text-xs text-ink-secondary"
        >
          {recusaDaHeranca}
        </p>
      ) : null}

      {/* A INDICAÇÃO DE PROGRESSO NÃO MENTE. Região viva, sem percentual:
          o que se sabe é "está enviando", e é isso que ela diz. Ver o
          cabeçalho de `capa.js` para por que não há barra medida.

          ─── E ELA NÃO É MONTADA E DESMONTADA ─────────────────────────
          A versão anterior a escondia com `hidden`, e região viva que
          aparece e some é anunciada de forma inconsistente pelos leitores
          de tela — alguns só leem o que MUDA dentro de uma região que já
          estava lá. O elemento fica sempre no documento e o que muda é o
          TEXTO. */}
      <p
        data-papel={papeis.envio}
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
          representando o mesmo campo ao mesmo tempo fariam a ordem dos campos
          da gaveta ter o mesmo nome duas vezes, e a pessoa teria dois lugares
          para dizer a mesma coisa. */}
      <div className="flex flex-wrap items-center gap-2">
        {!deFora ? (
          <>
            <input
              ref={seletor}
              type="file"
              id={idDe(idDoSeletor)}
              data-campo={idDoSeletor}
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
              aria-describedby={envioRecusado ? idDoErro(idDoSeletor) : idDaAjuda(campo)}
              className="sr-only"
            />
            {/* `data-acao-da-capa`, e NÃO `data-acao`: aquele atributo é o
                vocabulário FECHADO das ações da máquina de transições,
                contado pela verificação para cobrar que a barra ofereça
                exatamente o que o Estado declara. Escolher e trocar imagem
                não são transições. */}
            <Button
              type="button"
              variant="outline"
              data-acao-da-capa="escolher"
              data-campo-da-acao={campo}
              disabled={desabilitado || enviando}
              onClick={() => seletor.current?.click()}
              className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2")}
            >
              <ImagePlus aria-hidden="true" className="size-4" />
              {rotuloDoSeletor(endereco !== "")}
            </Button>
          </>
        ) : null}
        {endereco !== "" ? (
          <Button
            type="button"
            variant="ghost"
            data-acao-da-capa="remover"
            data-campo-da-acao={campo}
            disabled={desabilitado || enviando}
            onClick={() => aoRemoverImagem?.(campo)}
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
      <Recusa id={idDoErro(idDoSeletor)} visivel={envioRecusado}>
        {recusaDoEnvio}
      </Recusa>

      {/* A AJUDA DO ENVIO só existe no modo de envio — ela é o alvo de
          `aria-describedby` do seletor, e o modo de fora tem a sua própria,
          com o mesmo identificador. Manter as duas montadas produziria
          `id` repetido, e um alvo de descrição ambíguo. */}
      {!deFora ? (
        <p id={idDaAjuda(campo)} className="text-xs text-ink-muted">
          {ROTULOS_DE_IMAGEM.join(", ")} até{" "}
          <span className="dado">{formatarTamanho(TAMANHO_MAXIMO_DA_IMAGEM)}</span>.
        </p>
      ) : null}
    </div>
  );
}
