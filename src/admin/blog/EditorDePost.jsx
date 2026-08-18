/**
 * A tela de edição de Post: o Editor para o corpo, a gaveta para o resto.
 *
 * É o primeiro consumidor do Editor da Story 2.4 e da função de escrita da
 * Story 2.5 — as duas existiam sem ninguém montá-las. O que esta tela
 * acrescenta é o que liga uma coisa à outra: os metadados, e o ciclo de vida do
 * endereço.
 *
 * ─── O SLUG É GERADO NA CRIAÇÃO, E DEPOIS É DO POST ─────────────────────────
 *
 * É a diferença entre um endereço e um rótulo. Enquanto o Post está nascendo, o
 * endereço acompanha o título — é conveniência, e ninguém compartilhou nada
 * ainda. Depois que o Post existe, corrigir uma palavra do título **não** pode
 * mudar o endereço: quem guardou o link continua tendo direito a chegar aqui.
 *
 * E, mesmo na criação, o acompanhamento para no instante em que o Autor digita
 * o endereço à mão: sobrescrever o que a pessoa acabou de escrever, porque ela
 * mexeu no título depois, é o mesmo desrespeito, em escala menor.
 *
 * ─── Salvar é sempre explícito ──────────────────────────────────────────────
 *
 * Não há salvamento automático, e falha ao salvar mantém o Autor aqui com o
 * conteúdo intacto — a tela nunca volta para a listagem sem que a gravação
 * tenha acontecido de verdade. A proteção contra sair com alterações pendentes
 * é da Story 2.7.
 *
 * ─── O que esta tela NÃO faz ────────────────────────────────────────────────
 *
 * Não grava direto no banco: nenhum cliente escreve, e o único caminho é
 * `data/blog/escrita.js`, que fala com a função de servidor. Não decide Estado:
 * publicar, agendar e arquivar são da Story 2.8, e a função de escrita recusa
 * `estado` de propósito até lá. E não tem campo de Autor: ele é resolvido no
 * servidor, a partir da Conta autenticada.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Save } from "lucide-react";

import Editor from "@/admin/blog/Editor";
import GavetaDeMetadados from "@/admin/blog/GavetaDeMetadados";
import {
  corpoDoPedido,
  faltandoNaGaveta,
  valoresDoPost,
  valoresVazios,
} from "@/admin/blog/metadados";
import { notificarErro, notificarSucesso } from "@/admin/shell/Notificacoes";
import { ALVO_DE_TOQUE, ANEL_DE_FOCO } from "@/admin/shell/foco";
import { ERRO_CONFLITO, salvarPost } from "@/data/blog/escrita";
import { lerPostDoPainelPorId } from "@/data/blog/posts";
import { listarCategorias, listarTags, listarTagsDoPostNoPainel } from "@/data/blog/taxonomia";
import { documentoVazio } from "@/domain/blog/schema";
import { gerarSlug, problemaNoSlug } from "@/domain/blog/slug";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function EditorDePost({ postId = null, aoSair, aoSalvar }) {
  /* O identificador VIVE em estado, e não só na propriedade: depois de o Post
     nascer, esta mesma tela passa a estar editando — e é essa transição que
     desliga a geração automática do endereço. Sem ela, salvar um Post novo e
     continuar escrevendo faria o endereço voltar a perseguir o título de um
     Post que já existe. */
  const [id, setId] = useState(postId);
  const criando = id === null || id === undefined || id === "";

  const [carregando, setCarregando] = useState(!criando);
  const [erroDeCarga, setErroDeCarga] = useState(null);

  const [valores, setValores] = useState(valoresVazios);
  const [documento, setDocumento] = useState(documentoVazio);
  const [chaveDoEditor, setChaveDoEditor] = useState("novo");

  const [categorias, setCategorias] = useState([]);
  const [tags, setTags] = useState([]);

  const [faltando, setFaltando] = useState([]);
  const [problemaNoEndereco, setProblemaNoEndereco] = useState(null);
  const [salvando, setSalvando] = useState(false);

  /* O endereço foi digitado à mão? A partir daí ele para de acompanhar o
     título, mesmo durante a criação. É `ref` e não estado porque nada na tela
     depende dele para desenhar — e uma renderização a mais por tecla, no
     caminho que a story exige abaixo de 100 ms, é o tipo de custo que se paga
     sem perceber. */
  const enderecoDigitadoAMao = useRef(false);

  /* ── Carga ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    let vivo = true;

    (async () => {
      const [c, t] = await Promise.all([listarCategorias(), listarTags()]);
      if (!vivo) return;
      if (c.ok) setCategorias(c.dados);
      if (t.ok) setTags(t.dados);
      /* Falha ao ler o vocabulário NÃO impede escrever: a gaveta abre com a
         lista vazia e o resto da tela funciona. Erro que trava o Editor inteiro
         porque a lista de tags não veio seria pior que a lista faltando. */
      if (!c.ok) {
        notificarErro(
          "Não deu para carregar as categorias",
          "Você pode escrever normalmente; escolha a categoria depois de recarregar o Painel.",
        );
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (criando) {
      setCarregando(false);
      return undefined;
    }
    let vivo = true;
    setCarregando(true);
    setErroDeCarga(null);

    (async () => {
      const [post, tagsDoPost] = await Promise.all([
        lerPostDoPainelPorId(id),
        listarTagsDoPostNoPainel(id),
      ]);
      if (!vivo) return;
      if (!post.ok) {
        setErroDeCarga(post.erro);
        setCarregando(false);
        return;
      }
      setValores(valoresDoPost(post.dados, tagsDoPost.ok ? tagsDoPost.dados : []));
      setDocumento(post.dados.conteudo ?? documentoVazio());
      // Trocar de Post é trocar de Editor: o conteúdo inicial é lido uma vez, e
      // a `key` é o mecanismo que o componente da Story 2.4 documenta.
      setChaveDoEditor(String(post.dados.id));
      /* O endereço de um Post que já existe nunca acompanha o título — e marcar
         isto aqui é a segunda trava, além de `criando`: se algum dia esta tela
         puder criar e editar no mesmo ciclo, a regra continua valendo. */
      enderecoDigitadoAMao.current = true;
      setCarregando(false);
    })();

    return () => {
      vivo = false;
    };
    // `id` só muda quando o Post nasce, e aí o efeito relê a linha gravada —
    // que é exatamente o que se quer: o que está na tela passa a ser o que
    // está no banco.
  }, [id, criando]);

  /* ── Mudanças na gaveta ──────────────────────────────────────────────── */

  const mudarCampo = useCallback(
    (campo, valor) => {
      setValores((atuais) => {
        if (campo === "slug") {
          enderecoDigitadoAMao.current = true;
          return { ...atuais, slug: valor };
        }

        if (campo !== "titulo") return { ...atuais, [campo]: valor };

        /* O ENDEREÇO ACOMPANHA O TÍTULO SÓ NA CRIAÇÃO.
           Post que já existe não vê o endereço mudar — nem publicado, nem
           rascunho. E, mesmo criando, o acompanhamento para assim que o Autor
           digita o endereço à mão. */
        if (!criando || enderecoDigitadoAMao.current) {
          return { ...atuais, titulo: valor };
        }
        const gerado = gerarSlug(valor);
        return { ...atuais, titulo: valor, slug: gerado.ok ? gerado.slug : "" };
      });

      // A marca de campo faltante some assim que a pessoa preenche: mantê-la
      // até o próximo salvamento faria a tela acusar um erro já corrigido.
      setFaltando((atuais) => atuais.filter((c) => c !== campo));
      if (campo === "slug" || campo === "titulo") setProblemaNoEndereco(null);
    },
    [criando],
  );

  const mudarDocumento = useCallback((doc) => {
    setDocumento(doc);
    setFaltando((atuais) => atuais.filter((c) => c !== "conteudo"));
  }, []);

  const avisarSobreConteudo = useCallback((aviso) => {
    if (!aviso) return;
    notificarErro(
      aviso.gravidade === "recusado"
        ? "Não conseguimos ler o conteúdo gravado"
        : "Parte do conteúdo colado foi removida",
      aviso.mensagem,
    );
  }, []);

  /* ── Salvar ──────────────────────────────────────────────────────────── */

  const salvar = useCallback(async () => {
    if (salvando) return;

    /* A conferência local não substitui a do servidor — ela evita a viagem. O
       servidor recusa do mesmo jeito, inclusive para quem chamar a API direto,
       e é a resposta DELE que a tela usa quando ela chega. */
    const faltantes = faltandoNaGaveta(valores);
    if (faltantes.length > 0) {
      setFaltando(faltantes);
      notificarErro(
        "Falta preencher um campo obrigatório",
        "O campo está marcado na gaveta ao lado. Preencha e salve de novo.",
      );
      return;
    }

    const problema = problemaNoSlug(valores.slug);
    if (problema !== null) {
      /* Endereço vazio num Post que está nascendo quase sempre é o título só
         com símbolos: a frase da geração explica melhor que a do formato. */
      const doTitulo = criando && String(valores.slug ?? "").trim() === ""
        ? gerarSlug(valores.titulo)
        : { ok: true };
      setProblemaNoEndereco(doTitulo.ok ? problema : doTitulo.motivo);
      notificarErro(
        "O endereço do post não serve",
        doTitulo.ok ? problema : doTitulo.motivo,
      );
      return;
    }

    const pedido = corpoDoPedido({ id: criando ? null : id, valores, documento });
    if (!pedido.ok) {
      setFaltando([pedido.campo]);
      notificarErro("Não deu para salvar o post", pedido.motivo);
      return;
    }

    setSalvando(true);
    const resultado = await salvarPost(pedido.corpo);
    setSalvando(false);

    if (!resultado.ok) {
      const { erro } = resultado;
      if (Array.isArray(erro.faltando) && erro.faltando.length > 0) {
        setFaltando([...erro.faltando]);
      }
      if (erro.tipo === ERRO_CONFLITO) setProblemaNoEndereco(erro.mensagem);
      notificarErro(
        "Não deu para salvar o post",
        // A frase do servidor já diz o que houve E o que fazer; repetir uma
        // genérica por cima dela seria trocar informação por ruído.
        erro.mensagem,
      );
      return;
    }

    setFaltando([]);
    setProblemaNoEndereco(null);
    notificarSucesso(
      resultado.dados?.criado ? "Post criado" : "Post salvo",
      valores.titulo,
    );

    const gravado = resultado.dados?.post ?? null;
    if (gravado?.id && criando) {
      // O Post nasceu: a tela passa a estar editando, e o endereço para de
      // acompanhar o título a partir deste instante.
      enderecoDigitadoAMao.current = true;
      setId(gravado.id);
    } else if (gravado) {
      setValores((atuais) => ({
        ...atuais,
        // O endereço volta do servidor porque ele pode ter sido aposentado e
        // trocado lá: mostrar o que a tela tinha seria mostrar o passado.
        slug: typeof gravado.slug === "string" ? gravado.slug : atuais.slug,
      }));
    }

    aoSalvar?.(gravado);
  }, [salvando, valores, documento, criando, id, aoSalvar]);

  /* ── Desenho ─────────────────────────────────────────────────────────── */

  if (erroDeCarga) {
    return (
      <Moldura aoSair={aoSair} titulo="Editar post" subtitulo={null}>
        <div
          role="alert"
          className="m-6 max-w-2xl rounded-cartao border border-destructive/40 bg-destructive/10 p-6"
        >
          <h3 className="text-base font-semibold text-ink">
            Não conseguimos abrir este post
          </h3>
          <p className="mt-2 text-sm text-ink-secondary">{erroDeCarga.mensagem}</p>
          <p className="mt-2 text-sm text-ink-muted">
            Os posts que ainda vivem no armazenamento do navegador só passam a
            existir no servidor na Story 2.15. Use “Novo Post” para escrever um
            que já nasça gravado.
          </p>
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura
      aoSair={aoSair}
      titulo={criando ? "Novo post" : "Editar post"}
      subtitulo={
        criando ? (
          "Criando um artigo novo"
        ) : (
          <>
            Editando: <span className="dado">{valores.slug}</span>
          </>
        )
      }
      acao={
        <Button
          type="button"
          onClick={salvar}
          disabled={salvando || carregando}
          className={cn(ANEL_DE_FOCO, "gap-2")}
        >
          {salvando ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" className="size-4" />
          )}
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      }
    >
      {carregando ? (
        <div className="flex flex-1 gap-4 p-4" aria-hidden="true">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <Skeleton className="h-64 w-[340px] shrink-0" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row">
          {/* A medida do texto é travada pela própria classe `.artigo`; a coluna
              centraliza e a gaveta ao lado não a estica. */}
          <Editor
            key={chaveDoEditor}
            documento={documento}
            aoMudar={mudarDocumento}
            aoAvisar={avisarSobreConteudo}
            className="min-h-0 flex-1"
          />
          <GavetaDeMetadados
            valores={valores}
            aoMudar={mudarCampo}
            faltando={faltando}
            categorias={categorias}
            tags={tags}
            problemaNoEndereco={problemaNoEndereco}
            desabilitado={salvando}
            className="w-full shrink-0 lg:w-[340px]"
          />
        </div>
      )}
    </Moldura>
  );
}

/** A casca da tela: voltar, título e a ação da direita. */
function Moldura({ aoSair, titulo, subtitulo, acao = null, children }) {
  return (
    <div className="painel flex h-screen flex-col bg-surface-sunk text-ink">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Voltar para a listagem"
            onClick={() => aoSair?.()}
            className={cn(ALVO_DE_TOQUE, ANEL_DE_FOCO)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink">{titulo}</h2>
            {subtitulo ? (
              <p className="truncate text-xs text-ink-muted">{subtitulo}</p>
            ) : null}
          </div>
        </div>
        {acao}
      </div>
      {children}
    </div>
  );
}
