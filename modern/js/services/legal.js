// LGPD: versão dos documentos legais e aviso de armazenamento local
// Ao alterar privacidade.html ou termos.html de forma relevante, atualize POLICY_VERSION
// (o cadastro grava essa versão em usuarios/{uid}.consentimento.versao).
export const POLICY_VERSION = '2026-10-23';

const NOTICE_KEY = 'lgpd_storage_notice_v1';

// Aviso curto no primeiro acesso: o site guarda carrinho, cache e eventos de uso no navegador.
// Não é banner de cookies de rastreamento (o site não usa).
export function showStorageNoticeOnce() {
  try {
    if (localStorage.getItem(NOTICE_KEY)) return;
  } catch { return; }
  if (document.getElementById('storage-notice')) return;

  const bar = document.createElement('div');
  bar.id = 'storage-notice';
  bar.className = 'storage-notice';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Aviso sobre armazenamento local');
  bar.innerHTML = `
    <p class="storage-notice__text">
      <i class="fas fa-database" aria-hidden="true"></i>
      Este site guarda no seu navegador o carrinho, dados de cache e registros de uso para funcionar melhor.
      Não usamos cookies de rastreamento nem de publicidade.
      <a href="privacidade.html#armazenamento-local">Saiba mais</a>
    </p>
    <button type="button" class="btn btn--primary storage-notice__btn">Entendi</button>`;
  bar.querySelector('button').addEventListener('click', () => {
    try { localStorage.setItem(NOTICE_KEY, new Date().toISOString()); } catch {}
    bar.remove();
  });
  document.body.appendChild(bar);
}
