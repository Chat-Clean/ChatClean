import { useLocation } from "react-router-dom";
import ChatbotPopup from "@/components/ChatbotPopup";

/* Onde a Jéssica NÃO aparece.

   O Painel é ferramenta de quem trabalha no site, e não vitrine. E quem está
   no checkout já decidiu comprar: uma conversa de vendas abrindo por cima do
   formulário de pagamento só tira a pessoa do caminho. */
const SEM_JESSICA = [/^\/admin(\/|$)/i, /^\/assinar\/?$/i, /^\/assinatura(\/|$)/i];

/**
 * A Jéssica, em todas as páginas públicas do site.
 *
 * Montada UMA vez, acima das rotas, e não dentro de cada página: assim a
 * conversa continua de onde estava quando a pessoa troca de página, a janela
 * não reabre sozinha a cada navegação, e página nova nasce com ela sem ninguém
 * precisar lembrar de incluir.
 */
export default function ChatbotDoSite() {
  const { pathname } = useLocation();
  if (SEM_JESSICA.some((padrao) => padrao.test(pathname))) return null;
  return <ChatbotPopup />;
}
