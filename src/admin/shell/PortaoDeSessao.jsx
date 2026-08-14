/**
 * O portão. Fica ACIMA da página, envolvendo a rota.
 *
 * Manter a decisão dentro de `AdminBlog.jsx` reproduziria o defeito original em
 * outra forma — um estado local que a própria página escolhe respeitar. Aqui a
 * página só é montada se a sessão existir: enquanto o estado não for
 * "autenticado", o conteúdo nem chega a renderizar, nem por um instante.
 */

import { Skeleton } from "@/components/ui/skeleton";

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

  if (estado === "carregando") return <EsqueletoDoPainel />;

  // Qualquer estado que não seja explicitamente "autenticado" cai na tela de
  // entrada. A comparação é positiva de propósito: um estado novo introduzido
  // no futuro nasce fechado, não aberto.
  if (estado !== "autenticado") return <TelaDeEntrada />;

  return children;
}
