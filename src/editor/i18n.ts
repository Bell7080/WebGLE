/** 지원 언어다. 선택지는 현재 UI와 무관하게 각 언어의 자칭으로 표시한다. */
export const LANGUAGES = [
  { code: "ko", name: "한국어" }, { code: "en", name: "English" },
  { code: "zh-CN", name: "简体中文" }, { code: "zh-TW", name: "繁體中文" },
  { code: "ja", name: "日本語" }, { code: "es", name: "Español" },
  { code: "fr", name: "Français" }, { code: "de", name: "Deutsch" },
  { code: "pt-BR", name: "Português (Brasil)" }, { code: "ru", name: "Русский" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];
const STORAGE_KEY = "puppetforge-language";

/** 한국어 원문 뒤에 언어 목록과 같은 순서(한국어 제외)로 실제 번역을 둔다. */

/**
 * 긴 설명은 영어 원문을 별도 표로 둔다. UI 데이터의 한국어 설명을 그대로 키로 사용하므로
 * 태그·프리셋 모델을 번역 때문에 바꾸지 않으면서 영어 화면에 한국어가 새는 일을 막는다.
 */
const englishRows: Record<string, string> = {
  "최소": "Minimum", "낮음": "Low", "보통": "Medium", "높음": "High", "전체 보기": "Show all",
  "중심 · 구조": "Core & structure", "팔다리": "Limbs", "부속": "Appendages", "얼굴": "Face", "역할": "Roles", "움직임 성격": "Motion style", "위치 구분": "Position",
  "기본": "Basic", "이동": "Movement", "반응": "Reactions", "공격": "Attacks",
  "대기": "Idle", "걷기": "Walk", "피격": "Hit", "사망": "Death", "점프": "Jump", "포효": "Roar", "달리기": "Run", "비행": "Fly", "헤엄": "Swim", "방어": "Guard", "회피": "Dodge", "기절": "Stun", "승리": "Victory", "물기": "Bite", "할퀴기": "Scratch", "휘두르기": "Swing", "찌르기": "Stab", "몸통박치기": "Slam", "캐스팅": "Cast", "돌진": "Charge", "회전 베기": "Spin attack", "내려찍기": "Stomp",
  "숨쉬듯 미세하게 흔들린다": "Sways subtly as if breathing.",
  "위아래로 튀며 팔다리를 번갈아 흔든다": "Bounces up and down while alternating the limbs.",
  "뒤로 튕기며 몸이 눌리고 머리가 반동한다": "Recoils backward; the body compresses and the head follows through.",
  "무릎이 꺾이고 몸이 옆으로 쓰러진다. 바닥에 닿은 뒤 머리가 늦게 떨어지고 눈을 감는다": "The knees buckle and the body falls sideways; the head drops later and the eyes close.",
  "웅크렸다 도약하고 착지에서 눌린다": "Crouches, leaps, and compresses on landing.",
  "웅크렸다가 몸을 부풀리고 고개를 젖혀 포효한다": "Crouches, expands the body, and throws the head back to roar.",
  "앞으로 기운 자세로 크게 내딛는다. 걷기보다 빠르고 보폭이 크다": "Takes long strides while leaning forward; faster and broader than walking.",
  "날개를 치며 떠 있는다. 날개가 내려갈 때 몸이 떠오른다": "Hovers by flapping; the body rises on each downstroke.",
  "몸 전체를 훑고 지나가는 물결. 꼬리 · 지느러미 · 촉수가 순서대로 흐른다": "A wave travels through the body, then the tail, fins, and tentacles in sequence.",
  "몸을 낮추고 앞을 막은 채 버틴다. 방패가 있으면 방패를 세운다": "Lowers the body and braces forward, raising a shield when present.",
  "뒤로 확 빠졌다가 제자리로 돌아온다. 아주 짧다": "Darts backward and quickly returns to the starting point.",
  "제어를 잃고 느리게 휘청인다. 머리가 크게 흔들리고 눈이 반쯤 감긴다": "Staggers slowly; the head sways widely and the eyes half-close.",
  "튀어 오르며 팔을 들어 올린다": "Jumps up and raises the arms.",
  "뒤로 당겼다가 한 번 크게 앞으로 내지른다. 어떤 캐릭터에나 무난하다": "Pulls back, then thrusts forward once; suitable for most characters.",
  "머리째 달려들어 턱을 닫는다. 거미 · 늑대처럼 무는 몬스터용": "Lunges head-first and snaps the jaw shut; suited to biting creatures.",
  "제자리에서 발톱으로 짧게 두 번 긁어내린다. 몸이 앞으로 나가는 공격과 다르다": "Scratches downward twice without lunging the whole body.",
  "크게 젖혔다가 호를 그리며 후려친다. 검 든 캐릭터용": "Draws far back, then strikes in an arc; suited to sword users.",
  "짧게 당겼다가 곧게 내지른다. 창 · 집게처럼 뾰족한 무기용": "Pulls back briefly, then thrusts straight; suited to spears and pincers.",
  "몸 전체로 부딪친다. 팔다리가 없는 슬라임에게도 통한다": "Slams with the whole body; also works for limbless creatures.",
  "팔을 들어 힘을 모았다 내린다": "Raises the arms to gather power, then lowers them.",
  "팔이 아니라 몸 전체가 앞으로 튀어 나간다. 되돌아오지 않고 그 자리에 선다": "Launches the whole body forward and remains at the destination.",
  "제자리에서 한 바퀴 돌며 휘두른다. 사방을 한 번에 치는 동작": "Spins once while swinging to strike in every direction.",
  "위로 크게 들었다가 아래로 내리꽂는다. 착지에서 몸이 눌린다": "Raises high, slams downward, and compresses on impact.",
};

/**
 * 태그 설명은 id가 변하지 않는 공개 데이터이므로 영어 설명을 id에 연결한다.
 * 한국어 설명 문장을 고쳐도 영어 툴팁 연결이 조용히 끊어지지 않게 하기 위한 별도 키다.
 */
const englishTagDescriptions: Record<string, string> = {
  root: "The character's global anchor, moved by idle bobbing and jump takeoff or landing.",
  core: "The body center used for breathing, squash, and hit recoil.",
  body: "Marks the torso mass; motions targeting the whole torso use this tag.",
  spine: "The waist or spine connecting the core and head during bends and roars.",
  hip: "The pelvis and lower-body origin that carries weight while walking and landing.",
  neck: "A buffer between head and torso that shares part of the head rotation.",
  arm: "An arm targeted by attack and idle arm-swing motions.",
  hand: "A hand that follows the arm with a slight delay; add weapon when it holds one.",
  leg: "A leg that bends and extends during walking and jumping.",
  foot: "The landing contact; use position lock to keep it planted.",
  claw: "A claw or talon used as the strongest endpoint of scratch motions.",
  finger: "A finger endpoint that opens and closes in attacks; optional for most motions.",
  tail: "A tail that trails behind the body.", wing: "A wing targeted by flapping and gliding motions.",
  tentacle: "A tentacle that undulates slowly as if underwater.", hair: "Hair or a mane that sways with inertia.",
  ear: "An ear that perks slightly or follows with a delay.", horn: "A horn that moves rigidly with the head.",
  fin: "A fin that moves in a wave.", cloth: "Cloth, a cape, or a hem that trails and flutters.",
  antenna: "An antenna that trembles very lightly.",
  head: "A head that tilts in idle and recoils on hit; every tagged head moves.",
  eye: "An eye that blinks in idle and squints on hit.", mouth: "A mouth or jaw opened by bite and roar motions.",
  jaw: "The lower jaw opened by bite and roar motions; omit it when the jaw is not separate.",
  attack: "A striking part pushed forward by motions such as stab and scratch.",
  weapon: "A weapon or tool; rigid deformation usually preserves its shape best.",
  shield: "A shield or blocking part held in front of the body during attacks.",
  prop: "A held prop that follows the hand during attacks; rigid deformation is recommended.",
  decoration: "A decoration that follows the body with a small stagger during idle.",
  ground: "A contact marker only; it creates no motion. Use position lock to plant it.",
  secondary: "A trailing part that follows its parent one beat later with inertia.",
  float: "Adds a slow vertical floating feel for ghosts and hovering creatures.",
  heavy: "Reduces all motion on this bone to 0.55×; it modifies motion rather than selecting a target.",
  light: "Increases all motion on this bone to 1.6× for light parts such as hair or cloth.",
  bounce: "Increases all motion on this bone to 1.35× for elastic parts such as slime.",
  stiff: "Reduces all motion on this bone to 0.2× for nearly rigid parts such as armor or horns.",
  front: "Marks the front side, which leads during movement when paired with back.",
  back: "Marks the rear side, moving opposite front for a natural gait.",
  upper: "Marks an upper part that swings more strongly in attacks.",
  lower: "Marks a lower part that assists more subtly than upper.",
};

/**
 * 실행 중 값이 끼어드는 카탈로그 문장 틀이다. 한국어 완성 문장을 사전에서 찾지 않고
 * 각 언어의 어순으로 직접 조립해 모든 지원 언어에서 한국어가 남지 않게 한다.
 */
const catalogTemplates: Record<Exclude<LanguageCode, "ko">, {
  tagTrack: string; tagModifier: string; tagHint: string; preset: string;
  everyAnimation: string; usedBy: string; unused: string;
  loop: string; once: string; tracks: string; alreadyAdded: string; tagsUsed: string;
}> = {
  en: { tagTrack: "Animation presets use this tag to find and move this part.", tagModifier: "This tag changes how strongly this bone moves.", tagHint: "Display-only tag; it does not create motion.", preset: "Built-in animation preset: {name}.", everyAnimation: "This bone's motion is multiplied by {value}× in every animation.", usedBy: "Animations using this tag: {value}", unused: "No built-in animation uses this tag yet.", loop: "Loop", once: "Once", tracks: "tracks", alreadyAdded: "Already added — adding again creates a copy", tagsUsed: "Tags used" },
  "zh-CN": { tagTrack: "动画预设使用此标签查找并移动该部位。", tagModifier: "此标签会调整该骨骼的运动幅度。", tagHint: "仅用于标记；不会产生运动。", preset: "内置动画预设：{name}。", everyAnimation: "在所有动画中，此骨骼的运动乘以 {value} 倍。", usedBy: "使用此标签的动画：{value}", unused: "目前没有内置动画使用此标签。", loop: "循环", once: "一次", tracks: "轨道", alreadyAdded: "已添加 — 再次添加会创建副本", tagsUsed: "使用的标签" },
  "zh-TW": { tagTrack: "動畫預設使用此標籤尋找並移動此部位。", tagModifier: "此標籤會調整此骨骼的動作幅度。", tagHint: "僅供標示；不會產生動作。", preset: "內建動畫預設：{name}。", everyAnimation: "在所有動畫中，此骨骼的動作乘以 {value} 倍。", usedBy: "使用此標籤的動畫：{value}", unused: "目前沒有內建動畫使用此標籤。", loop: "循環", once: "一次", tracks: "軌道", alreadyAdded: "已加入 — 再次加入會建立副本", tagsUsed: "使用的標籤" },
  ja: { tagTrack: "アニメーションプリセットがこのタグを使って部位を見つけ、動かします。", tagModifier: "このタグはボーンの動きの強さを調整します。", tagHint: "表示専用タグで、動きは作りません。", preset: "内蔵アニメーションプリセット: {name}。", everyAnimation: "すべてのアニメーションで、このボーンの動きが {value} 倍になります。", usedBy: "このタグを使うアニメーション: {value}", unused: "このタグを使う内蔵アニメーションはまだありません。", loop: "ループ", once: "1回", tracks: "トラック", alreadyAdded: "追加済み — もう一度追加するとコピーを作成", tagsUsed: "使用タグ" },
  es: { tagTrack: "Los preajustes usan esta etiqueta para encontrar y mover esta parte.", tagModifier: "Esta etiqueta ajusta la intensidad del movimiento del hueso.", tagHint: "Etiqueta solo informativa; no crea movimiento.", preset: "Preajuste de animación integrado: {name}.", everyAnimation: "El movimiento de este hueso se multiplica por {value} en todas las animaciones.", usedBy: "Animaciones que usan esta etiqueta: {value}", unused: "Ninguna animación integrada usa aún esta etiqueta.", loop: "Bucle", once: "Una vez", tracks: "pistas", alreadyAdded: "Ya añadida — añadirla de nuevo crea una copia", tagsUsed: "Etiquetas usadas" },
  fr: { tagTrack: "Les préréglages utilisent ce tag pour trouver et déplacer cette partie.", tagModifier: "Ce tag ajuste l'intensité du mouvement de l'os.", tagHint: "Tag informatif uniquement ; il ne crée aucun mouvement.", preset: "Préréglage d'animation intégré : {name}.", everyAnimation: "Le mouvement de cet os est multiplié par {value} dans toutes les animations.", usedBy: "Animations utilisant ce tag : {value}", unused: "Aucune animation intégrée n'utilise encore ce tag.", loop: "Boucle", once: "Une fois", tracks: "pistes", alreadyAdded: "Déjà ajoutée — un nouvel ajout crée une copie", tagsUsed: "Tags utilisés" },
  de: { tagTrack: "Animationsvorlagen finden und bewegen dieses Teil anhand dieses Tags.", tagModifier: "Dieses Tag passt die Bewegungsstärke des Knochens an.", tagHint: "Nur zur Kennzeichnung; erzeugt keine Bewegung.", preset: "Integrierte Animationsvorlage: {name}.", everyAnimation: "Die Bewegung dieses Knochens wird in allen Animationen mit {value} multipliziert.", usedBy: "Animationen mit diesem Tag: {value}", unused: "Noch keine integrierte Animation verwendet dieses Tag.", loop: "Schleife", once: "Einmal", tracks: "Spuren", alreadyAdded: "Bereits hinzugefügt — erneutes Hinzufügen erstellt eine Kopie", tagsUsed: "Verwendete Tags" },
  "pt-BR": { tagTrack: "As predefinições usam esta tag para encontrar e mover esta parte.", tagModifier: "Esta tag ajusta a intensidade do movimento do osso.", tagHint: "Tag apenas informativa; não cria movimento.", preset: "Predefinição de animação integrada: {name}.", everyAnimation: "O movimento deste osso é multiplicado por {value} em todas as animações.", usedBy: "Animações que usam esta tag: {value}", unused: "Nenhuma animação integrada usa esta tag ainda.", loop: "Repetir", once: "Uma vez", tracks: "trilhas", alreadyAdded: "Já adicionada — adicionar novamente cria uma cópia", tagsUsed: "Tags usadas" },
  ru: { tagTrack: "Пресеты используют этот тег, чтобы найти и двигать эту часть.", tagModifier: "Этот тег регулирует силу движения кости.", tagHint: "Информационный тег; он не создаёт движения.", preset: "Встроенный пресет анимации: {name}.", everyAnimation: "Движение этой кости умножается на {value} во всех анимациях.", usedBy: "Анимации с этим тегом: {value}", unused: "Встроенные анимации пока не используют этот тег.", loop: "Цикл", once: "Один раз", tracks: "треков", alreadyAdded: "Уже добавлено — повторное добавление создаст копию", tagsUsed: "Используемые теги" },
};

/** 문장 틀의 이름표를 실제 값으로 바꾸는 작은 포매터다. */
function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

const rows: Record<string, readonly string[]> = {
  "파일": ["File", "文件", "檔案", "ファイル", "Archivo", "Fichier", "Datei", "Arquivo", "Файл"],
  "설정": ["Settings", "设置", "設定", "設定", "Ajustes", "Paramètres", "Einstellungen", "Configurações", "Настройки"],
  "언어": ["Language", "语言", "語言", "言語", "Idioma", "Langue", "Sprache", "Idioma", "Язык"],
  "관절": ["Bones", "骨骼", "骨骼", "ボーン", "Huesos", "Os", "Knochen", "Ossos", "Кости"],
  "속성": ["Properties", "属性", "屬性", "プロパティ", "Propiedades", "Propriétés", "Eigenschaften", "Propriedades", "Свойства"],
  "추가": ["Add", "添加", "新增", "追加", "Añadir", "Ajouter", "Hinzufügen", "Adicionar", "Добавить"],
  "실행 취소": ["Undo", "撤销", "復原", "元に戻す", "Deshacer", "Annuler", "Rückgängig", "Desfazer", "Отменить"],
  "다시 실행": ["Redo", "重做", "重做", "やり直す", "Rehacer", "Rétablir", "Wiederholen", "Refazer", "Повторить"],
  "재생": ["Play", "播放", "播放", "再生", "Reproducir", "Lire", "Abspielen", "Reproduzir", "Воспроизвести"],
  "정지": ["Stop", "停止", "停止", "停止", "Detener", "Arrêter", "Stopp", "Parar", "Стоп"],
  "준비됨": ["Ready", "就绪", "就緒", "準備完了", "Listo", "Prêt", "Bereit", "Pronto", "Готово"],
  "이름": ["Name", "名称", "名稱", "名前", "Nombre", "Nom", "Name", "Nome", "Имя"],
  "그림": ["Image", "图像", "圖像", "画像", "Imagen", "Image", "Bild", "Imagem", "Изображение"],
  "일반": ["Smooth", "普通", "一般", "通常", "Suave", "Lisse", "Normal", "Suave", "Обычный"],
  "도트": ["Pixel art", "像素画", "像素畫", "ドット絵", "Pixel art", "Pixel art", "Pixelart", "Pixel art", "Пиксель-арт"],
  "격자": ["Mesh", "网格", "網格", "メッシュ", "Malla", "Maillage", "Gitter", "Malha", "Сетка"],
  "좌우 뒤집기": ["Flip horizontally", "水平翻转", "水平翻轉", "左右反転", "Voltear horizontalmente", "Retourner horizontalement", "Horizontal spiegeln", "Inverter horizontalmente", "Отразить по горизонтали"],
  "새 프로젝트": ["New project", "新建项目", "新增專案", "新規プロジェクト", "Nuevo proyecto", "Nouveau projet", "Neues Projekt", "Novo projeto", "Новый проект"],
  "이미지 불러오기": ["Import image", "导入图像", "匯入圖像", "画像を読み込む", "Importar imagen", "Importer une image", "Bild importieren", "Importar imagem", "Импорт изображения"],
  "프로젝트 열기": ["Open project", "打开项目", "開啟專案", "プロジェクトを開く", "Abrir proyecto", "Ouvrir le projet", "Projekt öffnen", "Abrir projeto", "Открыть проект"],
  "프로젝트 저장": ["Save project", "保存项目", "儲存專案", "プロジェクトを保存", "Guardar proyecto", "Enregistrer le projet", "Projekt speichern", "Salvar projeto", "Сохранить проект"],
  "내보내기": ["Export", "导出", "匯出", "書き出し", "Exportar", "Exporter", "Exportieren", "Exportar", "Экспорт"],
  "스프라이트 시트로 굽기": ["Bake sprite sheet", "生成精灵图", "產生精靈圖", "スプライトシートを書き出す", "Generar hoja de sprites", "Générer la planche de sprites", "Spritesheet erstellen", "Gerar folha de sprites", "Создать лист спрайтов"],
  "파일 준비가 끝났습니다. 아래 버튼을 눌러 저장할 앱을 고르세요.": ["Your files are ready. Tap below to choose where to save them.", "文件已准备好。点击下方按钮选择保存位置。", "檔案已準備好。點按下方按鈕選擇儲存位置。", "ファイルの準備ができました。下のボタンを押して保存先を選んでください。", "Los archivos están listos. Toca abajo para elegir dónde guardarlos.", "Vos fichiers sont prêts. Touchez ci-dessous pour choisir où les enregistrer.", "Die Dateien sind bereit. Tippe unten, um einen Speicherort auszuwählen.", "Os arquivos estão prontos. Toque abaixo para escolher onde salvá-los.", "Файлы готовы. Нажмите кнопку ниже и выберите, куда их сохранить."],
  "저장 / 공유": ["Save / Share", "保存 / 分享", "儲存 / 分享", "保存 / 共有", "Guardar / Compartir", "Enregistrer / Partager", "Speichern / Teilen", "Salvar / Compartilhar", "Сохранить / Поделиться"],
  "이미지를 불러오면 설정할 수 있습니다.": ["Load an image to edit its settings.", "加载图像后即可编辑设置。", "載入圖像後即可編輯設定。", "画像を読み込むと設定できます。", "Carga una imagen para editar sus ajustes.", "Chargez une image pour modifier ses paramètres.", "Lade ein Bild, um die Einstellungen zu bearbeiten.", "Carregue uma imagem para editar as configurações.", "Загрузите изображение, чтобы изменить настройки."],
  "이미지를 불러온 뒤 관절을 추가하세요.": ["Load an image, then add bones.", "加载图像后添加骨骼。", "載入圖像後新增骨骼。", "画像を読み込んでボーンを追加してください。", "Carga una imagen y añade huesos.", "Chargez une image, puis ajoutez des os.", "Lade ein Bild und füge dann Knochen hinzu.", "Carregue uma imagem e adicione ossos.", "Загрузите изображение, затем добавьте кости."],
  "선택된 관절이 없습니다.": ["No bone selected.", "未选择骨骼。", "未選取骨骼。", "ボーンが選択されていません。", "No hay ningún hueso seleccionado.", "Aucun os sélectionné.", "Kein Knochen ausgewählt.", "Nenhum osso selecionado.", "Кость не выбрана."],
  "PNG 이미지를 여기에 끌어다 놓으세요": ["Drop a PNG image here", "将 PNG 图像拖放到此处", "將 PNG 圖像拖放到此處", "PNG画像をここにドロップ", "Suelta una imagen PNG aquí", "Déposez une image PNG ici", "PNG-Bild hier ablegen", "Solte uma imagem PNG aqui", "Перетащите PNG сюда"],
  "눌러서 갤러리에서 사진 고르기": ["Tap to choose from your gallery", "点击从图库中选择", "點按從圖庫中選取", "タップして画像を選択", "Toca para elegir de la galería", "Touchez pour choisir dans la galerie", "Tippen, um ein Bild auszuwählen", "Toque para escolher da galeria", "Нажмите, чтобы выбрать из галереи"],
  "PNG · WebP · 투명 배경 권장": ["PNG · WebP · Transparent background recommended", "PNG · WebP · 建议透明背景", "PNG · WebP · 建議透明背景", "PNG · WebP · 透過背景推奨", "PNG · WebP · Fondo transparente recomendado", "PNG · WebP · Fond transparent recommandé", "PNG · WebP · Transparenter Hintergrund empfohlen", "PNG · WebP · Fundo transparente recomendado", "PNG · WebP · Рекомендуется прозрачный фон"],
  "처음으로": ["Go to start", "返回开始", "回到開始", "最初へ", "Ir al inicio", "Aller au début", "Zum Anfang", "Ir ao início", "В начало"],
  "재생 헤드를 0초로 되돌립니다.": ["Moves the playhead back to 0 seconds.", "将播放头移回 0 秒。", "將播放頭移回 0 秒。", "再生ヘッドを 0 秒に戻します。", "Devuelve el cabezal de reproducción a 0 segundos.", "Ramène la tête de lecture à 0 seconde.", "Setzt den Abspielkopf auf 0 Sekunden zurück.", "Retorna o cursor de reprodução para 0 segundos.", "Возвращает курсор воспроизведения к 0 секундам."],
  "단축키 Home": ["Shortcut: Home", "快捷键：Home", "快速鍵：Home", "ショートカット: Home", "Atajo: Home", "Raccourci : Home", "Tastenkürzel: Home", "Atalho: Home", "Клавиша: Home"],
  "재생 / 일시정지": ["Play / Pause", "播放 / 暂停", "播放 / 暫停", "再生 / 一時停止", "Reproducir / Pausar", "Lire / Pause", "Abspielen / Pause", "Reproduzir / Pausar", "Воспроизвести / Пауза"],
  "일시정지는 자세를 그대로 둔 채 시간만 멈춥니다. 그 자리에서 이어서 재생됩니다.": ["Pause stops only time while keeping the pose, then resumes from the same point.", "暂停会保持姿势并只停止时间，之后从原位继续播放。", "暫停會保持姿勢並只停止時間，之後從原位繼續播放。", "一時停止はポーズを保ったまま時間だけを止め、その位置から再開します。", "La pausa detiene solo el tiempo, conserva la pose y continúa desde el mismo punto.", "La pause arrête uniquement le temps, conserve la pose et reprend au même point.", "Pause hält nur die Zeit an, behält die Pose bei und setzt an derselben Stelle fort.", "A pausa interrompe apenas o tempo, mantém a pose e continua do mesmo ponto.", "Пауза останавливает только время, сохраняя позу, и продолжает с той же точки."],
  "단축키 Space · 한 프레임씩은 ← →": ["Shortcut: Space · Frame step: ← →", "快捷键：Space · 逐帧：← →", "快速鍵：Space · 逐幀：← →", "ショートカット: Space · 1フレーム移動: ← →", "Atajo: Space · Fotograma a fotograma: ← →", "Raccourci : Space · Image par image : ← →", "Tastenkürzel: Space · Einzelbild: ← →", "Atalho: Space · Quadro a quadro: ← →", "Клавиша: Space · По кадрам: ← →"],
  "시간 축": ["Timeline", "时间轴", "時間軸", "タイムライン", "Línea de tiempo", "Chronologie", "Zeitleiste", "Linha do tempo", "Шкала времени"],
  "눌러서 그 시점으로 옮기고, 끌어서 훑어봅니다. 마름모는 키가 찍힌 시각입니다.": ["Click to move to that time, or drag to scrub. Diamonds mark key times.", "单击可移到该时间，拖动可浏览。菱形标记关键帧时间。", "點按可移到該時間，拖曳可瀏覽。菱形標記關鍵幀時間。", "押すとその時刻へ移動し、ドラッグでスクラブします。ひし形はキーの時刻です。", "Haz clic para ir a ese momento o arrastra para recorrer. Los rombos marcan los fotogramas clave.", "Cliquez pour atteindre cet instant ou faites glisser pour parcourir. Les losanges indiquent les images clés.", "Klicken Sie zum Springen oder ziehen Sie zum Durchlaufen. Rauten markieren Schlüsselzeiten.", "Clique para ir até esse instante ou arraste para percorrer. Os losangos marcam quadros-chave.", "Нажмите, чтобы перейти к этому моменту, или перетащите для просмотра. Ромбы обозначают ключевые моменты."],
  "옮기는 동안에는 애니메이션 이벤트가 울리지 않습니다": ["Animation events do not fire while scrubbing.", "浏览时不会触发动画事件。", "瀏覽時不會觸發動畫事件。", "スクラブ中はアニメーションイベントが発生しません。", "Los eventos de animación no se activan al recorrer.", "Les événements d'animation ne se déclenchent pas pendant le parcours.", "Beim Durchlaufen werden keine Animationsereignisse ausgelöst.", "Eventos de animação não disparam durante a navegação.", "При прокрутке события анимации не срабатывают."],
  "기본 키": ["Base key", "基础关键帧", "基礎關鍵幀", "基本キー", "Clave base", "Clé de base", "Basis-Key", "Quadro base", "Базовый ключ"],
  "키 삭제": ["Delete key", "删除关键帧", "刪除關鍵幀", "キー削除", "Eliminar clave", "Supprimer la clé", "Key löschen", "Excluir quadro", "Удалить ключ"],
  "기본 키 찍기": ["Add base key", "添加基础关键帧", "新增基礎關鍵幀", "基本キーを追加", "Añadir clave base", "Ajouter une clé de base", "Basis-Key setzen", "Adicionar quadro base", "Добавить базовый ключ"],
  "고른 관절의 움직이지 않은 자세를 현재 시각에 기록합니다.": ["Records the selected bone's unmoved pose at the current time.", "在当前时间记录所选骨骼的未移动姿势。", "在目前時間記錄所選骨骼的未移動姿勢。", "選択したボーンの動いていない姿勢を現在時刻に記録します。", "Registra la pose inmóvil del hueso seleccionado en el momento actual.", "Enregistre la pose immobile de l’os sélectionné à l’instant actuel.", "Speichert die unbewegte Pose des gewählten Knochens an der aktuellen Zeit.", "Registra a pose imóvel do osso selecionado no instante atual.", "Записывает неподвижную позу выбранной кости в текущий момент."],
  "처음 키를 만들면 0초와 끝에도 원본 자세를 보호 키로 추가합니다.": ["The first key also adds original-pose guard keys at 0 and the end.", "创建第一个关键帧时，还会在 0 秒和末尾添加原始姿势保护帧。", "建立第一個關鍵幀時，也會在 0 秒和結尾新增原始姿勢保護幀。", "最初のキー作成時、0秒と末尾にも元の姿勢の保護キーを追加します。", "La primera clave también añade claves de protección con la pose original al inicio y al final.", "La première clé ajoute aussi des clés de protection de la pose d’origine au début et à la fin.", "Beim ersten Key werden am Anfang und Ende Schutz-Keys der Originalpose ergänzt.", "O primeiro quadro também adiciona quadros de proteção da pose original no início e no fim.", "Первый ключ также добавляет защитные ключи исходной позы в начале и конце."],
  "현재 키 삭제": ["Delete current key", "删除当前关键帧", "刪除目前關鍵幀", "現在のキーを削除", "Eliminar clave actual", "Supprimer la clé actuelle", "Aktuellen Key löschen", "Excluir quadro atual", "Удалить текущий ключ"],
  "고른 관절에서 재생 헤드가 가리키는 직접 만든 키를 모두 지웁니다.": ["Deletes all user-made keys for the selected bone at the playhead.", "删除播放头处所选骨骼的全部自建关键帧。", "刪除播放頭處所選骨骼的全部自建關鍵幀。", "再生ヘッド位置にある選択ボーンの手動キーをすべて削除します。", "Elimina todas las claves creadas por el usuario del hueso seleccionado en el cabezal.", "Supprime toutes les clés manuelles de l’os sélectionné à la tête de lecture.", "Löscht alle eigenen Keys des gewählten Knochens am Abspielkopf.", "Exclui todos os quadros manuais do osso selecionado no cursor.", "Удаляет все пользовательские ключи выбранной кости на курсоре."],
  "모바일에서는 이 버튼을, 마우스에서는 우클릭도 사용할 수 있습니다.": ["Use this button on mobile; a mouse can also right-click.", "移动设备请使用此按钮；鼠标也可右键单击。", "行動裝置請使用此按鈕；滑鼠也可按右鍵。", "モバイルではこのボタン、マウスでは右クリックも使えます。", "En móvil usa este botón; con ratón también puedes hacer clic derecho.", "Sur mobile, utilisez ce bouton ; avec une souris, le clic droit fonctionne aussi.", "Mobil diese Schaltfläche verwenden; mit der Maus geht auch Rechtsklick.", "No celular, use este botão; com mouse, também é possível clicar com o botão direito.", "На мобильном используйте эту кнопку; мышью также можно щёлкнуть правой кнопкой."],
  // 동적으로 생성되는 버튼과 툴팁도 고정 HTML과 동일한 번역 경로를 통과한다.
  "애니메이션 없음": ["No animations", "暂无动画", "尚無動畫", "アニメーションなし", "Sin animaciones", "Aucune animation", "Keine Animationen", "Sem animações", "Нет анимаций"],
  "애니메이션 추가": ["Add animation", "添加动画", "新增動畫", "アニメーションを追加", "Añadir animación", "Ajouter une animation", "Animation hinzufügen", "Adicionar animação", "Добавить анимацию"],
  "닫기": ["Close", "关闭", "關閉", "閉じる", "Cerrar", "Fermer", "Schließen", "Fechar", "Закрыть"],
  "되돌리기": ["Reset", "重置", "重設", "リセット", "Restablecer", "Réinitialiser", "Zurücksetzen", "Redefinir", "Сбросить"],
  "길이": ["Duration", "时长", "時長", "長さ", "Duración", "Durée", "Dauer", "Duração", "Длительность"],
  "속도": ["Speed", "速度", "速度", "速度", "Velocidad", "Vitesse", "Geschwindigkeit", "Velocidade", "Скорость"],
  "강도": ["Strength", "强度", "強度", "強さ", "Intensidad", "Intensité", "Stärke", "Intensidade", "Сила"],
  "흔들림": ["Secondary motion", "次级运动", "次要動態", "揺れ", "Movimiento secundario", "Mouvement secondaire", "Sekundärbewegung", "Movimento secundário", "Вторичное движение"],
  "영향 영역": ["Influence area", "影响区域", "影響區域", "影響領域", "Área de influencia", "Zone d’influence", "Einflussbereich", "Área de influência", "Область влияния"],
  "재생 중에는 관절 크기를 바꿀 수 없습니다. 일시정지한 뒤 바꾸세요.": ["Bone scale cannot be changed during playback. Pause first.", "播放期间无法调整骨骼缩放。请先暂停。", "播放期間無法調整骨骼縮放。請先暫停。", "再生中はボーンの拡大縮小を変更できません。一時停止してください。", "No se puede cambiar la escala del hueso durante la reproducción. Pausa primero.", "L’échelle de l’os ne peut pas être modifiée pendant la lecture. Mettez d’abord en pause.", "Die Skalierung des Knochens kann während der Wiedergabe nicht geändert werden. Zuerst pausieren.", "A escala do osso não pode ser alterada durante a reprodução. Pause primeiro.", "Масштаб кости нельзя менять во время воспроизведения. Сначала поставьте на паузу."],
  "크기를 바꿨습니다.": ["Scale changed.", "已调整缩放。", "已調整縮放。", "拡大縮小を変更しました。", "Escala cambiada.", "Échelle modifiée.", "Skalierung geändert.", "Escala alterada.", "Масштаб изменён."],
  "칠하기": ["Paint", "绘制", "繪製", "塗る", "Pintar", "Peindre", "Malen", "Pintar", "Рисовать"],
  "지우개": ["Eraser", "橡皮擦", "橡皮擦", "消しゴム", "Borrador", "Gomme", "Radierer", "Borracha", "Ластик"],
  "모두 채우기": ["Fill all", "全部填充", "全部填滿", "すべて塗る", "Rellenar todo", "Tout remplir", "Alles füllen", "Preencher tudo", "Заполнить всё"],
  "정리": ["Clean up", "清理", "整理", "整理", "Limpiar", "Nettoyer", "Bereinigen", "Limpar", "Очистить"],
  "보정 강도": ["Correction strength", "修正强度", "修正強度", "補正強度", "Intensidad de corrección", "Intensité de correction", "Korrekturstärke", "Intensidade da correção", "Сила коррекции"],
  "약하게": ["Light", "弱", "弱", "弱", "Suave", "Faible", "Leicht", "Leve", "Слабо"],
  "강하게": ["Strong", "强", "強", "強", "Fuerte", "Forte", "Stark", "Forte", "Сильно"],
  "모든 관절의 영향 영역을 채웁니다. 정말 진행할까요?": ["This fills influence areas for every bone. Continue?", "这将填充所有骨骼的影响区域。是否继续？", "這將填滿所有骨骼的影響區域。是否繼續？", "すべてのボーンの影響領域を塗ります。続行しますか？", "Esto rellenará las áreas de influencia de todos los huesos. ¿Continuar?", "Cette action remplit les zones d’influence de tous les os. Continuer ?", "Dadurch werden die Einflussbereiche aller Knochen gefüllt. Fortfahren?", "Isso preencherá as áreas de influência de todos os ossos. Continuar?", "Будут заполнены области влияния всех костей. Продолжить?"],
  "모든 관절의 영향 영역을 정리합니다. 정말 진행할까요?": ["This cleans influence areas for every bone. Continue?", "这将清理所有骨骼的影响区域。是否继续？", "這將整理所有骨骼的影響區域。是否繼續？", "すべてのボーンの影響領域を整理します。続行しますか？", "Esto limpiará las áreas de influencia de todos los huesos. ¿Continuar?", "Cette action nettoie les zones d’influence de tous les os. Continuer ?", "Dadurch werden die Einflussbereiche aller Knochen bereinigt. Fortfahren?", "Isso limpará as áreas de influência de todos os ossos. Continuar?", "Будут очищены области влияния всех костей. Продолжить?"],
  "현재 관절과 가중치를 기준으로 그림의 모든 빈 영역을 채웁니다.": ["Fills every empty part of the artwork using the current bones and weights.", "根据当前骨骼和权重填充图像中的所有空白区域。", "依目前骨骼與權重填滿圖像中的所有空白區域。", "現在のボーンとウェイトを基に、絵の空き領域をすべて塗ります。", "Rellena todas las zonas vacías de la ilustración según los huesos y pesos actuales.", "Remplit toutes les zones vides de l’illustration selon les os et poids actuels.", "Füllt alle leeren Bildbereiche anhand der aktuellen Knochen und Gewichte.", "Preenche todas as áreas vazias da ilustração com base nos ossos e pesos atuais.", "Заполняет все пустые области рисунка на основе текущих костей и весов."],
  "고립된 작은 자국과 희미한 잔여 영역을 지우고 빈 곳을 메웁니다.": ["Removes isolated specks and faint remnants, then fills any gaps.", "移除孤立的小点和微弱残留，并填补空隙。", "移除孤立小點與微弱殘留，並填補空隙。", "孤立した小さな跡と薄い残りを消し、空きを埋めます。", "Elimina manchas aisladas y restos tenues, y después rellena los huecos.", "Supprime les taches isolées et résidus faibles, puis comble les vides.", "Entfernt vereinzelte Flecken und schwache Reste und füllt danach Lücken.", "Remove manchas isoladas e resíduos fracos e depois preenche as lacunas.", "Удаляет одиночные пятна и слабые остатки, затем заполняет пробелы."],
  "자동": ["Auto", "自动", "自動", "自動", "Automático", "Auto", "Automatisch", "Automático", "Авто"],
  "직접": ["Manual", "手动", "手動", "手動", "Manual", "Manuel", "Manuell", "Manual", "Вручную"],
  "색": ["Color", "颜色", "顏色", "色", "Color", "Couleur", "Farbe", "Cor", "Цвет"],
  "가중치": ["Weight", "权重", "權重", "ウェイト", "Peso", "Poids", "Gewicht", "Peso", "Вес"],
  "키": ["Keys", "关键帧", "關鍵幀", "キー", "Claves", "Clés", "Keys", "Quadros-chave", "Ключи"],
  "보간": ["Interpolation", "插值", "內插", "補間", "Interpolación", "Interpolation", "Interpolation", "Interpolação", "Интерполяция"],
  "변형": ["Deformation", "变形", "變形", "変形", "Deformación", "Déformation", "Verformung", "Deformação", "Деформация"],
  "공용": ["Shared", "通用", "共用", "共通", "Compartido", "Commun", "Gemeinsam", "Compartilhado", "Общее"],
  "이 동작에서만": ["This animation only", "仅此动画", "僅此動畫", "このアニメーションのみ", "Solo esta animación", "Cette animation uniquement", "Nur diese Animation", "Somente esta animação", "Только эта анимация"],
  "최소": ["Minimum", "最低", "最低", "最小", "Mínimo", "Minimum", "Minimum", "Mínimo", "Минимум"],
  "낮음": ["Low", "低", "低", "低", "Bajo", "Faible", "Niedrig", "Baixo", "Низкое"],
  "보통": ["Medium", "中", "中", "中", "Medio", "Moyen", "Mittel", "Médio", "Среднее"],
  "높음": ["High", "高", "高", "高", "Alto", "Élevé", "Hoch", "Alto", "Высокое"],
  "전체 보기": ["Show all", "显示全部", "顯示全部", "すべて表示", "Mostrar todo", "Tout afficher", "Alle anzeigen", "Mostrar tudo", "Показать всё"],
  "연결": ["Links", "连接", "連結", "接続", "Enlaces", "Liens", "Verbindungen", "Ligações", "Связи"],
  "태그": ["Tags", "标签", "標籤", "タグ", "Etiquetas", "Tags", "Tags", "Tags", "Теги"],
  "중심 · 구조": ["Core & structure", "核心与结构", "核心與結構", "中心・構造", "Centro y estructura", "Centre et structure", "Kern & Struktur", "Centro e estrutura", "Центр и структура"],
  "팔다리": ["Limbs", "四肢", "四肢", "手足", "Extremidades", "Membres", "Gliedmaßen", "Membros", "Конечности"],
  "부속": ["Appendages", "附属部位", "附屬部位", "付属部位", "Apéndices", "Appendices", "Anhänge", "Apêndices", "Придатки"],
  "얼굴": ["Face", "面部", "臉部", "顔", "Cara", "Visage", "Gesicht", "Rosto", "Лицо"],
  "역할": ["Roles", "作用", "作用", "役割", "Roles", "Rôles", "Rollen", "Funções", "Роли"],
  "움직임 성격": ["Motion style", "运动风格", "動作風格", "動きの性格", "Estilo de movimiento", "Style de mouvement", "Bewegungsstil", "Estilo de movimento", "Стиль движения"],
  "위치 구분": ["Position", "位置", "位置", "位置", "Posición", "Position", "Position", "Posição", "Положение"],
  "기본": ["Basic", "基础", "基本", "基本", "Básico", "Base", "Basis", "Básico", "Основные"],
  "이동": ["Movement", "移动", "移動", "移動", "Movimiento", "Déplacement", "Bewegung", "Movimento", "Движение"],
  "반응": ["Reactions", "反应", "反應", "リアクション", "Reacciones", "Réactions", "Reaktionen", "Reações", "Реакции"],
  "공격": ["Attack", "攻击", "攻擊", "攻撃", "Ataque", "Attaque", "Angriff", "Ataque", "Атака"],
  "대기": ["Idle", "待机", "待機", "待機", "Reposo", "Repos", "Leerlauf", "Espera", "Ожидание"],
  "걷기": ["Walk", "行走", "行走", "歩く", "Caminar", "Marche", "Gehen", "Caminhar", "Ходьба"],
  "피격": ["Hit", "受击", "受擊", "被弾", "Golpe", "Impact", "Treffer", "Acerto", "Получение удара"],
  "사망": ["Death", "死亡", "死亡", "死亡", "Muerte", "Mort", "Tod", "Morte", "Смерть"],
  "점프": ["Jump", "跳跃", "跳躍", "ジャンプ", "Salto", "Saut", "Sprung", "Salto", "Прыжок"],
  "포효": ["Roar", "咆哮", "咆哮", "咆哮", "Rugido", "Rugissement", "Brüllen", "Rugido", "Рёв"],
  "달리기": ["Run", "奔跑", "奔跑", "走る", "Correr", "Course", "Laufen", "Correr", "Бег"],
  "비행": ["Fly", "飞行", "飛行", "飛行", "Volar", "Vol", "Fliegen", "Voar", "Полёт"],
  "헤엄": ["Swim", "游泳", "游泳", "泳ぐ", "Nadar", "Nage", "Schwimmen", "Nadar", "Плавание"],
  "방어": ["Guard", "防御", "防禦", "防御", "Defensa", "Garde", "Abwehr", "Defesa", "Защита"],
  "회피": ["Dodge", "闪避", "閃避", "回避", "Esquivar", "Esquive", "Ausweichen", "Esquiva", "Уклонение"],
  "기절": ["Stun", "眩晕", "暈眩", "気絶", "Aturdimiento", "Étourdissement", "Betäubung", "Atordoamento", "Оглушение"],
  "승리": ["Victory", "胜利", "勝利", "勝利", "Victoria", "Victoire", "Sieg", "Vitória", "Победа"],
  "물기": ["Bite", "撕咬", "撕咬", "噛みつき", "Mordisco", "Morsure", "Biss", "Mordida", "Укус"],
  "할퀴기": ["Scratch", "抓挠", "抓撓", "ひっかき", "Arañazo", "Griffure", "Kratzen", "Arranhão", "Царапание"],
  "휘두르기": ["Swing", "挥砍", "揮砍", "振り回し", "Balanceo", "Coup circulaire", "Schwingen", "Golpe amplo", "Замах"],
  "찌르기": ["Stab", "突刺", "突刺", "突き", "Estocada", "Estoc", "Stich", "Estocada", "Укол"],
  "몸통박치기": ["Slam", "撞击", "撞擊", "体当たり", "Embestida", "Percussion", "Rammen", "Investida", "Таран"],
  "캐스팅": ["Cast", "施法", "施法", "詠唱", "Conjuro", "Incantation", "Zaubern", "Conjuração", "Заклинание"],
  "돌진": ["Charge", "冲锋", "衝鋒", "突進", "Carga", "Charge", "Ansturm", "Investida", "Рывок"],
  "회전 베기": ["Spin attack", "旋转斩", "旋轉斬", "回転斬り", "Ataque giratorio", "Attaque tournoyante", "Wirbelangriff", "Ataque giratório", "Круговая атака"],
  "내려찍기": ["Stomp", "重击", "重擊", "叩きつけ", "Golpe descendente", "Écrasement", "Niederschlag", "Golpe descendente", "Удар сверху"],
};

/** 저장값이 없으면 브라우저 언어와 가장 가까운 지원 언어를 고른다. */
export function getLanguage(): LanguageCode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (LANGUAGES.some((language) => language.code === saved)) return saved as LanguageCode;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith("zh-tw") || browser.startsWith("zh-hk")) return "zh-TW";
  return LANGUAGES.find((language) => browser.startsWith(language.code.toLowerCase().split("-")[0]))?.code ?? "en";
}

