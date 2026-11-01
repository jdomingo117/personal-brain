-- The frozen canonical view predates the parent's custom-subcategory column.
-- Expose that one existing field privately so Budget need not join each parent
-- to the same transactions table a second time. Public analytics is unchanged.
DO $$ DECLARE definition text;body text;scoped text;f regprocedure;name text;anchor text;BEGIN
 definition:=pg_get_viewdef('public.budget_transactions_analytic'::regclass,true);
 anchor:='il.id AS investment_cash_link_id';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_private_category_shape';END IF;
 EXECUTE 'CREATE OR REPLACE VIEW public.budget_transactions_analytic WITH (security_invoker=true) AS '||replace(definition,anchor,anchor||', t.custom_subcategory_id AS budget_custom_subcategory_id');

 FOREACH name IN ARRAY ARRAY['budget_activity','budget_activity_amounts'] LOOP
  SELECT p.oid::regprocedure INTO f FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=name;
  definition:=pg_get_functiondef(f);
  anchor:='JOIN public.transactions original ON original.id=t.id AND original.tenant_id=t.tenant_id';
  IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_parent_join_shape';END IF;
  definition:=replace(replace(definition,anchor,''),'original.custom_subcategory_id','t.budget_custom_subcategory_id');
  EXECUTE definition;
 END LOOP;
 -- Inline the same lean source SQL where its rows only feed one statement.
 -- This removes a second function tuplestore and permits count/category filters
 -- to reach the ledger scan. The source predicates and returned facts stay exact.
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.budget_activity_amounts_r06_reference(uuid,uuid,date,date)'::regprocedure;
 body:=replace(body,'public.transactions_analytic','public.budget_transactions_analytic');
 body:=replace(replace(body,'JOIN public.transactions original ON original.id=t.id AND original.tenant_id=t.tenant_id',''),'original.custom_subcategory_id','t.budget_custom_subcategory_id');
 body:=rtrim(body,E' \n\t;');

 f:='public.budget_details_m4_before_controls(uuid,uuid,uuid,uuid,bigint,bigint)'::regprocedure;
 definition:=pg_get_functiondef(f);
 anchor:='SELECT * FROM public.budget_activity_amounts(p_tenant,p_plan,period.start_date,period.end_date)';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_details_activity_shape';END IF;
 scoped:=replace(replace(body,'p_from','period.start_date'),'p_until','period.end_date');
 EXECUTE replace(definition,anchor,'SELECT * FROM ('||scoped||') AS amount_rows(source_key,source_type,booking_date,capacity,category_id,subcategory_id,custom_subcategory_id)');

 f:='public.budget_forecast_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(f);
 anchor:='public.budget_activity_amounts(p_tenant,p_plan,p.start_date,cut) a';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_forecast_activity_shape';END IF;
 scoped:=replace(replace(body,'p_from','p.start_date'),'p_until','cut');
 EXECUTE replace(definition,anchor,'('||scoped||') AS a(source_key,source_type,booking_date,capacity,category_id,subcategory_id,custom_subcategory_id)');

 f:='public.budget_attention_facts(uuid,uuid,uuid,uuid,bigint,bigint,jsonb,boolean)'::regprocedure;
 definition:=pg_get_functiondef(f);
 anchor:='public.budget_activity_amounts(p_tenant,p_plan,p.start_date,p.end_date)';
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'budget_r06_count_activity_shape';END IF;
 scoped:=replace(replace(body,'p_from','p.start_date'),'p_until','p.end_date');
 EXECUTE replace(definition,anchor,'('||scoped||') AS count_rows(source_key,source_type,booking_date,capacity,category_id,subcategory_id,custom_subcategory_id)');
 IF has_table_privilege('anon','public.budget_transactions_analytic','SELECT') OR has_table_privilege('authenticated','public.budget_transactions_analytic','SELECT') OR NOT has_table_privilege('service_role','public.budget_transactions_analytic','SELECT')
 OR NOT (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid='public.budget_transactions_analytic'::regclass) THEN RAISE EXCEPTION 'budget_r06_inline_privileges';END IF;
END $$;
