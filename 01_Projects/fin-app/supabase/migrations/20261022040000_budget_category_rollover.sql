-- Prospective category/Other policy. History is append-only; the latest event
-- contains the complete effective timeline, so compensation never erases intent.
CREATE TABLE public.budget_rollover_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,plan_id uuid NOT NULL,period_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0),action text NOT NULL CHECK(action IN('saved','undo')),
 timeline jsonb NOT NULL CHECK(jsonb_typeof(timeline)='array'),impact jsonb NOT NULL,
 source_revision bigint NOT NULL,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(plan_id,version),
 FOREIGN KEY(tenant_id,plan_id,period_id) REFERENCES public.budget_periods(tenant_id,plan_id,id) ON DELETE CASCADE
);
CREATE INDEX budget_rollover_policy_history ON public.budget_rollover_policies(plan_id,version DESC);
ALTER TABLE public.budget_rollover_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_rollover_policies FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.budget_rollover_policies TO authenticated;
GRANT SELECT,INSERT,DELETE ON public.budget_rollover_policies TO service_role;
CREATE POLICY budget_member_read ON public.budget_rollover_policies FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id));
CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.budget_rollover_policies FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_history();

CREATE FUNCTION public.budget_rollover_at(p_plan uuid,p_date date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT x FROM (SELECT timeline FROM public.budget_rollover_policies WHERE plan_id=p_plan ORDER BY version DESC LIMIT 1) e,
 jsonb_array_elements(e.timeline) x WHERE (x->>'from')::date<=p_date ORDER BY x->>'from' DESC LIMIT 1
$$;

-- The same dated partition is installed for ordinary, hypothetical and frequency
-- periods. Never rely on a browser or old-period copy to pick future categories.
CREATE FUNCTION public.budget_apply_rollover_limits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy jsonb;p public.budget_periods%ROWTYPE;total numeric;pool numeric;BEGIN
 SELECT * INTO p FROM public.budget_periods WHERE id=NEW.period_id AND plan_id=NEW.plan_id AND tenant_id=NEW.tenant_id;
 policy:=public.budget_rollover_at(NEW.plan_id,p.start_date);
 IF policy IS NOT NULL THEN
  NEW.payload:=policy->'limits';
  SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(NEW.payload) x;
  SELECT a.amount_cents INTO pool FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id=p.current_revision_id AND l.kind='everyday';
  IF pool IS NULL OR total>pool THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER budget_dated_rollover_limits BEFORE INSERT ON public.budget_limit_revisions FOR EACH ROW EXECUTE FUNCTION public.budget_apply_rollover_limits();

-- Server-only complete-chain accounting. Each closing cent goes to exactly one
-- next partition, protected bucket or recorded released variance. Transfers use
-- the previous closing state simultaneously, never sequentially cascading.
CREATE FUNCTION public.budget_partition_chain(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET statement_timeout='8s' AS $$
DECLARE p record;d jsonb;s jsonb;r record;policy jsonb;previous jsonb:='{}';held jsonb:='{}';incoming jsonb;nextheld jsonb;closing jsonb;parts jsonb;flows jsonb;
 x jsonb;rule jsonb;k text;target text;amount numeric;priorheld numeric;raw numeric;total numeric;opening numeric;released numeric;mode text;valid boolean:=true;previous_mode text:='fresh';enabled boolean:=false;BEGIN
 -- Base details independently verifies membership, source and plan revisions.
 FOR p IN SELECT * FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=p_plan AND start_date<=(SELECT start_date FROM public.budget_periods WHERE id=p_period AND plan_id=p_plan) ORDER BY start_date LOOP
  d:=public.budget_details_m4(p_tenant,p_actor,p_plan,p.id,p_source,p_version);
  s:=public.budget_query_m4(p_tenant,p_actor,jsonb_build_object('action','snapshot','plan_id',p_plan,'period_id',p.id));
  valid:=valid AND (s->>'scope_valid')::boolean;
  policy:=public.budget_rollover_at(p_plan,p.start_date);enabled:=policy IS NOT NULL;
  incoming:='{}';nextheld:='{}';flows:='[]';released:=0;
  IF enabled THEN
   FOR k IN SELECT key FROM jsonb_each(previous||held) LOOP
    SELECT value INTO rule FROM jsonb_array_elements(policy->'rules') WHERE value->>'id'=k;
    IF rule IS NULL THEN RAISE EXCEPTION 'budget_invalid_rollover_mapping';END IF;
    amount:=coalesce((previous->>k)::numeric,0)+coalesce((held->>k)::numeric,0);
    mode:=rule->>'mode';target:=CASE WHEN mode='carry' THEN k ELSE rule->>'target' END;
    IF mode='retain' THEN
     -- A late correction may turn a previously positive remainder negative.
     -- Keep savings nonnegative; the signed shortfall reduces Other instead.
     priorheld:=coalesce((held->>k)::numeric,0);raw:=coalesce((previous->>k)::numeric,0);
     nextheld:=jsonb_set(nextheld,ARRAY[k],to_jsonb(priorheld+greatest(raw,0)));
     IF raw<0 THEN incoming:=jsonb_set(incoming,ARRAY['other'],to_jsonb(coalesce((incoming->>'other')::numeric,0)+raw));target:='other';END IF;
    ELSIF mode='release' THEN released:=released+amount;
    ELSE
     IF target<>'other' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'limits') l WHERE l->>'id'=target) THEN RAISE EXCEPTION 'budget_invalid_rollover_target';END IF;
     incoming:=jsonb_set(incoming,ARRAY[target],to_jsonb(coalesce((incoming->>target)::numeric,0)+amount));
    END IF;
    flows:=flows||jsonb_build_array(jsonb_build_object('id',k,'mode',mode,'target',target,'amount_cents',CASE WHEN valid THEN to_jsonb(amount) ELSE 'null'::jsonb END,
     'period_balance_cents',CASE WHEN valid THEN to_jsonb(coalesce((previous->>k)::numeric,0)) ELSE 'null'::jsonb END,
     'previous_protected_cents',CASE WHEN valid THEN to_jsonb(coalesce((held->>k)::numeric,0)) ELSE 'null'::jsonb END,
     'protected_cents',CASE WHEN valid AND mode='retain' THEN nextheld->k ELSE 'null'::jsonb END,
     'shortfall_cents',CASE WHEN valid AND mode='retain' THEN to_jsonb(least(coalesce((previous->>k)::numeric,0),0)) ELSE 'null'::jsonb END));
   END LOOP;
  ELSIF previous_mode='carry' THEN
   SELECT coalesce(sum(value::text::numeric),0) INTO amount FROM jsonb_each(previous);
   incoming:=jsonb_build_object('other',amount);
  END IF;
  held:=nextheld;closing:='{}';parts:='[]';opening:=0;total:=0;
  FOR x IN SELECT value FROM jsonb_array_elements(d->'limits') UNION ALL SELECT jsonb_build_object('id','other','amount_cents',d->'other_flexible_cents','used_cents',d->'other_flexible_used_cents') LOOP
   k:=x->>'id';amount:=coalesce((incoming->>k)::numeric,0);raw:=(x->>'amount_cents')::numeric-(x->>'used_cents')::numeric;
   closing:=jsonb_set(closing,ARRAY[k],to_jsonb(amount+raw));opening:=opening+amount;total:=total+amount+raw;
   parts:=parts||jsonb_build_array(x||jsonb_build_object('opening_carry_cents',CASE WHEN valid THEN to_jsonb(amount) ELSE 'null'::jsonb END,'remaining_cents',CASE WHEN valid THEN to_jsonb(amount+raw) ELSE 'null'::jsonb END));
  END LOOP;
  SELECT carry_mode INTO previous_mode FROM public.budget_period_reviews WHERE period_id=p.id ORDER BY version DESC LIMIT 1;previous_mode:=coalesce(previous_mode,'fresh');
  IF EXISTS(SELECT 1 FROM jsonb_path_query(jsonb_build_object('closing',closing,'protected',held,'opening',incoming,'flows',flows,'released',released,'opening_total',opening,'closing_total',total,'held_total',(SELECT coalesce(sum(value::text::numeric),0) FROM jsonb_each(held))),'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
  previous:=closing;
 END LOOP;
 IF d IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT coalesce(sum(value::text::numeric),0) INTO priorheld FROM jsonb_each(held);
 RETURN jsonb_build_object('enabled',enabled,'policy',policy,'parts',parts,'protected',CASE WHEN valid THEN held ELSE 'null'::jsonb END,
  'protected_cents',CASE WHEN valid THEN to_jsonb(priorheld) ELSE 'null'::jsonb END,'released_variance_cents',CASE WHEN valid THEN to_jsonb(released) ELSE 'null'::jsonb END,
  'flows',flows,'opening_carry_cents',CASE WHEN valid THEN to_jsonb(opening) ELSE 'null'::jsonb END,'closing_cents',CASE WHEN valid THEN to_jsonb(total) ELSE 'null'::jsonb END);
END $$;

-- Keep the established lifecycle/review protocol, but bind reviewed evidence and
-- derived pool totals to the partition chain once a dated policy takes effect.
ALTER FUNCTION public.budget_lifecycle(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_lifecycle_pool;
CREATE FUNCTION public.budget_lifecycle(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l jsonb;c jsonb;facts jsonb;BEGIN
 l:=public.budget_lifecycle_pool(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 c:=public.budget_partition_chain(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 IF (c->>'enabled')::boolean THEN
  facts:=(l->'facts')||jsonb_build_object('opening_carry_cents',c->'opening_carry_cents','closing_everyday_cents',c->'closing_cents','rollover',c);
  l:=l||jsonb_build_object('facts',facts,'changed_since_review',l->'review'<>'null'::jsonb AND ((l->'review'->>'source_revision')::bigint<>p_source OR l->'review'->'payload' IS DISTINCT FROM facts));
 END IF;
 RETURN l;
END $$;

ALTER FUNCTION public.budget_details(uuid,uuid,uuid,uuid,bigint,bigint) RENAME TO budget_details_accounts;
CREATE FUNCTION public.budget_details(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d jsonb;c jsonb;policy jsonb;x jsonb;limit_total numeric;pool numeric;BEGIN
 d:=public.budget_details_accounts(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 c:=public.budget_partition_chain(p_tenant,p_actor,p_plan,p_period,p_source,p_version);
 SELECT coalesce(sum(public.budget_money(value->'amount_cents')),0) INTO limit_total FROM jsonb_array_elements(d->'limits');
 SELECT (value->>'planned_cents')::numeric INTO pool FROM jsonb_array_elements(d->'items') WHERE value->>'kind'='everyday';
 IF limit_total>pool THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
 IF (c->>'enabled')::boolean THEN
  d:=d||jsonb_build_object('limits',(SELECT coalesce(jsonb_agg(value),'[]') FROM jsonb_array_elements(c->'parts') WHERE value->>'id'<>'other'),
   'other_opening_carry_cents',(SELECT value->'opening_carry_cents' FROM jsonb_array_elements(c->'parts') WHERE value->>'id'='other'),
   'other_flexible_remaining_cents',(SELECT value->'remaining_cents' FROM jsonb_array_elements(c->'parts') WHERE value->>'id'='other'));
 END IF;
 SELECT jsonb_build_object('id',id,'version',version::text,'action',action,'timeline',timeline) INTO policy FROM public.budget_rollover_policies WHERE tenant_id=p_tenant AND plan_id=p_plan ORDER BY version DESC LIMIT 1;
 d:=d||jsonb_build_object('rollover',c,'rollover_policy',policy);
 IF EXISTS(SELECT 1 FROM jsonb_path_query(d,'$.** ? (@.type() == "number")') n WHERE abs(n::text::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
 RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.budget_scope_facts(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d jsonb;l jsonb;BEGIN
 d:=public.budget_details(p_tenant,p_actor,p_plan,p_period,p_source,p_version);l:=d->'lifecycle';
 RETURN jsonb_build_object('key',p_key,'start_date',l->'facts'->'start_date','end_date',l->'facts'->'end_date',
 'actuals',l->'facts'->'actuals','scope_valid',l->'facts'->'scope_valid','coverage_complete',l->'facts'->'coverage_complete',
 'opening_carry_cents',l->'facts'->'opening_carry_cents','closing_everyday_cents',l->'facts'->'closing_everyday_cents',
 'provisional_carry',l->'provisional_carry','changed_since_review',l->'changed_since_review','rollover',d->'rollover',
 'excluded_cents',d->'excluded_cents','unassigned_credit_cents',d->'unassigned_credit_cents','limits',d->'limits',
 'items',d->'items','claims',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x->'id','valid',x->'valid','amount_cents',x->'amount_cents','purpose',x->'purpose') ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(d->'claims') x));
END $$;

CREATE FUNCTION public.budget_preview_rollover(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;plan public.budget_plans%ROWTYPE;p public.budget_periods%ROWTYPE;timeline jsonb;entry jsonb;before_facts jsonb;after_facts jsonb;answer jsonb;oldlimits jsonb;known jsonb;identities jsonb;rule jsonb;item jsonb;total numeric;pool numeric;BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(p_input->>'plan_id')::uuid AND state='active';
 SELECT * INTO p FROM public.budget_periods WHERE plan_id=plan.id AND id=(p_input->>'period_id')::uuid;
 IF plan.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 IF EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=plan.id AND start_date>p.start_date) THEN RAISE EXCEPTION 'budget_historical_readonly';END IF;
 IF EXISTS(SELECT 1 FROM (SELECT state FROM public.budget_frequency_changes WHERE plan_id=plan.id ORDER BY version DESC LIMIT 1) f WHERE state='pending') THEN RAISE EXCEPTION 'budget_frequency_pending';END IF;
 IF jsonb_typeof(p_input->'limits') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'limits')>50 OR jsonb_typeof(p_input->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'rules')>200 THEN RAISE EXCEPTION 'budget_invalid_rollover';END IF;
 SELECT coalesce(public.budget_rollover_at(plan.id,p.start_date)->'limits',(SELECT payload FROM public.budget_limit_revisions WHERE period_id=p.id ORDER BY version DESC LIMIT 1),'[]'::jsonb) INTO oldlimits;
 SELECT coalesce(e.timeline,'[]') INTO timeline FROM public.budget_rollover_policies e WHERE plan_id=plan.id ORDER BY version DESC LIMIT 1;timeline:=coalesce(timeline,'[]');
 FOR item IN SELECT value FROM jsonb_array_elements(p_input->'limits') LOOP
  PERFORM (item->>'id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.taxonomy_categories WHERE id=item->>'category_id' AND active AND classification='expense') THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
  IF item->>'subcategory_id' IS NOT NULL AND (item->>'custom_subcategory_id' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.taxonomy_subcategories WHERE id=item->>'subcategory_id' AND category_id=item->>'category_id' AND active)) THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
  IF item->>'custom_subcategory_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_subcategories WHERE id=(item->>'custom_subcategory_id')::uuid AND tenant_id=p_tenant AND category_id=item->>'category_id' AND active) THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_input->'limits') y WHERE y->>'category_id'=item->>'category_id' AND ((y->>'subcategory_id' IS NULL AND y->>'custom_subcategory_id' IS NULL) OR (item->>'subcategory_id' IS NULL AND item->>'custom_subcategory_id' IS NULL) OR y->>'subcategory_id'=item->>'subcategory_id' OR y->>'custom_subcategory_id'=item->>'custom_subcategory_id'))>1 THEN RAISE EXCEPTION 'budget_invalid_overlap';END IF;
  IF EXISTS(SELECT 1 FROM (
   SELECT value o FROM public.budget_limit_revisions history_limits,jsonb_array_elements(history_limits.payload) WHERE history_limits.plan_id=plan.id
   UNION ALL SELECT l FROM public.budget_rollover_policies history_policy,jsonb_array_elements(history_policy.timeline) e,jsonb_array_elements(e->'limits') l WHERE history_policy.plan_id=plan.id
  ) history WHERE o->>'id'=item->>'id' AND (o-'amount_cents') IS DISTINCT FROM (item-'amount_cents')) THEN RAISE EXCEPTION 'budget_invalid_rollover_mapping';END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_input->'limits'))<>jsonb_array_length(p_input->'limits') THEN RAISE EXCEPTION 'budget_invalid_rollover';END IF;
 -- Include removed identities and held rights from earlier policies: no orphan.
 SELECT jsonb_agg(DISTINCT id) INTO known FROM (
  SELECT 'other' id UNION SELECT value->>'id' FROM jsonb_array_elements(oldlimits) UNION SELECT value->>'id' FROM jsonb_array_elements(p_input->'limits')
  UNION SELECT r->>'id' FROM jsonb_array_elements(timeline) e,jsonb_array_elements(e->'rules') r
 ) ids;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_input->'rules'))<>jsonb_array_length(p_input->'rules') OR jsonb_array_length(p_input->'rules')<>jsonb_array_length(known) THEN RAISE EXCEPTION 'budget_invalid_rollover_mapping';END IF;
 FOR rule IN SELECT value FROM jsonb_array_elements(p_input->'rules') LOOP
  IF NOT known ? (rule->>'id') OR rule->>'mode' NOT IN('carry','retain','release','transfer') OR rule->>'mode' IS NULL THEN RAISE EXCEPTION 'budget_invalid_rollover_mapping';END IF;
  IF rule->>'mode'='carry' AND rule->>'id'<>'other' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'limits') x WHERE x->>'id'=rule->>'id') THEN RAISE EXCEPTION 'budget_invalid_rollover_target';END IF;
  IF rule->>'mode'='transfer' THEN
   IF rule->>'target' IS NULL OR rule->>'target'=rule->>'id' OR (rule->>'target'<>'other' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'limits') x WHERE x->>'id'=rule->>'target')) THEN RAISE EXCEPTION 'budget_invalid_rollover_target';END IF;
  ELSIF rule->>'target' IS NOT NULL THEN RAISE EXCEPTION 'budget_invalid_rollover_target';END IF;
 END LOOP;
 SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(p_input->'limits') x;
 SELECT a.amount_cents INTO pool FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id=plan.template_revision_id AND l.kind='everyday';
 IF total>pool THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
 -- A removed partition still needs a human-readable identity after the next
 -- period opens. Keep server-owned scope/label snapshots alongside its route.
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'),'[]') INTO identities FROM (
  SELECT DISTINCT ON(value->>'id') value FROM jsonb_array_elements(oldlimits||(p_input->'limits')||coalesce((
   SELECT jsonb_agg(v ORDER BY e->>'from',v->>'id') FROM jsonb_array_elements(timeline) e,jsonb_array_elements(coalesce(e->'identities','[]'::jsonb)||(e->'limits')) v
  ),'[]'::jsonb)) WITH ORDINALITY AS registry_row(value,ordinal) ORDER BY value->>'id',ordinal
 ) registry;
 SELECT coalesce(jsonb_agg(value||jsonb_build_object('label',coalesce(value->>'label',(
  SELECT c.display_name||CASE WHEN value->>'subcategory_id' IS NOT NULL THEN ' / '||coalesce((SELECT display_name FROM public.taxonomy_subcategories WHERE id=value->>'subcategory_id'),value->>'subcategory_id')
   WHEN value->>'custom_subcategory_id' IS NOT NULL THEN ' / '||coalesce((SELECT display_name FROM public.tenant_subcategories WHERE id=(value->>'custom_subcategory_id')::uuid AND tenant_id=p_tenant),value->>'custom_subcategory_id') ELSE '' END
  FROM public.taxonomy_categories c WHERE c.id=value->>'category_id'
 ),value->>'category_id')) ORDER BY value->>'id'),'[]') INTO identities FROM jsonb_array_elements(identities);
 entry:=jsonb_build_object('from',p.end_date,'limits',p_input->'limits','rules',p_input->'rules','identities',identities);
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'from'),'[]') INTO timeline FROM jsonb_array_elements(timeline) WHERE (value->>'from')::date<p.end_date;
 timeline:=timeline||jsonb_build_array(entry);
 before_facts:=public.budget_scope_impact(p_tenant,p_actor,plan.id,source,plan.version);
 BEGIN
  INSERT INTO public.budget_rollover_policies(tenant_id,plan_id,period_id,version,action,timeline,impact,source_revision,actor_id) VALUES(p_tenant,plan.id,p.id,plan.version+1,'saved',timeline,'{}',source,p_actor);
  after_facts:=public.budget_scope_impact(p_tenant,p_actor,plan.id,source,plan.version);
  RAISE SQLSTATE 'P0004' USING MESSAGE='budget_preview_rollback';
 EXCEPTION WHEN assert_failure THEN IF SQLERRM<>'budget_preview_rollback' THEN RAISE;END IF;END;
 answer:=jsonb_build_object('effective_from',p.end_date,'timeline',timeline,'before',before_facts,'after',after_facts,'source_revision',source::text,'plan_version',plan.version::text,'limits',p_input->'limits','rules',p_input->'rules');
 RETURN answer||jsonb_build_object('preview_hash',encode(extensions.digest(answer::text,'sha256'),'hex'));
