/* Daisy's Course - offline-first PWA course wrapper.
   All data lives in localStorage on this device only. No network calls except
   the optional course-data.json refresh (best-effort, cached by the service worker). */

const STORAGE_KEY = "daisy_course_progress_v1";
const PIN_KEY = "daisy_course_pin_v1";
const APP_VERSION = "v7"; // bump alongside CACHE_NAME in service-worker.js so the two always match

let COURSE = null;   // loaded course-data.json
let state = loadState();
if (!state.boxCounters) state.boxCounters = { animal: 0, joke: 0, funfact: 0 };
if (state.lastExportAt === undefined) state.lastExportAt = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { completedLessons: {}, currentLessonId: null, currentAttempt: null,
           boxCounters: { animal: 0, joke: 0, funfact: 0 }, lastExportAt: null };
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getPin() {
  return localStorage.getItem(PIN_KEY);
}
function setPin(p) {
  localStorage.setItem(PIN_KEY, p);
}

function show(id) {
  document.querySelectorAll("#app > section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

function nextLesson() {
  if (!COURSE) return null;
  return COURSE.lessons.find(l => !state.completedLessons[l.id]) || null;
}

function subjectBadgeClass(subject) {
  return subject === "Social Studies" ? "ss" : "sci";
}

function standardGroup(lesson) {
  return COURSE.lessons.filter(l => l.subject === lesson.subject && l.standard === lesson.standard);
}

function isFirstInStandard(lesson) {
  const group = standardGroup(lesson);
  return group.length > 0 && group[0].id === lesson.id;
}

function standardInfo(lesson) {
  if (!COURSE.standards) return null;
  return COURSE.standards[`${lesson.subject}|${lesson.standard}`] || null;
}

/* ---------------- WELCOME ---------------- */
function renderWelcome() {
  const lesson = nextLesson();
  const title = document.getElementById("welcome-title");
  const body = document.getElementById("welcome-body");
  const startBtn = document.getElementById("btn-start-lesson");
  const doneMsg = document.getElementById("all-done-msg");

  const name = COURSE.studentName || "there";
  if (lesson) {
    title.textContent = `Welcome, ${name}!`;
    body.textContent = `Today we're covering some ${lesson.subject} content. Ready when you are.`;
    startBtn.classList.remove("hidden");
    doneMsg.classList.add("hidden");
    startBtn.onclick = () => startLesson(lesson);
  } else {
    title.textContent = `Great work, ${name}!`;
    body.textContent = "";
    startBtn.classList.add("hidden");
    doneMsg.classList.remove("hidden");
  }
  show("screen-welcome");
}

/* ---------------- STANDARD INTRO ---------------- */
function startLesson(lesson) {
  if (isFirstInStandard(lesson) && standardInfo(lesson)) {
    renderStandardIntro(lesson);
  } else {
    beginLesson(lesson.id);
  }
}

function renderStandardIntro(lesson) {
  const info = standardInfo(lesson);
  const group = standardGroup(lesson);

  document.getElementById("intro-badge").textContent = lesson.subject;
  document.getElementById("intro-badge").className = "badge " + subjectBadgeClass(lesson.subject);
  document.getElementById("intro-standard").textContent = `Standard ${lesson.standard}`;
  document.getElementById("intro-title").textContent = info.title;
  document.getElementById("intro-goal").textContent = info.goal;
  document.getElementById("intro-why").textContent = info.why;

  const list = document.getElementById("intro-upcoming-list");
  list.innerHTML = "";
  group.forEach(l => {
    const li = document.createElement("li");
    li.textContent = l.title;
    list.appendChild(li);
  });

  document.getElementById("btn-start-topic").onclick = () => beginLesson(lesson.id);
  show("screen-standard-intro");
}

/* ---------------- LESSON / VIDEO ---------------- */
function beginLesson(lessonId) {
  const lesson = COURSE.lessons.find(l => l.id === lessonId);
  state.currentLessonId = lessonId;
  state.currentAttempt = { answers: new Array(lesson.questions.length).fill(null), checked: false };
  saveState();
  renderLessonScreen(lesson);
}

function renderLessonScreen(lesson) {
  document.getElementById("lesson-badge").textContent = lesson.subject;
  document.getElementById("lesson-badge").className = "badge " + subjectBadgeClass(lesson.subject);
  document.getElementById("lesson-standard").textContent = `Standard ${lesson.standard}`;
  document.getElementById("lesson-title").textContent = lesson.title;
  document.getElementById("lesson-channel-dur").textContent = `${lesson.channel} · ${lesson.duration}`;
  document.getElementById("btn-open-youtube").href = `youtube://watch?v=${lesson.youtubeId}`;
  document.getElementById("btn-open-youtube").onclick = (e) => {
    // Fallback to the web URL if the app scheme doesn't resolve (e.g. desktop testing)
    setTimeout(() => { window.location.href = `https://www.youtube.com/watch?v=${lesson.youtubeId}`; }, 800);
  };
  updateProgressBar("progress-fill-1", lesson.id);
  show("screen-lesson");
}

document.getElementById("btn-watched").onclick = () => {
  const lesson = COURSE.lessons.find(l => l.id === state.currentLessonId);
  renderQuizScreen(lesson);
};

/* ---------------- QUIZ ---------------- */
function renderQuizScreen(lesson) {
  const container = document.getElementById("quiz-questions");
  container.innerHTML = "";
  const attempt = state.currentAttempt;

  lesson.questions.forEach((q, qi) => {
    const block = document.createElement("div");
    block.className = "question-block";
    const p = document.createElement("p");
    p.className = "q-text";
    p.textContent = `${qi + 1}. ${q.q}`;
    block.appendChild(p);

    q.choices.forEach((choice, ci) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.textContent = choice;
      btn.dataset.qi = qi;
      btn.dataset.ci = ci;
      btn.onclick = () => {
        if (attempt.checked) return;
        attempt.answers[qi] = ci;
        [...block.querySelectorAll(".choice")].forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        saveState();
        updateSubmitEnabled(lesson);
      };
      block.appendChild(btn);
    });

    const feedback = document.createElement("p");
    feedback.className = "feedback";
    feedback.id = `feedback-${qi}`;
    block.appendChild(feedback);

    container.appendChild(block);
  });

  document.getElementById("btn-submit-quiz").classList.remove("hidden");
  document.getElementById("btn-retry-quiz").classList.add("hidden");
  document.getElementById("btn-continue-to-notebook").classList.add("hidden");
  updateSubmitEnabled(lesson);
  updateProgressBar("progress-fill-2", lesson.id);
  show("screen-quiz");
}

function updateSubmitEnabled(lesson) {
  const attempt = state.currentAttempt;
  const allAnswered = attempt.answers.every(a => a !== null);
  document.getElementById("btn-submit-quiz").disabled = !allAnswered;
}

document.getElementById("btn-submit-quiz").onclick = () => {
  const lesson = COURSE.lessons.find(l => l.id === state.currentLessonId);
  const attempt = state.currentAttempt;
  attempt.checked = true;
  let allCorrect = true;

  lesson.questions.forEach((q, qi) => {
    const chosen = attempt.answers[qi];
    const block = document.querySelectorAll(".question-block")[qi];
    const buttons = block.querySelectorAll(".choice");
    const isCorrect = chosen === q.correct;
    buttons.forEach((b, ci) => {
      b.disabled = true;
      // Only mark the choice the student actually picked - never reveal
      // which one was correct if they got it wrong.
      if (ci === chosen) b.classList.add(isCorrect ? "correct" : "incorrect");
    });
    const fb = document.getElementById(`feedback-${qi}`);
    if (isCorrect) {
      fb.textContent = "Correct!";
      fb.className = "feedback good";
    } else {
      fb.textContent = "Not quite - try again.";
      fb.className = "feedback bad";
      allCorrect = false;
    }
  });

  saveState();
  document.getElementById("btn-submit-quiz").classList.add("hidden");

  if (allCorrect) {
    document.getElementById("btn-continue-to-notebook").classList.remove("hidden");
  } else {
    document.getElementById("btn-retry-quiz").classList.remove("hidden");
  }
};

document.getElementById("btn-retry-quiz").onclick = () => {
  const lesson = COURSE.lessons.find(l => l.id === state.currentLessonId);
  state.currentAttempt = { answers: new Array(lesson.questions.length).fill(null), checked: false };
  saveState();
  renderQuizScreen(lesson);
};

document.getElementById("btn-continue-to-notebook").onclick = () => {
  const lesson = COURSE.lessons.find(l => l.id === state.currentLessonId);
  renderNotebookScreen(lesson);
};

/* ---------------- NOTEBOOK ---------------- */
function renderNotebookScreen(lesson) {
  document.getElementById("notebook-prompt").textContent = lesson.notebookPrompt;
  document.getElementById("notebook-text").value = "";
  show("screen-notebook");
}

document.getElementById("btn-save-notebook").onclick = () => {
  const lesson = COURSE.lessons.find(l => l.id === state.currentLessonId);
  const text = document.getElementById("notebook-text").value.trim();
  const attempt = state.currentAttempt;
  const score = attempt.answers.filter((a, i) => a === lesson.questions[i].correct).length;

  state.completedLessons[lesson.id] = {
    completedAt: new Date().toISOString(),
    score: score,
    total: lesson.questions.length,
    notebookText: text
  };
  state.currentLessonId = null;
  state.currentAttempt = null;
  saveState();

  renderBoxesScreen(lesson, score);
};

/* ---------------- SURPRISE BOX ---------------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const BOX_CATEGORIES = ["animal", "joke", "funfact"];
const BOX_CAT_LABEL = { animal: "Animal Fact", joke: "Dad Joke", funfact: "Fun Fact" };

function renderBoxesScreen(lesson, score) {
  const assignment = shuffle(BOX_CATEGORIES);
  const boxes = [0, 1, 2].map(i => document.getElementById(`box-${i}`));

  boxes.forEach((btn, i) => {
    btn.dataset.cat = assignment[i];
    btn.disabled = false;
    btn.classList.remove("picked", "faded");
    btn.querySelector(".box-mark").textContent = "?";
  });
  document.getElementById("box-reveal").classList.add("hidden");

  boxes.forEach(btn => {
    btn.onclick = () => pickBox(btn, boxes, lesson, score);
  });

  show("screen-boxes");
}

function pickBox(chosenBtn, allBoxes, lesson, score) {
  // Only one pick allowed per lesson - lock out the other boxes immediately.
  allBoxes.forEach(b => {
    b.disabled = true;
    if (b !== chosenBtn) b.classList.add("faded");
  });
  chosenBtn.classList.add("picked");

  const cat = chosenBtn.dataset.cat;
  const pool = COURSE.surpriseBoxes[cat];
  const idx = state.boxCounters[cat] % pool.length;
  const item = pool[idx];
  state.boxCounters[cat] += 1;
  saveState();

  document.getElementById("box-cat-tag").textContent = BOX_CAT_LABEL[cat];
  document.getElementById("box-cat-tag").className = "box-cat-tag " + cat;
  document.getElementById("box-reveal-emoji").textContent = item.emoji || "";
  document.getElementById("box-reveal-text").textContent = item.text;

  setTimeout(() => {
    document.getElementById("box-reveal").classList.remove("hidden");
  }, 250);

  document.getElementById("btn-box-continue").onclick = () => renderCompleteScreen(lesson, score);
}

function renderCompleteScreen(lesson, score) {
  document.getElementById("complete-score").textContent = `You got ${score} out of ${lesson.questions.length} on the first pass through the quiz.`;
  show("screen-complete");
}

document.getElementById("btn-back-to-welcome").onclick = renderWelcome;

/* ---------------- PARENT PIN + DASHBOARD ---------------- */
let pinEntry = "";
let pinSetupMode = false;

function renderPinScreen() {
  pinEntry = "";
  pinSetupMode = !getPin();
  document.getElementById("pin-msg").textContent = pinSetupMode ? "No PIN set yet - choose a 4-digit PIN." : " ";
  updatePinDots();
  show("screen-pin");
}

function updatePinDots() {
  const dots = document.querySelectorAll("#pin-dots span");
  dots.forEach((d, i) => d.classList.toggle("filled", i < pinEntry.length));
}

document.getElementById("pin-pad").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const k = btn.dataset.k;
  if (k === "del") {
    pinEntry = pinEntry.slice(0, -1);
    updatePinDots();
    return;
  }
  if (k === "setup") {
    pinSetupMode = true;
    pinEntry = "";
    document.getElementById("pin-msg").textContent = "Choose a new 4-digit PIN.";
    updatePinDots();
    return;
  }
  if (pinEntry.length >= 4) return;
  pinEntry += k;
  updatePinDots();

  if (pinEntry.length === 4) {
    if (pinSetupMode) {
      setPin(pinEntry);
      pinSetupMode = false;
      document.getElementById("pin-msg").textContent = "PIN saved. Enter it to continue.";
      pinEntry = "";
      updatePinDots();
    } else if (pinEntry === getPin()) {
      renderParentDashboard();
    } else {
      document.getElementById("pin-msg").textContent = "Wrong PIN, try again.";
      setTimeout(() => { pinEntry = ""; updatePinDots(); }, 400);
    }
  }
});

