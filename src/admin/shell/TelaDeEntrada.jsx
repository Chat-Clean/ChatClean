/**
 * A tela de entrada do Painel — a primeira superfície a vestir a marca.
 *
 * Direção "Etiqueta": cartão sobre fundo recuado, verde de ação no botão
 * primário e no anel de foco, profundidade por superfície e contorno, não por
 * sombra. Os tokens vêm de `.painel` (Story 1.1), por isso a raiz carrega essa
 * classe: fora dela, `--primary` ainda é o neutro do site público.
 *
 * O que esta tela DELIBERADAMENTE não tem: nenhum caminho de autosserviço —
 * nem criação de conta, nem redefinição por e-mail — e nenhuma credencial de
 * exemplo ou dica em lugar algum. A tela anterior imprimia a própria
 * credencial de acesso logo abaixo do formulário.
 *
 * Piso de acessibilidade: cada campo tem `<Label htmlFor>` de verdade, o foco
 * é visível pelo anel dos tokens, a mensagem de erro vive numa região `alert`
 * permanente (sem salto de layout) e o teclado alcança tudo na ordem natural
 * do documento.
 */

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useSessao } from "./useSessao";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "./foco";
import { cn } from "@/lib/utils";

const ERRO_CAMPOS_VAZIOS = "Preencha o e-mail e a senha.";

export default function TelaDeEntrada() {
  const { entrar, erroDeAmbiente, erroDeSessao } = useSessao();

  const idEmail = useId();
  const idSenha = useId();
  const idErro = useId();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(erroDeAmbiente ?? erroDeSessao ?? null);
  const [enviando, setEnviando] = useState(false);
  /* A senha nasce OCULTA — nenhuma tela do Painel abre já expondo o que
     alguém acabou de digitar. */
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault();
    /* A OCULTAÇÃO VEM ANTES DE QUALQUER OUTRA COISA — inclusive da validação
       de campo vazio logo abaixo. Apertar "Entrar" é o instante em que a
       pessoa termina de digitar e o pedido sai para a rede; a senha ficar à
       vista na tela por mais um segundo enquanto a resposta não chega é
       exatamente a janela que ombro-surfando explora. */
    setSenhaVisivel(false);
    if (enviando) return;

    // Validação local antes de qualquer viagem ao servidor. Sem ela, enviar em
    // branco voltaria como "E-mail ou senha inválidos" — uma mensagem que
    // MENTE sobre a causa e manda a pessoa conferir uma credencial que ela nem
    // chegou a digitar. (`noValidate` desliga o balão do navegador de
    // propósito: a mensagem nativa não é traduzida nem anunciada junto com as
    // nossas.)
    if (email.trim() === "" || senha === "") {
      setErro(ERRO_CAMPOS_VAZIOS);
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      const resultado = await entrar(email, senha);
      // Sucesso não mexe em estado local: a validação da sessão troca o estado
      // do provider e o portão desmonta esta tela inteira.
      if (!resultado.ok) setErro(resultado.mensagem);
    } catch {
      // Sem este ramo, uma exceção deixaria o botão voltar ao normal e a tela
      // muda: a pessoa clicaria de novo sem saber o que houve.
      setErro(
        "Algo deu errado ao tentar entrar. Tente de novo em instantes.",
      );
    } finally {
      setEnviando(false);
    }
  };

  const comErro = Boolean(erro);

  return (
    <div className="painel min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-7">
          <img
            src="/chatclean.svg"
            alt="ChatClean"
            className="h-8 w-auto mb-4"
          />
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Painel de conteúdo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre com sua conta de trabalho.
          </p>
        </div>

        <form
          onSubmit={enviar}
          noValidate
          className="bg-card border border-border rounded-cartao p-6 space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor={idEmail}>E-mail</Label>
            <Input
              id={idEmail}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={comErro || undefined}
              aria-describedby={comErro ? idErro : undefined}
              disabled={enviando}
              className="h-11 rounded-controle"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={idSenha}>Senha</Label>
            <div className="relative">
              <Input
                id={idSenha}
                name="senha"
                type={senhaVisivel ? "text" : "password"}
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                aria-invalid={comErro || undefined}
                aria-describedby={comErro ? idErro : undefined}
                disabled={enviando}
                className="h-11 rounded-controle pr-11"
              />
              {/* Alterna a EXIBIÇÃO, nunca o conteúdo — e não submete o
                  formulário: `type="button"`, senão Enter dentro do campo de
                  senha acionaria este controle em vez de "Entrar". */}
              <button
                type="button"
                onClick={() => setSenhaVisivel((atual) => !atual)}
                aria-label={senhaVisivel ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={senhaVisivel}
                disabled={enviando}
                className={cn(
                  ANEL_DE_FOCO,
                  ALVO_DE_TOQUE,
                  "absolute right-0.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center",
                  "rounded-controle text-muted-foreground hover:text-foreground transition-colors",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                {senhaVisivel ? (
                  <EyeOff aria-hidden="true" className="size-4" />
                ) : (
                  <Eye aria-hidden="true" className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* Região `alert` permanente: presente desde a primeira renderização,
              o leitor de tela anuncia o texto assim que ele aparece. Criar o
              elemento junto com a mensagem faz alguns leitores perderem o
              anúncio, e a altura mínima evita o salto de layout.
              `role="alert"` já implica região viva assertiva — somar
              `aria-live` aqui faria leitores divergirem sobre a prioridade. */}
          <div id={idErro} role="alert" className="min-h-5 text-sm text-destructive">
            {erro}
          </div>

          <Button
            type="submit"
            disabled={enviando}
            className="w-full h-11 rounded-controle font-semibold"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-5">
          Acesso restrito à equipe. Fale com a administração para obter conta.
        </p>
      </div>
    </div>
  );
}
