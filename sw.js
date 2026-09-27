// Offline support: the app shell is cached on install; fonts are cached the first time they load.
var CACHE = "precall-v2";
var SHELL = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  var font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !font) return;

  // Same-origin files: network first so updates show up, cache when there's no signal.
  // Fonts: cache first, they never change.
  if (font){
    e.respondWith(caches.match(req).then(function(hit){
      return hit || fetch(req).then(function(res){
        var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); return res;
      });
    }));
    return;
  }
  e.respondWith(fetch(req).then(function(res){
    if (res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
    return res;
  }).catch(function(){
    return caches.match(req, { ignoreSearch: true }).then(function(hit){
      return hit || (req.mode === "navigate" ? caches.match("index.html") : undefined);
    });
  }));
});
