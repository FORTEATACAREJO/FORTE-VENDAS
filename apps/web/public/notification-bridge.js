import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {startNotifications} from '/forte-notifications.js';
const client=createClient('https://gtwecfyffjszghnvtlzr.supabase.co','sb_publishable_RP8g0VoZdWh8e9R7Nb9mYw_GSXjSuD3',{auth:{storage:localStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
startNotifications({client,app:'vendas',bridge:true});
