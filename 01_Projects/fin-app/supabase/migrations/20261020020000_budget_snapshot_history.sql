CREATE FUNCTION public.budget_query(p_tenant uuid,p_actor uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
SET lock_timeout='2s' SET statement_timeout='5s' AS $$
DECLARE source_v bigint; plan public.budget_plans%ROWTYPE; period public.budget_periods%ROWTYPE;
  rev public.budget_revisions%ROWTYPE; draft public.budget_drafts%ROWTYPE; draft_rev public.budget_draft_revisions%ROWTYPE;
  answer jsonb; actuals jsonb; scope_valid boolean; covered boolean; total numeric; allocations numeric; template jsonb;
BEGIN
  source_v:=public.budget_lock_source(p_tenant);
  PERFORM 1 FROM public.tenant_members WHERE tenant_id=p_tenant AND user_id=p_actor FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='budget_forbidden';END IF;
  IF p_input->>'action' IN('draft','operation') THEN
    PERFORM public.budget_assert_owner(p_tenant,p_actor);
    IF p_input->>'action'='operation' THEN
      SELECT outcome INTO answer FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=(p_input->>'request_id')::uuid;
      RETURN jsonb_build_object('outcome',answer,'source_revision',source_v::text,'method','budget-foundation-v1');
    END IF;
    SELECT * INTO draft FROM public.budget_drafts WHERE tenant_id=p_tenant;
    IF NOT FOUND THEN RETURN jsonb_build_object('draft',NULL,'draft_version','0','source_revision',source_v::text,'method','budget-foundation-v1');END IF;
    SELECT * INTO draft_rev FROM public.budget_draft_revisions WHERE draft_id=draft.id AND version=draft.version;
    RETURN jsonb_build_object('draft',draft_rev.payload,'draft_id',draft.id,'draft_version',draft.version::text,'source_revision',source_v::text,
      'draft_source_revision',draft_rev.source_revision::text,'draft_method',draft_rev.method,
      'method','budget-foundation-v1','stale',draft_rev.source_revision IS DISTINCT FROM source_v OR draft_rev.method IS DISTINCT FROM 'budget-foundation-v1');
  END IF;
  IF p_input->>'action' IS DISTINCT FROM 'snapshot' THEN RAISE EXCEPTION 'budget_invalid_action';END IF;
  SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND
    CASE WHEN p_input->>'plan_id' IS NULL THEN state='active' ELSE id=(p_input->>'plan_id')::uuid END;
  IF NOT FOUND THEN
    IF p_input->>'plan_id' IS NOT NULL OR p_input->>'period_id' IS NOT NULL THEN RAISE EXCEPTION 'budget_not_found';END IF;
    RETURN jsonb_build_object('plan',NULL,'source_revision',source_v::text,'method','budget-foundation-v1');
  END IF;
  SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id
    AND (p_input->>'period_id' IS NULL OR id=(p_input->>'period_id')::uuid) ORDER BY start_date DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
  SELECT * INTO rev FROM public.budget_revisions WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=period.current_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
  SELECT NOT EXISTS(SELECT 1 FROM public.budget_account_memberships m LEFT JOIN public.accounts a ON a.id=m.account_id AND a.tenant_id=m.tenant_id
    WHERE m.plan_id=plan.id AND m.start_date<period.end_date AND (m.end_date IS NULL OR m.end_date>period.start_date)
    AND (a.id IS NULL OR a.currency<>'AUD')) INTO scope_valid;
  SELECT NOT EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=plan.id AND m.role='activity'
    AND m.start_date<period.end_date AND (m.end_date IS NULL OR m.end_date>period.start_date)
    AND NOT coalesce((SELECT range_agg(daterange(c.start_date,c.end_date,'[)')) @> daterange(period.start_date,period.end_date,'[)')
      FROM public.account_activity_coverage c WHERE c.tenant_id=p_tenant AND c.account_id=m.account_id AND c.revoked_at IS NULL),false)) INTO covered;
  WITH reporting AS (
    SELECT coalesce(a.amount,t.amount)::bigint amount,coalesce(a.kind,t.kind) kind,t.kind_source,t.transfer_state,t.is_transfer,t.pending
    FROM public.transactions_analytic t
    LEFT JOIN public.transaction_allocations a ON a.transaction_id=t.id AND a.tenant_id=t.tenant_id
    WHERE t.tenant_id=p_tenant AND t.date>=period.start_date AND t.date<period.end_date
      AND EXISTS(SELECT 1 FROM public.budget_account_memberships m WHERE m.plan_id=plan.id AND m.tenant_id=p_tenant
        AND m.account_id=t.account_id AND m.role='activity' AND m.start_date<=t.date AND (m.end_date IS NULL OR m.end_date>t.date))
  ), effective AS (
    SELECT *,CASE WHEN kind='transfer' AND kind_source='derived' AND transfer_state='rejected' THEN CASE WHEN amount>=0 THEN 'income' ELSE 'expense' END ELSE kind END effective_kind FROM reporting
  ) SELECT jsonb_build_object(
    'gross_expense_cents',coalesce(sum(CASE WHEN NOT pending AND NOT is_transfer AND effective_kind='expense' THEN greatest(-amount,0) ELSE 0 END),0),
    'expense_credits_cents',coalesce(sum(CASE WHEN NOT pending AND NOT is_transfer AND effective_kind IN('refund','reimbursement') THEN greatest(amount,0) ELSE 0 END),0),
    'earned_income_cents',coalesce(sum(CASE WHEN NOT pending AND NOT is_transfer AND effective_kind='income' THEN greatest(amount,0) ELSE 0 END),0),
    'pending_signed_cents',coalesce(sum(CASE WHEN pending AND NOT is_transfer THEN amount ELSE 0 END),0),
    'reporting_rows',count(*)) INTO actuals FROM effective;
  IF EXISTS(SELECT 1 FROM jsonb_each_text(actuals) WHERE abs(value::numeric)>9007199254740991) THEN RAISE EXCEPTION 'budget_overflow';END IF;
  actuals:=actuals||jsonb_build_object('net_expense_cents',(actuals->>'gross_expense_cents')::numeric-(actuals->>'expense_credits_cents')::numeric);
  IF abs((actuals->>'net_expense_cents')::numeric)>9007199254740991 THEN RAISE EXCEPTION 'budget_overflow';END IF;
  SELECT sum(amount_cents) INTO allocations FROM public.budget_allocations WHERE revision_id=rev.id;
  total:=rev.income_cents::numeric+rev.drawdown_cents-allocations;
  SELECT jsonb_build_object('id',r.id,'version',r.version::text,'income_cents',r.income_cents,'opening_drawdown_cents',r.drawdown_cents,
    'unallocated_cents',r.income_cents::numeric+r.drawdown_cents-(SELECT sum(a.amount_cents) FROM public.budget_allocations a WHERE a.revision_id=r.id),
    'allocations',(SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',a.amount_cents) ORDER BY a.line_id) FROM public.budget_allocations a WHERE a.revision_id=r.id))
    INTO template FROM public.budget_revisions r WHERE r.id=plan.template_revision_id AND r.tenant_id=p_tenant AND r.plan_id=plan.id;
  RETURN jsonb_build_object('plan',to_jsonb(plan)-'version'||jsonb_build_object('version',plan.version::text),
    'period',period,'revision',to_jsonb(rev)-'version'-'source_revision'||jsonb_build_object('version',rev.version::text,'source_revision',rev.source_revision::text),
    'lines',(SELECT coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('allocation_cents',a.amount_cents) ORDER BY l.id),'[]')
      FROM public.budget_lines l JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=rev.id WHERE l.plan_id=plan.id),
    'source_revision',source_v::text,'method','budget-foundation-v1','generated_at',now(),
    'scope_valid',scope_valid,'coverage_complete',covered,'source_changed_since_plan',rev.source_revision<>source_v,
    'state',CASE WHEN scope_valid AND covered THEN 'fresh' ELSE 'incomplete' END,
    'actuals',CASE WHEN scope_valid THEN actuals ELSE NULL END,'unallocated_cents',total,'future_template',template);
