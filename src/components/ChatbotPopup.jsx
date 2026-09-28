import { useState, useEffect, useRef } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Digitando } from "@/components/funcionalidades/PecasDeCena";
import { LINK_DO_WHATSAPP } from "@/domain/whatsapp";
import avatarImg from "../assets/perfil.jpg";

const N8N_WEBHOOK_URL =
  "https://teste-n8n.pxohxs.easypanel.host/webhook/15cc67a0-4f72-4f22-b8b0-7852b78384d0";

const INITIAL_MESSAGES = [
  { sender: "bot", text: "Olá! Sou Jéssica, assistente virtual da ChatClean!" },
  { sender: "bot", text: "Quer ter um sistema de CRM e Chatbot COMPLETO de verdade?" },
];

/* Perguntas do cadastro (passos 1 a 6): a barra do cabeçalho mostra em qual
   a pessoa está. O passo 7 é a despedida. */
const TOTAL_DE_PERGUNTAS = 6;

/* Campos digitados: o teclado e o preenchimento automático certos para cada
   pergunta. Os passos 4 a 6 são respondidos pelos botões. */
const CAMPO_POR_PASSO = {
  1: { type: "text", autoComplete: "name", placeholder: "Seu nome" },
  2: { type: "tel", autoComplete: "tel", inputMode: "tel", placeholder: "(84) 99999-9999" },
  3: { type: "text", autoComplete: "organization", placeholder: "Nome da empresa" },
};

const OPCOES_POR_PASSO = {
  0: ["Sim, quero!"],
  4: ["Sócio/Diretor", "Gerente de Vendas", "Atendimento/Comercial", "Marketing", "TI/Infraestrutura", "Funcionário/Colaborador", "Outro"],
  5: ["Apenas eu", "2 a 5", "6 a 15", "Mais de 15"],
  6: ["Sim, já tenho", "Não, ainda não", "Em desenvolvimento"],
};

/* Balões iguais aos das cenas de funcionalidade (`PecasDeCena`): a Jéssica
   no branco com fio creme, a pessoa no verde da marca com texto verde-escuro
   — branco sobre o 51bc69 não passa de 2,4:1. */
