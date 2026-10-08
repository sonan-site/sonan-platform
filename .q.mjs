import pg from "pg";
const c=new pg.Client({connectionString:process.env.SUPABASE_DB_URL});await c.connect();await c.query("set transaction read only");
const r=(await c.query("select sort_order, left(question,30) q, answer ~ '[٠-٩]' ar_a, question ~ '[٠-٩]' ar_q from help_entries where program_id='b88cae5e-4cbd-4969-adaa-36b924c03622' and deleted_at is null order by sort_order")).rows;
console.log(r.filter(x=>x.ar_a||x.ar_q).map(x=>x.sort_order+":"+x.q).join("\n")||"none", "\ncount", r.length);
await c.end();
