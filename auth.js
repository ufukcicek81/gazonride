(function(){
"use strict";
var url=window.GAZONRIDE_SUPABASE_URL||"", key=window.GAZONRIDE_SUPABASE_KEY||"";
var configured=!!(url&&key&&window.supabase&&window.supabase.createClient);
var client=configured?window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
var resolved=false,resolveReady,ready=new Promise(function(r){resolveReady=r});
var state={configured:configured,user:null,profile:null,role:"member"};

function pathName(){return (location.pathname.split("/").pop()||"index.html").toLowerCase()}
function redirectLogin(){if(pathName()==="login.html")return;var next=encodeURIComponent(location.href);location.replace("login.html?next="+next)}
function saveLocalProfile(p){if(!p)return;localStorage.setItem("gazon_profile",JSON.stringify({name:p.name||"GaZonRide sürücüsü",bike:p.bike||"Motosiklet"}))}
function syncUi(){
 var p=state.profile||{},w=document.getElementById("homeWelcome");if(w)w.textContent=p.name?"Merhaba, "+p.name:"GaZonRide";
 var adminBtn=document.getElementById("homeAdmin");if(adminBtn)adminBtn.style.display=state.role==="admin"?"flex":"none";
 var motor=document.getElementById("motorBtn");if(motor&&p.bike)motor.innerHTML='<span class="mi">two_wheeler</span><span>'+String(p.bike).replace(/[<>]/g,"")+'</span><span class="mi chev">expand_more</span>';
}
async function ensureProfile(user){
 var meta=user.user_metadata||{},fallback={id:user.id,name:meta.name||"GaZonRide sürücüsü",bike:meta.bike||"Motosiklet"};
 var res=await client.from("profiles").select("id,name,bike,avatar_url").eq("id",user.id).maybeSingle();
 if(res.error)throw res.error;
 if(!res.data){
   var ins=await client.from("profiles").insert(fallback).select("id,name,bike,avatar_url").single();
   if(ins.error)throw ins.error;
   res.data=ins.data;
 }
 var adm=await client.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
 var role=adm.data?"admin":"member";
 state.profile={uid:user.id,email:user.email||"",name:res.data.name||fallback.name,bike:res.data.bike||fallback.bike,avatar_url:res.data.avatar_url||"",role:role};
 state.role=role;saveLocalProfile(state.profile);syncUi();return state.profile;
}
async function applySession(session){
 state.user=session&&session.user?session.user:null;
 state.profile=null;state.role="member";
 if(state.user){try{await ensureProfile(state.user)}catch(e){console.warn("profile",e)}}
 if(!resolved){resolved=true;resolveReady(state)}
 var page=pathName();
 if(!state.user&&page!=="login.html")redirectLogin();
 if(state.user&&page==="login.html"){
   var qs=new URLSearchParams(location.search),n=qs.get("next");
   location.replace(n||"index.html");
 }
}
async function register(email,password,name,bike){
 if(!configured)throw new Error("Supabase bağlantısı hazır değil.");
 var redirect=new URL("login.html",location.href).href;
 var r=await client.auth.signUp({email:email,password:password,options:{data:{name:name||"GaZonRide sürücüsü",bike:bike||"Motosiklet"},emailRedirectTo:redirect}});
 if(r.error)throw r.error;
 if(r.data.session)await applySession(r.data.session);
 return {user:r.data.user,session:r.data.session,needsVerification:!r.data.session};
}
async function login(email,password){
 if(!configured)throw new Error("Supabase bağlantısı hazır değil.");
 var r=await client.auth.signInWithPassword({email:email,password:password});
 if(r.error)throw r.error;await applySession(r.data.session);return r.data.user;
}
async function socialLogin(provider){
 if(!configured)throw new Error("Supabase bağlantısı hazır değil.");
 provider=String(provider||"").toLowerCase();
 if(["google","apple"].indexOf(provider)<0)throw new Error("Desteklenmeyen giriş yöntemi.");
 var isAndroid=!!(window.AndroidBridge&&typeof window.AndroidBridge.openOAuth==="function");
 var redirectTo=isAndroid?"gazonride://auth/callback":location.href;
 var r=await client.auth.signInWithOAuth({provider:provider,options:{redirectTo:redirectTo,skipBrowserRedirect:isAndroid}});
 if(r.error)throw r.error;
 if(isAndroid&&r.data&&r.data.url)window.AndroidBridge.openOAuth(r.data.url);
 return r.data;
}
async function completeOAuthCallback(callbackUrl){
 if(!configured||!callbackUrl)return false;
 try{
  var u=new URL(callbackUrl),hash=new URLSearchParams((u.hash||"").replace(/^#/,"")),query=u.searchParams;
  var err=hash.get("error_description")||query.get("error_description")||hash.get("error")||query.get("error");
  if(err)throw new Error(decodeURIComponent(err));
  var access=hash.get("access_token"),refresh=hash.get("refresh_token");
  if(access&&refresh){
   var sr=await client.auth.setSession({access_token:access,refresh_token:refresh});
   if(sr.error)throw sr.error;
   await applySession(sr.data.session);
   location.replace("index.html");
   return true;
  }
  var code=query.get("code");
  if(code){
   var er=await client.auth.exchangeCodeForSession(code);
   if(er.error)throw er.error;
   await applySession(er.data.session);
   location.replace("index.html");
   return true;
  }
  throw new Error("OAuth dönüş bilgisi bulunamadı.");
 }catch(e){
  console.error("OAuth callback",e);
  try{localStorage.setItem("gazon_oauth_error",e.message||String(e));}catch(_){}
  location.replace("login.html?oauth_error=1");
  return false;
 }
}
async function logout(){if(configured)await client.auth.signOut();localStorage.removeItem("gazon_profile");location.href="login.html"}
async function saveProfile(name,bike){
 if(!state.user)throw new Error("Oturum bulunamadı.");
 var r=await client.from("profiles").update({name:name,bike:bike,updated_at:new Date().toISOString()}).eq("id",state.user.id).select("id,name,bike,avatar_url").single();
 if(r.error)throw r.error;state.profile=Object.assign({},state.profile,r.data);saveLocalProfile(state.profile);syncUi();return state.profile;
}
async function claimFirstAdmin(){
 if(!state.user)throw new Error("Önce giriş yap.");
 var r=await client.rpc("claim_first_admin");if(r.error)throw r.error;
 if(r.data){await ensureProfile(state.user);return state.role==="admin"}return false;
}
function openAdmin(){if(!configured){alert("Supabase bağlantısı hazır değil.");return}location.href="admin.html"}
async function requireAdmin(){await ready;if(!state.user){redirectLogin();return false}return state.role==="admin"}

if(!configured){resolved=true;resolveReady(state)}
else{
 client.auth.onAuthStateChange(function(event,session){setTimeout(function(){applySession(session)},0)});
 client.auth.getSession().then(function(r){applySession(r.data.session)}).catch(function(e){console.error(e);if(!resolved){resolved=true;resolveReady(state)}});
}
window.GaZonAuth={configured:configured,state:state,ready:ready,client:client,register:register,login:login,socialLogin:socialLogin,completeOAuthCallback:completeOAuthCallback,logout:logout,saveProfile:saveProfile,claimFirstAdmin:claimFirstAdmin,openAdmin:openAdmin,requireAdmin:requireAdmin};
})();