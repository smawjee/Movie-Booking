-- The Express backend calls hold_seats/confirm_booking exclusively via the
-- service-role key. Both are SECURITY DEFINER, so leaving them exposed to
-- anon/authenticated via PostgREST's auto-exposed RPC endpoint would let
-- anyone with the public anon key bypass the backend's validation, rate
-- limiting and age-confirmation checks entirely.
--
-- Postgres grants EXECUTE to PUBLIC by default, and anon/authenticated
-- inherit through that grant, so it must be revoked from PUBLIC too or the
-- explicit per-role revokes below have no effect.
revoke execute on function public.hold_seats (uuid, uuid, uuid[])
from
  public,
  anon,
  authenticated;

revoke execute on function public.confirm_booking (uuid, text, jsonb)
from
  public,
  anon,
  authenticated;
