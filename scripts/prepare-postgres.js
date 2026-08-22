const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "prisma", "schema.prisma");
const targetDir = path.join(root, "prisma", "postgresql");
const target = path.join(targetDir, "schema.prisma");

fs.mkdirSync(targetDir, { recursive: true });
const schema = fs
  .readFileSync(source, "utf8")
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace(
    'generator client {\n  provider = "prisma-client-js"',
    'generator client {\n  provider = "prisma-client-js"\n  output   = "../../generated/postgresql-client"'
  );
fs.writeFileSync(target, schema);

function run(command) {
  const result = spawnSync(command, { stdio: "inherit", cwd: root, shell: true });
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`Command failed: ${command}`);
  }
}

run(`npx prisma format --schema "${target}"`);
run(`npx prisma generate --schema "${target}"`);
process.stdout.write(`PostgreSQL schema generated in ${targetDir}; migration history was preserved.\n`);
