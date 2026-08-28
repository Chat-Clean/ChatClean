/**
 * O ícone de cada elemento do schema.
 *
 * **Isto não é uma segunda lista de botões.** É um mapa de aparência chaveado
 * pela chave do schema, e a verificação exige IGUALDADE entre as chaves daqui
 * e as do schema — nos dois sentidos. Elemento novo sem ícone falha a
 * auditoria; ícone órfão de elemento removido também.
 *
 * A barra não depende deste mapa para existir: um elemento sem ícone continua
 * aparecendo, com o rótulo por extenso no lugar do desenho. Ícone que falta é
 * defeito de acabamento, não elemento que some da barra sem ninguém notar.
 *
 * Arquivo `.js` e não `.jsx` de propósito: sem JSX, o Node importa e a
 * verificação compara as chaves executando, em vez de procurar por regex.
 */

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
} from "lucide-react";

export const ICONES = Object.freeze({
  titulo2: Heading2,
  titulo3: Heading3,
  negrito: Bold,
  italico: Italic,
  listaOrdenada: ListOrdered,
  listaComMarcadores: List,
  link: Link2,
  citacao: Quote,
  blocoDeCodigo: Code,
  linhaDivisoria: Minus,
  alinharEsquerda: AlignLeft,
  alinharCentro: AlignCenter,
  alinharDireita: AlignRight,
});
