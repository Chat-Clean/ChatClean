import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Check,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import chatcleanLogoGreen from "/chatclean.svg";
import {
  FAIXAS_DE_ATENDENTES,
  telefoneVisivel,
  validarLead,
} from "@/domain/lead/lead";
import { atribuicaoParaEnvio } from "@/lib/atribuicao";

/**
 * A landing da API Oficial.
 *
 * ─── POR QUE ELA NÃO TEM A BARRA DE NAVEGAÇÃO ────────────────────────────
 *
 * Uma landing tem um trabalho só. A barra completa oferece Blog, Sobre,
 * Carreiras e FAQ — sete saídas para quem chegou aqui por um anúncio pago com
 * uma intenção específica. O cabeçalho daqui tem o logotipo, que volta para a
 * home, e nada mais.
 *
 * ─── O FORMULÁRIO É CURTO PORQUE CADA CAMPO CUSTA ────────────────────────
 *
 * Quatro obrigatórios e uma pergunta de um clique. Não pedimos CNPJ, cargo nem
 * faturamento: nada disso é necessário para começar a conversa, e o time
 * comercial pergunta o que precisar no WhatsApp. O formulário existe para
 * marcar o encontro, não para fazer a qualificação inteira.
 *
 * ─── QUEM DECIDE PARA ONDE A CONVERSA VAI É O SERVIDOR ───────────────────
 *
 * O endereço do WhatsApp vem na resposta de `/api/lead`, montado lá. A tela não
 * conhece o número — assim adulterar o formulário não desvia a conversa.
 */

const CAMPOS = [
  {
    campo: "nome",
    rotulo: "Seu nome",
    tipo: "text",
    autoComplete: "name",
    dica: "Como podemos chamar você",
  },
  {
    campo: "empresa",
    rotulo: "Empresa",
    tipo: "text",
    autoComplete: "organization",
    dica: "O nome que seus clientes conhecem",
  },
  {
    campo: "email",
    rotulo: "E-mail",
    tipo: "email",
    autoComplete: "email",
    dica: "Para onde enviamos a proposta",
  },
  {
    campo: "telefone",
    rotulo: "WhatsApp",
    tipo: "tel",
    autoComplete: "tel",
    dica: "Com DDD",
    formatar: telefoneVisivel,
  },
];

const VAZIO = Object.freeze({
  nome: "",
  empresa: "",
  email: "",
  telefone: "",
  atendentes: "",
  aceite: false,
});

const PROVAS = [
  {
    icone: ShieldCheck,
    titulo: "Sem risco de bloqueio",
    texto: "Número homologado pela Meta, não um chip clonado no WhatsApp Web.",
  },
  {
    icone: Users,
    titulo: "Toda a equipe no mesmo número",
    texto: "Filas, departamentos e transferência de conversa entre atendentes.",
  },
  {
    icone: BadgeCheck,
    titulo: "Nós cuidamos da homologação",
    texto: "Verificação do Business Manager e aprovação dos modelos com a Meta.",
  },
];

