-- Sample files for the demo. Run once, by hand, after the migrations:
--   npx supabase db query --remote --yes -f supabase/seeds/sample_files.sql
-- It makes five sample applicants, one sample reviewer per agency that has a step, and
-- five files for every tracked permit that is switched on: three finished and two in
-- progress. Every file goes through the same functions a real file does. Then the step
-- times are spread over past weeks, because a file walked through in one second would
-- say every step takes no time. The durations are made up. Nothing here is a real
-- application, a real person, or a real agency timeline.
-- Sample accounts have no password and an example.com address, so nobody can sign in as one.

do $seed$
declare
  v_names text[] := array['Maria Sample', 'Jose Sample', 'Ana Sample', 'Ben Sample', 'Rita Sample'];
  v_factor numeric[] := array[0.6, 1.0, 1.5, 1.0, 1.0];
  v_type record;
  v_agency record;
  v_step record;
  v_field jsonb;
  v_i integer;
  v_guard integer;
  v_done integer;
  v_stop integer;
  v_app uuid;
  v_applicant uuid;
  v_reviewer uuid;
  v_status text;
  v_details jsonb;
  v_t timestamptz;
  v_phase_end timestamptz;
  v_phase text;
  v_days numeric;
  v_cents bigint;
begin
  if exists (select 1 from public.applications where is_sample) then
    raise notice 'Sample files already exist. Nothing was changed.';
    return;
  end if;

  -- 1. People.
  for v_i in 1..5 loop
    if not exists (select 1 from auth.users where email = 'sample.applicant' || v_i || '@example.com') then
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), 'sample.applicant' || v_i || '@example.com', jsonb_build_object('full_name', v_names[v_i]));
    end if;
  end loop;
  for v_agency in
    select distinct a.id, a.code, a.acronym from public.workflow_steps w join public.agencies a on a.id = w.agency_id
  loop
    if not exists (select 1 from auth.users where email = 'sample.reviewer.' || v_agency.code || '@example.com') then
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), 'sample.reviewer.' || v_agency.code || '@example.com',
        jsonb_build_object('full_name', 'Sample reviewer, ' || left(v_agency.acronym, 40)));
    end if;
    insert into public.memberships (user_id, agency_id, role)
    select u.id, v_agency.id, 'reviewer' from auth.users u
    where u.email = 'sample.reviewer.' || v_agency.code || '@example.com'
      and not exists (select 1 from public.memberships m where m.user_id = u.id and m.agency_id = v_agency.id and m.role = 'reviewer');
  end loop;

  -- 2. Files.
  for v_type in
    select t.id, t.code, t.builder, t.fields, t.lead_agency_id from public.application_types t where t.active order by t.code
  loop
    for v_i in 1..5 loop
      select id into v_applicant from auth.users where email = 'sample.applicant' || v_i || '@example.com';
      perform set_config('request.jwt.claims', json_build_object('sub', v_applicant, 'aal', 'aal1', 'role', 'authenticated')::text, true);

      if v_type.code = 'building_permit_residential_one_family' then
        v_app := private.create_draft('SAMPLE-' || v_i, 'T-100', '2', 'R1', 'owner', null,
          'Sample file. New private one-family dwelling on public sewer.', null, 'public_sewer', 'public',
          'SAMPLE-000', null, null, true, v_names[v_i]);
      elsif v_type.code = 'business_license_new' then
        v_app := private.create_license_draft(
          jsonb_build_object('business_name', 'Sample Store ' || v_i, 'trade_name', '', 'entity_type', 'sole_proprietor',
            'registration_number', '', 'street', '123 Sample Street', 'village', 'Tamuning'),
          '5', '2', 'Sample file. Retail: sale of clothing.', true, v_names[v_i]);
      else
        -- A built permit: the first question names the file, a list question takes its first answer.
        v_details := '{}'::jsonb;
        for v_field in select * from jsonb_array_elements(v_type.fields) loop
          v_details := v_details || jsonb_build_object(v_field ->> 'key',
            case
              when v_details = '{}'::jsonb then 'Sample ' || v_i
              when v_field ->> 'kind' = 'choice' then v_field -> 'choices' ->> 0
              else 'Sample answer'
            end);
        end loop;
        v_app := private.create_builder_draft(v_type.code, v_details, true, v_names[v_i]);
      end if;

      insert into public.documents (application_id, uploaded_by, kind, storage_path, file_name, mime_type, byte_size)
      select v_app, v_applicant, r.code, v_app::text || '/sample-' || r.code || '.pdf', 'sample-' || r.code || '.pdf', 'application/pdf', 1024
      from public.required_documents r where r.application_type_id = v_type.id and r.required;

      perform private.submit_application(v_app);
      perform set_config('permitgu.trusted_write', '1', true);
      update public.applications set is_sample = true where id = v_app;
      perform set_config('permitgu.trusted_write', '', true);

      -- Files 1 to 3 finish. File 4 stops after one approval. File 5 stops after three.
      v_stop := case v_i when 4 then 1 when 5 then 3 else 1000 end;
      v_done := 0;
      for v_guard in 1..80 loop
        select status into v_status from public.applications where id = v_app;
        exit when v_status not in ('submitted', 'intake', 'plan_review', 'clearances_in_progress');
        exit when v_done >= v_stop;
        select s.id, s.agency_id, s.status into v_step
        from public.application_steps s join public.workflow_steps w on w.id = s.workflow_step_id
        where s.application_id = v_app and s.status in ('queued', 'in_progress')
        order by w.sort_order limit 1;
        exit when not found;
        select m.user_id into v_reviewer from public.memberships m join auth.users u on u.id = m.user_id
        where m.agency_id = v_step.agency_id and m.role = 'reviewer' and u.email like 'sample.reviewer.%' limit 1;
        perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer, 'aal', 'aal2', 'role', 'authenticated')::text, true);
        if v_step.status = 'queued' then perform private.review_step(v_step.id, 'in_progress', null); end if;
        perform private.review_step(v_step.id, 'approved', 'Sample approval.');
        v_done := v_done + 1;
      end loop;

      select m.user_id into v_reviewer from public.memberships m join auth.users u on u.id = m.user_id
      where m.agency_id = v_type.lead_agency_id and m.role = 'reviewer' and u.email like 'sample.reviewer.%' limit 1;
      select status into v_status from public.applications where id = v_app;

      if v_i <= 3 and v_status = 'fees_due' then
        -- Amounts follow a published figure where one exists. The house amount is made up.
        v_cents := case v_type.code
          when 'x_sanitary_permit_food' then 56800
          when 'x_zone_variance' then 7500
          when 'business_license_new' then 10000
          else 50000 end;
        perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer, 'aal', 'aal2', 'role', 'authenticated')::text, true);
        perform private.assess_fees(v_app, v_cents, 'Sample amount. Not a real fee assessment.');
        perform private.mark_fees_paid(v_app, 'Sample entry. No payment was made.');
        perform private.issue_permit(v_app, 'Sample file issued for the demo.');
      elsif v_i = 5 then
        -- One step shows as in review.
        select s.id, s.agency_id into v_step
        from public.application_steps s join public.workflow_steps w on w.id = s.workflow_step_id
        where s.application_id = v_app and s.status = 'queued' order by w.sort_order limit 1;
        if found then
          select m.user_id into v_reviewer from public.memberships m join auth.users u on u.id = m.user_id
          where m.agency_id = v_step.agency_id and m.role = 'reviewer' and u.email like 'sample.reviewer.%' limit 1;
          perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer, 'aal', 'aal2', 'role', 'authenticated')::text, true);
          perform private.review_step(v_step.id, 'in_progress', null);
        end if;
      end if;

      -- 3. Spread the step times over past weeks. Review steps in one stage run side by
      -- side. Intake, fee, and issue steps run one after another.
      v_t := now() - (case when v_i <= 3 then 150 - v_i * 9 else 34 - v_i * 3 end) * interval '1 day';
      perform set_config('permitgu.trusted_write', '1', true);
      update public.applications set created_at = v_t - interval '1 day' where id = v_app;
      perform set_config('permitgu.trusted_write', '', true);
      foreach v_phase in array array['intake', 'plan_review', 'clearance', 'fees', 'issuance'] loop
        v_phase_end := v_t;
        for v_step in
          select s.id, w.code from public.application_steps s join public.workflow_steps w on w.id = s.workflow_step_id
          where s.application_id = v_app and w.phase = v_phase and s.status = 'approved' order by w.sort_order
        loop
          v_days := v_factor[v_i] * case v_phase
            when 'intake' then 2
            when 'plan_review' then 5 + abs(hashtext(v_step.code)) % 8
            when 'clearance' then 4 + abs(hashtext(v_step.code)) % 14
            when 'fees' then 1 + abs(hashtext(v_step.code)) % 3
            else 1 end;
          update public.application_steps
          set started_at = v_t, decided_at = v_t + v_days * interval '1 day', updated_at = v_t + v_days * interval '1 day'
          where id = v_step.id;
          if v_phase in ('plan_review', 'clearance') then
            v_phase_end := greatest(v_phase_end, v_t + v_days * interval '1 day');
          else
            v_t := v_t + v_days * interval '1 day';
            v_phase_end := v_t;
          end if;
        end loop;
        v_t := v_phase_end;
      end loop;
      -- Steps still open have been waiting since the last one finished.
      update public.application_steps
      set started_at = case when started_at is null then null else v_t end, updated_at = v_t
      where application_id = v_app and status in ('queued', 'in_progress');
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end
$seed$;

-- On a hosted project the sign-in service expects text columns it owns to be empty
-- strings, not null, on every account. The local test database has none of these columns.
do $fix$
declare
  v_column text;
begin
  foreach v_column in array array['confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change',
    'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = v_column) then
      execute format('update auth.users set %I = %L where email like %L and %I is null', v_column, '', 'sample.%@example.com', v_column);
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'aud') then
    execute $q$update auth.users set aud = 'authenticated', role = 'authenticated',
      instance_id = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'),
      updated_at = coalesce(updated_at, now())
      where email like 'sample.%@example.com' and aud is null$q$;
  end if;
end
$fix$;