/* ---------------- EXPORT (for parent review) ---------------- */
function buildExportText(sinceIso) {
  const sinceDate = sinceIso ? new Date(sinceIso) : null;
  const lines = [];
  let count = 0;
  lines.push(`Daisy's Learning Log — exported ${new Date().toLocaleString()}`);
  if (sinceDate) lines.push(`(entries completed since ${sinceDate.toLocaleString()})`);
  lines.push("");

  COURSE.lessons.forEach(lesson => {
    const rec = state.completedLessons[lesson.id];
    if (!rec) return;
    if (sinceDate && new Date(rec.completedAt) <= sinceDate) return;
    count++;
    lines.push(`[${lesson.subject} · Standard ${lesson.standard}] "${lesson.title}"`);
    lines.push(`Prompt: ${lesson.notebookPrompt}`);
    lines.push(`Daisy's answer: ${rec.notebookText || "(no answer recorded)"}`);
    lines.push(`Quiz score: ${rec.score}/${rec.total}`);
    lines.push(`Completed: ${new Date(rec.completedAt).toLocaleDateString()}`);
    lines.push("");
  });

  return { text: lines.join("\n").trim(), count };
}

function showExportMessage(msg) {
  const el = document.getElementById("export-confirm");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showExportMessage._t);
  showExportMessage._t = setTimeout(() => el.classList.add("hidden"), 3000);
}

