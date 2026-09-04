#!/usr/bin/env node
/**
 * O webhook de provisionamento: um receptor de referência e um testador.
 *
 * ═══ O QUE É O PROVISIONAMENTO ═══════════════════════════════════════════
 *
 * Quando o Asaas confirma o pagamento, o pedido vira `pago` e a plataforma
 * precisa criar a conta do cliente. Esse último passo NÃO é feito aqui: é uma
 * chamada assinada para um endereço seu, declarado em `PROVISIONAMENTO_URL`.
 *
 * Enquanto ele não existir, o pedido pago para em `falha_no_provisionamento`,
 * nenhuma tentativa é gasta, e a tela diz ao cliente que o pagamento entrou e
 * a conta ainda não subiu. É o estado honesto, e ele volta a andar sozinho no
 * primeiro evento depois de a variável existir.
 *
 * ═══ DOIS MODOS ══════════════════════════════════════════════════════════
 *
 *   npm run provisionamento -- --servir 4000
 *
 *     Sobe um receptor de REFERÊNCIA nesta máquina. Ele confere a assinatura
 *     HMAC do jeito certo, recusa timestamp velho, e imprime o corpo que
 *     chegou. Aponte `PROVISIONAMENTO_URL` para ele e exercite o pagamento
 *     inteiro hoje, sem ter a plataforma pronta.
 *
 *   npm run provisionamento -- --enviar https://…/provisionar
 *
 *     Manda um disparo assinado de MENTIRA para o seu endereço, com o mesmo
 *     corpo e os mesmos cabeçalhos que o de verdade, e conta o que voltou. É
 *     como conferir o endpoint sem depender de uma venda acontecer.
 *
 * O segredo vem de `PROVISIONAMENTO_SEGREDO` no ambiente, ou de `--segredo`.
 * Ele nunca é impresso.
 */

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { assinarCorpo, corpoDoProvisionamento } from "../api/_nucleo/eventosDoAsaas.js";
import { lerAmbienteDoDisco } from "./env-sem-expansao.mjs";

/** Depois disso, um disparo capturado não vale mais. */
export const JANELA_EM_SEGUNDOS = 300;

function argumento(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return null;
  const valor = process.argv[i + 1];
  return typeof valor === "string" && !valor.startsWith("--") ? valor : null;
}

const env = { ...lerAmbienteDoDisco(process.cwd(), "development"), ...process.env };
const segredo = argumento("segredo") ?? env.PROVISIONAMENTO_SEGREDO ?? "";

if (segredo === "") {
  console.error(
    "\nFALHA  sem segredo. Declare PROVISIONAMENTO_SEGREDO no ambiente ou passe --segredo.\n",
  );
  process.exit(1);
}

/**
 * A conferência que o SEU endpoint precisa fazer, escrita uma vez.
 *
 * Comparação em tempo constante, e o timestamp entra no cálculo: assinar só o
 * corpo deixaria uma chamada capturada válida para sempre.
 */
export function conferir({ corpo, assinatura, timestamp, segredo: chave, agora = Date.now() }) {
  if (typeof assinatura !== "string" || !assinatura.startsWith("sha256=")) {
    return { ok: false, motivo: "cabeçalho de assinatura ausente ou fora do formato" };
  }
  const instante = Number(timestamp);
  if (!Number.isFinite(instante)) {
    return { ok: false, motivo: "timestamp ausente ou não numérico" };
  }
  const idade = Math.abs(Math.floor(agora / 1000) - instante);
  if (idade > JANELA_EM_SEGUNDOS) {
    return { ok: false, motivo: `timestamp fora da janela (${idade}s)` };
  }

  const esperada = `sha256=${assinarCorpo(corpo, chave, timestamp)}`;
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "assinatura não confere" };
  }
  return { ok: true, motivo: "" };
}

/** Um pedido de mentira, com a forma exata do de verdade. */
function disparoDeExemplo() {
  const pedidoId = "00000000-0000-4000-8000-000000000001";
  return corpoDoProvisionamento({
    pedido: {
      id: pedidoId,
      criado_em: new Date().toISOString(),
      nome: "Maria de Souza",
      email: "maria@exemplo.com.br",
      telefone: "84999000111",
      cnpj: "33000167000101",
      razao_social: "EXEMPLO COMERCIO LTDA",
      plano_id: "pro",
      usuarios: 5,
      conexoes: 2,
      dia_de_vencimento: 10,
      valor_centavos: 74950,
      asaas_cliente_id: "cus_exemplo",
      asaas_assinatura_id: "sub_exemplo",
      asaas_cobranca_id: "pay_exemplo",
    },
    evento: "PAYMENT_CONFIRMED",
    cobranca: { id: "pay_exemplo", status: "CONFIRMED", value: 749.5 },
  });
}

