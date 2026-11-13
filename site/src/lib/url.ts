// Monta links respeitando o BASE_PATH (ex.: site publicado em /farmacia/novo/).
const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const u = (path = '/') => `${base}${path.startsWith('/') ? path : `/${path}`}`;
export const urlProduto = (slug: string) => u(`/produto/${slug}/`);
export const urlSecao = (slug: string, pagina = 1) => u(pagina > 1 ? `/categoria/${slug}/${pagina}/` : `/categoria/${slug}/`);
