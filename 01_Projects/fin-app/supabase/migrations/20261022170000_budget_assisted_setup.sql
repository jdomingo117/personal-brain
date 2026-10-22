-- M6 production assisted setup. Suggestions are read-only, deterministic and
-- derived from complete canonical periods. They never create or activate a plan.

CREATE FUNCTION public.budget_median_cents(p_values bigint[]) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE values_sorted bigint[]; n integer; total numeric;
BEGIN
  SELECT array_agg(v ORDER BY v) INTO values_sorted FROM unnest(p_values) v;
  n:=coalesce(array_length(values_sorted,1),0);
  IF n=0 THEN RETURN NULL;END IF;
  IF n%2=1 THEN RETURN values_sorted[(n+1)/2];END IF;
  total:=values_sorted[n/2]::numeric+values_sorted[n/2+1]::numeric;
  IF total>18014398509481982 THEN RAISE EXCEPTION 'budget_overflow';END IF;
  RETURN floor((total+1)/2)::bigint;
END $$;

CREATE FUNCTION public.budget_assisted_setup(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE
  source_v bigint; frequency text; start_on date; anchor_on date; account_ids uuid[];
  account_count integer; bad_accounts jsonb; missing_ranges jsonb; periods jsonb; recurring jsonb;
  period_count integer; integrity_ok boolean; expense_values bigint[]; income_values bigint[];
  everyday bigint; income_amount bigint; bills bigint; first_on date; result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
  source_v:=public.budget_lock_source(p_tenant);
  frequency:=p_input->>'frequency';
  IF frequency NOT IN('monthly','fortnightly') THEN RAISE EXCEPTION 'budget_invalid_frequency';END IF;
  BEGIN start_on:=(p_input->>'start_date')::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'budget_invalid_date';END;
  BEGIN anchor_on:=coalesce(nullif(p_input->>'anchor','')::date,start_on); EXCEPTION WHEN others THEN RAISE EXCEPTION 'budget_invalid_date';END;
  SELECT coalesce(array_agg(DISTINCT value::uuid),ARRAY[]::uuid[]) INTO account_ids
  FROM jsonb_array_elements_text(coalesce(p_input->'account_ids','[]'::jsonb));
  account_count:=coalesce(array_length(account_ids,1),0);
  IF account_count>100 THEN RAISE EXCEPTION 'budget_invalid_accounts';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',x.id,'reason',CASE WHEN a.id IS NULL THEN 'unavailable' ELSE 'unsupported_currency' END) ORDER BY x.id),'[]')
  INTO bad_accounts FROM unnest(account_ids) x(id) LEFT JOIN public.accounts a ON a.id=x.id AND a.tenant_id=p_tenant WHERE a.id IS NULL OR a.currency<>'AUD';
  IF jsonb_array_length(bad_accounts)>0 THEN
    RETURN jsonb_build_object('method','budget-assist-v1','source_revision',source_v::text,'frequency',frequency,'start_date',start_on,'anchor',anchor_on,
      'account_ids',to_jsonb(account_ids),'account_count',account_count,'invalid_accounts',bad_accounts,'missing_coverage','[]'::jsonb,'periods','[]'::jsonb,'period_count',0,
      'integrity_ok',true,'eligible',false,'suggestions',jsonb_build_object('income_cents',0,'everyday_cents',0,'bills_cents',0),'recurring','[]'::jsonb,'variable',false,
      'fingerprint',encode(extensions.digest(source_v::text||':'||p_input::text||':invalid-scope','sha256'),'hex'));
  END IF;

  CREATE TEMP TABLE assist_periods(start_date date,end_date date,label text,covered boolean,expense_cents bigint,recurring_expense_cents bigint,income_cents bigint) ON COMMIT DROP;
  CREATE TEMP TABLE assist_recurring(id uuid,account_id uuid,merchant_key text,cadence text,expected_amount bigint,next_expected date) ON COMMIT DROP;
  INSERT INTO assist_recurring
    SELECT r.id,r.account_id,r.merchant_key,r.cadence_override,r.expected_amount_override,r.next_expected_override
    FROM public.recurring_series_overrides r WHERE r.tenant_id=p_tenant AND r.account_id=ANY(account_ids) AND r.state='active'
      AND r.cadence_override IS NOT NULL AND r.expected_amount_override IS NOT NULL AND r.next_expected_override IS NOT NULL;
  IF frequency='monthly' THEN
    INSERT INTO assist_periods(start_date,end_date,label,covered,expense_cents,recurring_expense_cents,income_cents)
    SELECT d,(d+interval '1 month')::date,to_char(d,'YYYY-MM'),false,0,0,0
    FROM generate_series((date_trunc('month',start_on)-interval '6 months')::date,(date_trunc('month',start_on)-interval '1 month')::date,interval '1 month') d;
  ELSE
    INSERT INTO assist_periods(start_date,end_date,label,covered,expense_cents,recurring_expense_cents,income_cents)
    SELECT d,d+14,to_char(d,'YYYY-MM-DD')||' / '||to_char(d+13,'YYYY-MM-DD'),false,0,0,0
    FROM (
      SELECT anchor_on+(14*n) d FROM generate_series(floor((start_on-anchor_on)/14.0)::int-16,floor((start_on-anchor_on)/14.0)::int) n
    ) p WHERE d+14<=start_on AND d>=start_on-interval '7 months' ORDER BY d DESC LIMIT 14;
  END IF;

  UPDATE assist_periods p SET covered=account_count>0 AND NOT EXISTS(
    SELECT 1 FROM unnest(account_ids) x(account_id) WHERE NOT coalesce((
      SELECT range_agg(daterange(c.start_date,c.end_date,'[)')) @> daterange(p.start_date,p.end_date,'[)')
      FROM public.account_activity_coverage c WHERE c.tenant_id=p_tenant AND c.account_id=x.account_id AND c.revoked_at IS NULL
    ),false)
  ) WHERE true;

  first_on:=coalesce((SELECT min(start_date) FROM assist_periods),start_on);
  SELECT NOT EXISTS(
    SELECT 1 FROM public.transactions_analytic t WHERE t.tenant_id=p_tenant AND t.account_id=ANY(account_ids)
    AND t.date>=first_on AND t.date<start_on AND t.transfer_candidate AND t.transfer_state IN('unmatched','suggested')
  ) INTO integrity_ok;

  WITH reporting AS MATERIALIZED (
    SELECT t.date,t.account_id,t.merchant_key,coalesce(a.amount,t.amount)::bigint amount,coalesce(a.kind,t.kind) kind,t.kind_source,t.transfer_state,t.is_transfer,t.pending
    FROM public.transactions_analytic t
    LEFT JOIN public.transaction_allocations a ON a.transaction_id=t.id AND a.tenant_id=t.tenant_id
    WHERE t.tenant_id=p_tenant AND t.account_id=ANY(account_ids) AND t.date>=first_on AND t.date<start_on
  ), effective AS MATERIALIZED (
    SELECT *,CASE WHEN kind='transfer' AND kind_source='derived' AND transfer_state='rejected' THEN CASE WHEN amount>=0 THEN 'income' ELSE 'expense' END ELSE kind END effective_kind FROM reporting
  ), sums AS (
    SELECT p.start_date,
      coalesce(sum(CASE WHEN NOT e.pending AND NOT e.is_transfer AND e.effective_kind='expense' THEN greatest(-e.amount,0) WHEN NOT e.pending AND NOT e.is_transfer AND e.effective_kind IN('refund','reimbursement') THEN -greatest(e.amount,0) ELSE 0 END),0)::bigint expense,
      coalesce(sum(CASE WHEN EXISTS(SELECT 1 FROM assist_recurring r WHERE r.account_id=e.account_id AND r.merchant_key=e.merchant_key)
        THEN CASE WHEN NOT e.pending AND NOT e.is_transfer AND e.effective_kind='expense' THEN greatest(-e.amount,0) WHEN NOT e.pending AND NOT e.is_transfer AND e.effective_kind IN('refund','reimbursement') THEN -greatest(e.amount,0) ELSE 0 END ELSE 0 END),0)::bigint recurring_expense,
      coalesce(sum(CASE WHEN NOT e.pending AND NOT e.is_transfer AND e.effective_kind='income' THEN greatest(e.amount,0) ELSE 0 END),0)::bigint income
    FROM assist_periods p LEFT JOIN effective e ON e.date>=p.start_date AND e.date<p.end_date GROUP BY p.start_date
  ) UPDATE assist_periods p SET expense_cents=s.expense,recurring_expense_cents=s.recurring_expense,income_cents=s.income FROM sums s WHERE s.start_date=p.start_date;

  SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',x.account_id,'start_date',p.start_date,'end_date',p.end_date) ORDER BY p.start_date,x.account_id),'[]')
  INTO missing_ranges FROM assist_periods p CROSS JOIN unnest(account_ids) x(account_id)
  WHERE NOT coalesce((SELECT range_agg(daterange(c.start_date,c.end_date,'[)')) @> daterange(p.start_date,p.end_date,'[)') FROM public.account_activity_coverage c
    WHERE c.tenant_id=p_tenant AND c.account_id=x.account_id AND c.revoked_at IS NULL),false);

  SELECT count(*),array_agg(greatest(0,expense_cents-recurring_expense_cents) ORDER BY start_date),array_agg(income_cents ORDER BY start_date),
    coalesce(jsonb_agg(jsonb_build_object('start_date',start_date,'end_date',end_date,'label',label,'expense_cents',expense_cents,'recurring_expense_cents',recurring_expense_cents,'everyday_cents',greatest(0,expense_cents-recurring_expense_cents),'income_cents',income_cents) ORDER BY start_date),'[]')
  INTO period_count,expense_values,income_values,periods FROM assist_periods WHERE covered;
  everyday:=public.budget_median_cents(expense_values);
  income_amount:=public.budget_median_cents(income_values);

  WITH target AS (
    SELECT CASE WHEN frequency='monthly' THEN date_trunc('month',start_on)::date ELSE anchor_on+(14*floor((start_on-anchor_on)/14.0)::int) END s
  ), amounts AS (
    SELECT c.*,coalesce((SELECT count(*) FROM public.budget_occurrence_dates(c.next_expected,
      CASE c.cadence WHEN 'Weekly' THEN 'weekly' WHEN 'Biweekly' THEN 'fortnightly' WHEN 'Monthly' THEN 'monthly' WHEN 'Quarterly' THEN 'quarterly' ELSE 'annual' END,
      t.s,CASE WHEN frequency='monthly' THEN (t.s+interval '1 month')::date ELSE t.s+14 END)),0)*c.expected_amount amount_cents
    FROM assist_recurring c CROSS JOIN target t
  ) SELECT coalesce(sum(amount_cents),0)::bigint,
    coalesce(jsonb_agg(jsonb_build_object('id',id,'account_id',account_id,'merchant_key',merchant_key,'cadence',cadence,'amount_cents',expected_amount,'next_date',next_expected,'period_cents',amount_cents) ORDER BY id),'[]')
  INTO bills,recurring FROM amounts;

  IF coalesce(everyday,0)>9007199254740991 OR coalesce(income_amount,0)>9007199254740991 OR coalesce(bills,0)>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
  result:=jsonb_build_object(
    'method','budget-assist-v1','source_revision',source_v::text,'frequency',frequency,'start_date',start_on,'anchor',anchor_on,
    'account_ids',to_jsonb(account_ids),'account_count',account_count,'invalid_accounts',bad_accounts,'missing_coverage',missing_ranges,
    'periods',periods,'period_count',period_count,'integrity_ok',integrity_ok,
    'eligible',jsonb_array_length(bad_accounts)=0 AND integrity_ok AND CASE WHEN frequency='monthly' THEN period_count>=3 ELSE period_count>=6 END,
    'suggestions',CASE WHEN jsonb_array_length(bad_accounts)>0 THEN jsonb_build_object('income_cents',0,'everyday_cents',0,'bills_cents',0)
      ELSE jsonb_build_object('income_cents',coalesce(income_amount,0),'everyday_cents',coalesce(everyday,0),'bills_cents',coalesce(bills,0)) END,
    'recurring',recurring,'variable',CASE WHEN period_count=0 OR everyday IS NULL THEN false ELSE
      ((SELECT max(greatest(0,expense_cents-recurring_expense_cents))-min(greatest(0,expense_cents-recurring_expense_cents)) FROM assist_periods WHERE covered)::numeric/greatest(everyday,100))>1 END,
    'fingerprint',encode(extensions.digest(source_v::text||':'||p_input::text||':'||coalesce(periods::text,'[]')||':'||coalesce(recurring::text,'[]'),'sha256'),'hex')
  );
  RETURN result;
END $$;

-- Assisted provenance is resumable draft metadata. It is validated separately
-- from the established setup shape and never grants write authority.
CREATE FUNCTION public.budget_assistance_metadata(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a jsonb:=p_payload->'assistance'; item jsonb; goal jsonb;
BEGIN
  IF a IS NULL THEN RETURN NULL;END IF;
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(a) k WHERE k NOT IN('method','fingerprint','source_revision','manual','periods','provenance','goal_intent'))
    OR a->>'method'<>'budget-assist-v1' OR coalesce(a->>'fingerprint','')!~'^[a-f0-9]{64}$' OR coalesce(a->>'source_revision','')!~'^(0|[1-9][0-9]*)$'
    OR jsonb_typeof(a->'manual') IS DISTINCT FROM 'boolean' OR jsonb_typeof(a->'periods') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'periods') NOT BETWEEN 1 AND 14
    OR jsonb_typeof(a->'provenance') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_each(a->'provenance') p WHERE jsonb_typeof(p.value)<>'string' OR char_length(p.value#>>'{}') NOT BETWEEN 1 AND 80)
    THEN RAISE EXCEPTION 'budget_invalid_assistance';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(a->'periods') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('start_date','end_date'))
      OR coalesce(item->>'start_date','')!~'^\d{4}-\d{2}-\d{2}$' OR coalesce(item->>'end_date','')!~'^\d{4}-\d{2}-\d{2}$'
      OR (item->>'start_date')::date >= (item->>'end_date')::date THEN RAISE EXCEPTION 'budget_invalid_assistance';END IF;
  END LOOP;
  goal:=a->'goal_intent';
  IF goal IS NOT NULL THEN
    IF jsonb_typeof(goal) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(goal) k WHERE k NOT IN('line_id','name','target_cents','needed_by'))
      OR coalesce(goal->>'line_id','')!~'^[0-9a-fA-F-]{36}$' OR char_length(trim(coalesce(goal->>'name',''))) NOT BETWEEN 1 AND 60
      OR (goal->'target_cents'<>'null'::jsonb AND public.budget_money(goal->'target_cents')<=0)
      OR (goal->>'needed_by' IS NOT NULL AND coalesce(goal->>'needed_by','')!~'^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'budget_invalid_assistance';END IF;
    PERFORM (goal->>'line_id')::uuid;
    IF goal->>'needed_by' IS NOT NULL THEN PERFORM (goal->>'needed_by')::date;END IF;
  END IF;
  RETURN a;
END $$;

ALTER FUNCTION public.budget_validate_setup(uuid,jsonb) RENAME TO budget_validate_setup_before_assistance;
CREATE FUNCTION public.budget_validate_setup(p_tenant uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM public.budget_assistance_metadata(p_payload);
  RETURN public.budget_validate_setup_before_assistance(p_tenant,p_payload-'assistance');
END $$;

-- Activation remains the existing atomic command. Once it succeeds, preserve
-- an explicitly entered assisted goal as the matching M4 goal/reserve intent.
ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_before_assistance;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE payload jsonb; meta jsonb; goal jsonb; answer jsonb; v_plan_id uuid; v_period_id uuid; v_line_id uuid; allocation bigint; plan public.budget_plans%ROWTYPE; period public.budget_periods%ROWTYPE;
BEGIN
  IF p_input->>'action'='activate' THEN
    SELECT r.payload INTO payload FROM public.budget_drafts d JOIN public.budget_draft_revisions r ON r.draft_id=d.id AND r.version=d.version WHERE d.tenant_id=p_tenant;
    meta:=public.budget_assistance_metadata(payload);
    IF meta IS NOT NULL AND NOT (meta->>'manual')::boolean AND meta->>'source_revision' IS DISTINCT FROM p_input->>'expected_source' THEN RAISE EXCEPTION 'budget_stale_assistance';END IF;
  END IF;
  answer:=public.budget_command_before_assistance(p_tenant,p_actor,p_request,p_input,p_enabled);
  goal:=meta->'goal_intent';
  IF p_input->>'action'='activate' AND goal IS NOT NULL THEN
    v_plan_id:=(answer->'result'->>'plan_id')::uuid;v_period_id:=(answer->'result'->>'period_id')::uuid;v_line_id:=(goal->>'line_id')::uuid;
    SELECT p.* INTO plan FROM public.budget_plans p WHERE p.id=v_plan_id AND p.tenant_id=p_tenant;
    SELECT p.* INTO period FROM public.budget_periods p WHERE p.id=v_period_id AND p.plan_id=v_plan_id AND p.tenant_id=p_tenant;
    SELECT a.amount_cents INTO allocation FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id AND l.plan_id=v_plan_id
      WHERE a.revision_id=period.current_revision_id AND a.line_id=v_line_id AND l.kind='reserve' AND l.name=goal->>'name';
    IF plan.id IS NULL OR period.id IS NULL OR allocation IS NULL OR allocation<=0 THEN RAISE EXCEPTION 'budget_invalid_assistance';END IF;
    INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id)
    VALUES(p_tenant,v_plan_id,v_line_id,v_period_id,plan.version,jsonb_build_object(
      'type',CASE WHEN goal->'target_cents'='null'::jsonb THEN 'reserve' ELSE 'goal' END,'name',goal->>'name','target_cents',goal->'target_cents','estimated',true,
      'due_date',goal->'needed_by','cadence',plan.frequency,'anchor',period.start_date,'amount_cents',allocation,'state','saving',
      'recurring_id',NULL,'planning_goal_id',NULL,'featured',false,'schedule_id',gen_random_uuid()),p_actor)
    ON CONFLICT(line_id,version) DO NOTHING;
  END IF;
  RETURN answer;
END $$;

REVOKE ALL ON FUNCTION public.budget_median_cents(bigint[]),public.budget_assisted_setup(uuid,uuid,jsonb),public.budget_assistance_metadata(jsonb),public.budget_validate_setup(uuid,jsonb),public.budget_validate_setup_before_assistance(uuid,jsonb),public.budget_command(uuid,uuid,uuid,jsonb,boolean),public.budget_command_before_assistance(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_median_cents(bigint[]),public.budget_assisted_setup(uuid,uuid,jsonb),public.budget_assistance_metadata(jsonb),public.budget_validate_setup(uuid,jsonb),public.budget_validate_setup_before_assistance(uuid,jsonb),public.budget_command(uuid,uuid,uuid,jsonb,boolean),public.budget_command_before_assistance(uuid,uuid,uuid,jsonb,boolean) TO service_role;

DO $$ BEGIN
  IF has_function_privilege('anon','public.budget_assisted_setup(uuid,uuid,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.budget_assisted_setup(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Budget assistance grant leak';END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    AND (left(c.relname,7)='budget_' OR c.relname='account_activity_coverage') AND c.relkind='r' AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'Budget RLS missing';END IF;
END $$;
