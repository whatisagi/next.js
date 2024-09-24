'use client'
import * as Lodash from 'lodash-es'

export function LodashComponent() {
  return (
    <>
      <h1>Client Component</h1>
      <p>{Object.keys(Lodash)}</p>
    </>
  )
}
