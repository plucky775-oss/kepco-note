# KEPCO 노트 독립 앱 업데이트

첨부 Android 앱 `kepco-note-v100-standalone(6).apk`를 기준으로 하는 업데이트 소스입니다. 웹앱 저장소와 분리하여 관리하며 웹 배포는 수행하지 않습니다.

## 최신 업데이트 207.4 (2026-11-12)

- 기기 동영상 삽입·암호화 저장, 위치·크기 조절과 재실행 후 저장본 재생.
- 페이지 범위 및 페이지 안 영상 순서를 지정하는 영상 출력. 영상은 순서대로 재생되며 출력 형식은 기기 지원에 따라 MP4 또는 WebM입니다.
- 원본 합계 및 출력 한도 128 MiB, 최대 30페이지·10분. JSON 노트 백업에는 동영상 원본이 포함되지 않으므로 별도로 보관하세요.
- 기존 Android 상태 표시줄·화면 잘림 영역 여백, 캘린더·다이어리·네이티브 코드와 보안 정책 유지.
- X 기능과 펜 몸체 두 번 두드리기 기능은 포함하지 않습니다. YouTube 앱 안 재생도 추가하지 않았습니다. 안전한 네이티브 브리지 수정과 실제 Android 검증이 먼저 필요합니다.

207.3과 패키지·서명 인증서가 일치하는 207.4 APK를 별도 전달했습니다. 기존 앱을 삭제하지 말고 중요한 노트를 백업한 뒤 업데이트하세요. 이 저장소에는 APK나 서명키·비밀번호를 올리지 않습니다.

검증: 영상 관련 Node 테스트 88개, JavaScript 문법 91개, 모의 DOM에서 앱 시작·MP4 저장/복호화·출력창 열기, APK v2/v3 서명과 ZIP 정렬 검사 통과. 실제 Android 설치·동영상 재생/출력·태블릿 배치는 아직 검증하지 않았습니다.

```sh
node --test tests/video/*.test.mjs
python build_video_update.py /private/path/KEPCO-note-207.3.apk --out KEPCO-note-207.4-UNSIGNED.apk
```

위 빌드는 미서명 APK만 만듭니다. 최종 ZIP 정렬 후 기존 207 개인 서명키로 서명해야 합니다. 키와 비밀번호는 저장소에 넣지 마세요. 릴리스 해시와 변경 자산 목록은 `releases/207.4/release-info.json`에 있습니다. 아래 107/207.1 절차는 과거 기준의 재생성 안내입니다.

## 반영 내용

- 선택 가능한 표지 55종, 이름 검색과 분류, 고해상도 미리보기.
- 표지 제목 크기 80~180% 조절과 페이지 추가·백업 시 유지.
- 속지 12종과 색상·장식 38종. 기존 줄·모눈·무지 좌표 유지.
- 서재 노트 메뉴, 삭제 확인과 복원 안내, 접을 수 있는 노트 목록.
- 최신 연필 질감과 도형 보정, 명화 출처 안내, 쉬운 백업 문구.
- 손가락 입력 취소 시 이미 작성한 획 보존, 포인터 추적이 풀린 경우 문서 이벤트로 이동·떼기 처리.
- 크기·위치가 그대로인 반복 화면 변경 알림으로 필기가 끝나는 문제 수정.
- 손가락 볼펜·사인펜·형광펜의 그리는 중 화면 표시를 가볍게 처리. 저장·내보내기는 전체 렌더러 사용.

## 보존한 기능

캘린더·다이어리 관련 12개 파일, 캘린더 연결 코드, Android 네이티브 코드·패키지·권한을 원본 그대로 유지합니다. 요리 기능과 요리 표지는 추가하거나 업데이트하지 않았습니다. 독립 앱의 온라인 AI·신규 녹음 제한, 네이티브 저장과 종료 전 저장도 유지합니다.

웹 소스의 기준은 `plucky775-oss/nib` 커밋 `f2877ec723b56089d19a94c30bb5d0ad92a278d4`입니다. 캘린더·요리·웹 전용 서버 연결 변경은 제외했습니다.

## 별도 설치판 207.1

새 패키지 `kr.kepconote.standalone.v207`, 표시 이름 **KEPCO 노트 독립판**으로 서명한 APK를 생성했습니다. 기존 v100/v122 앱과 함께 설치할 수 있도록 앱 ID, 자체 권한과 provider 식별자를 분리했습니다. Activity 클래스와 네이티브 DEX는 유지합니다.

Android SDK Build Tools 35의 v2·v3 서명 검증, ZIP 정렬 검사, aapt2 패키지 분석을 통과했습니다. 실제 기기 설치·터치 검증은 아직 수행하지 않았습니다. 세부 결과는 `releases/207/release-info.json`과 설치 안내를 참고하세요.

원래 107 업데이트는 기존 키가 없어 미서명 상태이며, 207은 새 키를 사용하는 별도 앱입니다. 기존 앱의 데이터를 자동으로 가져오지 않습니다. 기존 앱을 보관하고 노트·다이어리 백업으로 옮기세요.

Google 캘린더는 새 패키지와 SHA-1로 기존 Google Cloud 프로젝트에 **추가 Android OAuth 클라이언트**를 등록해야 합니다. 기존 등록을 삭제하지 마세요. 설정값은 `releases/207/KEPCO-note-207-install-guide.txt`에 있습니다. Google 등록과 기기 로그인 검증은 아직 완료되지 않았습니다.

### 재생성

원본 APK에서 107 수정본을 만든 뒤, 별도 설치용 패키지로 변환합니다. Node.js/Python 검증 절차는 아래와 같습니다.

```sh
python build_update.py 'kepco-note-v100-standalone(6).apk'
python build_parallel_apk.py KEPCO-note-107-UNSIGNED.apk KEPCO-note-207-UNALIGNED.apk
zipalign -P 16 -f 4 KEPCO-note-207-UNALIGNED.apk KEPCO-note-207-ALIGNED.apk
apksigner sign --ks /private/path/kepco-note-v207.jks --ks-key-alias kepco-note-v207 --out KEPCO-note-207.apk KEPCO-note-207-ALIGNED.apk
apksigner verify --verbose --print-certs KEPCO-note-207.apk
zipalign -c -P 16 4 KEPCO-note-207.apk
```

향후 업데이트에는 생성된 **207 전용 서명키를 계속 사용**해야 합니다. 키와 비밀번호는 별도의 개인 보관용 백업으로 제공했으며, 이 공개 저장소에는 포함하지 않습니다. 위 명령은 비밀번호를 대화형으로 입력합니다. 207 APK의 인증서 SHA-256은 `8e3f7bf8d831c60cff0d35110288196bd878c6e078a680ed9b8a5128c8135fad`입니다.

## 검증

Node.js 24 및 Python 3 환경에서 다음 명령으로 패치 무결성, 보호 파일 해시, JavaScript 문법 87개와 회귀 테스트 278개를 검사합니다.

```sh
python verify_update.py 'kepco-note-v100-standalone(6).apk'
```

278개 코드 테스트는 통과했습니다. 실제 Android 기기 설치·터치·캘린더 로그인 검증은 수행하지 못했습니다. 세부 변경 파일과 해시는 `validation.json`에서 확인할 수 있습니다.

그림·글꼴·PDF 라이브러리의 기존 출처와 라이선스를 보존합니다. 추가 명화 출처는 `update-source/licenses/masterpiece-covers.txt`에 있습니다.

