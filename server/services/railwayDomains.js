const endpoint="https://backboard.railway.com/graphql/v2";

function config(){
 const projectId=process.env.BRAVOSHOP_RAILWAY_PROJECT_ID;
 const environmentId=process.env.BRAVOSHOP_RAILWAY_ENVIRONMENT_ID;
 const serviceId=process.env.BRAVOSHOP_STOREFRONT_SERVICE_ID;
 const projectToken=process.env.BRAVOSHOP_RAILWAY_PROJECT_TOKEN;
 const apiToken=process.env.BRAVOSHOP_RAILWAY_API_TOKEN;
 return{projectId,environmentId,serviceId,projectToken,apiToken};
}

export function railwayDomainsReady(){
 const c=config();
 return Boolean(c.projectId&&c.environmentId&&c.serviceId&&(c.projectToken||c.apiToken));
}

async function gql(query,variables={}){
 const c=config();
 if(!railwayDomainsReady())throw new Error("Railway domain provisioning is not configured");
 const headers={"Content-Type":"application/json"};
 if(c.projectToken)headers["Project-Access-Token"]=c.projectToken;
 else headers.Authorization=`Bearer ${c.apiToken}`;
 const response=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({query,variables})});
 const body=await response.json().catch(()=>({}));
 if(!response.ok||body.errors?.length){
  const error=new Error(body.errors?.map(x=>x.message).join("; ")||`Railway API ${response.status}`);
  error.code="RAILWAY_DOMAIN_API_ERROR";
  throw error;
 }
 return body.data;
}

async function serviceDomains(){
 const c=config();
 const data=await gql(
  `query Domains($projectId:String!,$environmentId:String!,$serviceId:String!){
   domains(projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId){
    customDomains{id domain status{verificationToken dnsRecords{hostlabel requiredValue currentValue status}}}
   }
  }`,
  {projectId:c.projectId,environmentId:c.environmentId,serviceId:c.serviceId}
 );
 return data?.domains?.customDomains||[];
}

export async function ensureRailwayCustomDomain(hostname){
 const c=config();
 const existing=(await serviceDomains()).find(x=>String(x.domain).toLowerCase()===String(hostname).toLowerCase());
 if(existing)return existing;
 const data=await gql(
  `mutation CreateCustomDomain($input:CustomDomainCreateInput!){
   customDomainCreate(input:$input){
    id domain status{verificationToken dnsRecords{hostlabel requiredValue currentValue status}}
   }
  }`,
  {input:{projectId:c.projectId,environmentId:c.environmentId,serviceId:c.serviceId,domain:hostname}}
 );
 return data.customDomainCreate;
}

export async function getRailwayCustomDomain(id){
 const c=config();
 const data=await gql(
  `query CustomDomain($id:String!,$projectId:String!){
   customDomain(id:$id,projectId:$projectId){
    id domain status{
     verificationToken
     dnsRecords{hostlabel requiredValue currentValue status}
     certificateStatus
    }
   }
  }`,
  {id,projectId:c.projectId}
 );
 return data.customDomain;
}

export async function deleteRailwayCustomDomain(id){
 if(!id||!railwayDomainsReady())return false;
 await gql(`mutation DeleteCustomDomain($id:String!){customDomainDelete(id:$id)}`,{id});
 return true;
}
