import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Cookie, X } from "lucide-react";
import { EASE } from "@/lib/motion";
import {
  CATEGORIAS,
  consentiu,
  decisaoEscolhida,
  decisaoMinima,
  decisaoTotal,
  precisaPerguntar,
} from "@/domain/consentimento/cookies";
import {
  EVENTO_DE_ABERTURA,
  aplicarDecisao,
  gravarDecisao,
  lerDecisao,
  limparCookiesDeMarketing,
  pixelEstaCarregado,
} from "@/lib/consentimento";
import { esquecerOrigem, registrarOrigem } from "@/lib/atribuicao";

/**
 * A faixa de consentimento de cookies.
 *
 * ─── RECUSAR TEM QUE SER TÃO FÁCIL QUANTO ACEITAR ────────────────────────
 *
 * "Aceitar" e "Recusar" ficam lado a lado, do mesmo tamanho e com o mesmo peso
 * visual. O padrão escuro de sempre — botão verde gigante para aceitar e um
 * link cinza minúsculo escondido em "mais opções" para recusar — é justamente
 * o que a ANPD trata como consentimento viciado. O verde marca o botão
 * primário porque a marca é verde, e o outro botão tem a mesma área de clique.
 *
 * ─── NÃO BLOQUEIA A PÁGINA ───────────────────────────────────────────────
 *
 * Sem cortina modal por cima do conteúdo. Cookie de marketing não é condição
 * para ler o site, então prender a leitura atrás da resposta seria coagir a
 * resposta. A faixa fica no rodapé, o conteúdo continua acessível, e quem
 * ignorar segue sem rastreador — porque silêncio é recusa.
 *
 * O evento `chatclean:cookies` reabre este painel de qualquer lugar do site; é
 * o que o link do rodapé dispara. Consentimento que não pode ser retirado com
 * a mesma facilidade com que foi dado não é consentimento válido.
 */

const Interruptor = ({ id, ligado, obrigatoria, aoMudar, rotulo }) => (
  <button
    type="button"
    role="switch"
    aria-checked={ligado}
    aria-label={rotulo}
    disabled={obrigatoria}
    onClick={() => aoMudar(!ligado)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
      ligado ? "bg-emerald-500" : "bg-zinc-600"
    } ${obrigatoria ? "cursor-not-allowed opacity-60" : ""}`}
    id={`cookie-${id}`}
  >
    <span
      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${
        ligado ? "left-[22px]" : "left-0.5"
      }`}
    />
  </button>
);

