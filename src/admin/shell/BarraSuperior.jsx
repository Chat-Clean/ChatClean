/**
 * A barra superior do Painel.
 *
 * Saiu de dentro de `AdminBlog.jsx` e veio para a casca porque a barra é
 * **compartilhada** — Blog e Carreiras usam a mesma. Enquanto ela morava na
 * página do Blog, qualquer ajuste na aba Carreiras exigia editar o arquivo do
 * Blog, e a ação global de Restaurar aparecia nas duas abas porque estava
 * escrita fora de qualquer condição.
 *
 * **A casca não conhece domínio (AD-15).** Este arquivo não sabe o que é Post
 * nem o que é Vaga: recebe as abas e as ações da aba ativa por propriedade. É
 * essa fronteira que permite Restaurar sumir da aba Blog sem que a aba
 * Carreiras — módulo fora de escopo, que não pode regredir — perca nada.
 *
 * O que mudou em relação à barra antiga:
 *   - logo real (`/chatclean-white.svg`), no lugar do quadrado com "CC"
 *     desenhado num `div`, com dimensão intrínseca declarada para a barra não
 *     deslocar no primeiro carregamento;
 *   - superfície em `brand-chrome`, o verde de cromia da direção "Etiqueta";
 *   - `emerald` fora: toda cor vem de token;
 *   - **nenhum botão contornado** — o contorno competia com o botão primário e
 *     dava a três ações o mesmo peso visual;
 *   - o link para o site publicado virou ícone discreto;
 *   - anel de foco de 2px em `brand-action`, visível sobre a cromia.
 *
 * **Semântica das abas.** Elas trocam o conteúdo da mesma tela, não navegam
 * para outra página — `aria-current="page"` seria mentira. Aqui está o padrão
 * de abas do ARIA por inteiro: `tablist`/`tab`/`tabpanel`, `aria-selected`,
 * `aria-controls`, foco itinerante (só a aba ativa entra na ordem do `Tab`) e
 * setas para trocar. Meio padrão — `role` sem painel associado, ou `tablist`
 * sem foco itinerante — é pior que padrão nenhum.
 *
 * A barra é clara e o corpo do Painel continua escuro. É deliberado e
 * temporário: a listagem e os formulários são reconstruídos no Épico 2, e
 * repintá-los aqui seria refazer trabalho que será jogado fora.
 */

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

import MenuDoAutor from "./MenuDoAutor";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "./foco";

/** Dimensão intrínseca de `public/chatclean-white.svg` (`viewBox 0 0 1125 225`). */
const LOGO_LARGURA = 1125;
const LOGO_ALTURA = 225;

/**
 * O `id` da aba, para a página poder apontar o `aria-labelledby` do painel de
 * conteúdo para ela sem que as duas inventem convenções diferentes.
 */
// eslint-disable-next-line react-refresh/only-export-components -- o gerador do id mora junto de quem o emite; separá-lo é o caminho curto para as duas pontas divergirem.
export function idDaAba(id) {
  return `aba-do-painel-${id}`;
}

/**
 * Uma aba. Pílula com ícone, palavra e contagem — a contagem em `.dado`, porque
 * número é dado e precisa alinhar entre as abas em vez de dançar conforme o
 * dígito.
 *
 * A aba ativa não é distinguida só por cor: `aria-selected` diz o mesmo para
 * quem não vê, e o contraste do fundo ativo sobre a cromia é o que a torna
 * legível para quem não distingue os dois verdes.
 */
function Aba({ aba, ativa, aoSelecionar, aoNavegar, idDoConteudo, refDoBotao }) {
  const { Icone, rotulo, contagem } = aba;
  return (
    <button
      ref={refDoBotao}
      type="button"
      role="tab"
      id={idDaAba(aba.id)}
      aria-selected={ativa}
      aria-controls={idDoConteudo}
      // Foco itinerante: o `Tab` entra na lista uma vez e cai na aba ativa; as
      // setas percorrem as demais. Sem isso, cada aba nova acrescenta uma parada
      // na ordem de tabulação de quem só quer chegar ao conteúdo.
      tabIndex={ativa ? 0 : -1}
      onClick={() => aoSelecionar(aba.id)}
      onKeyDown={aoNavegar}
      className={cn(
        "flex items-center gap-2 min-h-10 px-3.5 rounded-pilula text-sm font-semibold transition-colors",
        ANEL_DE_FOCO,
        ativa
          ? "bg-surface text-brand-chrome"
          : "text-primary-foreground/75 hover:text-primary-foreground hover:bg-primary-foreground/10",
      )}
    >
      {Icone ? <Icone className="w-4 h-4" aria-hidden="true" /> : null}
      {rotulo}
      {contagem !== undefined && contagem !== null && (
        <span
          className={cn(
            "dado text-xs leading-none px-1.5 py-1 rounded-pilula",
            ativa
              ? "bg-brand-chrome/10 text-brand-chrome"
              : "bg-primary-foreground/15 text-primary-foreground",
          )}
        >
          {contagem}
        </span>
      )}
    </button>
  );
}

