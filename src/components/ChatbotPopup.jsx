import { useState, useEffect, useRef } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import avatarImg from "../assets/perfil.jpg";

const N8N_WEBHOOK_URL =
  "https://teste-n8n.pxohxs.easypanel.host/webhook/15cc67a0-4f72-4f22-b8b0-7852b78384d0";
const WHATSAPP_NUMBER = "558499358786";

const INITIAL_MESSAGES = [
  { sender: "bot", text: "Olá! Sou Jéssica, assistente virtual da ChatClean! 👋" },
  { sender: "bot", text: "Quer ter um sistema de CRM e Chatbot COMPLETO de verdade?" },
];

/* ─── Indicador de digitação ─────────────────────────────────────── */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 self-start">
      <img src={avatarImg} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mb-0.5" />
      <div className="bg-white border border-zinc-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-zinc-400 block"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChatbotPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [userData, setUserData] = useState({
    nome: "", nome_empresa: "", telefone: "", cargo: "",
    qtd_colaboradores: "", possui_site: "",
  });
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Só abre automaticamente em telas maiores (desktop/tablet)
  useEffect(() => {
    if (window.innerWidth < 768) return;
    const timer = setTimeout(() => setIsOpen(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && step > 0) inputRef.current?.focus();
  }, [isOpen, step]);

  const addBotMessage = (text) => {
    setIsTyping(true);
    return new Promise((resolve) => {
      setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, { sender: "bot", text }]);
        resolve();
      }, 900);
    });
  };

  const handleSend = async (text = inputValue) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { sender: "user", text }]);
    setInputValue("");
    let nextData = { ...userData };

    if (step === 0) {
      await addBotMessage("Para isso preciso de algumas informações rápidas. Qual é o seu nome?");
      setStep(1);
    } else if (step === 1) {
      nextData.nome = text; setUserData(nextData);
      await addBotMessage(`Prazer, ${text}! Poderia me informar seu telefone/WhatsApp?`);
      setStep(2);
    } else if (step === 2) {
      nextData.telefone = text; setUserData(nextData);
      await addBotMessage("Perfeito! Qual é o nome da sua empresa?");
      setStep(3);
    } else if (step === 3) {
      nextData.nome_empresa = text; setUserData(nextData);
      await addBotMessage("Excelente! Qual é o seu cargo atual na empresa?");
      setStep(4);
    } else if (step === 4) {
      nextData.cargo = text; setUserData(nextData);
      await addBotMessage("Quantos colaboradores a sua empresa tem hoje?");
      setStep(5);
    } else if (step === 5) {
      nextData.qtd_colaboradores = text; setUserData(nextData);
      await addBotMessage("A sua empresa já possui um site próprio?");
      setStep(6);
    } else if (step === 6) {
      nextData.possui_site = text; setUserData(nextData);
      await addBotMessage("Tudo certo! 🎉 Já tenho tudo o que preciso. Estou te redirecionando para um especialista...");
      setStep(7);
      try {
        await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: nextData.nome, telefone: nextData.telefone,
            nome_empresa: nextData.nome_empresa, cargo: nextData.cargo,
            qtd_colaboradores: nextData.qtd_colaboradores,
            possui_site: nextData.possui_site, origem: "Site ChatClean",
          }),
        });
      } catch (e) { console.error("Erro no n8n:", e); }
      setTimeout(() => {
        const msg = encodeURIComponent(
          `Olá, me chamo ${nextData.nome} da empresa ${nextData.nome_empresa}. Vim pelo site e gostaria de saber mais sobre o sistema!`
        );
        window.open(`https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${msg}`, "_blank");
      }, 2000);
    }
  };

  const QuickReply = ({ label }) => (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => handleSend(label)}
      className="bg-white border border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50 text-zinc-700 hover:text-emerald-700 py-1.5 px-3.5 rounded-full text-xs font-medium transition-all duration-200 shadow-sm"
    >
      {label}
    </motion.button>
  );

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">

      {/* Botão flutuante quando fechado */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setIsOpen(true)}
            className="relative group"
          >
            {/* Pulse ring */}
            <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-30 animate-ping" />
            <div className="relative w-16 h-16 rounded-full border-[3px] border-emerald-400 shadow-xl shadow-emerald-500/30 overflow-hidden bg-white">
              <img src={avatarImg} alt="Falar com Jéssica" className="w-full h-full object-cover" />
            </div>
            {/* Badge online */}
            <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
            {/* Tooltip */}
            <span className="absolute bottom-full right-0 mb-2 whitespace-nowrap bg-zinc-900 text-white text-xs font-medium px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
              Falar com Jéssica 💬
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Janela do chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="w-80 sm:w-[360px] flex flex-col rounded-3xl shadow-2xl shadow-zinc-900/20 overflow-hidden border border-zinc-200/80 bg-white"
            style={{ maxHeight: "min(600px, 80vh)" }}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-br from-emerald-600 to-emerald-500 px-4 py-3.5 shrink-0">
              {/* Padrão decorativo */}
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px), radial-gradient(circle at 20% 80%, white 1px, transparent 1px)", backgroundSize: "24px 24px" }}
              />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-2xl overflow-hidden border-2 border-white/40 shadow-lg">
                      <img src={avatarImg} alt="Jéssica" className="w-full h-full object-cover" />
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-300 border-2 border-emerald-600" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm leading-tight">Jéssica</p>
                    <p className="text-white/70 text-xs">SDR · ChatClean</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                      <span className="text-emerald-200 text-[10px] font-medium">Online agora</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Área de mensagens */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-zinc-50/60"
              style={{ scrollbarWidth: "thin", scrollbarColor: "#d1d5db transparent" }}
            >
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`flex items-end gap-2 w-full ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.sender === "bot" && (
                    <img src={avatarImg} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 mb-0.5" />
                  )}
                  <div
                    className={`max-w-[72%] px-4 py-2.5 text-sm leading-relaxed break-words ${
                      msg.sender === "bot"
                        ? "bg-white text-zinc-800 rounded-2xl rounded-bl-sm border border-zinc-100 shadow-sm"
                        : "bg-emerald-500 text-white rounded-2xl rounded-br-sm shadow-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </motion.div>
              ))}

              {/* Digitando */}
              <AnimatePresence>
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <TypingIndicator />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quick replies */}
              <AnimatePresence>
                {!isTyping && step === 0 && messages.length === 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <QuickReply label="Sim, quero! 🚀" />
                  </motion.div>
                )}

                {!isTyping && step === 4 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap gap-1.5 justify-end"
                  >
                    {["Sócio/Diretor", "Gerente de Vendas", "Atendimento/Comercial", "Marketing", "TI/Infraestrutura", "Funcionário/Colaborador", "Outro"].map((o) => (
                      <QuickReply key={o} label={o} />
                    ))}
                  </motion.div>
                )}

                {!isTyping && step === 5 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap gap-1.5 justify-end"
                  >
                    {["Apenas eu", "2 a 5", "6 a 15", "Mais de 15"].map((o) => (
                      <QuickReply key={o} label={o} />
                    ))}
                  </motion.div>
                )}

                {!isTyping && step === 6 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap gap-1.5 justify-end"
                  >
                    {["Sim, já tenho", "Não, ainda não", "Em desenvolvimento"].map((o) => (
                      <QuickReply key={o} label={o} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            {step > 0 && step < 4 && (
              <div className="px-3 py-3 bg-white border-t border-zinc-100 shrink-0">
                <div className="flex items-center gap-2 bg-zinc-100 rounded-2xl px-4 py-2">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Digite sua resposta..."
                    className="flex-1 bg-transparent outline-none text-sm text-zinc-800 placeholder:text-zinc-400"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!inputValue.trim()}
                    className="w-8 h-8 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all shrink-0"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* CTA WhatsApp */}
            {step === 7 && (
              <div className="px-4 py-3 bg-white border-t border-zinc-100 shrink-0">
                <a
                  href={`https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=Ol%C3%A1%2C+vim+pelo+site!`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-3 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02]"
                >
                  <MessageCircle size={16} />
                  Abrir WhatsApp Agora
                </a>
              </div>
            )}

            {/* Branding */}
            <div className="text-center py-2 text-[10px] text-zinc-400 bg-white border-t border-zinc-50">
              Powered by <span className="font-semibold text-emerald-600">ChatClean</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
