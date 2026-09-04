/**
 * Leitura dos arquivos `.env` SEM expansão de variável.
 *
 * ═══ O DEFEITO QUE ISTO CONSERTA ═════════════════════════════════════════
 *
 * `loadEnv` do Vite passa cada valor por `dotenv-expand`, que trata `$NOME`
 * como referência a outra variável. A chave da API do Asaas começa com `$`:
 *
 *     ASAAS_CHAVE_DE_API=$aact_hmlg_000MzkwODA2MWY2OG…
 *
 * `dotenv-expand` lê isso como "o valor da variável `aact_hmlg_000Mzkw…`",
 * não acha variável nenhuma com esse nome, e entrega **string vazia**. Em
 * desenvolvimento, `POST /api/assinar` respondia 500 com "a contratação está
 * indisponível" e o `.env` estava certo o tempo todo.
 *
 * O modo silencioso é o que torna isto perigoso: nada avisa que houve
 * expansão. O valor simplesmente some, e a configuração parece incompleta.
 *
 * Em produção não acontece, porque lá a variável vem da plataforma e nunca
 * passa por um arquivo `.env`. Ou seja: só quebra na máquina de quem
 * desenvolve, que é o lugar onde ninguém procura por defeito de configuração.
 *
 * ═══ POR QUE UM LEITOR PRÓPRIO, E NÃO UM ESCAPE NO ARQUIVO ═══════════════
 *
 * Escapar (`\$aact_…`) conserta o sintoma e transfere a armadilha para a
 * próxima pessoa que colar uma chave nova sem saber da regra. Um leitor que
 * simplesmente NÃO expande não tem esse jeito de errar: o valor do arquivo é o
 * valor, sempre.
 *
 * Só o processo do servidor usa este leitor. O que chega ao navegador continua
 * decidido pelo Vite, e continua sendo apenas o que tem prefixo `VITE_`.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * A ordem de precedência do Vite: o de baixo vence o de cima.
 *
 * `.env.local` fora do modo de teste é a convenção do próprio Vite; aqui o
 * modo de teste não existe, então a lista é direta.
 */
export function arquivosDeAmbiente(modo) {
  return [".env", ".env.local", `.env.${modo}`, `.env.${modo}.local`];
}

/**
 * Interpreta um arquivo `.env` literalmente.
 *
 * Aceita `export NOME=valor`, comentário de linha inteira, aspas simples e
 * duplas em volta do valor, e comentário depois de valor SEM aspas. Não
 * interpreta `$`, nem `${…}`, nem barra invertida: o valor é o texto.
 */
export function interpretarEnv(texto) {
  const valores = {};

  for (const linhaBruta of String(texto ?? "").split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (linha === "" || linha.startsWith("#")) continue;

    const semExport = linha.startsWith("export ") ? linha.slice(7).trim() : linha;
    const igual = semExport.indexOf("=");
    if (igual <= 0) continue;

    const nome = semExport.slice(0, igual).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome)) continue;

    let valor = semExport.slice(igual + 1).trim();

    const aspa = valor[0];
    if ((aspa === '"' || aspa === "'") && valor.endsWith(aspa) && valor.length >= 2) {
      // Entre aspas, o valor vai inteiro: `#` ali dentro é conteúdo.
      valor = valor.slice(1, -1);
    } else {
      // Sem aspas, um `#` precedido de espaço abre comentário. Sem o espaço
      // ele é conteúdo, porque senhas e tokens contêm `#` com frequência.
      const comentario = valor.search(/\s#/);
      if (comentario !== -1) valor = valor.slice(0, comentario).trim();
    }

    valores[nome] = valor;
  }

  return valores;
}

/**
 * Os arquivos de ambiente da raiz, na ordem de precedência, já interpretados.
 *
 * Devolve um objeto só. Arquivo ausente é ausente, não erro: quase todo
 * ambiente tem apenas um dos quatro.
 */
export function lerAmbienteDoDisco(raiz, modo = "development") {
  const valores = {};
  for (const nome of arquivosDeAmbiente(modo)) {
    const caminho = path.join(raiz, nome);
    if (!existsSync(caminho)) continue;
    Object.assign(valores, interpretarEnv(readFileSync(caminho, "utf8")));
  }
  return valores;
}

/**
 * Põe no `process.env` o que ainda não estiver lá.
 *
 * Variável já exportada no terminal VENCE o arquivo: quem a exportou está
 * dizendo algo mais específico. Devolve os nomes que entraram, para quem
 * quiser conferir.
 */
export function aplicarNoProcesso(valores, processo = process) {
  const aplicados = [];
  for (const [nome, valor] of Object.entries(valores)) {
    if (processo.env[nome] === undefined) {
      processo.env[nome] = valor;
      aplicados.push(nome);
    }
  }
  return aplicados;
}
