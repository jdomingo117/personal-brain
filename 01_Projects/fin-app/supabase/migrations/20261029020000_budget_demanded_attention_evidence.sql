-- R06: derive complete evidence maps only after the unchanged check rules
-- produce an issue that consumes them. Pending evidence keeps its own path.
DO $$ DECLARE f regprocedure;definition text;start_at integer;end_at integer;original text;map_query text;anchor text;BEGIN
 f:='public.budget_attention_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean)'::regprocedure;
 definition:=pg_get_functiondef(f);
 EXECUTE replace(definition,'FUNCTION public.budget_attention_facts(','FUNCTION public.budget_attention_facts_r06_reference(');
 EXECUTE 'REVOKE ALL ON FUNCTION public.budget_attention_facts_r06_reference(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean) FROM PUBLIC,anon,authenticated';
 EXECUTE 'GRANT EXECUTE ON FUNCTION public.budget_attention_facts_r06_reference(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean) TO service_role';
 start_at:=position(' WITH live AS MATERIALIZED' IN definition);
 original:=' SELECT coalesce(jsonb_object_agg(bucket,evidence),''{}'') INTO maps FROM grouped;';
 end_at:=position(original IN definition)+length(original);
 IF start_at=0 OR end_at<=length(original) THEN RAISE EXCEPTION 'budget_r06_attention_shape';END IF;
 map_query:=substring(definition from start_at for end_at-start_at);
 definition:=substring(definition for start_at-1)||E' maps:=''{}''::jsonb;\n'||substring(definition from end_at);
 anchor:=' FOR i IN SELECT value FROM jsonb_array_elements(issues) ORDER BY';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_attention_loop_shape';END IF;
 definition:=replace(definition,anchor,
  E' IF EXISTS(SELECT 1 FROM jsonb_array_elements(issues) x WHERE x->>''kind'' IN(''overspend'',''reserve_shortfall'',''bill_unmatched'',''goal_due_shortfall'',''uncategorized'',''projected_overspend'',''fixed_projected_overspend'')) THEN\n'
  ||map_query||E'\n END IF;\n'||anchor);
 definition:=replace(definition,'maps jsonb;','evidence_key text;maps jsonb;');
 anchor:=E'  SELECT * INTO event FROM public.budget_attention_events';
 IF position(anchor IN definition)=0 OR position('evidence_key text' IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_attention_event_shape';END IF;
 definition:=replace(definition,anchor,$evidence$
  IF i->>'kind' IN('overspend','reserve_shortfall','bill_unmatched','goal_due_shortfall','uncategorized','projected_overspend','fixed_projected_overspend') THEN
   evidence_key:=CASE WHEN i->>'kind'='uncategorized' THEN 'uncategorized'
    WHEN i->>'kind'='projected_overspend' THEN 'parent'
    WHEN left(i->>'key',9)='category:' THEN substring(i->>'key' from 10)
    WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(d->'items') x WHERE x->>'line_id'=i->>'line_id' AND x->>'kind'='everyday') THEN 'parent'
    ELSE i->>'line_id' END;
   i:=jsonb_set(i,'{evidence}',coalesce(maps->evidence_key,'{}'::jsonb));
  END IF;
$evidence$||anchor);
 original:='SELECT count(*) INTO days FROM public.budget_activity(p_tenant,p_plan,p.start_date,p.end_date) WHERE source_type=''expense'' AND (category_id IS NULL OR lower(category_id)=''uncategorized'');';
 IF position(original IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_attention_count_shape';END IF;
 definition:=replace(definition,original,replace(original,'public.budget_activity(','public.budget_activity_amounts('));
 definition:=replace(definition,'public.transactions_analytic','public.budget_transactions_analytic');
 EXECUTE definition;
END $$;

-- SQL-language SECURITY DEFINER functions cannot inline and use generic plans.
-- Plan these two scoped reads with their real tenant/date values, so a dense
-- account can use set joins instead of one allocation/parent lookup per row.
DO $$ DECLARE name text;f regprocedure;definition text;body text;BEGIN
 FOREACH name IN ARRAY ARRAY['budget_activity','budget_activity_amounts'] LOOP
  SELECT p.oid::regprocedure,p.prosrc INTO f,body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
  definition:=pg_get_functiondef(f);
  definition:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
  definition:=replace(definition,'AS $function$'||body||'$function$',E'SET plan_cache_mode TO ''force_custom_plan''\nAS $function$\n#variable_conflict use_column\nBEGIN\n RETURN QUERY '||rtrim(body,E' \n\t;')||E';\nEND;\n$function$');
  IF position('RETURN QUERY' IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_scope_function_shape';END IF;
  EXECUTE definition;
 END LOOP;
END $$;
DO $$ DECLARE signature text;BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'public.budget_attention_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean)',
 'public.budget_attention_facts_r06_reference(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean)',
 'public.budget_activity(uuid,uuid,date,date)',
 'public.budget_activity_amounts(uuid,uuid,date,date)'] LOOP
  IF has_function_privilege('anon',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN RAISE EXCEPTION 'budget_r06_evidence_privileges';END IF;
 END LOOP;
END $$;
