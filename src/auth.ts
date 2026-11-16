import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured=Boolean(url&&key&&!url.includes('SEU-PROJETO'));
export const supabase=configured?createClient(url,key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
export async function inventoryFetch(url:string,options:RequestInit={}){const session=await supabase?.auth.getSession();const token=session?.data.session?.access_token;if(!token)throw Error('Entre na sua conta para continuar.');return fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token}})}
export async function signOut(){await supabase?.auth.signOut();location.href='/';}
