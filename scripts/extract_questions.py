#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


TOP_LEVEL_SECTIONS = {
    "AMERICAN GOVERNMENT",
    "AMERICAN HISTORY",
    "SYMBOLS AND HOLIDAYS",
}

IGNORED_LINES = {
    "uscis.gov/citizenship",
    "M-1778 (09/25)",
    "128 Civics Questions and Answers (2025 version)",
}


def normalize_text(value: str) -> str:
    value = (
        value.replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u00a0", " ")
    )
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"(\d+)\s+(st|nd|rd|th)\b", r"\1\2", value)
    return value


def parse_pdf(pdf_path: Path) -> list[dict[str, object]]:
    reader = PdfReader(str(pdf_path))
    questions: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    current_section = ""
    current_category = ""
    started = False

    def finish_current() -> None:
        nonlocal current
        if not current:
            return
        current["question"] = normalize_text(str(current["question"]))
        current["answers"] = [normalize_text(answer) for answer in current["answers"]]  # type: ignore[index]
        answers = current["answers"]  # type: ignore[assignment]
        current["answerKind"] = (
            "officials-update"
            if any("testupdates" in answer for answer in answers)
            else "varies"
            if any("Answers will vary." in answer for answer in answers)
            else "standard"
        )
        questions.append(current)
        current = None

    for page in reader.pages:
        text = page.extract_text() or ""
        for raw_line in text.splitlines():
            line = normalize_text(raw_line)
            if not line or re.fullmatch(r"\d+ of \d+", line) or line in IGNORED_LINES:
                continue

            if not started:
                if line == "AMERICAN GOVERNMENT":
                    started = True
                    current_section = line
                continue

            if line in TOP_LEVEL_SECTIONS:
                finish_current()
                current_section = line
                current_category = ""
                continue

            if re.fullmatch(r"[A-C]:\s+.+", line):
                finish_current()
                current_category = line.split(":", 1)[1].strip()
                continue

            question_match = re.match(r"^(\d+)\.\s*(.+)$", line)
            if question_match:
                finish_current()
                question_number = int(question_match.group(1))
                question_text = question_match.group(2).strip()
                starred = False
                if question_text.endswith("*"):
                    starred = True
                    question_text = question_text[:-1].rstrip()
                current = {
                    "number": question_number,
                    "question": question_text,
                    "answers": [],
                    "starred": starred,
                    "section": current_section,
                    "category": current_category,
                }
                continue

            if line == "*":
                if current is not None:
                    current["starred"] = True
                continue

            if line.startswith("• "):
                if current is None:
                    continue
                current["answers"].append(line[2:].strip())  # type: ignore[index]
                continue

            if current is None:
                continue

            if current["answers"]:  # type: ignore[index]
                answers = current["answers"]  # type: ignore[assignment]
                answers[-1] = f"{answers[-1]} {line}"
            else:
                current["question"] = f"{current['question']} {line}"

    finish_current()
    return questions


def write_js(questions: list[dict[str, object]], output_path: Path) -> None:
    payload = json.dumps(questions, indent=2, ensure_ascii=True)
    output_path.write_text(
        "window.CIVICS_QUESTION_BANK = " + payload + ";\n",
        encoding="utf-8",
    )


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: extract_questions.py input.pdf output.js", file=sys.stderr)
        return 1

    pdf_path = Path(sys.argv[1]).expanduser().resolve()
    output_path = Path(sys.argv[2]).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    questions = parse_pdf(pdf_path)
    if len(questions) != 128:
        print(f"Expected 128 questions, found {len(questions)}.", file=sys.stderr)
        return 2

    write_js(questions, output_path)
    print(f"Wrote {len(questions)} questions to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
