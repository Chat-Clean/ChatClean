/**
 * O coração da entrada por conta nominal.
 *
 * A verdade sobre "quem está dentro" vem do Supabase, verificada no SERVIDOR, e
 * não de um valor que o navegador guarda. O portão anterior consultava uma
 * chave que o próprio navegador gravava: qualquer visitante a escrevia pelo
 * console e entrava.
 *
 * Trocar aquela chave pelo token do supabase-js não bastaria — e não bastou na
 * primeira versão deste arquivo. `getSession()` devolve o que está guardado sem
 * tocar a rede, então um objeto de sessão escrito à mão, com validade no
 * futuro, abriria o Painel do mesmo jeito. O que fecha o portão é
 * `validarSessaoNoServidor()`: nenhuma sessão vira `"autenticado"` antes de o
 * servidor confirmar a assinatura do token.
 *
 * `admin/shell` não conhece domínio algum (AD-15): este arquivo sabe de sessão
 * e de nome de exibição, e nada de Post ou de Vaga.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clienteAutenticado } from "@/data/supabase/clientes";

import {
  ERRO_REDE,
  ERRO_SEM_SESSAO,
  ERRO_SESSAO_NAO_CONFERIDA,
  mensagemDoErro,
  SESSAO_RECUSADA,
  SESSAO_VALIDA,
  validarSessaoNoServidor,
} from "./sessao";
import { ContextoDeSessao } from "./useSessao";

const PERFIL_VAZIO = { carregando: false, nome: null, erro: null };

export default function SessaoProvider({ children }) {
  // O cliente é resolvido uma vez, no inicializador de estado. Falta de `.env`
  // vira estado de erro visível — nunca uma exceção durante a renderização.
  const [inicial] = useState(() => {
    try {
      return { cliente: clienteAutenticado(), erroDeAmbiente: null };
    } catch (erro) {
      return { cliente: null, erroDeAmbiente: erro.message };
    }
  });
  const { cliente, erroDeAmbiente } = inicial;

  // `bruta` é o que o supabase-js diz ter guardado — ainda NÃO é permissão.
  // Só vira `estado: "autenticado"` depois de o servidor confirmar.
  const [bruta, setBruta] = useState({ pronta: false, sessao: null });
  const [estado, setEstado] = useState("carregando");
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(PERFIL_VAZIO);
  const [erroDeSessao, setErroDeSessao] = useState(null);

  // Tokens já confirmados pelo servidor. Sem esta memória, cada renderização
  // que reexecutasse o efeito dispararia uma chamada de rede nova.
  const jaValidados = useRef(new Set());

  /* ── Assinatura: o estado bruto segue o supabase-js ───────────────────── */
  useEffect(() => {
    if (!cliente) {
      // Sem ambiente não há sessão possível. "anonimo" e não "autenticado":
      // configuração ausente jamais pode virar porta aberta.
      setBruta({ pronta: true, sessao: null });
      return undefined;
    }

    let vivo = true;
    const aplicar = (nova) => {
      if (vivo) setBruta({ pronta: true, sessao: nova ?? null });
    };

    // Nada é feito com o cliente dentro do callback: chamar outras funções do
    // supabase-js aqui trava o cadeado interno de auth. A validação acontece no
    // efeito seguinte, fora da chamada de retorno.
    const {
      data: { subscription },
    } = cliente.auth.onAuthStateChange((_evento, nova) => aplicar(nova));

    // Rede de segurança para o caso de INITIAL_SESSION não chegar (sessão
    // corrompida no armazenamento, por exemplo). Sem isto, "carregando" seria
    // eterno e o esqueleto ficaria na tela para sempre.
    cliente.auth
      .getSession()
      .then(({ data }) => aplicar(data?.session ?? null))
      .catch(() => aplicar(null));

    return () => {
      vivo = false;
      subscription?.unsubscribe();
    };
  }, [cliente]);

  /* ── Validação no servidor: é ela que concede o acesso ────────────────── */
  const tokenBruto = bruta.sessao?.access_token ?? null;

  useEffect(() => {
    if (!bruta.pronta) return undefined;

    if (!cliente || !tokenBruto) {
      setSessao(null);
      setEstado("anonimo");
      return undefined;
    }

    // Token já confirmado antes: nenhuma chamada de rede nova.
    if (jaValidados.current.has(tokenBruto)) {
      setSessao(bruta.sessao);
      setEstado("autenticado");
      setErroDeSessao(null);
      return undefined;
    }

    let vivo = true;
    // Enquanto a confirmação corre, o portão continua fechado e o esqueleto na
    // tela. O Painel não aparece "por um instante" enquanto se decide.
    setEstado((atual) => (atual === "autenticado" ? atual : "carregando"));

    validarSessaoNoServidor(cliente)
      .then((r) => {
        if (!vivo) return;
        if (r.veredito === SESSAO_VALIDA) {
          jaValidados.current.add(tokenBruto);
          setSessao(bruta.sessao);
          setEstado("autenticado");
          setErroDeSessao(null);
          return;
        }
        if (r.veredito === SESSAO_RECUSADA) {
          // O servidor rejeitou o token. `validarSessaoNoServidor` já limpou o
          // armazenamento; aqui só resta fechar a porta.
          jaValidados.current.delete(tokenBruto);
          setSessao(null);
          setEstado("anonimo");
          setErroDeSessao(null);
          return;
        }
        // Indeterminado: não deu para perguntar ao servidor. Quem já estava
        // dentro continua dentro — uma oscilação de rede não pode deslogar
        // sessão legítima. Quem ainda não foi confirmado NÃO entra.
        setErroDeSessao(r.motivo ?? ERRO_SESSAO_NAO_CONFERIDA);
        setEstado((atual) => (atual === "autenticado" ? atual : "anonimo"));
      })
      .catch(() => {
        if (!vivo) return;
        setErroDeSessao(ERRO_SESSAO_NAO_CONFERIDA);
        setEstado((atual) => (atual === "autenticado" ? atual : "anonimo"));
      });

    return () => {
      vivo = false;
    };
    // `bruta.sessao` é derivado de `tokenBruto`; depender do objeto inteiro
    // faria o efeito rodar de novo a cada renovação silenciosa sem troca real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, bruta.pronta, tokenBruto]);

  /* ── Nome de exibição: vem de `perfis`, nunca do e-mail ───────────────── */
  const idDaConta = estado === "autenticado" ? (sessao?.user?.id ?? null) : null;

  useEffect(() => {
    if (!cliente || !idDaConta) {
      setPerfil(PERFIL_VAZIO);
      return undefined;
    }

    let vivo = true;
    setPerfil({ carregando: true, nome: null, erro: null });

    const falhar = (mensagem) => {
      if (!vivo) return;
      // Erro não é vazio, e muito menos "carregando para sempre": quem lê a
      // barra precisa distinguir "ainda não sei o nome" de "não consegui
      // buscar o nome".
      setPerfil({ carregando: false, nome: null, erro: mensagem });
    };

    cliente
      .from("perfis")
      .select("nome_exibicao")
      .eq("id", idDaConta)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          falhar("Não foi possível carregar o nome da conta.");
          return;
        }
        setPerfil({
          carregando: false,
          nome: data?.nome_exibicao ?? null,
          erro: data ? null : "Esta conta não tem perfil cadastrado.",
        });
      })
      // Sem este ramo, uma rejeição da promessa deixaria `carregando: true`
      // para sempre e o menu diria "Carregando…" eternamente.
      .catch(() => falhar("Não foi possível carregar o nome da conta."));

    return () => {
      vivo = false;
    };
  }, [cliente, idDaConta]);

  /* ── Ações ────────────────────────────────────────────────────────────── */

  const entrar = useCallback(
    async (email, senha) => {
      if (!cliente) return { ok: false, mensagem: erroDeAmbiente ?? ERRO_REDE };
      const { data, error } = await cliente.auth.signInWithPassword({
        email: String(email ?? "").trim(),
        password: String(senha ?? ""),
      });
      if (error) return { ok: false, mensagem: mensagemDoErro(error) };
      // Sem erro e sem sessão não é sucesso: reportar "entrou" deixaria o
      // formulário calado com o portão fechado.
      if (!data?.session) return { ok: false, mensagem: ERRO_SEM_SESSAO };
      return { ok: true };
    },
    [cliente, erroDeAmbiente],
  );

  const sair = useCallback(async () => {
    if (!cliente) return;
    jaValidados.current.clear();
    let error = null;
    try {
      ({ error } = await cliente.auth.signOut());
    } catch (erro) {
      error = erro;
    }
    if (error) {
      // Token já expirado ou rede fora: a sessão do servidor pode não ter sido
      // revogada, mas a local precisa sumir de qualquer forma. Sem este
      // segundo passo, "Sair" com rede ruim deixaria a pessoa dentro — e numa
      // máquina compartilhada isso é o defeito inteiro de volta.
      try {
        await cliente.auth.signOut({ scope: "local" });
      } catch {
        // Nada mais a fazer aqui; o estado local já foi derrubado abaixo.
      }
      setBruta({ pronta: true, sessao: null });
      setSessao(null);
      setEstado("anonimo");
    }
  }, [cliente]);

  const valor = useMemo(
    () => ({
      estado,
      email: sessao?.user?.email ?? null,
      perfil,
      erroDeAmbiente,
      erroDeSessao,
      entrar,
      sair,
    }),
    [estado, sessao, perfil, erroDeAmbiente, erroDeSessao, entrar, sair],
  );

  return (
    <ContextoDeSessao.Provider value={valor}>
      {children}
    </ContextoDeSessao.Provider>
  );
}
