#!/usr/bin/env node
/* nucleo.js — o que os conferidores do Guia Tailwind têm em comum.
 * Node puro (só builtins): leitura de página, varredura de tags, texto visível,
 * leitura da NIVEIS, metas do data-goal e as listas de dados proibidos.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

/* ------------------------------------------------------------------- entidades */
const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘",
  rsquo: "’", bull: "•", middot: "·", deg: "°", times: "×", divide: "÷", euro: "€", pound: "£",
  cent: "¢", sect: "§", para: "¶", ordf: "ª", ordm: "º", larr: "←", rarr: "→", uarr: "↑", darr: "↓",
  harr: "↔", rArr: "⇒", check: "✓", aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í",
  Iacute: "Í", oacute: "ó", Oacute: "Ó", uacute: "ú", Uacute: "Ú", atilde: "ã", Atilde: "Ã",
  otilde: "õ", Otilde: "Õ", ccedil: "ç", Ccedil: "Ç", acirc: "â", Acirc: "Â", ecirc: "ê", Ecirc: "Ê",
  ocirc: "ô", Ocirc: "Ô", agrave: "à", Agrave: "À", uuml: "ü", Uuml: "Ü", ntilde: "ñ", Ntilde: "Ñ",
  le: "≤", ge: "≥", ne: "≠", shy: "\u00ad", zwj: "\u200d", thinsp: "\u2009", ensp: "\u2002", emsp: "\u2003"
};

function decodificarEntidades(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (t, n) => {
    if (n.charAt(0) === "#") {
      const c = n.charAt(1).toLowerCase() === "x" ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10);
      try { return String.fromCodePoint(c); } catch (e) { return t; }
    }
    return Object.prototype.hasOwnProperty.call(ENTIDADES, n) ? ENTIDADES[n] : t;
  });
}

function normalizar(s) {
  return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
}

function atributos(s) {
  const r = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(s))) r[m[1].toLowerCase()] = decodificarEntidades(m[2] ?? m[3] ?? m[4] ?? "");
  return r;
}

const classes = (at) => String(at["class"] || "").split(/\s+/).filter(Boolean);
const temClasse = (at, c) => classes(at).includes(c);
const curto = (s, n = 96) => {
  const t = normalizar(s);
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

function textoVisivel(html) {
  let s = String(html).replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<[^>]*>/g, " ");
  return normalizar(decodificarEntidades(s));
}

function contarPalavras(txt) {
  return String(txt).split(/\s+/).filter((t) => /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(t)).length;
}

