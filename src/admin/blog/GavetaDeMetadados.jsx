/**
 * A gaveta de metadados do Post — o que descreve o Post, ao lado do que ele diz.
 *
 * Sete campos: Título, Slug, Resumo, Categoria, Tags, Data de Publicação e
 * tempo de leitura. Cada um com **rótulo associado** — `<label for>` ligado ao
 * `id` do controle, e não um texto solto acima dele: sem a associação, quem
 * navega por leitor de tela ouve "caixa de edição" sete vezes seguidas e
 * precisa adivinhar qual é qual.
 *
 * ─── O que esta gaveta NÃO faz ──────────────────────────────────────────────
 *
 * Ela não grava, não conhece Supabase e não decide quando o Slug acompanha o
 * título. É um componente controlado: recebe `valores`, avisa `aoMudar`, e quem
 * monta a tela (`EditorDePost`) é que sabe se o Post está nascendo ou sendo
 * editado — que é exatamente a diferença que decide o destino do Slug.
 *
 * Também não existe campo de **Autor**: ele é resolvido no servidor desde a
 * Story 2.5, a partir da Conta autenticada. O campo digitável que existia na
 * tela de `localStorage` não se reproduz aqui, e a ausência é o requisito.
 *
 * ─── O campo que falta é INDICADO ───────────────────────────────────────────
 *
 * `faltando` é a lista de nomes de campo vazios que a gravação recusa — a mesma
 * lista que a função de servidor devolve em `erro.faltando`. Cada campo dela
 * ganha `aria-invalid`, borda de recusa e uma frase própria ligada por
 * `aria-describedby`. Uma mensagem genérica no rodapé ("preencha os campos
 * obrigatórios") obriga a pessoa a percorrer a gaveta procurando qual é.
 *
 * ─── O fuso entra AQUI, e só aqui ───────────────────────────────────────────
 *
 * A Data de Publicação é `timestamptz` no banco e instante em UTC no caminho
 * inteiro. O campo mostra e lê **hora de parede em São Paulo**, pelas funções de
 * `domain/blog/formato.js` — o único lugar do projeto que conhece o fuso. A
 * comparação de visibilidade continua em UTC, na política do banco.
 */

import { useId } from "react";
import { AlertCircle } from "lucide-react";

import { ANEL_DE_FOCO } from "@/admin/shell/foco";
import { FRASES_DE_FALTA, textoDaDataDoCampo } from "@/admin/blog/metadados";
import { cn } from "@/lib/utils";

const CLASSE_DE_CAMPO =
  "w-full rounded-controle border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-muted transition-colors";

