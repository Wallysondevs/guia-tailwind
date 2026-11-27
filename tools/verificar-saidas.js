#!/usr/bin/env node
/* verificar-saidas.js — toda saída mostrada na caixa tem de sair do motor do guia.
 *
 * O contrato é curto e o testador cobra:
 *
 *   <div class="trytailwind" data-goal="…">
 *     <pre class="html"><div id="alvo" class="p-4">Oi</div></pre>
 *     <pre class="out">padding: 16px</pre>        <-- o painel da caixa, exatamente
 *   </div>
 *
 * - sem data-saida (ou data-saida="tabela"): o `pre.out` é a TABELA de CSS computado que o painel
 *   mostra para aquele HTML (só as propriedades que as classes mudaram);
 * - data-saida="css": o `pre.out` é o CSS GERADO pelo Tailwind para as classes usadas.
 * A largura e o tema vêm do `data-largura`/`data-tema` da caixa (ou do próprio `pre.html`).
 *
 *   node tools/verificar-saidas.js -q pagina.html [outra…]
 *   node tools/verificar-saidas.js --todas [-q]
 *   node tools/verificar-saidas.js --fix pagina.html      grava a saída certa dentro do pre.out
 */
"use strict";

const fs = require("fs");
const path = require("path");
const N = require("./nucleo");
const { abrir } = require("./compilar");

const RAIZ = N.RAIZ;
const args = process.argv.slice(2);
const quieto = args.includes("-q");
const todas = args.includes("--todas");
const corrigir = args.includes("--fix");
const paginas = args.filter((a) => a[0] !== "-");

if (todas) fs.readdirSync(RAIZ).filter((f) => /\.html$/i.test(f)).sort().forEach((f) => paginas.push(f));
if (!paginas.length) {
  console.error("uso: node tools/verificar-saidas.js [-q] [--todas] [--fix] pagina.html [outra…]");
  process.exit(2);
}

const semEspacoFim = (t) => String(t == null ? "" : t).replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\s+$/, "");
const escapar = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* lê o texto de um elemento a partir das posições do núcleo */
function lerEntre(src, el) {
  const ini = el.fimTag;
  const fim = el.fimEl === undefined || el.fimEl === null ? src.length : el.fimEl;
  return N.decodificarEntidades(src.slice(ini, fim)).replace(/^\n/, "").replace(/\s+$/, "");
}

/* a caixa que envolve uma posição (para herdar data-largura / data-tema) */
function caixaDe(caixas, el) {
  return caixas.find((c) => N.dentroDe(c, el.ini)) || null;
}

function paresDaPagina(nome) {
  const arq = path.join(RAIZ, nome);
  const src = fs.readFileSync(arq, "utf8");
  const tags = N.varrer(N.prepararHtml(src));
  const caixas = N.listar(tags, "div", (at) => N.temClasse(at, "trytailwind"));
  const editores = N.listar(tags, "pre", (at) => N.temClasse(at, "html"));
  const saidas = N.listar(tags, "pre", (at) => N.temClasse(at, "out"));
  const problemas = [];
  const pares = [];
  const usados = new Set();

  editores.forEach((ed) => {
    if (!caixaDe(caixas, ed)) return;                       // pre.html fora da caixa: não é saída
    const out = saidas.find((s) => s.ini > ed.fimEl && !usados.has(s.ini));
    if (!out) {
      pares.push({ editor: ed, out: null });
      problemas.push("a caixa do HTML que começa na linha " + linhaDe(src, ed.ini) + " não tem <pre class=\"out\"> depois dela");
      return;
    }
    // se outro editor começa antes deste out, então o out é do outro
    const intruso = editores.find((o) => o !== ed && o.ini > ed.fimEl && o.ini < out.ini);
    if (intruso) {
      pares.push({ editor: ed, out: null });
      problemas.push("a caixa da linha " + linhaDe(src, ed.ini) + " ficou sem saída (o pre.out seguinte pertence à caixa da linha " + linhaDe(src, intruso.ini) + ")");
      return;
    }
    usados.add(out.ini);
    const caixa = caixaDe(caixas, ed);
    const largura = ed.at["data-largura"] || (caixa && caixa.at["data-largura"]) || null;
    const tema = ed.at["data-tema"] || (caixa && caixa.at["data-tema"]) || "";
    const saida = ed.at["data-saida"] || "tabela";
    if (saida !== "tabela" && saida !== "css") problemas.push("data-saida=\"" + saida + "\" desconhecido (use tabela ou css)");
    pares.push({ editor: ed, out, largura, escuro: tema === "escuro", saida });
  });

  saidas.forEach((s) => {
    if (!usados.has(s.ini)) problemas.push("tem um <pre class=\"out\"> na linha " + linhaDe(src, s.ini) + " sem o <pre class=\"html\"> da caixa antes dele");
  });

  return { nome, arq, src, pares, problemas };
}

