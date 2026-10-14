/**
 * O botão do MCP na barra superior: abre as instruções para conectar o Claude
 * ao Painel.
 *
 * Não há nada para configurar aqui. A conexão é OAuth: a pessoa cola o
 * endereço no Claude, o Claude abre o Painel, e quem está logado clica em
 * "Autorizar" (`TelaDeAutorizacaoDoMcp`). A conta logada é a autora de tudo
 * que o Claude fizer; por isso o diálogo diz o nome dela.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import IconeDoMcp from "./IconeDoMcp";
import { enderecoDoMcp } from "./conexaoDoClaude";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "./foco";
import { useSessao } from "./useSessao";

function CampoCopiavel({ rotulo, valor, papel }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-controle border border-border-soft bg-surface-sunk p-1.5 pl-3">
      <code data-papel={papel} className="dado min-w-0 flex-1 truncate text-xs text-ink">
        {valor}
      </code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copiar}
        aria-label={`Copiar ${rotulo}`}
        className={cn(ANEL_DE_FOCO, "shrink-0 gap-1.5")}
      >
        {copiado ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

export default function BotaoDoMcp() {
  const { perfil } = useSessao();
  const endereco = enderecoDoMcp();
  const autor = perfil.carregando ? "a conta logada" : (perfil.nome ?? "a conta logada");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          data-acao="conectar-claude"
          aria-label="Conectar o Claude ao Painel (MCP)"
          title="Conectar o Claude ao Painel (MCP)"
          className={cn(
            "flex items-center justify-center rounded-controle",
            ALVO_DE_TOQUE,
            "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors",
            ANEL_DE_FOCO,
          )}
        >
          <IconeDoMcp className="size-[18px]" />
        </button>
      </DialogTrigger>

      <DialogContent className="painel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconeDoMcp className="size-5" />
            Conectar o Claude ao Painel
          </DialogTitle>
          <DialogDescription>
            O Claude passa a criar e editar posts (com capa e imagens), notícias e vagas e a consultar leituras e buscas
            do Google, sempre em
            nome de <strong className="text-ink">{autor}</strong>. Post novo nasce como rascunho, e publicar ou excluir
            pede a sua confirmação no Claude.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4 text-sm text-ink-secondary">
          <div className="space-y-1.5">
            <p className="font-semibold text-ink">Endereço do conector</p>
            <CampoCopiavel rotulo="o endereço" valor={endereco} papel="endereco-do-mcp" />
          </div>

          <div className="space-y-1.5">
            <p className="font-semibold text-ink">No claude.ai ou no app</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Abra Configurações, depois Conectores, e clique em Adicionar conector personalizado.</li>
              <li>Cole o endereço acima e clique em Conectar.</li>
              <li>O Painel abre: confira que é a sua conta e clique em Autorizar.</li>
            </ol>
          </div>

          <div className="space-y-1.5">
            <p className="font-semibold text-ink">No Claude Code</p>
            <CampoCopiavel
              rotulo="o comando"
              valor={`claude mcp add --transport http painel-chatclean ${endereco}`}
              papel="comando-do-mcp"
            />
            <p>Depois, dentro do Claude Code, digite /mcp, escolha painel-chatclean e autorize no navegador.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
