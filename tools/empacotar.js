#!/usr/bin/env node
/* empacotar.js — o compilador que o site usa é o MESMO que o testador usa.
 *
 *   node tools/empacotar.js --gerar     copia @tailwindcss/browser para assets/tailwind-browser.js
 *   node tools/empacotar.js --checar    compara o hash com o manifesto e confere a versão
 *
 * O guia não reescreve o Tailwind: publica a build oficial (@tailwindcss/browser), a mesma que o
 * navegador do leitor carrega. O --checar prova que o arquivo publicado veio desta versão.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAIZ = path.join(__dirname, "..");
const ASSETS = path.join(RAIZ, "assets");
const SAIDA = "tailwind-browser.js";
const MANIFESTO = path.join(ASSETS, "vendor.json");
const ORIGEM = path.join(RAIZ, "node_modules/@tailwindcss/browser/dist/index.global.js");
const PACOTE = path.join(RAIZ, "node_modules/@tailwindcss/browser/package.json");

const hash = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);

function versaoInstalada() {
  try {
    return JSON.parse(fs.readFileSync(PACOTE, "utf8")).version;
  } catch (e) {
    return null;
  }
}

function gerar() {
  if (!fs.existsSync(ORIGEM)) {
    console.error("não achei " + ORIGEM + " — rode: npm i");
    process.exit(2);
  }
  const destino = path.join(ASSETS, SAIDA);
  fs.copyFileSync(ORIGEM, destino);
  const bytes = fs.readFileSync(destino);
  const manifesto = {
    tailwind: versaoInstalada(),
    gerado: new Date().toISOString().slice(0, 10),
    arquivos: {}
  };
  manifesto.arquivos[SAIDA] = { sha256: hash(bytes), bytes: bytes.length };
  fs.writeFileSync(MANIFESTO, JSON.stringify(manifesto, null, 2) + "\n");
  console.log("publicado assets/" + SAIDA + " (" + Math.round(bytes.length / 1024) + " KB, tailwind " + manifesto.tailwind + ")");
}

function checar() {
  if (!fs.existsSync(MANIFESTO)) {
    console.error("falta assets/vendor.json — rode: node tools/empacotar.js --gerar");
    process.exit(1);
  }
  const manifesto = JSON.parse(fs.readFileSync(MANIFESTO, "utf8"));
  const publicado = path.join(ASSETS, SAIDA);
  if (!fs.existsSync(publicado)) {
    console.error("FALTA assets/" + SAIDA + " — rode --gerar");
    process.exit(1);
  }
  let erros = 0;
  const bytes = fs.readFileSync(publicado);
  if (hash(bytes) !== manifesto.arquivos[SAIDA].sha256) {
    console.error("assets/" + SAIDA + " não confere com o manifesto — rode --gerar");
    erros++;
  } else {
    console.log("assets/" + SAIDA + " confere com o manifesto (" + Math.round(bytes.length / 1024) + " KB, sha " + hash(bytes) + ")");
  }
  const instalada = versaoInstalada();
  if (instalada && manifesto.tailwind !== instalada) {
    console.error("o manifesto diz tailwind " + manifesto.tailwind + " e o node_modules tem " + instalada + " — rode --gerar");
    erros++;
  } else if (instalada) {
    console.log("tailwind " + instalada + " confere com o node_modules");
  }
  if (fs.existsSync(ORIGEM) && hash(fs.readFileSync(ORIGEM)) !== hash(bytes)) {
    console.error("assets/" + SAIDA + " difere do pacote instalado — rode --gerar");
    erros++;
  }
  if (erros) process.exit(1);
  console.log("\ncompilador do site confere com o do projeto.");
}

const args = process.argv.slice(2);
if (args.includes("--gerar")) gerar();
else if (args.includes("--checar")) checar();
else {
  console.error("uso: node tools/empacotar.js --gerar | --checar");
  process.exit(2);
}
