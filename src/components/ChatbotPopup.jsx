import { useState, useEffect, useRef } from "react";
import { X, Send } from "lucide-react";
import avatarImg from "../assets/perfil.jpg";

export default function ChatbotPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [inputValue, setInputValue] = useState("");

  const [userData, setUserData] = useState({
    nome: "",
    nome_empresa: "",
    telefone: "",
    cargo: "",
    qtd_colaboradores: "",
    possui_site: "",
  });

  const messagesEndRef = useRef(null);

  const N8N_WEBHOOK_URL =
    "https://webhook.chatclean.online/webhook/15cc67a0-4f72-4f22-b8b0-7852b78384d0";
  const WHATSAPP_NUMBER = "5584996950105";

  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "Olá! Sou Jéssica. Assistente virtual da ChatClean!",
    },
    {
      sender: "bot",
      text: "Me conta, quer ter um sistema de CRM e Chatbot COMPLETO de verdade?",
    },
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setIsOpen(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text = inputValue) => {
    if (!text.trim()) return;

    const newMessages = [...messages, { sender: "user", text }];
    setMessages(newMessages);
    setInputValue("");

    let nextData = { ...userData };

    setTimeout(async () => {
      if (step === 0) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: "Para isso preciso de algumas informações rápidas. Qual é o seu nome?",
          },
        ]);
        setStep(1);
      } else if (step === 1) {
        nextData.nome = text;
        setUserData(nextData);
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: `Prazer, ${text}! Poderia me informar seu telefone/WhatsApp?`,
          },
        ]);
        setStep(2);
      } else if (step === 2) {
        nextData.telefone = text;
        setUserData(nextData);
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "Perfeito! Qual é o nome da sua empresa?" },
        ]);
        setStep(3);
      } else if (step === 3) {
        nextData.nome_empresa = text;
        setUserData(nextData);
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: "Excelente. Qual é o seu cargo atual na empresa?",
          },
        ]);
        setStep(4);
      } else if (step === 4) {
        nextData.cargo = text;
        setUserData(nextData);
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: "Quantos colaboradores a sua empresa tem hoje?",
          },
        ]);
        setStep(5);
      } else if (step === 5) {
        nextData.qtd_colaboradores = text;
        setUserData(nextData);
        setMessages((prev) => [
          ...prev,
          { sender: "bot", text: "A sua empresa já possui um site próprio?" },
        ]);
        setStep(6);
      } else if (step === 6) {
        nextData.possui_site = text;
        setUserData(nextData);
        setMessages((prev) => [
          ...prev,
          {
            sender: "bot",
            text: "Tudo certo! Já tenho tudo o que preciso. Estou a redirecionar para um especialista...",
          },
        ]);
        setStep(7);

        try {
          await fetch(N8N_WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              nome: nextData.nome,
              telefone: nextData.telefone,
              nome_empresa: nextData.nome_empresa,
              cargo: nextData.cargo,
              qtd_colaboradores: nextData.qtd_colaboradores,
              possui_site: nextData.possui_site,
              origem: "Popup ChatClean",
            }),
          });
        } catch (error) {
          console.error("Erro no n8n:", error);
        }

        setTimeout(() => {
          const textMsg = encodeURIComponent(
            `Olá, me chamo ${nextData.nome} da empresa ${nextData.nome_empresa}. Vim pelo site e gostaria de saber mais sobre o sistema!`,
          );
          window.open(
            `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${textMsg}`,
            "_blank",
          );
        }, 2000);
      }
    }, 800);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-white p-1 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:scale-105 border border-gray-200"
        >
          <img
            src={avatarImg}
            alt="Abrir Chat"
            className="w-14 h-14 rounded-full object-cover"
          />
        </button>
      )}

      {/* JANELA DO CHAT DINÂMICA (Começa menor e cresce até o max-h) */}
      {isOpen && (
        <div className="w-80 sm:w-96 min-h-[350px] max-h-[80vh] sm:max-h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 transition-all duration-300 ease-in-out">
          <div className="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                <img
                  src={avatarImg}
                  alt="Abrir Chat"
                  className="w-10 rounded-full object-cover"
                />
              </div>
              <div>
                <h3 className="font-semibold text-sm">
                  Jéssica - SDR ChatClean
                </h3>
                <p className="text-xs text-green-400">Online agora</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto bg-gray-50 flex flex-col gap-3 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  msg.sender === "bot"
                    ? "bg-white text-gray-800 self-start border border-gray-100 rounded-tl-none shadow-sm"
                    : "bg-slate-800 text-white self-end rounded-tr-none shadow-sm"
                }`}
              >
                {msg.text}
              </div>
            ))}

            {step === 0 && messages.length === 2 && (
              <button
                onClick={() => handleSend("Sim, quero.")}
                className="bg-slate-800 text-white py-2 px-4 rounded-full self-end text-sm mt-2 hover:bg-slate-700 transition-colors shadow-sm shrink-0"
              >
                Sim, quero.
              </button>
            )}

            {step === 4 && (
              <div className="flex flex-wrap gap-2 justify-end mt-2 shrink-0">
                {[
                  "Sócio/Diretor",
                  "Gerente de Vendas",
                  "Atendimento/Comercial",
                  "Marketing",
                  "TI/Infraestrutura",
                  "Funcionário/Colaborador",
                  "Outro Cargo",
                ].map((opcao) => (
                  <button
                    key={opcao}
                    onClick={() => handleSend(opcao)}
                    className="bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-full text-xs hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    {opcao}
                  </button>
                ))}
              </div>
            )}

            {step === 5 && (
              <div className="flex flex-wrap gap-2 justify-end mt-2 shrink-0">
                {["Apenas eu", "2 a 5", "6 a 15", "Mais de 15"].map((opcao) => (
                  <button
                    key={opcao}
                    onClick={() => handleSend(opcao)}
                    className="bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-full text-xs hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    {opcao}
                  </button>
                ))}
              </div>
            )}

            {step === 6 && (
              <div className="flex flex-wrap gap-2 justify-end mt-2 shrink-0">
                {["Sim, já tenho", "Não, ainda não", "Em desenvolvimento"].map(
                  (opcao) => (
                    <button
                      key={opcao}
                      onClick={() => handleSend(opcao)}
                      className="bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-full text-xs hover:bg-slate-50 transition-colors shadow-sm"
                    >
                      {opcao}
                    </button>
                  ),
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {step > 0 && step < 4 && (
            <div className="p-3 bg-white border-t flex items-center gap-2 shrink-0">
              <input
                type="text"
                placeholder="A sua resposta..."
                className="flex-1 bg-gray-100 rounded-full px-4 py-2 outline-none text-sm focus:ring-2 focus:ring-green-500"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
              />
              <button
                onClick={() => handleSend()}
                className="bg-slate-800 text-white p-2 rounded-full hover:bg-slate-700"
              >
                <Send size={16} />
              </button>
            </div>
          )}

          {step === 7 && (
            <div className="p-4 bg-white border-t shrink-0">
              <a
                href={`https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=Olá, vim pelo site!`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full block text-center bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-medium transition-colors"
              >
                Abrir WhatsApp Agora
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
