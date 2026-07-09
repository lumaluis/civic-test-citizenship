import "./globals.css";

export const metadata = {
  title: "U.S. Citizenship Civics Practice",
  description:
    "Practice the official 2025 USCIS civics questions with flashcards, mock interviews, and focused review.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