/** 선택을 브라우저에 저장한다. */
export function setLanguage(language: LanguageCode): void { localStorage.setItem(STORAGE_KEY, language); }

/** 사용자 입력은 건드리지 않고 등록된 제품 문구만 번역한다. */
export function translate(source: string): string {
  const language = getLanguage();
  if (language === "ko") return source;
  if (language === "en" && englishRows[source]) return englishRows[source];
  return rows[source]?.[LANGUAGES.findIndex((item) => item.code === language) - 1] ?? source;
}

/** 태그 id를 기준으로 긴 설명을 번역하고, 별도 번역이 없으면 공용 문구 표를 사용한다. */
export function translateTagDescription(tagId: string, source: string): string {
  const language = getLanguage();
  if (language === "ko") return source;
  if (language === "en") return englishTagDescriptions[tagId] ?? catalogTemplates.en.tagTrack;
  const template = catalogTemplates[language];
  if (["heavy", "light", "bounce", "stiff"].includes(tagId)) return template.tagModifier;
  if (tagId === "ground") return template.tagHint;
  return template.tagTrack;
}

/** 프리셋의 긴 설명도 선택 언어에서 항상 번역된 설명을 돌려준다. */
export function translatePresetDescription(name: string, source: string): string {
  const language = getLanguage();
  if (language === "ko") return source;
  if (language === "en") return englishRows[source] ?? fillTemplate(catalogTemplates.en.preset, { name });
  return fillTemplate(catalogTemplates[language].preset, { name });
}

