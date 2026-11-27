#!/usr/bin/env node
/* testar-navegador.js — abre as páginas no Chromium de verdade, clica em tudo e mede.
 *
 *   node tools/testar-navegador.js pagina.html [outra.html …]
 *   node tools/testar-navegador.js --todas
 *   --largura 1280        largura do desktop (padrão 1280)
 *   --fotos DIR           salva um PNG de cada página (claro e escuro)
 *   --rapido              não clica nas caixas (só carrega e mede)
 *
 * Reprova (problema) quando:
 *   - o menu lateral não tem o número de links da NIVEIS (menu quebrado);
 *   - alguma caixa .trynginx não monta, ou o botão Rodar não desenha nada;
 *   - a página rola de lado a 375 px (o celular é o leitor mais comum);
 *   - aparece erro no console ou exceção na página;
 *   - o título da aba não termina em "| Guia Nginx".
 *
 * Sai com código 1 quando alguma página tem problema.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const N = require("./nucleo");

const RAIZ = N.RAIZ;
const args = process.argv.slice(2);
let todas = false, largura = 1280, fotos = null, rapido = false;
const paginas = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--todas") todas = true;
  else if (a === "--largura") largura = parseInt(args[++i], 10) || 1280;
  else if (a === "--fotos") fotos = args[++i];
  else if (a === "--rapido") rapido = true;
  else if (a.charAt(0) === "-") { console.error("opção desconhecida: " + a); process.exit(2); }
  else paginas.push(a);
}
if (todas) fs.readdirSync(RAIZ).filter((f) => /\.html$/i.test(f)).sort().forEach((f) => paginas.push(f));
if (!paginas.length) { console.error("uso: node tools/testar-navegador.js [--todas] [--fotos DIR] [página.html …]"); process.exit(2); }

function subirServidor() {
  const tipos = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
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
  const cands = [
    process.env.PUPPETEER_DIR && path.join(process.env.PUPPETEER_DIR, "puppeteer-core"),
    path.join(RAIZ, "node_modules/puppeteer-core"),
    path.join(os.homedir(), "guia-react/node_modules/puppeteer-core"),
    "puppeteer-core"
  ].filter(Boolean);
  for (const c of cands) { try { return require(c); } catch (e) {} }
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
  } catch (e) {}
  return undefined;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function testarPagina(pg, url, nomePag, esperado) {
  const problemas = [];
  const notas = [];
  const erros = [];
  let dentroDasCaixas = false;   // erro de componente é verificado pelo testar-missoes
  const aoErro = (e) => { if (!dentroDasCaixas) erros.push("exceção na página: " + String(e && e.message || e).slice(0, 160)); };
  const aoConsole = (m) => { if (!dentroDasCaixas && m.type() === "error") erros.push("console: " + m.text().slice(0, 160)); };
  pg.on("pageerror", aoErro);
  pg.on("console", aoConsole);

  const t0 = Date.now();
  try {
    await pg.setViewport({ width: largura, height: 900 });
    await pg.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await dormir(120);

    const titulo = await pg.title();
    if (!/\|\s*Guia Nginx\s*$/.test(titulo)) problemas.push("título da aba não termina em \"| Guia Nginx\": \"" + titulo + "\"");

    const info = await pg.evaluate(() => {
      const caixas = document.querySelectorAll(".trynginx");
      return {
        caixas: caixas.length,
        menu: document.querySelectorAll("#sidebar .nivel-lista a").length,
        marca: !!document.querySelector(".brand")
      };
    });
    if (!info.marca) problemas.push("a barra superior não foi montada (assets/site.js não rodou)");

    // tag escrita como exemplo na prosa, sem escape, abre um elemento de verdade e engole
    // o resto da aula (aconteceu com `<button>`): o sintoma é um elemento inline com bloco dentro
    const engolidos = await pg.evaluate(() => {
      const achados = [];
      document.querySelectorAll(".content p, .content button, .content span, .content h2, .content h3, .content a, .content li").forEach((e) => {
        if (e.closest("pre")) return;
        const dentro = e.querySelector("p, h2, h3, div, ul, ol, pre, table, section");
        if (dentro) achados.push(e.tagName.toLowerCase() + " engolindo <" + dentro.tagName.toLowerCase() + ">");
      });
      return achados.slice(0, 3);
    });
    engolidos.forEach((e) => problemas.push("tag sem escape na prosa: " + e));
    if (info.menu !== esperado) problemas.push("menu com " + info.menu + " links (a NIVEIS tem " + esperado + ")");

    let rodadas = 0, verificadas = 0, comMeta = 0;
    if (!rapido && info.caixas) {
      dentroDasCaixas = true;
      // o motor (assets/nginx-engine.js) só carrega quando a página tem caixa de nginx
      await pg.waitForFunction("window.__nginxPronto === true", { timeout: 30000 }).catch(() => {
        problemas.push("o motor não carregou (window.__nginxPronto nunca ficou true)");
      });
      comMeta = await pg.evaluate(() => document.querySelectorAll(".trynginx[data-goal]").length);

      const lerCaixa = (ix) => pg.evaluate((i) => {
        const c = document.querySelectorAll(".trynginx")[i];
        if (!c) return null;
        const out = c.querySelector(".try-out");
        const st = c.querySelector(".try-status");
        return {
          out: out ? out.innerText.trim() : "",
          altura: out ? Math.round(out.getBoundingClientRect().height) : 0,
          status: st ? st.innerText.trim() : "",
          falhou: !!(st && st.classList.contains("falhou")),
          temPedido: !!c.querySelector(".try-pedido"),
          temHost: !!c.querySelector(".try-host")
        };
      }, ix);

      const clicar = (ix, seletor) => pg.evaluate(({ i, sel }) => {
        const c = document.querySelectorAll(".trynginx")[i];
        const b = c && c.querySelector(sel);
        if (!b || b.hidden) return false;
        b.click();
        return true;
      }, { i: ix, sel: seletor });

      const esperar = async (ix, campo, texto) => {
        for (let t = 0; t < 40; t++) {
          const e = await lerCaixa(ix);
          if (!e) return null;
          if (texto ? e[campo].indexOf(texto) !== -1 : e[campo]) return e;
          await dormir(150);
        }
        return lerCaixa(ix);
      };

      for (let i = 0; i < info.caixas; i++) {
        const c1 = await lerCaixa(i);
        if (!c1) { problemas.push("caixa " + (i + 1) + " sumiu do DOM"); continue; }
        if (!c1.temPedido || !c1.temHost) problemas.push("caixa " + (i + 1) + ": faltam os campos de pedido/host");

        // 1) Rodar: a configuração inicial tem de produzir uma resposta (ou um erro de config) na tela
        if (!await clicar(i, ".try-rodar")) { problemas.push("caixa " + (i + 1) + " sem botão Rodar"); continue; }
        const depoisDeRodar = await esperar(i, "out");
        rodadas++;
        if (!depoisDeRodar || !depoisDeRodar.out) problemas.push("caixa " + (i + 1) + ": o Rodar não escreveu a resposta");
        else if (depoisDeRodar.altura < 20) problemas.push("caixa " + (i + 1) + ": a saída ficou com " + depoisDeRodar.altura + " px de altura");
        else if (!/^(HTTP\/|nginx:|erro de configura|\[emerg\])/i.test(depoisDeRodar.out.replace(/^\s+/, ""))) {
          notas.push("caixa " + (i + 1) + ": saída fora do formato do curl -i (" + depoisDeRodar.out.replace(/\s+/g, " ").slice(0, 60) + ")");
        }

        // 2) Ver solução + Verificar: prova que a missão é cumprível e que o conferidor responde
        const temSolucao = await clicar(i, ".try-solucao");
        if (!temSolucao) notas.push("caixa " + (i + 1) + " sem pre.solucao (o botão Ver solução fica escondido)");
        else {
          await esperar(i, "out");
          if (!await clicar(i, ".try-verificar")) problemas.push("caixa " + (i + 1) + " sem botão Verificar");
          else {
            const st = await esperar(i, "status");
            if (!st || !st.status) problemas.push("caixa " + (i + 1) + ": o Verificar não escreveu status");
            else if (st.falhou) problemas.push("caixa " + (i + 1) + ": a solução não passa na meta (" + st.status.replace(/\s+/g, " ").slice(0, 120) + ")");
            else verificadas++;
          }
        }
        // 3) Restaurar volta ao texto de partida (a página tem de continuar utilizável)
        if (!await clicar(i, ".try-restaurar")) problemas.push("caixa " + (i + 1) + " sem botão Restaurar");
        else {
          const volta = await pg.evaluate((ix) => {
            const c = document.querySelectorAll(".trynginx")[ix];
            const s = c.querySelector("pre.script");
            return { texto: s ? s.textContent.trim().slice(0, 40) : "", out: c.querySelector(".try-out").innerText.trim() };
          }, i);
          if (!volta.texto) problemas.push("caixa " + (i + 1) + ": o Restaurar apagou o arquivo");
          if (volta.out) problemas.push("caixa " + (i + 1) + ": o Restaurar deixou a saída antiga na tela");
        }
      }
      dentroDasCaixas = false;
    }

    // celular: 375 px, sem rolagem horizontal
    await pg.setViewport({ width: 375, height: 812 });
    await dormir(150);
    const celular = await pg.evaluate(() => {
      const de = document.documentElement;
      const rolaSozinho = (e) => {
        for (let p = e.parentElement; p; p = p.parentElement) {
          const ov = getComputedStyle(p).overflowX;
          if (ov === "auto" || ov === "scroll") return true;
        }
        return false;
      };
      const largos = Array.from(document.querySelectorAll("body *")).filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 0 && b.right > window.innerWidth + 1 && !rolaSozinho(e);
      }).slice(0, 3).map((e) => {
        const cls = typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/)[0] : "";
        return e.tagName.toLowerCase() + cls;
      });
      return { rolagem: de.scrollWidth, janela: window.innerWidth, largos };
    });
    if (celular.rolagem > celular.janela + 1)
      problemas.push("rolagem horizontal em 375 px: a página mede " + celular.rolagem + " px (janela " + celular.janela +
        " px)" + (celular.largos.length ? " — passam da borda: " + celular.largos.join(", ") : ""));

    if (fotos) {
      const nomeArq = path.basename(nomePag).replace(/\.html?$/i, "");
      await pg.setViewport({ width: largura, height: 900 });
      await pg.evaluate(() => window.scrollTo(0, 0));
      await pg.screenshot({ path: path.join(fotos, nomeArq + ".png"), fullPage: true });
      await pg.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await dormir(80);
      await pg.screenshot({ path: path.join(fotos, nomeArq + "-escuro.png"), fullPage: true });
      await pg.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    }

    // a página pode pedir um erro de propósito: data-goal="erro:<trecho>"
    const trechos = Array.from(new Set((await pg.evaluate(() => Array.from(document.querySelectorAll(".trynginx[data-goal]"))
      .map((c) => c.getAttribute("data-goal").split(";;").map((p) => p.trim()).filter((p) => p.indexOf("erro:") === 0).map((p) => p.slice(5).trim()))
      .flat().filter(Boolean)))));
    const pretendido = (msg) => trechos.some((t) => msg.indexOf(t) !== -1);
    erros.filter((e) => !pretendido(e)).slice(0, 6).forEach((e) => problemas.push(e));
    notas.push("caixas=" + info.caixas + ", Rodar " + rodadas + ", Verificar " + verificadas + (comMeta ? "/" + comMeta : "") +
      ", menu=" + info.menu + "/" + esperado + ", 375 px " + (celular.rolagem > celular.janela + 1 ? "ROLANDO" : "ok"));
    return { problemas, notas, ms: Date.now() - t0 };
  } finally {
    pg.off("pageerror", aoErro);
    pg.off("console", aoConsole);
  }
}

(async () => {
  const pup = acharPuppeteer();
  if (!pup) { console.error("não achei o puppeteer-core (use NODE_PATH=/caminho/node_modules)"); process.exit(2); }
  const NIVEIS = N.lerNiveis();
  const esperado = NIVEIS ? NIVEIS.size : 0;
  if (!esperado) console.error("aviso: não consegui ler a NIVEIS; o menu não será conferido");
  if (fotos) fs.mkdirSync(fotos, { recursive: true });

  const { servidor, porta } = await subirServidor();
  const navegador = await pup.launch({ executablePath: acharChrome(), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const pg = await navegador.newPage();
  console.log("servindo " + RAIZ + " em http://127.0.0.1:" + porta);
  console.log("menu esperado: " + esperado + " links (NIVEIS de assets/site.js)\n");

  let ruins = 0;
  const listaRuins = [];
  for (const p of paginas) {
    const arq = path.join(RAIZ, p);
    if (!fs.existsSync(arq)) { console.error("não achei: " + p); continue; }
    const url = "http://127.0.0.1:" + porta + "/" + p;
    let r;
    try {
      r = await testarPagina(pg, url, p, esperado);
    } catch (e) {
      r = { problemas: ["o testador quebrou: " + e.message], notas: ["(nada)"], ms: 0 };
    }
    if (r.problemas.length) {
      ruins++;
      listaRuins.push(p);
      console.log("✗ " + p + "  (" + (r.ms / 1000).toFixed(1) + " s)");
      r.problemas.slice(0, 8).forEach((m) => console.log("    " + m));
    } else {
      console.log("✓ " + p + "  " + r.notas[0] + "  (" + (r.ms / 1000).toFixed(1) + " s)");
      r.notas.slice(1).forEach((n) => console.log("    nota: " + n));
    }
  }

  console.log("\n" + paginas.length + " página(s), " + ruins + " com problema" + (ruins ? "" : "") + ".");
  if (ruins) console.log("com problema: " + listaRuins.join(", "));
  await navegador.close();
  servidor.close();
  process.exit(ruins ? 1 : 0);
})().catch((e) => { console.error("erro fatal:", e); process.exit(2); });
