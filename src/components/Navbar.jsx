import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Menu, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { EASE } from "@/lib/motion";
import { CHECKOUT_ATIVO } from "@/lib/checkout";
// Sobre a hero escura a marca é a versão em latão; depois dela, a verde
import chatcleanLogoLatao from "/chatclean-latao.png";
import chatcleanLogoGreen from "/chatclean.svg";

/* `atalhos`: seções da própria home. Não ocupam a barra; abrem num card
   quando o cursor (ou o foco do teclado) chega em Home.

   O atalho de Planos aponta para uma âncora que só existe quando a seção
   existe. Com o checkout desligado ele sai da lista, em vez de virar um link
   que rola para lugar nenhum. */
const NAV_ITEMS = [
  {
    name: "Home",
    type: "anchor",
    anchor: "#home",
    atalhos: [
      { name: "Funcionalidades", type: "anchor", anchor: "#funcionalidades" },
      { name: "FAQ",             type: "anchor", anchor: "#faq" },
      { name: "Contato",         type: "anchor", anchor: "#contato" },
    ],
  },
  ...(CHECKOUT_ATIVO
    ? [{ name: "Planos", type: "anchor", anchor: "#planos" }]
    : []),
  { name: "Sobre",          type: "link",   href: "/sobre" },
  { name: "Blog",           type: "link",   href: "/blog" },
  { name: "Carreiras",      type: "link",   href: "/carreiras" },
];

// Altura da barra fixa (`h-20`): a seção de destino para logo abaixo dela
const ALTURA_DA_BARRA = 80;