/* ═══ Modo receptor ════════════════════════════════════════════════════════ */

const porta = argumento("servir");

if (porta !== null) {
  const servidor = createServer((req, res) => {
    const pedacos = [];
    req.on("data", (p) => pedacos.push(p));
    req.on("end", () => {
      const corpo = Buffer.concat(pedacos).toString("utf8");
      const carimbo = new Date().toLocaleTimeString("pt-BR");

      if (req.method !== "POST") {
        res.writeHead(405, { Allow: "POST" });
        res.end('{"erro":"use POST"}');
        return;
      }

      const veredito = conferir({
        corpo,
        assinatura: req.headers["x-chatclean-assinatura"],
        timestamp: req.headers["x-chatclean-timestamp"],
        segredo,
      });

      console.log(`\n[${carimbo}] POST ${req.url}`);
      console.log(`  idempotência: ${req.headers["x-chatclean-idempotencia"] ?? "(ausente)"}`);
      console.log(`  assinatura:   ${veredito.ok ? "CONFERE" : `RECUSADA (${veredito.motivo})`}`);

      if (!veredito.ok) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ erro: veredito.motivo }));
        return;
      }

      try {
        const lido = JSON.parse(corpo);
        console.log(`  pedido:       ${lido.pedidoId}`);
        console.log(`  cliente:      ${lido.cliente?.razaoSocial} (${lido.cliente?.cnpj})`);
        console.log(
          `  contratação:  ${lido.contratacao?.planoId}, ${lido.contratacao?.usuarios} usuário(s), ${lido.contratacao?.conexoes} conexão(ões)`,
        );
      } catch {
        console.log("  corpo:        não é JSON");
      }

      // 2xx é o que diz "a conta foi criada". Qualquer outra coisa faz o
      // pedido ficar em `falha_no_provisionamento` e gastar uma tentativa.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true,"contaId":"acc_de_referencia"}');
    });
  });

  servidor.listen(Number(porta), () => {
    console.log(`
Receptor de referência de pé em http://localhost:${porta}/provisionar

  Declare no ambiente e reinicie o \`npm run dev\`:

    $env:PROVISIONAMENTO_URL = "http://localhost:${porta}/provisionar"
    $env:PROVISIONAMENTO_SEGREDO = "<o mesmo segredo>"

  Depois crie um pedido e rode:

    npm run asaas:simular-pagamento -- --pedido <uuid> --local http://localhost:5173

  Este receptor SEMPRE responde 200. Ele existe para provar a cadeia, não para
  substituir a sua plataforma.
`);
  });
} else {
  /* ═══ Modo testador ═════════════════════════════════════════════════════ */

  const alvo = argumento("enviar") ?? env.PROVISIONAMENTO_URL ?? "";
  if (alvo === "") {
    console.error(
      "\nFALHA  informe --servir <porta> ou --enviar <url> (ou declare PROVISIONAMENTO_URL).\n",
    );
    process.exit(1);
  }

  const corpo = JSON.stringify(disparoDeExemplo());
  const timestamp = String(Math.floor(Date.now() / 1000));
  const chave = "00000000-0000-4000-8000-000000000001:pay_exemplo";

  console.log(`\nDisparando um provisionamento de exemplo para ${alvo}`);
  console.log(`  idempotência: ${chave}`);
  console.log(`  bytes:        ${Buffer.byteLength(corpo)}`);

  let resposta = null;
  let texto = "";
  try {
    resposta = await fetch(alvo, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ChatClean-Timestamp": timestamp,
        "X-ChatClean-Assinatura": `sha256=${assinarCorpo(corpo, segredo, timestamp)}`,
        "X-ChatClean-Idempotencia": chave,
      },
      body: corpo,
    });
    texto = await resposta.text().catch(() => "");
  } catch (erro) {
    console.error(`\nFALHA  não conseguimos falar com o endereço: ${erro?.message}\n`);
    process.exit(1);
  }

  const aceitou = resposta.status >= 200 && resposta.status < 300;
  console.log(`\n  resposta:     HTTP ${resposta.status}`);
  console.log(`  corpo:        ${texto.slice(0, 300) || "(vazio)"}`);
  console.log(
    aceitou
      ? "\n  2xx: o pedido seria marcado como `ativo`.\n"
      : "\n  Fora de 2xx: o pedido ficaria em `falha_no_provisionamento` e gastaria uma tentativa.\n",
  );
  process.exitCode = aceitou ? 0 : 1;
}
