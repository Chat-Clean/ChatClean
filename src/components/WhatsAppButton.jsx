import { MessageCircle } from "lucide-react";
import "./WhatsAppButton.css";

export function WhatsAppButton() {
  const whatsappNumber = "5584996950105";
  const message = "Olá, eu vim pelo site";
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-button"
      title="Fale conosco no WhatsApp"
    >
      <MessageCircle className="whatsapp-icon" />
    </a>
  );
}
