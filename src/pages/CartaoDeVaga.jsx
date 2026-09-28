import { Link } from "react-router-dom";
import { ArrowRight, MapPin } from "lucide-react";
import {
  ROTULO_DO_CARTAO,
  classificacoesDaVaga,
  enderecoDaVagaPublica,
  localDaVaga,
  rotuloDoCartao,
} from "./carreirasPublico";

/**
 * O cartão de uma Vaga Aberta no site público (Story 5.7): em `/carreiras` e
 * nas listas da Página da Vaga.
 *
 * O título é `h3` por padrão (abaixo do `h2` da seção); quem monta o cartão
 * noutro nível passa `Titulo`. A Cor das Classificações vai por `style`, com
 * o par de tokens do domínio: nenhuma classe vem do banco, e o nome vai
 * escrito por extenso ao lado da cor.
 */
export default function CartaoDeVaga({ vaga, Titulo = "h3" }) {
  const endereco = enderecoDaVagaPublica(vaga);
  const local = localDaVaga(vaga);
  const resumo = typeof vaga?.resumo === "string" ? vaga.resumo.trim() : "";
  return (
    <article
      data-vaga={vaga?.slug ?? ""}
      className="h-full bg-white rounded-3xl border border-zinc-100 hover:border-emerald-200 p-6 md:p-8 green-glow card-3d transition-all duration-500 flex flex-col"
    >
      <ul className="flex flex-wrap gap-2 mb-5" aria-label="Classificações da vaga">
        {classificacoesDaVaga(vaga).map((item) => (
          <li
            key={item.chave}
            data-classificacao={item.chave}
            className={
              item.fundo === null
                ? "text-xs font-bold px-3 py-1 rounded-full border border-zinc-200 text-zinc-600 bg-white"
                : "text-xs font-bold px-3 py-1 rounded-full"
            }
            style={item.fundo === null ? undefined : { backgroundColor: item.fundo, color: item.tinta }}
          >
            {item.nome}
          </li>
        ))}
      </ul>

      <Titulo
        data-papel="titulo-da-vaga"
        className="text-xl md:text-2xl font-black text-zinc-900 tracking-tighter leading-tight"
      >
        {vaga?.titulo}
      </Titulo>

      {local !== "" && (
        <p data-papel="local" className="flex items-center gap-1.5 mt-2 text-sm text-zinc-500">
          <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {local}
        </p>
      )}

      {resumo !== "" && (
        <p data-papel="resumo" className="mt-4 text-zinc-600 text-sm leading-relaxed">
          {resumo}
        </p>
      )}

      {endereco !== null && (
        <div className="mt-auto pt-6">
          <Link
            to={endereco}
            data-acao="ver-vaga"
            aria-label={rotuloDoCartao(vaga)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full shadow-lg shadow-emerald-500/30 hover:scale-[1.02] transition-all duration-200 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            {ROTULO_DO_CARTAO}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      )}
    </article>
  );
}
