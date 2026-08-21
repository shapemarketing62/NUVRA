const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename; const originalLoad = Module._load;
Module._resolveFilename = function(request,parent,isMain,options){if(request.startsWith("@/"))request=path.join(root,request.slice(2));return originalResolve.call(this,request,parent,isMain,options)};
Module._load = function(request,parent,isMain){if(request==="server-only")return {};return originalLoad.call(this,request,parent,isMain)};
require.extensions[".ts"] = function(module,filename){const source=fs.readFileSync(filename,"utf8");const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,moduleResolution:ts.ModuleResolutionKind.NodeJs},fileName:filename}).outputText;module._compile(output,filename)};

const { PrismaClient } = require("@prisma/client"); const prisma = new PrismaClient();
process.env.INTEGRATION_MASTER_KEY = Buffer.alloc(32, 9).toString("base64"); process.env.META_APP_ID="test"; process.env.META_APP_SECRET="test-secret"; process.env.META_REDIRECT_URI="http://localhost/callback";
const { IntegrationManager } = require("../services/integrations/integration-manager.ts");
const { integrationProviders } = require("../services/integrations/providers.ts");
const { EvidenceAggregator } = require("../services/intelligence/evidence-aggregator.ts");

let fixture; const originalInstagram = integrationProviders.instagram;
test.before(async()=>{const suffix=crypto.randomUUID();const user=await prisma.user.create({data:{email:`integration-${suffix}@test.local`,passwordHash:"test"}});const organization=await prisma.organization.create({data:{name:"Integration test",slug:`integration-${suffix}`,memberships:{create:{userId:user.id,role:"owner"}}}});const business=await prisma.business.create({data:{nombre:"Test business",rubro:"Cafetería",organizationId:organization.id}});fixture={user,organization,business};});

test("conexión cifra credenciales y listado no expone secretos",async()=>{integrationProviders.instagram={key:"instagram",sourceType:"instagram",requiredScopes:["instagram_basic"],configured:()=>true,async sync(){return{evidence:{source:"instagram",status:"evaluated",data:{posts:2},findings:[],confidence:"MEDIA",coverage:50,evaluatedAt:new Date(),requiresAuth:false}}}};const manager=new IntegrationManager();await manager.connect({actorUserId:fixture.user.id,organizationId:fixture.organization.id,businessId:fixture.business.id,provider:"instagram",credentials:{accessToken:"never-visible"}});const secret=await prisma.integrationSecret.findFirst({where:{organizationId:fixture.organization.id,provider:"instagram"}});assert.ok(secret);assert.doesNotMatch(secret.encryptedData,/never-visible/);assert.doesNotMatch(JSON.stringify(await manager.list(fixture.organization.id,fixture.business.id)),/never-visible|encryptedData|accessToken/);});

test("desconexión revoca el secreto",async()=>{const manager=new IntegrationManager();await manager.disconnect({actorUserId:fixture.user.id,organizationId:fixture.organization.id,businessId:fixture.business.id,provider:"instagram"});assert.equal(await prisma.integrationSecret.count({where:{organizationId:fixture.organization.id,provider:"instagram"}}),0);const item=(await manager.list(fixture.organization.id,fixture.business.id)).find(item=>item.provider==="instagram");assert.equal(item.status,"disconnected");});

test("token expirado requiere nueva autorización",async()=>{const manager=new IntegrationManager();await manager.connect({actorUserId:fixture.user.id,organizationId:fixture.organization.id,businessId:fixture.business.id,provider:"instagram",credentials:{accessToken:"expired"},expiresAt:new Date(Date.now()-1000)});const evidence=await manager.sync({organizationId:fixture.organization.id,businessId:fixture.business.id,provider:"instagram"});assert.equal(evidence.status,"requires_auth");const item=(await manager.list(fixture.organization.id,fixture.business.id)).find(item=>item.provider==="instagram");assert.equal(item.status,"expired");});

test("integración configurada sin credenciales queda requires_auth",async()=>{await prisma.integration.deleteMany({where:{organizationId:fixture.organization.id,provider:"instagram"}});const result=await new IntegrationManager().connect({actorUserId:fixture.user.id,organizationId:fixture.organization.id,businessId:fixture.business.id,provider:"instagram"});assert.equal(result.status,"requires_auth");});

test("fallo de provider se aísla y no expone el error técnico",async()=>{integrationProviders.instagram={...integrationProviders.instagram,configured:()=>true,async sync(){throw new Error("provider secret failure")}};const manager=new IntegrationManager();await manager.connect({actorUserId:fixture.user.id,organizationId:fixture.organization.id,businessId:fixture.business.id,provider:"instagram",credentials:{accessToken:"safe"}});const evidence=await manager.sync({organizationId:fixture.organization.id,businessId:fixture.business.id,provider:"instagram"});assert.equal(evidence.status,"unavailable");assert.doesNotMatch(JSON.stringify(evidence),/provider secret failure|safe/);});

test("una fuente caída no rompe la agregación general",async()=>{const aggregator=new EvidenceAggregator();const relevance={source:"other",relevant:true,reason:"test",weight:1};aggregator.registerSource({type:"other",requiresAuth:false,requiresPermission:false,isAvailable:()=>true,isRelevant:()=>relevance,analyze:async()=>{throw new Error("down")}});aggregator.registerSource({type:"web",requiresAuth:false,requiresPermission:false,isAvailable:()=>true,isRelevant:()=>({...relevance,source:"web"}),analyze:async()=>({source:"web",status:"evaluated",data:{},findings:[],confidence:"MEDIA",coverage:60,evaluatedAt:new Date(),requiresAuth:false})});const result=await aggregator.aggregate(fixture.business);assert.equal(result.sources.other.status,"unavailable");assert.equal(result.sources.web.status,"evaluated");});

test.after(async()=>{integrationProviders.instagram=originalInstagram;if(fixture){await prisma.organization.delete({where:{id:fixture.organization.id}});await prisma.user.delete({where:{id:fixture.user.id}})}await prisma.$disconnect();});
