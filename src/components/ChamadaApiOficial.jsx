import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Reveal from "@/components/animated/Reveal";

/**
 * A chamada da API Oficial, no fim da home.
 *
 * ─── POR QUE AQUI, E NÃO ANTES DOS PLANOS ────────────────────────────────
 *
 * São duas portas para dois públicos, e elas não podem competir pelo mesmo
 * olhar. Os Planos servem quem já decidiu e quer se contratar sozinho; esta
 * faixa serve quem leu tudo, chegou ao fim do FAQ e não clicou em nada —
 * normalmente porque ainda não tem o número oficial e não sabe como consegue.
 *
 * Colocá-la antes dos Planos roubaria a conversão de maior valor. No fim, ela
 * pega o tráfego que ia embora: a home hoje termina no FAQ e emenda no rodapé,
 * sem nenhuma chamada final.
 *
 * ─── O FUNDO É CLARO DE PROPÓSITO ────────────────────────────────────────
 *
 * O FAQ acima é verde escuro e o rodapé abaixo é quase preto. Uma faixa escura
 * aqui viraria uma mancha só de três seções — a clara separa as duas e é onde o
 * olho descansa antes do botão.
 */

export default function ChamadaApiOficial() {
  return (
    <section className="border-t border-zinc-100 bg-white px-4 py-20 md:py-24">
      <Reveal className="mx-auto max-w-4xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          API Oficial do WhatsApp
        </span>

        <h2 className="mt-6 text-4xl font-black leading-[1.08] tracking-tighter text-zinc-900 md:text-5xl">
          Ainda atende por chip{" "}
          <span className="text-gradient-green">que pode ser bloqueado?</span>
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-600">
          Com a API Oficial, o número fica no nome da sua empresa e toda a equipe
          atende junto — sem clone do WhatsApp Web e sem sustos. A gente cuida da
          homologação com a Meta e devolve pronto para usar.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/api-oficial"
            className="group inline-flex items-center gap-2 rounded-full bg-emerald-600 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            Garanta sua API Oficial agora
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
          <Link
            to="/api-oficial-whatsapp"
            className="rounded-full px-6 py-4 text-sm font-bold text-zinc-600 underline underline-offset-4 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
          >
            Entender como funciona
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
