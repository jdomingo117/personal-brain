-- R03: complete target-period usage evidence for safe draft changes.
-- Keep existing canonical sums, money/date semantics and write boundaries intact.

CREATE OR REPLACE FUNCTION public.budget_assisted_setup(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE
  target_start date; target_end date; as_of date; zone text; target_covered boolean; target_integrity boolean; settled bigint;
  source_v bigint; frequency text; start_on date; anchor_on date; account_ids uuid[];
  account_count integer; bad_accounts jsonb; missing_ranges jsonb; periods jsonb; recurring jsonb;
  period_count integer; calendar_month_count integer; calendar_months jsonb; integrity_ok boolean; expense_values bigint[]; income_values bigint[];
  everyday bigint; income_amount bigint; bills bigint; first_on date; result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor) THEN RAISE EXCEPTION 'budget_forbidden';END IF;
  source_v:=public.budget_lock_source(p_tenant);
  frequency:=p_input->>'frequency';
  IF frequency NOT IN('monthly','fortnightly') THEN RAISE EXCEPTION 'budget_invalid_frequency';END IF;
  BEGIN start_on:=(p_input->>'start_date')::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'budget_invalid_date';END;
  BEGIN anchor_on:=coalesce(nullif(p_input->>'anchor','')::date,start_on); EXCEPTION WHEN others THEN RAISE EXCEPTION 'budget_invalid_date';END;
  zone:=coalesce(p_input->>'timezone','Australia/Sydney');
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'budget_invalid_timezone';END IF;
  as_of:=(now() AT TIME ZONE zone)::date;
  target_start:=CASE WHEN frequency='monthly' THEN date_trunc('month',start_on)::date ELSE anchor_on+14*floor((start_on-anchor_on)/14.0)::int END;
  target_end:=CASE WHEN frequency='monthly' THEN (target_start+interval '1 month')::date ELSE target_start+14 END;
  SELECT coalesce(array_agg(DISTINCT value::uuid),ARRAY[]::uuid[]) INTO account_ids
  FROM jsonb_array_elements_text(coalesce(p_input->'account_ids','[]'::jsonb));
  account_count:=coalesce(array_length(account_ids,1),0);
  IF account_count>100 THEN RAISE EXCEPTION 'budget_invalid_accounts';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',x.id,'reason',CASE WHEN a.id IS NULL THEN 'unavailable' ELSE 'unsupported_currency' END) ORDER BY x.id),'[]')
  INTO bad_accounts FROM unnest(account_ids) x(id) LEFT JOIN public.accounts a ON a.id=x.id AND a.tenant_id=p_tenant WHERE a.id IS NULL OR a.currency<>'AUD';
  IF jsonb_array_length(bad_accounts)>0 THEN
    RETURN jsonb_build_object('method','budget-assist-v1','source_revision',source_v::text,'frequency',frequency,'start_date',start_on,'anchor',anchor_on,
      'account_ids',to_jsonb(account_ids),'account_count',account_count,'invalid_accounts',bad_accounts,'missing_coverage','[]'::jsonb,'periods','[]'::jsonb,'period_count',0,'calendar_month_count',0,'calendar_months','[]'::jsonb,
      'integrity_ok',true,'eligible',false,'suggestions',jsonb_build_object('income_cents',0,'everyday_cents',0,'bills_cents',0),'recurring','[]'::jsonb,'variable',false,
      'fingerprint',encode(extensions.digest(source_v::text||':'||p_input::text||':invalid-scope','sha256'),'hex'));
  END IF;

  -- G03: calendar evidence is independent of the chosen 14-day anchor.
  -- Use the same request-relative six complete months as monthly assistance.
  WITH months AS (
    SELECT d::date start_date,(d+interval '1 month')::date end_date
    FROM generate_series((date_trunc('month',start_on)-interval '6 months')::date,
      (date_trunc('month',start_on)-interval '1 month')::date,interval '1 month') d
  ), covered AS (
    SELECT m.* FROM months m WHERE account_count>0 AND NOT EXISTS(
      SELECT 1 FROM unnest(account_ids) x(account_id) WHERE NOT coalesce((
        SELECT range_agg(daterange(c.start_date,c.end_date,'[)')) @> daterange(m.start_date,m.end_date,'[)')
        FROM public.account_activity_coverage c
        WHERE c.tenant_id=p_tenant AND c.account_id=x.account_id AND c.revoked_at IS NULL
      ),false)
    )
  ) SELECT count(*),coalesce(jsonb_agg(jsonb_build_object('start_date',start_date,'end_date',end_date) ORDER BY start_date),'[]'::jsonb)
  INTO calendar_month_count,calendar_months FROM covered;

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

  -- Complete canonical target-window reads, never the truncated frontend feed.
  -- Future windows need explicit user intent in the client; unknown current usage is null.
  target_covered:=account_count>0 AND NOT EXISTS(
    SELECT 1 FROM unnest(account_ids) x(account_id) WHERE NOT coalesce((
      SELECT range_agg(daterange(c.start_date,c.end_date,'[)')) @> daterange(target_start,greatest(target_start,least(target_end,as_of+1)),'[)')
      FROM public.account_activity_coverage c WHERE c.tenant_id=p_tenant AND c.account_id=x.account_id AND c.revoked_at IS NULL
    ),false)
  );
  IF target_start>as_of THEN target_covered:=false;END IF;
  SELECT NOT EXISTS(SELECT 1 FROM public.transactions_analytic t WHERE t.tenant_id=p_tenant AND t.account_id=ANY(account_ids)
    AND t.date>=target_start AND t.date<target_end AND t.date<=as_of AND t.transfer_candidate AND t.transfer_state IN('unmatched','suggested')) INTO target_integrity;
  WITH reporting AS (
    SELECT t.*,coalesce(a.amount,t.amount)::bigint effective_amount,coalesce(a.kind,t.kind) allocated_kind
    FROM public.transactions_analytic t LEFT JOIN public.transaction_allocations a ON a.transaction_id=t.id AND a.tenant_id=t.tenant_id
    WHERE t.tenant_id=p_tenant AND t.account_id=ANY(account_ids) AND t.date>=target_start AND t.date<target_end AND t.date<=as_of
  ), effective AS (
    SELECT *,CASE WHEN allocated_kind='transfer' AND kind_source='derived' AND transfer_state='rejected'
      THEN CASE WHEN effective_amount>=0 THEN 'income' ELSE 'expense' END ELSE allocated_kind END effective_kind FROM reporting
  ) SELECT coalesce(sum(CASE WHEN NOT pending AND NOT is_transfer AND NOT EXISTS(
      SELECT 1 FROM assist_recurring r WHERE r.account_id=e.account_id AND r.merchant_key=e.merchant_key)
    THEN CASE WHEN effective_kind='expense' THEN greatest(-effective_amount,0) WHEN effective_kind IN('refund','reimbursement') THEN -greatest(effective_amount,0) ELSE 0 END ELSE 0 END),0)::bigint INTO settled FROM effective e;
  IF abs(settled::numeric)>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;

  IF coalesce(everyday,0)>9007199254740991 OR coalesce(income_amount,0)>9007199254740991 OR coalesce(bills,0)>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
  result:=jsonb_build_object(
    'method','budget-assist-v1','source_revision',source_v::text,'frequency',frequency,'start_date',start_on,'anchor',anchor_on,
    'account_ids',to_jsonb(account_ids),'account_count',account_count,'invalid_accounts',bad_accounts,'missing_coverage',missing_ranges,
    'target',jsonb_build_object('start_date',target_start,'end_date',target_end,'as_of',as_of,'timezone',zone,'coverage_complete',target_covered,'integrity_ok',target_integrity,'settled_everyday_cents',CASE WHEN target_covered AND target_integrity THEN settled ELSE NULL END),
    'periods',periods,'period_count',period_count,'calendar_month_count',calendar_month_count,'calendar_months',calendar_months,'integrity_ok',integrity_ok,
    'eligible',jsonb_array_length(bad_accounts)=0 AND integrity_ok AND calendar_month_count>=3 AND CASE WHEN frequency='monthly' THEN period_count>=3 ELSE period_count>=6 END,
    'suggestions',CASE WHEN jsonb_array_length(bad_accounts)>0 THEN jsonb_build_object('income_cents',0,'everyday_cents',0,'bills_cents',0)
      ELSE jsonb_build_object('income_cents',coalesce(income_amount,0),'everyday_cents',coalesce(everyday,0),'bills_cents',coalesce(bills,0)) END,
    'recurring',recurring,'variable',CASE WHEN period_count=0 OR everyday IS NULL THEN false ELSE
      ((SELECT max(greatest(0,expense_cents-recurring_expense_cents))-min(greatest(0,expense_cents-recurring_expense_cents)) FROM assist_periods WHERE covered)::numeric/greatest(everyday,100))>1 END,
    'fingerprint',encode(extensions.digest(source_v::text||':'||p_input::text||':'||coalesce(periods::text,'[]')||':'||coalesce(recurring::text,'[]')||':calendar-gate:'||calendar_months::text||':target:'||target_start::text||':'||as_of::text||':'||target_covered::text||':'||target_integrity::text||':'||settled::text,'sha256'),'hex')
  );
  RETURN result;
END $$;

-- CREATE OR REPLACE preserves the established service-only ACL.
REVOKE ALL ON FUNCTION public.budget_assisted_setup(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_assisted_setup(uuid,uuid,jsonb) TO service_role;
