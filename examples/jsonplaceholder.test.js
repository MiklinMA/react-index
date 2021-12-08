import { configureStore } from '@reduxjs/toolkit'
import 'regenerator-runtime/runtime'

import * as jph from './jsonplaceholder'

describe('list', () => {
  const store = configureStore({
    reducer: {
      todos: jph.apiTodo.reducer,
    }
  })

  let len = store.getState().todos.filters._limit

  it('init', async () => {
    await store.dispatch(jph.apiTodo.fetch())
    const {
      view,
      data,
    } = store.getState().todos

    expect(view.length).toBe(len)
    expect(Object.keys(data)).toHaveLength(len)
  })

  const filter = async value => {
    await store.dispatch(jph.apiTodo.filter({completed: value}))
    await store.dispatch(jph.apiTodo.fetch())
  }

  it('complete', async () => {
    await filter(true)

    const {
      view,
      data,
    } = store.getState().todos

    expect(view.filter(item => item.completed === false)).toHaveLength(0)

    expect(Object.keys(data).length).toBeGreaterThan(len)
    len = Object.keys(data).length
  })

  it('incomplete', async () => {
    await filter(false)

    const {
      view,
      data,
    } = store.getState().todos

    expect(view.filter(item => item.completed === true)).toHaveLength(0)

    expect(Object.keys(data).length).toBeGreaterThan(len)
    len = Object.keys(data).length
  })

  it('cache', async () => {
    await filter(null)

    const {
      filters: {
        _limit,
      },
      view,
      data,
    } = store.getState().todos

    expect(view).toHaveLength(_limit)
    expect(Object.keys(data).length).toBe(len)
  })
})
