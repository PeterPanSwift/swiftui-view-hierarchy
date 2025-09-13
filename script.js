// UI wiring and tree rendering
(function () {
    const $ = sel => document.querySelector(sel);
    const codeInput = $('#codeInput');
    const parseBtn = $('#parseBtn');
    const errorBox = $('#errorBox');
    const treeRoot = $('#treeRoot');
    const pasteExample = $('#pasteExample');
    const expandAllBtn = $('#expandAll');
    const collapseAllBtn = $('#collapseAll');
    const rootSelect = $('#rootSelect');
    const showReadme = $('#showReadme');
    const starfield = document.querySelector('#starfield');
    // B‑612 image fallback: if image load fails, revert to CSS planet
    const planet = document.querySelector('.b612-planet');
    const img = planet?.querySelector('.b612-img');
    if (img) {
        img.addEventListener('error', () => {
            planet.classList.remove('use-image');
            img.style.display = 'none';
        });
    }

    function setError(msg) {
        if (!msg) { errorBox.hidden = true; errorBox.textContent = ''; return; }
        errorBox.hidden = false; errorBox.textContent = msg;
    }

    function renderTree(node, parentUl) {
        const li = document.createElement('li');

        const row = document.createElement('div');
        row.className = 'node';

        const toggle = document.createElement('span');
        toggle.className = 'toggle';

        const kind = document.createElement('span');
        kind.className = 'kind';
        kind.textContent = node.kind || 'View';

        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = node.name;

        const meta = document.createElement('span');
        meta.className = 'meta';
        if (node.children?.length) { meta.textContent = ` · ${node.children.length} child${node.children.length > 1 ? 'ren' : ''}`; }

        const propsWrap = document.createElement('div');
        propsWrap.className = 'props';
        if (node.props && node.props.length) {
            for (const p of node.props) {
                const chip = document.createElement('span');
                chip.className = 'prop-chip';
                chip.textContent = p;
                propsWrap.appendChild(chip);
            }
        }

        const mods = document.createElement('div');
        mods.className = 'modifiers';
        for (const m of node.modifiers || []) {
            const chip = document.createElement('span');
            chip.className = 'mod-chip';
            chip.textContent = m;
            mods.appendChild(chip);
        }

        row.append(toggle, kind, title, meta, propsWrap, mods);
        li.appendChild(row);

        if (node.children && node.children.length) {
            toggle.textContent = '▸';
            toggle.classList.add('has-children');
            const ul = document.createElement('ul');
            ul.className = 'children';
            ul.style.display = 'none';
            for (const c of node.children) { renderTree(c, ul); }
            li.appendChild(ul);
            row.addEventListener('click', () => {
                const open = ul.style.display !== 'none';
                if (open) {
                    const h = ul.scrollHeight;
                    ul.style.height = h + 'px';
                    requestAnimationFrame(() => {
                        ul.style.transition = 'height .25s ease, opacity .25s ease';
                        ul.style.height = '0px';
                        ul.style.opacity = '0.0';
                    });
                    setTimeout(() => { ul.style.display = 'none'; ul.style.height = ''; ul.style.transition = ''; ul.style.opacity = ''; }, 260);
                } else {
                    ul.style.display = '';
                    ul.style.height = '0px';
                    ul.style.opacity = '0.0';
                    const h = ul.scrollHeight;
                    requestAnimationFrame(() => {
                        ul.style.transition = 'height .25s ease, opacity .25s ease';
                        ul.style.height = h + 'px';
                        ul.style.opacity = '1';
                    });
                    setTimeout(() => { ul.style.height = ''; ul.style.transition = ''; }, 260);
                }
                toggle.textContent = open ? '▸' : '▾';
                toggle.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
            });
        } else {
            toggle.textContent = '·';
        }

        parentUl.appendChild(li);
    }

    function render(tree) {
        treeRoot.classList.remove('empty');
        treeRoot.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'tree';
        renderTree(tree, ul);
        treeRoot.appendChild(ul);
    }

    function parseNow() {
        setError('');
        const src = codeInput.value;
        if (!src.trim()) {
            setError('請先貼上 SwiftUI 程式碼');
            return;
        }
        try {
            const map = SwiftUIParser.extractViews(src);
            const candidates = SwiftUIParser.collectRootCandidates(map);
            // refresh rootSelect
            rootSelect.innerHTML = '';
            for (const name of candidates) {
                const opt = document.createElement('option');
                opt.value = name; opt.textContent = name; rootSelect.appendChild(opt);
            }
            const selected = rootSelect.value || candidates[0];
            if (!selected) { setError('未找到任何 struct ... : View'); return; }
            const tree = SwiftUIParser.buildTreeForRoot(map, selected);
            if (!tree) { setError('無法從 body 建立樹狀結構'); return; }
            render(tree);
        } catch (err) {
            console.error(err);
            setError('解析發生錯誤：' + (err?.message || String(err)));
        }
    }

    parseBtn.addEventListener('click', parseNow);
    rootSelect.addEventListener('change', parseNow);

    expandAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.children').forEach(ul => { ul.style.display = ''; });
        document.querySelectorAll('.toggle.has-children').forEach(t => { t.textContent = '▾'; });
    });
    collapseAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.children').forEach(ul => { ul.style.display = 'none'; ul.style.height = ''; ul.style.transition = ''; ul.style.opacity = ''; });
        document.querySelectorAll('.toggle.has-children').forEach(t => { t.textContent = '▸'; t.style.transform = 'rotate(0deg)'; });
    });

    pasteExample.addEventListener('click', () => {
        codeInput.value = `struct ContentView: View {\n    var body: some View {\n        ZStack {\n            Color.black\n                .ignoresSafeArea()\n            ScrollView {\n                VStack(spacing: 20) {\n                    TitleView()\n                    HeaderImageView()\n                    InfoSectionView(\n                        emoji: \"✨\", \n                        title: \"簡介\", \n                        content: \"日本環球影城（Universal Studios Japan）位於大阪，是一個充滿魔法與冒險的主題公園。公園內有眾多基於電影和動畫的主題區域和遊樂設施，吸引了來自世界各地的遊客。\"\n                    )\n                    InfoSectionView(\n                        emoji: \"🏰\", \n                        title: \"主題區域\", \n                        content: \"\"\"\n                        超級任天堂世界\n                        哈利波特魔法世界\n                        小小兵樂園\n                        水世界\n                        親善村\n                        侏儸紀公園\n                        環球奇境\n                        好萊塢區域\n                        紐約區域\n                        舊金山區域\n                        \"\"\"\n                    )\n                }\n            }\n            .contentMargins(10)\n        }\n    }\n}\n\nstruct TitleView: View {\n    var body: some View {\n        Text(\"日本環球影城\")\n            .font(.system(size: 34, weight: .bold, design: .rounded))\n            .foregroundStyle(.white)\n            .shadow(radius: 5)\n    }\n}\n\nstruct HeaderImageView: View {\n    var body: some View {\n        Image(.usj)\n            .resizable()\n            .scaledToFill()\n            .frame(minWidth: 0, maxWidth: .infinity, maxHeight: 250)\n            .clipShape(.rect(cornerRadius: 15))\n    }\n}\n\nstruct InfoSectionView: View {\n    let emoji: String\n    let title: String\n    let content: String\n    \n    var body: some View {\n        VStack(alignment: .leading, spacing: 10) {\n            HStack {\n                Text(emoji)\n                    .font(.title2)\n                Text(title)\n                    .font(.title2)\n                    .fontWeight(.semibold)\n                    .foregroundStyle(.blue)\n            }\n            Text(content)\n                .font(.body)\n                .foregroundStyle(.gray)\n        }\n        .padding()\n        .frame(maxWidth: .infinity, alignment: .leading)\n        .background(.white.opacity(0.9))\n        .clipShape(.rect(cornerRadius: 15))\n        .shadow(color: .gray.opacity(0.3), radius: 10, y: 5)\n    }\n}`;
        parseNow();
    });

    showReadme.addEventListener('click', (e) => {
        e.preventDefault();
        alert('使用方式:\n1) 貼上 SwiftUI 程式碼\n2) 點擊 解析並生成\n3) 於上方 Root View 下拉選擇根節點\n\n注意: 解析採啟發式，可能無法涵蓋所有 SwiftUI 語法，如條件視圖、result builder 複雜控制流等。');
    });

    // B612 starfield
    function spawnStars(count = 140) {
        if (!starfield) return;
        starfield.innerHTML = '';
        const w = window.innerWidth; const h = window.innerHeight;
        for (let i = 0; i < count; i++) {
            const s = document.createElement('div');
            s.className = 'star';
            const x = Math.random() * w;
            const y = Math.random() * h;
            const size = Math.random() * 2 + 1;
            const delay = (Math.random() * 3).toFixed(2);
            const duration = (2.5 + Math.random() * 2).toFixed(2);
            s.style.left = x + 'px';
            s.style.top = y + 'px';
            s.style.width = size + 'px';
            s.style.height = size + 'px';
            s.style.animationDelay = delay + 's';
            s.style.animationDuration = duration + 's';
            starfield.appendChild(s);
        }
        const shoot = document.createElement('div');
        shoot.className = 'shooting';
        shoot.style.left = (w * (0.7 + Math.random() * 0.25)) + 'px';
        shoot.style.top = (h * (0.1 + Math.random() * 0.2)) + 'px';
        shoot.style.animationDelay = (Math.random() * 5).toFixed(2) + 's';
        starfield.appendChild(shoot);
    }
    window.addEventListener('resize', () => spawnStars());
    spawnStars();
})();
