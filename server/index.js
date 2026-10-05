import"dotenv/config";import express from"express";import cors from"cors";import helmet from"helmet";import{authRouter}from"./routes/auth.js";import{storesRouter}from"./routes/stores.js";import{commerceRouter}from"./routes/commerce.js";import{mediaRouter}from"./routes/media.js";
const app=express();app.disable("x-powered-by");app.use(helmet());app.use(cors({origin:process.env.FRONTEND_ORIGIN||"http://localhost:5173",credentials:true}));app.use(express.json({limit:"2mb"}));
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"bravoshop-api"}));
app.use("/api/auth",authRouter);app.use("/api/stores",storesRouter);app.use("/api/stores/:storeId",commerceRouter);app.use("/api/stores/:storeId",mediaRouter);
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:"Error interno"});});
const port=Number(process.env.PORT||3001);app.listen(port,()=>console.log(`BravoShop API listening on ${port}`));