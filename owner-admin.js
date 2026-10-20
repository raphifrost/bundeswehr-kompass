/* Bundeswehr Kompass · Owner-Verwaltung (nur lokaler Browser)
 * Kein serverseitiger Admin und kein sicherer Schutz einer öffentlichen Datenbank.
 * Kein PIN, Passwort oder geheimer Schlüssel wird im veröffentlichten Code hinterlegt.
 */
(function () {
  "use strict";
  const ACCESS="bw_owner_pin_v1", BOARD="bw_ac_board_v1",
        LOG="bw_owner_log_v1", EDITS="bw_owner_quiz_edits_v1";
  const MAX_XP=1000000, MAX_PROFILES=100;
  let unlocked=false, unlockedAt=0, failCount=0, cooldownUntil=0;
  const profileStore=()=>load(BOARD,{name:"Mein Profil",players:{"Mein Profil":{xp:0,activities:0,last:"Start"}}});
  function load(key,fallback) {
    try { const x=JSON.parse(localStorage.getItem(key));return x===null?fallback:x; }
    catch(e){return fallback;}
  }
  function put(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){message("Speichern fehlgeschlagen. Prüfe deinen Browserspeicher.");return false;}}
  function out(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function nameOk(raw){
    const name=String(raw??"").trim().replace(/\s+/g," ").slice(0,22);
    if(!name || /[<>\\/\u0000-\u001f]/.test(name) || ["__proto__","constructor","prototype"].includes(name.toLowerCase()))return null;
    return name;
  }
  function score(player){return Math.max(0,Math.min(MAX_XP,Math.round(Number(player?.xp)||0)));}
  function board(){
    const b=profileStore();
    if(!b || typeof b!=="object")return {name:"Mein Profil",players:{"Mein Profil":{xp:0,activities:0}}};
    if(!b.players || typeof b.players!=="object"||Array.isArray(b.players))b.players={};
    if(typeof b.name!=="string")b.name="Mein Profil";
    if(!Object.prototype.hasOwnProperty.call(b.players,b.name))b.players[b.name]={xp:0,activities:0,last:"Neues Profil"};
    return b;
  }
  function baseEntry(xp=0){return {xp,activities:0,updated:new Date().toISOString().slice(0,10),last:"Admin-Verwaltung"};}
  function log(what,profile,detail){
    const all=load(LOG,[]);
    const rows=Array.isArray(all)?all:[];
    rows.unshift({when:new Date().toLocaleString("de-DE"),what:String(what).slice(0,45),profile:String(profile).slice(0,25),detail:String(detail).slice(0,95)});
    put(LOG,rows.slice(0,35));
  }
  function message(m){
    if(typeof notify==="function")notify(m);
    else if(typeof window.alert==="function")window.alert(m);
  }
  function changePlayer(player,amount,mode,reason){
    const b=board();
    if(!Object.prototype.hasOwnProperty.call(b.players,player)){message("Spieler nicht gefunden");return false;}
    let n=Math.trunc(Number(amount));
    if(!Number.isSafeInteger(n)||n<0||n>MAX_XP){message("Bitte 0 bis 1.000.000 Punkte eingeben.");return false;}
    const current=score(b.players[player]);
    const next=mode==="set"?n:mode==="minus"?Math.max(0,current-n):Math.min(MAX_XP,current+n);
    const delta=next-current;
    b.players[player]={...b.players[player],xp:next,activities:Math.max(0,Number(b.players[player]?.activities)||0)+(delta?1:0),updated:new Date().toISOString().slice(0,10),last:reason};
    if(!put(BOARD,b))return false;
    log("Punkte "+(mode==="set"?"setzen":mode==="minus"?"abziehen":"vergeben"),player,current+" → "+next+" XP ("+reason+")");
    message(player+": "+next+" XP"+(delta?" ("+(delta>0?"+":"")+delta+")":""));
    return true;
  }
  function currentName(){return board().name;}
  function selectedName(){return document.getElementById("ownerTarget")?.value || currentName();}
  function sessionAlive(){
    if(unlocked&&Date.now()-unlockedAt>15*60*1000)unlocked=false;
    return unlocked;
  }
  function refresh(){if(typeof render==="function")render();}
  function configured(){const c=load(ACCESS,null);return !!(c&&typeof c.salt==="string"&&typeof c.hash==="string");}
  function makeSalt(){
    const bytes=new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes));
  }
  async function derive(pin,salt){
    if(!crypto?.subtle)throw new Error("Für die Geräte-PIN ist eine sichere HTTPS-Verbindung nötig.");
    const bytes=Uint8Array.from(atob(salt),c=>c.charCodeAt(0));
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);
    const hash=await crypto.subtle.deriveBits({name:"PBKDF2",salt:bytes,iterations:130000,hash:"SHA-256"},key,256);
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
  }
  async function setup(pin,confirmation){
    if(pin!==confirmation){message("Die beiden Geräte-PINs stimmen nicht überein.");return;}
    if(pin.length<6||pin.length>64){message("Verwende mindestens 6 Zeichen.");return;}
    try{
      const salt=makeSalt(),hash=await derive(pin,salt);
      if(put(ACCESS,{salt,hash,version:1})){unlocked=true;unlockedAt=Date.now();log("Geräte-PIN erstellt","Admin","Nur lokal auf diesem Browser");refresh();}
    }catch(e){message(String(e.message||e));}
  }
  async function login(pin){
    if(Date.now()<cooldownUntil){message("Bitte kurz warten und erneut versuchen.");return;}
    try{
      const c=load(ACCESS,null);
      if(!c?.salt){message("Noch kein Geräte-PIN eingerichtet.");return;}
      const entered=await derive(pin,c.salt);
      if(entered!==c.hash){
        failCount++;
        if(failCount>=5){cooldownUntil=Date.now()+60000;failCount=0;}
        message("Falscher Geräte-PIN.");return;
      }
      unlocked=true;unlockedAt=Date.now();failCount=0;refresh();
    }catch(e){message(String(e.message||e));}
  }
  function rows(){
    return Object.entries(board().players)
      .filter(([key])=>Object.prototype.hasOwnProperty.call(board().players,key))
      .sort((a,b)=>score(b[1])-score(a[1]));
  }
  function custom(){
    const v=load(EDITS,{topics:[],questions:[]});
    return {topics:Array.isArray(v.topics)?v.topics:[],questions:Array.isArray(v.questions)?v.questions:[]};
  }
  function injectQuizChanges(){
    if(typeof QUIZ_TOPICS==="undefined")return;
    const v=custom();
    v.topics.forEach(t=>{
      if(!t||typeof t.id!=="string"||typeof t.title!=="string"||!/^owner_[a-zA-Z0-9_-]+$/.test(t.id))return;
      if(!QUIZ_TOPICS.some(q=>q.id===t.id))QUIZ_TOPICS.push({id:t.id,title:t.title.slice(0,45),icon:"✦",img:"event",description:(t.description||"Eigenes Wissenquiz").slice(0,90),questions:[]});
    });
    v.questions.forEach(q=>{
      const topic=QUIZ_TOPICS.find(t=>t.id===q?.topic);
      if(!topic||typeof q.q!=="string"||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3)return;
      // Kein mehrfaches Einfügen, wenn der Bildschirm neu gerendert wird.
      if(!topic.questions.some(x=>x._ownerId===q.id)){
        const item=[q.q.slice(0,260),q.options.map(x=>String(x).slice(0,120)),q.correct,String(q.explanation||"").slice(0,360)];
        item._ownerId=q.id;
        topic.questions.push(item);
      }
    });
  }
  function profileChoices(){
    return rows().map(([name,p])=>'<option value="'+out(name)+'" '+(name===currentName()?'selected':'')+'>'+out(name)+' · '+score(p)+' XP</option>').join("");
  }
  function quizChoices(){
    return typeof QUIZ_TOPICS!=="undefined"?QUIZ_TOPICS.filter(t=>t.id!=="mega").map(t=>'<option value="'+out(t.id)+'">'+out(t.title)+'</option>').join(""):"";
  }
  function infoBar(){
    return '<div class="own-note"><strong>WICHTIG · NUR DIESES GERÄT:</strong> Die Website liegt öffentlich auf GitHub Pages. Dieser Geräte-PIN ist keine sichere Online-Authentifizierung. Spieler und Punkte, die du hier bearbeitest, werden ausschließlich im Browser gespeichert und nicht auf andere Handys übertragen.</div>';
  }
  function setupPage(){
    return sectionHeader('OWNER <span style="color:var(--lime)">EINRICHTEN</span>','Erstelle deinen persönlichen Geräte-PIN. Er wird nicht als Klartext gespeichert.')+
      '<div class="own-lock"><div class="own-lock-symbol">◈</div><span class="own-tag">ERSTE EINRICHTUNG</span><h2>OWNER-MODUS AKTIVIEREN</h2><p>Wähle einen PIN mit mindestens 6 Zeichen. Teile ihn nicht mit anderen.</p>'+
      '<form id="ownerSetup" class="own-form"><label>Neuen Geräte-PIN<input type="password" name="pin" minlength="6" maxlength="64" autocomplete="new-password" required placeholder="Mindestens 6 Zeichen"></label><label>Geräte-PIN bestätigen<input type="password" name="verify" minlength="6" maxlength="64" autocomplete="new-password" required placeholder="Erneut eingeben"></label><button class="btn btn-primary" type="submit">Owner-Bereich einrichten →</button></form></div>'+infoBar();
  }
  function loginPage(){
    return sectionHeader('OWNER <span style="color:var(--lime)">LOGIN</span>','Entsperre die lokalen Verwaltungsfunktionen auf diesem Gerät.')+
      '<div class="own-lock"><div class="own-lock-symbol">♢</div><span class="own-tag">GESCHÜTZTE ANSICHT AUF DIESEM GERÄT</span><h2>OWNER-PIN EINGEBEN</h2><p>Dieser Schutz gilt nur für diesen Browser, nicht als offizielles Online-Adminrecht.</p>'+
      '<form id="ownerLogin" class="own-form"><label>Geräte-PIN<input type="password" name="pin" required autocomplete="current-password" placeholder="Dein Geräte-PIN"></label><button class="btn btn-primary" type="submit">Owner-Bereich öffnen →</button></form></div>'+infoBar();
  }
  function adminPage(){
    const b=board(),list=rows(),total=list.reduce((n,[,p])=>n+score(p),0),logs=load(LOG,[]),edited=custom();
    return sectionHeader('OWNER <span style="color:var(--lime)">CONTROL</span>','Verwalte Spieler, Punkte, Quizfragen und deine lokale Rangliste.')+
      '<div class="own-hero"><div><span class="own-tag">BUNDESWEHR KOMPASS · OWNER MODE</span><h2>COMMAND CENTER</h2><p>Aktiver Spieler: '+out(b.name)+' · Punkte und Einstellungen auf deinem Gerät</p></div><button id="ownerLogout" class="btn btn-secondary">◈ Sperren</button></div>'+
      '<div class="own-stats"><div><small>PROFILE</small><strong>'+list.length+'</strong></div><div><small>GESAMTE XP</small><strong>'+total.toLocaleString("de-DE")+'</strong></div><div><small>DEIN PROFIL</small><strong>'+score(b.players[b.name]).toLocaleString("de-DE")+'</strong></div></div>'+
      '<div class="own-layout"><section class="own-card"><span class="own-tag">01 / XP CONTROL</span><h3>PUNKTE VERGEBEN</h3><p>Wähle einen Spieler und lege fest, wie viele XP vergeben oder abgezogen werden sollen.</p>'+
      '<form id="ownerAdjust" class="own-form"><label>Spieler auswählen<select id="ownerTarget" name="player">'+profileChoices()+'</select></label>'+
      '<div class="own-two"><label>Anzahl XP<input name="amount" type="number" min="0" max="'+MAX_XP+'" step="1" value="100" required></label>'+
      '<label>Aktion<select name="action"><option value="plus">Punkte geben (+)</option><option value="minus">Punkte abziehen (−)</option><option value="set">Punktestand setzen (=)</option></select></label></div>'+
      '<label>Grund<input name="reason" maxlength="55" placeholder="z. B. Lernbonus" value="Admin-Bonus"></label>'+
      '<button type="submit" class="btn btn-primary">XP-Änderung speichern ↗</button></form></section>'+
      '<section class="own-card"><span class="own-tag">02 / PLAYER MANAGEMENT</span><h3>SPIELER VERWALTEN</h3><p>Profile werden nur in der Rangliste dieses Geräts gespeichert.</p>'+
      '<form id="ownerNewPlayer" class="own-form"><label>Neuen Spielernamen eingeben<input name="name" maxlength="22" required placeholder="Spielername"></label><button type="submit" class="btn btn-secondary">+ Profil hinzufügen</button></form>'+
      '<div class="own-btn-row"><button class="btn btn-secondary" id="ownerSetActive">Als aktives Profil wählen</button><button class="btn btn-secondary" id="ownerDelete">Spieler löschen</button></div>'+
      '<p class="own-help">Spieler löschen entfernt sein Profil und die Punkte nur hier auf dem Gerät. Den gerade aktiven Spieler kannst du nicht löschen.</p></section></div>'+
      '<section class="own-card own-full"><span class="own-tag">03 / QUIZ STUDIO</span><h3>EIGENE QUIZFRAGEN</h3><p>Füge Fragen zu einem bestehenden Thema hinzu oder erstelle eine eigene Kategorie. Die Änderungen sind nur auf diesem Gerät sichtbar.</p>'+
      '<form id="ownerNewTopic" class="own-form own-topic-form"><label>Kategorie erstellen<input name="title" maxlength="45" placeholder="z. B. Flugzeuge Spezial" required></label><label>Kurzbeschreibung<input name="description" maxlength="90" placeholder="Was wird abgefragt?"></label><button class="btn btn-secondary" type="submit">Neue Kategorie erstellen</button></form>'+
      '<form id="ownerNewQuestion" class="own-form"><label>Quiz-Kategorie<select name="topic">'+quizChoices()+'</select></label><label>Frage<input name="question" maxlength="260" required placeholder="Was möchtest du fragen?"></label>'+
      '<div class="own-two"><label>Antwort A<input name="a" maxlength="120" required></label><label>Antwort B<input name="b" maxlength="120" required></label><label>Antwort C<input name="c" maxlength="120" required></label><label>Antwort D<input name="d" maxlength="120" required></label></div>'+
      '<label>Richtige Antwort<select name="correct"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></label>'+
      '<label>Kurze Erklärung<input name="explanation" maxlength="360" placeholder="Warum ist die Antwort richtig?" required></label><button class="btn btn-primary" type="submit">Frage zum Quiz hinzufügen ↗</button></form>'+
      (edited.questions.length?'<div class="own-edits"><strong>Deine Fragen ('+edited.questions.length+')</strong>'+edited.questions.slice(-12).reverse().map(q=>'<div><span>'+out(q.q)+'</span><button class="own-mini-remove" data-owner-remove-question="'+out(q.id)+'">Entfernen</button></div>').join('')+'</div>':'')+
      (edited.topics.length?'<div class="own-edits"><strong>Eigene Kategorien</strong>'+edited.topics.map(t=>'<div><span>'+out(t.title)+'</span><button class="own-mini-remove" data-owner-remove-topic="'+out(t.id)+'">Entfernen</button></div>').join('')+'</div>':'')+'</section>'+
      '<div class="own-layout"><section class="own-card"><span class="own-tag">04 / SICHERHEIT</span><h3>GERÄTE-PIN</h3><p>Ändere den lokalen PIN oder sperre den Adminbereich wieder.</p>'+
      '<form id="ownerChangePin" class="own-form"><label>Neuer Geräte-PIN<input name="pin" type="password" minlength="6" maxlength="64" autocomplete="new-password" required></label><label>PIN wiederholen<input name="verify" type="password" minlength="6" maxlength="64" autocomplete="new-password" required></label><button type="submit" class="btn btn-secondary">PIN ändern</button></form></section>'+
      '<section class="own-card"><span class="own-tag">05 / DATEN</span><h3>BACKUP & VERWALTUNG</h3><p>Exportiere deine Daten vor Änderungen. Ein Zurücksetzen betrifft nur die lokale Rangliste.</p><div class="own-btn-col"><button id="ownerExport" class="btn btn-primary">Daten als JSON sichern ↓</button><button id="ownerResetBoard" class="btn btn-secondary">Lokale Rangliste zurücksetzen</button><a class="btn btn-secondary" href="https://github.com/raphifrost/bundeswehr-kompass" target="_blank" rel="noopener noreferrer">Website-Dateien auf GitHub ↗</a></div></section></div>'+
      '<section class="own-card own-full"><span class="own-tag">06 / LOKALER VERLAUF</span><h3>ADMIN-AKTIONEN</h3>'+
      '<div class="own-audit">'+(Array.isArray(logs)&&logs.length?logs.slice(0,12).map(x=>'<div><small>'+out(x.when)+'</small><strong>'+out(x.what)+' · '+out(x.profile)+'</strong><span>'+out(x.detail)+'</span></div>').join(''):'<p>Es gibt noch keine Adminaktionen.</p>')+'</div></section>'+infoBar();
  }
  window.acAdminPage=function(){
    if(!configured())return setupPage();
    if(!sessionAlive())return loginPage();
    return adminPage();
  };
  function touch(){unlockedAt=Date.now();}
  function requireAdmin(){if(!sessionAlive()){message("Adminbereich ist gesperrt.");refresh();return false;}touch();return true;}
  document.addEventListener("submit",async function(ev){
    const id=ev.target?.id;
    if(!["ownerSetup","ownerLogin","ownerAdjust","ownerNewPlayer","ownerNewTopic","ownerNewQuestion","ownerChangePin"].includes(id))return;
    ev.preventDefault();
    const form=ev.target, data=new FormData(form);
    if(id==="ownerSetup"){if(configured())return;await setup(String(data.get("pin")||""),String(data.get("verify")||""));return;}
    if(id==="ownerLogin"){await login(String(data.get("pin")||""));return;}
    if(!requireAdmin())return;
    if(id==="ownerAdjust"){
      const target=String(data.get("player")||""),action=String(data.get("action")||"");
      if(!["plus","minus","set"].includes(action))return;
      const n=Number(data.get("amount"));
      if(!Number.isSafeInteger(n)||n<0||n>MAX_XP){message("Ungültige Punktzahl.");return;}
      const reason=String(data.get("reason")||"Admin-Aktion").replace(/[<>]/g,"").trim().slice(0,55)||"Admin-Aktion";
      if(action==="set"||action==="minus"){
        if(!confirm("Punkte für "+target+" wirklich "+(action==="set"?"auf "+n+" setzen": "um "+n+" reduzieren")+"?"))return;
      }
      if(changePlayer(target,n,action,reason))refresh();
      return;
    }
    if(id==="ownerNewPlayer"){
      const name=nameOk(data.get("name")),b=board();
      if(!name){message("Gib einen gültigen Spielernamen ein.");return;}
      if(Object.prototype.hasOwnProperty.call(b.players,name)){message("Diesen Spieler gibt es schon.");return;}
      if(Object.keys(b.players).length>=MAX_PROFILES){message("Maximal 100 Profile auf einem Gerät.");return;}
      b.players[name]=baseEntry();
      if(put(BOARD,b)){log("Profil erstellt",name,"0 XP");refresh();}
      return;
    }
    if(id==="ownerChangePin"){await setup(String(data.get("pin")||""),String(data.get("verify")||""));return;}
    if(id==="ownerNewTopic"){
      const title=String(data.get("title")||"").trim().replace(/\s+/g," ").slice(0,45);
      const desc=String(data.get("description")||"").trim().slice(0,90);
      if(title.length<3){message("Mindestens drei Zeichen für die Kategorie.");return;}
      const v=custom();
      if(v.topics.length>=30){message("Maximal 30 eigene Kategorien.");return;}
      const id="owner_"+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,""):Date.now().toString(36));
      v.topics.push({id,title,description:desc});
      if(put(EDITS,v)){log("Quiz erstellt",title,"Neue Quizkategorie");location.reload();}
      return;
    }
    if(id==="ownerNewQuestion"){
      const topic=String(data.get("topic")||""), v=custom();
      if(typeof QUIZ_TOPICS==="undefined"||!QUIZ_TOPICS.some(t=>t.id===topic)){message("Quizthema unbekannt.");return;}
      const q=String(data.get("question")||"").trim().slice(0,260);
      const options=["a","b","c","d"].map(k=>String(data.get(k)||"").trim().slice(0,120));
      const explanation=String(data.get("explanation")||"").trim().slice(0,360);
      const correct=Number(data.get("correct"));
      if(q.length<8||options.some(x=>x.length<2)||new Set(options.map(x=>x.toLowerCase())).size!==4||explanation.length<8||![0,1,2,3].includes(correct)){message("Bitte Frage, vier verschiedene Antworten und Erklärung vollständig ausfüllen.");return;}
      if(v.questions.length>=200){message("Maximal 200 eigene Quizfragen.");return;}
      const id="q_"+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,""):Date.now().toString(36));
      v.questions.push({id,topic,q,options,correct,explanation});
      if(put(EDITS,v)){log("Quizfrage erstellt",topic,q);location.reload();}
    }
  });
  document.addEventListener("click",function(ev){
    const el=ev.target.closest("#ownerLogout,#ownerSetActive,#ownerDelete,#ownerExport,#ownerResetBoard,[data-owner-remove-question],[data-owner-remove-topic]");
    if(!el)return;
    ev.preventDefault();
    if(!requireAdmin())return;
    const b=board(),target=selectedName();
    if(el.id==="ownerLogout"){unlocked=false;refresh();return;}
    if(el.id==="ownerSetActive"){
      if(!Object.prototype.hasOwnProperty.call(b.players,target))return;
      b.name=target;
      if(put(BOARD,b)){log("Profil gewechselt",target,"Aktiver Spieler");refresh();}
      return;
    }
    if(el.id==="ownerDelete"){
      if(target===b.name){message("Wechsle erst auf ein anderes Profil, bevor du dieses löschst.");return;}
      if(!Object.prototype.hasOwnProperty.call(b.players,target))return;
      if(!confirm("Spieler '"+target+"' samt seinen lokalen Punkten löschen?"))return;
      delete b.players[target];
      if(put(BOARD,b)){log("Profil gelöscht",target,"Punkte dieses Profils gelöscht");refresh();}
      return;
    }
    if(el.id==="ownerExport"){
      const keys=["bw_ac_board_v1","bw_ac_daily_v1","bw_ac_bonus_v1","bwcomp_awards_v2","bwcomp2026","bwquizbest2026",EDITS,LOG];
      const payload={type:"bundeswehr-kompass-local-backup",created:new Date().toISOString(),data:{}};
      for(const key of keys)payload.data[key]=localStorage.getItem(key);
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=url;a.download="bundeswehr-kompass-backup.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
      log("Datensicherung","Admin","JSON-Export erstellt");
      message("Backup erstellt.");
      return;
    }
    if(el.id==="ownerResetBoard"){
      if(!confirm("Wirklich ALLE lokalen Spieler und ihre Ranglistenpunkte löschen?"))return;
      if(!confirm("Letzte Bestätigung: Lokale Rangliste zurücksetzen? Exportiere vorher ein Backup."))return;
      const fresh={name:"Mein Profil",players:{"Mein Profil":baseEntry(0)}};
      if(put(BOARD,fresh)){localStorage.setItem("bw_ac_board_seeded_v1","1");log("Rangliste zurückgesetzt","Admin","Alle lokalen Ranglistenprofile gelöscht");refresh();}
      return;
    }
    const itemId=el.getAttribute("data-owner-remove-question");
    if(itemId){
      if(!confirm("Diese eigene Quizfrage wirklich entfernen?"))return;
      const v=custom();v.questions=v.questions.filter(q=>q.id!==itemId);
      if(put(EDITS,v)){log("Quizfrage entfernt","Admin",itemId);location.reload();}
      return;
    }
    const topicId=el.getAttribute("data-owner-remove-topic");
    if(topicId){
      if(!confirm("Diese eigene Kategorie und alle ihre Fragen entfernen?"))return;
      const v=custom(),topic=v.topics.find(t=>t.id===topicId);
      v.topics=v.topics.filter(t=>t.id!==topicId);
      v.questions=v.questions.filter(q=>q.topic!==topicId);
      if(put(EDITS,v)){log("Quiz entfernt","Admin",topic?.title||topicId);location.reload();}
    }
  });
  if(typeof NAV!=="undefined"&&!NAV.some(n=>n[0]==="admin"))NAV.push(["admin","♛","OWNER / ADMIN"]);
  if(typeof pageLabel!=="undefined")pageLabel.admin="OWNER CONTROL";
  injectQuizChanges();
  if(typeof render==="function")render();
})();