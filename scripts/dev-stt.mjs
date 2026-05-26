import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sttDir = path.join(root, "apps/stt");
const requirementsPath = path.join(sttDir, "requirements.txt");

function loadRootEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function runOrExit(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? sttDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function venvPythonPath() {
  return process.platform === "win32"
    ? path.join(sttDir, ".venv", "Scripts", "python.exe")
    : path.join(sttDir, ".venv", "bin", "python");
}

function pythonMinorVersion(command) {
  const result = spawnSync(
    command,
    ["-c", "import sys; print(sys.version_info.minor)"],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    return null;
  }
  const minor = Number.parseInt(String(result.stdout).trim(), 10);
  return Number.isFinite(minor) ? minor : null;
}

function resolveSystemPython() {
  if (process.env.STT_PYTHON) {
    return process.env.STT_PYTHON;
  }
  const candidates = ["python3.12", "python3.11", "python3.13", "python3"];
  let fallback = null;
  for (const cmd of candidates) {
    const minor = pythonMinorVersion(cmd);
    if (minor === null) {
      continue;
    }
    if (minor >= 11 && minor <= 13) {
      return cmd;
    }
    if (fallback === null) {
      fallback = cmd;
    }
  }
  return fallback ?? "python3";
}

function ensureVenv() {
  const venvPy = venvPythonPath();
  if (fs.existsSync(venvPy)) {
    return venvPy;
  }

  const systemPython = resolveSystemPython();
  console.info(`Criando venv em apps/stt/.venv (${systemPython})...`);
  runOrExit(systemPython, ["-m", "venv", ".venv"], { cwd: sttDir });

  if (!fs.existsSync(venvPy)) {
    console.error("Não foi possível criar apps/stt/.venv");
    process.exit(1);
  }
  return venvPy;
}

function hasModule(python, moduleName) {
  const result = spawnSync(python, ["-c", `import ${moduleName}`], {
    cwd: sttDir,
    stdio: "ignore",
  });
  return result.status === 0;
}

function ensureFfmpeg() {
  const result = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (result.status !== 0) {
    console.error(
      "ffmpeg não encontrado no PATH. Instale com: brew install ffmpeg"
    );
    process.exit(1);
  }
}

function ensureDependencies(python) {
  if (hasModule(python, "uvicorn")) {
    return;
  }

  console.info(
    "Instalando dependências do STT em apps/stt/.venv (primeira vez pode demorar)..."
  );
  runOrExit(python, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"]);
  runOrExit(python, [
    "-m",
    "pip",
    "install",
    "--prefer-binary",
    "-r",
    requirementsPath,
  ]);

  if (!hasModule(python, "uvicorn")) {
    console.error(
      "Falha ao instalar uvicorn. Tente STT_PYTHON=python3.12 pnpm dev:stt"
    );
    process.exit(1);
  }
}

loadRootEnv();
ensureFfmpeg();

const python = ensureVenv();
ensureDependencies(python);

const host = process.env.STT_HOST ?? "0.0.0.0";
const port = process.env.STT_PORT ?? "8001";

const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "src.main:app",
    "--host",
    host,
    "--port",
    String(port),
    "--reload",
  ],
  {
    cwd: sttDir,
    stdio: "inherit",
    env: process.env,
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