/* ------------------------------------------------------------------- a NIVEIS */
function lerNiveis() {
  const arq = path.join(RAIZ, "assets/site.js");
  if (!fs.existsSync(arq)) return null;
  const js = fs.readFileSync(arq, "utf8");
  const ini = js.indexOf("var NIVEIS");
  if (ini < 0) return null;
  const fim = js.indexOf("\n];", ini);
  const trecho = js.slice(ini, fim < 0 ? js.length : fim);
  const set = new Set();
  for (const m of trecho.matchAll(/\[\s*["']([^"']+\.html)["']/g)) set.add(m[1]);
  return set.size ? set : null;
}

/* ------------------------------------------------------------ varredura de tags */
const VAZIAS = new Set(["br", "hr", "img", "meta", "link", "input", "source", "area", "base",
  "col", "embed", "param", "track", "wbr"]);

function prepararHtml(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
  s = s.replace(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi,
    (m, tag, at, corpo) => "<" + tag + at + ">" + corpo.replace(/[^\n]/g, " ") + "</" + tag + ">");
  return s;
}

function varrer(src) {
  const tags = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m;
  while ((m = re.exec(src))) {
    tags.push({ fecha: m[1] === "/", nome: m[2].toLowerCase(), at: atributos(m[3]), ini: m.index, fim: re.lastIndex });
  }
  return tags;
}

function fimDoElemento(tags, i) {
  const nome = tags[i].nome;
  if (VAZIAS.has(nome) || tags[i].fecha) return tags[i].fim;
  let prof = 1;
  for (let k = i + 1; k < tags.length; k++) {
    if (tags[k].nome !== nome) continue;
    prof += tags[k].fecha ? -1 : 1;
    if (!prof) return tags[k].ini;
  }
  return null;
}

function listar(tags, nome, filtro) {
  const out = [];
  tags.forEach((t, i) => {
    if (t.fecha || (nome && t.nome !== nome)) return;
    if (filtro && !filtro(t.at, t)) return;
    const fimEl = fimDoElemento(tags, i);
    out.push({ at: t.at, cls: classes(t.at), ini: t.ini, fimTag: t.fim, fimEl, aberto: fimEl !== null });
  });
  return out;
}

const dentroDe = (el, off) => el && off >= el.fimTag && off < (el.fimEl === null ? Infinity : el.fimEl);

/* ---------------------------------------------------------------- metas Nginx */
/* data-goal="out:Cliques: 2;;clique:button" — passos na ordem, separados por ";;" */
const PASSOS = [
  { nome: "css", exige: true, dica: "CSS computado: css:#alvo|padding=16px" },
  { nome: "rule", exige: true, dica: "trecho do CSS gerado: rule:padding: calc(var(--spacing) * 4)" },
  { nome: "conta", exige: true, dica: "quantos elementos casam: conta:.card=3" },
  { nome: "texto", exige: true, dica: "trecho do texto que aparece na prévia: texto:Pão quentinho" },
  { nome: "largura", exige: true, dica: "largura da prévia em pixels: largura:768" },
  { nome: "escuro", exige: true, dica: "prévia no tema escuro: escuro:1 (ou escuro:0)" },
  { nome: "depois", exige: false, dica: "aceito por compatibilidade; o Tailwind não espera nada" }
];

function passosDaMeta(meta) {
  return String(meta || "").split(";;").map((p) => p.trim()).filter(Boolean);
}

/* devolve a lista de problemas (string) da meta; vazia = meta válida */
function validarMeta(meta) {
  const problemas = [];
  const passos = passosDaMeta(meta);
  if (!passos.length) return ["data-goal vazio (a caixa precisa de uma meta para o Verificar funcionar)"];
  let temObservavel = false;
  const usados = new Set();
  passos.forEach((p) => {
    const dois = p.indexOf(":");
    const nome = dois < 0 ? p : p.slice(0, dois);
    const valor = dois < 0 ? "" : p.slice(dois + 1);
    const spec = PASSOS.find((s) => s.nome === nome);
    if (!spec) {
      problemas.push('passo de meta desconhecido: "' + p + '" (use ' + PASSOS.map((x) => x.nome + ":").join(", ") + ")");
      return;
    }
    if (spec.exige && !valor) problemas.push('passo "' + nome + ':" sem valor (' + spec.dica + ")");
    if (nome === "css" && !/^.+\|[a-z-]+=.+$/.test(valor)) problemas.push('css: precisa de seletor|propriedade=valor (ex.: css:#alvo|padding=16px)');
    if (nome === "conta" && !/^.+=\d+$/.test(valor)) problemas.push('conta: precisa de seletor=n (ex.: conta:.card=3)');
    if (nome === "largura" && !/^\d{3,4}$/.test(valor)) problemas.push('largura: precisa de pixels (ex.: largura:768)');
    if (nome === "escuro" && !/^[01]$/.test(valor)) problemas.push('escuro: use 1 (tema escuro) ou 0 (claro)');
    if (nome === "depois" && isNaN(Number(valor))) problemas.push('depois: precisa de milissegundos (ex.: depois:150)');
    if (["css", "rule", "conta", "texto"].includes(nome)) temObservavel = true;
    usados.add(nome);
  });
  if (!temObservavel) problemas.push("a meta não tem como conferir nada: use css:, rule:, conta: ou texto:");
  return problemas;
}

/* metas declaradas em que um passo pede erro de compilação */
const metaEsperaErro = (meta) => passosDaMeta(meta).some((p) => p.indexOf("erro:") === 0);

/* ------------------------------------------------------ dados proibidos (§7) */
/* Montados em pedaços DE PROPÓSITO: este arquivo fica no repositório do guia, então nem o
   testador pode carregar o nome da máquina real nem os IPs da VPS para o repositório. */
const j = (...p) => p.join("");
const PROIBIDOS = [
  { re: new RegExp(j("wal", "lyson"), "i"), nome: "o nome do dono da máquina" },
  { re: new RegExp(j("/home/", "wal", "lyson"), "i"), nome: "a pasta pessoal real (use /home/ana)" },
  { re: new RegExp(j("\\/ro", "ot") + "\\b", "i"), nome: "a pasta do superusuário (use /home/ana)" },
  { re: new RegExp(j("155\\.138\\.", "199\\.189")), nome: "um IP da VPS" },
  { re: new RegExp(j("3\\.16\\.", "51\\.254")), nome: "um IP da VPS" },
  { re: new RegExp(j("ip-", "172"), "i"), nome: "um hostname interno da nuvem" },
  { re: /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/i, nome: "um endereço MAC" },
  { re: /\bb?ssid\b/i, nome: "SSID/BSSID da rede wifi" },
  { re: /\/home\/(?!ana\b|seu-nome\b)[a-z][a-z0-9_-]*/i, nome: "uma pasta pessoal que não é a da Ana", generico: true }
];

const PLACEHOLDERS = [
  { re: /@@/, nome: "@@" },
  { re: /\bPREENCHER\b/, nome: "PREENCHER" },
  { re: /\bDESCREVER\b/, nome: "DESCREVER" },
  { re: /\bALT1\b/i, nome: "ALT1" },
  { re: /\bERR1\b/i, nome: "ERR1" },
  { re: /\blorem\b/i, nome: "lorem" },
  { re: /\bTODO\b/, nome: "TODO" }
];

/* tags inline aceitas dentro de um <pre> que não é código de editor */
const TAG_INLINE_OK = /^<\/?(?:mark|b|strong|em|i|u|span|kbd|sup|sub|br|a)(?:\s+[\w-]+\s*=\s*"[^"]*")*\s*\/?>/i;

module.exports = {
  RAIZ, ENTIDADES, decodificarEntidades, normalizar, atributos, classes, temClasse, curto,
  textoVisivel, contarPalavras, lerNiveis, prepararHtml, varrer, fimDoElemento, listar, dentroDe,
  PASSOS, passosDaMeta, validarMeta, metaEsperaErro, PROIBIDOS, PLACEHOLDERS, TAG_INLINE_OK
};
