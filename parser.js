// Lightweight SwiftUI-to-tree heuristic parser
// Goals:
// - Discover struct View declarations and their body blocks
// - Identify root container (ZStack/VStack/HStack/ScrollView etc.) and children
// - Capture simple modifiers `.foo(...)` attached to a view literal
// - Inline custom view components (e.g., TitleView()) where possible
// - Not a full Swift parser; best-effort based on regex and brace matching

(function () {
    const CONTAINER_TYPES = [
        'VStack', 'HStack', 'ZStack', 'ScrollView', 'List', 'Group', 'ForEach', 'Section', 'Form', 'TabView', 'NavigationStack', 'NavigationView', 'LazyVStack', 'LazyHStack', 'LazyVGrid', 'LazyHGrid', 'Grid', 'ZStack', 'GeometryReader', 'AnyView'
    ];

    // Given source string, return map of viewName -> bodyContent (raw text inside { ... } of body)
    function extractViews(source) {
        const viewMap = new Map();
        // Match struct Foo: View { ... body: some View { ... } ... }
        const structRe = /struct\s+(\w+)\s*:\s*View\s*\{/g;
        let m;
        while ((m = structRe.exec(source))) {
            const name = m[1];
            const start = m.index + m[0].length; // position after '{'
            const block = readBalanced(source, start - 1, '{', '}');
            if (!block) continue;
            // Find 'var body: some View { ... }' within block.inner using balanced braces
            const bodyDecl = /var\s+body\s*:\s*some\s+View\s*\{/g;
            const inner = block.inner;
            const bm = bodyDecl.exec(inner);
            if (bm) {
                const bracePos = bm.index + bm[0].length - 1; // position of '{'
                const bodyBlock = readBalanced(inner, bracePos, '{', '}');
                if (bodyBlock) {
                    viewMap.set(name, bodyBlock.inner);
                }
            }
        }
        return viewMap;
    }

    // Read balanced braces starting at the position of the opening brace.
    function readBalanced(text, openPos, openChar = '{', closeChar = '}') {
        if (text[openPos] !== openChar) return null;
        let depth = 0; let i = openPos; const n = text.length;
        for (; i < n; i++) {
            const ch = text[i];
            if (ch === '"') { // skip strings (normal or triple-quoted)
                const end = readSwiftString(text, i);
                i = end; continue;
            }
            if (ch === '/' && text[i + 1] === '/') { // line comment
                while (i < n && text[i] !== '\n') i++;
                continue;
            }
            if (ch === '/' && text[i + 1] === '*') { // block comment
                i += 2;
                while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
                i++; continue;
            }
            if (ch === openChar) depth++;
            else if (ch === closeChar) {
                depth--;
                if (depth === 0) {
                    return { inner: text.slice(openPos + 1, i), end: i };
                }
            }
        }
        return null;
    }

    function readString(text, start) {
        // start at quote
        let i = start + 1; const n = text.length;
        while (i < n) {
            if (text[i] === '\\') { i += 2; continue; }
            if (text[i] === '"') { return i; }
            i++;
        }
        return n - 1;
    }

    // Swift supports triple-quoted multiline strings: """ ... """
    function readTripleQuoted(text, start) {
        // start points at the first '"' of a sequence of 3 quotes
        const n = text.length;
        let i = start + 3; // skip opening """
        while (i < n - 2) {
            // naive scan to closing """
            if (text[i] === '"' && text[i + 1] === '"' && text[i + 2] === '"') {
                return i + 2; // index at last quote of closing
            }
            i++;
        }
        return n - 1;
    }

    function readSwiftString(text, start) {
        if (text[start] !== '"') return start;
        if (text[start + 1] === '"' && text[start + 2] === '"') {
            return readTripleQuoted(text, start);
        }
        return readString(text, start);
    }

    // Split top-level comma-separated arguments respecting parentheses
    function splitArgs(s) {
        const parts = []; let depth = 0; let cur = '';
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (ch === '"') { const end = readSwiftString(s, i); cur += s.slice(i, end + 1); i = end; continue; }
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        if (cur.trim()) parts.push(cur.trim());
        return parts;
    }

    function normalizeValue(val) {
        const single = val.replace(/[\n\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        // truncate long strings
        if (single.length > 60) return single.slice(0, 57) + '…';
        return single;
    }

    function parsePropsFromArgs(argsText) {
        const props = [];
        if (!argsText || !argsText.trim()) return props;
        const parts = splitArgs(argsText);
        for (const p of parts) {
            const m = /^(\w+)\s*:\s*([\s\S]+)$/.exec(p);
            if (m) {
                const key = m[1];
                const val = normalizeValue(m[2]);
                props.push(`${key}: ${val}`);
            } else {
                props.push(normalizeValue(p)); // positional
            }
        }
        return props;
    }

    // Parse a view expression into {name, children, modifiers}
    // Handles containers like Foo { ... } and leaf like Bar(args). Supports base token chains like Color.black.
    function parseViewExpression(expr) {
        const result = { kind: 'View', name: '', modifiers: [], children: [], props: [] };
        const s = expr.trim();
        let i = 0; const n = s.length;

        // Read base token: identifier plus optional member chain until whitespace or '(' or '{'
        function isIdentChar(c) { return /[A-Za-z0-9_\.]/.test(c); }
        while (i < n && s[i].trim() === '') i++;
        const start = i;
        while (i < n && isIdentChar(s[i])) i++;
        let baseToken = s.slice(start, i).trim();
        result.name = baseToken || 'View';
        if (/^ForEach(\b|$)/.test(result.name)) result.kind = 'ForEach';
        else if (/^(VStack|HStack|ZStack|ScrollView|List|Group|Section|Form|TabView|Navigation(Stack|View)|Lazy(VStack|HStack|VGrid|HGrid)|Grid|GeometryReader)$/
            .test(result.name)) result.kind = 'Container';

        // Optional argument list right after name token
        while (i < n && /\s/.test(s[i])) i++;
        if (i < n && s[i] === '(') {
            // read balanced parens
            let d = 0; let j = i; do { const c = s[j]; if (c === '(') d++; else if (c === ')') d--; j++; } while (j < n && d > 0);
            // capture args
            const argsContent = s.slice(i + 1, j - 1);
            result.props = parsePropsFromArgs(argsContent);
            // ForEach(...) without trailing closure but with labeled content: try to detect `content: { ... }`
            if (result.kind === 'ForEach') {
                // naive search for content: { ... }
                const after = s.slice(j);
                const m = /content\s*:\s*\{/.exec(after);
                if (m) {
                    const pos = j + m.index + m[0].length - 1; // at '{'
                    const blk = readBalanced(s, pos, '{', '}');
                    if (blk) {
                        let inner = blk.inner;
                        inner = stripLeadingClosureParams(inner);
                        result.children = parseChildrenBlock(inner);
                        j = blk.end + 1; // advance
                    }
                }
            }
            i = j;
        }

        // Optional container block
        while (i < n && /\s/.test(s[i])) i++;
        let baseEnd = i;
        if (i < n && s[i] === '{') {
            const blk = readBalanced(s, i, '{', '}');
            if (blk) {
                let inner = blk.inner;
                // Special case: ForEach trailing closure — remove leading closure params like `x in` or `(x, y) in`
                if (/^ForEach(\b|$)/.test(result.name)) {
                    result.kind = 'ForEach';
                    inner = stripLeadingClosureParams(inner);
                }
                result.children = parseChildrenBlock(inner);
                i = blk.end + 1;
            }
            baseEnd = i;
        }

        // Remaining tail: modifiers like .padding(...).background(...)
        const tail = s.slice(baseEnd);
        // scan for top-level dot calls (ignore inside parens)
        let depth = 0; let cur = '';
        for (let k = 0; k < tail.length; k++) {
            const ch = tail[k];
            if (ch === '"') { const end = readSwiftString(tail, k); cur += tail.slice(k, end + 1); k = end; continue; }
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            if (ch === '.' && depth === 0) {
                // flush previous (whitespace)
                if (cur.trim()) { /* ignore */ }
                // capture .name(args?) token
                let j = k + 1; let name = ''; while (j < tail.length && /[A-Za-z0-9_]/.test(tail[j])) { name += tail[j]; j++; }
                // optional parens
                let args = '';
                while (j < tail.length && /\s/.test(tail[j])) j++;
                if (j < tail.length && tail[j] === '(') {
                    let d = 0; let t = j; do { const c = tail[t]; if (c === '(') d++; else if (c === ')') d--; t++; } while (t < tail.length && d > 0);
                    args = tail.slice(j + 1, t - 1);
                    k = t - 1; // continue from here
                } else {
                    k = j - 1;
                }
                result.modifiers.push(args ? `${name}(${args.trim()})` : name);
                cur = '';
                continue;
            }
            cur += ch;
        }

        return result;
    }

    // Remove leading closure parameters from a trailing-closure body: e.g. "item in ..." or "(index, item) in ..."
    function stripLeadingClosureParams(text) {
        let i = 0; const n = text.length;
        // skip leading whitespace/newlines
        while (i < n && /\s/.test(text[i])) i++;
        let depthParen = 0, depthBrace = 0; let inStr = false;
        for (; i < n; i++) {
            const ch = text[i];
            if (ch === '"') { const end = readSwiftString(text, i); i = end; continue; }
            if (inStr) continue;
            if (ch === '(') depthParen++;
            else if (ch === ')') depthParen--;
            else if (ch === '{') depthBrace++;
            else if (ch === '}') depthBrace--;
            // find token 'in' at top level (not inside any paren/brace)
            if (depthParen === 0 && depthBrace === 0) {
                if (text[i] === 'i' && text[i + 1] === 'n') {
                    const before = text[i - 1];
                    const after = text[i + 2];
                    const isWordBoundary = (!before || /[^A-Za-z0-9_]/.test(before)) && (!after || /[^A-Za-z0-9_]/.test(after));
                    if (isWordBoundary) {
                        return text.slice(i + 2).trimStart();
                    }
                }
                // If we hit a non-param token (like a container) before finding 'in', bail out
                if (/[A-Za-z]/.test(ch)) {
                    // keep scanning for a short distance (handles leading identifiers), otherwise break at newline
                }
            }
        }
        // no change
        return text;
    }

    function parseChildrenBlock(body) {
        // Split by top-level commas or new child starts by pattern: Identifier( or Identifier { or If/ForEach etc.
        // Simple heuristic: iterate and whenever we see Name( or Name {, capture that expression including trailing modifiers until newline that isn't inside parens/braces.
        const children = [];
        let i = 0; const n = body.length;
        while (i < n) {
            // skip whitespace and commas
            while (i < n && /[\s,]/.test(body[i])) i++;
            if (i >= n) break;

            // Special case: if/else at top-level
            if (isWordAt(body, i, 'if')) {
                const { node, nextIndex } = parseIfElse(body, i);
                if (node) { children.push(node); i = nextIndex + 1; continue; }
            }

            const start = i;
            // read until end of one top-level expression
            let depthParen = 0, depthBrace = 0; let inString = false;
            while (i < n) {
                const ch = body[i];
                if (ch === '"' && body[i - 1] !== '\\') {
                    // handle triple quotes
                    if (body[i + 1] === '"' && body[i + 2] === '"') {
                        const end = readTripleQuoted(body, i);
                        i = end + 1; // move past closing quotes
                        continue;
                    } else {
                        inString = !inString;
                    }
                }
                if (!inString) {
                    if (ch === '(') depthParen++;
                    else if (ch === ')') depthParen--;
                    else if (ch === '{') depthBrace++;
                    else if (ch === '}') depthBrace--;
                    else if (ch === '\n' && depthParen === 0 && depthBrace === 0) {
                        // lookahead to see if next non-space starts with '.' (modifier continuation)
                        let t = i + 1; while (t < n && /\s/.test(body[t])) t++;
                        if (body[t] !== '.') break; // end of expression
                    }
                }
                i++;
            }
            const expr = body.slice(start, i).trim();
            if (expr) {
                children.push(parseViewExpression(expr));
            }
            i++;
        }
        return children;
    }

    function isWordAt(text, index, word) {
        if (text.slice(index, index + word.length) !== word) return false;
        const before = text[index - 1];
        const after = text[index + word.length];
        const isBoundaryBefore = index === 0 || /[^A-Za-z0-9_]/.test(before);
        const isBoundaryAfter = !after || /[^A-Za-z0-9_]/.test(after);
        return isBoundaryBefore && isBoundaryAfter;
    }

    function parseIfElse(text, i) {
        const n = text.length;
        // assume text[i..] starts with 'if'
        let k = i + 2; // after 'if'
        // capture condition until the next top-level '{'
        while (k < n && /\s/.test(text[k])) k++;
        const condStart = k;
        let depthParen = 0; let inStr = false;
        while (k < n) {
            const ch = text[k];
            if (ch === '"') { const end = readSwiftString(text, k); k = end + 1; continue; }
            if (ch === '(') depthParen++;
            else if (ch === ')') depthParen--;
            if (ch === '{' && depthParen === 0) break;
            k++;
        }
        if (k >= n || text[k] !== '{') return { node: null, nextIndex: i };
        const condition = text.slice(condStart, k).trim();
        const thenBlk = readBalanced(text, k, '{', '}');
        if (!thenBlk) return { node: null, nextIndex: i };
        const thenChildren = parseChildrenBlock(thenBlk.inner);
        let cursor = thenBlk.end + 1;
        // build node
        const node = { kind: 'If', name: `if ${condition}`, modifiers: [], props: [], children: [] };
        node.children.push({ kind: 'Branch', name: 'Then', modifiers: [], props: [], children: thenChildren });

        // skip whitespace/newlines
        while (cursor < n && /\s/.test(text[cursor])) cursor++;
        // optional else / else if
        if (isWordAt(text, cursor, 'else')) {
            cursor += 4; // after else
            while (cursor < n && /\s/.test(text[cursor])) cursor++;
            if (isWordAt(text, cursor, 'if')) {
                // else if ... -> nest another If node inside Else branch
                const res = parseIfElse(text, cursor);
                if (res.node) {
                    node.children.push({ kind: 'Branch', name: 'Else', modifiers: [], props: [], children: [res.node] });
                    cursor = res.nextIndex + 1;
                }
            } else if (text[cursor] === '{') {
                const elseBlk = readBalanced(text, cursor, '{', '}');
                if (elseBlk) {
                    const elseChildren = parseChildrenBlock(elseBlk.inner);
                    node.children.push({ kind: 'Branch', name: 'Else', modifiers: [], props: [], children: elseChildren });
                    cursor = elseBlk.end + 1;
                }
            }
        }
        return { node, nextIndex: cursor };
    }

    function resolveCustomViews(tree, viewMap, seen = new Set()) {
        // Inline custom views when a leaf node name matches a known struct View name
        if (viewMap.has(tree.name) && !CONTAINER_TYPES.includes(tree.name)) {
            if (seen.has(tree.name)) {
                tree.modifiers.push('/* recursion */');
            } else {
                seen.add(tree.name);
                const body = viewMap.get(tree.name);
                tree.kind = 'CustomView';
                const parsed = parseChildrenBlock(body);
                // If body contains a single root container, adopt its children as ours; else keep as children
                if (parsed.length === 1 && CONTAINER_TYPES.includes(parsed[0].name)) {
                    // preserve modifiers from container on a synthetic child
                    tree.children = parsed;
                } else {
                    tree.children = parsed;
                }
                seen.delete(tree.name);
            }
        }

        // Recurse
        for (const child of tree.children) {
            resolveCustomViews(child, viewMap, seen);
        }
        return tree;
    }

    function buildTreeForRoot(viewMap, rootName) {
        const body = viewMap.get(rootName);
        if (!body) return null;
        // Expect body has one top-level expression that is the root
        const kids = parseChildrenBlock(body);
        if (kids.length === 1) {
            const root = kids[0];
            resolveCustomViews(root, viewMap);
            return root;
        }
        // If multiple, wrap with Group
        const root = { name: 'Group', kind: 'View', modifiers: [], children: kids };
        resolveCustomViews(root, viewMap);
        return root;
    }

    function collectRootCandidates(viewMap) {
        const names = Array.from(viewMap.keys());
        // Prefer names like ContentView, MainView, AppView
        names.sort((a, b) => {
            const score = name => (/ContentView|MainView|Root|App/i.test(name) ? 0 : 1);
            return score(a) - score(b) || a.localeCompare(b);
        });
        return names;
    }

    // Public API (browser + Node)
    const SwiftUIParserAPI = {
        extractViews,
        buildTreeForRoot,
        collectRootCandidates,
    };
    if (typeof window !== 'undefined') window.SwiftUIParser = SwiftUIParserAPI;
    if (typeof module !== 'undefined' && module.exports) module.exports = SwiftUIParserAPI;
})();
