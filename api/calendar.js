/* Vercel serverless function: GET /api/calendar
 * 구글 캘린더(공개)의 일정을 읽어 사이트 달력 형식으로 바꿔 돌려준다.
 * 환경 변수: GOOGLE_API_KEY (필수), GCAL_ID (선택, 기본 cudsunlimited@gmail.com)
 */
"use strict";

var TZ = "Asia/Seoul";
var KST_OFFSET = 9 * 60 * 60 * 1000; // 한국은 서머타임이 없어 +9 고정
var MAX_DAYS = 14;
var DOW = ["일", "월", "화", "수", "목", "금", "토"];

var PREFIX = {
  "세션": "session", "session": "session",
  "대회": "tour", "tour": "tour", "tournament": "tour",
  "행사": "event", "event": "event",
  "연합": "joint", "joint": "joint",
  "기타": "etc", "etc": "etc"
};

function pad(n) { return (n < 10 ? "0" : "") + n; }

function parseTitle(summary) {
  var s = String(summary || "").trim();
  var m = s.match(/^\[\s*([^\]]+?)\s*\]\s*/);
  if (m) {
    var t = PREFIX[m[1].toLowerCase()];
    if (t) return { type: t, title: s.slice(m[0].length).trim() || s };
  }
  return { type: "etc", title: s };
}

function decodeEntities(s) {
  var named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, e) {
    if (e[0] === "#") {
      var code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (x) { return all; }
    }
    var v = named[e.toLowerCase()];
    return v === undefined ? all : v;
  });
}

function htmlToText(html) {
  var s = String(html || "");
  if (!s) return "";
  s = s.replace(/\r\n?/g, "\n");
  if (/<[a-z!\/][^>]*>/i.test(s)) {
    s = s.replace(/\n/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "");
  }
  s = decodeEntities(s);
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function findPdf(ev) {
  var att = ev.attachments || [];
  for (var i = 0; i < att.length; i++) {
    if (att[i] && /^https?:\/\//i.test(att[i].fileUrl || "")) return att[i].fileUrl;
  }
  var raw = decodeEntities(String(ev.description || ""));
  var urls = raw.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (var j = 0; j < urls.length; j++) {
    var u = urls[j].replace(/[).,;]+$/, "");
    if (/^https?:\/\/(drive|docs)\.google\.com\//i.test(u) || /\.pdf([?#]|$)/i.test(u)) return u;
  }
  return "";
}

// "2026-03-12T18:30:00+09:00" -> {date:"2026-03-12", time:"18:30"} (서울 시간)
function kstParts(dateTime) {
  var d = new Date(new Date(dateTime).getTime() + KST_OFFSET);
  return {
    date: d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()),
    time: pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes())
  };
}

function ymd(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
function md(d) { return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + "(" + DOW[d.getUTCDay()] + ")"; }

function mapEvents(items) {
  var out = [];
  (items || []).forEach(function (ev) {
    if (!ev || ev.status === "cancelled") return;
    if (ev.visibility === "private" || ev.visibility === "confidential") return;
    if (!ev.summary || !ev.start) return;
    var p = parseTitle(ev.summary);
    var base = { title: p.title, type: p.type };
    if (ev.location) base.place = String(ev.location).trim();
    var desc = htmlToText(ev.description);
    var pdf = findPdf(ev);
    if (pdf) base.pdf = pdf;
    var id = String(ev.id || "");

    if (ev.start.dateTime) {
      var k = kstParts(ev.start.dateTime);
      out.push(Object.assign({ id: id, date: k.date, time: k.time }, base, desc ? { desc: desc } : {}));
      return;
    }
    if (!ev.start.date) return;
    var s = new Date(ev.start.date + "T00:00:00Z");
    var e = ev.end && ev.end.date ? new Date(ev.end.date + "T00:00:00Z") : new Date(s.getTime() + 864e5);
    var days = Math.round((e - s) / 864e5);
    if (!(days > 1)) {
      out.push(Object.assign({ id: id, date: ymd(s) }, base, desc ? { desc: desc } : {}));
      return;
    }
    var last = new Date(e.getTime() - 864e5);
    var range = "기간: " + md(s) + " ~ " + md(last);
    var full = range + (desc ? "\n\n" + desc : "");
    for (var i = 0; i < Math.min(days, MAX_DAYS); i++) {
      var d = new Date(s.getTime() + i * 864e5);
      out.push(Object.assign({ id: id + "_d" + (i + 1), date: ymd(d) }, base, { desc: full }));
    }
  });
  return out;
}

async function fetchAll(calId, key) {
  var now = Date.now();
  var params = {
    key: key,
    singleEvents: "true",
    orderBy: "startTime",
    timeZone: TZ,
    timeMin: new Date(now - 365 * 864e5).toISOString(),
    timeMax: new Date(now + 366 * 864e5).toISOString(),
    maxResults: "2500",
    supportsAttachments: "true"
  };
  var items = [], token = "", pages = 0;
  do {
    var qs = new URLSearchParams(params);
    if (token) qs.set("pageToken", token);
    var url = "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(calId) + "/events?" + qs.toString();
    var r = await fetch(url);
    if (!r.ok) {
      var err = new Error("Google Calendar API error");
      err.status = r.status;
      throw err;
    }
    var data = await r.json();
    items = items.concat(data.items || []);
    token = data.nextPageToken || "";
    pages++;
  } while (token && pages < 10);
  return items;
}

module.exports = async function handler(req, res) {
  var key = process.env.GOOGLE_API_KEY;
  var calId = process.env.GCAL_ID || "cudsunlimited@gmail.com";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!key) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "GOOGLE_API_KEY is not configured" }));
    return;
  }
  try {
    var items = await fetchAll(calId, key);
    var events = mapEvents(items);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=86400");
    res.statusCode = 200;
    res.end(JSON.stringify({ events: events, updated: new Date().toISOString() }));
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Failed to load Google Calendar", status: e.status || null }));
  }
};

module.exports.mapEvents = mapEvents;
module.exports.htmlToText = htmlToText;
module.exports.parseTitle = parseTitle;
