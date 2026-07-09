(function () {
  const STORAGE_KEY = "civics-practice-progress-v1";
  const QUESTION_BANK = window.CIVICS_QUESTION_BANK || [];
  const QUESTION_MAP = new Map(QUESTION_BANK.map((question) => [question.number, question]));

  const elements = {
    modeButtons: document.querySelectorAll("[data-mode]"),
    scopeButtons: document.querySelectorAll("[data-scope]"),
    restartSession: document.getElementById("restartSession"),
    sectionFilter: document.getElementById("sectionFilter"),
    categoryFilter: document.getElementById("categoryFilter"),
    searchInput: document.getElementById("searchInput"),
    questionNumber: document.getElementById("questionNumber"),
    questionSection: document.getElementById("questionSection"),
    questionCategory: document.getElementById("questionCategory"),
    questionStar: document.getElementById("questionStar"),
    questionProgress: document.getElementById("questionProgress"),
    questionText: document.getElementById("questionText"),
    questionPrompt: document.getElementById("questionPrompt"),
    draftAnswer: document.getElementById("draftAnswer"),
    answerCard: document.getElementById("answerCard"),
    answerList: document.getElementById("answerList"),
    answerCount: document.getElementById("answerCount"),
    answerNotice: document.getElementById("answerNotice"),
    revealAnswer: document.getElementById("revealAnswer"),
    positiveMark: document.getElementById("positiveMark"),
    negativeMark: document.getElementById("negativeMark"),
    nextQuestion: document.getElementById("nextQuestion"),
    studiedCount: document.getElementById("studiedCount"),
    strongCount: document.getElementById("strongCount"),
    weakCount: document.getElementById("weakCount"),
    passTarget: document.getElementById("passTarget"),
    sessionTitle: document.getElementById("sessionTitle"),
    sessionStatus: document.getElementById("sessionStatus"),
    sessionSummary: document.getElementById("sessionSummary"),
    meterFill: document.getElementById("meterFill"),
  };

  const sections = ["all", ...new Set(QUESTION_BANK.map((question) => question.section))];

  const state = {
    mode: "flashcards",
    scope: "all",
    section: "all",
    category: "all",
    search: "",
    answerVisible: false,
    deck: [],
    cursor: 0,
    sessionComplete: false,
    progress: loadProgress(),
    sessionStats: emptySessionStats(),
  };

  initialize();

  function initialize() {
    hydrateSectionOptions();
    hydrateCategoryOptions();
    bindEvents();
    startSession();
  }

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (_error) {
      return {};
    }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  }

  function emptySessionStats() {
    return {
      scored: 0,
      positive: 0,
      negative: 0,
    };
  }

  function hydrateSectionOptions() {
    elements.sectionFilter.innerHTML = "";
    sections.forEach((section) => {
      const option = document.createElement("option");
      option.value = section;
      option.textContent = section === "all" ? "All sections" : titleCase(section);
      elements.sectionFilter.appendChild(option);
    });
    elements.sectionFilter.value = state.section;
  }

  function hydrateCategoryOptions() {
    const categories = QUESTION_BANK.filter((question) => {
      return state.section === "all" || question.section === state.section;
    }).map((question) => question.category);
    const uniqueCategories = ["all", ...new Set(categories)];

    elements.categoryFilter.innerHTML = "";
    uniqueCategories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category === "all" ? "All categories" : category;
      elements.categoryFilter.appendChild(option);
    });

    if (!uniqueCategories.includes(state.category)) {
      state.category = "all";
    }

    elements.categoryFilter.value = state.category;
  }

  function bindEvents() {
    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", function () {
        state.mode = button.dataset.mode;
        setActive(elements.modeButtons, "mode", state.mode);
        startSession();
      });
    });

    elements.scopeButtons.forEach((button) => {
      button.addEventListener("click", function () {
        state.scope = button.dataset.scope;
        setActive(elements.scopeButtons, "scope", state.scope);
        startSession();
      });
    });

    elements.sectionFilter.addEventListener("change", function () {
      state.section = elements.sectionFilter.value;
      hydrateCategoryOptions();
      startSession();
    });

    elements.categoryFilter.addEventListener("change", function () {
      state.category = elements.categoryFilter.value;
      startSession();
    });

    elements.searchInput.addEventListener("input", function () {
      state.search = elements.searchInput.value.trim().toLowerCase();
      startSession();
    });

    elements.restartSession.addEventListener("click", function () {
      startSession();
    });

    elements.revealAnswer.addEventListener("click", function () {
      state.answerVisible = true;
      render();
    });

    elements.nextQuestion.addEventListener("click", function () {
      advanceQuestion();
    });

    elements.positiveMark.addEventListener("click", function () {
      scoreCurrentQuestion("positive");
    });

    elements.negativeMark.addEventListener("click", function () {
      scoreCurrentQuestion("negative");
    });
  }

  function setActive(nodes, key, value) {
    nodes.forEach((node) => {
      node.classList.toggle("is-active", node.dataset[key] === value);
    });
  }

  function filteredQuestions() {
    return QUESTION_BANK.filter((question) => {
      if (state.scope === "starred" && !question.starred) {
        return false;
      }

      if (state.section !== "all" && question.section !== state.section) {
        return false;
      }

      if (state.category !== "all" && question.category !== state.category) {
        return false;
      }

      if (state.mode === "review" && !isWeak(question.number)) {
        return false;
      }

      if (!state.search) {
        return true;
      }

      const haystack = [
        String(question.number),
        question.question,
        question.section,
        question.category,
        ...question.answers,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(state.search);
    });
  }

  function startSession() {
    const pool = filteredQuestions();
    const sessionLength = getSessionLength(pool.length);

    state.deck = shuffle(pool).slice(0, sessionLength).map((question) => question.number);
    state.cursor = 0;
    state.answerVisible = false;
    state.sessionComplete = false;
    state.sessionStats = emptySessionStats();
    elements.draftAnswer.value = "";
    render();
  }

  function getSessionLength(poolSize) {
    if (state.mode === "mock") {
      const target = state.scope === "starred" ? 10 : 20;
      return Math.min(poolSize, target);
    }

    return poolSize;
  }

  function currentQuestion() {
    if (state.sessionComplete || state.deck.length === 0) {
      return null;
    }

    return QUESTION_MAP.get(state.deck[state.cursor]) || null;
  }

  function scoreCurrentQuestion(direction) {
    const question = currentQuestion();
    if (!question) {
      return;
    }

    const existing = state.progress[question.number] || {
      seen: 0,
      positive: 0,
      negative: 0,
    };

    existing.seen += 1;
    existing[direction] += 1;
    state.progress[question.number] = existing;

    state.sessionStats.scored += 1;
    state.sessionStats[direction] += 1;

    saveProgress();
    advanceQuestion();
  }

  function advanceQuestion() {
    if (state.deck.length === 0) {
      render();
      return;
    }

    state.answerVisible = false;
    elements.draftAnswer.value = "";

    if (state.cursor >= state.deck.length - 1) {
      state.sessionComplete = true;
    } else {
      state.cursor += 1;
    }

    render();
  }

  function render() {
    renderStats();
    renderSessionSummary();
    renderQuestion();
  }

  function renderStats() {
    const entries = Object.values(state.progress);
    const studied = entries.filter((entry) => entry.seen > 0).length;
    const strong = QUESTION_BANK.filter((question) => confidenceScore(question.number) >= 2).length;
    const weak = QUESTION_BANK.filter((question) => isWeak(question.number)).length;
    const target = state.scope === "starred" ? "6 / 10" : "12 / 20";

    elements.studiedCount.textContent = String(studied);
    elements.strongCount.textContent = String(strong);
    elements.weakCount.textContent = String(weak);
    elements.passTarget.textContent = target;
  }

  function renderSessionSummary() {
    const total = state.deck.length;
    const doneCount = state.sessionComplete ? total : state.cursor;
    const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

    elements.meterFill.style.width = `${percent}%`;

    if (state.mode === "flashcards") {
      elements.sessionTitle.textContent = "Flashcard session";
      elements.sessionStatus.textContent = `${doneCount} / ${total || 0}`;
      elements.sessionSummary.textContent =
        "Use this mode for honest recall practice. Reveal only after you have answered out loud.";
      return;
    }

    if (state.mode === "review") {
      elements.sessionTitle.textContent = "Weak spot session";
      elements.sessionStatus.textContent = `${doneCount} / ${total || 0}`;
      elements.sessionSummary.textContent =
        total === 0
          ? "You do not have any weak questions saved yet. Score a few questions first and they will appear here."
          : "This queue is built from questions you previously marked as difficult.";
      return;
    }

    const threshold = state.scope === "starred" ? 6 : 12;
    const passLabel = state.sessionStats.positive >= threshold ? "On pace to pass" : "Still building";
    elements.sessionTitle.textContent = "Mock interview";
    elements.sessionStatus.textContent = passLabel;
    elements.sessionSummary.textContent = `Scored ${state.sessionStats.positive} correct and ${state.sessionStats.negative} missed so far. ${
      state.scope === "starred"
        ? "This mock uses the 10-question starred format."
        : "This mock uses the full 20-question format."
    }`;
  }

  function renderQuestion() {
    const question = currentQuestion();

    if (!question) {
      renderEmptyState();
      return;
    }

    const total = state.deck.length;
    const position = Math.min(state.cursor + 1, total);
    const badgeSection = titleCase(question.section);
    const prompt =
      state.mode === "mock"
        ? "Pretend an officer asked this. Say your answer fully before revealing the official answer."
        : "Answer from memory first. Then reveal the accepted answers and score how it felt.";

    elements.questionNumber.textContent = `Question ${question.number}`;
    elements.questionSection.textContent = badgeSection;
    elements.questionCategory.textContent = question.category;
    elements.questionStar.hidden = !question.starred;
    elements.questionProgress.textContent = total ? `${position} of ${total}` : "";
    elements.questionText.textContent = question.question;
    elements.questionPrompt.textContent = prompt;

    renderAnswerCard(question);
    renderActionLabels();
  }

  function renderAnswerCard(question) {
    elements.answerCard.hidden = !state.answerVisible;
    elements.answerList.innerHTML = "";
    elements.answerCount.textContent = `${question.answers.length} accepted answer${question.answers.length === 1 ? "" : "s"}`;

    question.answers.forEach((answer) => {
      const item = document.createElement("li");
      item.textContent = answer;
      elements.answerList.appendChild(item);
    });

    const notice = buildNotice(question.answerKind);
    elements.answerNotice.hidden = !notice;
    elements.answerNotice.textContent = notice;
  }

  function renderActionLabels() {
    const isMock = state.mode === "mock";
    const isReview = state.mode === "review";

    elements.revealAnswer.hidden = state.answerVisible;
    elements.positiveMark.hidden = !state.answerVisible;
    elements.negativeMark.hidden = !state.answerVisible;
    elements.nextQuestion.hidden = false;

    if (isMock) {
      elements.positiveMark.textContent = "Correct";
      elements.negativeMark.textContent = "Incorrect";
      return;
    }

    elements.positiveMark.textContent = isReview ? "Feeling better" : "I got it";
    elements.negativeMark.textContent = "Needs work";
  }

  function renderEmptyState() {
    elements.questionNumber.textContent = "No matching questions";
    elements.questionSection.textContent = "Adjust your filters";
    elements.questionCategory.textContent = state.mode === "review" ? "Weak spots" : "Question bank";
    elements.questionStar.hidden = true;
    elements.questionProgress.textContent = "";
    elements.questionText.textContent = state.sessionComplete
      ? completionMessage()
      : "No questions match the current filters yet.";
    elements.questionPrompt.textContent = state.sessionComplete
      ? "Start another session or switch filters to keep practicing."
      : "Try another section, clear the search box, or study some questions first so your review queue has data.";
    elements.answerCard.hidden = true;
    elements.revealAnswer.hidden = true;
    elements.positiveMark.hidden = true;
    elements.negativeMark.hidden = true;
    elements.nextQuestion.hidden = true;
  }

  function completionMessage() {
    if (state.mode !== "mock") {
      return "Session complete.";
    }

    const target = state.scope === "starred" ? 6 : 12;
    const passed = state.sessionStats.positive >= target;
    return passed
      ? `Mock complete. You reached ${state.sessionStats.positive} correct, which clears the target of ${target}.`
      : `Mock complete. You reached ${state.sessionStats.positive} correct, so you are short of the target of ${target}.`;
  }

  function confidenceScore(questionNumber) {
    const entry = state.progress[questionNumber];
    if (!entry) {
      return 0;
    }

    return entry.positive - entry.negative;
  }

  function isWeak(questionNumber) {
    const entry = state.progress[questionNumber];
    if (!entry) {
      return false;
    }

    return entry.negative > 0 || confidenceScore(questionNumber) < 0;
  }

  function buildNotice(answerKind) {
    if (answerKind === "officials-update") {
      return "This answer changes with current officeholders. Check the latest USCIS civics updates before your interview.";
    }

    if (answerKind === "varies") {
      return "This answer depends on your state, district, or personal situation. Practice your own up-to-date answer.";
    }

    return "";
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function titleCase(value) {
    return value
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
})();
