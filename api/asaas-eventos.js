/**
 * O invólucro de plataforma do webhook do Asaas.
 *
 * Fino, como os outros: confere o token, entrega o corpo ao núcleo e traduz o
 * resultado em status. A lógica mora em `api/_nucleo/eventosDoAsaas.js`.
 *
 * ─── QUANDO ESTA PORTA DEVOLVE ERRO, E QUANDO NÃO ────────────────────────
 *
 * O Asaas pausa a fila do webhook depois de **15 falhas consecutivas**, e
 * evento parado é descartado em 14 dias. Então erro aqui é caro, e a regra é
 * estreita:
 *
 *   * `401` — token errado. Não é evento nosso; a fila do Asaas legítimo não
 *     é afetada, porque quem chamou não era ele.
 *   * `400` — corpo sem `id` ou sem `event`. Não é um evento do Asaas.
 *   * `500` — não conseguimos GUARDAR o evento. Aqui o reenvio é exatamente o
 *     que queremos.
 *   * `200` — em todo o resto, inclusive quando o processamento falhou. O
 *     evento está gravado, o erro está no registro dele, e um defeito de regra
 *     de negócio nossa não deve gastar uma das quinze falhas.
 *
 * ─── POR QUE A URL NÃO É SECRETA ─────────────────────────────────────────
 *
 * O caminho é público e previsível de propósito: o segredo é o token no
 * cabeçalho `asaas-access-token`, conferido em tempo constante. Segurança por
 * URL difícil de adivinhar aparece em log de proxy, em histórico de navegador e
 * em captura de tela.
 */

import { asaasDoAmbiente } from "./_nucleo/asaas.js";
import { bancoDoAmbiente } from "./_nucleo/bancoDaAssinatura.js";
import { receberEvento, tokenConfere } from "./_nucleo/eventosDoAsaas.js";
import { corpoComoObjeto } from "./assinar.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ mensagem: "use POST" });
  }

  const asaas = asaasDoAmbiente(process.env);
  if (!asaas.ok) {
    console.error(
      "[asaas-eventos] configuração incompleta:",
      JSON.stringify({ faltando: asaas.faltando, invalidas: asaas.invalidas }),
    );
    return res.status(500).json({ mensagem: "webhook não configurado" });
  }

  const recebido =
    req.headers["asaas-access-token"] ?? req.headers["Asaas-Access-Token"];

  if (!tokenConfere(recebido, asaas.config.tokenDoWebhook)) {
    // Sem detalhe no corpo e sem o token no log: quem errou o token não precisa
    // saber por que, e o token certo não deve aparecer em lugar nenhum.
    console.error("[asaas-eventos] token recusado");
    return res.status(401).json({ mensagem: "token inválido" });
  }

  const banco = bancoDoAmbiente(process.env);
  if (!banco.ok) {
    console.error(
      "[asaas-eventos] configuração do banco incompleta:",
      JSON.stringify({ faltando: banco.faltando, invalidas: banco.invalidas }),
    );
    return res.status(500).json({ mensagem: "webhook não configurado" });
  }

  const resultado = await receberEvento({
    corpo: corpoComoObjeto(req.body),
    banco: banco.banco,
    config: asaas.config,
  });

  if (resultado.invalido) {
    console.error(`[asaas-eventos] corpo inválido: ${resultado.mensagem}`);
    return res.status(400).json({ mensagem: "corpo inválido" });
  }

  if (!resultado.aceito) {
    // Não guardamos o evento. Este é o único caso em que queremos o reenvio.
    console.error(`[asaas-eventos] não guardou: ${resultado.mensagem}`);
    return res.status(500).json({ mensagem: "tente novamente" });
  }

  if (resultado.erroNoProcessamento) {
    console.error(
      `[asaas-eventos] guardado, com erro no processamento: ${resultado.erroNoProcessamento}`,
    );
  }

  return res.status(200).json({ recebido: true, novo: resultado.novo });
}
