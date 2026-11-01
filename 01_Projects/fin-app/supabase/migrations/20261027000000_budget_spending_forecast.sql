-- R01: section 9.4, with owner-confirmed median of three monthly daily averages.
-- Read-only derived workspace facts; no financial records/review snapshots rewritten.
CREATE FUNCTION public.budget_forecast_facts(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint,p_details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE
 p public.budget_periods%ROWTYPE;plan public.budget_plans%ROWTYPE;d jsonb:=p_details;
 asof date;cut date;sample_until date;phase text;accounts uuid[];acct uuid;covered datemultirange;one_cover datemultirange;
 samples jsonb:='[]';history_first date;median_sample jsonb;policy jsonb;rows jsonb;it jsonb;c jsonb;fx jsonb;occ jsonb;occs jsonb;fixed jsonb:='[]';
 flex_id uuid;allocation numeric;net numeric;pending_gross numeric;remaining integer;projected numeric;threshold numeric;
 scope_ok boolean;current_covered boolean:=false;integrity_ok boolean:=true;safe boolean:=true;fixed_complete boolean:=true;
 reason text;status text;available boolean;pending_over boolean:=false;
 matched numeric;expected_left numeric;overdue numeric;fixed_net numeric;fixed_projected numeric;fixed_available numeric;due date;missing numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 IF public.budget_lock_source(p_tenant)<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan;
 SELECT * INTO p FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND id=p_period;
 IF plan.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF plan.version<>p_version THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 asof:=(now() AT TIME ZONE p.timezone)::date;cut:=least(p.end_date,asof+1);sample_until:=date_trunc('month',asof)::date;
 phase:=CASE WHEN p.end_date<=asof THEN 'past' WHEN p.start_date>asof THEN 'future' ELSE 'current' END;
 remaining:=greatest(0,p.end_date-greatest(p.start_date,asof+1));
 scope_ok:=coalesce((d->'lifecycle'->'facts'->>'scope_valid')::boolean,false);
 SELECT coalesce(array_agg(DISTINCT account_id) FILTER(WHERE account_id IS NOT NULL),'{}'::uuid[]) INTO accounts
 FROM public.budget_account_memberships WHERE tenant_id=p_tenant AND plan_id=p_plan AND role='activity' AND start_date<p.end_date AND (end_date IS NULL OR end_date>p.start_date);
 SELECT (x->>'line_id')::uuid,(x->>'planned_cents')::numeric+coalesce((x->>'reallocated_cents')::numeric,0)+coalesce((x->>'opening_carry_cents')::numeric,0)
 INTO flex_id,allocation FROM jsonb_array_elements(d->'items') x WHERE x->>'kind'='everyday';
 threshold:=greatest(2500,ceil(greatest(coalesce(allocation,0),0)/20));
 -- The intersection of complete coverage ranges avoids an arbitrary lookback cutoff.
 -- At most three full months from each disjoint range can be among the last three.
 covered:=datemultirange(daterange('0001-01-01'::date,sample_until,'[)'));
 FOREACH acct IN ARRAY accounts LOOP
  SELECT coalesce(range_agg(daterange(start_date,end_date,'[)')),'{}'::datemultirange) INTO one_cover
  FROM public.account_activity_coverage WHERE tenant_id=p_tenant AND account_id=acct AND revoked_at IS NULL;
  covered:=covered*one_cover;
 END LOOP;
 IF cardinality(accounts)>0 AND scope_ok THEN
  WITH ranges AS(SELECT r FROM unnest(covered) r), bounds AS(
   SELECT (date_trunc('month',lower(r))+CASE WHEN lower(r)=date_trunc('month',lower(r))::date THEN interval '0' ELSE interval '1 month' END)::date first_on,date_trunc('month',upper(r))::date until_on FROM ranges
  ), months AS(SELECT x::date start_date,(x+interval '1 month')::date end_date FROM bounds CROSS JOIN LATERAL generate_series(greatest(first_on,(until_on-interval '3 months')::date),(until_on-interval '1 month')::date,interval '1 month') x), last_three AS(SELECT * FROM months ORDER BY start_date DESC LIMIT 3)
  SELECT coalesce(jsonb_agg(jsonb_build_object('start_date',start_date,'end_date',end_date,'days',end_date-start_date) ORDER BY start_date),'[]') INTO samples FROM last_three;
 END IF;
 history_first:=coalesce((samples->0->>'start_date')::date,sample_until);
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',x->'config'->>'source_account_id','merchant_key',x->'config'->>'source_merchant_key','name',x->>'name') ORDER BY x->>'line_id'),'[]') INTO policy
 FROM jsonb_array_elements(d->'items') x WHERE x->>'kind'<>'everyday' AND x->'config'->>'source_account_id' IS NOT NULL AND x->'config'->>'source_merchant_key' IS NOT NULL;
 -- Historical scope uses this period's activity-account set, not destination accounts.
 -- Explicit source claims take precedence over a configured whole-merchant mapping.
 WITH claims AS MATERIALIZED(SELECT * FROM public.budget_live_claims(p_tenant,p_plan)),
 used AS(SELECT q.source_key,sum(q.amount_cents::numeric) FILTER(WHERE q.purpose='exclude' OR l.kind<>'everyday') amount,count(*) n FROM claims q LEFT JOIN public.budget_lines l ON l.id=q.line_id WHERE q.valid AND q.purpose<>'funding' GROUP BY q.source_key),
 raw AS MATERIALIZED(
  SELECT t.id parent_id,a.id child_id,t.account_id,t.date,t.merchant_key,t.pending,t.is_transfer,t.transfer_state,t.kind_source,coalesce(a.amount,t.amount)::bigint amount,coalesce(a.kind,t.kind) kind
  FROM public.transactions_analytic t LEFT JOIN public.transaction_allocations a ON a.transaction_id=t.id AND a.tenant_id=t.tenant_id
  JOIN public.accounts ac ON ac.id=t.account_id AND ac.tenant_id=p_tenant AND ac.currency='AUD'
  WHERE t.tenant_id=p_tenant AND t.account_id=ANY(accounts) AND t.date>=least(history_first,p.start_date) AND t.date<greatest(sample_until,cut)
 ), effective AS MATERIALIZED(
  SELECT *,CASE WHEN child_id IS NULL THEN 't:'||parent_id ELSE 'a:'||child_id END source_key,
  CASE WHEN kind='transfer' AND kind_source='derived' AND transfer_state='rejected' THEN CASE WHEN amount<0 THEN 'expense' ELSE 'income' END ELSE kind END k FROM raw
 ), historical AS(
  SELECT e.*,CASE WHEN coalesce(u.n,0)=0 AND EXISTS(SELECT 1 FROM jsonb_array_elements(policy) m WHERE m->>'account_id'=e.account_id::text AND m->>'merchant_key'=e.merchant_key) THEN 0 ELSE greatest(0,-e.amount::numeric-coalesce(u.amount,0)) END gross
  FROM effective e LEFT JOIN used u USING(source_key) WHERE NOT e.pending AND NOT e.is_transfer AND e.k='expense' AND e.amount<0
 ), current_rows AS MATERIALIZED(SELECT a.*,greatest(0,a.capacity::numeric-coalesce(u.amount,0)) amount FROM public.budget_activity_amounts(p_tenant,p_plan,p.start_date,cut) a LEFT JOIN used u USING(source_key)),
 pending_rows AS(
  SELECT -e.amount::numeric amount FROM effective e WHERE e.pending AND NOT e.is_transfer AND e.k='expense' AND e.amount<0 AND e.date>=p.start_date AND e.date<cut
  AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan AND m.account_id=e.account_id AND m.role='activity' AND m.start_date<=e.date AND (m.end_date IS NULL OR m.end_date>e.date))
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(policy) m WHERE m->>'account_id'=e.account_id::text AND m->>'merchant_key'=e.merchant_key)
 ), month_totals AS(
  SELECT m sample,coalesce((SELECT sum(h.gross) FROM historical h WHERE h.date>=(m->>'start_date')::date AND h.date<(m->>'end_date')::date),0) gross FROM jsonb_array_elements(samples) m
 ) SELECT jsonb_build_object(
  'samples',(SELECT coalesce(jsonb_agg(sample||jsonb_build_object('gross_cents',CASE WHEN gross<=9007199254740991 THEN gross ELSE NULL END) ORDER BY sample->>'start_date'),'[]') FROM month_totals),
  'safe',NOT EXISTS(SELECT 1 FROM month_totals WHERE gross>9007199254740991),
  'net',coalesce((SELECT sum(amount) FROM current_rows WHERE source_type='expense'),0)-coalesce((SELECT sum(amount_cents::numeric) FROM claims WHERE valid AND line_id=flex_id AND purpose='refund' AND source_date>=p.start_date AND source_date<cut),0),
  'pending',coalesce((SELECT sum(amount) FROM pending_rows),0),
  'integrity',NOT EXISTS(SELECT 1 FROM public.transactions_analytic t WHERE t.tenant_id=p_tenant AND t.account_id=ANY(accounts) AND t.date>=least(history_first,p.start_date) AND t.date<greatest(sample_until,cut) AND t.transfer_candidate AND t.transfer_state IN('unmatched','suggested')) AND NOT EXISTS(SELECT 1 FROM claims WHERE NOT valid AND source_date>=least(history_first,p.start_date) AND source_date<greatest(sample_until,cut)),
  'fixed',(SELECT coalesce(jsonb_agg(jsonb_build_object('line_id',x->>'line_id','net',coalesce((SELECT sum(CASE WHEN q.purpose='refund' THEN -q.amount_cents::numeric ELSE q.amount_cents::numeric END) FROM claims q WHERE q.valid AND q.line_id=(x->>'line_id')::uuid AND q.purpose IN('expense','purchase','refund') AND q.source_date>=p.start_date AND q.source_date<cut),0),
   'occurrences',(SELECT coalesce(jsonb_agg(o||jsonb_build_object('matched_cents',coalesce((SELECT sum(q.amount_cents::numeric) FROM claims q JOIN public.budget_source_claims original ON original.id=q.id WHERE q.valid AND q.line_id=(x->>'line_id')::uuid AND q.purpose='expense' AND q.occurrence_date=(o->>'date')::date AND original.occurrence_revision_id=(x->'config'->>'schedule_id')::uuid AND q.source_date<cut),0)) ORDER BY o->>'date'),'[]') FROM jsonb_array_elements(x->'occurrences') o))),'[]') FROM jsonb_array_elements(d->'items') x WHERE x->>'kind'='fixed')) INTO rows;
 samples:=rows->'samples';safe:=(rows->>'safe')::boolean;net:=(rows->>'net')::numeric;pending_gross:=(rows->>'pending')::numeric;integrity_ok:=(rows->>'integrity')::boolean;
 -- Current coverage only needs to reach the local as-of date. Future estimates
 -- never pretend future activity has been observed.
 IF phase='future' THEN current_covered:=false;ELSE
 current_covered:=cardinality(accounts)>0 AND NOT EXISTS(
  SELECT 1 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan AND m.role='activity' AND m.start_date<cut AND (m.end_date IS NULL OR m.end_date>p.start_date)
  AND NOT coalesce((SELECT range_agg(daterange(v.start_date,v.end_date,'[)')) @> daterange(greatest(p.start_date,m.start_date),least(cut,coalesce(m.end_date,cut)),'[)') FROM public.account_activity_coverage v WHERE v.tenant_id=p_tenant AND v.account_id=m.account_id AND v.revoked_at IS NULL),false));
 END IF;
 IF abs(net)>9007199254740991 OR pending_gross>9007199254740991 OR allocation IS NULL OR abs(allocation)>9007199254740991 OR abs(allocation-net)>9007199254740991 THEN safe:=false;END IF;
 FOR it IN SELECT value FROM jsonb_array_elements(d->'items') WHERE value->>'kind'='fixed' LOOP
  c:=it->'config';reason:=NULL;expected_left:=0;overdue:=0;occs:='[]';
  SELECT value INTO fx FROM jsonb_array_elements(rows->'fixed') WHERE value->>'line_id'=it->>'line_id';fixed_net:=(fx->>'net')::numeric;
  fixed_available:=(it->>'planned_cents')::numeric+coalesce((it->>'reallocated_cents')::numeric,0);
  IF c IS NULL OR c='null'::jsonb OR c->>'type'<>'bill' OR c->>'state'='draft' THEN reason:='incomplete_fixed_schedule';fixed_complete:=false;END IF;
  FOR occ IN SELECT value FROM jsonb_array_elements(coalesce(fx->'occurrences','[]')) LOOP
   matched:=(occ->>'matched_cents')::numeric;due:=(occ->>'date')::date;missing:=greatest(0,(occ->>'expected_cents')::numeric-matched);
   expected_left:=expected_left+missing;IF due<=asof THEN overdue:=overdue+missing;END IF;
   occs:=occs||jsonb_build_array(occ||jsonb_build_object('remaining_cents',missing));
  END LOOP;
  fixed_projected:=fixed_net+expected_left;
  IF abs(fixed_available)>9007199254740991 THEN fixed_available:=NULL;reason:='amount_too_large';END IF;
  IF abs(fixed_net)>9007199254740991 OR abs(fixed_projected)>9007199254740991 OR expected_left>9007199254740991 OR overdue>9007199254740991 THEN reason:='amount_too_large';END IF;
  IF NOT scope_ok THEN reason:='invalid_scope';ELSIF phase='past' THEN reason:='historical_period';ELSIF phase='current' AND NOT current_covered THEN reason:='incomplete_coverage';ELSIF NOT integrity_ok THEN reason:='unresolved_evidence';END IF;
  available:=reason IS NULL;
  fixed:=fixed||jsonb_build_array(jsonb_build_object('line_id',it->>'line_id','name',it->>'name','available',available,'reason',reason,'allocation_cents',fixed_available,
   'settled_net_cents',CASE WHEN scope_ok AND phase='current' AND abs(fixed_net)<=9007199254740991 THEN fixed_net ELSE NULL END,
   'expected_remaining_cents',CASE WHEN expected_left<=9007199254740991 THEN expected_left ELSE NULL END,'overdue_expected_cents',CASE WHEN overdue<=9007199254740991 THEN overdue ELSE NULL END,
   'projected_cents',CASE WHEN available THEN fixed_projected ELSE NULL END,'status',CASE WHEN NOT available THEN 'unavailable' WHEN fixed_net>fixed_available AND phase='current' THEN 'exceeded' WHEN fixed_projected-fixed_available>greatest(2500,ceil(greatest(fixed_available,0)/20)) THEN 'likely_to_exceed' ELSE 'within_plan' END,
   'occurrences',CASE WHEN expected_left<=9007199254740991 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(occs) v WHERE (v->>'matched_cents')::numeric>9007199254740991) THEN occs ELSE '[]' END));
 END LOOP;
 reason:=NULL;
 IF phase='past' THEN reason:='historical_period';ELSIF NOT scope_ok THEN reason:='invalid_scope';ELSIF cardinality(accounts)=0 THEN reason:='no_accounts';ELSIF jsonb_array_length(samples)<3 THEN reason:='not_enough_history';ELSIF phase='current' AND NOT current_covered THEN reason:='incomplete_coverage';ELSIF NOT integrity_ok THEN reason:='unresolved_evidence';ELSIF NOT fixed_complete THEN reason:='incomplete_fixed_schedule';ELSIF NOT safe THEN reason:='amount_too_large';END IF;
 IF safe AND jsonb_array_length(samples)=3 THEN
  SELECT value INTO median_sample FROM jsonb_array_elements(samples) ORDER BY (value->>'gross_cents')::numeric/(value->>'days')::numeric,value->>'start_date' OFFSET 1 LIMIT 1;
  -- Keep the selected rational rate exact; round only the final projected cents.
  projected:=CASE WHEN phase='future' THEN 0 ELSE net END*(median_sample->>'days')::numeric+(median_sample->>'gross_cents')::numeric*remaining;
  projected:=sign(projected)*floor((abs(projected)+(median_sample->>'days')::numeric/2)/(median_sample->>'days')::numeric);
  IF abs(projected)>9007199254740991 OR abs(projected-allocation)>9007199254740991 THEN reason:='amount_too_large';END IF;
 END IF;
 IF abs(allocation)>9007199254740991 THEN allocation:=NULL;END IF;
 available:=reason IS NULL;
 pending_over:=phase='current' AND scope_ok AND current_covered AND integrity_ok AND safe AND net<=allocation AND net+pending_gross>allocation;
 status:=CASE WHEN NOT available THEN CASE WHEN reason IN('invalid_scope','incomplete_coverage','unresolved_evidence','incomplete_fixed_schedule') THEN 'check_data' ELSE 'unavailable' END WHEN phase='current' AND net>allocation THEN 'exceeded' WHEN projected-allocation>threshold THEN 'likely_to_exceed' ELSE 'within_plan' END;
 RETURN jsonb_build_object('method','budget-forecast-v1','source_revision',p_source::text,'plan_version',p_version::text,'period_id',p.id,'as_of',asof,'checked_at',transaction_timestamp(),'through_date',CASE WHEN phase='future' THEN NULL ELSE least(asof,p.end_date-1) END,'phase',phase,
  'flexible',jsonb_build_object('line_id',flex_id,'available',available,'status',status,'reason',reason,'allocation_cents',allocation,'settled_net_cents',CASE WHEN scope_ok AND cardinality(accounts)>0 AND phase<>'future' AND abs(net)<=9007199254740991 THEN net ELSE NULL END,
   'remaining_allocation_cents',CASE WHEN scope_ok AND cardinality(accounts)>0 AND phase<>'future' AND abs(allocation-net)<=9007199254740991 THEN allocation-net ELSE NULL END,
   'pending_expense_cents',CASE WHEN scope_ok AND cardinality(accounts)>0 AND phase='current' AND pending_gross<=9007199254740991 THEN pending_gross ELSE NULL END,'pending_overage',pending_over,
   'projected_cents',CASE WHEN available THEN projected ELSE NULL END,'remaining_days',remaining,'threshold_cents',threshold,'history',samples,'median',CASE WHEN safe THEN median_sample ELSE NULL END,
   'policy_names',(SELECT coalesce(jsonb_agg(x->>'name'),'[]') FROM jsonb_array_elements(policy) x),'scope_valid',scope_ok,'coverage_complete',current_covered,'integrity_ok',integrity_ok),
  'fixed',fixed);