/** 태그 배율처럼 실행 중 숫자가 포함되는 설명을 언어별 어순으로 조립한다. */
export function formatTagMultiplier(value: number): string {
  const language = getLanguage();
  if (language === "ko") return `모든 동작에서 이 관절의 움직임이 ${value}배가 됩니다`;
  return fillTemplate(catalogTemplates[language].everyAnimation, { value });
}

/** 태그를 사용하는 프리셋 목록 또는 빈 목록 안내를 현재 언어로 만든다. */
export function formatTagUsage(labels: string[]): string {
  const language = getLanguage();
  if (language === "ko") return labels.length ? `이 태그를 쓰는 동작: ${labels.join(" · ")}` : "아직 이 태그를 쓰는 기본 동작은 없습니다";
  const template = catalogTemplates[language];
  return labels.length ? fillTemplate(template.usedBy, { value: labels.join(" · ") }) : template.unused;
}

/** 길이·반복·트랙 수가 달라지는 애니메이션 요약을 현재 언어로 만든다. */
export function formatAnimationSummary(duration: number, loop: boolean, tracks: number): string {
  const language = getLanguage();
  if (language === "ko") return `${duration}초 · ${loop ? "반복" : "한 번"} · 트랙 ${tracks}개`;
  const template = catalogTemplates[language];
  return `${duration}s · ${loop ? template.loop : template.once} · ${tracks} ${template.tracks}`;
}

