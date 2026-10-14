/**
 * A tela que o Claude abre para pedir acesso ao Painel (o "authorization
 * endpoint" do OAuth do MCP).
 *
 * Ela está atrás do portão de sessão: quem não entrou vê a tela de entrada e,
 * depois de entrar, volta para cá com a mesma URL. Quem está logado vê em nome
 * de quem o Claude vai agir e decide. A decisão vai ao servidor com a sessão,
 * e é ele que confere o pedido e devolve para onde o navegador volta.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pedirAutorizacao } from "@/data/mcp/autorizacao";
import { cn } from "@/lib/utils";

import IconeDoMcp from "./IconeDoMcp";
import { ANEL_DE_FOCO } from "./foco";
import { useSessao } from "./useSessao";

const PARAMETROS = ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "resource", "scope"];

/** O nome que o cliente declarou ao se registrar. Só para exibir. */
function nomeDoCliente(clientId) {
  try {
    const corpo = String(clientId).replace(/^ccoa\./, "").split(".")[0];
    const base64 = corpo.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)).nome || "Claude";
  } catch {
    return "Claude";
  }
}

function hostDe(uri) {
  try {
    return new URL(uri).host;
  } catch {
    return "";
  }
}

const PODERES = [
  "Ler, criar e editar posts, categorias, notícias em vídeo e vagas",
  "Publicar, agendar, arquivar e excluir, sempre pedindo a sua confirmação no Claude",
  "Consultar as leituras do blog e as buscas no Google",
];

export default function TelaDeAutorizacaoDoMcp() {
  const [busca] = useSearchParams();
  const { perfil, email } = useSessao();
  const [enviando, setEnviando] = useState(null);
  const [erro, setErro] = useState(null);
  const [concluido, setConcluido] = useState(false);

  const parametros = useMemo(
    () => Object.fromEntries(PARAMETROS.map((p) => [p, busca.get(p) ?? undefined])),
    [busca],
  );
  const pedidoValido =
    busca.get("response_type") === "code" && Boolean(parametros.client_id) && Boolean(parametros.redirect_uri);
  const cliente = nomeDoCliente(parametros.client_id);
  const nome = perfil.carregando ? "…" : (perfil.nome ?? "Conta sem nome");

  const decidir = async (negar) => {
    setEnviando(negar ? "negar" : "autorizar");
    setErro(null);
    const r = await pedirAutorizacao(parametros, { negar });
    if (!r.ok) {
      setErro(r.mensagem);
      setEnviando(null);
      return;
    }
    if (!negar) setConcluido(true);
    window.location.assign(r.redirecionar);
  };

  return (
    <main className="painel flex min-h-screen items-center justify-center bg-surface-sunk px-4 py-10 text-ink" data-tela="autorizar-mcp">
      <div className="w-full max-w-md rounded-cartao border border-border-soft bg-surface p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-cartao bg-brand-wash text-brand-chrome">
            <IconeDoMcp className="size-6" />
          </span>
          <div>
            <h1 className="text-lg font-black leading-tight">Conectar o {cliente} ao Painel</h1>
            <p className="text-xs text-ink-muted">Painel de conteúdo ChatClean</p>
          </div>
        </div>

        {!pedidoValido ? (
          <p role="alert" className="mt-6 text-sm text-destructive-ink">
            Este link de conexão está incompleto. Comece de novo pelo Claude, adicionando o conector do Painel.
          </p>
        ) : concluido ? (
          <p role="status" className="mt-6 text-sm text-ink-secondary">
            Pronto. Pode voltar ao Claude: a conexão termina por lá.
          </p>
        ) : (
          <>
            <div className="mt-6 rounded-controle border border-border-soft bg-surface-sunk p-3 text-sm">
              <p className="text-ink-muted">O Claude vai agir em nome de</p>
              <p className="font-bold text-ink" data-papel="autor">{nome}</p>
              {email ? <p className="text-xs text-ink-muted">{email}</p> : null}
            </div>

            <ul className="mt-5 space-y-2 text-sm text-ink-secondary">
              {PODERES.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-action" />
                  {p}
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs text-ink-muted">
              Depois de autorizar, o navegador volta para {hostDe(parametros.redirect_uri) || "o Claude"}. Para desconectar,
              remova o conector no Claude.
            </p>

            {erro ? (
              <p role="alert" className="mt-4 text-sm text-destructive-ink">
                {erro}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                data-acao="negar"
                disabled={enviando !== null}
                onClick={() => decidir(true)}
                className={cn(ANEL_DE_FOCO)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                data-acao="autorizar"
                disabled={enviando !== null || perfil.carregando}
                onClick={() => decidir(false)}
                className={cn(ANEL_DE_FOCO, "gap-2")}
              >
                {enviando === "autorizar" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                Autorizar
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
