import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import chalk from "chalk";
import { execa } from "execa";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findProjectRoot } from "../../utils/package-root.js";

function templatesDir(): string {
  return join(findProjectRoot(), "templates");
}

async function tryRun(label: string, cmd: string, args: string[], cwd: string): Promise<boolean> {
  try {
    await execa(cmd, args, { cwd, stdio: "inherit" });
    return true;
  } catch {
    p.log.warn(`${label} failed — run it yourself: ${chalk.bold(`${cmd} ${args.join(" ")}`)} (in ${cwd})`);
    return false;
  }
}

async function scaffoldBackend(root: string, noInstall: boolean): Promise<void> {
  const dir = join(root, "backend");
  const tpl = templatesDir();
  await cp(join(tpl, "backend"), dir, { recursive: true });
  await writeFile(join(dir, ".prettierrc"), await readFile(join(tpl, "config", "prettierrc.backend.json"), "utf-8"));
  await writeFile(join(dir, "eslint.config.mjs"), await readFile(join(tpl, "config", "eslint.backend.mjs"), "utf-8"));

  const pkg = {
    name: "backend",
    version: "0.1.0",
    private: true,
    scripts: {
      dev: 'nodemon --watch src --ext ts,js --exec "ts-node src/index.ts"',
      build: "tsc",
      start: "node dist/index.js",
      lint: "eslint .",
      format: "prettier --write .",
      "format:check": "prettier --check .",
    },
    dependencies: {
      express: "^5", pg: "^8", dotenv: "^17", cors: "^2", joi: "^18", uuid: "^11", bcryptjs: "^3",
    },
    devDependencies: {
      typescript: "^5", "@types/node": "^25", "ts-node": "^10", "@types/express": "^5",
      "@types/pg": "^8", "@types/cors": "^2", nodemon: "^3", prettier: "^3",
      "prettier-plugin-tailwindcss": "^0.7", eslint: "^9", "@eslint/js": "^10", "typescript-eslint": "^8",
    },
  };
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg, null, 4) + "\n");

  p.log.success("backend/ scaffolded (Express + PostgreSQL + Joi, Prettier + ESLint)");
  if (!noInstall) await tryRun("backend npm install", "npm", ["install"], dir);
}

async function scaffoldFrontend(root: string, noInstall: boolean, noUi: boolean): Promise<void> {
  const ok = await tryRun(
    "create-next-app",
    "npx",
    ["create-next-app@latest", "frontend", "--ts", "--tailwind", "--eslint", "--app", "--src-dir", "--import-alias", "@/*", "--use-npm", "--yes"],
    root,
  );
  if (!ok) return;

  const dir = join(root, "frontend");
  const tpl = templatesDir();
  await writeFile(join(dir, ".prettierrc"), await readFile(join(tpl, "config", "prettierrc.frontend.json"), "utf-8"));

  // Add format scripts to the generated package.json
  try {
    const pkgPath = join(dir, "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
    pkg.scripts = { ...(pkg.scripts ?? {}), format: "prettier --write .", "format:check": "prettier --check ." };
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  } catch { /* leave scripts as-is */ }

  p.log.success("frontend/ scaffolded (latest Next.js + Tailwind + Prettier)");

  if (!noInstall) {
    await tryRun("frontend deps", "npm", ["i", "uuid"], dir);
    await tryRun("frontend dev deps", "npm", ["i", "-D", "prettier", "prettier-plugin-tailwindcss"], dir);
  }
  if (!noUi) {
    p.log.info("Adding dafkeUI components...");
    await tryRun("dafke-ui init", "npx", ["dafke-ui", "init"], dir);
    await tryRun("dafke-ui add all", "npx", ["dafke-ui", "add", "all"], dir);
  }
}

export default defineCommand({
  meta: { name: "create", description: "Scaffold a fullstack Dafke app (frontend + backend)" },
  args: {
    name: { type: "positional", required: true, description: "Project folder name" },
    "no-install": { type: "boolean", description: "Skip npm installs" },
    "no-ui": { type: "boolean", description: "Skip dafkeUI component install" },
  },
  async run({ args }) {
    const name = String(args.name);
    const root = join(process.cwd(), name);
    if (existsSync(root)) {
      console.error(chalk.red(`  Folder already exists: ${root}`));
      process.exit(1);
    }

    p.intro(`Creating Dafke app: ${chalk.bold(name)}`);
    await mkdir(root, { recursive: true });

    const noInstall = Boolean(args["no-install"]);
    const noUi = Boolean(args["no-ui"]);

    await scaffoldFrontend(root, noInstall, noUi);
    await scaffoldBackend(root, noInstall);

    p.log.message("");
    p.log.message(chalk.bold("Next steps:"));
    p.log.message(`  cd ${name}/backend && cp .env.example .env   # set your DB_* values`);
    p.log.message(`  cd ${name}/backend && npm run dev            # API on :5000`);
    p.log.message(`  cd ${name}/frontend && npm run dev           # Next.js on :3000`);
    p.outro("Done — frontend/ (Next.js + dafkeUI) and backend/ (Express + PostgreSQL).");
  },
});
