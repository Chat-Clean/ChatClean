import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router, Route } from "react-router-dom";
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
        <Route path="/admin" element={<AdminBlog />} />
        <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
        <Route path="/termos-de-servico" element={<TermosServico />} />
      </AnimatedRoutes>
    </Router>
  </StrictMode>,
);
