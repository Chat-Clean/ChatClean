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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useSessao } from "./useSessao";

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

  const enviar = async (evento) => {
    evento.preventDefault();
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
            <Input
              id={idSenha}
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              aria-invalid={comErro || undefined}
              aria-describedby={comErro ? idErro : undefined}
              disabled={enviando}
              className="h-11 rounded-controle"
            />
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
