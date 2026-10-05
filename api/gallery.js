/* Vercel serverless function: GET /api/gallery
 * 구글 드라이브 공개 폴더의 사진 목록을 읽어 사이트 갤러리 형식으로 바꿔 돌려준다.
 * 환경 변수: GOOGLE_API_KEY (필수, Drive API 사용 설정 필요),
 *            GDRIVE_FOLDER_ID (선택, 기본 1ePToGxtANGVHkGJ0yWgnOw9D_vUTrS3o)
 */
"use strict";

var KST_OFFSET = 9 * 60 * 60 * 1000; // 한국은 서머타임이 없어 +9 고정
var DEFAULT_FOLDER = "1ePToGxtANGVHkGJ0yWgnOw9D_vUTrS3o";
var FIELDS = "nextPageToken,files(id,name,description,createdTime,imageMediaMetadata(time,width,height,rotation))";

function pad(n) { return (n < 10 ? "0" : "") + n; }

function validYmd(y, m, d) {
  y = +y; m = +m; d = +d;
  if (!(y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1)) return "";
  var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return "";
  return y + "-" + pad(m) + "-" + pad(d);
}

// 파일 이름 맨 앞의 날짜: "2026-03-12_…", "2026.3.12 …", "2026_03_12…", "20260312…"
// -> {date:"2026-03-12", rest:"_…"} 또는 null
function nameDate(name) {
  var s = String(name || "").trim();
  var m = s.match(/^(\d{4})([-._ ])(\d{1,2})\2(\d{1,2})(?!\d)/) || s.match(/^(\d{4})()(\d{2})(\d{2})(?!\d)/);
  if (!m) return null;
  var date = validYmd(m[1], m[3], m[4]);
  return date ? { date: date, rest: s.slice(m[0].length) } : null;
}

// EXIF "2026:03:12 18:30:00" -> "2026-03-12"
function exifDate(time) {
  var m = String(time || "").match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})/);
  return m ? validYmd(m[1], m[2], m[3]) : "";
}

// "2026-03-11T16:30:00.000Z" -> "2026-03-12" (서울 날짜)
function kstDate(iso) {
  var t = new Date(iso || "").getTime();
  if (isNaN(t)) return "";
  var d = new Date(t + KST_OFFSET);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

function photoDate(f) {
  var n = nameDate(f.name);
  if (n) return n.date;
  return exifDate(f.imageMediaMetadata && f.imageMediaMetadata.time) || kstDate(f.createdTime);
}

// 설명이 있으면 설명, 없으면 파일 이름에서 날짜·구분자·확장자를 뺀 부분
function photoCaption(f) {
  var desc = String(f.description || "").replace(/\s+/g, " ").trim();
  if (desc) return desc;
  var s = String(f.name || "").trim().replace(/\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|svg|dng)$/i, "");
  var n = nameDate(s);
  if (n) s = n.rest;
  s = s.replace(/_/g, " ").replace(/^[\s\-.·,]+|[\s\-.·,]+$/g, "").replace(/\s+/g, " ");
  // 카메라가 붙인 이름(IMG_1234, DSC01234, 143022 등)은 설명으로 쓰지 않음
  if (/^[\d\s\-.:()]*$/.test(s) || /^(img|dsc[nf]?|pxl|mvimg|dcim|photo|image|kakaotalk_photo)[\s\-]*[\d\s\-.()]+$/i.test(s)) return "";
  return s;
}

function photoSize(meta) {
  var w = +(meta && meta.width) || 0, h = +(meta && meta.height) || 0;
  var r = +(meta && meta.rotation) || 0;
  // Drive는 rotation을 '시계 방향 90도 회전 횟수'(0~3)로 주므로 1·3과 90·270을 모두 처리
  if (r === 1 || r === 3 || r === 90 || r === 270) { var t = w; w = h; h = t; }
  return { w: w, h: h };
}

function imageUrl(id, width) {
  return "https://lh3.googleusercontent.com/d/" + encodeURIComponent(id) + "=w" + width;
}

function mapPhotos(files) {
  var list = [];
  (files || []).forEach(function (f) {
    if (!f || !f.id || f.trashed) return;
    if (f.mimeType && !/^image\//.test(f.mimeType)) return;
    var size = photoSize(f.imageMediaMetadata);
    list.push({
      p: {
        id: String(f.id),
        src: imageUrl(f.id, 1600),
        thumb: imageUrl(f.id, 600),
        date: photoDate(f),
        caption: photoCaption(f),
        w: size.w,
        h: size.h
      },
      t: new Date(f.createdTime || 0).getTime() || 0,
      n: String(f.name || "")
    });
  });
  // 날짜 최신순, 같은 날짜면 올린 시각 최신순, 그다음 이름순
  list.sort(function (a, b) {
    if (a.p.date !== b.p.date) return a.p.date < b.p.date ? 1 : -1;
    if (a.t !== b.t) return b.t - a.t;
    return a.n < b.n ? -1 : a.n > b.n ? 1 : 0;
  });
  return list.map(function (x) { return x.p; });
}

async function fetchAll(folderId, key) {
  var params = {
    key: key,
    q: "'" + String(folderId).replace(/['\\]/g, "\\$&") + "' in parents and mimeType contains 'image/' and trashed = false",
    fields: FIELDS,
    pageSize: "1000",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true"
  };
  var files = [], token = "", pages = 0;
  do {
    var qs = new URLSearchParams(params);
    if (token) qs.set("pageToken", token);
    var r = await fetch("https://www.googleapis.com/drive/v3/files?" + qs.toString());
    if (!r.ok) {
      var err = new Error("Google Drive API error");
      err.status = r.status;
      throw err;
    }
    var data = await r.json();
    files = files.concat(data.files || []);
    token = data.nextPageToken || "";
    pages++;
  } while (token && pages < 10);
  return files;
}

module.exports = async function handler(req, res) {
  var key = process.env.GOOGLE_API_KEY;
  var folderId = process.env.GDRIVE_FOLDER_ID || DEFAULT_FOLDER;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!key) {
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "GOOGLE_API_KEY is not configured" }));
    return;
  }
  try {
    var files = await fetchAll(folderId, key);
    var photos = mapPhotos(files);
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");
    res.statusCode = 200;
    res.end(JSON.stringify({ photos: photos, updated: new Date().toISOString() }));
  } catch (e) {
    res.setHeader("Cache-Control", "s-maxage=30");
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Failed to load Google Drive", status: e.status || null }));
  }
};

module.exports.mapPhotos = mapPhotos;
module.exports.photoDate = photoDate;
module.exports.photoCaption = photoCaption;
module.exports.photoSize = photoSize;
module.exports.nameDate = nameDate;
