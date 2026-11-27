/* tailwindsim.js — a caixa "Experimente" do Guia Tailwind.
 *
 * Não simula: o HTML do leitor é compilado pelo Tailwind v4 de verdade
 * (assets/tailwind-browser.js, a build oficial @tailwindcss/browser 4.3.5) dentro de um iframe.
 * O painel mostra o CSS computado do elemento marcado com id="alvo" — o mesmo que o
 * getComputedStyle devolve no navegador.
 */
(function () {
  "use strict";

  var MOTOR = "assets/tailwind-browser.js";
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) return "";
    return s.replace(/assets\/tailwindsim\.js.*$/, "");
  })();

  var LARGURA_PADRAO = 640;
  var LARGURA_MIN = 240;
  var LARGURA_MAX = 1280;

  /* o que aparece no painel, nesta ordem (só o que interessa para ensinar) */
  var PROPRIEDADES = [
    "display", "position", "width", "height", "min-height", "max-width",
    "margin", "padding", "gap", "flex-direction", "flex-wrap", "justify-content", "align-items",
    "grid-template-columns", "grid-template-rows",
    "background-color", "color", "font-size", "font-weight", "line-height", "letter-spacing",
    "text-align", "text-decoration-line", "text-transform",
    "border", "border-radius", "box-shadow", "outline", "opacity", "transform", "transition",
    "overflow", "cursor", "filter", "z-index"
  ];

  function normalizar(t) {
    return String(t == null ? "" : t)
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function lerLargura(valor) {
    var n = parseInt(valor, 10);
    if (!n || n < LARGURA_MIN) return LARGURA_PADRAO;
    return Math.min(n, LARGURA_MAX);
  }

  /* página que roda dentro do iframe: o Tailwind real + o HTML do leitor */
  function pagina(html, largura, escuro) {
    var tema = escuro ? " dark" : "";
    return "<!doctype html><html lang=\"pt-BR\" class=\"" + (escuro ? "dark" : "") + "\">" +
      "<head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<script src=\"" + BASE + MOTOR + "\"><\/script>" +
      "<style type=\"text/tailwindcss\">@custom-variant dark (&:where(.dark, .dark *));</style>" +
      "<style>html,body{margin:0}body{padding:12px;font-family:system-ui,sans-serif;color:#111}" +
      "html.dark body{color:#eee;background:#0b0b0c}</style>" +
      "</head><body>" + html + "</body></html>";
  }

  function esperarTailwind(doc, limite) {
    var fim = Date.now() + (limite || 8000);
    return new Promise(function (ok, falha) {
      (function tentar() {
        var estilos = doc.querySelectorAll("style");
        for (var i = 0; i < estilos.length; i++) {
          if ((estilos[i].textContent || "").indexOf("tailwindcss v4") !== -1) return ok(estilos[i].textContent);
        }
        if (Date.now() > fim) return falha(new Error("o Tailwind não compilou a tempo"));
        setTimeout(tentar, 40);
      })();
    });
  }

  /* monta um iframe novo (srcdoc), espera compilar e devolve o documento pronto */
  function compilar(container, html, largura, escuro) {
    return new Promise(function (ok, falha) {
      var velho = container.querySelector("iframe");
      if (velho) velho.remove();
      var iframe = document.createElement("iframe");
      iframe.setAttribute("title", "Prévia do HTML com Tailwind");
      /* a largura do iframe é o viewport da prévia: é ela que decide qual breakpoint vale */
      iframe.style.width = lerLargura(largura) + "px";
      iframe.style.margin = "0 auto";
      iframe.style.border = "0";
      iframe.style.display = "block";
      iframe.style.background = escuro ? "#0b0b0c" : "#fff";
      iframe.srcdoc = pagina(html, largura, escuro);
      iframe.addEventListener("load", function () {
        var doc = iframe.contentDocument;
        esperarTailwind(doc, 8000).then(function (css) {
          // altura do conteúdo, para o iframe não ficar com barra interna
          var altura = Math.max(
            80,
            Math.min(720, doc.documentElement.scrollHeight || doc.body.scrollHeight || 120)
          );
          iframe.style.height = altura + "px";
          ok({ doc: doc, css: css, iframe: iframe, altura: altura });
        }).catch(falha);
      });
      container.appendChild(iframe);
    });
  }

  function alvoDe(doc) {
    return doc.querySelector("#alvo") || doc.body.firstElementChild || doc.body;
  }

  /* o CSS gerado desta página, regra por regra (seletor + corpo), sem CSSOM */
  function regrasDoTexto(doc) {
    var texto = "";
    Array.prototype.forEach.call(doc.querySelectorAll("style"), function (st) {
      var t = st.textContent || "";
      if (t.indexOf("tailwindcss v4") !== -1 && t.length > texto.length) texto = t;
    });
    if (!texto) return [];
    var regras = [];
    var bloco = null;
    texto.split("\n").forEach(function (linha) {
      var d = linha.trim();
      if (bloco && d === "}") { regras.push(bloco); bloco = null; return; }
      if (bloco) { if (d) bloco.corpo.push(d.replace(/;$/, "")); return; }
      var sel = linha.match(/^\s*(\.[^{]+?)\s*\{\s*$/);
      if (sel) bloco = { seletor: sel[1].trim(), corpo: [] };
    });
    return regras;
  }

  /* ".dark\:invert:where(.dark, .dark *)" tem vírgula DENTRO de :where(): separa só no nível de fora */
  function partirSeletores(sel) {
    var out = [];
    var nivel = 0;
    var atual = "";
    for (var i = 0; i < sel.length; i++) {
      var c = sel.charAt(i);
      if (c === "(" || c === "[") nivel++;
      else if (c === ")" || c === "]") nivel = Math.max(0, nivel - 1);
      if (c === "," && nivel === 0) { if (atual.trim()) out.push(atual.trim()); atual = ""; continue; }
      atual += c;
    }
    if (atual.trim()) out.push(atual.trim());
    return out;
  }

  /* as propriedades que as classes DO ELEMENTO mandam o Tailwind gerar */
  function propriedadesDasClasses(doc, el) {
    var props = [];
    var regras = regrasDoTexto(doc);
    regras.forEach(function (r) {
      var casa = partirSeletores(r.seletor).some(function (sel) {
        try { return el.matches(sel); } catch (e) { return false; }
      });
      if (!casa) return;
      r.corpo.forEach(function (l) {
        var i = l.indexOf(":");
        if (i <= 0) return;
        var p = l.slice(0, i).trim();
        if (!p || p.indexOf("--") === 0 || props.indexOf(p) !== -1) return;
        props.push(p);
      });
    });
    /* ordem de leitura: primeiro o que o guia ensina, depois o resto em ordem alfabética */
    var peso = function (p) { var i = PROPRIEDADES.indexOf(p); return i === -1 ? 1000 + p.charCodeAt(0) : i; };
    props.sort(function (a, b) { return peso(a) - peso(b); });
    return props;
  }

  /* o que as classes MUDARAM no elemento: compara com uma cópia sem classe, no mesmo lugar,
   * e mostra só as propriedades que o Tailwind gerou para as classes dele (sem ruído de
   * "display: block", largura do container ou altura do texto). */
  function tabela(doc) {
    var el = alvoDe(doc);
    var win = doc.defaultView;
    var base = el.cloneNode(true);
    base.removeAttribute("id");
    base.removeAttribute("class");
    el.parentNode.insertBefore(base, el.nextSibling);
    var referencia = win.getComputedStyle(base);
    var atual = win.getComputedStyle(el);
    var linhas = [];

    function adicionar(p) {
      var v = normalizar(atual.getPropertyValue(p));
      var b = normalizar(referencia.getPropertyValue(p));
      if (!v || v === b) return;
      if (p === "border" && /^0px/.test(v)) return;          // borda de fábrica, sem largura
      if (p === "outline" && v.indexOf(" none ") !== -1) return;
      if (linhas.indexOf(p + ": " + v) !== -1) return;
      linhas.push(p + ": " + v);
    }

    var props = propriedadesDasClasses(doc, el);
    props.forEach(adicionar);
    if (!linhas.length) PROPRIEDADES.forEach(adicionar);   // utilidade que age no filho (space-y, divide…)
    base.parentNode.removeChild(base);
    /* "padding: 8px 24px" já conta a história toda: não repete padding-inline/block embaixo */
    var temAtalho = function (p) { return linhas.some(function (l) { return l.indexOf(p + ": ") === 0; }); };
    return linhas.filter(function (l) {
      if (l.indexOf("padding-") === 0 && temAtalho("padding")) return false;
      if (l.indexOf("margin-") === 0 && temAtalho("margin")) return false;
      return true;
    }).join("\n");
  }

  /* regras do CSS gerado que interessam ao trecho (as classes usadas nele).
   * Lê o TEXTO do CSS (formatado pelo Tailwind) e devolve só os blocos das classes usadas,
   * mantendo o @media/@supports de fora. Sem CSSOM: o mesmo resultado no Node e no navegador.
   */
  function regrasUsadas(doc) {
    var tokens = {};
    Array.prototype.forEach.call(doc.querySelectorAll("*"), function (el) {
      Array.prototype.forEach.call(el.classList, function (c) { tokens[c] = true; });
    });
    var procurados = Object.keys(tokens).map(function (t) {
      return "." + (window.CSS && CSS.escape ? CSS.escape(t) : t.replace(/[:./[\]]/g, "\\$&"));
    });
    var texto = "";
    Array.prototype.forEach.call(doc.querySelectorAll("style"), function (st) {
      var t = st.textContent || "";
      if (t.indexOf("tailwindcss v4") !== -1 && t.length > texto.length) texto = t;
    });
    if (!texto) return "";

    var linhas = texto.split("\n");
    var saida = [];
    var vistos = {};
    var pilha = [];   // @media / @supports abertos
    var bloco = null; // regra em coleta
    for (var i = 0; i < linhas.length; i++) {
      var linha = linhas[i];
      var semEspaco = linha.trim();

      // fecha um bloco de regra
      if (bloco && semEspaco === "}") {
        if (bloco.achou && bloco.corpo.length) {
          var chave = bloco.seletor + "|" + bloco.corpo.join("\n");
          if (!vistos[chave]) {
            vistos[chave] = true;
            var prefixo = bloco.media;
            var recuo = prefixo ? "  " : "";
            if (prefixo) saida.push(prefixo + " {");
            saida.push(recuo + bloco.seletor + " {");
            bloco.corpo.forEach(function (l) { saida.push(recuo + "  " + l); });
            saida.push(recuo + "}");
            if (prefixo) saida.push("}");
          }
        }
        bloco = null;
        continue;
      }
      // fecha um at-rule (@media / @supports / @layer)
      if (!bloco && semEspaco === "}" && pilha.length) { pilha.pop(); continue; }

      // abre um at-rule
      var at = linha.match(/^\s*(@[a-z-]+)([^{]*)\{\s*$/i);
      if (!bloco && at) {
        var nome = at[1].toLowerCase();
        var rotulo = null;
        if (nome === "@media" || nome === "@supports" || nome === "@container") {
          rotulo = nome + " " + at[2].trim();
        }
        pilha.push(rotulo); // @layer e outros entram como null (só para o fechamento)
        continue;
      }

      // abre uma regra de classe
      var sel = linha.match(/^\s*(\.[^{]+?)\s*\{\s*$/);
      if (!bloco && sel) {
        var seletor = sel[1].trim();
        var casa = partirSeletores(seletor).some(function (x) {
          return procurados.some(function (p) { return x.indexOf(p) === 0; });
        });
        var wrapper = null;
        for (var k = pilha.length - 1; k >= 0; k--) { if (pilha[k]) { wrapper = pilha[k]; break; } }
        bloco = { seletor: seletor, corpo: [], achou: casa, media: wrapper };
        continue;
      }

      if (bloco) {
        var d = semEspaco;
        if (d) bloco.corpo.push(d.endsWith(";") ? d : d + ";");
      }
    }
    return saida.join("\n");
  }

  /* ------------------------------------------------------------------ metas */

  function passosDaMeta(meta) {
    return String(meta || "").split(";;").map(function (p) { return p.trim(); }).filter(Boolean);
  }

  function dividir(passo) {
    var i = passo.indexOf(":");
    return i === -1 ? { nome: passo, valor: "" } : { nome: passo.slice(0, i).trim(), valor: passo.slice(i + 1).trim() };
  }

  function cssDe(doc, seletor, prop) {
    var el;
    try { el = doc.querySelector(seletor); } catch (e) { return null; }
    if (!el) return null;
    var v = doc.defaultView.getComputedStyle(el).getPropertyValue(prop);
    return normalizar(v);
  }

  /* devolve null quando cumpriu, ou o motivo da falha (texto curto) */
  function conferir(doc, css, meta) {
    var passos = passosDaMeta(meta);
    if (!passos.length) return "a caixa não tem meta (data-goal)";
    for (var i = 0; i < passos.length; i++) {
      var p = dividir(passos[i]);
      if (p.nome === "largura" || p.nome === "escuro" || p.nome === "depois") continue; // já aplicados
      if (p.nome === "css") {
        var m = p.valor.match(/^(.*)\|([a-z-]+)=(.+)$/);
        if (!m) return "passo css mal escrito (use css:seletor|propriedade=valor)";
        var achado = cssDe(doc, m[1].trim(), m[2].trim());
        if (achado === null) return "não achei o elemento \"" + m[1].trim() + "\"";
        if (achado !== normalizar(m[3])) {
          return m[1].trim() + " tem " + m[2].trim() + " = " + (achado || "vazio") + " (a missão pede " + normalizar(m[3]) + ")";
        }
        continue;
      }
      if (p.nome === "rule") {
        var trecho = normalizar(p.valor);
        if (normalizar(css).indexOf(trecho) === -1) return "o CSS gerado não tem \"" + trecho + "\"";
        continue;
      }
      if (p.nome === "conta") {
        var c = p.valor.match(/^(.*)=(\d+)$/);
        if (!c) return "passo conta mal escrito (use conta:seletor=n)";
        var n;
        try { n = doc.querySelectorAll(c[1].trim()).length; } catch (e) { return "seletor inválido em conta: " + c[1]; }
        if (n !== parseInt(c[2], 10)) return "contei " + n + " elemento(s) em \"" + c[1].trim() + "\" (a missão pede " + c[2] + ")";
        continue;
      }
      if (p.nome === "texto") {
        var corpo = normalizar((doc.body && doc.body.innerText) || "");
        if (corpo.indexOf(normalizar(p.valor)) === -1) return "o texto da prévia não tem \"" + normalizar(p.valor) + "\"";
        continue;
      }
      return "passo de meta desconhecido: \"" + p.nome + "\" (use css:, rule:, conta:, texto:, largura:, escuro:)";
    }
    return null;
  }

  /* ------------------------------------------------------------------- caixa */

  function montarCaixa(caixa) {
    var fonte = caixa.querySelector("pre.html");
    var solucao = caixa.querySelector("pre.solucao");
    if (!fonte) return;

    var inicial = fonte.textContent.replace(/^\n+|\s+$/g, "");
    var meta = caixa.getAttribute("data-goal") || "";
    var querCss = fonte.getAttribute("data-saida") === "css";
    var largura = lerLargura(caixa.getAttribute("data-largura"));
    var escuro = caixa.getAttribute("data-tema") === "escuro";

    fonte.setAttribute("contenteditable", "true");
    fonte.setAttribute("spellcheck", "false");
    fonte.setAttribute("role", "textbox");
    fonte.setAttribute("aria-label", "Código HTML");

    var barra = document.createElement("div");
    barra.className = "try-bar";
    barra.innerHTML =
      '<span class="try-nome">' + (fonte.getAttribute("data-file") || "index.html") + "</span>" +
      '<button type="button" class="try-rodar">Rodar</button>' +
      '<button type="button" class="try-verificar secondary">Verificar</button>' +
      '<button type="button" class="try-solucao secondary">Ver solução</button>' +
      '<button type="button" class="try-restaurar secondary">Restaurar</button>' +
      '<span class="try-largura" aria-label="Largura da prévia">' + largura + " px</span>";
    var etiquetaLargura = barra.querySelector(".try-largura");

    var palco = document.createElement("div");
    palco.className = "try-vivo";

    var saida = document.createElement("pre");
    saida.className = "try-out";
    saida.setAttribute("aria-live", "polite");
    saida.hidden = true;

    var status = document.createElement("p");
    status.className = "try-status";

    caixa.insertBefore(barra, fonte);
    caixa.insertBefore(palco, fonte.nextSibling ? fonte.nextSibling : null);
    caixa.insertBefore(saida, palco.nextSibling);
    caixa.appendChild(status);

    function mostrarTabela(doc) {
      var t = querCss ? regrasUsadas(doc) : tabela(doc);
      saida.textContent = t || (querCss ? "(nenhuma regra gerada para essas classes)" : "(nenhuma propriedade mudou)");
      saida.hidden = !t;
    }

    /* o rótulo diz a largura de verdade do viewport da prévia (no celular ela é limitada) */
    function medirLargura(r) {
      if (!etiquetaLargura || !r || !r.doc) return;
      var v = r.doc.defaultView ? r.doc.defaultView.innerWidth : 0;
      if (v) etiquetaLargura.textContent = v + " px";
    }

    function rodar() {
      status.textContent = "";
      return compilar(palco, fonte.textContent, largura, escuro).then(function (r) {
        medirLargura(r);
        mostrarTabela(r.doc);
        return r;
      }).catch(function (e) {
        saida.textContent = "não deu para compilar: " + e.message;
        saida.hidden = false;
        throw e;
      });
    }

    function verificar() {
      return compilar(palco, fonte.textContent, largura, escuro).then(function (r) {
        medirLargura(r);
        mostrarTabela(r.doc);
        var falha = conferir(r.doc, r.css, meta);
        if (falha) {
          status.textContent = "ainda não: " + falha;
          status.classList.add("falhou");
        } else {
          status.textContent = "isso: o CSS computado é o que a missão pede.";
          status.classList.remove("falhou");
        }
        return !falha;
      });
    }

    barra.querySelector(".try-rodar").addEventListener("click", function () { rodar().catch(function () {}); });
    barra.querySelector(".try-verificar").addEventListener("click", function () { verificar().catch(function (e) {
      status.textContent = "não deu para verificar: " + e.message;
    }); });
    barra.querySelector(".try-restaurar").addEventListener("click", function () {
      fonte.textContent = inicial;
      status.textContent = "";
      saida.textContent = "";
      saida.hidden = true;
      if (palco.firstChild) palco.removeChild(palco.firstChild);
    });

    var botaoSolucao = barra.querySelector(".try-solucao");
    if (solucao) {
      botaoSolucao.addEventListener("click", function () {
        fonte.textContent = solucao.textContent.replace(/^\n+|\s+$/g, "");
        rodar().catch(function () {});
      });
    } else {
      botaoSolucao.hidden = true;
    }
    fonte.addEventListener("input", function () { status.textContent = ""; });

    caixa.__rodar = rodar;
    caixa.__verificar = verificar;
  }

  function iniciar() {
    var caixas = Array.prototype.slice.call(document.querySelectorAll(".trytailwind"));
    caixas.forEach(montarCaixa);
    window.__tailwindPronto = true;
  }

  /* API usada pelo testador (tools/avaliar.html) */
  function palcoDe(largura) {
    var palco = document.createElement("div");
    palco.style.width = lerLargura(largura) + "px";
    palco.style.maxWidth = "none";
    document.body.appendChild(palco);
    return palco;
  }

  window.__tailwindRegras = function (html, largura, escuro) {
    var palco = palcoDe(largura);
    return compilar(palco, html, lerLargura(largura), !!escuro).then(function (r) {
      var texto = regrasUsadas(r.doc);
      if (r.iframe) r.iframe.remove();
      palco.remove();
      return texto;
    }).catch(function (e) {
      palco.remove();
      return "";
    });
  };

  window.__tailwindAvaliar = function (html, meta, largura, escuro) {
    var palco = palcoDe(largura);
    return compilar(palco, html, lerLargura(largura), !!escuro).then(function (r) {
      var falha = conferir(r.doc, r.css, meta);
      var tabelaTexto = tabela(r.doc);
      var t = r.iframe;
      if (t) t.remove();
      palco.remove();
      return { ok: !falha, motivo: falha, tabela: tabelaTexto };
    }).catch(function (e) {
      palco.remove();
      return { ok: false, motivo: "não compilou: " + e.message, tabela: "" };
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