const LoginModal = ({ isOpen, onClose }) => (
  <div
    className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-300 ${
      isOpen ? "opacity-100 visible" : "opacity-0 invisible"
    }`}
  >
    <div
      className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md"
      onClick={onClose}
    />
    <div
      className={`relative w-full max-w-md transform transition-all duration-300 ${
        isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
      } rounded-3xl bg-white p-8 shadow-2xl border border-zinc-100`}
    >
      <button
        onClick={onClose}
        className="absolute right-6 top-6 p-2 rounded-full hover:bg-zinc-100 transition-colors"
      >
        <X className="h-5 w-5 text-zinc-400" />
      </button>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-zinc-900 mb-2">Acesse sua conta</h2>
        <p className="text-zinc-500 text-sm">
          Escolha a versão da plataforma que deseja utilizar:
        </p>
      </div>
      <div className="space-y-4">
        <a
          href="https://beta.chatclean.com.br/"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center p-5 border border-zinc-200 bg-white rounded-2xl hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-50 transition-all duration-300"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-lg shadow-emerald-200 transition-transform group-hover:scale-110">
            <span className="text-lg font-bold">1</span>
          </div>
          <div className="ml-4">
            <h4 className="font-bold text-zinc-900 text-lg">ChatClean</h4>
            <p className="text-sm text-zinc-500">Servidor 1</p>
          </div>
        </a>
        <a
          href="https://beta2.chatclean.com.br/"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center p-5 border border-zinc-200 bg-white rounded-2xl hover:border-blue-500 hover:shadow-xl hover:shadow-blue-50 transition-all duration-300"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-200 transition-transform group-hover:scale-110">
            <span className="text-lg font-bold">2</span>
          </div>
          <div className="ml-4">
            <h4 className="font-bold text-zinc-900 text-lg">ChatClean</h4>
            <p className="text-sm text-zinc-500">Servidor 2</p>
          </div>
        </a>
      </div>
    </div>
  </div>
);

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";

  useEffect(() => {
    // Encontra a seção escura no topo da página atual: a hero verde
    // (aurora-bg) das páginas internas ou a hero com foto da home
    const greenSection = document.querySelector(
      "section.aurora-bg, section[data-hero-escura]",
    );

    if (!greenSection) {
      // Página sem hero verde → navbar sempre branca
      setScrolled(true);
      return;
    }

    // Verificação inicial (caso a página já esteja scrollada ao carregar)
    const rect = greenSection.getBoundingClientRect();
    setScrolled(rect.bottom <= 0);

    // Observa quando a seção verde sai completamente do viewport
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }, // dispara quando o ÚLTIMO pixel sai da tela
    );

    observer.observe(greenSection);
    return () => observer.disconnect();
  }, [location.pathname]); // reavalia a cada mudança de rota

  useEffect(() => {
    document.body.style.overflow = isLoginModalOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isLoginModalOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const closeMobileMenu = () => setIsMenuOpen(false);

  const desktopLinkClass = `px-4 py-2 text-sm font-medium transition-all rounded-full ${
    scrolled
      ? "text-zinc-600 hover:text-emerald-600 hover:bg-emerald-50"
      : "text-white/90 hover:text-white hover:bg-white/15"
  }`;

  // Card dos atalhos da home. Abre no hover e no foco; fecha com um pequeno
  // atraso, para o cursor atravessar o vão entre "Home" e o card sem que ele
  // suma no caminho.
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);
  const fecharAtalhosEm = useRef(null);
  const abrirAtalhos = () => {
    clearTimeout(fecharAtalhosEm.current);
    setAtalhosAbertos(true);
  };
  const fecharAtalhos = (atraso = 150) => {
    clearTimeout(fecharAtalhosEm.current);
    fecharAtalhosEm.current = setTimeout(() => setAtalhosAbertos(false), atraso);
  };
  useEffect(() => () => clearTimeout(fecharAtalhosEm.current), []);

  // Ir a uma seção da home. O salto nativo do navegador (`href="#faq"`) não
  // servia: no celular a rolagem suave era interrompida pelo menu fechando
  // por cima dela, e a seção parava escondida sob a barra fixa. Aqui a
  // rolagem é nossa, descontando a barra, e no celular só começa quando o
  // menu termina de fechar (`onExitComplete` do menu).
  const navigate = useNavigate();
  const secaoPendente = useRef(null);
  const rolarPara = (ancora) => {
    const alvo = document.querySelector(ancora);
    if (!alvo) return;
    const topo =
      ancora === "#home"
        ? 0
        : alvo.getBoundingClientRect().top + window.scrollY - ALTURA_DA_BARRA;
    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: Math.max(0, topo), behavior: semMovimento ? "auto" : "smooth" });
  };
  const irParaSecao = (evento, ancora, noMenuDoCelular) => {
    evento.preventDefault();
    navigate({ hash: ancora });
    if (noMenuDoCelular) {
      secaoPendente.current = ancora;
      closeMobileMenu();
    } else {
      rolarPara(ancora);
    }
  };
  const aoFecharMenuDoCelular = () => {
    if (!secaoPendente.current) return;
    rolarPara(secaoPendente.current);
    secaoPendente.current = null;
  };

  // Link de um item: rota vira <Link>; âncora é #hash na home e /#hash fora dela
  const renderLink = (item, className, onClick, extras = {}) => {
    const { children = item.name, ...resto } = extras;
    if (item.type === "link") {
      return (
        <Link key={item.name} to={item.href} onClick={onClick} className={className} {...resto}>
          {children}
        </Link>
      );
    }
    if (isHome) {
      const noMenuDoCelular = onClick === closeMobileMenu;
      return (
        <a
          key={item.name}
          href={item.anchor}
          onClick={(evento) => {
            if (!noMenuDoCelular) onClick?.();
            irParaSecao(evento, item.anchor, noMenuDoCelular);
          }}
          className={className}
          {...resto}
        >
          {children}
        </a>
      );
    }
    return (
      <Link key={item.name} to={`/${item.anchor}`} onClick={onClick} className={className} {...resto}>
        {children}
      </Link>
    );
  };

  const renderItem = (item, mobile = false) => {
    if (mobile) {
      const cls =
        "block px-4 py-3 text-base font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-colors";
      if (!item.atalhos) return renderLink(item, cls, closeMobileMenu);
      // No celular não há hover: os atalhos aparecem direto, recuados sob Home
      return (
        <div key={item.name}>
          {renderLink(item, cls, closeMobileMenu)}
          <div className="ml-4 border-l border-zinc-200 pl-2">
            {item.atalhos.map((atalho) =>
              renderLink(
                atalho,
                "block px-4 py-2.5 text-[15px] text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-colors",
                closeMobileMenu,
              ),
            )}
          </div>
        </div>
      );
    }

    if (!item.atalhos) return renderLink(item, desktopLinkClass);

    return (
      <div
        key={item.name}
        className="relative"
        onMouseEnter={abrirAtalhos}
        onMouseLeave={() => fecharAtalhos()}
        onFocus={abrirAtalhos}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) fecharAtalhos(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") fecharAtalhos(0);
        }}
      >
        {renderLink(item, `${desktopLinkClass} inline-flex items-center gap-1`, undefined, {
          "aria-haspopup": "true",
          "aria-expanded": atalhosAbertos,
          children: (
            <>
              {item.name}
              <ChevronDown
                aria-hidden="true"
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  atalhosAbertos ? "rotate-180" : ""
                }`}
              />
            </>
          ),
        })}

        {atalhosAbertos && (
            // Sem animação de entrada, de propósito: um ancestral com opacidade
            // abaixo de 1 corta o `backdrop-filter`, e o card surgia chapado e
            // só ganhava o vidro quando o fade terminava. O `pt-3` é a ponte
            // invisível entre o item e o card.
            <div className="absolute left-0 top-full z-50 pt-3">
              {/* O mesmo vidro da barra: branco translúcido sobre a hero,
                  creme translúcido depois dela. O desfoque só alcança a
                  página porque nenhum ancestral tem `backdrop-filter` (ver
                  as camadas de fundo do <header> e do <nav>). */}
              <div
                className={`min-w-52 rounded-xl p-2 ring-1 ${
                  scrolled
                    ? "bg-creme/85 backdrop-blur-md ring-creme-borda shadow-[0_18px_40px_-12px_rgba(20,35,27,0.25)]"
                    : "bg-white/15 backdrop-blur-md ring-white/30 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)]"
                }`}
              >
                {item.atalhos.map((atalho) =>
                  renderLink(
                    atalho,
                    `block rounded-lg px-4 py-2.5 text-[15px] font-medium transition-colors focus-visible:outline-none ${
                      scrolled
                        ? "text-zinc-900 hover:bg-emerald-50/80 hover:text-emerald-700 focus-visible:bg-emerald-50/80 focus-visible:text-emerald-700"
                        : "text-white hover:bg-white/15 focus-visible:bg-white/15"
                    }`,
                    () => fecharAtalhos(0),
                  ),
                )}
              </div>
            </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Ao sair da hero, a barra NÃO troca de cor: as duas versões estão
          sobrepostas e uma dissolve na outra (opacidade), aqui e no logotipo,
          na pílula e no botão. Antes a troca era seca; e animar a borda, em
          vez da camada inteira, deixava um fio creme visível sobre a foto.

          O vidro mora nesta camada, e não no próprio <header>, porque
          `backdrop-filter` num ancestral impede o card de atalhos de
          desfocar a página. */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 -z-10 bg-creme/85 backdrop-blur-md border-b border-creme-borda shadow-[0_4px_30px_rgba(0,0,0,0.04)] transition-opacity duration-300 ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        />
        <div className="mx-auto sm:px-20">
          <div className="flex justify-between items-center h-20 px-4">
            {/* Logo */}
            <Link
              to="/"
              className="transition-transform hover:scale-105 active:scale-95 duration-200"
            >
              {/* Os dois logotipos empilhados: o latão some enquanto o verde
                  aparece. O verde é o que ocupa espaço; o latão fica por cima. */}
              <span className="relative block h-9">
                <img
                  src={chatcleanLogoGreen}
                  alt="ChatClean"
                  className={`h-9 w-auto transition-opacity duration-300 ${scrolled ? "opacity-100" : "opacity-0"}`}
                />
                <img
                  src={chatcleanLogoLatao}
                  alt=""
                  aria-hidden="true"
                  className={`absolute left-0 top-0 h-9 w-auto transition-opacity duration-300 ${scrolled ? "opacity-0" : "opacity-100"}`}
                />
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="relative hidden md:flex items-center rounded-full px-2 py-1">
              {/* Fundo da pílula em camada própria, pelo mesmo motivo do header */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 -z-10 rounded-full border bg-white/15 border-white/30 backdrop-blur-md transition-opacity duration-300 ${
                  scrolled ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 -z-10 rounded-full border bg-zinc-50 border-zinc-100 shadow-sm transition-opacity duration-300 ${
                  scrolled ? "opacity-100" : "opacity-0"
                }`}
              />
              {NAV_ITEMS.map((item) => renderItem(item))}
            </nav>

            {/* Área do Cliente button */}
            <div className="hidden md:flex items-center">
              {/* O latão cobre o verde e dissolve quando a barra muda. O texto
                  é branco nos dois, então só o fundo troca. */}
              <Button
                onClick={() => setIsLoginModalOpen(true)}
                className={`relative bg-emerald-500 hover:bg-emerald-600 text-white transition-transform duration-200 hover:scale-[1.03] active:scale-95 px-6 h-12 rounded-full cursor-pointer font-bold ${
                  scrolled ? "shadow-lg shadow-emerald-500/30" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`botao-latao pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300 ${
                    scrolled ? "opacity-0" : "opacity-100"
                  }`}
                />
                <Users className="relative h-4 w-4 mr-2" />
                <span className="relative">Área do Cliente</span>
              </Button>
            </div>

            {/* Mobile trigger */}
            <button
              className={`md:hidden p-2 transition-colors ${
                scrolled ? "text-zinc-700 hover:text-emerald-600" : "text-white"
              }`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Abrir menu"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile menu */}
          <AnimatePresence onExitComplete={aoFecharMenuDoCelular}>
            {isMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE.out }}
                className="md:hidden overflow-hidden border-t border-zinc-100 bg-white/95 backdrop-blur-md"
              >
                <nav className="flex flex-col py-4 px-4 gap-1">
                  {NAV_ITEMS.map((item, idx) => (
                    <motion.div
                      key={item.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * idx, duration: 0.3 }}
                    >
                      {renderItem(item, true)}
                    </motion.div>
                  ))}
                  <Button
                    onClick={() => { closeMobileMenu(); setIsLoginModalOpen(true); }}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white mt-4 rounded-full font-bold"
                  >
                    Área do Cliente
                  </Button>
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </>
  );
}
