import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StageOps · аренда оборудования",
  description:
    "Оборудование, календарь аренды и оформление заказа. Интерактивный симулятор StageOps.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/stageops-icon.svg",
    shortcut: "/stageops-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
