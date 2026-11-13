// Grava os produtos vindos do ERP no Postgres do Supabase, mexendo só no que mudou.
// `db` é qualquer cliente com query(sql, params) -> { rows } (pg.Client ou PGlite nos testes).
// Campos editoriais (publicado, liberado_manual, descricao, destaque, fotos, tipo_venda_manual) nunca são tocados.

const COLS_ERP = ['slug', 'nome', 'dcb', 'laboratorio', 'ean', 'categoria', 'cod_grupo',
  'preco_maximo', 'preco', 'estoque', 'tipo_venda', 'pendente', 'motivos_bloqueio'];

const RECORDSET = `cod_red bigint, slug text, nome text, dcb text, laboratorio text, ean text, categoria text,
  cod_grupo integer, preco_maximo numeric, preco numeric, estoque integer, tipo_venda text,
  pendente boolean, motivos_bloqueio text[]`;

/**
 * Sync completo: insere novos, atualiza alterados e (opcional) zera o estoque de quem saiu do ERP.
 * @returns {{novos:number, alterados:number, zerados:number, visibilidadeMudou:number}}
 */
export async function aplicarCompleto(db, produtos, { zerarAusentes = true } = {}) {
  const json = JSON.stringify(produtos);
  // "visível" aqui = tem estoque e não está pendente (ignora edição manual, que não muda no sync)
  const sql = `
    with entrada as (
      select * from jsonb_to_recordset($1::jsonb) as x(${RECORDSET})
    ),
    antes as (
      select p.cod_red, (p.estoque > 0 and not p.pendente) as vis
      from public.produtos p join entrada e using (cod_red)
    ),
    up as (
      insert into public.produtos as p (cod_red, ${COLS_ERP.join(', ')}, erp_atualizado_em)
      select cod_red, ${COLS_ERP.join(', ')}, now() from entrada
      on conflict (cod_red) do update set
        ${COLS_ERP.map((c) => `${c} = excluded.${c}`).join(',\n        ')},
        erp_atualizado_em = now()
      where (${COLS_ERP.map((c) => `p.${c}`).join(', ')})
        is distinct from (${COLS_ERP.map((c) => `excluded.${c}`).join(', ')})
      returning p.cod_red, (xmax = 0) as novo, (p.estoque > 0 and not p.pendente) as vis
    )
    select
      count(*) filter (where up.novo)::int as novos,
      count(*) filter (where not up.novo)::int as alterados,
      count(*) filter (where up.novo and up.vis or (not up.novo and antes.vis is distinct from up.vis))::int as vis_mudou
    from up left join antes using (cod_red)`;
  const [r] = (await db.query(sql, [json])).rows;

  let zerados = 0;
  let zeradosVisiveis = 0;
  if (zerarAusentes) {
    const ids = produtos.map((p) => p.cod_red);
    const z = (await db.query(`
      update public.produtos p set estoque = 0, erp_atualizado_em = now()
      where p.estoque <> 0 and not (p.cod_red = any($1::bigint[]))
      returning (not p.pendente) as era_vis`, [ids])).rows;
    zerados = z.length;
    zeradosVisiveis = z.filter((x) => x.era_vis).length;
  }
  return { novos: r.novos, alterados: r.alterados, zerados, visibilidadeMudou: r.vis_mudou + zeradosVisiveis };
}

/**
 * Sync de estoque: só a coluna estoque dos produtos que já existem.
 * @param itens [{cod_red, estoque}]
 */
export async function aplicarEstoque(db, itens, { zerarAusentes = true } = {}) {
  const json = JSON.stringify(itens.map((i) => ({ cod_red: i.cod_red, estoque: Math.max(0, Math.trunc(Number(i.estoque) || 0)) })));
  const rows = (await db.query(`
    with entrada as (select * from jsonb_to_recordset($1::jsonb) as x(cod_red bigint, estoque integer)),
    alvo as (
      select p.cod_red, p.estoque as antigo, e.estoque as novo, p.pendente
      from public.produtos p join entrada e using (cod_red)
      where p.estoque is distinct from e.estoque
    )
    update public.produtos p set estoque = a.novo, erp_atualizado_em = now()
    from alvo a where p.cod_red = a.cod_red
    returning ((a.antigo > 0) <> (a.novo > 0) and not a.pendente) as vis_mudou`, [json])).rows;

  let zerados = 0;
  let zeradosVisiveis = 0;
  if (zerarAusentes) {
    const z = (await db.query(`
      update public.produtos p set estoque = 0, erp_atualizado_em = now()
      where p.estoque <> 0 and not (p.cod_red = any($1::bigint[]))
      returning (not p.pendente) as era_vis`, [itens.map((i) => i.cod_red)])).rows;
    zerados = z.length;
    zeradosVisiveis = z.filter((x) => x.era_vis).length;
  }
  return {
    alterados: rows.length,
    zerados,
    visibilidadeMudou: rows.filter((r) => r.vis_mudou).length + zeradosVisiveis,
  };
}