export default function AvisoDeCookies() {
  const [decisao, setDecisao] = useState(null);
  const [visivel, setVisivel] = useState(false);
  const [detalhado, setDetalhado] = useState(false);
  const [escolhas, setEscolhas] = useState({
    preferencias: false,
    marketing: false,
  });
  const location = useLocation();
  const primeiraRota = useRef(true);

  // Primeira montagem: lê o que já foi decidido e aplica antes de desenhar.
  useEffect(() => {
    const guardada = lerDecisao();
    setDecisao(guardada);
    setEscolhas({
      preferencias: consentiu(guardada, "preferencias"),
      marketing: consentiu(guardada, "marketing"),
    });
    if (precisaPerguntar(guardada)) {
      setVisivel(true);
    } else {
      aplicarDecisao(guardada);
      registrarOrigem(guardada);
    }
  }, []);

  // Troca de rota conta visita nova — só quando há consentimento de marketing.
  useEffect(() => {
    if (primeiraRota.current) {
      primeiraRota.current = false;
      return;
    }
    if (decisao && consentiu(decisao, "marketing")) {
      aplicarDecisao(decisao, { contarVisita: true });
    }
  }, [location.pathname, decisao]);

  // O rodapé pede para reabrir.
  useEffect(() => {
    const abrir = () => {
      const atual = lerDecisao();
      setEscolhas({
        preferencias: consentiu(atual, "preferencias"),
        marketing: consentiu(atual, "marketing"),
      });
      setDetalhado(true);
      setVisivel(true);
    };
    window.addEventListener(EVENTO_DE_ABERTURA, abrir);
    return () => window.removeEventListener(EVENTO_DE_ABERTURA, abrir);
  }, []);

  const registrar = useCallback(
    (nova) => {
      const tinhaMarketing = decisao && consentiu(decisao, "marketing");
      const perdeMarketing = tinhaMarketing && !consentiu(nova, "marketing");

      gravarDecisao(nova);
      setDecisao(nova);
      setVisivel(false);
      setDetalhado(false);

      if (perdeMarketing) {
        // Script de terceiro não se descarrega. Limpa o que dá e recomeça a
        // página, para a próxima navegação nascer sem o Pixel no `window`.
        limparCookiesDeMarketing();
        esquecerOrigem();
        if (pixelEstaCarregado()) window.location.reload();
        return;
      }
      aplicarDecisao(nova);
      registrarOrigem(nova);
    },
    [decisao],
  );

  if (!visivel) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.35, ease: EASE.out }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="titulo-cookies"
        className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
      >
        <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-emerald-800/60 bg-zinc-900/95 shadow-2xl shadow-black/40 backdrop-blur-md">
          <div className="flex items-start gap-4 p-5 sm:p-6">
            <span className="hidden shrink-0 rounded-xl bg-emerald-500/15 p-2.5 text-emerald-400 sm:block">
              <Cookie className="h-5 w-5" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <h2
                id="titulo-cookies"
                className="text-base font-bold tracking-tight text-white"
              >
                Este site usa cookies
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
                Os essenciais mantêm o site funcionando. Os outros só entram se
                você deixar — e você pode mudar de ideia quando quiser.{" "}
                <Link
                  to="/politica-de-privacidade"
                  className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
                >
                  Ver a política de privacidade
                </Link>
                .
              </p>

              {detalhado && (
                <div className="mt-5 flex flex-col gap-3 border-t border-zinc-700/70 pt-5">
                  {CATEGORIAS.map((categoria) => {
                    const ligado = categoria.obrigatoria
                      ? true
                      : escolhas[categoria.id] === true;
                    return (
                      <div
                        key={categoria.id}
                        className="flex items-start justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <label
                            htmlFor={`cookie-${categoria.id}`}
                            className="text-sm font-bold text-white"
                          >
                            {categoria.nome}
                            {categoria.obrigatoria && (
                              <span className="ml-2 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                                Sempre ativo
                              </span>
                            )}
                          </label>
                          <p className="mt-0.5 text-[13px] leading-snug text-zinc-400">
                            {categoria.resumo}
                          </p>
                        </div>
                        <Interruptor
                          id={categoria.id}
                          rotulo={categoria.nome}
                          ligado={ligado}
                          obrigatoria={categoria.obrigatoria}
                          aoMudar={(novo) =>
                            setEscolhas((atual) => ({
                              ...atual,
                              [categoria.id]: novo,
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Aceitar e recusar com o mesmo peso, lado a lado. */}
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => registrar(decisaoTotal())}
                  className="rounded-full bg-emerald-500 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:min-w-[150px]"
                >
                  Aceitar todos
                </button>
                <button
                  type="button"
                  onClick={() => registrar(decisaoMinima())}
                  className="rounded-full bg-zinc-700 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 sm:min-w-[150px]"
                >
                  Recusar todos
                </button>

                {detalhado ? (
                  <button
                    type="button"
                    onClick={() => registrar(decisaoEscolhida(escolhas))}
                    className="rounded-full border border-zinc-600 px-6 py-2.5 text-sm font-bold text-zinc-200 transition-colors hover:border-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                  >
                    Salvar escolha
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDetalhado(true)}
                    className="rounded-full px-6 py-2.5 text-sm font-bold text-zinc-300 underline underline-offset-4 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                  >
                    Escolher o que aceito
                  </button>
                )}
              </div>
            </div>

            {/* Fechar sem responder mantém a recusa: nada opcional carrega. */}
            <button
              type="button"
              onClick={() => setVisivel(false)}
              aria-label="Fechar sem decidir agora"
              className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
