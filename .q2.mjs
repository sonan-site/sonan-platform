import pg from "pg";
const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL});await c.connect();await c.query("set transaction read only");
console.log((await c.query("select id, block_type, sort_order from page_blocks where program_id='b88cae5e-4cbd-4969-adaa-36b924c03622' and deleted_at is null and content::text ~ '[٠-٩]' order by sort_order")).rows);
console.log((await c.query("select title from program_schedule where program_id='b88cae5e-4cbd-4969-adaa-36b924c03622' and deleted_at is null and (note||title) ~ '[٠-٩]'")).rows);
await c.end();
