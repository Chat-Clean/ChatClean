import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { EASE } from "@/lib/motion";
import chatcleanLogoWhite from "/chatclean-white.svg";
import chatcleanLogoGreen from "/chatclean.svg";

const NAV_ITEMS = [
  { name: "Home",           type: "anchor", anchor: "#home" },
  { name: "Funcionalidades",type: "anchor", anchor: "#funcionalidades" },
  { name: "Sobre",          type: "link",   href: "/sobre" },
  { name: "Blog",           type: "link",   href: "/blog" },
  { name: "Carreiras",      type: "link",   href: "/carreiras" },
  { name: "FAQ",            type: "anchor", anchor: "#faq" },
  { name: "Contato",        type: "anchor", anchor: "#contato" },
];

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
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const renderItem = (item, mobile = false) => {
    const cls = mobile
      ? "block px-4 py-3 text-base font-medium text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-xl transition-colors"
      : desktopLinkClass;

    if (item.type === "link") {
      return (
        <Link key={item.name} to={item.href} onClick={mobile ? closeMobileMenu : undefined} className={cls}>
          {item.name}
        </Link>
      );
    }

    // anchor: on home use #hash; on other pages navigate to /#hash via Link
    if (isHome) {
      return (
        <a key={item.name} href={item.anchor} onClick={mobile ? closeMobileMenu : undefined} className={cls}>
          {item.name}
        </a>
      );
    }
    return (
      <Link key={item.name} to={`/${item.anchor}`} onClick={mobile ? closeMobileMenu : undefined} className={cls}>
        {item.name}
      </Link>
    );
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-white/85 backdrop-blur-xl border-b border-zinc-100 shadow-[0_4px_30px_rgba(0,0,0,0.04)]"
            : "bg-transparent border-b border-white/10"
        }`}
      >
        <div className="mx-auto sm:px-20">
          <div className="flex justify-between items-center h-20 px-4">
            {/* Logo */}
            <Link
              to="/"
              className="transition-transform hover:scale-105 active:scale-95 duration-200"
            >
              <img
                src={scrolled ? chatcleanLogoGreen : chatcleanLogoWhite}
                alt="ChatClean"
                className="h-9 w-auto transition-opacity"
              />
            </Link>

            {/* Desktop nav */}
            <nav
              className={`hidden md:flex items-center rounded-full px-2 py-1 transition-all duration-500 ${
                scrolled
                  ? "bg-zinc-50 border border-zinc-100 shadow-sm"
                  : "bg-white/15 border border-white/30 backdrop-blur-md"
              }`}
            >
              {NAV_ITEMS.map((item) => renderItem(item))}
            </nav>

            {/* Área do Cliente button */}
            <div className="hidden md:flex items-center">
              <Button
                onClick={() => setIsLoginModalOpen(true)}
                className={`transition-all duration-500 hover:scale-[1.03] active:scale-95 px-6 h-12 rounded-full cursor-pointer font-bold ${
                  scrolled
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-white hover:bg-emerald-50 text-emerald-700 shadow-xl"
                }`}
              >
                <Users className="h-4 w-4 mr-2" />
                Área do Cliente
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
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE.out }}
                className="md:hidden overflow-hidden border-t border-zinc-100 bg-white/95 backdrop-blur-xl"
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