function linhaDe(src, off) {
  return src.slice(0, off).split("\n").length;
}

(async () => {
  const paginasLidas = [];
  let problemas = 0;
  for (const nome of paginas) {
    if (!fs.existsSync(path.join(RAIZ, nome))) {
      console.error("não achei " + nome);
      process.exit(2);
    }
    const lida = paresDaPagina(nome);
    paginasLidas.push(lida);
  }

  const total = paginasLidas.reduce((n, p) => n + p.pares.filter((x) => x.out).length, 0);
  const nav = total ? await abrir() : null;

  for (const p of paginasLidas) {
    const falhas = [];
    p.problemas.forEach((m) => falhas.push(m));
    const consertos = [];

    const lista = p.pares.filter((x) => x.out);
    if (lista.length && nav) {
      const esperados = await nav.pg.evaluate(async (itens) => {
        const r = [];
        for (const it of itens) {
          if (it.saida === "css") r.push(await window.__tailwindRegras(it.html, it.largura, it.escuro));
          else r.push((await window.__tailwindAvaliar(it.html, "", it.largura, it.escuro)).tabela);
        }
        return r;
      }, lista.map((x) => ({ html: lerEntre(p.src, x.editor), largura: x.largura, escuro: x.escuro, saida: x.saida })));

      lista.forEach((x, i) => {
        const lido = lerEntre(p.src, x.out);
        const esperado = semEspacoFim(esperados[i]);
        const mostrado = semEspacoFim(lido);
        if (!esperado) {
          falhas.push("a caixa da linha " + linhaDe(p.src, x.editor.ini) + " não produz saída nenhuma (o painel fica vazio)");
          return;
        }
        if (mostrado !== esperado) {
          falhas.push(
            "linha " + linhaDe(p.src, x.out.ini) + ": o pre.out não é o que o motor devolve\n" +
            "     mostrado: " + JSON.stringify(mostrado.slice(0, 300)) + "\n" +
            "     motor:    " + JSON.stringify(esperado.slice(0, 300))
          );
          consertos.push({ out: x.out, texto: esperado });
        }
      });
    }

    if (consertos.length && corrigir) {
      let novo = p.src;
      consertos.sort((a, b) => b.out.fimTag - a.out.fimTag).forEach((c) => {
        const fim = c.out.fimEl === null ? novo.length : c.out.fimEl;
        novo = novo.slice(0, c.out.fimTag) + "\n" + escapar(c.texto) + "\n" + novo.slice(fim);
      });
      if (novo !== p.src) {
        fs.writeFileSync(p.arq, novo);
        if (!quieto) console.log("  corrigido: " + p.nome);
        problemas -= 0;
      }
      // o que foi corrigido não conta mais como falha
      const restantes = falhas.filter((f) => f.indexOf("o pre.out não é o que o motor devolve") === -1 && f.indexOf("\n     mostrado:") === -1);
      falhas.length = 0;
      restantes.forEach((f) => falhas.push(f));
    }

    if (falhas.length) {
      problemas += falhas.length;
      console.log((quieto ? "" : "\n") + p.nome + " — " + falhas.length + " problema(s):");
      falhas.forEach((f) => console.log("  ✗ " + f));
    } else if (!quieto) {
      const n = p.pares.filter((x) => x.out).length;
      console.log(p.nome + " — ok" + (n ? " (" + n + " saída" + (n > 1 ? "s" : "") + " conferida" + (n > 1 ? "s" : "") + ")" : ""));
    }
  }

  if (nav) await nav.fechar();

  if (problemas) {
    console.log("\n" + problemas + " problema(s) de saída. Use --fix para gravar o que o motor devolve.");
    process.exit(1);
  }
  console.log("\nsaídas conferidas com o motor: " + total + " par(es) em " + paginasLidas.length + " página(s).");
})();
