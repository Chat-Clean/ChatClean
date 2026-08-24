/**
 * O Cartão de Compartilhamento — como o link do Post aparece quando alguém o
 * manda para outra pessoa (Story 3.5).
 *
 * ─── ELE NÃO DECIDE COISA NENHUMA, E É ESSE O PONTO ────────────────────────
 *
 * Tudo o que este cartão mostra — a imagem, o título e a descrição — vem de
 * `metadadosDoPost`, do domínio, campo a campo. Ele não escolhe entre o campo
 * de SEO e o campo herdado, não completa o que falta e não formata o que
 * recebeu: o texto que aparece É `titulo.valor`, o endereço da imagem É
 * `imagem.endereco`.
 *
 * O critério do épico pede que esta Prévia e o emissor de metadado do Épico 4
 * "produzam o mesmo resultado". O emissor ainda não existe, então essa
 * igualdade não pode ser observada contra ele — o que PODE ser garantido é que
 * este cartão não tem opinião. Se ele formatasse, escolhesse ou completasse
 * qualquer coisa, o emissor teria de repetir essa formatação, e é aí que os
 * dois divergiriam. `verificar:editor` compara, valor a valor, o que está
 * desenhado com o que a função devolveu para o mesmo formulário.
 *
 * ─── POR QUE ELE É "CARTÃO", E NÃO "PRÉ-VISUALIZAÇÃO" ──────────────────────
 *
 * O Painel já tem a pré-visualização do artigo, da Story 2.13: ela mostra o
 * TEXTO como o leitor verá no site. Esta mostra o CARTÃO como o link aparece
 * num aplicativo de mensagem. Duas coisas diferentes com o mesmo nome é o
 * sinônimo que a convenção do projeto proíbe — e "abre a prévia" deixaria de
 * ter uma resposta só. O nome mora em `seo.js`, e a verificação cobra que as
 * duas grafias não compartilhem palavra nenhuma.
 *
 * ─── ELE NÃO SIMULA O CORTE DE APLICATIVO NENHUM ───────────────────────────
 *
 * Cada aplicativo corta título e descrição num ponto diferente, e os pontos
 * mudam sem aviso. Um cartão que fingisse saber onde o WhatsApp corta ensinaria
 * o Autor a confiar num número inventado. O que ele faz é SINALIZAR o
 * comprimento acima do usual — com o mesmo aviso que o contador da seção já dá,
 * e não com uma segunda frase —, e desenhar o texto inteiro. Por isso não há
 * `truncate` nem `line-clamp` em lugar nenhum daqui.
 *
 * ─── A IMAGEM DEGRADA PELO CAMINHO QUE JÁ EXISTE ───────────────────────────
 *
 * O mesmo `MonogramaDaCapa` da listagem e da gaveta, com as mesmas falas de
 * `capa.js`. As regras da imagem foram decididas em três stories; repeti-las
 * aqui seria criar a quarta opinião.
 *
 * ─── E ELE NÃO GUARDA CÓPIA DO FORMULÁRIO ──────────────────────────────────
 *
 * Ele recebe o resultado já decidido — a gaveta calcula a herança UMA vez, com
 * a mesma tradução que a seção de SEO usa. Um segundo tradutor divergiria no
 * primeiro campo novo, e o cartão passaria a mostrar um Post que não é o que
 * está sendo editado. O único estado daqui é o do navegador: se a imagem
 * carregou.
 */

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

import MonogramaDaCapa from "@/admin/blog/MonogramaDaCapa";
import {
  CAPA_QUE_NAO_CARREGOU,
  alternativoDaMiniatura,
  falaDaImagemQuebrada,
  rotuloDaCapaDegradada,
} from "@/admin/blog/capa";
import {
  DEFEITO_SEM_HERANCA,
  EXPLICACAO_DO_CARTAO,
  PAPEIS_DO_CARTAO,
  ROTULOS_DE_SEO,
  TITULO_DO_CARTAO,
  avisoDeComprimento,
  falaDaAusenciaNoCartao,
  falaDaHeranca,
  recusasDoCartao,
} from "@/admin/blog/seo";
import { CAMPOS_DE_TEXTO_DE_SEO } from "@/domain/blog/compartilhamento";
import { cn } from "@/lib/utils";

/**
 * O que é de TELA em cada texto do cartão: qual parte de `metadadosDoPost`
 * responde por ele, e como cada pedaço se identifica no documento.
 *
 * Chaveada pelos campos de texto de SEO, e CONFERIDA contra a lista do domínio
 * logo abaixo — um terceiro campo de texto sem entrada aqui quebra alto em vez
 * de nascer invisível no cartão. Nada nesta tabela decide herança: ela diz
 * apenas ONDE LER a decisão de cada um.
 */
