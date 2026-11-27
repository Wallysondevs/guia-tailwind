#!/usr/bin/env node
/* testar-missoes.js — o conferidor de páginas do Guia Tailwind.
 *
 *   node tools/testar-missoes.js pagina.html [outra.html …]
 *   node tools/testar-missoes.js --todas
 *   -q / --quieto      mostra só FALHA e aviso (e o resumo)
 *   --sem-sim          não roda as metas (só contrato, estrutura, texto, links)
 *   --tempo MS         limite por componente no navegador (padrão 6000)
 *
 * O que REPROVA (FALHA) em cada página:
 *   1. cabeçalho    doctype, lang="pt-BR", <title> terminando em "| Guia Tailwind", meta description
 *                   de 100 a 180 caracteres, assets/style.css, script do tema, favicon
 *   2. estrutura    .layout > nav.sidebar#sidebar + main.main > .content, DOIS .pager, <h1> com .hl,
 *                   p.intro com "Ana", .note "Você vai aprender", assets/site.js antes de </body>
 *   3. conteúdo     por tipo de página (aula, projeto, referência, capa): nº de <h2>, dl.anatomy,
 *                   pre.term, div.cenario, table.ref DENTRO de .table-wrap, <h2>Resumo</h2>,
 *                   .mc, .exercise e caixas .trytailwind, conforme o CONTRIBUINDO §2
 *   4. caixas       pre.html + pre.solucao, data-goal válido, data-largura/theme e .try-task
 *   5. metas        o SCRIPT INICIAL falha a meta e a SOLUÇÃO cumpre — compilando e rodando de
 *                   verdade no Chromium (Tailwind v4 real, build oficial @tailwindcss/browser,
 *                   via assets/tailwindsim.js)
 *   6. escape       < > & sem escape dentro de <pre>, fora pre.term (o terminal fica cru)
 *   7. links        todo *.html de href tem de existir no disco E estar na NIVEIS
 *   8. placeholders @@, PREENCHER, DESCREVER, ALT1, ERR1, lorem, TODO
 *   9. privacidade  nome do dono da máquina, pasta pessoal real, pasta do superusuário, IPs da VPS,
 *                   hostname interno da nuvem, MAC e SSID
 *  10. tamanho      FALHA abaixo de 2.500 palavras de texto visível; aviso abaixo de 2.800
 *
 * Código de saída: 0 = tudo ok; 1 = alguma FALHA; 2 = uso errado / página inexistente.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const N = require("./nucleo");

const RAIZ = N.RAIZ;
const CAIXA = "trytailwind";
const PALAVRAS_FALHA = 2500;
const PALAVRAS_AVISO = 2800;
const TEMPO_PADRAO = 6000;
const MARCA = "| Guia Tailwind";

/* ------------------------------------------------------------------ argumentos */
const args = process.argv.slice(2);
let quieto = false, todas = false, semSim = false, completo = false, tempo = TEMPO_PADRAO;
const paginas = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--todas") todas = true;
  else if (a === "--completo") completo = true;
  else if (a === "-q" || a === "--quieto") quieto = true;
  else if (a === "--sem-sim") semSim = true;
  else if (a === "--tempo") { tempo = parseInt(args[++i], 10); if (!tempo || tempo < 200) uso(2); }
  else if (a === "-h" || a === "--help") uso(0);
  else if (a.charAt(0) === "-") { console.error("opção desconhecida: " + a); uso(2); }
  else paginas.push(a);
}
function uso(cod) {
  console.error("uso: node tools/testar-missoes.js [--todas] [-q] [--sem-sim] [--tempo MS] pagina.html [outra.html…]");
  process.exit(cod);
}
if (todas) {
  fs.readdirSync(RAIZ).filter((f) => /\.html$/i.test(f)).sort().forEach((f) => paginas.push(f));
  if (fs.existsSync(path.join(RAIZ, "tools/pagina-teste.html"))) paginas.push("tools/pagina-teste.html");
}
if (!paginas.length) uso(2);

const NIVEIS = N.lerNiveis();

/* --------------------------------------------------------------- servidor local */
/* as páginas do guia usam ES modules: file:// é bloqueado por CORS, então o testador
   serve a pasta por http, igual ao GitHub Pages. */
