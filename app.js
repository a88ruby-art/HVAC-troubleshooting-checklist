(function(){
  "use strict";

  /* ---------- Checklist definition ---------- */

  function F(id, label, o){ o = o || {}; o.id = id; o.label = label; o.type = o.type || "num"; return o; }
  function T(id, label, o){ o = o || {}; o.type = "text"; return F(id, label, o); }
  function A(id, label, o){ o = o || {}; o.type = "area"; return F(id, label, o); }
  function S(id, label, options, o){ o = o || {}; o.type = "select"; o.options = options; return F(id, label, o); }

  var STEPS = [
    { id:"unit", title:"Unit", hint:"Off the data plate, not from memory.", items:[
      T("model","Model number",{req:true, caps:true}),
      T("serial","Serial number",{req:true, caps:true}),
      {note:"history"},
      {cols:2, fields:[
        S("eqtype","Type",["RTU — gas/electric","RTU — heat pump","Split system","Mini-split","CRAC / precision","Other"]),
        F("tons","Tonnage")
      ]}
    ]},
    { id:"voltage", title:"Incoming voltage", hint:"Measured at the disconnect, line side.", items:[
      {cols:3, fields:[ F("l12","L1–L2",{req:true}), F("l23","L2–L3"), F("l13","L1–L3") ]},
      {flag:"volt"},
      {cols:2, fields:[
        S("nameplate","Nameplate volts",["115","208","230","240","460","480"]),
        F("lowv","Control",{unit:"24V"})
      ]}
    ]},
    { id:"amps", title:"Amp draw", hint:"Everything running. Put nameplate ratings next to what you read.", items:[
      {h3:"Compressor 1"},
      {cols:3, fields:[ F("c1a","L1"), F("c1b","L2"), F("c1c","L3") ]},
      F("c1rla","Nameplate RLA"),
      {flag:"c1"},
      {toggle:"comp2", label:"Add compressor 2", items:[
        {h3:"Compressor 2"},
        {cols:3, fields:[ F("c2a","L1"), F("c2b","L2"), F("c2c","L3") ]},
        F("c2rla","Nameplate RLA"),
        {flag:"c2"}
      ]},
      {h3:"Fans and motors"},
      {cols:2, fields:[ F("cf1","Condenser fan 1",{unit:"A"}), F("cf2","Condenser fan 2",{unit:"A"}) ]},
      {cols:2, fields:[ F("blow","Blower",{unit:"A"}), F("blowfla","Blower FLA") ]},
      {flag:"blower"},
      {h3:"Capacitor and contactor"},
      {cols:2, fields:[ F("capread","Measured",{unit:"µF"}), F("caprate","Rated",{unit:"µF"}) ]},
      {flag:"cap"},
      S("contactor","Contactor",["Good","Pitted","Welded","Chattering","Not pulling in"])
    ]},
    { id:"ref", title:"Refrigerant", hint:"Gauges on, unit running at least 10 minutes.", items:[
      S("ref","Type",["R-410A","R-22","R-454B","R-32","R-407C","Other"]),
      {cols:2, fields:[ F("suct","Suction",{unit:"psig"}), F("head","Head",{unit:"psig"}) ]},
      {cols:2, fields:[ F("slt","Suction line",{unit:"°F"}), F("llt","Liquid line",{unit:"°F"}) ]},
      {cols:2, fields:[ F("sh","Superheat",{unit:"°F"}), F("sc","Subcool",{unit:"°F"}) ]},
      S("meter","Metering device",["TXV","Fixed orifice","EEV","Unknown"]),
      {flag:"sh"}
    ]},
    { id:"air", title:"Air side", hint:"Return and supply as close to the unit as you can get.", items:[
      {cols:2, fields:[ F("rat","Return",{unit:"°F"}), F("sat","Supply",{unit:"°F"}) ]},
      {flag:"split"},
      {cols:2, fields:[
        F("oat","Outdoor",{unit:"°F"}),
        S("filter","Filters",["Clean","Dirty","Missing"])
      ]},
      S("coil","Coils",["Both clean","Condenser dirty","Evaporator dirty","Evaporator iced"])
    ]},
    { id:"heat", title:"Heat side", hint:"Only if this is a heat call.", items:[
      {toggle:"heat", check:"This is a heat call", items:[
        S("heattype","Heat type",["Gas","Electric strip","Heat pump"]),
        S("lights","Ignition",["Lights and stays on","Lights then drops out","No ignition","No call at all"]),
        {cols:2, fields:[ F("manifold","Manifold",{unit:"in. w.c."}), F("flame","Flame sense",{unit:"µA"}) ]},
        S("safeties","Safety tripped",["None","Rollout","High limit","Pressure switch"])
      ]}
    ]},
    { id:"call", title:"The call", hint:"What the person on the phone needs to hear.", items:[
      A("problem","What's wrong and what the unit is doing",{req:true}),
      T("fault","Fault or flash code at the board",{ph:"None if there isn't one"}),
      A("tried","What you've already checked or tried",{req:true}),
      A("guess","Best guess at the failure"),
      S("need","What you need",["Diagnostic help","Parts pricing or sourcing","Authorization to proceed","Second tech on site","Repair vs. replace call"],{req:true}),
      {cols:2, fields:[ T("wo","Work order #",{req:true}), T("tech","Your name",{req:true}) ]}
    ]}
  ];

  // Every field, keyed by id, with the step it lives on.
  var FIELDS = {}, REQUIRED = [];
  STEPS.forEach(function(step, si){
    (function walk(items){
      items.forEach(function(it){
        if (it.fields) walk(it.fields);
        else if (it.items) walk(it.items);
        else if (it.type){ it.step = si; FIELDS[it.id] = it; if (it.req) REQUIRED.push(it.id); }
      });
    })(step.items);
  });

  /* ---------- Storage ---------- */

  var KEY = "precall.v1";
  var db = load();
  function load(){
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.calls)) { d.settings = d.settings || {}; return d; }
    } catch(e){}
    return { calls:[], settings:{} };
  }
  var saveTimer = null;
  function saveNow(){
    clearTimeout(saveTimer); saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch(e){ toast("Couldn't save on this device"); }
  }
  function save(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
  window.addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", function(){ if (document.hidden) saveNow(); });

  function getCall(id){ for (var i=0;i<db.calls.length;i++) if (db.calls[i].id === id) return db.calls[i]; return null; }
  function newCall(){
    var c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
      created: Date.now(), updated: Date.now(), sent: null, seen: 0,
      v: { tech: db.settings.tech || "" }, comp2: false, heat: false };
    db.calls.push(c); saveNow();
    return c;
  }

  /* ---------- Helpers ---------- */

  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(ch){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]; }); }
  function avg(a){ return a.reduce(function(s,x){ return s+x; },0) / a.length; }
  function when(t){
    var d = new Date(t), now = new Date();
    var time = d.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
    if (d.toDateString() === now.toDateString()) return time;
    return d.toLocaleDateString([], {month:"short", day:"numeric"}) + ", " + time;
  }
  function callTitle(c){ return c.v.wo ? "WO " + c.v.wo : "New pre-call"; }
  function unitKey(c){ return (c.v.serial || "").trim().toUpperCase() || ((c.v.model || "").trim() ? "M:" + c.v.model.trim().toUpperCase() : ""); }

  var ICON = {
    back:'<path d="M15 6l-6 6 6 6"/>',
    next:'<path d="M9 6l6 6-6 6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    check:'<path d="M5 12l5 5L19 7"/>',
    warn:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    share:'<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
    text:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
    calls:'<path d="M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01"/>',
    units:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>',
    me:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
  };
  function icon(name, extra){ return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"' + (extra || "") + '>' + ICON[name] + '</svg>'; }

  var toastTimer;
  function toast(msg){
    var t = el("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.hidden = true; }, 2600);
  }

  /* ---------- Checks (same rules as the paper checklist) ---------- */

  function num(c, id){ var x = parseFloat(c.v[id]); return isNaN(x) ? null : x; }
  function legs(c, ids){ return ids.map(function(id){ return num(c,id); }).filter(function(x){ return x !== null; }); }

  var FLAGS = {
    volt: function(c){
      var r = legs(c,["l12","l23","l13"]), np = num(c,"nameplate"), m = [];
      if (!r.length) return null;
      if (r.length > 1){
        var imb = (Math.max.apply(null,r) - Math.min.apply(null,r)) / avg(r) * 100;
        if (imb > 2) m.push("Phase imbalance " + imb.toFixed(1) + "%, over 2% is a problem");
      }
      if (np){
        var off = (avg(r) - np) / np * 100;
        if (Math.abs(off) > 10) m.push("Supply " + off.toFixed(0) + "% off nameplate");
      }
      return m.length ? { t:m.join(" · "), bad:true } : null;
    },
    c1: function(c){ return ampFlag(c, "c1", "Compressor 1"); },
    c2: function(c){ return c.comp2 ? ampFlag(c, "c2", "Compressor 2") : null; },
    blower: function(c){
      var a = num(c,"blow"), f = num(c,"blowfla");
      if (a === null || f === null || f === 0) return null;
      return a > f ? { t:"Blower at " + (a/f*100).toFixed(0) + "% of FLA", bad:true } : null;
    },
    cap: function(c){
      var m = num(c,"capread"), r = num(c,"caprate");
      if (m === null || r === null || r === 0) return null;
      var off = (m - r) / r * 100;
      if (Math.abs(off) > 6) return { t:"Capacitor " + Math.abs(off).toFixed(0) + "% " + (off < 0 ? "under" : "over") + " rating, out of tolerance", bad:true };
      return { t:"Capacitor within tolerance", ok:true };
    },
    sh: function(c){
      var sh = num(c,"sh"), m = c.v.meter;
      if (sh === null || !m || m === "Unknown") return null;
      if (m === "TXV" || m === "EEV"){
        if (sh < 5) return { t:"Low superheat on a " + m + ", flooding risk", bad:true };
        if (sh > 15) return { t:"High superheat on a " + m + ", starving or low charge", bad:true };
        return { t:"Superheat in range for a " + m, ok:true };
      }
      if (sh < 5) return { t:"Very low superheat, flooding risk", bad:true };
      if (sh > 25) return { t:"High superheat, low charge or airflow", bad:true };
      return null;
    },
    split: function(c){
      var r = num(c,"rat"), s = num(c,"sat");
      if (r === null || s === null) return null;
      var d = r - s;
      if (d < 14) return { t:"Split " + d.toFixed(1) + "°F, low (normal is about 16–22)", bad:true };
      if (d > 24) return { t:"Split " + d.toFixed(1) + "°F, high, check airflow", bad:true };
      return { t:"Split " + d.toFixed(1) + "°F, in range", ok:true };
    }
  };
  function ampFlag(c, pre, name){
    var r = legs(c,[pre+"a",pre+"b",pre+"c"]), rla = num(c, pre+"rla"), m = [];
    if (!r.length) return null;
    if (r.length > 1){
      var imb = (Math.max.apply(null,r) - Math.min.apply(null,r)) / avg(r) * 100;
      if (imb > 10) m.push("Leg imbalance " + imb.toFixed(0) + "%");
    }
    if (rla){
      var mx = Math.max.apply(null,r);
      if (mx > rla) m.push("Drawing " + (mx/rla*100).toFixed(0) + "% of RLA");
      else if (mx < rla * 0.4) m.push("Well under RLA, check loading or valves");
    }
    return m.length ? { t:m.join(" · "), bad:true, who:name } : null;
  }
  function badFlags(c){
    var out = [];
    Object.keys(FLAGS).forEach(function(k){
      var f = FLAGS[k](c);
      if (f && f.bad) out.push((f.who ? f.who + ": " : (k === "volt" ? "Voltage: " : "")) + f.t);
    });
    return out;
  }
  function missing(c){ return REQUIRED.filter(function(id){ return !String(c.v[id] || "").trim(); }); }

  /* ---------- Text summary ---------- */

  function sections(c){
    var v = function(id){ return String(c.v[id] || "").trim(); };
    function L(label, val){ return val ? label + ": " + val : ""; }
    function legTxt(pre){ var r = [v(pre+"a"), v(pre+"b"), v(pre+"c")].filter(Boolean); return r.length ? r.join(" / ") + " A" : ""; }
    function flagLine(k, indent){ var f = FLAGS[k](c); return f ? (indent || "") + (f.bad ? "! " : "") + f.t : ""; }
    var vl = [v("l12"), v("l23"), v("l13")].filter(Boolean);
    var s = [
      { step:0, name:"UNIT", lines:[ L("Model", v("model")), L("Serial", v("serial")), L("Type", v("eqtype")), L("Tons", v("tons")) ] },
      { step:1, name:"VOLTAGE AT DISCONNECT", lines:[ L("Line", vl.length ? vl.join(" / ") + " V" : ""), L("Nameplate", v("nameplate")), L("Control", v("lowv")), flagLine("volt") ] },
      { step:2, name:"AMPS", lines:[
        L("Compressor 1", legTxt("c1")), L("  RLA", v("c1rla")), flagLine("c1","  "),
        c.comp2 ? L("Compressor 2", legTxt("c2")) : "", c.comp2 ? L("  RLA", v("c2rla")) : "", c.comp2 ? flagLine("c2","  ") : "",
        L("Condenser fan 1", v("cf1") ? v("cf1") + " A" : ""),
        L("Condenser fan 2", v("cf2") ? v("cf2") + " A" : ""),
        L("Blower", v("blow") ? v("blow") + " A" + (v("blowfla") ? " (FLA " + v("blowfla") + ")" : "") : ""), flagLine("blower","  "),
        L("Capacitor", v("capread") ? v("capread") + " µF measured" + (v("caprate") ? ", " + v("caprate") + " rated" : "") : ""), flagLine("cap","  "),
        L("Contactor", v("contactor"))
      ]},
      { step:3, name:"REFRIGERANT", lines:[
        L("Type", v("ref")),
        L("Suction / head", (v("suct") || v("head")) ? (v("suct") || "–") + " / " + (v("head") || "–") + " psig" : ""),
        L("Line temps", (v("slt") || v("llt")) ? "suction " + (v("slt") || "–") + "°F, liquid " + (v("llt") || "–") + "°F" : ""),
        L("Superheat", v("sh")), L("Subcool", v("sc")), L("Metering", v("meter")), flagLine("sh")
      ]},
      { step:4, name:"AIR SIDE", lines:[
        L("Return / supply", (v("rat") || v("sat")) ? (v("rat") || "–") + "°F / " + (v("sat") || "–") + "°F" : ""), flagLine("split","  "),
        L("Outdoor", v("oat") ? v("oat") + "°F" : ""), L("Filters", v("filter")), L("Coils", v("coil"))
      ]},
      { step:5, name:"HEAT", lines: c.heat ? [ L("Type", v("heattype")), L("Ignition", v("lights")), L("Manifold", v("manifold")), L("Flame sense", v("flame")), L("Safeties", v("safeties")) ] : [] },
      { step:6, name:"THE CALL", lines:[ L("Problem", v("problem")), L("Fault code", v("fault")), L("Already checked", v("tried")), L("Best guess", v("guess")), L("Needs", v("need")) ] }
    ];
    s.forEach(function(x){ x.lines = x.lines.filter(Boolean); });
    return s;
  }

  function buildText(c){
    var v = function(id){ return String(c.v[id] || "").trim(); };
    var t = "PRE-CALL CHECKLIST\n";
    t += "WO " + v("wo") + " — " + v("tech") + "\n" + new Date().toLocaleString() + "\n";
    var flags = badFlags(c);
    if (flags.length) t += "\nFLAGS\n" + flags.map(function(f){ return "! " + f; }).join("\n") + "\n";
    sections(c).forEach(function(s){
      if (s.step === 6) return;
      if (!s.lines.length) return;
      t += "\n" + s.name + "\n" + s.lines.join("\n") + "\n";
    });
    t += "\nPROBLEM\n" + v("problem") + "\n";
    if (v("fault")) t += "Fault code: " + v("fault") + "\n";
    t += "\nALREADY CHECKED\n" + v("tried") + "\n";
    if (v("guess")) t += "\nBEST GUESS\n" + v("guess") + "\n";
    if (aiFresh(c)) t += "\nAI SUGGESTIONS (unverified)\n" + c.ai.result.likely_causes.map(function(x){ return "- " + x.cause + " (" + x.confidence + ")"; }).join("\n") + "\n";
    t += "\nNEEDS: " + v("need") + "\n";
    return t;
  }

  /* ---------- Views ---------- */

  var app = el("app");
  var current = null; // call open in a step view

  function tabs(which){
    function tab(href, key, label, ic){
      return '<a href="' + href + '"' + (which === key ? ' aria-current="page"' : '') + '>' + icon(ic) + label + '</a>';
    }
    return '<nav class="tabs" aria-label="Main"><div class="inner">' +
      tab("#/", "calls", "Calls", "calls") + tab("#/units", "units", "Units", "units") + tab("#/profile", "me", "Profile", "me") +
      '</div></nav>';
  }

  function callCard(c){
    var m = missing(c).length;
    var step = STEPS[Math.min(c.seen || 0, STEPS.length - 1)].title;
    var sub = [c.v.eqtype || c.v.model || "No unit yet", m ? step : "Ready to review"].join(" · ");
    var chip = m ? '<span class="chip">' + m + ' left</span>' : '<span class="chip ok">Ready</span>';
    var href = m ? "#/call/" + c.id + "/" + (c.seen || 0) : "#/call/" + c.id + "/review";
    return '<a class="card" href="' + href + '"><div class="grow"><div class="big">' + esc(callTitle(c)) + '</div><div class="sub">' + esc(sub) + '</div></div>' + chip + icon("next",' style="color:var(--muted)"') + '</a>';
  }

  function viewHome(){
    var open = db.calls.filter(function(c){ return !c.sent; }).sort(function(a,b){ return b.updated - a.updated; });
    var sent = db.calls.filter(function(c){ return c.sent; }).sort(function(a,b){ return b.sent - a.sent; });
    var h = '<header class="hero"><div><div class="eyebrow">Pre-Call</div><h1>Before you call</h1><p>Work it at the unit. Copy it out when it\'s ready.</p></div>' +
      '<button class="primary" id="startNew" type="button">' + icon("plus") + 'Start a new pre-call</button></header>';
    h += '<div class="content"><h2>In progress</h2>';
    h += open.length ? open.map(callCard).join("") : '<div class="empty">Nothing in progress. Start one at the unit.</div>';
    if (sent.length){
      h += '<h2>Sent</h2><div class="list">' + sent.slice(0, 30).map(function(c){
        return '<a href="#/call/' + c.id + '/review">' + icon("check",' style="color:var(--good)"') +
          '<div class="grow"><b>' + esc(callTitle(c)) + '</b><div class="sub">' + esc(c.v.eqtype || c.v.model || "") + '</div></div>' +
          '<span class="sub">' + esc(sentLabel(c)) + '</span></a>';
      }).join("") + '</div>';
    }
    h += '</div>' + tabs("calls");
    app.className = "wrap"; app.innerHTML = h;
    el("startNew").addEventListener("click", function(){ var c = newCall(); location.hash = "#/call/" + c.id + "/0"; });
  }

  function fieldHTML(f, c){
    var val = c.v[f.id] == null ? "" : c.v[f.id];
    var lab = '<label for="f-' + f.id + '">' + esc(f.label) + (f.unit ? ' <span class="unit">' + esc(f.unit) + '</span>' : '') + '</label>';
    var ctl, common = ' id="f-' + f.id + '" data-f="' + f.id + '"';
    if (f.type === "select"){
      ctl = '<select' + common + '><option value="">Choose</option>' + f.options.map(function(o){
        return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join("") + '</select>';
    } else if (f.type === "area"){
      ctl = '<textarea' + common + '>' + esc(val) + '</textarea>';
    } else {
      ctl = '<input' + common + ' value="' + esc(val) + '" autocomplete="off"' +
        (f.type === "num" ? ' inputmode="decimal"' : '') +
        (f.caps ? ' autocapitalize="characters" spellcheck="false"' : '') +
        (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '') + '>';
    }
    var cls = "f" + (f.req ? " req" : "") + (f.req && String(val).trim() ? " filled" : "");
    return '<div class="' + cls + '">' + lab + ctl + '</div>';
  }

  function itemsHTML(items, c){
    return items.map(function(it){
      if (it.type) return fieldHTML(it, c);
      if (it.fields) return '<div class="cols' + it.cols + '">' + itemsHTML(it.fields, c) + '</div>';
      if (it.h3) return '<h3>' + esc(it.h3) + '</h3>';
      if (it.flag) return '<div class="flag" id="flag-' + it.flag + '" hidden></div>';
      if (it.note) return '<div class="note" id="note-history" hidden></div>';
      if (it.toggle){
        var on = !!c[it.toggle];
        var ctl = it.check
          ? '<div class="skip"><input type="checkbox" id="t-' + it.toggle + '" data-toggle="' + it.toggle + '"' + (on ? ' checked' : '') + '><label for="t-' + it.toggle + '">' + esc(it.check) + '</label></div>'
          : '<button type="button" class="more" data-toggle="' + it.toggle + '"' + (on ? ' hidden' : '') + '>' + esc(it.label) + '</button>';
        return ctl + '<div id="box-' + it.toggle + '"' + (on ? '' : ' hidden') + '>' + itemsHTML(it.items, c) +
          (it.check ? '' : '<button type="button" class="link" data-untoggle="' + it.toggle + '" style="margin:-6px 0 12px">Remove ' + esc(it.label.replace(/^Add /,"")) + '</button>') + '</div>';
      }
      return "";
    }).join("");
  }

  function topbar(c, meta, backHref, activeStep){
    var segs = STEPS.map(function(s, i){
      var cls = i === activeStep ? "now" : (i <= (c.seen || 0) ? "done" : "");
      return '<a href="#/call/' + c.id + '/' + i + '" class="' + cls + '" aria-label="Step ' + (i+1) + ', ' + esc(s.title) + '"' + (i === activeStep ? ' aria-current="step"' : '') + '><span></span></a>';
    }).join("");
    return '<header class="topbar"><div class="row"><a class="iconbtn" href="' + backHref + '" aria-label="Back">' + icon("back") + '</a>' +
      '<div class="title" id="callTitle">' + esc(callTitle(c)) + '</div><div class="meta">' + esc(meta) + '</div></div>' +
      '<nav class="progress" aria-label="Steps">' + segs + '</nav></header>';
  }

  function viewStep(c, i){
    current = c;
    if (i > (c.seen || 0)) { c.seen = i; save(); }
    var step = STEPS[i];
    var back = i === 0 ? "#/" : "#/call/" + c.id + "/" + (i - 1);
    var next = i === STEPS.length - 1 ? "#/call/" + c.id + "/review" : "#/call/" + c.id + "/" + (i + 1);
    var h = topbar(c, "Step " + (i+1) + " of " + STEPS.length, back, i);
    h += '<form class="step" autocomplete="off" onsubmit="return false"><h1>' + esc(step.title) + '</h1><p class="hint">' + esc(step.hint) + '</p>' +
      itemsHTML(step.items, c) + '</form>';
    h += '<div class="bar"><div class="inner"><div class="status" id="status"><b id="statusLine"></b><span id="statusSub"></span></div>' +
      '<a class="primary" href="' + next + '">' + (i === STEPS.length - 1 ? "Review" : "Next") + icon("next") + '</a></div></div>';
    app.className = "wrap form"; app.innerHTML = h;
    live(c, i);
  }

  // Refresh everything that depends on values without rebuilding the form (keeps focus and the keyboard up).
  function live(c, i){
    Object.keys(FLAGS).forEach(function(k){
      var box = el("flag-" + k); if (!box) return;
      var f = FLAGS[k](c);
      if (!f){ box.hidden = true; box.innerHTML = ""; return; }
      box.hidden = false;
      box.className = "flag" + (f.bad ? " bad" : f.ok ? " okay" : "");
      box.innerHTML = icon(f.bad ? "warn" : f.ok ? "check" : "info") + '<span>' + esc(f.t) + '</span>';
    });
    app.querySelectorAll(".f.req").forEach(function(d){
      var inp = d.querySelector("[data-f]");
      d.classList.toggle("filled", !!(inp && inp.value.trim()));
    });
    var hist = el("note-history");
    if (hist){
      var k = unitKey(c);
      var n = k ? db.calls.filter(function(o){ return o !== c && unitKey(o) === k; }).length : 0;
      hist.hidden = !n;
      if (n) hist.innerHTML = icon("clock") + '<div class="grow">This unit has ' + n + ' earlier call' + (n === 1 ? '' : 's') + ' on file</div><a class="link" href="#/units/' + encodeURIComponent(k) + '">View</a>';
    }
    var t = el("callTitle"); if (t) t.textContent = callTitle(c);
    var miss = missing(c), here = miss.filter(function(id){ return FIELDS[id].step === i; }).length;
    var s = el("status");
    if (s){
      s.className = "status" + (miss.length ? "" : " go");
      el("statusLine").textContent = miss.length ? miss.length + (miss.length === 1 ? " field left" : " fields left") : "Ready";
      el("statusSub").textContent = miss.length ? (here ? here + " on this step" : "Nothing required here") : "Review it and copy it out";
    }
  }


  /* ---------- AI check (Claude) ---------- */

  // The official Anthropic SDK, bundled into vendor/ so it loads without a CDN.
  var sdkPromise = null;
  function loadSDK(){
    if (!sdkPromise) sdkPromise = import("./vendor/anthropic-sdk.js").then(function(m){ return m.default; }, function(e){ sdkPromise = null; throw e; });
    return sdkPromise;
  }

  var AI_MODEL = "claude-opus-5";
  var AI_SYSTEM = [
    "You help HVAC field technicians diagnose commercial and residential equipment from readings they took at the unit.",
    "You will get the readings from a pre-call checklist: unit details, line voltage, amp draw, capacitor and contactor, refrigerant pressures and line temperatures, superheat and subcool, air-side temperatures, heat-side checks, the symptom, and what the tech already tried. Automatic flags from simple rule checks are included too.",
    "Work only from the readings given. Where it helps, derive values yourself (for example saturation temperatures from the pressures for the listed refrigerant, then superheat or subcool, or the temperature split) and say you derived them. Never invent a reading that was not taken. If the readings don't support a conclusion, say so and name the reading that would settle it.",
    "Rank the likely causes, most likely first, each with a confidence and the specific readings that point to it. Next checks should be concrete things the tech can do at the unit now, in order, with what a good or bad result looks like.",
    "Include a safety note only when the readings or the fix involve a real hazard (for example a welded contactor, rollout or high-limit trips, gas pressure, high amp draw, refrigerant recovery). Keep every field short and plain; the tech is reading this on a phone at the unit."
  ].join("\n\n");
  var AI_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["summary", "likely_causes", "next_checks", "safety_notes", "missing_readings"],
    properties: {
      summary: { type: "string", description: "One or two sentences on what the readings say overall." },
      likely_causes: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["cause", "confidence", "evidence"],
        properties: {
          cause: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence: { type: "string", description: "The readings that point to this cause." }
        }
      }},
      next_checks: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["check", "expect"],
        properties: {
          check: { type: "string" },
          expect: { type: "string", description: "What a good vs. bad result looks like." }
        }
      }},
      safety_notes: { type: "array", items: { type: "string" } },
      missing_readings: { type: "array", items: { type: "string" }, description: "Readings that were not taken and would most help." }
    }
  };

  // Readings only: the work order number and tech's name are left out.
  function aiInput(c){
    var t = "Readings from the pre-call checklist:\n";
    var flags = badFlags(c);
    sections(c).forEach(function(s){
      t += "\n" + s.name + "\n" + (s.lines.length ? s.lines.join("\n") : (s.step === 5 ? "Not a heat call" : "Not taken")) + "\n";
    });
    t += "\nAUTOMATIC FLAGS\n" + (flags.length ? flags.join("\n") : "None");
    return t;
  }
  function hasReadings(c){ return Object.keys(c.v).some(function(k){ return k !== "tech" && k !== "wo" && String(c.v[k] || "").trim(); }); }
  function aiFresh(c){ return !!(c.ai && c.ai.result && c.ai.readings === aiInput(c)); }

  var aiRunning = {};
  function runAI(c){
    var key = db.settings.apiKey;
    if (!key || aiRunning[c.id]) return;
    aiRunning[c.id] = true; c.aiError = null; rerenderReview(c);
    var input = aiInput(c);
    loadSDK().then(function(Anthropic){
      var client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
      return client.beta.messages.create({
        model: AI_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: AI_SYSTEM,
        messages: [{ role: "user", content: input }],
        output_config: { format: { type: "json_schema", schema: AI_SCHEMA } }
      }).then(function(res){
        if (res.stop_reason === "refusal") throw new Error("Claude declined to answer this one.");
        if (res.stop_reason === "max_tokens") throw new Error("The answer was cut off. Try again.");
        var text = res.content.filter(function(b){ return b.type === "text"; }).map(function(b){ return b.text; }).join("");
        var result = JSON.parse(text);
        c.ai = { at: Date.now(), model: res.model, readings: input, result: result };
        saveNow();
      }, function(e){
        if (e instanceof Anthropic.AuthenticationError) throw new Error("Your API key wasn't accepted. Check it in Profile.");
        if (e instanceof Anthropic.PermissionDeniedError) throw new Error("This API key isn't allowed to use Claude. Check it in Profile.");
        if (e instanceof Anthropic.RateLimitError) throw new Error("Too many requests right now. Wait a minute and try again.");
        if (e instanceof Anthropic.APIConnectionError) throw new Error("Couldn't reach Claude. Check your signal and try again.");
        if (e instanceof Anthropic.APIError) throw new Error("Claude returned an error" + (e.status ? " (" + e.status + ")" : "") + ". Try again.");
        throw e;
      });
    }).catch(function(e){
      c.aiError = e && e.message && !/JSON/.test(e.message) ? e.message : "Something went wrong. Try again.";
      if (!navigator.onLine) c.aiError = "No connection. The AI check needs signal.";
    }).then(function(){
      delete aiRunning[c.id];
      rerenderReview(c);
    });
  }
  function rerenderReview(c){ if (location.hash === "#/call/" + c.id + "/review") { var y = window.scrollY; viewReview(c); window.scrollTo(0, y); } }

  function aiPanel(c){
    var h = '<section class="panel ai" aria-live="polite"><div class="ai-head">' + icon("spark") + '<h2 class="cond">AI check</h2></div>';
    if (!db.settings.apiKey){
      return h + '<div class="sub">Claude can read all your readings and suggest likely causes and what to check next. Add a Claude API key in Profile to turn it on.</div>' +
        '<a class="link" style="padding:0;align-self:flex-start" href="#/profile">Set it up</a></section>';
    }
    var busy = !!aiRunning[c.id], fresh = aiFresh(c);
    if (c.aiError && !busy) h += '<div class="flag bad" style="margin:0">' + icon("warn") + '<span>' + esc(c.aiError) + '</span></div>';
    if (c.ai && c.ai.result && !busy){
      var r = c.ai.result;
      if (!fresh) h += '<div class="flag" style="margin:0">' + icon("info") + '<span>Readings changed since this check. Run it again.</span></div>';
      h += '<p class="ai-sum">' + esc(r.summary) + '</p>';
      if (r.safety_notes && r.safety_notes.length) h += '<div class="ai-block safety"><h3>Safety</h3>' + r.safety_notes.map(function(x){ return '<div class="fl">' + icon("warn") + '<span>' + esc(x) + '</span></div>'; }).join("") + '</div>';
      if (r.likely_causes.length) h += '<div class="ai-block"><h3>Likely causes</h3><ol>' + r.likely_causes.map(function(x){
        return '<li><div class="ai-row"><b>' + esc(x.cause) + '</b><span class="chip conf-' + esc(x.confidence) + '">' + esc(x.confidence) + '</span></div><div class="sub">' + esc(x.evidence) + '</div></li>';
      }).join("") + '</ol></div>';
      if (r.next_checks.length) h += '<div class="ai-block"><h3>Check next</h3><ol>' + r.next_checks.map(function(x){
        return '<li><b>' + esc(x.check) + '</b><div class="sub">' + esc(x.expect) + '</div></li>';
      }).join("") + '</ol></div>';
      if (r.missing_readings && r.missing_readings.length) h += '<div class="ai-block"><h3>Readings that would help</h3><ul>' + r.missing_readings.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join("") + '</ul></div>';
      h += '<div class="sub ai-foot">Suggestions only, from Claude at ' + esc(when(c.ai.at)) + '. Verify before you act on them.' + (fresh ? ' Likely causes go out with your text.' : '') + '</div>';
    } else if (!busy){
      h += '<div class="sub">Sends the readings (not your name or the work order) to Claude and gets back likely causes and what to check next.</div>';
    }
    if (busy) h += '<div class="ai-busy"><span class="spin" aria-hidden="true"></span>Reading the numbers. This can take up to a minute.</div>';
    else h += '<button type="button" class="aibtn" id="runAI"' + (hasReadings(c) ? '' : ' disabled') + '>' + icon("spark") + (c.ai ? 'Run it again' : 'Run AI check') + '</button>' +
      (hasReadings(c) ? '' : '<div class="sub">Enter some readings first.</div>');
    return h + '</section>';
  }

  function viewReview(c){
    current = null;
    if ((c.seen || 0) < STEPS.length - 1) { c.seen = STEPS.length - 1; save(); }
    var miss = missing(c), flags = badFlags(c);
    var h = topbar(c, "Review", "#/call/" + c.id + "/" + (STEPS.length - 1), -1);
    h += '<div class="content">';
    if (miss.length){
      var firstStep = FIELDS[miss[0]].step;
      h += '<div class="banner wait"><div class="dot">' + icon("info") + '</div><div><div class="big">' + miss.length + (miss.length === 1 ? ' field left' : ' fields left') + '</div>' +
        '<div>' + esc(miss.map(function(id){ return FIELDS[id].label; }).join(", ")) + '</div>' +
        '<a class="link" style="padding:0" href="#/call/' + c.id + '/' + firstStep + '">Finish them</a></div></div>';
    } else {
      h += '<div class="banner"><div class="dot">' + icon("check") + '</div><div><div class="big">Ready to call</div><div>Every required field is filled' + (c.heat ? '.' : '. Heat side skipped.') + '</div></div></div>';
    }
    if (flags.length){
      h += '<section class="panel"><h2 class="cond">Lead with these</h2>' + flags.map(function(f){ return '<div class="fl">' + icon("warn") + '<span>' + esc(f) + '</span></div>'; }).join("") + '</section>';
    }
    h += aiPanel(c);
    h += '<div class="list sum">' + sections(c).map(function(s){
      var body = s.lines.length ? s.lines.map(function(l){ return l.trim(); }).join("\n") : (s.step === 5 ? "Not a heat call" : "Nothing entered");
      return '<div><div class="grow"><div class="k">' + esc(STEPS[s.step].title) + '</div><div class="v">' + esc(body) + '</div></div>' +
        '<a class="link" href="#/call/' + c.id + '/' + s.step + '" aria-label="Edit ' + esc(STEPS[s.step].title) + '">Edit</a></div>';
    }).join("") + '</div>';
    if (c.sent) h += '<p class="sub" style="text-align:center;color:var(--muted);margin:4px 0 0">' + esc(sentLabel(c)) + '</p>';
    h += '<button type="button" class="danger" id="del">Delete this pre-call</button></div>';
    var canShare = !!navigator.share, off = miss.length ? ' disabled' : '';
    var to = db.settings.smsTo || "";
    h += '<div class="bar"><div class="inner">' +
      (canShare ? '<button type="button" class="ghost" id="share" aria-label="Share"' + off + '>' + icon("share") + '</button>' : '') +
      '<button type="button" class="ghost" id="copy" aria-label="Copy"' + off + '>' + icon("copy") + '</button>' +
      (miss.length
        ? '<a class="primary grow" aria-disabled="true">' + icon("text") + 'Text it</a>'
        : '<a class="primary grow" id="sms" href="' + esc(smsHref(to, buildText(c))) + '">' + icon("text") + (to ? 'Text ' + esc(db.settings.smsName || "it") : 'Text it') + '</a>') +
      '</div></div>';
    app.className = "wrap"; app.innerHTML = h;

    if (el("sms")) el("sms").addEventListener("click", function(){ markSent(c, "Texted"); });
    if (el("runAI")) el("runAI").addEventListener("click", function(){ runAI(c); });
    el("copy").addEventListener("click", function(){
      copyText(buildText(c)).then(function(){ markSent(c, "Copied"); toast("Copied. Paste it into your text or email."); },
        function(){ toast("Couldn't copy. Try Share instead."); });
    });
    if (canShare) el("share").addEventListener("click", function(){
      navigator.share({ title: callTitle(c), text: buildText(c) }).then(function(){ markSent(c, "Shared"); }, function(){});
    });
    el("del").addEventListener("click", function(){
      if (!confirm("Delete " + callTitle(c) + "? This can't be undone.")) return;
      db.calls = db.calls.filter(function(o){ return o !== c; }); saveNow(); location.hash = "#/";
    });
  }
  function markSent(c, how){ c.sent = Date.now(); c.sentVia = how; saveNow(); }
  function sentLabel(c){ return (c.sentVia || "Copied") + " " + when(c.sent); }
  // "?&body=" is the form both iPhone and Android Messages accept.
  function smsHref(to, text){ return "sms:" + to.replace(/[^\d+]/g, "") + "?&body=" + encodeURIComponent(text); }
  function copyText(text){
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(function(){ return legacyCopy(text); });
    return legacyCopy(text);
  }
  function legacyCopy(text){
    return new Promise(function(res, rej){
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly",""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand("copy"); } catch(e){}
      document.body.removeChild(ta);
      ok ? res() : rej();
    });
  }

  function viewUnits(key){
    var groups = {};
    db.calls.forEach(function(c){ var k = unitKey(c); if (!k) return; (groups[k] = groups[k] || []).push(c); });
    var keys = Object.keys(groups).sort(function(a,b){
      return Math.max.apply(null, groups[b].map(function(c){ return c.updated; })) - Math.max.apply(null, groups[a].map(function(c){ return c.updated; }));
    });
    if (key) keys = keys.filter(function(k){ return k === key; });
    var h = '<header class="hero"><div><div class="eyebrow">Units</div><h1>' + (key ? "This unit" : "Units you've worked") + '</h1><p>Every pre-call, grouped by serial number.</p></div></header><div class="content">';
    if (!keys.length) h += '<div class="empty">Units show up here once you enter a model or serial.</div>';
    keys.forEach(function(k){
      var cs = groups[k].sort(function(a,b){ return b.updated - a.updated; }), c0 = cs[0];
      h += '<h2>' + esc(c0.v.model || "Unknown model") + '</h2><div class="list">' +
        '<div><div class="grow"><div class="sub">' + esc([c0.v.serial ? "Serial " + c0.v.serial : "", c0.v.eqtype, c0.v.tons ? c0.v.tons + " t" : ""].filter(Boolean).join(" · ")) + '</div></div><span class="chip ink">' + cs.length + (cs.length === 1 ? " call" : " calls") + '</span></div>' +
        cs.map(function(c){
          return '<a href="#/call/' + c.id + '/review"><div class="grow"><b>' + esc(callTitle(c)) + '</b><div class="sub">' + esc(when(c.created)) + (c.v.need ? " · " + esc(c.v.need) : "") + '</div></div>' + icon("next",' style="color:var(--muted)"') + '</a>';
        }).join("") + '</div>';
    });
    if (key) h += '<a class="link" href="#/units" style="align-self:center">All units</a>';
    h += '</div>' + tabs("units");
    app.className = "wrap"; app.innerHTML = h;
  }

  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); installEvt = e; if (location.hash === "#/profile") route(); });

  function viewProfile(){
    var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    var h = '<header class="hero"><div><div class="eyebrow">Profile</div><h1>You</h1><p>Saved on this phone only.</p></div></header><form class="content" onsubmit="return false">' +
      '<div class="f"><label for="me-tech">Your name</label><input id="me-tech" value="' + esc(db.settings.tech || "") + '" autocomplete="name"></div>' +
      '<p class="sub" style="margin:-8px 0 8px;color:var(--muted);font-size:15px">Filled in for you on every new pre-call.</p>' +
      '<h2>Who you text for help</h2>' +
      '<div class="cols2"><div class="f"><label for="me-smsname">Name</label><input id="me-smsname" value="' + esc(db.settings.smsName || "") + '" placeholder="Dispatch"></div>' +
      '<div class="f"><label for="me-smsto">Mobile number</label><input id="me-smsto" type="tel" inputmode="tel" autocomplete="off" value="' + esc(db.settings.smsTo || "") + '"></div></div>' +
      '<p class="sub" style="margin:-8px 0 8px;color:var(--muted);font-size:15px">Optional. Text it fills this in. Leave it blank to pick someone each time.</p>' +
      '<h2>AI check</h2>' +
      '<div class="f"><label for="me-key">Claude API key</label><input id="me-key" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="sk-ant-…" value="' + esc(db.settings.apiKey || "") + '"></div>' +
      '<p class="sub" style="margin:-8px 0 8px;color:var(--muted);font-size:15px">Get one at console.anthropic.com. Each check is billed to that account, usually a few cents. The key is saved on this phone only, so don\'t use a shared phone.</p>';
    if (!standalone){
      h += '<h2>Put it on your home screen</h2><div class="panel">';
      if (installEvt) h += '<button type="button" class="primary" id="install">Install Pre-Call</button>';
      else h += '<div>On iPhone: tap <b>Share</b>, then <b>Add to Home Screen</b>.<br>On Android: open the browser menu and tap <b>Install app</b>.</div>';
      h += '<div class="sub" style="color:var(--muted);font-size:15px">Once it\'s installed it opens like an app and works with no signal.</div></div>';
    }
    h += '<h2>Your data</h2><div class="panel"><div>' + db.calls.length + ' pre-call' + (db.calls.length === 1 ? '' : 's') + ' saved on this device.</div>' +
      '<button type="button" class="danger" id="wipe" style="align-self:flex-start;padding:0">Delete all saved pre-calls</button></div>';
    h += '</form>' + tabs("me");
    app.className = "wrap"; app.innerHTML = h;
    el("me-tech").addEventListener("input", function(){ db.settings.tech = this.value.trim(); save(); });
    el("me-smsname").addEventListener("input", function(){ db.settings.smsName = this.value.trim(); save(); });
    el("me-smsto").addEventListener("input", function(){ db.settings.smsTo = this.value.trim(); save(); });
    el("me-key").addEventListener("input", function(){ db.settings.apiKey = this.value.trim(); save(); });
    if (el("install")) el("install").addEventListener("click", function(){ installEvt.prompt(); installEvt = null; });
    el("wipe").addEventListener("click", function(){
      if (!db.calls.length) return;
      if (!confirm("Delete all " + db.calls.length + " saved pre-calls? This can't be undone.")) return;
      db.calls = []; saveNow(); route(); toast("Deleted");
    });
  }

  /* ---------- Form events ---------- */

  function onEdit(e){
    var t = e.target, c = current;
    if (!c || !t.dataset) return;
    if (t.dataset.f){
      c.v[t.dataset.f] = t.value; c.updated = Date.now(); save();
      live(c, stepIndex());
    } else if (t.dataset.toggle && t.type === "checkbox"){
      c[t.dataset.toggle] = t.checked; el("box-" + t.dataset.toggle).hidden = !t.checked;
      c.updated = Date.now(); save(); live(c, stepIndex());
    }
  }
  app.addEventListener("input", onEdit);
  app.addEventListener("change", onEdit);
  app.addEventListener("click", function(e){
    var c = current; if (!c) return;
    var b = e.target.closest("button[data-toggle], button[data-untoggle]"); if (!b) return;
    var k = b.dataset.toggle || b.dataset.untoggle, on = !!b.dataset.toggle;
    c[k] = on; c.updated = Date.now(); save();
    el("box-" + k).hidden = !on;
    var opener = app.querySelector('button[data-toggle="' + k + '"]'); if (opener) opener.hidden = on;
    live(c, stepIndex());
    if (on){ var first = el("box-" + k).querySelector("[data-f]"); if (first) first.focus(); }
    else if (opener) opener.focus();
  });
  // Enter on a one-line field moves to the next field instead of submitting.
  app.addEventListener("keydown", function(e){
    if (e.key !== "Enter" || e.target.tagName !== "INPUT" || !current) return;
    e.preventDefault();
    var all = Array.prototype.filter.call(app.querySelectorAll("[data-f]"), function(x){ return x.offsetParent !== null; });
    var n = all[all.indexOf(e.target) + 1];
    if (n) n.focus(); else e.target.blur();
  });

  /* ---------- Routing ---------- */

  function stepIndex(){ var m = location.hash.match(/^#\/call\/[^/]+\/(\d+)$/); return m ? +m[1] : -1; }
  function route(){
    saveNow();
    var h = location.hash || "#/", m;
    if ((m = h.match(/^#\/call\/([^/]+)\/(\d+|review)$/))){
      var c = getCall(m[1]);
      if (!c) { location.replace("#/"); return; }
      if (m[2] === "review") viewReview(c);
      else viewStep(c, Math.max(0, Math.min(STEPS.length - 1, +m[2])));
    } else if ((m = h.match(/^#\/units(?:\/(.+))?$/))){ current = null; viewUnits(m[1] ? decodeURIComponent(m[1]) : null); }
    else if (h === "#/profile"){ current = null; viewProfile(); }
    else { current = null; viewHome(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();

  if ("serviceWorker" in navigator && location.protocol !== "file:"){
    window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
  }
})();
