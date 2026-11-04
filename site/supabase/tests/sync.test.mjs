// Testes do sync ERP -> Supabase: regras de transformação + gravação incremental (PGlite).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { linhaParaProduto, carregarFiltros, slugify, calcularPreco } from '../../scripts/lib/produtos-erp.mjs';
import { aplicarCompleto, aplicarEstoque } from '../../scripts/lib/gravar-supabase.mjs';

const F = carregarFiltros();
const erp = (over = {}) => ({
  cod_red: 100, nome: 'DIPIRONA 500MG 10CP', nome_comp: null, cod_grupo: 4000,
  vlr_venda: '10.00', prc_desconto: '10', dcb: 'DIPIRONA', laboratorio: 'EMS', quantidade: '7',
  prescricao: null, ean: null, ...over,
});

test('regras portadas: preço, categoria, perfumaria, slug, bloqueio', () => {
  assert.deepEqual(calcularPreco(10, 10), { precoMaximo: 10, preco: 9 });
  assert.deepEqual(calcularPreco(10, 0.25), { precoMaximo: 10, preco: 7.5 });
  const p = linhaParaProduto(erp(), F);
  assert.equal(p.categoria, 'genericos');
  assert.equal(p.tipo_venda, 'prescricao'); // padrão seguro para medicamento sem dado de tarja
  assert.equal(p.slug, 'dipirona-500mg-10cp-100');
  assert.equal(p.pendente, false);
  const perf = linhaParaProduto(erp({ cod_grupo: 8000, nome: 'X', nome_comp: 'Perfume Água Fresca' }), F);
  assert.equal(perf.nome, 'Perfume Água Fresca');
  assert.equal(perf.tipo_venda, 'mip');
  assert.equal(slugify('Água Oxigenada 10 vol.', 5), 'agua-oxigenada-10-vol-5');
  const bloq = linhaParaProduto(erp({ nome: 'TAXA DE ENTREGA', vlr_venda: 0 }), F);
  assert.equal(bloq.pendente, true);
  assert.ok(bloq.motivos_bloqueio.some((m) => m.startsWith('palavra:')));
  assert.equal(linhaParaProduto(erp({ prescricao: false }), F).tipo_venda, 'mip');
  assert.equal(linhaParaProduto(erp({ ean: '789-1234' }), F).ean, '7891234');
});

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text,
    created_at timestamptz default now(), raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(f, dir), 'utf8'));
  }
});

test('sync completo: insere, depois não muda nada, depois só o que mudou', async () => {
  const lote = [erp(), erp({ cod_red: 101, nome: 'PROTETOR SOLAR', cod_grupo: 8000, quantidade: 3 }), erp({ cod_red: 102, quantidade: 0 })]
    .map((r) => linhaParaProduto(r, F));
  let r = await aplicarCompleto(db, lote);
  assert.equal(r.novos, 3);
  assert.equal(r.alterados, 0);
  assert.equal(r.visibilidadeMudou, 2); // 102 entrou sem estoque

  r = await aplicarCompleto(db, lote);
  assert.deepEqual([r.novos, r.alterados, r.zerados], [0, 0, 0]);

  // edição do admin não pode ser sobrescrita
  await db.exec(`update public.produtos set descricao = 'texto do admin', destaque = true, publicado = false where cod_red = 101`);
  const lote2 = lote.map((p) => (p.cod_red === 100 ? { ...p, preco: 8.5 } : p));
  r = await aplicarCompleto(db, lote2);
  assert.deepEqual([r.novos, r.alterados], [0, 1]);
  const [p101] = (await db.query(`select descricao, destaque, publicado from public.produtos where cod_red = 101`)).rows;
  assert.deepEqual(p101, { descricao: 'texto do admin', destaque: true, publicado: false });
});

test('sync completo zera estoque de quem saiu do ERP', async () => {
  const so100 = [linhaParaProduto(erp({ vlr_venda: '10.00', prc_desconto: '15' }), F)];
  const r = await aplicarCompleto(db, so100);
  assert.equal(r.zerados, 1); // 101 tinha estoque 3; 102 já era 0
  const [p] = (await db.query(`select estoque from public.produtos where cod_red = 101`)).rows;
  assert.equal(p.estoque, 0);
});

test('sync de estoque: só atualiza quem mudou e não cria produtos', async () => {
  let r = await aplicarEstoque(db, [{ cod_red: 100, estoque: 7 }, { cod_red: 101, estoque: 0 }, { cod_red: 999, estoque: 5 }]);
  assert.equal(r.alterados, 0);
  r = await aplicarEstoque(db, [{ cod_red: 100, estoque: 0 }, { cod_red: 101, estoque: 4 }]);
  assert.equal(r.alterados, 2);
  assert.equal(r.visibilidadeMudou, 2);
  const n = (await db.query(`select count(*)::int n from public.produtos where cod_red = 999`)).rows[0].n;
  assert.equal(n, 0);
});
