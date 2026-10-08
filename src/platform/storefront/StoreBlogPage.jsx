import React,{useEffect,useState}from"react";
import{getPublicBlogPost,listPublicBlogPosts}from"../data/blogService.js";
import{safeStorefrontImage}from"./security.js";
export function StoreBlogPage({store,host,slug}){
 const[posts,setPosts]=useState([]),[post,setPost]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{let alive=true;setLoading(true);setError("");
 (slug?getPublicBlogPost(host,slug).then(x=>{if(alive)setPost(x)}):listPublicBlogPosts(host).then(xs=>{if(alive)setPosts(xs)}))
 .catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});
 return()=>{alive=false}},[host,slug]);
 useEffect(()=>{if(post)document.title=post.title+" · "+store.name},[post,store.name]);
 return <div className="storefront shopV2 storeBlogPage"><header className="storeHeader"><a className="storeBrand" href="/">{store.name}</a><nav><a href="/">Tienda</a><a href="/blog">Blog</a></nav></header><main className="blogPublicMain"><div className="blogPublicIntro"><small>{store.name.toUpperCase()} · CONTENIDO</small><h1>{slug?(post?.title||"Artículo"): "Historias, ideas y novedades"}</h1><p>{slug?post?.excerpt:"Descubre noticias, ideas y consejos de esta tienda."}</p></div>{loading?<p>Cargando contenido…</p>:error?<div className="errorBox">{error}</div>:slug&&post?<article className="blogPublicArticle">{safeStorefrontImage(post.cover_url)&&<img src={safeStorefrontImage(post.cover_url)} alt=""/>}<small>{post.published_at?new Date(post.published_at).toLocaleDateString("es-ES"):""}</small><div className="blogArticleBody">{post.content}</div><a href="/blog">← Todos los artículos</a></article>:<div className="blogPublicGrid">{posts.length?posts.map(p=><a href={"/blog/"+encodeURIComponent(p.slug)} key={p.id} className="blogPublicCard">{safeStorefrontImage(p.cover_url)&&<img src={safeStorefrontImage(p.cover_url)} alt=""/>}<small>{p.published_at?new Date(p.published_at).toLocaleDateString("es-ES"):""}</small><h2>{p.title}</h2><p>{p.excerpt}</p><span>Leer artículo →</span></a>):<p>Todavía no hay artículos publicados.</p>}</div>}</main><footer className="blogPublicFooter"><a href="/">← Volver a {store.name}</a><span>Powered by BravoShop</span></footer></div>
}