export default function GavetaDeMetadados({
  valores,
  aoMudar,
  faltando = [],
  categorias = [],
  tags = [],
  problemaNoEndereco = null,
  desabilitado = false,
  className,
}) {
  /* Um prefixo por instância. Dois editores na mesma página (a verificação monta
     dois de propósito) não podem compartilhar `id`, senão o `for` do primeiro
     rótulo passa a apontar para o campo do segundo — e a associação, que é o
     ponto do componente, deixa de valer sem nada quebrar visivelmente. */
  const base = useId();
  const idDe = (campo) => `${base}-${campo}`;
  const idDoErro = (campo) => `${base}-${campo}-erro`;
  const idDaAjuda = (campo) => `${base}-${campo}-ajuda`;

  const falta = (campo) => faltando.includes(campo);

  /** O que todo campo da gaveta carrega, montado uma vez por campo. */
  const campo = (nome, { ajuda = false, recusa = false, extra = "" } = {}) => {
    const invalido = falta(nome) || recusa;
    return {
      id: idDe(nome),
      name: nome,
      "data-campo": nome,
      disabled: desabilitado,
      "aria-invalid": invalido ? "true" : undefined,
      "aria-describedby": invalido ? idDoErro(nome) : ajuda ? idDaAjuda(nome) : undefined,
      className: cn(
        CLASSE_DE_CAMPO,
        ANEL_DE_FOCO,
        invalido ? "border-destructive" : "border-border-soft",
        extra,
      ),
    };
  };

  const mudar = (nome) => (evento) => aoMudar?.(nome, evento.target.value);

  const enderecoRecusado = Boolean(problemaNoEndereco);

  return (
    <aside
      aria-label="Metadados do post"
      className={cn(
        "flex min-h-0 w-full flex-col gap-5 overflow-y-auto rounded-cartao",
        "border border-border-soft bg-surface p-4",
        className,
      )}
    >
      {/* ── Título ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Rotulo para={idDe("titulo")} obrigatorio>
          Título
        </Rotulo>
        <input
          type="text"
          {...campo("titulo")}
          value={valores.titulo ?? ""}
          onChange={mudar("titulo")}
          placeholder="O título do artigo"
        />
        <Recusa id={idDoErro("titulo")} visivel={falta("titulo")}>
          {FRASES_DE_FALTA.titulo}
        </Recusa>
      </div>

      {/* ── Endereço (Slug) ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Rotulo para={idDe("slug")}>Endereço no site</Rotulo>
        {/* Slug é dado, não prosa: pilha monoespaçada com numeral tabular. */}
        <input
          type="text"
          {...campo("slug", { ajuda: true, recusa: enderecoRecusado, extra: "dado" })}
          value={valores.slug ?? ""}
          onChange={mudar("slug")}
          placeholder="meu-artigo"
        />
        <Recusa id={idDoErro("slug")} visivel={falta("slug") || enderecoRecusado}>
          {falta("slug") ? FRASES_DE_FALTA.slug : problemaNoEndereco}
        </Recusa>
        <p id={idDaAjuda("slug")} className="text-xs text-ink-muted">
          Gerado do título quando o post nasce. Depois disso ele não muda sozinho
          — quem já tem o link continua chegando aqui.
        </p>
      </div>

      {/* ── Resumo ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Rotulo para={idDe("resumo")} obrigatorio>
          Resumo
        </Rotulo>
        <textarea
          rows={3}
          {...campo("resumo", { extra: "resize-y" })}
          value={valores.resumo ?? ""}
          onChange={mudar("resumo")}
          placeholder="A frase que descreve o post na listagem e na busca"
        />
        <Recusa id={idDoErro("resumo")} visivel={falta("resumo")}>
          {FRASES_DE_FALTA.resumo}
        </Recusa>
      </div>

      {/* ── Categoria ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Rotulo para={idDe("categoria_id")}>Categoria</Rotulo>
        <select
          {...campo("categoria_id")}
          value={valores.categoria_id ?? ""}
          onChange={mudar("categoria_id")}
        >
          <option value="">Sem categoria</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </select>
      </div>

      {/* ── Tags ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Rotulo para={idDe("tags")}>Tags</Rotulo>
        <select
          multiple
          size={Math.min(Math.max(tags.length, 3), 6)}
          {...campo("tags", { ajuda: true })}
          value={valores.tags ?? []}
          onChange={(evento) =>
            aoMudar?.(
              "tags",
              [...evento.target.selectedOptions].map((opcao) => opcao.value),
            )
          }
        >
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.nome}
            </option>
          ))}
        </select>
        <p id={idDaAjuda("tags")} className="text-xs text-ink-muted">
          {tags.length === 0
            ? "Nenhuma tag cadastrada ainda."
            : "Segure Ctrl (ou Command) para escolher mais de uma."}
        </p>
      </div>

      {/* ── Data de Publicação ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Rotulo para={idDe("publicado_em")}>Data de publicação</Rotulo>
        <input
          type="datetime-local"
          {...campo("publicado_em", { ajuda: true, extra: "dado" })}
          value={valores.publicado_em ?? ""}
          onChange={mudar("publicado_em")}
        />
        {/* O instante é gravado em UTC; o que se lê e o que se digita é a hora de
            Brasília. Dizer o fuso por extenso é o que impede alguém de agendar
            00h30 achando que agendou no fuso do próprio navegador. */}
        <p id={idDaAjuda("publicado_em")} className="text-xs text-ink-muted">
          Horário de Brasília{" "}
          <span className="dado" data-papel="data-em-sao-paulo">
            {textoDaDataDoCampo(valores.publicado_em)}
          </span>
        </p>
      </div>

      {/* ── Tempo de leitura ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Rotulo para={idDe("tempo_leitura")}>Tempo de leitura (minutos)</Rotulo>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          {...campo("tempo_leitura", { extra: "dado" })}
          value={valores.tempo_leitura ?? ""}
          onChange={mudar("tempo_leitura")}
          placeholder="5"
        />
      </div>
    </aside>
  );
}

/**
 * O rótulo, com a obrigatoriedade dita por extenso.
 *
 * Um asterisco vermelho é convenção de formulário, não informação: quem não
 * conhece a convenção, ou não distingue a cor, não recebe nada. A palavra
 * entre parênteses é lida pelo leitor de tela junto do nome do campo.
 */
function Rotulo({ para, obrigatorio = false, children }) {
  return (
    <label
      htmlFor={para}
      className="flex items-center gap-1.5 text-sm font-semibold text-ink"
    >
      {children}
      {obrigatorio ? (
        <span className="text-xs font-medium text-ink-muted">(obrigatório)</span>
      ) : null}
    </label>
  );
}

/**
 * A recusa de um campo.
 *
 * Fica **sempre montada** e some pelo conteúdo, não pela montagem condicional: o
 * `aria-describedby` do campo aponta para este `id`, e um alvo que não existe no
 * documento é anunciado como nada — a mensagem apareceria na tela e não no
 * leitor.
 */
function Recusa({ id, visivel, children }) {
  return (
    <p
      id={id}
      role={visivel ? "alert" : undefined}
      hidden={!visivel}
      className="flex items-start gap-1.5 text-xs font-medium text-destructive"
    >
      {visivel ? (
        <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      ) : null}
      <span>{children}</span>
    </p>
  );
}
