/**
 * O lead da API Oficial, em regra pura.
 *
 * Sem React e sem rede: valida o formulário, monta a mensagem que abre a
 * conversa no WhatsApp e nada mais. A tela usa para acusar erro enquanto a
 * pessoa digita; o servidor usa a MESMA função para decidir se grava.
 *
 * ─── A VALIDAÇÃO DA TELA NÃO É VALIDAÇÃO ─────────────────────────────────
 *
 * Qualquer um manda um POST direto para `/api/lead` sem nunca abrir a página.
 * Por isso a regra mora aqui, num módulo que os dois lados importam, em vez de
 * viver espalhada em `onSubmit`. Duas cópias da regra viram duas regras
 * diferentes no terceiro mês.
 *
 * ─── E-MAIL E TELEFONE VÊM DO MÓDULO DA ASSINATURA ───────────────────────
 *
 * Não se copia validação. "E-mail válido" precisa significar a mesma coisa no
 * checkout e aqui — duas definições divergentes é como um endereço passa em um
 * formulário e falha no outro.
 *
 * O caminho é relativo e traz a extensão porque `api/lead.js` importa este
 * mesmo arquivo, e lá não existe o alias `@/` — quem resolve o alias é o Vite,
 * que não participa da execução da função de servidor.
 */

import {
  emailEhValido,
  formatarTelefone,
  somenteDigitos,
  telefoneEhValido,
} from "../assinatura/pedido.js";

/** O WhatsApp da ChatClean, para onde o lead segue depois de gravado. */
export const WHATSAPP_DA_CHATCLEAN = "5584998900718";

/** A versão do texto de consentimento aceito no formulário. */
export const VERSAO_DO_ACEITE = "2026-09-03";

/** Quantas pessoas atendem hoje. Pergunta de qualificação, opcional. */
export const FAIXAS_DE_ATENDENTES = Object.freeze([
  { id: "1", rotulo: "Só eu" },
  { id: "2-5", rotulo: "2 a 5" },
  { id: "6-15", rotulo: "6 a 15" },
  { id: "16+", rotulo: "Mais de 15" },
]);

const IDS_DAS_FAIXAS = Object.freeze(FAIXAS_DE_ATENDENTES.map((f) => f.id));

export const CAMPOS = Object.freeze([
  "nome",
  "email",
  "telefone",
  "empresa",
  "atendentes",
  "aceite",
]);

const LIMITES = Object.freeze({
  nome: 120,
  email: 160,
  empresa: 120,
});

/** Corta espaço das pontas e colapsa o do meio. */
export function limpar(bruto) {
  return String(bruto ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Valida o formulário inteiro.
 *
 * Devolve `{ ok, erros, lead }`. `erros` é o mapa campo → frase, e a frase diz
 * o que fazer, não que o valor é inválido.
 */
export function validarLead(bruto = {}) {
  const erros = {};

  const nome = limpar(bruto.nome);
  if (nome === "") {
    erros.nome = "Diga como podemos chamar você.";
  } else if (nome.length > LIMITES.nome) {
    erros.nome = `Use até ${LIMITES.nome} caracteres.`;
  }

  const email = limpar(bruto.email).toLowerCase();
  if (email === "") {
    erros.email = "Precisamos de um e-mail para enviar a proposta.";
  } else if (email.length > LIMITES.email) {
    erros.email = `Use até ${LIMITES.email} caracteres.`;
  } else if (!emailEhValido(email)) {
    erros.email = "Confira o e-mail: falta o @ ou o domínio.";
  }

  const telefone = somenteDigitos(bruto.telefone);
  if (telefone === "") {
    erros.telefone = "Precisamos do WhatsApp para falar com você.";
  } else if (!telefoneEhValido(telefone)) {
    erros.telefone = "Confira o número: DDD mais 8 ou 9 dígitos.";
  }

  const empresa = limpar(bruto.empresa);
  if (empresa === "") {
    erros.empresa = "Diga o nome da sua empresa.";
  } else if (empresa.length > LIMITES.empresa) {
    erros.empresa = `Use até ${LIMITES.empresa} caracteres.`;
  }

  // Opcional: só recusa valor que não existe na lista, nunca a ausência.
  const atendentes = limpar(bruto.atendentes);
  if (atendentes !== "" && !IDS_DAS_FAIXAS.includes(atendentes)) {
    erros.atendentes = "Escolha uma das opções.";
  }

  if (bruto.aceite !== true) {
    erros.aceite = "Marque para autorizar o contato.";
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    erros: {},
    lead: {
      nome,
      email,
      telefone,
      empresa,
      atendentes: atendentes === "" ? null : atendentes,
      aceiteVersao: VERSAO_DO_ACEITE,
    },
  };
}

/**
 * Os parâmetros de campanha da URL.
 *
 * Lista de permissão fechada: só os cinco `utm_*` padrão entram. Copiar a
 * querystring inteira levaria para o banco qualquer coisa que um link
 * carregasse — inclusive dado pessoal colado por engano numa URL compartilhada.
 */
export const PARAMETROS_DE_CAMPANHA = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

export function campanhaDaBusca(busca) {
  const campanha = {};
  let parametros;
  try {
    parametros = new URLSearchParams(busca ?? "");
  } catch {
    return campanha;
  }
  for (const chave of PARAMETROS_DE_CAMPANHA) {
    const valor = limpar(parametros.get(chave)).slice(0, 120);
    if (valor !== "") campanha[chave] = valor;
  }
  return campanha;
}

/**
 * A mensagem que já vai escrita no WhatsApp.
 *
 * Escrita na voz de quem manda — é a pessoa que envia, não a ChatClean. Diz
 * quem é, de onde veio e o que quer, para o atendimento não recomeçar do zero
 * perguntando o que o formulário já respondeu.
 */
export function mensagemDoWhatsApp({ nome, empresa } = {}) {
  const quem = limpar(nome);
  const onde = limpar(empresa);
  return [
    `Olá! Sou ${quem === "" ? "da" : `${quem}, da`} ${onde === "" ? "minha empresa" : onde}.`,
    "Acabei de pedir a API Oficial do WhatsApp pelo site e quero continuar por aqui.",
  ].join(" ");
}

/** O endereço completo da conversa, com a mensagem pronta. */
export function enderecoDoWhatsApp(lead, numero = WHATSAPP_DA_CHATCLEAN) {
  const texto = encodeURIComponent(mensagemDoWhatsApp(lead));
  return `https://wa.me/${numero}?text=${texto}`;
}

/** Como o telefone aparece de volta para a pessoa conferir. */
export function telefoneVisivel(bruto) {
  return formatarTelefone(bruto);
}
