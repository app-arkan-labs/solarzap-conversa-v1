
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const userId = "d82bb771-1c20-4328-a17f-567ccd81c9c8"; // Extracted from previous error log

if (!supabaseKey) { process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAgenda() {
    console.log("--- Debugging Dashboard Agenda Queries ---");

    // Simulate 'last_7_days' logic
    const now = new Date();
    const startCal = new Date(now);
    startCal.setDate(now.getDate() - 7);
    startCal.setHours(0, 0, 0, 0);
    const endCal = new Date(now);
    endCal.setHours(23, 59, 59, 999);

    const calStart = startCal.toISOString();
    const calEnd = endCal.toISOString();

    console.log(`Range: ${calStart} to ${calEnd}`);
    console.log(`User ID: ${userId}`);

    // 1. Run Count Query
    console.log("\n1. Running Count Query...");
    const { count, error: countError } = await supabase
        .from("appointments")
        .select("id", { count: 'exact', head: true })
        .gte("start_at", calStart)
        .lte("start_at", calEnd)
        .eq("user_id", userId);

    if (countError) console.error("Count Error:", countError);
    console.log("Count Current Logic:", count);


    // 2. Run List Query (Exact same filters)
    console.log("\n2. Running List Query...");
    const { data: list, error: listError } = await supabase
        .from("appointments")
        .select("id, title, start_at, type, status, leads(nome)")
        .gte("start_at", calStart)
        .lte("start_at", calEnd)
        .eq("user_id", userId)
        .order("start_at", { ascending: true })
        .limit(10);

    if (listError) console.error("List Error:", listError);
    console.log(`List Length: ${list?.length}`);
    if (list?.length) console.table(list.map(l => ({ id: l.id, title: l.title, start: l.start_at, lead: l.leads })));

    // 3. Run List Query WITHOUT leads join (Debug if join is breaking it)
    if (list?.length === 0 && count > 0) {
        console.log("\n3. Retrying List Query WITHOUT Join...");
        const { data: listNoJoin, error: listNoJoinError } = await supabase
            .from("appointments")
            .select("id, title, start_at, type, status")
            .gte("start_at", calStart)
            .lte("start_at", calEnd)
            .eq("user_id", userId);

        console.log(`List No Join Length: ${listNoJoin?.length}`);
    }
}

debugAgenda();
