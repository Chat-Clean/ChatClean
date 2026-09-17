import { Check } from "lucide-react";
import Reveal from "./Reveal";
import CartaoDeFuncionalidade from "@/components/funcionalidades/CartaoDeFuncionalidade";
import CenaCaixaDeEntrada from "@/components/funcionalidades/CenaCaixaDeEntrada";
import CenaRobo from "@/components/funcionalidades/CenaRobo";
import CenaEnvioEmMassa from "@/components/funcionalidades/CenaEnvioEmMassa";
import CenaFunil from "@/components/funcionalidades/CenaFunil";
import CenaEquipe from "@/components/funcionalidades/CenaEquipe";
import CenaPainel from "@/components/funcionalidades/CenaPainel";
import CenaCelular from "@/components/funcionalidades/CenaCelular";

/**
 * Funcionalidades: cada card é a funcionalidade ACONTECENDO, não um ícone
 * ilustrando o título. A cena roda quando o card entra na tela, chega
 * no resultado, segura esse quadro e recomeça, em laço enquanto o card
 * está na tela. (Ver `funcionalidades/useCena.js`.)
 *
 * Grade de 3 colunas com os cards largos alternando de lado, como uma leitura
 * em zigue-zague; 2 colunas no tablet e 1 no celular.
 *
 * `duracoes`: quanto cada passo da cena fica na tela antes do próximo, em ms.
 */
const CARDS = [
  {
    destaque: "Tudo",
    titulo: "em um só lugar",
    descricao:
      "Seus clientes falam por WhatsApp, Instagram, Facebook ou Telegram? Sua equipe responde tudo numa única tela, sem precisar trocar de aplicativo.",
    Cena: CenaCaixaDeEntrada,
    duracoes: [700, 1100, 1100, 1100],
    className: "md:col-span-2",
  },
  {
    destaque: "Robô",
    titulo: "de atendimento",
    descricao:
      "Responde seus clientes 24h por dia, 7 dias por semana. Resolve as dúvidas mais comuns sozinho e só chama um atendente quando for necessário.",
    Cena: CenaRobo,
    duracoes: [600, 900, 1100, 1300, 900, 1000],
  },
  {
    destaque: "Envio",
    titulo: "em massa",
    descricao:
      "Mande promoções, lembretes e avisos para muitos clientes ao mesmo tempo, de forma rápida e pelo WhatsApp oficial.",
    Cena: CenaEnvioEmMassa,
    duracoes: [700, 900, 1600],
  },
  {
    destaque: "Clientes e vendas",
    titulo: "organizados",
    descricao:
      "Veja o histórico completo de cada cliente, organize suas oportunidades de venda por etapa e nunca perca o fio da conversa.",
    Cena: CenaFunil,
    duracoes: [900, 1000, 1000, 800],
    className: "md:col-span-2",
  },
  {
    destaque: "Equipe",
    titulo: "organizada",
    descricao:
      "Distribua conversas entre os atendentes, crie departamentos e veja quem está atendendo o quê, em tempo real.",
    Cena: CenaEquipe,
    duracoes: [600, 900, 800, 900, 800, 900],
  },
  {
    destaque: "Painel",
    titulo: "de controle",
    descricao:
      "Veja em tempo real quantos atendimentos estão abertos, quem está respondendo e se os clientes estão sendo bem atendidos.",
    Cena: CenaPainel,
    duracoes: [600, 1100],
  },
  {
    destaque: "Atenda",
    titulo: "pelo celular",
    descricao:
      "Atenda seus clientes de onde estiver: pelo celular, tablet ou computador. Disponível para iPhone e Android.",
    Cena: CenaCelular,
    duracoes: [600, 1300, 700, 1000, 900],
    className: "md:col-span-2 lg:col-span-1",
  },
];

const GARANTIAS = [
  "Vários atendentes no mesmo número",
  "Mensagens aprovadas pelo WhatsApp",
  "Histórico de clientes integrado",
  "Suporte em Português",
];

export default function BentoFeatures() {
  return (
    <section className="relative overflow-hidden bg-creme-profundo px-4 py-24 md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-grid" />
      <div className="relative mx-auto max-w-7xl">
        <Reveal className="mx-auto mb-14 max-w-3xl text-center md:mb-20">
          <h2 className="text-4xl font-black leading-[1.05] tracking-tighter text-zinc-900 md:text-5xl lg:text-6xl">
            Tudo que sua empresa <span className="text-brand-chrome">precisa</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-zinc-600">
            Ferramentas simples de usar que ajudam sua equipe a atender melhor e vender mais, sem precisar de
            conhecimento técnico.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
          {CARDS.map((card) => (
            <CartaoDeFuncionalidade key={card.destaque} {...card} />
          ))}
        </div>

        <ul className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3">
          {GARANTIAS.map((item) => (
            <li key={item} className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
