# CUDS 홈페이지 기술 스택

중앙대학교 영어토론 동아리 CUDS 홈페이지의 구성 정리 (2026년 10월 기준)

## 한 줄 요약

프레임워크나 빌드 도구 없이 **순수 HTML·CSS·자바스크립트로 만든 단일 파일(`index.html`, 약 2.3MB)** 이며, GitHub 저장소와 연결된 Vercel로 배포한다 (https://cudsweb.vercel.app/).

## 기본 구조

| 항목 | 내용 |
|---|---|
| 언어 | HTML + CSS + 바닐라 자바스크립트 |
| 프레임워크 / 빌드 | 없음 (React·Vue·npm·번들러 사용 안 함) |
| 파일 구성 | `index.html` 하나에 디자인, 동작, 이미지, 일부 폰트까지 모두 포함. 서버리스 함수 두 개: 구글 캘린더 연동 `api/calendar.js`, 구글 드라이브 갤러리 연동 `api/gallery.js` |
| 페이지 이동 | 해시 라우팅 (주소 끝 `#/study` 등을 읽어 해당 페이지만 표시, 직접 구현) |
| KO/EN 전환 | 한→영 사전 기반으로 화면 텍스트를 교체하는 방식 (직접 구현), 선택 언어는 localStorage에 저장 |

## 페이지 구성

- 홈 (`#/`): 첫 화면 → 소개 → 연혁 → KIDA → 갤러리 → 운영진 → FAQ → 카테고리 → 연락처
- 활동 (`#/activities`)
- 일정 (`#/calendar`)
- 대회 (`#/tournaments`)
- 모집 (`#/recruit`)
- 학습 자료 (`#/study`): 곡면 책장, 토론 용어·표현집
- 토론 체험 (`#/game`): 모션 룰렛, 데모 토론 (AP/BP)

## 외부 라이브러리

| 라이브러리 | 용도 | 불러오는 방식 |
|---|---|---|
| three.js r128 + GLTFLoader | 스크롤을 따라 내려오는 3D 마이크 | 페이지 로드 시 CDN에서 불러옴. 실패하면 마이크만 생략되고 나머지는 정상 작동 |

그 외 라이브러리는 사용하지 않는다.

3D 마이크 모델: Poly by Google (CC BY), 출처는 푸터에 표기.

## 폰트

**구글 폰트에서 불러오는 폰트**

League Spartan, DM Serif Display, DM Sans, Black Han Sans, Gowun Batang, Gothic A1, Jua, Anton 등

**파일 안에 직접 넣은 폰트** (필요한 글자만 잘라서 포함)

| 폰트 | 사용 위치 |
|---|---|
| 가석체 | 첫 화면 CUDS, 굵은 한글 제목 |
| 프리텐다드 | 버튼, 본문의 작은 글씨 |
| SUIT Light | "편하게 물어보세요" |
| 넥슨 Lv.1 고딕 Bold | 상단 카테고리 메뉴 |
| 에이투지체 Bold | KIDA 소개 문단 |

## 브라우저 기본 기능 활용

| 기능 | 용도 |
|---|---|
| SVG | 룰렛, 캐릭터, 아이콘, 지도 |
| IntersectionObserver | 스크롤 등장 효과, 책장 애니메이션 |
| Pointer 이벤트 | 책장 드래그, 스티커 드래그 |
| speechSynthesis | 표현집 발음 듣기 |
| localStorage | 선택한 언어(KO/EN) 기억 |

## 호스팅과 데이터

- **호스팅:** Vercel (https://cudsweb.vercel.app/). GitHub 저장소의 `main` 브랜치에 push하면 자동으로 다시 배포된다. 빌드 단계 없이 `index.html`을 그대로 서비스하고, `api/` 폴더는 서버리스 함수(Node.js)로 배포된다.
- **달력 일정:** 동아리 구글 캘린더(`cudsunlimited@gmail.com`)에서 가져온다. Vercel 서버리스 함수 `api/calendar.js`(의존성 없음, Node 내장 `fetch`)가 Google Calendar API v3 `events.list`로 지난 1년 ~ 앞으로 1년의 일정을 읽고 사이트 형식(`{id,title,date,time,type,place,desc,pdf}`)으로 바꿔 `/api/calendar`로 돌려준다. 응답은 `Cache-Control: s-maxage=600, stale-while-revalidate=86400`으로 Vercel에서 약 10분 캐시된다.
  - 분류는 제목 머리말로 정한다: `[세션]`/`[대회]`/`[행사]`/`[연합]`/`[기타]` (영문 `[session]` 등도 가능, 없으면 기타).
  - 환경 변수: `GOOGLE_API_KEY`(필수, Calendar API 사용 설정, 키 제한은 Calendar/Drive API로), `GCAL_ID`(선택, 기본 `cudsunlimited@gmail.com`). 변경 후 재배포 필요.
  - 페이지는 `index.html` 안의 `cal-data` JSON 블록을 먼저 그린 뒤 `/api/calendar` 결과로 교체한다. API 키가 없거나 오류가 나거나 `file://`로 열면 `cal-data`(기본 빈 배열)가 그대로 남는다. 즉 `cal-data`는 예비 데이터일 뿐이다.
  - 캘린더에 공개로 올린 일정은 모두 사이트에 표시되므로, 숨길 일정은 구글 캘린더에서 비공개로 설정한다 (비공개·취소 일정은 걸러냄).
- **사진 갤러리:** 동아리 구글 드라이브의 공개 폴더 `Gallery`(ID `1ePToGxtANGVHkGJ0yWgnOw9D_vUTrS3o`, 링크가 있는 모든 사용자 보기 가능)에서 가져온다. 서버리스 함수 `api/gallery.js`(의존성 없음)가 Drive API v3 `files.list`로 폴더 **바로 아래**의 이미지 파일(`mimeType contains 'image/'`, 휴지통 제외, 하위 폴더는 읽지 않음)을 페이지 단위로 모두 읽어 `{photos:[{id,src,thumb,date,caption,w,h}],updated}`(최신순)로 `/api/gallery`에서 돌려준다. 캐시·오류 처리는 달력과 같다 (성공 시 약 10분 캐시, 키 없음 500, 구글 오류 502).
  - 날짜: 파일 이름 맨 앞의 `YYYY-MM-DD`/`YYYYMMDD`(구분자 `-` `.` `_` 공백 허용) → 사진 EXIF 촬영 시각 → 드라이브에 올린 시각(서울 날짜) 순.
  - 설명: 드라이브 파일의 '설명'이 있으면 그것, 없으면 파일 이름에서 날짜·확장자를 뺀 부분(`_`는 공백으로). `IMG_1234`처럼 숫자뿐인 이름은 설명 없음.
  - 이미지 주소: `https://lh3.googleusercontent.com/d/<id>=w1600`(크게 보기), `=w600`(썸네일). 공개 공유된 파일은 API 키 없이 이 주소로 바로 보인다. 회전 정보(`rotation`)가 90°/270°면 가로·세로 크기를 바꿔 준다.
  - 환경 변수: `GOOGLE_API_KEY`(달력과 같은 키, **Drive API도 사용 설정** 필요), `GDRIVE_FOLDER_ID`(선택, 다른 폴더를 쓸 때). 변경 후 재배포 필요.
  - 화면: 사진이 1장 이상이면 홈 갤러리의 폴라로이드 4칸을 최신 사진부터 채우고(라벨 `설명 · 2026.3.12`), 누르면 사진 창(이전/다음)으로 크게 보여 준다. 5장 이상이면 '더보기'에서 전체 사진을 격자로 보여 주고, 4장 이하면 '더보기'를 숨긴다. 사진이 없거나 불러오지 못하면 기존 자리표시가 그대로 남는다. 깨진 이미지는 자리표시 색으로 대체된다. 사진 설명은 KO/EN 전환 때 번역하지 않는다(`translate="no"`).
- 예전에는 Claude 아티팩트로 게시되어 런타임 기능(`user` 편집 권한 확인, `artifact` 페이지 재게시)으로 화면에서 달력·방명록을 편집했으나, 이 의존성은 제거했다. 방명록은 방문자가 직접 남길 방법이 없어 페이지째 삭제했다.

## 도메인 이전 이후 남은 일

Claude 아티팩트에서 Vercel로 이전은 끝났다. 남은 검토 사항:

1. 제목 폰트를 210 수퍼사이즈(Adobe Fonts)로 교체할지 검토한다. Adobe Fonts는 등록한 도메인에서만 작동하므로 웹 프로젝트에 `cudsweb.vercel.app`(또는 이후 연결할 자체 도메인)을 등록한 뒤 적용한다.
