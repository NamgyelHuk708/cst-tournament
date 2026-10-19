-- Substitutions in extra time: the substitutions table allowed minutes 1-90 only. Widened to 1-120
-- (90 + up to 30 of extra time; stoppage is stored separately in added_time, 1-30, as before).
-- Approved 20 Oct 2026. It only allows more: every existing row (all at 90' or earlier) still passes,
-- and the deployed site and admin behave exactly as before.
alter table public.substitutions drop constraint substitutions_minute_check;
alter table public.substitutions add constraint substitutions_minute_check check (minute between 1 and 120);
