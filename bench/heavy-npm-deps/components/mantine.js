'use client'
import * as Mantine from '@mantine/core'

export function MantineComponent() {
  return (
    <>
      <h1>Client Component</h1>
      <p>{Object.keys(Mantine)}</p>
    </>
  )
}