const BALAO = {
  bot: "origin-bottom-left rounded-bl-md bg-white text-zinc-900 ring-1 ring-creme-borda",
  user: "origin-bottom-right rounded-br-md bg-emerald-500 text-emerald-950",
};

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
  const reduzirMovimento = useReducedMotion();

  // Só abre automaticamente em telas maiores (desktop/tablet)
  useEffect(() => {
    if (window.innerWidth < 768) return;
    const timer = setTimeout(() => setIsOpen(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: reduzirMovimento ? "auto" : "smooth" });
  }, [messages, isTyping, reduzirMovimento]);

  useEffect(() => {
    if (isOpen && step > 0) inputRef.current?.focus();
  }, [isOpen, step]);

  // Esc fecha a conversa, como qualquer janela
  useEffect(() => {
    if (!isOpen) return;
    const aoTeclar = (e) => e.key === "Escape" && setIsOpen(false);
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [isOpen]);

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
    // Enquanto a Jéssica digita, a resposta anterior ainda não foi guardada
    if (!text.trim() || isTyping) return;
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
      await addBotMessage("Tudo certo! Já tenho tudo o que preciso. Estou te redirecionando para um especialista...");
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
      setTimeout(() => window.open(LINK_DO_WHATSAPP, "_blank", "noopener"), 2000);
    }
  };

  const perguntaAtual = Math.min(step, TOTAL_DE_PERGUNTAS);
  // A barra conta o que já foi respondido: cheia só depois da última resposta
  const respondidas = Math.min(Math.max(step - 1, 0), TOTAL_DE_PERGUNTAS);
  const campo = CAMPO_POR_PASSO[step];
  const opcoes = OPCOES_POR_PASSO[step];
  const mostrarOpcoes = opcoes && !isTyping && (step !== 0 || messages.length === 2);

  // Entradas curtas (150–300 ms) e só transform/opacity; sem movimento
  // quando o sistema pede, as peças apenas aparecem.
  const entrada = reduzirMovimento
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0, y: 8, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.25, ease: EASE.out } };

  return (
    // Os dois estados ficam ANCORADOS no mesmo canto, sobrepostos. Em coluna,
    // ao fechar, o círculo nascia ACIMA da janela que ainda estava saindo:
    // aparecia no meio da lateral e só depois descia para o canto.
    <div className="fixed bottom-5 right-5 z-50">

      {/* Botão flutuante quando fechado */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            type="button"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.3, ease: EASE.out }}
            whileHover={reduzirMovimento ? undefined : { scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setIsOpen(true)}
            aria-label="Falar com a Jéssica, da ChatClean"
            className="group absolute bottom-0 right-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2"
          >
            {/* Onda de chamada: some quando o sistema pede menos movimento */}
            <span className="absolute inset-0 rounded-full bg-emerald-500/40 motion-safe:animate-ping" />
            {/* Aro de latão, como o botão da Área do Cliente */}
            <span className="relative block rounded-full bg-gradient-to-b from-yellow-300 via-yellow-400 to-yellow-600 p-[3px] shadow-[0_16px_32px_-10px_rgba(20,35,27,0.55)]">
              <span className="block h-[58px] w-[58px] overflow-hidden rounded-full border-2 border-creme bg-creme">
                <img src={avatarImg} alt="" width="58" height="58" className="h-full w-full object-cover" />
              </span>
            </span>
            <span className="pointer-events-none absolute bottom-full right-0 mb-3 flex translate-y-1 items-center gap-2 whitespace-nowrap rounded-full bg-emerald-950 px-3.5 py-2 font-secundaria text-xs font-semibold text-creme opacity-0 shadow-[0_12px_24px_-8px_rgba(20,35,27,0.6)] ring-1 ring-white/10 transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-300" />
              Falar com a Jéssica
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Janela do chat */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-label="Conversa com a Jéssica, da ChatClean"
            initial={reduzirMovimento ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduzirMovimento ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.18, ease: EASE.inOut } }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="absolute bottom-0 right-0 flex w-[calc(100vw-2.5rem)] max-w-[372px] origin-bottom-right flex-col overflow-hidden rounded-[22px] bg-creme shadow-[0_32px_64px_-16px_rgba(20,35,27,0.5)] ring-1 ring-emerald-950/10"
            style={{ maxHeight: "min(620px, calc(100svh - 2.5rem))" }}
          >
            {/* Cabeçalho: o verde-escuro da hero, com luz de latão no canto */}
            <div className="relative shrink-0 overflow-hidden bg-emerald-950 px-4 pb-3.5 pt-4">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{ backgroundImage: "radial-gradient(circle at 100% 0%, rgba(183,146,62,0.28), transparent 55%), radial-gradient(circle at 0% 100%, rgba(81,188,105,0.14), transparent 50%)" }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    <span className="block rounded-full bg-gradient-to-b from-yellow-300 to-yellow-600 p-[2px]">
                      <img src={avatarImg} alt="" width="44" height="44" className="h-11 w-11 rounded-full border-2 border-emerald-950 object-cover" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold leading-tight text-creme">Jéssica</p>
                    <p className="font-secundaria text-[10px] font-semibold uppercase tracking-[0.16em] text-yellow-300">
                      SDR · ChatClean
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-creme/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
                      Online agora
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Fechar conversa"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-creme ring-1 ring-white/15 backdrop-blur-md transition-colors duration-200 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Progresso do cadastro */}
              {step > 0 && (
                <div className="relative mt-3.5">
                  <p className="mb-1.5 font-secundaria text-[10px] font-semibold uppercase tracking-[0.14em] text-creme/60">
                    {step > TOTAL_DE_PERGUNTAS ? "Tudo pronto" : `Pergunta ${perguntaAtual} de ${TOTAL_DE_PERGUNTAS}`}
                  </p>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={TOTAL_DE_PERGUNTAS}
                    aria-valuenow={respondidas}
                    aria-label="Progresso do cadastro"
                    className="h-1 overflow-hidden rounded-full bg-white/10"
                  >
                    <div
                      className="h-full origin-left rounded-full bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-300 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{ transform: `scaleX(${respondidas / TOTAL_DE_PERGUNTAS})` }}
                    />
                  </div>
                </div>
              )}
              {/* Fio de latão separando o cabeçalho da conversa */}
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent" />
            </div>

            {/* Área de mensagens: o creme do site com a trama de conversa */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid" />
              <div
                aria-live="polite"
                className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
                style={{ scrollbarWidth: "thin", scrollbarColor: "#ddd8c6 transparent" }}
              >
                {messages.map((msg, idx) => {
                  const bot = msg.sender === "bot";
                  // A foto só no último balão de uma sequência da Jéssica
                  const proxima = messages[idx + 1];
                  const fimDaSequencia = proxima ? proxima.sender !== "bot" : !isTyping;
                  return (
                    <motion.div
                      key={idx}
                      {...entrada}
                      className={`flex w-full items-end gap-2 ${bot ? "justify-start" : "justify-end"}`}
                    >
                      {bot && (
                        fimDaSequencia
                          ? <img src={avatarImg} alt="" width="24" height="24" className="mb-0.5 h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-creme-borda" />
                          : <span className="w-6 shrink-0" />
                      )}
                      <div className={`max-w-[78%] break-words rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-[0_1px_2px_rgba(20,35,27,0.06)] ${bot ? BALAO.bot : BALAO.user}`}>
                        {msg.text}
                      </div>
                    </motion.div>
                  );
                })}

                {/* Digitando */}
                <AnimatePresence>
                  {isTyping && (
                    <motion.div {...entrada} exit={{ opacity: 0, transition: { duration: 0.12 } }} className="flex items-end gap-2">
                      <img src={avatarImg} alt="" width="24" height="24" className="mb-0.5 h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-creme-borda" />
                      <div className={`rounded-2xl px-3 py-2 ${BALAO.bot}`}>
                        <Digitando />
                        <span className="sr-only">Jéssica está digitando</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Respostas rápidas */}
                <AnimatePresence>
                  {mostrarOpcoes && (
                    <motion.div
                      key={`opcoes-${step}`}
                      initial="oculto"
                      animate="visivel"
                      variants={{ visivel: { transition: { staggerChildren: reduzirMovimento ? 0 : 0.04 } } }}
                      className="flex flex-wrap justify-end gap-1.5 pt-1"
                    >
                      {opcoes.map((o) => (
                        <motion.button
                          key={o}
                          type="button"
                          variants={{
                            oculto: reduzirMovimento ? { opacity: 0 } : { opacity: 0, y: 6 },
                            visivel: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE.out } },
                          }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => handleSend(o)}
                          className="rounded-full bg-white px-3.5 py-1.5 font-secundaria text-xs font-semibold text-emerald-800 ring-1 ring-creme-borda transition-[background-color,box-shadow,color] duration-200 hover:bg-emerald-50 hover:ring-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                        >
                          {o}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Campo de resposta */}
            {campo && (
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="shrink-0 border-t border-creme-borda bg-white px-3 py-3"
              >
                <div className="flex items-center gap-2 rounded-full bg-creme py-1.5 pl-4 pr-1.5 ring-1 ring-creme-borda transition-shadow duration-200 focus-within:ring-2 focus-within:ring-emerald-500">
                  <input
                    ref={inputRef}
                    {...campo}
                    aria-label="Sua resposta"
                    className="min-w-0 flex-1 bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-500 sm:text-sm"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isTyping}
                    aria-label="Enviar resposta"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-950 text-creme transition-[background-color,opacity,transform] duration-200 hover:bg-emerald-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </form>
            )}

            {/* CTA WhatsApp */}
            {step === 7 && (
              <div className="shrink-0 border-t border-creme-borda bg-white px-4 py-3">
                <a
                  href={LINK_DO_WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 py-3 font-secundaria text-sm font-bold text-emerald-950 shadow-[0_12px_24px_-10px_rgba(53,137,74,0.7)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-emerald-400 hover:shadow-[0_16px_28px_-10px_rgba(53,137,74,0.8)] active:scale-[0.98]"
                >
                  <MessageCircle size={16} />
                  Abrir WhatsApp agora
                </a>
              </div>
            )}

            {/* Assinatura */}
            <div className="shrink-0 bg-white py-2 text-center font-secundaria text-[9.5px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Powered by <span className="text-yellow-600">ChatClean</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