/** 전체 보정 뒤 바뀐 정점·오점 수를 현재 언어의 어순으로 알려 준다. */
export function formatWeightCorrectionResult(
  kind: "fill" | "cleanup",
  result: { filledVertices: number; removedMarks: number },
): string {
  const language = getLanguage();
  const values = { filled: result.filledVertices, removed: result.removedMarks };
  const templates: Record<LanguageCode, { fill: string; cleanup: string }> = {
    ko: { fill: "빈 정점 {filled}개를 채웠습니다. Ctrl+Z로 되돌릴 수 있습니다.", cleanup: "오점 {removed}개를 지우고 빈 정점 {filled}개를 채웠습니다. Ctrl+Z로 되돌릴 수 있습니다." },
    en: { fill: "Filled {filled} empty vertices. Press Ctrl+Z to undo.", cleanup: "Removed {removed} marks and filled {filled} empty vertices. Press Ctrl+Z to undo." },
    "zh-CN": { fill: "已填充 {filled} 个空白顶点。可按 Ctrl+Z 撤销。", cleanup: "已移除 {removed} 个杂点并填充 {filled} 个空白顶点。可按 Ctrl+Z 撤销。" },
    "zh-TW": { fill: "已填滿 {filled} 個空白頂點。可按 Ctrl+Z 復原。", cleanup: "已移除 {removed} 個雜點並填滿 {filled} 個空白頂點。可按 Ctrl+Z 復原。" },
    ja: { fill: "空の頂点を {filled} 個塗りました。Ctrl+Z で元に戻せます。", cleanup: "不要な跡を {removed} 個消し、空の頂点を {filled} 個塗りました。Ctrl+Z で元に戻せます。" },
    es: { fill: "Se rellenaron {filled} vértices vacíos. Ctrl+Z para deshacer.", cleanup: "Se eliminaron {removed} marcas y se rellenaron {filled} vértices vacíos. Ctrl+Z para deshacer." },
    fr: { fill: "{filled} sommets vides remplis. Ctrl+Z pour annuler.", cleanup: "{removed} traces supprimées et {filled} sommets vides remplis. Ctrl+Z pour annuler." },
    de: { fill: "{filled} leere Punkte gefüllt. Mit Ctrl+Z rückgängig machen.", cleanup: "{removed} Flecken entfernt und {filled} leere Punkte gefüllt. Mit Ctrl+Z rückgängig machen." },
    "pt-BR": { fill: "{filled} vértices vazios preenchidos. Ctrl+Z para desfazer.", cleanup: "{removed} marcas removidas e {filled} vértices vazios preenchidos. Ctrl+Z para desfazer." },
    ru: { fill: "Заполнено пустых вершин: {filled}. Ctrl+Z — отменить.", cleanup: "Удалено пятен: {removed}; заполнено пустых вершин: {filled}. Ctrl+Z — отменить." },
  };
  return fillTemplate(templates[language][kind], values);
}

