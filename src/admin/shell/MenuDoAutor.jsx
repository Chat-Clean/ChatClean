/**
 * O nome do Autor na barra, com o menu que contém Sair.
 *
 * O AC pede Sair "no menu sob seu nome" — não mais um botão solto ao lado de
 * Restaurar. A aparência definitiva da barra é da Story 1.5; aqui está apenas
 * a área do nome, que é a fatia que esta entrega tem permissão de desenhar.
 *
 * Cores por token, nunca cruas. O gatilho vive sobre a barra superior, que hoje
 * é escura e na Story 1.5 vira o verde de cromia — nos dois casos a tinta certa
 * é `primary-foreground`, então o componente atravessa a repintura sem edição.
 *
 * O nome vem de `perfis`, nunca do e-mail: é ele que assina os Posts. Enquanto
 * a leitura corre, esqueleto; se ela falhar, o menu diz que falhou — erro não
 * é confundido com vazio.
 */

import { useState } from "react";
import { ChevronDown, LogOut, TriangleAlert } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { ANEL_DE_FOCO } from "./foco";
import { useSessao } from "./useSessao";

export default function MenuDoAutor({ className }) {
  const { perfil, email, sair } = useSessao();
  const [saindo, setSaindo] = useState(false);
  const [erroAoSair, setErroAoSair] = useState(null);

  const rotulo = perfil.carregando
    ? "Carregando…"
    : (perfil.nome ?? "Nome indisponível");

  // `onSelect` não espera promessa. Sem este invólucro, uma rejeição de `sair()`
  // viraria promessa solta: nenhum estado pendente, nenhuma mensagem, e a
  // pessoa continuaria dentro achando que saiu.
  const acionarSair = async () => {
    if (saindo) return;
    setSaindo(true);
    setErroAoSair(null);
    try {
      await sair();
    } catch {
      setErroAoSair("Não foi possível encerrar a sessão. Tente de novo.");
    } finally {
      setSaindo(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // Nome acessível explícito: concatenar um texto oculto ao nome visível
        // faria o leitor anunciar "Fulano de Tal Abrir menu da conta".
        aria-label={`Abrir menu da conta de ${rotulo}`}
        className={cn(
          "flex items-center gap-2 min-h-10 px-3 py-2 rounded-controle text-xs font-semibold",
          "text-primary-foreground/80 hover:text-primary-foreground",
          "hover:bg-primary-foreground/10 transition-colors",
          // O anel vem do módulo compartilhado (Story 1.5): sobre a cromia da
          // barra, o `ring-ring/50` que estava aqui ficava perto do invisível.
          ANEL_DE_FOCO,
          className,
        )}
      >
        {perfil.carregando ? (
          <Skeleton className="h-3.5 w-24" />
        ) : (
          <>
            {perfil.erro && (
              <TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span className="max-w-[10rem] truncate">{rotulo}</span>
          </>
        )}
        <ChevronDown className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-semibold truncate">{rotulo}</span>
          {email && (
            <span className="block text-xs text-muted-foreground truncate">
              {email}
            </span>
          )}
          {perfil.erro && (
            <span className="block text-xs text-destructive mt-1">
              {perfil.erro}
            </span>
          )}
          {erroAoSair && (
            <span className="block text-xs text-destructive mt-1" role="alert">
              {erroAoSair}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={saindo}
          onSelect={(evento) => {
            // O menu fecharia antes da promessa resolver, levando junto a
            // mensagem de erro. Mantê-lo aberto é o que torna a falha visível.
            evento.preventDefault();
            acionarSair();
          }}
        >
          <LogOut aria-hidden="true" />
          {saindo ? "Saindo…" : "Sair"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
