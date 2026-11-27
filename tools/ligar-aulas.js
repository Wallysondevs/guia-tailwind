#!/usr/bin/env node
/* ligar-aulas.js — transforma em link a primeira menção de outra aula, dentro da prosa.
 *
 *   node tools/ligar-aulas.js --ver            mostra o que faria (não grava)
 *   node tools/ligar-aulas.js --gravar         aplica
 *   node tools/ligar-aulas.js --ver pagina.html
 *
 * Regra: só mexe em TEXTO FORA de tag (nunca dentro de <pre>, <code>, <a>, <h1..h6>, <script>,
 * <style>), liga no máximo 3 aulas por página e nenhuma página fica com menos de 2 links se houver
 * título compatível disponível. O título usado é o da NIVEIS, exatamente como aparece no menu.
 *
 * Depois de rodar: node tools/testar-missoes.js -q <páginas> para conferir que os links existem.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const N = require("./nucleo");

const RAIZ = N.RAIZ;
const args = process.argv.slice(2);
const gravar = args.includes("--gravar");
const alvos = args.filter((a) => !a.startsWith("-"));
const MAX_POR_PAGINA = 3;
/* teto por destino: a mesma frase aparece em quase toda aula ("o servidor de desenvolvimento"),
 * e 50 links para a mesma página deixam de parecer escrita e passam a parecer template */
const MAX_POR_ALVO = 6;

/* títulos da NIVEIS: arquivo -> título */
function titulos() {
  const js = fs.readFileSync(path.join(RAIZ, "assets/site.js"), "utf8");
  const ini = js.indexOf("var NIVEIS");
  const fim = js.indexOf("\n];", ini);
  const trecho = js.slice(ini, fim < 0 ? js.length : fim);
  const mapa = new Map();
  for (const m of trecho.matchAll(/\[\s*["']([^"']+\.html)["']\s*,\s*["']([^"']+)["']\s*\]/g)) {
    mapa.set(m[1], m[2]);
  }
  return mapa;
}

/* títulos que não servem para link automático: código, ou uma palavra só (palavra comum como
 * "Contador" ou "Agenda" aparece na prosa falando de outra coisa e o link sairia errado) */
const NAO_LIGAR = /[{}<>$#/|]/;

const TITULOS = titulos();
const CANDIDATOS = [...TITULOS.entries()]
  .filter(([arq, titulo]) => titulo.trim().split(/\s+/).length >= 2 && !NAO_LIGAR.test(titulo))
  .map(([arq, titulo]) => ({ arq, titulo }));

const jaLigado = new Map();
const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const IGNORAR_DENTRO = new Set(["pre", "code", "a", "h1", "h2", "h3", "h4", "h5", "h6", "script", "style", "title"]);

function ligar(html, nomeArq) {
  const pedacos = html.split(/(<[^>]*>)/);
  const pilha = [];
  const achados = [];
  const usados = new Set([nomeArq]);
  let jaTem = 0;

  for (let i = 0; i < pedacos.length; i++) {
    const p = pedacos[i];
    if (p.startsWith("<")) {
      const fecha = /^<\s*\//.test(p);
      const nome = (p.match(/^<\s*\/?\s*([a-zA-Z][\w:-]*)/) || [])[1];
      if (!nome) continue;
      const tag = nome.toLowerCase();
      if (fecha) {
        const pos = pilha.lastIndexOf(tag);
        if (pos >= 0) pilha.splice(pos, 1);
      } else if (!/\/>$/.test(p) && !["br", "hr", "img", "input", "meta", "link", "source"].includes(tag)) {
        pilha.push(tag);
      }
      if (tag === "a" && !fecha) jaTem += 1;
      continue;
    }
    if (!p.trim()) continue;
    if (pilha.some((t) => IGNORAR_DENTRO.has(t))) continue;
    if (achados.length + jaTem >= MAX_POR_PAGINA) continue;

    let texto = p;
    for (const c of CANDIDATOS) {
      if (usados.has(c.arq)) continue;
      if (achados.length + jaTem >= MAX_POR_PAGINA) break;
      if ((jaLigado.get(c.arq) || 0) >= MAX_POR_ALVO) continue;
      // a menção tem de estar em texto puro, com fronteira de palavra
      const re = new RegExp("(^|[^\\p{L}\\p{N}])(" + c.titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![\\p{L}\\p{N}])", "iu");
      const m = re.exec(texto);
      if (!m) continue;
      const ini = m.index + m[1].length;
      const fim = ini + m[2].length;
      texto = texto.slice(0, ini) + '<a href="' + c.arq + '">' + texto.slice(ini, fim) + "</a>" + texto.slice(fim);
      usados.add(c.arq);
      jaLigado.set(c.arq, (jaLigado.get(c.arq) || 0) + 1);
      achados.push({ de: nomeArq, para: c.arq, texto: m[2] });
    }
    pedacos[i] = texto;
  }
  return { html: pedacos.join(""), achados, linksAntes: jaTem };
}

const paginas = alvos.length ? alvos : fs.readdirSync(RAIZ).filter((f) => /\.html$/i.test(f)).sort();
let totalPaginas = 0, totalLinks = 0;
const relatorio = [];

for (const nome of paginas) {
  const arq = path.join(RAIZ, nome);
  if (!fs.existsSync(arq)) { console.error("não achei: " + nome); continue; }
  const original = fs.readFileSync(arq, "utf8");
  const r = ligar(original, nome);
  if (!r.achados.length) continue;
  totalPaginas++;
  totalLinks += r.achados.length;
  relatorio.push({ nome, antes: r.linksAntes, achados: r.achados });
  if (gravar && r.html !== original) fs.writeFileSync(arq, r.html);
}

relatorio.forEach((r) => {
  console.log(nomeCurto(r.nome) + "  (" + r.antes + " link(s) antes)");
  r.achados.forEach((a) => console.log("   \"" + a.texto + "\" -> " + a.para));
});

function nomeCurto(n) { return n.padEnd(28); }

console.log("\n" + (gravar ? "aplicado" : "prévia") + ": " + totalLinks + " link(s) em " + totalPaginas + " página(s)");
if (!gravar) console.log("rode com --gravar para aplicar");
