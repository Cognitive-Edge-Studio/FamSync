-- The local Realtime service (or hosted Supabase) creates realtime.messages before this migration.
create policy famsync_channel_broadcast_read on realtime.messages for select to authenticated
  using (extension='broadcast' and app.can_receive_channel_signal(realtime.topic()));
-- No authenticated INSERT policy: browsers cannot publish channel signals or message content.
