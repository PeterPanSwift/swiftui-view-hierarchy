# SwiftUI View Hierarchy 可視化

一個純前端(靜態)小工具，讓你貼上 SwiftUI 程式碼，解析出視圖階層，並以可展開/收合的樹狀結構呈現。

## 功能
- 貼上多個 `struct Foo: View { ... }`，自動找出可作為根的 View (優先 `ContentView`)
- 啟發式解析 `body: some View { ... }`：
  - 了解常見容器 `VStack/HStack/ZStack/ScrollView/...`
  - 解析子視圖與修飾器 (modifiers)，如下 `.padding()`, `.background(...)` 等
  - 自動 inline 自定義 View，如 `TitleView()`、`HeaderImageView()`
- 點擊節點展開/收合，支援「全部展開 / 全部收合」

## 使用
1. 打開 `index.html`
2. 將 SwiftUI 程式碼貼入左側輸入框
3. 按「解析並生成」，右側將顯示樹狀結構
4. 可以在上方下拉選單選擇 Root view

### 自訂 B‑612 插畫
右下角的 B‑612 行星預設以 CSS 繪製。若要改成自己的插畫，請將圖片放到 `assets/b612.png`（建議透明背景，約 768×768）。檔案存在時，頁面會自動以圖片呈現；若載入失敗則會回退到內建 CSS 版本。

## 限制與備註
本工具不是完整的 Swift 解析器，採用正則+括號配對的啟發式方式。以下情境可能不完全支援：
- 複雜的條件/控制流 (if/else, switch, ForEach 動態內容)
- Result builder 中的隱式 return 或多行表達式過於自由
- 泛型視圖、型別擦除、或高度動態的 modifiers 鏈
- 多檔案跨檔引用 (僅解析貼入的文字)

若解析失敗，建議先簡化程式碼或將子 View 拆出為更直觀的結構。

## 本地開啟
直接在 VS Code 以 Live Server 或瀏覽器開啟 `index.html`。

## 授權
MIT
