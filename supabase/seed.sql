insert into app.families (id, name, time_zone)
values ('2a12f760-969a-4c1d-83b5-afb3d4a93bb6', 'Sample Family', 'UTC')
on conflict (id) do nothing;