END $$;

ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_accounts;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;plan public.budget_plans%ROWTYPE;preview jsonb;timeline jsonb;before_timeline jsonb;pid uuid;new_v bigint;op uuid:=gen_random_uuid();after_data jsonb;receipt jsonb;compensation uuid;current_limits jsonb;BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF p_input->>'action'='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF p_input->>'action'<>'set_rollover' AND NOT(p_input->>'action'='undo' AND original.action='set_rollover') THEN
  -- Prevent legacy removal/remapping and review carry from bypassing the dated
  -- policy. Amount-only current-period edits remain possible before its start.
  IF p_enabled AND p_input->>'action' IN('set_limits','save_review') AND EXISTS(SELECT 1 FROM public.budget_rollover_policies e WHERE e.plan_id=(p_input->>'plan_id')::uuid AND e.version=(SELECT max(v.version) FROM public.budget_rollover_policies v WHERE v.plan_id=e.plan_id) AND jsonb_array_length(e.timeline)>0) THEN
   IF p_input->>'action'='save_review' AND p_input->>'carry_mode'<>'fresh' AND public.budget_rollover_at((p_input->>'plan_id')::uuid,(SELECT end_date FROM public.budget_periods WHERE id=(p_input->>'period_id')::uuid AND tenant_id=p_tenant)) IS NOT NULL THEN RAISE EXCEPTION 'budget_invalid_policy_review';END IF;
   IF p_input->>'action'='set_limits' THEN RAISE EXCEPTION 'budget_invalid_policy_limits';END IF;
  END IF;
  receipt:=public.budget_command_accounts(p_tenant,p_actor,p_request,p_input,p_enabled);
  -- A later allowance/frequency/item edit must not commit a future partition
  -- that exceeds its new-resource pool. Validate the complete next window too.
  IF EXISTS(SELECT 1 FROM public.budget_rollover_policies e WHERE e.plan_id=(receipt->'result'->>'plan_id')::uuid AND e.version=(SELECT max(v.version) FROM public.budget_rollover_policies v WHERE v.plan_id=e.plan_id) AND jsonb_array_length(e.timeline)>0) THEN
   PERFORM public.budget_scope_impact(p_tenant,p_actor,(receipt->'result'->>'plan_id')::uuid,source,(receipt->'result'->>'plan_version')::bigint);
  END IF;
  RETURN receipt;
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 IF p_input->>'action'='undo' THEN
  SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(original.after_state->>'plan_id')::uuid AND state='active' FOR UPDATE;
  IF plan.id IS NULL OR plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR source IS DISTINCT FROM (original.outcome->>'source_revision')::bigint OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  pid:=(original.after_state->>'period_id')::uuid;compensation:=original.id;timeline:=original.before_state->'timeline';preview:=original.before_state->'preview';
  preview:=(preview-'preview_hash')||jsonb_build_object('before',preview->'after','after',preview->'before');
 ELSE
  preview:=public.budget_preview_rollover(p_tenant,p_actor,p_input);
  IF p_input->>'preview_hash' IS DISTINCT FROM preview->>'preview_hash' THEN RAISE EXCEPTION 'budget_stale_preview';END IF;
  IF p_input->'accept_impact' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_input->'accept_incomplete') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_scope_acceptance';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(preview->'after') x WHERE NOT (x->>'scope_valid')::boolean OR NOT (x->>'coverage_complete')::boolean) AND NOT (p_input->>'accept_incomplete')::boolean THEN RAISE EXCEPTION 'budget_invalid_incomplete_review';END IF;
  SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=(p_input->>'plan_id')::uuid FOR UPDATE;
  pid:=(p_input->>'period_id')::uuid;timeline:=preview->'timeline';
 END IF;
 SELECT coalesce(e.timeline,'[]') INTO before_timeline FROM public.budget_rollover_policies e WHERE plan_id=plan.id ORDER BY version DESC LIMIT 1;before_timeline:=coalesce(before_timeline,'[]');new_v:=plan.version+1;
 INSERT INTO public.budget_rollover_policies(tenant_id,plan_id,period_id,version,action,timeline,impact,source_revision,actor_id) VALUES(p_tenant,plan.id,pid,new_v,CASE WHEN compensation IS NULL THEN 'saved' ELSE 'undo' END,timeline,preview,source,p_actor);
 UPDATE public.budget_plans SET version=new_v WHERE id=plan.id;
 PERFORM public.budget_scope_impact(p_tenant,p_actor,plan.id,source,new_v);
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',pid,'plan_version',new_v::text);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of) VALUES(op,p_tenant,p_actor,p_request,hash,p_input->>'action',jsonb_build_object('timeline',before_timeline,'preview',preview),after_data,receipt,compensation);
 RETURN receipt;