/**
 * @param {string}   titulo       nome do Painel: vira o `<h1>` e o título da aba
 *                                do navegador. Sem ele, Painel e site público
 *                                ficam indistinguíveis no histórico e para o
 *                                leitor de tela — a logo diz "ChatClean" nos dois.
 * @param {Array}    abas         `[{ id, rotulo, Icone, contagem, href, rotuloDoLink }]`
 * @param {string}   abaAtiva
 * @param {Function} aoTrocarAba
 * @param {string}   idDoConteudo `id` do elemento com `role="tabpanel"` na página
 * @param {Array}    acoesDaAba   ações do módulo da aba ativa, `[{ id, rotulo, Icone, aoAcionar }]`.
 *                                A casca só as renderiza — quem decide se
 *                                Restaurar existe é o módulo da aba.
 */
export default function BarraSuperior({
  titulo,
  abas = [],
  abaAtiva,
  aoTrocarAba,
  idDoConteudo,
  acoesDaAba = [],
}) {
  const aba = abas.find((a) => a.id === abaAtiva) ?? null;
  const refsDasAbas = useRef(new Map());

  useEffect(() => {
    if (titulo) document.title = titulo;
  }, [titulo]);

  /** Setas percorrem as abas, Home/End vão às pontas — padrão ARIA de `tablist`. */
  const aoNavegar = (evento) => {
    const teclas = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: "primeira",
      End: "ultima",
    };
    const acao = teclas[evento.key];
    if (acao === undefined) return;
    evento.preventDefault();

    const atual = abas.findIndex((a) => a.id === abaAtiva);
    let destino;
    if (acao === "primeira") destino = 0;
    else if (acao === "ultima") destino = abas.length - 1;
    else destino = (atual + acao + abas.length) % abas.length;

    const alvo = abas[destino];
    if (!alvo) return;
    aoTrocarAba(alvo.id);
    // O foco acompanha a seleção: é o que o padrão chama de "automatic
    // activation", e é o que faz a seta parecer com o clique.
    refsDasAbas.current.get(alvo.id)?.focus();
  };

  return (
    <header className="shrink-0 bg-brand-chrome text-primary-foreground px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
        {/* A logo de verdade, que já existia em `public/` enquanto a barra
            desenhava um quadrado com duas letras. Branca porque a superfície é
            a cromia escura. `width`/`height` reservam a proporção antes de o
            arquivo chegar — sem eles a barra pula no primeiro carregamento. */}
        <img
          src="/chatclean-white.svg"
          alt=""
          aria-hidden="true"
          width={LOGO_LARGURA}
          height={LOGO_ALTURA}
          className="h-6 w-auto shrink-0"
        />
        {/* O nome acessível do Painel. A logo é decorativa justamente porque
            este título já diz — e diz melhor — de que superfície se trata. */}
        <h1 className="sr-only">{titulo}</h1>

        <div
          role="tablist"
          aria-label="Seções do Painel"
          className="flex items-center gap-1"
        >
          {abas.map((a) => (
            <Aba
              key={a.id}
              aba={a}
              ativa={a.id === abaAtiva}
              aoSelecionar={aoTrocarAba}
              aoNavegar={aoNavegar}
              idDoConteudo={idDoConteudo}
              refDoBotao={(elemento) => {
                if (elemento) refsDasAbas.current.set(a.id, elemento);
                else refsDasAbas.current.delete(a.id);
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Ações do módulo da aba ativa. Sem contorno: peso visual de ação
            secundária, que é o que elas são. O alvo de toque é declarado
            porque abaixo de `sm` o rótulo some e sobra só o ícone. */}
        {acoesDaAba.map((acao) => (
          <button
            key={acao.id}
            type="button"
            onClick={acao.aoAcionar}
            className={cn(
              "flex items-center justify-center gap-1.5 px-3 rounded-controle text-xs font-semibold",
              ALVO_DE_TOQUE,
              "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors",
              ANEL_DE_FOCO,
            )}
          >
            {acao.Icone ? (
              <acao.Icone className="w-3.5 h-3.5" aria-hidden="true" />
            ) : null}
            <span className="hidden sm:inline">{acao.rotulo}</span>
            <span className="sm:hidden sr-only">{acao.rotulo}</span>
          </button>
        ))}

        {/* Ícone discreto para ver o que está publicado. Era um botão
            contornado com texto; virou o que sempre foi: um atalho. */}
        {aba?.href && (
          <Link
            to={aba.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={aba.rotuloDoLink ?? `Abrir ${aba.rotulo} em nova aba`}
            title={aba.rotuloDoLink ?? `Abrir ${aba.rotulo} em nova aba`}
            className={cn(
              "flex items-center justify-center rounded-controle",
              ALVO_DE_TOQUE,
              "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors",
              ANEL_DE_FOCO,
            )}
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </Link>
        )}

        {/* Reaproveitado da Story 1.3, não reescrito. O anel de foco dele vem
            do mesmo módulo compartilhado que o do resto da barra. */}
        <MenuDoAutor />
      </div>
    </header>
  );
}