function subirServidor() {
  const tipos = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8"
  };
  const servidor = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const alvo = path.join(RAIZ, p);
    if (!alvo.startsWith(RAIZ)) { res.writeHead(403).end("fora"); return; }
    fs.readFile(alvo, (err, dados) => {
      if (err) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404 " + p); return; }
      res.writeHead(200, { "content-type": tipos[path.extname(alvo)] || "application/octet-stream" });
      res.end(dados);
    });
  });
  return new Promise((ok) => servidor.listen(0, "127.0.0.1", () => ok({ servidor, porta: servidor.address().port })));
}

function acharPuppeteer() {
  const candidatos = [
    process.env.PUPPETEER_DIR && path.join(process.env.PUPPETEER_DIR, "puppeteer-core"),
    path.join(RAIZ, "node_modules/puppeteer-core"),
    path.join(os.homedir(), "guia-react/node_modules/puppeteer-core"),
    "puppeteer-core"
  ].filter(Boolean);
  for (const c of candidatos) {
    try { return require(c); } catch (e) { /* tenta o próximo */ }
  }
  return null;
}

function acharChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(os.homedir(), ".cache/puppeteer/chrome");
  try {
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith("linux-")).sort().reverse();
    for (const d of dirs) {
      const p = path.join(base, d, "chrome-linux64/chrome");
      if (fs.existsSync(p)) return p;
    }
  } catch (e) { /* sem cache */ }
  return undefined;
}