END $$;

CREATE FUNCTION public.budget_validate_template_pointer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.budget_plans%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.budget_plans WHERE id=NEW.id;
  IF FOUND AND (p.template_revision_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.budget_revisions r
    WHERE r.id=p.template_revision_id AND r.tenant_id=p.tenant_id AND r.plan_id=p.id AND r.purpose='template')) THEN
    RAISE EXCEPTION 'budget_invalid_template';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER budget_template_semantics AFTER INSERT OR UPDATE ON public.budget_plans
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.budget_validate_template_pointer();

-- Append-only financial intent/outcomes, allowing actor anonymization on auth-user deletion.
CREATE FUNCTION public.budget_immutable_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF to_jsonb(NEW)-'actor_id' IS DISTINCT FROM to_jsonb(OLD)-'actor_id' THEN RAISE EXCEPTION 'budget_immutable_history';END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['budget_draft_revisions','budget_revisions','budget_lines','budget_allocations','budget_operations'] LOOP
    EXECUTE format('CREATE TRIGGER budget_history_immutable BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_history()',tbl);
    EXECUTE format('REVOKE UPDATE ON public.%I FROM service_role',tbl);
  END LOOP;
END $$;
CREATE FUNCTION public.budget_immutable_period() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF (to_jsonb(NEW)-'current_revision_id'-'activated_revision_id') IS DISTINCT FROM (to_jsonb(OLD)-'current_revision_id'-'activated_revision_id')
    OR (OLD.activated_revision_id IS NOT NULL AND NEW.activated_revision_id IS DISTINCT FROM OLD.activated_revision_id) THEN RAISE EXCEPTION 'budget_immutable_history';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER budget_period_immutable BEFORE UPDATE ON public.budget_periods FOR EACH ROW EXECUTE FUNCTION public.budget_immutable_period();
REVOKE ALL ON FUNCTION public.budget_query(uuid,uuid,jsonb),public.budget_immutable_history(),public.budget_validate_template_pointer(),public.budget_immutable_period() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_query(uuid,uuid,jsonb),public.budget_immutable_history(),public.budget_validate_template_pointer(),public.budget_immutable_period() TO service_role;
DO $$ BEGIN
  IF has_function_privilege('anon','public.budget_query(uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.budget_query(uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Budget query grant leak';END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    AND (left(c.relname,7)='budget_' OR c.relname='account_activity_coverage') AND c.relkind='r' AND NOT c.relrowsecurity) THEN RAISE EXCEPTION 'Budget RLS missing';END IF;
END $$;