END $$;


-- Rebase the established reads/opening/frequency adapters on the same dated
-- partition resolver. All existing ownership, receipt and lifecycle guards stay.
CREATE OR REPLACE FUNCTION public.budget_details_m4(p_tenant uuid,p_actor uuid,p_plan uuid,p_period uuid,p_source bigint,p_version bigint) RETURNS jsonb
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
 activity AS MATERIALIZED (SELECT * FROM public.budget_activity(p_tenant,p_plan,period.start_date,period.end_date)),
 config AS (SELECT DISTINCT ON(r.line_id) r.line_id,r.id,r.payload FROM public.budget_item_revisions r JOIN public.budget_periods p ON p.id=r.period_id WHERE r.plan_id=p_plan AND p.start_date<=period.start_date ORDER BY r.line_id,r.version DESC),
 facts AS (
 SELECT l.*,c.id item_revision,c.payload config,a.amount_cents planned_cents,
 coalesce((SELECT sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FROM claims x WHERE x.valid AND x.line_id=l.id AND x.purpose IN('expense','purchase','refund') AND x.source_date>=period.start_date AND x.source_date<period.end_date),0) period_used,
 coalesce((SELECT sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FROM claims x WHERE x.valid AND x.line_id=l.id AND x.purpose IN('expense','purchase','refund') AND x.source_date>=l.opening_date AND x.source_date<period.end_date),0) lifetime_used,
 coalesce((SELECT sum(b.amount_cents) FROM public.budget_allocations b JOIN public.budget_periods p ON p.current_revision_id=b.revision_id WHERE b.line_id=l.id AND p.end_date<=period.end_date),0) allocated_to_date,
 coalesce((SELECT sum(CASE WHEN m.to_line_id=l.id THEN m.amount_cents ELSE -m.amount_cents END) FROM public.budget_reserve_moves m WHERE m.plan_id=p_plan AND (m.to_line_id=l.id OR m.from_line_id=l.id) AND m.effective_date<period.end_date AND (l.kind='reserve' OR m.effective_date>=period.start_date)),0) reallocated,
 coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.line_id=l.id AND x.purpose='funding' AND x.source_date<period.end_date AND x.provenance='bank-observed'),0) bank_confirmed,
 coalesce((SELECT sum(x.amount_cents) FROM claims x WHERE x.valid AND x.line_id=l.id AND x.purpose='funding' AND x.source_date<period.end_date AND x.provenance='user-confirmed'),0) user_confirmed
 FROM public.budget_lines l JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=period.current_revision_id LEFT JOIN config c ON c.line_id=l.id WHERE l.plan_id=p_plan AND NOT coalesce((c.payload->>'voided')::boolean,false)
 ), residual AS (
 SELECT a.*,a.capacity-coalesce((SELECT sum(x.amount_cents) FROM claims x LEFT JOIN public.budget_lines l ON l.id=x.line_id WHERE x.valid AND x.source_key=a.source_key AND x.purpose<>'funding' AND (x.purpose='exclude' OR l.kind<>'everyday')),0) amount FROM activity a
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
 'net_purchases_cents',coalesce((SELECT sum(CASE WHEN x.purpose='refund' THEN -x.amount_cents ELSE x.amount_cents END) FROM claims x WHERE x.valid AND x.line_id=f.id AND (x.purpose='purchase' OR (x.purpose='refund' AND EXISTS(SELECT 1 FROM claims p WHERE p.id=x.related_claim_id AND p.purpose='purchase'))) AND x.source_date<period.end_date),0),
 'bank_confirmed_cents',f.bank_confirmed,'user_confirmed_cents',f.user_confirmed,
 'changed_claims',(SELECT count(*) FROM claims x WHERE NOT x.valid AND x.line_id=f.id),
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

CREATE OR REPLACE FUNCTION public.budget_command_lifecycle(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE v bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;
 plan public.budget_plans%ROWTYPE;period public.budget_periods%ROWTYPE;review public.budget_period_reviews%ROWTYPE;
 template public.budget_revisions%ROWTYPE;lifecycle jsonb;payload jsonb;before_data jsonb;after_data jsonb;receipt jsonb;limits jsonb;
 action text:=p_input->>'action';new_v bigint;op uuid:=gen_random_uuid();pid uuid;rid uuid;mode text;state text;
 accepted boolean;asof date;compensation uuid;pool bigint;total numeric;
BEGIN
 v:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF action='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF action NOT IN('save_review','reopen_review','open_next_period') AND NOT(action='undo' AND original.action IN('save_review','reopen_review')) THEN
  IF action='undo' AND original.action='open_next_period' THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  IF action IN('move_allocation','release_reserve') AND p_enabled THEN
   lifecycle:=public.budget_lifecycle(p_tenant,p_actor,(p_input->>'plan_id')::uuid,(p_input->>'period_id')::uuid,(p_input->>'expected_source')::bigint,(p_input->>'expected_plan')::bigint);
   IF NOT (lifecycle->>'chain_valid')::boolean THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
   IF action='move_allocation' AND EXISTS(SELECT 1 FROM public.budget_lines l WHERE l.id=(p_input->>'from_line_id')::uuid AND l.tenant_id=p_tenant AND l.kind='everyday')
    AND public.budget_money(p_input->'amount_cents')>greatest(0,(lifecycle->'facts'->>'closing_everyday_cents')::numeric) THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  END IF;
  RETURN public.budget_command_m4(p_tenant,p_actor,p_request,p_input,p_enabled);
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM v THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT b.* INTO plan FROM public.budget_plans b WHERE b.tenant_id=p_tenant AND b.id=CASE WHEN action='undo' THEN (original.after_state->>'plan_id')::uuid ELSE (p_input->>'plan_id')::uuid END AND b.state='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF action='undo' THEN
  IF plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR v IS DISTINCT FROM (original.outcome->>'source_revision')::bigint
   OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
 ELSE IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;END IF;
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=CASE WHEN action='undo' THEN (original.after_state->>'period_id')::uuid ELSE (p_input->>'period_id')::uuid END;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 asof:=(now() AT TIME ZONE plan.timezone)::date;
 IF period.end_date>asof THEN RAISE EXCEPTION 'budget_invalid_unfinished_period';END IF;
 lifecycle:=public.budget_lifecycle(p_tenant,p_actor,plan.id,period.id,v,plan.version);
 IF NOT (lifecycle->>'chain_valid')::boolean THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
 new_v:=plan.version+1;pid:=period.id;
 SELECT * INTO review FROM public.budget_period_reviews WHERE period_id=period.id ORDER BY version DESC LIMIT 1;
 before_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'review',CASE WHEN review.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(review) END);
 IF action='open_next_period' THEN
  IF NOT (lifecycle->>'is_latest')::boolean THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
  -- One contiguous saved period per explicit operation. No invented historical
  -- windows, repeating opening drawdown, mandatory review or hidden scheduler.
  pid:=gen_random_uuid();
  INSERT INTO public.budget_periods(id,tenant_id,plan_id,start_date,end_date,timezone,frequency)
  VALUES(pid,p_tenant,plan.id,period.end_date,CASE WHEN period.frequency='monthly' THEN (period.end_date+interval '1 month')::date ELSE period.end_date+14 END,period.timezone,period.frequency);
  IF jsonb_typeof(p_input->'accept_gap') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_command';END IF;
  rid:=public.budget_write_revision(p_tenant,plan.id,pid,new_v,v,public.budget_money(p_input->'income_cents'),0,p_input->'lines',(p_input->>'accept_gap')::boolean);
  UPDATE public.budget_periods SET activated_revision_id=rid,current_revision_id=rid WHERE id=pid;
  SELECT coalesce(public.budget_rollover_at(plan.id,period.end_date)->'limits',(SELECT r.payload FROM public.budget_limit_revisions r WHERE r.period_id=period.id ORDER BY version DESC LIMIT 1)) INTO limits;
  IF limits IS NOT NULL THEN
   SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(limits) x;
   SELECT (x->>'amount_cents')::bigint INTO pool FROM jsonb_array_elements(p_input->'lines') x JOIN public.budget_lines l ON l.id=(x->>'line_id')::uuid WHERE l.kind='everyday';
   IF total>pool THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
   INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,pid,new_v,limits,p_actor);
  END IF;
 ELSE
  IF action='save_review' THEN
   mode:=p_input->>'carry_mode';state:='reviewed';accepted:=(p_input->>'accept_incomplete')::boolean;
   IF mode NOT IN('fresh','carry') OR mode IS NULL OR jsonb_typeof(p_input->'accept_incomplete') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_review';END IF;
   IF (NOT coalesce((lifecycle->'facts'->>'coverage_complete')::boolean,false) OR NOT EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=plan.id AND m.role='activity' AND m.start_date<period.end_date AND (m.end_date IS NULL OR m.end_date>period.start_date))) AND NOT accepted THEN RAISE EXCEPTION 'budget_invalid_incomplete_review';END IF;
   payload:=lifecycle->'facts';
  ELSIF action='reopen_review' THEN
   IF review.id IS NULL OR review.state<>'reviewed' THEN RAISE EXCEPTION 'budget_invalid_review';END IF;
   mode:=review.carry_mode;state:='reopened';accepted:=review.accepted_incomplete;payload:=review.payload;
  ELSE
   compensation:=original.id;
   payload:=original.before_state->'review';
   mode:=coalesce(payload->>'carry_mode','fresh');state:=coalesce(payload->>'state','reopened');accepted:=coalesce((payload->>'accepted_incomplete')::boolean,false);
   payload:=CASE WHEN payload='null'::jsonb THEN lifecycle->'facts' ELSE payload->'payload' END;
  END IF;
  INSERT INTO public.budget_period_reviews(tenant_id,plan_id,period_id,version,state,carry_mode,payload,source_revision,accepted_incomplete,actor_id)
  VALUES(p_tenant,plan.id,pid,new_v,state,mode,payload,v,accepted,p_actor);
 END IF;
 UPDATE public.budget_plans SET version=new_v WHERE id=plan.id;
 -- Recompute through the newest saved period before commit. Earlier review
 -- choices must not commit a later overflow or unreadable carry chain.
 PERFORM public.budget_details(p_tenant,p_actor,plan.id,p.id,v,new_v) FROM public.budget_periods p WHERE p.plan_id=plan.id ORDER BY p.start_date DESC LIMIT 1;
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',pid,'plan_version',new_v::text);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',v::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of)
 VALUES(op,p_tenant,p_actor,p_request,hash,action,before_data,after_data,receipt,compensation);
 RETURN receipt;
