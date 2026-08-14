/**
 * O portão. Fica ACIMA da página, envolvendo a rota.
 *
 * Manter a decisão dentro de `AdminBlog.jsx` reproduziria o defeito original em
 * outra forma — um estado local que a própria página escolhe respeitar. Aqui a
 * página só é montada se a sessão existir: enquanto o estado não for
 * "autenticado", o conteúdo nem chega a renderizar, nem por um instante.
 */

import { Skeleton } from "@/components/ui/skeleton";

import LimiteDeErro from "./LimiteDeErro";
import Notificacoes from "./Notificacoes";
import TelaDeEntrada from "./TelaDeEntrada";
import { useSessao } from "./useSessao";

/**
 * Esqueleto do intervalo em que o Supabase ainda está restaurando a sessão do
 * armazenamento. Nunca tela em branco, e nunca um vislumbre do Painel.
 */
function EsqueletoDoPainel() {
  return (
    <div
      className="painel min-h-screen bg-background p-6"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Verificando sua sessão…</span>
      <div className="flex items-center gap-3 mb-8">
        <Skeleton className="h-8 w-8 rounded-controle" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-cartao" />
        <Skeleton className="h-16 w-full rounded-cartao" />
        <Skeleton className="h-16 w-full rounded-cartao" />
      </div>
    </div>
  );
}

export default function PortaoDeSessao({ children }) {
  const { estado } = useSessao();

  /*
   * O `Toaster` do `sonner` fica ACIMA dos três ramos, e fora da página.
   *
   * Fora da página porque notificação é da casca — Carreiras e as telas do
   * Épico 2 usam a mesma — e porque a página troca de tela cheia ao abrir um
   * formulário: um `Toaster` montado lá dentro sairia junto, levando embora a
   * mensagem da operação que acabou de terminar.
   *
   * Acima dos três ramos porque erro de rede na validação da sessão e recusa de
   * credencial acontecem em "carregando" e em "anônimo" — montado só no ramo
   * autenticado, o aviso dessas horas não teria onde aparecer. Continua sendo
   * UMA montagem: duas produzem duas pilhas e a mesma mensagem em dobro.
   */
  const conteudo =
    estado === "carregando" ? (
      <EsqueletoDoPainel />
    ) : // Qualquer estado que não seja explicitamente "autenticado" cai na tela
    // de entrada. A comparação é positiva de propósito: um estado novo
    // introduzido no futuro nasce fechado, não aberto.
    estado !== "autenticado" ? (
      <TelaDeEntrada />
    ) : (
      // O limite de erro envolve só o Painel: uma exceção lá dentro passa a
      // custar uma tela de recuperação, não a tela branca que custava antes.
      <LimiteDeErro>{children}</LimiteDeErro>
    );

  return (
    <>
      {conteudo}
      <Notificacoes />
    </>
  );
}
