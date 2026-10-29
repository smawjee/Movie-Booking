-- rls_auto_enable() is an event-trigger function. Event triggers fire without
-- an EXECUTE check, so nobody needs to be able to call it through the API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Removes an account's personal data ahead of deleting the auth user.
-- Bookings and payments are kept as anonymous financial records; everything
-- else tied to the account is deleted. Service role only.
create or replace function public.erase_account_data(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set user_id = null, guest_email = null
  where user_id = p_user_id
    or (p_email is not null and lower(guest_email) = lower(p_email));
  update public.booking_drafts set user_id = null where user_id = p_user_id;
  delete from public.chat_sessions where user_id = p_user_id;
  delete from public.membership_events
  where membership_id in (select id from public.memberships where user_id = p_user_id);
  delete from public.membership_payments
  where membership_id in (select id from public.memberships where user_id = p_user_id);
  delete from public.memberships where user_id = p_user_id;
end;
$$;
revoke execute on function public.erase_account_data(uuid, text) from public, anon, authenticated;
grant execute on function public.erase_account_data(uuid, text) to service_role;
