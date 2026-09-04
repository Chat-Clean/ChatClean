import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Check, Loader2, Lock } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  gravarRascunho,
  lerRascunho,
  limparRascunho,
} from "@/lib/rascunhoDaAssinatura";
import {
  DIA_DE_VENCIMENTO,
  LIMITES,
  formatarMoeda,
  planoPorId,
  precoMensal,
  quantidadeValida,
} from "@/domain/assinatura/planos";
import {
  formatarCnpj,
  formatarTelefone,
  primeiroVencimento,
  validarPedido,
} from "@/domain/assinatura/pedido";

/**
 * A página de contratação.
 *
 * O dimensionamento chega pela querystring, escolhido na seção de planos. Aqui
 * a pessoa preenche os dados da empresa, confere o resumo, aceita os termos e
 * segue para pagar na página do Asaas.
 *
 * ─── Por que o formulário vem ANTES do pagamento ──────────────────────────
 *
 * Não é só preferência de conversão: o Asaas exige nome e CNPJ para criar o
 * cliente, e o webhook que cria a conta precisa do resto. Sem estes campos
 * antes, não há o que enviar para lugar nenhum.
 *
 * ─── O que esta tela NÃO faz ──────────────────────────────────────────────
 *
 * Não calcula o preço que será cobrado. Ela mostra o preço; quem calcula o
 * valor da cobrança é o servidor, com o mesmo módulo de domínio. E não confirma
 * pagamento: quem confirma é o webhook do Asaas. A tela de retorno diz
 * "recebemos", nunca "pago".
 */


const CAMPOS = [
  {
    campo: "nome",
    rotulo: "Seu nome",
    ajuda: "quem vai administrar a conta",
    tipo: "text",
    autoComplete: "name",
  },
  {
    campo: "email",
    rotulo: "E-mail",
    ajuda: "vira o acesso e recebe a confirmação",
    tipo: "email",
    autoComplete: "email",
  },
  {
    campo: "telefone",
    rotulo: "WhatsApp",
    ajuda: "com DDD",
    tipo: "tel",
    autoComplete: "tel",
    formatar: formatarTelefone,
  },
  {
    campo: "cnpj",
    rotulo: "CNPJ",
    ajuda: "da empresa que vai usar a plataforma",
    tipo: "text",
    formatar: formatarCnpj,
  },
  {
    campo: "razaoSocial",
    rotulo: "Razão social",
    ajuda: "como está no cartão CNPJ",
    tipo: "text",
    autoComplete: "organization",
  },
];

const VAZIO = Object.freeze({
  nome: "",
  email: "",
  telefone: "",
  cnpj: "",
  razaoSocial: "",
});