function updateExportStatus() {
  const el = document.getElementById("export-status");
  const exportLine = state.lastExportAt
    ? `Last exported: ${new Date(state.lastExportAt).toLocaleString()}`
    : "You haven't exported yet.";
  el.textContent = exportLine;
  const versionEl = document.getElementById("app-version");
  if (versionEl) versionEl.textContent = `App version: ${APP_VERSION}`;
}

async function doExport(sinceIso, advanceCursor) {
  const { text, count } = buildExportText(sinceIso);
  if (count === 0) {
    showExportMessage(advanceCursor ? "No new entries since your last export." : "No entries completed yet.");
    return;
  }

  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch (e) { /* clipboard API unavailable or blocked - share sheet below still gives a path out */ }

  let shared = false;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Daisy's Learning Log", text: text });
      shared = true;
    } catch (e) { /* user cancelled the share sheet, or it's unsupported here - not an error */ }
  }

  if (copied && shared) showExportMessage(`Copied ${count} ${count === 1 ? "entry" : "entries"} & opened share sheet.`);
  else if (shared) showExportMessage(`Shared ${count} ${count === 1 ? "entry" : "entries"}.`);
  else if (copied) showExportMessage(`Copied ${count} ${count === 1 ? "entry" : "entries"} to clipboard!`);
  else showExportMessage("Couldn't export automatically - try again from a supported browser.");

  if (advanceCursor) {
    state.lastExportAt = new Date().toISOString();
    saveState();
    updateExportStatus();
  }
}

