/**
 * A seção de Notícias em vídeo do blog: o carrossel que vem antes dos Posts.
 *
 * ─── ELA LÊ SOZINHA, E NÃO ENTRA NO PEDIDO DOS POSTS ────────────────────────
 *
 * A listagem de Posts tem um pedido só e um efeito só, e a situação da página
 * é derivada dele. Os vídeos são outra tabela e outra leitura: juntá-los ali
 * faria uma falha de vídeo virar falha de blog. A leitura é uma vez, na
 * montagem, pelo cliente anônimo, como toda leitura pública.
 *
 * ─── ELA NUNCA GRITA MAIS ALTO QUE O BLOG ───────────────────────────────────
 *
 * Sem vídeo publicado, com a leitura falhando, ou com filtro em curso, a seção
 * não desenha NADA: nem esqueleto, nem aviso. Um esqueleto que some para dar
 * lugar a nada empurraria os Posts para baixo e depois para cima; e um alerta
 * sobre vídeos no topo de um blog que carregou os artigos seria a parte
 * falando mais alto que o todo. A regra mora em `mostraASecaoDeNoticias`.
 *
 * ─── E NÃO SE MISTURA COM OS POSTS ──────────────────────────────────────────
 *
 * O carrossel mostra só os mais recentes. O resto fica na listagem própria
 * (`/noticias`), a um clique, e nenhum vídeo entra na grade de artigos.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { listarNoticiasPublicas } from "@/data/blog/noticias";
import CarrosselDeCartoes from "./CarrosselDeCartoes";
import { CartaoDeNoticiaEmDestaque } from "./CartaoDeNoticia";
import {
  ENDERECO_DAS_NOTICIAS,
  ROTULO_DE_VER_TODAS,
  TAMANHO_DO_CARROSSEL,
  TITULO_DA_SECAO,
  mostraASecaoDeNoticias,
} from "./noticiasPublico";

const ROTULOS_DO_CARROSSEL = Object.freeze({
  anterior: "Vídeo anterior",
  proximo: "Próximo vídeo",
  irPara: (posicao, total) => `Ir para o vídeo ${posicao} de ${total}`,
});

const ACOES_DO_CARROSSEL = Object.freeze({
  anterior: "noticia-anterior",
  proximo: "proxima-noticia",
});

export default function SecaoDeNoticias({ filtrando = false }) {
  const [noticias, setNoticias] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      let resultado;
      try {
        resultado = await listarNoticiasPublicas({ limite: TAMANHO_DO_CARROSSEL });
      } catch {
        resultado = { ok: false };
      }
      if (!vivo) return;
      /* Falha é ausência, AQUI: ver o cabeçalho. Quem quer saber da falha abre
         a listagem, que a diz. */
      setNoticias(resultado?.ok ? resultado.dados : []);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!mostraASecaoDeNoticias({ noticias, filtrando })) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
      aria-label={TITULO_DA_SECAO}
      data-papel="noticias-em-video"
      className="mb-12 md:mb-16"
    >
      <CarrosselDeCartoes
        itens={noticias}
        titulo={TITULO_DA_SECAO}
        rotulos={ROTULOS_DO_CARROSSEL}
        acoes={ACOES_DO_CARROSSEL}
        papelDoTrilho="trilho-das-noticias"
        renderizar={(noticia) => <CartaoDeNoticiaEmDestaque noticia={noticia} />}
        complemento={
          <Link
            to={ENDERECO_DAS_NOTICIAS}
            data-acao="ver-todas-as-noticias"
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold text-emerald-700 transition-all hover:gap-2.5 hover:text-emerald-900"
          >
            {ROTULO_DE_VER_TODAS}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        }
      />
    </motion.section>
  );
}
