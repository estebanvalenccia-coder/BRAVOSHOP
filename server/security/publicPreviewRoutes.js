// A draft-preview capability may only read catalog and published blog content.
export function isPreviewContentRequest(method,path){
 if(method!=="GET"||typeof path!=="string")return false;
 if(path==="/store"||path==="/products"||path==="/categories"||path==="/blog/posts")return true;
 return /^\/(?:products|blog\/posts)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
}
