/**
 * As regras de sessão, sem React.
 *
 * Este arquivo existe separado do provider por um motivo de verificação, não de
 * organização: é JavaScript puro, sem JSX e sem alias `@/`, então a ferramenta
 * de verificação consegue IMPORTAR estas funções e EXECUTÁ-LAS de verdade, em
 * vez de afirmar coisas sobre o texto do arquivo. Asserção por regex sobre
 * código-fonte sobrevive a qualquer refatoração que a quebre.
 */

/**
 * UMA frase para credencial recusada, qualquer que seja o motivo.
 *
 * Medido no projeto: senha errada e e-mail inexistente já devolvem `400` com
 * corpo idêntico (`invalid_credentials`). O risco nunca foi criar essa
 * indistinguibilidade — é a tela quebrá-la, traduzindo os dois casos de forma
 * diferente e entregando ao atacante a lista de quem trabalha aqui. Por isso
 * TODA recusa que não seja falha de infraestrutura cai nesta constante.
 */
export const ERRO_CREDENCIAL = "E-mail ou senha inválidos.";

/**
 * Falha de infraestrutura NÃO usa a frase acima. Confundir "o servidor não
 * respondeu" com "sua senha está errada" faz a pessoa trocar a senha certa por
 * uma nova em cima de uma rede fora do ar.
 */
export const ERRO_REDE =
  "Não foi possível falar com o servidor de contas. Verifique sua conexão e tente de novo.";
export const ERRO_SERVIDOR =
  "O servidor de contas respondeu com erro. Tente de novo em instantes.";
export const ERRO_LIMITE =
  "Tentativas demais em pouco tempo. Aguarde um minuto e tente de novo.";

/** O servidor aceitou a credencial mas não devolveu sessão — não é sucesso. */
export const ERRO_SEM_SESSAO =
  "O servidor aceitou a credencial mas não abriu sessão. Tente de novo.";

/** A sessão guardada existe, mas não deu para conferi-la com o servidor. */
export const ERRO_SESSAO_NAO_CONFERIDA =
  "Não foi possível conferir sua sessão com o servidor. Entre de novo quando a conexão voltar.";

/**
 * Traduz o erro do Supabase em mensagem para a tela.
 *
 * A ordem importa: só depois de descartar rede, sobrecarga e limite de taxa é
 * que a recusa vira a frase genérica. Nenhum ramo distingue "conta não existe"
 * de "senha errada" — não existe caminho para isso aqui.
 */
export function mensagemDoErro(erro) {
  const status = Number(erro?.status ?? 0);
  if (ehFalhaDeInfraestrutura(erro)) return ERRO_REDE;
  if (status === 429) return ERRO_LIMITE;
  if (status >= 500) return ERRO_SERVIDOR;
  return ERRO_CREDENCIAL;
}

/** Rede fora, DNS, TLS, tempo esgotado: o servidor não chegou a responder. */
function ehFalhaDeInfraestrutura(erro) {
  const status = Number(erro?.status ?? 0);
  return (
    status === 0 ||
    erro?.name === "AuthRetryableFetchError" ||
    /failed to fetch|network|fetch failed/i.test(String(erro?.message ?? ""))
  );
}

/* ─── Validação da sessão contra o servidor ──────────────────────────────── */

export const SESSAO_VALIDA = "valida";
export const SESSAO_RECUSADA = "recusada";
export const SESSAO_INDETERMINADA = "indeterminada";

/**
 * Confere com o SERVIDOR se a sessão guardada no navegador vale alguma coisa.
 *
 * ─── Por que isto existe ────────────────────────────────────────────────────
 *
 * `getSession()` NÃO verifica nada: o `_isValidSession` do auth-js só confere o
 * formato do objeto, e a sessão guardada é devolvida direto enquanto
 * `expires_at` estiver no futuro. Medido: um objeto escrito à mão no
 * armazenamento, com `access_token: "forjado"` e validade no futuro, faz
 * `getSession()` devolver sessão sem tocar a rede — e um portão que decidisse
 * por ele continuaria sendo leitura de um valor que o próprio visitante
 * escreve, que é exatamente o defeito que estas stories existem para eliminar.
 *
 * `getUser()` vai ao servidor e a assinatura do token é verificada lá. Com o
 * mesmo objeto forjado ele devolve `403 invalid JWT: unable to parse or verify
 * signature`.
 *
 * ─── Três respostas, não duas ───────────────────────────────────────────────
 *
 * Recusa e indisponibilidade não podem ser a mesma coisa. Tratar rede fora como
 * recusa deslogaria quem tem sessão legítima toda vez que o Wi-Fi oscilasse;
 * tratar recusa como indisponibilidade deixaria a porta aberta. Por isso:
 *
 *   `valida`        — o servidor identificou a Conta.
 *   `recusada`      — o servidor REJEITOU o token. O armazenamento é limpo aqui
 *                     mesmo, para que a sessão forjada não sobreviva ao F5.
 *   `indeterminada` — não deu para perguntar. Quem chama decide, e a decisão
 *                     nunca é "entra": ou mantém o que já havia sido decidido,
 *                     ou fica de fora com o erro visível.
 */
export async function validarSessaoNoServidor(cliente) {
  let resposta;
  try {
    resposta = await cliente.auth.getUser();
  } catch (erro) {
    return { veredito: SESSAO_INDETERMINADA, motivo: ERRO_REDE, erro };
  }

  const { data, error } = resposta ?? {};

  if (!error && data?.user?.id) {
    return { veredito: SESSAO_VALIDA, usuario: data.user };
  }

  // Sem erro e sem usuário: o servidor respondeu que não há ninguém.
  if (error && ehFalhaDeInfraestrutura(error)) {
    return { veredito: SESSAO_INDETERMINADA, motivo: ERRO_REDE, erro: error };
  }
  const status = Number(error?.status ?? 0);
  if (status === 429 || status >= 500) {
    return {
      veredito: SESSAO_INDETERMINADA,
      motivo: status === 429 ? ERRO_LIMITE : ERRO_SERVIDOR,
      erro: error,
    };
  }

  // Token recusado. Limpar o armazenamento é parte da decisão, não faxina:
  // sem isto a sessão forjada continuaria lá para a próxima tentativa.
  try {
    await cliente.auth.signOut({ scope: "local" });
  } catch {
    // Falhar ao limpar não muda o veredito — o acesso continua negado.
  }
  return { veredito: SESSAO_RECUSADA, erro: error ?? null };
}