document.getElementById("btn-export-new").onclick = () => doExport(state.lastExportAt, true);
document.getElementById("btn-export-all").onclick = () => doExport(null, false);

function renderParentDashboard() {
  const total = COURSE.lessons.length;
  const done = Object.keys(state.completedLessons).length;
  document.getElementById("parent-summary").textContent = `${done} of ${total} lessons completed.`;
  updateExportStatus();

  const log = document.getElementById("parent-log");
  log.innerHTML = "";
  COURSE.lessons.forEach(lesson => {
    const rec = state.completedLessons[lesson.id];
    const entry = document.createElement("div");
    entry.className = "log-entry";
    const meta = document.createElement("div");
    meta.className = "lmeta";
    meta.textContent = `${lesson.subject} · Standard ${lesson.standard} · ${lesson.title}`;
    entry.appendChild(meta);

    if (rec) {
      const score = document.createElement("div");
      score.className = "lscore";
      score.textContent = `Score: ${rec.score}/${rec.total} · Completed ${new Date(rec.completedAt).toLocaleDateString()}`;
      entry.appendChild(score);
      if (rec.notebookText) {
        const note = document.createElement("div");
        note.className = "lnote";
        note.textContent = rec.notebookText;
        entry.appendChild(note);
      }
    } else {
      const notdone = document.createElement("div");
      notdone.className = "muted";
      notdone.textContent = "Not completed yet.";
      entry.appendChild(notdone);
    }
    log.appendChild(entry);
  });

  show("screen-parent");
}

