#!/usr/bin/env node
/**
 * Simula o pagamento de uma cobrança, no SANDBOX do Asaas.
 *
 * ═══ A TRAVA ESTÁ NA PRIMEIRA COISA QUE ESTE ARQUIVO FAZ ═════════════════
 *
 * Este script confirma cobrança. Rodado contra produção, ele estaria dizendo
 * que um cliente pagou uma fatura que ninguém pagou, e o webhook liberaria a
 * conta em cima disso. Por isso a primeira conferência é o ambiente da chave:
 * `$aact_prod_` para o script antes de qualquer chamada, sem argumento de
 * `--force` para contornar. Não existe motivo legítimo para forçar.
 *
 * A trava é de cinto e suspensório: o endpoint `/sandbox/payment/{id}/confirm`
 * também só existe no sandbox. Mas depender apenas disso seria depender de o
 * Asaas nunca mudar de ideia sobre a rota, num script cuja falha custa a
 * liberação de uma conta sem pagamento.
 *
 * ═══ COMO USAR ══════════════════════════════════════════════════════════
 *
 *   npm run asaas:simular-pagamento -- --pedido <uuid>
 *   npm run asaas:simular-pagamento -- --pedido <uuid> --local http://localhost:5173
 *
 * Sem `--local`, o script confirma a cobrança e para: quem entrega o evento é
 * o Asaas, para a URL cadastrada na conta de sandbox.
 *
 * ═══ O QUE `--local` FAZ, E O QUE ELE NÃO PROVA ═════════════════════════
 *
 * O Asaas não alcança `localhost`. Então, com `--local`, o script pega a
 * cobrança REAL devolvida pela confirmação, monta o corpo no formato do
 * webhook e entrega em `/api/asaas-eventos` com o token do ambiente.
 *
 * Isso exercita o nosso handler de verdade: token, idempotência, transição de
 * Estado e disparo do provisionamento. O que ele NÃO prova é a entrega do
 * Asaas: o `id` do evento é nosso, e a fila de reentrega deles não participa.
 * Para provar a entrega ponta a ponta, o caminho é um túnel público apontando
 * para a máquina, cadastrado como webhook na conta de sandbox.
 *
 * O `id` do evento simulado começa com `evt_simulado_` de propósito: fica
 * distinguível na tabela `eventos_do_asaas`, e nunca colide com um `id` de
 * verdade.
 */

import { randomUUID } from "node:crypto";

import {
  ambienteDaChave,
  baseDoAmbiente,
} from "../api/_nucleo/asaas.js";
import { lerAmbienteDoDisco } from "./env-sem-expansao.mjs";

const raiz = process.cwd();

