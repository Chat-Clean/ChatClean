# ChatClean - Site Modificado

Site da ChatClean com modificações personalizadas incluindo links do WhatsApp, parede de logos animada e seção FAQ.

## 🚀 Modificações Realizadas

### ✅ Links do WhatsApp

- Todos os botões de "Demonstração Gratuita", "Começar Agora" e "Falar com Especialista" redirecionam para:
- **WhatsApp:** https://api.whatsapp.com/send?phone=5584996950105&text=Achei+seu+n%C3%BAmero+no+Google%21

### ✅ Parede de Logos Animada

- 5 logos fictícias criadas (TechCorp, Innovate Solutions, GlobalTech Industries, Nexus Digital, Quantum Systems)
- Animação infinita da direita para esquerda sem espaços vazios
- Texto profissional: "PARCEIROS DE SUCESSO" + "Líderes de mercado que escolheram a excelência"

### ✅ Seção FAQ

- 8 perguntas frequentes baseadas no site atual chatclean.com.br
- Interface com acordeão expansível
- Design consistente com o resto do site

### ✅ Rodapé Atualizado

- Link de "Contato" no rodapé direciona para o WhatsApp

## 📋 Pré-requisitos

- Node.js (versão 18 ou superior)
- npm ou yarn

## 🛠️ Como Rodar o Projeto

### 1. Extrair o Projeto

```bash
# Extraia o arquivo ZIP para uma pasta de sua escolha
unzip chatclean-site-modificado.zip
cd chatclean-modified
```

### 2. Instalar Dependências

```bash
# Instalar dependências (usar --legacy-peer-deps devido a conflitos de versão)
npm install --legacy-peer-deps
```

### 3. Rodar em Desenvolvimento

```bash
# Iniciar servidor de desenvolvimento
npm run dev
```

O site estará disponível em: **http://localhost:5173**

### 4. Build para Produção

```bash
# Gerar build otimizado
npm run build

# Visualizar build localmente
npm run preview
```

## 🎨 Tecnologias Utilizadas

- **React** - Framework JavaScript
- **Vite** - Build tool e dev server
- **Tailwind CSS** - Framework CSS
- **Shadcn/ui** - Componentes UI
- **Lucide React** - Ícones

## 📁 Estrutura do Projeto

```
chatclean-modified/
├── src/
│   ├── components/ui/     # Componentes UI (shadcn)
│   ├── assets/           # Imagens e logos
│   ├── App.jsx          # Componente principal
│   ├── App.css          # Estilos personalizados (inclui animação das logos)
│   └── main.jsx         # Entry point
├── public/              # Arquivos estáticos
├── package.json         # Dependências
└── README.md           # Este arquivo
```

## 🔧 Comandos Disponíveis

```bash
npm run dev      # Servidor de desenvolvimento
npm run build    # Build para produção
npm run preview  # Visualizar build
npm run lint     # Verificar código
```

## 📱 Funcionalidades Testadas

- ✅ Links do WhatsApp funcionando
- ✅ Animação das logos infinita
- ✅ FAQ expansível
- ✅ Design responsivo
- ✅ Navegação entre seções

## 🐛 Solução de Problemas

### Erro de Dependências

Se encontrar erros de dependências, use:

```bash
npm install --legacy-peer-deps --force
```

### Porta em Uso

Se a porta 5173 estiver ocupada, o Vite automaticamente usará a próxima disponível (5174, 5175, etc.)

### Problemas de Permissão

No Linux/Mac, pode ser necessário dar permissão:

```bash
chmod +x node_modules/.bin/vite
```

## 📞 Contato

Para dúvidas sobre as modificações ou suporte técnico, entre em contato através do WhatsApp configurado no site.

---

**Desenvolvido com ❤️ para ChatClean**
