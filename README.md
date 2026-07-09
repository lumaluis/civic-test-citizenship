# U.S. Citizenship Civics Practice

This is a local study app built from the official 2025 USCIS civics PDF.

## How to use it

Open [index.html](/Users/luma/Documents/civic-test-citizenship/index.html) in your browser.

The app is designed for active recall:

- Say the answer out loud before revealing it.
- Use `Mock interview` mode to simulate the test.
- Switch to `65/20 starred` if you qualify for the reduced question set.
- Use `Weak spots` to revisit questions you marked as difficult.

## Regenerate the question bank

If you want to rebuild the question data from a newer PDF, run:

```bash
'/Users/luma/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3' scripts/extract_questions.py "/path/to/uscis.pdf" data/questions.js
```
