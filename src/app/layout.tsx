import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Barcode Recap",
  description: "Upload a purchase-order PDF to recap barcodes and descriptions into Google Sheets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