document.getElementById("btn-reset-progress").onclick = () => {
  if (confirm("Reset ALL of Daisy's progress? This can't be undone.")) {
    state = { completedLessons: {}, currentLessonId: null, currentAttempt: null,
              boxCounters: { animal: 0, joke: 0, funfact: 0 }, lastExportAt: null };
    saveState();
    renderParentDashboard();
  }
};

/* ---------------- NAV ---------------- */
document.getElementById("btn-open-parent").onclick = renderPinScreen;
document.getElementById("btn-back-0").onclick = renderWelcome;
document.getElementById("btn-back-1").onclick = renderWelcome;
document.getElementById("btn-back-2").onclick = () => {
  const lesson = COURSE.lessons.find(l => l.id === state.currentLessonId);
  renderLessonScreen(lesson);
};
document.getElementById("btn-back-3").onclick = () => {
  const lesson = COURSE.lessons.find(l => l.id === state.currentLessonId);
  renderQuizScreen(lesson);
};
document.getElementById("btn-back-4").onclick = renderWelcome;
document.getElementById("btn-back-5").onclick = renderWelcome;

function updateProgressBar(elId, currentLessonId) {
  const idx = COURSE.lessons.findIndex(l => l.id === currentLessonId);
  const pct = Math.round(((idx) / COURSE.lessons.length) * 100);
  document.getElementById(elId).style.width = pct + "%";
}

/* ---------------- BOOT ---------------- */
async function boot() {
  try {
    const res = await fetch("course-data.json", { cache: "no-store" });
    COURSE = await res.json();
    localStorage.setItem("daisy_course_cache_v1", JSON.stringify(COURSE));
  } catch (e) {
    // Offline: fall back to last-cached course data
    const cached = localStorage.getItem("daisy_course_cache_v1");
    if (cached) COURSE = JSON.parse(cached);
  }

  if (!COURSE) {
    document.getElementById("welcome-body").textContent =
      "Couldn't load the course yet. Connect to wifi once so it can download, then this works offline from then on.";
    return;
  }

  // Resume mid-lesson if the app was closed partway through
  if (state.currentLessonId && state.currentAttempt) {
    const lesson = COURSE.lessons.find(l => l.id === state.currentLessonId);
    if (lesson) {
      if (state.currentAttempt.checked) renderNotebookScreen(lesson);
      else renderQuizScreen(lesson);
      return;
    }
  }
  renderWelcome();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

boot();
