import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Duplicate — experiment doc header filler",
  description: "Upload experiment docs, generate a personalized copy for everyone on your roster.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
