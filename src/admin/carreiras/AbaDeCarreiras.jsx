/**
 * A aba Carreiras do Painel (Story 5.5): a faixa de busca e a listagem.
 *
 * `AdminBlog.jsx` só declara a aba e monta este componente dentro do
 * `tabpanel`. Tudo o que é de Vaga mora aqui: o termo, o filtro de Estado, a
 * entrada para a Vaga nova e a lista. A faixa do Blog continua na página, só
 * no ramo do Blog: as duas faixas deixaram de ser os dois lados de um
 * ternário.
 *
 * A aba não é montada com o Blog ativo, e por isso só lê o banco quando é
 * visitada. A contagem da aba sobe para a página por `aoContar`, crua, e só
 * sem busca ativa: a aba conta quantas Vagas EXISTEM.
 *
 * ─── O TERMO DIGITADO E O TERMO APLICADO ────────────────────────────────────
 *
 * O campo guarda o que foi digitado; a lista recebe o termo APLICADO, que só
 * alcança o digitado quando a digitação para (`ESPERA_DA_BUSCA_MS`). Os dois
 * moram aqui, com o dono do campo, porque "Limpar busca" precisa zerar os dois
 * NA HORA: zerar só o digitado aplicaria primeiro o filtro limpo com o termo
 * velho (uma consulta intermediária que ninguém pediu) e o termo vazio só 250
 * ms depois.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Tags } from "lucide-react";

import ListaDeVagas from "@/admin/carreiras/ListaDeVagas";
import { ROTULO_ACESSIVEL_DO_LINK_DA_ABA, ROTULO_DO_LINK_DA_ABA } from "@/admin/carreiras/classificacoesDoPainel";
import {
  DICA_DA_BUSCA,
  ESPERA_DA_BUSCA_MS,
  FILTROS_DE_ESTADO,
  ROTULO_DA_BUSCA,
  ROTULO_DA_NOVA_VAGA,
  ROTULO_DO_FILTRO,
  TITULO_DA_ABA,
  alternarEstadoDoFiltro,
} from "@/admin/carreiras/listagem";
import { ENDERECO_DAS_CLASSIFICACOES, ENDERECO_DA_VAGA_NOVA } from "@/admin/carreiras/rotas";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function AbaDeCarreiras({ aoContar }) {
  const [termo, setTermo] = useState("");
  /* O termo APLICADO: o que já virou consulta. Nasce igual ao do campo, para o
     primeiro carregamento ser imediato. */
  const [termoAplicado, setTermoAplicado] = useState("");
  const [estado, setEstado] = useState(null);

  /* ── A espera da digitação ── */
  useEffect(() => {
    if (termo === termoAplicado) return undefined;
    const relogio = setTimeout(() => setTermoAplicado(termo), ESPERA_DA_BUSCA_MS);
    return () => clearTimeout(relogio);
  }, [termo, termoAplicado]);

  /* Zera o digitado, o APLICADO e o filtro no mesmo evento: uma renderização
     só, uma consulta só, sem esperar a digitação que não houve. */
  const limparBusca = () => {
    setTermo("");
    setTermoAplicado("");
    setEstado(null);
  };

  return (
    <div className="flex flex-col gap-6" data-papel="aba-de-carreiras">
      {/* O cabeçalho da aba: a barra tem o `<h1>` do Painel, e as linhas, o
          vazio e o erro têm `<h3>`. Sem este `<h2>` entre eles, quem navega
          por cabeçalhos pularia um nível. */}
      <h2 className="sr-only">{TITULO_DA_ABA}</h2>

      {/* ── A faixa: busca, filtro de UM Estado e a Vaga nova ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] max-w-sm flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            placeholder={DICA_DA_BUSCA}
            aria-label={ROTULO_DA_BUSCA}
            data-busca="vagas"
            className={cn(
              ANEL_DE_FOCO,
              "w-full rounded-controle border border-border-soft bg-surface py-2.5 pl-10 pr-4",
              "text-sm text-ink transition-colors placeholder:text-ink-muted",
            )}
          />
        </div>

        {/* O filtro de Estado: as palavras vêm do vocabulário, e cada botão diz
            se está marcado por `aria-pressed`, não só pela cor. */}
        <div role="group" aria-label={ROTULO_DO_FILTRO} className="flex flex-wrap items-center gap-1.5">
          {FILTROS_DE_ESTADO.map((filtro) => {
            const marcado = estado === filtro.estado;
            return (
              <button
                key={filtro.estado}
                type="button"
                data-filtro-de-estado-da-vaga={filtro.estado}
                aria-pressed={marcado}
                onClick={() => setEstado((atual) => alternarEstadoDoFiltro(atual, filtro.estado))}
                className={cn(
                  ANEL_DE_FOCO,
                  ALVO_DE_TOQUE,
                  "rounded-pilula border px-3 py-1.5 text-xs font-bold transition-colors",
                  marcado
                    ? "border-brand-action bg-brand-wash text-brand-action"
                    : "border-border-soft bg-surface text-ink-muted hover:border-border-strong hover:text-ink",
                )}
              >
                {filtro.rotulo}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* A entrada para Departamentos, Tipos e Níveis (Story 5.6): mudar a
            estrutura da empresa sem desenvolvedor. */}
        <Link
          to={ENDERECO_DAS_CLASSIFICACOES}
          data-acao="abrir-classificacoes"
          aria-label={ROTULO_ACESSIVEL_DO_LINK_DA_ABA}
          className={cn(
            ANEL_DE_FOCO,
            ALVO_DE_TOQUE,
            "inline-flex items-center gap-2 rounded-controle border border-border-strong bg-surface px-3",
            "text-sm font-semibold text-ink-secondary",
          )}
        >
          <Tags aria-hidden="true" className="size-4" />
          {ROTULO_DO_LINK_DA_ABA}
        </Link>

        <Button asChild className={cn(ANEL_DE_FOCO, ALVO_DE_TOQUE, "gap-2 rounded-controle font-bold")}>
          <Link to={ENDERECO_DA_VAGA_NOVA} data-acao="nova-vaga">
            <Plus aria-hidden="true" className="size-4" />
            {ROTULO_DA_NOVA_VAGA}
          </Link>
        </Button>
      </div>

      {/* ── A lista ── */}
      <ListaDeVagas termo={termoAplicado} estado={estado} aoContar={aoContar} aoLimparBusca={limparBusca} />
    </div>
  );
}