const TEXTOS_DO_CARTAO = Object.freeze({
  seo_titulo: Object.freeze({
    parte: "titulo",
    valor: PAPEIS_DO_CARTAO.valorDoTitulo,
    ausencia: PAPEIS_DO_CARTAO.ausenciaDoTitulo,
    origem: PAPEIS_DO_CARTAO.origemDoTitulo,
    aviso: PAPEIS_DO_CARTAO.avisoDoTitulo,
    /* O título do cartão é a linha forte; a descrição é a de apoio. */
    classe: "text-sm font-semibold leading-snug text-ink",
  }),
  seo_descricao: Object.freeze({
    parte: "descricao",
    valor: PAPEIS_DO_CARTAO.valorDaDescricao,
    ausencia: PAPEIS_DO_CARTAO.ausenciaDaDescricao,
    origem: PAPEIS_DO_CARTAO.origemDaDescricao,
    aviso: PAPEIS_DO_CARTAO.avisoDaDescricao,
    classe: "text-xs leading-relaxed text-ink-secondary",
  }),
});

{
  const faltando = CAMPOS_DE_TEXTO_DE_SEO.filter(
    (campo) => TEXTOS_DO_CARTAO[campo] === undefined,
  );
  const sobrando = Object.keys(TEXTOS_DO_CARTAO).filter(
    (campo) => !CAMPOS_DE_TEXTO_DE_SEO.includes(campo),
  );
  if (faltando.length > 0 || sobrando.length > 0) {
    throw new Error(
      "O Cartão de Compartilhamento precisa de uma entrada por campo de texto de SEO: " +
        `sem entrada [${faltando.join(", ")}], fora da lista [${sobrando.join(", ")}].`,
    );
  }
}

