/**
 * As rotas de página do blog: `/blog` e `/blog/:slug`.
 *
 * ─── O QUE ELA FAZ, E O QUE AINDA NÃO FAZ ─────────────────────────────────
 *
 * Ela serve o SHELL DO BUILD — o mesmo `dist/index.html` que a hospedagem
 * serviria, com os ativos com hash daquele build. Nada de metadado por Post,
 * conteúdo servido, canônica ou status por Estado: são as Stories 4.2 a 4.6, e
 * é justamente para elas existirem que esta rota precisa existir primeiro.
 *
 * ─── O DADO CHEGA POR PARÂMETRO ───────────────────────────────────────────
 *
 * A reescrita entrega `?slug=`. O caminho que chega em `req.url` é o DESTA
 * função, e não o do visitante — derivar o endereço do Post dali produziria
 * `/api/blog`. A Story 4.5 registra esse engano por escrito ao proibir montar a
 * canônica a partir da requisição; aqui ele já vale.
 */

import { lerShell } from "./_nucleo/shell.js";
import { metodoRecusado, responderDefeito, responderDocumento } from "./_nucleo/entrega.js";

/** O tipo do documento que esta rota promete. */
export const TIPO_DA_PAGINA = "text/html; charset=utf-8";

export default async function handler(req, res) {
  if (metodoRecusado(req, res)) return;

  const shell = await lerShell();
  if (!shell.ok) {
    responderDefeito(res, shell.defeito);
    return;
  }

  /* O `slug` é lido e ainda não muda nada: quem o consome é a Story 4.3 em
     diante. Lê-lo aqui é o que prova, desde já, que a reescrita o entrega —
     uma rota que ignora o parâmetro não deixaria a ausência dele aparecer. */
  responderDocumento(res, { tipo: TIPO_DA_PAGINA, corpo: shell.html });
}