END $$;

CREATE OR REPLACE FUNCTION public.budget_attention_facts(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint,p_details jsonb,p_internal boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE d jsonb:=p_details;p public.budget_periods%ROWTYPE;s jsonb;issues jsonb:='[]';result jsonb:='[]';i jsonb;c jsonb;it jsonb;lim jsonb;occ jsonb;old jsonb;event public.budget_attention_events%ROWTYPE;
 forecast jsonb;pending_evidence jsonb;maps jsonb;claims_basis jsonb;basis jsonb;scope_basis jsonb;asof date;gap numeric;available numeric;due date;remaining numeric;future numeric;days integer;key text;reopened boolean;why text;state text;hash text;attention_v bigint;last_op uuid;
BEGIN
 SELECT * INTO p FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan AND tenant_id=p_tenant;
 IF p.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 asof:=(now() AT TIME ZONE p.timezone)::date;
 s:=public.budget_query_m4(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p_period));
 IF d->'forecast' IS NULL THEN d:=d||jsonb_build_object('forecast',public.budget_forecast_facts(p_tenant,p_actor,p_plan,p_period,p_source,p_version,d));END IF;
 -- The validated details and snapshot are read under one tenant gate.
 scope_basis:=jsonb_build_object('valid',d->'lifecycle'->'facts'->'scope_valid','covered',d->'lifecycle'->'facts'->'coverage_complete',
 'scope',(SELECT coalesce(jsonb_agg(jsonb_build_object('account',original_account_id,'role',role,'from',start_date,'until',end_date) ORDER BY original_account_id,role,start_date),'[]') FROM public.budget_account_memberships WHERE plan_id=p_plan AND start_date<p.end_date AND (end_date IS NULL OR end_date>p.start_date)));
 WITH live AS MATERIALIZED(SELECT * FROM public.budget_live_claims(p_tenant,p_plan)),
 activity AS MATERIALIZED(SELECT * FROM public.budget_activity(p_tenant,p_plan,p.start_date,p.end_date)),
 used AS(SELECT source_key,sum(amount_cents::numeric) amount FROM live l WHERE valid AND purpose<>'funding' AND (purpose='exclude' OR EXISTS(SELECT 1 FROM public.budget_lines b WHERE b.id=l.line_id AND b.kind<>'everyday')) GROUP BY source_key),
 residual AS(SELECT a.* FROM activity a LEFT JOIN used u USING(source_key) WHERE a.source_type='expense' AND a.capacity>coalesce(u.amount,0)),
 partitioned AS(SELECT a.*,coalesce(l->>'id','other') bucket FROM residual a LEFT JOIN jsonb_array_elements(d->'limits') l ON l->>'category_id'=a.category_id AND (l->>'subcategory_id' IS NULL OR l->>'subcategory_id'=a.subcategory_id) AND (l->>'custom_subcategory_id' IS NULL OR (l->>'custom_subcategory_id')::uuid=a.custom_subcategory_id)),
 scoped AS(
 SELECT bucket,source_key,identity FROM partitioned UNION ALL SELECT 'parent',source_key,identity FROM residual UNION ALL SELECT 'uncategorized',source_key,identity FROM residual WHERE category_id IS NULL OR lower(category_id)='uncategorized'
 UNION ALL SELECT l.line_id::text,a.source_key,a.identity FROM activity a JOIN live l USING(source_key) WHERE l.valid AND l.purpose<>'funding'
 ), grouped AS(SELECT bucket,jsonb_object_agg(source_key,encode(extensions.digest((identity-'amount'-'merchant')::text,'sha256'),'hex')) evidence FROM scoped GROUP BY bucket)
 SELECT coalesce(jsonb_object_agg(bucket,evidence),'{}') INTO maps FROM grouped;
 SELECT coalesce(jsonb_object_agg(line_id::text,proof),'{}') INTO claims_basis FROM (
 SELECT line_id,encode(extensions.digest(jsonb_agg(jsonb_build_object('id',id,'valid',valid,'purpose',purpose) ORDER BY id)::text,'sha256'),'hex') proof FROM public.budget_live_claims(p_tenant,p_plan) WHERE line_id IS NOT NULL GROUP BY line_id) q;
 -- Resource gaps are distinct from spending gaps; never sum them into fake savings.
 gap:=greatest(0,-(s->>'unallocated_cents')::numeric);
 IF gap>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('funding:current','funding_gap','More planned than expected resources',gap,(s->'revision'->>'income_cents')::numeric+(s->'revision'->>'drawdown_cents')::numeric,NULL,1,'{}'));END IF;
 gap:=greatest(0,-(s->'future_template'->>'unallocated_cents')::numeric);
 IF gap>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('funding:future','future_funding_gap','Future allowances need more expected income',gap,(s->'future_template'->>'income_cents')::numeric,NULL,1,'{}'));END IF;
 IF (d->'lifecycle'->'facts'->>'scope_valid')::boolean THEN
  FOR it IN SELECT value FROM jsonb_array_elements(d->'items') LOOP
   c:=it->'config';key:=it->>'line_id';basis:=scope_basis||jsonb_build_object('claims',claims_basis->key,'kind',it->'kind','archived',coalesce(it->'archived','false'));
   remaining:=(it->>'remaining_cents')::numeric;available:=(it->>'planned_cents')::numeric+coalesce((it->>'opening_carry_cents')::numeric,0)+(it->>'reallocated_cents')::numeric;
   IF remaining<0 AND it->>'kind' IN('everyday','reserve','fixed') THEN
    issues:=issues||jsonb_build_array(public.budget_attention_issue('balance:'||key,CASE WHEN it->>'kind'='reserve' THEN 'reserve_shortfall' ELSE 'overspend' END,it->>'name',-remaining,available,NULL,2,basis,coalesce(maps->CASE WHEN it->>'kind'='everyday' THEN 'parent' ELSE key END,'{}'))||jsonb_build_object('line_id',key));
   END IF;
   IF c<>'null'::jsonb AND NOT coalesce((it->>'archived')::boolean,false) THEN
    IF c->>'type'='bill' THEN
     FOR occ IN SELECT value FROM jsonb_array_elements(it->'occurrences') LOOP
      gap:=greatest(0,(occ->>'expected_cents')::numeric-(occ->>'matched_cents')::numeric);due:=(occ->>'date')::date;
      IF gap>0 AND due<=least(asof+7,p.end_date-1) THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('bill:'||key||':'||due,'bill_unmatched',it->>'name',gap,(occ->>'expected_cents')::numeric,due,1,basis,coalesce(maps->key,'{}'))||jsonb_build_object('line_id',key));END IF;
     END LOOP;
    ELSIF it->>'kind'='reserve' AND c->>'due_date' IS NOT NULL AND c->>'target_cents' IS NOT NULL AND c->>'state'<>'draft' THEN
     due:=(c->>'due_date')::date;future:=0;
     -- Current-window scheduled additions are already in the reserve. Count
     -- only dates after this saved window, never the same contribution twice.
     IF c->>'state'='saving' AND NOT coalesce((d->'controls'->>'paused')::boolean,false) AND due>=p.end_date THEN
      SELECT count(*)*(c->>'amount_cents')::numeric INTO future FROM public.budget_occurrence_dates((c->>'anchor')::date,c->>'cadence',p.end_date,due+1);
     END IF;
     IF abs(future)>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
     gap:=greatest(0,(c->>'target_cents')::numeric-(it->>'reserve_cents')::numeric-(it->>'net_purchases_cents')::numeric-future);
     IF gap>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('target:'||key,'goal_due_shortfall',it->>'name',gap,(c->>'target_cents')::numeric,due,1,basis||jsonb_build_object('target',c->'target_cents','cadence',c->'cadence','anchor',c->'anchor','state',c->'state','paused',d->'controls'->'paused'),coalesce(maps->key,'{}'))||jsonb_build_object('line_id',key));END IF;
    END IF;
   END IF;
   IF (it->>'changed_claims')::numeric>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('claims:'||key,'changed_matches',it->>'name',NULL,NULL,NULL,4,basis)||jsonb_build_object('line_id',key,'count',(it->>'changed_claims')::numeric));END IF;
  END LOOP;
  FOR lim IN SELECT value FROM jsonb_array_elements(d->'limits') LOOP
   remaining:=(lim->>'remaining_cents')::numeric;
   IF remaining<0 THEN
    SELECT coalesce((SELECT t->>'name' FROM jsonb_array_elements(d->'taxonomy_scopes') t WHERE t->>'category_id'=lim->>'category_id' AND t->>'subcategory_id' IS NOT DISTINCT FROM lim->>'subcategory_id' AND t->>'custom_subcategory_id' IS NOT DISTINCT FROM lim->>'custom_subcategory_id' LIMIT 1),
      (SELECT t->>'name' FROM jsonb_array_elements(d->'taxonomy') t WHERE t->>'id'=lim->>'category_id' LIMIT 1),lim->>'category_id') INTO key;
    issues:=issues||jsonb_build_array(public.budget_attention_issue('category:'||(lim->>'id'),'overspend',coalesce(key,lim->>'category_id'),-remaining,(lim->>'amount_cents')::numeric+coalesce((lim->>'opening_carry_cents')::numeric,0),NULL,2,scope_basis||jsonb_build_object('category',lim->'category_id','subcategory',lim->'subcategory_id','custom',lim->'custom_subcategory_id'),coalesce(maps->(lim->>'id'),'{}')));
   END IF;
  END LOOP;
  remaining:=(d->>'other_flexible_remaining_cents')::numeric;
  IF remaining<0 AND jsonb_array_length(d->'limits')>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('category:other','overspend','Other everyday spending',-remaining,(d->>'other_flexible_cents')::numeric+coalesce((d->>'other_opening_carry_cents')::numeric,0),NULL,2,scope_basis,coalesce(maps->'other','{}')));END IF;
  IF (d->>'unassigned_credit_cents')::numeric>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('credits:unassigned','unassigned_credits','Credits need a purpose',NULL,NULL,NULL,4,scope_basis||jsonb_build_object('credits',d->'unassigned_credit_cents')));END IF;
  SELECT count(*) INTO days FROM public.budget_activity(p_tenant,p_plan,p.start_date,p.end_date) WHERE source_type='expense' AND (category_id IS NULL OR lower(category_id)='uncategorized');
  IF days>0 THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('categories:unclassified','uncategorized','Spending needs a category',NULL,NULL,NULL,4,scope_basis||jsonb_build_object('count',days),coalesce(maps->'uncategorized','{}'))||jsonb_build_object('count',days));END IF;
 END IF;
 forecast:=d->'forecast'->'flexible';
 IF d->'forecast'->>'phase'='current' THEN
  basis:=scope_basis||jsonb_build_object('method',d->'forecast'->'method','history',forecast->'history','policy',forecast->'policy_names','allocation',forecast->'allocation_cents');
  IF coalesce((forecast->>'available')::boolean,false) AND forecast->>'status'='likely_to_exceed' THEN
   issues:=issues||jsonb_build_array(public.budget_attention_issue('forecast:flexible','projected_overspend','Everyday spending may exceed this plan',(forecast->>'projected_cents')::numeric-(forecast->>'allocation_cents')::numeric,(forecast->>'allocation_cents')::numeric,p.end_date-1,3,basis,coalesce(maps->'parent','{}'))||jsonb_build_object('line_id',forecast->>'line_id'));
  END IF;
  FOR it IN SELECT value FROM jsonb_array_elements(d->'forecast'->'fixed') LOOP
   IF coalesce((it->>'available')::boolean,false) AND it->>'status'='likely_to_exceed' THEN
    issues:=issues||jsonb_build_array(public.budget_attention_issue('forecast:'||(it->>'line_id'),'fixed_projected_overspend',(it->>'name')||' may exceed this plan',(it->>'projected_cents')::numeric-(it->>'allocation_cents')::numeric,(it->>'allocation_cents')::numeric,p.end_date-1,3,scope_basis||jsonb_build_object('method',d->'forecast'->'method','occurrences',it->'occurrences','allocation',it->'allocation_cents'),coalesce(maps->(it->>'line_id'),'{}'))||jsonb_build_object('line_id',it->>'line_id'));
   END IF;
  END LOOP;
  IF coalesce((forecast->>'pending_overage')::boolean,false) THEN
   -- Compare existing pending identities, not only their total. New ordinary holds
   -- use materiality; removed/reinterpreted prior evidence reopens immediately.
   SELECT coalesce(jsonb_object_agg(CASE WHEN a.id IS NULL THEN 't:'||t.id ELSE 'a:'||a.id END,
    encode(extensions.digest(jsonb_build_object('account',t.account_id,'date',t.date,'kind',coalesce(a.kind,t.kind),'merchant_key',t.merchant_key,'category',coalesce(a.category_id,t.category_id),'transfer',t.is_transfer)::text,'sha256'),'hex')),'{}') INTO pending_evidence
   FROM public.transactions_analytic t LEFT JOIN public.transaction_allocations a ON a.transaction_id=t.id AND a.tenant_id=t.tenant_id
   WHERE t.tenant_id=p_tenant AND t.pending AND NOT t.is_transfer AND coalesce(a.amount,t.amount)<0 AND (coalesce(a.kind,t.kind)='expense' OR coalesce(a.kind,t.kind)='transfer' AND t.kind_source='derived' AND t.transfer_state='rejected')
   AND t.date>=p.start_date AND t.date<least(p.end_date,asof+1)
   AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.tenant_id=p_tenant AND m.plan_id=p_plan AND m.role='activity' AND m.account_id=t.account_id AND m.start_date<=t.date AND (m.end_date IS NULL OR m.end_date>t.date))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'items') x WHERE x->>'kind'<>'everyday' AND x->'config'->>'source_account_id'=t.account_id::text AND x->'config'->>'source_merchant_key'=t.merchant_key);
   issues:=issues||jsonb_build_array(public.budget_attention_issue('pending:flexible','pending_overage','Pending charges may exceed plan',(forecast->>'settled_net_cents')::numeric+(forecast->>'pending_expense_cents')::numeric-(forecast->>'allocation_cents')::numeric,(forecast->>'allocation_cents')::numeric,NULL,3,scope_basis||jsonb_build_object('policy',forecast->'policy_names'),pending_evidence)||jsonb_build_object('line_id',forecast->>'line_id'));
  END IF;
 END IF;
 IF NOT (d->'lifecycle'->'facts'->>'scope_valid')::boolean OR NOT (d->'lifecycle'->'facts'->>'coverage_complete')::boolean THEN issues:=issues||jsonb_build_array(public.budget_attention_issue('data:coverage','check_data','Check the history behind this budget',NULL,NULL,NULL,4,scope_basis));END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(issues) ORDER BY (value->>'priority')::int,value->>'due_date' NULLS LAST,value->>'key' LOOP
  SELECT * INTO event FROM public.budget_attention_events e WHERE e.plan_id=p_plan AND e.period_id=p_period AND e.issue_key=i->>'key' ORDER BY e.version DESC LIMIT 1;
  old:=event.payload;reopened:=false;why:=NULL;state:='active';
  IF old IS NOT NULL AND old->>'state'<>'active' THEN
   IF (old->>'until')::date<=asof THEN why:='expired';
   ELSIF i->'due_date' IS DISTINCT FROM old->'issue'->'due_date' THEN why:='due_date_changed';
   ELSIF i->'basis' IS DISTINCT FROM old->'issue'->'basis' THEN why:='evidence_changed';
   ELSIF EXISTS(SELECT 1 FROM jsonb_each(old->'issue'->'evidence') e WHERE i->'evidence'->e.key IS DISTINCT FROM e.value) THEN why:='evidence_changed';
   ELSIF (i->>'gap_cents')::numeric-coalesce((old->'issue'->>'gap_cents')::numeric,0)>=(old->'issue'->>'threshold_cents')::numeric THEN why:='gap_worsened';
   ELSE state:=old->>'state';END IF;
   reopened:=state='active';
  END IF;
  hash:=encode(extensions.digest((i||jsonb_build_object('as_of',asof,'source_revision',p_source::text,'plan_version',p_version::text))::text,'sha256'),'hex');
  i:=i||jsonb_build_object('issue_hash',hash,'state',state,'reopened',reopened,'reopen_reason',why,'until',old->'until');
  IF NOT p_internal THEN i:=i-'basis'-'evidence';END IF;
  result:=result||jsonb_build_array(i);
 END LOOP;
 SELECT coalesce(max(version),0) INTO attention_v FROM public.budget_attention_events WHERE plan_id=p_plan;
 SELECT e.operation_id INTO last_op FROM public.budget_attention_events e JOIN public.budget_operations o ON o.id=e.operation_id
 WHERE e.plan_id=p_plan AND e.version=attention_v AND o.action='set_attention' AND NOT EXISTS(SELECT 1 FROM public.budget_operations u WHERE u.undo_of=o.id)
 AND o.after_state->>'financial_version'=p_version::text AND o.outcome->>'source_revision'=p_source::text;
 IF EXISTS(SELECT 1 FROM jsonb_path_query(result,'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
 RETURN jsonb_build_object('items',result,'total',jsonb_array_length(result),'active_count',(SELECT count(*) FROM jsonb_array_elements(result) x WHERE x->>'state'='active'),'version',attention_v::text,'as_of',asof,'editable',asof>=p.start_date AND asof<p.end_date,'undo_operation_id',last_op,'forecast_available',coalesce((d->'forecast'->'flexible'->>'available')::boolean,false));
END $$;

CREATE OR REPLACE FUNCTION public.budget_workspace_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE d jsonb;BEGIN
 d:=public.budget_details(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 d:=d||jsonb_build_object('forecast',public.budget_forecast_facts(p_tenant,p_actor,p_plan,p_period,p_source,p_version,d));
 RETURN d||jsonb_build_object('attention',public.budget_attention_facts(p_tenant,p_actor,p_plan,p_period,p_source,p_version,d));
END $$;
REVOKE ALL ON FUNCTION public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb),public.budget_attention_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean),public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb),public.budget_attention_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean),public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint) TO service_role;

-- No tables/views are introduced. Assert the internal-function boundary in the
-- migration itself, so a missed grant cannot silently expose derived finances.
DO $$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb)',
  'public.budget_attention_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean)',
  'public.budget_workspace_details(uuid,uuid,uuid,uuid,bigint,bigint)'
 ] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE')
   OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN
   RAISE EXCEPTION 'budget_forecast_privilege_assertion';
  END IF;
 END LOOP;
END $$;