/* =============================================================== a página ==== */
async function testarPagina(arq, avaliador, nomeArq) {
  const html = fs.readFileSync(arq, "utf8").replace(/^\uFEFF/, "");
  const nomePag = nomeArq || path.basename(arq);
  const src = N.prepararHtml(html);
  const tags = N.varrer(src);
  const nLinha = (off) => src.slice(0, off).split("\n").length;
  const itens = [];
  const fal = (linha, msg) => itens.push({ grav: "FALHA", linha, msg });
  const avi = (linha, msg) => itens.push({ grav: "aviso", linha, msg });
  const ok = (linha, msg) => itens.push({ grav: "ok", linha, msg });
  const nFalhas = () => itens.reduce((n, i) => n + (i.grav === "FALHA" ? 1 : 0), 0);

  const tipo = /^index\.html$/i.test(nomePag) ? "capa"
    : /^ref-/i.test(nomePag) ? "referência"
      : /^projeto-/i.test(nomePag) ? "projeto"
        : /^tools\//.test(nomePag) ? "interna"
          : "aula";
  const REGRAS = {
    "aula": { intro: 1, note: 1, h1hl: 1, h2: 10, anatomy: 1, term: 2, cenario: 3, ref: 2, resumo: 1, mc: 3, exercicio: 1, caixas: 3, palavras: 1 },
    "projeto": { intro: 1, note: 1, h1hl: 1, h2: 9, anatomy: 2, term: 3, cenario: 2, ref: 3, resumo: 1, mc: 3, exercicio: 1, caixas: 3, palavras: 1 },
    "referência": { intro: 1, note: 0, h1hl: 1, h2: 8, anatomy: 1, term: 2, cenario: 0, ref: 4, resumo: 1, mc: 0, exercicio: 0, caixas: 2, palavras: 1 },
    "capa": { intro: 0, note: 0, h1hl: 1, h2: 4, anatomy: 0, term: 0, cenario: 0, ref: 0, resumo: 0, mc: 0, exercicio: 0, caixas: 1, palavras: 0 },
    "interna": { intro: 0, note: 0, h1hl: 0, h2: 1, anatomy: 0, term: 0, cenario: 0, ref: 0, resumo: 0, mc: 0, exercicio: 0, caixas: 1, palavras: 0 }
  };
  const R = REGRAS[tipo];

  /* ------------------------------------------------------------ 1. cabeçalho */
  let n0 = nFalhas();
  if (!/^<!doctype html>/i.test(html)) fal(1, "falta <!doctype html> como primeira linha do arquivo");
  const htmlTag = N.listar(tags, "html")[0];
  if (!htmlTag) fal(1, "falta a tag <html>");
  else if (String(htmlTag.at["lang"] || "").toLowerCase() !== "pt-br")
    fal(nLinha(htmlTag.ini), 'o <html> está com lang="' + (htmlTag.at["lang"] || "") + '" (o guia é pt-BR)');
  const titulo = N.listar(tags, "title")[0];
  if (!titulo) fal(1, "falta o <title>");
  else {
    const t = N.normalizar(N.decodificarEntidades(src.slice(titulo.fimTag, titulo.fimEl ?? src.length)));
    if (!new RegExp("\\|\\s*Guia Tailwind$").test(t))
      fal(nLinha(titulo.ini), 'o <title> tem de terminar em "' + MARCA + '" (está "' + N.curto(t, 70) + '")');
  }
  const desc = N.listar(tags, "meta", (at) => String(at["name"] || "").toLowerCase() === "description")[0];
  if (!desc) fal(1, 'falta <meta name="description" content="…"> (100 a 180 caracteres)');
  else {
    const c = N.normalizar(desc.at["content"] || "");
    if (c.length < 100 || c.length > 180)
      fal(nLinha(desc.ini), "a meta description tem " + c.length + " caracteres (o guia pede de 100 a 180): \"" + N.curto(c, 120) + "\"");
  }
  const css = N.listar(tags, "link", (at) => /\bstylesheet\b/i.test(at["rel"] || ""));
  if (!css.some((l) => /(^|\/)assets\/style\.css$/.test((l.at["href"] || "").trim())))
    fal(css.length ? nLinha(css[0].ini) : 1, 'falta <link rel="stylesheet" href="assets/style.css">');
  if (!N.listar(tags, "link", (at) => /(^|\s)icon(\s|$)/i.test(at["rel"] || "")).length)
    fal(1, 'falta o favicon (<link rel="icon" href="data:,">)');
  const scriptTema = N.listar(tags, "script", (at) => !at["src"]).find((s) => {
    const corpo = html.slice(s.fimTag, s.fimEl ?? html.length);
    return /localStorage/.test(corpo) && /tema|data-theme/.test(corpo);
  });
  if (!scriptTema) fal(1, "falta o script do tema no <head> (o que lê localStorage e põe data-theme)");
  if (!N.listar(tags, "meta", (at) => at["charset"] !== undefined).length) avi(1, 'falta <meta charset="utf-8">');
  if (!N.listar(tags, "meta", (at) => String(at["name"] || "").toLowerCase() === "viewport").length)
    avi(1, 'falta <meta name="viewport" …> (o guia precisa abrir no celular)');
  if (nFalhas() === n0) ok(1, "cabeçalho completo (doctype, lang, title, description, CSS, tema, favicon)");

  /* ------------------------------------------------------------ 2. estrutura */
  n0 = nFalhas();
  const layout = N.listar(tags, "div", (at) => N.temClasse(at, "layout"))[0];
  const nav = N.listar(tags, "nav", (at) => N.temClasse(at, "sidebar") && at["id"] === "sidebar")[0];
  const main = N.listar(tags, "main", (at) => N.temClasse(at, "main"))[0];
  const content = N.listar(tags, "div", (at) => N.temClasse(at, "content"))[0];
  if (!layout) fal(1, 'falta <div class="layout"> (o esqueleto do CONTRIBUINDO §2)');
  if (!nav) fal(1, 'falta <nav class="sidebar" id="sidebar">');
  if (!main) fal(1, 'falta <main class="main">');
  if (!content) fal(1, 'falta <div class="content">');
  if (layout && nav && !N.dentroDe(layout, nav.ini)) fal(nLinha(nav.ini), "o nav.sidebar está FORA do .layout");
  if (layout && main && !N.dentroDe(layout, main.ini)) fal(nLinha(main.ini), "o main.main está FORA do .layout");
  if (main && content && !N.dentroDe(main, content.ini)) fal(nLinha(content.ini), "o .content está FORA do main.main");
  const pagers = N.listar(tags, "div", (at) => N.temClasse(at, "pager"));
  if (pagers.length !== 2) fal(pagers.length ? nLinha(pagers[0].ini) : 1, pagers.length + " .pager na página (são DOIS)");
  const h1s = N.listar(tags, "h1");
  if (!h1s.length) fal(1, "falta o <h1> com um <span class=\"hl\">");
  else if (R.h1hl) {
    const dentro = src.slice(h1s[0].fimTag, h1s[0].fimEl ?? src.length);
    if (!/<span\b[^>]*class\s*=\s*"[^"]*\bhl\b/i.test(dentro)) fal(nLinha(h1s[0].ini), 'o <h1> não tem o destaque <span class="hl">');
  }
  const intro = N.listar(tags, "p", (at) => N.temClasse(at, "intro"))[0];
  if (R.intro && !intro) fal(1, 'falta <p class="intro"> (a Ana e o problema dela)');
  else if (R.intro && !/Ana/.test(N.textoVisivel(src.slice(intro.fimTag, intro.fimEl ?? src.length))))
    fal(nLinha(intro.ini), "o p.intro não fala da Ana (o guia inteiro é a vida dela)");
  const notas = N.listar(tags, "div", (at) => N.temClasse(at, "note"));
  const notaAprender = notas.find((n) => /Você vai aprender/i.test(N.textoVisivel(src.slice(n.fimTag, n.fimEl ?? src.length))));
  if (R.note && !notaAprender) fal(notas.length ? nLinha(notas[0].ini) : 1, 'falta a <div class="note"><strong>Você vai aprender</strong>…');
  const scriptSite = N.listar(tags, "script", (at) => /(^|\/)assets\/site\.js$/.test((at["src"] || "").trim()))[0];
  if (!scriptSite) fal(1, 'falta <script src="assets/site.js"></script> no fim do <body>');
  if (nFalhas() === n0) ok(1, "estrutura ok (layout > sidebar + main > content, 2 pagers, site.js no fim)");

  /* ------------------------------------------------------------- 3. conteúdo */
  n0 = nFalhas();
  const h2s = N.listar(tags, "h2");
  const h2Texto = h2s.map((h) => N.normalizar(N.textoVisivel(src.slice(h.fimTag, h.fimEl ?? src.length))));
  const h2Conteudo = h2Texto.filter((t) => !/^(\d+\.\s*)?(Exercícios?|Resumo|Complete o código)/i.test(t));
  if (h2Conteudo.length < R.h2) fal(h2s.length ? nLinha(h2s[0].ini) : 1, h2Conteudo.length + " <h2> de conteúdo (o tipo \"" + tipo + "\" pede " + R.h2 + ")");
  const numerados = h2Conteudo.filter((t) => /^\d+\.\s/.test(t));
  if (R.h2 >= 8 && numerados.length < h2Conteudo.length) avi(1, "só " + numerados.length + " dos " + h2Conteudo.length + " <h2> estão numerados (1., 2., …: é o padrão do guia)");
  const anatomias = N.listar(tags, "dl", (at) => N.temClasse(at, "anatomy"));
  if (anatomias.length < R.anatomy) fal(anatomias.length ? nLinha(anatomias[0].ini) : 1, anatomias.length + " dl.anatomy (o tipo \"" + tipo + "\" pede " + R.anatomy + ")");
  if (anatomias.length > 3) avi(nLinha(anatomias[0].ini), anatomias.length + " dl.anatomy (o padrão é 1 a 3)");
  const pres = N.listar(tags, "pre");
  const eTerm = (p) => N.temClasse(p.at, "term");
  const terms = pres.filter(eTerm);
  if (terms.length < R.term) fal(terms.length ? nLinha(terms[0].ini) : 1, terms.length + " pre.term (o tipo \"" + tipo + "\" pede " + R.term + "): sem saída real o texto vira promessa");
  const cenarios = N.listar(tags, "div", (at) => N.temClasse(at, "cenario"));
  if (cenarios.length < R.cenario) fal(cenarios.length ? nLinha(cenarios[0].ini) : 1, cenarios.length + " div.cenario (o tipo \"" + tipo + "\" pede " + R.cenario + ")");
  const tabelas = N.listar(tags, "table", (at) => N.temClasse(at, "ref"));
  const foraDoWrap = tabelas.filter((t) => {
    const wrap = N.listar(tags, "div", (at) => N.temClasse(at, "table-wrap")).find((w) => N.dentroDe(w, t.ini));
    return !wrap;
  });
  if (tabelas.length < R.ref) fal(tabelas.length ? nLinha(tabelas[0].ini) : 1, tabelas.length + " table.ref (o tipo \"" + tipo + "\" pede " + R.ref + ")");
  foraDoWrap.forEach((t) => fal(nLinha(t.ini), "table.ref FORA de .table-wrap (no celular a tabela rola de lado e estoura a página)"));
  if (R.resumo && !h2Texto.some((t) => /^(\d+\.\s*)?Resumo$/i.test(t))) fal(1, "falta <h2>Resumo</h2> (a última seção é sempre o resumo)");
  const mcs = N.listar(tags, "div", (at) => N.temClasse(at, "mc"));
  if (mcs.length < R.mc) fal(mcs.length ? nLinha(mcs[0].ini) : 1, mcs.length + " .mc (múltipla escolha: o tipo \"" + tipo + "\" pede " + R.mc + ")");
  mcs.forEach((mc) => {
    const resp = parseInt(mc.at["data-answer"], 10);
    const labels = N.listar(tags, "label").filter((l) => N.dentroDe(mc, l.ini));
    if (!resp || resp < 1 || resp > labels.length)
      fal(nLinha(mc.ini), "mc com data-answer=\"" + (mc.at["data-answer"] || "") + "\" e " + labels.length + " opções (a resposta é 1..n)");
  });
  const exs = N.listar(tags, "div", (at) => N.temClasse(at, "exercise"));
  if (exs.length < R.exercicio) fal(exs.length ? nLinha(exs[0].ini) : 1, exs.length + " .exercise (o tipo \"" + tipo + "\" pede " + R.exercicio + ")");
  if (nFalhas() === n0) ok(1, "conteúdo ok para uma página de " + tipo + " (" + h2Conteudo.length + " h2, " + anatomias.length + " dl.anatomy, " + terms.length + " pre.term, " + cenarios.length + " cenários, " + tabelas.length + " table.ref, " + mcs.length + " .mc, " + exs.length + " exercício)");

  /* --------------------------------------------------------------- 4. caixas */
  n0 = nFalhas();
  const caixas = N.listar(tags, "div", (at) => N.temClasse(at, CAIXA));
  const dados = caixas.map((cx) => {
    const dentro = (sel, filtro) => N.listar(tags, sel, filtro).filter((e) => N.dentroDe(cx, e.ini));
    const htmls = dentro("pre", (at) => N.temClasse(at, "html"));
    const outs = dentro("pre", (at) => N.temClasse(at, "out"));
    const solucoes = dentro("pre", (at) => N.temClasse(at, "solucao"));
    const task = dentro("p", (at) => N.temClasse(at, "try-task"));
    return { cx, htmls, outs, solucoes, task, linha: nLinha(cx.ini) };
  });
  if (caixas.length < R.caixas) fal(caixas.length ? nLinha(caixas[0].ini) : 1, caixas.length + " caixa(s) ." + CAIXA + " (o tipo \"" + tipo + "\" pede " + R.caixas + ")");
  dados.forEach((d, k) => {
    const nome = "caixa " + (k + 1), L = d.linha;
    if (d.htmls.length !== 1) fal(L, nome + ": " + d.htmls.length + " pre.html (é um só, o editor com o HTML da aula)");
    if (d.outs.length > 1) fal(L, nome + ": " + d.outs.length + " pre.out (a caixa mostra uma saída só)");
    if (d.solucoes.length !== 1) fal(L, nome + ": " + d.solucoes.length + " pre.solucao (é uma só, escondida, com o HTML que cumpre a meta)");
    const largura = d.cx.at["data-largura"];
    if (largura !== undefined) {
      const n = parseInt(largura, 10);
      if (!n || n < 240 || n > 1280) fal(L, nome + ": data-largura=\"" + largura + "\" (use de 240 a 1280 px)");
    }
    const tema = d.cx.at["data-tema"];
    if (tema !== undefined && tema !== "escuro" && tema !== "claro") fal(L, nome + ": data-tema=\"" + tema + "\" (use escuro ou claro)");
    const goal = d.cx.at["data-goal"];
    if (goal === undefined) fal(L, nome + ": falta data-goal (sem meta o Verificar não confere nada)");
    else if (!String(goal).trim()) fal(L, nome + ": data-goal vazio");
    else N.validarMeta(goal).forEach((m) => fal(L, nome + ": " + m));
    if (!d.task.length) avi(L, nome + ": sem .try-task (o enunciado que o leitor lê)");
  });
  if (nFalhas() === n0) ok(1, caixas.length + " caixa(s) ." + CAIXA + " com pre.html, solução e data-goal válidos");

  /* ---------------------------------------------------------------- 5. metas */
  n0 = nFalhas();
  if (semSim) avi(1, "metas não verificadas (--sem-sim)");
  else if (!avaliador) avi(1, "navegador indisponível: as metas NÃO foram verificadas");
  else {
    let rodou = 0;
    for (let k = 0; k < dados.length; k++) {
      const d = dados[k], nome = "caixa " + (k + 1), L = d.linha;
      if (d.htmls.length !== 1 || d.solucoes.length !== 1) continue;
      const goal = d.cx.at["data-goal"];
      if (goal === undefined || !String(goal).trim()) continue;
      if (N.validarMeta(goal).length) continue;
      const ler = (el) => N.decodificarEntidades(src.slice(el.fimTag, el.fimEl ?? src.length)).replace(/^\n/, "").replace(/\s+$/, "");
      const largura = d.cx.at["data-largura"] || null;
      const escuro = d.cx.at["data-tema"] === "escuro";
      const ini = await avaliador(ler(d.htmls[0]), goal, tempo, largura, escuro);
      const sol = await avaliador(ler(d.solucoes[0]), goal, tempo, largura, escuro);
      if (ini.falhouNavegador || sol.falhouNavegador) { avi(1, "navegador falhou: " + ini.motivo); continue; }
      rodou++;
      if (ini.ok) fal(L, nome + ': o HTML INICIAL já cumpre a meta "' + N.curto(goal, 70) + '" (a missão não pede nada)');
      if (!sol.ok) fal(L, nome + ': a SOLUÇÃO não cumpre a meta "' + N.curto(goal, 70) + '": ' + N.curto(sol.motivo || sol.erro || "", 140));
      if (!ini.ok && sol.ok) ok(L, nome + ' (meta "' + N.curto(goal, 60) + '"): o inicial falha e a solução cumpre');
    }
    if (!caixas.length) avi(1, "nenhuma caixa para rodar as metas");
    if (!rodou && caixas.length) avi(1, "as metas desta página não chegaram ao navegador");
  }

  /* --------------------------------------------------------------- 6. escape */
  n0 = nFalhas();
  pres.forEach((p) => {
    if (eTerm(p)) return;                       // o terminal mostra >> , < > e & crus de propósito
    const cru = src.slice(p.fimTag, p.fimEl ?? src.length);
    const rotulo = "<pre" + (p.at["class"] ? ' class="' + p.at["class"] + '"' : "") + ">";
    let i = 0;
    while (i < cru.length) {
      const menor = cru.indexOf("<", i), maior = cru.indexOf(">", i);
      const pos = menor < 0 ? maior : maior < 0 ? menor : Math.min(menor, maior);
      if (pos < 0) break;
      if (pos === menor && N.TAG_INLINE_OK.test(cru.slice(pos))) {
        const fim = cru.indexOf(">", pos);
        i = fim < 0 ? cru.length : fim + 1;
        continue;
      }
      const ch = cru[pos];
      fal(nLinha(p.fimTag + pos), '"' + ch + '" sem escape dentro de ' + rotulo + " (escreva " +
        (ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&amp;") + "): " + N.curto(cru.slice(Math.max(0, pos - 25), pos + 25)));
      break;
    }
    let a = cru.indexOf("&");
    while (a >= 0) {
      const ent = /^&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.exec(cru.slice(a));
      const conhecida = ent && (ent[1].charAt(0) === "#" || Object.prototype.hasOwnProperty.call(N.ENTIDADES, ent[1]));
      if (!conhecida) {
        fal(nLinha(p.fimTag + a), ent
          ? "entidade " + ent[0] + " desconhecida dentro de " + rotulo
          : '"&" sem escape dentro de ' + rotulo + " (escreva &amp;): " + N.curto(cru.slice(Math.max(0, a - 25), a + 25)));
        break;
      }
      a = cru.indexOf("&", a + 1);
    }
  });
  if (nFalhas() === n0) ok(1, "escape ok dentro dos " + pres.length + " <pre> (fora pre.term, que é terminal)");

  /* ---------------------------------------------------------------- 7. links */
  n0 = nFalhas();
  const vistos = new Set();
  let nLinks = 0;
  for (const m of html.matchAll(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    const alvo = N.decodificarEntidades(m[2] ?? m[3] ?? "").trim();
    if (!alvo || alvo.charAt(0) === "#" || /^[a-z][a-z0-9+.-]*:/i.test(alvo) || alvo.slice(0, 2) === "//") continue;
    const sem = alvo.split("#")[0].split("?")[0];
    if (!/\.html?$/i.test(sem)) continue;
    const rel = sem.replace(/^\.\//, "");
    if (vistos.has(rel)) continue;
    vistos.add(rel);
    nLinks++;
    const L = nLinha(m.index);
    const existe = fs.existsSync(path.join(RAIZ, rel));
    if (!existe && completo) fal(L, 'link para "' + rel + '", que NÃO existe no disco (é o 404 mais caro do site)');
    else if (!existe) avi(L, 'link para "' + rel + '", que ainda não foi escrita (o guia está em construção; --completo reprova)');
    if (NIVEIS && !NIVEIS.has(rel) && !/^tools\//.test(rel)) fal(L, 'link para "' + rel + '", que não está na NIVEIS (o menu não conhece a página)');
  }
  if (!NIVEIS) avi(1, "não consegui ler a NIVEIS de assets/site.js");
  if (nFalhas() === n0) ok(1, nLinks ? nLinks + " link(s) interno(s) existem e estão na NIVEIS" : "nenhum link interno para conferir");

  /* --------------------------------------------------------- 8. placeholders */
  n0 = nFalhas();
  html.split("\n").forEach((linha, k) => {
    N.PLACEHOLDERS.forEach((ph) => {
      if (ph.re.test(linha)) fal(k + 1, 'placeholder de rascunho "' + ph.nome + '" no texto: ' + N.curto(linha.trim(), 80));
    });
  });
  if (nFalhas() === n0) ok(1, "nenhum placeholder de rascunho");

  /* ----------------------------------------------------------- 9. privacidade */
  n0 = nFalhas();
  html.split("\n").forEach((linha, k) => {
    const achados = [];
    N.PROIBIDOS.forEach((pr) => {
      pr.re.lastIndex = 0;
      const m = pr.re.exec(linha);
      if (m) achados.push({ ini: m.index, fim: m.index + m[0].length, txt: m[0], nome: pr.nome, generico: !!pr.generico });
    });
    const sobre = (a, b) => a.ini < b.fim && b.ini < a.fim;
    achados
      .filter((a) => !achados.some((b) => b !== a && sobre(a, b) &&
        ((a.generico && !b.generico) || (a.generico === b.generico && b.fim - b.ini > a.fim - a.ini))))
      .forEach((a) => fal(k + 1, 'dado da máquina real na página: "' + N.curto(a.txt, 40) + '" (' + a.nome + "; o guia usa só ana@notebook, /home/ana e America/Sao_Paulo)"));
  });
  if (nFalhas() === n0) ok(1, "privacidade ok (nada da máquina real)");

  /* -------------------------------------------------------------- 10. tamanho */
  const palavras = N.contarPalavras(N.textoVisivel(src));
  if (R.palavras && palavras < PALAVRAS_FALHA)
    fal(1, "texto visível com " + palavras + " palavras (o padrão do guia é 2.800 a 4.000; abaixo de " + PALAVRAS_FALHA + " é FALHA)");
  else if (R.palavras && palavras < PALAVRAS_AVISO)
    avi(1, "texto visível com " + palavras + " palavras (o padrão pede 2.800+)");
  else if (palavras > 4600) avi(1, "texto visível com " + palavras + " palavras (acima de 4.600 o leitor cansa)");

  return { itens: itens.sort((a, b) => a.linha - b.linha), palavras, caixas: caixas.length, tipo };
}

/* ============================================================== principal ==== */
function acharArquivo(p) {
  const cands = [p, path.join(RAIZ, p), path.join(RAIZ, path.basename(p))];
  return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

async function main() {
  const lista = [];
  for (const p of paginas) {
    const arq = acharArquivo(p);
    if (!arq) { console.error("não achei a página: " + p); process.exit(2); }
    lista.push({ arq, nome: path.relative(RAIZ, arq) });
  }

  let servidor = null, navegador = null, avaliador = null;
  if (!semSim) {
    const pup = acharPuppeteer();
    if (!pup) {
      console.error("não achei o puppeteer-core (use NODE_PATH=/caminho/node_modules ou PUPPETEER_DIR=…)");
      console.error("as metas NÃO serão verificadas; siga com --sem-sim para conferir só o contrato");
      process.exit(2);
    }
    const { servidor: s, porta } = await subirServidor();
    servidor = s;
    navegador = await pup.launch({ executablePath: acharChrome(), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const pg = await navegador.newPage();
    pg.on("pageerror", () => {});
    await pg.goto("http://127.0.0.1:" + porta + "/tools/avaliar.html", { waitUntil: "networkidle2", timeout: 60000 });
    await pg.waitForFunction("window.__avaliadorPronto === true", { timeout: 30000 });
    avaliador = async (htmlFonte, meta, limite, largura, escuro) => {
      const r = await pg.evaluate(async (h, m, l, lg, es) => {
        const comLimite = new Promise((ok) => setTimeout(() => ok({ ok: false, motivo: "não terminou em " + l + " ms", falhouNavegador: false }), l));
        return Promise.race([window.__tailwindAvaliar(h, m, lg, es), comLimite]);
      }, htmlFonte, meta, limite || 8000, largura || null, !!escuro);
      return r;
    };
    pg.__porta = porta;
  }

  let total = { paginas: 0, ok: 0, falhas: 0, avisos: 0 };
  const comFalha = [];
  const comAviso = [];
  const relatorio = [];

  for (const { arq, nome } of lista) {
    let r;
    try {
      r = await testarPagina(arq, avaliador, nome);
    } catch (e) {
      r = { itens: [{ grav: "FALHA", linha: 1, msg: "o testador quebrou nesta página: " + e.message }], palavras: 0, caixas: 0, tipo: "?" };
    }
    const f = r.itens.filter((i) => i.grav === "FALHA").length;
    const a = r.itens.filter((i) => i.grav === "aviso").length;
    total.paginas++;
    total.ok += r.itens.filter((i) => i.grav === "ok").length;
    total.falhas += f;
    total.avisos += a;
    if (f) comFalha.push(nome);
    if (a) comAviso.push(nome);
    relatorio.push({ nome, tipo: r.tipo, palavras: r.palavras, caixas: r.caixas, itens: r.itens, f, a });
  }

  relatorio.forEach((r) => {
    const mostrados = quieto ? r.itens.filter((i) => i.grav !== "ok") : r.itens;
    if (quieto && !mostrados.length) { if (!quieto) return; }
    console.log("\n== " + r.nome);
    mostrados.forEach((i) => {
      const marca = i.grav === "FALHA" ? "  FALHA " : i.grav === "aviso" ? "  aviso " : "  ok    ";
      console.log(marca + "linha " + i.linha + ": " + i.msg);
    });
    if (!quieto || mostrados.length)
      console.log("  -> " + r.itens.filter((i) => i.grav === "ok").length + " ok, " + r.f + " FALHA, " + r.a +
        " aviso · " + r.caixas + " caixa(s) · " + r.palavras + " palavras · página de " + r.tipo);
  });

  console.log("\nTOTAL: " + total.paginas + " página(s), " + total.ok + " ok, " + total.falhas + " FALHA, " + total.avisos + " aviso");
  if (comFalha.length) console.log("com FALHA: " + comFalha.join(", "));
  if (comAviso.length && quieto) console.log("com aviso: " + comAviso.length + " página(s)");

  if (navegador) await navegador.close();
  if (servidor) servidor.close();
  process.exit(total.falhas ? 1 : 0);
}

main().catch((e) => {
  console.error("erro fatal:", e);
  process.exit(2);
});
