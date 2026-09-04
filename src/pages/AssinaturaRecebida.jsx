import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Check, Clock, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { formatarMoeda } from "@/domain/assinatura/planos";
import {
  PARAMETRO_DO_PEDIDO,
  ehIdentificadorDePedido,
  leituraDoEstado,
  valeReconsultar,
} from "@/domain/assinatura/retorno";

/**
 * A tela para onde o Asaas devolve quem acabou de pagar.
 *
 * ─── O QUE ELA RESOLVE ────────────────────────────────────────────────────
 *
 * Antes dela, o checkout terminava na página do Asaas: a pessoa pagava e
 * ficava sem saber se alguém do outro lado tinha percebido. A conta é liberada
 * por webhook, e entre o pagamento e a liberação existe um intervalo em que a
 * única coisa honesta a fazer é dizer o que está acontecendo.
 *
 * ─── ELA NÃO DECIDE NADA ──────────────────────────────────────────────────
 *
 * Não confirma pagamento, não libera conta, não muda Estado. Lê o Estado que o
 * banco tem e traduz em uma frase, com o vocabulário fechado de
 * `domain/assinatura/retorno.js`. Quem confirma pagamento é o webhook do Asaas,
 * e esta tela nunca sabe mais do que ele.
 *
 * ─── POR QUE ELA RECONSULTA, E POR QUE ELA PARA ───────────────────────────
 *
 * Pix cai em segundos, e a pessoa costuma voltar antes disso. Sem reconsulta a
 * tela mostraria "aguardando" para sempre, e quem estivesse com ela aberta
 * precisaria recarregar no escuro. A reconsulta tem prazo: passados alguns
 * minutos ela para sozinha, porque manter uma aba batendo no servidor a noite
 * inteira não ajuda ninguém, e boleto não compensa em minutos de qualquer jeito.
 */

/** De quanto em quanto tempo a tela pergunta de novo. */
const INTERVALO_MS = 5000;

/** Depois disso, para de perguntar. Boleto não compensa nesta janela. */
const LIMITE_DE_RECONSULTA_MS = 5 * 60 * 1000;

const APARENCIA = Object.freeze({
  aguardando: {
    Icone: Clock,
    anel: "bg-amber-50 text-amber-600",
    borda: "border-amber-100",
  },
  pago: {
    Icone: Loader2,
    anel: "bg-emerald-50 text-emerald-600",
    borda: "border-emerald-100",
  },
  ativo: {
    Icone: Check,
    anel: "bg-emerald-50 text-emerald-600",
    borda: "border-emerald-100",
  },
  encerrado: {
    Icone: AlertCircle,
    anel: "bg-zinc-100 text-zinc-500",
    borda: "border-zinc-200",
  },
  problema: {
    Icone: AlertCircle,
    anel: "bg-red-50 text-red-600",
    borda: "border-red-100",
  },
});

export default function AssinaturaRecebida() {
  const [parametros] = useSearchParams();
  const pedidoId = parametros.get(PARAMETRO_DO_PEDIDO) ?? "";

  const [pedido, setPedido] = useState(null);
  const [falha, setFalha] = useState("");
  const [carregando, setCarregando] = useState(true);
  const comecouEm = useRef(Date.now());

  const consultar = useCallback(async () => {
    if (!ehIdentificadorDePedido(pedidoId)) {
      setFalha("não encontramos este pedido.");
      setCarregando(false);
      return null;
    }

    try {
      const resposta = await fetch(
        `/api/pedido?${PARAMETRO_DO_PEDIDO}=${encodeURIComponent(pedidoId)}`,
        { headers: { Accept: "application/json" } },
      );
      const corpo = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        setFalha(corpo.mensagem ?? "não conseguimos consultar seu pedido.");
        setCarregando(false);
        return null;
      }

      setFalha("");
      setPedido(corpo);
      setCarregando(false);
      return corpo;
    } catch {
      setFalha("não conseguimos falar com o servidor. Confira sua conexão.");
      setCarregando(false);
      return null;
    }
  }, [pedidoId]);

  useEffect(() => {
    let vivo = true;
    let temporizador = null;

    const rodada = async () => {
      const lido = await consultar();
      if (!vivo) return;

      const passou = Date.now() - comecouEm.current;
      if (
        lido &&
        valeReconsultar(lido.estado) &&
        passou < LIMITE_DE_RECONSULTA_MS
      ) {
        temporizador = window.setTimeout(rodada, INTERVALO_MS);
      }
    };

    rodada();

    return () => {
      vivo = false;
      if (temporizador !== null) window.clearTimeout(temporizador);
    };
  }, [consultar]);

  // Estado fora do vocabulário é defeito nosso, e não pode virar tela branca
  // logo depois de alguém ter pagado: a tela cai para a fala de "aguardando",
  // que é a única segura de dizer sem saber.
  let fala = null;
  if (pedido) {
    try {
      fala = leituraDoEstado(pedido.estado);
    } catch {
      fala = leituraDoEstado("aguardando_pagamento");
    }
  }

  const aparencia = fala ? APARENCIA[fala.situacao] : null;
  const Icone = aparencia?.Icone ?? Clock;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <Navbar />

      <main className="mx-auto max-w-2xl px-4 py-20 md:py-28">
        {carregando && (
          <div className="flex items-center gap-3 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Consultando seu pedido...</span>
          </div>
        )}

        {!carregando && falha && (
          <div className="rounded-2xl border border-red-100 bg-white p-8">
            <h1 className="mb-3 text-2xl font-black tracking-tight">
              Não conseguimos abrir este pedido
            </h1>
            <p className="mb-6 text-zinc-600">{falha}</p>
            <Link
              to="/#planos"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Voltar aos planos
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}

        {!carregando && !falha && fala && (
          <div
            className={`rounded-2xl border bg-white p-8 md:p-10 ${aparencia.borda}`}
          >
            <div
              className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full ${aparencia.anel}`}
            >
              <Icone
                className={`h-6 w-6 ${fala.situacao === "pago" ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </div>

            <h1 className="mb-3 text-2xl font-black tracking-tight md:text-3xl">
              {fala.titulo}
            </h1>
            <p className="text-lg leading-relaxed text-zinc-600">{fala.texto}</p>

            {pedido.planoNome && (
              <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-6 text-sm">
                <div>
                  <dt className="text-zinc-500">Plano</dt>
                  <dd className="font-semibold">{pedido.planoNome}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Mensalidade</dt>
                  <dd className="font-semibold">
                    {formatarMoeda(pedido.valorCentavos / 100)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Usuários</dt>
                  <dd className="font-semibold">{pedido.usuarios}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Conexões</dt>
                  <dd className="font-semibold">{pedido.conexoes}</dd>
                </div>
              </dl>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
              >
                Voltar ao site
              </Link>
              {fala.situacao === "problema" && (
                <a
                  href="https://api.whatsapp.com/send?phone=5584998900718&text=Paguei+a+assinatura+e+minha+conta+ainda+nao+subiu"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-zinc-50"
                >
                  Falar no WhatsApp
                </a>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
