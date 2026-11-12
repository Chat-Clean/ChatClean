import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import {
  CHAVE_DO_POPUP_VISTO,
  LINK_DA_CAMPANHA,
  campanhaNoAr,
  paginaComCampanha,
} from "@/domain/campanha/blackNovember";
import { atribuicaoParaEnvio } from "@/lib/atribuicao";
import "./blackNovember.css";

const ARTE = "/black-november/arte.webp";
const ETIQUETA = "/black-november/etiqueta.webp";

/* Quanto esperar, depois de a página abrir, para o pop-up aparecer sozinho:
   o bastante para a pessoa ver onde chegou antes de ser interrompida. */
const ESPERA_DO_POPUP = 1800;

/**
 * Rastreio da campanha.
 *
 * O Meta Pixel só existe (`window.fbq`) para quem aceitou cookies de
 * marketing, e é essa a regra: sem consentimento, nada sai daqui para fora.
 * O `dataLayer` é só uma fila na própria página, pronta para um Tag Manager
 * se um dia entrar, e não envia nada sozinho.
 */
function rastrear(evento, dados = {}) {
  if (typeof window === "undefined") return;
  const origem = atribuicaoParaEnvio() ?? {};
  const campos = {
    campanha: "black-november-2026",
    pagina: window.location.pathname,
    ...(origem.utm_source && { utm_source: origem.utm_source }),
    ...(origem.utm_campaign && { utm_campaign: origem.utm_campaign }),
    ...dados,
  };
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: evento, ...campos });
  } catch {
    // A fila é conveniência: falhar não pode quebrar o pop-up.
  }
  if (typeof window.fbq !== "function") return;
  if (evento === "black_november_clique") {
    window.fbq("track", "Contact", { content_name: "Black November", ...campos });
    window.fbq("trackCustom", "BlackNovemberClique", campos);
  } else if (evento === "black_november_popup") {
    window.fbq("trackCustom", "BlackNovemberPopup", campos);
  } else if (evento === "black_november_etiqueta") {
    window.fbq("trackCustom", "BlackNovemberEtiqueta", campos);
  }
}

function jaViuOPopup() {
  try {
    return window.sessionStorage.getItem(CHAVE_DO_POPUP_VISTO) === "1";
  } catch {
    return false;
  }
}

function marcarPopupVisto() {
  try {
    window.sessionStorage.setItem(CHAVE_DO_POPUP_VISTO, "1");
  } catch {
    // Sem armazenamento, o pior caso é o pop-up abrir de novo noutra página.
  }
}

/**
 * A Black November no site inteiro: o pop-up com a arte, que abre sozinho uma
 * vez por visita, e a etiqueta que flutua à esquerda em toda página pública e
 * reabre o pop-up. Montado uma vez, acima das rotas, como a Jéssica.
 */
export default function BlackNovember() {
  const { pathname } = useLocation();
  const visivel = campanhaNoAr() && paginaComCampanha(pathname);
  const [aberto, setAberto] = useState(false);

  const abrir = useCallback((origem) => {
    marcarPopupVisto();
    setAberto(true);
    rastrear("black_november_popup", { origem });
  }, []);

  // Primeira página pública da visita: abre sozinho, depois de um respiro.
  useEffect(() => {
    if (!visivel || jaViuOPopup()) return undefined;
    const imagem = new Image();
    imagem.src = ARTE;
    const timer = window.setTimeout(() => {
      if (!jaViuOPopup()) abrir("automatico");
    }, ESPERA_DO_POPUP);
    return () => window.clearTimeout(timer);
  }, [visivel, abrir]);

  // Trocar para uma página sem campanha (Painel, checkout) fecha o pop-up.
  useEffect(() => {
    if (!visivel) setAberto(false);
  }, [visivel]);

  if (!visivel) return null;

  return (
    <>
      {/* `key` pela rota: a cada página nova a etiqueta entra de novo,
          balançando, e acompanha a pessoa pelo site. */}
      {!aberto && (
        <EtiquetaFlutuante
          key={pathname}
          aoClicar={() => {
            rastrear("black_november_etiqueta");
            abrir("etiqueta");
          }}
        />
      )}
      {aberto && <PopupBlackNovember aoFechar={() => setAberto(false)} />}
    </>
  );
}

function EtiquetaFlutuante({ aoClicar }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="bn-etiqueta"
      aria-label="Ver a oferta da Black November da ChatClean"
      title="Black November ChatClean"
    >
      <span className="bn-etiqueta-balanco">
        <img src={ETIQUETA} alt="" width={560} height={280} draggable="false" />
        <span className="bn-etiqueta-brilho" aria-hidden="true" />
      </span>
    </button>
  );
}

function PopupBlackNovember({ aoFechar }) {
  const refFechar = useRef(null);
  const [saindo, setSaindo] = useState(false);

  const fechar = useCallback(() => {
    setSaindo(true);
    window.setTimeout(aoFechar, 220);
  }, [aoFechar]);

  useEffect(() => {
    const focoAnterior = document.activeElement;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    refFechar.current?.focus({ preventScroll: true });

    const aoTeclar = (evento) => {
      if (evento.key === "Escape") fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = rolagem;
      if (focoAnterior instanceof HTMLElement) focoAnterior.focus({ preventScroll: true });
    };
  }, [fechar]);

  return (
    <div
      className={`bn-fundo${saindo ? " bn-saindo" : ""}`}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) fechar();
      }}
    >
      <div
        className="bn-janela"
        role="dialog"
        aria-modal="true"
        aria-label="Black November ChatClean: API Oficial gratuita na implantação"
      >
        <img
          src={ARTE}
          width={1080}
          height={1080}
          alt="Black November ChatClean: API Oficial gratuita na implantação dos nossos serviços. Condições especiais nos nossos planos durante todo o mês. Parceiro oficial da Meta."
          className="bn-arte"
          draggable="false"
        />

        {/* O botão de verdade, em cima do "COMECE AGORA!" da arte, com o
            mesmo desenho (recortado da própria arte) e no mesmo lugar. */}
        <a
          href={LINK_DA_CAMPANHA}
          target="_blank"
          rel="noopener noreferrer"
          className="bn-botao"
          onClick={() => {
            rastrear("black_november_clique");
            marcarPopupVisto();
          }}
        >
          <span className="sr-only">Comece agora! Falar com a ChatClean no WhatsApp</span>
        </a>

        <button
          ref={refFechar}
          type="button"
          onClick={fechar}
          className="bn-fechar"
          aria-label="Fechar"
        >
          <X className="size-5" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
