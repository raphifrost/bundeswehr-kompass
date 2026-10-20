/* Bundeswehr Kompass – Akademie Plus.
   Eigenständige Browser-Erweiterung; kein Konto, keine serverseitige Rangliste.
   Lokale Speicherung auf diesem Gerät. */
(function () {
  "use strict";
  const BONUS_KEY = "bw_ac_bonus_v1";
  const DAILY_KEY = "bw_ac_daily_v1";
  const BOARD_KEY = "bw_ac_board_v1";
  const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function dateKey() { const d = new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); }
  function getBonus() {
    const v = read(BONUS_KEY,{total:0,grants:{}});
    if(!v.grants || typeof v.grants!=="object")v.grants={};
    v.total = Number(v.total)||0;
    return v;
  }
  window.acBonusTotal = function () { return getBonus().total; };
  function board() {
    const b=read(BOARD_KEY,{name:"Mein Profil",players:{}});
    if(!b.players || typeof b.players!=="object")b.players={};
    if(!b.name || typeof b.name!=="string")b.name="Mein Profil";
    return b;
  }
  function creditBoard(points,reason) {
    const b=board(),name=b.name;
    if(!b.players[name])b.players[name]={xp:0,activities:0,updated:""};
    if(points>0) {
      b.players[name].xp += points;
      b.players[name].activities++;
      b.players[name].updated=dateKey();
      b.players[name].last=String(reason||"Aktivität").slice(0,60);
    }
    save(BOARD_KEY,b);
  }
  function seedBoard() {
    if(localStorage.getItem("bw_ac_board_seeded_v1")==="1")return;
    const b=board(),score=typeof earnedXP==="function"?earnedXP():0;
    if(!b.players[b.name])b.players[b.name]={xp:score,activities:0,updated:dateKey(),last:"Bisherige Erfolge"};
    save(BOARD_KEY,b);
    localStorage.setItem("bw_ac_board_seeded_v1","1");
  }
  window.acCreditBoard = creditBoard;
  window.acGrantBonus = function (key,points,reason) {
    const v=getBonus();
    if(Object.prototype.hasOwnProperty.call(v.grants,key))return 0;
    const n=Math.max(0,Math.min(300,Math.floor(Number(points)||0)));
    if(!n)return 0;
    v.grants[key]=n;
    v.total+=n;
    save(BONUS_KEY,v);
    creditBoard(n,reason);
    return n;
  };
  function day() {
    const now=dateKey(),d=read(DAILY_KEY,{});
    if(d.date!==now)return {date:now,lessons:{},answers:{},quizzes:{},claimed:{}};
    d.lessons=d.lessons||{};d.answers=d.answers||{};
    d.quizzes=d.quizzes||{};d.claimed=d.claimed||{};
    return d;
  }
  const tasks=[
    {id:"lesson",icon:"▣",name:"Ein Lernkapitel lesen",desc:"Markiere ein Kapitel als heute gelernt.",need:1,reward:40,number:d=>Object.keys(d.lessons).length,cta:"#lernen"},
    {id:"five",icon:"✦",name:"5 Quizfragen beantworten",desc:"Fünf unterschiedliche Fragen prüfen.",need:5,reward:35,number:d=>Object.keys(d.answers).length,cta:"#quiz"},
    {id:"ten",icon:"◈",name:"10 Quizfragen beantworten",desc:"Zehn unterschiedliche Fragen prüfen.",need:10,reward:65,number:d=>Object.keys(d.answers).length,cta:"#quiz"},
    {id:"quiz",icon:"✓",name:"Ein Themenquiz bestehen",desc:"Mindestens 75 % richtig.",need:1,reward:80,number:d=>Object.values(d.quizzes).filter(v=>v>=75).length,cta:"#quiz"},
    {id:"double",icon:"◆",name:"Zwei Themenquizze bestehen",desc:"Zwei unterschiedliche Kategorien schaffen.",need:2,reward:110,number:d=>Object.values(d.quizzes).filter(v=>v>=75).length,cta:"#quiz"},
    {id:"expert",icon:"★",name:"90 % richtig erreichen",desc:"Ein Themenquiz mit mindestens 90 % bestehen.",need:1,reward:130,number:d=>Object.values(d.quizzes).some(v=>v>=90)?1:0,cta:"#quiz"}
  ];
  function completedTaskIds(d) { return tasks.filter(t=>t.number(d)>=t.need).map(t=>t.id); }
  function evaluateDaily(d) {
    let gain=0;
    for(const t of tasks) {
      if(t.number(d)>=t.need && !d.claimed[t.id]) {
        const points=window.acGrantBonus("day:"+d.date+":"+t.id,t.reward,t.name);
        d.claimed[t.id]=true;gain+=points;
      }
    }
    if(completedTaskIds(d).length===tasks.length && !d.claimed.all) {
      const points=window.acGrantBonus("day:"+d.date+":all",125,"Tagesbonus");
      d.claimed.all=true;gain+=points;
    }
    save(DAILY_KEY,d);
    if(gain && typeof notify==="function")notify("Tagesmission geschafft: +"+gain+" XP!");
    return gain;
  }
  window.acRecordLesson = function(id) {
    const d=day();d.lessons[id]=true;evaluateDaily(d);
  };
  window.acRecordAnswer = function(topicId,questionIndex) {
    const d=day(),key=String(topicId)+":"+String(questionIndex);
    if(d.answers[key])return;
    d.answers[key]=true;evaluateDaily(d);
  };
  window.acRecordQuiz = function(topicId,correct,total) {
    const d=day(),percent=Math.round(100*correct/Math.max(1,total));
    d.quizzes[topicId]=Math.max(d.quizzes[topicId]||0,percent);
    let points=0;
    if(percent>=75) {
      points=window.acGrantBonus("quizday:"+d.date+":"+topicId,35+5*correct+(percent===100?30:0),"Quiz: "+topicId);
    }
    evaluateDaily(d);
    return points;
  };
  window.acReviewButton = function(id) {
    const d=day(),done=!!d.lessons[id];
    return '<section class="ac-review"><span class="ac-small">TAGESMISSION · KAPITEL</span><h3>Heute etwas gelernt?</h3><p>Hast du dieses Kapitel gelesen? Du kannst es einmal pro Tag als gelernt markieren, auch wenn du es früher abgeschlossen hast.</p><button class="btn btn-primary" data-ac-review="'+esc(id)+'" '+(done?'disabled':'')+'>'+(done?'✓ Heute gelernt':'Für heute als gelernt markieren +40 XP')+'</button></section>';
  };
  window.acDailyPage = function () {
    const d=day(),done=completedTaskIds(d),completed=done.length,percent=Math.round(100*completed/tasks.length);
    const weekday=DAY_NAMES[new Date().getDay()];
    return sectionHeader('TÄGLICHE <span style="color:var(--lime)">MISSIONEN</span>','Jeden Tag neue Lernaufgaben. Belohnungen werden automatisch vergeben und am nächsten Tag wieder freigeschaltet.')+
      '<div class="ac-hero"><div><span class="ac-small">'+weekday.toUpperCase()+' · '+dateKey()+' · DEIN HEUTIGER FORTSCHRITT</span><h2>'+completed+' <small>/ '+tasks.length+' MISSIONEN</small></h2><p>Jede Mission bringt einmal täglich XP. Keine Pflicht, keine Streak-Strafe.</p></div><div class="ac-ring" style="--ac-progress:'+percent+'%"><b>'+percent+'%</b></div></div>'+
      '<div class="ac-daily-bar"><span style="width:'+percent+'%"></span></div>'+
      '<div class="ac-grid">'+tasks.map(t=>{
        const n=Math.min(t.need,t.number(d)),finished=d.claimed[t.id];
        return '<article class="ac-mission '+(finished?'ac-done':'')+'"><div class="ac-mission-header"><span class="ac-symbol">'+t.icon+'</span><span class="ac-reward">'+(finished?'✓ ERHALTEN':'+'+t.reward+' XP')+'</span></div><h3>'+esc(t.name)+'</h3><p>'+esc(t.desc)+'</p><div class="ac-mini-track"><i style="width:'+(100*n/t.need)+'%"></i></div><div class="ac-mission-foot"><span>'+n+' / '+t.need+'</span><a href="'+t.cta+'">'+(finished?'Abgeschlossen ✓':'Jetzt starten →')+'</a></div></article>';
      }).join('')+'</div>'+
      '<div class="ac-bonus"><div><span class="ac-small">EXTRA-BELOHNUNG</span><h3>ALLE 6 MISSIONEN SCHAFFEN</h3><p>Schließe die sechs Aufgaben an einem Tag ab und sichere dir zusätzlich <strong>125 XP</strong>.</p></div><span>'+(d.claimed.all?'✓ BONUS ERHALTEN':'+125 XP')+'</span></div>'+
      '<div class="ac-explain">Deine Tagesaufgaben und XP werden nur auf diesem Gerät gespeichert. Es ist völlig okay, Tage auszulassen.</div>';
  };
  window.acDashboardWidget = function () {
    const d=day(),done=completedTaskIds(d).length,all=tasks.length;
    return '<section class="ac-dashboard"><div class="ac-dashboard-head"><div><span class="ac-small">AKADEMIE PLUS · TÄGLICH NEU</span><h2>DEIN HEUTIGER AUFTRAG</h2><p>'+done+' von '+all+' Tagesmissionen abgeschlossen · bis zu 585 XP aus Tagesmissionen</p></div><div class="ac-dashboard-buttons"><a class="btn btn-primary" href="#missionen">Tagesmissionen ↗</a><a class="btn btn-secondary" href="#rangliste">Rangliste ↗</a></div></div><div class="ac-daily-bar"><span style="width:'+(done/all*100)+'%"></span></div></section>';
  };
  window.acLeaderboardPage = function () {
    seedBoard();
    const b=board(),rows=Object.entries(b.players).map(([name,v])=>({name,score:Math.max(0,Number(v.xp)||0),activities:Math.max(0,Number(v.activities)||0),last:v.last||"Lernfortschritt"}))
      .sort((a,z)=>z.score-a.score||a.name.localeCompare(z.name,"de"));
    const rank=rows.findIndex(r=>r.name===b.name)+1;
    return sectionHeader('DEINE <span style="color:var(--lime)">RANGLISTE</span>','Ein kleines Lernturnier auf diesem Gerät: Namen und gesammelte Punkte bleiben privat im Browser.')+
    '<div class="ac-leader-hero"><div><span class="ac-small">LOKALE BESTENLISTE</span><h2>HALL OF KNOWLEDGE</h2><p>Platz '+rank+' · '+esc(b.name)+' · '+(rows.find(x=>x.name===b.name)?.score||0)+' Ranglisten-XP</p></div><div class="ac-trophy">🏆</div></div>'+
    '<div class="ac-profile"><div><label for="acPlayerName">DEIN ANZEIGENAME (NUR AUF DIESEM GERÄT)</label><p>Du kannst auch mit Freunden am selben Gerät spielen. Die Punkte werden unter dem gerade ausgewählten Namen gesammelt.</p></div><div class="ac-name-control"><input id="acPlayerName" maxlength="20" autocomplete="off" value="'+esc(b.name)+'" aria-label="Anzeigename"><button class="btn btn-primary" id="acSaveName">Namen speichern</button></div></div>'+
    '<div class="ac-board">'+(rows.length?rows.map((r,i)=>'<div class="ac-board-row '+(r.name===b.name?'ac-me':'')+'"><span class="ac-place">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1).padStart(2,"0"))+'</span><div class="ac-board-name"><strong>'+esc(r.name)+'</strong><small>'+r.activities+' neue Erfolge · '+esc(r.last)+'</small></div><b>'+r.score.toLocaleString("de-DE")+' XP</b></div>').join(''):'<p>Noch keine Ergebnisse – starte ein Quiz!</p>')+'</div>'+
    '<div class="ac-explain"><strong>Wichtig:</strong> Das ist eine <strong>lokale Rangliste</strong>, keine weltweite Online-Rangliste. Punkte und Namen sind ausschließlich auf diesem Gerät gespeichert. Andere Handys sehen diese Werte nicht.</div>';
  };
  document.addEventListener("click",function(ev){
    const el=ev.target.closest("[data-ac-review],#acSaveName");if(!el)return;
    if(el.hasAttribute("data-ac-review")) {
      window.acRecordLesson(el.dataset.acReview);
      if(typeof render==="function")render();
    } else if(el.id==="acSaveName") {
      const input=document.getElementById("acPlayerName");
      const value=(input?.value||"").trim().replace(/\s+/g," ").slice(0,20);
      if(!value || /[<>]/.test(value)){if(typeof notify==="function")notify("Bitte einen normalen Namen eingeben.");return;}
      const b=board();
      b.name=value;
      if(!b.players[value])b.players[value]={xp:0,activities:0,updated:dateKey(),last:"Neuer Spieler"};
      save(BOARD_KEY,b);
      if(typeof render==="function")render();
    }
  });
  // Mehr Themen für das Quizportal, mit sicheren Wissenfragen über Technik, Geschichte und Aufgaben.
  const extra=[
    {id:"heli",title:"Hubschrauber & Rettung",icon:"◈",img:"jet",description:"Fluggeräte, Aufgaben, Transport und Rettung.",questions:[
      ["Was ist der NH90?",["Ein Hubschrauber","Ein Panzer","Ein U-Boot","Ein Transportzug"],0,"Der NH90 ist ein militärischer Mehrzweckhubschrauber."],
      ["Was bedeutet die Abkürzung SAR in der Luftrettung?",["Search and Rescue","Sea and Rail","Safety and Radar","System and Repair"],0,"SAR steht für Such- und Rettungsdienst."],
      ["Was ist der Tiger bei der Bundeswehr?",["Ein Kampfhubschrauber","Eine Fregatte","Ein Transportflugzeug","Ein Amphibienfahrzeug"],0,"Tiger bezeichnet einen Kampfhubschraubertyp."],
      ["Was zeichnet einen Hubschrauber im Unterschied zum Starrflügler aus?",["Tragender Rotor","Schiffspropeller","Kettenantrieb","Segelmast"],0,"Rotoren ermöglichen dem Hubschrauber den Flug."],
      ["Was ist eine wichtige Aufgabe militärischer Transporthubschrauber?",["Transport von Menschen und Material","Straßenbau allein","Betankung von Schiffen","Unterwasserortung"],0,"Transporthubschrauber können Personal und Material bewegen."],
      ["Zu welcher Teilstreitkraft gehören die Heeresflieger?",["Heer","Marine allein","Bundespolizei","Ziviler Zoll"],0,"Die Heeresflieger gehören zum Heer."],
      ["Was kann zur Rettung in Notsituationen gehören?",["Suche und medizinische Hilfe","Schulnoten vergeben","Zolltarife festlegen","Wettergesetze ändern"],0,"Such- und Rettungsdienst kann in Notfällen Menschen helfen."],
      ["Warum werden Helikopter bei Rettungseinsätzen genutzt?",["Sie können flexibel landen und transportieren","Sie fahren auf Schienen","Sie sind Unterseeboote","Sie benötigen ausschließlich Häfen"],0,"Ihre Einsatzmöglichkeiten erleichtern manche Rettungsaufgaben."],
      ["Welche Aussage ist für Fluggerät allgemein richtig?",["Wartung und Sicherheitsprüfungen sind wichtig","Jedes Modell fliegt ohne Kontrolle","Nur Farbe entscheidet über den Typ","Flugpläne sind grundsätzlich unnötig"],0,"Wartung und Sicherheitsregeln sind entscheidend."],
      ["Was bezeichnet ein Cockpit?",["Arbeitsplatz der Flugbesatzung","Fahrzeuggarage","Schiffsanker","Panzerkette"],0,"Das Cockpit enthält wichtige Bedienelemente und Anzeigen."],
      ["Was liefert ein Höhenmesser?",["Information über die Höhe","Die Reifenbreite","Die Temperatur einer Batterie","Die Farbe des Rumpfes"],0,"Ein Höhenmesser zeigt die Flughöhe an."],
      ["Welcher Begriff gehört zur Luftfahrt?",["Rotor","Kette","Taucherglocke","Schiffsschraube"],0,"Ein Rotor ist ein zentraler Begriff bei Hubschraubern."]
    ]},
    {id:"alltag",title:"Dienstalltag & Ausbildung",icon:"☼",img:"event",description:"Grundausbildung, Teamwork und Soldatenalltag.",questions:[
      ["Wofür ist die Grundausbildung gedacht?",["Für militärische Grundlagen","Für einen Berufsabschluss als Lehrer","Für eine Führerscheinpflicht","Für eine Bundestagswahl"],0,"Die Grundausbildung vermittelt grundlegende Kenntnisse."],
      ["Warum ist Teamarbeit wichtig?",["Weil Aufgaben gemeinsam gelöst werden","Damit niemand Fragen stellt","Weil Regeln nicht gelten","Damit nur Einzelne Verantwortung tragen"],0,"Gute Zusammenarbeit hilft beim sicheren Aufgabenerfüllen."],
      ["Was gehört zur militärischen Ausbildung?",["Rechtliche Grundlagen","Parteienwerbung","Steuerrecht für Privatfirmen","Wahlkampfpflicht"],0,"Recht und Verantwortung sind Bestandteile der Ausbildung."],
      ["Warum zählt körperliche Fitness?",["Sie unterstützt Gesundheit und Belastbarkeit","Sie ersetzt das Grundgesetz","Sie ist ein Dienstgrad","Sie ersetzt fachliches Wissen"],0,"Körperliche Fitness kann die Einsatzfähigkeit unterstützen."],
      ["Wie nennt man eine militärische Unterkunftsanlage häufig?",["Kaserne","Gerichtssaal","Theater","Seehafen"],0,"Kasernen dienen als militärische Standorte."],
      ["Wer kann bei der Bundeswehr beruflich arbeiten?",["Soldaten und zivile Mitarbeitende","Nur Soldaten","Nur Beamte","Nur Bundespolizisten"],0,"Neben Militärangehörigen sind viele Zivilbeschäftigte tätig."],
      ["Was bedeutet Kameradschaft?",["Verlässlichkeit und gegenseitige Unterstützung","Gesetze ignorieren","Nur Wettkampf","Verantwortung vermeiden"],0,"Kameradschaft umfasst Unterstützung und Zusammenhalt."],
      ["Welches Ziel haben Sicherheitsunterweisungen?",["Risiken erkennen und vermeiden","Trainingszeiten ausfallen lassen","Uniformfarben wählen","Abzeichen sammeln"],0,"Unterweisungen sollen Sicherheit fördern."],
      ["Was ist eine Ausbildungswerkstatt?",["Ein Ort für berufliche praktische Ausbildung","Ein öffentlicher Konzertsaal","Ein militärischer Dienstgrad","Ein Bergwerk"],0,"Dort werden fachliche Fertigkeiten vermittelt."],
      ["Welches Verhalten passt zur Inneren Führung?",["Menschenwürde achten","Grundrechte ignorieren","Willkürliche Strafen verhängen","Befehle ungeprüft als rechtmäßig ansehen"],0,"Die Innere Führung beruht auf Würde und Verantwortung."],
      ["Was bedeutet 'zivile Laufbahn' in diesem Zusammenhang?",["Nicht-soldatischer Beruf bei der Bundeswehr","Automatisch Offizier werden","Nur Sport treiben","Pflicht zu Auslandseinsätzen"],0,"Auch ohne Soldatenstatus gibt es viele Berufe."],
      ["Wozu sind regelmäßige Feedbackgespräche sinnvoll?",["Lernen und Entwicklung fördern","Rechtliche Pflichten abschaffen","Material ersetzen","Dienstgrade überspringen"],0,"Rückmeldung unterstützt die Weiterentwicklung."]
    ]},
    {id:"welt",title:"NATO & internationale Zusammenarbeit",icon:"◎",img:"navy",description:"Bündnisse, Zusammenarbeit und Verantwortung.",questions:[
      ["Wofür steht NATO?",["North Atlantic Treaty Organization","National Army Training Office","Northern Aviation Technical Organization","New Allied Trade Office"],0,"Die NATO ist die Nordatlantikvertrags-Organisation."],
      ["Was ist ein zentrales Ziel eines Verteidigungsbündnisses?",["Gemeinsame Sicherheit","Sportwetten koordinieren","Privatbanken leiten","Landeswahlen organisieren"],0,"Bündnisse dienen der gemeinsamen Sicherheit."],
      ["Wo liegt das NATO-Hauptquartier?",["Brüssel","Paris","Berlin","Rom"],0,"Das politische NATO-Hauptquartier befindet sich in Brüssel."],
      ["Wofür steht UNO?",["Vereinte Nationen","Europäische Luftwaffe","Unternehmens-Nachrichten-Ordnung","Unabhängige Nordsee-Organisation"],0,"UNO bezeichnet die Vereinten Nationen."],
      ["Was ist eine Voraussetzung für bewaffnete Auslandseinsätze der Bundeswehr?",["Grundsätzlich Zustimmung des Bundestags","Nur ein privater Auftrag","Eine Abstimmung aller Städte","Ein Werbevertrag"],0,"Der Bundestag entscheidet grundsätzlich über bewaffnete Auslandseinsätze."],
      ["Welches Land gehört zu den NATO-Gründungsmitgliedern?",["Kanada","Deutschland","Spanien","Polen"],0,"Kanada war 1949 eines der Gründungsmitglieder."],
      ["Welches Prinzip ist für die Bundeswehr wesentlich?",["Demokratische Kontrolle","Unbegrenzte Eigenmacht","Parteipolitische Befehle","Beliebige Auslandseinsätze"],0,"Die Bundeswehr unterliegt demokratischer Kontrolle."],
      ["Warum werden gemeinsame Übungen durchgeführt?",["Zusammenarbeit verbessern","Gesetze abschaffen","Schulnoten vergeben","Sportligen ersetzen"],0,"Gemeinsame Ausbildung verbessert die Zusammenarbeit."],
      ["Was bedeutet 'Bündnisverteidigung'?",["Verteidigung im Rahmen eines Bündnisses","Bewachung von Firmenlogos","Regulierung von Freizeitparks","Grenzenloser Warenhandel"],0,"Sie betrifft die Verteidigung von Bündnispartnern."],
      ["Welche Organisation ist eine politische Staatengemeinschaft?",["Europäische Union","Eine einzelne Kompanie","Ein ziviles Fitnessstudio","Eine Schiffsklasse"],0,"Die EU ist ein Zusammenschluss europäischer Staaten."],
      ["Welche Aussage zu Friedenssicherung ist zutreffend?",["Sie kann diplomatische und internationale Zusammenarbeit umfassen","Sie braucht niemals Gesetze","Sie geschieht ausschließlich durch Sport","Sie ist ein Fahrzeugtyp"],0,"Friedenssicherung umfasst mehrere politische und rechtliche Instrumente."],
      ["Was bedeutet Multinationalität in der Zusammenarbeit?",["Mehrere Nationen wirken zusammen","Nur ein Land nimmt teil","Alle sprechen dieselbe Muttersprache","Es gibt keine Regeln"],0,"Multinationale Zusammenarbeit umfasst mehrere Staaten."]
    ]},
    {id:"technik",title:"Technik & Fahrzeuge Pro",icon:"⚙",img:"tank",description:"Materialkenntnis, Energie, Fahrzeuge, Navigation.",questions:[
      ["Welcher Fahrzeugtyp ist der Leopard 2?",["Kampfpanzer","Transporthubschrauber","U-Boot","Mehrzweckfregatte"],0,"Der Leopard 2 ist ein Kampfpanzer."],
      ["Was bezeichnet der Boxer bei der Bundeswehr?",["Ein gepanzertes Radfahrzeug","Ein Eurofighter-Modell","Ein Flugzeugträger","Ein Segelschiff"],0,"Der Boxer ist ein gepanzertes Transportkraftfahrzeug."],
      ["Was ist der Dingo?",["Ein geschütztes Radfahrzeug","Ein Marine-U-Boot","Eine Rakete","Ein Rettungshubschrauber"],0,"Der Dingo ist ein geschütztes Fahrzeug."],
      ["Welche Aufgabe hat die technische Wartung?",["Funktionsfähigkeit und Sicherheit erhalten","Nur Außenlack ändern","Dienstgrade verteilen","Schulnoten vergeben"],0,"Wartung hilft, technische Systeme sicher zu betreiben."],
      ["Welcher Fahrzeugtyp ist der Puma?",["Schützenpanzer","Kampfjet","Patrouillenschiff","Transportflugzeug"],0,"Der Puma ist ein Schützenpanzer."],
      ["Was ist ein Kettenfahrzeug?",["Fahrzeug mit Gleisketten","Flugzeug mit Propeller","Schiff mit Segeln","Fahrrad mit Kette"],0,"Kettenfahrzeuge rollen auf Gleisketten."],
      ["Welche Funktion haben Karten allgemein?",["Orientierung und räumliche Darstellung","Treibstoff ersetzen","Funk ersetzen","Dienstgrade anzeigen"],0,"Karten helfen bei der Orientierung."],
      ["Was zeigt ein Kompass an?",["Himmelsrichtungen","Temperatur","Lautstärke","Gewicht"],0,"Kompasse unterstützen die Orientierung."],
      ["Welche Energieform nutzt ein Elektromotor?",["Elektrische Energie","Nur Windenergie","Nur Muskelkraft","Nur Wasserdruck"],0,"Ein Elektromotor wandelt elektrische Energie in Bewegung um."],
      ["Welche Aufgabe hat ein Funkgerät im Allgemeinen?",["Drahtlose Kommunikation","Wasseraufbereitung","Metallbearbeitung","Höhenmessung"],0,"Funkgeräte dienen der drahtlosen Verständigung."],
      ["Wofür steht GPS?",["Global Positioning System","General Power Service","Ground Patrol Signal","Global Propeller Standard"],0,"GPS steht für Global Positioning System."],
      ["Was ist bei jeder Fahrzeugfahrt wichtig?",["Sicherheitsregeln und Verkehrsvorschriften beachten","Warnsignale grundsätzlich ignorieren","Auf Wartung verzichten","Ohne Sicht fahren"],0,"Sicherheits- und Verkehrsregeln gelten auch für Fahrzeuge."]
    ]},
    {id:"geschichteplus",title:"Geschichte Spezial",icon:"◷",img:"history",description:"Zeitleiste von der Gründung bis heute.",questions:[
      ["In welchem Jahr wurde die Bundeswehr gegründet?",["1955","1945","1969","1999"],0,"Die Bundeswehr wurde 1955 gegründet."],
      ["Worauf basiert das Selbstverständnis der Bundeswehr?",["Demokratie und Grundgesetz","NS-Traditionspflege","Persönliche Herrschaft","Parteipolitischer Gehorsam"],0,"Die Bundeswehr ist den Werten des Grundgesetzes verpflichtet."],
      ["Wann trat die Bundesrepublik der NATO bei?",["1955","1949","1975","1990"],0,"Die Bundesrepublik trat 1955 der NATO bei."],
      ["Was änderte die deutsche Wiedervereinigung?",["Die Bundeswehr wurde zu den gesamtdeutschen Streitkräften","Die Bundeswehr wurde vollständig aufgelöst","Deutschland trat aus der NATO aus","Das Grundgesetz wurde abgeschafft"],0,"Seit 1990 sind die Streitkräfte gesamtdeutsch organisiert."],
      ["Was ist das Prinzip 'Bürger in Uniform'?",["Soldaten bleiben verantwortliche Staatsbürger","Soldaten verlieren Grundrechte","Soldaten dürfen keine eigenen Entscheidungen treffen","Soldaten stehen außerhalb der Gesetze"],0,"Soldaten sind Bürger mit Rechten und Pflichten."],
      ["Weshalb setzt sich die Bundeswehr kritisch mit der Wehrmacht auseinander?",["Wegen der Verbrechen des NS-Regimes","Wegen eines Sportturniers","Wegen eines Museumswettbewerbs","Wegen einer Flugzeugfarbe"],0,"Die historische Verantwortung gehört zur Erinnerungskultur."],
      ["Welche Epoche begann 1989 in Deutschland besonders sichtbar?",["Ende der deutschen Teilung","Beginn des Ersten Weltkriegs","Gründung der Bundesrepublik","Beginn der Industrialisierung"],0,"Der Mauerfall 1989 leitete den Prozess zur Wiedervereinigung ein."],
      ["Was feiert Deutschland am 3. Oktober?",["Tag der Deutschen Einheit","Gründung der NATO","Ersten Bundeswehr-Einsatz","Europatag"],0,"Der 3. Oktober ist der Tag der Deutschen Einheit."],
      ["Was ist der Zweck historischer Bildung?",["Vergangenheit kritisch verstehen","Geschichte ausblenden","Nur Daten auswendig lernen","Fragen verbieten"],0,"Historische Bildung unterstützt reflektiertes Lernen."],
      ["Wie nennt man die grundlegende Verfassung Deutschlands?",["Grundgesetz","Bundesakte","Militärgesetzbuch","Europaordnung"],0,"Das Grundgesetz ist Deutschlands Verfassung."],
      ["Was bedeutet 'Parlamentsarmee'?",["Demokratische parlamentarische Kontrolle der Streitkräfte","Eine Armee ohne Gesetze","Ein privater Sicherheitsdienst","Ein ausschließlich ziviles Parlament"],0,"Der Bundestag hat entscheidende Kontrollrechte."],
      ["Was gehört zu einer demokratischen Erinnerungskultur?",["Auch schwierige Geschichte kritisch untersuchen","Verbrechen leugnen","Quellen ignorieren","Menschenrechte aussetzen"],0,"Kritische Reflexion ist ein wichtiger Bestandteil."]
    ]},
    {id:"uniform",title:"Uniform & Ausrüstung",icon:"▣",img:"feld",description:"Schutz, Materialien, Uniformen und Sicherheit.",questions:[
      ["Wozu dient ein Schutzhelm?",["Zum Schutz des Kopfes","Zum Messen der Geschwindigkeit","Zum Laden von Akkus","Zum Navigieren auf See"],0,"Helme sollen den Kopf schützen."],
      ["Was ist eine Feldbluse?",["Teil militärischer Bekleidung","Ein Schiffsmotor","Ein Radarsystem","Ein Dienstgrad"],0,"Die Feldbluse ist ein Uniformteil."],
      ["Welche Funktion erfüllen Sicherheitsbrillen?",["Augenschutz","GPS-Navigation","Funkübertragung","Treibstoffmessung"],0,"Sicherheitsbrillen schützen die Augen."],
      ["Was ist eine Rettungsweste?",["Auftriebshilfe im Wasser","Helm für Flugzeugtechniker","Bordcomputer","Radarfahrzeug"],0,"Rettungswesten bieten Auftrieb im Wasser."],
      ["Warum sind passende Schutzausrüstungen wichtig?",["Sie können Verletzungsrisiken verringern","Sie ersetzen alle Regeln","Sie machen Ausbildung unnötig","Sie dienen nur der Dekoration"],0,"Passende Ausrüstung kann die Sicherheit verbessern."],
      ["Was wird mit einer Funktionsprüfung geprüft?",["Ob ein Gerät ordnungsgemäß arbeitet","Welche Farbe am beliebtesten ist","Wer Dienstgrad bekommt","Wie viel ein Gebäude kostet"],0,"Sie untersucht die Funktionsfähigkeit."],
      ["Was gehört zu einer Uniform?",["Dienstlich festgelegte Bekleidung","Ein Segelflugzeug","Eine Funkfrequenz","Ein Treibstofftank"],0,"Uniformen sind festgelegte Dienstbekleidung."],
      ["Warum ist Gehörschutz bei lautem Lärm sinnvoll?",["Er kann das Gehör schützen","Er verstärkt Lärm","Er ersetzt einen Helm","Er misst Entfernungen"],0,"Gehörschutz soll Lärmbelastung reduzieren."],
      ["Was bedeutet 'persönliche Schutzausrüstung'?",["Ausrüstung zum Schutz vor Gefahren","Privater Schmuck","Ein Dienstgrad","Eine Art Fahrzeug"],0,"PSA soll Menschen schützen."],
      ["Was ist ein Materialdepot?",["Lager für Material","Flugzeugmodell","Dienstgradabzeichen","Marineschiff"],0,"Materialdepots dienen der Lagerung."],
      ["Wer hilft bei Problemen mit Ausrüstungsgegenständen?",["Zuständiges Fachpersonal","Zufällige Passanten","Werbeagenturen","Sportkommentatoren"],0,"Fachpersonal ist für Prüfung und Reparatur zuständig."],
      ["Warum werden Schutzmaterialien regelmäßig kontrolliert?",["Um ihre Funktion zu erhalten","Um die Regeln abzuschaffen","Weil die Farbe wechseln muss","Damit kein Training stattfindet"],0,"Prüfungen tragen zur sicheren Nutzung bei."]
    ]}
  ];
  if(typeof QUIZ_TOPICS!=="undefined") {
    for(const t of extra)if(!QUIZ_TOPICS.some(existing=>existing.id===t.id))QUIZ_TOPICS.push(t);
    if(!QUIZ_TOPICS.some(t=>t.id==="mega")) {
      const catalogue=QUIZ_TOPICS.filter(t=>t.id!=="mega"),pool=[];
      for(let i=0;i<36;i++){const t=catalogue[i%catalogue.length];pool.push(t.questions[Math.floor(i/catalogue.length)%t.questions.length]);}
      QUIZ_TOPICS.unshift({id:"mega",title:"MEGA-QUIZ · 36 Fragen",icon:"🏆",img:"parade",description:"Die große Herausforderung quer durch alle Bundeswehr-Themen.",questions:pool});
    }
    // Rangschwellen erweitern, damit tägliche Belohnungen weiter motivieren.
    if(typeof RANK_LADDER!=="undefined" && !RANK_LADDER.some(r=>r[0]==="General")) {
      RANK_LADDER.push(["Brigadegeneral",1500,"✦★"],["Generalmajor",2500,"★★"],["Generalleutnant",4000,"★★★"],["General",6500,"✪"]);
    }
  }
  if(typeof NAV!=="undefined") {
    if(!NAV.some(n=>n[0]==="missionen"))NAV.splice(5,0,["missionen","☑","Tagesmissionen"]);
    if(!NAV.some(n=>n[0]==="rangliste"))NAV.splice(7,0,["rangliste","🏆","Rangliste"]);
  }
  if(typeof pageLabel!=="undefined"){pageLabel.missionen="TAGESMISSIONEN";pageLabel.rangliste="RANGLISTE";}
  seedBoard();
  if(typeof render==="function")render();
})();