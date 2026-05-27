import { Link } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";
import chatcleanLogoWhite from "/chatclean-white.svg";

const WHATSAPP_LINK =
  "https://api.whatsapp.com/send?phone=5584996950105&text=Ol%C3%A1%2C+eu+vim+pelo+site";

export default function Footer() {
  return (
    <footer
      id="contato"
      className="bg-zinc-950 text-zinc-300 py-16 border-t border-zinc-900"
    >
      <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-4 gap-12">
        <div>
          <div className="flex items-center space-x-2 mb-6">
            <img src={chatcleanLogoWhite} alt="ChatClean" className="h-8 w-auto" />
          </div>
          <p className="text-zinc-500 mb-6 text-sm leading-relaxed">
            A plataforma de CRM e ChatBot para WhatsApp com API Oficial mais
            completa do Brasil.
          </p>
          <div className="space-y-2 text-sm text-zinc-400">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 flex-shrink-0" />
              <span>+55 84 9695-0105</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 flex-shrink-0" />
              <span>contato@chatclean.com.br</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Av. Prudente de Morais, 5121, Natal-RN</span>
            </div>
          </div>
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
              <Link to="/#funcionalidades" className="hover:text-emerald-400 transition-colors">
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
                href={WHATSAPP_LINK}
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
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-16 pt-8 border-t border-zinc-900 text-center text-xs text-zinc-600">
        &copy; {new Date().getFullYear()} ChatClean. Todos os direitos reservados.
        CNPJ: 57.487.327/0001-57
      </div>
    </footer>
  );
}
