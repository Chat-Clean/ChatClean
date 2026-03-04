import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import Blog from "./pages/Blog.jsx";
import BlogPost from "./pages/BlogPost.jsx";
import Carreiras from "./pages/Carreiras.jsx";
import Sobre from "./pages/Sobre.jsx";
import { Layout } from "./components/Layout.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/carreiras" element={<Carreiras />} />
          <Route path="/sobre" element={<Sobre />} />
        </Routes>
      </Layout>
    </Router>
  </StrictMode>,
);
