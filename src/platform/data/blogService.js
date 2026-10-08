import{api,publicApi}from"../../lib/api.js";
export async function listBlogPosts(storeId){const r=await api("/api/stores/"+storeId+"/blog/posts");return r.posts||[]}
export async function saveBlogPost(storeId,post){const path="/api/stores/"+storeId+"/blog/posts"+(post.id?"/"+post.id:"");const r=await api(path,{method:post.id?"PATCH":"POST",body:post});return r.post}
export async function deleteBlogPost(storeId,id){return api("/api/stores/"+storeId+"/blog/posts/"+id,{method:"DELETE"})}
export async function listPublicBlogPosts(host){const r=await publicApi("/api/public/blog/posts?host="+encodeURIComponent(host));return r.posts||[]}
export async function getPublicBlogPost(host,slug){const r=await publicApi("/api/public/blog/posts/"+encodeURIComponent(slug)+"?host="+encodeURIComponent(host));return r.post}
