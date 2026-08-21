import "server-only";
import { z } from "zod";

export type AppEnvironment = "development" | "test" | "staging" | "production";
const schema=z.object({APP_ENV:z.enum(["development","test","staging","production"]).default("development"),DATABASE_URL:z.string().min(1),INTEGRATION_MASTER_KEY:z.string().optional(),EMAIL_PROVIDER:z.enum(["development","disabled"]).default("development"),BILLING_PROVIDER:z.string().default("mock"),REDIS_REST_URL:z.string().url().optional(),REDIS_REST_TOKEN:z.string().optional()});
let cached:z.infer<typeof schema>|undefined;
export function getServerEnv(){if(cached)return cached;const value=schema.parse(process.env);if((value.APP_ENV==="staging"||value.APP_ENV==="production")&&!value.DATABASE_URL.startsWith("postgresql://")&&!value.DATABASE_URL.startsWith("postgres://"))throw new Error("Invalid deployment configuration: PostgreSQL is required.");if(value.APP_ENV==="production"){const missing=[];if(!value.INTEGRATION_MASTER_KEY)missing.push("INTEGRATION_MASTER_KEY");if(value.EMAIL_PROVIDER==="development")missing.push("EMAIL_PROVIDER");if(value.BILLING_PROVIDER==="mock")missing.push("BILLING_PROVIDER");if(!value.REDIS_REST_URL||!value.REDIS_REST_TOKEN)missing.push("REDIS_REST_URL/REDIS_REST_TOKEN");if(missing.length)throw new Error(`Invalid production configuration. Missing production services: ${missing.join(", ")}`)}cached=value;return value}
export function resetEnvCacheForTests(){cached=undefined}
