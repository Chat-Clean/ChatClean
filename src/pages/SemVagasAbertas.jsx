import { ArrowRight, Briefcase } from "lucide-react";
import {
  ENDERECO_DO_CURRICULO,
  LISTA_VAZIA,
  ROTULO_DO_CURRICULO,
  falaDaLista,
} from "./carreirasPublico";

/**
 * O estado vazio da lista pública (Story 5.7): nenhuma Vaga Aberta, e o
 * convite de enviar o currículo pelo WhatsApp. É o MESMO vazio que
 * `/carreiras` mostrava antes, agora usado também pela Vaga Encerrada.
 *
 * Só aparece quando a leitura DEU CERTO e voltou vazia: quem decide é
 * `situacaoDaLista`, que confere o erro antes do vazio.
 */
export default function SemVagasAbertas({ Titulo = "h3" }) {
  const fala = falaDaLista(LISTA_VAZIA);
  return (
    <div
      data-papel="sem-vagas"
      className="text-center py-16 md:py-20 px-6 bg-white rounded-3xl border border-zinc-100"
    >
      <div className="w-20 h-20 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-6">
        <Briefcase aria-hidden="true" className="w-9 h-9 text-zinc-400" />
      </div>
      <Titulo className="text-2xl font-black text-zinc-900 tracking-tight mb-3">
        {fala.oQueHouve}
      </Titulo>
      <p className="text-zinc-500 text-base max-w-md mx-auto mb-8 leading-relaxed">
        {fala.oQueFazer}
      </p>
      <a
        href={ENDERECO_DO_CURRICULO}
        target="_blank"
        rel="noopener noreferrer"
        data-acao="enviar-curriculo"
        className="inline-flex items-center gap-2 px-7 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full shadow-lg shadow-emerald-500/30 hover:scale-[1.02] transition-all duration-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      >
        {ROTULO_DO_CURRICULO}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </a>
    </div>
  );
}
