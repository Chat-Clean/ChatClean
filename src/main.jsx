import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router, Outlet, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Blog from "./pages/Blog.jsx";
import BlogPost from "./pages/BlogPost.jsx";
import Carreiras from "./pages/Carreiras.jsx";
import Sobre from "./pages/Sobre.jsx";
import ApiOficialWhatsApp from "./pages/ApiOficialWhatsApp.jsx";
import AnimatedRoutes from "@/components/animated/AnimatedRoutes";
import ScrollToTop from "./components/ScrollToTop.jsx";
import AdminBlog from "./pages/AdminBlog.jsx";
import PreVisualizacaoDePost from "@/admin/blog/PreVisualizacaoDePost";
import { ROTA_DA_PREVIA, ROTA_DESCONHECIDA } from "@/admin/blog/rotas";
import SessaoProvider from "./admin/shell/SessaoProvider.jsx";
import PortaoDeSessao from "./admin/shell/PortaoDeSessao.jsx";
import PoliticaPrivacidade from "./pages/PoliticaPrivacidade.jsx";
import TermosServico from "./pages/TermosServico.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Router>
      <ScrollToTop />
      <AnimatedRoutes>
        <Route path="/" element={<App />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/carreiras" element={<Carreiras />} />
        <Route path="/sobre" element={<Sobre />} />
        <Route path="/api-oficial-whatsapp" element={<ApiOficialWhatsApp />} />
        {/* O portão envolve a rota, não vive dentro da página: assim o Painel
            só é montado se a sessão existir. Decidir lá dentro reproduziria o
            defeito antigo — um estado local que a própria página respeita.

            E ele está no elemento do PAI, com as telas do Painel como rotas
            filhas. Envolver cada filha seria lembrar de envolver cada filha, e o
            dia em que alguém esquecesse seria o dia em que um Post não
            publicado ficaria legível por endereço. Aqui esquecer não é uma das
            opções: quem não passa pelo portão não recebe `Outlet` nenhum. */}
        <Route
          path="/admin"
          element={
            <SessaoProvider>
              <PortaoDeSessao>
                <Outlet />
              </PortaoDeSessao>
            </SessaoProvider>
          }
        >
          <Route index element={<AdminBlog />} />
          {/* A pré-visualização (Story 2.13): por identificador, porque
              rascunho pode não ter endereço nenhum. */}
          <Route path={ROTA_DA_PREVIA} element={<PreVisualizacaoDePost />} />
          {/* Endereço desconhecido sob o Painel cai na mesma tela de ausência.
              Sem esta filha, o pai monta, o `Outlet` fica vazio e o Autor
              recebe uma página em branco — indistinguível de "o Painel
              quebrou". */}
          <Route path={ROTA_DESCONHECIDA} element={<PreVisualizacaoDePost />} />
        </Route>
        <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
        <Route path="/termos-de-servico" element={<TermosServico />} />
      </AnimatedRoutes>
    </Router>
  </StrictMode>,
);