const Campo = ({ definicao, valor, erro, aoMudar }) => {
  const id = `campo-${definicao.campo}`;
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
        className={`rounded-xl border bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${
          erro ? "border-red-400" : "border-zinc-200"
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
          {definicao.ajuda}
        </span>
      )}
    </div>
  );
};

const LinhaDoResumo = ({ rotulo, valor, forte = false }) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <span className={`text-sm ${forte ? "font-bold text-zinc-900" : "text-zinc-600"}`}>
      {rotulo}
    </span>
    <span
      className={`tabular-nums ${
        forte ? "text-lg font-black text-zinc-900" : "text-sm text-zinc-700"
      }`}
    >
      {valor}
    </span>
  </div>
);

export default function Assinar() {
  const [parametros] = useSearchParams();

  const plano = planoPorId(parametros.get("plano"));
  const usuarios =
    quantidadeValida(parametros.get("usuarios"), LIMITES.usuarios) ??
    plano?.minimoDeUsuarios ??
    LIMITES.usuarios.minimo;
  const conexoes =
    quantidadeValida(parametros.get("conexoes"), LIMITES.conexoes) ??
    LIMITES.conexoes.minimo;

  const [formulario, setFormulario] = useState(VAZIO);
  const [diaDeVencimento, setDiaDeVencimento] = useState(10);
  const [aceitou, setAceitou] = useState(false);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState("");

  // O rascunho volta para quem fechou a aba no meio. Só os campos digitados —
  // o aceite dos termos NÃO é restaurado: consentimento se dá agora, não numa
  // sessão anterior que o navegador lembrou.
  useEffect(() => {
    // Navegador sem armazenamento, aba privada, ou categoria "Preferências"
    // recusada na faixa de cookies: seguir vazio, sem drama.
    const lido = lerRascunho();
    if (!lido) return;
    setFormulario({ ...VAZIO, ...lido.formulario });
    if (Number.isInteger(lido.diaDeVencimento)) {
      setDiaDeVencimento(lido.diaDeVencimento);
    }
  }, []);

  // Plano e dimensionamento entram junto do formulário: sem eles, quem voltasse
  // ao site sem o link original teria os dados guardados e nenhuma forma de
  // saber o que estava contratando.
  useEffect(() => {
    gravarRascunho({
      formulario,
      diaDeVencimento,
      plano: plano?.id ?? null,
      usuarios,
      conexoes,
    });
  }, [formulario, diaDeVencimento, plano, usuarios, conexoes]);

  const preco = useMemo(
    () => (plano ? precoMensal(plano, { usuarios, conexoes }) : null),
    [plano, usuarios, conexoes],
  );

  const vencimento = useMemo(
    () => primeiroVencimento(diaDeVencimento),
    [diaDeVencimento],
  );

  if (plano === null || preco === null) {
    return (
      <div className="min-h-screen bg-white text-zinc-900">
        <Navbar />
        <main className="mx-auto max-w-2xl px-4 py-32 text-center">
          <h1 className="mb-4 text-3xl font-black tracking-tighter">
            Escolha um plano para continuar
          </h1>
          <p className="mb-8 text-zinc-600">
            A contratação começa na escolha do plano e do tamanho da sua operação.
          </p>
          <Link
            to="/#planos"
            className="inline-block rounded-full bg-emerald-600 px-8 py-3.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            Ver os planos
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const enviar = async (evento) => {
    evento.preventDefault();
    setFalha("");

    const candidato = {
      ...formulario,
      planoId: plano.id,
      usuarios,
      conexoes,
      diaDeVencimento,
      aceitouOsTermos: aceitou,
    };

    const validado = validarPedido(candidato);
    if (!validado.ok) {
      setErros(validado.erros);
      return;
    }

    setErros({});
    setEnviando(true);

    try {
      const resposta = await fetch("/api/assinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidato),
      });
      const corpo = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        if (corpo.erros) setErros(corpo.erros);
        setFalha(
          corpo.mensagem ??
            "não conseguimos concluir agora. Tente novamente em alguns instantes.",
        );
        setEnviando(false);
        return;
      }

      // O pedido virou cobrança: não há mais rascunho a retomar.
      limparRascunho();
      window.location.href = corpo.faturaUrl;
    } catch {
      setFalha(
        "não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
      );
      setEnviando(false);
    }
  };

  const diasDoMes = Array.from(
    { length: DIA_DE_VENCIMENTO.maximo - DIA_DE_VENCIMENTO.minimo + 1 },
    (_, indice) => DIA_DE_VENCIMENTO.minimo + indice,
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <Navbar />

      <main className="mx-auto max-w-5xl px-4 py-16 md:py-24">
        <Link
          to="/#planos"
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar aos planos
        </Link>

        <h1 className="mb-3 text-3xl font-black tracking-tighter md:text-5xl">
          Contratar o {plano.nome}
        </h1>
        <p className="mb-12 max-w-2xl text-lg text-zinc-600">
          Preencha os dados da empresa. Na próxima tela você paga no Pix ou no
          boleto, e a conta é liberada assim que o pagamento for confirmado.
        </p>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          {/* ─── Formulário ─────────────────────────────────────────── */}
          <form
            onSubmit={enviar}
            noValidate
            className="rounded-3xl border border-zinc-200 bg-white p-6 md:p-8"
          >
            <h2 className="mb-6 text-xl font-black tracking-tight">
              Dados da empresa
            </h2>

            <div className="grid gap-5 sm:grid-cols-2">
              {CAMPOS.map((definicao) => (
                <div
                  key={definicao.campo}
                  className={definicao.campo === "razaoSocial" ? "sm:col-span-2" : ""}
                >
                  <Campo
                    definicao={definicao}
                    valor={formulario[definicao.campo]}
                    erro={erros[definicao.campo]}
                    aoMudar={(valor) =>
                      setFormulario((atual) => ({
                        ...atual,
                        [definicao.campo]: valor,
                      }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="my-8 h-px bg-zinc-100" />

            <h2 className="mb-2 text-xl font-black tracking-tight">
              Dia do vencimento
            </h2>
            <p className="mb-4 text-[13px] text-zinc-500">
              A cobrança do mês cai sempre neste dia. A primeira vence em{" "}
              {vencimento.split("-").reverse().join("/")} — e você pode pagar
              antes disso, no Pix, para liberar a conta na hora.
            </p>

            <div className="flex flex-wrap gap-2">
              {diasDoMes.map((dia) => (
                <button
                  key={dia}
                  type="button"
                  onClick={() => setDiaDeVencimento(dia)}
                  aria-pressed={dia === diaDeVencimento}
                  className={`h-10 w-10 rounded-xl text-sm font-bold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                    dia === diaDeVencimento
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
                  }`}
                >
                  {dia}
                </button>
              ))}
            </div>
            {erros.diaDeVencimento && (
              <p className="mt-2 text-[13px] font-medium text-red-600">
                {erros.diaDeVencimento}
              </p>
            )}

            <div className="my-8 h-px bg-zinc-100" />

            {/* O aceite. Caixa NÃO pré-marcada, e o que se aceita está escrito
                aqui, não escondido atrás de um link só. */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-zinc-50 p-4">
              <input
                type="checkbox"
                checked={aceitou}
                onChange={(evento) => setAceitou(evento.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="text-[13px] leading-relaxed text-zinc-600">
                Concordo com os{" "}
                <Link
                  to="/termos-de-servico"
                  className="font-medium text-emerald-700 underline"
                >
                  Termos de Serviço
                </Link>{" "}
                e a{" "}
                <Link
                  to="/politica-de-privacidade"
                  className="font-medium text-emerald-700 underline"
                >
                  Política de Privacidade
                </Link>
                , e entendo que{" "}
                <strong className="font-bold text-zinc-800">
                  a assinatura é mensal e renova automaticamente
                </strong>{" "}
                até que eu cancele, sem fidelidade e sem multa. Tenho 7 dias para
                desistir com devolução integral, pelo artigo 49 do Código de
                Defesa do Consumidor.
              </span>
            </label>
            {erros.aceitouOsTermos && (
              <p className="mt-2 text-[13px] font-medium text-red-600">
                {erros.aceitouOsTermos}
              </p>
            )}

            {falha && (
              <p
                role="alert"
                className="mt-6 flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {falha}
              </p>
            )}

            <button
              type="submit"
              disabled={enviando}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              {enviando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Preparando o pagamento…
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Ir para o pagamento
                </>
              )}
            </button>

            <p className="mt-3 text-center text-[12px] text-zinc-500">
              O pagamento acontece na página do Asaas, nosso processador. A
              ChatClean não recebe nem guarda dados de cartão.
            </p>
          </form>

          {/* ─── Resumo ─────────────────────────────────────────────── */}
          <aside className="rounded-3xl border border-zinc-200 bg-white p-6 lg:sticky lg:top-24">
            <h2 className="mb-1 text-lg font-black tracking-tight">
              Resumo da contratação
            </h2>
            <p className="mb-5 text-[13px] text-zinc-500">
              Plano {plano.nome} · {plano.estagio}
            </p>

            <div className="divide-y divide-zinc-100">
              <LinhaDoResumo
                rotulo={`${preco.usuariosCobrados} usuários × ${formatarMoeda(
                  plano.porUsuario,
                )}`}
                valor={formatarMoeda(preco.valorDosUsuarios)}
              />
              <LinhaDoResumo
                rotulo={
                  preco.conexoesExtras > 0
                    ? `${preco.conexoesExtras} conexões extras × ${formatarMoeda(
                        plano.porConexaoExtra,
                      )}`
                    : `${conexoes} de ${plano.conexoesInclusas} conexões inclusas`
                }
                valor={
                  preco.conexoesExtras > 0
                    ? formatarMoeda(preco.valorDasConexoes)
                    : "incluso"
                }
              />
              <LinhaDoResumo
                rotulo="Total por mês"
                valor={formatarMoeda(preco.total)}
                forte
              />
            </div>

            <ul className="mt-6 flex flex-col gap-2.5 border-t border-zinc-100 pt-5">
              {[
                "Sem taxa de implantação",
                "Pix ou boleto, você escolhe na hora de pagar",
                "Cancele quando quiser, sem multa",
                `Vence todo dia ${diaDeVencimento}`,
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[13px] text-zinc-600">
                  <Check
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-5 border-t border-zinc-100 pt-4 text-[12px] leading-relaxed text-zinc-500">
              O WhatsApp cobra à parte por conversa iniciada pela empresa: cerca
              de R$ 0,04 para suporte e R$ 0,35 para marketing. Conversa iniciada
              pelo cliente não tem custo.
            </p>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
