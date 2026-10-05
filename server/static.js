import"dotenv/config";import express from"express";import{resolve}from"node:path";
const app=express();const dist=resolve("dist");
app.disable("x-powered-by");
app.use(express.static(dist,{immutable:true,maxAge:"1y",index:false}));
app.get("*",(_req,res)=>res.sendFile(resolve(dist,"index.html")));
const port=Number(process.env.PORT||3000);
app.listen(port,()=>console.log(`BravoShop web listening on ${port}`));
