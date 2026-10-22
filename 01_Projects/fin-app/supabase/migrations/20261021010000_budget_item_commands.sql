-- Extend the established receipt boundary, retaining M2 commands and their audit history.
ALTER FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) RENAME TO budget_command_m2;
CREATE FUNCTION public.budget_command(p_tenant uuid,p_actor uuid,p_request uuid,p_input jsonb,p_enabled boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp
SET lock_timeout='2s' SET statement_timeout='8s' AS $$
DECLARE source_v bigint; hash text; previous public.budget_operations%ROWTYPE; original public.budget_operations%ROWTYPE;
 plan public.budget_plans%ROWTYPE; period public.budget_periods%ROWTYPE; line public.budget_lines%ROWTYPE;
 config public.budget_item_revisions%ROWTYPE; prior_config public.budget_item_revisions%ROWTYPE;
 claim public.budget_source_claims%ROWTYPE; parent public.budget_source_claims%ROWTYPE;
 rev public.budget_revisions%ROWTYPE; future public.budget_revisions%ROWTYPE;
 op uuid:=gen_random_uuid(); rid uuid; tid uuid; new_v bigint; lineid uuid; other uuid; amount bigint; future_amount bigint; current_amount bigint;
 payload jsonb; lines jsonb; future_lines jsonb; before_data jsonb:='{}'; after_data jsonb; receipt jsonb; result jsonb:='{}';
 src record; item jsonb; candidate jsonb; total numeric; claimed numeric; lim record; schedule_id uuid; compensation uuid;
 action text:=p_input->>'action'; gap boolean; scope text; creating boolean; oldamount bigint;
BEGIN
 source_v:=public.budget_lock_source(p_tenant);PERFORM public.budget_assert_owner(p_tenant,p_actor);
 hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');
 SELECT * INTO previous FROM public.budget_operations WHERE tenant_id=p_tenant AND request_id=p_request;
 IF FOUND THEN IF previous.payload_hash<>hash THEN RAISE EXCEPTION 'budget_request_conflict';END IF;RETURN previous.outcome;END IF;
 IF action='undo' THEN SELECT * INTO original FROM public.budget_operations WHERE tenant_id=p_tenant AND id=(p_input->>'operation_id')::uuid;END IF;
 IF action NOT IN('save_item','claim_source','confirm_funding','reverse_claim','set_limits','move_allocation','release_reserve') AND NOT(action='undo' AND original.action IN('save_item','claim_source','confirm_funding','reverse_claim','set_limits','move_allocation','release_reserve')) THEN
  receipt:=public.budget_command_m2(p_tenant,p_actor,p_request,p_input,p_enabled);
  IF action='revise' THEN
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'lines') x JOIN LATERAL(SELECT r.payload FROM public.budget_item_revisions r WHERE r.line_id=(x->>'line_id')::uuid ORDER BY r.version DESC LIMIT 1) c ON true
    WHERE (x->>'amount_cents')::numeric>0 AND (coalesce((c.payload->>'voided')::boolean,false) OR (p_input->>'scope'='period-and-future' AND c.payload->>'state' IN('paused','purchase-recorded','draft')))) THEN RAISE EXCEPTION 'budget_invalid_inactive_item';END IF;
   SELECT r.payload INTO candidate FROM public.budget_limit_revisions r WHERE r.period_id=(p_input->>'period_id')::uuid ORDER BY r.version DESC LIMIT 1;
   IF candidate IS NOT NULL THEN
    SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(candidate) x;
    SELECT (x->>'amount_cents')::bigint INTO current_amount FROM jsonb_array_elements(p_input->'lines') x JOIN public.budget_lines l ON l.id=(x->>'line_id')::uuid WHERE l.kind='everyday';
    IF total>current_amount THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
   END IF;
  END IF;
  IF receipt->'result'->>'period_id' IS NOT NULL AND EXISTS(SELECT 1 FROM public.budget_plans p WHERE p.id=(receipt->'result'->>'plan_id')::uuid AND p.state='active') THEN
   PERFORM public.budget_details(p_tenant,p_actor,(receipt->'result'->>'plan_id')::uuid,(receipt->'result'->>'period_id')::uuid,source_v,(receipt->'result'->>'plan_version')::bigint);
  END IF;
  RETURN receipt;
 END IF;
 IF p_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'budget_disabled';END IF;
 IF p_input->>'expected_method' IS DISTINCT FROM 'budget-foundation-v1' THEN RAISE EXCEPTION 'budget_stale_method';END IF;
 IF source_v IS DISTINCT FROM (p_input->>'expected_source')::bigint THEN RAISE EXCEPTION 'budget_stale_source';END IF;
 SELECT * INTO plan FROM public.budget_plans WHERE tenant_id=p_tenant AND id=coalesce((p_input->>'plan_id')::uuid,(original.after_state->>'plan_id')::uuid) AND state='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 IF action='undo' THEN
  IF plan.version IS DISTINCT FROM (original.after_state->>'plan_version')::bigint OR source_v IS DISTINCT FROM (original.outcome->>'source_revision')::bigint
   OR EXISTS(SELECT 1 FROM public.budget_operations WHERE undo_of=original.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
 ELSE
  IF plan.version IS DISTINCT FROM (p_input->>'expected_plan')::bigint THEN RAISE EXCEPTION 'budget_stale_plan';END IF;
 END IF;
 SELECT * INTO period FROM public.budget_periods WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=coalesce((p_input->>'period_id')::uuid,(original.after_state->>'period_id')::uuid) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;
 SELECT * INTO rev FROM public.budget_revisions WHERE id=period.current_revision_id;
 SELECT * INTO future FROM public.budget_revisions WHERE id=plan.template_revision_id;
 new_v:=plan.version+1;rid:=rev.id;tid:=future.id;
 before_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'period_revision',rev.id,'template_revision',future.id);
 gap:=coalesce((p_input->>'accept_gap')::boolean,false);scope:=coalesce(p_input->>'scope','period');
 IF action='save_item' THEN
  payload:=p_input->'item';lineid:=(p_input->>'line_id')::uuid;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN('type','name','target_cents','estimated','due_date','cadence','anchor','amount_cents','state','recurring_id','planning_goal_id'))
   OR payload->>'type' NOT IN('bill','reserve','goal','contribution') OR payload->>'type' IS NULL OR char_length(trim(coalesce(payload->>'name',''))) NOT BETWEEN 1 AND 60
   OR payload->>'state' NOT IN('draft','saving','paused','purchase-recorded') OR payload->>'state' IS NULL
   OR payload->>'cadence' NOT IN('once','weekly','fortnightly','monthly','quarterly','annual') OR payload->>'cadence' IS NULL THEN RAISE EXCEPTION 'budget_invalid_item';END IF;
  amount:=public.budget_money(payload->'amount_cents');
  IF payload->'target_cents'<>'null'::jsonb THEN PERFORM public.budget_money(payload->'target_cents');END IF;
  IF payload->>'type'='goal' AND payload->>'state'='saving' AND payload->>'target_cents' IS NULL THEN RAISE EXCEPTION 'budget_invalid_target';END IF;
  IF coalesce(payload->>'anchor','')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'budget_invalid_date';END IF;
  PERFORM (payload->>'anchor')::date;
  IF payload->>'due_date' IS NOT NULL THEN PERFORM (payload->>'due_date')::date;END IF;
  IF jsonb_typeof(payload->'estimated') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'budget_invalid_item';END IF;
  IF payload->>'recurring_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recurring_series_overrides WHERE id=(payload->>'recurring_id')::uuid AND tenant_id=p_tenant AND state='active') THEN RAISE EXCEPTION 'budget_invalid_recurring';END IF;
  -- Planning remains contextual only; no Planning mutation occurs here.
  IF payload->>'planning_goal_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.planning_goals WHERE tenant_id=p_tenant AND id=(payload->>'planning_goal_id')::uuid) THEN RAISE EXCEPTION 'budget_invalid_planning_link';END IF;
  SELECT * INTO line FROM public.budget_lines WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=lineid;
  creating:=NOT FOUND;
  IF creating THEN
   INSERT INTO public.budget_lines(id,tenant_id,plan_id,kind,name,opening_cents,opening_date)
   VALUES(lineid,p_tenant,plan.id,CASE payload->>'type' WHEN 'bill' THEN 'fixed' WHEN 'contribution' THEN 'contribution' ELSE 'reserve' END,payload->>'name',public.budget_money(p_input->'opening_cents'),(p_input->>'opening_date')::date);
   IF (p_input->>'opening_date')::date<period.start_date OR (p_input->>'opening_date')::date>=period.end_date OR (payload->>'type' IN('bill','contribution') AND public.budget_money(p_input->'opening_cents')<>0) THEN RAISE EXCEPTION 'budget_invalid_opening';END IF;
  ELSIF line.kind IS DISTINCT FROM (CASE payload->>'type' WHEN 'bill' THEN 'fixed' WHEN 'contribution' THEN 'contribution' ELSE 'reserve' END) THEN RAISE EXCEPTION 'budget_invalid_item';
  END IF;
  SELECT * INTO config FROM public.budget_item_revisions WHERE line_id=lineid ORDER BY version DESC LIMIT 1;
  before_data:=before_data||jsonb_build_object('line_id',lineid,'item',coalesce(config.payload,'null'::jsonb),'new_line',creating);
  schedule_id:=CASE WHEN config.payload->>'cadence'=payload->>'cadence' AND config.payload->>'anchor'=payload->>'anchor' THEN (config.payload->>'schedule_id')::uuid ELSE gen_random_uuid() END;
  payload:=payload||jsonb_build_object('schedule_id',schedule_id);
  INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,lineid,period.id,new_v,payload,p_actor) RETURNING id INTO other;
  SELECT coalesce(a.amount_cents,0) INTO current_amount FROM public.budget_allocations a WHERE a.revision_id=rev.id AND a.line_id=lineid;current_amount:=coalesce(current_amount,0);
  future_amount:=CASE WHEN payload->>'state' IN('draft','paused','purchase-recorded') THEN 0 ELSE amount END;
  IF payload->>'state'='saving' THEN
   SELECT amount*count(*) INTO oldamount FROM public.budget_occurrence_dates((payload->>'anchor')::date,payload->>'cadence',period.start_date,period.end_date);
   SELECT future_amount*count(*) INTO future_amount FROM public.budget_occurrence_dates((payload->>'anchor')::date,payload->>'cadence',period.end_date,CASE WHEN period.frequency='monthly' THEN (period.end_date+interval '1 month')::date ELSE period.end_date+14 END);
   amount:=oldamount;
  END IF;
  -- Pausing preserves the existing current-period reserve; stopping future allocations is explicit.
  IF payload->>'state' IN('paused','purchase-recorded') THEN amount:=current_amount;END IF;
  IF payload->>'state'='draft' THEN amount:=0;END IF;
  SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'amount_cents',CASE WHEN l.id=lineid THEN amount ELSE coalesce(a.amount_cents,0) END)) INTO lines
   FROM public.budget_lines l LEFT JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=rev.id WHERE l.plan_id=plan.id;
  SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'amount_cents',CASE WHEN l.id=lineid THEN future_amount ELSE coalesce(a.amount_cents,0) END)) INTO future_lines
   FROM public.budget_lines l LEFT JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=future.id WHERE l.plan_id=plan.id;
  rid:=public.budget_write_revision(p_tenant,plan.id,period.id,new_v,source_v,rev.income_cents,rev.drawdown_cents,lines,gap);
  tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source_v,future.income_cents,0,future_lines,gap);
  result:=jsonb_build_object('line_id',lineid,'item_revision',other);
 ELSIF action IN('claim_source','confirm_funding') THEN
  lineid:=nullif(p_input->>'line_id','')::uuid;
  IF lineid IS NOT NULL THEN SELECT * INTO line FROM public.budget_lines WHERE id=lineid AND plan_id=plan.id AND tenant_id=p_tenant;IF NOT FOUND THEN RAISE EXCEPTION 'budget_not_found';END IF;END IF;
  IF action='confirm_funding' THEN
   IF char_length(trim(coalesce(p_input->>'note',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'budget_invalid_evidence';END IF;
   INSERT INTO public.budget_manual_funding(id,tenant_id,amount_cents,confirmed_date,note,actor_id)
   VALUES((p_input->>'manual_id')::uuid,p_tenant,public.budget_money(p_input->'capacity_cents'),(p_input->>'confirmed_date')::date,p_input->>'note',p_actor) ON CONFLICT(id) DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM public.budget_manual_funding m WHERE m.id=(p_input->>'manual_id')::uuid AND m.tenant_id=p_tenant AND m.amount_cents=public.budget_money(p_input->'capacity_cents') AND m.confirmed_date=(p_input->>'confirmed_date')::date AND m.note=p_input->>'note') THEN RAISE EXCEPTION 'budget_request_conflict';END IF;
  END IF;
  SELECT * INTO src FROM (
   SELECT a.source_key,a.source_type,a.booking_date,a.capacity,a.fingerprint,a.identity FROM public.budget_activity(p_tenant,plan.id,'0001-01-01','9999-12-31') a
   UNION ALL SELECT * FROM public.budget_funding_sources(p_tenant,plan.id,'0001-01-01','9999-12-31')
  ) s WHERE s.source_key=CASE WHEN action='confirm_funding' THEN 'manual:'||(p_input->>'manual_id') ELSE p_input->>'source_key' END;
  IF NOT FOUND THEN RAISE EXCEPTION 'budget_invalid_source';END IF;
  amount:=public.budget_money(p_input->'amount_cents');IF amount=0 OR src.booking_date>=period.end_date THEN RAISE EXCEPTION 'budget_invalid_evidence';END IF;
  IF p_input->>'purpose' NOT IN('expense','purchase','refund','exclude','funding') OR p_input->>'purpose' IS NULL THEN RAISE EXCEPTION 'budget_invalid_evidence';END IF;
  IF p_input->>'purpose'='funding' THEN
   IF lineid IS NULL OR line.kind NOT IN('reserve','contribution') OR src.source_type NOT IN('bank-observed','user-confirmed') THEN RAISE EXCEPTION 'budget_invalid_funding';END IF;
  ELSE
   IF (p_input->>'purpose'='exclude') IS DISTINCT FROM (lineid IS NULL) THEN RAISE EXCEPTION 'budget_invalid_evidence';END IF;
   IF src.source_type NOT IN('expense','refund') OR (p_input->>'purpose'='refund') IS DISTINCT FROM (src.source_type='refund') THEN RAISE EXCEPTION 'budget_invalid_source';END IF;
   IF lineid IS NOT NULL AND line.kind='contribution' THEN RAISE EXCEPTION 'budget_invalid_source';END IF;
   IF lineid IS NOT NULL AND src.booking_date<line.opening_date THEN RAISE EXCEPTION 'budget_invalid_date';END IF;
  END IF;
  SELECT coalesce(sum(c.amount_cents),0) INTO claimed FROM public.budget_source_claims c WHERE c.tenant_id=p_tenant AND c.source_key=src.source_key AND c.source_fingerprint=src.fingerprint AND NOT EXISTS(SELECT 1 FROM public.budget_claim_reversals r WHERE r.claim_id=c.id);
  IF p_input->>'purpose'='purchase' AND NOT EXISTS(SELECT 1 FROM public.budget_item_revisions r WHERE r.id=(SELECT x.id FROM public.budget_item_revisions x WHERE x.line_id=lineid ORDER BY x.version DESC LIMIT 1) AND r.payload->>'type'='goal') THEN RAISE EXCEPTION 'budget_invalid_purchase';END IF;
  IF claimed+amount>src.capacity THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  IF p_input->>'purpose'='refund' THEN
   SELECT * INTO parent FROM public.budget_source_claims WHERE tenant_id=p_tenant AND plan_id=plan.id AND id=(p_input->>'related_claim_id')::uuid AND line_id=lineid AND purpose IN('expense','purchase');
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.id=parent.id AND c.valid) OR src.booking_date<parent.source_date THEN RAISE EXCEPTION 'budget_invalid_refund';END IF;
   SELECT coalesce(sum(c.amount_cents),0) INTO total FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.related_claim_id=parent.id AND c.valid;
   IF total+amount>parent.amount_cents THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  END IF;
  IF line.kind='fixed' THEN
   SELECT * INTO config FROM public.budget_item_revisions WHERE line_id=lineid ORDER BY version DESC LIMIT 1;
   IF p_input->>'purpose'='expense' AND config.id IS NOT NULL THEN
    IF p_input->>'occurrence_revision_id' IS DISTINCT FROM config.payload->>'schedule_id' OR NOT EXISTS(SELECT 1 FROM public.budget_occurrence_dates((config.payload->>'anchor')::date,config.payload->>'cadence',period.start_date,period.end_date) d WHERE d=(p_input->>'occurrence_date')::date) THEN RAISE EXCEPTION 'budget_invalid_occurrence';END IF;
   END IF;
  END IF;
  INSERT INTO public.budget_source_claims(tenant_id,plan_id,line_id,purpose,source_key,source_fingerprint,source_date,source_identity,amount_cents,occurrence_date,occurrence_revision_id,related_claim_id,source_revision,actor_id)
  VALUES(p_tenant,plan.id,lineid,p_input->>'purpose',src.source_key,src.fingerprint,src.booking_date,src.identity,amount,nullif(p_input->>'occurrence_date','')::date,nullif(p_input->>'occurrence_revision_id','')::uuid,parent.id,source_v,p_actor) RETURNING id INTO other;
  result:=jsonb_build_object('claim_id',other);before_data:=before_data||jsonb_build_object('claim_id',other);
  IF p_input->>'purpose'='purchase' AND coalesce((p_input->>'complete')::boolean,false) THEN
   SELECT * INTO config FROM public.budget_item_revisions WHERE line_id=lineid ORDER BY version DESC LIMIT 1;
   IF config.payload->>'type' IS DISTINCT FROM 'goal' THEN RAISE EXCEPTION 'budget_invalid_purchase';END IF;
   before_data:=before_data||jsonb_build_object('completed_item',config.payload,'line_id',lineid);
   INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id)
    VALUES(p_tenant,plan.id,lineid,period.id,new_v,config.payload||jsonb_build_object('state','purchase-recorded'),p_actor);
   SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',CASE WHEN a.line_id=lineid THEN 0 ELSE a.amount_cents END)) INTO lines FROM public.budget_allocations a WHERE revision_id=future.id;
   tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source_v,future.income_cents,0,lines,true);
  END IF;
 ELSIF action='reverse_claim' THEN
  SELECT * INTO claim FROM public.budget_source_claims WHERE id=(p_input->>'claim_id')::uuid AND tenant_id=p_tenant AND plan_id=plan.id;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.budget_claim_reversals WHERE claim_id=claim.id) OR EXISTS(SELECT 1 FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.related_claim_id=claim.id) THEN RAISE EXCEPTION 'budget_undo_conflict';END IF;
  INSERT INTO public.budget_claim_reversals(tenant_id,plan_id,claim_id,actor_id) VALUES(p_tenant,plan.id,claim.id,p_actor);
  before_data:=before_data||jsonb_build_object('claim',to_jsonb(claim));
 ELSIF action='release_reserve' THEN
  lineid:=(p_input->>'from_line_id')::uuid;other:=(p_input->>'to_line_id')::uuid;amount:=public.budget_money(p_input->'amount_cents');
  SELECT * INTO line FROM public.budget_lines WHERE id=lineid AND tenant_id=p_tenant AND plan_id=plan.id AND kind='reserve';
  IF NOT FOUND OR lineid=other OR amount=0 OR NOT EXISTS(SELECT 1 FROM public.budget_lines WHERE id=other AND tenant_id=p_tenant AND plan_id=plan.id AND kind IN('reserve','everyday')) THEN RAISE EXCEPTION 'budget_invalid_release';END IF;
  SELECT line.opening_cents+coalesce((SELECT sum(a.amount_cents) FROM public.budget_allocations a JOIN public.budget_periods p ON p.current_revision_id=a.revision_id WHERE a.line_id=lineid AND p.end_date<=period.end_date),0)
   -coalesce((SELECT sum(CASE WHEN c.purpose='refund' THEN -c.amount_cents ELSE c.amount_cents END) FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.valid AND c.line_id=lineid AND c.purpose IN('expense','purchase','refund') AND c.source_date<period.end_date),0)
   +coalesce((SELECT sum(CASE WHEN m.to_line_id=lineid THEN m.amount_cents ELSE -m.amount_cents END) FROM public.budget_reserve_moves m WHERE m.plan_id=plan.id AND (m.from_line_id=lineid OR m.to_line_id=lineid) AND m.effective_date<period.end_date),0) INTO total;
  IF amount>total THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  INSERT INTO public.budget_reserve_moves(tenant_id,plan_id,period_id,from_line_id,to_line_id,amount_cents,effective_date,actor_id)
   VALUES(p_tenant,plan.id,period.id,lineid,other,amount,greatest(period.start_date,line.opening_date,(SELECT opening_date FROM public.budget_lines WHERE id=other)),p_actor) RETURNING id INTO other;
  before_data:=before_data||jsonb_build_object('reserve_move',other);
 ELSIF action='move_allocation' THEN
  lineid:=(p_input->>'from_line_id')::uuid;other:=(p_input->>'to_line_id')::uuid;amount:=public.budget_money(p_input->'amount_cents');
  IF amount=0 OR lineid=other THEN RAISE EXCEPTION 'budget_invalid_move';END IF;
  SELECT * INTO line FROM public.budget_lines WHERE id=lineid AND plan_id=plan.id AND tenant_id=p_tenant;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.budget_lines WHERE id=other AND plan_id=plan.id AND tenant_id=p_tenant) THEN RAISE EXCEPTION 'budget_invalid_move';END IF;
  SELECT amount_cents INTO current_amount FROM public.budget_allocations WHERE revision_id=rev.id AND line_id=lineid;
  -- Only unused new allocation moves here; opening reserve releases need their own disposition flow.
  SELECT coalesce(sum(CASE WHEN c.purpose='refund' THEN -c.amount_cents ELSE c.amount_cents END),0) INTO claimed FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.valid AND c.line_id=lineid AND c.purpose IN('expense','purchase','refund') AND c.source_date>=period.start_date AND c.source_date<period.end_date;
  IF line.kind='everyday' THEN
   SELECT coalesce(sum(a.capacity-coalesce((SELECT sum(c.amount_cents) FROM public.budget_live_claims(p_tenant,plan.id) c WHERE c.valid AND c.source_key=a.source_key AND c.purpose<>'funding'),0)),0) INTO claimed FROM public.budget_activity(p_tenant,plan.id,period.start_date,period.end_date) a WHERE a.source_type='expense';
  END IF;
  IF amount>current_amount OR amount>greatest(0,current_amount-claimed) THEN RAISE EXCEPTION 'budget_source_capacity';END IF;
  SELECT jsonb_agg(jsonb_build_object('line_id',a.line_id,'amount_cents',CASE a.line_id WHEN lineid THEN a.amount_cents-amount WHEN other THEN a.amount_cents+amount ELSE a.amount_cents END)) INTO lines FROM public.budget_allocations a WHERE revision_id=rev.id;
  rid:=public.budget_write_revision(p_tenant,plan.id,period.id,new_v,source_v,rev.income_cents,rev.drawdown_cents,lines,true);
 ELSIF action='set_limits' THEN
  payload:=p_input->'limits';IF jsonb_typeof(payload) IS DISTINCT FROM 'array' OR jsonb_array_length(payload)>50 THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
  IF (SELECT count(DISTINCT (x->>'id')::uuid) FROM jsonb_array_elements(payload) x)<>jsonb_array_length(payload) THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
  total:=0;
  FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.taxonomy_categories WHERE id=item->>'category_id') THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
   IF item->>'subcategory_id' IS NOT NULL AND (item->>'custom_subcategory_id' IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.taxonomy_subcategories WHERE id=item->>'subcategory_id' AND category_id=item->>'category_id')) THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
   IF item->>'custom_subcategory_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_subcategories WHERE id=(item->>'custom_subcategory_id')::uuid AND tenant_id=p_tenant AND category_id=item->>'category_id') THEN RAISE EXCEPTION 'budget_invalid_category';END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(payload) x WHERE x->>'category_id'=item->>'category_id' AND ((x->>'subcategory_id' IS NULL AND x->>'custom_subcategory_id' IS NULL) OR (item->>'subcategory_id' IS NULL AND item->>'custom_subcategory_id' IS NULL) OR (x->>'subcategory_id'=item->>'subcategory_id') OR (x->>'custom_subcategory_id'=item->>'custom_subcategory_id')))>1 THEN RAISE EXCEPTION 'budget_invalid_overlap';END IF;
   total:=total+public.budget_money(item->'amount_cents');
  END LOOP;
  SELECT a.amount_cents INTO current_amount FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id=rev.id AND l.kind='everyday';
  IF total>current_amount THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
  SELECT r.payload INTO candidate FROM public.budget_limit_revisions r WHERE r.period_id=period.id ORDER BY r.version DESC LIMIT 1;
  before_data:=before_data||jsonb_build_object('limits',coalesce(candidate,'[]'));
  INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,period.id,new_v,payload,p_actor);
 ELSIF action='undo' THEN
  compensation:=original.id;before_data:=original.after_state;
  IF original.action='release_reserve' THEN
   INSERT INTO public.budget_reserve_moves(tenant_id,plan_id,period_id,from_line_id,to_line_id,amount_cents,effective_date,actor_id)
    SELECT p_tenant,plan.id,period.id,m.to_line_id,m.from_line_id,m.amount_cents,m.effective_date,p_actor FROM public.budget_reserve_moves m WHERE m.id=(original.before_state->>'reserve_move')::uuid;
  ELSIF original.action IN('claim_source','confirm_funding') THEN
   INSERT INTO public.budget_claim_reversals(tenant_id,plan_id,claim_id,actor_id) VALUES(p_tenant,plan.id,(original.before_state->>'claim_id')::uuid,p_actor);
   IF original.before_state ? 'completed_item' THEN
    INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id)
     VALUES(p_tenant,plan.id,(original.before_state->>'line_id')::uuid,period.id,new_v,original.before_state->'completed_item',p_actor);
    SELECT * INTO future FROM public.budget_revisions WHERE id=(original.before_state->>'template_revision')::uuid;
    SELECT jsonb_agg(jsonb_build_object('line_id',line_id,'amount_cents',amount_cents)) INTO lines FROM public.budget_allocations WHERE revision_id=future.id;
    tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source_v,future.income_cents,0,lines,future.accepted_gap);
   END IF;
  ELSIF original.action='reverse_claim' THEN
   payload:=original.before_state->'claim';
   INSERT INTO public.budget_source_claims(tenant_id,plan_id,line_id,purpose,source_key,source_fingerprint,source_date,source_identity,amount_cents,occurrence_date,occurrence_revision_id,related_claim_id,source_revision,actor_id)
   VALUES(p_tenant,plan.id,(payload->>'line_id')::uuid,payload->>'purpose',payload->>'source_key',payload->>'source_fingerprint',(payload->>'source_date')::date,payload->'source_identity',(payload->>'amount_cents')::bigint,(payload->>'occurrence_date')::date,(payload->>'occurrence_revision_id')::uuid,(payload->>'related_claim_id')::uuid,source_v,p_actor);
  ELSIF original.action='set_limits' THEN
   INSERT INTO public.budget_limit_revisions(tenant_id,plan_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,period.id,new_v,original.before_state->'limits',p_actor);
  ELSE
   IF original.action='save_item' THEN
    lineid:=(original.before_state->>'line_id')::uuid;payload:=original.before_state->'item';
    IF payload='null'::jsonb THEN SELECT r.payload||jsonb_build_object('state','paused','amount_cents',0,'voided',coalesce((original.before_state->>'new_line')::boolean,false)) INTO payload FROM public.budget_item_revisions r WHERE line_id=lineid ORDER BY version DESC LIMIT 1;END IF;
    INSERT INTO public.budget_item_revisions(tenant_id,plan_id,line_id,period_id,version,payload,actor_id) VALUES(p_tenant,plan.id,lineid,period.id,new_v,payload,p_actor);
   END IF;
   SELECT * INTO rev FROM public.budget_revisions WHERE id=(original.before_state->>'period_revision')::uuid;
   SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'amount_cents',coalesce(a.amount_cents,0))) INTO lines FROM public.budget_lines l LEFT JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=rev.id WHERE l.plan_id=plan.id;
   rid:=public.budget_write_revision(p_tenant,plan.id,period.id,new_v,source_v,rev.income_cents,rev.drawdown_cents,lines,rev.accepted_gap);
   SELECT * INTO future FROM public.budget_revisions WHERE id=(original.before_state->>'template_revision')::uuid;
   SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'amount_cents',coalesce(a.amount_cents,0))) INTO lines FROM public.budget_lines l LEFT JOIN public.budget_allocations a ON a.line_id=l.id AND a.revision_id=future.id WHERE l.plan_id=plan.id;
   tid:=public.budget_write_revision(p_tenant,plan.id,NULL,new_v,source_v,future.income_cents,0,lines,future.accepted_gap);
  END IF;
 END IF;
 -- Every edit must preserve optional category partitions within the new everyday pool.
 SELECT r.payload INTO candidate FROM public.budget_limit_revisions r WHERE r.period_id=period.id ORDER BY r.version DESC LIMIT 1;
 IF candidate IS NOT NULL THEN
  SELECT coalesce(sum(public.budget_money(x->'amount_cents')),0) INTO total FROM jsonb_array_elements(candidate) x;
  SELECT a.amount_cents INTO current_amount FROM public.budget_allocations a JOIN public.budget_lines l ON l.id=a.line_id WHERE a.revision_id=rid AND l.kind='everyday';
  IF total>current_amount THEN RAISE EXCEPTION 'budget_invalid_limits';END IF;
 END IF;
 UPDATE public.budget_periods SET current_revision_id=rid WHERE id=period.id;
 UPDATE public.budget_plans SET version=new_v,template_revision_id=tid WHERE id=plan.id;
 -- Range-check all derived amounts before committing, not on the next browser read.
 PERFORM public.budget_details(p_tenant,p_actor,plan.id,period.id,source_v,new_v);
 after_data:=jsonb_build_object('plan_id',plan.id,'period_id',period.id,'plan_version',new_v::text,'period_revision',rid,'template_revision',tid);
 receipt:=jsonb_build_object('request_id',p_request,'operation_id',op,'status','committed','source_revision',source_v::text,'method','budget-foundation-v1','result',after_data||result);
 INSERT INTO public.budget_operations(id,tenant_id,actor_id,request_id,payload_hash,action,before_state,after_state,outcome,undo_of) VALUES(op,p_tenant,p_actor,p_request,hash,action,before_data,after_data,receipt,compensation);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.budget_command(uuid,uuid,uuid,jsonb,boolean) TO service_role;
DO $$BEGIN IF has_function_privilege('authenticated','public.budget_command(uuid,uuid,uuid,jsonb,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Budget M4 function grant leak';END IF;END $$;
