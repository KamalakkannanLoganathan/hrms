export const metadata = {
  title: "Eagle RCM HRMS",
  description: "Employee self service, attendance, leave, payroll, and payslip portal.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
