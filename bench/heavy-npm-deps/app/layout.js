import { Component } from '../components/shared'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Component />
        {children}
      </body>
    </html>
  )
}
