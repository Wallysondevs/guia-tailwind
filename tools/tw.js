#!/usr/bin/env node
/* tw.js — o CLI dos autores: compila um trecho de HTML com o Tailwind de verdade e mostra o
 * CSS computado (o que a caixa mostra) ou as regras geradas (o que o `pre.out` de CSS mostra).
 *
 *   node tools/tw.js pagina.html                      # todos os pre.html da página, um por um
 *   node tools/tw.js pagina.html --meta "css:#alvo|padding=16px"
 *   node tools/tw.js tmp/x.html --css                 # regras geradas (formato do pre.out)
 *   node tools/tw.js --html '<div id="alvo" class="p-4">x</div>'
 *   --largura 768 --escuro 1
 *
 * Sai com 1 quando a meta não é cumprida.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { abrir } = require("./compilar");
const N = require("./nucleo");

const args = process.argv.slice(2);
const valor = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i === -1 ? padrao : args[i + 1];
};
const opcoes = {
  css: args.includes("--css"),
  meta: valor("--meta", ""),
  html: valor("--html", null),
  largura: valor("--largura", null),
  escuro: valor("--escuro", null) === "1" || args.includes("--escuro"),
  json: args.includes("--json")
};
const arquivos = args.filter((a) => !a.startsWith("--") && !["--meta", "--html", "--largura"].includes(args[args.indexOf(a) - 1]));

function lerTrechos(arquivo) {
  const html = fs.readFileSync(arquivo, "utf8");
  const src = N.prepararHtml(html);
  const tags = N.varrer(src);
  const blocos = N.listar(tags, "pre", (at) => N.temClasse(at, "html"));
  return blocos.map((b, i) => ({
    nome: path.basename(arquivo) + " #" + (i + 1),
    html: N.decodificarEntidades(src.slice(b.fimTag, b.fimEl ?? src.length)).replace(/^\n/, "").replace(/\s+$/, ""),
    largura: b.at["data-largura"] || null,
    escuro: b.at["data-tema"] === "escuro",
    saida: b.at["data-saida"] || "tabela"
  }));
}

(async () => {
  const trechos = opcoes.html
    ? [{ nome: "trecho", html: opcoes.html, largura: opcoes.largura, escuro: opcoes.escuro, saida: opcoes.css ? "css" : "tabela" }]
    : arquivos.flatMap(lerTrechos);
  if (!trechos.length) {
    console.error("uso: node tools/tw.js pagina.html [--css] [--meta \"css:#alvo|padding=16px\"] [--html '<div>…</div>']");
    process.exit(2);
  }
  const nav = await abrir();
  let falhas = 0;
  for (const t of trechos) {
    const largura = t.largura || opcoes.largura;
    const escuro = t.escuro || opcoes.escuro;
    if (opcoes.meta) {
      const r = await nav.avaliar(t.html, opcoes.meta, largura, escuro);
      if (opcoes.json) console.log(JSON.stringify({ trecho: t.nome, ...r }, null, 1));
      else {
        console.log("== " + t.nome + ": " + (r.ok ? "meta cumprida" : "meta NÃO cumprida — " + r.motivo));
        if (r.tabela) console.log(r.tabela);
      }
      if (!r.ok) falhas++;
      continue;
    }
    if (t.saida === "css" || opcoes.css) {
      const css = await nav.pg.evaluate((h, l, e) => window.__tailwindRegras(h, l, e), t.html, largura, escuro);
      console.log("== " + t.nome);
      console.log(css || "(nenhuma regra gerada)");
      continue;
    }
    const tabela = await nav.tabela(t.html, largura, escuro);
    console.log("== " + t.nome);
    console.log(tabela || "(nenhuma propriedade mudou)");
  }
  await nav.fechar();
  process.exit(falhas ? 1 : 0);
})();