export default function CartaoDeCompartilhamento({
  /**
   * O RESULTADO INTEIRO de `herancaDoFormulario` — `{ok:true, metadados}` ou
   * `{ok:false, defeito}`.
   *
   * O objeto inteiro, e não `metadados` e `defeito` em dois adereços: com dois,
   * "nenhum dos dois chegou" vira um estado possível que ninguém tratou, e o
   * cartão nasceria em branco. Com um, os estados são exaustivos por
   * construção — e o terceiro, que é receber coisa nenhuma, tem frase própria.
   */
  heranca = null,
  /** A Categoria escolhida, só para o monograma da degradação. */
  categoria = "",
  /** O `id` do título, para o cartão poder ser nomeado por ele. */
  id,
  className,
}) {
  const metadados = heranca?.ok === true ? (heranca.metadados ?? null) : null;
  const defeito =
    metadados !== null
      ? null
      : typeof heranca?.defeito === "string" && heranca.defeito !== ""
        ? heranca.defeito
        : DEFEITO_SEM_HERANCA;
  const endereco = metadados?.imagem?.endereco ?? "";

  /* A IMAGEM QUE NÃO CARREGA. `onError` do `<img>` é o único sinal que o
     navegador dá, e ele é por ENDEREÇO: trocar a imagem precisa devolver o
     benefício da dúvida à nova, senão uma falha antiga condenaria todas as
     seguintes. É o mesmo desenho de `CampoDeImagem`, na gaveta. */
  const [quebrada, setQuebrada] = useState(false);
  useEffect(() => {
    setQuebrada(false);
  }, [endereco]);

  const nomeDaImagem = ROTULOS_DE_SEO.seo_imagem_url;
  const recusas = recusasDoCartao(metadados);

  return (
    <section
      data-papel={PAPEIS_DO_CARTAO.cartao}
      aria-labelledby={id}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex flex-col gap-1">
        <h4 id={id} className="text-sm font-semibold text-ink">
          {TITULO_DO_CARTAO}
        </h4>
        <p className="text-xs text-ink-muted">{EXPLICACAO_DO_CARTAO}</p>
      </div>

      {/* ─── O DEFEITO DE MONTAGEM, DITO AQUI DENTRO ────────────────────
          Sem o Domínio Canônico a cadeia não pode ser resolvida, e o cartão
          NÃO é desenhado: um cartão em branco esconderia o defeito, e um
          cartão montado com o que sobrou seria um cartão mentiroso. O que
          aparece é a frase do domínio, que diz que a variável de ambiente não
          foi lida — defeito de montagem, e não erro de quem escreve o Post. */}
      {defeito !== null ? (
        <p
          data-papel={PAPEIS_DO_CARTAO.defeito}
          role="alert"
          className="flex items-start gap-1.5 rounded-cartao border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{defeito}</span>
        </p>
      ) : (
        <>
          {/* ─── A MOLDURA: imagem em cima, textos embaixo ──────────────
              É a forma que todo gerador de prévia usa para o cartão grande, e
              ela é só forma: nenhuma marca, nenhum logotipo de aplicativo
              nenhum — o cartão mostra o formato, não a casa de ninguém. */}
          <div
            data-papel={PAPEIS_DO_CARTAO.moldura}
            className="flex flex-col overflow-hidden rounded-cartao border border-border-soft bg-surface-sunk"
          >
            {quebrada ? (
              <MonogramaDaCapa
                categoria={categoria}
                papel={PAPEIS_DO_CARTAO.imagemDegradada}
                rotulo={rotuloDaCapaDegradada({
                  categoria,
                  situacao: CAPA_QUE_NAO_CARREGOU,
                  nome: nomeDaImagem,
                })}
                classeDoSimbolo="size-8"
                className="aspect-[1200/630] w-full text-4xl"
              />
            ) : (
              <img
                src={endereco}
                alt={alternativoDaMiniatura(
                  metadados.imagem.alternativo,
                  nomeDaImagem,
                )}
                data-papel={PAPEIS_DO_CARTAO.imagem}
                /* Endereço de fora não recebe o referenciador: o cartão do
                   Painel entregaria a um host de terceiro o endereço do
                   Editor. Mesma regra da miniatura da gaveta. */
                referrerPolicy="no-referrer"
                onError={() => setQuebrada(true)}
                className="aspect-[1200/630] w-full object-cover"
              />
            )}

            <div className="flex flex-col gap-1 px-3 py-2">
              {CAMPOS_DE_TEXTO_DE_SEO.map((campo) => {
                const desenho = TEXTOS_DO_CARTAO[campo];
                const parte = metadados[desenho.parte];
                const valor = parte?.valor ?? null;
                /* O SINAL DE COMPRIMENTO é sobre o valor EFETIVO — o que vai
                   sair —, e não sobre o que está digitado no campo: um Resumo
                   longo herdado por uma Meta Descrição vazia sai longo do
                   mesmo jeito. A frase é a MESMA do contador da seção. */
                const aviso = avisoDeComprimento(campo, valor);
                return valor === null ? (
                  <p
                    key={campo}
                    data-papel={desenho.ausencia}
                    className="text-xs italic text-ink-muted"
                  >
                    {falaDaAusenciaNoCartao(campo)}
                  </p>
                ) : (
                  <p
                    key={campo}
                    data-papel={desenho.valor}
                    data-acima={aviso === null ? "false" : "true"}
                    /* SEM `truncate` E SEM `line-clamp`: o cartão não inventa
                       ponto de corte. Ver o cabeçalho. */
                    className={desenho.classe}
                  >
                    {valor}
                  </p>
                );
              })}
            </div>
          </div>

          {/* ─── DE ONDE VEIO CADA UM ────────────────────────────────────
              A frase é a de `falaDaHeranca`, montada a partir da `origem` que
              o domínio decidiu — a MESMA que a seção de SEO desenha embaixo de
              cada campo. Valor próprio não produz frase nenhuma: não há
              herança a contar. */}
          <div className="flex flex-col gap-1">
            {CAMPOS_DE_TEXTO_DE_SEO.map((campo) => {
              const desenho = TEXTOS_DO_CARTAO[campo];
              const parte = metadados[desenho.parte];
              const fala = falaDaHeranca(parte);
              const aviso = avisoDeComprimento(campo, parte?.valor ?? null);
              return (
                <div key={campo} className="flex flex-col gap-1">
                  {fala === null ? null : (
                    <p data-papel={desenho.origem} className="text-xs text-ink-muted">
                      {fala}
                    </p>
                  )}
                  {/* O AVISO NÃO É RECUSA: sem `role="alert"` e sem tinta
                      destrutiva. Conselho vestido de erro treina a pessoa a
                      ignorar o erro que importa. */}
                  {aviso === null ? null : (
                    <p data-papel={desenho.aviso} className="text-xs text-ink-secondary">
                      {aviso}
                    </p>
                  )}
                </div>
              );
            })}
            {falaDaHeranca(metadados.imagem) === null ? null : (
              <p
                data-papel={PAPEIS_DO_CARTAO.origemDaImagem}
                className="text-xs text-ink-muted"
              >
                {falaDaHeranca(metadados.imagem)}
              </p>
            )}
          </div>

          {/* ─── A IMAGEM QUE NÃO CARREGOU ───────────────────────────────
              A caixa acima já ocupa o lugar dela; esta frase responde outra
              pergunta — o que houve, e o que fazer. Sem ela, um endereço que
              apodreceu vira um cartão com monograma e ninguém avisado. */}
          {quebrada ? (
            <p
              data-papel={PAPEIS_DO_CARTAO.imagemQuebrada}
              role="alert"
              className="flex items-start gap-1.5 rounded-cartao border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>{falaDaImagemQuebrada(nomeDaImagem)}</span>
            </p>
          ) : null}

          {/* ─── POR QUE UM ELO NÃO FOI USADO ────────────────────────────
              `metadadosDoPost` devolve `recusadas` com campo, origem e motivo.
              Sem esta lista, o Autor veria a imagem padrão no cartão e não
              teria como saber por que o endereço que ele digitou sumiu. Não é
              `Recusa`: nada aqui impede o salvamento. */}
          {recusas.length > 0 ? (
            <ul data-papel={PAPEIS_DO_CARTAO.recusas} className="flex flex-col gap-1">
              {recusas.map((recusa) => (
                <li
                  key={recusa.campo}
                  data-recusa={recusa.campo}
                  className="text-xs text-ink-secondary"
                >
                  <span className="font-medium">{recusa.rotulo}</span>: {recusa.motivo}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
