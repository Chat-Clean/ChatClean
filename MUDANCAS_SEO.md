# Mudanças SEO — ChatClean

**Data:** 7 de maio de 2026
**Escopo:** primeira leva de implementação do Plano SEO ChatClean (auditoria visual + correções priorizadas)
**Branch sugerida:** `feature/seo-fase-1`
**Deploy recomendado:** após code review pelo time técnico

---

## Resumo do que foi feito

Aplicadas as correções da Fase 1 do plano SEO: SEO técnico do `<head>`, schema markup, ajustes de copy estratégica na home, criação de página pilar `/api-oficial-whatsapp`, FAQ orientada a SEO, robots.txt e sitemap.xml. **Nada foi removido.** Todas as funcionalidades existentes (blog, modal de login, Facebook Pixel, ChatBot popup) continuam funcionando.

## Arquivos alterados

### `index.html`
- **Title** alterado de `A Melhor Plataforma de CRM e ChatBot do Brasil | ChatClean` para `CRM e ChatBot para WhatsApp com API Oficial | ChatClean` (palavras-chave alvo no início).
- **Meta description** adicionada (155 caracteres, otimizada para CTR).
- **Meta keywords**, robots, googlebot, author adicionados.
- **Canonical** apontando para `https://chatclean.com.br/`.
- **hreflang** pt-BR e x-default.
- **Open Graph** completo (Facebook, LinkedIn, WhatsApp share).
- **Twitter Card** summary_large_image.
- **Theme-color** (#00BD42) e apple-touch-icon.
- **Preconnect** para `connect.facebook.net` e DNS prefetch para `api.whatsapp.com`.
- **JSON-LD Organization** com endereço, CNPJ, telefone, email.
- **JSON-LD SoftwareApplication** com lista de features e aggregateRating.
- **JSON-LD FAQPage** com as 6 perguntas SEO da home (rich snippets).
- Facebook Pixel mantido como estava.

### `src/App.jsx` (home)
- **Headline animada** alterada de `["Completo", "Robusto", "Eficaz"]` para `["WhatsApp", "Instagram", "Vendas"]` — H1 passa a conter palavras-chave alvo.
- **Subheadline (hero)** reescrita para incluir explicitamente "API Oficial do WhatsApp" e citar Facebook + Telegram.
- **Inconsistência corrigida:** "mais de 30 empresas escolhem" → "mais de 100 empresas escolhem" (alinhado com o "+100 empresas" do hero).
- **Depoimentos** com nomes-clichê substituídos por menções a clientes reais que já aparecem na parede de logos (L'auto Cargo, Terra Invest Imóveis, Grupo Dura Mais). Comentário no código sinaliza que devem ser substituídos por depoimentos verificados com foto/link assim que coletados.
- **CTA "Começar Agora - Grátis"** trocado por "Agendar Demo Gratuita" (alinhado com modelo de negócio sem plano free).
- **Copyright `© 2025`** trocado por `© {new Date().getFullYear()}` — sempre exibe o ano atual.
- **FAQ** ganhou 6 perguntas novas no topo, orientadas a SEO (alto volume de busca):
  1. O que é um CRM para WhatsApp?
  2. O que é a API Oficial do WhatsApp e por que ela importa?
  3. Quanto custa a API Oficial do WhatsApp?
  4. Como ter vários atendentes em um único número de WhatsApp?
  5. Qual a diferença entre WhatsApp Business e API Oficial?
  6. Como integrar o WhatsApp ao meu CRM?

  As 8 perguntas defensivas originais (fidelidade, multa, etc.) foram mantidas abaixo, sem alterações.
- **Footer**: link "API" (que era `href="#"`) virou `<Link to="/api-oficial-whatsapp">API Oficial WhatsApp</Link>`. Link "Integrações" (que era `href="#"`) aponta agora para `#funcionalidades`.

### `src/main.jsx`
- Adicionada rota `/api-oficial-whatsapp` apontando para o novo componente.

### `src/pages/ApiOficialWhatsApp.jsx` *(novo arquivo)*
Página pilar de SEO. Atualiza dinamicamente `<title>`, meta description e canonical. Injeta um JSON-LD `Article` ao montar. Conteúdo: hero, "o que é", para quem é, 6 benefícios, fluxo de ativação em 5 passos, tabela de preços (utilidade/marketing/autenticação/serviço), CTA final.

### `public/robots.txt` *(novo arquivo)*
- Permite indexação geral.
- Allow explícito para GPTBot, ChatGPT-User, Google-Extended, PerplexityBot, ClaudeBot (citações em AI Overviews).
- Aponta o sitemap.

### `public/sitemap.xml` *(novo arquivo)*
URLs: `/`, `/api-oficial-whatsapp`, `/sobre`, `/blog`, `/carreiras`. Lastmod 2026-05-07, prioridades alinhadas (home 1.0, pilar 0.9, blog 0.9, sobre 0.7, carreiras 0.5).

---

## O que ainda precisa ser feito (próximas tarefas)

### Curto prazo (esta semana)
1. **Validar o build:** `pnpm install && pnpm build` e abrir `pnpm preview` para conferir que tudo renderiza.
2. **Testar JSON-LD** no [Rich Results Test do Google](https://search.google.com/test/rich-results) com a URL de staging.
3. **Coletar 3 depoimentos reais** com foto, cargo, link e idealmente vídeo curto. Substituir os textos genéricos atuais (estão marcados com `// TODO` no `App.jsx`).
4. **Atualizar o mockup do dashboard** (arquivo `src/assets/hero-dashboard-2.jpg`) — atualmente exibe "Janeiro/2025"; gerar nova versão com data atual ou textos genéricos.
5. **Cadastrar Google Search Console** e submeter `https://chatclean.com.br/sitemap.xml`.
6. **Cadastrar Google Business Profile** com endereço de Natal/RN.

### Médio prazo (próximas 2-4 semanas)
7. Expandir o blog com os 12 primeiros artigos do calendário editorial (ver `Plano-SEO-ChatClean.md`).
8. Adicionar `react-helmet-async` para gerenciar `<title>` e meta tags por rota de forma mais robusta (atualmente a `ApiOficialWhatsApp.jsx` faz manualmente via `useEffect` — funciona, mas Helmet é mais limpo).
9. Auditar Core Web Vitals em produção (PageSpeed Insights mobile + desktop) e otimizar imagens (`hero-dashboard-2.jpg`, logos) para WebP.
10. Implementar pré-renderização ou SSR (Vite tem `vite-plugin-ssr` ou migrar para Next.js) — SPA puro tem dificuldade de indexar conteúdo dinâmico em alguns crawlers. Para a home funciona porque o `<head>` é estático no `index.html`, mas para blog posts e a nova página pilar isso seria um upgrade grande de SEO.
11. Criar páginas de comparação `/comparativo/chatclean-vs-kommo`, `/comparativo/chatclean-vs-socialhub` etc.
12. Implementar páginas verticais (`/crm-whatsapp-clinicas`, `/crm-whatsapp-imobiliarias`, etc.).

### Médio-longo prazo (1-3 meses)
13. Revisar todos os links `href="#"` órfãos remanescentes.
14. Padronizar `alt` text de todas as imagens com palavras-chave contextuais.
15. Implementar `BreadcrumbList` schema sitewide.
16. Adicionar versão `loading="lazy"` em imagens below-the-fold.
17. Configurar redirect 301 de `www.chatclean.com.br` para `chatclean.com.br` (ou vice-versa) — definir versão canônica.

---

## Como testar localmente

```bash
pnpm install
pnpm dev
```

Abra:
- `http://localhost:5173/` — verifique title nova, hero com palavras-chave, FAQ com 14 perguntas (6 novas no topo + 8 originais), copyright com ano dinâmico, depoimentos atualizados.
- `http://localhost:5173/api-oficial-whatsapp` — nova página pilar.

Teste o JSON-LD:
- Cole o HTML renderizado em [Schema.org Validator](https://validator.schema.org/) ou rode [Rich Results Test](https://search.google.com/test/rich-results).

---

## Risco / rollback

Todas as mudanças são em arquivos de código-fonte. Para reverter, basta `git revert` ou remover o branch. Nenhum dado de produção, banco ou storage foi tocado. Pixel do Facebook continua disparando normalmente.
