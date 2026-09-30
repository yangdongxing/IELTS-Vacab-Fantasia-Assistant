// ==UserScript==
// @name         雅思真经划词划划看 (IELTS Selection Assistant)
// @namespace    https://github.com/yangdongxing/IELTS-Vacab-Fantasia
// @version      2.4.0
// @connect      ielts-vacab-fantasia-images.yangdongxing.workers.dev
// @description  划选任意网页文本，一键在正文中直接标注《雅思词汇真经》核心词汇。单次统一AI驱动学术整句翻译与核心语块深度解构（Gemini 3.5 Flash-Lite / 智谱 GLM 自动降级），Tips气泡与大图例句覆层100%对齐，支持拼写校验交互，段落下自动插入神经双语对照卡片、[🎧 朗读段落] 1-3-6-10-15 阶梯连播与毫秒级音词高亮追踪（未启动本地服务时自动平滑降级为浏览器原生语音，零破坏剪贴板）。
// @author       极客助手
// @match        *://*/*
// @match        file:///*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @connect      open.bigmodel.cn
// @connect      generativelanguage.googleapis.com
// @connect      *
// @run-at       document-end
// ==/UserScript==

/**
 * IELTS Selection Assistant (雅思真经划词划划看)
 * Optimized Memory Modal:
 * - Clean modal without side context
 * - Input validates exact word in #geek-memory-word
 * - Automatic modal closure upon correct spelling
 */