END $$;

CREATE OR REPLACE FUNCTION public.budget_command_frequency(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source bigint;hash text;prior public.budget_operations%ROWTYPE;original public.budget_operations%ROWTYPE;
 plan public.budget_plans%ROWTYPE;period public.budget_periods%ROWTYPE;change public.budget_frequency_changes%ROWTYPE;restore public.budget_frequency_changes%ROWTYPE;
 action text:=p_input->>'action';new_v bigint;op uuid:=gen_random_uuid();pid uuid;rid uuid;tid uuid;cid uuid;initial_end date;full_end date;asof date;
 frequency text;limits jsonb;basis jsonb;before_data jsonb;after_data jsonb;receipt jsonb;compensation uuid;total numeric;pool bigint;initial uuid;continuing uuid;
BEGIN
 source:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 SELECT * INTO prior FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF prior.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN prior.outcome;END IF;
 IF action='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF action NOT IN('schedule_frequency','cancel_frequency','apply_frequency') AND NOT(action='undo' AND original.action IN('schedule_frequency','cancel_frequency')) THEN
  IF p_enabled AND action='undo' AND original.action='apply_frequency' THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  -- UI read-only is not an authorization boundary. Once a later period exists,
  -- earlier financial plans/assignments cannot be silently rewritten by an RPC.
  -- Reviews remain explicitly editable and source corrections live in Ledger.
  IF p_enabled AND action IN('revise','save_item','claim_source','confirm_funding','reverse_claim','set_limits','move_allocation','release_reserve') THEN
   IF EXISTS(SELECT 1 FROM public.budget_periods p JOIN public.budget_periods n ON n.plan_id=p.plan_id AND n.start_date>p.start_date
    WHERE p.tenant_id=p_tenant AND p.plan_id=(p_input->>'plan_id')::uuid AND p.id=(p_input->>'period_id')::uuid) THEN RAISE EXCEPTION 'budget_historical_readonly';END IF;
  END IF;
  IF p_enabled AND action='open_next_period' AND EXISTS(SELECT 1 FROM (
    SELECT state FROM public.budget_frequency_changes WHERE tenant_id=p_tenant AND plan_id=(p_input->>'plan_id')::uuid ORDER BY version DESC LIMIT 1
   ) c WHERE state='pending') THEN RAISE EXCEPTION 'budget_frequency_pending';END IF;
  RETURN public.budget_command_lifecycle(p_tenant,p_actor,p_request,p_input,p_enabled);
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF (p_input->>'expected_source')::bigint IS DISTINCT FROM source THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=CASE WHEN action='undo' THEN (original.after_state->>'plan_id')::uuid ELSE (p_input->>'plan_id')::uuid END AND state='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF action='undo' THEN
  IF plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR source IS DISTINCT FROM (original.outcome->>'source_revision')::bigint
   OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
 ELSE IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;END IF;
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=CASE WHEN action='undo' THEN (original.after_state->>'period_id')::uuid ELSE (p_input->>'period_id')::uuid END;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT * INTO change FROM public.budget_frequency_changes WHERE tenant_id=p_tenant AND plan_id=plan.id ORDER BY version DESC LIMIT 1;
 new_v:=plan.version+1;pid:=period.id;asof:=(now() AT TIME ZONE plan.timezone)::date;
 before_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'frequency_event_id',change.id);
 IF action='schedule_frequency' THEN
  IF change.state='pending' THEN RAISE EXCEPTION 'budget_frequency_pending';END IF;
  IF period.end_date<=asof OR EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=plan.id AND start_date>period.start_date) THEN RAISE EXCEPTION 'budget_invalid_frequency_boundary';END IF;
  frequency:=p_input->>'frequency';
  IF frequency NOT IN('monthly','fortnightly') OR frequency IS NULL OR frequency=period.frequency THEN RAISE EXCEPTION 'budget_invalid_frequency';END IF;
  initial_end:=CASE WHEN frequency='monthly' THEN (date_trunc('month',period.end_date)+interval '1 month')::date ELSE period.end_date+14 END;
  full_end:=CASE WHEN frequency='monthly' THEN (initial_end+interval '1 month')::date ELSE initial_end+14 END;
  basis:=public.budget_details(p_tenant,p_actor,plan.id,period.id,source,plan.version);
  IF NOT (basis->'lifecycle'->>'chain_valid')::boolean THEN RAISE EXCEPTION 'budget_account_unavailable';END IF;
  IF jsonb_typeof(p_input->'accept_incomplete') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'keep_limits') IS DISTINCT FROM 'boolean' OR NOT (p_input->>'keep_limits')::boolean THEN RAISE EXCEPTION 'budget_invalid_command';END IF;
  IF NOT (basis->'lifecycle'->'facts'->>'coverage_complete')::boolean AND NOT (p_input->>'accept_incomplete')::boolean THEN RAISE EXCEPTION 'budget_invalid_incomplete_review';END IF;
  IF jsonb_typeof(p_input->'initial'->'accept_gap') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'continuing'->'accept_gap') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_command';END IF;
  initial:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source,public.budget_money(p_input->'initial'->'income_cents'),0,p_input->'initial'->'lines',(p_input->'initial'->>'accept_gap')::boolean);
  continuing:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source,public.budget_money(p_input->'continuing'->'income_cents'),0,p_input->'continuing'->'lines',(p_input->'continuing'->>'accept_gap')::boolean);
  SELECT coalesce(public.budget_rollover_at(plan.id,period.end_date)->'limits',(SELECT r.payload FROM public.budget_limit_revisions r WHERE period_id=period.id ORDER BY version DESC LIMIT 1),'[]'::jsonb) INTO limits;
  SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(limits) x;
  SELECT min(a.amount_cents) INTO pool FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id IN(initial,continuing) AND l.kind='everyday';
  IF total>pool THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
  cid:=gen_random_uuid();
  INSERT INTO public.budget_frequency_changes(change_id,tenant_id,plan_id,period_id,version,state,frequency,effective_date,initial_end,continuing_end,initial_revision_id,continuing_revision_id,source_revision,payload,actor_id)
  VALUES(cid,p_tenant,plan.id,period.id,new_v,'pending',frequency,period.end_date,initial_end,full_end,initial,continuing,source,
   jsonb_build_object('initial',p_input->'initial','continuing',p_input->'continuing','limits',limits,'accepted_incomplete',p_input->'accept_incomplete','reviewed_facts',basis->'lifecycle'->'facts'),p_actor);
 ELSE
  IF action='undo' THEN
   compensation:=original.id;
   IF original.action='cancel_frequency' THEN
    SELECT * INTO restore FROM public.budget_frequency_changes WHERE id=(original.before_state->>'frequency_event_id')::uuid AND tenant_id=p_tenant;
    IF restore.id IS NULL OR restore.state<>'pending' OR restore.effective_date<=asof OR restore.source_revision<>source
     OR restore.version<>(original.after_state->>'plan_version')::bigint-1 THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
    change:=restore;
   END IF;
  END IF;
  IF change.id IS NULL OR change.state<>'pending' THEN RAISE EXCEPTION 'budget_frequency_not_pending';END IF;
  IF action='apply_frequency' THEN
   IF change.period_id<>period.id OR period.end_date>asof THEN RAISE EXCEPTION 'budget_invalid_frequency_boundary';END IF;
   IF change.version<>plan.version OR change.source_revision<>source THEN RAISE EXCEPTION 'budget_frequency_needs_review';END IF;
   IF EXISTS(SELECT 1 FROM public.budget_periods WHERE plan_id=plan.id AND start_date>=change.effective_date) THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
   pid:=gen_random_uuid();
   INSERT INTO public.budget_periods(id,tenant_id,plan_id,start_date,end_date,timezone,frequency,transition)
   VALUES(pid,p_tenant,plan.id,change.effective_date,change.initial_end,period.timezone,change.frequency,change.frequency='monthly' AND extract(day FROM change.effective_date)>1);
   rid:=public.budget_write_revision(p_tenant,plan.id,pid,new_v,source,public.budget_money(change.payload->'initial'->'income_cents'),0,change.payload->'initial'->'lines',(change.payload->'initial'->>'accept_gap')::boolean);
   UPDATE public.budget_periods SET activated_revision_id=rid,current_revision_id=rid WHERE id=pid;
   tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source,public.budget_money(change.payload->'continuing'->'income_cents'),0,change.payload->'continuing'->'lines',(change.payload->'continuing'->>'accept_gap')::boolean);
   INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,pid,new_v,change.payload->'limits',p_actor);
   UPDATE public.budget_plans SET frequency=change.frequency,anchor=change.effective_date,template_revision_id=tid WHERE id=plan.id;
  END IF;
  INSERT INTO public.budget_frequency_changes(change_id,tenant_id,plan_id,period_id,version,state,frequency,effective_date,initial_end,continuing_end,initial_revision_id,continuing_revision_id,source_revision,payload,actor_id)
  VALUES(change.change_id,p_tenant,plan.id,change.period_id,new_v,CASE WHEN action='apply_frequency' THEN 'applied' WHEN action='undo' AND original.action='cancel_frequency' THEN 'pending' ELSE 'cancelled' END,
   change.frequency,change.effective_date,change.initial_end,change.continuing_end,change.initial_revision_id,change.continuing_revision_id,source,change.payload,p_actor);
 END IF;
 UPDATE public.budget_plans SET version=new_v WHERE id=plan.id;
 PERFORM public.budget_details(p_tenant,p_actor,plan.id,pid,source,new_v);
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',pid,'plan_version',new_v::text);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source::text,'method','budget-foundation-v1','result',after_data);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of)
 VALUES(op,p_tenant,p_actor,p_request,hash,action,before_data,after_data,receipt,compensation);
 RETURN receipt;
END $$;

DO $$ DECLARE f record;BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.budget_rollover_policies'::regclass)
 OR has_table_privilege('anon','public.budget_rollover_policies','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_table_privilege('authenticated','public.budget_rollover_policies','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'Budget rollover grant leak';END IF;
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,7)='budget_' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
