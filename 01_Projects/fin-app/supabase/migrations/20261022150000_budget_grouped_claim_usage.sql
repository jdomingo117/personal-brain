-- Aggregate claim usage once per source and line instead of rescanning the
-- complete claims CTE for every transaction. Retain exact dates, purposes,
-- refund linkage, validity and funding/earmark distinctions. Aggregate cumulative
-- allocations once per selected period too, not once per line.
CREATE OR REPLACE FUNCTION public.budget_details_m4_before_controls(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET statement_timeout='8s' AS $$
DECLARE plan public.budget_plans%ROWTYPE;period public.budget_periods%ROWTYPE;v bigint;answer jsonb;BEGIN
 v:=public.budget_lock_source(p_tenant);
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=p_plan;
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND id=p_period;
 IF plan.id IS NULL OR period.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF v<>p_source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF plan.version<>p_version THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 WITH claims AS MATERIALIZED (SELECT * FROM public.budget_live_claims(p_tenant,p_plan)),
 activity AS MATERIALIZED (SELECT * FROM public.budget_activity_amounts(p_tenant,p_plan,period.start_date,period.end_date)),
 config AS (SELECT DISTINCT ON(r.line_id) r.line_id,r.id,r.payload FROM public.budget_item_revisions r JOIN public.budget_periods p ON p.id=r.period_id WHERE r.plan_id=p_plan AND p.start_date<=period.start_date ORDER BY r.line_id,r.version DESC),
 claim_lines AS MATERIALIZED (
 SELECT x.line_id,
 sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FILTER(WHERE x.valid AND x.purpose IN('expense','purchase','refund') AND x.source_date>=period.start_date AND x.source_date<period.end_date) period_used,
 sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FILTER(WHERE x.valid AND x.purpose IN('expense','purchase','refund') AND x.source_date>=l.opening_date AND x.source_date<period.end_date) lifetime_used,
 sum(x.amount_cents) FILTER(WHERE x.valid AND x.purpose='funding' AND x.source_date<period.end_date AND x.provenance='bank-observed') bank_confirmed,
 sum(x.amount_cents) FILTER(WHERE x.valid AND x.purpose='funding' AND x.source_date<period.end_date AND x.provenance='user-confirmed') user_confirmed,
 sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FILTER(WHERE x.valid AND (x.purpose='purchase' OR (x.purpose='refund' AND parent.purpose='purchase')) AND x.source_date<period.end_date) net_purchases,
 count(*) FILTER(WHERE NOT x.valid) changed_claims
 FROM claims x JOIN public.budget_lines l ON l.id=x.line_id AND l.tenant_id=p_tenant AND l.plan_id=p_plan
 LEFT JOIN claims parent ON parent.id=x.related_claim_id GROUP BY x.line_id
 ), allocated AS MATERIALIZED (
 SELECT b.line_id,sum(b.amount_cents) amount FROM public.budget_allocations b
 JOIN public.budget_periods p ON p.current_revision_id=b.revision_id
 WHERE b.tenant_id=p_tenant AND b.plan_id=p_plan AND p.tenant_id=p_tenant AND p.plan_id=p_plan
  AND p.end_date<=period.end_date GROUP BY b.line_id
 ), facts AS (
 SELECT l.*,c.id item_revision,c.payload config,a.amount_cents planned_cents,coalesce(cl.net_purchases,0) net_purchases,coalesce(cl.changed_claims,0) changed_claims,
 coalesce(cl.period_used,0) period_used,
 coalesce(cl.lifetime_used,0) lifetime_used,
 coalesce(alloc.amount,0) allocated_to_date,
 coalesce((SELECT sum(CASE WHEN m.to_line_id=l.id THEN m.amount_cents ELSE -m.amount_cents END) FROM public.budget_reserve_moves m WHERE m.plan_id=p_plan AND (m.to_line_id=l.id OR m.from_line_id=l.id) AND m.effective_date<period.end_date AND (l.kind='reserve' OR m.effective_date>=period.start_date)),0) reallocated,
 coalesce(cl.bank_confirmed,0) bank_confirmed,
 coalesce(cl.user_confirmed,0) user_confirmed
 FROM public.budget_lines l JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=period.current_revision_id LEFT JOIN config c ON c.line_id=l.id LEFT JOIN claim_lines cl ON cl.line_id=l.id LEFT JOIN allocated alloc ON alloc.line_id=l.id WHERE l.plan_id=p_plan AND NOT coalesce((c.payload->>'voided')::boolean,false)
 ), claim_usage AS MATERIALIZED (
 SELECT x.source_key,sum(x.amount_cents) amount FROM claims x LEFT JOIN public.budget_lines l ON l.id=x.line_id
 WHERE x.valid AND x.purpose<>'funding' AND (x.purpose='exclude' OR l.kind<>'everyday') GROUP BY x.source_key
 ), residual AS (
 SELECT a.*,a.capacity-coalesce(u.amount,0) amount FROM activity a LEFT JOIN claim_usage u ON u.source_key=a.source_key
 ), limits AS (SELECT coalesce(public.budget_rollover_at(p_plan,period.start_date)->'limits',(SELECT payload FROM public.budget_limit_revisions WHERE period_id=p_period ORDER BY version DESC LIMIT 1),'[]'::jsonb) payload),
 partitioned AS (
 SELECT x value,coalesce((SELECT sum(r.amount) FROM residual r WHERE r.source_type='expense' AND r.category_id=x->>'category_id' AND
 (x->>'subcategory_id' IS NULL OR r.subcategory_id=x->>'subcategory_id') AND (x->>'custom_subcategory_id' IS NULL OR r.custom_subcategory_id=(x->>'custom_subcategory_id')::uuid)),0) usage
 FROM limits,jsonb_array_elements(payload) x
 ) SELECT jsonb_build_object(
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('line_id',f.id,'name',coalesce(f.config->>'name',f.name),'kind',f.kind,'config',f.config,'item_revision',f.item_revision,
 'opening_cents',f.opening_cents,'opening_date',f.opening_date,'planned_cents',f.planned_cents,
 'reallocated_cents',f.reallocated,
 'remaining_cents',CASE WHEN f.kind='reserve' THEN f.opening_cents+f.allocated_to_date+f.reallocated-f.lifetime_used WHEN f.kind='everyday' THEN f.planned_cents+f.reallocated-coalesce((SELECT sum(amount) FROM residual WHERE source_type='expense'),0)+coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.line_id=f.id AND x.purpose='refund' AND x.source_date>=period.start_date AND x.source_date<period.end_date),0) ELSE f.planned_cents+f.reallocated-f.period_used END,
 'used_cents',CASE WHEN f.kind='everyday' THEN coalesce((SELECT sum(amount) FROM residual WHERE source_type='expense'),0)-coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.line_id=f.id AND x.purpose='refund' AND x.source_date>=period.start_date AND x.source_date<period.end_date),0) ELSE f.period_used END,
 'reserve_cents',CASE WHEN f.kind='reserve' THEN f.opening_cents+f.allocated_to_date+f.reallocated-f.lifetime_used ELSE NULL END,
 'net_purchases_cents',f.net_purchases,
 'bank_confirmed_cents',f.bank_confirmed,'user_confirmed_cents',f.user_confirmed,
 'changed_claims',f.changed_claims,
 'occurrences',CASE WHEN f.config->>'type'='bill' AND f.config->>'state'='saving' THEN
 (SELECT coalesce(jsonb_agg(jsonb_build_object('date',d,'expected_cents',(f.config->>'amount_cents')::bigint,'matched_cents',coalesce((SELECT sum(x.amount_cents) FROM claims x JOIN public.budget_source_claims raw ON raw.id=x.id WHERE x.valid AND x.line_id=f.id AND x.purpose='expense' AND x.occurrence_date=d AND raw.occurrence_revision_id=(f.config->>'schedule_id')::uuid),0))),'[]') FROM public.budget_occurrence_dates((f.config->>'anchor')::date,f.config->>'cadence',period.start_date,period.end_date) d) ELSE '[]'::jsonb END)),'[]') FROM facts f),
 'limits',(SELECT coalesce(jsonb_agg(value||jsonb_build_object('used_cents',usage,'remaining_cents',(value->>'amount_cents')::bigint-usage)),'[]') FROM partitioned),
 'other_flexible_cents',(SELECT a.amount_cents FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id=period.current_revision_id AND l.kind='everyday')+coalesce((SELECT reallocated FROM facts WHERE kind='everyday'),0)-coalesce((SELECT sum((value->>'amount_cents')::bigint) FROM partitioned),0),
 'other_flexible_used_cents',coalesce((SELECT sum(amount) FROM residual WHERE source_type='expense'),0)-coalesce((SELECT sum(usage) FROM partitioned),0)-coalesce((SELECT sum(x.amount_cents) FROM claims x JOIN public.budget_lines l ON l.id=x.line_id WHERE x.valid AND l.kind='everyday' AND x.purpose='refund' AND x.source_date>=period.start_date AND x.source_date<period.end_date),0),
 'excluded_cents',coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.purpose='exclude' AND x.source_date>=period.start_date AND x.source_date<period.end_date),0),
 'unassigned_credit_cents',coalesce((SELECT sum(amount) FROM residual WHERE source_type='refund'),0),
 'claims',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM claims c),
 'recurring',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'account_id',r.account_id,'merchant_key',r.merchant_key,'state',r.state,'cadence',r.cadence_override,'amount_cents',r.expected_amount_override,'next_date',r.next_expected_override)),'[]') FROM public.recurring_series_overrides r WHERE tenant_id=p_tenant),
 'taxonomy',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',display_name) ORDER BY sort_order) FROM public.taxonomy_categories WHERE active AND classification='expense'),
 'taxonomy_scopes',(SELECT coalesce(jsonb_agg(x),'[]') FROM (
  SELECT jsonb_build_object('key','global:'||id,'name',display_name,'category_id',category_id,'subcategory_id',id,'custom_subcategory_id',NULL) x FROM public.taxonomy_subcategories WHERE active
  UNION ALL SELECT jsonb_build_object('key','custom:'||id,'name',display_name,'category_id',category_id,'subcategory_id',NULL,'custom_subcategory_id',id) FROM public.tenant_subcategories WHERE tenant_id=p_tenant AND active
 ) s),
 'planning_goals',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM public.planning_goals WHERE tenant_id=p_tenant AND status<>'archived'),
 'undo_operation_id',CASE WHEN EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor AND role='owner') THEN
 (SELECT o.id FROM public.budget_operations o WHERE o.tenant_id=p_tenant AND o.after_state->>'plan_id'=p_plan::text AND o.after_state->>'plan_version'=plan.version::text AND o.outcome->>'source_revision'=v::text AND o.action<>'undo' AND NOT EXISTS(SELECT 1 FROM public.budget_operations u WHERE u.undo_of=o.id) LIMIT 1) ELSE NULL END,
 'source_revision',v::text,'plan_version',plan.version::text) INTO answer;
 -- JSON numbers must never cross the exact-cent boundary (including derived reserve totals).
 IF EXISTS(SELECT 1 FROM jsonb_path_query(answer,'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
 RETURN answer;
END $$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.budget_details_m4_before_controls(uuid,uuid,uuid,uuid,bigint,bigint)','EXECUTE') OR has_function_privilege('authenticated','public.budget_details_m4_before_controls(uuid,uuid,uuid,uuid,bigint,bigint)','EXECUTE') OR NOT has_function_privilege('service_role','public.budget_details_m4_before_controls(uuid,uuid,uuid,uuid,bigint,bigint)','EXECUTE') THEN RAISE EXCEPTION 'Budget grouped claim grant leak';END IF;
END $$;
