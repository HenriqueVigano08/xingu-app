import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({command,mode})=>{
 // Sem as configurações públicas do Supabase, o site publicado ficaria sem login.
 if(command==='build'){
  const env=loadEnv(mode,'.','VITE_');
  if(!env.VITE_SUPABASE_URL||!env.VITE_SUPABASE_ANON_KEY||env.VITE_SUPABASE_URL.includes('SEU-PROJETO'))
   throw new Error('Arquivo .env ausente ou incompleto (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Build cancelado para não publicar um site sem login.');
 }
 return {plugins:[react()]};
});