(function() {
    "use strict";

    // ==========================================
    // Dynamic Vocabulary & Storage Cache Configuration
    // ==========================================
    const SCRIPT_VERSION = "2.4.0";
    const VOCAB_REMOTE_URL = "https://ielts-vacab-fantasia-images.yangdongxing.workers.dev/manifest_vocab.json";
    const STORAGE_KEY_VOCAB = "isa_manifest_vocab_cache_v2";
    const STORAGE_KEY_VER = "isa_manifest_vocab_version_v2";

    let DICTIONARY = {};
    let isVocabReady = false;
    let vocabLoadPromise = null;

    function showMiniNotice(msg, duration = 3000) {
        try {
            let toast = document.getElementById("isa-mini-toast");
            if (!toast) {
                toast = document.createElement("div");
                toast.id = "isa-mini-toast";
                toast.style.cssText = `
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    background: rgba(17, 24, 39, 0.92);
                    color: #ffffff;
                    font-size: 13px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    padding: 8px 16px;
                    border-radius: 8px;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
                    z-index: 2147483647;
                    pointer-events: none;
                    transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    opacity: 0;
                    transform: translateY(10px);
                `;
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            requestAnimationFrame(() => {
                toast.style.opacity = "1";
                toast.style.transform = "translateY(0)";
            });
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => {
                toast.style.opacity = "0";
                toast.style.transform = "translateY(10px)";
            }, duration);
        } catch (e) {}
    }

    function normalizeDictionaryData(raw) {
        if (!raw) return {};
        const dict = {};
        if (Array.isArray(raw)) {
            for (const item of raw) {
                if (!item || !item.word) continue;
                const key = item.word.toLowerCase().trim();
                const pos = item.pos ? item.pos.trim() : "";
                const def = item.definition ? item.definition.trim() : "";
                const fullDef = pos ? `${pos} ${def}`.trim() : def;
                dict[key] = {
                    w: item.word,
                    d: fullDef,
                    img: 0,
                    imageUrl: item.imageUrl || "",
                    audioFile: item.audioFile || "",
                    segments: item.segments || [],
                    sp: item.exampleEn ? {
                        en: item.exampleEn,
                        zh: item.exampleZh || "",
                        focus: item.focus || "",
                        focus_zh: item.focusZh || ""
                    } : null
                };
            }
        } else if (typeof raw === "object") {
            for (const [k, v] of Object.entries(raw)) {
                dict[k.toLowerCase().trim()] = v;
            }
        }
        return dict;
    }

    function loadCachedDictionary() {
        try {
            const cachedVer = typeof GM_getValue === "function" ? GM_getValue(STORAGE_KEY_VER, null) : null;
            const cachedData = typeof GM_getValue === "function" ? GM_getValue(STORAGE_KEY_VOCAB, null) : null;
            if (cachedVer === SCRIPT_VERSION && cachedData) {
                const parsed = typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;
                if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
                    DICTIONARY = parsed;
                    isVocabReady = true;
                    return true;
                }
            }
        } catch (e) {
            console.warn("[IELTS Assistant] Failed to read cached vocab:", e);
        }
        return false;
    }

    function fetchAndCacheDictionary(notify = false) {
        if (vocabLoadPromise) return vocabLoadPromise;
        vocabLoadPromise = new Promise((resolve, reject) => {
            console.log("[IELTS Assistant] Fetching vocabulary manifest from:", VOCAB_REMOTE_URL);
            const handleSuccess = (raw) => {
                try {
                    const dict = normalizeDictionaryData(raw);
                    const wordCount = Object.keys(dict).length;
                    if (wordCount === 0) {
                        throw new Error("Empty vocabulary received");
                    }
                    DICTIONARY = dict;
                    isVocabReady = true;
                    if (typeof GM_setValue === "function") {
                        GM_setValue(STORAGE_KEY_VOCAB, dict);
                        GM_setValue(STORAGE_KEY_VER, SCRIPT_VERSION);
                    }
                    console.log(`[IELTS Assistant] Vocab loaded & cached: ${wordCount} words.`);
                    if (notify) showMiniNotice(`词库更新成功（共 ${wordCount} 词）`);
                    resolve(dict);
                } catch (err) {
                    console.error("[IELTS Assistant] Failed to parse vocab JSON:", err);
                    if (notify) showMiniNotice("词库解析失败");
                    reject(err);
                }
            };

            if (typeof GM_xmlhttpRequest === "function") {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: VOCAB_REMOTE_URL,
                    headers: { "Cache-Control": "no-cache" },
                    onload: function(res) {
                        if (res.status >= 200 && res.status < 300) {
                            try {
                                const raw = JSON.parse(res.responseText);
                                handleSuccess(raw);
                            } catch (err) {
                                reject(err);
                            }
                        } else {
                            const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
                            if (notify) showMiniNotice(`词库下载失败 (${res.status})`);
                            reject(err);
                        }
                    },
                    onerror: function(err) {
                        console.error("[IELTS Assistant] Network error fetching vocab:", err);
                        if (notify) showMiniNotice("词库下载网络错误");
                        reject(err);
                    }
                });
            } else {
                fetch(VOCAB_REMOTE_URL, { cache: "no-cache" })
                    .then(res => {
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        return res.json();
                    })
                    .then(raw => handleSuccess(raw))
                    .catch(err => {
                        console.error("[IELTS Assistant] Fetch failed:", err);
                        if (notify) showMiniNotice("词库下载失败，请检查网络");
                        reject(err);
                    });
            }
        }).finally(() => {
            vocabLoadPromise = null;
        });
        return vocabLoadPromise;
    }

    // Register Tampermonkey menu command for manual re-fetching
    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("🔄 重新拉取并更新词库", () => {
            showMiniNotice("正在重新拉取最新词库...");
            fetchAndCacheDictionary(true).catch(e => {
                console.error("[IELTS Assistant] Manual reload error:", e);
            });
        });
    }

    // Initialize: load from local cache if version matches, otherwise fetch & cache
    if (!loadCachedDictionary()) {
        fetchAndCacheDictionary(false).catch(e => {
            console.warn("[IELTS Assistant] Initial vocab fetch failed:", e);
        });
    }
    // ==========================================
    // Core Configuration & Constants
    // ==========================================
    const REMOTE_IMAGE_BASE = "https://ielts-vacab-fantasia-images.yangdongxing.workers.dev/";
    const EDGE_PADDING = 12;

    // ==========================================
    // Irregular Inflections Mapping & Skip Words
    // ==========================================
    const IRREGULAR_LEMMAS = {
        was: "be", were: "be", been: "be",
        went: "go", gone: "go",
        saw: "see", seen: "see",
        took: "take", taken: "take",
        wrote: "write", written: "write",
        spoke: "speak", spoken: "speak",
        lost: "lose",
        began: "begin", begun: "begin",
        felt: "feel",
        found: "find",
        gave: "give", given: "give",
        ran: "run",
        swam: "swim", swum: "swim",
        flew: "fly", flown: "fly",
        built: "build",
        taught: "teach",
        thought: "think",
        bought: "buy",
        caught: "catch",
        drew: "draw", drawn: "draw",
        drove: "drive", driven: "drive",
        ate: "eat", eaten: "eat",
        fell: "fall", fallen: "fall",
        froze: "freeze", frozen: "freeze",
        grew: "grow", grown: "grow",
        held: "hold",
        hid: "hide", hidden: "hide",
        knew: "know", known: "know",
        laid: "lay", lain: "lie",
        led: "lead",
        left: "leave",
        made: "make",
        meant: "mean",
        met: "meet",
        paid: "pay",
        rode: "ride", ridden: "ride",
        rose: "rise", risen: "rise",
        said: "say",
        sold: "sell",
        sent: "send",
        shook: "shake", shaken: "shake",
        shone: "shine",
        shot: "shoot",
        showed: "show", shown: "show",
        shut: "shut",
        slept: "sleep",
        slid: "slide",
        spent: "spend",
        stood: "stand",
        stole: "steal", stolen: "steal",
        struck: "strike", stricken: "strike",
        swept: "sweep",
        swung: "swing",
        told: "tell",
        threw: "throw", thrown: "throw",
        understood: "understand",
        woke: "wake", woken: "wake",
        wore: "wear", worn: "wear",
        won: "win",
        wound: "wind",
        children: "child",
        men: "man",
        women: "woman",
        feet: "foot",
        teeth: "tooth",
        geese: "goose",
        mice: "mouse",
        criteria: "criterion",
        phenomena: "phenomenon"
    };

    const SKIP_WORDS = new Set([
        "the", "a", "an", "is", "am", "are", "was", "were", "be", "been", "being",
        "he", "she", "it", "they", "we", "you", "i", "me", "him", "her", "them", "us",
        "and", "or", "but", "if", "so", "as", "to", "in", "on", "at", "by", "for", "of", "with",
        "this", "that", "these", "those", "who", "which", "what", "where", "when", "why", "how",
        "not", "no", "yes", "can", "could", "will", "would", "shall", "should", "may", "might", "must"
    ]);

    function getWordLemmas(value) {
        const lemmas = new Set();
        if (!value) return lemmas;
        const lower = value.toLowerCase().replace(/[^a-z]/g, "");
        if (!lower || lower.length < 2) return lemmas;

        if (IRREGULAR_LEMMAS[lower]) {
            lemmas.add(IRREGULAR_LEMMAS[lower]);
        }

        // -ies -> -y
        if (lower.endsWith("ies") && lower.length > 4) {
            lemmas.add(lower.slice(0, -3) + "y");
        } else if (lower.endsWith("es") && lower.length > 3) {
            lemmas.add(lower.slice(0, -2));
            lemmas.add(lower.slice(0, -1));
        } else if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 2) {
            lemmas.add(lower.slice(0, -1));
        }

        // -ied -> -y
        if (lower.endsWith("ied") && lower.length > 4) {
            lemmas.add(lower.slice(0, -3) + "y");
        } else if (lower.endsWith("ed") && lower.length > 3) {
            lemmas.add(lower.slice(0, -2));
            lemmas.add(lower.slice(0, -1));
            if (lower.length > 4 && lower[lower.length - 3] === lower[lower.length - 4]) {
                lemmas.add(lower.slice(0, -3));
            }
        }

        // -ing
        if (lower.endsWith("ying") && lower.length > 4) {
            lemmas.add(lower.slice(0, -4) + "ie");
        } else if (lower.endsWith("ing") && lower.length > 4) {
            lemmas.add(lower.slice(0, -3));
            lemmas.add(lower.slice(0, -3) + "e");
            if (lower.length > 5 && lower[lower.length - 4] === lower[lower.length - 5]) {
                lemmas.add(lower.slice(0, -4));
            }
            if (lower.endsWith("lling") && lower.length > 5) {
                lemmas.add(lower.slice(0, -5) + "l");
            }
        }

        // -ly / -ily
        if (lower.endsWith("ily") && lower.length > 4) {
            lemmas.add(lower.slice(0, -3) + "y");
        } else if (lower.endsWith("ly") && lower.length > 4) {
            lemmas.add(lower.slice(0, -2));
        }

        return lemmas;
    }

    function lookupWord(token) {
        if (!token) return null;
        const clean = token.toLowerCase().trim();
        if (SKIP_WORDS.has(clean)) return null;

        if (DICTIONARY[clean]) return DICTIONARY[clean];

        const candidates = getWordLemmas(clean);
        for (const cand of candidates) {
            if (DICTIONARY[cand] && !SKIP_WORDS.has(cand)) {
                return DICTIONARY[cand];
            }
        }
        return null;
    }

    // ==========================================
    // Smart Voice Selection & Speech
    // ==========================================
    const _voiceCache = { en: null, zh: null, ready: false };

    function _initVoices() {
        if (_voiceCache.ready) return;
        const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        if (!voices.length) return;

        const isEdge = typeof navigator !== "undefined" && (/Edg\//i.test(navigator.userAgent) || /Edge\//i.test(navigator.userAgent));
        const enVoices = voices.filter(v => v.lang && v.lang.startsWith("en"));
        const zhVoices = voices.filter(v => v.lang && (v.lang.startsWith("zh-CN") || v.lang.startsWith("zh_CN") || v.lang.startsWith("zh-TW") || v.lang === "zh-CN"));

        // Microsoft Edge: prioritize Microsoft Natural neural voices (Aria/Jenny/Xiaoxiao/Yunxi)
        if (isEdge) {
            const edgeEnPref = [
                "Microsoft Aria Online (Natural) - English (United States)",
                "Microsoft Jenny Online (Natural) - English (United States)",
                "Microsoft Guy Online (Natural) - English (United States)",
                "Microsoft Christopher Online (Natural) - English (United States)",
                "Microsoft Eric Online (Natural) - English (United States)",
                "Microsoft Sonia Online (Natural) - English (United Kingdom)",
                "Microsoft Ryan Online (Natural) - English (United Kingdom)",
                "Microsoft Libby Online (Natural) - English (United Kingdom)",
                "Microsoft Aria (Natural) - English (United States)",
                "Microsoft Jenny (Natural) - English (United States)",
                "Microsoft Guy (Natural) - English (United States)",
            ];
            for (const name of edgeEnPref) {
                const found = enVoices.find(v => v.name === name);
                if (found) { _voiceCache.en = found; break; }
            }
            if (!_voiceCache.en) {
                _voiceCache.en = enVoices.find(v => /Microsoft.*Natural/i.test(v.name))
                    || enVoices.find(v => /Aria|Jenny|Guy|Christopher|Sonia/i.test(v.name))
                    || enVoices.find(v => /Microsoft/i.test(v.name));
            }

            const edgeZhPref = [
                "Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)",
                "Microsoft Yunxi Online (Natural) - Chinese (Mainland)",
                "Microsoft Yunjian Online (Natural) - Chinese (Mainland)",
                "Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)",
                "Microsoft Yunyang Online (Natural) - Chinese (Mainland)",
                "Microsoft Xiaoxiao (Natural) - Chinese (Mainland)",
                "Microsoft Yunxi (Natural) - Chinese (Mainland)",
            ];
            for (const name of edgeZhPref) {
                const found = zhVoices.find(v => v.name === name);
                if (found) { _voiceCache.zh = found; break; }
            }
            if (!_voiceCache.zh) {
                _voiceCache.zh = zhVoices.find(v => /Microsoft.*Natural/i.test(v.name))
                    || zhVoices.find(v => /Xiaoxiao|Yunxi|Yunjian|Xiaoyi/i.test(v.name))
                    || zhVoices.find(v => /Microsoft/i.test(v.name));
            }
        }

        // Chrome / non-Edge / fallback: keep existing voice selection untouched
        if (!_voiceCache.en) {
            const enPref = [
                "Siri (Voice 1)", "Siri (Voice 2)", "Siri (Voice 3)", "Siri (Voice 4)", "Siri (Voice 5)",
                "Samantha (Enhanced)", "Samantha (Premium)", "Samantha",
                "Alex",
                "Daniel (Enhanced)", "Daniel (Premium)", "Daniel",
                "Karen (Enhanced)", "Karen (Premium)", "Karen",
                "Moira (Enhanced)", "Moira",
                "Fred", "Victoria",
                "Google US English", "Google UK English Female",
            ];
            for (const name of enPref) {
                const found = enVoices.find(v => v.name === name);
                if (found) { _voiceCache.en = found; break; }
            }
            if (!_voiceCache.en) {
                _voiceCache.en = enVoices.find(v => /premium|enhanced|natural/i.test(v.name)) || enVoices[0] || null;
            }
        }

        if (!_voiceCache.zh) {
            const zhPref = [
                "Tingting (Enhanced)", "Tingting (Premium)", "Tingting",
                "Sinji (Enhanced)", "Sinji (Premium)", "Sinji",
                "Google 普通话（中国大陆）", "Google 中文（普通话）",
            ];
            for (const name of zhPref) {
                const found = zhVoices.find(v => v.name === name);
                if (found) { _voiceCache.zh = found; break; }
            }
            if (!_voiceCache.zh) {
                _voiceCache.zh = zhVoices.find(v => /premium|enhanced|natural/i.test(v.name)) || zhVoices[0] || null;
            }
        }

        _voiceCache.ready = true;
        console.log("[ISA] Voices selected (" + (isEdge ? "Edge" : "Chrome/Standard") + ") — EN:", _voiceCache.en ? _voiceCache.en.name : "(default)", "| ZH:", _voiceCache.zh ? _voiceCache.zh.name : "(default)");
    }

    // Chrome loads voices async — listen for the event
    if (window.speechSynthesis) {
        _initVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            _voiceCache.ready = false;
            _initVoices();
        };
    }

    function _applyVoice(utter, lang) {
        _initVoices();
        const isZh = lang.startsWith("zh");
        const cached = isZh ? _voiceCache.zh : _voiceCache.en;
        if (cached) {
            utter.voice = cached;
        }
        utter.lang = lang;
        utter.rate = isZh ? 0.95 : 0.92;
    }

    // ==========================================
    // Unified Speech Subsystem (Siri Priority + Fast Fallback)
    // ==========================================
    let activeSpeechSSE = null;
    let activeSpeechPollTimer = null;

    function stopAllSpeech() {
        if (activeSpeechSSE) {
            try { activeSpeechSSE.close(); } catch (e) {}
            activeSpeechSSE = null;
        }
        if (activeSpeechPollTimer) {
            clearInterval(activeSpeechPollTimer);
            activeSpeechPollTimer = null;
        }
        if (window.speechSynthesis) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
        }
        if (typeof clearSpeechHighlights === "function") {
            try { clearSpeechHighlights(); } catch (e) {}
        }
        document.querySelectorAll(".isa-breakdown-phrase.is-speaking-phrase").forEach(el => el.classList.remove("is-speaking-phrase"));
        if (typeof memoryModalRefs !== "undefined" && memoryModalRefs) {
            if (memoryModalRefs.word) memoryModalRefs.word.classList.remove("is-speaking");
            if (memoryModalRefs.translation) memoryModalRefs.translation.classList.remove("is-speaking");
            if (memoryModalRefs.exampleEnglish) memoryModalRefs.exampleEnglish.classList.remove("is-speaking");
            if (memoryModalRefs.exampleChinese) memoryModalRefs.exampleChinese.classList.remove("is-speaking");
        }
        document.querySelectorAll(".isa-trans-btn.speak-unified.speaking, .isa-trans-btn.select-clean.speaking, .isa-trans-btn.speak.speaking").forEach(btn => {
            btn.classList.remove("speaking", "ready");
            btn.textContent = "🎧 朗读段落";
            btn._stepIndex = -1;
            btn._isSpeaking = false;
            btn._isSiriSpeaking = false;
        });
        return fetch("http://127.0.0.1:8777/api/siri_speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "stop" })
        }).catch(() => {});
    }

    // Backwards-compatible aliases
    const stopSiriPlayback = stopAllSpeech;
    const stopModalSpeech = stopAllSpeech;
    const stopModalExampleSpeech = stopAllSpeech;

    function startSiriPlayback(text, count = 1) {
        return fetch("http://127.0.0.1:8777/api/siri_speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "speak", text, count })
        }).then(res => {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        });
    }

    function checkSiriStatus() {
        return fetch("http://127.0.0.1:8777/api/siri_speak")
            .then(res => res.json())
            .catch(() => ({ speaking: false }));
    }

    function speakChinese(text, onEnd = null) {
        if (!text) {
            if (typeof onEnd === "function") onEnd();
            return;
        }
        if (!window.speechSynthesis) {
            if (typeof onEnd === "function") onEnd();
            return;
        }
        try {
            window.speechSynthesis.cancel();
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
            const utter = new SpeechSynthesisUtterance(text);
            _applyVoice(utter, "zh-CN");
            if (typeof onEnd === "function") {
                utter.onend = onEnd;
                utter.onerror = onEnd;
            }
            setTimeout(() => {
                if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                }
                window.speechSynthesis.speak(utter);
            }, 50);
        } catch (e) {
            console.warn("[ISA] speakChinese error:", e);
            if (typeof onEnd === "function") onEnd();
        }
    }

    function playEnglishSpeech(text, options = {}) {
        const cleanText = (text || "")
            .replace(/[\u2013\u2014]/g, "-")
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201c\u201d]/g, '"')
            .replace(/\u2026/g, "...")
            .replace(/\s+/g, " ")
            .trim();

        if (!cleanText) {
            if (typeof options.onEnd === "function") options.onEnd();
            return;
        }

        stopAllSpeech();

        const count = Math.max(1, parseInt(options.count, 10) || 1);
        const el = options.element;

        if (el) {
            el.classList.add("is-speaking");
        }

        let isCompleted = false;
        const triggerEnd = () => {
            if (isCompleted) return;
            isCompleted = true;
            if (activeSpeechSSE) {
                try { activeSpeechSSE.close(); } catch (e) {}
                activeSpeechSSE = null;
            }
            if (activeSpeechPollTimer) {
                clearInterval(activeSpeechPollTimer);
                activeSpeechPollTimer = null;
            }
            if (el) {
                el.classList.remove("is-speaking", "speaking", "ready");
            }
            if (typeof options.onEnd === "function") {
                options.onEnd();
            }
        };

        // Fallback runner using browser speechSynthesis
        const runBrowserFallback = () => {
            if (!window.speechSynthesis) {
                triggerEnd();
                return;
            }
            try {
                window.speechSynthesis.cancel();
                if (window.speechSynthesis.paused) window.speechSynthesis.resume();

                let currentLoop = 0;
                const playLoop = () => {
                    if (isCompleted) return;
                    const utter = new SpeechSynthesisUtterance(cleanText);
                    _applyVoice(utter, "en-US");

                    utter.onstart = () => {
                        if (currentLoop === 0 && typeof options.onStart === "function") {
                            options.onStart();
                        }
                        if (typeof options.onLoopStart === "function") {
                            options.onLoopStart({ loopIndex: currentLoop, totalLoops: count });
                        }
                    };

                    utter.onboundary = (ev) => {
                        if (ev.name === "word" && typeof options.onWord === "function") {
                            options.onWord({
                                charIndex: ev.charIndex,
                                length: ev.charLength || 1,
                                rawWord: ""
                            });
                        }
                    };

                    utter.onend = () => {
                        if (typeof options.onLoopEnd === "function") {
                            options.onLoopEnd();
                        }
                        currentLoop++;
                        if (currentLoop < count && !isCompleted) {
                            setTimeout(playLoop, 80);
                        } else {
                            triggerEnd();
                        }
                    };

                    utter.onerror = (err) => {
                        console.warn("[ISA] Browser speech error:", err);
                        triggerEnd();
                    };

                    setTimeout(() => {
                        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
                        window.speechSynthesis.speak(utter);
                    }, 50);
                };

                playLoop();
            } catch (e) {
                console.warn("[ISA] Fallback speech error:", e);
                triggerEnd();
            }
        };

        // Request native Siri playback via local server
        startSiriPlayback(cleanText, count)
            .then(() => {
                if (typeof options.onStart === "function") {
                    options.onStart();
                }
                try {
                    const es = new EventSource("http://127.0.0.1:8777/api/siri_events");
                    activeSpeechSSE = es;

                    es.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            if (data.type === "loop_start") {
                                if (typeof options.onLoopStart === "function") {
                                    options.onLoopStart({
                                        loopIndex: data.loop_index || 0,
                                        totalLoops: data.total_loops || count
                                    });
                                }
                            } else if (data.type === "word") {
                                if (typeof options.onWord === "function") {
                                    options.onWord({
                                        charIndex: data.char_index,
                                        length: data.char_length || (data.raw_word ? data.raw_word.length : 0),
                                        rawWord: data.raw_word
                                    });
                                }
                            } else if (data.type === "loop_end") {
                                if (typeof options.onLoopEnd === "function") {
                                    options.onLoopEnd();
                                }
                            } else if (data.type === "done" || data.type === "stop") {
                                triggerEnd();
                            }
                        } catch (parseErr) {
                            console.warn("[ISA] Siri SSE parse error:", parseErr);
                        }
                    };

                    es.onerror = () => {
                        // Keep listening or let poll timer catch completion
                    };

                    // Backup safety polling
                    if (activeSpeechPollTimer) clearInterval(activeSpeechPollTimer);
                    activeSpeechPollTimer = setInterval(() => {
                        checkSiriStatus().then(st => {
                            if (!st || !st.speaking) {
                                triggerEnd();
                            }
                        }).catch(() => triggerEnd());
                    }, 600);
                } catch (esErr) {
                    console.warn("[ISA] EventSource error:", esErr);
                    runBrowserFallback();
                }
            })
            .catch(() => {
                // Server offline or failed: instant graceful failover to browser native voice
                runBrowserFallback();
            });
    }

    function playBilingualSpeech(enText, zhText, options = {}) {
        const hasZh = Boolean(zhText);
        const condition = options.condition || (() => true);

        playEnglishSpeech(enText, {
            ...options,
            element: options.element,
            onEnd: () => {
                if (hasZh && condition()) {
                    if (options.zhElement) options.zhElement.classList.add("is-speaking");
                    speakChinese(zhText, () => {
                        if (options.zhElement) options.zhElement.classList.remove("is-speaking");
                        if (typeof options.onEnd === "function") options.onEnd();
                    });
                } else {
                    if (typeof options.onEnd === "function") options.onEnd();
                }
            }
        });
    }

    // Backwards-compatible aliases
    function speakText(text, lang = "en-US", onEnd = null) {
        if (lang && lang.startsWith("zh")) {
            speakChinese(text, onEnd);
        } else {
            playEnglishSpeech(text, { onEnd });
        }
    }
    const speakWithSiriPriority = (text, onEnd) => playEnglishSpeech(text, { onEnd });
    const speakBilingualWithSiriPriority = (en, zh, type = "word") => {
        const isWord = type === "word";
        playBilingualSpeech(en, zh, {
            element: isWord ? (typeof memoryModalRefs !== "undefined" && memoryModalRefs?.word) : (typeof memoryModalRefs !== "undefined" && memoryModalRefs?.exampleEnglish),
            zhElement: isWord ? (typeof memoryModalRefs !== "undefined" && memoryModalRefs?.translation) : (typeof memoryModalRefs !== "undefined" && memoryModalRefs?.exampleChinese),
            condition: isMemoryModalOpen
        });
    };

    const POS_SPEECH_MAP = {
        n: "名词",
        v: "动词",
        adj: "形容词",
        adv: "副词",
        prep: "介词",
        pron: "代词",
        conj: "连词",
        det: "限定词",
        int: "感叹词",
        num: "数词",
        ord: "序数词",
        vt: "及物动词",
        vi: "不及物动词"
    };

    /**
     * Formats dictionary definition for natural Chinese TTS speech,
     * expanding part-of-speech abbreviations (e.g. n. -> 名词, v. -> 动词, adj. -> 形容词)
     * and removing phonetic notation while retaining meaning pauses.
     */
    function formatChineseDefinitionForSpeech(def) {
        if (!def) return "";

        let text = def;
        // 1. Remove phonetics between slashes like /ˈdez.ət/
        text = text.replace(/\/[^/\s]+\//g, "");

        // 2. Extract and expand leading POS like "n." or "n./v." or "adj."
        const posMatch = text.match(/^([a-zA-Z\./]+)\s*/);
        let spokenPos = "";
        if (posMatch) {
            const rawPos = posMatch[1];
            const parts = rawPos.split(/[\/\.]+/).filter(Boolean);
            const mapped = parts.map(p => POS_SPEECH_MAP[p.toLowerCase()] || p);
            if (mapped.length > 0) {
                spokenPos = mapped.join("、") + "，";
            }
            text = text.slice(posMatch[0].length);
        }

        // 3. Remove bracket notes like [~s], [英], [美]
        text = text.replace(/\[[^\]]*\]/g, "");

        // 4. Replace semicolons / slashes with commas for natural speech pause
        text = text.replace(/[；;/\\]+/g, "，");
        text = text.replace(/，\s*，/g, "，");
        text = text.replace(/^[，\s]+|[，\s]+$/g, "");

        return spokenPos + text;
    }

    // ==========================================
    // Word Image Resolution & Fallback
    // ==========================================
    function getImageUrl(word) {
        if (!word) return "";
        const capWord = word.charAt(0).toUpperCase() + word.slice(1);
        return REMOTE_IMAGE_BASE + encodeURIComponent(capWord) + ".webp";
    }

    const preloadedImageCache = new Map();
    function preloadWordImage(word) {
        if (!word) return;
        const key = word.toLowerCase();
        if (preloadedImageCache.has(key)) return;

        const remoteUrl = getImageUrl(word);
        const img = new Image();
        preloadedImageCache.set(key, img);
        img.src = remoteUrl;
    }

    function setupImageFallback(imgElement) {
        if (!imgElement) return;
        imgElement.onerror = function() {
            imgElement.classList.add("is-missing");
            imgElement.style.opacity = "0.2";
        };
    }

    function answerKey(value) {
        return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    // ==========================================
    // Telemetry & Data Tracking (数据统计打点系统)
    // ==========================================
    const STATS_STORAGE_KEY = "ielts_vocab_fantasia_stats";

    function loadStats() {
        let stats = null;
        if (typeof GM_getValue === "function") {
            try {
                const gmData = GM_getValue(STATS_STORAGE_KEY, null);
                if (gmData) stats = (typeof gmData === "string") ? JSON.parse(gmData) : gmData;
            } catch (e) {}
        }
        if (!stats) {
            try {
                const raw = localStorage.getItem(STATS_STORAGE_KEY);
                if (raw) stats = JSON.parse(raw);
            } catch (e) {}
        }
        if (!stats) return { summary: { marks: 0, modalOpens: 0, inputSuccess: 0 }, words: {} };

        // Data sanitization: sanitize any legacy corrupted records where inputSuccess > modalOpens
        if (stats.words && typeof stats.words === "object") {
            let totalMarks = 0, totalModal = 0, totalSuccess = 0;
            Object.values(stats.words).forEach(entry => {
                if (!entry || typeof entry !== "object") return;
                if (entry.modalOpens > 0 && (entry.inputSuccess || 0) > entry.modalOpens) {
                    entry.inputSuccess = entry.modalOpens;
                }
                totalMarks += (entry.marks || 0);
                totalModal += (entry.modalOpens || 0);
                totalSuccess += (entry.inputSuccess || 0);
            });
            stats.summary = { marks: totalMarks, modalOpens: totalModal, inputSuccess: totalSuccess };
        }
        return stats;
    }

    function saveStats(stats) {
        if (typeof GM_setValue === "function") {
            try {
                GM_setValue(STATS_STORAGE_KEY, stats);
            } catch (e) {}
        }
        try {
            localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
        } catch (e) {}

        window.dispatchEvent(new CustomEvent("ielts_stats_updated", { detail: stats }));
    }

    function isStatsPage() {
        try {
            if (document.querySelector('meta[name="ielts-vocab-stats-page"]')) return true;
            if (document.querySelector('meta[name="ielts-vocab-disable-plugin"]')) return true;
            if (document.getElementById("stats-page-container")) return true;
            if (document.title && (document.title.includes("打点与学习统计") || document.title.includes("数据管理台"))) return true;
            const loc = window.location;
            if (!loc) return false;
            const path = (loc.pathname || "").toLowerCase();
            const href = (loc.href || "").toLowerCase();
            return path.endsWith("stats.html") || href.includes("stats.html") || path.endsWith("/stats") || href.includes("/stats");
        } catch (e) {
            return false;
        }
    }

    function trackWordEvent(word, eventType) {
        if (!word) return;
        // 统计页面（stats.html）中的任何操作（查词覆层、拼写练习校验等），均不应被打点记录
        if (isStatsPage()) return;

        const stats = loadStats();
        const key = word.toLowerCase().trim();
        const now = Date.now();

        if (!stats.words) stats.words = {};
        if (!stats.summary) stats.summary = { marks: 0, modalOpens: 0, inputSuccess: 0 };

        if (!stats.words[key]) {
            stats.words[key] = {
                w: word,
                marks: 0,
                modalOpens: 0,
                inputSuccess: 0,
                firstAdded: now,
                lastUpdated: now
            };
        }

        const entry = stats.words[key];
        entry.lastUpdated = now;

        if (eventType === "mark") {
            entry.marks = (entry.marks || 0) + 1;
        } else if (eventType === "modal_open") {
            entry.modalOpens = (entry.modalOpens || 0) + 1;
        } else if (eventType === "input_success") {
            entry.inputSuccess = (entry.inputSuccess || 0) + 1;
        }

        // Logical invariant: inputSuccess should never exceed modalOpens (if modalOpens > 0)
        if (entry.modalOpens > 0 && entry.inputSuccess > entry.modalOpens) {
            entry.inputSuccess = entry.modalOpens;
        }

        // Accurately recalculate totals from all word entries
        let totalMarks = 0, totalModal = 0, totalSuccess = 0;
        Object.values(stats.words).forEach(w => {
            if (w.modalOpens > 0 && (w.inputSuccess || 0) > w.modalOpens) {
                w.inputSuccess = w.modalOpens;
            }
            totalMarks += (w.marks || 0);
            totalModal += (w.modalOpens || 0);
            totalSuccess += (w.inputSuccess || 0);
        });
        stats.summary = { marks: totalMarks, modalOpens: totalModal, inputSuccess: totalSuccess };

        saveStats(stats);
    }

    const rootWin = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    rootWin.ieltsVocabStats = {
        getStats: loadStats,
        setStats: (newStats) => {
            saveStats(newStats);
            window.dispatchEvent(new CustomEvent("ielts_stats_updated", { detail: newStats }));
        },
        getSummary: () => loadStats().summary,
        getTopWords: (sortBy = "marks", limit = 10) => {
            const stats = loadStats();
            return Object.values(stats.words || {})
                .sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0))
                .slice(0, limit);
        },
        exportJSON: () => JSON.stringify(loadStats(), null, 2),
        clearStats: () => {
            if (typeof GM_setValue === "function") {
                try { GM_setValue(STATS_STORAGE_KEY, null); } catch (e) {}
            }
            try { localStorage.removeItem(STATS_STORAGE_KEY); } catch (e) {}
            window.dispatchEvent(new CustomEvent("ielts_stats_updated", { detail: loadStats() }));
            console.log("[IELTS Stats] Telemetry data cleared.");
        }
    };

    rootWin.ieltsVocabAssistant = {
        openMemoryModal: (wordOrEntry, markEl = null) => {
            let entry = typeof wordOrEntry === "string" ? lookupWord(wordOrEntry) : wordOrEntry;
            if (!entry && typeof wordOrEntry === "string") {
                const clean = wordOrEntry.toLowerCase().trim();
                entry = DICTIONARY[clean] || { w: wordOrEntry, d: "" };
            }
            if (entry) {
                openMemoryModal(entry, markEl);
            }
        },
        closeMemoryModal: () => {
            closeMemoryModal();
        },
        isMemoryModalOpen: () => {
            return isMemoryModalOpen();
        },
        lookupWord: (word) => {
            return lookupWord(word);
        },
        version: SCRIPT_VERSION,
        active: true
    };
    if (typeof window !== "undefined" && window !== rootWin) {
        try { window.ieltsVocabAssistant = rootWin.ieltsVocabAssistant; } catch (e) {}
    }

    window.addEventListener("ielts_open_memory_modal", (e) => {
        const detail = e.detail || {};
        const word = detail.word;
        if (word) {
            let entry = typeof word === "string" ? lookupWord(word) : word;
            if (!entry && typeof word === "string") {
                const clean = word.toLowerCase().trim();
                entry = DICTIONARY[clean] || { w: word, d: "" };
            }
            if (entry) {
                openMemoryModal(entry, detail.markEl || null);
            }
        }
    });

    window.addEventListener("ielts_close_memory_modal", () => {
        closeMemoryModal();
    });

    window.addEventListener("ielts_stats_save_request", (e) => {
        if (e.detail && typeof e.detail === "object") {
            saveStats(e.detail);
        }
    });

    // Global Storage Synchronization & Data Self-healing (全网页启动自执行存储同步与数据自愈)
    // If on stats dashboard page, smart-merge telemetry storage without terminating plugin execution
    if (isStatsPage()) {
        try {
            const gmData = loadStats();
            let localData = null;
            try {
                const raw = localStorage.getItem(STATS_STORAGE_KEY);
                if (raw) localData = JSON.parse(raw);
            } catch (e) {}

            const merged = {
                summary: { marks: 0, modalOpens: 0, inputSuccess: 0 },
                words: { ...(gmData?.words || {}) }
            };

            let hasNewFromLocal = false;
            if (localData && localData.words) {
                Object.keys(localData.words).forEach(k => {
                    const localItem = localData.words[k];
                    const gmItem = merged.words[k];
                    if (!gmItem || (localItem.lastUpdated || 0) >= (gmItem.lastUpdated || 0)) {
                        merged.words[k] = localItem;
                        hasNewFromLocal = true;
                    } else {
                        gmItem.marks = Math.max(gmItem.marks || 0, localItem.marks || 0);
                        gmItem.modalOpens = Math.max(gmItem.modalOpens || 0, localItem.modalOpens || 0);
                        gmItem.inputSuccess = Math.max(gmItem.inputSuccess || 0, localItem.inputSuccess || 0);
                    }
                });
            }

            let totalMarks = 0, totalModal = 0, totalSuccess = 0;
            Object.values(merged.words).forEach(w => {
                if (!w || typeof w !== "object") return;
                totalMarks += (w.marks || 0);
                totalModal += (w.modalOpens || 0);
                totalSuccess += (w.inputSuccess || 0);
            });
            merged.summary = { marks: totalMarks, modalOpens: totalModal, inputSuccess: totalSuccess };

            localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(merged));
            if (hasNewFromLocal) {
                saveStats(merged);
            }

            window.dispatchEvent(new CustomEvent("ielts_stats_loaded_from_tampermonkey", { detail: merged }));
            console.log("[ISA] Stats page detected: Storage synced, telemetry tracking suppressed, modal execution enabled.");
        } catch (e) {}
    }

    // ==========================================
    // Exact Project CSS Injection
    // ==========================================
    function injectProjectStyles() {
        if (document.getElementById("isa-exact-project-styles")) return;
        const style = document.createElement("style");
        style.id = "isa-exact-project-styles";
        style.textContent = `
            strong.geek-vocab-mark, em.geek-vocab-mark {
                position: relative !important;
                display: inline !important;
                color: inherit !important;
                font-weight: 600 !important;
                text-decoration: none !important;
                background-color: rgba(244, 63, 94, 0.18) !important;
                border-radius: 3px !important;
                padding: 1px 3.5px !important;
                box-decoration-break: clone !important;
                -webkit-box-decoration-break: clone !important;
                cursor: pointer !important;
                transition: background-color 0.15s ease !important;
            }
            strong.geek-vocab-mark:hover, em.geek-vocab-mark:hover {
                background-color: rgba(244, 63, 94, 0.3) !important;
            }
            strong.geek-vocab-mark:active, em.geek-vocab-mark:active {
                cursor: grabbing !important;
            }

            .translation-bubble {
                position: absolute !important;
                bottom: 125% !important;
                left: 50% !important;
                transform: translateX(-50%) scale(0.8) !important;
                background-color: #e74c3c !important;
                color: #ffffff !important;
                padding: 6px 12px !important;
                border-radius: 6px !important;
                font-size: 14px !important;
                font-weight: normal !important;
                font-style: normal !important;
                white-space: nowrap !important;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2) !important;
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
                user-select: none !important;
                -webkit-user-select: none !important;
                transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease !important;
                z-index: 99999 !important;
            }
            .translation-bubble::after {
                content: "" !important;
                position: absolute !important;
                top: 100% !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                border-width: 6px !important;
                border-style: solid !important;
                border-color: #e74c3c transparent transparent transparent !important;
            }

            .translation-bubble.geek-has-word-image {
                background-color: #172033 !important;
                bottom: calc(100% + 8px) !important;
                left: 50% !important;
                top: auto !important;
                width: 240px !important;
                max-width: min(240px, calc(100vw - 32px)) !important;
                padding: 8px !important;
                white-space: normal !important;
                text-align: left !important;
                box-sizing: border-box !important;
                transform-origin: 50% 100% !important;
                pointer-events: none !important;
                border-radius: 8px !important;
            }
            .translation-bubble.geek-has-word-image::after {
                border-color: #172033 transparent transparent transparent !important;
            }
            .translation-bubble.geek-has-word-image.geek-bubble-below {
                top: calc(100% + 8px) !important;
                bottom: auto !important;
                transform-origin: 50% 0 !important;
            }
            .translation-bubble.geek-has-word-image.geek-bubble-below::after {
                top: auto !important;
                bottom: 100% !important;
                border-color: transparent transparent #172033 transparent !important;
            }

            @media (hover: hover) {
                strong.geek-vocab-mark:hover .translation-bubble,
                em.geek-vocab-mark:hover .translation-bubble {
                    opacity: 1 !important;
                    visibility: visible !important;
                    transform: translateX(-50%) scale(1) !important;
                    background-color: #e74c3c !important;
                    pointer-events: auto !important;
                }
                strong.geek-vocab-mark:hover .translation-bubble.geek-has-word-image,
                em.geek-vocab-mark:hover .translation-bubble.geek-has-word-image {
                    opacity: 1 !important;
                    visibility: visible !important;
                    transform: translateX(-50%) scale(1) !important;
                    background-color: #172033 !important;
                    pointer-events: auto !important;
                }
                strong.geek-vocab-mark:hover .translation-bubble .geek-bubble-image,
                em.geek-vocab-mark:hover .translation-bubble .geek-bubble-image,
                strong.geek-vocab-mark:hover .translation-bubble .geek-bubble-text,
                em.geek-vocab-mark:hover .translation-bubble .geek-bubble-text {
                    pointer-events: auto !important;
                }
            }

            /* Clicked / Pinned Bubble State */
            strong.geek-vocab-mark.geek-bubble-open .translation-bubble,
            em.geek-vocab-mark.geek-bubble-open .translation-bubble,
            .translation-bubble.force-show {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateX(-50%) scale(1) !important;
                background-color: #172033 !important;
                pointer-events: auto !important;
                z-index: 100000 !important;
            }
            strong.geek-vocab-mark.geek-bubble-open .translation-bubble .geek-bubble-image,
            em.geek-vocab-mark.geek-bubble-open .translation-bubble .geek-bubble-image,
            .translation-bubble.force-show .geek-bubble-image,
            strong.geek-vocab-mark.geek-bubble-open .translation-bubble .geek-bubble-text,
            em.geek-vocab-mark.geek-bubble-open .translation-bubble .geek-bubble-text,
            .translation-bubble.force-show .geek-bubble-text {
                pointer-events: auto !important;
            }

            .geek-bubble-image {
                display: block !important;
                width: 100% !important;
                aspect-ratio: 1 / 1 !important;
                object-fit: cover !important;
                border-radius: 5px !important;
                background: rgba(255,255,255,0.14) !important;
                margin: 0 0 7px !important;
                box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16) !important;
                cursor: pointer !important;
                pointer-events: none !important;
                transition: transform 0.15s ease, filter 0.15s ease !important;
            }
            .geek-bubble-image:hover {
                transform: scale(1.02) !important;
                filter: brightness(1.08) !important;
            }

            .geek-bubble-text {
                display: block !important;
                color: #fff !important;
                font-size: 13px !important;
                line-height: 1.35 !important;
                text-align: center !important;
                overflow-wrap: anywhere !important;
                pointer-events: none !important;
            }

            /* Floating Trigger Button (Textured Obsidian Black -> Vibrant Radiant Red on Hover) */
            .isa-trigger-btn {
                position: fixed !important;
                background: linear-gradient(180deg, #24292f 0%, #15191e 100%) !important;
                color: #ffffff !important;
                border-radius: 9999px !important;
                padding: 7px 18px 7px 13px !important;
                box-shadow: 0 8px 24px -3px rgba(0, 0, 0, 0.45), 0 3px 8px -2px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.18) !important;
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                cursor: pointer !important;
                pointer-events: auto !important;
                transition: all 0.24s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
                z-index: 100000 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                font-size: 14.5px !important;
                font-weight: 700 !important;
                letter-spacing: 0.2px !important;
                border: 1px solid rgba(255, 255, 255, 0.16) !important;
                user-select: none !important;
                -webkit-user-select: none !important;
                animation: isaPop 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
            }
            .isa-trigger-btn:hover {
                transform: translateY(-2.5px) scale(1.035) !important;
                background: linear-gradient(180deg, #ff2e5b 0%, #e1143f 100%) !important;
                border: 1px solid rgba(255, 255, 255, 0.32) !important;
                box-shadow: 0 12px 28px -3px rgba(225, 20, 63, 0.65), 0 5px 12px -2px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
            }
            .isa-trigger-btn:active {
                transform: translateY(0.5px) scale(0.985) !important;
                background: linear-gradient(180deg, #be123c 0%, #9f1239 100%) !important;
                box-shadow: 0 5px 14px -2px rgba(190, 18, 60, 0.5), inset 0 2px 4px rgba(0, 0, 0, 0.2) !important;
            }
            .isa-trigger-icon-wrap {
                position: relative !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 20px !important;
                height: 20px !important;
                flex-shrink: 0 !important;
            }
            .isa-trigger-btn svg.isa-trigger-icon-book {
                width: 18.5px !important;
                height: 18.5px !important;
                fill: none !important;
                stroke: #ffffff !important;
                stroke-width: 2.2 !important;
                stroke-linecap: round !important;
                stroke-linejoin: round !important;
                transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
                animation: isaAiBreathe 3s ease-in-out infinite !important;
                transform-origin: center !important;
                flex-shrink: 0 !important;
            }
            .isa-trigger-btn svg.isa-trigger-icon-sparkle {
                position: absolute !important;
                top: 0px !important;
                right: -7px !important;
                width: 11px !important;
                height: 11px !important;
                fill: #ffffff !important;
                stroke: none !important;
                pointer-events: none !important;
                animation: isaAiSparkle 2.4s ease-in-out infinite !important;
                transform-origin: center !important;
                transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
                flex-shrink: 0 !important;
            }
            .isa-trigger-btn:hover svg.isa-trigger-icon-book {
                transform: rotate(-5deg) scale(1.08) !important;
                filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.95)) !important;
            }
            .isa-trigger-btn:hover svg.isa-trigger-icon-sparkle {
                transform: rotate(90deg) scale(1.3) !important;
                fill: #fff566 !important;
                filter: drop-shadow(0 0 5px #ffffff) drop-shadow(0 0 10px #ffd700) !important;
                animation-play-state: paused !important;
            }

            @keyframes isaAiBreathe {
                0%, 100% {
                    transform: scale(1) translateY(0);
                    filter: drop-shadow(0 0 1.5px rgba(255, 255, 255, 0.4));
                }
                50% {
                    transform: scale(1.06) translateY(-0.8px);
                    filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 9px rgba(125, 211, 252, 0.45));
                }
            }

            @keyframes isaAiSparkle {
                0%, 100% {
                    transform: scale(0.85) rotate(0deg);
                    opacity: 0.75;
                    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.6));
                }
                50% {
                    transform: scale(1.2) rotate(45deg);
                    opacity: 1;
                    filter: drop-shadow(0 0 4px rgba(255, 255, 255, 1)) drop-shadow(0 0 8px rgba(250, 204, 21, 0.85));
                }
            }
            .isa-trigger-text {
                color: #ffffff !important;
                white-space: nowrap !important;
                line-height: 1 !important;
            }

            @keyframes isaPop {
                from { opacity: 0; transform: scale(0.7); }
                to { opacity: 1; transform: scale(1); }
            }

            /* Bilingual Paragraph Translation Block */
            .isa-paragraph-translation {
                margin: 12px 0 16px !important;
                padding: 10px 14px !important;
                background: #f0f9ff !important;
                border-left: 3.5px solid #0284c7 !important;
                border-radius: 6px !important;
                box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04) !important;
                font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Roboto, sans-serif !important;
                font-size: 13.5px !important;
                line-height: 1.65 !important;
                color: #334155 !important;
                position: relative !important;
                transition: all 0.2s ease !important;
                box-sizing: border-box !important;
            }
            .isa-paragraph-translation.is-compact {
                padding: 7px 14px !important;
            }
            .isa-paragraph-translation.is-compact .isa-trans-header {
                margin-bottom: 0 !important;
            }
            .isa-trans-header {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin-bottom: 6px !important;
                user-select: none !important;
            }
            .isa-trans-title {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                font-size: 12px !important;
                font-weight: 600 !important;
                color: #0284c7 !important;
            }
            .isa-trans-status {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                line-height: 1 !important;
                color: #0284c7 !important;
                vertical-align: middle !important;
            }
            .isa-trans-reload-btn {
                background: transparent !important;
                border: none !important;
                cursor: pointer !important;
                font-size: 12.5px !important;
                padding: 0 !important;
                margin: 0 !important;
                line-height: 1 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: transform 0.2s ease, opacity 0.2s ease !important;
                opacity: 0.85 !important;
                user-select: none !important;
            }
            .isa-trans-reload-btn:hover {
                opacity: 1 !important;
                transform: scale(1.22) rotate(60deg) !important;
            }
            .isa-trans-reload-btn:active {
                transform: scale(0.95) rotate(180deg) !important;
            }
            .isa-trans-tools {
                display: inline-flex !important;
                align-items: center !important;
                gap: 8px !important;
            }
            .isa-trans-btn {
                background: transparent !important;
                border: none !important;
                cursor: pointer !important;
                font-size: 12px !important;
                color: #64748b !important;
                padding: 1px 5px !important;
                border-radius: 4px !important;
                transition: color 0.15s, background-color 0.15s !important;
            }
            .isa-trans-btn.speak {
                display: inline-flex !important;
                align-items: center !important;
                gap: 3px !important;
                color: #0284c7 !important;
                font-weight: 500 !important;
                background: rgba(2, 132, 199, 0.08) !important;
                padding: 2px 7px !important;
                border-radius: 4px !important;
            }
            .isa-trans-btn.speak:hover {
                background: rgba(2, 132, 199, 0.18) !important;
                color: #0369a1 !important;
            }
            .isa-trans-btn.speak.speaking {
                background: #e0f2fe !important;
                color: #0369a1 !important;
                font-weight: 600 !important;
            }
            .isa-trans-btn.speak-unified,
            .isa-trans-btn.select-clean {
                display: inline-flex !important;
                align-items: center !important;
                gap: 3px !important;
                color: #0284c7 !important;
                font-weight: 500 !important;
                background: rgba(2, 132, 199, 0.08) !important;
                padding: 2px 7px !important;
                border-radius: 4px !important;
                font-size: 11.5px !important;
                transition: all 0.2s ease !important;
            }
            .isa-trans-btn.speak-unified:hover,
            .isa-trans-btn.select-clean:hover {
                background: rgba(2, 132, 199, 0.18) !important;
                color: #0369a1 !important;
            }
            .isa-trans-btn.speak-unified.ready,
            .isa-trans-btn.select-clean.ready {
                background: rgba(34, 197, 94, 0.15) !important;
                color: #15803d !important;
                font-weight: 600 !important;
            }
            .isa-trans-btn.speak-unified.speaking,
            .isa-trans-btn.select-clean.speaking {
                background: rgba(225, 29, 72, 0.12) !important;
                color: #e11d48 !important;
                font-weight: 600 !important;
            }
            .isa-trans-btn.close:hover {
                color: #e11d48 !important;
            }
            .isa-trans-content {
                color: #1e293b !important;
                font-weight: normal !important;
            }

            /* Sentence Chunk Breakdown (AI) */
            .isa-breakdown-container {
                margin-top: 8px !important;
                padding-top: 0 !important;
                border-top: none !important;
                font-size: 13.5px !important;
                line-height: 1.65 !important;
            }
            .isa-breakdown-header {
                display: block !important;
                margin-bottom: 6px !important;
                font-size: 12px !important;
                color: #64748b !important;
                font-weight: 500 !important;
                user-select: none !important;
            }
            .isa-breakdown-loading {
                color: #64748b !important;
                font-style: italic !important;
                font-size: 12.5px !important;
                padding: 4px 0 !important;
            }
            .isa-breakdown-error {
                color: #94a3b8 !important;
                font-size: 12px !important;
            }
            .isa-breakdown-list {
                list-style: disc !important;
                padding-left: 20px !important;
                margin: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
            }
            .isa-breakdown-item {
                color: #334155 !important;
                font-size: 13.5px !important;
                line-height: 1.65 !important;
            }
            .isa-breakdown-term {
                font-weight: 700 !important;
                color: #0f172a !important;
            }
            .isa-breakdown-phrase {
                cursor: default !important;
                border-radius: 4px !important;
                padding: 1px 4px !important;
                margin: 0 -2px !important;
                transition: background-color 0.15s ease, color 0.15s ease !important;
                display: inline !important;
            }
            .isa-breakdown-phrase:hover {
                background-color: rgba(2, 132, 199, 0.08) !important;
                color: #0284c7 !important;
            }
            .isa-breakdown-phrase:hover .isa-breakdown-en {
                color: #0284c7 !important;
            }
            .isa-breakdown-phrase.is-speaking-phrase {
                background-color: rgba(2, 132, 199, 0.12) !important;
                box-shadow: 0 0 0 1.5px rgba(2, 132, 199, 0.3) !important;
                color: #0284c7 !important;
            }
            .isa-breakdown-phrase.is-speaking-phrase .isa-breakdown-en {
                color: #0284c7 !important;
            }
            .isa-breakdown-en {
                cursor: default !important;
                border-bottom: none !important;
                text-decoration: none !important;
            }
            .isa-breakdown-desc {
                color: #334155 !important;
            }
            .isa-breakdown-sub-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 16px !important;
                height: 16px !important;
                margin: 0 2px 0 3px !important;
                padding: 0 !important;
                vertical-align: -1.5px !important;
                background: rgba(2, 132, 199, 0.08) !important;
                border: 1px solid rgba(2, 132, 199, 0.28) !important;
                border-radius: 4px !important;
                color: #0284c7 !important;
                cursor: pointer !important;
                outline: none !important;
                transition: all 0.15s ease !important;
                line-height: 1 !important;
            }
            .isa-breakdown-sub-btn:hover {
                background: #0284c7 !important;
                border-color: #0284c7 !important;
                color: #ffffff !important;
                transform: scale(1.08) !important;
            }
            .isa-breakdown-sub-btn.is-active {
                background: #0284c7 !important;
                border-color: #0284c7 !important;
                color: #ffffff !important;
            }
            .isa-breakdown-sub-btn.is-loading {
                opacity: 0.75 !important;
                cursor: wait !important;
                pointer-events: none !important;
            }
            @keyframes isa-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .isa-spin {
                animation: isa-spin 0.8s linear infinite !important;
            }
            .isa-breakdown-sub-container {
                margin: 6px 0 2px 8px !important;
                padding: 6px 10px 6px 12px !important;
                background: rgba(241, 245, 249, 0.75) !important;
                border-left: 2.5px solid #38bdf8 !important;
                border-radius: 0 6px 6px 0 !important;
            }
            .isa-breakdown-sub-list {
                list-style: circle !important;
                padding-left: 16px !important;
                margin: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 5px !important;
            }
            .isa-breakdown-sub-item {
                color: #475569 !important;
                font-size: 12.5px !important;
                line-height: 1.55 !important;
            }
            .isa-breakdown-sub-loading {
                font-size: 12px !important;
                color: #0284c7 !important;
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
            }
            .isa-breakdown-sub-error {
                font-size: 12px !important;
                color: #ef4444 !important;
                cursor: pointer !important;
            }
            .isa-breakdown-sub-empty {
                font-size: 12px !important;
                color: #94a3b8 !important;
            }
            .isa-grammar-keyword {
                cursor: pointer !important;
                color: #64748b !important;
                text-decoration: none !important;
                font-weight: inherit !important;
                border-bottom: none !important;
                outline: none !important;
                transition: color 0.15s ease !important;
            }
            .isa-grammar-keyword:hover {
                color: #475569 !important;
            }
            .isa-breakdown-grammar-container {
                margin: 6px 0 2px 8px !important;
                padding: 7px 10px 7px 12px !important;
                background: rgba(248, 250, 252, 0.95) !important;
                border-left: 2.5px solid #8b5cf6 !important;
                border-radius: 0 6px 6px 0 !important;
                box-shadow: 0 1px 3px rgba(139, 92, 246, 0.06) !important;
            }
            .isa-breakdown-grammar-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                margin-bottom: 5px !important;
                padding-bottom: 3px !important;
                border-bottom: 1px dashed rgba(139, 92, 246, 0.22) !important;
            }
            .isa-breakdown-grammar-title {
                font-size: 12px !important;
                font-weight: 600 !important;
                color: #7c3aed !important;
                display: flex !important;
                align-items: center !important;
                gap: 4px !important;
            }
            .isa-breakdown-grammar-close {
                background: none !important;
                border: none !important;
                color: #94a3b8 !important;
                cursor: pointer !important;
                font-size: 12px !important;
                line-height: 1 !important;
                padding: 2px 4px !important;
                border-radius: 3px !important;
            }
            .isa-breakdown-grammar-close:hover {
                color: #64748b !important;
                background: rgba(0, 0, 0, 0.05) !important;
            }
            .isa-breakdown-grammar-list {
                list-style: none !important;
                padding: 0 !important;
                margin: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;
            }
            .isa-breakdown-grammar-item {
                font-size: 12px !important;
                line-height: 1.55 !important;
                color: #334155 !important;
            }
            .isa-breakdown-grammar-tag {
                color: #7c3aed !important;
                font-weight: 600 !important;
            }
            .isa-breakdown-grammar-desc {
                color: #475569 !important;
            }
            .isa-breakdown-grammar-loading {
                font-size: 12px !important;
                color: #7c3aed !important;
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
            }
            .isa-breakdown-grammar-error {
                font-size: 12px !important;
                color: #ef4444 !important;
                cursor: pointer !important;
            }
            .isa-breakdown-grammar-empty {
                font-size: 12px !important;
                color: #94a3b8 !important;
            }

            /* Speech Text-Tracking (CSS Custom Highlight API) */
            ::highlight(isa-speak-word) {
                background-color: #fef08a;
                color: #0f172a;
                text-decoration: underline;
                text-decoration-color: #ca8a04;
                text-decoration-thickness: 2.5px;
            }

            /* Fullscreen Memory Modal Overlay Container */
            #geek-memory-modal {
                position: fixed !important;
                inset: 0 !important;
                display: none !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 24px !important;
                background: rgba(2, 6, 23, 0.76) !important;
                backdrop-filter: blur(4px) !important;
                -webkit-backdrop-filter: blur(4px) !important;
                z-index: 100001 !important;
                box-sizing: border-box !important;
                pointer-events: auto !important;
            }
            #geek-memory-modal.open {
                display: flex !important;
            }
        `;
        document.head.appendChild(style);
    }
    injectProjectStyles();

    // ==========================================
    // Bubble Open / Pin State Management
    // ==========================================
    function closeAllOpenedBubbles(exceptMark = null) {
        document.querySelectorAll(".geek-vocab-mark.geek-bubble-open").forEach(el => {
            if (el !== exceptMark) {
                el.classList.remove("geek-bubble-open");
                const b = el.querySelector(".translation-bubble");
                if (b) b.classList.remove("force-show", "geek-bubble-below");
            }
        });
    }

    // ==========================================
    // Bubble Auto-Placement Logic (geek-bubble-below)
    // ==========================================
    function placeBubble(bubble) {
        if (!bubble || !bubble.classList.contains("geek-has-word-image")) return;
        const wordElement = bubble.parentElement;
        if (!wordElement) return;

        const bubbleRect = bubble.getBoundingClientRect();
        const wordRect = wordElement.getBoundingClientRect();
        const bubbleHeight = bubbleRect.height || 260;
        const gap = Math.max(8, wordRect.height * 0.25);
        const aboveTop = wordRect.top - gap - bubbleHeight;
        const belowBottom = wordRect.bottom + gap + bubbleHeight;
        const aboveIsClipped = aboveTop < EDGE_PADDING;
        const belowHasMoreRoom = window.innerHeight - wordRect.bottom > wordRect.top;
        const belowFits = belowBottom <= window.innerHeight - EDGE_PADDING;
        const shouldShowBelow = aboveIsClipped && (belowFits || belowHasMoreRoom);

        if (shouldShowBelow) {
            bubble.classList.add("geek-bubble-below");
        } else {
            bubble.classList.remove("geek-bubble-below");
        }
    }

    // ==========================================
    // Authentic Full Memory Modal Implementation
    // ==========================================
    let memoryModalRefs = null;
    let currentMemoryData = null;
    let currentMemoryMark = null;
    let autoCloseTimer = null;

    function findParagraphElementForMark(markEl) {
        if (!markEl) return null;
        const block = markEl.closest("p, blockquote, li, pre, dd, dt, .sample-box, .paragraph");
        if (block && !["ARTICLE", "SECTION", "MAIN", "BODY", "HTML"].includes(block.tagName)) {
            return block;
        }
        let cur = markEl.parentElement;
        while (cur && cur.parentElement && !["ARTICLE", "SECTION", "MAIN", "BODY", "HTML"].includes(cur.tagName)) {
            const display = window.getComputedStyle(cur).display;
            if (display === "block" || display === "flex" || display === "grid" || display === "list-item") {
                return cur;
            }
            cur = cur.parentElement;
        }
        return cur || markEl.parentElement;
    }

    function getEntryFromMark(markEl) {
        if (!markEl) return null;
        if (markEl._entry) return markEl._entry;
        if (markEl.dataset && markEl.dataset.word) {
            const entry = lookupWord(markEl.dataset.word);
            if (entry) return entry;
        }
        const textNode = markEl.childNodes[0];
        const text = (textNode && textNode.nodeType === Node.TEXT_NODE ? textNode.nodeValue : markEl.textContent) || "";
        return lookupWord(text.trim());
    }

    function getParagraphMarks(markEl) {
        if (!markEl) return [];
        const container = findParagraphElementForMark(markEl);
        if (!container) return [markEl];
        const allMarks = Array.from(container.querySelectorAll("strong.geek-vocab-mark"));
        return allMarks.length > 0 ? allMarks : [markEl];
    }

    function getNextMarkInParagraph() {
        if (!currentMemoryMark) return null;
        const marks = getParagraphMarks(currentMemoryMark);
        if (marks.length === 0) return null;
        const idx = marks.indexOf(currentMemoryMark);
        // Loop back to the first word of the paragraph when reaching the end
        const nextIdx = (idx >= 0 && idx < marks.length - 1) ? idx + 1 : 0;
        const nextMark = marks[nextIdx];
        const nextEntry = getEntryFromMark(nextMark);
        if (nextEntry) return { mark: nextMark, entry: nextEntry };
        return null;
    }

    const STATS_MAX_PRACTICE_WORDS = 10;
    let statsPracticeCount = 0;

    function getNextItemToPractice() {
        if (isStatsPage()) {
            if (statsPracticeCount >= STATS_MAX_PRACTICE_WORDS) {
                return null;
            }
            const wordEls = Array.from(document.querySelectorAll("#table-body .word-text"));
            if (wordEls.length === 0) return null;
            let idx = -1;
            if (currentMemoryMark) {
                const markWord = (currentMemoryMark.dataset?.word || currentMemoryMark.textContent || "").toLowerCase().trim();
                idx = wordEls.findIndex(el => (el.dataset?.word || el.textContent || "").toLowerCase().trim() === markWord);
            }
            if (idx === -1 && currentMemoryData) {
                const curWord = currentMemoryData.w.toLowerCase().trim();
                idx = wordEls.findIndex(el => (el.dataset?.word || el.textContent || "").toLowerCase().trim() === curWord);
            }
            const nextIdx = (idx >= 0 && idx < wordEls.length - 1) ? idx + 1 : (wordEls.length >= STATS_MAX_PRACTICE_WORDS ? 0 : -1);
            if (nextIdx === -1) return null;
            const nextEl = wordEls[nextIdx];
            const nextWord = (nextEl.dataset?.word || nextEl.textContent || "").trim();
            const nextEntry = lookupWord(nextWord);
            if (nextEntry) return { mark: nextEl, entry: nextEntry };
            return null;
        }
        return getNextMarkInParagraph();
    }

    // ==========================================
    // Visual Viewport Sync (Trackpad Pinch-Zoom Only)
    // Tracks macOS trackpad pinch zoom via Visual Viewport API,
    // completely ignoring and bypassing browser Cmd+/- page zoom.
    // ==========================================
    let vvRafId = null;

    function syncModalWithVisualViewport() {
        vvRafId = null;
        if (!isMemoryModalOpen() || !memoryModalRefs) return;
        const modal = document.getElementById("geek-memory-modal");
        if (!modal) return;

        const vv = window.visualViewport;
        if (!vv) return;

        const scale = vv.scale || 1;
        // Compensate for trackpad pinch zoom and pan offset
        if (Math.abs(scale - 1) > 0.005 || Math.abs(vv.offsetLeft) > 0.5 || Math.abs(vv.offsetTop) > 0.5) {
            modal.style.transformOrigin = "0 0";
            modal.style.transform = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(${1 / scale})`;
        } else {
            modal.style.transformOrigin = "0 0";
            modal.style.transform = "";
        }
    }

    function scheduleSyncModalWithVisualViewport() {
        if (!isMemoryModalOpen()) return;
        if (vvRafId) cancelAnimationFrame(vvRafId);
        vvRafId = requestAnimationFrame(syncModalWithVisualViewport);
    }

    function createMemoryModal() {
        if (memoryModalRefs) return memoryModalRefs;

        const modal = document.createElement("div");
        modal.id = "geek-memory-modal";
        modal.style.position = "fixed";
        modal.style.top = "0px";
        modal.style.left = "0px";
        modal.style.width = "100%";
        modal.style.height = "100%";
        modal.style.transformOrigin = "0 0";
        modal.style.alignItems = "center";
        modal.style.justifyContent = "center";
        modal.style.padding = "16px";
        modal.style.background = "rgba(2, 6, 23, 0.78)";
        modal.style.backdropFilter = "blur(4px)";
        modal.style.webkitBackdropFilter = "blur(4px)";
        modal.style.zIndex = "100001";
        modal.style.boxSizing = "border-box";
        modal.style.pointerEvents = "auto";
        modal.style.display = "none";
        const shadow = modal.attachShadow({ mode: "open" });
        shadow.innerHTML = `
            <style>
                :host {
                    display: block;
                    width: 100%;
                    height: 100%;
                    pointer-events: auto;
                }
                .geek-memory-shell {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    box-sizing: border-box;
                }
                .geek-memory-card {
                    width: min(540px, calc(100vw - 28px));
                    height: min(880px, calc(100dvh - 28px));
                    max-height: calc(100vh - 28px);
                    display: grid;
                    grid-template-rows: auto minmax(100px, 1fr) auto auto;
                    overflow: hidden;
                    background: #111827;
                    color: #fff;
                    border: 1px solid rgba(255,255,255,0.16);
                    border-radius: 12px;
                    box-shadow: 0 24px 72px rgba(0,0,0,0.52);
                    padding: 16px 18px;
                    box-sizing: border-box;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    pointer-events: auto;
                    user-select: text;
                    -webkit-user-select: text;
                    position: relative;
                }
                .geek-memory-progress {
                    position: absolute;
                    top: 14px;
                    right: 16px;
                    font-size: 12px;
                    font-weight: 700;
                    color: #94a3b8;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    padding: 3px 10px;
                    border-radius: 999px;
                    letter-spacing: 0.5px;
                    pointer-events: none;
                    z-index: 10;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    transition: color 0.2s, border-color 0.2s, background-color 0.2s;
                }
                .geek-memory-progress[hidden] {
                    display: none;
                }
                .geek-memory-progress.is-completed {
                    color: #34d399;
                    border-color: rgba(52, 211, 153, 0.4);
                    background: rgba(52, 211, 153, 0.12);
                }
                .geek-memory-header {
                    --geek-memory-header-drop: 0px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    z-index: 2;
                    transform: translate3d(0, 0, 0) scale(1);
                    backface-visibility: hidden;
                    transition:
                        transform 1080ms cubic-bezier(0.16, 1, 0.3, 1);
                    will-change: transform;
                    pointer-events: auto;
                }
                .geek-memory-header.is-memorized {
                    transform: translate3d(0, var(--geek-memory-header-drop), 0) scale(1.14);
                }
                .geek-memory-word {
                    margin: 0 0 6px;
                    color: #7dd3fc;
                    font-size: clamp(34px, 6vw, 56px);
                    line-height: 1.2;
                    font-weight: 800;
                    text-align: center;
                    overflow-wrap: anywhere;
                    transition:
                        color 420ms ease-out,
                        text-shadow 420ms ease-out;
                    cursor: pointer;
                }
                .geek-memory-word:hover,
                .geek-memory-word.is-speaking {
                    color: #bae6fd;
                    text-shadow: 0 0 16px rgba(125, 211, 252, 0.45);
                }
                .geek-memory-header.is-memorized .geek-memory-word {
                    color: #34d399;
                    text-shadow: 0 0 18px rgba(52, 211, 153, 0.38);
                }
                .geek-memory-image {
                    display: block;
                    width: 100%;
                    height: 100%;
                    min-height: 0;
                    object-fit: cover;
                    border-radius: 8px;
                    background: rgba(255,255,255,0.06);
                    opacity: 1;
                    transition: opacity 480ms cubic-bezier(0.4, 0, 0.2, 1);
                    will-change: opacity;
                }
                .geek-memory-image.is-missing {
                    background: #991f2b;
                }
                .geek-memory-card.is-memorizing .geek-memory-image {
                    transition: opacity 820ms cubic-bezier(0.16, 1, 0.3, 1);
                    opacity: 0;
                }
                .geek-memory-translation {
                    margin: 0 0 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-wrap: wrap;
                    gap: 6px;
                    line-height: 1.4;
                    text-align: center;
                    overflow-wrap: anywhere;
                }
                .geek-memory-pos {
                    display: inline-block;
                    font-size: 13px;
                    font-weight: 700;
                    font-style: italic;
                    color: #7dd3fc;
                    background: rgba(125, 211, 252, 0.12);
                    border: 1px solid rgba(125, 211, 252, 0.28);
                    padding: 1px 7px;
                    border-radius: 4px;
                    letter-spacing: 0.2px;
                    line-height: 1.35;
                    transition: color 420ms ease-out, background-color 420ms ease-out, border-color 420ms ease-out;
                }
                .geek-memory-def {
                    color: rgba(241, 245, 249, 0.92);
                    font-size: 16px;
                    font-weight: 500;
                    letter-spacing: 0.3px;
                    transition: color 420ms ease-out, text-shadow 420ms ease-out;
                }
                .geek-memory-header.is-memorized .geek-memory-pos {
                    color: #34d399;
                    background: rgba(52, 211, 153, 0.16);
                    border-color: rgba(52, 211, 153, 0.35);
                }
                .geek-memory-header.is-memorized .geek-memory-def {
                    color: #d1fae5;
                    text-shadow: 0 0 12px rgba(52, 211, 153, 0.25);
                }
                .geek-memory-example {
                    margin: 12px 0 0;
                    padding: 0;
                    border-top: none;
                    text-align: center;
                }
                .geek-memory-example[hidden] {
                    display: none;
                }
                .geek-memory-focus-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    margin: 0 auto 8px;
                    padding: 3px 12px;
                    border-radius: 999px;
                    background: rgba(254, 240, 138, 0.15);
                    border: 1px solid rgba(253, 230, 138, 0.35);
                    color: #fde68a;
                    font-size: 13px;
                    font-weight: 700;
                    letter-spacing: 0.2px;
                    line-height: 1.4;
                }
                .geek-memory-focus-badge[hidden] {
                    display: none;
                }
                .geek-memory-example-en {
                    margin: 0;
                    color: #f8fafc;
                    font-size: 17px;
                    font-weight: 650;
                    line-height: 1.45;
                    cursor: pointer;
                    overflow-wrap: anywhere;
                    transition: color 0.15s ease;
                }
                .geek-memory-example-en:hover,
                .geek-memory-example-en.is-speaking {
                    color: #7dd3fc;
                }
                .geek-memory-example-en strong {
                    color: #fde68a;
                    font-weight: 850;
                }
                .geek-memory-example-zh {
                    margin: 5px 0 0;
                    color: rgba(226,232,240,0.7);
                    font-size: 14px;
                    line-height: 1.45;
                    overflow-wrap: anywhere;
                    cursor: pointer;
                    transition: color 0.15s ease;
                }
                .geek-memory-example-zh:hover,
                .geek-memory-example-zh.is-speaking {
                    color: #93c5fd;
                }
                .geek-memory-answer {
                    width: 100%;
                    height: 48px;
                    min-width: 0;
                    margin: 16px 0 0;
                    padding: 0 14px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.18);
                    background: rgba(255,255,255,0.08);
                    color: #fff;
                    box-sizing: border-box;
                    font: 18px/48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    text-align: center;
                    outline: none;
                    text-transform: none;
                    caret-color: #7dd3fc;
                    pointer-events: auto;
                    user-select: text;
                    -webkit-user-select: text;
                }
                .geek-memory-answer::placeholder {
                    color: rgba(255,255,255,0.36);
                }
                .geek-memory-answer:focus {
                    border-color: #7dd3fc;
                    box-shadow: 0 0 0 3px rgba(125, 211, 252, 0.16);
                }
                .geek-memory-answer.is-wrong {
                    border-color: #fb7185;
                    box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.16);
                }
                .geek-memory-answer.is-correct {
                    border-color: #34d399;
                    box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.18);
                }
            </style>
            <div class="geek-memory-shell">
              <div class="geek-memory-card" role="dialog" aria-modal="true">
                <div class="geek-memory-progress" id="geek-memory-progress" hidden></div>
                <div class="geek-memory-header" id="geek-memory-header">
                  <h2 class="geek-memory-word" id="geek-memory-word" title="点击朗读单词（优先 macOS Siri 高保真语音）"></h2>
                  <div class="geek-memory-translation" id="geek-memory-translation"></div>
                </div>
                <img class="geek-memory-image" id="geek-memory-image" alt="" draggable="false">
                <div class="geek-memory-example" id="geek-memory-example" hidden>
                  <div class="geek-memory-focus-badge" id="geek-memory-focus-badge" hidden></div>
                  <p class="geek-memory-example-en" id="geek-memory-example-en" title="点击朗读例句（优先 macOS Siri 高保真语音）"></p>
                  <p class="geek-memory-example-zh" id="geek-memory-example-zh" title="点击朗读中文翻译"></p>
                </div>
                <input class="geek-memory-answer" id="geek-memory-answer" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="请输入上方单词进行记忆校验">
              </div>
            </div>
        `;

        const shell = shadow.querySelector(".geek-memory-shell");
        const card = shadow.querySelector(".geek-memory-card");
        const answer = shadow.getElementById("geek-memory-answer");

        memoryModalRefs = {
            modal,
            card,
            progress: shadow.getElementById("geek-memory-progress"),
            header: shadow.getElementById("geek-memory-header"),
            word: shadow.getElementById("geek-memory-word"),
            image: shadow.getElementById("geek-memory-image"),
            translation: shadow.getElementById("geek-memory-translation"),
            example: shadow.getElementById("geek-memory-example"),
            focusBadge: shadow.getElementById("geek-memory-focus-badge"),
            exampleEnglish: shadow.getElementById("geek-memory-example-en"),
            exampleChinese: shadow.getElementById("geek-memory-example-zh"),
            answer,
        };

        shell.addEventListener("click", event => {
            if (event.target === shell) closeMemoryModal();
        });
        card.addEventListener("click", event => {
            if (event.target === card) requestAnimationFrame(focusMemoryAnswer);
        });

        memoryModalRefs.word.addEventListener("click", () => {
            if (currentMemoryData) {
                const cleanZh = formatChineseDefinitionForSpeech(currentMemoryData.d);
                speakBilingualWithSiriPriority(currentMemoryData.w, cleanZh, "word");
            }
            requestAnimationFrame(focusMemoryAnswer);
        });

        memoryModalRefs.exampleEnglish.addEventListener("click", () => {
            if (currentMemoryData && currentMemoryData.sp) {
                speakBilingualWithSiriPriority(currentMemoryData.sp.en || "", currentMemoryData.sp.zh || "", "example");
            }
            requestAnimationFrame(focusMemoryAnswer);
        });

        if (memoryModalRefs.exampleChinese) {
            memoryModalRefs.exampleChinese.addEventListener("click", () => {
                stopSiriPlayback();
                stopModalExampleSpeech();
                if (currentMemoryData && currentMemoryData.sp && currentMemoryData.sp.zh) {
                    memoryModalRefs.exampleChinese.classList.add("is-speaking");
                    speakText(currentMemoryData.sp.zh, "zh-CN", () => {
                        if (memoryModalRefs && memoryModalRefs.exampleChinese) {
                            memoryModalRefs.exampleChinese.classList.remove("is-speaking");
                        }
                    });
                }
                requestAnimationFrame(focusMemoryAnswer);
            });
        }

        answer.addEventListener("input", handleAnswerInput);
        answer.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeMemoryModal();
            } else if (event.key === "Enter" && answer.classList.contains("is-correct")) {
                clearTimeout(autoCloseTimer);
                const nextItem = getNextItemToPractice();
                if (nextItem) {
                    openMemoryModal(nextItem.entry, nextItem.mark);
                } else {
                    closeMemoryModal();
                }
            }
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", scheduleSyncModalWithVisualViewport, { passive: true });
            window.visualViewport.addEventListener("scroll", scheduleSyncModalWithVisualViewport, { passive: true });
        }

        document.body.appendChild(modal);
        return memoryModalRefs;
    }

    function isMemoryModalOpen() {
        const modal = document.getElementById("geek-memory-modal");
        return !!modal && modal.classList.contains("open");
    }

    function focusMemoryAnswer() {
        const answer = memoryModalRefs && memoryModalRefs.answer;
        if (!answer || !isMemoryModalOpen()) return;
        requestAnimationFrame(() => {
            if (isMemoryModalOpen()) {
                answer.focus({ preventScroll: true });
                answer.setSelectionRange(answer.value.length, answer.value.length);
            }
        });
    }

    function resetMemoryAnimation() {
        if (!memoryModalRefs) return;
        const { card, header, word } = memoryModalRefs;
        if (card) card.classList.remove("is-memorizing");
        if (header) {
            header.classList.remove("is-memorized");
            header.style.removeProperty("--geek-memory-header-drop");
        }
        if (word) {
            word.classList.remove("is-memorized");
            word.style.removeProperty("--geek-memory-word-drop");
        }
    }

    function playCorrectMemoryAnimation() {
        if (!memoryModalRefs) return;
        const { card, header, word, image } = memoryModalRefs;
        const targetEl = header || word;
        if (!card || !targetEl || !image) return;

        resetMemoryAnimation();

        let dropDistance = 0;
        if (typeof targetEl.offsetTop === "number" && typeof image.offsetTop === "number" && targetEl.offsetParent === image.offsetParent) {
            const targetCenter = targetEl.offsetTop + targetEl.offsetHeight / 2;
            const imageCenter = image.offsetTop + image.offsetHeight / 2;
            dropDistance = Math.max(0, imageCenter - targetCenter);
        } else {
            const targetRect = targetEl.getBoundingClientRect();
            const imageRect = image.getBoundingClientRect();
            const vvScale = (window.visualViewport && window.visualViewport.scale) ? window.visualViewport.scale : 1;
            dropDistance = Math.max(0, (imageRect.top + imageRect.height / 2) - (targetRect.top + targetRect.height / 2)) * vvScale;
        }

        targetEl.style.setProperty("--geek-memory-header-drop", `${dropDistance}px`);
        targetEl.style.setProperty("--geek-memory-word-drop", `${dropDistance}px`);
        requestAnimationFrame(() => {
            if (!isMemoryModalOpen()) return;
            card.classList.add("is-memorizing");
            targetEl.classList.add("is-memorized");
            if (word) word.classList.add("is-memorized");
        });
    }

    let hasTrackedCurrentSuccess = false;

    function handleAnswerInput(event) {
        if (!currentMemoryData) return;
        clearTimeout(autoCloseTimer);

        const input = event.target;
        const typed = answerKey(input.value);
        const wordTarget = answerKey(currentMemoryData.w);
        const focusTarget = currentMemoryData.sp && currentMemoryData.sp.focus ? answerKey(currentMemoryData.sp.focus) : "";
        const targets = [wordTarget, focusTarget].filter(Boolean);

        input.classList.remove("is-correct", "is-wrong");
        resetMemoryAnimation();

        if (!typed) return;

        if (targets.includes(typed)) {
            stopSiriPlayback();
            stopModalSpeech();
            input.classList.add("is-correct");
            if (!hasTrackedCurrentSuccess) {
                hasTrackedCurrentSuccess = true;
                trackWordEvent(currentMemoryData.w, "input_success");
            }
            playCorrectMemoryAnimation();
            const textToSpeak = (typed === focusTarget && currentMemoryData.sp && currentMemoryData.sp.focus) 
                ? currentMemoryData.sp.focus 
                : currentMemoryData.w;

            const hasLongerCandidate = targets.some(target => target.length > typed.length && target.startsWith(typed));
            if (!hasLongerCandidate) {
                input.readOnly = true;
            }

            const nextItem = getNextItemToPractice();
            if (nextItem) {
                // Immediately preload the next word's image while current word is being spoken
                preloadWordImage(nextItem.entry.w);
            }

            let hasAdvanced = false;
            const advanceNext = () => {
                if (hasAdvanced || !isMemoryModalOpen()) return;
                hasAdvanced = true;
                clearTimeout(autoCloseTimer);
                stopSiriPlayback();
                stopModalSpeech();
                if (nextItem) {
                    openMemoryModal(nextItem.entry, nextItem.mark);
                } else {
                    if (isStatsPage() && memoryModalRefs && memoryModalRefs.progress) {
                        const total = Math.min(STATS_MAX_PRACTICE_WORDS, Math.max(1, document.querySelectorAll("#table-body .word-text").length));
                        memoryModalRefs.progress.textContent = `${total} / ${total} 🎉 本组完成`;
                        memoryModalRefs.progress.classList.add("is-completed");
                    }
                    closeMemoryModal();
                }
            };

            // Audio-driven auto-advance:
            // When speech finishes (prioritizing Siri, falling back to browser voice),
            // wait a comfortable buffer (350ms) then advance automatically.
            const onSpeechCompleted = () => {
                if (hasAdvanced || !isMemoryModalOpen()) return;
                clearTimeout(autoCloseTimer);
                autoCloseTimer = setTimeout(advanceNext, 350);
            };

            // Fallback safety guard: advance anyway if audio event drops or hangs (e.g. 2.8s)
            const fallbackMaxTime = Math.max(2600, (textToSpeak || "").length * 140 + 1200);
            clearTimeout(autoCloseTimer);
            autoCloseTimer = setTimeout(advanceNext, fallbackMaxTime);

            // Read aloud validated word/collocation with Siri priority, advancing upon speech completion
            speakWithSiriPriority(textToSpeak, onSpeechCompleted);
        } else if (!targets.some(target => target.startsWith(typed))) {
            input.classList.add("is-wrong");
        }
    }

    function renderFocusedExample(element, sentence, focus) {
        element.textContent = "";
        if (!sentence || !focus) {
            element.textContent = sentence;
            return;
        }

        const index = sentence.toLowerCase().indexOf(focus.toLowerCase());
        if (index < 0) {
            element.textContent = sentence;
            return;
        }

        element.append(document.createTextNode(sentence.slice(0, index)));
        const strong = document.createElement("strong");
        strong.textContent = sentence.slice(index, index + focus.length);
        element.append(strong, document.createTextNode(sentence.slice(index + focus.length)));
    }

    function openMemoryModal(entry, markEl = null) {
        clearTimeout(autoCloseTimer);
        stopSiriPlayback();
        const refs = createMemoryModal();
        currentMemoryData = entry;
        hasTrackedCurrentSuccess = false;
        if (markEl) {
            currentMemoryMark = markEl;
        }
        trackWordEvent(entry.w, "modal_open");

        closeAllOpenedBubbles(null);
        resetMemoryAnimation();

        const wasOpen = isMemoryModalOpen();
        if (isStatsPage()) {
            if (!wasOpen) {
                statsPracticeCount = 1;
            } else {
                statsPracticeCount++;
            }
        } else {
            statsPracticeCount = 0;
        }

        if (refs.progress) {
            if (isStatsPage()) {
                const total = Math.min(STATS_MAX_PRACTICE_WORDS, Math.max(1, document.querySelectorAll("#table-body .word-text").length));
                refs.progress.textContent = `${statsPracticeCount} / ${total}`;
                refs.progress.classList.toggle("is-completed", statsPracticeCount >= total);
                refs.progress.hidden = false;
            } else {
                refs.progress.hidden = true;
            }
        }

        refs.word.textContent = entry.w;
        refs.image.style.opacity = "";  // reset from any previous load failure
        refs.image.src = getImageUrl(entry.w);
        refs.image.alt = `${entry.w} image`;
        setupImageFallback(refs.image, entry.w);
        refs.translation.textContent = "";
        const rawDef = (entry.d || "").replace(/^\((.*)\)$/, "$1").trim();
        const posMatch = rawDef.match(/^([a-z./]+)\s*(.*)$/i);
        if (posMatch && posMatch[1]) {
            const posSpan = document.createElement("span");
            posSpan.className = "geek-memory-pos";
            posSpan.textContent = posMatch[1];
            const defSpan = document.createElement("span");
            defSpan.className = "geek-memory-def";
            defSpan.textContent = posMatch[2];
            refs.translation.append(posSpan, defSpan);
        } else {
            const defSpan = document.createElement("span");
            defSpan.className = "geek-memory-def";
            defSpan.textContent = rawDef;
            refs.translation.append(defSpan);
        }

        const spoken = entry.sp || {};
        refs.example.hidden = !(spoken.en && spoken.zh);
        if (refs.focusBadge) {
            if (spoken.focus_zh) {
                refs.focusBadge.textContent = `${spoken.focus}（${spoken.focus_zh}）`;
                refs.focusBadge.hidden = false;
            } else if (spoken.focus) {
                refs.focusBadge.textContent = spoken.focus;
                refs.focusBadge.hidden = false;
            } else {
                refs.focusBadge.hidden = true;
            }
        }
        renderFocusedExample(refs.exampleEnglish, spoken.en || "", spoken.focus || "");
        refs.exampleChinese.textContent = spoken.zh || "";

        refs.answer.readOnly = false;
        refs.answer.value = "";
        const basePlaceholder = spoken.focus ? "输入单词或核心搭配进行记忆校验" : "请输入上方单词进行记忆校验";
        if (isStatsPage()) {
            const total = Math.min(STATS_MAX_PRACTICE_WORDS, Math.max(1, document.querySelectorAll("#table-body .word-text").length));
            refs.answer.placeholder = `[${statsPracticeCount}/${total}] ${basePlaceholder}`;
        } else {
            refs.answer.placeholder = basePlaceholder;
        }
        refs.answer.classList.remove("is-correct", "is-wrong");

        refs.modal.classList.add("open");
        refs.modal.style.display = "flex";
        syncModalWithVisualViewport();
        window.dispatchEvent(new CustomEvent("ielts_memory_modal_opened", { detail: { word: entry.w } }));
        focusMemoryAnswer();

        if (currentMemoryMark && typeof currentMemoryMark.scrollIntoView === "function") {
            try {
                currentMemoryMark.scrollIntoView({ behavior: "smooth", block: "nearest" });
            } catch (e) {}
        }

        // Auto-play English word (Siri priority) + Chinese definition on modal open
        const cleanZh = formatChineseDefinitionForSpeech(entry.d);
        speakBilingualWithSiriPriority(entry.w, cleanZh, "word");

        // Preload next word in background
        const nextPreview = getNextItemToPractice();
        if (nextPreview && nextPreview.entry && nextPreview.entry.w) {
            preloadWordImage(nextPreview.entry.w);
        }
    }

    function closeMemoryModal() {
        clearTimeout(autoCloseTimer);
        if (vvRafId) cancelAnimationFrame(vvRafId);
        stopSiriPlayback();
        stopModalSpeech();
        if (window.speechSynthesis) {
            try { window.speechSynthesis.cancel(); } catch (e) {}
        }
        if (memoryModalRefs && memoryModalRefs.modal) {
            memoryModalRefs.modal.classList.remove("open");
            memoryModalRefs.modal.style.display = "none";
            memoryModalRefs.modal.style.transform = "";
            if (memoryModalRefs.answer) memoryModalRefs.answer.blur();
        }
        currentMemoryData = null;
        currentMemoryMark = null;
        statsPracticeCount = 0;
        hasTrackedCurrentSuccess = false;
        resetMemoryAnimation();
        window.dispatchEvent(new CustomEvent("ielts_memory_modal_closed"));
    }

    // ==========================================
    // In-Place DOM Highlighting with Exact Bubble DOM
    // ==========================================
    function highlightRange(range) {
        if (!range || range.collapsed) return 0;

        const commonAncestor = range.commonAncestorContainer;
        const textNodes = [];

        const walker = document.createTreeWalker(
            commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentNode : commonAncestor,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    if (node.parentElement && (
                        node.parentElement.closest("#geek-memory-modal") ||
                        node.parentElement.closest(".translation-bubble") ||
                        node.parentElement.tagName === "SCRIPT" ||
                        node.parentElement.tagName === "STYLE" ||
                        node.parentElement.tagName === "TEXTAREA" ||
                        node.parentElement.isContentEditable
                    )) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (range.intersectsNode(node)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_REJECT;
                }
            }
        );

        let currentNode;
        while ((currentNode = walker.nextNode())) {
            textNodes.push(currentNode);
        }

        if (textNodes.length === 0 && commonAncestor.nodeType === Node.TEXT_NODE && range.intersectsNode(commonAncestor)) {
            textNodes.push(commonAncestor);
        }

        let totalHighlighted = 0;

        textNodes.forEach(node => {
            const parent = node.parentNode;
            if (!parent || parent.classList.contains("geek-vocab-mark")) return;

            const text = node.nodeValue;
            const tokenRegex = /\b[a-zA-Z\'-]+\b/g;
            let match;
            const matches = [];

            while ((match = tokenRegex.exec(text)) !== null) {
                const token = match[0];
                const entry = lookupWord(token);
                if (entry) {
                    matches.push({
                        start: match.index,
                        end: match.index + token.length,
                        token: token,
                        entry: entry
                    });
                }
            }

            if (matches.length === 0) return;

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;

            matches.forEach(m => {
                trackWordEvent(m.entry.w, "mark");

                if (m.start > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.slice(lastIndex, m.start)));
                }

                // Authentic Project DOM Structure:
                // <strong class="geek-vocab-mark">token<span class="translation-bubble geek-has-word-image"><img class="geek-bubble-image" /><span class="geek-bubble-text">...</span></span></strong>
                const mark = document.createElement("strong");
                mark.className = "geek-vocab-mark";
                mark._entry = m.entry;
                mark.dataset.word = m.entry.w;
                mark.appendChild(document.createTextNode(m.token));

                const bubble = document.createElement("span");
                bubble.className = "translation-bubble geek-has-word-image";
                bubble.setAttribute("aria-hidden", "true");

                const image = document.createElement("img");
                image.className = "geek-bubble-image";
                image.src = getImageUrl(m.entry.w);
                image.alt = "";
                image.setAttribute("aria-hidden", "true");
                image.loading = "lazy";
                image.draggable = false;
                setupImageFallback(image, m.entry.w);
                image.addEventListener("load", () => placeBubble(bubble));
                image.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openMemoryModal(m.entry, mark);
                });

                const textSpan = document.createElement("span");
                textSpan.className = "geek-bubble-text";
                textSpan.setAttribute("aria-hidden", "true");
                const origWord = m.entry.w;
                const isInflected = m.token.toLowerCase() !== origWord.toLowerCase();
                textSpan.textContent = isInflected ? `${origWord} (${m.entry.d})` : `(${m.entry.d})`;
                textSpan.style.cursor = "pointer";
                textSpan.addEventListener("click", (e) => {
                    e.stopPropagation();
                    playEnglishSpeech(m.entry.w);
                });

                bubble.appendChild(image);
                bubble.appendChild(textSpan);
                mark.appendChild(bubble);

                mark.addEventListener("mouseenter", () => {
                    requestAnimationFrame(() => placeBubble(bubble));
                });
                mark.addEventListener("click", (e) => {
                    if (e.target.closest(".geek-bubble-image") || e.target.closest(".geek-bubble-text")) {
                        return;
                    }
                    e.stopPropagation();
                    openMemoryModal(m.entry, mark);
                });

                fragment.appendChild(mark);
                lastIndex = m.end;
                totalHighlighted++;
            });

            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
            }

            parent.replaceChild(fragment, node);
        });

        return totalHighlighted;
    }


    function findParagraphContainer(range, textToFind = "") {
        if (!range) return null;

        const BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, header, blockquote, li, pre, dd, dt, figcaption, .sample-box, .paragraph";
        const ROOT_TAGS = ["ARTICLE", "SECTION", "MAIN", "BODY", "HTML"];

        const getBlock = (rawNode) => {
            if (!rawNode) return null;
            let node = rawNode.nodeType === Node.TEXT_NODE ? rawNode.parentElement : rawNode;
            if (!node) return null;
            const b = node.closest(BLOCK_SELECTOR);
            if (b && !ROOT_TAGS.includes(b.tagName)) {
                return b;
            }
            return null;
        };

        const needle = (textToFind || range.toString() || "").replace(/\s+/g, " ").trim();
        const prefix = needle.slice(0, Math.min(needle.length, 25));

        const containsSelectedText = (el) => {
            if (!el || !prefix) return true;
            const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
            return t.includes(prefix);
        };

        // 1. Highest priority: commonAncestorContainer if already within a valid block
        let ancestor = range.commonAncestorContainer;
        if (ancestor) {
            if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
            const ancestorBlock = getBlock(ancestor);
            if (ancestorBlock && containsSelectedText(ancestorBlock)) {
                return ancestorBlock;
            }
        }

        // 2. Start container: user selection begins here
        let startNode = range.startContainer;
        if (startNode) {
            if (startNode.nodeType === Node.ELEMENT_NODE && startNode.childNodes.length > range.startOffset) {
                const childAtStart = startNode.childNodes[range.startOffset];
                const b = getBlock(childAtStart);
                if (b && containsSelectedText(b)) return b;
            }
            const startBlock = getBlock(startNode);
            if (startBlock && containsSelectedText(startBlock)) {
                return startBlock;
            }
            if (startBlock) {
                return startBlock;
            }

            // 3. Upward climb from startNode looking for block elements (div, custom headers, etc.)
            let cur = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode;
            while (cur && cur !== document.body && cur.parentElement) {
                if (ROOT_TAGS.includes(cur.parentElement.tagName)) {
                    if (containsSelectedText(cur)) return cur;
                    break;
                }
                try {
                    const display = window.getComputedStyle(cur).display;
                    if (display === "block" || display === "flex" || display === "grid" || cur.tagName === "DIV" || cur.tagName === "P" || /^H[1-6]$/.test(cur.tagName)) {
                        if (containsSelectedText(cur)) return cur;
                    }
                } catch (e) {}
                cur = cur.parentElement;
            }
        }

        // 4. End container fallback only if it actually contains the selected text
        let endNode = range.endContainer;
        if (endNode) {
            if (endNode.nodeType === Node.ELEMENT_NODE && range.endOffset > 0) {
                const childBeforeEnd = endNode.childNodes[range.endOffset - 1];
                const b = getBlock(childBeforeEnd);
                if (b && containsSelectedText(b)) return b;
            }
            const endBlock = getBlock(endNode);
            if (endBlock && containsSelectedText(endBlock)) return endBlock;
        }

        return startNode && startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : (startNode || range.commonAncestorContainer);
    }

    const REPEAT_STEPS = [1, 3, 6, 10, 15];

    function resetAllParagraphSpeakBtns(exceptBtn = null) {
        document.querySelectorAll(".isa-trans-btn.speak-unified, .isa-trans-btn.select-clean, .isa-trans-btn.speak").forEach(btn => {
            if (btn !== exceptBtn) {
                if (btn._timer) clearTimeout(btn._timer);
                if (btn._debounceTimer) clearTimeout(btn._debounceTimer);
                if (btn._pollInterval) clearInterval(btn._pollInterval);
                btn.classList.remove("ready", "speaking");
                btn.textContent = "🎧 朗读段落";
                btn._stepIndex = -1;
                btn._isSpeaking = false;
                btn._isSiriSpeaking = false;
            }
        });
    }

    const ZHIPU_API_KEY_DEFAULT = "453806761358446aba219751fa9ff97d.Pe3UBuEiNTj0rSNY";

    function getGeminiApiKey() {
        try {
            if (typeof GM_getValue === "function") {
                const stored = GM_getValue("isa_gemini_api_key", "");
                if (stored && stored.trim()) return stored.trim();
            }
            const local = window.localStorage && window.localStorage.getItem("isa_gemini_api_key");
            if (local && local.trim()) return local.trim();
        } catch (e) {}
        return "";
    }

    function getZhipuApiKey() {
        try {
            if (typeof GM_getValue === "function") {
                const stored = GM_getValue("isa_zhipu_api_key", "");
                if (stored && stored.trim()) return stored.trim();
            }
        } catch (e) {}
        return ZHIPU_API_KEY_DEFAULT;
    }

    // Unified HTTP Post Helper with Dual Channel (GM_xmlhttpRequest + window.fetch fallback)
    function makeApiPostRequest(url, headers, body, timeoutMs = 25000) {
        return new Promise((resolve, reject) => {
            let settled = false;

            const tryFetch = () => {
                if (typeof fetch !== "function") {
                    if (!settled) { settled = true; reject(new Error("网络请求超时或失败")); }
                    return;
                }
                const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
                fetch(url, {
                    method: "POST",
                    headers: headers,
                    body: body,
                    signal: controller ? controller.signal : undefined
                })
                .then(async res => {
                    if (timer) clearTimeout(timer);
                    const text = await res.text().catch(() => "");
                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}: ${text}`);
                    }
                    if (!settled) {
                        settled = true;
                        resolve(text);
                    }
                })
                .catch(err => {
                    if (timer) clearTimeout(timer);
                    if (!settled) {
                        settled = true;
                        reject(err);
                    }
                });
            };

            if (typeof GM_xmlhttpRequest === "function") {
                try {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: url,
                        headers: headers,
                        data: body,
                        timeout: timeoutMs,
                        onload: (res) => {
                            if (res.status >= 200 && res.status < 300) {
                                if (!settled) {
                                    settled = true;
                                    resolve(res.responseText);
                                }
                            } else {
                                if (!settled) {
                                    settled = true;
                                    reject(new Error(`HTTP ${res.status}: ${res.responseText || ""}`));
                                }
                            }
                        },
                        ontimeout: () => {
                            console.warn("[ISA] GM_xmlhttpRequest 超时，立即切换原生 fetch 兜底...");
                            tryFetch();
                        },
                        onerror: (err) => {
                            console.warn("[ISA] GM_xmlhttpRequest 错误，立即切换原生 fetch 兜底...", err);
                            tryFetch();
                        }
                    });
                    // 安全兜底：若扩展通道断裂导致回调永不触发，强制切 fetch
                    setTimeout(() => {
                        if (!settled) {
                            console.warn("[ISA] GM_xmlhttpRequest 回调超时未触发，安全切换原生 fetch...");
                            tryFetch();
                        }
                    }, timeoutMs + 2000);
                } catch (e) {
                    console.warn("[ISA] GM_xmlhttpRequest 调用异常，切换原生 fetch...", e);
                    tryFetch();
                }
            } else {
                tryFetch();
            }
        });
    }

    // Google Gemini API Caller (supports fallback candidates: gemini-3.5-flash-lite -> gemini-3.6-flash -> gemini-3.5-flash)
    function requestGeminiGeneration(prompt, systemInstruction = "", maxTokens = 600) {
        const apiKey = getGeminiApiKey();
        if (!apiKey) {
            return Promise.reject(new Error("Gemini API Key 未配置"));
        }

        const candidateModels = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.5-flash"];

        function tryCallModel(index) {
            if (index >= candidateModels.length) {
                return Promise.reject(new Error("所有 Gemini 候选模型均返回错误"));
            }

            const modelName = candidateModels[index];
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

            const payload = {
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2048,
                    responseMimeType: "application/json"
                }
            };

            if (systemInstruction) {
                payload.systemInstruction = {
                    parts: [{ text: systemInstruction }]
                };
            }

            const reqData = JSON.stringify(payload);

            const parseResponse = (respText) => {
                try {
                    const data = JSON.parse(respText);
                    const candidate = data.candidates && data.candidates[0];
                    let rawContent = "";
                    if (candidate && candidate.content && candidate.content.parts) {
                        rawContent = candidate.content.parts.map(p => p.text || "").join("\n");
                    }
                    if (!rawContent) {
                        throw new Error("Gemini 模型未返回有效文本内容");
                    }
                    let textToParse = rawContent.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
                    // Locate JSON object { ... } or array [ ... ]
                    const objMatch = textToParse.match(/\{[\s\S]*\}/);
                    const arrayMatch = textToParse.match(/\[[\s\S]*\]/);
                    if (objMatch && (!arrayMatch || objMatch.index < arrayMatch.index)) {
                        textToParse = objMatch[0];
                    } else if (arrayMatch) {
                        textToParse = arrayMatch[0];
                    }
                    let parsed;
                    try {
                        parsed = JSON.parse(textToParse);
                    } catch (e1) {
                        const sanitized = textToParse
                            .replace(/,\s*([\}\]])/g, "$1")
                            .replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""));
                        parsed = JSON.parse(sanitized);
                    }
                    return parsed;
                } catch (e) {
                    console.warn("[ISA] Gemini JSON parse error on raw text:", respText);
                    throw e;
                }
            };

            return makeApiPostRequest(url, { "Content-Type": "application/json" }, reqData, 25000)
                .then(parseResponse)
                .catch(err => {
                    const errStr = String(err);
                    // Try next model if 400 (Invalid Argument), 403 (Forbidden), 404 (Not Found), 503 (High Demand / Unavailable), 429 (Rate Limit), or 5xx
                    const isRetryable = /400|403|404|429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(errStr);
                    if (isRetryable && index + 1 < candidateModels.length) {
                        console.warn(`[ISA] Gemini [${modelName}] failed with retryable status, auto-switching to [${candidateModels[index + 1]}]:`, errStr);
                        return tryCallModel(index + 1);
                    }
                    throw err;
                });
        }

        return tryCallModel(0);
    }

    // 递归扁平化与字段容错解构：兼容单层一维数组、按句子划分的多维嵌套数组、带包装对象的语块返回
    function normalizeChunks(raw) {
        if (!raw) return [];
        const list = [];

        function extract(item) {
            if (!item) return;
            if (Array.isArray(item)) {
                item.forEach(extract);
                return;
            }
            if (typeof item === "object") {
                const en = (item.en || item.chunk || item.phrase || item.english || item.verb || item.action || item.text || "").trim();
                const zh = (item.zh || item.chinese || item.meaning || item.translation || "").trim();
                let exp = (item.exp || item.explanation || item.desc || item.description || item.analysis || item.note || item.detail || item.context || item.usage || "").trim();

                // 若包含有效 en 或 zh，则优先视作有效语块项
                if (en || zh) {
                    if (!exp) {
                        for (const key of Object.keys(item)) {
                            if (!["en", "chunk", "phrase", "english", "verb", "action", "text", "zh", "chinese", "meaning", "translation", "sentence"].includes(key.toLowerCase())) {
                                const val = item[key];
                                if (typeof val === "string" && val.trim() && val.trim() !== en && val.trim() !== zh) {
                                    exp = val.trim();
                                    break;
                                }
                            }
                        }
                    }
                    list.push({ en, zh, exp });
                    return;
                }

                // 若自身没有 en/zh，检查是否是外层包装对象（如按句子包裹子数组：{ sentence: "...", chunks: [...] }）
                let foundSubArray = false;
                for (const key of Object.keys(item)) {
                    if (Array.isArray(item[key]) && item[key].length > 0) {
                        foundSubArray = true;
                        item[key].forEach(extract);
                    }
                }
                if (foundSubArray) return;

                // 若无子数组且含有解析说明
                if (exp) {
                    list.push({ en, zh, exp });
                }
            }
        }

        if (Array.isArray(raw)) {
            raw.forEach(extract);
        } else if (typeof raw === "object") {
            const sub = raw.chunks || raw.items || raw.phrases || raw.list || raw.data;
            if (Array.isArray(sub)) {
                sub.forEach(extract);
            } else {
                extract(raw);
            }
        }

        return list;
    }

    const PARAGRAPH_ANALYSIS_SYSTEM_PROMPT = "你是雅思与学术英语阅读精读专家。请对输入的英文句子/段落完成两项任务：\n" +
        "1. 提供地道、通顺、符合学术规范的中文全句翻译。\n" +
        "2. 以动词为核心，将文本拆解为关键动作或主干语块（单句提炼1-3个，多句段落提炼3-6个），快速梳理事实骨架与逻辑脉络：\n" +
        "   - 简明主语 + 动作起点：语块需包含主语，但切勿带入冗长修饰，若主语较长仅保留核心词或代词，紧跟核心动词及关键动作对象或搭配；\n" +
        "   - 捕捉核心与非谓语动词：重点提取主干谓语动词，以及承载因果/伴随/结果/目的的重要非谓语动词（如分词短语、不定式）；\n" +
        "   - 联动状语逻辑：若语块关联关键状语（时间、条件、原因、让步转折等），在解析中点透其逻辑修饰意图（如时间跨度、因果推导、前提限定）；\n" +
        "   - 破除被动语态：遇被动语态时，在解析中通俗点明“谁对谁施加了动作”；\n" +
        "   - 通俗白话点拨：切勿堆砌枯燥死板的语法术语（讲透动作事实、修饰逻辑与功能）。\n\n" +
        "【输出格式强制规范】：\n" +
        "- chunks 必须且只能是严格的单层扁平一维数组（Flat Array）。无论输入文本包含单句还是多个句子，严禁按句子嵌套二维数组（如 [[...],[...]]），严禁按句子创建多层对象包裹！\n" +
        "- 数组中每个对象必须直接且固定包含 \"en\", \"zh\", \"exp\" 三个键名，严禁遗漏或使用其他键名。\n\n" +
        "严格输出纯JSON对象（禁止包含任何markdown代码块标签如```json或闲聊前缀），确保JSON语法完全合法，格式规范如下：\n" +
        "{\n" +
        "  \"translation\": \"全句地道中文学术翻译\",\n" +
        "  \"chunks\": [\n" +
        "    {\"en\": \"简明主语 + 核心动词及关键对象/状语搭配\", \"zh\": \"中文释义\", \"exp\": \"核心动词功能 + 状语逻辑修饰解析（助快速理解）\"}\n" +
        "  ]\n" +
        "}";

    // 智谱 GLM-4-Flash 联合学术翻译与核心语块解构
    function analyzeAndTranslateViaZhipu(cleanText) {
        const apiKey = getZhipuApiKey();
        if (!apiKey) return Promise.reject(new Error("未配置智谱 API Key"));

        const payload = {
            model: "glm-4-flash",
            messages: [
                {
                    role: "system",
                    content: PARAGRAPH_ANALYSIS_SYSTEM_PROMPT
                },
                { role: "user", content: cleanText }
            ],
            max_tokens: 1500,
            temperature: 0.1
        };

        const url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
        const reqData = JSON.stringify(payload);

        return makeApiPostRequest(url, {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
        }, reqData, 20000).then(respText => {
            const data = JSON.parse(respText);
            const rawContent = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!rawContent) throw new Error("智谱模型未返回内容");
            let cleanJsonStr = (rawContent || "").replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
            const objMatch = cleanJsonStr.match(/\{[\s\S]*\}/);
            const arrayMatch = cleanJsonStr.match(/\[[\s\S]*\]/);
            if (objMatch && (!arrayMatch || objMatch.index < arrayMatch.index)) {
                cleanJsonStr = objMatch[0];
            } else if (arrayMatch) {
                cleanJsonStr = arrayMatch[0];
            }
            let parsed;
            try {
                parsed = JSON.parse(cleanJsonStr);
            } catch (e1) {
                const sanitized = cleanJsonStr
                    .replace(/,\s*([\}\]])/g, "$1")
                    .replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => (c === "\n" || c === "\r" || c === "\t" ? c : ""));
                parsed = JSON.parse(sanitized);
            }
            let rawChunks = (parsed && parsed.chunks) || (Array.isArray(parsed) ? parsed : []);
            return {
                translation: ((parsed && parsed.translation) || "").trim(),
                chunks: normalizeChunks(rawChunks)
            };
        });
    }

    // 智能统一调度：一次性完成段落学术翻译与核心语块解构
    // 优先 Gemini，遇到故障或未配置时自动平滑降级到智谱
    function analyzeAndTranslateParagraph(text) {
        const cleanText = (text || "").trim();
        if (!cleanText) return Promise.reject(new Error("分析文本为空"));

        const geminiKey = getGeminiApiKey();
        if (geminiKey) {
            return requestGeminiGeneration(cleanText, PARAGRAPH_ANALYSIS_SYSTEM_PROMPT, 1500)
                .then(res => {
                    let translation = "";
                    let rawChunks = [];
                    if (res && typeof res === "object" && !Array.isArray(res)) {
                        translation = (res.translation || "").trim();
                        rawChunks = res.chunks || [];
                    } else if (Array.isArray(res)) {
                        rawChunks = res;
                    }
                    return {
                        translation,
                        chunks: normalizeChunks(rawChunks),
                        source: "gemini"
                    };
                })
                .catch(err => {
                    console.warn("[ISA] Gemini analyzeAndTranslate failed, fallback to Zhipu:", err);
                    return analyzeAndTranslateViaZhipu(cleanText).then(data => ({ ...data, source: "zhipu" }));
                });
        }

        return analyzeAndTranslateViaZhipu(cleanText).then(data => ({ ...data, source: "zhipu" }));
    }

    // 智谱 GLM-4-Flash 深度微观子语块解构
    function analyzeSubChunkViaZhipu(cleanText) {
        const apiKey = getZhipuApiKey();
        if (!apiKey) return Promise.reject(new Error("未配置智谱 API Key"));

        const payload = {
            model: "glm-4-flash",
            messages: [
                {
                    role: "system",
                    content: "你是雅思与学术英语精读专家。请将输入的英文短语进一步深入拆解为2-4个核心词组搭配或最小语义单元，并提供中文词义与记忆拓展（重点说明语境含义、搭配技巧或记忆窍门，切勿分析主谓宾等语法术语）。请直接以JSON数组输出：\n[\n  {\"en\": \"核心子语块/词组\", \"zh\": \"中文词义\", \"exp\": \"语境含义点拨与记忆搭配\"}\n]\n不要包含```json标记或多余闲聊，只输出JSON数组。"
                },
                { role: "user", content: cleanText }
            ],
            max_tokens: 450,
            temperature: 0.1
        };

        const url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
        const reqData = JSON.stringify(payload);

        return makeApiPostRequest(url, {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
        }, reqData, 15000).then(respText => {
            const data = JSON.parse(respText);
            const rawContent = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!rawContent) throw new Error("模型未返回内容");
            const cleanJsonStr = rawContent.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
            const parsed = JSON.parse(cleanJsonStr);
            return normalizeChunks(parsed);
        });
    }

    // 智能调度深度子解构：优先 Gemini，失败或未配置时自动降级到智谱
    function analyzeSubChunk(text) {
        const cleanText = (text || "").trim();
        if (!cleanText) return Promise.reject(new Error("分析语块为空"));

        const geminiKey = getGeminiApiKey();
        if (geminiKey) {
            const systemPrompt = "你是雅思与学术英语精读专家。请将输入的英文短语进一步深入拆解为2-4个核心词组搭配或最小语义单元，并提供中文词义与记忆拓展（重点说明语境含义、搭配技巧或记忆窍门，切勿分析主谓宾等语法术语）。严格输出纯JSON数组（不要有任何额外文字前缀或解释），格式规范如下：\n[\n  {\"en\": \"核心子语块/词组\", \"zh\": \"中文词义\", \"exp\": \"语境含义点拨与记忆搭配\"}\n]";
            return requestGeminiGeneration(cleanText, systemPrompt, 450)
                .then(res => normalizeChunks(res))
                .catch(err => {
                    console.warn("[ISA] Gemini analyzeSubChunk failed, fallback to Zhipu:", err);
                    return analyzeSubChunkViaZhipu(cleanText);
                });
        }

        return analyzeSubChunkViaZhipu(cleanText);
    }

    function escapeBreakdownHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // 雅思与学术英语高频核心语法名词词库（自动按长度降序匹配，优先匹配长词与专有名词）
    const GRAMMAR_KEYWORDS = [
        // 复合动能与分词/不定式功能
        "现在分词作状语", "过去分词作状语", "分词作状语", "分词作定语", "不定式作状语", "不定式作定语", "动名词作主语", "动名词作宾语",
        // 从句相关
        "非限制性定语从句", "限制性定语从句", "主从复合句", "同位语从句", "定语从句", "宾语从句", "主语从句", "表语从句", "状语从句",
        // 状语细分
        "让步转折状语", "让步状语", "条件状语", "时间状语", "原因状语", "目的状语", "结果状语", "伴随状语", "方式状语", "地点状语", "比较状语", "状语",
        // 非谓语与短语
        "非谓语动词", "介词短语", "分词短语", "现在分词", "过去分词", "动名词短语", "动名词", "不定式短语", "动词不定式", "不定式", "独立主格", "形容词短语", "副词短语", "动词短语",
        // 句型与语态
        "there be结构", "there be句型", "特殊疑问句", "一般疑问句", "反意疑问句", "反义疑问句", "强调句型", "强调句", "部分倒装", "完全倒装", "倒装句", "虚拟语气", "被动语态", "主动语态", "形式主语", "形式宾语", "双重否定", "并列结构", "省略句", "存在句",
        // 句子成分与动词分类
        "谓语动词", "情态动词", "系动词", "助动词", "宾语补足语", "主语补足语", "同位语", "双宾语", "复合谓语", "复合宾语"
    ];

    const _escapedGrammarKeywords = GRAMMAR_KEYWORDS.slice().sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const GRAMMAR_KEYWORD_REGEX = new RegExp(`(${_escapedGrammarKeywords.join("|")})`, "g");

    function renderExpWithGrammarKeywords(expText) {
        if (!expText) return "";
        const escaped = escapeBreakdownHtml(expText);
        return escaped.replace(GRAMMAR_KEYWORD_REGEX, (match) => {
            return `<span class="isa-grammar-keyword" data-term="${match}" title="点击查看「${match}」语境白话点拨">${match}</span>`;
        });
    }

    function normalizeGrammarResult(raw) {
        if (!raw) return [];
        let items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.points) ? raw.points : (raw && Array.isArray(raw.items) ? raw.items : []));
        if (!Array.isArray(items) || items.length === 0) {
            if (typeof raw === "object" && raw !== null) {
                items = Object.keys(raw).map(k => ({ tag: k, text: String(raw[k]) }));
            } else if (typeof raw === "string" && raw.trim()) {
                return [{ tag: "语境点拨", text: raw.trim() }];
            }
        }
        const list = [];
        items.forEach(item => {
            if (!item) return;
            if (typeof item === "string" && item.trim()) {
                list.push({ tag: "要点", text: item.trim() });
            } else if (typeof item === "object") {
                const tag = (item.tag || item.title || item.label || item.name || item.type || "要点").trim();
                const text = (item.text || item.content || item.desc || item.description || item.explanation || item.detail || item.value || "").trim();
                if (text) {
                    list.push({ tag, text });
                }
            }
        });
        return list;
    }

    function analyzeGrammarViaZhipu(term, enChunk, expContext, fullSentence) {
        const apiKey = getZhipuApiKey();
        if (!apiKey) return Promise.reject(new Error("未配置智谱 API Key"));

        const systemPrompt = "你是雅思与学术英语精读名师。请结合给定的英文原句与语块语境，用最通俗易懂的【大白话人话】向雅思考生点拨该语法术语在当前语境下的逻辑与用法（彻底摒弃枯燥死板的教科书术语堆砌）：\n" +
            "【输出格式要求】：\n" +
            "严格输出纯JSON数组，包含 2-3 个要点对象，每个对象包含 tag 和 text 两个键：\n" +
            "1. {\"tag\": \"通俗本质\", \"text\": \"一句话大白话讲透它在人话里到底是什么意思（打通理解，如：给前面的抽象名词开小窗户交代底细）\"}\n" +
            "2. {\"tag\": \"本句剖析\", \"text\": \"结合当前句子具体单词，讲透作者为什么在这里用它、表达了什么具体事实或逻辑\"}\n" +
            "3. {\"tag\": \"阅读避坑\", \"text\": \"雅思阅读做题或扫读时，看到这个结构应该怎么看、怎么抓核心\"}\n\n" +
            "不要包含任何markdown代码块如```json或闲聊前缀，只输出纯JSON数组。";

        const userPrompt = `【语法术语】：${term}\n【所在语块】：${enChunk || ""}\n【语块原解析】：${expContext || ""}\n【英文原句/段落】：${fullSentence || ""}`;

        const payload = {
            model: "glm-4-flash",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 600,
            temperature: 0.1
        };

        const url = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
        const reqData = JSON.stringify(payload);

        return makeApiPostRequest(url, {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
        }, reqData, 15000).then(respText => {
            const data = JSON.parse(respText);
            const rawContent = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!rawContent) throw new Error("模型未返回内容");
            const cleanJsonStr = rawContent.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
            const parsed = JSON.parse(cleanJsonStr);
            return normalizeGrammarResult(parsed);
        });
    }

    function analyzeGrammarInContext(term, enChunk, expContext, fullSentence) {
        const cleanTerm = (term || "").trim();
        if (!cleanTerm) return Promise.reject(new Error("语法术语为空"));

        const geminiKey = getGeminiApiKey();
        if (geminiKey) {
            const systemPrompt = "你是雅思与学术英语精读名师。请结合给定的英文原句与语块语境，用最通俗易懂的【大白话人话】向雅思考生点拨该语法术语在当前语境下的逻辑与用法（彻底摒弃枯燥死板的教科书术语堆砌）：\n" +
                "【输出格式要求】：\n" +
                "严格输出纯JSON数组，包含 2-3 个要点对象，每个对象包含 tag 和 text 两个键：\n" +
                "1. {\"tag\": \"通俗本质\", \"text\": \"一句话大白话讲透它在人话里到底是什么意思（打通理解，如：给前面的抽象名词开小窗户交代底细）\"}\n" +
                "2. {\"tag\": \"本句剖析\", \"text\": \"结合当前句子具体单词，讲透作者为什么在这里用它、表达了什么具体事实或逻辑\"}\n" +
                "3. {\"tag\": \"阅读避坑\", \"text\": \"雅思阅读做题或扫读时，看到这个结构应该怎么看、怎么抓核心\"}\n\n" +
                "严格输出纯JSON数组，不要包含任何markdown代码块如```json或闲聊前缀，只输出纯JSON数组。";

            const userPrompt = `【语法术语】：${cleanTerm}\n【所在语块】：${enChunk || ""}\n【语块原解析】：${expContext || ""}\n【英文原句/段落】：${fullSentence || ""}`;

            return requestGeminiGeneration(userPrompt, systemPrompt, 600)
                .then(res => normalizeGrammarResult(res))
                .catch(err => {
                    console.warn("[ISA] Gemini analyzeGrammar failed, fallback to Zhipu:", err);
                    return analyzeGrammarViaZhipu(cleanTerm, enChunk, expContext, fullSentence);
                });
        }

        return analyzeGrammarViaZhipu(cleanTerm, enChunk, expContext, fullSentence);
    }

    // ==========================================
    // Paragraph Speech & CSS Highlight Tracking
    // ==========================================
    const _hasHighlightSupport = typeof CSS !== "undefined" && typeof CSS.highlights !== "undefined" && typeof Highlight !== "undefined";

    function clearSpeechHighlights() {
        if (_hasHighlightSupport) {
            try {
                CSS.highlights.delete("isa-speak-word");
                CSS.highlights.delete("isa-speak-sentence");
            } catch (e) {}
        }
    }

    function buildParagraphSpeechMap(targetEl) {
        if (!targetEl) return null;
        const textNodes = [];
        const walker = document.createTreeWalker(
            targetEl,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    let parent = node.parentElement;
                    while (parent && parent !== targetEl) {
                        if (
                            parent.classList.contains("translation-bubble") ||
                            parent.classList.contains("isa-paragraph-translation") ||
                            parent.getAttribute("aria-hidden") === "true" ||
                            parent.tagName === "SCRIPT" ||
                            parent.tagName === "STYLE" ||
                            parent.tagName === "NOSCRIPT"
                        ) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        parent = parent.parentElement;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let currentNode;
        while ((currentNode = walker.nextNode())) {
            const val = currentNode.nodeValue;
            if (val) {
                textNodes.push({ node: currentNode, text: val });
            }
        }

        if (!textNodes.length) return null;

        let fullText = "";
        const charMap = [];
        for (const item of textNodes) {
            const str = item.text;
            for (let i = 0; i < str.length; i++) {
                charMap.push({ node: item.node, offset: i });
            }
            fullText += str;
        }

        return { fullText, charMap };
    }


    function applySpeechHighlight(speechMap, offsetInParagraph, localIdx, wordLen, rawWord) {
        if (!_hasHighlightSupport || !speechMap || !speechMap.charMap.length) return;
        const globalIdx = offsetInParagraph + localIdx;
        if (globalIdx < 0 || globalIdx >= speechMap.charMap.length) return;

        // Guard against whole-sentence or multi-word chunk anomalies
        if (rawWord && (rawWord.includes(" ") || rawWord.length > 40)) {
            return;
        }

        let len = wordLen;
        if (!len || len <= 0 || len > 40) {
            if (rawWord && rawWord.length > 0 && rawWord.length <= 40) {
                len = rawWord.length;
            } else {
                const sub = speechMap.fullText.slice(globalIdx);
                const m = sub.match(/^[\w'-]+/);
                len = m ? m[0].length : 1;
            }
        }
        if (len > 40) len = 40;

        const wordStartIdx = globalIdx;
        const wordEndIdx = Math.min(globalIdx + len, speechMap.charMap.length);
        if (wordEndIdx <= wordStartIdx) return;

        const startItem = speechMap.charMap[wordStartIdx];
        const endItem = speechMap.charMap[wordEndIdx - 1];

        try {
            const wordRange = document.createRange();
            wordRange.setStart(startItem.node, startItem.offset);
            wordRange.setEnd(endItem.node, endItem.offset + 1);

            CSS.highlights.set("isa-speak-word", new Highlight(wordRange));
        } catch (highlightErr) {}
    }

    function highlightPhraseWord(enEl, localIdx, wordLen, rawWord) {
        if (!_hasHighlightSupport || !enEl) return;
        const text = (enEl.textContent || "");
        if (!text || localIdx < 0 || localIdx >= text.length) return;

        let len = wordLen;
        if (!len || len <= 0 || len > 40) {
            if (rawWord && rawWord.length > 0 && rawWord.length <= 40) {
                len = rawWord.length;
            } else {
                const sub = text.slice(localIdx);
                const m = sub.match(/^[\w'-]+/);
                len = m ? m[0].length : 1;
            }
        }
        if (len > 40) len = 40;

        let currentOffset = 0;
        let startNode = null, startOffset = 0;
        let endNode = null, endOffset = 0;

        const walker = document.createTreeWalker(enEl, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const nodeLen = node.nodeValue.length;
            if (!startNode && currentOffset + nodeLen > localIdx) {
                startNode = node;
                startOffset = localIdx - currentOffset;
            }
            if (startNode && currentOffset + nodeLen >= localIdx + len) {
                endNode = node;
                endOffset = (localIdx + len) - currentOffset;
                break;
            }
            currentOffset += nodeLen;
        }

        if (startNode && !endNode) {
            endNode = startNode;
            endOffset = Math.min(startNode.nodeValue.length, startOffset + len);
        }

        if (startNode && endNode) {
            try {
                const wordRange = document.createRange();
                wordRange.setStart(startNode, startOffset);
                wordRange.setEnd(endNode, endOffset);
                CSS.highlights.set("isa-speak-word", new Highlight(wordRange));
            } catch (highlightErr) {}
        }
    }

    function insertParagraphTranslation(targetParagraph, textToTranslate) {
        if (!targetParagraph) return;

        const clean = (textToTranslate || "").trim();
        if (!clean) return;

        clearSpeechHighlights();

        let transBox = targetParagraph.nextElementSibling;
        if (!transBox || !transBox.classList.contains("isa-paragraph-translation")) {
            transBox = document.createElement("div");
            transBox.className = "isa-paragraph-translation is-compact";
            transBox.innerHTML = `
                <div class="isa-trans-header">
                    <span class="isa-trans-title">
                        <span class="isa-trans-title-text">🌐 段落中文翻译</span>
                        <span class="isa-trans-status"><svg class="isa-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" title="正在翻译与解构..."><path d="M12 2v4m0 12v4m-7-7H2m20 0h-4M4.9 4.9l2.8 2.8m8.6 8.6 2.8 2.8M4.9 19.1l2.8-2.8m8.6-8.6 2.8-2.8"/></svg></span>
                    </span>
                    <span class="isa-trans-tools">
                        <button class="isa-trans-btn speak-unified" title="点击朗读段落（连续点击切换循环次数: 1-3-6-10-15，优先高保真 Siri 语音）">🎧 朗读段落</button>
                        <button class="isa-trans-btn close" title="关闭">✕</button>
                    </span>
                </div>
                <div class="isa-trans-content" style="display:none;"></div>
                <div class="isa-breakdown-container" style="display:none;">
                    <div class="isa-breakdown-content"></div>
                </div>
            `;
            targetParagraph.insertAdjacentElement("afterend", transBox);

            const speakUnifiedBtn = transBox.querySelector(".isa-trans-btn.speak-unified");
            const closeBtn = transBox.querySelector(".isa-trans-btn.close");

            speakUnifiedBtn.onclick = (e) => {
                e.stopPropagation();

                // If currently speaking, clicking immediately stops playback
                if (speakUnifiedBtn._isSpeaking) {
                    stopAllSpeech();
                    if (speakUnifiedBtn._debounceTimer) {
                        clearTimeout(speakUnifiedBtn._debounceTimer);
                        speakUnifiedBtn._debounceTimer = null;
                    }
                    speakUnifiedBtn._isSpeaking = false;
                    speakUnifiedBtn.classList.remove("speaking", "ready");
                    speakUnifiedBtn.textContent = "🎧 朗读段落";
                    speakUnifiedBtn.title = "点击朗读段落（连续点击切换循环次数: 1-3-6-10-15，优先高保真 Siri 语音）";
                    speakUnifiedBtn._stepIndex = -1;
                    return;
                }

                // Reset other paragraph buttons if any
                resetAllParagraphSpeakBtns(speakUnifiedBtn);

                const rawText = transBox._currentEnglishText || textToTranslate || (targetParagraph ? targetParagraph.innerText : "");
                const cleanEnglish = (rawText || "")
                    .replace(/[–—]/g, "-")
                    .replace(/[‘’]/g, "'")
                    .replace(/[“”]/g, '"')
                    .replace(/\u2026/g, "...")
                    .replace(/\s+/g, " ")
                    .trim();

                if (!cleanEnglish) return;

                // Step-wise repeat count: 1 -> 3 -> 6 -> 10 -> 15 (loops back to 1)
                speakUnifiedBtn._stepIndex = ((speakUnifiedBtn._stepIndex ?? -1) + 1) % REPEAT_STEPS.length;
                const count = REPEAT_STEPS[speakUnifiedBtn._stepIndex];

                // Visual feedback during rapid clicks
                speakUnifiedBtn.classList.remove("speaking");
                speakUnifiedBtn.classList.add("ready");
                speakUnifiedBtn.textContent = count > 1 ? `🎧 朗读 (${count}次)` : `🎧 朗读 (1次)`;
                speakUnifiedBtn.title = `连续点击切换播放次数 (1-3-6-10-15)，停顿后自动播放`;

                // Debounce 650ms: after user stops clicking, start playback
                if (speakUnifiedBtn._debounceTimer) clearTimeout(speakUnifiedBtn._debounceTimer);
                speakUnifiedBtn._debounceTimer = setTimeout(() => {
                    let activeBlock = transBox._targetParagraph || targetParagraph;
                    const cleanPrefix = cleanEnglish.slice(0, Math.min(cleanEnglish.length, 25));
                    if (activeBlock && cleanPrefix) {
                        const blockText = (activeBlock.innerText || activeBlock.textContent || "").replace(/\s+/g, " ").trim();
                        if (!blockText.includes(cleanPrefix)) {
                            let prev = activeBlock.previousElementSibling;
                            while (prev) {
                                const pText = (prev.innerText || prev.textContent || "").replace(/\s+/g, " ").trim();
                                if (pText.includes(cleanPrefix)) {
                                    activeBlock = prev;
                                    transBox._targetParagraph = prev;
                                    break;
                                }
                                prev = prev.previousElementSibling;
                            }
                        }
                    }

                    const speechMap = buildParagraphSpeechMap(activeBlock);
                    let offsetInParagraph = 0;
                    let isTextMatchedInBlock = false;
                    if (speechMap && speechMap.fullText) {
                        const normFull = speechMap.fullText.replace(/\s+/g, " ");
                        const normClean = cleanEnglish.replace(/\s+/g, " ");
                        const idx = normFull.indexOf(normClean);
                        if (idx >= 0) {
                            offsetInParagraph = idx;
                            isTextMatchedInBlock = true;
                        } else {
                            const firstFewWords = normClean.split(" ").slice(0, 3).join(" ");
                            const subIdx = normFull.indexOf(firstFewWords);
                            if (subIdx >= 0) {
                                offsetInParagraph = subIdx;
                                isTextMatchedInBlock = true;
                            }
                        }
                    }

                    speakUnifiedBtn._isSpeaking = true;
                    speakUnifiedBtn.classList.remove("ready");
                    speakUnifiedBtn.classList.add("speaking");
                    speakUnifiedBtn.textContent = count > 1 ? `⏹ 停止朗读 (1/${count})` : `⏹ 停止朗读`;

                    playEnglishSpeech(cleanEnglish, {
                        count,
                        element: speakUnifiedBtn,
                        onLoopStart: ({ loopIndex, totalLoops }) => {
                            const curr = (loopIndex || 0) + 1;
                            const total = totalLoops || count;
                            speakUnifiedBtn.textContent = total > 1 ? `⏹ 停止朗读 (${curr}/${total})` : `⏹ 停止朗读`;
                            clearSpeechHighlights();
                        },
                        onWord: ({ charIndex, length, rawWord }) => {
                            if (isTextMatchedInBlock && speechMap && charIndex >= 0) {
                                applySpeechHighlight(speechMap, offsetInParagraph, charIndex, length, rawWord);
                            }
                        },
                        onLoopEnd: () => {
                            clearSpeechHighlights();
                        },
                        onEnd: () => {
                            clearSpeechHighlights();
                            speakUnifiedBtn._isSpeaking = false;
                            speakUnifiedBtn.classList.remove("speaking", "ready");
                            speakUnifiedBtn.textContent = "🎧 朗读段落";
                            speakUnifiedBtn.title = "点击朗读段落（连续点击切换循环次数: 1-3-6-10-15，优先高保真 Siri 语音）";
                            speakUnifiedBtn._stepIndex = -1;
                        }
                    });
                }, 650);
            };

                        closeBtn.onclick = (e) => {
                e.stopPropagation();
                stopAllSpeech();
                if (speakUnifiedBtn._debounceTimer) {
                    clearTimeout(speakUnifiedBtn._debounceTimer);
                    speakUnifiedBtn._debounceTimer = null;
                }
                clearSpeechHighlights();
                transBox.remove();
            };
        }

        transBox._currentEnglishText = textToTranslate;
        transBox._targetParagraph = targetParagraph;
        const contentEl = transBox.querySelector(".isa-trans-content");
        const statusEl = transBox.querySelector(".isa-trans-status");

        if (statusEl) {
            statusEl.onclick = (e) => {
                const reloadBtn = e.target.closest(".isa-trans-reload-btn");
                if (reloadBtn) {
                    e.stopPropagation();
                    fetchTranslationAndBreakdown();
                }
            };
        }

        const breakdownContainerEl = transBox.querySelector(".isa-breakdown-container");
        const breakdownContentEl = transBox.querySelector(".isa-breakdown-content");

        function handleFail() {
            transBox.classList.add("is-compact");
            const titleEl = transBox.querySelector(".isa-trans-title-text");
            if (titleEl) {
                titleEl.textContent = "🌐 段落中文翻译";
            }
            if (statusEl) {
                statusEl.innerHTML = `<button type="button" class="isa-trans-reload-btn" title="AI 请求连接超时或失败，点击重新获取">🔄</button>`;
                statusEl.style.display = "inline-flex";
            }
            if (contentEl) {
                contentEl.style.display = "none";
                contentEl.innerHTML = "";
            }
            if (breakdownContainerEl) {
                breakdownContainerEl.style.display = "none";
            }
        }

        function fetchTranslationAndBreakdown() {
            transBox.classList.add("is-compact");
            const titleEl = transBox.querySelector(".isa-trans-title-text");
            if (titleEl) {
                titleEl.textContent = "🌐 段落中文翻译";
            }
            if (statusEl) {
                statusEl.innerHTML = `<svg class="isa-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" title="正在翻译与解构..."><path d="M12 2v4m0 12v4m-7-7H2m20 0h-4M4.9 4.9l2.8 2.8m8.6 8.6 2.8 2.8M4.9 19.1l2.8-2.8m8.6-8.6 2.8-2.8"/></svg>`;
                statusEl.style.display = "inline-flex";
            }
            if (contentEl) {
                contentEl.style.display = "none";
                contentEl.innerHTML = "";
            }
            if (breakdownContainerEl) breakdownContainerEl.style.display = "none";
            if (breakdownContentEl) {
                breakdownContentEl.className = "isa-breakdown-content";
                breakdownContentEl.innerHTML = "";
            }

            analyzeAndTranslateParagraph(textToTranslate)
                .then(resultObj => {
                    const translation = (resultObj && resultObj.translation) || "";
                    const items = (resultObj && resultObj.chunks) || [];
                    const source = (resultObj && resultObj.source) || (getGeminiApiKey() ? "gemini" : "zhipu");

                    if (!translation) {
                        handleFail();
                        return;
                    }

                    // 1. 标题标记 API 归属（Gemini / 智谱 AI）
                    const modelName = source === "gemini" ? "Gemini" : "智谱 AI";
                    if (titleEl) {
                        titleEl.textContent = `🌐 段落中文翻译 (${modelName})`;
                    }
                    if (statusEl) {
                        statusEl.innerHTML = "";
                        statusEl.style.display = "none";
                    }

                    // 2. 展开卡片并填充整句学术翻译
                    transBox.classList.remove("is-compact");
                    if (contentEl) {
                        contentEl.style.display = "block";
                        contentEl.className = "isa-trans-content";
                        contentEl.textContent = translation;
                    }

                    const SUB_ICON_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="18" r="3"></circle><path d="M6 9v3a3 3 0 0 0 3 3h6"></path></svg>`;

                    const validItems = Array.isArray(items) ? items.filter(c => {
                        if (!c || typeof c !== "object") return false;
                        const enPart = (c.en || c.chunk || c.phrase || c.english || c.verb || c.action || "").trim();
                        const zhPart = (c.zh || c.chinese || c.meaning || c.translation || "").trim();
                        const expPart = (c.exp || c.explanation || c.desc || c.description || c.analysis || "").trim();
                        return Boolean(enPart || zhPart || expPart);
                    }) : [];

                    if (validItems.length > 0) {
                        let html = `<div class="isa-breakdown-header">📖 核心语块深度解构</div>`;
                        html += `<ul class="isa-breakdown-list">`;
                        validItems.forEach(c => {
                            const enPart = (c.en || c.chunk || c.phrase || c.english || c.verb || c.action || "").trim();
                            const zhPart = (c.zh || c.chinese || c.meaning || c.translation || "").trim();
                            let expPart = (c.exp || c.explanation || c.desc || c.description || c.analysis || c.note || c.detail || c.context || c.usage || "").trim();
                            
                            // 兜底提取：如果常见 key 都没命中，遍历对象找出不是 enPart 和 zhPart 的字符串字段
                            if (!expPart) {
                                for (const key of Object.keys(c)) {
                                    if (!["en", "chunk", "phrase", "english", "verb", "action", "zh", "chinese", "meaning", "translation"].includes(key.toLowerCase())) {
                                        const val = c[key];
                                        if (typeof val === "string" && val.trim() && val.trim() !== enPart && val.trim() !== zhPart) {
                                            expPart = val.trim();
                                            break;
                                        }
                                    }
                                }
                            }

                            const subBtnHtml = enPart ? `<button type="button" class="isa-breakdown-sub-btn" title="进一步解构此语块" data-en="${escapeBreakdownHtml(enPart)}">${SUB_ICON_SVG}</button>` : "";

                            html += `
                                <li class="isa-breakdown-item">
                                    <strong class="isa-breakdown-term"><span class="isa-breakdown-phrase" title="点击朗读"><span class="isa-breakdown-en">${escapeBreakdownHtml(enPart)}</span>${zhPart ? `（${escapeBreakdownHtml(zhPart)}）` : ""}</span>${subBtnHtml}：</strong><span class="isa-breakdown-desc">${renderExpWithGrammarKeywords(expPart)}</span>
                                    <div class="isa-breakdown-sub-container" style="display: none;"></div>
                                    <div class="isa-breakdown-grammar-container" style="display: none;"></div>
                                </li>
                            `;
                        });
                        html += `</ul>`;

                        breakdownContentEl.className = "isa-breakdown-content";
                        breakdownContentEl.innerHTML = html;
                        if (breakdownContainerEl) breakdownContainerEl.style.display = "block";
                    } else {
                        if (breakdownContainerEl) breakdownContainerEl.style.display = "none";
                    }

                    function handleSubBreakdownClick(btn, itemLi) {
                        const enText = (btn.getAttribute("data-en") || "").trim();
                        if (!enText) return;
                        let subContainer = itemLi.querySelector(".isa-breakdown-sub-container");
                        if (!subContainer) {
                            subContainer = document.createElement("div");
                            subContainer.className = "isa-breakdown-sub-container";
                            itemLi.appendChild(subContainer);
                        }
                        subContainer.onclick = null;

                        if (subContainer._hasLoaded) {
                            if (subContainer.style.display === "none") {
                                subContainer.style.display = "block";
                                btn.classList.add("is-active");
                                btn.title = "收起解构";
                            } else {
                                subContainer.style.display = "none";
                                btn.classList.remove("is-active");
                                btn.title = "进一步解构此语块";
                            }
                            return;
                        }

                        btn.classList.add("is-loading");
                        btn.innerHTML = `<svg class="isa-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4m0 12v4m-7-7H2m20 0h-4M4.9 4.9l2.8 2.8m8.6 8.6 2.8 2.8M4.9 19.1l2.8-2.8m8.6-8.6 2.8-2.8"/></svg>`;
                        subContainer.style.display = "block";
                        subContainer.innerHTML = `<div class="isa-breakdown-sub-loading"><svg class="isa-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4m0 12v4m-7-7H2m20 0h-4M4.9 4.9l2.8 2.8m8.6 8.6 2.8 2.8M4.9 19.1l2.8-2.8m8.6-8.6 2.8-2.8"/></svg> 正在深度解构「${escapeBreakdownHtml(enText)}」...</div>`;

                        analyzeSubChunk(enText)
                            .then(subItems => {
                                btn.classList.remove("is-loading");
                                btn.innerHTML = SUB_ICON_SVG;
                                subContainer.onclick = null;

                                const validSubItems = Array.isArray(subItems) ? subItems.filter(item => {
                                    if (!item || typeof item !== "object") return false;
                                    return Boolean((item.en || item.chunk || "").trim() || (item.zh || "").trim() || (item.exp || item.explanation || "").trim());
                                }) : [];

                                if (validSubItems.length === 0) {
                                    subContainer.innerHTML = `<div class="isa-breakdown-sub-empty">未拆解出更细粒度语块</div>`;
                                    return;
                                }

                                subContainer._hasLoaded = true;
                                btn.classList.add("is-active");
                                btn.title = "收起解构";

                                let subHtml = `<ul class="isa-breakdown-sub-list">`;
                                validSubItems.forEach(item => {
                                    const subEn = (item.en || item.chunk || "").trim();
                                    const subZh = (item.zh || "").trim();
                                    const subExp = (item.exp || item.explanation || "").trim();
                                    subHtml += `
                                        <li class="isa-breakdown-sub-item">
                                            <strong class="isa-breakdown-term"><span class="isa-breakdown-phrase" title="点击朗读"><span class="isa-breakdown-en">${escapeBreakdownHtml(subEn)}</span>${subZh ? `（${escapeBreakdownHtml(subZh)}）` : ""}</span>：</strong><span class="isa-breakdown-desc">${escapeBreakdownHtml(subExp)}</span>
                                        </li>
                                    `;
                                });
                                subHtml += `</ul>`;
                                subContainer.innerHTML = subHtml;
                            })
                            .catch(err => {
                                btn.classList.remove("is-loading");
                                btn.innerHTML = SUB_ICON_SVG;
                                subContainer.onclick = null;
                                console.warn("[ISA] Sub-breakdown error:", err);
                                subContainer.innerHTML = `<div class="isa-breakdown-sub-error">解构请求失败（点击重试）</div>`;
                            });
                    }

                    function handleGrammarTermClick(span, itemLi) {
                        const term = (span.getAttribute("data-term") || span.textContent || "").trim();
                        if (!term) return;

                        let grammarContainer = itemLi.querySelector(".isa-breakdown-grammar-container");
                        if (!grammarContainer) {
                            grammarContainer = document.createElement("div");
                            grammarContainer.className = "isa-breakdown-grammar-container";
                            itemLi.appendChild(grammarContainer);
                        }
                        grammarContainer.onclick = null;

                        // Toggle: 如果点的是同一个已加载完成的术语，则折叠/展开
                        if (grammarContainer._currentTerm === term && grammarContainer._hasLoaded) {
                            if (grammarContainer.style.display === "none") {
                                grammarContainer.style.display = "block";
                            } else {
                                grammarContainer.style.display = "none";
                            }
                            return;
                        }

                        grammarContainer._cache = grammarContainer._cache || {};
                        if (grammarContainer._cache[term]) {
                            grammarContainer._currentTerm = term;
                            grammarContainer._hasLoaded = true;
                            grammarContainer.style.display = "block";
                            renderGrammarUI(grammarContainer, term, grammarContainer._cache[term]);
                            return;
                        }

                        grammarContainer._currentTerm = term;
                        grammarContainer._hasLoaded = false;
                        grammarContainer.style.display = "block";
                        grammarContainer.innerHTML = `<div class="isa-breakdown-grammar-loading"><svg class="isa-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4m0 12v4m-7-7H2m20 0h-4M4.9 4.9l2.8 2.8m8.6 8.6 2.8 2.8M4.9 19.1l2.8-2.8m8.6-8.6 2.8-2.8"/></svg> 正在结合语境点拨「${escapeBreakdownHtml(term)}」...</div>`;

                        const enChunk = (itemLi.querySelector(".isa-breakdown-en")?.textContent || "").trim();
                        const expContext = (itemLi.querySelector(".isa-breakdown-desc")?.textContent || "").trim();
                        const fullSentence = textToTranslate || "";

                        analyzeGrammarInContext(term, enChunk, expContext, fullSentence)
                            .then(points => {
                                grammarContainer.onclick = null;
                                if (!points || points.length === 0) {
                                    grammarContainer.innerHTML = `<div class="isa-breakdown-grammar-empty">未能生成该术语的语境点拨</div>`;
                                    return;
                                }
                                grammarContainer._cache[term] = points;
                                grammarContainer._hasLoaded = true;
                                renderGrammarUI(grammarContainer, term, points);
                            })
                            .catch(err => {
                                grammarContainer.onclick = null;
                                console.warn("[ISA] Grammar analysis error:", err);
                                grammarContainer.innerHTML = `<div class="isa-breakdown-grammar-error">点拨生成失败（点击重试）</div>`;
                            });
                    }

                    function renderGrammarUI(container, term, points) {
                        let html = `
                            <div class="isa-breakdown-grammar-header">
                                <span class="isa-breakdown-grammar-title">💡「${escapeBreakdownHtml(term)}」语境白话点拨</span>
                                <button type="button" class="isa-breakdown-grammar-close" title="收起">✕</button>
                            </div>
                            <ul class="isa-breakdown-grammar-list">
                        `;
                        points.forEach(p => {
                            html += `
                                <li class="isa-breakdown-grammar-item">
                                    <strong class="isa-breakdown-grammar-tag">【${escapeBreakdownHtml(p.tag)}】：</strong><span class="isa-breakdown-grammar-desc">${escapeBreakdownHtml(p.text)}</span>
                                </li>
                            `;
                        });
                        html += `</ul>`;
                        container.innerHTML = html;
                    }

                    breakdownContentEl.onclick = (e) => {
                        const grammarCloseBtn = e.target.closest(".isa-breakdown-grammar-close");
                        if (grammarCloseBtn) {
                            e.stopPropagation();
                            const gContainer = grammarCloseBtn.closest(".isa-breakdown-grammar-container");
                            if (gContainer) {
                                gContainer.style.display = "none";
                            }
                            return;
                        }

                        const grammarErrorEl = e.target.closest(".isa-breakdown-grammar-error");
                        if (grammarErrorEl) {
                            e.stopPropagation();
                            const itemLi = grammarErrorEl.closest(".isa-breakdown-item");
                            const gContainer = itemLi ? itemLi.querySelector(".isa-breakdown-grammar-container") : null;
                            const term = gContainer ? gContainer._currentTerm : "";
                            if (itemLi && term) {
                                if (gContainer) {
                                    gContainer._hasLoaded = false;
                                    gContainer.onclick = null;
                                }
                                const span = itemLi.querySelector(`.isa-grammar-keyword[data-term="${term}"]`) || { getAttribute: () => term, textContent: term };
                                handleGrammarTermClick(span, itemLi);
                            }
                            return;
                        }

                        const subErrorEl = e.target.closest(".isa-breakdown-sub-error");
                        if (subErrorEl) {
                            e.stopPropagation();
                            const itemLi = subErrorEl.closest(".isa-breakdown-item");
                            const subBtn = itemLi ? itemLi.querySelector(".isa-breakdown-sub-btn") : null;
                            if (itemLi && subBtn) {
                                const subContainer = itemLi.querySelector(".isa-breakdown-sub-container");
                                if (subContainer) {
                                    subContainer._hasLoaded = false;
                                    subContainer.onclick = null;
                                }
                                handleSubBreakdownClick(subBtn, itemLi);
                            }
                            return;
                        }

                        const grammarEl = e.target.closest(".isa-grammar-keyword");
                        if (grammarEl) {
                            e.stopPropagation();
                            const itemLi = grammarEl.closest(".isa-breakdown-item");
                            if (itemLi) {
                                handleGrammarTermClick(grammarEl, itemLi);
                            }
                            return;
                        }

                        if (e.target.closest(".isa-breakdown-grammar-container")) {
                            return;
                        }

                        const subBtn = e.target.closest(".isa-breakdown-sub-btn");
                        if (subBtn) {
                            e.stopPropagation();
                            const itemLi = subBtn.closest(".isa-breakdown-item");
                            if (itemLi) {
                                handleSubBreakdownClick(subBtn, itemLi);
                            }
                            return;
                        }

                        const phraseEl = e.target.closest(".isa-breakdown-phrase");
                        const enEl = e.target.closest(".isa-breakdown-en");
                        const targetTerm = e.target.closest(".isa-breakdown-term");
                        const container = phraseEl || targetTerm;
                        const finalEnEl = enEl || (container ? container.querySelector(".isa-breakdown-en") : null);

                        if (finalEnEl) {
                            e.stopPropagation();

                            const phraseToPlay = phraseEl || finalEnEl.closest(".isa-breakdown-phrase") || finalEnEl;

                            // 如果当前语块已经在朗读，再次点击则停止播放
                            if (phraseToPlay.classList.contains("is-speaking-phrase")) {
                                stopAllSpeech();
                                return;
                            }

                            // 1. 取消浏览器原生选区，完全不占用和破坏正文已有 Selection
                            const selection = window.getSelection();
                            if (selection) {
                                selection.removeAllRanges();
                            }

                            // 2. 状态切换与标记当前正在播放的语块底色
                            stopAllSpeech();
                            phraseToPlay.classList.add("is-speaking-phrase");

                            const enText = (finalEnEl.innerText || finalEnEl.textContent || "").trim();

                            // 3. 播放英文语音并启用实时音词跟随高亮
                            if (enText) {
                                playEnglishSpeech(enText, {
                                    onWord: (info) => {
                                        highlightPhraseWord(finalEnEl, info.charIndex, info.length, info.rawWord);
                                    },
                                    onEnd: () => {
                                        clearSpeechHighlights();
                                        phraseToPlay.classList.remove("is-speaking-phrase");
                                    }
                                });
                            }
                        }
                    };
                })
                .catch(err => {
                    console.warn("[ISA] analyzeAndTranslateParagraph failed:", err);
                    handleFail();
                });
        }

        fetchTranslationAndBreakdown();
    }

    // ==========================================
    // Selection Trigger Button
    // ==========================================
    let currentTriggerBtn = null;

    function removeTriggerBtn() {
        if (currentTriggerBtn) {
            currentTriggerBtn.remove();
            currentTriggerBtn = null;
        }
    }

    function showTriggerButton(range, matchCount, x, y) {
        removeTriggerBtn();

        const btn = document.createElement("div");
        btn.className = "isa-trigger-btn";
        btn.innerHTML = `
            <span class="isa-trigger-icon-wrap">
                <svg class="isa-trigger-icon-book" viewBox="0 0 24 24">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                </svg>
                <svg class="isa-trigger-icon-sparkle" viewBox="0 0 24 24">
                    <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z"></path>
                </svg>
            </span>
            <span class="isa-trigger-text">IELTS Vocab (${matchCount})</span>
        `;

        let posX = x + 10;
        let posY = y - 42;

        if (posY < 10) posY = y + 20;
        if (posX + 140 > window.innerWidth) posX = window.innerWidth - 150;

        btn.style.left = `${posX}px`;
        btn.style.top = `${posY}px`;

        btn.onmousedown = (e) => {
            e.preventDefault(); // Prevents selection from collapsing when clicking button
        };

        btn.onclick = (e) => {
            e.stopPropagation();
            removeTriggerBtn();
            const textToTranslate = range.toString().trim();
            const targetParagraph = findParagraphContainer(range, textToTranslate);
            const fallbackText = targetParagraph ? targetParagraph.innerText.trim() : "";
            const cleanSel = textToTranslate.replace(/\s+/g, " ").trim();
            const selWords = cleanSel.match(/[a-zA-Z\'-]+/g) || [];
            const finalText = (selWords.length >= 4 && cleanSel.length >= 20) ? cleanSel : (fallbackText || cleanSel);
            highlightRange(range);
            if (targetParagraph && finalText) {
                insertParagraphTranslation(targetParagraph, finalText);
            }
            try {
                window.getSelection().removeAllRanges();
            } catch (err) {}
        };

        document.body.appendChild(btn);
        currentTriggerBtn = btn;
    }

    // ==========================================
    // Event Listeners
    // ==========================================
    document.addEventListener("mouseup", (event) => {
        if (isStatsPage()) {
            removeTriggerBtn();
            return;
        }
        if (currentTriggerBtn && currentTriggerBtn.contains(event.target)) {
            return;
        }
        if (isMemoryModalOpen() || event.target.closest(".isa-paragraph-translation") || event.target.closest("#geek-memory-modal")) {
            removeTriggerBtn();
            return;
        }

        setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) {
                removeTriggerBtn();
                return;
            }

            const selectedText = selection.toString().trim();
            if (!selectedText || selectedText.length < 2) {
                removeTriggerBtn();
                return;
            }

            if (!isVocabReady) {
                if (vocabLoadPromise) showMiniNotice("词库首次下载初始化中，请稍候...");
                removeTriggerBtn();
                return;
            }
            const tokens = selectedText.match(/\b[a-zA-Z\'-]+\b/g);
            if (!tokens || tokens.length === 0) {
                removeTriggerBtn();
                return;
            }

            let matchCount = 0;
            for (const token of tokens) {
                if (lookupWord(token)) {
                    matchCount++;
                }
            }

            if (matchCount > 0) {
                const range = selection.getRangeAt(0).cloneRange();
                const rect = range.getBoundingClientRect();
                const btnX = rect.right > 0 ? rect.right : event.clientX;
                const btnY = rect.top > 0 ? rect.top : event.clientY;
                showTriggerButton(range, matchCount, btnX, btnY);
            } else {
                removeTriggerBtn();
            }
        }, 50);
    });

    document.addEventListener("mousedown", (event) => {
        if (currentTriggerBtn && !currentTriggerBtn.contains(event.target)) {
            removeTriggerBtn();
        }
    });

    document.addEventListener("click", (event) => {
        const clickedMark = event.target.closest(".geek-vocab-mark");
        if (!clickedMark) {
            closeAllOpenedBubbles(null);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeMemoryModal();
            closeAllOpenedBubbles(null);
            removeTriggerBtn();
            return;
        }
        if (isMemoryModalOpen()) {
            focusMemoryAnswer();
        }
    });


    // Register Tampermonkey Menu Command to configure Gemini API Key
    if (typeof GM_registerMenuCommand === "function") {
        GM_registerMenuCommand("🔑 配置 Google Gemini API Key (长难句解构优先)", () => {
            const currentKey = getGeminiApiKey();
            const promptMsg = currentKey
                ? `当前 Gemini API Key:\n${currentKey.slice(0, 8)}...${currentKey.slice(-6)}\n\n请输入新的 Gemini API Key（留空确认则清除并恢复使用智谱 AI）:`
                : "请输入你的 Google Gemini API Key\n(配置后长难句分析将优先使用 Gemini 最新旗舰模型，失败自动降级到智谱):";
            const input = prompt(promptMsg, currentKey || "");
            if (input !== null) {
                const trimmed = input.trim();
                if (typeof GM_setValue === "function") {
                    try {
                        GM_setValue("isa_gemini_api_key", trimmed);
                        try {
                            if (trimmed) {
                                window.localStorage && window.localStorage.setItem("isa_gemini_api_key", trimmed);
                            } else {
                                window.localStorage && window.localStorage.removeItem("isa_gemini_api_key");
                            }
                        } catch (e) {}
                        if (trimmed) {
                            alert("✅ Gemini API Key 配置成功！长难句解构已优先启用 Google Gemini 旗舰模型。");
                        } else {
                            alert("ℹ️ Gemini API Key 已清除，长难句解构将使用默认的智谱 AI。");
                        }
                    } catch (err) {
                        alert("❌ 保存失败: " + err.message);
                    }
                }
            }
        });
    }

})();
