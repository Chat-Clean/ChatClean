/**
 * O limite de erro do Painel. Não existia nenhum até aqui.
 *
 * Sem ele, qualquer exceção durante o render — um Estado desconhecido, um
 * campo ausente vindo do armazenamento, uma guarda de voz violada — desmonta a
 * árvore React inteira e deixa `<div id="root">` vazio. Para quem está do outro
 * lado, isso é uma tela branca sem explicação, sem caminho de volta e com o
 * trabalho em aberto perdido.
 *
 * Precisa ser classe: `componentDidCatch` e `getDerivedStateFromError` não têm
 * equivalente em hook, e essa é a única razão de haver uma classe no projeto.
 *
 * O detalhe técnico só aparece em desenvolvimento. Em produção, quem está
 * usando o Painel não tem o que fazer com um `stack trace` — tem o que fazer
 * com um botão de recarregar.
 */

import { Component } from "react";

import { Button } from "@/components/ui/button";

import { ANEL_DE_FOCO } from "./foco";
import { EM_DESENVOLVIMENTO } from "./voz";

export default class LimiteDeErro extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, informacao) {
    // Registrado sempre: uma falha que ninguém consegue reproduzir depois é
    // uma falha que ninguém conserta.
    console.error("[Painel] a tela parou por uma exceção não tratada", erro, informacao);
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div
        role="alert"
        className="painel min-h-screen bg-background text-foreground flex items-center justify-center p-6"
      >
        <div className="w-full max-w-md bg-card border border-border rounded-cartao p-6">
          <h1 className="text-lg font-bold tracking-tight">
            Esta tela do Painel parou
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            O erro foi registrado. Recarregue o Painel para voltar ao trabalho —
            o conteúdo já salvo continua onde estava.
          </p>

          {EM_DESENVOLVIMENTO && (
            <pre className="dado mt-4 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-destructive">
              {String(erro?.stack ?? erro?.message ?? erro)}
            </pre>
          )}

          <Button
            onClick={() => window.location.reload()}
            className={`mt-5 w-full min-h-10 rounded-controle font-semibold ${ANEL_DE_FOCO}`}
          >
            Recarregar o Painel
          </Button>
        </div>
      </div>
    );
  }
}
