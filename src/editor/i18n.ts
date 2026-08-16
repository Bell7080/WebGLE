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
