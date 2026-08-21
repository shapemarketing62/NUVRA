const fs=require("node:fs"),{spawnSync}=require("node:child_process");
const local=process.argv.includes("--local"),appEnv=process.env.APP_ENV||"development",critical=[];
if(!local&&!['staging','production'].includes(appEnv))critical.push("APP_ENV");
if(!local&&!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL||""))critical.push("DATABASE_URL(PostgreSQL)");
if(!local&&!process.env.INTEGRATION_MASTER_KEY)critical.push("INTEGRATION_MASTER_KEY");
if(!local&&!process.env.EMAIL_PROVIDER)critical.push("EMAIL_PROVIDER");
if(appEnv==="production"&&(!process.env.REDIS_REST_URL||!process.env.REDIS_REST_TOKEN))critical.push("Redis");
if(!fs.existsSync("prisma/postgresql/migrations/0001_initial/migration.sql"))critical.push("PostgreSQL migrations");
if(critical.length){process.stderr.write(`Release blocked. Missing: ${critical.join(", ")}\n`);process.exit(1)}
const npm=process.platform==="win32"?"npm.cmd":"npm",npx=process.platform==="win32"?"npx.cmd":"npx";
const steps=[[npx,["prisma","validate"]],[npx,["tsc","--noEmit"]],[npm,["run","test:security"]],[npm,["run","test:production"]],[npm,["run","test:integrations"]],[npm,["run","test:billing"]],[npm,["run","test:infrastructure"]],[npm,["run","test:staging"]],[npm,["run","build"]]];
for(const[bin,args]of steps){const result=spawnSync(bin,args,{stdio:"inherit",shell:process.platform==="win32"});if(result.status!==0)process.exit(result.status||1)}
async function external(){if(local){process.stdout.write("Local release checks passed; external readiness skipped\n");return}const{PrismaClient}=require("@prisma/client"),db=new PrismaClient();try{await db.$queryRaw`SELECT 1`}finally{await db.$disconnect()}const status=spawnSync(npx,["prisma","migrate","status","--schema","prisma/postgresql/schema.prisma"],{stdio:"inherit",shell:process.platform==="win32"});if(status.status!==0)throw new Error("Pending or invalid migrations");if(!process.env.STAGING_BASE_URL)throw new Error("STAGING_BASE_URL is required");for(const route of ["/api/health/live","/api/health/ready"]){const response=await fetch(new URL(route,process.env.STAGING_BASE_URL));if(!response.ok)throw new Error(`Health check failed: ${route}`)}process.stdout.write("Release checks passed\n")}
external().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1});
