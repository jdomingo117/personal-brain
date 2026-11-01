import {randomUUID} from 'node:crypto'

/** Differential proof against the unchanged canonical analytics view. */
export async function runBudgetTransferReadChecks({newUser,sql,quote:q,check}){
 if(sql("SELECT to_regclass('public.budget_transactions_analytic') IS NOT NULL;")!=='t')return
 const u=await newUser(),accounts=[]
 for(let n=0;n<2;n++)accounts.push(sql(`INSERT INTO public.accounts(user_id,tenant_id,name,type,balance,currency) VALUES(${q(u.id)},${q(u.tenant)},'R06 fictional account ${n}','Liquid',0,'AUD') RETURNING id;`).split('\n')[0])
 const [a,b]=accounts,from=randomUUID(),to=randomUUID(),hash="decode(md5('r06-from'),'hex')",toHash="decode(md5('r06-to'),'hex')"
 sql(`INSERT INTO public.transactions(id,user_id,tenant_id,account_id,date,original_description,merchant,merchant_key,category,amount,kind,kind_source,pending,transfer_candidate,dedupe_hash,occurrence) VALUES
 (${q(from)},${q(u.id)},${q(u.tenant)},${q(a)},current_date,'R06 outgoing','R06','r06','Shopping',-100,'expense','user',false,false,${hash},0),
 (${q(to)},${q(u.id)},${q(u.tenant)},${q(b)},current_date,'R06 incoming','R06','r06','Income',100,'income','user',false,false,${toHash},0);
 INSERT INTO public.transactions(user_id,tenant_id,account_id,date,original_description,merchant,category,amount,kind,kind_source,pending,transfer_candidate)
 SELECT ${q(u.id)},${q(u.tenant)},${q(a)},current_date,'R06 unlinked '||n,'R06','Shopping',CASE WHEN n%2=0 THEN -100 ELSE 100 END,
 CASE n WHEN 0 THEN 'expense' WHEN 1 THEN 'refund' WHEN 2 THEN 'transfer' WHEN 3 THEN 'income' WHEN 4 THEN 'reimbursement' ELSE 'expense' END,
 CASE WHEN n%2=0 THEN 'derived' ELSE 'user' END,n=5,n=2 FROM generate_series(0,5) n;`)
 const equivalent=label=>check(`R06 ${label}: all canonical columns and row multiplicities agree`,sql(`SELECT NOT EXISTS(SELECT to_jsonb(c) FROM public.transactions_analytic c WHERE tenant_id=${q(u.tenant)} EXCEPT ALL SELECT to_jsonb(c)-'budget_custom_subcategory_id' FROM public.budget_transactions_analytic c WHERE tenant_id=${q(u.tenant)}) AND NOT EXISTS(SELECT to_jsonb(c)-'budget_custom_subcategory_id' FROM public.budget_transactions_analytic c WHERE tenant_id=${q(u.tenant)} EXCEPT ALL SELECT to_jsonb(c) FROM public.transactions_analytic c WHERE tenant_id=${q(u.tenant)});`),'t')

 if(sql("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.budget_transactions_analytic'::regclass AND attname='budget_custom_subcategory_id');")==='t'){
  const custom=sql(`INSERT INTO public.tenant_subcategories(tenant_id,category_id,display_name,created_by) VALUES(${q(u.tenant)},'shopping','R06 private category',${q(u.id)}) RETURNING id;`).split('\n')[0]
  sql(`UPDATE public.transactions SET custom_subcategory_id=${q(custom)} WHERE id=${q(from)} AND tenant_id=${q(u.tenant)};`)
  check('R06 private parent category is the original canonical parent field',sql(`SELECT budget_custom_subcategory_id FROM public.budget_transactions_analytic WHERE id=${q(from)};`),custom)
 }
 equivalent('unlinked kinds, pending, unresolved and null identities')
 const link=randomUUID()
 sql(`INSERT INTO public.transfer_links(id,tenant_id,from_txn_id,to_txn_id,state,score,matcher_version,from_account_id,from_hash,from_occurrence,to_account_id,to_hash,to_occurrence) VALUES(${q(link)},${q(u.tenant)},${q(from)},${q(to)},'auto',1,1,${q(a)},${hash},0,${q(b)},${toHash},0);`)
 for(const state of ['auto','suggested','confirmed','rejected','external']){sql(`UPDATE public.transfer_links SET state=${q(state)} WHERE id=${q(link)};`);equivalent(`link state ${state}`)}
 const decision=randomUUID()
 sql(`INSERT INTO public.transfer_decisions(id,tenant_id,from_account_id,from_hash,from_occurrence,to_account_id,to_hash,to_occurrence,verdict,decided_by,decided_at) VALUES(${q(decision)},${q(u.tenant)},${q(a)},${hash},0,${q(b)},${toHash},0,'rejected',${q(u.id)},'2026-01-01');`)
 for(const verdict of ['rejected','confirmed','external']){sql(`UPDATE public.transfer_decisions SET verdict=${q(verdict)} WHERE id=${q(decision)};`);equivalent(`decision precedence ${verdict}`)}
 const investmentDecision=randomUUID()
 sql(`INSERT INTO public.investment_cash_decisions(id,tenant_id,transaction_account_id,transaction_hash,transaction_occurrence,activity_account_id,activity_hash,activity_occurrence,verdict,decided_by,decided_at) VALUES(${q(investmentDecision)},${q(u.tenant)},${q(a)},${hash},0,${q(b)},repeat('a',64),0,'rejected',${q(u.id)},'2026-02-01');`)
 equivalent('later investment decision overrides earlier transfer decision')
 sql(`UPDATE public.transfer_decisions SET decided_at='2026-02-01' WHERE id=${q(decision)};`)
 equivalent('conflicting equal-time decisions use canonical fallback')
 // Duplicate-role links are not produced by the real matcher, but the canonical
 // fallback also preserves their legacy LIMIT 1 behavior if malformed data exists.
 sql(`INSERT INTO public.transfer_links(tenant_id,from_txn_id,to_txn_id,state,score,matcher_version,from_account_id,from_hash,from_occurrence,to_account_id,to_hash,to_occurrence) VALUES(${q(u.tenant)},${q(to)},${q(from)},'confirmed',1,1,${q(b)},${toHash},0,${q(a)},${hash},0);`)
 equivalent('multiple-role legacy link fallback')
 check('R06 captured investment decision fixture removed before auth cleanup',sql(`DELETE FROM public.investment_cash_decisions WHERE id=${q(investmentDecision)} AND tenant_id=${q(u.tenant)} RETURNING id;`).split('\n')[0],investmentDecision)
 check('R06 Budget analytics view remains private and invoker-secure',sql("SELECT NOT has_table_privilege('anon','public.budget_transactions_analytic','SELECT') AND NOT has_table_privilege('authenticated','public.budget_transactions_analytic','SELECT') AND has_table_privilege('service_role','public.budget_transactions_analytic','SELECT') AND (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid='public.budget_transactions_analytic'::regclass);"),'t')
}
