import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowUpRight,ShieldCheck,Package,BarChart3,ArrowRight,Eye,EyeOff} from 'lucide-react';
import App from './App';
import {supabase,configured,signOut} from './auth';
import './style.css';
// O Supabase devolve mensagens em inglês; aqui elas viram orientações em português.
function translate(message:string,mode:string){
 const m=message.toLowerCase();
 if(m.includes('invalid login credentials'))return 'E-mail ou senha incorretos.';
 if(m.includes('email not confirmed'))return 'Confirme seu e-mail pelo link enviado antes de entrar.';
 if(m.includes('rate limit')||m.includes('too many'))return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
 if(m.includes('session missing')||m.includes('auth session'))return mode==='update'?'O link de recuperação expirou ou foi aberto em outro navegador. Peça um novo link em “Esqueceu a senha?” e abra-o neste mesmo navegador.':'Sua sessão expirou. Entre novamente.';
 if(m.includes('same')&&m.includes('password'))return 'A nova senha precisa ser diferente da anterior.';
 if(m.includes('weak')||m.includes('password should'))return 'Senha fraca. Use pelo menos 12 caracteres, misturando letras, números e símbolos.';
 if(m.includes('error sending')||m.includes('smtp'))return 'Não foi possível enviar o e-mail agora. Avise a administração.';
 if(m.includes('fetch')||m.includes('network'))return 'Sem conexão com o servidor. Confira sua internet.';
 return message||'Não foi possível concluir. Tente novamente.';
}
function Root(){const [session,setSession]=useState<any>(null),[loading,setLoading]=useState(true),[mode,setMode]=useState(new URLSearchParams(location.search).has('recovery')?'update':'login'),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(false);
useEffect(()=>{if(!supabase){setLoading(false);return}supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const {data}=supabase.auth.onAuthStateChange((event,session)=>{setSession(session);if(event==='PASSWORD_RECOVERY')setMode('update');setLoading(false)});return()=>data.subscription.unsubscribe()},[]);
async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError('');setMessage('');if(!supabase){setError('O acesso será liberado após a configuração do servidor.');return}const f=new FormData(e.currentTarget),email=String(f.get('email')||''),password=String(f.get('password')||'');setBusy(true);try{let r:any;
if(mode==='login')r=await supabase.auth.signInWithPassword({email,password});
if(mode==='signup')r=await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
if(mode==='recover')r=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/?recovery=1'});
if(mode==='update'){if(password!==f.get('confirm'))throw Error('As senhas precisam ser iguais.');r=await supabase.auth.updateUser({password})}
if(r.error)throw r.error;
if(mode==='signup')setMessage('Confira seu e-mail para confirmar o cadastro.');
if(mode==='recover')setMessage('Se houver uma conta para este e-mail, você receberá as instruções de recuperação.');
if(mode==='update'){history.replaceState({},'',location.pathname);setMode('login');setMessage('Senha atualizada com sucesso.');}
}catch(err:any){setError(translate(err?.message||'',mode))}finally{setBusy(false)}}
if(loading)return <div className="auth-loading">Carregando seu espaço…</div>;
if(session&&mode!=='update'&&!new URLSearchParams(location.search).has('recovery'))return <App/>;
const titles:any={login:'Bom ter você por aqui.',signup:'Comece uma nova fase.',recover:'Vamos recuperar seu acesso.',update:'Escolha sua nova senha.'};
return <div className="auth-layout"><section className="auth-brand"><div className="logo"><span>×</span>Xingu<span className="logodot">.</span></div><div className="auth-pitch"><div className="auth-pill">MENOS PLANILHAS. MAIS POSSIBILIDADES.</div><h1>Seu estoque.<br/>Seu ritmo.<br/><em>Seu próximo passo.</em></h1><p>Produtos organizados, vendas acompanhadas e números claros para o seu negócio crescer.</p><div className="auth-preview"><div><Package size={20}/><span>Estoque organizado</span><ShieldCheck size={17}/></div><div><BarChart3 size={20}/><span>Resultados em tempo real</span><ArrowUpRight size={17}/></div></div></div><small>Xingu · Gestão feita para simplificar.</small></section><main className="auth-main"><div className="auth-card"><span className="eyebrow">SEU ESPAÇO DE GESTÃO</span><h2>{titles[mode]}</h2><p>{mode==='login'?'Entre para acompanhar o que importa.':mode==='signup'?'Use o e-mail autorizado pela administração da loja.':mode==='recover'?'Informe o e-mail cadastrado para receber as instruções.':'Use pelo menos 12 caracteres para proteger sua conta.'}</p>{!configured&&<div className="auth-pending">Configuração de acesso pendente. O cadastro e o login ainda não estão disponíveis.</div>}<form onSubmit={submit}>{mode!=='update'&&<label>E-mail<input type="email" name="email" autoComplete="email" placeholder="voce@exemplo.com" required/></label>}{mode!=='recover'&&<label>Senha<div className="password-wrap"><input type={show?'text':'password'} name="password" minLength={mode==='login'?1:12} autoComplete={mode==='login'?'current-password':'new-password'} required placeholder={mode==='login'?'Sua senha':'No mínimo 12 caracteres'}/><button type="button" aria-label={show?'Ocultar senha':'Mostrar senha'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}{mode==='update'&&<label>Confirmar senha<input type="password" name="confirm" minLength={12} autoComplete="new-password" required/></label>}{mode==='login'&&<button className="auth-link" type="button" onClick={()=>{setMode('recover');setError('');setMessage('')}}>Esqueceu a senha?</button>}{error&&<div role="alert" className="error">{error}</div>}{message&&<div role="status" className="success">{message}</div>}<button className="primary auth-submit" disabled={busy||!configured}>{busy?'Aguarde…':mode==='login'?'Entrar':mode==='signup'?'Criar conta':mode==='recover'?'Enviar instruções':'Salvar nova senha'}<ArrowRight size={18}/></button></form><div className="auth-switch">{mode==='login'?'Ainda não tem conta?':'Já tem uma conta?'} <button className="auth-link" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setMessage('');if(location.search)history.replaceState({},'',location.pathname)}}>{mode==='login'?'Cadastre-se':'Voltar para entrar'}</button></div><div className="auth-security"><ShieldCheck size={15}/>Seu negócio, em um espaço protegido.</div></div></main></div>}
createRoot(document.getElementById('root')!).render(<Root/>);