/** 프리셋 보유 여부와 사용 태그를 애니메이션 요약 뒤에 붙인다. */
export function formatPresetMeta(summary: string, has: boolean, tags: string): string {
  const language = getLanguage();
  if (language === "ko") return has ? `${summary} · 이미 담겨 있습니다 — 또 담으면 사본이 생깁니다` : `${summary} · 쓰는 태그: ${tags}`;
  const template = catalogTemplates[language];
  return has ? `${summary} · ${template.alreadyAdded}` : `${summary} · ${template.tagsUsed}: ${tags}`;
}

/** 새로 생긴 DOM 하위 트리의 텍스트와 접근성 문구를 현재 언어로 바꾼다. */
function localizeTree(root: Node): void {
  const localizeElement = (element: HTMLElement): void => {
    for (const attribute of ["title", "aria-label", "placeholder"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const localized = translate(value);
      if (localized !== value) element.setAttribute(attribute, localized);
    }
  };
  // textContent 대입은 텍스트 노드 하나를 addedNode로 전달하므로 root 자체도 처리한다.
  if (root.nodeType === Node.TEXT_NODE) {
    const original = root.textContent ?? "";
    const trimmed = original.trim();
    if (trimmed) root.textContent = original.replace(trimmed, translate(trimmed));
    return;
  }
  if (root instanceof HTMLElement) localizeElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      const original = node.textContent ?? "";
      const trimmed = original.trim();
      if (trimmed) node.textContent = original.replace(trimmed, translate(trimmed));
    } else if (node instanceof HTMLElement) localizeElement(node);
  }
}

/** index.html의 고정 문구와 접근성 이름을 UI 생성 전에 번역한다. */
export function localizeStaticDocument(): void {
  const language = getLanguage();
  document.documentElement.lang = language;
  document.title = language === "ko" ? "PuppetForge - 종이인형 애니메이션 툴" : "PuppetForge - 2D Puppet Animation Tool";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, original = node.textContent ?? "", trimmed = original.trim();
    if (trimmed && translate(trimmed) !== trimmed) node.textContent = original.replace(trimmed, translate(trimmed));
  }
  for (const element of document.querySelectorAll<HTMLElement>("[title], [aria-label]")) {
    for (const attribute of ["title", "aria-label"]) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, translate(value));
    }
  }
  // 패널은 상태가 바뀐 뒤에도 계속 다시 그려지므로 추가되는 노드도 즉시 번역한다.
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) localizeTree(node);
      if (mutation.type === "attributes") localizeTree(mutation.target);
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "placeholder"],
  });
}
