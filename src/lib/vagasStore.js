/**
 * vagasStore.js — Gerenciamento de vagas de emprego via localStorage.
 * Inicializa com as vagas padrão na primeira visita.
 * Carreiras.jsx (pública) e AdminBlog.jsx (admin) leem daqui.
 */

const INITIAL_VAGAS = [
  {
    id: "vaga-1",
    titulo: "Desenvolvedor Full Stack",
    departamento: "Tecnologia",
    localizacao: "Remoto",
    tipo: "CLT",
    nivel: "Pleno",
    descricao:
      "Desenvolver e manter aplicações web usando React, Node.js e banco de dados relacionais.",
    accent: "from-blue-500 to-cyan-600",
    bg: "bg-blue-50",
    ativa: true,
  },
  {
    id: "vaga-2",
    titulo: "Especialista em Customer Success",
    departamento: "Atendimento",
    localizacao: "São Paulo, SP",
    tipo: "CLT",
    nivel: "Sênior",
    descricao:
      "Garantir o sucesso dos clientes, implementação e treinamento da plataforma ChatClean.",
    accent: "from-emerald-500 to-green-600",
    bg: "bg-emerald-50",
    ativa: true,
  },
  {
    id: "vaga-3",
    titulo: "Analista de Marketing Digital",
    departamento: "Marketing",
    localizacao: "Híbrido",
    tipo: "CLT",
    nivel: "Júnior",
    descricao:
      "Criar e executar estratégias de marketing digital, gerenciar campanhas e analisar métricas.",
    accent: "from-purple-500 to-fuchsia-600",
    bg: "bg-purple-50",
    ativa: true,
  },
];

const KEY = "cc_vagas";

function init() {
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, JSON.stringify(INITIAL_VAGAS));
  }
}

export function getVagas() {
  init();
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return INITIAL_VAGAS;
  }
}

/** Cria ou atualiza uma vaga. Se vaga.id for null/undefined, cria nova. */
export function saveVaga(vaga) {
  const vagas = getVagas();
  if (!vaga.id) {
    const newVaga = { ...vaga, id: `vaga-${Date.now()}` };
    vagas.unshift(newVaga);
  } else {
    const idx = vagas.findIndex((v) => v.id === vaga.id);
    if (idx >= 0) vagas[idx] = vaga;
    else vagas.unshift(vaga);
  }
  localStorage.setItem(KEY, JSON.stringify(vagas));
  return vagas;
}

export function deleteVaga(id) {
  const vagas = getVagas().filter((v) => v.id !== id);
  localStorage.setItem(KEY, JSON.stringify(vagas));
  return vagas;
}

/** Restaura as vagas originais. */
export function resetVagas() {
  localStorage.setItem(KEY, JSON.stringify(INITIAL_VAGAS));
  return [...INITIAL_VAGAS];
}
