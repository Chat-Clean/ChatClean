import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "path";

/**
 * Faz as funções de `api/` rodarem no `npm run dev`.
 *
 * Sem isto, `POST /api/posts` devolve 404 em desenvolvimento — a plataforma é
 * quem executa essas funções em produção, e o Vite não sabe nada sobre elas.
 * O sintoma era pior que a causa: a camada traduzia o 404 em "configuração
 * incompleta", e quem estivesse salvando um post ia procurar defeito na
 * própria configuração do Supabase, que estava certa o tempo todo.
 *
 * O plugin traduz entre os dois mundos: lê o corpo da requisição e entrega já
 * desserializado em `req.body`, e acrescenta os atalhos `res.status()` e
 * `res.json()` que a plataforma oferece e o servidor puro do Node não tem.
 *
 * Só vale em desenvolvimento (`apply: "serve"`). Em produção quem serve
 * `api/` é a plataforma, e este código não vai para o pacote publicado.
 */
function funcoesDeApiEmDesenvolvimento() {
  return {
    name: "funcoes-de-api-em-desenvolvimento",
    apply: "serve",
    configureServer(servidor) {
      servidor.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api/")) return next();

        const rota = url.split("?")[0].replace(/^\/api\//, "").replace(/\/+$/, "");
        // Sem `..` e sem barra: a rota vira nome de arquivo, e nome de arquivo
        // vindo da rede não pode passear pelo disco.
        if (rota === "" || rota.includes("..") || rota.includes("/")) return next();

        const arquivo = path.resolve(__dirname, "api", `${rota}.js`);
        if (!fs.existsSync(arquivo)) return next();

        try {
          const bruto = await new Promise((resolver, rejeitar) => {
            const partes = [];
            req.on("data", (p) => partes.push(p));
            req.on("end", () => resolver(Buffer.concat(partes).toString("utf8")));
            req.on("error", rejeitar);
          });

          // A plataforma entrega `req.body` já desserializado quando o tipo é
          // JSON. O handler tolera texto, então o que não parseia vai cru.
          try {
            req.body = bruto === "" ? undefined : JSON.parse(bruto);
          } catch {
            req.body = bruto;
          }

          res.status = (codigo) => {
            res.statusCode = codigo;
            return res;
          };
          res.json = (corpo) => {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(corpo));
            return res;
          };

          const modulo = await servidor.ssrLoadModule(`/api/${rota}.js`);
          await modulo.default(req, res);
        } catch (erro) {
          // Falha no próprio plugin não pode virar 404 silencioso: isso
          // reproduziria exatamente o diagnóstico errado que ele veio corrigir.
          servidor.config.logger.error(
            `[api-dev] ${rota} falhou: ${erro?.stack ?? erro}`,
          );
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              ok: false,
              erro: {
                tipo: "inesperado",
                mensagem:
                  "A função de servidor falhou em desenvolvimento. O motivo está no terminal do `npm run dev`.",
              },
            }),
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /* O `.env` inteiro entra no processo do SERVIDOR de desenvolvimento, para as
     funções de `api/` poderem rodar — inclusive as variáveis com prefixo, que
     a função aceita como alternativa às dela.

     Isto não afrouxa nada do que o projeto protege: o que chega ao navegador
     continua sendo só o que tem prefixo `VITE_`, porque é o Vite quem decide
     isso ao montar o pacote, não este laço. A chave de serviço, sem prefixo,
     fica no processo do servidor e em lugar nenhum além dele.

     `process.env` já definido vence o arquivo: quem exporta a variável no
     terminal está dizendo algo mais específico que o `.env`. */
  const ambiente = loadEnv(mode, process.cwd(), "");
  for (const [chave, valor] of Object.entries(ambiente)) {
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }

  return {
    plugins: [react(), tailwindcss(), funcoesDeApiEmDesenvolvimento()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      // `true` (booleano) é o que libera qualquer host no Vite 6. A string
      // "all" é tratada como uma LISTA DE UM ITEM chamada "all", e todo
      // hostname que não fosse literalmente `all` recebia `403 Blocked request`
      // — verificado.
      allowedHosts: true,
    },
  };
});
