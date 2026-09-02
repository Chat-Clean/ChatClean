/**
 * O filtro de DATA da listagem de Posts.
 *
 * Um controle na faixa de filtros, com o desenho de calendário, que abre a
 * escolha da faixa: quatro atalhos e as duas pontas em campos de data.
 *
 * ─── O CONTROLE DIZ O QUE ESTÁ VALENDO ─────────────────────────────────────
 *
 * Fechado, ele mostra a faixa escolhida — "02/09/2026", "01/09/2026 a
 * 05/09/2026" — e não a palavra "Data" com uma cor diferente. Filtro que só
 * muda de cor quando está ligado obriga quem voltou de outra aba a abrir o
 * painel para descobrir o que está recortando a lista, e é assim que alguém
 * conclui que os posts sumiram. `aria-pressed` carrega a mesma informação para
 * quem ouve a tela: cor nunca é o único portador.
 *
 * ─── NADA AQUI SABE O QUE É UMA DATA ───────────────────────────────────────
 *
 * Quem valida dia, ordena as pontas invertidas, calcula "últimos 7 dias" e
 * escreve a faixa por extenso é `domain/blog/periodo.js` — o MESMO módulo que a
 * camada de dados usa para converter a faixa em instantes. Uma segunda noção de
 * "que dia é hoje" aqui divergiria da do banco no fuso, que é o defeito que o
 * domínio existe para impedir: `new Date("2026-09-02")` é 21h do dia anterior
 * em São Paulo.
 *
 * ─── APLICA NA HORA, SEM BOTÃO DE APLICAR ──────────────────────────────────
 *
 * Cada escolha muda a lista imediatamente, como os filtros de Estado ao lado.
 * Um botão de "aplicar" criaria um segundo estado — o escolhido e o aplicado —
 * que a tela teria de explicar, e que a pessoa descobriria existir ao fechar o
 * painel sem clicar nele.
 *
 * O atalho FECHA o painel (a escolha está completa); o campo de data não fecha
 * (a outra ponta costuma vir em seguida).
 */

import { useId } from "react";
import { CalendarDays, X } from "lucide-react";

import {
  ATALHOS_DE_PERIODO,
  PERIODO_VAZIO,
  faixaDoAtalho,
  haPeriodo,
  mesmoPeriodo,
  normalizarPeriodo,
  textoDoPeriodo,
} from "@/domain/blog/periodo";
/* O rótulo e a voz do controle moram no módulo puro da listagem, como todo o
   resto do vocabulário desta tela: função pura em arquivo de componente quebra
   a recarga rápida, e o lint cobra. */
import { ROTULO_SEM_PERIODO, rotuloDoFiltroDeData } from "@/admin/blog/listagem";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const CLASSE_DO_CAMPO = cn(
  ANEL_DE_FOCO,
  "w-full rounded-controle border border-border-soft bg-surface",
  "px-2.5 py-1.5 text-sm text-ink outline-hidden",
  "focus:border-brand-action",
);

export default function FiltroDeData({
  periodo = PERIODO_VAZIO,
  aoMudar,
  aberto = false,
  aoMudarAbertura,
}) {
  const idDe = useId();
  const idAte = useId();

  const atual = normalizarPeriodo(periodo);
  const marcado = haPeriodo(atual);

  /* Toda mudança passa por aqui, e sai NORMALIZADA: o que a lista recorta é o
     mesmo que os campos mostram, inclusive quando as pontas vêm invertidas. */
  const aplicar = (proximo) => aoMudar?.(normalizarPeriodo(proximo));

  return (
    <Popover open={aberto} onOpenChange={(v) => aoMudarAbertura?.(v)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-filtro-de-data="gatilho"
          data-periodo={marcado ? `${atual.de ?? ""}|${atual.ate ?? ""}` : ""}
          aria-pressed={marcado}
          aria-label={rotuloDoFiltroDeData(atual)}
          className={cn(
            ANEL_DE_FOCO,
            "inline-flex items-center gap-1.5 rounded-pilula border px-3 py-1.5",
            "text-xs font-bold transition-colors",
            marcado
              ? "border-brand-action bg-brand-wash text-brand-action"
              : "border-border-soft bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
          )}
        >
          <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
          <span className={marcado ? "dado" : undefined}>
            {marcado ? textoDoPeriodo(atual) : ROTULO_SEM_PERIODO}
          </span>
        </button>
      </PopoverTrigger>

      {/* `painel` reabre o escopo: o conteúdo nasce em portal, preso ao `body`,
          e sem ele os tokens do Painel resolveriam para os neutros do site
          público. */}
      <PopoverContent
        align="start"
        className="painel w-72 space-y-3"
        aria-label="Escolher a data dos posts"
        data-filtro-de-data="painel"
      >
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Períodos prontos">
          {ATALHOS_DE_PERIODO.map((atalho) => {
            /* O atalho aparece marcado quando a faixa em vigor É a dele — e a
               comparação é da FAIXA, não do último botão clicado: escolher
               "hoje" à mão nos dois campos marca "Hoje", como deve. */
            const faixa = faixaDoAtalho(atalho.id);
            const emVigor = marcado && mesmoPeriodo(atual, faixa);
            return (
              <button
                key={atalho.id}
                type="button"
                data-atalho-de-periodo={atalho.id}
                aria-pressed={emVigor}
                onClick={() => {
                  aplicar(faixa);
                  aoMudarAbertura?.(false);
                }}
                className={cn(
                  ANEL_DE_FOCO,
                  "rounded-pilula border px-2.5 py-1 text-xs font-semibold transition-colors",
                  emVigor
                    ? "border-brand-action bg-brand-wash text-brand-action"
                    : "border-border-soft bg-surface text-ink-secondary hover:border-border-strong hover:text-ink",
                )}
              >
                {atalho.rotulo}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label htmlFor={idDe} className="block text-xs font-semibold text-ink-secondary">
              De
            </label>
            <input
              id={idDe}
              type="date"
              data-campo-de-periodo="de"
              value={atual.de ?? ""}
              onChange={(e) => aplicar({ ...atual, de: e.target.value })}
              className={CLASSE_DO_CAMPO}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={idAte} className="block text-xs font-semibold text-ink-secondary">
              Até
            </label>
            <input
              id={idAte}
              type="date"
              data-campo-de-periodo="ate"
              value={atual.ate ?? ""}
              onChange={(e) => aplicar({ ...atual, ate: e.target.value })}
              className={CLASSE_DO_CAMPO}
            />
          </div>
        </div>

        {/* Limpar só existe quando há o que limpar — e ele é o único desfazer
            desta escolha, então não some atrás de hover nenhum. */}
        {marcado ? (
          <button
            type="button"
            data-filtro-de-data="limpar"
            onClick={() => {
              aplicar(PERIODO_VAZIO);
              aoMudarAbertura?.(false);
            }}
            className={cn(
              ANEL_DE_FOCO,
              ALVO_DE_TOQUE,
              "inline-flex w-full items-center justify-center gap-1.5 rounded-controle",
              "border border-border-soft bg-surface px-3 text-sm font-semibold",
              "text-ink-secondary transition-colors hover:border-border-strong hover:text-ink",
            )}
          >
            <X aria-hidden="true" className="size-4" />
            Limpar a data
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
