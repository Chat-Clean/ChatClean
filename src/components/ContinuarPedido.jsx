import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, X } from "lucide-react";
import { planoPorId } from "@/domain/assinatura/planos";
import {
  enderecoDaRetomada,
  lerRascunho,
  valeRetomar,
} from "@/lib/rascunhoDaAssinatura";

/**
 * A faixa que devolve a pessoa ao pedido que ficou pela metade.
 *
 * ─── O LEAD MAIS QUENTE QUE EXISTE É O QUE QUASE COMPROU ─────────────────
 *
 * O rascunho já era salvo, mas ninguém era convidado a voltar. Quem preencheu
 * três campos e fechou a aba tinha os dados guardados e nenhuma pista de que
 * podia continuar — recomeçava do zero ou não voltava.
 *
 * ─── DISCRETA, E DISPENSÁVEL ─────────────────────────────────────────────
 *
 * Uma faixa fina no topo, não um modal. Quem fechou o pedido de propósito não
 * pode ser perseguido pela decisão: o X some com ela pelo resto da visita, e o
 * rascunho expira sozinho em sete dias.
 *
 * Só aparece com a categoria "Preferências" aceita — é `lerRascunho` que checa,
 * e é a mesma categoria que a faixa de cookies descreve com essas palavras.
 */

const DISPENSADA = "chatclean:retomada-dispensada";

export default function ContinuarPedido() {
  const [rascunho, setRascunho] = useState(null);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DISPENSADA) === "1") return;
    } catch {
      // Sem sessionStorage a faixa aparece; é o comportamento menos ruim.
    }
    const lido = lerRascunho();
    if (valeRetomar(lido)) setRascunho(lido);
  }, []);

  if (!rascunho) return null;

  const plano = planoPorId(rascunho.plano);
  if (!plano) return null;

  const dispensar = () => {
    try {
      window.sessionStorage.setItem(DISPENSADA, "1");
    } catch {
      // Não conseguir lembrar da dispensa não impede de dispensar agora.
    }
    setRascunho(null);
  };

  return (
    <div className="border-b border-emerald-100 bg-emerald-50">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-[13px] text-emerald-900 sm:text-sm">
          Você começou a contratar o{" "}
          <strong className="font-bold">{plano.nome}</strong>
          <span className="hidden sm:inline">
            {" "}
            para {rascunho.usuarios}{" "}
            {rascunho.usuarios === 1 ? "usuário" : "usuários"}
          </span>
          .
        </p>

        <Link
          to={enderecoDaRetomada(rascunho)}
          className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          Continuar
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>

        <button
          type="button"
          onClick={dispensar}
          aria-label="Dispensar o aviso do pedido em andamento"
          className="shrink-0 rounded-lg p-1 text-emerald-700/60 transition-colors hover:bg-emerald-100 hover:text-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
