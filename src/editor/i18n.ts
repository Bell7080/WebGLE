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
  return rows[source]?.[LANGUAGES.findIndex((item) => item.code === language) - 1] ?? source;
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
}
