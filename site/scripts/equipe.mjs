// Dá, muda ou tira o acesso de alguém ao painel da equipe (tabela public.admins).
// A pessoa precisa já ter criado a conta no site (Entrar → Criar conta).
// Uso (na raiz do projeto):
//   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-equipe.ps1 -Email pessoa@exemplo.com            # admin
//   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-equipe.ps1 -Email pessoa@exemplo.com -Papel atendente
//   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-equipe.ps1 -Email pessoa@exemplo.com -Remover
//   powershell -ExecutionPolicy Bypass -File .\site\scripts\run-equipe.ps1 -Listar
import pg from 'pg';
import { readFileSync } from 'node:fs';

const { SUPABASE_DB_URL, SUPABASE_DB_CA, EQUIPE_EMAIL, EQUIPE_PAPEL = 'admin', EQUIPE_ACAO = 'dar' } = process.env;
if (!SUPABASE_DB_URL) { console.error('[equipe] Defina SUPABASE_DB_URL (use o run-equipe.ps1).'); process.exit(1); }
if (!['admin', 'atendente'].includes(EQUIPE_PAPEL)) { console.error('[equipe] Papel deve ser admin ou atendente.'); process.exit(1); }

const db = new pg.Client({
  connectionString: SUPABASE_DB_URL,
  ssl: SUPABASE_DB_CA ? { ca: readFileSync(SUPABASE_DB_CA, 'utf8'), rejectUnauthorized: true } : { rejectUnauthorized: false },
});
await db.connect();
try {
  if (EQUIPE_ACAO === 'listar') {
    const r = await db.query(`select u.email, a.papel, a.criado_em from public.admins a join auth.users u on u.id = a.user_id order by a.criado_em`);
    if (!r.rows.length) console.log('[equipe] Ninguém tem acesso ao painel ainda.');
    for (const x of r.rows) console.log(`  ${x.papel.padEnd(9)} ${x.email}`);
  } else {
    if (!EQUIPE_EMAIL) { console.error('[equipe] Informe o e-mail.'); process.exitCode = 1; }
    else {
      const u = await db.query('select id from auth.users where lower(email) = lower($1)', [EQUIPE_EMAIL.trim()]);
      if (!u.rows.length) {
        console.error(`[equipe] Não há conta com o e-mail ${EQUIPE_EMAIL}. A pessoa precisa criar a conta no site primeiro.`);
        process.exitCode = 1;
      } else if (EQUIPE_ACAO === 'remover') {
        const r = await db.query('delete from public.admins where user_id = $1', [u.rows[0].id]);
        console.log(r.rowCount ? `[equipe] Acesso removido: ${EQUIPE_EMAIL}` : `[equipe] ${EQUIPE_EMAIL} não tinha acesso.`);
      } else {
        await db.query(`insert into public.admins (user_id, papel) values ($1, $2)
                        on conflict (user_id) do update set papel = excluded.papel`, [u.rows[0].id, EQUIPE_PAPEL]);
        console.log(`[equipe] ${EQUIPE_EMAIL} agora é ${EQUIPE_PAPEL} do painel.`);
      }
    }
  }
} finally {
  await db.end();
}
