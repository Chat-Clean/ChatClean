# Modernização Visual — ChatClean (Identidade Verde)

**Data:** 7 de maio de 2026
**Direção visual:** identidade verde original ChatClean elevada ao padrão SaaS premium tech (referências: Linear, Stripe, Vercel, Cal.com).
**Stack:** apenas `framer-motion` (já instalado) — sem novas dependências.
**Compatibilidade SEO:** todas as palavras-chave alvo do plano foram preservadas.

---

## Conceito visual

A home volta para a identidade **verde da ChatClean** (`#009161 → #00BD42 → #00E6B8`) mas com linguagem visual de SaaS premium 2026. O resto do site (Stats, Bento, Depoimentos, FAQ) é **modo claro** com glassmorphism, glow rings e spotlights coloridos. O CTA de fechamento e o Hero usam **aurora gradient verde animado** com particles, light beams, grid técnico e mockup com tilt 3D.

Footer permanece **escuro** para criar contraste premium e fechar a página com peso visual.

## Estrutura final da home

1. **Hero verde aurora** (`ModernHero`) — gradient animado, partículas, mockup com tilt 3D, cards flutuantes, magnetic CTAs, scroll indicator.
2. **Parede de logos** dos clientes em marquee infinito.
3. **Stats animados** (`StatsSection`) — 4 KPIs grandes com counters subindo.
4. **Bento Features** (`BentoFeatures`) — grid assimétrico com spotlights coloridos.
5. **Depoimentos** modo claro com cards 3D e green glow.
6. **FAQ** modo claro com 14 perguntas (6 SEO + 8 defensivas).
7. **CTA Aurora gigante** (`ModernCTA`) — fechamento com kinetic typography.
8. **Footer dark** com endereço, CNPJ, navegação completa.

## Tecnologias visuais usadas

**Aurora gradient animado** — `aurora-bg` com `background-size: 400%` e keyframe que percorre o ângulo. 18s suaves.

**Light beams diagonais** — `aurora-beams` com pseudo-elementos animando linha branca em diagonal.

**Particles flutuantes** — componente `ParticleField` que gera 30-40 pontinhos em CSS animation, posições randomizadas.

**Tilt 3D** — componente `TiltCard` com `perspective: 1200px` e `rotateX/rotateY` baseados na posição do cursor (spring animation).

**Magnetic buttons** — botão segue o cursor com força configurável (0.18 = suave). Estilo Awwwards.

**Spotlight em cards** — radial gradient que segue o cursor com `mix-blend-screen`. Verde nos cards verdes, roxo nos roxos, etc.

**Grid técnico** — `bg-grid` com mask radial que esmaece nas bordas. Visualização inspirada Linear/Vercel.

**Glow rings** — borda animada com conic gradient rotacionando ao redor do card no hover.

**Animated counters** — números que sobem de 0 ao valor final com easeOutExpo, gatilhados via `useInView`.

**Kinetic typography** — palavras do H1 sobem em cascata com spring (stagger 0.08s).

**Pulse rings + dots** — indicadores de "live" / "ativo" com animação de pulso.

**Border gradient animado** — pseudo-elemento com conic gradient rotacionando 360° em loop, máscara CSS para mostrar só a borda.

**Wiggle icons** — ícones balançam no hover do card (rotação -12° → +12° → 0).

**Scroll progress bar** — barra fininha gradient verde→azul→roxo no topo, scaleX baseado em scrollYProgress.

**Back-to-top FAB** — aparece após 600px de scroll, smooth scroll ao clicar.

**Page transitions** — fade + slide entre rotas via `AnimatePresence`.

## Componentes novos criados nesta rodada

- `src/components/animated/ParticleField.jsx` — campo de partículas flutuantes em CSS.
- `src/components/animated/TiltCard.jsx` — wrapper com tilt 3D que segue o cursor.
- `src/components/animated/StatsSection.jsx` — banner de KPIs animados em 4 colunas.

## Componentes reescritos

- `src/components/animated/ModernHero.jsx` — agora identidade verde com aurora bg, particles, mockup com tilt 3D, badge live com texto rotativo (WhatsApp / Instagram / Facebook / Telegram), 3 cards flutuantes (Status, Conversas, IA Bot), kinetic typography, scroll indicator no rodapé.
- `src/components/animated/BentoFeatures.jsx` — modo claro com 7 cards, spotlight verde/roxo/azul que segue cursor, ícones `icon-wiggle` no hover, visuais únicos por card (pills de canais com pulse, barras de gráfico animadas, círculo girando, kanban com barras animadas).
- `src/components/animated/ModernCTA.jsx` — aurora bg verde, particles, headline gigante com gradient yellow→white→cyan, 2 magnetic CTAs, faixa de stats no rodapé (Setup / 100% PT-BR / Sem fidelidade).

