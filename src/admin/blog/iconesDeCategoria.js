/**
 * O desenho de cada chave de ícone de Categoria.
 *
 * **Isto não é uma segunda lista de Categorias.** É um mapa de aparência
 * chaveado pelo vocabulário fechado de `domain/blog/categorias.js`, e a
 * verificação exige IGUALDADE entre as chaves daqui e as de lá — **nos dois
 * sentidos**. Chave nova sem desenho falha a auditoria; desenho órfão de chave
 * removida também.
 *
 * ─── POR QUE A LISTA MORA NO DOMÍNIO E O DESENHO MORA AQUI ──────────────────
 *
 * Quem RECUSA um ícone fora do vocabulário é o servidor, e o servidor roda em
 * Node: ele não pode importar `lucide-react`, e `api/` não pode importar de
 * `admin/blog` — é a direção proibida. Então a lista fechada é domínio puro, e
 * o desenho é do Painel. Uma segunda lista de chaves aqui seria a divergência
 * que só apareceria no dia em que alguém escolhesse um ícone que o servidor
 * recusa.
 *
 * Arquivo `.js` e não `.jsx` de propósito, no molde de `icones.js`: sem JSX o
 * Node importa e a verificação compara as chaves **executando**, em vez de
 * procurar por expressão regular.
 *
 * As chaves nomeiam o DESENHO, e não a Categoria: "faisca", e não "novidades".
 * Chave com nome de Categoria seria a lista fixa de seis nomes voltando pela
 * porta dos fundos — que é exatamente o que esta story veio desfazer.
 */

import {
  BookOpen,
  Bot,
  ChartColumn,
  Cpu,
  Folder,
  MessagesSquare,
  Sparkles,
  Star,
  Tag,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

/**
 * Cada entrada é `{ desenho, rotulo }` — e o rótulo não é enfeite.
 *
 * A escolha do ícone é oferecida como um grupo de opções, e o nome acessível
 * de cada uma era a CHAVE: quem navega por leitor de tela ouvia "faisca",
 * "chip", "robo" — nome de código, sem acento e sem sentido fora do fonte. O
 * rótulo é a palavra de interface, e ela mora junto do desenho porque manter um
 * segundo mapa de rótulos seria duas listas para sincronizar em vez de uma.
 */
export const ICONES_DE_CATEGORIA = Object.freeze({
  etiqueta: Object.freeze({ desenho: Tag, rotulo: "Etiqueta" }),
  pasta: Object.freeze({ desenho: Folder, rotulo: "Pasta" }),
  faisca: Object.freeze({ desenho: Sparkles, rotulo: "Faísca" }),
  alvo: Object.freeze({ desenho: Target, rotulo: "Alvo" }),
  grafico: Object.freeze({ desenho: ChartColumn, rotulo: "Gráfico" }),
  robo: Object.freeze({ desenho: Bot, rotulo: "Robô" }),
  subindo: Object.freeze({ desenho: TrendingUp, rotulo: "Seta subindo" }),
  chip: Object.freeze({ desenho: Cpu, rotulo: "Chip" }),
  conversa: Object.freeze({ desenho: MessagesSquare, rotulo: "Conversa" }),
  livro: Object.freeze({ desenho: BookOpen, rotulo: "Livro" }),
  raio: Object.freeze({ desenho: Zap, rotulo: "Raio" }),
  estrela: Object.freeze({ desenho: Star, rotulo: "Estrela" }),
});
