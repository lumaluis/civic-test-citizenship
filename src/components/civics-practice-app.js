"use client";

import { startTransition, useDeferredValue, useEffect, useReducer, useState } from "react";

import { questionBank } from "../data/questions";

const STORAGE_KEY = "civics-practice-progress-v1";
const questionMap = new Map(questionBank.map((question) => [question.number, question]));
const sections = ["all", ...new Set(questionBank.map((question) => question.section))];

const baseState = {
  mode: "flashcards",
  scope: "all",
  section: "all",
  category: "all",
  search: "",
  answerVisible: false,
  deck: [],
  cursor: 0,
  sessionComplete: false,
  progress: {},
  sessionStats: emptySessionStats(),
  draftAnswer: "",
  hydrated: false,
};

function emptySessionStats() {
  return {
    scored: 0,
    positive: 0,
    negative: 0,
  };
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

function confidenceScore(progress, questionNumber) {
  const entry = progress[questionNumber];

  if (!entry) {
    return 0;
  }

  return entry.positive - entry.negative;
}

function isWeak(progress, questionNumber) {
  const entry = progress[questionNumber];

  if (!entry) {
    return false;
  }

  return entry.negative > 0 || confidenceScore(progress, questionNumber) < 0;
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

function getSessionLength(mode, scope, poolSize) {
  if (mode === "mock") {
    return Math.min(poolSize, scope === "starred" ? 10 : 20);
  }

  return poolSize;
}

function filterQuestions(state) {
  return questionBank.filter((question) => {
    if (state.scope === "starred" && !question.starred) {
      return false;
    }

    if (state.section !== "all" && question.section !== state.section) {
      return false;
    }

    if (state.category !== "all" && question.category !== state.category) {
      return false;
    }

    if (state.mode === "review" && !isWeak(state.progress, question.number)) {
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

function rebuildSession(state) {
  const pool = filterQuestions(state);
  const sessionLength = getSessionLength(state.mode, state.scope, pool.length);

  return {
    ...state,
    deck: shuffle(pool)
      .slice(0, sessionLength)
      .map((question) => question.number),
    cursor: 0,
    answerVisible: false,
    sessionComplete: false,
    sessionStats: emptySessionStats(),
    draftAnswer: "",
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "hydrateProgress":
      return rebuildSession({
        ...state,
        progress: action.progress,
        hydrated: true,
      });
    case "setMode":
      return rebuildSession({
        ...state,
        mode: action.value,
      });
    case "setScope":
      return rebuildSession({
        ...state,
        scope: action.value,
      });
    case "setSection":
      return rebuildSession({
        ...state,
        section: action.value,
        category: "all",
      });
    case "setCategory":
      return rebuildSession({
        ...state,
        category: action.value,
      });
    case "setSearch":
      if (state.search === action.value) {
        return state;
      }

      return rebuildSession({
        ...state,
        search: action.value,
      });
    case "restart":
      return rebuildSession(state);
    case "setDraftAnswer":
      return {
        ...state,
        draftAnswer: action.value,
      };
    case "reveal":
      return {
        ...state,
        answerVisible: true,
      };
    case "next": {
      if (state.deck.length === 0) {
        return state;
      }

      if (state.cursor >= state.deck.length - 1) {
        return {
          ...state,
          answerVisible: false,
          draftAnswer: "",
          sessionComplete: true,
        };
      }

      return {
        ...state,
        answerVisible: false,
        draftAnswer: "",
        cursor: state.cursor + 1,
      };
    }
    case "score": {
      const questionNumber = state.deck[state.cursor];

      if (questionNumber == null) {
        return state;
      }

      const existing = state.progress[questionNumber] || {
        seen: 0,
        positive: 0,
        negative: 0,
      };

      const nextProgress = {
        ...state.progress,
        [questionNumber]: {
          ...existing,
          seen: existing.seen + 1,
          [action.direction]: existing[action.direction] + 1,
        },
      };

      const nextState = {
        ...state,
        progress: nextProgress,
        sessionStats: {
          ...state.sessionStats,
          scored: state.sessionStats.scored + 1,
          [action.direction]: state.sessionStats[action.direction] + 1,
        },
      };

      return reducer(nextState, { type: "next" });
    }
    default:
      return state;
  }
}

function loadProgress() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

export default function CivicsPracticeApp() {
  const [state, dispatch] = useReducer(reducer, baseState);
  const [searchInput, setSearchInput] = useState("");
  const deferredSearch = useDeferredValue(searchInput);

  useEffect(() => {
    dispatch({
      type: "hydrateProgress",
      progress: loadProgress(),
    });
  }, []);

  useEffect(() => {
    if (!state.hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  }, [state.hydrated, state.progress]);

  useEffect(() => {
    if (!state.hydrated) {
      return;
    }

    startTransition(() => {
      dispatch({
        type: "setSearch",
        value: deferredSearch.trim().toLowerCase(),
      });
    });
  }, [deferredSearch, state.hydrated]);

  const currentQuestion =
    state.sessionComplete || state.deck.length === 0 ? null : questionMap.get(state.deck[state.cursor]) || null;
  const entries = Object.values(state.progress);
  const studied = entries.filter((entry) => entry.seen > 0).length;
  const strong = questionBank.filter((question) => confidenceScore(state.progress, question.number) >= 2).length;
  const weak = questionBank.filter((question) => isWeak(state.progress, question.number)).length;
  const passTarget = state.scope === "starred" ? "6 / 10" : "12 / 20";
  const categories = ["all", ...new Set(
    questionBank
      .filter((question) => state.section === "all" || question.section === state.section)
      .map((question) => question.category),
  )];
  const total = state.deck.length;
  const doneCount = state.sessionComplete ? total : state.cursor;
  const meterPercent = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  let sessionTitle = "Flashcard session";
  let sessionStatus = `${doneCount} / ${total || 0}`;
  let sessionSummary =
    "Use this mode for honest recall practice. Reveal only after you have answered out loud.";

  if (state.mode === "review") {
    sessionTitle = "Weak spot session";
    sessionSummary =
      total === 0
        ? "You do not have any weak questions saved yet. Score a few questions first and they will appear here."
        : "This queue is built from questions you previously marked as difficult.";
  } else if (state.mode === "mock") {
    sessionTitle = "Mock interview";
    sessionStatus =
      state.sessionStats.positive >= (state.scope === "starred" ? 6 : 12) ? "On pace to pass" : "Still building";
    sessionSummary = `Scored ${state.sessionStats.positive} correct and ${state.sessionStats.negative} missed so far. ${
      state.scope === "starred"
        ? "This mock uses the 10-question starred format."
        : "This mock uses the full 20-question format."
    }`;
  }

  const questionProgress = total ? `${Math.min(state.cursor + 1, total)} of ${total}` : "";
  const prompt = currentQuestion
    ? state.mode === "mock"
      ? "Pretend an officer asked this. Say your answer fully before revealing the official answer."
      : "Answer from memory first. Then reveal the accepted answers and score how it felt."
    : state.sessionComplete
      ? "Start another session or switch filters to keep practicing."
      : "Try another section, clear the search box, or study some questions first so your review queue has data.";
  const emptyHeading = state.sessionComplete
    ? state.mode === "mock"
      ? state.sessionStats.positive >= (state.scope === "starred" ? 6 : 12)
        ? `Mock complete. You reached ${state.sessionStats.positive} correct, which clears the target.`
        : `Mock complete. You reached ${state.sessionStats.positive} correct, so you are short of the target.`
      : "Session complete."
    : state.hydrated
      ? "No questions match the current filters yet."
      : "Preparing your first practice session...";

  return (
    <div className="shell">
      <header className="panel hero">
        <div>
          <p className="eyebrow">USCIS Civics Practice</p>
          <h1>Study the way the interview feels.</h1>
          <p className="hero-copy">
            The real civics test is oral, so this app is built around active recall: say your answer out
            loud, reveal the official answers, then score yourself honestly.
          </p>
        </div>
        <div className="hero-cards">
          <div className="hero-card">
            <span className="hero-label">Question bank</span>
            <strong>128 official questions</strong>
          </div>
          <div className="hero-card">
            <span className="hero-label">Focused option</span>
            <strong>20 starred 65/20 questions</strong>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => startTransition(() => dispatch({ type: "restart" }))}
          >
            Start a fresh session
          </button>
        </div>
      </header>

      <section className="panel toolbar">
        <div className="control-group">
          <span className="control-label">Mode</span>
          <div className="segmented">
            {[
              ["flashcards", "Flashcards"],
              ["mock", "Mock interview"],
              ["review", "Weak spots"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`segment${state.mode === value ? " is-active" : ""}`}
                type="button"
                onClick={() => startTransition(() => dispatch({ type: "setMode", value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Scope</span>
          <div className="segmented">
            {[
              ["all", "All 128"],
              ["starred", "65/20 starred"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`segment${state.scope === value ? " is-active" : ""}`}
                type="button"
                onClick={() => startTransition(() => dispatch({ type: "setScope", value }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="control-label">Section</span>
          <select
            value={state.section}
            onChange={(event) =>
              startTransition(() => dispatch({ type: "setSection", value: event.target.value }))
            }
          >
            {sections.map((section) => (
              <option key={section} value={section}>
                {section === "all" ? "All sections" : titleCase(section)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="control-label">Category</span>
          <select
            value={categories.includes(state.category) ? state.category : "all"}
            onChange={(event) =>
              startTransition(() => dispatch({ type: "setCategory", value: event.target.value }))
            }
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === "all" ? "All categories" : category}
              </option>
            ))}
          </select>
        </label>

        <label className="field search-field">
          <span className="control-label">Search</span>
          <input
            type="search"
            value={searchInput}
            placeholder="Question number, topic, or answer text"
            onChange={(event) => {
              const nextValue = event.target.value;

              startTransition(() => {
                setSearchInput(nextValue);
              });
            }}
          />
        </label>
      </section>

      <main className="layout">
        <section className="panel question-panel">
          <div className="question-meta">
            <div className="question-tags">
              <span className="tag tag-strong">{currentQuestion ? `Question ${currentQuestion.number}` : "Question bank"}</span>
              <span className="tag">{currentQuestion ? titleCase(currentQuestion.section) : "Adjust your filters"}</span>
              <span className="tag">{currentQuestion ? currentQuestion.category : state.mode === "review" ? "Weak spots" : "Practice"}</span>
              {currentQuestion?.starred ? <span className="tag tag-gold">65/20</span> : null}
            </div>
            <span className="progress-copy">{currentQuestion ? questionProgress : ""}</span>
          </div>

          {currentQuestion ? (
            <>
              <h2 className="question-text">{currentQuestion.question}</h2>
              <p className="question-prompt">{prompt}</p>

              <label className="response-area">
                <span>Optional: type a rough answer, or just say it out loud first.</span>
                <textarea
                  rows="4"
                  value={state.draftAnswer}
                  placeholder="Example: Congress writes laws..."
                  onChange={(event) =>
                    dispatch({
                      type: "setDraftAnswer",
                      value: event.target.value,
                    })
                  }
                />
              </label>

              {state.answerVisible ? (
                <div className="answer-card">
                  <div className="answer-header">
                    <h3>Accepted answers</h3>
                    <span className="answer-count">
                      {currentQuestion.answers.length} accepted answer
                      {currentQuestion.answers.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="answer-list">
                    {currentQuestion.answers.map((answer) => (
                      <li key={answer}>{answer}</li>
                    ))}
                  </ul>
                  {buildNotice(currentQuestion.answerKind) ? (
                    <p className="answer-notice">{buildNotice(currentQuestion.answerKind)}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="question-actions">
                {!state.answerVisible ? (
                  <button className="primary-button" type="button" onClick={() => dispatch({ type: "reveal" })}>
                    Reveal answer
                  </button>
                ) : null}

                {state.answerVisible ? (
                  <>
                    <button
                      className="success-button"
                      type="button"
                      onClick={() => dispatch({ type: "score", direction: "positive" })}
                    >
                      {state.mode === "mock" ? "Correct" : state.mode === "review" ? "Feeling better" : "I got it"}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => dispatch({ type: "score", direction: "negative" })}
                    >
                      {state.mode === "mock" ? "Incorrect" : "Needs work"}
                    </button>
                  </>
                ) : null}

                <button className="ghost-button" type="button" onClick={() => dispatch({ type: "next" })}>
                  Skip ahead
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="question-text">{emptyHeading}</h2>
              <p className="question-prompt">{prompt}</p>
              {!state.hydrated ? (
                <p className="loading-copy">Loading the official question bank and your saved progress.</p>
              ) : null}
            </>
          )}
        </section>

        <aside className="panel sidebar">
          <div className="stats-grid">
            <article className="stat-card">
              <span className="stat-label">Studied</span>
              <strong>{studied}</strong>
              <p>Questions you have actively scored.</p>
            </article>
            <article className="stat-card">
              <span className="stat-label">Strong</span>
              <strong>{strong}</strong>
              <p>Questions trending toward confident recall.</p>
            </article>
            <article className="stat-card">
              <span className="stat-label">Needs review</span>
              <strong>{weak}</strong>
              <p>Your weak queue for focused practice.</p>
            </article>
            <article className="stat-card">
              <span className="stat-label">Pass target</span>
              <strong>{passTarget}</strong>
              <p>The threshold for the current mock style.</p>
            </article>
          </div>

          <section className="session-panel">
            <div className="session-header">
              <h3>{sessionTitle}</h3>
              <span className="session-chip">{sessionStatus}</span>
            </div>
            <p className="session-summary">{sessionSummary}</p>
            <div className="meter" aria-hidden="true">
              <div className="meter-fill" style={{ width: `${meterPercent}%` }} />
            </div>
          </section>

          <section className="tips-panel">
            <h3>Best way to use it</h3>
            <p>Say the answer before you reveal it. Recognition is easier than recall.</p>
            <p>Use mock interview mode once you feel warm, then return to weak spots.</p>
            <p>
              Time-sensitive questions are labeled so you remember to verify names and state-specific answers
              before your interview.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}
