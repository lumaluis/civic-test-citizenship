# U.S. Citizenship Civics Practice

This project is now a Next.js App Router app built from the official 2025 USCIS civics PDF.

## Run it locally

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open `http://localhost:3000`.

## Study workflow

- Say the answer out loud before revealing it.
- Use `Mock interview` mode to simulate the USCIS oral test.
- Switch to `65/20 starred` if you qualify for the reduced question set.
- Use `Weak spots` to revisit questions you marked as difficult.

## Regenerate the question bank

If you want to rebuild the question data from a newer PDF, run:

```bash
'/Users/luma/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3' scripts/extract_questions.py "/path/to/uscis.pdf" src/data/questions.js
```
