/**
 * blogStore.js — Gerenciamento de posts do blog via localStorage.
 * Inicializa com os dados estáticos de blogPosts.js na primeira visita.
 * Todas as páginas públicas (Blog, BlogPost) e a página admin leem daqui.
 */

import { blogPosts as initialPosts } from "@/data/blogPosts";

const KEY = "cc_blog_posts";

function init() {
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, JSON.stringify(initialPosts));
  }
}

export function getPosts() {
  init();
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return initialPosts;
  }
}

export function getPostBySlug(slug) {
  return getPosts().find((p) => p.slug === slug) || null;
}

export function getRelatedPosts(currentId, categoria, limit = 3) {
  return getPosts()
    .filter((p) => p.id !== currentId && p.categoria === categoria)
    .slice(0, limit);
}

/**
 * A escolha que significa "sem filtro".
 *
 * Ela NÃO é uma Categoria — cadastrá-la no banco criaria uma categoria que
 * ninguém pode usar num post —, e por isso continua escrita no código. O que
 * ela não pode ser é escrita DUAS vezes: a página comparava com um literal
 * próprio, e renomear um dos dois faria a visão padrão filtrar zero posts sem
 * que nada acusasse.
 */
export const CATEGORIA_TODOS = "Todos";

export function getPostsByCategory(categoria) {
  const all = getPosts();
  if (categoria === CATEGORIA_TODOS) return all;
  return all.filter((p) => p.categoria === categoria);
}

/** Cria ou atualiza um post. Se post.id for null/undefined, cria novo. */
export function savePost(post) {
  const posts = getPosts();
  if (!post.id) {
    const newPost = { ...post, id: Date.now() };
    posts.unshift(newPost);
  } else {
    const idx = posts.findIndex((p) => p.id === post.id);
    if (idx >= 0) posts[idx] = post;
    else posts.unshift(post);
  }
  localStorage.setItem(KEY, JSON.stringify(posts));
  return posts;
}

export function deletePost(id) {
  const posts = getPosts().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(posts));
  return posts;
}

/** Restaura os posts originais do código-fonte. */
export function resetPosts() {
  localStorage.setItem(KEY, JSON.stringify(initialPosts));
  return initialPosts;
}
