import { Link } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";
import chatcleanLogoWhite from "/chatclean-white.svg";
import { abrirPreferenciasDeCookies } from "@/lib/consentimento";
import { LINK_DO_WHATSAPP } from "@/domain/whatsapp";


export default function Footer() {
  return (
    <footer
      id="contato"
      className="bg-zinc-950 text-zinc-300 py-8 border-t border-zinc-900"
    >
      {/* No celular as colunas andam de DUAS em duas, e não uma embaixo da
          outra: empilhadas, o rodapé passava de uma tela inteira de altura. A
          marca e o Contato ocupam a linha toda — o e-mail não cabe em meia.
          No tablet a marca e o Contato dividem a primeira linha (`order`), e
          as quatro listas de links ficam na segunda. */}
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr_1.6fr] md:[&>div]:order-3 lg:[&>div]:order-none">
        <div className="col-span-2 md:order-1! lg:order-none! lg:col-span-1">
          <div className="flex items-center space-x-2 mb-4">
            <img src={chatcleanLogoWhite} alt="ChatClean" className="h-7 w-auto" />
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
            A plataforma de CRM e ChatBot para WhatsApp com API Oficial mais
            completa do Brasil.
          </p>
        </div>

        <div>
          <h4 className="text-white font-bold mb-4">Produto</h4>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <Link to="/#funcionalidades" className="hover:text-emerald-400 transition-colors">
                Funcionalidades
              </Link>
            </li>
            <li>
              <Link to="/api-oficial-whatsapp" className="hover:text-emerald-400 transition-colors">
                API Oficial WhatsApp
              </Link>
            </li>
            <li>
              <Link to="/integracoes" className="hover:text-emerald-400 transition-colors">
                Integrações
              </Link>
            </li>
            <li>
              <Link to="/#faq" className="hover:text-emerald-400 transition-colors">
                FAQ
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-4">Empresa</h4>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <Link to="/sobre" className="hover:text-emerald-400 transition-colors">
                Sobre Nós
              </Link>
            </li>
            <li>
              <Link to="/blog" className="hover:text-emerald-400 transition-colors">
                Blog
              </Link>
            </li>
            <li>
              <Link to="/carreiras" className="hover:text-emerald-400 transition-colors">
                Carreiras
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-4">Suporte</h4>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <Link to="/#faq" className="hover:text-emerald-400 transition-colors">
                Central de Ajuda
              </Link>
            </li>
            <li>
              <a
                href={LINK_DO_WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-400 transition-colors"
              >
                Falar com a gente
              </a>
            </li>
            <li>
              <a
                href="https://status.chatclean.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-400 transition-colors"
              >
                Status
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-4">Legal</h4>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <Link to="/politica-de-privacidade" className="hover:text-emerald-400 transition-colors">
                Política de Privacidade
              </Link>
            </li>
            <li>
              <Link to="/termos-de-servico" className="hover:text-emerald-400 transition-colors">
                Termos de Serviço
              </Link>
            </li>
            {/* Retirar o consentimento tem que ser tão fácil quanto dar. Sem
                uma porta permanente, o "aceitar" da faixa seria definitivo. */}
            <li>
              <button
                type="button"
                onClick={abrirPreferenciasDeCookies}
                className="text-left hover:text-emerald-400 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
              >
                Preferências de cookies
              </button>
            </li>
          </ul>
        </div>

        <div className="col-span-2 md:order-2! lg:order-none! lg:col-span-1">
          <h4 className="text-white font-bold mb-4">Contato</h4>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <a
                href="tel:+5584998900718"
                className="flex items-center gap-2 hover:text-emerald-400 transition-colors"
              >
                <Phone className="w-4 h-4 flex-shrink-0" />
                <span>+55 84 99890-0718</span>
              </a>
            </li>
            <li>
              <a
                href="mailto:contato@chatclean.com.br"
                className="flex items-center gap-2 hover:text-emerald-400 transition-colors"
              >
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span>contato@chatclean.com.br</span>
              </a>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Av. Prudente de Morais, 5121, Natal-RN</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8 pt-6 border-t border-zinc-900 text-center text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} ChatClean. Todos os direitos reservados.
        CNPJ: 57.487.327/0001-57
      </div>
    </footer>
  );
}
