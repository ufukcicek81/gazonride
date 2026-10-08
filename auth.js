(function(){
"use strict";
var cfg=window.GAZONRIDE_FIREBASE_CONFIG||{}, admins=(window.GAZONRIDE_ADMIN_EMAILS||[]).map(function(x){return String(x).toLowerCase()});
var configured=!!(cfg.apiKey&&cfg.authDomain&&cfg.projectId&&cfg.appId);
var resolveReady,ready=new Promise(function(r){resolveReady=r}),state={configured:configured,user:null,profile:null,role:"member"};
function pathName(){return (location.pathname.split("/").pop()||"index.html").toLowerCase()}
function redirectLogin(){var next=encodeURIComponent(location.href);location.replace("login.html?next="+next)}
function saveLocalProfile(p){if(!p)return;localStorage.setItem("gazon_profile",JSON.stringify({name:p.name||"GaZonRide sürücüsü",bike:p.bike||"Motosiklet"}))}
function syncUi(){
 var p=state.profile||{},w=document.getElementById("homeWelcome");if(w)w.textContent=p.name?"Merhaba, "+p.name:"GaZonRide";
 var motor=document.getElementById("motorBtn");if(motor&&p.bike)motor.innerHTML='<span class="mi">two_wheeler</span><span>'+String(p.bike).replace(/[<>]/g,"")+'</span><span class="mi chev">expand_more</span>';
}
async function loadProfile(user){
 var snap=await firebase.database().ref("users/"+user.uid).once("value"),p=snap.val()||{};
 var email=(user.email||"").toLowerCase(),isListed=admins.indexOf(email)>=0;
 var role=(isListed&&user.emailVerified)?"admin":(p.role||"member");
 state.profile={uid:user.uid,email:user.email||"",name:p.name||user.displayName||"GaZonRide sürücüsü",bike:p.bike||"Motosiklet",role:role};
 state.role=role;saveLocalProfile(state.profile);syncUi();return state.profile;
}
async function register(email,password,name,bike){
 if(!configured)throw new Error("Firebase ayarı henüz tamamlanmadı.");
 var cr=await firebase.auth().createUserWithEmailAndPassword(email,password),u=cr.user;
 if(name)await u.updateProfile({displayName:name});
 await firebase.database().ref("users/"+u.uid).set({email:email,name:name||"GaZonRide sürücüsü",bike:bike||"Motosiklet",role:"member",createdAt:firebase.database.ServerValue.TIMESTAMP});
 try{await u.sendEmailVerification()}catch(e){}
 await loadProfile(u);return u;
}
async function login(email,password){if(!configured)throw new Error("Firebase ayarı henüz tamamlanmadı.");var cr=await firebase.auth().signInWithEmailAndPassword(email,password);await loadProfile(cr.user);return cr.user}
async function logout(){if(configured)await firebase.auth().signOut();localStorage.removeItem("gazon_profile");location.href="login.html"}
function openAdmin(){if(!configured){alert("Üyelik altyapısının Firebase bağlantısı tamamlanınca admin paneli merkezi çalışacak.");return}location.href="admin.html"}
function requireAdmin(){return ready.then(function(){if(!state.user){redirectLogin();return false}if(state.role!=="admin"){return false}return true})}
if(!configured){resolveReady(state)}
else{
 try{
  if(!firebase.apps.length)firebase.initializeApp(cfg);
  firebase.auth().onAuthStateChanged(async function(user){
   state.user=user||null;
   if(user){try{await loadProfile(user)}catch(e){console.warn(e)}}
   resolveReady(state);
   var page=pathName();
   if(!user&&page!=="login.html")redirectLogin();
   if(user&&page==="login.html"){var qs=new URLSearchParams(location.search),n=qs.get("next");location.replace(n||"index.html")}
  });
 }catch(e){console.error("GaZonRide auth init",e);resolveReady(state)}
}
window.GaZonAuth={configured:configured,state:state,ready:ready,register:register,login:login,logout:logout,openAdmin:openAdmin,requireAdmin:requireAdmin,db:function(){return configured?firebase.database():null},auth:function(){return configured?firebase.auth():null}};
})();