import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI refs
const $ = (q)=>document.querySelector(q);
const nicknameEl = $("#nickname");
const roomIdEl   = $("#roomId");
const btnCreate  = $("#btnCreate");
const btnJoin    = $("#btnJoin");
const btnLeave   = $("#btnLeave");
const shareEl    = $("#share");
const statusEl   = $("#status");
const onlineEl   = $("#online");
const chatEl     = $("#chat");
const chatInput  = $("#chatInput");
const btnPing    = $("#btnPing");

// state
let channel = null;
let roomId = null;
let myKey = crypto.randomUUID();

// helpers
const genRoom = ()=> Math.random().toString(36).slice(2,8);
const href = (room)=> `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}`;
const setStatus = (t)=> statusEl.textContent = `status: ${t}`;
const addMsg = (html, cls="") => {
  const p = document.createElement("p");
  p.className = `msg ${cls}`; p.innerHTML = html; chatEl.appendChild(p);
  chatEl.scrollTop = chatEl.scrollHeight;
};

function renderPresence(){
  if (!channel) { onlineEl.innerHTML = ""; return; }
  const state = channel.presenceState(); // { key: [metas...] }
  const users = [];
  for (const metas of Object.values(state)) for (const m of metas) users.push(m);
  // หา host แบบง่าย: joinedAt ที่เก่าสุด = host
  const hostJoinedAt = users.reduce((min,m)=> Math.min(min, m.joinedAt||Infinity), Infinity);
  onlineEl.innerHTML = users
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
    .map(u=>{
      const tag = (u.joinedAt===hostJoinedAt)? "<span class=\"badge\">HOST</span>" : "";
      return `<li><strong>${escapeHtml(u.name||"?")}</strong> ${tag}<br><small class=\"muted\">joined ${timeAgo(u.joinedAt)}</small></li>`;
    }).join("");
}

function escapeHtml(s){return s?.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function timeAgo(ts){ if(!ts) return "-"; const d=Date.now()-ts; const m=Math.floor(d/60000); if(m<1) return "just now"; if(m<60) return `${m}m ago`; const h=Math.floor(m/60); return `${h}h ago`; }

async function join(room){
  if (channel) await leave();
  roomId = room.toLowerCase();
  channel = sb.channel(`room:${roomId}`, { config: { presence: { key: myKey } } });

  channel.on("presence", { event: "sync" }, renderPresence);
  channel.on("presence", { event: "join" }, ({ newPresences }) => {
    newPresences.forEach(p=> addMsg(`➡️ <b>${escapeHtml(p.name||"?")}</b> joined`, "sys"));
  });
  channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
    leftPresences.forEach(p=> addMsg(`⬅️ <b>${escapeHtml(p.name||"?")}</b> left`, "sys"));
  });

  channel.on("broadcast", { event: "chat" }, ({ payload }) => {
    addMsg(`<b>${escapeHtml(payload.from)}</b>: ${escapeHtml(payload.text)}`);
  });
  channel.on("broadcast", { event: "ping" }, ({ payload }) => {
    addMsg(`⏱️ ping from <b>${escapeHtml(payload.from)}</b> @ ${new Date(payload.t).toLocaleTimeString()}`);
  });

  setStatus("connecting...");
  await channel.subscribe(async (status)=>{
    if (status === "SUBSCRIBED"){
      await channel.track({ name: nicknameEl.value || "Guest", joinedAt: Date.now() });
      setStatus(`joined: room:${roomId}`);
      shareEl.textContent = `Share: ${href(roomId)}`;
      btnLeave.disabled = false;
      addMsg(`✅ You joined <b>${roomId}</b>`, "sys");
    }
  });
}

async function leave(){
  if (!channel) return;
  try { await channel.untrack(); } catch {}
  try { await channel.unsubscribe(); } catch {}
  channel = null; roomId = null;
  btnLeave.disabled = true; shareEl.textContent = ""; setStatus("idle");
  onlineEl.innerHTML = ""; addMsg("👋 You left the room", "sys");
}

// UI events
btnCreate.addEventListener("click", ()=>{
  const name = nicknameEl.value.trim() || `Guest-${Math.random().toString(36).slice(2,5)}`;
  nicknameEl.value = name;
  const id = genRoom(); roomIdEl.value = id;
  history.replaceState({}, "", `?room=${encodeURIComponent(id)}`);
  join(id);
});

btnJoin.addEventListener("click", ()=>{
  const id = (roomIdEl.value||"").trim(); if(!id) return alert("ใส่ Room ID ก่อน");
  history.replaceState({}, "", `?room=${encodeURIComponent(id)}`);
  join(id);
});

btnLeave.addEventListener("click", leave);

btnPing.addEventListener("click", ()=>{
  if (!channel) return;
  channel.send({ type:"broadcast", event:"ping", payload:{ from: nicknameEl.value||"?", t: Date.now() }});
});

chatInput.addEventListener("keydown", e=>{
  if (e.key !== "Enter") return;
  const text = chatInput.value.trim(); if(!text || !channel) return;
  channel.send({ type:"broadcast", event:"chat", payload:{ text, from: nicknameEl.value||"?", t: Date.now() }});
  addMsg(`<b>me</b>: ${escapeHtml(text)}`, "me");
  chatInput.value = "";
});

window.addEventListener("beforeunload", ()=>{ try{ channel?.untrack(); channel?.unsubscribe(); }catch{} });

// Auto-join ถ้ามี ?room= ใน URL
(function init(){
  const url = new URL(location.href);
  const r = url.searchParams.get("room");
  if (r) { roomIdEl.value = r; join(r); }
})();