const Campo = ({ definicao, valor, erro, aoMudar }) => {
  const id = `lead-${definicao.campo}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-zinc-800">
        {definicao.rotulo}
      </label>
      <input
        id={id}
        type={definicao.tipo}
        autoComplete={definicao.autoComplete}
        value={valor}
        aria-invalid={erro ? "true" : undefined}
        aria-describedby={erro ? `${id}-erro` : `${id}-ajuda`}
        onChange={(evento) => {
          const bruto = evento.target.value;
          aoMudar(definicao.formatar ? definicao.formatar(bruto) : bruto);
        }}
        className={`rounded-xl border bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${erro ? "border-red-400" : "border-zinc-200"
          }`}
      />
      {erro ? (
        <span
          id={`${id}-erro`}
          className="flex items-center gap-1.5 text-[13px] font-medium text-red-600"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {erro}
        </span>
      ) : (
        <span id={`${id}-ajuda`} className="text-[13px] text-zinc-500">
          {definicao.dica}
        </span>
      )}
    </div>
  );
};

export default function GarantirApiOficial() {
  const location = useLocation();
  const [valores, setValores] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState(null);
  const [pronto, setPronto] = useState(null);
  const jaAbriu = useRef(false);

  useEffect(() => {
    const anterior = document.title;
    document.title = "Garanta sua API Oficial do WhatsApp | ChatClean";
    return () => {
      document.title = anterior;
    };
  }, []);

  // A campanha viaja com a pessoa: é o que diz ao comercial de onde ela veio.
  const campanha = useMemo(() => location.search ?? "", [location.search]);

  const mudar = (campo, valor) => {
    setValores((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => {
      if (!atual[campo]) return atual;
      const proximo = { ...atual };
      delete proximo[campo];
      return proximo;
    });
  };

  async function enviar(evento) {
    evento.preventDefault();
    setFalha(null);

    const validado = validarLead(valores);
    if (!validado.ok) {
      setErros(validado.erros);
      const primeiro = Object.keys(validado.erros)[0];
      document.getElementById(`lead-${primeiro}`)?.focus();
      return;
    }

    setEnviando(true);
    try {
      const resposta = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...valores,
          origem: location.pathname,
          campanha,
          // De onde a pessoa veio na PRIMEIRA visita, quando ela consentiu que
          // isso fosse lembrado. É o que evita creditar como "direto" a venda
          // que um anúncio trouxe semanas antes.
          atribuicao: atribuicaoParaEnvio(),
        }),
      });

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        if (dados.erros) setErros(dados.erros);
        setFalha(
          dados.mensagem ??
          "Não conseguimos registrar seu pedido agora. Tente de novo em instantes.",
        );
        return;
      }

      setPronto(dados);
    } catch {
      setFalha(
        "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  // Gravado o lead, a conversa começa. A navegação automática vem depois de um
  // instante para a pessoa ver a confirmação; o botão continua ali para quem
  // preferir clicar ou tiver a navegação barrada.
  useEffect(() => {
    if (!pronto?.whatsappUrl || jaAbriu.current) return;
    jaAbriu.current = true;
    const relogio = setTimeout(() => {
      window.location.href = pronto.whatsappUrl;
    }, 1800);
    return () => clearTimeout(relogio);
  }, [pronto]);

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Cabeçalho enxuto: uma saída só, e ela volta para a home. */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={chatcleanLogoGreen} alt="ChatClean" className="h-8" />
          </Link>
          <Link
            to="/api-oficial-whatsapp"
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Como funciona
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:py-16">
        {pronto ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto max-w-lg rounded-3xl border border-zinc-200 bg-white p-8 text-center md:p-10"
          >
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Check className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="mt-6 text-2xl font-black tracking-tighter text-zinc-900 md:text-3xl">
              Recebemos seu pedido
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">
              Estamos abrindo o WhatsApp com a mensagem já escrita. Se nada
              acontecer em alguns segundos, é só tocar no botão.
            </p>
            <a
              href={pronto.whatsappUrl}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Continuar no WhatsApp
            </a>
            <Link
              to="/"
              className="mt-4 inline-block text-sm font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-900"
            >
              Voltar para o site
            </Link>
          </motion.div>
        ) : (
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_460px] lg:gap-14">
            {/* A promessa */}
            <div className="lg:pt-6">
              <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700">
                API Oficial do WhatsApp
              </span>
              <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tighter text-zinc-900 md:text-5xl">
                Garanta sua API Oficial{" "}
                <span className="text-gradient-green">agora</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-zinc-600">
                Deixe o número da empresa no seu nome, com toda a equipe
                atendendo junto e sem medo de bloqueio. A gente cuida da
                homologação com a Meta e devolve tudo pronto para usar.
              </p>

              <div className="mt-9 flex flex-col gap-5">
                {PROVAS.map(({ icone: Icone, titulo, texto }) => (
                  <div key={titulo} className="flex items-start gap-3.5">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-zinc-200">
                      <Icone className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-[15px] font-bold text-zinc-900">
                        {titulo}
                      </h2>
                      <p className="text-sm leading-relaxed text-zinc-600">
                        {texto}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* O formulário */}
            <form
              onSubmit={enviar}
              noValidate
              className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl shadow-zinc-200/60 md:p-8"
            >
              <h2 className="text-xl font-black tracking-tight text-zinc-900">
                Fale com um especialista
              </h2>
              <p className="mt-1.5 text-sm text-zinc-500">
                Preencha e a conversa continua no WhatsApp, agora.
              </p>

              <div className="mt-6 flex flex-col gap-4">
                {CAMPOS.map((definicao) => (
                  <Campo
                    key={definicao.campo}
                    definicao={definicao}
                    valor={valores[definicao.campo]}
                    erro={erros[definicao.campo]}
                    aoMudar={(valor) => mudar(definicao.campo, valor)}
                  />
                ))}

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-bold text-zinc-800">
                    Quantas pessoas atendem hoje?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {FAIXAS_DE_ATENDENTES.map((faixa) => {
                      const ativo = valores.atendentes === faixa.id;
                      return (
                        <button
                          key={faixa.id}
                          type="button"
                          aria-pressed={ativo}
                          onClick={() =>
                            mudar("atendentes", ativo ? "" : faixa.id)
                          }
                          className={`rounded-full px-4 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${ativo
                              ? "bg-emerald-600 text-white"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                            }`}
                        >
                          {faixa.rotulo}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Não pré-marcada, e registrada com versão, instante e IP. */}
                <label className="mt-1 flex items-start gap-3 text-[13px] leading-relaxed text-zinc-600">
                  <input
                    id="lead-aceite"
                    type="checkbox"
                    checked={valores.aceite}
                    onChange={(evento) => mudar("aceite", evento.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  />
                  <span>
                    Autorizo a ChatClean a entrar em contato comigo sobre a API
                    Oficial. Meus dados são usados só para isso, como descrito na{" "}
                    <Link
                      to="/politica-de-privacidade"
                      className="text-emerald-700 underline underline-offset-2"
                    >
                      política de privacidade
                    </Link>
                    .
                  </span>
                </label>
                {erros.aceite && (
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-red-600">
                    <AlertCircle
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {erros.aceite}
                  </span>
                )}
              </div>

              {falha && (
                <p
                  role="alert"
                  className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700"
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  {falha}
                </p>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                {enviando ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    Enviando…
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Continuar no WhatsApp
                  </>
                )}
              </button>

              <p className="mt-3 text-center text-[12px] text-zinc-500">

              </p>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
