// Testes do banco (schema + RLS + RPCs) num Postgres em memória (PGlite), sem Docker.
// Simula o mínimo do Supabase: roles anon/authenticated/service_role, auth.users e auth.uid().
// Rodar: npm run test:db  (dentro de site/)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = new URL('../migrations/', import.meta.url);
const SHIM = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now(),
    raw_user_meta_data jsonb default '{}'
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- privilégios padrão do Supabase (a migration 0002 revoga e devolve só o necessário)
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

let db;
const U = {}; // usuários: a, b, equipe

async function as(role, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const rows = async (sql, params) => (await db.query(sql, params)).rows;
async function rejects(promise, re) {
  await assert.rejects(promise, (e) => { assert.match(String(e.message), re); return true; });
}

before(async () => {
  db = new PGlite();
  await db.exec(SHIM);
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await db.exec(await readFile(new URL(f, MIGRATIONS), 'utf8'));
  // service_role: privilégios como no Supabase
  await db.exec('grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;');

  for (const k of ['a', 'b', 'equipe']) {
    const [{ id }] = await rows(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [`${k}@teste.local`, JSON.stringify({ nome: `Cliente ${k}`, aceite_politica_versao: '2026-11' })]);
    U[k] = id;
  }
  await db.exec(`insert into public.admins (user_id, papel) values ('${U.equipe}', 'admin')`);
  await db.exec(`
    insert into public.produtos (cod_red, slug, nome, categoria, preco_maximo, preco, estoque, tipo_venda, pendente) values
      (1, 'dipirona-1', 'Dipirona 500mg', 'medicamentos', 10, 8.50, 10, 'mip', false),
      (2, 'losartana-2', 'Losartana 50mg', 'genericos', 20, 15.00, 5, 'prescricao', false),
      (3, 'bloqueado-3', 'Taxa entrega', 'medicamentos', 5, 5, 99, 'mip', true),
      (4, 'sem-estoque-4', 'Vitamina C', 'suplementos', 30, 25, 0, 'mip', false),
      (5, 'oculto-5', 'Protetor', 'dermocosmeticos', 50, 40, 3, 'mip', false);
    update public.produtos set publicado = false where cod_red = 5;
    update public.produtos set destaque = true where cod_red in (1, 2);
  `);
  await as('authenticated', U.a, () => db.exec(`
    insert into public.enderecos (user_id, cep, logradouro, numero, bairro, cidade, uf)
    values ('${U.a}', '88000-000', 'Rua A', '10', 'Centro', 'Cidade', 'SC')`));
});

test('perfil é criado no cadastro com o aceite da política', async () => {
  const [p] = await rows(`select nome, aceite_politica_versao, aceite_politica_em from public.perfis where user_id = $1`, [U.a]);
  assert.equal(p.nome, 'Cliente a');
  assert.equal(p.aceite_politica_versao, '2026-11');
  assert.ok(p.aceite_politica_em);
});

test('anônimo vê só produtos visíveis, sem campos internos', async () => {
  const r = await as('anon', null, () => rows('select * from public.produtos_publicos order by cod_red'));
  assert.deepEqual(r.map((x) => Number(x.cod_red)), [1, 2]);
  assert.ok(!('motivos_bloqueio' in r[0]) && !('pendente' in r[0]));
  // RDC 96: prescrição nunca sai como destaque
  assert.equal(r.find((x) => Number(x.cod_red) === 2).destaque, false);
  assert.equal(r.find((x) => Number(x.cod_red) === 1).destaque, true);
  await rejects(as('anon', null, () => rows('select * from public.produtos')), /permission denied/);
});

test('cliente não lê a tabela crua de produtos nem altera produto', async () => {
  const r = await as('authenticated', U.a, () => rows('select * from public.produtos'));
  assert.equal(r.length, 0);
  await rejects(as('authenticated', U.a, () => db.exec(`update public.produtos set preco = 0.01`)), /permission denied/);
  await rejects(as('authenticated', U.a, () => rows(`select public.admin_atualizar_produto(1, '{"destaque":false}')`)), /sem_permissao/);
});

test('criar_pedido calcula o total no servidor e ignora o preço do navegador', async () => {
  const [{ r }] = await as('authenticated', U.a, async () => {
    const [{ id }] = await rows(`select id from public.enderecos limit 1`);
    return rows(`select public.criar_pedido($1, 'padrao', 'pix', $2) as r`,
      [JSON.stringify([{ cod_red: 1, quantidade: 2, preco: 0.01 }]), id]);
  });
  assert.equal(Number(r.subtotal), 17);
  assert.equal(Number(r.frete), 9.9);
  assert.equal(Number(r.total), 26.9);
  const [p] = await rows(`select status, total, cliente_email, endereco from public.pedidos where id = $1`, [r.id]);
  assert.equal(p.status, 'aguardando_pagamento');
  assert.equal(p.cliente_email, 'a@teste.local');
  assert.equal(p.endereco.cidade, 'Cidade');
});

test('criar_pedido recusa produto oculto, bloqueado, sem estoque ou acima do estoque', async () => {
  const call = (itens) => as('authenticated', U.a, () =>
    rows(`select public.criar_pedido($1, 'retirada', 'na_entrega')`, [JSON.stringify(itens)]));
  await rejects(call([{ cod_red: 3, quantidade: 1 }]), /produto_indisponivel/);
  await rejects(call([{ cod_red: 4, quantidade: 1 }]), /produto_indisponivel/);
  await rejects(call([{ cod_red: 5, quantidade: 1 }]), /produto_indisponivel/);
  await rejects(call([{ cod_red: 1, quantidade: 11 }]), /estoque_insuficiente/);
  await rejects(call([]), /carrinho_vazio/);
  await rejects(as('anon', null, () => rows(`select public.criar_pedido('[{"cod_red":1,"quantidade":1}]', 'retirada', 'pix')`)), /permission denied/);
});

test('item de prescrição exige declaração de receita', async () => {
  const itens = JSON.stringify([{ cod_red: 2, quantidade: 1 }]);
  await rejects(as('authenticated', U.a, () => rows(`select public.criar_pedido($1, 'retirada', 'pix')`, [itens])), /declaracao_receita_necessaria/);
  const [{ r }] = await as('authenticated', U.a, () =>
    rows(`select public.criar_pedido($1, 'retirada', 'pix', null, 1, true) as r`, [itens]));
  assert.equal(r.tem_prescricao, true);
  assert.equal(Number(r.frete), 0);
});

test('endereço de outro cliente e parcelas inválidas são recusados', async () => {
  const [{ id }] = await rows(`select id from public.enderecos where user_id = $1`, [U.a]);
  const itens = JSON.stringify([{ cod_red: 1, quantidade: 1 }]);
  await rejects(as('authenticated', U.b, () => rows(`select public.criar_pedido($1, 'padrao', 'pix', $2)`, [itens, id])), /endereco_invalido/);
  await rejects(as('authenticated', U.a, () => rows(`select public.criar_pedido($1, 'retirada', 'pix', null, 2)`, [itens])), /parcelas_invalidas/);
  await rejects(as('authenticated', U.a, () => rows(`select public.criar_pedido($1, 'retirada', 'cartao_online', null, 2)`, [itens])), /parcela_abaixo_minimo/);
});

test('cliente só vê os próprios pedidos e não altera status', async () => {
  const doA = await as('authenticated', U.a, () => rows('select id from public.pedidos'));
  const doB = await as('authenticated', U.b, () => rows('select id from public.pedidos'));
  assert.ok(doA.length >= 2);
  assert.equal(doB.length, 0);
  await rejects(as('authenticated', U.a, () => db.exec(`update public.pedidos set status = 'pago'`)), /permission denied/);
  await rejects(as('authenticated', U.a, () => rows(`select public.admin_mudar_status($1, 'pago')`, [doA[0].id])), /sem_permissao/);
  const enderecosB = await as('authenticated', U.b, () => rows('select * from public.enderecos'));
  assert.equal(enderecosB.length, 0);
});

test('equipe vê todos os pedidos e segue o fluxo de status', async () => {
  const todos = await as('authenticated', U.equipe, () => rows('select id, status from public.pedidos order by numero'));
  assert.ok(todos.length >= 2);
  const id = todos[0].id;
  await as('authenticated', U.equipe, () => rows(`select public.admin_mudar_status($1, 'pago')`, [id]));
  await rejects(as('authenticated', U.equipe, () => rows(`select public.admin_mudar_status($1, 'entregue')`, [id])), /transicao_invalida/);
  const log = await rows(`select de, para from public.pedido_status_log where pedido_id = $1 order by id`, [id]);
  assert.deepEqual(log.map((l) => l.para), ['aguardando_pagamento', 'pago']);
});

test('equipe edita só campos editoriais', async () => {
  await as('authenticated', U.equipe, () =>
    rows(`select public.admin_atualizar_produto(3, '{"liberado_manual": true, "descricao": "ok"}')`));
  const vis = await as('anon', null, () => rows('select cod_red from public.produtos_publicos where cod_red = 3'));
  assert.equal(vis.length, 1);
});

test('LGPD: exportar e excluir conta anonimiza pedidos', async () => {
  const [{ d }] = await as('authenticated', U.a, () => rows('select public.exportar_meus_dados() as d'));
  assert.equal(d.conta.email, 'a@teste.local');
  assert.ok(d.pedidos.length >= 2 && d.enderecos.length === 1);

  // pedido pago impede a exclusão
  await rejects(as('authenticated', U.a, () => rows('select public.excluir_minha_conta()')), /pedido_em_andamento/);
  await db.exec(`update public.pedidos set status = 'entregue' where user_id = '${U.a}' and status = 'pago'`);
  await as('authenticated', U.a, () => rows('select public.excluir_minha_conta()'));

  const [u] = await rows('select count(*)::int n from auth.users where id = $1', [U.a]);
  assert.equal(u.n, 0);
  const peds = await rows(`select user_id, cliente_email, endereco, anonimizado from public.pedidos where cliente_nome is null`);
  assert.ok(peds.length >= 2);
  for (const p of peds) {
    assert.equal(p.user_id, null);
    assert.equal(p.cliente_email, null);
    assert.equal(p.anonimizado, true);
    if (p.endereco) assert.deepEqual(Object.keys(p.endereco).sort(), ['cidade', 'uf']);
  }
});
