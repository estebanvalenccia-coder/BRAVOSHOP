import React,{useState}from"react";
import{ArrowLeft,Store,ShieldCheck,BarChart3,CreditCard}from"lucide-react";
import{useAuth}from"./AuthProvider.jsx";

export function AuthScreen({mode="login",onDone,onBack,onModeChange,resetToken=""}){
 const{signIn,signUp,requestPasswordReset,resetPassword}=useAuth();
 const[form,setForm]=useState({name:"",email:"",password:"",confirm:""});
 const[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const register=mode==="register",forgot=mode==="forgot",reset=mode==="reset";
 async function submit(e){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   if(forgot){
    await requestPasswordReset(form.email);
    setNotice("Si existe una cuenta activa con ese correo, recibirás un enlace para crear una nueva contraseña.");
   }else if(reset){
    if(form.password!==form.confirm)throw new Error("Las contraseñas no coinciden");
    await resetPassword(resetToken,form.password);
    setNotice("Contraseña actualizada correctamente. Ya puedes iniciar sesión.");
   }else if(register){
    await signUp(form.email,form.password,form.name);await onDone?.();
   }else{
    await signIn(form.email,form.password);await onDone?.();
   }
  }catch(err){setError(err.message)}
  finally{setBusy(false)}
 }
 const title=register?"Crea tu cuenta":forgot?"Recupera tu acceso":reset?"Crea una nueva contraseña":"Bienvenido de nuevo";
 const lead=register?"Una cuenta puede gestionar una o varias tiendas.":forgot?"Te enviaremos un enlace seguro si encontramos una cuenta activa.":reset?"El enlace solo puede utilizarse una vez y caduca automáticamente.":"Entra para gestionar tus tiendas.";
 return <div className="authPage">
  <button className="ghost authBack" onClick={onBack}><ArrowLeft size={16}/> Volver</button>
  <div className="authVisual">
   <span className="eyebrow">BRAVOSHOP COMMERCE OS</span><h2>Tu tienda, tus clientes, tu dinero.</h2><p>Gestiona todo tu negocio desde un único lugar sin tocar código.</p>
   <div className="authBenefits"><div><BarChart3/><span><b>Control en tiempo real</b><small>Ventas, pedidos e inventario</small></span></div><div><CreditCard/><span><b>Pagos conectados</b><small>Cada comercio recibe sus ventas</small></span></div><div><ShieldCheck/><span><b>Diseñado para crecer</b><small>Datos y tiendas aislados de forma segura</small></span></div></div>
   <div className="authMiniDash"><span>Ventas de hoy</span><strong>€1.284,50</strong><i>+18,4%</i></div>
  </div>
  <div className="authCard">
   <div className="authMark"><Store size={24}/></div><small>BRAVOSHOP</small><h1>{title}</h1><p>{lead}</p>
   <form onSubmit={submit}>
    {register&&<label>Nombre<input autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>}
    {!reset&&<label>Email<input type="email" autoComplete="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>}
    {!forgot&&<label>Nueva contraseña{!reset&&"Contraseña"}<input type="password" autoComplete={register||reset?"new-password":"current-password"} minLength="8" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>}
    {reset&&<label>Repetir contraseña<input type="password" autoComplete="new-password" minLength="8" required value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}/></label>}
    {error&&<div className="errorBox">{error}</div>}{notice&&<div className="successBox">{notice}</div>}
    {!(reset&&notice)&&<button disabled={busy} type="submit">{busy?"Un momento…":forgot?"Enviar enlace":reset?"Guardar nueva contraseña":register?"Crear cuenta":"Entrar"}</button>}
   </form>
   {!register&&!forgot&&!reset&&onModeChange&&<button className="ghost authSecondary" type="button" onClick={()=>{setError("");setNotice("");onModeChange("forgot")}}>¿Olvidaste tu contraseña?</button>}
   {forgot&&onModeChange&&<button className="ghost authSecondary" type="button" onClick={()=>{setError("");setNotice("");onModeChange("login")}}>Volver a iniciar sesión</button>}
   {reset&&notice&&<button type="button" onClick={()=>onDone?.()}>Ir a iniciar sesión</button>}
  </div>
 </div>
}
