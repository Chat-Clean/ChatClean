/**
 * A gravação do lead da API Oficial.
 *
 * Uma tabela, uma operação: inserir. Não lê, não atualiza, não apaga — o site
 * não tem motivo para nenhuma dessas coisas, e a superfície menor é a defesa
 * mais barata que existe.
 *
 * ─── A CREDENCIAL NUNCA APARECE NA MENSAGEM DE ERRO ──────────────────────
 *
 * `esconder` troca a chave de serviço por um marcador antes de qualquer texto
 * sair daqui. Mensagem de erro de rede às vezes carrega a URL inteira, e a URL
 * às vezes carrega o cabeçalho — é assim que credencial vaza para um log de
 * plataforma sem ninguém ter escrito `console.log(chave)`.
 */

import { lerAmbiente } from "./acesso.js";

export const PRAZO_PADRAO_MS = 5000;

export const TIPOS = Object.freeze({
  FORMULARIO_INVALIDO: "FORMULARIO_INVALIDO",
  CONFIGURACAO: "CONFIGURACAO",
  BANCO: "BANCO",
  BANCO_INDISPONIVEL: "BANCO_INDISPONIVEL",
});

export function criarBancoDeLeads({
  url,
  chaveDeServico,
  buscar = globalThis.fetch,
  prazoMs = PRAZO_PADRAO_MS,
}) {
  const esconder = (texto) => {
    let s = String(texto ?? "");
    if (typeof chaveDeServico === "string" && chaveDeServico.length >= 8) {
      s = s.split(chaveDeServico).join("«credencial oculta»");
    }
    return s;
  };

  function sinal(ms) {
    try {
      return AbortSignal.timeout(ms);
    } catch {
      return undefined;
    }
  }

  return {
    /**
     * Grava o lead e devolve o `id` gerado pelo banco.
     *
     * `Prefer: return=representation` traz a linha de volta na mesma ida — o
     * `id` serve para correlacionar o registro com o log sem ter que consultar
     * de novo, e sem precisar de uma segunda viagem que pode falhar sozinha.
     */
    async inserir(linha) {
      let resposta;
      try {
        resposta = await buscar(`${url}/rest/v1/leads_da_api_oficial`, {
          method: "POST",
          headers: {
            apikey: chaveDeServico,
            Authorization: `Bearer ${chaveDeServico}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(linha),
          signal: sinal(prazoMs),
        });
      } catch (erro) {
        return {
          ok: false,
          tipo: TIPOS.BANCO_INDISPONIVEL,
          mensagem: "não conseguimos falar com o banco agora",
          detalhe: esconder(erro?.message ?? "falha de rede"),
        };
      }

      const bruto = await resposta.text().catch(() => "");

      if (!resposta.ok) {
        return {
          ok: false,
          tipo:
            resposta.status >= 500
              ? TIPOS.BANCO_INDISPONIVEL
              : TIPOS.BANCO,
          mensagem: "o banco recusou a gravação",
          detalhe: esconder(`HTTP ${resposta.status} ${bruto}`),
        };
      }

      let dados = null;
      if (bruto !== "") {
        try {
          dados = JSON.parse(bruto);
        } catch {
          return {
            ok: false,
            tipo: TIPOS.BANCO,
            mensagem: "o banco respondeu algo que não é JSON",
            detalhe: esconder(bruto.slice(0, 300)),
          };
        }
      }

      const linhaGravada = Array.isArray(dados) ? dados[0] : dados;
      if (!linhaGravada?.id) {
        return {
          ok: false,
          tipo: TIPOS.BANCO,
          mensagem: "a gravação não devolveu identificador",
          detalhe: esconder(JSON.stringify(dados).slice(0, 300)),
        };
      }

      return { ok: true, id: linhaGravada.id };
    },
  };
}

/** O banco a partir das variáveis de ambiente, ou o erro de configuração. */
export function bancoDoAmbiente(ambiente, opcoes = {}) {
  const lido = lerAmbiente(ambiente);
  if (!lido.ok) {
    // `lerAmbiente` devolve o que faltou e o que veio inválido, em listas
    // separadas. As duas viram uma linha só de diagnóstico, que vai para o log
    // do servidor — nunca para a resposta.
    const partes = [
      ...(lido.faltando ?? []).map((nome) => `ausente: ${nome}`),
      ...(lido.invalidas ?? []),
    ];
    return {
      ok: false,
      tipo: TIPOS.CONFIGURACAO,
      mensagem: "a captação de leads não está configurada neste ambiente",
      detalhe: partes.length > 0 ? partes.join("; ") : "ambiente incompleto",
    };
  }
  return {
    ok: true,
    banco: criarBancoDeLeads({
      url: lido.config.url,
      chaveDeServico: lido.config.chaveDeServico,
      ...opcoes,
    }),
  };
}