## Componente atualizado

- `src/App.jsx` — modo claro completo. Header transparente sobre o hero verde com logo branco; ao rolar 60px, vira branco com blur, logo verde, nav cinza, botão verde sólido. Mobile menu com cascata de animações. Depoimentos e FAQ em modo claro. Footer dark elegante. Integração do StatsSection entre o hero e o Bento.

## CSS adicionado em `src/index.css`

- `.aurora-bg` + keyframe `aurora-shift` (background gradient animado 18s)
- `.aurora-beams` (light beams via pseudo-elements)
- `.bg-grid` e `.bg-grid-white` (grid técnico com mask radial)
- `.particle` + keyframe `particle-float`
- `.border-gradient` com conic gradient + `@property --border-angle`
- `.icon-wiggle` (animação de balanço no hover do grupo)
- `.green-glow` (sombra verde para hover)
- `.text-gradient-green` (texto com gradient verde)
- `.tabular-nums` (alinhamento de números)
- Toda animação respeita `prefers-reduced-motion`.

## Como testar localmente

```bash
cd C:\Users\fabri\www\ChatClean
pnpm install
pnpm dev
```

Abrir `http://localhost:5173/` e:

- **Hero**: ver aurora gradient verde se movendo, particles subindo, mockup com tilt 3D conforme move o cursor, cards flutuantes (Status / Conversas / IA), badge live com texto rotativo, scroll indicator pulsando.
- **Header**: começa transparente sobre o hero verde com logo branco; ao rolar 60px, transição suave de 500ms para fundo branco com blur, logo verde, botão verde sólido.
- **Stats**: contadores 100+, 50M+, 70%, 24/7 sobem ao entrar na viewport, ícones com gradient, hover lift + glow verde.
- **Bento**: 7 cards com spotlight colorido seguindo o cursor; hover wiggle no ícone; visuais animados (pills com pulse, barras crescendo, círculo girando, kanban com bars).
- **Depoimentos**: cards 3D com green glow no hover, estrelas aparecendo em cascata.
- **CTA Aurora**: gradient verde animado, particles, headline gigante com gradient yellow→white→cyan, magnetic buttons.
- **Mobile** (largura < 768px): menu acordeão com cascata, header adapta-se.
- **Acessibilidade**: ativar "Reduzir movimento" no SO — todas as animações desabilitam, conteúdo continua acessível.

## Arquivos novos desta rodada

- `src/components/animated/ParticleField.jsx`
- `src/components/animated/TiltCard.jsx`
- `src/components/animated/StatsSection.jsx`

## Arquivos modificados desta rodada

- `src/components/animated/ModernHero.jsx` (reescrito)
- `src/components/animated/BentoFeatures.jsx` (reescrito)
- `src/components/animated/ModernCTA.jsx` (reescrito)
- `src/App.jsx` (light mode, header inteligente)
- `src/index.css` (novos utilities: aurora, beams, grid, particles, border-gradient, icon-wiggle, green-glow, text-gradient-green)

## Performance esperada

Todas as animações usam apenas `transform` e `opacity` (GPU). Aurora gradient é CSS (sem JS no loop). Particles são CSS animations puras (não usa requestAnimationFrame). Tilt 3D usa spring mas só dispara durante mousemove, sem custo em idle. Bundle não cresceu — todas as dependências já estavam instaladas.

Lighthouse esperado mobile: **Performance 90+** com Core Web Vitals verdes (LCP <2.5s, INP <200ms, CLS <0.1).

## Risco / rollback

Tudo reversível via `git revert`. Nenhuma dependência adicionada. SEO da Fase 1 (`MUDANCAS_SEO.md`) preservado integralmente. Nenhum dado de produção tocado.

## Próximos passos sugeridos

1. Modernizar páginas internas (`/sobre`, `/carreiras`, `/blog`, `/api-oficial-whatsapp`) no mesmo padrão.
2. Substituir o ChatbotPopup por uma versão moderna que combine com o novo visual.
3. Cursor customizado tipo Vercel (círculo que segue + expande em elementos clicáveis).
4. Smooth scroll com Lenis (mais polido que `scroll-behavior: smooth`).
5. Lottie animations no hero (substituir o mockup estático por animação).
6. Otimizar imagens dos clientes para WebP (citado no `MUDANCAS_SEO.md`).
