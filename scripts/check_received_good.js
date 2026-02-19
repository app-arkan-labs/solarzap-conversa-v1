
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkReceivedMedia() {
    console.log('Searching for successful RECEIVED media...');

    const { data, error } = await supabase
        .from('interacoes')
        .select('*')
        .eq('tipo', 'mensagem_cliente')
        .ilike('mensagem', '%🖼️%') // Filter for images
        .not('mensagem', 'ilike', '%mmg.whatsapp.net%') // NOT containing broken raw URLs
        .limit(3);

    if (error) {
        console.error(error);
    } else {
        console.log('Valid Received Media:', JSON.stringify(data, null, 2));
    }
}

checkReceivedMedia();
