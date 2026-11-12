/* Invitation à installer l'application (PWA) dès l'ouverture du lien sur téléphone.
   - Android / Chrome, Edge, Samsung Internet : bouton « Installer » (invite native)
   - iPhone / iPad : explications « Partager » puis « Sur l’écran d’accueil »
   - Navigateur intégré (WhatsApp, Facebook…) : proposer d’ouvrir dans le vrai navigateur
   Rien ne s’affiche si l’application est déjà installée ou ouverte en mode application. */
(function () {
  "use strict";

  var KEY = "lacour-install-dismissed";
  var SNOOZE_DAYS = 7;
  var ua = navigator.userAgent || "";

  var isStandalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (isStandalone) return;

  var isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  if (!isIOS && !isAndroid) return; // ordinateur : le navigateur a déjà sa propre icône d’installation

  var isIOSSafari = isIOS && /safari\//i.test(ua) && !/crios|fxios|edgios|opios|gsa\//i.test(ua) && !/FBAN|FBAV|Instagram|Line\/|MicroMessenger/i.test(ua);
  var isInApp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|; wv\)/i.test(ua) || (isIOS && !/safari\//i.test(ua));

  function snoozed() {
    try {
      var t = parseInt(localStorage.getItem(KEY) || "0", 10);
      return t && Date.now() - t < SNOOZE_DAYS * 864e5;
    } catch (e) { return false; }
  }
  function snooze() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }
  if (snoozed()) return;

  var deferred = null;
  var box = null;

  function css() {
    var s = document.createElement("style"); s.id = "pwa-inst-css";
    s.textContent =
      "#pwa-inst{position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:12px 12px calc(12px + env(safe-area-inset-bottom,0px));font-family:inherit;animation:pwaUp .25s ease-out}" +
      "@keyframes pwaUp{from{transform:translateY(100%)}to{transform:none}}" +
      "#pwa-inst .c{max-width:520px;margin:0 auto;background:var(--sf,#fff);color:var(--tx,#12262a);border:1px solid var(--bd,#d5dfdd);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.25);padding:14px}" +
      "#pwa-inst .h{display:flex;gap:12px;align-items:center}" +
      "#pwa-inst img{width:48px;height:48px;border-radius:12px;flex:none}" +
      "#pwa-inst b{display:block;font-size:16px}" +
      "#pwa-inst p{margin:2px 0 0;font-size:13px;color:var(--mu,#5d7177);line-height:1.4}" +
      "#pwa-inst ol{margin:10px 0 0;padding-left:20px;font-size:14px;line-height:1.6}" +
      "#pwa-inst .r{display:flex;gap:8px;margin-top:12px}" +
      "#pwa-inst button{flex:1;font:inherit;font-weight:600;padding:11px 14px;border-radius:10px;cursor:pointer;border:1px solid var(--bd,#d5dfdd);background:transparent;color:inherit}" +
      "#pwa-inst button.p{background:var(--ac,#0f766e);color:var(--acx,#fff);border-color:var(--ac,#0f766e)}";
    document.head.appendChild(s);
  }

  function close(remember) {
    if (remember) snooze();
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
  }

  function show(title, text, steps, buttons) {
    if (box) close(false);
    if (!document.getElementById("pwa-inst-css")) { css(); }
    box = document.createElement("div");
    box.id = "pwa-inst";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Installer l’application");
    var h = '<div class="c"><div class="h"><img src="icons/icon-192.png" alt=""><div><b>' + title + "</b><p>" + text + "</p></div></div>";
    if (steps) h += "<ol>" + steps.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol>";
    h += '<div class="r"></div></div>';
    box.innerHTML = h;
    var row = box.querySelector(".r");
    buttons.forEach(function (b) {
      var el = document.createElement("button");
      el.type = "button";
      el.textContent = b.label;
      if (b.primary) el.className = "p";
      el.addEventListener("click", b.onClick);
      row.appendChild(el);
    });
    document.body.appendChild(box);
  }

  var later = { label: "Plus tard", onClick: function () { close(true); } };

  function showNative() {
    show("Installer Lacour", "Ajoutez l’application à votre écran d’accueil : ouverture rapide, plein écran, comme une vraie application.", null, [
      later,
      { label: "Installer", primary: true, onClick: function () {
          if (!deferred) return close(false);
          var d = deferred; deferred = null;
          d.prompt();
          d.userChoice.then(function (r) { close(r && r.outcome !== "accepted"); }).catch(function () { close(false); });
      } }
    ]);
  }

  function showAndroidManual() {
    show("Installer Lacour", "Pour avoir l’application sur votre écran d’accueil :", [
      "Touchez le menu <b style=\"display:inline\">⋮</b> du navigateur",
      "Choisissez « Installer l’application » (ou « Ajouter à l’écran d’accueil »)"
    ], [later]);
  }

  function showIOS() {
    show("Installer Lacour", "Sur iPhone, l’installation se fait depuis Safari :", [
      "Touchez le bouton <b style=\"display:inline\">Partager</b> (carré avec une flèche vers le haut)",
      "Faites défiler et touchez « Sur l’écran d’accueil »",
      "Touchez « Ajouter »"
    ], [later]);
  }

  function showOpenInBrowser() {
    var url = location.href;
    show("Ouvrez dans votre navigateur", "Vous êtes dans un navigateur intégré (WhatsApp, Facebook…). Pour installer l’application, ouvrez ce lien dans " + (isIOS ? "Safari" : "Chrome") + ".", null, [
      later,
      { label: "Copier le lien", primary: true, onClick: function () {
          var done = function () { var b = box && box.querySelector("button.p"); if (b) b.textContent = "Lien copié ✓"; };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
          else { var t = document.createElement("textarea"); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(t); done(); }
      } }
    ]);
  }

  // Android / Chrome : l’invite native arrive d’elle-même
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    setTimeout(showNative, 1500);
  });

  window.addEventListener("appinstalled", function () { deferred = null; close(false); snooze(); });

  // Exposé pour un éventuel bouton « Installer l’application » dans les Réglages
  window.lacourInstall = function () {
    if (deferred) return showNative();
    if (isIOS) return isIOSSafari ? showIOS() : showOpenInBrowser();
    return isInApp ? showOpenInBrowser() : showAndroidManual();
  };

  function start() {
    if (isInApp) { setTimeout(showOpenInBrowser, 2000); return; }
    if (isIOS) { setTimeout(showIOS, 2000); return; }
    // Android : si l’invite native n’est pas arrivée après quelques secondes, explications manuelles
    setTimeout(function () { if (!deferred && !box) showAndroidManual(); }, 4000);
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