/* ─── Argumentos ─────────────────────────────────────────────────────────── */

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`);
  if (indice === -1) return null;
  const valor = process.argv[indice + 1];
  return typeof valor === "string" && !valor.startsWith("--") ? valor : null;
}

function parar(mensagem) {
  console.error(`\nFALHA  ${mensagem}\n`);
  process.exitCode = 1;
  return null;
}

const pedidoId = argumento("pedido");
const cobrancaArgumento = argumento("cobranca");
const local = argumento("local");

if (!pedidoId && !cobrancaArgumento) {
  parar(
    "informe --pedido <uuid do nosso pedido> ou --cobranca <id da cobrança no Asaas>.",
  );
  process.exit(1);
}

/* ─── Ambiente, e a trava ────────────────────────────────────────────────── */

const env = { ...lerAmbienteDoDisco(raiz, "development"), ...process.env };

const chave = env.ASAAS_CHAVE_DE_API ?? "";
const ambiente = ambienteDaChave(chave);

if (ambiente === null) {
  parar(
    "ASAAS_CHAVE_DE_API ausente ou com prefixo desconhecido. Nada foi chamado.",
  );
  process.exit(1);
}

if (ambiente !== "sandbox") {
  parar(
    `a chave configurada é de PRODUÇÃO. Este script confirma cobrança sem ninguém ter pagado, e não roda fora do sandbox. Nada foi chamado.`,
  );
  process.exit(1);
}

const base = baseDoAmbiente(ambiente);
console.log(`Ambiente: ${ambiente}  (${base})`);

const urlDoBanco = env.VITE_SUPABASE_URL ?? "";
const chaveDeServico = env.SUPABASE_CHAVE_DE_SERVICO ?? "";
const cabecalhosDoBanco = {
  apikey: chaveDeServico,
  Authorization: `Bearer ${chaveDeServico}`,
  "Content-Type": "application/json",
};

async function asaas(caminho, { metodo = "GET", corpo } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { access_token: chave, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => null) };
}

async function lerPedido(id) {
  if (!urlDoBanco || !chaveDeServico) return null;
  const resposta = await fetch(
    `${urlDoBanco}/rest/v1/pedidos_de_assinatura?id=eq.${encodeURIComponent(id)}&select=id,estado,asaas_assinatura_id,asaas_cobranca_id,referencia_externa`,
    { headers: cabecalhosDoBanco },
  );
  const linhas = await resposta.json().catch(() => null);
  return Array.isArray(linhas) ? (linhas[0] ?? null) : null;
}

/* ─── 1. Achar a cobrança ────────────────────────────────────────────────── */

let cobrancaId = cobrancaArgumento;
let pedido = null;

if (pedidoId) {
  pedido = await lerPedido(pedidoId);
  if (!pedido) {
    parar(`pedido ${pedidoId} não encontrado no banco.`);
    process.exit(1);
  }
  console.log(`\nPedido ${pedido.id}`);
  console.log(`  estado antes:  ${pedido.estado}`);
  console.log(`  assinatura:    ${pedido.asaas_assinatura_id ?? "(nenhuma)"}`);

  cobrancaId = cobrancaId ?? pedido.asaas_cobranca_id;

  // O pedido pode ter sido gravado antes de a cobrança existir. Nesse caso a
  // assinatura sabe qual é a primeira, e é ela que vamos confirmar.
  if (!cobrancaId && pedido.asaas_assinatura_id) {
    const lista = await asaas(
      `/subscriptions/${encodeURIComponent(pedido.asaas_assinatura_id)}/payments?limit=1`,
    );
    cobrancaId = lista.dados?.data?.[0]?.id ?? null;
  }
}

if (!cobrancaId) {
  parar("não achei a cobrança a confirmar.");
  process.exit(1);
}

/* ─── 2. Confirmar ───────────────────────────────────────────────────────── */

const antes = await asaas(`/payments/${encodeURIComponent(cobrancaId)}`);
console.log(`\nCobrança ${cobrancaId}`);
console.log(`  status antes:  ${antes.dados?.status ?? `HTTP ${antes.status}`}`);
console.log(`  valor:         R$ ${antes.dados?.value}`);
console.log(`  vencimento:    ${antes.dados?.dueDate}`);

const confirmada = await asaas(
  `/sandbox/payment/${encodeURIComponent(cobrancaId)}/confirm`,
  { metodo: "POST", corpo: {} },
);

if (confirmada.status < 200 || confirmada.status >= 300) {
  parar(
    `o Asaas recusou a confirmação (HTTP ${confirmada.status}): ${JSON.stringify(confirmada.dados)}`,
  );
  process.exit(1);
}

const cobranca = confirmada.dados;
console.log(`  status depois: ${cobranca?.status}`);

/* ─── 3. Entregar o evento no local, quando pedido ───────────────────────── */

if (local) {
  const token = env.ASAAS_TOKEN_DO_WEBHOOK ?? "";
  if (token === "") {
    parar("ASAAS_TOKEN_DO_WEBHOOK ausente: sem ele o handler recusa, e deve.");
    process.exit(1);
  }

  // `PAYMENT_CONFIRMED` é o gatilho de liberação no nosso handler: pago, saldo
  // ainda não disponível. Esperar `RECEIVED` atrasaria a conta do cliente por
  // causa do nosso fluxo de caixa.
  const evento = {
    id: `evt_simulado_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    event: "PAYMENT_CONFIRMED",
    dateCreated: new Date().toISOString(),
    payment: cobranca,
  };

  const alvo = `${local.replace(/\/+$/, "")}/api/asaas-eventos`;
  console.log(`\nEntregando o evento em ${alvo}`);
  console.log(`  id do evento: ${evento.id}`);

  const entrega = await fetch(alvo, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "asaas-access-token": token,
    },
    body: JSON.stringify(evento),
  });
  const resposta = await entrega.json().catch(() => null);
  console.log(`  resposta: HTTP ${entrega.status} ${JSON.stringify(resposta)}`);
}

/* ─── 4. Como o pedido ficou ─────────────────────────────────────────────── */

if (pedidoId) {
  const depois = await lerPedido(pedidoId);
  console.log(`\nPedido ${pedidoId}`);
  console.log(`  estado depois: ${depois?.estado ?? "(sumiu)"}`);
  if (depois?.estado === pedido.estado) {
    console.log(
      "\n  O Estado não mudou. Sem --local, isso é esperado: quem move o pedido",
      "\n  é o webhook, e o Asaas não alcança a sua máquina. Com --local, olhe a",
      "\n  resposta acima e o terminal do `npm run dev`.",
    );
  }
}

console.log("");
