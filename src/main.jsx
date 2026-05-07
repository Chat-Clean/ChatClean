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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Router>
      <AnimatedRoutes>
        <Route path="/" element={<App />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/carreiras" element={<Carreiras />} />
        <Route path="/sobre" element={<Sobre />} />
        <Route path="/api-oficial-whatsapp" element={<ApiOficialWhatsApp />} />
      </AnimatedRoutes>
    </Router>
  </StrictMode>,
);
